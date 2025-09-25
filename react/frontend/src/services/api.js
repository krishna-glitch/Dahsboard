import axios from 'axios';
import { normalizeParams, canonicalKeyFromParams } from '../utils/normalize';
import { registerCache, DEFAULT_TTL } from '../utils/cacheManager';

// API base URL
// IMPORTANT: For cookie-based auth to persist across refresh, point dev to the real API origin
// instead of relying on the Vite proxy. Browsers don't attach API cookies on proxied same-origin requests.
const isDev = !!import.meta?.env?.DEV;
// Prefer explicit env when provided
let API_BASE_URL = (import.meta?.env?.VITE_API_BASE_URL) ? String(import.meta.env.VITE_API_BASE_URL) : '';
if (!API_BASE_URL) {
  if (isDev) {
    // Dev server uses Vite proxy to keep same-origin
    API_BASE_URL = '/api/v1';
  } else {
    // Preview/prod: default to backend on port 5000 with SAME HOSTNAME to preserve cookies (avoid 127.0.0.1 vs localhost mismatch)
    const host = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : 'localhost';
    const apiPort = (import.meta?.env?.VITE_API_PORT) ? String(import.meta.env.VITE_API_PORT) : '5000';
    API_BASE_URL = `http://${host}:${apiPort}/api/v1`;
  }
}

// Debug logs (guarded): set VITE_DEBUG_API=1 to enable
const DEBUG_API = !!(import.meta?.env?.DEV) || String(import.meta?.env?.VITE_DEBUG_API || '').toLowerCase() === '1';
if (DEBUG_API) {
  // eslint-disable-next-line no-console
  console.log('🔗 API_BASE_URL:', API_BASE_URL);
  // eslint-disable-next-line no-console
  console.log('🌍 Environment variables:', import.meta?.env);
}

// Request deduplication cache to prevent multiple identical requests
const pendingRequests = new Map();

// Register pending requests cache with short TTL (requests should not be pending long)
registerCache('pendingRequests', pendingRequests, DEFAULT_TTL.SHORT, 50);

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 180000, // 180s to accommodate full-detail year queries
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  withCredentials: true, // Enable cookies for session management
});

// Add response interceptor for consistent error handling
apiClient.interceptors.response.use(
  (response) => {
    const data = response.data;
    try {
      // Attach HTTP status non-enumerably so callers still see raw data
      Object.defineProperty(data, '__httpStatus', {
        value: response.status,
        enumerable: false,
        configurable: false
      });
    } catch {
      /* If data is not extensible (e.g., primitive), ignore */
    }
    return data;
  },
  (error) => {
    // Use structured logging-like format; callers can decide UX
    console.warn('API Error:', { message: error?.message, code: error?.code, status: error?.response?.status });
    
    // Custom Error class for API-related errors
    class ApiError extends Error {
      constructor(type, message, originalError = null) {
        super(message);
        this.name = 'ApiError';
        this.type = type;
        this.originalError = originalError;
      }
    }

    if (error.response) {
      // Server responded with error status (e.g., 4xx, 5xx)
      const message = error.response.data?.message || error.response.data?.error || 'Server error';
      if (error.response.status === 404) {
        throw new ApiError('NOT_FOUND', message, error);
      } else if (error.response.status === 400) {
        throw new ApiError('BAD_REQUEST', message, error);
      } else if (error.response.status === 401) {
        // Distinguish transient vs session issues using a response hint if provided
        const hint = error.response.data?.hint || '';
        const isTransient = /timeout|temporar|retry/i.test(hint) || error.code === 'ECONNABORTED';
        throw new ApiError(isTransient ? 'AUTH_TRANSIENT' : 'UNAUTHORIZED', message, error);
      } else if (error.response.status === 403) {
        throw new ApiError('FORBIDDEN', message, error);
      } else {
        throw new ApiError('SERVER_ERROR', message, error);
      }
    } else if (axios.isCancel(error)) {
      // Request was cancelled - mark clearly so callers can ignore
      const cancelled = new Error('Request cancelled');
      cancelled.name = 'RequestCancelled';
      cancelled.type = 'CANCELLED';
      cancelled.isCancelled = true;
      return Promise.reject(cancelled);
    } else if (error.request) {
      // The request was made but no response was received (e.g., network error)
      throw new ApiError('NETWORK_ERROR', 'Network error - please check your connection', error);
    } else {
      // Something happened in setting up the request that triggered an Error
      throw new ApiError('UNKNOWN_ERROR', error.message || 'An unexpected error occurred', error);
    }
  }
);

