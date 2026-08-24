'use strict';

// ─── File Browser ────────────────────────────────────────────
const FileBrowser = {
  _targetInput: null,
  _selectedPath: null,

  open(targetInputId, mode = 'file') {
    this._targetInput = document.getElementById(targetInputId);
    this._selectedPath = null;
    this._mode = mode;

    const modal = document.getElementById('filebrowser-modal');
    modal.classList.remove('hidden');
    document.getElementById('fb-selected').textContent = '—';
    document.getElementById('fb-confirm').disabled = true;
    // Show "Usar esta pasta" button only in folder mode
    document.getElementById('fb-select-dir').style.display = mode === 'folder' ? '' : 'none';

    this._loadDrives().then(() => {
      const current = this._targetInput?.value.trim();
      const startPath = current
        ? current.replace(/[^\\\/]*\.[^\\\/]+$/, '') // strip filename if present
        : 'C:\\';
      this._navigate(startPath);
    });
  },

  async _loadDrives() {
    try {
      const drives = await api.get('/fs/drives');
      const container = document.getElementById('fb-drives');
      container.innerHTML = drives.map(d =>
        `<button class="btn btn-ghost btn-sm fb-drive-btn" data-path="${d}">${d.replace('\\','')}</button>`
      ).join('');
      container.querySelectorAll('.fb-drive-btn').forEach(btn =>
        btn.addEventListener('click', () => this._navigate(btn.dataset.path))
      );
    } catch {}
  },

  async _navigate(dirPath) {
    const list = document.getElementById('fb-list');
    list.innerHTML = '<div style="padding:12px;color:var(--text-3)">Carregando...</div>';

    try {
      const data = await api.get(`/fs/list?path=${encodeURIComponent(dirPath)}`);
      document.getElementById('fb-current-path').textContent = data.path;

      document.getElementById('fb-up').onclick = data.parent
        ? () => this._navigate(data.parent)
        : null;
      document.getElementById('fb-up').disabled = !data.parent;

      const items = [];

      if (data.parent) {
        items.push(`<div class="fb-item" data-type="dir" data-path="${data.parent}">
          <span class="fb-item-icon">⬆️</span>
          <span class="fb-item-name" style="color:var(--text-3)">..</span>
        </div>`);
      }

      for (const dir of data.dirs) {
        items.push(`<div class="fb-item" data-type="dir" data-path="${dir.path}">
          <span class="fb-item-icon">📁</span>
          <span class="fb-item-name">${dir.name}</span>
        </div>`);
      }

      for (const file of data.files) {
        items.push(`<div class="fb-item" data-type="file" data-path="${file.path}">
          <span class="fb-item-icon">⚙️</span>
          <span class="fb-item-name">${file.name}</span>
        </div>`);
      }

      if (!data.dirs.length && !data.files.length) {
        items.push('<div style="padding:12px;color:var(--text-3);font-size:13px">Nenhum arquivo .exe encontrado nesta pasta</div>');
      }

      list.innerHTML = items.join('');

      // In folder mode: current directory is always the selection
      if (this._mode === 'folder') {
        this._selectedPath = data.path;
        document.getElementById('fb-selected').textContent = data.path;
        document.getElementById('fb-confirm').disabled = false;
      }

      list.querySelectorAll('.fb-item').forEach(item => {
        item.addEventListener('click', () => {
          if (item.dataset.type === 'dir') {
            this._navigate(item.dataset.path);
          } else {
            // File selected
            list.querySelectorAll('.fb-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            this._selectedPath = item.dataset.path;
            document.getElementById('fb-selected').textContent = item.dataset.path;
            document.getElementById('fb-confirm').disabled = false;
          }
        });

        // Double-click dir to navigate
        item.addEventListener('dblclick', () => {
          if (item.dataset.type === 'dir') this._navigate(item.dataset.path);
        });
      });

    } catch (err) {
      list.innerHTML = `<div style="padding:12px;color:var(--red);font-size:13px">Erro: ${err.message}</div>`;
    }
  },

  close() {
    document.getElementById('filebrowser-modal').classList.add('hidden');
    this._targetInput = null;
    this._selectedPath = null;
  },

  confirm() {
    if (this._selectedPath && this._targetInput) {
      this._targetInput.value = this._selectedPath;
      this._targetInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    this.close();
  },
};

// Bind modal buttons
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('fb-cancel')?.addEventListener('click', () => FileBrowser.close());
  document.getElementById('fb-confirm')?.addEventListener('click', () => FileBrowser.confirm());
  document.getElementById('fb-select-dir')?.addEventListener('click', () => FileBrowser.confirm());

  // Delegate browse button clicks (works for dynamically added buttons too)
  document.addEventListener('click', e => {
    const btn = e.target.closest('.btn-browse');
    if (btn) FileBrowser.open(btn.dataset.target, 'file');
    const btnF = e.target.closest('.btn-browse-folder');
    if (btnF) FileBrowser.open(btnF.dataset.target, 'folder');
  });
});

