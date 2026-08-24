'use strict';

// ─── State ───────────────────────────────────────────────────
let refreshTimer = null;
const REFRESH_INTERVAL = 30_000; // 30s
let _exclusiveActive = false;
let _debugActive = false;

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireLogin()) return;

  applyPermissionsToUI();
  loadAll();
  startAutoRefresh();

  // Refresh button
  document.getElementById('btn-refresh')?.addEventListener('click', () => loadAll());

  // Service filter
  document.getElementById('service-filter')?.addEventListener('input', e => filterRows(e.target.value));

  // Start/Stop all
  document.getElementById('btn-start-all')?.addEventListener('click', () => handleAllServices('start'));
  document.getElementById('btn-stop-all')?.addEventListener('click', () => handleAllServices('stop'));

  // Utility buttons
  document.getElementById('btn-exclusive')?.addEventListener('click', handleExclusive);
  document.getElementById('btn-deactivate-exclusive')?.addEventListener('click', deactivateExclusive);
  document.getElementById('btn-clean-system')?.addEventListener('click', confirmThen('clean-system',
    '⚠️ Confirmar Limpeza',
    'Esta ação removerá arquivos *.tmp, sc*.log, sc*.cdx da pasta System e esvaziará a pasta Spool. Confirmar?',
    () => runUtility('/utilities/clean-system', 'Limpeza concluída')));
  document.getElementById('btn-clean-tsk')?.addEventListener('click', confirmThen('clean-tsk',
    'Limpar arquivos TSK',
    'Remover todos os arquivos *.TSK das pastas dos appservers. Confirmar?',
    () => runUtility('/utilities/clean-tsk', 'TSKs removidos')));
  document.getElementById('btn-toggle-debug')?.addEventListener('click', handleDebugToggle);

  // Build buttons
  document.getElementById('btn-compile')?.addEventListener('click', handleCompile);
  document.getElementById('btn-apply-patch')?.addEventListener('click', handleApplyPatch);
  document.getElementById('btn-promote-rpo')?.addEventListener('click', handlePromoteRpo);
  document.getElementById('btn-rollback-rpo')?.addEventListener('click', handleRollbackRpo);

  // Build result modal close
  document.getElementById('result-modal-close')?.addEventListener('click', () => {
    document.getElementById('result-modal').classList.add('hidden');
  });
  document.getElementById('build-modal-cancel')?.addEventListener('click', () => {
    document.getElementById('build-modal').classList.add('hidden');
  });

  // Console log
  document.getElementById('btn-reload-console')?.addEventListener('click', loadConsole);
  document.getElementById('console-filter')?.addEventListener('input', loadConsole);
  document.getElementById('console-source')?.addEventListener('change', loadConsole);
});

// ─── Permission-based UI ─────────────────────────────────────
function applyPermissionsToUI() {
  // Service controls
  if (!Auth.can('servicos.controlar')) {
    document.getElementById('btn-start-all')?.setAttribute('disabled', '');
    document.getElementById('btn-stop-all')?.setAttribute('disabled', '');
  }

  // Utility buttons
  document.querySelectorAll('[data-perm]').forEach(btn => {
    const perm = btn.dataset.perm;
    if (!Auth.can(perm)) btn.setAttribute('disabled', '');
  });

  // Nav admin links
  const user = Auth.getUser();
  if (user?.isAdmin) {
    document.getElementById('nav-configurator')?.removeAttribute('style');
    document.getElementById('nav-users')?.removeAttribute('style');
    document.getElementById('nav-audit')?.removeAttribute('style');
  }
}

// ─── Load everything ─────────────────────────────────────────
async function loadAll() {
  await Promise.allSettled([
    loadServices(),
    loadSystemInfo(),
    loadFolderStatus(),
    loadExclusiveState(),
  ]);
}

function startAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(loadAll, REFRESH_INTERVAL);
}

// ─── Services ────────────────────────────────────────────────
let _serviceDisplayNames = {}; // name → displayName cache

async function loadServices() {
  try {
    const services = await api.get('/services/status');
    _serviceDisplayNames = {};
    services.forEach(s => { _serviceDisplayNames[s.name] = s.displayName || s.name; });
    renderServices(services);
    renderSummaryCards(services);
    loadDebugState(services);
  } catch (err) {
    document.getElementById('service-tbody').innerHTML =
      `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--red)">${err.message}</td></tr>`;
    renderSummaryCards([]);
  }
}