// Stable stringify to avoid key-order issues in dedup keys
const stableStringify = (value) => {
  if (value === null) return 'null';
  const t = typeof value;
  if (t !== 'object') return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${k}:${stableStringify(value[k])}`).join(',')}}`;
};

// Generate cache key for request deduplication
const generateRequestKey = (endpoint, method, body, params) => {
  try {
    const norm = normalizeParams(endpoint, params);
    const canonical = canonicalKeyFromParams(norm);
    return `${method}:${canonical}`;
  } catch {
    // Fallback to stable stringify if normalization fails
    return `${method}:${endpoint}:${stableStringify(body || {})}:${stableStringify(params || {})}`;
  }
};

export const fetchData = async (endpoint, method = 'GET', body = null, params = null, signal = null, allowDuplicates = false) => {
  if (DEBUG_API) console.log('🔥 [API DEBUG] fetchData called:', { endpoint, method, params, allowDuplicates });
  
  // Generate request key for deduplication (unless explicitly allowed)
  const requestKey = allowDuplicates ? null : generateRequestKey(endpoint, method, body, params);
  if (DEBUG_API) console.log('🔥 [API DEBUG] Generated requestKey:', requestKey);
  
  // Check for pending identical request
  if (requestKey && pendingRequests.has(requestKey)) {
    if (DEBUG_API) console.log(`🔄 [API DEBUG] Deduplicating request: ${requestKey}`);
    return pendingRequests.get(requestKey);
  }

  const config = {
    method,
    url: endpoint,
  };

  if (body) {
    config.data = body;
  }

  if (params) {
    // Handle array parameters properly for Flask
    const processedParams = { ...params };
    
    // Convert array parameters to proper format
    Object.keys(processedParams).forEach(key => {
      if (Array.isArray(processedParams[key])) {
        // For arrays, send as comma-separated string (Flask backend expects this)
        processedParams[key] = processedParams[key].join(',');
      }
    });
    
    config.params = processedParams;
  }

  // Add abort signal support for axios
  if (signal) {
    // Convert AbortController signal to axios CancelToken if needed
    const source = axios.CancelToken.source();
    config.cancelToken = source.token;
    
    // Listen for abort signal
    signal.addEventListener('abort', () => {
      source.cancel('Request cancelled');
    });
  }

  // Create request promise
  if (DEBUG_API) console.log('🔥 [API DEBUG] Making request to:', `${API_BASE_URL}/${endpoint}`, 'with config:', config);
  const requestPromise = apiClient.request(config);
  
  // Store in pending requests if deduplication enabled
  if (requestKey) {
    if (DEBUG_API) console.log('🔥 [API DEBUG] Storing request in pending:', requestKey);
    // Cache size management is handled automatically by the cache manager
    pendingRequests.set(requestKey, requestPromise);
    
    // Clean up after request completes (success or failure)
    requestPromise
      .then(result => {
        if (DEBUG_API) console.log('🔥 [API DEBUG] Request completed successfully:', requestKey);
        pendingRequests.delete(requestKey);
        return result;
      })
      .catch(error => {
        if (DEBUG_API) console.log('🔥 [API DEBUG] Request failed:', requestKey, error);
        pendingRequests.delete(requestKey);
        throw error;
      });
  }

  if (DEBUG_API) console.log('🔥 [API DEBUG] Returning request promise for:', endpoint);
  return requestPromise.then(result => {
    if (DEBUG_API) console.log('🔥 [API DEBUG] Final response for', endpoint, ':', result);
    return result;
  }).catch(error => {
    if (DEBUG_API) console.error('🔥 [API DEBUG] Final error for', endpoint, ':', error);
    throw error;
  });
};

