import os
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user

from config import get_server_config
from config.advanced_logging_config import initialize_advanced_logging, get_advanced_logger
from utils.request_response_logger import setup_flask_request_logging
from utils.orjson_provider import OrjsonProvider, ORJSON_AVAILABLE
 
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

# Initialize Advanced Comprehensive Logging System
logging_config = initialize_advanced_logging(
    log_level='DEBUG',
    enable_console=True,
    enable_file=True,
    enable_json=True,
    enable_performance=True
)

logger = get_advanced_logger(__name__)

# Import advanced performance integration
from utils.advanced_performance_integration_simple import init_performance_optimization

def create_app():
    """
    Create and configure the Flask server for the API.
    """
    server = Flask(__name__)

    # Use fast orjson provider when available
    try:
        server.json_provider_class = OrjsonProvider  # type: ignore[attr-defined]
        # Bind provider instance
        server.json = server.json_provider_class(server)  # type: ignore[attr-defined]
        logger.info("Using orjson JSON provider" if ORJSON_AVAILABLE else "Using default JSON provider")
    except Exception as _e:  # pragma: no cover - compatibility fallback
        logger.info("Default JSON provider in use (orjson not active)")
    
    # Configure CORS for React frontend - Updated to include all possible dev server ports
    CORS(server, 
         origins=["http://localhost:5173", "http://127.0.0.1:5173", 
                 "http://localhost:5174", "http://127.0.0.1:5174",
                 "http://localhost:5175", "http://127.0.0.1:5175"], 
         supports_credentials=True,
         expose_headers=[
            'X-Total-Records', 'X-Returned-Records', 'X-Chunk-Offset', 'X-Chunk-Size', 'X-Chunk-Has-More'
         ],
         allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
         methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])

    # Enable gzip/brotli compression if available (helps localhost without a proxy)
    if _COMPRESS_AVAILABLE:
        try:
            # Prefer Brotli if available, else gzip
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
        except Exception as _e:  # pragma: no cover
            logger.warning("Flask-Compress initialization failed; continuing without compression")

    login_manager = LoginManager()
    login_manager.init_app(server)
    @login_manager.unauthorized_handler
    def unauthorized():
        return jsonify({'error': 'Unauthorized', 'message': 'Authentication required to access this resource.'}), 401

    @server.errorhandler(404)
    def not_found(error):
        return jsonify({'error': 'Not Found', 'message': 'The requested URL was not found on the server.'}), 404

    @server.errorhandler(405)
    def method_not_allowed(error):
        return jsonify({'error': 'Method Not Allowed', 'message': 'The method is not allowed for the requested URL.'}), 405

    @server.errorhandler(500)
    def internal_server_error(error):
        logger.error("Internal Server Error: %s", str(error)) # Log the exception
        return jsonify({'error': 'Internal Server Error', 'message': 'An unexpected error occurred on the server.'}), 500

    # User loader callback
    from services.user_management import user_manager
    from services.auth_models import User  # Import centralized User class

    @login_manager.user_loader
    def load_user(user_id):
        try:
            user_data = user_manager.get_user_by_username(user_id)
            if user_data and user_data.get('is_active', True):
                return User(user_data['username'])
            # If user missing (e.g., after a restart), try reloading from disk happened automatically in user_manager
            # As a safe fallback, keep unauthenticated
            return None
        except Exception as e:
            logger.warning(f"User loader failed for id={user_id}: {e}")
            return None

    # Configure Flask server with secure settings
    server_config = get_server_config()

    # Use centralized secret key management
    server.secret_key = server_config.secret_key
    server.config['MAX_CONTENT_LENGTH'] = server_config.max_content_length

    # Security configuration from centralized config
    # Hardened defaults: HttpOnly always True to prevent JS access to cookies
    server.config['SESSION_COOKIE_HTTPONLY'] = True
    server.config['REMEMBER_COOKIE_HTTPONLY'] = True
    # Secure flag depends on HTTPS / force_https (debug stays False for localhost)
    server.config['SESSION_COOKIE_SECURE'] = bool(server_config.force_https) if not server_config.debug else False
    # SameSite policy unified for session and remember cookies
    samesite_policy = 'None' if server_config.force_https else 'Lax'
    server.config['SESSION_COOKIE_SAMESITE'] = samesite_policy
    server.config['SESSION_COOKIE_NAME'] = 'water_quality_session'  # Custom session name
    server.config['SESSION_COOKIE_DOMAIN'] = None  # Allow localhost - browser will use request domain
    server.config['SESSION_COOKIE_PATH'] = '/'  # Available for entire app
    server.config['PERMANENT_SESSION_LIFETIME'] = server_config.session_timeout_seconds
    
    # Ensure sessions are permanent by default
    server.config['PERMANENT_SESSION'] = True
    
    # Additional session configuration for cross-origin support
    # Enable basic session protection even in debug to avoid unexpected invalidations
    server.config['SESSION_PROTECTION'] = 'basic'
    # Flask-Login remember cookie persistence (keep users logged in across sessions)
    from datetime import timedelta
    server.config['REMEMBER_COOKIE_DURATION'] = timedelta(seconds=server_config.session_timeout_seconds)
    server.config['REMEMBER_COOKIE_REFRESH_EACH_REQUEST'] = True  # refresh remember cookie on activity
    # Ensure server-side session also refreshes on activity (Flask default is True)
    server.config['SESSION_REFRESH_EACH_REQUEST'] = True
    server.config['REMEMBER_COOKIE_SECURE'] = bool(server_config.force_https) if not server_config.debug else False
    server.config['REMEMBER_COOKIE_SAMESITE'] = samesite_policy

    # Force HTTPS in production
    if server_config.force_https:
        server.config['PREFERRED_URL_SCHEME'] = 'https'

    # SECURITY: Add critical security headers
    @server.after_request
    def add_security_headers(response):
        csp_policy = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' "
            "https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; "
            "style-src 'self' 'unsafe-inline' "
            "https://cdn.jsdelivr.net https://fonts.googleapis.com; "
            "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com; "
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
        if path != "" and os.path.exists(os.path.join(REACT_BUILD_DIR, path)):
            return send_from_directory(REACT_BUILD_DIR, path)
        else:
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
    from api.performance import performance_bp # New import for performance_bp
    from api.system_health import system_health_bp
    from api.data_diagnostics import data_diagnostics_bp
    from api.correlation_analysis import correlation_analysis_bp
    from api.trend_analysis import trend_analysis_bp
    from api.statistical_analysis import statistical_analysis_bp
    from api.config import config_bp
    from api.performance_status_simple import performance_status_bp  # Add comprehensive performance status
    # Optional: performance test API (module may be absent in some deployments)
    try:
        from api.performance_test import performance_test_bp  # Add performance testing API
    except Exception as e:
        performance_test_bp = None
        logger.warning(f"Performance test API not available: {e}")
    from api.debug import debug_bp  # Client debug log API
    from api.data_quality import data_quality_bp
    # Add root route for API status
    # @server.route('/')
    # def api_status():
    #     return jsonify({
    #         'message': 'Water Quality Analysis API',
    #         'status': 'running',
    #         'version': '1.0.0',
    #         'documentation': {
    #             'water_quality': 'GET /api/v1/water_quality/data',
    #             'site_comparison': 'GET /api/v1/site_comparison/data', 
    #             'redox_analysis': 'GET /api/v1/redox_analysis/data',
    #             'performance_test': 'POST /api/v1/performance_test/generate-large-dataset',
    #             'home': 'GET /api/v1/home/'
    #         }
    #     })

    server.register_blueprint(home_bp, url_prefix='/api/v1/home')
    server.register_blueprint(water_quality_bp, url_prefix='/api/v1/water_quality')
    server.register_blueprint(alerts_bp, url_prefix='/api/v1/alerts')
    server.register_blueprint(reports_bp, url_prefix='/api/v1/reports')
    server.register_blueprint(site_comparison_bp, url_prefix='/api/v1/site_comparison')
    server.register_blueprint(redox_analysis_bp, url_prefix='/api/v1/redox_analysis')
    server.register_blueprint(auth_bp, url_prefix='/api/v1/auth')
    server.register_blueprint(upload_bp, url_prefix='/api/v1/upload')
    server.register_blueprint(admin_bp, url_prefix='/api/v1/admin')
    server.register_blueprint(performance_bp, url_prefix='/api/v1/performance') # Register performance_bp
    server.register_blueprint(performance_status_bp, url_prefix='/api/v1/performance_status')  # New comprehensive performance API
    if performance_test_bp is not None:
        server.register_blueprint(performance_test_bp, url_prefix='/api/v1/performance_test')  # Register performance test API
    server.register_blueprint(system_health_bp, url_prefix='/api/v1/system_health')
    server.register_blueprint(data_diagnostics_bp, url_prefix='/api/v1/data_diagnostics')
    server.register_blueprint(correlation_analysis_bp, url_prefix='/api/v1/correlation')
    server.register_blueprint(trend_analysis_bp, url_prefix='/api/v1/trends')
    server.register_blueprint(statistical_analysis_bp, url_prefix='/api/v1/statistics')
    server.register_blueprint(config_bp, url_prefix='/api/v1/config')
    # Global search removed to reduce confusion
    server.register_blueprint(debug_bp, url_prefix='/api/v1/debug')  # Register client debug API
    server.register_blueprint(data_quality_bp, url_prefix='/api/v1/data_quality')

    # Initialize advanced performance optimization with cache prewarming
    init_performance_optimization(server)
    logger.info("🚀 Advanced performance optimization initialized with cache prewarming")

    return server

if __name__ == '__main__':
    app = create_app()
    server_config = get_server_config()
    port = server_config.port
    debug = server_config.debug

    logger.info(f"Starting Flask API server on port {port}")
    logger.info(f"Debug mode: {debug}")

    app.run(debug=debug, port=port, host=server_config.host)
