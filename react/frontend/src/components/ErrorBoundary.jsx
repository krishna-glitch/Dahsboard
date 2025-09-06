import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="modern-dashboard">
          <div className="main-content">
            <div className="alert-message alert-error">
              <div className="alert-content">
                <i className="bi bi-exclamation-triangle"></i>
                <div>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1em' }}>Something went wrong!</h3>
                  <p style={{ margin: '0' }}>
                    An error occurred while rendering this component. Please try refreshing the page.
                  </p>
                  {this.props.showError && (
                    <details style={{ marginTop: '12px' }}>
                      <summary>Error details</summary>
                      <pre style={{ marginTop: '8px', fontSize: '0.8em' }}>{this.state.error?.toString()}</pre>
                    </details>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;