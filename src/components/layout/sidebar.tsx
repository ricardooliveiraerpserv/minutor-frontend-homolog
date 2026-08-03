'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  Home,
  Clock,
  FolderOpen,
  Receipt,
  CheckSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Headphones,
  Megaphone,
  BarChart2,
  CalendarClock,
  Zap,
  Handshake,
  LayoutDashboard,
  Database,
  Landmark,
  FileType,
  Wrench,
  Users,
  Star,
  UserCheck,
  CalendarDays,
  Layers,
  TrendingUp,
  Building2,
  Tag,
  CreditCard,
  FileText,
  FileSpreadsheet,
  Contact,
  LayoutGrid,
  DollarSign,
  Webhook,
  Ticket,
  Briefcase,
  UserPlus,
  Search,
  Inbox,
  Mail,
  Banknote,
  Bot,
  Activity,
  MessageCircle,
  ListFilter,
  CalendarX,
  XCircle,
  GitBranch,
  HeartPulse,
  Wallet,
  Calculator,
  ListTodo,
  Radar,
  SlidersHorizontal,
  Eye,
  KeyRound,
  Server,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, secureUrl } from '@/lib/api'
import { cachedGet } from '@/lib/cached-api'
import { AuthedImg } from '@/components/ui/authed-img'
import { useState, useMemo, useEffect, useRef, Suspense } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { LucideIcon } from 'lucide-react'
import { icons as lucideIcons } from 'lucide-react'
import { CATALOG_LABEL } from '@/lib/nav-catalog'
import type { NavTreeNode, NavModuleConfig } from '@/contexts/nav-config-context'
import type { User } from '@/types'
import { type ModuleId } from '@/lib/modules'
import { useModules } from '@/contexts/module-context'

import { MinutorIcon } from '@/components/branding/MinutorIcon'

// ─── Nav config ──────────────────────────────────────────────────────────────

type NavItem = {
  type: 'item'
  label: string
  href: string
  icon: LucideIcon
  matchPaths?: string[]
  exactMatch?: boolean
  badge?: 'tasks' | 'notifications' | 'critical' | 'comunicados'   // indicador de ação na navegação
  module?: ModuleId
  catalogKey?: string   // key do catálogo (Configurador)
  // Visível em qualquer módulo (ignora o filtro de módulo) — p/ itens de sistema
  // que precisam ser alcançáveis independentemente do módulo do perfil.
  alwaysVisible?: boolean
}
type NavLink = { label: string; href: string; icon: LucideIcon; exactMatch?: boolean }
type NavSubGroup = {
  kind: 'subgroup'
  label: string
  icon: LucideIcon
  items: NavLink[]
}
type NavGroup = {
  type: 'group'
  label: string
  icon: LucideIcon
  items: (NavLink | NavSubGroup)[]
  module?: ModuleId
  catalogKey?: string   // key do catálogo (Configurador) — define em qual módulo o grupo aparece
}
type NavEntry = NavItem | NavGroup

// ── Módulos de navegação: cada ROTA pertence a Serviços ou Administrativo.
// Itens sem rota mapeada (home: Início, Meu Painel…) são SEMPRE visíveis (qualquer módulo).
// Filtra os menus de TODOS os perfis (exceto cliente) sem mexer em permissões.
const ROUTE_MODULE: [string, ModuleId][] = [
  // 🛠 Serviços
  ['/contratos/pipeline', 'servicos'],
  ['/investimento-comercial', 'servicos'],
  ['/sustentacao', 'servicos'],
  ['/timesheets', 'servicos'],
  ['/expenses', 'servicos'],
  ['/approvals', 'servicos'],
  ['/auditoria', 'servicos'],
  ['/relatorios/apontamentos', 'servicos'],
  // 📊 Administrativo
  ['/contratos/kanban', 'administrativo'],
  ['/gestao-projetos', 'administrativo'],
  ['/fechamento', 'administrativo'],
  ['/pagamento-despesas', 'administrativo'],
  ['/relatorios/pagamentos', 'administrativo'],
  ['/relatorios/rentabilidade', 'administrativo'],
  ['/relatorios/contratos-sem-vencimento', 'administrativo'],
  ['/clientes', 'administrativo'],
  ['/partners', 'administrativo'],
  ['/competencias', 'administrativo'],
  ['/cadastros', 'administrativo'],
  ['/configuracoes', 'administrativo'],
  ['/users', 'administrativo'],
  // /settings NÃO mapeado de propósito: "Configurações" é pessoal — sempre visível
  // (no NAV admin ela vive no grupo "Sistema" do Administrativo via module explícito;
  // perfis restritos como consultor mantêm o item sem perder acesso).
  ['/portal-cliente', 'administrativo'],
  ['/dashboards', 'administrativo'],
  ['/partner-dashboard', 'administrativo'],
  ['/cofre', 'administrativo'],
  ['/ambientes', 'administrativo'],
  // 🤝 CRM
  ['/crm', 'crm'],
  // 🎫 Help Desk
  ['/help-desk', 'help_desk'],
].sort((a, b) => b[0].length - a[0].length) as [string, ModuleId][]

function moduleForHref(href: string): ModuleId | null {
  const base = href.split('?')[0]
  for (const [prefix, mod] of ROUTE_MODULE) {
    if (base === prefix || base.startsWith(prefix + '/')) return mod
  }
  return null
}

// Filtra a navegação pelo módulo selecionado — POR ITEM (href), aplicando ATIVO + PERMISSÃO.
// itemConfig[href] = { módulo, ativo, perfis, usuários } (Configurador). Regras:
//  - inativo → some;  - precisa: perfil do user OU user específico (sem nenhum = some);  - só no módulo dele.
//  - tela NÃO configurada → fallback ROUTE_MODULE (sem restrição de permissão; não some por engano).
function filterNavByModule(
  nav: NavEntry[], mod: ModuleId,
  itemConfig: Record<string, { modules: string[]; active: boolean; profiles: string[]; users: number[] }>,
  userType: string, userId: number,
): NavEntry[] {
  const keepLink = (href: string) => {
    const conf = itemConfig[href]
    if (conf) {
      if (!conf.active) return false
      const permitted = conf.profiles.includes(userType) || conf.users.includes(userId)
      // tela pode aparecer em VÁRIOS módulos (reuso) — mostra se o módulo atual for um deles
      return permitted && conf.modules.includes(mod)
    }
    const m = moduleForHref(href)
    return m === null || m === mod
  }
  const out: NavEntry[] = []
  for (const entry of nav) {
    if (entry.type === 'item') {
      if (entry.alwaysVisible) { out.push(entry); continue }
      if (keepLink(entry.href)) out.push(entry)
      continue
    }
    // grupo: mantém só os itens (e subgrupos) cuja rota pertence ao módulo
    const items = entry.items
      .map(it => ('href' in it)
        ? it
        : { ...it, items: it.items.filter(s => keepLink(s.href)) })
      .filter(it => ('href' in it) ? keepLink(it.href) : it.items.length > 0)
    if (items.length > 0) out.push({ ...entry, items })
  }
  return out
}

// Meus Cards e Capacidade ainda em desenvolvimento — só DEV1
const IS_DEV1 = false  // experimentais desligados (localhost tem APP_ENV=dev só p/ faixa)
// "Ver como" (impersonation): ferramenta SÓ da Replica (APP_ENV=local). Fora dela nem aparece.
const IS_REPLICA = process.env.NEXT_PUBLIC_APP_ENV === 'local'

// Itens "home" — Meu Dia agrupa as abas (Notificações/Tarefas/Publicações/Config) internamente.
// Badge "critical" aparece quando há tarefa atrasada (gatilho de ação sempre visível).
const HOME_ITEMS: NavEntry[] = [
  { type: 'item', label: 'Meu Dia',       href: '/inicio',       icon: Home,            badge: 'critical' },
  { type: 'item', label: 'Meu Painel',    href: '/meu-painel',   icon: LayoutDashboard },
]

const NAV_COORDINATOR: NavEntry[] = [
  ...HOME_ITEMS,
  ...(IS_DEV1 ? [
    { type: 'item' as const, label: 'Meus Cards', href: '/meus-cards', icon: Inbox },
    { type: 'item' as const, label: 'Capacidade', href: '/capacidade', icon: Users },
  ] : []),
  {
    type: 'group',
    label: 'Apontamentos & Despesas',
    icon: Clock,
    items: [
      { label: 'Apontamentos', href: '/timesheets', icon: Clock },
      { label: 'Despesas',     href: '/expenses',   icon: Receipt },
      { label: 'Aprovações',   href: '/approvals',  icon: CheckSquare },
      { label: 'Atrasos (integração)', href: '/timesheets/atrasos', icon: CalendarClock },
      { label: 'Auditoria',    href: '/auditoria/apontamentos', icon: FileText },
    ],
  },
]


