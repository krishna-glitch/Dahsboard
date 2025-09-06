import React, { Component } from 'react';
import PropTypes from 'prop-types';

/**
 * Specialized Error Boundary for Chart Components
 * Handles Plotly.js rendering errors and provides chart-specific fallbacks
 */
class ChartErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      renderingFailed: false
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
      renderingFailed: error.message?.includes('Plotly') || error.stack?.includes('plotly')
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ChartErrorBoundary caught an error:', {
      error: error.toString(),
      isPlotlyError: error.message?.includes('Plotly'),
      component: this.props.chartType || 'Chart',
      dataLength: this.props.dataLength || 0,
      componentStack: errorInfo.componentStack
    });

    // Report chart-specific error metrics
    if (window.performanceMonitor?.reportError) {
      window.performanceMonitor.reportError('chart_error', {
        chartType: this.props.chartType,
        dataLength: this.props.dataLength,
        error: error.toString(),
        isRenderingError: this.state.renderingFailed,
        timestamp: new Date().toISOString()
      });
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      renderingFailed: false
    });

    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  render() {
    if (this.state.hasError) {
      const { chartType, title, dataLength, showDataTable } = this.props;
      const { error, renderingFailed } = this.state;

      return (
        <div className="chart-error-boundary">
          <div className="chart-error-container">
            <div className="chart-error-header">
              <i className="bi bi-bar-chart text-muted me-2" style={{ fontSize: '1.5rem' }}></i>
              <div>
                <h5 className="mb-1">Chart Rendering Error</h5>
                <p className="text-muted mb-0">
                  {title ? `Unable to render ${title}` : `Unable to render ${chartType || 'chart'}`}
                </p>
              </div>
            </div>
            
            <div className="chart-error-content">
              {renderingFailed ? (
                <div className="alert alert-warning">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  Chart rendering failed. This may be due to invalid data format or Plotly.js issues.
                </div>
              ) : (
                <div className="alert alert-danger">
                  <i className="bi bi-bug me-2"></i>
                  An unexpected error occurred while rendering the chart.
                </div>
              )}

              {dataLength !== undefined && (
                <div className="chart-error-stats">
                  <small className="text-muted">
                    Data points: {dataLength} | Chart type: {chartType || 'Unknown'}
                  </small>
                </div>
              )}

              <div className="chart-error-actions">
                <button 
                  className="btn btn-primary btn-sm me-2"
                  onClick={this.handleRetry}
                >
                  <i className="bi bi-arrow-repeat me-1"></i>
                  Retry Chart
                </button>

                {showDataTable && this.props.onShowDataTable && (
                  <button 
                    className="btn btn-outline-secondary btn-sm me-2"
                    onClick={this.props.onShowDataTable}
                  >
                    <i className="bi bi-table me-1"></i>
                    View Data Table
                  </button>
                )}

                {this.props.onDownloadData && (
                  <button 
                    className="btn btn-outline-success btn-sm"
                    onClick={this.props.onDownloadData}
                  >
                    <i className="bi bi-download me-1"></i>
                    Download Data
                  </button>
                )}
              </div>

              {import.meta.env.DEV && (
                <details className="chart-error-debug mt-3">
                  <summary>Debug Information</summary>
                  <pre className="small text-muted mt-2">
                    {error?.toString()}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ChartErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  chartType: PropTypes.string,
  title: PropTypes.string,
  dataLength: PropTypes.number,
  showDataTable: PropTypes.bool,
  onRetry: PropTypes.func,
  onShowDataTable: PropTypes.func,
  onDownloadData: PropTypes.func
};

ChartErrorBoundary.defaultProps = {
  showDataTable: true
};

export default ChartErrorBoundary;