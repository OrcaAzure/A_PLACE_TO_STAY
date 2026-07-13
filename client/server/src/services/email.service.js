import nodemailer from 'nodemailer';
import { pool } from '../config/db.js';
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

function fmtPeso(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  return `₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function formatStayDate(value) {
  if (!value) return '—';
  return formatEventDate(value);
}

function calcStayNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const inDate = new Date(String(checkIn).slice(0, 10));
  const outDate = new Date(String(checkOut).slice(0, 10));
  if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime())) return null;
  const nights = Math.round((outDate - inDate) / (1000 * 60 * 60 * 24));
  return nights > 0 ? nights : null;
}

function formatMealsSummary(meals = []) {
  const lines = (meals || [])
    .filter((m) => Number(m.quantity) > 0)
    .map((m) => {
      const sub = m.subtotal != null ? ` · ${fmtPeso(m.subtotal)}` : '';
      return `${escapeHtml(m.meal_type)} × ${Number(m.quantity)}${sub}`;
    });
  return lines.length ? lines.join('<br>') : null;
}

function formatFeesSummary(fees = []) {
  const lines = (fees || [])
    .filter((f) => Number(f.amount) > 0)
    .map((f) => `${escapeHtml(f.fee_name || f.service_name || 'Extra service')}: ${fmtPeso(f.amount)}`);
  return lines.length ? lines.join('<br>') : null;
}

function emailSection(title, bodyHtml) {
  if (!bodyHtml) return '';
  return `
    <h3 style="margin:1.25rem 0 0.5rem;font-size:1rem;color:#1A365D;">${escapeHtml(title)}</h3>
    ${bodyHtml}`;
}

function emailDetailList(items) {
  const rows = items.filter(Boolean).join('');
  if (!rows) return '';
  return `<ul style="margin:0.25rem 0 0;padding-left:1.25rem;line-height:1.6;">${rows}</ul>`;
}

function emailDetailItem(label, value) {
  if (value == null || value === '' || value === '—') return '';
  return `<li><strong>${escapeHtml(label)}:</strong> ${value}</li>`;
}

function emailQuote(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  return `<blockquote style="margin:1rem 0;padding:0.75rem 1rem;background:#f8fafc;border-left:4px solid #1A365D;line-height:1.5;">${escapeHtml(trimmed)}</blockquote>`;
}

function emailNotice(text, tone = 'info') {
  const colors = tone === 'warn'
    ? { bg: '#FFFBEB', border: '#F59E0B', text: '#92400E' }
    : { bg: '#EFF6FF', border: '#3B82F6', text: '#1E40AF' };
  return `<p style="margin:1rem 0;padding:0.75rem 1rem;background:${colors.bg};border-left:4px solid ${colors.border};color:${colors.text};font-size:0.95em;line-height:1.5;">${text}</p>`;
}

function appReservationsUrl() {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  return `${appUrl}/guest/reservations.html`;
}

function emailFooter({ includePayment = false } = {}) {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const support = escapeHtml(getSupportEmail());
  const paymentBlock = includePayment ? `
    <p style="margin:1rem 0 0;"><strong>How to pay</strong><br>
    Settle your balance at the Housing office using <strong>Cash</strong>, <strong>GCash</strong>, or <strong>Bank Transfer</strong>.
    Bring this email or your reservation reference when you pay.</p>` : '';
  return `
    ${paymentBlock}
    <p style="margin:1.25rem 0 0.5rem;">
      <a href="${appUrl}/guest/reservations.html">View your reservations in APTSpace</a>
    </p>
    <p style="margin:0.5rem 0 0;color:#718096;font-size:0.9em;">
      Questions? Contact Housing at <a href="mailto:${support}">${support}</a>.
    </p>`;
}

function buildRoomStayDetailSections(booking, { estimate = false } = {}) {
  const room = bookingRoomLabel(booking);
  const nights = booking.nights ?? calcStayNights(booking.check_in, booking.check_out);
  const nightsLabel = nights ? `${nights} night${nights === 1 ? '' : 's'}` : '—';
  const meals = formatMealsSummary(booking.meals);
  const fees = formatFeesSummary(booking.fees);
  const totalLabel = estimate ? 'Estimated total' : 'Total due';

  const stayItems = emailDetailList([
    emailDetailItem('Room', escapeHtml(room)),
    booking.room_type ? emailDetailItem('Room type', escapeHtml(booking.room_type)) : '',
    emailDetailItem('Check-in', escapeHtml(formatStayDate(booking.check_in))),
    emailDetailItem('Check-out', escapeHtml(formatStayDate(booking.check_out))),
    emailDetailItem('Length of stay', escapeHtml(nightsLabel)),
    emailDetailItem('Guests in room', escapeHtml(booking.guest_count ?? '—')),
    booking.season ? emailDetailItem('Season', escapeHtml(booking.season)) : '',
    booking.occupancy_item ? emailDetailItem('Rate type', escapeHtml(booking.occupancy_item)) : '',
    booking.total_amount != null ? emailDetailItem(totalLabel, `<strong>${fmtPeso(booking.total_amount)}</strong>`) : '',
    emailDetailItem('Status', estimate ? 'Pending review' : 'Approved'),
  ].filter(Boolean));

  const contactItems = emailDetailList([
    emailDetailItem('Guest name', escapeHtml(booking.guest_name || '—')),
    booking.contact_phone ? emailDetailItem('Contact phone', escapeHtml(booking.contact_phone)) : '',
    booking.guest_email ? emailDetailItem('Email', escapeHtml(booking.guest_email)) : '',
  ].filter(Boolean));

  let addons = '';
  if (meals) addons += emailSection('Meals', `<p style="margin:0;line-height:1.6;">${meals}</p>`);
  if (fees) addons += emailSection('Extra services', `<p style="margin:0;line-height:1.6;">${fees}</p>`);
  if (booking.meal_allergen_notes) {
    addons += emailSection('Dietary / allergen notes', emailQuote(booking.meal_allergen_notes));
  }
  if (booking.notes && !String(booking.notes).includes('[Modified by admin]')) {
    addons += emailSection('Notes', emailQuote(booking.notes));
  }

  return {
    reference: booking.id ? `#APT-${booking.id}` : null,
    contactItems,
    stayItems,
    addons,
  };
}

