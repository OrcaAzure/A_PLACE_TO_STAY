#!/usr/bin/env node
/**
 * Write a standalone HTML page with a scannable demo QR code (embedded image — no CDN).
 * Usage: npm run demo:qr
 *        npm run demo:qr -- --hostname   (use PC name instead of LAN IP)
 *
 * Open http://localhost:PORT/demo-qr.html with the server running,
 * or open the generated demo-qr.html file directly.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import { getNetworkAccessUrls } from '../client/server/src/utils/networkUrls.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 3000;
const { hostname, urls } = getNetworkAccessUrls(port);

const ips = urls.filter(
  (u) => !u.includes(hostname) && !u.includes('localhost') && !u.includes('127.0.0.1'),
);
const primaryIp = ips[0]
  ? ips[0].replace('http://', '').replace(`:${port}`, '')
  : null;

// Prefer LAN IP so phones on Wi‑Fi can open the link (PC names often fail on Android).
const useHostname = process.argv.includes('--hostname');
const finalHost = useHostname ? hostname : (primaryIp || hostname);
const demoUrl = `http://${finalHost}:${port}/`;

const outRoot = path.join(root, 'demo-qr.html');
const outPublic = path.join(root, 'client', 'public', 'demo-qr.html');

const qrDataUrl = await QRCode.toDataURL(demoUrl, {
  width: 320,
  margin: 2,
  errorCorrectionLevel: 'M',
  color: { dark: '#1a365d', light: '#ffffff' },
});

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>APTSpace — Scan to open</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1.5rem;
      padding: 2rem 1.25rem;
      font-family: system-ui, -apple-system, Segoe UI, sans-serif;
      background: #1a365d;
      color: #fff;
      text-align: center;
    }
    h1 { margin: 0; font-size: clamp(1.25rem, 4vw, 1.75rem); font-weight: 700; }
    p { margin: 0; color: rgba(255,255,255,0.75); font-size: 0.9375rem; max-width: 28rem; line-height: 1.5; }
    #qr-wrap {
      background: #fff;
      padding: 1.25rem;
      border-radius: 1rem;
      line-height: 0;
      box-shadow: 0 12px 40px rgba(0,0,0,0.25);
    }
    #qr-wrap img {
      display: block;
      width: min(80vw, 320px);
      height: auto;
    }
    .url {
      font-family: ui-monospace, Consolas, monospace;
      font-size: 0.8125rem;
      word-break: break-all;
      color: #f6ad55;
      padding: 0 0.5rem;
    }
    .hint { font-size: 0.8125rem; opacity: 0.65; }
    a { color: #bee3f8; }
  </style>
</head>
<body>
  <h1>Scan to open APTSpace</h1>
  <p>Same Wi‑Fi required. Opens the landing page with the full intro.</p>
  <div id="qr-wrap">
    <img id="qr" src="${qrDataUrl}" width="320" height="320" alt="QR code linking to APTSpace demo" />
  </div>
  <p class="url">${demoUrl}</p>
  <p class="hint">Server must be running: <code>npm run dev</code></p>
  <p class="hint">This page: <a href="http://localhost:${port}/demo-qr.html">http://localhost:${port}/demo-qr.html</a></p>
</body>
</html>
`;

fs.writeFileSync(outRoot, html, 'utf8');
fs.writeFileSync(outPublic, html, 'utf8');

console.log('\nAPTSpace demo QR\n');
console.log('URL in QR:', demoUrl);
console.log('Saved:    ', outRoot);
console.log('Served as:', `http://localhost:${port}/demo-qr.html`);
console.log('\n1. Keep the server running:  npm run dev');
console.log(`2. Open the QR page:        http://localhost:${port}/demo-qr.html`);
console.log('   (hard-refresh if you still see an old blank white box)\n');
if (!useHostname && primaryIp) {
  console.log('Using LAN IP so phones can connect. For PC hostname instead:');
  console.log('  npm run demo:qr -- --hostname\n');
} else if (!primaryIp) {
  console.log('No LAN IP found — QR uses hostname. Phones may need Wi‑Fi + firewall access.\n');
}
