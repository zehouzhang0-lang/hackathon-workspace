"""One local origin for the native Demo and its MoneyAI backend boundary."""
from __future__ import annotations

import argparse
import json
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from time import monotonic
from urllib.parse import urlsplit

from moneyai_adapter import MoneyAIAdapter
from moneyai_contract import ContractError, validate_envelope

DEMO_ROOT = Path(__file__).resolve().parent.parent / "demo"
MAX_REQUEST_BYTES = 256 * 1024
# Reject oversized bodies, but discard a bounded amount of in-flight data
# before closing so Windows does not reset an otherwise valid error response.
MAX_DISCARD_BYTES = MAX_REQUEST_BYTES + 64 * 1024
DISCARD_TIMEOUT_SECONDS = 0.5
MAX_INTAKE_TEXT_CHARS = 20_000
MAX_MATERIAL_TEXT_CHARS = 50_000
MAX_SAFE_VERSION = (1 << 53) - 1
INTAKE_FIELDS = {"version", "roundId", "inputVersion", "transcript", "description", "sources", "materials"}
MATERIAL_FIELDS = {"materialId", "materialVersion", "mime", "text"}
INTAKE_SOURCES = {"voice", "paste", "txt", "csv", "json", "manual"}
TEXT_MIMES = {"text/plain", "text/csv", "application/json"}
IDENTIFIER = re.compile(r"[A-Za-z0-9_-]{1,80}")
NON_TEXT = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\ud800-\udfff]")


def unique_json_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def reject_json_constant(value):
    raise ValueError("Non-finite JSON number")


def valid_identifier(value):
    return isinstance(value, str) and IDENTIFIER.fullmatch(value) is not None


def valid_version(value):
    return type(value) is int and 0 < value <= MAX_SAFE_VERSION


def valid_text(value, limit):
    return isinstance(value, str) and len(value) <= limit and NON_TEXT.search(value) is None


def valid_intake_payload(payload):
    """Accept bounded text only; do not interpret instructions or decode media."""
    if (
        set(payload) != INTAKE_FIELDS
        or payload["version"] != "v0.5-intake-1"
        or not valid_identifier(payload["roundId"])
        or not valid_version(payload["inputVersion"])
        or not valid_text(payload["transcript"], MAX_INTAKE_TEXT_CHARS)
        or not valid_text(payload["description"], MAX_INTAKE_TEXT_CHARS)
    ):
        return False
    sources = payload["sources"]
    if (
        not isinstance(sources, list)
        or len(sources) > len(INTAKE_SOURCES)
        or not all(isinstance(source, str) and source in INTAKE_SOURCES for source in sources)
        or len(set(sources)) != len(sources)
    ):
        return False
    materials = payload["materials"]
    if not isinstance(materials, list) or len(materials) > 6:
        return False
    material_ids = set()
    for material in materials:
        if (
            not isinstance(material, dict)
            or set(material) != MATERIAL_FIELDS
            or not valid_identifier(material["materialId"])
            or material["materialId"] in material_ids
            or not valid_version(material["materialVersion"])
            or not isinstance(material["mime"], str)
            or material["mime"] not in TEXT_MIMES
            or not valid_text(material["text"], MAX_MATERIAL_TEXT_CHARS)
        ):
            return False
        material_ids.add(material["materialId"])
    return True


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, adapter: MoneyAIAdapter, **kwargs):
        self.adapter = adapter
        super().__init__(*args, directory=str(DEMO_ROOT), **kwargs)

    def log_message(self, format, *args):
        # Do not write user paths, source text or request bodies to server logs.
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
        expected = "http://127.0.0.1:" + str(self.server.server_port)
        if self.headers.get_all("Origin", []) != [expected]:
            self.reject_json(403, "origin_not_allowed")
            return
        if path not in operations:
            self.reject_json(404, "unknown_endpoint")
            return
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            self.reject_json(415, "json_required")
            return
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
            validate_envelope(payload, operations[path])
        except ContractError:
            self.reject_json(400, "invalid_contract")
            return
        except (ValueError, UnicodeError, RecursionError):
            self.reject_json(400, "invalid_payload")
            return
        status, result = self.adapter.business_request(operations[path], payload)
        self.send_json(status, result)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4188)
    parser.add_argument("--moneyai-url", help="当前MoneyAI实例的显式本机地址；不提交配置或凭据")
    parser.add_argument("--moneyai-project-dir", help="服务端固定的路芽项目专用MoneyAI空间；浏览器不能覆盖")
    parser.add_argument("--moneyai-analysis-enabled", action="store_true", help="仅在真实模型与结构已验证后启用")
    parser.add_argument("--moneyai-extraction-enabled", action="store_true", help="仅在真实提取与结构已验证后启用")
    parser.add_argument("--moneyai-history-enabled", action="store_true", help="仅在项目写入和精确读回已验证后启用")
    parser.add_argument("--moneyai-history-read-verified", action="store_true", help="仅在重启读回及空项目隔离均验证后启用")
    args = parser.parse_args()
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
