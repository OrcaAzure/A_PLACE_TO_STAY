# How to Run APTSpace (Server Guide)

Hi! This guide is for **running the APTSpace server on your computer**. You do not need to write code — just follow the steps below.

APTSpace is the APTS housing and room booking web app. Once the server is running, open it in Chrome or Edge.

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

1. Start the server (`npm run dev`). The terminal prints **Wi‑Fi demo URLs**, including:
   - **By name:** `http://YOUR-PC-NAME:3000` (e.g. `http://DESKTOP-ABC:3000`)
   - **mDNS:** `http://YOUR-PC-NAME.local:3000` (often works on iPhone/Mac)
   - **By IP:** `http://192.168.x.x:3000`
2. Or run anytime: `npm run demo:urls`
3. On your PC, set the network profile to **Private** and allow port **3000** in Windows Firewall if prompted.
4. Guests on the same Wi‑Fi open the **name** or **IP** URL in their phone browser.

**Tip — easier name than IP:** Use your Windows computer name (Settings → System → About → **Device name**). Many phones accept `http://DeviceName:3000` or `http://DeviceName.local:3000` without typing the IP.

5. Optional — edit `client/server/.env` for links and CORS if you use a custom hostname:
   ```env
   ALLOWED_ORIGIN=http://localhost:3000,http://192.168.1.45:3000,http://YOUR-PC-NAME:3000
   APP_URL=http://YOUR-PC-NAME:3000
   ```
6. Restart the server (`Ctrl+C`, then `npm run dev` again).

**Note:** A custom domain like `aptspace.demo` only works if you add it to each device’s hosts file or run a local DNS server — for presentations, the PC name or `.local` URL is simplest.

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

## Preview UIs without MySQL (design / layout only)

If you only want to **see pages and animations** and do not need login or real data:

```bash
npm run dev:ui
```

Then open:

| URL | What you see |
|-----|----------------|
| http://localhost:3000/?skipIntro=1 | Landing page (skips preloader + welcome) |
| http://localhost:3000/ | Full landing (with intro animations) |
| http://localhost:3000/login.html | Login screen |
| http://localhost:3000/guest/dashboard.html | Guest portal layout |
| http://localhost:3000/guest/facilities.html | Browse facilities UI |
| http://localhost:3000/admin/dashboard.html | Admin portal layout |

**Limits in UI-only mode:** MySQL is not used. Login, bookings, and API data will not work — pages may show empty lists or errors in the browser console. Use `npm run dev` with MySQL for full functionality.

**Landing-only (no server):** from the project folder:

```bash
npx --yes serve client/public -l 3456
```

Open http://localhost:3456/?skipIntro=1 — landing and legal pages only (no guest/admin app pages).

---

## Useful commands (cheat sheet)

| Command | What it does |
|---------|----------------|
| `npm run dev` | Start server (normal development — needs MySQL) |
| `npm run dev:ui` | Start server **without MySQL** — UI/layout preview only |
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

*APTSpace — Asia Pacific Theological Seminary · housing & accommodation management*
