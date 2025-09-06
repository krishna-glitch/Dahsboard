import React from 'react';
import SkeletonLoader, { SkeletonGrid, SkeletonPage } from './SkeletonLoader';

/**
 * Modern Empty State Component - Using Design System Tokens
 * Provides contextual empty states with professional styling
 */
const EmptyState = ({ 
  type = 'no-data',
  title,
  description,
  actions = [],
  illustration = null,
  context = {},
  className = ''
}) => {
  
  const getDefaultContent = () => {
    switch (type) {
      case 'no-redox-data':
        return {
          title: 'No Redox Data Available',
          description: 'We couldn\'t find any redox measurements for your current selection.',
          illustration: <i className="bi bi-flask"></i>,
          actions: [
            {
              text: 'Try Different Sites',
              variant: 'primary',
              action: () => context.onSiteChange?.(['S1', 'S2', 'S3', 'S4'])
            },
            {
              text: 'Extend Time Range',
              variant: 'secondary', 
              action: () => context.onTimeRangeChange?.('Last 1 Year')
            },
            {
              text: 'View Sample Data',
              variant: 'outline',
              action: () => context.onShowSample?.()
            }
          ]
        };
        
      case 'no-water-quality-data':
        return {
          title: 'No Water Quality Data Found',
          description: 'No measurements match your current filter settings.',
          illustration: <i className="bi bi-droplet"></i>,
          actions: [
            {
              text: 'Reset Filters',
              variant: 'primary',
              action: () => context.onResetFilters?.()
            },
            {
              text: 'Select All Sites',
              variant: 'secondary',
              action: () => context.onSelectAllSites?.()
            },
            {
              text: 'Upload Data',
              variant: 'outline',
              action: () => context.onUpload?.()
            }
          ]
        };
        
      case 'loading':
        return {
          title: 'Loading Data',
          description: 'Please wait while we fetch your data...',
          illustration: <SkeletonLoader type="progress-bar" animated />,
          actions: []
        };
        
      case 'loading-dashboard':
        return {
          title: 'Loading Dashboard',
          description: 'Setting up your dashboard...',
          illustration: <SkeletonGrid columns={3} rows={1} type="metric-card" />,
          actions: []
        };
        
      case 'loading-chart':
        return {
          title: 'Loading Chart',
          description: 'Preparing your data visualization...',
          illustration: <SkeletonLoader type="chart" animated />,
          actions: []
        };
        
      case 'loading-table':
        return {
          title: 'Loading Data',
          description: 'Fetching records...',
          illustration: <SkeletonLoader type="table-row" count={3} animated />,
          actions: []
        };
        
      case 'loading-sites':
        return {
          title: 'Loading Sites',
          description: 'Fetching monitoring site information...',
          illustration: <SkeletonGrid columns={2} rows={2} type="site-card" />,
          actions: []
        };
        
      case 'error':
        return {
          title: 'Unable to Load Data',
          description: context.errorMessage || 'Something went wrong while loading your data.',
          illustration: <i className="bi bi-exclamation-triangle status-poor"></i>,
          actions: [
            {
              text: 'Try Again',
              variant: 'primary',
              action: () => context.onRetry?.()
            },
            {
              text: 'Report Issue',
              variant: 'outline',
              action: () => context.onReportIssue?.()
            }
          ]
        };
        
      default:
        return {
          title: 'No Data Available',
          description: 'There\'s nothing to show here right now.',
          illustration: <i className="bi bi-database"></i>,
          actions: []
        };
    }
  };
  
  const content = {
    ...getDefaultContent(),
    ...(title && { title }),
    ...(description && { description }),
    ...(illustration && { illustration }),
    ...(actions.length > 0 && { actions })
  };

  return (
    <div className={`empty-state ${className} component-fade-in`}>
      {content.illustration && (
        <div className="empty-state-illustration">
          {content.illustration}
        </div>
      )}
      
      <h3 className="empty-state-title">
        {content.title}
      </h3>
      
      <p className="empty-state-description">
        {content.description}
      </p>
      
      {content.actions && content.actions.length > 0 && (
        <div className="empty-state-actions">
          {content.actions.map((action, index) => (
            <button
              key={index}
              onClick={action.action}
              disabled={action.disabled}
              className={`btn ${action.variant === 'outline' ? 'btn-outline-primary' : action.variant === 'secondary' ? 'btn-secondary' : 'btn-primary'} shadow-interactive transition-all`}
            >
              {action.text}
            </button>
          ))}
        </div>
      )}
      
      {/* Helpful Tips Section */}
      {context.tips && context.tips.length > 0 && (
        <div className="empty-state-tips surface-secondary" style={{
          marginTop: 'var(--spacing-component-lg)',
          padding: 'var(--spacing-component-md)',
          borderRadius: 'var(--radius-lg)',
          maxWidth: '500px'
        }}>
          <h4 className="typography-label text-secondary" style={{
            marginBottom: 'var(--spacing-component-sm)'
          }}>
            <i className="bi bi-lightbulb" style={{ marginRight: '8px' }}></i>
            Helpful Tips
          </h4>
          <ul className="text-tertiary" style={{
            textAlign: 'left',
            margin: 0,
            paddingLeft: '1.25rem',
            fontSize: '0.85rem'
          }}>
            {context.tips.map((tip, index) => (
              <li key={index} style={{ marginBottom: '0.25rem' }}>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// Memoize EmptyState since it's a presentational component
export default React.memo(EmptyState);