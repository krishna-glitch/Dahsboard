"""Monthly cache management for year-scale analytics pages."""

from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timedelta
from typing import Callable, Dict, List, Optional

import pandas as pd

from services.hybrid_cache_service import hybrid_cache_service
from utils.optimized_serializer import serialize_dataframe_optimized


CACHE_NAMESPACE = "monthly"
MONTH_TTL_SECONDS = 60 * 60 * 24 * 400  # ~13 months
META_TTL_SECONDS = MONTH_TTL_SECONDS
_REFRESH_LOCK = threading.Lock()


def _normalize_list(values: Optional[List[str]]) -> List[str]:
    if not values:
        return []
    return sorted({v.strip().upper() for v in values if v})


def _combo_hash(page: str, sites: List[str], parameters: List[str]) -> str:
    raw = json.dumps({
        "page": page,
        "sites": _normalize_list(sites),
        "parameters": _normalize_list(parameters),
    }, sort_keys=True)
    return hashlib.sha1(raw.encode()).hexdigest()[:20]


def _month_token(dt: datetime) -> str:
    return dt.strftime("%Y-%m")


def _month_key(page: str, combo_hash: str, month_token: str) -> str:
    return f"{CACHE_NAMESPACE}:{page}:{combo_hash}:month:{month_token}"


def _meta_key(page: str, combo_hash: str) -> str:
    return f"{CACHE_NAMESPACE}:{page}:{combo_hash}:meta"


def _to_month_start(dt: datetime) -> datetime:
    return datetime(dt.year, dt.month, 1)


def _serialize_dataframe(df: pd.DataFrame) -> Dict[str, List[Dict[str, object]]]:
    return {"records": serialize_dataframe_optimized(df)}


def _deserialize_dataframe(payload: Dict[str, List[Dict[str, object]]]) -> pd.DataFrame:
    records = payload.get("records", [])
    if not records:
        return pd.DataFrame()

    df = pd.DataFrame(records)
    for column in ("measurement_timestamp", "timestamp", "observed_at", "recorded_at"):
        if column in df.columns:
            df[column] = pd.to_datetime(df[column], errors="coerce")
    return df


def _load_metadata(page: str, combo_hash: str) -> Dict[str, object]:
    meta = hybrid_cache_service.get(_meta_key(page, combo_hash)) or {}
    months = meta.get("months", [])
    if not isinstance(months, list):
        months = []
    return {
        "months": months,
        "last_updated": meta.get("last_updated"),
    }


def _store_metadata(page: str, combo_hash: str, months: List[str]):
    payload = {
        "months": months,
        "last_updated": datetime.utcnow().isoformat(),
    }
    hybrid_cache_service.set(_meta_key(page, combo_hash), payload, META_TTL_SECONDS)


def store_month_dataframe(page: str, sites: List[str], parameters: List[str], month_start: datetime, df: pd.DataFrame):
    combo_hash = _combo_hash(page, sites, parameters)
    month_token = _month_token(month_start)
    key = _month_key(page, combo_hash, month_token)
    hybrid_cache_service.set(key, _serialize_dataframe(df), MONTH_TTL_SECONDS)

    metadata = _load_metadata(page, combo_hash)
    months = [token for token in metadata["months"] if token != month_token]
    months.append(month_token)
    months.sort()

    if len(months) > 12:
        expired = months[:-12]
        months = months[-12:]
        for token in expired:
            hybrid_cache_service.delete(_month_key(page, combo_hash, token))

    _store_metadata(page, combo_hash, months)


def load_month_dataframe(page: str, sites: List[str], parameters: List[str], month_start: datetime) -> Optional[pd.DataFrame]:
    combo_hash = _combo_hash(page, sites, parameters)
    month_token = _month_token(month_start)
    payload = hybrid_cache_service.get(_month_key(page, combo_hash, month_token))
    if not payload:
        return None
    try:
        return _deserialize_dataframe(payload)
    except Exception:
        hybrid_cache_service.delete(_month_key(page, combo_hash, month_token))
        return None


def fetch_year_window(
    page: str,
    sites: List[str],
    parameters: List[str],
    end_date: datetime,
    loader: Callable[[datetime, datetime], pd.DataFrame],
) -> pd.DataFrame:
    combo_hash = _combo_hash(page, sites, parameters)
    metadata = _load_metadata(page, combo_hash)
    months = metadata["months"]

    month_starts: List[datetime] = []
    current = _to_month_start(end_date)
    for _ in range(12):
        month_starts.append(current)
        current = _to_month_start(current - timedelta(days=1))

    for token in months:
        try:
            dt = datetime.strptime(f"{token}-01", "%Y-%m-%d")
        except ValueError:
            continue
        if dt not in month_starts:
            month_starts.append(dt)

    month_starts = sorted(set(month_starts))[-12:]

    frames: List[pd.DataFrame] = []
    for month_start in month_starts:
        month_end = _to_month_start(month_start + timedelta(days=32)) - timedelta(seconds=1)
        cached_df = load_month_dataframe(page, sites, parameters, month_start)
        if cached_df is None:
            fresh_df = loader(month_start, month_end) or pd.DataFrame()
            store_month_dataframe(page, sites, parameters, month_start, fresh_df)
            frames.append(fresh_df)
        else:
            frames.append(cached_df)

    if not frames:
        return pd.DataFrame()

    return pd.concat(frames, ignore_index=True)


def invalidate_month(page: str, month_token: str):
    hybrid_cache_service.clear_pattern(f":{page}:*:{month_token}")


def invalidate_for_dataframe(page: str, df: pd.DataFrame):
    if df.empty:
        return

    timestamp_columns = [
        "measurement_timestamp",
        "timestamp",
        "observed_at",
        "recorded_at",
    ]

    ts_series = None
    for column in timestamp_columns:
        if column in df.columns:
            ts_series = pd.to_datetime(df[column], errors="coerce")
            break

    if ts_series is None:
        return

    month_tokens = {_month_token(_to_month_start(ts)) for ts in ts_series.dropna().tolist()}
    for token in month_tokens:
        invalidate_month(page, token)


def schedule_monthly_refresh(page: str, df: pd.DataFrame):
    if df.empty:
        return

    def _task():
        with _REFRESH_LOCK:
            invalidate_for_dataframe(page, df)

    threading.Thread(target=_task, name=f"{page}-monthly-refresh", daemon=True).start()

