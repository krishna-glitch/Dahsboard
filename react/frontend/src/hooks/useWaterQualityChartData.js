import { useMemo } from 'react';

/**
 * Custom hook for water quality chart data processing
 * Extracted from ModernWaterQuality.jsx to improve performance and maintainability
 */
export const useWaterQualityChartData = (data, selectedParameter, chartType, compareMode, compareParameter) => {
  return useMemo(() => {
    if (!data?.length) return [];

    const largeDataset = data.length > 10000;
    const useWebGL = chartType !== 'bar' && largeDataset;
    const bySite = {};
    const colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd'];

    // Process primary parameter data
    for (const d of data) {
      const site = d.site_code;
      const x = d.measurement_timestamp;
      const y = d[selectedParameter];
      if (y == null) continue;
      if (!bySite[site]) {
        bySite[site] = {
          x: [],
          y: [],
          name: `Site ${site}`,
          type: chartType === 'bar' ? 'bar' : (useWebGL ? 'scattergl' : 'scatter')
        };
      }
      bySite[site].x.push(x);
      bySite[site].y.push(y);
    }

    const tracesPrimary = Object.values(bySite).map((t, index) => ({
      ...t,
      mode: chartType === 'line' ? 'lines' : 'markers',
      line: chartType !== 'bar' ? {
        width: largeDataset ? 1 : 2,
        color: colors[index % colors.length]
      } : undefined,
      marker: chartType !== 'bar' ? {
        size: largeDataset ? 3 : 6,
        color: colors[index % colors.length]
      } : undefined,
      hoverinfo: 'x+y+name',
      connectgaps: false,
      simplify: true
    }));

    // Process comparison parameter if enabled
    if (compareMode === 'overlay' && compareParameter && compareParameter !== selectedParameter) {
      const cmpBySite = {};
      for (const d of data) {
        const site = d.site_code;
        const x = d.measurement_timestamp;
        const y = d[compareParameter];
        if (y == null) continue;
        if (!cmpBySite[site]) {
          cmpBySite[site] = {
            x: [],
            y: [],
            name: `Site ${site} (${compareParameter})`,
            type: (useWebGL ? 'scattergl' : 'scatter')
          };
        }
        cmpBySite[site].x.push(x);
        cmpBySite[site].y.push(y);
      }

      const tracesSecondary = Object.values(cmpBySite).map((t) => ({
        ...t,
        mode: chartType === 'line' ? 'lines' : 'markers',
        yaxis: 'y2',
        line: chartType === 'line' ? {
          color: '#a78bfa',
          width: largeDataset ? 1 : 2,
          dash: 'dot'
        } : undefined,
        marker: chartType !== 'bar' ? {
          size: largeDataset ? 3 : 5,
          color: '#a78bfa'
        } : undefined
      }));

      return [...tracesPrimary, ...tracesSecondary];
    }

    return tracesPrimary;
  }, [data, selectedParameter, chartType, compareMode, compareParameter]);
};

export default useWaterQualityChartData;