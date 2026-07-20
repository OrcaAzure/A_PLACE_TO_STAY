import {
  listRecycleInvoices,
  listRecycleReservations,
  restoreInvoice,
  purgeInvoice,
  restoreReservation,
  purgeReservation,
  softDeleteRoomBooking,
  softDeleteFacilityBooking,
  softDeleteGroup,
} from '../services/recycle.service.js';

export async function getRecycleBin(req, res) {
  try {
    const [invoices, reservations] = await Promise.all([
      listRecycleInvoices(),
      listRecycleReservations(),
    ]);
    res.json({ invoices, reservations });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load recycle bin' });
  }
}

export async function restoreRecycleItem(req, res) {
  try {
    const { type, kind, id } = req.body || {};
    if (!id) return res.status(400).json({ message: 'id is required' });

    if (type === 'invoice') {
      const result = await restoreInvoice(id);
      return res.json({ message: 'Invoice restored', ...result });
    }
    if (type === 'reservation') {
      const result = await restoreReservation({ kind, id });
      return res.json({ message: 'Reservation restored', ...result });
    }
    return res.status(400).json({ message: 'type must be invoice or reservation' });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Could not restore item' });
  }
}

export async function purgeRecycleItem(req, res) {
  try {
    const { type, kind, id } = req.body || {};
    if (!id) return res.status(400).json({ message: 'id is required' });

    if (type === 'invoice') {
      const result = await purgeInvoice(id);
      return res.json({ message: 'Invoice permanently deleted', ...result });
    }
    if (type === 'reservation') {
      const result = await purgeReservation({ kind, id });
      return res.json({ message: 'Reservation permanently deleted', ...result });
    }
    return res.status(400).json({ message: 'type must be invoice or reservation' });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Could not permanently delete item' });
  }
}

export async function softDeleteReservation(req, res) {
  try {
    const { kind, id } = req.body || {};
    if (!kind || !id) return res.status(400).json({ message: 'kind and id are required' });
    const actor = req.user.id;
    let result;
    if (kind === 'room') result = await softDeleteRoomBooking(id, actor);
    else if (kind === 'venue') result = await softDeleteFacilityBooking(id, actor);
    else if (kind === 'group') result = await softDeleteGroup(id, actor);
    else return res.status(400).json({ message: 'kind must be room, venue, or group' });
    res.json({ message: 'Moved to recycle bin', ...result });
  } catch (err) {
    const status = /paid invoice/i.test(err.message) ? 409 : 400;
    res.status(status).json({ message: err.message || 'Could not delete reservation' });
  }
}
