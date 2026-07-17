/**
 * Quick readiness check for local development.
 * Does not modify any files.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, 'client/server/.env');
const schemaPath = path.join(root, 'client/database/schema.sql');
const serverModules = path.join(root, 'client/server/node_modules');

const checks = [];

function pass(msg) { checks.push({ ok: true, msg }); }
function fail(msg) { checks.push({ ok: false, msg }); }

if (fs.existsSync(envPath)) {
  pass('client/server/.env exists');
  const env = fs.readFileSync(envPath, 'utf8');
  for (const key of ['DB_HOST', 'DB_NAME', 'JWT_SECRET']) {
    if (new RegExp(`^${key}=.+`, 'm').test(env) && !new RegExp(`^${key}=\\s*$`, 'm').test(env)) {
      pass(`${key} is set`);
    } else {
      fail(`${key} is missing or empty in .env`);
    }
  }
} else {
  fail('client/server/.env missing — run: npm run setup');
}

if (fs.existsSync(schemaPath)) pass('database/schema.sql exists');
else fail('database/schema.sql missing');

if (fs.existsSync(serverModules)) pass('server dependencies installed');
else fail('server dependencies missing — run: npm run install:server');

// Optional live DB check (only if .env exists)
if (fs.existsSync(envPath)) {
  process.env.ENV_FILE = '.env';
  try {
    const { testConnection, closePool } = await import('../client/server/src/config/db.js');
    await testConnection();
    await closePool();
    pass('MySQL connection successful');
  } catch (err) {
    fail(`MySQL connection failed: ${err.message}`);
  }
}

console.log('\nAPTSpace local verification\n');
for (const c of checks) {
  console.log(`${c.ok ? '✓' : '✗'} ${c.msg}`);
}

const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} issue(s) — fix before running the server.` : '\nAll checks passed. Run: npm run dev');
process.exit(failed ? 1 : 0);
