"""
Improved Logging Configuration - Reduces noise and provides clear categories
"""

import logging
import sys
import os
from datetime import datetime
from typing import Dict, Any, Optional
from enum import Enum

class LogCategory(Enum):
    """Log categories for better organization"""
    API = "API"
    CACHE = "CACHE"
    DATABASE = "DB"
    PERFORMANCE = "PERF"
    SECURITY = "SEC"
    ERROR = "ERROR"
    BUSINESS = "BIZ"

class LogLevel(Enum):
    """Custom log levels"""
    CRITICAL = 50
    ERROR = 40
    WARNING = 30
    INFO = 20
    DEBUG = 10
    TRACE = 5

class SmartLogger:
    """Smart logger that reduces noise and provides structured output"""

    def __init__(self, name: str, category: LogCategory = None):
        self.logger = logging.getLogger(name)
        self.category = category or LogCategory.API
        self.name = name

        # Set log level based on environment
        log_level = os.getenv('LOG_LEVEL', 'INFO').upper()
        self.logger.setLevel(getattr(logging, log_level, logging.INFO))

        # Configure based on verbosity setting
        self.verbose = os.getenv('LOG_VERBOSE', 'false').lower() == 'true'
        self.cache_debug = os.getenv('CACHE_DEBUG', 'false').lower() == 'true'

        if not self.logger.handlers:
            self._setup_handlers()

    def _setup_handlers(self):
        """Setup log handlers with smart formatting"""
        console_handler = logging.StreamHandler(sys.stdout)

        # Use compact format for production, verbose for debug
        if self.verbose:
            formatter = logging.Formatter(
                '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
                datefmt='%H:%M:%S'
            )
        else:
            formatter = logging.Formatter(
                '[%(levelname)s] %(message)s'
            )

        console_handler.setFormatter(formatter)
        self.logger.addHandler(console_handler)

    def _should_log_cache(self, operation: str) -> bool:
        """Determine if cache operation should be logged"""
        if self.cache_debug:
            return True

        # Only log cache hits/misses in verbose mode
        if operation in ['hit', 'miss', 'store']:
            return self.verbose

        # Always log cache errors and warming
        if operation in ['error', 'warm', 'clear']:
            return True

        return False

    def api_request(self, endpoint: str, duration_ms: float = None, status: str = "success"):
        """Log API requests concisely"""
        if duration_ms:
            self.logger.info(f"{self.category.value}: {endpoint} {status} ({duration_ms:.0f}ms)")
        else:
            self.logger.info(f"{self.category.value}: {endpoint} {status}")

    def cache_operation(self, operation: str, key: str = None, details: str = None):
        """Log cache operations with smart filtering"""
        if not self._should_log_cache(operation):
            return

        key_display = key[:30] + "..." if key and len(key) > 30 else key or ""

        if operation == "hit":
            self.logger.debug(f"CACHE: Hit {key_display}")
        elif operation == "miss":
            self.logger.debug(f"CACHE: Miss {key_display}")
        elif operation == "store":
            self.logger.debug(f"CACHE: Stored {key_display}")
        elif operation == "error":
            self.logger.warning(f"CACHE: Error {details}")
        elif operation == "warm":
            self.logger.info(f"CACHE: Warmed {details}")
        elif operation == "clear":
            self.logger.info(f"CACHE: Cleared {details}")

    def database_query(self, query_type: str, duration_ms: float = None, records: int = None):
        """Log database operations"""
        if duration_ms and records is not None:
            self.logger.info(f"DB: {query_type} {records} records ({duration_ms:.0f}ms)")
        elif duration_ms:
            self.logger.info(f"DB: {query_type} ({duration_ms:.0f}ms)")
        else:
            self.logger.info(f"DB: {query_type}")

    def performance_metric(self, metric: str, value: float, unit: str = "ms"):
        """Log performance metrics"""
        self.logger.info(f"PERF: {metric} {value:.1f}{unit}")

    def business_event(self, event: str, details: str = None):
        """Log business logic events"""
        if details:
            self.logger.info(f"BIZ: {event} - {details}")
        else:
            self.logger.info(f"BIZ: {event}")

    def security_event(self, event: str, details: str = None):
        """Log security events (always logged)"""
        if details:
            self.logger.warning(f"SEC: {event} - {details}")
        else:
            self.logger.warning(f"SEC: {event}")

    def error(self, message: str, exc_info: bool = False, context: Dict = None):
        """Log errors with context"""
        if context:
            context_str = " | ".join([f"{k}={v}" for k, v in context.items()])
            self.logger.error(f"ERROR: {message} | {context_str}", exc_info=exc_info)
        else:
            self.logger.error(f"ERROR: {message}", exc_info=exc_info)

    def warning(self, message: str, context: Dict = None):
        """Log warnings"""
        if context:
            context_str = " | ".join([f"{k}={v}" for k, v in context.items()])
            self.logger.warning(f"WARN: {message} | {context_str}")
        else:
            self.logger.warning(f"WARN: {message}")

    def info(self, message: str):
        """Basic info logging (for backward compatibility)"""
        self.logger.info(message)

    def debug(self, message: str):
        """Debug logging (only in verbose mode)"""
        if self.verbose:
            self.logger.debug(message)

def get_smart_logger(name: str, category: LogCategory = None) -> SmartLogger:
    """Get a smart logger instance"""
    return SmartLogger(name, category)

def configure_app_logging():
    """Configure application-wide logging settings"""
    # Suppress noisy third-party loggers
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    logging.getLogger('requests').setLevel(logging.WARNING)
    logging.getLogger('boto3').setLevel(logging.WARNING)
    logging.getLogger('botocore').setLevel(logging.WARNING)

    # Set cache loggers to WARNING unless debug enabled
    cache_debug = os.getenv('CACHE_DEBUG', 'false').lower() == 'true'
    if not cache_debug:
        logging.getLogger('services.redis_cache_service').setLevel(logging.WARNING)
        logging.getLogger('services.high_performance_cache_service').setLevel(logging.WARNING)
        logging.getLogger('utils.redis_api_cache_utils').setLevel(logging.WARNING)
        logging.getLogger('utils.api_cache_utils').setLevel(logging.WARNING)

# For backward compatibility
def get_advanced_logger(name: str) -> SmartLogger:
    """Backward compatibility function"""
    return get_smart_logger(name)