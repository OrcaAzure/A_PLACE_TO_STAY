import { login } from '/assets/js/services/api.js';

export function requireAuth() {
  const token = localStorage.getItem('token');
  const isAdmin = window.location.pathname.includes('/admin/');
  const isGuest = window.location.pathname.includes('/guest/');

  if (!token) {
    if (isAdmin || isGuest) {
      window.location.href = '/login.html';
    }
    return false;
  }

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const role = user.role || '';
  const isAdminRole = role === 'Super Admin' || role === 'Admin';

  if (isAdmin && !isAdminRole) {
    window.location.href = '/guest/dashboard.html';
    return false;
  }

  if (isGuest && isAdminRole) {
    window.location.href = '/admin/dashboard.html';
    return false;
  }

  return true;
}

export function redirectIfLoggedIn() {
  if (localStorage.getItem('token')) {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const role = user.role || '';
    if (role === 'Super Admin' || role === 'Admin') {
      window.location.href = '/admin/dashboard.html';
    } else {
      window.location.href = '/guest/dashboard.html';
    }
  }
}

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

/** APTS community members use @apts.edu / @apts.edu.ph addresses. */
export function isInternalGuest(userOrEmail = getCurrentUser()) {
  const email = typeof userOrEmail === 'string' ? userOrEmail : userOrEmail?.email;
  const normalized = String(email || '').trim().toLowerCase();
  return normalized.endsWith('@apts.edu.ph') || normalized.endsWith('@apts.edu');
}

/* Roles that use the admin portal. Everyone else lands in the guest portal. */
export const ADMIN_ROLES = ['Super Admin', 'Admin'];

/** Display label for admin roles in the UI (DB role unchanged). */
export function formatRoleLabel(role) {
  if (role === 'Super Admin') return 'Housing Administrator';
  if (role === 'Admin') return 'Housing Admin';
  return role || '';
}

/* Guest-portal roles that may only view — no creating/editing/cancelling. */
export const READ_ONLY_ROLES = ['Supervisory User'];

export function getUserRole() {
  const user = getCurrentUser();
  return (user && user.role) ? user.role : '';
}

export function getRoleLabel() {
  return getUserRole() || 'Guest';
}

export function isReadOnlyRole() {
  return READ_ONLY_ROLES.includes(getUserRole());
}

/**
 * Tailors the guest UI to the signed-in user's role.
 * - Fills any `.js-portal-label` element with "<Role> Portal".
 * - Reveals/fills any `.js-role-badge` element with the role name.
 * - For read-only roles (e.g. Supervisory User): marks the document with the
 *   `is-readonly` class, hides every `.js-requires-write` element, and reveals
 *   any `.js-readonly-banner`.
 * Returns { role, readOnly } so callers can guard dynamically-rendered actions.
 */
export function applyRoleUI() {
  const role = getRoleLabel();
  const readOnly = isReadOnlyRole();

  document.querySelectorAll('.js-portal-label').forEach((el) => {
    el.textContent = `${role} Portal`;
  });
  document.querySelectorAll('.js-role-badge').forEach((el) => {
    el.textContent = role;
    el.classList.remove('hidden');
  });

  if (readOnly) {
    document.documentElement.classList.add('is-readonly');
    document.querySelectorAll('.js-requires-write').forEach((el) => {
      el.classList.add('hidden');
    });
    document.querySelectorAll('.js-readonly-banner').forEach((el) => {
      el.classList.remove('hidden');
    });
  }

  return { role, readOnly };
}

export function doLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login.html';
}