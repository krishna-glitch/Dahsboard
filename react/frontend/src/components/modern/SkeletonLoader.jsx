import React from 'react';

/**
 * Skeleton Loader Component - Content-aware loading states
 * Provides contextual loading skeletons that match actual content structure
 */
const SkeletonLoader = ({ 
  type = 'default',
  count = 1,
  className = '',
  height = 'auto',
  width = '100%',
  animated = true,
  children
}) => {
  
  const getSkeletonContent = () => {
    switch (type) {
      case 'metric-card':
        return (
          <div className="skeleton-metric-card">
            <div className="skeleton-metric-header">
              <div className="skeleton-line" style={{ width: '60%', height: '16px' }}></div>
              <div className="skeleton-circle" style={{ width: '24px', height: '24px' }}></div>
            </div>
            <div className="skeleton-metric-value">
              <div className="skeleton-line" style={{ width: '40%', height: '32px' }}></div>
            </div>
            <div className="skeleton-metric-context">
              <div className="skeleton-line" style={{ width: '80%', height: '12px' }}></div>
            </div>
          </div>
        );

      case 'table-row':
        return (
          <div className="skeleton-table-row">
            <div className="skeleton-cell" style={{ width: '20%' }}>
              <div className="skeleton-line" style={{ height: '14px' }}></div>
            </div>
            <div className="skeleton-cell" style={{ width: '25%' }}>
              <div className="skeleton-line" style={{ height: '14px' }}></div>
            </div>
            <div className="skeleton-cell" style={{ width: '15%' }}>
              <div className="skeleton-circle" style={{ width: '60px', height: '20px', borderRadius: '10px' }}></div>
            </div>
            <div className="skeleton-cell" style={{ width: '20%' }}>
              <div className="skeleton-line" style={{ height: '14px' }}></div>
            </div>
            <div className="skeleton-cell" style={{ width: '20%' }}>
              <div className="skeleton-line" style={{ height: '14px' }}></div>
            </div>
          </div>
        );

      case 'chart':
        return (
          <div className="skeleton-chart">
            <div className="skeleton-chart-header">
              <div className="skeleton-line" style={{ width: '30%', height: '18px' }}></div>
              <div className="skeleton-chart-controls">
                <div className="skeleton-circle" style={{ width: '60px', height: '24px', borderRadius: '12px' }}></div>
                <div className="skeleton-circle" style={{ width: '60px', height: '24px', borderRadius: '12px' }}></div>
                <div className="skeleton-circle" style={{ width: '80px', height: '24px', borderRadius: '12px' }}></div>
              </div>
            </div>
            <div className="skeleton-chart-body">
              <div className="skeleton-chart-bars">
                {[...Array(8)].map((_, i) => (
                  <div 
                    key={i} 
                    className="skeleton-bar" 
                    style={{ 
                      height: `${Math.random() * 60 + 20}%`,
                      animationDelay: `${i * 0.1}s`
                    }}
                  ></div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'site-card':
        return (
          <div className="skeleton-site-card">
            <div className="skeleton-site-header">
              <div className="skeleton-circle" style={{ width: '50px', height: '50px' }}></div>
              <div className="skeleton-site-info">
                <div className="skeleton-line" style={{ width: '70%', height: '16px', marginBottom: '8px' }}></div>
                <div className="skeleton-line" style={{ width: '90%', height: '12px' }}></div>
              </div>
              <div className="skeleton-circle" style={{ width: '60px', height: '20px', borderRadius: '10px' }}></div>
            </div>
            <div className="skeleton-site-divider"></div>
            <div className="skeleton-site-metrics">
              <div className="skeleton-metric-item">
                <div className="skeleton-line" style={{ width: '50%', height: '10px' }}></div>
                <div className="skeleton-line" style={{ width: '30%', height: '12px' }}></div>
              </div>
            </div>
          </div>
        );

      case 'dashboard-header':
        return (
          <div className="skeleton-dashboard-header">
            <div className="skeleton-header-content">
              <div className="skeleton-line" style={{ width: '25%', height: '24px' }}></div>
              <div className="skeleton-line" style={{ width: '40%', height: '14px', marginTop: '8px' }}></div>
            </div>
            <div className="skeleton-header-actions">
              <div className="skeleton-circle" style={{ width: '100px', height: '32px', borderRadius: '16px' }}></div>
              <div className="skeleton-circle" style={{ width: '120px', height: '32px', borderRadius: '16px' }}></div>
            </div>
          </div>
        );

      case 'text-block':
        return (
          <div className="skeleton-text-block">
            <div className="skeleton-line" style={{ width: '100%', height: '16px', marginBottom: '8px' }}></div>
            <div className="skeleton-line" style={{ width: '85%', height: '16px', marginBottom: '8px' }}></div>
            <div className="skeleton-line" style={{ width: '92%', height: '16px', marginBottom: '8px' }}></div>
            <div className="skeleton-line" style={{ width: '78%', height: '16px' }}></div>
          </div>
        );

      case 'progress-bar':
        return (
          <div className="skeleton-progress">
            <div className="skeleton-progress-label">
              <div className="skeleton-line" style={{ width: '40%', height: '12px' }}></div>
              <div className="skeleton-line" style={{ width: '20%', height: '12px' }}></div>
            </div>
            <div className="skeleton-progress-bar">
              <div className="skeleton-progress-fill" style={{ width: '60%' }}></div>
            </div>
          </div>
        );

      case 'list-item':
        return (
          <div className="skeleton-list-item">
            <div className="skeleton-circle" style={{ width: '40px', height: '40px' }}></div>
            <div className="skeleton-list-content">
              <div className="skeleton-line" style={{ width: '60%', height: '16px', marginBottom: '6px' }}></div>
              <div className="skeleton-line" style={{ width: '80%', height: '12px' }}></div>
            </div>
            <div className="skeleton-list-action">
              <div className="skeleton-circle" style={{ width: '24px', height: '24px' }}></div>
            </div>
          </div>
        );

      default:
        return (
          <div className="skeleton-default" style={{ height, width }}>
            <div className="skeleton-line" style={{ width: '100%', height: '100%' }}></div>
          </div>
        );
    }
  };

  const skeletonItems = Array.from({ length: count }, (_, index) => (
    <div key={index} className={`skeleton-item ${animated ? 'skeleton-animated' : ''}`}>
      {getSkeletonContent()}
    </div>
  ));

  return (
    <div className={`skeleton-container ${className}`}>
      {children ? (
        <div className="skeleton-wrapper">
          {children}
          <div className="skeleton-overlay">
            {skeletonItems}
          </div>
        </div>
      ) : (
        skeletonItems
      )}
    </div>
  );
};

/**
 * Skeleton Grid - For dashboard-like layouts
 */
export const SkeletonGrid = ({ columns = 3, rows = 2, type = 'metric-card', gap = 'md' }) => {
  return (
    <div className={`skeleton-grid skeleton-grid-cols-${columns} skeleton-gap-${gap}`}>
      {Array.from({ length: columns * rows }, (_, index) => (
        <SkeletonLoader key={index} type={type} />
      ))}
    </div>
  );
};

/**
 * Skeleton Table - For data tables
 */
export const SkeletonTable = ({ rows = 5, columns = 5, hasHeader = true }) => {
  return (
    <div className="skeleton-table">
      {hasHeader && (
        <div className="skeleton-table-header">
          {Array.from({ length: columns }, (_, index) => (
            <div key={index} className="skeleton-table-th">
              <div className="skeleton-line" style={{ width: '80%', height: '14px' }}></div>
            </div>
          ))}
        </div>
      )}
      <div className="skeleton-table-body">
        {Array.from({ length: rows }, (_, index) => (
          <SkeletonLoader key={index} type="table-row" />
        ))}
      </div>
    </div>
  );
};

/**
 * Skeleton Page - Full page skeleton
 */
export const SkeletonPage = ({ type = 'dashboard' }) => {
  switch (type) {
    case 'dashboard':
      return (
        <div className="skeleton-page">
          <SkeletonLoader type="dashboard-header" />
          <div className="skeleton-page-content">
            <SkeletonGrid columns={4} rows={1} type="metric-card" />
            <div className="skeleton-section">
              <SkeletonLoader type="chart" />
            </div>
            <div className="skeleton-section">
              <SkeletonTable rows={6} columns={5} />
            </div>
          </div>
        </div>
      );
      
    case 'comparison':
      return (
        <div className="skeleton-page">
          <SkeletonLoader type="dashboard-header" />
          <div className="skeleton-page-content">
            <SkeletonGrid columns={3} rows={1} type="metric-card" />
            <SkeletonGrid columns={3} rows={2} type="site-card" />
            <div className="skeleton-section">
              <SkeletonTable rows={8} columns={5} />
            </div>
          </div>
        </div>
      );
      
    default:
      return (
        <div className="skeleton-page">
          <SkeletonLoader type="dashboard-header" />
          <div className="skeleton-page-content">
            <SkeletonLoader type="text-block" />
            <SkeletonLoader type="chart" />
            <SkeletonLoader type="text-block" />
          </div>
        </div>
      );
  }
};

export default SkeletonLoader;