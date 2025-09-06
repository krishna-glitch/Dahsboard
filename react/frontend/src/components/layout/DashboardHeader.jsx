import React from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../../contexts/authUtils';
import './DashboardHeader.css';

/**
 * Dashboard Header Component
 * Semantic HTML5 header with navigation and user controls
 */
export const DashboardHeader = ({ 
  title = "Water Quality Monitoring", 
  description,
  actions 
}) => {
  const { user, logout } = useAuth();

  return (
    <header className="header-container">
      {/* Skip Link for Accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      
      <div className="header-content">
        {/* Brand Section */}
        <div className="header-brand">
          <h1 className="brand-title">
            <span className="brand-logo" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" role="img">
                <path d="M12 2C12 2 5 9.163 5 13.5C5 17.09 7.91 20 11.5 20C15.09 20 18 17.09 18 13.5C18 9.163 12 2 12 2Z" fill="url(#g)"/>
                <defs>
                  <linearGradient id="g" x1="5" y1="2" x2="19" y2="22" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#4A69F7"/>
                    <stop offset="1" stopColor="#3148F6"/>
                  </linearGradient>
                </defs>
              </svg>
            </span>
            {title || 'Water Quality Dashboard'}
          </h1>
          {description && (
            <p className="brand-description">{description}</p>
          )}
        </div>

        {/* Navigation */}
        <nav className="header-nav" role="navigation" aria-label="Main navigation">
          <ul className="nav-list">
            <li className="nav-item">
              <a href="/dashboard" className="nav-link" aria-current="page">
                <span className="nav-icon">📊</span>
                Dashboard
              </a>
            </li>
            <li className="nav-item">
              <a href="/water-quality" className="nav-link">
                <span className="nav-icon">💧</span>
                Water Quality
              </a>
            </li>
            <li className="nav-item">
              <a href="/site-comparison" className="nav-link">
                <span className="nav-icon">🔄</span>
                Site Comparison
              </a>
            </li>
            <li className="nav-item">
              <a href="/redox-analysis" className="nav-link">
                <span className="nav-icon">⚗️</span>
                Redox Analysis
              </a>
            </li>
            <li className="nav-item">
              <a href="/alerts" className="nav-link">
                <span className="nav-icon">🚨</span>
                Alerts
              </a>
            </li>
          </ul>
        </nav>

        {/* Actions Section */}
        <div className="header-actions">
          {actions}
          
          {/* User Profile */}
          {user && (
            <div className="user-profile" role="group" aria-label="User account">
              <div className="user-info">
                <span className="user-name">{user.username || 'User'}</span>
                <span className="user-role">Analyst</span>
              </div>
              <button 
                className="logout-btn"
                onClick={logout}
                aria-label="Sign out"
              >
                <span className="logout-icon">🚪</span>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

DashboardHeader.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  actions: PropTypes.node
};

export default DashboardHeader;
