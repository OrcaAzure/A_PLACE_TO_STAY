#!/usr/bin/env node
/**
 * Write a standalone HTML page with a scannable demo QR code.
 * Usage: npm run demo:qr
 *        npm run demo:qr -- --ip   (use LAN IP if PC name fails on phones)
 *
 * Open demo-qr.html in a browser (full screen for guests to scan).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

const useIp = process.argv.includes('--ip');
const host = useIp && primaryIp ? primaryIp : hostname;
const demoUrl = `http://${host}:${port}/?skipIntro=1`;
const outFile = path.join(root, 'demo-qr.html');

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
    }
    canvas { display: block; max-width: min(80vw, 320px); height: auto !important; }
    .url {
      font-family: ui-monospace, Consolas, monospace;
      font-size: 0.8125rem;
      word-break: break-all;
      color: #f6ad55;
      padding: 0 0.5rem;
    }
    .hint { font-size: 0.8125rem; opacity: 0.65; }
  </style>
</head>
<body>
  <h1>Scan to open APTSpace</h1>
  <p>Same Wi‑Fi required. Opens the landing page (intro skipped).</p>
  <div id="qr-wrap"><canvas id="qr"></canvas></div>
  <p class="url">${demoUrl}</p>
  <p class="hint">Server must be running: <code>npm run dev</code></p>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js"><\/script>
  <script>
    QRCode.toCanvas(document.getElementById('qr'), ${JSON.stringify(demoUrl)}, {
      width: 320,
      margin: 2,
      color: { dark: '#1a365d', light: '#ffffff' },
    });
  <\/script>
</body>
</html>
`;

fs.writeFileSync(outFile, html, 'utf8');

console.log('\nAPTSpace demo QR\n');
console.log('URL in QR:', demoUrl);
console.log('Saved:    ', outFile);
console.log('\nOpen demo-qr.html in your browser (full screen) for guests to scan.');
if (!useIp && primaryIp) {
  console.log('If phones cannot open the link, regenerate with IP: npm run demo:qr -- --ip');
}
console.log(`With server running, also visit: http://localhost:${port}/demo-qr.html\n`);
