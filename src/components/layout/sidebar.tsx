'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Clock,
  FolderOpen,
  Receipt,
  CheckSquare,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const NAV = [
  { label: 'Dashboard',    href: '/dashboard',   icon: LayoutDashboard },
  { label: 'Apontamentos', href: '/timesheets',  icon: Clock },
  { label: 'Projetos',     href: '/projects',    icon: FolderOpen },
  { label: 'Despesas',     href: '/expenses',    icon: Receipt },
  { label: 'Aprovações',   href: '/approvals',   icon: CheckSquare },
  { label: 'Usuários',     href: '/users',       icon: Users },
  { label: 'Configurações',href: '/settings',    icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside className={cn(
      'flex flex-col h-screen bg-zinc-900 border-r border-zinc-800 transition-all duration-200 shrink-0',
      collapsed ? 'w-14' : 'w-52'
    )}>
      {/* Logo */}
      <div className="flex items-center h-14 px-3 border-b border-zinc-800">
        {!collapsed && (
          <span className="text-white font-semibold text-sm tracking-wide">Minutor</span>
        )}
        {collapsed && (
          <span className="text-blue-500 font-bold text-lg mx-auto">M</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          const item = (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
              )}
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          )

          if (collapsed) {
            return (
              <Tooltip key={href}>
                <TooltipTrigger render={item} />
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            )
          }
          return item
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center justify-center h-10 border-t border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  )
}
