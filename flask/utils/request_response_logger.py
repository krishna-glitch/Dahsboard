"""
Request Response Logger for Flask Migration
"""

from flask import Flask, request
import logging

logger = logging.getLogger(__name__)

def setup_flask_request_logging(app: Flask):
    """Setup request/response logging for Flask app"""
    
    @app.before_request
    def log_request_info():
        # Reduce log verbosity in production
        level = logging.INFO if app.debug else logging.DEBUG
        logger.log(level, f"Request: {request.method} {request.path}")
    
    @app.after_request
    def log_response_info(response):
        level = logging.INFO if app.debug else logging.DEBUG
        logger.log(level, f"Response: {response.status_code} {request.path}")
        return response
