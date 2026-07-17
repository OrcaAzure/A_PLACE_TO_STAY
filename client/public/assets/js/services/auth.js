import { getProfile, logout as logoutApi } from '/assets/js/services/api.js';
import { isInternalGuestEmail } from '/assets/js/config/guest-access.js';

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
    const isAdminPortal = ADMIN_PORTAL_ROLES.includes(role);

    if (isAdmin && !isAdminPortal) {
      window.location.href = '/guest/dashboard.html';
      return false;
    }

    if (isGuest && isAdminPortal) {
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
    const dest = next || (ADMIN_PORTAL_ROLES.includes(role) ? '/admin/dashboard.html' : '/guest/dashboard.html');
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

/* Roles that may perform housing admin write actions. */
export const ADMIN_ROLES = ['Super Admin'];

/* Roles that may open the admin portal (view-only roles included). */
export const ADMIN_PORTAL_ROLES = ['Super Admin', 'Supervisory User', 'View-Only Admin'];

/** Display label for roles in the UI (DB role unchanged). */
export function formatRoleLabel(role) {
  if (role === 'Super Admin') return 'Housing Administrator';
  if (role === 'Supervisory User') return 'Supervisory';
  if (role === 'View-Only Admin') return 'View-Only Admin';
  return role || '';
}

/* Admin portal roles that may only view — no creating/editing/approving. */
export const READ_ONLY_ROLES = ['Supervisory User', 'View-Only Admin'];

export function getUserRole() {
  const user = getCurrentUser();
  return (user && user.role) ? user.role : '';
}

export function getRoleLabel() {
  return formatRoleLabel(getUserRole()) || 'Guest';
}

export function isReadOnlyRole() {
  return READ_ONLY_ROLES.includes(getUserRole());
}

export function canWriteAdmin() {
  return ADMIN_ROLES.includes(getUserRole());
}

/**
 * Tailors the portal UI to the signed-in user's role.
 * - Fills any `.js-portal-label` element with "<Role> Portal".
 * - Reveals/fills any `.js-role-badge` element with the role name.
 * - For read-only admin roles: marks the document with `is-readonly`, hides
 *   `.js-requires-write`, reveals `.js-readonly-banner`, and blocks writes.
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
    document.querySelectorAll('.js-readonly-banner').forEach((el) => {
      el.classList.remove('hidden');
    });
    refreshAdminReadOnlyUI();
  }

  return { role, readOnly };
}

/** Admin-shell write controls to hide for view-only roles (positive list). */
const ADMIN_SHELL_WRITE_HIDE_SELECTORS = [
  '.js-requires-write',
  '[data-approve]',
  '[data-reject]',
  '[data-modify]',
  '[data-reject-confirm]',
  '[data-vb-approve]',
  '[data-vb-reject]',
  '[data-vb-cancel]',
  '[data-vb-edit]',
  '[data-vb-modify]',
  '[data-vb-decline]',
  '[data-edit-res]',
  '[data-cancel-res]',
  '[data-del-res]',
  '[data-del-venue]',
  '[data-ga-approve-request]',
  '[data-ga-reject-request]',
  '[data-ga-deactivate]',
  '[data-ga-activate]',
  '[data-ga-delete]',
  '[data-ga-menu-toggle]',
  '[data-ga-bulk-deactivate]',
  '[data-open-manage-facilities]',
  '[data-open-manage-venues]',
  '[data-open-manage-reservations]',
  '[data-open-manage-requests]',
  '[data-open-create-group]',
  '[data-open-venue-booking-wizard]',
  '[data-room-rates-edit-toggle]',
  '[data-venue-rates-edit-toggle]',
  '[data-catalog-edit-toggle]',
  '[data-catalog-add]',
  '[data-catalog-edit]',
  '[data-catalog-delete]',
  '[data-catalog-add-option]',
  '[data-catalog-confirm-option]',
  '[data-save-room-rate]',
  '[data-save-venue-rate]',
  '[data-add-use]',
  '[data-remove-use]',
  '[data-save-booking-fees]',
  '[data-res-edit-open]',
  '[data-res-confirm-apply]',
  '[data-confirm-paid]',
  '[data-delete-invoice]',
  '[data-send-invoice]',
  '#manage-facilities-new',
  '#manage-facilities-save',
  '#manage-facilities-delete',
  '#manage-facilities-edit',
  '#manage-venues-new',
  '#mv-save',
  '#mv-delete',
  '#guest-access-submit',
  '#catalog-modal-save',
  '#reservation-wizard-next',
  '#reservation-wizard-confirm',
  '#group-wizard-next',
  '#group-wizard-confirm',
  '#venue-wizard-next',
  '#venue-wizard-confirm',
  '.admin-crud-btn-primary',
  '.admin-crud-btn-danger',
  '.res-btn--primary',
  '.res-btn--approve',
  '.res-btn--reject',
  '.res-btn--danger',
  '.res-btn--modify',
  '.fac-rate-save',
  '.catalog-edit-btn',
  '.catalog-delete-btn',
  '.invoice-btn-confirm',
  '.billing-edit-footer__save',
  '.billing-res-edit-btn',
  '.billing-fee-panel__save',
  '.ga-row-menu__item--danger',
].join(',');

const ADMIN_WRITE_CLICK_SELECTORS = [
  ADMIN_SHELL_WRITE_HIDE_SELECTORS,
  'button[type="submit"]:not(.js-readonly-allow)',
].join(',');

const ADMIN_EDITABLE_FIELD_SCOPES = [
  '#page-content',
  '.admin-crud-shell',
  '#guest-access-modal',
  '#catalog-modal',
  '#manage-requests-modal',
  '.billing-detail',
  '.billing-edit-form',
  '.billing-res-edit-form',
].join(',');

let adminReadOnlyGuardsBound = false;
let adminReadOnlyObserverBound = false;
let adminReadOnlyRefreshTimer = null;

function isReadOnlyAdminShell() {
  return isReadOnlyRole() && document.body?.classList.contains('admin-shell');
}

function shouldSuppressReadOnlyWrite(el) {
  return Boolean(el) && !el.closest('.js-readonly-allow');
}

function hideAdminWriteControls() {
  if (!isReadOnlyAdminShell()) return;

  document.body.querySelectorAll(ADMIN_SHELL_WRITE_HIDE_SELECTORS).forEach((el) => {
    if (!shouldSuppressReadOnlyWrite(el)) return;
    if (el.dataset.readonlySuppressed === '1') return;
    el.dataset.readonlySuppressed = '1';
    el.classList.add('hidden', 'readonly-write-suppressed');
    el.setAttribute('aria-hidden', 'true');
    if ('disabled' in el) el.disabled = true;
  });
}

function disableAdminEditableFields() {
  if (!isReadOnlyAdminShell()) return;

  const formSelector = ADMIN_EDITABLE_FIELD_SCOPES.split(',').map((scope) => (
    `${scope.trim()} form:not(.js-readonly-allow)`
  )).join(', ');

  document.body.querySelectorAll(formSelector).forEach((form) => {
    if (form.dataset.readonlyGuard === '1') return;
    form.dataset.readonlyGuard = '1';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, true);
  });

  const fieldSelector = ADMIN_EDITABLE_FIELD_SCOPES.split(',').map((scope) => (
    `${scope.trim()} input:not([type="search"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not(.js-readonly-allow), ${scope.trim()} textarea:not(.js-readonly-allow), ${scope.trim()} select:not(.js-readonly-allow)`
  )).join(', ');

  document.body.querySelectorAll(fieldSelector).forEach((el) => {
    if (!shouldSuppressReadOnlyWrite(el)) return;
    el.setAttribute('readonly', 'readonly');
    if (el.tagName === 'SELECT') el.disabled = true;
  });
}

