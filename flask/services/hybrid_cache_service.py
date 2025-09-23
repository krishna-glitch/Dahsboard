"""
Hybrid Cache Service - Smart Redis + In-Memory Cache with automatic fallback
Provides seamless integration with existing codebase while adding Redis power
"""

import os
import logging
from typing import Any, Optional, Dict, List, Tuple
from services.redis_cache_service import RedisCacheService
from services.high_performance_cache_service import HighPerformanceCacheService

logger = logging.getLogger(__name__)

class HybridCacheService:
    """
    Hybrid cache service that intelligently chooses between Redis and in-memory cache
    - Uses Redis when available for persistence and distributed caching
    - Falls back to in-memory cache when Redis is unavailable
    - Maintains same interface as existing cache services
    """

    def __init__(self):
        # Check if Redis should be enabled via environment variable
        use_redis = os.getenv('USE_REDIS_CACHE', 'true').lower() == 'true'

        self.redis_service = None
        self.memory_service = HighPerformanceCacheService()

        if use_redis:
            try:
                self.redis_service = RedisCacheService(
                    key_prefix='wq_app:',
                    default_ttl=3600,  # 1 hour for better persistence across page refreshes
                    fallback_to_memory=False  # We handle fallback ourselves
                )
                self.primary_cache = 'redis'
                logger.info("🎯 HybridCacheService: Using Redis as primary cache")
            except Exception as e:
                logger.warning(f"🔄 HybridCacheService: Redis unavailable, using memory cache: {e}")
                self.primary_cache = 'memory'
        else:
            logger.info("🎯 HybridCacheService: Using memory cache (Redis disabled)")
            self.primary_cache = 'memory'

    def _get_primary_service(self):
        """Get the primary cache service"""
        if self.primary_cache == 'redis' and self.redis_service:
            return self.redis_service
        return self.memory_service

    def _get_fallback_service(self):
        """Get the fallback cache service"""
        if self.primary_cache == 'redis':
            return self.memory_service
        return None

    def get(self, key: str) -> Optional[Any]:
        """Get value with intelligent fallback"""
        # Try primary cache first
        primary_service = self._get_primary_service()
        try:
            result = primary_service.get(key)
            if result is not None:
                return result
        except Exception as e:
            logger.warning(f"Primary cache get failed for {key}: {e}")

        # Try fallback cache if primary failed
        fallback_service = self._get_fallback_service()
        if fallback_service:
            try:
                return fallback_service.get(key)
            except Exception as e:
                logger.warning(f"Fallback cache get failed for {key}: {e}")

        return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set value with intelligent replication"""
        success = False

        # Set in primary cache
        primary_service = self._get_primary_service()
        try:
            success = primary_service.set(key, value, ttl)
        except Exception as e:
            logger.warning(f"Primary cache set failed for {key}: {e}")

        # Also set in fallback cache for Redis primary (for redundancy)
        if self.primary_cache == 'redis':
            fallback_service = self._get_fallback_service()
            if fallback_service:
                try:
                    # Use shorter TTL for memory cache to save space
                    memory_ttl = min(ttl or 1800, 300) if ttl else 300
                    fallback_service.set(key, value, memory_ttl)
                except Exception as e:
                    logger.debug(f"Fallback cache set failed for {key}: {e}")

        return success

    def delete(self, key: str) -> bool:
        """Delete from both caches"""
        primary_success = False
        fallback_success = False

        # Delete from primary cache
        primary_service = self._get_primary_service()
        try:
            primary_success = primary_service.delete(key)
        except Exception as e:
            logger.warning(f"Primary cache delete failed for {key}: {e}")

        # Delete from fallback cache
        fallback_service = self._get_fallback_service()
        if fallback_service:
            try:
                fallback_success = fallback_service.delete(key)
            except Exception as e:
                logger.debug(f"Fallback cache delete failed for {key}: {e}")

        return primary_success or fallback_success

    def clear(self, pattern: Optional[str] = None) -> int:
        """Clear from both caches"""
        total_cleared = 0

        # Clear from primary cache
        primary_service = self._get_primary_service()
        try:
            total_cleared += primary_service.clear(pattern)
        except Exception as e:
            logger.warning(f"Primary cache clear failed: {e}")

        # Clear from fallback cache
        fallback_service = self._get_fallback_service()
        if fallback_service:
            try:
                total_cleared += fallback_service.clear(pattern)
            except Exception as e:
                logger.debug(f"Fallback cache clear failed: {e}")

        return total_cleared

    def clear_pattern(self, pattern: str) -> int:
        """Clear entries matching pattern (compatibility method)"""
        return self.clear(pattern)

    def get_detailed_stats(self) -> Dict[str, Any]:
        """Get comprehensive stats from both caches"""
        stats = {
            'hybrid_cache_info': {
                'primary_cache': self.primary_cache,
                'redis_available': self.redis_service is not None and self.redis_service.redis_available,
                'fallback_available': self._get_fallback_service() is not None
            }
        }

        # Get primary cache stats
        primary_service = self._get_primary_service()
        try:
            primary_stats = primary_service.get_detailed_stats()
            stats['primary_cache_stats'] = primary_stats
        except Exception as e:
            stats['primary_cache_error'] = str(e)

        # Get fallback cache stats
        fallback_service = self._get_fallback_service()
        if fallback_service:
            try:
                fallback_stats = fallback_service.get_detailed_stats()
                stats['fallback_cache_stats'] = fallback_stats
            except Exception as e:
                stats['fallback_cache_error'] = str(e)

        return stats

    def warm_cache(self, entries: List[Tuple[str, Any, Optional[int]]]) -> Dict[str, int]:
        """Warm both caches"""
        primary_service = self._get_primary_service()
        try:
            return primary_service.warm_cache(entries)
        except Exception as e:
            logger.warning(f"Cache warming failed: {e}")
            return {'success': 0, 'failed': len(entries), 'skipped': 0}

    def ping(self) -> Dict[str, bool]:
        """Test connectivity to all cache services"""
        result = {
            'memory_cache': True,  # Memory cache is always available
            'redis_cache': False
        }

        if self.redis_service:
            try:
                result['redis_cache'] = self.redis_service.ping()
            except Exception:
                result['redis_cache'] = False

        return result

    def switch_to_redis(self) -> bool:
        """Attempt to switch to Redis as primary cache"""
        if self.redis_service and self.redis_service.ping():
            self.primary_cache = 'redis'
            logger.info("🔄 Switched to Redis as primary cache")
            return True
        return False

    def switch_to_memory(self) -> bool:
        """Switch to memory as primary cache"""
        self.primary_cache = 'memory'
        logger.info("🔄 Switched to memory as primary cache")
        return True

    def get_cache_mode(self) -> str:
        """Get current cache mode"""
        return self.primary_cache

# Global hybrid cache service instance
hybrid_cache_service = HybridCacheService()

# Backward compatibility functions
def cache_get(key: str):
    """Get value from hybrid cache"""
    return hybrid_cache_service.get(key)

def cache_set(key: str, value, ttl: int = 300):
    """Set value in hybrid cache"""
    return hybrid_cache_service.set(key, value, ttl)

def cache_delete(key: str):
    """Delete key from hybrid cache"""
    return hybrid_cache_service.delete(key)

def cache_clear():
    """Clear all cache entries"""
    return hybrid_cache_service.clear()

def cache_stats():
    """Get cache statistics"""
    return hybrid_cache_service.get_detailed_stats()

def get_cache_service():
    """Get the hybrid cache service instance"""
    return hybrid_cache_service