// NAV admin/default reorganizado em 2 módulos (Serviços / Administrativo).
// Itens "home" (Meu Painel/Início) ficam sem `module` → sempre visíveis.
// Os mesmos hrefs/ícones de antes — só mudou o agrupamento/rótulo (navegação).
const NAV: NavEntry[] = [
  // ── Home (sempre visível, fora dos módulos) ──
  ...HOME_ITEMS,
  ...(IS_DEV1 ? [
    { type: 'item' as const, label: 'Meus Cards', href: '/meus-cards', icon: Inbox },
    { type: 'item' as const, label: 'Capacidade', href: '/capacidade', icon: Users },
  ] : []),

  // ── ⚙️ CONFIGURADOR (associado via catálogo; aparece no módulo Configurador) ──
  { type: 'item', label: 'Configurador de Menus', href: '/configurador', icon: SlidersHorizontal, catalogKey: 'configurador' },
  { type: 'item', label: 'Empresas do Grupo', href: '/configuracoes/empresas', icon: Building2, catalogKey: 'configuracoes_empresas' },

  // ── 🤖 BOT MINUTOR — telas configuráveis pelo Configurador (acesso por perfil/usuário) ──
  { type: 'item', label: 'Feed Operacional', href: '/feed-operacional',          icon: Activity,       catalogKey: 'bot_minutor' },
  { type: 'item', label: 'Chat',             href: '/inbox',                     icon: MessageCircle,  catalogKey: 'bot_minutor' },
  { type: 'item', label: 'BOT Minutor',      href: '/configuracoes/bot-minutor', icon: Settings,       catalogKey: 'bot_minutor' },

  // 👁 "Ver como" agora é item do CONFIGURADOR (módulo Administrativo › Sistema, só Replica) —
  // gerenciável pela árvore. Não é mais hardcoded aqui.

  // ── 🛠 SERVIÇOS ──
  {
    type: 'group', module: 'servicos', catalogKey: 'projetos', label: 'Projetos', icon: FolderOpen,
    items: [
      { label: 'Demandas e Projetos',  href: '/contratos/pipeline',     icon: Layers },
      { label: 'Investimento Interno', href: '/investimento-comercial', icon: TrendingUp },
    ],
  },
  {
    type: 'group', module: 'servicos', catalogKey: 'sustentacao', label: 'Sustentação', icon: Headphones,
    items: [
      { label: 'Portal', href: '/sustentacao', icon: Headphones, exactMatch: true },
    ],
  },
  {
    type: 'group', module: 'servicos', catalogKey: 'operacao', label: 'Operação', icon: Clock,
    items: [
      { label: 'Apontamentos',              href: '/timesheets',              icon: Clock },
      { label: 'Despesas',                  href: '/expenses',                icon: Receipt },
      { label: 'Relatório de Apontamentos', href: '/relatorios/apontamentos', icon: FileText },
      { label: 'Aprovações',                href: '/approvals',               icon: CheckSquare },
      { label: 'Atrasos (integração)',      href: '/timesheets/atrasos',      icon: CalendarClock },
      { label: 'Auditoria',                 href: '/auditoria/apontamentos',  icon: FileText },
    ],
  },

  // ── 📊 ADMINISTRATIVO ──
  {
    type: 'group', module: 'administrativo', catalogKey: 'gestao_contratual', label: 'Gestão Contratual', icon: Layers,
    items: [
      { label: 'Gestão de Contratos', href: '/gestao-projetos',  icon: Layers },
      { label: 'Kanban Contratos',    href: '/contratos/kanban', icon: LayoutGrid },
    ],
  },
  {
    type: 'group', module: 'administrativo', catalogKey: 'financeiro', label: 'Financeiro', icon: DollarSign,
    items: [
      {
        kind: 'subgroup', label: 'Fechamento', icon: DollarSign,
        items: [
          { label: 'Geral',               href: '/fechamento',              icon: BarChart2,  exactMatch: true },
          { label: 'Clientes',            href: '/fechamento/cliente',      icon: Building2  },
          { label: 'Parceiros',           href: '/fechamento/parceiro',     icon: Handshake  },
          { label: 'Consultores',         href: '/fechamento/consultor',    icon: UserCheck  },
          { label: 'Adiantamentos',       href: '/fechamento/adiantamentos', icon: Banknote },
          { label: 'Diretoria',           href: '/fechamento/diretoria',    icon: Briefcase },
          { label: 'Folha Cooperativa',   href: '/fechamento/folha',        icon: FileSpreadsheet },
          { label: 'Contratos',           href: '/fechamento/contratos',    icon: FileText   },
          { label: 'Reajuste de Contrato', href: '/fechamento/reajustes',   icon: TrendingUp },
          { label: 'Horas Excedentes',    href: '/fechamento/excedentes',   icon: Clock },
          { label: 'Pagamento Despesas',  href: '/pagamento-despesas',      icon: DollarSign },
        ],
      },
    ],
  },
  {
    type: 'group', module: 'administrativo', catalogKey: 'relatorios', label: 'Relatórios', icon: FileText,
    items: [
      { label: 'Pagamentos',    href: '/relatorios/pagamentos',    icon: DollarSign },
      { label: 'Rent. Consultor × Projeto', href: '/relatorios/rentabilidade/consultor', icon: Users },
      { label: 'Rent. por Projeto',         href: '/relatorios/rentabilidade/projeto',   icon: FolderOpen },
      { label: 'Rent. Clientes',            href: '/relatorios/rentabilidade',           icon: TrendingUp, exactMatch: true },
      { label: 'Contratos s/ Vencimento', href: '/relatorios/contratos-sem-vencimento', icon: CalendarX },
    ],
  },
  {
    type: 'group', module: 'administrativo', catalogKey: 'cadastros', label: 'Cadastros', icon: Database,
    items: [
      { label: 'Clientes',              href: '/clientes',                         icon: Users },
      { label: 'Executivos',            href: '/cadastros?tab=executives',        icon: Star },
      { label: 'Parceiros',             href: '/partners',                        icon: Handshake },
      { label: 'Formas de Pagamento',   href: '/cadastros?tab=payment_methods',   icon: CreditCard },
      { label: 'Feriados',              href: '/cadastros?tab=holidays',          icon: CalendarDays },
      { label: 'Tipos de Contrato',     href: '/cadastros?tab=contracts',         icon: FileType },
      { label: 'Tipos de Serviço',      href: '/cadastros?tab=services',          icon: Wrench },
      { label: 'Tipos de Despesa',      href: '/cadastros?tab=expense_types',     icon: Receipt },
      { label: 'Categorias de Despesa', href: '/cadastros?tab=expense_categories', icon: Tag },
      { label: 'Grupos de Consultor',   href: '/cadastros?tab=groups',            icon: UserCheck },
      { label: 'Contatos de Clientes', href: '/cadastros?tab=customer_contacts',  icon: Contact },
      { label: 'Saldo Inicial de Tickets', href: '/cadastros/saldo-inicial-tickets', icon: Ticket },
      { label: 'Integração Movidesk',   href: '/configuracoes/movidesk',          icon: Webhook },
    ],
  },
  {
    type: 'group', module: 'administrativo', catalogKey: 'comunicacao', label: 'Comunicação', icon: Mail,
    items: [
      { label: 'Central de Comunicação', href: '/central-comunicacao',          icon: Mail },
      { label: 'Modelos de E-mail',   href: '/cadastros?tab=email_templates', icon: Mail },
      { label: 'Workflows de E-mail', href: '/cadastros/workflows',           icon: Mail },
    ],
  },
  {
    type: 'group', module: 'administrativo', catalogKey: 'visao_externa', label: 'Visão Externa', icon: BarChart2,
    items: [
      {
        kind: 'subgroup', label: 'Cliente', icon: Building2,
        items: [
          { label: 'Home do Cliente',        href: '/portal-cliente',                icon: Building2 },
          { label: 'Banco de Horas Fixo',    href: '/dashboards/bank-hours-fixed',   icon: BarChart2 },
          { label: 'Banco de Horas Mensais', href: '/dashboards/bank-hours-monthly', icon: CalendarClock },
          { label: 'On Demand',              href: '/dashboards/on-demand',           icon: Zap },
          { label: 'Fechado',                href: '/dashboards/fechado',             icon: CheckSquare },
        ],
      },
      {
        kind: 'subgroup', label: 'Consultor', icon: UserCheck,
        items: [ { label: 'Meu Painel', href: '/meu-painel', icon: UserCheck } ],
      },
      {
        kind: 'subgroup', label: 'Parceiro', icon: Handshake,
        items: [ { label: 'Painel do Parceiro', href: '/partner-dashboard', icon: Handshake } ],
      },
    ],
  },
  {
    type: 'group', module: 'administrativo', catalogKey: 'sistema', label: 'Sistema', icon: Settings,
    items: [
      // 🔐 Cofre de Senhas (zero-knowledge) — telas internas do módulo:
      // /cofre/configuracao e /cofre/auditoria são alcançadas de dentro do cofre.
      { label: 'Cofre de Senhas', href: '/cofre', icon: KeyRound },
      // Cofre de Ambientes fora do menu enquanto validamos o layout (rota /ambientes segue ativa).
      {
        kind: 'subgroup', label: 'Configurações', icon: Settings,
        items: [
          { label: 'Geral',            href: '/settings',            icon: Settings },
          { label: 'Usuários',         href: '/users',               icon: Users },
          { label: 'Cargos por Perfil', href: '/settings?tab=cargos', icon: Briefcase },
          { label: 'Liberação de Visualização', href: '/liberacao-pipeline', icon: SlidersHorizontal },
        ],
      },
    ],
  },

  // ── 🧠 Banco de Competências (matriz única, versionada) ──
  {
    type: 'group', module: 'administrativo', catalogKey: 'banco_competencias', label: 'Banco de Competências', icon: Star,
    items: [
      { label: 'Consulta de Competências', href: '/competencias/dashboard',   icon: Search },
      { label: 'Contratação / Onboarding', href: '/competencias/contratacao',  icon: UserPlus },
      { label: 'Matriz & Formulários',     href: '/competencias/matriz',       icon: GitBranch },
    ],
  },

  // ── 🤝 CRM (Fase 1; cresce a cada sub-fase) ──
  {
    type: 'group', module: 'crm', label: 'Comercial', icon: Handshake,
    items: [
      { label: 'Pipeline',     href: '/crm/pipeline',     icon: LayoutGrid },
      { label: 'Gestão de Propostas', href: '/crm/propostas/gestao', icon: ListFilter },
      { label: 'Oportunidades', href: '/crm/oportunidades', icon: ListFilter },
      { label: 'Saúde da Conta', href: '/crm/saude',      icon: HeartPulse },
      { label: 'Minha Carteira', href: '/crm/minha-carteira', icon: Wallet },
      { label: 'Forecast',     href: '/crm/forecast',     icon: TrendingUp },
      { label: 'Dashboards',   href: '/crm/dashboards',   icon: BarChart2 },
      { label: 'Tarefas',      href: '/crm/tarefas',      icon: ListTodo },
      { label: 'Simulador',    href: '/crm/simulador',    icon: Calculator },
    ],
  },
  {
    type: 'group', module: 'crm', label: 'Cadastros CRM', icon: Database,
    items: [
      { label: 'Empresas',            href: '/crm/empresas', icon: Building2 },
      { label: 'Contatos',            href: '/crm/contatos', icon: Contact },
    ],
  },
  {
    type: 'group', module: 'crm', label: 'Configurações CRM', icon: Settings,
    items: [
      { label: 'Pipelines',           href: '/crm/pipelines', icon: GitBranch },
      { label: 'Produtos e Serviços', href: '/crm/produtos', icon: Tag },
      { label: 'Origens',             href: '/crm/origens',  icon: Tag },
      { label: 'Motivos de Perda',    href: '/crm/motivos-perda', icon: XCircle },
      { label: 'Tipos de Contato',    href: '/crm/tipos-contato', icon: Tag },
      { label: 'Campos Personalizados', href: '/crm/campos-personalizados', icon: SlidersHorizontal },
      { label: 'Responsáveis',        href: '/crm/responsaveis', icon: UserCheck },
      { label: 'Dados da Contratada', href: '/crm/configuracoes/contratada', icon: Building2 },
      { label: 'Templates de Proposta', href: '/crm/configuracoes/templates', icon: FileText },
    ],
  },

  // ── 🎫 Help Desk (Fase 1; cresce a cada sub-fase) ──
  {
    type: 'group', module: 'help_desk', label: 'Help Desk', icon: Headphones,
    items: [
      { label: 'Central de Operações', href: '/help-desk/operacoes', icon: Radar },
      { label: 'Chamados', href: '/help-desk/tickets', icon: Ticket },
      { label: 'Fila (Kanban)', href: '/help-desk/fila', icon: LayoutGrid },
      { label: 'Base de Conhecimento', href: '/help-desk/kb', icon: FileText },
    ],
  },
  {
    type: 'group', module: 'help_desk', label: 'Configurações Help Desk', icon: Settings,
    items: [
      { label: 'Categorias', href: '/help-desk/configuracoes?tab=categorias', icon: Tag },
      { label: 'Serviços', href: '/help-desk/configuracoes?tab=servicos', icon: LayoutGrid },
      { label: 'Justificativas', href: '/help-desk/configuracoes?tab=justificativas', icon: FileText },
      { label: 'Status', href: '/help-desk/configuracoes?tab=status', icon: ListTodo },
      { label: 'Equipes', href: '/help-desk/configuracoes?tab=filas', icon: Users },
      { label: 'Perfis de Acesso', href: '/help-desk/configuracoes?tab=perfis', icon: Layers },
      { label: 'Pessoas', href: '/help-desk/configuracoes?tab=pessoas', icon: Contact },
      { label: 'Regras de Associação', href: '/help-desk/configuracoes?tab=associacoes', icon: Database },
      { label: 'Contas de E-mail', href: '/help-desk/configuracoes?tab=contas-email', icon: Mail },
      { label: 'Gatilhos (automação)', href: '/help-desk/configuracoes?tab=gatilhos', icon: Zap },
      { label: 'Comunicação', href: '/help-desk/configuracoes?tab=comunicacao', icon: Mail },
      { label: 'SLA', href: '/help-desk/configuracoes?tab=sla', icon: Clock },
      { label: 'Formulários', href: '/help-desk/configuracoes?tab=formularios', icon: FileText },
      { label: 'Tags', href: '/help-desk/configuracoes?tab=tags', icon: Tag },
      { label: 'Playbooks', href: '/help-desk/configuracoes?tab=playbooks', icon: Star },
    ],
  },

  // 🧪 Features experimentais — só em DEV1 (sempre visíveis; env-gated)
  ...(IS_DEV1 ? [
    { type: 'item' as const, label: 'Matriz de Conhecimento', href: '/matriz-conhecimento', icon: Star },
    { type: 'item' as const, label: 'Cobertura de Skills',    href: '/projetos/cobertura-skills', icon: UserCheck },
    { type: 'item' as const, label: 'Candidatos',             href: '/candidatos',                icon: Briefcase },
    { type: 'item' as const, label: 'Busca Avançada',         href: '/busca',                     icon: Search },
    { type: 'item' as const, label: 'Novo Candidato',         href: '/candidato/cadastro',        icon: UserPlus },
  ] : []),
]

