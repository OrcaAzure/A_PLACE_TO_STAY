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

export async function getUsers() {
  const data = await apiRequest('/users');
  return data.users || [];
}

export async function getUserById(id) {
  const data = await apiRequest(`/users/${id}`);
  return data.user;
}

export async function getRooms() {
  const data = await apiRequest('/rooms');
  return data.rooms || [];
}

export async function getRoomById(id) {
  const data = await apiRequest(`/rooms/${id}`);
  return data.room;
}

export async function getVenueFacilities() {
  const data = await apiRequest('/facilities');
  return data.venues || [];
}

export async function getFacilitiesOverview() {
  return apiRequest('/facilities/overview');
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
  };
}

export async function getMealRates() {
  const data = await apiRequest('/bookings/meal-rates');
  return data.rates || { Breakfast: 175, Lunch: 225, Dinner: 225, Snack: 85 };
}

export async function getPayments() {
  try {
    const data = await apiRequest('/payments');
    return data.payments || [];
  } catch {
    return [];
  }
}

export function normalizeRoom(room) {
  return {
    id: room.id,
    building: room.building_name || room.building || 'Unknown',
    roomNumber: room.room_number,
    roomType: room.room_type,
    status: room.status,
    capacityMax: room.capacity_max,
    occupancy: room.occupancy,
  };
}

export function normalizeBooking(booking) {
  const status = (booking.status || 'Pending').toLowerCase();
  const building = booking.building_name || booking.building || '';
  const roomNumber = booking.room_number || '';
  const facilityLabel = [building, roomNumber].filter(Boolean).join(' ') || `Booking #${booking.id}`;

  return {
    id: booking.id,
    userId: booking.user_id,
    roomId: booking.room_id,
    title: booking.guest_name ? facilityLabel : (booking.title || facilityLabel),
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
