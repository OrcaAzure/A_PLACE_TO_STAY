import os from 'os';

/**
 * URLs others on the same Wi‑Fi can use to reach this machine.
 * @param {number} port
 */
export function getNetworkAccessUrls(port) {
  const hostname = os.hostname();
  const urls = new Set([
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    `http://${hostname}:${port}`,
    `http://${hostname}.local:${port}`,
  ]);

  const ifaces = os.networkInterfaces();
  for (const addrs of Object.values(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        urls.add(`http://${addr.address}:${port}`);
      }
    }
  }

  return { hostname, urls: [...urls] };
}

/** Log LAN URLs when the server starts (local network access). */
export function printNetworkAccessUrls(port) {
  const { hostname, urls } = getNetworkAccessUrls(port);
  const ips = urls.filter((u) => !u.includes(hostname) && !u.includes('localhost') && !u.includes('127.0.0.1'));

  console.log('[server] ── LAN URLs (same network) ──');
  console.log(`[server]   By name:  http://${hostname}:${port}`);
  console.log(`[server]   mDNS:     http://${hostname}.local:${port}  (iPhone/Mac)`);
  ips.forEach((u) => console.log(`[server]   By IP:    ${u}`));
  console.log('[server] Allow port in Windows Firewall; set network profile to Private.');
  console.log('[server] Optional .env: APP_URL=http://' + hostname + ':' + port);
}
