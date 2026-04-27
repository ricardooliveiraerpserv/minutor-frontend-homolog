'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import type { Project, PaginatedResponse } from '@/types'
import { toast } from 'sonner'
import {
  Headphones, Search, Clock, TrendingUp, BarChart2, AlertTriangle,
  DollarSign, Eye, Users, ChevronDown, ChevronRight, MessageCircle,
  Edit2, Trash2, Layers, Check, X,
} from 'lucide-react'
import { RowMenu } from '@/components/ui/row-menu'
import { PageHeader } from '@/components/ds'
import { ProjectMessages } from '@/components/shared/ProjectMessages'
import { formatBRL } from '@/lib/format'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SustProject extends Project {
  consultants?: { id: number; name: string; email: string }[]
  coordinators?: { id: number; name: string; email: string }[]
  service_type?: { id: number; name: string } | null
  contract_type?: { id: number; name: string } | null
  contract_type_display?: string
  status_display?: string
  project_value?: number | null
}

interface CostSummary {
  project_info: { project_value?: number | null; total_available_hours?: number }
  hours_summary: { total_logged_hours: number; approved_hours: number; pending_hours: number; remaining_hours: number; general_balance?: number; total_available_hours?: number; hours_percentage: number }
  cost_calculation: { total_cost: number; approved_cost: number; pending_cost: number; margin: number; margin_percentage: number }
  consultant_breakdown: { consultant_name: string; total_hours: number; approved_hours: number; pending_hours: number; cost: number; consultant_hourly_rate?: number; consultant_rate_type?: string }[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function healthColor(pct: number): 'green' | 'yellow' | 'red' {
  if (pct >= 90) return 'red'
  if (pct >= 70) return 'yellow'
  return 'green'
}

const healthStyles = {
  green:  { bar: '#22c55e', text: '#86efac' },
  yellow: { bar: '#f59e0b', text: '#fcd34d' },
  red:    { bar: '#ef4444', text: '#fca5a5' },
}

function fmt(n: number | null | undefined, dec = 0) {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativo', started: 'Em Andamento', awaiting_start: 'Aguardando',
  paused: 'Pausado', finished: 'Finalizado', cancelled: 'Cancelado',
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  started:        { bg: 'rgba(0,245,255,0.10)',    color: '#00F5FF' },
  active:         { bg: 'rgba(34,197,94,0.10)',    color: '#22C55E' },
  paused:         { bg: 'rgba(245,158,11,0.12)',   color: '#F59E0B' },
  cancelled:      { bg: 'rgba(239,68,68,0.12)',    color: '#EF4444' },
  finished:       { bg: 'rgba(161,161,170,0.12)',  color: '#71717A' },
  awaiting_start: { bg: 'rgba(139,92,246,0.12)',   color: '#8B5CF6' },
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'all',       label: 'Todos' },
  { id: 'bh_fixo',   label: 'BH Fixo' },
  { id: 'bh_mensal', label: 'BH Mensal' },
  { id: 'on_demand', label: 'On Demand' },
  { id: 'cloud',     label: 'Cloud' },
  { id: 'bizify',    label: 'Bizify' },
]

function getTab(p: SustProject): string {
  const ct = (p.contract_type_display ?? p.contract_type?.name ?? '').toLowerCase()
  if (ct.includes('cloud')) return 'cloud'
  if (ct.includes('bizify')) return 'bizify'
  if (ct.includes('mensal') || ct.includes('bh_mensal')) return 'bh_mensal'
  if (ct.includes('fixo') || ct.includes('bh_fixo')) return 'bh_fixo'
  if (ct.includes('demand')) return 'on_demand'
  return 'all'
}

function isSustProject(p: SustProject): boolean {
  const ct = (p.contract_type_display ?? p.contract_type?.name ?? '').toLowerCase()
  const st = (p.service_type?.name ?? '').toLowerCase()
  return (
    ct.includes('sust') || ct.includes('cloud') || ct.includes('bizify') ||
    ct.includes('bh fixo') || ct.includes('bh mensal') || ct.includes('bh_fixo') || ct.includes('bh_mensal') ||
    st.includes('sust') || st.includes('cloud') || st.includes('bizify')
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-14 rounded-xl" style={{ background: 'var(--brand-surface)' }} />
      ))}
    </div>
  )
}

