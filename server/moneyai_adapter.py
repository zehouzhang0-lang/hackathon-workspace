"""Server-owned MoneyAI project adapter.

The browser never chooses ``agentDir`` or a MoneyAI session. Model calls are
off by default; memory calls require an explicit server-side enable flag and
are acknowledged only after an exact active-record readback.
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from moneyai_contract import (
    CONTRACT_VERSION,
    canonical_json,
    logical_request_hash,
    response_identity,
    validate_envelope,
)


MAX_PROVIDER_RESPONSE = 1024 * 1024
MEMORY_MARKER = "LUYADECISIONV1"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class TransportFailure(RuntimeError):
    def __init__(self, code, sent=None):
        super().__init__(code)
        self.code = code
        self.sent = sent


class MoneyAIAdapter:
    def __init__(
        self,
        base_url: str | None = None,
        project_dir: str | None = None,
        *,
        analysis_enabled: bool = False,
        extraction_enabled: bool = False,
        history_enabled: bool = False,
        history_read_verified: bool = False,
        model_timeout: float = 45.0,
    ):
        self.base_url = self.validate_base_url(base_url) if base_url else None
        self.project_dir = self.validate_project_dir(project_dir) if project_dir else None
        self.analysis_enabled = analysis_enabled is True
        self.extraction_enabled = extraction_enabled is True
        self.history_enabled = history_enabled is True
        self.history_read_verified = history_read_verified is True
        self.model_timeout = max(5.0, min(float(model_timeout), 120.0))
        self._condition = threading.Condition()
        self._operations = {}
        self._model_lock = threading.Lock()

    @staticmethod
    def validate_base_url(value: str) -> str:
        parsed = urlsplit(value)
        if (
            parsed.scheme != "http"
            or parsed.hostname not in {"127.0.0.1", "::1"}
            or parsed.username
            or parsed.password
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
            or not parsed.port
        ):
            raise ValueError("MoneyAI地址必须是显式指定的本机HTTP服务，不能包含凭据或其他路径。")
        return value.rstrip("/")

    @staticmethod
    def validate_project_dir(value: str) -> str:
        if not isinstance(value, str) or not value or "\x00" in value:
            raise ValueError("MoneyAI项目空间必须由服务端指定。")
        path = Path(value)
        if not path.is_absolute():
            raise ValueError("MoneyAI项目空间必须使用绝对路径。")
        resolved = path.resolve()
        if not resolved.is_dir():
            raise ValueError("MoneyAI项目空间不存在。")
        return str(resolved)

    def _json_request(self, method, path, payload=None, *, timeout=5.0):
        if not self.base_url:
            raise TransportFailure("moneyai_not_configured", False)
        data = None
        headers = {"Accept": "application/json"}
        if payload is not None:
            data = canonical_json(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = Request(self.base_url + path, data=data, headers=headers, method=method)
        try:
            response = build_opener(NoRedirect).open(request, timeout=timeout)
        except HTTPError as error:
            response = error
        except (URLError, TimeoutError, OSError) as error:
            raise TransportFailure("moneyai_transport_failed", None) from error
        try:
            body = response.read(MAX_PROVIDER_RESPONSE + 1)
            if len(body) > MAX_PROVIDER_RESPONSE:
                raise TransportFailure("moneyai_response_too_large", True)
            try:
                result = json.loads(body.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeError) as error:
                raise TransportFailure("moneyai_invalid_response", True) from error
            if not isinstance(result, dict):
                raise TransportFailure("moneyai_invalid_response", True)
            return response.status, result
        finally:
            response.close()

    def _healthy(self):
        try:
            status, payload = self._json_request("GET", "/health", timeout=2.0)
            healthy = payload.get("status") == "ok" or payload.get("ok") is True
            return status == 200 and healthy
        except TransportFailure:
            return False

    def status(self) -> dict:
        configured = self.base_url is not None
        project_configured = self.project_dir is not None
        reachable = self._healthy() if configured else False
        ready_base = configured and project_configured and reachable
        analysis_ready = ready_base and self.analysis_enabled
        extraction_ready = ready_base and self.extraction_enabled
        history_write_ready = ready_base and self.history_enabled
        history_read_ready = ready_base and self.history_read_verified
        if not configured:
            reason = "尚未指定当前MoneyAI本机服务；不能据此判断软件未安装。"
        elif not project_configured:
            reason = "尚未由服务端指定路芽项目专用MoneyAI空间。"
        elif not reachable:
            reason = "当前指定的MoneyAI项目服务未通过健康检查。"
        elif not (analysis_ready or extraction_ready or history_write_ready or history_read_ready):
            reason = "项目服务可达，但模型与历史能力尚未通过独立验证。"
        else:
            reason = "仅已启用并验证列出的项目能力；本机Agent仍可能调用其当前模型provider。"
        return {
            "provider": "moneyai",
            "contractVersion": CONTRACT_VERSION,
            "configured": configured,
            "serviceReachable": reachable,
            "projectSpaceConfigured": project_configured,
            "analysisReady": analysis_ready,
            "extractionReady": extraction_ready,
            "historyWriteReady": history_write_ready,
            "historyReadVerified": history_read_ready,
            "capabilities": {
                "analysis": analysis_ready,
                "extraction": extraction_ready,
                "decisionWrite": history_write_ready,
                "historyRead": history_read_ready,
            },
            "reason": reason,
        }

    @staticmethod
    def _outcome(ok, sent, **fields):
        return {"ok": ok, "sentToMoneyAI": sent, **fields}

    def _response(self, envelope, status, outcome):
        return status, {**response_identity(envelope), **outcome}

    def business_request(self, operation: str, envelope: dict) -> tuple[int, dict]:
        validate_envelope(envelope, operation)
        request_hash = logical_request_hash(envelope)
        operation_id = envelope["operationId"]
        with self._condition:
            existing = self._operations.get(operation_id)
            if existing and existing["hash"] != request_hash:
                return self._response(envelope, 409, self._outcome(
                    False, False, code="idempotency_mismatch",
                    message="同一operationId不能对应不同业务正文。",
                ))
            if existing:
                deadline = time.monotonic() + 15.0
                while existing.get("inflight") and time.monotonic() < deadline:
                    self._condition.wait(deadline - time.monotonic())
                if existing.get("inflight"):
                    return self._response(envelope, 409, self._outcome(
                        False, None, code="operation_in_progress", message="同一操作仍在处理中。"
                    ))
                return self._response(envelope, existing["status"], existing["outcome"])
            self._operations[operation_id] = {"hash": request_hash, "inflight": True}
        try:
            handlers = {
                "intake.extract": self._intake_extract,
                "analysis.run": self._analysis_run,
                "decision.write": self._decision_write,
                "history.read": self._history_read,
            }
            status, outcome = handlers[operation](envelope, request_hash)
        except Exception:
            status, outcome = 502, self._outcome(
                False, None, code="moneyai_adapter_failed", message="MoneyAI项目适配器未取得可核对回执。"
            )
        with self._condition:
            self._operations[operation_id] = {
                "hash": request_hash, "inflight": False, "status": status, "outcome": outcome,
            }
            self._condition.notify_all()
        return self._response(envelope, status, outcome)

    @staticmethod
    def _lookup_token(operation_id):
        return "luyaop" + hashlib.sha256(operation_id.encode("utf-8")).hexdigest()

    @staticmethod
    def _parse_storage_item(item):
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not isinstance(item.get("content"), str):
            return None
        try:
            stored = json.loads(item["content"])
        except json.JSONDecodeError:
            return None
        required = {"marker", "kind", "contractVersion", "operationId", "lookupToken", "requestHash", "scope", "record"}
        if (
            not isinstance(stored, dict)
            or set(stored) != required
            or stored["marker"] != MEMORY_MARKER
            or stored["kind"] != "decision.record.v1"
            or stored["contractVersion"] != CONTRACT_VERSION
        ):
            return None
        return stored

    def _memory_search(self, query, limit=200):
        status, payload = self._json_request("POST", "/api/memory/search", {
            "agentDir": self.project_dir, "query": query, "mode": "fts", "limit": limit,
        })
        if status != 200 or payload.get("success") is not True or not isinstance(payload.get("items"), list):
            raise TransportFailure("moneyai_history_search_failed", True)
        return payload["items"]

    def _active_records(self, operation_id):
        lookup = self._lookup_token(operation_id)
        matches = []
        for item in self._memory_search(lookup):
            stored = self._parse_storage_item(item)
            if stored and stored["operationId"] == operation_id and stored["lookupToken"] == lookup:
                matches.append((item, stored))
        return matches

    def _memory_read(self, ids):
        status, payload = self._json_request("POST", "/api/memory/items-by-ids", {
            "agentDir": self.project_dir, "ids": ids,
        })
        if status != 200 or payload.get("success") is not True or not isinstance(payload.get("items"), list):
            raise TransportFailure("moneyai_history_read_failed", True)
        return payload["items"]

    @staticmethod
    def _receipt(item, stored):
        content_hash = "sha256:" + hashlib.sha256(item["content"].encode("utf-8")).hexdigest()
        return {
            "recordKey": "moneyai:" + item["id"],
            "recordId": item["id"],
            "providerRecordId": item["id"],
            "operationId": stored["operationId"],
            "contentHash": content_hash,
            "writtenAt": item.get("created_at") or item.get("date"),
            "readBackVerified": True,
        }

    def _verify_unique_record(self, operation_id, expected_id=None):
        active = self._active_records(operation_id)
        if len(active) > 1:
            raise TransportFailure("moneyai_duplicate_conflict", True)
        if len(active) != 1 or (expected_id is not None and active[0][0]["id"] != expected_id):
            raise TransportFailure("moneyai_history_readback_failed", True)
        item, stored = active[0]
        exact = self._memory_read([item["id"]])
        exact_matches = [candidate for candidate in exact if candidate.get("id") == item["id"]]
        if len(exact_matches) != 1 or exact_matches[0].get("content") != item.get("content"):
            raise TransportFailure("moneyai_history_readback_failed", True)
        return exact_matches[0], stored

    def _decision_write(self, envelope, request_hash):
        if not (self.base_url and self.project_dir and self.history_enabled):
            return 409, self._outcome(
                False, False, code="moneyai_history_unavailable",
                message="路芽项目历史写入尚未由服务端启用。",
            )
        operation_id = envelope["operationId"]
        try:
            active = self._active_records(operation_id)
        except TransportFailure:
            return 502, self._outcome(False, False, code="history_preflight_failed", message="写入前防重检查失败。")
        if len(active) > 1:
            return 409, self._outcome(False, False, code="duplicate_conflict", message="同一操作存在多条活动记录，已停止写入。")
        if len(active) == 1:
            item, stored = active[0]
            if stored["requestHash"] != request_hash:
                return 409, self._outcome(False, False, code="idempotency_mismatch", message="MoneyAI中同一operationId正文不一致。")
            try:
                item, stored = self._verify_unique_record(operation_id, item["id"])
            except TransportFailure as error:
                return 502, self._outcome(False, error.sent, code=error.code, message="既有记录未通过唯一读回。")
            return 200, self._outcome(True, True, result={"writeReceipt": self._receipt(item, stored)})
        lookup = self._lookup_token(operation_id)
        stored = {
            "marker": MEMORY_MARKER,
            "kind": "decision.record.v1",
            "contractVersion": CONTRACT_VERSION,
            "operationId": operation_id,
            "lookupToken": lookup,
            "requestHash": request_hash,
            "scope": envelope["scope"],
            "record": envelope["payload"]["record"],
        }
        content = canonical_json(stored)
        try:
            status, payload = self._json_request("POST", "/api/memory/item", {
                "action": "add",
                "agentDir": self.project_dir,
                "category": "luya_" + lookup,
                "content": content,
                "importance": "medium",
                # MoneyAI 8.0.0-lite expands an array-valued tags binding; omit it.
            }, timeout=10.0)
        except TransportFailure as error:
            return 502, self._outcome(False, error.sent, code=error.code, message="MoneyAI写入回执不确定。")
        if status != 200 or payload.get("success") is not True or not isinstance(payload.get("items"), list):
            return 502, self._outcome(False, True, code="moneyai_history_write_failed", message="MoneyAI拒绝了项目历史写入。")
        candidates = [item for item in payload["items"] if item.get("content") == content and isinstance(item.get("id"), str)]
        if len(candidates) != 1:
            return 502, self._outcome(False, True, code="moneyai_history_write_receipt_invalid", message="MoneyAI未返回唯一写入记录。")
        try:
            item, verified = self._verify_unique_record(operation_id, candidates[0]["id"])
        except TransportFailure as error:
            return 502, self._outcome(False, error.sent, code=error.code, message="写入后未取得唯一精确读回。")
        return 200, self._outcome(True, True, result={"writeReceipt": self._receipt(item, verified)})

    @staticmethod
    def _public_record(item, stored):
        return {
            "recordKey": "moneyai:" + item["id"],
            "providerRecordId": item["id"],
            "operationId": stored["operationId"],
            "scope": stored["scope"],
            "record": stored["record"],
            "writtenAt": item.get("created_at") or item.get("date"),
            "contentHash": "sha256:" + hashlib.sha256(item["content"].encode("utf-8")).hexdigest(),
        }

    def _history_read(self, envelope, _request_hash):
        if not (self.base_url and self.project_dir and self.history_read_verified):
            return 409, self._outcome(False, False, code="moneyai_history_unavailable", message="路芽项目历史读回尚未验证。")
        query = envelope["payload"]["query"]
        limit = query.get("limit", 20)
        cursor = query.get("cursor")
        record_ids = query.get("recordIds", [])
        operation_ids = set(query.get("operationIds", []))
        round_ids = set(query.get("roundIds", []))
        try:
            if record_ids:
                raw_items = self._memory_read(record_ids)
                by_id = {item.get("id"): item for item in raw_items}
                if set(by_id) != set(record_ids):
                    return 404, self._outcome(False, True, code="history_record_not_found", message="指定记录不存在于项目空间。")
                candidates = []
                for record_id in record_ids:
                    item = by_id[record_id]
                    stored = self._parse_storage_item(item)
                    if not stored:
                        return 404, self._outcome(False, True, code="history_record_not_found", message="指定记录不属于路芽决策历史。")
                    if operation_ids and stored["operationId"] not in operation_ids:
                        return 404, self._outcome(False, True, code="history_record_not_found", message="指定记录不符合操作范围。")
                    if round_ids and stored["scope"].get("roundId") not in round_ids:
                        return 404, self._outcome(False, True, code="history_record_not_found", message="指定记录不符合轮次范围。")
                    active = self._active_records(stored["operationId"])
                    if len(active) != 1 or active[0][0].get("id") != record_id:
                        return 409, self._outcome(False, True, code="history_record_inactive", message="指定记录不是唯一活动记录。")
                    candidates.append((item, stored))
            else:
                candidates = []
                seen = set()
                for item in self._memory_search(MEMORY_MARKER, 200):
                    stored = self._parse_storage_item(item)
                    if (stored and item.get("id") not in seen
                        and (not operation_ids or stored["operationId"] in operation_ids)
                        and (not round_ids or stored["scope"].get("roundId") in round_ids)):
                        seen.add(item["id"])
                        candidates.append((item, stored))
                candidates.sort(key=lambda pair: (pair[0].get("created_at") or "", pair[0]["id"]), reverse=True)
                if cursor is not None:
                    positions = [index for index, pair in enumerate(candidates) if pair[0]["id"] == cursor]
                    if not positions:
                        return 400, self._outcome(False, True, code="history_cursor_invalid", message="历史游标已失效。")
                    candidates = candidates[positions[0] + 1:]
                candidates = candidates[:limit]
        except TransportFailure as error:
            return 502, self._outcome(False, error.sent, code=error.code, message="MoneyAI历史读回失败。")
        records = [self._public_record(item, stored) for item, stored in candidates]
        next_cursor = candidates[-1][0]["id"] if len(candidates) == limit else None
        return 200, self._outcome(True, True, result={
            "records": records,
            "readReceipt": {
                "provider": "moneyai",
                "projectScoped": True,
                "count": len(records),
                "nextCursor": next_cursor,
                "readAt": datetime.now(timezone.utc).isoformat(),
            },
        })

    @staticmethod
    def _extract_json_text(value):
        if not isinstance(value, str):
            raise ValueError
        text = value.strip()
        if text.startswith("```"):
            first_newline = text.find("\n")
            last_fence = text.rfind("```")
            if first_newline < 0 or last_fence <= first_newline:
                raise ValueError
            text = text[first_newline + 1:last_fence].strip()
        result = json.loads(text)
        if not isinstance(result, dict):
            raise ValueError
        return result

    def _run_model(self, envelope, result_fields):
        operation = envelope["operation"]
        operation_instruction = ""
        if operation == "analysis.run":
            operation_instruction = (
                "本次result必须精确为analysis一个字段。analysis只需返回适合不同模型稳定生成的小型建议结构："
                "mode固定real_model；status只能是ready、limited或insufficient；summary为不超过2000字的总结；"
                "limitations为最多20条、每条不超过500字的字符串；paths为1至2条，"
                "每条精确只有title和action两个非空字符串。只依据payload中的focus、facts、constraints和unknowns；"
                "不得声称根因已确认，不得编造缺失数据、概率、收入或效果，不得输出内部状态树、来源原件或额外字段。"
            )
        prompt = (
            "你是路芽项目的受限JSON处理器。禁止调用工具、文件、网络或个人历史；只使用下列获准摘要。"
            "只返回一个JSON对象，精确字段为contractVersion、operation、operationId、result。"
            "必须原样回显身份；不得把未知补成0或事实。" + operation_instruction + "请求：" + canonical_json({
                "contractVersion": CONTRACT_VERSION,
                "operation": operation,
                "operationId": envelope["operationId"],
                "scope": envelope["scope"],
                "payload": envelope["payload"],
            })
        )
        with self._model_lock:
            try:
                _, before = self._json_request("GET", "/api/session-latest-result", timeout=3.0)
            except TransportFailure as error:
                return 502, self._outcome(False, False, code=error.code, message="MoneyAI模型会话预检失败，未发送正文。")
            try:
                status, queued = self._json_request("POST", "/chat/send", {
                    "text": prompt, "images": [], "permissionMode": "plan",
                }, timeout=10.0)
            except TransportFailure as error:
                return 502, self._outcome(False, error.sent, code=error.code, message="MoneyAI模型请求未取得回执。")
            if status != 200 or queued.get("success") is not True:
                return 502, self._outcome(False, True, code="moneyai_model_rejected", message="MoneyAI未接受本次模型请求。")
            baseline = before.get("latestResult")
            deadline = time.monotonic() + self.model_timeout
            latest = None
            while time.monotonic() < deadline:
                time.sleep(0.2)
                try:
                    _, candidate = self._json_request("GET", "/api/session-latest-result", timeout=3.0)
                except TransportFailure:
                    continue
                value = candidate.get("latestResult")
                if isinstance(value, str) and value and value != baseline:
                    latest = value
                    break
            if latest is None:
                return 504, self._outcome(False, True, code="moneyai_model_timeout", message="MoneyAI已接收请求但未在时限内返回结果。")
            try:
                decoded = self._extract_json_text(latest)
                if set(decoded) != {"contractVersion", "operation", "operationId", "result"}:
                    raise ValueError
                if (
                    decoded["contractVersion"] != CONTRACT_VERSION
                    or decoded["operation"] != operation
                    or decoded["operationId"] != envelope["operationId"]
                    or not isinstance(decoded["result"], dict)
                    or set(decoded["result"]) != result_fields
                ):
                    raise ValueError
                if len(canonical_json(decoded["result"]).encode("utf-8")) > MAX_PROVIDER_RESPONSE:
                    raise ValueError
            except (ValueError, TypeError, json.JSONDecodeError):
                return 502, self._outcome(False, True, code="moneyai_model_schema_invalid", message="MoneyAI结果未通过身份与结构校验。")
            return 200, self._outcome(True, True, result=decoded["result"])

    def _analysis_run(self, envelope, _request_hash):
        if not (self.base_url and self.project_dir and self.analysis_enabled):
            return 409, self._outcome(False, False, code="moneyai_analysis_unavailable", message="MoneyAI真实分析尚未通过模型登录与结构验证。")
        status, outcome = self._run_model(envelope, {"analysis"})
        if status == 200:
            analysis = outcome["result"].get("analysis")
            paths = analysis.get("paths") if isinstance(analysis, dict) else None
            limitations = analysis.get("limitations") if isinstance(analysis, dict) else None
            if (
                not isinstance(analysis, dict)
                or analysis.get("mode") != "real_model"
                or analysis.get("status") not in {"ready", "limited", "insufficient"}
                or not isinstance(analysis.get("summary"), str)
                or len(analysis["summary"]) > 2000
                or not isinstance(paths, list)
                or not 1 <= len(paths) <= 2
                or any(
                    not isinstance(path, dict)
                    or not isinstance(path.get("title"), str)
                    or not path["title"].strip()
                    or len(path["title"]) > 160
                    or not isinstance(path.get("action"), str)
                    or not path["action"].strip()
                    or len(path["action"]) > 1200
                    for path in paths
                )
                or not isinstance(limitations, list)
                or len(limitations) > 20
                or any(not isinstance(item, str) or not item.strip() or len(item) > 500 for item in limitations)
            ):
                return 502, self._outcome(False, True, code="moneyai_model_schema_invalid", message="真实分析缺少严格real_model标识。")
        return status, outcome

    def _intake_extract(self, envelope, _request_hash):
        if not (self.base_url and self.project_dir and self.extraction_enabled):
            return 409, self._outcome(False, False, code="intake_unavailable", message="MoneyAI资料提取尚未通过模型登录与结构验证。", editable=True)
        status, outcome = self._run_model(envelope, {"draft", "sourceBindings"})
        if status == 200:
            result = outcome["result"]
            if not isinstance(result.get("draft"), dict) or not isinstance(result.get("sourceBindings"), list):
                return 502, self._outcome(False, True, code="moneyai_model_schema_invalid", message="资料提取结果未通过草稿结构校验。", editable=True)
            outcome["editable"] = True
        return status, outcome
