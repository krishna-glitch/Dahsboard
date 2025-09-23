/**
 * Frontend Cache Validation Service
 * Validates frontend cache entries against backend cache health and provides synchronization
 */

import { api } from './api';
import {
  getCacheStatistics,
  performGlobalCleanup,
  emergencyCacheClear,
  DEFAULT_TTL
} from '../utils/cacheManager';

/**
 * Validate frontend caches against backend cache health
 * @returns {Promise<object>} - Validation results with recommendations
 */
export async function validateCacheHealth() {
  try {
    console.log('🔍 [CACHE_VALIDATION] Starting cache validation...');

    // Get backend cache health
    const backendHealth = await api.get('/performance/cache/health');

    // Get frontend cache statistics
    const frontendStats = getCacheStatistics();

    // Perform validation checks
    const validationResults = {
      timestamp: new Date().toISOString(),
      backend_health: backendHealth.data,
      frontend_stats: frontendStats,
      validation_checks: [],
      recommendations: [],
      overall_status: 'healthy',
      sync_required: false
    };

    // Check 1: Backend cache health vs frontend cache utilization
    const backendHitRate = backendHealth.data.metrics?.hit_rate_percent || 0;
    const frontendUtilization = frontendStats.totalEntries > 0
      ? (frontendStats.totalEntries / frontendStats.caches.reduce((sum, c) => sum + c.maxSize, 0)) * 100
      : 0;

    validationResults.validation_checks.push({
      name: 'cache_utilization_alignment',
      status: 'info',
      backend_hit_rate: backendHitRate,
      frontend_utilization: frontendUtilization,
      message: `Backend hit rate: ${backendHitRate.toFixed(1)}%, Frontend utilization: ${frontendUtilization.toFixed(1)}%`
    });

    // Check 2: Memory pressure correlation
    const backendMemoryUsage = backendHealth.data.metrics?.memory_usage_percent || 0;
    const frontendMemoryEstimate = (frontendStats.memoryEstimate / 1024 / 1024); // MB

    if (backendMemoryUsage > 80 && frontendMemoryEstimate > 10) {
      validationResults.validation_checks.push({
        name: 'memory_pressure_correlation',
        status: 'warning',
        backend_memory: backendMemoryUsage,
        frontend_memory_mb: frontendMemoryEstimate,
        message: 'Both backend and frontend showing high memory usage'
      });

      validationResults.recommendations.push({
        type: 'memory_optimization',
        priority: 'high',
        action: 'Consider reducing frontend cache sizes and triggering cleanup',
        automated_action: 'cleanup_recommended'
      });

      if (validationResults.overall_status === 'healthy') {
        validationResults.overall_status = 'warning';
      }
    }

    // Check 3: Error rate correlation
    const backendErrorRate = backendHealth.data.metrics?.error_rate_percent || 0;

    if (backendErrorRate > 5) {
      validationResults.validation_checks.push({
        name: 'backend_error_correlation',
        status: 'error',
        backend_error_rate: backendErrorRate,
        message: 'High backend error rate may indicate cache invalidation needed'
      });

      validationResults.recommendations.push({
        type: 'cache_invalidation',
        priority: 'high',
        action: 'Clear frontend caches to force fresh data retrieval',
        automated_action: 'invalidation_recommended'
      });

      validationResults.overall_status = 'error';
      validationResults.sync_required = true;
    }

    // Check 4: Cache warming synchronization
    const backendCacheWarming = backendHealth.data.cache_warming || {};
    const lastWarming = backendCacheWarming.last_warming;

    if (lastWarming) {
      const warmingTime = new Date(lastWarming);
      const timeSinceWarming = Date.now() - warmingTime.getTime();
      const hoursSinceWarming = timeSinceWarming / (1000 * 60 * 60);

      if (hoursSinceWarming < 1) {
        // Recent warming - validate frontend caches are not stale
        validationResults.validation_checks.push({
          name: 'post_warming_validation',
          status: 'info',
          hours_since_warming: hoursSinceWarming.toFixed(1),
          message: 'Recent backend cache warming detected'
        });

        validationResults.recommendations.push({
          type: 'sync_opportunity',
          priority: 'medium',
          action: 'Consider refreshing critical frontend caches to benefit from backend warming',
          automated_action: 'refresh_recommended'
        });
      }
    }

    // Check 5: Frontend cache TTL validation
    const expiredCacheCount = frontendStats.caches.filter(cache => {
      const timeSinceLastCleanup = Date.now() - cache.lastCleanup;
      return timeSinceLastCleanup > DEFAULT_TTL.MEDIUM;
    }).length;

    if (expiredCacheCount > 0) {
      validationResults.validation_checks.push({
        name: 'frontend_ttl_validation',
        status: 'warning',
        expired_caches: expiredCacheCount,
        total_caches: frontendStats.caches.length,
        message: `${expiredCacheCount} frontend caches may have expired entries`
      });

      validationResults.recommendations.push({
        type: 'ttl_cleanup',
        priority: 'medium',
        action: 'Run frontend cache cleanup to remove expired entries',
        automated_action: 'cleanup_recommended'
      });

      if (validationResults.overall_status === 'healthy') {
        validationResults.overall_status = 'warning';
      }
    }

    // Generate overall assessment
    if (validationResults.overall_status === 'healthy') {
      validationResults.recommendations.push({
        type: 'status',
        priority: 'info',
        action: 'Cache validation passed - no issues detected',
        automated_action: 'none'
      });
    }

    console.log(`🔍 [CACHE_VALIDATION] Validation complete: ${validationResults.overall_status}`);
    return validationResults;

  } catch (error) {
    console.error('🔍 [CACHE_VALIDATION] Validation failed:', error);
    return {
      timestamp: new Date().toISOString(),
      overall_status: 'error',
      error: error.message,
      validation_checks: [],
      recommendations: [{
        type: 'error',
        priority: 'high',
        action: 'Unable to validate cache health - check backend connectivity',
        automated_action: 'none'
      }]
    };
  }
}

