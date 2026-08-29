"""Minimal MoneyAI contract, fail-closed, and idempotency checks."""
import http.client
import io
import json
import tempfile
import threading
import unittest
from email.message import Message
from functools import partial
from http.server import ThreadingHTTPServer
from unittest.mock import MagicMock, patch

from app import Handler, MAX_DISCARD_BYTES
from moneyai_adapter import MoneyAIAdapter
from moneyai_contract import logical_request_hash


def envelope(operation, *, operation_id="operation_1", attempt_id="attempt_1", payload=None):
    scope = {
        "sessionId": "session_1",
        "roundId": "round_1",
        "inputVersion": 1,
        "analysisId": None,
        "pathId": None,
        "artifact": None,
        "feedback": None,
        "inputFingerprint": "sha256:" + "a" * 64,
    }
    payloads = {
        "intake.extract": {
            "version": "intake.extract.v1", "transcript": "", "description": "synthetic",
            "sources": ["manual"], "materials": [],
        },
        "analysis.run": {
            "version": "analysis.request.v1", "focus": "synthetic", "facts": [],
            "constraints": [], "unknowns": [],
        },
        "decision.write": {"version": "decision.record.v1", "record": {"synthetic": True}},
        "history.read": {"version": "history.query.v1", "query": {"limit": 10, "cursor": None, "recordIds": []}},
    }
    if operation == "decision.write":
        scope["analysisId"] = "analysis_1"
        scope["pathId"] = "path_1"
    return {
        "contractVersion": "luya.moneyai.v1",
        "operation": operation,
        "operationId": operation_id,
        "attemptId": attempt_id,
        "scope": scope,
        "consent": {"granted": True, "sendScope": ["confirmed_summary"], "dataClasses": ["synthetic"]},
        "payload": payload if payload is not None else payloads[operation],
    }


