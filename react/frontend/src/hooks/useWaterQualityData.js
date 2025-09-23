import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getWaterQualityData } from '../services/api';
import { loadCache, persistCache } from '../utils/cache';
import { featureFlags } from '../config/featureFlags';
import { useToast } from '../components/modern/toastUtils';
import { log } from '../utils/log';
import usePersistentCache from './usePersistentCache';

const CACHE_STORAGE_KEY = 'wq_cache_v2'; // Incremented to invalidate old cache
const CACHE_TTL_MS = 10 * 60 * 1000;
const PERSISTENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours for persistent cache
const CACHE_MAX_CHARS = 3000000;

export function useWaterQualityData({
  selectedSites,
  timeRange,
  startDate,
  endDate,
  useAdvancedFilters,
  selectedParameters,
  valueRanges,
  dataQualityFilter,
  alertsFilter,
  selectedParameter, // primary
  compareMode,
  compareParameter,
}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);  // Start with loading true to prevent "no data" flash
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  
  // Multi-layer caching: in-memory + persistent
  const cacheRef = useRef(featureFlags.wqCacheEnabled ? loadCache(CACHE_STORAGE_KEY, CACHE_TTL_MS) : new Map());
  const persistentCache = usePersistentCache(CACHE_STORAGE_KEY, PERSISTENT_CACHE_TTL_MS);
  
  const lastFetchKeyRef = useRef(null);
  const abortRef = useRef(null);
  const mountedRef = useRef(true);
  const lastFetchTimeRef = useRef(0);
  const toast = useToast();

  useEffect(() => () => { mountedRef.current = false; try { abortRef.current?.abort(); } catch { /* ignore */ } }, []);

  const buildParams = () => {
    const params = {
      sites: selectedSites,
      time_range: timeRange,
      no_downsample: true,
      ...(timeRange === 'Custom Range' && startDate && endDate ? { start_date: startDate, end_date: endDate } : {})
    };
    if (useAdvancedFilters) {
      if (Array.isArray(selectedParameters) && selectedParameters.length > 0) params.parameters = selectedParameters.join(',');
      Object.entries(valueRanges || {}).forEach(([param, range]) => {
        if (range?.min != null) params[`${param}_min`] = range.min;
        if (range?.max != null) params[`${param}_max`] = range.max;
      });
      if (dataQualityFilter && dataQualityFilter !== 'all') params.data_quality = dataQualityFilter;
      if (alertsFilter && alertsFilter !== 'all') params.alert_level = alertsFilter;
    }
    return params;
  };

  const shapeSig = useMemo(() => {
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

  // Fix: Define dataMode or default to a sensible value
  const useChunks = false; // Set to false to avoid chunked loading issues

  const refetch = useCallback(async () => {
    log.debug('[WQ Hook] refetch called with:', {
      selectedSites,
      timeRange,
      startDate,
      endDate,
      useAdvancedFilters
    });

    if (!Array.isArray(selectedSites) || selectedSites.length === 0) {
      log.debug('[WQ Hook] No sites selected, clearing data');
      if (mountedRef.current) { setData([]); setLoading(false); setError(null); }
      return;
    }

    // Prevent rapid repeated calls (debouncing)
    const now = Date.now();
    if (now - lastFetchTimeRef.current < 250) {
      log.debug('[WQ Hook] Skipping fetch due to rate limiting');
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
      const rangeKey = (timeRange === 'Custom Range' && startDate && endDate)
        ? `custom|${startDate}|${endDate}`
        : `range|${timeRange}`;
      const cacheRangeKey = `${rangeKey}|${shapeSig}`;
      const fetchKey = [selectedSites.join(','), cacheRangeKey].join('|');

      log.debug('[WQ Hook] Fetch key:', fetchKey);
      log.debug('[WQ Hook] Time range details:', { timeRange, startDate, endDate, rangeKey });

      // Multi-layer cache read: in-memory first, then persistent
      let cachedAggregate = [];
      let cacheHit = false;
      const missing = [];

      // Add cache bypass for debugging - check if URL has ?nocache=1
      const bypassCache = typeof window !== 'undefined' &&
                         window.location?.search?.includes('nocache=1');

      // Set loading true at start of fetch attempt
      if (mountedRef.current) setLoading(true);

      if (featureFlags.wqCacheEnabled && !bypassCache) {
        for (const s of selectedSites) {
          const k = `${s}|${cacheRangeKey}`;
          let found = false;
          log.debug(`[WQ Cache] Looking for cache key: ${k}`);

          // Layer 1: In-memory cache (fastest)
          if (cacheRef.current) {
            const c = cacheRef.current.get(k);
            if (c && Array.isArray(c.data) && (Date.now() - (c.ts || 0) < CACHE_TTL_MS)) {
              // Filter cached data to ensure it's only for this specific site
              const siteFilteredData = c.data.filter(row => row?.site_code === s);
              cachedAggregate = cachedAggregate.concat(siteFilteredData);
              found = true;
              log.debug(`[WQ Cache] In-memory hit for ${s} with key ${k} (${siteFilteredData.length} rows)`);
            } else {
              log.debug(`[WQ Cache] In-memory miss for ${s} with key ${k}`);
            }
          }

          // Layer 2: Persistent cache (slower but cross-session)
          if (!found && persistentCache.isReady) {
            try {
              const persistentData = await persistentCache.get(k);
              if (persistentData && Array.isArray(persistentData.data)) {
                // Filter cached data to ensure it's only for this specific site
                const siteFilteredData = persistentData.data.filter(row => row?.site_code === s);
                cachedAggregate = cachedAggregate.concat(siteFilteredData);
                found = true;
                log.debug(`[WQ Cache] Persistent hit for ${s} (${siteFilteredData.length} rows)`);

                // Promote to in-memory cache
                if (cacheRef.current) {
                  cacheRef.current.set(k, {
                    data: siteFilteredData, // Store filtered data
                    ts: Date.now(),
                    meta: persistentData.meta
                  });
                }
              }
            } catch (error) {
              log.warn(`[WQ Cache] Persistent cache error for ${s}:`, error);
            }
          }

          if (!found) {
            missing.push(s);
          }
        }
        cacheHit = cachedAggregate.length > 0 && missing.length === 0;
      }

      // Only set data if we have a complete cache hit or if we're starting fresh
      if (cacheHit && cachedAggregate.length > 0 && mountedRef.current) {
        setData(cachedAggregate);
        log.debug(`[WQ Cache] Complete cache hit: ${cachedAggregate.length} total rows for sites: ${selectedSites.join(',')}`);

        // For complete cache hit, set metadata and return early - no API call needed
        if (mountedRef.current) {
          setLoading(false);
          setError(null);
          setMeta({
            cache: {
              enabled: featureFlags.wqCacheEnabled,
              hit: true,
              ttlMs: CACHE_TTL_MS,
            }
          });
          lastFetchKeyRef.current = fetchKey;
        }

        // Show cache hit notification
        toast.showSuccess(
          `Loaded ${cachedAggregate.length.toLocaleString()} cached records for sites ${selectedSites.join(', ')}`,
          {
            title: '⚡ Cache Hit',
            duration: 3000,
            dedupeKey: `wq-cache-hit|${selectedSites.join(',')}|${timeRange}`
          }
        );

        log.info('[WQ Hook] Using cached data:', {
          recordCount: cachedAggregate.length,
          sites: selectedSites,
          timeRange: timeRange,
          cacheKey: `${selectedSites[0]}|${cacheRangeKey}`,
          source: 'cache'
        });
        return; // Exit early - no need to fetch from API
      } else if (missing.length > 0) {
        // We have missing sites, need to fetch from API
        log.debug(`[WQ Cache] Cache miss for sites: ${missing.join(',')}`);
      }

      // Only reach here if we have a cache miss - need to fetch from API
      // Single request supports multiple sites; use params builder
      const params = buildParams();
      let rows = [];
      let dateRange = null;

      if (useChunks) {
        const CHUNK_SIZE = 200000;
        params.no_downsample = true;
        log.debug('[WQ Hook] API params (raw):', params);

        const loadingToastId = toast.showLoading('Loading water quality records…', {
          title: 'Loading Water Quality',
          dedupeKey: 'wq-chunk-loading'
        });

        let offset = 0;
        while (true) {
          const res = await getWaterQualityData({ ...params, chunk_size: CHUNK_SIZE, offset }, controller.signal);
          const chunk = res?.water_quality_data || res?.data || [];
          rows = rows.concat(chunk);

          try {
            toast.updateToast(loadingToastId, {
              type: 'loading',
              title: 'Loading Water Quality',
              message: `Loaded ${rows.length.toLocaleString()} records…`,
              duration: 10000
            });
          } catch { /* ignore */ }

          if (!dateRange && res?.metadata?.date_range && (res?.metadata?.date_range.start || res?.metadata?.date_range.end)) {
            dateRange = {
              start: res.metadata.date_range.start,
              end: res.metadata.date_range.end,
            };
          }

          const info = res?.metadata?.chunk_info || {};
          if (!info.has_more || chunk.length === 0) break;
          offset = (info.offset || 0) + (info.chunk_size || CHUNK_SIZE);
          if (offset >= 400000) break;
        }
      } else {
        log.debug('[WQ Hook] API params (summary):', params);
        const res = await getWaterQualityData(params, controller.signal);
        rows = res?.water_quality_data || res?.data || [];
        if (res?.metadata?.date_range) {
          dateRange = res.metadata.date_range;
        }
      }

      const metadata = dateRange ? { date_range: dateRange } : null;

      // Populate multi-layer cache by site (only when enabled)
      if (featureFlags.wqCacheEnabled) {
        try {
          const bySite = new Map();
          for (const r of rows) {
            const sc = r?.site_code; if (!sc) continue;
            if (!bySite.has(sc)) bySite.set(sc, []);
            bySite.get(sc).push(r);
          }
          
          const now = Date.now();
          for (const [sc, list] of bySite.entries()) {
            const cacheKey = `${sc}|${cacheRangeKey}`;
            const cacheEntry = { ts: now, data: list, meta: metadata };
            
            // Layer 1: In-memory cache (immediate access)
            if (cacheRef.current) {
              cacheRef.current.set(cacheKey, cacheEntry);
            }
            
            // Layer 2: Persistent cache (cross-session, async)
            if (persistentCache.isReady) {
              persistentCache.set(cacheKey, cacheEntry, PERSISTENT_CACHE_TTL_MS, 'water_quality')
                .then(success => {
                  if (success) {
                    log.debug(`[WQ Cache] Stored ${sc} in persistent cache`);
                  }
                })
                .catch(error => {
                  log.warn(`[WQ Cache] Failed to store ${sc} in persistent cache:`, error);
                });
            }
          }
          
          // Legacy localStorage persistence (for backward compatibility)
          persistCache(CACHE_STORAGE_KEY, cacheRef.current, CACHE_MAX_CHARS, CACHE_TTL_MS);
        } catch (error) {
          log.warn('[WQ Cache] Cache storage error:', error);
        }
      }

      if (mountedRef.current) {
        setData(rows);
        setLoading(false);
        setError(null);
        setMeta({
          ...(metadata || {}),
          cache: {
            enabled: featureFlags.wqCacheEnabled,
            hit: cacheHit,
            ttlMs: CACHE_TTL_MS,
          }
        });
        lastFetchKeyRef.current = fetchKey;

        // Add success/warning notifications
        const t1 = performance.now();
        const loadingTime = ((t1 - t0) / 1000).toFixed(2);
        const sitesText = selectedSites.join(', ');
        const recordsFormatted = rows.length.toLocaleString();
        
        // Create date range info for toast
        const wStart = (startDate || '').slice(0, 10);
        const wEnd = (endDate || '').slice(0, 10);
        const windowSuffix = (wStart && wEnd) ? ` • Window: ${wStart} → ${wEnd}` : '';

        // Remove loading toast before final result
        try { toast.removeToast(loadingToastId); } catch { /* ignore */ }
        if (rows.length === 0) {
          toast.showWarning(
            `No water quality records found for sites ${sitesText}${windowSuffix}`,
            { 
              title: 'No Data Available', 
              duration: 4000,
              dedupeKey: `wq-nodata|${selectedSites.join(',')}|${timeRange}`
            }
          );
        } else {
          const rate = rows.length / (loadingTime || 1);
          const rateStr = `${Math.round(rate).toLocaleString()} rec/s`;
          
          toast.showSuccess(
            `Loaded ${recordsFormatted} water quality records for sites ${sitesText}${windowSuffix} • ${loadingTime}s • ${rateStr}`,
            {
              title: '📊 Data Loading Complete',
              duration: 5000,
              dedupeKey: `wq-success|${selectedSites.join(',')}|${timeRange}`,
              actions: [{
                id: 'details',
                label: 'View Details',
                action: () => {
                  const avgRecordsPerSite = Math.round(rows.length / selectedSites.length);
                  const timeRangeDesc = timeRange === 'Custom Range' ? 
                    `${startDate?.slice(0,10)} to ${endDate?.slice(0,10)}` : 
                    timeRange;
                  
                  const details = `Dataset Details:\n• Time Range: ${timeRangeDesc}\n• Loaded Records: ${recordsFormatted}\n• Sites: ${selectedSites.length} (${sitesText})\n• Avg per Site: ${avgRecordsPerSite.toLocaleString()}\n• Load Time: ${loadingTime}s\n• Rate: ${rateStr}`;
                  
                  toast.showInfo(details, {
                    title: '📈 Dataset Summary',
                    duration: 8000
                  });
                }
              }]
            }
          );
        }

        log.info('[WQ Hook] Data loaded successfully:', {
          recordCount: rows.length,
          sites: selectedSites,
          loadingTime: `${loadingTime}s`
        });
      }
    } catch (err) {
      if (!mountedRef.current) return;
      // Ignore abort/cancelled requests to avoid noisy loops during range changes
      const isAbort = (err?.name === 'AbortError') || /Request\s*cancelled/i.test(err?.message || '') || err?.code === 'ERR_CANCELED';
      if (isAbort) {
        log.debug('[WQ Hook] Request aborted (ignored)');
        setLoading(false);
        return;
      }
      log.error('[WQ Hook] Data fetch error:', err);
      setLoading(false);
      const errorMessage = err?.message || String(err);
      setError(errorMessage);
      setMeta(null);
      
      // Show error toast
      toast.showError(
        `Failed to load water quality data: ${errorMessage}`,
        {
          title: 'Water Quality Data Failed',
          actions: [{
            id: 'retry',
            label: 'Retry',
            action: () => refetch()
          }]
        }
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(selectedSites) ? selectedSites.join(',') : '', timeRange, startDate, endDate, shapeSig]);

  // Fix: Stable refetch reference to prevent infinite loops
  const stableRefetch = useCallback(() => refetch(), [refetch]);

  return useMemo(() => ({ data, loading, error, meta, refetch: stableRefetch }), [data, loading, error, meta, stableRefetch]);
}

export default useWaterQualityData;
