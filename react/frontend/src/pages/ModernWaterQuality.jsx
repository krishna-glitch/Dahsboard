import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

// Modern components
import MetricCard from '../components/modern/MetricCard';
const TanStackDataTable = lazy(() => import('../components/modern/TanStackDataTable'));
import EmptyState from '../components/modern/EmptyState';
import SidebarFilters from '../components/filters/SidebarFilters';
import ExportButton from '../components/ExportButton';
import { useToast } from '../components/modern/toastUtils';
import useWaterQualityQuery from '../hooks/useWaterQualityQuery';
import { useWaterQualityMetrics } from '../hooks/useWaterQualityMetrics';
import { useWaterQualityChartData } from '../hooks/useWaterQualityChartData';
const WaterQualityChartRouter = lazy(() => import('../components/water/WaterQualityChartRouter'));
import WaterQualityChartControls from '../components/water/WaterQualityChartControls';

// Error boundaries and performance monitoring
import DataLoadingErrorBoundary from '../components/boundaries/DataLoadingErrorBoundary';
import ChartErrorBoundary from '../components/boundaries/ChartErrorBoundary';

// Existing services and hooks
import { getAlertsData } from '../services/api';

// Import modern layout styles
import '../styles/modern-layout.css';
import styles from '../styles/ModernWaterQuality.module.css';

// ---- Defaults / Config ----
const DEFAULT_SITES = ['S1', 'S2', 'S3'];
const DEFAULT_RANGE = 'Last 30 Days';

// Static parameter configuration - moved outside component to prevent recreation
const PARAMETER_CONFIG = {
  temperature_c: {
    label: 'Temperature',
    unit: '°C',
    icon: 'thermometer-half',
    color: '#ff6b35'
  },
  conductivity_us_cm: {
    label: 'Conductivity',
    unit: 'μS/cm',
    icon: 'lightning',
    color: '#4ecdc4'
  },
  water_level_m: {
    label: 'Water Level',
    unit: 'm',
    icon: 'droplet-half',
    color: '#45b7d1'
  }
};

/**
 * Modern Water Quality Dashboard
 * Complete rewrite with modern layout and UX patterns
 */
