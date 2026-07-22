import { Router } from 'express';

import path from 'path';

import { fileURLToPath } from 'url';

import { requirePortalPage, requireSuperAdminPage } from '../middleware/pageAuth.middleware.js';



const __dirname = path.dirname(fileURLToPath(import.meta.url));

const viewsDir = path.join(__dirname, '../../views');



const router = Router();



function sendView(res, relativePath) {

  // Portal HTML changes often during development; never let browsers keep a stale shell.

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  res.setHeader('Pragma', 'no-cache');

  res.sendFile(path.join(viewsDir, relativePath));

}



router.get('/login.html', (req, res) => sendView(res, 'auth/login.html'));

router.get('/forgot-password.html', (req, res) => sendView(res, 'auth/forgot-password.html'));

router.get('/reset-password.html', (req, res) => sendView(res, 'auth/reset-password.html'));



const adminPages = ['dashboard', 'calendar', 'reservations', 'facilities', 'payments', 'settings'];

for (const page of adminPages) {

  router.get(`/admin/${page}.html`, requirePortalPage('admin'), (req, res) => sendView(res, `admin/${page}.html`));

}



router.get(

  '/admin/residents.html',

  requirePortalPage('admin'),

  requireSuperAdminPage,

  (req, res) => sendView(res, 'admin/residents.html'),

);



router.get(

  '/admin/team.html',

  requirePortalPage('admin'),

  requireSuperAdminPage,

  (req, res) => sendView(res, 'admin/team.html'),

);



const guestPages = ['dashboard', 'reservations', 'facilities', 'settings', 'booking-request', 'billing'];

for (const page of guestPages) {

  router.get(`/guest/${page}.html`, requirePortalPage('guest'), (req, res) => sendView(res, `guest/${page}.html`));

}



router.get('/login', (req, res) => res.redirect('/login.html'));



export default router;


