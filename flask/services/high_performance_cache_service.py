"""
High-Performance Cache Service backed by Redis
"""

import os
import logging
import pickle
import uuid
import threading
from functools import wraps
from typing import Any, Callable, Optional, Tuple

import redis

logger = logging.getLogger(__name__)

class HighPerformanceCacheService:
    """A caching service that uses Redis as the backend."""

    def __init__(self, default_ttl: int = 300):
        """
        Initializes the Redis connection.
        Connection details are pulled from environment variables.
        REDIS_URL is expected (e.g., redis://localhost:6379/0).
        """
        redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
        self.default_ttl = default_ttl
        self._local_locks = {}
        self._local_locks_lock = threading.Lock()
        try:
            self.redis_client = redis.from_url(redis_url, decode_responses=False)
            self.redis_client.ping()  # Check the connection
            logger.info(f"HighPerformanceCacheService initialized and connected to Redis at {redis_url}")
        except redis.exceptions.ConnectionError as e:
            logger.error(f"Could not connect to Redis at {redis_url}. Caching will be disabled. Error: {e}")
            self.redis_client = None

    def get(self, key: str) -> Optional[Any]:
        """Get a value from the cache. Returns None if the key doesn't exist."""
        if not self.redis_client:
            return None
        
        try:
            cached_value = self.redis_client.get(key)
            if cached_value:
                logger.debug(f"✅ Cache hit for {key[:50]}...")
                return pickle.loads(cached_value)
            else:
                logger.debug(f"❌ Cache miss for {key[:50]}...")
                return None
        except (redis.exceptions.RedisError, pickle.UnpicklingError) as e:
            logger.error(f"Failed to get key '{key}' from Redis: {e}")
            return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set a value in the cache with a TTL."""
        if not self.redis_client:
            return False

        try:
            serialized_value = pickle.dumps(value)
            ttl_to_use = ttl or self.default_ttl
            self.redis_client.set(key, serialized_value, ex=ttl_to_use)
            logger.debug(f"💾 Cached {key[:50]}... (TTL: {ttl_to_use}s)")
            return True
        except (redis.exceptions.RedisError, pickle.PicklingError) as e:
            logger.error(f"Failed to set key '{key}' in Redis: {e}")
            return False

    def delete(self, key: str) -> bool:
        """Delete a key from the cache."""
        if not self.redis_client:
            return False
        try:
            self.redis_client.delete(key)
            logger.debug(f"🗑️ Deleted cache entry: {key[:50]}...")
            return True
        except redis.exceptions.RedisError as e:
            logger.error(f"Failed to delete key '{key}' from Redis: {e}")
            return False

    def clear(self) -> int:
        """Clear the entire cache (the current Redis DB)."""
        if not self.redis_client:
            return 0
        try:
            count = self.redis_client.dbsize()
            self.redis_client.flushdb()
            logger.info(f"🧹 Cleared all {count} keys from the Redis cache.")
            return count
        except redis.exceptions.RedisError as e:
            logger.error(f"Failed to clear Redis cache: {e}")
            return 0

    def get_detailed_stats(self) -> dict:
        """Get statistics from the Redis server."""
        if not self.redis_client:
            return {"error": "Redis connection not available"}
        try:
            return self.redis_client.info()
        except redis.exceptions.RedisError as e:
            logger.error(f"Failed to get Redis info: {e}")
            return {"error": str(e)}

    # ------------------------------------------------------------------
    # Cooperative locking helpers to mitigate cache stampedes
    # ------------------------------------------------------------------

    def acquire_lock(self, key: str, ttl: int = 30) -> Optional[Tuple[str, str, object]]:
        """Attempt to acquire a short-lived lock for the given cache key."""
        lock_key = f"lock:{key}"

        if self.redis_client:
            token = uuid.uuid4().hex
            try:
                acquired = self.redis_client.set(lock_key, token, nx=True, ex=max(1, ttl))
                if acquired:
                    return ('redis', lock_key, token)
            except redis.exceptions.RedisError as exc:
                logger.debug(f"Redis lock acquisition failed for {key}: {exc}")
            return None

        with self._local_locks_lock:
            lock = self._local_locks.setdefault(lock_key, threading.Lock())

        if lock.acquire(blocking=False):
            return ('local', lock_key, lock)
        return None

    def release_lock(self, handle: Optional[Tuple[str, str, object]]):
        """Release a previously acquired lock."""
        if not handle:
            return

        mode, lock_key, token = handle

        if mode == 'redis' and self.redis_client:
            try:
                script = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"
                self.redis_client.eval(script, 1, lock_key, token)
            except redis.exceptions.RedisError as exc:
                logger.debug(f"Redis lock release failed for {lock_key}: {exc}")
        elif mode == 'local' and isinstance(token, threading.Lock):
            try:
                token.release()
            except RuntimeError:
                pass

# Global high-performance cache service instance, now backed by Redis
high_performance_cache = HighPerformanceCacheService()

# The existing decorators below will now use the Redis-backed service automatically.

def advanced_cached(ttl: int = 300, 
                   key_func: Optional[Callable] = None):
    """Advanced caching decorator that now uses the Redis-backed service."""
    
    def decorator(func: Callable) -> Callable:
        from flask import request  # Import request context

        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                # Create a reliable cache key based on the request URL and query params
                path = request.path
                # Sort query params to ensure consistent key order
                query_string = "&".join(f"{k}={v}" for k, v in sorted(request.args.items()))
                cache_key = f"view:{path}?{query_string}"
            
            # Try cache first
            cached_result = high_performance_cache.get(cache_key)
            if cached_result is not None:
                return cached_result
            
            # Execute function
            start_time = time.time()
            result = func(*args, **kwargs)
            execution_time = time.time() - start_time
            
            # Cache result
            high_performance_cache.set(cache_key, result, ttl)
            
            logger.debug(f"💾 Cached {func.__name__} result (key: {cache_key}, exec: {execution_time:.3f}s)")
            return result
    return decorator

def cache_method_results(ttl: int = 300):
    """Cache method results with instance-aware keys, now using Redis."""
    import hashlib
    import json

    def decorator(method: Callable) -> Callable:
        @wraps(method)
        def wrapper(self, *args, **kwargs):
            instance_id = f"{self.__class__.__name__}_{id(self)}"
            try:
                args_str = json.dumps(args, sort_keys=True, default=str)
                kwargs_str = json.dumps(kwargs, sort_keys=True, default=str)
                key_data = f"{instance_id}:{method.__name__}:{args_str}:{kwargs_str}"
                cache_key = f"method_cache:{hashlib.md5(key_data.encode()).hexdigest()}"
            except (TypeError, ValueError) as e:
                logger.warning(f"Failed to create stable cache key for {method.__name__}: {e}")
                fallback_key = f"{instance_id}:{method.__name__}:{str(args)}:{str(kwargs)}"
                cache_key = f"method_cache:{hashlib.md5(fallback_key.encode()).hexdigest()}"
            
            cached_result = high_performance_cache.get(cache_key)
            if cached_result is not None:
                return cached_result
            
            result = method(self, *args, **kwargs)
            high_performance_cache.set(cache_key, result, ttl)
            return result
        return wrapper
    return decorator
