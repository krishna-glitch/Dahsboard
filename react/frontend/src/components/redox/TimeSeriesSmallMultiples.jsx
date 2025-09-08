import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';


// Add keyframes for 3D animations
const chartAnimationStyles = `
  @keyframes chartSlideIn {
    0% {
      opacity: 0;
      transform: translateY(20px) scale(0.95);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
`;

// Inject styles into head if not already present
if (typeof document !== 'undefined' && !document.getElementById('chart-3d-animations')) {
  const styleElement = document.createElement('style');
  styleElement.id = 'chart-3d-animations';
  styleElement.textContent = chartAnimationStyles;
  document.head.appendChild(styleElement);
}

const TimeSeriesSmallMultiples = React.memo(function TimeSeriesSmallMultiples({ data, chartData, chartType = 'line', invertSeriesY = false, maxDepthsToShow = 6 }) {
  console.log(`TimeSeriesSmallMultiples: Rendering ${data?.length || 0} data points, WebGL: ${(data?.length || 0) > 10000}`);
  const useGL = (data?.length || 0) > 10000;
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
    if (chartData && chartData.depths) {
      return chartData.depths.slice(0, maxDepthsToShow);
    }
    // Coerce to numeric depths and filter out non-finite values
    const ds = Array.from(new Set((data || [])
      .map(r => Number(r.depth_cm))
      .filter(v => Number.isFinite(v))))
      .sort((a, b) => a - b);
    return ds.slice(0, maxDepthsToShow);
  }, [data, chartData, maxDepthsToShow]);

  // Memoized layout factory function 
  const createLayout = useMemo(() => (depthIndex, invertSeriesY) => ({
    autosize: true,
    height: 280,
    margin: { l: 60, r: 20, t: 15, b: 40 }, // Reduced top margin since we have custom header
    title: null, // Remove duplicate title since we have custom header
    xaxis: { title: { text: 'Date' }, type: 'date', automargin: true },
    yaxis: { title: { text: 'Eh (mV)' }, automargin: true, autorange: invertSeriesY ? 'reversed' : true },
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

  // Use consistent solid lines and markers - distinguish only by color
  const siteDashes = {
    'S1': 'solid',
    'S2': 'solid',
    'S3': 'solid',
    'S4': 'solid',
    'S5': 'solid',
    'S6': 'solid'
  };
  const siteMarkers = {
    'S1': 'circle',
    'S2': 'circle',
    'S3': 'circle', 
    'S4': 'circle',
    'S5': 'circle',
    'S6': 'circle'
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '32px', // Increased for more dramatic spacing
      padding: '24px 8px', // Added horizontal padding to prevent shadow clipping
      background: 'linear-gradient(180deg, #f8f9fa 0%, #ffffff 100%)',
      borderRadius: '12px',
      position: 'relative'
    }}>
      {depthsToShow.map((depth, depthIndex) => (
        <div 
          key={`ts-${depth}`} 
          className="subchart" 
          style={{ 
            width: '100%',
            background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 50%, #f1f3f4 100%)',
            border: '1px solid #e8eaed',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: depthIndex < depthsToShow.length - 1 ? '16px' : '0',
            boxShadow: `
              0 8px 32px rgba(0, 0, 0, 0.12),
              0 4px 16px rgba(0, 0, 0, 0.08),
              0 2px 8px rgba(0, 0, 0, 0.04),
              inset 0 1px 0 rgba(255, 255, 255, 0.6),
              inset 0 -1px 0 rgba(0, 0, 0, 0.02)
            `,
            transform: 'translateY(0)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = `
              0 16px 48px rgba(0, 0, 0, 0.15),
              0 8px 24px rgba(0, 0, 0, 0.1),
              0 4px 12px rgba(0, 0, 0, 0.06),
              inset 0 1px 0 rgba(255, 255, 255, 0.7),
              inset 0 -1px 0 rgba(0, 0, 0, 0.03)
            `;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = `
              0 8px 32px rgba(0, 0, 0, 0.12),
              0 4px 16px rgba(0, 0, 0, 0.08),
              0 2px 8px rgba(0, 0, 0, 0.04),
              inset 0 1px 0 rgba(255, 255, 255, 0.6),
              inset 0 -1px 0 rgba(0, 0, 0, 0.02)
            `;
          }}
        >
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#1a1a1a',
            marginBottom: '16px',
            paddingBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            background: 'linear-gradient(90deg, transparent 0%, rgba(52, 152, 219, 0.05) 50%, transparent 100%)',
            marginLeft: '-8px',
            marginRight: '-8px',
            paddingLeft: '8px',
            paddingRight: '8px',
            borderRadius: '8px 8px 0 0'
          }}>
            <span style={{ 
              background: 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)', 
              color: 'white', 
              padding: '6px 16px', 
              borderRadius: '25px', 
              fontSize: '12px',
              fontWeight: '600',
              marginRight: '12px',
              boxShadow: `
                0 4px 12px rgba(52, 152, 219, 0.3),
                0 2px 6px rgba(52, 152, 219, 0.2),
                inset 0 1px 0 rgba(255, 255, 255, 0.2)
              `,
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
              letterSpacing: '0.5px'
            }}>
              Depth
            </span>
            <span style={{ fontSize: '16px', fontWeight: '600' }}>
              {depth} cm
            </span>
          </div>
          <Plot
            data={(() => {
              // Small multiples should always process raw data by depth
              // Skip pre-processed chartData.timeseries (which has mixed depth/redox traces)
              // and process raw data to show only Eh vs Time for this specific depth
              const bySite = new Map();
              const dataStats = new Map(); // For debugging identical values
              
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
                    mode: chartType === 'line' ? (useGL ? 'markers' : 'lines+markers') : 'markers',
                    line: useGL ? undefined : { width: 2, color: siteColor, dash: siteDashes[site] || 'solid' },
                    marker: { 
                      color: siteColor, 
                      size: useGL ? 3 : 6,
                      symbol: siteMarkers[site] || 'circle',
                      opacity: useGL ? 0.6 : 1 // Lower opacity for dense data
                    },
                    hovertemplate: useGL ? undefined : '<b>Site %{fullData.name}</b><br>%{x|%Y-%m-%d %H:%M}<br>Eh: %{y:.2f} mV<extra></extra>', // Disable hover for WebGL performance
                    showlegend: true
                  });
                  dataStats.set(site, { count: 0, timestamps: new Set(), ehValues: new Set() });
                }
                const s = bySite.get(site);
                const stats = dataStats.get(site);
                const ts = r.measurement_timestamp;
                const eh = (r.processed_eh != null ? r.processed_eh : r.redox_value_mv);
                const ehNum = Number(eh);
                if (ts == null || !Number.isFinite(ehNum)) return;
                s.x.push(ts);
                s.y.push(ehNum);
                
                // Track unique values for debugging
                stats.count++;
                stats.timestamps.add(ts);
                stats.ehValues.add(ehNum);
              });
              
              // Identical data debug logs removed for cleaner console
              
              return Array.from(bySite.values());
            })()}
            layout={createLayout(depthIndex, invertSeriesY)}
            config={{ 
              displayModeBar: !useGL, // Disable mode bar for WebGL performance
              responsive: true, 
              displaylogo: false,
              scrollZoom: true,
              // Performance optimizations for large datasets
              plotGlPixelRatio: 1,
              toImageButtonOptions: useGL ? undefined : {
                format: 'png',
                filename: `redox_${depth}cm_depth`,
                height: 280,
                width: 800,
                scale: 1
              }
            }}
            useResizeHandler={!useGL} // Disable resize handler for WebGL performance
            style={{ width: '100%', height: '280px' }}
          />
        </div>
      ))}
    </div>
  );
});

export default TimeSeriesSmallMultiples;
