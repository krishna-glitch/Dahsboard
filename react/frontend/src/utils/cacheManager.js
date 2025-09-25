/**
 * Frontend Cache Management System with TTL Support
 * Provides unified cache cleanup and TTL management across all frontend caches
 */

// Default TTL values (in milliseconds)
export const DEFAULT_TTL = {
  SHORT: 5 * 60 * 1000,      // 5 minutes - for frequent changing data
  MEDIUM: 10 * 60 * 1000,    // 10 minutes - for moderately stable data
  LONG: 30 * 60 * 1000,      // 30 minutes - for stable data
  VERY_LONG: 60 * 60 * 1000  // 1 hour - for very stable data
};

// Cache registry to track all caches in the application
const cacheRegistry = new Map();

/**
 * Register a cache for automatic TTL management
 * @param {string} name - Cache identifier
 * @param {Map} cache - The cache Map instance
 * @param {number} ttl - Time to live in milliseconds
 * @param {number} maxSize - Maximum cache size
 */
export function registerCache(name, cache, ttl = DEFAULT_TTL.MEDIUM, maxSize = 100) {
  cacheRegistry.set(name, {
    cache,
    ttl,
    maxSize,
    name,
    lastCleanup: Date.now()
  });

  console.log(`🗂️ [CACHE_MANAGER] Registered cache: ${name} (TTL: ${ttl/1000/60}min, Max: ${maxSize})`);
}

/**
 * Unregister a cache from management
 * @param {string} name - Cache identifier
 */
export function unregisterCache(name) {
  if (cacheRegistry.delete(name)) {
    console.log(`🗂️ [CACHE_MANAGER] Unregistered cache: ${name}`);
  }
}

/**
 * Check if a cache entry is expired
 * @param {object} entry - Cache entry with timestamp
 * @param {number} ttl - Time to live in milliseconds
 * @returns {boolean} - True if expired
 */
export function isExpired(entry, ttl) {
  if (!entry || !entry.timestamp) return true;
  return Date.now() - entry.timestamp > ttl;
}

/**
 * Create a cache entry with timestamp
 * @param {any} data - Data to cache
 * @param {object} metadata - Additional metadata
 * @returns {object} - Cache entry with timestamp
 */
export function createCacheEntry(data, metadata = {}) {
  return {
    data,
    timestamp: Date.now(),
    ...metadata
  };
}

/**
 * Clean expired entries from a specific cache
 * @param {string} cacheName - Name of registered cache
 * @returns {number} - Number of entries removed
 */
export function cleanExpiredEntries(cacheName) {
  const cacheInfo = cacheRegistry.get(cacheName);
  if (!cacheInfo) {
    console.warn(`🗂️ [CACHE_MANAGER] Cache not found: ${cacheName}`);
    return 0;
  }

  const { cache, ttl } = cacheInfo;
  const initialSize = cache.size;
  const now = Date.now();
  let removedCount = 0;

  // Check each entry for expiration
  for (const [key, entry] of cache.entries()) {
    if (isExpired(entry, ttl)) {
      cache.delete(key);
      removedCount++;
    }
  }

  if (removedCount > 0) {
    console.log(`🧹 [CACHE_MANAGER] Cleaned ${removedCount}/${initialSize} expired entries from ${cacheName}`);
  }

  // Update last cleanup time
  cacheInfo.lastCleanup = now;

  return removedCount;
}

/**
 * Enforce size limits on a specific cache
 * @param {string} cacheName - Name of registered cache
 * @returns {number} - Number of entries removed
 */
export function enforceSizeLimit(cacheName) {
  const cacheInfo = cacheRegistry.get(cacheName);
  if (!cacheInfo) return 0;

  const { cache, maxSize } = cacheInfo;
  let removedCount = 0;

  if (cache.size > maxSize) {
    // Remove oldest entries (FIFO strategy)
    const entriesToRemove = cache.size - maxSize;
    const keysToRemove = Array.from(cache.keys()).slice(0, entriesToRemove);

    keysToRemove.forEach(key => {
      cache.delete(key);
      removedCount++;
    });

    console.log(`📏 [CACHE_MANAGER] Enforced size limit on ${cacheName}: removed ${removedCount} entries`);
  }

  return removedCount;
}

