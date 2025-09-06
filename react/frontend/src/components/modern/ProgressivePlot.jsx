import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { Spinner, Card } from 'react-bootstrap';

// Lazy load Plot component for code splitting
const Plot = React.lazy(() => import('react-plotly.js'));

/**
 * Progressive loading wrapper for Plotly charts
 * Provides skeleton loading, progressive data rendering, and performance optimization
 */
const ProgressivePlot = ({ 
  data = [], 
  layout = {}, 
  config = {},
  style = {},
  className = "",
  progressiveThreshold = 1000,  // Start progressive loading if data points > 1000
  batchSize = 200,              // Load data in batches of 200 points
  loadingDelay = 100,           // Delay between batches (ms)
  showSkeleton = true,
  onLoadingStart,
  onLoadingComplete,
  ...plotProps 
}) => {
  const [loadingState, setLoadingState] = useState('idle'); // idle, loading, complete
  const [visibleDataIndex, setVisibleDataIndex] = useState(0);
  const [plotReady, setPlotReady] = useState(false);

  // Calculate total data points across all traces
  const totalDataPoints = useMemo(() => {
    return data.reduce((total, trace) => {
      const points = Math.max(
        (trace.x?.length || 0),
        (trace.y?.length || 0),
        (trace.z?.length || 0)
      );
      return total + points;
    }, 0);
  }, [data]);

  // Determine if progressive loading should be used
  const shouldUseProgressive = totalDataPoints > progressiveThreshold;

  // Progressive data loading
  const progressiveData = useMemo(() => {
    if (!shouldUseProgressive || loadingState === 'complete') {
      return data;
    }

    if (loadingState === 'idle') {
      return [];
    }

    // Return partial data based on current loading state
    return data.map(trace => {
      const maxPoints = Math.min(visibleDataIndex, trace.x?.length || 0);
      
      if (maxPoints === 0) return { ...trace, x: [], y: [], z: [] };

      return {
        ...trace,
        x: trace.x?.slice(0, maxPoints) || [],
        y: trace.y?.slice(0, maxPoints) || [],
        z: trace.z?.slice(0, maxPoints) || [],
        ...(trace.text && { text: trace.text.slice(0, maxPoints) }),
        ...(trace.customdata && { customdata: trace.customdata.slice(0, maxPoints) }),
      };
    });
  }, [data, visibleDataIndex, shouldUseProgressive, loadingState]);

  // Progressive loading effect
  useEffect(() => {
    if (!shouldUseProgressive) {
      setLoadingState('complete');
      setPlotReady(true);
      return;
    }

    if (loadingState === 'idle' && data.length > 0) {
      setLoadingState('loading');
      onLoadingStart?.();
      
      // Start with first batch
      setTimeout(() => {
        setVisibleDataIndex(batchSize);
        setPlotReady(true);
      }, 50);
    }
  }, [shouldUseProgressive, loadingState, data.length, batchSize, onLoadingStart]);

  // Continue loading batches
  useEffect(() => {
    if (loadingState !== 'loading' || !shouldUseProgressive) return;

    if (visibleDataIndex >= totalDataPoints) {
      setLoadingState('complete');
      onLoadingComplete?.(totalDataPoints);
      return;
    }

    const timer = setTimeout(() => {
      setVisibleDataIndex(prev => Math.min(prev + batchSize, totalDataPoints));
    }, loadingDelay);

    return () => clearTimeout(timer);
  }, [visibleDataIndex, totalDataPoints, loadingState, batchSize, loadingDelay, shouldUseProgressive, onLoadingComplete]);

  // Enhanced layout with loading indicator
  const enhancedLayout = useMemo(() => {
    const baseLayout = {
      ...layout,
      autosize: true,
      responsive: true,
    };

    // Add loading annotation if still loading
    if (shouldUseProgressive && loadingState === 'loading') {
      const progress = Math.round((visibleDataIndex / totalDataPoints) * 100);
      
      baseLayout.annotations = [
        ...(layout.annotations || []),
        {
          x: 0.98,
          y: 0.02,
          xref: 'paper',
          yref: 'paper',
          text: `Loading... ${progress}%`,
          showarrow: false,
          bgcolor: 'rgba(0,0,0,0.7)',
          font: { color: 'white', size: 12 },
          bordercolor: 'white',
          borderwidth: 1,
        }
      ];
    }

    return baseLayout;
  }, [layout, shouldUseProgressive, loadingState, visibleDataIndex, totalDataPoints]);

  // Enhanced config
  const enhancedConfig = useMemo(() => ({
    displayModeBar: false,
    responsive: true,
    displaylogo: false,
    ...config,
  }), [config]);

  // Skeleton loading component
  const SkeletonLoader = () => (
    <div 
      className={`progressive-plot-skeleton ${className}`}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
        backgroundSize: '200% 100%',
        animation: 'progressivePlotSkeleton 1.5s infinite',
        borderRadius: '8px',
        minHeight: layout.height || style.height || '400px',
        position: 'relative',
      }}
    >
      <div className="d-flex flex-column align-items-center">
        <Spinner animation="border" variant="primary" className="mb-3" />
        <div className="text-muted">
          {shouldUseProgressive && totalDataPoints > progressiveThreshold 
            ? `Loading chart (${totalDataPoints.toLocaleString()} data points)...`
            : 'Loading chart...'
          }
        </div>
      </div>
      
      <style>{`
        @keyframes progressivePlotSkeleton {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );

  // Error boundary for plot loading
  const PlotWithErrorBoundary = () => {
    try {
      return (
        <Plot
          data={progressiveData}
          layout={enhancedLayout}
          config={enhancedConfig}
          style={{ width: '100%', ...style }}
          className={className}
          useResizeHandler={true}
          {...plotProps}
        />
      );
    } catch (error) {
      console.error('ProgressivePlot render error:', error);
      return (
        <Card className="text-center p-4" style={style}>
          <Card.Body>
            <i className="bi bi-exclamation-triangle text-warning mb-2" style={{ fontSize: '2rem' }}></i>
            <h5>Chart Loading Error</h5>
            <p className="text-muted">Unable to render chart. Please try refreshing the page.</p>
          </Card.Body>
        </Card>
      );
    }
  };

  if (!plotReady && showSkeleton) {
    return <SkeletonLoader />;
  }

  return (
    <Suspense fallback={<SkeletonLoader />}>
      <PlotWithErrorBoundary />
    </Suspense>
  );
};

export default ProgressivePlot;