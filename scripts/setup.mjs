import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = path.join(root, '.env.example');
const target = path.join(root, 'client/server/.env');
const withInstall = process.argv.includes('--install');

const logsDir = path.join(root, 'client/server/logs');
fs.mkdirSync(logsDir, { recursive: true });

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log('APTSpace setup\n');

if (!fs.existsSync(target)) {
  fs.copyFileSync(example, target);
  console.log('Created client/server/.env from .env.example');
} else {
  console.log('client/server/.env already exists — skipped copy');
}

if (withInstall) {
  console.log('\nInstalling server dependencies…');
  run('npm', ['run', 'install:server']);
}

console.log('\nNext steps:');
if (!withInstall) {
  console.log('  1. Install deps:   npm run install:server');
  console.log('     (or: npm run setup -- --install)');
} else {
  console.log('  1. Dependencies installed');
}
console.log('  2. Edit client/server/.env if MySQL has a password');
console.log('  3. Import schema:  mysql -u root -p < client/database/schema.sql');
console.log('  4. Check setup:    npm run verify');
console.log('  5. Start server:   npm run dev');
console.log('\nHealth check after start:  http://localhost:3000/api/health');
