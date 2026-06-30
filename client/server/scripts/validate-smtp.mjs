import { pool } from '../src/config/db.js';
import {
  isSmtpConfigured,
  isEmailDevMode,
  getLastEmailError,
} from '../src/services/email.service.js';
import nodemailer from 'nodemailer';
import { SMTP_USER, SMTP_PASS, SMTP_FROM } from '../src/config/env.js';

const sendTest = process.argv.includes('--send-test');

console.log('=== AptSpace SMTP validation ===\n');
console.log('Configured:      ', isSmtpConfigured());
console.log('Dev mode:        ', isEmailDevMode());
console.log('From matches user:', SMTP_USER === SMTP_FROM);
console.log('App password len:', String(SMTP_PASS || '').replace(/\s/g, '').length);

const transport = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

try {
  await transport.verify();
  console.log('SMTP verify:     OK');
} catch (err) {
  console.log('SMTP verify:     FAIL');
  console.log('Error:          ', err.message.split('\n')[0]);
  process.exit(1);
}

if (sendTest) {
  const info = await transport.sendMail({
    from: SMTP_FROM,
    to: SMTP_USER,
    subject: 'AptSpace — SMTP test OK',
    html: '<p>Gmail SMTP is working. AptSpace can send housing invoices automatically.</p>',
  });
  console.log('Test email sent: ', SMTP_USER);
  console.log('Message ID:      ', info.messageId || '(ok)');
} else {
  console.log('Test email:      skipped (run with --send-test to deliver one to your inbox)');
}

const [rows] = await pool.query(`
  SELECT p.id, u.email AS guest_email, u.full_name AS guest_name, p.invoice_sent_at
  FROM payments p
  JOIN bookings_rooms b ON p.bookings_room_id = b.id
  JOIN users u ON b.user_id = u.id
  WHERE p.status = 'Pending'
  ORDER BY p.id DESC
  LIMIT 5
`);

console.log('\n=== Pending invoices (auto-email targets) ===');
if (!rows.length) {
  console.log('(none)');
} else {
  for (const r of rows) {
    console.log(
      `  #${r.id} ${r.guest_name} → ${r.guest_email} ${r.invoice_sent_at ? '[emailed]' : '[not emailed yet]'}`
    );
  }
}

await pool.end();
console.log('\nValidation complete.');
