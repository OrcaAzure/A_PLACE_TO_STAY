import nodemailer from 'nodemailer';
import {
  isProduction,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
} from '../config/env.js';

const PLACEHOLDER_HOSTS = new Set(['smtp.example.com', '']);
const PLACEHOLDER_USERS = new Set(['your_smtp_user', 'your.email@gmail.com']);
const PLACEHOLDER_PASSES = new Set(['your_smtp_password', 'your_16_char_app_password']);

let lastEmailError = null;

/** True when real SMTP credentials are set (not .env.example placeholders). */
export function isSmtpConfigured() {
  const host = String(SMTP_HOST || '').trim();
  const user = String(SMTP_USER || '').trim();
  const pass = String(SMTP_PASS || '').trim();
  if (!host || !user || !pass) return false;
  if (PLACEHOLDER_HOSTS.has(host)) return false;
  if (PLACEHOLDER_USERS.has(user.toLowerCase())) return false;
  if (PLACEHOLDER_PASSES.has(pass.toLowerCase())) return false;
  if (user.toUpperCase().includes('REPLACE_WITH')) return false;
  if (pass.toUpperCase().includes('REPLACE_WITH')) return false;
  return true;
}

/** Local dev without SMTP — emails are logged, not delivered. */
export function isEmailDevMode() {
  return !isProduction && !isSmtpConfigured();
}

export function getLastEmailError() {
  return lastEmailError;
}

function isGmailHost() {
  return String(SMTP_HOST || '').toLowerCase().includes('gmail.com');
}

function createTransporter() {
  if (isEmailDevMode()) {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  const auth = { user: SMTP_USER, pass: SMTP_PASS };

  if (isGmailHost()) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth,
    });
  }

  const port = Number(SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth,
    ...(port === 587 ? { requireTLS: true } : {}),
  });
}

const transporter = createTransporter();

const fromAddress = () => SMTP_FROM || 'noreply@aptspace.com';

async function sendMail({ to, subject, html }) {
  try {
    const info = await transporter.sendMail({
      from: fromAddress(),
      to,
      subject,
      html,
    });
    lastEmailError = null;
    if (isEmailDevMode()) {
      console.info(`[email dev] To: ${to}`);
      console.info(`[email dev] Subject: ${subject}`);
      if (info?.message) {
        try {
          const parsed = JSON.parse(info.message);
          console.info('[email dev] Body preview:', parsed.html?.slice(0, 200), '…');
        } catch { /* ignore */ }
      }
    }
    return true;
  } catch (err) {
    lastEmailError = err.message || String(err);
    console.error('Email send failed:', lastEmailError);
    if (!isProduction) {
      if (isGmailHost()) {
        console.error(
          'Gmail tip: use an App Password (not your normal password) — https://myaccount.google.com/apppasswords'
        );
      } else {
        console.error(
          'Tip: Add SMTP settings to client/server/.env, or use MailHog (SMTP_HOST=localhost, SMTP_PORT=1025).'
        );
      }
    }
    return false;
  }
}

export async function sendGuestAccessEmail(user, tempPassword) {
  const name = user.full_name || 'Guest';
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  return sendMail({
    to: user.email,
    subject: 'Your AptSpace Guest Access — APTS Housing',
    html: `
      <h2>Welcome to AptSpace, ${name}</h2>
      <p>The APTS Housing Department has created a guest account for you. You can now log in and submit reservation requests online.</p>
      <p><strong>Login email:</strong> ${user.email}</p>
      <p><strong>Temporary password:</strong> ${tempPassword}</p>
      <p>Sign in at <a href="${appUrl}/login.html">${appUrl}/login.html</a> and change your password after your first login.</p>
      <p>If you did not request this access, please contact the Housing Department.</p>
    `,
  });
}

export async function sendWelcomeEmail(user) {
  const name = user.full_name || 'Guest';
  return sendMail({
    to: user.email,
    subject: 'Welcome to AptSpace',
    html: `
      <h2>Welcome to AptSpace, ${name}!</h2>
      <p>Your account has been created successfully. You can now log in and manage your reservations.</p>
      <p>Thank you for choosing AptSpace.</p>
    `,
  });
}

