"""Local HTTP boundary tests; no browser, merchant data, or MoneyAI business calls."""
import http.client
import io
import json
import threading
import unittest
from email.message import Message
from functools import partial
from http.server import ThreadingHTTPServer
from unittest.mock import MagicMock, patch

from app import Handler, MAX_DISCARD_BYTES
from moneyai_adapter import MoneyAIAdapter


class AdapterTests(unittest.TestCase):
    def test_only_explicit_loopback_without_credentials_or_paths_is_allowed(self):
        self.assertEqual(MoneyAIAdapter.validate_base_url("http://127.0.0.1:31420/"), "http://127.0.0.1:31420")
        self.assertEqual(MoneyAIAdapter.validate_base_url("http://[::1]:31420"), "http://[::1]:31420")
        for value in ["https://127.0.0.1:31420", "http://localhost:31420", "http://example.com:80", "http://user:pass@127.0.0.1:31420", "http://127.0.0.1:31420/api", "http://127.0.0.1:31420?x=1", "http://127.0.0.1:31420#x", "http://127.0.0.1", "http://127.0.0.1:0"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                MoneyAIAdapter.validate_base_url(value)

    def test_health_does_not_enable_analysis_or_memory(self):
        response = MagicMock()
        response.status = 200
        response.read.return_value = b'{"status":"ok"}'
        response.__enter__.return_value = response
        with patch("moneyai_adapter.build_opener") as opener:
            opener.return_value.open.return_value = response
            result = MoneyAIAdapter("http://127.0.0.1:31420").status()
        self.assertTrue(result["serviceReachable"])
        self.assertFalse(result["analysisReady"])
        self.assertFalse(result["historyWriteReady"])
        self.assertFalse(result["historyReadVerified"])

    def test_unconfigured_status_and_business_never_send(self):
        adapter = MoneyAIAdapter()
        with patch("moneyai_adapter.build_opener") as opener:
            self.assertFalse(adapter.status()["configured"])
            for operation in ["analysis", "decision_write", "history_read"]:
                status, result = adapter.business_request(operation, {"synthetic": "test only"})
                self.assertEqual(status, 409)
                self.assertFalse(result["sentToMoneyAI"])
            opener.assert_not_called()


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

    @staticmethod
    def intake_payload():
        return {
            "version": "v0.5-intake-1",
            "roundId": "synthetic_round",
            "inputVersion": 1,
            "transcript": "synthetic-unshared-voice-text",
            "description": "synthetic-unshared-description",
            "sources": ["voice", "manual"],
            "materials": [],
        }

    def post_intake(self, payload):
        return self.request(
            "/api/intake/extract", "POST", json.dumps(payload).encode("utf-8"),
            {"Origin": self.origin, "Content-Type": "application/json"},
        )

    def test_three_pages_and_modules_are_served_with_local_policy(self):
        for path in ["/01-intake.html", "/02-decisions.html", "/03-action.html", "/shared/state.js"]:
            status, headers, body = self.request(path)
            self.assertEqual(status, 200, path)
            self.assertGreater(len(body), 0)
            self.assertIn("connect-src 'self'", headers["Content-Security-Policy"])
        self.assertEqual(self.request("/")[0:1], (302,))
        self.assertEqual(self.request("/favicon.ico")[0], 204)

    def test_repository_and_private_routes_are_not_served(self):
        for path in ["/AGENTS.md", "/../AGENTS.md", "/%2e%2e/AGENTS.md", "/.local-inbox/", "/api/memory/items", "/server/app.py"]:
            self.assertEqual(self.request(path)[0], 404, path)

    def test_status_exposes_readiness_without_personal_data(self):
        self.assertTrue(json.loads(self.request("/api/health")[2])["ok"])
        status, _, body = self.request("/api/moneyai/status")
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertFalse(result["serviceReachable"])
        self.assertFalse(result["analysisReady"])
        self.assertFalse(result["extractionReady"])
        self.assertNotIn("sessions", result)
        with patch.object(MoneyAIAdapter, "status", return_value={**result, "serviceReachable": True, "extractionReady": True}):
            status, _, body = self.request("/api/moneyai/status")
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["serviceReachable"])
        self.assertFalse(json.loads(body)["extractionReady"])

    def test_post_requires_origin_json_and_valid_object(self):
        for path in ["/api/moneyai/analysis", "/api/intake/extract"]:
            for origin in [None, "https://example.com", "null"]:
                headers = {"Content-Type": "application/json"}
                if origin is not None:
                    headers["Origin"] = origin
                self.assertEqual(self.request(path, "POST", "{}", headers)[0], 403)
            headers = {"Origin": self.origin, "Content-Type": "text/plain"}
            self.assertEqual(self.request(path, "POST", "{}", headers)[0], 415)
            headers["Content-Type"] = "application/json"
            bodies = [
                "[]", "not json", "", b"\xff\x00", "x" * (256 * 1024 + 1),
                '{"synthetic":NaN}', '{"synthetic":1,"synthetic":2}',
                '{"synthetic":' + "[" * 1200 + "0",
            ]
            for body in bodies:
                with self.subTest(path=path, body_type=type(body).__name__, size=len(body)):
                    status, _, response = self.request(path, "POST", body, headers)
                    self.assertEqual(status, 400)
                    self.assertEqual(json.loads(response), {"ok": False, "code": "invalid_payload"})

    def test_rejected_body_discard_is_bounded_and_restores_socket_timeout(self):
        def make_handler(body, declared_size):
            handler = Handler.__new__(Handler)
            handler.command = "POST"
            handler._body_consumed = False
            handler.headers = Message()
            handler.headers["Content-Length"] = str(declared_size)
            handler.rfile = io.BytesIO(body)
            handler.connection = MagicMock()
            handler.connection.gettimeout.return_value = 3
            return handler

        handler = make_handler(b"x" * (MAX_DISCARD_BYTES + 1024), 10 ** 12)
        with patch("app.monotonic", return_value=0):
            handler.discard_request_body()
            handler.discard_request_body()
        self.assertEqual(handler.rfile.tell(), MAX_DISCARD_BYTES)
        self.assertTrue(handler.close_connection)
        handler.connection.settimeout.assert_called_with(3)

        handler = make_handler(b"x" * MAX_DISCARD_BYTES, MAX_DISCARD_BYTES)
        with patch("app.monotonic", side_effect=[0, 0, 1]):
            handler.discard_request_body()
        self.assertEqual(handler.rfile.tell(), 64 * 1024)
        handler.connection.settimeout.assert_called_with(3)

        handler = make_handler(b"", 2)
        handler.rfile = MagicMock()
        handler.rfile.read1.side_effect = TimeoutError
        with patch("app.monotonic", return_value=0):
            handler.discard_request_body()
        self.assertTrue(handler.close_connection)
        handler.connection.settimeout.assert_called_with(3)

    def test_project_business_routes_fail_closed(self):
        headers = {"Origin": self.origin, "Content-Type": "application/json"}
        with patch("moneyai_adapter.build_opener") as opener:
            for path in ["/api/moneyai/analysis", "/api/moneyai/decisions", "/api/moneyai/history/read"]:
                status, _, body = self.request(path, "POST", '{"synthetic":true}', headers)
                self.assertEqual(status, 409)
                self.assertFalse(json.loads(body)["sentToMoneyAI"])
            opener.assert_not_called()
        self.assertEqual(self.request("/api/unknown", "POST", "{}", headers)[0], 404)

    def test_host_must_match_the_loopback_origin_for_get_and_post(self):
        for host in ["", "example.com", "127.0.0.1", "localhost:" + str(self.server.server_port)]:
            with self.subTest(host=host):
                headers = {"Host": host, "Origin": self.origin, "Content-Type": "application/json"}
                for path, method, body in [
                    ("/api/moneyai/status", "GET", None),
                    ("/api/intake/extract", "POST", json.dumps(self.intake_payload()).encode("utf-8")),
                ]:
                    status, _, response = self.request(path, method, body, headers)
                    self.assertEqual(status, 403)
                    self.assertEqual(json.loads(response), {"ok": False, "code": "host_not_allowed"})

    def test_intake_text_request_is_editable_but_never_sent_or_echoed(self):
        populated = {
            **self.intake_payload(),
            "sources": ["voice", "paste", "txt", "csv", "json", "manual"],
            "materials": [
                {"materialId": "synthetic_txt", "materialVersion": 1, "mime": "text/plain", "text": "synthetic-unshared-text"},
                {"materialId": "synthetic_csv", "materialVersion": 2, "mime": "text/csv", "text": "synthetic-unshared-csv,value\nsample,1"},
                {"materialId": "synthetic_json", "materialVersion": 3, "mime": "application/json", "text": '{"synthetic-unshared-json":true}'},
            ],
        }
        with patch("moneyai_adapter.build_opener") as opener, patch.object(MoneyAIAdapter, "business_request") as business:
            for payload in [self.intake_payload(), populated]:
                status, _, response = self.post_intake(payload)
                self.assertEqual(status, 409)
                result = json.loads(response)
                self.assertEqual(set(result), {"ok", "code", "message", "sentToMoneyAI", "editable"})
                self.assertFalse(result["ok"])
                self.assertEqual(result["code"], "intake_unavailable")
                self.assertFalse(result["sentToMoneyAI"])
                self.assertTrue(result["editable"])
                self.assertIn("手动核对", result["message"])
                for text in [payload["transcript"], payload["description"], *(material["text"] for material in payload["materials"])]:
                    self.assertNotIn(text.encode("utf-8"), response)
            business.assert_not_called()
            opener.assert_not_called()

    def test_intake_rejects_extra_fields_binary_types_and_invalid_limits(self):
        material = {"materialId": "synthetic_material", "materialVersion": 1, "mime": "text/plain", "text": "synthetic text"}
        changes = [
            {"command": "synthetic-do-not-run"},
            {"version": "other"},
            {"roundId": "../outside"},
            {"roundId": "x" * 81},
            {"inputVersion": 0},
            {"inputVersion": True},
            {"inputVersion": 1.5},
            {"inputVersion": 1 << 53},
            {"transcript": {"audio": "not accepted"}},
            {"transcript": "binary" + chr(0) + "text"},
            {"transcript": chr(0xD800)},
            {"transcript": "x" * 20_001},
            {"description": ["not text"]},
            {"description": "x" * 20_001},
            {"sources": "voice"},
            {"sources": ["audio"]},
            {"sources": ["voice", "voice"]},
            {"sources": [{}]},
            {"materials": {}},
            {"materials": [None]},
            {"materials": [material, material]},
            {"materials": [{**material, "materialId": "synthetic_" + str(index)} for index in range(7)]},
        ]
        invalid_materials = [
            {**material, "audio": "not accepted"},
            {**material, "mime": "audio/webm"},
            {**material, "mime": "image/png"},
            {**material, "materialVersion": True},
            {**material, "materialVersion": -1},
            {**material, "text": [1, 2, 3]},
            {**material, "text": "binary" + chr(0) + "text"},
            {**material, "text": "x" * 50_001},
        ]
        payloads = [{**self.intake_payload(), **change} for change in changes]
        payloads.extend({**self.intake_payload(), "materials": [invalid]} for invalid in invalid_materials)
        for field in self.intake_payload():
            payload = self.intake_payload()
            del payload[field]
            payloads.append(payload)
        with patch("moneyai_adapter.build_opener") as opener, patch.object(MoneyAIAdapter, "business_request") as business:
            for index, payload in enumerate(payloads):
                with self.subTest(case=index):
                    status, _, response = self.post_intake(payload)
                    self.assertEqual(status, 400)
                    self.assertEqual(json.loads(response), {"ok": False, "code": "invalid_payload"})
            business.assert_not_called()
            opener.assert_not_called()


if __name__ == "__main__":
    unittest.main()
