"""Serve the imported storefront without exposing other workspace files."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


INDEX = Path(__file__).with_name("index.html")
BRAND = INDEX.parent / "assets" / "brand"
# Explicit public assets only; never expose a directory or arbitrary workspace path.
BRAND_ASSETS = {
    "/assets/brand/nexahub-logo.webp": (BRAND / "nexahub-logo.webp", "image/webp"),
    "/assets/brand/favicon.png": (BRAND / "favicon.png", "image/png"),
    "/assets/brand/apple-touch-icon.png": (BRAND / "apple-touch-icon.png", "image/png"),
    "/favicon.ico": (BRAND / "favicon.png", "image/png"),
}


class StorefrontHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.serve_page()

    def do_HEAD(self):
        self.serve_page(head_only=True)

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
        self.end_headers()
        if not head_only:
            self.wfile.write(content)


if __name__ == "__main__":
    print("NexaHub is running on port 5000", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 5000), StorefrontHandler).serve_forever()
