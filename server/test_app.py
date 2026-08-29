"""Local HTTP boundary tests; no browser, merchant data, or external AI calls."""
import http.client
import io
import json
import threading
import unittest
from email.message import Message
from functools import partial
from http.server import ThreadingHTTPServer
from unittest.mock import MagicMock, patch

import app
from app import Handler, MAX_DISCARD_BYTES


def completion_response(content="ok"):
    response = MagicMock()
    response.status = 200
    response.read.return_value = json.dumps(
        {"choices": [{"message": {"role": "assistant", "content": content}}]}
    ).encode("utf-8")
    response.__enter__.return_value = response
    response.__exit__.return_value = False
    return response


class SettingsValidationTests(unittest.TestCase):
    def test_base_url_accepts_https_and_loopback_http_only(self):
        self.assertEqual(app.validate_base_url("https://api.example.com/v1"), "https://api.example.com/v1")
        self.assertEqual(app.validate_base_url("http://127.0.0.1:11434"), "http://127.0.0.1:11434")
        self.assertEqual(app.validate_base_url("http://localhost:11434/"), "http://localhost:11434")
        for value in ["http://api.example.com", "https://user:pass@api.example.com",
                      "https://api.example.com?x=1", "https://api.example.com#x",
                      "ftp://api.example.com", "not a url", "", "https://"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                app.validate_base_url(value)

    def test_public_settings_never_contains_the_key(self):
        public = app.public_settings({"baseUrl": "https://api.example.com", "apiKey": "SECRET", "model": "m"})
        self.assertTrue(public["configured"])
        self.assertTrue(public["hasKey"])
        self.assertNotIn("apiKey", public)
        self.assertNotIn("SECRET", json.dumps(public))
        self.assertEqual(app.public_settings(None)["configured"], False)


class LocalHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = "http://127.0.0.1:" + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def setUp(self):
        app.clear_settings()

    def tearDown(self):
        app.clear_settings()

    def request(self, path, method="GET", body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def post_json(self, path, payload, origin=True):
        headers = {"Content-Type": "application/json"}
        if origin:
            headers["Origin"] = self.origin
        return self.request(path, "POST", json.dumps(payload).encode("utf-8"), headers)

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

    def test_moneyai_routes_are_removed(self):
        for path in ["/api/moneyai/status", "/api/moneyai/analysis", "/api/moneyai/decisions",
                     "/api/moneyai/history/read", "/api/intake/extract"]:
            self.assertEqual(self.request(path)[0], 404, path)
            self.assertEqual(self.post_json(path, {"synthetic": True})[0], 404, path)

    def test_settings_roundtrip_never_echoes_the_key(self):
        status, _, body = self.request("/api/ai/settings")
        self.assertEqual(status, 200)
        self.assertFalse(json.loads(body)["configured"])
        saved = {"baseUrl": "https://api.example.com/v1", "apiKey": "SECRET-KEY", "model": "glm-test"}
        status, _, body = self.post_json("/api/ai/settings", saved)
        self.assertEqual(status, 200)
        self.assertNotIn("SECRET-KEY", body.decode("utf-8"))
        status, _, body = self.request("/api/ai/settings")
        result = json.loads(body)
        self.assertEqual((status, result["configured"], result["hasKey"]), (200, True, True))
        self.assertEqual(result["baseUrl"], saved["baseUrl"])
        self.assertEqual(result["model"], saved["model"])
        self.assertNotIn("apiKey", result)

    def test_settings_update_without_key_keeps_the_existing_one(self):
        self.post_json("/api/ai/settings", {"baseUrl": "https://api.example.com", "apiKey": "FIRST", "model": "a"})
        with patch("app.build_opener") as opener:
            opener.return_value.open.return_value = completion_response("pong")
            status, _, _ = self.post_json("/api/ai/chat", {"messages": [{"role": "user", "content": "hi"}]})
        self.assertEqual(status, 200)
        request = opener.return_value.open.call_args[0][0]
        self.assertEqual(request.get_header("Authorization"), "Bearer FIRST")
        # Partial update without apiKey keeps the stored key.
        status, _, body = self.post_json("/api/ai/settings", {"baseUrl": "https://api.example.com", "model": "b"})
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["hasKey"])

    def test_settings_reject_invalid_values_and_first_save_requires_key(self):
        cases = [
            ({"baseUrl": "http://api.example.com", "apiKey": "K", "model": "m"}, "invalid_settings"),
            ({"baseUrl": "https://api.example.com", "apiKey": "K", "model": "m", "extra": 1}, "invalid_payload"),
            ({"baseUrl": "https://api.example.com", "model": "m"}, "invalid_settings"),
            ({"baseUrl": "https://api.example.com", "apiKey": "K"}, "invalid_payload"),
            ({"baseUrl": "https://user:pass@api.example.com", "apiKey": "K", "model": "m"}, "invalid_settings"),
            ({"baseUrl": "https://api.example.com", "apiKey": "K", "model": "m 型"}, "invalid_settings"),
        ]
        for payload, code in cases:
            with self.subTest(payload=payload):
                status, _, body = self.post_json("/api/ai/settings", payload)
                self.assertEqual(status, 400)
                self.assertEqual(json.loads(body)["code"], code)
        self.assertFalse(app.load_settings())

    def test_clear_removes_settings(self):
        self.post_json("/api/ai/settings", {"baseUrl": "https://api.example.com", "apiKey": "K", "model": "m"})
        status, _, body = self.post_json("/api/ai/settings", {"clear": True})
        self.assertEqual(status, 200)
        self.assertFalse(json.loads(body)["configured"])
        self.assertFalse(app.load_settings())

    def test_chat_fails_closed_while_unconfigured(self):
        with patch("app.build_opener") as opener:
            status, _, body = self.post_json("/api/ai/chat", {"messages": [{"role": "user", "content": "hi"}]})
            opener.assert_not_called()
        self.assertEqual(status, 409)
        self.assertEqual(json.loads(body)["code"], "ai_not_configured")

    def test_chat_validates_messages_and_optional_fields(self):
        self.post_json("/api/ai/settings", {"baseUrl": "https://api.example.com", "apiKey": "K", "model": "m"})
        good = {"role": "user", "content": "hi"}
        cases = [
            {},
            {"messages": []},
            {"messages": [good] * 21},
            {"messages": [{"role": "bot", "content": "hi"}]},
            {"messages": [{"role": "user"}]},
            {"messages": [{"role": "user", "content": ""}]},
            {"messages": [{"role": "user", "content": "hi", "name": "x"}]},
            {"messages": [good], "temperature": 3},
            {"messages": [good], "temperature": True},
            {"messages": [good], "maxTokens": 0},
            {"messages": [good], "maxTokens": 4097},
            {"messages": [good], "unknown": 1},
        ]
        for payload in cases:
            with self.subTest(payload=payload):
                status, _, body = self.post_json("/api/ai/chat", payload)
                self.assertEqual(status, 400)
                self.assertEqual(json.loads(body)["code"], "invalid_payload")

    def test_chat_success_forwards_messages_and_returns_content(self):
        self.post_json("/api/ai/settings", {"baseUrl": "https://api.example.com", "apiKey": "K", "model": "m"})
        with patch("app.build_opener") as opener:
            opener.return_value.open.return_value = completion_response("你好")
            status, _, body = self.post_json("/api/ai/chat", {
                "messages": [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}],
                "temperature": 0, "maxTokens": 10,
            })
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {"ok": True, "content": "你好"})
        request = opener.return_value.open.call_args[0][0]
        self.assertEqual(request.full_url, "https://api.example.com/chat/completions")
        self.assertEqual(request.get_header("Authorization"), "Bearer K")
        sent = json.loads(request.data.decode("utf-8"))
        self.assertEqual(sent["model"], "m")
        self.assertEqual(len(sent["messages"]), 2)

    def test_chat_provider_errors_and_bad_shapes_are_not_success(self):
        self.post_json("/api/ai/settings", {"baseUrl": "https://api.example.com", "apiKey": "K", "model": "m"})
        from urllib.error import HTTPError
        error = HTTPError("https://api.example.com/chat/completions", 401, "Unauthorized", None, None)
        with patch("app.build_opener") as opener:
            opener.return_value.open.side_effect = error
            status, _, body = self.post_json("/api/ai/chat", {"messages": [{"role": "user", "content": "hi"}]})
        self.assertEqual(status, 502)
        result = json.loads(body)
        self.assertFalse(result["ok"])
        self.assertNotIn("K", json.dumps(result))
        for payload in [{"choices": []}, {"choices": [{"message": {}}]}, {"choices": [{"message": {"content": " "}}]}, ["x"]]:
            response = completion_response("x")
            response.read.return_value = json.dumps(payload).encode("utf-8")
            with patch("app.build_opener") as opener:
                opener.return_value.open.return_value = response
                status, _, body = self.post_json("/api/ai/chat", {"messages": [{"role": "user", "content": "hi"}]})
            self.assertEqual(status, 502, payload)
            self.assertFalse(json.loads(body)["ok"])

    def test_post_requires_origin_json_and_valid_object(self):
        for path in ["/api/ai/settings", "/api/ai/chat"]:
            for origin in [None, "https://example.com", "null"]:
                headers = {"Content-Type": "application/json"}
                if origin is not None:
                    headers["Origin"] = origin
                self.assertEqual(self.request(path, "POST", "{}", headers)[0], 403)
            headers = {"Origin": self.origin, "Content-Type": "text/plain"}
            self.assertEqual(self.request(path, "POST", "{}", headers)[0], 415)
            headers = {"Content-Type": "application/json", "Origin": self.origin}
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

    def test_host_must_match_the_loopback_origin_for_get_and_post(self):
        for host in ["", "example.com", "127.0.0.1", "localhost:" + str(self.server.server_port)]:
            with self.subTest(host=host):
                headers = {"Host": host, "Origin": self.origin, "Content-Type": "application/json"}
                for path, method, body in [
                    ("/api/ai/settings", "GET", None),
                    ("/api/ai/settings", "POST", b'{"clear": true}'),
                    ("/api/ai/chat", "POST", b'{"messages":[{"role":"user","content":"hi"}]}'),
                ]:
                    status, _, response = self.request(path, method, body, headers)
                    self.assertEqual(status, 403)
                    self.assertEqual(json.loads(response), {"ok": False, "code": "host_not_allowed"})


if __name__ == "__main__":
    unittest.main()
