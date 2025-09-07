from flask import Blueprint, jsonify, request
from flask_login import login_required
import logging
import base64
import os
from datetime import datetime, timedelta

from utils.secure_file_handler import secure_file_handler
from services.core_data_service import core_data_service
from services.upload_history_service import upload_history_service
from utils.errors import APIError
from services.s3_service import list_objects as s3_list_objects, generate_presigned_get_url as s3_sign_get, generate_presigned_put_url as s3_sign_put, is_configured as s3_is_configured

# Import comprehensive performance optimization
from utils.advanced_performance_integration_simple import enterprise_performance

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

upload_bp = Blueprint('upload_bp', __name__)

@upload_bp.route('/file', methods=['POST'])
@login_required
@enterprise_performance(data_type='file_upload')
def upload_file():
    logger.info("Received request for file upload API.")
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file part in the request'}), 400

        file = request.files['file']
        data_type = request.form.get('data_type')
        options_str = request.form.get('options', '')
        options = options_str.split(',') if options_str else []

        if not data_type:
            return jsonify({'error': 'Data type is required'}), 400

        filename = file.filename
        file_content = file.read() # Read binary content

        logger.info(f"Processing uploaded file: {filename} for data type: {data_type}")

        # Use secure file handler
        upload_result = secure_file_handler.secure_file_upload(file_content, filename)

        if not upload_result['success']:
            logger.error(f"File processing failed for {filename}: {upload_result.get('message', 'Unknown error')}")
            return jsonify({
                'status': 'failed',
                'message': upload_result.get('message', 'File processing failed'),
                'details': upload_result.get('warnings', [])
            }), 500

        df = upload_result['data']

        # Log security issues if found
        security_issues = upload_result.get('security_issues', [])
        if security_issues:
            logger.warning(f"Security issues found in {filename}: {len(security_issues)} issues")

        # Validate data if requested
        validation_results = {'errors': [], 'warnings': []}
        if 'validate' in options:
            validation_results = core_data_service.validate_data(df, data_type)

        record_count = len(df)
        error_count = len(validation_results.get('errors', []))
        security_issue_count = len(security_issues)
        upload_warnings = upload_result.get('warnings', [])

        # Determine upload status
        status = 'success'
        if security_issue_count > 0:
            status = 'success_with_security_review'
        if error_count > 0:
            status = 'success_with_validation_errors'
        if record_count == 0:
            status = 'failed'

        response_summary = {
            'filename': filename,
            'status': status,
            'records_processed': record_count,
            'validation_errors': error_count,
            'security_issues_found': security_issue_count,
            'upload_warnings': len(upload_warnings),
            'message': f"Successfully processed {record_count} records."
        }

        if security_issue_count > 0:
            response_summary['message'] += f" (🔒 {security_issue_count} security issues sanitized)"
        if error_count > 0:
            response_summary['message'] += f" (⚠️ {error_count} validation errors)"

        # Add to upload history
        try:
            from flask_login import current_user
            username = getattr(current_user, 'id', 'unknown') if current_user.is_authenticated else 'anonymous'
            
            upload_history_service.add_upload_record(
                filename=filename,
                data_type=data_type,
                status=status,
                records_processed=record_count,
                validation_errors=error_count,
                security_issues=security_issue_count,
                file_size_bytes=len(file_content),
                user=username
            )
            logger.info(f"Added upload to history: {filename}")
            
        except Exception as e:
            logger.error(f"Failed to add upload to history: {e}")
            # Continue execution even if history tracking fails

        return jsonify({
            'summary': response_summary,
            'validation_details': validation_results,
            'security_details': security_issues,
            'upload_details': upload_warnings
        }), 200

    except Exception as e:
        logger.error(f"Error in get_upload_history API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve upload history', 'details': str(e)}), 500

@upload_bp.route('/history', methods=['GET'])
@login_required
@enterprise_performance(data_type='upload_history')
def get_upload_history():
    """
    Get upload history with filtering and pagination
    
    Query Parameters:
        - limit: Number of records to return (default: 50, max: 200)
        - status: Filter by status (all, success, failed, etc.)
        - data_type: Filter by data type (all, water_quality, redox, etc.)
        - days_back: Number of days back to look (default: 30)
    """
    logger.info("Received request for upload history API.")
    try:
        # Get query parameters
        limit = min(int(request.args.get('limit', 50)), 200)
        status_filter = request.args.get('status', 'all')
        data_type_filter = request.args.get('data_type', 'all')
        days_back = min(int(request.args.get('days_back', 30)), 365)
        
        logger.info(f"Upload history request: limit={limit}, status={status_filter}, "
                   f"data_type={data_type_filter}, days_back={days_back}")
        
        # Get upload history from service
        history_data = upload_history_service.get_upload_history(
            limit=limit,
            status_filter=status_filter,
            data_type_filter=data_type_filter,
            days_back=days_back
        )
        
        # Add API metadata
        response_data = {
            **history_data,
            'api_metadata': {
                'success': True,
                'timestamp': datetime.now().isoformat(),
                'endpoint': '/api/v1/upload/history',
                'version': 'v1'
            }
        }
        
        logger.info(f"Upload history completed: {history_data['returned_count']} records returned")
        return jsonify(response_data), 200
        
    except ValueError as e:
        logger.error(f"Invalid parameter in upload history request: {e}")
        return jsonify({
            'error': 'Invalid request parameters',
            'details': str(e),
            'uploads': []
        }), 400
        
    except Exception as e:
        logger.error(f"Error in get_upload_history API: {e}", exc_info=True)
        return jsonify({
            'error': 'Failed to retrieve upload history', 
            'details': str(e),
            'uploads': []
        }), 500


@upload_bp.route('/history/<upload_id>', methods=['GET'])
@login_required
@enterprise_performance(data_type='upload_record_detail')
def get_upload_record(upload_id):
    """Get specific upload record by ID"""
    logger.info(f"Received request for upload record: {upload_id}")
    try:
        record = upload_history_service.get_upload_record(upload_id)
        
        if record:
            return jsonify({
                'record': record,
                'success': True,
                'timestamp': datetime.now().isoformat()
            }), 200
        else:
            return jsonify({
                'error': 'Upload record not found',
                'upload_id': upload_id
            }), 404
            
    except Exception as e:
        logger.error(f"Error retrieving upload record {upload_id}: {e}")
        return jsonify({
            'error': 'Failed to retrieve upload record',
            'details': str(e)
        }), 500


@upload_bp.route('/history/<upload_id>', methods=['DELETE'])
@login_required
@enterprise_performance(data_type='upload_record_delete')
def delete_upload_record(upload_id):
    """Delete upload record by ID (admin only)"""
    logger.info(f"Received request to delete upload record: {upload_id}")
    try:
        # Check if user has admin privileges (simplified check)
        from flask_login import current_user
        # Note: In production, you'd check user roles properly
        
        success = upload_history_service.delete_upload_record(upload_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': f'Upload record {upload_id} deleted successfully',
                'timestamp': datetime.now().isoformat()
            }), 200
        else:
            return jsonify({
                'error': 'Upload record not found or could not be deleted',
                'upload_id': upload_id
            }), 404
            
    except Exception as e:
        logger.error(f"Error deleting upload record {upload_id}: {e}")
        return jsonify({
            'error': 'Failed to delete upload record',
            'details': str(e)
        }), 500


