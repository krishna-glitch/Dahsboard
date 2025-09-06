import React from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useToast } from '../modern/toastUtils';
import '../../styles/sidebar.css';

/**
 * Enhanced Dashboard Sidebar Component
 * Flexible, responsive sidebar with proper functionality and customization
 */
export const DashboardSidebar = ({ 
  children, 
  className = '',
  quickActions = null,
  systemStatus = null,
  onGenerateReport,
  onEmailSummary,
  onSettings,
  showDefaultActions = true
}) => {
  const navigate = useNavigate();
  const toast = useToast();

  // Default action handlers
  const handleGenerateReport = () => {
    if (onGenerateReport) {
      onGenerateReport();
    } else {
      // Default behavior - navigate to reports page
      navigate('/reports');
    }
  };

  const handleEmailSummary = () => {
    if (onEmailSummary) {
      onEmailSummary();
    } else {
      // Default behavior - show coming soon message with toast
      toast.showInfo('Email Summary feature coming soon!', {
        title: 'Feature Coming Soon',
        duration: 3000,
        dedupeKey: 'email-summary-coming-soon'
      });
    }
  };

  const handleSettings = () => {
    if (onSettings) {
      onSettings();
    } else {
      // Default behavior - navigate to settings or show placeholder
      console.log('Settings clicked - add settings navigation');
    }
  };

  // Default quick actions if not provided
  const defaultQuickActions = [
    {
      id: 'generate-report',
      label: 'Generate Report',
      icon: '📊',
      onClick: handleGenerateReport
    },
    {
      id: 'email-summary',
      label: 'Email Summary',
      icon: '📧',
      onClick: handleEmailSummary
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: '⚙️',
      onClick: handleSettings
    }
  ];

  // Default system status if not provided
  const defaultSystemStatus = [
    { id: 'data-feed', label: 'Data Feed', status: 'online', text: 'Online' },
    { id: 'api', label: 'API', status: 'online', text: 'Active' },
    { id: 'alerts', label: 'Alerts', status: 'warning', text: '2 Pending' }
  ];

  const actionsToShow = quickActions || (showDefaultActions ? defaultQuickActions : []);
  const statusToShow = systemStatus || defaultSystemStatus;

  return (
    <aside className={`sidebar-container ${className}`} role="complementary">
      <div className="sidebar-content">
        {children || (
          <div className="default-sidebar">
            {actionsToShow.length > 0 && (
              <div className="sidebar-section">
                <h3 className="sidebar-title">Quick Actions</h3>
                <div className="sidebar-actions">
                  {actionsToShow.map((action) => (
                    <button
                      key={action.id}
                      className="sidebar-action-btn"
                      onClick={action.onClick}
                      disabled={action.disabled}
                      title={action.tooltip}
                    >
                      <span className="action-icon">{action.icon}</span>
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {statusToShow.length > 0 && (
              <div className="sidebar-section">
                <h3 className="sidebar-title">System Status</h3>
                <div className="status-indicators">
                  {statusToShow.map((status) => (
                    <div key={status.id} className="status-item">
                      <span className={`status-dot status-${status.status}`}></span>
                      <span className="status-text">{status.label}: {status.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

DashboardSidebar.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
  quickActions: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    icon: PropTypes.string,
    onClick: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
    tooltip: PropTypes.string
  })),
  systemStatus: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    status: PropTypes.oneOf(['online', 'offline', 'warning', 'error']).isRequired,
    text: PropTypes.string.isRequired
  })),
  onGenerateReport: PropTypes.func,
  onEmailSummary: PropTypes.func,
  onSettings: PropTypes.func,
  showDefaultActions: PropTypes.bool
};

export default DashboardSidebar;
