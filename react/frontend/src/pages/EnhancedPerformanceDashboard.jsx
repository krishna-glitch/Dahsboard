import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ClipLoader, RingLoader } from 'react-spinners';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Badge from 'react-bootstrap/Badge';
import Alert from 'react-bootstrap/Alert';
import Tabs from 'react-bootstrap/Tabs';
import Tab from 'react-bootstrap/Tab';
import Form from 'react-bootstrap/Form';
import Table from 'react-bootstrap/Table';
import ProgressBar from 'react-bootstrap/ProgressBar';
import { useToast } from '../components/modern/toastUtils';
import MetricCard from '../components/modern/MetricCard';
import ProgressivePlot from '../components/modern/ProgressivePlot';
import RoleGate from '../components/auth/RoleGate';
import codeQualityService from '../services/codeQualityService';

/**
 * Enhanced Performance Dashboard - Comprehensive Performance Monitoring
 * Real-time monitoring, Web Vitals, testing tools, and advanced analytics
 */
const EnhancedPerformanceDashboard = () => {
  const { addToast } = useToast();
  
  // Core state
  const [loading, setLoading] = useState(true);
  const [realTimeData, setRealTimeData] = useState(null);
  const [webVitals, setWebVitals] = useState(null);
  const [systemMetrics, setSystemMetrics] = useState(null);
  const [performanceTests, setPerformanceTests] = useState([]);
  const [alerts, setAlerts] = useState([]);
  
  // Real-time monitoring state
  const [isRealTimeActive, setIsRealTimeActive] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000); // 5 seconds
  const intervalRef = useRef(null);
  
  // Performance testing state
  const [testRunning, setTestRunning] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState('/api/v1/water_quality/data');
  
  // Web Vitals state
  const [vitalsHistory, setVitalsHistory] = useState([]);
  
  // Code Quality state
  const [codeQuality, setCodeQuality] = useState(null);
  const [lintResults, setLintResults] = useState(null);
  const [securityScan, setSecurityScan] = useState(null);
  const [bundleAnalysis, setBundleAnalysis] = useState(null);
  const [dependencies, setDependencies] = useState(null);
  
  // Chart data
  const [responseTimeChart, setResponseTimeChart] = useState(null);
  const [memoryUsageChart, setMemoryUsageChart] = useState(null);
  const [errorRateChart, setErrorRateChart] = useState(null);

  // Fetch performance data
  const fetchPerformanceData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    
    try {
      const [
        performanceResponse,
        webVitalsResponse,
        systemResponse,
        alertsResponse,
        codeQualityResponse,
        lintResponse,
        securityResponse,
        bundleResponse
      ] = await Promise.allSettled([
        fetch(`/api/v1/performance/detailed`),
        fetch(`/api/v1/performance/web-vitals`),
        fetch(`/api/v1/performance/system-metrics`),
        fetch(`/api/v1/performance/alerts/active`),
        fetch(`/api/v1/code-quality/overview`),
        fetch(`/api/v1/code-quality/lint-results`),
        fetch(`/api/v1/code-quality/security-scan`),
        fetch(`/api/v1/code-quality/bundle-analysis`)
      ]);

      // Process performance data
      if (performanceResponse.status === 'fulfilled') {
        const data = await performanceResponse.value.json();
        setRealTimeData(data);
        updatePerformanceCharts(data);
      }

      // Process Web Vitals
      if (webVitalsResponse.status === 'fulfilled') {
        const vitals = await webVitalsResponse.value.json();
        setWebVitals(vitals);
        setVitalsHistory(prev => [...prev.slice(-19), vitals].filter(Boolean));
      }

      // Process system metrics
      if (systemResponse.status === 'fulfilled') {
        const system = await systemResponse.value.json();
        setSystemMetrics(system);
      }

      // Process alerts
      if (alertsResponse.status === 'fulfilled') {
        const alertData = await alertsResponse.value.json();
        setAlerts(alertData.alerts || []);
      }

      // Process code quality data (with fallback to mock service)
      if (codeQualityResponse.status === 'fulfilled') {
        const codeData = await codeQualityResponse.value.json();
        setCodeQuality(codeData);
      } else {
        // Fallback to mock service
        try {
          const mockData = await codeQualityService.getCodeQualityOverview();
          setCodeQuality(mockData);
        } catch (err) {
          console.warn('Code quality mock service failed:', err);
        }
      }

      if (lintResponse.status === 'fulfilled') {
        const lintData = await lintResponse.value.json();
        setLintResults(lintData);
      } else {
        try {
          const mockLint = await codeQualityService.getLintResults();
          setLintResults(mockLint);
        } catch (err) {
          console.warn('Lint mock service failed:', err);
        }
      }

      if (securityResponse.status === 'fulfilled') {
        const securityData = await securityResponse.value.json();
        setSecurityScan(securityData);
      } else {
        try {
          const mockSecurity = await codeQualityService.getSecurityScan();
          setSecurityScan(mockSecurity);
        } catch (err) {
          console.warn('Security mock service failed:', err);
        }
      }

      if (bundleResponse.status === 'fulfilled') {
        const bundleData = await bundleResponse.value.json();
        setBundleAnalysis(bundleData);
      } else {
        try {
          const mockBundle = await codeQualityService.getBundleAnalysis();
          setBundleAnalysis(mockBundle);
        } catch (err) {
          console.warn('Bundle mock service failed:', err);
        }
      }

    } catch (error) {
      console.error('Performance data fetch error:', error);
      addToast({
        type: 'error',
        title: 'Performance Data Error',
        message: 'Failed to fetch performance metrics'
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  // Update chart data
  const updatePerformanceCharts = useCallback((data) => {
    const now = new Date();
    
    // Response time chart
    if (data.api_performance) {
      setResponseTimeChart({
        data: [{
          x: [now],
          y: [data.api_performance.avg_response_time || 0],
          type: 'scatter',
          mode: 'lines+markers',
          name: 'Response Time (ms)',
          line: { color: '#007bff' }
        }],
        layout: {
          title: 'API Response Time',
          xaxis: { type: 'date' },
          yaxis: { title: 'Time (ms)' },
          height: 300
        }
      });
    }

    // Memory usage chart
    if (data.system_metrics) {
      setMemoryUsageChart({
        data: [{
          x: [now],
          y: [data.system_metrics.memory_usage_percent || 0],
          type: 'scatter',
          mode: 'lines+markers',
          name: 'Memory %',
          line: { color: '#28a745' }
        }],
        layout: {
          title: 'Memory Usage',
          xaxis: { type: 'date' },
          yaxis: { title: 'Usage %', range: [0, 100] },
          height: 300
        }
      });
    }

    // Error rate chart  
    if (data.error_metrics) {
      setErrorRateChart({
        data: [{
          x: [now],
          y: [data.error_metrics.error_rate || 0],
          type: 'scatter',
          mode: 'lines+markers',
          name: 'Error Rate %',
          line: { color: '#dc3545' }
        }],
        layout: {
          title: 'Error Rate',
          xaxis: { type: 'date' },
          yaxis: { title: 'Error %', range: [0, 10] },
          height: 300
        }
      });
    }
  }, []);

  // Real-time monitoring effect
  useEffect(() => {
    console.log('useEffect: Running fetchPerformanceData');
    fetchPerformanceData();
    
    // Temporarily disable real-time monitoring to debug infinite loop
    // if (isRealTimeActive) {
    //   intervalRef.current = setInterval(() => {
    //     fetchPerformanceData(false);
    //   }, refreshInterval);
    // }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchPerformanceData, isRealTimeActive, refreshInterval]);

  // Performance testing
  const runPerformanceTest = async () => {
    setTestRunning(true);
    setTestResults(null);
    
    try {
      const response = await fetch('/api/v1/performance/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: selectedEndpoint,
          concurrent_users: 10,
          duration: 30,
          test_type: 'load'
        })
      });
      
      const results = await response.json();
      setTestResults(results);
      
      addToast({
        type: 'success',
        title: 'Performance Test Complete',
        message: `Completed load test for ${selectedEndpoint}`
      });
      
    } catch (error) {
      addToast({
        type: 'error', 
        title: 'Test Failed',
        message: 'Performance test failed to execute'
      });
    } finally {
      setTestRunning(false);
    }
  };

  // Web Vitals scoring
  const getVitalsScore = (vitals) => {
    if (!vitals) return 0;
    
    let score = 0;
    let count = 0;
    
    // Core Web Vitals thresholds (Google standards)
    if (vitals.lcp !== undefined) {
      score += vitals.lcp <= 2500 ? 100 : vitals.lcp <= 4000 ? 70 : 25;
      count++;
    }
    if (vitals.fid !== undefined) {
      score += vitals.fid <= 100 ? 100 : vitals.fid <= 300 ? 70 : 25;
      count++;
    }
    if (vitals.cls !== undefined) {
      score += vitals.cls <= 0.1 ? 100 : vitals.cls <= 0.25 ? 70 : 25;
      count++;
    }
    
    return count > 0 ? Math.round(score / count) : 0;
  };

  // Get status color based on performance
  const getStatusColor = (value, thresholds) => {
    if (value <= thresholds.good) return 'success';
    if (value <= thresholds.fair) return 'warning';
    return 'danger';
  };

  if (loading) {
    return (
      <Container fluid className="modern-page">
        <div className="d-flex justify-content-center align-items-center" style={{ height: '400px' }}>
          <div className="text-center">
            <RingLoader color="#0d6efd" size={48} className="mb-3" />
            <h5>Loading Performance Analytics...</h5>
          </div>
        </div>
      </Container>
    );
  }

  const vitalsScore = getVitalsScore(webVitals);

  return (
    <Container fluid className="modern-page">
      {/* Header */}
      <div className="page-header">
        <Row className="align-items-center">
          <Col>
            <h1>
              <i className="bi bi-speedometer2 me-3"></i>
              Performance Monitoring
            </h1>
            <p className="page-overview mb-0">
              Real-time system monitoring, Web Vitals, and performance testing
            </p>
          </Col>
          <Col xs="auto">
            <div className="d-flex gap-2">
              <Form.Check
                type="switch"
                id="real-time-toggle"
                label="Real-time Updates"
                checked={isRealTimeActive}
                onChange={(e) => setIsRealTimeActive(e.target.checked)}
                className="me-3"
              />
              <Form.Select
                size="sm"
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(parseInt(e.target.value))}
                style={{ width: '140px' }}
              >
                <option value={1000}>1 second</option>
                <option value={5000}>5 seconds</option>
                <option value={15000}>15 seconds</option>
                <option value={60000}>1 minute</option>
              </Form.Select>
              <Button variant="primary" onClick={() => fetchPerformanceData(true)}>
                <i className="bi bi-arrow-clockwise me-2"></i>
                Refresh
              </Button>
            </div>
          </Col>
        </Row>
      </div>

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <Alert variant="warning" className="mb-4">
          <Alert.Heading>
            <i className="bi bi-exclamation-triangle-fill me-2"></i>
            Active Performance Alerts ({alerts.length})
          </Alert.Heading>
          {alerts.slice(0, 3).map((alert, idx) => (
            <div key={idx} className="mb-1">
              <strong>{alert.type}:</strong> {alert.message}
            </div>
          ))}
          {alerts.length > 3 && (
            <small className="text-muted">...and {alerts.length - 3} more alerts</small>
          )}
        </Alert>
      )}

      {/* Main Dashboard Tabs */}
      <Tabs defaultActiveKey="overview" className="mb-4">
        
        {/* Overview Tab */}
        <Tab eventKey="overview" title={<><i className="bi bi-graph-up me-2"></i>Overview</>}>
          <Row className="mb-4">
            {/* Core Metrics */}
            <Col lg={3} md={6} className="mb-3">
              <MetricCard
                title="Response Time"
                value={realTimeData?.api_performance?.avg_response_time || 0}
                unit="ms"
                icon="clock"
                status={realTimeData?.api_performance?.avg_response_time <= 200 ? 'good' : 
                       realTimeData?.api_performance?.avg_response_time <= 500 ? 'fair' : 'poor'}
                trend={realTimeData?.api_performance?.response_time_trend}
                context="Average API response time"
              />
            </Col>
            
            <Col lg={3} md={6} className="mb-3">
              <MetricCard
                title="Memory Usage"
                value={systemMetrics?.memory_usage_percent || 0}
                unit="%"
                icon="memory"
                status={systemMetrics?.memory_usage_percent <= 70 ? 'good' : 
                       systemMetrics?.memory_usage_percent <= 85 ? 'fair' : 'poor'}
                progress={{ 
                  value: systemMetrics?.memory_usage_percent || 0, 
                  max: 100,
                  label: `${systemMetrics?.memory_usage_mb || 0}MB used`
                }}
                context="System memory utilization"
              />
            </Col>
            
            <Col lg={3} md={6} className="mb-3">
              <MetricCard
                title="Cache Hit Rate"
                value={realTimeData?.cache_metrics?.hit_rate || 0}
                unit="%"
                icon="lightning-charge"
                status={realTimeData?.cache_metrics?.hit_rate >= 80 ? 'good' : 
                       realTimeData?.cache_metrics?.hit_rate >= 60 ? 'fair' : 'poor'}
                progress={{
                  value: realTimeData?.cache_metrics?.hit_rate || 0,
                  max: 100,
                  label: `${realTimeData?.cache_metrics?.hits || 0} hits`
                }}
                context="Cache performance efficiency"
              />
            </Col>
            
            <Col lg={3} md={6} className="mb-3">
              <MetricCard
                title="Web Vitals Score"
                value={vitalsScore}
                unit="/100"
                icon="speedometer"
                status={vitalsScore >= 80 ? 'good' : vitalsScore >= 60 ? 'fair' : 'poor'}
                context="Overall user experience score"
                flippable={true}
                backContent={webVitals ? (
                  <div className="flipContent">
                    <div className="flipTitle">Core Web Vitals</div>
                    <div className="flipList">
                      <div className="flipRow">
                        <span className="flipSite">LCP:</span>
                        <span className="flipValue">{webVitals.lcp}<span className="flipUnit">ms</span></span>
                      </div>
                      <div className="flipRow">
                        <span className="flipSite">FID:</span>
                        <span className="flipValue">{webVitals.fid}<span className="flipUnit">ms</span></span>
                      </div>
                      <div className="flipRow">
                        <span className="flipSite">CLS:</span>
                        <span className="flipValue">{webVitals.cls}</span>
                      </div>
                    </div>
                  </div>
                ) : null}
              />
            </Col>
          </Row>

          {/* Real-time Charts */}
          <Row>
            <Col lg={4} className="mb-4">
              <Card className="h-100">
                <Card.Header>
                  <h6 className="mb-0">
                    <i className="bi bi-graph-up me-2"></i>
                    Response Time Trend
                  </h6>
                </Card.Header>
                <Card.Body>
                  {responseTimeChart ? (
                    <ProgressivePlot
                      data={responseTimeChart.data}
                      layout={responseTimeChart.layout}
                      config={{ displayModeBar: false, responsive: true }}
                    />
                  ) : (
                    <div className="text-center py-4">
                      <ClipLoader color="#6c757d" size={16} />
                      <p className="text-muted mt-2 mb-0">Loading chart...</p>
                    </div>
                  )}
                </Card.Body>
              </Card>
            </Col>

            <Col lg={4} className="mb-4">
              <Card className="h-100">
                <Card.Header>
                  <h6 className="mb-0">
                    <i className="bi bi-memory me-2"></i>
                    Memory Usage
                  </h6>
                </Card.Header>
                <Card.Body>
                  {memoryUsageChart ? (
                    <ProgressivePlot
                      data={memoryUsageChart.data}
                      layout={memoryUsageChart.layout}
                      config={{ displayModeBar: false, responsive: true }}
                    />
                  ) : (
                    <div className="text-center py-4">
                      <ClipLoader color="#6c757d" size={16} />
                      <p className="text-muted mt-2 mb-0">Loading chart...</p>
                    </div>
                  )}
                </Card.Body>
              </Card>
            </Col>

            <Col lg={4} className="mb-4">
              <Card className="h-100">
                <Card.Header>
                  <h6 className="mb-0">
                    <i className="bi bi-exclamation-triangle me-2"></i>
                    Error Rate
                  </h6>
                </Card.Header>
                <Card.Body>
                  {errorRateChart ? (
                    <ProgressivePlot
                      data={errorRateChart.data}
                      layout={errorRateChart.layout}
                      config={{ displayModeBar: false, responsive: true }}
                    />
                  ) : (
                    <div className="text-center py-4">
                      <ClipLoader color="#6c757d" size={16} />
                      <p className="text-muted mt-2 mb-0">Loading chart...</p>
                    </div>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Tab>

        {/* Web Vitals Tab */}
        <Tab eventKey="web-vitals" title={<><i className="bi bi-speedometer me-2"></i>Web Vitals</>}>
          <Row>
            <Col lg={8} className="mb-4">
              <Card>
                <Card.Header>
                  <h5 className="mb-0">Core Web Vitals Performance</h5>
                </Card.Header>
                <Card.Body>
                  {webVitals ? (
                    <Row>
                      <Col md={4} className="text-center">
                        <div className="mb-3">
                          <h2 className="display-4 mb-1" style={{ 
                            color: webVitals.lcp <= 2500 ? '#28a745' : webVitals.lcp <= 4000 ? '#ffc107' : '#dc3545' 
                          }}>
                            {webVitals.lcp}
                          </h2>
                          <h6 className="text-muted">LCP (ms)</h6>
                          <small className="text-muted">Largest Contentful Paint</small>
                        </div>
                        <ProgressBar
                          now={Math.min((webVitals.lcp / 4000) * 100, 100)}
                          variant={webVitals.lcp <= 2500 ? 'success' : webVitals.lcp <= 4000 ? 'warning' : 'danger'}
                        />
                      </Col>

                      <Col md={4} className="text-center">
                        <div className="mb-3">
                          <h2 className="display-4 mb-1" style={{ 
                            color: webVitals.fid <= 100 ? '#28a745' : webVitals.fid <= 300 ? '#ffc107' : '#dc3545' 
                          }}>
                            {webVitals.fid}
                          </h2>
                          <h6 className="text-muted">FID (ms)</h6>
                          <small className="text-muted">First Input Delay</small>
                        </div>
                        <ProgressBar
                          now={Math.min((webVitals.fid / 300) * 100, 100)}
                          variant={webVitals.fid <= 100 ? 'success' : webVitals.fid <= 300 ? 'warning' : 'danger'}
                        />
                      </Col>

                      <Col md={4} className="text-center">
                        <div className="mb-3">
                          <h2 className="display-4 mb-1" style={{ 
                            color: webVitals.cls <= 0.1 ? '#28a745' : webVitals.cls <= 0.25 ? '#ffc107' : '#dc3545' 
                          }}>
                            {webVitals.cls.toFixed(3)}
                          </h2>
                          <h6 className="text-muted">CLS</h6>
                          <small className="text-muted">Cumulative Layout Shift</small>
                        </div>
                        <ProgressBar
                          now={Math.min((webVitals.cls / 0.25) * 100, 100)}
                          variant={webVitals.cls <= 0.1 ? 'success' : webVitals.cls <= 0.25 ? 'warning' : 'danger'}
                        />
                      </Col>
                    </Row>
                  ) : (
                    <div className="text-center py-4">
                      <i className="bi bi-speedometer display-1 text-muted"></i>
                      <p className="text-muted">No Web Vitals data available</p>
                    </div>
                  )}
                </Card.Body>
              </Card>
            </Col>

            <Col lg={4} className="mb-4">
              <Card className="h-100">
                <Card.Header>
                  <h6 className="mb-0">Performance Score</h6>
                </Card.Header>
                <Card.Body className="d-flex flex-column justify-content-center align-items-center">
                  <div className="text-center">
                    <div 
                      className="display-1 mb-3"
                      style={{ 
                        fontSize: '4rem',
                        color: vitalsScore >= 80 ? '#28a745' : vitalsScore >= 60 ? '#ffc107' : '#dc3545'
                      }}
                    >
                      {vitalsScore}
                    </div>
                    <Badge 
                      bg={vitalsScore >= 80 ? 'success' : vitalsScore >= 60 ? 'warning' : 'danger'}
                      className="mb-3 px-3 py-2"
                      style={{ fontSize: '1rem' }}
                    >
                      {vitalsScore >= 80 ? 'Excellent' : vitalsScore >= 60 ? 'Good' : 'Needs Improvement'}
                    </Badge>
                    <p className="text-muted mb-0">Overall Web Vitals Score</p>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Tab>

        {/* Performance Testing Tab */}
        <Tab eventKey="testing" title={<><i className="bi bi-play-circle me-2"></i>Testing</>}>
          <RoleGate allowedRoles={['admin', 'analyst']}>
            <Row>
              <Col lg={6} className="mb-4">
                <Card>
                  <Card.Header>
                    <h5 className="mb-0">Performance Test Runner</h5>
                  </Card.Header>
                  <Card.Body>
                    <Form.Group className="mb-3">
                      <Form.Label>Test Endpoint</Form.Label>
                      <Form.Select 
                        value={selectedEndpoint}
                        onChange={(e) => setSelectedEndpoint(e.target.value)}
                      >
                        <option value="/api/v1/water_quality/data">Water Quality Data</option>
                        <option value="/api/v1/site_comparison/data">Site Comparison</option>
                        <option value="/api/v1/redox_analysis/data">Redox Analysis</option>
                        <option value="/api/v1/alerts/data">Alerts Data</option>
                        <option value="/api/v1/reports/generate">Report Generation</option>
                      </Form.Select>
                    </Form.Group>

                    <div className="d-grid">
                      <Button
                        variant="primary"
                        onClick={runPerformanceTest}
                        disabled={testRunning}
                      >
                        {testRunning ? (
                          <>
                            <ClipLoader color="white" size={16} className="me-2" />
                            Running Test...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-play-fill me-2"></i>
                            Run Load Test
                          </>
                        )}
                      </Button>
                    </div>

                    <hr className="my-4" />
                    
                    <h6>Test Configuration</h6>
                    <ul className="text-muted small mb-0">
                      <li>Concurrent Users: 10</li>
                      <li>Test Duration: 30 seconds</li>
                      <li>Test Type: Load Test</li>
                      <li>Ramp-up Time: 5 seconds</li>
                    </ul>
                  </Card.Body>
                </Card>
              </Col>

              <Col lg={6} className="mb-4">
                <Card>
                  <Card.Header>
                    <h5 className="mb-0">Test Results</h5>
                  </Card.Header>
                  <Card.Body>
                    {testResults ? (
                      <div>
                        <Row className="text-center mb-3">
                          <Col>
                            <h4 className="text-primary">{testResults.avg_response_time}ms</h4>
                            <small className="text-muted">Avg Response</small>
                          </Col>
                          <Col>
                            <h4 className="text-success">{testResults.requests_per_second}</h4>
                            <small className="text-muted">Req/Second</small>
                          </Col>
                          <Col>
                            <h4 className={`text-${testResults.error_rate > 1 ? 'danger' : 'success'}`}>
                              {testResults.error_rate}%
                            </h4>
                            <small className="text-muted">Error Rate</small>
                          </Col>
                        </Row>

                        <Table size="sm" responsive>
                          <tbody>
                            <tr>
                              <td>Min Response Time</td>
                              <td>{testResults.min_response_time}ms</td>
                            </tr>
                            <tr>
                              <td>Max Response Time</td>
                              <td>{testResults.max_response_time}ms</td>
                            </tr>
                            <tr>
                              <td>95th Percentile</td>
                              <td>{testResults.p95_response_time}ms</td>
                            </tr>
                            <tr>
                              <td>Total Requests</td>
                              <td>{testResults.total_requests}</td>
                            </tr>
                          </tbody>
                        </Table>

                        <Badge 
                          bg={testResults.performance_grade === 'A' ? 'success' : 
                             testResults.performance_grade === 'B' ? 'primary' : 
                             testResults.performance_grade === 'C' ? 'warning' : 'danger'}
                          className="px-2 py-1"
                        >
                          Grade: {testResults.performance_grade}
                        </Badge>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <i className="bi bi-clipboard-data display-4 text-muted"></i>
                        <p className="text-muted mb-0">No test results yet</p>
                        <small className="text-muted">Run a performance test to see results</small>
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          </RoleGate>
        </Tab>

        {/* System Monitoring Tab */}
        <Tab eventKey="system" title={<><i className="bi bi-cpu me-2"></i>System</>}>
          <Row>
            <Col lg={6} className="mb-4">
              <Card>
                <Card.Header>
                  <h5 className="mb-0">System Resources</h5>
                </Card.Header>
                <Card.Body>
                  {systemMetrics ? (
                    <div>
                      <div className="mb-4">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span>CPU Usage</span>
                          <span className="fw-bold">{systemMetrics.cpu_usage_percent}%</span>
                        </div>
                        <ProgressBar 
                          now={systemMetrics.cpu_usage_percent} 
                          variant={systemMetrics.cpu_usage_percent <= 70 ? 'success' : 
                                 systemMetrics.cpu_usage_percent <= 85 ? 'warning' : 'danger'}
                        />
                      </div>

                      <div className="mb-4">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span>Memory Usage</span>
                          <span className="fw-bold">
                            {systemMetrics.memory_usage_mb}MB / {systemMetrics.memory_total_mb}MB
                          </span>
                        </div>
                        <ProgressBar 
                          now={systemMetrics.memory_usage_percent} 
                          variant={systemMetrics.memory_usage_percent <= 70 ? 'success' : 
                                 systemMetrics.memory_usage_percent <= 85 ? 'warning' : 'danger'}
                        />
                      </div>

                      <div className="mb-4">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span>Disk Usage</span>
                          <span className="fw-bold">{systemMetrics.disk_usage_percent}%</span>
                        </div>
                        <ProgressBar 
                          now={systemMetrics.disk_usage_percent} 
                          variant={systemMetrics.disk_usage_percent <= 80 ? 'success' : 
                                 systemMetrics.disk_usage_percent <= 90 ? 'warning' : 'danger'}
                        />
                      </div>

                      <Table size="sm">
                        <tbody>
                          <tr>
                            <td>Uptime</td>
                            <td>{systemMetrics.uptime_hours} hours</td>
                          </tr>
                          <tr>
                            <td>Load Average</td>
                            <td>{systemMetrics.load_average}</td>
                          </tr>
                          <tr>
                            <td>Active Connections</td>
                            <td>{systemMetrics.active_connections}</td>
                          </tr>
                        </tbody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <RingLoader color="#6c757d" size={32} />
                      <p className="text-muted mt-2">Loading system metrics...</p>
                    </div>
                  )}
                </Card.Body>
              </Card>
            </Col>

            <Col lg={6} className="mb-4">
              <Card>
                <Card.Header>
                  <h5 className="mb-0">Application Metrics</h5>
                </Card.Header>
                <Card.Body>
                  {realTimeData ? (
                    <Table responsive size="sm">
                      <tbody>
                        <tr>
                          <td>Active Sessions</td>
                          <td><Badge bg="primary">{realTimeData.active_sessions || 0}</Badge></td>
                        </tr>
                        <tr>
                          <td>API Requests (1h)</td>
                          <td><Badge bg="info">{realTimeData.api_requests_hour || 0}</Badge></td>
                        </tr>
                        <tr>
                          <td>Cache Entries</td>
                          <td><Badge bg="success">{realTimeData.cache_metrics?.total_entries || 0}</Badge></td>
                        </tr>
                        <tr>
                          <td>Database Connections</td>
                          <td><Badge bg="secondary">{realTimeData.db_connections || 0}</Badge></td>
                        </tr>
                        <tr>
                          <td>Background Tasks</td>
                          <td><Badge bg="warning">{realTimeData.background_tasks || 0}</Badge></td>
                        </tr>
                        <tr>
                          <td>Error Rate (1h)</td>
                          <td>
                            <Badge bg={realTimeData.error_rate <= 1 ? 'success' : 
                                      realTimeData.error_rate <= 5 ? 'warning' : 'danger'}>
                              {realTimeData.error_rate || 0}%
                            </Badge>
                          </td>
                        </tr>
                      </tbody>
                    </Table>
                  ) : (
                    <div className="text-center py-4">
                      <RingLoader color="#6c757d" size={32} />
                      <p className="text-muted mt-2">Loading application metrics...</p>
                    </div>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Tab>

        {/* Code Quality Tab */}
        <Tab eventKey="code-quality" title={<><i className="bi bi-code-slash me-2"></i>Code Quality</>}>
          <RoleGate allowedRoles={['admin', 'developer', 'analyst']}>
            <Row>
              {/* Code Quality Overview */}
              <Col lg={4} className="mb-4">
                <Card className="h-100">
                  <Card.Header>
                    <h5 className="mb-0">
                      <i className="bi bi-shield-check me-2"></i>
                      Code Quality Score
                    </h5>
                  </Card.Header>
                  <Card.Body className="d-flex flex-column justify-content-center align-items-center">
                    {codeQuality ? (
                      <div className="text-center">
                        <div 
                          className="display-1 mb-3"
                          style={{ 
                            fontSize: '4rem',
                            color: codeQuality.overall_score >= 80 ? '#28a745' : 
                                   codeQuality.overall_score >= 60 ? '#ffc107' : '#dc3545'
                          }}
                        >
                          {codeQuality.overall_score}
                        </div>
                        <Badge 
                          bg={codeQuality.overall_score >= 80 ? 'success' : 
                             codeQuality.overall_score >= 60 ? 'warning' : 'danger'}
                          className="mb-3 px-3 py-2"
                          style={{ fontSize: '1rem' }}
                        >
                          {codeQuality.grade}
                        </Badge>
                        <div className="mt-3">
                          <small className="text-muted">Technical Debt: </small>
                          <strong className={`text-${codeQuality.tech_debt_ratio <= 5 ? 'success' : 
                                           codeQuality.tech_debt_ratio <= 10 ? 'warning' : 'danger'}`}>
                            {codeQuality.tech_debt_ratio}%
                          </strong>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <RingLoader color="#6c757d" size={32} />
                        <p className="text-muted mt-2">Analyzing code quality...</p>
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </Col>

              {/* Linting Results */}
              <Col lg={4} className="mb-4">
                <Card className="h-100">
                  <Card.Header>
                    <h5 className="mb-0">
                      <i className="bi bi-bug me-2"></i>
                      Linting Results
                    </h5>
                  </Card.Header>
                  <Card.Body>
                    {lintResults ? (
                      <div>
                        <Row className="text-center mb-3">
                          <Col>
                            <h4 className="text-danger">{lintResults.errors}</h4>
                            <small className="text-muted">Errors</small>
                          </Col>
                          <Col>
                            <h4 className="text-warning">{lintResults.warnings}</h4>
                            <small className="text-muted">Warnings</small>
                          </Col>
                          <Col>
                            <h4 className="text-info">{lintResults.files_checked}</h4>
                            <small className="text-muted">Files</small>
                          </Col>
                        </Row>

                        <div className="mb-3">
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <span>Code Quality</span>
                            <Badge bg={lintResults.quality_score >= 90 ? 'success' : 
                                      lintResults.quality_score >= 70 ? 'warning' : 'danger'}>
                              {lintResults.quality_score}/100
                            </Badge>
                          </div>
                          <ProgressBar 
                            now={lintResults.quality_score} 
                            variant={lintResults.quality_score >= 90 ? 'success' : 
                                   lintResults.quality_score >= 70 ? 'warning' : 'danger'}
                          />
                        </div>

                        {lintResults.top_issues && lintResults.top_issues.length > 0 && (
                          <div>
                            <h6 className="mb-2">Top Issues</h6>
                            {lintResults.top_issues.slice(0, 3).map((issue, idx) => (
                              <div key={idx} className="d-flex justify-content-between align-items-center mb-1">
                                <small className="text-muted">{issue.rule}</small>
                                <Badge bg="secondary" pill>{issue.count}</Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <i className="bi bi-search display-4 text-muted"></i>
                        <p className="text-muted mb-0">Running code analysis...</p>
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </Col>

              {/* Security Scan */}
              <Col lg={4} className="mb-4">
                <Card className="h-100">
                  <Card.Header>
                    <h5 className="mb-0">
                      <i className="bi bi-shield-exclamation me-2"></i>
                      Security Scan
                    </h5>
                  </Card.Header>
                  <Card.Body>
                    {securityScan ? (
                      <div>
                        <Row className="text-center mb-3">
                          <Col>
                            <h4 className="text-danger">{securityScan.high_severity || 0}</h4>
                            <small className="text-muted">High</small>
                          </Col>
                          <Col>
                            <h4 className="text-warning">{securityScan.medium_severity || 0}</h4>
                            <small className="text-muted">Medium</small>
                          </Col>
                          <Col>
                            <h4 className="text-info">{securityScan.low_severity || 0}</h4>
                            <small className="text-muted">Low</small>
                          </Col>
                        </Row>

                        <div className="mb-3 text-center">
                          <Badge 
                            bg={securityScan.risk_score <= 30 ? 'success' : 
                               securityScan.risk_score <= 60 ? 'warning' : 'danger'}
                            className="px-3 py-2"
                            style={{ fontSize: '1rem' }}
                          >
                            Risk Score: {securityScan.risk_score}/100
                          </Badge>
                        </div>

                        {securityScan.vulnerable_dependencies && (
                          <div>
                            <h6 className="mb-2">Vulnerable Dependencies</h6>
                            <div className="text-center">
                              <h3 className={`text-${securityScan.vulnerable_dependencies === 0 ? 'success' : 'warning'}`}>
                                {securityScan.vulnerable_dependencies}
                              </h3>
                              <small className="text-muted">packages need updates</small>
                            </div>
                          </div>
                        )}

                        <div className="mt-3">
                          <small className="text-muted">Last scan: </small>
                          <small>{securityScan.scan_date || 'Unknown'}</small>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <i className="bi bi-shield-check display-4 text-muted"></i>
                        <p className="text-muted mb-0">Running security scan...</p>
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            {/* Bundle Analysis & Dependencies */}
            <Row>
              <Col lg={6} className="mb-4">
                <Card>
                  <Card.Header>
                    <h5 className="mb-0">
                      <i className="bi bi-box me-2"></i>
                      Bundle Analysis
                    </h5>
                  </Card.Header>
                  <Card.Body>
                    {bundleAnalysis ? (
                      <div>
                        <Row className="text-center mb-4">
                          <Col md={4}>
                            <div className="mb-2">
                              <h3 className={`text-${bundleAnalysis.main_bundle_size_mb <= 2 ? 'success' : 
                                            bundleAnalysis.main_bundle_size_mb <= 5 ? 'warning' : 'danger'}`}>
                                {bundleAnalysis.main_bundle_size_mb}MB
                              </h3>
                              <small className="text-muted">Main Bundle</small>
                            </div>
                          </Col>
                          <Col md={4}>
                            <div className="mb-2">
                              <h3 className="text-info">{bundleAnalysis.chunks_count}</h3>
                              <small className="text-muted">Chunks</small>
                            </div>
                          </Col>
                          <Col md={4}>
                            <div className="mb-2">
                              <h3 className={`text-${bundleAnalysis.unused_code_percent <= 10 ? 'success' : 
                                            bundleAnalysis.unused_code_percent <= 25 ? 'warning' : 'danger'}`}>
                                {bundleAnalysis.unused_code_percent}%
                              </h3>
                              <small className="text-muted">Unused Code</small>
                            </div>
                          </Col>
                        </Row>

                        <div className="mb-3">
                          <h6>Largest Dependencies</h6>
                          {bundleAnalysis.largest_dependencies && bundleAnalysis.largest_dependencies.map((dep, idx) => (
                            <div key={idx} className="d-flex justify-content-between align-items-center mb-2">
                              <div>
                                <strong>{dep.name}</strong>
                                <br />
                                <small className="text-muted">{dep.size}KB</small>
                              </div>
                              <div className="progress" style={{ width: '100px', height: '10px' }}>
                                <div 
                                  className="progress-bar bg-info" 
                                  style={{ width: `${(dep.size / bundleAnalysis.largest_dependencies[0].size) * 100}%` }}
                                ></div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <Alert variant="info" className="small mb-0">
                          <strong>Recommendations:</strong>
                          <ul className="mb-0 mt-2">
                            <li>Consider code splitting for bundles &gt; 2MB</li>
                            <li>Remove unused dependencies to reduce size</li>
                            <li>Use tree shaking for better optimization</li>
                          </ul>
                        </Alert>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <RingLoader color="#6c757d" size={32} />
                        <p className="text-muted mt-2">Analyzing bundle...</p>
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </Col>

              <Col lg={6} className="mb-4">
                <Card>
                  <Card.Header>
                    <div className="d-flex justify-content-between align-items-center">
                      <h5 className="mb-0">
                        <i className="bi bi-diagram-3 me-2"></i>
                        Code Metrics
                      </h5>
                      <Button 
                        variant="outline-primary" 
                        size="sm"
                        onClick={() => {
                          addToast({
                            type: 'info',
                            title: 'Code Analysis Running',
                            message: 'Analyzing code complexity and quality metrics...'
                          });
                          // Trigger re-analysis
                          fetchPerformanceData(false);
                        }}
                      >
                        <i className="bi bi-arrow-clockwise me-1"></i>
                        Analyze
                      </Button>
                    </div>
                  </Card.Header>
                  <Card.Body>
                    {codeQuality ? (
                      <div>
                        <Table responsive size="sm" className="mb-3">
                          <tbody>
                            <tr>
                              <td>Lines of Code</td>
                              <td><Badge bg="secondary">{codeQuality.lines_of_code?.toLocaleString()}</Badge></td>
                            </tr>
                            <tr>
                              <td>Cyclomatic Complexity</td>
                              <td>
                                <Badge bg={codeQuality.avg_complexity <= 5 ? 'success' : 
                                          codeQuality.avg_complexity <= 10 ? 'warning' : 'danger'}>
                                  {codeQuality.avg_complexity}
                                </Badge>
                              </td>
                            </tr>
                            <tr>
                              <td>Code Coverage</td>
                              <td>
                                <Badge bg={codeQuality.code_coverage >= 80 ? 'success' : 
                                          codeQuality.code_coverage >= 60 ? 'warning' : 'danger'}>
                                  {codeQuality.code_coverage}%
                                </Badge>
                              </td>
                            </tr>
                            <tr>
                              <td>Maintainability Index</td>
                              <td>
                                <Badge bg={codeQuality.maintainability_index >= 70 ? 'success' : 
                                          codeQuality.maintainability_index >= 50 ? 'warning' : 'danger'}>
                                  {codeQuality.maintainability_index}/100
                                </Badge>
                              </td>
                            </tr>
                            <tr>
                              <td>Code Duplication</td>
                              <td>
                                <Badge bg={codeQuality.duplication_percent <= 5 ? 'success' : 
                                          codeQuality.duplication_percent <= 10 ? 'warning' : 'danger'}>
                                  {codeQuality.duplication_percent}%
                                </Badge>
                              </td>
                            </tr>
                            <tr>
                              <td>Performance Anti-patterns</td>
                              <td>
                                <Badge bg={codeQuality.performance_issues === 0 ? 'success' : 
                                          codeQuality.performance_issues <= 5 ? 'warning' : 'danger'}>
                                  {codeQuality.performance_issues}
                                </Badge>
                              </td>
                            </tr>
                          </tbody>
                        </Table>

                        <div className="mb-3">
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <span>Code Quality Trend</span>
                            <Badge bg={codeQuality.trend === 'improving' ? 'success' : 
                                      codeQuality.trend === 'stable' ? 'primary' : 'warning'}>
                              {codeQuality.trend}
                            </Badge>
                          </div>
                        </div>

                        <Alert variant="light" className="small mb-0">
                          <strong>Quality Gates:</strong>
                          <div className="mt-2">
                            <div className="d-flex justify-content-between">
                              <span>Coverage &gt; 80%</span>
                              <i className={`bi bi-${codeQuality.code_coverage >= 80 ? 'check-circle text-success' : 'x-circle text-danger'}`}></i>
                            </div>
                            <div className="d-flex justify-content-between">
                              <span>Complexity &lt; 10</span>
                              <i className={`bi bi-${codeQuality.avg_complexity <= 10 ? 'check-circle text-success' : 'x-circle text-danger'}`}></i>
                            </div>
                            <div className="d-flex justify-content-between">
                              <span>Duplication &lt; 5%</span>
                              <i className={`bi bi-${codeQuality.duplication_percent <= 5 ? 'check-circle text-success' : 'x-circle text-danger'}`}></i>
                            </div>
                          </div>
                        </Alert>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <i className="bi bi-bar-chart display-4 text-muted"></i>
                        <p className="text-muted mb-0">No metrics available</p>
                        <Button variant="primary" size="sm" className="mt-2" onClick={() => fetchPerformanceData(false)}>
                          Run Analysis
                        </Button>
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          </RoleGate>
        </Tab>
      </Tabs>
    </Container>
  );
};

export default EnhancedPerformanceDashboard;
