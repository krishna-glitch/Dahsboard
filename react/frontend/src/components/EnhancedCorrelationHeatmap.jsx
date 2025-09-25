import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ProgressivePlot from './modern/ProgressivePlot';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Badge from 'react-bootstrap/Badge';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';
import { useToast } from './modern/toastUtils';

const EnhancedCorrelationHeatmap = ({ 
  data = [], 
  onAnalysisUpdate = () => {},
  loading = false
}) => {
  const [correlationData, setCorrelationData] = useState(null);
  const [analysisConfig, setAnalysisConfig] = useState({
    method: 'pearson',
    correlation_threshold: 0.3,
    significance_threshold: 0.05,
    smooth_data: true,
    window_size_hours: null,
    max_lag_hours: 24
  });
  const [activeAnalysis, setActiveAnalysis] = useState('matrix');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const toast = useToast();

  // Analysis request state to prevent overlapping analysis
  const analysisRequestRef = useRef({
    isActive: false,
    analysisType: null,
    requestId: null
  });

  // Process data for correlation analysis
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    return data.map(row => ({
      measurement_timestamp: row.measurement_timestamp,
      temperature: row.temperature || null,
      dissolved_oxygen: row.dissolved_oxygen || null,
      turbidity: row.turbidity || null,
      conductivity: row.conductivity || null,
      redox_potential: row.redox_potential || null,
      nitrate: row.nitrate || null,
      phosphate: row.phosphate || null
    }));
  }, [data]);

  // Perform correlation analysis with race condition protection
  const performAnalysis = useCallback(async (analysisType = 'enhanced') => {
    if (!processedData.length) {
      toast.showError('No data available for correlation analysis');
      return;
    }

    // Prevent concurrent analysis requests
    if (analysisRequestRef.current.isActive) {
      console.log(`🛡️ Preventing concurrent ${analysisType} analysis request`);
      toast.showWarning(`${analysisType} analysis already in progress`, {
        title: 'Analysis In Progress'
      });
      return;
    }
    
    const requestId = Date.now() + Math.random();
    analysisRequestRef.current = {
      isActive: true,
      analysisType,
      requestId
    };

    setAnalysisLoading(true);
    const loadingToastId = toast.showLoading(`Performing ${analysisType} correlation analysis...`);

    try {
      let endpoint = '/api/v1/correlation_analysis/enhanced';
      let payload = {
        df: processedData,
        ...analysisConfig
      };

      if (analysisType === 'lag') {
        endpoint = '/api/v1/correlation_analysis/lag-analysis';
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
      }

      const result = await response.json();
      setCorrelationData(result);
      onAnalysisUpdate(result);
      
      toast.updateToast(loadingToastId, 'success', 
        `✅ ${analysisType} correlation analysis completed: ${result.significant_correlations?.length || 0} significant correlations found`
      );

    } catch (error) {
      console.error('Correlation analysis error:', error);
      toast.updateToast(loadingToastId, 'error', 
        `❌ Analysis failed: ${error.message}`
      );
    } finally {
      setAnalysisLoading(false);
      // Always cleanup analysis request state
      analysisRequestRef.current = {
        isActive: false,
        analysisType: null,
        requestId: null
      };
    }
  }, [processedData, analysisConfig, onAnalysisUpdate, toast]);

  // Auto-perform analysis when data changes
  useEffect(() => {
    if (processedData.length > 0 && !loading) {
      performAnalysis('enhanced');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedData.length, loading]);

  // Create correlation heatmap
  const createCorrelationHeatmap = () => {
    if (!correlationData?.correlation_matrix) return null;

    const matrix = correlationData.correlation_matrix;
    const parameters = Object.keys(matrix);
    const values = parameters.map(param1 => 
      parameters.map(param2 => matrix[param1][param2] || 0)
    );

    return (
      <ProgressivePlot
        data={[{
          z: values,
          x: parameters,
          y: parameters,
          type: 'heatmap',
          colorscale: 'RdBu',
          zmid: 0,
          zmin: -1,
          zmax: 1,
          hoverongaps: false,
          hovertemplate: 
            '<b>%{y}</b> vs <b>%{x}</b><br>' +
            'Correlation: %{z:.3f}<br>' +
            '<extra></extra>',
          colorbar: {
            title: 'Correlation Coefficient',
            titleside: 'right'
          }
        }]}
        layout={{
          title: 'Enhanced Correlation Matrix',
          xaxis: { 
            title: 'Parameters',
            tickangle: 45,
            side: 'bottom'
          },
          yaxis: { 
            title: 'Parameters',
            tickangle: 0
          },
          width: 600,
          height: 500,
          margin: { l: 120, r: 60, t: 60, b: 120 },
          font: { size: 10 }
        }}
        config={{
          displayModeBar: true,
          displaylogo: false,
          modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d']
        }}
        progressiveThreshold={200}
        batchSize={50}
        loadingDelay={60}
        onLoadingStart={() => console.log('CorrelationHeatmap: Progressive loading started')}
        onLoadingComplete={(totalPoints) => console.log(`CorrelationHeatmap: Progressive loading complete (${totalPoints} points)`)}
      />
    );
  };

  // Create time series correlation chart
  const createTimeSeriesCorrelation = () => {
    if (!correlationData?.time_series_correlations) return null;

    const timeSeriesData = correlationData.time_series_correlations;
    if (!timeSeriesData.length) return null;

    // Group by parameter pairs
    const parameterPairs = {};
    timeSeriesData.forEach(point => {
      const pairKey = `${point.parameter1} vs ${point.parameter2}`;
      if (!parameterPairs[pairKey]) {
        parameterPairs[pairKey] = { x: [], y: [], name: pairKey };
      }
      parameterPairs[pairKey].x.push(point.timestamp);
      parameterPairs[pairKey].y.push(point.correlation);
    });

    const traces = Object.values(parameterPairs).map(pair => ({
      ...pair,
      type: 'scatter',
      mode: 'lines+markers',
      hovertemplate: 
        '<b>%{fullData.name}</b><br>' +
        'Time: %{x}<br>' +
        'Correlation: %{y:.3f}<br>' +
        '<extra></extra>'
    }));

    return (
      <ProgressivePlot
        data={traces}
        layout={{
          title: 'Time-Windowed Correlations',
          xaxis: { 
            title: 'Time',
            type: 'date'
          },
          yaxis: { 
            title: 'Correlation Coefficient',
            range: [-1, 1]
          },
          width: 800,
          height: 400,
          showlegend: true,
          legend: { x: 1, y: 1 }
        }}
        config={{
          displayModeBar: true,
          displaylogo: false
        }}
        progressiveThreshold={600}
        batchSize={120}
        loadingDelay={90}
        onLoadingStart={() => console.log('TimeCorrelation: Progressive loading started')}
        onLoadingComplete={(totalPoints) => console.log(`TimeCorrelation: Progressive loading complete (${totalPoints} points)`)}
      />
    );
  };

  // Render significant correlations table
  const renderSignificantCorrelations = () => {
    const significantCorrs = correlationData?.significant_correlations || [];
    
    if (!significantCorrs.length) {
      return <Alert variant="info">No significant correlations found above the threshold.</Alert>;
    }

    return (
      <div className="table-responsive">
        <table className="table table-sm table-hover">
          <thead>
            <tr>
              <th>Parameter Pair</th>
              <th>Correlation</th>
              <th>Strength</th>
              <th>Direction</th>
              <th>P-value</th>
              <th>Sample Size</th>
            </tr>
          </thead>
          <tbody>
            {significantCorrs.map((corr, idx) => (
              <tr key={idx}>
                <td>
                  <strong>{corr.parameter1}</strong> × <strong>{corr.parameter2}</strong>
                </td>
                <td>
                  <Badge bg={Math.abs(corr.correlation) > 0.7 ? 'success' : 'warning'}>
                    {corr.correlation.toFixed(3)}
                  </Badge>
                </td>
                <td>
                  <Badge bg={
                    corr.strength === 'Very Strong' ? 'danger' :
                    corr.strength === 'Strong' ? 'warning' : 'secondary'
                  }>
                    {corr.strength}
                  </Badge>
                </td>
                <td>
                  <Badge bg={corr.direction === 'Positive' ? 'success' : 'danger'}>
                    {corr.direction}
                  </Badge>
                </td>
                <td>{corr.p_value.toExponential(2)}</td>
                <td>{corr.sample_size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Render insights
  const renderInsights = () => {
    const insights = correlationData?.insights || [];
    
    if (!insights.length) return null;

    return (
      <Alert variant="info">
        <h6>📊 Analysis Insights:</h6>
        <ul className="mb-0">
          {insights.map((insight, idx) => (
            <li key={idx}>{insight}</li>
          ))}
        </ul>
      </Alert>
    );
  };

  // Render lag correlation results
  const renderLagCorrelations = () => {
    const lagCorrs = correlationData?.lag_correlations || {};
    
    if (!Object.keys(lagCorrs).length) {
      return <Alert variant="info">No lag correlations analyzed yet.</Alert>;
    }

    return (
      <div>
        {Object.entries(lagCorrs).map(([pairKey, lagData]) => (
          <Card key={pairKey} className="mb-3">
            <Card.Body>
              <Card.Title>{lagData.parameter1} × {lagData.parameter2}</Card.Title>
              <Row>
                <Col md={6}>
                  <p><strong>Best Lag:</strong> {lagData.best_lag_hours} hours</p>
                  <p><strong>Best Correlation:</strong> 
                    <Badge bg={Math.abs(lagData.best_correlation) > 0.5 ? 'success' : 'warning'} className="ms-1">
                      {lagData.best_correlation.toFixed(3)}
                    </Badge>
                  </p>
                </Col>
                <Col md={6}>
                  <p className="text-muted">{lagData.interpretation}</p>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <Card.Body className="text-center">
          <Spinner animation="border" />
          <p className="mt-2">Loading correlation analysis...</p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <div>
      {/* Analysis Configuration */}
      <Card className="mb-3">
        <Card.Body>
          <Row>
            <Col md={3}>
              <Form.Group>
                <Form.Label>Method</Form.Label>
                <Form.Select
                  value={analysisConfig.method}
                  onChange={(e) => setAnalysisConfig({...analysisConfig, method: e.target.value})}
                >
                  <option value="pearson">Pearson</option>
                  <option value="spearman">Spearman</option>
                  <option value="kendall">Kendall</option>
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group>
                <Form.Label>Correlation Threshold</Form.Label>
                <Form.Range
                  min="0.1"
                  max="0.8"
                  step="0.1"
                  value={analysisConfig.correlation_threshold}
                  onChange={(e) => setAnalysisConfig({...analysisConfig, correlation_threshold: parseFloat(e.target.value)})}
                />
                <small className="text-muted">{analysisConfig.correlation_threshold}</small>
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group>
                <Form.Label>Window Size (hours)</Form.Label>
                <Form.Control
                  type="number"
                  value={analysisConfig.window_size_hours || ''}
                  onChange={(e) => setAnalysisConfig({...analysisConfig, window_size_hours: e.target.value ? parseInt(e.target.value) : null})}
                  placeholder="Auto"
                />
              </Form.Group>
            </Col>
            <Col md={3} className="d-flex align-items-end">
              <Button 
                variant="primary" 
                onClick={() => performAnalysis('enhanced')}
                disabled={analysisLoading || !processedData.length}
                className="me-2"
              >
                {analysisLoading ? <Spinner animation="border" size="sm" /> : 'Analyze'}
              </Button>
              <Button 
                variant="outline-primary" 
                onClick={() => performAnalysis('lag')}
                disabled={analysisLoading || !processedData.length}
              >
                Lag Analysis
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Analysis Results */}
      {correlationData && (
        <>
          {/* Analysis Tabs */}
          <Card className="mb-3">
            <Card.Header>
              <div className="btn-group" role="group">
                <input
                  type="radio"
                  className="btn-check"
                  name="analysisType"
                  id="matrix"
                  checked={activeAnalysis === 'matrix'}
                  onChange={() => setActiveAnalysis('matrix')}
                />
                <label className="btn btn-outline-primary" htmlFor="matrix">
                  Correlation Matrix
                </label>

                <input
                  type="radio"
                  className="btn-check"
                  name="analysisType"
                  id="significant"
                  checked={activeAnalysis === 'significant'}
                  onChange={() => setActiveAnalysis('significant')}
                />
                <label className="btn btn-outline-primary" htmlFor="significant">
                  Significant Correlations ({correlationData.significant_correlations?.length || 0})
                </label>

                {correlationData.time_series_correlations && (
                  <>
                    <input
                      type="radio"
                      className="btn-check"
                      name="analysisType"
                      id="timeseries"
                      checked={activeAnalysis === 'timeseries'}
                      onChange={() => setActiveAnalysis('timeseries')}
                    />
                    <label className="btn btn-outline-primary" htmlFor="timeseries">
                      Time Series
                    </label>
                  </>
                )}

                {correlationData.lag_correlations && (
                  <>
                    <input
                      type="radio"
                      className="btn-check"
                      name="analysisType"
                      id="lag"
                      checked={activeAnalysis === 'lag'}
                      onChange={() => setActiveAnalysis('lag')}
                    />
                    <label className="btn btn-outline-primary" htmlFor="lag">
                      Lag Analysis ({Object.keys(correlationData.lag_correlations).length})
                    </label>
                  </>
                )}
              </div>
            </Card.Header>

            <Card.Body>
              {activeAnalysis === 'matrix' && (
                <div className="text-center">
                  {createCorrelationHeatmap()}
                </div>
              )}

              {activeAnalysis === 'significant' && renderSignificantCorrelations()}

              {activeAnalysis === 'timeseries' && (
                <div className="text-center">
                  {createTimeSeriesCorrelation()}
                </div>
              )}

              {activeAnalysis === 'lag' && renderLagCorrelations()}
            </Card.Body>
          </Card>

          {/* Insights */}
          {renderInsights()}

          {/* Metadata */}
          {correlationData.metadata && (
            <Card>
              <Card.Body>
                <h6>Analysis Metadata</h6>
                <Row>
                  <Col md={6}>
                    <small className="text-muted">
                      <strong>Parameters Analyzed:</strong> {correlationData.metadata.parameters_analyzed?.length || 0}<br/>
                      <strong>Data Points:</strong> {correlationData.metadata.data_points?.toLocaleString()}<br/>
                      <strong>Analysis Method:</strong> {correlationData.metadata.configuration?.method}
                    </small>
                  </Col>
                  <Col md={6}>
                    <small className="text-muted">
                      <strong>Date Range:</strong> {correlationData.metadata.date_range?.start} to {correlationData.metadata.date_range?.end}<br/>
                      <strong>Significance Threshold:</strong> {correlationData.metadata.configuration?.significance_threshold}<br/>
                      <strong>Correlation Threshold:</strong> {correlationData.metadata.configuration?.correlation_threshold}
                    </small>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default EnhancedCorrelationHeatmap;
