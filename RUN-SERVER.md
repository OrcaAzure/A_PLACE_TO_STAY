# How to Run APTSpace

Step-by-step guide for **running the server** on your computer.

---

## Prerequisites (install once)

| Software | Version | Download |
|----------|---------|----------|
| **Node.js** | 18+ | https://nodejs.org/ (LTS) |
| **MySQL** | 8.x | https://dev.mysql.com/downloads/ or XAMPP |

Check: `node -v` and `npm -v` should print versions. **Start MySQL** before running the app (XAMPP → Start MySQL).

---

## First-time setup (once per machine)

```bash
npm run setup -- --install
```

This copies `client/server/.env`, installs dependencies, and creates log folders.

1. **MySQL password** — if needed, edit `client/server/.env`:
   ```env
   DB_PASSWORD=your_password
   ```
   (Leave empty for XAMPP with no password.)

2. **Create database:**
   ```bash
   mysql -u root -p < client/database/schema.sql
   ```
   No password: `mysql -u root < client/database/schema.sql`  
   XAMPP path: `C:\xampp\mysql\bin\mysql -u root < client\database\schema.sql`

3. **Verify:**
   ```bash
   npm run verify
   ```
   All lines should show **✓**.

---

## Start the server

```bash
npm run dev
```

Wait for `[server] Listening on http://0.0.0.0:3000`, then open **http://localhost:3000**.

**Stop:** `Ctrl + C` in the terminal.

---

## Login accounts (development)

Password for all: **`password`**

| Role | Email |
|------|-------|
| **Admin** | `admin@aptspace.com` |
| **Guest** | `maria.santos@apts.edu.ph` (only with `ENABLE_DEMO_DATA=true`) |

Only the admin accounts are seeded by default. Demo guest accounts and sample bookings are created only when `ENABLE_DEMO_DATA=true` is set in `client/server/.env`.

---

## Quick checklist

- [ ] http://localhost:3000 loads  
- [ ] http://localhost:3000/api/health → `"status": "ok"`  
- [ ] Admin login → dashboard loads  
- [ ] Guest login → reservations / facilities work  

---

## LAN access (optional)

With the server running, the terminal prints LAN URLs for other devices on the same network.

Allow port **3000** in Windows Firewall if needed. Network profile should be **Private**.

---

## Docker (optional — skip local MySQL)

```bash
npm run docker:up    # start
npm run docker:down  # stop
```

Open http://localhost:3000 — same logins.

---

## Common problems

| Problem | Fix |
|---------|-----|
| Cannot connect to MySQL | Start MySQL; check `DB_PASSWORD` in `.env`; re-import `schema.sql` |
| Port 3000 in use | Set `PORT=3001` in `.env`, restart |
| `npm run verify` fails JWT | Set `JWT_SECRET=local_dev_secret_at_least_32_characters_long` in `.env` |
| Login fails | Check `/api/health`; restart with `npm run dev` |
| `mysql` not found | Use full XAMPP path (see setup step 2) |

---

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start server |
| `npm run verify` | Pre-flight check |
| `npm run setup -- --install` | First-time env + dependencies |
| `npm run docker:up` | Start with Docker |

**Developer docs:** `README.md`

---

*APTSpace — Asia Pacific Theological Seminary*
