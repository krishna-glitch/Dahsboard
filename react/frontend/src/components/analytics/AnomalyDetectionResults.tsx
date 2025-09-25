/**
 * Anomaly Detection Results Component
 * Displays comprehensive anomaly detection results with interactive visualizations
 * Integrates with Flask backend anomaly detection services
 */

import React, { useState, useMemo } from 'react';
import { Card, Row, Col, Badge, Alert, Tabs, Tab, Button, Table } from 'react-bootstrap';
import Plot from 'react-plotly.js';
import { AnomalyResult } from '../../types/analytics';
import { useToast } from '../modern/toastUtils';
import './AnomalyDetectionResults.css';

interface AnomalyDetectionResultsProps {
  results: Record<string, AnomalyResult> | null;
  loading: boolean;
  error?: string;
  onExport?: (format: 'pdf' | 'excel' | 'json') => void;
  onParameterSelect?: (parameter: string) => void;
}

const AnomalyDetectionResults: React.FC<AnomalyDetectionResultsProps> = ({
  results,
  loading,
  error,
  onExport,
  onParameterSelect
}) => {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [selectedParameter, setSelectedParameter] = useState<string>('');
  const { showInfo } = useToast();

  // Process results for overview
  const overviewData = useMemo(() => {
    if (!results) return null;

    const parameters = Object.keys(results);
    let totalAnomalies = 0;
    let criticalAnomalies = 0;
    let highAnomalies = 0;
    let parametersWithAnomalies = 0;

    parameters.forEach(param => {
      const anomalies = results[param].anomalies || [];
      totalAnomalies += anomalies.length;

      if (anomalies.length > 0) {
        parametersWithAnomalies++;
      }

      anomalies.forEach(anomaly => {
        if (anomaly.severity === 'critical') criticalAnomalies++;
        if (anomaly.severity === 'high') highAnomalies++;
      });
    });

    return {
      totalParameters: parameters.length,
      totalAnomalies,
      criticalAnomalies,
      highAnomalies,
      parametersWithAnomalies,
      cleanParameters: parameters.length - parametersWithAnomalies
    };
  }, [results]);

  // Get severity color
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'danger';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'secondary';
      default: return 'light';
    }
  };

  // Get severity icon
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return '🔴';
      case 'high': return '🟠';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  };

  // Create anomaly timeline plot
  const createTimelinePlot = () => {
    if (!results) return null;

    const timelineData: any[] = [];
    const colors = {
      critical: '#dc3545',
      high: '#fd7e14',
      medium: '#ffc107',
      low: '#6c757d'
    };

    Object.entries(results).forEach(([param, result]) => {
      result.anomalies?.forEach(anomaly => {
        timelineData.push({
          x: new Date(anomaly.timestamp),
          y: param,
          text: `${anomaly.explanation}<br>Value: ${anomaly.value}<br>Score: ${anomaly.anomaly_score.toFixed(3)}`,
          marker: {
            color: colors[anomaly.severity as keyof typeof colors] || colors.low,
            size: anomaly.severity === 'critical' ? 12 :
                  anomaly.severity === 'high' ? 10 : 8
          },
          customdata: anomaly
        });
      });
    });

    if (timelineData.length === 0) {
      return null;
    }

    return {
      data: [{
        type: 'scatter',
        mode: 'markers',
        x: timelineData.map(d => d.x),
        y: timelineData.map(d => d.y),
        text: timelineData.map(d => d.text),
        marker: {
          color: timelineData.map(d => d.marker.color),
          size: timelineData.map(d => d.marker.size),
          opacity: 0.8
        },
        hovertemplate: '%{text}<extra></extra>',
        name: 'Anomalies'
      }],
      layout: {
        title: 'Anomaly Timeline',
        xaxis: { title: 'Time' },
        yaxis: { title: 'Parameters' },
        hovermode: 'closest',
        margin: { t: 50, r: 30, b: 80, l: 120 },
        showlegend: false
      },
      config: { responsive: true }
    };
  };

  // Create severity distribution plot
  const createSeverityPlot = () => {
    if (!results) return null;

    const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

    Object.values(results).forEach(result => {
      result.anomalies?.forEach(anomaly => {
        severityCounts[anomaly.severity as keyof typeof severityCounts]++;
      });
    });

    const labels = Object.keys(severityCounts);
    const values = Object.values(severityCounts);
    const colors = ['#dc3545', '#fd7e14', '#ffc107', '#6c757d'];

    return {
      data: [{
        type: 'pie',
        labels,
        values,
        marker: {
          colors
        },
        hovertemplate: '%{label}: %{value}<br>%{percent}<extra></extra>',
        textinfo: 'label+percent'
      }],
      layout: {
        title: 'Anomalies by Severity',
        margin: { t: 50, r: 30, b: 30, l: 30 },
        showlegend: false
      },
      config: { responsive: true, displayModeBar: false }
    };
  };

  if (loading) {
    return (
      <Card className="anomaly-detection-results">
        <Card.Body className="text-center py-5">
          <div className="spinner-border text-danger mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <h5>Detecting Anomalies...</h5>
          <p className="text-muted">Analyzing data patterns and identifying outliers</p>
        </Card.Body>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="danger" className="anomaly-detection-results">
        <Alert.Heading>
          <i className="bi bi-exclamation-triangle-fill me-2"></i>
          Anomaly Detection Error
        </Alert.Heading>
        <p>{error}</p>
      </Alert>
    );
  }

  if (!results || Object.keys(results).length === 0) {
    return (
      <Card className="anomaly-detection-results">
        <Card.Body className="text-center py-5">
          <i className="bi bi-shield-check text-success" style={{ fontSize: '3rem' }}></i>
          <h5 className="mt-3">No Anomaly Detection Results</h5>
          <p className="text-muted">Configure and run anomaly detection to see results here</p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card className="anomaly-detection-results">
      <Card.Header>
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h5 className="mb-1">
              <i className="bi bi-shield-exclamation me-2"></i>
              Anomaly Detection Results
            </h5>
            <small className="text-muted">
              {overviewData?.totalAnomalies} anomalies detected across {overviewData?.totalParameters} parameters
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
          <Tab eventKey="overview" title={
            <span>
              <i className="bi bi-grid me-1"></i>
              Overview
            </span>
          }>
            {/* Alert Summary */}
            {overviewData && overviewData.criticalAnomalies > 0 && (
              <Alert variant="danger" className="mb-3">
                <Alert.Heading className="h6">
                  <i className="bi bi-exclamation-triangle-fill me-2"></i>
                  Critical Anomalies Detected
                </Alert.Heading>
                <p className="mb-0">
                  {overviewData.criticalAnomalies} critical anomalies require immediate attention.
                </p>
              </Alert>
            )}

            <Row>
              {/* Summary Cards */}
              <Col md={8}>
                <Row className="mb-3">
                  <Col md={3}>
                    <Card className="text-center border-danger">
                      <Card.Body className="py-3">
                        <h3 className="text-danger mb-1">{overviewData?.criticalAnomalies}</h3>
                        <small className="text-muted">Critical</small>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col md={3}>
                    <Card className="text-center border-warning">
                      <Card.Body className="py-3">
                        <h3 className="text-warning mb-1">{overviewData?.highAnomalies}</h3>
                        <small className="text-muted">High Severity</small>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col md={3}>
                    <Card className="text-center border-info">
                      <Card.Body className="py-3">
                        <h3 className="text-info mb-1">{overviewData?.parametersWithAnomalies}</h3>
                        <small className="text-muted">Affected Parameters</small>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col md={3}>
                    <Card className="text-center border-success">
                      <Card.Body className="py-3">
                        <h3 className="text-success mb-1">{overviewData?.cleanParameters}</h3>
                        <small className="text-muted">Clean Parameters</small>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>

                {/* Timeline Plot */}
                <Card>
                  <Card.Body className="p-2">
                    {createTimelinePlot() ? (
                      <Plot {...createTimelinePlot()} style={{ width: '100%', height: '400px' }} />
                    ) : (
                      <div className="text-center py-5">
                        <i className="bi bi-check-circle text-success" style={{ fontSize: '2rem' }}></i>
                        <p className="mt-2">No anomalies to display</p>
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </Col>

              {/* Severity Distribution & Parameter List */}
              <Col md={4}>
                {/* Severity Distribution */}
                {overviewData && overviewData.totalAnomalies > 0 && (
                  <Card className="mb-3">
                    <Card.Body className="p-2">
                      <Plot {...createSeverityPlot()} style={{ width: '100%', height: '200px' }} />
                    </Card.Body>
                  </Card>
                )}

                {/* Parameter Status */}
                <Card>
                  <Card.Header className="py-2">
                    <small className="fw-bold">📊 Parameter Status</small>
                  </Card.Header>
                  <Card.Body className="py-2" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {Object.entries(results).map(([param, result]) => (
                      <div
                        key={param}
                        className={`parameter-item mb-2 p-2 rounded cursor-pointer ${
                          selectedParameter === param ? 'selected' : ''
                        }`}
                        onClick={() => {
                          setSelectedParameter(param);
                          if (onParameterSelect) {
                            onParameterSelect(param);
                          }
                          showInfo(`Selected ${param} for detailed analysis`);
                        }}
                      >
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            <strong className="small">{param}</strong>
                            <div className="mt-1">
                              {result.anomalies && result.anomalies.length > 0 ? (
                                <Badge bg="warning">
                                  {result.anomalies.length} anomal{result.anomalies.length > 1 ? 'ies' : 'y'}
                                </Badge>
                              ) : (
                                <Badge bg="success">Clean</Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-end">
                            {result.anomalies && result.anomalies.length > 0 && (
                              <div>
                                {result.anomalies
                                  .reduce((acc, a) => {
                                    acc[a.severity] = (acc[a.severity] || 0) + 1;
                                    return acc;
                                  }, {} as Record<string, number>)
                                  && Object.entries(
                                    result.anomalies.reduce((acc, a) => {
                                      acc[a.severity] = (acc[a.severity] || 0) + 1;
                                      return acc;
                                    }, {} as Record<string, number>)
                                  ).map(([severity, count]) => (
                                    <Badge
                                      key={severity}
                                      bg={getSeverityColor(severity)}
                                      className="me-1 small"
                                    >
                                      {getSeverityIcon(severity)} {count}
                                    </Badge>
                                  ))}
                              </div>
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

          <Tab eventKey="detailed" title={
            <span>
              <i className="bi bi-zoom-in me-1"></i>
              Detailed Analysis
            </span>
          }>
            {selectedParameter && results[selectedParameter] ? (
              <div>
                <h6 className="mb-3">
                  <Badge bg="primary" className="me-2">{selectedParameter}</Badge>
                  Anomaly Analysis
                </h6>

                <Row>
                  <Col md={6}>
                    <Card className="mb-3">
                      <Card.Header className="py-2">
                        <small className="fw-bold">🔍 Detection Summary</small>
                      </Card.Header>
                      <Card.Body className="py-2">
                        <Table size="sm" className="mb-0">
                          <tbody>
                            <tr>
                              <td>Total Anomalies:</td>
                              <td>
                                <Badge bg="info">
                                  {results[selectedParameter].anomalies?.length || 0}
                                </Badge>
                              </td>
                            </tr>
                            <tr>
                              <td>Anomaly Rate:</td>
                              <td>{results[selectedParameter].anomaly_summary?.anomaly_rate?.toFixed(2) || 0}%</td>
                            </tr>
                            <tr>
                              <td>Detection Method:</td>
                              <td>{results[selectedParameter].detection_config?.method || 'Unknown'}</td>
                            </tr>
                            <tr>
                              <td>Most Anomalous Period:</td>
                              <td>
                                {results[selectedParameter].anomaly_summary?.most_anomalous_period?.date || 'None'}
                              </td>
                            </tr>
                          </tbody>
                        </Table>
                      </Card.Body>
                    </Card>
                  </Col>

                  <Col md={6}>
                    <Card className="mb-3">
                      <Card.Header className="py-2">
                        <small className="fw-bold">⚠️ Severity Breakdown</small>
                      </Card.Header>
                      <Card.Body className="py-2">
                        {results[selectedParameter].anomaly_summary?.severity_distribution ? (
                          Object.entries(results[selectedParameter].anomaly_summary!.severity_distribution).map(([severity, count]) => (
                            <div key={severity} className="d-flex justify-content-between mb-2">
                              <span className="text-capitalize">{severity}:</span>
                              <Badge bg={getSeverityColor(severity)}>
                                {getSeverityIcon(severity)} {count}
                              </Badge>
                            </div>
                          ))
                        ) : (
                          <p className="text-muted mb-0">No anomalies detected</p>
                        )}
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>

                {/* Anomalies Table */}
                {results[selectedParameter].anomalies && results[selectedParameter].anomalies!.length > 0 && (
                  <Card className="mb-3">
                    <Card.Header className="py-2">
                      <small className="fw-bold">📋 Detected Anomalies</small>
                    </Card.Header>
                    <Card.Body className="p-0">
                      <Table hover size="sm" className="mb-0">
                        <thead>
                          <tr>
                            <th>Timestamp</th>
                            <th>Value</th>
                            <th>Severity</th>
                            <th>Score</th>
                            <th>Explanation</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results[selectedParameter].anomalies!.slice(0, 10).map((anomaly, index) => (
                            <tr key={index}>
                              <td>
                                <small>{new Date(anomaly.timestamp).toLocaleString()}</small>
                              </td>
                              <td>{anomaly.value.toFixed(3)}</td>
                              <td>
                                <Badge bg={getSeverityColor(anomaly.severity)}>
                                  {getSeverityIcon(anomaly.severity)} {anomaly.severity}
                                </Badge>
                              </td>
                              <td>{anomaly.anomaly_score.toFixed(3)}</td>
                              <td>
                                <small>{anomaly.explanation}</small>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                      {results[selectedParameter].anomalies!.length > 10 && (
                        <div className="text-center p-2 text-muted">
                          <small>Showing first 10 of {results[selectedParameter].anomalies!.length} anomalies</small>
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                )}

                {/* Insights */}
                {results[selectedParameter].insights && results[selectedParameter].insights!.length > 0 && (
                  <Card>
                    <Card.Header className="py-2">
                      <small className="fw-bold">💡 Key Insights</small>
                    </Card.Header>
                    <Card.Body className="py-2">
                      {results[selectedParameter].insights!.map((insight, index) => (
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
                <p className="text-muted">Choose a parameter from the overview to see detailed anomaly analysis</p>
              </div>
            )}
          </Tab>
        </Tabs>
      </Card.Body>
    </Card>
  );
};

export default AnomalyDetectionResults;