function buildGroupStayDetailSections(group, { estimate = false } = {}) {
  const nights = calcStayNights(group.check_in, group.check_out);
  const nightsLabel = nights ? `${nights} night${nights === 1 ? '' : 's'}` : '—';
  const meals = formatMealsSummary(group.meals);
  const fees = formatFeesSummary(group.fees);
  const totalLabel = estimate ? 'Estimated total' : 'Total due';

  const roomRows = (group.bookings || []).map((b) => {
    const label = [`${b.building_name || ''} Room ${b.room_number || '?'}`.trim(), b.room_type].filter(Boolean).join(' · ');
    const guests = b.guest_count != null ? `${b.guest_count} guest${b.guest_count === 1 ? '' : 's'}` : '';
    const cost = b.total_amount != null ? fmtPeso(b.total_amount) : '';
    return emailDetailItem(label || 'Room', [guests, cost].filter(Boolean).join(' · '));
  }).filter(Boolean);

  const stayItems = emailDetailList([
    emailDetailItem('Group / organization', escapeHtml(group.group_name || '—')),
    emailDetailItem('Check-in', escapeHtml(formatStayDate(group.check_in))),
    emailDetailItem('Check-out', escapeHtml(formatStayDate(group.check_out))),
    emailDetailItem('Length of stay', escapeHtml(nightsLabel)),
    emailDetailItem('Total guests', escapeHtml(group.total_guests ?? '—')),
    group.rooms_requested != null ? emailDetailItem('Rooms requested', escapeHtml(String(group.rooms_requested))) : '',
    emailDetailItem('Rooms assigned', escapeHtml(String((group.bookings || []).length || '—'))),
    group.grand_total != null ? emailDetailItem(totalLabel, `<strong>${fmtPeso(group.grand_total)}</strong>`) : '',
    emailDetailItem('Status', estimate ? 'Pending review' : 'Approved'),
  ].filter(Boolean));

  const contactItems = emailDetailList([
    emailDetailItem('Contact person', escapeHtml(group.contact_name || '—')),
    group.contact_phone ? emailDetailItem('Contact phone', escapeHtml(group.contact_phone)) : '',
    emailDetailItem('Email', escapeHtml(group.contact_email || group.requester_email || '—')),
  ].filter(Boolean));

  let addons = '';
  if (roomRows.length) addons += emailSection('Assigned rooms', emailDetailList(roomRows));
  if (meals) addons += emailSection('Meals', `<p style="margin:0;line-height:1.6;">${meals}</p>`);
  if (fees) addons += emailSection('Extra services', `<p style="margin:0;line-height:1.6;">${fees}</p>`);
  if (group.meal_allergen_notes) {
    addons += emailSection('Dietary / allergen notes', emailQuote(group.meal_allergen_notes));
  }
  if (group.notes && !String(group.notes).includes('[Modified by admin]')) {
    addons += emailSection('Notes', emailQuote(group.notes));
  }

  return {
    reference: group.id ? `Group #GRP-${group.id}` : null,
    contactItems,
    stayItems,
    addons,
  };
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

async function guestAcceptsEmail(email, { type = 'general' } = {}) {
  const recipient = String(email || '').trim().toLowerCase();
  if (!recipient) return false;

  try {
    const [rows] = await pool.query(
      `SELECT email_notifications_enabled, email_modification_notices_enabled
       FROM users WHERE LOWER(email) = ? LIMIT 1`,
      [recipient],
    );
    if (!rows.length) return true;
    const row = rows[0];
    if (type === 'modification') {
      return row.email_modification_notices_enabled !== 0;
    }
    return row.email_notifications_enabled !== 0;
  } catch {
    return true;
  }
}

async function sendMail({ to, subject, html, text, replyTo, prefType = null }) {
  const recipient = String(to || '').trim();
  if (!recipient) {
    lastEmailError = 'No recipient email address';
    console.warn(`[email] Skipped — no recipient for subject: ${subject}`);
    return false;
  }

  if (prefType) {
    const allowed = await guestAcceptsEmail(recipient, { type: prefType });
    if (!allowed) {
      lastEmailError = null;
      console.info(`[email] Skipped (${prefType}) — user opted out: ${recipient}`);
      return false;
    }
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
    subject: 'Your APTSpace Guest Access — APTS Housing',
    html: `
      <h2>Welcome to APTSpace, ${name}</h2>
      <p>The APTS Housing Department has created a guest account for you. You can now log in and submit reservation requests online.</p>
      <p><strong>Login email:</strong> ${user.email}</p>
      <p><strong>Temporary password:</strong> ${tempPassword}</p>
      <p>Sign in at <a href="${appUrl}/login.html">${appUrl}/login.html</a> and change your password after your first login.</p>
      <p>If you did not request this access, please contact the Housing Department.</p>
    `,
  });
}

