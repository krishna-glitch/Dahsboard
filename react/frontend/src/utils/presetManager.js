/**
 * Frontend Preset Management System
 * Allows users to create, save, and manage custom presets for water quality analysis
 */

// Default presets that come with the system
export const DEFAULT_PRESETS = {
  'quick-overview': {
    id: 'quick-overview',
    name: 'Quick Overview',
    description: 'Standard view for daily monitoring',
    icon: 'bi-speedometer2',
    isDefault: true,
    settings: {
      sites: ['S1', 'S2', 'S3'],
      timeRange: '7d',
      selectedParameter: 'temperature_c',
      compareMode: 'off',
      chartType: 'line',
      activeView: 'overview'
    },
    category: 'system'
  },
  'temperature-analysis': {
    id: 'temperature-analysis',
    name: 'Temperature Analysis',
    description: 'Focus on temperature patterns across sites',
    icon: 'bi-thermometer-half',
    isDefault: false,
    settings: {
      sites: ['S1', 'S2', 'S3', 'S4'],
      timeRange: '30d',
      selectedParameter: 'temperature_c',
      compareMode: 'overlay',
      compareParameter: 'water_level_m',
      chartType: 'line',
      activeView: 'overview'
    },
    category: 'analysis'
  },
  'conductivity-monitoring': {
    id: 'conductivity-monitoring',
    name: 'Conductivity Monitoring',
    description: 'Track conductivity changes for water quality',
    icon: 'bi-lightning',
    isDefault: false,
    settings: {
      sites: ['S1', 'S2'],
      timeRange: '90d',
      selectedParameter: 'conductivity_us_cm',
      compareMode: 'split',
      compareParameter: 'dissolved_oxygen_mg_l',
      chartType: 'line',
      activeView: 'details'
    },
    category: 'monitoring'
  },
  'comprehensive-study': {
    id: 'comprehensive-study',
    name: 'Comprehensive Study',
    description: 'All sites, long-term analysis',
    icon: 'bi-graph-up',
    isDefault: false,
    settings: {
      sites: ['S1', 'S2', 'S3', 'S4'],
      timeRange: '1y',
      selectedParameter: 'temperature_c',
      compareMode: 'overlay',
      compareParameter: 'conductivity_us_cm',
      chartType: 'line',
      activeView: 'details'
    },
    category: 'research'
  }
};

// Storage keys
const STORAGE_KEYS = {
  USER_PRESETS: 'wq_user_presets_v1',
  DEFAULT_PRESET: 'wq_default_preset_v1',
  PRESET_SETTINGS: 'wq_preset_settings_v1'
};

// Get all presets (system + user)
export function getAllPresets() {
  const userPresets = getUserPresets();
  return {
    ...DEFAULT_PRESETS,
    ...userPresets
  };
}

// Get user-created presets
export function getUserPresets() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.USER_PRESETS);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.warn('Error loading user presets:', error);
    return {};
  }
}

