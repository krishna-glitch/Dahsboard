/**
 * Simple TTL cache utilities for localStorage-backed maps.
 * Entries are stored as { entries: { key: { ts: number, data: any[] } } }.
 */

/**
 * Load a TTL-bound cache map from localStorage.
 * @param {string} storageKey
 * @param {number} ttlMs - time-to-live in milliseconds
 * @returns {Map<string, {ts:number, data:any[]}>}
 */
export function loadCache(storageKey, ttlMs) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    const entries = parsed?.entries || {};
    const now = Date.now();
    const map = new Map();
    for (const [k, v] of Object.entries(entries)) {
      if (v && Array.isArray(v.data) && typeof v.ts === 'number' && (now - v.ts) < ttlMs) {
        map.set(k, { ts: v.ts, data: v.data });
      }
    }
    return map;
  } catch (e) {
    console.warn('[CACHE] Failed to load from localStorage:', e);
    return new Map();
  }
}

/**
 * Persist a TTL-bound cache map to localStorage with size trimming.
 * @param {string} storageKey
 * @param {Map<string, {ts:number, data:any[]}>} map
 * @param {number} maxChars - approximate max JSON size
 * @param {number} ttlMs
 */
export function persistCache(storageKey, map, maxChars, ttlMs) {
  try {
    const now = Date.now();
    const entries = {};
    for (const [k, v] of map.entries()) {
      if (v && Array.isArray(v.data) && typeof v.ts === 'number' && (now - v.ts) < ttlMs) {
        entries[k] = v;
      }
    }
    const keysByTs = Object.keys(entries).sort((a, b) => entries[b].ts - entries[a].ts);
    const trimmed = {};
    for (const k of keysByTs) {
      trimmed[k] = entries[k];
      const size = JSON.stringify({ entries: trimmed }).length;
      if (size > maxChars) { delete trimmed[k]; break; }
    }
    window.localStorage.setItem(storageKey, JSON.stringify({ entries: trimmed }));
  } catch (e) {
    console.warn('[CACHE] Failed to persist to localStorage:', e);
  }
}

