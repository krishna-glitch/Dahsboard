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
  no_downsample = false, // Default to false to allow downsampling
  enabled = true,
}) {
  const toast = useToast();

  // Build query parameters
  const buildParams = () => {
    const params = {
      sites: selectedSites,
      time_range: timeRange,
      no_downsample: no_downsample,
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

  // Create unique query key
  const queryKey = [
    'water-quality',
    {
      sites: selectedSites,
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
      no_downsample,
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
        
        throw error;
      }
    },
    enabled: enabled && Array.isArray(selectedSites) && selectedSites.length > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes - data becomes stale after 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes - cache for 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: 'always', // Always fetch fresh data on mount
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
