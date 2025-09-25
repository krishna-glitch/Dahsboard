import { useQuery } from '@tanstack/react-query';
import { getHomeData } from '../services/api';

/**
 * React Query hook for home dashboard data
 * Provides automatic caching, background refetching, and loading states
 */
export const useHomeQuery = () => {
  return useQuery({
    queryKey: ['homeData'],
    queryFn: getHomeData,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    select: (data) => {
      // Transform data once in the query selector for better performance
      const stats = data?.dashboard_data?.dashboard_stats || {};
      const latest = Array.isArray(data?.dashboard_data?.latest_per_site)
        ? data.dashboard_data.latest_per_site
        : [];

      return {
        stats: {
          active_sites: Number.isFinite(stats.active_sites) ? stats.active_sites : 0,
          total_sites: Number.isFinite(stats.total_sites) ? stats.total_sites : 0,
          recent_measurements: Number.isFinite(stats.recent_measurements) ? stats.recent_measurements : 0,
          data_quality: Number.isFinite(stats.data_quality) ? stats.data_quality : null,
          active_alerts: 0, // Not provided by API yet
          data_current_through: stats.data_current_through || null,
        },
        meta: {
          last_updated: data?.metadata?.last_updated || null
        },
        latestBySite: latest
      };
    }
  });
};