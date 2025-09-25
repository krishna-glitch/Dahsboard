import React from 'react';
import Plot from '../PlotlyLite';
import { log } from '../../utils/log';

const WaterQualityChartRouter = ({
  activeView,
  chartData = [],
  chartType,
  selectedParameter,
  compareMode,
  compareParameter,
  parameterConfig = {},
  alertShapes = [],
  data = [],
  summaryItems = [],
  comparisonView = 'time-series',
  parameterScatterTraces = [],
  xAxisLabel = '',
  yAxisLabel = '',
}) => {
  if (activeView === 'details') return null;

  const shouldUseFallbackSummary = comparisonView === 'time-series';

  const fallbackSummary = React.useMemo(() => {
    if (!shouldUseFallbackSummary) return [];

    const totalPoints = chartData.reduce(
      (sum, series) => sum + (series?.x?.length || 0),
      0
    );
    const siteSet = new Set();
    (Array.isArray(data) ? data : []).forEach((row) => {
      if (row?.site_code) {
        siteSet.add(row.site_code);
      }
    });

    const parameterLabel = parameterConfig[selectedParameter]?.label || selectedParameter;
    const parameterUnit = parameterConfig[selectedParameter]?.unit;
    const compareLabel =
      compareMode !== 'off'
        ? parameterConfig[compareParameter]?.label || compareParameter
        : null;

    const summary = [
      `${totalPoints.toLocaleString()} observations`,
      `${siteSet.size} site${siteSet.size === 1 ? '' : 's'}`,
      `${parameterLabel}${parameterUnit ? ` (${parameterUnit})` : ''}`,
    ];

    if (compareLabel) {
      summary.push(
        `${compareMode === 'overlay' ? 'Overlay' : 'Side by Side'} vs ${compareLabel}`
      );
    }

    return summary;
  }, [shouldUseFallbackSummary, chartData, data, parameterConfig, selectedParameter, compareMode, compareParameter]);

  const hasExternalSummary = Array.isArray(summaryItems) && summaryItems.length > 0;
  const resolvedSummary = hasExternalSummary ? summaryItems : fallbackSummary;

  const headerTitle =
    comparisonView === 'parameter'
      ? `${xAxisLabel || selectedParameter} vs ${yAxisLabel || compareParameter}`
      : `${parameterConfig[selectedParameter]?.label} Trends Over Time`;

  const headerIcon = parameterConfig[selectedParameter]?.icon || 'graph-up';

  const header = (
    <div className="chart-header">
      <div>
        <h3 className="chart-title">
          <i className={`bi bi-${headerIcon} me-2`}></i>
          {headerTitle}
        </h3>
        {resolvedSummary.length > 0 && (
          <p className="chart-subtitle">{resolvedSummary.join(' • ')}</p>
        )}
      </div>
    </div>
  );

  const renderTimeSeries = () => {
    if (chartData.length === 0) {
      return (
        <div className="chart-placeholder">
          <div className="text-center p-4">
            <i className="bi bi-bar-chart text-muted" style={{ fontSize: '3rem' }}></i>
            <h5 className="mt-3 text-muted">No Chart Data Available</h5>
            <p className="text-muted">No valid data points found for the selected parameter and filters.</p>
          </div>
        </div>
      );
    }

    if (compareMode === 'split') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {[selectedParameter, compareParameter].filter(Boolean).map((param) => (
            <Plot
              key={param}
              data={(() => {
                const bySite = {};
                (Array.isArray(data) ? data : []).forEach((row) => {
                  if (!row) return;
                  if (!bySite[row.site_code]) {
                    bySite[row.site_code] = {
                      x: [],
                      y: [],
                      name: `Site ${row.site_code}`,
                      type: 'scatter',
                    };
                  }
                  const value = row[param];
                  if (value != null) {
                    bySite[row.site_code].x.push(row.measurement_timestamp);
                    bySite[row.site_code].y.push(value);
                  }
                });
                return Object.values(bySite);
              })()}
              layout={{
                height: 520,
                margin: { l: 70, r: 30, t: 30, b: 90 },
                xaxis: {
                  title: 'Date',
                  type: 'date',
                  showgrid: true,
                  gridcolor: '#f0f0f0',
                  tickangle: -25,
                  tickformat: '%b %d',
                },
                yaxis: {
                  title: `${parameterConfig[param]?.label} (${parameterConfig[param]?.unit})`,
                  showgrid: true,
                  gridcolor: '#f0f0f0',
                },
                shapes: alertShapes,
                showlegend: true,
                legend: { orientation: 'h' },
                plot_bgcolor: 'rgba(0,0,0,0)',
                paper_bgcolor: 'rgba(0,0,0,0)',
              }}
              config={{ displayModeBar: true, responsive: true, displaylogo: false }}
              style={{ width: '100%', height: '520px' }}
            />
          ))}
        </div>
      );
    }

    return (
      <Plot
        data={chartData}
        layout={{
          height: 520,
          margin: { l: 70, r: 30, t: 30, b: 90 },
          xaxis:
            chartType === 'bar'
              ? { type: 'category', automargin: true }
              : {
                  type: 'date',
                  automargin: true,
                  tickangle: -25,
                  tickformat: '%b %d',
                },
          yaxis: {
            automargin: true,
            title: {
              text: `${parameterConfig[selectedParameter]?.label} (${parameterConfig[selectedParameter]?.unit})`,
            },
          },
          ...(compareMode === 'overlay'
            ? { yaxis2: { overlaying: 'y', side: 'right', automargin: true } }
            : {}),
          hovermode: chartType === 'bar' ? 'x' : 'closest',
          showlegend: chartData.length > 1,
          plot_bgcolor: 'rgba(0,0,0,0)',
          paper_bgcolor: 'rgba(0,0,0,0)',
        }}
        config={{
          displayModeBar: true,
          responsive: true,
          displaylogo: false,
          scrollZoom: true,
          modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
        }}
        style={{ width: '100%', height: '520px' }}
        onError={(error) => {
          try {
            log.error('[WQ] Plotly rendering error:', error);
          } catch {
            /* ignore log error */
          }
        }}
      />
    );
  };

  const renderParameterComparison = () => {
    if (!Array.isArray(parameterScatterTraces) || parameterScatterTraces.length === 0) {
      return (
        <div className="chart-placeholder">
          <div className="text-center p-4">
            <i className="bi bi-scatter-chart text-muted" style={{ fontSize: '3rem' }}></i>
            <h5 className="mt-3 text-muted">No Comparison Data Available</h5>
            <p className="text-muted">Select parameters that contain overlapping observations to visualize their relationship.</p>
          </div>
        </div>
      );
    }

    return (
      <Plot
        data={parameterScatterTraces}
        layout={{
          height: 520,
          margin: { l: 70, r: 30, t: 30, b: 70 },
          xaxis: {
            title: xAxisLabel || selectedParameter,
            automargin: true,
          },
          yaxis: {
            title: yAxisLabel || compareParameter,
            automargin: true,
          },
          hovermode: 'closest',
          showlegend: parameterScatterTraces.length > 1,
          plot_bgcolor: 'rgba(0,0,0,0)',
          paper_bgcolor: 'rgba(0,0,0,0)',
        }}
        config={{
          displayModeBar: true,
          responsive: true,
          displaylogo: false,
          scrollZoom: true,
          modeBarButtonsToRemove: ['lasso2d'],
        }}
        style={{ width: '100%', height: '520px' }}
        onError={(error) => {
          try {
            log.error('[WQ] Parameter scatter rendering error:', error);
          } catch {
            /* ignore log error */
          }
        }}
      />
    );
  };

  return (
    <div className="chart-container">
      {header}
      <div id="water-quality-chart">
        {comparisonView === 'parameter' ? renderParameterComparison() : renderTimeSeries()}
      </div>
    </div>
  );
};

export default React.memo(WaterQualityChartRouter);
