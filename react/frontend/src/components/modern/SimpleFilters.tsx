import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Modal, Button as BootstrapButton, Form as BootstrapForm, Alert } from 'react-bootstrap';
import Select from 'react-select';
import { TIME_RANGE_OPTIONS } from '../../constants/appConstants';
import { getTimeRanges } from '../../services/api';
import {
  getAllPresets,
  getDefaultPreset,
  setDefaultPreset,
  createPresetFromSettings,
  saveUserPreset,
  findPresetByName,
} from '../../utils/presetManager';
import { SimpleFiltersProps, FilterFormData, TimeRangeOption } from '../../types/filters';
import { createFilterValidation, createCreatePresetValidation } from '../../utils/formValidation';
import styles from './SimpleFilters.module.css';
import Icon from './Icon';
import { useToast } from './toastUtils';

interface SavePresetFormData {
  name: string;
  description: string;
  overwriteExisting: boolean;
}

/**
 * Simple Filters Component - React Hook Form + TypeScript Implementation
 * Provides type-safe filtering with validation, reduced boilerplate, and improved maintainability
 */
const SimpleFilters: React.FC<SimpleFiltersProps> = ({
  selectedSites = ['S1', 'S2'],
  onSiteChange = () => {},
  timeRange = 'Last 30 Days',
  onTimeRangeChange = () => {},
  startDate = '',
  endDate = '',
  onStartDateChange = () => {},
  onEndDateChange = () => {},
  onApplyFilters = () => {},
  loading = false,
  collapsed = false,
  onToggleCollapse = () => {},
  maxDate = '',
  minDate = '',
  presetSettings = null,
  onPresetSaved,
}) => {
  const toast = useToast();
  const validationRules = createFilterValidation(minDate, maxDate);
  const presetValidationRules = createCreatePresetValidation();

  // React Hook Form setup with TypeScript
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
    reset
  } = useForm<FilterFormData>({
    defaultValues: {
      sites: selectedSites,
      timeRange: timeRange,
      startDate: startDate,
      endDate: endDate
    },
    mode: 'onChange'
  });

  // Watch form values for change detection
  const watchedValues = watch();

  // Local state for non-form data
  const [timeRanges, setTimeRanges] = useState<TimeRangeOption[]>(TIME_RANGE_OPTIONS);
  const [allPresets, setAllPresets] = useState(getAllPresets());
  const [defaultPresetId, setDefaultPresetId] = useState(getDefaultPreset());
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);

  const {
    register: registerSave,
    handleSubmit: handleSaveSubmit,
    reset: resetSaveForm,
    watch: watchSaveForm,
    setError: setSaveError,
    formState: saveFormState,
  } = useForm<SavePresetFormData>({
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: '',
      overwriteExisting: false,
    },
  });

  const saveNameValue = watchSaveForm('name');
  const overwriteExisting = watchSaveForm('overwriteExisting');
  const duplicatePreset = saveNameValue ? findPresetByName(saveNameValue) : null;
  const duplicateIsSystem = duplicatePreset?.category === 'system';
  const duplicateIsUser = Boolean(duplicatePreset) && !duplicateIsSystem;

  const availableSites = [
    { value: 'S1', label: 'Site 1', available: true },
    { value: 'S2', label: 'Site 2', available: true },
    { value: 'S3', label: 'Site 3', available: true },
    { value: 'S4', label: 'Site 4', available: true }
  ];

  // Load server-defined time ranges with fallback to constants
  useEffect(() => {
    try {
      const cached = window.localStorage.getItem('config_time_ranges');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length) {
          setTimeRanges(parsed);
        }
      }
    } catch (error) {
      console.warn('Failed to parse cached time ranges:', error);
    }

    (async () => {
      try {
        const resp = await getTimeRanges();
        const mapping = resp?.time_ranges;
        if (mapping && typeof mapping === 'object') {
          const serverRanges = Object.keys(mapping);
          const order = TIME_RANGE_OPTIONS;
          serverRanges.sort((a, b) => {
            const ai = order.indexOf(a);
            const bi = order.indexOf(b);
            if (ai !== -1 && bi !== -1) return ai - bi;
            if (ai !== -1) return -1;
            if (bi !== -1) return 1;
            return a.localeCompare(b);
          });
          setTimeRanges(serverRanges);
          try {
            window.localStorage.setItem('config_time_ranges', JSON.stringify(serverRanges));
          } catch (error) {
            console.warn('Failed to cache time ranges:', error);
          }
        }
      } catch (error) {
        console.warn('Failed to fetch time ranges, using defaults:', error);
      }
    })();
  }, []);

  // Sync form values with parent props when they change
  useEffect(() => {
    reset({
      sites: selectedSites,
      timeRange: timeRange,
      startDate: startDate,
      endDate: endDate
    });
  }, [selectedSites, timeRange, startDate, endDate, reset]);

  // Load presets
  useEffect(() => {
    const presets = getAllPresets();
    const defaultId = getDefaultPreset();
    setAllPresets(presets);
    setDefaultPresetId(defaultId);
  }, []);

  // Custom validation functions
  const validateDateRange = (value, formValues) => {
    if (formValues.timeRange !== 'Custom Range') return true;

    const toDate = (v) => (v ? new Date(v) : null);
    const dMin = toDate(minDate);
    const dMax = toDate(maxDate);
    const dStart = toDate(formValues.startDate);
    const dEnd = toDate(formValues.endDate);

    // Start date validation
    if (dStart) {
      if (dMin && dStart < dMin) {
        return `Start date cannot be before ${minDate}`;
      }
      if (dEnd && dStart > dEnd) {
        return 'Start date cannot be after end date';
      }
      if (!dEnd && dMax && dStart > dMax) {
        return `Start date cannot be after ${maxDate}`;
      }
    }

    // End date validation
    if (dEnd) {
      if (dMax && dEnd > dMax) {
        return `End date cannot be after ${maxDate}`;
      }
      if (!dStart && dMin && dEnd < dMin) {
        return `End date cannot be before ${minDate}`;
      }
    }

    return true;
  };

  const validateSites = (sites) => {
    if (!Array.isArray(sites) || sites.length === 0) {
      return 'At least one site must be selected';
    }
    return true;
  };

  // Form submission handler
  const onSubmit = (data) => {
    try {
      console.log('[FILTER APPLY] sites=%o timeRange=%o start=%o end=%o',
        data.sites, data.timeRange, data.startDate, data.endDate);
    } catch {
      /* ignore logging issues */
    }

    onSiteChange(data.sites);
    onTimeRangeChange(data.timeRange);
    onApplyFilters();
  };

  // Site toggle handler
  const handleSiteToggle = (siteValue, currentSites) => {
    const newSites = currentSites.includes(siteValue)
      ? currentSites.filter(s => s !== siteValue)
      : [...currentSites, siteValue];

    setValue('sites', newSites, { shouldDirty: true, shouldValidate: true });
  };

  const handleDefaultPresetChange = (presetId) => {
    if (setDefaultPreset(presetId)) {
      setDefaultPresetId(presetId);
    }
  };

  const reloadPresets = () => {
    setAllPresets(getAllPresets());
    setDefaultPresetId(getDefaultPreset());
  };

  const handleOpenSavePreset = () => {
    if (!presetSettings) {
      toast.showInfo('Load the dashboard first to save a preset.');
      return;
    }
    resetSaveForm({ name: '', description: '', overwriteExisting: false });
    setShowSavePresetModal(true);
  };

  const handleCloseSavePreset = () => {
    setShowSavePresetModal(false);
    resetSaveForm({ name: '', description: '', overwriteExisting: false });
  };

  // Check if form has changes
  const hasChanges = () => {
    return JSON.stringify(watchedValues.sites) !== JSON.stringify(selectedSites) ||
           watchedValues.timeRange !== timeRange ||
           watchedValues.startDate !== startDate ||
           watchedValues.endDate !== endDate;
  };

  // Check if dates are invalid
  const hasDateErrors = () => {
    return errors.startDate || errors.endDate ||
           (watchedValues.timeRange === 'Custom Range' &&
            (!watchedValues.startDate || !watchedValues.endDate));
  };

  const onSavePresetSubmit = handleSaveSubmit((data) => {
    if (!presetSettings) {
      toast.showError('Preset saving is currently unavailable.');
      return;
    }

    const trimmedName = data.name.trim();
    const trimmedDescription = data.description.trim();

    if (!trimmedName) {
      setSaveError('name', {
        type: 'required',
        message: 'Preset name is required',
      });
      return;
    }

    if (duplicateIsSystem) {
      setSaveError('name', {
        type: 'conflict',
        message: 'System preset names cannot be overwritten.',
      });
      return;
    }

    if (duplicateIsUser && !data.overwriteExisting) {
      setSaveError('overwriteExisting', {
        type: 'manual',
        message: 'Preset exists. Enable overwrite to replace it.',
      });
      return;
    }

    try {
      const newPreset = createPresetFromSettings(presetSettings, trimmedName, trimmedDescription);
      if (duplicateIsUser && duplicatePreset) {
        newPreset.id = duplicatePreset.id;
        newPreset.createdAt = duplicatePreset.createdAt;
      }

      const savedPreset = saveUserPreset(newPreset);
      if (!savedPreset) {
        toast.showError('Failed to save preset');
        return;
      }

      toast.showSuccess(duplicateIsUser ? `Updated preset: ${savedPreset.name}` : `Saved preset: ${savedPreset.name}`);
      reloadPresets();
      if (onPresetSaved) {
        onPresetSaved(savedPreset);
      }
      handleCloseSavePreset();
    } catch (error) {
      console.error('[SimpleFilters] Failed to save preset', error);
      toast.showError(error instanceof Error ? error.message : 'Failed to save preset');
    }
  });

  if (collapsed) {
    return (
      <div className={styles.collapsedContainer}>
        <button
          className={styles.collapsedButton}
          onClick={onToggleCollapse}
          title="Expand Filters"
        >
          <Icon name="gear" size="var(--icon-size-small)" />
          Expand Filters
        </button>
        <button
          className={`${styles.collapsedButton} ${selectedSites.length > 0 ? styles.active : ''}`}
          title={`${selectedSites.length} sites selected`}
        >
          <Icon name="geo-alt" size="var(--icon-size-small)" />
          Selected Sites
          <span className={styles.badge}>{selectedSites.length}</span>
        </button>
        <button
          className={styles.collapsedButton}
          title={timeRange}
        >
          <Icon name="calendar3" size="var(--icon-size-small)" />
          {timeRange}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.filterContainer}>
      <div className={styles.filterHeader}>
        <h3 className={styles.filterTitle}>
          <Icon name="funnel" className={styles.filterIcon} />
          Data Filters
        </h3>
        <button
          className={styles.toggleButton}
          onClick={onToggleCollapse}
          title="Collapse Filters"
        >
          <Icon name="chevron-left" size="var(--icon-size-small)" />
        </button>
      </div>

      <div className={styles.filterContent}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className={styles.filterGrid}>
            {/* Site Selection */}
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>
                Monitoring Sites <span className={styles.required}>*</span>
              </label>

              <div className={styles.filterControl}>
                <Controller
                  name="sites"
                  control={control}
                  rules={{ validate: validateSites }}
                  render={({ field }) => (
                    <Select
                      {...field}
                      isMulti
                      className={`${styles.reactSelect} ${errors.sites ? styles.error : ''}`}
                      classNamePrefix="react-select"
                      options={availableSites.map(site => ({
                        value: site.value,
                        label: site.label,
                        isDisabled: !site.available
                      }))}
                      value={availableSites.filter(site => field.value.includes(site.value)).map(site => ({
                        value: site.value,
                        label: site.label
                      }))}
                      onChange={(selected) => {
                        const values = selected ? selected.map(option => option.value) : [];
                        field.onChange(values);
                      }}
                      placeholder="Select monitoring sites..."
                      isDisabled={loading}
                      noOptionsMessage={() => "No sites available"}
                    />
                  )}
                />
                {errors.sites && (
                  <div className={styles.errorMessage}>
                    <Icon name="exclamation-triangle" className={styles.errorIcon} />
                    {errors.sites.message}
                  </div>
                )}
              </div>
            </div>

            {/* Site Control Buttons */}
            <div className={styles.siteControlSection}>
              <div className={styles.controlButtons}>
                <button
                  type="button"
                  className={styles.controlButton}
                  onClick={() => setValue('sites', availableSites.filter(s => s.available).map(s => s.value),
                    { shouldDirty: true, shouldValidate: true })}
                  title="Select All Sites"
                >
                  <Icon name="check-all" size="var(--icon-size-small)" />
                  Select All
                </button>
                <button
                  type="button"
                  className={styles.controlButton}
                  onClick={() => setValue('sites', [], { shouldDirty: true, shouldValidate: true })}
                  title="Clear All Sites"
                >
                  <Icon name="x-square" size="var(--icon-size-small)" />
                  Clear All
                </button>
              </div>
            </div>

            {/* Time Range Selection */}
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>
                Time Range <span className={styles.required}>*</span>
              </label>
              <div className={styles.filterControl}>
                <Controller
                  name="timeRange"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      className={styles.filterSelect}
                      disabled={loading}
                    >
                      {timeRanges.map(range => (
                        <option key={range} value={range}>{range}</option>
                      ))}
                    </select>
                  )}
                />
              </div>
            </div>
          </div>

          {/* Custom Date Range */}
          {watchedValues.timeRange === 'Custom Range' && (
            <div className={styles.filterGrid}>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Start Date</label>
                <div className={styles.filterControl}>
                  <Controller
                    name="startDate"
                    control={control}
                    rules={{ validate: (value) => validateDateRange(value, watchedValues) }}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="date"
                        min={minDate}
                        max={maxDate}
                        disabled={loading}
                        className={`${styles.filterInput} ${errors.startDate ? styles.error : ''}`}
                      />
                    )}
                  />
                  {errors.startDate && (
                    <div className={styles.errorMessage}>
                      <Icon name="exclamation-triangle" className={styles.errorIcon} />
                      {errors.startDate.message}
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>End Date</label>
                <div className={styles.filterControl}>
                  <Controller
                    name="endDate"
                    control={control}
                    rules={{ validate: (value) => validateDateRange(value, watchedValues) }}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="date"
                        min={minDate}
                        max={maxDate}
                        disabled={loading}
                        className={`${styles.filterInput} ${errors.endDate ? styles.error : ''}`}
                      />
                    )}
                  />
                  {errors.endDate && (
                    <div className={styles.errorMessage}>
                      <Icon name="exclamation-triangle" className={styles.errorIcon} />
                      {errors.endDate.message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Presets Section */}
          {Object.keys(allPresets).length > 0 && (
            <div className={styles.presetSection}>
              <div className={styles.presetHeader}>
                <h4 className={styles.presetTitle}>Quick Presets</h4>
              </div>
              <div className={styles.presetList}>
                {Object.entries(allPresets).map(([id, preset]) => (
                  <button
                    key={id}
                    type="button"
                    className={`${styles.presetChip} ${defaultPresetId === id ? styles.active : ''}`}
                    onClick={() => handleDefaultPresetChange(id)}
                    disabled={loading}
                  >
                    <Icon name="bookmark" size="var(--icon-size-small)" />
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.filterActions}>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.secondaryButton}`}
              onClick={handleOpenSavePreset}
              disabled={loading || !presetSettings}
            >
              <Icon name="bookmark-plus" size="var(--icon-size-small)" />
              Save Preset
            </button>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.secondaryButton}`}
              onClick={() => reset()}
              disabled={loading || !isDirty}
            >
              <Icon name="arrow-clockwise" size="var(--icon-size-small)" />
              Reset
            </button>
            <button
              type="submit"
              className={`${styles.actionButton} ${styles.primaryButton} ${loading ? styles.loading : ''}`}
              disabled={loading || !hasChanges() || hasDateErrors()}
            >
              {loading && <div className={styles.loadingSpinner} />}
              <Icon name={loading ? "hourglass-split" : "check-lg"} size="var(--icon-size-small)" />
              {loading ? 'Applying...' :
               (!hasDateErrors() && hasChanges()) ? 'Apply Filters' :
               hasDateErrors() ? 'Fix Date Range' :
               'No Changes'}
            </button>
          </div>
        </form>
      </div>
      <Modal show={showSavePresetModal} onHide={handleCloseSavePreset} centered>
        <BootstrapForm onSubmit={onSavePresetSubmit} noValidate>
          <Modal.Header closeButton>
            <Modal.Title className="d-flex align-items-center gap-2">
              <Icon name="bookmark-plus" size="var(--icon-size-small)" />
              <span>Save Current View as Preset</span>
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {duplicatePreset && duplicateIsSystem && (
              <Alert variant="danger" className="d-flex align-items-start">
                <Icon name="shield-lock" className="me-2 mt-1" size="var(--icon-size-small)" />
                <div>
                  <strong>{duplicatePreset.name}</strong> is a system preset. Choose a different name.
                </div>
              </Alert>
            )}
            {duplicateIsUser && !overwriteExisting && (
              <Alert variant="warning" className="d-flex align-items-start">
                <Icon name="exclamation-triangle" className="me-2 mt-1" size="var(--icon-size-small)" />
                <div>
                  A preset named <strong>{duplicatePreset?.name}</strong> already exists. Enable overwrite to replace it.
                </div>
              </Alert>
            )}
            <div className="mb-3">
              <BootstrapForm.Label htmlFor="preset-save-name">
                Preset name <span className="text-danger">*</span>
              </BootstrapForm.Label>
              <BootstrapForm.Control
                id="preset-save-name"
                type="text"
                placeholder="Dashboard view name"
                isInvalid={Boolean(saveFormState.errors.name)}
                {...registerSave('name', presetValidationRules.name)}
              />
              <BootstrapForm.Control.Feedback type="invalid">
                {saveFormState.errors.name?.message}
              </BootstrapForm.Control.Feedback>
            </div>
            <div className="mb-3">
              <BootstrapForm.Label htmlFor="preset-save-description">Description</BootstrapForm.Label>
              <BootstrapForm.Control
                id="preset-save-description"
                as="textarea"
                rows={3}
                placeholder="Optional context for teammates"
                isInvalid={Boolean(saveFormState.errors.description)}
                {...registerSave('description', presetValidationRules.description)}
              />
              <BootstrapForm.Control.Feedback type="invalid">
                {saveFormState.errors.description?.message}
              </BootstrapForm.Control.Feedback>
            </div>
            {duplicateIsUser && (
              <BootstrapForm.Check
                type="switch"
                id="preset-save-overwrite"
                label="Overwrite existing preset with these settings"
                {...registerSave('overwriteExisting')}
              />
            )}
          </Modal.Body>
          <Modal.Footer>
            <BootstrapButton variant="secondary" type="button" onClick={handleCloseSavePreset}>
              Cancel
            </BootstrapButton>
            <BootstrapButton
              variant="primary"
              type="submit"
              disabled={
                !presetSettings ||
                !saveFormState.isValid ||
                duplicateIsSystem ||
                (duplicateIsUser && !overwriteExisting)
              }
            >
              <Icon name="save" size="var(--icon-size-small)" />
              Save Preset
            </BootstrapButton>
          </Modal.Footer>
        </BootstrapForm>
      </Modal>
    </div>
  );
};

export default SimpleFilters;