export async function sendBookingConfirmationEmail(user, booking) {
  const name = user.full_name || user.guest_name || 'Guest';
  const room = booking.building_name
    ? `${booking.building_name} — Room ${booking.room_number}`
    : `Room ${booking.room_number || booking.room_id}`;
  const checkIn = booking.check_in;
  const checkOut = booking.check_out;
  const price = booking.total_amount != null ? `₱${Number(booking.total_amount).toFixed(2)}` : '—';

  return sendMail({
    to: user.email || user.guest_email,
    subject: 'Booking Confirmation — AptSpace',
    html: `
      <h2>Booking Confirmed</h2>
      <p>Hi ${name},</p>
      <p>Your reservation has been received. Here are the details:</p>
      <ul>
        <li><strong>Room:</strong> ${room}</li>
        <li><strong>Check-in:</strong> ${checkIn}</li>
        <li><strong>Check-out:</strong> ${checkOut}</li>
        <li><strong>Total:</strong> ${price}</li>
      </ul>
      <p>Thank you for booking with AptSpace.</p>
    `,
  });
}

export async function sendPaymentReceiptEmail(user, payment) {
  const name = user.full_name || user.guest_name || 'Guest';
  const amount = payment.amount != null ? `₱${Number(payment.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—';
  const date = payment.paid_at || payment.created_at || new Date().toISOString().slice(0, 10);
  const method = payment.method || '—';
  const room = payment.building_name
    ? `${payment.building_name} — Room ${payment.room_number}`
    : `Room ${payment.room_number || ''}`;

  return sendMail({
    to: user.email || user.guest_email,
    subject: 'Payment Confirmed — APTS Housing',
    html: `
      <h2>Payment Confirmed</h2>
      <p>Hi ${name},</p>
      <p>APTS Housing has recorded your payment. Thank you!</p>
      <ul>
        <li><strong>Room:</strong> ${room}</li>
        <li><strong>Amount paid:</strong> ${amount}</li>
        <li><strong>Date:</strong> ${date}</li>
        <li><strong>Method:</strong> ${method}</li>
      </ul>
      <p>Your reservation remains confirmed. Payment is separate from your room assignment dates.</p>
    `,
  });
}

export async function sendHousingInvoiceEmail(user, payment) {
  const name = user.full_name || user.guest_name || 'Guest';
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const room = payment.building_name
    ? `${payment.building_name} — Room ${payment.room_number}`
    : `Room ${payment.room_number || ''}`;
  const subtotal = Number(payment.subtotal ?? payment.amount ?? 0);
  const discount = Number(payment.discount_amount || 0);
  const due = Number(payment.amount ?? subtotal);
  const fmt = (n) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  const discountLine = discount > 0
    ? `<li><strong>Discount:</strong> −${fmt(discount)}${payment.discount_note ? ` (${payment.discount_note})` : ''}</li>`
    : '';

  return sendMail({
    to: user.email || user.guest_email,
    subject: 'Your Housing Invoice — AptSpace',
    html: `
      <h2>Your Housing Invoice</h2>
      <p>Hi ${name},</p>
      <p>Your room reservation at APTS Housing has been <strong>approved</strong>. This email is your automated housing invoice — please settle the amount below with the Housing Department.</p>
      <p><strong>Invoice #${payment.id}</strong></p>
      <ul>
        <li><strong>Room:</strong> ${room}</li>
        <li><strong>Check-in:</strong> ${payment.check_in}</li>
        <li><strong>Check-out:</strong> ${payment.check_out}</li>
        <li><strong>Subtotal:</strong> ${fmt(subtotal)}</li>
        ${discountLine}
        <li><strong><span style="font-size:1.1em">Amount due: ${fmt(due)}</span></strong></li>
      </ul>
      <p>Accepted methods: Cash, GCash, or Bank Transfer at the housing office.</p>
      <p>View your invoice anytime after logging in: <a href="${appUrl}/guest/reservations.html">${appUrl}/guest/reservations.html</a></p>
      <p>If you have questions, contact the Housing Department.</p>
    `,
  });
}

export async function sendBookingModifiedEmail(user, booking, { message, previousRoom, previousCheckIn, previousCheckOut }) {
  const name = user.full_name || user.guest_name || 'Guest';
  const room = booking.building_name
    ? `${booking.building_name} — Room ${booking.room_number}`
    : `Room ${booking.room_number || booking.room_id}`;
  const price = booking.total_amount != null ? `₱${Number(booking.total_amount).toFixed(2)}` : '—';

  return sendMail({
    to: user.email || user.guest_email,
    subject: 'Your Reservation Was Updated — AptSpace',
    html: `
      <h2>Reservation Updated</h2>
      <p>Hi ${name},</p>
      <p>Your reservation request was reviewed and approved with the following update from our team:</p>
      <blockquote style="margin:1rem 0;padding:0.75rem 1rem;background:#f8fafc;border-left:4px solid #1A365D;">${message}</blockquote>
      <p><strong>Previous request:</strong></p>
      <ul>
        <li><strong>Room:</strong> ${previousRoom || '—'}</li>
        <li><strong>Check-in:</strong> ${previousCheckIn || '—'}</li>
        <li><strong>Check-out:</strong> ${previousCheckOut || '—'}</li>
      </ul>
      <p><strong>Confirmed reservation:</strong></p>
      <ul>
        <li><strong>Room:</strong> ${room}</li>
        <li><strong>Check-in:</strong> ${booking.check_in}</li>
        <li><strong>Check-out:</strong> ${booking.check_out}</li>
        <li><strong>Total:</strong> ${price}</li>
      </ul>
      <p>Log in to AptSpace to view your reservation details.</p>
    `,
  });
}

export async function sendGroupConfirmationEmail(user, group) {
  const name = user.full_name || group.contact_name || 'Guest';
  const roomLines = (group.bookings || [])
    .map((b) => `${b.building_name || ''} Room ${b.room_number || '?'}`)
    .join(', ') || 'Assigned at check-in';

  return sendMail({
    to: user.email || group.contact_email,
    subject: 'Group Reservation Confirmed — AptSpace',
    html: `
      <h2>Group Reservation Confirmed</h2>
      <p>Hi ${name},</p>
      <p>Your group reservation for <strong>${group.group_name}</strong> has been approved.</p>
      <ul>
        <li><strong>Check-in:</strong> ${group.check_in}</li>
        <li><strong>Check-out:</strong> ${group.check_out}</li>
        <li><strong>Guests:</strong> ${group.total_guests}</li>
        <li><strong>Rooms:</strong> ${roomLines}</li>
      </ul>
      <p>Log in to AptSpace to view details.</p>
    `,
  });
}

export async function sendGroupModifiedEmail(user, group, { message, previousCheckIn, previousCheckOut, previousRoomsRequested }) {
  const name = user.full_name || group.contact_name || 'Guest';
  const roomLines = (group.bookings || [])
    .map((b) => `${b.building_name || ''} Room ${b.room_number || '?'}`)
    .join(', ') || 'To be assigned';

  return sendMail({
    to: user.email || group.contact_email,
    subject: 'Your Group Reservation Was Updated — AptSpace',
    html: `
      <h2>Group Reservation Updated</h2>
      <p>Hi ${name},</p>
      <p>Your group reservation request for <strong>${group.group_name}</strong> was reviewed and approved with changes:</p>
      <blockquote style="margin:1rem 0;padding:0.75rem 1rem;background:#f8fafc;border-left:4px solid #1A365D;">${message}</blockquote>
      <p><strong>Previous request:</strong> ${previousCheckIn || '—'} to ${previousCheckOut || '—'} · ${previousRoomsRequested ?? '—'} room(s) requested</p>
      <p><strong>Confirmed stay:</strong> ${group.check_in} to ${group.check_out} · ${group.total_guests} guest(s)</p>
      <p><strong>Assigned rooms:</strong> ${roomLines}</p>
      <p>Log in to AptSpace to view full details.</p>
    `,
  });
}

export async function sendPasswordResetEmail(user, resetLink) {
  const name = user.full_name || 'User';
  return sendMail({
    to: user.email,
    subject: 'Reset Your AptSpace Password',
    html: `
      <h2>Password Reset Request</h2>
      <p>Hi ${name},</p>
      <p>We received a request to reset your password. Click the link below to choose a new password (valid for 1 hour):</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  });
}
