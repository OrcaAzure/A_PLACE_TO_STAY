# Free cloud server practice — AptSpace

Practice real deployment before APTS IT gives you access. **Local dev (`npm run dev`) is unchanged.**

## Recommended: Oracle Cloud Always Free

**Why this one:** Full Linux VM (like a real server), always free, runs Node + MySQL on the same machine — same pattern as APTS staging.

| | Oracle Free VM | Render free | Your PC as LAN server |
|--|----------------|-------------|------------------------|
| Cost | $0 forever | $0 (limits) | $0 |
| MySQL included | Yes (you install) | No (extra service) | Yes (local) |
| 24/7 uptime | Yes | Sleeps when idle | Only when PC is on |
| Best for | **Real deploy practice** | Quick API demo | Same-room team test |

**Alternatives:** Google Cloud e2-micro (12-mo trial), AWS free tier (12 months), Fly.io (small free allowance).

---

## Path A — Docker on your PC first (easiest start)

Simulates cloud deploy without signing up anywhere.

**Requires:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed.

```bash
npm run docker:up
```

Open http://localhost:3000 — login `admin@aptspace.com` / `password`

Stop:

```bash
npm run docker:down
```

Teammates on same Wi‑Fi: edit `docker-compose.yml` → set `APP_URL` and `ALLOWED_ORIGIN` to `http://YOUR_PC_IP:3000`, then `npm run docker:up`.

---

## Path B — Oracle Cloud free VM (real internet practice)

### 1. Create account & VM

1. Sign up: https://www.oracle.com/cloud/free/
2. Create an **Always Free** VM:
   - Shape: **VM.Standard.E2.1.Micro** (AMD) or **Ampere A1** (ARM, more RAM)
   - OS: **Ubuntu 22.04**
   - Download the SSH private key (.pem)
3. **Networking → Security List → Ingress rules** — add:
   - TCP port **22** (SSH)
   - TCP port **3000** (app — practice only; use 80+nginx later)

### 2. SSH into the server

```bash
ssh -i your-key.pem ubuntu@YOUR_PUBLIC_IP
```

### 3. Install Node.js, MySQL, Git, PM2

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git mysql-server

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

sudo npm install -g pm2
```

### 4. Secure MySQL & create database

```bash
sudo mysql

CREATE DATABASE aptspace;
CREATE USER 'aptspace_app'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON aptspace.* TO 'aptspace_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 5. Deploy the app

```bash
git clone https://github.com/OrcaAzure/APSTPACE.git
cd APSTPACE
npm run install:server

cp .env.cloud.example client/server/.env
nano client/server/.env
```

Set in `.env`:

- `YOUR_PUBLIC_IP` → Oracle VM public IP (in `APP_URL` and `ALLOWED_ORIGIN`)
- `DB_PASSWORD` → password from step 4
- `JWT_SECRET` → run on your PC: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `ENABLE_SEED=true` for first boot only

Import schema:

```bash
mysql -u aptspace_app -p aptspace < client/database/schema.sql
```

Start with PM2:

```bash
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup    # run the command it prints
```

### 6. Test

Open in browser:

```
http://YOUR_PUBLIC_IP:3000/api/health
http://YOUR_PUBLIC_IP:3000
```

Share that URL with teammates anywhere on the internet.

### 7. After first login

Edit `client/server/.env` on the VM:

```env
ENABLE_SEED=false
ENABLE_DEMO_DATA=false
```

Then: `pm2 restart aptspace`

---

## Path C — Docker on the Oracle VM (optional)

If Docker is installed on the VM:

```bash
git clone https://github.com/OrcaAzure/APSTPACE.git
cd APSTPACE
# Edit docker-compose.yml — set APP_URL/ALLOWED_ORIGIN to public IP
docker compose up -d --build
```

---

## Readying the code (checklist)

| Item | Status in repo |
|------|----------------|
| Listen on `0.0.0.0` | Done (`HOST=0.0.0.0`) |
| `PORT` from env | Done |
| Production env validation | Done (`validateEnv.js`) |
| PM2 config | Done (`ecosystem.config.cjs`) |
| Docker build | Done (`Dockerfile`, `docker-compose.yml`) |
| Cloud env template | Done (`.env.cloud.example`) |
| Health check | `GET /api/health` |

### Commands on your PC

```bash
npm run setup:cloud      # creates client/server/.env.cloud with JWT secret
npm run verify           # local dev check
npm run docker:up        # practice full stack locally
```

---

## Security notes for practice servers

- Change default admin password after first login
- Do **not** put real APTS user data on a practice VM
- Oracle free VMs get scanned by bots — use strong `JWT_SECRET` and DB password
- For internship demo only — move to APTS IT staging before go-live
- Later: add nginx + HTTPS (Let's Encrypt) instead of raw port 3000

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Can't connect from browser | Open port 3000 in Oracle Security List + Ubuntu firewall: `sudo ufw allow 3000` |
| `JWT_SECRET` error on start | Must be 32+ chars in production |
| DB connection refused | Check `DB_HOST=127.0.0.1`, MySQL running: `sudo systemctl status mysql` |
| CORS error in browser | `ALLOWED_ORIGIN` must exactly match URL (including `http://` and port) |
| App dies after SSH logout | Use PM2, not bare `node` |
