"""Utility helpers for consistent API responses."""

from __future__ import annotations

from typing import Any, Iterable, Mapping, Optional

from flask import jsonify


def success_response(data: Optional[Mapping[str, Any]] = None, *, message: Optional[str] = None, status_code: int = 200):
    payload = {'success': True}
    if message:
        payload['message'] = message
    if data is not None:
        payload['data'] = data
    return jsonify(payload), status_code


def error_response(code: str, message: str, *, status_code: int = 400, details: Optional[Any] = None, meta: Optional[Mapping[str, Any]] = None):
    error_entry = {'code': code, 'message': message}
    if details is not None:
        error_entry['details'] = details
    if meta:
        error_entry['meta'] = meta
    payload = {'success': False, 'errors': [error_entry]}
    return jsonify(payload), status_code


def multiple_errors_response(errors: Iterable[Mapping[str, Any]], *, status_code: int = 400):
    payload = {'success': False, 'errors': list(errors)}
    return jsonify(payload), status_code

