const token = localStorage.getItem('token');
const userData = localStorage.getItem('user');

if (!token) {
  window.location.href = './login.html';
}

const welcome = document.getElementById('welcome');
const logoutBtn = document.getElementById('logoutBtn');

if (userData && welcome) {
  const user = JSON.parse(userData);
  welcome.textContent = `Welcome, ${user.name} (${user.role})`;
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = './login.html';
  });
}