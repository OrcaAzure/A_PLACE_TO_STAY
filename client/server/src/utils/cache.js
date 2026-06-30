import { CACHE_ENABLED, CACHE_TTL_SECONDS, CACHE_MAX_ENTRIES } from '../config/env.js';

class MemoryCache {
  constructor(maxEntries) {
    this.maxEntries = maxEntries;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlSeconds) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest != null) this.store.delete(oldest);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  del(key) {
    this.store.delete(key);
  }

  delPrefix(prefix) {
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear() {
    this.store.clear();
  }

  stats() {
    return { enabled: CACHE_ENABLED, size: this.store.size, maxEntries: this.maxEntries };
  }
}

export const cache = new MemoryCache(CACHE_MAX_ENTRIES);

export function resolveCacheKey(key, req) {
  if (typeof key === 'function') return key(req);
  return key;
}

export function bustCatalogAndFacilities() {
  if (!CACHE_ENABLED) return;
  cache.delPrefix('catalog:');
  cache.delPrefix('facilities:');
  cache.delPrefix('booking:meal-rates');
}

export function bustFiscalYearSettings() {
  if (!CACHE_ENABLED) return;
  cache.delPrefix('settings:fiscal-year');
}

export function bustBuildingsList() {
  if (!CACHE_ENABLED) return;
  cache.del('buildings:list');
}

export { CACHE_ENABLED, CACHE_TTL_SECONDS };
