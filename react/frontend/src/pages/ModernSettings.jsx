import React, { useState, useEffect } from 'react';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import { useAuth } from '../contexts/authUtils';
import { useToast } from '../components/modern/toastUtils';

/**
 * Modern User Settings Page
 * Essential user preferences and account settings for water quality monitoring
 */
const ModernSettings = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  
  // Settings state
  const [settings, setSettings] = useState({
    // Dashboard preferences
    defaultTimeRange: '7d',
    defaultSites: [],
    autoRefresh: true,
    refreshInterval: 300, // seconds
    
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
    theme: 'auto', // light, dark, auto
    language: 'en',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  
  const [saveStatus, setSaveStatus] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Site options for multi-select
  const siteOptions = [
    { value: 'S1', label: 'Site 1' },
    { value: 'S2', label: 'Site 2' }, 
    { value: 'S3', label: 'Site 3' },
    { value: 'S4', label: 'Site 4' }
  ];

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('userSettings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (err) {
        console.warn('Failed to parse saved settings:', err);
      }
    }
  }, []);

  // Handle setting changes
  const handleSettingChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  // Handle array settings (like sites)
  const handleArraySetting = (key, value, checked) => {
    setSettings(prev => ({
      ...prev,
      [key]: checked 
        ? [...prev[key], value]
        : prev[key].filter(item => item !== value)
    }));
    setHasChanges(true);
  };

  // Save settings
  const handleSave = async () => {
    try {
      setSaveStatus('saving');
      
      // Save to localStorage
      localStorage.setItem('userSettings', JSON.stringify(settings));
      
      // In a real app, you'd also save to backend
      // await api.post('/user/settings', settings);
      
      setSaveStatus('success');
      setHasChanges(false);
      
      addToast({
        type: 'success',
        title: 'Settings Saved',
        message: 'Your preferences have been saved successfully.'
      });
      
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error('Settings save error:', err);
      setSaveStatus('error');
      addToast({
        type: 'error', 
        title: 'Save Failed',
        message: 'Failed to save settings. Please try again.'
      });
    }
  };

  // Reset to defaults
  const handleReset = () => {
    const defaults = {
      defaultTimeRange: '7d',
      defaultSites: [],
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
    };
    
    setSettings(defaults);
    setHasChanges(true);
    
    addToast({
      type: 'info',
      title: 'Settings Reset',
      message: 'Settings have been reset to defaults. Click Save to apply.'
    });
  };

  return (
    <Container fluid className="modern-page">
      <div className="page-header">
        <Row className="align-items-center">
          <Col>
            <h1>
              <i className="bi bi-gear-fill me-3"></i>
              Settings
            </h1>
            <p className="page-overview mb-0">
              Manage your preferences and account settings
            </p>
          </Col>
          <Col xs="auto">
            <div className="d-flex gap-2">
              <Button 
                variant="outline-secondary" 
                onClick={handleReset}
                disabled={saveStatus === 'saving'}
              >
                <i className="bi bi-arrow-clockwise me-2"></i>
                Reset to Defaults
              </Button>
              <Button 
                variant="primary" 
                onClick={handleSave}
                disabled={!hasChanges || saveStatus === 'saving'}
              >
                {saveStatus === 'saving' ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2"></span>
                    Saving...
                  </>
                ) : (
                  <>
                    <i className="bi bi-check-circle me-2"></i>
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </Col>
        </Row>
      </div>

      {saveStatus === 'success' && (
        <Alert variant="success" className="mb-4">
          <i className="bi bi-check-circle-fill me-2"></i>
          Settings saved successfully!
        </Alert>
      )}

      <Row>
        {/* Account Information */}
        <Col xl={4}>
          <Card className="card h-100">
            <Card.Header>
              <h5 className="mb-0">
                <i className="bi bi-person-circle me-2"></i>
                Account Information
              </h5>
            </Card.Header>
            <Card.Body>
              <div className="mb-3">
                <strong>Username:</strong> {user?.username || 'Unknown'}
              </div>
              <div className="mb-3">
                <strong>Role:</strong>{' '}
                <Badge bg="primary" className="ms-1">
                  {user?.role || 'User'}
                </Badge>
              </div>
              <div className="mb-3">
                <strong>Last Login:</strong> {new Date().toLocaleDateString()}
              </div>
              <hr />
              <div className="text-muted small">
                <i className="bi bi-info-circle me-2"></i>
                To change account details, contact your administrator.
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Dashboard Preferences */}
        <Col xl={8}>
          <Card className="card mb-4">
            <Card.Header>
              <h5 className="mb-0">
                <i className="bi bi-speedometer2 me-2"></i>
                Dashboard Preferences
              </h5>
            </Card.Header>
            <Card.Body>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Default Time Range</Form.Label>
                    <Form.Select 
                      value={settings.defaultTimeRange}
                      onChange={(e) => handleSettingChange('defaultTimeRange', e.target.value)}
                    >
                      <option value="1d">Last 1 Day</option>
                      <option value="7d">Last 7 Days</option>
                      <option value="30d">Last 30 Days</option>
                      <option value="90d">Last 90 Days</option>
                      <option value="1y">Last Year</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Auto Refresh</Form.Label>
                    <div className="d-flex gap-3">
                      <Form.Check
                        type="switch"
                        checked={settings.autoRefresh}
                        onChange={(e) => handleSettingChange('autoRefresh', e.target.checked)}
                        label={settings.autoRefresh ? 'Enabled' : 'Disabled'}
                      />
                    </div>
                  </Form.Group>
                </Col>
              </Row>
              
              {settings.autoRefresh && (
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Refresh Interval</Form.Label>
                      <Form.Select
                        value={settings.refreshInterval}
                        onChange={(e) => handleSettingChange('refreshInterval', parseInt(e.target.value))}
                      >
                        <option value={60}>1 minute</option>
                        <option value={300}>5 minutes</option>
                        <option value={600}>10 minutes</option>
                        <option value={1800}>30 minutes</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>
                </Row>
              )}

              <Form.Group className="mb-3">
                <Form.Label>Default Sites</Form.Label>
                <div className="d-flex flex-wrap gap-2">
                  {siteOptions.map(site => (
                    <Form.Check
                      key={site.value}
                      type="checkbox"
                      id={`site-${site.value}`}
                      label={site.label}
                      checked={settings.defaultSites.includes(site.value)}
                      onChange={(e) => handleArraySetting('defaultSites', site.value, e.target.checked)}
                    />
                  ))}
                </div>
                <Form.Text className="text-muted">
                  Sites selected by default when loading dashboards
                </Form.Text>
              </Form.Group>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        {/* Data Display Settings */}
        <Col xl={6}>
          <Card className="card mb-4">
            <Card.Header>
              <h5 className="mb-0">
                <i className="bi bi-graph-up me-2"></i>
                Data Display
              </h5>
            </Card.Header>
            <Card.Body>
              <Form.Group className="mb-3">
                <Form.Label>Default Chart Type</Form.Label>
                <Form.Select
                  value={settings.defaultChartType}
                  onChange={(e) => handleSettingChange('defaultChartType', e.target.value)}
                >
                  <option value="line">Line Chart</option>
                  <option value="scatter">Scatter Plot</option>
                  <option value="bar">Bar Chart</option>
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Table Settings</Form.Label>
                <div className="d-flex flex-column gap-2">
                  <Form.Check
                    type="switch"
                    checked={settings.showDataPoints}
                    onChange={(e) => handleSettingChange('showDataPoints', e.target.checked)}
                    label="Show data points on charts"
                  />
                  <Form.Check
                    type="switch" 
                    checked={settings.compactTables}
                    onChange={(e) => handleSettingChange('compactTables', e.target.checked)}
                    label="Use compact table layout"
                  />
                </div>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Rows Per Page</Form.Label>
                <Form.Select
                  value={settings.rowsPerPage}
                  onChange={(e) => handleSettingChange('rowsPerPage', parseInt(e.target.value))}
                >
                  <option value={25}>25 rows</option>
                  <option value={50}>50 rows</option>
                  <option value={100}>100 rows</option>
                  <option value={200}>200 rows</option>
                </Form.Select>
              </Form.Group>
            </Card.Body>
          </Card>
        </Col>

        {/* Notifications & Alerts */}
        <Col xl={6}>
          <Card className="card mb-4">
            <Card.Header>
              <h5 className="mb-0">
                <i className="bi bi-bell me-2"></i>
                Notifications & Alerts
              </h5>
            </Card.Header>
            <Card.Body>
              <Form.Group className="mb-3">
                <Form.Label>Alert Preferences</Form.Label>
                <div className="d-flex flex-column gap-2">
                  <Form.Check
                    type="switch"
                    checked={settings.emailAlerts}
                    onChange={(e) => handleSettingChange('emailAlerts', e.target.checked)}
                    label="Email alerts for threshold violations"
                  />
                  <Form.Check
                    type="switch"
                    checked={settings.browserNotifications}
                    onChange={(e) => handleSettingChange('browserNotifications', e.target.checked)}
                    label="Browser push notifications"
                  />
                  <Form.Check
                    type="switch"
                    checked={settings.alertThresholds}
                    onChange={(e) => handleSettingChange('alertThresholds', e.target.checked)}
                    label="Show alert thresholds on charts"
                  />
                </div>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Export Settings</Form.Label>
                <Form.Select
                  value={settings.defaultExportFormat}
                  onChange={(e) => handleSettingChange('defaultExportFormat', e.target.value)}
                >
                  <option value="xlsx">Excel (.xlsx)</option>
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </Form.Select>
              </Form.Group>

              <Form.Check
                type="switch"
                checked={settings.includeMetadata}
                onChange={(e) => handleSettingChange('includeMetadata', e.target.checked)}
                label="Include metadata in exports"
                className="mb-3"
              />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        {/* Theme & Display */}
        <Col xl={12}>
          <Card className="card mb-4">
            <Card.Header>
              <h5 className="mb-0">
                <i className="bi bi-palette me-2"></i>
                Theme & Display
              </h5>
            </Card.Header>
            <Card.Body>
              <Row>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Theme</Form.Label>
                    <Form.Select
                      value={settings.theme}
                      onChange={(e) => handleSettingChange('theme', e.target.value)}
                    >
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                      <option value="auto">Auto (System)</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Language</Form.Label>
                    <Form.Select
                      value={settings.language}
                      onChange={(e) => handleSettingChange('language', e.target.value)}
                    >
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Timezone</Form.Label>
                    <Form.Control
                      type="text"
                      value={settings.timezone}
                      onChange={(e) => handleSettingChange('timezone', e.target.value)}
                      placeholder="e.g. America/New_York"
                    />
                  </Form.Group>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {hasChanges && (
        <div className="position-fixed bottom-0 end-0 p-3" style={{ zIndex: 1050 }}>
          <Alert variant="warning" className="mb-0">
            <i className="bi bi-exclamation-triangle-fill me-2"></i>
            You have unsaved changes. Don't forget to save!
          </Alert>
        </div>
      )}
    </Container>
  );
};

export default ModernSettings;
