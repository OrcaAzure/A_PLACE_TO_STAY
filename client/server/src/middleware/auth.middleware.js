import { extractToken, resolveAuthUser } from '../utils/authToken.js';

export const requireAuth = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const user = await resolveAuthUser(token);
    if (!user) {
      return res.status(401).json({
        message: 'You were signed out because this account was used on another device. Please log in again.',
      });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
