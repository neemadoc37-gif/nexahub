"""Production HTTP contract tests. No users, orders or payments are inserted."""

import io
import json
import unittest
from unittest.mock import patch

from production import application


def request(path="/", method="GET", body=b"", **headers):
    route, _, query = path.partition("?")
    environ = {
        "REQUEST_METHOD": method, "PATH_INFO": route, "QUERY_STRING": query,
        "HTTP_HOST": "shop.example", "CONTENT_TYPE": "application/json",
        "CONTENT_LENGTH": str(len(body)), "wsgi.input": io.BytesIO(body),
        **headers,
    }
    captured = {}

    def start_response(status, response_headers):
        captured.update(status=int(status.split()[0]), headers=dict(response_headers))

    captured["body"] = b"".join(application(environ, start_response))
    return captured


class ProductionTests(unittest.TestCase):
    def test_process_health_does_not_claim_checkout_or_provider_readiness(self):
        response = request("/api/health")
        self.assertEqual(response["status"], 200)
        data = json.loads(response["body"])
        self.assertEqual(data["scope"], "application_process_only")
        self.assertFalse(data["checkout_enabled"])
        self.assertFalse(data["live_money_enabled"])

    def test_public_pages_and_assets_need_no_request_time_file_reads(self):
        with patch("pathlib.Path.read_bytes", side_effect=AssertionError("Unexpected filesystem access")):
            for path in ("/", "/sign-in", "/catalog", "/assets/platform.js", "/assets/marketplace.css"):
                self.assertEqual(request(path)["status"], 200)
        response = request("/assets/brand/favicon.png", "HEAD")
        self.assertEqual(response["status"], 200)
        self.assertEqual(response["body"], b"")
        self.assertGreater(int(response["headers"]["Content-Length"]), 0)

    def test_traversal_and_private_files_never_exposed(self):
        for path in ("/server.py", "/production.py", "/.replit", "/.env",
                     "/../server.py", "/assets/brand/../../server.py",
                     "/assets/brand/%2e%2e/%2e%2e/server.py"):
            response = request(path)
            self.assertEqual(response["status"], 404)
            self.assertNotIn(b"import ", response["body"])

    def test_private_routes_reject_anonymous_requests(self):
        for path in ("/api/admin", "/api/account/access", "/api/customer/profile", "/api/seller"):
            self.assertEqual(request(path)["status"], 401)

    def test_cross_site_and_malformed_origins_are_not_internal_server_errors(self):
        for origin in ("https://untrusted.example", "http://[", "null"):
            response = request("/api/sellers/applications", "POST", b"{}", HTTP_ORIGIN=origin)
            self.assertEqual(response["status"], 403)

    def test_invalid_bodies_fail_before_dispatch(self):
        for raw, status, headers in (
            (b"[]", 400, {}), (b'{"amount": NaN}', 400, {}),
            (b"{}", 413, {"CONTENT_LENGTH": "20000"}),
            (b"{}", 400, {"CONTENT_LENGTH": "4"}),
            (b"{}", 415, {"CONTENT_TYPE": "text/plain"}),
            (b"{}", 400, {"HTTP_TRANSFER_ENCODING": "chunked"}),
        ):
            with patch("production.API.dispatch") as dispatch:
                response = request("/api/sellers/applications", "POST", raw, **headers)
                self.assertEqual(response["status"], status)
                dispatch.assert_not_called()

    def test_callback_cannot_fake_settlement(self):
        response = request("/api/payments/mpesa/callback", "POST", b'{"ResultCode":0,"paid":true}')
        self.assertEqual(response["status"], 503)
        self.assertEqual(json.loads(response["body"])["error"]["code"], "callbacks_disabled")

    def test_security_headers_cover_failures_as_well_as_pages(self):
        for path in ("/", "/api/admin", "/missing"):
            headers = request(path)["headers"]
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
            self.assertEqual(headers["Referrer-Policy"], "no-referrer")
            self.assertIn("object-src 'none'", headers["Content-Security-Policy"])
