import { useState, useCallback } from 'react';

/**
 * Custom hook for managing user settings
 * Provides access to user preferences with localStorage persistence
 */
export const useUserSettings = () => {
  const [settings, setSettings] = useState(() => {
    // Default settings
    const defaults = {
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
    };

    // Try to load from localStorage
    try {
      const saved = localStorage.getItem('userSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaults, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load user settings:', error);
    }

    return defaults;
  });

  const [isLoading, setIsLoading] = useState(false);

  // Save settings to localStorage
  const saveSettings = useCallback(async (newSettings) => {
    setIsLoading(true);
    try {
      const settingsToSave = { ...settings, ...newSettings };
      localStorage.setItem('userSettings', JSON.stringify(settingsToSave));
      setSettings(settingsToSave);
      
      // In a real app, you'd also save to backend
      // await api.post('/user/settings', settingsToSave);
      
      return { success: true };
    } catch (error) {
      console.error('Failed to save settings:', error);
      return { success: false, error };
    } finally {
      setIsLoading(false);
    }
  }, [settings]);

  // Update a specific setting
  const updateSetting = useCallback((key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    // Auto-save to localStorage
    try {
      localStorage.setItem('userSettings', JSON.stringify(newSettings));
    } catch (error) {
      console.warn('Failed to auto-save setting:', error);
    }
  }, [settings]);

  // Reset to defaults
  const resetSettings = useCallback(() => {
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
    
    try {
      localStorage.setItem('userSettings', JSON.stringify(defaults));
    } catch (error) {
      console.warn('Failed to save reset settings:', error);
    }
  }, []);

  // Get a specific setting with fallback
  const getSetting = useCallback((key, fallback = null) => {
    return settings[key] !== undefined ? settings[key] : fallback;
  }, [settings]);

  // Check if settings are using defaults (useful for showing "restore defaults" option)
  const isUsingDefaults = useCallback(() => {
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
    
    return JSON.stringify(settings) === JSON.stringify(defaults);
  }, [settings]);

  return {
    settings,
    saveSettings,
    updateSetting,
    resetSettings,
    getSetting,
    isUsingDefaults,
    isLoading
  };
};

// Convenience hooks for specific settings
export const useDefaultTimeRange = () => {
  const { getSetting } = useUserSettings();
  return getSetting('defaultTimeRange', '7d');
};

export const useDefaultSites = () => {
  const { getSetting } = useUserSettings();
  return getSetting('defaultSites', []);
};

export const useTableSettings = () => {
  const { getSetting } = useUserSettings();
  return {
    rowsPerPage: getSetting('rowsPerPage', 50),
    compactTables: getSetting('compactTables', false)
  };
};

export const useChartSettings = () => {
  const { getSetting } = useUserSettings();
  return {
    defaultChartType: getSetting('defaultChartType', 'line'),
    showDataPoints: getSetting('showDataPoints', true),
    alertThresholds: getSetting('alertThresholds', true)
  };
};

export const useExportSettings = () => {
  const { getSetting } = useUserSettings();
  return {
    defaultFormat: getSetting('defaultExportFormat', 'xlsx'),
    includeMetadata: getSetting('includeMetadata', true)
  };
};