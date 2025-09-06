// Typed array helpers for building Plotly-ready series efficiently

export const toTyped = (arr, type = 'f32') => {
  if (!Array.isArray(arr)) return arr;
  switch (type) {
    case 'f32': return Float32Array.from(arr.map(Number));
    case 'f64': return Float64Array.from(arr.map(Number));
    case 'i32': return Int32Array.from(arr.map(v => Number(v)|0));
    default: return Float32Array.from(arr.map(Number));
  }
};

export const maybeTyped = (arr, useTyped, type = 'f32') => {
  if (!useTyped) return arr;
  return toTyped(arr, type);
};

// Build per-site series with typed Y arrays; X kept as strings/ISO for Plotly date axis
export const buildPerSiteSeries = (data, { useTyped = false } = {}) => {
  const perSite = new Map();
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const site = r.site_code;
    if (!site || !r.measurement_timestamp) continue;
    let ps = perSite.get(site);
    if (!ps) {
      ps = { x: [], depth: [], redox: [], timestamps: [] };
      perSite.set(site, ps);
    }
    ps.x.push(r.measurement_timestamp);
    // Pre-parse timestamp for snapshot calculations (avoid Date() in render loops)
    ps.timestamps.push(new Date(r.measurement_timestamp).getTime());
    // Normalize numeric values to Numbers; replace non-finite with null for Plotly
    const depthNum = Number(r.depth_cm);
    const ehRaw = (r.processed_eh != null ? r.processed_eh : r.redox_value_mv);
    const ehNum = Number(ehRaw);
    ps.depth.push(Number.isFinite(depthNum) ? depthNum : null);
    ps.redox.push(Number.isFinite(ehNum) ? ehNum : null);
  }
  // Convert to typed arrays if requested (only for numeric y series)
  perSite.forEach((vals) => {
    vals.depth = maybeTyped(vals.depth, useTyped, 'f32');
    vals.redox = maybeTyped(vals.redox, useTyped, 'f32');
    vals.timestamps = maybeTyped(vals.timestamps, useTyped, 'f64');
  });
  return perSite;
};
