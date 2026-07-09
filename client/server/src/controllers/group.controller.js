import {
  listGroups,
  getGroupById,
  createReservationGroup,
  updateReservationGroup,
  deleteReservationGroup,
  suggestRoomsForGroup,
} from '../services/group.service.js';
import { isAdminRole, isAdminPortalRole } from '../utils/constants.js';

export const getAllGroups = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const admin = isAdminPortalRole(role);
    const groups = await listGroups({ userId, admin });
    res.status(200).json({ groups });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getGroup = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const group = await getGroupById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group reservation not found' });
    if (!isAdminPortalRole(role) && group.user_id !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    res.status(200).json({ group });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const suggestRooms = async (req, res) => {
  try {
    const { check_in, check_out, total_guests, exclude_group_id } = req.query;
    if (!check_in || !check_out) {
      return res.status(400).json({ message: 'check_in and check_out are required' });
    }
    const result = await suggestRoomsForGroup({
      checkIn: check_in,
      checkOut: check_out,
      totalGuests: total_guests || 1,
      excludeGroupId: exclude_group_id || null,
      bypassAdvanceLimit: isAdminRole(req.user.role),
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const createGroup = async (req, res) => {
  try {
    const { role, id: requesterId } = req.user;
    const isAdmin = isAdminRole(role);
    const group = await createReservationGroup({
      requesterId,
      isAdmin,
      ...req.body,
    });
    res.status(201).json({ message: 'Group reservation created', group });
  } catch (error) {
    const status = error.message.includes('booked') || error.message.includes('Maximum') || error.message.includes('maintenance') || error.message.includes('advance') || error.message.includes('past')
      ? 409 : 400;
    res.status(status).json({ message: error.message });
  }
};

export const updateGroup = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const group = await updateReservationGroup(req.params.id, req.body, {
      isAdmin: isAdminRole(role),
      userId,
    });
    res.status(200).json({ message: 'Group reservation updated', group });
  } catch (error) {
    const status = error.message.includes('Forbidden') ? 403
      : error.message.includes('booked') || error.message.includes('Maximum') ? 409 : 400;
    res.status(status).json({ message: error.message });
  }
};

export const deleteGroup = async (req, res) => {
  try {
    const existing = await getGroupById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Group reservation not found' });
    await deleteReservationGroup(req.params.id);
    res.status(200).json({ message: 'Group reservation deleted' });
  } catch (error) {
    const status = error.message.includes('paid invoice') ? 409 : 500;
    res.status(status).json({ message: error.message });
  }
};
