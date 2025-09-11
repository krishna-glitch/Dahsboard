import React, { useState } from 'react';
import DataLoadingErrorBoundary from './boundaries/DataLoadingErrorBoundary';
import ChartErrorBoundary from './boundaries/ChartErrorBoundary';
import Plot from './PlotlyLite';

/**
 * Error Boundary Test Component
 * Used for testing error boundary functionality in development
 */
const ErrorBoundaryTester = () => {
  const [triggerError, setTriggerError] = useState(false);
  const [errorType, setErrorType] = useState('component');
  const [chartError, setChartError] = useState(false);

  const ComponentThatErrors = () => {
    if (triggerError && errorType === 'component') {
      throw new Error('Test component error - this is intentional for testing error boundaries');
    }
    return <div>Component rendered successfully</div>;
  };

  const ChartComponentThatErrors = () => {
    if (chartError) {
      // Simulate a Plotly error
      const badData = null;
      return (
        <Plot
          data={badData.map(d => d)} // This will throw an error
          layout={{ title: 'Test Chart' }}
        />
      );
    }
    
    return (
      <Plot
        data={[{
          x: [1, 2, 3, 4],
          y: [10, 11, 12, 13],
          type: 'scatter',
          mode: 'lines+markers',
          name: 'Test Data'
        }]}
        layout={{ 
          title: 'Working Test Chart',
          height: 300
        }}
        style={{ width: '100%' }}
      />
    );
  };

  const ApiSimulator = () => {
    if (triggerError && errorType === 'api') {
      // Simulate API error
      throw new Error('Test API error - simulating network failure');
    }
    return (
      <div>
        <h4>Simulated API Data</h4>
        <p>This component would normally fetch and display API data</p>
      </div>
    );
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h2>Error Boundary Testing Interface</h2>
      <p className="text-muted mb-4">
        This component is used to test error boundary functionality. Use only in development.
      </p>

      {/* Test Controls */}
      <div className="card mb-4">
        <div className="card-header">
          <h5>Error Boundary Test Controls</h5>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-6">
              <div className="form-group mb-3">
                <label className="form-label">Error Type:</label>
                <select 
                  className="form-select"
                  value={errorType}
                  onChange={(e) => setErrorType(e.target.value)}
                >
                  <option value="component">Component Error</option>
                  <option value="api">API/Data Error</option>
                </select>
              </div>
            </div>
            <div className="col-md-6">
              <div className="form-group mb-3">
                <label className="form-label">Actions:</label>
                <div className="btn-group d-block">
                  <button
                    className="btn btn-danger me-2"
                    onClick={() => setTriggerError(true)}
                  >
                    Trigger Component Error
                  </button>
                  <button
                    className="btn btn-warning me-2"
                    onClick={() => setChartError(true)}
                  >
                    Trigger Chart Error
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={() => {
                      setTriggerError(false);
                      setChartError(false);
                    }}
                  >
                    Reset All
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Component Error Testing */}
      <div className="card mb-4">
        <div className="card-header">
          <h5>Data Loading Error Boundary Test</h5>
        </div>
        <div className="card-body">
          <DataLoadingErrorBoundary
            componentName="ErrorBoundaryTester"
            onRetry={() => {
              setTriggerError(false);
              console.log('Retry triggered for DataLoadingErrorBoundary');
            }}
            showErrorDetails={true}
          >
            {errorType === 'component' ? <ComponentThatErrors /> : <ApiSimulator />}
          </DataLoadingErrorBoundary>
        </div>
      </div>

      {/* Chart Error Testing */}
      <div className="card mb-4">
        <div className="card-header">
          <h5>Chart Error Boundary Test</h5>
        </div>
        <div className="card-body">
          <ChartErrorBoundary
            chartType="test-chart"
            title="Error Boundary Test Chart"
            dataLength={4}
            onRetry={() => {
              setChartError(false);
              console.log('Retry triggered for ChartErrorBoundary');
            }}
            onShowDataTable={() => {
              console.log('Show data table triggered');
            }}
            onDownloadData={() => {
              console.log('Download data triggered');
            }}
          >
            <ChartComponentThatErrors />
          </ChartErrorBoundary>
        </div>
      </div>

      {/* Test Results */}
      <div className="card">
        <div className="card-header">
          <h5>Test Results & Status</h5>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-6">
              <h6>Component Error Status:</h6>
              <span className={`badge ${triggerError && errorType === 'component' ? 'bg-danger' : 'bg-success'}`}>
                {triggerError && errorType === 'component' ? 'Error Active' : 'Normal'}
              </span>
            </div>
            <div className="col-md-6">
              <h6>Chart Error Status:</h6>
              <span className={`badge ${chartError ? 'bg-danger' : 'bg-success'}`}>
                {chartError ? 'Error Active' : 'Normal'}
              </span>
            </div>
          </div>
          <div className="mt-3">
            <small className="text-muted">
              Check browser console for error boundary logs and performance monitoring data.
            </small>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ErrorBoundaryTester;
