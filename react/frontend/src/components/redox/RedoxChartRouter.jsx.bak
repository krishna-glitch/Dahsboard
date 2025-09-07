import React from 'react';
import TimeSeriesSmallMultiples from './TimeSeriesSmallMultiples';
import TimeSeriesBySite from './TimeSeriesBySite';
import RollingSmallMultiples from './RollingSmallMultiples';
import SnapshotChart from './SnapshotChart';
import ZonesChart from './ZonesChart';
import HeatmapChart from './HeatmapChart';

const RedoxChartRouter = React.memo(function RedoxChartRouter({
  selectedView,
  data,
  chartData,
  chartType = 'line',
  chartViewMode = 'by-depth',
  snapshotMode = 'profile',
  invertSeriesY = false,
  invertRollingY = false,
  invertX = false,
  invertY = true,
  snapshotSeries = [],
  parameterLabel = 'Depth & Redox',
  selectedSites = [],
  siteColors = {},
}) {
  switch (selectedView) {
    case 'timeseries':
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

