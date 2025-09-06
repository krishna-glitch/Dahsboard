"""
Flask API Lazy Loading Utilities
Provides lazy loading patterns for Flask REST APIs with proper caching
"""

import logging
from typing import Dict, Any, Callable, Optional, Tuple, List
from functools import wraps
from flask import jsonify, request
from datetime import datetime, timedelta
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
import time
import hashlib
import json

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

# Simple in-memory cache for lazy loading
_lazy_cache = {}
_cache_timestamps = {}

def _create_cache_key(endpoint: str, component_id: str, args: tuple, kwargs: dict) -> str:
    """Create a reliable cache key for lazy loading"""
    from utils.reliable_cache_keys import create_lazy_cache_key
    
    return create_lazy_cache_key(component_id, endpoint, *args, **kwargs)

def _is_cache_valid(cache_key: str, ttl: int) -> bool:
    """Check if cached data is still valid"""
    if cache_key not in _cache_timestamps:
        return False
    
    cache_time = _cache_timestamps[cache_key]
    return (datetime.now() - cache_time).total_seconds() < ttl

def _get_cached_data(cache_key: str):
    """Get data from cache if valid"""
    return _lazy_cache.get(cache_key)

def _set_cached_data(cache_key: str, data: Any):
    """Store data in cache with timestamp"""
    _lazy_cache[cache_key] = data
    _cache_timestamps[cache_key] = datetime.now()

def _build_lazy_url(base_url: str, component_id: str) -> str:
    """Safely construct lazy loading URL with proper query parameter handling"""
    parsed = urlparse(base_url)
    query_params = parse_qs(parsed.query)
    
    # Add lazy loading parameters
    query_params['lazy_load'] = ['true']
    query_params['component_id'] = [component_id]
    
    # Rebuild URL with new parameters
    new_query = urlencode(query_params, doseq=True)
    return urlunparse((
        parsed.scheme, parsed.netloc, parsed.path,
        parsed.params, new_query, parsed.fragment
    ))

