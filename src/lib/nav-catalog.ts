// Catálogo ITEM A ITEM: cada tela do menu é associável a um módulo no Configurador.
// key = href (único). `group` é só p/ agrupar visualmente no Configurador.
// O sidebar usa itemModule[href] (do Configurador) p/ decidir em qual módulo a tela aparece.

export interface CatalogItem {
  key: string      // = href
  label: string
  group: string    // agrupamento visual (origem)
}

export const NAV_CATALOG: CatalogItem[] = [
  // Home / Configurador
  { key: '/meu-painel',          label: 'Meu Painel',                 group: 'Home' },
  // Projetos onde o consultor está alocado (abre o cronograma p/ apontar).
  { key: '/meus-projetos',       label: 'Projetos',                   group: 'Home' },
  { key: '/configurador',        label: 'Configurador de Menus',      group: 'Configurador' },

  // Serviços — Projetos / Sustentação / Operação
  { key: '/contratos/pipeline',      label: 'Demandas e Projetos',     group: 'Projetos' },
  { key: '/investimento-comercial',  label: 'Investimento Interno',    group: 'Projetos' },
  { key: '/projetos/indicadores',    label: 'Indicadores de Projetos', group: 'Projetos' },
  { key: '/sustentacao',             label: 'Sustentação (Portal)',    group: 'Sustentação' },
  { key: '/timesheets',              label: 'Apontamentos',            group: 'Apontamentos & Despesas' },
  { key: '/expenses',                label: 'Despesas',                group: 'Apontamentos & Despesas' },
  { key: '/approvals',               label: 'Aprovações',              group: 'Apontamentos & Despesas' },
  { key: '/timesheets/atrasos',      label: 'Atrasos (integração)',    group: 'Apontamentos & Despesas' },
  { key: '/auditoria/apontamentos',  label: 'Auditoria',               group: 'Apontamentos & Despesas' },
  { key: '/relatorios/apontamentos', label: 'Relatório de Apontamentos', group: 'Apontamentos & Despesas' },

  // Administrativo — Gestão Contratual
  { key: '/gestao-projetos',   label: 'Gestão de Contratos',  group: 'Gestão Contratual' },
  { key: '/contratos/kanban',  label: 'Kanban Contratos',     group: 'Gestão Contratual' },

  // Administrativo — Financeiro / Fechamento
  { key: '/fechamento',               label: 'Fechamento Geral',         group: 'Financeiro' },
  { key: '/fechamento/cliente',       label: 'Fechamento Clientes',      group: 'Financeiro' },
  { key: '/fechamento/parceiro',      label: 'Fechamento Parceiros',     group: 'Financeiro' },
  { key: '/fechamento/consultor',     label: 'Fechamento Consultores',   group: 'Financeiro' },
  { key: '/fechamento/adiantamentos', label: 'Adiantamentos',            group: 'Financeiro' },
  { key: '/fechamento/diretoria',     label: 'Fechamento Diretoria',     group: 'Financeiro' },
  { key: '/fechamento/folha',         label: 'Folha Cooperativa',        group: 'Financeiro' },
  { key: '/fechamento/contratos',     label: 'Fechamento Contratos',     group: 'Financeiro' },
  { key: '/fechamento/reajustes',     label: 'Reajuste de Contrato',     group: 'Financeiro' },
  { key: '/fechamento/excedentes',    label: 'Horas Excedentes',         group: 'Financeiro' },
  { key: '/pagamento-despesas',       label: 'Pagamento de Despesas',    group: 'Financeiro' },

  // Administrativo — Relatórios
  { key: '/relatorios/pagamentos',                label: 'Relatório de Pagamentos',      group: 'Relatórios' },
  { key: '/relatorios/rentabilidade/consultor',   label: 'Rent. Consultor × Projeto',    group: 'Relatórios' },
  { key: '/relatorios/rentabilidade/projeto',     label: 'Rent. por Projeto',            group: 'Relatórios' },
  { key: '/relatorios/rentabilidade',             label: 'Rent. Clientes',               group: 'Relatórios' },
  { key: '/relatorios/contratos-sem-vencimento',  label: 'Contratos s/ Vencimento',      group: 'Relatórios' },
  { key: '/relatorios/atividade-clientes',         label: 'Status de Clientes',           group: 'Relatórios' },

  // Administrativo — Cadastros
  { key: '/clientes',                          label: 'Clientes',               group: 'Cadastros' },
  { key: '/partners',                          label: 'Parceiros',              group: 'Cadastros' },
  { key: '/cadastros?tab=executives',          label: 'Executivos',             group: 'Cadastros' },
  { key: '/cadastros?tab=payment_methods',     label: 'Formas de Pagamento',    group: 'Cadastros' },
  { key: '/cadastros?tab=holidays',            label: 'Feriados',               group: 'Cadastros' },
  { key: '/cadastros?tab=contracts',           label: 'Tipos de Contrato',      group: 'Cadastros' },
  { key: '/cadastros?tab=services',            label: 'Tipos de Serviço',       group: 'Cadastros' },
  { key: '/cadastros?tab=expense_types',       label: 'Tipos de Despesa',       group: 'Cadastros' },
  { key: '/cadastros?tab=expense_categories',  label: 'Categorias de Despesa',  group: 'Cadastros' },
  { key: '/cadastros?tab=groups',              label: 'Grupos de Consultor',    group: 'Cadastros' },
  { key: '/cadastros?tab=customer_contacts',   label: 'Contatos de Clientes',   group: 'Cadastros' },
  { key: '/cadastros/saldo-inicial-tickets',   label: 'Saldo Inicial de Tickets', group: 'Cadastros' },
  { key: '/configuracoes/movidesk',            label: 'Integração Movidesk',    group: 'Cadastros' },

  // Administrativo — Comunicação
  { key: '/central-comunicacao',         label: 'Central de Comunicação', group: 'Comunicação' },
  { key: '/cadastros?tab=email_templates', label: 'Modelos de E-mail',    group: 'Comunicação' },
  { key: '/cadastros/workflows',         label: 'Workflows de E-mail',    group: 'Comunicação' },

  // Administrativo — Visão Externa
  { key: '/portal-cliente',                  label: 'Home do Cliente',        group: 'Visão Externa' },
  { key: '/dashboards/bank-hours-fixed',     label: 'Banco de Horas Fixo',    group: 'Visão Externa' },
  { key: '/dashboards/bank-hours-monthly',   label: 'Banco de Horas Mensais', group: 'Visão Externa' },
  { key: '/dashboards/on-demand',            label: 'On Demand',              group: 'Visão Externa' },
  { key: '/dashboards/fechado',              label: 'Fechado',                group: 'Visão Externa' },
  { key: '/partner-dashboard',               label: 'Painel do Parceiro',     group: 'Visão Externa' },

  // Administrativo — Sistema
  { key: '/users',             label: 'Usuários',         group: 'Sistema' },
  { key: '/settings',          label: 'Geral',            group: 'Sistema' },
  { key: '/settings?tab=cargos', label: 'Cargos por Perfil', group: 'Sistema' },
  { key: '/settings?tab=perfis', label: 'Cadastro de Perfil', group: 'Sistema' },
  { key: '/ver-como',          label: 'Ver como',         group: 'Sistema' },
  { key: '/configuracoes/empresas', label: 'Empresas do Grupo', group: 'Sistema' },
  { key: '/liberacao-pipeline', label: 'Liberação de Visualização', group: 'Sistema' },

  // Help Desk — labels canônicos (espelham o NAV). Sem estas entradas o Configurador
  // não oferecia nenhuma tela de Help Desk e o menu mostrava o href cru.
  { key: '/help-desk/operacoes', label: 'Central de Operações',   group: 'Help Desk' },
  { key: '/help-desk/tickets',   label: 'Chamados',               group: 'Help Desk' },
  { key: '/help-desk/fila',      label: 'Fila (Kanban)',          group: 'Help Desk' },
  { key: '/help-desk/kb',        label: 'Base de Conhecimento',   group: 'Help Desk' },
  { key: '/help-desk/portal',    label: 'Central de Atendimento', group: 'Help Desk' },
  { key: '/help-desk/codigo-fonte', label: 'Solicitar Código-Fonte', group: 'Help Desk' },

  // Cofre de Senhas (zero-knowledge)
  { key: '/cofre',              label: 'Cofre de Senhas',       group: 'Cofre' },
  { key: '/cofre/configuracao', label: 'Configuração do Cofre', group: 'Cofre' },
  { key: '/cofre/auditoria',    label: 'Auditoria do Cofre',    group: 'Cofre' },

  // Cofre de Ambientes (infra Protheus)
  { key: '/ambientes',           label: 'Cofre de Ambientes',    group: 'Cofre' },
  { key: '/ambientes-preview',   label: 'Cofre de Ambientes',    group: 'Cofre' },
  { key: '/ambientes/auditoria', label: 'Auditoria de Ambientes', group: 'Cofre' },

  // BOT Minutor — telas configuráveis (acesso definido por perfil/usuário no Configurador)
  { key: '/feed-operacional',          label: 'Feed Operacional', group: 'BOT Minutor' },
  { key: '/inbox',                     label: 'Chat',             group: 'BOT Minutor' },
  { key: '/configuracoes/bot-minutor', label: 'BOT Minutor',      group: 'BOT Minutor' },

  // Banco de Competências (Skills)
  { key: '/competencias/dashboard',     label: 'Consulta de Competências',   group: 'Banco de Competências' },
  { key: '/competencias/pesquisas',     label: 'Pesquisas de Competências',  group: 'Banco de Competências' },
  { key: '/competencias/matriz',        label: 'Matriz & Formulários',       group: 'Banco de Competências' },
  { key: '/competencias/contratacao',   label: 'Contratação / Onboarding',   group: 'Banco de Competências' },
  { key: '/competencias/profissionais', label: 'Profissionais',              group: 'Banco de Competências' },
  { key: '/competencias/responder',     label: 'Minhas Competências',        group: 'Banco de Competências' },
]

export const CATALOG_LABEL: Record<string, string> = Object.fromEntries(NAV_CATALOG.map(c => [c.key, c.label]))
