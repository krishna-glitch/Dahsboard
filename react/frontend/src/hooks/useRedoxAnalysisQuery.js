import { useQuery } from '@tanstack/react-query';
import { getRedoxAnalysisData } from '../services/api';
import { useToast } from '../components/modern/toastUtils';
import { log } from '../utils/log';

/**
 * React Query hook for redox analysis data
 */
export function useRedoxAnalysisQuery({
  selectedSites,
  timeRange,
  startDate,
  endDate,
  selectedDepth = 30,
  maxFidelity = false,
  enabled = true,
}) {
  const toast = useToast();

  const buildParams = () => ({
    sites: selectedSites,
    time_range: timeRange,
    depth: selectedDepth,
    max_fidelity: maxFidelity,
    ...(timeRange === 'Custom Range' && startDate && endDate 
      ? { start_date: startDate, end_date: endDate } 
      : {}
    ),
  });

  const queryKey = [
    'redox-analysis',
    {
      sites: selectedSites,
      timeRange,
      startDate,
      endDate,
      depth: selectedDepth,
      maxFidelity,
    },
  ];

  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const t0 = performance.now();
      log.debug('[Redox Analysis Query] Fetching with params:', buildParams());
      
      try {
        const response = await getRedoxAnalysisData(buildParams(), signal);
        const data = response?.data || response || [];
        
        const t1 = performance.now();
        const loadingTime = ((t1 - t0) / 1000).toFixed(2);
        
        log.info('[Redox Analysis Query] Data loaded successfully:', {
          recordCount: Array.isArray(data) ? data.length : 0,
          sites: selectedSites,
          depth: selectedDepth,
          maxFidelity,
          loadingTime: `${loadingTime}s`,
        });

        // Show success toast
        if (Array.isArray(data) && data.length > 0) {
          const sitesText = selectedSites.join(', ');
          const recordsFormatted = data.length.toLocaleString();
          const rate = Math.round(data.length / (loadingTime || 1));
          
          toast.showSuccess(
            `Loaded ${recordsFormatted} redox measurements for sites ${sitesText} at ${selectedDepth}cm • ${loadingTime}s • ${rate.toLocaleString()} rec/s`,
            {
              title: '🔬 Redox Analysis Complete',
              duration: 3000,
              dedupeKey: `redox-success|${selectedSites.join(',')}|${selectedDepth}|${timeRange}`,
            }
          );
        } else {
          toast.showWarning(
            `No redox data found for sites ${selectedSites.join(', ')} at ${selectedDepth}cm depth`,
            { 
              title: 'No Redox Data Available',
              duration: 4000,
              dedupeKey: `redox-nodata|${selectedSites.join(',')}|${selectedDepth}|${timeRange}`,
            }
          );
        }

        return data;
      } catch (error) {
        log.error('[Redox Analysis Query] Data fetch error:', error);
        
        const errorMessage = error?.message || String(error);
        toast.showError(
          `Failed to load redox analysis data: ${errorMessage}`,
          {
            title: 'Redox Analysis Failed',
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
    staleTime: 4 * 60 * 1000, // 4 minutes - redox data changes less frequently
    gcTime: 20 * 60 * 1000, // 20 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    retry: 1,
  });

  return {
    data: query.data || [],
    loading: query.isLoading,
    error: query.error?.message || null,
    refetch: query.refetch,
    isStale: query.isStale,
    isFetching: query.isFetching,
    lastUpdated: query.dataUpdatedAt,
  };
}

export default useRedoxAnalysisQuery;