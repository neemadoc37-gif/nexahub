"""Production WSGI adapter. Shares the existing API and fixed public snapshot."""

import json
from http import HTTPStatus

from marketplace.http_policy import parse_json_body, security_headers, validate_write_origin
from marketplace.supabase_client import ApiError
from server import API, PUBLIC_FILES, build_info


BUILD = build_info()


def application(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET")
    path = environ.get("PATH_INFO", "/")
    query = environ.get("QUERY_STRING", "")
    target = path + ("?" + query if query else "")
    status = 200
    content_type = "application/json; charset=utf-8"
    try:
        if path.startswith("/api/"):
            if method not in ("GET", "POST"):
                raise ApiError(405, "method_not_allowed", "This request method is unavailable.")
            if method == "GET" and path == "/api/build":
                result = BUILD
            else:
                body = None
                if method == "POST":
                    if path != "/api/payments/mpesa/callback":
                        validate_write_origin(environ.get("HTTP_ORIGIN"), environ.get("HTTP_HOST", ""))
                    body = parse_json_body(
                        environ.get("CONTENT_TYPE", ""), environ.get("CONTENT_LENGTH"),
                        environ.get("HTTP_TRANSFER_ENCODING"), environ["wsgi.input"].read,
                    )
                result = API.dispatch(method, target, environ.get("HTTP_AUTHORIZATION"), body)
            content = json.dumps(result, allow_nan=False).encode()
        else:
            if method not in ("GET", "HEAD"):
                raise ApiError(405, "method_not_allowed", "This request method is unavailable.")
            route = path.rstrip("/") or "/"
            resource = PUBLIC_FILES.get(route)
            if resource is None:
                raise ApiError(404, "not_found", "This page is unavailable.")
            content, content_type = resource
    except ApiError as error:
        status = error.status
        content = json.dumps({"error": {"code": error.code, "message": error.message}}).encode()
    except Exception:
        status = 500
        content = json.dumps({"error": {
            "code": "internal_error",
            "message": "The request could not be completed safely. No success is claimed.",
        }}).encode()
    headers = [
        ("Content-Type", content_type), ("Content-Length", str(len(content))),
        ("Cache-Control", "no-store"), ("X-NexaHub-Build", BUILD["build_id"]),
        *security_headers(API.client.url),
    ]
    start_response(f"{status} {HTTPStatus(status).phrase}", headers)
    return [] if method == "HEAD" else [content]
