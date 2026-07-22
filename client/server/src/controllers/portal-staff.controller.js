import {
  listPortalStaff,
  createViewOnlyAdminUser,
  updatePortalStaffUser,
} from '../services/portal-staff.service.js';
import { listPortalStaffActivity } from '../services/audit.service.js';
import { invalidateSession } from '../services/session.service.js';

export const getPortalStaffOverview = async (req, res) => {
  try {
    const overview = await listPortalStaff();
    res.status(200).json(overview);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createPortalStaffHandler = async (req, res) => {
  try {
    const result = await createViewOnlyAdminUser({
      ...req.body,
      actorUserId: req.user.id,
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updatePortalStaffHandler = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const user = await updatePortalStaffUser(userId, req.body, req.user.id);

    if (req.body.status) {
      await invalidateSession(userId);
    }

    res.status(200).json({ message: 'Account updated', user });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getPortalStaffActivity = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 25, 50);
    const entries = await listPortalStaffActivity(limit);
    res.status(200).json({ entries });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
