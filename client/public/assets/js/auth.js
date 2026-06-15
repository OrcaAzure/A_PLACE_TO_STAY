import { login } from './api.js';

export function requireAuth() {
  if (!localStorage.getItem('token')) {
    window.location.href = '../login.html';
    return false;
  }
  return true;
}

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

const form = document.getElementById('loginForm');
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');
    const btn = form.querySelector('button[type="submit"]');

    btn.disabled = true;
    errorEl?.classList.add('hidden');

    try {
      const data = await login(email, password);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.href = './admin/dashboard.html';
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
      } else {
        alert(err.message);
      }
    } finally {
      btn.disabled = false;
    }
  });
}
