import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getWaterQualityData } from '../services/api';
import { loadCache, persistCache } from '../utils/cache';
import { featureFlags } from '../config/featureFlags';
import { useToast } from '../components/modern/toastUtils';
import { log } from '../utils/log';
import {
  getMonthsInRange,
  checkCachedMonths,
  generateMonthlyCacheKey,
  filterDataToDateRange,
  storeMonthlyCachedData,
  calculateCacheStats
} from '../utils/monthlyCache';

const CACHE_STORAGE_KEY = 'wq_monthly_cache_v1';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes per month chunk

export function useWaterQualityDataWithMonthlyCache({
  selectedSites,
  timeRange,
  startDate,
  endDate,
  useAdvancedFilters,
  selectedParameters,
  valueRanges,
  dataQualityFilter,
  alertsFilter,
  selectedParameter,
  compareMode,
  compareParameter,
}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [cacheStats, setCacheStats] = useState(null);

  // Monthly cache
  const cacheRef = useRef(featureFlags.wqCacheEnabled ? loadCache(CACHE_STORAGE_KEY, CACHE_TTL_MS) : new Map());
  const lastFetchKeyRef = useRef(null);
  const abortRef = useRef(null);
  const mountedRef = useRef(true);
  const lastFetchTimeRef = useRef(0);
  const toast = useToast();

  useEffect(() => () => {
    mountedRef.current = false;
    try { abortRef.current?.abort(); } catch { /* ignore */ }
  }, []);

  // Build filter signature for cache key
  const filterSignature = useMemo(() => {
    return JSON.stringify({
      useAdvancedFilters: !!useAdvancedFilters,
      selectedParameters: (selectedParameters || []).slice().sort(),
      valueRanges: valueRanges || {},
      dataQualityFilter: dataQualityFilter || 'all',
      alertsFilter: alertsFilter || 'all',
      selectedParameter: selectedParameter || null,
      compareMode: compareMode || 'off',
      compareParameter: compareParameter || null,
    });
  }, [useAdvancedFilters, selectedParameters, valueRanges, dataQualityFilter, alertsFilter, selectedParameter, compareMode, compareParameter]);

  const refetch = useCallback(async () => {
    console.log('[Monthly Cache] refetch called with:', { selectedSites, timeRange, startDate, endDate });

    if (!Array.isArray(selectedSites) || selectedSites.length === 0) {
      console.log('[Monthly Cache] No sites selected, clearing data');
      if (mountedRef.current) {
        setData([]);
        setLoading(false);
        setError(null);
        setCacheStats(null);
      }
      return;
    }

    // Rate limiting
    const now = Date.now();
    if (now - lastFetchTimeRef.current < 250) {
      return;
    }
    lastFetchTimeRef.current = now;

    // Abort previous
    try { abortRef.current?.abort(); } catch { /* ignore */ }
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);

    try {
      const t0 = performance.now();
      setLoading(true);

      // Determine date range
      let effectiveStartDate, effectiveEndDate;
      if (timeRange === 'Custom Range' && startDate && endDate) {
        effectiveStartDate = startDate;
        effectiveEndDate = endDate;
        console.log('[Monthly Cache] Using custom range:', { effectiveStartDate, effectiveEndDate });
      } else {
        // Use current date for dynamic date ranges - database has data up to 2025-07-28
        const now = new Date();
        switch (timeRange) {
          case '7d':
            effectiveStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            effectiveEndDate = now.toISOString().split('T')[0];
            break;
          case '30d':
            effectiveStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            effectiveEndDate = now.toISOString().split('T')[0];
            break;
          case '90d':
            effectiveStartDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            effectiveEndDate = now.toISOString().split('T')[0];
            break;
          case '1y':
            effectiveStartDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            effectiveEndDate = now.toISOString().split('T')[0];
            break;
          default:
            // Use last 30 days as fallback for unknown time ranges
            effectiveStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            effectiveEndDate = now.toISOString().split('T')[0];
        }
      }

      // Get months in range
      const months = getMonthsInRange(effectiveStartDate, effectiveEndDate);

      let aggregatedData = [];
      let totalCacheHits = 0;
      let totalMonths = 0;

      // Process each site
      for (const site of selectedSites) {
        totalMonths += months.length;

        // Check what's already cached
        const cacheResult = checkCachedMonths(months, site, { filterSignature }, cacheRef.current);
        totalCacheHits += cacheResult.cached.length;

        // Add cached data
        if (cacheResult.data.length > 0) {
          const filteredCached = filterDataToDateRange(cacheResult.data, effectiveStartDate, effectiveEndDate);
          aggregatedData = aggregatedData.concat(filteredCached);
        }

        // Fetch missing months
        if (cacheResult.missing.length > 0) {
          for (const missingMonth of cacheResult.missing) {
            // Fetch this specific month
            const monthStart = missingMonth.start.toISOString().split('T')[0];
            const monthEnd = missingMonth.end.toISOString().split('T')[0];

            const params = {
              sites: [site],
              time_range: 'Custom Range',
              start_date: monthStart,
              end_date: monthEnd,
              no_downsample: true
            };

            // Add filters if enabled
            if (useAdvancedFilters) {
              if (Array.isArray(selectedParameters) && selectedParameters.length > 0) {
                params.parameters = selectedParameters.join(',');
              }
              Object.entries(valueRanges || {}).forEach(([param, range]) => {
                if (range?.min != null) params[`${param}_min`] = range.min;
                if (range?.max != null) params[`${param}_max`] = range.max;
              });
              if (dataQualityFilter && dataQualityFilter !== 'all') params.data_quality = dataQualityFilter;
              if (alertsFilter && alertsFilter !== 'all') params.alert_level = alertsFilter;
            }

            try {
              const response = await getWaterQualityData(params, controller.signal);
              const monthData = response.data || [];

              // Store in monthly cache
              if (monthData.length > 0) {
                storeMonthlyCachedData(monthData, site, { filterSignature }, cacheRef.current);

                // Add to aggregated data (filtered to requested range)
                const filteredMonth = filterDataToDateRange(monthData, effectiveStartDate, effectiveEndDate);
                aggregatedData = aggregatedData.concat(filteredMonth);
              }

              log.debug(`[Monthly Cache] Fetched ${monthData.length} rows for ${site} ${missingMonth.key}`);
            } catch (err) {
              if (err.name !== 'AbortError') {
                console.error(`[Monthly Cache] Error fetching ${site} ${missingMonth.key}:`, err);
                console.error(`[Monthly Cache] Request params:`, params);
                console.error(`[Monthly Cache] Full error details:`, err.response?.data || err.message);
                log.error(`[Monthly Cache] Error fetching ${site} ${missingMonth.key}:`, err);
              }
            }
          }
        }
      }

      // Update cache stats
      const stats = {
        totalMonths,
        cachedMonths: totalCacheHits,
        hitRatio: totalMonths > 0 ? totalCacheHits / totalMonths : 0,
        estimatedSpeedup: totalCacheHits > 0 ? `${Math.round(totalCacheHits / totalMonths * 100)}% cached` : 'No cache',
        monthsRange: months.length
      };

      const loadTime = performance.now() - t0;
      log.info(`[Monthly Cache] Loaded ${aggregatedData.length} rows in ${loadTime.toFixed(0)}ms. Cache: ${stats.estimatedSpeedup}`);

      if (mountedRef.current) {
        setData(aggregatedData);
        setMeta({
          date_range: {
            start: effectiveStartDate,
            end: effectiveEndDate
          },
          row_count: aggregatedData.length,
          cache_stats: stats
        });
        setCacheStats(stats);
        setLoading(false);

        // Show appropriate notifications
        if (aggregatedData.length === 0) {
          console.log('[Monthly Cache] No data found - should show empty state');
          toast.info(`No data found for sites ${selectedSites.join(', ')} in the selected time range`, {
            title: 'No Data Available',
            duration: 4000
          });
        } else if (stats.hitRatio > 0.5) {
          toast.success(`⚡ ${stats.estimatedSpeedup} loaded instantly from cache`);
        }
      }

      // Persist cache
      if (featureFlags.wqCacheEnabled) {
        persistCache(CACHE_STORAGE_KEY, cacheRef.current);
      }

    } catch (err) {
      if (err.name !== 'AbortError' && mountedRef.current) {
        setError(err.message || 'Failed to load water quality data');
        setLoading(false);
        setCacheStats(null);
      }
    }
  }, [selectedSites, timeRange, startDate, endDate, filterSignature, useAdvancedFilters, selectedParameters, valueRanges, dataQualityFilter, alertsFilter, toast]);

  // Auto-fetch when dependencies change - use refetch directly to avoid dependency cycles
  useEffect(() => {
    refetch();
  }, [selectedSites, timeRange, startDate, endDate, filterSignature]);

  return {
    data,
    loading,
    error,
    meta,
    cacheStats,
    refetch
  };
}