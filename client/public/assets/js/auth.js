import { login } from './api.js';

// Call this at the top of every admin page to block unauthenticated access
export function requireAuth() {
  if (!localStorage.getItem('token')) {
    const isAdmin = window.location.pathname.includes('/admin/');
    const isGuest = window.location.pathname.includes('/guest/');
    if (isAdmin || isGuest) {
      window.location.href = '/login.html';
    }
    return false;
  }
  return true;
}

// Call this on the landing page and login page to skip them if already logged in
export function redirectIfLoggedIn() {
  if (localStorage.getItem('token')) {
    window.location.href = '/admin/dashboard.html';
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

// Login form handler — only runs if loginForm exists on the page
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
      // absolute path so it works no matter what page we're on
      window.location.href = '/admin/dashboard.html';
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