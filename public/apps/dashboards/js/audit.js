'use strict';

let _auditData = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireLogin()) return;
  if (!Auth.isAdmin()) {
    window.location.href = 'dashboard.html';
    return;
  }

  document.getElementById('btn-refresh')?.addEventListener('click', loadAudit);
  document.getElementById('btn-apply-filter')?.addEventListener('click', applyFilter);
  document.getElementById('filter-text')?.addEventListener('input', applyFilter);
  document.getElementById('filter-limit')?.addEventListener('change', loadAudit);

  await loadAudit();
});

async function loadAudit() {
  const tbody = document.getElementById('audit-tbody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-3)">Carregando...</td></tr>';

  const limit = document.getElementById('filter-limit')?.value || '50';

  try {
    _auditData = await api.get(`/audit?limit=${limit}`);
    applyFilter();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--red)">${err.message}</td></tr>`;
  }
}

function applyFilter() {
  const text = (document.getElementById('filter-text')?.value || '').toLowerCase();
  const filtered = text
    ? _auditData.filter(e =>
        (e.username || '').toLowerCase().includes(text) ||
        (e.action   || '').toLowerCase().includes(text) ||
        (e.detail   || '').toLowerCase().includes(text)
      )
    : _auditData;
  renderAudit(filtered);
}

function renderAudit(entries) {
  const tbody = document.getElementById('audit-tbody');

  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-3)">Nenhum registro encontrado</td></tr>';
    return;
  }

  tbody.innerHTML = entries.map(e => {
    const ts = e.timestamp ? fmtDate(e.timestamp) : '—';
    const result = e.success === false
      ? '<span style="color:var(--red);font-weight:500">Falhou</span>'
      : '<span style="color:var(--green);font-weight:500">OK</span>';
    const detail = e.detail ? escHtml(String(e.detail).slice(0, 120)) : '—';
    return `<tr>
      <td class="mono-dim" style="white-space:nowrap">${ts}</td>
      <td class="mono-dim">${escHtml(e.username || '—')}</td>
      <td><span class="badge" style="background:rgba(255,255,255,0.06);color:var(--text-3)">${escHtml(e.action || '—')}</span></td>
      <td style="font-size:12px;color:var(--text-2)">${detail}</td>
      <td>${result}</td>
    </tr>`;
  }).join('');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
