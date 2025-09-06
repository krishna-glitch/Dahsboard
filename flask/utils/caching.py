"""
Flask API Caching Integration Utilities
Systematic caching decorators and utilities for Flask REST APIs
"""

import logging
import time
import hashlib
import json
from typing import Dict, Any, Callable, Optional, Union, List
from functools import wraps
from flask import jsonify, request, g
from datetime import datetime, timedelta

# Import the consolidated cache service
from services.consolidated_cache_service import (
    cache_service, cache_get, cache_set, cache_delete, cache_clear, 
    cache_stats, cached, get_cache_service
)

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

class APICacheManager:
    """
    Centralized cache management for Flask API endpoints
    """
    
    def __init__(self, default_ttl: int = 3600, cache_prefix: str = "api"):
        """
        Initialize API cache manager
        
        Args:
            default_ttl: Default cache TTL in seconds
            cache_prefix: Prefix for all API cache keys
        """
        self.default_ttl = default_ttl
        self.cache_prefix = cache_prefix
        self.cache_service = get_cache_service()
    
    def cache_endpoint(self, 
                      ttl: Optional[int] = None,
                      key_func: Optional[Callable] = None,
                      condition_func: Optional[Callable] = None,
                      vary_on: Optional[List[str]] = None):
        """
        Decorator to cache API endpoint responses
        
        Args:
            ttl: Cache TTL in seconds
            key_func: Custom function to generate cache key
            condition_func: Function to determine if response should be cached
            vary_on: List of request parameters to include in cache key
            
        Returns:
            Decorated endpoint function
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                cache_ttl = ttl or self.default_ttl
                
                # Generate cache key
                if key_func:
                    cache_key = key_func(*args, **kwargs)
                else:
                    cache_key = self._generate_endpoint_cache_key(f.__name__, vary_on, *args, **kwargs)
                # Ensure query string params are embedded in cache key to avoid cross-talk
                try:
                    if request and request.args:
                        # Stable, sorted key=value pairs
                        items = sorted(request.args.items(multi=True))
                        qsig = '&'.join([f"{k}={v}" for k, v in items])
                        cache_key = f"{cache_key}|{qsig}"
                except Exception:
                    pass
                
                # Check if we should use cache
                use_cache = request.args.get('no_cache', 'false').lower() != 'true'
                force_refresh = request.args.get('refresh_cache', 'false').lower() == 'true'
                
                if not use_cache or force_refresh:
                    # Skip cache or force refresh
                    if force_refresh:
                        cache_delete(cache_key)
                        logger.info(f"🔄 [API CACHE] Force refresh for endpoint {f.__name__}")
                    
                    result = f(*args, **kwargs)
                    
                    # Cache the result if conditions are met
                    if use_cache and self._should_cache_response(result, condition_func):
                        self._cache_api_response(cache_key, result, cache_ttl)
                    
                    return result
                
                # Try to get from cache
                start_time = time.time()
                cached_result = cache_get(cache_key)
                cache_lookup_time = (time.time() - start_time) * 1000
                
                if cached_result is not None:
                    # Cache hit - enhance response with cache metadata
                    logger.info(f"✅ [API CACHE] Cache HIT for {f.__name__} (lookup: {cache_lookup_time:.1f}ms)")
                    
                    if isinstance(cached_result, dict):
                        cached_result['cache_metadata'] = {
                            'cache_hit': True,
                            'cache_key': cache_key[:50] + '...' if len(cache_key) > 50 else cache_key,
                            'cache_lookup_time_ms': round(cache_lookup_time, 2),
                            'served_from_cache': True,
                            'timestamp': datetime.now().isoformat()
                        }
                    
                    return cached_result
                
                # Cache miss - execute function
                logger.info(f"❌ [API CACHE] Cache MISS for {f.__name__}")
                start_time = time.time()
                
                result = f(*args, **kwargs)
                execution_time = (time.time() - start_time) * 1000
                
                # Cache the result
                if self._should_cache_response(result, condition_func):
                    self._cache_api_response(cache_key, result, cache_ttl)
                
                # Enhance response with cache metadata
                if isinstance(result, dict):
                    result['cache_metadata'] = {
                        'cache_hit': False,
                        'cache_key': cache_key[:50] + '...' if len(cache_key) > 50 else cache_key,
                        'execution_time_ms': round(execution_time, 2),
                        'cached_for_seconds': cache_ttl,
                        'timestamp': datetime.now().isoformat()
                    }
                
                return result
            
            return decorated_function
        return decorator
    
    def cache_data_loader(self, 
                         ttl: Optional[int] = None,
                         key_prefix: str = "data",
                         version: str = "v1"):
        """
        Decorator specifically for data loading functions
        
        Args:
            ttl: Cache TTL in seconds
            key_prefix: Prefix for cache keys
            version: API version for cache invalidation
            
        Returns:
            Decorated data loader function
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                cache_ttl = ttl or self.default_ttl
                
                # Generate cache key for data loading
                cache_key = self._generate_data_cache_key(f.__name__, key_prefix, version, *args, **kwargs)
                
                # Check cache control parameters
                force_refresh = request.args.get('refresh_data', 'false').lower() == 'true'
                bypass_cache = request.args.get('no_cache', 'false').lower() == 'true'
                
                if force_refresh:
                    cache_delete(cache_key)
                    logger.info(f"🔄 [DATA CACHE] Force refresh for {f.__name__}")
                
                if not bypass_cache:
                    # Try cache first
                    start_time = time.time()
                    cached_data = cache_get(cache_key)
                    cache_time = (time.time() - start_time) * 1000
                    
                    if cached_data is not None:
                        logger.info(f"✅ [DATA CACHE] Cache HIT for {f.__name__} (lookup: {cache_time:.1f}ms)")
                        return cached_data
                
                # Load fresh data
                start_time = time.time()
                logger.info(f"🔄 [DATA CACHE] Loading fresh data for {f.__name__}")
                
                fresh_data = f(*args, **kwargs)
                load_time = (time.time() - start_time) * 1000
                
                # Cache the fresh data
                if fresh_data is not None and not bypass_cache:
                    cache_success = cache_set(cache_key, fresh_data, cache_ttl)
                    logger.info(f"💾 [DATA CACHE] Cached data for {f.__name__} (TTL: {cache_ttl}s, success: {cache_success})")
                
                logger.info(f"✅ [DATA CACHE] Fresh data loaded for {f.__name__} in {load_time:.1f}ms")
                return fresh_data
            
            return decorated_function
        return decorator
    
    def invalidate_pattern(self, pattern: str) -> int:
        """
        Invalidate cache keys matching a pattern (optimized version)
        
        Args:
            pattern: Pattern to match (supports wildcards * and ?)
            
        Returns:
            Number of keys invalidated
        """
        import fnmatch
        import re
        
        logger.info(f"🧹 [API CACHE] Cache invalidation pattern: {pattern}")
        
        invalidated_count = 0
        
        try:
            # Convert fnmatch pattern to regex for better performance
            regex_pattern = fnmatch.translate(pattern)
            regex_compiled = re.compile(regex_pattern)
            
            # Get cache instances to check
            cache_instances = []
            
            # Primary cache
            if self.cache:
                cache_instances.append(('primary', self.cache))
            
            # Consolidated cache if available
            try:
                from services.consolidated_cache_service import cache_service
                if cache_service:
                    cache_instances.append(('consolidated', cache_service))
            except ImportError:
                pass
            
            # Process each cache instance
            for cache_name, cache_instance in cache_instances:
                keys_to_invalidate = set()  # Use set to avoid duplicates
                
                # Get keys from different cache types
                try:
                    if hasattr(cache_instance, 'cache') and hasattr(cache_instance.cache, '_cache'):
                        # Flask-Caching style
                        cache_keys = list(cache_instance.cache._cache.keys())
                    elif hasattr(cache_instance, '_cache'):
                        # Simple dict cache
                        cache_keys = list(cache_instance._cache.keys())
                    elif hasattr(cache_instance, 'keys'):
                        # Cache with keys() method
                        cache_keys = list(cache_instance.keys())
                    else:
                        continue
                    
                    # Filter keys using compiled regex (faster than fnmatch)
                    for key in cache_keys:
                        key_str = str(key)
                        if regex_compiled.match(key_str):
                            keys_to_invalidate.add(key)
                    
                    # Batch invalidate matching keys
                    for key in keys_to_invalidate:
                        success = False
                        
                        # Try cache-specific deletion methods
                        if hasattr(cache_instance, 'delete') and callable(cache_instance.delete):
                            try:
                                cache_instance.delete(key)
                                success = True
                            except Exception:
                                pass
                        
                        if not success and hasattr(cache_instance, 'cache') and hasattr(cache_instance.cache, '_cache'):
                            try:
                                if key in cache_instance.cache._cache:
                                    del cache_instance.cache._cache[key]
                                    success = True
                            except Exception:
                                pass
                        
                        if not success and hasattr(cache_instance, '_cache'):
                            try:
                                if key in cache_instance._cache:
                                    del cache_instance._cache[key]
                                    success = True
                            except Exception:
                                pass
                        
                        if success:
                            invalidated_count += 1
                        else:
                            logger.warning(f"Failed to invalidate key {key} from {cache_name} cache")
                    
                    logger.debug(f"Invalidated {len(keys_to_invalidate)} keys from {cache_name} cache")
                    
                except Exception as e:
                    logger.warning(f"Error processing {cache_name} cache during invalidation: {e}")
            
            logger.info(f"✅ [API CACHE] Invalidated {invalidated_count} keys matching pattern '{pattern}'")
            
        except Exception as e:
            logger.error(f"❌ [API CACHE] Pattern invalidation failed: {e}")
            
        return invalidated_count
    
    def warm_cache(self, endpoint_func: Callable, params_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Pre-warm cache with common parameter combinations
        
        Args:
            endpoint_func: Function to warm cache for
            params_list: List of parameter dictionaries to pre-load
            
        Returns:
            Warming results summary
        """
        results = {
            'warmed_count': 0,
            'failed_count': 0,
            'total_time_ms': 0,
            'cache_keys': []
        }
        
        start_time = time.time()
        
        for params in params_list:
            try:
                logger.info(f"🔥 [CACHE WARM] Warming cache for {endpoint_func.__name__} with {params}")
                
                # Generate cache key
                cache_key = self._generate_endpoint_cache_key(
                    endpoint_func.__name__,
                    list(params.keys()),
                    **params
                )
                
                # Check if already cached
                if cache_get(cache_key) is not None:
                    logger.debug(f"⚡ [CACHE WARM] Already cached: {cache_key[:50]}...")
                    continue
                
                # Execute function directly to warm cache efficiently
                # Instead of using slow test client, call data loading functions directly
                from flask import current_app
                result = None
                
                try:
                    # Try to call the underlying data loading function directly
                    if hasattr(endpoint_func, '__wrapped__'):
                        # If it's a decorated function, get the original
                        result = endpoint_func.__wrapped__(**params)
                    else:
                        # For functions that need Flask context, create minimal context
                        with current_app.test_request_context(query_string=params):
                            result = endpoint_func(**params)
                except Exception as direct_call_error:
                    # Fallback to original method if direct call fails
                    logger.debug(f"Direct call failed, using test context: {direct_call_error}")
                    try:
                        with current_app.test_request_context(query_string=params):
                            result = endpoint_func(**params)
                    except Exception as fallback_error:
                        logger.warning(f"Cache warming failed for {endpoint_func.__name__}: {fallback_error}")
                        result = None
                
                # Store result in cache if successful
                if result is not None:
                    cache_set(cache_key, result, self.default_ttl)
                    results['warmed_count'] += 1
                    results['cache_keys'].append(cache_key)
                    logger.info(f"✅ [CACHE WARM] Warmed: {cache_key[:50]}...")
                
            except Exception as e:
                logger.error(f"❌ [CACHE WARM] Failed to warm cache: {e}")
                results['failed_count'] += 1
        
        results['total_time_ms'] = (time.time() - start_time) * 1000
        logger.info(f"🔥 [CACHE WARM] Completed: {results['warmed_count']} warmed, {results['failed_count']} failed")
        
        return results
    
    def get_cache_info(self, endpoint_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Get cache information and statistics
        
        Args:
            endpoint_name: Specific endpoint to get info for
            
        Returns:
            Cache information dictionary
        """
        stats = cache_stats()
        
        cache_info = {
            'general_stats': stats,
            'api_cache_prefix': self.cache_prefix,
            'default_ttl': self.default_ttl,
            'cache_service_type': type(self.cache_service).__name__,
            'cache_controls': {
                'no_cache_param': 'no_cache=true',
                'refresh_cache_param': 'refresh_cache=true',
                'refresh_data_param': 'refresh_data=true'
            }
        }
        
        if endpoint_name:
            cache_info['endpoint'] = endpoint_name
            # Could add endpoint-specific cache stats here
        
        return cache_info
    
    def _generate_endpoint_cache_key(self, 
                                   func_name: str, 
                                   vary_on: Optional[List[str]] = None,
                                   *args, **kwargs) -> str:
        """
        Generate cache key for endpoint
        """
        # Start with base components
        key_components = [
            self.cache_prefix,
            'endpoint',
            func_name
        ]
        
        # Add query parameters if specified
        if vary_on:
            for param in vary_on:
                value = request.args.get(param, '')
                key_components.append(f"{param}={value}")
        else:
            # Include all query parameters by default
            query_items = sorted(request.args.items())
            for key, value in query_items:
                if key not in ['no_cache', 'refresh_cache', 'refresh_data']:
                    key_components.append(f"{key}={value}")
        
        # Use reliable cache key generation for args and kwargs
        from utils.reliable_cache_keys import ReliableCacheKeyGenerator
        
        if args:
            args_hash = ReliableCacheKeyGenerator._serialize_args(args)
            key_components.append(f"args={args_hash[:8]}")
        
        if kwargs:
            kwargs_hash = ReliableCacheKeyGenerator._serialize_dict(kwargs)
            key_components.append(f"kwargs={kwargs_hash[:8]}")
        
        # Join and hash for consistent length
        cache_key = ":".join(key_components)
        
        # If key is too long, hash it
        if len(cache_key) > 200:
            cache_key = f"{self.cache_prefix}:hashed:{hashlib.sha256(cache_key.encode()).hexdigest()}"
        
        return cache_key
    
    def _generate_data_cache_key(self,
                               func_name: str,
                               key_prefix: str,
                               version: str,
                               *args, **kwargs) -> str:
        """
        Generate cache key for data loading functions
        """
        key_components = [
            self.cache_prefix,
            key_prefix,
            version,
            func_name
        ]
        
        # Add relevant request parameters for data queries
        data_params = ['sites', 'start_date', 'end_date', 'time_range', 'filters']
        for param in data_params:
            value = request.args.get(param)
            if value:
                key_components.append(f"{param}={value}")
        
        # Add function arguments using reliable cache key generation
        from utils.reliable_cache_keys import ReliableCacheKeyGenerator
        
        if args:
            args_hash = ReliableCacheKeyGenerator._serialize_args(args)
            key_components.append(f"args={args_hash[:8]}")
        
        if kwargs:
            # Include important data-related kwargs
            data_kwargs = {k: v for k, v in kwargs.items() 
                          if k in ['sites', 'start_date', 'end_date', 'time_range']}
            if data_kwargs:
                kwargs_hash = ReliableCacheKeyGenerator._serialize_dict(data_kwargs)
                key_components.append(f"data={kwargs_hash[:8]}")
        
        cache_key = ":".join(key_components)
        
        # Hash if too long
        if len(cache_key) > 200:
            cache_key = f"{self.cache_prefix}:data:hashed:{hashlib.sha256(cache_key.encode()).hexdigest()}"
        
        return cache_key
    
    def _should_cache_response(self, 
                             response: Any, 
                             condition_func: Optional[Callable] = None) -> bool:
        """
        Determine if response should be cached
        """
        # Custom condition function takes precedence
        if condition_func:
            return condition_func(response)
        
        # Default caching conditions
        if response is None:
            return False
        
        # Don't cache error responses
        if isinstance(response, tuple):
            data, status_code = response
            if status_code >= 400:
                return False
            response = data
        
        # Don't cache empty responses
        if isinstance(response, dict):
            if response.get('error') or not response:
                return False
            
            # Don't cache if metadata indicates an error
            metadata = response.get('metadata', {})
            if not metadata.get('has_data', True):
                return False
        
        return True
    
    def _cache_api_response(self, cache_key: str, response: Any, ttl: int):
        """
        Cache API response with proper serialization
        """
        try:
            # Prepare response for caching
            cache_data = response
            
            # Add cache metadata
            if isinstance(cache_data, dict):
                cache_data = cache_data.copy()  # Don't modify original
                cache_data['_cache_info'] = {
                    'cached_at': datetime.now().isoformat(),
                    'cache_ttl': ttl,
                    'cache_key': cache_key[:50] + '...' if len(cache_key) > 50 else cache_key
                }
            
            # Cache the response
            success = cache_set(cache_key, cache_data, ttl)
            
            if success:
                logger.debug(f"💾 [API CACHE] Cached response for key: {cache_key[:50]}... (TTL: {ttl}s)")
            else:
                logger.warning(f"⚠️ [API CACHE] Failed to cache response for key: {cache_key[:50]}...")
                
        except Exception as e:
            logger.error(f"❌ [API CACHE] Error caching response: {e}")

class CacheMiddleware:
    """
    Flask middleware for automatic caching based on response headers
    """
    
    def __init__(self, app=None, cache_manager: Optional[APICacheManager] = None):
        """
        Initialize cache middleware
        
        Args:
            app: Flask app instance
            cache_manager: Cache manager instance
        """
        self.cache_manager = cache_manager or APICacheManager()
        if app:
            self.init_app(app)
    
    def init_app(self, app):
        """Initialize middleware with Flask app"""
        app.before_request(self._before_request)
        app.after_request(self._after_request)
    
    def _before_request(self):
        """Process request before endpoint execution"""
        g.cache_start_time = time.time()
        g.should_cache = True
    
    def _after_request(self, response):
        """Process response after endpoint execution"""
        try:
            # Add cache headers if appropriate
            if hasattr(g, 'should_cache') and g.should_cache:
                if response.status_code == 200:
                    response.headers['Cache-Control'] = 'public, max-age=3600'
                    response.headers['X-Cache-Status'] = 'cacheable'
                else:
                    response.headers['Cache-Control'] = 'no-cache, no-store'
                    response.headers['X-Cache-Status'] = 'not-cacheable'
            
            # Add processing time header
            if hasattr(g, 'cache_start_time'):
                processing_time = (time.time() - g.cache_start_time) * 1000
                response.headers['X-Processing-Time-Ms'] = f"{processing_time:.2f}"
            
        except Exception as e:
            logger.error(f"Cache middleware error: {e}")
        
        return response

# Global cache manager instance
api_cache_manager = APICacheManager()

# Convenience decorators
def cache_endpoint(ttl: int = 3600, **kwargs):
    """Decorator to cache endpoint responses"""
    return api_cache_manager.cache_endpoint(ttl=ttl, **kwargs)

def cache_data(ttl: int = 3600, **kwargs):
    """Decorator to cache data loading functions"""
    return api_cache_manager.cache_data_loader(ttl=ttl, **kwargs)

def invalidate_cache(pattern: str) -> int:
    """Invalidate cache keys matching pattern"""
    return api_cache_manager.invalidate_pattern(pattern)

def get_cache_stats() -> Dict[str, Any]:
    """Get comprehensive cache statistics"""
    return api_cache_manager.get_cache_info()

def warm_endpoint_cache(endpoint_func: Callable, params_list: List[Dict[str, Any]], batch_size: int = 10) -> Dict[str, Any]:
    """Warm cache for endpoint with parameter combinations (optimized with batching)"""
    if not params_list:
        return {'warmed_count': 0, 'failed_count': 0, 'total_time_ms': 0}
    
    # Process in batches to avoid memory issues with large parameter lists
    all_results = {
        'warmed_count': 0,
        'failed_count': 0, 
        'skipped_count': 0,
        'total_time_ms': 0,
        'cache_keys': [],
        'errors': [],
        'batches_processed': 0
    }
    
    total_start = time.time()
    
    # Process in batches
    for i in range(0, len(params_list), batch_size):
        batch = params_list[i:i + batch_size]
        batch_results = api_cache_manager.warm_cache(endpoint_func, batch)
        
        # Accumulate results
        all_results['warmed_count'] += batch_results.get('warmed_count', 0)
        all_results['failed_count'] += batch_results.get('failed_count', 0)
        all_results['skipped_count'] += batch_results.get('skipped_count', 0)
        all_results['cache_keys'].extend(batch_results.get('cache_keys', []))
        all_results['errors'].extend(batch_results.get('errors', []))
        all_results['batches_processed'] += 1
        
        # Small delay between batches to prevent overwhelming the system
        if i + batch_size < len(params_list):
            time.sleep(0.05)
    
    all_results['total_time_ms'] = (time.time() - total_start) * 1000
    
    logger.info(f"[CACHE WARM BATCH] Processed {all_results['batches_processed']} batches: "
               f"{all_results['warmed_count']} warmed, {all_results['skipped_count']} skipped, "
               f"{all_results['failed_count']} failed in {all_results['total_time_ms']:.1f}ms")
    
    return all_results

# Smart caching decorators for specific use cases
def cache_water_quality_data(ttl: int = 1800):  # 30 minutes
    """Specialized caching for water quality data"""
    return cache_data(ttl=ttl, key_prefix="wq_data", version="v1")

def cache_alert_data(ttl: int = 300):  # 5 minutes
    """Specialized caching for alert data"""
    return cache_data(ttl=ttl, key_prefix="alerts", version="v1")

def cache_report_data(ttl: int = 3600):  # 1 hour
    """Specialized caching for report data"""
    return cache_data(ttl=ttl, key_prefix="reports", version="v1")

def cache_site_data(ttl: int = 7200):  # 2 hours
    """Specialized caching for site data"""
    return cache_data(ttl=ttl, key_prefix="sites", version="v1")

# Cache warming utilities
def warm_common_caches():
    """
    Warm caches with common data combinations
    Delegates to the advanced cache prewarmer service
    """
    from services.cache_prewarmer import cache_prewarmer
    
    logger.info("🔥 [CACHE WARM] Starting cache warming using advanced prewarmer")
    
    try:
        # Use the comprehensive cache prewarmer
        result = cache_prewarmer.warm_common_caches()
        
        if result.get('success', False):
            # Convert to legacy format for backward compatibility
            legacy_result = {
                'water_quality': result.get('patterns_by_service', {}).get('water_quality', {}).get('total_records', 0),
                'redox': result.get('patterns_by_service', {}).get('redox', {}).get('total_records', 0),
                'site_metadata': result.get('patterns_by_service', {}).get('site_metadata', {}).get('total_records', 0),
                'errors': result.get('failed_warmings', 0),
                'total_patterns': result.get('successful_warmings', 0),
                'duration_seconds': result.get('duration_seconds', 0)
            }
            
            logger.info(f"✅ [CACHE WARM] Advanced warming completed: {legacy_result}")
            return legacy_result
        else:
            logger.error(f"❌ [CACHE WARM] Advanced warming failed: {result.get('error', 'Unknown error')}")
            return {
                'water_quality': 0,
                'redox': 0,
                'site_metadata': 0,
                'errors': 1,
                'error_message': result.get('error', 'Unknown error')
            }
            
    except Exception as e:
        logger.error(f"❌ [CACHE WARM] Critical warming error: {e}")
        return {
            'water_quality': 0,
            'redox': 0, 
            'site_metadata': 0,
            'errors': 1,
            'error_message': str(e)
        }
