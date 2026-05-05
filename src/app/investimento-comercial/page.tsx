'use client'

import { useEffect, useState, useMemo } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from 'next/navigation'
import {
  Search, Users, X, Check, TrendingUp, Clock,
  BarChart2, Building2, User, ChevronDown, ChevronRight,
} from 'lucide-react'
import { PageHeader, Table, Thead, Th, Tbody, Tr, Td, Button, SkeletonTable, EmptyState } from '@/components/ds'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { toast } from 'sonner'
import type { LucideIcon } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Consultant { id: number; name: string; email: string }
interface ConsultantGroup { id: number; name: string; users: Consultant[] }

interface ICProject {
  id: number; code: string; status: string
  customer: { id: number; name: string } | null
  consultants: Consultant[]
}

interface HoursSummary { project_id: number; total_hours: number }

interface ByCustomer  { customer_id: number; customer_name: string; total_hours: number; total_cost: number }
interface ByConsultant { user_id: number; user_name: string; total_hours: number; total_cost: number; num_customers: number }
interface Monthly     { month: string; total_hours: number; total_cost: number }
interface Detail      { user_id: number; user_name: string; customer_id: number; customer_name: string; total_hours: number; total_cost: number }

interface Analytics {
  by_customer: ByCustomer[]
  by_consultant: ByConsultant[]
  monthly: Monthly[]
  detail: Detail[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputStyle  = { background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }
const surfaceStyle = { background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }
const cardStyle   = { background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }

function periodBounds(month: number, year: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

function fmtHours(h: number) {
  if (h === 0) return '—'
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60)
  return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`
}

function fmtCurrency(v: number) {
  return v === 0 ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtMonth(m: string) {
  const [y, mo] = m.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[parseInt(mo) - 1]}/${y}`
}

function MiniBar({ value, max, color = '#00F5FF' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(3, (value / max) * 100) : 0
  return (
    <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

// ─── Abas ─────────────────────────────────────────────────────────────────────

type Tab = 'projetos' | 'clientes' | 'consultores' | 'mensal' | 'detalhe'

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'projetos',    label: 'Projetos',         icon: TrendingUp as LucideIcon },
  { id: 'clientes',    label: 'Por Cliente',       icon: Building2  as LucideIcon },
  { id: 'consultores', label: 'Por Consultor',     icon: User       as LucideIcon },
  { id: 'mensal',      label: 'Evolução Mensal',   icon: BarChart2  as LucideIcon },
  { id: 'detalhe',     label: 'Detalhamento',      icon: Clock      as LucideIcon },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvestimentoComercialPage() {
  const { user } = useAuth()
  const router   = useRouter()

  const now = new Date()
  const [filterMonth, setFilterMonth] = useState<number>(now.getMonth() + 1)
  const [filterYear,  setFilterYear]  = useState<number>(now.getFullYear())
  const [clientSearch, setClientSearch] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('projetos')

  // projetos tab
  const [projects,     setProjects]     = useState<ICProject[]>([])
  const [hoursMap,     setHoursMap]     = useState<Record<number, number>>({})
  const [hoursLoading, setHoursLoading] = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [allUsers,     setAllUsers]     = useState<Consultant[]>([])
  const [groups,       setGroups]       = useState<ConsultantGroup[]>([])
  const [modal,        setModal]        = useState<{ open: boolean; project: ICProject | null }>({ open: false, project: null })
  const [selected,     setSelected]     = useState<number[]>([])
  const [userSearch,   setUserSearch]   = useState('')
  const [saving,       setSaving]       = useState(false)

  // analytics tabs
  const [analytics,        setAnalytics]        = useState<Analytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [expandedConsultant, setExpandedConsultant] = useState<number | null>(null)

  useEffect(() => {
    if (user && user.type !== 'admin') router.replace('/dashboard')
  }, [user, router])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.get<any>('/projects?only_investimento_comercial=true&pageSize=500&gestao=true&with_team=true'),
      api.get<any>('/users?exclude_type=cliente&pageSize=500'),
      api.get<any>('/consultant-groups?pageSize=200&with_users=true'),
    ]).then(([projRes, usersRes, groupsRes]) => {
      if (cancelled) return
      const rawProjects: any[] = projRes?.items ?? projRes?.data ?? []
      setProjects(rawProjects.map(p => ({ id: p.id, code: p.code, status: p.status, customer: p.customer ?? null, consultants: p.consultants ?? [] })))
      const rawUsers: any[] = usersRes?.items ?? usersRes?.data ?? []
      setAllUsers(rawUsers.map((u: any) => ({ id: u.id, name: u.name, email: u.email })))
      const rawGroups: any[] = groupsRes?.data ?? groupsRes?.items ?? []
      setGroups(rawGroups.map((g: any) => ({
        id: g.id,
        name: g.name,
        users: (g.users ?? g.consultants ?? []).map((u: any) => ({ id: u.id, name: u.name, email: u.email })),
      })))
    }).catch(() => toast.error('Erro ao carregar dados'))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // horas por projeto (aba projetos)
  useEffect(() => {
    if (!filterMonth || !filterYear || activeTab !== 'projetos') { setHoursMap({}); return }
    let cancelled = false
    setHoursLoading(true)
    const { start, end } = periodBounds(filterMonth, filterYear)
    api.get<HoursSummary[]>(`/projects/ic-summary?start_date=${start}&end_date=${end}`)
      .then(rows => { if (cancelled) return; const map: Record<number, number> = {}; rows.forEach(r => { map[r.project_id] = r.total_hours }); setHoursMap(map) })
      .catch(() => toast.error('Erro ao carregar horas'))
      .finally(() => { if (!cancelled) setHoursLoading(false) })
    return () => { cancelled = true }
  }, [filterMonth, filterYear, activeTab])

  // analytics (abas clientes / consultores / mensal / detalhe)
  useEffect(() => {
    if (activeTab === 'projetos') return
    let cancelled = false
    setAnalyticsLoading(true)

    const params = new URLSearchParams()
    if (filterMonth && filterYear) {
      const { start, end } = periodBounds(filterMonth, filterYear)
      params.set('start_date', start)
      params.set('end_date', end)
    }

    api.get<Analytics>(`/projects/ic-analytics?${params}`)
      .then(data => { if (!cancelled) setAnalytics(data) })
      .catch(() => toast.error('Erro ao carregar analytics'))
      .finally(() => { if (!cancelled) setAnalyticsLoading(false) })
    return () => { cancelled = true }
  }, [activeTab, filterMonth, filterYear])

  const filtered = useMemo(() => {
    const q = clientSearch.toLowerCase()
    return projects.filter(p => !q || p.customer?.name.toLowerCase().includes(q) || p.consultants.some(c => c.name.toLowerCase().includes(q)))
  }, [projects, clientSearch])

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase()
    return allUsers.filter(u => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }, [allUsers, userSearch])

  const totalHours = useMemo(() => filtered.reduce((acc, p) => acc + (hoursMap[p.id] ?? 0), 0), [filtered, hoursMap])

  function openModal(project: ICProject) { setModal({ open: true, project }); setSelected(project.consultants.map(c => c.id)); setUserSearch('') }
  function closeModal() { setModal({ open: false, project: null }); setSelected([]); setUserSearch('') }
  function toggleUser(id: number) { setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }

  async function saveTeam() {
    if (!modal.project) return
    setSaving(true)
    try {
      await api.patch(`/projects/${modal.project.id}`, { consultant_ids: selected })
      const updatedConsultants = allUsers.filter(u => selected.includes(u.id))
      setProjects(prev => prev.map(p => p.id === modal.project!.id ? { ...p, consultants: updatedConsultants } : p))
      toast.success('Equipe atualizada')
      closeModal()
    } catch { toast.error('Erro ao salvar equipe') }
    finally { setSaving(false) }
  }

  // ── Conteúdo de cada aba ─────────────────────────────────────────────────────

  function renderProjetos() {
    if (loading) return <SkeletonTable rows={8} cols={4} />
    if (filtered.length === 0) return <EmptyState icon={TrendingUp as LucideIcon} title="Nenhum projeto encontrado" description="Ajuste a busca." />
    return (
      <Table>
        <Thead>
          <Tr>
            <Th>Cliente</Th><Th>Código</Th><Th>Consultores Alocados</Th>
            <Th><span className="flex items-center gap-1"><Clock size={12} />{filterMonth > 0 ? 'Horas no Período' : 'Horas'}</span></Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {filtered.map(project => {
            const hours = hoursMap[project.id] ?? 0
            return (
              <Tr key={project.id}>
                <Td><span className="font-medium text-sm" style={{ color: 'var(--brand-text)' }}>{project.customer?.name ?? '—'}</span></Td>
                <Td><span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF' }}>{project.code}</span></Td>
                <Td>
                  {project.consultants.length === 0
                    ? <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Nenhum alocado</span>
                    : <div className="flex flex-wrap gap-1">
                        {project.consultants.slice(0, 4).map(c => (
                          <span key={c.id} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)' }}>{c.name.split(' ')[0]}</span>
                        ))}
                        {project.consultants.length > 4 && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-subtle)' }}>+{project.consultants.length - 4}</span>}
                      </div>
                  }
                </Td>
                <Td>
                  {hoursLoading
                    ? <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>…</span>
                    : <span className="text-sm font-semibold tabular-nums" style={{ color: hours > 0 ? '#00F5FF' : 'var(--brand-subtle)' }}>{fmtHours(hours)}</span>
                  }
                </Td>
                <Td><Button size="sm" variant="ghost" onClick={() => openModal(project)}><Users size={13} className="mr-1" /> Gerenciar</Button></Td>
              </Tr>
            )
          })}
        </Tbody>
      </Table>
    )
  }