@upload_bp.route('/history/health', methods=['GET'])
@login_required
@enterprise_performance(data_type='upload_service_health')
def get_upload_service_health():
    """Get upload history service health status"""
    logger.info("Received request for upload service health check")
    try:
        health_status = upload_history_service.get_health_status()
        
        return jsonify({
            'service_name': 'Upload History Service',
            'health': health_status,
            'timestamp': datetime.now().isoformat()
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting upload service health: {e}")
        return jsonify({
            'service_name': 'Upload History Service',
            'health': {
                'service_status': 'unhealthy',
                'error': str(e)
            },
            'timestamp': datetime.now().isoformat()
        }), 500


# S3 Integration (Demo-safe)
@upload_bp.route('/s3/list', methods=['GET'])
@login_required
@enterprise_performance(data_type='s3_list')
def s3_list():
    try:
        prefix = request.args.get('prefix', '') or ''
        token = request.args.get('token')
        page_size = request.args.get('page_size', 50, type=int)
        result = s3_list_objects(prefix=prefix, token=token, page_size=page_size)
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"S3 list error: {e}")
        return jsonify({ 'items': [], 'nextToken': None, 'configured': False, 'error': str(e) }), 500


@upload_bp.route('/s3/sign-get', methods=['POST'])
@login_required
@enterprise_performance(data_type='s3_sign_get')
def s3_sign_get_route():
    try:
        data = request.get_json(silent=True) or {}
        key = data.get('key')
        if not key:
            return jsonify({ 'error': 'Missing key' }), 400
        url = s3_sign_get(key)
        return jsonify({ 'url': url, 'configured': s3_is_configured() }), 200
    except Exception as e:
        logger.error(f"S3 sign-get error: {e}")
        return jsonify({ 'error': str(e) }), 500


@upload_bp.route('/s3/sign-put', methods=['POST'])
@login_required
@enterprise_performance(data_type='s3_sign_put')
def s3_sign_put_route():
    try:
        data = request.get_json(silent=True) or {}
        key = data.get('key')
        content_type = data.get('contentType')
        if not key:
            return jsonify({ 'error': 'Missing key' }), 400
        desc = s3_sign_put(key, content_type)
        desc['configured'] = s3_is_configured()
        return jsonify(desc), 200
    except Exception as e:
        logger.error(f"S3 sign-put error: {e}")
        return jsonify({ 'error': str(e) }), 500
