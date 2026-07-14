import { submitGuestBookingRequest } from '../services/booking-request.service.js';
import { isAdminPortalRole } from '../utils/constants.js';

export const submitBookingRequest = async (req, res) => {
  try {
    if (isAdminPortalRole(req.user.role)) {
      return res.status(403).json({ message: 'Use the admin reservation tools to create bookings on behalf of guests.' });
    }

    const {
      contact_name,
      contact_phone,
      group_name,
      check_in,
      check_out,
      notes,
      rooms,
      venues,
      meals,
      fees,
      meal_allergen_notes,
      is_group_stay,
    } = req.body;

    const result = await submitGuestBookingRequest({
      userId: req.user.id,
      contactName: contact_name,
      contactPhone: contact_phone,
      groupName: group_name,
      checkIn: check_in,
      checkOut: check_out,
      notes,
      rooms: Array.isArray(rooms) ? rooms : [],
      venues: Array.isArray(venues) ? venues : [],
      meals,
      fees,
      is_group_stay,
    });

    res.status(201).json(result);
  } catch (error) {
    const status = error.message.includes('booked')
      || error.message.includes('Maximum')
      || error.message.includes('maintenance')
      || error.message.includes('advance')
      || error.message.includes('overlap')
      || error.message.includes('slot')
      ? 409
      : 400;
    res.status(status).json({ message: error.message });
  }
};
