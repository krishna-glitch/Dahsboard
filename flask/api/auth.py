from flask import Blueprint, jsonify, request, session
from datetime import datetime
from flask_login import login_user, logout_user, current_user
import logging

logger = logging.getLogger(__name__)

from services.auth_service import AuthService
from services.user_management import user_manager # Import user_manager to get user data for Flask-Login User object
# User class will be handled by Flask-Login user_loader

# Import comprehensive performance optimization (for session management optimization)
from utils.advanced_performance_integration_simple import enterprise_performance

auth_bp = Blueprint('auth_bp', __name__)
auth_service = AuthService()

@auth_bp.route('/login', methods=['POST'])
def login():
    logger.info("Received request for login API.")
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400

        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({'error': 'Username and password are required'}), 400

        success, user_info = auth_service.authenticate_user(username, password)

        if success:
            # Create User object for Flask-Login using centralized class
            from services.auth_models import User
            
            user = User(username)
            # Make session permanent to persist across browser refreshes
            session.permanent = True
            # Rely solely on Flask-Login for session state; avoid manual flags
            login_user(user, remember=True)
            logger.info(f"User {username} authenticated successfully with permanent session.")
            return jsonify({'message': 'Login successful', 'user': user_info}), 200
        else:
            logger.warning(f"Failed login attempt for user {username}.")
            return jsonify({'error': 'Invalid credentials'}), 401

    except Exception as e:
        logger.error(f"Error in login API: {e}", exc_info=True)
        return jsonify({'error': 'An unexpected error occurred during login', 'details': str(e)}), 500

@auth_bp.route('/logout', methods=['POST'])
def logout():
    logger.info("Received request for logout API.")
    try:
        auth_service.logout_user()
        # Flask-Login logout; no manual session flags
        logout_user()
        logger.info("User logged out successfully.")
        return jsonify({'message': 'Logout successful'}), 200
    except Exception as e:
        logger.error(f"Error in logout API: {e}", exc_info=True)
        return jsonify({'error': 'An unexpected error occurred during logout', 'details': str(e)}), 500

@auth_bp.route('/status', methods=['GET'])
@enterprise_performance(data_type='auth_status')
def status():
    logger.info("Received request for auth status API.")
    try:
        # Single source of truth: Flask-Login authentication state
        authenticated = bool(getattr(current_user, 'is_authenticated', False))
        user_info = {}
        if authenticated:
            try:
                username = current_user.get_id()
            except Exception:
                username = None
            if username:
                user_data = user_manager.get_user_by_username(username)
                if user_data:
                    user_info = {k: v for k, v in user_data.items() if k != 'password'}
        return jsonify({'authenticated': authenticated, 'user': user_info}), 200
    except Exception as e:
        logger.error(f"Error in auth status API: {e}", exc_info=True)
        return jsonify({'error': 'An unexpected error occurred during status check', 'details': str(e)}), 500

@auth_bp.route('/health', methods=['GET'])
def health():
    """Lightweight health endpoint for client-side session resilience.
    Always returns 200 with minimal auth signal so the UI can perform soft reauth
    instead of hard logout on transient failures.
    """
    try:
        authenticated = bool(getattr(current_user, 'is_authenticated', False))
        return jsonify({
            'ok': True,
            'authenticated': authenticated,
            'server_time': datetime.utcnow().isoformat() + 'Z'
        }), 200
    except Exception:
        # Even on internal errors, provide a health response to avoid cascading client errors
        return jsonify({ 'ok': False, 'authenticated': False }), 200
