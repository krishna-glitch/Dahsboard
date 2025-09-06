import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';

const ZonesChart = React.memo(function ZonesChart({ data, parameterLabel = 'Depth & Redox' }) {
  const zonesData = useMemo(() => {
    const zoneData = {};
    const zoneColors = {
      'Highly Oxic': '#006400',
      'Oxic': '#32CD32',
      'Suboxic': '#FFA500',
      'Moderately Reducing': '#FF4500',
      'Highly Reducing': '#8B0000'
    };
    (data || []).forEach(d => {
      const redoxVal = (d.processed_eh != null ? d.processed_eh : d.redox_value_mv);
      if (redoxVal != null) {
        let zone = 'Unknown';
        if (redoxVal > 200) zone = 'Highly Oxic';
        else if (redoxVal > 50) zone = 'Oxic';
        else if (redoxVal > -50) zone = 'Suboxic';
        else if (redoxVal > -200) zone = 'Moderately Reducing';
        else zone = 'Highly Reducing';
        if (!zoneData[zone]) {
          zoneData[zone] = { x: [], y: [], name: zone, type: 'scatter', mode: 'markers', marker: { color: zoneColors[zone], size: 6, opacity: 0.8 } };
        }
        zoneData[zone].x.push(d.measurement_timestamp);
        zoneData[zone].y.push(redoxVal);
      }
    });
    return Object.values(zoneData);
  }, [data]);

  const layout = useMemo(() => ({
    height: 450,
    margin: { l: 70, r: 50, t: 30, b: 60 },
    xaxis: { title: { text: `Date — ${parameterLabel}` }, type: 'date', showgrid: true, gridcolor: '#f0f0f0', automargin: true },
    yaxis: { title: { text: 'Redox Potential (mV)' }, showgrid: true, gridcolor: '#f0f0f0', zeroline: true, zerolinecolor: '#666', zerolinewidth: 2, automargin: true },
    showlegend: true,
    legend: { x: 1.02, y: 1, xanchor: 'left' },
    hovermode: 'closest',
    plot_bgcolor: 'rgba(0,0,0,0)',
    paper_bgcolor: 'rgba(0,0,0,0)'
  }), [parameterLabel]);

  return (
    <>
      <Plot
        data={zonesData}
        layout={layout}
        config={{ displayModeBar: true, responsive: true, displaylogo: false, modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'] }}
        style={{ width: '100%', height: '450px' }}
      />
      <div style={{ color: '#6c757d', fontSize: '0.85rem', marginTop: 6 }}>
        Redox zones over time to visualize oxic/suboxic/reducing conditions by threshold.
      </div>
    </>
  );
});

export default ZonesChart;

