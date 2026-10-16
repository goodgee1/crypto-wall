// ============ TOASTS ============
const TOAST_STYLES = {
  success: { bg: 'linear-gradient(135deg,#22c55e,#16a34a)', icon: '✓' },
  error:   { bg: 'linear-gradient(135deg,#ef4444,#b91c1c)', icon: '✕' },
  info:    { bg: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', icon: 'ℹ' },
  warn:    { bg: 'linear-gradient(135deg,#f59e0b,#d97706)', icon: '!' }
};

function ensureToastRoot() {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    root.className = 'toast-root';
    document.body.appendChild(root);
  }
  return root;
}

function toast(message, type = 'info', duration = 3500) {
  const root = ensureToastRoot();
  const cfg = TOAST_STYLES[type] || TOAST_STYLES.info;
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.background = cfg.bg;
  el.innerHTML = `<span class="toast-icon">${cfg.icon}</span><span>${message}</span>`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast-in'));
  setTimeout(() => {
    el.classList.remove('toast-in');
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ============ SKELETON LOADERS ============
function skeletonRows(n = 5) {
  return Array.from({ length: n }).map(() => `
    <div class="skeleton skeleton-row"></div>
  `).join('');
}

function skeletonCards(n = 3) {
  return Array.from({ length: n }).map(() => `
    <div class="skeleton skeleton-card"></div>
  `).join('');
}

// ============ ANIMATED COUNTER ============
function animateNumber(el, to, decimals = 2, duration = 800) {
  const from = Number(el.dataset.value || 0);
  el.dataset.value = to;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = from + (to - from) * eased;
    el.textContent = val.toFixed(decimals);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ============ NAV / USER AVATAR ============
function renderNav(active) {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const initial = user ? user.username[0].toUpperCase() : '?';
  const links = [
    { href: '/dashboard.html', label: 'Dashboard', key: 'dashboard' },
    { href: '/wallet.html',    label: 'Wallet',    key: 'wallet' }
  ];
  if (user?.role === 'admin') {
    links.push({ href: '/admin.html', label: 'Admin', key: 'admin' });
  }

  const nav = document.createElement('nav');
  nav.className = 'nav glass';
  nav.innerHTML = `
    <div class="nav-left">
      <div class="brand">
        <div class="brand-logo">₮</div>
        <span>Test<span class="brand-accent">Wallet</span></span>
      </div>
    </div>
    <div class="nav-links">
      ${links.map(l => `
        <a href="${l.href}" class="nav-link ${active === l.key ? 'active' : ''}">${l.label}</a>
      `).join('')}
      <div class="user-chip" data-action="toggle-menu">
        <div class="avatar">${initial}</div>
        <span class="user-name">${user?.username || 'Guest'}</span>
      </div>
      <div class="dropdown glass" id="user-menu">
        <div class="dropdown-header">
          <div class="avatar avatar-lg">${initial}</div>
          <div>
            <div class="dropdown-name">${user?.username || ''}</div>
            <div class="dropdown-email">${user?.email || ''}</div>
          </div>
        </div>
        <a href="/dashboard.html" class="dropdown-item">Dashboard</a>
        <a href="/wallet.html" class="dropdown-item">Wallet</a>
        <a href="#" class="dropdown-item" data-action="logout">Logout</a>
      </div>
    </div>
  `;

  const header = document.querySelector('body > .nav');
  if (header) header.replaceWith(nav);
  else document.body.prepend(nav);

  // toggle dropdown
  nav.querySelector('[data-action="toggle-menu"]').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('user-menu').classList.toggle('open');
  });
  document.addEventListener('click', () => {
    document.getElementById('user-menu')?.classList.remove('open');
  });
}

// ============ GLOBAL LOGOUT HANDLER ============
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action="logout"]');
  if (el) {
    e.preventDefault();
    if (typeof logout === 'function') logout();
    else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.replace('/login.html');
    }
  }
});

// Animated background blobs
document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('.bg-blobs')) {
    const bg = document.createElement('div');
    bg.className = 'bg-blobs';
    bg.innerHTML = '<span></span><span></span><span></span>';
    document.body.prepend(bg);
  }
});