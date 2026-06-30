import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viewsDir = path.join(__dirname, '../../views');

const router = Router();

function sendView(res, relativePath) {
  res.sendFile(path.join(viewsDir, relativePath));
}

router.get('/login.html', (req, res) => sendView(res, 'auth/login.html'));
router.get('/forgot-password.html', (req, res) => sendView(res, 'auth/forgot-password.html'));
router.get('/reset-password.html', (req, res) => sendView(res, 'auth/reset-password.html'));

const adminPages = ['dashboard', 'calendar', 'reservations', 'facilities', 'residents', 'payments', 'settings'];
for (const page of adminPages) {
  router.get(`/admin/${page}.html`, (req, res) => sendView(res, `admin/${page}.html`));
}

const guestPages = ['dashboard', 'reservations', 'facilities', 'settings'];
for (const page of guestPages) {
  router.get(`/guest/${page}.html`, (req, res) => sendView(res, `guest/${page}.html`));
}

router.get('/login', (req, res) => res.redirect('/login.html'));

export default router;
