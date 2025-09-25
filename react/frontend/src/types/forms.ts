/**
 * TypeScript definitions for form schemas and validation
 * Provides type safety for React Hook Form implementations
 */

import { FieldValues, RegisterOptions } from 'react-hook-form';

// Base form field validation rules
export interface BaseFieldRules {
  required?: string | boolean;
  minLength?: {
    value: number;
    message: string;
  };
  maxLength?: {
    value: number;
    message: string;
  };
  pattern?: {
    value: RegExp;
    message: string;
  };
  validate?: Record<string, (value: any) => boolean | string>;
}

// Login form types
export interface LoginFormData {
  username: string;
  password: string;
}

export interface LoginValidationRules {
  username: RegisterOptions<LoginFormData>;
  password: RegisterOptions<LoginFormData>;
}

// Filter form types (for SimpleFilters)
export interface FilterFormData {
  sites: string[];
  timeRange: string;
  startDate: string;
  endDate: string;
}

export interface FilterValidationRules {
  sites: RegisterOptions<FilterFormData>;
  timeRange: RegisterOptions<FilterFormData>;
  startDate: RegisterOptions<FilterFormData>;
  endDate: RegisterOptions<FilterFormData>;
}

// Preset form types
export interface PresetFormData {
  name: string;
  description: string;
  category: string;
  settings: Record<string, any>;
  isDefault: boolean;
}

export interface CreatePresetFormData {
  name: string;
  description: string;
}

export interface ImportPresetFormData {
  file: FileList;
  overwriteExisting: boolean;
}

export interface PresetValidationRules {
  name: RegisterOptions<PresetFormData>;
  description: RegisterOptions<PresetFormData>;
  category: RegisterOptions<PresetFormData>;
  settings: RegisterOptions<PresetFormData>;
}

// Preset management types
export interface Preset {
  id: string;
  name: string;
  description: string;
  category: 'system' | 'user' | 'shared';
  settings: Record<string, any>;
  created: string;
  modified: string;
  isDefault?: boolean;
}

export interface PresetCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  presets: Preset[];
}

export interface PresetSelectorProps {
  show: boolean;
  onHide: () => void;
  currentSettings: Record<string, any>;
  onApplyPreset: (preset: Preset) => void;
  onSettingsChange?: (settings: Record<string, any>) => void;
}

// Upload form types
export interface UploadFormData {
  file: FileList;
  dataType: string;
  description?: string;
  tags?: string[];
}

export interface UploadValidationRules {
  file: RegisterOptions<UploadFormData>;
  dataType: RegisterOptions<UploadFormData>;
  description: RegisterOptions<UploadFormData>;
  tags: RegisterOptions<UploadFormData>;
}

// Settings form types
export interface SettingsFormData {
  preferences: {
    theme: 'light' | 'dark' | 'auto';
    notifications: boolean;
    dataRefreshInterval: number;
    defaultTimeRange: string;
  };
  display: {
    chartsPerPage: number;
    showDataPoints: boolean;
    animateCharts: boolean;
  };
  export: {
    defaultFormat: 'csv' | 'excel' | 'json';
    includeMetadata: boolean;
    timezone: string;
  };
}

// Generic form error types
export interface FormError {
  type: string;
  message: string;
}

export interface ServerError extends FormError {
  code?: string;
  details?: Record<string, any>;
}

// Form state types
export interface FormSubmissionState {
  isSubmitting: boolean;
  isValid: boolean;
  isDirty: boolean;
  submitCount: number;
}

// Advanced form features
export interface FieldArrayItem {
  id: string;
  value: any;
}

export interface ConditionalFieldConfig {
  condition: string;
  dependsOn: string[];
  value: any;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
}

// Form resolver types (for external validation libraries)
export interface FormResolverConfig {
  mode: 'sync' | 'async';
  reValidateMode: 'onChange' | 'onBlur' | 'onSubmit';
  shouldFocusError: boolean;
}

// Form validation schema builder
export interface ValidationSchema<T extends FieldValues> {
  fields: {
    [K in keyof T]: RegisterOptions<T>;
  };
  config?: FormResolverConfig;
}

// Utility type for creating typed form validation rules
export type CreateValidationRules<T extends FieldValues> = {
  [K in keyof T]: RegisterOptions<T>;
};

// Export helper type for form hooks
export interface FormHookResult<T extends FieldValues> {
  formState: FormSubmissionState;
  errors: Record<keyof T, FormError>;
  register: (name: keyof T, rules?: RegisterOptions<T>) => any;
  handleSubmit: (onSubmit: (data: T) => void) => (e: React.FormEvent) => void;
  setValue: (name: keyof T, value: T[keyof T]) => void;
  watch: (name?: keyof T | keyof T[]) => any;
  reset: (data?: Partial<T>) => void;
}