import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Persistent Cache Hook using IndexedDB for cross-session storage
 * Provides intelligent caching with TTL support and automatic cleanup
 */

const DB_NAME = 'WaterQualityCache';
const DB_VERSION = 1;
const STORE_NAME = 'cache_entries';

class PersistentCacheDB {
  constructor() {
    this.db = null;
    this.initPromise = this.initDB();
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('🗄️ [PERSISTENT CACHE] IndexedDB initialized');
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create cache store with key path and indexes
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          
          // Create indexes for efficient queries
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('ttl', 'ttl', { unique: false });
          store.createIndex('category', 'category', { unique: false });
          
          console.log('🗄️ [PERSISTENT CACHE] Object store created');
        }
      };
    });
  }

  async set(key, data, ttlMs = 24 * 60 * 60 * 1000, category = 'general') {
    try {
      await this.initPromise;
      if (!this.db) throw new Error('Database not initialized');

      const timestamp = Date.now();
      const expiresAt = timestamp + ttlMs;
      
      // Compress large data objects
      const compressedData = this.compressData(data);
      
      const entry = {
        key,
        data: compressedData,
        timestamp,
        ttl: ttlMs,
        expiresAt,
        category,
        size: JSON.stringify(compressedData).length
      };

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      await new Promise((resolve, reject) => {
        const request = store.put(entry);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      console.log(`💾 [PERSISTENT CACHE] Stored ${key} (${entry.size} bytes, TTL: ${ttlMs}ms)`);
      return true;
    } catch (error) {
      console.error('Failed to set persistent cache:', error);
      return false;
    }
  }

  async get(key) {
    try {
      await this.initPromise;
      if (!this.db) return null;

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      
      const entry = await new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      if (!entry) {
        console.log(`❌ [PERSISTENT CACHE] Miss: ${key}`);
        return null;
      }

      // Check if expired
      if (Date.now() > entry.expiresAt) {
        console.log(`⏰ [PERSISTENT CACHE] Expired: ${key}`);
        this.delete(key); // Clean up expired entry
        return null;
      }

      console.log(`✅ [PERSISTENT CACHE] Hit: ${key}`);
      return this.decompressData(entry.data);
    } catch (error) {
      console.error('Failed to get persistent cache:', error);
      return null;
    }
  }

  async delete(key) {
    try {
      await this.initPromise;
      if (!this.db) return false;

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      await new Promise((resolve, reject) => {
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      console.log(`🗑️ [PERSISTENT CACHE] Deleted: ${key}`);
      return true;
    } catch (error) {
      console.error('Failed to delete persistent cache:', error);
      return false;
    }
  }

  async clear(category = null) {
    try {
      await this.initPromise;
      if (!this.db) return 0;

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      if (category) {
        // Clear specific category
        const index = store.index('category');
        const keys = await new Promise((resolve, reject) => {
          const request = index.getAllKeys(category);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        let deletedCount = 0;
        for (const key of keys) {
          await new Promise((resolve) => {
            const deleteRequest = store.delete(key);
            deleteRequest.onsuccess = () => {
              deletedCount++;
              resolve();
            };
            deleteRequest.onerror = () => resolve(); // Continue on error
          });
        }

        console.log(`🧹 [PERSISTENT CACHE] Cleared ${deletedCount} entries in category: ${category}`);
        return deletedCount;
      } else {
        // Clear all
        await new Promise((resolve, reject) => {
          const request = store.clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });

        console.log('🧹 [PERSISTENT CACHE] Cleared all entries');
        return true;
      }
    } catch (error) {
      console.error('Failed to clear persistent cache:', error);
      return 0;
    }
  }

  async cleanup() {
    try {
      await this.initPromise;
      if (!this.db) return 0;

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const now = Date.now();
      let cleanedCount = 0;

      // Get all entries and check expiration
      const entries = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      for (const entry of entries) {
        if (now > entry.expiresAt) {
          await this.delete(entry.key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`🧹 [PERSISTENT CACHE] Cleaned up ${cleanedCount} expired entries`);
      }

      return cleanedCount;
    } catch (error) {
      console.error('Failed to cleanup persistent cache:', error);
      return 0;
    }
  }

  async getStats() {
    try {
      await this.initPromise;
      if (!this.db) return null;

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      
      const entries = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const now = Date.now();
      let totalSize = 0;
      let expiredCount = 0;
      const categories = {};

      entries.forEach(entry => {
        totalSize += entry.size || 0;
        if (now > entry.expiresAt) expiredCount++;
        
        const cat = entry.category || 'general';
        categories[cat] = (categories[cat] || 0) + 1;
      });

      return {
        totalEntries: entries.length,
        expiredEntries: expiredCount,
        validEntries: entries.length - expiredCount,
        totalSizeBytes: totalSize,
        totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
        categories
      };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return null;
    }
  }

  compressData(data) {
    // Simple compression - in production, could use more advanced techniques
    try {
      const jsonString = JSON.stringify(data);
      // For now, just return as-is, but this is where we could add LZ compression
      return { compressed: false, data: jsonString };
    } catch (error) {
      console.warn('Failed to compress data:', error);
      return { compressed: false, data };
    }
  }

  decompressData(compressedData) {
    try {
      if (compressedData.compressed === false) {
        return typeof compressedData.data === 'string' 
          ? JSON.parse(compressedData.data)
          : compressedData.data;
      }
      // Handle other compression formats here
      return compressedData.data;
    } catch (error) {
      console.warn('Failed to decompress data:', error);
      return compressedData.data;
    }
  }
}

// Global cache instance
const persistentCacheDB = new PersistentCacheDB();

export function usePersistentCache(cacheKey, defaultTTL = 24 * 60 * 60 * 1000) {
  const [isReady, setIsReady] = useState(false);
  const cleanupTimerRef = useRef(null);

  useEffect(() => {
    // Initialize and set up periodic cleanup
    persistentCacheDB.initPromise.then(() => {
      setIsReady(true);
      
      // Initial cleanup
      persistentCacheDB.cleanup();
      
      // Set up periodic cleanup every 10 minutes
      cleanupTimerRef.current = setInterval(() => {
        persistentCacheDB.cleanup();
      }, 10 * 60 * 1000);
    });

    return () => {
      if (cleanupTimerRef.current) {
        clearInterval(cleanupTimerRef.current);
      }
    };
  }, []);

  const get = useCallback(async (key) => {
    if (!isReady) return null;
    return persistentCacheDB.get(`${cacheKey}:${key}`);
  }, [cacheKey, isReady]);

  const set = useCallback(async (key, data, ttl = defaultTTL, category = 'general') => {
    if (!isReady) return false;
    return persistentCacheDB.set(`${cacheKey}:${key}`, data, ttl, category);
  }, [cacheKey, defaultTTL, isReady]);

  const remove = useCallback(async (key) => {
    if (!isReady) return false;
    return persistentCacheDB.delete(`${cacheKey}:${key}`);
  }, [cacheKey, isReady]);

  const clear = useCallback(async (category = null) => {
    if (!isReady) return 0;
    return persistentCacheDB.clear(category);
  }, [isReady]);

  const getStats = useCallback(async () => {
    if (!isReady) return null;
    return persistentCacheDB.getStats();
  }, [isReady]);

  return {
    get,
    set,
    remove,
    clear,
    getStats,
    isReady
  };
}

export default usePersistentCache;