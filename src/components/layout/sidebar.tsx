'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Clock,
  FolderOpen,
  Receipt,
  CheckSquare,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BarChart2,
  CalendarClock,
  Zap,
  Handshake,
  LayoutDashboard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useMemo } from 'react'
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

const NAV: NavEntry[] = [
  { type: 'item', label: 'Início',        href: '/dashboard',   icon: Home },
  { type: 'item', label: 'Meu Painel',    href: '/meu-painel',  icon: LayoutDashboard },
  { type: 'item', label: 'Apontamentos',  href: '/timesheets',  icon: Clock },
  { type: 'item', label: 'Despesas',      href: '/expenses',    icon: Receipt },
  { type: 'item', label: 'Projetos',      href: '/projects',    icon: FolderOpen },
  { type: 'item', label: 'Aprovações',    href: '/approvals',   icon: CheckSquare },
  {
    type: 'group',
    label: 'Dashboards',
    icon: BarChart2,
    items: [
      { label: 'Banco de Horas Fixo',    href: '/dashboards/bank-hours-fixed',   icon: BarChart2 },
      { label: 'Banco de Horas Mensais', href: '/dashboards/bank-hours-monthly', icon: CalendarClock },
      { label: 'On Demand',              href: '/dashboards/on-demand',           icon: Zap },
    ],
  },
  { type: 'item', label: 'Usuários',      href: '/users',    icon: Users },
  { type: 'item', label: 'Parceiros',     href: '/partners', icon: Handshake },
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

export function Sidebar({ user }: { user: User }) {
  const pathname  = usePathname()
  const [collapsed,   setCollapsed]   = useState(false)
  const [openGroups,  setOpenGroups]  = useState<string[]>(['Dashboards'])

  const isConsultor = user?.roles?.includes('Consultor') &&
    !user.roles.includes('Administrator') &&
    !user.roles.includes('Coordenador') &&
    !user.roles.includes('Parceiro ADM')

  const visibleNav = useMemo(() => {
    if (isConsultor) {
      return NAV.filter(e => e.type === 'item' && (e.href === '/dashboard' || e.href === '/meu-painel'))
    }
    return NAV
  }, [isConsultor])

  // First two letters of name for avatar
  const initials = user?.name
    ? user.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const toggleGroup = (label: string) =>
    setOpenGroups(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label])

  const isActive   = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const groupActive = (g: NavGroup) => g.items.some(i => isActive(i.href))

  return (
    <aside
      className={cn('flex flex-col h-screen border-r transition-all duration-200 shrink-0', collapsed ? 'w-[60px]' : 'w-[248px]')}
      style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}
    >
      {/* ── Logo ── */}
      <div
        className="flex items-center gap-2.5 h-14 px-3.5 border-b shrink-0"
        style={{ borderColor: 'var(--brand-border)' }}
      >
        <MinutorIcon size={26} />
        {!collapsed && (
          <span className="font-bold text-[15px] tracking-tight" style={{ color: '#FAFAFA' }}>
            Minutor
          </span>
        )}
      </div>

      {/* ── User name (consultor) ── */}
      {isConsultor && user && (
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
                <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--brand-subtle)' }}>Consultor</p>
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
