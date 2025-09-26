"""Utilities for invalidating upstream proxy caches (e.g., Nginx)."""

from __future__ import annotations

import logging
import os
from typing import Iterable, Set
from urllib.parse import urljoin

import requests

logger = logging.getLogger(__name__)

_PURGE_BASE_URL = os.getenv('CACHE_PURGE_BASE_URL')
_PURGE_TIMEOUT = float(os.getenv('CACHE_PURGE_TIMEOUT', '2.0'))

_PAGE_ENDPOINTS = {
    'water_quality': ['/api/v1/water_quality/data'],
    'redox': ['/api/v1/redox_analysis/data'],
}


def purge_urls(urls: Iterable[str]) -> None:
    """Send PURGE requests for the provided absolute URLs."""
    if not _PURGE_BASE_URL:
        logger.debug("Proxy purge skipped; CACHE_PURGE_BASE_URL not configured")
        return

    session = requests.Session()
    for url in urls:
        try:
            resp = session.request('PURGE', url, timeout=_PURGE_TIMEOUT)
            logger.info("Proxy purge %s -> %s", url, resp.status_code)
        except requests.RequestException as exc:
            logger.warning("Proxy purge failed for %s: %s", url, exc)


def purge_paths(paths: Iterable[str]) -> None:
    if not _PURGE_BASE_URL:
        logger.debug("Proxy purge skipped; CACHE_PURGE_BASE_URL not configured")
        return

    urls = [urljoin(_PURGE_BASE_URL.rstrip('/') + '/', path.lstrip('/')) for path in paths]
    purge_urls(urls)


def purge_page_cache(page: str, _affected_months: Set[str] | None = None) -> None:
    """Invalidate proxy cache entries associated with a logical page identifier."""
    paths = _PAGE_ENDPOINTS.get(page, [])
    if not paths:
        logger.debug("No proxy purge mapping for page '%s'", page)
        return
    purge_paths(paths)


__all__ = [
    'purge_urls',
    'purge_paths',
    'purge_page_cache',
]
