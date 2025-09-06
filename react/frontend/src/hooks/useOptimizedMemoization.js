/**
 * Advanced Memoization and Caching Hooks for High-Performance React
 * Implements efficient caching strategies with optimized data structures
 */

import { useMemo, useRef, useCallback, useEffect, useState } from 'react';

// High-performance LRU Cache implementation
class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    
    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilizationPercent: (this.cache.size / this.maxSize) * 100
    };
  }
}

// Time-based cache with automatic expiration
class TimedCache {
  constructor(ttl = 300000) { // 5 minutes default
    this.ttl = ttl;
    this.cache = new Map();
    this.timestamps = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    
    const timestamp = this.timestamps.get(key);
    if (Date.now() - timestamp > this.ttl) {
      this.cache.delete(key);
      this.timestamps.delete(key);
      return undefined;
    }
    
    return this.cache.get(key);
  }

  set(key, value) {
    this.cache.set(key, value);
    this.timestamps.set(key, Date.now());
  }

  clear() {
    this.cache.clear();
    this.timestamps.clear();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, timestamp] of this.timestamps) {
      if (now - timestamp > this.ttl) {
        this.cache.delete(key);
        this.timestamps.delete(key);
      }
    }
  }
}

// Global cache instances for cross-component sharing
const globalLRUCache = new LRUCache(200);
const globalTimedCache = new TimedCache(300000); // 5 minutes

/**
 * Advanced memoization hook with LRU cache
 */
export const useAdvancedMemo = (computeFn, deps, cacheSize = 50) => {
  const cacheRef = useRef(new LRUCache(cacheSize));
  const statsRef = useRef({ hits: 0, misses: 0, computations: 0 });

  return useMemo(() => {
    const key = JSON.stringify(deps);
    const cached = cacheRef.current.get(key);
    
    if (cached !== undefined) {
      statsRef.current.hits++;
      return cached;
    }

    // Cache miss - compute new value
    statsRef.current.misses++;
    statsRef.current.computations++;
    
    const result = computeFn();
    cacheRef.current.set(key, result);
    
    return result;
  }, [computeFn, deps]);
};

/**
 * Memoized data processing hook with performance tracking
 */
export const useMemoizedDataProcessing = (data, processors = [], cacheKey) => {
  const processingCache = useRef(new Map());
  const performanceRef = useRef({
    totalProcessingTime: 0,
    processCount: 0,
    averageTime: 0,
    cacheHits: 0,
    cacheMisses: 0
  });

  return useMemo(() => {
    const startTime = performance.now();
    const key = cacheKey || `${JSON.stringify(processors.map(p => p.name))}_${data?.length}_${Date.now()}`;
    
    // Check cache first
    if (processingCache.current.has(key)) {
      performanceRef.current.cacheHits++;
      return processingCache.current.get(key);
    }

    // Process data through pipeline
    let processedData = data;
    for (const processor of processors) {
      if (typeof processor === 'function') {
        processedData = processor(processedData);
      } else if (processor.fn && typeof processor.fn === 'function') {
        processedData = processor.fn(processedData, processor.options);
      }
    }

    // Cache result
    processingCache.current.set(key, processedData);
    
    // Update performance metrics
    const processingTime = performance.now() - startTime;
    const perf = performanceRef.current;
    perf.totalProcessingTime += processingTime;
    perf.processCount++;
    perf.averageTime = perf.totalProcessingTime / perf.processCount;
    perf.cacheMisses++;

    return processedData;
  }, [data, processors, cacheKey]);
};

/**
 * Optimized callback hook with result caching
 */