class AdapterTests(unittest.TestCase):
    def test_only_explicit_loopback_and_server_project_are_allowed(self):
        self.assertEqual(MoneyAIAdapter.validate_base_url("http://127.0.0.1:31416/"), "http://127.0.0.1:31416")
        for value in ["https://127.0.0.1:31416", "http://localhost:31416", "http://user:pass@127.0.0.1:31416", "http://127.0.0.1:31416/api"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                MoneyAIAdapter.validate_base_url(value)
        with self.assertRaises(ValueError):
            MoneyAIAdapter(None, "relative/project")

    def test_health_alone_does_not_enable_business(self):
        response = MagicMock()
        response.status = 200
        response.read.return_value = b'{"status":"ok"}'
        response.__enter__.return_value = response
        with patch("moneyai_adapter.build_opener") as opener:
            opener.return_value.open.return_value = response
            result = MoneyAIAdapter("http://127.0.0.1:31416").status()
        self.assertTrue(result["serviceReachable"])
        self.assertFalse(result["projectSpaceConfigured"])
        self.assertFalse(result["analysisReady"])
        self.assertFalse(result["historyWriteReady"])

    def test_valid_unconfigured_calls_fail_before_provider_and_keep_identity(self):
        adapter = MoneyAIAdapter()
        with patch("moneyai_adapter.build_opener") as opener:
            for operation in ["intake.extract", "analysis.run", "decision.write", "history.read"]:
                request = envelope(operation, operation_id="op_" + operation.replace(".", "_"))
                status, result = adapter.business_request(operation, request)
                self.assertEqual(status, 409)
                self.assertFalse(result["sentToMoneyAI"])
                self.assertEqual(result["operationId"], request["operationId"])
                self.assertEqual(result["attemptId"], request["attemptId"])
            opener.assert_not_called()

    def test_decision_write_reads_back_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as project:
            adapter = MoneyAIAdapter("http://127.0.0.1:31416", project, history_enabled=True)
            request = envelope("decision.write", operation_id="decision_fastpath_1")
            state = {"item": None, "writes": 0}

            def fake_request(method, path, payload=None, timeout=5.0):
                if path == "/api/memory/search":
                    return 200, {"success": True, "items": [] if state["item"] is None else [state["item"]]}
                if path == "/api/memory/item":
                    state["writes"] += 1
                    self.assertNotIn("tags", payload)
                    state["item"] = {
                        "id": "mem_project_1", "content": payload["content"],
                        "created_at": "2026-08-29 11:00:00",
                    }
                    return 200, {"success": True, "items": [state["item"]]}
                if path == "/api/memory/items-by-ids":
                    return 200, {"success": True, "items": [state["item"]]}
                raise AssertionError(path)

            with patch.object(adapter, "_json_request", side_effect=fake_request):
                status, first = adapter.business_request("decision.write", request)
                retry = {**request, "attemptId": "attempt_2"}
                retry_status, second = adapter.business_request("decision.write", retry)
                changed = json.loads(json.dumps(retry))
                changed["payload"]["record"]["synthetic"] = False
                mismatch_status, mismatch = adapter.business_request("decision.write", changed)
            self.assertEqual((status, retry_status), (200, 200))
            self.assertEqual(state["writes"], 1)
            self.assertTrue(first["result"]["writeReceipt"]["readBackVerified"])
            self.assertEqual(second["attemptId"], "attempt_2")
            self.assertEqual(mismatch_status, 409)
            self.assertEqual(mismatch["code"], "idempotency_mismatch")

    def test_duplicate_active_records_fail_closed(self):
        with tempfile.TemporaryDirectory() as project:
            adapter = MoneyAIAdapter("http://127.0.0.1:31416", project, history_enabled=True)
            request = envelope("decision.write", operation_id="duplicate_1")
            stored = {
                "marker": "LUYADECISIONV1", "kind": "decision.record.v1",
                "contractVersion": "luya.moneyai.v1", "operationId": "duplicate_1",
                "lookupToken": adapter._lookup_token("duplicate_1"),
                "requestHash": logical_request_hash(request), "scope": request["scope"],
                "record": request["payload"]["record"],
            }
            with patch.object(adapter, "_active_records", return_value=[({"id": "one"}, stored), ({"id": "two"}, stored)]), patch.object(adapter, "_json_request") as provider:
                status, result = adapter.business_request("decision.write", request)
            self.assertEqual(status, 409)
            self.assertEqual(result["code"], "duplicate_conflict")
            provider.assert_not_called()


class LocalHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, adapter=MoneyAIAdapter()))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = "http://127.0.0.1:" + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def request(self, path, method="GET", body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def post(self, path, value):
        return self.request(path, "POST", json.dumps(value).encode("utf-8"), {
            "Origin": self.origin, "Content-Type": "application/json",
        })

    def test_static_routes_and_status_remain_local(self):
        for path in ["/01-intake.html", "/02-decisions.html", "/03-action.html", "/shared/state.js"]:
            status, headers, body = self.request(path)
            self.assertEqual(status, 200, path)
            self.assertGreater(len(body), 0)
            self.assertIn("connect-src 'self'", headers["Content-Security-Policy"])
        status = json.loads(self.request("/api/moneyai/status")[2])
        self.assertEqual(status["contractVersion"], "luya.moneyai.v1")
        self.assertFalse(status["analysisReady"])
        self.assertFalse(status["historyReadVerified"])
        self.assertNotIn("projectDir", status)

    def test_contract_routes_fail_closed_without_echoing_business_text(self):
        routes = {
            "/api/intake/extract": "intake.extract",
            "/api/moneyai/analysis": "analysis.run",
            "/api/moneyai/decisions": "decision.write",
            "/api/moneyai/history/read": "history.read",
        }
        for path, operation in routes.items():
            request = envelope(operation, operation_id="http_" + operation.replace(".", "_"))
            status, _, body = self.post(path, request)
            result = json.loads(body)
            self.assertEqual(status, 409)
            self.assertFalse(result["sentToMoneyAI"])
            self.assertEqual(result["operation"], operation)
            self.assertNotIn(b"synthetic", body)

    def test_invalid_contract_origin_and_body_are_rejected(self):
        request = envelope("analysis.run")
        request["browserAgentDir"] = "forbidden"
        status, _, body = self.post("/api/moneyai/analysis", request)
        self.assertEqual((status, json.loads(body)["code"]), (400, "invalid_contract"))
        headers = {"Origin": "https://example.com", "Content-Type": "application/json"}
        self.assertEqual(self.request("/api/moneyai/analysis", "POST", "{}", headers)[0], 403)
        headers["Origin"] = self.origin
        for raw in ["[]", "not-json", '{"x":NaN}', '{"x":1,"x":2}', "x" * (256 * 1024 + 1)]:
            status, _, body = self.request("/api/moneyai/analysis", "POST", raw, headers)
            self.assertEqual((status, json.loads(body)["code"]), (400, "invalid_payload"))

    def test_host_and_private_routes_are_rejected(self):
        for path in ["/AGENTS.md", "/../AGENTS.md", "/.local-inbox/", "/api/memory/items", "/server/app.py"]:
            self.assertEqual(self.request(path)[0], 404, path)
        headers = {"Host": "localhost:" + str(self.server.server_port)}
        status, _, body = self.request("/api/moneyai/status", headers=headers)
        self.assertEqual((status, json.loads(body)["code"]), (403, "host_not_allowed"))

    def test_rejected_body_discard_is_bounded(self):
        handler = Handler.__new__(Handler)
        handler.command = "POST"
        handler._body_consumed = False
        handler.headers = Message()
        handler.headers["Content-Length"] = str(10 ** 12)
        handler.rfile = io.BytesIO(b"x" * (MAX_DISCARD_BYTES + 1024))
        handler.connection = MagicMock()
        handler.connection.gettimeout.return_value = 3
        with patch("app.monotonic", return_value=0):
            handler.discard_request_body()
        self.assertEqual(handler.rfile.tell(), MAX_DISCARD_BYTES)
        self.assertTrue(handler.close_connection)


if __name__ == "__main__":
    unittest.main()
