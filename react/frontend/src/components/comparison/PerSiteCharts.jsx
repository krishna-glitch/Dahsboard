import React from 'react';
import Plot from '../PlotlyLite';

// Memoized component following performance cheat sheet
const PerSiteCharts = React.memo(function PerSiteCharts({ 
  perSiteData, 
  selectedMetricInfo,
  thresholdShapes = [],
  loading = false,
  error = null
}) {
  if (loading) {
    return (
      <div style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="text-muted">Loading charts per site…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert-message alert-error">
        <div className="alert-content">
          <i className="bi bi-exclamation-triangle"></i>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!perSiteData.length) {
    return (
      <div style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="text-muted">No data available for charts per site</span>
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '24px',
      padding: '16px 0'
    }}>
      {perSiteData.map(({ siteName, data }, siteIndex) => (
        <div 
          key={siteName}
          style={{ 
            width: '100%',
            background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 50%, #f1f3f4 100%)',
            border: '1px solid #e8eaed',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: siteIndex < perSiteData.length - 1 ? '8px' : '0',
            boxShadow: `
              0 4px 12px rgba(0, 0, 0, 0.08),
              0 2px 6px rgba(0, 0, 0, 0.04),
              inset 0 1px 0 rgba(255, 255, 255, 0.6)
            `,
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = `
              0 6px 20px rgba(0, 0, 0, 0.12),
              0 3px 10px rgba(0, 0, 0, 0.06),
              inset 0 1px 0 rgba(255, 255, 255, 0.7)
            `;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = `
              0 4px 12px rgba(0, 0, 0, 0.08),
              0 2px 6px rgba(0, 0, 0, 0.04),
              inset 0 1px 0 rgba(255, 255, 255, 0.6)
            `;
          }}
        >
          {/* Site Header */}
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#1a1a1a',
            marginBottom: '12px',
            borderBottom: '2px solid #007bff',
            paddingBottom: '8px',
            display: 'flex',
            alignItems: 'center'
          }}>
            <span style={{ 
              background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)', 
              color: 'white', 
              padding: '4px 12px', 
              borderRadius: '20px', 
              fontSize: '12px',
              fontWeight: '600',
              marginRight: '12px',
              boxShadow: '0 2px 6px rgba(0, 123, 255, 0.3)'
            }}>
              Site
            </span>
            <span style={{ fontSize: '16px', fontWeight: '600' }}>
              {siteName}
            </span>
          </div>

          {/* Chart */}
          <Plot
            data={data}
            layout={{
              autosize: true,
              height: 280,
              margin: { l: 60, r: 20, t: 10, b: 40 },
              title: null,
              xaxis: { 
                title: { text: 'Time' }, 
                type: 'date', 
                zeroline: false, 
                gridcolor: '#f1f3f5',
                automargin: true
              },
              yaxis: { 
                title: { text: selectedMetricInfo?.unit || 'Value' }, 
                zeroline: false, 
                gridcolor: '#f1f3f5',
                automargin: true
              },
              showlegend: false, // Single trace per chart
              hovermode: 'closest',
              plot_bgcolor: 'rgba(0,0,0,0)',
              paper_bgcolor: 'rgba(0,0,0,0)',
              shapes: thresholdShapes
            }}
            config={{ 
              displayModeBar: true, 
              responsive: true, 
              displaylogo: false,
              modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d']
            }}
            useResizeHandler={true}
            style={{ width: '100%', height: '280px' }}
          />
        </div>
      ))}
    </div>
  );
});

export default PerSiteCharts;
