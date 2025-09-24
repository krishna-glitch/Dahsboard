/**
 * Advanced Trend Analysis Results Component
 * Displays comprehensive trend analysis results with interactive visualizations
 * Integrates with Flask backend trend analysis services
 */

import React, { useState, useMemo } from 'react';
import { Card, Row, Col, Badge, Alert, Tabs, Tab, Button, Table, ProgressBar } from 'react-bootstrap';
import Plot from 'react-plotly.js';
import { TrendResult, ComprehensiveAnalysisResult } from '../../types/analytics';
import { useToast } from '../modern/toastUtils';
import './TrendAnalysisResults.css';

interface TrendAnalysisResultsProps {
  results: Record<string, TrendResult> | null;
  loading: boolean;
  error?: string;
  onExport?: (format: 'pdf' | 'excel' | 'json') => void;
  onParameterSelect?: (parameter: string) => void;
  selectedParameter?: string;
}

const TrendAnalysisResults: React.FC<TrendAnalysisResultsProps> = ({
  results,
  loading,
  error,
  onExport,
  onParameterSelect,
  selectedParameter
}) => {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [selectedTrendParameter, setSelectedTrendParameter] = useState<string>('');
  const { showInfo } = useToast();

  // Process results for overview
  const overviewData = useMemo(() => {
    if (!results) return null;

    const parameters = Object.keys(results);
    const increasingTrends = parameters.filter(p =>
      results[p].trend_summary?.trend_direction === 'Increasing' &&
      results[p].trend_summary?.statistically_significant
    );
    const decreasingTrends = parameters.filter(p =>
      results[p].trend_summary?.trend_direction === 'Decreasing' &&
      results[p].trend_summary?.statistically_significant
    );
    const stableParameters = parameters.filter(p =>
      results[p].trend_summary?.trend_direction === 'Stable' ||
      !results[p].trend_summary?.statistically_significant
    );
    const highVolatilityParams = parameters.filter(p =>
      (results[p].trend_summary?.volatility || 0) > 0.3
    );

    return {
      totalParameters: parameters.length,
      increasingTrends: increasingTrends.length,
      decreasingTrends: decreasingTrends.length,
      stableParameters: stableParameters.length,
      highVolatilityParams: highVolatilityParams.length,
      parametersWithForecasts: parameters.filter(p => results[p].forecast).length,
      totalOutliers: parameters.reduce((sum, p) => sum + (results[p].outliers?.length || 0), 0),
      totalChangePoints: parameters.reduce((sum, p) => sum + (results[p].change_points?.length || 0), 0)
    };
  }, [results]);

  // Get trend direction color
  const getTrendColor = (direction: string, significant: boolean) => {
    if (!significant) return 'secondary';
    switch (direction) {
      case 'Increasing': return 'success';
      case 'Decreasing': return 'danger';
      case 'Stable': return 'info';
      default: return 'secondary';
    }
  };

  // Get trend icon
  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case 'Increasing': return '📈';
      case 'Decreasing': return '📉';
      case 'Stable': return '➡️';
      default: return '❓';
    }
  };

  // Create trend summary visualization
  const createTrendSummaryPlot = () => {
    if (!results) return null;

    const parameters = Object.keys(results);
    const trendData = parameters.map(param => ({
      parameter: param,
      slope: results[param].trend_summary?.slope || 0,
      rSquared: results[param].trend_summary?.r_squared || 0,
      significant: results[param].trend_summary?.statistically_significant || false,
      direction: results[param].trend_summary?.trend_direction || 'Unknown'
    }));

    return {
      data: [
        {
          x: trendData.map(d => d.parameter),
          y: trendData.map(d => d.slope),
          type: 'bar',
          marker: {
            color: trendData.map(d =>
              d.significant
                ? (d.slope > 0 ? '#28a745' : '#dc3545')
                : '#6c757d'
            ),
            opacity: 0.8
          },
          name: 'Trend Slope',
          hovertemplate: '<b>%{x}</b><br>' +
                        'Slope: %{y:.4f}<br>' +
                        'Direction: %{customdata[0]}<br>' +
                        'R²: %{customdata[1]:.3f}<br>' +
                        'Significant: %{customdata[2]}<br>' +
                        '<extra></extra>',
          customdata: trendData.map(d => [d.direction, d.rSquared, d.significant ? 'Yes' : 'No'])
        }
      ],
      layout: {
        title: 'Trend Analysis Summary',
        xaxis: { title: 'Parameters' },
        yaxis: { title: 'Trend Slope (units/day)' },
        hovermode: 'closest',
        showlegend: false,
        margin: { t: 50, r: 30, b: 100, l: 60 }
      },
      config: { responsive: true, displayModeBar: false }
    };
  };

  // Create forecast visualization for selected parameter
  const createForecastPlot = (parameter: string) => {
    if (!results || !results[parameter]?.forecast) return null;

    const forecast = results[parameter].forecast;
    const forecastData = forecast.forecast_values || {};
    const lowerBound = forecast.confidence_lower || {};
    const upperBound = forecast.confidence_upper || {};

    const timestamps = Object.keys(forecastData).map(ts => new Date(ts));
    const values = Object.values(forecastData) as number[];
    const lower = Object.values(lowerBound) as number[];
    const upper = Object.values(upperBound) as number[];

    return {
      data: [
        {
          x: timestamps,
          y: values,
          type: 'scatter',
          mode: 'lines+markers',
          name: 'Forecast',
          line: { color: '#007bff', width: 3 },
          marker: { size: 6 }
        },
        {
          x: timestamps,
          y: upper,
          type: 'scatter',
          mode: 'lines',
          name: 'Upper Bound',
          line: { color: '#007bff', width: 1, dash: 'dash' },
          showlegend: false
        },
        {
          x: timestamps,
          y: lower,
          type: 'scatter',
          mode: 'lines',
          name: 'Lower Bound',
          line: { color: '#007bff', width: 1, dash: 'dash' },
          fill: 'tonexty',
          fillcolor: 'rgba(0, 123, 255, 0.2)',
          showlegend: false
        }
      ],
      layout: {
        title: `${parameter} Forecast (${forecast.method})`,
        xaxis: { title: 'Time' },
        yaxis: { title: parameter },
        hovermode: 'x unified',
        margin: { t: 50, r: 30, b: 50, l: 60 }
      },
      config: { responsive: true }
    };
  };

  // Handle parameter selection
  const handleParameterSelect = (parameter: string) => {
    setSelectedTrendParameter(parameter);
    if (onParameterSelect) {
      onParameterSelect(parameter);
    }
    showInfo(`Selected ${parameter} for detailed analysis`);
  };

  if (loading) {
    return (
      <Card className="trend-analysis-results">
        <Card.Body className="text-center py-5">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <h5>Analyzing Trends...</h5>
          <p className="text-muted">Processing time series data and generating forecasts</p>
          <ProgressBar animated variant="info" now={100} className="mt-3" style={{ height: '4px' }} />
        </Card.Body>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="danger" className="trend-analysis-results">
        <Alert.Heading>
          <i className="bi bi-exclamation-triangle-fill me-2"></i>
          Trend Analysis Error
        </Alert.Heading>
        <p>{error}</p>
        <hr />
        <div className="d-flex justify-content-end">
          <Button variant="outline-danger" size="sm">
            <i className="bi bi-arrow-clockwise me-1"></i>
            Retry Analysis
          </Button>
        </div>
      </Alert>
    );
  }

  if (!results || Object.keys(results).length === 0) {
    return (
      <Card className="trend-analysis-results">
        <Card.Body className="text-center py-5">
          <i className="bi bi-graph-up text-muted" style={{ fontSize: '3rem' }}></i>
          <h5 className="mt-3">No Trend Analysis Results</h5>
          <p className="text-muted">Configure and run trend analysis to see results here</p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card className="trend-analysis-results">
      <Card.Header>
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h5 className="mb-1">
              <i className="bi bi-graph-up-arrow me-2"></i>
              Trend Analysis Results
            </h5>
            <small className="text-muted">
              {overviewData?.totalParameters} parameters analyzed • {overviewData?.parametersWithForecasts} forecasts generated
            </small>
          </div>
          <div className="d-flex gap-2">
            <Button
              variant="outline-primary"
              size="sm"
              onClick={() => onExport?.('excel')}
            >
              <i className="bi bi-download me-1"></i>
              Export
            </Button>
          </div>
        </div>
      </Card.Header>

      <Card.Body>
        <Tabs
          activeKey={activeTab}
          onSelect={(k) => setActiveTab(k || 'overview')}
          className="mb-3"
        >
          {/* Overview Tab */}
          <Tab eventKey="overview" title={
            <span>
              <i className="bi bi-bar-chart me-1"></i>
              Overview
            </span>
          }>
            <Row>
              {/* Summary Statistics */}
              <Col md={8}>
                <Card className="mb-3">
                  <Card.Header className="py-2">
                    <small className="fw-bold">📊 Trend Summary</small>
                  </Card.Header>
                  <Card.Body className="py-2">
                    <Row>
                      <Col md={3}>
                        <div className="text-center">
                          <h4 className="text-success mb-1">{overviewData?.increasingTrends}</h4>
                          <small className="text-muted">Increasing Trends</small>
                        </div>
                      </Col>
                      <Col md={3}>
                        <div className="text-center">
                          <h4 className="text-danger mb-1">{overviewData?.decreasingTrends}</h4>
                          <small className="text-muted">Decreasing Trends</small>
                        </div>
                      </Col>
                      <Col md={3}>
                        <div className="text-center">
                          <h4 className="text-info mb-1">{overviewData?.stableParameters}</h4>
                          <small className="text-muted">Stable Parameters</small>
                        </div>
                      </Col>
                      <Col md={3}>
                        <div className="text-center">
                          <h4 className="text-warning mb-1">{overviewData?.highVolatilityParams}</h4>
                          <small className="text-muted">High Volatility</small>
                        </div>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>

                {/* Trend Summary Plot */}
                <Card>
                  <Card.Body className="p-2">
                    <Plot {...createTrendSummaryPlot()} style={{ width: '100%', height: '300px' }} />
                  </Card.Body>
                </Card>
              </Col>

              {/* Quick Stats */}
              <Col md={4}>
                <Card className="mb-3">
                  <Card.Header className="py-2">
                    <small className="fw-bold">🔍 Analysis Summary</small>
                  </Card.Header>
                  <Card.Body className="py-2">
                    <div className="d-flex justify-content-between mb-2">
                      <span>Total Outliers:</span>
                      <Badge bg="warning">{overviewData?.totalOutliers}</Badge>
                    </div>
                    <div className="d-flex justify-content-between mb-2">
                      <span>Change Points:</span>
                      <Badge bg="info">{overviewData?.totalChangePoints}</Badge>
                    </div>
                    <div className="d-flex justify-content-between mb-2">
                      <span>Forecasts Available:</span>
                      <Badge bg="success">{overviewData?.parametersWithForecasts}</Badge>
                    </div>
                  </Card.Body>
                </Card>

                {/* Parameter List */}
                <Card>
                  <Card.Header className="py-2">
                    <small className="fw-bold">📋 Parameter Status</small>
                  </Card.Header>
                  <Card.Body className="py-2" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {Object.entries(results).map(([param, result]) => (
                      <div
                        key={param}
                        className={`parameter-item mb-2 p-2 rounded cursor-pointer ${
                          selectedTrendParameter === param ? 'selected' : ''
                        }`}
                        onClick={() => handleParameterSelect(param)}
                      >
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            <strong className="small">{param}</strong>
                            <div>
                              <Badge
                                bg={getTrendColor(
                                  result.trend_summary?.trend_direction || 'Unknown',
                                  result.trend_summary?.statistically_significant || false
                                )}
                                className="me-1"
                              >
                                {getTrendIcon(result.trend_summary?.trend_direction || 'Unknown')}
                                {result.trend_summary?.trend_direction}
                              </Badge>
                              {(result.trend_summary?.volatility || 0) > 0.3 && (
                                <Badge bg="warning" className="small">High Vol</Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-end">
                            <small className="text-muted d-block">
                              R²: {(result.trend_summary?.r_squared || 0).toFixed(3)}
                            </small>
                            {result.forecast && (
                              <i className="bi bi-graph-up text-primary" title="Forecast Available"></i>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          </Tab>

          {/* Detailed Analysis Tab */}
          <Tab eventKey="detailed" title={
            <span>
              <i className="bi bi-zoom-in me-1"></i>
              Detailed Analysis
            </span>
          }>
            {selectedTrendParameter ? (
              <div>
                <h6 className="mb-3">
                  <Badge bg="primary" className="me-2">{selectedTrendParameter}</Badge>
                  Detailed Trend Analysis
                </h6>

                <Row>
                  {/* Trend Statistics */}
                  <Col md={6}>
                    <Card className="mb-3">
                      <Card.Header className="py-2">
                        <small className="fw-bold">📈 Trend Statistics</small>
                      </Card.Header>
                      <Card.Body className="py-2">
                        <Table size="sm" className="mb-0">
                          <tbody>
                            <tr>
                              <td>Direction:</td>
                              <td>
                                <Badge bg={getTrendColor(
                                  results[selectedTrendParameter].trend_summary?.trend_direction || 'Unknown',
                                  results[selectedTrendParameter].trend_summary?.statistically_significant || false
                                )}>
                                  {results[selectedTrendParameter].trend_summary?.trend_direction}
                                </Badge>
                              </td>
                            </tr>
                            <tr>
                              <td>Strength:</td>
                              <td>{results[selectedTrendParameter].trend_summary?.trend_strength}</td>
                            </tr>
                            <tr>
                              <td>Rate/Day:</td>
                              <td>{(results[selectedTrendParameter].trend_summary?.rate_per_day || 0).toFixed(4)}</td>
                            </tr>
                            <tr>
                              <td>R-Squared:</td>
                              <td>{(results[selectedTrendParameter].trend_summary?.r_squared || 0).toFixed(3)}</td>
                            </tr>
                            <tr>
                              <td>P-Value:</td>
                              <td>{(results[selectedTrendParameter].trend_summary?.p_value || 0).toFixed(4)}</td>
                            </tr>
                            <tr>
                              <td>Volatility:</td>
                              <td>{((results[selectedTrendParameter].trend_summary?.volatility || 0) * 100).toFixed(1)}%</td>
                            </tr>
                          </tbody>
                        </Table>
                      </Card.Body>
                    </Card>
                  </Col>

                  {/* Data Quality */}
                  <Col md={6}>
                    <Card className="mb-3">
                      <Card.Header className="py-2">
                        <small className="fw-bold">🔍 Data Quality</small>
                      </Card.Header>
                      <Card.Body className="py-2">
                        <div className="mb-2">
                          <small>Outliers Detected:</small>
                          <Badge bg="warning" className="ms-2">
                            {results[selectedTrendParameter].outliers?.length || 0}
                          </Badge>
                        </div>
                        <div className="mb-2">
                          <small>Change Points:</small>
                          <Badge bg="info" className="ms-2">
                            {results[selectedTrendParameter].change_points?.length || 0}
                          </Badge>
                        </div>
                        <div className="mb-2">
                          <small>Data Points:</small>
                          <Badge bg="secondary" className="ms-2">
                            {results[selectedTrendParameter].statistics?.count || 0}
                          </Badge>
                        </div>
                        <div>
                          <small>Statistical Significance:</small>
                          <Badge
                            bg={results[selectedTrendParameter].trend_summary?.statistically_significant ? 'success' : 'secondary'}
                            className="ms-2"
                          >
                            {results[selectedTrendParameter].trend_summary?.statistically_significant ? 'Yes' : 'No'}
                          </Badge>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>

                {/* Forecast Visualization */}
                {results[selectedTrendParameter].forecast && (
                  <Card className="mb-3">
                    <Card.Header className="py-2">
                      <small className="fw-bold">🔮 Forecast</small>
                    </Card.Header>
                    <Card.Body className="p-2">
                      <Plot
                        {...createForecastPlot(selectedTrendParameter)}
                        style={{ width: '100%', height: '400px' }}
                      />
                    </Card.Body>
                  </Card>
                )}

                {/* Insights */}
                {results[selectedTrendParameter].insights && results[selectedTrendParameter].insights!.length > 0 && (
                  <Card>
                    <Card.Header className="py-2">
                      <small className="fw-bold">💡 Key Insights</small>
                    </Card.Header>
                    <Card.Body className="py-2">
                      {results[selectedTrendParameter].insights!.map((insight, index) => (
                        <Alert key={index} variant="info" className="mb-2 py-2">
                          <small>{insight}</small>
                        </Alert>
                      ))}
                    </Card.Body>
                  </Card>
                )}
              </div>
            ) : (
              <div className="text-center py-5">
                <i className="bi bi-cursor text-muted" style={{ fontSize: '3rem' }}></i>
                <h6 className="mt-3">Select a Parameter</h6>
                <p className="text-muted">Choose a parameter from the overview to see detailed analysis</p>
              </div>
            )}
          </Tab>

          {/* Forecasts Tab */}
          <Tab eventKey="forecasts" title={
            <span>
              <i className="bi bi-graph-up me-1"></i>
              Forecasts ({overviewData?.parametersWithForecasts})
            </span>
          }>
            <Row>
              {Object.entries(results)
                .filter(([_, result]) => result.forecast)
                .map(([param, result]) => (
                  <Col md={6} key={param} className="mb-3">
                    <Card>
                      <Card.Header className="py-2">
                        <small className="fw-bold">{param} Forecast</small>
                        <Badge bg="info" className="ms-2">
                          {result.forecast?.method}
                        </Badge>
                      </Card.Header>
                      <Card.Body className="p-2">
                        <Plot
                          {...createForecastPlot(param)}
                          style={{ width: '100%', height: '250px' }}
                        />
                      </Card.Body>
                    </Card>
                  </Col>
                ))}
            </Row>
          </Tab>
        </Tabs>
      </Card.Body>
    </Card>
  );
};

export default TrendAnalysisResults;