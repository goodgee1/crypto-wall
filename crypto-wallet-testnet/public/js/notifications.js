let pollHandle = null;

async function refreshNotifications() {
  try {
    const r = await api('/api/notifications');
    renderBell(r.unread);
    renderDropdown(r.list);
  } catch {}
}

function renderBell(unread) {
  const bell = document.querySelector('.notif-bell');
  if (!bell) return;
  const badge = bell.querySelector('.notif-badge');
  if (unread > 0) {
    badge.textContent = unread > 9 ? '9+' : unread;
    badge.style.display = 'grid';
  } else {
    badge.style.display = 'none';
  }
}

function renderDropdown(list) {
  const panel = document.querySelector('.notif-panel');
  if (!panel) return;
  if (!list.length) {
    panel.innerHTML = '<div class="empty" style="padding:20px;">No notifications</div>';
    return;
  }
  const icons = {
    deposit: '↓', withdraw: '↑', stake: '📈',
    kyc: '🛡️', security: '🔒', referral: '🎁', system: 'ℹ️'
  };
  panel.innerHTML = `
    <div class="notif-head">
      <span>Notifications</span>
      <button class="secondary sm" onclick="markAllRead()">Mark all read</button>
    </div>
    <div class="notif-list">
      ${list.map(n => `
        <div class="notif-item ${n.read ? '' : 'unread'}" onclick="markRead('${n._id}')">
          <div class="notif-icon">${icons[n.type] || 'ℹ️'}</div>
          <div style="flex:1; min-width:0;">
            <div class="notif-title">${n.title}</div>
            ${n.body ? `<div class="notif-body">${n.body}</div>` : ''}
            <div class="notif-time">${timeAgo(n.createdAt)}</div>
          </div>
        </div>`).join('')}
    </div>`;
}

window.markRead = async (id) => {
  await api(`/api/notifications/${id}/read`, { method: 'POST' });
  refreshNotifications();
};

window.markAllRead = async () => {
  await api('/api/notifications/read-all', { method: 'POST' });
  refreshNotifications();
};

function timeAgo(dateStr) {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function mountBell() {
  const links = document.querySelector('.nav-links');
  if (!links || links.querySelector('.notif-bell')) return;
  const wrap = document.createElement('div');
  wrap.className = 'notif-wrap';
  wrap.innerHTML = `
    <div class="notif-bell" data-notif-toggle>
      🔔
      <span class="notif-badge" style="display:none;"></span>
    </div>
    <div class="notif-panel glass"></div>`;
  const themeToggle = links.querySelector('.theme-toggle');
  if (themeToggle) links.insertBefore(wrap, themeToggle);
  else links.appendChild(wrap);

  wrap.querySelector('[data-notif-toggle]').addEventListener('click', (e) => {
    e.stopPropagation();
    wrap.querySelector('.notif-panel').classList.toggle('open');
  });
  document.addEventListener('click', () => {
    document.querySelector('.notif-panel')?.classList.remove('open');
  });
}

function startNotifPolling() {
  mountBell();
  refreshNotifications();
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = setInterval(refreshNotifications, 20_000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('token')) startNotifPolling();
  });
} else {
  if (localStorage.getItem('token')) startNotifPolling();
}