const ModernWaterQuality = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  // ---- Validators ----
  const validateSites = (sitesParam) => {
    if (!sitesParam) return DEFAULT_SITES;
    const validatedSites = sitesParam
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z0-9_]{1,10}$/.test(s))
      .slice(0, 10);
    return validatedSites.length > 0 ? validatedSites : DEFAULT_SITES;
  };

  const validateTimeRange = (timeRangeParam) => {
    const validRanges = ['Last 24 Hours', 'Last 7 Days', 'Last 30 Days', 'Last 90 Days', 'Custom Range'];
    return validRanges.includes(timeRangeParam) ? timeRangeParam : DEFAULT_RANGE;
  };

  const validateChartType = (chartTypeParam) => {
    const validTypes = ['line', 'scatter', 'bar'];
    return validTypes.includes(chartTypeParam) ? chartTypeParam : 'line';
  };

  const validateParameter = (paramParam) => {
    const validParams = ['temperature_c', 'conductivity_us_cm', 'water_level_m'];
    return validParams.includes(paramParam) ? paramParam : 'temperature_c';
  };

  const validateCompareMode = (modeParam) => {
    const validModes = ['off', 'overlay', 'side-by-side'];
    return validModes.includes(modeParam) ? modeParam : 'off';
  };

  // ---- Component State ----
  const [selectedSites, setSelectedSites] = useState(() => validateSites(searchParams.get('sites')));
  const [timeRange, setTimeRange] = useState(() => validateTimeRange(searchParams.get('time_range')));
  // Leave custom dates empty unless user picks "Custom Range"
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [activeView, setActiveView] = useState('overview');
  const [chartType, setChartType] = useState(() => validateChartType(searchParams.get('chartType')));
  const [selectedParameter, setSelectedParameter] = useState(() => validateParameter(searchParams.get('param')));
  const [compareMode, setCompareMode] = useState(() => validateCompareMode(searchParams.get('mode')));
  const [compareParameter, setCompareParameter] = useState(() => validateParameter(searchParams.get('cmp')));
  const [maxDateAvailable, setMaxDateAvailable] = useState('');
  const [minDateAvailable, setMinDateAvailable] = useState('');

  // ---- Data Fetch via React Query (single call) ----
  const {
    data: rows = [],
    metadata = null,
    loading = false,
    error = null,
    refetch,
    isFetching = false
  } =
    useWaterQualityQuery({
      selectedSites,
      timeRange,
      startDate,
      endDate,
      selectedParameter,
      compareMode,
      compareParameter
    }) || {};

  // ---- URL sync + metadata range ----
  // URL sync effect - separate from metadata effect to avoid infinite loops
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('sites', selectedSites.join(','));
    params.set('time_range', timeRange);
    params.set('param', selectedParameter);
    params.set('cmp', compareParameter);
    params.set('mode', compareMode);
    params.set('chartType', chartType);
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedSites,
    timeRange,
    selectedParameter,
    compareParameter,
    compareMode,
    chartType
    // setSearchParams intentionally omitted to prevent infinite loop
  ]);

  // Metadata date range effect - separate to avoid infinite loops
  useEffect(() => {
    const formatDate = (dateString) => {
      if (!dateString) return '';
      const d = new Date(dateString);
      return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
    };

    if (metadata?.date_range) {
      const start = metadata.date_range.start ? formatDate(metadata.date_range.start) : '';
      const end = metadata.date_range.end ? formatDate(metadata.date_range.end) : '';
      setMinDateAvailable((prev) => (start && start !== prev ? start : prev));
      setMaxDateAvailable((prev) => (end && end !== prev ? end : prev));
    }
  }, [metadata?.date_range]); // Only depend on the actual date range data

  // ---- Table columns ----
  const tableColumns = useMemo(() => {
    const base = [
      {
        key: 'measurement_timestamp',
        label: 'Timestamp',
        format: (v) => (v ? new Date(v).toLocaleString() : '-')
      },
      { key: 'site_code', label: 'Site' },
      {
        key: 'temperature_c',
        label: 'Temperature (°C)',
        format: (v) => ((v ?? null) == null ? '-' : Number(v).toFixed(2))
      },
      {
        key: 'conductivity_us_cm',
        label: 'Conductivity (µS/cm)',
        format: (v) => ((v ?? null) == null ? '-' : Number(v).toFixed(1))
      },
      {
        key: 'water_level_m',
        label: 'Water Level (m)',
        format: (v) => ((v ?? null) == null ? '-' : Number(v).toFixed(3))
      }
    ];
    if (!Array.isArray(rows) || rows.length === 0) return base.slice(0, 5);
    const hasKey = (k) => rows.some((row) => row != null && row[k] != null);
    return base.filter((col) => hasKey(col.key));
  }, [rows]);

  // ---- Metrics & ChartData ----
  const metrics = useWaterQualityMetrics(rows);
  const chartData = useWaterQualityChartData(
    rows,
    selectedParameter,
    chartType,
    compareMode,
    compareParameter
  );

  // ---- Alerts (vertical lines) ----
  const [alertShapes, setAlertShapes] = useState([]);
  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const res = await getAlertsData({ sites: selectedSites, time_range: timeRange });
        const shapes = (res?.active_alerts || []).map((a) => ({
          type: 'line',
          x0: a.created_at,
          x1: a.created_at,
          yref: 'paper',
          y0: 0,
          y1: 1,
          line: {
            color: a.severity === 'critical' ? '#ef4444' : a.severity === 'high' ? '#f59e0b' : '#94a3b8',
            width: 1,
            dash: 'dot'
          },
          opacity: 0.7
        }));
        setAlertShapes(shapes);
      } catch (e) {
        console.warn('[WQ] Failed to load alerts (ignored)', e);
      }
    };
    loadAlerts();
  }, [selectedSites, timeRange]);

  const handleRefresh = useCallback(() => {
    if (!isFetching) refetch();
  }, [isFetching, refetch]);

  const emptyStateContext = {
    onSiteChange: setSelectedSites,
    onTimeRangeChange: setTimeRange,
    onResetFilters: () => {
      setSelectedSites(DEFAULT_SITES);
      setTimeRange(DEFAULT_RANGE);
      setStartDate('');
      setEndDate('');
    },
    onSelectAllSites: () => {
      setSelectedSites(['S1', 'S2', 'S3', 'S4']);
    },
    onUpload: () => navigate('/upload'),
    tips: [
      'Try selecting different monitoring sites',
      'Extend the time range to find more data',
      'Check if data collection is active for your sites'
    ]
  };

  const totalPoints = (chartData ?? []).reduce(
    (sum, series) => sum + ((series?.x?.length) || 0),
    0
  );

  const formatSummaryDate = useCallback((value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }, []);

  const chartTimeframeLabel = useMemo(() => {
    const start = metadata?.date_range?.start;
    const end = metadata?.date_range?.end;

    if (start && end) {
      return `${formatSummaryDate(start)} → ${formatSummaryDate(end)}`;
    }

    if (timeRange === 'Custom Range' && startDate && endDate) {
      return `${formatSummaryDate(startDate)} → ${formatSummaryDate(endDate)}`;
    }

    return timeRange;
  }, [metadata?.date_range?.start, metadata?.date_range?.end, timeRange, startDate, endDate, formatSummaryDate]);

  const chartSummaryItems = useMemo(() => {
    const items = [];
    items.push(`${totalPoints.toLocaleString()} observations`);

    const siteCount = metrics?.sitesCount || selectedSites.length;
    items.push(`${siteCount} site${siteCount === 1 ? '' : 's'}`);

    const parameterDetails = PARAMETER_CONFIG[selectedParameter] || {};
    const parameterLabel = parameterDetails.label || selectedParameter;
    const parameterUnit = parameterDetails.unit ? ` (${parameterDetails.unit})` : '';
    items.push(`${parameterLabel}${parameterUnit}`);

    if (chartTimeframeLabel) {
      items.push(chartTimeframeLabel);
    }

    if (compareMode !== 'off') {
      const compareDetails = PARAMETER_CONFIG[compareParameter] || {};
      const compareLabel = compareDetails.label || compareParameter;
      items.push(`${compareMode === 'overlay' ? 'Overlay' : 'Side by Side'} vs ${compareLabel}`);
    }

    return items.filter(Boolean);
  }, [totalPoints, metrics?.sitesCount, selectedSites, selectedParameter, compareMode, compareParameter, chartTimeframeLabel]);

  const dateSpan =
    metadata?.date_range?.start && metadata?.date_range?.end
      ? `${String(metadata.date_range.start).slice(0, 10)} → ${String(metadata.date_range.end).slice(0, 10)}`
      : startDate && endDate
      ? `${String(startDate).slice(0, 10)} → ${String(endDate).slice(0, 10)}`
      : timeRange;

  return (
    <div className="modern-dashboard">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Water Quality Monitor</h1>
          <p className="dashboard-subtitle">
            {metrics.totalRecords.toLocaleString()} measurements · {metrics.sitesCount} sites · {dateSpan} ·{' '}
            {metrics.completeness}% completeness
          </p>
        </div>
        <div className="chart-controls">
          <button
            className={`btn ${activeView === 'overview' ? 'btn-primary' : 'btn-outline-primary'} btn-sm`}
            onClick={() => setActiveView('overview')}
          >
            <i className="bi bi-bar-chart me-1"></i> Overview
          </button>
          <button
            className={`btn ${activeView === 'details' ? 'btn-primary' : 'btn-outline-primary'} btn-sm`}
            onClick={() => setActiveView('details')}
          >
            <i className="bi bi-table me-1"></i> Details
          </button>
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={handleRefresh}
            disabled={isFetching}
            title={isFetching ? 'Refreshing data...' : 'Refresh data'}
          >
            <i className={`bi ${isFetching ? 'bi-arrow-repeat' : 'bi-arrow-clockwise'} me-1`}></i> Refresh
          </button>
          <ExportButton
            data={rows}
            filename={`water_quality_${selectedSites.join('_')}_${timeRange.toLowerCase().replace(/\s+/g, '_')}`}
            chartElementId="water-quality-chart"
            availableFormats={['csv', 'json', 'png', 'pdf']}
            variant="outline-success"
            size="sm"
            disabled={rows.length === 0}
            activeView={activeView}
          />
        </div>
      </div>

      <SidebarFilters
        collapsed={filtersCollapsed}
        onToggleCollapse={() => setFiltersCollapsed(!filtersCollapsed)}
        selectedSites={selectedSites}
        onSiteChange={setSelectedSites}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onApplyFilters={refetch}
        loading={isFetching}
        maxDate={maxDateAvailable}
        minDate={minDateAvailable}
      />

      <div className="main-content">
        {loading ? (
          <EmptyState
            type="loading"
            title="Loading Water Quality Data"
            description="Analyzing measurements from your selected monitoring sites..."
          />
        ) : error ? (
          <EmptyState
            type="error"
            context={{
              errorMessage: error?.message ?? String(error ?? 'Unknown error'),
              onRetry: refetch,
              onReportIssue: () => toast.showInfo('Issue reporting is coming soon')
            }}
          />
        ) : rows.length === 0 ? (
          <EmptyState type="no-water-quality-data" context={emptyStateContext} />
        ) : (
          <>
            {activeView !== 'details' && (
              <DataLoadingErrorBoundary componentName="Water Quality Metrics" onRetry={refetch}>
                <div className="metrics-grid">
                  <MetricCard
                    key="total-measurements"
                    title="Total Measurements"
                    value={metrics.totalRecords.toLocaleString()}
                    icon="database"
                    context={`Data from ${metrics.sitesCount} monitoring sites`}
                  />
                  <MetricCard
                    key="avg-temperature"
                    title="Avg Temperature"
                    value={metrics.perSiteAvgTemperature.toFixed(1)}
                    unit="°C"
                    icon="thermometer-half"
                    status={metrics.perSiteAvgTemperature > 20 ? 'warning' : 'good'}
                    context={`Equal-weight mean across ${metrics.sitesCount} sites`}
                    flippable
                    backContent={
                      <div className={styles.flipContent}>
                        <h5 className={styles.flipTitle}>Per-Site Avg. Temperature</h5>
                        <ul className={styles.flipList}>
                          {metrics.breakdown.t.map((item) => (
                            <li key={item.site} className={styles.flipRow}>
                              <span className={styles.flipSite}>{item.site}</span>
                              <span className={styles.flipValue}>
                                {item.mean.toFixed(1)}
                                <span className={styles.flipUnit}>°C</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    }
                  />
                  <MetricCard
                    key="avg-conductivity"
                    title="Avg Conductivity"
                    value={metrics.perSiteAvgConductivity.toFixed(0)}
                    unit="μS/cm"
                    icon="lightning"
                    status={metrics.perSiteAvgConductivity > 3000 ? 'warning' : 'good'}
                    context={`Equal-weight mean across ${metrics.sitesCount} sites`}
                    flippable
                    backContent={
                      <div className={styles.flipContent}>
                        <h5 className={styles.flipTitle}>Per-Site Avg. Conductivity</h5>
                        <ul className={styles.flipList}>
                          {metrics.breakdown.c.map((item) => (
                            <li key={item.site} className={styles.flipRow}>
                              <span className={styles.flipSite}>{item.site}</span>
                              <span className={styles.flipValue}>
                                {item.mean.toFixed(0)}
                                <span className={styles.flipUnit}>μS/cm</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    }
                  />
                  <MetricCard
                    key="avg-water-level"
                    title="Avg Water Level"
                    value={metrics.perSiteAvgWaterLevel.toFixed(2)}
                    unit="m"
                    icon="droplet-half"
                    status={'good'}
                    context={`Equal-weight mean across ${metrics.sitesCount} sites`}
                    flippable
                    backContent={
                      <div className={styles.flipContent}>
                        <h5 className={styles.flipTitle}>Per-Site Avg. Water Level</h5>
                        <ul className={styles.flipList}>
                          {metrics.breakdown.w.map((item) => (
                            <li key={item.site} className={styles.flipRow}>
                              <span className={styles.flipSite}>{item.site}</span>
                              <span className={styles.flipValue}>
                                {item.mean.toFixed(2)}
                                <span className={styles.flipUnit}>m</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    }
                  />
                </div>
              </DataLoadingErrorBoundary>
            )}

            {activeView !== 'details' && (
              <div className="chart-container">
                <div className="chart-header">
                  <div>
                    <div className="chart-summary" aria-live="polite">
                      {chartSummaryItems.map((item, index) => (
                        <span key={`${item}-${index}`} className="chart-summary-item">
                          {item}
                        </span>
                      ))}
                    </div>
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
                    dataLength={totalPoints}
                    onRetry={refetch}
                    onShowDataTable={() => setActiveView('details')}
                  >
                    <Suspense fallback={<div>Loading chart…</div>}>
                      <WaterQualityChartRouter
                        activeView={activeView}
                        chartData={chartData}
                        chartType={chartType}
                        selectedParameter={selectedParameter}
                        compareMode={compareMode}
                        compareParameter={compareParameter}
                        parameterConfig={PARAMETER_CONFIG}
                        alertShapes={alertShapes}
                        data={rows}
                        summaryItems={chartSummaryItems}
                        onShowDataTable={() => setActiveView('details')}
                        onRetry={refetch}
                      />
                    </Suspense>
                  </ChartErrorBoundary>
                )}
                <p className="chart-description">
                  Time series of selected water quality parameter(s) by site over the chosen date range.
                </p>
              </div>
            )}

            {activeView === 'details' && (
              <Suspense fallback={<div>Loading table…</div>}>
                <TanStackDataTable
                  data={rows}
                  columns={tableColumns}
                  title="Water Quality Data Analysis"
                  loading={isFetching}
                  exportFilename={`water_quality_${selectedSites.join('_')}_${timeRange
                    .toLowerCase()
                    .replace(/\s+/g, '_')}`}
                  searchable={true}
                  sortable={true}
                  paginated={true}
                  pageSize={50}
                  className="compact water-quality-table"
                />
              </Suspense>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ModernWaterQuality;
