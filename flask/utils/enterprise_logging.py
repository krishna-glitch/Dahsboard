"""
Enterprise-Grade Logging for Flask APIs
Enhanced logging with security, compliance, and monitoring features
"""

import logging
import logging.handlers
import json
import os
import time
import uuid
import hashlib
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List, Union, Callable
from functools import wraps
from flask import request, g, has_request_context
import threading
from pathlib import Path

# Import existing advanced logging
from config.advanced_logging_config import (
    AdvancedLoggingConfig, StructuredFormatter, PerformanceLogger,
    SystemTracker, get_advanced_logger
)

class FlaskSecurityLogger:
    """
    Security-focused logging for Flask APIs
    """
    
    def __init__(self):
        self.logger = get_advanced_logger('security')
        self.failed_attempts = {}
        self.rate_limit_tracking = {}
        self._lock = threading.Lock()
    
    def log_authentication_attempt(self, username: str, success: bool, 
                                 ip_address: str = None, user_agent: str = None):
        """Log authentication attempts with security context"""
        
        # Get request context if available
        if has_request_context():
            ip_address = ip_address or request.remote_addr
            user_agent = user_agent or request.headers.get('User-Agent', 'Unknown')
        
        # Track failed attempts for security monitoring
        with self._lock:
            if not success:
                key = f"{username}:{ip_address}"
                self.failed_attempts[key] = self.failed_attempts.get(key, 0) + 1
                
                # Alert on multiple failed attempts
                if self.failed_attempts[key] >= 5:
                    self.logger.error(
                        f"🚨 SECURITY_ALERT: Multiple failed login attempts",
                        extra={
                            'event_type': 'security_alert',
                            'alert_category': 'authentication',
                            'username': username,
                            'ip_address': ip_address,
                            'failed_attempts': self.failed_attempts[key],
                            'user_agent': user_agent,
                            'timestamp': datetime.now().isoformat(),
                            'severity': 'HIGH'
                        }
                    )
        
        # Log the authentication event
        self.logger.info(
            f"{'✅' if success else '❌'} AUTHENTICATION: {username} - {'SUCCESS' if success else 'FAILED'}",
            extra={
                'event_type': 'authentication',
                'username': username,
                'success': success,
                'ip_address': ip_address,
                'user_agent': user_agent,
                'timestamp': datetime.now().isoformat(),
                'session_id': getattr(g, 'session_id', None) if has_request_context() else None
            }
        )
    
    def log_authorization_check(self, username: str, resource: str, 
                               action: str, granted: bool, reason: str = None):
        """Log authorization checks"""
        self.logger.info(
            f"🔐 AUTHORIZATION: {username} - {action} on {resource} - {'GRANTED' if granted else 'DENIED'}",
            extra={
                'event_type': 'authorization',
                'username': username,
                'resource': resource,
                'action': action,
                'granted': granted,
                'reason': reason,
                'timestamp': datetime.now().isoformat(),
                'request_id': getattr(g, 'request_id', None) if has_request_context() else None
            }
        )
    
    def log_security_event(self, event_type: str, severity: str, 
                          description: str, **metadata):
        """Log general security events"""
        log_level = {
            'LOW': logging.INFO,
            'MEDIUM': logging.WARNING,
            'HIGH': logging.ERROR,
            'CRITICAL': logging.CRITICAL
        }.get(severity, logging.WARNING)
        
        self.logger.log(
            log_level,
            f"🔒 SECURITY_EVENT: {event_type} - {description}",
            extra={
                'event_type': 'security_event',
                'security_event_type': event_type,
                'severity': severity,
                'description': description,
                'timestamp': datetime.now().isoformat(),
                **metadata
            }
        )
    
    def log_data_access(self, username: str, data_type: str, 
                       operation: str, record_count: int = None, **metadata):
        """Log data access for compliance"""
        self.logger.info(
            f"📊 DATA_ACCESS: {username} - {operation} {data_type}" + 
            (f" ({record_count} records)" if record_count else ""),
            extra={
                'event_type': 'data_access',
                'username': username,
                'data_type': data_type,
                'operation': operation,
                'record_count': record_count,
                'timestamp': datetime.now().isoformat(),
                'request_id': getattr(g, 'request_id', None) if has_request_context() else None,
                **metadata
            }
        )