// ─── Wizard state ────────────────────────────────────────────
let currentStep = 1;
const TOTAL_STEPS = 10;

// Holds the config being built
const cfg = {
  broker: { enabled: true, exePath: '', iniPath: '' },
  slaves: [],
  restServers: [],
  scheduleServers: [],
  compiler: { exePath: '' },
  exclusive: { exePath: '' },
  extraServices: [],
  rpoStrategy: 'sequential',
  folders: { patches: '', sources: '', project: '', getapoinfo: '' },
  maintenanceWindow: { enabled: false, days: [], time: '22:00', emails: [] },
  integrations: { n8nWebhookUrl: '', alertMissingSource: true },
};

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireLogin()) return;
  if (!Auth.requireAdmin()) return;

  await loadExistingConfig();
  initStepNavigation();

  document.getElementById('btn-prev').addEventListener('click', () => navigate(-1));
  document.getElementById('btn-next').addEventListener('click', () => navigate(1));
  document.getElementById('btn-save').addEventListener('click', saveConfig);

  // Broker
  document.getElementById('broker-enabled').addEventListener('change', toggleBrokerFields);
  document.getElementById('btn-parse-broker').addEventListener('click', parseBroker);
  document.getElementById('broker-exe').addEventListener('input', updateBrokerIniPreview);

  // Slaves
  document.getElementById('btn-add-slave').addEventListener('click', () => addSlaveEntry());

  // REST
  document.getElementById('rest-enabled').addEventListener('change', toggleRestFields);
  document.getElementById('btn-add-rest').addEventListener('click', () => addRestEntry());

  // Schedule
  document.getElementById('schedule-enabled').addEventListener('change', toggleScheduleFields);
  document.getElementById('btn-add-schedule').addEventListener('click', () => addScheduleEntry());

  // Compiler + Exclusive
  document.getElementById('btn-parse-compiler').addEventListener('click', () => parseAppserverIni('compiler'));
  document.getElementById('btn-parse-exclusive').addEventListener('click', () => parseAppserverIni('exclusive'));

  // Extra services
  document.getElementById('btn-add-extra').addEventListener('click', () => addExtraEntry());

  // Maintenance window
  document.getElementById('window-enabled').addEventListener('change', e => {
    document.getElementById('window-fields').style.display = e.target.checked ? 'block' : 'none';
  });

  updateProgress();
});

