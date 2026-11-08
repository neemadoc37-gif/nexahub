"""Serve the imported storefront without exposing other workspace files."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import hashlib
import os
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
PAGE_ROUTES = {
    "/", "/index.html", "/workspaces", "/catalog", "/customer", "/seller",
    "/rider", "/delivery", "/payments", "/admin", "/sign-in", "/register",
    "/forgot-password",
}


def build_info():
    """Fingerprint public and server source, without exposing paths or secrets."""
    digest = hashlib.sha256()
    sources = [INDEX, Path(__file__), *BRAND_ASSETS.values()]
    paths = [item[0] if isinstance(item, tuple) else item for item in sources]
    paths.extend(sorted((INDEX.parent / "marketplace").glob("*.py")))
    for path in paths:
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return {"build_id": digest.hexdigest()[:12], "auth_provider": "Supabase"}


class StorefrontHandler(BaseHTTPRequestHandler):
    server_version = "NexaHub"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def end_headers(self):
        # Keep the existing inline handlers working while limiting script and
        # data destinations. This is a baseline CSP, not a strict nonce CSP.
        supabase_origin = API.client.url
        self.send_header("Content-Security-Policy", (
            "default-src 'self'; base-uri 'self'; object-src 'none'; "
            "frame-ancestors 'self' https://replit.com https://*.replit.com; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; "
            f"connect-src 'self' {supabase_origin} {supabase_origin.replace('https://', 'wss://')}; "
            "form-action 'self'"
        ))
        self.send_header("Permissions-Policy", "camera=(), microphone=()")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def check_write_origin(self):
        origin = self.headers.get("Origin")
        if origin is None:
            return  # Non-browser API callers still require a verified bearer.
        parsed = urlsplit(origin)
        allowed_hosts = {self.headers.get("Host", "").lower()}
        preview_host = os.environ.get("REPLIT_DEV_DOMAIN", "").lower()
        if preview_host:
            allowed_hosts.update({preview_host, preview_host + ":5000"})
        if (parsed.scheme not in ("https", "http") or parsed.netloc.lower() not in allowed_hosts
                or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
            raise ApiError(403, "cross_origin_request", "This action must be submitted from the NexaHub website.")

    def do_GET(self):
        if urlsplit(self.path).path == "/api/build":
            self.send_json(200, build_info())
            return
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
                if urlsplit(self.path).path != "/api/payments/mpesa/callback":
                    self.check_write_origin()
                if self.headers.get("Transfer-Encoding"):
                    raise ApiError(400, "unsupported_transfer_encoding", "Send a bounded JSON request with Content-Length.")
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
        except (BrokenPipeError, ConnectionResetError):
            # Navigation can disconnect a reader. Never turn an abandoned
            # successful response into a second, misleading 500 response.
            return
        except Exception:
            # Never return exception details or provider payloads containing PII.
            self.send_json(500, {"error": {"code": "internal_error", "message": "The request could not be completed safely. No success is claimed."}})

    def send_json(self, status, body):
        content = json.dumps(body, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-NexaHub-Build", build_info()["build_id"])
        self.end_headers()
        self.wfile.write(content)

    def serve_page(self, head_only=False):
        path = urlsplit(self.path).path
        if path != "/":
            path = path.rstrip("/")
        if path in PAGE_ROUTES:
            file_path, content_type = INDEX, "text/html; charset=utf-8"
        elif path in BRAND_ASSETS:
            file_path, content_type = BRAND_ASSETS[path]
        else:
            self.send_error(404)
            return
        content = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-NexaHub-Build", build_info()["build_id"])
        self.end_headers()
        if not head_only:
            self.wfile.write(content)


if __name__ == "__main__":
    print("NexaHub is running on port 5000", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 5000), StorefrontHandler).serve_forever()
