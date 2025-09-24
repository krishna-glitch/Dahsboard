import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import Select from 'react-select';
import { TIME_RANGE_OPTIONS } from '../../constants/appConstants';
import { getTimeRanges } from '../../services/api';
import { getAllPresets, getDefaultPreset, setDefaultPreset } from '../../utils/presetManager';
import { SimpleFiltersProps, FilterFormData, TimeRangeOption } from '../../types/filters';
import { createFilterValidation } from '../../utils/formValidation';
import styles from './SimpleFilters.module.css';
import Icon from './Icon';

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
  minDate = ''
}) => {
  // Get validation rules
  const validationRules = createFilterValidation(minDate, maxDate);

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
  const [allPresets, setAllPresets] = useState({});
  const [defaultPresetId, setDefaultPresetId] = useState('quick-overview');

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
    const loadPresets = () => {
      const presets = getAllPresets();
      const defaultId = getDefaultPreset();
      setAllPresets(presets);
      setDefaultPresetId(defaultId);
    };
    loadPresets();
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
    </div>
  );
};

export default SimpleFilters;