"""
High-Performance Query Optimizer with Advanced Data Structures
Optimizes database queries using efficient caching and query pattern analysis
"""

import logging
import time
import bisect
from collections import defaultdict, deque, OrderedDict
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List, Tuple, Set
import pandas as pd
import hashlib
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

@dataclass
class QueryMetrics:
    """Efficient storage for query performance metrics"""
    execution_times: deque = field(default_factory=lambda: deque(maxlen=100))
    cache_hit_count: int = 0
    cache_miss_count: int = 0
    last_execution: Optional[datetime] = None
    avg_execution_time: float = 0.0
    total_executions: int = 0

class HighPerformanceQueryOptimizer:
    """Optimized query executor with advanced data structures"""
    
    def __init__(self, db_connection, cache_ttl_seconds: int = 300, max_cache_size: int = 1000):
        self.db = db_connection
        
        # LRU Cache using OrderedDict for O(1) operations
        self.query_cache: OrderedDict[str, Tuple[pd.DataFrame, float]] = OrderedDict()
        self.cache_ttl = cache_ttl_seconds
        self.max_cache_size = max_cache_size
        
        # High-performance metrics storage
        self.query_metrics: Dict[str, QueryMetrics] = defaultdict(QueryMetrics)
        
        # Query frequency tracking with efficient sorted structure
        self.query_frequency: defaultdict[str, int] = defaultdict(int)
        self.frequent_queries: List[Tuple[int, str]] = []  # Sorted by frequency
        
        # Hot query cache - keep most frequent queries always cached
        self.hot_cache: Set[str] = set()
        self.hot_cache_size = min(50, max_cache_size // 4)
        
        # Query pattern optimization
        self.similar_queries: defaultdict[str, Set[str]] = defaultdict(set)
        
        logger.info(f"HighPerformanceQueryOptimizer initialized with {max_cache_size} cache size")

    def execute_cached_query(self, query: str, cache_key: str, params: Optional[Dict] = None) -> pd.DataFrame:
        """Execute query with high-performance caching and metrics tracking"""
        start_time = time.time()
        now = start_time
        
        # Update query frequency for optimization
        self.query_frequency[cache_key] += 1
        self._update_frequent_queries(cache_key)
        
        # Check cache with O(1) lookup
        if cache_key in self.query_cache:
            cached_data, timestamp = self.query_cache[cache_key]
            if now - timestamp < self.cache_ttl:
                # Move to end (most recently used) - O(1) operation
                self.query_cache.move_to_end(cache_key)
                
                # Update metrics
                metrics = self.query_metrics[cache_key]
                metrics.cache_hit_count += 1
                
                cache_time = (time.time() - start_time) * 1000
                logger.debug(f"🚀 Cache HIT for {cache_key[:30]}... ({cache_time:.1f}ms)")
                return cached_data
        
        # Cache miss - execute query
        logger.debug(f"💾 Cache MISS for {cache_key[:30]}...")
        df = self.db.execute_query(query, params)
        execution_time = time.time() - start_time
        
        # Update metrics with efficient deque operations
        metrics = self.query_metrics[cache_key]
        metrics.execution_times.append(execution_time)
        metrics.cache_miss_count += 1
        metrics.last_execution = datetime.now()
        metrics.total_executions += 1
        metrics.avg_execution_time = sum(metrics.execution_times) / len(metrics.execution_times)
        
        # Cache management with LRU eviction
        self._cache_with_eviction(cache_key, df, now)
        
        logger.debug(f"✅ Query executed in {execution_time*1000:.1f}ms, cached as {cache_key[:30]}...")
        return df
    
    def _cache_with_eviction(self, cache_key: str, data: pd.DataFrame, timestamp: float):
        """Efficient cache management with LRU eviction"""
        # Add to hot cache if frequent enough
        if (self.query_frequency[cache_key] >= 5 and 
            len(self.hot_cache) < self.hot_cache_size):
            self.hot_cache.add(cache_key)
        
        # Add to cache
        self.query_cache[cache_key] = (data, timestamp)
        
        # LRU eviction - keep hot queries
        while len(self.query_cache) > self.max_cache_size:
            # Get least recently used key
            lru_key = next(iter(self.query_cache))
            
            # Don't evict hot cache items unless absolutely necessary
            if lru_key in self.hot_cache and len(self.query_cache) < self.max_cache_size * 1.2:
                # Move to end and try next item
                self.query_cache.move_to_end(lru_key)
                continue
            
            # Remove LRU item
            del self.query_cache[lru_key]
            logger.debug(f"🗑️ Evicted LRU cache entry: {lru_key[:30]}...")
    
    def _update_frequent_queries(self, cache_key: str):
        """Maintain sorted list of frequent queries using binary search"""
        freq = self.query_frequency[cache_key]
        
        # Remove old entry if exists
        old_entry = (freq - 1, cache_key)
        if old_entry in self.frequent_queries:
            self.frequent_queries.remove(old_entry)
        
        # Insert new entry in sorted position - O(log n) insertion
        new_entry = (freq, cache_key)
        bisect.insort(self.frequent_queries, new_entry)
        
        # Keep only top queries to limit memory
        if len(self.frequent_queries) > 200:
            self.frequent_queries = self.frequent_queries[-200:]
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get comprehensive cache statistics"""
        total_hits = sum(m.cache_hit_count for m in self.query_metrics.values())
        total_misses = sum(m.cache_miss_count for m in self.query_metrics.values())
        total_requests = total_hits + total_misses
        hit_rate = (total_hits / total_requests * 100) if total_requests > 0 else 0
        
        # Calculate average execution times
        avg_times = [m.avg_execution_time for m in self.query_metrics.values() if m.avg_execution_time > 0]
        overall_avg_time = sum(avg_times) / len(avg_times) if avg_times else 0
        
        return {
            'cache_entries': len(self.query_cache),
            'max_cache_size': self.max_cache_size,
            'cache_utilization_percent': (len(self.query_cache) / self.max_cache_size * 100),
            'hit_rate_percent': round(hit_rate, 2),
            'total_hits': total_hits,
            'total_misses': total_misses,
            'hot_cache_entries': len(self.hot_cache),
            'tracked_queries': len(self.query_metrics),
            'avg_execution_time_ms': round(overall_avg_time * 1000, 2),
            'most_frequent_queries': self.frequent_queries[-10:] if self.frequent_queries else [],
            'cache_ttl_seconds': self.cache_ttl
        }
    
    def warm_cache(self, queries: List[Tuple[str, str, Optional[Dict]]]) -> Dict[str, Any]:
        """Pre-warm cache with common queries"""
        results = {'warmed': 0, 'failed': 0, 'skipped': 0}
        
        for query, cache_key, params in queries:
            try:
                if cache_key in self.query_cache:
                    results['skipped'] += 1
                    continue
                
                self.execute_cached_query(query, cache_key, params)
                results['warmed'] += 1
                
            except Exception as e:
                logger.error(f"Failed to warm cache for {cache_key}: {e}")
                results['failed'] += 1
        
        return results
    
    def clear_cache(self, pattern: Optional[str] = None) -> int:
        """Clear cache entries, optionally matching pattern"""
        if pattern:
            keys_to_remove = [k for k in self.query_cache.keys() if pattern in k]
            for key in keys_to_remove:
                del self.query_cache[key]
                self.hot_cache.discard(key)
            return len(keys_to_remove)
        else:
            count = len(self.query_cache)
            self.query_cache.clear()
            self.hot_cache.clear()
            return count
    
    def get_query_insights(self) -> Dict[str, Any]:
        """Get insights about query patterns and performance"""
        if not self.query_metrics:
            return {'insights': 'No query data available'}
        
        # Find slowest queries
        slow_queries = []
        for cache_key, metrics in self.query_metrics.items():
            if metrics.avg_execution_time > 0:
                slow_queries.append((metrics.avg_execution_time, cache_key))
        
        slow_queries.sort(reverse=True)
        
        # Cache efficiency by query
        efficient_queries = []
        for cache_key, metrics in self.query_metrics.items():
            total = metrics.cache_hit_count + metrics.cache_miss_count
            if total > 0:
                hit_rate = metrics.cache_hit_count / total * 100
                efficient_queries.append((hit_rate, cache_key, total))
        
        efficient_queries.sort(reverse=True)
        
        return {
            'slowest_queries': slow_queries[:10],
            'most_efficient_cached_queries': efficient_queries[:10],
            'least_efficient_cached_queries': efficient_queries[-10:],
            'query_frequency_distribution': dict(self.query_frequency),
            'hot_cache_queries': list(self.hot_cache)
        }

# Backward compatibility alias
QueryOptimizer = HighPerformanceQueryOptimizer