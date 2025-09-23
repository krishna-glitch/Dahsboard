"""
Redis API Cache Utilities - Enhanced cache utilities with Redis support
Drop-in replacement for api_cache_utils.py with Redis backend
"""

import hashlib
import json
from functools import wraps
from flask import request
from services.hybrid_cache_service import hybrid_cache_service
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
    """Normalize sites argument for consistent cache keys"""
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
    """Normalize time range and resolution parameters"""
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

def generate_redis_api_cache_key(endpoint_name: str, **kwargs) -> str:
    """
    Generate cache key for API endpoints with Redis optimization
    Enhanced with computed date ranges for proper time period handling
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
        elif norm_range == '180d':
            computed_end_date = current_time
            computed_start_date = computed_end_date - timedelta(days=180)
        elif norm_range == '365d':
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

    # ESSENTIAL: Include only the 6 essential parameters that affect data results
    # Simplified from 19 parameters to reduce complexity while maintaining functionality
    parameters = request.args.get('parameters', '')  # Selected water quality parameters
    no_downsample = request.args.get('no_downsample', 'false')  # Performance option

    # Exclude chunk_size/offset from key to reduce fragmentation

    # Include any additional parameters
    extra_params = {}
    for key, value in kwargs.items():
        if value is not None:
            extra_params[key] = str(value)

    # Create cache key components - simplified to 6 essential parameters
    # This reduces complexity while maintaining correct cache differentiation
    key_data = {
        'endpoint': endpoint_name,
        'sites': sites_key,
        'time_range': norm_range,
        'start_date': start_date,
        'end_date': end_date,
        'performance_mode': performance_mode,
        # Essential filter parameters only
        'parameters': parameters,
        'no_downsample': no_downsample,
        **extra_params
    }

    # Validate and sanitize parameters
    key_data = _validate_and_normalize_params(key_data)

    # Generate deterministic hash with better distribution for Redis
    key_json = json.dumps(key_data, sort_keys=True)
    key_hash = hashlib.sha256(key_json.encode()).hexdigest()[:20]  # Increased to 20 chars (~1T possibilities)

    # Handle custom time ranges properly by including actual dates in cache key
    if norm_range == 'custom' and start_date and end_date:
        # For custom ranges, include actual dates to prevent cache collisions
        date_component = f"custom_{start_date}_{end_date}"
    else:
        date_component = norm_range

    # Create Redis-optimized cache key (shorter, more efficient)
    cache_key = f"{endpoint_name}:{sites_key}:{date_component}:{key_hash}"

    # Log cache key metrics for monitoring
    _log_cache_key_metrics(cache_key, key_data)

    logger.debug(f"Generated cache key: {cache_key}")
    logger.debug(f"Key components: sites={sites_key}, range={norm_range}, dates={start_date} to {end_date}")

    return cache_key

def get_compatible_redis_cached_data(base_cache_key: str, requested_fidelity: str):
    """
    Check for compatible cached data using fidelity hierarchy with Redis
    """
    if requested_fidelity == 'std':
        # Try to find max fidelity version of the same data
        max_fidelity_key = base_cache_key.replace(':std:', ':max:')
        if max_fidelity_key != base_cache_key:
            cached_data = hybrid_cache_service.get(max_fidelity_key)
            if cached_data:
                logger.cache_operation("hit", max_fidelity_key, "max fidelity for std request")
                return cached_data, 'max_for_std'

    # Check for exact match
    cached_data = hybrid_cache_service.get(base_cache_key)
    if cached_data:
        return cached_data, 'exact'

    return None, None

def redis_cached_api_response(ttl: int = 1800):  # Default 30 minutes for Redis
    """
    Redis-enhanced decorator for caching API responses
    Provides advanced caching with Redis persistence and smart compression
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate proper cache key
            endpoint_name = func.__name__
            cache_key = generate_redis_api_cache_key(endpoint_name)

            # Get current fidelity level for hierarchical checking
            max_fidelity = request.args.get('max_fidelity', '').lower() in ('1', 'true', 'yes', 'on', 't')
            requested_fidelity = 'max' if max_fidelity else 'std'

            # Try hierarchical cache lookup
            cached_result, cache_type = get_compatible_redis_cached_data(cache_key, requested_fidelity)
            if cached_result is not None:
                if cache_type == 'max_for_std':
                    logger.cache_operation("hit", cache_key, f"max fidelity for {endpoint_name}")
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

            # Cache the JSON payload with Redis
            try:
                success = hybrid_cache_service.set(cache_key, json_payload, ttl)

                if success:
                    cache_mode = hybrid_cache_service.get_cache_mode()
                    logger.cache_operation("store", cache_key, f"{endpoint_name} ({cache_mode}, {ttl}s)")
                else:
                    logger.cache_operation("error", cache_key, f"Store failed for {endpoint_name}")

            except Exception as e:
                logger.cache_operation("error", cache_key, f"Cache failed for {endpoint_name}: {e}")

            return result

        return wrapper
    return decorator

def invalidate_redis_api_cache(endpoint_name: str = None, sites: list = None):
    """
    Invalidate cached API responses in Redis
    """
    if endpoint_name is None:
        # Clear all API cache entries
        logger.cache_operation("clear", None, "all API cache entries")
        hybrid_cache_service.clear_pattern("*_data:*")
    else:
        # Clear specific endpoint cache
        pattern = f"{endpoint_name}:*"
        if sites:
            sites_key = ','.join(sorted(sites))
            pattern = f"{endpoint_name}:{sites_key}:*"

        logger.cache_operation("clear", pattern, f"endpoint {endpoint_name}")
        hybrid_cache_service.clear_pattern(pattern)

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

def get_redis_cache_stats() -> dict:
    """Get Redis cache statistics"""
    return hybrid_cache_service.get_detailed_stats()

def test_redis_connection() -> dict:
    """Test Redis connection status"""
    return hybrid_cache_service.ping()

# Backward compatibility - these functions can be used as drop-in replacements
generate_api_cache_key = generate_redis_api_cache_key
get_compatible_cached_data = get_compatible_redis_cached_data
cached_api_response = redis_cached_api_response
invalidate_api_cache = invalidate_redis_api_cache