// ─── Styles ───────────────────────────────────────────────────────────────────

// Base usa .sidebar-item (cor/hover via tokens) — funciona nos 2 temas.
// Active aplica .sidebar-item-active (primary-soft + primary).
const base = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] outline-none select-none sidebar-item'

function itemClass(active: boolean): string {
  return active ? 'sidebar-item-active' : ''
}

// Normaliza p/ busca: minúsculo + sem acento (casa "fechamento" digitando "fechament")
const normalizeForSearch = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// ─── Menu dirigido pela ÁRVORE do Configurador (nav_modules) ──────────────────
// A estrutura visual do menu de cada módulo vem da configuração (Configurador),
// não mais de uma árvore fixa. Ícone da tela: reaproveita o do NAV hardcoded
// (HREF_ICON); ícone de pasta: nome lucide salvo no nó.

const iconByName = (name?: string): LucideIcon =>
  (name && (lucideIcons as Record<string, LucideIcon>)[name]) || FileText

// href (sem query) → ícone, varrendo o NAV hardcoded p/ preservar os ícones das telas.
const HREF_ICON: Record<string, LucideIcon> = {}
// Registra a href COMPLETA (com query) e também a base (sem query, 1º vence).
// Sem a chave completa, telas /cadastros?tab=* colapsavam todas no ícone do 1º
// item /cadastros (Executivos = Star) — todas apareciam com estrela.
const putIcon = (href: string, icon: LucideIcon) => {
  if (!HREF_ICON[href]) HREF_ICON[href] = icon
  const base = href.split('?')[0]
  if (!HREF_ICON[base]) HREF_ICON[base] = icon
}
;(function collect(entries: NavEntry[]) {
  for (const e of entries) {
    if (e.type === 'item') putIcon(e.href, e.icon)
    else for (const it of e.items) {
      if ('href' in it) putIcon(it.href, it.icon)
      else for (const s of it.items) putIcon(s.href, s.icon)
    }
  }
})(NAV)
// Telas que não vivem no NAV estático (nascem em ramos por perfil) mas podem ser
// referenciadas na árvore do Configurador — registra o ícone p/ não cair no FileText.
putIcon('/meus-projetos', FolderOpen)

