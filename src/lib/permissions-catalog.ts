// Catálogo central de PERMISSÕES do sistema (chave + rótulo + grupo).
// Fonte única — usado no cadastro de usuários (extra_permissions) e no Configurador
// (vincular ações/privilégios de tela a permissões reais).

export const EXTRA_PERMISSION_OPTIONS: { value: string; label: string; group: string }[] = [
  // Dashboards
  { value: 'dashboards.bank_hours_fixed.view',   label: 'Dashboard BH Fixo',              group: 'Dashboards' },
  { value: 'dashboards.bank_hours_monthly.view', label: 'Dashboard BH Mensal',            group: 'Dashboards' },
  { value: 'dashboards.on_demand.view',          label: 'Dashboard On Demand',            group: 'Dashboards' },
  // Banco de Horas
  { value: 'hora_banco.view',                    label: 'Acessar Banco de Horas',         group: 'Banco de Horas' },
  // Horas
  { value: 'hours.view_all',                     label: 'Ver horas de todos',             group: 'Horas' },
  { value: 'hours.update_all',                   label: 'Editar horas de todos',          group: 'Horas' },
  { value: 'hours.delete_all',                   label: 'Excluir horas de todos',         group: 'Horas' },
  // Timesheets
  { value: 'timesheets.approve',                 label: 'Aprovar timesheets',             group: 'Timesheets' },
  { value: 'timesheets.view_project_full',       label: 'Ver timesheets do projeto',      group: 'Timesheets' },
  // Despesas
  { value: 'expenses.view_all',                  label: 'Ver despesas de todos',          group: 'Despesas' },
  { value: 'expenses.approve',                   label: 'Aprovar despesas',               group: 'Despesas' },
  // Usuários
  { value: 'users.view_all',                     label: 'Ver todos os usuários',          group: 'Usuários' },
  { value: 'users.create',                       label: 'Criar usuários',                 group: 'Usuários' },
  { value: 'users.update',                       label: 'Editar usuários',                group: 'Usuários' },
  { value: 'users.reset_password',               label: 'Resetar senhas',                 group: 'Usuários' },
  // Projetos (projects.view é base do coordenador — não aparece como extra)
  { value: 'projects.create',                    label: 'Incluir projetos',               group: 'Projetos' },
  { value: 'projects.update',                    label: 'Editar projetos',                group: 'Projetos' },
  { value: 'projects.view_financial',            label: 'Ver financeiro do projeto',      group: 'Projetos' },
  // Gestão de Projetos
  { value: 'gestao_projetos.view',               label: 'Acessar Gestão de Projetos',     group: 'Gestão de Projetos' },
  { value: 'gestao_projetos.update',             label: 'Editar projetos na Gestão',      group: 'Gestão de Projetos' },
  // Cadastros
  { value: 'customers.manage',                   label: 'Gerenciar Clientes',             group: 'Cadastros' },
  { value: 'contracts.manage',                   label: 'Gerenciar Tipos de Contrato',    group: 'Cadastros' },
  { value: 'services.manage',                    label: 'Gerenciar Tipos de Serviço',     group: 'Cadastros' },
  { value: 'executives.manage',                  label: 'Gerenciar Executivos',           group: 'Cadastros' },
  { value: 'groups.manage',                      label: 'Gerenciar Grupos de Consultor',  group: 'Cadastros' },
  { value: 'holidays.manage',                    label: 'Gerenciar Feriados',             group: 'Cadastros' },
  { value: 'partners.manage',                    label: 'Gerenciar Parceiros',            group: 'Cadastros' },
  // Relatórios
  { value: 'reports.view',                       label: 'Ver relatórios',                 group: 'Relatórios' },
  { value: 'reports.export',                     label: 'Exportar relatórios',            group: 'Relatórios' },
  // Financeiro
  { value: 'financial.view_project_cost',        label: 'Ver custo do projeto',           group: 'Financeiro' },
  // Sistema
  { value: 'settings.view',                      label: 'Acessar Configurações',          group: 'Sistema' },
  // Central de Fontes (C4a) — governança de escopo. Permissão EXPLÍCITA e auditável que
  // libera o acervo de TODOS os clientes a um usuário interno. NÃO se aplica a cliente
  // externo (a regra de segurança do backend tem precedência: cliente externo nunca é global).
  { value: 'source_docs.view_all_customers',     label: 'Central de Fontes: ver todos os clientes', group: 'Central de Fontes' },
]