export const runDataDiagnostics = async () => {
  return fetchData('data_diagnostics/run');
};

export const getSystemHealthSummary = async () => {
  return fetchData('system_health/summary');
};

export const getDataVolume = async () => {
  return fetchData('system_health/data-volume');
};

export const getPerformanceSummary = async () => {
  return fetchData('performance/summary');
};

export const getUploadHistory = async () => {
  return fetchData('upload/history');
};

// S3 integration (demo-safe)
export const listS3Objects = async ({ prefix = '', token = null, pageSize = 50 } = {}) => {
  const params = { prefix, page_size: pageSize };
  if (token) params.token = token;
  return fetchData('upload/s3/list', 'GET', null, params, null, true);
};

export const getS3PresignedGetUrl = async (key) => {
  return fetchData('upload/s3/sign-get', 'POST', { key }, null, null, true);
};

export const getS3PresignedPutUrl = async (key, contentType = 'application/octet-stream') => {
  return fetchData('upload/s3/sign-put', 'POST', { key, contentType }, null, null, true);
};

export const uploadFile = async (formData) => {
  // For file uploads, do NOT set Content-Type header manually.
  // The browser will set it correctly for FormData, including boundary.
  const url = `${API_BASE_URL}/upload/file`;
  const options = {
    method: 'POST',
    body: formData,
  };

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Upload failed');
    }
    return await response.json();
  } catch (error) {
    console.error('Upload API Error:', error);
    throw error;
  }
};

// Compatibility wrapper: fetch redox data via processed time_series for each site
export const getRedoxAnalysisData = async (params, signal = null) => {
  const sitesCsv = params?.sites || '';
  const sites = sitesCsv ? String(sitesCsv).split(',').map(s => s.trim()).filter(Boolean) : [];
  const start = params?.start_date || params?.start_ts;
  const end = params?.end_date || params?.end_ts;
  if (!sites.length || !start || !end) {
    // Preserve old shape with empty results
    return { redox_data: [], metadata: { has_data: false, error: 'Missing required params' } };
  }
  const maxFidelity = params?.max_fidelity === true || params?.max_fidelity === '1' || params?.performance_mode === 'maximum';
  const cadence = maxFidelity ? '96/day' : '12/day';
  const allowedDepths = [10, 30, 50, 100, 150, 200];
  const chunkSize = 100000;
  const allRows = [];
  for (const site of sites) {
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const res = await fetchData('redox_analysis/processed/time_series', 'GET', null, {
        site_id: site,
        start_ts: start,
        end_ts: end,
        format: 'columnar',
        max_fidelity: maxFidelity ? '1' : '0',
        allowed_depths: allowedDepths.join(','),
        chunk_size: chunkSize,
        offset,
      }, signal, true);
      // Flatten columnar into rows if present
      if (res?.data_columnar) {
        const cols = res.data_columnar;
        const n = (cols.measurement_timestamp || []).length;
        for (let i = 0; i < n; i++) {
          allRows.push({
            measurement_timestamp: cols.measurement_timestamp ? cols.measurement_timestamp[i] : undefined,
            processed_eh: cols.processed_eh ? cols.processed_eh[i] : undefined,
            depth_cm: cols.depth_cm ? cols.depth_cm[i] : undefined,
            site_code: cols.site_code ? cols.site_code[i] : site
          });
        }
      } else if (Array.isArray(res?.data)) {
        allRows.push(...res.data);
      } else if (Array.isArray(res?.redox_data)) {
        allRows.push(...res.redox_data);
      }
      const meta = res?.metadata || {};
      const info = meta.chunk_info || {};
      hasMore = !!info.has_more;
      if (hasMore) {
        offset = (info.offset || 0) + (info.chunk_size || chunkSize);
      }
    }
  }
  return {
    redox_data: allRows,
    metadata: {
      has_data: allRows.length > 0,
      cadence,
      depths: allowedDepths,
      sites
    }
  };
};

export const getRedoxDateRange = async (sites = []) => {
  const params = sites && sites.length ? { sites: sites.join(',') } : null;
  return fetchData('redox_analysis/date_range', 'GET', null, params, null, true);
};

