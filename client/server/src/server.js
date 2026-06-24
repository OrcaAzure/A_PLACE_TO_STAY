import app from './app.js';
import { testConnection } from './config/db.js';
import { runSeed } from './config/seed.js';
import { PORT } from './config/env.js';

async function start() {
  try {
    await testConnection();
    console.log(`[db] Connected to MySQL (${process.env.DB_NAME || 'aptspace'})`);
  } catch (err) {
    console.error('[db] Cannot connect to MySQL. Check client/server/.env and that the schema is imported.');
    console.error(`[db] ${err.message}`);
    process.exit(1);
  }

  try {
    await runSeed();
  } catch (err) {
    console.error('[seed] Failed:', err.message);
  }

  app.listen(PORT || 3000, () => {
    console.log(`[server] Running at http://localhost:${PORT || 3000}`);
  });
}

start();
