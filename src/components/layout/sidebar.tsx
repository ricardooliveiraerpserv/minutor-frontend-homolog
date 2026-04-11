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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { LucideIcon } from 'lucide-react'

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
  { type: 'item', label: 'Início',        href: '/dashboard',  icon: Home },
  { type: 'item', label: 'Apontamentos',  href: '/timesheets', icon: Clock },
  { type: 'item', label: 'Projetos',      href: '/projects',   icon: FolderOpen },
  { type: 'item', label: 'Despesas',      href: '/expenses',   icon: Receipt },
  { type: 'item', label: 'Aprovações',    href: '/approvals',  icon: CheckSquare },
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
  { type: 'item', label: 'Usuários',      href: '/users',      icon: Users },
  { type: 'item', label: 'Configurações', href: '/settings',   icon: Settings },
]

// shared link styles
const linkBase = 'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-150 outline-none'
const linkActive = { background: '#1e2a40', color: 'var(--brand-primary)' }
const linkIdle = { color: 'var(--brand-muted)' }

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [openGroups, setOpenGroups] = useState<string[]>(['Dashboards'])

  const toggleGroup = (label: string) =>
    setOpenGroups(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    )

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const isGroupActive = (group: NavGroup) => group.items.some(i => isActive(i.href))

  return (
    <aside
      className={cn('flex flex-col h-screen border-r transition-all duration-200 shrink-0', collapsed ? 'w-14' : 'w-56')}
      style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
        {!collapsed
          ? <span className="font-bold text-base tracking-tight" style={{ color: 'var(--brand-text)' }}>
              <span style={{ color: 'var(--brand-primary)' }}>Min</span>utor
            </span>
          : <span className="font-bold text-base mx-auto" style={{ color: 'var(--brand-primary)' }}>M</span>
        }
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
        {NAV.map(entry => {
          if (entry.type === 'item') {
            const active = isActive(entry.href)
            const Icon = entry.icon
            const item = (
              <Link
                key={entry.href}
                href={entry.href}
                className={cn(linkBase, !active && 'hover:bg-white/5')}
                style={active ? linkActive : linkIdle}
              >
                <Icon size={15} className="shrink-0" />
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

          // Group
          const group = entry as NavGroup
          const GroupIcon = group.icon
          const active = isGroupActive(group)
          const open = openGroups.includes(group.label)

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
                      className={cn(linkBase, !subActive && 'hover:bg-white/5')}
                      style={subActive ? linkActive : linkIdle}
                    >
                      <SubIcon size={15} className="shrink-0" />
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
                className={cn('w-full', linkBase, !active && 'hover:bg-white/5')}
                style={active ? { color: 'var(--brand-text)' } : linkIdle}
              >
                <GroupIcon size={15} className="shrink-0" />
                <span className="flex-1 text-left font-medium">{group.label}</span>
                <ChevronDown size={12} className={cn('transition-transform duration-200', open && 'rotate-180')} />
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
                        className={cn('flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-all duration-150', !subActive && 'hover:bg-white/5')}
                        style={subActive ? { color: 'var(--brand-primary)', background: '#1e2a40' } : { color: 'var(--brand-muted)' }}
                      >
                        <SubIcon size={13} className="shrink-0" />
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

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center justify-center h-10 border-t transition-colors hover:bg-white/5"
        style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-muted)' }}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  )
}
