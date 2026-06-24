import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'client/public');
const VIEWS = path.join(ROOT, 'client/server/views');

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copy(src, dst) {
  mkdirp(path.dirname(dst));
  fs.copyFileSync(src, dst);
}

function write(dst, content) {
  mkdirp(path.dirname(dst));
  fs.writeFileSync(dst, content, 'utf8');
}

function patchJs(content) {
  return content
    .replaceAll("from './manage-requests.js'", "from '/assets/js/features/manage-requests.js'")
    .replaceAll("from './ui.js'", "from '/assets/js/layout/ui.js'")
    .replaceAll("from './api.js'", "from '/assets/js/services/api.js'")
    .replaceAll("from './auth.js'", "from '/assets/js/services/auth.js'")
    .replaceAll("from './timeline.js'", "from '/assets/js/features/timeline.js'")
    .replaceAll("from '../ui.js'", "from '/assets/js/layout/ui.js'")
    .replaceAll("from '../api.js'", "from '/assets/js/services/api.js'")
    .replaceAll("from '../auth.js'", "from '/assets/js/services/auth.js'")
    .replaceAll('loadComponent(`${base}components/', 'loadComponent(`/components/')
    .replaceAll('window.location.href = `${base}login.html`', "window.location.href = '/login.html'");
}

function patchHtml(content) {
  return content
    .replaceAll('../assets/js/tailwind-config.js', '/assets/js/config/tailwind-admin.js')
    .replaceAll('./assets/js/tailwind-config.js', '/assets/js/config/tailwind-admin.js')
    .replaceAll('../assets/css/main.css', '/assets/css/global/main.css')
    .replaceAll('./assets/css/main.css', '/assets/css/global/main.css')
    .replaceAll('../assets/css/components.css', '/assets/css/components/components.css')
    .replaceAll('../assets/css/responsive.css', '/assets/css/global/responsive.css')
    .replaceAll('../assets/css/manage-requests-modal.css', '/assets/css/features/manage-requests-modal.css')
    .replaceAll("from '../assets/js/auth.js'", "from '/assets/js/services/auth.js'")
    .replaceAll("from '../assets/js/ui.js'", "from '/assets/js/layout/ui.js'")
    .replaceAll("from '../assets/js/api.js'", "from '/assets/js/services/api.js'")
    .replaceAll("from '../assets/js/dashboard.js'", "from '/assets/js/features/dashboard.js'")
    .replaceAll("from '../assets/js/settings.js'", "from '/assets/js/features/settings.js'")
    .replaceAll("from '../assets/js/timeline.js'", "from '/assets/js/features/timeline.js'")
    .replaceAll("from './assets/js/auth.js'", "from '/assets/js/services/auth.js'")
    .replaceAll("from './assets/js/api.js'", "from '/assets/js/services/api.js'")
    .replaceAll("fetch('../components/", "fetch('/components/");
}

// CSS
const css = [
  ['assets/css/main.css', 'assets/css/global/main.css'],
  ['assets/css/responsive.css', 'assets/css/global/responsive.css'],
  ['assets/css/components.css', 'assets/css/components/components.css'],
  ['assets/css/manage-requests-modal.css', 'assets/css/features/manage-requests-modal.css'],
];
for (const [from, to] of css) {
  copy(path.join(PUBLIC, from), path.join(PUBLIC, to));
}

// JS
const js = [
  ['assets/js/tailwind-config.js', 'assets/js/config/tailwind-admin.js'],
  ['assets/js/ui.js', 'assets/js/layout/ui.js'],
  ['assets/js/api.js', 'assets/js/services/api.js'],
  ['assets/js/auth.js', 'assets/js/services/auth.js'],
  ['assets/js/manage-requests.js', 'assets/js/features/manage-requests.js'],
  ['assets/js/timeline.js', 'assets/js/features/timeline.js'],
  ['assets/js/reservations.js', 'assets/js/features/reservations.js'],
  ['assets/js/dashboard.js', 'assets/js/features/dashboard.js'],
  ['assets/js/settings.js', 'assets/js/features/settings.js'],
];
for (const [from, to] of js) {
  const src = path.join(PUBLIC, from);
  if (!fs.existsSync(src)) continue;
  const out = patchJs(fs.readFileSync(src, 'utf8'));
  write(path.join(PUBLIC, to), out);
}

// Views
write(path.join(VIEWS, 'auth/login.html'), patchHtml(fs.readFileSync(path.join(PUBLIC, 'login.html'), 'utf8')));

for (const file of fs.readdirSync(path.join(PUBLIC, 'admin'))) {
  if (!file.endsWith('.html')) continue;
  write(path.join(VIEWS, 'admin', file), patchHtml(fs.readFileSync(path.join(PUBLIC, 'admin', file), 'utf8')));
}

for (const file of fs.readdirSync(path.join(PUBLIC, 'guest'))) {
  if (!file.endsWith('.html')) continue;
  write(path.join(VIEWS, 'guest', file), patchHtml(fs.readFileSync(path.join(PUBLIC, 'guest', file), 'utf8')));
}

// index.html
const indexPath = path.join(PUBLIC, 'index.html');
if (fs.existsSync(indexPath)) {
  let index = fs.readFileSync(indexPath, 'utf8');
  index = index.replace('./assets/js/auth.js', '/assets/js/services/auth.js');
  fs.writeFileSync(indexPath, index);
}

// action-cards
const ac = path.join(PUBLIC, 'components/action-cards-reservations.html');
if (fs.existsSync(ac)) {
  fs.writeFileSync(ac, fs.readFileSync(ac, 'utf8').replace('href="./facilities.html"', 'href="/admin/facilities.html"'));
}

console.log('Restructure complete.');
