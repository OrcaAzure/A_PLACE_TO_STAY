/**
 * Validates the staging env file is ready to deploy.
 * Checks client/server/.env.staging (create with npm run setup:staging).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stagingEnv = path.join(root, 'client/server/.env.staging');

const REQUIRED = [
  'NODE_ENV',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'JWT_SECRET',
  'APP_URL',
  'ALLOWED_ORIGIN',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
];

const PLACEHOLDERS = [
  'ASK_IT',
  'GENERATE_A_NEW',
  'CHANGE_ME',
  'your_smtp',
  'smtp.example.com',
];

function parseEnv(content) {
  const map = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    map[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return map;
}

const checks = [];
const pass = (m) => checks.push({ ok: true, msg: m });
const fail = (m) => checks.push({ ok: false, msg: m });

if (!fs.existsSync(stagingEnv)) {
  fail('client/server/.env.staging missing — run: npm run setup:staging');
} else {
  pass('client/server/.env.staging exists');
  const vars = parseEnv(fs.readFileSync(stagingEnv, 'utf8'));

  for (const key of REQUIRED) {
    const val = vars[key];
    if (!val) {
      fail(`${key} is not set`);
      continue;
    }
    if (PLACEHOLDERS.some((p) => val.includes(p))) {
      fail(`${key} still has placeholder value — get from IT`);
    } else {
      pass(`${key} looks configured`);
    }
  }

  if (vars.NODE_ENV !== 'production') {
    fail('NODE_ENV should be production on staging');
  }
  if (vars.APP_URL && !vars.APP_URL.startsWith('https://')) {
    fail('APP_URL should use https:// on staging');
  }
  if (vars.JWT_SECRET && vars.JWT_SECRET.length < 32) {
    fail('JWT_SECRET must be at least 32 characters');
  }
}

console.log('\nAptSpace staging config verification\n');
for (const c of checks) {
  console.log(`${c.ok ? '✓' : '✗'} ${c.msg}`);
}

const failed = checks.filter((c) => !c.ok).length;
if (!failed) {
  console.log('\nStaging env looks ready. On the server: cp client/server/.env.staging client/server/.env');
} else {
  console.log(`\n${failed} item(s) still need IT values or your input.`);
}
process.exit(failed ? 1 : 0);