// Sinônimos por ENTIDADE (prefixo da permissão) — PT/EN — pra casar a tela com suas permissões.
const ENTITY_SYNONYMS: Record<string, string[]> = {
  dashboards:      ['dashboard'],
  hora_banco:      ['banco de hora', 'banco-de-hora', 'bank-hour', 'bank_hour', 'hora_banco'],
  hours:           ['hora', 'hour'],
  timesheets:      ['timesheet', 'apontamento'],
  expenses:        ['expense', 'despesa', 'reembolso'],
  users:           ['user', 'usuario', 'usuário'],
  projects:        ['project', 'projeto'],
  gestao_projetos: ['gestao', 'gestão'],
  customers:       ['customer', 'cliente'],
  contracts:       ['contract', 'contrato'],
  services:        ['service', 'serviço', 'servico'],
  executives:      ['executive', 'executivo'],
  groups:          ['group', 'grupo'],
  holidays:        ['holiday', 'feriado'],
  partners:        ['partner', 'parceiro'],
  reports:         ['report', 'relatorio', 'relatório'],
  financial:       ['financeiro', 'financial', 'custo'],
  settings:        ['setting', 'configuracao', 'configuração', 'config'],
  source_docs:     ['central de fontes', 'source doc', 'source-doc', 'fonte', 'documentação de fonte'],
}

/**
 * Permissões RELEVANTES a uma tela (cadastro) — casa o prefixo da permissão (entidade)
 * com o texto da tela (key + label), em PT ou EN. Ex.: tela "Usuários" (/users) → users.*.
 * Se nada casar, devolve o catálogo inteiro (fallback).
 */
export function permissionsForScreen(screenKey: string, screenLabel?: string) {
  const text = `${screenKey} ${screenLabel ?? ''}`.toLowerCase()
  const rel = EXTRA_PERMISSION_OPTIONS.filter(p => {
    const prefix = p.value.split('.')[0]
    const syns = ENTITY_SYNONYMS[prefix] ?? [prefix]
    return syns.some(s => text.includes(s))
  })
  return rel.length > 0 ? rel : EXTRA_PERMISSION_OPTIONS
}

// ─── AÇÕES REAIS POR TELA ────────────────────────────────────────────────────
// As ações que uma tela realmente oferece (o menu de linha em prod). Muitas NÃO são
// permissões do sistema (ex.: "Reenviar boas-vindas" é ação de UI) — por isso vivem aqui,
// não no catálogo de permissões. `permission` vincula à permissão real quando existe.
export interface ScreenActionOption { label: string; permission?: string }

export const SCREEN_ACTIONS_CATALOG: Record<string, ScreenActionOption[]> = {
  '/users': [
    { label: 'Visualizar',          permission: 'users.view_all' },
    { label: 'Editar',              permission: 'users.update' },
    { label: 'Resetar senha',       permission: 'users.reset_password' },
    { label: 'Reenviar boas-vindas' },   // ação de UI — sem permissão dedicada
    { label: 'Excluir',             permission: 'users.delete' },
  ],
  // "Ver como": cada bloco é uma ação liberável por perfil. Libere aqui quem pode ver
  // como Cliente / Consultor / Parceiro. (Admin e Administrativo têm todos por padrão.)
  // A trava de nível — não ver privilégio igual/maior — é do backend, não configurável aqui.
  '/ver-como': [
    { label: 'Ver como Cliente',   permission: 'ver_como.cliente' },
    { label: 'Ver como Consultor', permission: 'ver_como.consultor' },
    { label: 'Ver como Parceiro',  permission: 'ver_como.parceiro' },
  ],
}

