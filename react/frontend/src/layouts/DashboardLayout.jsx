import React, { Suspense } from 'react';
import PropTypes from 'prop-types';
import { ErrorBoundary } from 'react-error-boundary';
import { DashboardHeader } from '../components/layout/DashboardHeader';
import { DashboardSidebar } from '../components/layout/DashboardSidebar';
import { DashboardFooter } from '../components/layout/DashboardFooter';
// Simple loading spinner component
const LoadingSpinner = () => (
  <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '200px' }}>
    <div className="spinner-border text-primary" role="status">
      <span className="visually-hidden">Loading...</span>
    </div>
  </div>
);
import { ErrorFallback } from '../components/common/ErrorFallback';
import '../styles/layouts/dashboard-layout.css';

/**
 * Main Dashboard Layout Component
 * Provides semantic structure and consistent layout for all dashboard pages
 */
export const DashboardLayout = ({ 
  children, 
  pageTitle,
  pageDescription,
  showSidebar = true,
  sidebarContent,
  headerActions,
  className = ''
}) => {
  return (
    <div className={`dashboard-layout ${className}`}>
      {/* Semantic Header */}
      <header className="dashboard-header" role="banner">
        <DashboardHeader 
          title={pageTitle}
          description={pageDescription}
          actions={headerActions}
        />
      </header>

      {/* Main Content Area */}
      <div className="dashboard-body">
        {/* Conditional Sidebar */}
        {showSidebar && (
          <aside 
            className="dashboard-aside" 
            role="complementary"
            aria-label="Dashboard filters and controls"
          >
            <ErrorBoundary FallbackComponent={ErrorFallback}>
              <Suspense fallback={<LoadingSpinner />}>
                {sidebarContent || <DashboardSidebar />}
              </Suspense>
            </ErrorBoundary>
          </aside>
        )}

        {/* Main Content */}
        <main 
          className="dashboard-main" 
          role="main"
          aria-label="Dashboard content"
        >
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<LoadingSpinner />}>
              {children}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      {/* Semantic Footer */}
      <footer className="dashboard-footer" role="contentinfo">
        <DashboardFooter />
      </footer>
    </div>
  );
};

DashboardLayout.propTypes = {
  children: PropTypes.node.isRequired,
  pageTitle: PropTypes.string,
  pageDescription: PropTypes.string,
  showSidebar: PropTypes.bool,
  sidebarContent: PropTypes.node,
  headerActions: PropTypes.node,
  className: PropTypes.string
};

export default DashboardLayout;