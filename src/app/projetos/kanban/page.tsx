'use client'

import { useMemo, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { Search } from 'lucide-react'
import { useProjectsForKanban } from '@/hooks/use-projects-for-kanban'
import { ProjectsKanbanBoard } from '@/components/projects/projects-kanban-board'

export default function ProjectsKanbanPage() {
  const { projects, loading, error, refetch } = useProjectsForKanban()
  const [search, setSearch] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')

  const customers = useMemo(() => {
    const map = new Map<number, string>()
    projects.forEach(p => { if (p.customer?.id) map.set(p.customer.id, p.customer.name) })
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [projects])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projects.filter(p => {
      if (customerFilter && String(p.customer?.id ?? '') !== customerFilter) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.code ?? '').toLowerCase().includes(q) ||
        (p.customer?.name ?? '').toLowerCase().includes(q)
      )
    })
  }, [projects, search, customerFilter])

  return (
    <AppLayout title="Kanban de Projetos">
      <div style={{ padding: 24, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              className="ds-input"
              placeholder="Buscar por nome, código ou cliente…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', paddingLeft: 30, fontSize: 13 }}
            />
          </div>
          <select
            className="ds-input"
            value={customerFilter}
            onChange={e => setCustomerFilter(e.target.value)}
            style={{ minWidth: 180, fontSize: 13 }}
          >
            <option value="">Todos os clientes</option>
            {customers.map(([id, name]) => (
              <option key={id} value={String(id)}>{name}</option>
            ))}
          </select>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            {filtered.length} de {projects.length} projetos
          </div>
        </div>

        {error && (
          <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>
        )}

        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>Carregando projetos…</div>
        ) : (
          <div style={{ flex: 1, minHeight: 0 }}>
            <ProjectsKanbanBoard projects={filtered} onChanged={refetch} />
          </div>
        )}
      </div>
    </AppLayout>
  )
}