function renderServices(services) {
  const tbody = document.getElementById('service-tbody');
  if (!tbody) return;

  if (!services?.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-3)">Ambiente não configurado. Configure o ambiente primeiro.</td></tr>';
    return;
  }

  tbody.innerHTML = services.map(s => {
    const isRunning = s.status === 'Running';
    const statusHtml = `<span class="pulse-dot ${isRunning ? 'running' : 'stopped'}"></span>
      <span class="${isRunning ? '' : 'mono-dim'}">${isRunning ? 'Iniciado' : 'Parado'}</span>`;

    const typeLabels = { broker:'Broker', slave:'Slave', rest:'REST', schedule:'Schedule',
                         compiler:'Compilador', exclusive:'Exclusivo', extra:'Extra' };
    const typeLabel = typeLabels[s.type] || s.type;

    const canControl = Auth.can('servicos.controlar');
    const actionsHtml = (canControl && s.type !== 'exclusive' && s.type !== 'compiler') ? `
      <div style="display:flex;gap:6px">
        <button class="btn btn-success btn-sm svc-start" data-name="${s.name}" ${isRunning ? 'disabled' : ''}>▶</button>
        <button class="btn btn-danger btn-sm svc-stop"  data-name="${s.name}" ${!isRunning ? 'disabled' : ''}>■</button>
        <button class="btn btn-amber btn-sm svc-restart" data-name="${s.name}" ${!isRunning ? 'disabled' : ''}>↺</button>
      </div>` : '<span style="color:var(--text-3);font-size:12px">—</span>';

    const displayName = escHtml(s.displayName || s.name);
    const notFoundBadge = s.found === false
      ? `<span title="Serviço não encontrado no Windows (nome: ${s.name})" style="color:var(--amber);font-size:10px;margin-left:6px;cursor:help">⚠ não encontrado</span>`
      : '';
    const nameHtml = `<span class="svc-label" title="${escHtml(s.name)}">${displayName}</span>${notFoundBadge}<button class="btn-rename" data-name="${s.name}" data-current="${displayName}" title="Renomear" style="background:none;border:none;cursor:pointer;color:var(--text-3);font-size:12px;padding:0 0 0 6px;opacity:0.6" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">✏️</button>`;

    return `<tr>
      <td style="font-weight:500;color:var(--text)">${nameHtml}</td>
      <td><span class="badge" style="background:rgba(255,255,255,0.06);color:var(--text-3)">${typeLabel}</span></td>
      <td class="mono-dim">${s.port || '—'}</td>
      <td style="display:flex;align-items:center">${statusHtml}</td>
      <td class="mono-dim">${s.cpu ? s.cpu.toFixed(2) + '%' : '—'}</td>
      <td class="mono-dim">${s.memory ? fmtBytes(s.memory) : '—'}</td>
      <td>${actionsHtml}</td>
    </tr>`;
  }).join('');

  // Attach listeners
  tbody.querySelectorAll('.svc-start').forEach(btn =>
    btn.addEventListener('click', () => handleService(btn.dataset.name, 'start')));
  tbody.querySelectorAll('.svc-stop').forEach(btn =>
    btn.addEventListener('click', () => handleService(btn.dataset.name, 'stop')));
  tbody.querySelectorAll('.svc-restart').forEach(btn =>
    btn.addEventListener('click', () => handleService(btn.dataset.name, 'restart')));
  tbody.querySelectorAll('.btn-rename').forEach(btn =>
    btn.addEventListener('click', () => startInlineRename(btn)));
}

function startInlineRename(btn) {
  const td = btn.closest('td');
  const name = btn.dataset.name;
  const current = btn.dataset.current;

  td.innerHTML = `
    <input class="search-input svc-rename-input" value="${current}" style="width:180px;margin:0 4px 0 0;padding:4px 8px">
    <button class="btn btn-success btn-sm svc-rename-save" style="padding:3px 8px">✓</button>
    <button class="btn btn-ghost btn-sm svc-rename-cancel" style="padding:3px 8px">✕</button>
  `;

  const input = td.querySelector('.svc-rename-input');
  input.focus();
  input.select();

  const save = async () => {
    const label = input.value.trim();
    try {
      await api.put(`/services/${encodeURIComponent(name)}/label`, { label });
      await loadServices();
    } catch (err) {
      alert('Erro ao renomear: ' + err.message);
      await loadServices();
    }
  };

  td.querySelector('.svc-rename-save').addEventListener('click', save);
  td.querySelector('.svc-rename-cancel').addEventListener('click', () => loadServices());
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') loadServices();
  });
}

