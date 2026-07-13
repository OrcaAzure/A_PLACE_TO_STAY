/**
 * Guest settings — profile, password, and logout.
 */

import { getProfile, updateProfile, changePassword } from '/assets/js/services/api.js';
import { getCurrentUser, setAuthSession, updateCachedUser } from '/assets/js/services/auth.js';
import { openModal, closeModal } from '/assets/js/layout/ui.js';

function showFeedback(el, message, isError = false) {
  if (!el) return;
  el.textContent = message;
  el.className = isError
    ? 'text-body-sm text-error bg-error-container rounded-lg px-3 py-2'
    : 'text-body-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2';
  el.classList.remove('hidden');
}

/** Matches admin settings confirmation dialogs. */
function confirmGuestAction({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      closeModal();
      resolve(value);
    };

    const confirmBtn = danger
      ? `<button type="button" class="px-5 py-2.5 min-h-[2.75rem] rounded-lg font-semibold text-sm text-white" style="background:#dc2626" data-action="confirm">${confirmLabel}</button>`
      : `<button type="button" class="settings-confirm-save btn-primary px-5 py-2.5 min-h-[2.75rem]" data-action="confirm">${confirmLabel}</button>`;

    openModal(
      title,
      `
        <p class="text-[0.9375rem] text-on-surface-variant leading-relaxed m-0">${message}</p>
        <div class="flex justify-end gap-3 mt-6 pt-5 border-t border-outline-variant">
          <button type="button" class="settings-confirm-cancel px-4 py-2.5 rounded-lg border border-outline-variant text-on-surface-variant font-semibold text-sm hover:bg-surface-variant/30 transition-colors min-h-[2.75rem]" data-action="discard">Cancel</button>
          ${confirmBtn}
        </div>
      `,
    );

    const body = document.getElementById('modalBody');
    body?.querySelector('[data-action="discard"]')?.addEventListener('click', () => finish(false), { once: true });
    body?.querySelector('[data-action="confirm"]')?.addEventListener('click', () => finish(true), { once: true });
    document.getElementById('modal-close')?.addEventListener('click', () => finish(false), { once: true });
    document.getElementById('modal-overlay')?.addEventListener('click', () => finish(false), { once: true });
  });
}

export async function loadGuestSettings() {
  const nameInput = document.getElementById('settings-name');
  const emailInput = document.getElementById('settings-email');
  const phoneInput = document.getElementById('settings-phone');
  const feedback = document.getElementById('settings-feedback');
  const saveBtn = document.getElementById('settings-save-btn');
  const passwordBtn = document.getElementById('update-password-btn');
  const logoutBtn = document.querySelector('[data-action="guest-logout"]');

  try {
    const profile = await getProfile();
    const user = profile.user;
    if (nameInput) nameInput.value = user.full_name || '';
    if (emailInput) emailInput.value = user.email || '';
    if (phoneInput) phoneInput.value = user.contact_phone || '';
    setAuthSession(user);
  } catch (err) {
    const user = getCurrentUser() || {};
    if (nameInput) nameInput.value = user.full_name || user.name || '';
    if (emailInput) emailInput.value = user.email || '';
    if (phoneInput) phoneInput.value = user.contact_phone || '';
    showFeedback(feedback, `Could not refresh profile: ${err.message}`, true);
  }

  saveBtn?.addEventListener('click', async () => {
    const confirmed = await confirmGuestAction({
      title: 'Save changes',
      message: 'Are you sure you want to save your changes?',
      confirmLabel: 'Confirm',
    });
    if (!confirmed) return;

    saveBtn.disabled = true;
    feedback?.classList.add('hidden');

    try {
      const result = await updateProfile({
        full_name: nameInput.value.trim(),
        contact_phone: phoneInput?.value?.trim() || null,
      });
      updateCachedUser(result.user);
      showFeedback(feedback, 'Profile saved.');
    } catch (err) {
      showFeedback(feedback, err.message || 'Save failed', true);
    } finally {
      saveBtn.disabled = false;
    }
  });

  passwordBtn?.addEventListener('click', async () => {
    const currentPw = document.getElementById('current-password')?.value.trim();
    const newPw = document.getElementById('new-password')?.value.trim();
    const confirmPw = document.getElementById('confirm-new-password')?.value.trim();
    const passwordFeedback = document.getElementById('password-feedback');

    const showMsg = (msg, isError) => {
      if (!passwordFeedback) return;
      passwordFeedback.textContent = msg;
      passwordFeedback.className = isError
        ? 'text-body-sm rounded-lg px-3 py-2 bg-error/10 text-error'
        : 'text-body-sm rounded-lg px-3 py-2 bg-emerald-50 text-emerald-700';
      passwordFeedback.classList.remove('hidden');
    };

    if (!currentPw || !newPw || !confirmPw) return showMsg('All password fields are required.', true);
    if (newPw.length < 6) return showMsg('New password must be at least 6 characters.', true);
    if (newPw !== confirmPw) return showMsg('New passwords do not match.', true);

    const confirmed = await confirmGuestAction({
      title: 'Update password',
      message: 'Are you sure you want to update your password?',
      confirmLabel: 'Confirm',
    });
    if (!confirmed) return;

    passwordBtn.disabled = true;
    passwordBtn.textContent = 'Saving…';
    passwordFeedback?.classList.add('hidden');

    try {
      const data = await changePassword({ current_password: currentPw, new_password: newPw });
      showMsg(data.message || 'Password updated.', false);
      ['current-password', 'new-password', 'confirm-new-password'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    } catch (err) {
      showMsg(err.message, true);
    } finally {
      passwordBtn.disabled = false;
      passwordBtn.textContent = 'Update Password';
    }
  });

  logoutBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    const confirmed = await confirmGuestAction({
      title: 'Log out',
      message: 'Sign out of your guest account on this device?',
      confirmLabel: 'Log out',
      danger: true,
    });
    if (!confirmed) return;
    const { doLogout } = await import('/assets/js/services/auth.js');
    await doLogout();
  });
}
