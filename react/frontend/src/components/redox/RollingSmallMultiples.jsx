import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';

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
              const useGL = false;
              const bySite = new Map();
              (data || []).forEach(r => {
                const d = Number(r.depth_cm);
                if (!Number.isFinite(d) || d !== depth) return;
                const site = r.site_code;
                if (!bySite.has(site)) {
                  const siteColor = siteColors[site] || '#666666'; // Default gray for unknown sites
                  bySite.set(site, { 
                    x: [], 
                    y: [], 
                    name: site, 
                    type: useGL ? 'scattergl' : 'scatter', 
                    mode: chartType === 'line' ? 'lines+markers' : 'markers',
                    line: { width: 3, color: siteColor, dash: siteDashes[site] || 'solid' },
                    marker: { color: siteColor, size: 7, symbol: siteMarkers[site] || 'circle' },
                    hovertemplate: '<b>Site %{fullData.name}</b><br>%{x|%Y-%m-%d %H:%M}<br>Eh 24h mean: %{y:.2f} mV<extra></extra>',
                    showlegend: true
                  });
                }
                const s = bySite.get(site);
                const ts = r.measurement_timestamp;
                const eh = (r.processed_eh_roll24h != null ? r.processed_eh_roll24h : (r.processed_eh != null ? r.processed_eh : r.redox_value_mv));
                const ehNum = Number(eh);
                if (ts == null || !Number.isFinite(ehNum)) return;
                s.x.push(ts);
                s.y.push(ehNum);
              });
              return Array.from(bySite.values());
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
