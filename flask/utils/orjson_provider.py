"""
Optional orjson-based JSON provider for Flask.
Falls back to default provider if orjson is unavailable.
"""

from typing import Any

try:
    import orjson  # type: ignore
    ORJSON_AVAILABLE = True
except Exception:  # pragma: no cover - optional dependency
    orjson = None  # type: ignore
    ORJSON_AVAILABLE = False

try:
    from flask.json.provider import DefaultJSONProvider
except Exception:  # pragma: no cover - Flask <2.2 unsupported
    DefaultJSONProvider = object  # type: ignore


class OrjsonProvider(DefaultJSONProvider):  # type: ignore[misc]
    """Flask JSON provider using orjson for fast serialization."""

    def dumps(self, obj: Any, **kwargs: Any) -> str:  # pragma: no cover - thin wrapper
        if not ORJSON_AVAILABLE:
            # Defer to base if orjson missing
            return super().dumps(obj, **kwargs)  # type: ignore[attr-defined]

        # Map common Flask kwargs to orjson options
        option = (
            orjson.OPT_NON_STR_KEYS
            | orjson.OPT_SERIALIZE_NUMPY
            | orjson.OPT_OMIT_MICROSECONDS
        )
        # Support sorted keys if requested
        if kwargs.get("sort_keys"):
            option |= getattr(orjson, "OPT_SORT_KEYS", 0)

        return orjson.dumps(obj, option=option).decode("utf-8")

    def loads(self, s: str | bytes, **kwargs: Any) -> Any:  # pragma: no cover
        if not ORJSON_AVAILABLE:
            return super().loads(s, **kwargs)  # type: ignore[attr-defined]
        return orjson.loads(s)


__all__ = ["OrjsonProvider", "ORJSON_AVAILABLE"]

