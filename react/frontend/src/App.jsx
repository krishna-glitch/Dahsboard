import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/query-persist-client-core';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/authUtils';
import { ErrorBoundary, ProtectedRoute } from './components';
// ToastProvider replaced with react-hot-toast Toaster in main.jsx
const ModernHome = React.lazy(() => import('./pages/ModernHome'));
const ModernAbout = React.lazy(() => import('./pages/ModernAbout'));
const ModernWaterQuality = React.lazy(() => import('./pages/ModernWaterQuality'));
const ModernAlerts = React.lazy(() => import('./pages/ModernAlerts'));
const ModernReports = React.lazy(() => import('./pages/ModernReports'));
const ModernSiteComparison = React.lazy(() => import('./pages/ModernSiteComparison'));
const ModernRedoxAnalysis = React.lazy(() => import('./pages/ModernRedoxAnalysis'));
const ModernUpload = React.lazy(() => import('./pages/ModernUpload'));
const ModernPerformanceDashboard = React.lazy(() => import('./pages/EnhancedPerformanceDashboard'));
const ModernSystemHealth = React.lazy(() => import('./pages/ModernSystemHealth'));
const ModernAdmin = React.lazy(() => import('./pages/ModernAdmin'));
const ModernIntroduction = React.lazy(() => import('./pages/ModernIntroduction'));
const ModernDataDiagnostics = React.lazy(() => import('./pages/ModernDataDiagnostics'));
const ModernDataQuality = React.lazy(() => import('./pages/ModernDataQuality'));
const ModernSettings = React.lazy(() => import('./pages/ModernSettings'));
const Login = React.lazy(() => import('./pages/Login'));
const Support = React.lazy(() => import('./pages/Support'));



