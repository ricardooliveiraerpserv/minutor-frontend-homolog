'use strict';

const PERM_LABELS = {
  'servicos.ver':       { label: 'Visualizar Serviços',  desc: 'Ver status de serviços e informações do ambiente' },
  'servicos.controlar': { label: 'Controlar Serviços',   desc: 'Parar, iniciar e reiniciar serviços Windows' },
  'compilacao.executar':{ label: 'Compilar Fontes',      desc: 'Compilar fontes AdvPL pelo painel' },
  'compilacao.promover':{ label: 'Promover RPO',         desc: 'Promover e rollback de RPO' },
  'exclusivo.ativar':   { label: 'Modo Exclusivo',       desc: 'Ativar e desativar modo exclusivo' },
  'pacote.aplicar':     { label: 'Aplicar Pacote PTM',   desc: 'Upload e aplicação de patches' },
  'fontes.ver':         { label: 'Ver Fontes',           desc: 'Acessar inventário de fontes' },
  'fontes.gerenciar':   { label: 'Gerenciar Fontes',     desc: 'Upload e gestão na pasta de projeto' },
  'sistema.limpar':     { label: 'Limpar Sistema',       desc: 'Limpar arquivos temporários' },
  'janela.configurar':  { label: 'Configurar Janela',    desc: 'Configurar janela automática de manutenção' },
  'usuarios.gerenciar': { label: 'Gerenciar Usuários',   desc: 'Criar, editar e remover usuários' },
  'configuracoes.ver':  { label: 'Ver Configurações',    desc: 'Acessar configurações do sistema' },
};

let users = [];
let editingUsername = null;
let deletingUsername = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireLogin()) return;
  if (!Auth.requireAdmin()) return;

  loadUsers();

  document.getElementById('btn-new-user').addEventListener('click', openNewUserModal);
  document.getElementById('user-modal-cancel').addEventListener('click', closeModal);
  document.getElementById('delete-cancel').addEventListener('click', () => {
    document.getElementById('delete-modal').classList.add('hidden');
  });

  document.getElementById('user-modal-save').addEventListener('click', saveUser);
  document.getElementById('delete-confirm').addEventListener('click', deleteUser);

  document.getElementById('modal-is-admin').addEventListener('change', e => {
    document.getElementById('permissions-section').style.opacity = e.target.checked ? '0.4' : '1';
  });

  document.getElementById('user-search').addEventListener('input', e => filterUsers(e.target.value));
});

async function loadUsers() {
  Loading.show('Carregando usuários...');
  try {
    users = await api.get('/users');
    renderUsers(users);
  } catch (err) {
    showPageAlert('error', 'Erro ao carregar usuários: ' + err.message);
  } finally {
    Loading.hide();
  }
}

function renderUsers(list) {
  const tbody = document.getElementById('users-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-3)">Nenhum usuário cadastrado</td></tr>';
    return;
  }

  const self = Auth.getUser()?.username;

  tbody.innerHTML = list.map(u => `
    <tr>
      <td><span class="mono">${u.username}</span></td>
      <td style="color:var(--text)">${u.name || '—'}</td>
      <td>${u.isAdmin ? '<span class="badge admin">Admin</span>' : '<span class="badge" style="background:rgba(255,255,255,0.06);color:var(--text-3)">Usuário</span>'}</td>
      <td><span class="badge ${u.status}">${u.status === 'active' ? 'Ativo' : 'Inativo'}</span></td>
      <td class="mono-dim">${fmtDate(u.lastAccess)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm btn-edit-user" data-username="${u.username}">Editar</button>
          ${u.username !== self ? `<button class="btn btn-danger btn-sm btn-del-user" data-username="${u.username}">Remover</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.btn-edit-user').forEach(btn =>
    btn.addEventListener('click', () => openEditUserModal(btn.dataset.username)));
  tbody.querySelectorAll('.btn-del-user').forEach(btn =>
    btn.addEventListener('click', () => confirmDelete(btn.dataset.username)));
}

function filterUsers(text) {
  const filtered = users.filter(u =>
    u.username.includes(text.toLowerCase()) ||
    (u.name || '').toLowerCase().includes(text.toLowerCase())
  );
  renderUsers(filtered);
}

