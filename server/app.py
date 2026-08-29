"""One local origin for the native Demo, its user-configured AI boundary and the MoneyAI agent path.

The user-configured external path is an OpenAI-compatible chat endpoint that the
user saves explicitly (base URL + API key + model). The key stays in this
directory, is never echoed back, and nothing is sent anywhere while unconfigured.
The MoneyAI agent path (teammate batch) runs through the frozen contract
envelopes of moneyai_contract/moneyai_adapter and only reaches the local
MoneyAI instance's explicit loopback address.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from time import monotonic
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from moneyai_adapter import MoneyAIAdapter
from moneyai_contract import ContractError, validate_envelope

DEMO_ROOT = Path(__file__).resolve().parent.parent / "demo"
SETTINGS_PATH = Path(__file__).resolve().parent / "ai-settings.json"
MAX_REQUEST_BYTES = 256 * 1024
# Reject oversized bodies, but discard a bounded amount of in-flight data
# before closing so Windows does not reset an otherwise valid error response.
MAX_DISCARD_BYTES = MAX_REQUEST_BYTES + 64 * 1024
DISCARD_TIMEOUT_SECONDS = 0.5
CHAT_TIMEOUT_SECONDS = 45
MAX_KEY_CHARS = 200
MAX_MODEL_CHARS = 100
MAX_MESSAGES = 20
MAX_MESSAGE_CHARS = 8000
MAX_COMPLETION_CHARS = 64 * 1024
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
PRINTABLE = re.compile(r"[\x21-\x7e]+")
CHAT_FIELDS = {"messages", "temperature", "maxTokens"}
MESSAGE_FIELDS = {"role", "content"}
ROLES = {"system", "user", "assistant"}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def env_flag(name):
    """Read an explicit boolean without silently enabling a capability."""
    value = os.environ.get(name)
    if value is None:
        return False
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off", ""}:
        return False
    raise ValueError(f"{name} must be true/false, 1/0, yes/no, or on/off")


def env_port(name, default):
    value = os.environ.get(name)
    if value is None or not value.strip():
        return default
    try:
        port = int(value)
    except ValueError as error:
        raise ValueError(f"{name} must be an integer port") from error
    if not 1 <= port <= 65535:
        raise ValueError(f"{name} must be between 1 and 65535")
    return port


def unique_json_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def reject_json_constant(value):
    raise ValueError("Non-finite JSON number")


def validate_base_url(value):
    """OpenAI-compatible base URL; http only for explicit loopback test servers."""
    if not isinstance(value, str) or len(value) > 500:
        raise ValueError("AI服务地址必须是http(s) URL。")
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("AI服务地址必须是http(s) URL。")
    if parsed.scheme == "http" and parsed.hostname not in LOOPBACK_HOSTS:
        raise ValueError("http地址只允许本机回环；外部服务请使用https。")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("AI服务地址不能包含凭据、查询或片段。")
    return value.rstrip("/")


def valid_printable(value, pattern, limit, message):
    if not isinstance(value, str) or len(value) > limit or pattern.fullmatch(value) is None:
        raise ValueError(message)


def load_settings():
    """Return validated settings dict or None; a broken file reads as unconfigured."""
    try:
        payload = json.loads(SETTINGS_PATH.read_text("utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(payload, dict) or set(payload) != {"baseUrl", "apiKey", "model"}:
        return None
    try:
        validate_base_url(payload["baseUrl"])
        valid_printable(payload["apiKey"], PRINTABLE, MAX_KEY_CHARS, "API Key 不合法。")
        valid_printable(payload["model"], PRINTABLE, MAX_MODEL_CHARS, "模型名不合法。")
    except ValueError:
        return None
    return payload


def save_settings(payload):
    SETTINGS_PATH.write_text(json.dumps(payload, ensure_ascii=False), "utf-8")


def clear_settings():
    try:
        SETTINGS_PATH.unlink()
    except OSError:
        pass


def public_settings(settings):
    if not settings:
        return {"configured": False, "baseUrl": None, "model": None, "hasKey": False}
    return {"configured": True, "baseUrl": settings["baseUrl"], "model": settings["model"], "hasKey": True}


def validate_chat_payload(payload):
    if not isinstance(payload, dict) or not set(payload) <= CHAT_FIELDS or "messages" not in payload:
        raise ValueError("messages 必填，且只允许 messages/temperature/maxTokens。")
    messages = payload["messages"]
    if not isinstance(messages, list) or not 1 <= len(messages) <= MAX_MESSAGES:
        raise ValueError("messages 须为 1-20 条。")
    for message in messages:
        if not isinstance(message, dict) or set(message) != MESSAGE_FIELDS:
            raise ValueError("每条消息只含 role 与 content。")
        if message["role"] not in ROLES:
            raise ValueError("消息角色不合法。")
        if not isinstance(message["content"], str) or not 1 <= len(message["content"]) <= MAX_MESSAGE_CHARS \
                or "\0" in message["content"]:
            raise ValueError("消息内容须为 1-8000 字符的文本。")
    temperature = payload.get("temperature", 0)
    if isinstance(temperature, bool) or not isinstance(temperature, (int, float)) \
            or not 0 <= float(temperature) <= 2:
        raise ValueError("temperature 须在 0 到 2 之间。")
    max_tokens = payload.get("maxTokens", 2048)
    if not isinstance(max_tokens, int) or isinstance(max_tokens, bool) or not 1 <= max_tokens <= 4096:
        raise ValueError("maxTokens 须为 1-4096 的整数。")
    return messages, float(temperature), max_tokens


def ai_chat(settings, messages, temperature, max_tokens):
    """Return (http_status, result_dict). Never leaks the configured key."""
    body = json.dumps({
        "model": settings["model"], "messages": messages,
        "temperature": temperature, "max_tokens": max_tokens,
    }, ensure_ascii=False).encode("utf-8")
    request = Request(
        settings["baseUrl"] + "/chat/completions", data=body, method="POST",
        headers={
            "Authorization": "Bearer " + settings["apiKey"],
            "Content-Type": "application/json", "Accept": "application/json",
        },
    )
    try:
        with build_opener(NoRedirect).open(request, timeout=CHAT_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read(MAX_COMPLETION_CHARS).decode("utf-8"))
    except HTTPError as error:
        try:
            detail = error.read(2000).decode("utf-8", "replace").strip()[:200]
        except Exception:
            detail = str(getattr(error, "reason", error))[:200]
        return 502, {"ok": False, "code": "ai_request_failed",
                     "message": "AI 服务请求失败（HTTP " + str(error.code) + "：" + detail + "）；未获得可用结果，原文仍在本页。"}
    except (URLError, TimeoutError, OSError, UnicodeError, json.JSONDecodeError) as error:
        detail = str(getattr(error, "reason", error))[:200]
        return 502, {"ok": False, "code": "ai_request_failed",
                     "message": "AI 服务请求失败（" + detail + "）；未获得可用结果，原文仍在本页。"}
    if not isinstance(payload, dict):
        return 502, {"ok": False, "code": "ai_request_failed", "message": "AI 服务返回不是JSON对象。"}
    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        content = None
    if not isinstance(content, str) or not content.strip():
        return 502, {"ok": False, "code": "ai_request_failed", "message": "AI 服务返回缺少文本内容。"}
    return 200, {"ok": True, "content": content}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, adapter=None, **kwargs):
        self.adapter = adapter
        super().__init__(*args, directory=str(DEMO_ROOT), **kwargs)

    def log_message(self, format, *args):
        # Do not write user paths, source text, keys or request bodies to server logs.
        return

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if self.close_connection:
            self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def discard_request_body(self):
        if self.command != "POST" or getattr(self, "_body_consumed", False):
            return
        self._body_consumed = True
        self.close_connection = True
        remaining = MAX_DISCARD_BYTES
        lengths = self.headers.get_all("Content-Length", [])
        if (
            len(lengths) == 1
            and re.fullmatch(r"[0-9]{1,20}", lengths[0])
            and self.headers.get("Transfer-Encoding") is None
        ):
            remaining = min(int(lengths[0]), MAX_DISCARD_BYTES)
        previous_timeout = self.connection.gettimeout()
        deadline = monotonic() + DISCARD_TIMEOUT_SECONDS
        try:
            while remaining:
                wait = deadline - monotonic()
                if wait <= 0:
                    break
                self.connection.settimeout(wait)
                # read1 performs at most one socket read, so the deadline is
                # checked between reads even if a client trickles bytes.
                chunk = self.rfile.read1(min(remaining, 64 * 1024))
                if not chunk:
                    break
                remaining -= len(chunk)
        except OSError:
            # A disconnected/slow rejected client must not extend the budget.
            pass
        finally:
            self.connection.settimeout(previous_timeout)

    def reject_json(self, status, code):
        self.discard_request_body()
        self.send_json(status, {"ok": False, "code": code})

    def list_directory(self, path):
        self.send_error(404)
        return None

    def allowed_host(self):
        expected = "127.0.0.1:" + str(self.server.server_port)
        if self.headers.get_all("Host", []) != [expected]:
            self.reject_json(403, "host_not_allowed")
            return False
        return True

    def read_json_body(self):
        """Return a parsed JSON object or None (error response already sent)."""
        try:
            lengths = self.headers.get_all("Content-Length", [])
            if len(lengths) != 1 or self.headers.get("Transfer-Encoding") is not None:
                raise ValueError
            size = int(lengths[0])
            if not 0 < size <= MAX_REQUEST_BYTES:
                raise ValueError
            body = self.rfile.read(size)
            self._body_consumed = True
            if len(body) != size:
                raise ValueError
            payload = json.loads(
                body.decode("utf-8"),
                object_pairs_hook=unique_json_object,
                parse_constant=reject_json_constant,
            )
            if not isinstance(payload, dict):
                raise ValueError
            return payload
        except (ValueError, UnicodeError, RecursionError):
            self.reject_json(400, "invalid_payload")
            return None

    def do_GET(self):
        if not self.allowed_host():
            return
        path = urlsplit(self.path).path
        if path == "/":
            self.send_response(302)
            self.send_header("Location", "/01-intake.html")
            self.end_headers()
        elif path == "/api/health":
            self.send_json(200, {"ok": True, "contractVersion": "demo.v1", "service": "local-demo-backend"})
        elif path == "/api/ai/settings":
            self.send_json(200, {"ok": True, **public_settings(load_settings())})
        elif path == "/api/moneyai/status":
            self.send_json(200, self.adapter.status())
        elif path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
        else:
            # Static serving is restricted to demo/, never the repository or private inbox.
            super().do_GET()

    def do_POST(self):
        self._body_consumed = False
        if not self.allowed_host():
            return
        path = urlsplit(self.path).path
        operations = {
            "/api/intake/extract": "intake.extract",
            "/api/moneyai/analysis": "analysis.run",
            "/api/moneyai/decisions": "decision.write",
            "/api/moneyai/history/read": "history.read",
        }
        if path not in operations and path not in {"/api/ai/settings", "/api/ai/chat"}:
            self.reject_json(404, "unknown_endpoint")
            return
        expected = "http://127.0.0.1:" + str(self.server.server_port)
        if self.headers.get_all("Origin", []) != [expected]:
            self.reject_json(403, "origin_not_allowed")
            return
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            self.reject_json(415, "json_required")
            return
        payload = self.read_json_body()
        if payload is None:
            return
        if path == "/api/ai/settings":
            self.handle_settings(payload)
        elif path == "/api/ai/chat":
            self.handle_chat(payload)
        else:
            try:
                validate_envelope(payload, operations[path])
            except ContractError:
                self.reject_json(400, "invalid_contract")
                return
            status, result = self.adapter.business_request(operations[path], payload)
            self.send_json(status, result)

    def handle_settings(self, payload):
        if payload == {"clear": True}:
            clear_settings()
            self.send_json(200, {"ok": True, **public_settings(None)})
            return
        if set(payload) - {"baseUrl", "apiKey", "model"} or not {"baseUrl", "model"} <= set(payload):
            self.reject_json(400, "invalid_payload")
            return
        try:
            base_url = validate_base_url(payload["baseUrl"])
            model = payload["model"]
            valid_printable(model, PRINTABLE, MAX_MODEL_CHARS, "模型名不合法。")
            key = payload.get("apiKey")
            existing = load_settings()
            if isinstance(key, str):
                valid_printable(key, PRINTABLE, MAX_KEY_CHARS, "API Key 不合法。")
            elif key is None:
                if not existing:
                    raise ValueError("首次配置必须提供 API Key。")
                key = existing["apiKey"]
            else:
                raise ValueError("API Key 不合法。")
        except ValueError as error:
            self.send_json(400, {"ok": False, "code": "invalid_settings", "message": str(error)})
            return
        save_settings({"baseUrl": base_url, "apiKey": key, "model": model})
        self.send_json(200, {"ok": True, **public_settings(load_settings())})

    def handle_chat(self, payload):
        try:
            messages, temperature, max_tokens = validate_chat_payload(payload)
        except ValueError as error:
            self.send_json(400, {"ok": False, "code": "invalid_payload", "message": str(error)})
            return
        settings = load_settings()
        if not settings:
            self.send_json(409, {"ok": False, "code": "ai_not_configured",
                                 "message": "尚未在「AI 设置」配置 API；未发送任何内容。"})
            return
        status, result = ai_chat(settings, messages, temperature, max_tokens)
        self.send_json(status, result)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=env_port("LUYA_DEMO_PORT", 4188))
    parser.add_argument(
        "--moneyai-url",
        default=os.environ.get("LUYA_MONEYAI_URL"),
        help="本机MoneyAI sidecar地址；默认读取LUYA_MONEYAI_URL，不提交配置或凭据",
    )
    parser.add_argument(
        "--moneyai-project-dir",
        default=os.environ.get("LUYA_MONEYAI_PROJECT_DIR"),
        help="路芽项目专用MoneyAI空间；默认读取LUYA_MONEYAI_PROJECT_DIR，浏览器不能覆盖",
    )
    parser.add_argument(
        "--moneyai-analysis-enabled",
        action=argparse.BooleanOptionalAction,
        default=env_flag("LUYA_MONEYAI_ANALYSIS_ENABLED"),
        help="任一MoneyAI模型Provider完成本机验证后启用",
    )
    parser.add_argument(
        "--moneyai-extraction-enabled",
        action=argparse.BooleanOptionalAction,
        default=env_flag("LUYA_MONEYAI_EXTRACTION_ENABLED"),
        help="任一MoneyAI模型Provider完成本机验证后启用",
    )
    parser.add_argument(
        "--moneyai-history-enabled",
        action=argparse.BooleanOptionalAction,
        default=env_flag("LUYA_MONEYAI_HISTORY_ENABLED"),
        help="项目空间写入完成本机验证后启用",
    )
    parser.add_argument(
        "--moneyai-history-read-verified",
        action=argparse.BooleanOptionalAction,
        default=env_flag("LUYA_MONEYAI_HISTORY_READ_VERIFIED"),
        help="重启读回及空项目隔离完成本机验证后启用",
    )
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    adapter = MoneyAIAdapter(
        args.moneyai_url,
        args.moneyai_project_dir,
        analysis_enabled=args.moneyai_analysis_enabled,
        extraction_enabled=args.moneyai_extraction_enabled,
        history_enabled=args.moneyai_history_enabled,
        history_read_verified=args.moneyai_history_read_verified,
    )
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, adapter=adapter))
    print("Local Demo: http://127.0.0.1:" + str(args.port) + "/01-intake.html", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
