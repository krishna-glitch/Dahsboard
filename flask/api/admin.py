from flask import Blueprint, jsonify, request
from flask_login import login_required
from utils.decorators import role_required
from utils.errors import APIError
import logging
from datetime import datetime, timedelta

from services.user_management import user_manager

# Import comprehensive performance optimization
from utils.advanced_performance_integration_simple import enterprise_performance

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

admin_bp = Blueprint('admin_bp', __name__)

@admin_bp.route('/users', methods=['GET'])
@login_required
@role_required(['admin'])
@enterprise_performance(data_type='admin_users')
def get_user_list():
    logger.info("Received request for user list API.")
    try:
        role_filter = request.args.get('role', 'all')
        status_filter = request.args.get('status', 'active')

        include_inactive = status_filter in ['all', 'inactive']
        user_list = user_manager.get_user_list(include_inactive=include_inactive)

        # Apply filters
        if role_filter != "all":
            user_list = [u for u in user_list if u['role'] == role_filter]

        if status_filter == "inactive":
            user_list = [u for u in user_list if not u['is_active']]
        elif status_filter == "active":
            user_list = [u for u in user_list if u['is_active']]

        # Convert datetime objects to string for JSON serialization
        for user in user_list:
            if 'last_login' in user and isinstance(user['last_login'], datetime):
                user['last_login'] = user['last_login'].isoformat()

        logger.info(f"Successfully retrieved {len(user_list)} users.")
        return jsonify(user_list), 200
    except Exception as e:
        logger.error(f"Error in get_user_list API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve user list', 'details': str(e)}), 500

@admin_bp.route('/users', methods=['POST'])
def create_user():
    logger.info("Received request for create user API.")
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400

        username = data.get('username')
        password = data.get('password')
        full_name = data.get('full_name')
        email = data.get('email')
        role = data.get('role')
        sites_access = data.get('sites_access')

        if not all([username, password, full_name, email, role]):
            return jsonify({'error': 'Missing required user details'}), 400

        user_id = user_manager.create_user(username, password, full_name, email, role, sites_access)

        logger.info(f"User {username} created successfully with ID: {user_id}")
        return jsonify({'message': 'User created successfully', 'user_id': user_id}), 201
    except Exception as e:
        logger.error(f"Error in create_user API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to create user', 'details': str(e)}), 500

@admin_bp.route('/users/<username>', methods=['PUT'])
def update_user(username):
    logger.info(f"Received request for update user API for {username}.")
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400

        # Only update fields that are provided in the request body
        updated_fields = {}
        if 'full_name' in data: updated_fields['full_name'] = data['full_name']
        if 'email' in data: updated_fields['email'] = data['email']
        if 'role' in data: updated_fields['role'] = data['role']
        if 'sites_access' in data: updated_fields['sites_access'] = data['sites_access']
        if 'is_active' in data: updated_fields['is_active'] = data['is_active']
        if 'password' in data: updated_fields['password'] = data['password'] # Handle password hashing in user_manager

        if not updated_fields:
            return jsonify({'message': 'No fields to update'}), 200

        success = user_manager.update_user(username, **updated_fields)

        if success:
            logger.info(f"User {username} updated successfully.")
            return jsonify({'message': 'User updated successfully'}), 200
        else:
            logger.warning(f"User {username} not found or no changes applied.")
            return jsonify({'error': 'User not found or update failed'}), 404

    except Exception as e:
        logger.error(f"Error in update_user API for {username}: {e}", exc_info=True)
        return jsonify({'error': 'Failed to update user', 'details': str(e)}), 500

@admin_bp.route('/users/<username>/toggle_status', methods=['POST'])
def toggle_user_status(username):
    logger.info(f"Received request to toggle status for user {username}.")
    try:
        success = user_manager.toggle_user_status(username)
        if success:
            logger.info(f"User {username} status toggled successfully.")
            return jsonify({'message': 'User status toggled successfully'}), 200
        else:
            logger.warning(f"User {username} not found or status toggle failed.")
            return jsonify({'error': 'User not found or status toggle failed'}), 404
    except Exception as e:
        logger.error(f"Error in toggle_user_status API for {username}: {e}", exc_info=True)
        return jsonify({'error': 'Failed to toggle user status', 'details': str(e)}), 500

@admin_bp.route('/summary', methods=['GET'])
@login_required
@role_required(['admin'])
@enterprise_performance(data_type='admin_summary')
def get_admin_summary():
    logger.info("Received request for admin summary API.")
    try:
        session_stats = user_manager.get_session_statistics()
        user_list = user_manager.get_user_list(include_inactive=True)

        total_users = len(user_list)
        active_users = len([u for u in user_list if u['is_active']])
        active_sessions = session_stats['active_sessions']

        # Recent activity count (last 24 hours)
        activity_log = user_manager.get_user_activity_log(limit=1000)
        recent_activity = len([
            a for a in activity_log
            if a['timestamp'] > datetime.now() - timedelta(hours=24)
        ])

        summary = {
            'total_users': total_users,
            'active_users': active_users,
            'active_sessions': active_sessions,
            'recent_activity_count': recent_activity
        }
        logger.info("Successfully retrieved admin summary.")
        return jsonify(summary), 200
    except Exception as e:
        logger.error(f"Error in get_admin_summary API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve admin summary', 'details': str(e)}), 500

@admin_bp.route('/sessions', methods=['GET'])
@login_required
def get_session_statistics():
    logger.info("Received request for session statistics API.")
    try:
        stats = user_manager.get_session_statistics()
        logger.info("Successfully retrieved session statistics.")
        return jsonify(stats), 200
    except Exception as e:
        logger.error(f"Error in get_session_statistics API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve session statistics', 'details': str(e)}), 500
