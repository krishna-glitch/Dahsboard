import { useCallback, useEffect, useRef } from 'react';
import { getWaterQualityData, getRedoxAnalysisData, getSiteComparisonData } from '../services/api';
import { log } from '../utils/log';

/**
 * Predictive Loading Hook
 * Intelligently prefetches data based on user behavior patterns
 */

const PREDICTIVE_PATTERNS = {
  // When user views 7d data, they often look at 30d next
  '7d_to_30d': {
    trigger: { timeRange: '7d' },
    prefetch: { timeRange: '30d' },
    probability: 0.65,
    delay: 2000 // Wait 2s after initial load
  },
  
  // When user views water quality, they often check redox analysis
  'wq_to_redox': {
    trigger: { service: 'water_quality', timeRange: ['7d', '30d'] },
    prefetch: { service: 'redox', timeRange: '30d' },
    probability: 0.45,
    delay: 3000
  },
  
  // When comparing sites, users often drill down to individual sites
  'comparison_to_detail': {
    trigger: { service: 'site_comparison' },
    prefetch: { service: 'water_quality', sites: 'individual' },
    probability: 0.55,
    delay: 1500
  },
  
  // Dashboard users often export data after viewing
  'view_to_export': {
    trigger: { service: 'water_quality', sites: ['S1', 'S2', 'S3'] },
    prefetch: { format: 'export_ready', timeRange: '30d' },
    probability: 0.35,
    delay: 5000
  },
  
  // Recent data viewers often want historical context
  '1d_to_7d': {
    trigger: { timeRange: '1d' },
    prefetch: { timeRange: '7d' },
    probability: 0.55,
    delay: 1000
  }
};

const PREFETCH_QUEUE_SIZE = 3;
const PREFETCH_TIMEOUT = 30000; // 30s timeout for prefetch requests

