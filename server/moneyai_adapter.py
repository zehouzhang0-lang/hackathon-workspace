"""Narrow local MoneyAI boundary. Health is real; unconfigured business calls fail closed."""
from __future__ import annotations

import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class MoneyAIAdapter:
    def __init__(self, base_url: str | None = None):
        self.base_url = self.validate_base_url(base_url) if base_url else None

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

    def status(self) -> dict:
        result = {
            "provider": "moneyai",
            "configured": self.base_url is not None,
            "serviceReachable": False,
            "analysisReady": False,
            "historyWriteReady": False,
            "historyReadVerified": False,
            "reason": "尚未配置本项目专用会话、模型调用范围及历史映射。",
        }
        if not self.base_url:
            result["reason"] = "尚未指定当前MoneyAI本机服务；不能据此判断软件未安装。"
            return result
        try:
            request = Request(self.base_url + "/health", headers={"Accept": "application/json"})
            with build_opener(NoRedirect).open(request, timeout=2) as response:
                body = response.read(4096).decode("utf-8")
                try:
                    payload = json.loads(body)
                except json.JSONDecodeError:
                    payload = body.strip()
                healthy = payload == "ok" or (
                    isinstance(payload, dict)
                    and (payload.get("status") == "ok" or payload.get("ok") is True)
                )
                result["serviceReachable"] = response.status == 200 and healthy
        except (HTTPError, URLError, TimeoutError, OSError, UnicodeError):
            result["reason"] = "当前指定的MoneyAI服务未通过健康检查；端口可能已经变化。"
        return result

    def business_request(self, operation: str, payload: dict) -> tuple[int, dict]:
        # Never send an analysis to whichever personal conversation happens to be active.
        # /api/memory/items is not a read-only probe in the installed app.
        return 409, {
            "ok": False,
            "code": "moneyai_project_session_required",
            "message": "MoneyAI本机服务与本项目业务通路分开；专用会话和模型范围确认后才能发送资料或写入决策历史。",
            "operation": operation,
            "sentToMoneyAI": False,
        }
