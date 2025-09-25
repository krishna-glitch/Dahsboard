import React, { useEffect, useState } from 'react';
import { useForm, Controller, SubmitHandler } from 'react-hook-form';
import Select from 'react-select';
import { useAuth } from '../contexts/authUtils';
import { useToast } from '../components/modern/toastUtils';
import { SettingsFormData, TimeRangeOption, ChartTypeOption, ExportFormatOption, ThemeOption } from '../types/settings';
import { createSettingsValidation } from '../utils/formValidation';
import Icon from '../components/modern/Icon';
import styles from './ModernSettings.module.css';

/**
 * Modern User Settings Page - React Hook Form + TypeScript Implementation
 * Essential user preferences and account settings for water quality monitoring
 */
const ModernSettings: React.FC = () => {
  const { user } = useAuth();
  const { showSuccess, showError, showInfo } = useToast();

  // Loading state
  const [loading, setLoading] = useState(false);

  // Get validation rules
  const validationRules = createSettingsValidation();

  // Options for form selects
  const timeRangeOptions: TimeRangeOption[] = [
    { value: '1d', label: 'Last 24 Hours', days: 1 },
    { value: '7d', label: 'Last Week', days: 7 },
    { value: '30d', label: 'Last Month', days: 30 },
    { value: '90d', label: 'Last Quarter', days: 90 },
    { value: '365d', label: 'Last Year', days: 365 }
  ];

  const chartTypeOptions: ChartTypeOption[] = [
    { value: 'line', label: 'Line Chart', description: 'Time series data', icon: 'bi-graph-up' },
    { value: 'scatter', label: 'Scatter Plot', description: 'Data points', icon: 'bi-scatter-chart' },
    { value: 'bar', label: 'Bar Chart', description: 'Categorical data', icon: 'bi-bar-chart' },
    { value: 'heatmap', label: 'Heatmap', description: 'Matrix view', icon: 'bi-grid-3x3' }
  ];

  const exportFormatOptions: ExportFormatOption[] = [
    { value: 'xlsx', label: 'Excel', description: 'Microsoft Excel format', fileExtension: 'xlsx' },
    { value: 'csv', label: 'CSV', description: 'Comma-separated values', fileExtension: 'csv' },
    { value: 'json', label: 'JSON', description: 'JavaScript Object Notation', fileExtension: 'json' },
    { value: 'pdf', label: 'PDF', description: 'Portable Document Format', fileExtension: 'pdf' }
  ];

  const themeOptions: ThemeOption[] = [
    { value: 'light', label: 'Light Theme', description: 'Clean and bright interface' },
    { value: 'dark', label: 'Dark Theme', description: 'Easy on the eyes' },
    { value: 'auto', label: 'System Default', description: 'Match device settings' }
  ];

  const siteOptions = [
    { value: 'S1', label: 'Site 1 - Upper Stream' },
    { value: 'S2', label: 'Site 2 - Mid Stream' },
    { value: 'S3', label: 'Site 3 - Lower Stream' },
    { value: 'S4', label: 'Site 4 - Downstream' }
  ];

  // React Hook Form setup
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty, isSubmitting },
    reset
  } = useForm<SettingsFormData>({
    defaultValues: {
      // Dashboard preferences
      defaultTimeRange: '30d',
      defaultSites: ['S1', 'S2'],
      autoRefresh: true,
      refreshInterval: 300,

      // Data display preferences
      defaultChartType: 'line',
      showDataPoints: true,
      compactTables: false,
      rowsPerPage: 50,

      // Notifications
      emailAlerts: true,
      browserNotifications: false,
      alertThresholds: true,

      // Export preferences
      defaultExportFormat: 'xlsx',
      includeMetadata: true,

      // Theme and display
      theme: 'auto',
      language: 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    mode: 'onChange'
  });

  // Watch form values
  const watchedValues = watch();

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('userSettings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings) as Partial<SettingsFormData>;
        reset(parsed);
        showInfo('Settings loaded from previous session');
      } catch (err) {
        console.warn('Failed to parse saved settings:', err);
        showError('Failed to load saved settings');
      }
    }
  }, [reset, showInfo, showError]);

  // Handle form submission
  const onSubmit: SubmitHandler<SettingsFormData> = async (data) => {
    try {
      setLoading(true);

      // Save to localStorage
      localStorage.setItem('userSettings', JSON.stringify(data));

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Apply theme immediately
      if (data.theme !== 'auto') {
        document.documentElement.setAttribute('data-theme', data.theme);
      } else {
        document.documentElement.removeAttribute('data-theme');
      }

      showSuccess('Settings saved successfully!');

    } catch (error) {
      showError(`Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle reset to defaults
  const handleResetDefaults = () => {
    reset({
      defaultTimeRange: '30d',
      defaultSites: ['S1', 'S2'],
      autoRefresh: true,
      refreshInterval: 300,
      defaultChartType: 'line',
      showDataPoints: true,
      compactTables: false,
      rowsPerPage: 50,
      emailAlerts: true,
      browserNotifications: false,
      alertThresholds: true,
      defaultExportFormat: 'xlsx',
      includeMetadata: true,
      theme: 'auto',
      language: 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    showInfo('Settings reset to defaults');
  };

  return (
    <div className={styles.settingsContainer}>
      <div className={styles.settingsHeader}>
        <div className={styles.headerContent}>
          <div className={styles.headerIcon}>
            <Icon name="gear" size="2rem" />
          </div>
          <div className={styles.headerText}>
            <h1 className={styles.pageTitle}>User Settings</h1>
            <p className={styles.pageDescription}>
              Customize your water quality monitoring experience
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Row>
          <Col lg={8}>
            <Accordion defaultActiveKey="dashboard" flush>
              {/* Dashboard Preferences */}
              <Accordion.Item eventKey="dashboard">
                <Accordion.Header>
                  <i className="bi bi-speedometer2 me-2"></i>
                  Dashboard Preferences
                </Accordion.Header>
                <Accordion.Body>
                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Default Time Range</Form.Label>
                        <Controller
                          name="defaultTimeRange"
                          control={control}
                          rules={validationRules.defaultTimeRange}
                          render={({ field }) => (
                            <Form.Select
                              {...field}
                              isInvalid={!!errors.defaultTimeRange}
                            >
                              {timeRangeOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Form.Select>
                          )}
                        />
                        {errors.defaultTimeRange && (
                          <Form.Control.Feedback type="invalid">
                            {errors.defaultTimeRange.message}
                          </Form.Control.Feedback>
                        )}
                      </Form.Group>
                    </Col>

                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Auto Refresh Interval (seconds)</Form.Label>
                        <Controller
                          name="refreshInterval"
                          control={control}
                          rules={validationRules.refreshInterval}
                          render={({ field }) => (
                            <Form.Control
                              {...field}
                              type="number"
                              min="30"
                              max="3600"
                              disabled={!watchedValues.autoRefresh}
                              isInvalid={!!errors.refreshInterval}
                            />
                          )}
                        />
                        {errors.refreshInterval && (
                          <Form.Control.Feedback type="invalid">
                            {errors.refreshInterval.message}
                          </Form.Control.Feedback>
                        )}
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col>
                      <Form.Group className="mb-3">
                        <Form.Label>Default Sites</Form.Label>
                        <Controller
                          name="defaultSites"
                          control={control}
                          rules={validationRules.defaultSites}
                          render={({ field }) => (
                            <div>
                              {siteOptions.map(site => (
                                <Form.Check
                                  key={site.value}
                                  type="checkbox"
                                  id={`site-${site.value}`}
                                  label={site.label}
                                  checked={field.value.includes(site.value)}
                                  onChange={(e) => {
                                    const newSites = e.target.checked
                                      ? [...field.value, site.value]
                                      : field.value.filter(s => s !== site.value);
                                    field.onChange(newSites);
                                  }}
                                  className="mb-1"
                                />
                              ))}
                              {errors.defaultSites && (
                                <div className="text-danger small mt-1">
                                  {errors.defaultSites.message}
                                </div>
                              )}
                            </div>
                          )}
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Controller
                    name="autoRefresh"
                    control={control}
                    render={({ field }) => (
                      <Form.Check
                        {...field}
                        type="switch"
                        label="Auto-refresh dashboard data"
                        checked={field.value}
                      />
                    )}
                  />
                </Accordion.Body>
              </Accordion.Item>

              {/* Display Preferences */}
              <Accordion.Item eventKey="display">
                <Accordion.Header>
                  <i className="bi bi-display me-2"></i>
                  Display Preferences
                </Accordion.Header>
                <Accordion.Body>
                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Default Chart Type</Form.Label>
                        <Controller
                          name="defaultChartType"
                          control={control}
                          rules={validationRules.defaultChartType}
                          render={({ field }) => (
                            <Form.Select
                              {...field}
                              isInvalid={!!errors.defaultChartType}
                            >
                              {chartTypeOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label} - {option.description}
                                </option>
                              ))}
                            </Form.Select>
                          )}
                        />
                        {errors.defaultChartType && (
                          <Form.Control.Feedback type="invalid">
                            {errors.defaultChartType.message}
                          </Form.Control.Feedback>
                        )}
                      </Form.Group>
                    </Col>

                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Rows Per Page</Form.Label>
                        <Controller
                          name="rowsPerPage"
                          control={control}
                          rules={validationRules.rowsPerPage}
                          render={({ field }) => (
                            <Form.Select
                              {...field}
                              isInvalid={!!errors.rowsPerPage}
                            >
                              <option value={10}>10 rows</option>
                              <option value={25}>25 rows</option>
                              <option value={50}>50 rows</option>
                              <option value={100}>100 rows</option>
                            </Form.Select>
                          )}
                        />
                        {errors.rowsPerPage && (
                          <Form.Control.Feedback type="invalid">
                            {errors.rowsPerPage.message}
                          </Form.Control.Feedback>
                        )}
                      </Form.Group>
                    </Col>
                  </Row>

                  <div className="mb-3">
                    <Controller
                      name="showDataPoints"
                      control={control}
                      render={({ field }) => (
                        <Form.Check
                          {...field}
                          type="switch"
                          label="Show individual data points on charts"
                          checked={field.value}
                          className="mb-2"
                        />
                      )}
                    />
                    <Controller
                      name="compactTables"
                      control={control}
                      render={({ field }) => (
                        <Form.Check
                          {...field}
                          type="switch"
                          label="Use compact table layout"
                          checked={field.value}
                        />
                      )}
                    />
                  </div>
                </Accordion.Body>
              </Accordion.Item>

              {/* Theme */}
              <Accordion.Item eventKey="theme">
                <Accordion.Header>
                  <i className="bi bi-palette me-2"></i>
                  Theme & Appearance
                </Accordion.Header>
                <Accordion.Body>
                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Theme</Form.Label>
                        <Controller
                          name="theme"
                          control={control}
                          rules={validationRules.theme}
                          render={({ field }) => (
                            <Form.Select
                              {...field}
                              isInvalid={!!errors.theme}
                            >
                              {themeOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label} - {option.description}
                                </option>
                              ))}
                            </Form.Select>
                          )}
                        />
                        {errors.theme && (
                          <Form.Control.Feedback type="invalid">
                            {errors.theme.message}
                          </Form.Control.Feedback>
                        )}
                      </Form.Group>
                    </Col>

                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Timezone</Form.Label>
                        <Controller
                          name="timezone"
                          control={control}
                          rules={validationRules.timezone}
                          render={({ field }) => (
                            <Form.Control
                              {...field}
                              type="text"
                              readOnly
                              isInvalid={!!errors.timezone}
                              placeholder="Auto-detected timezone"
                            />
                          )}
                        />
                        {errors.timezone && (
                          <Form.Control.Feedback type="invalid">
                            {errors.timezone.message}
                          </Form.Control.Feedback>
                        )}
                      </Form.Group>
                    </Col>
                  </Row>
                </Accordion.Body>
              </Accordion.Item>

              {/* Notifications */}
              <Accordion.Item eventKey="notifications">
                <Accordion.Header>
                  <i className="bi bi-bell me-2"></i>
                  Notifications
                </Accordion.Header>
                <Accordion.Body>
                  <div className="mb-3">
                    <Controller
                      name="emailAlerts"
                      control={control}
                      render={({ field }) => (
                        <Form.Check
                          {...field}
                          type="switch"
                          label="Email alerts for threshold violations"
                          checked={field.value}
                          className="mb-2"
                        />
                      )}
                    />
                    <Controller
                      name="browserNotifications"
                      control={control}
                      render={({ field }) => (
                        <Form.Check
                          {...field}
                          type="switch"
                          label="Browser notifications"
                          checked={field.value}
                          className="mb-2"
                        />
                      )}
                    />
                    <Controller
                      name="alertThresholds"
                      control={control}
                      render={({ field }) => (
                        <Form.Check
                          {...field}
                          type="switch"
                          label="Show alert threshold lines on charts"
                          checked={field.value}
                        />
                      )}
                    />
                  </div>
                </Accordion.Body>
              </Accordion.Item>

              {/* Export Preferences */}
              <Accordion.Item eventKey="export">
                <Accordion.Header>
                  <i className="bi bi-download me-2"></i>
                  Export Preferences
                </Accordion.Header>
                <Accordion.Body>
                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Default Export Format</Form.Label>
                        <Controller
                          name="defaultExportFormat"
                          control={control}
                          rules={validationRules.defaultExportFormat}
                          render={({ field }) => (
                            <Form.Select
                              {...field}
                              isInvalid={!!errors.defaultExportFormat}
                            >
                              {exportFormatOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label} - {option.description}
                                </option>
                              ))}
                            </Form.Select>
                          )}
                        />
                        {errors.defaultExportFormat && (
                          <Form.Control.Feedback type="invalid">
                            {errors.defaultExportFormat.message}
                          </Form.Control.Feedback>
                        )}
                      </Form.Group>
                    </Col>
                  </Row>

                  <Controller
                    name="includeMetadata"
                    control={control}
                    render={({ field }) => (
                      <Form.Check
                        {...field}
                        type="switch"
                        label="Include metadata in exports"
                        checked={field.value}
                      />
                    )}
                  />
                </Accordion.Body>
              </Accordion.Item>
            </Accordion>
          </Col>

          {/* Sidebar */}
          <Col lg={4}>
            <Card className="position-sticky" style={{ top: '20px' }}>
              <Card.Header>
                <h6 className="mb-0">
                  <i className="bi bi-person-circle me-2"></i>
                  Account Information
                </h6>
              </Card.Header>
              <Card.Body>
                <div className="mb-3">
                  <small className="text-muted">Username</small>
                  <div className="fw-medium">{user?.username || 'Unknown'}</div>
                </div>
                <div className="mb-3">
                  <small className="text-muted">Role</small>
                  <div className="fw-medium">{user?.role || 'User'}</div>
                </div>
                <div className="mb-4">
                  <small className="text-muted">Last Login</small>
                  <div className="fw-medium">
                    {user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Unknown'}
                  </div>
                </div>

                <div className="d-grid gap-2">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!isDirty || loading}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-check-lg me-2"></i>
                        Save Settings
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="outline-secondary"
                    onClick={handleResetDefaults}
                    disabled={loading}
                  >
                    <i className="bi bi-arrow-clockwise me-2"></i>
                    Reset to Defaults
                  </Button>
                </div>

                {isDirty && (
                  <Alert variant="info" className="mt-3 mb-0">
                    <small>You have unsaved changes</small>
                  </Alert>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </form>
    </Container>
  );
};

export default ModernSettings;