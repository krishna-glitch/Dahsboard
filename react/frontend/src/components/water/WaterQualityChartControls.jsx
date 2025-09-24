import React from 'react';
import Form from 'react-bootstrap/Form';
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
  const supportedChartTypes = React.useMemo(
    () => CHART_TYPES.filter((type) => ['line', 'scatter', 'bar'].includes(type.value)),
    []
  );

  return (
    <div className="chart-controls">
      <Form.Select
        size="sm"
        name="selectedParameter"
        aria-label="Select water quality parameter"
        value={selectedParameter}
        onChange={(event) => setSelectedParameter(event.target.value)}
        className="chart-control-select"
      >
        {WATER_QUALITY_PARAMETERS.map((param) => (
          <option key={param.value} value={param.value}>
            {param.label}
          </option>
        ))}
      </Form.Select>

      <Form.Select
        size="sm"
        name="chartType"
        aria-label="Select chart type"
        value={chartType}
        onChange={(event) => setChartType(event.target.value)}
        className="chart-control-select"
      >
        {supportedChartTypes.map((type) => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </Form.Select>

      <Form.Select
        size="sm"
        name="compareMode"
        aria-label="Select comparison mode"
        value={compareMode}
        onChange={(event) => setCompareMode(event.target.value)}
        className="chart-control-select"
      >
        <option value="off">No Compare</option>
        <option value="overlay">Overlay</option>
        <option value="split">Side by Side</option>
      </Form.Select>

      {compareMode !== 'off' && (
        <Form.Select
          size="sm"
          name="compareParameter"
          aria-label="Select comparison parameter"
          value={compareParameter}
          onChange={(event) => setCompareParameter(event.target.value)}
          className="chart-control-select"
        >
          {WATER_QUALITY_PARAMETERS.map((param) => (
            <option key={param.value} value={param.value}>
              {param.label}
            </option>
          ))}
        </Form.Select>
      )}
    </div>
  );
};

export default WaterQualityChartControls;
