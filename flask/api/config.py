from flask import Blueprint, jsonify
from flask_login import login_required
from utils.decorators import role_required
from utils.errors import APIError
import logging

from services.config_service import config_service

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

config_bp = Blueprint('config_bp', __name__)

@config_bp.route('/all', methods=['GET'])
@login_required
@role_required(['admin', 'analyst', 'operator', 'viewer'])
def get_all_config():
    logger.info("Received request for all config API.")
    try:
        all_config = config_service.get_all_config()
        logger.info("Successfully retrieved all config.")
        return jsonify(all_config), 200
    except Exception as e:
        logger.error(f"Error in get_all_config API: {e}", exc_info=True)
        raise APIError('Failed to retrieve configuration', status_code=500, payload={'details': str(e)})


@config_bp.route('/time-ranges', methods=['GET'])
# @login_required  # Temporarily disabled for testing
def get_time_ranges():
    """Expose time range options for frontend to avoid drift"""
    try:
        return jsonify({'time_ranges': config_service.get_time_ranges()}), 200
    except Exception as e:
        logger.error(f"Error in get_time_ranges API: {e}")
        return jsonify({'error': 'Failed to retrieve time ranges'}), 500


@config_bp.route('/redox-settings', methods=['GET'])
def get_redox_settings():
    """Expose redox visualization defaults (resolution, chunking, max depths)"""
    try:
        return jsonify(config_service.get_redox_settings()), 200
    except Exception as e:
        logger.error(f"Error in get_redox_settings API: {e}")
        return jsonify({'error': 'Failed to retrieve redox settings'}), 500