// Navigation component using the auth context
const Navigation = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const [showPagesDropdown, setShowPagesDropdown] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  // Normalize profile display and avoid duplicate name/role appearance
  const usernameText = String(user?.username || 'User');
  const roleText = String(user?.role || '');
  const showRoleBadge = !!roleText && roleText.toLowerCase() !== usernameText.toLowerCase();
  const prettyRole = roleText ? roleText.charAt(0).toUpperCase() + roleText.slice(1) : '';
  const location = useLocation();

  // Dynamic page titles based on current route
  const getPageTitle = useCallback(() => {
    switch (location.pathname) {
      case '/water-quality-enhanced':
        return 'Water Quality Dashboard';
      case '/site-comparison-enhanced':
        return 'Site Comparison Dashboard';
      case '/redox-analysis-enhanced':
        return 'Redox Analysis Dashboard';
      case '/about':
        return 'About - Environmental Monitoring Dashboard';
      default:
        return 'Environmental Monitoring Dashboard';
    }
  }, [location.pathname]); // Dependency for useCallback

  // Update document title when route changes
  useEffect(() => {
    document.title = getPageTitle();
  }, [location.pathname, getPageTitle]); // Added getPageTitle to dependency array

  const handleDropdownToggle = () => {
    setShowPagesDropdown(prev => !prev);
  };

  // Lightweight route prefetch on hover (no data fetched)
  const prefetchWaterQuality = () => { try { import('./pages/ModernWaterQuality'); } catch { /* prefetch failed, this is fine */ } };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.dropdown-container')) {
        setShowPagesDropdown(false);
      }
      if (!event.target.closest('.user-menu-container')) {
        setShowUserMenu(false);
      }
    };

    if (showPagesDropdown || showUserMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showPagesDropdown, showUserMenu]);

  return (
    <nav className="glass-navbar">
        <a href="/" className="logo">{getPageTitle()}</a>
        {/* Global search removed to reduce confusion */}
        <ul className="nav-links">
            <li><a href="/">Home</a></li>
            <li><a href="/about">About</a></li>
            <li className="dropdown-container">
              <div
                className={`nav-dropdown-trigger ${showPagesDropdown ? 'active' : ''}`}
                onClick={handleDropdownToggle}
              >
                Pages <i className={`bi bi-chevron-${showPagesDropdown ? 'up' : 'down'}`}></i>
              </div>
              {showPagesDropdown && (
                <div 
                  className="nav-dropdown-menu"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="dropdown-arrow"></div>
                  <Link 
                    to="/water-quality-enhanced" 
                    onMouseEnter={prefetchWaterQuality}
                    onClick={() => setShowPagesDropdown(false)}
                    className="nav-dropdown-item"
                  >
                    Water Quality
                  </Link>
                  <Link 
                    to="/site-comparison-enhanced" 
                    onClick={() => setShowPagesDropdown(false)}
                    className="nav-dropdown-item"
                  >
                    Site Comparison
                  </Link>
                  <Link 
                    to="/redox-analysis-enhanced" 
                    onClick={() => setShowPagesDropdown(false)}
                    className="nav-dropdown-item"
                  >
                    Redox Analysis
                  </Link>
                </div>
              )}
            </li>
        </ul>
        <div className="nav-cta">
          {isAuthenticated ? (
            <>
              <div className="user-menu-container" style={{ position: 'relative', minWidth: 160, minHeight: 40 }}>
                <div className="modern-user-chip" role="button" aria-haspopup="menu" aria-expanded={showUserMenu}
                  onClick={() => setShowUserMenu(prev => !prev)}
                  title="Account menu">
                  <div className={`modern-user-avatar ${String(user?.role || '').toLowerCase()}`} aria-hidden="true">
                    {user?.avatarUrl ? (
                      <img src={user.avatarUrl} alt="User avatar" />
                    ) : (
                      <div className="avatar-icon">
                        <i className="bi bi-person-fill"></i>
                      </div>
                    )}
                  </div>
                  <div className="modern-user-meta">
                    <div className="modern-user-name">{usernameText}</div>
                    {showRoleBadge && (
                      <div className="modern-role-badge">{prettyRole}</div>
                    )}
                  </div>
                  <div className="dropdown-arrow-icon">
                    <i className={`bi bi-chevron-${showUserMenu ? 'up' : 'down'}`}></i>
                  </div>
                </div>
                {showUserMenu && (
                  <div className="modern-nav-dropdown" role="menu">
                    <div className="dropdown-header">
                      <div className="user-info">
                        <div className="user-email">{usernameText}</div>
                        {showRoleBadge && (
                          <div className="user-role-chip">{prettyRole}</div>
                        )}
                      </div>
                    </div>
                    <div className="dropdown-divider"></div>
                    <div className="dropdown-section">
                      <button
                        className="modern-dropdown-item"
                        onClick={() => { 
                          setShowUserMenu(false); 
                          navigate('/settings');
                        }}
                        role="menuitem"
                      >
                        <div className="item-icon">
                          <i className="bi bi-gear-fill"></i>
                        </div>
                        <div className="item-content">
                          <div className="item-title">Settings</div>
                          <div className="item-desc">Manage your preferences</div>
                        </div>
                      </button>
                      <button
                        className="modern-dropdown-item"
                        onClick={() => { setShowUserMenu(false); }}
                        role="menuitem"
                      >
                        <div className="item-icon">
                          <i className="bi bi-question-circle-fill"></i>
                        </div>
                        <div className="item-content">
                          <div className="item-title">Help & Support</div>
                          <div className="item-desc">Get assistance</div>
                        </div>
                      </button>
                    </div>
                    <div className="dropdown-divider"></div>
                    <div className="dropdown-section">
                      <button className="modern-dropdown-item danger" onClick={logout} role="menuitem">
                        <div className="item-icon">
                          <i className="bi bi-box-arrow-right"></i>
                        </div>
                        <div className="item-content">
                          <div className="item-title">Sign Out</div>
                          <div className="item-desc">End your session</div>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <span className="welcome-text">Not logged in</span>
          )}
        </div>
    </nav>
  );
};

function AppContent() {
  const location = useLocation();
  const showNavigation = location.pathname !== '/login';

  return (
    <div className="App">
      {showNavigation && <Navigation />}
      <div className="page-content">
        <ErrorBoundary>
          <Suspense fallback={<div style={{ padding: 16 }}>Loading...</div>}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/support" element={<Support />} />
              <Route path="/" element={<ProtectedRoute><ModernHome /></ProtectedRoute>} />
              <Route path="/about" element={<ModernAbout />} />
              <Route path="/water-quality-enhanced" element={<ProtectedRoute><ModernWaterQuality /></ProtectedRoute>} />
              <Route path="/optimized-water-quality" element={<ProtectedRoute><ModernWaterQuality /></ProtectedRoute>} />
              <Route path="/alerts" element={<ProtectedRoute><ModernAlerts /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><ModernReports /></ProtectedRoute>} />
              <Route path="/site-comparison-enhanced" element={<ProtectedRoute><ModernSiteComparison /></ProtectedRoute>} />
              <Route path="/redox-analysis-enhanced" element={<ProtectedRoute><ModernRedoxAnalysis /></ProtectedRoute>} />
              <Route path="/upload" element={<ProtectedRoute><ModernUpload /></ProtectedRoute>} />
              <Route path="/performance" element={<ProtectedRoute><ModernPerformanceDashboard /></ProtectedRoute>} />
              <Route path="/system-health" element={<ProtectedRoute><ModernSystemHealth /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><ModernAdmin /></ProtectedRoute>} />
              <Route path="/introduction" element={<ModernIntroduction />} />
              <Route path="/data-diagnostics" element={<ProtectedRoute><ModernDataDiagnostics /></ProtectedRoute>} />
              <Route path="/data-quality" element={<ProtectedRoute><ModernDataQuality /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><ModernSettings /></ProtectedRoute>} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}

// Create QueryClient instance with optimized settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Increase TTLs so month slices persist longer in memory
      staleTime: 15 * 60 * 1000, // 15 minutes
      gcTime: 60 * 60 * 1000, // 60 minutes
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: true,
    },
  },
});

// Persist React Query cache across reloads using sessionStorage
if (typeof window !== 'undefined' && window.sessionStorage) {
  const persister = createSyncStoragePersister({ storage: window.sessionStorage });
  // Max age aligns with server-side TTL for processed endpoints (12h)
  persistQueryClient({
    queryClient,
    persister,
    maxAge: 12 * 60 * 60 * 1000,
    buster: 'rq-cache-v1',
  });
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
