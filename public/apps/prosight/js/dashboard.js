'use strict';

// ─── Estado global ────────────────────────────────────────────
let allResults     = [];
let activeFilter   = 'all';
let searchText     = '';
let resultsSortKey = 'program';
let resultsSortDir = 'asc';
let gaugeChart     = null;
let statusChart    = null;

// ─── Mapeamentos ──────────────────────────────────────────────
const STATUS_LABEL = {
  sincronizado:  'Sincronizado',
  recompilar:    'Recompilar',
  verificar_rpo: 'Verificar RPO',
  nao_compilado: 'Não compilado',
  so_rpo:        'Só no RPO',
};

const STATUS_COLOR = {
  sincronizado:  '#22c55e',
  recompilar:    '#f59e0b',
  verificar_rpo: '#a855f7',
  nao_compilado: '#06b6d4',
  so_rpo:        '#ef4444',
};

const HEALTH_COLOR = {
  Critico:  '#ef4444',
  Alerta:   '#f59e0b',
  Regular:  '#06b6d4',
  Saudavel: '#22c55e',
};

const HEALTH_LABEL_PT = {
  Critico:  'Crítico',
  Alerta:   'Alerta',
  Regular:  'Regular',
  Saudavel: 'Saudável',
};

// ─── Gráfico gauge ────────────────────────────────────────────

function renderGauge(pct, label) {
  const ctx   = document.getElementById('chart-gauge').getContext('2d');
  const color = HEALTH_COLOR[label] || '#a855f7';

  document.getElementById('gauge-pct').textContent = `${pct}%`;
  document.getElementById('gauge-pct').className   = `gauge-pct gc-${label.toLowerCase()}`;
  document.getElementById('gauge-lbl').textContent = HEALTH_LABEL_PT[label] || label;
  document.getElementById('gauge-lbl').style.color = color;

  if (gaugeChart) gaugeChart.destroy();

  gaugeChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [pct, 100 - pct],
        backgroundColor: [color, 'rgba(255,255,255,0.06)'],
        borderWidth: 0,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      animation: { duration: 900, easing: 'easeInOutQuart' },
    },
  });
}

// ─── Gráfico status (donut clicável) ─────────────────────────

function renderStatusChart(counts, total) {
  const keys   = Object.keys(STATUS_LABEL);
  const values = keys.map(k => counts[k] || 0);
  const colors = keys.map(k => STATUS_COLOR[k]);

  const legendEl = document.getElementById('status-legend');
  legendEl.innerHTML = keys.map((k, i) => {
    const pct = total > 0 ? ((values[i] / total) * 100).toFixed(1) : '0.0';
    return `
      <div class="legend-item" data-filter="${k}" title="Ver ${STATUS_LABEL[k]}">
        <div class="legend-dot" style="background:${colors[i]}"></div>
        <span class="legend-name">${STATUS_LABEL[k]}</span>
        <span class="legend-num" style="color:${colors[i]}">${values[i]}</span>
        <span class="legend-pct">${pct}%</span>
      </div>
    `;
  }).join('');

  legendEl.querySelectorAll('.legend-item').forEach(item => {
    item.addEventListener('click', () => drillDown(item.dataset.filter));
  });

  const ctx = document.getElementById('chart-status').getContext('2d');
  if (statusChart) statusChart.destroy();

  statusChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: keys.map(k => STATUS_LABEL[k]),
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: 'rgba(14,14,26,0.9)',
        borderWidth: 2,
        hoverBorderWidth: 3,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return `  ${ctx.label}: ${ctx.parsed}  (${pct}%)`;
            },
          },
        },
      },
      onClick: (e, elements) => {
        if (elements.length > 0) drillDown(keys[elements[0].index]);
      },
      animation: { duration: 800, easing: 'easeInOutQuart' },
    },
  });
}

// ─── KPI cards ────────────────────────────────────────────────

