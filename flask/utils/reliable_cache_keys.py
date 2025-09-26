"""
Reliable Cache Key Generation Utilities
Provides deterministic, collision-resistant cache key generation
"""

import hashlib
import json
import pickle
from typing import Any, Dict, List, Tuple, Union, Optional
from datetime import datetime, date, time
from flask import request
import pandas as pd

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)


def _secure_digest(payload: bytes) -> str:
    """Return a deterministic, non-cryptographic digest for cache keys."""
    return hashlib.blake2b(payload, digest_size=16).hexdigest()


class ReliableCacheKeyGenerator:
    """
    Generates reliable, deterministic cache keys that avoid common pitfalls
    """
    
    @staticmethod
    def create_cache_key(
        prefix: str,
        endpoint: str = None,
        args: Tuple = None,
        kwargs: Dict = None,
        request_params: Dict = None,
        version: str = "1.0"
    ) -> str:
        """
        Create a reliable, deterministic cache key
        
        Args:
            prefix: Cache key prefix (e.g., 'api', 'data', 'lazy')
            endpoint: Endpoint or function name
            args: Function positional arguments
            kwargs: Function keyword arguments
            request_params: Request parameters from Flask
            version: Schema version for cache invalidation
            
        Returns:
            Deterministic cache key string
        """
        key_components = []
        
        # Add prefix and version
        key_components.extend([prefix, f"v{version}"])
        
        # Add endpoint
        if endpoint:
            key_components.append(f"endpoint:{endpoint}")
        
        # Process request parameters safely
        if request_params is None and request:
            request_params = dict(request.args)
        
        if request_params:
            # Sort and serialize request parameters reliably
            sorted_params = ReliableCacheKeyGenerator._serialize_dict(request_params)
            if sorted_params:
                key_components.append(f"params:{sorted_params}")
        
        # Process function arguments safely
        if args:
            args_str = ReliableCacheKeyGenerator._serialize_args(args)
            if args_str:
                key_components.append(f"args:{args_str}")
        
        if kwargs:
            kwargs_str = ReliableCacheKeyGenerator._serialize_dict(kwargs)
            if kwargs_str:
                key_components.append(f"kwargs:{kwargs_str}")
        
        # Join components and create final hash
        key_string = "|".join(key_components)

        # Use blake2b for compact, deterministic hashing without security intent
        cache_key = _secure_digest(key_string.encode('utf-8'))

        return f"{prefix}:{cache_key}"
    
    @staticmethod
    def _serialize_args(args: Tuple) -> str:
        """
        Safely serialize function arguments for cache key generation
        """
        try:
            serializable_args = []
            
            for arg in args:
                serializable_args.append(ReliableCacheKeyGenerator._make_serializable(arg))
            
            # Use JSON for deterministic serialization
            return _secure_digest(
                json.dumps(serializable_args, sort_keys=True, default=str).encode('utf-8')
            )
            
        except Exception as e:
            logger.warning(f"Failed to serialize args safely, using fallback: {e}")
            # Fallback to string representation with warning
            return _secure_digest(str(args).encode('utf-8'))
    
    @staticmethod
    def _serialize_dict(data: Dict) -> str:
        """
        Safely serialize dictionary data for cache key generation
        """
        try:
            # Create clean, serializable dictionary
            clean_dict = {}
            
            for key, value in data.items():
                # Skip non-serializable keys
                if key in ['request', '_request', 'self']:
                    continue
                    
                clean_key = str(key)
                clean_value = ReliableCacheKeyGenerator._make_serializable(value)
                clean_dict[clean_key] = clean_value
            
            # Sort keys for deterministic output
            return _secure_digest(
                json.dumps(clean_dict, sort_keys=True, default=str).encode('utf-8')
            )
            
        except Exception as e:
            logger.warning(f"Failed to serialize dict safely, using fallback: {e}")
            # Fallback with safer serialization
            try:
                safe_items = [(str(k), str(v)) for k, v in data.items() if k not in ['request', '_request', 'self']]
                return _secure_digest(str(sorted(safe_items)).encode('utf-8'))
            except (TypeError, ValueError, AttributeError) as e:
                logger.warning(f"Fallback serialization failed, using length hash: {e}")
                return _secure_digest(str(len(data)).encode('utf-8'))
    
    @staticmethod
    def _make_serializable(obj: Any) -> Any:
        """
        Convert object to JSON-serializable form for reliable hashing
        """
        # Handle None
        if obj is None:
            return None
        
        # Handle basic types that are already serializable
        if isinstance(obj, (str, int, float, bool)):
            return obj
        
        # Handle datetime objects
        if isinstance(obj, (datetime, date, time)):
            return obj.isoformat()
        
        # Handle lists and tuples
        if isinstance(obj, (list, tuple)):
            return [ReliableCacheKeyGenerator._make_serializable(item) for item in obj]
        
        # Handle dictionaries
        if isinstance(obj, dict):
            return {
                str(key): ReliableCacheKeyGenerator._make_serializable(value) 
                for key, value in obj.items()
                if key not in ['request', '_request', 'self']
            }
        
        # Handle pandas DataFrames
        if hasattr(obj, 'shape') and hasattr(obj, 'columns'):  # DataFrame-like
            try:
                # Use shape and columns for DataFrame identity
                return f"DataFrame_shape_{obj.shape}_cols_{len(obj.columns)}"
            except (AttributeError, ImportError) as e:
                logger.debug(f"DataFrame shape extraction failed: {e}")
                return "DataFrame_unknown"
        
        # Handle other objects by converting to string representation
        try:
            # Try to use __dict__ for custom objects
            if hasattr(obj, '__dict__'):
                return ReliableCacheKeyGenerator._make_serializable(obj.__dict__)
            else:
                return str(type(obj).__name__)
        except (TypeError, AttributeError, ValueError) as e:
            logger.debug(f"Object serialization failed: {e}")
            return "unknown_object"


