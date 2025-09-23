import { useState, useEffect, useRef } from 'react';
import { getRedoxDateRange } from '../services/api';
import {
  registerCache,
  createCacheEntry,
  isExpired,
  DEFAULT_TTL
} from '../utils/cacheManager';

// Simple cache for date ranges by sites combination
const dateRangeCache = new Map();

// Register cache with TTL management
registerCache('dateRangeCache', dateRangeCache, DEFAULT_TTL.MEDIUM, 20);

// Generate cache key from sites array
const getCacheKey = (sites) => {
  if (!Array.isArray(sites) || sites.length === 0) return null;
  return sites.slice().sort().join(',');
};

// Custom hook for cached date range fetching
export const useCachedDateRange = (selectedSites) => {
  const [dateRange, setDateRange] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    const fetchDateRange = async () => {
      if (!selectedSites || selectedSites.length === 0) {
        setDateRange(null);
        setLoading(false);
        return;
      }

      const cacheKey = getCacheKey(selectedSites);
      if (!cacheKey) {
        setDateRange(null);
        setLoading(false);
        return;
      }

      // Check cache first with TTL validation
      if (dateRangeCache.has(cacheKey)) {
        const cached = dateRangeCache.get(cacheKey);
        if (!isExpired(cached, DEFAULT_TTL.MEDIUM)) {
          if (mounted) {
            setDateRange(cached.data);
            setLoading(false);
            setError(null);
          }
          return;
        } else {
          // Remove expired entry
          dateRangeCache.delete(cacheKey);
        }
      }

      // Cancel previous request if still running
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        setLoading(true);
        setError(null);

        const response = await getRedoxDateRange(selectedSites, controller.signal);
        
        if (!mounted || controller.signal.aborted) return;

        const result = {
          earliest_date: response?.earliest_date,
          latest_date: response?.latest_date
        };

        // Cache the result with TTL management
        const cacheEntry = createCacheEntry(result);
        dateRangeCache.set(cacheKey, cacheEntry);

        setDateRange(result);
        setLoading(false);
      } catch (err) {
        if (!mounted || controller.signal.aborted) return;
        
        setError(err);
        setLoading(false);
        console.warn('[DATE_RANGE_CACHE] Failed to fetch date range:', err);
      }
    };

    fetchDateRange();

    return () => {
      mounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [selectedSites]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { dateRange, loading, error };
};

// Utility function to clear cache if needed
export const clearDateRangeCache = () => {
  dateRangeCache.clear();
};

// Utility function to get cache size for debugging
export const getDateRangeCacheSize = () => {
  return dateRangeCache.size;
};