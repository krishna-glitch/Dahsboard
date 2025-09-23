#!/usr/bin/env python3
"""
Clear all cached data to force regeneration with improved cache keys
"""

import sys
import os
sys.path.append('/home/skrishna/migration/flask')

def clear_all_caches():
    """Clear all caches to force regeneration"""

    print("🧹 Clearing all caches to force regeneration with improved cache keys...")

    try:
        # Import cache services
        from services.hybrid_cache_service import hybrid_cache_service
        from services.consolidated_cache_service import cache_service
        from utils.redis_api_cache_utils import invalidate_redis_api_cache
        from utils.api_cache_utils import invalidate_api_cache

        # Clear Redis/hybrid cache
        try:
            print("🗑️ Clearing Redis/hybrid cache...")
            hybrid_cache_service.clear_pattern("*")
            print("✅ Redis/hybrid cache cleared")
        except Exception as e:
            print(f"⚠️ Redis cache clear failed (may not be available): {e}")

        # Clear consolidated cache service
        try:
            print("🗑️ Clearing consolidated cache...")
            cache_service.clear_pattern("*")
            print("✅ Consolidated cache cleared")
        except Exception as e:
            print(f"⚠️ Consolidated cache clear failed: {e}")

        # Clear API caches specifically
        try:
            print("🗑️ Clearing API caches...")
            invalidate_redis_api_cache()  # Clear all API cache entries
            invalidate_api_cache()  # Clear legacy API cache entries
            print("✅ API caches cleared")
        except Exception as e:
            print(f"⚠️ API cache clear failed: {e}")

        print("\n🎉 Cache clearing completed!")
        print("📢 Next API requests will use new cache keys that include all filter parameters")
        print("🔍 This should fix the issue where different filter selections returned the same cached data")

    except Exception as e:
        print(f"❌ Cache clearing failed: {e}")
        print("💡 You may need to restart the Flask application to clear in-memory caches")

if __name__ == "__main__":
    clear_all_caches()