import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const publicRoot = path.resolve(serverRoot, '../public');
const readPublic = (relativePath) => fs.readFileSync(path.join(publicRoot, relativePath), 'utf8');

describe('guest and billing UI regressions', () => {
  it('mounts one shared landing footer for signed-out and signed-in landing content', () => {
    const composer = readPublic('assets/js/layout/landing-content.js');
    const publicPage = readPublic('index.html');
    assert.match(composer, /footer:\s*'\/components\/guest-footer\.html'/);
    assert.doesNotMatch(publicPage, /<!-- FOOTER -->/);
  });

  it('keeps required room details while removing Good to know', () => {
    const browse = readPublic('assets/js/features/guest-facilities-browse.js');
    assert.match(browse, /Room highlights/);
    assert.match(browse, /detailBlockHtml\('Policies'/);
    assert.doesNotMatch(browse, /<h4>Good to know<\/h4>/);
  });

  it('shows check-in and check-out policy on group confirm step', () => {
    const groupWizard = readPublic('assets/js/features/group-reservation-wizard.js');
    assert.match(groupWizard, /checkInOutPolicyNoteHtml/);
    assert.doesNotMatch(groupWizard, /gw-arrival-time/);
  });

  it('includes Meet the Team in the shared guest footer', () => {
    const footer = readPublic('components/guest-footer.html');
    assert.match(footer, /meet-the-team\.html/);
    assert.match(footer, /Meet the Team/);
  });

  it('keeps billing details single-column on medium screens', () => {
    const css = readPublic('assets/css/features/admin-invoices.css');
    assert.match(css, /min-width:\s*768px\)\s*and\s*\(max-width:\s*1099px/);
    assert.match(css, /\.billing-detail__columns\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  });

  it('shows guest charge breakdowns and one group invoice summary', () => {
    const guestStays = readPublic('assets/js/features/guest-my-stays-page.js');
    const adminReservations = readPublic('assets/js/features/admin-reservations-hub.js');
    assert.match(guestStays, /> Charge breakdown</);
    assert.match(guestStays, /room_total/);
    assert.match(adminReservations, /Group invoice/);
    assert.match(adminReservations, /b\.room_total \?\? b\.total_amount/);
  });

  it('itemizes every room in a group billing modal', () => {
    const paymentsUi = readPublic('assets/js/features/admin-payments.js');
    const paymentService = fs.readFileSync(path.join(serverRoot, 'src/services/payment.service.js'), 'utf8');
    assert.match(paymentService, /payment\.group_rooms\s*=\s*await getGroupInvoiceRooms/);
    assert.match(paymentsUi, /groupRooms\.forEach\(\(room\)/);
    assert.match(paymentsUi, /Admin subtotal adjustment/);
  });

  it('does not mount the obsolete reservation confirmation over billing records', () => {
    const paymentsUi = readPublic('assets/js/features/admin-payments.js');
    const css = readPublic('assets/css/features/admin-invoices.css');
    assert.doesNotMatch(paymentsUi, /\$\{renderReservationConfirmDialog\(\)\}/);
    assert.match(css, /\.billing-res-confirm\.hidden[\s\S]*display:\s*none/);
  });

  it('uses in-app dialogs and visual policy editor', () => {
    const paymentsUi = readPublic('assets/js/features/admin-payments.js');
    const settingsUi = readPublic('assets/js/features/settings.js');
    const policyEditor = readPublic('assets/js/features/policy-editor.js');
    const settingsPage = fs.readFileSync(path.join(serverRoot, 'views/admin/settings.html'), 'utf8');
    assert.doesNotMatch(paymentsUi, /window\.(?:alert|confirm|prompt)\s*\(/);
    assert.match(paymentsUi, /confirmModal\(\{/);
    assert.match(settingsUi, /confirmModal\(\{/);
    assert.match(settingsUi, /initPolicyEditor/);
    assert.match(policyEditor, /policy-section-card/);
    assert.match(settingsPage, /id="policy-editor-mount"/);
    assert.doesNotMatch(settingsPage, /id="settings-policies-modal"/);
  });

  it('keeps authenticated guest navigation on public information pages', () => {
    const header = readPublic('assets/js/layout/public-info-header.js');
    const policies = readPublic('legal/policies-guidelines.html');
    const terms = readPublic('legal/terms.html');
    const privacy = readPublic('legal/privacy.html');
    assert.match(header, /guest-nav\.html/);
    assert.match(header, /bindNotificationBell/);
    [policies, terms, privacy].forEach((page) => {
      assert.match(page, /public-info-header\.js/);
      assert.doesNotMatch(page, /window\.print|>Print</);
    });
    assert.match(policies, /meet-the-team\.html/);
    assert.match(policies, /Meet the Team/);
    assert.match(policies, /Back to home/);
    assert.doesNotMatch(policies, /policy-footer-btn/);
  });

  it('centralizes landing and contact-page phone details', () => {
    const landing = readPublic('components/landing-sections.html');
    const contacts = readPublic('contacts.html');
    const renderer = readPublic('assets/js/features/support-contact.js');
    assert.match(landing, /data-contact-telephone/);
    assert.match(contacts, /data-contact-telephone/);
    assert.match(renderer, /getSupportContact/);
  });

  it('loads tailwind-built.css last in head so utilities win ties (old CDN order)', () => {
    const pages = [];
    const collect = (dir) => {
      fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collect(full);
        else if (entry.name.endsWith('.html')) pages.push(full);
      });
    };
    collect(publicRoot);
    collect(path.join(serverRoot, 'views'));

    pages.forEach((page) => {
      const html = fs.readFileSync(page, 'utf8');
      const head = html.split('</head>')[0];
      const tailwindAt = head.indexOf('tailwind-built.css');
      if (tailwindAt === -1) return;
      const afterTailwind = head.slice(tailwindAt);
      assert.doesNotMatch(
        afterTailwind,
        /<link[^>]+rel="stylesheet"|<style/,
        `${page} loads other CSS after tailwind-built.css — utilities must come last`,
      );
    });
  });

  it('keeps mobile landing nav and login password toggle scoped correctly', () => {
    const landingCss = readPublic('assets/css/global/landing.css');
    const loginPage = fs.readFileSync(path.join(serverRoot, 'views/auth/login.html'), 'utf8');
    assert.match(landingCss, /@media \(max-width: 767px\)[\s\S]*\.lp-mobile-menu:not\(\.hidden\)/);
    assert.match(landingCss, /@media \(min-width: 768px\)[\s\S]*\.lp-mobile-menu[\s\S]*display:\s*none !important/);
    assert.match(loginPage, /\.password-field__toggle\s*\{[\s\S]*position:\s*absolute/);
    assert.doesNotMatch(loginPage, /\.password-field__toggle\s*\{[\s\S]*position:\s*relative/);
  });
});
