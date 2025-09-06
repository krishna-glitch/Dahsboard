// Cached dynamic import and helpers for Apache Arrow parsing
let __arrowModulePromise = null;

export async function loadArrowModule() {
  if (!__arrowModulePromise) {
    __arrowModulePromise = import('apache-arrow').catch(() => import('@apache-arrow/esnext-esm'));
  }
  return __arrowModulePromise;
}

// Parse IPC buffer to rows with fallback site labeling
export async function parseArrowBufferToRows(buffer, fallbackSite) {
  if (!buffer) return null;
  const mod = await loadArrowModule().catch((e) => {
    console.warn('[ARROW] Module load failed', e);
    return null;
  });
  if (!mod) return null;
  const table = mod.tableFromIPC(buffer);
  const n = table.numRows;
  const rows = new Array(n);
  const nameToVector = new Map();
  const fields = table?.schema?.fields || [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const vec = table.getChildAt ? table.getChildAt(i) : (table.getColumnAt ? table.getColumnAt(i) : null);
    if (f?.name && vec) nameToVector.set(String(f.name), vec);
  }
  const colTs = nameToVector.get('measurement_timestamp') || nameToVector.get('timestamp') || null;
  const colEh = nameToVector.get('processed_eh') || nameToVector.get('redox_value_mv') || null;
  const colDepth = nameToVector.get('depth_cm') || null;
  const colSite = nameToVector.get('site_code') || null;
  const tsUnit = (colTs && colTs.type && (colTs.type.unit || colTs.type)) || null;
  const ehArr = colEh && colEh.toArray ? colEh.toArray() : null;
  const dArr = colDepth && colDepth.toArray ? colDepth.toArray() : null;
  const sArr = colSite && colSite.toArray ? colSite.toArray() : null;
  const toIso = (v) => {
    if (v == null) return undefined;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'number') return new Date(v).toISOString();
    if (typeof v === 'bigint') {
      const num = Number(v);
      let ms = num;
      const unitStr = String(tsUnit || '').toLowerCase();
      if (unitStr.includes('nano')) ms = num / 1e6;
      else if (unitStr.includes('micro')) ms = num / 1e3;
      else if (unitStr.includes('second') && !unitStr.includes('milli')) ms = num * 1000;
      else if (!unitStr) {
        if (num > 1e15) ms = num / 1e6;
        else if (num > 1e12) ms = num / 1e3;
      }
      return new Date(ms).toISOString();
    }
    if (typeof v === 'string') return v;
    try { return new Date(v).toISOString(); } catch (_) { return undefined; }
  };
  for (let i = 0; i < n; i++) {
    const tsVal = colTs ? colTs.get(i) : undefined;
    const ts = toIso(tsVal);
    const eh = ehArr ? ehArr[i] : (colEh ? colEh.get(i) : undefined);
    const depth = dArr ? dArr[i] : (colDepth ? colDepth.get(i) : undefined);
    const site = sArr ? (sArr[i] || fallbackSite) : fallbackSite;
    rows[i] = { measurement_timestamp: ts, processed_eh: eh, depth_cm: depth, site_code: site };
  }
  return rows;
}

export function isRequestCancelled(err) {
  if (!err) return false;
  const msg = typeof err?.message === 'string' ? err.message.toLowerCase() : '';
  return err.type === 'CANCELLED' || err.name === 'RequestCancelled' || err.code === 'ERR_CANCELED' || msg.includes('cancel') || msg.includes('aborted');
}

