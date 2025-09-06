import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// Modern components  
//
import EmptyState from '../components/modern/EmptyState';
import SidebarFilters from '../components/filters/SidebarFilters';
import ExportButton from '../components/ExportButton';
import { useToast } from '../components/modern/toastUtils';
import TutorialHint from '../components/modern/TutorialHint';
import { useTutorial } from '../contexts/TutorialContext.jsx';

// Existing and new services
import { 
  getProcessedEhTimeSeries,
  getProcessedEhTimeSeriesArrow,
  getProcessedEhDepthSnapshot,
  getProcessedEhRollingMean,
  getRedoxDateRange,
  getRedoxAnalysisData,
  getRedoxSettings,
  getAvailableSites
} from '../services/api';

// Import modern layout styles
import '../styles/modern-layout.css';
import { buildPerSiteSeries } from '../utils/typedSeries';
import { useRedoxStore } from '../store/redoxStore';
import { shallow } from 'zustand/shallow';
import RedoxMetrics from '../components/redox/RedoxMetrics';
import RedoxProgress from '../components/redox/RedoxProgress';
import RedoxTablePanel from '../components/redox/RedoxTablePanel';
import { useRedoxMetrics } from '../hooks/useRedoxMetrics';
// Individual chart components are rendered via RedoxChartRouter
import RedoxChartRouter from '../components/redox/RedoxChartRouter';
import ErrorBoundary from '../components/redox/ErrorBoundary';
import { log } from '../utils/log';
import { computePresetWindow } from '../utils/dateRange';
import { columnarToRows } from '../utils/columnar';
// Client-side cache removed; rely on server caching + request de-dup

// Cache heavy Arrow module across parses to avoid repeated loads
let __arrowModulePromise = null;
async function loadArrowModule() {
  if (!__arrowModulePromise) {
    __arrowModulePromise = import('apache-arrow').catch(() => import('@apache-arrow/esnext-esm'));
  }
  return __arrowModulePromise;
}

// Unified cancellation detection
function isRequestCancelled(err) {
  if (!err) return false;
  const msg = typeof err.message === 'string' ? err.message.toLowerCase() : '';
  return err.type === 'CANCELLED' || err.name === 'RequestCancelled' || err.code === 'ERR_CANCELED' || msg.includes('cancel') || msg.includes('aborted');
}

// Lightweight check to avoid attempting to parse non-Arrow buffers
function looksLikeJson(buffer) {
  try {
    if (!buffer || !(buffer instanceof ArrayBuffer)) return false;
    const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 64));
    // Quick check for leading whitespace + '{' or '['
    let i = 0;
    while (i < bytes.length && bytes[i] <= 32) i++;
    const ch = bytes[i];
    return ch === 0x7B /* '{' */ || ch === 0x5B /* '[' */;
  } catch (_) { return false; }
}

/**
 * Modern Redox Analysis Dashboard
 * Complete rewrite with modern UX and actionable empty states
 */
