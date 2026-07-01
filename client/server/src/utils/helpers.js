// Strip password from user object before sending to client
export const safeUser = (user) => {
  if (!user) return null;
  const { password, session_id, session_expires_at, ...rest } = user;
  return rest;
};

// Check if a value is empty (null, undefined, or blank string)
export const isEmpty = (value) =>
  value === undefined || value === null || String(value).trim() === '';

// Calculate number of nights between two dates
export const calcNights = (checkIn, checkOut) => {
  const inDate  = new Date(checkIn);
  const outDate = new Date(checkOut);
  const diff    = outDate - inDate;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

// Format a number as Philippine Peso
export const formatPHP = (amount) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);