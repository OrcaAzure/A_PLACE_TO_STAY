import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = path.join(root, '.env.example');
const target = path.join(root, 'client/server/.env');

console.log('AptSpace setup\n');

if (!fs.existsSync(target)) {
  fs.copyFileSync(example, target);
  console.log('Created client/server/.env from .env.example');
} else {
  console.log('client/server/.env already exists — skipped copy');
}

console.log('\nNext steps:');
console.log('  1. Edit client/server/.env (DB credentials, JWT_SECRET, SMTP if needed)');
console.log('  2. Import schema:  mysql -u root -p < client/database/schema.sql');
console.log('  3. Install deps:   npm run install:server');
console.log('  4. Start server:   npm run dev');
console.log('\nHealth check after start:  http://localhost:3000/api/health');
