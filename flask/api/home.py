from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd
from flask import Blueprint, jsonify
from flask_login import login_required

from config.advanced_logging_config import get_advanced_logger
from config.database import DatabaseError, db
from utils.advanced_performance_integration_simple import enterprise_performance
from utils.redis_api_cache_utils import redis_cached_api_response

home_bp = Blueprint('home_bp', __name__)
logger = get_advanced_logger(__name__)


def _ensure_utc(ts: Optional[Any]) -> Optional[datetime]:
    if ts is None or pd.isna(ts):
        return None
    if isinstance(ts, pd.Timestamp):
        ts = ts.to_pydatetime()
    elif isinstance(ts, datetime):
        pass
    elif isinstance(ts, str):
        for fmt in ('%Y-%m-%dT%H:%M:%S.%fZ', '%Y-%m-%dT%H:%M:%S.%f%z', '%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S'):
            try:
                dt = datetime.strptime(ts, fmt)
                if fmt.endswith('Z'):
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        try:
            return pd.to_datetime(ts, utc=True).to_pydatetime()
        except Exception:
            return None
    else:
        return None
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)


def _run_query(sql: str, params: Optional[Dict[str, Any]] = None) -> pd.DataFrame:
    try:
        result = db.execute_query(sql, params)
        return result if result is not None else pd.DataFrame()
    except DatabaseError as exc:
        logger.warning("Home query failed: %s", exc)
        return pd.DataFrame()


def _to_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    if df is None or df.empty:
        return []
    return df.replace({np.nan: None}).to_dict('records')


@home_bp.route('/', methods=['GET'])
def root():
    return jsonify({
        'message': 'Water Quality Analysis API is running',
        'status': 'operational',
        'version': '1.0.0',
        'endpoints': {
            'water_quality': '/api/v1/water_quality/data',
            'site_comparison': '/api/v1/site_comparison/data',
            'redox_analysis': '/api/v1/redox_analysis/data',
            'performance_test': '/api/v1/performance_test/generate-large-dataset',
            'auth': '/api/v1/auth/login'
        }
    }), 200


@home_bp.route('/data', methods=['GET'])
@login_required
@enterprise_performance(data_type='dashboard')
@redis_cached_api_response(ttl=300)
def get_home_data():
    logger.info("Received request for home data API.")

    now_utc = datetime.now(timezone.utc)
    dashboard_data: Dict[str, Dict[str, Any]] = {}

    # Site statistics
    sites_df = _run_query("SELECT site_id, status, code FROM impact.site")
    total_sites = len(sites_df)
    active_sites = len(sites_df[sites_df['status'] == 'active']) if 'status' in sites_df.columns else total_sites

    # Latest measurement window
    latest_df = _run_query("SELECT MAX(measurement_timestamp) AS latest FROM impact.water_quality")
    latest_ts = _ensure_utc(latest_df.iloc[0]['latest']) if not latest_df.empty else None
    window_start = window_end = None
    recent_measurements = 0
    recent_status = 'empty'

    if latest_ts is not None:
        window_end = latest_ts
        window_start = window_end - timedelta(hours=24)
        count_df = _run_query(
            "SELECT COUNT(*) AS cnt FROM impact.water_quality "
            "WHERE measurement_timestamp BETWEEN :start AND :end",
            {'start': window_start, 'end': window_end}
        )
        recent_measurements = int(count_df.iloc[0]['cnt']) if not count_df.empty else 0
        if recent_measurements > 0:
            recent_status = 'success'
            if (now_utc - window_end) > timedelta(hours=24):
                recent_status = 'warning'
        else:
            recent_status = 'empty'

    dashboard_stats_payload = {
        'total_sites': total_sites,
        'active_sites': active_sites,
        'recent_measurements': recent_measurements,
        'recent_measurements_window': {
            'start': window_start.isoformat() if window_start else None,
            'end': window_end.isoformat() if window_end else None,
            'is_current': window_end is not None and (now_utc - window_end) <= timedelta(hours=24),
            'status': recent_status,
        },
        'recent_measurements_status': recent_status,
        'latest_measurement_timestamp': window_end.isoformat() if window_end else None,
        'data_current_through': window_end.isoformat() if window_end else None,
        'data_quality': 98.5,
        'active_alerts': 0,
    }

    status_label = 'success'
    status_message = None
    if recent_status == 'empty':
        status_label = 'empty'
        status_message = 'No measurements recorded yet.'
    elif recent_status == 'warning':
        status_label = 'warning'
        status_message = 'No measurements in the last 24 hours.'

    dashboard_data['dashboard_stats'] = {
        'status': status_label,
        'message': status_message,
        'data': dashboard_stats_payload,
    }

    # Recent activity and latest per site
    recent_activity_df = _run_query(
        """
        SELECT wq.measurement_timestamp AS measurement_timestamp,
               s.code AS site_code,
               'Water Quality Measurement' AS activity_type
        FROM impact.water_quality wq
        JOIN impact.site s ON wq.site_id = s.site_id
        ORDER BY wq.measurement_timestamp DESC
        LIMIT 5
        """
    )
    recent_activity_records = _to_records(recent_activity_df)
    dashboard_data['recent_activity'] = {
        'status': 'success' if recent_activity_records else 'empty',
        'message': None if recent_activity_records else 'No recent activity recorded.',
        'data': recent_activity_records,
    }

    latest_per_site_df = _run_query(
        """
        SELECT s.code AS site_code,
               MAX(wq.measurement_timestamp) AS last_water_quality,
               MAX(re.measurement_timestamp) AS last_redox
        FROM impact.site s
        LEFT JOIN impact.water_quality wq ON s.site_id = wq.site_id
        LEFT JOIN impact.redox_event re ON s.site_id = re.site_id
        GROUP BY s.code
        ORDER BY s.code
        """
    )
    if not latest_per_site_df.empty:
        latest_per_site_df['last_water_quality'] = latest_per_site_df['last_water_quality'].apply(
            lambda ts: _ensure_utc(ts).isoformat() if ts else None
        )
        latest_per_site_df['last_redox'] = latest_per_site_df['last_redox'].apply(
            lambda ts: _ensure_utc(ts).isoformat() if ts else None
        )
    latest_site_records = _to_records(latest_per_site_df)
    dashboard_data['latest_per_site'] = {
        'status': 'success' if latest_site_records else 'empty',
        'message': None if latest_site_records else 'No site activity available.',
        'data': latest_site_records,
    }

    # Synthetic system health data (placeholder)
    try:
        health_data = {
            'timestamps': [(now_utc - timedelta(minutes=i)).strftime('%H:%M') for i in range(10, 0, -1)],
            'values': [95, 97, 96, 98, 97, 99, 98, 97, 98, 99],
        }
        dashboard_data['system_health_data'] = {
            'status': 'success',
            'data': health_data,
        }
    except Exception as exc:  # pragma: no cover
        logger.warning("Could not generate system health data: %s", exc)
        dashboard_data['system_health_data'] = {
            'status': 'error',
            'message': 'Could not generate system health chart.',
            'data': {},
        }

    response_data = {
        'dashboard_data': dashboard_data,
        'metadata': {
            'last_updated': now_utc.isoformat(),
            'performance': {'loading_time_ms': 50.0},
            'has_data': bool(latest_site_records or recent_activity_records or total_sites),
        },
    }

    return jsonify(response_data), 200
