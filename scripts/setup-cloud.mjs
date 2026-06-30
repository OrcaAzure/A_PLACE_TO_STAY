import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = path.join(root, '.env.cloud.example');
const target = path.join(root, 'client/server/.env.cloud');

let content = fs.readFileSync(example, 'utf8');
const secret = crypto.randomBytes(48).toString('hex');
content = content.replace('JWT_SECRET=GENERATE_48_CHAR_HEX_SECRET', `JWT_SECRET=${secret}`);

fs.writeFileSync(target, content, 'utf8');

console.log('Created client/server/.env.cloud (with generated JWT_SECRET)\n');
console.log('Edit YOUR_PUBLIC_IP and DB_PASSWORD before deploying to Oracle Cloud.');
console.log('On the VM:  cp client/server/.env.cloud client/server/.env');
console.log('\nPractice locally with Docker first:  npm run docker:up');