export function usePredictiveLoader() {
  const prefetchQueueRef = useRef([]);
  const activeRequestsRef = useRef(new Set());
  const behaviorHistoryRef = useRef([]);
  const prefetchStatsRef = useRef({
    triggered: 0,
    completed: 0,
    used: 0,
    failed: 0
  });

  // Pure functions that don't depend on other callbacks
  const shouldTriggerPattern = useCallback((behavior, pattern) => {
    const { trigger } = pattern;
    
    // Check service match
    if (trigger.service && trigger.service !== behavior.service) {
      return false;
    }
    
    // Check time range match
    if (trigger.timeRange) {
      if (Array.isArray(trigger.timeRange)) {
        if (!trigger.timeRange.includes(behavior.timeRange)) {
          return false;
        }
      } else if (trigger.timeRange !== behavior.timeRange) {
        return false;
      }
    }
    
    // Check sites match
    if (trigger.sites && behavior.sites) {
      const behaviorSites = Array.isArray(behavior.sites) ? behavior.sites : [behavior.sites];
      const triggerSites = Array.isArray(trigger.sites) ? trigger.sites : [trigger.sites];
      
      const hasOverlap = triggerSites.some(site => behaviorSites.includes(site));
      if (!hasOverlap) {
        return false;
      }
    }
    
    return true;
  }, []);

  const generatePrefetchSites = useCallback((currentSites, prefetchSites) => {
    if (!prefetchSites) return currentSites;
    
    if (prefetchSites === 'individual' && Array.isArray(currentSites)) {
      // For site comparison -> individual site drill-down
      return currentSites.slice(0, 2); // Prefetch first 2 sites individually
    }
    
    if (Array.isArray(prefetchSites)) {
      return prefetchSites;
    }
    
    return currentSites;
  }, []);

  const generateRequestKey = useCallback((action) => {
    const sites = Array.isArray(action.sites) ? action.sites.join(',') : action.sites;
    return `${action.service}:${sites}:${action.timeRange}`;
  }, []);

  const generatePrefetchAction = useCallback((currentBehavior, pattern) => {
    const { prefetch } = pattern;
    
    const action = {
      service: prefetch.service || currentBehavior.service,
      sites: generatePrefetchSites(currentBehavior.sites, prefetch.sites),
      timeRange: prefetch.timeRange || currentBehavior.timeRange,
      probability: pattern.probability,
      triggerPattern: pattern,
      source: 'predictive'
    };
    
    // Handle special cases
    if (prefetch.format === 'export_ready') {
      action.exportReady = true;
    }
    
    return action;
  }, [generatePrefetchSites]);

  const executePrefetch = useCallback(async (prefetchItem) => {
    const { action, patternName, requestKey } = prefetchItem;
    
    try {
      activeRequestsRef.current.add(requestKey);
      
      log.debug(`[PREDICTIVE] Executing prefetch for ${patternName}:`, action);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PREFETCH_TIMEOUT);
      
      let result = null;
      
      // Execute appropriate service call
      if (action.service === 'water_quality') {
        const params = {
          sites: Array.isArray(action.sites) ? action.sites : [action.sites],
          time_range: action.timeRange,
          no_cache: false // Allow caching for prefetch
        };
        
        result = await getWaterQualityData(params, controller.signal);
      } else if (action.service === 'redox') {
        const params = {
          sites: action.sites,
          time_range: action.timeRange
        };
        
        result = await getRedoxAnalysisData(params, controller.signal);
      } else if (action.service === 'site_comparison') {
        const params = {
          sites: action.sites,
          time_range: action.timeRange
        };
        
        result = await getSiteComparisonData(params);
      }
      
      clearTimeout(timeoutId);
      
      if (result) {
        log.debug(`[PREDICTIVE] Prefetch completed for ${patternName}`);
        prefetchStatsRef.current.completed++;
      }
      
    } catch (error) {
      if (error.name !== 'AbortError') {
        log.warn(`[PREDICTIVE] Prefetch failed for ${patternName}:`, error);
        prefetchStatsRef.current.failed++;
      }
    } finally {
      activeRequestsRef.current.delete(requestKey);
      
      // Remove from queue
      prefetchQueueRef.current = prefetchQueueRef.current.filter(
        item => item.requestKey !== requestKey
      );
    }
  }, []);

  const enqueuePrefetch = useCallback(async (action, patternName) => {
    // Check if similar request is already queued or active
    const requestKey = generateRequestKey(action);
    if (activeRequestsRef.current.has(requestKey)) {
      log.debug('[PREDICTIVE] Skipping duplicate prefetch:', requestKey);
      return;
    }
    
    // Limit queue size
    if (prefetchQueueRef.current.length >= PREFETCH_QUEUE_SIZE) {
      const removed = prefetchQueueRef.current.shift();
      log.debug('[PREDICTIVE] Queue full, removed:', removed?.requestKey);
    }
    
    const prefetchItem = {
      action,
      patternName,
      requestKey,
      queuedAt: Date.now()
    };
    
    prefetchQueueRef.current.push(prefetchItem);
    
    // Execute prefetch
    executePrefetch(prefetchItem);
  }, [executePrefetch, generateRequestKey]);

  const triggerPredictiveLoading = useCallback(async (currentBehavior) => {
    for (const [patternName, pattern] of Object.entries(PREDICTIVE_PATTERNS)) {
      if (shouldTriggerPattern(currentBehavior, pattern)) {
        const prefetchAction = generatePrefetchAction(currentBehavior, pattern);
        
        if (prefetchAction) {
          log.debug(`[PREDICTIVE] Pattern ${patternName} triggered`, prefetchAction);
          
          setTimeout(() => {
            enqueuePrefetch(prefetchAction, patternName);
          }, pattern.delay);
          
          prefetchStatsRef.current.triggered++;
        }
      }
    }
  }, [shouldTriggerPattern, generatePrefetchAction, enqueuePrefetch]);

  const addBehavior = useCallback((action) => {
    const behavior = {
      ...action,
      timestamp: Date.now()
    };
    
    behaviorHistoryRef.current.unshift(behavior);
    
    // Keep only recent history (last 10 actions)
    if (behaviorHistoryRef.current.length > 10) {
      behaviorHistoryRef.current = behaviorHistoryRef.current.slice(0, 10);
    }
    
    log.debug('[PREDICTIVE] Behavior logged:', behavior);
    
    // Trigger predictive loading
    triggerPredictiveLoading(behavior);
  }, [triggerPredictiveLoading]);

  // Track cache usage to measure predictive loading effectiveness
  const recordCacheHit = useCallback((requestKey) => {
    log.debug('[PREDICTIVE] Cache hit recorded for:', requestKey);
    prefetchStatsRef.current.used++;
  }, []);

  const getStats = useCallback(() => {
    const stats = prefetchStatsRef.current;
    return {
      ...stats,
      hitRate: stats.triggered > 0 ? (stats.used / stats.triggered * 100).toFixed(1) + '%' : '0%',
      completionRate: stats.triggered > 0 ? (stats.completed / stats.triggered * 100).toFixed(1) + '%' : '0%',
      queueSize: prefetchQueueRef.current.length,
      activeRequests: activeRequestsRef.current.size
    };
  }, []);

  const clearHistory = useCallback(() => {
    behaviorHistoryRef.current = [];
    prefetchQueueRef.current = [];
    activeRequestsRef.current.clear();
    prefetchStatsRef.current = {
      triggered: 0,
      completed: 0,
      used: 0,
      failed: 0
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    const currentActiveRequests = activeRequestsRef.current; // Capture current value
    return () => {
      // Abort any active requests
      for (const requestKey of currentActiveRequests) {
        log.debug('[PREDICTIVE] Cleaning up active request:', requestKey);
      }
    };
  }, []);

  return {
    addBehavior,
    recordCacheHit,
    getStats,
    clearHistory
  };
}

export default usePredictiveLoader;