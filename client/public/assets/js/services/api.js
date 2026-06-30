/**
 * AptSpace API client
 */
export const API_URL = `${window.location.origin}/api`;

function getToken() {
  return localStorage.getItem('token');
}

export async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    data = await response.json();
  }

  if (!response.ok) {
    const message = data?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

export async function login(email, password) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export async function getProfile() {
  return apiRequest('/auth/me');
}

export async function updateProfile(payload) {
  return apiRequest('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function changePassword(payload) {
  return apiRequest('/auth/me/password', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function getAdminSummary() {
  return apiRequest('/stats/summary');
}

export async function getFiscalYear() {
  return apiRequest('/settings/fiscal-year');
}

export async function updateFiscalYearSettings(payload) {
  return apiRequest('/settings/fiscal-year', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function getUsers(params = {}) {
  const qs = new URLSearchParams();
  if (params.role) qs.set('role', params.role);
  if (params.status) qs.set('status', params.status);
  const query = qs.toString();
  const data = await apiRequest(`/users${query ? `?${query}` : ''}`);
  return data.users || [];
}

export async function getGuestAccessOverview() {
  return apiRequest('/users/guest-access');
}

export async function getGuestAccessRequests(params = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  const query = qs.toString();
  const data = await apiRequest(`/users/guest-access/requests${query ? `?${query}` : ''}`);
  return data.requests || [];
}

export async function createGuestAccessRequest(payload) {
  return apiRequest('/users/guest-access/requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function approveGuestAccessRequest(id) {
  return apiRequest(`/users/guest-access/requests/${id}/approve`, { method: 'POST' });
}

export async function rejectGuestAccessRequest(id, payload = {}) {
  return apiRequest(`/users/guest-access/requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function bulkDeactivateGuests(payload = {}) {
  return apiRequest('/users/guest-access/bulk-deactivate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getGuestAccessActivity(limit = 25) {
  const data = await apiRequest(`/users/guest-access/activity?limit=${limit}`);
  return data.entries || [];
}

export async function getGuestUsers(params = {}) {
  return getUsers({ role: 'External Guest', ...params });
}

export async function createGuestUser(payload) {
  return apiRequest('/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateUser(id, payload) {
  return apiRequest(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function getUserById(id) {
  const data = await apiRequest(`/users/${id}`);
  return data.user;
}

export async function getRooms(params = {}) {
  const qs = new URLSearchParams();
  if (params.status && params.status !== 'all') qs.set('status', params.status);
  if (params.building_id) qs.set('building_id', String(params.building_id));
  if (params.search) qs.set('search', params.search);
  const query = qs.toString();
  const data = await apiRequest(`/rooms${query ? `?${query}` : ''}`);
  return data.rooms || [];
}

export async function getRoomsOverview(params = {}) {
  const qs = new URLSearchParams();
  if (params.status && params.status !== 'all') qs.set('status', params.status);
  if (params.building_id) qs.set('building_id', String(params.building_id));
  if (params.search) qs.set('search', params.search);
  const query = qs.toString();
  return apiRequest(`/rooms/overview${query ? `?${query}` : ''}`);
}

export async function getRoomById(id) {
  const data = await apiRequest(`/rooms/${id}`);
  return data.room;
}

export async function checkVenueSlotAvailability({
  category, item, facility_id, event_venue_id, room_code, event_date, start_time, end_time,
}) {
  const params = new URLSearchParams({ event_date, start_time, end_time });
  const catalogId = facility_id || event_venue_id;
  if (catalogId) params.set('facility_id', String(catalogId));
  if (room_code) params.set('room_code', room_code);
  if (category) params.set('category', category);
  if (item) params.set('item', item);
  return apiRequest(`/facility-bookings/check-slot?${params}`);
}

export async function getVenueRateQuote(categoryOrOpts, item, date) {
  const params = new URLSearchParams();
  if (typeof categoryOrOpts === 'object' && categoryOrOpts !== null) {
    const o = categoryOrOpts;
    const catalogId = o.facility_id || o.event_venue_id;
    if (catalogId) params.set('facility_id', String(catalogId));
    if (o.room_code) params.set('room_code', o.room_code);
    if (o.category) params.set('category', o.category);
    if (o.item) params.set('item', o.item);
    params.set('date', o.date);
  } else {
    params.set('category', categoryOrOpts);
    params.set('item', item);
    params.set('date', date);
  }
  return apiRequest(`/facilities/venue-rate?${params}`);
}

export async function getVenueFacilities() {
  const data = await apiRequest('/facilities');
  return data.venues || [];
}

export async function getFacilitiesOverview() {
  return apiRequest('/facilities/overview');
}

export async function createFacilityRate(payload) {
  return apiRequest('/facilities', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateFacilityRate(id, payload) {
  return apiRequest(`/facilities/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteFacilityRate(id) {
  return apiRequest(`/facilities/${id}`, { method: 'DELETE' });
}

export async function createMealRate(payload) {
  return apiRequest('/catalog/meal-rates', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateMealRate(id, payload) {
  return apiRequest(`/catalog/meal-rates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteMealRate(id) {
  return apiRequest(`/catalog/meal-rates/${id}`, { method: 'DELETE' });
}

export async function createExtraServiceRate(payload) {
  return apiRequest('/catalog/extra-services', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateExtraServiceRate(id, payload) {
  return apiRequest(`/catalog/extra-services/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteExtraServiceRate(id) {
  return apiRequest(`/catalog/extra-services/${id}`, { method: 'DELETE' });
}

export async function getBuildings() {
  const data = await apiRequest('/rooms/buildings/list');
  return data.buildings || [];
}

export async function getBookings() {
  const data = await apiRequest('/bookings');
  return data.bookings || [];
}

export async function getBookingById(id) {
  const data = await apiRequest(`/bookings/${id}`);
  return data.booking;
}

export async function createBooking(payload) {
  return apiRequest('/bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateBooking(id, payload) {
return apiRequest(`/bookings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteBooking(id) {
  return apiRequest(`/bookings/${id}`, { method: 'DELETE' });
}

export async function createRoom(payload) {
  return apiRequest('/rooms', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateRoom(id, payload) {
  return apiRequest(`/rooms/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteRoom(id) {
  return apiRequest(`/rooms/${id}`, { method: 'DELETE' });
}

export async function getRoomAvailability(params = {}) {
  const qs = new URLSearchParams();
  if (params.check_in) qs.set('check_in', params.check_in);
  if (params.check_out) qs.set('check_out', params.check_out);
  if (params.guest_count) qs.set('guest_count', String(params.guest_count));
  if (params.exclude_booking_id) qs.set('exclude_booking_id', String(params.exclude_booking_id));
  if (params.exclude_group_id) qs.set('exclude_group_id', String(params.exclude_group_id));
  if (params.group_picker) qs.set('group_picker', '1');
  return apiRequest(`/bookings/availability?${qs.toString()}`);
}

export async function getGroups() {
  const data = await apiRequest('/groups');
  return data.groups || [];
}

export async function getGroupById(id) {
  const data = await apiRequest(`/groups/${id}`);
  return data.group;
}

export async function suggestGroupRooms(params = {}) {
  const qs = new URLSearchParams();
  if (params.check_in) qs.set('check_in', params.check_in);
  if (params.check_out) qs.set('check_out', params.check_out);
  if (params.total_guests) qs.set('total_guests', String(params.total_guests));
  if (params.exclude_group_id) qs.set('exclude_group_id', String(params.exclude_group_id));
  return apiRequest(`/groups/suggest-rooms?${qs.toString()}`);
}

export async function createGroup(payload) {
  return apiRequest('/groups', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateGroup(id, payload) {
  return apiRequest(`/groups/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function deleteGroup(id) {
  return apiRequest(`/groups/${id}`, { method: 'DELETE' });
}

export function formatGroupId(id) { return `#GRP-${id}`; }

export function normalizeManageGroupRequest(group) {
  return {
    id: group.id,
    kind: 'group',
    displayId: formatGroupId(group.id),
    groupName: group.group_name,
    status: (group.status || 'Pending').toLowerCase(),
    schedule: {
      checkIn: String(group.check_in || '').slice(0, 10),
      checkOut: String(group.check_out || '').slice(0, 10),
    },
    totalGuests: group.total_guests,
    roomsRequested: group.rooms_requested,
    roomCount: group.room_count || 0,
    notes: group.notes,
    requester: {
      name: group.contact_name || group.requester_name || 'Unknown',
      email: group.contact_email || group.requester_email || '',
    },
    userId: group.user_id,
    contactPhone: group.contact_phone,
    contactEmail: group.contact_email || group.requester_email || '',
    submittedAt: group.created_at,
    updatedAt: group.updated_at,
    grandTotal: group.grand_total != null ? Number(group.grand_total) : null,
    mealAllergenNotes: group.meal_allergen_notes || '',
    assignedBookings: (group.bookings || []).map((b) => ({
      id: b.id,
      building: b.building_name,
      roomNumber: b.room_number,
      roomType: b.room_type,
      guestCount: b.guest_count,
      totalAmount: b.total_amount != null ? Number(b.total_amount) : null,
    })),
  };
}

export async function getMealRates() {
  const data = await apiRequest('/bookings/meal-rates');
  return data.rates || { Breakfast: 175, Lunch: 225, Dinner: 225, Snack: 85 };
}

export async function getPayments() {
  const data = await apiRequest('/payments');
  return data.payments || [];
}

export async function getPaymentById(id) {
  const data = await apiRequest(`/payments/${id}`);
  return data.payment;
}

export async function updatePayment(id, payload) {
  return apiRequest(`/payments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function sendPaymentInvoice(id) {
  return apiRequest(`/payments/${id}/send-invoice`, { method: 'POST' });
}

export function normalizeRoom(room) {
  const bedCount = room.bed_count != null ? Number(room.bed_count) : null;
  let roomTypeLabel = room.room_type_label;
  if (!roomTypeLabel && room.room_type === 'Deluxe Apartment') {
    const beds = bedCount ?? (['201', '304'].includes(String(room.room_number)) ? 3 : 2);
    roomTypeLabel = beds >= 3 ? 'Deluxe Apartment (3 beds)' : 'Deluxe Apartment';
  }
  return {
    id: room.id,
    building: room.building_name || room.building || 'Unknown',
    roomNumber: room.room_number,
    roomType: room.room_type,
    roomTypeLabel: roomTypeLabel || room.room_type,
    bedCount,
    status: room.status,
    capacityMax: room.capacity_max,
    occupancy: room.occupancy,
  };
}

export function normalizeBooking(booking) {
  const status = (booking.status || 'Pending').toLowerCase();
  const building = booking.building_name || booking.building || '';
  const roomNumber = booking.room_number || '';
  const roomType = booking.room_type || '';
  const roomPart = roomNumber ? `Room ${roomNumber}` : '';
  const facilityLabel = [roomPart, roomType].filter(Boolean).join(' · ')
    || [building, roomNumber].filter(Boolean).join(' ')
    || `Booking #${booking.id}`;

  return {
    id: booking.id,
    userId: booking.user_id,
    roomId: booking.room_id,
    title: booking.guest_name || booking.title || facilityLabel,
    facilityLabel,
    buildingName: building,
    roomNumber,
    guestName: booking.guest_name,
    startDate: booking.check_in || booking.startDate,
    endDate: booking.check_out || booking.endDate,
    status,
    guestCount: booking.guest_count,
    totalAmount: booking.total_amount,
    notes: booking.notes,
    createdAt: booking.created_at,
    updatedAt: booking.updated_at,
  };
}

export function normalizeManageRequest(booking) {
  const checkIn = booking.check_in || booking.checkIn;
  const checkOut = booking.check_out || booking.checkOut;
  const toDate = (value) => (value ? String(value).slice(0, 10) : null);

  return {
    kind: 'single',
    id: booking.id,
    displayId: `#APT-${booking.id}`,
    title: booking.guest_name || `Booking #${booking.id}`,
    status: (booking.status || 'Pending').toLowerCase(),
    facility: {
      building: booking.building_name || 'Unknown',
      roomNumber: booking.room_number || '',
      roomType: booking.room_type || 'Room',
    },
    schedule: {
      checkIn: toDate(checkIn),
      checkOut: toDate(checkOut),
    },
    guestCount: booking.guest_count,
    notes: booking.notes,
    season: booking.season,
    occupancyItem: booking.occupancy_item,
    contactPhone: booking.contact_phone || null,
    mealAllergenNotes: booking.meal_allergen_notes || '',
    meals: booking.meals || [],
    fees: booking.fees || [],
    requester: {
      name: booking.guest_name || 'Unknown',
      email: booking.guest_email || '',
      role: booking.guest_role || 'Guest',
    },
    submittedAt: booking.created_at,
    updatedAt: booking.updated_at,
    totalAmount: booking.total_amount != null ? Number(booking.total_amount) : null,
    roomId: booking.room_id,
    userId: booking.user_id,
  };
}

export function normalizeUser(user) {
  return {
    id: user.id,
    name: user.full_name || user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.created_at,
  };
}

export async function getVenueScheduleOverview(date, { startTime, endTime } = {}) {
  const params = new URLSearchParams({ date: date || new Date().toISOString().slice(0, 10) });
  if (startTime) params.set('start_time', startTime);
  if (endTime) params.set('end_time', endTime);
  return apiRequest(`/facility-bookings/overview?${params}`);
}

export async function getFacilityBookings() {
  const data = await apiRequest('/facility-bookings');
  return data.bookings || [];
}

export async function createFacilityBooking(payload) {
  const body = { ...payload };
  if (body.start_time) body.start_time = String(body.start_time).slice(0, 5);
  if (body.end_time) body.end_time = String(body.end_time).slice(0, 5);
  return apiRequest('/facility-bookings', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateFacilityBooking(id, payload) {
  return apiRequest(`/facility-bookings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function cancelFacilityBooking(id) {
  return updateFacilityBooking(id, { status: 'Cancelled' });
}

export async function deleteFacilityBooking(id) {
  return apiRequest(`/facility-bookings/${id}`, { method: 'DELETE' });
}

export function normalizeFacilityBooking(row) {
  const fmtTime = (t) => {
    if (!t) return '';
    const [h, m] = String(t).slice(0, 5).split(':').map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  const eventDate = String(row.event_date).slice(0, 10);
  return {
    kind: 'venue',
    id: row.id,
    facilityId: row.facility_id,
    venueCategory: row.facility_category,
    venueName: row.facility_name,
    eventDate,
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    startLabel: fmtTime(row.start_time),
    endLabel: fmtTime(row.end_time),
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    guestCount: row.guest_count,
    status: row.status,
    notes: row.notes,
    packageName: row.facility_package || null,
    totalAmount: row.total_amount != null ? Number(row.total_amount) : null,
    season: row.season,
    submittedAt: row.created_at,
    updatedAt: row.updated_at,
    startDate: eventDate,
    endDate: eventDate,
    title: `${row.facility_category} — ${row.facility_name}`,
    buildingName: row.facility_category,
    roomNumber: row.facility_name,
  };
}