function scheduleAdminReadOnlyRefresh() {
  if (!isReadOnlyAdminShell()) return;
  clearTimeout(adminReadOnlyRefreshTimer);
  adminReadOnlyRefreshTimer = window.setTimeout(() => {
    hideAdminWriteControls();
    disableAdminEditableFields();
  }, 0);
}

function bindAdminReadOnlyObserver() {
  if (adminReadOnlyObserverBound || typeof MutationObserver === 'undefined') return;
  if (!document.body) return;
  adminReadOnlyObserverBound = true;
  const observer = new MutationObserver(() => scheduleAdminReadOnlyRefresh());
  observer.observe(document.body, { childList: true, subtree: true });
}

/** Re-apply hide/disable rules after dynamic admin content renders. */
export function refreshAdminReadOnlyUI() {
  if (!isReadOnlyAdminShell()) return;
  hideAdminWriteControls();
  disableAdminEditableFields();
}

/** Block write interactions in the admin shell for view-only roles. */
export function applyAdminReadOnlyGuards() {
  if (!isReadOnlyAdminShell()) return;

  refreshAdminReadOnlyUI();
  bindAdminReadOnlyObserver();

  if (adminReadOnlyGuardsBound) return;
  adminReadOnlyGuardsBound = true;

  document.addEventListener('click', (e) => {
    if (!isReadOnlyAdminShell()) return;
    const target = e.target.closest(ADMIN_WRITE_CLICK_SELECTORS);
    if (!target || !shouldSuppressReadOnlyWrite(target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
}

export async function doLogout() {
  try {
    await logoutApi();
  } finally {
    clearAuthSession();
  }
  window.location.href = '/login.html';
}
