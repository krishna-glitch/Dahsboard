/**
 * Cache System Initialization
 * Sets up automatic cleanup and TTL management for all frontend caches
 */

import {
  startAutomaticCleanup,
  getCacheStatistics,
  performGlobalCleanup,
  DEFAULT_TTL
} from './cacheManager';
import { performAutomatedCacheValidation } from '../services/cacheValidation';

/**
 * Initialize the cache management system
 * Call this early in the application lifecycle
 */
export function initializeCacheSystem() {
  console.log('🚀 [CACHE_SYSTEM] Initializing frontend cache management...');

  // Start automatic cleanup every 5 minutes
  startAutomaticCleanup(5 * 60 * 1000);

  // Log initial cache statistics
  const stats = getCacheStatistics();
  console.log('📊 [CACHE_SYSTEM] Initial cache statistics:', stats);

  // Perform initial cleanup in case of stale data
  performGlobalCleanup();

  // Set up development tools in dev mode
  if (import.meta?.env?.DEV) {
    setupDevelopmentTools();
  }

  // Start periodic cache validation (every 15 minutes)
  startCacheValidationTimer();

  console.log('✅ [CACHE_SYSTEM] Cache management system initialized successfully');
}

/**
 * Set up development tools for cache monitoring
 */
function setupDevelopmentTools() {
  // Add global cache monitoring functions to window for debugging
  if (typeof window !== 'undefined') {
    window.cacheDebug = {
      getStats: getCacheStatistics,
      performCleanup: performGlobalCleanup,
      validateHealth: () => performAutomatedCacheValidation({ executeRecommendations: false }),
      validateAndFix: () => performAutomatedCacheValidation({ executeRecommendations: true }),
      inspectCache: (cacheName) => {
        const stats = getCacheStatistics();
        const cache = stats.caches.find(c => c.name === cacheName);
        return cache || `Cache '${cacheName}' not found`;
      }
    };

    console.log('🛠️ [CACHE_SYSTEM] Development tools available at window.cacheDebug');
  }

  // Log cache statistics periodically in development
  setInterval(() => {
    const stats = getCacheStatistics();
    if (stats.totalEntries > 0) {
      console.group('📊 [CACHE_SYSTEM] Periodic cache statistics');
      console.table(stats.caches.map(cache => ({
        name: cache.name,
        size: cache.size,
        'utilization%': cache.utilizationPercent,
        'TTL(min)': Math.round(cache.ttl / 1000 / 60),
        'lastCleanup': new Date(cache.lastCleanup).toLocaleTimeString()
      })));
      console.log(`Total entries: ${stats.totalEntries}, Memory estimate: ${(stats.memoryEstimate / 1024 / 1024).toFixed(2)}MB`);
      console.groupEnd();
    }
  }, 2 * 60 * 1000); // Every 2 minutes in development
}

/**
 * Cleanup cache system on application shutdown
 */
export function shutdownCacheSystem() {
  console.log('🛑 [CACHE_SYSTEM] Shutting down cache management...');
  performGlobalCleanup();
  console.log('✅ [CACHE_SYSTEM] Cache system shutdown complete');
}

/**
 * Start periodic cache validation against backend
 */
let validationInterval = null;

function startCacheValidationTimer() {
  // Run validation every 15 minutes
  validationInterval = setInterval(async () => {
    try {
      console.log('🔍 [CACHE_SYSTEM] Starting periodic cache validation...');

      const results = await performAutomatedCacheValidation({
        executeRecommendations: true,
        executionOptions: {
          autoExecute: true,
          maxActions: 2, // Limit to 2 automated actions per validation
          skipHighPriority: false // Allow high priority actions in automated mode
        }
      });

      if (results.overall_success) {
        console.log('✅ [CACHE_SYSTEM] Periodic validation completed successfully');
      } else {
        console.warn('⚠️ [CACHE_SYSTEM] Periodic validation found issues:', results);
      }

    } catch (error) {
      console.error('❌ [CACHE_SYSTEM] Periodic validation failed:', error);
    }
  }, 15 * 60 * 1000); // 15 minutes

  console.log('🔍 [CACHE_SYSTEM] Periodic cache validation started (interval: 15min)');
}

/**
 * Stop periodic cache validation
 */
function stopCacheValidationTimer() {
  if (validationInterval) {
    clearInterval(validationInterval);
    validationInterval = null;
    console.log('🔍 [CACHE_SYSTEM] Periodic cache validation stopped');
  }
}

/**
 * Enhanced shutdown with validation cleanup
 */
export function shutdownCacheSystem() {
  console.log('🛑 [CACHE_SYSTEM] Shutting down cache management...');
  stopCacheValidationTimer();
  performGlobalCleanup();
  console.log('✅ [CACHE_SYSTEM] Cache system shutdown complete');
}

// Export cache configuration for easy access
export const CACHE_CONFIG = {
  TTL: DEFAULT_TTL,
  CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 minutes
  VALIDATION_INTERVAL: 15 * 60 * 1000, // 15 minutes
  MAX_SIZES: {
    PENDING_REQUESTS: 50,
    DATE_RANGE_CACHE: 20,
    MONTHLY_CACHE: 100,
    PERFORMANCE_CACHE: 30
  }
};