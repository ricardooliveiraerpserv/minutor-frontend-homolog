'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { Project, PaginatedResponse, HourContribution, ContractType } from '@/types'
import { formatBRL } from '@/lib/format'
import { toast } from 'sonner'
import { Layers, Search, ChevronDown, ChevronRight, Users, TrendingUp, Clock, BarChart2, AlertTriangle, DollarSign, X, UserCheck, Pencil, Trash2, Plus, Edit2 } from 'lucide-react'
import { PageHeader } from '@/components/ds'
import { RowMenu } from '@/components/ui/row-menu'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ProjectWithTeam extends Project {
  consultants?: { id: number; name: string; email: string }[]
  coordinators?: { id: number; name: string; email: string }[]
  child_projects?: ProjectWithTeam[]
}

interface TreeRow extends ProjectWithTeam {
  _level: number
  _hasChildren: boolean
  _isExpanded: boolean
  _parentId: number | null
}

function toTreeRow(p: ProjectWithTeam, level = 0, parentId: number | null = null): TreeRow {
  // Auto-expande o pai se algum filho estiver ativo (node_state !== 'DISABLED')
  const hasActiveChild = level === 0 && (p.child_projects ?? []).some(c => c.node_state !== 'DISABLED')
  return { ...p, _level: level, _hasChildren: (p.child_projects?.length ?? 0) > 0, _isExpanded: hasActiveChild, _parentId: parentId }
}

interface CostSummary {
  project_info: { project_value?: number | null; initial_cost?: number | null; total_available_hours?: number; weighted_hourly_rate?: number }
  hours_summary: { total_logged_hours: number; approved_hours: number; pending_hours: number; remaining_hours: number; general_balance?: number; total_available_hours?: number; hours_percentage: number }
  cost_calculation: { total_cost: number; approved_cost: number; pending_cost: number; margin: number; margin_percentage: number }
  consultant_breakdown: { consultant_name: string; total_hours: number; approved_hours: number; pending_hours: number; cost: number; consultant_hourly_rate?: number; consultant_rate_type?: string }[]
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
  background: 'var(--brand-bg)',
  border: '1px solid var(--brand-border)',
  color: 'var(--brand-text)',
}

// ─── SearchSelect ─────────────────────────────────────────────────────────────

function SearchSelect({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void
  options: { id: number | string; name: string }[]; placeholder: string
}) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const ref      = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = options.find(o => String(o.id) === value)
  const filtered = options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  useEffect(() => { if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 50) } }, [open])

  const select = (id: string) => { onChange(id); setOpen(false) }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`h-8 flex items-center justify-between gap-1 px-2 text-xs bg-zinc-800 border border-zinc-700 rounded-md outline-none hover:border-zinc-500 transition-colors whitespace-nowrap ${selected ? 'text-zinc-200' : 'text-zinc-500'}`}>
        <span className="truncate">{selected ? selected.name : placeholder}</span>
        <ChevronRight size={12} className="rotate-90 shrink-0 text-zinc-500" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 min-w-full min-w-52 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-zinc-700">
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar..."
              className="w-full h-7 px-2 text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 rounded outline-none placeholder:text-zinc-600 focus:border-zinc-500" />
          </div>
          <div className="max-h-52 overflow-y-auto py-0.5">
            <button type="button" onClick={() => select('')}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${!value ? 'text-cyan-400 bg-zinc-800' : 'text-zinc-400 hover:bg-zinc-800'}`}>{placeholder}</button>
            {filtered.length === 0
              ? <p className="px-3 py-2 text-xs text-zinc-600 italic">Nenhum resultado</p>
              : filtered.map(o => (
                <button key={o.id} type="button" onClick={() => select(String(o.id))}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${String(o.id) === value ? 'text-cyan-400 bg-zinc-800' : 'text-zinc-200 hover:bg-zinc-800'}`}>
                  {o.name}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SimpleSelect ─────────────────────────────────────────────────────────────

function SimpleSelect({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void
  options: { id: string; name: string }[]; placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.id === value)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const select = (id: string) => { onChange(id); setOpen(false) }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`h-8 flex items-center justify-between gap-1 px-2 text-xs bg-zinc-800 border border-zinc-700 rounded-md outline-none hover:border-zinc-500 transition-colors whitespace-nowrap ${selected ? 'text-zinc-200' : 'text-zinc-500'}`}>
        <span>{selected ? selected.name : placeholder}</span>
        <ChevronRight size={12} className="rotate-90 shrink-0 text-zinc-500" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 min-w-full bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
          <div className="max-h-52 overflow-y-auto py-0.5">
            <button type="button" onClick={() => select('')}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${!value ? 'text-cyan-400 bg-zinc-800' : 'text-zinc-400 hover:bg-zinc-800'}`}>{placeholder}</button>
            {options.map(o => (
              <button key={o.id} type="button" onClick={() => select(o.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${o.id === value ? 'text-cyan-400 bg-zinc-800' : 'text-zinc-200 hover:bg-zinc-800'}`}>
                {o.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
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
  onMenuAction: (action: 'costs' | 'timesheets' | 'expenses' | 'team' | 'aportes', project: ProjectWithTeam) => void
  treeRow?: TreeRow
  onTreeToggle?: () => void
  canEdit?: boolean
  onEdit?: (project: ProjectWithTeam) => void
}