class APILazyLoader:
    """
    Lazy loading utility for Flask API endpoints
    """
    
    @staticmethod
    def lazy_endpoint(loader_function: Callable, cache_ttl: int = 300):
        """
        Decorator to make an endpoint lazy-loaded with proper caching
        
        Args:
            loader_function: Function to load data when needed
            cache_ttl: Cache time-to-live in seconds
            
        Returns:
            Decorated endpoint function
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                start_time = time.time()
                
                # Check if this is a lazy load request
                lazy_load = request.args.get('lazy_load', 'false').lower() == 'true'
                component_id = request.args.get('component_id')
                
                if not lazy_load or not component_id:
                    # Return minimal metadata for initial load with proper URL construction
                    return jsonify({
                        'lazy_loading': True,
                        'component_id': component_id or 'unknown',
                        'endpoint': request.endpoint,
                        'load_url': _build_lazy_url(request.url, component_id or 'unknown'),
                        'metadata': {
                            'requires_lazy_load': True,
                            'estimated_load_time': '2-5 seconds',
                            'data_size': 'large',
                            'cache_ttl': cache_ttl
                        }
                    }), 202  # Accepted, processing
                
                # Create cache key for this specific request
                cache_key = _create_cache_key(request.endpoint, component_id, args, kwargs)
                
                # Check cache first if TTL > 0
                if cache_ttl > 0 and _is_cache_valid(cache_key, cache_ttl):
                    cached_data = _get_cached_data(cache_key)
                    if cached_data is not None:
                        logger.info(f"🚀 [LAZY CACHE HIT] Component '{component_id}' served from cache")
                        
                        # Add cache metadata to response
                        if isinstance(cached_data, dict) and 'lazy_loading' in cached_data:
                            cached_data['lazy_loading']['served_from_cache'] = True
                            cached_data['lazy_loading']['cache_hit_at'] = datetime.now().isoformat()
                        
                        return jsonify(cached_data), 200
                
                try:
                    logger.info(f"🔄 [LAZY LOAD] Loading component '{component_id}' for endpoint {request.endpoint}")
                    
                    # Call the actual loader function
                    result = loader_function(*args, **kwargs)
                    
                    loading_time = (time.time() - start_time) * 1000
                    
                    # Enhance result with lazy loading metadata
                    if isinstance(result, tuple):
                        data, status_code = result
                    else:
                        data, status_code = result, 200
                    
                    if isinstance(data, dict):
                        data['lazy_loading'] = {
                            'loaded': True,
                            'component_id': component_id,
                            'loading_time_ms': round(loading_time, 2),
                            'loaded_at': datetime.now().isoformat(),
                            'served_from_cache': False,
                            'cache_ttl': cache_ttl
                        }
                    
                    # Store in cache if TTL > 0
                    if cache_ttl > 0:
                        _set_cached_data(cache_key, data)
                        logger.info(f"💾 [LAZY CACHE] Component '{component_id}' cached for {cache_ttl}s")
                    
                    logger.info(f"✅ [LAZY LOAD] Component '{component_id}' loaded in {loading_time:.1f}ms")
                    return jsonify(data), status_code
                    
                except Exception as e:
                    loading_time = (time.time() - start_time) * 1000
                    logger.error(f"❌ [LAZY LOAD] Failed to load component '{component_id}': {e}")
                    
                    return jsonify({
                        'error': 'Lazy loading failed',
                        'component_id': component_id,
                        'details': str(e),
                        'lazy_loading': {
                            'loaded': False,
                            'loading_time_ms': round(loading_time, 2),
                            'error_at': datetime.now().isoformat(),
                            'served_from_cache': False
                        }
                    }), 500
            
            return decorated_function
        return decorator
    
    @staticmethod
    def create_lazy_response(component_id: str, data_loader: Callable) -> Dict[str, Any]:
        """
        Create a lazy loading response structure
        
        Args:
            component_id: Unique identifier for the component
            data_loader: Function to load the actual data
            
        Returns:
            Lazy response dictionary
        """
        return {
            'lazy_loading': {
                'component_id': component_id,
                'status': 'pending',
                'load_trigger': 'on_demand',
                'estimated_size': 'large'
            },
            'load_instructions': {
                'method': 'GET',
                'url': _build_lazy_url(request.url, component_id),
                'headers': {'Content-Type': 'application/json'}
            },
            'placeholder_data': {
                'message': f'Component {component_id} will be loaded on demand',
                'loading_indicator': True
            }
        }

class APITabLazyLoader:
    """
    Lazy loading for tab-based content in Flask APIs
    """
    
    @staticmethod
    def lazy_tab_endpoint(tab_loaders: Dict[str, Callable]):
        """
        Decorator for endpoints that serve multiple tabs with lazy loading
        
        Args:
            tab_loaders: Dictionary mapping tab IDs to loader functions
            
        Returns:
            Decorated endpoint function
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                active_tab = request.args.get('tab_id')
                lazy_load = request.args.get('lazy_load', 'false').lower() == 'true'
                
                if not active_tab:
                    # Return tab structure without content
                    return jsonify({
                        'tabs': {
                            'available_tabs': list(tab_loaders.keys()),
                            'active_tab': None,
                            'lazy_loading': True
                        },
                        'tab_content': {},
                        'instructions': {
                            'load_tab': 'Add ?tab_id=<tab_name>&lazy_load=true to load specific tab'
                        }
                    }), 200
                
                if active_tab not in tab_loaders:
                    return jsonify({
                        'error': f'Tab "{active_tab}" not found',
                        'available_tabs': list(tab_loaders.keys())
                    }), 404
                
                if not lazy_load:
                    # Return tab structure with placeholder
                    return jsonify({
                        'tabs': {
                            'available_tabs': list(tab_loaders.keys()),
                            'active_tab': active_tab,
                            'lazy_loading': True
                        },
                        'tab_content': {
                            active_tab: {
                                'status': 'pending',
                                'load_url': _build_lazy_url(request.url, f'tab_{active_tab}')
                            }
                        }
                    }), 202
                
                try:
                    start_time = time.time()
                    logger.info(f"🔄 [TAB LAZY LOAD] Loading tab '{active_tab}'")
                    
                    # Load the specific tab content
                    tab_content = tab_loaders[active_tab](*args, **kwargs)
                    
                    loading_time = (time.time() - start_time) * 1000
                    
                    response_data = {
                        'tabs': {
                            'available_tabs': list(tab_loaders.keys()),
                            'active_tab': active_tab,
                            'lazy_loading': True
                        },
                        'tab_content': {
                            active_tab: {
                                'status': 'loaded',
                                'data': tab_content,
                                'loading_time_ms': round(loading_time, 2),
                                'loaded_at': datetime.now().isoformat()
                            }
                        }
                    }
                    
                    logger.info(f"✅ [TAB LAZY LOAD] Tab '{active_tab}' loaded in {loading_time:.1f}ms")
                    return jsonify(response_data), 200
                    
                except Exception as e:
                    logger.error(f"❌ [TAB LAZY LOAD] Failed to load tab '{active_tab}': {e}")
                    
                    return jsonify({
                        'tabs': {
                            'available_tabs': list(tab_loaders.keys()),
                            'active_tab': active_tab,
                            'lazy_loading': True
                        },
                        'tab_content': {
                            active_tab: {
                                'status': 'error',
                                'error': str(e),
                                'failed_at': datetime.now().isoformat()
                            }
                        }
                    }), 500
            
            return decorated_function
        return decorator

