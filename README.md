# AptSpace

AptSpace is a web-based housing and accommodation management system for Asia Pacific Theological Seminary (APTS).

## Quick start

```bash
# 1. First-time setup (copies .env if missing)
npm run setup

# 2. Install server dependencies
npm run install:server

# 3. Copy env template and edit credentials (skip if setup already ran)
# Windows:
copy .env.example client\server\.env
# macOS/Linux:
cp .env.example client/server/.env

# 4. Import database schema (MySQL must be running)
mysql -u root -p < client/database/schema.sql

# 5. Start the server (seeds users + demo data on first boot)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Verify local setup:** `npm run verify`

**Admin login:** `admin@aptspace.com` / `password` (or your `DEFAULT_PASSWORD`)

## Local dev vs staging prep (both at once)

You can develop locally **and** prepare staging in parallel — they use **separate env files**:

| Command | Env file | When |
|---------|----------|------|
| `npm run dev` | `client/server/.env` | Daily coding |
| `npm run setup:staging` | creates `.env.staging` | Start staging prep |
| `npm run verify:staging` | checks `.env.staging` | Before deploy |
| `npm run start:staging` | `.env.staging` | Optional: test production mode locally |

Full staging workflow: [deploy/STAGING.md](deploy/STAGING.md)

## Configuration

The app reads **`client/server/.env`** only. The root `.env.example` is a template for your team — copy it to `client/server/.env`.

Required variables: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

On startup the server will:
1. Test the MySQL connection (exit if it fails)
2. Seed default users if missing
3. Seed demo bookings/payments if the bookings table is empty

## Project structure

```txt
APSTPACE/
├── .env.example              ← team template (copy to client/server/.env)
├── package.json              ← root scripts (npm run dev, npm run setup)
├── scripts/
│   ├── setup.mjs             ← first-time env copy + next-step hints
│   └── restructure.mjs       ← one-time folder move helper (already applied)
└── client/
    ├── database/schema.sql
    ├── public/               ← static assets only (marketing + shared files)
    │   ├── index.html
    │   ├── components/       ← sidebar, header, modals (loaded by fetch)
    │   └── assets/
    │       ├── css/global|components|features/
    │       └── js/config|layout|services|features/
    └── server/
        ├── views/            ← app pages (served at same URLs as before)
        │   ├── auth/login.html
        │   ├── admin/*.html
        │   └── guest/*.html
        └── src/              ← Express API + page routes
```

**URLs are unchanged:** `/login.html`, `/admin/dashboard.html`, `/guest/reservations.html`, etc.  
App HTML lives in `client/server/views/`; CSS/JS live under `client/public/assets/`.

## API reference

| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/health` | DB connectivity check |
| POST | `/api/auth/login` | Returns JWT + user |
| GET | `/api/auth/me` | Current user profile |
| PATCH | `/api/auth/me` | Update name |
| PATCH | `/api/auth/me/password` | Change password (logged in) |
| POST | `/api/auth/forgot-password` | Sends reset email |
| POST | `/api/auth/reset-password` | Reset with token |
| GET | `/api/stats/summary` | Admin dashboard KPIs |
| GET/PATCH | `/api/settings/fiscal-year` | Fiscal year config |
| GET/POST/PATCH/DELETE | `/api/bookings` | Room reservations |
| GET/POST/PATCH/DELETE | `/api/groups` | Group reservations |
| GET/POST/PATCH/DELETE | `/api/facility-bookings` | Venue bookings |
| GET/POST/PATCH/DELETE | `/api/rooms` | Room inventory |
| GET | `/api/rooms/overview` | Admin room board |
| GET/POST/PATCH/DELETE | `/api/facilities` | Meals, extras, venues catalog |
| GET/POST/PATCH | `/api/payments` | Payment records |
| GET/POST | `/api/users/guest-access/*` | External guest access workflow |

Bookings auto-calculate price, season, and check room availability.

## Project status (~78% complete)

| Area | Done | Notes |
|------|------|-------|
| Admin portal | ~85% | Dashboard, reservations, facilities, guest access wired to API |
| Guest portal | ~80% | Reservations & facilities live; settings profile now saves |
| Backend API | ~75% | Core flows done; rates/seasons admin UI not built |
| Auth & email | ~90% | Login, reset, guest-access emails (needs valid SMTP) |
| Dev tooling | ~75% | Setup script, health check; no automated tests yet |

**Still in progress:** payment recording UI (mark-as-paid added), notification prefs, landing page polish, automated tests.

## Production deployment

### 1. Server requirements

- Node.js 18+
- MySQL 8+ (local or managed, e.g. RDS, PlanetScale, Azure MySQL)
- Reverse proxy with TLS (nginx, Caddy, or cloud load balancer)
- SMTP for password reset and guest-access emails

### 2. Environment (`client/server/.env`)

Set at minimum:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000

DB_HOST=your-db-host
DB_USER=aptspace_app
DB_PASSWORD=strong-db-password
DB_NAME=aptspace
DB_SSL=true

JWT_SECRET=<48+ char random hex>
APP_URL=https://aptspace.yourdomain.edu
ALLOWED_ORIGIN=https://aptspace.yourdomain.edu

SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=noreply@yourdomain.edu
```

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. First deploy bootstrap

```bash
mysql -h DB_HOST -u DB_USER -p < client/database/schema.sql
npm run install:server

# One-time: create admin users (then remove ENABLE_SEED from .env)
ENABLE_SEED=true npm start
```

Demo bookings are **not** loaded in production unless `ENABLE_DEMO_DATA=true`.

### 4. Run with PM2 (recommended)

```bash
mkdir -p logs
pm2 start ecosystem.config.cjs --env production
pm2 save
```

The server listens on `0.0.0.0:PORT`, handles `SIGTERM` gracefully, and closes the MySQL pool on shutdown.

### 5. Reverse proxy (nginx sketch)

```nginx
server {
  listen 443 ssl;
  server_name aptspace.yourdomain.edu;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

`trust proxy` is enabled automatically when `NODE_ENV=production`.

See `deploy/apache-proxy.example.conf` for a starter Apache config to hand to IT.

### 6. Health monitoring

`GET /api/health` — use for uptime checks. Returns 503 if MySQL is down.

## Security notes

| Area | Status | Notes |
|------|--------|-------|
| API auth | Good | JWT on protected routes; role checks on admin endpoints |
| SQL injection | Good | Parameterized queries throughout |
| Rate limiting | Partial | Login, forgot-password, reset-password (20 / 15 min) |
| Password hashing | Good | bcrypt cost 10 |
| Page access | Client-only | Admin HTML is not server-guarded — APIs enforce permissions |
| CORS | Configured | Set `ALLOWED_ORIGIN` in production |
| Secrets | Validated | Weak `JWT_SECRET` blocked at startup in production |
| Demo data | Guarded | Skipped when `NODE_ENV=production` |

**Fixed in this pass:** user IDOR (`GET /api/users/:id`), production seed guard, env validation, generic 500 errors in production, password min length 8 in production, request body size limit (1 MB).

**Still recommended (your team):**
- Put nginx/Cloudflare in front with HTTPS and WAF
- Use a secrets manager or host env vars (not committed `.env`)
- Rotate `JWT_SECRET` only with a forced re-login plan
- Add automated tests for auth and booking permission checks
- Consider httpOnly cookie sessions instead of `localStorage` JWT (larger change)
- Tighten CSP once Tailwind is built locally (remove CDN `unsafe-eval`)