function renderSummaryCards(services) {
  // Exclusive is always expected to be stopped — exclude from counters
  const nonExclusive = services.filter(s => s.type !== 'exclusive');
  const running = nonExclusive.filter(s => s.status === 'Running').length;
  const stopped = nonExclusive.filter(s => s.status !== 'Running').length;
  document.getElementById('cnt-running').textContent = running;
  document.getElementById('cnt-stopped').textContent = stopped;
}

async function handleService(name, action) {
  const label = { start:'Iniciando', stop:'Parando', restart:'Reiniciando' }[action] || action;
  const friendlyName = _serviceDisplayNames[name] || name;
  Loading.show(`${label} ${friendlyName}...`);
  try {
    await api.post(`/services/${encodeURIComponent(name)}/${action}`);
    await waitForStatus(name, action === 'stop' ? 'Stopped' : 'Running');
  } catch (err) {
    alert(`Erro ao executar "${action}" em ${name}:\n${err.message}\n\nVerifique se o servidor Node.js está rodando como Administrador.`);
  } finally {
    Loading.hide();
    await loadServices();
  }
}

async function waitForStatus(name, desired, timeout = 45000, interval = 1500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const list = await api.get('/services/status');
      const svc = list.find(s => s.name === name);
      if (svc?.status === desired) return true;
    } catch {}
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

