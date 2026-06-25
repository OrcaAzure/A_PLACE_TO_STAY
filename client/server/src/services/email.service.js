import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const fromAddress = () => process.env.SMTP_FROM || 'noreply@aptspace.com';

async function sendMail({ to, subject, html }) {
  try {
    await transporter.sendMail({
      from: fromAddress(),
      to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error('Email send failed:', err);
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
  const amount = payment.amount != null ? `₱${Number(payment.amount).toFixed(2)}` : '—';
  const date = payment.paid_at || payment.created_at || new Date().toISOString().slice(0, 10);
  const method = payment.method || '—';

  return sendMail({
    to: user.email || user.guest_email,
    subject: 'Payment Receipt — AptSpace',
    html: `
      <h2>Payment Receipt</h2>
      <p>Hi ${name},</p>
      <p>We received your payment. Here are the details:</p>
      <ul>
        <li><strong>Amount:</strong> ${amount}</li>
        <li><strong>Date:</strong> ${date}</li>
        <li><strong>Method:</strong> ${method}</li>
      </ul>
      <p>Thank you for your payment.</p>
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