export const useOptimizedCallback = (callback, deps, cacheResults = false) => {
  const resultCacheRef = useRef(new Map());
  
  const memoizedCallback = useCallback((...args) => {
    if (!cacheResults) {
      return callback(...args);
    }

    const key = JSON.stringify(args);
    if (resultCacheRef.current.has(key)) {
      return resultCacheRef.current.get(key);
    }

    const result = callback(...args);
    resultCacheRef.current.set(key, result);
    
    // Limit cache size
    if (resultCacheRef.current.size > 20) {
      const firstKey = resultCacheRef.current.keys().next().value;
      resultCacheRef.current.delete(firstKey);
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callback, cacheResults, deps]);

  return memoizedCallback;
};

/**
 * Expensive computation hook with intelligent caching
 */
export const useExpensiveComputation = (computeFn, deps, options = {}) => {
  const {
    cacheGlobally = false,
    ttl: _ttl = 300000, // 5 minutes - reserved for future implementation
    maxCacheSize = 50,
    trackPerformance = true
  } = options;

  const localCache = useRef(cacheGlobally ? null : new LRUCache(maxCacheSize));
  const performanceRef = useRef({
    computations: 0,
    totalTime: 0,
    averageTime: 0,
    cacheHits: 0,
    lastComputationTime: 0
  });

  return useMemo(() => {
    const startTime = performance.now();
    const key = JSON.stringify(deps);
    
    // Choose cache based on configuration
    const cache = cacheGlobally ? globalLRUCache : localCache.current;
    
    // Check cache
    if (cache && cache.get) {
      const cached = cache.get(key);
      if (cached !== undefined) {
        if (trackPerformance) {
          performanceRef.current.cacheHits++;
        }
        return cached;
      }
    }

    // Compute new result
    const result = computeFn();
    
    // Cache result
    if (cache && cache.set) {
      cache.set(key, result);
    }

    // Track performance
    if (trackPerformance) {
      const computationTime = performance.now() - startTime;
      const perf = performanceRef.current;
      perf.computations++;
      perf.totalTime += computationTime;
      perf.averageTime = perf.totalTime / perf.computations;
      perf.lastComputationTime = computationTime;
    }

    return result;
  }, [computeFn, cacheGlobally, trackPerformance, deps]);
};

/**
 * Chart data optimization hook
 */
export const useOptimizedChartData = (rawData, chartConfig, samplingOptions = {}) => {
  const {
    maxDataPoints = 1000,
    samplingStrategy = 'uniform',
    preserveExtremes = true,
    cacheKey = null
  } = samplingOptions;

  return useAdvancedMemo(() => {
    if (!rawData || rawData.length === 0) return [];

    // If data is within limits, return as-is
    if (rawData.length <= maxDataPoints) {
      return rawData;
    }

    let sampledData;
    
    switch (samplingStrategy) {
      case 'uniform':
        sampledData = uniformSampling(rawData, maxDataPoints);
        break;
      case 'statistical':
        sampledData = statisticalSampling(rawData, maxDataPoints);
        break;
      case 'time-aware':
        sampledData = timeAwareSampling(rawData, maxDataPoints);
        break;
      default:
        sampledData = uniformSampling(rawData, maxDataPoints);
    }

    // Preserve extreme values if requested
    if (preserveExtremes && chartConfig.yField) {
      sampledData = preserveExtremeValues(rawData, sampledData, chartConfig.yField);
    }

    return sampledData;
  }, [rawData, chartConfig, maxDataPoints, samplingStrategy, preserveExtremes, cacheKey]);
};

/**
 * Filter optimization hook with indexed lookups
 */
export const useOptimizedFilter = (data, filterConfig, dependencies = []) => {
  const indexCache = useRef(new Map());
  
  return useAdvancedMemo(() => {
    if (!data || !filterConfig) return data;

    let filteredData = data;

    // Apply each filter efficiently
    Object.entries(filterConfig).forEach(([field, filterValue]) => {
      if (filterValue === null || filterValue === undefined) return;

      // Create index for this field if not exists
      const indexKey = `${field}_index`;
      if (!indexCache.current.has(indexKey)) {
        const index = new Map();
        data.forEach((item, idx) => {
          const value = item[field];
          if (!index.has(value)) index.set(value, []);
          index.get(value).push(idx);
        });
        indexCache.current.set(indexKey, index);
      }

      const fieldIndex = indexCache.current.get(indexKey);
      
      // Apply filter using index
      if (Array.isArray(filterValue)) {
        // Multiple values filter
        const matchingIndices = new Set();
        filterValue.forEach(val => {
          if (fieldIndex.has(val)) {
            fieldIndex.get(val).forEach(idx => matchingIndices.add(idx));
          }
        });
        filteredData = filteredData.filter((_, idx) => matchingIndices.has(idx));
      } else {
        // Single value filter
        if (fieldIndex.has(filterValue)) {
          const matchingIndices = new Set(fieldIndex.get(filterValue));
          filteredData = filteredData.filter((_, idx) => matchingIndices.has(idx));
        } else {
          filteredData = [];
        }
      }
    });

    return filteredData;
  }, [data, filterConfig, ...dependencies]);
};

/**
 * Performance monitoring hook for memoization
 */
export const useMemoizationPerformance = () => {
  const [performanceData, setPerformanceData] = useState({
    globalCacheStats: globalLRUCache.getStats(),
    memoryUsage: 0,
    renderCount: 0,
    averageRenderTime: 0
  });

  const updatePerformance = useCallback(() => {
    setPerformanceData(prev => ({
      globalCacheStats: globalLRUCache.getStats(),
      memoryUsage: performance.memory ? performance.memory.usedJSHeapSize / 1024 / 1024 : 0,
      renderCount: prev.renderCount + 1,
      averageRenderTime: performance.now() // This would need proper tracking
    }));
  }, []);

  useEffect(() => {
    const interval = setInterval(updatePerformance, 5000);
    return () => clearInterval(interval);
  }, [updatePerformance]);

  return performanceData;
};

// Utility functions for data sampling
const uniformSampling = (data, targetSize) => {
  if (data.length <= targetSize) return data;
  
  const step = data.length / targetSize;
  const sampled = [];
  
  for (let i = 0; i < targetSize; i++) {
    const index = Math.floor(i * step);
    sampled.push(data[index]);
  }
  
  return sampled;
};

const statisticalSampling = (data, targetSize) => {
  // Implement statistical sampling based on variance
  if (data.length <= targetSize) return data;
  
  // Calculate variance for each potential sample
  const chunkSize = Math.floor(data.length / targetSize);
  const sampled = [];
  
  for (let i = 0; i < targetSize; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, data.length);
    const chunk = data.slice(start, end);
    
    // Select representative point from chunk (e.g., median)
    const sortedChunk = [...chunk].sort((a, b) => {
      const aVal = typeof a === 'object' ? Object.values(a)[0] : a;
      const bVal = typeof b === 'object' ? Object.values(b)[0] : b;
      return aVal - bVal;
    });
    
    const medianIndex = Math.floor(sortedChunk.length / 2);
    sampled.push(sortedChunk[medianIndex]);
  }
  
  return sampled;
};