function bookingRoomLabel(booking) {
  return booking.building_name
    ? `${booking.building_name} — Room ${booking.room_number}`
    : `Room ${booking.room_number || booking.room_id}`;
}

export async function sendBookingRequestReceivedEmail(user, booking) {
  const name = user.full_name || user.guest_name || 'Guest';
  const details = buildRoomStayDetailSections(booking, { estimate: true });

  return sendMail({
    to: user.email || user.guest_email,
    prefType: 'general',
    subject: `Reservation request received ${details.reference || ''} — APTSpace`.trim(),
    html: `
      <h2>Reservation Request Received</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>We received your room reservation request. Housing staff will review the details below and email you once it is approved.</p>
      ${emailNotice('The total shown is an <strong>estimate</strong>. Housing staff will confirm your final amount after reviewing your request.', 'warn')}
      ${details.reference ? `<p><strong>Reference:</strong> ${escapeHtml(details.reference)}</p>` : ''}
      ${emailSection('Contact', details.contactItems)}
      ${emailSection('Stay details', details.stayItems)}
      ${details.addons}
      ${emailSection('What happens next', emailDetailList([
        emailDetailItem('Step 1', 'Housing reviews your request for room availability and pricing.'),
        emailDetailItem('Step 2', 'You receive a confirmation email with your <strong>final total</strong> when approved.'),
        emailDetailItem('Step 3', 'Pay at the Housing office before or during check-in.'),
      ].filter(Boolean)))}
      ${emailFooter()}
    `,
  });
}