// ─── Load existing config ─────────────────────────────────────
async function loadExistingConfig() {
  try {
    const saved = await api.get('/config');
    if (!saved) return;

    Object.assign(cfg, saved);

    // Populate fields
    document.getElementById('broker-enabled').checked = cfg.broker?.enabled !== false;
    document.getElementById('broker-exe').value = cfg.broker?.exePath || '';
    toggleBrokerFields();

    if (cfg.slaves?.length) {
      for (const slave of cfg.slaves) addSlaveEntry(slave);
    }

    document.getElementById('rest-enabled').checked = (cfg.restServers?.length > 0);
    toggleRestFields();
    if (cfg.restServers?.length) {
      for (const r of cfg.restServers) addRestEntry(r);
    }

    document.getElementById('schedule-enabled').checked = (cfg.scheduleServers?.length > 0);
    toggleScheduleFields();
    if (cfg.scheduleServers?.length) {
      for (const s of cfg.scheduleServers) addScheduleEntry(s);
    }

    document.getElementById('compiler-exe').value = cfg.compiler?.exePath || '';
    if (cfg.compiler?.serviceName) {
      document.getElementById('compiler-exe').dataset.info = JSON.stringify(cfg.compiler);
      document.getElementById('compiler-svc').textContent  = cfg.compiler.serviceName;
      document.getElementById('compiler-port').textContent = cfg.compiler.port || '—';
      document.getElementById('compiler-env').textContent  = cfg.compiler.appEnvironment || '—';
      document.getElementById('compiler-info').style.display = 'block';
    }

    document.getElementById('exclusive-exe').value = cfg.exclusive?.exePath || '';
    if (cfg.exclusive?.serviceName) {
      document.getElementById('exclusive-exe').dataset.info = JSON.stringify(cfg.exclusive);
      document.getElementById('exclusive-svc').textContent  = cfg.exclusive.serviceName;
      document.getElementById('exclusive-port').textContent = cfg.exclusive.port || '—';
      document.getElementById('exclusive-env').textContent  = cfg.exclusive.appEnvironment || '—';
      document.getElementById('exclusive-info').style.display = 'block';
    }

    if (cfg.extraServices?.length) {
      for (const svc of cfg.extraServices) addExtraEntry(svc);
    }

    const rpoVal = cfg.rpoStrategy || 'sequential';
    document.querySelector(`input[name="rpo-strategy"][value="${rpoVal}"]`).checked = true;

    document.getElementById('folder-patches').value    = cfg.folders?.patches || '';
    document.getElementById('folder-sources').value    = cfg.folders?.sources || '';
    document.getElementById('folder-getapoinfo').value = cfg.folders?.getapoinfo || '';

    document.getElementById('window-enabled').checked = cfg.maintenanceWindow?.enabled || false;
    document.getElementById('window-time').value = cfg.maintenanceWindow?.time || '22:00';
    document.getElementById('window-emails').value = (cfg.maintenanceWindow?.emails || []).join(', ');
    document.getElementById('window-fields').style.display = cfg.maintenanceWindow?.enabled ? 'block' : 'none';

    // Mark days
    for (const day of cfg.maintenanceWindow?.days || []) {
      const cb = document.querySelector(`.window-day[value="${day}"]`);
      if (cb) cb.checked = true;
    }

    // Integrations
    document.getElementById('n8n-webhook-url').value = cfg.integrations?.n8nWebhookUrl || '';
    document.getElementById('n8n-alert-missing').checked = cfg.integrations?.alertMissingSource !== false;

  } catch {
    // No config yet — start fresh
  }

  // Restore last visited step
  const savedStep = parseInt(localStorage.getItem('configurator-step') || '1');
  if (savedStep > 1) gotoStep(savedStep);

  // Auto-detect completion
  if (savedStep >= TOTAL_STEPS && !localStorage.getItem('configurator-completed')) {
    localStorage.setItem('configurator-completed', '1');
  }

  // If wizard was completed at least once, mark all dots green
  if (localStorage.getItem('configurator-completed')) {
    markAllStepsDone();
  } else if (savedStep > 1) {
    // Mark all previous steps as done
    for (let s = 1; s < savedStep; s++) {
      document.querySelector(`[data-step="${s}"]`)?.classList.add('done');
      document.querySelector(`[data-step="${s}"]`)?.classList.remove('active');
    }
  }
}

// ─── Navigation ───────────────────────────────────────────────
function navigate(dir) {
  const newStep = currentStep + dir;
  if (newStep < 1 || newStep > TOTAL_STEPS) return;
  gotoStep(newStep);
}

function gotoStep(step) {
  document.querySelector(`[data-step="${currentStep}"]`)?.classList.add('done');
  document.querySelector(`[data-step="${currentStep}"]`)?.classList.remove('active');
  document.getElementById(`pane-${currentStep}`).classList.remove('active');

  currentStep = step;
  localStorage.setItem('configurator-step', step);

  document.querySelector(`[data-step="${currentStep}"]`)?.classList.add('active');
  document.querySelector(`[data-step="${currentStep}"]`)?.classList.remove('done');
  document.getElementById(`pane-${currentStep}`).classList.add('active');

  updateProgress();
}

function markAllStepsDone() {
  for (let s = 1; s <= TOTAL_STEPS; s++) {
    const dot = document.querySelector(`[data-step="${s}"]`);
    if (!dot) continue;
    dot.classList.add('done');
    dot.classList.remove('active');
  }
}

function initStepNavigation() {
  if (!localStorage.getItem('configurator-completed')) return;
  for (let s = 1; s <= TOTAL_STEPS; s++) {
    const dot = document.querySelector(`[data-step="${s}"]`);
    if (!dot) continue;
    dot.style.cursor = 'pointer';
    dot.title = `Ir para o passo ${s}`;
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      gotoStep(s);
    });
  }
}

function updateProgress() {
  document.getElementById('btn-prev').disabled = currentStep === 1;
  document.getElementById('btn-next').style.display = currentStep < TOTAL_STEPS ? '' : 'none';
  document.getElementById('btn-save').style.display = '';
  document.getElementById('step-counter').textContent = `Passo ${currentStep} de ${TOTAL_STEPS}`;
}

