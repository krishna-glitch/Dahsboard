import React from 'react';
import { useDefaultTimeRange, useChartSettings, useTableSettings, useUserSettings } from '../../hooks/useUserSettings';

/**
 * Example component showing how to use user settings
 * This demonstrates how other components can access user preferences
 */
const SettingsExample = () => {
  // Use specific setting hooks
  const defaultTimeRange = useDefaultTimeRange();
  const chartSettings = useChartSettings();
  const tableSettings = useTableSettings();
  
  // Or use the full settings hook for more control
  const { settings, updateSetting } = useUserSettings();

  return (
    <div className="p-4">
      <h3>Settings Usage Examples</h3>
      
      <div className="mb-3">
        <strong>Default Time Range:</strong> {defaultTimeRange}
        <br />
        <small>Components can use this to set initial time range filters</small>
      </div>

      <div className="mb-3">
        <strong>Chart Settings:</strong>
        <ul>
          <li>Default Type: {chartSettings.defaultChartType}</li>
          <li>Show Data Points: {chartSettings.showDataPoints ? 'Yes' : 'No'}</li>
          <li>Show Alert Thresholds: {chartSettings.alertThresholds ? 'Yes' : 'No'}</li>
        </ul>
        <small>Chart components can use these to configure their display</small>
      </div>

      <div className="mb-3">
        <strong>Table Settings:</strong>
        <ul>
          <li>Rows Per Page: {tableSettings.rowsPerPage}</li>
          <li>Compact Layout: {tableSettings.compactTables ? 'Yes' : 'No'}</li>
        </ul>
        <small>DataTable components can use these for pagination and layout</small>
      </div>

      <div className="mb-3">
        <strong>Auto Refresh:</strong> {settings.autoRefresh ? 'Enabled' : 'Disabled'}
        {settings.autoRefresh && (
          <span> (every {settings.refreshInterval}s)</span>
        )}
        <br />
        <small>Dashboard pages can use this to set up auto-refresh timers</small>
      </div>

      <div className="mb-3">
        <strong>Example: Toggle Auto Refresh</strong>
        <br />
        <button 
          className="btn btn-sm btn-primary"
          onClick={() => updateSetting('autoRefresh', !settings.autoRefresh)}
        >
          {settings.autoRefresh ? 'Disable' : 'Enable'} Auto Refresh
        </button>
        <br />
        <small>Any component can update settings using updateSetting</small>
      </div>
    </div>
  );
};

export default SettingsExample;