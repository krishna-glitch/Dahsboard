import React, { useState, useEffect, useCallback, useMemo, useRef, useReducer, Suspense, lazy } from 'react';

// Modern components
import EmptyState from '../components/modern/EmptyState';
import SidebarFilters from '../components/filters/SidebarFilters';
import ExportButton from '../components/ExportButton';
import SimpleLoadingBar from '../components/modern/SimpleLoadingBar';
import { useToast } from '../components/modern/toastUtils';
import TutorialHint from '../components/modern/TutorialHint';
import { useTutorial } from '../hooks/useTutorial.js';

// Services
import {
  getProcessedEhTimeSeries,
  getProcessedEhTimeSeriesArrow,
  getProcessedEhDepthSnapshot,
  getProcessedEhRollingMean,
  getRedoxDateRange,
  getRedoxAnalysisData,
  getRedoxSettings,
} from '../services/api';

// Import modern layout styles
import '../styles/modern-layout.css';
import { buildPerSiteSeries } from '../utils/typedSeries';
import { useRedoxStore } from '../store/redoxStore';
import { shallow } from 'zustand/shallow';
import RedoxMetrics from '../components/redox/RedoxMetrics';
import VisibleOnView from '../components/VisibleOnView';
import RedoxProgress from '../components/redox/RedoxProgress';
import RedoxTablePanel from '../components/redox/RedoxTablePanel';
import { useRedoxMetrics } from '../hooks/useRedoxMetrics';
import { useCachedDateRange } from '../hooks/useCachedDateRange';
const RedoxChartRouter = lazy(() => 
  import('../components/redox/RedoxChartRouter').then(module => ({
    default: module.default || module
  }))
);
import ErrorBoundary from '../components/redox/ErrorBoundary';
import { log } from '../utils/log';
import { columnarToRows } from '../utils/columnar';
import { getMonthCache as idbGetMonthCache, setMonthCache as idbSetMonthCache } from '../utils/monthCache';
import { useQueryClient } from '@tanstack/react-query';

// Unified cancellation detection
function isRequestCancelled(err) {
  if (!err) return false;
  return err.name === 'AbortError' || err.code === 'ERR_CANCELED' || err.message?.includes('aborted') || err.message?.includes('cancelled');
}

// Lightweight check to avoid attempting to parse non-Arrow buffers
function looksLikeJson(buffer) {
  try {
    if (!buffer || !(buffer instanceof ArrayBuffer)) return false;
    const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 64));
    let i = 0;
    while (i < bytes.length && bytes[i] <= 32) i++;
    const ch = bytes[i];
    return ch === 0x7B /* '{' */ || ch === 0x5B /* '[' */;
  } catch {
    return false;
  }
}

// Reducer for fetch-related state
const fetchReducer = (state, action) => {
  switch (action.type) {
    case 'START_FETCH':
      return {
        ...state,
        loading: true,
        error: null,
        loadProgress: null,
      };
    case 'SET_DATA':
      return {
        ...state,
        data: action.payload,
        loading: false,
        error: null,
        loadProgress: null,
      };
    case 'SET_ERROR':
      return {
        ...state,
        loading: false,
        error: action.payload,
        loadProgress: null,
      };
    case 'SET_PROGRESS':
      return {
        ...state,
        loadProgress: action.payload,
      };
    case 'RESET':
      return {
        ...state,
        data: [],
        loading: false,
        error: null,
        loadProgress: null,
      };
    default:
      return state;
  }
};

/**
 * Modern Redox Analysis Dashboard
 */