/**
 * Perform full cleanup on all registered caches
 * @returns {object} - Cleanup statistics
 */
export function performGlobalCleanup() {
  const stats = {
    totalCaches: cacheRegistry.size,
    expiredRemoved: 0,
    sizeEnforced: 0,
    errors: []
  };

  for (const cacheName of cacheRegistry.keys()) {
    try {
      stats.expiredRemoved += cleanExpiredEntries(cacheName);
      stats.sizeEnforced += enforceSizeLimit(cacheName);
    } catch (error) {
      stats.errors.push({ cacheName, error: error.message });
      console.error(`🗂️ [CACHE_MANAGER] Error cleaning cache ${cacheName}:`, error);
    }
  }

  console.log(`🧹 [CACHE_MANAGER] Global cleanup complete:`, stats);
  return stats;
}

/**
 * Get cache statistics for monitoring
 * @returns {object} - Cache statistics
 */
export function getCacheStatistics() {
  const stats = {
    totalCaches: cacheRegistry.size,
    caches: [],
    totalEntries: 0,
    memoryEstimate: 0
  };

  for (const [name, info] of cacheRegistry.entries()) {
    const cacheStats = {
      name,
      size: info.cache.size,
      maxSize: info.maxSize,
      ttl: info.ttl,
      utilizationPercent: Math.round((info.cache.size / info.maxSize) * 100),
      lastCleanup: info.lastCleanup,
      timeSinceLastCleanup: Date.now() - info.lastCleanup
    };

    stats.caches.push(cacheStats);
    stats.totalEntries += cacheStats.size;

    // Rough memory estimate (assuming 1KB per entry average)
    stats.memoryEstimate += cacheStats.size * 1024;
  }

  return stats;
}

/**
 * Start automatic cleanup timer
 * @param {number} intervalMs - Cleanup interval in milliseconds (default: 5 minutes)
 */
let cleanupInterval = null;

export function startAutomaticCleanup(intervalMs = 5 * 60 * 1000) {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }

  cleanupInterval = setInterval(() => {
    console.log('🕒 [CACHE_MANAGER] Starting automatic cleanup...');
    performGlobalCleanup();
  }, intervalMs);

  console.log(`🕒 [CACHE_MANAGER] Automatic cleanup started (interval: ${intervalMs/1000/60}min)`);
}

/**
 * Stop automatic cleanup timer
 */
export function stopAutomaticCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('🕒 [CACHE_MANAGER] Automatic cleanup stopped');
  }
}

/**
 * Emergency cache clear for memory pressure situations
 * @param {number} targetReductionPercent - Target percentage to reduce (default: 50%)
 */
export function emergencyCacheClear(targetReductionPercent = 50) {
  console.warn(`🚨 [CACHE_MANAGER] Emergency cache clear initiated (target: ${targetReductionPercent}% reduction)`);

  const stats = { totalCleared: 0, cachesCleared: 0 };

  for (const [name, info] of cacheRegistry.entries()) {
    const { cache } = info;
    const currentSize = cache.size;
    const targetSize = Math.floor(currentSize * (1 - targetReductionPercent / 100));

    if (currentSize > targetSize) {
      const keysToRemove = Array.from(cache.keys()).slice(0, currentSize - targetSize);
      keysToRemove.forEach(key => cache.delete(key));

      stats.totalCleared += keysToRemove.length;
      stats.cachesCleared++;

      console.warn(`🚨 [CACHE_MANAGER] Emergency cleared ${keysToRemove.length} entries from ${name}`);
    }
  }

  console.warn(`🚨 [CACHE_MANAGER] Emergency clear complete:`, stats);
  return stats;
}

// Browser memory pressure detection (experimental)
if (typeof window !== 'undefined' && 'memory' in performance) {
  let lastMemoryCheck = 0;

  setInterval(() => {
    const memory = performance.memory;
    const usedPercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;

    // If memory usage is high, trigger emergency cleanup
    if (usedPercent > 85 && Date.now() - lastMemoryCheck > 30000) { // Max once per 30 seconds
      console.warn(`🚨 [CACHE_MANAGER] High memory usage detected: ${usedPercent.toFixed(1)}%`);
      emergencyCacheClear(30); // Clear 30% of cache entries
      lastMemoryCheck = Date.now();
    }
  }, 10000); // Check every 10 seconds
}