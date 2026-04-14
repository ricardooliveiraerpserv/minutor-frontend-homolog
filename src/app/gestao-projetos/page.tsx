'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useMemo, useEffect } from 'react'
import { api } from '@/lib/api'
import { Project, PaginatedResponse } from '@/types'
import { toast } from 'sonner'
import { Layers, Search, ChevronDown, ChevronRight, Users, TrendingUp, Clock, BarChart2, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/ds'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ProjectWithTeam extends Project {
  consultants?: { id: number; name: string; email: string }[]
  coordinators?: { id: number; name: string; email: string }[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function healthColor(pct: number | undefined): 'green' | 'yellow' | 'red' {
  if (pct === undefined || pct === null) return 'green'
  if (pct >= 90) return 'red'
  if (pct >= 70) return 'yellow'
  return 'green'
}

const healthStyles = {
  green:  { bar: '#22c55e', badge: 'rgba(34,197,94,0.12)',  text: '#86efac' },
  yellow: { bar: '#f59e0b', badge: 'rgba(245,158,11,0.12)', text: '#fcd34d' },
  red:    { bar: '#ef4444', badge: 'rgba(239,68,68,0.12)',  text: '#fca5a5' },
}

function fmt(n: number | null | undefined, dec = 0) {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

const inputStyle = {
  background: 'var(--brand-surface)',
  border: '1px solid var(--brand-border)',
  color: 'var(--brand-text)',
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-14 rounded-xl" style={{ background: 'var(--brand-surface)' }} />
      ))}
    </div>
  )
}

// ─── Card de Resumo ───────────────────────────────────────────────────────────

interface SummaryCardProps {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}

function SummaryCard({ icon, label, value, sub }: SummaryCardProps) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,245,255,0.08)' }}>
          {icon}
        </div>
        <span className="text-xs font-medium" style={{ color: 'var(--brand-muted)' }}>{label}</span>
      </div>
      <p className="text-2xl font-bold tracking-tight" style={{ color: 'var(--brand-text)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--brand-subtle)' }}>{sub}</p>}
    </div>
  )
}

// ─── Linha da Tabela ──────────────────────────────────────────────────────────

interface ProjectRowProps {
  project: ProjectWithTeam
  expanded: boolean
  onToggle: () => void
}