type ItemConfMap = Record<string, { modules: string[]; active: boolean; profiles: string[]; users: number[]; label?: string }>

// Perfis EFETIVOS do usuário: coordenador é separado por coordinator_type
// (coordenador_projetos | coordenador_sustentacao); mantém 'coordenador' p/ compat.
function effectiveProfiles(u?: { type?: string | null; coordinator_type?: string | null; consultant_type?: string | null; is_executive?: boolean | null } | null): string[] {
  const type = u?.type
  if (type === 'coordenador') return ['coordenador', `coordenador_${u?.coordinator_type ?? 'projetos'}`]
  // Espelha User::effectiveProfiles do backend: consultor por vínculo, parceiro por is_executive.
  if (type === 'consultor' && u?.consultant_type) return ['consultor', `consultor_${u.consultant_type}`]
  if (type === 'parceiro_admin') return ['parceiro_admin', u?.is_executive ? 'parceiro_gestor' : 'parceiro_simples']
  return type ? [type] : []
}

// Condição de negócio que a árvore NÃO expressa: a tela pode estar no menu do perfil e
// ainda assim não fazer sentido pra ESTE usuário. A árvore decide o QUE existe e em que
// posição; a condição decide se aquele usuário específico enxerga.
// Agente do Help Desk = vinculado a alguma equipe (`is_helpdesk_agent`, vem do /user).
// Admin sempre vê — espelha o bypass do HelpDeskAccessPolicy no backend.
const isHelpDeskAgent = (u?: User | null): boolean =>
  u?.type === 'admin' || !!u?.is_helpdesk_agent

function screenConditionAllows(href: string, user?: User | null): boolean {
  const base = href.split('?')[0]
  // /help-desk/portal é a via do CLIENTE (abrir chamado), não do agente — sem condição.
  if (base === '/help-desk/portal' || base.startsWith('/help-desk/portal/')) return true
  if (base === '/help-desk' || base.startsWith('/help-desk/')) return isHelpDeskAgent(user)
  return true
}

