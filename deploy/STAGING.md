# Staging readiness — APTSpace

Use this while still developing locally. **Local dev is unchanged.**

## Two env files, two purposes

| File | Used by | Purpose |
|------|---------|---------|
| `client/server/.env` | `npm run dev` | Daily development on your machine |
| `client/server/.env.staging` | `npm run verify:staging` | Fill in as IT answers; deploy to staging server later |

Neither file is committed to Git.

## Step 1 — Keep developing locally (unchanged)

```bash
npm run setup              # once — creates client/server/.env
npm run install:server
npm run dev
```

Open http://localhost:3000

Check everything works:

```bash
npm run verify
```

## Step 2 — Start staging prep (parallel, no conflict)

```bash
npm run setup:staging
```

This creates `client/server/.env.staging` from `.env.staging.example`.

Fill in values **as IT provides them** — leave placeholders until you have answers.

Check progress anytime:

```bash
npm run verify:staging
```

## Step 3 — Optional: test production mode on your machine

After filling `.env.staging` (can still point DB at localhost for a dry run):

```bash
npm run start:staging
```

This runs with `NODE_ENV=production` rules (stricter env validation, no demo seed unless flagged).
Your normal `npm run dev` still uses `.env` — they do not overwrite each other.

## Practice staging locally (on your PC)

Simulate production (`NODE_ENV=production`) without waiting for IT. Uses **port 3001** so `npm run dev` can stay on 3000 at the same time.

```bash
# 1. One-time setup
npm run setup:staging:local

# 2. Create a separate practice database
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS aptspace_staging;"
mysql -u root -p aptspace_staging < client/database/schema.sql

# 3. Run staging-practice server
npm run start:staging:local
```

Open **http://localhost:3001** — login `admin@aptspace.com` / `password` (after first boot with `ENABLE_SEED=true`).

After admin login works, edit `client/server/.env.staging.local` and set `ENABLE_SEED=false`.

| | Dev | Staging practice |
|--|-----|------------------|
| Command | `npm run dev` | `npm run start:staging:local` |
| Port | 3000 | 3001 |
| Env file | `.env` | `.env.staging.local` |
| Database | `aptspace` | `aptspace_staging` |
| NODE_ENV | development | production |

## Step 4 — When IT gives server access

On the **staging server**:

```bash
git clone <repo> /var/www/aptspace
cd /var/www/aptspace
npm run install:server

# Copy your prepared staging config (or edit on server)
cp client/server/.env.staging client/server/.env
# OR: cp .env.staging.example client/server/.env && edit

mysql -h DB_HOST -u aptspace_app -p aptspace_staging < client/database/schema.sql

# First boot only — add ENABLE_SEED=true to .env, then remove after login
npm start
# OR: pm2 start ecosystem.config.cjs --env production

curl https://aptspace-staging.apts.edu/api/health
```

## What to do now vs wait for IT

| Do now (no IT needed) | Wait for IT |
|----------------------|-------------|
| `npm run setup:staging` | DB host, user, password |
| Fill known values in `.env.staging` | Staging subdomain + SSL |
| `npm run verify` daily | SMTP credentials |
| Manual test all flows locally | SSH / server access |
| Hand IT `deploy/apache-proxy.example.conf` | Apache reverse proxy |

## Smoke test after staging deploy

1. `GET /api/health` → `{ "status": "ok", "db": "connected" }`
2. Admin login → dashboard KPIs load
3. Guest booking → admin approve
4. Forgot password → email arrives
5. `pm2 status` → online
