import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { loginUser, logoutUser, getAuthStatus, sendClientDebug, getAuthHealth, getHomeData } from '../services/api';
import { AuthContext } from './AuthContextDefinition';
import { safeStorage } from '../utils/safeStorage';
import { clearLegacyAuthData } from '../utils/authCleanup';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Auth request state to prevent overlapping calls
  const authRequestRef = useRef({
    isActive: false,
    requestId: null
  });

  // Single source of truth: Always check Flask backend for auth status
  const bcRef = useRef(null);
  // Initialize BroadcastChannel once
  useEffect(() => {
    try { bcRef.current = new BroadcastChannel('auth-sync'); } catch (_) { bcRef.current = null; }
    return () => { try { bcRef.current?.close(); } catch (_) {} };
  }, []);

  const tabIdRef = useRef(`${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const checkAuthStatus = useCallback(async (showLoading = true) => {
    // simple exponential backoff for transient failures
    const backoffRef = (checkAuthStatus.__backoffRef ||= { attempts: 0, timer: null });
    // Cross-tab throttle: avoid frequent background checks across tabs
    try {
      if (!showLoading) {
        const last = Number(safeStorage.getRaw('auth:lastCheckAt') || '0');
        // Skip if a background check ran in the last 120 seconds
        if (Date.now() - last < 120 * 1000) {
          console.debug('🛡️ [AUTH DEBUG] Skipping background auth check (recently checked)');
          return;
        }
      }
    } catch (_) {}
    // Cross-tab lock using localStorage to prevent parallel checks across tabs
    const LOCK_KEY = 'auth:lock';
    const now = Date.now();
    const LOCK_TTL = 5000; // 5s
    let haveLock = false;
    try {
      let obj = safeStorage.getJSON(LOCK_KEY);
      if (!obj || (now - (obj.ts || 0) > LOCK_TTL)) {
        // Lock is free or stale; acquire
        obj = { ts: now, holder: tabIdRef.current };
        safeStorage.setJSON(LOCK_KEY, obj);
        // verify
        const verify = safeStorage.getJSON(LOCK_KEY) || {};
        haveLock = verify.holder === tabIdRef.current;
      }
    } catch (_) { /* ignore storage errors */ }
    if (!haveLock) {
      // Another tab is leader; let it broadcast results
      return;
    }
    // Prevent concurrent checks within this tab
    if (authRequestRef.current.isActive) return;
    
    const requestId = Date.now() + Math.random();
    console.debug('🛡️ [AUTH DEBUG] Starting auth status check, request ID:', requestId);
    sendClientDebug('auth_check_start', { requestId });
    authRequestRef.current = {
      isActive: true,
      requestId
    };

    try {
      if (showLoading) {
        setLoading(true);
      }
      console.debug('🛡️ [AUTH DEBUG] Calling getAuthStatus API...', {
        origin: window.location.origin,
        href: window.location.href,
        withCredentials: true
      });
      const response = await getAuthStatus();
      console.debug('🛡️ [AUTH DEBUG] getAuthStatus response:', {
        authenticated: response?.authenticated,
        user: response?.user,
        keys: Object.keys(response || {}),
        httpStatus: response?.__httpStatus
      });
      sendClientDebug('auth_check_response', {
        requestId,
        authenticated: response?.authenticated,
        hasUser: !!response?.user,
        httpStatus: response?.__httpStatus
      });
      
      if (response.authenticated && response.user) {
        setUser(response.user);
        try { safeStorage.setRaw('auth:lastOK', String(Date.now())); } catch (_) {}
        // reset backoff on success
        backoffRef.attempts = 0;

        // Prefetch Home KPI data and code-split chunk in the background for instant landing
        try {
          // Fire-and-forget: preload Home page module
          import('../pages/ModernHome').catch(() => {});
        } catch (_) {}
        try {
          // Background prefetch of home KPI data with cache seed (skip if fresh)
          (async () => {
            try {
              const cached = safeStorage.getJSON('home:data:v1');
              const freshMs = 2 * 60 * 1000; // consider fresh for 2 minutes
              if (cached?.savedAt && (Date.now() - cached.savedAt) < freshMs) {
                return; // skip prefetch if recent cache exists
              }
            } catch (_) {}
            const res = await getHomeData();
            const s = res?.dashboard_data?.dashboard_stats || {};
            const latest = Array.isArray(res?.dashboard_data?.latest_per_site) ? res.dashboard_data.latest_per_site : [];
            const newMeta = { last_updated: res?.metadata?.last_updated || null };
            try {
              safeStorage.setJSON('home:data:v1', {
                savedAt: Date.now(),
                stats: {
                  active_sites: Number.isFinite(s.active_sites) ? s.active_sites : 0,
                  total_sites: Number.isFinite(s.total_sites) ? s.total_sites : 0,
                  recent_measurements: Number.isFinite(s.recent_measurements) ? s.recent_measurements : 0,
                  data_quality: Number.isFinite(s.data_quality) ? s.data_quality : null,
                  active_alerts: 0,
                  data_current_through: s.data_current_through || null,
                },
                meta: newMeta,
                latestBySite: latest,
              });
              try { window.dispatchEvent(new CustomEvent('home:data:updated')); } catch (_) {}
            } catch (_) {}
          })();
        } catch (_) {}
      } else {
        // Before nulling, perform a soft reauth check via /auth/health
        try {
          const health = await getAuthHealth();
          if (health && health.ok && health.authenticated) {
            // Another process re-established session; refresh status again silently
            await checkAuthStatus(false);
            return;
          }
        } catch (_) {}
        // Suppress stale unauth if lastOK was recent (< 2 min) and this wasn't a user-initiated check
        try {
          const lastOK = Number(safeStorage.getRaw('auth:lastOK') || '0');
          if (!showLoading && Date.now() - lastOK < 120000) {
            // schedule a confirmatory check and keep user as-is
            setTimeout(() => checkAuthStatus(false), 1500);
            return;
          }
        } catch (_) {}
        setUser(null);
      }
      try { bcRef.current?.postMessage({ type: 'auth-status', payload: response }); } catch (_) {}
    } catch (error) {
      console.error('🛡️ [AUTH DEBUG] Auth status check failed:', error);
      sendClientDebug('auth_check_error', { requestId, error: String(error?.message || error) });
      // Transient errors: schedule backoff retry; keep last-known user
      const t = String(error?.type || '').toUpperCase();
      if (t === 'AUTH_TRANSIENT' || t === 'NETWORK_ERROR' || t === 'UNKNOWN_ERROR') {
        const delays = [1000, 2000, 5000];
        const idx = Math.min(backoffRef.attempts, delays.length - 1);
        const delay = delays[idx];
        backoffRef.attempts = Math.min(backoffRef.attempts + 1, delays.length - 1);
        try { clearTimeout(backoffRef.timer); } catch (_) {}
        backoffRef.timer = setTimeout(() => checkAuthStatus(false), delay);
        return;
      }
      // Only clear user on explicit unauthorized
      if (t === 'UNAUTHORIZED') {
        setUser(null);
      }
    } finally {
      try { safeStorage.setRaw('auth:lastCheckAt', String(Date.now())); } catch (_) {}
      // Release lock if held by us
      try {
        const obj = safeStorage.getJSON(LOCK_KEY);
        if (obj && obj.holder === tabIdRef.current) {
          safeStorage.remove(LOCK_KEY);
        }
      } catch (_) {}
      if (showLoading) {
        setLoading(false);
      }
      // Always cleanup auth request state
      console.debug('🛡️ [AUTH DEBUG] Cleaning up auth request state for ID:', requestId);
      sendClientDebug('auth_check_end', { requestId });
      authRequestRef.current = {
        isActive: false,
        requestId: null
      };
    }
  }, []);

  // Listen for cross-tab auth status
  useEffect(() => {
    const bc = bcRef.current;
    if (!bc) return;
    const handler = (ev) => {
      const { type, payload } = ev.data || {};
      if (type === 'auth-status' && payload) {
        if (payload.authenticated && payload.user) {
          setUser(payload.user);
        } else {
          // Don't immediately null on cross-tab unauth; schedule a refresh to confirm
          setTimeout(() => checkAuthStatus(false), 100);
        }
      } else if (type === 'auth-request') {
        // Another tab requested an auth status sync
        checkAuthStatus(false).then(() => {
          try { bcRef.current?.postMessage({ type: 'auth-status', payload: { authenticated: !!user, user } }); } catch (_) {}
        });
      }
    };
    bc.addEventListener('message', handler);
    // Announce presence and request status from other tabs
    try { bc.postMessage({ type: 'auth-request' }); } catch (_) {}
    return () => bc.removeEventListener('message', handler);
  }, [checkAuthStatus]);

  // Initialize authentication - rely solely on Flask backend session
  useEffect(() => {
    // Clear any legacy auth data from localStorage
    console.debug('🛡️ [AUTH DEBUG] Mounting AuthProvider. Clearing legacy auth data.');
    clearLegacyAuthData();
    
    checkAuthStatus();
    
    // Reduced frequency: Periodic session validation (every 30 minutes)
    const sessionCheckInterval = setInterval(() => {
      // Only check if tab is visible to reduce multi-tab races
      if (!document.hidden) {
        checkAuthStatus(false); // Don't show loading for background checks
      }
    }, 30 * 60 * 1000);
    
    // Handle page visibility changes with debouncing to prevent rapid auth checks
    let visibilityTimeout;
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Debounce visibility changes - only check after user has been back for 2 seconds
        clearTimeout(visibilityTimeout);
        visibilityTimeout = setTimeout(() => {
          checkAuthStatus(false);
        }, 2000);
      } else {
        // Clear timeout if user switches away quickly
        clearTimeout(visibilityTimeout);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(sessionCheckInterval);
      clearTimeout(visibilityTimeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkAuthStatus]);

  const login = async (username, password) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await loginUser(username, password);
      
      if (response.user) {
        setUser(response.user);
        // Warm up Home route and KPI data immediately after login for instant landing
        try { import('../pages/ModernHome').catch(() => {}); } catch (_) {}
        try {
          (async () => {
            try {
              const cached = safeStorage.getJSON('home:data:v1');
              const freshMs = 2 * 60 * 1000;
              if (cached?.savedAt && (Date.now() - cached.savedAt) < freshMs) return;
            } catch (_) {}
            const res = await getHomeData();
            const s = res?.dashboard_data?.dashboard_stats || {};
            const latest = Array.isArray(res?.dashboard_data?.latest_per_site) ? res.dashboard_data.latest_per_site : [];
            const newMeta = { last_updated: res?.metadata?.last_updated || null };
            try {
              safeStorage.setJSON('home:data:v1', {
                savedAt: Date.now(),
                stats: {
                  active_sites: Number.isFinite(s.active_sites) ? s.active_sites : 0,
                  total_sites: Number.isFinite(s.total_sites) ? s.total_sites : 0,
                  recent_measurements: Number.isFinite(s.recent_measurements) ? s.recent_measurements : 0,
                  data_quality: Number.isFinite(s.data_quality) ? s.data_quality : null,
                  active_alerts: 0,
                  data_current_through: s.data_current_through || null,
                },
                meta: newMeta,
                latestBySite: latest,
              });
              try { window.dispatchEvent(new CustomEvent('home:data:updated')); } catch (_) {}
            } catch (_) {}
          })();
        } catch (_) {}
        return { success: true };
      } else {
        throw new Error('Login failed - no user data returned');
      }
    } catch (error) {
      const errorMessage = error.message || 'Login failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      await logoutUser();
    } catch (error) {
      console.error('Logout failed:', error);
      // Continue with logout even if API call fails
    } finally {
      setUser(null);
      setError(null);
      setLoading(false);
    }
  };

  const clearError = () => {
    setError(null);
  };

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    user,
    loading,
    error,
    isAuthenticated: !!user,
    login,
    logout,
    checkAuthStatus,
    clearError
  }), [user, loading, error, login, logout, checkAuthStatus, clearError]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Auth utilities exported from separate authUtils.js file for fast refresh compatibility

export default AuthProvider;