// ─── Step 1: Broker ───────────────────────────────────────────
function toggleBrokerFields() {
  const enabled = document.getElementById('broker-enabled').checked;
  document.getElementById('broker-fields').style.display = enabled ? 'block' : 'none';
}

function updateBrokerIniPreview() {
  const exe = document.getElementById('broker-exe').value.trim();
  const preview = document.getElementById('broker-ini-preview');
  const iniPath = document.getElementById('broker-ini-path');
  if (exe) {
    const derived = exe.replace(/\.[^.]+$/, '') + '.ini';
    iniPath.textContent = derived;
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
}

async function parseBroker() {
  const exe = document.getElementById('broker-exe').value.trim();
  if (!exe) { alert('Informe o caminho do broker primeiro.'); return; }

  Loading.show('Lendo INI do broker e descobrindo slaves...');
  try {
    const result = await api.post('/config/discover-slaves', { brokerExePath: exe });

    const msgEl = document.getElementById('broker-discover-msg');
    msgEl.textContent = `✓ Encontrei ${result.totalSlaves} slaves em ${result.totalServers} servidor(es)`;
    document.getElementById('broker-discover-result').style.display = 'block';

    // Populate slave list preview
    const listEl = document.getElementById('broker-slave-list');
    listEl.innerHTML = result.slaves.map(s =>
      `<li class="discover-item">
        <span class="pulse-dot stopped"></span>
        <span class="mono">${s.ip}:${s.port}</span>
        <span style="color:var(--text-3);font-size:11px">${s.id}</span>
      </li>`
    ).join('');

    // Auto-populate slaves in step 2
    document.querySelectorAll('.slave-entry').forEach(e => e.remove());
    for (const slave of result.slaves) {
      addSlaveEntry({ _discovered: slave });
    }

    cfg.broker.enabled = true;
    cfg.broker.exePath = exe;
    if (result.brokerInfo) {
      cfg.broker.serviceName        = result.brokerInfo.serviceName || '';
      cfg.broker.serviceDisplayName = result.brokerInfo.serviceDisplayName || '';
      cfg.broker.port               = result.brokerInfo.port || null;
    }
    scheduleAutoSave();

  } catch (err) {
    alert('Erro ao ler broker INI: ' + err.message);
  } finally {
    Loading.hide();
  }
}

// ─── Step 2: Slaves ───────────────────────────────────────────
let slaveCount = 0;

function addSlaveEntry(data = {}) {
  slaveCount++;
  const tpl = document.getElementById('slave-template');
  const clone = tpl.content.cloneNode(true);
  const entry = clone.querySelector('.slave-entry');

  entry.querySelector('.slave-num').textContent = slaveCount;
  entry.querySelector('.slave-exe').value = data.exePath || '';
  entry.querySelector('.slave-unc').value = data.uncPath || '';

  entry.querySelector('.btn-remove-slave').addEventListener('click', () => entry.remove());
  entry.querySelector('.btn-parse-slave').addEventListener('click', () => parseSlave(entry));
  entry.querySelector('.btn-browse-dynamic')?.addEventListener('click', () => {
    const inp = entry.querySelector('.slave-exe');
    FileBrowser._targetInput = inp;
    FileBrowser._selectedPath = null;
    document.getElementById('fb-selected').textContent = '—';
    document.getElementById('fb-confirm').disabled = true;
    document.getElementById('filebrowser-modal').classList.remove('hidden');
    const startPath = inp.value.trim().replace(/[^\\\/]*\.[^\\\/]+$/, '') || 'C:\\';
    FileBrowser._loadDrives().then(() => FileBrowser._navigate(startPath));
  });

  document.getElementById('slaves-container').appendChild(clone);

  // If discovered from broker, auto-fill and parse
  if (data._discovered) {
    // Can't auto-parse without exe path, just note the IP:port
  }
  if (data.serviceName) {
    showSlaveInfo(entry, data);
  }
}

async function parseSlave(entry) {
  const exe = entry.querySelector('.slave-exe').value.trim();
  const unc = entry.querySelector('.slave-unc').value.trim();
  if (!exe) { alert('Informe o caminho do slave primeiro.'); return; }

  Loading.show('Lendo INI do slave...');
  try {
    const info = await api.post('/config/parse-slave-ini', { exePath: exe, uncPath: unc || undefined });
    showSlaveInfo(entry, info);
    scheduleAutoSave();
  } catch (err) {
    alert('Erro ao ler slave INI: ' + err.message);
  } finally {
    Loading.hide();
  }
}

function showSlaveInfo(entry, info) {
  const errDiv  = entry.querySelector('.slave-errors');
  const infoDiv = entry.querySelector('.slave-info');

  if (info.valid === false) {
    errDiv.innerHTML = info.errors.map(e =>
      `<div class="alert error" style="margin-bottom:6px;font-size:12px">⚠ ${e}</div>`
    ).join('');
    errDiv.style.display = 'block';
    infoDiv.style.display = 'none';
    entry.dataset.info = JSON.stringify(info);
    return;
  }

  errDiv.style.display = 'none';
  entry.querySelector('.slave-service-name').textContent = info.serviceName || '—';
  entry.querySelector('.slave-port').textContent         = info.port || '—';
  entry.querySelector('.slave-env').textContent          = info.appEnvironment || '—';
  entry.querySelector('.slave-root').textContent         = info.rootPath || '—';
  entry.querySelector('.slave-source').textContent       = info.sourcePath || '—';
  entry.querySelector('.slave-rpo-custom').textContent   = info.rpoCustom || '—';
  infoDiv.style.display = 'block';
  entry.dataset.info = JSON.stringify(info);
}

// ─── Step 3: REST ─────────────────────────────────────────────
let restCount = 0;

function toggleRestFields() {
  const enabled = document.getElementById('rest-enabled').checked;
  document.getElementById('rest-fields').style.display = enabled ? 'block' : 'none';
}

function addRestEntry(data = {}) {
  restCount++;
  const tpl = document.getElementById('rest-template');
  const clone = tpl.content.cloneNode(true);
  const entry = clone.querySelector('.rest-entry');

  entry.querySelector('.rest-num').textContent = restCount;
  entry.querySelector('.rest-exe').value = data.exePath || '';
  entry.querySelector('.rest-url').value = data.healthCheckUrl || '';
  entry.querySelector('.rest-user').value = data.healthCheckUser || '';

  // Restore parsed info when loading from saved config
  if (data.serviceName || data.port) {
    entry.dataset.restInfo = JSON.stringify(data);
    entry.querySelector('.rest-ini-info').style.display = 'block';
    entry.querySelector('.rest-detected-port').textContent  = data.port || '—';
    entry.querySelector('.rest-detected-proto').textContent = data.hasSSL ? 'HTTPS' : (data.protocol?.toUpperCase() || '—');
    entry.querySelector('.rest-detected-path').textContent  = data.urlPath || '—';
    entry.querySelector('.rest-detected-svc').textContent   = data.serviceName || '—';
  }

  entry.querySelector('.btn-remove-rest').addEventListener('click', () => entry.remove());
  entry.querySelector('.btn-parse-rest').addEventListener('click', () => parseRestIni(entry));
  entry.querySelector('.btn-test-rest').addEventListener('click', () => testRestHealth(entry));
  entry.querySelector('.btn-browse-dynamic')?.addEventListener('click', () => {
    const inp = entry.querySelector('.rest-exe');
    FileBrowser._targetInput = inp;
    FileBrowser._selectedPath = null;
    document.getElementById('fb-selected').textContent = '—';
    document.getElementById('fb-confirm').disabled = true;
    document.getElementById('filebrowser-modal').classList.remove('hidden');
    const startPath = inp.value.trim().replace(/[^\\\/]*\.[^\\\/]+$/, '') || 'C:\\';
    FileBrowser._loadDrives().then(() => FileBrowser._navigate(startPath));
  });

  document.getElementById('rest-container').appendChild(clone);
}

async function parseRestIni(entry) {
  const exe = entry.querySelector('.rest-exe').value.trim();
  if (!exe) { alert('Informe o caminho do executável REST primeiro.'); return; }

  Loading.show('Lendo INI do REST...');
  try {
    const info = await api.post('/config/parse-rest-ini', { exePath: exe });

    entry.querySelector('.rest-ini-info').style.display = 'block';
    entry.querySelector('.rest-detected-port').textContent  = info.port || '—';
    entry.querySelector('.rest-detected-proto').textContent = info.protocol?.toUpperCase() || '—';
    entry.querySelector('.rest-detected-path').textContent  = info.urlPath || '—';
    entry.querySelector('.rest-detected-svc').textContent   = info.serviceName || '—';
    entry.querySelector('.rest-url').value = info.healthCheckUrl || '';
    entry.dataset.restInfo = JSON.stringify(info);
    scheduleAutoSave();

  } catch (err) {
    alert('Erro ao ler INI do REST: ' + err.message);
  } finally {
    Loading.hide();
  }
}

async function testRestHealth(entry) {
  const url = entry.querySelector('.rest-url').value.trim();
  const user = entry.querySelector('.rest-user').value.trim();
  const pass = entry.querySelector('.rest-pass').value;

  const resultDiv = entry.querySelector('.rest-test-result');
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<span class="mono-dim">Testando...</span>';

  try {
    const res = await api.post('/config/health-check', { url, username: user, password: pass });
    resultDiv.innerHTML = res.ok
      ? `<div class="alert success">✓ ${res.message} ${res.hasToken ? '— token recebido' : ''}</div>`
      : `<div class="alert error">✗ ${res.message}</div>`;
  } catch (err) {
    resultDiv.innerHTML = `<div class="alert error">✗ ${err.message}</div>`;
  }
}

// ─── Step 4: Schedule ─────────────────────────────────────────
let schCount = 0;

function toggleScheduleFields() {
  const enabled = document.getElementById('schedule-enabled').checked;
  document.getElementById('schedule-fields').style.display = enabled ? 'block' : 'none';
}

function addScheduleEntry(data = {}) {
  schCount++;
  const tpl = document.getElementById('schedule-template');
  const clone = tpl.content.cloneNode(true);
  const entry = clone.firstElementChild;

  entry.querySelector('.sch-num').textContent = schCount;
  entry.querySelector('.sch-exe').value = data.exePath || '';
  entry.querySelector('.btn-remove-sch').addEventListener('click', () => entry.remove());
  entry.querySelector('.btn-parse-sch').addEventListener('click', () => parseScheduleIni(entry));
  entry.querySelector('.btn-browse-dynamic')?.addEventListener('click', () => {
    const inp = entry.querySelector('.sch-exe');
    FileBrowser._targetInput = inp;
    FileBrowser._selectedPath = null;
    document.getElementById('fb-selected').textContent = '—';
    document.getElementById('fb-confirm').disabled = true;
    document.getElementById('filebrowser-modal').classList.remove('hidden');
    const startPath = inp.value.trim().replace(/[^\\\/]*\.[^\\\/]+$/, '') || 'C:\\';
    FileBrowser._loadDrives().then(() => FileBrowser._navigate(startPath));
  });

  document.getElementById('schedule-container').appendChild(clone);

  if (data.serviceName) showScheduleInfo(entry, data);
}

async function parseScheduleIni(entry) {
  const exe = entry.querySelector('.sch-exe').value.trim();
  if (!exe) { alert('Informe o caminho do schedule primeiro.'); return; }

  Loading.show('Lendo INI do schedule...');
  try {
    const info = await api.post('/config/parse-slave-ini', { exePath: exe });
    showScheduleInfo(entry, info);
    scheduleAutoSave();
  } catch (err) {
    alert('Erro ao ler schedule INI: ' + err.message);
  } finally {
    Loading.hide();
  }
}

function showScheduleInfo(entry, info) {
  const errDiv  = entry.querySelector('.sch-errors');
  const infoDiv = entry.querySelector('.sch-info');

  if (info.valid === false) {
    errDiv.innerHTML = info.errors.map(e =>
      `<div class="alert error" style="margin-bottom:6px;font-size:12px">⚠ ${e}</div>`
    ).join('');
    errDiv.style.display = 'block';
    infoDiv.style.display = 'none';
    entry.dataset.info = JSON.stringify(info);
    return;
  }

  errDiv.style.display = 'none';
  entry.querySelector('.sch-service-name').textContent = info.serviceName || '—';
  entry.querySelector('.sch-port').textContent         = info.port || '—';
  entry.querySelector('.sch-env').textContent          = info.appEnvironment || '—';
  infoDiv.style.display = 'block';
  entry.dataset.info = JSON.stringify(info);
}

// ─── Step 5: Compiler + Exclusive ────────────────────────────
async function parseAppserverIni(type) {
  const exe = document.getElementById(`${type}-exe`).value.trim();
  if (!exe) { alert('Informe o caminho do executável primeiro.'); return; }

  const errDiv  = document.getElementById(`${type}-errors`);
  const infoDiv = document.getElementById(`${type}-info`);

  Loading.show('Lendo INI...');
  try {
    const info = await api.post('/config/parse-slave-ini', { exePath: exe });

    if (info.valid === false) {
      errDiv.innerHTML = info.errors.map(e =>
        `<div class="alert error" style="margin-bottom:6px;font-size:12px">⚠ ${e}</div>`
      ).join('');
      errDiv.style.display = 'block';
      infoDiv.style.display = 'none';
      return;
    }

    errDiv.style.display = 'none';
    document.getElementById(`${type}-svc`).textContent  = info.serviceName || '—';
    document.getElementById(`${type}-port`).textContent = info.port || '—';
    document.getElementById(`${type}-env`).textContent  = info.appEnvironment || '—';
    infoDiv.style.display = 'block';
    document.getElementById(`${type}-exe`).dataset.info = JSON.stringify(info);
    scheduleAutoSave();
  } catch (err) {
    alert('Erro ao ler INI: ' + err.message);
  } finally {
    Loading.hide();
  }
}

// ─── Step 6: Extra services ───────────────────────────────────
let extraCount = 0;

function addExtraEntry(data = {}) {
  extraCount++;
  const tpl = document.getElementById('extra-template');
  const clone = tpl.content.cloneNode(true);
  const entry = clone.firstElementChild;

  entry.querySelector('.extra-num').textContent = extraCount;
  entry.querySelector('.extra-exe').value      = data.exePath || '';
  entry.querySelector('.extra-svc-name').value = data.name || '';
  entry.querySelector('.extra-svc-desc').value = data.description || '';

  entry.querySelector('.btn-remove-extra').addEventListener('click', () => entry.remove());
  entry.querySelector('.btn-parse-extra').addEventListener('click', () => parseExtraIni(entry));
  entry.querySelector('.btn-browse-dynamic')?.addEventListener('click', () => {
    const inp = entry.querySelector('.extra-exe');
    FileBrowser._targetInput = inp;
    FileBrowser._selectedPath = null;
    FileBrowser._mode = 'file';
    document.getElementById('fb-selected').textContent = '—';
    document.getElementById('fb-confirm').disabled = true;
    document.getElementById('fb-select-dir').style.display = 'none';
    document.getElementById('filebrowser-modal').classList.remove('hidden');
    const startPath = inp.value.trim().replace(/[^\\\/]*\.[^\\\/]+$/, '') || 'C:\\';
    FileBrowser._loadDrives().then(() => FileBrowser._navigate(startPath));
  });

  document.getElementById('extra-services-container').appendChild(clone);
}

async function parseExtraIni(entry) {
  const exe = entry.querySelector('.extra-exe').value.trim();
  if (!exe) { alert('Informe o caminho do executável primeiro.'); return; }

  Loading.show('Lendo INI...');
  try {
    const info = await api.post('/config/parse-service-ini', { exePath: exe });
    if (info.serviceName) entry.querySelector('.extra-svc-name').value = info.serviceName;
    if (info.serviceDisplayName && !entry.querySelector('.extra-svc-desc').value) {
      entry.querySelector('.extra-svc-desc').value = info.serviceDisplayName;
    }
    scheduleAutoSave();
  } catch (err) {
    alert('Erro ao ler INI: ' + err.message);
  } finally {
    Loading.hide();
  }
}

// ─── Collect + Save ───────────────────────────────────────────
function collectConfig() {
  // Broker
  cfg.broker = {
    enabled:            document.getElementById('broker-enabled').checked,
    exePath:            document.getElementById('broker-exe').value.trim(),
    iniPath:            document.getElementById('broker-exe').value.trim().replace(/\.[^.]+$/, '') + '.ini',
    serviceName:        cfg.broker.serviceName        || '',
    serviceDisplayName: cfg.broker.serviceDisplayName || '',
    port:               cfg.broker.port               || null,
  };

  // Slaves
  cfg.slaves = [];
  document.querySelectorAll('.slave-entry').forEach(entry => {
    const info = entry.dataset.info ? JSON.parse(entry.dataset.info) : {};
    cfg.slaves.push({
      exePath: entry.querySelector('.slave-exe').value.trim(),
      uncPath: entry.querySelector('.slave-unc').value.trim(),
      ...info,
    });
  });

  // REST
  cfg.restServers = [];
  if (document.getElementById('rest-enabled').checked) {
    document.querySelectorAll('.rest-entry').forEach(entry => {
      const restInfo = entry.dataset.restInfo ? JSON.parse(entry.dataset.restInfo) : {};
      cfg.restServers.push({
        exePath:          entry.querySelector('.rest-exe').value.trim(),
        healthCheckUrl:   entry.querySelector('.rest-url').value.trim(),
        healthCheckUser:  entry.querySelector('.rest-user').value.trim(),
        healthCheckPass:  entry.querySelector('.rest-pass').value,
        serviceName:      restInfo.serviceName || '',
        port:             restInfo.port || null,
        hasSSL:           restInfo.hasSSL || false,
      });
    });
  }

  // Schedule
  cfg.scheduleServers = [];
  if (document.getElementById('schedule-enabled').checked) {
    document.querySelectorAll('.sch-entry').forEach(entry => {
      const v = entry.querySelector('.sch-exe').value.trim();
      const info = entry.dataset.info ? JSON.parse(entry.dataset.info) : {};
      if (v) cfg.scheduleServers.push({ exePath: v, serviceName: info.serviceName || '', port: info.port || null });
    });
  }

  // Compiler + Exclusive
  const compInfo = document.getElementById('compiler-exe').dataset.info
    ? JSON.parse(document.getElementById('compiler-exe').dataset.info) : {};
  cfg.compiler = { exePath: document.getElementById('compiler-exe').value.trim(), serviceName: compInfo.serviceName || '', port: compInfo.port || null };

  const exclInfo = document.getElementById('exclusive-exe').dataset.info
    ? JSON.parse(document.getElementById('exclusive-exe').dataset.info) : {};
  cfg.exclusive = { exePath: document.getElementById('exclusive-exe').value.trim(), serviceName: exclInfo.serviceName || '', port: exclInfo.port || null };

  // Extra services
  cfg.extraServices = [];
  document.querySelectorAll('.extra-entry').forEach(entry => {
    const name = entry.querySelector('.extra-svc-name').value.trim();
    if (name) {
      cfg.extraServices.push({
        exePath:     entry.querySelector('.extra-exe').value.trim(),
        name,
        description: entry.querySelector('.extra-svc-desc').value.trim(),
      });
    }
  });

  // RPO strategy
  cfg.rpoStrategy = document.querySelector('input[name="rpo-strategy"]:checked')?.value || 'sequential';

  // Folders
  cfg.folders = {
    patches:    document.getElementById('folder-patches').value.trim(),
    sources:    document.getElementById('folder-sources').value.trim(),
    getapoinfo: document.getElementById('folder-getapoinfo').value.trim(),
  };

  // Maintenance window
  const days = [...document.querySelectorAll('.window-day:checked')].map(c => c.value);
  const emailsRaw = document.getElementById('window-emails').value;
  cfg.maintenanceWindow = {
    enabled: document.getElementById('window-enabled').checked,
    days,
    time: document.getElementById('window-time').value,
    emails: emailsRaw.split(',').map(s => s.trim()).filter(Boolean),
  };

  // Integrations
  cfg.integrations = {
    n8nWebhookUrl:      (document.getElementById('n8n-webhook-url')?.value || '').trim(),
    alertMissingSource: document.getElementById('n8n-alert-missing')?.checked !== false,
  };

  return cfg;
}

async function saveConfig() {
  const data = collectConfig();

  if (!data.slaves?.length) {
    document.getElementById('alert-area').innerHTML =
      '<div class="alert error">⚠ Configure pelo menos um Slave antes de salvar.</div>';
    return;
  }

  Loading.show('Salvando configuração...');
  try {
    await api.put('/config', data);
    if (!localStorage.getItem('configurator-completed')) {
      localStorage.setItem('configurator-completed', '1');
      initStepNavigation();
    }
    markAllStepsDone();
    document.getElementById('alert-area').innerHTML =
      '<div class="alert success">✓ Configuração salva com sucesso!</div>';
    window.scrollTo(0, 0);
    setTimeout(() => { document.getElementById('alert-area').innerHTML = ''; }, 5000);
  } catch (err) {
    document.getElementById('alert-area').innerHTML =
      `<div class="alert error">✗ Erro ao salvar: ${err.message}</div>`;
  } finally {
    Loading.hide();
  }
}

// ─── Auto-save ────────────────────────────────────────────────
let _autoSaveTimer = null;

function scheduleAutoSave() {
  const status = document.getElementById('autosave-status');
  status.style.color = 'var(--text-3)';
  status.textContent = 'Aguardando...';

  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(async () => {
    try {
      const data = collectConfig();
      if (!data.slaves?.length) {
        status.style.color = 'var(--amber)';
        status.textContent = '⚠ Nenhum slave configurado — não salvo';
        return;
      }
      status.textContent = 'Salvando...';
      await api.put('/config', data);
      status.style.color = 'var(--green)';
      status.textContent = '✓ Salvo automaticamente';
      setTimeout(() => { status.textContent = ''; }, 3000);
    } catch {
      status.style.color = 'var(--red)';
      status.textContent = '✗ Falha ao salvar';
    }
  }, 1500);
}

// Listen for any input/change inside the wizard (covers dynamic fields too)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('.main-content')?.addEventListener('input',  scheduleAutoSave);
  document.querySelector('.main-content')?.addEventListener('change', scheduleAutoSave);
});
