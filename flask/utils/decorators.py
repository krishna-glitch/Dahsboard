from functools import wraps
from flask import jsonify
from flask_login import current_user
from services.user_management import user_manager

def role_required(roles):
    """
    Decorator to restrict access to endpoints based on user roles.
    Args:
        roles (list or str): A single role string or a list of allowed role strings.
    """
    if not isinstance(roles, list):
        roles = [roles]

    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({'error': 'Unauthorized', 'message': 'Authentication required to access this resource.'}), 401

            user_data = user_manager.get_user_by_username(current_user.get_id())
            if not user_data or user_data['role'] not in roles:
                return jsonify({'error': 'Forbidden', 'message': 'You do not have the necessary permissions to access this resource.'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator
