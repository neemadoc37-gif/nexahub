"""Shared request protections for Preview and the production WSGI server."""

import json
import os
from urllib.parse import urlsplit

from .supabase_client import ApiError


def security_headers(supabase_origin):
    return [
        ("Content-Security-Policy", (
            "default-src 'self'; base-uri 'self'; object-src 'none'; "
            "frame-ancestors 'self' https://replit.com https://*.replit.com; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; "
            f"connect-src 'self' {supabase_origin} {supabase_origin.replace('https://', 'wss://')}; "
            "form-action 'self'"
        )),
        ("Permissions-Policy", "camera=(), microphone=()"),
        ("X-Content-Type-Options", "nosniff"),
        ("Referrer-Policy", "no-referrer"),
    ]


def validate_write_origin(origin, host):
    if origin is None:
        return  # Non-browser callers still require verified bearer authorization.
    try:
        parsed = urlsplit(origin)
    except ValueError:
        raise ApiError(403, "cross_origin_request", "This action must be submitted from the Spinix One website.") from None
    allowed = {host.lower()}
    preview = os.environ.get("REPLIT_DEV_DOMAIN", "").lower()
    if preview:
        allowed.update({preview, preview + ":5000"})
    if (parsed.scheme not in ("https", "http") or parsed.netloc.lower() not in allowed
            or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
        raise ApiError(403, "cross_origin_request", "This action must be submitted from the Spinix One website.")


def parse_json_body(content_type, content_length, transfer_encoding, read):
    if transfer_encoding:
        raise ApiError(400, "unsupported_transfer_encoding", "Send a bounded JSON request with Content-Length.")
    if content_type.split(";")[0].strip().lower() != "application/json":
        raise ApiError(415, "json_required", "Send a JSON request body.")
    try:
        length = int(content_length or "0")
    except (ValueError, TypeError):
        length = 0
    if not 0 < length <= 16384:
        raise ApiError(413, "invalid_body_size", "The request body must be between 1 and 16384 bytes.")
    raw = read(length)
    if len(raw) != length:
        raise ApiError(400, "truncated_body", "The request body was incomplete.")
    try:
        def reject_constant(_):
            raise ValueError("Non-standard JSON number")
        body = json.loads(raw, parse_constant=reject_constant)
    except (ValueError, UnicodeDecodeError):
        raise ApiError(400, "invalid_json", "The request body is not valid JSON.") from None
    if not isinstance(body, dict):
        raise ApiError(400, "invalid_json_object", "Send a JSON object.")
    return body