/**
 * Execute recommended actions from validation results
 * @param {object} validationResults - Results from validateCacheHealth()
 * @param {object} options - Execution options
 * @returns {Promise<object>} - Execution results
 */
export async function executeValidationRecommendations(validationResults, options = {}) {
  const {
    autoExecute = true,
    maxActions = 3,
    skipHighPriority = false
  } = options;

  if (!validationResults || !validationResults.recommendations) {
    throw new Error('Invalid validation results provided');
  }

  console.log('🔧 [CACHE_VALIDATION] Executing recommendations...');

  const executionResults = {
    timestamp: new Date().toISOString(),
    actions_attempted: 0,
    actions_successful: 0,
    actions_failed: 0,
    results: []
  };

  // Filter and sort recommendations
  let recommendations = validationResults.recommendations.filter(rec =>
    rec.automated_action && rec.automated_action !== 'none'
  );

  if (skipHighPriority) {
    recommendations = recommendations.filter(rec => rec.priority !== 'high');
  }

  // Sort by priority (high, medium, low)
  const priorityOrder = { high: 0, medium: 1, low: 2, info: 3 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Limit actions
  recommendations = recommendations.slice(0, maxActions);

  for (const recommendation of recommendations) {
    if (!autoExecute && recommendation.priority === 'high') {
      console.log(`🔧 [CACHE_VALIDATION] Skipping high-priority action (requires manual approval): ${recommendation.automated_action}`);
      continue;
    }

    executionResults.actions_attempted++;

    try {
      let actionResult = null;

      switch (recommendation.automated_action) {
        case 'cleanup_recommended':
          console.log('🧹 [CACHE_VALIDATION] Executing cache cleanup...');
          actionResult = performGlobalCleanup();
          break;

        case 'invalidation_recommended':
          console.log('🗑️ [CACHE_VALIDATION] Executing cache invalidation...');
          actionResult = emergencyCacheClear(50); // Clear 50% of entries
          break;

        case 'refresh_recommended':
          console.log('🔄 [CACHE_VALIDATION] Executing selective cache refresh...');
          actionResult = performGlobalCleanup(); // Use cleanup as refresh mechanism
          break;

        default:
          console.warn(`🔧 [CACHE_VALIDATION] Unknown automated action: ${recommendation.automated_action}`);
          continue;
      }

      executionResults.actions_successful++;
      executionResults.results.push({
        recommendation_type: recommendation.type,
        action: recommendation.automated_action,
        status: 'success',
        result: actionResult,
        timestamp: new Date().toISOString()
      });

      console.log(`✅ [CACHE_VALIDATION] Successfully executed: ${recommendation.automated_action}`);

    } catch (error) {
      executionResults.actions_failed++;
      executionResults.results.push({
        recommendation_type: recommendation.type,
        action: recommendation.automated_action,
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });

      console.error(`❌ [CACHE_VALIDATION] Failed to execute: ${recommendation.automated_action}`, error);
    }
  }

  console.log(`🔧 [CACHE_VALIDATION] Execution complete: ${executionResults.actions_successful}/${executionResults.actions_attempted} successful`);
  return executionResults;
}

/**
 * Automated cache validation with optional action execution
 * @param {object} options - Validation and execution options
 * @returns {Promise<object>} - Combined validation and execution results
 */
export async function performAutomatedCacheValidation(options = {}) {
  const {
    executeRecommendations = false,
    executionOptions = {}
  } = options;

  try {
    console.log('🚀 [CACHE_VALIDATION] Starting automated cache validation...');

    // Step 1: Validate cache health
    const validationResults = await validateCacheHealth();

    const results = {
      validation: validationResults,
      execution: null,
      overall_success: validationResults.overall_status !== 'error'
    };

    // Step 2: Execute recommendations if requested
    if (executeRecommendations && validationResults.recommendations.length > 0) {
      const executionResults = await executeValidationRecommendations(
        validationResults,
        executionOptions
      );

      results.execution = executionResults;
      results.overall_success = results.overall_success &&
        (executionResults.actions_failed === 0 || executionResults.actions_successful > 0);
    }

    console.log(`🚀 [CACHE_VALIDATION] Automated validation complete: ${results.overall_success ? 'SUCCESS' : 'ISSUES'}`);
    return results;

  } catch (error) {
    console.error('🚀 [CACHE_VALIDATION] Automated validation failed:', error);
    return {
      validation: null,
      execution: null,
      overall_success: false,
      error: error.message
    };
  }
}

// Export validation utilities
export default {
  validateCacheHealth,
  executeValidationRecommendations,
  performAutomatedCacheValidation
};