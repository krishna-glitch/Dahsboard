import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import Plot from '../components/PlotlyLite';

// Modern components
import MetricCard from '../components/modern/MetricCard';
const TanStackDataTable = lazy(() => import('../components/modern/TanStackDataTable'));
import EmptyState from '../components/modern/EmptyState';
import SidebarFilters from '../components/filters/SidebarFilters';
import ExportButton from '../components/ExportButton';
import SimpleLoadingBar from '../components/modern/SimpleLoadingBar';
import PresetSelector from '../components/modern/PresetSelector';
import { useToast } from '../components/modern/toastUtils';
import { useWaterQualityDataWithMonthlyCache } from '../hooks/useWaterQualityDataWithMonthlyCache';
import usePredictiveLoader from '../hooks/usePredictiveLoader';
const WaterQualityChartRouter = lazy(() => import('../components/water/WaterQualityChartRouter'));
import WaterQualityChartControls from '../components/water/WaterQualityChartControls';
import { log } from '../utils/log';
import VisibleOnView from '../components/VisibleOnView';

// Error boundaries and performance monitoring
import DataLoadingErrorBoundary from '../components/boundaries/DataLoadingErrorBoundary';
import ChartErrorBoundary from '../components/boundaries/ChartErrorBoundary';
// Temporarily disabled performance monitoring hooks to fix infinite loop
// import { useDataLoadingPerformance, useChartPerformance } from '../hooks/usePerformanceMonitoring';

// Existing services and hooks
import { getAlertsData } from '../services/api';
// import { useProgressiveDataLoader } from '../hooks/useProgressiveDataLoader';

// Import modern layout styles
import '../styles/modern-layout.css';

// Local storage helpers removed

import { WATER_QUALITY_PARAMETERS } from '../constants/appConstants';

// Convert WATER_QUALITY_PARAMETERS to PARAMETER_CONFIG format
const PARAMETER_CONFIG = WATER_QUALITY_PARAMETERS.reduce((config, param) => {
  config[param.value] = {
    label: param.label,
    unit: param.unit,
    icon: param.icon,
    color: param.value === 'temperature_c' ? '#ff6b35' :
           param.value === 'conductivity_us_cm' ? '#4ecdc4' :
           param.value === 'water_level_m' ? '#45b7d1' : '#6c757d'
  };
  return config;
}, {});

/**
 * Modern Water Quality Dashboard
 * Complete rewrite with modern layout and UX patterns
 */
