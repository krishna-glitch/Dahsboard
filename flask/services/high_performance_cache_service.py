"""
High-Performance Cache Service with Advanced Data Structures
Implements efficient caching using optimized data structures for better performance
"""

import time
import logging
import threading
import weakref
from collections import OrderedDict, defaultdict, deque
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, Union, List, Callable, Tuple
from datetime import datetime, timedelta
import pickle
import hashlib
import json
from functools import wraps

logger = logging.getLogger(__name__)

@dataclass
class CacheEntry:
    """Optimized cache entry with metadata"""
    data: Any
    timestamp: float
    access_count: int = 0
    last_accessed: float = field(default_factory=time.time)
    size_bytes: int = 0
    ttl: Optional[float] = None
    
    def __post_init__(self):
        if self.size_bytes == 0:
            try:
                self.size_bytes = len(pickle.dumps(self.data))
            except (TypeError, pickle.PicklingError, OverflowError) as e:
                logger.debug(f"Failed to calculate data size for caching: {e}")
                self.size_bytes = 1024  # Default estimate
    
    def is_expired(self, current_time: Optional[float] = None) -> bool:
        """Check if entry is expired"""
        if self.ttl is None:
            return False
        current = current_time or time.time()
        return current - self.timestamp > self.ttl
    
    def access(self):
        """Mark entry as accessed"""
        self.access_count += 1
        self.last_accessed = time.time()

@dataclass  
class CacheStats:
    """Cache statistics with efficient tracking"""
    hits: int = 0
    misses: int = 0
    evictions: int = 0
    memory_usage_bytes: int = 0
    entry_count: int = 0
    hit_rate: float = 0.0
    
    def update_hit_rate(self):
        total = self.hits + self.misses
        self.hit_rate = (self.hits / total * 100) if total > 0 else 0.0

