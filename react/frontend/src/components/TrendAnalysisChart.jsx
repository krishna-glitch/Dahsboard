import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ProgressivePlot from './modern/ProgressivePlot';
import { apiClient } from '../services/api';
import { Row, Col, Card, Form, Button, Badge, Alert, Spinner, Table } from 'react-bootstrap';
import { useToast } from './modern/toastUtils';

const TrendAnalysisChart = ({ 
  data = [], 
  onAnalysisUpdate = () => {},
  loading = false
}) => {
  const [analysisData, setAnalysisData] = useState(null);
  const [analysisConfig, setAnalysisConfig] = useState({
    trend_method: 'linear',
    forecast_periods: 24,
    confidence_level: 0.95,
    detect_outliers: true,
    min_periods: 20
  });
  const [selectedParameter, setSelectedParameter] = useState('temperature');
  const [activeView, setActiveView] = useState('trends');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const toast = useToast();

  // Process data for trend analysis
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    return data.map(row => ({
      measurement_timestamp: row.measurement_timestamp,
      temperature: row.temperature_c || row.temperature || null,
      conductivity: row.conductivity_us_cm || row.conductivity || null,
      water_level: row.water_level_m || row.water_level || null,
      dissolved_oxygen: row.dissolved_oxygen || null,
      turbidity: row.turbidity || null,
      redox_potential: row.redox_potential || null
    }));
  }, [data]);

  // Get available parameters
  const availableParameters = useMemo(() => {
    if (!processedData.length) return [];
    
    const params = [];
    const sampleRow = processedData[0];
    
    Object.keys(sampleRow).forEach(key => {
      if (key !== 'measurement_timestamp' && sampleRow[key] !== null) {
        params.push({
          value: key,
          label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        });
      }
    });
    
    return params;
  }, [processedData]);

  // Perform trend analysis
  const performAnalysis = useCallback(async (analysisType = 'analyze') => {
    if (!processedData.length) {
      toast.showError('No data available for trend analysis');
      return;
    }

    setAnalysisLoading(true);
    const loadingToastId = toast.showLoading(`Performing trend analysis...`);

    try {
      let endpoint = 'trends/analyze';
      let payload = {
        df: processedData,
        parameters: availableParameters.map(p => p.value),
        ...analysisConfig
      };

      if (analysisType === 'summary') {
        endpoint = 'trends/summary';
      } else if (analysisType === 'forecast') {
        endpoint = `trends/forecast/${selectedParameter}`;
      } else if (analysisType === 'changepoints') {
        endpoint = 'trends/change-points';
      }
      const { data: result } = await apiClient.post(endpoint, payload, { withCredentials: true });
      setAnalysisData(result);
      onAnalysisUpdate(result);
      
      toast.updateToast(loadingToastId, 'success', 
        `✅ Trend analysis completed: ${result.parameters_analyzed?.length || 0} parameters analyzed`
      );

    } catch (error) {
      console.error('Trend analysis error:', error);
      toast.updateToast(loadingToastId, 'error', 
        `❌ Analysis failed: ${error.message}`
      );
    } finally {
      setAnalysisLoading(false);
    }
  }, [processedData, availableParameters, analysisConfig, selectedParameter, toast, onAnalysisUpdate]);

  // Auto-perform analysis when data changes
  useEffect(() => {
    if (processedData.length > 0 && !loading) {
      performAnalysis('analyze');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedData.length, loading]);

  // Stable callbacks for performance optimization
  const handleParameterChange = useCallback((e) => {
    setSelectedParameter(e.target.value);
  }, []);

  const handleForecastPeriodsChange = useCallback((e) => {
    setAnalysisConfig({...analysisConfig, forecast_periods: parseInt(e.target.value)});
  }, [analysisConfig]);

  const handleConfidenceLevelChange = useCallback((e) => {
    setAnalysisConfig({...analysisConfig, confidence_level: parseFloat(e.target.value)});
  }, [analysisConfig]);

  const handleDetectOutliersChange = useCallback((e) => {
    setAnalysisConfig({...analysisConfig, detect_outliers: e.target.checked});
  }, [analysisConfig]);

  const handleAnalyzeClick = useCallback(() => {
    performAnalysis('analyze');
  }, [performAnalysis]);

  const handleForecastClick = useCallback(() => {
    performAnalysis('forecast');
  }, [performAnalysis]);

  const handleSummaryClick = useCallback(() => {
    performAnalysis('summary');
  }, [performAnalysis]);

  const handleTrendsViewChange = useCallback(() => {
    setActiveView('trends');
  }, []);

  const handleSummaryViewChange = useCallback(() => {
    setActiveView('summary');
  }, []);

  const handleInsightsViewChange = useCallback(() => {
    setActiveView('insights');
  }, []);

  // Create trend visualization
  const createTrendChart = (parameter) => {
    if (!analysisData?.results?.[parameter]) return null;

    const paramData = analysisData.results[parameter];
    const values = processedData.map(row => row[parameter]).filter(v => v !== null);
    const validTimestamps = processedData.filter(row => row[parameter] !== null).map(row => row.measurement_timestamp);

    const traces = [
      // Original data
      {
        x: validTimestamps,
        y: values,
        type: 'scatter',
        mode: 'markers',
        name: 'Data Points',
        marker: { 
          color: 'rgba(31, 119, 180, 0.6)',
          size: 4
        },
        hovertemplate: '<b>%{fullData.name}</b><br>Time: %{x}<br>Value: %{y:.2f}<extra></extra>'
      }
    ];

    // Add trend line if available
    if (paramData.trend_summary && paramData.trend_summary.slope !== undefined) {
      const slope = paramData.trend_summary.slope;
      const intercept = paramData.trend_summary.mean_value - slope * (values.length / 2);
      
      const trendLine = values.map((_, i) => slope * i + intercept);
      
      traces.push({
        x: validTimestamps,
        y: trendLine,
        type: 'scatter',
        mode: 'lines',
        name: `Trend (${paramData.trend_summary.trend_direction})`,
        line: { 
          color: paramData.trend_summary.trend_direction === 'Increasing' ? 'green' : 
                 paramData.trend_summary.trend_direction === 'Decreasing' ? 'red' : 'gray',
          width: 2,
          dash: 'dash'
        },
        hovertemplate: '<b>%{fullData.name}</b><br>Time: %{x}<br>Trend: %{y:.2f}<extra></extra>'
      });
    }

    // Add forecast if available
    if (paramData.forecast?.forecast_values) {
      const forecastData = paramData.forecast.forecast_values;
      const forecastTimestamps = Object.keys(forecastData);
      const forecastValues = Object.values(forecastData);

      traces.push({
        x: forecastTimestamps,
        y: forecastValues,
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Forecast',
        line: { color: 'orange', width: 2 },
        marker: { color: 'orange', size: 6 },
        hovertemplate: '<b>%{fullData.name}</b><br>Time: %{x}<br>Forecast: %{y:.2f}<extra></extra>'
      });

      // Add confidence intervals
      if (paramData.forecast.confidence_lower && paramData.forecast.confidence_upper) {
        const lowerBound = Object.values(paramData.forecast.confidence_lower);
        const upperBound = Object.values(paramData.forecast.confidence_upper);

        traces.push({
          x: [...forecastTimestamps, ...forecastTimestamps.reverse()],
          y: [...lowerBound, ...upperBound.reverse()],
          type: 'scatter',
          mode: 'lines',
          fill: 'tonexty',
          fillcolor: 'rgba(255, 165, 0, 0.2)',
          line: { color: 'rgba(255, 165, 0, 0)' },
          name: `${(analysisConfig.confidence_level * 100)}% Confidence`,
          showlegend: false,
          hoverinfo: 'skip'
        });
      }
    }

    // Mark outliers if available
    if (paramData.outliers && paramData.outliers.length > 0) {
      const outlierTimestamps = paramData.outliers.map(o => o.timestamp);
      const outlierValues = paramData.outliers.map(o => o.value);

      traces.push({
        x: outlierTimestamps,
        y: outlierValues,
        type: 'scatter',
        mode: 'markers',
        name: 'Outliers',
        marker: { 
          color: 'red',
          size: 8,
          symbol: 'diamond'
        },
        hovertemplate: '<b>%{fullData.name}</b><br>Time: %{x}<br>Value: %{y:.2f}<br>Z-score: %{text}<extra></extra>',
        text: paramData.outliers.map(o => o.z_score?.toFixed(2) || 'N/A')
      });
    }

    return (
      <ProgressivePlot
        data={traces}
        layout={{
          title: `Trend Analysis: ${parameter.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
          xaxis: { 
            title: 'Time',
            type: 'date'
          },
          yaxis: { 
            title: 'Value'
          },
          width: 800,
          height: 500,
          showlegend: true,
          legend: { x: 0, y: 1 }
        }}
        config={{
          displayModeBar: true,
          displaylogo: false
        }}
        progressiveThreshold={800}
        batchSize={150}
        loadingDelay={100}
        onLoadingStart={() => console.log('TrendAnalysis: Progressive loading started')}
        onLoadingComplete={(totalPoints) => console.log(`TrendAnalysis: Progressive loading complete (${totalPoints} points)`)}
      />
    );
  };

  // Render trend summary table
  const renderTrendSummary = () => {
    if (!analysisData?.results) return null;

    return (
      <Table responsive size="sm">
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Trend</th>
            <th>Strength</th>
            <th>Rate/Day</th>
            <th>R²</th>
            <th>Volatility</th>
            <th>Outliers</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(analysisData.results).map(([param, result]) => (
            <tr key={param}>
              <td><strong>{param.replace(/_/g, ' ')}</strong></td>
              <td>
                <Badge bg={
                  result.trend_summary?.trend_direction === 'Increasing' ? 'success' :
                  result.trend_summary?.trend_direction === 'Decreasing' ? 'danger' : 'secondary'
                }>
                  {result.trend_summary?.trend_direction || 'Unknown'}
                </Badge>
              </td>
              <td>
                <Badge bg={
                  result.trend_summary?.trend_strength === 'Strong' ? 'primary' :
                  result.trend_summary?.trend_strength === 'Moderate' ? 'warning' : 'light'
                } text={result.trend_summary?.trend_strength === 'Weak' ? 'dark' : 'light'}>
                  {result.trend_summary?.trend_strength || 'Unknown'}
                </Badge>
              </td>
              <td>{result.trend_summary?.rate_per_day?.toFixed(4) || 'N/A'}</td>
              <td>{result.trend_summary?.r_squared?.toFixed(3) || 'N/A'}</td>
              <td>
                <Badge bg={
                  (result.trend_summary?.volatility || 0) > 0.3 ? 'danger' :
                  (result.trend_summary?.volatility || 0) > 0.1 ? 'warning' : 'success'
                }>
                  {((result.trend_summary?.volatility || 0) * 100).toFixed(1)}%
                </Badge>
              </td>
              <td>{result.outliers?.length || 0}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  };

  // Render insights
  const renderInsights = () => {
    if (!analysisData?.overall_insights && !analysisData?.results?.[selectedParameter]?.insights) {
      return null;
    }

    const overallInsights = analysisData.overall_insights || [];
    const paramInsights = analysisData.results?.[selectedParameter]?.insights || [];

    return (
      <>
        {overallInsights.length > 0 && (
          <Alert variant="info">
            <h6>📊 Overall Insights:</h6>
            <ul className="mb-0">
              {overallInsights.map((insight, idx) => (
                <li key={idx}>{insight}</li>
              ))}
            </ul>
          </Alert>
        )}
        
        {paramInsights.length > 0 && (
          <Alert variant="primary">
            <h6>🔍 {selectedParameter.replace(/_/g, ' ')} Insights:</h6>
            <ul className="mb-0">
              {paramInsights.map((insight, idx) => (
                <li key={idx}>{insight}</li>
              ))}
            </ul>
          </Alert>
        )}
      </>
    );
  };

  if (loading) {
    return (
      <Card>
        <Card.Body className="text-center">
          <Spinner animation="border" />
          <p className="mt-2">Loading trend analysis...</p>
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
            <Col md={2}>
              <Form.Group>
                <Form.Label>Parameter</Form.Label>
                <Form.Select
                  value={selectedParameter}
                  onChange={handleParameterChange}
                >
                  {availableParameters.map(param => (
                    <option key={param.value} value={param.value}>
                      {param.label}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={2}>
              <Form.Group>
                <Form.Label>Forecast Periods</Form.Label>
                <Form.Control
                  type="number"
                  min="6"
                  max="168"
                  value={analysisConfig.forecast_periods}
                  onChange={handleForecastPeriodsChange}
                />
              </Form.Group>
            </Col>
            <Col md={2}>
              <Form.Group>
                <Form.Label>Confidence Level</Form.Label>
                <Form.Select
                  value={analysisConfig.confidence_level}
                  onChange={handleConfidenceLevelChange}
                >
                  <option value="0.90">90%</option>
                  <option value="0.95">95%</option>
                  <option value="0.99">99%</option>
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={2}>
              <Form.Check
                type="checkbox"
                label="Detect Outliers"
                checked={analysisConfig.detect_outliers}
                onChange={handleDetectOutliersChange}
                className="mt-4"
              />
            </Col>
            <Col md={4} className="d-flex align-items-end gap-2">
              <Button 
                variant="primary" 
                onClick={handleAnalyzeClick}
                disabled={analysisLoading || !processedData.length}
              >
                {analysisLoading ? <Spinner animation="border" size="sm" /> : 'Analyze'}
              </Button>
              <Button 
                variant="outline-primary" 
                onClick={handleForecastClick}
                disabled={analysisLoading || !processedData.length}
              >
                Forecast
              </Button>
              <Button 
                variant="outline-secondary" 
                onClick={handleSummaryClick}
                disabled={analysisLoading || !processedData.length}
              >
                Summary
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Analysis Results */}
      {analysisData && (
        <>
          {/* View Tabs */}
          <Card className="mb-3">
            <Card.Header>
              <div className="btn-group" role="group">
                <input
                  type="radio"
                  className="btn-check"
                  name="trendView"
                  id="trends"
                  checked={activeView === 'trends'}
                  onChange={handleTrendsViewChange}
                />
                <label className="btn btn-outline-primary" htmlFor="trends">
                  Trend Chart
                </label>

                <input
                  type="radio"
                  className="btn-check"
                  name="trendView"
                  id="summary"
                  checked={activeView === 'summary'}
                  onChange={handleSummaryViewChange}
                />
                <label className="btn btn-outline-primary" htmlFor="summary">
                  Summary Table
                </label>

                <input
                  type="radio"
                  className="btn-check"
                  name="trendView"
                  id="insights"
                  checked={activeView === 'insights'}
                  onChange={handleInsightsViewChange}
                />
                <label className="btn btn-outline-primary" htmlFor="insights">
                  Insights
                </label>
              </div>
            </Card.Header>

            <Card.Body>
              {activeView === 'trends' && (
                <div className="text-center">
                  {createTrendChart(selectedParameter)}
                </div>
              )}

              {activeView === 'summary' && renderTrendSummary()}

              {activeView === 'insights' && renderInsights()}
            </Card.Body>
          </Card>

          {/* Analysis Metadata */}
          {analysisData.analysis_timestamp && (
            <Card>
              <Card.Body>
                <h6>Analysis Metadata</h6>
                <Row>
                  <Col md={6}>
                    <small className="text-muted">
                      <strong>Analysis Time:</strong> {new Date(analysisData.analysis_timestamp).toLocaleString()}<br/>
                      <strong>Parameters Analyzed:</strong> {analysisData.total_parameters || analysisData.parameters_analyzed?.length}<br/>
                      <strong>Configuration:</strong> {analysisConfig.trend_method} method, {analysisConfig.forecast_periods}h forecast
                    </small>
                  </Col>
                  <Col md={6}>
                    <small className="text-muted">
                      <strong>Data Points:</strong> {processedData.length.toLocaleString()}<br/>
                      <strong>Outlier Detection:</strong> {analysisConfig.detect_outliers ? 'Enabled' : 'Disabled'}<br/>
                      <strong>Confidence Level:</strong> {(analysisConfig.confidence_level * 100)}%
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

export default TrendAnalysisChart;
