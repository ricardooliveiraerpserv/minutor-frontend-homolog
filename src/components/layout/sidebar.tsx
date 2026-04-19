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
  Contact,
  LayoutGrid,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useState, useMemo, useEffect, Suspense } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { LucideIcon } from 'lucide-react'
import type { User } from '@/types'

// ─── Logo SVG ────────────────────────────────────────────────────────────────
// 4 barras verticais em Electric Cyan, alturas: 40% | 70% | 100% | 60%
function MinutorIcon({ size = 28 }: { size?: number }) {
  const bars = [
    { x: 0,    h: 0.45, y: 0.55 },
    { x: 0.28, h: 0.75, y: 0.25 },
    { x: 0.56, h: 1.00, y: 0.00 },
    { x: 0.84, h: 0.60, y: 0.40 },
  ]
  const w = size * 0.72
  const barW = w * 0.18
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      {bars.map((b, i) => (
        <rect
          key={i}
          x={b.x * 28 * 0.9 + 2}
          y={b.y * 20 + 4}
          width={4.2}
          height={b.h * 20}
          rx={1.6}
          fill="#00F5FF"
        />
      ))}
    </svg>
  )
}

// ─── Nav config ──────────────────────────────────────────────────────────────

type NavItem = {
  type: 'item'
  label: string
  href: string
  icon: LucideIcon
}
type NavGroup = {
  type: 'group'
  label: string
  icon: LucideIcon
  items: { label: string; href: string; icon: LucideIcon }[]
}
type NavEntry = NavItem | NavGroup

const NAV_COORDINATOR: NavEntry[] = [
  { type: 'item', label: 'Início',          href: '/dashboard',      icon: Home },
  { type: 'item', label: 'Visão Executiva', href: '/portal-cliente', icon: Building2 },
  { type: 'item', label: 'Apontamentos',    href: '/timesheets',     icon: Clock },
  { type: 'item', label: 'Despesas',        href: '/expenses',       icon: Receipt },
  { type: 'item', label: 'Aprovações',      href: '/approvals',      icon: CheckSquare },
]

const NAV_CLIENTE: NavEntry[] = [
  { type: 'item', label: 'Visão Executiva', href: '/portal-cliente', icon: Building2 },
  { type: 'item', label: 'Apontamentos',  href: '/timesheets',     icon: Clock },
  { type: 'item', label: 'Despesas',      href: '/expenses',       icon: Receipt },
  {
    type: 'group',
    label: 'Dashboards',
    icon: BarChart2,
    items: [
      { label: 'Banco de Horas Fixo',    href: '/dashboards/bank-hours-fixed',   icon: BarChart2 },
      { label: 'Banco de Horas Mensais', href: '/dashboards/bank-hours-monthly', icon: CalendarClock },
      { label: 'On Demand',              href: '/dashboards/on-demand',           icon: Zap },
      { label: 'Fechado',                href: '/dashboards/fechado',             icon: CheckSquare },
    ],
  },
]