function ProjectRow({ project, expanded, onToggle, onMenuAction, treeRow, onTreeToggle, canEdit, onEdit }: ProjectRowProps) {
  const consumedHours = project.consumed_hours ?? (project.total_logged_minutes != null ? project.total_logged_minutes / 60 : 0)
  const pct   = project.sold_hours ? (consumedHours / project.sold_hours) * 100 : 0
  const color = healthColor(pct)
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

  const isChild    = treeRow ? treeRow._level > 0 : false
  const isInactive = isChild && project.node_state === 'DISABLED'
  const isActive   = isChild && project.node_state !== 'DISABLED'

  // Pai sem alocação direta — aparece como container da hierarquia mas esmaecido
  const isParentIndirect = !isChild && treeRow?._hasChildren && (project as any).coordinator_is_direct === false

  // Fundo: filho ativo → cyan sutil, filho inativo → roxo apagado, pai indireto → levemente opaco, pai direto → transparente
  const rowBg = isChild
    ? (isActive ? 'rgba(0,245,255,0.04)' : 'rgba(139,92,246,0.05)')
    : isParentIndirect ? 'rgba(255,255,255,0.01)' : undefined

  // Borda esquerda
  const rowBorderLeft = isChild
    ? (isActive ? '3px solid rgba(0,245,255,0.5)' : '3px solid rgba(139,92,246,0.3)')
    : isParentIndirect ? '3px solid rgba(255,255,255,0.08)' : undefined

  return (
    <>
      <tr
        className="border-b transition-all cursor-pointer"
        style={{
          borderColor: 'var(--brand-border)',
          background: rowBg,
          borderLeft: rowBorderLeft,
          opacity: isInactive ? 0.45 : isParentIndirect ? 0.65 : 1,
        }}
        onClick={treeRow ? (treeRow._hasChildren ? onTreeToggle : undefined) : onToggle}
      >
        {/* Menu de ações — oculto para filhos inativos e pais indiretos */}
        <td className="py-2 pl-2 pr-1 w-8" onClick={e => e.stopPropagation()}>
          {!isInactive && !isParentIndirect && (
            <RowMenu items={[
              ...(canEdit ? [{ label: 'Editar', icon: <Edit2 size={12} />, onClick: () => onEdit?.(project) }] : []),
              { label: 'Custo',                  icon: <DollarSign  size={12} />, onClick: () => onMenuAction('costs',      project) },
              { label: 'Apontamentos',           icon: <Clock       size={12} />, onClick: () => onMenuAction('timesheets', project) },
              { label: 'Despesas',               icon: <BarChart2   size={12} />, onClick: () => onMenuAction('expenses',   project) },
              { label: 'Aportes',                icon: <TrendingUp  size={12} />, onClick: () => onMenuAction('aportes',    project) },
              { label: 'Selecionar Equipe',      icon: <Users       size={12} />, onClick: () => onMenuAction('team',       project) },
            ]} />
          )}
        </td>

        {/* Indicador de saúde (borda esquerda) */}
        <td className="pl-0 pr-3 py-3 w-1">
          <div className="w-1 h-10 rounded-full ml-0" style={{ background: hs.bar }} />
        </td>

        {/* Projeto */}
        <td className="py-3 pr-4" style={{ paddingLeft: treeRow ? 8 + treeRow._level * 24 : 8 }}>
          <div className="flex items-center gap-2">
            {treeRow ? (
              treeRow._hasChildren ? (
                // Pai com filhos: chevron ▶/▼
                <button
                  onClick={e => { e.stopPropagation(); onTreeToggle?.() }}
                  className="w-5 h-5 flex items-center justify-center shrink-0 transition-colors rounded hover:bg-white/10"
                  style={{ color: 'var(--brand-muted)' }}
                >
                  {treeRow._isExpanded
                    ? <ChevronDown size={14} />
                    : <ChevronRight size={14} />
                  }
                </button>
              ) : isChild ? (
                // Filho: conector └─
                <span className="shrink-0 flex items-center" style={{ width: 20, color: 'rgba(255,255,255,0.15)', fontSize: 14, lineHeight: 1 }}>└─</span>
              ) : (
                <span className="w-5 shrink-0" />
              )
            ) : (
              teamCount > 0
                ? (expanded
                    ? <ChevronDown size={14} style={{ color: 'var(--brand-subtle)' }} />
                    : <ChevronRight size={14} style={{ color: 'var(--brand-subtle)' }} />)
                : <span className="w-3.5" />
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold" style={{ color: isInactive ? 'var(--brand-muted)' : 'var(--brand-text)' }}>
                  {project.name}
                </p>
                {treeRow && treeRow._level === 0 && treeRow._hasChildren && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: 'rgba(0,245,255,0.12)', color: '#00F5FF' }}>PAI</span>
                )}
                {isParentIndirect && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-subtle)' }}>via filho</span>
                )}
                {isActive && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: 'rgba(0,245,255,0.12)', color: '#00F5FF' }}>ATIVO</span>
                )}
                {isInactive && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}>FILHO</span>
                )}
              </div>
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

      {/* Expansão: equipe (apenas no modo flat, não em filhos) */}
      {!treeRow && expanded && teamCount > 0 && (
        <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
          <td /><td />
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
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.type === 'admin'
  const ep = user?.extra_permissions ?? []
  const canEdit = isAdmin || ep.includes('gestao_projetos.update')

  const [projects, setProjects]   = useState<ProjectWithTeam[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState('')
  const [clienteFilter, setCliente] = useState('')
  const [saudeFilter, setSaude]   = useState('')
  const [expanded, setExpanded]   = useState<Set<number>>(new Set())
  const [multiContratual, setMultiContratual] = useState(false)
  const [rows, setRows]           = useState<TreeRow[]>([])
  const [filterContractType, setFilterContractType] = useState('')
  const [filterContractTypes, setFilterContractTypes] = useState<ContractType[]>([])

  // Modal de custos
  const [costProject, setCostProject]   = useState<ProjectWithTeam | null>(null)
  const [costSummary, setCostSummary]   = useState<CostSummary | null>(null)
  const [costLoading, setCostLoading]   = useState(false)

  // Modal de equipe
  const [teamProject, setTeamProject]         = useState<ProjectWithTeam | null>(null)
  const [allConsultants, setAllConsultants]   = useState<{ id: number; name: string }[]>([])
  const [selectedIds, setSelectedIds]         = useState<Set<number>>(new Set())
  const [teamSaving, setTeamSaving]           = useState(false)
  const [teamSearch, setTeamSearch]           = useState('')
  const [teamTab, setTeamTab]                 = useState<'consultores' | 'grupos'>('consultores')
  const [consultantGroups, setConsultantGroups] = useState<{ id: number; name: string }[]>([])
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set())

  // Modal de aportes
  const [aportesProject, setAportesProject]   = useState<ProjectWithTeam | null>(null)
  const [contributions, setContributions]     = useState<HourContribution[]>([])
  const [contribLoading, setContribLoading]   = useState(false)
  const [contribModal, setContribModal]       = useState<{ open: boolean; item?: HourContribution }>({ open: false })
  const [contribForm, setContribForm]         = useState({ contributed_hours: '', hourly_rate: '', contributed_at: '', description: '' })
  const [contribSaving, setContribSaving]     = useState(false)
  const [contribDeleteConfirm, setContribDeleteConfirm] = useState<HourContribution | null>(null)

  // Carrega tipos de contrato para as pills
  useEffect(() => {
    api.get<any>('/contract-types?pageSize=200&active=1')
      .then(res => {
        const items = Array.isArray(res?.items) ? res.items : Array.isArray(res?.data) ? res.data : []
        setFilterContractTypes(items)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams({ pageSize: '200', gestao: 'true' })
    if (multiContratual) qs.set('parent_projects_only', 'true')
    if (!multiContratual && filterContractType) qs.set('contract_type_id', filterContractType)
    api.get<PaginatedResponse<ProjectWithTeam>>(`/projects?${qs}`)
      .then(res => {
        const items = res.items ?? []
        setProjects(items)
        if (multiContratual) {
          // Constrói a lista já com filhos expandidos para pais que auto-expandem
          const built: TreeRow[] = []
          for (const p of items) {
            const parent = toTreeRow(p)
            built.push(parent)
            if (parent._isExpanded && parent._hasChildren) {
              built.push(...(p.child_projects ?? []).map(c => toTreeRow(c, 1, p.id)))
            }
          }
          setRows(built)
        }
      })
      .catch(() => toast.error('Erro ao carregar projetos'))
      .finally(() => setLoading(false))
  }, [multiContratual, filterContractType])

  const clientes = useMemo(() => {
    const seen = new Set<string>()
    return projects
      .filter(p => p.customer?.name)
      .map(p => ({ id: String(p.customer_id), name: p.customer!.name }))
      .filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [projects])

  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (statusFilter && p.status !== statusFilter) return false
      if (clienteFilter && String(p.customer_id) !== clienteFilter) return false
      if (saudeFilter) {
        const consumed = p.consumed_hours ?? (p.total_logged_minutes != null ? p.total_logged_minutes / 60 : 0)
        const pct = p.sold_hours ? (consumed / p.sold_hours) * 100 : 0
        const color = healthColor(pct)
        if (color !== saudeFilter) return false
      }
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
  }, [projects, search, statusFilter, clienteFilter, saudeFilter])

  // ── Tree expand/collapse ──
  const toggleTree = (row: TreeRow) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === row.id && r._level === 0)
      if (idx === -1) return prev
      if (row._isExpanded) {
        const next = prev.filter(r => r._parentId !== row.id)
        const pIdx = next.findIndex(r => r.id === row.id && r._level === 0)
        if (pIdx !== -1) next[pIdx] = { ...row, _isExpanded: false }
        return [...next]
      } else {
        const children = (row.child_projects ?? []).map(child => toTreeRow(child, 1, row.id))
        const updated = { ...row, _isExpanded: true }
        return [...prev.slice(0, idx), updated, ...children, ...prev.slice(idx + 1)]
      }
    })
  }

  // ── Linhas filtradas em modo multi ──
  const filteredRows = useMemo(() => {
    if (!multiContratual) return [] as TreeRow[]
    const parentRows = rows.filter(r => r._level === 0)
    const filteredParents = parentRows.filter(p => {
      if (statusFilter && p.status !== statusFilter) return false
      if (clienteFilter && String(p.customer_id) !== clienteFilter) return false
      if (saudeFilter) {
        const consumed = p.consumed_hours ?? (p.total_logged_minutes != null ? p.total_logged_minutes / 60 : 0)
        const pct = p.sold_hours ? (consumed / p.sold_hours) * 100 : 0
        if (healthColor(pct) !== saudeFilter) return false
      }
      if (search) {
        const q = search.toLowerCase()
        if (!p.name.toLowerCase().includes(q) && !p.code.toLowerCase().includes(q) && !(p.customer?.name ?? '').toLowerCase().includes(q)) return false
      }
      return true
    })
    const result: TreeRow[] = []
    for (const parent of filteredParents) {
      const live = rows.find(r => r.id === parent.id && r._level === 0) ?? parent
      result.push(live)
      if (live._isExpanded) result.push(...rows.filter(r => r._parentId === live.id && r._level > 0))
    }
    return result
  }, [rows, multiContratual, statusFilter, clienteFilter, saudeFilter, search])

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

  const loadContributions = async (projectId: number) => {
    setContribLoading(true)
    try {
      const r = await api.get<{ items: HourContribution[] }>(`/projects/${projectId}/hour-contributions`)
      setContributions((r.items ?? []).map(c => ({ ...c, total_value: c.contributed_hours * c.hourly_rate })))
    } catch { toast.error('Erro ao carregar aportes') }
    finally { setContribLoading(false) }
  }

  const saveContrib = async () => {
    if (!aportesProject) return
    if (!contribForm.contributed_hours || !contribForm.hourly_rate || !contribForm.contributed_at) {
      toast.error('Preencha horas, valor/hora e data'); return
    }
    setContribSaving(true)
    try {
      const payload = {
        contributed_hours: Number(contribForm.contributed_hours),
        hourly_rate: Number(contribForm.hourly_rate),
        contributed_at: contribForm.contributed_at,
        description: contribForm.description || null,
      }
      if (contribModal.item) {
        await api.put(`/projects/${aportesProject.id}/hour-contributions/${contribModal.item.id}`, payload)
        toast.success('Aporte atualizado')
      } else {
        await api.post(`/projects/${aportesProject.id}/hour-contributions`, payload)
        toast.success('Aporte adicionado')
      }
      setContribModal({ open: false })
      loadContributions(aportesProject.id)
    } catch { toast.error('Erro ao salvar aporte') }
    finally { setContribSaving(false) }
  }

  const doDeleteContrib = async (c: HourContribution) => {
    if (!aportesProject) return
    try {
      await api.delete(`/projects/${aportesProject.id}/hour-contributions/${c.id}`)
      toast.success('Aporte excluído')
      setContribDeleteConfirm(null)
      loadContributions(aportesProject.id)
    } catch { toast.error('Erro ao excluir aporte') }
  }

  const handleMenuAction = async (action: 'costs' | 'timesheets' | 'expenses' | 'team' | 'aportes', project: ProjectWithTeam) => {
    if (action === 'timesheets') { router.push(`/timesheets?project_id=${project.id}`); return }
    if (action === 'expenses')   { router.push(`/expenses?project_id=${project.id}`);   return }
    if (action === 'costs') {
      setCostProject(project)
      setCostSummary(null)
      setCostLoading(true)
      try {
        const r = await api.get<CostSummary>(`/projects/${project.id}/cost-summary`)
        setCostSummary(r)
      } catch { toast.error('Erro ao carregar custos') }
      finally { setCostLoading(false) }
    }
    if (action === 'team') {
      setTeamProject(project)
      setTeamSearch('')
      setTeamTab('consultores')
      setSelectedIds(new Set((project.consultants ?? []).map(c => c.id)))
      setSelectedGroupIds(new Set())
      try {
        const promises: Promise<void>[] = []
        if (allConsultants.length === 0) {
          promises.push(
            api.get<{ items: { id: number; name: string }[] }>('/users?type=consultor&pageSize=200')
              .then(r => setAllConsultants(r.items ?? []))
          )
        }
        if (consultantGroups.length === 0) {
          promises.push(
            api.get<{ data: { id: number; name: string }[] }>('/consultant-groups?pageSize=200')
              .then(r => setConsultantGroups(r.data ?? []))
          )
        }
        await Promise.all(promises)
      } catch { toast.error('Erro ao carregar dados da equipe') }
    }
    if (action === 'aportes') {
      setAportesProject(project)
      setContributions([])
      setContribModal({ open: false })
      loadContributions(project.id)
    }
  }

  const saveTeam = async () => {
    if (!teamProject) return
    setTeamSaving(true)
    try {
      await api.put(`/projects/${teamProject.id}`, {
        consultant_ids: [...selectedIds],
        consultant_group_ids: [...selectedGroupIds],
      })
      toast.success('Equipe atualizada')
      setTeamProject(null)
      // Atualiza localmente
      setProjects(prev => prev.map(p => p.id === teamProject.id
        ? { ...p, consultants: allConsultants.filter(c => selectedIds.has(c.id)).map(c => ({ ...c, email: '' })) }
        : p
      ))
    } catch { toast.error('Erro ao salvar equipe') }
    finally { setTeamSaving(false) }
  }

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
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-48 max-w-xs">
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
          <SearchSelect
            value={clienteFilter}
            onChange={v => setCliente(v)}
            options={clientes.map(c => ({ id: c.id, name: c.name }))}
            placeholder="Todos os clientes"
          />
          <SimpleSelect
            value={statusFilter}
            onChange={v => setStatus(v)}
            placeholder="Todos os status"
            options={[
              { id: 'started',       name: 'Em Andamento' },
              { id: 'active',        name: 'Ativo' },
              { id: 'awaiting_start',name: 'Aguardando Início' },
              { id: 'paused',        name: 'Pausado' },
              { id: 'finished',      name: 'Finalizado' },
              { id: 'cancelled',     name: 'Cancelado' },
            ]}
          />
          {/* Filtro de Saúde — button group colorido */}
          <div className="flex items-center gap-0.5 bg-zinc-800/70 border border-zinc-700/50 rounded-full p-1">
            {([
              { id: '',       label: 'Todos',    active: 'bg-cyan-400 text-zinc-900',   inactive: 'text-zinc-400 hover:text-zinc-200' },
              { id: 'green',  label: 'Saudável', active: 'bg-green-500 text-white',     inactive: 'text-green-500 hover:text-green-400' },
              { id: 'yellow', label: 'Atenção',  active: 'bg-amber-400 text-zinc-900',  inactive: 'text-amber-400 hover:text-amber-300' },
              { id: 'red',    label: 'Crítico',  active: 'bg-red-500 text-white',       inactive: 'text-red-500 hover:text-red-400' },
            ] as const).map(opt => (
              <button key={opt.id} type="button"
                onClick={() => setSaude(opt.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${saudeFilter === opt.id ? opt.active : opt.inactive}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Linha 2: Multi-contratual + pills de tipo de contrato */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Botão Multi-contratual */}
          <button
            onClick={() => { setMultiContratual(v => !v); setFilterContractType('') }}
            className="px-4 py-1.5 rounded-xl text-xs font-bold transition-all"
            style={multiContratual
              ? { background: 'var(--brand-primary)', color: '#0A0A0B', boxShadow: '0 0 12px rgba(0,245,255,0.35)' }
              : { background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)', border: '1px solid rgba(0,245,255,0.25)' }
            }
          >
            ⬡ Multi-contratual
          </button>

          {/* Pills de tipo de contrato */}
          <div
            className="flex items-center gap-1 p-1 rounded-xl w-fit flex-wrap"
            style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}
          >
            <button
              onClick={() => { setFilterContractType(''); setMultiContratual(false) }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={!filterContractType && !multiContratual
                ? { background: 'var(--brand-primary)', color: '#0A0A0B' }
                : { color: 'var(--brand-muted)' }}
            >
              Todos
            </button>
            {filterContractTypes.map(ct => (
              <button
                key={ct.id}
                onClick={() => { setFilterContractType(String(ct.id)); setMultiContratual(false) }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={filterContractType === String(ct.id)
                  ? { background: 'var(--brand-primary)', color: '#0A0A0B' }
                  : { color: 'var(--brand-muted)' }}
              >
                {ct.name}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tabela ── */}
        {(() => {
          const displayList = multiContratual ? filteredRows : filtered
          return loading ? (
            <Skeleton />
          ) : displayList.length === 0 ? (
            <div className="text-center py-20" style={{ color: 'var(--brand-subtle)' }}>
              <Layers size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum projeto encontrado</p>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
              <table className="w-full text-left">
                <thead>
                  <tr style={{ background: 'var(--brand-surface)', borderBottom: '1px solid var(--brand-border)' }}>
                    <th className="w-8 pl-2" />
                    <th className="w-1" />
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
                  {displayList.map(project => {
                    const tr = multiContratual ? (project as TreeRow) : undefined
                    return (
                      <ProjectRow
                        key={multiContratual
                          ? `${project.id}-${(project as TreeRow)._level}-${(project as TreeRow)._parentId}`
                          : project.id}
                        project={project}
                        expanded={expanded.has(project.id)}
                        onToggle={() => toggleExpand(project.id)}
                        onMenuAction={handleMenuAction}
                        treeRow={tr}
                        onTreeToggle={tr ? () => toggleTree(tr) : undefined}
                        canEdit={canEdit}
                        onEdit={p => router.push(`/projects?editId=${p.id}`)}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })()}

        {/* ── Legenda ── */}
        {!loading && (multiContratual ? filteredRows : filtered).length > 0 && (
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
      {/* ── Modal de Custos ── */}
      {costProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="flex flex-col rounded-2xl w-full max-w-2xl max-h-[90vh]" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>{costProject.code}</p>
                <h2 className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>{costProject.name}</h2>
              </div>
              <button onClick={() => setCostProject(null)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {costLoading && <p className="text-xs text-center py-8" style={{ color: 'var(--brand-subtle)' }}>Calculando custos...</p>}
              {!costLoading && !costSummary && <p className="text-xs text-center py-8" style={{ color: 'var(--brand-subtle)' }}>Nenhum dado disponível.</p>}
              {!costLoading && costSummary && (() => {
                const { project_info: pi, hours_summary: hs, cost_calculation: cc, consultant_breakdown: cb } = costSummary
                const marginColor = cc.margin_percentage >= 30 ? '#22c55e' : cc.margin_percentage >= 10 ? '#f59e0b' : '#ef4444'
                const hoursUsedPct = Math.min(100, Math.max(0, hs.hours_percentage ?? 0))
                const hoursBarColor = hoursUsedPct >= 90 ? '#ef4444' : hoursUsedPct >= 70 ? '#f59e0b' : '#22c55e'
                return (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Valor do Projeto', value: formatBRL(pi.project_value ?? 0),      icon: DollarSign, color: '#00F5FF' },
                        { label: 'Custo Total',       value: formatBRL(cc.total_cost),              icon: TrendingUp,  color: '#f59e0b' },
                        { label: 'Margem',            value: formatBRL(cc.margin),                  icon: BarChart2,   color: marginColor },
                        { label: 'Margem %',          value: `${cc.margin_percentage.toFixed(1)}%`, icon: BarChart2,   color: marginColor },
                      ].map(c => (
                        <div key={c.label} className="rounded-xl p-3" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
                          <div className="flex items-center gap-2 mb-1"><c.icon size={12} style={{ color: c.color }} /><p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{c.label}</p></div>
                          <p className="text-sm font-bold tabular-nums" style={{ color: c.color }}>{c.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl p-4" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Monitoramento de Horas</p>
                      <div className="grid grid-cols-3 gap-4 text-xs mb-3">
                        <div><p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Disponíveis</p><p className="font-bold tabular-nums mt-0.5" style={{ color: 'var(--brand-text)' }}>{(hs.total_available_hours ?? pi.total_available_hours ?? 0).toFixed(1)}h</p></div>
                        <div><p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Apontadas</p><p className="font-bold tabular-nums mt-0.5" style={{ color: 'var(--brand-text)' }}>{hs.total_logged_hours.toFixed(1)}h</p></div>
                        <div><p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Saldo</p><p className="font-bold tabular-nums mt-0.5" style={{ color: (hs.general_balance ?? hs.remaining_hours) < 0 ? '#ef4444' : 'var(--brand-text)' }}>{(hs.general_balance ?? hs.remaining_hours).toFixed(1)}h</p></div>
                        <div><p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Aprovadas</p><p className="font-bold tabular-nums mt-0.5" style={{ color: '#22c55e' }}>{hs.approved_hours.toFixed(1)}h</p></div>
                        <div><p className="text-[10px]" style={{ color: 'var(--brand-subtle)' }}>Pendentes</p><p className="font-bold tabular-nums mt-0.5" style={{ color: '#f59e0b' }}>{hs.pending_hours.toFixed(1)}h</p></div>
                      </div>
                      <div className="w-full rounded-full h-1.5 mb-1" style={{ background: 'var(--brand-border)' }}><div className="h-1.5 rounded-full transition-all" style={{ width: `${hoursUsedPct}%`, background: hoursBarColor }} /></div>
                      <p className="text-[10px] tabular-nums" style={{ color: 'var(--brand-subtle)' }}>{hoursUsedPct.toFixed(1)}% das horas utilizadas</p>
                    </div>
                    {cb.length > 0 && (
                      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                        <div className="px-4 py-3" style={{ background: 'var(--brand-surface)' }}><p className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--brand-subtle)' }}><UserCheck size={11} />Custo por Consultor</p></div>
                        <table className="w-full text-xs">
                          <thead><tr style={{ background: 'var(--brand-bg)', borderBottom: '1px solid var(--brand-border)' }}>{['Consultor','Hs Total','Aprovadas','Pendentes','Taxa/h','Custo'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {cb.map((c, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid var(--brand-border)' }}>
                                <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--brand-text)' }}>{c.consultant_name}</td>
                                <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--brand-text)' }}>{c.total_hours.toFixed(1)}h</td>
                                <td className="px-3 py-2.5 tabular-nums" style={{ color: '#22c55e' }}>{c.approved_hours.toFixed(1)}h</td>
                                <td className="px-3 py-2.5 tabular-nums" style={{ color: '#f59e0b' }}>{c.pending_hours.toFixed(1)}h</td>
                                <td className="px-3 py-2.5 tabular-nums text-[11px]" style={{ color: 'var(--brand-muted)' }}>{c.consultant_hourly_rate != null ? formatBRL(c.consultant_hourly_rate) : '—'}{c.consultant_rate_type === 'monthly' && <span className="ml-1 opacity-60">÷180</span>}</td>
                                <td className="px-3 py-2.5 tabular-nums font-bold" style={{ color: 'var(--brand-text)' }}>{formatBRL(c.cost)}</td>
                              </tr>
                            ))}
                            <tr style={{ background: 'rgba(0,245,255,0.04)', borderTop: '1px solid var(--brand-border)' }}>
                              <td className="px-3 py-2.5 font-bold text-[11px] uppercase" style={{ color: 'var(--brand-subtle)' }} colSpan={5}>Total</td>
                              <td className="px-3 py-2.5 font-bold tabular-nums" style={{ color: 'var(--brand-primary)' }}>{formatBRL(cc.total_cost)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
            <div className="flex justify-end px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--brand-border)' }}>
              <button onClick={() => setCostProject(null)} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Equipe ── */}
      {teamProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="flex flex-col rounded-2xl w-full max-w-md max-h-[80vh]" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Equipe</p>
                <h2 className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>{teamProject.name}</h2>
              </div>
              <button onClick={() => setTeamProject(null)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
            </div>
            {/* Tabs */}
            <div className="flex border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
              {(['consultores', 'grupos'] as const).map(tab => (
                <button key={tab} onClick={() => setTeamTab(tab)}
                  className={`px-5 py-2.5 text-xs font-semibold capitalize transition-colors ${teamTab === tab ? 'border-b-2 border-cyan-400 text-cyan-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                  style={{ marginBottom: -1 }}>
                  {tab === 'consultores' ? 'Consultores' : 'Grupos de Consultores'}
                </button>
              ))}
            </div>
            <div className="px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--brand-subtle)' }} />
                <input value={teamSearch} onChange={e => setTeamSearch(e.target.value)}
                  placeholder={teamTab === 'consultores' ? 'Buscar consultor...' : 'Buscar grupo...'}
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {teamTab === 'consultores' && allConsultants.filter(c => c.name.toLowerCase().includes(teamSearch.toLowerCase())).map(c => (
                <label key={c.id} className="flex items-center gap-3 py-2 px-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors">
                  <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => setSelectedIds(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n })} className="w-4 h-4 rounded accent-cyan-400" />
                  <span className="text-sm" style={{ color: 'var(--brand-text)' }}>{c.name}</span>
                </label>
              ))}
              {teamTab === 'grupos' && consultantGroups.filter(g => g.name.toLowerCase().includes(teamSearch.toLowerCase())).map(g => (
                <label key={g.id} className="flex items-center gap-3 py-2 px-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors">
                  <input type="checkbox" checked={selectedGroupIds.has(g.id)} onChange={() => setSelectedGroupIds(prev => { const n = new Set(prev); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n })} className="w-4 h-4 rounded accent-cyan-400" />
                  <span className="text-sm" style={{ color: 'var(--brand-text)' }}>{g.name}</span>
                </label>
              ))}
              {teamTab === 'grupos' && consultantGroups.length === 0 && (
                <p className="text-xs text-center py-6" style={{ color: 'var(--brand-subtle)' }}>Nenhum grupo disponível</p>
              )}
            </div>
            <div className="flex justify-between items-center px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--brand-border)' }}>
              <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
                {selectedIds.size} consultor(es) · {selectedGroupIds.size} grupo(s)
              </span>
              <div className="flex gap-2">
                <button onClick={() => setTeamProject(null)} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Cancelar</button>
                <button onClick={saveTeam} disabled={teamSaving} className="px-4 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50" style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)', border: '1px solid rgba(0,245,255,0.2)' }}>{teamSaving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Aportes ── */}
      {aportesProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="flex flex-col rounded-2xl w-full max-w-2xl max-h-[90vh]" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>Aportes de Horas</p>
                <h2 className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>{aportesProject.name}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  setContribForm({ contributed_hours: '', hourly_rate: '', contributed_at: new Date().toISOString().slice(0, 10), description: '' })
                  setContribModal({ open: true })
                }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:opacity-90"
                  style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)', border: '1px solid rgba(0,245,255,0.2)' }}>
                  <Plus size={12} /> Adicionar
                </button>
                <button onClick={() => { setAportesProject(null); setContribModal({ open: false }) }} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {contribLoading && <p className="text-xs text-center py-8" style={{ color: 'var(--brand-subtle)' }}>Carregando aportes...</p>}
              {!contribLoading && contributions.length === 0 && (
                <div className="text-center py-10">
                  <TrendingUp size={32} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--brand-subtle)' }} />
                  <p className="text-sm" style={{ color: 'var(--brand-subtle)' }}>Nenhum aporte registrado</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--brand-subtle)' }}>Clique em "+ Adicionar" para registrar</p>
                </div>
              )}
              {!contribLoading && contributions.length > 0 && (() => {
                const totalHoras = contributions.reduce((s, c) => s + c.contributed_hours, 0)
                const totalValor = contributions.reduce((s, c) => s + c.contributed_hours * c.hourly_rate, 0)
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl p-3" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Total de Horas</p>
                        <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--brand-primary)' }}>{totalHoras.toFixed(1)}h</p>
                      </div>
                      <div className="rounded-xl p-3" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Valor Total</p>
                        <p className="text-lg font-bold tabular-nums" style={{ color: '#f59e0b' }}>{totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                      </div>
                    </div>
                    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: 'var(--brand-surface)', borderBottom: '1px solid var(--brand-border)' }}>
                            {['Data','Horas','Valor/h','Total','Descrição',''].map(h => (
                              <th key={h} className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {contributions.map(c => (
                            <tr key={c.id} style={{ borderBottom: '1px solid var(--brand-border)' }}>
                              <td className="px-3 py-2.5 tabular-nums whitespace-nowrap" style={{ color: 'var(--brand-muted)' }}>
                                {c.contributed_at ? c.contributed_at.slice(0, 10).split('-').reverse().join('/') : '—'}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: 'var(--brand-primary)' }}>{c.contributed_hours.toFixed(1)}h</td>
                              <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--brand-muted)' }}>{c.hourly_rate.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                              <td className="px-3 py-2.5 tabular-nums font-bold" style={{ color: 'var(--brand-text)' }}>{(c.contributed_hours * c.hourly_rate).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                              <td className="px-3 py-2.5 max-w-[160px] truncate" style={{ color: 'var(--brand-muted)' }}>{c.description ?? '—'}</td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1">
                                  <button onClick={() => {
                                    setContribModal({ open: true, item: c })
                                    setContribForm({
                                      contributed_hours: String(c.contributed_hours),
                                      hourly_rate: String(c.hourly_rate),
                                      contributed_at: c.contributed_at?.slice(0, 10) ?? '',
                                      description: c.description ?? '',
                                    })
                                  }} className="p-1 rounded hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-muted)' }}>
                                    <Pencil size={12} />
                                  </button>
                                  <button onClick={() => setContribDeleteConfirm(c)} className="p-1 rounded hover:bg-red-500/10 transition-colors text-red-400">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="flex justify-end px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--brand-border)' }}>
              <button onClick={() => { setAportesProject(null); setContribModal({ open: false }) }} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sub-modal Adicionar/Editar Aporte ── */}
      {aportesProject && contribModal.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-2xl w-full max-w-sm" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>
                {contribModal.item ? 'Editar Aporte' : 'Novo Aporte'}
              </h3>
              <button onClick={() => {
                setContribModal({ open: false })
                setContribForm({ contributed_hours: '', hourly_rate: '', contributed_at: '', description: '' })
              }} className="p-1 rounded hover:bg-white/5"><X size={14} style={{ color: 'var(--brand-muted)' }} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand-subtle)' }}>Horas *</label>
                  <input type="number" step="0.5" min="0" value={contribForm.contributed_hours}
                    onChange={e => setContribForm(f => ({ ...f, contributed_hours: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
                    placeholder="0.0" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand-subtle)' }}>Valor/Hora *</label>
                  <input type="number" step="0.01" min="0" value={contribForm.hourly_rate}
                    onChange={e => setContribForm(f => ({ ...f, hourly_rate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
                    placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand-subtle)' }}>Data *</label>
                <input type="date" value={contribForm.contributed_at}
                  onChange={e => setContribForm(f => ({ ...f, contributed_at: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)', colorScheme: 'dark' }} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand-subtle)' }}>Descrição</label>
                <input type="text" value={contribForm.description}
                  onChange={e => setContribForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
                  placeholder="Opcional" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--brand-border)' }}>
              <button onClick={() => {
                setContribModal({ open: false })
                setContribForm({ contributed_hours: '', hourly_rate: '', contributed_at: '', description: '' })
              }} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Cancelar</button>
              <button onClick={saveContrib} disabled={contribSaving}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)', border: '1px solid rgba(0,245,255,0.2)' }}>
                {contribSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmação de exclusão de aporte ── */}
      {contribDeleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-2xl w-full max-w-xs p-6 text-center" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
            <Trash2 size={28} className="mx-auto mb-3 text-red-400" />
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--brand-text)' }}>Excluir aporte?</p>
            <p className="text-xs mb-5" style={{ color: 'var(--brand-subtle)' }}>
              {contribDeleteConfirm.contributed_hours}h em {contribDeleteConfirm.contributed_at?.slice(0, 10).split('-').reverse().join('/')}. Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => setContribDeleteConfirm(null)} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Cancelar</button>
              <button onClick={() => doDeleteContrib(contribDeleteConfirm)} className="px-4 py-2 rounded-xl text-sm font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">Excluir</button>
            </div>
          </div>
        </div>
      )}

    </AppLayout>
  )
}
