import React, { useMemo } from 'react';
import Plot from '../../components/PlotlyLite';


const TimeSeriesBySite = React.memo(function TimeSeriesBySite({ 
  data, 
  chartType = 'line', 
  invertSeriesY = false, 
  selectedSites = [], 
  siteColors = {}
}) {
  console.log(`TimeSeriesBySite: Rendering ${data?.length || 0} data points, WebGL: ${(data?.length || 0) > 10000}`);
  // Depth color palette - different colors for each depth
  const depthColors = {
    '10': '#1f77b4',   // Blue
    '20': '#ff7f0e',   // Orange
    '30': '#2ca02c',   // Green
    '40': '#d62728',   // Red
    '50': '#9467bd',   // Purple
    '60': '#8c564b',   // Brown
    '70': '#17becf',   // Cyan
    '80': '#bcbd22',   // Olive
    '90': '#e377c2',   // Pink
    '100': '#7f7f7f'   // Gray
  };

  // Group data by site and organize by depth within each site
  const siteDepthData = useMemo(() => {
    const result = new Map();
    
    (data || []).forEach(r => {
      const site = r.site_code;
      const depth = Number(r.depth_cm);
      const eh = Number(r.processed_eh != null ? r.processed_eh : r.redox_value_mv);
      const ts = r.measurement_timestamp;
      
      if (!site || !Number.isFinite(depth) || !Number.isFinite(eh) || !ts) return;
      
      if (!result.has(site)) {
        result.set(site, new Map());
      }
      
      const siteData = result.get(site);
      if (!siteData.has(depth)) {
        siteData.set(depth, { x: [], y: [], depth });
      }
      
      const depthData = siteData.get(depth);
      depthData.x.push(ts);
      depthData.y.push(eh);
    });
    
    return result;
  }, [data]);

  // Memoized layout factory function 
  const createLayout = useMemo(() => (siteIndex, invertSeriesY) => ({
    autosize: true,
    height: 320,
    margin: { l: 60, r: 20, t: 15, b: 40 }, // Reduced top margin since we have custom header
    title: null, // Remove duplicate title since we have custom header
    xaxis: { 
      title: { text: 'Date' }, 
      type: 'date', 
      automargin: true 
    },
    yaxis: { 
      title: { text: 'Eh (mV)' }, 
      automargin: true, 
      autorange: invertSeriesY ? 'reversed' : true 
    },
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

  const sitesToShow = useMemo(() => {
    // Filter to only show selected sites, or all sites if none selected
    const sites = Array.from(siteDepthData.keys());
    if (selectedSites.length > 0) {
      return sites.filter(site => selectedSites.includes(site));
    }
    return sites.sort();
  }, [siteDepthData, selectedSites]);

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
      {sitesToShow.map((site, siteIndex) => {
        const siteData = siteDepthData.get(site);
        if (!siteData || siteData.size === 0) return null;

        const useGL = data.length > 10000; // Define useGL at component level for this site

        return (
          <div 
            key={`site-${site}`} 
            className="subchart" 
            style={{ 
              width: '100%',
              background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 50%, #f1f3f4 100%)',
              border: '1px solid #e8eaed',
              borderRadius: '16px',
              padding: '24px',
              marginBottom: siteIndex < sitesToShow.length - 1 ? '16px' : '0',
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
              background: `linear-gradient(90deg, transparent 0%, ${siteColors[site] || '#e74c3c'}10 50%, transparent 100%)`,
              marginLeft: '-8px',
              marginRight: '-8px',
              paddingLeft: '8px',
              paddingRight: '8px',
              borderRadius: '8px 8px 0 0'
            }}>
              <span style={{ 
                background: `linear-gradient(135deg, ${siteColors[site] || '#e74c3c'} 0%, ${siteColors[site] ? siteColors[site] + 'dd' : '#c0392b'} 100%)`, 
                color: 'white', 
                padding: '6px 16px', 
                borderRadius: '25px', 
                fontSize: '12px',
                fontWeight: '600',
                marginRight: '12px',
                boxShadow: `
                  0 4px 12px ${siteColors[site] || '#e74c3c'}50,
                  0 2px 6px ${siteColors[site] || '#e74c3c'}30,
                  inset 0 1px 0 rgba(255, 255, 255, 0.2)
                `,
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
                letterSpacing: '0.5px'
              }}>
                Site
              </span>
              <span style={{ fontSize: '16px', fontWeight: '600' }}>
                {site}
              </span>
            </div>
            <Plot
              data={(() => {
                const traces = [];
                
                // Sort depths for consistent ordering
                const depths = Array.from(siteData.keys()).sort((a, b) => a - b);
                
                depths.forEach(depth => {
                  const depthData = siteData.get(depth);
                  if (!depthData || depthData.x.length === 0) return;
                  
                  // Get color for this depth
                  const depthColorKey = String(Math.round(depth / 10) * 10); // Round to nearest 10
                  const depthColor = depthColors[depthColorKey] || depthColors['100'] || '#666666';
                  
                  traces.push({
                    x: depthData.x,
                    y: depthData.y,
                    name: `${depth}cm`,
                    type: useGL ? 'scattergl' : 'scatter',
                    mode: chartType === 'line' ? (useGL ? 'markers' : 'lines+markers') : 'markers',
                    line: useGL ? undefined : { 
                      width: 2, 
                      color: depthColor
                    },
                    marker: { 
                      color: depthColor, 
                      size: useGL ? 3 : (chartType === 'scatter' ? 8 : 6),
                      opacity: useGL ? 0.6 : 1,
                      symbol: 'circle'
                    },
                    hovertemplate: `<b>${site} - %{fullData.name}</b><br>%{x|%Y-%m-%d %H:%M}<br>Eh: %{y:.2f} mV<extra></extra>`,
                    showlegend: true
                  });
                });
                
                return traces;
              })()}
              layout={createLayout(siteIndex, invertSeriesY)}
              config={{ 
                displayModeBar: !useGL, // Disable mode bar for WebGL performance
                responsive: true, 
                displaylogo: false,
                scrollZoom: true,
                // Performance optimizations for large datasets
                plotGlPixelRatio: 1,
                modeBarButtonsToRemove: useGL ? undefined : ['pan2d', 'lasso2d', 'select2d'],
                toImageButtonOptions: useGL ? undefined : {
                  format: 'png',
                  filename: `redox_site_${site}`,
                  height: 320,
                  width: 800,
                  scale: 1
                }
              }}
              useResizeHandler={!useGL} // Disable resize handler for WebGL performance
              style={{ width: '100%', height: '320px' }}
            />
          </div>
        );
      })}
    </div>
  );
});

export default TimeSeriesBySite;
