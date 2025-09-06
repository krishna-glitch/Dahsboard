"""
Advanced Logging Configuration for Flask Migration
"""

import logging
import sys
from datetime import datetime
from typing import Dict, Any, Optional

class FlaskMigrationLogger:
    """Custom logger for Flask migration"""
    
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(logging.INFO)
        
        if not self.logger.handlers:
            # Console handler
            console_handler = logging.StreamHandler(sys.stdout)
            console_handler.setLevel(logging.INFO)
            
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            console_handler.setFormatter(formatter)
            self.logger.addHandler(console_handler)
    
    def info(self, message: str):
        self.logger.info(message)
    
    def error(self, message: str, exc_info: bool = False):
        self.logger.error(message, exc_info=exc_info)
    
    def warning(self, message: str):
        self.logger.warning(message)
    
    def debug(self, message: str):
        self.logger.debug(message)

def initialize_advanced_logging(
    log_level: str = 'INFO',
    enable_console: bool = True,
    enable_file: bool = False,
    enable_json: bool = False,
    enable_performance: bool = False
) -> Dict[str, Any]:
    """Initialize advanced logging system"""
    
    logging_config = {
        'log_level': log_level,
        'handlers': {
            'console': enable_console,
            'file': enable_file,
            'json': enable_json,
            'performance': enable_performance
        },
        'initialized_at': datetime.now().isoformat()
    }
    
    return logging_config

def get_advanced_logger(name: str) -> FlaskMigrationLogger:
    """Get an advanced logger instance"""
    return FlaskMigrationLogger(name)