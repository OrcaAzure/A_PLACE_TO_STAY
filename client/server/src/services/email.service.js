import nodemailer from 'nodemailer';
import {
  isProduction,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  SUPPORT_EMAIL,
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

function formatTime12(t) {
  if (!t) return '';
  const [h, m] = String(t).slice(0, 5).split(':').map(Number);
  if (Number.isNaN(h)) return String(t).slice(0, 5);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatEmailDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 16);
  return d.toLocaleString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatEventDate(value) {
  if (!value) return '—';
  const raw = String(value).slice(0, 10);
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

/** Match venue invoices even if invoice_kind is missing on the row. */
export function isVenuePayment(payment) {
  if (!payment) return false;
  if (payment.invoice_kind === 'venue') return true;
  if (payment.facility_booking_id != null && payment.facility_booking_id !== '') return true;
  if (payment.bookings_facility_id != null && payment.bookings_facility_id !== '') return true;
  if ((payment.facility_name || payment.facility_category) && !payment.room_number) return true;
  return Boolean(payment.event_date && !payment.check_in);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Resolve a guest inbox from user/booking/group fields (first non-empty wins). */
export function resolveGuestRecipientEmail({ user, booking, group } = {}) {
  for (const value of [
    user?.email,
    user?.guest_email,
    booking?.guest_email,
    group?.contact_email,
    group?.requester_email,
  ]) {
    const trimmed = String(value || '').trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function getSupportEmail() {
  const configured = String(SUPPORT_EMAIL || '').trim();
  if (configured) return configured;
  const smtpUser = String(SMTP_USER || '').trim();
  if (smtpUser && !PLACEHOLDER_USERS.has(smtpUser.toLowerCase())) return smtpUser;
  return 'facilities@apts.edu.ph';
}

async function sendMail({ to, subject, html, text, replyTo }) {
  const recipient = String(to || '').trim();
  if (!recipient) {
    lastEmailError = 'No recipient email address';
    console.warn(`[email] Skipped — no recipient for subject: ${subject}`);
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: fromAddress(),
      to: recipient,
      subject,
      html,
      text,
      ...(replyTo ? { replyTo } : {}),
    });
    lastEmailError = null;
    if (isEmailDevMode()) {
      console.info(`[email dev] To: ${recipient}`);
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

function guestSelfModifyIntro(wasApproved) {
  if (wasApproved) {
    return 'We received your request to change an approved reservation. Housing staff will review your updates and confirm by email.';
  }
  return 'Your pending reservation was updated. Housing staff will review the latest details when processing your request.';
}

function guestSelfModifyMessageBlock(message) {
  const text = String(message || '').trim();
  if (!text) return '';
  return `<blockquote style="margin:1rem 0;padding:0.75rem 1rem;background:#f8fafc;border-left:4px solid #1A365D;">${escapeHtml(text)}</blockquote>`;
}

export async function sendGuestRoomSelfModifyEmail(user, booking, {
  wasApproved,
  message,
  previousRoom,
  previousCheckIn,
  previousCheckOut,
}) {
  const name = user.full_name || user.guest_name || booking.guest_name || 'Guest';
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const room = booking.building_name
    ? `${booking.building_name} — Room ${booking.room_number}`
    : `Room ${booking.room_number || booking.room_id}`;
  const price = booking.total_amount != null ? `₱${Number(booking.total_amount).toFixed(2)}` : '—';
  const previousBlock = wasApproved ? `
      <p><strong>Previous reservation:</strong></p>
      <ul>
        <li><strong>Room:</strong> ${escapeHtml(previousRoom || '—')}</li>
        <li><strong>Check-in:</strong> ${escapeHtml(previousCheckIn || '—')}</li>
        <li><strong>Check-out:</strong> ${escapeHtml(previousCheckOut || '—')}</li>
      </ul>` : '';

  return sendMail({
    to: resolveGuestRecipientEmail({ user, booking }),
    subject: wasApproved
      ? 'Modification Request Received — AptSpace'
      : 'Your Reservation Was Updated — AptSpace',
    html: `
      <h2>${wasApproved ? 'Modification Request Received' : 'Reservation Updated'}</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>${guestSelfModifyIntro(wasApproved)}</p>
      ${guestSelfModifyMessageBlock(message)}
      ${previousBlock}
      <p><strong>${wasApproved ? 'Requested details' : 'Updated details'}:</strong></p>
      <ul>
        <li><strong>Room:</strong> ${escapeHtml(room)}</li>
        <li><strong>Check-in:</strong> ${escapeHtml(booking.check_in)}</li>
        <li><strong>Check-out:</strong> ${escapeHtml(booking.check_out)}</li>
        <li><strong>Guests:</strong> ${escapeHtml(booking.guest_count ?? '—')}</li>
        <li><strong>Estimated total:</strong> ${price}</li>
        <li><strong>Status:</strong> Pending review</li>
      </ul>
      <p>View your reservation: <a href="${appUrl}/guest/reservations.html">${appUrl}/guest/reservations.html</a></p>
    `,
  });
}

export async function sendGuestGroupSelfModifyEmail(user, group, {
  wasApproved,
  message,
  previousCheckIn,
  previousCheckOut,
  previousRoomsRequested,
}) {
  const name = user.full_name || group.contact_name || 'Guest';
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const roomLines = (group.bookings || [])
    .map((b) => `${b.building_name || ''} Room ${b.room_number || '?'}`)
    .join(', ') || 'To be assigned';
  const previousBlock = wasApproved ? `
      <p><strong>Previous request:</strong> ${escapeHtml(previousCheckIn || '—')} to ${escapeHtml(previousCheckOut || '—')} · ${escapeHtml(previousRoomsRequested ?? '—')} room(s) requested</p>` : '';

  return sendMail({
    to: resolveGuestRecipientEmail({ user, group }),
    subject: wasApproved
      ? 'Group Modification Request Received — AptSpace'
      : 'Your Group Reservation Was Updated — AptSpace',
    html: `
      <h2>${wasApproved ? 'Group Modification Request Received' : 'Group Reservation Updated'}</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>${guestSelfModifyIntro(wasApproved)}</p>
      ${guestSelfModifyMessageBlock(message)}
      ${previousBlock}
      <p><strong>${wasApproved ? 'Requested details' : 'Updated details'} for ${escapeHtml(group.group_name)}:</strong></p>
      <ul>
        <li><strong>Check-in:</strong> ${escapeHtml(group.check_in)}</li>
        <li><strong>Check-out:</strong> ${escapeHtml(group.check_out)}</li>
        <li><strong>Guests:</strong> ${escapeHtml(group.total_guests)}</li>
        <li><strong>Rooms:</strong> ${escapeHtml(roomLines)}</li>
        <li><strong>Status:</strong> Pending review</li>
      </ul>
      <p>View your reservation: <a href="${appUrl}/guest/reservations.html">${appUrl}/guest/reservations.html</a></p>
    `,
  });
}

export async function sendGuestVenueSelfModifyEmail(user, booking, {
  wasApproved,
  message,
  previousEventDate,
  previousStartTime,
  previousEndTime,
  previousGuestCount,
}) {
  const name = user.full_name || user.guest_name || booking.guest_name || 'Guest';
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const venue = [booking.facility_category, booking.facility_name || booking.facility_room_code]
    .filter(Boolean)
    .join(' — ');
  const eventDate = formatEventDate(booking.event_date);
  const start = formatTime12(booking.start_time);
  const end = formatTime12(booking.end_time);
  const timeRange = start && end ? `${start} – ${end}` : '—';
  const price = booking.total_amount != null ? `₱${Number(booking.total_amount).toFixed(2)}` : '—';
  const prevStart = formatTime12(previousStartTime);
  const prevEnd = formatTime12(previousEndTime);
  const previousBlock = wasApproved ? `
      <p><strong>Previous booking:</strong></p>
      <ul>
        <li><strong>Date:</strong> ${escapeHtml(formatEventDate(previousEventDate))}</li>
        <li><strong>Time:</strong> ${escapeHtml(prevStart && prevEnd ? `${prevStart} – ${prevEnd}` : '—')}</li>
        <li><strong>Guests:</strong> ${escapeHtml(previousGuestCount ?? '—')}</li>
      </ul>` : '';

  return sendMail({
    to: resolveGuestRecipientEmail({ user, booking }),
    subject: wasApproved
      ? 'Venue Modification Request Received — AptSpace'
      : 'Your Venue Booking Was Updated — AptSpace',
    html: `
      <h2>${wasApproved ? 'Venue Modification Request Received' : 'Venue Booking Updated'}</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>${guestSelfModifyIntro(wasApproved)}</p>
      ${guestSelfModifyMessageBlock(message)}
      ${previousBlock}
      <p><strong>${wasApproved ? 'Requested details' : 'Updated details'}:</strong></p>
      <ul>
        <li><strong>Venue:</strong> ${escapeHtml(venue)}</li>
        <li><strong>Event date:</strong> ${escapeHtml(eventDate)}</li>
        <li><strong>Time:</strong> ${escapeHtml(timeRange)}</li>
        <li><strong>Guests:</strong> ${escapeHtml(booking.guest_count || 1)}</li>
        <li><strong>Estimated total:</strong> ${price}</li>
        <li><strong>Status:</strong> Pending review</li>
      </ul>
      <p>View your booking: <a href="${appUrl}/guest/reservations.html">${appUrl}/guest/reservations.html</a></p>
    `,
  });
}

export async function sendPaymentReceiptEmail(user, payment) {
  const name = user.full_name || user.guest_name || 'Guest';
  const amount = payment.amount != null ? `₱${Number(payment.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—';
  const date = formatEmailDateTime(payment.paid_at || payment.created_at);
  const method = payment.method || '—';
  const isVenue = isVenuePayment(payment);
  const place = isVenue
    ? [payment.facility_category, payment.facility_name || payment.facility_room_code].filter(Boolean).join(' — ')
    : payment.building_name
      ? `${payment.building_name} — Room ${payment.room_number}`
      : `Room ${payment.room_number || ''}`;
  const start = formatTime12(payment.start_time);
  const end = formatTime12(payment.end_time);
  const when = isVenue
    ? `${formatEventDate(payment.event_date)}${start && end ? ` · ${start} – ${end}` : ''}`
    : `${payment.check_in || '—'} to ${payment.check_out || '—'}`;
  const invoiceRef = payment.id ? ` #${payment.id}` : '';

  return sendMail({
    to: user.email || user.guest_email,
    subject: isVenue
      ? `Venue payment confirmed${invoiceRef} — AptSpace`
      : `Housing payment confirmed${invoiceRef} — APTS Housing`,
    html: `
      <h2>${isVenue ? 'Venue Payment Confirmed' : 'Housing Payment Confirmed'}</h2>
      <p>Hi ${name},</p>
      <p>APTS Housing has recorded your ${isVenue ? 'venue' : 'housing'} payment. Thank you!</p>
      <p><strong>Invoice${invoiceRef}</strong></p>
      <ul>
        <li><strong>${isVenue ? 'Venue' : 'Room'}:</strong> ${place}</li>
        <li><strong>${isVenue ? 'Event' : 'Stay'}:</strong> ${when}</li>
        ${isVenue && payment.season ? `<li><strong>Season:</strong> ${payment.season}</li>` : ''}
        ${isVenue && payment.facility_package ? `<li><strong>Package:</strong> ${payment.facility_package}</li>` : ''}
        <li><strong>Amount paid:</strong> ${amount}</li>
        <li><strong>Date paid:</strong> ${date}</li>
        <li><strong>Method:</strong> ${method}</li>
      </ul>
      <p>Your ${isVenue ? 'facility reservation' : 'room reservation'} remains confirmed.</p>
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
    subject: `Your housing invoice #${payment.id} — Room ${payment.room_number || ''} | AptSpace`,
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

export async function sendVenueInvoiceEmail(user, payment) {
  const name = user.full_name || user.guest_name || 'Guest';
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const venue = [payment.facility_category, payment.facility_name || payment.facility_room_code]
    .filter(Boolean)
    .join(' — ');
  const eventDate = formatEventDate(payment.event_date);
  const start = formatTime12(payment.start_time);
  const end = formatTime12(payment.end_time);
  const timeRange = start && end ? `${start} – ${end}` : '—';
  const subtotal = Number(payment.subtotal ?? payment.amount ?? 0);
  const discount = Number(payment.discount_amount || 0);
  const due = Number(payment.amount ?? subtotal);
  const fmt = (n) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  const discountLine = discount > 0
    ? `<li><strong>Discount:</strong> −${fmt(discount)}${payment.discount_note ? ` (${payment.discount_note})` : ''}</li>`
    : '';
  const seasonLine = payment.season ? `<li><strong>Season:</strong> ${payment.season}</li>` : '';
  const packageLine = payment.facility_package
    ? `<li><strong>Package:</strong> ${payment.facility_package}</li>`
    : '';

  return sendMail({
    to: user.email || user.guest_email,
    subject: `Your venue invoice #${payment.id} — ${payment.facility_name || 'Facility'} | AptSpace`,
    html: `
      <h2>Your Venue Invoice</h2>
      <p>Hi ${name},</p>
      <p>Your <strong>facility / venue reservation</strong> has been approved. This email is your venue invoice </p>
      <p><strong>Invoice #${payment.id}</strong> · Booking #${payment.facility_booking_id || '—'}</p>
      <ul>
        <li><strong>Venue:</strong> ${venue}</li>
        <li><strong>Event date:</strong> ${eventDate}</li>
        <li><strong>Time:</strong> ${timeRange}</li>
        <li><strong>Guests:</strong> ${payment.guest_count || 1}</li>
        ${seasonLine}
        ${packageLine}
        <li><strong>Subtotal:</strong> ${fmt(subtotal)}</li>
        ${discountLine}
        <li><strong><span style="font-size:1.1em">Amount due: ${fmt(due)}</span></strong></li>
      </ul>
      <p>Accepted methods: Cash, GCash, or Bank Transfer at the housing office.</p>
      <p>View your invoice anytime after logging in: <a href="${appUrl}/guest/reservations.html">${appUrl}/guest/reservations.html</a></p>
    `,
  });
}

export async function sendVenueModifiedEmail(user, booking, {
  message,
  notifyModification,
  previousEventDate,
  previousStartTime,
  previousEndTime,
  previousGuestCount,
  previousVenue,
}) {
  const name = user.full_name || user.guest_name || booking.guest_name || 'Guest';
  const venue = [booking.facility_category, booking.facility_name || booking.facility_room_code]
    .filter(Boolean)
    .join(' — ');
  const eventDate = formatEventDate(booking.event_date);
  const start = formatTime12(booking.start_time);
  const end = formatTime12(booking.end_time);
  const timeRange = start && end ? `${start} – ${end}` : '—';
  const price = booking.total_amount != null ? `₱${Number(booking.total_amount).toFixed(2)}` : '—';
  const prevStart = formatTime12(previousStartTime);
  const prevEnd = formatTime12(previousEndTime);
  const messageBlock = notifyModification && message
    ? `<blockquote style="margin:1rem 0;padding:0.75rem 1rem;background:#f8fafc;border-left:4px solid #1A365D;">${escapeHtml(message)}</blockquote>`
    : '';
  const previousBlock = `
      <p><strong>Previous booking:</strong></p>
      <ul>
        ${previousVenue ? `<li><strong>Venue:</strong> ${escapeHtml(previousVenue)}</li>` : ''}
        <li><strong>Date:</strong> ${escapeHtml(formatEventDate(previousEventDate))}</li>
        <li><strong>Time:</strong> ${escapeHtml(prevStart && prevEnd ? `${prevStart} – ${prevEnd}` : '—')}</li>
        <li><strong>Guests:</strong> ${escapeHtml(previousGuestCount ?? '—')}</li>
      </ul>`;

  return sendMail({
    to: resolveGuestRecipientEmail({ user, booking }),
    subject: 'Your Venue Booking Was Updated — AptSpace',
    html: `
      <h2>Venue Booking Updated</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Your venue booking was reviewed and updated by our team.</p>
      ${messageBlock}
      ${previousBlock}
      <p><strong>Confirmed booking:</strong></p>
      <ul>
        <li><strong>Venue:</strong> ${escapeHtml(venue)}</li>
        <li><strong>Event date:</strong> ${escapeHtml(eventDate)}</li>
        <li><strong>Time:</strong> ${escapeHtml(timeRange)}</li>
        <li><strong>Guests:</strong> ${escapeHtml(booking.guest_count || 1)}</li>
        <li><strong>Estimated total:</strong> ${price}</li>
        <li><strong>Status:</strong> ${escapeHtml(booking.status || 'Approved')}</li>
      </ul>
      <p>Log in to AptSpace to view your booking details.</p>
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
    to: resolveGuestRecipientEmail({ user, group }),
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
    to: resolveGuestRecipientEmail({ user, group }),
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

export async function sendSupportMessageEmail({ guestName, guestEmail, subject, message, page }) {
  const to = getSupportEmail();
  const safeName = escapeHtml(guestName || 'Guest');
  const safeEmail = escapeHtml(guestEmail || 'unknown');
  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message);
  const safePage = page ? escapeHtml(page) : '';

  return sendMail({
    to,
    replyTo: guestEmail || undefined,
    subject: `[AptSpace Support] ${subject}`,
    text: [
      `From: ${guestName || 'Guest'} <${guestEmail || 'unknown'}>`,
      page ? `Page: ${page}` : '',
      `Subject: ${subject}`,
      '',
      message,
    ].filter(Boolean).join('\n'),
    html: `
      <h2>New guest support message</h2>
      <p><strong>From:</strong> ${safeName} &lt;${safeEmail}&gt;</p>
      ${safePage ? `<p><strong>Page:</strong> ${safePage}</p>` : ''}
      <p><strong>Subject:</strong> ${safeSubject}</p>
      <hr />
      <div style="white-space:pre-wrap;font-family:Arial,sans-serif;line-height:1.5;">${safeMessage}</div>
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