function ProjectRow({ project, expanded, onToggle }: ProjectRowProps) {
  const pct   = project.balance_percentage ?? 0
  const color = healthColor(project.balance_percentage)
  const hs    = healthStyles[color]

  const saldo = project.general_hours_balance
  const saldoNeg = saldo != null && saldo < 0

  const statusLabel: Record<string, string> = {
    active: 'Ativo',
    started: 'Em Andamento',
    awaiting_start: 'Aguardando',
    paused: 'Pausado',
    finished: 'Finalizado',
    cancelled: 'Cancelado',
  }

  const teamCount = (project.consultants?.length ?? 0) + (project.coordinators?.length ?? 0)

  return (
    <>
      <tr
        className="border-b transition-colors hover:bg-white/[0.02] cursor-pointer"
        style={{ borderColor: 'var(--brand-border)' }}
        onClick={onToggle}
      >
        {/* Indicador de saúde (borda esquerda) */}
        <td className="pl-0 pr-3 py-3 w-1">
          <div className="w-1 h-10 rounded-full ml-0" style={{ background: hs.bar }} />
        </td>

        {/* Projeto */}
        <td className="py-3 pr-4">
          <div className="flex items-center gap-2">
            {teamCount > 0
              ? (expanded ? <ChevronDown size={14} style={{ color: 'var(--brand-subtle)' }} />
                         : <ChevronRight size={14} style={{ color: 'var(--brand-subtle)' }} />)
              : <span className="w-3.5" />
            }
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>{project.name}</p>
              <p className="text-xs font-mono" style={{ color: 'var(--brand-subtle)' }}>{project.code}</p>
            </div>
          </div>
        </td>

        {/* Cliente */}
        <td className="py-3 pr-4 text-sm" style={{ color: 'var(--brand-muted)' }}>
          {project.customer?.name ?? '—'}
        </td>

        {/* HS Vendidas */}
        <td className="py-3 pr-4 text-sm text-right tabular-nums" style={{ color: 'var(--brand-muted)' }}>
          {fmt(project.sold_hours)}
        </td>

        {/* HS Consumidas */}
        <td className="py-3 pr-4 text-sm text-right tabular-nums" style={{ color: 'var(--brand-muted)' }}>
          {project.consumed_hours != null
            ? fmt(project.consumed_hours)
            : project.total_logged_minutes != null
              ? fmt(project.total_logged_minutes / 60, 1)
              : '—'
          }
        </td>

        {/* Saldo */}
        <td className="py-3 pr-4 text-sm text-right tabular-nums font-semibold"
          style={{ color: saldoNeg ? '#ef4444' : 'var(--brand-text)' }}>
          {saldo != null ? (saldoNeg ? '' : '') + fmt(saldo, 1) : '—'}
        </td>

        {/* % Uso + barra */}
        <td className="py-3 pr-4 min-w-[120px]">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(pct, 100)}%`, background: hs.bar }}
              />
            </div>
            <span className="text-xs tabular-nums w-9 text-right" style={{ color: hs.text }}>
              {project.sold_hours ? `${Math.round(pct)}%` : '—'}
            </span>
          </div>
        </td>

        {/* Status */}
        <td className="py-3">
          <span
            className="text-xs font-medium px-2 py-1 rounded-lg"
            style={{ background: hs.badge, color: hs.text }}
          >
            {project.status_display ?? statusLabel[project.status] ?? project.status}
          </span>
        </td>
      </tr>

      {/* Expansão: equipe */}
      {expanded && teamCount > 0 && (
        <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
          <td />
          <td colSpan={7} className="py-3 px-4">
            <div className="flex flex-wrap gap-4">
              {(project.coordinators ?? []).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--brand-subtle)' }}>
                    Coordenadores
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {project.coordinators!.map(u => (
                      <span key={u.id} className="text-xs px-2.5 py-1 rounded-lg font-medium"
                        style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF' }}>
                        {u.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(project.consultants ?? []).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--brand-subtle)' }}>
                    Consultores
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {project.consultants!.map(u => (
                      <span key={u.id} className="text-xs px-2.5 py-1 rounded-lg font-medium"
                        style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)' }}>
                        {u.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function GestaoProjetosPage() {
  const [projects, setProjects]   = useState<ProjectWithTeam[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState('')
  const [expanded, setExpanded]   = useState<Set<number>>(new Set())

  useEffect(() => {
    setLoading(true)
    api.get<PaginatedResponse<ProjectWithTeam>>('/projects?pageSize=200')
      .then(res => setProjects(res.items ?? []))
      .catch(() => toast.error('Erro ao carregar projetos'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (statusFilter && p.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          (p.customer?.name ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [projects, search, statusFilter])

  // ── Métricas dos cards ──
  const stats = useMemo(() => {
    const ativos    = filtered.filter(p => ['active', 'started'].includes(p.status)).length
    const vendidas  = filtered.reduce((s, p) => s + (p.sold_hours ?? 0), 0)
    const consumidas = filtered.reduce((s, p) => {
      if (p.consumed_hours != null) return s + p.consumed_hours
      if (p.total_logged_minutes != null) return s + p.total_logged_minutes / 60
      return s
    }, 0)
    const saldo     = filtered.reduce((s, p) => s + (p.general_hours_balance ?? 0), 0)
    const comPct    = filtered.filter(p => (p.sold_hours ?? 0) > 0)
    const avgPct    = comPct.length
      ? comPct.reduce((s, p) => s + (p.balance_percentage ?? 0), 0) / comPct.length
      : 0
    const criticos  = filtered.filter(p => (p.balance_percentage ?? 0) >= 90).length
    return { ativos, vendidas, consumidas, saldo, avgPct, criticos }
  }, [filtered])

  const toggleExpand = (id: number) =>
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <AppLayout>
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <PageHeader
          icon={Layers}
          title="Gestão de Projetos"
          subtitle="Visão operacional dos projetos sob sua coordenação"
        />

        {/* ── Cards de Resumo ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
          <SummaryCard
            icon={<Layers size={15} color="var(--brand-primary)" />}
            label="Projetos Ativos"
            value={String(stats.ativos)}
            sub={`de ${filtered.length} total`}
          />
          <SummaryCard
            icon={<Clock size={15} color="var(--brand-primary)" />}
            label="Horas Vendidas"
            value={fmt(stats.vendidas)}
            sub="horas contratadas"
          />
          <SummaryCard
            icon={<TrendingUp size={15} color="var(--brand-primary)" />}
            label="Horas Consumidas"
            value={fmt(stats.consumidas, 1)}
            sub="apontadas aprovadas"
          />
          <SummaryCard
            icon={<BarChart2 size={15} color={stats.saldo < 0 ? '#ef4444' : 'var(--brand-primary)'} />}
            label="Saldo Total"
            value={fmt(stats.saldo, 1) + ' h'}
            sub={stats.saldo < 0 ? 'saldo negativo' : 'horas disponíveis'}
          />
          <SummaryCard
            icon={<AlertTriangle size={15} color={stats.criticos > 0 ? '#ef4444' : 'var(--brand-primary)'} />}
            label="Consumo Médio"
            value={`${Math.round(stats.avgPct)}%`}
            sub={stats.criticos > 0 ? `${stats.criticos} crítico(s)` : 'dentro do esperado'}
          />
        </div>

        {/* ── Filtros ── */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--brand-subtle)' }} />
            <input
              type="text"
              placeholder="Buscar projeto, código ou cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 h-9 rounded-xl text-xs outline-none"
              style={{ ...inputStyle }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatus(e.target.value)}
            className="h-9 px-3 rounded-xl text-xs outline-none"
            style={{ ...inputStyle }}
          >
            <option value="">Todos os status</option>
            <option value="started">Em Andamento</option>
            <option value="active">Ativo</option>
            <option value="awaiting_start">Aguardando Início</option>
            <option value="paused">Pausado</option>
            <option value="finished">Finalizado</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </div>

        {/* ── Tabela ── */}
        {loading ? (
          <Skeleton />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20" style={{ color: 'var(--brand-subtle)' }}>
            <Layers size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum projeto encontrado</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
            <table className="w-full text-left">
              <thead>
                <tr style={{ background: 'var(--brand-surface)', borderBottom: '1px solid var(--brand-border)' }}>
                  <th className="w-1 pl-2" />
                  <th className="py-3 pr-4 pl-2 text-xs font-semibold" style={{ color: 'var(--brand-muted)' }}>Projeto</th>
                  <th className="py-3 pr-4 text-xs font-semibold" style={{ color: 'var(--brand-muted)' }}>Cliente</th>
                  <th className="py-3 pr-4 text-xs font-semibold text-right" style={{ color: 'var(--brand-muted)' }}>HS Vendidas</th>
                  <th className="py-3 pr-4 text-xs font-semibold text-right" style={{ color: 'var(--brand-muted)' }}>HS Consumidas</th>
                  <th className="py-3 pr-4 text-xs font-semibold text-right" style={{ color: 'var(--brand-muted)' }}>Saldo</th>
                  <th className="py-3 pr-4 text-xs font-semibold" style={{ color: 'var(--brand-muted)', minWidth: 140 }}>% Uso</th>
                  <th className="py-3 text-xs font-semibold" style={{ color: 'var(--brand-muted)' }}>Status</th>
                </tr>
              </thead>
              <tbody style={{ background: 'var(--brand-bg)' }}>
                {filtered.map(project => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    expanded={expanded.has(project.id)}
                    onToggle={() => toggleExpand(project.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Legenda ── */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center gap-5 mt-4">
            <span className="text-[11px]" style={{ color: 'var(--brand-subtle)' }}>Saúde:</span>
            {(['green', 'yellow', 'red'] as const).map(c => (
              <div key={c} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: healthStyles[c].bar }} />
                <span className="text-[11px]" style={{ color: 'var(--brand-subtle)' }}>
                  {c === 'green' ? 'Saudável (<70%)' : c === 'yellow' ? 'Atenção (70–90%)' : 'Crítico (>90%)'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
