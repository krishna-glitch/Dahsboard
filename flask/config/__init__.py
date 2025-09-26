"""
Flask Migration Configuration Module
"""

import os
from dataclasses import dataclass
from typing import Optional

@dataclass
class ServerConfig:
    """Server configuration settings"""
    host: str = '0.0.0.0'
    port: int = 5000
    debug: bool = True
    secret_key: str = 'dev-secret-key-change-in-production'
    
    # Security settings
    session_cookie_secure: bool = False
    session_cookie_httponly: bool = True
    session_cookie_samesite: str = 'Lax'
    # Default session timeout ~30 days; can be overridden via env
    session_timeout_seconds: int = 2592000
    force_https: bool = False
    strict_transport_security: bool = False
    allowed_origins: Optional[str] = None
    
    # Performance settings
    max_content_length: int = 16 * 1024 * 1024  # 16MB

def get_server_config() -> ServerConfig:
    """Get server configuration from environment or defaults"""
    
    # Allow overriding session timeout via env to tune persistence
    session_timeout_env = os.getenv('SESSION_TIMEOUT_SECONDS')
    # Default to 30 days if not specified
    timeout_seconds = int(session_timeout_env) if session_timeout_env else 2592000

    return ServerConfig(
        host=os.getenv('FLASK_HOST', '0.0.0.0'),
        port=int(os.getenv('FLASK_PORT', 5000)),
        debug=os.getenv('FLASK_DEBUG', 'True').lower() == 'true',
        secret_key=os.getenv('FLASK_SECRET_KEY', 'dev-secret-key-change-in-production'),
        session_cookie_secure=os.getenv('SESSION_COOKIE_SECURE', 'False').lower() == 'true',
        force_https=os.getenv('FORCE_HTTPS', 'False').lower() == 'true',
        strict_transport_security=os.getenv('STRICT_TRANSPORT_SECURITY', 'False').lower() == 'true',
        session_cookie_samesite=os.getenv('SESSION_COOKIE_SAMESITE', 'Lax'),
        session_timeout_seconds=timeout_seconds,
        allowed_origins=os.getenv('FLASK_ALLOWED_ORIGINS'),
    )