class FlaskAPILogger:
    """
    Comprehensive API logging with performance and business metrics
    """
    
    def __init__(self):
        self.request_logger = get_advanced_logger('api.requests')
        self.performance_logger = get_advanced_logger('api.performance')
        self.business_logger = get_advanced_logger('api.business')
        self.error_logger = get_advanced_logger('api.errors')
    
    def log_request_start(self, request_id: str = None):
        """Log API request start"""
        if not has_request_context():
            return None
            
        request_id = request_id or str(uuid.uuid4())
        g.request_id = request_id
        g.request_start_time = time.time()
        
        # Sanitize sensitive data from query parameters
        sanitized_args = self._sanitize_request_data(dict(request.args))
        
        self.request_logger.info(
            f"🌐 REQUEST_START: {request.method} {request.endpoint or request.path}",
            extra={
                'event_type': 'request_start',
                'request_id': request_id,
                'method': request.method,
                'endpoint': request.endpoint,
                'path': request.path,
                'query_parameters': sanitized_args,
                'ip_address': request.remote_addr,
                'user_agent': request.headers.get('User-Agent'),
                'content_length': request.content_length,
                'timestamp': datetime.now().isoformat()
            }
        )
        
        return request_id
    
    def log_request_end(self, response_status: int, response_size: int = None, 
                       business_metrics: Dict[str, Any] = None):
        """Log API request completion with comprehensive metrics"""
        if not has_request_context() or not hasattr(g, 'request_id'):
            return
        
        request_duration = (time.time() - g.request_start_time) * 1000
        
        # Determine log level based on status and duration
        if response_status >= 500:
            log_level = logging.ERROR
            status_emoji = "💥"
        elif response_status >= 400:
            log_level = logging.WARNING  
            status_emoji = "⚠️"
        elif request_duration > 5000:  # > 5 seconds
            log_level = logging.WARNING
            status_emoji = "🐌"
        else:
            log_level = logging.INFO
            status_emoji = "✅"
        
        # Log request completion
        self.request_logger.log(
            log_level,
            f"{status_emoji} REQUEST_END: {request.method} {request.endpoint or request.path} - "
            f"{response_status} ({request_duration:.1f}ms)",
            extra={
                'event_type': 'request_end',
                'request_id': g.request_id,
                'method': request.method,
                'endpoint': request.endpoint,
                'path': request.path,
                'status_code': response_status,
                'duration_ms': round(request_duration, 2),
                'response_size_bytes': response_size,
                'performance_tier': self._get_performance_tier(request_duration),
                'timestamp': datetime.now().isoformat()
            }
        )
        
        # Log performance metrics separately
        self.performance_logger.info(
            f"⏱️ PERFORMANCE: {request.endpoint or request.path} - {request_duration:.1f}ms",
            extra={
                'event_type': 'performance',
                'request_id': g.request_id,
                'endpoint': request.endpoint,
                'duration_ms': round(request_duration, 2),
                'status_code': response_status,
                'performance_tier': self._get_performance_tier(request_duration),
                'timestamp': datetime.now().isoformat()
            }
        )
        
        # Log business metrics if provided
        if business_metrics:
            self.business_logger.info(
                f"📊 BUSINESS_METRICS: {request.endpoint or request.path}",
                extra={
                    'event_type': 'business_metrics',
                    'request_id': g.request_id,
                    'endpoint': request.endpoint,
                    'metrics': business_metrics,
                    'timestamp': datetime.now().isoformat()
                }
            )
    
    def log_api_error(self, error: Exception, error_context: Dict[str, Any] = None):
        """Log API errors with full context"""
        import traceback
        
        error_id = str(uuid.uuid4())
        
        self.error_logger.error(
            f"💥 API_ERROR: {type(error).__name__}: {str(error)}",
            extra={
                'event_type': 'api_error',
                'error_id': error_id,
                'error_type': type(error).__name__,
                'error_message': str(error),
                'request_id': getattr(g, 'request_id', None) if has_request_context() else None,
                'endpoint': request.endpoint if has_request_context() else None,
                'traceback': traceback.format_exc(),
                'error_context': error_context or {},
                'timestamp': datetime.now().isoformat()
            },
            exc_info=True
        )
        
        return error_id
    
    def log_business_event(self, event_type: str, event_name: str, 
                          metrics: Dict[str, Any] = None, **metadata):
        """Log business events for analytics"""
        self.business_logger.info(
            f"🏢 BUSINESS_EVENT: {event_type} - {event_name}",
            extra={
                'event_type': 'business_event',
                'business_event_type': event_type,
                'business_event_name': event_name,
                'metrics': metrics or {},
                'request_id': getattr(g, 'request_id', None) if has_request_context() else None,
                'timestamp': datetime.now().isoformat(),
                **metadata
            }
        )
    
    def _sanitize_request_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Remove sensitive information from request data"""
        sensitive_keys = {'password', 'token', 'api_key', 'secret', 'auth', 'authorization'}
        sanitized = {}
        
        for key, value in data.items():
            if any(sensitive in key.lower() for sensitive in sensitive_keys):
                sanitized[key] = '***REDACTED***'
            else:
                sanitized[key] = value
        
        return sanitized
    
    def _get_performance_tier(self, duration_ms: float) -> str:
        """Categorize request performance"""
        if duration_ms < 100:
            return 'excellent'
        elif duration_ms < 500:
            return 'good'
        elif duration_ms < 2000:
            return 'acceptable'
        elif duration_ms < 5000:
            return 'slow'
        else:
            return 'very_slow'

class FlaskComplianceLogger:
    """
    Compliance and audit logging
    """
    
    def __init__(self):
        self.audit_logger = get_advanced_logger('compliance.audit')
        self.gdpr_logger = get_advanced_logger('compliance.gdpr')
    
    def log_audit_event(self, event_type: str, user_id: str, resource: str, 
                       action: str, outcome: str, **metadata):
        """Log audit events for compliance"""
        audit_id = str(uuid.uuid4())
        
        self.audit_logger.info(
            f"📋 AUDIT: {user_id} - {action} on {resource} - {outcome}",
            extra={
                'event_type': 'audit',
                'audit_id': audit_id,
                'audit_event_type': event_type,
                'user_id': user_id,
                'resource': resource,
                'action': action,
                'outcome': outcome,
                'timestamp': datetime.now().isoformat(),
                'request_id': getattr(g, 'request_id', None) if has_request_context() else None,
                **metadata
            }
        )
        
        return audit_id
    
    def log_data_processing(self, user_id: str, data_category: str, 
                          processing_purpose: str, legal_basis: str,
                          data_subjects: int = None, **metadata):
        """Log data processing for GDPR compliance"""
        self.gdpr_logger.info(
            f"🛡️ DATA_PROCESSING: {data_category} for {processing_purpose}",
            extra={
                'event_type': 'gdpr_data_processing',
                'user_id': user_id,
                'data_category': data_category,
                'processing_purpose': processing_purpose,
                'legal_basis': legal_basis,
                'data_subjects_count': data_subjects,
                'timestamp': datetime.now().isoformat(),
                **metadata
            }
        )

class EnterpriseLogManager:
    """
    Central manager for enterprise logging
    """
    
    def __init__(self):
        self.security = FlaskSecurityLogger()
        self.api = FlaskAPILogger()
        self.compliance = FlaskComplianceLogger()
        self.config = AdvancedLoggingConfig()
    
    def init_flask_app(self, app):
        """Initialize enterprise logging for Flask app"""
        
        @app.before_request
        def before_request():
            """Log request start and setup request context"""
            self.api.log_request_start()
        
        @app.after_request
        def after_request(response):
            """Log request completion"""
            self.api.log_request_end(
                response.status_code,
                response.content_length
            )
            return response
        
        @app.errorhandler(Exception)
        def handle_exception(e):
            """Log unhandled exceptions"""
            error_id = self.api.log_api_error(e)
            # Don't interfere with normal error handling
            return None
        
        # Add request ID to all responses
        @app.after_request
        def add_request_id_header(response):
            if hasattr(g, 'request_id'):
                response.headers['X-Request-ID'] = g.request_id
            return response
        
        app.logger.info(f"🚀 Enterprise logging initialized for Flask app: {app.name}")

# Logging decorators
def log_api_call(business_event_type: str = None, log_args: bool = False):
    """Decorator to automatically log API calls"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            logger = get_advanced_logger(f.__module__)
            start_time = time.time()
            
            # Log function entry
            logger.info(
                f"🔧 FUNCTION_START: {f.__name__}",
                extra={
                    'function_name': f.__name__,
                    'module': f.__module__,
                    'args': args if log_args else len(args),
                    'kwargs': list(kwargs.keys()) if not log_args else kwargs,
                    'timestamp': datetime.now().isoformat()
                }
            )
            
            try:
                result = f(*args, **kwargs)
                duration = (time.time() - start_time) * 1000
                
                # Log successful completion
                logger.info(
                    f"✅ FUNCTION_END: {f.__name__} ({duration:.1f}ms)",
                    extra={
                        'function_name': f.__name__,
                        'duration_ms': round(duration, 2),
                        'success': True,
                        'timestamp': datetime.now().isoformat()
                    }
                )
                
                # Log business event if specified
                if business_event_type:
                    enterprise_log_manager.api.log_business_event(
                        business_event_type, f.__name__,
                        {'duration_ms': round(duration, 2), 'success': True}
                    )
                
                return result
                
            except Exception as e:
                duration = (time.time() - start_time) * 1000
                
                # Log function error
                logger.error(
                    f"💥 FUNCTION_ERROR: {f.__name__} - {type(e).__name__}: {str(e)}",
                    extra={
                        'function_name': f.__name__,
                        'duration_ms': round(duration, 2),
                        'error_type': type(e).__name__,
                        'error_message': str(e),
                        'success': False,
                        'timestamp': datetime.now().isoformat()
                    },
                    exc_info=True
                )
                
                # Log business event for error if specified
                if business_event_type:
                    enterprise_log_manager.api.log_business_event(
                        business_event_type, f.__name__,
                        {'duration_ms': round(duration, 2), 'success': False, 'error': str(e)}
                    )
                
                raise
        
        return decorated_function
    return decorator

