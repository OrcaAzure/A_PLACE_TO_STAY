import { getProfile, logout as logoutApi } from '/assets/js/services/api.js';
import { isInternalGuestEmail } from '/shared/guest-access.js';

export const LOGGED_IN_KEY = 'aptspace_logged_in';
const USER_KEY = 'user';

export function setAuthSession(user) {
  if (!user) return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  sessionStorage.setItem(LOGGED_IN_KEY, '1');
  localStorage.removeItem('token');
}

export function clearAuthSession() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('token');
  sessionStorage.removeItem(LOGGED_IN_KEY);
}

if (typeof window !== 'undefined') {
  window.addEventListener('aptspace:auth-expired', clearAuthSession);
}

export async function requireAuth() {
  const isAdmin = window.location.pathname.includes('/admin/');
  const isGuest = window.location.pathname.includes('/guest/');
  const portalPath = isAdmin || isGuest;

  try {
    const { user } = await getProfile({ skipAuthRedirect: !portalPath });
    setAuthSession(user);

    const role = user?.role || '';
    const isAdminRole = ADMIN_ROLES.includes(role);

    if (isAdmin && !isAdminRole) {
      window.location.href = '/guest/dashboard.html';
      return false;
    }

    if (isGuest && isAdminRole) {
      window.location.href = '/admin/dashboard.html';
      return false;
    }

    return true;
  } catch {
    clearAuthSession();
    if (portalPath) {
      window.location.href = '/login.html';
    }
    return false;
  }
}

export async function redirectIfLoggedIn() {
  try {
    const { user } = await getProfile({ skipAuthRedirect: true });
    setAuthSession(user);
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    const role = user?.role || '';
    const dest = next || (ADMIN_ROLES.includes(role) ? '/admin/dashboard.html' : '/guest/dashboard.html');
    window.location.href = dest;
  } catch {
    clearAuthSession();
  }
}

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

/** Update cached user after profile changes without re-running full login. */
export function updateCachedUser(user) {
  if (!user) return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/** APTS community members use @apts.edu / @apts.edu.ph addresses. */
export function isInternalGuest(userOrEmail = getCurrentUser()) {
  const email = typeof userOrEmail === 'string' ? userOrEmail : userOrEmail?.email;
  return isInternalGuestEmail(email);
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

export async function doLogout() {
  try {
    await logoutApi();
  } finally {
    clearAuthSession();
  }
  window.location.href = '/login.html';
}
