'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, ClipboardList } from 'lucide-react'

const TABS = [
  { href: '/competencias/dashboard', label: 'Consulta de Competências', icon: Search },
  { href: '/competencias/pesquisas', label: 'Pesquisas de Competências', icon: ClipboardList },
]

/** Abas que unem Consulta (dashboard) + Pesquisas num único item de menu. */
export function CompetenciasConsultaTabs() {
  const path = usePathname()
  return (
    <div className="ds-card flex gap-1" style={{ padding: 6, width: 'fit-content' }}>
      {TABS.map(t => {
        const active = path === t.href
        const Icon = t.icon
        return (
          <Link key={t.href} href={t.href} className="flex items-center gap-2"
            style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontWeight: active ? 600 : 400, background: active ? 'var(--primary-soft)' : 'transparent', color: active ? 'var(--primary)' : 'var(--text-muted)' }}>
            <Icon size={15} /> {t.label}
          </Link>
        )
      })}
    </div>
  )
}
