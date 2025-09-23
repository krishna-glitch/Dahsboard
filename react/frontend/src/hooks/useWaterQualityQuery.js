import { useQuery } from '@tanstack/react-query';
import { getWaterQualityData } from '../services/api';
import { useToast } from '../components/modern/toastUtils';
import { log } from '../utils/log';

/**
 * React Query version of water quality data fetching
 * Provides optimized caching, background updates, and error handling
 */
export function useWaterQualityQuery({
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
  enabled = true,
}) {
  const toast = useToast();

  // Build query parameters
  const buildParams = () => {
    const params = {
      sites: selectedSites,
      time_range: timeRange,
      no_downsample: true, // Always fetch the full dataset as requested
      ...(timeRange === 'Custom Range' && startDate && endDate 
        ? { start_date: startDate, end_date: endDate } 
        : {}
      ),
    };
    
    if (useAdvancedFilters) {
      if (Array.isArray(selectedParameters) && selectedParameters.length > 0) {
        params.parameters = selectedParameters.join(',');
      }
      Object.entries(valueRanges || {}).forEach(([param, range]) => {
        if (range?.min != null) params[`${param}_min`] = range.min;
        if (range?.max != null) params[`${param}_max`] = range.max;
      });
      if (dataQualityFilter && dataQualityFilter !== 'all') {
        params.data_quality = dataQualityFilter;
      }
      if (alertsFilter && alertsFilter !== 'all') {
        params.alert_level = alertsFilter;
      }
    }
    
    return params;
  };

  // Create optimized query key - Only include server-side parameters
  const queryKey = [
    'water-quality',
    {
      sites: selectedSites.sort().join(','), // Consistent ordering
      timeRange,
      startDate: timeRange === 'Custom Range' ? startDate : null,
      endDate: timeRange === 'Custom Range' ? endDate : null,
      useAdvancedFilters,
      selectedParameters,
      valueRanges,
      dataQualityFilter,
      alertsFilter,
      // Removed UI-only parameters: selectedParameter, compareMode, compareParameter
    },
  ];

  // Query configuration
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const t0 = performance.now();
      log.debug('[WQ Query] Fetching with params:', buildParams());
      
      try {
        const response = await getWaterQualityData(buildParams(), signal);
        const data = response?.water_quality_data || response?.data || [];
        
        const t1 = performance.now();
        const loadingTime = ((t1 - t0) / 1000).toFixed(2);
        
        log.info('[WQ Query] Data loaded successfully:', {
          recordCount: data.length,
          sites: selectedSites,
          loadingTime: `${loadingTime}s`,
        });

        // Show success toast
        if (data.length > 0) {
          const sitesText = selectedSites.join(', ');
          const recordsFormatted = data.length.toLocaleString();
          const rate = Math.round(data.length / (loadingTime || 1));
          
          toast.showSuccess(
            `Loaded ${recordsFormatted} water quality records for sites ${sitesText} • ${loadingTime}s • ${rate.toLocaleString()} rec/s`,
            {
              title: '📊 Data Loading Complete',
              duration: 3000,
              dedupeKey: `wq-success|${selectedSites.join(',')}|${timeRange}`,
            }
          );
        } else {
          toast.showWarning(
            `No water quality records found for sites ${selectedSites.join(', ')}`,
            {
              title: 'No Data Available',
              duration: 4000,
              dedupeKey: `wq-nodata|${selectedSites.join(',')}|${timeRange}`,
            }
          );
        }

        return {
          data: data,
          metadata: response?.metadata || {},
        };
      } catch (error) {
        // Check if the error is due to a cancelled request
        const isCancellation = error.name === 'AbortError' || error.name === 'DOMException' || error.message.includes('cancelled');
        
        if (isCancellation) {
          log.debug('[WQ Query] Request cancelled intentionally.');
        } else {
          log.error('[WQ Query] Data fetch error:', error);
          const errorMessage = error?.message || String(error);
          toast.showError(
            `Failed to load water quality data: ${errorMessage}`,
            {
              title: 'Water Quality Data Failed',
              actions: [{
                id: 'retry',
                label: 'Retry',
                action: () => query.refetch(),
              }],
            }
          );
        }
        
        throw error; // Always re-throw so react-query can handle the query state
      }
    },
    enabled: enabled && Array.isArray(selectedSites) && selectedSites.length > 0,
    staleTime: 30 * 60 * 1000, // 30 minutes - Match Redis TTL
    gcTime: 60 * 60 * 1000, // 60 minutes - Extended garbage collection
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    retry: 1,
  });

  return {
    data: query.data?.data || [],
    metadata: query.data?.metadata || {},
    loading: query.isLoading,
    error: query.error?.message || null,
    refetch: query.refetch,
    isStale: query.isStale,
    isFetching: query.isFetching,
    lastUpdated: query.dataUpdatedAt,
  };
}

export default useWaterQualityQuery;
