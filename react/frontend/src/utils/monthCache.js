// Lightweight IndexedDB-backed month cache with sessionStorage fallback
// Keyed by a provided string key; stores { savedAt, ttlMs, payload }

const DB_NAME = 'redoxMonthCacheDB';
const DB_VERSION = 1;
const STORE_NAME = 'slices';

function openDb() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

async function idbGet(key) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (_) {
    return null;
  }
}

async function idbSet(key, value) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ key, ...value });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (_) {
    return false;
  }
}

export async function getMonthCache(key, ttlMs, sessionFallback = true) {
  // Try IDB
  const now = Date.now();
  const rec = await idbGet(key);
  if (rec && typeof rec.savedAt === 'number') {
    const ttl = typeof rec.ttlMs === 'number' ? rec.ttlMs : ttlMs;
    if (!ttl || (now - rec.savedAt) <= ttl) {
      return rec.payload || null;
    }
  }
  // Fallback sessionStorage
  if (sessionFallback) {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const obj = JSON.parse(raw);
        const sttl = obj?.ttlMs ?? ttlMs;
        if (!sttl || (now - (obj?.savedAt || 0)) <= sttl) return obj?.payload || null;
        sessionStorage.removeItem(key);
      }
    } catch (_) {}
  }
  return null;
}

export async function setMonthCache(key, payload, ttlMs, sessionFallback = true) {
  const record = { savedAt: Date.now(), ttlMs, payload };
  // Try IDB
  await idbSet(key, record);
  // Best-effort session fallback
  if (sessionFallback) {
    try {
      sessionStorage.setItem(key, JSON.stringify(record));
    } catch (_) {}
  }
}

