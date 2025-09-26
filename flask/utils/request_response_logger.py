"""
Request Response Logger for Flask Migration
"""

from flask import Flask, request, g
import logging

logger = logging.getLogger(__name__)

def setup_flask_request_logging(app: Flask):
    """Setup request/response logging for Flask app"""
    
    @app.before_request
    def log_request_info():
        # Reduce log verbosity in production
        level = logging.INFO if app.debug else logging.DEBUG
        correlation_id = getattr(g, 'correlation_id', 'unknown')
        logger.log(level, f"[{correlation_id}] Request: {request.method} {request.path}")
    
    @app.after_request
    def log_response_info(response):
        level = logging.INFO if app.debug else logging.DEBUG
        correlation_id = getattr(g, 'correlation_id', 'unknown')
        logger.log(level, f"[{correlation_id}] Response: {response.status_code} {request.path}")
        return response
