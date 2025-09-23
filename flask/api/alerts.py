from flask import Blueprint, jsonify, request
from flask_login import login_required
import logging
import time
from datetime import datetime, timedelta

from services.alert_engine import alert_engine, AlertSeverity, AlertStatus, AlertType
from services.config_service import config_service

# Import comprehensive performance optimization
from utils.advanced_performance_integration_simple import enterprise_performance

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

alerts_bp = Blueprint('alerts_bp', __name__)

@alerts_bp.route('/data', methods=['GET'])
# @login_required  # Temporarily disabled for testing
@enterprise_performance(data_type='alerts')
def get_alerts_data():
    start_time = time.time()
    logger.info(f"[ALERTS DEBUG] API data loading triggered.")

    # Parse site parameters using centralized utility
    from utils.request_parsing import parse_sites_parameter
    selected_sites = parse_sites_parameter(['S1', 'S2'])
    time_range = request.args.get('time_range', 'Last 7 Days')
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')

    start_date = datetime.fromisoformat(start_date_str) if start_date_str else None
    end_date = datetime.fromisoformat(end_date_str) if end_date_str else None

    logger.info(f"   Selected sites: {selected_sites}")
    logger.info(f"   Time range: {time_range}")
    logger.info(f"   Custom dates: {start_date} to {end_date}")

    try:
        # Improved time range conversion with comprehensive support
        days_back = 7  # Default
        actual_start_date = None
        actual_end_date = None
        
        # Use dynamic database date service
        from services.database_date_service import database_date_service
        db_latest_date = database_date_service.get_database_latest_date()

        # Handle comprehensive time range options
        if time_range == 'Last 24 Hours' or time_range == 'Today':
            days_back = 1
            actual_start_date = db_latest_date - timedelta(days=1)
        elif time_range == 'Last 7 Days':
            days_back = 7
            actual_start_date = db_latest_date - timedelta(days=7)
        elif time_range == 'Last 30 Days':
            days_back = 30
            actual_start_date = db_latest_date - timedelta(days=30)
        elif time_range == 'Last 90 Days':
            days_back = 90
            actual_start_date = db_latest_date - timedelta(days=90)
        elif time_range == 'Last 6 Months':
            days_back = 180
            actual_start_date = db_latest_date - timedelta(days=180)
        elif time_range == 'Last Year':
            days_back = 365
            actual_start_date = db_latest_date - timedelta(days=365)
        elif time_range == 'Custom Range' and start_date and end_date:
            days_back = (end_date - start_date).days
            actual_start_date = start_date
            actual_end_date = end_date
        else:
            # Default fallback
            actual_start_date = db_latest_date - timedelta(days=days_back)
        
        if actual_end_date is None:
            # Use dynamic database date
            actual_end_date = db_latest_date
            
        logger.info(f"Using date range: {actual_start_date} to {actual_end_date} ({days_back} days)")

        # Load alert data with proper date filtering and efficient site filtering
        stats = alert_engine.get_alert_statistics(
            start_date=actual_start_date,
            end_date=actual_end_date,
            sites=selected_sites if selected_sites and 'all' not in selected_sites else None
        )
        
        active_alerts = alert_engine.get_active_alerts(
            start_date=actual_start_date,
            end_date=actual_end_date,
            sites=selected_sites if selected_sites and 'all' not in selected_sites else None
        )

        # Calculate performance metrics
        loading_time_ms = (time.time() - start_time) * 1000

        # Calculate additional metrics for enhanced dashboard
        warning_count = len([a for a in active_alerts if a.get('severity') == 'high'])
        medium_count = len([a for a in active_alerts if a.get('severity') == 'medium'])
        low_count = len([a for a in active_alerts if a.get('severity') == 'low'])
        resolved_count = stats.get('resolved_alerts', 0)
        
        # Return comprehensive alert data structure
        structured_data = {
            'stats': stats,
            'active_alerts': active_alerts,
            'alerts_data': active_alerts,  # For compatibility
            'summary_metrics': {
                'active_count': len(active_alerts),
                'critical_count': len([a for a in active_alerts if a.get('severity') == 'critical']),
                'warning_count': warning_count,
                'medium_count': medium_count,
                'low_count': low_count,
                'resolved_today': resolved_count,
                'total_in_period': len(active_alerts) + resolved_count
            },
            'metadata': {
                'last_updated': datetime.now().isoformat(),
                'sites': selected_sites or ['all'],
                'time_range': time_range or 'Last 7 Days',
                'date_range': {
                    'start': actual_start_date.isoformat() if actual_start_date else None,
                    'end': actual_end_date.isoformat() if actual_end_date else None,
                    'days': days_back
                },
                'alert_count': len(active_alerts),
                'critical_count': len([a for a in active_alerts if a.get('severity') == 'critical']),
                'total_records': len(active_alerts),
                'has_data': len(active_alerts) > 0,
                'filtering': {
                    'sites_applied': selected_sites if selected_sites and 'all' not in selected_sites else [],
                    'date_filtering_applied': True,
                    'efficient_filtering': True
                },
                'performance': {
                    'loading_time_ms': round(loading_time_ms, 2),
                    'optimization_tier': 'enhanced'
                }
            }
        }
        logger.info(f"[ALERTS DEBUG] SUCCESS: Loaded {len(active_alerts)} alerts in {loading_time_ms:.1f}ms")
        return jsonify(structured_data), 200
    except Exception as e:
        logger.error(f"[ALERTS DEBUG] ERROR: Failed to load alerts data: {e}")
        import traceback
        logger.error(f"[ALERTS DEBUG] Traceback: {traceback.format_exc()}")
        return jsonify({
            'stats': {
                'total_alerts': 0,
                'resolution_rate': 0,
                'severity_breakdown': {},
                'site_breakdown': {},
                'alerts_per_day': 0
            },
            'active_alerts': [],
            'alerts_data': [],
            'error': str(e),
            'metadata': {
                'last_updated': datetime.now().isoformat(),
                'sites': selected_sites,
                'time_range': time_range,
                'error_occurred': True,
                'alert_count': 0,
                'has_data': False,
                'performance': {
                    'loading_time_ms': 0
                }
            }
        }), 500