function openNewUserModal() {
  editingUsername = null;
  document.getElementById('user-modal-title').textContent = 'Novo Usuário';
  document.getElementById('modal-username').value = '';
  document.getElementById('modal-username').disabled = false;
  document.getElementById('modal-name').value = '';
  document.getElementById('modal-password').value = '';
  document.getElementById('modal-status').value = 'active';
  document.getElementById('modal-is-admin').checked = false;
  document.getElementById('pwd-hint').textContent = '';
  document.getElementById('user-modal-alert').classList.add('hidden');
  renderPermissionsGrid({});
  document.getElementById('user-modal').classList.remove('hidden');
}

function openEditUserModal(username) {
  const user = users.find(u => u.username === username);
  if (!user) return;
  editingUsername = username;
  document.getElementById('user-modal-title').textContent = `Editar — ${username}`;
  document.getElementById('modal-username').value = username;
  document.getElementById('modal-username').disabled = true;
  document.getElementById('modal-name').value = user.name || '';
  document.getElementById('modal-password').value = '';
  document.getElementById('modal-status').value = user.status || 'active';
  document.getElementById('modal-is-admin').checked = user.isAdmin || false;
  document.getElementById('pwd-hint').textContent = '(deixe vazio para não alterar)';
  document.getElementById('user-modal-alert').classList.add('hidden');
  document.getElementById('permissions-section').style.opacity = user.isAdmin ? '0.4' : '1';
  renderPermissionsGrid(user.permissions || {});
  document.getElementById('user-modal').classList.remove('hidden');
}

function renderPermissionsGrid(perms) {
  const grid = document.getElementById('permissions-grid');
  grid.innerHTML = Object.entries(PERM_LABELS).map(([key, meta]) => `
    <label class="checkbox-item">
      <input type="checkbox" name="perm" value="${key}" ${perms[key] ? 'checked' : ''} style="accent-color:var(--purple)">
      <div>
        <div class="checkbox-item-label">${meta.label}</div>
        <div class="checkbox-item-desc">${meta.desc}</div>
      </div>
    </label>
  `).join('');
}

function closeModal() {
  document.getElementById('user-modal').classList.add('hidden');
}

async function saveUser() {
  const username = document.getElementById('modal-username').value.trim();
  const name     = document.getElementById('modal-name').value.trim();
  const password = document.getElementById('modal-password').value;
  const status   = document.getElementById('modal-status').value;
  const isAdmin  = document.getElementById('modal-is-admin').checked;

  if (!editingUsername && !username) {
    showModalAlert('O username é obrigatório');
    return;
  }
  if (!editingUsername && !password) {
    showModalAlert('A senha é obrigatória para novos usuários');
    return;
  }

  const permissions = {};
  document.querySelectorAll('input[name="perm"]:checked').forEach(cb => {
    permissions[cb.value] = true;
  });

  const payload = { name, status, isAdmin, permissions };
  if (password) payload.password = password;
  if (!editingUsername) payload.username = username;

  Loading.show('Salvando...');
  try {
    if (editingUsername) {
      await api.put(`/users/${editingUsername}`, payload);
    } else {
      await api.post('/users', payload);
    }
    closeModal();
    showPageAlert('success', `Usuário ${editingUsername ? 'atualizado' : 'criado'} com sucesso`);
    await loadUsers();
  } catch (err) {
    showModalAlert(err.message);
  } finally {
    Loading.hide();
  }
}

function showModalAlert(msg) {
  const el = document.getElementById('user-modal-alert');
  document.getElementById('user-modal-alert-text').textContent = msg;
  el.classList.remove('hidden');
}

function confirmDelete(username) {
  deletingUsername = username;
  document.getElementById('delete-modal-user').textContent = username;
  document.getElementById('delete-modal').classList.remove('hidden');
}

async function deleteUser() {
  if (!deletingUsername) return;
  document.getElementById('delete-modal').classList.add('hidden');

  Loading.show('Removendo usuário...');
  try {
    await api.delete(`/users/${deletingUsername}`);
    showPageAlert('success', `Usuário ${deletingUsername} removido`);
    await loadUsers();
  } catch (err) {
    showPageAlert('error', 'Erro: ' + err.message);
  } finally {
    Loading.hide();
    deletingUsername = null;
  }
}
