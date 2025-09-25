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
  const [activeSection, setActiveSection] = useState('dashboard');

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

  const toggleSection = (section: string) => {
    setActiveSection(activeSection === section ? '' : section);
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
              Customize your water quality monitoring experience for {user?.username || 'your account'}
            </p>
          </div>
        </div>
      </div>

      <div className={styles.settingsForm}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className={styles.formContent}>

            {/* Dashboard Preferences */}
            <div className={styles.accordionSection}>
              <button
                type="button"
                className={`${styles.accordionHeader} ${activeSection === 'dashboard' ? styles.active : ''}`}
                onClick={() => toggleSection('dashboard')}
              >
                <div className={styles.accordionHeaderContent}>
                  <div className={styles.accordionIcon}>
                    <Icon name="speedometer2" size="1.25rem" />
                  </div>
                  <div>
                    <div className={styles.accordionTitle}>Dashboard Preferences</div>
                    <div className={styles.accordionDescription}>Configure default settings for dashboard views</div>
                  </div>
                </div>
                <div className={styles.accordionChevron}>
                  <Icon name="chevron-down" size="1rem" />
                </div>
              </button>
              {activeSection === 'dashboard' && (
                <div className={styles.accordionContent}>
                  <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        Default Time Range <span className={styles.required}>*</span>
                      </label>
                      <Controller
                        name="defaultTimeRange"
                        control={control}
                        rules={validationRules.defaultTimeRange}
                        render={({ field }) => (
                          <>
                            <select
                              {...field}
                              className={`${styles.formSelect} ${errors.defaultTimeRange ? styles.error : ''}`}
                            >
                              {timeRangeOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            {errors.defaultTimeRange && (
                              <div className={styles.errorMessage}>
                                <Icon name="exclamation-triangle" className={styles.errorIcon} />
                                {errors.defaultTimeRange.message}
                              </div>
                            )}
                          </>
                        )}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        Auto Refresh Interval
                      </label>
                      <Controller
                        name="refreshInterval"
                        control={control}
                        rules={validationRules.refreshInterval}
                        render={({ field }) => (
                          <>
                            <div className={styles.rangeGroup}>
                              <input
                                {...field}
                                type="range"
                                min="30"
                                max="3600"
                                step="30"
                                disabled={!watchedValues.autoRefresh}
                                className={styles.rangeInput}
                              />
                              <div className={styles.rangeValue}>
                                <span>30s</span>
                                <span className={styles.currentValue}>{field.value}s</span>
                                <span>1h</span>
                              </div>
                            </div>
                            <div className={styles.helpText}>
                              Data will refresh automatically every {field.value} seconds
                            </div>
                            {errors.refreshInterval && (
                              <div className={styles.errorMessage}>
                                <Icon name="exclamation-triangle" className={styles.errorIcon} />
                                {errors.refreshInterval.message}
                              </div>
                            )}
                          </>
                        )}
                      />
                    </div>
                  </div>

                  <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        Default Sites <span className={styles.required}>*</span>
                      </label>
                      <Controller
                        name="defaultSites"
                        control={control}
                        rules={validationRules.defaultSites}
                        render={({ field }) => (
                          <>
                            <Select
                              {...field}
                              isMulti
                              className={`${styles.reactSelect} ${errors.defaultSites ? styles.error : ''}`}
                              classNamePrefix="react-select"
                              options={siteOptions.map(site => ({
                                value: site.value,
                                label: site.label
                              }))}
                              value={siteOptions.filter(site => field.value.includes(site.value)).map(site => ({
                                value: site.value,
                                label: site.label
                              }))}
                              onChange={(selected) => {
                                const values = selected ? selected.map(option => option.value) : [];
                                field.onChange(values);
                              }}
                              placeholder="Select default monitoring sites..."
                            />
                            {errors.defaultSites && (
                              <div className={styles.errorMessage}>
                                <Icon name="exclamation-triangle" className={styles.errorIcon} />
                                {errors.defaultSites.message}
                              </div>
                            )}
                          </>
                        )}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <Controller
                        name="autoRefresh"
                        control={control}
                        render={({ field }) => (
                          <div className={styles.switchGroup}>
                            <div className={styles.switchContent}>
                              <div className={styles.switchLabel}>Auto-refresh dashboard data</div>
                              <div className={styles.switchDescription}>Automatically update dashboard every interval</div>
                            </div>
                            <button
                              type="button"
                              className={`${styles.switchToggle} ${field.value ? styles.active : ''}`}
                              onClick={() => field.onChange(!field.value)}
                            >
                              <div className={styles.switchThumb}></div>
                            </button>
                          </div>
                        )}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Display Preferences */}
            <div className={styles.accordionSection}>
              <button
                type="button"
                className={`${styles.accordionHeader} ${activeSection === 'display' ? styles.active : ''}`}
                onClick={() => toggleSection('display')}
              >
                <div className={styles.accordionHeaderContent}>
                  <div className={styles.accordionIcon}>
                    <Icon name="display" size="1.25rem" />
                  </div>
                  <div>
                    <div className={styles.accordionTitle}>Display Preferences</div>
                    <div className={styles.accordionDescription}>Customize chart types and table layouts</div>
                  </div>
                </div>
                <div className={styles.accordionChevron}>
                  <Icon name="chevron-down" size="1rem" />
                </div>
              </button>
              {activeSection === 'display' && (
                <div className={styles.accordionContent}>
                  <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        Default Chart Type <span className={styles.required}>*</span>
                      </label>
                      <Controller
                        name="defaultChartType"
                        control={control}
                        rules={validationRules.defaultChartType}
                        render={({ field }) => (
                          <>
                            <select
                              {...field}
                              className={`${styles.formSelect} ${errors.defaultChartType ? styles.error : ''}`}
                            >
                              {chartTypeOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label} - {option.description}
                                </option>
                              ))}
                            </select>
                            {errors.defaultChartType && (
                              <div className={styles.errorMessage}>
                                <Icon name="exclamation-triangle" className={styles.errorIcon} />
                                {errors.defaultChartType.message}
                              </div>
                            )}
                          </>
                        )}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        Rows Per Page
                      </label>
                      <Controller
                        name="rowsPerPage"
                        control={control}
                        rules={validationRules.rowsPerPage}
                        render={({ field }) => (
                          <>
                            <select
                              {...field}
                              className={`${styles.formSelect} ${errors.rowsPerPage ? styles.error : ''}`}
                            >
                              <option value={10}>10 rows</option>
                              <option value={25}>25 rows</option>
                              <option value={50}>50 rows</option>
                              <option value={100}>100 rows</option>
                            </select>
                            {errors.rowsPerPage && (
                              <div className={styles.errorMessage}>
                                <Icon name="exclamation-triangle" className={styles.errorIcon} />
                                {errors.rowsPerPage.message}
                              </div>
                            )}
                          </>
                        )}
                      />
                    </div>
                  </div>

                  <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                      <Controller
                        name="showDataPoints"
                        control={control}
                        render={({ field }) => (
                          <div className={styles.switchGroup}>
                            <div className={styles.switchContent}>
                              <div className={styles.switchLabel}>Show individual data points on charts</div>
                              <div className={styles.switchDescription}>Display markers for each data point</div>
                            </div>
                            <button
                              type="button"
                              className={`${styles.switchToggle} ${field.value ? styles.active : ''}`}
                              onClick={() => field.onChange(!field.value)}
                            >
                              <div className={styles.switchThumb}></div>
                            </button>
                          </div>
                        )}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <Controller
                        name="compactTables"
                        control={control}
                        render={({ field }) => (
                          <div className={styles.switchGroup}>
                            <div className={styles.switchContent}>
                              <div className={styles.switchLabel}>Use compact table layout</div>
                              <div className={styles.switchDescription}>Reduce spacing for more data on screen</div>
                            </div>
                            <button
                              type="button"
                              className={`${styles.switchToggle} ${field.value ? styles.active : ''}`}
                              onClick={() => field.onChange(!field.value)}
                            >
                              <div className={styles.switchThumb}></div>
                            </button>
                          </div>
                        )}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Theme & Appearance */}
            <div className={styles.accordionSection}>
              <button
                type="button"
                className={`${styles.accordionHeader} ${activeSection === 'theme' ? styles.active : ''}`}
                onClick={() => toggleSection('theme')}
              >
                <div className={styles.accordionHeaderContent}>
                  <div className={styles.accordionIcon}>
                    <Icon name="palette" size="1.25rem" />
                  </div>
                  <div>
                    <div className={styles.accordionTitle}>Theme & Appearance</div>
                    <div className={styles.accordionDescription}>Theme preferences and visual settings</div>
                  </div>
                </div>
                <div className={styles.accordionChevron}>
                  <Icon name="chevron-down" size="1rem" />
                </div>
              </button>
              {activeSection === 'theme' && (
                <div className={styles.accordionContent}>
                  <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        Theme <span className={styles.required}>*</span>
                      </label>
                      <Controller
                        name="theme"
                        control={control}
                        rules={validationRules.theme}
                        render={({ field }) => (
                          <>
                            <select
                              {...field}
                              className={`${styles.formSelect} ${errors.theme ? styles.error : ''}`}
                            >
                              {themeOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label} - {option.description}
                                </option>
                              ))}
                            </select>
                            {errors.theme && (
                              <div className={styles.errorMessage}>
                                <Icon name="exclamation-triangle" className={styles.errorIcon} />
                                {errors.theme.message}
                              </div>
                            )}
                          </>
                        )}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        Timezone
                      </label>
                      <Controller
                        name="timezone"
                        control={control}
                        rules={validationRules.timezone}
                        render={({ field }) => (
                          <>
                            <input
                              {...field}
                              type="text"
                              readOnly
                              className={`${styles.formInput} ${errors.timezone ? styles.error : ''}`}
                              placeholder="Auto-detected timezone"
                            />
                            <div className={styles.helpText}>
                              Timezone is automatically detected from your system
                            </div>
                            {errors.timezone && (
                              <div className={styles.errorMessage}>
                                <Icon name="exclamation-triangle" className={styles.errorIcon} />
                                {errors.timezone.message}
                              </div>
                            )}
                          </>
                        )}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.secondaryButton}`}
              onClick={handleResetDefaults}
              disabled={loading}
            >
              <Icon name="arrow-clockwise" size="var(--icon-size-small)" />
              Reset to Defaults
            </button>

            <button
              type="submit"
              className={`${styles.actionButton} ${styles.primaryButton} ${loading ? styles.loading : ''}`}
              disabled={!isDirty || loading}
            >
              {loading && <div className={styles.loadingSpinner} />}
              <Icon name={loading ? "hourglass-split" : "check-lg"} size="var(--icon-size-small)" />
              {loading ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModernSettings;