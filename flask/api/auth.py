from datetime import datetime
import logging
import uuid

from flask import Blueprint, request, session
from flask_login import login_user, logout_user, current_user
from flask_wtf.csrf import generate_csrf
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from auth_database import AuthSessionLocal
from services.new_auth_service import NewAuthService
from services.new_user_management import NewUserManager
from services.account_guard import account_guard
from utils.http_responses import success_response, error_response
from app_extensions import limiter
from utils.advanced_performance_integration_simple import enterprise_performance

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth_bp', __name__)
auth_service = NewAuthService()
user_manager = NewUserManager()


@auth_bp.route('/csrf-token', methods=['GET'])
@limiter.limit('120 per minute')
def csrf_token():
    token = generate_csrf()
    response, status = success_response({'csrfToken': token}, status_code=200)
    response.headers['Cache-Control'] = 'no-store'
    return response, status


@auth_bp.route('/login', methods=['POST'])
@limiter.limit('15 per minute')
def login():
    logger.info("Received request for login API.")
    db = AuthSessionLocal()
    client_ip = request.remote_addr or 'unknown'
    try:
        data = request.get_json(silent=True) or {}
        username = (data.get('username') or '').strip()
        password = data.get('password')

        if not username or not password:
            return error_response('MISSING_CREDENTIALS', 'Username and password are required.', status_code=400)

        locked, retry_after = account_guard.is_locked(username, client_ip)
        if locked:
            logger.warning("Account locked for user %s from %s", username, client_ip)
            return error_response('ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.', status_code=423, meta={'retryAfter': int(retry_after)})

        logger.info("Attempting to authenticate user: %s", username)
        success, user = auth_service.authenticate_user(db, username, password)

        if not success or not user:
            failures, lock_duration = account_guard.register_failure(username, client_ip)
            remaining = max(account_guard.max_attempts - failures, 0)
            logger.warning("Failed login attempt for user %s from %s (%s remaining)", username, client_ip, remaining)
            if lock_duration:
                return error_response('ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.', status_code=423, meta={'retryAfter': int(lock_duration)})
            return error_response('INVALID_CREDENTIALS', 'Invalid username or password.', status_code=401, meta={'remainingAttempts': remaining})

        account_guard.reset(username, client_ip)

        try:
            # Rotate session id to mitigate fixation
            session.clear()
        except Exception:
            logger.debug("Session clear failed during login", exc_info=True)

        from services.auth_models import User

        login_user(User(user.id), remember=True, fresh=True)
        session.permanent = True
        session['session_nonce'] = uuid.uuid4().hex  # type: ignore[name-defined]
        csrf_token = generate_csrf()

        logger.info("User %s authenticated successfully.", username)
        payload = {'user': {'id': user.id, 'username': user.username}, 'csrfToken': csrf_token}
        return success_response(payload, message='Login successful')

    except SQLAlchemyError as db_error:
        logger.error("Database error in login API: %s", db_error, exc_info=True)
        return error_response('LOGIN_FAILED', 'Unable to process login at this time.', status_code=500)
    except Exception as exc:
        logger.error("Unexpected error in login API: %s", exc, exc_info=True)
        return error_response('LOGIN_FAILED', 'Unable to process login at this time.', status_code=500)
    finally:
        db.close()


@auth_bp.route('/register', methods=['POST'])
@limiter.limit('10 per hour')
def register():
    logger.info("Received request for register API.")
    db = AuthSessionLocal()
    try:
        data = request.get_json(silent=True) or {}
        username = (data.get('username') or '').strip()
        password = data.get('password')

        if not username or not password:
            return error_response('MISSING_CREDENTIALS', 'Username and password are required.', status_code=400)

        existing_user = user_manager.get_user_by_username(db, username)
        if existing_user:
            # Do not reveal that the username exists
            return error_response('REGISTRATION_FAILED', 'Unable to complete registration with provided credentials.', status_code=400)

        try:
            user_manager.create_user(db, username, password)
        except IntegrityError:
            db.rollback()
            return error_response('REGISTRATION_FAILED', 'Unable to complete registration with provided credentials.', status_code=400)

        logger.info("User %s registered successfully.", username)
        csrf_token = generate_csrf()
        return success_response({'csrfToken': csrf_token}, status_code=201, message='User registered successfully')

    except SQLAlchemyError as db_error:
        logger.error("Database error in register API: %s", db_error, exc_info=True)
        db.rollback()
        return error_response('REGISTRATION_FAILED', 'Unable to complete registration at this time.', status_code=500)
    except Exception as exc:
        logger.error("Unexpected error in register API: %s", exc, exc_info=True)
        db.rollback()
        return error_response('REGISTRATION_FAILED', 'Unable to complete registration at this time.', status_code=500)
    finally:
        db.close()


@auth_bp.route('/logout', methods=['POST'])
@limiter.limit('30 per minute')
def logout():
    logger.info("Received request for logout API.")
    try:
        logout_user()
        csrf_token = generate_csrf()
        logger.info("User logged out successfully.")
        return success_response({'csrfToken': csrf_token}, message='Logout successful')
    except Exception as exc:
        logger.error("Error in logout API: %s", exc, exc_info=True)
        return error_response('LOGOUT_FAILED', 'Unable to logout at this time.', status_code=500)


@auth_bp.route('/status', methods=['GET'])
@limiter.limit('60 per minute')
@enterprise_performance(data_type='auth_status')
def status():
    logger.info("Received request for auth status API.")
    db = AuthSessionLocal()
    try:
        authenticated = bool(getattr(current_user, 'is_authenticated', False))
        user_info = {}
        if authenticated:
            user_data = None
            try:
                raw_id = current_user.get_id()
                numeric_id = int(raw_id) if raw_id is not None else None
            except (TypeError, ValueError):
                numeric_id = None

            if numeric_id is not None:
                user_data = user_manager.get_user_by_id(db, numeric_id)

            if user_data:
                user_info = {
                    'id': user_data.id,
                    'username': user_data.username,
                }
        return success_response({'authenticated': authenticated, 'user': user_info})
    except Exception as exc:
        logger.error("Error in auth status API: %s", exc, exc_info=True)
        return error_response('STATUS_FAILED', 'Unable to determine authentication status.', status_code=500)
    finally:
        db.close()


@auth_bp.route('/health', methods=['GET'])
@limiter.limit('120 per minute')
def health():
    try:
        authenticated = bool(getattr(current_user, 'is_authenticated', False))
        return success_response({
            'ok': True,
            'authenticated': authenticated,
            'server_time': datetime.utcnow().isoformat() + 'Z'
        })
    except Exception as exc:
        logger.error("Error in auth health API: %s", exc, exc_info=True)
        return success_response({'ok': False, 'authenticated': False})