export async function sendBookingConfirmationEmail(user, booking) {
  const name = user.full_name || user.guest_name || 'Guest';
  const details = buildRoomStayDetailSections(booking, { estimate: false });

  return sendMail({
    to: user.email || user.guest_email,
    prefType: 'general',
    subject: `Reservation confirmed ${details.reference || ''} — APTSpace`.trim(),
    html: `
      <h2>Reservation Confirmed</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Your room reservation has been <strong>approved</strong>. Below are your confirmed stay details and <strong>final amount due</strong>.</p>
      ${details.reference ? `<p><strong>Confirmation:</strong> ${escapeHtml(details.reference)}</p>` : ''}
      ${emailSection('Contact', details.contactItems)}
      ${emailSection('Confirmed stay', details.stayItems)}
      ${details.addons}
      ${emailSection('Before check-in', emailDetailList([
        emailDetailItem('Arrival', 'Please arrive on your check-in date. Contact Housing if your plans change.'),
        emailDetailItem('Payment', 'Settle the amount due at the Housing office (Cash, GCash, or Bank Transfer).'),
        emailDetailItem('Changes', 'Log in to APTSpace to view your reservation or submit a modification request.'),
      ].filter(Boolean)))}
      ${emailFooter({ includePayment: true })}
    `,
  });
}

function cancellationIntro({ cancelledByGuest, reservationType }) {
  if (cancelledByGuest) {
    return `Your ${reservationType} has been cancelled as requested.`;
  }
  return `Your ${reservationType} has been cancelled by housing staff. If you have questions, contact us at ${escapeHtml(getSupportEmail())}.`;
}

export async function sendRoomBookingCancelledEmail(user, booking, { cancelledByGuest = true } = {}) {
  const name = user.full_name || user.guest_name || booking.guest_name || 'Guest';
  const details = buildRoomStayDetailSections(booking, { estimate: false });
  const ref = details.reference ? ` ${details.reference}` : '';

  return sendMail({
    to: resolveGuestRecipientEmail({ user, booking }),
    prefType: 'general',
    subject: `Room reservation cancelled${ref} — APTSpace`.trim(),
    html: `
      <h2>Room Reservation Cancelled</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>${cancellationIntro({ cancelledByGuest, reservationType: 'room reservation' })}</p>
      ${details.reference ? `<p><strong>Reference:</strong> ${escapeHtml(details.reference)}</p>` : ''}
      ${emailSection('Cancelled stay', details.stayItems)}
      ${emailFooter()}
    `,
  });
}

export async function sendVenueBookingCancelledEmail(user, booking, { cancelledByGuest = true } = {}) {
  const name = user.full_name || user.guest_name || booking.guest_name || 'Guest';
  const venue = [booking.facility_category, booking.facility_name || booking.facility_room_code]
    .filter(Boolean)
    .join(' — ');
  const eventDate = formatEventDate(booking.event_date);
  const start = formatTime12(booking.start_time);
  const end = formatTime12(booking.end_time);
  const timeRange = start && end ? `${start} – ${end}` : '—';
  const ref = booking.id ? `#VEN-${booking.id}` : null;

  return sendMail({
    to: resolveGuestRecipientEmail({ user, booking }),
    prefType: 'general',
    subject: `Venue booking cancelled${ref ? ` ${ref}` : ''} — APTSpace`.trim(),
    html: `
      <h2>Venue Booking Cancelled</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>${cancellationIntro({ cancelledByGuest, reservationType: 'venue booking' })}</p>
      ${ref ? `<p><strong>Reference:</strong> ${escapeHtml(ref)}</p>` : ''}
      ${emailSection('Cancelled booking', emailDetailList([
        emailDetailItem('Venue', escapeHtml(venue)),
        emailDetailItem('Event date', escapeHtml(eventDate)),
        emailDetailItem('Time', escapeHtml(timeRange)),
        emailDetailItem('Guests', escapeHtml(booking.guest_count || 1)),
        booking.total_amount != null ? emailDetailItem('Amount', fmtPeso(booking.total_amount)) : '',
        emailDetailItem('Status', 'Cancelled'),
      ].filter(Boolean)))}
      ${emailFooter()}
    `,
  });
}

