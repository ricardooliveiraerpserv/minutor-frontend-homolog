'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Tab {
  label: string
  segment: string
  /** Se true, aparece apenas em projetos operacionais (não sustentação). */
  operationalOnly?: boolean
  /** Se true, o cliente (visão em dias) também vê esta aba. */
  clientAllowed?: boolean
}

const TABS: Tab[] = [
  { label: 'Visão Geral',  segment: 'visao-geral', clientAllowed: true },
  { label: 'Cronograma',   segment: 'cronograma',   operationalOnly: true, clientAllowed: true },
  { label: 'Acompanhamentos',   segment: 'follow-ups', clientAllowed: true },
  { label: 'Horas',        segment: 'horas' },
  { label: 'Financeiro',   segment: 'financeiro' },
  { label: 'Arquivos',     segment: 'arquivos' },
]

interface Props {
  projectId: number
  isOperational?: boolean
  /** Cliente: só vê as abas clientAllowed (Visão Geral, Cronograma, Follow Ups). */
  clientView?: boolean
}

export function ProjectTabs({ projectId, isOperational = true, clientView = false }: Props) {
  const pathname = usePathname()
  const basePath = `/projetos/${projectId}`

  const visible = TABS
    .filter(t => !t.operationalOnly || isOperational)
    .filter(t => !clientView || t.clientAllowed)

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
