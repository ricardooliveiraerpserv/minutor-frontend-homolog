'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Tab {
  label: string
  segment: string
}

const TABS: Tab[] = [
  { label: 'Visão Geral', segment: 'visao-geral' },
  { label: 'Etapas',      segment: 'etapas' },
  { label: 'Horas',       segment: 'horas' },
  { label: 'Financeiro',  segment: 'financeiro' },
  { label: 'Arquivos',    segment: 'arquivos' },
]

export function ProjectTabs({ projectId }: { projectId: number }) {
  const pathname = usePathname()
  const basePath = `/projetos/${projectId}`

  return (
    <nav style={{
      display: 'flex',
      gap: 4,
      borderBottom: '1px solid var(--border)',
      overflowX: 'auto',
    }}>
      {TABS.map(tab => {
        const href = `${basePath}/${tab.segment}`
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={tab.segment}
            href={href}
            className={active ? 'ds-tab-active' : 'ds-tab-inactive'}
            style={{
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: 500,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -1,
              color: active ? 'var(--text)' : 'var(--text-muted)',
            }}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
