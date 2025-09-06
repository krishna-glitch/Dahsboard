import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { useToast } from '../modern/toastUtils';

/**
 * Specialized Error Boundary for Data Loading Components
 * Provides granular error handling for components that fetch and display data
 */

class DataLoadingErrorBoundaryClass extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo
    });

    // Log error for monitoring
    console.error('DataLoadingErrorBoundary caught an error:', {
      error: error.toString(),
      componentStack: errorInfo.componentStack,
      component: this.props.componentName || 'Unknown Component',
      retryCount: this.state.retryCount
    });

    // Send error to monitoring service if available
    if (window.performanceMonitor?.reportError) {
      window.performanceMonitor.reportError('component_error', {
        component: this.props.componentName || 'DataLoadingComponent',
        error: error.toString(),
        stack: error.stack,
        retryCount: this.state.retryCount,
        timestamp: new Date().toISOString()
      });
    }
  }

  handleRetry = () => {
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1
    }));

    // Call custom retry function if provided
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  render() {
    if (this.state.hasError) {
      const { fallbackComponent: FallbackComponent, componentName, showErrorDetails } = this.props;
      const { error, retryCount } = this.state;

      // Use custom fallback if provided
      if (FallbackComponent) {
        return (
          <FallbackComponent
            error={error}
            retryCount={retryCount}
            onRetry={this.handleRetry}
            componentName={componentName}
          />
        );
      }

      // Default fallback UI
      return (
        <div className="error-boundary-container">
          <div className="error-boundary-content">
            <div className="error-icon">
              <i className="bi bi-exclamation-triangle-fill text-warning" style={{ fontSize: '2rem' }}></i>
            </div>
            <div className="error-details">
              <h4>Data Loading Error</h4>
              <p>
                {componentName ? `The ${componentName} component` : 'This component'} encountered an error while loading data.
              </p>
              {retryCount > 0 && (
                <small className="text-muted">
                  Retry attempts: {retryCount}
                </small>
              )}
              
              {showErrorDetails && error && (
                <details className="error-technical-details">
                  <summary>Technical Details</summary>
                  <pre>{error.toString()}</pre>
                </details>
              )}
              
              <div className="error-actions">
                <button 
                  className="btn btn-outline-primary btn-sm" 
                  onClick={this.handleRetry}
                  disabled={retryCount >= 3}
                >
                  <i className="bi bi-arrow-repeat me-1"></i>
                  {retryCount >= 3 ? 'Max retries reached' : 'Try Again'}
                </button>
                
                {this.props.onFallback && (
                  <button 
                    className="btn btn-outline-secondary btn-sm ms-2"
                    onClick={this.props.onFallback}
                  >
                    <i className="bi bi-arrow-left me-1"></i>
                    Go Back
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook-based wrapper for DataLoadingErrorBoundary to provide toast access
 */
export const DataLoadingErrorBoundary = (props) => {
  const toast = useToast();

  const handleError = (error, errorInfo) => {
    console.error('Data loading error:', error);
    console.debug('Error info:', errorInfo);
    // Show toast notification for user feedback
    toast.showError(
      `Failed to load ${props.componentName || 'component'} data`,
      {
        title: 'Data Loading Error',
        duration: 5000,
        actions: props.onRetry ? [{
          id: 'retry',
          label: 'Retry',
          action: props.onRetry
        }] : undefined
      }
    );
  };

  return (
    <DataLoadingErrorBoundaryClass
      {...props}
      onError={handleError}
    />
  );
};

DataLoadingErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  componentName: PropTypes.string,
  fallbackComponent: PropTypes.elementType,
  onRetry: PropTypes.func,
  onFallback: PropTypes.func,
  showErrorDetails: PropTypes.bool,
  onError: PropTypes.func
};

DataLoadingErrorBoundary.defaultProps = {
  showErrorDetails: false
};

export default DataLoadingErrorBoundary;