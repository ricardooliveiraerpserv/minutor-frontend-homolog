'use strict';

// ─── Auth helpers ────────────────────────────────────────────
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

// ─── API client ──────────────────────────────────────────────
const api = {
  _base: '/api',

  async _req(method, path, body, opts = {}) {
    const token = Auth.getToken();
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${this._base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      ...opts,
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
};

// ─── Loading overlay ─────────────────────────────────────────
const Loading = {
  show(msg = 'Processando...') {
    const el = document.getElementById('loading-overlay');
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

// ─── Alert helpers ────────────────────────────────────────────
function showAlert(containerId, type, msg) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="alert ${type}">${msg}</div>`;
}

function showPageAlert(type, msg) {
  const el = document.getElementById('page-alert');
  if (!el) return;
  el.className = `alert ${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 6000);
}

// ─── Sidebar: populate user badge + show admin links ─────────
function initSidebar() {
  const user = Auth.getUser();
  if (!user) return;

  const avatarEl = document.getElementById('user-avatar');
  const nameEl   = document.getElementById('user-name');
  const roleEl   = document.getElementById('user-role');

  if (avatarEl) avatarEl.textContent = (user.name || user.username || '?')[0].toUpperCase();
  if (nameEl)   nameEl.textContent = user.name || user.username;
  if (roleEl)   roleEl.textContent = user.isAdmin ? 'Administrador' : 'Usuário';

  // Show admin-only nav items
  if (user.isAdmin) {
    document.getElementById('nav-configurator')?.removeAttribute('style');
    document.getElementById('nav-users')?.removeAttribute('style');
    document.getElementById('nav-audit')?.removeAttribute('style');
  }

  // Show fontes nav for users with fontes.ver permission
  if (Auth.can('fontes.ver')) {
    document.getElementById('nav-fontes')?.removeAttribute('style');
  }

  document.getElementById('btn-logout')?.addEventListener('click', () => Auth.logout());
}

// ─── Format utilities ─────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  return dt.toLocaleString('pt-BR');
}

function fmtBytes(mb) {
  if (mb == null || isNaN(mb)) return '—';
  return mb > 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

// ─── Run on every page ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
});
