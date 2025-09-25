import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Plot from '../components/PlotlyLite';
import { useSearchParams } from 'react-router-dom';
import MetricCard from '../components/modern/MetricCard';
import EmptyState from '../components/modern/EmptyState';
import ExportButton from '../components/ExportButton';
import SimpleLoadingBar from '../components/modern/SimpleLoadingBar';
import { useToast } from '../components/modern/toastUtils';
import PerSiteCharts from '../components/comparison/PerSiteCharts';
import { getSiteComparisonData, getAvailableSites, getWaterQualityData, getRedoxAnalysisData } from '../services/api';
// Unify export through ExportButton only
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
  const [timeRange, setTimeRange] = useState('Custom Range');
  const [customStartDate, setCustomStartDate] = useState('2024-05-01');
  const [customEndDate, setCustomEndDate] = useState('2024-05-31');
  const [sortKey, setSortKey] = useState('currentValue'); // or 'change24h'
  const [sortDir, setSortDir] = useState('desc'); // 'asc' or 'desc'
  // Removed Group By: always show exactly the selected sites
  // Removed previous-period comparison for now
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = useMemo(() => searchParams.toString(), [searchParams]);
  const lastSyncedParamsRef = useRef('');
  // Derive data type from selectedMetric; no separate mode state
  const [selectedDepth, setSelectedDepth] = useState(100); // cm for redox
  const [seriesTraces, setSeriesTraces] = useState([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesError, setSeriesError] = useState(null);
  // Removed separate export format state; using ExportButton only
  const [chartViewMode, setChartViewMode] = useState('overlay'); // 'overlay' or 'per-site'
  const [chartType, setChartType] = useState('line'); // 'line' | 'scatter'
  
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
        data_type: selectedMetric === 'redox' ? 'redox' : 'water_quality',
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

      // Previous-period comparison removed
      
      // Avoid success/warning toasts; rely on in-page states and empty state

      // No loading toast to clear
    } catch (err) {
      console.error('Site comparison fetch error:', err);
      setError(`Failed to load site comparison data: ${err.message}`);
      // Avoid error toast; in-page alert displays error with retry
    } finally {
      setLoading(false);
    }
  }, [selectedSites, selectedMetric, timeRange, customStartDate, customEndDate, analysisMode, concurrentWindowHours]);

  // Load sites once on mount
  useEffect(() => {
    fetchAvailableSites();
  }, [fetchAvailableSites]);

  // URL -> state synchronisation guarded against feedback loops
  useEffect(() => {
    if (!searchParamsString) {
      lastSyncedParamsRef.current = '';
      return;
    }

    if (searchParamsString === lastSyncedParamsRef.current) {
      return;
    }

    const sitesQ = searchParams.get('sites');
    const metricQ = searchParams.get('metric');
    const timeQ = searchParams.get('time_range');
    const startDateQ = searchParams.get('start_date');
    const endDateQ = searchParams.get('end_date');

    if (sitesQ) {
      const parsed = sitesQ.split(',').filter(Boolean);
      setSelectedSites(prev => {
        const sameLength = prev.length === parsed.length;
        const sameValues = sameLength && prev.every((v, i) => v === parsed[i]);
        return sameValues ? prev : parsed;
      });
    }

    if (metricQ) {
      setSelectedMetric(prev => (prev === metricQ ? prev : metricQ));
    }

    if (timeQ) {
      setTimeRange(prev => (prev === timeQ ? prev : timeQ));
    }

    if (startDateQ) {
      setCustomStartDate(prev => (prev === startDateQ ? prev : startDateQ));
    }

    if (endDateQ) {
      setCustomEndDate(prev => (prev === endDateQ ? prev : endDateQ));
    }

    lastSyncedParamsRef.current = searchParamsString;
  }, [searchParams, searchParamsString]);

  // State -> URL synchronisation
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('sites', selectedSites.join(','));
    params.set('metric', selectedMetric);
    params.set('time_range', timeRange);

    if (timeRange === 'custom') {
      if (customStartDate) params.set('start_date', customStartDate);
      if (customEndDate) params.set('end_date', customEndDate);
    }

    const nextString = params.toString();
    if (nextString === searchParamsString) {
      lastSyncedParamsRef.current = nextString;
      return;
    }

    if (nextString === lastSyncedParamsRef.current) {
      return;
    }

    lastSyncedParamsRef.current = nextString;
    setSearchParams(params, { replace: true });
  }, [selectedSites, selectedMetric, timeRange, customStartDate, customEndDate, setSearchParams, searchParamsString]);

  // Load comparison data with proper guards (only after sites are loaded and not during initialization)
  useEffect(() => {
    if (!sitesLoading && selectedSites.length > 0 && availableSites.length > 0) {
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
  const rowsForTable = sortedSites;

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

        if (selectedMetric !== 'redox') {
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
          // If site identifier is missing, fall back to a single combined series
          if (!siteKey) {
            console.warn('Missing site identifier in response; falling back to combined series');
          }
          // Group rows by site (or combined)
          const bySite = new Map();
          for (const r of rows) {
            const sid = siteKey ? r[siteKey] : 'Combined';
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
            mode: chartType === 'line' ? 'lines' : 'markers',
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
          
          if (!siteKey) {
            console.warn('Missing site identifier in redox response; falling back to combined series');
          }
          const target = Number(selectedDepth);
          const tol = 5; // cm tolerance
          const bySite = new Map();
          for (const r of rows) {
            const sid = siteKey ? r[siteKey] : 'Combined';
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
            mode: chartType === 'line' ? 'lines' : 'markers',
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
  }, [metaStart, metaEnd, selectedSites, selectedMetric, selectedDepth, availableSites, sitesLookup, chartType]);

  // Previous-period comparison removed

  // Stable callbacks for UI interactions
  const handleClearError = useCallback(() => setError(null), []);
  
  const handleToggleSortDir = useCallback(() => {
    setSortDir(d => d === 'asc' ? 'desc' : 'asc');
  }, []);

  const handleMetricSelect = useCallback((event) => {
    const value = event?.target?.value || event;
    setSelectedMetric(value);
  }, []);

  // Removed separate mode toggles; data type derived from selectedMetric

  // Chart export handled by ExportButton (png/pdf/csv/json)

  const handleChartViewModeChange = useCallback((e) => {
    setChartViewMode(e.target.value);
  }, []);

  const handleChartTypeChange = useCallback((e) => {
    setChartType(e.target.value);
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
          mode: chartType === 'line' ? 'lines' : 'markers',
          line: { width: 2, color: SITE_COLORS[siteName] || trace.line?.color || '#1f77b4' },
          marker: { size: 4, color: SITE_COLORS[siteName] || trace.marker?.color || '#1f77b4' }
        });
      }
    });
    
    return Array.from(siteDataMap.entries()).map(([siteName, traceData]) => ({
      siteName,
      data: [traceData]
    }));
  }, [seriesTraces, chartViewMode, selectedMetric, selectedMetricInfo, chartType]);

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
    // Helpers
    const qtile = (arr, q) => {
      if (!arr || arr.length === 0) return null;
      const a = arr.slice().sort((x, y) => x - y);
      const p = (a.length - 1) * q;
      const lo = Math.floor(p), hi = Math.ceil(p);
      if (lo === hi) return a[lo];
      const h = p - lo;
      return a[lo] * (1 - h) + a[hi] * h;
    };

    const sites = comparisonData?.sites || [];
    const comparedSites = sites.length;
    const values = sites
      .map(site => Number(site.currentValue))
      .filter(v => Number.isFinite(v));

    const unit = selectedMetricInfo?.unit || '';
    const median = values.length ? qtile(values, 0.5) : null;
    const q1 = values.length ? qtile(values, 0.25) : null;
    const q3 = values.length ? qtile(values, 0.75) : null;
    const iqr = (q1 != null && q3 != null) ? (q3 - q1) : null;
    const maxVal = values.length ? Math.max(...values) : null;
    const minVal = values.length ? Math.min(...values) : null;
    const maxSite = (maxVal != null) ? (sites.find(s => Number(s.currentValue) === maxVal)?.site_id || '') : '';
    const minSite = (minVal != null) ? (sites.find(s => Number(s.currentValue) === minVal)?.site_id || '') : '';

    // Coverage / concurrency
    const md = comparisonData?.metadata || {};
    let coverageLabel = 'N/A';
    let coverageTooltip = '';
    if (md.analysis_mode === 'concurrent') {
      const cnt = Number(md.concurrent_measurements) || 0;
      const winH = Number(md.time_window_hours) || 24;
      coverageLabel = `${cnt.toLocaleString()} windows`;
      coverageTooltip = `Number of concurrent measurement windows found across sites within ±${winH/2} hours of each other.`;
    } else if (md.start && md.end) {
      // Basic presence: sites with currentValue
      const present = sites.filter(s => Number.isFinite(Number(s.currentValue))).length;
      coverageLabel = `${present}/${comparedSites} sites reporting`;
      coverageTooltip = 'Sites that have a current value available in the selected window.';
    }

    return {
      comparedSites,
      unit,
      median,
      iqr,
      maxVal, maxSite,
      minVal, minSite,
      coverageLabel, coverageTooltip
    };
  }, [comparisonData, selectedMetricInfo]);

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
          <SimpleLoadingBar
            isVisible={loading || sitesLoading}
            message={sitesLoading ? "Loading available sites..." :
              `Loading ${selectedMetric} data for ${selectedSites.length} site${selectedSites.length !== 1 ? 's' : ''}...`}
            stage={sitesLoading ? "initializing" : "loading"}
            compact={false}
            progress={null} // Show indeterminate for site comparison
            current={comparisonData?.length || null}
            total={null}
            showPercentage={false}
            showCounts={comparisonData?.length > 0 && !loading}
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
            {selectedMetric === 'redox' && (
              <div style={{ marginTop: 8 }}>
                <label className="control-label" style={{ marginRight: 8 }}>Depth (cm)</label>
                <select className="control-select" value={selectedDepth} onChange={(e)=> setSelectedDepth(Number(e.target.value))}>
                  {[10,30,50,100,150,200].map(d => <option key={d} value={d}>{d} cm</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="control-group">
            <label className="control-label">Chart Type</label>
            <select className="control-select" value={chartType} onChange={handleChartTypeChange}>
              <option value="line">Line</option>
              <option value="scatter">Scatter</option>
            </select>
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
          {/* Removed Group By control to avoid confusion; table shows selected sites only */}

          {/* Removed previous-period comparison */}
        </div>

        {/* Removed duplicate metric quick tabs to avoid redundant controls */}

        {/* Comparison Statistics */}
        <div className="section-header">
          <h2 className="section-title">
            <i className="bi bi-graph-up-arrow" style={{ marginRight: '12px' }}></i>
            Comparison Overview
          </h2>
        </div>

        <div className="metrics-grid">
          <MetricCard
            title="Sites Compared"
            value={comparisonStats.comparedSites}
            icon="bar-chart"
            status="good"
            context="Included in this analysis"
            tooltip={`Number of sites included in the current comparison. ${analysisMode === 'concurrent' ? `Concurrent mode (${concurrentWindowHours}h windows).` : 'Full period mode.'}`}
          />
          <MetricCard
            title="Median Value"
            value={comparisonStats.median != null ? comparisonStats.median.toFixed(2) : 'N/A'}
            unit={comparisonStats.unit}
            icon="calculator"
            status="normal"
            context="Robust center across sites"
            tooltip={`Median ${selectedMetric} across compared sites (less sensitive to outliers than mean).`}
          />
          <MetricCard
            title="Spread (IQR)"
            value={comparisonStats.iqr != null ? comparisonStats.iqr.toFixed(2) : 'N/A'}
            unit={comparisonStats.unit}
            icon="arrows-expand"
            status={comparisonStats.iqr != null && comparisonStats.iqr > 0 ? 'warning' : 'good'}
            context="Interquartile range (Q3–Q1)"
            tooltip={`IQR (Q3 – Q1) shows how spread out site values are. Higher values indicate more variation across sites.`}
          />
          <MetricCard
            title="Max Value"
            value={comparisonStats.maxVal != null ? comparisonStats.maxVal.toFixed(2) : 'N/A'}
            unit={comparisonStats.unit}
            icon="arrow-up-circle"
            status="warning"
            context={comparisonStats.maxSite ? `Site ${comparisonStats.maxSite}` : 'Peak measurement'}
            tooltip={`Highest ${selectedMetric} among compared sites${comparisonStats.maxSite ? ` (Site ${comparisonStats.maxSite})` : ''}.`}
          />
          <MetricCard
            title="Min Value"
            value={comparisonStats.minVal != null ? comparisonStats.minVal.toFixed(2) : 'N/A'}
            unit={comparisonStats.unit}
            icon="arrow-down-circle"
            status="good"
            context={comparisonStats.minSite ? `Site ${comparisonStats.minSite}` : 'Lowest measurement'}
            tooltip={`Lowest ${selectedMetric} among compared sites${comparisonStats.minSite ? ` (Site ${comparisonStats.minSite})` : ''}.`}
          />
          <MetricCard
            title={analysisMode === 'concurrent' ? 'Concurrent Windows' : 'Data Coverage'}
            value={comparisonStats.coverageLabel}
            icon={analysisMode === 'concurrent' ? 'clock-history' : 'activity'}
            status="normal"
            context={analysisMode === 'concurrent' ? 'Measurement overlap' : 'Sites reporting'}
            tooltip={comparisonStats.coverageTooltip || (analysisMode === 'concurrent' ? 'Number of time windows where measurements overlapped across sites.' : 'How many selected sites have a current value in this window.')}
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div>
                    <label className="control-label" style={{ marginRight: 8 }}>View</label>
                    <select className="control-select" value={chartViewMode} onChange={handleChartViewModeChange}>
                      <option value="overlay">Overlay Chart</option>
                      <option value="per-site">Charts per Site</option>
                    </select>
                  </div>
                </div>
                <ExportButton
                  data={seriesTraces}
                  filename={`site_comparison_${selectedMetric==='redox'?'redox':selectedMetric}_${timeRange}`}
                  chartElementId="timeseries-comparison-chart"
                  availableFormats={['png','pdf','csv','json']}
                  variant="outline-success"
                  size="sm"
                  disabled={seriesTraces.length === 0}
                />
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
                    thresholdShapes={selectedMetric !== 'redox' ? thresholdShapes : []}
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
                          title: selectedMetric === 'redox'
                            ? 'Redox (Eh) (mV)'
                            : `${selectedMetricInfo?.name || 'Value'}${selectedMetricInfo?.unit ? ` (${selectedMetricInfo.unit})` : ''}`,
                          zeroline: false,
                          gridcolor: '#f1f3f5'
                        },
                        paper_bgcolor: 'transparent',
                        plot_bgcolor: 'transparent',
                        shapes: selectedMetric !== 'redox' ? thresholdShapes : []
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
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody className="table-body">
                    {rowsForTable.map((site, index) => {
                          const siteInfo = sitesLookup.get(site.site_id);
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
                              <td className="table-cell">
                                <span className={`status-badge ${getMetricStatus(site.currentValue, selectedMetric)}`}>
                                  {getMetricStatus(site.currentValue, selectedMetric)}
                                </span>
                              </td>
                            </tr>
                          );
                    })}
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