const ModernRedoxAnalysis = () => {
  log.debug('ModernRedoxAnalysis component initializing');
  
  // State management - isolate loading from Zustand re-renders
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Global filter/view state via Zustand store - OPTIMIZED: Single subscription with shallow equality
  const {
    selectedSites,
    setSelectedSites,
    timeRange,
    setTimeRange,
    filtersCollapsed,
    setFiltersCollapsed,
    selectedView,
    setSelectedView,
    maxFidelity,
    setMaxFidelity,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    invertY1,
    setInvertY1,
    invertY2,
    setInvertY2,
    invertX,
    setInvertX,
    invertY,
    setInvertY,
    invertRollingY,
    setInvertRollingY,
    invertSeriesY,
    setInvertSeriesY,
    allowedInversions,
    setAllowedInversions
  } = useRedoxStore(
    s => ({
      selectedSites: s.selectedSites,
      setSelectedSites: s.setSelectedSites,
      timeRange: s.timeRange,
      setTimeRange: s.setTimeRange,
      filtersCollapsed: s.filtersCollapsed,
      setFiltersCollapsed: s.setFiltersCollapsed,
      selectedView: s.selectedView,
      setSelectedView: s.setSelectedView,
      maxFidelity: s.maxFidelity,
      setMaxFidelity: s.setMaxFidelity,
      startDate: s.startDate,
      setStartDate: s.setStartDate,
      endDate: s.endDate,
      setEndDate: s.setEndDate,
      invertY1: s.invertY1,
      setInvertY1: s.setInvertY1,
      invertY2: s.invertY2,
      setInvertY2: s.setInvertY2,
      invertX: s.invertX,
      setInvertX: s.setInvertX,
      invertY: s.invertY,
      setInvertY: s.setInvertY,
      invertRollingY: s.invertRollingY,
      setInvertRollingY: s.setInvertRollingY,
      invertSeriesY: s.invertSeriesY,
      setInvertSeriesY: s.setInvertSeriesY,
      allowedInversions: s.allowedInversions,
      setAllowedInversions: s.setAllowedInversions
    }),
    shallow // Use Zustand's built-in shallow equality comparison
  );

  const chartTypeState = useState('line');
  const [chartType, setChartType] = chartTypeState;
  // Availability bounds from API (do not overwrite with current dataset window)
  const [availableMaxDate, setAvailableMaxDate] = useState('');
  const [availableMinDate, setAvailableMinDate] = useState('');
  // Track the intended active window for display (independent of data arrival)
  const [activeWindowStart, setActiveWindowStart] = useState('');
  const [activeWindowEnd, setActiveWindowEnd] = useState('');
  // In-page loading progress (per-site) for clear feedback
  const [loadProgress, setLoadProgress] = useState(null);
  const [primaryYAxis, setPrimaryYAxis] = useState('depth'); // 'depth' or 'redox'

  // Feature flag: prefer Arrow (binary columnar) when available (opt-in)
  const [preferArrow, setPreferArrow] = useState(false);

  // Hook-based loader removed here; file uses existing data pipeline

  // Site color palette - consistent colors for all charts
  const siteColors = useMemo(() => ({
    'S1': '#1f77b4',  // Blue
    'S2': '#ff7f0e',  // Orange  
    'S3': '#2ca02c',  // Green
    'S4': '#d62728',  // Red
    'S5': '#9467bd',  // Purple
    'S6': '#8c564b'   // Brown
  }), []);

  // Arrow parsing helper
  const parseArrowBufferToRows = useCallback(async (buffer, fallbackSite) => {
    try {
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (!buffer) return null;
      // Early guard: if response looks like JSON (error or fallback), skip Arrow parsing
      if (looksLikeJson(buffer) || buffer.byteLength < 128) {
        log.warn('[ARROW] Buffer does not look like Arrow; skipping parse and falling back');
        return null;
      }
      const mod = await loadArrowModule().catch((e) => { log.warn('[ARROW] Module load failed', e); return null; });
      if (!mod) return null;
      // tableFromIPC supports ArrayBuffer directly
      const table = mod.tableFromIPC(buffer);
      const n = table.numRows;
      const rows = new Array(n);
      // Build name->vector map robustly across Arrow versions
      const nameToVector = new Map();
      const fields = table?.schema?.fields || [];
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        const vec = table.getChildAt ? table.getChildAt(i) : (table.getColumnAt ? table.getColumnAt(i) : null);
        if (f?.name && vec) nameToVector.set(String(f.name), vec);
      }
      const colTs = nameToVector.get('measurement_timestamp') || nameToVector.get('timestamp') || null;
      const colEh = nameToVector.get('processed_eh') || nameToVector.get('redox_value_mv') || null;
      const colDepth = nameToVector.get('depth_cm') || null;
      const colSite = nameToVector.get('site_code') || null;
      // Convert to arrays where possible for faster access (except ts; use get(i) for correctness)
      const tsUnit = (colTs && colTs.type && (colTs.type.unit || colTs.type)) || null;
      const ehArr = colEh && colEh.toArray ? colEh.toArray() : null;
      const dArr = colDepth && colDepth.toArray ? colDepth.toArray() : null;
      const sArr = colSite && colSite.toArray ? colSite.toArray() : null;
      const toIso = (v) => {
        if (v == null) return undefined;
        if (v instanceof Date) return v.toISOString();
        if (typeof v === 'number') {
          // Assume milliseconds
          return new Date(v).toISOString();
        }
        if (typeof v === 'bigint') {
          const num = Number(v);
          // Heuristic if unit unknown
          // >1e15 -> nanoseconds; >1e12 -> microseconds; >1e10 -> seconds*1000
          let ms = num;
          const unitStr = String(tsUnit || '').toLowerCase();
          if (unitStr.includes('nano')) ms = num / 1e6;
          else if (unitStr.includes('micro')) ms = num / 1e3;
          else if (unitStr.includes('second') && !unitStr.includes('milli')) ms = num * 1000;
          else if (!unitStr) {
            if (num > 1e15) ms = num / 1e6; // ns
            else if (num > 1e12) ms = num / 1e3; // µs
            else if (num > 1e10) ms = num; // already ms
          }
          return new Date(ms).toISOString();
        }
        if (typeof v === 'string') return v;
        try { return new Date(v).toISOString(); } catch (_) { return undefined; }
      };
      for (let i = 0; i < n; i++) {
        const tsVal = colTs ? colTs.get(i) : undefined;
        const ts = toIso(tsVal);
        const eh = ehArr ? ehArr[i] : (colEh ? colEh.get(i) : undefined);
        const depth = dArr ? dArr[i] : (colDepth ? colDepth.get(i) : undefined);
        const site = sArr ? (sArr[i] || fallbackSite) : fallbackSite;
        rows[i] = { measurement_timestamp: ts, processed_eh: eh, depth_cm: depth, site_code: site };
      }
      return rows;
    } catch (e) {
      log.warn('[ARROW] Failed to parse Arrow buffer:', e);
      return null;
    }
  }, []);
  
  // Toast notifications
  const toast = useToast();
  const tutorial = useTutorial();

  // Incremental client cache (per-site, per-range) with persistence
  // Client cache removed
  const lastFetchKeyRef = React.useRef(null);
  const currentFetchIdRef = React.useRef(0);
  const requestAbortRef = React.useRef(null);
  const backgroundPrefetchRef = React.useRef(null);
  const [vizConfig, setVizConfig] = useState({
    resolutionByRange: {
      'Last 7 Days': '15min',
      'Last 30 Days': '30min',
      'Last 90 Days': '2H',
      'Last 6 Months': '6H',
      'Last 1 Year': '2H',
      'Last 2 Years': '1W'
    },
    chunkRanges: ['Last 90 Days', 'Last 6 Months', 'Last 1 Year', 'Last 2 Years'],
    maxDepthsDefault: 10,
    targetPointsDefault: 50000
  });

  // Load server-driven visualization config (resolution by range, chunking, default max depths)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cfg = await getRedoxSettings();
        if (!alive || !cfg) return;
        setVizConfig(prev => ({
          resolutionByRange: cfg.resolution_by_range || prev.resolutionByRange,
          chunkRanges: cfg.chunk_ranges || prev.chunkRanges,
          maxDepthsDefault: typeof cfg.max_depths_default === 'number' ? cfg.max_depths_default : prev.maxDepthsDefault,
          targetPointsDefault: typeof cfg.target_points_default === 'number' ? cfg.target_points_default : prev.targetPointsDefault
        }));
      } catch (e) { log.warn('[REDOX] Failed to load settings:', e); }
    })();
    return () => { alive = false; };
  }, []);

  // Client cache disabled; nothing to load or persist

  const metrics = useRedoxMetrics(data);

  // Chart data preparation
  const chartData = useMemo(() => {
    console.log('Chart data processing: data.length =', data.length, 'sample:', data[0]);
    if (!data.length) return { timeseries: [], scatter: [], zones: [], heatmap: [] };

    // eslint-disable-next-line no-unused-vars
    const colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd'];
    
    const USE_TYPED_THRESHOLD = 20000;
    const useTyped = data.length >= USE_TYPED_THRESHOLD;
    // Build per-site arrays; y series may be converted to typed arrays
    const perSite = buildPerSiteSeries(data, { useTyped });

    const useGL = data.length > 10000;
    const baseType = useGL ? 'scattergl' : 'scatter';

    // Determine axis assignment based on primary toggle
    const depthOnLeft = primaryYAxis === 'depth';

    // Time series traces: both metrics per site
    const timeseries = [];
    perSite.forEach((vals, site) => {
      // Depth trace
      timeseries.push({
        x: vals.x,
        y: vals.depth,
        name: `Site ${site} — Depth`,
        type: baseType,
        mode: chartType === 'line' ? 'lines' : 'markers',
        yaxis: depthOnLeft ? 'y' : 'y2',
        line: { width: useGL ? 1 : 2 },
        marker: { size: chartType === 'scatter' ? (useGL ? 3 : 6) : 3, symbol: 'circle-open' }
      });
      // Redox trace
      timeseries.push({
        x: vals.x,
        y: vals.redox,
        name: `Site ${site} — Redox`,
        type: baseType,
        mode: chartType === 'line' ? 'lines' : 'markers',
        yaxis: depthOnLeft ? 'y2' : 'y',
        line: { width: useGL ? 1 : 2 },
        marker: { size: chartType === 'scatter' ? (useGL ? 3 : 6) : 3 }
      });
    });

    // Scatter view becomes time vs markers for both metrics
    const scatter = [];
    perSite.forEach((vals, site) => {
      scatter.push({
        x: vals.x,
        y: vals.depth,
        name: `Site ${site} — Depth`,
        type: baseType,
        mode: 'markers',
        yaxis: depthOnLeft ? 'y' : 'y2',
        marker: { size: useGL ? 3 : 6, symbol: 'circle-open', opacity: 0.7 }
      });
      scatter.push({
        x: vals.x,
        y: vals.redox,
        name: `Site ${site} — Redox`,
        type: baseType,
        mode: 'markers',
        yaxis: depthOnLeft ? 'y2' : 'y',
        marker: { size: useGL ? 3 : 6, opacity: 0.7 }
      });
    });

    // Zone classification data
    const zoneData = {};
    const zoneColors = {
      'Highly Oxic': '#006400',
      'Oxic': '#32CD32', 
      'Suboxic': '#FFA500',
      'Moderately Reducing': '#FF4500',
      'Highly Reducing': '#8B0000'
    };
    
    data.forEach(d => {
      const redoxVal = (d.processed_eh != null ? d.processed_eh : d.redox_value_mv);
      if (redoxVal != null) {
        let zone = 'Unknown';
        if (redoxVal > 200) zone = 'Highly Oxic';
        else if (redoxVal > 50) zone = 'Oxic';
        else if (redoxVal > -50) zone = 'Suboxic';
        else if (redoxVal > -200) zone = 'Moderately Reducing';
        else zone = 'Highly Reducing';
        
        if (!zoneData[zone]) {
          zoneData[zone] = {
            x: [],
            y: [],
            name: zone,
            type: 'scatter',
            mode: 'markers',
            marker: { 
              color: zoneColors[zone],
              size: 6,
              opacity: 0.8
            }
          };
        }
        zoneData[zone].x.push(d.measurement_timestamp);
        zoneData[zone].y.push(redoxVal);
      }
    });

    // Heatmap (time x depth bins)
    const heatmap = (() => {
      if (!data.length) return [];
      const parseDate = (ts) => new Date(ts);
      // Bin timestamps by day
      const toDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0,10);
      // Bin depths to nearest 10 cm
      const toDepthBin = (v) => v == null ? null : Math.round(v/10)*10;
      const grid = new Map(); // key: day|depth -> { sum, count }
      const daysSet = new Set();
      const depthsSet = new Set();
      data.forEach(d => {
        if (d.redox_value_mv != null && d.depth_cm != null && d.measurement_timestamp) {
          const day = toDay(parseDate(d.measurement_timestamp));
          const depth = toDepthBin(d.depth_cm);
          const key = `${day}|${depth}`;
          daysSet.add(day);
          depthsSet.add(depth);
          const cur = grid.get(key) || { sum: 0, count: 0 };
          cur.sum += d.redox_value_mv;
          cur.count += 1;
          grid.set(key, cur);
        }
      });
      const days = Array.from(daysSet).sort();
      const depths = Array.from(depthsSet).sort((a,b)=>a-b);
      const z = depths.map(depth => days.map(day => {
        const cell = grid.get(`${day}|${depth}`);
        return cell ? cell.sum / cell.count : null;
      }));
      return [{ type: 'heatmap', x: days, y: depths, z, colorscale: 'RdBu', reversescale: true, colorbar: { title: 'mV' } }];
    })();

    return { timeseries, scatter, zones: Object.values(zoneData), heatmap };
  }, [data, chartType, primaryYAxis]);

  // Axis/parameter labels
  const parameterLabel = 'Depth & Redox';
  
  // Per-site counts for quick diagnostics in UI
  const perSiteCounts = useMemo(() => {
    const m = new Map();
    (data || []).forEach(r => {
      const sc = r?.site_code;
      if (!sc) return;
      m.set(sc, (m.get(sc) || 0) + 1);
    });
    return Array.from(m.entries()).sort(([a],[b]) => String(a).localeCompare(String(b)));
  }, [data]);

  // Efficient depth snapshot: aggregate near the active window end to reduce points
  const snapshotSeries = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    try {
      let refTs = activeWindowEnd || endDate || '';
      if (!refTs) {
        let maxTs = 0;
        for (const r of data) {
          const t = r?.measurement_timestamp ? new Date(r.measurement_timestamp).getTime() : NaN;
          if (Number.isFinite(t) && t > maxTs) maxTs = t;
        }
        if (maxTs > 0) refTs = new Date(maxTs).toISOString();
      }
      if (!refTs) return [];
      const refTime = new Date(refTs).getTime();
      const windowMinutes = 60; // 1-hour window around reference
      const halfWindow = windowMinutes * 60 * 1000;
      const binSize = 10; // cm

      const bySite = new Map(); // site -> Map(depthBin -> { sum, count })
      for (const r of data) {
        const t = r?.measurement_timestamp ? new Date(r.measurement_timestamp).getTime() : NaN;
        const d = Number(r?.depth_cm);
        const eh = Number(r?.processed_eh ?? r?.redox_value_mv);
        const site = r?.site_code;
        if (!Number.isFinite(t) || !Number.isFinite(d) || !Number.isFinite(eh) || !site) continue;
        if (Math.abs(t - refTime) > halfWindow) continue;
        const depthBin = Math.round(d / binSize) * binSize;
        if (!bySite.has(site)) bySite.set(site, new Map());
        const m = bySite.get(site);
        const cur = m.get(depthBin) || { sum: 0, count: 0 };
        cur.sum += eh;
        cur.count += 1;
        m.set(depthBin, cur);
      }
      // Fallback: if no points near refTs, use last seen per (site, depthBin)
      if ([...bySite.values()].every(m => m.size === 0)) {
        const lastSeen = new Map(); // key: site|bin -> { t, eh }
        for (const r of data) {
          const t = r?.measurement_timestamp ? new Date(r.measurement_timestamp).getTime() : NaN;
          const d = Number(r?.depth_cm);
          const eh = Number(r?.processed_eh ?? r?.redox_value_mv);
          const site = r?.site_code;
          if (!Number.isFinite(t) || !Number.isFinite(d) || !Number.isFinite(eh) || !site) continue;
          const depthBin = Math.round(d / binSize) * binSize;
          const key = `${site}|${depthBin}`;
          const prev = lastSeen.get(key);
          if (!prev || t > prev.t) lastSeen.set(key, { t, eh });
        }
        for (const [key, val] of lastSeen.entries()) {
          const [site, binStr] = key.split('|');
          const depthBin = Number(binStr);
          if (!bySite.has(site)) bySite.set(site, new Map());
          bySite.get(site).set(depthBin, { sum: val.eh, count: 1 });
        }
      }

      const traces = [];
      const useGL = data.length > 5000;
      for (const [site, m] of bySite.entries()) {
        const depths = Array.from(m.keys()).sort((a, b) => a - b);
        if (depths.length === 0) continue;
        const ehs = depths.map(bin => m.get(bin).sum / m.get(bin).count);
        const siteColor = siteColors[site] || '#666666'; // Default gray for unknown sites
        traces.push({ 
          x: ehs, 
          y: depths, 
          name: site, 
          type: useGL ? 'scattergl' : 'scatter', 
          mode: 'lines+markers', 
          marker: { size: 6, color: siteColor }, 
          line: { width: 2, color: siteColor } 
        });
      }
      return traces;
    } catch (e) {
      log.warn('[REDOX] snapshot compute failed', e);
      return [];
    }
  }, [data, activeWindowEnd, endDate, siteColors]);

  // Helpful dynamic subtitle summarizing selection and data
  const subtitleText = useMemo(() => {
    const sitesText = (selectedSites && selectedSites.length)
      ? `Sites ${selectedSites.join(', ')}`
      : 'All sites';
    // Prefer explicitly computed active window if available
    const start = (activeWindowStart || startDate || availableMinDate || '').slice(0, 10);
    const end = (activeWindowEnd || endDate || availableMaxDate || '').slice(0, 10);
    const rangeText = start && end ? `${start} to ${end}` : (end ? `through ${end}` : '');
    const count = metrics?.validMeasurements || 0;
    if (!count) {
      return [sitesText, rangeText].filter(Boolean).join(' • ');
    }
    return [`Showing ${count.toLocaleString()} measurements`, sitesText, rangeText]
      .filter(Boolean)
      .join(' • ');
  }, [selectedSites, startDate, endDate, availableMinDate, availableMaxDate, metrics]);

  // Details table columns (similar to Water Quality table)
  const tableColumns = useMemo(() => ([
    {
      key: 'measurement_timestamp',
      label: 'Time',
      format: (v) => v ? new Date(v).toLocaleString() : '-'
    },
    { key: 'site_code', label: 'Site', format: (v) => v ? `Site ${v}` : '-' },
    { key: 'depth_cm', label: 'Depth (cm)', format: (v) => (v ?? null) == null ? '-' : Number(v).toFixed(1) },
    { key: 'processed_eh', label: 'Processed Eh (mV)', format: (v) => (v ?? null) == null ? '-' : Number(v).toFixed(1) },
    { key: 'redox_value_mv', label: 'Raw Redox (mV)', format: (v) => (v ?? null) == null ? '-' : Number(v).toFixed(1) }
  ]), []);

  // Data fetching (in-file loader)
  const fetchData = useCallback(async () => {
    log.debug('fetchData called with:', {
      selectedSites,
      timeRange,
      startDate,
      endDate,
      selectedView
    });
    
    // Abort any previous request
    if (requestAbortRef.current) {
      log.debug('Aborting previous request');
      try { requestAbortRef.current.abort(); } catch (_) {}
    }
    const controller = new AbortController();
    requestAbortRef.current = controller;

    log.debug('Preparing to load');
    setError(null);

    // Show loading notification for slower queries (only for non-chunked paths)
    // We defer scheduling until after we know whether we're using chunking.
    let loadingToastId;
    let loadingTimeout = null;

    try {
      log.debug('Entering fetch try block');
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      // Stamp this request; only the latest fetch can commit results
      const fetchId = Date.now() + Math.random();
      currentFetchIdRef.current = fetchId;
      const rangeKey = (timeRange === 'Custom Range' && startDate && endDate)
        ? `custom|${startDate}|${endDate}`
        : `range|${timeRange}`;
      const fidelitySig = maxFidelity ? 'max' : 'std';
      const cacheRangeKey = `${rangeKey}|${fidelitySig}|${selectedView}`;
      const fetchKey = [selectedSites.join(','), rangeKey, fidelitySig, selectedView].join('|');
      log.debug('Generated fetchKey:', fetchKey);
      // Reset progress UI for new fetch
      setLoadProgress(null);
      // Client cache disabled; no pruning
      
      if (lastFetchKeyRef.current === fetchKey) {
        log.debug('Same fetch key as before, skipping');
        if (isMountedRef.current) setLoading(false);
        return;
      }

      // Always use server results; show loading UI
      setLoading(true);

      // Determine date window
      log.debug('[FETCH] Determining date window...');
      let startTsIso = startDate;
      let endTsIso = endDate;
      const daysMap = {
        'Last 7 Days': 7,
        'Last 30 Days': 30,
        'Last 90 Days': 90,
        'Last 6 Months': 180,
        'Last 1 Year': 365,
        'Last 2 Years': 730
      };
      if (timeRange === 'Custom Range' && startDate && endDate) {
        log.info('[FETCH] Using custom date range:', { startTsIso, endTsIso });
        setActiveWindowStart(startTsIso);
        setActiveWindowEnd(endTsIso);
      } else {
        log.debug('[FETCH] Calling getRedoxDateRange for sites:', selectedSites);
        const range = await getRedoxDateRange(selectedSites);
        log.debug('[FETCH] Date range response:', range);
        const earliest = range?.earliest_date;
        const latest = range?.latest_date;
        if (earliest && latest) {
          // Compute window based on selected preset, bounded by available data
          const { startIso, endIso } = computePresetWindow(earliest, latest, timeRange);
          startTsIso = startIso;
          endTsIso = endIso;
          setAvailableMinDate(earliest);
          setAvailableMaxDate(latest);
          // Update intended active window display
          setActiveWindowStart(startTsIso);
          setActiveWindowEnd(endTsIso);
          log.info('[FETCH] preset=%s earliest=%s latest=%s => startTsIso=%s endTsIso=%s',
            timeRange, earliest, latest, startTsIso, endTsIso);
        } else {
          log.warn('[FETCH] No valid date range returned');
        }
      }

      // Fetch MV-backed datasets per selected view with smart chunking
      log.debug('[FETCH] Building API promises for view:', selectedView);
      const promises = [];
      const siteIds = selectedSites || [];
      
      // Determine if we should use chunked loading for large datasets
      const largeDatasetRanges = vizConfig.chunkRanges || [];
      const shouldChunk = largeDatasetRanges.includes(timeRange);
      const chunkSize = shouldChunk ? (maxFidelity ? 50000 : 25000) : null; // Larger chunk in max fidelity

      // In-page progress indicator only (avoid extra loading toasts)
      if (!shouldChunk) {
        setLoadProgress({ mode: 'single', windowStart: startTsIso, windowEnd: endTsIso, sites: siteIds });
      }
      
      if (shouldChunk) {
        log.info('Large dataset detected, using chunked loading, chunkSize:', chunkSize);
      }
      
      if (selectedView === 'timeseries' || selectedView === 'rolling') {
        log.debug('Creating promises for time series/rolling view');
        // Choose a reasonable server-side aggregation based on timeRange
        const resolutionByRange = vizConfig.resolutionByRange || {};
        // Prefer server-side auto depth selection; no hardcoded depths
        // In max fidelity, prefer raw resolution and disable thinning
        const suggestedResolution = maxFidelity ? null : (resolutionByRange[timeRange] || null); // null -> raw
        const maxDepths = maxFidelity ? 9999 : (vizConfig.maxDepthsDefault || 10);
        const targetPoints = maxFidelity ? undefined : (vizConfig.targetPointsDefault || undefined);
        // Log summary for non-chunk path
        const sourceMode = maxFidelity ? 'raw' : 'processed';
        log.debug('[FETCH SUMMARY]', {
          preferArrow,
          source: sourceMode,
          resolution: suggestedResolution || 'raw',
          maxDepths,
          targetPoints: targetPoints || null,
          shouldChunk,
          chunkSize,
          startTsIso,
          endTsIso,
          sites: siteIds
        });
        // For rolling view or when chunking is disabled, keep existing parallel single-call behavior.
        if (selectedView === 'rolling' || !shouldChunk) {
          for (const s of siteIds) {
            if (selectedView === 'timeseries') {
              log.debug('Adding timeseries promise for site:', s, 'full dataset');
              if (preferArrow) {
                log.debug('[REQ] Arrow', { site: s, source: sourceMode, resolution: suggestedResolution || 'raw', maxDepths, startTsIso, endTsIso });
                promises.push((async () => {
                  try {
                    const res = await getProcessedEhTimeSeriesArrow({
                      siteId: s,
                      startTs: startTsIso,
                      endTs: endTsIso,
                      resolution: suggestedResolution,
                      maxDepths,
                      source: maxFidelity ? 'raw' : 'processed',
                      maxFidelity: maxFidelity || undefined,
                      ...(targetPoints ? { targetPoints } : {})
                    }, controller.signal);
                    const rows = await parseArrowBufferToRows(res?.buffer, s);
                    if (rows && rows.length) {
                      return { data: rows, metadata: { total_records: res?.headers?.totalRecords || rows.length } };
                    }
                    // Fallback to columnar JSON if Arrow unavailable or empty
                    const jsonRes = await getProcessedEhTimeSeries({ 
                      siteId: s, startTs: startTsIso, endTs: endTsIso,
                      resolution: suggestedResolution, maxDepths,
                      source: maxFidelity ? 'raw' : 'processed',
                      maxFidelity: maxFidelity || undefined,
                      ...(targetPoints ? { targetPoints } : {})
                    }, controller.signal);
                    return jsonRes;
                  } catch (e) {
                    log.info('[REDOX] Arrow path failed, falling back to JSON:', e?.message || e);
                    return await getProcessedEhTimeSeries({ 
                      siteId: s, startTs: startTsIso, endTs: endTsIso,
                      resolution: suggestedResolution, maxDepths,
                      source: maxFidelity ? 'raw' : 'processed',
                      maxFidelity: maxFidelity || undefined,
                      ...(targetPoints ? { targetPoints } : {})
                    }, controller.signal);
                  }
                })());
              } else {
                log.debug('[REQ] JSON', { site: s, source: sourceMode, resolution: suggestedResolution || 'raw', maxDepths, startTsIso, endTsIso, targetPoints });
                promises.push(getProcessedEhTimeSeries({ 
                  siteId: s, 
                  startTs: startTsIso, 
                  endTs: endTsIso,
                  resolution: suggestedResolution,
                  maxDepths,
                  source: maxFidelity ? 'raw' : 'processed',
                  maxFidelity: maxFidelity || undefined,
                  ...(targetPoints ? { targetPoints } : {})
                }, controller.signal));
              }
            } else {
              log.debug('Adding rolling mean promise for site:', s);
              promises.push(getProcessedEhRollingMean({ siteId: s, startTs: startTsIso, endTs: endTsIso }, controller.signal));
            }
          }
        } else {
          // Chunked loading path with real-time progress updates via toast
        log.info('Using chunked loading with in-page progress');

          // Track per-site progress and overall progress
          const perSite = Object.fromEntries(siteIds.map(s => [s, { loaded: 0, total: null }]));
          // Throttle progress updates to reduce re-renders
          let lastUpdateTs = 0;
          const updateProgressToast = () => {
            const now = Date.now();
            if (now - lastUpdateTs < 200) return; // throttle to ~5 fps
            lastUpdateTs = now;
            const parts = siteIds.map(s => {
              const p = perSite[s];
              const total = p.total ?? '…';
              const pct = p.total ? Math.min(100, Math.round((p.loaded / p.total) * 100)) : 0;
              return `Site ${s}: ${p.loaded.toLocaleString()} / ${typeof total === 'number' ? total.toLocaleString() : total} (${pct}%)`;
            });
            const message = parts.join('\n'); // used for internal log if needed
            // Also update in-page progress panel
            const totals = siteIds.reduce((acc, s) => {
              acc.loaded += perSite[s].loaded || 0;
              acc.total += (perSite[s].total || 0);
              return acc;
            }, { loaded: 0, total: 0 });
            // Clamp expected total so it never displays smaller than loaded
            const expected = totals.total && totals.total < totals.loaded ? totals.loaded : (totals.total || null);
            setLoadProgress({
              mode: 'chunk',
              perSite: JSON.parse(JSON.stringify(perSite)),
              totalLoaded: totals.loaded,
              totalExpected: expected,
              sites: siteIds,
              windowStart: startTsIso,
              windowEnd: endTsIso
            });
          };

          // Helper to load all chunks for a site sequentially
          const loadAllChunksForSite = async (site) => {
            let offset = 0;
            let siteMerged = [];
            let allowedLocal = {};
            while (true) {
              if (controller.signal?.aborted) {
                log.warn('Abort detected during chunk loop; site:', site);
                const err = new Error('Request cancelled');
                err.name = 'RequestCancelled';
                err.type = 'CANCELLED';
                throw err;
              }

              let resp;
              if (preferArrow) {
                log.debug('[REQ-CHUNK] Arrow', { site, source: sourceMode, startTsIso, endTsIso, chunkSize, offset, resolution: suggestedResolution || 'raw', maxDepths });
                const resArrow = await getProcessedEhTimeSeriesArrow({
                  siteId: site,
                  startTs: startTsIso,
                  endTs: endTsIso,
                  chunkSize: chunkSize,
                  offset,
                  resolution: suggestedResolution,
                  maxDepths,
                  source: maxFidelity ? 'raw' : 'processed',
                  maxFidelity: maxFidelity || undefined,
                  ...(targetPoints ? { targetPoints } : {})
                }, controller.signal);
                let rows = await parseArrowBufferToRows(resArrow?.buffer, site);
                if (!rows || rows.length === 0) {
                  // Fallback to JSON columnar if arrow empty/unavailable
                  log.info('[FALLBACK JSON-CHUNK]', { site, source: sourceMode, startTsIso, endTsIso, chunkSize, offset });
                  resp = await getProcessedEhTimeSeries({ 
                    siteId: site, 
                    startTs: startTsIso, 
                    endTs: endTsIso,
                    chunkSize: chunkSize,
                    offset,
                    resolution: suggestedResolution,
                    maxDepths,
                    source: maxFidelity ? 'raw' : 'processed',
                    maxFidelity: maxFidelity || undefined,
                    ...(targetPoints ? { targetPoints } : {})
                  }, controller.signal);
                } else {
                  resp = { data: rows, metadata: { total_records: resArrow?.headers?.totalRecords || rows.length, chunk_info: { offset: resArrow?.headers?.chunkOffset || 0, chunk_size: resArrow?.headers?.chunkSize || chunkSize || 0, has_more: !!resArrow?.headers?.chunkHasMore } } };
                }
              } else {
                log.debug('[REQ-CHUNK] JSON', { site, source: sourceMode, startTsIso, endTsIso, chunkSize, offset, resolution: suggestedResolution || 'raw', maxDepths, targetPoints });
                resp = await getProcessedEhTimeSeries({ 
                  siteId: site, 
                  startTs: startTsIso, 
                  endTs: endTsIso,
                  chunkSize: chunkSize,
                  offset,
                  resolution: suggestedResolution,
                  maxDepths,
                  source: maxFidelity ? 'raw' : 'processed',
                  maxFidelity: maxFidelity || undefined,
                  ...(targetPoints ? { targetPoints } : {})
                }, controller.signal);
              }

              // Normalize response: handle columnar format for reduced payloads
              let arr = resp?.data || [];
              if ((!arr || arr.length === 0) && resp?.data_columnar) {
                const col = resp.data_columnar;
                const n = (col.measurement_timestamp || col.processed_eh || []).length;
                arr = columnarToRows(col, site);
              }
              const metadata = resp?.metadata || {};
              if (metadata.allowed_inversions) allowedLocal = metadata.allowed_inversions;
              if (perSite[site].total == null && typeof metadata.total_records === 'number') {
                perSite[site].total = metadata.total_records;
              }

              // Normalize and merge
              // Force-tag rows with the requested site to avoid cross-site bleed
              const normalized = arr.map(row => ({ ...row, site_code: site }));
              // Avoid push(...array) which can overflow the call stack with large chunks
              siteMerged = siteMerged.concat(normalized);

              // Update per-site loaded counter and global data immediately for real-time UI updates
              perSite[site].loaded = siteMerged.length;
              updateProgressToast();

              // Do not update UI state mid-chunk to avoid interleaving/mixing.
              // We'll commit once after all sites finish.

              const hasMore = !!metadata?.chunk_info?.has_more;
      if (!hasMore) {
        return { site, data: siteMerged, allowed: allowedLocal, metadata };
      }
              const nextOffset = metadata?.chunk_info?.offset + (metadata?.chunk_info?.chunk_size || chunkSize || 0);
              offset = Number.isFinite(nextOffset) ? nextOffset : (offset + (chunkSize || 0));
            }
          };

          // Kick off per-site chunk loading concurrently
          // Limit concurrency to smooth memory usage
          const concurrency = 2;
          const resultsAcc = [];
          for (let i = 0; i < siteIds.length; i += concurrency) {
            const batch = siteIds.slice(i, i + concurrency).map(s => loadAllChunksForSite(s));
            const batchResults = await Promise.all(batch);
            resultsAcc.push(...batchResults);
          }
          const chunkResults = resultsAcc;

          // Convert chunked results to shape compatible with downstream merging logic
          chunkResults.forEach(({ site, data: siteData, allowed: allowedLocal, metadata }) => {
            // Push a synthetic response-like object into results array
            promises.push(Promise.resolve({ data: siteData, metadata: { ...metadata, allowed_inversions: allowedLocal } }));
          });

          // Convert the in-flight loading toast to success summary
          const totalLoaded = siteIds.reduce((sum, s) => sum + (perSite[s].loaded || 0), 0);
          const totalExpected = siteIds.some(s => perSite[s].total == null) 
            ? null 
            : siteIds.reduce((sum, s) => sum + (perSite[s].total || 0), 0);
          // Clear in-page progress only; final toast handled by success/warning later
          setLoadProgress(null);
        }
      } else if (selectedView === 'snapshot') {
        log.debug('Creating promises for snapshot view');
        const snapshotTs = endTsIso || new Date().toISOString();
        for (const s of siteIds) {
          log.debug('Adding snapshot promise for site:', s, 'ts:', snapshotTs);
          promises.push(getProcessedEhDepthSnapshot({ siteId: s, ts: snapshotTs }, controller.signal));
        }
      } else {
        log.info('Using fallback legacy data fetch for view:', selectedView);
        promises.push(getRedoxAnalysisData({ sites: selectedSites, time_range: timeRange, start_date: startDate, end_date: endDate }, controller.signal));
      }
      
      log.debug('[FETCH] Total promises created:', promises.length);
      log.debug('[FETCH] started fetchId=', currentFetchIdRef.current);
      log.debug('[FETCH] Calling Promise.all with', promises.length, 'promises');
      const results = await Promise.all(promises);
      const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      log.debug('[FETCH] resolved fetchId=', currentFetchIdRef.current, 'results.len=', results.length);
      // If a newer fetch started, ignore these results
      if (currentFetchIdRef.current !== fetchId) {
        log.debug('Stale results ignored for fetchId', fetchId);
        return;
      }
      
      const merged = [];
      let allowed = {};
      let chunkingInfo = null;
      
      results.forEach((res, idx) => {
        console.log('Processing result index', idx, 'summary:', { hasData: !!res?.data, hasColumnar: !!res?.data_columnar, response: res });
        // Legacy fallback response shape
        const site = siteIds[idx] || selectedSites[idx] || selectedSites[0];
        let arr = res?.data || res?.redox_data || [];
        if ((!arr || arr.length === 0) && res?.data_columnar) {
          arr = columnarToRows(res.data_columnar, site);
        }
        console.log('Extracted data for site', site, ':', arr.length, 'records', 'sample:', arr[0]);
        
        // Check for chunking information
        const metadata = res?.metadata || {};
        if (metadata.chunked) {
          chunkingInfo = {
            site: site,
            totalRecords: metadata.total_records,
            returnedRecords: metadata.returned_records,
            hasMore: metadata.chunk_info?.has_more,
            chunkSize: metadata.chunk_info?.chunk_size
          };
          log.debug('Chunking info for site', site, ':', chunkingInfo);
        }
        
        if (res?.metadata?.allowed_inversions) allowed = res.metadata.allowed_inversions;
        // Force-tag rows with the requested site to avoid cross-site bleed
        for (const row of arr) merged.push({ ...row, site_code: site });
      });
      log.info('[FETCH] Final merged data length:', merged.length);

      // Populate per-site cache with fetched results to prevent immediate re-loading overlays
      // Client-side caching disabled to reduce complexity and stale interleaving
      
      // Show data loading summary with detailed information
      const sitesText = selectedSites.join(', ');
      const recordsFormatted = merged.length.toLocaleString();
      const elapsedMs = (t1 - t0);
      const loadingTime = (elapsedMs / 1000).toFixed(2);
      const rate = elapsedMs > 0 ? (merged.length / (elapsedMs / 1000)) : 0;
      const rateStr = `${Math.round(rate).toLocaleString()} rec/s`;
      
      // Create different messages for chunked vs full loading
      // Include a compact active window preview (YYYY-MM-DD → YYYY-MM-DD)
      const wStart = (startTsIso || '').slice(0, 10);
      const wEnd = (endTsIso || '').slice(0, 10);
      const windowSuffix = (wStart && wEnd) ? ` • Window: ${wStart} → ${wEnd}` : '';
      const modeSuffix = maxFidelity ? ' • Mode: Max Fidelity' : '';
      let loadingMessage = `Loaded ${recordsFormatted} redox records for sites ${sitesText}${windowSuffix}${modeSuffix} • ${loadingTime}s • ${rateStr}`;
      let title = '📊 Data Loading Complete';
      
      if (chunkingInfo) {
        const totalAvailable = chunkingInfo.totalRecords?.toLocaleString() || 'unknown';
        loadingMessage = chunkingInfo.hasMore 
          ? `Loaded ${recordsFormatted} records (first chunk of ${totalAvailable} total) for sites ${sitesText}${windowSuffix}${modeSuffix} • ${loadingTime}s • ${rateStr}`
          : `Loaded ${recordsFormatted} records for sites ${sitesText}${windowSuffix}${modeSuffix} • ${loadingTime}s • ${rateStr}`;
        title = chunkingInfo.hasMore ? '📦 Chunk Loading Complete' : '📊 Data Loading Complete';
      }
      
      if (merged.length === 0) {
        toast.showWarning(
          `No redox records found for sites ${sitesText}${windowSuffix}${modeSuffix}`,
          { title: 'No Data Available', duration: 4000, dedupeKey: `redox-nodata|${selectedSites.join(',')}|${timeRange}|${selectedView}` }
        );
      } else {
        toast.showSuccess(
          loadingMessage,
          {
            title: title,
            dedupeKey: `redox-success|${selectedSites.join(',')}|${timeRange}|${selectedView}`,
            duration: 5000,
            actions: [{
              id: 'details',
              label: 'View Details',
              action: () => {
              const avgRecordsPerSite = Math.round(merged.length / selectedSites.length);
              const timeRangeDesc = timeRange === 'Custom Range' ? 
                `${startDate?.slice(0,10)} to ${endDate?.slice(0,10)}` : 
                timeRange;
              
              let details = `Dataset Details:\n• Time Range: ${timeRangeDesc}\n• Loaded Records: ${recordsFormatted}\n• Sites: ${selectedSites.length} (${sitesText})\n• Avg per Site: ${avgRecordsPerSite.toLocaleString()}\n• View: ${selectedView}\n• Load Time: ${loadingTime}s\n• Rate: ${rateStr}`;
              
              if (chunkingInfo) {
                details += `\n\n📦 Chunking Info:\n• Total Available: ${chunkingInfo.totalRecords?.toLocaleString() || 'unknown'}\n• Chunk Size: ${chunkingInfo.chunkSize?.toLocaleString() || 'N/A'}\n• More Available: ${chunkingInfo.hasMore ? 'Yes' : 'No'}`;
                if (chunkingInfo.hasMore) {
                  details += `\n• Next chunk will load ${Math.min(chunkingInfo.chunkSize || 25000, (chunkingInfo.totalRecords || 0) - merged.length).toLocaleString()} more records`;
                }
              }
              
                toast.showInfo(
                  details,
                  {
                    title: '📈 Dataset Summary',
                    duration: 8000
                  }
                );
              }
            }]
          }
        );
      }
      
      // Merge with defaults so inversion controls remain enabled unless explicitly disabled by server
      const defaults = { y1: true, y2: true, x: true, y: true };
      setAllowedInversions({ ...defaults, ...(allowed || {}) });
      // Only commit if still latest
      if (currentFetchIdRef.current === fetchId) {
        console.log('Setting redox data:', merged.length, 'records. Sample:', merged[0]);
        setData(merged);
        // Ensure overlay is cleared as soon as data is committed
        if (isMountedRef.current) setLoading(false);
        try {
          let minTs = Number.POSITIVE_INFINITY, maxTs = 0;
          for (let i = 0; i < merged.length; i++) {
            const t = merged[i]?.measurement_timestamp ? new Date(merged[i].measurement_timestamp).getTime() : NaN;
            if (Number.isFinite(t)) { if (t < minTs) minTs = t; if (t > maxTs) maxTs = t; }
          }
          if (Number.isFinite(minTs) && Number.isFinite(maxTs) && maxTs > 0) {
            log.info('[COMMIT] final data window', new Date(minTs).toISOString(), '→', new Date(maxTs).toISOString());
          }
        } catch (e) { console.debug('[REDOX] window compute log failed:', e); }
      } else {
        log.debug('[FETCH] stale results ignored for fetchId=', fetchId);
      }
      // mark request key to prevent redundant fetches
      lastFetchKeyRef.current = fetchKey;
      log.debug('Data set successfully, marking fetchKey:', fetchKey);

      // Clear loading timeout and toast
      clearTimeout(loadingTimeout);
      if (loadingToastId) {
        toast.removeToast(loadingToastId);
      }
      // Clear in-page progress (for non-chunk path)
      setLoadProgress(null);
      } catch (err) {
      // Ignore cancellations and keep existing data
      log.debug('Error caught in fetch:', err);
      const cancelled = isRequestCancelled(err);
      if (cancelled) {
        log.info('Request cancelled, stopping');
        if (isMountedRef.current) setLoading(false);
        return;
      }
      log.error('Redox data fetch error:', err);
      if (isMountedRef.current) setError(err.message);
      
      toast.showError(
        `Failed to load redox analysis: ${err.message}`,
        {
          title: 'Analysis Failed',
          actions: [{
            id: 'retry',
            label: 'Retry',
            action: () => fetchData()
          }]
        }
      );
    } finally {
      log.debug('Finally block reached, setting loading to false');
      if (isMountedRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSites, timeRange, startDate, endDate, maxFidelity, selectedView]);

  // Proper debounced data fetching using local fetchData
  useEffect(() => {
    log.debug('useEffect triggered with:', {
      selectedSitesLength: selectedSites.length,
      selectedSites,
      timeRange,
      startDate,
      endDate,
      maxFidelity
    });
    
    if (selectedSites.length > 0) {
      log.debug('Setting 300ms debounce timer');
      // Debounce API calls by 300ms to prevent rapid successive calls
      const debounceTimeout = setTimeout(() => {
        log.debug('Debounce timer fired, calling fetchData');
        fetchData();
      }, 300);
      
      return () => {
        log.debug('Cleanup: clearing debounce timer');
        clearTimeout(debounceTimeout);
      };
    } else {
      log.debug('No sites selected, skipping data fetch');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSites, timeRange, startDate, endDate, maxFidelity, selectedView]);

  // REMOVED: Problematic view change effect that was causing infinite loops
  // The main debounced effect above already handles selectedView changes

  // Mounted flag to prevent state updates after unmount
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      try { requestAbortRef.current?.abort(); } catch (_) {}
    };
  }, []);

  // Background prefetch removed to simplify and avoid stale UI/caches

  // Fetch authoritative date range bounds from API for selected sites
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!selectedSites || selectedSites.length === 0) return;
        const resp = await getRedoxDateRange(selectedSites);
        const earliest = resp?.earliest_date;
        const latest = resp?.latest_date;
        if (!alive) return;
        if (earliest) setAvailableMinDate(earliest);
        if (latest) setAvailableMaxDate(latest);
      } catch (e) {
        log.warn('[REDOX] date range API failed; falling back to dataset-derived bounds');
      }
    })();
    return () => { alive = false; };
  }, [selectedSites.join(',')]);

  // Filter handlers
  const handleSiteChange = useCallback((sites) => {
    setSelectedSites(sites);
  }, []);

  const handleTimeRangeChange = useCallback((range) => {
    try { log.debug('[PARENT] onTimeRangeChange received:', range); } catch (_) {}
    setTimeRange(range);
    try { log.debug('[PARENT] timeRange state queued:', range); } catch (_) {}
  }, []);

  const handleApplyFilters = useCallback(() => {
    // No need to call fetchData() directly - the debounced useEffect will handle it
    // This prevents duplicate API calls when Apply button is clicked
  }, []);

  // Empty state context with actionable guidance
  const emptyStateContext = {
    onSiteChange: (sites) => {
      setSelectedSites(sites);
      // The debounced useEffect will handle data fetching automatically
    },
    onTimeRangeChange: (range) => {
      setTimeRange(range);
      // The debounced useEffect will handle data fetching automatically
    },
    onRetry: fetchData,
    onShowSample: () => {
      // Show sample data or tutorial using toast notification
      toast.showInfo(
        'Sample data tutorial feature will be available in a future update.',
        { 
          title: 'Feature Coming Soon',
          duration: 4000
        }
      );
    },
    tips: [
      'Redox measurements are typically available for Sites 1 and 2',
      'Try extending the time range to Last 1 Year for more data',
      'Redox data collection may be seasonal - check different time periods',
      'Contact your site administrator if data should be available'
    ],
    errorMessage: error
  };

  // Log record date range whenever data changes and update min/max available
  useEffect(() => {
    if (!Array.isArray(data) || data.length === 0) return;
    log.debug('[DATA ANALYSIS] Starting test for identical values with', data.length, 'records');
    try {
      let maxTs = 0;
      let minTs = Number.POSITIVE_INFINITY;
      const siteStats = new Map(); // Track per-site statistics
      
      for (const r of data) {
        const site = r?.site_code;
        const t = r?.measurement_timestamp ? new Date(r.measurement_timestamp).getTime() : NaN;
        
        // Track timestamp range
        if (Number.isFinite(t)) {
          if (t > maxTs) maxTs = t;
          if (t < minTs) minTs = t;
        }
        
        // Track per-site data for identical values test
        if (site) {
          if (!siteStats.has(site)) {
            siteStats.set(site, {
              count: 0,
              uniqueTimestamps: new Set(),
              uniqueDepths: new Set(),
              uniqueEhValues: new Set(),
              timestampDepthPairs: new Set()
            });
          }
          const stats = siteStats.get(site);
          stats.count++;
          if (r.measurement_timestamp) stats.uniqueTimestamps.add(r.measurement_timestamp);
          if (r.depth_cm != null) stats.uniqueDepths.add(r.depth_cm);
          if (r.processed_eh != null) stats.uniqueEhValues.add(r.processed_eh);
          if (r.measurement_timestamp && r.depth_cm != null) {
            stats.timestampDepthPairs.add(`${r.measurement_timestamp}|${r.depth_cm}`);
          }
        }
      }
      
      // Date range logging
      if (Number.isFinite(maxTs) && maxTs > 0) {
        const latest = new Date(maxTs).toISOString().slice(0, 10);
        log.info('[REDOX] latest record date (from data change):', latest);
      }
      if (Number.isFinite(minTs) && minTs > 0 && minTs !== Number.POSITIVE_INFINITY) {
        const earliest = new Date(minTs).toISOString().slice(0, 10);
        log.info('[REDOX] earliest record date (from data change):', earliest);
      }
      
      // Identical data overlap diagnostic removed for cleaner UX/logs
    } catch (e) {
      log.warn('[REDOX] data analysis failed', e);
    }
  }, [data]);

  return (
    <div className="modern-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Redox Analysis</h1>
          <p className="dashboard-subtitle">{subtitleText}</p>
          <p style={{ color: '#6c757d', margin: 0, fontSize: '0.85rem' }}>
            Tip: Use the Y1/Y2 toggle to swap Depth and Redox axes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={fetchData}
            disabled={loading}
          >
            <i className={`bi ${loading ? 'bi-arrow-repeat' : 'bi-arrow-clockwise'} me-1`}></i> Refresh
          </button>
          <button
            className={`btn btn-${maxFidelity ? 'primary' : 'outline-primary'} btn-sm`}
            onClick={() => setMaxFidelity(v => !v)}
            title="Toggle maximum fidelity (raw, no thinning)"
            disabled={loading}
          >
            <i className="bi bi-brightness-high me-1"></i>
            {maxFidelity ? 'Max Fidelity: On' : 'Max Fidelity: Off'}
          </button>
          <ExportButton
            data={data}
            filename={`redox_analysis_${selectedSites.join('_')}_${timeRange.toLowerCase().replace(/\s+/g, '_')}`}
            chartElementId="redox-analysis-chart"
            availableFormats={['csv', 'json', 'png', 'pdf']}
            variant="outline-success"
            size="sm"
            disabled={data.length === 0}
            onExportStart={() => { /* Export started - handled by ExportButton internally */ }}
            onExportComplete={() => { /* Export completed - handled by ExportButton internally */ }}
            onExportError={() => { /* Export error - handled by ExportButton internally */ }}
          />
        </div>
      </div>

      {/* Filter Panel */}
      <SidebarFilters
        collapsed={filtersCollapsed}
        onToggleCollapse={() => setFiltersCollapsed(!filtersCollapsed)}
        top={tutorial.enabled ? (
          <div style={{ padding: '0.75rem 1rem' }}>
            <TutorialHint id="redox-filters" title="Filters">
              Choose sites and a date range, then click Apply. Custom ranges are limited to the available data window.
            </TutorialHint>
          </div>
        ) : null}
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
        maxDate={availableMaxDate}
        minDate={availableMinDate}
      />

      {/* Main Content */}
      <div className="main-content">
        {loading ? (
          <RedoxProgress loadProgress={loadProgress} selectedSites={selectedSites} maxFidelity={maxFidelity} activeWindowStart={activeWindowStart} activeWindowEnd={activeWindowEnd} />
        ) : error ? (
          <EmptyState
            type="error"
            context={emptyStateContext}
          />
        ) : data.length === 0 ? (
          <EmptyState
            type="no-redox-data"
            context={emptyStateContext}
          />
        ) : (
          <>
            {/* Metrics Grid */}
            <RedoxMetrics metrics={metrics} />

            {/* Chart Controls */}
            <div className="chart-container">
              <div className="chart-header">
                <div>
                  <h3 className="chart-title">
                    <i className="bi bi-beaker me-2"></i>
                    Redox Analysis
                  </h3>
                  <p style={{ color: '#6c757d', fontSize: '0.9rem', margin: 0 }}>
                    {`${(data?.length || 0).toLocaleString()} points · ${selectedView === 'timeseries' ? 'Time Series' : selectedView.charAt(0).toUpperCase() + selectedView.slice(1)} · ${maxFidelity ? 'Max Fidelity' : 'Standard'}`}
                  </p>
                  <div style={{ marginTop: 4 }}>
                    <span className={`badge ${maxFidelity ? 'bg-primary' : 'bg-secondary'}`} title={maxFidelity ? 'Raw cadence, no thinning' : 'Resolution-by-range with smart thinning'}>
                      {maxFidelity ? 'Max Fidelity' : 'Standard Mode'}
                    </span>
                  </div>
                  {perSiteCounts.length > 0 && (
                    <p style={{ color: '#6c757d', fontSize: '0.85rem', margin: 0 }}>
                      {perSiteCounts.map(([sc, n], i) => (
                        <span key={sc} style={{ marginRight: 8 }}>
                          {`${sc}: ${n.toLocaleString()}${i < perSiteCounts.length - 1 ? ' ·' : ''}`}
                        </span>
                      ))}
                    </p>
                  )}
                  {tutorial.enabled && (
                    <div style={{ marginTop: 8 }}>
                      <TutorialHint id="redox-chart-controls" title="Chart Controls">
                        Use View to switch between Time Series, Depth Profile, Zones, and Heatmap. 
                        In Time Series, the Y1/Y2 toggle swaps Depth and Redox axes.
                      </TutorialHint>
                    </div>
                  )}
                </div>
                <div className="chart-controls">
                  <select
                    value={selectedView}
                    onChange={(e) => setSelectedView(e.target.value)}
                    style={{
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #dee2e6',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      marginRight: '0.5rem',
                      background: 'white'
                    }}
                    >
                      <option value="timeseries">Time Series</option>
                      <option value="snapshot">Depth Snapshot</option>
                      <option value="rolling">Rolling Trend (24h mean)</option>
                      <option value="details">Table View</option>
                    </select>
                  
                  {selectedView === 'timeseries' && (
                    <select
                      value={chartType}
                      onChange={(e) => setChartType(e.target.value)}
                      style={{
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #dee2e6',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        background: 'white'
                      }}
                    >
                      <option value="line">Line Chart</option>
                      <option value="scatter">Scatter Plot</option>
                    </select>
                  )}
                  {selectedView === 'timeseries' && (
                    <label className="form-check" style={{ marginLeft: '0.5rem', userSelect: 'none' }} title="Use Apache Arrow for high-volume loads">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        checked={preferArrow}
                        onChange={(e) => setPreferArrow(e.target.checked)}
                      />
                      <span className="form-check-label" style={{ marginLeft: 6 }}>Binary (Arrow)</span>
                    </label>
                  )}
                  {/* Single-axis inversion for per-depth series */}
                  {selectedView === 'timeseries' && (
                    <button
                      className="btn btn-outline-secondary btn-sm ms-2"
                      onClick={() => setInvertSeriesY(v => !v)}
                      title="Invert Y axis"
                    >
                      <i className="bi bi-arrow-down-up me-1"></i> Invert Y
                    </button>
                  )}
                  {selectedView === 'rolling' && (
                    <button
                      className="btn btn-outline-secondary btn-sm ms-2"
                      onClick={() => setInvertRollingY(v => !v)}
                      title="Invert Y axis"
                    >
                      <i className="bi bi-arrow-down-up me-1"></i> Invert Y
                    </button>
                  )}
                  {selectedView === 'snapshot' && (
                    <>
                      <button
                        className="btn btn-outline-secondary btn-sm ms-2"
                        onClick={() => setInvertX(v => !v)}
                        disabled={!('x' in (allowedInversions || { x: true }))}
                        title="Invert X axis (Eh)"
                      >
                        <i className="bi bi-arrow-left-right me-1"></i> Invert X
                      </button>
                      <button
                        className="btn btn-outline-secondary btn-sm ms-2"
                        onClick={() => setInvertY(v => !v)}
                        disabled={!('y' in (allowedInversions || { y: true }))}
                        title="Invert Y axis (Depth)"
                      >
                        <i className="bi bi-arrow-down-up me-1"></i> Invert Y
                      </button>
                    </>
                  )}
                </div>
              </div>
              
              {/* Dynamic Chart Display */}
              <div id="redox-analysis-chart">
                <ErrorBoundary>
                  {selectedView === 'details' ? (
                    <RedoxTablePanel data={data} columns={tableColumns} loading={loading} selectedSites={selectedSites} startDate={startDate} endDate={endDate} />
                  ) : (
                    <RedoxChartRouter
                      selectedView={selectedView}
                      data={data}
                      chartData={chartData}
                      chartType={chartType}
                      invertSeriesY={invertSeriesY}
                      invertRollingY={invertRollingY}
                      invertX={invertX}
                      invertY={invertY}
                      snapshotSeries={snapshotSeries}
                      parameterLabel={parameterLabel}
                    />
                  )}
                </ErrorBoundary>
              </div>
              
              {/* Removed Redox Zone Classification info blocks per request */}

              {/* Data Table moved to 'Table View' above */}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ModernRedoxAnalysis;
