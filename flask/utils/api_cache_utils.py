"""
API Cache Utilities - Site-Aware Caching for API endpoints
Creates proper cache keys that include site parameters to prevent filtering issues
"""

import hashlib
import json
from functools import wraps
from flask import request
from services.consolidated_cache_service import cache_service
from utils.data_compressor import compressor
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
    
    # Get fidelity parameter for smart caching
    max_fidelity = request.args.get('max_fidelity', '').lower() in ('1', 'true', 'yes', 'on', 't')
    fidelity_level = 'max' if max_fidelity else 'std'
    
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
        'fidelity': fidelity_level,
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

def get_compatible_cached_data(base_cache_key: str, requested_fidelity: str):
    """
    Check for compatible cached data using fidelity hierarchy.
    For standard fidelity requests, check if max fidelity data exists.
    """
    if requested_fidelity == 'std':
        # Try to find max fidelity version of the same data
        max_fidelity_key = base_cache_key.replace(':std:', ':max:')
        if max_fidelity_key != base_cache_key:
            compressed_data = cache_service.get(max_fidelity_key)
            if compressed_data:
                try:
                    cached_data = compressor.decompress_json(compressed_data)
                    logger.info(f"🚀 [FIDELITY CACHE] Found max fidelity data for std request: {max_fidelity_key}")
                    return cached_data, 'max_for_std'
                except Exception as e:
                    logger.warning(f"Failed to decompress cache data for {max_fidelity_key}: {e}")
    
    # Check for exact match
    compressed_data = cache_service.get(base_cache_key)
    if compressed_data:
        try:
            cached_data = compressor.decompress_json(compressed_data)
            return cached_data, 'exact'
        except Exception as e:
            logger.warning(f"Failed to decompress cache data for {base_cache_key}: {e}")
    
    return None, None

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
            
            # Get current fidelity level for hierarchical checking
            max_fidelity = request.args.get('max_fidelity', '').lower() in ('1', 'true', 'yes', 'on', 't')
            requested_fidelity = 'max' if max_fidelity else 'std'
            
            # Try hierarchical cache lookup
            cached_result, cache_type = get_compatible_cached_data(cache_key, requested_fidelity)
            if cached_result is not None:
                if cache_type == 'max_for_std':
                    logger.info(f"🚀 [FIDELITY CACHE HIT] Serving {endpoint_name} from max fidelity cache for std request")
                    # TODO: Apply server-side filtering here if needed for data size optimization
                    return cached_result
                else:
                    logger.info(f"🚀 [CACHE HIT] Serving {endpoint_name} from cache")
                    return cached_result
            
            # Execute function
            logger.info(f"🔄 [CACHE MISS] Executing {endpoint_name}")
            result = func(*args, **kwargs)
            
            # Cache the result with compression to save memory (especially important for 30min TTL)
            try:
                compressed_result = compressor.compress_json(result)
                cache_service.set(cache_key, compressed_result, ttl)
                
                # Calculate compression statistics
                original_size = len(json.dumps(result).encode()) if isinstance(result, dict) else len(str(result).encode())
                compressed_size = len(compressed_result)
                compression_ratio = original_size / compressed_size if compressed_size > 0 else 1
                
                logger.info(f"💾 [CACHED] Stored {endpoint_name} result for {ttl}s (fidelity: {requested_fidelity}) - {compression_ratio:.1f}x compression")
            except Exception as e:
                # Fallback to uncompressed storage if compression fails
                logger.warning(f"Compression failed for {endpoint_name}, storing uncompressed: {e}")
                cache_service.set(cache_key, result, ttl)
                logger.info(f"💾 [CACHED] Stored {endpoint_name} result for {ttl}s (fidelity: {requested_fidelity}) - uncompressed")
            
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