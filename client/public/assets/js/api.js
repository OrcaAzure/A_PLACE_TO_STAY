/**
 * AptSpace API client
 */
export const API_URL = 'http://localhost:5000/api';

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
  return {
    id: booking.id,
    roomId: booking.room_id,
    title: booking.guest_name || booking.title || `Booking #${booking.id}`,
    startDate: booking.check_in || booking.startDate,
    endDate: booking.check_out || booking.endDate,
    status,
    guestCount: booking.guest_count,
    totalAmount: booking.total_amount,
    notes: booking.notes,
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
