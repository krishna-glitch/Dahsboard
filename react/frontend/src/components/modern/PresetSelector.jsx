import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Form, Card, Row, Col, Badge, ButtonGroup } from 'react-bootstrap';
import { useForm, SubmitHandler, Controller } from 'react-hook-form';
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
import {
  Preset,
  PresetCategory,
  PresetSelectorProps,
  CreatePresetFormData,
  ImportPresetFormData
} from '../../types/forms';
import {
  createCreatePresetValidation,
  createImportPresetValidation
} from '../../utils/formValidation';

// Form validation rules
const createPresetRules = createCreatePresetValidation();
const importPresetRules = createImportPresetValidation();

const PresetSelector: React.FC<PresetSelectorProps> = ({
  show,
  onHide,
  currentSettings,
  onApplyPreset,
  onSettingsChange
}) => {
  // State for presets data
  const [presets, setPresets] = useState<Record<string, Preset>>({});
  const [categories, setCategories] = useState<Record<string, PresetCategory>>({});
  const [defaultPresetId, setDefaultPresetId] = useState<string>('quick-overview');
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('system');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);

  // Toast notifications
  const toast = useToast();

  // Create Preset Form
  const createForm = useForm<CreatePresetFormData>({
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: ''
    }
  });

  // Import Preset Form
  const importForm = useForm<ImportPresetFormData>({
    mode: 'onChange',
    defaultValues: {
      file: undefined as any,
      overwriteExisting: false
    }
  });

  // Load presets data
  const loadPresets = useCallback(() => {
    const allPresets = getAllPresets();
    const presetCategories = getPresetCategories();
    const defaultId = getDefaultPreset();

    setPresets(allPresets);
    setCategories(presetCategories);
    setDefaultPresetId(defaultId);
    setSelectedPreset(allPresets[defaultId] || null);
  }, []);

  // Load presets when modal opens
  useEffect(() => {
    if (show) {
      loadPresets();
    }
  }, [show, loadPresets]);

  // Apply preset handler
  const handleApplyPreset = useCallback((preset: Preset) => {
    if (preset && onApplyPreset) {
      onApplyPreset(preset);
      toast.showSuccess(`Applied preset: ${preset.name}`);
      onHide();
    }
  }, [onApplyPreset, onHide, toast]);

  // Set default preset handler
  const handleSetDefault = useCallback((presetId: string) => {
    if (setDefaultPreset(presetId)) {
      setDefaultPresetId(presetId);
      toast.showSuccess(`Set "${presets[presetId].name}" as default preset`);
    } else {
      toast.showError('Failed to set default preset');
    }
  }, [presets, toast]);

  // Delete preset handler
  const handleDeletePreset = useCallback((presetId: string) => {
    const preset = presets[presetId];
    if (!preset) return;

    if (preset.category === 'system') {
      toast.showWarning('System presets cannot be deleted');
      return;
    }

    if (window.confirm(`Are you sure you want to delete "${preset.name}"?`)) {
      if (deleteUserPreset(presetId)) {
        toast.showSuccess(`Deleted preset: ${preset.name}`);
        loadPresets();

        // Clear selection if deleted preset was selected
        if (selectedPreset?.id === presetId) {
          setSelectedPreset(null);
        }
      } else {
        toast.showError('Failed to delete preset');
      }
    }
  }, [presets, selectedPreset, toast, loadPresets]);

  // Export preset handler
  const handleExportPreset = useCallback((preset: Preset) => {
    try {
      exportPreset(preset);
      toast.showSuccess(`Exported preset: ${preset.name}`);
    } catch (error) {
      toast.showError(`Failed to export preset: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [toast]);

  // Create preset form submission
  const onCreateSubmit: SubmitHandler<CreatePresetFormData> = async (data) => {
    try {
      // Validate current settings
      const validation = validatePresetSettings(currentSettings);
      if (!validation.isValid) {
        createForm.setError('root.settingsError', {
          type: 'validation',
          message: `Current settings are invalid: ${validation.errors.join(', ')}`
        });
        return;
      }

      // Check for duplicate names
      const isDuplicate = Object.values(presets).some(preset => preset.name === data.name);
      if (isDuplicate) {
        createForm.setError('name', {
          type: 'duplicate',
          message: 'A preset with this name already exists'
        });
        return;
      }

      // Create preset from current settings
      const newPreset = createPresetFromSettings(
        currentSettings,
        data.name.trim(),
        data.description.trim()
      );

      const saved = saveUserPreset(newPreset);
      if (saved) {
        toast.showSuccess(`Created preset: ${newPreset.name}`);
        loadPresets();
        setShowCreateModal(false);
        createForm.reset();
      } else {
        createForm.setError('root.saveError', {
          type: 'server',
          message: 'Failed to save preset'
        });
      }
    } catch (error) {
      createForm.setError('root.saveError', {
        type: 'server',
        message: error instanceof Error ? error.message : 'An unexpected error occurred'
      });
    }
  };

  // Import preset form submission
  const onImportSubmit: SubmitHandler<ImportPresetFormData> = async (data) => {
    try {
      if (!data.file || data.file.length === 0) {
        importForm.setError('file', { type: 'required', message: 'Please select a file' });
        return;
      }

      const file = data.file[0];
      const fileContent = await file.text();

      let presetData;
      try {
        presetData = JSON.parse(fileContent);
      } catch {
        importForm.setError('file', {
          type: 'validation',
          message: 'Invalid JSON file format'
        });
        return;
      }

      const result = importPreset(presetData, data.overwriteExisting);
      if (result.success) {
        toast.showSuccess(`Imported preset: ${result.preset.name}`);
        loadPresets();
        setShowImportModal(false);
        importForm.reset();
      } else {
        importForm.setError('root.importError', {
          type: 'validation',
          message: result.error || 'Failed to import preset'
        });
      }
    } catch (error) {
      importForm.setError('root.importError', {
        type: 'server',
        message: error instanceof Error ? error.message : 'An unexpected error occurred'
      });
    }
  };

  // Filter presets by active category
  const filteredPresets = Object.values(presets).filter(
    preset => preset.category === activeCategory
  );

  return (
    <>
      {/* Main Preset Selector Modal */}
      <Modal show={show} onHide={onHide} size="xl" centered>
        <Modal.Header closeButton>
          <Modal.Title>
            <i className="bi bi-bookmark-star me-2"></i>
            Preset Manager
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <Row>
            {/* Category Tabs */}
            <Col md={3}>
              <div className="category-tabs">
                <h6>Categories</h6>
                <ButtonGroup vertical className="w-100">
                  {Object.entries(categories).map(([categoryId, category]) => (
                    <Button
                      key={categoryId}
                      variant={activeCategory === categoryId ? 'primary' : 'outline-secondary'}
                      onClick={() => setActiveCategory(categoryId)}
                      className="text-start"
                    >
                      <i className={`bi ${category.icon} me-2`}></i>
                      {category.name}
                      <Badge bg="secondary" className="ms-auto">
                        {category.presets.length}
                      </Badge>
                    </Button>
                  ))}
                </ButtonGroup>
              </div>
            </Col>

            {/* Preset List */}
            <Col md={9}>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h6>
                  {categories[activeCategory]?.name || 'Presets'}
                  <Badge bg="info" className="ms-2">{filteredPresets.length}</Badge>
                </h6>
                <div>
                  <Button
                    variant="outline-primary"
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
                  >
                    <i className="bi bi-upload me-1"></i>
                    Import
                  </Button>
                </div>
              </div>

              <div className="preset-grid" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {filteredPresets.length === 0 ? (
                  <div className="text-center text-muted py-4">
                    <i className="bi bi-bookmark display-4"></i>
                    <p className="mt-2">No presets in this category</p>
                  </div>
                ) : (
                  filteredPresets.map(preset => (
                    <Card
                      key={preset.id}
                      className={`preset-card mb-2 ${selectedPreset?.id === preset.id ? 'border-primary' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedPreset(preset)}
                    >
                      <Card.Body className="py-2">
                        <div className="d-flex justify-content-between align-items-start">
                          <div className="flex-grow-1">
                            <div className="d-flex align-items-center">
                              <strong>{preset.name}</strong>
                              {preset.isDefault && (
                                <Badge bg="success" className="ms-2" size="sm">Default</Badge>
                              )}
                              {preset.id === defaultPresetId && (
                                <Badge bg="warning" className="ms-2" size="sm">System Default</Badge>
                              )}
                            </div>
                            {preset.description && (
                              <small className="text-muted d-block">{preset.description}</small>
                            )}
                            <small className="text-muted">
                              Modified: {new Date(preset.modified).toLocaleDateString()}
                            </small>
                          </div>
                          <div className="preset-actions">
                            {preset.category !== 'system' && (
                              <Button
                                variant="outline-danger"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePreset(preset.id);
                                }}
                                title="Delete preset"
                              >
                                <i className="bi bi-trash"></i>
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card.Body>
                    </Card>
                  ))
                )}
              </div>
            </Col>
          </Row>

          {/* Selected Preset Actions */}
          {selectedPreset && (
            <div className="mt-3 p-3 bg-light rounded">
              <h6>Selected: {selectedPreset.name}</h6>
              <div className="d-flex gap-2">
                <Button
                  variant="primary"
                  onClick={() => handleApplyPreset(selectedPreset)}
                >
                  <i className="bi bi-check-circle me-1"></i>
                  Apply Preset
                </Button>
                <Button
                  variant="outline-secondary"
                  onClick={() => handleExportPreset(selectedPreset)}
                >
                  <i className="bi bi-download me-1"></i>
                  Export
                </Button>
                {selectedPreset.id !== defaultPresetId && (
                  <Button
                    variant="outline-warning"
                    onClick={() => handleSetDefault(selectedPreset.id)}
                  >
                    <i className="bi bi-star me-1"></i>
                    Set Default
                  </Button>
                )}
              </div>
            </div>
          )}
        </Modal.Body>
      </Modal>

      {/* Create Preset Modal */}
      <Modal show={showCreateModal} onHide={() => setShowCreateModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Create New Preset</Modal.Title>
        </Modal.Header>

        <form onSubmit={createForm.handleSubmit(onCreateSubmit)} noValidate>
          <Modal.Body>
            {/* Server Errors */}
            {(createForm.formState.errors.root?.settingsError || createForm.formState.errors.root?.saveError) && (
              <div className="alert alert-danger" role="alert">
                <i className="bi bi-exclamation-triangle me-2"></i>
                {createForm.formState.errors.root?.settingsError?.message ||
                 createForm.formState.errors.root?.saveError?.message}
              </div>
            )}

            {/* Name Field */}
            <div className="mb-3">
              <label htmlFor="preset-name" className="form-label">
                Preset Name <span className="text-danger">*</span>
              </label>
              <input
                {...createForm.register('name', createPresetRules.name)}
                type="text"
                id="preset-name"
                className={`form-control ${createForm.formState.errors.name ? 'is-invalid' : ''}`}
                placeholder="Enter preset name"
              />
              {createForm.formState.errors.name && (
                <div className="invalid-feedback">
                  {createForm.formState.errors.name.message}
                </div>
              )}
            </div>

            {/* Description Field */}
            <div className="mb-3">
              <label htmlFor="preset-description" className="form-label">Description</label>
              <textarea
                {...createForm.register('description', createPresetRules.description)}
                id="preset-description"
                className={`form-control ${createForm.formState.errors.description ? 'is-invalid' : ''}`}
                rows={3}
                placeholder="Optional description"
              />
              {createForm.formState.errors.description && (
                <div className="invalid-feedback">
                  {createForm.formState.errors.description.message}
                </div>
              )}
            </div>

            <div className="alert alert-info">
              <i className="bi bi-info-circle me-2"></i>
              The preset will be created from your current dashboard settings.
            </div>
          </Modal.Body>

          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={createForm.formState.isSubmitting || !createForm.formState.isValid}
            >
              {createForm.formState.isSubmitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  Creating...
                </>
              ) : (
                <>
                  <i className="bi bi-plus-circle me-1"></i>
                  Create Preset
                </>
              )}
            </Button>
          </Modal.Footer>
        </form>
      </Modal>

      {/* Import Preset Modal */}
      <Modal show={showImportModal} onHide={() => setShowImportModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Import Preset</Modal.Title>
        </Modal.Header>

        <form onSubmit={importForm.handleSubmit(onImportSubmit)} noValidate>
          <Modal.Body>
            {/* Server Errors */}
            {importForm.formState.errors.root?.importError && (
              <div className="alert alert-danger" role="alert">
                <i className="bi bi-exclamation-triangle me-2"></i>
                {importForm.formState.errors.root.importError.message}
              </div>
            )}

            {/* File Field */}
            <div className="mb-3">
              <label htmlFor="import-file" className="form-label">
                Select Preset File <span className="text-danger">*</span>
              </label>
              <input
                {...importForm.register('file', importPresetRules.file)}
                type="file"
                id="import-file"
                className={`form-control ${importForm.formState.errors.file ? 'is-invalid' : ''}`}
                accept=".json"
              />
              {importForm.formState.errors.file && (
                <div className="invalid-feedback">
                  {importForm.formState.errors.file.message}
                </div>
              )}
              <div className="form-text">
                Select a .json file exported from this application
              </div>
            </div>

            {/* Overwrite Option */}
            <div className="mb-3">
              <div className="form-check">
                <Controller
                  name="overwriteExisting"
                  control={importForm.control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="checkbox"
                      id="overwrite-existing"
                      className="form-check-input"
                      checked={field.value}
                    />
                  )}
                />
                <label htmlFor="overwrite-existing" className="form-check-label">
                  Overwrite existing presets with the same name
                </label>
              </div>
            </div>
          </Modal.Body>

          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowImportModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={importForm.formState.isSubmitting || !importForm.formState.isValid}
            >
              {importForm.formState.isSubmitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  Importing...
                </>
              ) : (
                <>
                  <i className="bi bi-upload me-1"></i>
                  Import Preset
                </>
              )}
            </Button>
          </Modal.Footer>
        </form>
      </Modal>
    </>
  );
};

export default PresetSelector;