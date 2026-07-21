'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { GitBranch, FileText } from 'lucide-react'

const TABS = [
  { href: '/competencias/matriz', label: 'Matriz de Competências', icon: GitBranch },
  { href: '/competencias/formularios', label: 'Formulários', icon: FileText },
]

/** Abas para as rotinas de configuração (Matriz + Formulários) num único menu. */
export function CompetenciasConfigTabs() {
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
