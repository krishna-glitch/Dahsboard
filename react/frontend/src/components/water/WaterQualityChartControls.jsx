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
  comparisonView,
  setComparisonView,
  yAxisParameter,
  setYAxisParameter,
}) => {
  const supportedChartTypes = React.useMemo(
    () => CHART_TYPES.filter((type) => ['line', 'scatter', 'bar'].includes(type.value)),
    []
  );

  const parameterOptions = React.useMemo(
    () =>
      WATER_QUALITY_PARAMETERS.map((param) => (
        <option key={param.value} value={param.value}>
          {param.label}
        </option>
      )),
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
        {parameterOptions}
      </Form.Select>

      <Form.Select
        size="sm"
        name="comparisonView"
        aria-label="Select visualization mode"
        value={comparisonView}
        onChange={(event) => setComparisonView(event.target.value)}
        className="chart-control-select"
      >
        <option value="time-series">Time Series</option>
        <option value="parameter">Parameter Comparison</option>
      </Form.Select>

      <Form.Select
        size="sm"
        name="chartType"
        aria-label="Select chart type"
        value={comparisonView === 'parameter' ? 'scatter' : chartType}
        onChange={(event) => setChartType(event.target.value)}
        className="chart-control-select"
        disabled={comparisonView === 'parameter'}
      >
        {supportedChartTypes.map((type) => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </Form.Select>

      {comparisonView === 'time-series' && (
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
      )}

      {comparisonView === 'time-series' && compareMode !== 'off' && (
        <Form.Select
          size="sm"
          name="compareParameter"
          aria-label="Select comparison parameter"
          value={compareParameter}
          onChange={(event) => setCompareParameter(event.target.value)}
          className="chart-control-select"
        >
          {parameterOptions}
        </Form.Select>
      )}

      {comparisonView === 'parameter' && (
        <Form.Select
          size="sm"
          name="yAxisParameter"
          aria-label="Select Y-axis parameter"
          value={yAxisParameter}
          onChange={(event) => setYAxisParameter(event.target.value)}
          className="chart-control-select"
        >
          {parameterOptions}
        </Form.Select>
      )}
    </div>
  );
};

export default WaterQualityChartControls;