const ModernWaterQuality = () => {
  // Hooks for navigation and localStorage
  const navigate = useNavigate();
  // Presets removed with unified sidebar filters
  
  // Performance monitoring - temporarily disabled to fix infinite loop
  // const { trackDataFetch, trackApiCall } = useDataLoadingPerformance('ModernWaterQuality');
  // const { trackChartRender } = useChartPerformance('ModernWaterQuality', 'water-quality-chart');
  
  // State management
  const [error, setError] = useState(null);
  const [selectedSites, setSelectedSites] = useState(['S1', 'S2', 'S3']); // Default sites
  const [timeRange, setTimeRange] = useState('Custom Range'); // Use custom range with specific available dates
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [showPresetSelector, setShowPresetSelector] = useState(false);
  const [activeView, setActiveView] = useState('overview'); // overview, details
  const [chartType, setChartType] = useState('line'); // line, scatter, bar
  const [selectedParameter, setSelectedParameter] = useState('temperature_c'); // primary parameter
  const [compareMode, setCompareMode] = useState('off'); // off, overlay, split
  const [compareParameter, setCompareParameter] = useState('conductivity_us_cm'); // secondary parameter
  // Date range - let hook determine from timeRange initially
  // Set default dates to available data range (database contains data through 2024-05-31)
  const [startDate, setStartDate] = useState('2024-05-01');
  const [endDate, setEndDate] = useState('2024-05-31');
  const [maxDateAvailable, setMaxDateAvailable] = useState('');
  const [minDateAvailable, setMinDateAvailable] = useState('');
  
  // Toast notifications
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Predictive loading for cache optimization
  const predictiveLoader = usePredictiveLoader();

  // URL -> State (initialize once to avoid URL/state feedback loops)
  const initializedFromUrlRef = useRef(false);
  useEffect(() => {
    if (initializedFromUrlRef.current) return;
    const sitesQ = searchParams.get('sites');
    const timeQ = searchParams.get('time_range');
    const paramQ = searchParams.get('param');
    const cmpQ = searchParams.get('cmp');
    const modeQ = searchParams.get('mode');
    if (sitesQ) setSelectedSites(sitesQ.split(','));
    if (timeQ) setTimeRange(timeQ);
    if (paramQ) setSelectedParameter(paramQ);
    if (cmpQ) setCompareParameter(cmpQ);
    if (modeQ) setCompareMode(modeQ);
    initializedFromUrlRef.current = true;
  }, [searchParams]);

  // State -> URL
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('sites', selectedSites.join(','));
    params.set('time_range', timeRange);
    params.set('param', selectedParameter);
    params.set('cmp', compareParameter);
    params.set('mode', compareMode);
    // Only update URL if it actually differs to prevent infinite loops
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) setSearchParams(params, { replace: true });
  }, [selectedSites, timeRange, selectedParameter, compareParameter, compareMode, setSearchParams, searchParams]);
  
  // Data via monthly cache hook for optimal performance
  const { data, loading, error: hookError, meta, cacheStats, refetch } = useWaterQualityDataWithMonthlyCache({
    selectedSites,
    timeRange,
    startDate,
    endDate,
    selectedParameter,
    compareMode,
    compareParameter
  });
  useEffect(() => { if (hookError) setError(hookError); }, [hookError]);
  
  // Track behavior for predictive loading
  useEffect(() => {
    if (data.length > 0 && !loading) {
      predictiveLoader.addBehavior({
        service: 'water_quality',
        sites: selectedSites,
        timeRange: timeRange,
        parameters: [selectedParameter],
        compareMode,
        timestamp: Date.now()
      });
    }
  }, [data.length, loading, selectedSites, timeRange, selectedParameter, compareMode, predictiveLoader]);
  
  // Track actual server data window for UI hints and set defaults
  useEffect(() => {
    const start = meta?.date_range?.start ? String(meta.date_range.start).slice(0, 10) : '';
    const end = meta?.date_range?.end ? String(meta.date_range.end).slice(0, 10) : '';
    if (start) setMinDateAvailable(start);
    if (end) setMaxDateAvailable(end);

    // Set default date range if not already set
    if (start && end && !startDate && !endDate) {
      setStartDate(start);
      setEndDate(end);
    }
  }, [meta, startDate, endDate]);

  // Update available sites based on actual data, but keep current selection
  useEffect(() => {
    if (data && data.length > 0) {
      const availableSites = [...new Set(data.map(row => row.site_code).filter(Boolean))].sort();
      // If current selection has sites that don't exist in data, update to available ones
      if (selectedSites.length > 0) {
        const validSites = selectedSites.filter(site => availableSites.includes(site));
        if (validSites.length === 0 && availableSites.length > 0) {
          // Current selection is invalid, use first few available sites
          setSelectedSites(availableSites.slice(0, Math.min(3, availableSites.length)));
        }
      }
    }
  }, [data, selectedSites]);

  // Legacy progressive loader removed; hook manages loading and data
  
  // Advanced filter states
  // Unified sidebar filters only (advanced filters removed)

  // Table column definitions for professional data analysis
  const tableColumns = useMemo(() => {
    // Base column definitions; will filter to only those present in data
    const base = [
      { key: 'measurement_timestamp', label: 'Timestamp', format: (v) => v ? new Date(v).toLocaleString() : '-' },
      { key: 'site_code', label: 'Site' },
      { key: 'temperature_c', label: 'Temperature (°C)', format: (v) => (v ?? null) == null ? '-' : Number(v).toFixed(2) },
      { key: 'conductivity_us_cm', label: 'Conductivity (µS/cm)', format: (v) => (v ?? null) == null ? '-' : Number(v).toFixed(1) },
      { key: 'water_level_m', label: 'Water Level (m)', format: (v) => (v ?? null) == null ? '-' : Number(v).toFixed(3) },
    ];
    if (!Array.isArray(data) || data.length === 0) return base.slice(0, 5); // minimal default
    const hasKey = (k) => data.some(row => row != null && row[k] != null);
    return base.filter(col => hasKey(col.key));
  }, [data]);

  // Computed metrics
  const metrics = useMemo(() => {
    if (!data.length) {
      return {
        totalRecords: 0,
        sitesCount: 0,
        perSiteAvgTemperature: 0,
        perSiteAvgConductivity: 0,
        perSiteAvgWaterLevel: 0,
        completeness: 0
      };
    }

    const bySite = new Map();
    for (const row of data) {
      if (!row || !row.site_code) continue;
      if (!bySite.has(row.site_code)) bySite.set(row.site_code, { t: [], c: [], w: [] });
      const b = bySite.get(row.site_code);
      if (row.temperature_c != null) b.t.push(Number(row.temperature_c));
      if (row.conductivity_us_cm != null) b.c.push(Number(row.conductivity_us_cm));
      if (row.water_level_m != null) b.w.push(Number(row.water_level_m));
    }

    const siteMeans = { t: [], c: [], w: [], breakdown: { t: [], c: [], w: [] } };
    for (const [site, vals] of bySite.entries()) {
      if (vals.t.length) {
        const m = vals.t.reduce((a, v) => a + v, 0) / vals.t.length;
        siteMeans.t.push(m);
        siteMeans.breakdown.t.push({ site, mean: m });
      }
      if (vals.c.length) {
        const m = vals.c.reduce((a, v) => a + v, 0) / vals.c.length;
        siteMeans.c.push(m);
        siteMeans.breakdown.c.push({ site, mean: m });
      }
      if (vals.w.length) {
        const m = vals.w.reduce((a, v) => a + v, 0) / vals.w.length;
        siteMeans.w.push(m);
        siteMeans.breakdown.w.push({ site, mean: m });
      }
    }

    const mean = arr => arr.length ? arr.reduce((a, v) => a + v, 0) / arr.length : 0;

    // Simple completeness across key parameters (t/c/w)
    const nonNullCounts = { t: 0, c: 0, w: 0 };
    for (const row of data) {
      if (row.temperature_c != null) nonNullCounts.t++;
      if (row.conductivity_us_cm != null) nonNullCounts.c++;
      if (row.water_level_m != null) nonNullCounts.w++;
    }
    const completeness = Math.round(((nonNullCounts.t + nonNullCounts.c + nonNullCounts.w) / (data.length * 3)) * 100);

    return {
      totalRecords: data.length,
      sitesCount: bySite.size,
      perSiteAvgTemperature: mean(siteMeans.t),
      perSiteAvgConductivity: mean(siteMeans.c),
      perSiteAvgWaterLevel: mean(siteMeans.w),
      completeness,
      breakdown: siteMeans.breakdown
    };
  }, [data]);

  // Use the regular data - progressive loading updates the same data state
  
  // Chart data preparation - parameter and type aware
  const chartData = useMemo(() => {
    if (!data.length) return [];

    // Decide rendering approach
    const largeDataset = data.length > 10000;
    const useWebGL = chartType !== 'bar' && largeDataset; // prefer WebGL for large sets

    // Group by site for multiple traces
    const bySite = {};
    const colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd'];

    for (const d of data) {
      const site = d.site_code;
      const x = d.measurement_timestamp;
      const y = d[selectedParameter];
      if (y == null) continue;
      if (!bySite[site]) {
        bySite[site] = {
          x: [],
          y: [],
          name: `Site ${site}`,
          type: chartType === 'bar' ? 'bar' : (useWebGL ? 'scattergl' : 'scatter')
        };
      }
      bySite[site].x.push(x);
      bySite[site].y.push(y);
    }

    const tracesPrimary = Object.values(bySite).map((t, index) => ({
      ...t,
      mode: chartType === 'line' ? 'lines' : 'markers',
      line: chartType !== 'bar' ? { width: largeDataset ? 1 : 2, color: colors[index % colors.length] } : undefined,
      marker: chartType !== 'bar' ? { size: largeDataset ? 3 : 6, color: colors[index % colors.length] } : undefined,
      hoverinfo: 'x+y+name',
      connectgaps: false,
      simplify: true
    }));

    if (compareMode === 'overlay' && compareParameter && compareParameter !== selectedParameter) {
      const cmpBySite = {};
      for (const d of data) {
        const site = d.site_code;
        const x = d.measurement_timestamp;
        const y = d[compareParameter];
        if (y == null) continue;
        if (!cmpBySite[site]) {
          cmpBySite[site] = { x: [], y: [], name: `Site ${site} (${compareParameter})`, type: (useWebGL ? 'scattergl' : 'scatter') };
        }
        cmpBySite[site].x.push(x);
        cmpBySite[site].y.push(y);
      }
      const tracesSecondary = Object.values(cmpBySite).map((t) => ({
        ...t,
        mode: chartType === 'line' ? 'lines' : 'markers',
        yaxis: 'y2',
        line: chartType === 'line' ? { color: '#a78bfa', width: largeDataset ? 1 : 2, dash: 'dot' } : undefined,
        marker: chartType !== 'bar' ? { size: largeDataset ? 3 : 5, color: '#a78bfa' } : undefined
      }));
      return [...tracesPrimary, ...tracesSecondary];
    }

    return tracesPrimary;
  }, [data, selectedParameter, chartType, compareMode, compareParameter]);

  // Debug: log chart data composition when it changes
  useEffect(() => {
    try {
      const seriesCount = chartData.length;
      const pointCount = chartData.reduce((sum, s) => sum + (s?.x?.length || 0), 0);
      log.debug('[WQ] chartData summary', { 
        seriesCount, 
        pointCount, 
        firstSeriesSample: chartData[0]?.x?.slice(0, 3)
      });
      
      // Additional debugging for large datasets
      if (pointCount > 50000) {
        log.warn('[WQ] LARGE DATASET DETECTED', {
          pointCount,
          using_webgl: chartData.some(s => s.type === 'scattergl'),
          first_series_sample_data: {
            x_sample: chartData[0]?.x?.slice(0, 5),
            y_sample: chartData[0]?.y?.slice(0, 5)
          }
        });
      }
    } catch (error) {
      log.error('[WQ] Error in chartData debug', error);
    }
  }, [chartData]);

  // Auto-fallback to a parameter that has data when current selection is empty
  const fallbackTriedRef = useRef(false);
  useEffect(() => {
    if (!data.length) return;
    const currentHasData = data.some(d => d[selectedParameter] != null);
    if (currentHasData) {
      fallbackTriedRef.current = false;
      return;
    }
    if (fallbackTriedRef.current) return;
    const candidates = ['temperature_c', 'conductivity_us_cm', 'water_level_m'];
    const next = candidates.find(p => data.some(d => d[p] != null));
    if (next && next !== selectedParameter) {
      log.info('[WQ] parameter fallback', { from: selectedParameter, to: next });
      fallbackTriedRef.current = true;
      setSelectedParameter(next);
    }
  }, [data, selectedParameter]);

  // Alerts overlay for annotations
  const [alertShapes, setAlertShapes] = useState([]);
  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const params = { sites: selectedSites, time_range: timeRange };
        const res = await getAlertsData(params);
        const alerts = res?.active_alerts || [];
        const shapes = alerts.map(a => ({
          type: 'line', x0: a.created_at, x1: a.created_at, yref: 'paper', y0: 0, y1: 1,
          line: { color: a.severity === 'critical' ? '#ef4444' : a.severity === 'high' ? '#f59e0b' : '#94a3b8', width: 1, dash: 'dot' }, opacity: 0.7
        }));
        setAlertShapes(shapes);
      } catch (e) { console.warn('[WQ] Failed to load alerts (ignored)', e); }
    };
    loadAlerts();
  }, [selectedSites, timeRange]);

  // Parameter configuration now using static PARAMETER_CONFIG constant

  // Simple toast usage via useToast; no dedupe wrapper

  // Client-side caches removed; rely on backend and hook caching


  // Manual refresh via hook
  const fetchData = useCallback(async () => {
    // Deprecated by useWaterQualityData; keep for compatibility in UI handlers if any remain
    try {
      setError(null);
      await refetch();
    } catch (err) {
      log.warn('[WQ] Refetch failed', err);
      setError(err?.message || 'Failed to load data');
    }
  }, [refetch]);

  // Hook fetches on dependency changes; no extra debounced refetch

  // Filter presets removed

  // Batch state update helpers to prevent cascading re-renders
  const updateFilters = useCallback((updates) => {
    // React 18+ automatically batches state updates, no need for unstable_batchedUpdates
    Object.entries(updates).forEach(([key, value]) => {
      switch (key) {
        case 'selectedSites': setSelectedSites(value); break;
        case 'timeRange': setTimeRange(value); break;
        case 'startDate': setStartDate(value); break;
        case 'endDate': setEndDate(value); break;
        default: break;
      }
    });
  }, []);

  // Filter handlers with batched updates
  const handleSiteChange = useCallback((sites) => {
    updateFilters({ selectedSites: sites });
  }, [updateFilters]);

  const handleTimeRangeChange = useCallback((range) => {
    updateFilters({ timeRange: range });
  }, [updateFilters]);

  const handleApplyFilters = useCallback(() => {
    if (!loading) {
      refetch();
    }
  }, [loading, refetch]);

  // Stable callbacks for performance optimization
  const handleOverviewView = useCallback(() => {
    setActiveView('overview');
  }, []);

  const handleDetailsView = useCallback(() => {
    setActiveView('details');
  }, []);

  const handleRefresh = useCallback(() => {
    if (!loading) fetchData();
  }, [loading, fetchData]);

  const handleToggleFilters = useCallback(() => {
    setFiltersCollapsed(!filtersCollapsed);
  }, [filtersCollapsed]);

  // Preset handlers
  const getCurrentSettings = useCallback(() => ({
    selectedSites,
    timeRange,
    startDate,
    endDate,
    selectedParameter,
    compareMode,
    compareParameter,
    chartType,
    activeView,
    filtersCollapsed
  }), [selectedSites, timeRange, startDate, endDate, selectedParameter, compareMode, compareParameter, chartType, activeView, filtersCollapsed]);

  const handleApplyPreset = useCallback((preset) => {
    if (!preset || !preset.settings) return;

    const settings = preset.settings;
    if (settings.sites) setSelectedSites(settings.sites);
    if (settings.timeRange) setTimeRange(settings.timeRange);
    if (settings.startDate) setStartDate(settings.startDate);
    if (settings.endDate) setEndDate(settings.endDate);
    if (settings.selectedParameter) setSelectedParameter(settings.selectedParameter);
    if (settings.compareMode) setCompareMode(settings.compareMode);
    if (settings.compareParameter) setCompareParameter(settings.compareParameter);
    if (settings.chartType) setChartType(settings.chartType);
    if (settings.activeView) setActiveView(settings.activeView);
    if (typeof settings.filtersCollapsed === 'boolean') setFiltersCollapsed(settings.filtersCollapsed);

    toast.success(`Applied preset: ${preset.name}`);
  }, [toast]);

  // Empty state context
  const emptyStateContext = {
    onSiteChange: handleSiteChange,
    onTimeRangeChange: handleTimeRangeChange,
    onResetFilters: () => {
      updateFilters({
        selectedSites: ['S1', 'S2'],
        timeRange: 'Custom Range',
        startDate: '2024-05-01',
        endDate: '2024-05-31'
      });
    },
    onSelectAllSites: () => {
      updateFilters({ selectedSites: ['S1', 'S2', 'S3', 'S4'] });
    },
    onUpload: () => {
      // Navigate to upload page using React Router
      navigate('/upload');
    },
    tips: [
      'Try selecting different monitoring sites',
      'Extend the time range to find more data',
      'Check if data collection is active for your sites'
    ]
  };

  // Log latest record date whenever data changes and backfill maxDateAvailable
  useEffect(() => {
    if (!Array.isArray(data) || data.length === 0) return;
    try {
      let maxTs = 0;
      for (const r of data) {
        const t = r?.measurement_timestamp ? new Date(r.measurement_timestamp).getTime() : NaN;
        if (Number.isFinite(t) && t > maxTs) maxTs = t;
      }
      if (maxTs > 0) {
        const latest = new Date(maxTs).toISOString().slice(0, 10);
        console.log('[WQ] latest record date (from data change):', latest);
        setMaxDateAvailable(prev => prev !== latest ? latest : prev);
      }
    } catch (e) {
      console.warn('[WQ] latest record date compute failed', e);
    }
  }, [data]);

  return (
    <div className="modern-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Water Quality Monitor</h1>
          <p className="dashboard-subtitle">
            {metrics.totalRecords.toLocaleString()} measurements · {metrics.sitesCount} sites · {
              meta?.date_range?.start && meta?.date_range?.end
                ? `${String(meta.date_range.start).slice(0,10)} → ${String(meta.date_range.end).slice(0,10)}`
                : (startDate && endDate
                    ? `${String(startDate).slice(0,10)} → ${String(endDate).slice(0,10)}`
                    : timeRange)
            } · {metrics.completeness}% completeness
          </p>
        </div>
          <div className="chart-controls">
          <button
            className={`btn ${activeView === 'overview' ? 'btn-primary' : 'btn-outline-primary'} btn-sm`}
            onClick={handleOverviewView}
          >
            <i className="bi bi-bar-chart me-1"></i> Overview
          </button>
          <button
            className={`btn ${activeView === 'details' ? 'btn-primary' : 'btn-outline-primary'} btn-sm`}
            onClick={handleDetailsView}
          >
            <i className="bi bi-table me-1"></i> Details
          </button>
          {/* Correlation view removed per request */}
          
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={handleRefresh}
            disabled={loading}
            title={loading ? 'Please wait for current operation to complete' : 'Refresh data'}
          >
            <i className={`bi ${loading ? 'bi-arrow-repeat' : 'bi-arrow-clockwise'} me-1`}></i> Refresh
          </button>
          <button
            className="btn btn-outline-primary btn-sm"
            onClick={() => setShowPresetSelector(true)}
            title="Manage presets"
          >
            <i className="bi bi-bookmark-star me-1"></i> Presets
          </button>
          <ExportButton
            data={data}
            filename={`water_quality_${selectedSites.join('_')}_${timeRange.toLowerCase().replace(/\s+/g, '_')}`}
            chartElementId="water-quality-chart"
            availableFormats={['csv', 'json', 'png', 'pdf']}
            variant="outline-success"
            size="sm"
            disabled={data.length === 0}
            onExportStart={() => console.log('Export started')}
            onExportComplete={(result) => console.log('Export completed:', result)}
            onExportError={(error) => console.error('Export failed:', error)}
            className="ms-2"
          />
          {/* Removed Prev/Next quick range controls per request */}
        </div>
      </div>

      {/* Unified Filter Sidebar (shared with Redox) */}
      <SidebarFilters
        collapsed={filtersCollapsed}
        onToggleCollapse={handleToggleFilters}
        selectedSites={selectedSites}
        onSiteChange={handleSiteChange}
        timeRange={timeRange}
        onTimeRangeChange={handleTimeRangeChange}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onApplyFilters={handleApplyFilters}
        loading={loading}
        maxDate={maxDateAvailable}
        minDate={minDateAvailable}
      />

      {/* Progressive Loading removed */}

      {/* Main Content */}
      <div className="main-content">
        <SimpleLoadingBar
          isVisible={loading}
          message={`Loading water quality data for ${selectedSites.length} site${selectedSites.length !== 1 ? 's' : ''}...`}
          stage="loading"
          compact={false}
          progress={null} // Keep indeterminate during loading
          current={data?.length || null}
          total={null}
          showPercentage={false}
          showCounts={false}
        />

        {/* Debug logging for empty state */}
        {console.log('[WQ Page] Render state:', { loading, error: !!error, dataLength: data?.length, hasData: data?.length > 0 })}

        {loading ? null : error ? (
          <EmptyState
            type="error"
            context={{
              errorMessage: error,
              onRetry: () => fetchData(),
              onReportIssue: () => toast.showInfo('Issue reporting functionality will be available soon', {
                title: 'Feature Coming Soon',
                duration: 4000
              })
            }}
          />
        ) : (!data || data.length === 0) ? (
          <EmptyState
            type="no-water-quality-data"
            context={emptyStateContext}
          />
        ) : (
          <>
            {/* Metrics Grid (hide on Details) */}
            {activeView !== "details" && (
            <DataLoadingErrorBoundary
              componentName="Water Quality Metrics"
              onRetry={() => fetchData()}
            >
              <div className="metrics-grid">
                <MetricCard
                  title="Total Measurements"
                  value={metrics.totalRecords.toLocaleString()}
                  icon="database"
                  context={`Data from ${metrics.sitesCount} monitoring sites`}
                  tooltip={`Count of all returned records across selected sites and time window. Each row = one timestamped measurement.`}
                />
                <MetricCard
                  title="Avg Temperature (across sites)"
                  value={metrics.perSiteAvgTemperature.toFixed(1)}
                  unit="°C"
                  icon="thermometer-half"
                  status={metrics.perSiteAvgTemperature > 20 ? 'warning' : metrics.perSiteAvgTemperature < 10 ? 'critical' : 'good'}
                  context={`Equal-weight mean across ${metrics.sitesCount} sites`}
                  tooltip={`Front: per‑site means averaged equally across all selected sites. Back: per‑site means.`}
                  flippable
                  backContent={(
                    <div style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr', padding: '8px', gap: 6 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Per-site Temperature</div>
                      <div style={{ display: 'grid', gap: 4, overflowY: 'auto', paddingRight: 2 }}>
                        {selectedSites.map(sc => {
                          const item = (metrics.breakdown?.t || [])?.find?.(x => x.site === sc);
                          const val = item ? item.mean.toFixed(1) : '-';
                          return (
                            <div key={`t-${sc}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                              <span style={{ fontWeight: 600, color: '#334155' }}>{sc}</span>
                              <span style={{ color: '#0f172a', fontWeight: 700 }}>{val}<span style={{ marginLeft: 4, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>°C</span></span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                />
                <MetricCard
                  title="Avg Conductivity (across sites)"
                  value={metrics.perSiteAvgConductivity.toFixed(0)}
                  unit="μS/cm"
                  icon="lightning"
                  status={metrics.perSiteAvgConductivity > 3000 ? 'warning' : 'good'}
                  context={`Equal-weight mean across ${metrics.sitesCount} sites`}
                  tooltip={`Front: per‑site means averaged equally across all selected sites. Back: per‑site means.`}
                  flippable
                  backContent={(
                    <div style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr', padding: '8px', gap: 6 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Per-site Conductivity</div>
                      <div style={{ display: 'grid', gap: 4, overflowY: 'auto', paddingRight: 2 }}>
                        {selectedSites.map(sc => {
                          const item = (metrics.breakdown?.c || [])?.find?.(x => x.site === sc);
                          const val = item ? item.mean.toFixed(0) : '-';
                          return (
                            <div key={`c-${sc}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                              <span style={{ fontWeight: 600, color: '#334155' }}>{sc}</span>
                              <span style={{ color: '#0f172a', fontWeight: 700 }}>{val}<span style={{ marginLeft: 4, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>μS/cm</span></span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                />
                <MetricCard
                  title="Avg Water Level (across sites)"
                  value={metrics.perSiteAvgWaterLevel.toFixed(2)}
                  unit="m"
                  icon="droplet-half"
                  status={'good'}
                  context={`Equal-weight mean across ${metrics.sitesCount} sites`}
                  tooltip={`Front: per‑site means averaged equally across all selected sites. Back: per‑site means.`}
                  flippable
                  backContent={(
                    <div style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr', padding: '8px', gap: 6 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Per-site Water Level</div>
                      <div style={{ display: 'grid', gap: 4, overflowY: 'auto', paddingRight: 2 }}>
                        {selectedSites.map(sc => {
                          const item = (metrics.breakdown?.w || [])?.find?.(x => x.site === sc);
                          const val = item ? item.mean.toFixed(2) : '-';
                          return (
                            <div key={`w-${sc}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                              <span style={{ fontWeight: 600, color: '#334155' }}>{sc}</span>
                              <span style={{ color: '#0f172a', fontWeight: 700 }}>{val}<span style={{ marginLeft: 4, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>m</span></span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                />
              </div>
            </DataLoadingErrorBoundary>
            )}

            {/* Chart Container (show on Overview and Correlation) */}
            {activeView !== "details" && (
            <div className="chart-container">
              <div className="chart-header">
                <div>
                  <p className="text-secondary" style={{ fontSize: '0.9rem', margin: 0 }}>
                    Showing {chartData.reduce((sum, series) => sum + series.x.length, 0)} points · {chartData.length} sites
                    {meta?.date_range?.start && meta?.date_range?.end ? (
                      <> · Actual {String(meta.date_range.start).slice(0,10)} → {String(meta.date_range.end).slice(0,10)}</>
                    ) : (
                      startDate && endDate ? (
                        <> · Actual {String(startDate).slice(0,10)} → {String(endDate).slice(0,10)}</>
                      ) : null
                    )}
                  </p>
                </div>
                <WaterQualityChartControls
                  selectedParameter={selectedParameter}
                  setSelectedParameter={setSelectedParameter}
                  chartType={chartType}
                  setChartType={setChartType}
                  compareMode={compareMode}
                  setCompareMode={setCompareMode}
                  compareParameter={compareParameter}
                  setCompareParameter={setCompareParameter}
                />
              </div>
              
            {activeView === 'overview' && (
              <ChartErrorBoundary
                chartType={`${chartType}-${selectedParameter}`}
                title={`${PARAMETER_CONFIG[selectedParameter]?.label} Trends`}
                dataLength={chartData.reduce((sum, series) => sum + (series?.x?.length || 0), 0)}
                onRetry={() => refetch()}
                onShowDataTable={() => setActiveView('details')}
                onDownloadData={() => log.info('[WQ] Download data requested')}
              >
                {(!Array.isArray(data) || data.length === 0) ? (
                  <div className="text-muted small" style={{ padding: '0.5rem 0', minHeight: 320 }}>No data to display for the selected filters.</div>
                ) : (
                  <VisibleOnView minHeight={320} rootMargin="200px">
                    <Suspense fallback={<div style={{ padding: 12 }}>Loading chart…</div>}>
                      <WaterQualityChartRouter
                        activeView={activeView}
                        chartData={chartData}
                        chartType={chartType}
                        selectedParameter={selectedParameter}
                        compareMode={compareMode}
                        compareParameter={compareParameter}
                        parameterConfig={PARAMETER_CONFIG}
                        alertShapes={alertShapes}
                        data={data}
                        onShowDataTable={() => setActiveView('details')}
                        onRetry={() => refetch()}
                      />
                    </Suspense>
                  </VisibleOnView>
                )}
              </ChartErrorBoundary>
            )}
            </div>
            )}

            {/* Details View */}
            {activeView === 'details' && (
              <Suspense fallback={<div style={{ padding: 12 }}>Loading table…</div>}>
                <TanStackDataTable
                  data={data}
                  columns={tableColumns}
                  title="Water Quality Data Analysis"
                  loading={loading}
                  exportFilename={`water_quality_${selectedSites.join('_')}_${timeRange.toLowerCase().replace(/\s+/g, '_')}`}
                  searchable={true}
                  sortable={true}
                  paginated={true}
                  pageSize={50}
                  className="compact water-quality-table"
                />
              </Suspense>
            )}

            {/* Correlation view removed per request */}
          </>
        )}
      </div>

      {/* Preset Selector Modal */}
      <PresetSelector
        show={showPresetSelector}
        onHide={() => setShowPresetSelector(false)}
        currentSettings={getCurrentSettings()}
        onApplyPreset={handleApplyPreset}
        onSettingsChange={(key, value) => {
          switch (key) {
            case 'selectedSites': setSelectedSites(value); break;
            case 'timeRange': setTimeRange(value); break;
            case 'startDate': setStartDate(value); break;
            case 'endDate': setEndDate(value); break;
            case 'selectedParameter': setSelectedParameter(value); break;
            case 'compareMode': setCompareMode(value); break;
            case 'compareParameter': setCompareParameter(value); break;
            case 'chartType': setChartType(value); break;
            case 'activeView': setActiveView(value); break;
            case 'filtersCollapsed': setFiltersCollapsed(value); break;
            default: break;
          }
        }}
      />
    </div>
  );
};

export default ModernWaterQuality;
