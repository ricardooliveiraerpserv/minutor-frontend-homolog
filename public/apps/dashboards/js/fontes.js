'use strict';

const STATUS_CONFIG = {
  sincronizado:    { label: 'Sincronizado',    color: 'var(--green)', bg: 'rgba(39,174,96,0.12)' },
  disco_mais_novo: { label: 'Disco mais novo', color: 'var(--amber)', bg: 'rgba(243,156,18,0.12)' },
  apenas_disco:    { label: 'Apenas no disco', color: 'var(--text-3)', bg: 'rgba(255,255,255,0.04)' },
  apenas_rpo:      { label: 'Apenas no RPO',   color: 'var(--red)',   bg: 'rgba(192,57,43,0.12)' },
};

let _allItems = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireLogin()) return;
  if (!Auth.can('fontes.ver')) {
    window.location.href = 'dashboard.html';
    return;
  }

  document.getElementById('btn-refresh')?.addEventListener('click', loadInventory);
  document.getElementById('filter-search')?.addEventListener('input', applyFilters);
  document.getElementById('filter-status')?.addEventListener('change', applyFilters);

  await loadInventory();
});

async function loadInventory() {
  const tbody = document.getElementById('fontes-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-3)">Carregando...</td></tr>';
  resetSummary();

  try {
    const data = await api.get('/build/sources-inventory');
    _allItems = data.items || [];

    document.getElementById('dir-label').textContent = data.dir ? `Pasta: ${data.dir}` : '';

    if (data.summary) {
      document.getElementById('cnt-sincronizado').textContent    = data.summary.sincronizado    ?? 0;
      document.getElementById('cnt-disco-mais-novo').textContent = data.summary.disco_mais_novo ?? 0;
      document.getElementById('cnt-apenas-disco').textContent    = data.summary.apenas_disco    ?? 0;
      document.getElementById('cnt-apenas-rpo').textContent      = data.summary.apenas_rpo      ?? 0;
    }

    applyFilters();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--red)">${escHtml(err.message)}</td></tr>`;
  }
}

function applyFilters() {
  const search = (document.getElementById('filter-search')?.value || '').toLowerCase();
  const status = document.getElementById('filter-status')?.value || '';

  const filtered = _allItems.filter(item => {
    if (search && !item.name.toLowerCase().includes(search)) return false;
    if (status && item.status !== status) return false;
    return true;
  });

  renderInventory(filtered);
}

function renderInventory(items) {
  const tbody = document.getElementById('fontes-tbody');

  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-3)">Nenhum fonte encontrado</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(item => {
    const cfg = STATUS_CONFIG[item.status] || { label: item.status, color: 'var(--text-3)', bg: '' };
    const rowStyle = item.status === 'apenas_rpo' ? 'background:rgba(192,57,43,0.06)' : '';
    const diskMtime = item.diskMtime ? fmtDate(item.diskMtime) : '<span style="color:var(--text-3)">—</span>';
    const rpoTs    = item.rpoTimestamp ? fmtDate(item.rpoTimestamp) : '<span style="color:var(--text-3)">—</span>';
    return `<tr style="${rowStyle}">
      <td class="mono" style="font-size:12px">${escHtml(item.name)}</td>
      <td class="mono-dim" style="font-size:12px;white-space:nowrap">${diskMtime}</td>
      <td class="mono-dim" style="font-size:12px;white-space:nowrap">${rpoTs}</td>
      <td>
        <span style="padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;
                     color:${cfg.color};background:${cfg.bg};white-space:nowrap">
          ${cfg.label}
        </span>
      </td>
    </tr>`;
  }).join('');
}

function resetSummary() {
  ['cnt-sincronizado','cnt-disco-mais-novo','cnt-apenas-disco','cnt-apenas-rpo']
    .forEach(id => { document.getElementById(id).textContent = '—'; });
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
