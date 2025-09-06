import { useQuery } from '@tanstack/react-query';
import { getSiteComparisonData } from '../services/api';
import { useToast } from '../components/modern/toastUtils';
import { log } from '../utils/log';

/**
 * React Query hook for site comparison data
 */
export function useSiteComparisonQuery({
  selectedSites,
  timeRange,
  startDate,
  endDate,
  enabled = true,
}) {
  const toast = useToast();

  const buildParams = () => ({
    sites: selectedSites,
    time_range: timeRange,
    ...(timeRange === 'Custom Range' && startDate && endDate 
      ? { start_date: startDate, end_date: endDate } 
      : {}
    ),
  });

  const queryKey = [
    'site-comparison',
    {
      sites: selectedSites,
      timeRange,
      startDate,
      endDate,
    },
  ];

  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const t0 = performance.now();
      log.debug('[Site Comparison Query] Fetching with params:', buildParams());
      
      try {
        const response = await getSiteComparisonData(buildParams(), signal);
        const data = response?.data || response || {};
        
        const t1 = performance.now();
        const loadingTime = ((t1 - t0) / 1000).toFixed(2);
        
        log.info('[Site Comparison Query] Data loaded successfully:', {
          sitesCount: data?.sites?.length || 0,
          loadingTime: `${loadingTime}s`,
        });

        return data;
      } catch (error) {
        log.error('[Site Comparison Query] Data fetch error:', error);
        
        const errorMessage = error?.message || String(error);
        toast.showError(
          `Failed to load site comparison data: ${errorMessage}`,
          {
            title: 'Site Comparison Failed',
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
    staleTime: 3 * 60 * 1000, // 3 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    retry: 1,
  });

  return {
    data: query.data || {},
    loading: query.isLoading,
    error: query.error?.message || null,
    refetch: query.refetch,
    isStale: query.isStale,
    isFetching: query.isFetching,
    lastUpdated: query.dataUpdatedAt,
  };
}

export default useSiteComparisonQuery;