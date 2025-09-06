import React from 'react';
import { Link } from 'react-router-dom';
import MetricCard from '../components/modern/MetricCard';
import '../styles/landing-pages.css';

/**
 * Modern Introduction Page - Environmental Monitoring Platform Landing
 * Uses design system tokens and modern layout patterns
 */
const ModernIntroduction = () => {
  const monitoringFeatures = [
    {
      icon: 'droplet-fill',
      title: 'Water Quality',
      description: 'Comprehensive analysis of water parameters including temperature, conductivity, dissolved oxygen, turbidity, and water levels across multiple monitoring sites.',
      features: [
        'Real-time measurements every hour',
        'Historical trend analysis',
        'Quality indicators and alerts',
        'Cross-site comparisons'
      ]
    },
    {
      icon: 'lightning-charge-fill',
      title: 'Redox Conditions', 
      description: 'Monitoring of redox potential (oxidation-reduction) conditions at various depths to understand subsurface chemical processes and environmental health.',
      features: [
        'Multi-depth measurements (0.5m - 3.0m)',
        'Redox zone classification',
        'Depth profile analysis',
        'Temporal trend tracking'
      ]
    }
  ];

  const whyItMatters = [
    {
      icon: 'shield-check',
      title: 'Environmental Protection',
      description: 'Early detection of contamination, pollution events, and environmental changes to protect ecosystems and public health.'
    },
    {
      icon: 'graph-up',
      title: 'Data-Driven Decisions',
      description: 'Scientific evidence and trends to support regulatory compliance, policy decisions, and resource management.'
    },
    {
      icon: 'clock-history',
      title: 'Long-term Insights',
      description: 'Historical data analysis to understand seasonal patterns, long-term trends, and environmental impacts.'
    }
  ];

  const navigationCards = [
    {
      icon: 'house-fill',
      title: 'Dashboard Home',
      description: 'Start here for system overview, site status, and key performance indicators.',
      link: '/',
      status: 'excellent'
    },
    {
      icon: 'droplet',
      title: 'Water Quality',
      description: 'Analyze water parameters with interactive time series charts and filtering.',
      link: '/water-quality-enhanced',
      status: 'good'
    },
    {
      icon: 'lightning-charge',
      title: 'Redox Analysis',
      description: 'Explore redox conditions, depth profiles, and zone classifications.',
      link: '/redox-analysis-enhanced',
      status: 'warning'
    },
    {
      icon: 'bar-chart',
      title: 'Site Comparison',
      description: 'Compare parameters across multiple monitoring sites and time periods.',
      link: '/site-comparison-enhanced',
      status: 'good'
    },
    {
      icon: 'file-earmark-text',
      title: 'Reports',
      description: 'Generate comprehensive reports and export data for further analysis.',
      link: '/reports',
      status: 'unknown'
    },
    {
      icon: 'bell',
      title: 'Alerts',
      description: 'Monitor system alerts, threshold violations, and notification settings.',
      link: '/alerts',
      status: 'poor'
    }
  ];

  const keyFeatures = [
    {
      icon: 'graph-up-arrow',
      title: 'Interactive Time Series Charts',
      description: 'Dynamic charts with time-based X-axis and interchangeable Y-axis parameters. Switch between different measurements instantly.'
    },
    {
      icon: 'funnel',
      title: 'Advanced Filtering',
      description: 'Filter data by sites, time ranges, parameters, and quality indicators to focus on what matters most.'
    },
    {
      icon: 'speedometer2',
      title: 'Real-time Performance',
      description: 'Optimized data loading with caching, progressive loading, and smart data management for fast performance.'
    }
  ];

  return (
    <div className="landing-page">
      <div className="landing-header">
        <h1 className="landing-title" style={{ margin: 0 }}>Introduction</h1>
        <p className="landing-subtitle" style={{ marginTop: 4 }}>Real-time Water Quality & Redox Analysis Platform</p>
      </div>
      <div className="landing-content">
        {/* Hero Section */}
        <div className="introduction-hero landing-section">
          <div className="hero-content">
          <div className="hero-icon">
            <i className="bi bi-droplet-fill"></i>
          </div>
          <h1 className="hero-title">
            Welcome to Environmental Monitoring
          </h1>
          <p className="hero-subtitle">
            Real-time Water Quality & Redox Analysis Platform
          </p>
          <p className="hero-description">
            This dashboard provides comprehensive monitoring and analysis of environmental 
            conditions across multiple monitoring sites. Our system tracks water quality 
            parameters, redox conditions, and environmental trends to support data-driven 
            decision making and environmental protection.
          </p>
          <div className="hero-actions">
            <Link to="/" className="btn btn-primary shadow-interactive">
              <i className="bi bi-house-fill" style={{ marginRight: '8px' }}></i>
              Get Started
            </Link>
            <Link to="/water-quality-enhanced" className="btn btn-outline-primary shadow-interactive">
              <i className="bi bi-droplet" style={{ marginRight: '8px' }}></i>
              View Water Quality
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* What We Monitor Section */}
        <div className="intro-section">
          <div className="section-header">
            <h2 className="section-title">
              <i className="bi bi-microscope" style={{ marginRight: '12px' }}></i>
              What We Monitor
            </h2>
          </div>

          <div className="monitoring-grid">
            {monitoringFeatures.map((feature, index) => (
              <div key={index} className="monitoring-card">
                <div className="monitoring-icon">
                  <i className={`bi bi-${feature.icon}`}></i>
                </div>
                <h3 className="monitoring-title">{feature.title}</h3>
                <p className="monitoring-description">{feature.description}</p>
                <ul className="monitoring-features">
                  {feature.features.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Why It Matters Section */}
        <div className="intro-section">
          <div className="section-header">
            <h2 className="section-title">
              <i className="bi bi-globe" style={{ marginRight: '12px' }}></i>
              Why Environmental Monitoring Matters
            </h2>
          </div>

          <div className="importance-grid">
            {whyItMatters.map((item, index) => (
              <div key={index} className="importance-card">
                <div className="importance-icon">
                  <i className={`bi bi-${item.icon}`}></i>
                </div>
                <h3 className="importance-title">{item.title}</h3>
                <p className="importance-description">{item.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Getting Started Section */}
        <div className="intro-section">
          <div className="section-header">
            <h2 className="section-title">
              <i className="bi bi-rocket-takeoff" style={{ marginRight: '12px' }}></i>
              Getting Started with the Dashboard
            </h2>
          </div>

          <div className="navigation-grid">
            {navigationCards.map((card, index) => (
              <Link key={index} to={card.link} className="nav-card-link">
                <div className="navigation-card">
                  <div className="nav-card-icon">
                    <i className={`bi bi-${card.icon}`}></i>
                  </div>
                  <h3 className="nav-card-title">{card.title}</h3>
                  <p className="nav-card-description">{card.description}</p>
                  <div className={`nav-card-status status-${card.status}`}>
                    <div className="status-indicator"></div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Key Features Section */}
        <div className="intro-section">
          <div className="section-header">
            <h2 className="section-title">
              <i className="bi bi-stars" style={{ marginRight: '12px' }}></i>
              Key Features
            </h2>
          </div>

          <div className="features-grid">
            {keyFeatures.map((feature, index) => (
              <div key={index} className="feature-card">
                <div className="feature-icon">
                  <i className={`bi bi-${feature.icon}`}></i>
                </div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Call to Action Section */}
        <div className="intro-section">
          <div className="cta-section">
            <div className="cta-content">
              <h2 className="cta-title">Ready to Explore Your Environmental Data?</h2>
              <p className="cta-description">
                Start by visiting the Dashboard to see system overview and site status, 
                then navigate to specific analysis pages based on your needs.
              </p>
              <div className="cta-actions">
                <Link to="/" className="btn btn-primary btn-lg shadow-interactive">
                  <i className="bi bi-house-fill" style={{ marginRight: '8px' }}></i>
                  Go to Dashboard
                </Link>
                <Link to="/water-quality-enhanced" className="btn btn-outline-primary btn-lg shadow-interactive">
                  <i className="bi bi-droplet" style={{ marginRight: '8px' }}></i>
                  Water Quality Analysis
                </Link>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default ModernIntroduction;
