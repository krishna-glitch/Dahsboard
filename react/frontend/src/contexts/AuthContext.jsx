import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { loginUser, logoutUser, getAuthStatus } from '../services/api';
import { AuthContext } from './AuthContextDefinition';
import { clearLegacyAuthData } from '../utils/authCleanup';

const AUTH_STATES = {
  CHECKING: 'checking',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
};

export const AuthProvider = ({ children }) => {
  const [status, setStatus] = useState(AUTH_STATES.CHECKING);
  const [user, setUser] = useState(null);
  const [loginError, setLoginError] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const inFlightRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const applyAuthResponse = useCallback((response) => {
    if (!isMountedRef.current) return;

    if (response?.authenticated && response.user) {
      setUser(response.user);
      setStatus(AUTH_STATES.AUTHENTICATED);
    } else {
      setUser(null);
      setStatus(AUTH_STATES.UNAUTHENTICATED);
    }
  }, []);

  const performStatusCheck = useCallback(async (forceLoading = false) => {
    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    if (forceLoading) {
      if (isMountedRef.current) {
        setStatus(AUTH_STATES.CHECKING);
      }
    } else if (isMountedRef.current) {
      setIsRefreshing(true);
    }

    const request = (async () => {
      try {
        const response = await getAuthStatus();
        if (isMountedRef.current) {
          setAuthError(null);
          applyAuthResponse(response);
        }
        return response;
      } catch (error) {
        const errorType = (error && typeof error === 'object' && 'type' in error) ? error.type : '';

        if (isMountedRef.current) {
          if (errorType === 'UNAUTHORIZED') {
            setAuthError(null);
          } else {
            const message = error instanceof Error ? error.message : 'Authentication check failed';
            setAuthError(message);
          }
          applyAuthResponse(null);
        }
        return null;
      } finally {
        if (isMountedRef.current) {
          setIsRefreshing(false);
        }
      }
    })();

    inFlightRef.current = request.finally(() => {
      inFlightRef.current = null;
    });

    return inFlightRef.current;
  }, [applyAuthResponse]);

  useEffect(() => {
    clearLegacyAuthData();
    performStatusCheck(true);
  }, [performStatusCheck]);

  const login = useCallback(async (username, password) => {
    try {
      setLoginError(null);
      const response = await loginUser(username, password);

      if (response?.user) {
        applyAuthResponse({ authenticated: true, user: response.user });
        return { success: true };
      }

      const message = response?.error || 'Login failed';
      setLoginError(message);
      return { success: false, error: message };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      setLoginError(message);
      return { success: false, error: message };
    }
  }, [applyAuthResponse]);

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      if (isMountedRef.current) {
        setLoginError(null);
        setAuthError(null);
        applyAuthResponse(null);
      }
    }
  }, [applyAuthResponse]);

  const checkAuthStatus = useCallback((force = false) => {
    return performStatusCheck(Boolean(force));
  }, [performStatusCheck]);

  const clearError = useCallback(() => {
    setLoginError(null);
    setAuthError(null);
  }, []);

  const value = useMemo(() => ({
    user,
    loading: status === AUTH_STATES.CHECKING || isRefreshing,
    error: loginError || authError,
    isAuthenticated: status === AUTH_STATES.AUTHENTICATED,
    status,
    login,
    logout,
    checkAuthStatus,
    clearError,
  }), [user, status, isRefreshing, loginError, authError, login, logout, checkAuthStatus, clearError]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
