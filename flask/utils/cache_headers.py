"""
Safe cache headers + ETag middleware for JSON endpoints.

Phased usage:
- Phase 1: Enable to add Cache-Control for 200 JSON responses on safe paths.
- Phase 2: Same middleware provides strong validators (ETag) to unlock Nginx revalidation.

The ETag is computed from the response payload for JSON responses up to a size cap.
If the client's If-None-Match matches the computed ETag, the response is converted to 304.
"""

from __future__ import annotations

import hashlib
from typing import Iterable
from flask import request, Response

# Safe API path prefixes for caching (align with ops/nginx/api-cache.conf)
SAFE_API_PREFIXES: Iterable[str] = (
    '/api/v1/redox_analysis',
    '/api/v1/water_quality',
    '/api/v1/site_comparison',
    '/api/v1/correlation',
    '/api/v1/trends',
    '/api/v1/statistics',
)

MAX_ETAG_BODY_BYTES = 5 * 1024 * 1024  # 5 MiB cap to avoid hashing very large streaming payloads


def _is_cacheable_path(path: str) -> bool:
    return any(path.startswith(p) for p in SAFE_API_PREFIXES)


def _is_json_response(resp: Response) -> bool:
    ctype = (resp.headers.get('Content-Type') or '').lower()
    return 'application/json' in ctype


def _compute_etag(resp: Response) -> str | None:
    try:
        # Avoid hashing very large bodies
        content_length = resp.calculate_content_length()
        if content_length is not None and content_length > MAX_ETAG_BODY_BYTES:
            return None
        body = resp.get_data(as_text=False)
        if not body or len(body) > MAX_ETAG_BODY_BYTES:
            return None
        h = hashlib.sha256()
        h.update(body)
        return 'W/"%s"' % h.hexdigest()  # weak ETag OK for payload identity
    except Exception:
        return None


def init_cache_headers(app, default_ttl_seconds: int = 3600):
    """Register before/after hooks to set Cache-Control and ETag for safe JSON API paths.

    This is conservative: only 200 JSON responses on whitelisted paths are tagged cacheable.
    """

    @app.after_request
    def _set_cache_headers(resp: Response):
        try:
            path = request.path or ''
            if resp.status_code == 200 and _is_cacheable_path(path) and _is_json_response(resp):
                # Set Cache-Control if not already set by endpoint
                if not resp.headers.get('Cache-Control'):
                    resp.headers['Cache-Control'] = f'public, max-age={default_ttl_seconds}'

                # Compute and attach ETag
                etag = _compute_etag(resp)
                if etag:
                    inm = request.headers.get('If-None-Match')
                    resp.headers['ETag'] = etag

                    # If client's ETag matches, switch to 304
                    if inm and etag in {t.strip() for t in inm.split(',')}:
                        # Convert to 304 with empty body but preserve headers
                        resp.status_code = 304
                        resp.set_data(b'')
                        # 304 responses should not include body-related headers
                        for h in ('Content-Length',):
                            if h in resp.headers:
                                del resp.headers[h]
            else:
                # Non-cacheable responses: explicitly prevent caches from storing
                # (but do not override if the view set something already)
                if not resp.headers.get('Cache-Control') and _is_cacheable_path(path):
                    resp.headers['Cache-Control'] = 'no-cache, no-store'
        except Exception:
            # Never break the response on middleware failure
            pass
        return resp

    return app

