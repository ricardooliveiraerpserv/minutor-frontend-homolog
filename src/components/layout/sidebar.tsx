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
  ListFilter,
  CalendarX,
  XCircle,
  GitBranch,
  HeartPulse,
  Wallet,
  ListChecks,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useState, useMemo, useEffect, useRef, Suspense } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { LucideIcon } from 'lucide-react'
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
  module?: ModuleId
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
  ['/cadastros', 'administrativo'],
  ['/configuracoes', 'administrativo'],
  ['/users', 'administrativo'],
  // /settings NÃO mapeado de propósito: "Configurações" é pessoal — sempre visível
  // (no NAV admin ela vive no grupo "Sistema" do Administrativo via module explícito;
  // perfis restritos como consultor mantêm o item sem perder acesso).
  ['/portal-cliente', 'administrativo'],
  ['/dashboards', 'administrativo'],
  ['/partner-dashboard', 'administrativo'],
  // 🤝 CRM
  ['/crm', 'crm'],
].sort((a, b) => b[0].length - a[0].length) as [string, ModuleId][]

function moduleForHref(href: string): ModuleId | null {
  const base = href.split('?')[0]
  for (const [prefix, mod] of ROUTE_MODULE) {
    if (base === prefix || base.startsWith(prefix + '/')) return mod
  }
  return null
}

// Filtra a árvore de navegação pelo módulo selecionado. Mantém itens "home" (sem módulo).
function filterNavByModule(nav: NavEntry[], mod: ModuleId): NavEntry[] {
  const keepItem = (href: string) => { const m = moduleForHref(href); return m === null || m === mod }
  const out: NavEntry[] = []
  for (const entry of nav) {
    if (entry.type === 'item') {
      if (entry.alwaysVisible) { out.push(entry); continue }
      const m = entry.module ?? moduleForHref(entry.href)
      if (m === null || m === mod) out.push(entry)
      continue
    }
    // grupo com módulo explícito (NAV admin reestruturado)
    if (entry.module) { if (entry.module === mod) out.push(entry); continue }
    // grupo sem módulo (menus por-perfil): filtra os itens por rota
    const items = entry.items
      .map(it => ('href' in it)
        ? it
        : { ...it, items: it.items.filter(s => keepItem(s.href)) })
      .filter(it => ('href' in it) ? keepItem(it.href) : it.items.length > 0)
    if (items.length > 0) out.push({ ...entry, items })
  }
  return out
}

// Meus Cards e Capacidade ainda em desenvolvimento — só DEV1
const IS_DEV1 = process.env.NEXT_PUBLIC_APP_ENV === 'dev'

