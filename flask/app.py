import logging
import os
import uuid
from datetime import timedelta

from flask import Flask, jsonify, send_from_directory, abort, g, request
from flask_cors import CORS
from flask_login import LoginManager

from config import get_server_config
from config.improved_logging_config import configure_app_logging, get_smart_logger, LogCategory
from utils.request_response_logger import setup_flask_request_logging
from utils.orjson_provider import OrjsonProvider, ORJSON_AVAILABLE
from utils.http_responses import error_response
from app_extensions import csrf, limiter

import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration
from sentry_sdk.integrations.logging import LoggingIntegration

# Optional HTTP compression for localhost/no-proxy setups
try:  # pragma: no cover - optional dependency
    from flask_compress import Compress  # type: ignore
    _COMPRESS_AVAILABLE = True
except Exception:  # pragma: no cover
    Compress = None  # type: ignore
    _COMPRESS_AVAILABLE = False

# Detect brotli availability to prefer 'br' when possible
try:  # pragma: no cover
    import brotli  # type: ignore # noqa: F401
    _BR_AVAILABLE = True
except Exception:  # pragma: no cover
    _BR_AVAILABLE = False

# Configure improved logging system
configure_app_logging()
logger = get_smart_logger(__name__, LogCategory.API)

SENTRY_DSN = os.getenv('SENTRY_DSN')
if SENTRY_DSN:
    sentry_logging = LoggingIntegration(level=logging.INFO, event_level=logging.ERROR)
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[FlaskIntegration(), sentry_logging],
        traces_sample_rate=float(os.getenv('SENTRY_TRACES_SAMPLE_RATE', '0')),
        profiles_sample_rate=float(os.getenv('SENTRY_PROFILES_SAMPLE_RATE', '0'))
    )

# Import advanced performance integration
from utils.advanced_performance_integration_simple import init_performance_optimization
from utils.cache_headers import init_cache_headers

