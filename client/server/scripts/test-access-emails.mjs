/**
 * Send test guest-access and team (portal staff) access emails using the same
 * templates and SMTP path as production.
 *
 * Usage:
 *   npm run test:access-emails -- --to=you@example.com
 *   node scripts/test-access-emails.mjs --dry-run
 *   node scripts/test-access-emails.mjs --to=you@example.com --guest-only
 *   node scripts/test-access-emails.mjs --to=you@example.com --force
 */
import {
  getLastEmailError,
  isEmailDevMode,
  isSmtpConfigured,
  sendGuestAccessEmail,
  sendPortalStaffAccessEmail,
  verifyEmailTransport,
} from '../src/services/email.service.js';
import {
  APP_URL,
  NODE_ENV,
  SMTP_FROM,
  SMTP_HOST,
  SMTP_USER,
} from '../src/config/env.js';

function parseArgs(argv) {
  const args = {
    to: '',
    dryRun: false,
    guestOnly: false,
    teamOnly: false,
    force: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--guest-only') args.guestOnly = true;
    else if (arg === '--team-only') args.teamOnly = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--to=')) args.to = arg.slice(5).trim();
    else if (arg.startsWith('--to ')) args.to = arg.slice(5).trim();
  }

  if (args.guestOnly && args.teamOnly) {
    throw new Error('Use either --guest-only or --team-only, not both.');
  }

  return args;
}

function printHelp() {
  console.log(`
APTSpace access email test

Options:
  --to=EMAIL       Delivery address (defaults to SMTP_USER when sending)
  --dry-run        Print config and templates only; do not send
  --guest-only     Send only the guest access email
  --team-only      Send only the team / portal staff access email
  --force          Bypass 90s duplicate-send guard (for repeated runs)
  --help, -h       Show this help

Examples:
  npm run test:access-emails -- --dry-run
  npm run test:access-emails -- --to=admin@aptspace.com
`);
}

function printConfig() {
  console.log('=== Access email test ===\n');
  console.log('NODE_ENV:         ', NODE_ENV);
  console.log('APP_URL:          ', APP_URL || '(not set — login links use localhost fallback)');
  console.log('SMTP configured:  ', isSmtpConfigured());
  console.log('Email dev mode:   ', isEmailDevMode(), isEmailDevMode() ? '(logged only, not delivered)' : '');
  console.log('SMTP host:        ', SMTP_HOST || '(none)');
  console.log('SMTP user:        ', SMTP_USER || '(none)');
  console.log('SMTP from:        ', SMTP_FROM || '(none)');
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    return;
  }

  printConfig();

  const sendGuest = !args.teamOnly;
  const sendTeam = !args.guestOnly;
  const recipient = args.to || String(SMTP_USER || '').trim();
  const tempPassword = `Test-${Date.now().toString(36)}`;
  const mailOptions = { allowDuplicate: args.force };

  const guestUser = {
    email: recipient,
    full_name: 'Test Guest',
  };
  const teamUser = {
    email: recipient,
    full_name: 'Test Team Member',
  };

  console.log('\n--- Templates to exercise ---');
  if (sendGuest) {
    console.log('Guest access:     "Your APTS guest access"');
  }
  if (sendTeam) {
    console.log('Team access:      "Your APTS admin portal access"');
  }

  if (args.dryRun) {
    console.log('\nDry run — no messages sent.');
    if (!recipient) {
      console.log('Tip: pass --to=email@example.com to see the delivery target.');
    } else {
      console.log(`Would send to:    ${recipient}`);
    }
    return;
  }

  if (!recipient) {
    console.error('\nMissing recipient. Pass --to=email@example.com or set SMTP_USER in .env');
    process.exit(1);
  }

  console.log(`\nRecipient:        ${recipient}`);

  const verify = await verifyEmailTransport();
  if (!verify.ok) {
    console.error('\nSMTP verify failed:', verify.error || 'unknown error');
    process.exit(1);
  }
  if (verify.devMode) {
    console.log('\nSMTP verify:      skipped (dev mode — output will be logged to console)');
  } else {
    console.log('SMTP verify:      OK');
  }

  const results = [];

  if (sendGuest) {
    const ok = await sendGuestAccessEmail(guestUser, tempPassword, mailOptions);
    results.push({
      label: 'Guest access email',
      subject: 'Your APTS guest access',
      ok,
      error: ok ? null : getLastEmailError(),
    });
  }

  if (sendTeam) {
    const ok = await sendPortalStaffAccessEmail(teamUser, tempPassword, mailOptions);
    results.push({
      label: 'Team access email',
      subject: 'Your APTS admin portal access',
      ok,
      error: ok ? null : getLastEmailError(),
    });
  }

  console.log('\n--- Results ---');
  let failed = 0;
  for (const r of results) {
    const status = r.ok ? 'PASS' : 'FAIL';
    console.log(`${status}  ${r.label} (${r.subject})`);
    if (r.error) console.log(`       ${r.error}`);
    if (!r.ok) failed += 1;
  }

  if (verify.devMode) {
    console.log('\nDev mode: check the [email dev] lines above for subject and body preview.');
  } else if (failed === 0) {
    console.log(`\nDelivered to ${recipient}. Check inbox (and spam) for both subjects.`);
  }

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nUnexpected error:', err.message || err);
  process.exit(1);
});
