import React, { useEffect, useState, useCallback, useMemo } from 'react';
import MetricCard from '../components/modern/MetricCard';
import EmptyState from '../components/modern/EmptyState';
import Modal from '../components/modern/Modal';
import { getReportHistory, generateReport } from '../services/api';
import { useOptimizedStore } from '../store/simpleOptimizedStore';
import { useAdvancedMemo } from '../hooks/useOptimizedMemoization';

/**
 * Modern Reports Page - Report Generation and Management
 * Uses design system tokens and modern layout patterns
 */

const ModernReports = () => {
  // Use optimized store
  const { actions } = useOptimizedStore();

  // Local state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportHistory, setReportHistory] = useState([]);
  const [generationStatus, setGenerationStatus] = useState('');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [reportConfig, setReportConfig] = useState({
    report_type: 'daily_summary',
    start_date: '',
    end_date: '',
    sites: ['all'],
    format_type: 'pdf',
    options: ['detailed_charts']
  });

  // Memoized report processing
  const processedReports = useAdvancedMemo(() => {
    if (!Array.isArray(reportHistory) || reportHistory.length === 0) {
      return {
        reports: [],
        reportsByStatus: new Map(),
        reportsByType: new Map(),
        recentReports: []
      };
    }

    const reportsByStatus = new Map();
    const reportsByType = new Map();

    reportHistory.forEach(report => {
      // Group by status
      const status = report.status || 'unknown';
      if (!reportsByStatus.has(status)) {
        reportsByStatus.set(status, []);
      }
      reportsByStatus.get(status).push(report);

      // Group by type
      const type = report.report_type || 'unknown';
      if (!reportsByType.has(type)) {
        reportsByType.set(type, []);
      }
      reportsByType.get(type).push(report);
    });

    // Get recent reports (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentReports = reportHistory.filter(report => 
      new Date(report.created_at) >= sevenDaysAgo
    );

    return {
      reports: reportHistory,
      reportsByStatus,
      reportsByType,
      recentReports
    };
  }, [reportHistory], {
    cacheKey: 'reports-processing',
    ttl: 60000 // 1 minute cache
  });

  // Report statistics
  const reportStats = useMemo(() => new Map([
    ['total', processedReports.reports.length],
    ['completed', processedReports.reportsByStatus.get('completed')?.length || 0],
    ['pending', processedReports.reportsByStatus.get('pending')?.length || 0],
    ['failed', processedReports.reportsByStatus.get('failed')?.length || 0],
    ['recent', processedReports.recentReports.length]
  ]), [processedReports]);

  // Fetch report history
  const fetchReportHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await getReportHistory();
      
      if (data) {
        setReportHistory(Array.isArray(data) ? data : data.reports || []);
        actions.updateData(data, 'reports');
      }
    } catch (err) {
      console.error('Reports fetch error:', err);
      setError(`Failed to load reports: ${err.message}`);
      actions.setErrorState('reports', err.message);
    } finally {
      setLoading(false);
      actions.setLoadingState('reports', false);
    }
  }, [actions]);

  // Generate new report
  const handleGenerateReport = useCallback(async () => {
    try {
      setGenerationStatus('Generating report...');
      
      const response = await generateReport(reportConfig);
      setGenerationStatus(`Report generated successfully: ${response.message || 'Complete'}`);
      
      // Refresh history
      await fetchReportHistory();
      setShowGenerateModal(false);
      
      // Clear status after 3 seconds
      setTimeout(() => setGenerationStatus(''), 3000);
    } catch (err) {
      setGenerationStatus(`Error generating report: ${err.message}`);
      setTimeout(() => setGenerationStatus(''), 5000);
    }
  }, [reportConfig, fetchReportHistory]);

  // Effect for initial data loading
  useEffect(() => {
    fetchReportHistory();
  }, [fetchReportHistory]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return 'status-excellent';
      case 'pending':
        return 'status-warning';
      case 'failed':
        return 'status-poor';
      default:
        return 'status-unknown';
    }
  };

  if (loading) {
    return (
      <div className="modern-dashboard">
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">Report Management</h1>
            <p className="dashboard-subtitle">Generate and manage water quality reports</p>
          </div>
        </div>
        <div className="main-content">
          <EmptyState
            type="loading"
            title="Loading Reports"
            description="Fetching report history and statistics..."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="modern-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Report Management</h1>
          <p className="dashboard-subtitle">
            Generate and manage comprehensive water quality reports
          </p>
        </div>
        <div className="dashboard-actions">
          <button 
            onClick={() => setShowGenerateModal(true)}
            className="btn btn-primary shadow-interactive"
          >
            <i className="bi bi-plus-circle" style={{ marginRight: '8px' }}></i>
            Generate Report
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Status Messages */}
        {generationStatus && (
          <div className={`alert-message alert-${generationStatus.includes('Error') ? 'error' : 'success'}`}>
            <div className="alert-content">
              <i className={`bi bi-${generationStatus.includes('Error') ? 'exclamation-triangle' : 'check-circle'}`}></i>
              <span>{generationStatus}</span>
              <button onClick={() => setGenerationStatus('')} className="alert-dismiss">
                <i className="bi bi-x"></i>
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="alert-message alert-error">
            <div className="alert-content">
              <i className="bi bi-exclamation-triangle"></i>
              <span>{error}</span>
              <button onClick={() => setError(null)} className="alert-dismiss">
                <i className="bi bi-x"></i>
              </button>
            </div>
          </div>
        )}

        {/* Report Statistics */}
        <div className="section-header">
          <h2 className="section-title">
            <i className="bi bi-graph-up" style={{ marginRight: '12px' }}></i>
            Report Statistics
          </h2>
        </div>

        <div className="metrics-grid">
          <MetricCard
            title="Total Reports"
            value={reportStats.get('total')}
            icon="file-earmark-text"
            status="normal"
            context="All generated reports"
          />
          <MetricCard
            title="Completed"
            value={reportStats.get('completed')}
            icon="check-circle"
            status="excellent"
            context="Successfully generated"
          />
          <MetricCard
            title="Pending"
            value={reportStats.get('pending')}
            icon="clock"
            status="warning"
            context="Currently processing"
          />
          <MetricCard
            title="Failed"
            value={reportStats.get('failed')}
            icon="x-circle"
            status="poor"
            context="Generation failed"
          />
          <MetricCard
            title="Recent"
            value={reportStats.get('recent')}
            icon="calendar"
            status="good"
            context="Last 7 days"
          />
          <MetricCard
            title="Report Types"
            value={processedReports.reportsByType.size}
            icon="collection"
            status="normal"
            context="Different report types"
          />
        </div>

        {/* Report History */}
        <div className="section-header">
          <h2 className="section-title">
            <i className="bi bi-clock-history" style={{ marginRight: '12px' }}></i>
            Report History
          </h2>
        </div>

        {processedReports.reports.length > 0 ? (
          <div className="reports-table-container">
            <div className="table-wrapper">
              <table className="modern-table">
                <thead className="table-header">
                  <tr>
                    <th>Created</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Format</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {processedReports.reports.map((report, index) => (
                    <tr key={index} className="table-row">
                      <td className="table-cell">
                        <div className="cell-primary">
                          {new Date(report.created_at).toLocaleString()}
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="cell-primary">
                          {report.report_type?.replace('_', ' ')?.toUpperCase() || 'Unknown'}
                        </div>
                      </td>
                      <td className="table-cell">
                        <span className={`status-badge ${getStatusBadge(report.status)}`}>
                          {report.status}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="cell-primary">
                          {report.format_type?.toUpperCase() || 'N/A'}
                        </div>
                      </td>
                      <td className="table-cell">
                        {report.status === 'completed' && report.download_url ? (
                          <a 
                            href={report.download_url} 
                            className="btn btn-outline-primary btn-sm"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <i className="bi bi-download"></i>
                            Download
                          </a>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState
            type="empty"
            title="No Reports Generated"
            description="Generate your first report to get started with comprehensive data analysis."
            illustration={<i className="bi bi-file-earmark-text"></i>}
            action={
              <button 
                onClick={() => setShowGenerateModal(true)}
                className="btn btn-primary"
              >
                <i className="bi bi-plus-circle" style={{ marginRight: '8px' }}></i>
                Generate Report
              </button>
            }
          />
        )}

        {/* Generate Report Modal */}
        <Modal
          show={showGenerateModal}
          onClose={() => setShowGenerateModal(false)}
          title="Generate New Report"
          size="medium"
          variant="default"
          loading={generationStatus.includes('Generating')}
          footerActions={
            <>
              <button 
                onClick={() => setShowGenerateModal(false)}
                className="btn btn-outline-secondary"
                type="button"
              >
                Cancel
              </button>
              <button 
                onClick={handleGenerateReport}
                className="btn btn-primary"
                type="button"
                disabled={generationStatus.includes('Generating')}
              >
                <i className="bi bi-gear" aria-hidden="true"></i>
                {generationStatus.includes('Generating') ? 'Generating...' : 'Generate Report'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="report-type">Report Type</label>
              <select 
                id="report-type"
                className="form-input"
                value={reportConfig.report_type}
                onChange={(e) => setReportConfig(prev => ({ ...prev, report_type: e.target.value }))}
              >
                <option value="daily_summary">Daily Summary</option>
                <option value="weekly_summary">Weekly Summary</option>
                <option value="monthly_summary">Monthly Summary</option>
                <option value="site_comparison">Site Comparison</option>
                <option value="alert_summary">Alert Summary</option>
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label" htmlFor="report-format">Format</label>
              <select 
                id="report-format"
                className="form-input"
                value={reportConfig.format_type}
                onChange={(e) => setReportConfig(prev => ({ ...prev, format_type: e.target.value }))}
              >
                <option value="pdf">PDF</option>
                <option value="excel">Excel</option>
                <option value="csv">CSV</option>
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label" htmlFor="start-date">Start Date</label>
              <input 
                id="start-date"
                type="date" 
                className="form-input"
                value={reportConfig.start_date}
                onChange={(e) => setReportConfig(prev => ({ ...prev, start_date: e.target.value }))}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label" htmlFor="end-date">End Date</label>
              <input 
                id="end-date"
                type="date" 
                className="form-input"
                value={reportConfig.end_date}
                onChange={(e) => setReportConfig(prev => ({ ...prev, end_date: e.target.value }))}
              />
            </div>
          </div>
          
          {generationStatus && !generationStatus.includes('Generating') && (
            <div className={`status-message ${generationStatus.includes('Error') ? 'error' : 'success'}`}>
              <i className={`bi ${generationStatus.includes('Error') ? 'bi-exclamation-triangle' : 'bi-check-circle'}`} aria-hidden="true"></i>
              {generationStatus}
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
};

export default ModernReports;