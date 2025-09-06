import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/authUtils';
import { sendClientDebug } from '../services/api';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    console.log('[PROTECTED ROUTE] loading auth state, blocking route');
    try { 
      sendClientDebug('protected_route_loading', { path: location.pathname }); 
    } catch (error) {
      console.warn('Failed to send debug info for protected route loading:', error);
    }
    return (
      <div className="loading-container" style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log('[PROTECTED ROUTE] not authenticated, redirecting to /login');
    try { 
      sendClientDebug('protected_route_redirect', { path: location.pathname }); 
    } catch (error) {
      console.warn('Failed to send debug info for protected route redirect:', error);
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  console.log('[PROTECTED ROUTE] authenticated, rendering protected children');
  try { 
    sendClientDebug('protected_route_render', { path: location.pathname }); 
  } catch (error) {
    console.warn('Failed to send debug info for protected route render:', error);
  }
  return children;
};

export default ProtectedRoute;
