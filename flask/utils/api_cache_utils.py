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
from utils.smart_compression import smart_compressor
from flask import Response as FlaskResponse
from config.improved_logging_config import get_smart_logger, LogCategory

logger = get_smart_logger(__name__, LogCategory.CACHE)

def _validate_and_normalize_params(params: dict) -> dict:
    """Validate and sanitize cache key parameters"""
    validated = {}

    # Validate and normalize each parameter
    for key, value in params.items():
        if value is None:
            continue

        # Convert to string and limit length
        str_value = str(value)[:500]  # Limit parameter length

        # Basic sanitization
        if isinstance(value, str):
            str_value = str_value.strip()

        validated[key] = str_value

    return validated

def _normalize_sites_arg() -> str:
    sites_param = request.args.get('sites', '')
    if sites_param:
        try:
            # Limit number of sites to prevent oversized keys
            sites = [s.strip().upper() for s in sites_param.split(',') if s.strip()][:20]
            return ','.join(sorted(set(sites)))
        except Exception:
            return sites_param[:100]  # Limit length
    site_code = request.args.get('site_code') or request.args.get('site_id')
    if site_code:
        return str(site_code).upper()[:20]  # Limit length
    return 'default'

def _normalize_range_and_resolution():
    tr = (request.args.get('time_range') or '').lower()
    mapping = {
        'last 24 hours': '1d', '1d': '1d', '24h': '1d',
        'last 7 days': '7d', '7d': '7d',
        'last 30 days': '30d', '30d': '30d',
        'last 90 days': '90d', '90d': '90d',
        'last 6 months': '180d', '180d': '180d', '6m': '180d',
        'last 1 year': '365d', '365d': '365d', '1y': '365d',
        'custom': 'custom'
    }
    norm_range = mapping.get(tr, tr or '90d')
    res_map = {'1d': '15min', '7d': '15min', '30d': '30min', '90d': '2h', '180d': '6h', '365d': '2h'}
    resolution = (request.args.get('resolution') or '').lower()
    norm_res = resolution or (res_map.get(norm_range, 'raw'))
    return norm_range, norm_res