// Processed Eh (materialized view) endpoints
export const getProcessedEhTimeSeries = async ({ siteId, startTs, endTs, chunkSize = null, offset = 0, resolution = null, maxDepths = null, allowedDepths = null, depthTolerance = null, targetPoints = null, source = null, maxFidelity = null }, signal = null) => {
  const params = { 
    site_id: siteId, 
    start_ts: startTs, 
    end_ts: endTs,
    format: 'columnar',
    ...(source && { source }),
    ...((maxFidelity !== null && maxFidelity !== undefined) ? { max_fidelity: maxFidelity ? '1' : '0' } : {}),
    ...(chunkSize && { chunk_size: chunkSize, offset }),
    ...(resolution && { resolution }),
    ...(Number.isFinite(maxDepths) && maxDepths > 0 && { max_depths: maxDepths }),
    ...(Array.isArray(allowedDepths) && allowedDepths.length > 0 && { allowed_depths: allowedDepths.join(',') }),
    ...(Number.isFinite(depthTolerance) && depthTolerance > 0 && { depth_tolerance: depthTolerance }),
    ...(Number.isFinite(targetPoints) && targetPoints > 0 && { target_points: targetPoints })
  };
  if (DEBUG_API) console.log('🚀 [API] Calling optimized time series endpoint with caching and chunked loading support');
  return fetchData('redox_analysis/processed/time_series', 'GET', null, params, signal, true);
};

