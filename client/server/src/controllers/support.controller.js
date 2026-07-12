import { getMe } from '../services/auth.service.js';
import {
  getSupportEmail,
  isEmailDevMode,
  sendSupportMessageEmail,
} from '../services/email.service.js';

const MAX_SUBJECT_LEN = 160;
const MAX_MESSAGE_LEN = 4000;

export const getSupportContact = async (_req, res) => {
  res.status(200).json({
    email: getSupportEmail(),
    label: 'Facilities team',
  });
};

export const sendSupportMessage = async (req, res) => {
  try {
    const subject = String(req.body?.subject || '').trim();
    const message = String(req.body?.message || '').trim();
    const page = String(req.body?.page || '').trim().slice(0, 200);

    if (!subject) {
      return res.status(400).json({ message: 'Subject is required.' });
    }
    if (!message) {
      return res.status(400).json({ message: 'Message is required.' });
    }
    if (subject.length > MAX_SUBJECT_LEN) {
      return res.status(400).json({ message: `Subject must be ${MAX_SUBJECT_LEN} characters or fewer.` });
    }
    if (message.length > MAX_MESSAGE_LEN) {
      return res.status(400).json({ message: `Message must be ${MAX_MESSAGE_LEN} characters or fewer.` });
    }

    const user = await getMe(req.user.id);
    const guestName = user.full_name || user.name || 'Guest';
    const guestEmail = user.email || req.user.email;

    if (!guestEmail) {
      return res.status(400).json({ message: 'Your account does not have an email address on file.' });
    }

    const sent = await sendSupportMessageEmail({
      guestName,
      guestEmail,
      subject,
      message,
      page: page || undefined,
    });

    if (!sent) {
      if (isEmailDevMode()) {
        return res.status(200).json({
          message: 'Message logged in development mode. Configure SMTP to deliver to Gmail.',
          dev: true,
        });
      }
      return res.status(503).json({ message: 'Could not send your message right now. Please try again later.' });
    }

    res.status(200).json({ message: 'Your message has been sent. We will get back to you soon.' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not send your message.' });
  }
};
