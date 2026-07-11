import { getNotificationsForUser } from '../services/notification.service.js';

export const listNotifications = async (req, res) => {
  try {
    const data = await getNotificationsForUser(req.user);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Could not load notifications' });
  }
};
