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

  it('shows the stay date with earliest arrival', () => {
    const groupWizard = readPublic('assets/js/features/group-reservation-wizard.js');
    assert.match(groupWizard, /Earliest arrival — \$\{escapeHtml\(formatDateLong\(state\.checkIn\)\)\}/);
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

  it('uses in-app dialogs and large inline policy editors', () => {
    const paymentsUi = readPublic('assets/js/features/admin-payments.js');
    const settingsUi = readPublic('assets/js/features/settings.js');
    const settingsPage = fs.readFileSync(path.join(serverRoot, 'views/admin/settings.html'), 'utf8');
    assert.doesNotMatch(paymentsUi, /window\.(?:alert|confirm|prompt)\s*\(/);
    assert.match(paymentsUi, /confirmModal\(\{/);
    assert.match(settingsUi, /confirmModal\(\{/);
    assert.match(settingsPage, /settings-policy-editor--large/);
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
    assert.match(policies, /id="meet-the-team"/);
    assert.match(policies, /data-scroll-to-team/);
    assert.match(policies, /policy-footer-link--team/);
    assert.match(policies, /Terms of Service[\s\S]*Meet the team/);
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
});