const NAV: NavEntry[] = [
  { type: 'item', label: 'Início',                href: '/dashboard',       icon: Home },
  { type: 'item', label: 'Gestão de Projetos',    href: '/gestao-projetos', icon: Layers },
  { type: 'item', label: 'Contratos',             href: '/contratos',        icon: FileText },
  { type: 'item', label: 'Kanban Contratos',      href: '/contratos/kanban',   icon: LayoutGrid },
  { type: 'item', label: 'Pipeline Unificado',   href: '/contratos/pipeline', icon: Layers },
  { type: 'item', label: 'Portal de Sustentação', href: '/sustentacao',     icon: Headphones },
  { type: 'item', label: 'Visão Executiva',    href: '/portal-cliente',  icon: Building2 },
  { type: 'item', label: 'Apontamentos',       href: '/timesheets',      icon: Clock },
  { type: 'item', label: 'Despesas',           href: '/expenses',        icon: Receipt },
  { type: 'item', label: 'Aprovações',         href: '/approvals',       icon: CheckSquare },
  {
    type: 'group',
    label: 'Dashboards',
    icon: BarChart2,
    items: [
      { label: 'Banco de Horas Fixo',    href: '/dashboards/bank-hours-fixed',   icon: BarChart2 },
      { label: 'Banco de Horas Mensais', href: '/dashboards/bank-hours-monthly', icon: CalendarClock },
      { label: 'On Demand',              href: '/dashboards/on-demand',           icon: Zap },
      { label: 'Fechado',                href: '/dashboards/fechado',             icon: CheckSquare },
    ],
  },
  { type: 'item', label: 'Banco de Horas', href: '/hora-banco', icon: Landmark },
  {
    type: 'group',
    label: 'Cadastros',
    icon: Database,
    items: [
      { label: 'Projetos',              href: '/projects',                        icon: FolderOpen },
      { label: 'Tipos de Contrato',     href: '/cadastros?tab=contracts',         icon: FileType },
      { label: 'Tipos de Serviço',      href: '/cadastros?tab=services',          icon: Wrench },
      { label: 'Clientes',              href: '/cadastros?tab=customers',          icon: Users },
      { label: 'Contatos de Clientes', href: '/cadastros?tab=customer_contacts',  icon: Contact },
      { label: 'Executivos',            href: '/cadastros?tab=executives',        icon: Star },
      { label: 'Grupos de Consultor',   href: '/cadastros?tab=groups',            icon: UserCheck },
      { label: 'Feriados',              href: '/cadastros?tab=holidays',          icon: CalendarDays },
      { label: 'Categorias de Despesa', href: '/cadastros?tab=expense_categories', icon: Tag },
      { label: 'Tipos de Despesa',      href: '/cadastros?tab=expense_types',     icon: Receipt },
      { label: 'Formas de Pagamento',   href: '/cadastros?tab=payment_methods',   icon: CreditCard },
      { label: 'Parceiros',             href: '/partners',                        icon: Handshake },
    ],
  },
  { type: 'item', label: 'Usuários',      href: '/users',    icon: Users },
  { type: 'item', label: 'Configurações', href: '/settings', icon: Settings },
]

// ─── Styles ───────────────────────────────────────────────────────────────────

const base = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] transition-all duration-150 outline-none select-none'

