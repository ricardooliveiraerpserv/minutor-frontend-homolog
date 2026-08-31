'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Tab {
  label: string
  segment: string
  /** Se true, aparece apenas em projetos operacionais (não sustentação). */
  operationalOnly?: boolean
}

const TABS: Tab[] = [
  { label: 'Visão Geral', segment: 'visao-geral' },
  // Cronograma: rotina em teste SÓ no dev (removida de prod). NÃO reativar em prod. — tombamento dev2.
  { label: 'Cronograma',  segment: 'cronograma' },
  { label: 'Horas',       segment: 'horas' },
  { label: 'Financeiro',  segment: 'financeiro' },
  { label: 'Arquivos',    segment: 'arquivos' },
]

interface Props {
  projectId: number
  isOperational?: boolean
}

export function ProjectTabs({ projectId, isOperational = true }: Props) {
  const pathname = usePathname()
  const basePath = `/projetos/${projectId}`

  const visible = TABS.filter(t => !t.operationalOnly || isOperational)

  return (
    <nav style={{
      display: 'flex',
      gap: 4,
      borderBottom: '1px solid var(--border)',
      overflowX: 'auto',
    }}>
      {visible.map(tab => {
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