class APIVirtualScrollLoader:
    """
    Virtual scrolling support for large datasets in Flask APIs
    """
    
    @staticmethod
    def virtual_scroll_endpoint(data_loader: Callable, item_height: int = 50):
        """
        Decorator for endpoints that support virtual scrolling
        
        Args:
            data_loader: Function to load data
            item_height: Height of each item in pixels
            
        Returns:
            Decorated endpoint function
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                # Parse virtual scroll parameters
                page = int(request.args.get('page', 0))
                page_size = int(request.args.get('page_size', 100))
                scroll_offset = int(request.args.get('scroll_offset', 0))
                viewport_height = int(request.args.get('viewport_height', 500))
                
                try:
                    start_time = time.time()
                    
                    # Calculate visible range based on scroll position
                    items_per_viewport = viewport_height // item_height
                    buffer_size = items_per_viewport // 2  # Load extra items
                    
                    start_index = max(0, (scroll_offset // item_height) - buffer_size)
                    end_index = start_index + items_per_viewport + (2 * buffer_size)
                    
                    logger.info(f"🔄 [VIRTUAL SCROLL] Loading items {start_index}-{end_index}")
                    
                    # Load data with virtual scroll parameters
                    data_result = data_loader(
                        start_index=start_index,
                        end_index=end_index,
                        page=page,
                        page_size=page_size,
                        *args, **kwargs
                    )
                    
                    loading_time = (time.time() - start_time) * 1000
                    
                    # Extract data and metadata
                    if isinstance(data_result, tuple):
                        items, total_count = data_result
                    else:
                        items = data_result
                        total_count = len(items)
                    
                    virtual_scroll_data = {
                        'items': items,
                        'virtual_scroll': {
                            'total_count': total_count,
                            'start_index': start_index,
                            'end_index': min(end_index, total_count),
                            'item_height': item_height,
                            'items_per_viewport': items_per_viewport,
                            'total_height': total_count * item_height,
                            'current_page': page,
                            'page_size': page_size
                        },
                        'metadata': {
                            'loading_time_ms': round(loading_time, 2),
                            'loaded_at': datetime.now().isoformat(),
                            'scroll_offset': scroll_offset,
                            'viewport_height': viewport_height
                        }
                    }
                    
                    logger.info(f"✅ [VIRTUAL SCROLL] Loaded {len(items)} items in {loading_time:.1f}ms")
                    return jsonify(virtual_scroll_data), 200
                    
                except Exception as e:
                    logger.error(f"❌ [VIRTUAL SCROLL] Failed to load virtual scroll data: {e}")
                    
                    return jsonify({
                        'error': 'Virtual scroll loading failed',
                        'details': str(e),
                        'virtual_scroll': {
                            'total_count': 0,
                            'start_index': start_index,
                            'end_index': start_index,
                            'item_height': item_height
                        }
                    }), 500
            
            return decorated_function
        return decorator

class APIIntersectionObserver:
    """
    Intersection observer pattern for lazy loading when elements come into view
    """
    
    @staticmethod
    def intersection_lazy_endpoint(threshold: float = 0.1):
        """
        Decorator for endpoints that load when element comes into viewport
        
        Args:
            threshold: Percentage of element that must be visible (0.0 to 1.0)
            
        Returns:
            Decorated endpoint function
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                # Check intersection parameters
                is_intersecting = request.args.get('intersecting', 'false').lower() == 'true'
                intersection_ratio = float(request.args.get('intersection_ratio', 0.0))
                target_id = request.args.get('target_id')
                
                if not is_intersecting or intersection_ratio < threshold:
                    # Element not visible enough, return placeholder
                    return jsonify({
                        'intersection_observer': {
                            'target_id': target_id,
                            'is_intersecting': is_intersecting,
                            'intersection_ratio': intersection_ratio,
                            'threshold': threshold,
                            'status': 'waiting'
                        },
                        'placeholder': {
                            'message': 'Content will load when element comes into view',
                            'visibility_required': f'{threshold * 100}%'
                        }
                    }), 202
                
                try:
                    start_time = time.time()
                    logger.info(f"🔄 [INTERSECTION] Loading content for target '{target_id}'")
                    
                    # Load the content
                    content = f(*args, **kwargs)
                    
                    loading_time = (time.time() - start_time) * 1000
                    
                    # Enhance response with intersection data
                    if isinstance(content, tuple):
                        data, status_code = content
                    else:
                        data, status_code = content, 200
                    
                    if isinstance(data, dict):
                        data['intersection_observer'] = {
                            'target_id': target_id,
                            'is_intersecting': is_intersecting,
                            'intersection_ratio': intersection_ratio,
                            'threshold': threshold,
                            'status': 'loaded',
                            'loading_time_ms': round(loading_time, 2),
                            'loaded_at': datetime.now().isoformat()
                        }
                    
                    logger.info(f"✅ [INTERSECTION] Content loaded for '{target_id}' in {loading_time:.1f}ms")
                    return jsonify(data), status_code
                    
                except Exception as e:
                    logger.error(f"❌ [INTERSECTION] Failed to load content for '{target_id}': {e}")
                    
                    return jsonify({
                        'error': 'Intersection loading failed',
                        'target_id': target_id,
                        'details': str(e),
                        'intersection_observer': {
                            'status': 'error',
                            'error_at': datetime.now().isoformat()
                        }
                    }), 500
            
            return decorated_function
        return decorator