// Converte a árvore de um módulo (nav_modules.items) em NavEntry[] (grupos/subgrupos/itens),
// já filtrando por ativo + condição de negócio + override por usuário.
function buildModuleNav(moduleKey: ModuleId, navModules: NavModuleConfig[], itemConfig: ItemConfMap, user: User | null | undefined): NavEntry[] {
  const mod = navModules.find(m => m.key === moduleKey)
  if (!mod) return []
  // Módulo é do PRÓPRIO perfil (menus independentes): a presença na árvore já é a visibilidade.
  // Escondemos: telas globalmente desativadas, nós ocultos (hidden), override por usuário no nó,
  // ou condição de negócio não satisfeita (ex.: Help Desk só p/ agente).
  const userId = user?.id ?? 0
  // Visibilidade do NÓ p/ ESTE usuário: allow (users) sobrepõe hidden; deny (deny_users) esconde.
  const nodeVis = (n: NavTreeNode) => {
    if (n.users && n.users.includes(userId)) return true
    if (n.deny_users && n.deny_users.includes(userId)) return false
    return !n.hidden
  }
  // Grupo sem filho visível não é renderizado (`if (items.length)`), então esconder as
  // folhas do Help Desk já faz a pasta inteira sumir p/ quem não é agente.
  const keep = (href: string) => itemConfig[href]?.active !== false && screenConditionAllows(href, user)
  const lbl = (href: string) => itemConfig[href]?.label || CATALOG_LABEL[href] || href
  const ico = (href: string) => HREF_ICON[href] || HREF_ICON[href.split('?')[0]] || FileText
  // Ícone da folha: prioriza o ícone salvo no nó (Configurador), depois o estático
  // por href (HREF_ICON, sem query), por fim FileText. Sem isso, telas com querystring
  // (ex.: /cadastros?tab=*) colapsavam todas no mesmo ícone do href base.
  const leafIco = (n: NavTreeNode): LucideIcon =>
    (n.icon ? (lucideIcons as Record<string, LucideIcon>)[n.icon] : undefined) || ico(n.screen!)
  // exactMatch quando o href é PREFIXO de outro href do módulo (ex.:
  // /relatorios/rentabilidade tem filhos /consultor e /projeto). Sem isso o
  // pai faz prefix-match e acende junto com o filho ("dois selecionados").
  const allHrefs: string[] = []
  const collectHrefs = (ns: NavTreeNode[] = []) => ns.forEach(n => { if (n.screen) allHrefs.push(n.screen.split('?')[0]); collectHrefs(n.children ?? []) })
  collectHrefs(mod.items ?? [])
  const needsExact = (href: string) => { const base = href.split('?')[0]; return allHrefs.some(h => h !== base && h.startsWith(base + '/')) }
  const link = (n: NavTreeNode): NavLink => ({ label: n.label || lbl(n.screen!), href: n.screen!, icon: leafIco(n), exactMatch: needsExact(n.screen!) })

  const out: NavEntry[] = []
  for (const n of mod.items ?? []) {
    if (!nodeVis(n)) continue
    if (n.screen) { if (keep(n.screen)) out.push({ type: 'item', label: n.label || lbl(n.screen), href: n.screen, icon: leafIco(n), exactMatch: needsExact(n.screen) }) }
    else {
      const items: (NavLink | NavSubGroup)[] = []
      for (const c of n.children ?? []) {
        if (!nodeVis(c)) continue
        if (c.screen) { if (keep(c.screen)) items.push(link(c)) }
        else {
          const subs: NavLink[] = []
          const collectSub = (ns: NavTreeNode[]) => ns.forEach(g => { if (!nodeVis(g)) return; if (g.screen) { if (keep(g.screen)) subs.push(link(g)) } else collectSub(g.children ?? []) })
          collectSub(c.children ?? [])
          if (subs.length) items.push({ kind: 'subgroup', label: c.label ?? '', icon: iconByName(c.icon), items: subs })
        }
      }
      if (items.length) out.push({ type: 'group', label: n.label ?? '', icon: iconByName(n.icon), items })
    }
  }
  return out
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

// Preserva a rolagem do menu entre navegações (o sidebar remonta a cada rota).
const navScroll = { top: 0 }

function SidebarInner({ user, mobileOpen = false, onClose }: { user: User; mobileOpen?: boolean; onClose?: () => void }) {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [collapsedRaw, setCollapsed]  = useState(false)
  const [openGroups,  setOpenGroups]  = useState<string[]>([])
  const [query, setQuery]             = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  // Restaura a posição do scroll do menu ao montar (o sidebar remonta a cada rota).
  // Reaplica após o layout (rAF) porque no 1º paint o menu ainda não tem altura total,
  // e não salva enquanto restaura (senão gravaria 0). Evita o "menu pular pro topo".
  const navRef = useRef<HTMLElement>(null)
  const restoringRef = useRef(false)
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    restoringRef.current = true
    const apply = () => {
      nav.scrollTop = navScroll.top
      // Garante o item ATIVO visível dentro do menu (cobre falha de timing na restauração).
      // Ajusta só o scroll do próprio menu — nunca rola a página.
      const actives = nav.querySelectorAll('.sidebar-item-active')
      const active = actives[actives.length - 1] as HTMLElement | undefined
      if (active) {
        const nr = nav.getBoundingClientRect(), ar = active.getBoundingClientRect()
        if (ar.top < nr.top) nav.scrollTop -= (nr.top - ar.top) + 8
        else if (ar.bottom > nr.bottom) nav.scrollTop += (ar.bottom - nr.bottom) + 8
      }
    }
    apply()
    const raf1 = requestAnimationFrame(apply)
    const raf2 = requestAnimationFrame(() => { apply(); restoringRef.current = false })
    const onScroll = () => { if (!restoringRef.current) navScroll.top = nav.scrollTop }
    nav.addEventListener('scroll', onScroll, { passive: true })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); nav.removeEventListener('scroll', onScroll) }
  }, [])
  // Atalho Ctrl/Cmd+K foca a busca do menu de qualquer lugar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCollapsed(false)        // garante o input visível antes de focar
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // No mobile o menu é um drawer de largura cheia — nunca colapsado (ícones-só é coisa de desktop).
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const sync = () => setIsMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  const collapsed = collapsedRaw && !isMobile

  const isConsultor        = user?.type === 'consultor'
  const isCoordenador      = user?.type === 'coordenador'
  const isCliente          = user?.type === 'cliente'
  const isParceiroAdmin    = user?.type === 'parceiro_admin'
  const isParceiroGestor   = isParceiroAdmin && !!user?.is_executive
  const isAdministrativo   = user?.type === 'administrativo'

  // Badges de ação na navegação (tarefas atrasadas/pendentes + notificações não lidas) — sempre visíveis.
  const [badges, setBadges] = useState({ overdue_tasks: 0, pending_tasks: 0, unread_notifications: 0, unread_communications: 0, critical: false })
  useEffect(() => {
    if (isCliente) return
    const fetchBadges = () => cachedGet<{ data: typeof badges }>('/me/badges').then(r => { if (r.data) setBadges(r.data) }).catch(() => {}) // compartilha cache com o sino de notificações (dedup /me/badges)
    fetchBadges()
    const t = setInterval(fetchBadges, 30000)
    const onFocus = () => fetchBadges()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCliente])
  // permissions = lista resolvida pelo backend (base + extra + grupos); fallback para extra_permissions
  // Estabilizada com useMemo pra não causar re-render do visibleNav em cada ciclo
  const ep: string[] = useMemo(
    () => (user as any)?.permissions ?? user?.extra_permissions ?? [],
    [(user as any)?.permissions, user?.extra_permissions]
  )

  // Para clientes: carrega os códigos de tipo de contrato dos seus projetos
  // PRINCIPAIS (sem parent_project_id). Filhos herdam o item do menu via parent
  // — não deveriam expor entrada extra no menu.
  // Cacheado em sessionStorage pra evitar flicker do grupo "Contratos" ao trocar de rota.
  const cacheKey = isCliente && user?.customer_id ? `minutor:contract_codes:${user.customer_id}` : null
  const [clienteContractCodes, setClienteContractCodes] = useState<Set<string>>(() => {
    if (typeof window === 'undefined' || !cacheKey) return new Set()
    try {
      const raw = window.sessionStorage.getItem(cacheKey)
      if (raw) return new Set(JSON.parse(raw) as string[])
    } catch { /* ignore */ }
    return new Set()
  })
  useEffect(() => {
    if (!isCliente || !user?.customer_id) return
    api.get<any>(`/projects?customer_id=${user.customer_id}&pageSize=200`)
      .then(r => {
        const items: any[] = Array.isArray(r?.items) ? r.items : []
        const codes = new Set(
          items
            .filter(p => !p.parent_project_id)            // só projetos principais
            .map(p => p.contract_type?.code)
            .filter(Boolean) as string[]
        )
        setClienteContractCodes(codes)
        if (cacheKey) {
          try { window.sessionStorage.setItem(cacheKey, JSON.stringify(Array.from(codes))) } catch { /* ignore */ }
        }
      })
      .catch(() => {})
  }, [isCliente, user?.customer_id])

  const visibleNav = useMemo(() => {
    if (isCoordenador) {
      const has = (p: string) => ep.includes(p)
      const nav: NavEntry[] = [...NAV_COORDINATOR]

      // Permissão via grupo libera "Gestão de Projetos" pra coordenadores que NÃO
      // sejam do tipo "projetos" (esses entram via Demandas e Projetos abaixo).
      if (user?.coordinator_type !== 'projetos' && (ep.includes('gestao_projetos.view') || ep.includes('gestao_projetos.update'))) {
        nav.splice(1, 0, { type: 'item', label: 'Gestão de Contratos', href: '/gestao-projetos', icon: Layers })
      }

      // Meu Painel — primeiro item para TODOS os coordenadores
      nav.unshift({ type: 'item', label: 'Meu Painel', href: '/meu-painel', icon: LayoutDashboard })

      // Investimento Interno — disponível para TODOS os coordenadores (apontamentos,
      // aprovação e gestão dos investimentos internos / leads da ERPSERV).
      nav.push({ type: 'item', label: 'Investimento Interno', href: '/investimento-comercial', icon: TrendingUp })

      // Demandas e Projetos — posição 2 para coordenador de projetos
      // ("Gestão de Projetos" foi removida — governança ficou no painel/Demandas)
      if (user?.coordinator_type === 'projetos') {
        nav.splice(1, 0, { type: 'item', label: 'Demandas e Projetos', href: '/contratos/pipeline', icon: LayoutGrid })
      }

      // Portal de Sustentação — somente para coordenadores do tipo "sustentacao"
      if (user?.coordinator_type === 'sustentacao') {
        nav.splice(1, 0, {
          type: 'group',
          label: 'Sustentação',
          icon: Headphones,
          items: [
            { label: 'Portal', href: '/sustentacao', icon: Headphones, exactMatch: true },
          ],
        })
      }


      // Projetos e Usuários — opcionais via extra_permissions
      const hasProjectsAction = ['projects.create','projects.update','projects.delete','projects.view_financial'].some(p => ep.includes(p))
      const hasAnyUserPerm = ['users.view_all','users.create','users.update','users.reset_password'].some(p => ep.includes(p))

      // Cadastros — monta apenas os subitens concedidos.
      // Pra clientes: além de 'customers.manage' (pacote completo), permissões
      // granulares (create/update/delete) também liberam o menu — concedidas
      // via PermissionGroup ou extra_permissions.
      // Clientes: qualquer permissão de customers libera o item (view sozinho basta).
      // Contatos de Clientes: mais restritivo — exige nível de edição/gerência.
      const hasCustomersView = ['customers.view', 'customers.create', 'customers.update', 'customers.delete', 'customers.manage'].some(p => ep.includes(p))
      const hasCustomersEdit = ['customers.create', 'customers.update', 'customers.delete', 'customers.manage'].some(p => ep.includes(p))
      const cadastrosItems: { label: string; href: string; icon: typeof Users }[] = []
      if (has('contracts.manage'))          cadastrosItems.push({ label: 'Tipos de Contrato',     href: '/cadastros?tab=contracts',          icon: FileType })
      if (has('services.manage'))           cadastrosItems.push({ label: 'Tipos de Serviço',      href: '/cadastros?tab=services',           icon: Wrench })
      // Menu guiado por permissão: se o perfil/grupo concede a permissão, o item aparece
      // (sem exclusões por tipo — coord. de projetos também segue a permissão concedida).
      if (hasCustomersView) cadastrosItems.push({ label: 'Clientes',              href: '/clientes',                         icon: Users })
      if (hasCustomersEdit) cadastrosItems.push({ label: 'Contatos de Clientes',  href: '/cadastros?tab=customer_contacts',   icon: Contact })
      if (has('executives.manage'))         cadastrosItems.push({ label: 'Executivos',            href: '/cadastros?tab=executives',         icon: Star })
      if (has('groups.manage'))             cadastrosItems.push({ label: 'Grupos de Consultor',   href: '/cadastros?tab=groups',             icon: UserCheck })
      if (has('holidays.manage'))           cadastrosItems.push({ label: 'Feriados',              href: '/cadastros?tab=holidays',           icon: CalendarDays })
      if (has('expense_categories.manage')) cadastrosItems.push({ label: 'Categorias de Despesa', href: '/cadastros?tab=expense_categories', icon: Tag })
      if (has('expense_types.manage'))      cadastrosItems.push({ label: 'Tipos de Despesa',      href: '/cadastros?tab=expense_types',      icon: Receipt })
      if (has('payment_methods.manage'))    cadastrosItems.push({ label: 'Formas de Pagamento',   href: '/cadastros?tab=payment_methods',    icon: CreditCard })
      if (has('partners.manage'))   cadastrosItems.push({ label: 'Parceiros',           href: '/partners',                 icon: Handshake })
      // 'Projetos' foi removido — inclusão agora é feita via Kanban (pipeline)
      if (cadastrosItems.length > 0) nav.push({ type: 'group', label: 'Cadastros', icon: Database, items: cadastrosItems.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')) })

      // Usuários — qualquer coordenador com permissão de usuários (reset de senha):
      // coord. de projetos (recebe users.view_all/reset_password pelo PermissionService)
      // ou coord. com reset_password via Grupo. /users vive no módulo Administrativo,
      // mas o perfil coordenador só tem o módulo Serviços — como gerir senha da equipe
      // é transversal, exibimos SEMPRE (alwaysVisible), independente do módulo. A tela
      // /users gateia as ações (modo "só redefinir senha") pra esses perfis.
      if (hasAnyUserPerm) nav.push({ type: 'item', label: 'Usuários', href: '/users', icon: Users, alwaysVisible: true })

      // 🎫 Help Desk — coordenador entra pela Central de Operações (torre de controle).
      // Só p/ quem atende (agente = vinculado a alguma equipe); admin sempre.
      if (has('help_desk.tickets.view') && isHelpDeskAgent(user))
        nav.push({
          type: 'group', label: 'Help Desk', icon: Headphones,
          items: [
            { label: 'Central de Operações', href: '/help-desk/operacoes', icon: Radar },
            { label: 'Chamados', href: '/help-desk/tickets', icon: Ticket },
            { label: 'Fila (Kanban)', href: '/help-desk/fila', icon: LayoutGrid },
            { label: 'Base de Conhecimento', href: '/help-desk/kb', icon: FileText },
          ],
        })

      // Configurações
      if (has('settings.view')) nav.push({ type: 'item', label: 'Configurações', href: '/settings', icon: Settings })

      return nav
    }
    if (isAdministrativo) {
      const nav: NavEntry[] = [
        { type: 'item', label: 'Meu Dia', href: '/inicio', icon: Home },
        {
          type: 'group',
          label: 'Apontamentos & Despesas',
          icon: Clock,
          items: [
            { label: 'Apontamentos', href: '/timesheets', icon: Clock },
            { label: 'Despesas',     href: '/expenses',   icon: Receipt },
          ],
        },
        { type: 'item', label: 'Kanban Contratos', href: '/contratos/kanban', icon: LayoutGrid, matchPaths: ['/contratos'] },
        {
          type: 'group', label: 'Fechamento', icon: DollarSign,
          items: [
            { label: 'Geral',              href: '/fechamento',           icon: BarChart2 },
            { label: 'Clientes',           href: '/fechamento/cliente',   icon: Building2 },
            { label: 'Parceiros',          href: '/fechamento/parceiro',  icon: Handshake },
            { label: 'Consultores',        href: '/fechamento/consultor', icon: Users },
            { label: 'Horas Excedentes',   href: '/fechamento/excedentes', icon: Clock },
            { label: 'Adiantamentos',      href: '/fechamento/adiantamentos', icon: Banknote },
            { label: 'Diretoria',          href: '/fechamento/diretoria', icon: Briefcase },
            { label: 'Folha Cooperativa',  href: '/fechamento/folha',     icon: FileSpreadsheet },
            { label: 'Contratos',          href: '/fechamento/contratos', icon: FileText  },
            { label: 'Reajuste de Contrato', href: '/fechamento/reajustes', icon: TrendingUp },
            { label: 'Pagamento Despesas', href: '/pagamento-despesas',   icon: DollarSign },
          ],
        },
        {
          type: 'group', label: 'Cadastros', icon: Database,
          items: [
            { label: 'Clientes',     href: '/clientes',    icon: Building2 },
          ],
        },
        { type: 'item', label: 'Usuários',     href: '/users',    icon: Users },
      ]
      // Gestão de Projetos — libera via permissão de grupo (mesmo padrão de outros perfis)
      if (ep.includes('gestao_projetos.view') || ep.includes('gestao_projetos.update')) {
        nav.splice(3, 0, { type: 'item', label: 'Gestão de Contratos', href: '/gestao-projetos', icon: Layers })
      }
      return nav
    }
    if (isCliente) {
      // Filtra dashboards pelos tipos de contrato que o cliente realmente possui
      const DASH_MAP: Record<string, { label: string; href: string; icon: typeof BarChart2 }> = {
        'fixed_hours':   { label: 'Banco de Horas Fixo',    href: '/dashboards/bank-hours-fixed',   icon: BarChart2 },
        'monthly_hours': { label: 'Banco de Horas Mensais', href: '/dashboards/bank-hours-monthly', icon: CalendarClock },
        'on_demand':     { label: 'On Demand',              href: '/dashboards/on-demand',           icon: Zap },
        'closed':        { label: 'Fechado',                href: '/dashboards/fechado',             icon: CheckSquare },
      }
      const dashItems = Object.entries(DASH_MAP)
        .filter(([code]) => clienteContractCodes.has(code))
        .map(([, item]) => item)
      // Acesso por módulo POR USUÁRIO: null/ausente = todos (legado); senão só o que foi liberado.
      const allowed = user?.allowed_modules ?? null
      const canModule = (m: string) => !allowed || allowed.includes(m)
      // Home e Comunicados são sempre visíveis (não pertencem a Projetos nem Help Desk).
      const nav: NavEntry[] = [
        { type: 'item', label: 'Comunicados',          href: '/comunicados',         icon: Megaphone, badge: 'comunicados' },
        { type: 'item', label: 'Home',                 href: '/portal-cliente',      icon: Building2 },
      ]
      if (canModule('projetos')) {
        nav.push({ type: 'item', label: 'Demandas e Projetos', href: '/contratos/pipeline',  icon: LayoutGrid })
      }
      if (canModule('help_desk')) {
        nav.push({ type: 'item', label: 'Central de Atendimento', href: '/help-desk/portal', icon: Headphones })
      }
      // Dashboards de contrato e Indicadores pertencem ao módulo Projetos.
      if (canModule('projetos') && dashItems.length > 0) {
        nav.push({ type: 'group', label: 'Contratos', icon: FileText, items: dashItems })
      }
      // Indicadores da própria empresa (atualmente só Auster)
      if (canModule('projetos') && user?.customer_id === 220) {
        nav.push({ type: 'item', label: 'Indicadores', href: '/indicadores/auster', icon: BarChart2 })
      }
      return nav
    }
    if (isConsultor) {
      const baseNav: NavEntry[] = [
        { type: 'item', label: 'Meu Dia', href: '/inicio', icon: Home },
        { type: 'item', label: 'Meu Painel', href: '/meu-painel', icon: LayoutDashboard },
        // Acesso do consultor aos projetos onde está alocado — abre o cronograma
        // para apontar horas na atividade (escopo: executar/apontar).
        { type: 'item', label: 'Projetos', href: '/meus-projetos', icon: FolderOpen },
        ...(IS_DEV1 ? [{ type: 'item' as const, label: 'Meus Cards', href: '/meus-cards', icon: Inbox }] : []),
      ]

      // Consultor NUNCA vê Gestão de Projetos nem Usuários, mesmo com extra_permissions.
      // Essas rotinas pertencem a coordenação/administração — escopo do consultor é executar
      // atividade, apontar horas, validar apontamentos quando autorizado.

      if (ep.includes('timesheets.approve') || ep.includes('hours.view_all'))
        baseNav.push({ type: 'item', label: 'Apontamentos', href: '/timesheets', icon: Clock })
      if (ep.includes('approvals.view') || ep.includes('approvals.manage'))
        baseNav.push({ type: 'item', label: 'Aprovações', href: '/approvals', icon: CheckSquare })
      if (ep.includes('settings.view'))
        baseNav.push({ type: 'item', label: 'Configurações', href: '/settings', icon: Settings })

      // 🎫 Help Desk — experiência OPERACIONAL (sem Configurações, que é gestão).
      // Mesma experiência de atendimento dos demais perfis internos.
      // Só p/ quem atende (agente = vinculado a alguma equipe); admin sempre.
      if (ep.includes('help_desk.tickets.view') && isHelpDeskAgent(user))
        baseNav.push({
          type: 'group', label: 'Help Desk', icon: Headphones,
          items: [
            { label: 'Chamados', href: '/help-desk/tickets', icon: Ticket },
            { label: 'Fila (Kanban)', href: '/help-desk/fila', icon: LayoutGrid },
            { label: 'Base de Conhecimento', href: '/help-desk/kb', icon: FileText },
          ],
        })

      return baseNav
    }
    if (isParceiroAdmin) {
      if (isParceiroGestor) {
        return [
          { type: 'item', label: 'Painel do Parceiro', href: '/partner-dashboard', icon: Handshake },
        ] as NavEntry[]
      }
      // Parceiro simples: apenas Meu Painel — apontamentos e despesas já são abas
      // internas do próprio dashboard (Total Geral / Apontamentos / Despesas / Indicadores).
      return [
        { type: 'item', label: 'Meu Painel', href: '/meu-painel', icon: LayoutDashboard },
      ] as NavEntry[]
    }
    return NAV
  }, [isCoordenador, isConsultor, isCliente, isParceiroAdmin, isParceiroGestor, isAdministrativo, clienteContractCodes, ep])

  // ── Módulos de navegação (Serviços / Administrativo) — estado compartilhado (header + sidebar).
  // Cliente não tem módulos → vê o portal inteiro como hoje (sem filtro).
  const { selectedModule, modules: navModules, itemConfig } = useModules()
  // Menu do módulo selecionado vem da ÁRVORE do Configurador — ela é a fonte de verdade.
  // O guard antigo (`allowedModules.length <= 1`) era resquício dos módulos Serviços/
  // Administrativo: com o modelo atual (um módulo POR PERFIL) todo perfil interno tem
  // exatamente 1 módulo, então o guard desligava a árvore justamente pra consultor/parceiro
  // — a aba deles no Configurador era editável mas não surtia efeito nenhum.
  // CLIENTE continua no NAV hardcoded: o menu dele é calculado por cliente (dashboards por
  // clienteContractCodes, Indicadores só p/ customer_id 220) e a árvore não expressa isso.
  // Fallbacks preservados: sem módulo resolvido ou árvore vazia → NAV hardcoded.
  // Itens "home" (Meu Dia/Meu Painel) são prefixados, sem duplicar telas já na árvore.
  const moduleNav = useMemo(() => {
    if (isCliente || !selectedModule) return visibleNav
    const eff = effectiveProfiles(user)
    const built = buildModuleNav(selectedModule, navModules, itemConfig, user)
    if (built.length === 0) return visibleNav
    const builtHrefs = new Set<string>()
    built.forEach(e => { if (e.type === 'item') builtHrefs.add(e.href); else e.items.forEach(it => ('href' in it) ? builtHrefs.add(it.href) : it.items.forEach(s => builtHrefs.add(s.href))) })
    // home (Meu Dia/Meu Painel…): itens do topo do NAV, sem duplicar a árvore e respeitando o módulo
    const keepHome = (e: NavItem) => {
      if (e.alwaysVisible) return true
      const c = itemConfig[e.href]
      if (c) { if (!c.active) return false; return (eff.some(p => c.profiles.includes(p)) || c.users.includes(user?.id ?? 0)) && c.modules.includes(selectedModule) }
      const m = moduleForHref(e.href)
      return m === null || m === selectedModule
    }
    const home: NavEntry[] = []
    for (const e of visibleNav) { if (e.type !== 'item') break; if (!builtHrefs.has(e.href) && keepHome(e)) home.push(e) }
    return [...home, ...built]
  }, [visibleNav, selectedModule, navModules, itemConfig, user?.type, user?.coordinator_type, user?.consultant_type, user?.is_executive, user?.id, isCliente, isConsultor, isParceiroAdmin, isCoordenador, isAdministrativo])

  // Auto-abre o grupo (e o sub-grupo aninhado, se houver) que contém a rota atual,
  // sem fechar os já abertos manualmente.
  useEffect(() => {
    const auto: string[] = []
    const matchHref = (href: string) => {
      const base = href.split('?')[0]
      return pathname === base || pathname.startsWith(base + '/')
    }
    for (const entry of moduleNav) {
      if (entry.type !== 'group') continue
      for (const i of entry.items) {
        if ('href' in i) {
          if (matchHref(i.href)) { auto.push(entry.label); break }
        } else {
          // sub-grupo: abre o pai e o sub-grupo se algum leaf casar
          if (i.items.some(leaf => matchHref(leaf.href))) {
            auto.push(entry.label)
            auto.push(`${entry.label}/${i.label}`)
            break
          }
        }
      }
    }
    if (auto.length === 0) return
    setOpenGroups(prev => {
      const merged = new Set([...prev, ...auto])
      return merged.size === prev.length ? prev : Array.from(merged)
    })
  }, [pathname, moduleNav])

  // First two letters of name for avatar
  const initials = user?.name
    ? user.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'
  const avatarUrl = secureUrl(user?.profile_photo_url)

  const toggleGroup = (label: string) =>
    setOpenGroups(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label])

  const isActive = (href: string, matchPaths?: string[], exactMatch?: boolean) => {
    const [hrefPath, hrefQuery] = href.split('?')
    const pathMatch = (p: string) => exactMatch ? pathname === p : (pathname === p || pathname.startsWith(p + '/'))
    if (matchPaths?.some(p => pathname === p || pathname.startsWith(p + '/'))) return true
    if (!hrefQuery) return pathMatch(hrefPath)
    // com query param: pathname deve bater E o tab deve bater
    if (pathname !== hrefPath) return false
    const params = new URLSearchParams(hrefQuery)
    for (const [k, v] of params.entries()) {
      if (searchParams.get(k) !== v) return false
    }
    return true
  }
  const isNavLink = (x: NavLink | NavSubGroup): x is NavLink => (x as any).href !== undefined
  const subGroupActive = (sg: NavSubGroup) => sg.items.some(i => isActive(i.href, undefined, i.exactMatch))
  const groupActive = (g: NavGroup) => g.items.some(i =>
    isNavLink(i) ? isActive(i.href, undefined, i.exactMatch) : subGroupActive(i)
  )

  // ── Busca no menu ──
  // Filtra (sobre a nav já filtrada por módulo) por label, sem acento/caixa. Grupo
  // que casa no próprio nome é mantido inteiro; senão, mantém só os filhos que casam.
  const q = normalizeForSearch(query.trim())
  const isSearching = q.length > 0
  const filteredNav = useMemo(() => {
    if (!q) return moduleNav
    const match = (label: string) => normalizeForSearch(label).includes(q)
    const out: NavEntry[] = []
    for (const entry of moduleNav) {
      if (entry.type === 'item') {
        if (match(entry.label)) out.push(entry)
        continue
      }
      if (match(entry.label)) { out.push(entry); continue }
      const items = entry.items.flatMap((it): (NavLink | NavSubGroup)[] => {
        if (isNavLink(it)) return match(it.label) ? [it] : []
        if (match(it.label)) return [it]
        const leaves = it.items.filter(l => match(l.label))
        return leaves.length ? [{ ...it, items: leaves }] : []
      })
      if (items.length) out.push({ ...entry, items })
    }
    return out
  }, [moduleNav, q])

  // No colapsado não há input visível — mantém a lista completa (só ícones).
  const navToRender = collapsed ? moduleNav : filteredNav

  return (
    <>
      {/* Backdrop do drawer (só mobile, quando aberto) */}
      <div
        onClick={onClose}
        className={cn('fixed inset-0 z-40 bg-black/50 lg:hidden transition-opacity duration-200',
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none')}
        aria-hidden
      />
    {/* Container que CLIPA o drawer off-screen no mobile — é `fixed` (fora da
        cadeia de altura do conteúdo, então não quebra `h-full`/h:100% no iOS).
        No desktop vira `contents` e some, deixando o <aside> fluir normalmente. */}
    <div className="fixed inset-0 z-50 overflow-x-hidden pointer-events-none lg:static lg:inset-auto lg:z-auto lg:overflow-visible lg:pointer-events-auto lg:contents">
    <aside
      className={cn(
        'flex flex-col border-r transition-transform duration-200',
        // Mobile: drawer off-canvas (absolute dentro do container fixo → clipado)
        'absolute inset-y-0 left-0 w-[248px] pointer-events-auto',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop (>=lg): estático no fluxo, altura cheia, colapso opcional
        'lg:static lg:h-screen lg:shrink-0 lg:translate-x-0 lg:transition-all',
        collapsedRaw ? 'lg:w-[60px]' : 'lg:w-[248px]',
      )}
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {/* Fechar (só mobile) */}
      <button
        onClick={onClose}
        aria-label="Fechar menu"
        className="lg:hidden absolute top-3 right-3 z-10 p-1.5 rounded-md transition-colors hover:bg-[var(--surface-hover)]"
        style={{ color: 'var(--text-muted)' }}
      >
        <ChevronLeft size={16} />
      </button>
      {/* ── Logo + módulo atual ── */}
      <div
        className="flex flex-col justify-center h-18 px-5 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        {(() => {
          const mod = navModules.find(m => m.key === selectedModule)
          // Minimizado: logo do Minutor + inicial do módulo. Expandido: logo + "Minutor",
          // e o nome do módulo ABAIXO (alinhado sob "Minutor"), sem deslocar o nome Minutor.
          if (collapsed) {
            return (
              <div className="flex flex-col items-center gap-1 mx-auto">
                <MinutorIcon size={30} />
                {mod && <span className="text-[10px] font-bold leading-none" title={mod.label} style={{ color: 'var(--primary)' }}>{mod.label.slice(0, 3)}</span>}
              </div>
            )
          }
          return (
            <>
              <div className="flex items-center gap-3">
                <MinutorIcon size={34} />
                <span className="font-bold text-[20px] tracking-tight" style={{ color: 'var(--text)' }}>Minutor</span>
              </div>
              {mod && <span className="text-[15px] font-semibold truncate mt-0.5 pl-[46px]" style={{ color: 'var(--primary)' }}>{mod.label}</span>}
            </>
          )
        })()}
      </div>

      {/* Troca de módulo agora é só pelo launcher ⊞ no header (AppsMenu). */}

      {/* ── Card do usuário (foto + nome + cargo) — todos os perfis internos (a foto "aparece no menu") ── */}
      {user && user.type !== 'cliente' && (
        <div
          className="flex items-center gap-2.5 px-3.5 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          {!collapsed && (
            <>
              <div
                className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
              >
                {avatarUrl ? <AuthedImg src={avatarUrl} alt="" className="w-full h-full object-cover" fallback={initials} /> : initials}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate leading-tight" style={{ color: 'var(--text)' }}>{user.name}</p>
                <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-light)' }}>
                  {user.type === 'admin' ? 'Administrador'
                    : user.type === 'coordenador' ? 'Coordenador'
                    : user.type === 'administrativo' ? 'Administrativo'
                    : isParceiroGestor ? 'Parceiro Gestor'
                    : isParceiroAdmin ? 'Parceiro'
                    : 'Consultor'}
                </p>
              </div>
            </>
          )}
          {collapsed && (
            <div
              className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-[10px] font-bold mx-auto"
              style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
            >
              {avatarUrl ? <AuthedImg src={avatarUrl} alt="" className="w-full h-full object-cover" fallback={initials} /> : initials}
            </div>
          )}
        </div>
      )}

      {/* ── Busca no menu ── */}
      {!collapsed && (
        <div className="px-3 pt-3 shrink-0">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur() } }}
              placeholder="Buscar no menu…"
              aria-label="Buscar no menu"
              className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none border"
              style={{ background: 'var(--surface-hover)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
          </div>
        </div>
      )}

      {/* ── Nav ── */}
      <nav ref={navRef} className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
        {!collapsed && isSearching && navToRender.length === 0 && (
          <p className="px-3 py-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            Nenhum item encontrado
          </p>
        )}
        {navToRender.map(entry => {
          // ── Plain item ──
          if (entry.type === 'item') {
            const active = isActive(entry.href, entry.matchPaths, entry.exactMatch)
            const Icon   = entry.icon
            // Badge de ação: vermelho (tarefas atrasadas/pendentes), amarelo (notificações não lidas).
            const badgeCount = entry.badge === 'tasks' ? (badges.overdue_tasks || badges.pending_tasks)
              : entry.badge === 'notifications' ? badges.unread_notifications
              : entry.badge === 'comunicados' ? badges.unread_communications : 0
            const badgeColor = entry.badge === 'tasks' ? 'var(--danger-border)'
              : entry.badge === 'comunicados' ? 'var(--primary)' : 'var(--warning-border)'
            const isCriticalDay = entry.badge === 'critical' && badges.critical
            const item = (
              <Link
                key={entry.href}
                href={entry.href}
                className={cn(base, itemClass(active))}
                style={isCriticalDay && !active ? { boxShadow: 'inset 3px 0 0 var(--danger-border)' } : undefined}
              >
                <span className="relative shrink-0">
                  <Icon size={17} className="shrink-0" />
                  {(collapsed && (badgeCount > 0 || isCriticalDay)) && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ background: badgeCount > 0 ? badgeColor : 'var(--danger-border)' }} />
                  )}
                </span>
                {!collapsed && <span className="font-medium">{entry.label}</span>}
                {!collapsed && badgeCount > 0 && (
                  <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none" style={{ background: badgeColor, color: '#fff', minWidth: 18, textAlign: 'center' }}>{badgeCount > 99 ? '99+' : badgeCount}</span>
                )}
                {!collapsed && isCriticalDay && badgeCount === 0 && (
                  <span className="ml-auto w-2 h-2 rounded-full" style={{ background: 'var(--danger-border)' }} title="Tarefas críticas" />
                )}
              </Link>
            )
            if (collapsed) {
              return (
                <Tooltip key={entry.href}>
                  <TooltipTrigger render={item} />
                  <TooltipContent side="right">{entry.label}</TooltipContent>
                </Tooltip>
              )
            }
            return item
          }

          // ── Group ──
          const group = entry as NavGroup
          const GroupIcon = group.icon
          const active = groupActive(group)
          const open   = openGroups.includes(group.label) || isSearching

          // Lista plana de links (descendo recursivamente em subgrupos) — usada no modo collapsed.
          const flatLinks = (entries: (NavLink | NavSubGroup)[]): NavLink[] =>
            entries.flatMap(e => isNavLink(e) ? [e] : e.items)

          if (collapsed) {
            return (
              <div key={group.label} className="space-y-0.5">
                {flatLinks(group.items).map(sub => {
                  const SubIcon = sub.icon
                  const subActive = isActive(sub.href, undefined, sub.exactMatch)
                  const subItem = (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      className={cn(base, itemClass(subActive))}
                    >
                      <SubIcon size={17} className="shrink-0" />
                    </Link>
                  )
                  return (
                    <Tooltip key={sub.href}>
                      <TooltipTrigger render={subItem} />
                      <TooltipContent side="right">{sub.label}</TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            )
          }

          return (
            <div key={group.label}>
              <button
                onClick={() => toggleGroup(group.label)}
                className={cn('w-full', base)}
                style={active ? { color: 'var(--text)' } : undefined}
              >
                <GroupIcon size={17} className="shrink-0" />
                <span className="flex-1 text-left font-medium">{group.label}</span>
                <ChevronDown
                  size={12}
                  className={cn('transition-transform duration-200', open && 'rotate-180')}
                />
              </button>
              {open && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l pl-2" style={{ borderColor: 'var(--border)' }}>
                  {group.items.map(sub => {
                    // Sub-grupo aninhado
                    if (!isNavLink(sub)) {
                      const subgroupKey = `${group.label}/${sub.label}`
                      const SubGroupIcon = sub.icon
                      const sgOpen = openGroups.includes(subgroupKey) || isSearching
                      const sgActive = subGroupActive(sub)
                      return (
                        <div key={sub.label}>
                          <button
                            onClick={() => toggleGroup(subgroupKey)}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium sidebar-item"
                            style={sgActive ? { color: 'var(--text)' } : undefined}
                          >
                            <SubGroupIcon size={14} className="shrink-0" />
                            <span className="flex-1 text-left">{sub.label}</span>
                            <ChevronDown size={11} className={cn('transition-transform duration-200', sgOpen && 'rotate-180')} />
                          </button>
                          {sgOpen && (
                            <div className="ml-3 mt-0.5 space-y-0.5 border-l pl-2" style={{ borderColor: 'var(--border)' }}>
                              {sub.items.map(leaf => {
                                const LeafIcon = leaf.icon
                                const leafActive = isActive(leaf.href, undefined, leaf.exactMatch)
                                return (
                                  <Link
                                    key={leaf.href}
                                    href={leaf.href}
                                    className={cn(
                                      'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium sidebar-item',
                                      leafActive && 'sidebar-item-active'
                                    )}
                                  >
                                    <LeafIcon size={13} className="shrink-0" />
                                    <span>{leaf.label}</span>
                                  </Link>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    }
                    // Link folha tradicional
                    const SubIcon = sub.icon
                    const subActive = isActive(sub.href, undefined, sub.exactMatch)
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={cn(
                          'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium sidebar-item',
                          subActive && 'sidebar-item-active'
                        )}
                      >
                        <SubIcon size={14} className="shrink-0" />
                        <span>{sub.label}</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* ── Company logo ── */}
      {!collapsed && (
        <div className="flex items-center justify-center px-5 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <Image
            src="/logo.png"
            alt="ERPServ"
            width={90}
            height={36}
            className="object-contain sidebar-erpserv-logo"
          />
        </div>
      )}

      {/* ── Collapse toggle (só desktop >=lg) ── */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="hidden lg:flex items-center justify-center h-10 border-t transition-colors"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
    </div>
    </>
  )
}

export function Sidebar({ user, mobileOpen, onClose }: { user: User; mobileOpen?: boolean; onClose?: () => void }) {
  return (
    <Suspense>
      <SidebarInner user={user} mobileOpen={mobileOpen} onClose={onClose} />
    </Suspense>
  )
}
