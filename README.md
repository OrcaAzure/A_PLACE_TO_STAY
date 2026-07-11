# AptSpace

AptSpace is a web-based housing and accommodation management system for Asia Pacific Theological Seminary (APTS).

**New to the project and need to run the server?** → see **[RUN-SERVER.md](RUN-SERVER.md)** (step-by-step guide for teammates).

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
| `npm run start:staging` | `.env.staging` | Test with real IT values (when ready) |
| `npm run start:staging:local` | `.env.staging.local` | **Practice staging on your PC** (port 3001) |
| `npm run docker:up` | Docker | **Practice cloud deploy locally** (port 3000) |

Cloud VM guide: [deploy/FREE-CLOUD.md](deploy/FREE-CLOUD.md)

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
│   ├── verify-local.mjs      ← local setup checks
│   └── run-server.mjs        ← staging / production server launcher
└── client/
    ├── shared/               ← cross-stack constants (served at /shared/)
    │   └── guest-access.js
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
| PATCH | `/api/auth/me` | Update name and email notification preferences |
| PATCH | `/api/auth/me/password` | Change password (logged in) |
| POST | `/api/auth/forgot-password` | Sends reset email |
| POST | `/api/auth/reset-password` | Reset with token |
| GET | `/api/stats/summary` | Admin dashboard KPIs |
| GET | `/api/notifications` | In-app notification feed (admin + guest) |
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

## Project status (~91% complete)

| Area | Done | Notes |
|------|------|-------|
| Admin portal | ~90% | Dashboard, reservations, facilities, guest access, billing, in-app notifications |
| Guest portal | ~92% | Book, modify, cancel reservations; venue bookings; profile; notification prefs; live bell feed |
| Backend API | ~89% | Core flows done; room/venue rates and seasonal periods in Settings |
| Auth & email | ~93% | 12 automated email templates; guest email prefs; needs production SMTP to deliver |
| Dev tooling | ~90% | Setup, Docker, GitHub Actions CI, health check, `npm test` (60/61 passing) |
| Deployment / ops | ~65% | Docs and configs ready; staging/prod not validated with IT yet |

**Product overall ~91% · production-ready ~78%** (blocked mainly on IT: DB, SSL, SMTP, staging smoke test).

**Still in progress:** admin venue modify UI, landing page smoke test update.

**Recently shipped:** in-app notification feed (admin + guest bell), guest email notification preferences, silent background polling (no pulse animations), billing modal stability and confirm-dialog fixes, guest self-modify (room/group/venue), landing page polish, privacy/terms legal pages.

## Automated tests

```bash
npm run install:server   # once — installs supertest
npm test                 # unit + integration (integration needs MySQL + .env)
npm run test:unit        # middleware permission guards only (no database)
```

Integration tests use `client/server/.env` and seeded users (`admin@aptspace.com`, `maria.santos@apts.edu.ph` / `password`). They are skipped automatically when MySQL is unavailable.

**Not covered yet:** booking create/update flows, guest-access workflow, guest self-modify emails.

## Automated emails

Templates live in `client/server/src/services/email.service.js`. In development without SMTP, bodies are logged to the console (`[email dev]`).

Guests can turn off email in **Account → Notifications** (`email_notifications_enabled`, `email_modification_notices_enabled` on `PATCH /api/auth/me`). Password reset and guest-access invite emails always send regardless of prefs.

| Email | When |
|-------|------|
| Guest access invite | Admin creates external guest account |
| Password reset | Forgot-password flow |
| Room / group confirmation | Booking approved |
| Room / group modified (admin) | Admin modifies with message |
| Guest self-modify (room / group / venue) | Guest updates pending or re-requests approved booking |
| Housing / venue invoice | Booking approved or admin sends from Billing |
| Payment receipt | Admin records payment |
| Support message | Guest submits support form (to `SUPPORT_EMAIL`) |

Verify SMTP before deploy: `node client/server/scripts/validate-smtp.mjs --send-test`

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
| Page access | Good | Admin/guest HTML requires httpOnly session cookie; APIs enforce permissions |
| CORS | Configured | Set `ALLOWED_ORIGIN` in production |
| Secrets | Validated | Weak `JWT_SECRET` blocked at startup in production |
| Demo data | Guarded | Skipped when `NODE_ENV=production` |

**Implemented:** user IDOR guard, production seed guard, env validation, page auth middleware, single-session login, login lockout, httpOnly cookie for page routes, generic 500 errors in production.

**Still recommended before go-live:**
- Staging deploy + smoke test with IT (see `deploy/STAGING.md`)
- Production SMTP (`SMTP_*` in `.env`) — password reset and booking emails will not deliver without it
- Put nginx/Cloudflare in front with HTTPS and WAF
- Use host env vars or a secrets manager (not committed `.env`)
- Expand automated tests (booking CRUD, guest-access, guest-modify emails)
- Move API JWT fully off `localStorage` (httpOnly cookie exists for pages only)
- Tighten CSP once Tailwind is built locally (remove CDN `unsafe-eval`)
