import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Plot from 'react-plotly.js';
import { useSearchParams } from 'react-router-dom';
import MetricCard from '../components/modern/MetricCard';
import EmptyState from '../components/modern/EmptyState';
import ExportButton from '../components/ExportButton';
import { useToast } from '../components/modern/toastUtils';
import PerSiteCharts from '../components/comparison/PerSiteCharts';
import { getSiteComparisonData, getAvailableSites, getWaterQualityData, getRedoxAnalysisData } from '../services/api';
import { EXPORT_FORMATS, performExport } from '../utils/exporters';
import { SITE_COLORS, METRIC_THRESHOLDS } from '../constants/appConstants';
import '../styles/modern-layout.css';

/**
 * Modern Site Comparison Page - Site Analysis and Comparison
 * Uses design system tokens and modern layout patterns
 */

const ModernSiteComparison = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [error, setError] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);
  const [availableSites, setAvailableSites] = useState([]);
  const [selectedSites, setSelectedSites] = useState(['S1', 'S2', 'S3']);
  const [selectedMetric, setSelectedMetric] = useState('conductivity');
  const [timeRange, setTimeRange] = useState('7d');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [sortKey, setSortKey] = useState('currentValue'); // or 'change24h'
  const [sortDir, setSortDir] = useState('desc'); // 'asc' or 'desc'
  const [groupBy, setGroupBy] = useState('none'); // 'none' | 'status'
  const [comparePrev, setComparePrev] = useState(false);
  const [prevComparisonData, setPrevComparisonData] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [seriesMode, setSeriesMode] = useState('water_quality'); // 'water_quality' | 'redox'
  const [selectedDepth, setSelectedDepth] = useState(100); // cm for redox
  const [seriesTraces, setSeriesTraces] = useState([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesError, setSeriesError] = useState(null);
  const [exportFormat, setExportFormat] = useState(EXPORT_FORMATS.PNG);
  const [chartViewMode, setChartViewMode] = useState('overlay'); // 'overlay' or 'per-site'
  
  // NEW: Analysis mode state
  const [analysisMode, setAnalysisMode] = useState('concurrent'); // 'concurrent' or 'full_period'
  const [concurrentWindowHours, setConcurrentWindowHours] = useState(24); // Default 24-hour window
  
  // Toast notifications (destructure stable callbacks to avoid re-renders)
  // Toasts disabled for comparison page to reduce noise; rely on in-page alerts

  // Water Quality + Redox parameters
  const availableMetrics = useMemo(() => [
    { id: 'water_level', name: 'Water Level', unit: 'm', icon: 'water' },
    { id: 'temperature', name: 'Temperature', unit: '°C', icon: 'thermometer' },
    { id: 'conductivity', name: 'Conductivity', unit: 'µS/cm', icon: 'lightning' },
    { id: 'redox', name: 'Redox (Eh)', unit: 'mV', icon: 'battery-charging' },
  ], []);

  // Fetch available sites
  const fetchAvailableSites = useCallback(async () => {
    try {
      setSitesLoading(true);
      const response = await getAvailableSites();
      
      if (response && response.sites && response.sites.length > 0) {
        setAvailableSites(prev => {
          const prevIds = Array.isArray(prev) ? prev.map(s => s.id).join(',') : '';
          const nextIds = response.sites.map(s => s.id).join(',');
          if (prevIds === nextIds) return prev; // no change, avoid re-render/log spam
          console.log(`✅ Loaded ${response.sites.length} available sites`);
          return response.sites;
        });
        
        // Update selected sites to only include ones that exist
        setSelectedSites(prev => {
          const validSites = prev.filter(siteId => 
            response.sites.some(site => site.id === siteId)
          );
          const next = validSites.length > 0 ? validSites : [response.sites[0].id];
          const same = prev.length === next.length && prev.every((v,i)=>v===next[i]);
          return same ? prev : next;
        });
      } else {
        console.warn('No sites data available');
        setAvailableSites([]);
      }
    } catch (err) {
      console.error('Failed to fetch available sites:', err);
      toast.showError('Failed to load available sites', { title: 'Sites Load Failed' });
      // Fallback to default sites
      setAvailableSites([
        { id: 'S1', name: 'Site 1', location: 'Location 1', status: 'active' },
        { id: 'S2', name: 'Site 2', location: 'Location 2', status: 'active' },
        { id: 'S3', name: 'Site 3', location: 'Location 3', status: 'active' }
      ]);
    } finally {
      setSitesLoading(false);
    }
  }, [toast]);

  // Fetch comparison data
  const fetchComparisonData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // In-page loading; avoid extra loading toasts

      const params = {
        sites: selectedSites,
        metric: selectedMetric,
        time_range: timeRange === 'custom' ? 'custom' : timeRange,
        data_type: 'water_quality',
        include_spark: 'true',
        // NEW: Analysis mode parameters
        analysis_mode: analysisMode,
        concurrent_window_hours: concurrentWindowHours
      };

      // Add custom date range if selected
      if (timeRange === 'custom' && customStartDate && customEndDate) {
        params.start_date = customStartDate;
        params.end_date = customEndDate;
      }

      const data = await getSiteComparisonData(params);
      setComparisonData(data);

      // Load previous period if enabled and we have current window bounds
      if (comparePrev && data?.metadata?.start && data?.metadata?.end) {
        const start = new Date(data.metadata.start);
        const end = new Date(data.metadata.end);
        const durationMs = Math.max(1, end.getTime() - start.getTime());
        const prevEnd = new Date(start.getTime() - 1);
        const prevStart = new Date(prevEnd.getTime() - durationMs);
        const prevParams = {
          ...params,
          time_range: 'custom',
          start_date: prevStart.toISOString(),
          end_date: prevEnd.toISOString()
        };
        try {
          const prev = await getSiteComparisonData(prevParams);
          setPrevComparisonData(prev);
        } catch (e) {
          console.warn('Previous period fetch failed:', e);
          setPrevComparisonData(null);
        }
      } else {
        setPrevComparisonData(null);
      }
      
      // Avoid success/warning toasts; rely on in-page states and empty state

      // No loading toast to clear
    } catch (err) {
      console.error('Site comparison fetch error:', err);
      setError(`Failed to load site comparison data: ${err.message}`);
      // Avoid error toast; in-page alert displays error with retry
    } finally {
      setLoading(false);
    }
  }, [selectedSites, selectedMetric, timeRange, customStartDate, customEndDate, comparePrev, analysisMode, concurrentWindowHours]);

  // Consolidated data loading with proper state management
  const dataLoadingRef = useRef(false);
  
  useEffect(() => {
    // Initialize data loading sequence
    const initializeData = async () => {
      if (dataLoadingRef.current) return; // Prevent concurrent initialization
      
      dataLoadingRef.current = true;
      // URL -> state - Fixed to prevent potential setState during render issues
      const sitesQ = searchParams.get('sites');
      const metricQ = searchParams.get('metric');
      const timeQ = searchParams.get('time_range');
      
      // Use setTimeout to ensure these are scheduled after render
      setTimeout(() => {
        if (sitesQ) setSelectedSites(sitesQ.split(','));
        if (metricQ) setSelectedMetric(metricQ);
        if (timeQ) setTimeRange(timeQ);
        
        // Handle custom date range URL params
        const startDateQ = searchParams.get('start_date');
        const endDateQ = searchParams.get('end_date');
        if (startDateQ) setCustomStartDate(startDateQ);
        if (endDateQ) setCustomEndDate(endDateQ);
      }, 0);
      await fetchAvailableSites();
      dataLoadingRef.current = false;
    };
    
    initializeData();
  }, [fetchAvailableSites, searchParams]);

  // State -> URL
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('sites', selectedSites.join(','));
    params.set('metric', selectedMetric);
    params.set('time_range', timeRange);
    
    // Include custom date range in URL if set
    if (timeRange === 'custom') {
      if (customStartDate) params.set('start_date', customStartDate);
      if (customEndDate) params.set('end_date', customEndDate);
    }
    
    setSearchParams(params, { replace: true });
  }, [selectedSites, selectedMetric, timeRange, customStartDate, customEndDate, setSearchParams]);

  // Load comparison data with proper guards (only after sites are loaded and not during initialization)
  useEffect(() => {
    if (!dataLoadingRef.current && !sitesLoading && selectedSites.length > 0 && availableSites.length > 0) {
      // Debounce API calls by 300ms to prevent rapid successive calls
      const debounceTimeout = setTimeout(() => {
        fetchComparisonData();
      }, 300);
      
      return () => clearTimeout(debounceTimeout);
    }
  }, [selectedSites, selectedMetric, timeRange, customStartDate, customEndDate, sitesLoading, availableSites, fetchComparisonData]);

  // Optimized lookups to prevent inefficient array searches in render
  const sitesLookup = useMemo(() => {
    const lookup = new Map();
    availableSites.forEach(site => lookup.set(site.id, site));
    return lookup;
  }, [availableSites]);

  const comparisonSitesLookup = useMemo(() => {
    if (!comparisonData?.sites) return new Map();
    const lookup = new Map();
    comparisonData.sites.forEach(site => lookup.set(site.site_id, site));
    return lookup;
  }, [comparisonData]);

  const sortedSites = useMemo(() => {
    const arr = (comparisonData?.sites || []).slice();
    const key = sortKey;
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const av = a?.[key];
      const bv = b?.[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls last
      if (bv == null) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [comparisonData, sortKey, sortDir]);

  // Grouping support (currently by status)
  const groupedRows = useMemo(() => {
    if (groupBy !== 'status') return [{ group: null, rows: sortedSites }];
    const groups = new Map();
    sortedSites.forEach(r => {
      const status = (sitesLookup.get(r.site_id)?.status) || 'unknown';
      if (!groups.has(status)) groups.set(status, []);
      groups.get(status).push(r);
    });
    return Array.from(groups.entries()).map(([group, rows]) => ({ group, rows }));
  }, [groupBy, sortedSites, sitesLookup]);

  const selectedMetricInfo = useMemo(() => 
    availableMetrics.find(m => m.id === selectedMetric) || {},
    [selectedMetric, availableMetrics]
  );

  // Build time-series comparison traces (parameter vs time across sites)
  const metaStart = comparisonData?.metadata?.start;
  const metaEnd = comparisonData?.metadata?.end;
  useEffect(() => {
    let aborted = false;
    const build = async () => {
      try {
        setSeriesLoading(true);
        setSeriesError(null);
        setSeriesTraces([]);

        const effSites = selectedSites.includes('all') ? availableSites.map(s => s.id) : selectedSites;
        if (!metaStart || !metaEnd || !effSites?.length) {
          setSeriesLoading(false);
          return;
        }

        const startIso = metaStart;
        const endIso = metaEnd;
        const colors = SITE_COLORS || {};

        if (seriesMode === 'water_quality') {
          let res, rows, valKey, siteKey;
          
          if (selectedMetric === 'redox') {
            // Fetch redox data for redox parameter
            res = await getRedoxAnalysisData({
              time_range: 'custom',
              start_date: startIso,
              end_date: endIso,
              sites: effSites.join(','),
              performance_mode: 'balanced'
            });
            rows = Array.isArray(res?.redox_data) ? res.redox_data : [];
            valKey = 'processed_eh'; // or 'redox_value_mv'
            siteKey = rows.length && ('site_code' in rows[0] ? 'site_code' : ('site_id' in rows[0] ? 'site_id' : null));
            
            // Add fallback for redox data with different field names
            if (!siteKey && rows.length > 0) {
              console.warn('Redox data structure:', rows[0]);
              // Try common site field variations
              const possibleKeys = ['site', 'Site', 'SITE', 'site_name', 'siteName'];
              for (const key of possibleKeys) {
                if (key in rows[0]) {
                  siteKey = key;
                  break;
                }
              }
            }
          } else {
            // Fetch WQ time series within comparison window
            const params = {
              time_range: 'custom',
              start_date: startIso,
              end_date: endIso,
              sites: effSites.join(','),
              performance_mode: 'balanced',
              no_downsample: 'true'
            };
            res = await getWaterQualityData(params);
            rows = Array.isArray(res?.water_quality_data) ? res.water_quality_data : [];
            valKey = (
              selectedMetric === 'temperature' ? 'temperature_c'
              : selectedMetric === 'conductivity' ? 'conductivity_us_cm'
              : selectedMetric === 'water_level' ? 'water_level_m'
              : 'temperature_c'
            );
            siteKey = rows.length && ('site_code' in rows[0] ? 'site_code' : ('site_id' in rows[0] ? 'site_id' : null));
            
            // Add fallback for water quality data with different field names
            if (!siteKey && rows.length > 0) {
              console.warn('Water quality data structure:', rows[0]);
              // Try common site field variations
              const possibleKeys = ['site', 'Site', 'SITE', 'site_name', 'siteName'];
              for (const key of possibleKeys) {
                if (key in rows[0]) {
                  siteKey = key;
                  break;
                }
              }
            }
          }
          if (!siteKey) throw new Error('Missing site identifier in response');
          // Group rows by site
          const bySite = new Map();
          for (const r of rows) {
            const sid = r[siteKey];
            const ts = r.measurement_timestamp || r.timestamp || r.ts;
            const y = r[valKey];
            if (sid == null || ts == null || y == null) continue;
            if (!bySite.has(sid)) bySite.set(sid, { x: [], y: [] });
            bySite.get(sid).x.push(ts);
            bySite.get(sid).y.push(Number(y));
          }
          const traces = Array.from(bySite.entries()).map(([sid, series]) => ({
            x: series.x,
            y: series.y,
            type: 'scatter',
            mode: 'lines',
            name: sitesLookup.get(sid)?.name || sid,
            line: { color: colors[sid] || colors.Unknown || '#6c757d', width: 2 },
          }));
          if (!aborted) setSeriesTraces(traces);
        } else {
          // Redox: plot processed/redox vs time at a chosen depth (approx match)
          const res = await getRedoxAnalysisData({
            time_range: 'custom',
            start_date: startIso,
            end_date: endIso,
            sites: effSites.join(','),
            performance_mode: 'balanced'
          });
          const rows = Array.isArray(res?.redox_data) ? res.redox_data : [];
          let siteKey = rows.length && ('site_code' in rows[0] ? 'site_code' : ('site_id' in rows[0] ? 'site_id' : null));
          
          // Add fallback for redox data with different field names
          if (!siteKey && rows.length > 0) {
            console.warn('Redox series data structure:', rows[0]);
            // Try common site field variations
            const possibleKeys = ['site', 'Site', 'SITE', 'site_name', 'siteName'];
            for (const key of possibleKeys) {
              if (key in rows[0]) {
                siteKey = key;
                break;
              }
            }
          }
          
          if (!siteKey) throw new Error('Missing site identifier in redox response');
          const target = Number(selectedDepth);
          const tol = 5; // cm tolerance
          const bySite = new Map();
          for (const r of rows) {
            const sid = r[siteKey];
            const ts = r.measurement_timestamp || r.timestamp || r.ts;
            const depth = r.depth_cm != null ? Number(r.depth_cm) : null;
            const y = (r.processed_eh != null ? Number(r.processed_eh) : (r.redox_value_mv != null ? Number(r.redox_value_mv) : null));
            if (sid == null || ts == null || y == null || depth == null) continue;
            if (Math.abs(depth - target) > tol) continue;
            if (!bySite.has(sid)) bySite.set(sid, { x: [], y: [] });
            bySite.get(sid).x.push(ts);
            bySite.get(sid).y.push(Number(y));
          }
          const traces = Array.from(bySite.entries()).map(([sid, series]) => ({
            x: series.x,
            y: series.y,
            type: 'scatter',
            mode: 'lines',
            name: `${sitesLookup.get(sid)?.name || sid}`,
            line: { color: colors[sid] || colors.Unknown || '#6c757d', width: 2 },
          }));
          if (!aborted) setSeriesTraces(traces);
        }

      } catch (e) {
        if (!aborted) setSeriesError(e?.message || String(e));
      } finally {
        if (!aborted) setSeriesLoading(false);
      }
    };
    build();
    return () => { aborted = true; };
  }, [metaStart, metaEnd, selectedSites, selectedMetric, seriesMode, selectedDepth, availableSites, sitesLookup]);

  // Previous period delta utilities
  const computePrevDelta = useCallback((siteId) => {
    if (!prevComparisonData?.sites || !comparisonData?.sites) return null;
    const prev = prevComparisonData.sites.find(s => s.site_id === siteId);
    const curr = comparisonData.sites.find(s => s.site_id === siteId);
    if (!prev || prev.avgValue == null || !curr || curr.avgValue == null) return null;
    if (prev.avgValue === 0) return null;
    const delta = ((curr.avgValue - prev.avgValue) / Math.abs(prev.avgValue)) * 100;
    return Number.isFinite(delta) ? Number(delta.toFixed(1)) : null;
  }, [prevComparisonData, comparisonData]);

  const classifyDelta = (deltaPct) => {
    if (deltaPct == null) return { label: '—', cls: 'status-unknown' };
    const absd = Math.abs(deltaPct);
    if (absd >= 20) return { label: `${deltaPct > 0 ? '+' : ''}${deltaPct}%`, cls: deltaPct > 0 ? 'status-warning' : 'status-success' };
    if (absd >= 5) return { label: `${deltaPct > 0 ? '+' : ''}${deltaPct}%`, cls: 'status-normal' };
    return { label: `${deltaPct > 0 ? '+' : ''}${deltaPct}%`, cls: 'status-good' };
  };

  // Stable callbacks for UI interactions
  const handleClearError = useCallback(() => setError(null), []);
  
  const handleToggleSortDir = useCallback(() => {
    setSortDir(d => d === 'asc' ? 'desc' : 'asc');
  }, []);

  const handleMetricSelect = useCallback((event) => {
    const value = event?.target?.value || event;
    setSelectedMetric(value);
  }, []);

  const handleWaterQualityMode = useCallback(() => {
    setSeriesMode('water_quality');
  }, []);

  const handleRedoxMode = useCallback(() => {
    setSeriesMode('redox');
  }, []);

  const handleChartExport = useCallback(async () => {
    try {
      const fname = seriesMode === 'water_quality'
        ? `timeseries_WQ_${selectedMetric}_${timeRange}`
        : `timeseries_Redox_${selectedDepth}cm_${timeRange}`;
      await performExport({
        type: 'chart',
        format: exportFormat,
        filename: fname,
        elementId: 'timeseries-comparison-chart'
      });
    } catch (e) { 
      console.error('Chart export failed:', e); 
    }
  }, [seriesMode, selectedMetric, timeRange, selectedDepth, exportFormat]);

  const handleChartViewModeChange = useCallback((e) => {
    setChartViewMode(e.target.value);
  }, []);

  // Transform series traces for per-site view (memoized for performance)
  const perSiteChartData = useMemo(() => {
    if (chartViewMode !== 'per-site' || !seriesTraces.length) return [];
    
    // Group data by site
    const siteDataMap = new Map();
    
    seriesTraces.forEach(trace => {
      const siteName = trace.name;
      if (siteName && trace.x && trace.y) {
        siteDataMap.set(siteName, {
          x: trace.x,
          y: trace.y,
          name: selectedMetric === 'redox' ? 'Redox (Eh)' : selectedMetricInfo?.name || 'Value',
          type: trace.type || 'scatter',
          mode: 'lines+markers',
          line: { width: 2, color: SITE_COLORS[siteName] || trace.line?.color || '#1f77b4' },
          marker: { size: 4, color: SITE_COLORS[siteName] || trace.marker?.color || '#1f77b4' }
        });
      }
    });
    
    return Array.from(siteDataMap.entries()).map(([siteName, traceData]) => ({
      siteName,
      data: [traceData]
    }));
  }, [seriesTraces, chartViewMode, selectedMetric, selectedMetricInfo]);

  // Threshold bands for current metric
  const thresholdShapes = useMemo(() => {
    const th = METRIC_THRESHOLDS[selectedMetric];
    if (!th) return [];
    const shapes = [];
    if (th.good) {
      shapes.push({ type: 'rect', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: th.good[0], y1: th.good[1], fillcolor: 'rgba(16,185,129,0.08)', line: { width: 0 } });
    }
    if (th.warning) {
      shapes.push({ type: 'rect', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: th.warning[0], y1: th.good ? th.good[0] : th.warning[1], fillcolor: 'rgba(245,158,11,0.06)', line: { width: 0 } });
      if (th.good) shapes.push({ type: 'rect', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: th.good[1], y1: th.warning[1], fillcolor: 'rgba(245,158,11,0.06)', line: { width: 0 } });
    }
    return shapes;
  }, [selectedMetric]);

  // (Removed legacy sparkline traces for trend card)

  // Process comparison data for statistics
  const comparisonStats = useMemo(() => {
    if (!comparisonData?.sites) {
      return {
        totalSites: availableSites.length,
        activeSites: availableSites.filter(s => s.status === 'active').length,
        comparedSites: 0,
        averageValue: 0,
        highestValue: 0,
        lowestValue: 0,
        variabilityIndex: 0
      };
    }

    const sites = comparisonData.sites;
    const values = sites.map(site => site.currentValue || 0).filter(v => v > 0);
    
    return {
      totalSites: availableSites.length,
      activeSites: availableSites.filter(s => s.status === 'active').length,
      comparedSites: sites.length,
      averageValue: values.length > 0 ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : 0,
      highestValue: values.length > 0 ? Math.max(...values).toFixed(2) : 0,
      lowestValue: values.length > 0 ? Math.min(...values).toFixed(2) : 0,
      variabilityIndex: values.length > 0 ? ((Math.max(...values) - Math.min(...values)) / Math.max(...values) * 100).toFixed(1) : 0
    };
  }, [comparisonData, availableSites]);

  const handleSiteToggle = (siteId) => {
    if (siteId === 'all') {
      setSelectedSites(['all']);
    } else {
      setSelectedSites(prev => {
        const newSelection = prev.filter(s => s !== 'all');
        if (newSelection.includes(siteId)) {
          const updated = newSelection.filter(s => s !== siteId);
          return updated.length === 0 ? ['all'] : updated;
        } else {
          return [...newSelection, siteId];
        }
      });
    }
  };

  const getSiteStatus = (status) => {
    switch (status) {
      case 'active':
        return 'excellent';
      case 'maintenance':
        return 'warning';
      case 'offline':
        return 'poor';
      default:
        return 'unknown';
    }
  };

  const getMetricStatus = (value, metric) => {
    // Simple status determination based on typical ranges
    switch (metric) {
      case 'dissolved_oxygen':
        if (value >= 6) return 'excellent';
        if (value >= 4) return 'good';
        return 'poor';
      case 'temperature':
        if (value >= 15 && value <= 25) return 'excellent';
        if (value >= 10 && value <= 30) return 'good';
        return 'poor';
      default:
        return 'good';
    }
  };

  if (loading || sitesLoading) {
    return (
      <div className="modern-dashboard">
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">Site Comparison</h1>
            <p className="dashboard-subtitle">Compare water quality metrics across monitoring sites</p>
          </div>
        </div>
        <div className="main-content">
          <EmptyState
            type="loading"
            title="Loading Site Comparison"
            description="Fetching site data and comparison metrics..."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="modern-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Site Comparison</h1>
          <p className="dashboard-subtitle">
            Compare water quality metrics across monitoring sites
          </p>
          {comparisonData?.metadata?.start && comparisonData?.metadata?.end && (
            <div style={{ color: '#6c757d', fontSize: 12 }}>
              Window: {String(comparisonData.metadata.start).slice(0,10)} → {String(comparisonData.metadata.end).slice(0,10)}
            </div>
          )}
          {/* NEW: Data availability indicators */}
          {comparisonData?.metadata?.temporal_context && (
            <div style={{ 
              color: comparisonData.metadata.analysis_mode === 'concurrent' ? '#28a745' : '#6c757d', 
              fontSize: 11, 
              marginTop: 4,
              display: 'flex', 
              alignItems: 'center', 
              gap: 4 
            }}>
              <i className={`bi ${comparisonData.metadata.analysis_mode === 'concurrent' ? 'bi-clock-history' : 'bi-calendar-range'}`}></i>
              {comparisonData.metadata.temporal_context}
              {comparisonData.metadata.analysis_mode === 'concurrent' && comparisonData.metadata.concurrent_measurements === 0 && (
                <span style={{ color: '#dc3545', marginLeft: 8 }}>
                  <i className="bi bi-exclamation-triangle"></i>
                  No concurrent measurements found - try a wider time window
                </span>
              )}
            </div>
          )}
        </div>
        <div className="dashboard-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button 
            onClick={fetchComparisonData}
            className="btn btn-outline-secondary btn-sm"
            disabled={loading || sitesLoading}
            title={loading || sitesLoading ? 'Please wait for current operation to complete' : 'Refresh data'}
          >
            <i className={`bi ${loading ? 'bi-arrow-repeat' : 'bi-arrow-clockwise'} me-1`}></i>
            Refresh
          </button>
          <ExportButton
            data={comparisonData?.sites || []}
            filename={`site_comparison_${selectedMetric}_${timeRange}`}
            availableFormats={['csv', 'json']}
            variant="outline-success"
            size="sm"
            disabled={!comparisonData?.sites || comparisonData.sites.length === 0}
            onExportStart={() => console.log('Export started')}
            onExportComplete={(result) => console.log('Export completed:', result)}
            onExportError={(error) => console.error('Export failed:', error)}
            className="ms-2"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {error && (
          <div className="alert-message alert-error">
            <div className="alert-content">
              <i className="bi bi-exclamation-triangle"></i>
              <span>{error}</span>
              <button onClick={handleClearError} className="alert-dismiss">
                <i className="bi bi-x"></i>
              </button>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="site-comparison-controls">
          <div className="control-group">
            <label className="control-label">Metric to Compare</label>
            <select 
              className="control-select"
              value={selectedMetric}
              onChange={handleMetricSelect}
            >
              {availableMetrics.map(metric => (
                <option key={metric.id} value={metric.id}>
                  {metric.name} ({metric.unit})
                </option>
              ))}
            </select>
            {METRIC_THRESHOLDS[selectedMetric] && (
              <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }} title={`Good: ${METRIC_THRESHOLDS[selectedMetric].good?.join(' – ')} ${METRIC_THRESHOLDS[selectedMetric].unit}`}>
                Thresholds: Good {METRIC_THRESHOLDS[selectedMetric].good?.join(' – ')} {METRIC_THRESHOLDS[selectedMetric].unit}
              </div>
            )}
          </div>
          
          <div className="control-group">
            <label className="control-label">Time Range</label>
            <select 
              className="control-select"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
            >
              <option value="1d">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="180d">Last 6 Months</option>
              <option value="365d">Last 1 Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {/* Custom Date Range Controls */}
          {timeRange === 'custom' && (
            <div className="control-group">
              <label className="control-label">Custom Date Range</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="date"
                  className="control-input"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  placeholder="Start Date"
                  max={customEndDate || new Date().toISOString().split('T')[0]}
                  title="Select start date"
                />
                <span style={{ color: '#6c757d', fontSize: 12 }}>to</span>
                <input
                  type="date"
                  className="control-input"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  placeholder="End Date"
                  min={customStartDate}
                  max={new Date().toISOString().split('T')[0]}
                  title="Select end date"
                />
              </div>
              {customStartDate && customEndDate && new Date(customStartDate) > new Date(customEndDate) && (
                <div className="text-danger" style={{ fontSize: 12, marginTop: 4 }}>
                  Start date must be before end date
                </div>
              )}
            </div>
          )}

          {/* NEW: Analysis Mode Controls */}
          <div className="control-group">
            <label className="control-label">
              Analysis Mode
              <i 
                className="bi bi-info-circle ms-1" 
                style={{ color: '#6c757d', fontSize: '12px' }}
                title="Concurrent mode compares measurements taken within the same time window across sites. Full period mode compares averages across all available data."
              ></i>
            </label>
            <select 
              className="control-select"
              value={analysisMode}
              onChange={(e) => setAnalysisMode(e.target.value)}
            >
              <option value="concurrent">Concurrent Measurements</option>
              <option value="full_period">Full Period Average</option>
            </select>
          </div>

          {/* Concurrent Window Hours Control (only show when concurrent mode is selected) */}
          {analysisMode === 'concurrent' && (
            <div className="control-group">
              <label className="control-label">
                Time Window
                <i 
                  className="bi bi-info-circle ms-1" 
                  style={{ color: '#6c757d', fontSize: '12px' }}
                  title="Maximum time difference allowed between measurements from different sites to be considered concurrent."
                ></i>
              </label>
              <select 
                className="control-select"
                value={concurrentWindowHours}
                onChange={(e) => setConcurrentWindowHours(parseInt(e.target.value))}
              >
                <option value="1">1 Hour</option>
                <option value="6">6 Hours</option>
                <option value="24">24 Hours</option>
                <option value="72">3 Days</option>
                <option value="168">1 Week</option>
              </select>
            </div>
          )}

          <div className="control-group">
            <label className="control-label">Sort By</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select className="control-select" value={sortKey} onChange={(e)=>setSortKey(e.target.value)}>
                <option value="currentValue">Current Value</option>
                <option value="change24h">24h Change</option>
                <option value="avgValue">Average</option>
                <option value="maxValue">Max</option>
                <option value="minValue">Min</option>
              </select>
              <button className="btn btn-outline-secondary btn-sm" onClick={handleToggleSortDir}>
                <i className={`bi ${sortDir==='asc'?'bi-sort-down-alt':'bi-sort-up'}`}></i>
              </button>
            </div>
          </div>
          <div className="control-group">
            <label className="control-label">Group By</label>
            <select className="control-select" value={groupBy} onChange={(e)=>setGroupBy(e.target.value)}>
              <option value="none">None</option>
              <option value="status">Status</option>
            </select>
          </div>

          <div className="control-group">
            <label className="control-label">Compare</label>
            <div className="form-check" title="Compare against the previous period of equal length">
              <input className="form-check-input" type="checkbox" id="comparePrev" checked={comparePrev} onChange={(e)=> setComparePrev(e.target.checked)} />
              <label className="form-check-label" htmlFor="comparePrev">vs previous period</label>
            </div>
          </div>
        </div>

        {/* Multi-metric quick tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {availableMetrics.map(m => (
            <button
              key={m.id}
              className={`btn btn-sm ${selectedMetric === m.id ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => handleMetricSelect(m.id)}
              title={`Switch to ${m.name}`}
            >{m.name}</button>
          ))}
        </div>

        {/* Comparison Statistics */}
        <div className="section-header">
          <h2 className="section-title">
            <i className="bi bi-graph-up-arrow" style={{ marginRight: '12px' }}></i>
            Comparison Overview
          </h2>
        </div>

        <div className="metrics-grid">
          <MetricCard
            title="Total Sites"
            value={comparisonStats.totalSites}
            icon="geo-alt"
            status="normal"
            context="Monitoring locations"
            tooltip="Total number of monitoring sites available in the system. This includes all configured sites regardless of their current operational status."
          />
          <MetricCard
            title="Active Sites"
            value={comparisonStats.activeSites}
            icon="broadcast"
            status="excellent"
            context="Currently operational"
            tooltip="Number of sites currently online and actively collecting data. These sites have recent measurements and are functioning properly."
          />
          <MetricCard
            title="Compared Sites"
            value={comparisonStats.comparedSites}
            icon="bar-chart"
            status="good"
            context="In current analysis"
            tooltip={`Number of sites included in the current comparison analysis. ${analysisMode === 'concurrent' ? `Using concurrent mode with ${concurrentWindowHours}h windows to find measurements taken at similar times.` : 'Using full period mode to compare averages across all available data.'}`}
          />
          <MetricCard
            title="Average Value"
            value={comparisonStats.averageValue}
            unit={selectedMetricInfo?.unit || ''}
            icon="calculator"
            status="normal"
            context="Across all sites"
            tooltip={`Average ${selectedMetric} value across all compared sites. ${analysisMode === 'concurrent' ? 'Based on concurrent measurements within the specified time windows.' : 'Calculated from the full period averages of each site.'} This gives you the overall system-wide measurement level.`}
          />
          <MetricCard
            title="Highest Value"
            value={comparisonStats.highestValue}
            unit={selectedMetricInfo?.unit || ''}
            icon="arrow-up-circle"
            status="warning"
            context="Peak measurement"
            tooltip={`Highest ${selectedMetric} value recorded among all compared sites. This represents the peak measurement and may indicate a site that needs attention or has different environmental conditions.`}
          />
          <MetricCard
            title="Variability"
            value={`${comparisonStats.variabilityIndex}%`}
            icon="activity"
            status={parseFloat(comparisonStats.variabilityIndex) > 20 ? 'warning' : 'good'}
            context="Measurement spread"
            tooltip={`Coefficient of variation showing how much ${selectedMetric} values differ between sites. Low variability (<20%) suggests consistent conditions across sites, while high variability (>20%) indicates significant differences that may require investigation.`}
          />
        </div>

        {/* Site Selection */}
        <div className="section-header">
          <h2 className="section-title">
            <i className="bi bi-geo-alt-fill" style={{ marginRight: '12px' }}></i>
            Monitoring Sites
          </h2>
        </div>

        <div className="sites-grid">
          <div 
            className={`site-card ${selectedSites.includes('all') ? 'selected' : ''}`}
            onClick={() => handleSiteToggle('all')}
          >
            <div className="site-header">
              <div className="site-icon">
                <i className="bi bi-collection"></i>
              </div>
              <div className="site-info">
                <h3 className="site-name">All Sites</h3>
                <p className="site-location">Compare all available sites</p>
              </div>
              <div className="site-status status-normal">
                All
              </div>
            </div>
          </div>

          {availableSites.map(site => (
            <div 
              key={site.id}
              className={`site-card ${selectedSites.includes(site.id) ? 'selected' : ''} site-${site.status}`}
              onClick={() => handleSiteToggle(site.id)}
            >
              <div className="site-header">
                <div className="site-icon">
                  <i className={`bi bi-${site.status === 'active' ? 'broadcast' : site.status === 'maintenance' ? 'tools' : 'x-circle'}`}></i>
                </div>
                <div className="site-info">
                  <h3 className="site-name">{site.name}</h3>
                  <p className="site-location">{site.location}</p>
                </div>
                <div className={`site-status status-${getSiteStatus(site.status)}`}>
                  {site.status}
                </div>
              </div>
              
              {(() => {
                const siteData = comparisonSitesLookup.get(site.id);
                return siteData && (
                  <div className="site-metrics">
                    <div className="metric-item">
                      <span className="metric-label">Current Value:</span>
                      <span className={`metric-value status-${getMetricStatus(siteData.currentValue, selectedMetric)}`}>
                        {siteData.currentValue || 'N/A'}
                        {siteData.currentValue && ` ${selectedMetricInfo?.unit}`}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          ))}
        </div>

        {/* Comparison Results */}
        {/* Time Series Comparison (Parameter vs Time across sites) */}
        {(seriesTraces.length > 0 || seriesLoading || seriesError) && (
          <>
            <div className="section-header">
              <h2 className="section-title">
                <i className="bi bi-graph-up" style={{ marginRight: '12px' }}></i>
                Time Series Comparison
              </h2>
            </div>
            <div className="card" style={{ padding: '12px' }}>
              {/* Tabs: WQ vs Redox */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 8 }} role="tablist" aria-label="Comparison Data Type">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={seriesMode === 'water_quality'}
                    className={`btn btn-sm ${seriesMode === 'water_quality' ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={handleWaterQualityMode}
                  >Water Quality</button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={seriesMode === 'redox'}
                    className={`btn btn-sm ${seriesMode === 'redox' ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={handleRedoxMode}
                  >Redox</button>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div>
                    <label className="control-label" style={{ marginRight: 8 }}>View</label>
                    <select className="control-select" value={chartViewMode} onChange={handleChartViewModeChange}>
                      <option value="overlay">Overlay Chart</option>
                      <option value="per-site">Charts per Site</option>
                    </select>
                  </div>
                  {seriesMode === 'water_quality' && (
                    <div>
                      <label className="control-label" style={{ marginRight: 8 }}>Metric</label>
                      <select className="control-select" value={selectedMetric} onChange={handleMetricSelect}>
                        {availableMetrics.filter(m => m.id !== 'redox').map(metric => (
                          <option key={metric.id} value={metric.id}>{metric.name} ({metric.unit})</option>
                        ))}
                        <option value="redox">Redox (Eh) (mV)</option>
                      </select>
                    </div>
                  )}
                  {seriesMode === 'redox' && (
                    <div>
                      <label className="control-label" style={{ marginRight: 8 }}>Depth (cm)</label>
                      <select className="control-select" value={selectedDepth} onChange={(e)=> setSelectedDepth(Number(e.target.value))}>
                        {[10,30,50,100,150,200].map(d => <option key={d} value={d}>{d} cm</option>)}
                      </select>
                    </div>
                  )}
                  <div className="control-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label className="control-label" style={{ marginRight: 4 }}>Export</label>
                    <select
                      className="control-select"
                      value={exportFormat}
                      onChange={(e)=> setExportFormat(e.target.value)}
                      title="Select export format"
                      style={{ minWidth: 90 }}
                    >
                      <option value={EXPORT_FORMATS.PNG}>PNG</option>
                      <option value={EXPORT_FORMATS.JPG}>JPG</option>
                      <option value={EXPORT_FORMATS.PDF}>PDF</option>
                    </select>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      title="Download chart"
                      onClick={handleChartExport}
                    >
                      <i className="bi bi-download me-1"></i> Download
                    </button>
                  </div>
                </div>
              </div>
              {seriesError && (
                <div className="alert-message alert-error" style={{ marginBottom: 8 }}>
                  <div className="alert-content">
                    <i className="bi bi-exclamation-triangle"></i>
                    <span>{seriesError}</span>
                  </div>
                </div>
              )}
              {chartViewMode === 'per-site' ? (
                <PerSiteCharts
                  perSiteData={perSiteChartData}
                  selectedMetricInfo={selectedMetricInfo}
                  thresholdShapes={seriesMode === 'water_quality' ? thresholdShapes : []}
                  loading={seriesLoading}
                  error={seriesError}
                />
              ) : seriesLoading ? (
                <div style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="text-muted">Loading time series…</span>
                </div>
              ) : (
                <Plot
                  data={seriesTraces}
                  layout={{
                    margin: { l: 48, r: 24, t: 24, b: 40 },
                    showlegend: true,
                    legend: { orientation: 'h', y: -0.2 },
                    xaxis: { title: 'Time', type: 'date', zeroline: false, gridcolor: '#f1f3f5' },
                    yaxis: { 
                      title: seriesMode === 'water_quality' 
                        ? (selectedMetric === 'redox' ? 'mV' : (selectedMetricInfo?.unit || 'Value'))
                        : 'mV', 
                      zeroline: false, 
                      gridcolor: '#f1f3f5' 
                    },
                    paper_bgcolor: 'transparent',
                    plot_bgcolor: 'transparent',
                    shapes: seriesMode === 'water_quality' ? thresholdShapes : []
                  }}
                  useResizeHandler
                  style={{ width: '100%', height: '360px' }}
                  config={{ displayModeBar: false, responsive: true }}
                  divId="timeseries-comparison-chart"
                />
              )}
            </div>
          </>
        )}

        {/* Comparison Results */}
        {comparisonData && comparisonData.sites && comparisonData.sites.length > 0 && (
          <>
            <div className="section-header">
              <h2 className="section-title">
                <i className="bi bi-bar-chart" style={{ marginRight: '12px' }}></i>
                Comparison Results
              </h2>
            </div>

            <div className="comparison-results">
              <div className="results-table-container">
                <table className="modern-table">
                  <thead className="table-header">
                    <tr>
                      <th>Site</th>
                      <th>Location</th>
                      <th>Current Value</th>
                      <th>Trend</th>
                      <th>24h Change</th>
                      {comparePrev && <th>vs Prev Period</th>}
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody className="table-body">
                    {groupedRows.map(({ group, rows }, gi) => (
                      <React.Fragment key={`grp-${group || 'all'}-${gi}`}>
                        {group && (
                          <tr className="table-row" style={{ background: '#f8f9fa' }}>
                            <td className="table-cell" colSpan={comparePrev ? 6 : 5}>
                              <strong>Group: {group}</strong> <span className="text-muted">({rows.length} sites)</span>
                            </td>
                          </tr>
                        )}
                        {rows.map((site, index) => {
                          const siteInfo = sitesLookup.get(site.site_id);
                          const deltaPct = computePrevDelta(site.site_id);
                          const deltaInfo = classifyDelta(deltaPct);
                          return (
                            <tr key={`${site.site_id}-${index}`} className="table-row">
                              <td className="table-cell">
                                <div className="cell-primary">{siteInfo?.name || site.site_id}</div>
                              </td>
                              <td className="table-cell">
                                <div className="cell-primary">{siteInfo?.location || 'Unknown'}</div>
                              </td>
                              <td className="table-cell">
                                {(() => {
                                  const hasStats = site.minValue != null || site.avgValue != null || site.maxValue != null;
                                  const fmt = (v) => (v == null ? '—' : Number(v).toFixed(2));
                                  const unit = site.currentValue ? (selectedMetricInfo?.unit || '') : '';
                                  const tooltip = hasStats 
                                    ? `Min: ${fmt(site.minValue)}${unit}\nAvg: ${fmt(site.avgValue)}${unit}\nMax: ${fmt(site.maxValue)}${unit}`
                                    : 'No data in window';
                                  return (
                                    <div className="cell-primary" title={tooltip}>
                                      {site.currentValue != null ? `${site.currentValue} ${unit}` : 'N/A'}
                                      {hasStats && (
                                        <i className="bi bi-info-circle ms-1" style={{ color: '#6c757d' }} title={tooltip}></i>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="table-cell">
                                {Array.isArray(site.spark) && site.spark.length > 1 ? (
                                  <svg viewBox="0 0 100 24" width="120" height="28" data-chart-id={`spark-${site.site_id}`}>
                                    {(() => {
                                      const vals = site.spark;
                                      const min = (site.spark_min ?? Math.min(...vals));
                                      const max = (site.spark_max ?? Math.max(...vals));
                                      const range = max - min || 1;
                                      const points = vals.map((v, i) => {
                                        const x = (i / (vals.length - 1)) * 100;
                                        const y = 24 - ((v - min) / range) * 24;
                                        return `${x},${y}`;
                                      }).join(' ');
                                      const color = SITE_COLORS?.[site.site_id] || '#6c757d';
                                      return <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />;
                                    })()}
                                  </svg>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>
                              <td className="table-cell">
                                <div className={`cell-primary ${site.change24h > 0 ? 'text-warning' : site.change24h < 0 ? 'text-success' : ''}`}>
                                  {site.change24h ? `${site.change24h > 0 ? '+' : ''}${site.change24h}` : 'N/A'}
                                </div>
                              </td>
                              {comparePrev && (
                                <td className="table-cell">
                                  <span className={`status-badge ${deltaInfo.cls}`} title="Change in average value vs previous period">
                                    {deltaInfo.label}
                                  </span>
                                </td>
                              )}
                              <td className="table-cell">
                                <span className={`status-badge ${getMetricStatus(site.currentValue, selectedMetric)}`}>
                                  {getMetricStatus(site.currentValue, selectedMetric)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
               </table>
             </div>
           </div>
          </>
        )}

        {/* Empty State for No Data */}
        {comparisonData && (!comparisonData.sites || comparisonData.sites.length === 0) && (
          <EmptyState
            type="empty"
            title="No Comparison Data"
            description="No data available for the selected sites and time range. Try adjusting your selection or check if the monitoring sites are operational."
            illustration={<i className="bi bi-bar-chart"></i>}
            action={
              <button 
                onClick={fetchComparisonData}
                className="btn btn-primary"
              >
                <i className="bi bi-arrow-repeat" style={{ marginRight: '8px' }}></i>
                Retry
              </button>
            }
          />
        )}
      </div>
    </div>
  );
};

export default ModernSiteComparison;
