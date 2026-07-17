import { cache, CACHE_ENABLED, CACHE_TTL_SECONDS, resolveCacheKey } from '../utils/cache.js';

/**
 * Cache successful JSON GET responses in memory to reduce repeated DB reads.
 * Place after requireAuth when the cache key depends on req.user.
 */
export function cacheResponse(key, ttlSeconds = CACHE_TTL_SECONDS) {
  return (req, res, next) => {
    if (!CACHE_ENABLED || req.method !== 'GET') return next();

    const cacheKey = resolveCacheKey(key, req);
    const hit = cache.get(cacheKey);
    if (hit) {
      res.setHeader('X-Cache', 'HIT');
      if (hit.cacheControl) res.setHeader('Cache-Control', hit.cacheControl);
      return res.status(hit.status).json(hit.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const preserveNoStore = String(res.getHeader('Cache-Control') || '').includes('no-store');
        const cacheControl = preserveNoStore ? 'no-store' : `private, max-age=${ttlSeconds}`;
        res.setHeader('Cache-Control', cacheControl);
        cache.set(cacheKey, {
          status: res.statusCode,
          body,
          cacheControl,
        }, ttlSeconds);
        res.setHeader('X-Cache', 'MISS');
      }
      return originalJson(body);
    };

    next();
  };
}
