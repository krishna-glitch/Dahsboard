import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import MetricCard from '../components/modern/MetricCard';
import '../styles/modern-layout.css';
import { useAuth } from '../contexts/authUtils';
import '../styles/landing-pages.css';
import styles from '../styles/ModernHome.module.css';
import { useHomeQuery } from '../hooks/useHomeQuery';


const mapStatusToCard = (status) => {
  switch (status) {
    case 'error':
      return 'poor';
    case 'warning':
      return 'fair';
    case 'success':
      return 'excellent';
    case 'empty':
      return 'unknown';
    default:
      return 'unknown';
  }
};

/**
 * Modern Home Page - Professional Dashboard Landing
 * Uses CSS Grid layout and design system tokens
 */
const ModernHome = () => {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useHomeQuery();

  const stats = data?.stats;
  const meta = data?.meta;
  const latestBySite = data?.latestBySite;

  // Memoized components for performance
  const latestWaterQualityRecords = useMemo(() => {
    if (latestBySite?.status === 'error') {
        return <div className={styles.inlineError}>{latestBySite.message}</div>;
    }
    const records = (latestBySite?.data || []).filter(r => r.last_water_quality).slice(0, 4);
    if (records.length === 0) return <div className={styles.inlineMuted}>No recent records</div>;

    return (
      <div className={styles.latestRecord}>
        {records.map((r, idx) => (
          <div key={`${r.site_code || idx}`} className={styles.latestRecordRow}>
            <span className={styles.latestRecordSite}>{r.site_code || '-'}</span>
            <span className={styles.latestRecordDate}>{String(r.last_water_quality).slice(0,10)}</span>
          </div>
        ))}
      </div>
    );
  }, [latestBySite]);

  const latestRedoxRecords = useMemo(() => {
    if (latestBySite?.status === 'error') {
        return <div className={styles.inlineError}>{latestBySite.message}</div>;
    }
    const records = (latestBySite?.data || []).filter(r => r.last_redox).slice(0, 4);
    if (records.length === 0) return <div className={styles.inlineMuted}>No recent records</div>;

    return (
      <div className={styles.latestRecord}>
        {records.map((r, idx) => (
          <div key={`${r.site_code || idx}`} className={styles.latestRecordRow}>
            <span className={styles.latestRecordSite}>{r.site_code || '-'}</span>
            <span className={styles.latestRecordDate}>{String(r.last_redox).slice(0,10)}</span>
          </div>
        ))}
      </div>
    );
  }, [latestBySite]);

  const waterQualityContext = useMemo(() => {
    if (latestBySite?.status !== 'success') return null;
    const n = (latestBySite?.data || []).filter(r => r.last_water_quality).length;
    return n > 4 ? `+${n-4} more sites` : null;
  }, [latestBySite]);

  const redoxContext = useMemo(() => {
    if (latestBySite?.status !== 'success') return null;
    const n = (latestBySite?.data || []).filter(r => r.last_redox).length;
    return n > 4 ? `+${n-4} more sites` : null;
  }, [latestBySite]);

  // Loading states with skeleton components
  const SkeletonMetricCard = () => (
    <div className="metric-card skeleton-loading">
      <div className="skeleton-line skeleton-title"></div>
      <div className="skeleton-line skeleton-value"></div>
      <div className="skeleton-line skeleton-context"></div>
    </div>
  );
  return (
    <div className="modern-dashboard-home landing-page">
      {/* Header Section */}
      <div className="dashboard-header landing-header">
        <div>
          <h1 className="dashboard-title landing-title">Environmental Monitoring Dashboard</h1>
          <p className="dashboard-subtitle landing-subtitle">
            {user?.username ? `Welcome back, ${user.username}` : 'Welcome'} • Monitor and analyze water quality data from multiple monitoring sites
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="home-content landing-content">
        {error && (
          <div className="alert-message alert-error">
            <div className="alert-content">
              <i className="bi bi-exclamation-triangle"></i>
              <span>An error occurred while fetching data. Please try again later.</span>
              <button
                className="btn btn-outline-primary btn-sm retry-button"
                onClick={refetch}
                disabled={isLoading}
                title="Retry loading data"
              >
                <i className={`bi ${isLoading ? 'bi-arrow-repeat spin' : 'bi-arrow-clockwise'}`}></i>
                {isLoading ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          </div>
        )}
        {/* Data currency ribbon */}
        {(stats?.data_current_through || meta?.last_updated) && (
          <div className="info-bar">
            {stats?.data_current_through && (
              <span>
                <i className="bi bi-calendar-week me-1"></i>
                Data current through {String(stats.data_current_through).slice(0, 10)}
              </span>
            )}
            {meta?.last_updated && (
              <span>
                <i className="bi bi-clock-history me-1"></i>
                Last updated {new Date(meta.last_updated).toLocaleString()}
              </span>
            )}
            <button
              className="btn btn-outline-secondary btn-sm refresh-button"
              onClick={refetch}
              disabled={isLoading}
              title="Refresh KPIs"
            >
              <i className={`bi ${isLoading ? 'bi-arrow-repeat spin' : 'bi-arrow-clockwise'}`}></i>
            </button>
          </div>
        )}
        {/* Quick Stats Grid */}
        <div className="metrics-grid">
          {isLoading && !data ? (
            <>
              <SkeletonMetricCard />
              <SkeletonMetricCard />
              <SkeletonMetricCard />
              <SkeletonMetricCard />
              <SkeletonMetricCard />
              <SkeletonMetricCard />
            </>
          ) : (
            <>
              <MetricCard
                title="Active Sites"
                value={stats?.status === 'error' ? 'Error' : (stats?.active_sites ?? '-')}
                icon="geo-alt"
                status={mapStatusToCard(stats?.status)}
                context={stats?.status === 'error' ? stats.message : (stats?.total_sites != null ? `of ${stats.total_sites} total` : 'Currently monitoring')}
              />
              <MetricCard
                title="Recent Readings"
                value={stats?.status === 'error' ? 'Error' : (stats?.recent_measurements != null ? stats.recent_measurements.toLocaleString() : '-')}
                icon="bar-chart"
                status={mapStatusToCard(stats?.recent_window?.status || stats?.status)}
                context={stats?.status === 'error' ? stats.message : stats?.contextLabel}
              />
              <MetricCard
                title="Data Quality"
                value={stats?.status === 'error' ? 'Error' : (Number.isFinite(stats?.data_quality) ? `${stats.data_quality.toFixed(1)}%` : '-')}
                icon="check-circle"
                status={mapStatusToCard(stats?.status)}
                context={stats?.status === 'error' ? stats.message : 'System operational'}
              />
              <MetricCard
                title="Active Alerts"
                value={(stats?.active_alerts ?? 0).toString()}
                icon="bell"
                status={mapStatusToCard(stats?.status)}
                context={stats?.status === 'error' ? stats.message : (stats?.active_alerts ? 'Action required' : 'No active issues')}
              />
              <MetricCard
                title="Latest WQ Records"
                icon="calendar-week"
                status={latestBySite?.status === 'error' ? 'error' : 'good'}
                value={latestWaterQualityRecords}
                context={waterQualityContext}
              />
              <MetricCard
                title="Latest Redox Records"
                icon="calendar-week"
                status={latestBySite?.status === 'error' ? 'error' : 'good'}
                value={latestRedoxRecords}
                context={redoxContext}
              />
            </>
          )}
        </div>

        {/* Navigation Cards Grid */}
        <div className="navigation-grid">
          <div className="nav-card component-fade-in">
            <div className="nav-card-header">
              <div className="nav-card-icon data-quality">
                <i className="bi bi-shield-check"></i>
              </div>
              <h3 className="nav-card-title">Data Quality</h3>
            </div>
            <p className="nav-card-description">
              Analyze completeness, duplicates, outliers, and flatlines across sites with daily heatmaps.
            </p>
            <div className="nav-card-actions">
              <Link to="/data-quality" className="btn btn-primary shadow-interactive transition-all">
                <i className="bi bi-arrow-right nav-arrow-icon"></i>
                View Data Quality
              </Link>
            </div>
          </div>

          <div className="nav-card component-fade-in">
            <div className="nav-card-header">
              <div className="nav-card-icon water-quality">
                <i className="bi bi-droplet"></i>
              </div>
              <h3 className="nav-card-title">Water Quality Analysis</h3>
            </div>
            <p className="nav-card-description">
              Monitor temperature, conductivity, and water level measurements across monitoring sites.
            </p>
            <div className="nav-card-actions">
              <Link to="/water-quality-enhanced" className="btn btn-primary shadow-interactive transition-all">
                <i className="bi bi-arrow-right nav-arrow-icon"></i>
                View Analysis
              </Link>
            </div>
          </div>

          <div className="nav-card component-fade-in">
            <div className="nav-card-header">
              <div className="nav-card-icon redox-analysis">
                <i className="bi bi-beaker"></i>
              </div>
              <h3 className="nav-card-title">Redox Analysis</h3>
            </div>
            <p className="nav-card-description">
              Analyze redox potential measurements and classify geochemical zones.
            </p>
            <div className="nav-card-actions">
              <Link to="/redox-analysis-enhanced" className="btn btn-primary shadow-interactive transition-all">
                <i className="bi bi-arrow-right nav-arrow-icon"></i>
                View Analysis
              </Link>
            </div>
          </div>

          <div className="nav-card component-fade-in">
            <div className="nav-card-header">
              <div className="nav-card-icon site-comparison">
                <i className="bi bi-bar-chart-line"></i>
              </div>
              <h3 className="nav-card-title">Site Comparison</h3>
            </div>
            <p className="nav-card-description">
              Compare water quality parameters between different monitoring sites.
            </p>
            <div className="nav-card-actions">
              <Link to="/site-comparison-enhanced" className="btn btn-primary shadow-interactive transition-all">
                <i className="bi bi-arrow-right nav-arrow-icon"></i>
                View Comparison
              </Link>
            </div>
          </div>

          <div className="nav-card component-fade-in">
            <div className="nav-card-header">
              <div className="nav-card-icon alerts-reports">
                <i className="bi bi-exclamation-triangle"></i>
              </div>
              <h3 className="nav-card-title">Alerts & Reports</h3>
            </div>
            <p className="nav-card-description">
              Monitor active alerts and generate comprehensive reports.
            </p>
            <div className="nav-card-actions">
              <Link to="/alerts" className="btn btn-primary shadow-interactive transition-all">
                <i className="bi bi-arrow-right nav-arrow-icon"></i>
                View Alerts
              </Link>
            </div>
          </div>
        </div>

        {/* Quick Access Section */}
          <div className="quick-access-section">
            <h2 className="section-title">Quick Access</h2>
            <div className="quick-access-grid">
              <Link to="/upload" className="quick-access-item transition-all">
                <i className="bi bi-cloud-upload"></i>
                <span>Upload Data</span>
              </Link>
              <Link to="/system-health" className="quick-access-item transition-all">
                <i className="bi bi-heart-pulse"></i>
                <span>System Health</span>
              </Link>
              <Link to="/performance" className="quick-access-item transition-all">
                <i className="bi bi-speedometer2"></i>
                <span>Performance</span>
              </Link>
              <Link to="/data-diagnostics" className="quick-access-item transition-all">
                <i className="bi bi-tools"></i>
                <span>Diagnostics</span>
              </Link>
              <Link to="/data-quality" className="quick-access-item transition-all">
                <i className="bi bi-shield-check"></i>
                <span>Data Quality</span>
              </Link>
            </div>
          </div>
      </div>
    </div>
  );
};

export default ModernHome;