class HighPerformanceCacheService:
    """Advanced caching service with optimized data structures"""
    
    def __init__(self, 
                 max_size: int = 10000,
                 max_memory_mb: int = 512,
                 default_ttl: int = 300,
                 cleanup_interval: int = 60):
        
        # Core cache storage - OrderedDict for O(1) LRU operations
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        
        # Hot cache for frequently accessed items
        self._hot_cache: Dict[str, CacheEntry] = {}
        self._hot_cache_max_size = max(100, max_size // 20)
        
        # Access frequency tracking with efficient structures
        self._access_frequency: defaultdict[str, int] = defaultdict(int)
        self._hot_keys: deque = deque(maxlen=1000)  # Recently accessed keys
        
        # Configuration
        self.max_size = max_size
        self.max_memory_bytes = max_memory_mb * 1024 * 1024
        self.default_ttl = default_ttl
        self.cleanup_interval = cleanup_interval
        
        # Statistics with efficient tracking
        self.stats = CacheStats()
        
        # Thread safety
        self._lock = threading.RLock()
        
        # Background cleanup
        self._last_cleanup = time.time()
        
        # Key pattern tracking for intelligent eviction
        self._key_patterns: defaultdict[str, List[str]] = defaultdict(list)
        
        logger.info(f"HighPerformanceCacheService initialized: "
                   f"max_size={max_size}, max_memory={max_memory_mb}MB")
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache with O(1) average performance"""
        with self._lock:
            start_time = time.time()
            
            # Check hot cache first - most frequent items
            if key in self._hot_cache:
                entry = self._hot_cache[key]
                if not entry.is_expired():
                    entry.access()
                    self.stats.hits += 1
                    self.stats.update_hit_rate()
                    logger.debug(f"🔥 HOT cache hit for {key[:30]}...")
                    return entry.data
                else:
                    del self._hot_cache[key]
            
            # Check main cache
            if key in self._cache:
                entry = self._cache[key]
                if not entry.is_expired():
                    # Move to end (LRU) - O(1) operation
                    self._cache.move_to_end(key)
                    entry.access()
                    
                    # Update access tracking
                    self._access_frequency[key] += 1
                    self._hot_keys.append(key)
                    
                    # Promote to hot cache if frequently accessed
                    if (self._access_frequency[key] >= 10 and 
                        len(self._hot_cache) < self._hot_cache_max_size):
                        self._hot_cache[key] = entry
                        logger.debug(f"⬆️ Promoted to hot cache: {key[:30]}...")
                    
                    self.stats.hits += 1
                    self.stats.update_hit_rate()
                    
                    lookup_time = (time.time() - start_time) * 1000
                    logger.debug(f"✅ Cache hit for {key[:30]}... ({lookup_time:.1f}ms)")
                    return entry.data
                else:
                    # Expired entry - remove
                    self._remove_entry(key)
            
            # Cache miss
            self.stats.misses += 1
            self.stats.update_hit_rate()
            logger.debug(f"❌ Cache miss for {key[:30]}...")
            return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set value in cache with efficient memory management"""
        with self._lock:
            try:
                # Create cache entry
                entry_ttl = ttl or self.default_ttl
                entry = CacheEntry(
                    data=value,
                    timestamp=time.time(),
                    ttl=entry_ttl
                )
                
                # Memory check before adding
                if (self.stats.memory_usage_bytes + entry.size_bytes > self.max_memory_bytes and
                    key not in self._cache):
                    self._evict_by_memory(entry.size_bytes)
                
                # Size check
                if len(self._cache) >= self.max_size and key not in self._cache:
                    self._evict_lru(1)
                
                # Update existing or add new
                old_entry = self._cache.get(key)
                if old_entry:
                    self.stats.memory_usage_bytes -= old_entry.size_bytes
                
                self._cache[key] = entry
                self._cache.move_to_end(key)  # Mark as most recently used
                
                # Update statistics
                self.stats.memory_usage_bytes += entry.size_bytes
                if not old_entry:
                    self.stats.entry_count += 1
                
                # Track key patterns for intelligent caching
                self._track_key_pattern(key)
                
                # Periodic cleanup
                if time.time() - self._last_cleanup > self.cleanup_interval:
                    self._background_cleanup()
                
                logger.debug(f"💾 Cached {key[:30]}... (size: {entry.size_bytes} bytes, TTL: {entry_ttl}s)")
                return True
                
            except Exception as e:
                logger.error(f"Failed to cache {key}: {e}")
                return False
    
    def delete(self, key: str) -> bool:
        """Delete key from cache"""
        with self._lock:
            removed = self._remove_entry(key)
            if removed:
                logger.debug(f"🗑️ Deleted cache entry: {key[:30]}...")
            return removed
    
    def clear(self, pattern: Optional[str] = None) -> int:
        """Clear cache entries, optionally by pattern"""
        with self._lock:
            if pattern:
                keys_to_remove = [k for k in self._cache.keys() if pattern in k]
                for key in keys_to_remove:
                    self._remove_entry(key)
                count = len(keys_to_remove)
                logger.info(f"🧹 Cleared {count} entries matching pattern: {pattern}")
                return count
            else:
                count = len(self._cache)
                self._cache.clear()
                self._hot_cache.clear()
                self._access_frequency.clear()
                self.stats = CacheStats()
                logger.info(f"🧹 Cleared all {count} cache entries")
                return count
    
    def _remove_entry(self, key: str) -> bool:
        """Remove entry from all cache levels"""
        removed = False
        
        if key in self._cache:
            entry = self._cache[key]
            self.stats.memory_usage_bytes -= entry.size_bytes
            self.stats.entry_count -= 1
            del self._cache[key]
            removed = True
        
        if key in self._hot_cache:
            del self._hot_cache[key]
        
        if key in self._access_frequency:
            del self._access_frequency[key]
        
        return removed
    
    def _evict_lru(self, count: int):
        """Evict least recently used entries"""
        evicted = 0
        while evicted < count and self._cache:
            # Get LRU key (first in OrderedDict)
            lru_key = next(iter(self._cache))
            
            # Don't evict hot cache items unless necessary
            if (lru_key in self._hot_cache and 
                len(self._cache) < self.max_size * 1.1):
                self._cache.move_to_end(lru_key)
                continue
            
            self._remove_entry(lru_key)
            evicted += 1
            self.stats.evictions += 1
        
        if evicted > 0:
            logger.debug(f"🚮 Evicted {evicted} LRU entries")
    
    def _evict_by_memory(self, needed_bytes: int):
        """Evict entries to free up memory"""
        freed_bytes = 0
        evicted_count = 0
        
        # Start with largest entries that are not hot
        entries_by_size = [(key, entry) for key, entry in self._cache.items()
                          if key not in self._hot_cache]
        entries_by_size.sort(key=lambda x: x[1].size_bytes, reverse=True)
        
        for key, entry in entries_by_size:
            if freed_bytes >= needed_bytes:
                break
            
            freed_bytes += entry.size_bytes
            self._remove_entry(key)
            evicted_count += 1
            self.stats.evictions += 1
        
        if evicted_count > 0:
            logger.debug(f"🧠 Memory eviction: freed {freed_bytes} bytes ({evicted_count} entries)")
    
    def _background_cleanup(self):
        """Background cleanup of expired entries"""
        current_time = time.time()
        expired_keys = []
        
        # Find expired entries
        for key, entry in self._cache.items():
            if entry.is_expired(current_time):
                expired_keys.append(key)
        
        # Remove expired entries
        for key in expired_keys:
            self._remove_entry(key)
        
        self._last_cleanup = current_time
        
        if expired_keys:
            logger.debug(f"🧹 Background cleanup: removed {len(expired_keys)} expired entries")
    
    def _track_key_pattern(self, key: str):
        """Track key patterns for intelligent caching"""
        # Extract pattern (e.g., prefix before first colon)
        pattern = key.split(':')[0] if ':' in key else 'default'
        self._key_patterns[pattern].append(key)
        
        # Keep only recent keys per pattern
        if len(self._key_patterns[pattern]) > 100:
            self._key_patterns[pattern] = self._key_patterns[pattern][-50:]
    
    def get_detailed_stats(self) -> Dict[str, Any]:
        """Get comprehensive cache statistics"""
        with self._lock:
            # Calculate memory efficiency
            avg_entry_size = (self.stats.memory_usage_bytes / self.stats.entry_count 
                            if self.stats.entry_count > 0 else 0)
            
            # Most accessed keys
            top_keys = sorted(self._access_frequency.items(), 
                            key=lambda x: x[1], reverse=True)[:10]
            
            return {
                'performance_metrics': {
                    'hit_rate_percent': round(self.stats.hit_rate, 2),
                    'total_hits': self.stats.hits,
                    'total_misses': self.stats.misses,
                    'total_requests': self.stats.hits + self.stats.misses
                },
                'memory_metrics': {
                    'memory_usage_mb': round(self.stats.memory_usage_bytes / 1024 / 1024, 2),
                    'memory_limit_mb': round(self.max_memory_bytes / 1024 / 1024, 2),
                    'memory_utilization_percent': round(
                        self.stats.memory_usage_bytes / self.max_memory_bytes * 100, 2),
                    'average_entry_size_bytes': round(avg_entry_size, 2)
                },
                'capacity_metrics': {
                    'entry_count': self.stats.entry_count,
                    'max_entries': self.max_size,
                    'capacity_utilization_percent': round(
                        self.stats.entry_count / self.max_size * 100, 2),
                    'hot_cache_entries': len(self._hot_cache),
                    'hot_cache_max': self._hot_cache_max_size
                },
                'eviction_metrics': {
                    'total_evictions': self.stats.evictions,
                    'eviction_rate': round(
                        self.stats.evictions / (self.stats.hits + self.stats.misses) * 100, 2)
                        if (self.stats.hits + self.stats.misses) > 0 else 0
                },
                'access_patterns': {
                    'most_accessed_keys': top_keys,
                    'key_patterns': {k: len(v) for k, v in self._key_patterns.items()},
                    'recent_hot_promotions': len([k for k in self._hot_keys 
                                                if k in self._hot_cache])
                },
                'configuration': {
                    'default_ttl_seconds': self.default_ttl,
                    'cleanup_interval_seconds': self.cleanup_interval,
                    'last_cleanup': datetime.fromtimestamp(self._last_cleanup).isoformat()
                }
            }
    
    def warm_cache(self, entries: List[Tuple[str, Any, Optional[int]]]) -> Dict[str, int]:
        """Warm cache with multiple entries efficiently"""
        results = {'success': 0, 'failed': 0, 'skipped': 0}
        
        for key, value, ttl in entries:
            if key in self._cache:
                results['skipped'] += 1
                continue
            
            if self.set(key, value, ttl):
                results['success'] += 1
            else:
                results['failed'] += 1
        
        logger.info(f"🔥 Cache warming completed: {results}")
        return results

# Global high-performance cache service
high_performance_cache = HighPerformanceCacheService()

# Enhanced caching decorators
def advanced_cached(ttl: int = 300, 
                   key_func: Optional[Callable] = None,
                   use_hot_cache: bool = True):
    """Advanced caching decorator with high-performance features"""
    
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                # Create reliable key from function signature
                from utils.reliable_cache_keys import ReliableCacheKeyGenerator
                
                args_hash = ReliableCacheKeyGenerator._serialize_args(args) if args else "noargs"
                kwargs_hash = ReliableCacheKeyGenerator._serialize_dict(kwargs) if kwargs else "nokwargs"
                
                key_components = [
                    func.__name__,
                    args_hash[:8],
                    kwargs_hash[:8]
                ]
                cache_key = ':'.join(key_components)
            
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
            
            logger.debug(f"💾 Cached {func.__name__} result (exec: {execution_time:.3f}s)")
            return result
        
        return wrapper
    return decorator

def cache_method_results(ttl: int = 300):
    """Cache method results with instance-aware keys (improved key generation)"""
    import hashlib
    import json
    
    def decorator(method: Callable) -> Callable:
        @wraps(method)
        def wrapper(self, *args, **kwargs):
            # Include instance id in cache key for method caching
            instance_id = f"{self.__class__.__name__}_{id(self)}"
            
            # Create reliable cache key using hashlib instead of built-in hash()
            try:
                # Convert args and kwargs to a stable string representation
                args_str = json.dumps(args, sort_keys=True, default=str)
                kwargs_str = json.dumps(kwargs, sort_keys=True, default=str)
                key_data = f"{instance_id}:{method.__name__}:{args_str}:{kwargs_str}"
                
                # Generate stable hash using hashlib
                cache_key = f"method_cache:{hashlib.md5(key_data.encode()).hexdigest()}"
            except (TypeError, ValueError) as e:
                # Fallback for non-serializable objects
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