def create_app():
    """Create and configure the Flask server for the API."""
    server = Flask(__name__)

    server_config = get_server_config()

    # Security-sensitive config must exist before extensions initialize
    server.secret_key = server_config.secret_key
    server.config['MAX_CONTENT_LENGTH'] = server_config.max_content_length
    server.config['SESSION_COOKIE_HTTPONLY'] = True
    server.config['REMEMBER_COOKIE_HTTPONLY'] = True
    server.config['SESSION_COOKIE_SECURE'] = bool(server_config.force_https) if not server_config.debug else False
    samesite_policy = server_config.session_cookie_samesite or ('None' if server_config.force_https else 'Lax')
    if server_config.force_https:
        server.config['PREFERRED_URL_SCHEME'] = 'https'
        samesite_policy = 'None'
    server.config['SESSION_COOKIE_SAMESITE'] = samesite_policy
    server.config['SESSION_COOKIE_NAME'] = 'water_quality_session'
    server.config['SESSION_COOKIE_DOMAIN'] = None
    server.config['SESSION_COOKIE_PATH'] = '/'
    server.config['PERMANENT_SESSION_LIFETIME'] = server_config.session_timeout_seconds
    server.config['PERMANENT_SESSION'] = True
    server.config['SESSION_PROTECTION'] = 'basic'
    server.config['REMEMBER_COOKIE_DURATION'] = timedelta(seconds=server_config.session_timeout_seconds)
    server.config['REMEMBER_COOKIE_REFRESH_EACH_REQUEST'] = True
    server.config['SESSION_REFRESH_EACH_REQUEST'] = True
    server.config['REMEMBER_COOKIE_SECURE'] = bool(server_config.force_https) if not server_config.debug else False
    server.config['REMEMBER_COOKIE_SAMESITE'] = samesite_policy

    # CSRF defaults (overridable via env)
    server.config.setdefault('WTF_CSRF_CHECK_DEFAULT', True)
    server.config.setdefault('WTF_CSRF_ENABLED', True)
    server.config.setdefault('WTF_CSRF_TIME_LIMIT', 3600)
    server.config.setdefault('WTF_CSRF_METHODS', ['POST', 'PUT', 'PATCH', 'DELETE'])
    server.config.setdefault('WTF_CSRF_HEADERS', ['X-CSRF-Token'])

    # Use fast orjson provider when available
    try:
        server.json_provider_class = OrjsonProvider  # type: ignore[attr-defined]
        server.json = server.json_provider_class(server)  # type: ignore[attr-defined]
        logger.info("Using orjson JSON provider" if ORJSON_AVAILABLE else "Using default JSON provider")
    except Exception:  # pragma: no cover - compatibility fallback
        logger.info("Default JSON provider in use (orjson not active)")

    # Configure CORS for React frontend
    cors_origins = server_config.allowed_origins
    if cors_origins:
        origins = [origin.strip() for origin in cors_origins.split(',') if origin.strip()]
    else:
        origins = [
            "http://localhost:5173", "http://127.0.0.1:5173",
            "http://localhost:5174", "http://127.0.0.1:5174",
            "http://localhost:5175", "http://127.0.0.1:5175",
            "http://localhost:4173", "http://127.0.0.1:4173",
            "http://localhost:4174", "http://127.0.0.1:4174"
        ]
    CORS(
        server,
        origins=origins,
        supports_credentials=True,
        expose_headers=[
            'X-Total-Records', 'X-Returned-Records', 'X-Chunk-Offset', 'X-Chunk-Size', 'X-Chunk-Has-More',
            'X-Request-ID'
        ],
        allow_headers=["Content-Type", "Authorization", "X-Requested-With", "X-CSRF-Token", "X-Request-ID"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]
    )

    # Enable gzip/brotli compression if available (helps localhost without a proxy)
    if _COMPRESS_AVAILABLE:
        try:
            server.config.setdefault('COMPRESS_ALGORITHM', 'br' if _BR_AVAILABLE else 'gzip')
            server.config.setdefault('COMPRESS_MIMETYPES', [
                'application/json',
                'text/plain',
                'text/html',
                'application/javascript',
                'text/css',
                'application/vnd.apache.arrow.stream'
            ])
            server.config.setdefault('COMPRESS_LEVEL', 6)
            server.config.setdefault('COMPRESS_MIN_SIZE', 1024)
            Compress(server)
            logger.info("HTTP compression enabled (Flask-Compress)")
        except Exception as exc:  # pragma: no cover
            logger.warning("Flask-Compress initialization failed; continuing without compression: %s", exc)

    # Phase 3 (revalidation): add conservative cache headers + ETag for safe JSON APIs
    init_cache_headers(server, default_ttl_seconds=3600)

    # Improve static file caching for production builds
    if not server_config.debug:
        server.config['SEND_FILE_MAX_AGE_DEFAULT'] = 60 * 60 * 24 * 7  # One week; assets are hashed in Vite builds

    # Initialize extensions that depend on the configured Flask app
    csrf.init_app(server)
    limiter.init_app(server)

    login_manager = LoginManager()
    login_manager.init_app(server)

    @login_manager.unauthorized_handler
    def unauthorized():
        return error_response('UNAUTHORIZED', 'Authentication required to access this resource.', status_code=401)

    @server.errorhandler(404)
    def not_found(error):
        return error_response('NOT_FOUND', 'The requested URL was not found on the server.', status_code=404)

    @server.errorhandler(405)
    def method_not_allowed(error):
        return error_response('METHOD_NOT_ALLOWED', 'The method is not allowed for the requested URL.', status_code=405)

    @server.errorhandler(500)
    def internal_server_error(error):
        logger.error('Internal Server Error: %s', str(error))
        return error_response('SERVER_ERROR', 'An unexpected error occurred on the server.', status_code=500)

    # User loader callback
    from services.new_user_management import NewUserManager
    from auth_database import AuthSessionLocal

    user_manager = NewUserManager()

    @login_manager.user_loader
    def load_user(user_id):
        db = AuthSessionLocal()
        try:
            try:
                numeric_id = int(user_id)
            except (TypeError, ValueError):
                return None
            user = user_manager.get_user_by_id(db, numeric_id)
            return user
        finally:
            db.close()

    # Request correlation IDs for tracing end-to-end
    @server.before_request
    def ensure_request_id():
        correlation_id = request.headers.get('X-Request-ID') or uuid.uuid4().hex
        g.correlation_id = correlation_id

    @server.after_request
    def add_security_headers(response):
        # Attach correlation id for clients/monitoring
        correlation_id = getattr(g, 'correlation_id', None)
        if correlation_id:
            response.headers['X-Request-ID'] = correlation_id

        csp_policy = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https:; "
            "connect-src 'self' https:; "
            "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self';"
        )
        response.headers['Content-Security-Policy'] = csp_policy
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        if server_config.strict_transport_security:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = (
            "geolocation=(), "
            "microphone=(), "
            "camera=(), "
            "payment=(), "
            "usb=(), "
            "magnetometer=(), "
            "accelerometer=(), "
            "gyroscope=()"
        )
        return response

    # Setup request/response logging middleware
    setup_flask_request_logging(server)

    logger.info("Flask server created and configured with security headers and request logging")

    # Define the path to the React build directory
    REACT_BUILD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'react', 'frontend', 'dist'))

    # Serve React App static files
    @server.route('/')
    def serve_react_app():
        return send_from_directory(REACT_BUILD_DIR, 'index.html')

    @server.route('/<path:path>')
    def serve_static(path):
        if path.startswith('api/'):
            abort(404)
        if path and os.path.exists(os.path.join(REACT_BUILD_DIR, path)):
            return send_from_directory(REACT_BUILD_DIR, path)
        return send_from_directory(REACT_BUILD_DIR, 'index.html')

    # Register blueprints here
    from api.home import home_bp
    from api.water_quality import water_quality_bp
    from api.alerts import alerts_bp
    from api.reports import reports_bp
    from api.site_comparison import site_comparison_bp
    from api.redox_analysis import redox_analysis_bp
    from api.auth import auth_bp
    from api.upload import upload_bp
    from api.admin import admin_bp
    from api.performance import performance_bp
    from api.system_health import system_health_bp
    from api.data_diagnostics import data_diagnostics_bp
    from api.correlation_analysis import correlation_analysis_bp
    from api.trend_analysis import trend_analysis_bp
    from api.statistical_analysis import statistical_analysis_bp
    from api.config import config_bp
    from api.performance_status_simple import performance_status_bp
    try:
        from api.performance_test import performance_test_bp
    except Exception as exc:
        performance_test_bp = None
        logger.warning(f"Performance test API not available: {exc}")
    from api.debug import debug_bp
    from api.data_quality import data_quality_bp
    from api.code_quality import code_quality_bp

    server.register_blueprint(home_bp, url_prefix='/api/v1/home')
    server.register_blueprint(water_quality_bp, url_prefix='/api/v1/water_quality')
    server.register_blueprint(alerts_bp, url_prefix='/api/v1/alerts')
    server.register_blueprint(reports_bp, url_prefix='/api/v1/reports')
    server.register_blueprint(site_comparison_bp, url_prefix='/api/v1/site_comparison')
    server.register_blueprint(redox_analysis_bp, url_prefix='/api/v1/redox_analysis')
    server.register_blueprint(auth_bp, url_prefix='/api/v1/auth')
    server.register_blueprint(upload_bp, url_prefix='/api/v1/upload')
    server.register_blueprint(admin_bp, url_prefix='/api/v1/admin')
    server.register_blueprint(performance_bp, url_prefix='/api/v1/performance')
    server.register_blueprint(performance_status_bp, url_prefix='/api/v1/performance_status')
    if performance_test_bp is not None:
        server.register_blueprint(performance_test_bp, url_prefix='/api/v1/performance_test')
    server.register_blueprint(system_health_bp, url_prefix='/api/v1/system_health')
    server.register_blueprint(data_diagnostics_bp, url_prefix='/api/v1/data_diagnostics')
    server.register_blueprint(correlation_analysis_bp, url_prefix='/api/v1/correlation')
    server.register_blueprint(trend_analysis_bp, url_prefix='/api/v1/trends')
    server.register_blueprint(statistical_analysis_bp, url_prefix='/api/v1/statistics')
    server.register_blueprint(config_bp, url_prefix='/api/v1/config')
    server.register_blueprint(debug_bp, url_prefix='/api/v1/debug')
    server.register_blueprint(data_quality_bp, url_prefix='/api/v1/data_quality')
    server.register_blueprint(code_quality_bp, url_prefix='/api/v1/code_quality')

    # Initialize advanced performance optimization with cache prewarming
    init_performance_optimization(server)
    logger.info("🚀 Advanced performance optimization initialized with cache prewarming")

    return server


if __name__ == '__main__':
    app = create_app()
    server_config = get_server_config()
    port = server_config.port
    debug = server_config.debug

    logger.info("Starting Flask API server on port %s", port)
    logger.info("Debug mode: %s", debug)

    app.run(debug=debug, port=port, host=server_config.host)