  function renderClientes() {
    if (analyticsLoading) return <SkeletonTable rows={6} cols={3} />
    const data = analytics?.by_customer ?? []
    if (data.length === 0) return <EmptyState icon={Building2 as LucideIcon} title="Sem dados" description="Nenhum apontamento IC no período." />
    const maxHours = Math.max(...data.map(r => r.total_hours))
    const maxCost  = Math.max(...data.map(r => r.total_cost))
    const totalH = data.reduce((s, r) => s + r.total_hours, 0)
    const totalC = data.reduce((s, r) => s + r.total_cost, 0)
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.15)' }}>
            <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--brand-subtle)' }}>Total Horas</p>
            <p className="text-xl font-bold" style={{ color: '#00F5FF' }}>{fmtHours(totalH)}</p>
          </div>
          <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--brand-subtle)' }}>Custo Total</p>
            <p className="text-xl font-bold" style={{ color: '#8B5CF6' }}>{fmtCurrency(totalC)}</p>
          </div>
        </div>
        <Table>
          <Thead>
            <Tr><Th>Cliente</Th><Th>Horas</Th><Th>Custo Interno</Th></Tr>
          </Thead>
          <Tbody>
            {data.map(r => (
              <Tr key={r.customer_id}>
                <Td><span className="font-medium text-sm" style={{ color: 'var(--brand-text)' }}>{r.customer_name}</span></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums" style={{ color: '#00F5FF' }}>{fmtHours(r.total_hours)}</span>
                    <MiniBar value={r.total_hours} max={maxHours} color="#00F5FF" />
                  </div>
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums" style={{ color: '#8B5CF6' }}>{fmtCurrency(r.total_cost)}</span>
                    <MiniBar value={r.total_cost} max={maxCost} color="#8B5CF6" />
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>
    )
  }

  function renderConsultores() {
    if (analyticsLoading) return <SkeletonTable rows={6} cols={4} />
    const data = analytics?.by_consultant ?? []
    const detail = analytics?.detail ?? []
    if (data.length === 0) return <EmptyState icon={User as LucideIcon} title="Sem dados" description="Nenhum apontamento IC no período." />
    const maxH = Math.max(...data.map(r => r.total_hours))
    return (
      <Table>
        <Thead>
          <Tr><Th>Consultor</Th><Th>Horas</Th><Th>Custo</Th><Th>Clientes</Th><Th></Th></Tr>
        </Thead>
        <Tbody>
          {data.map(r => {
            const expanded = expandedConsultant === r.user_id
            const myDetail = detail.filter(d => d.user_id === r.user_id)
            return [
              <Tr key={r.user_id}>
                <Td><span className="font-medium text-sm" style={{ color: 'var(--brand-text)' }}>{r.user_name}</span></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums" style={{ color: '#00F5FF' }}>{fmtHours(r.total_hours)}</span>
                    <MiniBar value={r.total_hours} max={maxH} />
                  </div>
                </Td>
                <Td><span className="text-sm font-semibold tabular-nums" style={{ color: '#8B5CF6' }}>{fmtCurrency(r.total_cost)}</span></Td>
                <Td><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)' }}>{r.num_customers} cliente{r.num_customers !== 1 ? 's' : ''}</span></Td>
                <Td>
                  {myDetail.length > 0 && (
                    <button onClick={() => setExpandedConsultant(expanded ? null : r.user_id)}
                      className="flex items-center gap-1 text-xs transition-colors hover:opacity-70"
                      style={{ color: 'var(--brand-subtle)' }}>
                      {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      {expanded ? 'fechar' : 'ver'}
                    </button>
                  )}
                </Td>
              </Tr>,
              ...(expanded ? myDetail.map(d => (
                <Tr key={`${r.user_id}-${d.customer_id}`} baseBackground="rgba(0,245,255,0.02)">
                  <Td>
                    <span className="ml-5 text-xs" style={{ color: 'var(--brand-subtle)' }}>↳ {d.customer_name}</span>
                  </Td>
                  <Td><span className="text-xs tabular-nums" style={{ color: 'var(--brand-muted)' }}>{fmtHours(d.total_hours)}</span></Td>
                  <Td><span className="text-xs tabular-nums" style={{ color: 'var(--brand-muted)' }}>{fmtCurrency(d.total_cost)}</span></Td>
                  <Td /><Td />
                </Tr>
              )) : [])
            ]
          })}
        </Tbody>
      </Table>
    )
  }

  function renderMensal() {
    if (analyticsLoading) return <SkeletonTable rows={6} cols={3} />
    const data = analytics?.monthly ?? []
    if (data.length === 0) return <EmptyState icon={BarChart2 as LucideIcon} title="Sem dados" description="Nenhum apontamento IC no período." />
    const maxH = Math.max(...data.map(r => r.total_hours))
    const maxC = Math.max(...data.map(r => r.total_cost))
    return (
      <div className="space-y-3">
        {/* Gráfico de barras simples */}
        <div className="rounded-xl p-4" style={cardStyle}>
          <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--brand-subtle)' }}>Horas por Mês</p>
          <div className="flex items-end gap-1.5 h-28">
            {data.map(r => {
              const pct = maxH > 0 ? (r.total_hours / maxH) * 100 : 0
              return (
                <div key={r.month} className="flex-1 flex flex-col items-center gap-1 group">
                  <span className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity tabular-nums" style={{ color: '#00F5FF' }}>{fmtHours(r.total_hours)}</span>
                  <div className="w-full rounded-t-sm transition-all" style={{ height: `${Math.max(4, pct)}%`, background: 'rgba(0,245,255,0.5)', minHeight: 4 }} />
                  <span className="text-[9px] rotate-0 whitespace-nowrap" style={{ color: 'var(--brand-subtle)', fontSize: '8px' }}>{fmtMonth(r.month)}</span>
                </div>
              )
            })}
          </div>
        </div>
        <Table>
          <Thead>
            <Tr><Th>Mês</Th><Th>Horas</Th><Th>Custo Interno</Th></Tr>
          </Thead>
          <Tbody>
            {data.map(r => (
              <Tr key={r.month}>
                <Td><span className="font-medium text-sm" style={{ color: 'var(--brand-text)' }}>{fmtMonth(r.month)}</span></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums" style={{ color: '#00F5FF' }}>{fmtHours(r.total_hours)}</span>
                    <MiniBar value={r.total_hours} max={maxH} />
                  </div>
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums" style={{ color: '#8B5CF6' }}>{fmtCurrency(r.total_cost)}</span>
                    <MiniBar value={r.total_cost} max={maxC} color="#8B5CF6" />
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>
    )
  }

  function renderDetalhe() {
    if (analyticsLoading) return <SkeletonTable rows={8} cols={4} />
    const data = analytics?.detail ?? []
    if (data.length === 0) return <EmptyState icon={Clock as LucideIcon} title="Sem dados" description="Nenhum apontamento IC no período." />
    return (
      <Table>
        <Thead>
          <Tr><Th>Consultor</Th><Th>Cliente</Th><Th>Horas</Th><Th>Custo</Th></Tr>
        </Thead>
        <Tbody>
          {data.map((r, i) => (
            <Tr key={i}>
              <Td><span className="text-sm" style={{ color: 'var(--brand-text)' }}>{r.user_name}</span></Td>
              <Td><span className="text-sm" style={{ color: 'var(--brand-muted)' }}>{r.customer_name}</span></Td>
              <Td><span className="text-sm font-semibold tabular-nums" style={{ color: '#00F5FF' }}>{fmtHours(r.total_hours)}</span></Td>
              <Td><span className="text-sm font-semibold tabular-nums" style={{ color: '#8B5CF6' }}>{fmtCurrency(r.total_cost)}</span></Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    )
  }

  // ── Render principal ──────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <PageHeader
        icon={TrendingUp as LucideIcon}
        title="Investimento Interno"
        subtitle="Projetos internos por cliente — não cobrados, refletidos no fechamento dos consultores"
      />

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {activeTab === 'projetos' && (
          <div className="relative min-w-48 flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--brand-subtle)' }} />
            <input type="text" placeholder="Filtrar por cliente ou consultor..." value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              className="w-full pl-9 pr-3 h-9 rounded-xl text-xs outline-none" style={inputStyle} />
          </div>
        )}

        <MonthYearPicker month={filterMonth} year={filterYear}
          onChange={(m, y) => { if (m === 0) { setFilterMonth(0); setFilterYear(0) } else { setFilterMonth(m); setFilterYear(y) } }} />

        {activeTab === 'projetos' && (
          <span className="text-xs ml-auto" style={{ color: 'var(--brand-subtle)' }}>
            {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
            {filterMonth > 0 && !hoursLoading && (
              <span> · <span style={{ color: '#00F5FF' }}>{fmtHours(totalHours)}</span> total</span>
            )}
          </span>
        )}
      </div>

      {/* Abas */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {TABS.map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={active
                ? { background: 'rgba(0,245,255,0.12)', color: '#00F5FF', border: '1px solid rgba(0,245,255,0.25)' }
                : { background: 'transparent', color: 'var(--brand-subtle)', border: '1px solid transparent' }
              }>
              <Icon size={12} /> {tab.label}
            </button>
          )
        })}
      </div>

      {/* Conteúdo */}
      {activeTab === 'projetos'    && renderProjetos()}
      {activeTab === 'clientes'    && renderClientes()}
      {activeTab === 'consultores' && renderConsultores()}
      {activeTab === 'mensal'      && renderMensal()}
      {activeTab === 'detalhe'     && renderDetalhe()}

      {/* Modal gerenciar equipe */}
      {modal.open && modal.project && (() => {
        const groupUserIds = new Set(groups.flatMap(g => g.users.map(u => u.id)))
        const ungrouped = filteredUsers.filter(u => !groupUserIds.has(u.id))
        const filteredGroups = groups.filter(g =>
          !userSearch || g.name.toLowerCase().includes(userSearch.toLowerCase()) ||
          g.users.some(u => u.name.toLowerCase().includes(userSearch.toLowerCase()))
        )

        function UserRow({ u }: { u: Consultant }) {
          const checked = selected.includes(u.id)
          return (
            <button onClick={() => toggleUser(u.id)}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors hover:bg-white/5 w-full">
              <div className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors"
                style={{ background: checked ? '#00F5FF' : 'transparent', border: checked ? 'none' : '1px solid var(--brand-border)' }}>
                {checked && <Check size={10} style={{ color: '#0a0a0a' }} />}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium leading-tight truncate" style={{ color: 'var(--brand-text)' }}>{u.name}</p>
              </div>
            </button>
          )
        }

        function toggleGroup(g: ConsultantGroup) {
          const ids = g.users.map(u => u.id)
          const allChecked = ids.every(id => selected.includes(id))
          if (allChecked) setSelected(prev => prev.filter(id => !ids.includes(id)))
          else setSelected(prev => [...new Set([...prev, ...ids])])
        }

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-4" style={surfaceStyle}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold" style={{ color: '#00F5FF' }}>Investimento Interno</p>
                  <h2 className="text-base font-bold mt-0.5" style={{ color: 'var(--brand-text)' }}>{modal.project!.customer?.name ?? '—'}</h2>
                </div>
                <button onClick={closeModal} className="p-1 rounded-lg hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-subtle)' }}><X size={16} /></button>
              </div>

              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--brand-subtle)' }} />
                <input type="text" placeholder="Buscar consultor ou grupo..." value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="w-full pl-9 pr-3 h-9 rounded-xl text-xs outline-none" style={inputStyle} />
              </div>

              <div className="flex flex-col gap-1 max-h-80 overflow-y-auto pr-0.5">
                {filteredGroups.length === 0 && ungrouped.length === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: 'var(--brand-subtle)' }}>Nenhum consultor encontrado</p>
                )}

                {/* Grupos */}
                {filteredGroups.map(g => {
                  const visibleUsers = userSearch
                    ? g.users.filter(u => u.name.toLowerCase().includes(userSearch.toLowerCase()))
                    : g.users
                  if (visibleUsers.length === 0) return null
                  const allChecked = g.users.every(u => selected.includes(u.id))
                  const someChecked = g.users.some(u => selected.includes(u.id))
                  return (
                    <div key={g.id} className="mb-1">
                      <button onClick={() => toggleGroup(g)}
                        className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                        <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                          style={{
                            background: allChecked ? '#00F5FF' : someChecked ? 'rgba(0,245,255,0.3)' : 'transparent',
                            border: allChecked ? 'none' : '1px solid var(--brand-border)',
                          }}>
                          {allChecked && <Check size={10} style={{ color: '#0a0a0a' }} />}
                          {someChecked && !allChecked && <div className="w-2 h-0.5 rounded" style={{ background: '#00F5FF' }} />}
                        </div>
                        <span className="text-xs font-semibold" style={{ color: 'var(--brand-muted)' }}>{g.name}</span>
                        <span className="ml-auto text-[10px]" style={{ color: 'var(--brand-subtle)' }}>{g.users.length}</span>
                      </button>
                      <div className="ml-4 border-l pl-2" style={{ borderColor: 'var(--brand-border)' }}>
                        {visibleUsers.map(u => <UserRow key={u.id} u={u} />)}
                      </div>
                    </div>
                  )
                })}

                {/* Sem grupo */}
                {ungrouped.length > 0 && (
                  <div className="mb-1">
                    {filteredGroups.length > 0 && (
                      <p className="px-3 py-1 text-[10px] uppercase tracking-widest" style={{ color: 'var(--brand-subtle)' }}>Sem grupo</p>
                    )}
                    {ungrouped.map(u => <UserRow key={u.id} u={u} />)}
                  </div>
                )}
              </div>

              <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
                {selected.length} consultor{selected.length !== 1 ? 'es' : ''} selecionado{selected.length !== 1 ? 's' : ''}
              </p>
              <div className="flex gap-2 pt-1">
                <Button variant="ghost" className="flex-1" onClick={closeModal}>Cancelar</Button>
                <Button variant="primary" className="flex-1" onClick={saveTeam} disabled={saving}>{saving ? 'Salvando…' : 'Salvar Equipe'}</Button>
              </div>
            </div>
          </div>
        )
      })()}
    </AppLayout>
  )
}
