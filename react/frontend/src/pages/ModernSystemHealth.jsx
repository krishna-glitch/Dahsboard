import React, { useEffect, useState } from 'react';
import RoleGate from '../components/auth/RoleGate';
import Plot from 'react-plotly.js';
import MetricCard from '../components/modern/MetricCard';
import EmptyState from '../components/modern/EmptyState';
import ExportButton from '../components/ExportButton';
import { getSystemHealthSummary, getDataVolume } from '../services/api';

/**
 * Modern System Health Page - System Status and Health Monitoring
 * Uses design system tokens and modern layout patterns
 */

const ModernSystemHealth = () => {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [volumeData, setVolumeData] = useState(null);
  const [monthsWindow, setMonthsWindow] = useState(36); // 12 | 24 | 36

  const fetchHealthData = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [summary, volume] = await Promise.all([
        getSystemHealthSummary(),
        getDataVolume()
      ]);
      setHealthData(summary);
      setVolumeData(volume);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealthData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchHealthData(true);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    fetchHealthData(true);
  };

  if (loading) {
    return (
      <div className="modern-dashboard">
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">System Health</h1>
            <p className="dashboard-subtitle">Real-time system status and health monitoring</p>
          </div>
        </div>
        <div className="main-content">
          <EmptyState
            type="loading"
            title="Loading System Health"
            description="Fetching system status and health metrics..."
          />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modern-dashboard">
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">System Health</h1>
            <p className="dashboard-subtitle">Real-time system status and health monitoring</p>
          </div>
          <div className="dashboard-actions">
            <button 
              onClick={handleRefresh}
              className="btn btn-primary shadow-interactive"
            >
              <i className="bi bi-arrow-repeat" style={{ marginRight: '8px' }}></i>
              Retry
            </button>
          </div>
        </div>
        <div className="main-content">
          <EmptyState
            type="error"
            title="Failed to Load System Health"
            description={error}
            illustration={<i className="bi bi-heart-pulse"></i>}
          />
        </div>
      </div>
    );
  }

  const {
    status = 'unknown',
    health_score = 0,
    available_services = 0,
    total_services = 0,
    failed_imports = 0,
    uptime_hours = 0,
    memory_usage_percent = 0,
    disk_usage_percent = 0,
    cpu_usage_percent = 0,
    active_connections = 0,
    response_time_ms = 0
  } = healthData || {};

  // Calculate overall system status
  const getOverallStatus = () => {
    if (health_score >= 90) return 'excellent';
    if (health_score >= 70) return 'good';
    if (health_score >= 50) return 'warning';
    return 'poor';
  };

  const getServiceStatus = () => {
    const serviceRatio = total_services > 0 ? available_services / total_services : 0;
    if (serviceRatio >= 0.95) return 'excellent';
    if (serviceRatio >= 0.8) return 'good';
    if (serviceRatio >= 0.6) return 'warning';
    return 'poor';
  };

  const getResourceStatus = (usage) => {
    if (usage >= 90) return 'poor';
    if (usage >= 70) return 'warning';
    if (usage >= 50) return 'good';
    return 'excellent';
  };

  // Mock system components for detailed monitoring
  const systemComponents = [
    {
      name: 'Database Connection',
      status: available_services > 0 ? 'healthy' : 'unhealthy',
      description: 'Primary database connectivity and query performance',
      details: { 'Connection Pool': '8/10', 'Avg Query Time': `${response_time_ms}ms` }
    },
    {
      name: 'Cache System',
      status: 'healthy',
      description: 'Redis cache system for improved performance',
      details: { 'Memory Usage': '64MB', 'Hit Rate': '94.5%' }
    },
    {
      name: 'Background Services',
      status: failed_imports === 0 ? 'healthy' : 'unhealthy',
      description: 'Background job processing and scheduled tasks',
      details: { 'Active Jobs': '3', 'Failed Jobs': failed_imports.toString() }
    },
    {
      name: 'API Gateway',
      status: 'healthy',
      description: 'External API connectivity and routing',
      details: { 'Active Connections': active_connections.toString(), 'Response Time': `${response_time_ms}ms` }
    },
    {
      name: 'File System',
      status: disk_usage_percent < 90 ? 'healthy' : 'warning',
      description: 'Storage system and file access',
      details: { 'Disk Usage': `${disk_usage_percent}%`, 'Available Space': `${100 - disk_usage_percent}%` }
    },
    {
      name: 'Monitoring System',
      status: 'healthy',
      description: 'System monitoring and alerting services',
      details: { 'Uptime': `${Math.floor(uptime_hours)}h`, 'Alerts': '0' }
    }
  ];

  const healthTips = [
    {
      icon: 'shield-check',
      title: 'Proactive Monitoring',
      description: 'System health is monitored continuously with automatic alerts for critical issues.'
    },
    {
      icon: 'arrow-repeat',
      title: 'Auto Recovery',
      description: 'Failed services are automatically restarted and connection pools are refreshed.'
    },
    {
      icon: 'graph-up-arrow',
      title: 'Performance Optimization',
      description: 'Resource usage is optimized based on current system load and usage patterns.'
    }
  ];

  const content = (
    <div className="modern-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">System Health</h1>
          <p className="dashboard-subtitle">
            Real-time system status and health monitoring
          </p>
        </div>
        <div className="dashboard-actions">
          <button 
            onClick={handleRefresh}
            disabled={refreshing}
            className={`btn ${refreshing ? 'btn-outline-secondary' : 'btn-primary'} shadow-interactive`}
          >
            {refreshing ? (
              <>
                <i className="bi bi-arrow-repeat spin" style={{ marginRight: '8px' }}></i>
                Refreshing...
              </>
            ) : (
              <>
                <i className="bi bi-arrow-repeat" style={{ marginRight: '8px' }}></i>
                Refresh Status
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Overall System Status */}
        <div className="system-status-overview">
          <div className={`system-status-card status-${getOverallStatus()}`}>
            <div className="status-icon">
              <i className="bi bi-heart-pulse-fill"></i>
            </div>
            <div className="status-content">
              <h2 className="status-title">System Status: {status.toUpperCase()}</h2>
              <p className="status-description">
                Overall health score: {health_score}% • Last updated: {lastRefresh?.toLocaleTimeString()}
              </p>
            </div>
            <div className="status-indicator">
              <div className="pulse-animation"></div>
            </div>
          </div>
        </div>

        {/* Health Metrics */}
        <div className="metrics-grid">
          <MetricCard
            title="Health Score"
            value={`${health_score}%`}
            icon="heart-pulse"
            status={getOverallStatus()}
            context="Overall system health"
            progress={{ value: health_score, max: 100, label: `${health_score}% healthy` }}
          />
          <MetricCard
            title="Available Services"
            value={`${available_services}/${total_services}`}
            icon="gear-fill"
            status={getServiceStatus()}
            context="Active system services"
            progress={{ 
              value: available_services, 
              max: total_services, 
              label: `${total_services > 0 ? Math.round((available_services / total_services) * 100) : 0}% available` 
            }}
          />
          <MetricCard
            title="System Uptime"
            value={`${Math.floor(uptime_hours)}h`}
            icon="clock"
            status="excellent"
            context="Continuous operation time"
          />
          <MetricCard
            title="Failed Imports"
            value={failed_imports.toString()}
            icon="exclamation-triangle"
            status={failed_imports === 0 ? "excellent" : failed_imports < 5 ? "warning" : "poor"}
            context="Import process failures"
          />
        </div>

        {/* Resource Usage */}
        <div className="resource-usage-section">
          <div className="section-header">
            <h2 className="section-title">
              <i className="bi bi-cpu" style={{ marginRight: '12px' }}></i>
              Resource Usage
            </h2>
          </div>

          <div className="resource-grid">
            <div className="resource-card">
              <div className="resource-header">
                <h3 className="resource-title">
                  <i className="bi bi-memory"></i>
                  Memory Usage
                </h3>
                <span className={`resource-status status-${getResourceStatus(memory_usage_percent)}`}>
                  {memory_usage_percent}%
                </span>
              </div>
              <div className="resource-progress">
                <div className="progress-bar">
                  <div 
                    className={`progress-fill status-${getResourceStatus(memory_usage_percent)}`}
                    style={{ width: `${memory_usage_percent}%` }}
                  ></div>
                </div>
              </div>
            </div>

            <div className="resource-card">
              <div className="resource-header">
                <h3 className="resource-title">
                  <i className="bi bi-cpu"></i>
                  CPU Usage
                </h3>
                <span className={`resource-status status-${getResourceStatus(cpu_usage_percent)}`}>
                  {cpu_usage_percent}%
                </span>
              </div>
              <div className="resource-progress">
                <div className="progress-bar">
                  <div 
                    className={`progress-fill status-${getResourceStatus(cpu_usage_percent)}`}
                    style={{ width: `${cpu_usage_percent}%` }}
                  ></div>
                </div>
              </div>
            </div>

            <div className="resource-card">
              <div className="resource-header">
                <h3 className="resource-title">
                  <i className="bi bi-hdd"></i>
                  Disk Usage
                </h3>
                <span className={`resource-status status-${getResourceStatus(disk_usage_percent)}`}>
                  {disk_usage_percent}%
                </span>
              </div>
              <div className="resource-progress">
                <div className="progress-bar">
                  <div 
                    className={`progress-fill status-${getResourceStatus(disk_usage_percent)}`}
                    style={{ width: `${disk_usage_percent}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* System Components */}
        <div className="system-components-section">
          <div className="section-header">
            <h2 className="section-title">
              <i className="bi bi-diagram-3" style={{ marginRight: '12px' }}></i>
              System Components
            </h2>
          </div>

          <div className="components-grid">
            {systemComponents.map((component, index) => (
              <div key={index} className={`component-card component-${component.status}`}>
                <div className="component-header">
                  <div className="component-icon">
                    <i className={`bi bi-${component.status === 'healthy' ? 'check-circle-fill' : component.status === 'warning' ? 'exclamation-triangle-fill' : 'x-circle-fill'}`}></i>
                  </div>
                  <div className="component-info">
                    <h3 className="component-name">{component.name}</h3>
                    <p className="component-description">{component.description}</p>
                  </div>
                  <div className={`component-status status-${component.status === 'healthy' ? 'excellent' : component.status === 'warning' ? 'warning' : 'poor'}`}>
                    {component.status.charAt(0).toUpperCase() + component.status.slice(1)}
                  </div>
                </div>
                {component.details && (
                  <div className="component-details">
                    {Object.entries(component.details).map(([key, value]) => (
                      <div key={key} className="detail-item">
                        <span className="detail-key">{key}:</span>
                        <span className="detail-value">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Data Volume Breakdown */}
        <div className="data-volume-section">
          <div className="section-header" style={{ alignItems: 'center' }}>
            <h2 className="section-title">
              <i className="bi bi-bar-chart" style={{ marginRight: '12px' }}></i>
              Data Volume Breakdown
            </h2>
            <div className="btn-group" role="group" aria-label="Months window">
              {[12, 24, 36].map(n => (
                <button
                  key={n}
                  className={`btn btn-sm ${monthsWindow === n ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setMonthsWindow(n)}
                  style={{ marginLeft: 8 }}
                >
                  Last {n}
                </button>
              ))}
            </div>
          </div>

          {volumeData ? (
            <div className="volume-grid">
              {['water_quality', 'redox_event'].map((key) => (
                <div key={key} className="volume-card">
                  <div className="volume-header">
                    <h3 className="volume-title">
                      {key === 'water_quality' ? 'Water Quality' : 'Redox Events'}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ExportButton 
                        data={volumeData[key]?.by_month?.map(r => ({ month: r.month, count: r.count })) || []}
                        filename={`${key}_monthly_counts`}
                        availableFormats={['csv']}
                        size="sm"
                        variant="outline-secondary"
                      />
                      <ExportButton 
                        data={volumeData[key]?.by_year?.map(r => ({ year: r.year, count: r.count })) || []}
                        filename={`${key}_yearly_counts`}
                        availableFormats={['csv']}
                        size="sm"
                        variant="outline-secondary"
                      />
                      <span className="volume-total">Total: {volumeData[key]?.total?.toLocaleString?.() || 0}</span>
                    </div>
                  </div>
                  <div className="volume-columns">
                    <div className="volume-column">
                      <h4>By Year</h4>
                      <ul>
                        {volumeData[key]?.by_year?.map(row => (
                          <li key={row.year}>
                            <span className="label">{row.year}</span>
                            <span className="value">{row.count.toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="volume-column">
                      <h4>By Month (last {monthsWindow})</h4>
                      <div id={`${key}-volume-month-chart`}>
                        <Plot
                          data={[{
                            type: 'bar',
                            x: (() => {
                              const rows = (volumeData[key]?.by_month || []);
                              const recent = rows.slice(0, monthsWindow).reverse();
                              return recent.map(r => r.month);
                            })(),
                            y: (() => {
                              const rows = (volumeData[key]?.by_month || []);
                              const recent = rows.slice(0, monthsWindow).reverse();
                              return recent.map(r => r.count);
                            })(),
                            marker: { color: '#60a5fa' }
                          }]}
                          layout={{
                            height: 220,
                            margin: { l: 40, r: 10, t: 10, b: 40 },
                            xaxis: { title: 'Month', tickangle: -45, type: 'category' },
                            yaxis: { title: 'Count' },
                            showlegend: false,
                            plot_bgcolor: 'rgba(0,0,0,0)',
                            paper_bgcolor: 'rgba(0,0,0,0)'
                          }}
                          config={{ displayModeBar: false, responsive: true }}
                          style={{ width: '100%', height: '220px' }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                        <ExportButton
                          chartElementId={`${key}-volume-month-chart`}
                          filename={`${key}_monthly_counts_chart`}
                          availableFormats={['png']}
                          size="sm"
                          variant="outline-secondary"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              type="loading"
              title="Loading Data Volume"
              description="Fetching monthly and yearly record counts..."
            />
          )}

          {/* Combined Monthly Chart */}
          {volumeData && (
            <div className="volume-card" style={{ marginTop: 16 }}>
              <div className="volume-header" style={{ marginBottom: 12 }}>
                <h3 className="volume-title">Combined Monthly Records</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <ExportButton
                    chartElementId={`combined-volume-month-chart`}
                    filename={`combined_monthly_counts_chart`}
                    availableFormats={['png']}
                    size="sm"
                    variant="outline-secondary"
                  />
                  <ExportButton
                    data={(() => {
                      const w = (volumeData['water_quality']?.by_month || []).slice(0, monthsWindow).reverse();
                      const r = (volumeData['redox_event']?.by_month || []).slice(0, monthsWindow).reverse();
                      const mapW = new Map(w.map(row => [row.month, row.count]));
                      const mapR = new Map(r.map(row => [row.month, row.count]));
                      const months = Array.from(new Set([...w.map(x => x.month), ...r.map(x => x.month)])).sort();
                      return months.map(m => ({ month: m, water_quality: mapW.get(m) || 0, redox_event: mapR.get(m) || 0 }));
                    })()}
                    filename={`combined_monthly_counts`}
                    availableFormats={['csv']}
                    size="sm"
                    variant="outline-secondary"
                  />
                </div>
              </div>
              <div id={`combined-volume-month-chart`}>
                <Plot
                  data={(() => {
                    const w = (volumeData['water_quality']?.by_month || []).slice(0, monthsWindow).reverse();
                    const r = (volumeData['redox_event']?.by_month || []).slice(0, monthsWindow).reverse();
                    const months = Array.from(new Set([...w.map(x => x.month), ...r.map(x => x.month)])).sort();
                    const mapW = new Map(w.map(row => [row.month, row.count]));
                    const mapR = new Map(r.map(row => [row.month, row.count]));
                    const yW = months.map(m => mapW.get(m) || 0);
                    const yR = months.map(m => mapR.get(m) || 0);
                    return [
                      { type: 'bar', name: 'Water Quality', x: months, y: yW, marker: { color: '#60a5fa' } },
                      { type: 'bar', name: 'Redox Events', x: months, y: yR, marker: { color: '#a78bfa' } }
                    ];
                  })()}
                  layout={{
                    barmode: 'group',
                    height: 280,
                    margin: { l: 40, r: 10, t: 10, b: 50 },
                    xaxis: { title: 'Month', tickangle: -45, type: 'category' },
                    yaxis: { title: 'Count' },
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    paper_bgcolor: 'rgba(0,0,0,0)'
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%', height: '280px' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Health Tips */}
        <div className="health-tips-section">
          <div className="section-header">
            <h2 className="section-title">
              <i className="bi bi-lightbulb" style={{ marginRight: '12px' }}></i>
              System Health Information
            </h2>
          </div>

          <div className="tips-grid">
            {healthTips.map((tip, index) => (
              <div key={index} className="health-tip-card">
                <div className="tip-icon">
                  <i className={`bi bi-${tip.icon}`}></i>
                </div>
                <div className="tip-content">
                  <h3 className="tip-title">{tip.title}</h3>
                  <p className="tip-description">{tip.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
  return (
    <RoleGate allowed={['admin','analyst']}>
      {content}
    </RoleGate>
  );
};

export default ModernSystemHealth;
