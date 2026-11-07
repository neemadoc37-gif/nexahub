"""Serve the imported storefront without exposing other workspace files."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


INDEX = Path(__file__).with_name("index.html")


class StorefrontHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.serve_page()

    def do_HEAD(self):
        self.serve_page(head_only=True)

    def serve_page(self, head_only=False):
        if urlsplit(self.path).path not in ("/", "/index.html"):
            self.send_error(404)
            return
        content = INDEX.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if not head_only:
            self.wfile.write(content)


if __name__ == "__main__":
    print("NexaHub is running on port 5000", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 5000), StorefrontHandler).serve_forever()
