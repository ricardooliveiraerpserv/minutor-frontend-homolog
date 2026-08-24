'use strict';

// Fase 2/P2: origem por repositório Git (antes: pasta local + folder browser /fs/*).
let passwordModified = false;
let gitTokenModified = false;

async function loadConfig() {
  try {
    const cfg = await api.get('/config');
    if (cfg.gitUrl)     document.getElementById('git-url').value    = cfg.gitUrl;
    if (cfg.gitBranch)  document.getElementById('git-branch').value = cfg.gitBranch;
    if (cfg.rpoApiUrl)  document.getElementById('rpo-api-url').value  = cfg.rpoApiUrl;
    if (cfg.rpoApiUser) document.getElementById('rpo-api-user').value = cfg.rpoApiUser;
    document.getElementById('rpo-exclusion-patterns').value = cfg.rpoExclusionPatterns || '';
    if (cfg.rpoApiPasswordSet) {
      document.getElementById('rpo-api-password-hint').classList.remove('hidden');
    }
    if (cfg.gitTokenSet) {
      document.getElementById('git-token-hint').classList.remove('hidden');
    }
  } catch (err) {
    console.error('[loadConfig] erro:', err);
  }
}

function showConfigAlert(type, msg) {
  const el = document.getElementById('config-alert');
  el.className = `alert ${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.requireLogin()) return;
  if (!Auth.requireAdmin()) return;

  loadConfig();

  document.getElementById('btn-save-config').addEventListener('click', async () => {
    const gitUrl                = document.getElementById('git-url').value.trim();
    const gitBranch             = document.getElementById('git-branch').value.trim();
    // Só envia o token se o usuário digitou explicitamente (senão preserva o atual).
    const gitToken              = gitTokenModified ? document.getElementById('git-token').value : '';
    const rpoApiUrl             = document.getElementById('rpo-api-url').value.trim();
    const rpoApiUser            = document.getElementById('rpo-api-user').value.trim();
    const rpoApiPassword        = passwordModified ? document.getElementById('rpo-api-password').value : '';
    const rpoExclusionPatterns  = document.getElementById('rpo-exclusion-patterns').value.trim();

    if (!gitUrl) {
      showConfigAlert('error', 'Informe a URL do repositório Git');
      return;
    }

    Loading.show('Salvando configuração...');
    try {
      const payload = { gitUrl, gitBranch, rpoApiUrl, rpoApiUser, rpoApiPassword, rpoExclusionPatterns };
      if (gitToken) payload.gitToken = gitToken;
      const saved = await api.post('/config', payload);
      await loadConfig();
      const patternsEcho = saved?.saved?.rpoExclusionPatterns;
      showConfigAlert('success', patternsEcho
        ? `Configuração salva — filtros: "${patternsEcho}"`
        : 'Configuração salva com sucesso');
      document.getElementById('rpo-api-password').value = '';
      document.getElementById('git-token').value = '';
      passwordModified = false;
      gitTokenModified = false;
      if (rpoApiPassword) document.getElementById('rpo-api-password-hint').classList.remove('hidden');
      if (gitToken)       document.getElementById('git-token-hint').classList.remove('hidden');
    } catch (err) {
      showConfigAlert('error', err.message);
    } finally {
      Loading.hide();
    }
  });

  document.getElementById('rpo-api-password').addEventListener('input', () => { passwordModified = true; });
  document.getElementById('git-token').addEventListener('input', () => { gitTokenModified = true; });

  document.getElementById('btn-check-api').addEventListener('click', async () => {
    const resultEl       = document.getElementById('check-api-result');
    const rpoApiUrl      = document.getElementById('rpo-api-url').value.trim();
    const rpoApiUser     = document.getElementById('rpo-api-user').value.trim();
    const rpoApiPassword = passwordModified ? document.getElementById('rpo-api-password').value : '';

    resultEl.textContent = 'Testando...';
    resultEl.style.color = 'var(--text-3)';
    try {
      const r = await api.post('/inventory/check-api', { rpoApiUrl, rpoApiUser, rpoApiPassword });
      if (r.compiled && r.online) {
        resultEl.style.color = 'var(--green)';
        resultEl.textContent = `API OK — ${r.responseMs}ms`;
      } else if (r.online && !r.compiled) {
        resultEl.style.color = 'var(--yellow, orange)';
        resultEl.textContent = `Servidor online mas API não encontrada no RPO`;
      } else {
        resultEl.style.color = 'var(--red)';
        resultEl.textContent = r.message || 'Falha ao conectar';
      }
    } catch (err) {
      resultEl.style.color = 'var(--red)';
      resultEl.textContent = err.message;
    }
  });
});
