/**
 * TypeScript definitions for filter components
 * Provides type safety for filtering system
 */

import { RegisterOptions, FieldValues } from 'react-hook-form';

// Filter form data types
export interface FilterFormData {
  sites: string[];
  timeRange: string;
  startDate: string;
  endDate: string;
}

// Simple filters component props
export interface SimpleFiltersProps {
  selectedSites?: string[];
  onSiteChange?: (sites: string[]) => void;
  timeRange?: string;
  onTimeRangeChange?: (timeRange: string) => void;
  startDate?: string;
  endDate?: string;
  onStartDateChange?: (date: string) => void;
  onEndDateChange?: (date: string) => void;
  onApplyFilters?: (filters: FilterFormData) => void;
  loading?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  maxDate?: string;
  minDate?: string;
  presetSettings?: Record<string, unknown> | null;
  onPresetSaved?: (preset: Record<string, unknown>) => void;
}

// Sidebar filters component props
export interface SidebarFiltersProps extends SimpleFiltersProps {
  top?: React.ReactNode; // optional node to render above filters
}

// Time range option
export interface TimeRangeOption {
  value: string;
  label: string;
  days?: number;
}

// Preset filter configuration
export interface FilterPreset {
  id: string;
  name: string;
  description: string;
  filters: FilterFormData;
  isDefault?: boolean;
  created: string;
  modified: string;
}

// Filter validation rules
export interface FilterValidationRules {
  sites: RegisterOptions<FilterFormData>;
  timeRange: RegisterOptions<FilterFormData>;
  startDate: RegisterOptions<FilterFormData>;
  endDate: RegisterOptions<FilterFormData>;
}

// Site configuration
export interface Site {
  code: string;
  name: string;
  description?: string;
  active: boolean;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

// Filter state management
export interface FilterState {
  filters: FilterFormData;
  loading: boolean;
  error?: string;
  availableSites: Site[];
  timeRanges: TimeRangeOption[];
  presets: FilterPreset[];
}