async function handleAllServices(action) {
  const label = action === 'start' ? 'Iniciar todos' : 'Parar todos';
  if (!confirm(`Confirmar: ${label}? (Exclusivo não será afetado)`)) return;
  Loading.show(`${label}...`);
  try {
    const result = await api.post(`/services/${action}-all`);
    const failed = (result.results || []).filter(r => !r.ok);
    if (failed.length) {
      alert(`${label} concluído com erros:\n${failed.map(r => `${r.service}: ${r.error}`).join('\n')}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  } catch (err) {
    alert(`Erro: ${err.message}\n\nVerifique se o servidor Node.js está rodando como Administrador.`);
  } finally {
    Loading.hide();
    await loadServices();
  }
}

function filterRows(text) {
  document.querySelectorAll('#service-tbody tr').forEach(row => {
    row.style.display = row.cells[0]?.textContent.toLowerCase().includes(text.toLowerCase()) ? '' : 'none';
  });
}

// ─── System Info (INI cards) ──────────────────────────────────
async function loadSystemInfo() {
  try {
    const info = await api.get('/system/info');
    renderIniCards(info);
    document.getElementById('env-sub').textContent =
      [info.appEnvironment, info.topDatabase && `DB: ${info.topDatabase}`].filter(Boolean).join(' · ') || '—';
  } catch {
    document.getElementById('ini-cards').innerHTML = '<div class="info-card"><div class="info-card-label">Erro</div><div class="info-card-value normal" style="color:var(--red)">Não foi possível ler as informações do INI</div></div>';
  }
}

function renderIniCards(info) {
  const cards = [
    { label: 'Versão RPO',       value: info.rpoVersion || '—', mono: true },
    { label: 'Ambiente',         value: info.appEnvironment || '—', mono: true },
    { label: 'Banco de Dados',   value: info.topDatabase || '—', mono: true },
    { label: 'Alias BD',         value: info.topAlias || '—', mono: true },
    { label: 'Servidor BD',      value: info.topServer || '—', mono: true },
    { label: 'Inactive Timeout', value: info.inactiveTimeout ? `${info.inactiveTimeout}s` : '—', mono: true },
    { label: 'Porta TCP',        value: info.port || '—', mono: true },
    { label: 'SourcePath',       value: info.sourcePath || '—', mono: true },
    { label: 'RPO Custom',       value: info.rpoCustom || '—', mono: true },
    { label: 'Debug (Trace)',     value: info.trace === '1' ? '⚠ Ativado' : 'Desativado', mono: false,
      style: info.trace === '1' ? 'color:var(--amber)' : '' },
    { label: 'SpecialKey',       value: info.specialKey || '—', mono: true },
    ...(info.rpoFiles || []).map(f => ({
      label: f.name,
      value: f.mtime ? fmtDate(f.mtime) : (f.error || '—'),
      mono: true,
    })),
  ];

  document.getElementById('ini-cards').innerHTML = cards.map(c =>
    `<div class="info-card">
      <div class="info-card-label">${c.label}</div>
      <div class="info-card-value ${c.mono ? 'mono' : 'normal'}" style="${c.style || ''}">${c.value}</div>
    </div>`
  ).join('');
}

// ─── Folder status ────────────────────────────────────────────
async function loadFolderStatus() {
  try {
    const status = await api.get('/system/folder-status');

    document.getElementById('cnt-system').textContent = status.systemTotal < 0 ? 'Erro' : status.systemTotal.toLocaleString();
    document.getElementById('system-level-text').textContent = {
      green: 'Normal', yellow: 'Atenção', red: 'Crítico', error: 'Sem acesso'
    }[status.level] || '—';
    document.getElementById('cnt-tsk').textContent   = status.slaveTskCount ?? '—';
    document.getElementById('cnt-spool').textContent = status.spoolTotal < 0 ? '—' : status.spoolTotal.toLocaleString();

    // Progress bar (max 8000 for visual)
    const pct = Math.min(100, ((status.systemTotal || 0) / 8000) * 100);
    const fill = document.getElementById('folder-bar-fill');
    const track = document.getElementById('folder-bar-label');
    if (fill) {
      fill.style.width = `${pct}%`;
      fill.className = `folder-bar-fill ${status.level === 'error' ? 'red' : status.level}`;
    }
    if (track) track.textContent = status.systemFolder || 'System';

    const countEl = document.getElementById('folder-bar-count');
    if (countEl) countEl.textContent = `${(status.systemTotal || 0).toLocaleString()} arquivos`;

    renderSystemDonut(status.extensionBreakdown || [], status.systemTotal || 0);
  } catch (err) {
    console.error('Folder status error:', err);
  }
}

const DONUT_COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#14b8a6','#84cc16','#a78bfa','#fb923c','#38bdf8','#4ade80','#fbbf24'];

function renderSystemDonut(extensions, total) {
  const donut = document.getElementById('system-donut');
  const legend = document.getElementById('system-donut-legend');
  if (!donut || !legend) return;

  if (!total || !extensions.length) {
    donut.style.background = 'rgba(255,255,255,0.06)';
    legend.innerHTML = '<span style="color:var(--text-3)">Sem dados</span>';
    return;
  }

  let cumPct = 0;
  const segments = extensions.map((e, i) => {
    const pct = (e.count / total) * 100;
    const seg = `${DONUT_COLORS[i % DONUT_COLORS.length]} ${cumPct.toFixed(2)}% ${(cumPct + pct).toFixed(2)}%`;
    cumPct += pct;
    return seg;
  });
  donut.style.background = `conic-gradient(${segments.join(', ')})`;

  legend.innerHTML = extensions.map((e, i) =>
    `<span style="display:inline-flex;align-items:center;gap:4px">
      <span style="display:inline-block;width:8px;height:8px;border-radius:2px;flex-shrink:0;background:${DONUT_COLORS[i % DONUT_COLORS.length]}"></span>
      ${escHtml(e.ext)}: <b style="color:var(--text)">${e.count.toLocaleString()}</b>
    </span>`
  ).join('');
}

// ─── Exclusive mode ──────────────────────────────────────────
async function loadExclusiveState() {
  try {
    const state = await api.get('/utilities/exclusive/state');
    const banner = document.getElementById('exclusive-banner');
    const statusEl = document.getElementById('exclusive-status');
    const byEl = document.getElementById('exclusive-by');

    _exclusiveActive = state.active || false;
    updateBuildButtons();

    if (state.active) {
      if (banner) banner.style.display = 'flex';
      if (statusEl) statusEl.textContent = '🔒 Ativo';
      if (byEl) byEl.textContent = `Ativado por ${state.activatedBy || '—'}`;
      document.getElementById('main-content').style.paddingTop = '70px';
    } else {
      if (banner) banner.style.display = 'none';
      document.getElementById('main-content').style.paddingTop = '28px';
      if (statusEl) statusEl.textContent = 'Inativo';
      if (byEl) byEl.textContent = '—';
    }

    // Toggle button label
    const btn = document.getElementById('btn-exclusive');
    if (btn) {
      btn.querySelector('.utility-btn-title').textContent = state.active ? 'Desativar Modo Exclusivo' : 'Ativar Modo Exclusivo';
      btn.querySelector('.utility-btn-desc').textContent  = state.active ? 'Parar o exclusivo e subir os slaves de produção' : 'Parar slaves, subir appserver exclusivo para manutenção';
    }
  } catch {}
}

async function handleExclusive() {
  try {
    const state = await api.get('/utilities/exclusive/state');
    if (state.active) {
      await deactivateExclusive();
    } else {
      await activateExclusive();
    }
  } catch {}
}

function activateExclusive() {
  return new Promise(resolve => {
    openModal(
      '🔒 Ativar Modo Exclusivo',
      'Esta ação irá:\n• Parar todos os slaves\n• Parar o modo debug (se ativo)\n• Iniciar o appserver exclusivo\n• Exibir banner de manutenção\n\nContinuar?',
      async () => {
        Loading.show('Ativando modo exclusivo...');
        try {
          await api.post('/utilities/exclusive/activate');
          await loadAll();
        } catch (err) {
          alert('Erro: ' + err.message);
        } finally {
          Loading.hide();
          resolve();
        }
      }
    );
  });
}

async function deactivateExclusive() {
  openModal(
    'Encerrar Modo Exclusivo',
    'Isso irá parar o exclusivo, iniciar todos os slaves e executar o health check REST. Continuar?',
    async () => {
      Loading.show('Encerrando modo exclusivo...');
      try {
        await api.post('/utilities/exclusive/deactivate');
        await loadAll();
      } catch (err) {
        alert('Erro: ' + err.message);
      } finally {
        Loading.hide();
      }
    }
  );
}

// ─── Debug mode ──────────────────────────────────────────────
function loadDebugState(services) {
  const btn = document.getElementById('btn-toggle-debug');
  if (!btn || !services) return;
  // Debug active = compiler service is Running
  const compilerSvc = services.find(s => s.type === 'compiler');
  const active = compilerSvc?.status === 'Running';
  _debugActive = active;
  updateBuildButtons();
  btn.querySelector('.utility-btn-title').textContent = active ? 'Desativar Modo Debug' : 'Ativar Modo Debug';
  btn.querySelector('.utility-btn-desc').textContent  = active
    ? 'Para o appserver de debug (Trace e ConsoleLog permanecem configurados no INI)'
    : 'Inicia o appserver de debug para compilação e depuração';
  btn.dataset.debugActive = active ? '1' : '';
}

function updateBuildButtons() {
  const canBuild = _exclusiveActive || _debugActive;
  document.getElementById('btn-compile')?.toggleAttribute('disabled', !canBuild || !Auth.can('compilacao.executar'));
  document.getElementById('btn-apply-patch')?.toggleAttribute('disabled', !canBuild || !Auth.can('pacote.aplicar'));
  // promote and rollback always enabled (permission already checked by applyPermissionsToUI)
  document.getElementById('btn-promote-rpo')?.removeAttribute('disabled');
  document.getElementById('btn-rollback-rpo')?.removeAttribute('disabled');
  // Re-apply permission check for promote/rollback
  if (!Auth.can('compilacao.promover')) {
    document.getElementById('btn-promote-rpo')?.setAttribute('disabled', '');
    document.getElementById('btn-rollback-rpo')?.setAttribute('disabled', '');
  }

  // Disable debug toggle when exclusive is active (mutual exclusivity)
  const debugBtn = document.getElementById('btn-toggle-debug');
  if (debugBtn) {
    if (_exclusiveActive && !_debugActive) {
      debugBtn.setAttribute('disabled', '');
    } else if (!Auth.can('servicos.controlar')) {
      debugBtn.setAttribute('disabled', '');
    } else {
      debugBtn.removeAttribute('disabled');
    }
  }
}

async function handleDebugToggle() {
  const btn = document.getElementById('btn-toggle-debug');
  const active = btn?.dataset.debugActive === '1';
  if (active) {
    openModal(
      'Desativar Modo Debug',
      'Isso irá parar o appserver de debug.\nOs demais serviços não serão afetados. Confirmar?',
      async () => {
        Loading.show('Parando appserver de debug...');
        try {
          const res = await api.post('/utilities/debug/deactivate');
          await waitForStatus(res?.serviceName || '', 'Stopped').catch(() => {});
        } catch (err) {
          alert(`Erro ao parar debug:\n${err.message}\n\nVerifique se o servidor Node.js está rodando como Administrador.`);
        } finally {
          await loadAll();
          Loading.hide();
        }
      }
    );
  } else {
    if (_exclusiveActive) {
      alert('Modo Exclusivo está ativo. Encerre o modo exclusivo antes de ativar o modo debug.');
      return;
    }
    openModal(
      'Ativar Modo Debug',
      'Isso irá iniciar o appserver de debug.\nOs demais serviços não serão afetados. Confirmar?',
      async () => {
        Loading.show('Iniciando appserver de debug...');
        try {
          const res = await api.post('/utilities/debug/activate');
          await waitForStatus(res?.serviceName || '', 'Running').catch(() => {});
        } catch (err) {
          alert(`Erro ao iniciar debug:\n${err.message}\n\nVerifique se o servidor Node.js está rodando como Administrador.`);
        } finally {
          await loadAll();
          Loading.hide();
        }
      }
    );
  }
}

// ─── Utilities ───────────────────────────────────────────────
async function runUtility(endpoint, successMsg) {
  Loading.show('Executando...');
  try {
    const result = await api.post(endpoint);
    alert(successMsg + (result.results ? '\n' + JSON.stringify(result.results, null, 2) : ''));
    await loadFolderStatus();
  } catch (err) {
    alert('Erro: ' + err.message);
  } finally {
    Loading.hide();
  }
}

// ─── Console log ─────────────────────────────────────────────
let consoleVisible = false;
let consoleSourcesLoaded = false;

function toggleConsole() {
  consoleVisible = !consoleVisible;
  const wrap = document.getElementById('console-wrap');
  const icon = document.getElementById('console-toggle-icon');
  if (wrap) wrap.style.display = consoleVisible ? 'block' : 'none';
  if (icon) icon.textContent = consoleVisible ? '▼ recolher' : '▶ expandir';
  if (consoleVisible) {
    if (!consoleSourcesLoaded) {
      consoleSourcesLoaded = true;
      loadConsoleSources();
    } else {
      loadConsole();
    }
  }
}

async function loadConsoleSources() {
  const select = document.getElementById('console-source');
  if (!select) return;
  try {
    const sources = await api.get('/system/console-sources');
    if (!sources.length) {
      select.innerHTML = '<option value="">Slave 0 (padrão)</option>';
    } else {
      select.innerHTML = sources.map(s =>
        `<option value="${s.id}">${s.label}</option>`
      ).join('');
    }
  } catch {
    select.innerHTML = '<option value="">Slave 0 (padrão)</option>';
  }
  loadConsole();
}

async function loadConsole() {
  const viewer = document.getElementById('console-viewer');
  const filter = document.getElementById('console-filter')?.value || '';
  const source = document.getElementById('console-source')?.value || '';
  if (!viewer) return;

  try {
    const params = `lines=300&filter=${encodeURIComponent(filter)}${source ? `&source=${encodeURIComponent(source)}` : ''}`;
    const data = await api.get(`/system/console-log?${params}`);
    renderConsole(viewer, data.lines || []);
  } catch (err) {
    viewer.innerHTML = `<span style="color:var(--red)">${err.message}</span>`;
  }
}

function renderConsole(viewer, lines) {
  const follow = document.getElementById('console-follow')?.checked;

  viewer.innerHTML = lines.map(line => {
    let cls = 'log-line';
    if (/error|erro/i.test(line))   cls += ' log-error';
    else if (/warn|aviso/i.test(line)) cls += ' log-warn';
    else if (/info/i.test(line))    cls += ' log-info';
    return `<div class="${cls}">${escHtml(line)}</div>`;
  }).join('');

  if (follow) viewer.scrollTop = viewer.scrollHeight;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Modal ───────────────────────────────────────────────────
let _confirmCallback = null;

function openModal(title, body, onConfirm) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;
  document.getElementById('confirm-modal').classList.remove('hidden');
  _confirmCallback = onConfirm;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-cancel')?.addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.add('hidden');
    _confirmCallback = null;
  });

  document.getElementById('modal-confirm')?.addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.add('hidden');
    if (_confirmCallback) {
      _confirmCallback();
      _confirmCallback = null;
    }
  });
});

function confirmThen(id, title, body, fn) {
  return () => openModal(title, body, fn);
}

// ─── Build modals ─────────────────────────────────────────────

function openBuildModal(title, bodyText, alertText, onConfirm) {
  document.getElementById('build-modal-title').textContent = title;
  document.getElementById('build-modal-body').textContent = bodyText;
  const alertEl = document.getElementById('build-modal-alert');
  if (alertText) {
    alertEl.textContent = alertText;
    alertEl.style.display = 'block';
  } else {
    alertEl.style.display = 'none';
  }
  document.getElementById('build-modal').classList.remove('hidden');

  const confirmBtn = document.getElementById('build-modal-confirm');
  const newBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
  newBtn.addEventListener('click', () => {
    document.getElementById('build-modal').classList.add('hidden');
    onConfirm();
  });
}

/**
 * Show build result modal with a table of per-item results.
 * results: [{ name, success }]
 * message: summary text
 * logFile: path to the log file saved on disk (optional)
 */
function showBuildResultModal(title, results, message, logFile, isSuccess) {
  document.getElementById('result-modal-title').textContent = title;
  const body = document.getElementById('result-modal-body');

  const tableHtml = results.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
      <tbody>
        ${results.map(r => {
          const t = r.timings || {};
          const timingParts = [];
          if (t.validate != null) timingParts.push(`val ${t.validate.toFixed(1)}s`);
          if (t.apply    != null) timingParts.push(`apl ${t.apply.toFixed(1)}s`);
          if (t.defrag   != null) timingParts.push(`defrag ${t.defrag.toFixed(1)}s`);
          const timingStr = timingParts.join(' · ');
          const logName = r.logFile ? r.logFile.split(/[\\/]/).pop() : '';
          return `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
            <td style="font-family:var(--font-mono);font-size:12px;padding:5px 8px;color:var(--text)">
              ${escHtml(r.name)}
              ${logName ? `<div style="font-size:10px;color:var(--text-3);margin-top:2px">${escHtml(logName)}</div>` : ''}
              ${timingStr ? `<div style="font-size:10px;color:var(--text-3)">${escHtml(timingStr)}</div>` : ''}
            </td>
            <td style="text-align:right;padding:5px 8px;font-size:14px;font-weight:600;color:${r.success ? 'var(--green)' : 'var(--red)'}">${r.success ? '✓' : '✗'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : '';

  const msgHtml = message ? `
    <div style="padding:8px 10px;border-radius:6px;background:rgba(255,255,255,0.05);font-size:13px;margin-bottom:8px;color:${isSuccess ? 'var(--green)' : 'var(--red)'}">
      ${escHtml(message)}
    </div>` : '';

  const logHtml = logFile ? `
    <div style="margin-top:8px;padding:8px 10px;border-radius:6px;background:rgba(255,255,255,0.04);font-size:11px;color:var(--text-3);font-family:var(--font-mono)">
      Log: ${escHtml(logFile)}
    </div>` : '';

  body.innerHTML = tableHtml + msgHtml + logHtml;
  document.getElementById('result-modal').classList.remove('hidden');
}

// ─── Job polling ──────────────────────────────────────────────

async function pollJob(jobId) {
  for (let i = 0; i < 600; i++) {   // máx 30 min (600 × 3s)
    await new Promise(r => setTimeout(r, 3000));
    try {
      const job = await api.get(`/build/job/${jobId}`);
      if (job.status !== 'running') return job;
    } catch {}
  }
  return { status: 'failed', message: 'Timeout: operação demorou mais de 30 minutos.' };
}

// ─── Compile ──────────────────────────────────────────────────

async function handleCompile() {
  Loading.show('Listando fontes...');
  let sources;
  try {
    sources = await api.get('/build/sources');
  } catch (err) {
    Loading.hide();
    alert('Erro ao listar fontes: ' + err.message);
    return;
  }
  Loading.hide();

  if (!sources.count) {
    alert('Nenhum fonte (.prw, .tlpp, .prx) encontrado em:\n' + sources.dir);
    return;
  }

  const fileList = sources.files.map(f => '  ' + f).join('\n');
  openBuildModal(
    'Confirmar Compilação',
    `Os seguintes ${sources.count} fontes serão compilados:\n\n${fileList}`,
    null,
    async () => {
      Loading.show('Compilando fontes...');
      try {
        const started = await api.post('/build/compile');
        const result = await pollJob(started.jobId);
        Loading.hide();
        showBuildResultModal(
          result.success ? 'Compilação concluída' : 'Compilação falhou',
          result.results || [],
          result.message,
          result.logFile,
          result.success
        );
      } catch (err) {
        Loading.hide();
        showBuildResultModal('Erro na compilação', [], err.message, null, false);
      }
    }
  );
}

// ─── Apply Patch ──────────────────────────────────────────────

async function handleApplyPatch() {
  Loading.show('Listando patches...');
  let patchData;
  try {
    patchData = await api.get('/build/patches');
  } catch (err) {
    Loading.hide();
    alert('Erro ao listar patches: ' + err.message);
    return;
  }
  Loading.hide();

  // Show extraction errors (blocking)
  const extraction = patchData.extraction || {};
  if (extraction.errors?.length) {
    const names = extraction.errors.map(e => e.name || e).join(', ');
    alert(`Erro ao extrair ZIP(s): ${names}`);
  }

  if (!patchData.count) {
    alert('Nenhum arquivo .ptm encontrado em:\n' + patchData.dir);
    return;
  }

  const hasSdf = patchData.patches.some(p => p.hasSdf);
  const hasOrphan = patchData.patches.some(p => p.orphan);
  const fileList = patchData.patches.map(p => {
    let label = '  ';
    if (p.meta?.name) {
      const ver = p.meta.version ? ` · ${p.meta.version}` : '';
      const build = p.meta.build ? ` · build ${p.meta.build}` : '';
      label += `${p.meta.name}${ver}${build}`;
    } else {
      label += p.name;
    }
    if (p.hasSdf) label += ' [SDF]';
    if (p.orphan) label += ' ⚠ sem pacote ZIP';
    return label;
  }).join('\n');
  const extractedNote = extraction.extracted?.length
    ? `${extraction.extracted.length} pacote(s) ZIP extraído(s) automaticamente.\n\n`
    : '';
  const alertParts = [];
  if (hasSdf) alertParts.push('⚠ Pasta SDF detectada. Após aplicar o patch, execute o UPDDISTR manualmente no SmartClient antes de promover o RPO.');
  if (hasOrphan) alertParts.push('⚠ Um ou mais PTMs estão na raiz da pasta sem ZIP gerenciado. Recomenda-se usar ZIPs.');
  const alertMsg = alertParts.length ? alertParts.join('\n') : null;

  openBuildModal(
    'Confirmar Aplicação de Patches',
    `${extractedNote}Os seguintes ${patchData.count} patches serão aplicados:\n\n${fileList}`,
    alertMsg,
    async () => {
      Loading.show('Aplicando patches...');
      try {
        const started = await api.post('/build/patch-apply');
        const result = await pollJob(started.jobId);
        Loading.hide();
        let msg = result.message || '';
        if (result.hasSdf) msg += ' ⚠ Pasta SDF detectada — execute o UPDDISTR no SmartClient antes de promover o RPO.';
        const results = (result.results || []).map(r => ({ name: r.name, success: r.applied ?? r.success, logFile: r.logFile, timings: r.timings }));
        showBuildResultModal(
          result.success ? 'Patches aplicados' : 'Aplicação falhou',
          results, msg, result.logFile, result.success
        );
      } catch (err) {
        Loading.hide();
        showBuildResultModal('Erro ao aplicar patches', [], err.message, null, false);
      }
    }
  );
}

// ─── Promote RPO ──────────────────────────────────────────────

async function handlePromoteRpo() {
  Loading.show('Carregando destinos...');
  let destData;
  try {
    destData = await api.get('/build/promote-destinations');
  } catch (err) {
    Loading.hide();
    alert('Erro ao carregar destinos: ' + err.message);
    return;
  }
  Loading.hide();

  const { destinations, compilerSourcePath } = destData;
  if (!destinations || !destinations.length) {
    alert('Nenhum slave configurado para promoção.');
    return;
  }

  document.getElementById('promote-origin').textContent = `Origem: ${compilerSourcePath || 'N/A'}`;

  const listEl = document.getElementById('promote-destinations-list');
  listEl.innerHTML = destinations.map(d => `
    <label style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:6px;background:rgba(255,255,255,0.04);cursor:pointer">
      <input type="checkbox" class="promote-dest-check" data-key="${escHtml(d.key)}" checked style="margin-top:3px;accent-color:var(--purple)">
      <div>
        <div style="font-weight:500;color:var(--text)">${escHtml(d.label)}</div>
        <div style="font-size:11px;color:var(--text-3);font-family:var(--font-mono)">${escHtml(d.sourcePath)}</div>
      </div>
    </label>
  `).join('');

  const modal = document.getElementById('promote-modal');
  modal.classList.remove('hidden');

  document.getElementById('promote-cancel').onclick = () => modal.classList.add('hidden');

  document.getElementById('promote-confirm').onclick = async () => {
    const selectedKeys = Array.from(
      document.querySelectorAll('.promote-dest-check:checked')
    ).map(cb => cb.dataset.key);

    if (!selectedKeys.length) {
      alert('Selecione ao menos um destino.');
      return;
    }

    modal.classList.add('hidden');
    Loading.show('Promovendo RPO...');
    try {
      const result = await api.post('/build/promote-rpo', { selectedKeys });
      Loading.hide();
      showBuildResultModal(
        result.success ? 'RPO promovido' : 'Promoção com erros',
        result.results || [],
        result.message,
        null,
        result.success
      );
    } catch (err) {
      Loading.hide();
      showBuildResultModal('Erro ao promover RPO', [], err.message, null, false);
    }
  };
}

// ─── Rollback RPO ─────────────────────────────────────────────

function handleRollbackRpo() {
  openModal(
    'Rollback RPO',
    'Os arquivos .bak serão restaurados em todos os slaves.\nOs RPOs atuais serão sobrescritos.\n\nContinuar?',
    async () => {
      Loading.show('Revertendo RPO...');
      try {
        const result = await api.post('/build/rollback-rpo');
        Loading.hide();
        showBuildResultModal(
          result.success ? 'Rollback concluído' : 'Rollback com erros',
          result.results || [],
          result.message,
          null,
          result.success
        );
      } catch (err) {
        Loading.hide();
        showBuildResultModal('Erro no rollback', [], err.message, null, false);
      }
    }
  );
}
