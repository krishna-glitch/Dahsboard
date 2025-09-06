import { useState, useEffect, useRef } from 'react';
import { getRedoxDateRange } from '../services/api';

// Simple cache for date ranges by sites combination
const dateRangeCache = new Map();

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

      // Check cache first
      if (dateRangeCache.has(cacheKey)) {
        const cached = dateRangeCache.get(cacheKey);
        if (mounted) {
          setDateRange(cached);
          setLoading(false);
          setError(null);
        }
        return;
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
          latest_date: response?.latest_date,
          timestamp: Date.now() // For cache invalidation if needed
        };

        // Cache the result
        dateRangeCache.set(cacheKey, result);

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