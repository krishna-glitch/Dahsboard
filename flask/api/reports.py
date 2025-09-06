from flask import Blueprint, jsonify, request
from flask_login import login_required
import logging
import time
from datetime import datetime

from services.reporting_engine import reporting_engine
from services.consolidated_cache_service import cached # New import for caching
from services.core_data_service import core_data_service, DataQuery, DataType

# Import comprehensive performance optimization
from utils.advanced_performance_integration_simple import enterprise_performance

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

reports_bp = Blueprint('reports_bp', __name__)

@reports_bp.route('/history', methods=['GET'])
@login_required
@enterprise_performance(data_type='reports_history')
def get_report_history():
    logger.info("Received request for report history API.")
    try:
        limit = request.args.get('limit', type=int, default=20)
        history = reporting_engine.get_report_history(limit=limit)
        
        # Convert datetime objects to string for JSON serialization
        for report in history:
            if 'generated_at' in report and isinstance(report['generated_at'], datetime):
                report['generated_at'] = report['generated_at'].isoformat()
            if 'start_date' in report and isinstance(report['start_date'], datetime):
                report['start_date'] = report['start_date'].isoformat()
            if 'end_date' in report and isinstance(report['end_date'], datetime):
                report['end_date'] = report['end_date'].isoformat()

        logger.info(f"Successfully retrieved {len(history)} report history records.")
        return jsonify(history), 200
    except Exception as e:
        logger.error(f"Error in get_report_history API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve report history', 'details': str(e)}), 500

@reports_bp.route('/templates', methods=['GET'])
@login_required
def get_report_templates():
    logger.info("📋 Received request for enhanced report templates API.")
    try:
        templates = reporting_engine.get_available_templates()
        # Convert dict to list of dicts for easier JSON serialization
        templates_list = [{"id": k, **v} for k, v in templates.items()]
        
        # Add capabilities info
        response = {
            'templates': templates_list,
            'capabilities': {
                'formats_supported': ['pdf', 'excel', 'csv'],
                'analytics_available': ['statistical', 'correlation', 'trend'],
                'pdf_generation': reporting_engine.logger is not None,  # Simple check
                'excel_generation': True,  # Always available with pandas
                'total_templates': len(templates_list)
            }
        }
        
        logger.info(f"✅ Successfully retrieved {len(templates_list)} enhanced report templates.")
        return jsonify(response), 200
    except Exception as e:
        logger.error(f"❌ Error in get_report_templates API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve report templates', 'details': str(e)}), 500

@reports_bp.route('/generate', methods=['POST'])
@login_required
@enterprise_performance(data_type='report_generation')
def generate_report():
    logger.info("📊 Received request for enhanced report generation API.")
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400

        report_type = data.get('report_type')
        start_date_str = data.get('start_date')
        end_date_str = data.get('end_date')
        sites = data.get('sites', ['S1', 'S2'])
        format_type = data.get('format_type', 'pdf')
        options = data.get('options', {})

        if not all([report_type, start_date_str, end_date_str]):
            return jsonify({'error': 'Missing required parameters: report_type, start_date, end_date'}), 400

        # Parse dates
        try:
            start_dt = datetime.fromisoformat(start_date_str.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))
        except ValueError as ve:
            return jsonify({'error': f'Invalid date format: {ve}'}), 400

        # Handle site selection
        selected_sites = sites
        if isinstance(sites, list) and 'all' not in sites:
            selected_sites = [s for s in sites if s != 'all']
        elif sites == 'all' or (isinstance(sites, list) and 'all' in sites):
            selected_sites = ['S1', 'S2', 'S3', 'S4']  # Default sites

        logger.info(f"🔍 Fetching data for report: {report_type} ({start_dt} to {end_dt})")
        
        # Fetch data for the report
        query = DataQuery(
            sites=selected_sites,
            start_date=start_dt,
            end_date=end_dt,
            data_type=DataType.WATER_QUALITY
        )
        
        # Get data from core data service
        data_result = core_data_service.get_unified_data(query)
        
        if not data_result.success:
            return jsonify({
                'error': 'Failed to fetch data for report', 
                'details': data_result.error_message
            }), 500

        if data_result.record_count == 0:
            return jsonify({
                'error': 'No data available for the specified date range and sites'
            }), 400

        # Convert to pandas if needed
        df = data_result.to_pandas()
        logger.info(f"📈 Using {len(df)} data points for report generation")

        # Generate report with analytics
        result = reporting_engine.generate_report(
            report_type=report_type,
            data=df,
            start_date=start_dt,
            end_date=end_dt,
            sites=selected_sites,
            format_type=format_type,
            options=options
        )

        if result['success']:
            logger.info(f"✅ Report {result['report_metadata']['report_id']} generated successfully.")
            return jsonify(result), 200
        else:
            logger.error(f"❌ Report generation failed: {result['error']}")
            return jsonify({'error': 'Report generation failed', 'details': result['error']}), 500

    except Exception as e:
        logger.error(f"❌ Error in generate_report API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to generate report', 'details': str(e)}), 500

@reports_bp.route('/scheduled', methods=['GET'])
@login_required
def get_scheduled_reports():
    logger.info("Received request for scheduled reports API.")
    try:
        scheduled_reports = reporting_engine.get_scheduled_reports()
        # Convert datetime objects to string for JSON serialization
        for report in scheduled_reports:
            if 'last_run' in report and isinstance(report['last_run'], datetime):
                report['last_run'] = report['last_run'].isoformat()
        logger.info(f"Successfully retrieved {len(scheduled_reports)} scheduled reports.")
        return jsonify(scheduled_reports), 200
    except Exception as e:
        logger.error(f"Error in get_scheduled_reports API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve scheduled reports', 'details': str(e)}), 500

@reports_bp.route('/scheduled', methods=['POST'])
@login_required
def add_scheduled_report():
    logger.info("Received request to add scheduled report.")
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400

        # Assuming reporting_engine.add_scheduled_report handles validation and saving
        report_id = reporting_engine.add_scheduled_report(data)
        logger.info(f"Scheduled report added with ID: {report_id}")
        return jsonify({'message': 'Scheduled report added successfully', 'id': report_id}), 201
    except Exception as e:
        logger.error(f"Error in add_scheduled_report API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to add scheduled report', 'details': str(e)}), 500

@reports_bp.route('/scheduled/<report_id>', methods=['PUT'])
@login_required
def update_scheduled_report(report_id):
    logger.info(f"Received request to update scheduled report {report_id}.")
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400

        success = reporting_engine.update_scheduled_report(report_id, data)
        if success:
            logger.info(f"Scheduled report {report_id} updated successfully.")
            return jsonify({'message': 'Scheduled report updated successfully'}), 200
        else:
            return jsonify({'error': 'Scheduled report not found or update failed'}), 404
    except Exception as e:
        logger.error(f"Error in update_scheduled_report API for {report_id}: {e}", exc_info=True)
        return jsonify({'error': 'Failed to update scheduled report', 'details': str(e)}), 500

@reports_bp.route('/scheduled/<report_id>', methods=['DELETE'])
@login_required
def delete_scheduled_report(report_id):
    logger.info(f"Received request to delete scheduled report {report_id}.")
    try:
        success = reporting_engine.delete_scheduled_report(report_id)
        if success:
            logger.info(f"Scheduled report {report_id} deleted successfully.")
            return jsonify({'message': 'Scheduled report deleted successfully'}), 200
        else:
            return jsonify({'error': 'Scheduled report not found or delete failed'}), 404
    except Exception as e:
        logger.error(f"Error in delete_scheduled_report API for {report_id}: {e}", exc_info=True)
        return jsonify({'error': 'Failed to delete scheduled report', 'details': str(e)}), 500