const timeAwareSampling = (data, targetSize) => {
  // Implement time-aware sampling that preserves temporal patterns
  if (data.length <= targetSize) return data;
  
  // Assume data has timestamp field
  const timestampField = 'measurement_timestamp' in data[0] ? 'measurement_timestamp' : 
                        'timestamp' in data[0] ? 'timestamp' : null;
  
  if (!timestampField) {
    return uniformSampling(data, targetSize);
  }
  
  // Sort by timestamp and sample uniformly
  const sortedData = [...data].sort((a, b) => 
    new Date(a[timestampField]) - new Date(b[timestampField])
  );
  
  return uniformSampling(sortedData, targetSize);
};

const preserveExtremeValues = (originalData, sampledData, yField) => {
  // Find min and max values in original data
  let minItem = originalData[0];
  let maxItem = originalData[0];
  
  originalData.forEach(item => {
    if (item[yField] < minItem[yField]) minItem = item;
    if (item[yField] > maxItem[yField]) maxItem = item;
  });
  
  // Ensure min and max are in sampled data
  const result = [...sampledData];
  
  if (!result.some(item => item[yField] === minItem[yField])) {
    result.push(minItem);
  }
  
  if (!result.some(item => item[yField] === maxItem[yField])) {
    result.push(maxItem);
  }
  
  return result;
};

// Export cache management functions
export const clearGlobalCache = () => {
  globalLRUCache.clear();
  globalTimedCache.clear();
};

export const getGlobalCacheStats = () => ({
  lru: globalLRUCache.getStats(),
  timed: {
    size: globalTimedCache.cache.size,
    ttl: globalTimedCache.ttl
  }
});