import React, { useEffect, useMemo, useRef, useState } from 'react';

// Lightweight, defensive dynamic import of deck.gl
async function loadDeck() {
  try {
    const core = await import('@deck.gl/core');
    const layers = await import('@deck.gl/layers');
    return { core, layers };
  } catch (e) {
    return null;
  }
}

// For 800k+ points, deck.gl isn't the right approach for time series
// Let's force fallback to WebGL-accelerated Plotly which handles time series better
const FORCE_FALLBACK_FOR_TIMESERIES = true;

function toTimeMs(ts) {
  if (!ts) return NaN;
  const d = new Date(ts);
  const t = d.getTime();
  return Number.isFinite(t) ? t : NaN;
}

function buildAttributes(rows, colorBySite, siteColors) {
  console.log('DeckRedoxScatter: buildAttributes called with', rows.length, 'rows');
  const n = rows.length;
  const positions = new Float32Array(n * 3);
  const colors = new Uint8Array(n * 4);
  let count = 0;
  let validCount = 0;
  let invalidCount = 0;
  
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    const tx = toTimeMs(r.measurement_timestamp);
    const depth = Number(r.depth_cm);
    
    if (!Number.isFinite(tx) || !Number.isFinite(depth)) {
      invalidCount++;
      continue;
    }
    
    validCount++;
    positions[count * 3 + 0] = tx;
    positions[count * 3 + 1] = depth;
    positions[count * 3 + 2] = 0;
    const color = colorBySite && r.site_code && siteColors[r.site_code]
      ? siteColors[r.site_code]
      : '#3388ff';
    const hex = typeof color === 'string' ? color : '#3388ff';
    const r8 = parseInt(hex.slice(1, 3), 16) || 51;
    const g8 = parseInt(hex.slice(3, 5), 16) || 136;
    const b8 = parseInt(hex.slice(5, 7), 16) || 255;
    colors[count * 4 + 0] = r8;
    colors[count * 4 + 1] = g8;
    colors[count * 4 + 2] = b8;
    colors[count * 4 + 3] = 200;
    count++;
  }
  
  console.log('DeckRedoxScatter: buildAttributes result', {
    inputRows: n,
    validCount,
    invalidCount,
    finalCount: count,
    samplePositions: count > 0 ? [positions[0], positions[1], positions[2]] : [],
    sampleColors: count > 0 ? [colors[0], colors[1], colors[2], colors[3]] : []
  });
  
  return {
    positions: count === n ? positions : positions.subarray(0, count * 3),
    colors: count === n ? colors : colors.subarray(0, count * 4),
    count,
  };
}