// Save user preset
export function saveUserPreset(preset) {
  try {
    const userPresets = getUserPresets();
    const presetId = preset.id || generatePresetId(preset.name);

    const newPreset = {
      ...preset,
      id: presetId,
      category: 'user',
      createdAt: preset.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    userPresets[presetId] = newPreset;
    localStorage.setItem(STORAGE_KEYS.USER_PRESETS, JSON.stringify(userPresets));

    return newPreset;
  } catch (error) {
    console.error('Error saving preset:', error);
    return null;
  }
}

export function findPresetByName(name) {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  const allPresets = getAllPresets();
  return Object.values(allPresets).find(preset => preset.name.trim().toLowerCase() === normalized) || null;
}

// Delete user preset
export function deleteUserPreset(presetId) {
  try {
    const userPresets = getUserPresets();
    delete userPresets[presetId];
    localStorage.setItem(STORAGE_KEYS.USER_PRESETS, JSON.stringify(userPresets));

    // If this was the default preset, reset to system default
    const currentDefault = getDefaultPreset();
    if (currentDefault === presetId) {
      setDefaultPreset('quick-overview');
    }

    return true;
  } catch (error) {
    console.error('Error deleting preset:', error);
    return false;
  }
}

// Get current default preset ID
export function getDefaultPreset() {
  try {
    return localStorage.getItem(STORAGE_KEYS.DEFAULT_PRESET) || 'quick-overview';
  } catch (error) {
    return 'quick-overview';
  }
}

// Set default preset
export function setDefaultPreset(presetId) {
  try {
    const allPresets = getAllPresets();
    if (allPresets[presetId]) {
      localStorage.setItem(STORAGE_KEYS.DEFAULT_PRESET, presetId);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error setting default preset:', error);
    return false;
  }
}

// Get preset by ID
export function getPresetById(presetId) {
  const allPresets = getAllPresets();
  return allPresets[presetId] || null;
}

// Create preset from current settings
export function createPresetFromSettings(currentSettings, name, description = '') {
  return {
    name,
    description,
    icon: 'bi-bookmark',
    isDefault: false,
    settings: {
      sites: currentSettings.selectedSites || [],
      timeRange: currentSettings.timeRange || '7d',
      startDate: currentSettings.startDate || '',
      endDate: currentSettings.endDate || '',
      selectedParameter: currentSettings.selectedParameter || 'temperature_c',
      compareMode: currentSettings.compareMode || 'off',
      compareParameter: currentSettings.compareParameter || 'conductivity_us_cm',
      chartType: currentSettings.chartType || 'line',
      activeView: currentSettings.activeView || 'overview',
      filtersCollapsed: currentSettings.filtersCollapsed || false
    },
    category: 'user'
  };
}

// Apply preset to component state
export function applyPresetToState(preset, setStateFunctions) {
  if (!preset || !preset.settings) return false;

  const { settings } = preset;
  const {
    setSelectedSites,
    setTimeRange,
    setStartDate,
    setEndDate,
    setSelectedParameter,
    setCompareMode,
    setCompareParameter,
    setChartType,
    setActiveView,
    setFiltersCollapsed
  } = setStateFunctions;

  try {
    // Apply settings with validation
    if (settings.sites && Array.isArray(settings.sites)) {
      setSelectedSites(settings.sites);
    }
    if (settings.timeRange) {
      setTimeRange(settings.timeRange);
    }
    if (settings.startDate && setStartDate) {
      setStartDate(settings.startDate);
    }
    if (settings.endDate && setEndDate) {
      setEndDate(settings.endDate);
    }
    if (settings.selectedParameter) {
      setSelectedParameter(settings.selectedParameter);
    }
    if (settings.compareMode) {
      setCompareMode(settings.compareMode);
    }
    if (settings.compareParameter) {
      setCompareParameter(settings.compareParameter);
    }
    if (settings.chartType) {
      setChartType(settings.chartType);
    }
    if (settings.activeView) {
      setActiveView(settings.activeView);
    }
    if (typeof settings.filtersCollapsed === 'boolean') {
      setFiltersCollapsed(settings.filtersCollapsed);
    }

    return true;
  } catch (error) {
    console.error('Error applying preset:', error);
    return false;
  }
}

// Generate unique preset ID
function generatePresetId(name) {
  const timestamp = Date.now();
  const slug = name.toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `user-${slug}-${timestamp}`;
}

// Export preset to JSON file
export function exportPreset(preset) {
  try {
    const dataStr = JSON.stringify(preset, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `water-quality-preset-${preset.name.replace(/[^a-z0-9]/gi, '-')}.json`;
    link.click();

    return true;
  } catch (error) {
    console.error('Error exporting preset:', error);
    return false;
  }
}

// Import preset from JSON file
export function importPreset(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const preset = JSON.parse(e.target.result);

        // Validate preset structure
        if (!preset.name || !preset.settings) {
          throw new Error('Invalid preset format');
        }

        // Save as user preset
        const savedPreset = saveUserPreset(preset);
        resolve(savedPreset);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// Get preset categories
export function getPresetCategories() {
  const allPresets = getAllPresets();
  const categories = {};

  Object.values(allPresets).forEach(preset => {
    const category = preset.category || 'other';
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(preset);
  });

  return categories;
}

// Validate preset settings
export function validatePresetSettings(settings) {
  const errors = [];

  if (!settings.sites || !Array.isArray(settings.sites) || settings.sites.length === 0) {
    errors.push('At least one site must be selected');
  }

  if (!settings.timeRange) {
    errors.push('Time range is required');
  }

  if (!settings.selectedParameter) {
    errors.push('Primary parameter is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
