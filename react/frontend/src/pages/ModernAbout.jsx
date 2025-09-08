import React from 'react';
import '../styles/landing-pages.css';

/**
 * Modern About Page - Professional Information Display
 * Uses design system tokens and modern layout
 */
const ModernAbout = () => {
  return (
    <div className="landing-page">
      {/* Header */}
      <div className="dashboard-header landing-header">
        <div>
          <h1 className="dashboard-title landing-title">About Water Quality Dashboard</h1>
          <p className="dashboard-subtitle landing-subtitle">
            Environmental monitoring platform for real-time water quality analysis
          </p>
        </div>
      </div>

      {/* Main Content */}
  <div className="landing-content">
        {/* Overview Video */}
        <div className="about-section component-fade-in">
          <div className="section-icon video">
            <i className="bi bi-play-btn"></i>
          </div>
          <div className="section-content">
            <h2 className="section-title">Overview Video</h2>
            <p className="section-description">
              A quick walkthrough to understand the dashboard and its context.
            </p>
            <div className="video-embed">
              <div className="video-embed__responsive">
                <iframe
                  src="https://www.youtube-nocookie.com/embed/RlD8gCk1BiU"
                  title="Water Quality Dashboard Overview"
                  frameBorder="0"
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        </div>
        {/* Mission Section */}
        <div className="about-section component-fade-in">
          <div className="section-icon mission">
            <i className="bi bi-bullseye"></i>
          </div>
          <div className="section-content">
            <h2 className="section-title">Our Mission</h2>
            <p className="section-description">
              Our mission is to empower environmental scientists, researchers, and decision-makers with accurate, 
              timely, and actionable data. We believe that by making complex environmental data accessible and 
              understandable, we can contribute to better environmental management and protection.
            </p>
          </div>
        </div>

        {/* Features Grid */}
        <div className="features-section">
          <h2 className="section-title">What We Do</h2>
          <p className="text-secondary" style={{ marginBottom: 'var(--spacing-component-xl)' }}>
            This application collects, processes, and visualizes data from various environmental monitoring sites.
          </p>
          
          <div className="features-grid">
            <div className="feature-card component-slide-in">
              <div className="feature-icon visualization">
                <i className="bi bi-graph-up"></i>
              </div>
              <h3 className="feature-title">Real-time Visualization</h3>
              <p className="feature-description">
                Interactive charts and trend analysis for water quality parameters across monitoring sites.
              </p>
            </div>

            <div className="feature-card component-slide-in">
              <div className="feature-icon analysis">
                <i className="bi bi-bar-chart-line"></i>
              </div>
              <h3 className="feature-title">Comparative Analysis</h3>
              <p className="feature-description">
                Cross-site comparison tools for identifying patterns and anomalies in water quality data.
              </p>
            </div>

            <div className="feature-card component-slide-in">
              <div className="feature-icon classification">
                <i className="bi bi-diagram-3"></i>
              </div>
              <h3 className="feature-title">Statistical Analysis</h3>
              <p className="feature-description">
                Advanced statistical analysis and geochemical zone classification for redox conditions.
              </p>
            </div>

            <div className="feature-card component-slide-in">
              <div className="feature-icon reporting">
                <i className="bi bi-file-earmark-text"></i>
              </div>
              <h3 className="feature-title">Automated Reports</h3>
              <p className="feature-description">
                Generate comprehensive reports and export data in multiple formats for analysis.
              </p>
            </div>

            <div className="feature-card component-slide-in">
              <div className="feature-icon alerts">
                <i className="bi bi-bell"></i>
              </div>
              <h3 className="feature-title">Smart Alerts</h3>
              <p className="feature-description">
                Automated alerting system for critical environmental changes and threshold violations.
              </p>
            </div>

            <div className="feature-card component-slide-in">
              <div className="feature-icon monitoring">
                <i className="bi bi-speedometer2"></i>
              </div>
              <h3 className="feature-title">System Monitoring</h3>
              <p className="feature-description">
                Real-time system health monitoring and performance optimization tools.
              </p>
            </div>
          </div>
        </div>

        {/* Technology Section */}
        <div className="technology-section">
          <h2 className="section-title">Technology Stack</h2>
          <div className="tech-stack-grid">
            <div className="tech-item">
              <div className="tech-icon frontend">
                <i className="bi bi-layers"></i>
              </div>
              <div className="tech-content">
                <h4 className="tech-name">Frontend</h4>
                <p className="tech-description">React 18, Modern CSS Grid, Design System Tokens</p>
              </div>
            </div>

            <div className="tech-item">
              <div className="tech-icon backend">
                <i className="bi bi-server"></i>
              </div>
              <div className="tech-content">
                <h4 className="tech-name">Backend</h4>
                <p className="tech-description">Flask REST API, Advanced Caching, Performance Optimization</p>
              </div>
            </div>

            <div className="tech-item">
              <div className="tech-icon visualization">
                <i className="bi bi-graph-up-arrow"></i>
              </div>
              <div className="tech-content">
                <h4 className="tech-name">Visualization</h4>
                <p className="tech-description">Plotly.js, Interactive Charts, Real-time Data Streaming</p>
              </div>
            </div>

            <div className="tech-item">
              <div className="tech-icon security">
                <i className="bi bi-shield-check"></i>
              </div>
              <div className="tech-content">
                <h4 className="tech-name">Security</h4>
                <p className="tech-description">Authentication, Protected Routes, Data Validation</p>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Section */}
        <div className="contact-section">
          <div className="contact-card">
            <div className="contact-header">
              <div className="contact-icon">
                <i className="bi bi-envelope"></i>
              </div>
              <h2 className="section-title">Get in Touch</h2>
            </div>
            <p className="contact-description">
              Have questions about the platform or need support? We're here to help you make the most of your 
              environmental monitoring data.
            </p>
            <div className="contact-actions">
              <button className="btn btn-primary shadow-interactive transition-all">
                <i className="bi bi-envelope" style={{ marginRight: '8px' }}></i>
                Contact Support
              </button>
              <button className="btn btn-outline-primary shadow-interactive transition-all">
                <i className="bi bi-book" style={{ marginRight: '8px' }}></i>
                Documentation
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModernAbout;
