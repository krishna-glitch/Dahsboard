/**
 * TypeScript definitions for settings and user preferences
 * Provides type safety for settings management
 */

import { RegisterOptions } from 'react-hook-form';

// Settings form data structure
export interface SettingsFormData {
  // Dashboard preferences
  defaultTimeRange: string;
  defaultSites: string[];
  autoRefresh: boolean;
  refreshInterval: number;

  // Data display preferences
  defaultChartType: 'line' | 'scatter' | 'bar' | 'heatmap';
  showDataPoints: boolean;
  compactTables: boolean;
  rowsPerPage: number;

  // Notifications
  emailAlerts: boolean;
  browserNotifications: boolean;
  alertThresholds: boolean;

  // Export preferences
  defaultExportFormat: 'xlsx' | 'csv' | 'json' | 'pdf';
  includeMetadata: boolean;

  // Theme and display
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;
}

// Settings validation rules
export interface SettingsValidationRules {
  defaultTimeRange: RegisterOptions<SettingsFormData>;
  defaultSites: RegisterOptions<SettingsFormData>;
  autoRefresh: RegisterOptions<SettingsFormData>;
  refreshInterval: RegisterOptions<SettingsFormData>;
  defaultChartType: RegisterOptions<SettingsFormData>;
  showDataPoints: RegisterOptions<SettingsFormData>;
  compactTables: RegisterOptions<SettingsFormData>;
  rowsPerPage: RegisterOptions<SettingsFormData>;
  emailAlerts: RegisterOptions<SettingsFormData>;
  browserNotifications: RegisterOptions<SettingsFormData>;
  alertThresholds: RegisterOptions<SettingsFormData>;
  defaultExportFormat: RegisterOptions<SettingsFormData>;
  includeMetadata: RegisterOptions<SettingsFormData>;
  theme: RegisterOptions<SettingsFormData>;
  language: RegisterOptions<SettingsFormData>;
  timezone: RegisterOptions<SettingsFormData>;
}

// User profile data
export interface UserProfile {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: 'admin' | 'analyst' | 'viewer';
  permissions: string[];
  preferences: SettingsFormData;
  lastLogin: string;
  created: string;
}

// Settings sections for UI organization
export interface SettingsSection {
  id: string;
  title: string;
  description: string;
  icon: string;
  fields: (keyof SettingsFormData)[];
}

// Time range options for settings
export interface TimeRangeOption {
  value: string;
  label: string;
  days: number;
}

// Export format options
export interface ExportFormatOption {
  value: SettingsFormData['defaultExportFormat'];
  label: string;
  description: string;
  fileExtension: string;
}

// Theme options
export interface ThemeOption {
  value: SettingsFormData['theme'];
  label: string;
  description: string;
}

// Chart type options
export interface ChartTypeOption {
  value: SettingsFormData['defaultChartType'];
  label: string;
  description: string;
  icon: string;
}