"""
API Cache Utilities - Site-Aware Caching for API endpoints
Creates proper cache keys that include site parameters to prevent filtering issues
"""

import hashlib
import json
from functools import wraps
from flask import request
from services.consolidated_cache_service import cache_service
import logging

logger = logging.getLogger(__name__)

def generate_api_cache_key(endpoint_name: str, **kwargs) -> str:
    """
    Generate cache key for API endpoints that includes site filtering
    """
    # Get site parameter - handle both individual site and multi-site requests
    site_code = request.args.get('site_code') or request.args.get('site_id')
    if site_code:
        # Individual site request (e.g., redox time series)
        sites_key = str(site_code)
    else:
        # Multi-site request - try centralized utility
        from utils.request_parsing import parse_sites_parameter
        sites = parse_sites_parameter(['S1', 'S2', 'S3'])
        sites_key = ','.join(sorted(sites)) if sites else 'default'
    
    # Get other key parameters
    time_range = request.args.get('time_range', 'Last_30_Days')
    start_date = request.args.get('start_date', '')
    end_date = request.args.get('end_date', '')
    performance_mode = request.args.get('performance_mode', 'balanced')
    
    # Include additional parameters for redox endpoints
    start_ts = request.args.get('start_ts', '')
    end_ts = request.args.get('end_ts', '')
    resolution = request.args.get('resolution', '')
    max_depths = request.args.get('max_depths', '')
    chunk_size = request.args.get('chunk_size', '')
    offset = request.args.get('offset', '0')
    
    # Include any additional parameters
    extra_params = {}
    for key, value in kwargs.items():
        if value is not None:
            extra_params[key] = str(value)
    
    # Create cache key components
    key_data = {
        'endpoint': endpoint_name,
        'sites': sites_key,
        'time_range': time_range,
        'start_date': start_date,
        'end_date': end_date,
        'performance_mode': performance_mode,
        'start_ts': start_ts,
        'end_ts': end_ts,
        'resolution': resolution,
        'max_depths': max_depths,
        'chunk_size': chunk_size,
        'offset': offset,
        **extra_params
    }
    
    # Generate deterministic hash
    key_json = json.dumps(key_data, sort_keys=True)
    key_hash = hashlib.md5(key_json.encode()).hexdigest()[:12]
    
    # Handle custom time ranges properly by including actual dates in cache key
    if time_range == 'custom' and start_date and end_date:
        # For custom ranges, include actual dates to prevent cache collisions
        date_component = f"custom_{start_date}_{end_date}"
    else:
        date_component = time_range
    
    cache_key = f"{endpoint_name}:{sites_key}:{date_component}:{key_hash}"
    logger.debug(f"🔑 Generated API cache key: {cache_key}")
    
    return cache_key

def cached_api_response(ttl: int = 900):
    """
    Decorator for caching API responses with proper site-aware keys
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate proper cache key
            endpoint_name = func.__name__
            cache_key = generate_api_cache_key(endpoint_name)
            
            # Try to get from cache
            cached_result = cache_service.get(cache_key)
            if cached_result is not None:
                logger.info(f"🚀 [CACHE HIT] Serving {endpoint_name} from cache")
                return cached_result
            
            # Execute function
            logger.info(f"🔄 [CACHE MISS] Executing {endpoint_name}")
            result = func(*args, **kwargs)
            
            # Cache the result
            cache_service.set(cache_key, result, ttl)
            logger.info(f"💾 [CACHED] Stored {endpoint_name} result for {ttl}s")
            
            return result
        
        return wrapper
    return decorator

def invalidate_api_cache(endpoint_name: str = None, sites: list = None):
    """
    Invalidate cached API responses
    """
    if endpoint_name is None:
        # Clear all API cache entries
        logger.info("🗑️ [CACHE CLEAR] Clearing all API cache entries")
        cache_service.clear_pattern("*_data:*")
    else:
        # Clear specific endpoint cache
        pattern = f"{endpoint_name}:*"
        if sites:
            sites_key = ','.join(sorted(sites))
            pattern = f"{endpoint_name}:{sites_key}:*"
        
        logger.info(f"🗑️ [CACHE CLEAR] Clearing cache pattern: {pattern}")
        cache_service.clear_pattern(pattern)