// Arrow variant (binary). Requires consumer to parse Arrow on the client.
export const getProcessedEhTimeSeriesArrow = async ({ siteId, startTs, endTs, chunkSize = null, offset = 0, resolution = null, maxDepths = null, allowedDepths = null, depthTolerance = null, targetPoints = null, source = null, maxFidelity = null }, signal = null) => {
  const rawParams = {
    site_id: siteId,
    start_ts: startTs,
    end_ts: endTs,
    format: 'arrow',
    ...(source && { source }),
    ...((maxFidelity !== null && maxFidelity !== undefined) ? { max_fidelity: maxFidelity ? '1' : '0' } : {}),
    ...(chunkSize && { chunk_size: chunkSize, offset }),
    ...(resolution && { resolution }),
    ...(Number.isFinite(maxDepths) && maxDepths > 0 && { max_depths: maxDepths }),
    ...(Array.isArray(allowedDepths) && allowedDepths.length > 0 && { allowed_depths: allowedDepths.join(',') }),
    ...(Number.isFinite(depthTolerance) && depthTolerance > 0 && { depth_tolerance: depthTolerance }),
    ...(Number.isFinite(targetPoints) && targetPoints > 0 && { target_points: targetPoints })
  };
  // Build query string
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(rawParams)) {
    if (v === undefined || v === null) continue;
    usp.append(k, String(v));
  }
  const url = `${API_BASE_URL}/redox_analysis/processed/time_series?${usp.toString()}`;
  const res = await fetch(url, { method: 'GET', credentials: 'include', signal });
  if (!res.ok) throw new Error(`Arrow request failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return {
    buffer,
    headers: {
      totalRecords: Number(res.headers.get('x-total-records') || 0),
      returnedRecords: Number(res.headers.get('x-returned-records') || 0),
      chunkOffset: res.headers.get('x-chunk-offset') != null ? Number(res.headers.get('x-chunk-offset')) : null,
      chunkSize: res.headers.get('x-chunk-size') != null ? Number(res.headers.get('x-chunk-size')) : null,
      chunkHasMore: String(res.headers.get('x-chunk-has-more') || '') === 'true'
    }
  };
};

export const getProcessedEhDepthSnapshot = async ({ siteId, ts }, signal = null) => {
  const params = { site_id: siteId, ts };
  return fetchData('redox_analysis/processed/depth_snapshot', 'GET', null, params, signal, true);
};

export const getProcessedEhRollingMean = async ({ siteId, startTs, endTs, windowHours = 24 }, signal = null) => {
  const params = { 
    site_id: siteId, 
    start_ts: startTs, 
    end_ts: endTs,
    window_hours: windowHours 
  };
  if (DEBUG_API) console.log('🚀 [API] Calling high-performance Polars rolling mean endpoint with caching');
  return fetchData('redox_analysis/processed/rolling_mean', 'GET', null, params, signal, true);
};

export const getSiteComparisonData = async (params, options = {}) => {
  // Site comparison requests should be deduplicated since they involve complex calculations
  return fetchData('site_comparison/data', 'GET', null, params, null, options.allowDuplicates || false);
};

export const getReportHistory = async () => {
  return fetchData('reports/history');
};

export const generateReport = async (reportData) => {
  return fetchData('reports/generate', 'POST', reportData);
};

export const getAlertsData = async (params) => {
  // Allow duplicates for alerts to ensure fresh data
  return fetchData('alerts/data', 'GET', null, params, null, true);
};

// Auth health endpoint for soft reauth checks
export const getAuthHealth = async (signal = null) => {
  return fetchData('auth/health', 'GET', null, null, signal, true);
};

export const getWaterQualityData = async (params, signal = null) => {
  // Use request deduplication to prevent infinite loops while allowing fresh data on filter changes
  // Wire through abort signal so callers can cancel in-flight requests
  const res = await fetchData('water_quality/data', 'GET', null, params, signal, false);
  // Normalize possible tuple-like responses and shapes
  const body = Array.isArray(res) ? (res[0] || {}) : (res || {});
  const rows = Array.isArray(body.water_quality_data) ? body.water_quality_data
              : (Array.isArray(body.data) ? body.data : []);
  const metadata = body.metadata || null;
  return { water_quality_data: rows, metadata };
};

export const getAvailableSites = async (options = {}) => {
  // Sites data changes infrequently, safe to deduplicate
  return fetchData('water_quality/sites', 'GET', null, null, null, options.allowDuplicates || false);
};

export const getAdminSummary = async () => {
  return fetchData('admin/summary');
};

export const getAdminUserList = async (roleFilter = 'all', statusFilter = 'active') => {
  return fetchData(`admin/users?role=${roleFilter}&status=${statusFilter}`);
};

export const getSessionStatistics = async () => {
  return fetchData('admin/sessions');
};

export const loginUser = async (username, password) => {
  return fetchData('auth/login', 'POST', { username, password });
};

export const logoutUser = async () => {
  return fetchData('auth/logout', 'POST');
};

export const getAuthStatus = async () => {
  console.log('[AUTH API] getAuthStatus: sending request');
  const res = await fetchData('auth/status');
  console.log('[AUTH API] getAuthStatus: received', { authenticated: res?.authenticated, user: res?.user, __httpStatus: res?.__httpStatus });
  return res;
};

// Lightweight client debug logger that sends entries to the backend log file
export const sendClientDebug = (event, data = {}) => {
  try {
    const payload = JSON.stringify({ event, data });
    const url = `${API_BASE_URL}/debug/log`;
    // Always use fetch with keepalive to ensure delivery through the dev proxy
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
      credentials: 'include'
    }).catch(() => {});
  } catch {
    /* ignore debug logging errors */
  }
};

export const getHomeData = async (params = {}) => {
  return fetchData('home/data', 'GET', null, params);
};

// Config APIs
export const getTimeRanges = async () => {
  // Allow duplicates for time ranges to ensure fresh config data
  return fetchData('config/time-ranges', 'GET', null, null, null, true);
};

export const getRedoxSettings = async () => {
  return fetchData('config/redox-settings', 'GET', null, null, null, true);
};

// Data Quality APIs
export const getDataQualitySummary = async (params = {}) => {
  return fetchData('data_quality/summary', 'GET', null, params, null, true);
};

// Search API endpoints
// Global search removed

// Create default API object with commonly used methods
const api = {
  get: (endpoint, config = {}) => apiClient.get(endpoint, config),
  post: (endpoint, data, config = {}) => apiClient.post(endpoint, data, config),
  put: (endpoint, data, config = {}) => apiClient.put(endpoint, data, config),
  delete: (endpoint, config = {}) => apiClient.delete(endpoint, config),
  patch: (endpoint, data, config = {}) => apiClient.patch(endpoint, data, config)
};

// Export both default and named exports
export default api;
export { apiClient };
