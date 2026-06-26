/**
 * Guest settings — profile from API, password change handled in the page script.
 */

import { getProfile, updateProfile } from '/assets/js/services/api.js';

export async function loadGuestSettings() {
  const nameInput = document.getElementById('settings-name');
  const emailInput = document.getElementById('settings-email');
  const feedback = document.getElementById('settings-feedback');
  const saveBtn = document.getElementById('settings-save-btn');

  try {
    const { user } = await getProfile();
    if (nameInput) nameInput.value = user.full_name || '';
    if (emailInput) emailInput.value = user.email || '';
    localStorage.setItem('user', JSON.stringify(user));
  } catch (err) {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (nameInput) nameInput.value = user.full_name || user.name || '';
    if (emailInput) emailInput.value = user.email || '';
    if (feedback) {
      feedback.textContent = `Could not refresh profile: ${err.message}`;
      feedback.className = 'text-body-sm text-error bg-error-container rounded-lg px-3 py-2';
      feedback.classList.remove('hidden');
    }
  }

  saveBtn?.addEventListener('click', async () => {
    saveBtn.disabled = true;
    feedback?.classList.add('hidden');

    try {
      const result = await updateProfile({ full_name: nameInput.value.trim() });
      localStorage.setItem('user', JSON.stringify(result.user));
      if (feedback) {
        feedback.textContent = 'Profile saved.';
        feedback.className = 'text-body-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2';
        feedback.classList.remove('hidden');
      }
    } catch (err) {
      if (feedback) {
        feedback.textContent = err.message || 'Save failed';
        feedback.className = 'text-body-sm text-error bg-error-container rounded-lg px-3 py-2';
        feedback.classList.remove('hidden');
      }
    } finally {
      saveBtn.disabled = false;
    }
  });
}