/** Tira query/hash da key pra casar no catálogo (ex.: '/cadastros?tab=x' → '/cadastros'). */
export const baseScreenKey = (key: string) => key.split('?')[0].split('#')[0]

/** Entidade (prefixo de permissão) da tela, via sinônimos. Ex.: '/clientes' → 'customers'. */
export function entityForScreen(screenKey: string, screenLabel?: string): string | null {
  const text = `${screenKey} ${screenLabel ?? ''}`.toLowerCase()
  for (const [entity, syns] of Object.entries(ENTITY_SYNONYMS)) {
    if (syns.some(s => text.includes(s))) return entity
  }
  return null
}

// Verbo da ação (rótulo/slug) → sufixo de permissão. Ordem importa (mais específico primeiro).
const VERB_MAP: [string, string][] = [
  ['ver todos', 'view_all'], ['todos', 'view_all'],
  ['resetar senha', 'reset_password'], ['redefinir senha', 'reset_password'], ['reset', 'reset_password'],
  ['visualizar', 'view'], ['ver', 'view'], ['consultar', 'view'],
  ['criar', 'create'], ['incluir', 'create'], ['adicionar', 'create'], ['nov', 'create'],
  ['editar', 'update'], ['atualizar', 'update'], ['alterar', 'update'],
  ['excluir', 'delete'], ['deletar', 'delete'], ['remover', 'delete'], ['apagar', 'delete'],
  ['aprovar', 'approve'], ['rejeitar', 'reject'], ['exportar', 'export'], ['pagar', 'pay'],
]

/**
 * Resolve a PERMISSÃO real de uma ação. Se o action_key já é permissão (tem ponto) devolve ele.
 * Senão infere por ENTIDADE da tela + VERBO do rótulo (ex.: tela Clientes + "Excluir" → customers.delete).
 * `permissions` = universo do sistema (valida se existe); se vier vazio, confia na chave montada.
 * Retorna null quando não dá p/ mapear (ação de UI pura, ex.: "Reenviar boas-vindas").
 */
export function resolveActionPermission(screenKey: string, actionKey: string, actionLabel: string, permissions: string[]): string | null {
  const permSet = new Set(permissions)
  const ok = (p: string) => permSet.size === 0 || permSet.has(p)
  if (actionKey.includes('.')) return ok(actionKey) ? actionKey : null
  const entity = entityForScreen(screenKey)
  if (!entity) return null
  const label = (actionLabel || actionKey).toLowerCase()
  for (const [k, v] of VERB_MAP) {
    if (label.includes(k)) {
      // SÓ a permissão ESPECÍFICA do verbo (distinta). NÃO cai em `.manage`: seria compartilhada
      // por Criar/Editar/Excluir → desabilitar um desabilitaria os 3. Sem específica → null
      // (o editor usa chave única escopada na tela → cada ação independente).
      const specific = `${entity}.${v}`
      return ok(specific) ? specific : null
    }
  }
  return null
}

/**
 * Opções de AÇÃO sugeridas p/ uma tela: 1º o catálogo real da tela (igual prod);
 * se a tela não tiver catálogo, cai nas permissões do sistema relevantes (scopadas).
 * `key` = permissão real (vira action_key) ou '' (ação de UI → backend gera o slug do label).
 */
export function actionOptionsForScreen(screenKey: string, screenLabel?: string): { label: string; key: string; note: string }[] {
  const cat = SCREEN_ACTIONS_CATALOG[baseScreenKey(screenKey)]
  if (cat) return cat.map(a => ({ label: a.label, key: a.permission ?? '', note: a.permission ?? 'ação da tela' }))
  return permissionsForScreen(screenKey, screenLabel).map(p => ({ label: p.label, key: p.value, note: p.value }))
}
