import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getWaterQualityData } from '../services/api';
import { useToast } from '../components/modern/toastUtils';
import { log } from '../utils/log';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const lastFetchKeyRef = useRef(null);
  const abortRef = useRef(null);
  const mountedRef = useRef(true);
  const toast = useToast();

  useEffect(() => () => { mountedRef.current = false; try { abortRef.current?.abort(); } catch {} }, []);

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

  const shapeSig = useMemo(() => (
    JSON.stringify({
      useAdvancedFilters: !!useAdvancedFilters,
      selectedParameters: (selectedParameters || []).slice().sort(),
      valueRanges: valueRanges || {},
      dataQualityFilter: dataQualityFilter || 'all',
      alertsFilter: alertsFilter || 'all',
      selectedParameter: selectedParameter || null,
      compareMode: compareMode || 'off',
      compareParameter: compareParameter || null,
    })
  ), [useAdvancedFilters, JSON.stringify(selectedParameters||[]), JSON.stringify(valueRanges||{}), dataQualityFilter, alertsFilter, selectedParameter, compareMode, compareParameter]);

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
    // Abort previous
    try { abortRef.current?.abort(); } catch {}
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setLoading(true);

    try {
      const t0 = performance.now();
      const rangeKey = (timeRange === 'Custom Range' && startDate && endDate)
        ? `custom|${startDate}|${endDate}`
        : `range|${timeRange}`;
      const fetchKey = [selectedSites.join(','), rangeKey, shapeSig].join('|');

      log.debug('[WQ Hook] Fetch key:', fetchKey);

      const params = buildParams();
      log.debug('[WQ Hook] API params:', params);
      
      const CHUNK_SIZE = 100000;
      const loadingToastId = toast.showLoading('Loading water quality records…', {
        title: 'Loading Water Quality',
        dedupeKey: 'wq-chunk-loading'
      });
      let rows = [];
      let dateRange = null;
      let offset = 0;
      while (true) {
        const res = await getWaterQualityData({ ...params, chunk_size: CHUNK_SIZE, offset }, controller.signal);
        log.debug('[WQ Hook] API response chunk:', { 
          hasData: !!res?.water_quality_data || !!res?.data,
          dataLength: (res?.water_quality_data || res?.data || []).length,
          meta: res?.metadata
        });
        const chunk = res?.water_quality_data || res?.data || [];
        rows = rows.concat(chunk);
        try {
          toast.updateToast(loadingToastId, {
            type: 'loading',
            title: 'Loading Water Quality',
            message: `Loaded ${rows.length.toLocaleString()} records…`,
            duration: 10000
          });
        } catch {}
        if (!dateRange && res?.metadata?.date_range && (res?.metadata?.date_range.start || res?.metadata?.date_range.end)) {
          dateRange = {
            start: res.metadata.date_range.start,
            end: res.metadata.date_range.end,
          };
        }
        const info = res?.metadata?.chunk_info || {};
        if (!info.has_more || chunk.length === 0) break;
        offset = (info.offset || 0) + (info.chunk_size || CHUNK_SIZE);
        if (offset >= 200000) break; // guard against excess
      }
      const metadata = dateRange ? { date_range: dateRange } : null;

      if (mountedRef.current) {
        setData(rows);
        setLoading(false);
        setError(null);
        setMeta({
          ...(metadata || {}),
        });
        lastFetchKeyRef.current = fetchKey;

        const t1 = performance.now();
        const loadingTime = ((t1 - t0) / 1000).toFixed(2);
        const sitesText = selectedSites.join(', ');
        const recordsFormatted = rows.length.toLocaleString();
        
        const wStart = (startDate || '').slice(0, 10);
        const wEnd = (endDate || '').slice(0, 10);
        const windowSuffix = (wStart && wEnd) ? ` • Window: ${wStart} → ${wEnd}` : '';

        try { toast.removeToast(loadingToastId); } catch {}
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

  useEffect(() => {
    if (!Array.isArray(selectedSites) || selectedSites.length === 0) return;
    refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(selectedSites) ? selectedSites.join(',') : '', timeRange, startDate, endDate, shapeSig]);

  return useMemo(() => ({ data, loading, error, meta, refetch }), [data, loading, error, meta]);
}

export default useWaterQualityData;