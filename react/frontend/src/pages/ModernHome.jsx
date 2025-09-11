import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MetricCard from '../components/modern/MetricCard';
import '../styles/modern-layout.css';
import TutorialHint from '../components/modern/TutorialHint';
import { useTutorial } from '../hooks/useTutorial.js';
import '../styles/landing-pages.css';
import { getHomeData } from '../services/api';
import { safeStorage } from '../utils/safeStorage';

/**
 * Modern Home Page - Professional Dashboard Landing
 * Uses CSS Grid layout and design system tokens
 */
const ModernHome = () => {
  const tutorial = useTutorial();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    active_sites: null,
    total_sites: null,
    recent_measurements: null,
    data_quality: null,
    active_alerts: null,
    data_current_through: null,
  });
  const [meta, setMeta] = useState({ last_updated: null });
  const [latestBySite, setLatestBySite] = useState([]);

  useEffect(() => {
    let alive = true;
    // Seed UI from cached data for instant paint
    try {
      const cached = safeStorage.getJSON('home:data:v1');
      if (cached && typeof cached === 'object') {
        const maxStaleMs = 5 * 60 * 1000; // 5 minutes
        if (cached.savedAt && (Date.now() - cached.savedAt) <= maxStaleMs) {
          setStats(cached.stats || {});
          setMeta(cached.meta || {});
          setLatestBySite(Array.isArray(cached.latestBySite) ? cached.latestBySite : []);
        }
      }
    } catch { /* ignore */ }
    
    // Auto-fetch fresh data on page load for immediate KPI display
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await getHomeData();
        if (!alive) return;
        const s = res?.dashboard_data?.dashboard_stats || {};
        const latest = Array.isArray(res?.dashboard_data?.latest_per_site) ? res.dashboard_data.latest_per_site : [];
        // active_alerts not provided by API yet; default to 0
        setStats({
          active_sites: Number.isFinite(s.active_sites) ? s.active_sites : 0,
          total_sites: Number.isFinite(s.total_sites) ? s.total_sites : 0,
          recent_measurements: Number.isFinite(s.recent_measurements) ? s.recent_measurements : 0,
          data_quality: Number.isFinite(s.data_quality) ? s.data_quality : null,
          active_alerts: 0,
          data_current_through: s.data_current_through || null,
        });
        const newMeta = { last_updated: res?.metadata?.last_updated || null };
        setMeta(newMeta);
        setLatestBySite(latest);
        // Cache for next visit/login
        try {
          safeStorage.setJSON('home:data:v1', {
            savedAt: Date.now(),
            stats: {
              active_sites: Number.isFinite(s.active_sites) ? s.active_sites : 0,
              total_sites: Number.isFinite(s.total_sites) ? s.total_sites : 0,
              recent_measurements: Number.isFinite(s.recent_measurements) ? s.recent_measurements : 0,
              data_quality: Number.isFinite(s.data_quality) ? s.data_quality : null,
              active_alerts: 0,
              data_current_through: s.data_current_through || null,
            },
            meta: newMeta,
            latestBySite: latest,
          });
        } catch { /* ignore */ }
      } catch (e) {
        if (!alive) return;
        setError(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const handleRefresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getHomeData();
      const s = res?.dashboard_data?.dashboard_stats || {};
      const latest = Array.isArray(res?.dashboard_data?.latest_per_site) ? res.dashboard_data.latest_per_site : [];
      setStats({
        active_sites: Number.isFinite(s.active_sites) ? s.active_sites : 0,
        total_sites: Number.isFinite(s.total_sites) ? s.total_sites : 0,
        recent_measurements: Number.isFinite(s.recent_measurements) ? s.recent_measurements : 0,
        data_quality: Number.isFinite(s.data_quality) ? s.data_quality : null,
        active_alerts: 0,
        data_current_through: s.data_current_through || null,
      });
      const newMeta = { last_updated: res?.metadata?.last_updated || null };
      setMeta(newMeta);
      setLatestBySite(latest);
      // update cache
      try {
        safeStorage.setJSON('home:data:v1', {
          savedAt: Date.now(),
          stats: {
            active_sites: Number.isFinite(s.active_sites) ? s.active_sites : 0,
            total_sites: Number.isFinite(s.total_sites) ? s.total_sites : 0,
            recent_measurements: Number.isFinite(s.recent_measurements) ? s.recent_measurements : 0,
            data_quality: Number.isFinite(s.data_quality) ? s.data_quality : null,
            active_alerts: 0,
            data_current_through: s.data_current_through || null,
          },
          meta: newMeta,
          latestBySite: latest,
        });
      } catch { /* ignore */ }
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);
  return (
    <div className="modern-dashboard-home landing-page">
      {/* Header Section */}
      <div className="dashboard-header landing-header">
        <div>
          <h1 className="dashboard-title landing-title">Environmental Monitoring Dashboard</h1>
          <p className="dashboard-subtitle landing-subtitle">
            Monitor and analyze water quality data from multiple monitoring sites
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="home-content landing-content">
        {error && (
          <div className="alert-message alert-error" style={{ marginBottom: '1rem' }}>
            <div className="alert-content">
              <i className="bi bi-exclamation-triangle"></i>
              <span>{error}</span>
            </div>
          </div>
        )}
        {/* Data currency ribbon */}
        {(stats.data_current_through || meta.last_updated) && (
          <div className="info-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', color: '#6c757d', marginBottom: '12px' }}>
            {stats.data_current_through && (
              <span>
                <i className="bi bi-calendar-week me-1"></i>
                Data current through {String(stats.data_current_through).slice(0, 10)}
              </span>
            )}
            {meta.last_updated && (
              <span>
                <i className="bi bi-clock-history me-1"></i>
                Last updated {new Date(meta.last_updated).toLocaleString()}
              </span>
            )}
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={handleRefresh}
              disabled={loading}
              title="Refresh KPIs"
              style={{ marginLeft: 'auto' }}
            >
              <i className={`bi ${loading ? 'bi-arrow-repeat spin' : 'bi-arrow-clockwise'}`}></i>
            </button>
          </div>
        )}
        {/* Quick Stats Grid */}
        {tutorial.enabled && (
          <div style={{ marginBottom: '0.75rem' }}>
            <TutorialHint id="home-metrics" title="At a Glance">
              These cards summarize key stats like Active Sites and Data Quality.
            </TutorialHint>
          </div>
        )}
        <div className="metrics-grid">
          <MetricCard
            title="Active Sites"
            value={stats.active_sites == null ? (loading ? '…' : '-') : String(stats.active_sites)}
            icon="geo-alt"
            status="good"
            context={stats.total_sites != null ? `of ${stats.total_sites} total` : 'Currently monitoring'}
          />
          <MetricCard
            title="Recent Readings"
            value={stats.recent_measurements == null ? (loading ? '…' : '-') : stats.recent_measurements.toLocaleString()}
            icon="bar-chart"
            status="excellent"
            context="Last 24 hours"
          />
          <MetricCard
            title="Data Quality"
            value={stats.data_quality == null ? (loading ? '…' : '-') : `${stats.data_quality.toFixed(1)}%`}
            icon="check-circle"
            status="excellent"
            context="System operational"
          />
          <MetricCard
            title="Active Alerts"
            value={stats.active_alerts == null ? (loading ? '…' : '0') : String(stats.active_alerts)}
            icon="bell"
            status="good"
            context="No active issues"
          />
          <MetricCard
            title="Latest WQ Records"
            icon="calendar-week"
            status="good"
            value={(
              <div style={{ display: 'grid', gap: 4 }}>
                {(latestBySite || []).filter(r => r.last_water_quality).slice(0, 4).map((r, idx) => (
                  <div key={`${r.site_code || idx}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.9rem' }}>
                    <span style={{ color: '#334155', fontWeight: 600 }}>{r.site_code || '-'}</span>
                    <span style={{ color: '#64748b' }}>{String(r.last_water_quality).slice(0,10)}</span>
                  </div>
                ))}
              </div>
            )}
            context={(() => { const n=(latestBySite||[]).filter(r=>r.last_water_quality).length; return n>4?`+${n-4} more sites`:null; })()}
          />
          <MetricCard
            title="Latest Redox Records"
            icon="calendar-week"
            status="good"
            value={(
              <div style={{ display: 'grid', gap: 4 }}>
                {(latestBySite || []).filter(r => r.last_redox).slice(0, 4).map((r, idx) => (
                  <div key={`${r.site_code || idx}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.9rem' }}>
                    <span style={{ color: '#334155', fontWeight: 600 }}>{r.site_code || '-'}</span>
                    <span style={{ color: '#64748b' }}>{String(r.last_redox).slice(0,10)}</span>
                  </div>
                ))}
              </div>
            )}
            context={(() => { const n=(latestBySite||[]).filter(r=>r.last_redox).length; return n>4?`+${n-4} more sites`:null; })()}
          />
        </div>

        {/* Navigation Cards Grid */}
        <div className="navigation-grid">
          {tutorial.enabled && (
            <div style={{ gridColumn: '1 / -1' }}>
              <TutorialHint id="home-navigation" title="Navigate">
                Jump to analysis pages: Water Quality, Redox, Site Comparison, and more.
              </TutorialHint>
            </div>
          )}
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
                <i className="bi bi-arrow-right" style={{ marginLeft: '8px' }}></i>
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
                <i className="bi bi-arrow-right" style={{ marginLeft: '8px' }}></i>
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
                <i className="bi bi-arrow-right" style={{ marginLeft: '8px' }}></i>
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
                <i className="bi bi-arrow-right" style={{ marginLeft: '8px' }}></i>
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
                <i className="bi bi-arrow-right" style={{ marginLeft: '8px' }}></i>
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