// ─── View Project Modal ────────────────────────────────────────────────────────

function ViewProjectModal({ project, onClose }: { project: SustProject; onClose: () => void }) {
  const consumed = project.consumed_hours ?? (project.total_logged_minutes != null ? project.total_logged_minutes / 60 : 0)
  const pct = project.sold_hours ? (consumed / project.sold_hours) * 100 : 0
  const color = healthColor(pct)
  const hs = healthStyles[color]
  const ss = STATUS_STYLE[project.status] ?? { bg: 'rgba(161,161,170,0.12)', color: '#A1A1AA' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex flex-col rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Projeto</p>
            <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>{project.name}</p>
            <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--brand-subtle)' }}>{project.code}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Status + contrato */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: ss.bg, color: ss.color }}>
              {project.status_display ?? STATUS_LABEL[project.status] ?? project.status}
            </span>
            {(project.contract_type_display ?? project.contract_type?.name) && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {project.contract_type_display ?? project.contract_type?.name}
              </span>
            )}
          </div>

          {/* Horas */}
          <div className="rounded-xl p-4" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
            <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--brand-subtle)' }}>Horas</p>
            <div className="grid grid-cols-3 gap-4 text-xs mb-3">
              <div><p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Vendidas</p><p className="font-bold tabular-nums mt-0.5" style={{ color: 'var(--brand-text)' }}>{fmt(project.sold_hours)}h</p></div>
              <div><p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Consumidas</p><p className="font-bold tabular-nums mt-0.5" style={{ color: 'var(--brand-text)' }}>{fmt(consumed, 1)}h</p></div>
              <div><p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Saldo</p><p className="font-bold tabular-nums mt-0.5" style={{ color: (project.general_hours_balance ?? 0) < 0 ? '#ef4444' : 'var(--brand-text)' }}>{fmt(project.general_hours_balance, 1)}h</p></div>
            </div>
            {project.sold_hours ? (
              <>
                <div className="w-full rounded-full h-1.5 mb-1" style={{ background: 'var(--brand-border)' }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: hs.bar }} />
                </div>
                <p className="text-[10px] tabular-nums" style={{ color: hs.text }}>{pct.toFixed(1)}% das horas utilizadas</p>
              </>
            ) : null}
          </div>

          {/* Detalhes */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
            {[
              { label: 'Cliente',          value: project.customer?.name },
              { label: 'Tipo de Serviço',  value: project.service_type?.name },
              { label: 'Tipo de Contrato', value: project.contract_type_display ?? project.contract_type?.name },
              { label: 'Valor do Projeto', value: project.project_value != null ? formatBRL(project.project_value) : null },
            ].map((row, i, arr) => row.value ? (
              <div key={row.label} className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--brand-border)' : undefined }}>
                <p className="text-xs w-32 shrink-0" style={{ color: 'var(--brand-subtle)' }}>{row.label}</p>
                <p className="text-xs font-medium" style={{ color: 'var(--brand-text)' }}>{row.value}</p>
              </div>
            ) : null)}
          </div>

          {/* Equipe */}
          {((project.coordinators?.length ?? 0) > 0 || (project.consultants?.length ?? 0) > 0) && (
            <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid var(--brand-border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Equipe</p>
              {(project.coordinators?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[10px] mb-1.5" style={{ color: 'var(--brand-subtle)' }}>Coordenadores</p>
                  <div className="flex flex-wrap gap-1.5">
                    {project.coordinators!.map(u => <span key={u.id} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF' }}>{u.name}</span>)}
                  </div>
                </div>
              )}
              {(project.consultants?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[10px] mb-1.5" style={{ color: 'var(--brand-subtle)' }}>Consultores</p>
                  <div className="flex flex-wrap gap-1.5">
                    {project.consultants!.map(u => <span key={u.id} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)' }}>{u.name}</span>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end px-5 py-3 border-t shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

// ─── Cost Modal ────────────────────────────────────────────────────────────────

function CostModal({ project, onClose }: { project: SustProject; onClose: () => void }) {
  const [summary, setSummary] = useState<CostSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<CostSummary>(`/projects/${project.id}/cost-summary`)
      .then(setSummary)
      .catch(() => toast.error('Erro ao carregar custos'))
      .finally(() => setLoading(false))
  }, [project.id])

  const hs = summary?.hours_summary
  const cc = summary?.cost_calculation
  const marginColor = cc ? (cc.margin >= 0 ? '#22c55e' : '#ef4444') : 'var(--brand-text)'
  const hoursUsedPct = hs ? Math.min(hs.hours_percentage, 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex flex-col rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Custo do Projeto</p>
            <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>{project.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="animate-pulse space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-xl" style={{ background: 'var(--brand-bg)' }} />)}
            </div>
          ) : !summary ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--brand-subtle)' }}>Dados não disponíveis</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Valor do Projeto', value: formatBRL(summary.project_info.project_value ?? 0), color: '#00F5FF' },
                  { label: 'Custo Total',       value: formatBRL(cc!.total_cost),                          color: '#f59e0b' },
                  { label: 'Margem',            value: formatBRL(cc!.margin),                               color: marginColor },
                  { label: 'Margem %',          value: `${cc!.margin_percentage.toFixed(1)}%`,             color: marginColor },
                ].map(c => (
                  <div key={c.label} className="rounded-xl p-3" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>{c.label}</p>
                    <p className="text-sm font-bold tabular-nums" style={{ color: c.color }}>{c.value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Horas</p>
                <div className="grid grid-cols-3 gap-4 text-xs mb-3">
                  <div><p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Disponíveis</p><p className="font-bold tabular-nums mt-0.5" style={{ color: 'var(--brand-text)' }}>{(hs!.total_available_hours ?? summary.project_info.total_available_hours ?? 0).toFixed(1)}h</p></div>
                  <div><p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Apontadas</p><p className="font-bold tabular-nums mt-0.5" style={{ color: 'var(--brand-text)' }}>{hs!.total_logged_hours.toFixed(1)}h</p></div>
                  <div><p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Saldo</p><p className="font-bold tabular-nums mt-0.5" style={{ color: (hs!.general_balance ?? hs!.remaining_hours) < 0 ? '#ef4444' : 'var(--brand-text)' }}>{(hs!.general_balance ?? hs!.remaining_hours).toFixed(1)}h</p></div>
                </div>
                <div className="w-full rounded-full h-1.5 mb-1" style={{ background: 'var(--brand-border)' }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${hoursUsedPct}%`, background: hoursUsedPct >= 90 ? '#ef4444' : hoursUsedPct >= 70 ? '#f59e0b' : '#22c55e' }} />
                </div>
                <p className="text-[10px] tabular-nums" style={{ color: 'var(--brand-subtle)' }}>{hoursUsedPct.toFixed(1)}% das horas utilizadas</p>
              </div>
              {summary.consultant_breakdown.length > 0 && (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                  <div className="px-4 py-3" style={{ background: 'var(--brand-surface)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Por Consultor</p>
                  </div>
                  <table className="w-full text-xs">
                    <thead><tr style={{ background: 'var(--brand-bg)', borderBottom: '1px solid var(--brand-border)' }}>
                      {['Consultor', 'Hs', 'Aprov.', 'Pend.', 'Custo'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {summary.consultant_breakdown.map((c, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--brand-border)' }}>
                          <td className="px-3 py-2 font-medium" style={{ color: 'var(--brand-text)' }}>{c.consultant_name}</td>
                          <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--brand-text)' }}>{c.total_hours.toFixed(1)}h</td>
                          <td className="px-3 py-2 tabular-nums" style={{ color: '#22c55e' }}>{c.approved_hours.toFixed(1)}h</td>
                          <td className="px-3 py-2 tabular-nums" style={{ color: '#f59e0b' }}>{c.pending_hours.toFixed(1)}h</td>
                          <td className="px-3 py-2 tabular-nums font-bold" style={{ color: 'var(--brand-text)' }}>{formatBRL(c.cost)}</td>
                        </tr>
                      ))}
                      <tr style={{ background: 'rgba(0,245,255,0.04)', borderTop: '1px solid var(--brand-border)' }}>
                        <td className="px-3 py-2 font-bold text-[11px] uppercase" style={{ color: 'var(--brand-subtle)' }} colSpan={4}>Total</td>
                        <td className="px-3 py-2 font-bold tabular-nums" style={{ color: '#00F5FF' }}>{formatBRL(cc!.total_cost)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end px-5 py-3 border-t shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SustentacaoProjetosPage() {
  const router = useRouter()
  const { user } = useAuth()

  const [projects, setProjects] = useState<SustProject[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [statusFilter, setStatusFilter] = useState('')
  const [saudeFilter, setSaudeFilter] = useState('')

  // Modals
  const [viewProject, setViewProject]       = useState<SustProject | null>(null)
  const [costProject, setCostProject]       = useState<SustProject | null>(null)
  const [messagesProject, setMessagesProject] = useState<SustProject | null>(null)

  // Unread messages
  const [unreadIds, setUnreadIds] = useState<Set<number>>(new Set())
  useEffect(() => {
    if (!user) return
    api.get<{ project_ids: number[] }>('/messages/unread-projects')
      .then(r => setUnreadIds(new Set(r.project_ids ?? [])))
      .catch(() => {})
  }, [user])

  useEffect(() => {
    setLoading(true)
    api.get<PaginatedResponse<SustProject>>('/projects?pageSize=200&gestao=true')
      .then(res => {
        const items = res.items ?? []
        // For coordinator sustentacao the API auto-scopes; for admin we filter client-side
        const isCoordenadorSust = user?.type === 'coordenador' && (user as any)?.coordinator_type === 'sustentacao'
        setProjects(isCoordenadorSust ? items : items.filter(isSustProject))
      })
      .catch(() => toast.error('Erro ao carregar projetos'))
      .finally(() => setLoading(false))
  }, [user])

  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (activeTab !== 'all' && getTab(p) !== activeTab) return false
      if (statusFilter && p.status !== statusFilter) return false
      if (saudeFilter) {
        const consumed = p.consumed_hours ?? (p.total_logged_minutes != null ? p.total_logged_minutes / 60 : 0)
        const pct = p.sold_hours ? (consumed / p.sold_hours) * 100 : 0
        if (healthColor(pct) !== saudeFilter) return false
      }
      if (search) {
        const q = search.toLowerCase()
        return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.customer?.name ?? '').toLowerCase().includes(q)
      }
      return true
    })
  }, [projects, activeTab, statusFilter, saudeFilter, search])

  const stats = useMemo(() => ({
    total:     filtered.length,
    ativos:    filtered.filter(p => ['active', 'started'].includes(p.status)).length,
    vendidas:  filtered.reduce((s, p) => s + (p.sold_hours ?? 0), 0),
    saldo:     filtered.reduce((s, p) => s + (p.general_hours_balance ?? 0), 0),
  }), [filtered])

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of projects) {
      const t = getTab(p)
      counts[t] = (counts[t] ?? 0) + 1
    }
    return counts
  }, [projects])

  return (
    <AppLayout>
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        <PageHeader
          icon={Headphones}
          title="Projetos de Sustentação"
          subtitle="Lista de projetos por tipo de contrato"
        />

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total',        value: String(stats.total),                       sub: 'projetos listados' },
            { label: 'Ativos',       value: String(stats.ativos),                      sub: 'em andamento' },
            { label: 'Hs Vendidas',  value: fmt(stats.vendidas),                       sub: 'horas contratadas' },
            { label: 'Saldo Total',  value: fmt(stats.saldo, 1) + ' h',               sub: stats.saldo < 0 ? 'saldo negativo' : 'horas disponíveis' },
          ].map(c => (
            <div key={c.label} className="rounded-2xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--brand-muted)' }}>{c.label}</p>
              <p className="text-xl font-bold tracking-tight" style={{ color: 'var(--brand-text)' }}>{c.value}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--brand-subtle)' }}>{c.sub}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b mb-5 overflow-x-auto" style={{ borderColor: 'var(--brand-border)' }}>
          {TABS.map(tab => {
            const count = tab.id === 'all' ? projects.length : (tabCounts[tab.id] ?? 0)
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                style={{
                  color: active ? '#00F5FF' : 'var(--brand-subtle)',
                  borderBottom: active ? '2px solid #00F5FF' : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                {tab.label}
                <span className="text-xs px-1.5 py-0.5 rounded-full" style={{
                  background: active ? 'rgba(0,245,255,0.12)' : 'rgba(255,255,255,0.06)',
                  color: active ? '#00F5FF' : 'var(--brand-subtle)',
                }}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-48 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--brand-subtle)' }} />
            <input
              type="text"
              placeholder="Buscar projeto, código ou cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 h-9 rounded-xl text-xs outline-none"
              style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
            />
          </div>
          {/* Status filter */}
          <div className="flex items-center gap-0.5 bg-zinc-800/70 border border-zinc-700/50 rounded-full p-1">
            {([
              { id: '',           label: 'Todos' },
              { id: 'started',    label: 'Em Andamento' },
              { id: 'paused',     label: 'Pausado' },
              { id: 'finished',   label: 'Finalizado' },
            ] as const).map(opt => (
              <button key={opt.id} type="button"
                onClick={() => setStatusFilter(opt.id)}
                className="px-3 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap"
                style={statusFilter === opt.id
                  ? { background: '#00F5FF', color: '#0A0A0B' }
                  : { color: '#71717A' }}>
                {opt.label}
              </button>
            ))}
          </div>
          {/* Saúde filter */}
          <div className="flex items-center gap-0.5 bg-zinc-800/70 border border-zinc-700/50 rounded-full p-1">
            {([
              { id: '',       label: 'Todos',    active: 'bg-cyan-400 text-zinc-900',  inactive: 'text-zinc-400 hover:text-zinc-200' },
              { id: 'green',  label: 'Saudável', active: 'bg-green-500 text-white',    inactive: 'text-green-500 hover:text-green-400' },
              { id: 'yellow', label: 'Atenção',  active: 'bg-amber-400 text-zinc-900', inactive: 'text-amber-400 hover:text-amber-300' },
              { id: 'red',    label: 'Crítico',  active: 'bg-red-500 text-white',      inactive: 'text-red-500 hover:text-red-400' },
            ] as const).map(opt => (
              <button key={opt.id} type="button"
                onClick={() => setSaudeFilter(opt.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${saudeFilter === opt.id ? opt.active : opt.inactive}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <Skeleton />
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
            <table className="w-full">
              <thead>
                <tr style={{ background: 'var(--brand-surface)', borderBottom: '1px solid var(--brand-border)' }}>
                  {[
                    { label: '',              w: 48 },
                    { label: '',              w: 8 },
                    { label: 'Projeto',       w: undefined },
                    { label: 'Cliente',       w: undefined },
                    { label: 'Tipo Contrato', w: undefined },
                    { label: 'Hs Vendidas',   w: 100 },
                    { label: 'Hs Consumidas', w: 110 },
                    { label: 'Saldo',         w: 80 },
                    { label: '% Uso',         w: 140 },
                    { label: 'Status',        w: undefined },
                  ].map(h => (
                    <th key={h.label} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)', width: h.w }}>{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-sm" style={{ color: 'var(--brand-subtle)' }}>
                      Nenhum projeto encontrado
                    </td>
                  </tr>
                ) : filtered.map(p => {
                  const consumed = p.consumed_hours ?? (p.total_logged_minutes != null ? p.total_logged_minutes / 60 : 0)
                  const pct   = p.sold_hours ? (consumed / p.sold_hours) * 100 : 0
                  const color = healthColor(pct)
                  const hs    = healthStyles[color]
                  const saldo = p.general_hours_balance
                  const ss    = STATUS_STYLE[p.status] ?? { bg: 'rgba(161,161,170,0.12)', color: '#A1A1AA' }
                  const hasUnread = unreadIds.has(p.id)

                  return (
                    <tr key={p.id} className="border-b transition-colors hover:bg-white/[0.015] cursor-pointer"
                      style={{ borderColor: 'var(--brand-border)' }}
                      onClick={() => setViewProject(p)}>
                      {/* Actions */}
                      <td className="py-2 pl-2 pr-1" style={{ width: 48 }} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <RowMenu items={[
                            { label: 'Visualizar',   icon: <Eye size={12} />,       onClick: () => setViewProject(p) },
                            { label: 'Custo',        icon: <DollarSign size={12} />, onClick: () => setCostProject(p) },
                            { label: 'Apontamentos', icon: <Clock size={12} />,     onClick: () => router.push(`/timesheets?project_id=${p.id}`) },
                            { label: 'Despesas',     icon: <BarChart2 size={12} />, onClick: () => router.push(`/expenses?project_id=${p.id}`) },
                          ]} />
                          <button
                            onClick={e => { e.stopPropagation(); setMessagesProject(p) }}
                            className="relative flex items-center justify-center w-7 h-7 rounded transition-colors"
                            style={hasUnread ? { color: '#00F5FF', background: 'rgba(0,245,255,0.12)' } : { color: '#52525B' }}
                            title="Mensagens"
                          >
                            <MessageCircle size={13} />
                            {hasUnread && (
                              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: '#00F5FF', boxShadow: '0 0 6px rgba(0,245,255,0.8)' }} />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Health bar */}
                      <td className="pl-0 pr-3 py-3" style={{ width: 8 }}>
                        <div className="w-1 h-10 rounded-full" style={{ background: hs.bar }} />
                      </td>

                      {/* Name */}
                      <td className="py-3 pr-4">
                        <p className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>{p.name}</p>
                        <p className="text-xs font-mono" style={{ color: 'var(--brand-subtle)' }}>{p.code}</p>
                      </td>

                      {/* Customer */}
                      <td className="py-3 pr-4 text-sm" style={{ color: 'var(--brand-muted)' }}>{p.customer?.name ?? '—'}</td>

                      {/* Contract type */}
                      <td className="py-3 pr-4 text-xs" style={{ color: 'var(--brand-subtle)' }}>
                        {p.contract_type_display ?? p.contract_type?.name ?? '—'}
                      </td>

                      {/* Hours sold */}
                      <td className="py-3 px-4 text-sm text-center tabular-nums" style={{ color: 'var(--brand-muted)' }}>{fmt(p.sold_hours)}</td>

                      {/* Hours consumed */}
                      <td className="py-3 px-4 text-sm text-center tabular-nums" style={{ color: 'var(--brand-muted)' }}>
                        {p.consumed_hours != null ? fmt(p.consumed_hours) : p.total_logged_minutes != null ? fmt(p.total_logged_minutes / 60, 1) : '—'}
                      </td>

                      {/* Balance */}
                      <td className="py-3 px-4 text-sm text-center tabular-nums font-semibold"
                        style={{ color: saldo != null && saldo < 0 ? '#ef4444' : 'var(--brand-text)' }}>
                        {saldo != null ? fmt(saldo, 1) : '—'}
                      </td>

                      {/* % usage + bar */}
                      <td className="py-3 px-4" style={{ minWidth: 140 }}>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: hs.bar }} />
                          </div>
                          <span className="text-xs tabular-nums w-9 text-center" style={{ color: hs.text }}>
                            {p.sold_hours ? `${Math.round(pct)}%` : '—'}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 whitespace-nowrap">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: ss.bg, color: ss.color }}>
                          {p.status_display ?? STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {viewProject && <ViewProjectModal project={viewProject} onClose={() => setViewProject(null)} />}
      {costProject  && <CostModal project={costProject} onClose={() => setCostProject(null)} />}

      {messagesProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="flex flex-col rounded-2xl w-full max-w-2xl max-h-[85vh]" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Mensagens</p>
                <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>{messagesProject.name}</p>
              </div>
              <button onClick={() => setMessagesProject(null)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ProjectMessages projectId={messagesProject.id} userRole={user?.type ?? undefined} />
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
