import React from 'react';
import { WATER_QUALITY_PARAMETERS, CHART_TYPES } from '../../constants/appConstants';

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
        {WATER_QUALITY_PARAMETERS.map(param => (
          <option key={param.value} value={param.value}>
            {param.label}
          </option>
        ))}
      </select>

      <select
        value={chartType}
        onChange={(e) => setChartType(e.target.value)}
        className="filter-input"
      >
        {CHART_TYPES.filter(type => ['line', 'scatter', 'bar'].includes(type.value)).map(type => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
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
          {WATER_QUALITY_PARAMETERS.map(param => (
            <option key={param.value} value={param.value}>
              {param.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};

export default WaterQualityChartControls;
