'use client'

import { useEffect, useState, useMemo } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from 'next/navigation'
import { Search, Users, X, Check, TrendingUp, Clock } from 'lucide-react'
import { PageHeader, Table, Thead, Th, Tbody, Tr, Td, Button, SkeletonTable, EmptyState } from '@/components/ds'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { toast } from 'sonner'
import type { LucideIcon } from 'lucide-react'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Consultant {
  id: number
  name: string
  email: string
}

interface ICProject {
  id: number
  code: string
  status: string
  customer: { id: number; name: string } | null
  consultants: Consultant[]
}

interface HoursSummary {
  project_id: number
  total_hours: number
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const inputStyle = {
  background: 'var(--brand-bg)',
  border: '1px solid var(--brand-border)',
  color: 'var(--brand-text)',
}

const surfaceStyle = {
  background: 'var(--brand-surface)',
  border: '1px solid var(--brand-border)',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function periodBounds(month: number, year: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

function fmtHours(h: number): string {
  if (h === 0) return '—'
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvestimentoComercialPage() {
  const { user } = useAuth()
  const router   = useRouter()

  const now = new Date()
  const [filterMonth,  setFilterMonth]  = useState<number>(now.getMonth() + 1)
  const [filterYear,   setFilterYear]   = useState<number>(now.getFullYear())
  const [clientSearch, setClientSearch] = useState('')

  const [projects,   setProjects]   = useState<ICProject[]>([])
  const [hoursMap,   setHoursMap]   = useState<Record<number, number>>({})
  const [hoursLoading, setHoursLoading] = useState(false)
  const [loading,    setLoading]    = useState(true)

  const [allUsers,   setAllUsers]   = useState<Consultant[]>([])
  const [modal,      setModal]      = useState<{ open: boolean; project: ICProject | null }>({ open: false, project: null })
  const [selected,   setSelected]   = useState<number[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [saving,     setSaving]     = useState(false)

  // ── Redirecionar se não for admin ────────────────────────────────────────
  useEffect(() => {
    if (user && user.type !== 'admin') router.replace('/dashboard')
  }, [user, router])

  // ── Carregar projetos + usuários ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    Promise.all([
      api.get<any>('/projects?only_investimento_comercial=true&pageSize=500&gestao=true&with_team=true'),
      api.get<any>('/users?exclude_type=cliente&pageSize=500'),
    ])
      .then(([projRes, usersRes]) => {
        if (cancelled) return

        const rawProjects: any[] = projRes?.items ?? projRes?.data ?? []
        setProjects(rawProjects.map(p => ({
          id:          p.id,
          code:        p.code,
          status:      p.status,
          customer:    p.customer ?? null,
          consultants: p.consultants ?? [],
        })))

        const rawUsers: any[] = usersRes?.data ?? []
        setAllUsers(rawUsers.map(u => ({ id: u.id, name: u.name, email: u.email })))
      })
      .catch(() => toast.error('Erro ao carregar dados'))
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [])

  // ── Carregar horas do período ────────────────────────────────────────────
  useEffect(() => {
    if (!filterMonth || !filterYear) { setHoursMap({}); return }
    let cancelled = false
    setHoursLoading(true)
    const { start, end } = periodBounds(filterMonth, filterYear)
    api.get<HoursSummary[]>(`/projects/ic-summary?start_date=${start}&end_date=${end}`)
      .then(rows => {
        if (cancelled) return
        const map: Record<number, number> = {}
        rows.forEach(r => { map[r.project_id] = r.total_hours })
        setHoursMap(map)
      })
      .catch(() => toast.error('Erro ao carregar horas'))
      .finally(() => { if (!cancelled) setHoursLoading(false) })
    return () => { cancelled = true }
  }, [filterMonth, filterYear])

  // ── Filtros ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = clientSearch.toLowerCase()
    return projects.filter(p =>
      !q || p.customer?.name.toLowerCase().includes(q) ||
      p.consultants.some(c => c.name.toLowerCase().includes(q))
    )
  }, [projects, clientSearch])

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase()
    return allUsers.filter(u =>
      !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    )
  }, [allUsers, userSearch])

  const totalHours = useMemo(
    () => filtered.reduce((acc, p) => acc + (hoursMap[p.id] ?? 0), 0),
    [filtered, hoursMap]
  )

  // ── Modal ────────────────────────────────────────────────────────────────
  function openModal(project: ICProject) {
    setModal({ open: true, project })
    setSelected(project.consultants.map(c => c.id))
    setUserSearch('')
  }

  function closeModal() {
    setModal({ open: false, project: null })
    setSelected([])
    setUserSearch('')
  }

  function toggleUser(id: number) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function saveTeam() {
    if (!modal.project) return
    setSaving(true)
    try {
      await api.patch(`/projects/${modal.project.id}`, { consultant_ids: selected })
      const updatedConsultants = allUsers.filter(u => selected.includes(u.id))
      setProjects(prev => prev.map(p =>
        p.id === modal.project!.id ? { ...p, consultants: updatedConsultants } : p
      ))
      toast.success('Equipe atualizada')
      closeModal()
    } catch {
      toast.error('Erro ao salvar equipe')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <PageHeader
        icon={TrendingUp as LucideIcon}
        title="Investimento Comercial"
        subtitle="Projetos internos de investimento por cliente — não cobrados, refletidos no fechamento dos consultores"
      />

      {/* Filtros */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--brand-subtle)' }} />
          <input
            type="text"
            placeholder="Filtrar por cliente ou consultor..."
            value={clientSearch}
            onChange={e => setClientSearch(e.target.value)}
            className="w-full pl-9 pr-3 h-9 rounded-xl text-xs outline-none"
            style={inputStyle}
          />
        </div>

        <MonthYearPicker
          month={filterMonth}
          year={filterYear}
          onChange={(m, y) => { if (m === 0) { setFilterMonth(0); setFilterYear(0) } else { setFilterMonth(m); setFilterYear(y) } }}
        />

        <span className="text-xs ml-auto" style={{ color: 'var(--brand-subtle)' }}>
          {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
          {filterMonth > 0 && !hoursLoading && (
            <span> · <span style={{ color: '#00F5FF' }}>{fmtHours(totalHours)}</span> total no período</span>
          )}
        </span>
      </div>

      {/* Tabela */}
      {loading ? (
        <SkeletonTable rows={8} cols={4} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={TrendingUp as LucideIcon} title="Nenhum projeto encontrado" description="Ajuste a busca ou cadastre novos clientes." />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Cliente</Th>
              <Th>Código</Th>
              <Th>Consultores Alocados</Th>
              <Th>
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {filterMonth > 0 ? 'Horas no Período' : 'Horas'}
                </span>
              </Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {filtered.map(project => {
              const hours = hoursMap[project.id] ?? 0
              return (
                <Tr key={project.id}>
                  <Td>
                    <span className="font-medium text-sm" style={{ color: 'var(--brand-text)' }}>
                      {project.customer?.name ?? '—'}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF' }}>
                      {project.code}
                    </span>
                  </Td>
                  <Td>
                    {project.consultants.length === 0 ? (
                      <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Nenhum alocado</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {project.consultants.slice(0, 4).map(c => (
                          <span key={c.id} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)' }}>
                            {c.name.split(' ')[0]}
                          </span>
                        ))}
                        {project.consultants.length > 4 && (
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-subtle)' }}>
                            +{project.consultants.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </Td>
                  <Td>
                    {hoursLoading ? (
                      <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>…</span>
                    ) : (
                      <span className="text-sm font-semibold tabular-nums" style={{ color: hours > 0 ? '#00F5FF' : 'var(--brand-subtle)' }}>
                        {fmtHours(hours)}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Button size="sm" variant="ghost" onClick={() => openModal(project)}>
                      <Users size={13} className="mr-1" /> Gerenciar
                    </Button>
                  </Td>
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      )}

      {/* Modal de gerenciar equipe */}
      {modal.open && modal.project && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-4" style={surfaceStyle}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold" style={{ color: '#00F5FF' }}>Investimento Comercial</p>
                <h2 className="text-base font-bold mt-0.5" style={{ color: 'var(--brand-text)' }}>
                  {modal.project.customer?.name ?? '—'}
                </h2>
              </div>
              <button onClick={closeModal} className="p-1 rounded-lg hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-subtle)' }}>
                <X size={16} />
              </button>
            </div>

            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--brand-subtle)' }} />
              <input
                type="text"
                placeholder="Buscar consultor..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="w-full pl-9 pr-3 h-9 rounded-xl text-xs outline-none"
                style={inputStyle}
              />
            </div>

            <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <p className="text-xs text-center py-4" style={{ color: 'var(--brand-subtle)' }}>Nenhum consultor encontrado</p>
              ) : filteredUsers.map(u => {
                const checked = selected.includes(u.id)
                return (
                  <button key={u.id} onClick={() => toggleUser(u.id)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/5">
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors"
                      style={{ background: checked ? '#00F5FF' : 'transparent', border: checked ? 'none' : '1px solid var(--brand-border)' }}>
                      {checked && <Check size={12} style={{ color: '#0a0a0a' }} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight truncate" style={{ color: 'var(--brand-text)' }}>{u.name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--brand-subtle)' }}>{u.email}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
              {selected.length} consultor{selected.length !== 1 ? 'es' : ''} selecionado{selected.length !== 1 ? 's' : ''}
            </p>

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={closeModal}>Cancelar</Button>
              <Button variant="primary" className="flex-1" onClick={saveTeam} disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar Equipe'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
