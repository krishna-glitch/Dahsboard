import React from 'react';
import { useAuth } from '../../contexts/authUtils';

// RoleGate wraps a page and enforces role-based access.
// allowed: array of roles that can access (e.g., ['admin','analyst'])
// fallback: element to render when access is denied (optional)
const RoleGate = ({ allowed = [], children, fallback = null }) => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="modern-dashboard">
        <div className="main-content" style={{ padding: '2rem', color: '#6c757d' }}>
          Checking access…
        </div>
      </div>
    );
  }

  const role = user?.role || 'viewer';
  const allowedSet = new Set(allowed);
  const ok = isAuthenticated && (allowedSet.size === 0 || allowedSet.has(role));

  if (!ok) {
    return fallback || (
      <div className="modern-dashboard">
        <div className="main-content" style={{ padding: '2rem' }}>
          <div className="alert-message alert-error">
            <div className="alert-content">
              <i className="bi bi-shield-lock"></i>
              <span>Access restricted. Your role ({role}) does not permit viewing this page.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default RoleGate;

