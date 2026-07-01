# AptSpace Security & Performance

Summary of security controls and caching added to the housing portal.

---

## Security (implemented)

### 1. Protected admin/guest HTML pages

`/admin/*.html` and `/guest/*.html` require a valid httpOnly session cookie. Unauthenticated users redirect to `/login.html`.

| File | Role |
|------|------|
| `client/server/src/middleware/pageAuth.middleware.js` | JWT + session check |
| `client/server/src/routes/pages.routes.js` | `requirePortalPage()` on portal routes |

### 2. Single active session per account

Each account (admin **or** guest) can only stay signed in on **one device at a time**. If they log in on a **second device**, the **first device is signed out automatically** — so a dead laptop does not block login on a phone.

The newest login always wins. Different users can still be logged in at the same time.

### 3. Per-account login lockout

After **5** failed attempts per email → **15-minute** lockout (in addition to IP rate limits).

| Table | Purpose |
|-------|---------|
| `login_attempts` | Tracks failures per email |

### 4. httpOnly auth cookie

Login sets `aptspace_token` (httpOnly) for page-route auth. API calls still use Bearer + `credentials: 'include'`.

### 5. API abuse protection

| Control | Default |
|---------|---------|
| Auth routes (`/login`, forgot/reset password) | 20 req / 15 min per IP |
| All other `/api/*` routes | 120 req / min per IP (prod), 600 (dev) |
| JSON body validation | POST/PATCH/PUT require `application/json` when body present |

Env: `API_RATE_LIMIT_MAX`

### 6. CSRF posture

Bearer tokens for API mutations; httpOnly cookie only for HTML page access. Low CSRF risk.

### 7. Error message escaping

`admin-payments.js` uses `escapeHtml()` for server error messages in HTML.

---

## Caching (implemented)

In-memory response cache reduces repeated DB hits on **read-heavy catalog endpoints** — helpful when many users browse rates/facilities at once.

| Endpoint | Cache key | TTL |
|----------|-----------|-----|
| `GET /api/catalog/meal-rates` | `catalog:meal-rates` | 120s |
| `GET /api/catalog/extra-services` | `catalog:extra-services` | 120s |
| `GET /api/facilities/overview` | `facilities:overview` | 120s |
| `GET /api/facilities/` (venues) | `facilities:venues` | 120s |
| `GET /api/facilities/list` | `facilities:list` | 120s |
| `GET /api/facilities/venue-rate` | per query string | 120s |
| `GET /api/facilities/:id` | per facility id | 120s |
| `GET /api/rooms/buildings/list` | `buildings:list` | 300s |
| `GET /api/bookings/meal-rates` | `booking:meal-rates` | 120s |
| `GET /api/settings/fiscal-year` | per admin/guest role | 120s |

**Not cached** (user-specific or changes often): bookings, payments, users, room lists, availability, stats.

**Invalidation:** Admin updates to rates/facilities/settings clear related cache keys automatically.

**Static assets:** JS/CSS/images get `Cache-Control: public, max-age=86400` in production. HTML stays `no-cache`.

**Headers:** `X-Cache: HIT|MISS` on cached API responses.

| File | Role |
|------|------|
| `client/server/src/utils/cache.js` | In-memory store + bust helpers |
| `client/server/src/middleware/cache.middleware.js` | `cacheResponse()` wrapper |

### Env vars

```env
CACHE_ENABLED=true
CACHE_TTL_SECONDS=120
CACHE_MAX_ENTRIES=500
```

Set `CACHE_ENABLED=false` to disable. For multi-server deploys later, swap to Redis (see roadmap below).

### Verify caching

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/catalog/meal-rates -i
# First call: X-Cache: MISS
# Second call within TTL: X-Cache: HIT
```

`GET /api/health` includes `cache: { enabled, size, maxEntries }`.

---

## Security roadmap (not yet implemented)

Prioritized ideas for future hardening:

| Priority | Item | Why |
|----------|------|-----|
| **High** | Move JWT fully to httpOnly cookie (drop `localStorage`) | XSS could steal Bearer token today |
| **High** | Shorter JWT expiry + refresh flow | Limits stolen-token window |
| **Medium** | Audit log for admin actions (user edits, payments, access grants) | Accountability / forensics |
| **Medium** | Input validation middleware (`zod` / `express-validator`) on all write routes | Consistent server-side validation |
| **Medium** | 2FA for Super Admin accounts | Extra layer for privileged users |
| **Medium** | Redis cache + rate-limit store | Shared state across multiple Node instances |
| **Low** | CAPTCHA on login after N failures | Blocks automated bots beyond IP limits |
| **Low** | Security headers audit (tighten CSP, remove `unsafe-inline` scripts) | Reduce XSS impact; needs frontend refactor |
| **Low** | Dependency scanning in CI (`npm audit`) | Catch vulnerable packages early |
| **Low** | WAF / Cloudflare in front of production | DDoS and bot filtering at edge |

---

## Verify locally

```bash
npm run dev
```

1. `/admin/dashboard.html` while logged out → redirect to login.
2. Same account on two browsers → first session invalidated.
3. 5 wrong passwords → account lockout.
4. Cached endpoint → `X-Cache: HIT` on repeat within TTL.
5. `GET /api/health` → shows cache stats.
