import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = path.join(root, '.env.staging.example');
const target = path.join(root, 'client/server/.env.staging');
const logsDir = path.join(root, 'client/server/logs');

fs.mkdirSync(logsDir, { recursive: true });

console.log('AptSpace staging setup\n');
console.log('This does NOT change your local dev .env — npm run dev still uses client/server/.env\n');

if (!fs.existsSync(target)) {
  fs.copyFileSync(example, target);
  console.log('Created client/server/.env.staging from .env.staging.example');
} else {
  console.log('client/server/.env.staging already exists — skipped copy');
}

console.log('\nFill in values from APTS IT when available.');
console.log('Test production-mode locally (optional):  npm run start:staging');
console.log('On the staging server, copy this file to .env:');
console.log('  cp client/server/.env.staging client/server/.env');
