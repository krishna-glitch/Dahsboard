import React from 'react';

const WaterQualityChartControls = ({
  selectedParameter,
  setSelectedParameter,
  chartType,
  setChartType,
  compareMode,
  setCompareMode,
  compareParameter,
  setCompareParameter,
}) => {
  return (
    <div className="chart-controls">
      <select
        value={selectedParameter}
        onChange={(e) => setSelectedParameter(e.target.value)}
        className="filter-input"
        style={{ marginRight: 'var(--spacing-component-sm)' }}
      >
        <option value="temperature_c">Temperature</option>
        <option value="conductivity_us_cm">Conductivity</option>
        <option value="water_level_m">Water Level</option>
      </select>

      <select
        value={chartType}
        onChange={(e) => setChartType(e.target.value)}
        className="filter-input"
      >
        <option value="line">Line Chart</option>
        <option value="scatter">Scatter Plot</option>
      </select>

      <select
        value={compareMode}
        onChange={(e) => setCompareMode(e.target.value)}
        className="filter-input"
        style={{ marginLeft: 'var(--spacing-component-sm)' }}
      >
        <option value="off">No Compare</option>
        <option value="overlay">Overlay</option>
        <option value="split">Side by Side</option>
      </select>
      {compareMode !== 'off' && (
        <select
          value={compareParameter}
          onChange={(e) => setCompareParameter(e.target.value)}
          className="filter-input"
          style={{ marginLeft: 'var(--spacing-component-sm)' }}
        >
          <option value="temperature_c">Temperature</option>
          <option value="conductivity_us_cm">Conductivity</option>
          <option value="water_level_m">Water Level</option>
        </select>
      )}
    </div>
  );
};

export default WaterQualityChartControls;