@alerts_bp.route('/active', methods=['GET'])
# @login_required
def get_active_alerts_data():
    logger.info("Received request for active alerts data API.")
    try:
        # Mock data for active alerts
        active_alerts = [
            {
                "id": "alert_123",
                "type": "High Temperature",
                "severity": "critical",
                "message": "Temperature in S1 exceeded critical threshold (35°C)",
                "timestamp": "2025-09-09T10:30:00Z",
                "site": "S1",
                "parameter": "temperature_c"
            },
            {
                "id": "alert_124",
                "type": "Low pH",
                "severity": "high",
                "message": "pH level in S2 dropped below critical threshold (6.0)",
                "timestamp": "2025-09-09T11:00:00Z",
                "site": "S2",
                "parameter": "ph"
            },
            {
                "id": "alert_125",
                "type": "Sensor Offline",
                "severity": "medium",
                "message": "Sensor 'Flow_01' in S1 is offline for 30 minutes",
                "timestamp": "2025-09-09T09:45:00Z",
                "site": "S1",
                "parameter": "sensor_status"
            }
        ]
        logger.info("Successfully retrieved mock active alerts data.")
        return jsonify({"alerts": active_alerts}), 200
    except Exception as e:
        logger.error(f"Error in get_active_alerts_data API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve active alerts data', 'details': str(e)}), 500

@alerts_bp.route('/acknowledge', methods=['POST'])
@login_required
def acknowledge_alert():
    """Acknowledge an alert"""
    try:
        data = request.get_json()
        alert_id = data.get('alert_id')
        acknowledged_by = data.get('acknowledged_by', 'Unknown User')
        
        if not alert_id:
            return jsonify({'error': 'Alert ID is required'}), 400
            
        success = alert_engine.acknowledge_alert(alert_id, acknowledged_by)
        
        if success:
            return jsonify({
                'message': 'Alert acknowledged successfully',
                'alert_id': alert_id,
                'acknowledged_by': acknowledged_by,
                'acknowledged_at': datetime.now().isoformat()
            }), 200
        else:
            return jsonify({'error': 'Alert not found or already processed'}), 404
            
    except Exception as e:
        logger.error(f"Error acknowledging alert: {e}")
        return jsonify({'error': str(e)}), 500

@alerts_bp.route('/resolve', methods=['POST'])
@login_required
def resolve_alert():
    """Resolve an alert"""
    try:
        data = request.get_json()
        alert_id = data.get('alert_id')
        resolved_by = data.get('resolved_by', 'Unknown User')
        resolution_note = data.get('resolution_note', '')
        
        if not alert_id:
            return jsonify({'error': 'Alert ID is required'}), 400
            
        success = alert_engine.resolve_alert(alert_id, resolved_by, resolution_note)
        
        if success:
            return jsonify({
                'message': 'Alert resolved successfully',
                'alert_id': alert_id,
                'resolved_by': resolved_by,
                'resolved_at': datetime.now().isoformat(),
                'resolution_note': resolution_note
            }), 200
        else:
            return jsonify({'error': 'Alert not found or already processed'}), 404
            
    except Exception as e:
        logger.error(f"Error resolving alert: {e}")
        return jsonify({'error': str(e)}), 500

@alerts_bp.route('/rules', methods=['GET'])
@login_required
def get_alert_rules():
    """Get alert rules configuration"""
    try:
        rules = []
        for rule in alert_engine.alert_rules:
            rules.append({
                'parameter': rule.parameter,
                'site_code': rule.site_code,
                'threshold_min': rule.threshold_min,
                'threshold_max': rule.threshold_max,
                'severity': rule.severity.value,
                'enabled': rule.enabled
            })
            
        return jsonify({
            'rules': rules,
            'total_rules': len(rules),
            'enabled_rules': len([r for r in alert_engine.alert_rules if r.enabled])
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting alert rules: {e}")
        return jsonify({'error': str(e)}), 500