def generate_api_cache_key(endpoint_name: str, **kwargs) -> str:
    """
    Generate cache key for API endpoints that includes site filtering and computed date ranges
    """
    # Get site parameter - handle both individual site and multi-site requests
    sites_key = _normalize_sites_arg()

    # Get other key parameters
    norm_range, norm_res = _normalize_range_and_resolution()
    start_date = request.args.get('start_date', '')
    end_date = request.args.get('end_date', '')
    performance_mode = request.args.get('performance_mode', 'balanced')

    # CRITICAL FIX: For non-custom ranges, include computed dates in cache key
    # This prevents different time periods from hitting the same cache entry
    if norm_range != 'custom' and not start_date and not end_date:
        from datetime import datetime, timedelta

        # Use current date for preset ranges - align with API behavior
        current_time = datetime.now()

        if norm_range in ['1d', '24h']:
            computed_end_date = current_time
            computed_start_date = computed_end_date - timedelta(days=1)
        elif norm_range == '7d':
            computed_end_date = current_time
            computed_start_date = computed_end_date - timedelta(days=7)
        elif norm_range == '30d':
            computed_end_date = current_time
            computed_start_date = computed_end_date - timedelta(days=30)
        elif norm_range == '90d':
            computed_end_date = current_time
            computed_start_date = computed_end_date - timedelta(days=90)
        elif norm_range in ['180d', '6m']:
            computed_end_date = current_time
            computed_start_date = computed_end_date - timedelta(days=180)
        elif norm_range in ['365d', '1y']:
            computed_end_date = current_time
            computed_start_date = computed_end_date - timedelta(days=365)
        else:
            # Fallback using config service
            try:
                days_back = config_service.get_days_back_for_range(f"Last {norm_range}")
                computed_end_date = current_time
                computed_start_date = computed_end_date - timedelta(days=days_back)
            except:
                computed_end_date = current_time
                computed_start_date = computed_end_date - timedelta(days=90)

        # Use computed dates for cache key to ensure different time ranges have different cache entries
        start_date = computed_start_date.strftime('%Y-%m-%d')
        end_date = computed_end_date.strftime('%Y-%m-%d')

    # Get fidelity parameter for smart caching
    max_fidelity = request.args.get('max_fidelity', '').lower() in ('1', 'true', 'yes', 'on', 't')
    fidelity_level = 'max' if max_fidelity else 'std'

    # Include additional parameters for redox endpoints
    start_ts = request.args.get('start_ts', '')
    end_ts = request.args.get('end_ts', '')
    resolution = norm_res
    max_depths = request.args.get('max_depths', '')

    # CRITICAL FIX: Include only essential parameters that affect server-side data results
    # Exclude UI-only parameters to reduce cache fragmentation
    parameters = request.args.get('parameters', '')  # Selected water quality parameters
    no_downsample = request.args.get('no_downsample', 'false')  # Performance option
    data_quality = request.args.get('data_quality', '')  # Data quality filter
    alert_level = request.args.get('alert_level', '')  # Alert level filter

    # Exclude chunk_size/offset from key to reduce fragmentation
    # Exclude UI-only parameters: selectedParameter, compareMode, compareParameter

    # Include any additional parameters
    extra_params = {}
    for key, value in kwargs.items():
        if value is not None:
            extra_params[key] = str(value)
    
    # Create cache key components - optimized for cache hit ratio
    # Only include parameters that affect server-side data processing
    key_data = {
        'endpoint': endpoint_name,
        'sites': sites_key,
        'time_range': norm_range,
        'start_date': start_date,
        'end_date': end_date,
        'performance_mode': performance_mode,
        # Essential server-side filter parameters only
        'parameters': parameters,
        'no_downsample': no_downsample,
        'data_quality': data_quality,
        'alert_level': alert_level,
        **extra_params
    }
    
    # Validate and sanitize parameters
    key_data = _validate_and_normalize_params(key_data)

    # Generate deterministic hash with better collision resistance
    key_json = json.dumps(key_data, sort_keys=True)
    key_hash = hashlib.sha256(key_json.encode()).hexdigest()[:20]  # Increased to 20 chars (~1T possibilities)
    
    # Handle custom time ranges properly by including actual dates in cache key
    if norm_range == 'custom' and start_date and end_date:
        # For custom ranges, include actual dates to prevent cache collisions
        date_component = f"custom_{start_date}_{end_date}"
    else:
        date_component = norm_range
    
    cache_key = f"{endpoint_name}:{sites_key}:{date_component}:{key_hash}"
    # Log cache key metrics for monitoring
    _log_cache_key_metrics(cache_key, key_data)

    logger.debug(f"Generated cache key: {cache_key}")
    logger.debug(f"Key components: sites={sites_key}, range={norm_range}, dates={start_date} to {end_date}")

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
                    # Try smart decompression first, fallback to legacy
                    if hasattr(compressed_data, 'method'):
                        cached_data = smart_compressor.decompress_json(compressed_data)
                    else:
                        cached_data = compressor.decompress_json(compressed_data)
                    logger.cache_operation("hit", max_fidelity_key, "max fidelity for std request")
                    return cached_data, 'max_for_std'
                except Exception as e:
                    logger.warning(f"Failed to decompress cache data for {max_fidelity_key}: {e}")
    
    # Check for exact match
    compressed_data = cache_service.get(base_cache_key)
    if compressed_data:
        try:
            # Try smart decompression first, fallback to legacy
            if hasattr(compressed_data, 'method'):
                cached_data = smart_compressor.decompress_json(compressed_data)
            else:
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
                    logger.cache_operation("hit", cache_key, f"max fidelity for {endpoint_name}")
                    # TODO: Apply server-side filtering here if needed for data size optimization
                    return cached_result
                else:
                    logger.cache_operation("hit", cache_key, endpoint_name)
                    return cached_result
            
            # Execute function
            logger.cache_operation("miss", cache_key, endpoint_name)
            result = func(*args, **kwargs)

            # Determine if result is cacheable JSON (dict) and extract payload if wrapped
            def extract_json_payload(resp_like):
                # Unwrap (response, status) tuples
                obj = resp_like[0] if (isinstance(resp_like, tuple) and len(resp_like) >= 1) else resp_like
                # If already a dict, return directly
                if isinstance(obj, dict):
                    return obj
                # If Flask Response with JSON body, parse
                if isinstance(obj, FlaskResponse):
                    try:
                        data = obj.get_json(silent=True)
                        if isinstance(data, dict):
                            return data
                    except Exception:
                        pass
                return None

            json_payload = extract_json_payload(result)

            if json_payload is None:
                # Non-JSON or streaming responses (e.g., Arrow) should not be cached to avoid serialization issues
                logger.debug(f"Cache bypass: Non-JSON response for {endpoint_name}")
                return result

            # Cache the JSON payload with smart compression
            try:
                # Determine data type for smart compression
                data_type = _determine_data_type(endpoint_name, json_payload)
                
                # Use smart compression
                compression_result = smart_compressor.compress_json(json_payload, data_type)
                cache_service.set(cache_key, compression_result, ttl)

                logger.cache_operation("store", cache_key,
                                     f"{endpoint_name} (smart, {data_type}, {ttl}s, {compression_result.compression_ratio:.1f}x)")
            except Exception as e:
                # Fallback to legacy compression
                logger.warning(f"Smart compression failed for {endpoint_name}, using legacy: {e}")
                try:
                    compressed_result = compressor.compress_json(json_payload)
                    cache_service.set(cache_key, compressed_result, ttl)
                    original_size = len(json.dumps(json_payload).encode())
                    compressed_size = len(compressed_result)
                    compression_ratio = original_size / compressed_size if compressed_size > 0 else 1
                    logger.cache_operation("store", cache_key,
                                         f"{endpoint_name} (legacy, {ttl}s, {compression_ratio:.1f}x)")
                except Exception as e2:
                    # Final fallback to uncompressed
                    logger.warning(f"All compression failed for {endpoint_name}: {e2}")
                    cache_service.set(cache_key, json_payload, ttl)
                    logger.cache_operation("store", cache_key, f"{endpoint_name} (uncompressed, {ttl}s)")

            return result
        
        return wrapper
    return decorator

