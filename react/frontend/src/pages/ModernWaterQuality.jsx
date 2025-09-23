import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

// Modern components
import MetricCard from '../components/modern/MetricCard';
const DataTable = lazy(() => import('../components/modern/DataTable'));
import EmptyState from '../components/modern/EmptyState';
import SidebarFilters from '../components/filters/SidebarFilters';
import ExportButton from '../components/ExportButton';
import { useToast } from '../components/modern/toastUtils';
import useWaterQualityQuery from '../hooks/useWaterQualityQuery';
const WaterQualityChartRouter = lazy(() => import('../components/water/WaterQualityChartRouter'));
import WaterQualityChartControls from '../components/water/WaterQualityChartControls';
import { log } from '../utils/log';

// Error boundaries and performance monitoring
import DataLoadingErrorBoundary from '../components/boundaries/DataLoadingErrorBoundary';
import ChartErrorBoundary from '../components/boundaries/ChartErrorBoundary';

// Existing services and hooks
import { getAlertsData } from '../services/api';

// Import modern layout styles
import '../styles/modern-layout.css';

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

  // Component State
  const [selectedSites, setSelectedSites] = useState(() => searchParams.get('sites')?.split(',') || ['S1', 'S2', 'S3']);
  const [timeRange, setTimeRange] = useState(() => searchParams.get('time_range') || 'Custom Range');
  const [startDate, setStartDate] = useState('2024-05-01');
  const [endDate, setEndDate] = useState('2024-05-31');
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [activeView, setActiveView] = useState('overview');
  const [chartType, setChartType] = useState(() => searchParams.get('chartType') || 'line');
  const [selectedParameter, setSelectedParameter] = useState(() => searchParams.get('param') || 'temperature_c');
  const [compareMode, setCompareMode] = useState(() => searchParams.get('mode') || 'off');
  const [compareParameter, setCompareParameter] = useState(() => searchParams.get('cmp') || 'conductivity_us_cm');
  const [maxDateAvailable, setMaxDateAvailable] = useState('');
  const [minDateAvailable, setMinDateAvailable] = useState('');

  // State -> URL Synchronization
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('sites', selectedSites.join(','));
    params.set('time_range', timeRange);
    params.set('param', selectedParameter);
    params.set('cmp', compareParameter);
    params.set('mode', compareMode);
    params.set('chartType', chartType);
    setSearchParams(params, { replace: true });
  }, [selectedSites, timeRange, selectedParameter, compareParameter, compareMode, chartType, setSearchParams]);

  // Data Fetching via React Query
  const { data, metadata, loading, error, refetch, isFetching } = useWaterQualityQuery({
    selectedSites,
    timeRange,
    startDate,
    endDate,
    selectedParameter,
    compareMode,
    compareParameter,
  });

  // Update available date range from metadata
  useEffect(() => {
    const start = metadata?.date_range?.start ? String(metadata.date_range.start).slice(0, 10) : '';
    const end = metadata?.date_range?.end ? String(metadata.date_range.end).slice(0, 10) : '';
    if (start) setMinDateAvailable(start);
    if (end) setMaxDateAvailable(end);
  }, [metadata]);

  const tableColumns = useMemo(() => {
    const base = [
      { key: 'measurement_timestamp', label: 'Timestamp', format: (v) => v ? new Date(v).toLocaleString() : '-' },
      { key: 'site_code', label: 'Site' },
      { key: 'temperature_c', label: 'Temperature (°C)', format: (v) => (v ?? null) == null ? '-' : Number(v).toFixed(2) },
      { key: 'conductivity_us_cm', label: 'Conductivity (µS/cm)', format: (v) => (v ?? null) == null ? '-' : Number(v).toFixed(1) },
      { key: 'water_level_m', label: 'Water Level (m)', format: (v) => (v ?? null) == null ? '-' : Number(v).toFixed(3) },
      { key: 'dissolved_oxygen_mg_l', label: 'Dissolved O₂ (mg/L)', format: (v) => (v ?? null) == null ? '-' : Number(v).toFixed(2) }
    ];
    if (!Array.isArray(data) || data.length === 0) return base.slice(0, 5);
    const hasKey = (k) => data.some(row => row != null && row[k] != null);
    return base.filter(col => hasKey(col.key));
  }, [data]);

  const metrics = useMemo(() => {
    if (!data.length) return { totalRecords: 0, sitesCount: 0, perSiteAvgTemperature: 0, perSiteAvgConductivity: 0, perSiteAvgWaterLevel: 0, completeness: 0 };

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
      if (vals.t.length) { const m = vals.t.reduce((a, v) => a + v, 0) / vals.t.length; siteMeans.t.push(m); siteMeans.breakdown.t.push({ site, mean: m }); }
      if (vals.c.length) { const m = vals.c.reduce((a, v) => a + v, 0) / vals.c.length; siteMeans.c.push(m); siteMeans.breakdown.c.push({ site, mean: m }); }
      if (vals.w.length) { const m = vals.w.reduce((a, v) => a + v, 0) / vals.w.length; siteMeans.w.push(m); siteMeans.breakdown.w.push({ site, mean: m }); }
    }

    const mean = arr => arr.length ? arr.reduce((a, v) => a + v, 0) / arr.length : 0;
    const nonNullCounts = { t: 0, c: 0, w: 0 };
    for (const row of data) {
      if (row.temperature_c != null) nonNullCounts.t++;
      if (row.conductivity_us_cm != null) nonNullCounts.c++;
      if (row.water_level_m != null) nonNullCounts.w++;
    }
    const completeness = Math.round(((nonNullCounts.t + nonNullCounts.c + nonNullCounts.w) / (data.length * 3)) * 100);

    return { totalRecords: data.length, sitesCount: bySite.size, perSiteAvgTemperature: mean(siteMeans.t), perSiteAvgConductivity: mean(siteMeans.c), perSiteAvgWaterLevel: mean(siteMeans.w), completeness, breakdown: siteMeans.breakdown };
  }, [data]);

  const chartData = useMemo(() => {
    if (!data.length) return [];
    const largeDataset = data.length > 10000;
    const useWebGL = chartType !== 'bar' && largeDataset;
    const bySite = {};
    const colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd'];

    for (const d of data) {
      const site = d.site_code;
      const x = d.measurement_timestamp;
      const y = d[selectedParameter];
      if (y == null) continue;
      if (!bySite[site]) {
        bySite[site] = { x: [], y: [], name: `Site ${site}`, type: chartType === 'bar' ? 'bar' : (useWebGL ? 'scattergl' : 'scatter') };
      }
      bySite[site].x.push(x);
      bySite[site].y.push(y);
    }

    const tracesPrimary = Object.values(bySite).map((t, index) => ({ ...t, mode: chartType === 'line' ? 'lines' : 'markers', line: chartType !== 'bar' ? { width: largeDataset ? 1 : 2, color: colors[index % colors.length] } : undefined, marker: chartType !== 'bar' ? { size: largeDataset ? 3 : 6, color: colors[index % colors.length] } : undefined, hoverinfo: 'x+y+name', connectgaps: false, simplify: true }));

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
      const tracesSecondary = Object.values(cmpBySite).map((t) => ({ ...t, mode: chartType === 'line' ? 'lines' : 'markers', yaxis: 'y2', line: chartType === 'line' ? { color: '#a78bfa', width: largeDataset ? 1 : 2, dash: 'dot' } : undefined, marker: chartType !== 'bar' ? { size: largeDataset ? 3 : 5, color: '#a78bfa' } : undefined }));
      return [...tracesPrimary, ...tracesSecondary];
    }

    return tracesPrimary;
  }, [data, selectedParameter, chartType, compareMode, compareParameter]);

  const [alertShapes, setAlertShapes] = useState([]);
  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const res = await getAlertsData({ sites: selectedSites, time_range: timeRange });
        const shapes = (res?.active_alerts || []).map(a => ({ type: 'line', x0: a.created_at, x1: a.created_at, yref: 'paper', y0: 0, y1: 1, line: { color: a.severity === 'critical' ? '#ef4444' : a.severity === 'high' ? '#f59e0b' : '#94a3b8', width: 1, dash: 'dot' }, opacity: 0.7 }));
        setAlertShapes(shapes);
      } catch (e) { console.warn('[WQ] Failed to load alerts (ignored)', e); }
    };
    loadAlerts();
  }, [selectedSites, timeRange]);

  const handleRefresh = useCallback(() => { if (!isFetching) refetch(); }, [isFetching, refetch]);

  const emptyStateContext = { onSiteChange: setSelectedSites, onTimeRangeChange: setTimeRange, onResetFilters: () => { setSelectedSites(['S1', 'S2']); setTimeRange('Last 30 Days'); }, onSelectAllSites: () => { setSelectedSites(['S1', 'S2', 'S3', 'S4']); }, onUpload: () => navigate('/upload'), tips: ['Try selecting different monitoring sites', 'Extend the time range to find more data', 'Check if data collection is active for your sites'] };

  return (
    <div className="modern-dashboard">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Water Quality Monitor</h1>
          <p className="dashboard-subtitle">
            {metrics.totalRecords.toLocaleString()} measurements · {metrics.sitesCount} sites · {
              metadata?.date_range?.start && metadata?.date_range?.end
                ? `${String(metadata.date_range.start).slice(0,10)} → ${String(metadata.date_range.end).slice(0,10)}`
                : (startDate && endDate ? `${String(startDate).slice(0,10)} → ${String(endDate).slice(0,10)}` : timeRange)
            } · {metrics.completeness}% completeness
          </p>
        </div>
        <div className="chart-controls">
          <button className={`btn ${activeView === 'overview' ? 'btn-primary' : 'btn-outline-primary'} btn-sm`} onClick={() => setActiveView('overview')}><i className="bi bi-bar-chart me-1"></i> Overview</button>
          <button className={`btn ${activeView === 'details' ? 'btn-primary' : 'btn-outline-primary'} btn-sm`} onClick={() => setActiveView('details')}><i className="bi bi-table me-1"></i> Details</button>
          <button className="btn btn-outline-secondary btn-sm" onClick={handleRefresh} disabled={isFetching} title={isFetching ? 'Refreshing data...' : 'Refresh data'}>
            <i className={`bi ${isFetching ? 'bi-arrow-repeat' : 'bi-arrow-clockwise'} me-1`}></i> Refresh
          </button>
          <ExportButton data={data} filename={`water_quality_${selectedSites.join('_')}_${timeRange.toLowerCase().replace(/\s+/g, '_')}`} chartElementId="water-quality-chart" availableFormats={['csv', 'json', 'png', 'pdf']} variant="outline-success" size="sm" disabled={data.length === 0} />
        </div>
      </div>

      <SidebarFilters collapsed={filtersCollapsed} onToggleCollapse={() => setFiltersCollapsed(!filtersCollapsed)} selectedSites={selectedSites} onSiteChange={setSelectedSites} timeRange={timeRange} onTimeRangeChange={setTimeRange} startDate={startDate} endDate={endDate} onStartDateChange={setStartDate} onEndDateChange={setEndDate} onApplyFilters={refetch} loading={isFetching} maxDate={maxDateAvailable} minDate={minDateAvailable} />

      <div className="main-content">
        {loading ? (
          <EmptyState type="loading" title="Loading Water Quality Data" description="Analyzing measurements from your selected monitoring sites..." />
        ) : error ? (
          <EmptyState type="error" context={{ errorMessage: error, onRetry: refetch, onReportIssue: () => toast.showInfo('Issue reporting is coming soon') }} />
        ) : data.length === 0 ? (
          <EmptyState type="no-water-quality-data" context={emptyStateContext} />
        ) : (
          <>
            {activeView !== "details" && (
              <DataLoadingErrorBoundary componentName="Water Quality Metrics" onRetry={refetch}>
                <div className="metrics-grid">
                  <MetricCard title="Total Measurements" value={metrics.totalRecords.toLocaleString()} icon="database" context={`Data from ${metrics.sitesCount} monitoring sites`} />
                  <MetricCard title="Avg Temperature" value={metrics.perSiteAvgTemperature.toFixed(1)} unit="°C" icon="thermometer-half" status={metrics.perSiteAvgTemperature > 20 ? 'warning' : 'good'} context={`Equal-weight mean across ${metrics.sitesCount} sites`} flippable backContent={<div>Per-site means...</div>} />
                  <MetricCard title="Avg Conductivity" value={metrics.perSiteAvgConductivity.toFixed(0)} unit="μS/cm" icon="lightning" status={metrics.perSiteAvgConductivity > 3000 ? 'warning' : 'good'} context={`Equal-weight mean across ${metrics.sitesCount} sites`} flippable backContent={<div>Per-site means...</div>} />
                  <MetricCard title="Avg Water Level" value={metrics.perSiteAvgWaterLevel.toFixed(2)} unit="m" icon="droplet-half" status={'good'} context={`Equal-weight mean across ${metrics.sitesCount} sites`} flippable backContent={<div>Per-site means...</div>} />
                </div>
              </DataLoadingErrorBoundary>
            )}

            {activeView !== "details" && (
              <div className="chart-container">
                <div className="chart-header">
                  <div><p className="text-secondary" style={{ fontSize: '0.9rem', margin: 0 }}>Showing {chartData.reduce((sum, series) => sum + series.x.length, 0)} points</p></div>
                  <WaterQualityChartControls selectedParameter={selectedParameter} setSelectedParameter={setSelectedParameter} chartType={chartType} setChartType={setChartType} compareMode={compareMode} setCompareMode={setCompareMode} compareParameter={compareParameter} setCompareParameter={setCompareParameter} />
                </div>
                {activeView === 'overview' && (
                  <ChartErrorBoundary chartType={`${chartType}-${selectedParameter}`} title={`${PARAMETER_CONFIG[selectedParameter]?.label} Trends`} dataLength={chartData.reduce((sum, series) => sum + (series?.x?.length || 0), 0)} onRetry={refetch} onShowDataTable={() => setActiveView('details')}>
                    <Suspense fallback={<div>Loading chart…</div>}>
                      <WaterQualityChartRouter activeView={activeView} chartData={chartData} chartType={chartType} selectedParameter={selectedParameter} compareMode={compareMode} compareParameter={compareParameter} parameterConfig={PARAMETER_CONFIG} alertShapes={alertShapes} data={data} onShowDataTable={() => setActiveView('details')} onRetry={refetch} />
                    </Suspense>
                  </ChartErrorBoundary>
                )}
              </div>
            )}

            {activeView === 'details' && (
              <Suspense fallback={<div>Loading table…</div>}>
                <DataTable data={data} columns={tableColumns} title="Water Quality Data Analysis" loading={isFetching} exportFilename={`water_quality_${selectedSites.join('_')}_${timeRange.toLowerCase().replace(/\s+/g, '_')}`} searchable={true} sortable={true} paginated={true} pageSize={50} className="compact water-quality-table" />
              </Suspense>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ModernWaterQuality;