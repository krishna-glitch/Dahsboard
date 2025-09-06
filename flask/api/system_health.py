from flask import Blueprint, jsonify, request
from flask_login import login_required
from utils.decorators import role_required
from utils.errors import APIError
import logging

from utils.unified_error_handler import UnifiedErrorHandler
from config.database import db

# Import comprehensive performance optimization
from utils.advanced_performance_integration_simple import enterprise_performance

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

system_health_bp = Blueprint('system_health_bp', __name__)
error_handler = UnifiedErrorHandler()

@system_health_bp.route('/summary', methods=['GET'])
@login_required
@role_required(['admin', 'analyst'])
@enterprise_performance(data_type='system_health')
def get_system_health_summary_api():
    logger.info("Received request for system health summary API.")
    try:
        health = error_handler.get_system_health()
        
        summary = {
            'health_score': health['health_score'],
            'status': health['status'],
            'failed_imports': health['failed_imports'],
            'available_services': health['available_services'],
            'total_services': health['total_services']
        }
        logger.info("Successfully retrieved system health summary.")
        return jsonify(summary), 200
    except Exception as e:
        logger.error(f"Error in get_system_health_summary API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve system health summary', 'details': str(e)}), 500

@system_health_bp.route('/services', methods=['GET'])
@login_required
@role_required(['admin', 'analyst'])
def get_service_status():
    logger.info("Received request for service status API.")
    try:
        health = error_handler.get_system_health()
        service_status = health['details']['service_status']
        logger.info("Successfully retrieved service status.")
        return jsonify(service_status), 200
    except Exception as e:
        logger.error(f"Error in get_service_status API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve service status', 'details': str(e)}), 500

@system_health_bp.route('/imports', methods=['GET'])
@login_required
@role_required(['admin', 'analyst'])
def get_import_status():
    logger.info("Received request for import status API.")
    try:
        health = error_handler.get_system_health()
        failed_imports = health['details']['failed_imports']
        logger.info("Successfully retrieved import status.")
        return jsonify(failed_imports), 200
    except Exception as e:
        logger.error(f"Error in get_import_status API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve import status', 'details': str(e)}), 500

@system_health_bp.route('/recommendations', methods=['GET'])
@login_required
@role_required(['admin', 'analyst'])
def get_system_recommendations():
    logger.info("Received request for system recommendations API.")
    try:
        recommendations = error_handler.get_error_summary().get('recommendations', [])
        logger.info("Successfully retrieved system recommendations.")
        return jsonify(recommendations), 200
    except Exception as e:
        logger.error(f"Error in get_system_recommendations API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve system recommendations', 'details': str(e)}), 500


@system_health_bp.route('/data-volume', methods=['GET'])
@login_required
@role_required(['admin', 'analyst'])
@enterprise_performance(data_type='data_volume')
def get_data_volume():
    """Return record counts by month and year for key data tables."""
    try:
        schema = db.connection_params.get('schema', 'public')

        def query_monthly(table: str):
            sql = f"""
                SELECT DATE_TRUNC('month', measurement_timestamp)::date AS month,
                       COUNT(*)::bigint AS row_count
                FROM {schema}.{table}
                GROUP BY 1
                ORDER BY 1 DESC
                LIMIT 36
            """
            return db.execute_query(sql)

        def query_yearly(table: str):
            sql = f"""
                SELECT DATE_TRUNC('year', measurement_timestamp)::date AS year,
                       COUNT(*)::bigint AS row_count
                FROM {schema}.{table}
                GROUP BY 1
                ORDER BY 1 DESC
                LIMIT 15
            """
            return db.execute_query(sql)

        def query_total(table: str):
            sql = f"SELECT COUNT(*)::bigint AS total_count FROM {schema}.{table}"
            df = db.execute_query(sql)
            return int(df.iloc[0, 0]) if not df.empty else 0

        def serialize_rows(df, key):
            if df.empty:
                return []
            out = []
            for _, row in df.iterrows():
                val = row[key]
                # Convert date/timestamp to ISO YYYY-MM or YYYY
                if key == 'month':
                    label = str(val)[:7]  # YYYY-MM
                else:
                    label = str(val)[:4]  # YYYY
                out.append({key: label, 'count': int(row['row_count'])})
            return out

        def build_payload(table: str):
            monthly = query_monthly(table)
            yearly = query_yearly(table)
            total = query_total(table)
            return {
                'total': total,
                'by_month': serialize_rows(monthly, 'month'),
                'by_year': serialize_rows(yearly, 'year')
            }

        payload = {
            'water_quality': build_payload('water_quality'),
            'redox_event': build_payload('redox_event'),
        }

        return jsonify(payload), 200

    except Exception as e:
        logger.error(f"Error in get_data_volume: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve data volume', 'details': str(e)}), 500