def create_api_cache_key(endpoint: str, params: Dict = None, **kwargs) -> str:
    """
    Convenience function for API endpoint cache keys
    """
    return ReliableCacheKeyGenerator.create_cache_key(
        prefix="api",
        endpoint=endpoint,
        request_params=params,
        kwargs=kwargs,
        version="1.0"
    )


def create_data_cache_key(function_name: str, *args, **kwargs) -> str:
    """
    Convenience function for data loading cache keys
    """
    return ReliableCacheKeyGenerator.create_cache_key(
        prefix="data",
        endpoint=function_name,
        args=args,
        kwargs=kwargs,
        version="1.0"
    )


def create_lazy_cache_key(component_id: str, endpoint: str, *args, **kwargs) -> str:
    """
    Convenience function for lazy loading cache keys
    """
    return ReliableCacheKeyGenerator.create_cache_key(
        prefix="lazy",
        endpoint=f"{endpoint}:{component_id}",
        args=args,
        kwargs=kwargs,
        version="1.0"
    )


def create_performance_cache_key(operation: str, params: Dict = None) -> str:
    """
    Convenience function for performance optimization cache keys
    """
    return ReliableCacheKeyGenerator.create_cache_key(
        prefix="perf",
        endpoint=operation,
        request_params=params,
        version="1.0"
    )


# Migration helper to validate cache key reliability
def validate_cache_key_reliability(test_data: List[Tuple]) -> Dict[str, Any]:
    """
    Test cache key generation reliability with sample data
    """
    results = {
        'total_tests': len(test_data),
        'unique_keys': set(),
        'collisions': [],
        'reliability_score': 0
    }
    
    for i, (args, kwargs) in enumerate(test_data):
        cache_key = create_data_cache_key("test_function", *args, **kwargs)
        
        if cache_key in results['unique_keys']:
            results['collisions'].append({
                'test_index': i,
                'duplicate_key': cache_key,
                'args': args,
                'kwargs': kwargs
            })
        else:
            results['unique_keys'].add(cache_key)
    
    # Calculate reliability score (0-100)
    if results['total_tests'] > 0:
        results['reliability_score'] = ((results['total_tests'] - len(results['collisions'])) / results['total_tests']) * 100
    
    return results