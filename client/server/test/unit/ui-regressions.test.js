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
});
