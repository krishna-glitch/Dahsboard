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
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    select: (data) => {
      // Safely access data from the new structure

const dashboardStats = data?.dashboard_data?.dashboard_stats || { status: 'error', data: {}, message: 'Missing stats section' };
const latestPerSite = data?.dashboard_data?.latest_per_site || { status: 'error', data: [], message: 'Missing latest records section' };

const stats = dashboardStats.data || {};
const latest = Array.isArray(latestPerSite.data) ? latestPerSite.data : [];
const recentWindow = stats.recent_measurements_window || {};
const status = dashboardStats.status || 'unknown';
const message = dashboardStats.message || null;
const hasWindow = recentWindow.start && recentWindow.end;
const contextLabel = message || (hasWindow
  ? (recentWindow.is_current
      ? 'Last 24 hours'
      : `Window ${new Date(recentWindow.start).toLocaleDateString()} → ${new Date(recentWindow.end).toLocaleDateString()}`)
  : 'No measurements yet');

return {
  stats: {
    status,
    message,
    contextLabel,
    active_sites: Number.isFinite(stats.active_sites) ? stats.active_sites : null,
    total_sites: Number.isFinite(stats.total_sites) ? stats.total_sites : null,
    recent_measurements: Number.isFinite(stats.recent_measurements) ? stats.recent_measurements : null,
    recent_window: {
      start: recentWindow.start || null,
      end: recentWindow.end || null,
      isCurrent: Boolean(recentWindow.is_current),
      status: stats.recent_measurements_status || status,
    },
    data_quality: Number.isFinite(stats.data_quality) ? stats.data_quality : null,
    active_alerts: Number.isFinite(stats.active_alerts) ? stats.active_alerts : 0,
    data_current_through: stats.data_current_through || stats.latest_measurement_timestamp || null,
  },
  latestBySite: {
    status: latestPerSite.status || 'unknown',
    message: latestPerSite.message || (latest.length ? null : 'No site activity available.'),
    data: latest,
  },
  meta: {
    last_updated: data?.metadata?.last_updated || null
  },
};
    }
  });
};