"""
Centralized Request Parameter Parsing Utilities
Eliminates code duplication for common parameter parsing patterns
"""

from typing import List, Optional, Dict, Any
from flask import request
import logging

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)


def parse_sites_parameter(default_sites: List[str] = None) -> List[str]:
    """
    Parse sites parameter from Flask request with consistent handling
    
    Supports multiple formats:
    - ?sites[]=S1&sites[]=S2 (array format)
    - ?sites=S1&sites=S2 (multiple values)
    - ?sites=S1,S2,S3 (comma-separated)
    - ?sites (empty/missing)
    
    Args:
        default_sites: Default sites to return if none specified
        
    Returns:
        List of cleaned site codes
    """
    if default_sites is None:
        default_sites = ['S1', 'S2', 'S3']
    
    try:
        # Try array format first: sites[] or sites
        sites_list = request.args.getlist('sites[]') or request.args.getlist('sites') or []
        
        # Handle comma-separated format for backward compatibility
        if sites_list and len(sites_list) == 1 and ',' in sites_list[0]:
            # If we have one element with commas, split it
            sites_list = sites_list[0].split(',')
        elif not sites_list:
            # Fallback to single string parameter
            sites_str = request.args.get('sites', '')
            sites_list = sites_str.split(',') if sites_str else []
        
        # Clean up any empty strings and normalize
        sites = [site.strip().upper() for site in sites_list if site.strip()]
        
        # Return defaults if no valid sites found
        if not sites:
            sites = default_sites
            
        logger.debug(f"🔍 Parsed sites parameter: {sites}")
        return sites
        
    except Exception as e:
        logger.warning(f"Failed to parse sites parameter: {e}, using defaults")
        return default_sites


def parse_time_range_parameters() -> Dict[str, Any]:
    """
    Parse time range related parameters from Flask request
    
    Returns:
        Dictionary with time range parameters
    """
    try:
        time_range = request.args.get('time_range', 'Last 30 Days')
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        
        # Parse dates if provided
        start_date = None
        end_date = None
        
        if start_date_str:
            from datetime import datetime
            try:
                start_date = datetime.fromisoformat(start_date_str.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                logger.warning(f"Invalid start_date format: {start_date_str}")
                
        if end_date_str:
            from datetime import datetime
            try:
                end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                logger.warning(f"Invalid end_date format: {end_date_str}")
        
        return {
            'time_range': time_range,
            'start_date': start_date,
            'end_date': end_date,
            'start_date_str': start_date_str,
            'end_date_str': end_date_str
        }
        
    except Exception as e:
        logger.error(f"Failed to parse time range parameters: {e}")
        return {
            'time_range': 'Last 30 Days',
            'start_date': None,
            'end_date': None,
            'start_date_str': None,
            'end_date_str': None
        }


def parse_data_type_parameter(valid_types: List[str] = None) -> str:
    """
    Parse data_type parameter with validation
    
    Args:
        valid_types: List of valid data types
        
    Returns:
        Validated data type string
    """
    if valid_types is None:
        valid_types = ['water_quality', 'redox', 'both', 'all']
    
    data_type = request.args.get('data_type', 'both')
    
    # Normalize and validate
    data_type = data_type.lower().strip()
    
    if data_type not in valid_types:
        logger.warning(f"Invalid data_type '{data_type}', using 'both'")
        data_type = 'both'
    
    return data_type


def parse_performance_parameters() -> Dict[str, Any]:
    """
    Parse performance-related parameters
    
    Returns:
        Dictionary with performance parameters
    """
    return {
        'performance_mode': request.args.get('performance_mode', 'balanced'),
        'cache_enabled': request.args.get('cache', 'true').lower() == 'true',
        'refresh_cache': request.args.get('refresh_cache', 'false').lower() == 'true',
        'max_records': int(request.args.get('max_records', 10000)),
        'timeout': int(request.args.get('timeout', 30))
    }


def parse_pagination_parameters() -> Dict[str, int]:
    """
    Parse pagination parameters
    
    Returns:
        Dictionary with pagination parameters
    """
    try:
        page = max(1, int(request.args.get('page', 1)))
        page_size = min(1000, max(10, int(request.args.get('page_size', 100))))
        offset = (page - 1) * page_size
        
        return {
            'page': page,
            'page_size': page_size,
            'offset': offset,
            'limit': page_size
        }
        
    except (ValueError, TypeError) as e:
        logger.warning(f"Invalid pagination parameters: {e}, using defaults")
        return {
            'page': 1,
            'page_size': 100,
            'offset': 0,
            'limit': 100
        }


def parse_filter_parameters() -> Dict[str, Any]:
    """
    Parse filtering parameters
    
    Returns:
        Dictionary with filter parameters
    """
    filters = {}
    
    # Standard filter parameters
    for param_name in ['min_value', 'max_value', 'quality_threshold', 'status', 'level']:
        value = request.args.get(param_name)
        if value is not None:
            # Try to convert numeric values
            try:
                if '.' in value:
                    filters[param_name] = float(value)
                else:
                    filters[param_name] = int(value)
            except (ValueError, TypeError):
                filters[param_name] = value
    
    # Boolean filters
    for param_name in ['include_inactive', 'exclude_errors', 'verified_only']:
        value = request.args.get(param_name)
        if value is not None:
            filters[param_name] = value.lower() in ['true', '1', 'yes', 'on']
    
    return filters


def get_request_summary() -> Dict[str, Any]:
    """
    Get a summary of all parsed request parameters for logging/debugging
    
    Returns:
        Dictionary with request summary
    """
    return {
        'sites': parse_sites_parameter(),
        'time_range': parse_time_range_parameters(),
        'data_type': parse_data_type_parameter(),
        'performance': parse_performance_parameters(),
        'pagination': parse_pagination_parameters(),
        'filters': parse_filter_parameters(),
        'endpoint': request.endpoint,
        'method': request.method,
        'url': request.url
    }