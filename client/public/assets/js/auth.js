import { login } from './api.js';

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

export function doLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login.html';
}

const form = document.getElementById('loginForm');
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errorEl  = document.getElementById('loginError');
    const btn      = form.querySelector('button[type="submit"]');

    btn.disabled = true;
    btn.textContent = 'Signing in...';
    errorEl?.classList.add('hidden');

    try {
      const data = await login(email, password);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      const role = data.user.role || '';
      if (role === 'Super Admin' || role === 'Admin') {
        window.location.href = '/admin/dashboard.html';
      } else {
        window.location.href = '/guest/dashboard.html';
      }
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || 'Invalid email or password';
        errorEl.classList.remove('hidden');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Log in';
    }
  });
}