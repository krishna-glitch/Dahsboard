import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Card, Row, Col, Badge, ButtonGroup } from 'react-bootstrap';
import {
  getAllPresets,
  getDefaultPreset,
  setDefaultPreset,
  saveUserPreset,
  deleteUserPreset,
  createPresetFromSettings,
  exportPreset,
  importPreset,
  getPresetCategories,
  validatePresetSettings
} from '../../utils/presetManager';
import { useToast } from './toastUtils';

const PresetSelector = ({
  show,
  onHide,
  currentSettings,
  onApplyPreset,
  onSettingsChange
}) => {
  const [presets, setPresets] = useState({});
  const [categories, setCategories] = useState({});
  const [defaultPresetId, setDefaultPresetId] = useState('quick-overview');
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [activeCategory, setActiveCategory] = useState('system');

  // Create preset form
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDescription, setNewPresetDescription] = useState('');
  const [validationErrors, setValidationErrors] = useState([]);

  const toast = useToast();

  useEffect(() => {
    if (show) {
      loadPresets();
    }
  }, [show]);

  const loadPresets = () => {
    const allPresets = getAllPresets();
    const presetCategories = getPresetCategories();
    const defaultId = getDefaultPreset();

    setPresets(allPresets);
    setCategories(presetCategories);
    setDefaultPresetId(defaultId);
    setSelectedPreset(allPresets[defaultId] || null);
  };

  const handleApplyPreset = (preset) => {
    if (preset && onApplyPreset) {
      onApplyPreset(preset);
      toast.success(`Applied preset: ${preset.name}`);
      onHide();
    }
  };

  const handleSetDefault = (presetId) => {
    if (setDefaultPreset(presetId)) {
      setDefaultPresetId(presetId);
      toast.success(`Set "${presets[presetId].name}" as default preset`);
    } else {
      toast.error('Failed to set default preset');
    }
  };

  const handleCreatePreset = () => {
    // Validate form
    if (!newPresetName.trim()) {
      setValidationErrors(['Preset name is required']);
      return;
    }

    // Validate current settings
    const validation = validatePresetSettings(currentSettings);
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      return;
    }

    // Create preset from current settings
    const newPreset = createPresetFromSettings(
      currentSettings,
      newPresetName.trim(),
      newPresetDescription.trim()
    );

    const saved = saveUserPreset(newPreset);
    if (saved) {
      toast.success(`Created preset: ${newPreset.name}`);
      loadPresets();
      setShowCreateModal(false);
      setNewPresetName('');
      setNewPresetDescription('');
      setValidationErrors([]);
    } else {
      toast.error('Failed to create preset');
    }
  };

  const handleDeletePreset = (presetId) => {
    const preset = presets[presetId];
    if (!preset || preset.category === 'system') {
      toast.error('Cannot delete system presets');
      return;
    }

    if (window.confirm(`Delete preset "${preset.name}"?`)) {
      if (deleteUserPreset(presetId)) {
        toast.success(`Deleted preset: ${preset.name}`);
        loadPresets();
        if (selectedPreset?.id === presetId) {
          setSelectedPreset(null);
        }
      } else {
        toast.error('Failed to delete preset');
      }
    }
  };

  const handleExportPreset = (preset) => {
    if (exportPreset(preset)) {
      toast.success(`Exported preset: ${preset.name}`);
    } else {
      toast.error('Failed to export preset');
    }
  };

  const handleImportFile = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    importPreset(file)
      .then(imported => {
        toast.success(`Imported preset: ${imported.name}`);
        loadPresets();
        setShowImportModal(false);
      })
      .catch(error => {
        toast.error(`Import failed: ${error.message}`);
      });
  };

  const categoryDisplayNames = {
    system: 'System Presets',
    analysis: 'Analysis Tools',
    monitoring: 'Monitoring Views',
    research: 'Research Studies',
    user: 'My Presets',
    other: 'Other'
  };

  const categoryOrder = ['system', 'analysis', 'monitoring', 'research', 'user', 'other'];

  return (
    <>
      <Modal show={show} onHide={onHide} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>
            <i className="bi bi-bookmark-star me-2"></i>
            Preset Manager
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* Category Tabs */}
          <div className="mb-3">
            <ButtonGroup size="sm" className="w-100">
              {categoryOrder.map(category => (
                categories[category] && (
                  <Button
                    key={category}
                    variant={activeCategory === category ? 'primary' : 'outline-primary'}
                    onClick={() => setActiveCategory(category)}
                    className="text-nowrap"
                  >
                    {categoryDisplayNames[category]}
                    <Badge bg="secondary" className="ms-1">
                      {categories[category].length}
                    </Badge>
                  </Button>
                )
              ))}
            </ButtonGroup>
          </div>

          {/* Preset Grid */}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <Row className="g-2">
              {categories[activeCategory]?.map(preset => (
                <Col md={6} key={preset.id}>
                  <Card
                    className={`preset-card ${selectedPreset?.id === preset.id ? 'border-primary' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedPreset(preset)}
                  >
                    <Card.Body className="p-3">
                      <div className="d-flex align-items-start justify-content-between">
                        <div className="flex-grow-1">
                          <div className="d-flex align-items-center mb-1">
                            <i className={`bi ${preset.icon || 'bi-bookmark'} me-2`}></i>
                            <strong className="preset-name">{preset.name}</strong>
                            {defaultPresetId === preset.id && (
                              <Badge bg="success" className="ms-2">Default</Badge>
                            )}
                          </div>
                          <small className="text-muted">{preset.description}</small>
                          <div className="preset-details mt-2">
                            <small className="text-secondary">
                              Sites: {preset.settings.sites?.join(', ') || 'None'} •
                              Range: {preset.settings.timeRange || 'N/A'} •
                              Parameter: {preset.settings.selectedParameter || 'N/A'}
                            </small>
                          </div>
                        </div>
                        {preset.category === 'user' && (
                          <div className="preset-actions">
                            <Button
                              variant="outline-danger"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePreset(preset.id);
                              }}
                            >
                              <i className="bi bi-trash"></i>
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              ))}
            </Row>
          </div>

          {/* Selected Preset Details */}
          {selectedPreset && (
            <Card className="mt-3 bg-light">
              <Card.Body>
                <h6>
                  <i className={`bi ${selectedPreset.icon || 'bi-bookmark'} me-2`}></i>
                  {selectedPreset.name}
                </h6>
                <p className="mb-2">{selectedPreset.description}</p>
                <div className="preset-settings">
                  <Row>
                    <Col md={6}>
                      <strong>Sites:</strong> {selectedPreset.settings.sites?.join(', ') || 'None'}<br/>
                      <strong>Time Range:</strong> {selectedPreset.settings.timeRange || 'N/A'}<br/>
                      <strong>Parameter:</strong> {selectedPreset.settings.selectedParameter || 'N/A'}
                    </Col>
                    <Col md={6}>
                      <strong>Compare Mode:</strong> {selectedPreset.settings.compareMode || 'Off'}<br/>
                      <strong>Chart Type:</strong> {selectedPreset.settings.chartType || 'Line'}<br/>
                      <strong>View:</strong> {selectedPreset.settings.activeView || 'Overview'}
                    </Col>
                  </Row>
                </div>
              </Card.Body>
            </Card>
          )}
        </Modal.Body>
        <Modal.Footer>
          <div className="d-flex justify-content-between w-100">
            <div>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => setShowCreateModal(true)}
                className="me-2"
              >
                <i className="bi bi-plus-circle me-1"></i>
                Create
              </Button>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => setShowImportModal(true)}
                className="me-2"
              >
                <i className="bi bi-upload me-1"></i>
                Import
              </Button>
              {selectedPreset && (
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => handleExportPreset(selectedPreset)}
                >
                  <i className="bi bi-download me-1"></i>
                  Export
                </Button>
              )}
            </div>
            <div>
              {selectedPreset && selectedPreset.id !== defaultPresetId && (
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => handleSetDefault(selectedPreset.id)}
                  className="me-2"
                >
                  Set Default
                </Button>
              )}
              <Button variant="secondary" onClick={onHide} className="me-2">
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => handleApplyPreset(selectedPreset)}
                disabled={!selectedPreset}
              >
                Apply Preset
              </Button>
            </div>
          </div>
        </Modal.Footer>
      </Modal>

      {/* Create Preset Modal */}
      <Modal show={showCreateModal} onHide={() => setShowCreateModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Create New Preset</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {validationErrors.length > 0 && (
            <div className="alert alert-danger">
              <ul className="mb-0">
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Preset Name *</Form.Label>
              <Form.Control
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="Enter preset name"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={newPresetDescription}
                onChange={(e) => setNewPresetDescription(e.target.value)}
                placeholder="Optional description"
              />
            </Form.Group>
            <div className="alert alert-info">
              <small>
                This preset will save your current filter settings:
                sites, time range, parameters, and view options.
              </small>
            </div>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleCreatePreset}>
            Create Preset
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Import Preset Modal */}
      <Modal show={showImportModal} onHide={() => setShowImportModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Import Preset</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group>
              <Form.Label>Select Preset File</Form.Label>
              <Form.Control
                type="file"
                accept=".json"
                onChange={handleImportFile}
              />
              <Form.Text className="text-muted">
                Select a JSON file exported from this application.
              </Form.Text>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowImportModal(false)}>
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default PresetSelector;