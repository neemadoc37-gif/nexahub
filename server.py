"""Serve the imported storefront without exposing other workspace files."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import hashlib
from pathlib import Path
from urllib.parse import urlsplit

from marketplace.api import MarketplaceAPI
from marketplace.supabase_client import ApiError
from marketplace.http_policy import parse_json_body, security_headers, validate_write_origin


INDEX = Path(__file__).with_name("index.html")
BRAND = INDEX.parent / "assets" / "brand"
# Explicit public assets only; never expose a directory or arbitrary workspace path.
BRAND_ASSETS = {
    "/assets/brand/nexahub-logo.webp": (BRAND / "nexahub-logo.webp", "image/webp"),
    "/assets/brand/favicon.png": (BRAND / "favicon.png", "image/png"),
    "/assets/brand/apple-touch-icon.png": (BRAND / "apple-touch-icon.png", "image/png"),
    "/assets/brand/spinix-one-logo.svg": (BRAND / "spinix-one-logo.svg", "image/svg+xml"),
    "/assets/brand/spinix-one-icon.svg": (BRAND / "spinix-one-icon.svg", "image/svg+xml"),
    "/favicon.ico": (BRAND / "spinix-one-icon.svg", "image/svg+xml"),
    "/assets/platform.css": (INDEX.parent / "assets" / "platform.css", "text/css; charset=utf-8"),
    "/assets/platform.js": (INDEX.parent / "assets" / "platform.js", "text/javascript; charset=utf-8"),
    "/assets/marketplace.css": (INDEX.parent / "assets" / "marketplace.css", "text/css; charset=utf-8"),
    "/assets/storefront.js": (INDEX.parent / "assets" / "storefront.js", "text/javascript; charset=utf-8"),
    "/assets/marketplace/marketplace-hero.jpg": (INDEX.parent / "assets" / "marketplace" / "marketplace-hero.jpg", "image/jpeg"),
    "/assets/marketplace/spinix-one-marketplace-hero.jpg": (INDEX.parent / "assets" / "marketplace" / "spinix-one-marketplace-hero.jpg", "image/jpeg"),
    "/assets/marketplace/spinix-mystery-box.svg": (INDEX.parent / "assets" / "marketplace" / "spinix-mystery-box.svg", "image/svg+xml"),
    "/assets/marketplace/rewards/spinix-reward-voucher.jpg": (INDEX.parent / "assets" / "marketplace" / "rewards" / "spinix-reward-voucher.jpg", "image/jpeg"),
    "/assets/marketplace/rewards/spinix-reward-cash-usd.jpg": (INDEX.parent / "assets" / "marketplace" / "rewards" / "spinix-reward-cash-usd.jpg", "image/jpeg"),
    "/assets/marketplace/rewards/spinix-reward-cash-ksh.jpg": (INDEX.parent / "assets" / "marketplace" / "rewards" / "spinix-reward-cash-ksh.jpg", "image/jpeg"),
    "/assets/marketplace/rewards/spinix-reward-iphone-16-pro-max.jpg": (INDEX.parent / "assets" / "marketplace" / "rewards" / "spinix-reward-iphone-16-pro-max.jpg", "image/jpeg"),
    "/assets/marketplace/rewards/spinix-reward-samsung-s25-ultra.jpg": (INDEX.parent / "assets" / "marketplace" / "rewards" / "spinix-reward-samsung-s25-ultra.jpg", "image/jpeg"),
    "/assets/marketplace/rewards/spinix-reward-hp-laptop-15.jpg": (INDEX.parent / "assets" / "marketplace" / "rewards" / "spinix-reward-hp-laptop-15.jpg", "image/jpeg"),
    "/assets/marketplace/rewards/spinix-reward-smartwatch.jpg": (INDEX.parent / "assets" / "marketplace" / "rewards" / "spinix-reward-smartwatch.jpg", "image/jpeg"),
}
API = MarketplaceAPI()
PAGE_ROUTES = {
    "/", "/index.html", "/workspaces", "/catalog", "/about", "/customer", "/seller",
    "/rider", "/delivery", "/payments", "/admin", "/sign-in", "/register",
    "/forgot-password",
}

# Only fixed, explicitly public files are read, before requests are accepted.
# Request paths select bytes, never filesystem paths.
_index_bytes = INDEX.read_bytes()
PUBLIC_FILES = {route: (_index_bytes, "text/html; charset=utf-8") for route in PAGE_ROUTES}
PUBLIC_FILES.update({route: (asset.read_bytes(), mime) for route, (asset, mime) in BRAND_ASSETS.items()})


def build_info():
    """Fingerprint public and server source, without exposing paths or secrets."""
    digest = hashlib.sha256()
    sources = [INDEX, Path(__file__), *BRAND_ASSETS.values()]
    paths = [item[0] if isinstance(item, tuple) else item for item in sources]
    paths.extend(sorted((INDEX.parent / "marketplace").glob("*.py")))
    paths.extend([INDEX.parent / "production.py", INDEX.parent / "gunicorn.conf.py"])
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
        for name, value in security_headers(API.client.url):
            self.send_header(name, value)
        super().end_headers()

    def check_write_origin(self):
        validate_write_origin(self.headers.get("Origin"), self.headers.get("Host", ""))

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
                body = parse_json_body(self.headers.get("Content-Type", ""),
                                       self.headers.get("Content-Length"),
                                       self.headers.get("Transfer-Encoding"), self.rfile.read)
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
        resource = PUBLIC_FILES.get(path)
        if resource is None:
            self.send_error(404)
            return
        content, content_type = resource
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
