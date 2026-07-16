import app from './app.js';
import { testConnection, closePool } from './config/db.js';
import { runSeed } from './seed/index.js';
import { validateEnv } from './config/validateEnv.js';
import { PORT, HOST, isProduction, UI_ONLY } from './config/env.js';
import { printNetworkAccessUrls } from './utils/networkUrls.js';

async function start() {
  validateEnv();

  if (UI_ONLY) {
    console.warn('[server] UI_ONLY mode — MySQL skipped; API data calls will not work.');
  } else {
    try {
      await testConnection();
      console.log(`[db] Connected to MySQL`);
    } catch (err) {
      console.error('[db] Cannot connect to MySQL. Check client/server/.env and that the schema is imported.');
      console.error(`[db] ${err.message}`);
      console.error('[db] Tip: run `npm run dev:ui` from the project root to preview pages without MySQL.');
      process.exit(1);
    }

    try {
      await runSeed();
    } catch (err) {
      console.error('[seed] Failed:', err.message);
      if (isProduction) process.exit(1);
    }
  }

  const port = Number(PORT) || 3000;
  const host = HOST || '0.0.0.0';

  const server = app.listen(port, host, () => {
    console.log(`[server] ${isProduction ? 'Production' : 'Development'} mode${UI_ONLY ? ' (UI_ONLY)' : ''}`);
    console.log(`[server] Listening on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    if (!isProduction) {
      printNetworkAccessUrls(port);
    }
    if (UI_ONLY) {
      console.log('[server] UI preview — open /?skipIntro=1, /login.html, /guest/dashboard.html, /admin/dashboard.html');
      console.log('[server] Data APIs and login are disabled without MySQL.');
    }
    console.log(`[server] Request logging enabled (API +${isProduction ? '' : ' page hits in dev'})`);
  });

  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received — shutting down`);
    server.close(async () => {
      try {
        await closePool();
        console.log('[db] Pool closed');
      } catch (err) {
        console.error('[db] Pool close error:', err.message);
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