export async function sendGroupBookingCancelledEmail(user, group, { cancelledByGuest = true } = {}) {
  const name = user.full_name || group.contact_name || 'Guest';
  const details = buildGroupStayDetailSections(group, { estimate: false });
  const ref = details.reference ? ` ${details.reference}` : '';

  return sendMail({
    to: resolveGuestRecipientEmail({ user, group }),
    prefType: 'general',
    subject: `Group reservation cancelled${ref} — APTSpace`.trim(),
    html: `
      <h2>Group Reservation Cancelled</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>${cancellationIntro({ cancelledByGuest, reservationType: 'group reservation' })}</p>
      ${details.reference ? `<p><strong>Reference:</strong> ${escapeHtml(details.reference)}</p>` : ''}
      ${emailSection('Cancelled stay', details.stayItems)}
      ${details.addons}
      ${emailFooter()}
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
  const details = buildRoomStayDetailSections(booking, { estimate: true });
  const previousBlock = wasApproved ? emailSection('Previous reservation', emailDetailList([
    emailDetailItem('Room', escapeHtml(previousRoom || '—')),
    emailDetailItem('Check-in', escapeHtml(formatStayDate(previousCheckIn))),
    emailDetailItem('Check-out', escapeHtml(formatStayDate(previousCheckOut))),
  ].filter(Boolean))) : '';

  return sendMail({
    to: resolveGuestRecipientEmail({ user, booking }),
    prefType: 'general',
    subject: wasApproved
      ? `Modification request received ${details.reference || ''} — APTSpace`.trim()
      : `Reservation updated ${details.reference || ''} — APTSpace`.trim(),
    html: `
      <h2>${wasApproved ? 'Modification Request Received' : 'Reservation Updated'}</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>${guestSelfModifyIntro(wasApproved)}</p>
      ${guestSelfModifyMessageBlock(message)}
      ${details.reference ? `<p><strong>Reference:</strong> ${escapeHtml(details.reference)}</p>` : ''}
      ${previousBlock}
      ${emailSection(wasApproved ? 'Requested changes' : 'Updated details', details.stayItems)}
      ${details.addons}
      ${emailFooter()}
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
  const details = buildGroupStayDetailSections(group, { estimate: true });
  const previousBlock = wasApproved ? emailSection('Previous request', emailDetailList([
    emailDetailItem('Dates', `${escapeHtml(formatStayDate(previousCheckIn))} to ${escapeHtml(formatStayDate(previousCheckOut))}`),
    emailDetailItem('Rooms requested', escapeHtml(previousRoomsRequested ?? '—')),
  ].filter(Boolean))) : '';

  return sendMail({
    to: resolveGuestRecipientEmail({ user, group }),
    prefType: 'general',
    subject: wasApproved
      ? `Group modification request received ${details.reference || ''} — APTSpace`.trim()
      : `Group reservation updated ${details.reference || ''} — APTSpace`.trim(),
    html: `
      <h2>${wasApproved ? 'Group Modification Request Received' : 'Group Reservation Updated'}</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>${guestSelfModifyIntro(wasApproved)}</p>
      ${guestSelfModifyMessageBlock(message)}
      ${details.reference ? `<p><strong>Reference:</strong> ${escapeHtml(details.reference)}</p>` : ''}
      ${previousBlock}
      ${emailSection(wasApproved ? 'Requested changes' : 'Updated details', details.stayItems)}
      ${details.addons}
      ${emailFooter()}
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
  const venue = [booking.facility_category, booking.facility_name || booking.facility_room_code]
    .filter(Boolean)
    .join(' — ');
  const eventDate = formatEventDate(booking.event_date);
  const start = formatTime12(booking.start_time);
  const end = formatTime12(booking.end_time);
  const timeRange = start && end ? `${start} – ${end}` : '—';
  const ref = booking.id ? `#VEN-${booking.id}` : null;
  const prevStart = formatTime12(previousStartTime);
  const prevEnd = formatTime12(previousEndTime);
  const previousBlock = wasApproved ? emailSection('Previous booking', emailDetailList([
    emailDetailItem('Date', escapeHtml(formatEventDate(previousEventDate))),
    emailDetailItem('Time', escapeHtml(prevStart && prevEnd ? `${prevStart} – ${prevEnd}` : '—')),
    emailDetailItem('Guests', escapeHtml(previousGuestCount ?? '—')),
  ].filter(Boolean))) : '';

  return sendMail({
    to: resolveGuestRecipientEmail({ user, booking }),
    prefType: 'general',
    subject: wasApproved
      ? `Venue modification request received${ref ? ` ${ref}` : ''} — APTSpace`.trim()
      : `Venue booking updated${ref ? ` ${ref}` : ''} — APTSpace`.trim(),
    html: `
      <h2>${wasApproved ? 'Venue Modification Request Received' : 'Venue Booking Updated'}</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>${guestSelfModifyIntro(wasApproved)}</p>
      ${guestSelfModifyMessageBlock(message)}
      ${ref ? `<p><strong>Reference:</strong> ${escapeHtml(ref)}</p>` : ''}
      ${previousBlock}
      ${emailSection(wasApproved ? 'Requested details' : 'Updated details', emailDetailList([
        emailDetailItem('Venue', escapeHtml(venue)),
        emailDetailItem('Event date', escapeHtml(eventDate)),
        emailDetailItem('Time', escapeHtml(timeRange)),
        emailDetailItem('Guests', escapeHtml(booking.guest_count || 1)),
        booking.total_amount != null ? emailDetailItem('Estimated total', fmtPeso(booking.total_amount)) : '',
        emailDetailItem('Status', 'Pending review'),
      ].filter(Boolean)))}
      ${emailFooter()}
    `,
  });
}

export async function sendPaymentReceiptEmail(user, payment) {
  const name = user.full_name || user.guest_name || 'Guest';
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
    : `${formatStayDate(payment.check_in)} to ${formatStayDate(payment.check_out)}`;
  const invoiceRef = payment.id ? `#${payment.id}` : null;

  return sendMail({
    to: user.email || user.guest_email,
    prefType: 'general',
    subject: isVenue
      ? `Venue payment confirmed${invoiceRef ? ` ${invoiceRef}` : ''} — APTSpace`.trim()
      : `Housing payment confirmed${invoiceRef ? ` ${invoiceRef}` : ''} — APTSpace`.trim(),
    html: `
      <h2>${isVenue ? 'Venue Payment Confirmed' : 'Housing Payment Confirmed'}</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>We recorded your payment — thank you! Your ${isVenue ? 'venue booking' : 'room reservation'} remains confirmed.</p>
      ${invoiceRef ? `<p><strong>Receipt:</strong> ${escapeHtml(invoiceRef)}</p>` : ''}
      ${emailSection('Payment details', emailDetailList([
        emailDetailItem(isVenue ? 'Venue' : 'Room', escapeHtml(place)),
        emailDetailItem(isVenue ? 'Event' : 'Stay', escapeHtml(when)),
        isVenue && payment.season ? emailDetailItem('Season', escapeHtml(payment.season)) : '',
        isVenue && payment.facility_package ? emailDetailItem('Package', escapeHtml(payment.facility_package)) : '',
        emailDetailItem('Amount paid', `<strong>${fmtPeso(payment.amount)}</strong>`),
        emailDetailItem('Date paid', escapeHtml(formatEmailDateTime(payment.paid_at || payment.created_at))),
        emailDetailItem('Method', escapeHtml(payment.method || '—')),
      ].filter(Boolean)))}
      ${emailFooter()}
    `,
  });
}

export async function sendVenueInvoiceEmail(user, payment) {
  const name = user.full_name || user.guest_name || 'Guest';
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
  const discountLine = discount > 0
    ? emailDetailItem('Discount', `−${fmtPeso(discount)}${payment.discount_note ? ` (${escapeHtml(payment.discount_note)})` : ''}`)
    : '';

  return sendMail({
    to: user.email || user.guest_email,
    prefType: 'general',
    subject: `Venue booking confirmed #${payment.id} — ${payment.facility_name || 'Facility'} | APTSpace`,
    html: `
      <h2>Venue Booking Confirmed</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Your facility / venue reservation has been <strong>approved</strong>. Below are your event details and amount due.</p>
      <p><strong>Invoice #${payment.id}</strong>${payment.facility_booking_id ? ` · Booking #VEN-${payment.facility_booking_id}` : ''}</p>
      ${emailSection('Event details', emailDetailList([
        emailDetailItem('Venue', escapeHtml(venue)),
        emailDetailItem('Event date', escapeHtml(eventDate)),
        emailDetailItem('Time', escapeHtml(timeRange)),
        emailDetailItem('Guests', escapeHtml(payment.guest_count || 1)),
        payment.season ? emailDetailItem('Season', escapeHtml(payment.season)) : '',
        payment.facility_package ? emailDetailItem('Package', escapeHtml(payment.facility_package)) : '',
        emailDetailItem('Subtotal', fmtPeso(subtotal)),
        discountLine,
        emailDetailItem('Amount due', `<strong>${fmtPeso(due)}</strong>`),
        emailDetailItem('Status', 'Approved'),
      ].filter(Boolean)))}
      ${emailFooter({ includePayment: true })}
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
  const ref = booking.id ? `#VEN-${booking.id}` : null;
  const prevStart = formatTime12(previousStartTime);
  const prevEnd = formatTime12(previousEndTime);
  const messageBlock = notifyModification && message ? emailQuote(message) : '';

  return sendMail({
    to: resolveGuestRecipientEmail({ user, booking }),
    prefType: 'modification',
    subject: `Venue booking updated${ref ? ` ${ref}` : ''} — APTSpace`.trim(),
    html: `
      <h2>Venue Booking Updated</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Housing reviewed your venue request and approved it with the updates below.</p>
      ${messageBlock}
      ${ref ? `<p><strong>Reference:</strong> ${escapeHtml(ref)}</p>` : ''}
      ${emailSection('Previous booking', emailDetailList([
        previousVenue ? emailDetailItem('Venue', escapeHtml(previousVenue)) : '',
        emailDetailItem('Date', escapeHtml(formatEventDate(previousEventDate))),
        emailDetailItem('Time', escapeHtml(prevStart && prevEnd ? `${prevStart} – ${prevEnd}` : '—')),
        emailDetailItem('Guests', escapeHtml(previousGuestCount ?? '—')),
      ].filter(Boolean)))}
      ${emailSection('Confirmed booking', emailDetailList([
        emailDetailItem('Venue', escapeHtml(venue)),
        emailDetailItem('Event date', escapeHtml(eventDate)),
        emailDetailItem('Time', escapeHtml(timeRange)),
        emailDetailItem('Guests', escapeHtml(booking.guest_count || 1)),
        booking.total_amount != null ? emailDetailItem('Total due', `<strong>${fmtPeso(booking.total_amount)}</strong>`) : '',
        emailDetailItem('Status', escapeHtml(booking.status || 'Approved')),
      ].filter(Boolean)))}
      ${emailFooter({ includePayment: true })}
    `,
  });
}

export async function sendBookingModifiedEmail(user, booking, { message, previousRoom, previousCheckIn, previousCheckOut }) {
  const name = user.full_name || user.guest_name || 'Guest';
  const details = buildRoomStayDetailSections(booking, { estimate: false });

  return sendMail({
    to: user.email || user.guest_email,
    prefType: 'modification',
    subject: `Reservation updated ${details.reference || ''} — APTSpace`.trim(),
    html: `
      <h2>Reservation Updated</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Housing reviewed your request and approved it with the updates below.</p>
      ${emailQuote(message)}
      ${details.reference ? `<p><strong>Confirmation:</strong> ${escapeHtml(details.reference)}</p>` : ''}
      ${emailSection('Previous request', emailDetailList([
        emailDetailItem('Room', escapeHtml(previousRoom || '—')),
        emailDetailItem('Check-in', escapeHtml(formatStayDate(previousCheckIn))),
        emailDetailItem('Check-out', escapeHtml(formatStayDate(previousCheckOut))),
      ].filter(Boolean)))}
      ${emailSection('Confirmed stay', details.stayItems)}
      ${details.addons}
      ${emailFooter({ includePayment: true })}
    `,
  });
}

export async function sendGroupBookingRequestReceivedEmail(user, group, { batchRef } = {}) {
  const name = user.full_name || group.contact_name || 'Guest';
  const details = buildGroupStayDetailSections(group, { estimate: true });
  const ref = batchRef || details.reference || '';

  return sendMail({
    to: resolveGuestRecipientEmail({ user, group }),
    prefType: 'general',
    subject: `Group reservation request received ${ref ? ref : ''} — APTSpace`.trim(),
    html: `
      <h2>Group Reservation Request Received</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>We received your group room reservation request for <strong>${escapeHtml(group.group_name || 'your group')}</strong>. Housing staff will review the details below and email you once it is approved.</p>
      ${emailNotice('The total shown is an <strong>estimate</strong>. Housing staff will confirm your final amount after reviewing your request.', 'warn')}
      ${ref ? `<p><strong>Reference:</strong> ${escapeHtml(ref)}</p>` : ''}
      ${details.reference ? `<p><strong>Group:</strong> ${escapeHtml(details.reference)}</p>` : ''}
      ${emailSection('Contact', details.contactItems)}
      ${emailSection('Stay details', details.stayItems)}
      ${details.addons}
      ${emailSection('What happens next', emailDetailList([
        emailDetailItem('Step 1', 'Housing reviews your request for room availability and pricing.'),
        emailDetailItem('Step 2', 'You receive a confirmation email with your <strong>final total</strong> when approved.'),
        emailDetailItem('Step 3', 'Pay at the Housing office before or during check-in.'),
      ].filter(Boolean)))}
      ${emailFooter()}
    `,
  });
}

export async function sendGroupConfirmationEmail(user, group) {
  const name = user.full_name || group.contact_name || 'Guest';
  const details = buildGroupStayDetailSections(group, { estimate: false });

  return sendMail({
    to: resolveGuestRecipientEmail({ user, group }),
    prefType: 'general',
    subject: `Group reservation confirmed ${details.reference || ''} — APTSpace`.trim(),
    html: `
      <h2>Group Reservation Confirmed</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Your group reservation for <strong>${escapeHtml(group.group_name || 'your group')}</strong> has been <strong>approved</strong>. Below are your confirmed details and final amount due.</p>
      ${details.reference ? `<p><strong>Confirmation:</strong> ${escapeHtml(details.reference)}</p>` : ''}
      ${emailSection('Contact', details.contactItems)}
      ${emailSection('Confirmed stay', details.stayItems)}
      ${details.addons}
      ${emailSection('Before check-in', emailDetailList([
        emailDetailItem('Arrival', 'Please coordinate with Housing if your group size or room needs change.'),
        emailDetailItem('Payment', 'Settle the group balance at the Housing office (Cash, GCash, or Bank Transfer).'),
      ].filter(Boolean)))}
      ${emailFooter({ includePayment: true })}
    `,
  });
}

export async function sendGroupModifiedEmail(user, group, { message, previousCheckIn, previousCheckOut, previousRoomsRequested }) {
  const name = user.full_name || group.contact_name || 'Guest';
  const details = buildGroupStayDetailSections(group, { estimate: false });

  return sendMail({
    to: resolveGuestRecipientEmail({ user, group }),
    prefType: 'modification',
    subject: `Group reservation updated ${details.reference || ''} — APTSpace`.trim(),
    html: `
      <h2>Group Reservation Updated</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Housing reviewed your group request for <strong>${escapeHtml(group.group_name || 'your group')}</strong> and approved it with changes.</p>
      ${emailQuote(message)}
      ${details.reference ? `<p><strong>Confirmation:</strong> ${escapeHtml(details.reference)}</p>` : ''}
      ${emailSection('Previous request', emailDetailList([
        emailDetailItem('Dates', `${escapeHtml(formatStayDate(previousCheckIn))} to ${escapeHtml(formatStayDate(previousCheckOut))}`),
        emailDetailItem('Rooms requested', escapeHtml(previousRoomsRequested ?? '—')),
      ].filter(Boolean)))}
      ${emailSection('Confirmed stay', details.stayItems)}
      ${details.addons}
      ${emailFooter({ includePayment: true })}
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
    subject: `[APTSpace Support] ${subject}`,
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
    subject: 'Reset Your APTSpace Password',
    html: `
      <h2>Password Reset Request</h2>
      <p>Hi ${name},</p>
      <p>We received a request to reset your password. Click the link below to choose a new password (valid for 1 hour):</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  });
}
