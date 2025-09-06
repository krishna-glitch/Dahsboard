"""
Advanced Performance Cache Service for Large Dataset Visualization
Handles 140K+ data points with intelligent caching strategies
"""

import json
import hashlib
import time
import logging
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import pandas as pd

# Try to import Redis for production caching
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

logger = logging.getLogger(__name__)

@dataclass
class CacheEntry:
    """Cache entry with metadata"""
    data: Any
    created_at: float
    access_count: int
    last_accessed: float
    size_bytes: int
    compression_ratio: float = 1.0
    resolution_level: str = 'raw'

class PerformanceCacheService:
    """
    Advanced caching service optimized for large time-series datasets
    - Multi-tier caching (memory + Redis)  
    - Smart cache eviction based on access patterns
    - Automatic cache warming for common queries
    - Compression for large datasets
    """
    
    def __init__(self, redis_url: str = None, max_memory_entries: int = 100):
        self.max_memory_entries = max_memory_entries
        self.memory_cache: Dict[str, CacheEntry] = {}
        self.access_stats: Dict[str, int] = {}
        
        # Initialize Redis if available
        self.redis_client = None
        if REDIS_AVAILABLE and redis_url:
            try:
                self.redis_client = redis.from_url(redis_url, decode_responses=False)
                self.redis_client.ping()
                logger.info("✅ Redis cache initialized successfully")
            except Exception as e:
                logger.warning(f"Redis initialization failed: {e}, using memory-only cache")
                self.redis_client = None
        
        # Cache statistics
        self.stats = {
            'hits': 0,
            'misses': 0,
            'evictions': 0,
            'memory_usage_mb': 0,
            'redis_usage_mb': 0
        }
        
        # Preloading configuration
        self.preload_config = {
            'common_time_ranges': ['Last 7 Days', 'Last 30 Days', 'Last 90 Days'],
            'common_sites': ['S1', 'S2', 'S3', 'S4'],
            'preload_resolutions': ['1H', '1D', '1W'],
            'background_warmup': True
        }
    
    def generate_cache_key(self, **params) -> str:
        """Generate consistent cache key from parameters"""
        # Sort parameters for consistent hashing
        sorted_params = dict(sorted(params.items()))
        
        # Convert to string and hash
        params_str = json.dumps(sorted_params, sort_keys=True, default=str)
        cache_key = hashlib.md5(params_str.encode()).hexdigest()
        
        return f"wq_data:{cache_key}"
    
    def get(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Get data from cache with fallback to Redis"""
        # Check memory cache first (fastest)
        if cache_key in self.memory_cache:
            entry = self.memory_cache[cache_key]
            entry.access_count += 1
            entry.last_accessed = time.time()
            self.stats['hits'] += 1
            
            logger.debug(f"✅ Memory cache hit: {cache_key}")
            return entry.data
        
        # Check Redis cache (if available)
        if self.redis_client:
            try:
                redis_data = self.redis_client.get(cache_key)
                if redis_data:
                    # Deserialize and promote to memory cache
                    data = json.loads(redis_data)
                    self._promote_to_memory(cache_key, data)
                    self.stats['hits'] += 1
                    
                    logger.debug(f"✅ Redis cache hit: {cache_key}")
                    return data
            except Exception as e:
                logger.warning(f"Redis get error: {e}")
        
        # Cache miss
        self.stats['misses'] += 1
        logger.debug(f"❌ Cache miss: {cache_key}")
        return None
    
    def set(self, cache_key: str, data: Dict[str, Any], 
            ttl: int = 3600, resolution_level: str = 'raw') -> bool:
        """Set data in cache with intelligent storage strategy"""
        
        try:
            # Calculate data size
            data_str = json.dumps(data, default=str)
            size_bytes = len(data_str.encode('utf-8'))
            
            # Create cache entry
            entry = CacheEntry(
                data=data,
                created_at=time.time(),
                access_count=1,
                last_accessed=time.time(),
                size_bytes=size_bytes,
                resolution_level=resolution_level
            )
            
            # Store in memory cache (with eviction if needed)
            if len(self.memory_cache) >= self.max_memory_entries:
                self._evict_from_memory()
            
            self.memory_cache[cache_key] = entry
            
            # Store in Redis for persistence (if available)
            if self.redis_client:
                try:
                    self.redis_client.setex(cache_key, ttl, data_str)
                    logger.debug(f"✅ Stored in Redis: {cache_key} ({size_bytes} bytes)")
                except Exception as e:
                    logger.warning(f"Redis set error: {e}")
            
            # Update statistics
            self._update_memory_stats()
            
            logger.debug(f"✅ Cached data: {cache_key} ({size_bytes} bytes, {resolution_level})")
            return True
            
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            return False
    
    def _promote_to_memory(self, cache_key: str, data: Dict[str, Any]):
        """Promote Redis cache entry to memory cache"""
        if len(self.memory_cache) >= self.max_memory_entries:
            self._evict_from_memory()
        
        entry = CacheEntry(
            data=data,
            created_at=time.time(),
            access_count=1,
            last_accessed=time.time(),
            size_bytes=len(json.dumps(data, default=str).encode('utf-8'))
        )
        
        self.memory_cache[cache_key] = entry
    
    def _evict_from_memory(self):
        """Evict least recently used entries from memory cache"""
        if not self.memory_cache:
            return
        
        # Find LRU entry
        lru_key = min(
            self.memory_cache.keys(),
            key=lambda k: self.memory_cache[k].last_accessed
        )
        
        # Remove LRU entry
        del self.memory_cache[lru_key]
        self.stats['evictions'] += 1
        
        logger.debug(f"🗑️ Evicted from memory cache: {lru_key}")
    
    def warm_cache_background(self, data_loader_func: callable):
        """Background cache warming for common queries"""
        if not self.preload_config['background_warmup']:
            return
        
        logger.info("🔥 Starting background cache warming...")
        
        warming_tasks = []
        
        # Common time range + site combinations
        for time_range in self.preload_config['common_time_ranges']:
            for resolution in self.preload_config['preload_resolutions']:
                cache_key = self.generate_cache_key(
                    time_range=time_range,
                    sites=self.preload_config['common_sites'],
                    resolution=resolution,
                    performance_tier='balanced'
                )
                
                # Only warm if not already cached
                if not self.get(cache_key):
                    warming_tasks.append({
                        'key': cache_key,
                        'params': {
                            'time_range': time_range,
                            'sites': self.preload_config['common_sites'],
                            'resolution': resolution,
                            'performance_tier': 'balanced'
                        }
                    })
        
        # Execute warming tasks (limit to prevent overload)
        for i, task in enumerate(warming_tasks[:5]):  # Limit to 5 warming tasks
            try:
                logger.info(f"🔥 Warming cache {i+1}/{len(warming_tasks[:5])}: {task['params']['time_range']}")
                
                # Load data using provided function
                data = data_loader_func(**task['params'])
                
                if data:
                    self.set(
                        task['key'], 
                        data, 
                        ttl=7200,  # 2 hour TTL for preloaded data
                        resolution_level=task['params']['resolution']
                    )
                    
                # Small delay between warming tasks
                time.sleep(0.1)
                
            except Exception as e:
                logger.warning(f"Cache warming failed for {task['key']}: {e}")
        
        logger.info(f"✅ Cache warming completed: {len(warming_tasks[:5])} entries warmed")
    
    def get_intelligent_cache_strategy(self, **params) -> Dict[str, Any]:
        """
        Determine optimal caching strategy based on query parameters
        """
        days_range = params.get('days_range', 30)
        resolution = params.get('resolution', 'auto')
        performance_tier = params.get('performance_tier', 'balanced')
        
        # Calculate cache priority and TTL based on query characteristics
        if days_range <= 1:
            # Real-time data - short TTL
            ttl = 300  # 5 minutes
            priority = 'high'
            storage_tier = 'memory_only'
        elif days_range <= 7:
            # Recent data - medium TTL
            ttl = 1800  # 30 minutes  
            priority = 'high'
            storage_tier = 'memory_primary'
        elif days_range <= 90:
            # Historical data - long TTL
            ttl = 7200  # 2 hours
            priority = 'medium'
            storage_tier = 'redis_primary'
        else:
            # Long-term historical - very long TTL
            ttl = 86400  # 24 hours
            priority = 'low'
            storage_tier = 'redis_only'
        
        return {
            'ttl': ttl,
            'priority': priority,
            'storage_tier': storage_tier,
            'compress_large_datasets': days_range > 180,
            'background_refresh': days_range > 7 and priority == 'high'
        }
    
    def _update_memory_stats(self):
        """Update memory usage statistics"""
        total_size = sum(entry.size_bytes for entry in self.memory_cache.values())
        self.stats['memory_usage_mb'] = total_size / (1024 * 1024)
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get comprehensive cache statistics"""
        self._update_memory_stats()
        
        hit_rate = self.stats['hits'] / (self.stats['hits'] + self.stats['misses']) if (self.stats['hits'] + self.stats['misses']) > 0 else 0
        
        return {
            **self.stats,
            'hit_rate_percent': round(hit_rate * 100, 2),
            'memory_entries': len(self.memory_cache),
            'redis_available': self.redis_client is not None,
            'most_accessed_keys': self._get_top_accessed_keys(5)
        }
    
    def _get_top_accessed_keys(self, limit: int) -> List[Dict[str, Any]]:
        """Get most frequently accessed cache keys"""
        sorted_entries = sorted(
            self.memory_cache.items(),
            key=lambda x: x[1].access_count,
            reverse=True
        )
        
        return [
            {
                'key': key[:32] + '...' if len(key) > 32 else key,
                'access_count': entry.access_count,
                'resolution': entry.resolution_level,
                'size_kb': round(entry.size_bytes / 1024, 1)
            }
            for key, entry in sorted_entries[:limit]
        ]
    
    def clear_cache(self, pattern: str = None):
        """Clear cache entries matching pattern"""
        if pattern:
            # Clear specific pattern
            keys_to_remove = [key for key in self.memory_cache.keys() if pattern in key]
            for key in keys_to_remove:
                del self.memory_cache[key]
        else:
            # Clear all
            self.memory_cache.clear()
        
        # Clear Redis if available
        if self.redis_client and pattern:
            try:
                keys = self.redis_client.keys(f"*{pattern}*")
                if keys:
                    self.redis_client.delete(*keys)
            except Exception as e:
                logger.warning(f"Redis clear error: {e}")

# Singleton instance
performance_cache = PerformanceCacheService(
    redis_url="redis://localhost:6379/0",  # Configure as needed
    max_memory_entries=50
)