function renderKpiRow(summary) {
  const { counts, total, restApiCount } = summary;
  const kpis = [
    { key: 'all',           label: 'Total de Fontes',  value: total,                 sub: 'disco + RPO'     },
    { key: 'sincronizado',  label: 'Sincronizados',    value: counts.sincronizado,   sub: 'em dia'          },
    { key: 'recompilar',    label: 'Recompilar',       value: counts.recompilar,     sub: 'disco mais novo' },
    { key: 'verificar_rpo', label: 'Verificar RPO',    value: counts.verificar_rpo,  sub: 'RPO mais novo'   },
    { key: 'nao_compilado', label: 'Não compilado',    value: counts.nao_compilado,  sub: 'só no disco'     },
    { key: 'so_rpo',        label: 'Só no RPO',        value: counts.so_rpo,         sub: 'sem fonte local' },
    { key: 'rest_api',      label: 'APIs REST',        value: restApiCount,          sub: 'programas'       },
  ];

  const row = document.getElementById('kpi-row');
  row.innerHTML = kpis.map(k => `
    <div class="kpi-card kc-${k.key}" data-filter="${k.key}" title="Ver ${k.label}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value kv-${k.key}">${k.value}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>
  `).join('');

  row.querySelectorAll('.kpi-card').forEach(card => {
    card.addEventListener('click', () => drillDown(card.dataset.filter));
  });
}

// ─── Render painel analytics ──────────────────────────────────

function renderAnalytics(data) {
  const { summary } = data;
  renderGauge(summary.healthPct, summary.healthLabel);
  renderStatusChart(summary.counts, summary.total);
  renderKpiRow(summary);
  document.getElementById('gauge-desc').textContent =
    `${summary.counts.sincronizado} sincronizados de ${summary.total} fontes`;
  document.getElementById('analytics-panel').style.display = 'block';
  document.getElementById('table-section').style.display   = 'none';
}

// ─── Drill-down ───────────────────────────────────────────────

function drillDown(filter) {
  activeFilter = filter;

  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === filter);
  });
  document.querySelectorAll('.kpi-card').forEach(c => {
    c.classList.toggle('active', c.dataset.filter === filter);
  });
  document.querySelectorAll('.legend-item').forEach(i => {
    i.classList.toggle('active', i.dataset.filter === filter);
  });

  const titles = { all: 'Todos os arquivos', rest_api: 'APIs REST', ...STATUS_LABEL };
  document.getElementById('section-title').textContent = titles[filter] || filter;

  document.getElementById('table-section').style.display = 'block';
  searchText = '';
  document.getElementById('filter-search').value = '';
  renderTable();

  setTimeout(() => {
    document.getElementById('table-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

// ─── Tabela ───────────────────────────────────────────────────

function renderTable() {
  const tbody = document.getElementById('results-tbody');

  let filtered = allResults.filter(r => {
    if (activeFilter === 'rest_api') return r.isRestApi;
    if (activeFilter !== 'all') return r.status === activeFilter;
    return true;
  });

  if (searchText) {
    const q = searchText.toLowerCase();
    filtered = filtered.filter(r => r.program.toLowerCase().includes(q));
  }

  filtered.sort((a, b) => {
    let va, vb;
    if (resultsSortKey === 'diff') {
      va = (a.diskDate && a.rpoDate) ? (new Date(a.diskDate) - new Date(a.rpoDate)) : -Infinity;
      vb = (b.diskDate && b.rpoDate) ? (new Date(b.diskDate) - new Date(b.rpoDate)) : -Infinity;
    } else {
      va = a[resultsSortKey] ?? '';
      vb = b[resultsSortKey] ?? '';
    }
    if (va < vb) return resultsSortDir === 'asc' ? -1 : 1;
    if (va > vb) return resultsSortDir === 'asc' ?  1 : -1;
    return 0;
  });

  document.querySelectorAll('.sortable-result-th').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    icon.textContent = th.dataset.sort === resultsSortKey
      ? (resultsSortDir === 'asc' ? ' ↑' : ' ↓')
      : ' ↕';
  });

  document.getElementById('row-count').textContent =
    filtered.length === allResults.length
      ? `${allResults.length} registros`
      : `${filtered.length} de ${allResults.length} registros`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>Nenhum resultado para este filtro</h3></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    const rpoTypeBadge = r.rpoType
      ? `<span class="badge badge-${r.rpoType.toLowerCase()}">${r.rpoType}</span>`
      : '<span style="color:var(--text-3)">—</span>';

    return `
      <tr>
        <td class="program-col">
          ${r.diskPath
            ? `<a class="source-dl" href="#" data-dl-path="${r.diskPath.replace(/"/g, '&quot;')}" data-dl-name="${r.program}" title="Baixar fonte">${r.program}</a>`
            : r.program
          }${r.isRestApi ? ' <span class="badge badge-api">API</span>' : ''}
        </td>
        <td>${fmtDate(r.diskDate)}</td>
        <td>${fmtDate(r.rpoDate)}</td>
        <td>${fmtDiff(r.diskDate, r.rpoDate)}</td>
        <td>${rpoTypeBadge}</td>
        <td><span class="badge badge-${r.status}">${STATUS_LABEL[r.status] || r.status}</span></td>
      </tr>
    `;
  }).join('');
}

// ─── Download autenticado de fonte ────────────────────────────

async function downloadSource(filePath, fileName) {
  try {
    const token = Auth.getToken();
    const res = await fetch(`/api/inventory/download?path=${encodeURIComponent(filePath)}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      showToast(err.error || 'Erro ao baixar arquivo', 'error');
      return;
    }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─── Cache de scan (sessionStorage) ──────────────────────────

