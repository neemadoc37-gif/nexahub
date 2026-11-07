"""Use public Supabase configuration with the caller's verified access token.

No service-role key is used: database RLS remains in effect in addition to
explicit ownership filters in the API.
"""

import json
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class ApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


class SupabaseClient:
    def __init__(self):
        source = (Path(__file__).resolve().parent.parent / "index.html").read_text()
        self.url = re.search(r'NEXAHUB_SUPABASE_URL\s*=\s*"([^"]+)"', source).group(1)
        self.public_key = re.search(r'NEXAHUB_SUPABASE_KEY\s*=\s*"([^"]+)"', source).group(1)

    def get(self, path, token=None, params=None):
        headers = {"apikey": self.public_key, "Accept": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        url = self.url + path
        if params:
            url += "?" + urlencode(params)
        try:
            with urlopen(Request(url, headers=headers), timeout=12) as response:
                raw = response.read(2_000_001)
                if len(raw) > 2_000_000:
                    raise ApiError(502, "upstream_response_too_large", "The response exceeded the safe size limit.")
                return json.loads(raw)
        except HTTPError as error:
            if error.code == 401:
                raise ApiError(401, "session_expired", "Your session is invalid or expired. Please sign in again.") from None
            if error.code == 403:
                raise ApiError(403, "database_access_denied", "The existing database policies do not permit this action.") from None
            if error.code in (400, 404):
                raise ApiError(503, "schema_not_ready", "The required database fields or access policies need verification. Nothing was changed.") from None
            raise ApiError(502, "supabase_unavailable", "Supabase could not complete the request. Please retry.") from None
        except (URLError, TimeoutError, OSError, ValueError):
            raise ApiError(502, "supabase_unavailable", "Could not reach Supabase safely. Please retry.") from None
