"""Serve the imported storefront without exposing other workspace files."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import urlsplit

from marketplace.api import MarketplaceAPI
from marketplace.supabase_client import ApiError


INDEX = Path(__file__).with_name("index.html")
BRAND = INDEX.parent / "assets" / "brand"
# Explicit public assets only; never expose a directory or arbitrary workspace path.
BRAND_ASSETS = {
    "/assets/brand/nexahub-logo.webp": (BRAND / "nexahub-logo.webp", "image/webp"),
    "/assets/brand/favicon.png": (BRAND / "favicon.png", "image/png"),
    "/assets/brand/apple-touch-icon.png": (BRAND / "apple-touch-icon.png", "image/png"),
    "/favicon.ico": (BRAND / "favicon.png", "image/png"),
    "/assets/platform.css": (INDEX.parent / "assets" / "platform.css", "text/css; charset=utf-8"),
    "/assets/platform.js": (INDEX.parent / "assets" / "platform.js", "text/javascript; charset=utf-8"),
}
API = MarketplaceAPI()


class StorefrontHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path.startswith("/api/"):
            self.serve_api("GET")
            return
        self.serve_page()

    def do_HEAD(self):
        if urlsplit(self.path).path.startswith("/api/"):
            self.send_error(405)
            return
        self.serve_page(head_only=True)

    def do_POST(self):
        if not urlsplit(self.path).path.startswith("/api/"):
            self.send_error(404)
            return
        self.serve_api("POST")

    def log_request(self, code="-", size="-"):
        # No auth codes, access tokens, phone numbers or form bodies in logs.
        self.log_message("%s %s %s", self.command, urlsplit(self.path).path, str(code))

    def serve_api(self, method):
        try:
            body = None
            if method == "POST":
                if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
                    raise ApiError(415, "json_required", "Send a JSON request body.")
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                except ValueError:
                    length = 0
                if not 0 < length <= 16384:
                    raise ApiError(413, "invalid_body_size", "The request body must be between 1 and 16384 bytes.")
                try:
                    body = json.loads(self.rfile.read(length))
                except (ValueError, UnicodeDecodeError):
                    raise ApiError(400, "invalid_json", "The request body is not valid JSON.") from None
                if not isinstance(body, dict):
                    raise ApiError(400, "invalid_json_object", "Send a JSON object.")
            result = API.dispatch(method, self.path, self.headers.get("Authorization"), body)
            self.send_json(200, result)
        except ApiError as error:
            self.send_json(error.status, {"error": {"code": error.code, "message": error.message}})
        except Exception:
            # Never return exception details or provider payloads containing PII.
            self.send_json(500, {"error": {"code": "internal_error", "message": "The request could not be completed safely. No success is claimed."}})

    def send_json(self, status, body):
        content = json.dumps(body, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(content)

    def serve_page(self, head_only=False):
        path = urlsplit(self.path).path
        if path in ("/", "/index.html"):
            file_path, content_type = INDEX, "text/html; charset=utf-8"
        elif path in BRAND_ASSETS:
            file_path, content_type = BRAND_ASSETS[path]
        else:
            self.send_error(404)
            return
        content = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        if not head_only:
            self.wfile.write(content)


if __name__ == "__main__":
    print("NexaHub is running on port 5000", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 5000), StorefrontHandler).serve_forever()