const SCAN_CACHE_KEY = 'prosight_promax_scan_cache';

function saveScanCache(data) {
  try { sessionStorage.setItem(SCAN_CACHE_KEY, JSON.stringify(data)); } catch {}
}

function restoreScanCache() {
  try {
    const raw = sessionStorage.getItem(SCAN_CACHE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    allResults = data.results || [];
    renderAnalytics(data);
    const src = data.rpoSource;
    if (src?.type === 'advpl_api') {
      document.getElementById('snapshot-info').textContent =
        `Fonte: API AdvPL · Scan: ${fmtDate(data.scannedAt)} (cache)`;
    }
    return true;
  } catch { return false; }
}

// ─── Scan ─────────────────────────────────────────────────────

async function runScan() {
  Loading.show('Varrendo disco e comparando com RPO...');
  try {
    const data = await api.get('/inventory/scan');

    // Erro tratado pelo backend (AdvPL fora do ar, disco, etc.) vem como 200 + ok:false
    if (data && data.ok === false) {
      showToast(data.error || 'Erro ao executar o scan', 'error');
      return;
    }

    saveScanCache(data);
    allResults = data.results || [];
    renderAnalytics(data);

    const src = data.rpoSource;
    if (src?.type === 'advpl_api') {
      document.getElementById('snapshot-info').textContent =
        `Fonte: API AdvPL · Scan: ${fmtDate(data.scannedAt)}`;
    }

    showToast(`Scan concluído: ${data.summary.total} arquivos analisados`);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    Loading.hide();
  }
}

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.requireLogin()) return;

  restoreScanCache();

  document.getElementById('btn-scan').addEventListener('click', () => {
    sessionStorage.removeItem(SCAN_CACHE_KEY);
    runScan();
  });

  document.getElementById('btn-back').addEventListener('click', () => {
    document.getElementById('table-section').style.display = 'none';
    activeFilter = 'all';
    document.querySelectorAll('.kpi-card, .legend-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
    document.getElementById('analytics-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.addEventListener('click', e => {
    const a = e.target.closest('a.source-dl');
    if (!a) return;
    e.preventDefault();
    downloadSource(a.dataset.dlPath, a.dataset.dlName);
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderTable();
    });
  });

  document.getElementById('filter-search').addEventListener('input', e => {
    searchText = e.target.value.trim();
    renderTable();
  });

  document.querySelectorAll('.sortable-result-th').forEach(th => {
    th.addEventListener('click', () => {
      if (resultsSortKey === th.dataset.sort) {
        resultsSortDir = resultsSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        resultsSortKey = th.dataset.sort;
        resultsSortDir = 'asc';
      }
      renderTable();
    });
  });
});