def log_data_access(data_type: str, operation: str):
    """Decorator to log data access for compliance"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Get username from Flask context if available
            username = 'system'  # Default
            if has_request_context():
                from flask_login import current_user
                if hasattr(current_user, 'get_id') and current_user.is_authenticated:
                    username = current_user.get_id()
            
            try:
                result = f(*args, **kwargs)
                
                # Determine record count if result is a DataFrame or list
                record_count = None
                if hasattr(result, '__len__'):
                    record_count = len(result)
                elif hasattr(result, 'shape'):  # DataFrame
                    record_count = result.shape[0]
                
                # Log the data access
                enterprise_log_manager.security.log_data_access(
                    username, data_type, operation, record_count
                )
                
                return result
                
            except Exception as e:
                # Log failed data access attempt
                enterprise_log_manager.security.log_data_access(
                    username, data_type, f"{operation}_FAILED", 0,
                    error=str(e)
                )
                raise
        
        return decorated_function
    return decorator

# Global enterprise log manager
enterprise_log_manager = EnterpriseLogManager()

# Convenience functions
def get_enterprise_logger(name: str) -> logging.Logger:
    """Get an enterprise-grade logger"""
    return get_advanced_logger(name)

def log_security_event(event_type: str, severity: str, description: str, **metadata):
    """Log security events"""
    enterprise_log_manager.security.log_security_event(event_type, severity, description, **metadata)

def log_business_event(event_type: str, event_name: str, metrics: Dict[str, Any] = None, **metadata):
    """Log business events"""
    enterprise_log_manager.api.log_business_event(event_type, event_name, metrics, **metadata)

def log_audit_event(event_type: str, user_id: str, resource: str, action: str, outcome: str, **metadata):
    """Log audit events"""
    return enterprise_log_manager.compliance.log_audit_event(
        event_type, user_id, resource, action, outcome, **metadata
    )