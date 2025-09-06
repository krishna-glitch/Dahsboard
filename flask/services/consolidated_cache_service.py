"""
Consolidated Cache Service - High-Performance Implementation
Provides backward compatibility while using the optimized high-performance cache
"""

from services.high_performance_cache_service import (
    HighPerformanceCacheService,
    advanced_cached,
    cache_method_results
)

# Global high-performance cache instance
cache_service = HighPerformanceCacheService()

# Backward compatibility functions
def cache_get(key: str):
    """Get value from high-performance cache"""
    return cache_service.get(key)

def cache_set(key: str, value, ttl: int = 300):
    """Set value in high-performance cache"""
    return cache_service.set(key, value, ttl)

def cache_delete(key: str):
    """Delete key from high-performance cache"""
    return cache_service.delete(key)

def cache_clear():
    """Clear all cache entries"""
    return cache_service.clear()

def cache_stats():
    """Get cache statistics"""
    return cache_service.get_detailed_stats()

def get_cache_service():
    """Get the cache service instance"""
    return cache_service

# Backward compatibility decorator
def cached(ttl: int = 300):
    """Backward compatible cached decorator"""
    return advanced_cached(ttl=ttl)