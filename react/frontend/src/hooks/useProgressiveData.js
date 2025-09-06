import { useState, useEffect, useCallback, useRef } from 'react';
import { getWaterQualityData } from '../services/api';

/**
 * Progressive Data Loading Hook for Large Datasets
 * - Loads data in chunks to prevent browser freezing
 * - Implements smart caching and background preloading
 * - Handles 140K+ data points with smooth user experience
 */
export const useProgressiveData = (initialParams = {}) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [metadata, setMetadata] = useState({});
  const [isStreamComplete, setIsStreamComplete] = useState(false);
  
  // Cache for storing loaded data chunks
  const cacheRef = useRef(new Map());
  const abortControllerRef = useRef(null);
  
  // Progressive loading configuration
  const config = {
    chunkSize: 1000,           // Load 1000 points at a time
    maxConcurrentChunks: 3,    // Load max 3 chunks simultaneously
    preloadBuffer: 2,          // Preload 2 chunks ahead
    cacheLimit: 10,            // Keep max 10 chunks in memory
    ...initialParams
  };

  /**
   * Generate cache key for data chunk
   */
  const getCacheKey = useCallback((params, chunkIndex) => {
    const key = `${JSON.stringify(params)}_chunk_${chunkIndex}`;
    return key;
  }, []);

  /**
   * Load single data chunk with caching
   */
  const loadChunk = useCallback(async (params, chunkIndex) => {
    const cacheKey = getCacheKey(params, chunkIndex);
    
    // Check cache first
    if (cacheRef.current.has(cacheKey)) {
      return cacheRef.current.get(cacheKey);
    }

    // Calculate offset for this chunk
    const offset = chunkIndex * config.chunkSize;
    const chunkParams = {
      ...params,
      limit: config.chunkSize,
      offset: offset,
      performance_tier: 'balanced' // Use balanced tier for progressive loading
    };

    try {
      const response = await getWaterQualityData(chunkParams);
      
      const chunkData = {
        data: response.water_quality_data || [],
        metadata: response.metadata || {},
        chunkIndex: chunkIndex,
        timestamp: Date.now()
      };

      // Store in cache with size limit
      if (cacheRef.current.size >= config.cacheLimit) {
        // Remove oldest cache entry
        const oldestKey = cacheRef.current.keys().next().value;
        cacheRef.current.delete(oldestKey);
      }
      cacheRef.current.set(cacheKey, chunkData);

      return chunkData;
    } catch (error) {
      console.error(`Error loading chunk ${chunkIndex}:`, error);
      throw error;
    }
  }, [getCacheKey, config.chunkSize, config.cacheLimit]);

  /**
   * Progressive data loading with smart chunking
   */
  const loadProgressiveData = useCallback(async (params) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    setLoading(true);
    setError(null);
    setProgress(0);
    setData([]);
    setIsStreamComplete(false);

    try {
      // First, get metadata to determine total chunks needed
      const initialResponse = await getWaterQualityData({
        ...params,
        limit: 1,
        metadata_only: true
      });

      const totalRecords = initialResponse.metadata?.total_records || initialResponse.metadata?.record_count || 0;
      const totalChunks = Math.ceil(totalRecords / config.chunkSize);
      
      
      if (totalChunks === 0) {
        setIsStreamComplete(true);
        setLoading(false);
        return;
      }

      setMetadata({
        ...initialResponse.metadata,
        totalChunks,
        totalRecords,
        estimatedLoadTime: totalChunks * 0.5 // Rough estimate: 0.5s per chunk
      });

      // Load chunks progressively
      const allData = [];
      const loadPromises = [];

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        // Control concurrency
        if (loadPromises.length >= config.maxConcurrentChunks) {
          await Promise.race(loadPromises);
        }

        const chunkPromise = loadChunk(params, chunkIndex)
          .then(chunkResult => {
            if (!abortControllerRef.current?.signal.aborted) {
              // Add chunk data to results
              allData.push(...chunkResult.data);
              
              // Update progress
              const newProgress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
              setProgress(newProgress);
              
              // Update data state with accumulated results
              setData(prevData => [...prevData, ...chunkResult.data]);
            }
            return chunkResult;
          })
          .catch(error => {
            if (!abortControllerRef.current?.signal.aborted) {
              console.error(`Chunk ${chunkIndex} failed:`, error);
            }
          })
          .finally(() => {
            // Remove completed promise from tracking
            const index = loadPromises.indexOf(chunkPromise);
            if (index > -1) {
              loadPromises.splice(index, 1);
            }
          });

        loadPromises.push(chunkPromise);

        // Small delay to prevent browser freezing
        if (chunkIndex % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Wait for all chunks to complete
      await Promise.allSettled(loadPromises);
      
      if (!abortControllerRef.current?.signal.aborted) {
        setIsStreamComplete(true);
        setProgress(100);
      }

    } catch (error) {
      if (!abortControllerRef.current?.signal.aborted) {
        setError(error.message);
        console.error('Progressive loading error:', error);
      }
    } finally {
      setLoading(false);
    }
  }, [loadChunk, config.chunkSize, config.maxConcurrentChunks]);

  /**
   * Background preloading for smooth scrolling/panning
   */
  const preloadAdjacentData = useCallback(async (currentParams, direction = 'forward') => {
    // Implementation for preloading data chunks that user might need next
    // This runs in the background without blocking the UI
    
    const preloadParams = {
      ...currentParams,
      // Adjust time range based on direction
      ...(direction === 'forward' && {
        start_date: currentParams.end_date,
        end_date: new Date(new Date(currentParams.end_date).getTime() + (7 * 24 * 60 * 60 * 1000)) // +7 days
      }),
      ...(direction === 'backward' && {
        end_date: currentParams.start_date,
        start_date: new Date(new Date(currentParams.start_date).getTime() - (7 * 24 * 60 * 60 * 1000)) // -7 days
      })
    };

    try {
      // Load first chunk of adjacent data silently
      await loadChunk(preloadParams, 0);
    } catch (error) {
      // Silent failure for background preloading
      console.debug('Background preload failed:', error);
    }
  }, [loadChunk]);

  /**
   * Clear cache and reset state
   */
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
    setData([]);
    setMetadata({});
    setProgress(0);
    setIsStreamComplete(false);
  }, []);

  /**
   * Get cache statistics
   */
  const getCacheStats = useCallback(() => {
    const cacheSize = cacheRef.current.size;
    const memoryUsage = cacheSize * config.chunkSize * 0.1; // Rough estimate in KB
    
    return {
      cachedChunks: cacheSize,
      estimatedMemoryUsage: `${memoryUsage.toFixed(1)}KB`,
      cacheHitRatio: cacheSize > 0 ? 0.8 : 0 // Placeholder - would need actual tracking
    };
  }, [config.chunkSize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    // Data state
    data,
    loading,
    progress,
    error,
    metadata,
    isStreamComplete,
    
    // Actions
    loadProgressiveData,
    preloadAdjacentData,
    clearCache,
    getCacheStats,
    
    // Status
    isLoading: loading,
    hasError: !!error,
    isEmpty: data.length === 0 && isStreamComplete,
    dataCount: data.length
  };
};