def _determine_data_type(endpoint_name: str, data: dict) -> str:
    """
    Determine data type for optimal compression strategy
    
    Args:
        endpoint_name: Name of the API endpoint
        data: Response data to analyze
        
    Returns:
        Data type string for compression optimization
    """
    # Endpoint-based heuristics
    if 'water_quality' in endpoint_name or 'redox' in endpoint_name:
        # Check if it looks like time series data
        if isinstance(data, dict):
            # Look for common time series data patterns
            if 'water_quality_data' in data or 'redox_data' in data or 'data' in data:
                sample_data = data.get('water_quality_data') or data.get('redox_data') or data.get('data')
                if isinstance(sample_data, list) and len(sample_data) > 0:
                    first_record = sample_data[0]
                    if isinstance(first_record, dict) and any(key in first_record for key in 
                        ['measurement_timestamp', 'timestamp', 'datetime']):
                        return 'time_series'
    
    if 'site_comparison' in endpoint_name:
        return 'spatial'
    
    if 'performance' in endpoint_name or 'stats' in endpoint_name:
        return 'general'
    
    # Data structure-based heuristics
    if isinstance(data, dict):
        # Check for time series indicators
        time_indicators = ['timestamp', 'datetime', 'measurement_timestamp', 'time']
        if any(indicator in str(data).lower() for indicator in time_indicators):
            return 'time_series'
        
        # Check for spatial indicators  
        spatial_indicators = ['lat', 'lon', 'latitude', 'longitude', 'coordinates', 'location']
        if any(indicator in str(data).lower() for indicator in spatial_indicators):
            return 'spatial'
    
    return 'general'

def _log_cache_key_metrics(cache_key: str, key_data: dict):
    """Log cache key statistics for monitoring"""
    try:
        key_length = len(cache_key)
        param_count = len(key_data)

        # Log metrics for monitoring cache key health
        logger.debug(f"📊 [CACHE KEY METRICS] Length: {key_length}, Params: {param_count}")

        # Warn if key is getting long
        if key_length > 200:
            logger.warning(f"⚠️ [CACHE KEY] Long cache key detected: {key_length} chars")

        # Warn if too many parameters
        if param_count > 15:
            logger.warning(f"⚠️ [CACHE KEY] Many parameters detected: {param_count} params")

    except Exception as e:
        logger.error(f"❌ Error logging cache key metrics: {e}")

def invalidate_api_cache(endpoint_name: str = None, sites: list = None):
    """
    Invalidate cached API responses
    """
    if endpoint_name is None:
        # Clear all API cache entries
        logger.cache_operation("clear", None, "all API cache entries")
        cache_service.clear_pattern("*_data:*")
    else:
        # Clear specific endpoint cache
        pattern = f"{endpoint_name}:*"
        if sites:
            sites_key = ','.join(sorted(sites))
            pattern = f"{endpoint_name}:{sites_key}:*"

        logger.cache_operation("clear", pattern, f"endpoint {endpoint_name}")
        cache_service.clear_pattern(pattern)