const DeckRedoxScatter = ({
  data = [],
  siteColors = {},
  style = {},
  fallback = null,
}) => {
  const [deckMod, setDeckMod] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const containerRef = useRef(null);
  const deckRef = useRef(null);

  const attrs = useMemo(() => buildAttributes(data, true, siteColors), [data, siteColors]);

  useEffect(() => {
    let alive = true;
    console.log('DeckRedoxScatter: Starting deck.gl module load');
    loadDeck().then((mod) => {
      if (!alive) return;
      if (mod) {
        console.log('DeckRedoxScatter: deck.gl module loaded successfully', mod);
        setDeckMod(mod);
        setLoadError(false);
      } else {
        console.log('DeckRedoxScatter: deck.gl module load returned null');
        setLoadError(true);
      }
    }).catch(err => {
      console.warn('DeckRedoxScatter: Failed to load deck.gl:', err);
      if (alive) {
        setLoadError(true);
      }
    });
    return () => {
      alive = false;
      if (deckRef.current) {
        try { deckRef.current.finalize(); } catch {}
        deckRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    console.log('DeckRedoxScatter: Deck creation effect triggered', {
      deckMod: !!deckMod,
      containerRef: !!containerRef.current,
      dataLength: data.length,
      attrsCount: attrs.count
    });
    
    if (!deckMod || !containerRef.current || !data.length) {
      console.log('DeckRedoxScatter: Skipping deck creation - missing requirements');
      return;
    }
    
    try {
      console.log('DeckRedoxScatter: Starting deck creation process');
      const { core, layers } = deckMod;
      const ScatterplotLayer = layers.ScatterplotLayer;
      const DeckGL = core.Deck;
      const OrthographicView = core.OrthographicView;

      console.log('DeckRedoxScatter: Creating layer with', attrs.count, 'data points');
      const layer = new ScatterplotLayer({
        id: 'redox-timeseries-scatter',
        data: { length: attrs.count },
        getPosition: (_, { index }) => [attrs.positions[index * 3], attrs.positions[index * 3 + 1], 0],
        getFillColor: (_, { index }) => [attrs.colors[index * 4], attrs.colors[index * 4 + 1], attrs.colors[index * 4 + 2], attrs.colors[index * 4 + 3]],
        radiusPixels: 6, // Increased from 3 to 6 for visibility
        pickable: true,
        updateTriggers: {
          getPosition: attrs.positions,
          getFillColor: attrs.colors,
        },
      });

      // Calculate bounds from processed positions for better performance
      const timestamps = [];
      const depths = [];
      for (let i = 0; i < attrs.count; i++) {
        timestamps.push(attrs.positions[i * 3]);
        depths.push(attrs.positions[i * 3 + 1]);
      }
      
      const xMin = Math.min(...timestamps);
      const xMax = Math.max(...timestamps);
      const yMin = Math.min(...depths);
      const yMax = Math.max(...depths);
      
      console.log('DeckRedoxScatter: Calculated bounds', { xMin, xMax, yMin, yMax });

      // Fix viewport scaling - timestamps are in milliseconds, depths in cm
      const xRange = xMax - xMin;
      const yRange = yMax - yMin;
      const containerWidth = containerRef.current.offsetWidth || 800;
      const containerHeight = containerRef.current.offsetHeight || 480;
      
      // Calculate zoom to fit data properly
      const xScale = containerWidth / xRange;
      const yScale = containerHeight / yRange;
      const minScale = Math.min(xScale, yScale);
      const initialZoom = Math.log2(minScale) - 1; // Add some padding
      
      console.log('DeckRedoxScatter: Viewport calculation', {
        xRange,
        yRange, 
        containerWidth,
        containerHeight,
        xScale,
        yScale,
        minScale,
        initialZoom
      });

      console.log('DeckRedoxScatter: Creating DeckGL instance');
      const deck = new DeckGL({
        parent: containerRef.current,
        views: [new OrthographicView({ 
          id: 'main',
          controller: true
        })],
        initialViewState: {
          target: [(xMin + xMax) / 2, (yMin + yMax) / 2, 0],
          zoom: initialZoom,
          minZoom: initialZoom - 5,
          maxZoom: initialZoom + 5
        },
        controller: { 
          scrollZoom: true, 
          doubleClickZoom: true,
          dragPan: true
        },
        layers: [layer],
        parameters: {
          depthTest: false,
          clearColor: [1, 1, 1, 1]
        },
        onError: (error) => {
          console.error('DeckGL render error:', error);
          setLoadError(true);
        },
        onLoad: () => {
          console.log('DeckRedoxScatter: DeckGL onLoad callback fired');
        },
        onAfterRender: () => {
          console.log('DeckRedoxScatter: DeckGL onAfterRender callback fired');
        }
      });
      
      deckRef.current = deck;
      console.log('DeckRedoxScatter: Successfully created deck with', attrs.count, 'points');
      console.log('DeckRedoxScatter: Container element:', containerRef.current);
      
      return () => {
        console.log('DeckRedoxScatter: Cleaning up deck');
        try { 
          deck.finalize(); 
        } catch (e) {
          console.warn('Error finalizing deck:', e);
        }
        deckRef.current = null;
      };
    } catch (error) {
      console.error('DeckRedoxScatter: Error creating deck.gl visualization:', error);
      setLoadError(true);
    }
  }, [deckMod, attrs, data.length]);

  // For time series data, deck.gl isn't optimal - use WebGL-accelerated Plotly instead
  if (FORCE_FALLBACK_FOR_TIMESERIES || deckMod === null || loadError) {
    console.log('DeckRedoxScatter: Using WebGL-accelerated Plotly fallback for time series data', { 
      forceFallback: FORCE_FALLBACK_FOR_TIMESERIES,
      deckMod: !!deckMod, 
      loadError,
      dataPoints: data.length 
    });
    return fallback || (
      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
        <p>Loading high-performance WebGL visualization...</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '480px', position: 'relative', ...style }} />
  );
};

export default React.memo(DeckRedoxScatter);