# Helper functions for lazy loading patterns
def create_lazy_metadata(component_id: str, estimated_load_time: str = "1-3 seconds") -> Dict[str, Any]:
    """
    Create standard lazy loading metadata
    """
    return {
        'lazy_loading': {
            'component_id': component_id,
            'status': 'pending',
            'estimated_load_time': estimated_load_time,
            'instructions': f'Add ?lazy_load=true&component_id={component_id} to load'
        }
    }

def create_tab_structure(tab_definitions: Dict[str, str], active_tab: Optional[str] = None) -> Dict[str, Any]:
    """
    Create standard tab structure for lazy loading
    """
    return {
        'tabs': {
            'available_tabs': list(tab_definitions.keys()),
            'tab_definitions': tab_definitions,
            'active_tab': active_tab,
            'lazy_loading': True
        }
    }

def create_virtual_scroll_metadata(total_count: int, item_height: int = 50, viewport_height: int = 500) -> Dict[str, Any]:
    """
    Create virtual scroll metadata
    """
    return {
        'virtual_scroll': {
            'total_count': total_count,
            'item_height': item_height,
            'viewport_height': viewport_height,
            'total_height': total_count * item_height,
            'items_per_viewport': viewport_height // item_height,
            'supports_virtual_scroll': True
        }
    }