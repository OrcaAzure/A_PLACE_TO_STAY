# How to Run AptSpace (Server Guide)

Hi! This guide is for **running the AptSpace server on your computer**. You do not need to write code — just follow the steps below.

AptSpace is the APTS housing and room booking web app. Once the server is running, open it in Chrome or Edge.

---

## What you need installed first

Install these **once** before starting:

| Software | Version | Download |
|----------|---------|----------|
| **Node.js** | 18 or newer | https://nodejs.org/ (choose LTS) |
| **MySQL** | 8.x | https://dev.mysql.com/downloads/installer/ (Windows) or use XAMPP MySQL |
| **Git** | any recent | https://git-scm.com/downloads |

After installing Node, open a terminal and check:

```bash
node -v
npm -v
```

You should see version numbers (e.g. `v20.x.x`).

**MySQL must be running** before you start the app.  
- If you use **XAMPP**: open XAMPP Control Panel → start **MySQL**.  
- If you use **MySQL Installer**: the MySQL service should run automatically.

---

## First-time setup (do this once)

### 1. Get the project

```bash
git clone https://github.com/OrcaAzure/APSTPACE.git
cd APSTPACE
```

(If you already have the folder, just `cd` into it and run `git pull` to get the latest code.)

### 2. Run setup

```bash
npm run setup
npm run install:server
```

This creates config files and installs dependencies. It may take a few minutes.

### 3. Configure database password (if needed)

Open the file:

```
client/server/.env
```

If your MySQL `root` user has a password, set:

```env
DB_PASSWORD=your_mysql_password_here
```

If MySQL has **no** password (common on XAMPP), leave `DB_PASSWORD=` empty.

### 4. Create the database

**Windows (Command Prompt or PowerShell)** — from the project folder:

```bash
mysql -u root -p < client/database/schema.sql
```

(If no password, try: `mysql -u root < client/database/schema.sql`)

**If `mysql` is not found:** use the full path, e.g.  
`C:\xampp\mysql\bin\mysql -u root < client\database\schema.sql`

### 5. Check everything is OK

```bash
npm run verify
```

You want all lines to show **✓**. If MySQL fails, fix step 3–4 before continuing.

---

## Start the server (every time)

From the project folder:

```bash
npm run dev
```

Wait until you see something like:

```
[server] Listening on http://0.0.0.0:3000
```

Then open in your browser:

**http://localhost:3000**

### Stop the server

Press **Ctrl + C** in the terminal where `npm run dev` is running.

---

## Login accounts (development)

On first start, the server creates demo users automatically.

| Role | Email | Password |
|------|-------|----------|
| **Admin** | `admin@aptspace.com` | `password` |
| **Guest (Faculty)** | `maria.santos@apts.edu.ph` | `password` |

**Admin** → goes to the admin dashboard (bookings, rooms, payments).  
**Guest** → goes to the guest portal (make reservations).

---

## Quick test checklist

After the server starts, try these:

- [ ] Landing page loads at http://localhost:3000  
- [ ] Health check: http://localhost:3000/api/health → should say `"status": "ok"`  
- [ ] Login as admin → dashboard shows numbers (not stuck on "LOADING")  
- [ ] Login as guest → reservations page loads  

---

## Easier option: Docker (no MySQL install)

If you have **Docker Desktop** installed, you can skip MySQL setup:

```bash
npm run docker:up
```

Open http://localhost:3000 — same logins as above.

Stop:

```bash
npm run docker:down
```

---

## Connect from another computer (same Wi‑Fi)

If someone else on your network wants to test **your** running server:

1. Find your PC’s IP address:
   - **Windows:** open CMD → `ipconfig` → look for `IPv4 Address` (e.g. `192.168.1.45`)
2. They open: `http://YOUR_IP:3000` (e.g. `http://192.168.1.45:3000`)
3. You may need to allow port **3000** in Windows Firewall.
4. Edit `client/server/.env` and add your IP:
   ```env
   ALLOWED_ORIGIN=http://localhost:3000,http://192.168.1.45:3000
   APP_URL=http://192.168.1.45:3000
   ```
5. Restart the server (`Ctrl+C`, then `npm run dev` again).

---

## Common problems

### `Cannot connect to MySQL`

- Start MySQL in XAMPP (or check Windows Services for MySQL).
- Check `DB_PASSWORD` in `client/server/.env`.
- Re-run: `mysql -u root -p < client/database/schema.sql`

### `Port 3000 already in use`

Something else is using port 3000. Either close that program, or change in `.env`:

```env
PORT=3001
```

Then open http://localhost:3001

### `npm run verify` fails on JWT_SECRET

Edit `client/server/.env` — `JWT_SECRET` can be any long random string for local dev, e.g.:

```env
JWT_SECRET=local_dev_secret_at_least_32_characters_long
```

### Page loads but login fails

- Make sure the server terminal shows no red errors.
- Try http://localhost:3000/api/health — if DB is disconnected, fix MySQL first.
- Stop server, run `npm run dev` again (seeds users on first boot if missing).

### `mysql` command not found

Use the full path to MySQL from XAMPP or MySQL Installer (see step 4 above).

---

## Useful commands (cheat sheet)

| Command | What it does |
|---------|----------------|
| `npm run dev` | Start server (normal development) |
| `npm run verify` | Check if setup is correct |
| `npm run docker:up` | Start with Docker (no local MySQL needed) |
| `npm run docker:down` | Stop Docker stack |
| `Ctrl + C` | Stop the running server |

---

## Project folders (if you're curious)

```
APSTPACE/
├── client/server/.env     ← your config (passwords — do not share publicly)
├── client/database/       ← database schema
├── client/server/views/   ← app pages (admin, guest, login)
└── client/public/assets/  ← CSS, JavaScript, images
```

---

## Need help?

1. Run `npm run verify` and note which lines show **✗**  
2. Copy any **red error text** from the terminal  
3. Ask the team (or the person who sent you this file) with that info  

**Full developer docs:** see `README.md` in the same folder.

---

*AptSpace — Asia Pacific Theological Seminary · housing & accommodation management*
