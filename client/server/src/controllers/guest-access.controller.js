import {
  getGuestAccessOverview as buildGuestAccessOverview,
  listGuestAccessRequests,
  createGuestAccessRequest,
  approveGuestAccessRequest,
  rejectGuestAccessRequest,
  bulkDeactivateGuests,
  deleteGuestAccount,
} from '../services/guest-access.service.js';
import { listGuestAccessActivity } from '../services/audit.service.js';

export const getGuestAccessOverview = async (req, res) => {
  try {
    const overview = await buildGuestAccessOverview();
    res.status(200).json(overview);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getGuestAccessRequests = async (req, res) => {
  try {
    const requests = await listGuestAccessRequests({ status: req.query.status });
    res.status(200).json({ requests });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const postGuestAccessRequest = async (req, res) => {
  try {
    const request = await createGuestAccessRequest({
      ...req.body,
      actorUserId: req.user.id,
    });
    res.status(201).json({ message: 'Access request logged', request });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const approveGuestAccessRequestHandler = async (req, res) => {
  try {
    const result = await approveGuestAccessRequest(req.params.id, req.user.id);
    res.status(200).json({ message: 'Access request approved', ...result });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const rejectGuestAccessRequestHandler = async (req, res) => {
  try {
    const request = await rejectGuestAccessRequest(req.params.id, {
      review_notes: req.body.review_notes,
      actorUserId: req.user.id,
    });
    res.status(200).json({ message: 'Access request rejected', request });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const bulkDeactivateGuestAccounts = async (req, res) => {
  try {
    const result = await bulkDeactivateGuests({
      actorUserId: req.user.id,
      userIds: req.body.user_ids,
    });
    res.status(200).json({ message: `${result.deactivated} account(s) deactivated`, ...result });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getGuestAccessActivity = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 25, 50);
    const entries = await listGuestAccessActivity(limit);
    res.status(200).json({ entries });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteGuestAccountHandler = async (req, res) => {
  try {
    const result = await deleteGuestAccount(req.params.id, req.user.id);
    res.status(200).json({ message: 'Guest account deleted', ...result });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
