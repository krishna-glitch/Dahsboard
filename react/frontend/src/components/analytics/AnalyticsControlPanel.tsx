/**
 * Advanced Analytics Control Panel
 * Comprehensive analytics configuration interface using TypeScript + React Hook Form
 * Integrates with Flask backend enhanced analytics services
 */

import React, { useState, useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { Card, Row, Col, Form, Button, Alert, Badge, ProgressBar } from 'react-bootstrap';
import { AnalyticsFormData, AnalyticsConfig } from '../../types/analytics';
import { createAnalyticsValidation } from '../../utils/formValidation';
import { useToast } from '../modern/toastUtils';
import './AnalyticsControlPanel.css';

interface AnalyticsControlPanelProps {
  onConfigChange: (config: AnalyticsConfig) => void;
  onRunAnalysis: (config: AnalyticsConfig) => Promise<void>;
  loading?: boolean;
  availableSites: string[];
  availableParameters: string[];
  initialConfig?: Partial<AnalyticsConfig>;
}

const TIME_RANGE_OPTIONS = [
  { value: 'Last 24 Hours', label: 'Last 24 Hours' },
  { value: 'Last Week', label: 'Last Week' },
  { value: 'Last Month', label: 'Last Month' },
  { value: 'Last 3 Months', label: 'Last 3 Months' },
  { value: 'Last 6 Months', label: 'Last 6 Months' },
  { value: 'Last Year', label: 'Last Year' },
  { value: 'Custom Range', label: 'Custom Range' }
];

const ANALYSIS_TYPES = [
  {
    value: 'correlation',
    label: 'Correlation Analysis',
    description: 'Analyze relationships between water quality parameters',
    icon: '🔗'
  },
  {
    value: 'trend',
    label: 'Trend Analysis',
    description: 'Identify temporal patterns and trends over time',
    icon: '📈'
  },
  {
    value: 'anomaly',
    label: 'Anomaly Detection',
    description: 'Detect unusual patterns and outliers in data',
    icon: '🚨'
  },
  {
    value: 'forecast',
    label: 'Forecasting',
    description: 'Predict future water quality trends',
    icon: '🔮'
  },
  {
    value: 'comprehensive',
    label: 'Comprehensive Analysis',
    description: 'Complete analysis including all methods',
    icon: '🎯'
  }
];

const AnalyticsControlPanel: React.FC<AnalyticsControlPanelProps> = ({
  onConfigChange,
  onRunAnalysis,
  loading = false,
  availableSites,
  availableParameters,
  initialConfig = {}
}) => {
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced'>('basic');
  const [estimatedComplexity, setEstimatedComplexity] = useState<'low' | 'medium' | 'high'>('low');
  const { showSuccess, showError, showInfo } = useToast();

  // Get validation rules
  const validationRules = createAnalyticsValidation();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid, isDirty },
    reset
  } = useForm<AnalyticsFormData>({
    mode: 'onChange',
    defaultValues: {
      analysisType: initialConfig.analysisType || 'correlation',
      timeRange: initialConfig.timeRange || 'Last Month',
      selectedSites: initialConfig.selectedSites || [],
      selectedParameters: initialConfig.selectedParameters || [],
      correlationMethod: initialConfig.advancedOptions?.correlationMethod || 'pearson',
      trendMethod: initialConfig.advancedOptions?.trendMethod || 'linear',
      anomalyThreshold: initialConfig.advancedOptions?.anomalyThreshold || 2.0,
      forecastPeriods: initialConfig.advancedOptions?.forecastPeriods || 30,
      confidenceLevel: initialConfig.advancedOptions?.confidenceLevel || 0.95,
      includeSeasonality: initialConfig.advancedOptions?.includeSeasonality || true,
      detectOutliers: initialConfig.advancedOptions?.detectOutliers || true,
      smoothData: initialConfig.advancedOptions?.smoothData || true,
      generateReport: false,
      exportResults: false
    }
  });

  // Watch form values for real-time updates
  const watchedValues = watch();
  const selectedAnalysisType = watch('analysisType');
  const selectedSites = watch('selectedSites');
  const selectedParameters = watch('selectedParameters');

  // Calculate estimated complexity
  useEffect(() => {
    const siteCount = selectedSites.length;
    const paramCount = selectedParameters.length;
    const isComprehensive = selectedAnalysisType === 'comprehensive';

    if (isComprehensive || (siteCount > 5 && paramCount > 10)) {
      setEstimatedComplexity('high');
    } else if (siteCount > 2 && paramCount > 5) {
      setEstimatedComplexity('medium');
    } else {
      setEstimatedComplexity('low');
    }
  }, [selectedAnalysisType, selectedSites, selectedParameters]);

  // Update parent config when form changes
  useEffect(() => {
    if (isDirty && isValid) {
      const config: AnalyticsConfig = {
        timeRange: watchedValues.timeRange,
        selectedSites: watchedValues.selectedSites,
        selectedParameters: watchedValues.selectedParameters,
        analysisType: watchedValues.analysisType,
        advancedOptions: {
          correlationMethod: watchedValues.correlationMethod,
          trendMethod: watchedValues.trendMethod,
          anomalyThreshold: watchedValues.anomalyThreshold,
          forecastPeriods: watchedValues.forecastPeriods,
          confidenceLevel: watchedValues.confidenceLevel,
          includeSeasonality: watchedValues.includeSeasonality,
          detectOutliers: watchedValues.detectOutliers,
          smoothData: watchedValues.smoothData
        }
      };
      onConfigChange(config);
    }
  }, [watchedValues, isDirty, isValid, onConfigChange]);

  const onSubmit: SubmitHandler<AnalyticsFormData> = async (data) => {
    try {
      const config: AnalyticsConfig = {
        timeRange: data.timeRange,
        selectedSites: data.selectedSites,
        selectedParameters: data.selectedParameters,
        analysisType: data.analysisType,
        advancedOptions: {
          correlationMethod: data.correlationMethod,
          trendMethod: data.trendMethod,
          anomalyThreshold: data.anomalyThreshold,
          forecastPeriods: data.forecastPeriods,
          confidenceLevel: data.confidenceLevel,
          includeSeasonality: data.includeSeasonality,
          detectOutliers: data.detectOutliers,
          smoothData: data.smoothData
        }
      };

      showInfo(`Starting ${ANALYSIS_TYPES.find(t => t.value === data.analysisType)?.label}...`, {
        duration: 2000
      });

      await onRunAnalysis(config);

      showSuccess('Analysis completed successfully!', {
        duration: 4000
      });
    } catch (error) {
      showError(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        duration: 6000
      });
    }
  };

  const handleSelectAllSites = () => {
    setValue('selectedSites', availableSites, { shouldValidate: true, shouldDirty: true });
  };

  const handleSelectAllParameters = () => {
    setValue('selectedParameters', availableParameters, { shouldValidate: true, shouldDirty: true });
  };

  const handleResetForm = () => {
    reset();
    showInfo('Form reset to default values');
  };

  const getComplexityColor = () => {
    switch (estimatedComplexity) {
      case 'high': return 'danger';
      case 'medium': return 'warning';
      default: return 'success';
    }
  };

  const getEstimatedTime = () => {
    switch (estimatedComplexity) {
      case 'high': return '2-5 minutes';
      case 'medium': return '30-120 seconds';
      default: return '10-30 seconds';
    }
  };

  return (
    <Card className="analytics-control-panel">
      <Card.Header>
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h5 className="mb-1">
              <i className="bi bi-gear-fill me-2"></i>
              Analytics Configuration
            </h5>
            <small className="text-muted">Configure and run advanced water quality analytics</small>
          </div>
          <div className="d-flex align-items-center gap-2">
            <Badge bg={getComplexityColor()}>
              {estimatedComplexity.toUpperCase()} COMPLEXITY
            </Badge>
            <Badge bg="info">
              ~{getEstimatedTime()}
            </Badge>
          </div>
        </div>
      </Card.Header>

      <Card.Body>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* Navigation Tabs */}
          <div className="analytics-tabs mb-3">
            <Button
              variant={activeTab === 'basic' ? 'primary' : 'outline-primary'}
              size="sm"
              onClick={() => setActiveTab('basic')}
            >
              <i className="bi bi-sliders me-1"></i>
              Basic Configuration
            </Button>
            <Button
              variant={activeTab === 'advanced' ? 'primary' : 'outline-primary'}
              size="sm"
              onClick={() => setActiveTab('advanced')}
              className="ms-2"
            >
              <i className="bi bi-cpu me-1"></i>
              Advanced Options
            </Button>
          </div>

          {activeTab === 'basic' && (
            <div className="basic-config">
              <Row>
                {/* Analysis Type Selection */}
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="form-label-required">
                      Analysis Type
                    </Form.Label>
                    <div className="analysis-type-grid">
                      {ANALYSIS_TYPES.map((type) => (
                        <div key={type.value} className="analysis-type-option">
                          <Form.Check
                            {...register('analysisType', validationRules.analysisType)}
                            type="radio"
                            id={`analysis-${type.value}`}
                            value={type.value}
                            label={
                              <div>
                                <span className="analysis-icon">{type.icon}</span>
                                <strong>{type.label}</strong>
                                <small className="d-block text-muted">{type.description}</small>
                              </div>
                            }
                            className={errors.analysisType ? 'is-invalid' : ''}
                          />
                        </div>
                      ))}
                    </div>
                    {errors.analysisType && (
                      <div className="invalid-feedback d-block">
                        {errors.analysisType.message}
                      </div>
                    )}
                  </Form.Group>
                </Col>

                {/* Time Range */}
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="form-label-required">
                      Time Range
                    </Form.Label>
                    <Form.Select
                      {...register('timeRange', validationRules.timeRange)}
                      className={errors.timeRange ? 'is-invalid' : ''}
                    >
                      {TIME_RANGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Form.Select>
                    {errors.timeRange && (
                      <div className="invalid-feedback">
                        {errors.timeRange.message}
                      </div>
                    )}
                  </Form.Group>

                  {/* Custom Date Range */}
                  {watchedValues.timeRange === 'Custom Range' && (
                    <Row>
                      <Col>
                        <Form.Group className="mb-3">
                          <Form.Label>Start Date</Form.Label>
                          <Form.Control
                            {...register('customStartDate')}
                            type="datetime-local"
                            className={errors.customStartDate ? 'is-invalid' : ''}
                          />
                          {errors.customStartDate && (
                            <div className="invalid-feedback">
                              {errors.customStartDate.message}
                            </div>
                          )}
                        </Form.Group>
                      </Col>
                      <Col>
                        <Form.Group className="mb-3">
                          <Form.Label>End Date</Form.Label>
                          <Form.Control
                            {...register('customEndDate')}
                            type="datetime-local"
                            className={errors.customEndDate ? 'is-invalid' : ''}
                          />
                          {errors.customEndDate && (
                            <div className="invalid-feedback">
                              {errors.customEndDate.message}
                            </div>
                          )}
                        </Form.Group>
                      </Col>
                    </Row>
                  )}
                </Col>
              </Row>

              <Row>
                {/* Site Selection */}
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <div className="d-flex justify-content-between align-items-center">
                      <Form.Label className="form-label-required">
                        Monitoring Sites ({selectedSites.length} selected)
                      </Form.Label>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={handleSelectAllSites}
                        type="button"
                      >
                        Select All
                      </Button>
                    </div>
                    <div className="site-selection-grid">
                      {availableSites.map((site) => (
                        <Form.Check
                          key={site}
                          {...register('selectedSites', validationRules.selectedSites)}
                          type="checkbox"
                          id={`site-${site}`}
                          value={site}
                          label={site}
                          className={errors.selectedSites ? 'is-invalid' : ''}
                        />
                      ))}
                    </div>
                    {errors.selectedSites && (
                      <div className="invalid-feedback d-block">
                        {errors.selectedSites.message}
                      </div>
                    )}
                  </Form.Group>
                </Col>

                {/* Parameter Selection */}
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <div className="d-flex justify-content-between align-items-center">
                      <Form.Label className="form-label-required">
                        Parameters ({selectedParameters.length} selected)
                      </Form.Label>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={handleSelectAllParameters}
                        type="button"
                      >
                        Select All
                      </Button>
                    </div>
                    <div className="parameter-selection-grid">
                      {availableParameters.map((param) => (
                        <Form.Check
                          key={param}
                          {...register('selectedParameters', validationRules.selectedParameters)}
                          type="checkbox"
                          id={`param-${param}`}
                          value={param}
                          label={param}
                          className={errors.selectedParameters ? 'is-invalid' : ''}
                        />
                      ))}
                    </div>
                    {errors.selectedParameters && (
                      <div className="invalid-feedback d-block">
                        {errors.selectedParameters.message}
                      </div>
                    )}
                  </Form.Group>
                </Col>
              </Row>
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="advanced-config">
              <Row>
                {/* Correlation Options */}
                {(selectedAnalysisType === 'correlation' || selectedAnalysisType === 'comprehensive') && (
                  <Col md={4}>
                    <Card className="mb-3">
                      <Card.Header className="py-2">
                        <small className="fw-bold">🔗 Correlation Analysis</small>
                      </Card.Header>
                      <Card.Body className="py-2">
                        <Form.Group className="mb-2">
                          <Form.Label>Correlation Method</Form.Label>
                          <Form.Select
                            {...register('correlationMethod')}
                            size="sm"
                          >
                            <option value="pearson">Pearson (Linear)</option>
                            <option value="spearman">Spearman (Rank)</option>
                            <option value="kendall">Kendall (Tau)</option>
                          </Form.Select>
                        </Form.Group>
                      </Card.Body>
                    </Card>
                  </Col>
                )}

                {/* Trend Analysis Options */}
                {(selectedAnalysisType === 'trend' || selectedAnalysisType === 'comprehensive') && (
                  <Col md={4}>
                    <Card className="mb-3">
                      <Card.Header className="py-2">
                        <small className="fw-bold">📈 Trend Analysis</small>
                      </Card.Header>
                      <Card.Body className="py-2">
                        <Form.Group className="mb-2">
                          <Form.Label>Trend Method</Form.Label>
                          <Form.Select
                            {...register('trendMethod')}
                            size="sm"
                          >
                            <option value="linear">Linear Regression</option>
                            <option value="polynomial">Polynomial Fit</option>
                            <option value="seasonal">Seasonal Decomposition</option>
                          </Form.Select>
                        </Form.Group>
                        <Form.Group>
                          <Form.Check
                            {...register('includeSeasonality')}
                            type="checkbox"
                            label="Include Seasonality"
                            size="sm"
                          />
                        </Form.Group>
                      </Card.Body>
                    </Card>
                  </Col>
                )}

                {/* Anomaly Detection Options */}
                {(selectedAnalysisType === 'anomaly' || selectedAnalysisType === 'comprehensive') && (
                  <Col md={4}>
                    <Card className="mb-3">
                      <Card.Header className="py-2">
                        <small className="fw-bold">🚨 Anomaly Detection</small>
                      </Card.Header>
                      <Card.Body className="py-2">
                        <Form.Group className="mb-2">
                          <Form.Label>
                            Anomaly Threshold: {watchedValues.anomalyThreshold}σ
                          </Form.Label>
                          <Form.Range
                            {...register('anomalyThreshold', validationRules.anomalyThreshold)}
                            min="0.1"
                            max="5.0"
                            step="0.1"
                            className={errors.anomalyThreshold ? 'is-invalid' : ''}
                          />
                          {errors.anomalyThreshold && (
                            <div className="invalid-feedback d-block">
                              {errors.anomalyThreshold.message}
                            </div>
                          )}
                        </Form.Group>
                      </Card.Body>
                    </Card>
                  </Col>
                )}
              </Row>

              {/* Forecasting Options */}
              {(selectedAnalysisType === 'forecast' || selectedAnalysisType === 'comprehensive') && (
                <Row>
                  <Col md={6}>
                    <Card className="mb-3">
                      <Card.Header className="py-2">
                        <small className="fw-bold">🔮 Forecasting</small>
                      </Card.Header>
                      <Card.Body className="py-2">
                        <Row>
                          <Col md={6}>
                            <Form.Group className="mb-2">
                              <Form.Label>Forecast Periods (days)</Form.Label>
                              <Form.Control
                                {...register('forecastPeriods', validationRules.forecastPeriods)}
                                type="number"
                                min="1"
                                max="365"
                                size="sm"
                                className={errors.forecastPeriods ? 'is-invalid' : ''}
                              />
                              {errors.forecastPeriods && (
                                <div className="invalid-feedback">
                                  {errors.forecastPeriods.message}
                                </div>
                              )}
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group className="mb-2">
                              <Form.Label>
                                Confidence Level: {Math.round(watchedValues.confidenceLevel * 100)}%
                              </Form.Label>
                              <Form.Range
                                {...register('confidenceLevel', validationRules.confidenceLevel)}
                                min="0.5"
                                max="0.99"
                                step="0.01"
                                className={errors.confidenceLevel ? 'is-invalid' : ''}
                              />
                              {errors.confidenceLevel && (
                                <div className="invalid-feedback d-block">
                                  {errors.confidenceLevel.message}
                                </div>
                              )}
                            </Form.Group>
                          </Col>
                        </Row>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              )}

              {/* Data Processing Options */}
              <Row>
                <Col md={6}>
                  <Card className="mb-3">
                    <Card.Header className="py-2">
                      <small className="fw-bold">⚙️ Data Processing</small>
                    </Card.Header>
                    <Card.Body className="py-2">
                      <Form.Check
                        {...register('detectOutliers')}
                        type="checkbox"
                        label="Detect and Handle Outliers"
                        className="mb-2"
                      />
                      <Form.Check
                        {...register('smoothData')}
                        type="checkbox"
                        label="Apply Data Smoothing"
                        className="mb-2"
                      />
                    </Card.Body>
                  </Card>
                </Col>

                {/* Output Options */}
                <Col md={6}>
                  <Card className="mb-3">
                    <Card.Header className="py-2">
                      <small className="fw-bold">📄 Output Options</small>
                    </Card.Header>
                    <Card.Body className="py-2">
                      <Form.Check
                        {...register('generateReport')}
                        type="checkbox"
                        label="Generate Detailed Report"
                        className="mb-2"
                      />
                      <Form.Check
                        {...register('exportResults')}
                        type="checkbox"
                        label="Export Results to File"
                        className="mb-2"
                      />
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            </div>
          )}

          {/* Analysis Progress */}
          {loading && (
            <Alert variant="info" className="mb-3">
              <div className="d-flex align-items-center">
                <div className="spinner-border spinner-border-sm me-2" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <div className="flex-grow-1">
                  <strong>Analysis in Progress</strong>
                  <div className="mt-1">
                    <small>Processing {selectedSites.length} sites and {selectedParameters.length} parameters...</small>
                  </div>
                  <ProgressBar
                    animated
                    variant="info"
                    now={100}
                    className="mt-2"
                    style={{ height: '4px' }}
                  />
                </div>
              </div>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <Button
                variant="outline-secondary"
                onClick={handleResetForm}
                disabled={loading}
                type="button"
              >
                <i className="bi bi-arrow-clockwise me-1"></i>
                Reset
              </Button>
            </div>

            <div className="d-flex gap-2">
              <Button
                variant="outline-primary"
                disabled={!isValid || loading}
                onClick={() => {
                  const config: AnalyticsConfig = {
                    timeRange: watchedValues.timeRange,
                    selectedSites: watchedValues.selectedSites,
                    selectedParameters: watchedValues.selectedParameters,
                    analysisType: watchedValues.analysisType,
                    advancedOptions: {
                      correlationMethod: watchedValues.correlationMethod,
                      trendMethod: watchedValues.trendMethod,
                      anomalyThreshold: watchedValues.anomalyThreshold,
                      forecastPeriods: watchedValues.forecastPeriods,
                      confidenceLevel: watchedValues.confidenceLevel,
                      includeSeasonality: watchedValues.includeSeasonality,
                      detectOutliers: watchedValues.detectOutliers,
                      smoothData: watchedValues.smoothData
                    }
                  };
                  onConfigChange(config);
                  showInfo('Configuration preview updated');
                }}
                type="button"
              >
                <i className="bi bi-eye me-1"></i>
                Preview Config
              </Button>

              <Button
                variant="primary"
                type="submit"
                disabled={!isValid || loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <i className="bi bi-play-fill me-1"></i>
                    Run Analysis
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </Card.Body>
    </Card>
  );
};

export default AnalyticsControlPanel;