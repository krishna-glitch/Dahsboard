import React from 'react';
import TimeSeriesSmallMultiples from './TimeSeriesSmallMultiples';
import TimeSeriesBySite from './TimeSeriesBySite';
import RollingSmallMultiples from './RollingSmallMultiples';
import SnapshotChart from './SnapshotChart';
import ZonesChart from './ZonesChart';
import HeatmapChart from './HeatmapChart';
import DeckRedoxScatter from './DeckRedoxScatter';

const RedoxChartRouter = React.memo(function RedoxChartRouter({
  selectedView,
  data = [],
  chartData = {},
  chartType = 'line',
  chartViewMode = 'by-depth',
  snapshotMode = 'profile',
  invertSeriesY = false,
  invertRollingY = false,
  invertX = false,
  invertY = true,
  snapshotSeries = { profile: [], scatter: [] },
  parameterLabel = 'Depth & Redox',
  selectedSites = [],
  siteColors = {},
}) {
  // Ensure we have a valid selectedView
  if (!selectedView) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
        <p>Please select a chart view to display</p>
      </div>
    );
  }

  switch (selectedView) {
    case 'timeseries':
      // For very large datasets (100k+), use deck.gl for maximum performance
      if (Array.isArray(data) && data.length > 100000) {
        console.log('RedoxChartRouter: Using high-performance deck.gl for', data.length, 'data points');
        const fallback = (chartViewMode === 'by-site') ? (
          <TimeSeriesBySite
            data={data}
            chartData={chartData}
            chartType={chartType}
            invertSeriesY={invertSeriesY}
            selectedSites={selectedSites}
            siteColors={siteColors}
          />
        ) : (
          <TimeSeriesSmallMultiples
            data={data}
            chartData={chartData}
            chartType={chartType}
            invertSeriesY={invertSeriesY}
          />
        );
        return (
          <DeckRedoxScatter
            data={data}
            siteColors={siteColors}
            fallback={fallback}
          />
        );
      } else {
        console.log('RedoxChartRouter: Using WebGL-accelerated Plotly charts for', data.length, 'data points');
      }
      if (chartViewMode === 'by-site') {
        return (
          <TimeSeriesBySite
            data={data}
            chartData={chartData}
            chartType={chartType}
            invertSeriesY={invertSeriesY}
            selectedSites={selectedSites}
            siteColors={siteColors}
          />
        );
      } else {
        return (
          <TimeSeriesSmallMultiples
            data={data}
            chartData={chartData}
            chartType={chartType}
            invertSeriesY={invertSeriesY}
          />
        );
      }
    case 'rolling':
      return (
        <RollingSmallMultiples
          data={data}
          chartType={chartType}
          invertRollingY={invertRollingY}
        />
      );
    case 'snapshot':
      return (
        <>
          <SnapshotChart 
            snapshotSeries={snapshotSeries} 
            snapshotMode={snapshotMode}
            invertX={invertX} 
            invertY={invertY} 
          />
          <div style={{ color: '#6c757d', fontSize: '0.85rem', marginTop: 6 }}>
            {snapshotMode === 'scatter' 
              ? 'Scatter plot showing individual Eh measurements versus depth for each site near the selected time.'
              : 'Depth profile snapshot showing Eh (mV) versus depth for each site near the selected time.'}
          </div>
        </>
      );
    case 'zones':
      return <ZonesChart data={data} parameterLabel={parameterLabel} />;
    case 'heatmap':
      return <HeatmapChart data={data} />;
    default:
      if (chartViewMode === 'by-site') {
        return (
          <TimeSeriesBySite
            data={data}
            chartType={chartType}
            invertSeriesY={invertSeriesY}
            selectedSites={selectedSites}
            siteColors={siteColors}
          />
        );
      } else {
        return <TimeSeriesSmallMultiples data={data} chartType={chartType} invertSeriesY={invertSeriesY} />;
      }
  }
});

export default RedoxChartRouter;
