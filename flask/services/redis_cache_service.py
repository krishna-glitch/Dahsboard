"""
Redis Cache Service - Advanced Redis-based caching with smart compression
Provides drop-in replacement for high-performance cache with Redis backend
"""

import time
import logging
import json
import pickle
import redis
import hashlib
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, Union, List, Callable, Tuple
from datetime import datetime, timedelta
import threading
from functools import wraps

# Import compression utilities
from utils.smart_compression import smart_compressor
from utils.data_compressor import compressor

logger = logging.getLogger(__name__)

@dataclass
class RedisCacheStats:
    """Redis cache statistics"""
    hits: int = 0
    misses: int = 0
    evictions: int = 0
    memory_usage_bytes: int = 0
    entry_count: int = 0
    hit_rate: float = 0.0
    redis_info: Dict[str, Any] = field(default_factory=dict)

    def update_hit_rate(self):
        total = self.hits + self.misses
        self.hit_rate = (self.hits / total * 100) if total > 0 else 0.0

class RedisCacheService:
    """
    Advanced Redis-based cache service with smart compression and fallback to in-memory cache
    Maintains same interface as HighPerformanceCacheService for drop-in replacement
    """

    def __init__(self,
                 redis_host: str = 'localhost',
                 redis_port: int = 6379,
                 redis_db: int = 0,
                 redis_password: Optional[str] = None,
                 key_prefix: str = 'wq_cache:',
                 default_ttl: int = 1800,  # 30 minutes for Redis
                 compression_threshold: int = 1024,
                 fallback_to_memory: bool = True):

        self.key_prefix = key_prefix
        self.default_ttl = default_ttl
        self.compression_threshold = compression_threshold
        self.fallback_to_memory = fallback_to_memory

        # Initialize Redis connection
        try:
            self.redis_client = redis.Redis(
                host=redis_host,
                port=redis_port,
                db=redis_db,
                password=redis_password,
                decode_responses=False,  # We handle our own encoding for binary data
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
                health_check_interval=30
            )

            # Test connection
            self.redis_client.ping()
            self.redis_available = True
            logger.info(f"✅ Redis connection established: {redis_host}:{redis_port}/{redis_db}")

        except Exception as e:
            logger.warning(f"⚠️ Redis connection failed: {e}")
            if fallback_to_memory:
                from services.high_performance_cache_service import HighPerformanceCacheService
                self.fallback_cache = HighPerformanceCacheService()
                self.redis_available = False
                logger.info("🔄 Falling back to in-memory cache")
            else:
                raise

        # Statistics
        self.stats = RedisCacheStats()
        self._lock = threading.RLock()

        # Key pattern tracking for analytics
        self._key_patterns = {}

        logger.info(f"RedisCacheService initialized with prefix '{key_prefix}' and TTL {default_ttl}s")

    def _make_redis_key(self, key: str) -> str:
        """Create Redis key with prefix"""
        return f"{self.key_prefix}{key}"

    def _serialize_value(self, value: Any) -> bytes:
        """Serialize value with smart compression"""
        try:
            # Try JSON first for simple data types
            if isinstance(value, (dict, list, str, int, float, bool, type(None))):
                json_data = json.dumps(value, default=str, separators=(',', ':'))

                # Use smart compression for larger data
                if len(json_data) > self.compression_threshold:
                    if isinstance(value, dict):
                        # Determine data type for optimal compression
                        data_type = self._determine_data_type(value)
                        compression_result = smart_compressor.compress_json(value, data_type)

                        # Wrap with metadata including all required fields
                        wrapped_data = {
                            '_type': 'smart_compressed',
                            '_method': compression_result.method.value,
                            '_data_type': data_type,
                            '_data': compression_result.data,
                            '_compression_ratio': compression_result.compression_ratio,
                            '_original_size': compression_result.original_size,
                            '_compressed_size': compression_result.compressed_size,
                            '_metadata': compression_result.metadata
                        }
                        return pickle.dumps(wrapped_data)
                    else:
                        # Fallback to legacy compression
                        compressed_data = compressor.compress_json(value)
                        wrapped_data = {
                            '_type': 'legacy_compressed',
                            '_data': compressed_data
                        }
                        return pickle.dumps(wrapped_data)
                else:
                    # Store as JSON for small data
                    wrapped_data = {
                        '_type': 'json',
                        '_data': json_data
                    }
                    return pickle.dumps(wrapped_data)
            else:
                # Use pickle for complex objects
                wrapped_data = {
                    '_type': 'pickle',
                    '_data': pickle.dumps(value)
                }
                return pickle.dumps(wrapped_data)

        except Exception as e:
            logger.warning(f"Serialization failed, using pickle fallback: {e}")
            # Final fallback to raw pickle
            wrapped_data = {
                '_type': 'pickle',
                '_data': pickle.dumps(value)
            }
            return pickle.dumps(wrapped_data)

    def _deserialize_value(self, data: bytes) -> Any:
        """Deserialize value with smart decompression"""
        try:
            wrapped_data = pickle.loads(data)

            if wrapped_data['_type'] == 'json':
                return json.loads(wrapped_data['_data'])
            elif wrapped_data['_type'] == 'smart_compressed':
                # Reconstruct compression result object with all required fields
                from utils.smart_compression import CompressionResult, CompressionMethod
                compression_result = CompressionResult(
                    data=wrapped_data['_data'],
                    method=CompressionMethod(wrapped_data['_method']),
                    compression_ratio=wrapped_data.get('_compression_ratio', 1.0),
                    original_size=wrapped_data.get('_original_size', 0),
                    compressed_size=wrapped_data.get('_compressed_size', len(wrapped_data['_data'])),
                    metadata=wrapped_data.get('_metadata', {})
                )
                return smart_compressor.decompress_json(compression_result)
            elif wrapped_data['_type'] == 'legacy_compressed':
                return compressor.decompress_json(wrapped_data['_data'])
            elif wrapped_data['_type'] == 'pickle':
                return pickle.loads(wrapped_data['_data'])
            else:
                logger.warning(f"Unknown serialization type: {wrapped_data['_type']}")
                return pickle.loads(wrapped_data['_data'])

        except Exception as e:
            logger.error(f"Deserialization failed: {e}")
            # Try raw pickle as fallback
            try:
                return pickle.loads(data)
            except:
                logger.error("Raw pickle fallback also failed")
                return None

    def _determine_data_type(self, data: dict) -> str:
        """Determine data type for optimal compression strategy"""
        # Look for time series indicators
        if 'water_quality_data' in data or 'redox_data' in data:
            return 'time_series'
        elif 'sites' in data and isinstance(data.get('sites'), list):
            return 'spatial'
        elif 'performance' in data or 'stats' in data:
            return 'general'
        else:
            # Check data structure
            for key in data.keys():
                if 'timestamp' in key.lower() or 'datetime' in key.lower():
                    return 'time_series'
                elif 'lat' in key.lower() or 'lon' in key.lower():
                    return 'spatial'
            return 'general'

    def get(self, key: str) -> Optional[Any]:
        """Get value from Redis cache with fallback"""
        with self._lock:
            redis_key = self._make_redis_key(key)

            if not self.redis_available:
                if self.fallback_to_memory:
                    return self.fallback_cache.get(key)
                return None

            try:
                # Try Redis first
                start_time = time.time()
                data = self.redis_client.get(redis_key)

                if data is not None:
                    value = self._deserialize_value(data)
                    self.stats.hits += 1
                    self.stats.update_hit_rate()

                    lookup_time = (time.time() - start_time) * 1000
                    logger.info(f"🚀 [REDIS CACHE HIT] {key[:50]}... ({lookup_time:.1f}ms)")
                    return value
                else:
                    self.stats.misses += 1
                    self.stats.update_hit_rate()
                    logger.debug(f"❌ [REDIS CACHE MISS] {key[:50]}...")
                    return None

            except Exception as e:
                logger.warning(f"Redis get failed for {key}: {e}")
                if self.fallback_to_memory:
                    logger.info("🔄 Falling back to memory cache for get operation")
                    return self.fallback_cache.get(key)
                return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set value in Redis cache with fallback"""
        with self._lock:
            redis_key = self._make_redis_key(key)
            cache_ttl = ttl or self.default_ttl

            if not self.redis_available:
                if self.fallback_to_memory:
                    return self.fallback_cache.set(key, value, cache_ttl)
                return False

            try:
                # Serialize value
                serialized_data = self._serialize_value(value)

                # Store in Redis with TTL
                result = self.redis_client.setex(redis_key, cache_ttl, serialized_data)

                if result:
                    # Track key patterns
                    pattern = key.split(':')[0] if ':' in key else 'default'
                    self._key_patterns[pattern] = self._key_patterns.get(pattern, 0) + 1

                    # Update stats
                    self.stats.entry_count += 1

                    logger.info(f"💾 [REDIS CACHED] {key[:50]}... (TTL: {cache_ttl}s)")
                    return True
                else:
                    logger.warning(f"Redis set operation returned False for {key}")
                    return False

            except Exception as e:
                logger.warning(f"Redis set failed for {key}: {e}")
                if self.fallback_to_memory:
                    logger.info("🔄 Falling back to memory cache for set operation")
                    return self.fallback_cache.set(key, value, cache_ttl)
                return False

    def delete(self, key: str) -> bool:
        """Delete key from Redis cache"""
        with self._lock:
            redis_key = self._make_redis_key(key)

            if not self.redis_available:
                if self.fallback_to_memory:
                    return self.fallback_cache.delete(key)
                return False

            try:
                result = self.redis_client.delete(redis_key)
                if result > 0:
                    self.stats.entry_count = max(0, self.stats.entry_count - 1)
                    logger.info(f"🗑️ [REDIS DELETE] {key[:50]}...")
                    return True
                return False

            except Exception as e:
                logger.warning(f"Redis delete failed for {key}: {e}")
                if self.fallback_to_memory:
                    return self.fallback_cache.delete(key)
                return False

    def clear(self, pattern: Optional[str] = None) -> int:
        """Clear cache entries, optionally by pattern"""
        with self._lock:
            if not self.redis_available:
                if self.fallback_to_memory:
                    return self.fallback_cache.clear(pattern)
                return 0

            try:
                if pattern:
                    # Clear by pattern
                    search_pattern = f"{self.key_prefix}*{pattern}*"
                    keys = self.redis_client.keys(search_pattern)
                    if keys:
                        count = self.redis_client.delete(*keys)
                        self.stats.entry_count = max(0, self.stats.entry_count - count)
                        logger.info(f"🧹 [REDIS CLEAR] {count} entries matching pattern: {pattern}")
                        return count
                    return 0
                else:
                    # Clear all cache entries with our prefix
                    search_pattern = f"{self.key_prefix}*"
                    keys = self.redis_client.keys(search_pattern)
                    if keys:
                        count = self.redis_client.delete(*keys)
                        self.stats.entry_count = 0
                        logger.info(f"🧹 [REDIS CLEAR] All {count} cache entries")
                        return count
                    return 0

            except Exception as e:
                logger.warning(f"Redis clear failed: {e}")
                if self.fallback_to_memory:
                    return self.fallback_cache.clear(pattern)
                return 0

    def clear_pattern(self, pattern: str) -> int:
        """Clear entries matching pattern (for compatibility)"""
        return self.clear(pattern)

    def get_detailed_stats(self) -> Dict[str, Any]:
        """Get comprehensive cache statistics"""
        with self._lock:
            if not self.redis_available:
                if self.fallback_to_memory:
                    fallback_stats = self.fallback_cache.get_detailed_stats()
                    fallback_stats['redis_status'] = 'unavailable'
                    fallback_stats['fallback_mode'] = True
                    return fallback_stats
                return {'redis_status': 'unavailable', 'error': 'No fallback cache available'}

            try:
                # Get Redis info
                redis_info = self.redis_client.info()

                # Calculate memory usage
                memory_usage_mb = redis_info.get('used_memory', 0) / 1024 / 1024

                # Get key count in our namespace
                search_pattern = f"{self.key_prefix}*"
                key_count = len(self.redis_client.keys(search_pattern))

                return {
                    'performance_metrics': {
                        'hit_rate_percent': round(self.stats.hit_rate, 2),
                        'total_hits': self.stats.hits,
                        'total_misses': self.stats.misses,
                        'total_requests': self.stats.hits + self.stats.misses
                    },
                    'memory_metrics': {
                        'redis_memory_usage_mb': round(memory_usage_mb, 2),
                        'redis_used_memory_peak_mb': round(redis_info.get('used_memory_peak', 0) / 1024 / 1024, 2),
                        'redis_memory_fragmentation_ratio': redis_info.get('mem_fragmentation_ratio', 1.0)
                    },
                    'capacity_metrics': {
                        'entry_count': key_count,
                        'tracked_entry_count': self.stats.entry_count,
                        'key_patterns': self._key_patterns
                    },
                    'redis_info': {
                        'redis_version': redis_info.get('redis_version', 'unknown'),
                        'connected_clients': redis_info.get('connected_clients', 0),
                        'uptime_in_seconds': redis_info.get('uptime_in_seconds', 0),
                        'keyspace_hits': redis_info.get('keyspace_hits', 0),
                        'keyspace_misses': redis_info.get('keyspace_misses', 0),
                        'expired_keys': redis_info.get('expired_keys', 0),
                        'evicted_keys': redis_info.get('evicted_keys', 0)
                    },
                    'configuration': {
                        'key_prefix': self.key_prefix,
                        'default_ttl_seconds': self.default_ttl,
                        'compression_threshold_bytes': self.compression_threshold,
                        'redis_available': self.redis_available,
                        'fallback_to_memory': self.fallback_to_memory
                    }
                }

            except Exception as e:
                logger.error(f"Failed to get Redis stats: {e}")
                return {
                    'error': str(e),
                    'redis_status': 'error',
                    'performance_metrics': {
                        'hit_rate_percent': round(self.stats.hit_rate, 2),
                        'total_hits': self.stats.hits,
                        'total_misses': self.stats.misses,
                        'total_requests': self.stats.hits + self.stats.misses
                    }
                }

    def ping(self) -> bool:
        """Test Redis connection"""
        if not self.redis_available:
            return False

        try:
            return self.redis_client.ping()
        except Exception as e:
            logger.warning(f"Redis ping failed: {e}")
            return False

    def warm_cache(self, entries: List[Tuple[str, Any, Optional[int]]]) -> Dict[str, int]:
        """Warm cache with multiple entries efficiently"""
        results = {'success': 0, 'failed': 0, 'skipped': 0}

        for key, value, ttl in entries:
            # Check if key already exists
            if self.get(key) is not None:
                results['skipped'] += 1
                continue

            if self.set(key, value, ttl):
                results['success'] += 1
            else:
                results['failed'] += 1

        logger.info(f"🔥 [REDIS CACHE WARMING] {results}")
        return results

# Global Redis cache service instance
redis_cache_service = None

def get_redis_cache_service() -> RedisCacheService:
    """Get or create global Redis cache service instance"""
    global redis_cache_service
    if redis_cache_service is None:
        redis_cache_service = RedisCacheService()
    return redis_cache_service

# Redis-based decorators for compatibility
def redis_cached(ttl: int = 1800, key_func: Optional[Callable] = None):
    """Redis caching decorator"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            cache_service = get_redis_cache_service()

            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                # Simple key generation
                key_components = [
                    func.__name__,
                    hashlib.md5(str(args).encode()).hexdigest()[:8],
                    hashlib.md5(str(kwargs).encode()).hexdigest()[:8]
                ]
                cache_key = ':'.join(key_components)

            # Try cache first
            cached_result = cache_service.get(cache_key)
            if cached_result is not None:
                return cached_result

            # Execute function
            start_time = time.time()
            result = func(*args, **kwargs)
            execution_time = time.time() - start_time

            # Cache result
            cache_service.set(cache_key, result, ttl)

            logger.debug(f"💾 [REDIS CACHED] {func.__name__} result (exec: {execution_time:.3f}s)")
            return result

        return wrapper
    return decorator