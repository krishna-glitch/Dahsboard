// Rolling mean worker: computes 24h sliding mean per site/depth

self.onmessage = (e) => {
  const { cmd, payload } = e.data || {};
  if (cmd !== 'rolling24h') return;
  try {
    const seriesList = Array.isArray(payload?.series) ? payload.series : [];
    const windowMs = Number(payload?.windowMs) || 24 * 60 * 60 * 1000;
    const out = [];

    for (let s = 0; s < seriesList.length; s++) {
      const item = seriesList[s];
      const site = String(item.site || '');
      const ts = Array.isArray(item.timestamps) ? item.timestamps : [];
      const depth = Array.isArray(item.depth) ? item.depth : [];
      const redox = Array.isArray(item.redox) ? item.redox : [];
      const n = Math.min(ts.length, depth.length, redox.length);

      // Group by exact depth value for rolling window
      const byDepth = new Map();
      for (let i = 0; i < n; i++) {
        const t = ts[i];
        const d = depth[i];
        const y = redox[i];
        if (!Number.isFinite(t) || !Number.isFinite(d) || !Number.isFinite(y)) continue;
        let g = byDepth.get(d);
        if (!g) { g = { t: [], y: [] }; byDepth.set(d, g); }
        g.t.push(t);
        g.y.push(y);
      }
      // Sliding window per depth
      for (const [d, g] of byDepth.entries()) {
        const tArr = g.t; const yArr = g.y;
        let i = 0; let sum = 0; let cnt = 0;
        for (let j = 0; j < tArr.length; j++) {
          const tj = tArr[j];
          const yj = yArr[j];
          sum += yj; cnt++;
          while (tj - tArr[i] > windowMs) { sum -= yArr[i]; cnt--; i++; }
          const mean = cnt > 0 ? (sum / cnt) : NaN;
          if (Number.isFinite(mean)) {
            out.push({
              measurement_timestamp: new Date(tj).toISOString(),
              site_code: site,
              depth_cm: d,
              processed_eh_roll24h: mean,
            });
          }
        }
      }
    }

    self.postMessage({ ok: true, data: out });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err?.message || err) });
  }
};

