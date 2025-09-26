import React, { useMemo, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { loginUser, logoutUser, getAuthStatus } from '../services/api';
import { AuthContext } from './AuthContextDefinition';
import { clearLegacyAuthData } from '../utils/authCleanup';

const AUTH_STATUS_QUERY_KEY = ['auth-status'];

const mapAuthPayload = (payload) => {
  if (!payload) {
    return { authenticated: false, user: null };
  }
  if (payload.success === false) {
    return { authenticated: false, user: null };
  }
  const data = payload.data || payload;
  return {
    authenticated: Boolean(data?.authenticated),
    user: data?.user || null,
  };
};

export const AuthProvider = ({ children }) => {
  const queryClient = useQueryClient();
  const [authError, setAuthError] = useState(null);

  // Ensure legacy storage artifacts are cleared once on mount
  React.useEffect(() => {
    clearLegacyAuthData();
  }, []);

  const authStatusQuery = useQuery({
    queryKey: AUTH_STATUS_QUERY_KEY,
    queryFn: async () => {
      try {
        const response = await getAuthStatus();
        setAuthError(null);
        return mapAuthPayload(response);
      } catch (error) {
        if (error?.type === 'UNAUTHORIZED') {
          setAuthError(null);
          return { authenticated: false, user: null };
        }
        const message = error instanceof Error ? error.message : 'Authentication check failed';
        setAuthError(message);
        return { authenticated: false, user: null };
      }
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: authData, isLoading, isFetching, refetch, fetchStatus } = authStatusQuery;

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }) => {
      const payload = await loginUser(username, password);
      return payload;
    },
    onSuccess: (payload) => {
      const mapped = mapAuthPayload({ success: true, data: { authenticated: true, user: payload?.data?.user } });
      queryClient.setQueryData(AUTH_STATUS_QUERY_KEY, mapped);
      setAuthError(null);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Login failed';
      setAuthError(message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_STATUS_QUERY_KEY });
    }
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const payload = await logoutUser();
      return payload;
    },
    onSuccess: () => {
      queryClient.setQueryData(AUTH_STATUS_QUERY_KEY, { authenticated: false, user: null });
      setAuthError(null);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Logout failed';
      setAuthError(message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_STATUS_QUERY_KEY });
    }
  });

  const login = useCallback(async (username, password) => {
    try {
      const payload = await loginMutation.mutateAsync({ username, password });
      if (payload?.success) {
        return { success: true, user: payload?.data?.user || null };
      }
      const primaryError = Array.isArray(payload?.errors) ? payload.errors[0] : null;
      const errorMessage = primaryError?.message || 'Login failed';
      const errorCode = primaryError?.code || 'LOGIN_FAILED';
      const errorMeta = primaryError?.meta || null;
      return { success: false, error: errorMessage, code: errorCode, meta: errorMeta, errors: payload?.errors || [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      const type = (error && typeof error === 'object' && 'type' in error) ? error.type : 'LOGIN_FAILED';
      const meta = (error && typeof error === 'object' && 'meta' in error) ? error.meta : null;
      setAuthError(message);
      return { success: false, error: message, code: type, meta };
    }
  }, [loginMutation]);

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Logout failed';
      setAuthError(message);
      throw error;
    }
  }, [logoutMutation]);


const checkAuthStatus = useCallback((force = false) => {
  if (force || fetchStatus === 'idle') {
    return refetch();
  }
  return Promise.resolve(authData);
}, [authData, fetchStatus, refetch]);

  const clearError = useCallback(() => {
    setAuthError(null);
    loginMutation.reset();
    logoutMutation.reset();
  }, [loginMutation, logoutMutation]);

  const contextValue = useMemo(() => {
    const data = authData || { authenticated: false, user: null };
    const loading = isLoading || isFetching || loginMutation.isPending;
    return {
      user: data.user,
      loading,
      error: authError,
      isAuthenticated: data.authenticated,
      status: data.authenticated ? 'authenticated' : (loading ? 'checking' : 'unauthenticated'),
      login,
      logout,
      checkAuthStatus,
      clearError,
    };
  }, [authData, isLoading, isFetching, loginMutation.isPending, authError, login, logout, checkAuthStatus, clearError]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
