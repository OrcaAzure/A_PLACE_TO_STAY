/**
 * Guest settings — profile and notification prefs from API.
 */

import { getProfile, updateProfile } from '/assets/js/services/api.js';
import { getCurrentUser, setAuthSession, updateCachedUser } from '/assets/js/services/auth.js';

function showFeedback(el, message, isError = false) {
  if (!el) return;
  el.textContent = message;
  el.className = isError
    ? 'text-body-sm text-error bg-error-container rounded-lg px-3 py-2'
    : 'text-body-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2';
  el.classList.remove('hidden');
}

export async function loadGuestSettings() {
  const nameInput = document.getElementById('settings-name');
  const emailInput = document.getElementById('settings-email');
  const feedback = document.getElementById('settings-feedback');
  const saveBtn = document.getElementById('settings-save-btn');
  const emailNotifInput = document.getElementById('pref-email-notifications');
  const emailModsInput = document.getElementById('pref-email-modifications');
  const notifFeedback = document.getElementById('notif-prefs-feedback');
  const notifSaveBtn = document.getElementById('notif-prefs-save-btn');

  let user = null;

  try {
    const profile = await getProfile();
    user = profile.user;
    if (nameInput) nameInput.value = user.full_name || '';
    if (emailInput) emailInput.value = user.email || '';
    if (emailNotifInput) emailNotifInput.checked = user.email_notifications_enabled !== false;
    if (emailModsInput) emailModsInput.checked = user.email_modification_notices_enabled !== false;
    setAuthSession(user);
  } catch (err) {
    user = getCurrentUser() || {};
    if (nameInput) nameInput.value = user.full_name || user.name || '';
    if (emailInput) emailInput.value = user.email || '';
    if (emailNotifInput) emailNotifInput.checked = user.email_notifications_enabled !== false;
    if (emailModsInput) emailModsInput.checked = user.email_modification_notices_enabled !== false;
    showFeedback(feedback, `Could not refresh profile: ${err.message}`, true);
  }

  saveBtn?.addEventListener('click', async () => {
    saveBtn.disabled = true;
    feedback?.classList.add('hidden');

    try {
      const result = await updateProfile({ full_name: nameInput.value.trim() });
      updateCachedUser(result.user);
      showFeedback(feedback, 'Profile saved.');
    } catch (err) {
      showFeedback(feedback, err.message || 'Save failed', true);
    } finally {
      saveBtn.disabled = false;
    }
  });

  notifSaveBtn?.addEventListener('click', async () => {
    notifSaveBtn.disabled = true;
    notifFeedback?.classList.add('hidden');

    try {
      const result = await updateProfile({
        email_notifications_enabled: Boolean(emailNotifInput?.checked),
        email_modification_notices_enabled: Boolean(emailModsInput?.checked),
      });
      updateCachedUser(result.user);
      showFeedback(notifFeedback, 'Notification preferences saved.');
    } catch (err) {
      showFeedback(notifFeedback, err.message || 'Save failed', true);
    } finally {
      notifSaveBtn.disabled = false;
    }
  });
}
