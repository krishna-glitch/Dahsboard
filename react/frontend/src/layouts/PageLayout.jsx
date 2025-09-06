import React, { Suspense, useState } from 'react';
import PropTypes from 'prop-types';
import { ErrorBoundary } from 'react-error-boundary';
// Simple loading spinner component
const LoadingSpinner = () => (
  <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '200px' }}>
    <div className="spinner-border text-primary" role="status">
      <span className="visually-hidden">Loading...</span>
    </div>
  </div>
);
// Simple error fallback component
const ErrorFallback = ({ error, resetErrorBoundary }) => (
  <div className="content-section text-center" role="alert">
    <h3>⚠️ Something went wrong</h3>
    <p className="text-danger">{error.message}</p>
    <button 
      className="btn btn-primary" 
      onClick={resetErrorBoundary}
    >
      Try again
    </button>
  </div>
);

import '../styles/layouts/page-layout.css';

/**
 * Semantic HTML5 Page Layout Wrapper
 * Integrates with existing Navigation (in App.jsx) and UnifiedFilterSidebar
 * Uses CSS Grid for modern, responsive layouts
 */
export const PageLayout = ({ 
  children, 
  // Page metadata
  pageTitle,
  pageDescription,
  
  // Layout configuration
  layoutType = 'with-sidebar', // 'with-sidebar', 'full-width', 'grid'
  
  // Sidebar configuration (uses existing UnifiedFilterSidebar)
  showSidebar = true,
  sidebarProps = {},
  
  // Grid configuration
  gridColumns = 12,
  gridGap = 'lg',
  
  // Additional props
  className = '',
  headerActions,
  footerContent
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prevState => !prevState);
  };

  // Layout class based on type
  const layoutClass = `page-layout page-layout--${layoutType}`;
  
  return (
    <div className={`${layoutClass} ${className}`}>
      
      {/* Semantic Main Content */}
      <main 
        className="page-main" 
        role="main"
        aria-label={pageTitle ? `${pageTitle} content` : 'Main content'}
        id="main-content" // For skip links
      >
        
        {/* Page Header Section */}
        {(pageTitle || pageDescription || headerActions) && (
          <header className="page-header" role="banner">
            <div className="page-header-content">
              {pageTitle && (
                <div className="page-title-section">
                  <h1 className="page-title">{pageTitle}</h1>
                  {pageDescription && (
                    <p className="page-description">{pageDescription}</p>
                  )}
                </div>
              )}
              {headerActions && (
                <div className="page-actions">
                  {headerActions}
                </div>
              )}
            </div>
          </header>
        )}

        {/* Main Content Layout */}
        <div className="page-content">
          
          {/* Conditional Sidebar Layout */}
          {showSidebar && layoutType === 'with-sidebar' && (
            <div className={`page-with-sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
              
              {/* Sidebar using existing UnifiedFilterSidebar */}
              <aside 
                className="page-sidebar" 
                role="complementary"
                aria-label="Filters and controls"
                id="page-sidebar"
              >
                <ErrorBoundary FallbackComponent={ErrorFallback}>
                  <Suspense fallback={<LoadingSpinner />}>
                    <UnifiedFilterSidebar
                      layout="sidebar"
                      title={sidebarProps.title || 'Filters'}
                      isSidebarCollapsed={isSidebarCollapsed}
                      toggleSidebar={toggleSidebar}
                      {...sidebarProps}
                    />
                  </Suspense>
                </ErrorBoundary>
              </aside>

              {/* Main Content Area */}
              <section className="page-content-area">
                <ErrorBoundary FallbackComponent={ErrorFallback}>
                  <Suspense fallback={<LoadingSpinner />}>
                    {children}
                  </Suspense>
                </ErrorBoundary>
              </section>
              
            </div>
          )}

          {/* Full Width Layout */}
          {layoutType === 'full-width' && (
            <section className="page-full-width">
              <ErrorBoundary FallbackComponent={ErrorFallback}>
                <Suspense fallback={<LoadingSpinner />}>
                  {children}
                </Suspense>
              </ErrorBoundary>
            </section>
          )}

          {/* Grid Layout */}
          {layoutType === 'grid' && (
            <section 
              className={`page-grid gap-${gridGap}`}
              style={{ gridTemplateColumns: `repeat(${gridColumns}, 1fr)` }}
            >
              <ErrorBoundary FallbackComponent={ErrorFallback}>
                <Suspense fallback={<LoadingSpinner />}>
                  {children}
                </Suspense>
              </ErrorBoundary>
            </section>
          )}
          
        </div>

        {/* Page Footer */}
        {footerContent && (
          <footer className="page-footer" role="contentinfo">
            {footerContent}
          </footer>
        )}
        
      </main>
    </div>
  );
};

PageLayout.propTypes = {
  children: PropTypes.node.isRequired,
  pageTitle: PropTypes.string,
  pageDescription: PropTypes.string,
  layoutType: PropTypes.oneOf(['with-sidebar', 'full-width', 'grid']),
  showSidebar: PropTypes.bool,
  sidebarProps: PropTypes.object,
  gridColumns: PropTypes.number,
  gridGap: PropTypes.oneOf(['xs', 'sm', 'md', 'lg', 'xl']),
  className: PropTypes.string,
  headerActions: PropTypes.node,
  footerContent: PropTypes.node
};

export default PageLayout;