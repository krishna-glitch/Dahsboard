import React, { useEffect, useState } from 'react';
import RoleGate from '../components/auth/RoleGate';
import MetricCard from '../components/modern/MetricCard';
import EmptyState from '../components/modern/EmptyState';
import { runDataDiagnostics } from '../services/api';

/**
 * Modern Data Diagnostics Page - System Data Quality Analysis
 * Uses design system tokens and modern layout patterns
 */

const ModernDataDiagnostics = () => {
  const [diagnosticResults, setDiagnosticResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRunTime, setLastRunTime] = useState(null);

  const handleRunDiagnostic = async () => {
    setLoading(true);
    setError(null);
    setDiagnosticResults(null);
    
    try {
      const data = await runDataDiagnostics();
      setDiagnosticResults(data);
      setLastRunTime(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-run diagnostic on component mount
  useEffect(() => {
    handleRunDiagnostic();
  }, []);

  // Get diagnostic summary statistics
  const getDiagnosticStats = () => {
    if (!diagnosticResults?.summary) {
      return {
        totalTests: 0,
        successfulTests: 0,
        warningTests: 0,
        failedTests: 0,
        overallStatus: 'unknown'
      };
    }

    const summary = diagnosticResults.summary;
    const totalTests = summary.length;
    const successfulTests = summary.filter(test => test.status === 'SUCCESS').length;
    const warningTests = summary.filter(test => test.status === 'WARNING').length;
    const failedTests = summary.filter(test => test.status === 'ERROR' || test.status === 'FAILED').length;

    let overallStatus = 'excellent';
    if (failedTests > 0) {
      overallStatus = 'poor';
    } else if (warningTests > 0) {
      overallStatus = 'warning';
    } else if (successfulTests === totalTests && totalTests > 0) {
      overallStatus = 'excellent';
    } else {
      overallStatus = 'unknown';
    }

    return {
      totalTests,
      successfulTests,
      warningTests,
      failedTests,
      overallStatus
    };
  };

  const stats = getDiagnosticStats();

  const getTestStatusClass = (status) => {
    switch (status) {
      case 'SUCCESS':
        return 'diagnostic-success';
      case 'WARNING':
        return 'diagnostic-warning';
      case 'ERROR':
      case 'FAILED':
        return 'diagnostic-error';
      default:
        return 'diagnostic-unknown';
    }
  };

  const getTestIcon = (status) => {
    switch (status) {
      case 'SUCCESS':
        return 'check-circle-fill';
      case 'WARNING':
        return 'exclamation-triangle-fill';
      case 'ERROR':
      case 'FAILED':
        return 'x-circle-fill';
      default:
        return 'question-circle-fill';
    }
  };

  const formatDetailKey = (key) => {
    return key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  };

  const formatDetailValue = (value) => {
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return value?.toString() || 'N/A';
  };

  const content = (
    <div className="modern-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Data Diagnostics</h1>
          <p className="dashboard-subtitle">
            System data quality analysis and troubleshooting tools
          </p>
        </div>
        <div className="dashboard-actions">
          <button 
            onClick={handleRunDiagnostic}
            disabled={loading}
            className={`btn ${loading ? 'btn-outline-secondary' : 'btn-primary'} shadow-interactive`}
          >
            {loading ? (
              <>
                <i className="bi bi-arrow-repeat spin" style={{ marginRight: '8px' }}></i>
                Running Diagnostic...
              </>
            ) : (
              <>
                <i className="bi bi-play-circle" style={{ marginRight: '8px' }}></i>
                Run Diagnostic
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Diagnostic Statistics */}
        <div className="metrics-grid">
          <MetricCard
            title="Total Tests"
            value={stats.totalTests.toString()}
            icon="clipboard-check"
            status={stats.totalTests > 0 ? "good" : "unknown"}
            context="Diagnostic tests run"
          />
          <MetricCard
            title="Successful"
            value={stats.successfulTests.toString()}
            icon="check-circle"
            status="excellent"
            context="Tests passed"
          />
          <MetricCard
            title="Warnings"
            value={stats.warningTests.toString()}
            icon="exclamation-triangle"
            status={stats.warningTests > 0 ? "warning" : "good"}
            context="Tests with warnings"
          />
          <MetricCard
            title="Failed"
            value={stats.failedTests.toString()}
            icon="x-circle"
            status={stats.failedTests > 0 ? "poor" : "good"}
            context="Tests failed"
          />
        </div>

        {/* Last Run Information */}
        {lastRunTime && (
          <div className="diagnostic-info">
            <div className="diagnostic-info-card">
              <div className="diagnostic-info-icon">
                <i className="bi bi-clock"></i>
              </div>
              <div className="diagnostic-info-content">
                <span className="diagnostic-info-label">Last run:</span>
                <span className="diagnostic-info-value">{lastRunTime.toLocaleString()}</span>
              </div>
              <div className={`diagnostic-info-status status-${stats.overallStatus}`}>
                <div className="status-indicator"></div>
                <span className="status-text">
                  {stats.overallStatus === 'excellent' ? 'All Systems Normal' :
                   stats.overallStatus === 'warning' ? 'Minor Issues' :
                   stats.overallStatus === 'poor' ? 'Critical Issues' : 'Unknown Status'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="diagnostic-error-container">
            <EmptyState
              type="error"
              title="Diagnostic Failed"
              description={error}
              illustration={<i className="bi bi-exclamation-triangle"></i>}
            />
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="diagnostic-loading-container">
            <EmptyState
              type="loading"
              title="Running Diagnostics"
              description="Analyzing system data quality and connectivity..."
            />
          </div>
        )}

        {/* Diagnostic Results */}
        {diagnosticResults && diagnosticResults.summary && (
          <div className="diagnostic-results-container">
            <div className="section-header">
              <h2 className="section-title">
                <i className="bi bi-clipboard-check" style={{ marginRight: '12px' }}></i>
                Diagnostic Results
              </h2>
            </div>

            <div className="diagnostic-tests-grid">
              {diagnosticResults.summary.map((test, index) => (
                <div key={index} className={`diagnostic-test-card ${getTestStatusClass(test.status)}`}>
                  <div className="diagnostic-test-header">
                    <div className="diagnostic-test-icon">
                      <i className={`bi bi-${getTestIcon(test.status)}`}></i>
                    </div>
                    <div className="diagnostic-test-info">
                      <h3 className="diagnostic-test-name">{test.test}</h3>
                      <span className="diagnostic-test-status">{test.status}</span>
                    </div>
                  </div>

                  <div className="diagnostic-test-body">
                    <p className="diagnostic-test-message">{test.message}</p>

                    {test.details && Object.keys(test.details).length > 0 && (
                      <div className="diagnostic-test-details">
                        <h4 className="diagnostic-details-title">Details:</h4>
                        <div className="diagnostic-details-list">
                          {Object.entries(test.details).map(([key, value]) => (
                            <div key={key} className="diagnostic-detail-item">
                              <span className="diagnostic-detail-key">
                                {formatDetailKey(key)}:
                              </span>
                              <span className="diagnostic-detail-value">
                                {formatDetailValue(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Results State */}
        {!loading && !error && !diagnosticResults && (
          <div className="diagnostic-empty-container">
            <EmptyState
              type="no-data"
              title="No Diagnostic Results"
              description="Click 'Run Diagnostic' to analyze your system data quality."
              illustration={<i className="bi bi-clipboard-check"></i>}
            />
          </div>
        )}

        {/* Help Information */}
        <div className="diagnostic-help-section">
          <div className="section-header">
            <h2 className="section-title">
              <i className="bi bi-question-circle" style={{ marginRight: '12px' }}></i>
              About Data Diagnostics
            </h2>
          </div>

          <div className="help-content">
            <div className="help-card">
              <div className="help-icon">
                <i className="bi bi-info-circle"></i>
              </div>
              <div className="help-text">
                <h3>What This Tool Does</h3>
                <p>
                  Data Diagnostics analyzes your system's data loading status, connectivity, 
                  and data integrity to help identify and troubleshoot potential issues before 
                  they affect your analysis.
                </p>
              </div>
            </div>

            <div className="help-card">
              <div className="help-icon">
                <i className="bi bi-lightbulb"></i>
              </div>
              <div className="help-text">
                <h3>How to Interpret Results</h3>
                <ul>
                  <li><strong>SUCCESS:</strong> All tests passed, system is operating normally</li>
                  <li><strong>WARNING:</strong> Minor issues detected, monitor closely</li>
                  <li><strong>ERROR/FAILED:</strong> Critical issues require immediate attention</li>
                </ul>
              </div>
            </div>

            <div className="help-card">
              <div className="help-icon">
                <i className="bi bi-arrow-repeat"></i>
              </div>
              <div className="help-text">
                <h3>Regular Monitoring</h3>
                <p>
                  Run diagnostics regularly or whenever you encounter data loading issues. 
                  The system automatically runs diagnostics when this page loads.
                </p>
              </div>
            </div>
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

export default ModernDataDiagnostics;
