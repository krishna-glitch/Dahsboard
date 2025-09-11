import React, { Suspense } from 'react';

// Pre-declare importers so Vite can include them in the build
const importers = {
  basic: () => import('plotly.js-basic-dist-min'),
  gl2d: () => import('plotly.js-gl2d-dist-min'),
  full: () => import('plotly.js-dist-min'),
};

// Fallback component for when Plotly fails to load
const PlotlyFallback = ({ kind, error }) => {
  return React.createElement('div', { 
    style: { padding: '20px', textAlign: 'center', color: '#666' } 
  }, error ? `Chart loading error (${kind}): ${error}` : `Chart loading failed (${kind} bundle)`);
};

async function makePlotComponent(kind) {
  try {
    const [{ default: factory }, plotlyMod] = await Promise.all([
      import('react-plotly.js/factory'),
      (importers[kind] || importers.full)(),
    ]);
    const Plotly = plotlyMod?.default || plotlyMod;
    if (!Plotly) {
      console.error('Failed to load Plotly bundle:', kind);
      // Return a proper module with default export
      return { default: (props) => React.createElement(PlotlyFallback, { kind, ...props }) };
    }
    const PlotComponent = factory(Plotly);
    if (!PlotComponent) {
      console.error('Factory failed to create component for:', kind);
      return { default: (props) => React.createElement(PlotlyFallback, { kind, error: 'Component creation failed', ...props }) };
    }
    return { default: PlotComponent };
  } catch (error) {
    console.error('Error creating plot component:', kind, error);
    // Return a proper module with default export
    return { default: (props) => React.createElement(PlotlyFallback, { kind, error: error.message, ...props }) };
  }
}

const PlotBasic = React.lazy(() => makePlotComponent('basic').then(module => ({ default: module.default })));
const PlotGL2D = React.lazy(() => makePlotComponent('gl2d').then(module => ({ default: module.default })));
const PlotFull = React.lazy(() => makePlotComponent('full').then(module => ({ default: module.default })));

function needsFullBundle(data) {
  try {
    const traces = Array.isArray(data) ? data : [];
    for (const t of traces) {
      const type = String(t?.type || '').toLowerCase();
      if (['scattergl','heatmap','contour','surface','histogram2d','histogram2dcontour','parcoords','parcats','splom','ohlc','candlestick'].includes(type)) {
        return true;
      }
    }
  } catch {}
  return false;
}

function needsGl2dBundle(data) {
  try {
    const traces = Array.isArray(data) ? data : [];
    let hasGL = false;
    let hasComplex = false;
    for (const t of traces) {
      const type = String(t?.type || '').toLowerCase();
      if (type === 'scattergl') hasGL = true;
      if (['heatmap','contour','surface','histogram2d','histogram2dcontour','parcoords','parcats','splom','ohlc','candlestick'].includes(type)) hasComplex = true;
    }
    return hasGL && !hasComplex;
  } catch {}
  return false;
}

export default function PlotlyLite({ bundle = 'auto', fallback = null, data, ...props }) {
  let effective = 'basic';
  if (bundle === 'auto') {
    if (needsFullBundle(data)) {
      effective = needsGl2dBundle(data) ? 'gl2d' : 'full';
    } else {
      effective = 'basic';
    }
  } else {
    effective = bundle;
  }
  const C = effective === 'full' ? PlotFull : (effective === 'gl2d' ? PlotGL2D : PlotBasic);
  return (
    <Suspense fallback={fallback || <div className="text-muted small">Loading chart…</div>}>
      <C data={data} {...props} />
    </Suspense>
  );
}
