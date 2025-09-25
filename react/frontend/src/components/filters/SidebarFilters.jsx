import React from 'react';
import SimpleFilters from '../../components/modern/SimpleFilters';

/**
 * SidebarFilters
 * Reusable filter sidebar wrapper that renders the common filter panel
 * with collapse support and the shared SimpleFilters UI.
 */
const SidebarFilters = ({
  // Layout
  collapsed = false,
  onToggleCollapse = () => {},
  top = null, // optional node to render above filters (e.g., tutorial hint)

  // Filters
  selectedSites = [],
  onSiteChange = () => {},
  timeRange = 'Last 30 Days',
  onTimeRangeChange = () => {},
  startDate = '',
  endDate = '',
  onStartDateChange = () => {},
  onEndDateChange = () => {},
  onApplyFilters = () => {},
  loading = false,
  minDate = undefined,
  maxDate = undefined,
  presetSettings = null,
  onPresetSaved
}) => {
  return (
    <div className={`filter-panel ${collapsed ? 'collapsed' : ''}`}>
      {top}
      <SimpleFilters
        selectedSites={selectedSites}
        onSiteChange={onSiteChange}
        timeRange={timeRange}
        onTimeRangeChange={onTimeRangeChange}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        onApplyFilters={onApplyFilters}
        loading={loading}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        maxDate={maxDate}
        minDate={minDate}
        presetSettings={presetSettings}
        onPresetSaved={onPresetSaved}
      />
    </div>
  );
};

export default SidebarFilters;
