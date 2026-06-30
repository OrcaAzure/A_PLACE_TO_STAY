import app from './app.js';
import { testConnection, closePool } from './config/db.js';
import { runSeed } from './config/seed.js';
import { validateEnv } from './config/validateEnv.js';
import { PORT, HOST, isProduction } from './config/env.js';

async function start() {
  validateEnv();

  try {
    await testConnection();
    console.log(`[db] Connected to MySQL`);
  } catch (err) {
    console.error('[db] Cannot connect to MySQL. Check client/server/.env and that the schema is imported.');
    console.error(`[db] ${err.message}`);
    process.exit(1);
  }

  try {
    await runSeed();
  } catch (err) {
    console.error('[seed] Failed:', err.message);
    if (isProduction) process.exit(1);
  }

  const port = Number(PORT) || 3000;
  const host = HOST || '0.0.0.0';

  const server = app.listen(port, host, () => {
    console.log(`[server] ${isProduction ? 'Production' : 'Development'} mode`);
    console.log(`[server] Listening on http://${host}:${port}`);
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
