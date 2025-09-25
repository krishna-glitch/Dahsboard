// Normalization helpers to produce canonical request keys across the app

const RANGE_TO_RESOLUTION = {
  '1d': '15min',
  '7d': '15min',
  '30d': '30min',
  '90d': '2h',
  '180d': '6h',
  '365d': '2h',
};

export function normalizeSites(sites) {
  if (!Array.isArray(sites)) return '';
  return Array.from(new Set(sites.map(s => String(s || '').toUpperCase()))).sort().join(',');
}

export function normalizeRange(timeRange) {
  if (!timeRange) return '90d';
  const v = String(timeRange).toLowerCase();
  const map = {
    'last 24 hours': '1d', '1d': '1d', '24h': '1d',
    'last 7 days': '7d', '7d': '7d',
    'last 30 days': '30d', '30d': '30d',
    'last 90 days': '90d', '90d': '90d',
    'last 6 months': '180d', '180d': '180d', '6m': '180d',
    'last 1 year': '365d', '365d': '365d', '1y': '365d',
    'custom': 'custom'
  };
  return map[v] || v;
}

export function normalizeResolution(range, resolution) {
  const r = normalizeRange(range);
  if (r === 'custom') return (resolution || 'raw').toLowerCase();
  return RANGE_TO_RESOLUTION[r] || (resolution || 'raw').toLowerCase();
}

export function normalizeFidelity(maxFidelity) {
  return maxFidelity ? 'max' : 'std';
}

export function normalizeMaxDepths(maxDepths) {
  if (maxDepths == null) return 'any';
  const n = Number(maxDepths);
  if (!Number.isFinite(n)) return 'any';
  // Bucket to common values
  const buckets = [6, 10, 20];
  return buckets.includes(n) ? String(n) : 'any';
}

export function normalizeParams(endpoint, params = {}, userPrefs = {}) {
  const sitesKey = normalizeSites(params.sites || params.site_ids || params.siteId || []);
  const range = normalizeRange(params.time_range || params.range);
  const start = params.start_date || params.startTs || '';
  const end = params.end_date || params.endTs || '';
  const res = normalizeResolution(range, params.resolution);
  const fid = normalizeFidelity(params.max_fidelity || params.maxFidelity || userPrefs.maxFidelity);
  const maxD = normalizeMaxDepths(params.maxDepths);
  return {
    endpoint,
    sites: sitesKey,
    range,
    start: range === 'custom' ? String(start) : '',
    end: range === 'custom' ? String(end) : '',
    resolution: res,
    fidelity: fid,
    maxDepths: maxD,
  };
}

export function canonicalKeyFromParams(norm) {
  const parts = [
    norm.endpoint,
    `sites=${norm.sites}`,
    `range=${norm.range}`,
    norm.range === 'custom' ? `start=${norm.start}|end=${norm.end}` : null,
    `res=${norm.resolution}`,
    `fid=${norm.fidelity}`,
    `maxD=${norm.maxDepths}`,
  ].filter(Boolean);
  return parts.join('|');
}

