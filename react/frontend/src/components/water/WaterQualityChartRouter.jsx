import React from 'react';
import Plot from 'react-plotly.js';
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
  onShowDataTable,
  onRetry,
}) => {
  if (activeView === 'details') return null;

  const header = (
    <div className="chart-header">
      <div>
        <h3 className="chart-title">
          <i className={`bi bi-${parameterConfig[selectedParameter]?.icon} me-2`}></i>
          {parameterConfig[selectedParameter]?.label} Trends Over Time
        </h3>
        <p className="text-secondary" style={{ fontSize: '0.9rem', margin: 0 }}>
          Showing {chartData.reduce((sum, s) => sum + (s?.x?.length || 0), 0)} data points across {chartData.length} sites
        </p>
      </div>
    </div>
  );

  const overview = (
    <div id="water-quality-chart">
      {chartData.length === 0 ? (
        <div className="chart-placeholder">
          <div className="text-center p-4">
            <i className="bi bi-bar-chart text-muted" style={{ fontSize: '3rem' }}></i>
            <h5 className="mt-3 text-muted">No Chart Data Available</h5>
            <p className="text-muted">No valid data points found for the selected parameter and filters.</p>
          </div>
        </div>
      ) : compareMode !== 'split' ? (
        <Plot
          data={chartData}
          layout={{
            height: 450,
            margin: { l: 70, r: 30, t: 30, b: 60 },
            xaxis: chartType === 'bar' ? { type: 'category', automargin: true } : { type: 'date', automargin: true },
            yaxis: { automargin: true, title: { text: `${parameterConfig[selectedParameter]?.label} (${parameterConfig[selectedParameter]?.unit})` } },
            ...(compareMode === 'overlay' ? { yaxis2: { overlaying: 'y', side: 'right', automargin: true } } : {}),
            hovermode: chartType === 'bar' ? 'x' : 'closest',
            showlegend: chartData.length > 1,
            plot_bgcolor: 'rgba(0,0,0,0)',
            paper_bgcolor: 'rgba(0,0,0,0)'
          }}
          config={{ displayModeBar: true, responsive: true, displaylogo: false, scrollZoom: true, modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'] }}
          style={{ width: '100%', height: '400px' }}
          onError={(error) => {
            try { log.error('[WQ] Plotly rendering error:', error); } catch {}
          }}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {[selectedParameter, compareParameter].filter(Boolean).map((param) => (
            <Plot
              key={param}
              data={(() => {
                const bySite = {};
                (Array.isArray(data) ? data : []).forEach(d => {
                  if (!d) return;
                  if (!bySite[d.site_code]) bySite[d.site_code] = { x: [], y: [], name: `Site ${d.site_code}`, type: 'scatter' };
                  const value = d[param];
                  if (value != null) { bySite[d.site_code].x.push(d.measurement_timestamp); bySite[d.site_code].y.push(value); }
                });
                return Object.values(bySite);
              })()}
              layout={{
                height: 450,
                margin: { l: 70, r: 30, t: 30, b: 60 },
                xaxis: { title: 'Date', type: 'date', showgrid: true, gridcolor: '#f0f0f0' },
                yaxis: { title: `${parameterConfig[param]?.label} (${parameterConfig[param]?.unit})`, showgrid: true, gridcolor: '#f0f0f0' },
                shapes: alertShapes,
                showlegend: true,
                legend: { orientation: 'h' },
                plot_bgcolor: 'rgba(0,0,0,0)',
                paper_bgcolor: 'rgba(0,0,0,0)'
              }}
              config={{ displayModeBar: true, responsive: true, displaylogo: false }}
              style={{ width: '100%', height: '400px' }}
            />
          ))}
        </div>
      )}
      <div style={{ color: '#6c757d', fontSize: '0.85rem', marginTop: 6 }}>
        Time series of selected water quality parameter(s) by site over the chosen date range.
      </div>
    </div>
  );

  return (
    <div className="chart-container">
      {header}
      {overview}
    </div>
  );
};

export default React.memo(WaterQualityChartRouter);
