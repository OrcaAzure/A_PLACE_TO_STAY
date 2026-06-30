import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = path.join(root, '.env.staging.local.example');
const target = path.join(root, 'client/server/.env.staging.local');

console.log('AptSpace — local staging practice setup\n');

let content = fs.readFileSync(example, 'utf8');

// Inject a real JWT secret so production validation passes out of the box
const secret = crypto.randomBytes(48).toString('hex');
content = content.replace(
  'JWT_SECRET=local_staging_practice_replace_with_generated_secret_min_32_chars',
  `JWT_SECRET=${secret}`
);

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, content, 'utf8');

console.log('Created client/server/.env.staging.local');
console.log('\n1. Create staging database (once):');
console.log('   mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS aptspace_staging;"');
console.log('   mysql -u root -p aptspace_staging < client/database/schema.sql');
console.log('\n2. Edit client/server/.env.staging.local if your MySQL user/password differs');
console.log('\n3. Run staging practice server:');
console.log('   npm run start:staging:local');
console.log('\n4. Open http://localhost:3001  (port 3001 — dev on 3000 can run at the same time)');
console.log('\n5. After first login works, set ENABLE_SEED=false in .env.staging.local');
