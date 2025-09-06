import React, { useMemo } from 'react';
import ProgressivePlot from '../modern/ProgressivePlot';

const SnapshotChart = React.memo(function SnapshotChart({ 
  snapshotSeries, 
  snapshotMode = 'profile', 
  invertX = false, 
  invertY = true, 
  parameterLabel = 'Depth & Redox' 
}) {
  // Get the appropriate data based on mode
  const plotData = Array.isArray(snapshotSeries) ? snapshotSeries : 
    (snapshotMode === 'scatter' ? snapshotSeries.scatter || [] : snapshotSeries.profile || []);
  
  const modeTitle = snapshotMode === 'scatter' ? 
    `${parameterLabel} - Scatter Plot` : 
    `${parameterLabel} - Depth Profile`;

  const layout = useMemo(() => ({
    height: 450,
    title: { text: modeTitle, x: 0.02, y: 0.98, xanchor: 'left', yanchor: 'top', font: { size: 14 } },
    margin: { l: 70, r: 50, t: 30, b: 60 },
    xaxis: { title: { text: 'Eh (mV)' }, autorange: invertX ? 'reversed' : true, showgrid: true, gridcolor: '#f0f0f0', automargin: true },
    yaxis: { title: { text: 'Depth (cm)' }, autorange: invertY ? 'reversed' : true, showgrid: true, gridcolor: '#f0f0f0', automargin: true },
    showlegend: true,
    legend: { x: 0, y: 1.1, orientation: 'h' },
    hovermode: 'closest',
    plot_bgcolor: 'rgba(0,0,0,0)',
    paper_bgcolor: 'rgba(0,0,0,0)'
  }), [modeTitle, invertX, invertY]);

  return (
    <ProgressivePlot
      data={plotData}
      layout={layout}
      config={{ displayModeBar: true, responsive: true, displaylogo: false, modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'] }}
      style={{ width: '100%', height: '450px' }}
      progressiveThreshold={500}
      batchSize={100}
      loadingDelay={80}
      onLoadingStart={() => console.log(`SnapshotChart (${snapshotMode}): Progressive loading started`)}
      onLoadingComplete={(totalPoints) => console.log(`SnapshotChart (${snapshotMode}): Progressive loading complete (${totalPoints} points)`)}
    />
  );
});

export default SnapshotChart;
