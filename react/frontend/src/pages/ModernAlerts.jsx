import React, { useState, useEffect, useCallback } from 'react';
import MetricCard from '../components/modern/MetricCard';
import EmptyState from '../components/modern/EmptyState';
import { useToast } from '../components/modern/toastUtils';
import api from '../services/api';

/**
 * Modern Alerts Page - Functional alerts management interface
 * Uses CSS Grid layout and design system tokens with real data fetching
 */
const ModernAlerts = () => {
  const [alertData, setAlertData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTimeRange, setSelectedTimeRange] = useState('Last 7 Days');
  const { addToast } = useToast();
  // Fetch alert data
  const fetchAlertData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setRefreshing(true);
    
    try {
      const params = {
        time_range: selectedTimeRange,
        sites: ['S1', 'S2', 'S3', 'S4']
      };
      
      const response = await api.get('/alerts/data', { params });
      const data = response.data;
      
      setAlertData(data);
      
      if (!showLoading) {
        addToast({
          title: 'Alerts Refreshed',
          message: `Loaded ${data.summary_metrics?.active_count || 0} active alerts`,
          type: 'success',
          duration: 3000
        });
      }
      
    } catch (error) {
      console.error('Error fetching alert data:', error);
      addToast({
        title: 'Error Loading Alerts',
        message: 'Failed to load alert data. Please try again.',
        type: 'error',
        actions: [{
          text: 'Retry',
          action: () => fetchAlertData(true)
        }]
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedTimeRange, addToast]);
  
  // Handle alert acknowledgment
  const handleAcknowledgeAlert = async (alertId) => {
    try {
      await api.post('/alerts/acknowledge', {
        alert_id: alertId,
        acknowledged_by: 'Current User' // This would come from auth context
      });
      
      addToast({
        title: 'Alert Acknowledged',
        message: 'Alert has been acknowledged successfully',
        type: 'success'
      });
      
      // Refresh data
      fetchAlertData(false);
      
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      addToast({
        title: 'Error',
        message: 'Failed to acknowledge alert',
        type: 'error'
      });
    }
  };
  
  // Handle alert resolution
  const handleResolveAlert = async (alertId, resolutionNote = '') => {
    try {
      await api.post('/alerts/resolve', {
        alert_id: alertId,
        resolved_by: 'Current User', // This would come from auth context
        resolution_note: resolutionNote
      });
      
      addToast({
        title: 'Alert Resolved',
        message: 'Alert has been resolved successfully',
        type: 'success'
      });
      
      // Refresh data
      fetchAlertData(false);
      
    } catch (error) {
      console.error('Error resolving alert:', error);
      addToast({
        title: 'Error',
        message: 'Failed to resolve alert',
        type: 'error'
      });
    }
  };
  
  // Initial data load
  useEffect(() => {
    fetchAlertData(true);
  }, [fetchAlertData]);
  
  // Get metric values from data
  const metrics = alertData?.summary_metrics || {};
  const activeAlerts = alertData?.active_alerts || [];
  
  return (
    <div className="modern-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">System Alerts</h1>
          <p className="dashboard-subtitle">
            Monitor and manage water quality alerts across all monitoring sites
          </p>
        </div>
        <div className="chart-controls">
          <select 
            className="form-select me-2"
            value={selectedTimeRange} 
            onChange={(e) => setSelectedTimeRange(e.target.value)}
            disabled={loading || refreshing}
          >
            <option value="Last 24 Hours">Last 24 Hours</option>
            <option value="Last 7 Days">Last 7 Days</option>
            <option value="Last 30 Days">Last 30 Days</option>
            <option value="Last 90 Days">Last 90 Days</option>
          </select>
          <button 
            className="btn btn-outline-secondary shadow-interactive transition-all me-2"
            onClick={() => fetchAlertData(false)}
            disabled={loading || refreshing}
          >
            <i className={`bi bi-arrow-clockwise${refreshing ? ' spin' : ''}`} style={{ marginRight: '8px' }}></i>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button 
            className="btn btn-primary shadow-interactive transition-all"
            onClick={() => addToast({ title: 'Feature Coming Soon', message: 'Alert rule configuration will be available soon', type: 'info' })}
          >
            <i className="bi bi-plus-circle" style={{ marginRight: '8px' }}></i>
            New Alert Rule
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Loading State */}
        {loading && (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading alerts...</span>
            </div>
            <p className="mt-2 text-muted">Loading alert data...</p>
          </div>
        )}
        
        {/* Alert Summary */}
        {!loading && (
          <div className="metrics-grid">
            <MetricCard
              title="Active Alerts"
              value={metrics.active_count?.toString() || '0'}
              icon="exclamation-triangle"
              status={metrics.active_count > 0 ? (metrics.critical_count > 0 ? 'critical' : 'warning') : 'excellent'}
              context={metrics.active_count > 0 ? `${metrics.active_count} alerts active` : 'All systems normal'}
            />
            <MetricCard
              title="Critical Issues"
              value={metrics.critical_count?.toString() || '0'}
              icon="x-circle"
              status={metrics.critical_count > 0 ? 'critical' : 'excellent'}
              context={metrics.critical_count > 0 ? 'Requires immediate attention' : 'No critical alerts'}
            />
            <MetricCard
              title="Warning Level"
              value={metrics.warning_count?.toString() || '0'}
              icon="exclamation"
              status={metrics.warning_count > 0 ? 'warning' : 'excellent'}
              context={metrics.warning_count > 0 ? 'Monitor closely' : 'No warnings'}
            />
            <MetricCard
              title="Resolved Today"
              value={metrics.resolved_today?.toString() || '0'}
              icon="check-circle"
              status="good"
              context="Issues resolved"
            />
          </div>
        )}

        {/* Alert Status Card */}
        {!loading && (
          <div className="chart-container">
            <div className="chart-header">
              <h3 className="chart-title">
                <i className={`bi ${activeAlerts.length > 0 ? 'bi-exclamation-triangle' : 'bi-shield-check'}`} 
                   style={{ 
                     marginRight: '12px', 
                     color: activeAlerts.length > 0 ? 
                       (metrics.critical_count > 0 ? 'var(--status-critical)' : 'var(--status-warning)') : 
                       'var(--status-excellent)' 
                   }}></i>
                {activeAlerts.length > 0 ? 'Active Alerts' : 'System Status'}
              </h3>
              <div className={`status-indicator ${activeAlerts.length > 0 ? 
                (metrics.critical_count > 0 ? 'critical' : 'warning') : 'excellent'}`}>
                <i className={`bi ${activeAlerts.length > 0 ? 
                  (metrics.critical_count > 0 ? 'bi-x-circle' : 'bi-exclamation-triangle') : 'bi-check-circle'}`}></i>
                {activeAlerts.length > 0 ? `${activeAlerts.length} Active Alert${activeAlerts.length > 1 ? 's' : ''}` : 'All Systems Operational'}
              </div>
            </div>
            
            {activeAlerts.length === 0 ? (
              <EmptyState
                type="no-data"
                title="No Active Alerts"
                description="All monitoring systems are operating normally. Water quality parameters are within acceptable ranges across all sites."
                illustration={<i className="bi bi-shield-check status-excellent"></i>}
                actions={[
                  {
                    text: 'Refresh Data',
                    variant: 'outline-primary',
                    action: () => fetchAlertData(false)
                  },
                  {
                    text: 'Configure Thresholds',
                    variant: 'primary', 
                    action: () => addToast({ title: 'Feature Coming Soon', message: 'Alert configuration coming soon', type: 'info' })
                  }
                ]}
              />
            ) : (
              <div className="alert-list">
                {activeAlerts.map((alert, index) => (
                  <div key={alert.id || index} className={`alert-item severity-${alert.severity}`}>
                    <div className="alert-icon">
                      <i className={`bi ${
                        alert.severity === 'critical' ? 'bi-x-circle-fill' :
                        alert.severity === 'high' ? 'bi-exclamation-triangle-fill' :
                        alert.severity === 'medium' ? 'bi-exclamation-circle-fill' :
                        'bi-info-circle-fill'
                      }`}></i>
                    </div>
                    <div className="alert-content">
                      <div className="alert-header">
                        <h4 className="alert-title">{alert.title}</h4>
                        <span className={`alert-badge severity-${alert.severity}`}>
                          {alert.severity.toUpperCase()}
                        </span>
                      </div>
                      <p className="alert-message">{alert.message}</p>
                      <div className="alert-meta">
                        <span className="alert-site">
                          <i className="bi bi-geo-alt"></i>
                          Site {alert.site_code}
                        </span>
                        <span className="alert-time">
                          <i className="bi bi-clock"></i>
                          {new Date(alert.created_at).toLocaleString()}
                        </span>
                        {alert.parameter && (
                          <span className="alert-parameter">
                            <i className="bi bi-speedometer2"></i>
                            {alert.parameter}: {alert.value}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="alert-actions">
                      {alert.status === 'active' && (
                        <>
                          <button 
                            className="btn btn-outline-warning btn-sm me-2"
                            onClick={() => handleAcknowledgeAlert(alert.id)}
                            title="Acknowledge Alert"
                          >
                            <i className="bi bi-check"></i>
                            Acknowledge
                          </button>
                          <button 
                            className="btn btn-outline-success btn-sm"
                            onClick={() => handleResolveAlert(alert.id)}
                            title="Resolve Alert"
                          >
                            <i className="bi bi-check-circle"></i>
                            Resolve
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Alert Configuration Section */}
        {!loading && (
          <div className="alert-config-section">
            <h2 className="section-title">
              <i className="bi bi-gear" style={{ marginRight: '12px' }}></i>
              Alert Configuration
            </h2>
            <div className="alert-config-grid">
              <div className="config-card">
                <div className="config-icon temperature">
                  <i className="bi bi-thermometer-half"></i>
                </div>
                <h4>Temperature Alerts</h4>
                <p className="text-secondary">Monitor temperature thresholds (0-35°C)</p>
                <div className="config-status enabled">
                  <i className="bi bi-check-circle"></i>
                  <span>Enabled</span>
                </div>
              </div>
              
              <div className="config-card">
                <div className="config-icon conductivity">
                  <i className="bi bi-lightning"></i>
                </div>
                <h4>Conductivity Alerts</h4>
                <p className="text-secondary">Monitor conductivity levels (max 2000 μS/cm)</p>
                <div className="config-status enabled">
                  <i className="bi bi-check-circle"></i>
                  <span>Enabled</span>
                </div>
              </div>
              
              <div className="config-card">
                <div className="config-icon water-level">
                  <i className="bi bi-water"></i>
                </div>
                <h4>Water Level Alerts</h4>
                <p className="text-secondary">Monitor depth to water (0.5-10m)</p>
                <div className="config-status enabled">
                  <i className="bi bi-check-circle"></i>
                  <span>Enabled</span>
                </div>
              </div>
              
              <div className="config-card">
                {/* pH Alerts removed */}
                <div className="config-status enabled">
                  <i className="bi bi-check-circle"></i>
                  <span>Enabled</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Component Styles */}
      <style jsx>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .alert-list {
          space-y: 1rem;
        }
        
        .alert-item {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1.5rem;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--card-background);
          margin-bottom: 1rem;
          transition: all 0.2s ease;
        }
        
        .alert-item:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        
        .alert-item.severity-critical {
          border-left: 4px solid var(--status-critical);
        }
        
        .alert-item.severity-high {
          border-left: 4px solid var(--status-warning);
        }
        
        .alert-item.severity-medium {
          border-left: 4px solid var(--status-medium);
        }
        
        .alert-item.severity-low {
          border-left: 4px solid var(--status-good);
        }
        
        .alert-icon {
          font-size: 1.5rem;
          margin-top: 0.25rem;
        }
        
        .severity-critical .alert-icon {
          color: var(--status-critical);
        }
        
        .severity-high .alert-icon {
          color: var(--status-warning);
        }
        
        .severity-medium .alert-icon {
          color: var(--status-medium);
        }
        
        .severity-low .alert-icon {
          color: var(--status-good);
        }
        
        .alert-content {
          flex: 1;
        }
        
        .alert-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }
        
        .alert-title {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 600;
        }
        
        .alert-badge {
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }
        
        .alert-badge.severity-critical {
          background: var(--status-critical-bg);
          color: var(--status-critical);
        }
        
        .alert-badge.severity-high {
          background: var(--status-warning-bg);
          color: var(--status-warning);
        }
        
        .alert-badge.severity-medium {
          background: var(--status-medium-bg);
          color: var(--status-medium);
        }
        
        .alert-badge.severity-low {
          background: var(--status-good-bg);
          color: var(--status-good);
        }
        
        .alert-message {
          color: var(--text-secondary);
          margin-bottom: 1rem;
        }
        
        .alert-meta {
          display: flex;
          gap: 1rem;
          color: var(--text-muted);
          font-size: 0.875rem;
        }
        
        .alert-meta span {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        
        .alert-actions {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-left: auto;
        }
        
        .config-card {
          position: relative;
        }
        
        .config-icon.ph {
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
        }
      `}</style>
    </div>
  );
};

export default ModernAlerts;