function itemStyle(active: boolean): React.CSSProperties {
  return active
    ? { color: '#00F5FF', background: 'rgba(0,245,255,0.08)' }
    : { color: '#A1A1AA' }
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function SidebarInner({ user }: { user: User }) {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [collapsed,   setCollapsed]   = useState(false)
  const [openGroups,  setOpenGroups]  = useState<string[]>(() => {
    // Abre automaticamente apenas o grupo que contém a rota atual
    const active: string[] = []
    for (const entry of NAV) {
      if (entry.type === 'group' && entry.items.some(i => pathname === i.href.split('?')[0] || pathname.startsWith(i.href.split('?')[0] + '/'))) {
        active.push(entry.label)
      }
    }
    return active
  })

  const isConsultor      = user?.type === 'consultor'
  const isCoordenador    = user?.type === 'coordenador'
  const isCliente        = user?.type === 'cliente'
  const isParceiroAdmin  = user?.type === 'parceiro_admin'
  const isParceiroGestor = isParceiroAdmin && !!user?.is_executive
  const ep = user?.extra_permissions ?? []

  // Para clientes: carrega os códigos de tipo de contrato dos seus projetos
  const [clienteContractCodes, setClienteContractCodes] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!isCliente || !user?.customer_id) return
    api.get<any>(`/projects?customer_id=${user.customer_id}&pageSize=200`)
      .then(r => {
        const items: any[] = Array.isArray(r?.items) ? r.items : []
        const codes = new Set(items.map(p => p.contract_type?.code).filter(Boolean) as string[])
        setClienteContractCodes(codes)
      })
      .catch(() => {})
  }, [isCliente, user?.customer_id])

  const visibleNav = useMemo(() => {
    if (isCoordenador) {
      const ep = user?.extra_permissions ?? []
      const has = (p: string) => ep.includes(p)
      const nav: NavEntry[] = [...NAV_COORDINATOR]

      // Gestão de Projetos — somente para coordenadores do tipo "projetos"
      if (user?.coordinator_type === 'projetos') {
        nav.splice(1, 0, { type: 'item', label: 'Gestão de Projetos', href: '/gestao-projetos', icon: Layers })
      }

      // Portal de Sustentação — somente para coordenadores do tipo "sustentacao"
      if (user?.coordinator_type === 'sustentacao') {
        nav.splice(1, 0, { type: 'item', label: 'Portal de Sustentação', href: '/sustentacao', icon: Headphones })
      }

      // Projetos e Usuários — opcionais via extra_permissions
      const hasProjectsAction = ['projects.create','projects.update','projects.delete','projects.view_financial'].some(p => ep.includes(p))
      const hasAnyUserPerm = ['users.view_all','users.create','users.update','users.reset_password'].some(p => ep.includes(p))

      // Dashboards — aparece se tiver ao menos um dashboard extra
      const dashItems: { label: string; href: string; icon: typeof BarChart2 }[] = []
      if (has('dashboards.bank_hours_fixed.view'))   dashItems.push({ label: 'Banco de Horas Fixo',    href: '/dashboards/bank-hours-fixed',    icon: BarChart2 })
      if (has('dashboards.bank_hours_monthly.view')) dashItems.push({ label: 'Banco de Horas Mensais', href: '/dashboards/bank-hours-monthly',  icon: CalendarClock })
      if (has('dashboards.on_demand.view'))          dashItems.push({ label: 'On Demand',              href: '/dashboards/on-demand',           icon: Zap })
      if (dashItems.length > 0) nav.push({ type: 'group', label: 'Dashboards', icon: BarChart2, items: dashItems })

      // Banco de Horas
      if (has('hora_banco.view')) nav.push({ type: 'item', label: 'Banco de Horas', href: '/hora-banco', icon: Landmark })

      // Cadastros — monta apenas os subitens concedidos
      const cadastrosItems: { label: string; href: string; icon: typeof Users }[] = []
      if (has('contracts.manage'))          cadastrosItems.push({ label: 'Tipos de Contrato',     href: '/cadastros?tab=contracts',          icon: FileType })
      if (has('services.manage'))           cadastrosItems.push({ label: 'Tipos de Serviço',      href: '/cadastros?tab=services',           icon: Wrench })
      if (has('customers.manage'))          cadastrosItems.push({ label: 'Clientes',              href: '/cadastros?tab=customers',          icon: Users })
      if (has('customers.manage'))          cadastrosItems.push({ label: 'Contatos de Clientes',  href: '/cadastros?tab=customer_contacts',   icon: Contact })
      if (has('executives.manage'))         cadastrosItems.push({ label: 'Executivos',            href: '/cadastros?tab=executives',         icon: Star })
      if (has('groups.manage'))             cadastrosItems.push({ label: 'Grupos de Consultor',   href: '/cadastros?tab=groups',             icon: UserCheck })
      if (has('holidays.manage'))           cadastrosItems.push({ label: 'Feriados',              href: '/cadastros?tab=holidays',           icon: CalendarDays })
      if (has('expense_categories.manage')) cadastrosItems.push({ label: 'Categorias de Despesa', href: '/cadastros?tab=expense_categories', icon: Tag })
      if (has('expense_types.manage'))      cadastrosItems.push({ label: 'Tipos de Despesa',      href: '/cadastros?tab=expense_types',      icon: Receipt })
      if (has('payment_methods.manage'))    cadastrosItems.push({ label: 'Formas de Pagamento',   href: '/cadastros?tab=payment_methods',    icon: CreditCard })
      if (has('partners.manage'))   cadastrosItems.push({ label: 'Parceiros',           href: '/partners',                 icon: Handshake })
      if (hasProjectsAction) cadastrosItems.unshift({ label: 'Projetos', href: '/projects', icon: FolderOpen })
      if (cadastrosItems.length > 0) nav.push({ type: 'group', label: 'Cadastros', icon: Database, items: cadastrosItems })

      // Usuários — após Cadastros
      if (hasAnyUserPerm) nav.push({ type: 'item', label: 'Usuários', href: '/users', icon: Users })

      // Configurações
      if (has('settings.view')) nav.push({ type: 'item', label: 'Configurações', href: '/settings', icon: Settings })

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
        { type: 'item', label: 'Visão Executiva', href: '/portal-cliente',   icon: Building2 },
        { type: 'item', label: 'Pipeline',        href: '/contratos/kanban', icon: LayoutGrid },
        { type: 'item', label: 'Apontamentos',    href: '/timesheets',       icon: Clock },
        { type: 'item', label: 'Despesas',        href: '/expenses',         icon: Receipt },
      ]
      if (dashItems.length > 0) {
        nav.push({ type: 'group', label: 'Dashboards', icon: BarChart2, items: dashItems })
      }
      return nav
    }
    if (isConsultor) {
      const allowed = new Set(['/dashboard'])
      if (ep.includes('gestao_projetos.view') || ep.includes('gestao_projetos.update')) allowed.add('/gestao-projetos')
      return NAV.filter(e => e.type === 'item' && allowed.has(e.href))
    }
    if (isParceiroAdmin) {
      if (isParceiroGestor) {
        return [
          { type: 'item', label: 'Painel do Parceiro', href: '/partner-dashboard', icon: Handshake },
        ] as NavEntry[]
      }
      // Parceiro simples: igual ao consultor
      return [
        { type: 'item', label: 'Início',     href: '/dashboard',  icon: Home },
      ] as NavEntry[]
    }
    return NAV
  }, [isCoordenador, isConsultor, isCliente, isParceiroAdmin, isParceiroGestor, clienteContractCodes, ep])

  // First two letters of name for avatar
  const initials = user?.name
    ? user.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const toggleGroup = (label: string) =>
    setOpenGroups(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label])

  const isActive = (href: string) => {
    const [hrefPath, hrefQuery] = href.split('?')
    if (!hrefQuery) return pathname === hrefPath || pathname.startsWith(hrefPath + '/')
    // com query param: pathname deve bater E o tab deve bater
    if (pathname !== hrefPath) return false
    const params = new URLSearchParams(hrefQuery)
    for (const [k, v] of params.entries()) {
      if (searchParams.get(k) !== v) return false
    }
    return true
  }
  const groupActive = (g: NavGroup) => g.items.some(i => isActive(i.href))

  return (
    <aside
      className={cn('flex flex-col h-screen border-r transition-all duration-200 shrink-0', collapsed ? 'w-[60px]' : 'w-[248px]')}
      style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}
    >
      {/* ── Logo ── */}
      <div
        className="flex items-center gap-8 h-18 px-5 border-b shrink-0"
        style={{ borderColor: 'var(--brand-border)' }}
      >
        <MinutorIcon size={34} />
        {!collapsed && (
          <span className="font-bold text-[20px] tracking-tight" style={{ color: '#FAFAFA' }}>
            Minutor
          </span>
        )}
      </div>

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
                style={{ background: 'rgba(0,245,255,0.15)', color: '#00F5FF' }}
              >
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate leading-tight">{user.name}</p>
                <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--brand-subtle)' }}>
                  {isParceiroGestor ? 'Parceiro Gestor' : isParceiroAdmin ? 'Parceiro' : 'Consultor'}
                </p>
              </div>
            </>
          )}
          {collapsed && (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold mx-auto"
              style={{ background: 'rgba(0,245,255,0.15)', color: '#00F5FF' }}
            >
              {initials}
            </div>
          )}
        </div>
      )}

      {/* ── Nav ── */}
      <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
        {visibleNav.map(entry => {
          // ── Plain item ──
          if (entry.type === 'item') {
            const active = isActive(entry.href)
            const Icon   = entry.icon
            const item = (
              <Link
                key={entry.href}
                href={entry.href}
                className={cn(base, !active && 'hover:bg-white/[0.04] hover:text-[#FAFAFA]')}
                style={itemStyle(active)}
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
          const open   = openGroups.includes(group.label)

          if (collapsed) {
            return (
              <div key={group.label} className="space-y-0.5">
                {group.items.map(sub => {
                  const SubIcon = sub.icon
                  const subActive = isActive(sub.href)
                  const subItem = (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      className={cn(base, !subActive && 'hover:bg-white/[0.04] hover:text-[#FAFAFA]')}
                      style={itemStyle(subActive)}
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
                className={cn('w-full', base, !active && 'hover:bg-white/[0.04] hover:text-[#FAFAFA]')}
                style={active ? { color: '#FAFAFA' } : { color: '#A1A1AA' }}
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
                    const SubIcon = sub.icon
                    const subActive = isActive(sub.href)
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={cn(
                          'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition-all duration-150',
                          !subActive && 'hover:bg-white/[0.04] hover:text-[#FAFAFA]'
                        )}
                        style={subActive
                          ? { color: '#00F5FF', background: 'rgba(0,245,255,0.08)' }
                          : { color: '#71717A' }
                        }
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
            className="object-contain opacity-40"
            style={{ filter: 'grayscale(1) invert(1) brightness(10)' }}
          />
        </div>
      )}

      {/* ── Collapse toggle ── */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center justify-center h-10 border-t transition-colors hover:bg-white/[0.04]"
        style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-subtle)' }}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  )
}

export function Sidebar({ user }: { user: User }) {
  return (
    <Suspense>
      <SidebarInner user={user} />
    </Suspense>
  )
}
