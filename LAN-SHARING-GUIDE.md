# Share AptSpace on Your Local Wi‑Fi (One Laptop as Server)

Hi! This guide explains how we run **one laptop as the server** and let **teammates on the same Wi‑Fi** open the app in their browser — no cloud hosting needed for testing.

Think of it like this:

```
┌─────────────────────────────┐
│  Server laptop (yours)      │
│  • MySQL database           │
│  • Node.js app (port 3000)  │
│  • IP e.g. 192.168.1.45     │
└──────────────┬──────────────┘
               │  same Wi‑Fi / LAN
    ┌──────────┼──────────┐
    ▼          ▼          ▼
 Friend A   Friend B   Your phone
 (browser)  (browser)  (browser)
```

Everyone visits: **`http://YOUR_LAPTOP_IP:3000`**

---

## What you need

| On the **server laptop** | On **other devices** |
|--------------------------|----------------------|
| Node.js 18+ | Any phone/laptop on the **same Wi‑Fi** |
| MySQL 8+ (or Docker) | Chrome, Edge, or Safari |
| The AptSpace project folder | Nothing else to install |

Full first-time setup (clone repo, database, etc.) is in **[RUN-SERVER.md](RUN-SERVER.md)**.

---

## Part 1 — Server laptop (the “host”)

### Step 1: Start the app

From the project folder:

```bash
npm run dev
```

Wait until you see:

```text
[server] Listening on http://0.0.0.0:3000
```

**Why `0.0.0.0`?**  
That tells Node to listen on **all network interfaces**, not only `localhost`. So other devices on your Wi‑Fi can reach the laptop. This is already set in `.env.example`:

```env
HOST=0.0.0.0
PORT=3000
```

Test on the server laptop first: **http://localhost:3000**

---

### Step 2: Find your laptop’s IP address

**Windows**

1. Open **Command Prompt** or **PowerShell**
2. Run: `ipconfig`
3. Under your Wi‑Fi adapter, copy **IPv4 Address** (example: `192.168.1.45`)

**Mac**

1. System Settings → Network → Wi‑Fi → Details → IP address  
   **or** Terminal: `ipconfig getifaddr en0`

**Important:** Use the **Wi‑Fi** IP, not a VPN or virtual adapter IP.

Your share link will be:

```text
http://192.168.1.45:3000
```

(Replace with your real IP.)

---

### Step 3: Allow the app through Windows Firewall

Windows often blocks incoming connections on port **3000** the first time.

**Quick test:** On another device, try opening `http://YOUR_IP:3000`. If it times out, allow the port:

1. Windows search → **Windows Defender Firewall** → **Advanced settings**
2. **Inbound Rules** → **New Rule…**
3. **Port** → TCP → **3000**
4. **Allow the connection** → apply to Private (and Domain if needed) → name it e.g. `AptSpace 3000`

**Or** when Node/npm first tries to listen, Windows may show a popup — click **Allow access** on private networks.

---

### Step 4: Update `client/server/.env` for LAN access

Open:

```text
client/server/.env
```

Add your laptop IP to the allowed origins (comma-separated). Example if your IP is `192.168.1.45`:

```env
HOST=0.0.0.0
PORT=3000

ALLOWED_ORIGIN=http://localhost:3000,http://192.168.1.45:3000
APP_URL=http://192.168.1.45:3000
```

| Setting | Why |
|---------|-----|
| `HOST=0.0.0.0` | Accept connections from other devices |
| `ALLOWED_ORIGIN=...` | Browser security (CORS) — must include the exact URL friends use |
| `APP_URL=...` | Password-reset and email links point to the right address |

**Restart the server** after editing `.env`:

1. In the terminal running the app: **Ctrl + C**
2. Run again: `npm run dev`

---

### Step 5: Share the link

Send your friend:

```text
http://192.168.1.45:3000
```

**Demo logins** (development only):

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@aptspace.com` | `password` |
| Guest | `maria.santos@apts.edu.ph` | `password` |

---

## Part 2 — Friend’s laptop or phone (the “client”)

No install needed.

1. Connect to the **same Wi‑Fi** as the server laptop (not guest Wi‑Fi that isolates devices).
2. Open a browser.
3. Go to: `http://SERVER_IP:3000` (the link you were sent).
4. Log in and use the app normally.

**Tip:** Bookmark the link while testing.

---

## Alternative: Docker on the server laptop

If you use Docker instead of a local MySQL install:

```bash
npm run docker:up
```

Then still do **Steps 2–4** above (IP, firewall, `.env`).

For Docker, you can also edit `docker-compose.yml` before `docker:up`:

```yaml
APP_URL: http://192.168.1.45:3000
ALLOWED_ORIGIN: http://localhost:3000,http://192.168.1.45:3000
```

Stop Docker when done:

```bash
npm run docker:down
```

---

## Quick health check

On the **server laptop**:

- http://localhost:3000/api/health → should show `"status": "ok"`

On a **friend’s device** (replace IP):

- http://192.168.1.45:3000/api/health → same result

If localhost works but the IP does not → **firewall** or wrong IP.

If the page loads but login/API fails → check **`ALLOWED_ORIGIN`** includes the exact URL (with `http://` and port).

---

## Troubleshooting

### “This site can’t be reached” / connection timed out

- Server laptop: is `npm run dev` still running?
- Same Wi‑Fi on both devices?
- Windows Firewall allowed port **3000**?
- IP address changed? (Wi‑Fi reconnect can assign a new IP — run `ipconfig` again)

### Page loads but login or data doesn’t work

- Update `ALLOWED_ORIGIN` in `client/server/.env` to include `http://YOUR_IP:3000`
- Restart the server
- Hard refresh the browser: **Ctrl + Shift + R**

### IP address keeps changing

- Your router may use DHCP. Each time you reconnect, check `ipconfig` and update `.env` + tell friends the new link.
- For longer demos, ask IT to reserve a **static IP** for the server laptop (optional).

### Works on server laptop but not on phone

- Some public/guest Wi‑Fi blocks device-to-device traffic. Use a **home or office private Wi‑Fi**.

### `Port 3000 already in use`

Change in `.env`:

```env
PORT=3001
```

Then share `http://YOUR_IP:3001` and add that URL to `ALLOWED_ORIGIN` too.

---

## Security notes (please read)

This setup is for **local team testing**, not public internet:

- Do **not** expose port 3000 on the public internet without HTTPS and proper hardening.
- Default passwords (`password`) are for **development only**.
- Do **not** commit `client/server/.env` to Git — it contains secrets.

---

## Cheat sheet

| Who | Action |
|-----|--------|
| **Server** | `npm run dev` → note IP → allow firewall → edit `.env` → share link |
| **Friends** | Same Wi‑Fi → open `http://SERVER_IP:3000` in browser |
| **Stop** | Server: **Ctrl + C** in terminal |

---

## More help

- First-time install: **[RUN-SERVER.md](RUN-SERVER.md)**
- Full project docs: **[README.md](README.md)**

If something breaks, send:

1. Output of `npm run verify`
2. The red error text from the server terminal
3. Whether `http://localhost:3000/api/health` works on the server laptop

---

*AptSpace — Asia Pacific Theological Seminary · local Wi‑Fi testing guide*