const ModernRedoxAnalysis = () => {
  log.debug('ModernRedoxAnalysis component initializing');

  // Fetch-related state managed by useReducer
  const [fetchState, dispatch] = useReducer(fetchReducer, {
    data: [],
    loading: false,
    error: null,
    loadProgress: null,
  });
  // Debug cache source stats
  const monthSourceStatsRef = useRef({ mem: 0, rq: 0, idb: 0, net: 0 });
  const [monthSourceStats, setMonthSourceStats] = useState({ mem: 0, rq: 0, idb: 0, net: 0 });

  // Global filter/view state via Zustand store
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
    invertX,
    setInvertX,
    invertY,
    setInvertY,
    invertRollingY,
    setInvertRollingY,
    invertSeriesY,
    setInvertSeriesY,
    allowedInversions,
    setAllowedInversions,
  } = useRedoxStore(
    (s) => ({
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
      invertX: s.invertX,
      setInvertX: s.setInvertX,
      invertY: s.invertY,
      setInvertY: s.setInvertY,
      invertRollingY: s.invertRollingY,
      setInvertRollingY: s.setInvertRollingY,
      invertSeriesY: s.invertSeriesY,
      setInvertSeriesY: s.setInvertSeriesY,
      allowedInversions: s.allowedInversions,
      setAllowedInversions: s.setAllowedInversions,
    }),
    shallow
  );

  // Other local state
  const [chartType, setChartType] = useState('line');
  const [availableMaxDate, setAvailableMaxDate] = useState('');
  const [availableMinDate, setAvailableMinDate] = useState('');
  const [activeWindowStart, setActiveWindowStart] = useState('');
  const [activeWindowEnd, setActiveWindowEnd] = useState('');
  const [primaryYAxis] = useState('depth');
  // Default to JSON/columnar to leverage server-side caching across refreshes
  const [preferArrow, setPreferArrow] = useState(false);
  // React Query client for in-memory month slice caching across route changes
  const queryClient = useQueryClient();
  const [chartViewMode, setChartViewMode] = useState('by-depth'); // 'by-depth' or 'by-site'
  const [snapshotMode, setSnapshotMode] = useState('profile'); // 'profile' or 'scatter'
  const [vizConfig, setVizConfig] = useState({
    resolutionByRange: {
      'Last 7 Days': '15min',
      'Last 30 Days': '30min',
      'Last 90 Days': '2H',
      'Last 6 Months': '6H',
      'Last 1 Year': '2H',
      'Last 2 Years': '1W',
    },
    // Treat 30d and above as monthly-segmented to warm monthly cache for reuse
    chunkRanges: ['Last 30 Days', 'Last 90 Days', 'Last 6 Months', 'Last 1 Year', 'Last 2 Years'],
    maxDepthsDefault: 10,
    targetPointsDefault: 5000,
  });

  // Prefer Arrow automatically for large windows when max fidelity is ON
  useEffect(() => {
    const largeRanges = new Set(['Last 6 Months', 'Last 1 Year', 'Last 2 Years']);
    if (maxFidelity && largeRanges.has(timeRange)) {
      if (!preferArrow) setPreferArrow(true);
    } else if (!maxFidelity && preferArrow) {
      // For standard fidelity, default to JSON/columnar to maximize proxy cache reuse
      setPreferArrow(false);
    }
  }, [maxFidelity, timeRange]);

  // Cached date range hook
  const { dateRange: cachedDateRange } = useCachedDateRange(selectedSites);

  // Constants
  const CHUNK_CONCURRENCY = 2;
  const DEBOUNCE_MS = 500;
  const LOADING_TOAST_DELAY_MS = 500;
  const PROGRESS_UPDATE_THROTTLE_MS = 200;
  const SNAPSHOT_WINDOW_MINUTES = 60;
  const DEPTH_BIN_SIZE_CM = 10;
  const USE_TYPED_THRESHOLD = 20000;

  // Refs for lifecycle and fetch management
  const isMountedRef = useRef(true);
  const currentFetchIdRef = useRef(0);
  const requestAbortRef = useRef(null);
  const lastFetchKeyRef = useRef(null);
  const arrowModuleRef = useRef(null); // Replaces module-level __arrowModulePromise

  // Load Arrow module with useRef to prevent memory leaks
  const loadArrowModule = useCallback(async () => {
    if (!arrowModuleRef.current) {
      arrowModuleRef.current = import('apache-arrow').catch(() => import('@apache-arrow/esnext-esm'));
    }
    return arrowModuleRef.current;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      requestAbortRef.current?.abort();
      arrowModuleRef.current = null; // Clear Arrow module ref
    };
  }, []);

  // Site color palette
  const siteColors = useMemo(
    () => ({
      S1: '#1f77b4',
      S2: '#ff7f0e',
      S3: '#2ca02c',
      S4: '#d62728',
      S5: '#9467bd',
      S6: '#8c564b',
    }),
    []
  );

  // Arrow parsing helper
  const parseArrowBufferToRows = useCallback(async (buffer, fallbackSite) => {
    try {
      if (!buffer) return null;
      if (looksLikeJson(buffer) || buffer.byteLength < 128) {
        log.warn('[ARROW] Buffer does not look like Arrow; skipping parse and falling back');
        return null;
      }
      const mod = await loadArrowModule().catch((e) => {
        log.warn('[ARROW] Module load failed', e);
        return null;
      });
      if (!mod) return null;
      const table = mod.tableFromIPC(buffer);
      const n = table.numRows;
      if (n === 0) return [];
      const rows = new Array(n);
      const nameToVector = new Map();
      const fields = table?.schema?.fields || [];
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        const vec = table.getChildAt ? table.getChildAt(i) : table.getColumnAt ? table.getColumnAt(i) : null;
        if (f?.name && vec) nameToVector.set(String(f.name), vec);
      }
      const colTs = nameToVector.get('measurement_timestamp') || nameToVector.get('timestamp');
      const colEh = nameToVector.get('processed_eh') || nameToVector.get('redox_value_mv');
      const colDepth = nameToVector.get('depth_cm');
      const colSite = nameToVector.get('site_code');
      if (!colTs || !colEh) {
        throw new Error('Missing required columns: timestamp or Eh value');
      }
      const tsUnit = (colTs && colTs.type && (colTs.type.unit || colTs.type)) || null;
      const ehArr = colEh && colEh.toArray ? colEh.toArray() : null;
      const dArr = colDepth && colDepth.toArray ? colDepth.toArray() : null;
      const sArr = colSite && colSite.toArray ? colSite.toArray() : null;
      const toIso = (v) => {
        if (v == null) return undefined;
        if (v instanceof Date) return v.toISOString();
        if (typeof v === 'number' || typeof v === 'bigint') {
          let ms = Number(v);
          const unitStr = String(tsUnit || '').toLowerCase();
          if (unitStr.includes('nano')) ms /= 1e6;
          else if (unitStr.includes('micro')) ms /= 1e3;
          else if (unitStr.includes('second') && !unitStr.includes('milli')) ms *= 1000;
          return new Date(ms).toISOString();
        }
        if (typeof v === 'string') return v;
        try {
          return new Date(v).toISOString();
        } catch {
          return undefined;
        }
      };
      for (let i = 0; i < n; i++) {
        const tsVal = colTs ? colTs.get(i) : undefined;
        const ts = toIso(tsVal);
        const eh = ehArr ? ehArr[i] : colEh ? colEh.get(i) : undefined;
        const depth = dArr ? dArr[i] : colDepth ? colDepth.get(i) : undefined;
        const site = sArr ? sArr[i] || fallbackSite : fallbackSite;
        rows[i] = { measurement_timestamp: ts, processed_eh: eh, depth_cm: depth, site_code: site };
      }
      return rows;
    } catch (e) {
      log.warn('[ARROW] Failed to parse Arrow buffer:', e);
      return null;
    }
  }, [loadArrowModule]);

  const toast = useToast();
  const tutorial = useTutorial();

  // Load server-driven visualization config
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cfg = await getRedoxSettings();
        if (!alive || !cfg) return;
        setVizConfig((prev) => ({
          resolutionByRange: cfg.resolution_by_range || prev.resolutionByRange,
          chunkRanges: cfg.chunk_ranges || prev.chunkRanges,
          maxDepthsDefault: typeof cfg.max_depths_default === 'number' ? cfg.max_depths_default : prev.maxDepthsDefault,
          targetPointsDefault: typeof cfg.target_points_default === 'number' ? cfg.target_points_default : prev.targetPointsDefault,
        }));
      } catch (e) {
        log.warn('[REDOX] Failed to load settings:', e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Debug logging for render state
  log.info(`[RENDER DEBUG] Component rendering with fetchState.data.length: ${fetchState.data?.length || 0}, loading: ${fetchState.loading}, error: ${!!fetchState.error}`);
  
  // Additional debugging for the empty state condition
  if (fetchState.data.length === 0 && !fetchState.loading && !fetchState.error) {
    log.info(`[RENDER DEBUG] Will show EmptyState - fetchState:`, fetchState);
  }
  
  const metrics = useRedoxMetrics(fetchState.data, selectedSites);

  // Zone thresholds and colors (memoized to prevent re-renders)
  const zoneConfig = useMemo(() => ({
    thresholds: {
      'Highly Oxic': 200,
      Oxic: 50,
      Suboxic: -50,
      'Moderately Reducing': -200,
      'Highly Reducing': -Infinity,
    },
    colors: {
      'Highly Oxic': '#006400',
      Oxic: '#32CD32',
      Suboxic: '#FFA500',
      'Moderately Reducing': '#FF4500',
      'Highly Reducing': '#8B0000',
    }
  }), []);


  // Memoized per-site series (expensive computation done once)
  const perSiteSeries = useMemo(() => {
    if (!fetchState.data.length) return new Map();
    const useTyped = fetchState.data.length >= USE_TYPED_THRESHOLD;
    return buildPerSiteSeries(fetchState.data, { useTyped });
  }, [fetchState.data]);

  // Consolidated single-pass data processing for all chart types
  const processedChartData = useMemo(() => {
    if (!fetchState.data.length) {
      return {
        zones: {},
        heatmapGrid: new Map(),
        heatmapDays: new Set(),
        heatmapDepths: new Set()
      };
    }

    // Single pass through data for all processing
    const zones = {};
    const heatmapGrid = new Map();
    const heatmapDays = new Set();
    const heatmapDepths = new Set();

    // Helper functions
    const parseDate = (ts) => new Date(ts);
    const toDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
    const toDepthBin = (v) => (v == null ? null : Math.round(v / DEPTH_BIN_SIZE_CM) * DEPTH_BIN_SIZE_CM);

    fetchState.data.forEach((d) => {
      const redoxVal = d.processed_eh != null ? d.processed_eh : d.redox_value_mv;
      const timestamp = d.measurement_timestamp;
      
      // Zone data processing
      if (redoxVal != null) {
        let zone = 'Unknown';
        if (redoxVal > zoneConfig.thresholds['Highly Oxic']) zone = 'Highly Oxic';
        else if (redoxVal > zoneConfig.thresholds['Oxic']) zone = 'Oxic';
        else if (redoxVal > zoneConfig.thresholds['Suboxic']) zone = 'Suboxic';
        else if (redoxVal > zoneConfig.thresholds['Moderately Reducing']) zone = 'Moderately Reducing';
        else zone = 'Highly Reducing';

        if (!zones[zone]) {
          zones[zone] = {
            x: [],
            y: [],
            name: zone,
            type: 'scatter',
            mode: 'markers',
            marker: {
              color: zoneConfig.colors[zone],
              size: 6,
              opacity: 0.8,
            },
          };
        }
        zones[zone].x.push(timestamp);
        zones[zone].y.push(redoxVal);
      }

      // Heatmap data processing
      if (d.redox_value_mv != null && d.depth_cm != null && timestamp) {
        const day = toDay(parseDate(timestamp));
        const depth = toDepthBin(d.depth_cm);
        const key = `${day}|${depth}`;
        heatmapDays.add(day);
        heatmapDepths.add(depth);
        const cur = heatmapGrid.get(key) || { sum: 0, count: 0 };
        cur.sum += d.redox_value_mv;
        cur.count += 1;
        heatmapGrid.set(key, cur);
      }
    });

    return { zones, heatmapGrid, heatmapDays, heatmapDepths };
  }, [fetchState.data, zoneConfig]);

  // Chart data preparation (lightweight presentation logic)
  const chartData = useMemo(() => {
    if (!fetchState.data.length) return { timeseries: [], scatter: [], zones: [], heatmap: [], bySiteTimeseries: [] };

    const useGL = fetchState.data.length > 10000;
    const baseType = useGL ? 'scattergl' : 'scatter';

    const depthOnLeft = primaryYAxis === 'depth';

    const timeseries = [];
    perSiteSeries.forEach((vals, site) => {
      timeseries.push({
        x: vals.x,
        y: vals.depth,
        name: `Site ${site} — Depth`,
        type: baseType,
        mode: chartType === 'line' ? 'lines' : 'markers',
        yaxis: depthOnLeft ? 'y' : 'y2',
        line: { width: useGL ? 1 : 2 },
        marker: { size: chartType === 'scatter' ? (useGL ? 3 : 6) : 3, symbol: 'circle-open' },
      });
      timeseries.push({
        x: vals.x,
        y: vals.redox,
        name: `Site ${site} — Redox`,
        type: baseType,
        mode: chartType === 'line' ? 'lines' : 'markers',
        yaxis: depthOnLeft ? 'y2' : 'y',
        line: { width: useGL ? 1 : 2 },
        marker: { size: chartType === 'scatter' ? (useGL ? 3 : 6) : 3 },
      });
    });

    // New: By-Site chart data (each site shows all depths)
    const bySiteTimeseries = [];
    perSiteSeries.forEach((vals, site) => {
      // Group data by depth for this site
      const depthGroups = new Map();
      
      for (let i = 0; i < vals.x.length; i++) {
        const depth = vals.depth[i];
        const redox = vals.redox[i];
        const timestamp = vals.x[i];
        
        if (!depthGroups.has(depth)) {
          depthGroups.set(depth, { x: [], y: [], depth });
        }
        depthGroups.get(depth).x.push(timestamp);
        depthGroups.get(depth).y.push(redox);
      }
      
      // Create a trace for each depth at this site
      depthGroups.forEach((depthData, depth) => {
        bySiteTimeseries.push({
          x: depthData.x,
          y: depthData.y,
          name: `${depth}cm`,
          type: baseType,
          mode: chartType === 'line' ? 'lines' : 'markers',
          line: { width: useGL ? 1 : 2 },
          marker: { size: chartType === 'scatter' ? (useGL ? 3 : 6) : 4 },
          meta: { site, depth },
        });
      });
    });

    const scatter = [];
    perSiteSeries.forEach((vals, site) => {
      scatter.push({
        x: vals.x,
        y: vals.depth,
        name: `Site ${site} — Depth`,
        type: baseType,
        mode: 'markers',
        yaxis: depthOnLeft ? 'y' : 'y2',
        marker: { size: useGL ? 3 : 6, symbol: 'circle-open', opacity: 0.7 },
      });
      scatter.push({
        x: vals.x,
        y: vals.redox,
        name: `Site ${site} — Redox`,
        type: baseType,
        mode: 'markers',
        yaxis: depthOnLeft ? 'y2' : 'y',
        marker: { size: useGL ? 3 : 6, opacity: 0.7 },
      });
    });

    // Use pre-processed zone data (eliminates redundant loop)
    const zoneData = processedChartData.zones;

    // Use pre-processed heatmap data (eliminates redundant loop)
    const heatmap = (() => {
      if (!fetchState.data.length) return [];
      const { heatmapGrid, heatmapDays, heatmapDepths } = processedChartData;
      const days = Array.from(heatmapDays).sort();
      const depths = Array.from(heatmapDepths).sort((a, b) => a - b);
      const z = depths.map((depth) =>
        days.map((day) => {
          const cell = heatmapGrid.get(`${day}|${depth}`);
          return cell ? cell.sum / cell.count : null;
        })
      );
      return [{ type: 'heatmap', x: days, y: depths, z, colorscale: 'RdBu', reversescale: true, colorbar: { title: 'mV' } }];
    })();

    return { timeseries, scatter, zones: Object.values(zoneData), heatmap, bySiteTimeseries };
  }, [perSiteSeries, chartType, primaryYAxis, fetchState.data, processedChartData]);

  const parameterLabel = useMemo(() => 'Depth & Redox', []);

  const perSiteCounts = useMemo(() => {
    if (!fetchState.data.length) return [];
    const m = new Map();
    fetchState.data.forEach((r) => {
      const sc = r?.site_code;
      if (sc) m.set(sc, (m.get(sc) || 0) + 1);
    });
    return Array.from(m.entries()).sort(([a], [b]) => String(a).localeCompare(String(b)));
  }, [fetchState.data]);

  // Separate data for scatter plot (individual points)
  const scatterData = useMemo(() => {
    if (!fetchState.data.length) return [];
    
    const refTs = activeWindowEnd || endDate || '';
    const refTime = refTs ? new Date(refTs).getTime() : null;
    const halfWindow = SNAPSHOT_WINDOW_MINUTES * 60 * 1000;
    
    return fetchState.data
      .filter(r => {
        const t = r.measurement_timestamp ? new Date(r.measurement_timestamp).getTime() : null;
        const eh = Number(r.processed_eh != null ? r.processed_eh : r.redox_value_mv);
        const depth = Number(r.depth_cm);
        
        if (!Number.isFinite(eh) || !Number.isFinite(depth)) return false;
        
        // Filter to time window if specified
        if (refTime && t) {
          return Math.abs(t - refTime) <= halfWindow;
        }
        return true; // Include all data if no time reference
      })
      .map(r => ({
        x: Number(r.processed_eh != null ? r.processed_eh : r.redox_value_mv),
        y: Number(r.depth_cm),
        site: r.site_code,
        timestamp: r.measurement_timestamp
      }));
  }, [fetchState.data, activeWindowEnd, endDate]);
  
  const snapshotSeries = useMemo(() => {
    if (!perSiteSeries.size) return { profile: [], scatter: [] };
    try {
      // Use pre-parsed timestamps from perSiteSeries for better performance
      let refTs = activeWindowEnd || endDate || '';
      let maxTs = 0;
      const refTime = refTs ? new Date(refTs).getTime() : null;
      const halfWindow = SNAPSHOT_WINDOW_MINUTES * 60 * 1000;
      const binSize = DEPTH_BIN_SIZE_CM;
      
      const bySite = new Map(); // Map<site, Map<depthBin, {sum, count}>>
      const lastSeen = new Map(); // Map<`${site}_${depthBin}`, { t, eh }>
      const siteHasWindowData = new Map(); // Map<site, boolean>

      // Optimized: Use pre-parsed timestamps from perSiteSeries
      for (const [, vals] of perSiteSeries.entries()) {
        const { timestamps } = vals;
        
        // Find max timestamp if needed (faster than iterating raw data)
        if (!refTime && timestamps.length > 0) {
          const siteMax = Math.max(...timestamps);
          if (siteMax > maxTs) maxTs = siteMax;
        }
      }
      
      const actualRefTime = refTime || maxTs;
      
      // Process each site's data efficiently
      for (const [site, vals] of perSiteSeries.entries()) {
        const { timestamps, depth, redox } = vals;
        
        for (let i = 0; i < timestamps.length; i++) {
          const t = timestamps[i];
          const d = depth[i];
          const eh = redox[i];
          
          if (!Number.isFinite(t) || !Number.isFinite(d) || !Number.isFinite(eh)) continue;
          
          const depthBin = Math.round(d / binSize) * binSize;
          const inWindow = actualRefTime && Math.abs(t - actualRefTime) <= halfWindow;
          
          if (inWindow) {
            siteHasWindowData.set(site, true);
            if (!bySite.has(site)) bySite.set(site, new Map());
            const siteMap = bySite.get(site);
            const cur = siteMap.get(depthBin) || { sum: 0, count: 0 };
            cur.sum += eh;
            cur.count += 1;
            siteMap.set(depthBin, cur);
          }
          
          // Fallback tracking using site-depth composite key
          const key = site + '_' + depthBin; // Faster than template literal
          const prev = lastSeen.get(key);
          if (!prev || t > prev.t) lastSeen.set(key, { t, eh });
        }
      }
      
      // Per-site fallback: if a site has no points in the time window, include its latest point per depth
      for (const site of perSiteSeries.keys()) {
        if (!siteHasWindowData.get(site)) {
          // Gather lastSeen entries for this site
          for (const [key, val] of lastSeen.entries()) {
            if (!key.startsWith(site + '_')) continue;
            const depthBin = Number(key.slice(site.length + 1));
            if (!bySite.has(site)) bySite.set(site, new Map());
            bySite.get(site).set(depthBin, { sum: val.eh, count: 1 });
          }
        }
      }

      // Generate traces efficiently
      const traces = [];
      const useGL = fetchState.data.length > 5000;
      
      for (const [site, siteMap] of bySite.entries()) {
        if (siteMap.size === 0) continue;
        
        const depths = Array.from(siteMap.keys()).sort((a, b) => a - b);
        const ehs = depths.map((bin) => {
          const entry = siteMap.get(bin);
          return entry.sum / entry.count;
        });
        
        traces.push({
          x: ehs,
          y: depths,
          name: site,
          type: useGL ? 'scattergl' : 'scatter',
          mode: 'lines+markers',
          marker: { size: 6, color: siteColors[site] || '#666666' },
          line: { width: 2, color: siteColors[site] || '#666666' },
        });
      }
      
      // Create scatter traces (individual points, not connected)
      const scatterTraces = [];
      const siteScatterData = new Map();
      
      scatterData.forEach(point => {
        if (!siteScatterData.has(point.site)) {
          siteScatterData.set(point.site, { x: [], y: [], site: point.site });
        }
        const siteData = siteScatterData.get(point.site);
        siteData.x.push(point.x);
        siteData.y.push(point.y);
      });
      
      for (const [site, data] of siteScatterData.entries()) {
        scatterTraces.push({
          x: data.x,
          y: data.y,
          name: site,
          type: useGL ? 'scattergl' : 'scatter',
          mode: 'markers',
          marker: { 
            size: 8, 
            color: siteColors[site] || '#666666',
            opacity: 0.7,
            line: { width: 1, color: 'white' }
          },
          hovertemplate: '<b>%{fullData.name}</b><br>Eh: %{x:.1f} mV<br>Depth: %{y:.1f} cm<extra></extra>'
        });
      }
      
      return { profile: traces, scatter: scatterTraces };
    } catch (e) {
      log.warn('[REDOX] snapshot compute failed', e);
      return { profile: [], scatter: [] };
    }
  }, [perSiteSeries, activeWindowEnd, endDate, siteColors, fetchState.data.length, scatterData]);

  // Compute 24h rolling mean off the main thread via Web Worker
  const [rollingData, setRollingData] = useState([]);
  const rollingWorkerRef = useRef(null);
  useEffect(() => {
    try {
      if (!perSiteSeries.size) { setRollingData([]); return; }
      // Lazy init worker
      if (!rollingWorkerRef.current) {
        rollingWorkerRef.current = new Worker(new URL('../workers/rollingWorker.js', import.meta.url), { type: 'module' });
        rollingWorkerRef.current.onmessage = (e) => {
          const { ok, data, error } = e.data || {};
          if (ok) setRollingData(Array.isArray(data) ? data : []);
          else {
            log.warn('[REDOX] rolling worker error', error);
            setRollingData([]);
          }
        };
      }
      // Build series list payload
      const series = [];
      for (const [site, vals] of perSiteSeries.entries()) {
        series.push({ site, timestamps: vals.timestamps, depth: vals.depth, redox: vals.redox });
      }
      rollingWorkerRef.current.postMessage({ cmd: 'rolling24h', payload: { series, windowMs: 24 * 60 * 60 * 1000 } });
    } catch (e) {
      log.warn('[REDOX] rolling worker dispatch failed', e);
      setRollingData([]);
    }
    return () => { /* keep worker alive across renders for reuse */ };
  }, [perSiteSeries]);

  const subtitleText = useMemo(() => {
    const sitesText = selectedSites && selectedSites.length ? `Sites ${selectedSites.join(', ')}` : 'All sites';
    const start = (activeWindowStart || startDate || availableMinDate || '').slice(0, 10) || 'N/A';
    const end = (activeWindowEnd || endDate || availableMaxDate || '').slice(0, 10) || 'N/A';
    const rangeText = start && end ? `${start} → ${end}` : end ? `through ${end}` : '';
    const count = metrics?.validMeasurements || 0;
    if (!count) {
      return [sitesText, rangeText].filter(Boolean).join(' • ');
    }
    return [`Showing ${count.toLocaleString()} measurements`, sitesText, rangeText].filter(Boolean).join(' • ');
  }, [selectedSites, startDate, endDate, availableMinDate, availableMaxDate, metrics, activeWindowStart, activeWindowEnd]);

  const tableColumns = useMemo(
    () => [
      { key: 'measurement_timestamp', label: 'Date/Time', format: (v) => (v ? new Date(v).toLocaleString() : '-') },
      { key: 'site_code', label: 'Site', format: (v) => (v ? `Site ${v}` : '-') },
      { key: 'depth_cm', label: 'Depth (cm)', format: (v) => (v ?? null) == null ? '-' : Number(v).toFixed(1) },
      {
        key: 'processed_eh',
        label: 'Redox (mV)',
        format: (v, row) => {
          const val = (v ?? row?.redox_value_mv);
          return (val ?? null) == null ? '-' : Number(val).toFixed(1);
        }
      },
    ],
    []
  );

  const checkAbort = (signal) => {
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
  };

  const determineDateWindow = useCallback(async (controller) => {
    let startTsIso = startDate;
    let endTsIso = endDate;
    if (timeRange === 'Custom Range' && startDate && endDate) {
      log.info('[FETCH] Using custom date range:', { startTsIso, endTsIso });
      setActiveWindowStart(startTsIso);
      setActiveWindowEnd(endTsIso);
      return { startTsIso, endTsIso };
    }

    // Preset ranges: anchor the window to the latest available data for the selected sites, falling back to today
    checkAbort(controller.signal);
    const daysMap = {
      'Last 7 Days': 7,
      'Last 30 Days': 30,
      'Last 90 Days': 90,
      'Last 6 Months': 180,
      'Last 1 Year': 365,
      'Last 2 Years': 730,
    };
    const presetDays = daysMap[timeRange];

    // Ensure we have date bounds; prefer cached range to avoid extra request
    let range = cachedDateRange;
    if (!range) {
      try {
        log.debug('[FETCH] Cache miss, calling getRedoxDateRange for sites:', selectedSites);
        range = await getRedoxDateRange(selectedSites, controller.signal);
      } catch (e) {
        log.warn('[FETCH] Failed to load available date bounds (will anchor to today):', e);
      }
    }

    const latestIso = range?.latest_date || new Date().toISOString();
    const earliestIso = range?.earliest_date || null;
    if (earliestIso) setAvailableMinDate(earliestIso);
    if (latestIso) setAvailableMaxDate(latestIso);

    const endUtc = new Date(latestIso); // anchor to latest available (or today)
    if (presetDays) {
      const startUtc = new Date(Date.UTC(
        endUtc.getUTCFullYear(),
        endUtc.getUTCMonth(),
        endUtc.getUTCDate() - (presetDays - 1),
        0, 0, 0, 0
      ));
      startTsIso = startUtc.toISOString();
      endTsIso = endUtc.toISOString();
    } else {
      // Fallback to 30 days if unknown preset
      const startUtc = new Date(Date.UTC(endUtc.getUTCFullYear(), endUtc.getUTCMonth(), endUtc.getUTCDate() - 29, 0, 0, 0, 0));
      startTsIso = startUtc.toISOString();
      endTsIso = endUtc.toISOString();
    }

    setActiveWindowStart(startTsIso);
    setActiveWindowEnd(endTsIso);
    log.info('[FETCH] preset=%s anchored to latest=%s => startTsIso=%s endTsIso=%s', timeRange, latestIso, startTsIso, endTsIso);
    return { startTsIso, endTsIso };
  }, [selectedSites, timeRange, startDate, endDate, cachedDateRange]);

  const _loadAllChunksForSite = useCallback(
    async (site, startTsIso, endTsIso, chunkSize, suggestedResolution, maxDepths, targetPoints, controller, perSite, updateProgressToast) => {
      let offset = 0;
      let siteMerged = [];
      let allowedLocal = {};
      while (true) {
        checkAbort(controller.signal);

        let resp;
        if (preferArrow) {
          log.debug('[REQ-CHUNK] Arrow', {
            site,
            startTsIso,
            endTsIso,
            chunkSize,
            offset,
            resolution: suggestedResolution || 'raw',
            maxDepths,
          });
          const resArrow = await getProcessedEhTimeSeriesArrow(
            {
              siteId: site,
              startTs: startTsIso,
              endTs: endTsIso,
              chunkSize: chunkSize,
              offset,
              resolution: suggestedResolution,
              maxDepths,
              maxFidelity: maxFidelity || undefined,
              ...(targetPoints ? { targetPoints } : {}),
            },
            controller.signal
          );
          checkAbort(controller.signal);
          log.debug(`[ARROW DEBUG] Parsing buffer for site ${site}, buffer size: ${resArrow?.buffer?.byteLength || 0}`);
          let rows = await parseArrowBufferToRows(resArrow?.buffer, site);
          log.debug(`[ARROW DEBUG] Parsed ${rows?.length || 0} rows for site ${site}`);
          
          if (!rows || rows.length === 0) {
            log.info('[FALLBACK JSON-CHUNK]', { site, startTsIso, endTsIso, chunkSize, offset });
            resp = await getProcessedEhTimeSeries(
              {
                siteId: site,
                startTs: startTsIso,
                endTs: endTsIso,
                chunkSize: chunkSize,
                offset,
                resolution: suggestedResolution,
                maxDepths,
                maxFidelity: maxFidelity || undefined,
                ...(targetPoints ? { targetPoints } : {}),
              },
              controller.signal
            );
          } else {
            resp = {
              data: rows,
              metadata: {
                total_records: resArrow?.headers?.totalRecords || rows.length,
                chunk_info: {
                  offset: resArrow?.headers?.chunkOffset || 0,
                  chunk_size: resArrow?.headers?.chunkSize || chunkSize || 0,
                  has_more: !!resArrow?.headers?.chunkHasMore,
                },
              },
            };
          }
        } else {
          log.debug('[REQ-CHUNK] JSON', {
            site,
            startTsIso,
            endTsIso,
            chunkSize,
            offset,
            resolution: suggestedResolution || 'raw',
            maxDepths,
            targetPoints,
          });
          resp = await getProcessedEhTimeSeries(
            {
              siteId: site,
              startTs: startTsIso,
              endTs: endTsIso,
              chunkSize: chunkSize,
              offset,
              resolution: suggestedResolution,
              maxDepths,
              maxFidelity: maxFidelity || undefined,
              ...(targetPoints ? { targetPoints } : {}),
            },
            controller.signal
          );
        }
        checkAbort(controller.signal);

        let arr = resp?.data || [];
        if ((!arr || arr.length === 0) && resp?.data_columnar) {
          arr = columnarToRows(resp.data_columnar, site);
        }
        const metadata = resp?.metadata || {};
        if (metadata.allowed_inversions) allowedLocal = metadata.allowed_inversions;
        if (perSite[site].total == null && typeof metadata.total_records === 'number') {
          perSite[site].total = metadata.total_records;
        }

        const normalized = arr.map((row) => ({ ...row, site_code: site }));
        siteMerged = siteMerged.concat(normalized);

        perSite[site].loaded = siteMerged.length;
        updateProgressToast();

        const hasMore = !!metadata?.chunk_info?.has_more;
        log.info(`[CHUNK DEBUG] Site: ${site}, Loaded: ${siteMerged.length}, HasMore: ${hasMore}, ChunkSize: ${arr.length}, Offset: ${offset}`);
        
        if (!hasMore) {
          log.info(`[CHUNK COMPLETE] Site: ${site} finished with ${siteMerged.length} total records`);
          return { site, data: siteMerged, allowed: allowedLocal, metadata };
        }
        
        const nextOffset = metadata?.chunk_info?.offset + (metadata?.chunk_info?.chunk_size || chunkSize || 0);
        const newOffset = Number.isFinite(nextOffset) ? nextOffset : offset + (chunkSize || 0);
        
        // Safety check to prevent infinite loops
        if (newOffset === offset) {
          log.error(`[CHUNK ERROR] Offset not advancing for site ${site}, breaking loop. Current: ${offset}, Next: ${newOffset}`);
          return { site, data: siteMerged, allowed: allowedLocal, metadata };
        }
        
        // Safety check for empty chunks
        if (arr.length === 0 && hasMore) {
          log.error(`[CHUNK ERROR] Empty chunk returned but hasMore=true for site ${site}, breaking loop`);
          return { site, data: siteMerged, allowed: allowedLocal, metadata };
        }
        
        offset = newOffset;
        log.debug(`[CHUNK CONTINUE] Site: ${site} continuing with offset: ${offset}`);
      }
    },
    [preferArrow, maxFidelity, parseArrowBufferToRows]
  );

  // Normalize site identifier to a canonical form for cache keys and requests
  const normalizeSiteId = useCallback((s) => {
    if (s == null) return '';
    try {
      return String(s).trim().toUpperCase();
    } catch {
      return String(s || '');
    }
  }, []);

  // Session/IndexedDB backed month-slice cache (persists across refreshes)
  const MONTH_CACHE_PREFIX = 'redox_month_cache_v1';
  const MONTH_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

  const makeMonthKey = useCallback((siteId, year, month, resolution, fidelity, maxDepths) => {
    const y = year.toString().padStart(4, '0');
    const m = (month + 1).toString().padStart(2, '0'); // 0-based month -> 1-based
    const res = String(resolution || 'raw');
    const fid = fidelity ? 'max' : 'std';
    const md = Number.isFinite(maxDepths) ? String(maxDepths) : 'any';
    return `${MONTH_CACHE_PREFIX}:${siteId}:${y}-${m}:${res}:${fid}:${md}`;
  }, []);

  // In-memory page cache to avoid even storage reads between navigations
  const monthMemoryCacheRef = useRef(new Map());

  const getMonthCache = useCallback(async (key) => {
    const mem = monthMemoryCacheRef.current.get(key);
    if (mem) return mem;
    const qd = queryClient.getQueryData([MONTH_CACHE_PREFIX, key]);
    if (qd) {
      monthMemoryCacheRef.current.set(key, qd);
      monthSourceStatsRef.current.rq += 1;
      return qd;
    }
    const idb = await idbGetMonthCache(key, MONTH_CACHE_TTL_MS, true);
    if (idb) {
      monthMemoryCacheRef.current.set(key, idb);
      queryClient.setQueryData([MONTH_CACHE_PREFIX, key], idb);
      monthSourceStatsRef.current.idb += 1;
      return idb;
    }
    return null;
  }, [queryClient, MONTH_CACHE_TTL_MS]);

  const setMonthCache = useCallback(async (key, payload) => {
    try {
      monthMemoryCacheRef.current.set(key, payload);
      queryClient.setQueryData([MONTH_CACHE_PREFIX, key], payload);
      await idbSetMonthCache(key, payload, MONTH_CACHE_TTL_MS, true);
    } catch { /* ignore */ }
  }, [queryClient, MONTH_CACHE_TTL_MS]);

  // Lightweight idle-time prefetch: warm next month's cache for the first selected site
  useEffect(() => {
    if (!Array.isArray(selectedSites) || selectedSites.length === 0) return;
    // Determine current window from availableMinDate/MaxDate or start/endDate
    const sIso = (startDate || availableMinDate || '').slice(0, 10);
    const eIso = (endDate || availableMaxDate || '').slice(0, 10);
    if (!sIso || !eIso) return;

    const site = selectedSites[0];
    const res = (vizConfig?.resolutionByRange?.[timeRange] || 'raw');
    const useMax = !!maxFidelity;

    const schedule = (fn) => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        window.requestIdleCallback(fn, { timeout: 1500 });
      } else {
        setTimeout(fn, 250);
      }
    };

    schedule(async () => {
      try {
        // Compute next month window
        const d = new Date(eIso);
        if (isNaN(d.getTime())) return;
        const nextStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
        const nextEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0, 23, 59, 59, 999));
        const y = nextStart.getUTCFullYear();
        const m = nextStart.getUTCMonth();
        const key = makeMonthKey(normalizeSiteId(site), y, m, res, useMax, 'any');
        const cached = await getMonthCache(key);
        if (cached) return; // already warm

        // Fetch minimally to prewarm cache
        await getProcessedEhTimeSeries({
          siteId: normalizeSiteId(site),
          startTs: nextStart.toISOString(),
          endTs: nextEnd.toISOString(),
          resolution: res,
          maxDepths: 'any',
          maxFidelity: useMax || undefined,
        });
      } catch { /* ignore */ }
    });
  }, [selectedSites, timeRange, startDate, endDate, availableMinDate, availableMaxDate, vizConfig, maxFidelity, makeMonthKey, getMonthCache, normalizeSiteId]);

  // Build monthly windows between a start and end ISO timestamp (inclusive)
  const buildMonthlyWindows = useCallback((startIso, endIso) => {
    try {
      if (!startIso || !endIso) return [];
      const start = new Date(startIso);
      const end = new Date(endIso);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];

      let y = start.getUTCFullYear();
      let m = start.getUTCMonth();
      const lastY = end.getUTCFullYear();
      const lastM = end.getUTCMonth();
      const out = [];
      while (y < lastY || (y === lastY && m <= lastM)) {
        const monthStart = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
        const monthEnd = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
        // Always use full month window for stable keys
        out.push({ start: monthStart.toISOString(), end: monthEnd.toISOString(), year: y, month: m });
        m += 1;
        if (m > 11) { m = 0; y += 1; }
      }
      return out;
    } catch (e) {
      log.warn('[MONTHLY] buildMonthlyWindows failed', e);
      return [];
    }
  }, []);

  // Fetch a site's data as monthly slices and merge to a single array, filtered to exact window
   
  const fetchMonthlyForSite = useCallback(async (site, startTsIso, endTsIso, suggestedResolution, maxDepths, targetPoints, controller, useMaxFidelity) => {
    const windows = buildMonthlyWindows(startTsIso, endTsIso);
    const merged = [];
    const MONTH_FETCH_CONCURRENCY = 3;
    const siteNorm = normalizeSiteId(site);

    for (let i = 0; i < windows.length; i += MONTH_FETCH_CONCURRENCY) {
      checkAbort(controller.signal);
      const slice = windows.slice(i, i + MONTH_FETCH_CONCURRENCY);
      const batch = slice.map(async (w) => {
        const monthKey = makeMonthKey(siteNorm, w.year, w.month, suggestedResolution, useMaxFidelity, maxDepths);
        const cached = await getMonthCache(monthKey);
        if (cached && Array.isArray(cached)) {
          for (const row of cached) merged.push({ ...row, site_code: siteNorm });
          return;
        }
        try {
          const res = await getProcessedEhTimeSeries({
            siteId: siteNorm,
            startTs: w.start,
            endTs: w.end,
            resolution: suggestedResolution,
            maxDepths,
            maxFidelity: useMaxFidelity || undefined,
            ...(targetPoints ? { targetPoints } : {}),
          }, controller.signal);
          let arr = res?.data || res?.redox_data || [];
          if ((!arr || arr.length === 0) && res?.data_columnar) {
            arr = columnarToRows(res.data_columnar, siteNorm);
          }
          // Persist month slice
          if (Array.isArray(arr) && arr.length) {
            await setMonthCache(monthKey, arr);
          }
          monthSourceStatsRef.current.net += 1;
          for (const row of (arr || [])) merged.push({ ...row, site_code: siteNorm });
        } catch (e) {
          if (isRequestCancelled(e)) throw e;
          log.warn('[MONTHLY] slice fetch failed', { site: siteNorm, window: w, error: e?.message });
        }
      });
      await Promise.all(batch);
    }
    // strict filter to requested range
    const minMs = new Date(startTsIso).getTime();
    const maxMs = new Date(endTsIso).getTime();
    const filtered = merged.filter(r => {
      const t = r?.measurement_timestamp ? new Date(r.measurement_timestamp).getTime() : NaN;
      return Number.isFinite(t) && t >= minMs && t <= maxMs;
    });
    return { data: filtered, metadata: { site_code: siteNorm, months: windows.length } };
  }, [buildMonthlyWindows, normalizeSiteId, makeMonthKey, getMonthCache, setMonthCache]);

  // Smart data compatibility checking for fidelity reuse
  const checkDataCompatibility = useCallback((newFetchKey, existingData) => {
    if (!existingData || !newFetchKey || !lastFetchKeyRef.current) {
      return { compatible: false, reason: 'no-existing-data' };
    }
    if (!Array.isArray(existingData) || existingData.length === 0) {
      return { compatible: false, reason: 'empty-existing-data' };
    }

    const parseKey = (key) => {
      const parts = key.split('|');
      return {
        sites: parts[0],           // S1,S2,S3,S4
        rangeType: parts[1],       // "range" 
        range: parts[2],           // "Last 1 Year"
        fidelity: parts[3],        // "max" or "std"
        view: parts[4]             // "timeseries"
      };
    };

    // Normalize views that use identical datasets into the same data group
    // Snapshot and Rolling reuse the full timeseries dataset client-side, so group them with 'series'
    const toGroup = (v) => (v === 'timeseries' || v === 'details' || v === 'snapshot' || v === 'rolling' || v === 'series') ? 'series' : v;

    const newParams = parseKey(newFetchKey);
    const existingParams = parseKey(lastFetchKeyRef.current);

    console.log('[SMART CACHE DEBUG] Key comparison:', {
      newFetchKey,
      existingFetchKey: lastFetchKeyRef.current,
      newParams,
      existingParams
    });

    // Must have same sites, range, and data group (treat timeseries/details as one group)
    if (newParams.sites !== existingParams.sites || 
        newParams.rangeType !== existingParams.rangeType ||
        newParams.range !== existingParams.range ||
        toGroup(newParams.view) !== toGroup(existingParams.view)) {
      return { compatible: false, reason: 'different-params' };
    }

    // Check fidelity compatibility
    if (newParams.fidelity === existingParams.fidelity) {
      return { compatible: true, reason: 'exact-match' };
    }

    // If switching from HIGH to LOW fidelity, can always reuse (subset)
    if (existingParams.fidelity === 'max' && newParams.fidelity === 'std') {
      return { compatible: true, reason: 'downsample-reuse' };
    }

    // If switching from LOW to HIGH fidelity, cannot reuse (need more data)
    if (existingParams.fidelity === 'std' && newParams.fidelity === 'max') {
      return { compatible: false, reason: 'need-higher-fidelity' };
    }

    return { compatible: false, reason: 'unknown' };
  }, []);

  // Apply fidelity filtering to existing data (for downsample reuse)
  const applyFidelityFilter = useCallback((data, targetFidelity) => {
    log.info(`[SMART CACHE] applyFidelityFilter called with data length: ${data?.length || 0}, targetFidelity: ${targetFidelity}`);
    
    if (!data || !Array.isArray(data) || targetFidelity === 'max') {
      log.info(`[SMART CACHE] No filtering needed - data: ${!!data}, isArray: ${Array.isArray(data)}, targetFidelity: ${targetFidelity}`);
      return data; // No filtering needed for max fidelity
    }

    // For standard fidelity (12 records/day), filter to 2-hour intervals
    log.info(`[SMART CACHE] Applying standard fidelity filter to ${data.length} records`);
    
    const filtered = data.filter(record => {
      const ts = new Date(record.measurement_timestamp);
      // Keep only records at 2-hour intervals (00:00, 02:00, 04:00, etc.)
      return ts.getMinutes() === 0 && (ts.getHours() % 2 === 0);
    });

    log.info(`[SMART CACHE] Filtered from ${data.length} to ${filtered.length} records for standard fidelity`);
    log.info(`[SMART CACHE] Sample filtered record:`, filtered[0]);
    log.info(`[SMART CACHE] Returning filtered array with length:`, filtered.length);
    return filtered;
  }, []);

  const processResults = useCallback(
    (results, selectedSites, t0, startTsIso, endTsIso, fetchId, toast) => {
      const t1 = performance?.now() ?? Date.now();
      const merged = [];
      let allowed = {};
      let chunkingInfo = null;

      results.forEach((res, idx) => {
        const site = selectedSites[idx] || selectedSites[0];
        let arr = res?.data || res?.redox_data || [];
        if ((!arr || arr.length === 0) && res?.data_columnar) {
          arr = columnarToRows(res.data_columnar, site);
        }

        const metadata = res?.metadata || {};
        if (metadata.chunked) {
          chunkingInfo = {
            site: site,
            totalRecords: metadata.total_records,
            returnedRecords: metadata.returned_records,
            hasMore: metadata.chunk_info?.has_more,
            chunkSize: metadata.chunk_info?.chunk_size,
          };
          log.debug('Chunking info for site', site, ':', chunkingInfo);
        }

        if (res?.metadata?.allowed_inversions) allowed = res.metadata.allowed_inversions;
        for (const row of arr) merged.push({ ...row, site_code: site });
      });
      log.info('[FETCH] Final merged data length:', merged.length);

      const sitesText = selectedSites.join(', ');
      const recordsFormatted = merged.length.toLocaleString();
      const elapsedMs = t1 - t0;
      const loadingTime = (elapsedMs / 1000).toFixed(2);
      const rate = elapsedMs > 0 ? merged.length / (elapsedMs / 1000) : 0;
      const rateStr = `${Math.round(rate).toLocaleString()} rec/s`;

      const wStart = (startTsIso || '').slice(0, 10);
      const wEnd = (endTsIso || '').slice(0, 10);
      const windowSuffix = wStart && wEnd ? ` • Window: ${wStart} → ${wEnd}` : '';
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
        toast.showSuccess(loadingMessage, {
          title: title,
          dedupeKey: `redox-success|${selectedSites.join(',')}|${timeRange}|${selectedView}`,
          duration: 5000,
          actions: [
            {
              id: 'details',
              label: 'View Details',
              action: () => {
                const avgRecordsPerSite = Math.round(merged.length / selectedSites.length);
                const timeRangeDesc = timeRange === 'Custom Range' ? `${startDate?.slice(0, 10)} to ${endDate?.slice(0, 10)}` : timeRange;

                let details = `Dataset Details:\n• Time Range: ${timeRangeDesc}\n• Loaded Records: ${recordsFormatted}\n• Sites: ${selectedSites.length} (${sitesText})\n• Avg per Site: ${avgRecordsPerSite.toLocaleString()}\n• View: ${selectedView}\n• Load Time: ${loadingTime}s\n• Rate: ${rateStr}`;

                // Coverage summary: estimate days present and depth completeness per site
                try {
                  const cadencePerDay = maxFidelity ? 96 : 12;
                  const perSite = new Map();
                  const depthSetPerSite = new Map();
                  for (const r of merged) {
                    const s = r.site_code || r.site || r.site_id;
                    if (!s) continue;
                    perSite.set(s, (perSite.get(s) || 0) + 1);
                    if (r.depth_cm != null) {
                      const k = depthSetPerSite.get(s) || new Set();
                      k.add(Number(r.depth_cm));
                      depthSetPerSite.set(s, k);
                    }
                  }
                  if (perSite.size > 0) {
                    details += `\n\nCoverage (estimated):`;
                    for (const s of selectedSites) {
                      const n = perSite.get(s) || 0;
                      const estDays = Math.round(n / (6 * cadencePerDay));
                      const k = depthSetPerSite.get(s) || new Set();
                      const depthCount = Math.min(6, Array.from(k.values()).filter(v => Number.isFinite(v)).length);
                      details += `\n• ${s}: ${n.toLocaleString()} records • ~${estDays.toLocaleString()} days • depths present: ${depthCount}/6`;
                    }
                  }
                } catch { /* ignore */ }

                if (chunkingInfo) {
                  details += `\n\n📦 Chunking Info:\n• Total Available: ${chunkingInfo.totalRecords?.toLocaleString() || 'unknown'}\n• Chunk Size: ${chunkingInfo.chunkSize?.toLocaleString() || 'N/A'}\n• More Available: ${chunkingInfo.hasMore ? 'Yes' : 'No'}`;
                  if (chunkingInfo.hasMore) {
                    details += `\n• Next chunk will load ${Math.min(chunkingInfo.chunkSize || 25000, (chunkingInfo.totalRecords || 0) - merged.length).toLocaleString()} more records`;
                  }
                }

                toast.showInfo(details, {
                  title: '📈 Dataset Summary',
                  duration: 8000,
                });
              },
            },
          ],
        });
      }

      const defaults = { y1: true, y2: true, x: true, y: true };
      setAllowedInversions({ ...defaults, ...(allowed || {}) });
      if (currentFetchIdRef.current === fetchId) {
        dispatch({ type: 'SET_DATA', payload: merged });
        try {
          let minTs = Number.POSITIVE_INFINITY,
            maxTs = 0;
          for (let i = 0; i < merged.length; i++) {
            const t = merged[i]?.measurement_timestamp ? new Date(merged[i].measurement_timestamp).getTime() : NaN;
            if (Number.isFinite(t)) {
              if (t < minTs) minTs = t;
              if (t > maxTs) maxTs = t;
            }
          }
          if (Number.isFinite(minTs) && Number.isFinite(maxTs) && maxTs > 0) {
            log.info('[COMMIT] final data window', new Date(minTs).toISOString(), '→', new Date(maxTs).toISOString());
          }
        } catch (e) {
          log.debug('[REDOX] window compute log failed:', e);
        }
      } else {
        log.debug('[FETCH] stale results ignored for fetchId=', fetchId);
      }
    },
    [maxFidelity, timeRange, selectedView, startDate, endDate, setAllowedInversions]
  );

  const fetchData = useCallback(async () => {
    log.debug('fetchData called with:', {
      selectedSites,
      timeRange,
      startDate,
      endDate,
      selectedView,
    });

    if (requestAbortRef.current) {
      log.debug('Aborting previous request');
      requestAbortRef.current.abort();
    }
    const controller = new AbortController();
    requestAbortRef.current = controller;

    let loadingToastId;
    let loadingTimeout = setTimeout(() => {
      loadingToastId = toast.showLoading('Loading redox data...', { dedupeKey: 'redox-loading' });
    }, LOADING_TOAST_DELAY_MS);

    try {
      log.debug('Entering fetch try block');
      const t0 = performance?.now() ?? Date.now();
      const fetchId = ++currentFetchIdRef.current;
      const rangeKey = timeRange === 'Custom Range' && startDate && endDate ? `custom|${startDate}|${endDate}` : `range|${timeRange}`;
      const fidelitySig = maxFidelity ? 'max' : 'std';
      // Normalize view into a data group so Overview (timeseries), Details, Snapshot, and Rolling share cache
      const viewGroup = (selectedView === 'timeseries' || selectedView === 'details' || selectedView === 'snapshot' || selectedView === 'rolling') ? 'series' : selectedView;
      const fetchKey = [selectedSites.join(','), rangeKey, fidelitySig, viewGroup].join('|');
      log.debug('Generated fetchKey:', fetchKey);

      // Smart data reuse: check if existing data is compatible
      const compatibility = checkDataCompatibility(fetchKey, fetchState.data);
      
      if (lastFetchKeyRef.current === fetchKey) {
        if (Array.isArray(fetchState.data) && fetchState.data.length > 0) {
          log.debug('Same fetch key as before and have data, skipping fetch');
          return;
        } else {
          log.debug('Same fetch key as before but no data present, proceeding to fetch');
        }
      }
      
      if (compatibility.compatible) {
        log.info(`🚀 [SMART CACHE] Reusing existing data for fidelity switch: ${compatibility.reason}`);
        
        // Apply fidelity filtering if downsampling from max to std
        let reusedData = fetchState.data;
        if (compatibility.reason === 'downsample-reuse') {
          log.info(`[SMART CACHE] About to apply fidelity filter. Original data length: ${fetchState.data?.length || 0}`);
          reusedData = applyFidelityFilter(fetchState.data, fidelitySig);
          log.info(`[SMART CACHE] After fidelity filter. New data length: ${reusedData?.length || 0}`);
          
          // Update the data with the filtered version
          if (reusedData !== fetchState.data) {
            log.info(`[SMART CACHE] Applied client-side fidelity filter - dispatching SET_DATA with ${reusedData?.length || 0} records`);
            dispatch({ type: 'SET_DATA', payload: reusedData });
            log.info(`[SMART CACHE] SET_DATA dispatched successfully`);
          } else {
            log.info(`[SMART CACHE] No data change after filtering - not dispatching SET_DATA`);
          }
        }
        
        // Update the fetchKey to reflect current state without refetching
        lastFetchKeyRef.current = fetchKey;
        log.debug('Data reused successfully, marking fetchKey:', fetchKey);
        
        // Data is already in state from SET_DATA dispatch - no need to reset
        log.info('🚀 [SMART CACHE] Smart cache reuse complete - data ready for rendering');
        return;
      }
      
      log.debug(`[SMART CACHE] Cannot reuse data: ${compatibility.reason}, proceeding with fetch`);
      

      dispatch({ type: 'START_FETCH' });

      const { startTsIso, endTsIso } = await determineDateWindow(controller);
      // Reset debug counters
      monthSourceStatsRef.current = { mem: 0, rq: 0, idb: 0, net: 0 };

      log.debug('[FETCH] Building API promises for view:', selectedView);
      const promises = [];
      const siteIds = selectedSites || [];

      const largeDatasetRanges = vizConfig.chunkRanges || [];
      const shouldChunk = largeDatasetRanges.includes(timeRange);
      const chunkSize = shouldChunk ? 100000 : null;

      dispatch({
        type: 'SET_PROGRESS',
        payload: { mode: shouldChunk ? 'chunk' : 'single', windowStart: startTsIso, windowEnd: endTsIso, sites: siteIds },
      });

      if (selectedView === 'timeseries' || selectedView === 'rolling' || selectedView === 'details') {
        log.debug('Creating promises for time series/rolling/details view');
        const useMaxFidelity = maxFidelity; // Raw = High cadence (96/day)
        // Use per-range resolution mapping for stable cache keys when not at max fidelity
        const suggestedResolution = useMaxFidelity ? null : (vizConfig?.resolutionByRange?.[timeRange] || '2H');
        const maxDepths = 6;
        // Let backend choose available depths up to maxDepths; do not hard-filter depths client-side
        const targetPoints = undefined;
        log.debug('[FETCH SUMMARY]', {
          preferArrow,
          resolution: suggestedResolution || 'raw',
          maxDepths,
          targetPoints: targetPoints || null,
          shouldChunk,
          chunkSize,
          startTsIso,
          endTsIso,
          sites: siteIds,
        });

        // For rolling, reuse timeseries dataset and compute roll24h client-side
        if (!shouldChunk && (selectedView === 'timeseries' || selectedView === 'details' || selectedView === 'rolling')) {
          // Full timeseries for each site (Details forces raw cadence)
          for (const s of siteIds) {
            log.debug('Adding timeseries promise for site:', s, 'full dataset');
            if (preferArrow) {
              const resParam = (suggestedResolution || 'raw');
              log.debug('[REQ] Arrow', { site: s, resolution: resParam, maxDepths, startTsIso, endTsIso });
              promises.push(
                (async () => {
                  try {
                    const res = await getProcessedEhTimeSeriesArrow(
                      {
                        siteId: s,
                        startTs: startTsIso,
                        endTs: endTsIso,
                        chunkSize: chunkSize,
                        resolution: resParam && typeof resParam === 'string' ? resParam.toLowerCase() : resParam,
                        maxDepths,
                        maxFidelity: useMaxFidelity || undefined,
                        ...(targetPoints ? { targetPoints } : {}),
                      },
                      controller.signal
                    );
                    checkAbort(controller.signal);
                    const rows = await parseArrowBufferToRows(res?.buffer, s);
                    if (rows && rows.length) {
                      return { data: rows, metadata: { total_records: res?.headers?.totalRecords || rows.length } };
                    }
                    const jsonRes = await getProcessedEhTimeSeries(
                      {
                        siteId: s,
                        startTs: startTsIso,
                        endTs: endTsIso,
                        chunkSize: chunkSize,
                        resolution: resParam && typeof resParam === 'string' ? resParam.toLowerCase() : resParam,
                        maxDepths,
                        maxFidelity: useMaxFidelity || undefined,
                        ...(targetPoints ? { targetPoints } : {}),
                      },
                      controller.signal
                    );
                    checkAbort(controller.signal);
                    return jsonRes;
                  } catch (e) {
                    log.info('[REDOX] Arrow path failed, falling back to JSON:', e?.message || e);
                    return await getProcessedEhTimeSeries(
                      {
                        siteId: s,
                        startTs: startTsIso,
                        endTs: endTsIso,
                        chunkSize: chunkSize,
                        resolution: resParam && typeof resParam === 'string' ? resParam.toLowerCase() : resParam,
                        maxDepths,
                        maxFidelity: useMaxFidelity || undefined,
                        ...(targetPoints ? { targetPoints } : {}),
                      },
                      controller.signal
                    );
                  }
                })()
              );
            } else {
                const resParam = (suggestedResolution || 'raw');
                log.debug('[REQ] JSON', { site: s, resolution: resParam, maxDepths, startTsIso, endTsIso });
                promises.push(
                  getProcessedEhTimeSeries(
                    {
                      siteId: s,
                      startTs: startTsIso,
                      endTs: endTsIso,
                      resolution: resParam && typeof resParam === 'string' ? resParam.toLowerCase() : resParam,
                      maxDepths,
                      maxFidelity: useMaxFidelity || undefined,
                      ...(targetPoints ? { targetPoints } : {}),
                    },
                    controller.signal
                  )
                );
            }
          }
        } else if (selectedView === 'rolling') {
          // Rolling mean per site
          for (const s of siteIds) {
            log.debug('Adding rolling mean promise for site:', s);
            promises.push(getProcessedEhRollingMean({ siteId: s, startTs: startTsIso, endTs: endTsIso }, controller.signal));
          }
        } else {
          // Monthly segmentation mode for large ranges: fetch month-sliced data per site using JSON columnar (server-cached)
          log.info('[MONTHLY] Using monthly segmentation for large range');
          const MONTH_CONCURRENCY = 4; // limit site-level concurrency
          for (let i = 0; i < siteIds.length; i += MONTH_CONCURRENCY) {
            const batchSites = siteIds.slice(i, i + MONTH_CONCURRENCY);
            const batch = batchSites.map((s) =>
              fetchMonthlyForSite(s, startTsIso, endTsIso, suggestedResolution, maxDepths, targetPoints, controller, useMaxFidelity)
            );
            const batchResults = await Promise.all(batch);
            checkAbort(controller.signal);
            for (const r of batchResults) {
              promises.push(Promise.resolve({ data: r.data, metadata: { ...r.metadata, chunked: false } }));
            }
          }
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
        // Force maximum fidelity mode to avoid server-side downsampling/aggregation
        promises.push(getRedoxAnalysisData({ sites: selectedSites, time_range: timeRange, start_date: startDate, end_date: endDate, performance_mode: 'maximum' }, controller.signal));
      }

      log.debug('[FETCH] Total promises created:', promises.length);
      log.debug('[FETCH] started fetchId=', currentFetchIdRef.current);
      log.debug('[FETCH] Calling Promise.all with', promises.length, 'promises');
      const results = await Promise.all(promises);
      checkAbort(controller.signal);
      log.debug('[FETCH] resolved fetchId=', currentFetchIdRef.current, 'results.len=', results.length);
      if (currentFetchIdRef.current !== fetchId) {
        log.debug('Stale results ignored for fetchId', fetchId);
        return;
      }

      processResults(results, siteIds, t0, startTsIso, endTsIso, fetchId, toast);
      setMonthSourceStats({ ...monthSourceStatsRef.current });

      lastFetchKeyRef.current = fetchKey;
      log.debug('Data set successfully, marking fetchKey:', fetchKey);

      clearTimeout(loadingTimeout);
      if (loadingToastId) {
        toast.removeToast(loadingToastId);
      }
    } catch (err) {
      const cancelled = isRequestCancelled(err);
      if (cancelled) {
        log.info('Request cancelled, stopping');
        dispatch({ type: 'RESET' });
        return;
      }
      log.error('Redox data fetch error:', err);
      dispatch({ type: 'SET_ERROR', payload: err.message });

      toast.showError(`Failed to load redox analysis: ${err.message}`, {
        title: 'Analysis Failed',
        actions: [
          {
            id: 'retry',
            label: 'Retry',
            action: () => fetchData(),
          },
        ],
      });
    } finally {
      clearTimeout(loadingTimeout);
      if (loadingToastId) {
        toast.removeToast(loadingToastId);
      }
    }
  }, [selectedSites, timeRange, startDate, endDate, maxFidelity, selectedView, vizConfig, preferArrow, toast, determineDateWindow, processResults, parseArrowBufferToRows, fetchState.data, checkDataCompatibility, applyFidelityFilter, fetchMonthlyForSite]);

  
  // Stable reference to trigger fetchData
  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;

  useEffect(() => {
    log.debug('useEffect triggered with:', {
      selectedSitesLength: selectedSites.length,
      selectedSites,
      timeRange,
      startDate,
      endDate,
      maxFidelity,
    });

    if (selectedSites.length > 0) {
      log.debug(`Setting ${DEBOUNCE_MS}ms debounce timer`);
      const debounceTimeout = setTimeout(() => {
        log.debug('Debounce timer fired, calling fetchData');
        fetchDataRef.current();
      }, DEBOUNCE_MS);

      return () => {
        log.debug('Cleanup: clearing debounce timer');
        clearTimeout(debounceTimeout);
      };
    } else {
      log.debug('No sites selected, skipping data fetch');
      dispatch({ type: 'RESET' });
    }
  }, [selectedSites, timeRange, startDate, endDate, maxFidelity, selectedView]);

  // Use cached date range to set available min/max dates
  useEffect(() => {
    if (cachedDateRange && isMountedRef.current) {
      const { earliest_date, latest_date } = cachedDateRange;
      if (earliest_date) setAvailableMinDate(earliest_date);
      if (latest_date) setAvailableMaxDate(latest_date);
    }
  }, [cachedDateRange]);

  const handleSiteChange = useCallback(
    (sites) => {
      setSelectedSites(sites);
    },
    [setSelectedSites]
  );

  const handleTimeRangeChange = useCallback(
    (range) => {
      setTimeRange(range);
    },
    [setTimeRange]
  );

  const handleApplyFilters = useCallback(() => {}, []);

  // Stable callbacks for UI interactions
  const handleToggleMaxFidelity = useCallback(() => {
    setMaxFidelity((v) => !v);
  }, [setMaxFidelity]);

  const handleInvertSeriesY = useCallback(() => {
    setInvertSeriesY((v) => !v);
  }, [setInvertSeriesY]);

  const handleInvertRollingY = useCallback(() => {
    setInvertRollingY((v) => !v);
  }, [setInvertRollingY]);

  const handleInvertX = useCallback(() => {
    setInvertX((v) => !v);
  }, [setInvertX]);

  const handleInvertY = useCallback(() => {
    setInvertY((v) => !v);
  }, [setInvertY]);

  const handleFiltersToggle = useCallback(() => {
    setFiltersCollapsed(!filtersCollapsed);
  }, [filtersCollapsed, setFiltersCollapsed]);

  const handleViewChange = useCallback((e) => {
    setSelectedView(e.target.value);
  }, [setSelectedView]);

  const handleChartTypeChange = useCallback((e) => {
    setChartType(e.target.value);
  }, []);

  const handleChartViewModeChange = useCallback((e) => {
    setChartViewMode(e.target.value);
  }, []);

  const handleSnapshotModeChange = useCallback((e) => {
    setSnapshotMode(e.target.value);
  }, []);

  const handlePreferArrowChange = useCallback((e) => {
    setPreferArrow(e.target.checked);
  }, []);

  const emptyStateContext = useMemo(() => ({
    onSiteChange: (sites) => {
      setSelectedSites(sites);
    },
    onTimeRangeChange: (range) => {
      setTimeRange(range);
    },
    onRetry: fetchData,
    onShowSample: () => {
      toast.showInfo('Sample data tutorial feature will be available in a future update.', {
        title: 'Feature Coming Soon',
        duration: 4000,
      });
    },
    tips: [
      'Redox measurements are typically available for Sites 1 and 2',
      'Try extending the time range to Last 1 Year for more data',
      'Redox data collection may be seasonal - check different time periods',
      'Contact your site administrator if data should be available',
    ],
    errorMessage: fetchState.error,
  }), [fetchData, toast, fetchState.error, setSelectedSites, setTimeRange]);

  useEffect(() => {
    if (!Array.isArray(fetchState.data) || fetchState.data.length === 0) return;
    log.debug('[DATA ANALYSIS] Starting test for identical values with', fetchState.data.length, 'records');
    try {
      let maxTs = 0;
      let minTs = Number.POSITIVE_INFINITY;
      const siteStats = new Map();

      for (const r of fetchState.data) {
        const site = r?.site_code;
        const t = r?.measurement_timestamp ? new Date(r.measurement_timestamp).getTime() : NaN;

        if (Number.isFinite(t)) {
          if (t > maxTs) maxTs = t;
          if (t < minTs) minTs = t;
        }

        if (site) {
          if (!siteStats.has(site)) {
            siteStats.set(site, {
              count: 0,
              uniqueTimestamps: new Set(),
              uniqueDepths: new Set(),
              uniqueEhValues: new Set(),
              timestampDepthPairs: new Set(),
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

      if (Number.isFinite(maxTs) && maxTs > 0) {
        const latest = new Date(maxTs).toISOString().slice(0, 10);
        log.info('[REDOX] latest record date (from data change):', latest);
      }
      if (Number.isFinite(minTs) && minTs > 0 && minTs !== Number.POSITIVE_INFINITY) {
        const earliest = new Date(minTs).toISOString().slice(0, 10);
        log.info('[REDOX] earliest record date (from data change):', earliest);
      }
    } catch (e) {
      log.warn('[REDOX] data analysis failed', e);
    }
  }, [fetchState.data]);

  return (
    <div className="modern-dashboard">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Redox Analysis</h1>
          <p className="dashboard-subtitle">{subtitleText}</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: '0.8rem', color: '#6c757d' }}>
              Cache: mem {monthSourceStats.mem} · rq {monthSourceStats.rq} · idb {monthSourceStats.idb} · net {monthSourceStats.net}
            </span>
          </div>
          <p style={{ color: '#6c757d', margin: 0, fontSize: '0.85rem' }}>Tip: Use the Y1/Y2 toggle to swap Depth and Redox axes.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {/* START: REDOX QUICK VIEW BUTTONS (Overview / Details) */}
          <button
            className={`btn ${selectedView !== 'details' ? 'btn-primary' : 'btn-outline-primary'} btn-sm`}
            onClick={() => setSelectedView('timeseries')}
            title="Overview"
          >
            <i className="bi bi-bar-chart me-1"></i> Overview
          </button>
          <button
            className={`btn ${selectedView === 'details' ? 'btn-primary' : 'btn-outline-primary'} btn-sm`}
            onClick={() => setSelectedView('details')}
            title="Details"
          >
            <i className="bi bi-table me-1"></i> Details
          </button>
          {/* END: REDOX QUICK VIEW BUTTONS (Overview / Details) */}
          <button className="btn btn-outline-secondary btn-sm" onClick={fetchData} disabled={fetchState.loading}>
            <i className={`bi ${fetchState.loading ? 'bi-arrow-repeat' : 'bi-arrow-clockwise'} me-1`}></i> Refresh
          </button>
          <button
            className={`btn btn-${maxFidelity ? 'primary' : 'outline-primary'} btn-sm`}
            onClick={handleToggleMaxFidelity}
            title="Toggle maximum fidelity (raw, no thinning)"
            disabled={fetchState.loading}
          >
            <i className="bi bi-brightness-high me-1"></i>
            {maxFidelity ? 'Max Fidelity: On' : 'Max Fidelity: Off'}
          </button>
          <ExportButton
            data={fetchState.data}
            filename={`redox_analysis_${selectedSites.join('_')}_${timeRange.toLowerCase().replace(/\s+/g, '_')}`}
            chartElementId="redox-analysis-chart"
            availableFormats={['csv', 'json', 'png', 'pdf']}
            variant="outline-success"
            size="sm"
            disabled={fetchState.data.length === 0}
            onExportStart={() => {}}
            onExportComplete={() => {}}
            onExportError={() => {}}
          />
        </div>
      </div>

      <SidebarFilters
        collapsed={filtersCollapsed}
        onToggleCollapse={handleFiltersToggle}
        top={
          tutorial.enabled ? (
            <div style={{ padding: '0.75rem 1rem' }}>
              <TutorialHint id="redox-filters" title="Filters">
                Choose sites and a date range, then click Apply. Custom ranges are limited to the available data window.
              </TutorialHint>
            </div>
          ) : null
        }
        selectedSites={selectedSites}
        onSiteChange={handleSiteChange}
        timeRange={timeRange}
        onTimeRangeChange={handleTimeRangeChange}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onApplyFilters={handleApplyFilters}
        loading={fetchState.loading}
        maxDate={availableMaxDate}
        minDate={availableMinDate}
      />

      <div className="main-content">
        <SimpleLoadingBar
          isVisible={fetchState.loading}
          message={`Loading redox data for ${selectedSites.length} site${selectedSites.length !== 1 ? 's' : ''}...`}
          stage="processing"
          compact={false}
          progress={fetchState.loadProgress?.mode === 'chunk' && fetchState.loadProgress?.perSite ?
            Math.round((Object.values(fetchState.loadProgress.perSite).reduce((sum, site) => sum + (site.loaded || 0), 0) /
            Object.values(fetchState.loadProgress.perSite).reduce((sum, site) => sum + (site.total || 1), 0)) * 100) : null}
          current={fetchState.data?.length || null}
          total={fetchState.loadProgress?.mode === 'chunk' && fetchState.loadProgress?.perSite ?
            Object.values(fetchState.loadProgress.perSite).reduce((sum, site) => sum + (site.total || 0), 0) : null}
          showPercentage={fetchState.loadProgress?.mode === 'chunk'}
          showCounts={fetchState.data?.length > 0 || (fetchState.loadProgress?.mode === 'chunk')}
        />

        {fetchState.loading ? (
          <RedoxProgress
            loadProgress={fetchState.loadProgress}
            selectedSites={selectedSites}
            maxFidelity={maxFidelity}
            activeWindowStart={activeWindowStart}
            activeWindowEnd={activeWindowEnd}
          />
        ) : fetchState.error ? (
          <EmptyState type="error" context={emptyStateContext} />
        ) : fetchState.data.length === 0 ? (
          <EmptyState type="no-redox-data" context={emptyStateContext} />
        ) : (
          <>
            <RedoxMetrics metrics={metrics} selectedSites={selectedSites} />
            <div className="chart-container">
              <div className="chart-header">
                <div>
                  <p style={{ color: '#6c757d', fontSize: '0.9rem', margin: 0 }}>
                    {`${(fetchState.data?.length || 0).toLocaleString()} points · ${
                      selectedView === 'timeseries' ? 'Time Series' : selectedView.charAt(0).toUpperCase() + selectedView.slice(1)
                    } · ${maxFidelity ? 'Max Fidelity' : 'Standard'}`}
                  </p>
                  <div style={{ marginTop: 4 }}>
                    <span
                      className={`badge ${maxFidelity ? 'bg-primary' : 'bg-secondary'}`}
                      title={maxFidelity ? 'Raw cadence, no thinning' : 'Resolution-by-range with smart thinning'}
                    >
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
                        Use View to switch between Time Series, Depth Profile, Zones, and Heatmap. In Time Series, the Y1/Y2 toggle swaps Depth and Redox axes.
                      </TutorialHint>
                    </div>
                  )}
                </div>
                <div className="chart-controls">
                  <select
                    value={selectedView}
                    onChange={handleViewChange}
                    style={{
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #dee2e6',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      marginRight: '0.5rem',
                      background: 'white',
                    }}
                  >
                    <option value="timeseries">Time Series</option>
                    <option value="snapshot">Depth Snapshot</option>
                    <option value="rolling">Rolling Trend (24h mean)</option>
                    {/* START: removed details from dropdown (use header buttons) */}
                    {/* <option value="details">Table View</option> */}
                    {/* END: removed details from dropdown (use header buttons) */}
                  </select>
                  {selectedView === 'timeseries' && (
                    <>
                      <select
                        value={chartViewMode}
                        onChange={handleChartViewModeChange}
                        style={{
                          padding: '0.5rem 0.75rem',
                          border: '1px solid #dee2e6',
                          borderRadius: '6px',
                          fontSize: '0.875rem',
                          marginRight: '0.5rem',
                          background: 'white',
                        }}
                      >
                        <option value="by-depth">Charts per Depth</option>
                        <option value="by-site">Charts per Site</option>
                      </select>
                      <select
                        value={chartType}
                        onChange={handleChartTypeChange}
                        style={{
                          padding: '0.5rem 0.75rem',
                          border: '1px solid #dee2e6',
                          borderRadius: '6px',
                          fontSize: '0.875rem',
                          background: 'white',
                        }}
                      >
                        <option value="line">Line Chart</option>
                        <option value="scatter">Scatter Plot</option>
                      </select>
                    </>
                  )}
                  <label className="form-check" style={{ marginLeft: '0.5rem', userSelect: 'none' }} title="Use Apache Arrow for high-volume loads">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={preferArrow}
                      onChange={handlePreferArrowChange}
                    />
                    <span className="form-check-label" style={{ marginLeft: 6 }}>Binary (Arrow)</span>
                  </label>
                  {selectedView === 'timeseries' && (
                    <button
                      className="btn btn-outline-secondary btn-sm ms-2"
                      onClick={handleInvertSeriesY}
                      title="Invert Y axis"
                    >
                      <i className="bi bi-arrow-down-up me-1"></i> Invert Y
                    </button>
                  )}
                  {selectedView === 'rolling' && (
                    <button
                      className="btn btn-outline-secondary btn-sm ms-2"
                      onClick={handleInvertRollingY}
                      title="Invert Y axis"
                    >
                      <i className="bi bi-arrow-down-up me-1"></i> Invert Y
                    </button>
                  )}
                  {selectedView === 'snapshot' && (
                    <>
                      <select
                        value={snapshotMode}
                        onChange={handleSnapshotModeChange}
                        style={{
                          padding: '0.5rem 0.75rem',
                          border: '1px solid #dee2e6',
                          borderRadius: '6px',
                          fontSize: '0.875rem',
                          marginLeft: '0.5rem',
                          background: 'white',
                        }}
                      >
                        <option value="profile">Profile Lines</option>
                        <option value="scatter">Scatter Points</option>
                      </select>
                      <button
                        className="btn btn-outline-secondary btn-sm ms-2"
                        onClick={handleInvertX}
                        disabled={!('x' in (allowedInversions || { x: true }))}
                        title="Invert X axis (Eh)"
                      >
                        <i className="bi bi-arrow-left-right me-1"></i> Invert X
                      </button>
                      <button
                        className="btn btn-outline-secondary btn-sm ms-2"
                        onClick={handleInvertY}
                        disabled={!('y' in (allowedInversions || { y: true }))}
                        title="Invert Y axis (Depth)"
                      >
                        <i className="bi bi-arrow-down-up me-1"></i> Invert Y
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div id="redox-analysis-chart">
                <ErrorBoundary>
                  {/* START: REDOX DETAILS VIEW ENHANCEMENTS (modern compact DataTable) */}
                  {selectedView === 'details' ? (
                    <RedoxTablePanel
                      data={fetchState.data}
                      columns={tableColumns}
                      loading={fetchState.loading}
                      selectedSites={selectedSites}
                      startDate={startDate}
                      endDate={endDate}
                    />
                  ) : (
                    <ErrorBoundary>
                      {(((selectedView === 'rolling' ? rollingData : fetchState.data) || []).length) === 0 ? (
                        <div className="text-muted small" style={{ padding: '0.5rem 0', minHeight: 320 }}>No data to display for the selected filters.</div>
                      ) : (
                        <VisibleOnView minHeight={320} rootMargin="200px">
                          <Suspense fallback={<div className="text-muted small" style={{ padding: '0.5rem 0' }}>Loading chart…</div>}>
                            <RedoxChartRouter
                              selectedView={selectedView}
                              data={selectedView === 'rolling' ? (rollingData || []) : (fetchState.data || [])}
                              chartData={chartData || {}}
                              chartType={chartType}
                              chartViewMode={chartViewMode}
                              snapshotMode={snapshotMode}
                              invertSeriesY={invertSeriesY}
                              invertRollingY={invertRollingY}
                              invertX={invertX}
                              invertY={invertY}
                              snapshotSeries={snapshotSeries || { profile: [], scatter: [] }}
                              parameterLabel={parameterLabel || 'Depth & Redox'}
                              selectedSites={selectedSites || []}
                              siteColors={siteColors || {}}
                            />
                          </Suspense>
                        </VisibleOnView>
                      )}
                    </ErrorBoundary>
                  )}
                  {/* END: REDOX DETAILS VIEW ENHANCEMENTS */}
                </ErrorBoundary>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ModernRedoxAnalysis;