const NAV_COORDINATOR: NavEntry[] = [
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
  { type: 'item', label: 'Meu Painel',            href: '/meu-painel',      icon: LayoutDashboard },
  { type: 'item', label: 'Início',                href: '/dashboard',       icon: Home },
  ...(IS_DEV1 ? [
    { type: 'item' as const, label: 'Meus Cards', href: '/meus-cards', icon: Inbox },
    { type: 'item' as const, label: 'Capacidade', href: '/capacidade', icon: Users },
  ] : []),

  // ── 🛠 SERVIÇOS ──
  {
    type: 'group', module: 'servicos', label: 'Projetos', icon: FolderOpen,
    items: [
      { label: 'Demandas e Projetos',  href: '/contratos/pipeline',     icon: Layers },
      { label: 'Central de Acompanhamentos', href: '/acompanhamentos', icon: ListChecks },
      { label: 'Investimento Interno', href: '/investimento-comercial', icon: TrendingUp },
    ],
  },
  {
    type: 'group', module: 'servicos', label: 'Sustentação', icon: Headphones,
    items: [
      { label: 'Portal', href: '/sustentacao', icon: Headphones, exactMatch: true },
    ],
  },
  {
    type: 'group', module: 'servicos', label: 'Operação', icon: Clock,
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
    type: 'group', module: 'administrativo', label: 'Gestão Contratual', icon: Layers,
    items: [
      { label: 'Gestão de Contratos', href: '/gestao-projetos',  icon: Layers },
      { label: 'Kanban Contratos',    href: '/contratos/kanban', icon: LayoutGrid },
    ],
  },
  {
    type: 'group', module: 'administrativo', label: 'Financeiro', icon: DollarSign,
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
          { label: 'Pagamento Despesas',  href: '/pagamento-despesas',      icon: DollarSign },
        ],
      },
      { label: 'Pagamentos',    href: '/relatorios/pagamentos',    icon: DollarSign },
      { label: 'Rent. Consultor × Projeto', href: '/relatorios/rentabilidade/consultor', icon: Users },
      { label: 'Rent. por Projeto',         href: '/relatorios/rentabilidade/projeto',   icon: FolderOpen },
      { label: 'Rent. Clientes',            href: '/relatorios/rentabilidade',           icon: TrendingUp, exactMatch: true },
      { label: 'Contratos s/ Vencimento', href: '/relatorios/contratos-sem-vencimento', icon: CalendarX },
    ],
  },
  {
    type: 'group', module: 'administrativo', label: 'Cadastros', icon: Database,
    items: [
      { label: 'Clientes',              href: '/clientes',                         icon: Users },
      { label: 'Executivos',            href: '/cadastros?tab=executives',        icon: Star },
      { label: 'Parceiros',             href: '/partners',                        icon: Handshake },
      { label: 'Formas de Pagamento',   href: '/cadastros?tab=payment_methods',   icon: CreditCard },
      { label: 'Feriados',              href: '/cadastros?tab=holidays',          icon: CalendarDays },
      { label: 'Categorias de Follow Up', href: '/cadastros?tab=followup_categories', icon: ListChecks },
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
    type: 'group', module: 'administrativo', label: 'Comunicação', icon: Mail,
    items: [
      { label: 'Modelos de E-mail',   href: '/cadastros?tab=email_templates', icon: Mail },
      { label: 'Workflows de E-mail', href: '/cadastros/workflows',           icon: Mail },
    ],
  },
  {
    type: 'group', module: 'administrativo', label: 'Visão Externa', icon: BarChart2,
    items: [
      {
        kind: 'subgroup', label: 'Cliente', icon: Building2,
        items: [
          { label: 'Home do Cliente',        href: '/portal-cliente',                icon: Building2 },
          { label: 'Acompanhamentos',        href: '/portal-cliente/acompanhamentos', icon: ListChecks },
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
    type: 'group', module: 'administrativo', label: 'Sistema', icon: Settings,
    items: [
      { label: 'Usuários',          href: '/users',           icon: Users },
      { label: 'Configurações',     href: '/settings',        icon: Settings },
      { label: 'Cadastro de Perfil', href: '/settings?tab=perfis', icon: UserCheck },
    ],
  },

  // ── 🤝 CRM (Fase 1; cresce a cada sub-fase) ──
  {
    type: 'group', module: 'crm', label: 'Comercial', icon: Handshake,
    items: [
      { label: 'Pipeline',     href: '/crm/pipeline',     icon: LayoutGrid },
      { label: 'Oportunidades', href: '/crm/oportunidades', icon: ListFilter },
      { label: 'Leads',        href: '/crm/leads',        icon: UserPlus },
      { label: 'Saúde da Conta', href: '/crm/saude',      icon: HeartPulse },
      { label: 'Minha Carteira', href: '/crm/minha-carteira', icon: Wallet },
      { label: 'Dashboards',   href: '/crm/dashboards',   icon: BarChart2 },
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
      { label: 'Responsáveis',        href: '/crm/responsaveis', icon: UserCheck },
      { label: 'Dados da Contratada', href: '/crm/configuracoes/contratada', icon: Building2 },
    ],
  },
  // 🧪 Features experimentais — só em DEV1 (sempre visíveis; env-gated)
  ...(process.env.NEXT_PUBLIC_APP_ENV === 'dev' ? [
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

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function SidebarInner({ user, mobileOpen = false, onClose }: { user: User; mobileOpen?: boolean; onClose?: () => void }) {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [collapsedRaw, setCollapsed]  = useState(false)
  const [openGroups,  setOpenGroups]  = useState<string[]>([])
  const [query, setQuery]             = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
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
      // Coordenador de projetos: nunca vê cadastro de Clientes/Contatos de Clientes
      // (governança de clientes fica fora do escopo dele).
      const isCoordProjetos = user?.coordinator_type === 'projetos'
      const cadastrosItems: { label: string; href: string; icon: typeof Users }[] = []
      if (has('contracts.manage'))          cadastrosItems.push({ label: 'Tipos de Contrato',     href: '/cadastros?tab=contracts',          icon: FileType })
      if (has('services.manage'))           cadastrosItems.push({ label: 'Tipos de Serviço',      href: '/cadastros?tab=services',           icon: Wrench })
      if (!isCoordProjetos && hasCustomersView) cadastrosItems.push({ label: 'Clientes',              href: '/clientes',                         icon: Users })
      if (!isCoordProjetos && hasCustomersEdit) cadastrosItems.push({ label: 'Contatos de Clientes',  href: '/cadastros?tab=customer_contacts',   icon: Contact })
      if (has('executives.manage'))         cadastrosItems.push({ label: 'Executivos',            href: '/cadastros?tab=executives',         icon: Star })
      if (has('groups.manage'))             cadastrosItems.push({ label: 'Grupos de Consultor',   href: '/cadastros?tab=groups',             icon: UserCheck })
      if (has('holidays.manage'))           cadastrosItems.push({ label: 'Feriados',              href: '/cadastros?tab=holidays',           icon: CalendarDays })
      if (has('expense_categories.manage')) cadastrosItems.push({ label: 'Categorias de Despesa', href: '/cadastros?tab=expense_categories', icon: Tag })
      if (has('expense_types.manage'))      cadastrosItems.push({ label: 'Tipos de Despesa',      href: '/cadastros?tab=expense_types',      icon: Receipt })
      if (has('payment_methods.manage'))    cadastrosItems.push({ label: 'Formas de Pagamento',   href: '/cadastros?tab=payment_methods',    icon: CreditCard })
      if (has('partners.manage'))   cadastrosItems.push({ label: 'Parceiros',           href: '/partners',                 icon: Handshake })
      // Coordenador de projetos: vê "Usuários" sob Cadastros com função restrita a
      // reset de senhas (a tela /users gateia as ações pra esse perfil).
      if (isCoordProjetos)                  cadastrosItems.push({ label: 'Usuários',              href: '/users',                            icon: Users })
      // 'Projetos' foi removido — inclusão agora é feita via Kanban (pipeline)
      if (cadastrosItems.length > 0) nav.push({ type: 'group', label: 'Cadastros', icon: Database, items: cadastrosItems.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')) })

      // Usuários — após Cadastros (perfis com permissão dedicada; coord_projetos já entra via Cadastros acima)
      // /users vive no módulo Administrativo; um coordenador com permissão de
      // usuários (ex.: reset_password via Grupo) mas que opera só no módulo
      // Serviços não veria o item. Como gerir senha da equipe é transversal,
      // exibimos sempre (independente do módulo selecionado).
      if (!isCoordProjetos && hasAnyUserPerm) nav.push({ type: 'item', label: 'Usuários', href: '/users', icon: Users, alwaysVisible: true })

      // Configurações
      if (has('settings.view')) nav.push({ type: 'item', label: 'Configurações', href: '/settings', icon: Settings })

      return nav
    }
    if (isAdministrativo) {
      const nav: NavEntry[] = [
        { type: 'item', label: 'Início', href: '/dashboard', icon: Home },
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
      const nav: NavEntry[] = [
        { type: 'item', label: 'Home',                 href: '/portal-cliente',      icon: Building2 },
        { type: 'item', label: 'Demandas e Projetos', href: '/contratos/pipeline',  icon: LayoutGrid },
      ]
      if (dashItems.length > 0) {
        nav.push({ type: 'group', label: 'Contratos', icon: FileText, items: dashItems })
      }
      // Indicadores da própria empresa (atualmente só Auster)
      if (user?.customer_id === 220) {
        nav.push({ type: 'item', label: 'Indicadores', href: '/indicadores/auster', icon: BarChart2 })
      }
      return nav
    }
    if (isConsultor) {
      const baseNav: NavEntry[] = [
        { type: 'item', label: 'Meu Painel', href: '/meu-painel', icon: LayoutDashboard },
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
  const { allowedModules, selectedModule } = useModules()
  // Nav já filtrada pelo módulo (mantém o gating de perfil/permissão do visibleNav).
  const moduleNav = useMemo(
    () => (selectedModule && allowedModules.length > 0) ? filterNavByModule(visibleNav, selectedModule) : visibleNav,
    [visibleNav, selectedModule, allowedModules],
  )

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
        className={cn('fixed inset-0 z-40 bg-black/50 md:hidden transition-opacity duration-200',
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none')}
        aria-hidden
      />
    {/* Container que CLIPA o drawer off-screen no mobile — é `fixed` (fora da
        cadeia de altura do conteúdo, então não quebra `h-full`/h:100% no iOS).
        No desktop vira `contents` e some, deixando o <aside> fluir normalmente. */}
    <div className="fixed inset-0 z-50 overflow-x-hidden pointer-events-none md:static md:inset-auto md:z-auto md:overflow-visible md:pointer-events-auto md:contents">
    <aside
      className={cn(
        'flex flex-col border-r transition-transform duration-200',
        // Mobile: drawer off-canvas (absolute dentro do container fixo → clipado)
        'absolute inset-y-0 left-0 w-[248px] pointer-events-auto',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop: estático no fluxo, altura cheia, colapso opcional
        'md:static md:h-screen md:shrink-0 md:translate-x-0 md:transition-all',
        collapsedRaw ? 'md:w-[60px]' : 'md:w-[248px]',
      )}
      style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}
    >
      {/* Fechar (só mobile) */}
      <button
        onClick={onClose}
        aria-label="Fechar menu"
        className="md:hidden absolute top-3 right-3 z-10 p-1.5 rounded-md transition-colors hover:bg-zinc-800"
        style={{ color: 'var(--text-muted)' }}
      >
        <ChevronLeft size={16} />
      </button>
      {/* ── Logo ── */}
      <div
        className="flex items-center gap-8 h-18 px-5 border-b shrink-0"
        style={{ borderColor: 'var(--brand-border)' }}
      >
        <MinutorIcon size={34} />
        {!collapsed && (
          <span className="font-bold text-[20px] tracking-tight" style={{ color: 'var(--text)' }}>
            Minutor
          </span>
        )}
      </div>

      {/* Troca de módulo agora é só pelo launcher ⊞ no header (AppsMenu). */}

      {/* ── User name (consultor / parceiro) ── */}
      {(isConsultor || isParceiroAdmin) && user && (
        <div
          className="flex items-center gap-2.5 px-3.5 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--brand-border)' }}
        >
          {!collapsed && (
            <>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
              >
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate leading-tight" style={{ color: 'var(--text)' }}>{user.name}</p>
                <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--brand-subtle)' }}>
                  {isParceiroGestor ? 'Parceiro Gestor' : isParceiroAdmin ? 'Parceiro' : 'Consultor'}
                </p>
              </div>
            </>
          )}
          {collapsed && (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold mx-auto"
              style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
            >
              {initials}
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
              style={{ background: 'var(--surface-hover)', color: 'var(--text)', borderColor: 'var(--brand-border)' }}
            />
          </div>
        </div>
      )}

      {/* ── Nav ── */}
      <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
        {!collapsed && isSearching && navToRender.length === 0 && (
          <p className="px-3 py-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            Nenhum item encontrado
          </p>
        )}
        {navToRender.map(entry => {
          // ── Plain item ──
          if (entry.type === 'item') {
            const active = isActive(entry.href, entry.matchPaths)
            const Icon   = entry.icon
            const item = (
              <Link
                key={entry.href}
                href={entry.href}
                className={cn(base, itemClass(active))}
              >
                <Icon size={17} className="shrink-0" />
                {!collapsed && <span className="font-medium">{entry.label}</span>}
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
                <div className="ml-3 mt-0.5 space-y-0.5 border-l pl-2" style={{ borderColor: 'var(--brand-border)' }}>
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
                            <div className="ml-3 mt-0.5 space-y-0.5 border-l pl-2" style={{ borderColor: 'var(--brand-border)' }}>
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
        <div className="flex items-center justify-center px-5 py-3 border-t" style={{ borderColor: 'var(--brand-border)' }}>
          <Image
            src="/logo.png"
            alt="ERPServ"
            width={90}
            height={36}
            className="object-contain sidebar-erpserv-logo"
          />
        </div>
      )}

      {/* ── Collapse toggle (só desktop) ── */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="hidden md:flex items-center justify-center h-10 border-t transition-colors"
        style={{ borderColor: 'var(--brand-border)', color: 'var(--text-muted)' }}
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
