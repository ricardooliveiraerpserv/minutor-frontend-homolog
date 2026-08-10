'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { PageHeader, Table, Thead, Th, Tbody, Tr, Td } from '@/components/ds'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { History, Search, X, ChevronRight } from 'lucide-react'

interface ProjectRow {
  project_id: number
  code: string
  name: string
  customer: string | null
  changes: number
  last_at: string | null
}
interface AuditItem {
  source: 'projeto' | 'aporte'
  field: string
  field_label: string
  old: string | null
  new: string | null
  user: string
  at: string
}

const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso.replace(' ', 'T'))
  return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AuditoriaProjetosPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const [selected, setSelected] = useState<ProjectRow | null>(null)
  const [detail, setDetail] = useState<AuditItem[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => { if (user && user.type !== 'admin') router.replace('/inicio') }, [user, router])

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ view: 'projects' })
      if (search) p.set('search', search)
      const r = await api.get<{ items: ProjectRow[] }>(`/projects/audit?${p}`)
      setProjects(r.items ?? [])
    } catch { toast.error('Erro ao carregar os projetos') } finally { setLoading(false) }
  }, [search])
  useEffect(() => { loadProjects() }, [loadProjects])

  const openProject = async (proj: ProjectRow) => {
    setSelected(proj)
    setDetail([])
    setDetailLoading(true)
    try {
      const r = await api.get<{ items: AuditItem[] }>(`/projects/audit?project_id=${proj.project_id}&pageSize=100`)
      setDetail(r.items ?? [])
    } catch { toast.error('Erro ao carregar o histórico') } finally { setDetailLoading(false) }
  }

  const applySearch = () => setSearch(searchInput.trim())
  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' } as const

  return (
    <AppLayout title="Auditoria de Projetos">
      <div className="space-y-6">
        <PageHeader
          icon={History}
          title="Auditoria de Projetos"
          subtitle="Só aparecem os projetos que tiveram alteração. Clique num projeto para ver todo o histórico do que mudou (campos, tipo de contrato/serviço, valores, status, datas, aportes) — com quem e quando."
        />

        <div className="flex gap-1 max-w-md">
          <input className="rounded-lg px-3 py-2 text-sm ds-input flex-1" style={inputStyle} value={searchInput}
            onChange={e => setSearchInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applySearch() }}
            placeholder="Buscar projeto por código ou nome…" />
          <button onClick={applySearch} className="px-3 rounded-lg" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><Search size={15} /></button>
        </div>

        {loading ? (
          <p className="text-sm animate-pulse" style={{ color: 'var(--text-light)' }}>Carregando…</p>
        ) : projects.length === 0 ? (
          <div className="ds-card p-8 text-center text-sm" style={{ color: 'var(--text-light)' }}>Nenhum projeto com alterações registradas{search ? ' para essa busca' : ''}.</div>
        ) : (
          <div className="ds-card overflow-x-auto">
            <Table>
              <Thead>
                <Tr><Th>Projeto</Th><Th>Cliente</Th><Th right>Alterações</Th><Th>Última alteração</Th><Th></Th></Tr>
              </Thead>
              <Tbody>
                {projects.map(p => (
                  <Tr key={p.project_id} className="cursor-pointer" onClick={() => openProject(p)}>
                    <Td className="font-medium whitespace-nowrap" style={{ color: 'var(--text)' }}>
                      {p.code}{p.name ? <span className="font-normal" style={{ color: 'var(--text-light)' }}> — {p.name}</span> : null}
                    </Td>
                    <Td style={{ color: 'var(--text-muted)' }}>{p.customer ?? '—'}</Td>
                    <Td right>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{p.changes}</span>
                    </Td>
                    <Td className="whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{fmtDate(p.last_at)}</Td>
                    <Td right><ChevronRight size={15} style={{ color: 'var(--text-light)' }} /></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        )}
      </div>

      {/* Detalhe do projeto */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={() => setSelected(null)}>
          <div className="ds-card w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 p-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0">
                <div className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}><History size={15} className="text-[var(--primary)]" /> {selected.code}{selected.name ? ` — ${selected.name}` : ''}</div>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>{selected.customer ?? ''} · {selected.changes} alteração(ões) registrada(s)</p>
              </div>
              <button onClick={() => setSelected(null)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {detailLoading ? (
                <p className="text-sm animate-pulse text-center py-8" style={{ color: 'var(--text-light)' }}>Carregando histórico…</p>
              ) : detail.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-light)' }}>Sem histórico.</p>
              ) : (
                <div className="space-y-2.5">
                  {detail.map((it, i) => (
                    <div key={i} className="rounded-lg p-3" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                          {it.source === 'aporte' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>APORTE</span>}
                          {it.field_label}
                        </span>
                        <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--text-light)' }}>{fmtDate(it.at)} · {it.user}</span>
                      </div>
                      <div className="flex items-start gap-2 text-xs">
                        <span className="whitespace-pre-wrap flex-1 line-clamp-4" style={{ color: 'var(--text-light)' }}>{it.old ?? '—'}</span>
                        <span style={{ color: 'var(--text-light)' }}>→</span>
                        <span className="whitespace-pre-wrap flex-1 line-clamp-4" style={{ color: 'var(--text)' }}>{it.new ?? '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
