import { log } from './log';

export const safeStorage = {
  getRaw(key) {
    try { return window.localStorage.getItem(key); } catch (e) { log.warn('[storage] getRaw failed', { key, error: e?.message }); return null; }
  },
  setRaw(key, value) {
    try { window.localStorage.setItem(key, String(value)); return true; } catch (e) { log.warn('[storage] setRaw failed', { key, error: e?.message }); return false; }
  },
  remove(key) {
    try { window.localStorage.removeItem(key); return true; } catch (e) { log.warn('[storage] remove failed', { key, error: e?.message }); return false; }
  },
  getJSON(key) {
    try {
      const v = window.localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch (e) { log.warn('[storage] getJSON failed', { key, error: e?.message }); return null; }
  },
  setJSON(key, obj) {
    try {
      window.localStorage.setItem(key, JSON.stringify(obj));
      return true;
    } catch (e) { log.warn('[storage] setJSON failed', { key, error: e?.message }); return false; }
  }
};

