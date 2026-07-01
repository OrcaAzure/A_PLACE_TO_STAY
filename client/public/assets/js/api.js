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

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    data = await response.json();
  }

  if (!response.ok) {
    const message = data?.message || `Request failed (${response.status})`;
    if (response.status === 401 && token && /signed out because|signed in elsewhere|session expired/i.test(message)) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!window.location.pathname.includes('login.html')) {
        window.location.href = '/login.html?reason=session';
      }
    }
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
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      credentials: 'include',
    });
  } finally {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
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

export async function getAvailableRooms(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      query.append(key, value);
    }
  });

  const data = await apiRequest(`/rooms/availability?${query.toString()}`);
  return data.rooms || [];
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
  const toDate = (value) => (value ? String(value).slice(0, 10) : null);

  return {
    id: booking.id,
    userId: booking.user_id,
    roomId: booking.room_id,
    title: booking.guest_name || booking.title || `Booking #${booking.id}`,
    startDate: toDate(booking.check_in || booking.startDate),
    endDate: toDate(booking.check_out || booking.endDate),
    status,
    guestCount: booking.guest_count,
    totalAmount: booking.total_amount,
    notes: booking.notes,
    season: booking.season,
    occupancyItem: booking.occupancy_item,
    roomNumber: booking.room_number,
    roomType: booking.room_type,
    buildingName: booking.building_name,
  };
}

export function normalizeManageRequest(booking) {
  const checkIn = booking.check_in || booking.checkIn;
  const checkOut = booking.check_out || booking.checkOut;
  const toDate = (value) => (value ? String(value).slice(0, 10) : null);

  return {
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
