import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
     
    console.error('[ErrorBoundary] Chart error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '1rem', border: '1px solid #f8d7da', borderRadius: 8, background: '#f8d7da22', color: '#842029' }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Chart failed to render</div>
          <div style={{ fontSize: 12 }}>Try adjusting filters or refresh the page.</div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

