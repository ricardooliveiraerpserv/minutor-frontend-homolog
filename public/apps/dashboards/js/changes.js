'use strict';

const TYPE_LABELS = {
  'compile':      'Compilação',
  'patch-apply':  'Aplicação de Patch',
  'promote-rpo':  'Promoção de RPO',
  'rollback-rpo': 'Rollback de RPO',
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireLogin()) return;

  document.getElementById('btn-refresh')?.addEventListener('click', loadChanges);
  document.getElementById('btn-apply-filter')?.addEventListener('click', loadChanges);
  document.getElementById('filter-type')?.addEventListener('change', loadChanges);
  document.getElementById('filter-limit')?.addEventListener('change', loadChanges);

  await loadChanges();
});

async function loadChanges() {
  const tbody = document.getElementById('changes-tbody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-3)">Carregando...</td></tr>';

  const date  = document.getElementById('filter-date')?.value || '';
  const type  = document.getElementById('filter-type')?.value || '';
  const limit = document.getElementById('filter-limit')?.value || '50';

  const params = new URLSearchParams({ limit });
  if (date)  params.set('date', date);
  if (type)  params.set('type', type);

  try {
    const entries = await api.get(`/build/changes?${params}`);
    renderChanges(entries);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--red)">${err.message}</td></tr>`;
  }
}

function renderChanges(entries) {
  const tbody = document.getElementById('changes-tbody');

  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-3)">Nenhum registro encontrado</td></tr>';
    return;
  }

  tbody.innerHTML = entries.map((e, idx) => {
    const typeLabel = TYPE_LABELS[e.type] || e.type;
    const files = Array.isArray(e.files) ? e.files.slice(0, 5).join(', ') + (e.files.length > 5 ? ` (+${e.files.length - 5})` : '') : '—';
    const result = e.success
      ? '<span style="color:var(--green);font-weight:500">OK</span>'
      : '<span style="color:var(--red);font-weight:500">Falhou</span>';
    const ts = e.timestamp ? fmtDate(e.timestamp) : '—';
    const hasOutput = e.output && e.output.trim().length > 0;
    const rowStyle = hasOutput ? 'cursor:pointer' : '';
    return `<tr data-idx="${idx}" style="${rowStyle}" ${hasOutput ? `onclick="showOutput(${idx})"` : ''}>
      <td class="mono-dim" style="white-space:nowrap">${ts}</td>
      <td><span class="badge" style="background:rgba(255,255,255,0.06);color:var(--text-3)">${typeLabel}</span></td>
      <td class="mono-dim">${escHtml(e.username || '—')}</td>
      <td style="font-size:12px;color:var(--text-2)">${escHtml(files)}</td>
      <td>${result}</td>
    </tr>`;
  }).join('');

  // Store entries globally for click access
  window._changesData = entries;
}

function showOutput(idx) {
  const entry = (window._changesData || [])[idx];
  if (!entry) return;

  const panel = document.getElementById('output-panel');
  const content = document.getElementById('output-content');
  const label = document.getElementById('output-entry-label');

  label.textContent = `${TYPE_LABELS[entry.type] || entry.type} — ${fmtDate(entry.timestamp)}`;
  content.textContent = entry.output || '(sem output)';
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeOutput() {
  document.getElementById('output-panel').style.display = 'none';
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
