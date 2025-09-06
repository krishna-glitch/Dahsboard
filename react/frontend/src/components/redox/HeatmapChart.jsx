import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';

const HeatmapChart = React.memo(function HeatmapChart({ data }) {
  const heatmap = useMemo(() => {
    if (!data || data.length === 0) return [];
    const parseDate = (ts) => new Date(ts);
    const toDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0,10);
    const toDepthBin = (v) => v == null ? null : Math.round(v/10)*10;
    const grid = new Map();
    const daysSet = new Set();
    const depthsSet = new Set();
    data.forEach(d => {
      const v = (d.processed_eh != null ? d.processed_eh : d.redox_value_mv);
      if (v != null && d.depth_cm != null && d.measurement_timestamp) {
        const day = toDay(parseDate(d.measurement_timestamp));
        const depth = toDepthBin(d.depth_cm);
        const key = `${day}|${depth}`;
        daysSet.add(day);
        depthsSet.add(depth);
        const cur = grid.get(key) || { sum: 0, count: 0 };
        cur.sum += v;
        cur.count += 1;
        grid.set(key, cur);
      }
    });
    const days = Array.from(daysSet).sort();
    const depths = Array.from(depthsSet).sort((a,b)=>a-b);
    const z = depths.map(depth => days.map(day => {
      const cell = grid.get(`${day}|${depth}`);
      return cell ? cell.sum / cell.count : null;
    }));
    return [{ type: 'heatmap', x: days, y: depths, z, colorscale: 'RdBu', reversescale: true, colorbar: { title: 'mV' } }];
  }, [data]);

  const layout = useMemo(() => ({
    height: 450,
    margin: { l: 70, r: 50, t: 30, b: 60 },
    xaxis: { title: { text: 'Date — Redox Potential (mV)' }, type: 'category', tickangle: -45, automargin: true },
    yaxis: { title: { text: 'Depth (cm)' }, autorange: 'reversed', automargin: true },
    hovermode: 'closest',
    plot_bgcolor: 'rgba(0,0,0,0)',
    paper_bgcolor: 'rgba(0,0,0,0)'
  }), []);

  return (
    <>
      <Plot
        data={heatmap}
        layout={layout}
        config={{ displayModeBar: true, responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'] }}
        style={{ width: '100%', height: '450px' }}
      />
      <div style={{ color: '#6c757d', fontSize: '0.85rem', marginTop: 6 }}>
        Daily heatmap of average Eh (mV) across depth bins to reveal patterns and gaps.
      </div>
    </>
  );
});

export default HeatmapChart;

