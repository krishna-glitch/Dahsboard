from flask import Blueprint, jsonify
from flask_login import login_required
import logging
import pandas as pd
import numpy as np
import json
from datetime import datetime, timedelta
from config.database import db
from utils.errors import APIError

# Custom JSON encoder to handle numpy types
class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        elif pd.isna(obj):
            return None
        return super(NumpyEncoder, self).default(obj)

# Import comprehensive performance optimization
from utils.advanced_performance_integration_simple import enterprise_performance
from utils.redis_api_cache_utils import redis_cached_api_response

# Initialize logger (using the existing advanced logging system)
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

home_bp = Blueprint('home_bp', __name__)

@home_bp.route('/', methods=['GET'])
def root():
    """Root endpoint to verify API is running"""
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
    try:
        from config.database import db
        import pandas as pd

        dashboard_data = {}

        # 1. Load dashboard statistics
        stats = {}

        # Active Sites Count
        sites_query = "SELECT site_id, status FROM impact.site"
        sites_result = db.execute_query(sites_query)

        if not sites_result.empty:
            total_sites = int(len(sites_result))
            active_sites = int(len(sites_result[sites_result['status'] == 'active'])) if 'status' in sites_result.columns else total_sites
            stats['active_sites'] = active_sites
            stats['total_sites'] = total_sites
        else:
            stats['active_sites'] = 0
            stats['total_sites'] = 0

        # Recent measurements count (last 24 hours relative to NOW)
        try:
            # Determine latest measurement overall (data currency)
            latest_ts_df = db.execute_query("SELECT MAX(measurement_timestamp) AS latest FROM impact.water_quality")
            latest_ts = pd.to_datetime(latest_ts_df['latest'].iloc[0]) if not latest_ts_df.empty else pd.NaT
            if pd.isna(latest_ts):
                latest_ts = None

            # Count measurements in the last 24 hours relative to current time
            now_ts = pd.Timestamp.utcnow()
            window_start_now = now_ts - pd.Timedelta(hours=24)
            recent_measurements_query = """
                SELECT COUNT(*) AS count
                FROM impact.water_quality
                WHERE measurement_timestamp BETWEEN :start_ts AND :end_ts
            """
            recent_result = db.execute_query(recent_measurements_query, {
                'start_ts': window_start_now.to_pydatetime(),
                'end_ts': now_ts.to_pydatetime()
            })
            recent_24h = int(recent_result.iloc[0]['count']) if not recent_result.empty else 0

            # If data is stale (latest older than window), clamp to 0 to avoid misleading counts
            if latest_ts is None or latest_ts < window_start_now:
                stats['recent_measurements'] = 0
            else:
                stats['recent_measurements'] = recent_24h

            # Expose the data currency date (UTC ISO date) if available
            if latest_ts is not None:
                stats['data_current_through'] = latest_ts.isoformat()
        except Exception as e:
            logger.warning(f"Could not get recent measurements: {e}")
            stats['recent_measurements'] = 0

        # System health (simplified)
        stats['system_health'] = "Operational"
        stats['data_quality'] = 98.5  # Mock value

        logger.info(f"Stats data types: {[(k, type(v).__name__) for k, v in stats.items()]}")
        dashboard_data['dashboard_stats'] = stats

        # 2. Load recent activity
        try:
            # Get the last 5 water quality measurements overall (robust even if data is older than 24h)
            activity_query = """
                SELECT wq.measurement_timestamp, s.code AS site_code, 'Water Quality Measurement' AS activity_type
                FROM impact.water_quality wq
                JOIN impact.site s ON wq.site_id = s.site_id
                ORDER BY wq.measurement_timestamp DESC
                LIMIT 5
            """
            activity_result = db.execute_query(activity_query)
            # Convert to native Python types to avoid JSON serialization issues
            if not activity_result.empty:
                records = []
                for _, row in activity_result.iterrows():
                    record = {}
                    for col in activity_result.columns:
                        val = row[col]
                        if pd.isna(val):
                            record[col] = None
                        elif isinstance(val, (np.integer, np.int64, np.int32)):
                            record[col] = int(val)
                        elif isinstance(val, (np.floating, np.float64, np.float32)):
                            record[col] = float(val)
                        elif hasattr(val, 'isoformat'):
                            record[col] = val.isoformat()
                        else:
                            record[col] = str(val)
                    records.append(record)
                dashboard_data['recent_activity'] = records
            else:
                dashboard_data['recent_activity'] = []
        except Exception as e:
            logger.warning(f"Could not get recent activity: {e}")
            dashboard_data['recent_activity'] = []

        # 3. System health data for chart
        # Simplified mock data instead of real performance testing
        dashboard_data['system_health_data'] = {
            'timestamps': [(datetime.now() - timedelta(minutes=i)).strftime('%H:%M') for i in range(10, 0, -1)],
            'values': [95, 97, 96, 98, 97, 99, 98, 97, 98, 99]  # Mock health percentages
        }

        # 4. Latest record per site for Water Quality and Redox (site-wise KPI)
        try:
            latest_per_site_query = """
                SELECT 
                  s.code AS site_code,
                  MAX(wq.measurement_timestamp) AS last_water_quality,
                  MAX(re.measurement_timestamp) AS last_redox
                FROM impact.site s
                LEFT JOIN impact.water_quality wq ON s.site_id = wq.site_id
                LEFT JOIN impact.redox_event re ON s.site_id = re.site_id
                GROUP BY s.code
                ORDER BY s.code
            """
            latest_df = db.execute_query(latest_per_site_query)
            latest_records = []
            if not latest_df.empty:
                for _, row in latest_df.iterrows():
                    site_code = row.get('site_code')
                    lwq = row.get('last_water_quality')
                    lrx = row.get('last_redox')
                    latest_records.append({
                        'site_code': None if pd.isna(site_code) else str(site_code),
                        'last_water_quality': None if pd.isna(lwq) else lwq.isoformat() if hasattr(lwq, 'isoformat') else str(lwq),
                        'last_redox': None if pd.isna(lrx) else lrx.isoformat() if hasattr(lrx, 'isoformat') else str(lrx),
                    })
            dashboard_data['latest_per_site'] = latest_records
        except Exception as e:
            logger.warning(f"Could not compute latest per site records: {e}")
            dashboard_data['latest_per_site'] = []

        metadata = {
            'last_updated': datetime.now().isoformat(),
            'record_count': int(len(dashboard_data.get('recent_activity', []))),
            'performance': {'loading_time_ms': 50.0},
            'has_data': True
        }

        response_data = {
            'dashboard_data': dashboard_data,
            'metadata': metadata
        }
        logger.info("Successfully prepared home data API response.")
        
        # Use custom encoder to handle numpy types
        from flask import Response
        json_str = json.dumps(response_data, cls=NumpyEncoder, ensure_ascii=False)
        return Response(json_str, mimetype='application/json'), 200
    except Exception as e:
        logger.error(f"Error in get_home_data API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve home data', 'details': str(e)}), 500
