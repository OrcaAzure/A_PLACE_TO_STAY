# APTSpace — Oracle Cloud practice deployment

**Audience:** server / DevOps engineer  
**Purpose:** Stand up a **free, public practice instance** of APTSpace before production deploy on hosting.com (cPanel).  
**Cost:** $0 on Oracle Cloud **Always Free** tier (if you stay on eligible shapes).  
**Repo:** https://github.com/OrcaAzure/APSTPACE.git  
**Branch:** `main`

This is a **practice / demo environment only**. Do not load real APTS user data. Change default passwords after first login.

---

## What you are deploying

| Component | Detail |
|-----------|--------|
| Runtime | Node.js 20 (Express) |
| Database | MySQL 8 on the same VM |
| Process manager | PM2 |
| App port | `3000` (HTTP, practice only — no HTTPS on this guide) |
| Env file | `client/server/.env` (not committed to Git) |
| Health check | `GET /api/health` → `{ "status": "ok", "db": "connected" }` |
| Default admin | `admin@aptspace.com` / `password` (change immediately) |

The app listens on `0.0.0.0` and reads `PORT` from the environment. PM2 config: `ecosystem.config.cjs` at repo root.

---

## Prerequisites

- Oracle Cloud account ([oracle.com/cloud/free](https://www.oracle.com/cloud/free/)) — card required for identity verification
- SSH client (Linux/macOS built-in; Windows: OpenSSH or PuTTY)
- Outbound internet from the VM (for `git clone`, `npm install`)

**Before cloning:** confirm `main` on GitHub has the latest code the team wants deployed.

---

## Part 1 — Create the VM (Oracle Console)

1. **Menu → Compute → Instances → Create instance**
2. **Name:** `aptspace-practice` (or similar)
3. **Image:** Ubuntu 22.04 (Always Free eligible)
4. **Shape (Always Free only):**
   - **VM.Standard.E2.1.Micro** (AMD, 1 GB RAM), or
   - **Ampere A1** (ARM) — e.g. 1 OCPU, 6 GB RAM (still within free tier)
5. **Networking:** default VCN; enable **Assign a public IPv4 address**
6. **SSH keys:** **Generate a key pair** → download the `.pem` private key (only available at creation)
7. **Create** and wait until status is **Running**
8. Note the **Public IP address** — referred to as `PUBLIC_IP` below

### Open ingress (Oracle firewall)

On the instance → **Primary VNIC → Subnet → Security List → Add ingress rules:**

| Source CIDR | Protocol | Destination port | Description |
|-------------|----------|------------------|-------------|
| `0.0.0.0/0` | TCP | 22 | SSH |
| `0.0.0.0/0` | TCP | 3000 | APTSpace app (practice) |

Restrict source CIDRs in production; `0.0.0.0/0` is acceptable for a short-lived practice VM.

---

## Part 2 — SSH into the server

**Linux / macOS:**

```bash
chmod 600 /path/to/ssh-key.pem
ssh -i /path/to/ssh-key.pem ubuntu@PUBLIC_IP
```

**Windows (PowerShell):**

```powershell
icacls "C:\path\to\ssh-key.pem" /inheritance:r
icacls "C:\path\to\ssh-key.pem" /grant:r "$($env:USERNAME):(R)"
ssh -i "C:\path\to\ssh-key.pem" ubuntu@PUBLIC_IP
```

Default user for Ubuntu images on Oracle is `ubuntu`.

---

## Part 3 — Install dependencies

Run on the VM:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git mysql-server build-essential

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

node -v   # expect v20.x
npm -v

sudo npm install -g pm2

# Ubuntu firewall (if enabled)
sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp
sudo ufw --force enable
```

`build-essential` is required so native modules (e.g. `sharp` for image uploads) can build if prebuilt binaries are unavailable.

---

## Part 4 — MySQL setup

```bash
sudo mysql
```

In the MySQL shell:

```sql
CREATE DATABASE aptspace CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'aptspace_app'@'localhost' IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON aptspace.* TO 'aptspace_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Record the password — it goes in `.env` as `DB_PASSWORD`.

---

## Part 5 — Deploy the application

```bash
cd ~
git clone https://github.com/OrcaAzure/APSTPACE.git
cd APSTPACE
npm run install:server
```

### Environment file

```bash
cp .env.cloud.example client/server/.env
nano client/server/.env
```

**Required edits** (replace placeholders):

| Variable | Value |
|----------|--------|
| `DB_PASSWORD` | MySQL password from Part 4 |
| `JWT_SECRET` | Random string, **at least 32 characters** (see below) |
| `APP_URL` | `http://PUBLIC_IP:3000` |
| `ALLOWED_ORIGIN` | `http://PUBLIC_IP:3000` (must match `APP_URL` exactly) |
| `ENABLE_SEED` | `true` (first boot only — creates default admin) |
| `ENABLE_DEMO_DATA` | `true` or `false` (demo bookings; optional) |

Generate `JWT_SECRET` on any machine with Node:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Leave unchanged** unless you have a reason to change them:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
DB_HOST=127.0.0.1
DB_USER=aptspace_app
DB_NAME=aptspace
DB_SSL=false
```

SMTP can stay as localhost placeholders for practice (password reset emails will not send until real SMTP is configured).

### Import database schema

```bash
mysql -u aptspace_app -p aptspace < client/database/schema.sql
```

### Start with PM2

From the repo root (`~/APSTPACE`):

```bash
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

`pm2 startup` prints a `sudo env PATH=...` command — **run that exact command**, then:

```bash
pm2 save
```

---

## Part 6 — Verification

### From the server

```bash
curl -s http://127.0.0.1:3000/api/health
pm2 status
pm2 logs aptspace --lines 50
```

Expected health response includes `"status":"ok"` and database connected.

### From a browser (any network)

| URL | Expected |
|-----|----------|
| `http://PUBLIC_IP:3000/api/health` | JSON with `status: ok`, DB connected |
| `http://PUBLIC_IP:3000` | Login page loads |
| Login: `admin@aptspace.com` / `password` | Admin dashboard loads |

Share `http://PUBLIC_IP:3000` with the team for testing.

### After first successful admin login

Edit `client/server/.env`:

```env
ENABLE_SEED=false
ENABLE_DEMO_DATA=false
```

Then:

```bash
pm2 restart aptspace
```

**Change the admin password** in the app (Settings / account).

---

## Part 7 — Hand back to the team

Please send the project lead:

| Item | Example |
|------|---------|
| Public URL | `http://123.45.67.89:3000` |
| Health check URL | `http://123.45.67.89:3000/api/health` |
| SSH access | Who has the `.pem` key (do not email the key in plain text) |
| MySQL | DB name `aptspace`, user `aptspace_app` (password via secure channel) |
| PM2 app name | `aptspace` |
| Notes | Any errors encountered and how they were fixed |

---

## Updating the app later

```bash
cd ~/APSTPACE
git pull origin main
npm run install:server
pm2 restart aptspace
```

If the schema changed:

```bash
mysql -u aptspace_app -p aptspace < client/database/schema.sql
# Only if the team provides migration instructions — avoid wiping data on a shared practice DB
```

---

## Troubleshooting

| Problem | Likely fix |
|---------|------------|
| Browser cannot reach `PUBLIC_IP:3000` | Oracle Security List ingress for TCP 3000; `sudo ufw allow 3000/tcp` |
| `JWT_SECRET` / env validation error on start | `JWT_SECRET` must be 32+ chars; check `client/server/.env` exists |
| Database connection refused | `sudo systemctl status mysql`; verify `DB_HOST=127.0.0.1`, user/password |
| CORS or cookie issues | `APP_URL` and `ALLOWED_ORIGIN` must exactly match the URL in the browser (including `http://` and port) |
| App stops after SSH disconnect | Use PM2, not `node` directly |
| `npm install` fails on `sharp` | `sudo apt install -y build-essential` then `npm run install:server` again |
| E2.1.Micro shape unavailable | Try another region or use Ampere A1 (ARM) shape |
| Port 3000 in use | `sudo ss -tlnp \| grep 3000`; stop conflicting process or change `PORT` in `.env` and restart PM2 |

**Logs:**

```bash
pm2 logs aptspace
tail -f ~/APSTPACE/client/server/logs/aptspace-error.log
```

---

## Security reminders (practice VM)

- Use strong `DB_PASSWORD` and `JWT_SECRET`
- Change default admin password after first login
- Set `ENABLE_SEED=false` after first boot
- Do not store real personal data on this VM
- Oracle free VMs are scanned by bots — treat as internet-exposed
- This guide uses HTTP on port 3000 for practice; production should use HTTPS (reverse proxy + certificate)

---

## Sign-off checklist

- [ ] VM created on Always Free shape
- [ ] Ingress rules: TCP 22 and 3000
- [ ] Node 20, MySQL, PM2 installed
- [ ] Database `aptspace` created and schema imported
- [ ] `client/server/.env` configured with correct `PUBLIC_IP`, secrets, and `ENABLE_SEED=true`
- [ ] PM2 running and survives reboot (`pm2 startup` + `pm2 save`)
- [ ] `/api/health` returns OK from browser
- [ ] Admin login works
- [ ] `ENABLE_SEED=false` set after first login
- [ ] Public URL shared with team

---

## Related docs

| Doc | Purpose |
|-----|---------|
| [FREE-CLOUD.md](./FREE-CLOUD.md) | Overview + Docker practice on a local PC |
| [STAGING.md](./STAGING.md) | Staging prep for APTS IT / production |
| [RUN-SERVER.md](../RUN-SERVER.md) | Local development setup |
| `.env.cloud.example` | Environment template for cloud VMs |
