# AptSpace

AptSpace is a web-based housing and accommodation management system for Asia Pacific Theological Seminary (APTS).

## Quick start

```bash
# 1. Install server dependencies
npm run install:server

# 2. Copy env template and edit credentials
cp .env.example client/server/.env

# 3. Import database schema (MySQL must be running)
mysql -u root -p < client/database/schema.sql

# 4. Start the server (seeds users + demo data on first boot)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Admin login:** `admin@aptspace.com` / `password` (or your `DEFAULT_PASSWORD`)

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
├── package.json              ← root scripts (npm run dev)
├── scripts/restructure.mjs   ← one-time folder move helper (already applied)
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

## API highlights

- `GET /api/stats/summary` — admin dashboard KPIs (live from DB)
- `PATCH /api/auth/me` — update logged-in user profile
- Bookings auto-calculate price, season, and check room availability

See previous README sections for full endpoint list.
