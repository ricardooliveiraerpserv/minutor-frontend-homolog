// Catálogo de "itens de menu" associáveis no Configurador. Cada item = um grupo do menu
// (com suas telas). O admin associa cada item a um módulo (nav_modules.items no backend).
// As keys batem com o seed de nav_modules e com a `key` dos grupos no sidebar.

export interface CatalogItem {
  key: string
  label: string
  icon: string   // nome do ícone lucide (referência visual no Configurador)
}

export const NAV_CATALOG: CatalogItem[] = [
  // Serviços (padrão)
  { key: 'projetos',          label: 'Projetos',          icon: 'FolderOpen' },
  { key: 'sustentacao',       label: 'Sustentação',       icon: 'Headphones' },
  { key: 'operacao',          label: 'Apontamentos & Despesas', icon: 'Clock' },
  // Administrativo (padrão)
  { key: 'gestao_contratual', label: 'Gestão Contratual', icon: 'Layers' },
  { key: 'financeiro',        label: 'Financeiro',        icon: 'DollarSign' },
  { key: 'relatorios',        label: 'Relatórios',        icon: 'FileText' },
  { key: 'cadastros',         label: 'Cadastros',         icon: 'Database' },
  { key: 'comunicacao',       label: 'Comunicação',       icon: 'Mail' },
  { key: 'visao_externa',     label: 'Visão Externa',     icon: 'BarChart2' },
  { key: 'sistema',           label: 'Sistema',           icon: 'Settings' },
  // Configurador (padrão)
  { key: 'configurador',      label: 'Configurador de Menus', icon: 'SlidersHorizontal' },
]

export const CATALOG_LABEL: Record<string, string> = Object.fromEntries(NAV_CATALOG.map(c => [c.key, c.label]))
