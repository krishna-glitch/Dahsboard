import React, { useMemo } from 'react';
import Plot from '../../components/PlotlyLite';

const RollingSmallMultiples = React.memo(function RollingSmallMultiples({ data, chartType = 'line', invertRollingY = false, maxDepthsToShow = 6 }) {
  // Site color palette - consistent colors for each site
  const siteColors = {
    'S1': '#1f77b4',  // Blue
    'S2': '#ff7f0e',  // Orange  
    'S3': '#2ca02c',  // Green
    'S4': '#d62728',  // Red
    'S5': '#9467bd',  // Purple
    'S6': '#8c564b'   // Brown
  };

  const depthsToShow = useMemo(() => {
    const ds = Array.from(new Set((data || [])
      .map(r => Number(r.depth_cm))
      .filter(v => Number.isFinite(v))))
      .sort((a, b) => a - b);
    return ds.slice(0, maxDepthsToShow);
  }, [data, maxDepthsToShow]);

  // Pre-group once: depth -> site -> { x:[], y:[] } and sort by time
  const groupedByDepth = useMemo(() => {
    const depthMap = new Map();
    (data || []).forEach(r => {
      const d = Number(r.depth_cm);
      if (!Number.isFinite(d)) return;
      const site = r.site_code;
      // Use 24h rolling value if present; else fallback to processed/raw Eh
      const eh = (r.processed_eh_roll24h != null ? r.processed_eh_roll24h : (r.processed_eh != null ? r.processed_eh : r.redox_value_mv));
      const y = Number(eh);
      const ts = r.measurement_timestamp;
      if (!site || ts == null || !Number.isFinite(y)) return;
      if (!depthMap.has(d)) depthMap.set(d, new Map());
      const bySite = depthMap.get(d);
      if (!bySite.has(site)) bySite.set(site, { x: [], y: [] });
      const s = bySite.get(site);
      s.x.push(ts);
      s.y.push(y);
    });
    // Sort each site's series by time so lines render correctly
    depthMap.forEach(bySite => {
      bySite.forEach(series => {
        try {
          const idx = series.x.map((v, i) => [i, new Date(v).getTime()])
            .filter(([, t]) => Number.isFinite(t))
            .sort((a, b) => a[1] - b[1])
            .map(([i]) => i);
          series.x = idx.map(i => series.x[i]);
          series.y = idx.map(i => series.y[i]);
        } catch { /* no-op */ }
      });
    });
    return depthMap;
  }, [data]);

  // Memoized layout factory function 
  const createLayout = useMemo(() => (depth, depthIndex, invertRollingY) => ({
    autosize: true,
    height: 280,
    margin: { l: 60, r: 20, t: 30, b: 40 },
    title: { text: `<b>${depth} cm</b>`, x: 0.5, y: 0.98, xanchor: 'center', font: { size: 12 } },
    xaxis: { title: { text: 'Date' }, type: 'date', automargin: true },
    yaxis: { title: { text: 'Eh 24h mean (mV)' }, automargin: true, autorange: invertRollingY ? 'reversed' : true },
    showlegend: true,
    legend: {
      x: 1.02,
      y: 1,
      xanchor: 'left',
      yanchor: 'top',
      bgcolor: 'rgba(255,255,255,0.85)',
      bordercolor: '#dee2e6',
      borderwidth: 1,
      font: { size: 12 },
      itemsizing: 'constant'
    },
    hovermode: 'closest',
    plot_bgcolor: 'rgba(0,0,0,0)',
    paper_bgcolor: 'rgba(0,0,0,0)'
  }), []);

  const siteDashes = {
    'S1': 'solid',
    'S2': 'dash',
    'S3': 'dot',
    'S4': 'dashdot'
  };
  const siteMarkers = {
    'S1': 'circle',
    'S2': 'square',
    'S3': 'diamond',
    'S4': 'triangle-up'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {depthsToShow.map((depth, depthIndex) => (
        <div key={`roll-${depth}`} className="subchart" style={{ width: '100%' }}>
          <Plot
            data={(() => {
              const bySite = groupedByDepth.get(depth) || new Map();
              // Compute total points to decide GL usage
              let totalPts = 0;
              bySite.forEach(s => { totalPts += Math.max(s.x.length, s.y.length); });
              const useGL = totalPts > 8000; // threshold for WebGL
              const traces = [];
              bySite.forEach((series, site) => {
                const siteColor = siteColors[site] || '#666666';
                traces.push({
                  x: series.x,
                  y: series.y,
                  name: site,
                  type: useGL ? 'scattergl' : 'scatter',
                  mode: chartType === 'line' ? 'lines' : 'markers',
                  line: { width: 2, color: siteColor, dash: siteDashes[site] || 'solid' },
                  marker: { color: siteColor, size: useGL ? 3 : 5, symbol: siteMarkers[site] || 'circle', opacity: chartType === 'line' ? 0 : 0.9 },
                  hovertemplate: '<b>Site %{fullData.name}</b><br>%{x|%Y-%m-%d %H:%M}<br>Eh 24h mean: %{y:.2f} mV<extra></extra>',
                  showlegend: true
                });
              });
              return traces;
            })()}
            layout={createLayout(depth, depthIndex, invertRollingY)}
            config={{ displayModeBar: true, responsive: true, displaylogo: false }}
            useResizeHandler={true}
            style={{ width: '100%', height: '280px' }}
          />
        </div>
      ))}
    </div>
  );
});

export default RollingSmallMultiples;
