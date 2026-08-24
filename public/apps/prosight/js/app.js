'use strict';

// ─── Auth helpers ─────────────────────────────────────────────
const Auth = {
  getToken()  { return sessionStorage.getItem('token'); },
  getUser()   { return JSON.parse(sessionStorage.getItem('user') || 'null'); },
  isAdmin()   { return this.getUser()?.isAdmin === true; },
  can(perm)   { return this.isAdmin() || this.getUser()?.permissions?.[perm] === true; },

  requireLogin(redirectTo = 'index.html') {
    if (!this.getToken()) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  },

  requireAdmin() {
    if (!this.isAdmin()) {
      window.location.href = 'dashboard.html';
      return false;
    }
    return true;
  },

  logout() {
    api.post('/logout').catch(() => {});
    sessionStorage.clear();
    window.location.href = 'index.html';
  },
};

// ─── API client ───────────────────────────────────────────────
const api = {
  _base: '/api',

  async _req(method, path, body, opts = {}) {
    const token = Auth.getToken();
    const headers = {};
    if (body !== undefined && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${this._base}${path}`, {
      method,
      headers,
      body: opts.body || (body !== undefined ? JSON.stringify(body) : undefined),
      cache: 'no-store',
    });

    if (res.status === 401) {
      Auth.logout();
      throw new Error('Não autenticado');
    }

    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : await res.text();

    if (!res.ok) throw new Error(data?.error || data || `HTTP ${res.status}`);
    return data;
  },

  get(path)           { return this._req('GET',    path); },
  post(path, body)    { return this._req('POST',   path, body); },
  put(path, body)     { return this._req('PUT',    path, body); },
  delete(path)        { return this._req('DELETE', path); },

  upload(path, formData) {
    const token = Auth.getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${this._base}${path}`, {
      method: 'POST',
      headers,
      body: formData,
      cache: 'no-store',
    }).then(async res => {
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json() : await res.text();
      if (!res.ok) throw new Error(data?.error || data || `HTTP ${res.status}`);
      return data;
    });
  },
};

// ─── Loading overlay ──────────────────────────────────────────
const Loading = {
  show(msg = 'Processando...') {
    const el  = document.getElementById('loading-overlay');
    const txt = document.getElementById('loading-text');
    if (!el) return;
    if (txt) txt.textContent = msg;
    el.classList.add('visible');
    el.style.display = 'flex';
  },
  hide() {
    const el = document.getElementById('loading-overlay');
    if (!el) return;
    el.classList.remove('visible');
    el.style.display = 'none';
  },
};

// ─── Toast notifications (persiste até clicar OK) ─────────────
function showToast(msg, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.cursor = 'pointer';
  toast.style.paddingRight = '36px';
  toast.style.pointerEvents = 'all';

  const text = document.createElement('span');
  text.textContent = msg;

  const btn = document.createElement('button');
  btn.textContent = 'OK';
  btn.style.cssText = 'position:absolute;top:50%;right:10px;transform:translateY(-50%);background:none;border:1px solid currentColor;color:inherit;border-radius:4px;padding:2px 8px;font-size:0.75rem;cursor:pointer;font-weight:600;';
  btn.addEventListener('click', () => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  });

  toast.appendChild(text);
  toast.appendChild(btn);
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('visible'));
}

// ─── Format utilities ─────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  return dt.toLocaleString('pt-BR');
}

function fmtDiff(diskDate, rpoDate) {
  if (!diskDate || !rpoDate) return '—';
  const diff = Math.round((new Date(diskDate) - new Date(rpoDate)) / 1000);
  const abs = Math.abs(diff);
  if (abs < 60) return `${diff}s`;
  if (abs < 3600) return `${Math.round(diff / 60)}m`;
  if (abs < 86400) return `${Math.round(diff / 3600)}h`;
  return `${Math.round(diff / 86400)}d`;
}

// ─── Sidebar ──────────────────────────────────────────────────
function initSidebar() {
  const user = Auth.getUser();
  if (!user) return;

  const avatarEl = document.getElementById('user-avatar');
  const nameEl   = document.getElementById('user-name');
  const roleEl   = document.getElementById('user-role');

  if (avatarEl) avatarEl.textContent = (user.name || user.username || '?')[0].toUpperCase();
  if (nameEl)   nameEl.textContent = user.name || user.username;
  if (roleEl)   roleEl.textContent = user.isAdmin ? 'Administrador' : 'Usuário';

  if (user.isAdmin) {
    document.getElementById('nav-configurator')?.removeAttribute('style');
  }

  document.getElementById('btn-logout')?.addEventListener('click', () => Auth.logout());
}

document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
});
