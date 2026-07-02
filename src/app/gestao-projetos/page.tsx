'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useMemo, useEffect, useRef, useCallback, Fragment, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { api, ApiError } from '@/lib/api'
import { uploadDirect } from '@/lib/upload'
import { useAuth } from '@/hooks/use-auth'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { Project, PaginatedResponse, HourContribution } from '@/types'
import { formatBRL } from '@/lib/format'
import { toast } from 'sonner'
import { Layers, Search, ChevronDown, ChevronRight, Users, TrendingUp, TrendingDown, Clock, BarChart2, AlertTriangle, DollarSign, X, UserCheck, Pencil, Trash2, Plus, Edit2, MessageCircle, Eye, Check, UserPlus, CalendarPlus, CalendarOff, ChevronUp, ChevronsUpDown, FileText, Download, History, ExternalLink } from 'lucide-react'
import { ProjectMessages } from '@/components/shared/ProjectMessages'
import { MonthlyAccrualTable } from '@/components/projects/monthly-accrual-table'
import { ProjectViewModal } from '@/components/projects/project-view-modal'
import { ProjectDataModal } from '@/components/shared/ProjectDataModal'
import { MultiSelect } from '@/components/ui/multi-select'
import { PageHeader } from '@/components/ds'
import { RowMenu } from '@/components/ui/row-menu'
import { CustomerContactsSection } from '@/components/ui/customer-contacts-section'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ProjectWithTeam extends Project {
  consultants?: { id: number; name: string; email: string; pivot?: { allow_manual_timesheet: boolean } }[]
  coordinators?: { id: number; name: string; email: string }[]
  child_projects?: ProjectWithTeam[]
  service_type?: { id: number; name: string } | null
  contract_type?: { id: number; name: string } | null
  contract_type_display?: string
  parent_project?: { id: number; name: string; code: string } | null
  consumo_mensal?: number | null
}

interface ProjectFull extends ProjectWithTeam {
  description?: string | null
  start_date?: string | null
  project_value?: number | null
  hourly_rate?: number | null
  additional_hourly_rate?: number | null
  initial_cost?: number | null
  initial_hours_balance?: number | null
  initial_hours_consumed?: number | null
  exceeded_hour_contribution?: number | null
  consultant_hours?: number | null
  coordinator_hours?: number | null
  save_erpserv?: number | null
  total_available_hours?: number | null
  total_project_value?: number | null
  weighted_hourly_rate?: number | null
  full_contributions_hours?: number | null
  service_type?: { id: number; name: string } | null
  contract_type?: { id: number; name: string } | null
  parent_project?: { id: number; name: string; code: string } | null
  approvers?: { id: number; name: string; email: string }[]
  unlimited_expense?: boolean | null
  max_expense_per_consultant?: number | null
  expense_responsible_party?: string | null
}

interface TreeRow extends ProjectWithTeam {
  _level: number
  _hasChildren: boolean
  _isExpanded: boolean
  _parentId: number | null
}

function toTreeRow(p: ProjectWithTeam, level = 0, parentId: number | null = null): TreeRow {
  return { ...p, _level: level, _hasChildren: (p.child_projects?.length ?? 0) > 0, _isExpanded: false, _parentId: parentId }
}

interface CostSummary {
  project_info: {
    project_value?: number | null; initial_cost?: number | null
    initial_hours_balance?: number | null; tipo_faturamento?: string | null
    total_available_hours?: number; weighted_hourly_rate?: number
  }
  hours_summary: {
    total_logged_hours: number; approved_hours: number; pending_hours: number
    remaining_hours: number; general_balance?: number
    total_available_hours?: number; hours_percentage: number
  }
  cost_calculation: {
    total_cost: number; approved_cost: number; pending_cost: number
    is_on_demand: boolean; project_revenue: number
    aportes_total: number; receita_total: number
    custo_operacional: number; custo_total: number
    margin: number; margin_percentage: number
    coordinator_percentage: number; valor_coordenador: number
  }
  consultant_breakdown: { consultant_name: string; total_hours: number; approved_hours: number; pending_hours: number; cost: number; consultant_hourly_rate?: number; consultant_rate_type?: string }[]
}

// ─── Cabeçalho ordenável ────────────────────────────────────────────────────

function SortableTh({
  children, columnKey, sortKey, sortDir, onSort, disabled, className = '', align, minWidth,
}: {
  children: React.ReactNode
  columnKey: string
  sortKey: string | null
  sortDir: 'asc' | 'desc'
  onSort: (k: any) => void
  disabled?: boolean
  className?: string
  align?: 'left' | 'center' | 'right'
  minWidth?: number
}) {
  const isActive = sortKey === columnKey && !disabled
  const Icon = isActive ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown
  return (
    <th
      className={`text-[11px] font-medium uppercase tracking-[0.04em] select-none ${disabled ? '' : 'cursor-pointer'} ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'} ${className}`}
      style={{ color: isActive ? 'var(--text)' : 'var(--text-muted)', minWidth }}
      onClick={() => { if (!disabled) onSort(columnKey) }}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'center' ? 'justify-center w-full' : ''}`}>
        {children}
        {!disabled && <Icon size={11} style={{ opacity: isActive ? 1 : 0.4 }} />}
      </span>
    </th>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function healthColor(pct: number | undefined): 'green' | 'yellow' | 'red' {
  if (pct === undefined || pct === null) return 'green'
  if (pct >= 90) return 'red'
  if (pct >= 70) return 'yellow'
  return 'green'
}

const healthStyles = {
  green:  { bar: 'var(--success-border)', badge: 'var(--success-bg)',  text: 'var(--success-border)' },
  yellow: { bar: 'var(--warning-border)', badge: 'var(--warning-bg)', text: 'var(--warning-border)' },
  red:    { bar: 'var(--danger-border)', badge: 'var(--danger-bg)',  text: 'var(--danger-border)' },
}

function fmt(n: number | string | null | undefined, dec = 0) {
  if (n == null || n === '') return '—'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '—'
  const fixed = Math.abs(num).toFixed(dec)
  const [intPart, decPart] = fixed.split('.')
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const result = decPart !== undefined ? `${intFormatted},${decPart}` : intFormatted
  return num < 0 ? `-${result}` : result
}

function calcProjHours(p: ProjectWithTeam): { displaySold: number; consumedHours: number } {
  const ctName = ((p as any).contract_type_display ?? p.contract_type?.name ?? '').toLowerCase()
  const isOnDemand = ctName.includes('on demand') || (p as any).tipo_faturamento === 'on_demand'
  const isBhMensal = ctName.includes('mensal')
  const contributions = ((p as any).total_available_hours ?? p.sold_hours ?? 0) - (p.sold_hours ?? 0)
  const displaySold = isOnDemand
    ? (p.consumed_hours ?? (p.total_logged_minutes != null ? p.total_logged_minutes / 60 : 0))
    : isBhMensal
      ? ((p as any).accumulated_sold_hours ?? p.sold_hours ?? 0) + contributions
      : ((p as any).total_available_hours ?? p.sold_hours ?? 0)
  // gestaoMode já inclui initial_hours_consumed em consumed_hours — não somar de novo
  // Para sub-projetos filhos (sem consumed_hours), somar initial_hours_consumed ao fallback
  const consumedHours = p.consumed_hours != null
    ? p.consumed_hours
    : (p.total_logged_minutes != null ? p.total_logged_minutes / 60 : 0) + ((p as any).initial_hours_consumed ?? 0)
  return { displaySold, consumedHours }
}

// Saldo "visível" = o mesmo que a coluna SALDO mostra: On Demand é sempre 0
// (não tem saldo de horas), os demais usam general_hours_balance (decimal pode
// vir como string → Number). Usado pelo filtro/somatório de horas negativas.
function visibleSaldoOf(p: ProjectWithTeam): number {
  const ctName = ((p as any).contract_type_display ?? p.contract_type?.name ?? '').toLowerCase()
  const isOnDemand = ctName.includes('on demand') || (p as any).tipo_faturamento === 'on_demand'
  return isOnDemand ? 0 : Number(p.general_hours_balance ?? 0)
}

// Saúde + % de uso. O % e a cor batem com o SALDO exibido (consumido vs.
// vendidas/contratadas): verde <70%, amarelo 70–90%, vermelho >=90%. Saldo
// negativo (consumido > vendidas) é sempre Crítico.
function projectHealth(p: ProjectWithTeam, displaySold: number, consumed: number, considerUnbilled = false): { pct: number; color: 'green' | 'yellow' | 'red' } {
  const ctName = ((p as any).contract_type_display ?? p.contract_type?.name ?? '').toLowerCase()
  if (ctName.includes('on demand') || (p as any).tipo_faturamento === 'on_demand') {
    // On Demand pai com horas de meses encerrados NÃO faturadas → Crítico (só admin).
    if (considerUnbilled && Number((p as any).unbilled_hours ?? 0) > 0) return { pct: 100, color: 'red' }
    return { pct: 100, color: 'green' }
  }
  if (ctName.includes('mensal')) {
    // % de uso e saúde batem com o SALDO exibido: consumido vs. vendidas/contratadas,
    // SEM projetar o próximo aporte. Saldo negativo (estourou as horas) = Crítico.
    const saldoHoje = displaySold - consumed
    const pct = displaySold > 0 ? (consumed / displaySold) * 100 : 0
    const color: 'green' | 'yellow' | 'red' = saldoHoje < 0 ? 'red' : healthColor(pct)
    return { pct, color }
  }
  const pct = displaySold > 0 ? (consumed / displaySold) * 100 : 0
  return { pct, color: healthColor(pct) }
}

// Banco de horas de coordenação (lente do coordenador). "Vendidas" = coordination_hours;
// se em branco, cai pro vendido operacional (displaySold). Consumido = apontamentos do
// coordenador. 4 níveis de risco (saudável ≤70 / atenção 71-90 / crítico 91-100 / estourado >100).
function coordinationMeta(p: ProjectWithTeam, displaySold: number) {
  const raw = (p.coordination_hours != null && String(p.coordination_hours) !== '') ? Number(p.coordination_hours) : null
  const explicit = raw != null && raw > 0
  // Banco apontável inclui o APORTE (aporte soma com as contratadas).
  const aporte = Math.max(0, Number((p as any).total_available_hours ?? displaySold) - displaySold)
  const bank = (explicit ? raw! : displaySold) + aporte
  const consumed = Number(p.coordination_consumed_hours ?? 0)
  const saldo = Math.round((bank - consumed) * 100) / 100
  const pct = bank > 0 ? (consumed / bank) * 100 : 0
  const risk: 'saudavel' | 'atencao' | 'critico' | 'estourado' =
    pct > 100 ? 'estourado' : pct >= 91 ? 'critico' : pct >= 71 ? 'atencao' : 'saudavel'
  const color = risk === 'saudavel' ? 'var(--success-border)'
    : risk === 'atencao' ? 'var(--warning-border)' : 'var(--danger-border)'
  const alertText = risk === 'estourado' ? `Coordenação excedida em ${fmt(Math.abs(saldo), 1)}h`
    : risk === 'critico' ? 'Horas de coordenação esgotando'
    : risk === 'atencao' ? 'Coordenação próxima do limite' : ''
  return { bank, consumed, saldo, pct, risk, color, alertText, explicit }
}

function isCoordinatorOf(p: ProjectWithTeam, userId?: number | null): boolean {
  return !!userId && !!p.coordinators?.some(c => c.id === userId)
}

const inputStyle = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
}

// ─── SearchSelect ─────────────────────────────────────────────────────────────

function SearchSelect({ value, onChange, options, placeholder, portal = false }: {
  value: string; onChange: (v: string) => void
  options: { id: number | string; name: string }[]; placeholder: string
  portal?: boolean
}) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const [pos,   setPos]   = useState({ top: 0, left: 0, width: 0 })
  const ref      = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = options.find(o => String(o.id) === value)
  const filtered = options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))

  const openDropdown = useCallback(() => {
    if (portal && ref.current) {
      const r = ref.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    setOpen(true)
  }, [portal])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  useEffect(() => { if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 50) } }, [open])

  const select = (id: string) => { onChange(id); setOpen(false) }

  const dropdown = (
    <div
      onMouseDown={e => e.stopPropagation()}
      className="bg-[var(--bg)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden"
      style={portal
        ? { position: 'fixed', top: pos.top, left: pos.left, width: pos.width, minWidth: 220, zIndex: 9999 }
        : { position: 'absolute', top: '100%', marginTop: 4, left: 0, minWidth: '220px', zIndex: 50 }
      }
    >
      <div className="p-2 border-b border-[var(--border)]">
        <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar..."
          className="w-full h-7 px-2 text-xs bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] rounded outline-none placeholder:text-[var(--text-light)] focus:border-[var(--border-strong)]" />
      </div>
      <div className="max-h-52 overflow-y-auto py-0.5">
        <button type="button" onClick={() => select('')}
          className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${!value ? 'text-[var(--primary)] bg-[var(--surface-hover)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]'}`}>{placeholder}</button>
        {filtered.length === 0
          ? <p className="px-3 py-2 text-xs text-[var(--text-light)] italic">Nenhum resultado</p>
          : filtered.map(o => (
            <button key={o.id} type="button" onClick={() => select(String(o.id))}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${String(o.id) === value ? 'text-[var(--primary)] bg-[var(--surface-hover)]' : 'text-[var(--text)] hover:bg-[var(--surface-hover)]'}`}>
              {o.name}
            </button>
          ))}
      </div>
    </div>
  )

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => open ? setOpen(false) : openDropdown()}
        className={`w-full h-8 flex items-center justify-between gap-1 px-2 text-xs bg-[var(--surface-hover)] border border-[var(--border)] rounded-md outline-none hover:border-[var(--border-strong)] transition-colors ${selected ? 'text-[var(--text)]' : 'text-[var(--text-light)]'}`}>
        <span className="truncate">{selected ? selected.name : placeholder}</span>
        <ChevronRight size={12} className="rotate-90 shrink-0 text-[var(--text-light)]" />
      </button>
      {open && (portal ? createPortal(dropdown, document.body) : dropdown)}
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
        className={`h-8 flex items-center justify-between gap-1 px-2 text-xs bg-[var(--surface-hover)] border border-[var(--border)] rounded-md outline-none hover:border-[var(--border-strong)] transition-colors whitespace-nowrap ${selected ? 'text-[var(--text)]' : 'text-[var(--text-light)]'}`}>
        <span>{selected ? selected.name : placeholder}</span>
        <ChevronRight size={12} className="rotate-90 shrink-0 text-[var(--text-light)]" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 min-w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden">
          <div className="max-h-52 overflow-y-auto py-0.5">
            <button type="button" onClick={() => select('')}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${!value ? 'text-[var(--primary)] bg-[var(--surface-hover)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]'}`}>{placeholder}</button>
            {options.map(o => (
              <button key={o.id} type="button" onClick={() => select(o.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${o.id === value ? 'text-[var(--primary)] bg-[var(--surface-hover)]' : 'text-[var(--text)] hover:bg-[var(--surface-hover)]'}`}>
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
        <div key={i} className="h-14 rounded-xl" style={{ background: 'var(--surface)' }} />
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
  onClick?: () => void
  active?: boolean
}

function SummaryCard({ icon, label, value, sub, onClick, active }: SummaryCardProps) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      className={`rounded-2xl p-5 transition-all ${onClick ? 'cursor-pointer hover:brightness-95' : ''}`}
      style={{
        background: active ? 'var(--primary-soft)' : 'var(--surface)',
        border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
          {icon}
        </div>
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <p className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--text-light)' }}>{sub}</p>}
    </div>
  )
}

// ─── Linha da Tabela ──────────────────────────────────────────────────────────

interface ProjectRowProps {
  project: ProjectWithTeam
  expanded: boolean
  onToggle: () => void
  onMenuAction: (action: 'view' | 'costs' | 'timesheets' | 'expenses' | 'team' | 'aportes' | 'messages' | 'open-period' | 'detach-parent' | 'attach-parent', project: ProjectWithTeam) => void
  canEdit?: boolean
  canChangeStatus?: boolean
  canDetach?: boolean
  onEdit?: (project: ProjectWithTeam) => void
  onChangeStatus?: (project: ProjectWithTeam) => void
  onDelete?: (project: ProjectWithTeam) => void
  treeRow?: TreeRow
  onTreeToggle?: () => void
  hasUnread?: boolean
  isSelected?: boolean
  onSelect?: (id: number) => void
  onConsultantManualToggle?: (userId: number, allow: boolean) => void
  /** admin/administrativo — só eles veem horas não faturadas (cliente/coord não). */
  showUnbilled?: boolean
  /** Nome do executivo da conta (cliente) — coluna Executivo. */
  executiveName?: string | null
}

function ProjectRow({ project, expanded, onToggle, onMenuAction, canEdit, canChangeStatus, canDetach, onEdit, onChangeStatus, onDelete, treeRow, onTreeToggle, hasUnread, isSelected, onSelect, onConsultantManualToggle, showUnbilled, executiveName }: ProjectRowProps) {
  const ctName = (project.contract_type_display ?? project.contract_type?.name ?? '').toLowerCase()
  const isOnDemand = ctName.includes('on demand') || (project as any).tipo_faturamento === 'on_demand'
  const isBhMensal = ctName.includes('mensal')
  const contributions = ((project as any).total_available_hours ?? project.sold_hours ?? 0) - (project.sold_hours ?? 0)
  const displaySold = isOnDemand
    ? (project.consumed_hours ?? (project.total_logged_minutes != null ? project.total_logged_minutes / 60 : 0))
    : isBhMensal
      ? ((project as any).accumulated_sold_hours ?? project.sold_hours ?? 0) + contributions
      : ((project as any).total_available_hours ?? project.sold_hours ?? 0)
  // Destaque na coluna COORD: banco de horas do coordenador MENOR que as horas vendidas.
  const coordHoursBank = Number((project as any).coordination_hours ?? 0)
  const coordBelowSold = !isOnDemand && coordHoursBank > 0 && coordHoursBank < displaySold
  // gestaoMode já inclui initial_hours_consumed em consumed_hours — não somar de novo
  // Para sub-projetos filhos (sem consumed_hours), somar initial_hours_consumed ao fallback
  const consumedHours = project.consumed_hours != null
    ? project.consumed_hours
    : (project.total_logged_minutes != null ? project.total_logged_minutes / 60 : 0) + ((project as any).initial_hours_consumed ?? 0)
  const displaySaldo = isOnDemand ? 0 : (project.general_hours_balance ?? null)
  // On Demand pai: horas de meses encerrados ainda NÃO faturados (informativo, só admin).
  const unbilledHrs  = Number((project as any).unbilled_hours ?? 0)
  const hasUnbilled  = !!showUnbilled && isOnDemand && unbilledHrs > 0
  const { pct, color } = projectHealth(project, displaySold, consumedHours, !!showUnbilled)
  const hs    = healthStyles[color]

  const saldo    = displaySaldo
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
  const childConsumption = project.children_consumption_breakdown ?? []
  const hasChildConsumption = childConsumption.length > 0

  // Tree visual
  const isChild           = treeRow ? treeRow._level > 0 : false
  const isParent          = treeRow ? treeRow._level === 0 && treeRow._hasChildren : false
  const isInactive        = isChild && (project as any).node_state === 'DISABLED'
  const isActive          = isChild && (project as any).node_state !== 'DISABLED'
  const isParentIndirect  = isParent && (project as any).coordinator_is_direct === false
  const rowBg             = isActive ? 'var(--primary-soft)' : 'transparent'
  const rowBorderLeft     = isActive ? '3px solid var(--primary)'
    : isParent ? '2px solid var(--border-strong)'
    : isInactive ? '2px solid var(--border)' : undefined
  const rowBoxShadow      = isActive ? 'inset 0 0 0 1px var(--primary-soft)' : undefined
  const rowOpacity        = isInactive ? 0.4 : isParentIndirect ? 0.6 : 1

  const statusRowClass = project.status === 'cancelled' ? 'row--cancelado'
    : project.status === 'finished' ? 'row--encerrado'
    : project.status === 'paused' ? 'row--pausado'
    : ''
  const childRowClass = isChild ? 'row--child' : ''

  return (
    <>
      {(project as any).has_open_period && (
        <tr style={{ height: 0 }}>
          <td colSpan={20} style={{ padding: 0, height: 0 }}>
            <div style={{ background: 'var(--warning-bg)', borderTop: '2px solid var(--warning-border)', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', fontSize: 11, color: 'var(--warning)', fontWeight: 700, letterSpacing: '0.02em' }}>
              <span style={{ animation: 'pulse 1.5s infinite', color: 'var(--warning-border)' }}>⚠</span> MÊS ABERTO — apontamentos permitidos em competência fechada
            </div>
          </td>
        </tr>
      )}
      <tr
        className={`border-b transition-colors cursor-pointer ${statusRowClass} ${childRowClass}`.trim()}
        style={{
          borderColor: (project as any).has_open_period ? 'var(--warning-border)' : 'var(--border)',
          background: (project as any).has_open_period
            ? 'var(--warning-bg)'
            : isActive ? rowBg : !statusRowClass ? rowBg : undefined,
          borderLeft: (project as any).has_open_period
            ? '4px solid var(--warning-border)'
            : isActive ? rowBorderLeft : !statusRowClass ? rowBorderLeft : undefined,
          boxShadow: (project as any).has_open_period ? '0 0 0 1px var(--warning-border) inset' : rowBoxShadow,
          opacity: !statusRowClass ? rowOpacity : undefined,
        }}
        onMouseEnter={(e) => { if (!isActive && !statusRowClass) e.currentTarget.style.background = 'var(--surface-hover)' }}
        onMouseLeave={(e) => { if (!isActive && !statusRowClass) e.currentTarget.style.background = 'transparent' }}
        onClick={treeRow ? (treeRow._hasChildren ? onTreeToggle : undefined) : onToggle}
      >
        {/* Checkbox de seleção */}
        {onSelect && (
          <td className="py-2 pl-3 pr-0 w-8" onClick={e => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={!!isSelected}
              onChange={() => onSelect(project.id)}
              className="w-4 h-4 rounded accent-[var(--primary)] cursor-pointer"
            />
          </td>
        )}

        {/* Menu de ações */}
        <td className="py-2 pl-2 pr-1" style={{ width: 60 }} onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <RowMenu items={[
              { label: 'Visualizar', icon: <Eye size={12} />, onClick: () => onMenuAction('view', project) },
              ...(canEdit ? [{ label: 'Editar', icon: <Edit2 size={12} />, onClick: () => onEdit?.(project) }] : []),
              ...(canChangeStatus ? [{ label: 'Alterar Status', icon: <Layers size={12} />, onClick: () => onChangeStatus?.(project) }] : []),
              { label: 'Custo',             icon: <DollarSign  size={12} />, onClick: () => onMenuAction('costs',      project) },
              { label: 'Apont. & Despesas', icon: <Clock       size={12} />, onClick: () => onMenuAction('timesheets', project) },
              // 'Aportes' removido do menu de linha (2026-05-28): aporte agora se cria via
              // toggle "É aporte?" no Novo Contrato do Kanban Contratos; visualização via aba
              // Aportes do projeto no modal Visualizar.
              { label: 'Selecionar Equipe', icon: <Users       size={12} />, onClick: () => onMenuAction('team',       project) },
              {
                label: (project as any).has_open_period ? 'Fechar Mês' : 'Abrir Mês',
                icon: (project as any).has_open_period
                  ? <CalendarOff size={12} />
                  : <CalendarPlus size={12} />,
                onClick: () => onMenuAction('open-period', project),
              },
              ...(canDetach && project.parent_project_id ? [{ label: 'Desvincular do pai', icon: <Layers size={12} />, onClick: () => onMenuAction('detach-parent', project) }] : []),
              ...(canDetach && !project.parent_project_id ? [{ label: 'Vincular como filho', icon: <Layers size={12} />, onClick: () => onMenuAction('attach-parent', project) }] : []),
              ...(onDelete ? [{ label: 'Excluir', icon: <Trash2 size={12} className="text-[var(--danger)]" />, onClick: () => onDelete(project), danger: true }] : []),
            ]} />
            <button
              onClick={() => onMenuAction('messages', project)}
              className="relative flex items-center justify-center w-7 h-7 rounded transition-colors"
              style={hasUnread
                ? { color: 'var(--primary)', background: 'var(--primary-soft)' }
                : { color: 'var(--text-light)' }}
              title="Mensagens"
            >
              <MessageCircle size={13} />
              {hasUnread && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: 'var(--primary)', boxShadow: '0 0 6px var(--ring)' }} />
              )}
            </button>
          </div>
        </td>

        {/* Indicador de saúde (borda esquerda) */}
        <td className="pl-0 pr-3 py-3 w-1">
          <div className="w-1 h-10 rounded-full ml-0" style={{ background: hs.bar }} />
        </td>

        {/* Projeto */}
        <td className="py-3 pr-4" style={{ paddingLeft: treeRow ? 8 + treeRow._level * 24 : 8 }}>
          <div className="flex items-center gap-2">
            {treeRow
              ? treeRow._hasChildren
                ? (treeRow._isExpanded
                    ? <ChevronDown size={14} style={{ color: 'var(--primary)' }} />
                    : <ChevronRight size={14} style={{ color: 'var(--text-light)' }} />)
                : isChild
                  ? <span className="text-xs shrink-0" style={{ color: 'var(--text-light)' }}>└─</span>
                  : <span className="w-3.5" />
              : teamCount > 0
                ? (expanded
                    ? <ChevronDown size={14} style={{ color: 'var(--text-light)' }} />
                    : <ChevronRight size={14} style={{ color: 'var(--text-light)' }} />)
                : <span className="w-3.5" />
            }
            <div>
              <div className="flex items-center gap-1.5">
                {/* Nome sem link pro workspace /projetos/[id] — workspace é cronograma (em teste, fora de prod). */}
                <span
                  className="text-sm font-semibold"
                  style={{ color: isActive ? 'var(--primary)' : isParent ? 'var(--text-light)' : 'var(--text-muted)' }}
                >
                  {project.name}
                </span>
                {treeRow && isParent && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-hover)', color: 'var(--text-light)' }}>PAI</span>
                )}
                {treeRow && isActive && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>ATIVO</span>
                )}
              </div>
              <p className="text-xs font-mono" style={{ color: 'var(--text-light)' }}>
                {project.code}
              </p>
            </div>
          </div>
        </td>

        {/* Cliente */}
        <td className="py-3 pr-4 text-sm" style={{ color: 'var(--text-muted)' }}>
          {project.customer?.name ?? '—'}
        </td>

        {/* Executivo */}
        <td className="py-3 pr-4 text-xs" style={{ color: 'var(--text-light)' }}>
          {executiveName ?? '—'}
        </td>

        {/* Tipo de Contrato */}
        <td className="py-3 pr-4 text-xs" style={{ color: 'var(--text-light)' }}>
          {project.contract_type_display ?? project.contract_type?.name ?? '—'}
        </td>

        {/* Tipo de Serviço */}
        <td className="py-3 pr-4 text-xs" style={{ color: 'var(--text-light)' }}>
          {project.service_type?.name ?? '—'}
        </td>

        {/* Horas Mensais */}
        <td className="py-3 px-4 text-sm text-center tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {isBhMensal ? fmt(project.sold_hours ?? 0) : <span style={{ color: 'var(--text-light)', fontSize: 11 }}>—</span>}
        </td>

        {/* HS Vendidas */}
        <td className="py-3 px-4 text-sm text-center tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {isOnDemand ? (
            <span style={{ color: 'var(--text-light)', fontSize: 11 }}>= consumo</span>
          ) : (
            <div className="flex flex-col items-center leading-tight">
              <span>{fmt(displaySold, Number.isInteger(displaySold) ? 0 : 1)}</span>
              {(project.vendidas_aporte_hours ?? 0) > 0 && (
                <>
                  <span style={{ fontSize: 10, color: 'var(--text-light)' }}>Projeto {fmt(project.vendidas_projeto_hours ?? 0, 1)}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-light)' }}>Aporte {fmt(project.vendidas_aporte_hours ?? 0, 1)}</span>
                </>
              )}
            </div>
          )}
        </td>

        {/* Total Contratadas = acumulado + aporte */}
        <td className="py-3 px-4 text-sm text-center tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {isOnDemand ? (
            <span style={{ color: 'var(--text-light)', fontSize: 11 }}>—</span>
          ) : (
            fmt(displaySold, 1)
          )}
        </td>

        {/* HS Consumidas */}
        <td className="py-3 px-4 text-sm text-center tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {(project.children_consumed_hours ?? 0) > 0 ? (
            <div className="flex flex-col items-center leading-tight">
              <span>{fmt(consumedHours, 1)}</span>
              <span style={{ fontSize: 10, color: 'var(--text-light)' }}>Pai {fmt(project.own_consumed_hours, 1)}</span>
              <span style={{ fontSize: 10, color: 'var(--text-light)' }}>Filhos {fmt(project.children_consumed_hours, 1)}</span>
            </div>
          ) : (
            fmt(consumedHours, 1)
          )}
        </td>

        {/* Consumo Mensal */}
        <td className="py-3 px-4 text-sm text-center tabular-nums" style={{ color: 'var(--primary)' }}>
          {project.consumo_mensal != null ? fmt(project.consumo_mensal, 1) : '—'}
        </td>

        {/* Saldo */}
        <td className="py-3 px-4 text-[13px] text-right tabular-nums font-semibold"
          style={{ color: (saldoNeg || hasUnbilled) ? 'var(--danger-border)' : 'var(--text)' }}>
          {isOnDemand
            ? (hasUnbilled
                ? <span title="Horas de meses encerrados ainda não faturados" style={{ color: 'var(--danger-border)' }}>-{fmt(unbilledHrs, 1)}</span>
                : <span style={{ color: 'var(--text-light)' }}>0,0</span>)
            : (saldo != null ? fmt(saldo, 1) : '—')}
        </td>

        {/* % Uso + barra */}
        <td className="py-3 px-4 min-w-[140px]">
          {isOnDemand ? (
            hasUnbilled
              ? <span className="text-xs font-semibold" style={{ color: 'var(--danger-border)' }}>Crítico</span>
              : <span className="text-xs" style={{ color: 'var(--text-light)' }}>—</span>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-hover)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(pct, 100)}%`, background: hs.bar }}
                  />
                </div>
                <span className="text-xs tabular-nums w-9 text-center" style={{ color: hs.text }}>
                  {displaySold > 0 ? `${Math.round(pct)}%` : '—'}
                </span>
              </div>
            </>
          )}
        </td>

        {/* Coord. — mini-barra de progresso do banco de coordenação + popover de hover.
            Destaque quando as horas de coordenação são MENORES que as horas vendidas. */}
        <td className="py-3 px-4 min-w-[140px] relative" onClick={e => e.stopPropagation()}
          title={coordBelowSold ? `Horas de coordenação (${fmt(coordHoursBank, 1)}h) menores que as vendidas (${fmt(displaySold, 1)}h)` : undefined}
          style={coordBelowSold ? { background: 'var(--warning-bg)', boxShadow: 'inset 3px 0 0 var(--warning-border)' } : undefined}>
          {(() => {
            const cBank = Number((project as any).coordination_hours ?? 0)
            if (cBank <= 0) return <span className="text-xs" style={{ color: 'var(--text-light)' }}>—</span>
            const cCons = Number((project as any).coordination_consumed_hours ?? 0)
            const cPct  = (cCons / cBank) * 100
            const cColor = cPct >= 90 ? 'var(--danger-border)' : cPct >= 70 ? 'var(--warning-border)' : 'var(--success-border)'
            const cSaldo = cBank - cCons
            const cRisk  = cPct >= 90 ? 'Crítico' : cPct >= 70 ? 'Atenção' : 'Saudável'
            return (
              <div className="group/coord relative cursor-help">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-hover)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(cPct, 100)}%`, background: cColor }} />
                  </div>
                  {coordBelowSold && (
                    <span className="text-[10px] shrink-0" style={{ color: 'var(--warning-border)' }} title="Horas de coordenação menores que as vendidas">⚠</span>
                  )}
                  <span className="text-[10px] tabular-nums font-semibold shrink-0" style={{ color: cColor }}>{Math.round(cPct)}%</span>
                </div>
                <div className="text-[9px] mt-0.5 tabular-nums" style={{ color: 'var(--text-light)' }}>
                  {cCons.toFixed(1)}h / {cBank.toFixed(1)}h
                </div>
                {/* Popover de hover */}
                <div
                  className="invisible opacity-0 group-hover/coord:visible group-hover/coord:opacity-100 transition-opacity duration-150 pointer-events-none absolute z-50 left-1/2 -translate-x-1/2 bottom-[calc(100%+8px)] w-56 rounded-lg p-3 shadow-xl"
                  style={{ background: 'var(--surface)', border: `1px solid ${cColor}66`, boxShadow: '0 6px 20px rgba(0,0,0,0.35)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Coordenação</span>
                    <span className="text-[10px] font-bold" style={{ color: cColor }}>{cRisk} · {Math.round(cPct)}%</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center mb-2">
                    <div>
                      <p className="text-[9px]" style={{ color: 'var(--text-light)' }}>Vendidas</p>
                      <p className="text-xs font-bold tabular-nums" style={{ color: 'var(--text)' }}>{cBank.toFixed(1)}h</p>
                    </div>
                    <div>
                      <p className="text-[9px]" style={{ color: 'var(--text-light)' }}>Consumidas</p>
                      <p className="text-xs font-bold tabular-nums" style={{ color: 'var(--text-muted)' }}>{cCons.toFixed(1)}h</p>
                    </div>
                    <div>
                      <p className="text-[9px]" style={{ color: 'var(--text-light)' }}>Saldo</p>
                      <p className="text-xs font-bold tabular-nums" style={{ color: cSaldo < 0 ? 'var(--danger-border)' : 'var(--success-border)' }}>{cSaldo.toFixed(1)}h</p>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-hover)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(cPct, 100)}%`, background: cColor }} />
                  </div>
                </div>
              </div>
            )
          })()}
        </td>

        {/* Status — semantic chip via tokens */}
        <td className="py-3 whitespace-nowrap">
          {(() => {
            const stMap: Record<string, { bg: string; fg: string; bd: string }> = {
              started:        { bg: 'var(--info-bg)',      fg: 'var(--info)',            bd: 'var(--info-border)' },
              paused:         { bg: 'var(--warning-bg)',   fg: 'var(--warning)',         bd: 'var(--warning-border)' },
              cancelled:      { bg: 'var(--danger-bg)',    fg: 'var(--danger)',          bd: 'var(--danger-border)' },
              finished:       { bg: 'var(--surface-hover)',fg: 'var(--text-muted)',      bd: 'var(--border)' },
              awaiting_start: { bg: 'var(--info-bg)',      fg: 'var(--info)',            bd: 'var(--info-border)' },
            }
            const s = stMap[project.status] ?? stMap.finished
            return (
              <div className="flex flex-col items-start gap-1">
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap inline-flex items-center"
                  style={{ background: s.bg, color: s.fg, border: `1px solid ${s.bd}` }}
                >
                  {project.status_display ?? statusLabel[project.status] ?? project.status}
                </span>
                {hasUnbilled && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap inline-flex items-center"
                    style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)' }}
                    title={`${fmt(unbilledHrs, 1)}h de meses encerrados ainda não faturados`}
                  >
                    Crítico — não faturado
                  </span>
                )}
              </div>
            )
          })()}
        </td>
      </tr>

      {/* Expansão: equipe + consumo dos filhos */}
      {expanded && (teamCount > 0 || hasChildConsumption) && (
        <tr style={{ background: 'var(--surface-hover)' }}>
          <td /><td />
          <td colSpan={14} className="py-3 px-4">
            <div className="flex flex-wrap gap-4">
              {(project.coordinators ?? []).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-light)' }}>
                    Coordenadores
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {project.coordinators!.map(u => (
                      <span key={u.id} className="text-xs px-2.5 py-1 rounded-lg font-medium"
                        style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                        {u.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(project.consultants ?? []).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-light)' }}>
                    Consultores
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {project.consultants!.map(u => {
                      const allowManual = u.pivot?.allow_manual_timesheet ?? false
                      return (
                        <div key={u.id} className="relative group/manual flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium"
                          style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
                          <span>{u.name}</span>
                          {canEdit && onConsultantManualToggle && (
                            <button
                              onClick={e => { e.stopPropagation(); onConsultantManualToggle(u.id, !allowManual) }}
                              title={allowManual ? 'Bloquear apontamento manual neste projeto' : 'Liberar apontamento manual neste projeto'}
                              className="ml-1 w-4 h-4 rounded flex items-center justify-center transition-colors"
                              style={{
                                background: allowManual ? 'var(--success-border)' : 'var(--surface-hover)',
                                color: allowManual ? 'var(--success-border)' : 'var(--text-light)',
                              }}
                            >
                              <Clock size={10} />
                            </button>
                          )}
                          {!canEdit && allowManual && (
                            <span style={{ color: 'var(--success-border)' }}><Clock size={10} /></span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {hasChildConsumption && (
                <div className="basis-full">
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-light)' }}>
                    Consumo dos filhos no banco do pai
                  </p>
                  <div className="flex flex-col gap-1">
                    {childConsumption.map(c => (
                      <div key={c.id} className="flex items-center gap-2 text-xs">
                        <span className="font-mono" style={{ color: 'var(--text-light)' }}>{c.code}</span>
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                        <span style={{ color: 'var(--text-muted)' }}>{c.name}</span>
                        {c.contract_type && (
                          <span style={{ color: 'var(--text-light)' }}>({c.contract_type})</span>
                        )}
                        <span className="font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
                          {fmt(c.consumed_hours, 1)}h
                        </span>
                      </div>
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

// ─── Project Edit Form ────────────────────────────────────────────────────────

interface ProjectEditForm {
  name: string; description: string; status: string
  code_seq: string; code_year: string; code_suffix: string; customer_id: string
  start_date: string; expected_end_date: string; encerramento_date: string
  sold_hours: string; project_value: string
  hourly_rate: string; additional_hourly_rate: string
  initial_hours_consumed: string; initial_cost: string
  consultant_hours: string; coordinator_hours: string; coordination_hours: string
  parent_project_id: string
  service_type_id: string; contract_type_id: string
  tipo_faturamento: string; tipo_alocacao: string
  condicao_pagamento: string; vendedor_id: string
  cobra_despesa_cliente: boolean
  observacoes_contrato: string
  max_expense_per_consultant: string
  timesheet_retroactive_limit_days: string
  allow_manual_timesheets: boolean; allow_negative_balance: boolean; client_follows_timesheets: boolean
  movidesk_integration_enabled: boolean
  extrato_visivel_cliente: boolean
  coordinator_ids: number[]; consultant_ids: number[]; consultant_group_ids: number[]
  kanban_coordinator_override_id: string
}

function ProjectInlineEditModal({ project, onClose, onSaved }: { project: ProjectFull; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth()
  const isAdmin = user?.type === 'admin'
  const d = project as any
  // Captura no mount se o projeto tem valores de histórico — mantém bloco visível
  // durante a edição mesmo se o user apagar pra zerar (evita "campo some ao limpar").
  const [hadInitialHistory] = useState(
    Number(d.initial_hours_consumed ?? 0) > 0 || Number(d.initial_cost ?? 0) > 0
  )
  // Parse existing code: PREFIX001-26 → seq='001', year='26'; PREFIX001-26-01 → suffix='01'
  const parsedCode = useMemo(() => {
    const m = (d.code ?? '').match(/^[A-Za-z]+(\d+)-(\d+)(?:-(\d+))?/)
    return {
      seq:    m?.[1] ?? '',
      year:   m?.[2] ?? String(new Date().getFullYear()).slice(-2),
      suffix: m?.[3] ?? '',
    }
  }, [])
  const [form, setForm] = useState<ProjectEditForm>({
    name:                            d.name ?? '',
    code_seq:                        parsedCode.seq,
    code_year:                       parsedCode.year,
    code_suffix:                     parsedCode.suffix,
    customer_id:                     d.customer_id ? String(d.customer_id) : '',
    description:                     d.description ?? '',
    status:                          d.status ?? 'awaiting_start',
    start_date:                      d.start_date?.slice(0, 10) ?? '',
    expected_end_date:               d.expected_end_date?.slice(0, 10) ?? '',
    encerramento_date:               (d as any).encerramento_date?.slice(0, 10) ?? '',
    sold_hours:                      d.sold_hours != null ? String(d.sold_hours) : '',
    project_value:                   (() => {
      const pv = d.project_value ?? 0
      const hr = Number(d.hourly_rate ?? 0)
      const hs = Number(d.sold_hours ?? 0)
      if ((!pv || pv === 0) && hr > 0 && hs > 0) return String(+(hr * hs).toFixed(2))
      return pv != null ? String(pv) : ''
    })(),
    hourly_rate:                     d.hourly_rate != null ? String(d.hourly_rate) : '',
    additional_hourly_rate:          d.additional_hourly_rate != null ? String(d.additional_hourly_rate) : '',
    initial_hours_consumed:          d.initial_hours_consumed != null ? String(d.initial_hours_consumed) : '',
    initial_cost:                    d.initial_cost != null ? String(d.initial_cost) : '',
    consultant_hours:                d.consultant_hours != null ? String(d.consultant_hours) : '',
    coordinator_hours:               d.coordinator_hours != null ? String(d.coordinator_hours) : '',
    coordination_hours:              (d as any).coordination_hours != null ? String((d as any).coordination_hours) : '',
    parent_project_id:               d.parent_project_id ? String(d.parent_project_id) : '',
    service_type_id:                 d.service_type_id ? String(d.service_type_id) : (d.service_type?.id ? String(d.service_type.id) : ''),
    contract_type_id:                d.contract_type_id ? String(d.contract_type_id) : (d.contract_type?.id ? String(d.contract_type.id) : ''),
    tipo_faturamento:                d.tipo_faturamento ?? '',
    tipo_alocacao:                   d.tipo_alocacao ?? '',
    condicao_pagamento:              d.condicao_pagamento ?? '',
    vendedor_id:                     d.vendedor_id ? String(d.vendedor_id) : '',
    cobra_despesa_cliente:           d.cobra_despesa_cliente ?? false,
    observacoes_contrato:            d.observacoes_contrato ?? '',
    max_expense_per_consultant:      d.max_expense_per_consultant != null ? String(d.max_expense_per_consultant) : '',
    timesheet_retroactive_limit_days: d.timesheet_retroactive_limit_days != null ? String(d.timesheet_retroactive_limit_days) : '',
    allow_manual_timesheets:         d.allow_manual_timesheets ?? true,
    allow_negative_balance:          d.allow_negative_balance ?? false,
    client_follows_timesheets:       (d as any).client_follows_timesheets ?? true,
    movidesk_integration_enabled:    (d as any).movidesk_integration_enabled ?? false,
    extrato_visivel_cliente:         (d as any).extrato_visivel_cliente ?? true,
    coordinator_ids:                 (d.coordinators ?? d.approvers ?? []).map((c: any) => c.id),
    consultant_ids:                  (d.consultants ?? []).map((c: any) => c.id),
    consultant_group_ids:            (d.consultant_groups ?? []).map((g: any) => g.id),
    kanban_coordinator_override_id:  d.kanban_coordinator_override_id ? String(d.kanban_coordinator_override_id) : '',
  })
  const [saving, setSaving] = useState(false)
  const [manualTimesheetIds, setManualTimesheetIds] = useState<Set<number>>(
    () => new Set((d.consultants ?? []).filter((c: any) => c.pivot?.allow_manual_timesheet).map((c: any) => c.id))
  )

  // Anexos do projeto (inclui os herdados do contrato vinculado, source='contract')
  const [projAttachments, setProjAttachments] = useState<any[]>([])
  const [pendingAttach, setPendingAttach] = useState<{ file: File; type: string }[]>([])
  const attachFileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    api.get<any[]>(`/projects/${project.id}/attachments`).then(r => setProjAttachments(Array.isArray(r) ? r : [])).catch(() => {})
  }, [project.id])
  const fmtAttSize = (b: any) => b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`
  const downloadProjAtt = async (att: any) => {
    const res = await fetch(`/api/v1/projects/${project.id}/attachments/${att.id}`, { credentials: 'same-origin' })
    if (!res.ok) { toast.error('Erro ao baixar arquivo'); return }
    const blob = await res.blob(); const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = att.original_name; a.click(); URL.revokeObjectURL(url)
  }
  const deleteProjAtt = async (att: any) => {
    if (!confirm('Remover este anexo?')) return
    try { await api.delete(`/projects/${project.id}/attachments/${att.id}`); setProjAttachments(p => p.filter(x => x.id !== att.id)); toast.success('Anexo removido') }
    catch (e: any) { toast.error(e?.message ?? 'Erro ao remover anexo') }
  }

  const [optServiceTypes,    setOptServiceTypes]    = useState<{id:number;name:string}[]>([])
  const [optContractTypes,   setOptContractTypes]   = useState<{id:number;name:string}[]>([])
  const [optCoordinators,    setOptCoordinators]    = useState<{id:number;name:string}[]>([])
  const [optConsultants,     setOptConsultants]     = useState<{id:number;name:string}[]>([])
  const [optGroups,          setOptGroups]          = useState<{id:number;name:string}[]>([])
  const [optParentProjects,  setOptParentProjects]  = useState<{id:number;name:string;hourly_rate?:number|null}[]>([])
  const [optCustomers,       setOptCustomers]       = useState<{id:number;name:string;code_prefix?:string|null}[]>([])
  const [teamSearch,         setTeamSearch]         = useState('')
  const [teamTab,            setTeamTab]            = useState<'coord'|'consult'|'group'>('coord')

  useEffect(() => {
    const items = (r: any) => Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
    Promise.allSettled([
      api.get<any>('/service-types?pageSize=100'),
      api.get<any>('/contract-types?pageSize=100'),
      api.get<any>('/users?type=coordenador&coordinator_type=projetos&pageSize=200'),
      api.get<any>('/users?type=admin&pageSize=200'),
      api.get<any>('/users?type=consultor,parceiro_admin&pageSize=200'),
      api.get<any>('/consultant-groups?pageSize=100&active=1'),
      api.get<any>('/customers?pageSize=500'),
    ]).then(([st, ct, coords, admins, consults, grps, custs]) => {
      if (st.status === 'fulfilled')      setOptServiceTypes(items(st.value))
      if (ct.status === 'fulfilled')      setOptContractTypes(items(ct.value))
      if (coords.status === 'fulfilled' || admins.status === 'fulfilled') {
        const coordList = coords.status === 'fulfilled' ? items(coords.value) : []
        const adminList = admins.status === 'fulfilled' ? items(admins.value) : []
        const merged = [...coordList, ...adminList.filter((a: any) => !coordList.some((c: any) => c.id === a.id))]
        setOptCoordinators(merged)
      }
      if (consults.status === 'fulfilled') setOptConsultants(items(consults.value))
      if (grps.status === 'fulfilled')    setOptGroups(items(grps.value))
      if (custs.status === 'fulfilled')   setOptCustomers(items(custs.value).map((c: any) => ({ id: c.id, name: c.name, code_prefix: c.code_prefix ?? null })))
    })
    const customerId = d.customer_id
    if (customerId) {
      const qs = new URLSearchParams({ pageSize: '200', parent_projects_only: 'true', customer_id: String(customerId), exclude_id: String(project.id) })
      api.get<any>(`/projects?${qs}`).then(r => {
        const list = items(r)
        setOptParentProjects(list.map((p: any) => ({ id: p.id, name: `${p.code} - ${p.name}`, hourly_rate: p.hourly_rate ?? null })))
      }).catch(() => {})
    }
  }, [])

  const [codeExists,   setCodeExists]   = useState(false)
  const [codeChecking, setCodeChecking] = useState(false)
  // Fluxo in-app de troca de integração Movidesk (substitui window.confirm)
  const [movideskConflict, setMovideskConflict] = useState<{ current?: { code?: string; name?: string }; payload: Record<string, unknown> } | null>(null)
  const [movideskStep, setMovideskStep] = useState<'confirm' | 'migrate' | 'processing'>('confirm')
  const [movideskMigrating, setMovideskMigrating] = useState(false)

  // Vigência do novo valor-hora: quando o hourly_rate muda, perguntamos a partir de qual mês passa a valer.
  const [rateModalOpen, setRateModalOpen] = useState(false)
  const [rateEffectiveMonth, setRateEffectiveMonth] = useState<string>(() => new Date().toISOString().slice(0, 7))

  // Histórico de valores-hora (somente leitura) — GET /projects/{id}/change-history?field_name=hourly_rate
  const [rateHistoryOpen, setRateHistoryOpen] = useState(false)
  const [rateHistory, setRateHistory] = useState<any[]>([])
  const [rateHistoryLoading, setRateHistoryLoading] = useState(false)
  const openRateHistory = async () => {
    setRateHistoryOpen(true)
    setRateHistoryLoading(true)
    try {
      const res = await api.get<{ hasNext: boolean; items: any[] }>(`/projects/${project.id}/change-history?field_name=hourly_rate&pageSize=100`)
      setRateHistory(Array.isArray(res?.items) ? res.items : [])
    } catch {
      setRateHistory([])
      toast.error('Erro ao carregar histórico de valores')
    } finally {
      setRateHistoryLoading(false)
    }
  }

  // Vigência das horas vendidas (Banco de Horas Mensal): quando sold_hours muda,
  // perguntamos a partir de qual mês passa a valer (espelha o valor-hora).
  const [soldHoursModalOpen, setSoldHoursModalOpen] = useState(false)
  const [soldHoursEffectiveMonth, setSoldHoursEffectiveMonth] = useState<string>(() => new Date().toISOString().slice(0, 7))
  // Vigência(s) já confirmada(s) carregada(s) entre os modais (rate + horas) num mesmo save.
  const [pendingEff, setPendingEff] = useState<{ rate?: string; sold?: string }>({})

  // Histórico de horas vendidas (somente leitura) — GET /projects/{id}/sold-hours-history
  const [soldHoursHistoryOpen, setSoldHoursHistoryOpen] = useState(false)
  const [soldHoursHistory, setSoldHoursHistory] = useState<any[]>([])
  const [soldHoursHistoryLoading, setSoldHoursHistoryLoading] = useState(false)
  const openSoldHoursHistory = async () => {
    setSoldHoursHistoryOpen(true)
    setSoldHoursHistoryLoading(true)
    try {
      const res = await api.get<any[]>(`/projects/${project.id}/sold-hours-history`)
      setSoldHoursHistory(Array.isArray(res) ? res : [])
    } catch {
      setSoldHoursHistory([])
      toast.error('Erro ao carregar histórico de horas')
    } finally {
      setSoldHoursHistoryLoading(false)
    }
  }

  const selectedCustomerObj = useMemo(() => optCustomers.find(c => String(c.id) === form.customer_id), [optCustomers, form.customer_id])
  // Use prefix from selected customer, or fall back to original code prefix
  const codePrefix  = selectedCustomerObj?.code_prefix?.toUpperCase() ?? (d.code ?? '').match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() ?? ''
  const codePreview = useMemo(() => {
    if (!codePrefix || !form.code_seq.trim()) return ''
    const base = `${codePrefix}${form.code_seq.padStart(3, '0')}-${form.code_year}`
    return form.code_suffix ? `${base}-${form.code_suffix}` : base
  }, [codePrefix, form.code_seq, form.code_year, form.code_suffix])

  const checkCodeExists = useCallback(async () => {
    if (!codePreview || codePreview === d.code) { setCodeExists(false); return }
    setCodeChecking(true)
    try {
      const r = await api.get<any>(`/projects?code=${encodeURIComponent(codePreview)}`)
      setCodeExists((r?.total ?? 0) > 0)
    } catch { setCodeExists(false) }
    finally { setCodeChecking(false) }
  }, [codePreview])

  const handleCustomerChange = (newCustomerId: string) => {
    setForm(prev => ({ ...prev, customer_id: newCustomerId, parent_project_id: '', code_seq: '', code_year: parsedCode.year, code_suffix: '' }))
    setCodeExists(false)
    if (!newCustomerId) { setOptParentProjects([]); return }
    // Recarrega projetos-pai do novo cliente
    const qs = new URLSearchParams({ pageSize: '200', parent_projects_only: 'true', customer_id: newCustomerId, exclude_id: String(project.id) })
    api.get<any>(`/projects?${qs}`).then(r => {
      const list = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setOptParentProjects(list.map((p: any) => ({ id: p.id, name: `${p.code} - ${p.name}`, hourly_rate: p.hourly_rate ?? null })))
    }).catch(() => {})
  }

  const toggleId = (ids: number[], id: number) => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
  const setF = (key: keyof ProjectEditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }))
  // "Horas de Gestão" é derivado do % (coordinator_hours) sobre as Horas Consultor.
  // Draft local pra permitir digitar suave; quando null, mostra o valor derivado do %.
  const [gestaoDraft, setGestaoDraft] = useState<string | null>(null)

  const handleSave = async (eff: { rate?: string; sold?: string } = {}) => {
    if (!form.name.trim()) { toast.error('Nome obrigatório'); return }
    if (codeExists) { toast.error('Código já existe em outro projeto. Altere o código antes de salvar.'); return }
    // Horas de coordenação obrigatórias para projetos que não são On Demand
    // (no On Demand o campo nem aparece — backend recebe 0 como fallback).
    const ctNameForSave = optContractTypes.find(c => String(c.id) === form.contract_type_id)?.name?.toLowerCase()
      ?? (d.contract_type_display ?? d.contract_type?.name ?? '').toLowerCase()
    const isOnDemandSave = ctNameForSave.includes('on demand') || form.tipo_faturamento === 'on_demand'
    // Horas Apontáveis só para Fechado/BH Fixo. BH Mensal, Cloud/SaaS e On Demand não têm.
    const editIsBhMensal = ctNameForSave.includes('mensal')
    const editIsMensalidade = ctNameForSave === 'cloud' || ctNameForSave === 'saas'
    if (!isOnDemandSave && !editIsBhMensal && !editIsMensalidade && form.coordination_hours === '') {
      toast.error('Horas Apontáveis obrigatórias.')
      return
    }
    // Horas de coordenação não podem exceder as horas vendidas (contratadas) do projeto.
    if (!editIsBhMensal && form.coordination_hours !== '' && form.sold_hours !== '' && Number(form.coordination_hours) > Number(form.sold_hours)) {
      toast.error(`Horas de coordenação não podem ser maiores que as horas vendidas (${form.sold_hours}h).`)
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        description:          form.description || null,
        status:               form.status,
        start_date:           form.start_date || null,
        expected_end_date:    form.expected_end_date || null,
        encerramento_date:    form.encerramento_date || null,
        allow_manual_timesheets: form.allow_manual_timesheets,
        allow_negative_balance:  form.allow_negative_balance,
        client_follows_timesheets: form.client_follows_timesheets,
        movidesk_integration_enabled: form.movidesk_integration_enabled,
        extrato_visivel_cliente: form.extrato_visivel_cliente,
        cobra_despesa_cliente:   form.cobra_despesa_cliente,
        observacoes_contrato: form.observacoes_contrato || null,
        condicao_pagamento:   form.condicao_pagamento || null,
        coordinator_ids:      form.coordinator_ids,
        consultant_ids:       form.consultant_ids,
        consultant_group_ids: form.consultant_group_ids,
      }
      if (form.customer_id)              payload.customer_id = Number(form.customer_id)
      if (codePreview && codePreview !== d.code) payload.code = codePreview
      if (form.service_type_id)              payload.service_type_id              = Number(form.service_type_id)
      if (form.contract_type_id)             payload.contract_type_id             = Number(form.contract_type_id)
      if (form.parent_project_id)            payload.parent_project_id            = Number(form.parent_project_id)
      if (form.vendedor_id)                  payload.vendedor_id                  = Number(form.vendedor_id)
      if (form.tipo_faturamento)             payload.tipo_faturamento             = form.tipo_faturamento
      if (form.tipo_alocacao)                payload.tipo_alocacao                = form.tipo_alocacao
      if (form.project_value !== '')         payload.project_value                = Number(form.project_value)
      if (form.hourly_rate !== '')           payload.hourly_rate                  = Number(form.hourly_rate)
      if (form.additional_hourly_rate !== '') payload.additional_hourly_rate      = Number(form.additional_hourly_rate)
      if (form.sold_hours !== '')            payload.sold_hours                   = Number(form.sold_hours)
      if (form.consultant_hours !== '')      payload.consultant_hours             = Number(form.consultant_hours)
      if (form.coordinator_hours !== '')     payload.coordinator_hours            = Number(form.coordinator_hours)
      // '' envia 0 pra permitir zerar o banco de coordenação (volta ao fallback operacional).
      // BH Mensal nunca tem horas de coordenação → força 0 independente do valor antigo.
      payload.coordination_hours = editIsBhMensal ? 0 : (form.coordination_hours === '' ? 0 : Number(form.coordination_hours))
      // initial_* sempre enviam: '' vira 0 pra permitir zerar valor existente.
      payload.initial_hours_consumed = form.initial_hours_consumed === '' ? 0 : Number(form.initial_hours_consumed)
      payload.initial_cost           = form.initial_cost === '' ? 0 : Number(form.initial_cost)
      if (form.max_expense_per_consultant !== '') payload.max_expense_per_consultant = Number(form.max_expense_per_consultant)
      if (form.timesheet_retroactive_limit_days !== '') payload.timesheet_retroactive_limit_days = Number(form.timesheet_retroactive_limit_days)
      // kanban_coordinator_override_id: envia null se vazio (pra limpar) ou int se preenchido
      payload.kanban_coordinator_override_id = form.kanban_coordinator_override_id === ''
        ? null
        : Number(form.kanban_coordinator_override_id)
      // Mudou o valor-hora e/ou as horas vendidas (BH Mensal)? Abre o modal de vigência
      // antes de enviar (fechamentos de meses anteriores não mudam). Se ambos mudaram,
      // pede um mês de cada vez, carregando o já confirmado em pendingEff.
      const rateChanged = form.hourly_rate !== '' && Number(form.hourly_rate) !== Number(d.hourly_rate ?? 0)
      const soldChanged = editIsBhMensal && form.sold_hours !== '' && Number(form.sold_hours) !== Number(d.sold_hours ?? 0)
      if (rateChanged && !eff.rate) { setSaving(false); setPendingEff(eff); setRateModalOpen(true); return }
      if (soldChanged && !eff.sold) { setSaving(false); setPendingEff(eff); setSoldHoursModalOpen(true); return }
      if (rateChanged && eff.rate) { payload.hourly_rate_effective_from = eff.rate }
      if (soldChanged && eff.sold) { payload.sold_hours_effective_from = eff.sold }
      try {
        await api.put(`/projects/${project.id}`, payload)
      } catch (err: any) {
        const isConflict = (err instanceof ApiError) && err.status === 409 && (err.data as any)?.code === 'MOVIDESK_INTEGRATION_CONFLICT'
        if (!isConflict) throw err
        // Abre o fluxo de modais in-app; o PUT de swap é refeito por submitMovideskSwap.
        setMovideskConflict({ current: (err.data as any)?.current_project, payload })
        setMovideskStep('confirm')
        setSaving(false)
        return
      }
      await finishAfterSave()
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao salvar projeto') }
    finally { setSaving(false) }
  }

  // Pós-processamento compartilhado entre o fluxo normal e o de troca Movidesk.
  const finishAfterSave = async () => {
    // Salva allow_manual_timesheet por consultor (pivô separado)
    const directInitial: any[] = d.consultants ?? []
    const groupInitial: any[] = (d.consultant_groups ?? []).flatMap((g: any) => g.consultants ?? [])
    const allInitialConsultants = [...directInitial, ...groupInitial].filter((c, i, arr) => arr.findIndex((x: any) => x.id === c.id) === i)
    const initialManual = new Set<number>(allInitialConsultants.filter((c: any) => c.pivot?.allow_manual_timesheet).map((c: any) => Number(c.id)))
    const allIds = new Set<number>([...allInitialConsultants.map((c: any) => Number(c.id)), ...Array.from(initialManual)])
    await Promise.allSettled(
      Array.from(allIds).filter(id => manualTimesheetIds.has(id) !== initialManual.has(id)).map(id =>
        api.put(`/projects/${project.id}/consultants/${id}/manual-timesheet`, { allow: manualTimesheetIds.has(id) })
      )
    )
    if (pendingAttach.length > 0) {
      for (const { file, type } of pendingAttach) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('type', type)
        await uploadDirect(`/projects/${project.id}/attachments`, fd)
      }
      setPendingAttach([])
    }
    toast.success('Projeto atualizado')
    onSaved()
  }

  // Refaz o PUT confirmando a troca de integração Movidesk (com ou sem migração).
  const submitMovideskSwap = async (migrate: boolean) => {
    if (!movideskConflict) return
    setMovideskMigrating(migrate)
    setMovideskStep('processing')
    try {
      await api.put(`/projects/${project.id}`, { ...movideskConflict.payload, confirm_movidesk_swap: true, migrate_movidesk_timesheets: migrate })
      await finishAfterSave()
      setMovideskConflict(null)
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao salvar projeto')
      setMovideskConflict(null)
    }
  }

  const iStyle: React.CSSProperties = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.625rem', padding: '0.5rem 0.75rem', fontSize: '0.8125rem', color: 'var(--text)', outline: 'none' }
  const lStyle: React.CSSProperties = { fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-light)', marginBottom: '0.375rem', display: 'block' }
  const SecTitle = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[10px] font-semibold uppercase tracking-wider pt-3 pb-2" style={{ color: 'var(--text-light)', borderTop: '1px solid var(--border)' }}>{children}</p>
  )
  const Toggle2 = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
      <button type="button" onClick={() => onChange(!checked)}
        className="relative w-10 h-5 rounded-full transition-colors shrink-0"
        style={{ background: checked ? 'var(--success-border)' : 'var(--border-strong)' }}>
        <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-[var(--surface)] transition-transform" style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }} />
      </button>
      <span className="text-xs" style={{ color: 'var(--text)' }}>{label}</span>
    </div>
  )

  const STATUS_OPTS = [
    { value: 'awaiting_start', label: 'Aguardando Início' },
    { value: 'started',        label: 'Em Andamento' },
    { value: 'paused',         label: 'Pausado' },
    { value: 'finished',       label: 'Encerrado' },
    { value: 'cancelled',      label: 'Cancelado' },
  ]

  const filteredCoords   = optCoordinators.filter(c => c.name.toLowerCase().includes(teamSearch.toLowerCase()))
  const filteredConsults = optConsultants.filter(c => c.name.toLowerCase().includes(teamSearch.toLowerCase()))
  const filteredGroups   = optGroups.filter(g => g.name.toLowerCase().includes(teamSearch.toLowerCase()))

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="flex flex-col rounded-2xl w-full max-w-5xl max-h-[94vh]" style={{ background: 'var(--surface)', border: '1px solid var(--ring)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-light)' }}>{d.code}</p>
            <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>Editar Projeto</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-6">

            {/* ── Coluna Esquerda ── */}
            <div className="space-y-3">

              {/* Identificação */}
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Identificação</p>
              <div><label style={lStyle}>Nome do Projeto *</label><input value={form.name} onChange={setF('name')} style={iStyle} /></div>
              {/* Cliente */}
              <div>
                <label style={lStyle}>Cliente</label>
                <SearchSelect
                  value={form.customer_id}
                  onChange={handleCustomerChange}
                  options={optCustomers}
                  placeholder="Selecione o cliente..."
                  portal={true}
                />
              </div>

              {/* Contatos do cliente */}
              <CustomerContactsSection
                customerId={form.customer_id ? Number(form.customer_id) : null}
                customerName={selectedCustomerObj?.name}
              />

              {/* Código do Projeto — builder */}
              <div>
                <label style={lStyle}>Código do Projeto</label>
                {codePrefix ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="px-3 py-2 rounded-lg text-sm font-mono tracking-widest text-center select-none"
                        style={{ ...iStyle, width: 'auto', minWidth: '4.5rem', opacity: 0.5 }}>
                        {codePrefix}
                      </div>
                      <input type="text" maxLength={3} placeholder="001"
                        value={form.code_seq}
                        onChange={e => { setForm(f => ({ ...f, code_seq: e.target.value.replace(/\D/g, '').slice(0, 3) })); setCodeExists(false) }}
                        onBlur={checkCodeExists}
                        className="px-3 py-2 rounded-lg text-sm font-mono text-center outline-none focus:ring-1 focus:ring-[var(--primary-soft)]"
                        style={{ ...iStyle, width: '5rem' }} />
                      <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>-</span>
                      <input type="text" maxLength={2} placeholder="26"
                        value={form.code_year}
                        onChange={e => setForm(f => ({ ...f, code_year: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                        onBlur={checkCodeExists}
                        className="px-3 py-2 rounded-lg text-sm font-mono text-center outline-none focus:ring-1 focus:ring-[var(--primary-soft)]"
                        style={{ ...iStyle, width: '4rem' }} />
                      {form.code_suffix && (
                        <>
                          <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>-</span>
                          <div className="px-3 py-2 rounded-lg text-sm font-mono text-center select-none"
                            style={{ ...iStyle, width: '4rem', opacity: 0.5 }}>
                            {form.code_suffix}
                          </div>
                        </>
                      )}
                      {codePreview && (
                        <span className="text-xs font-mono px-2 py-1 rounded-lg" style={{ background: 'var(--surface-hover)', color: 'var(--text-light)' }}>
                          {codePreview}
                        </span>
                      )}
                    </div>
                    {codeChecking && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Verificando código...</p>}
                    {codeExists && !codeChecking && (
                      <p className="text-[11px] text-[var(--danger)]">⚠ Código <span className="font-mono font-semibold">{codePreview}</span> já existe em outro projeto.</p>
                    )}
                    {!form.code_seq && (
                      <p className="text-[11px] italic" style={{ color: 'var(--text-light)' }}>Atual: <span className="font-mono">{d.code}</span> — deixe vazio para manter</p>
                    )}
                  </div>
                ) : form.customer_id ? (
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={iStyle}>
                    <span className="text-xs italic flex-1" style={{ color: 'var(--warning-border)' }}>Cliente sem prefixo configurado</span>
                    <a href="/cadastros?tab=customers" target="_blank" rel="noreferrer"
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0"
                      style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
                      Configurar prefixo
                    </a>
                  </div>
                ) : (
                  <p className="text-xs italic" style={{ color: 'var(--text-light)' }}>Selecione um cliente para editar o código</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={lStyle}>Status</label>
                  <select value={form.status} onChange={setF('status')} style={iStyle}>
                    {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div><label style={lStyle}>Data de Início</label><input type="date" value={form.start_date} onChange={setF('start_date')} style={iStyle} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label style={lStyle}>Data de Conclusão</label><input type="date" value={form.expected_end_date} onChange={setF('expected_end_date')} style={iStyle} /></div>
                <div><label style={lStyle}>Data de Encerramento BH</label><input type="date" value={form.encerramento_date} onChange={setF('encerramento_date')} style={iStyle} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={lStyle}>Tipo de Contrato</label>
                  <select value={form.contract_type_id} onChange={setF('contract_type_id')} style={iStyle}>
                    <option value="">Selecione...</option>
                    {optContractTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lStyle}>Tipo de Serviço</label>
                  <select value={form.service_type_id} onChange={setF('service_type_id')} style={iStyle}>
                    <option value="">Selecione...</option>
                    {optServiceTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={lStyle}>Projeto Pai (Subprojeto)</label>
                <select value={form.parent_project_id} onChange={e => {
                  const parentId = e.target.value
                  const parent = optParentProjects.find(p => String(p.id) === parentId)
                  setForm(prev => {
                    const hr = parent?.hourly_rate ? Number(parent.hourly_rate) : prev.hourly_rate !== '' ? Number(prev.hourly_rate) : 0
                    const hs = Number(prev.sold_hours)
                    return {
                      ...prev,
                      parent_project_id: parentId,
                      hourly_rate: parent?.hourly_rate ? String(parent.hourly_rate) : prev.hourly_rate,
                      project_value: hr > 0 && hs > 0 ? String(+(hr * hs).toFixed(2)) : prev.project_value,
                    }
                  })
                }} style={iStyle}>
                  <option value="">Nenhum</option>
                  {optParentProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div><label style={lStyle}>Descrição</label><textarea value={form.description} onChange={setF('description')} style={{ ...iStyle, resize: 'vertical', minHeight: '64px' }} /></div>

              {/* Anexos */}
              <div>
                <label style={lStyle}>Anexos (aprovação do cliente / proposta, contrato, logo)</label>
                {(projAttachments.length > 0 || pendingAttach.length > 0) ? (
                  <div className="space-y-1.5 mb-2">
                    {projAttachments.map(att => (
                      <div key={att.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText size={13} className="shrink-0" style={{ color: 'var(--text-light)' }} />
                          <div className="min-w-0">
                            <p className="text-xs truncate" style={{ color: 'var(--text)' }}>{att.original_name}</p>
                            <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>{att.type ?? 'anexo'}{att.size != null ? ` · ${fmtAttSize(att.size)}` : ''}{att.source === 'contract' ? ' · do contrato' : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button type="button" onClick={() => downloadProjAtt(att)} title="Baixar" className="p-1 rounded transition-colors hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-light)' }}><Download size={13} /></button>
                          {att.source !== 'contract' && (
                            <button type="button" onClick={() => deleteProjAtt(att)} title="Remover" className="p-1 rounded transition-colors hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-light)' }}><Trash2 size={13} /></button>
                          )}
                        </div>
                      </div>
                    ))}
                    {pendingAttach.map((pf, i) => (
                      <div key={`pend-${i}`} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-soft)' }}>
                        <div className="min-w-0">
                          <p className="text-xs truncate" style={{ color: 'var(--text)' }}>{pf.file.name}</p>
                          <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>{pf.type} · aguardando salvar</p>
                        </div>
                        <button type="button" onClick={() => setPendingAttach(p => p.filter((_, j) => j !== i))} className="p-1 shrink-0" style={{ color: 'var(--text-light)' }}><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] italic mb-2" style={{ color: 'var(--text-light)' }}>Nenhum anexo</p>
                )}
                <input ref={attachFileRef} type="file" className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.txt,.csv,.zip"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setPendingAttach(p => [...p, { file: f, type: 'proposta' }]); e.target.value = '' } }} />
                <button type="button" onClick={() => attachFileRef.current?.click()}
                  className="w-full py-3 rounded-lg border-2 border-dashed text-xs transition-colors hover:border-[var(--primary-soft)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-light)' }}>
                  Clique para adicionar anexo
                </button>
              </div>

              {/* Financeiro — On Demand mostra só Valor da Hora; demais tipos mostram tudo. */}
              <SecTitle>Financeiro</SecTitle>
              {(() => {
                const ctNameForm = optContractTypes.find(c => String(c.id) === form.contract_type_id)?.name?.toLowerCase()
                  ?? (d.contract_type_display ?? d.contract_type?.name ?? '').toLowerCase()
                const isOnDemandForm = ctNameForm.includes('on demand') || form.tipo_faturamento === 'on_demand'
                // Horas Apontáveis/Gestão só p/ Fechado e BH Fixo — esconde nos demais.
                const editIsBhMensal = ctNameForm.includes('mensal')
                const editIsMensalidade = ctNameForm === 'cloud' || ctNameForm === 'saas'
                const showApontaveis = !isOnDemandForm && !editIsBhMensal && !editIsMensalidade
                return (
              <>
              <div className="grid grid-cols-2 gap-3">
                {!isOnDemandForm && (
                  <div><label style={lStyle}>Valor do Projeto (R$)</label><input type="number" value={form.project_value} onChange={e => {
                    const pv = e.target.value
                    const hrs = Number(form.sold_hours)
                    setForm(prev => ({
                      ...prev,
                      project_value: pv,
                      hourly_rate: hrs > 0 && pv !== '' ? String(+(Number(pv) / hrs).toFixed(2)) : prev.hourly_rate,
                    }))
                  }} style={iStyle} placeholder="0.00" step="0.01" /></div>
                )}
                <div>
                  <div className="flex items-center justify-between" style={{ marginBottom: '0.375rem' }}>
                    <label style={{ ...lStyle, marginBottom: 0 }}>Valor da Hora (R$)</label>
                    {d.id != null && (
                      <button type="button" onClick={openRateHistory}
                        className="text-[10px] font-medium hover:underline" style={{ color: 'var(--primary)' }}>
                        Histórico de valores
                      </button>
                    )}
                  </div>
                  <input type="number" value={form.hourly_rate} onChange={e => {
                    const hr = e.target.value
                    const hrs = Number(form.sold_hours)
                    setForm(prev => ({
                      ...prev,
                      hourly_rate: hr,
                      project_value: hrs > 0 && hr !== '' ? String(+(Number(hr) * hrs).toFixed(2)) : prev.project_value,
                    }))
                  }} style={iStyle} placeholder="0.00" step="0.01" />
                </div>
                {!isOnDemandForm && (
                  <div><label style={lStyle}>Hora Adicional (R$)</label><input type="number" value={form.additional_hourly_rate} onChange={setF('additional_hourly_rate')} style={iStyle} placeholder="0.00" step="0.01" /></div>
                )}
                {!isOnDemandForm && (
                  <div>
                    <div className="flex items-center justify-between" style={{ marginBottom: '0.375rem' }}>
                      <label style={{ ...lStyle, marginBottom: 0 }}>Horas Contratadas</label>
                      {d.id != null && editIsBhMensal && (
                        <button type="button" onClick={openSoldHoursHistory}
                          className="text-[10px] font-medium hover:underline" style={{ color: 'var(--primary)' }}>
                          Histórico de horas
                        </button>
                      )}
                    </div>
                    <input type="number" value={form.sold_hours} onChange={e => {
                      const hrs = e.target.value
                      const hr = Number(form.hourly_rate)
                      setForm(prev => ({
                        ...prev,
                        sold_hours: hrs,
                        project_value: hr > 0 && hrs !== '' ? String(+(hr * Number(hrs)).toFixed(2)) : prev.project_value,
                      }))
                    }} style={iStyle} placeholder="0" step="1" />
                  </div>
                )}
                {showApontaveis && (
                  <div><label style={lStyle}>Percentual Gestão (%)</label><input type="number" value={form.coordinator_hours}
                    onChange={e => { setGestaoDraft(null); setForm(f => ({ ...f, coordinator_hours: e.target.value })) }}
                    style={iStyle} placeholder="0" step="1" min="0" max="100" /></div>
                )}
                {showApontaveis && (() => {
                  // Horas de Gestão = (Percentual Gestão / 100) × Horas Vendidas (contratadas).
                  // Bidirecional: editar aqui recalcula o %; editar o % recalcula isto. Deriva do %.
                  const base = Number(form.sold_hours || 0)
                  const pct  = Number(form.coordinator_hours || 0)
                  const derived = base > 0 ? Math.round((pct / 100) * base * 100) / 100 : 0
                  const shown = gestaoDraft ?? (derived ? String(derived) : '')
                  return (
                    <div>
                      <label style={lStyle}>Horas de Gestão</label>
                      <input type="number" value={shown} min="0" step="0.5" disabled={base <= 0}
                        onChange={e => {
                          const v = e.target.value
                          setGestaoDraft(v)
                          const h = Number(v) || 0
                          if (base > 0) setForm(f => ({ ...f, coordinator_hours: String(Math.round((h / base) * 100 * 100) / 100) }))
                        }}
                        onBlur={() => setGestaoDraft(null)}
                        style={iStyle} placeholder="0" />
                      <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>
                        {base > 0 ? `${pct || 0}% de ${base}h (vendidas)` : 'Informe Horas Contratadas para calcular'}
                      </p>
                    </div>
                  )
                })()}
                {!isOnDemandForm && (
                  <div><label style={lStyle}>Horas Consultor</label><input type="number" value={form.consultant_hours} onChange={setF('consultant_hours')} style={iStyle} placeholder="0" step="1" /></div>
                )}
                {!isOnDemandForm && (() => {
                  // Saving ERPSERV (read-only) = Horas Vendidas − Consultor − Horas de Gestão (% × Vendidas).
                  const sold = Number(form.sold_hours || 0)
                  const cons = Number(form.consultant_hours || 0)
                  const coordPct = Number(form.coordinator_hours || 0)
                  const gestao = sold > 0 ? (coordPct / 100) * sold : 0
                  const sobra = Math.round((sold - cons - gestao) * 100) / 100
                  return (
                    <div><label style={lStyle}>Saving ERPSERV</label><input type="text" value={isNaN(sobra) ? '—' : `${sobra}h`} readOnly tabIndex={-1} style={{ ...iStyle, opacity: 0.7, cursor: 'default' }} /></div>
                  )
                })()}
                {showApontaveis && (
                  <div>
                    <label style={lStyle}>Horas Apontáveis <span style={{ color: 'var(--danger-border)' }}>*</span></label>
                    <input type="number" required value={form.coordination_hours} onChange={setF('coordination_hours')} style={iStyle} placeholder="0" step="0.5" min="0" max={form.sold_hours || undefined} />
                    {form.coordination_hours !== '' && form.sold_hours !== '' && Number(form.coordination_hours) > Number(form.sold_hours) && (
                      <p className="text-[10px] mt-1" style={{ color: 'var(--danger-border)' }}>Não pode exceder as horas vendidas ({form.sold_hours}h).</p>
                    )}
                  </div>
                )}
              </div>
              {/* Histórico: oculto em On Demand novo (sem valor); mostra em On Demand
                  legado pra permitir zerar valores migrados do sistema anterior.
                  Usa hadInitialHistory (capturado no mount) pra não sumir quando o
                  user limpa os campos durante a edição. */}
              {(!isOnDemandForm || hadInitialHistory) && (
                <div className="grid grid-cols-2 gap-3 rounded-xl p-3" style={{ border: '1px solid var(--border)', background: 'var(--surface-hover)' }}>
                  <div><label style={{ ...lStyle, marginBottom: 0 }}>Histórico do sistema anterior</label></div>
                  <div />
                  <div><label style={lStyle}>HS Consumidas Iniciais</label><input type="number" value={form.initial_hours_consumed} onChange={setF('initial_hours_consumed')} style={iStyle} placeholder="0" step="0.5" /></div>
                  <div><label style={lStyle}>Custo Inicial (R$)</label><input type="number" value={form.initial_cost} onChange={setF('initial_cost')} style={iStyle} placeholder="0.00" step="0.01" /></div>
                </div>
              )}
              </>
                )
              })()}

              {/* Comercial */}
              <SecTitle>Informações Comerciais</SecTitle>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={lStyle}>Tipo de Faturamento</label>
                  <select value={form.tipo_faturamento} onChange={setF('tipo_faturamento')} style={iStyle}>
                    <option value="">Não definido</option>
                    <option value="on_demand">On Demand</option>
                    <option value="banco_horas_mensal">Banco de Horas Mensal</option>
                    <option value="banco_horas_fixo">Banco de Horas Fixo</option>
                    <option value="por_servico">Por Serviço</option>
                    <option value="saas">SaaS</option>
                  </select>
                </div>
                <div>
                  <label style={lStyle}>Tipo de Alocação</label>
                  <select value={form.tipo_alocacao} onChange={setF('tipo_alocacao')} style={iStyle}>
                    <option value="">Não definido</option>
                    <option value="remoto">Remoto</option>
                    <option value="presencial">Presencial</option>
                    <option value="ambos">Ambos</option>
                  </select>
                </div>
                <div><label style={lStyle}>Condição de Pagamento</label><input value={form.condicao_pagamento} onChange={setF('condicao_pagamento')} style={iStyle} placeholder="Ex: 30/60/90 dias" /></div>
                <div>
                  <label style={lStyle}>Vendedor</label>
                  <select value={form.vendedor_id} onChange={setF('vendedor_id')} style={iStyle}>
                    <option value="">Não definido</option>
                    {optConsultants.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
              <div><label style={lStyle}>Observações do Contrato</label><textarea value={form.observacoes_contrato} onChange={setF('observacoes_contrato')} style={{ ...iStyle, resize: 'vertical', minHeight: '56px' }} placeholder="Observações, termos especiais..." /></div>

              {/* Política de Despesas + Apontamentos */}
              <SecTitle>Política de Despesas e Apontamentos</SecTitle>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={lStyle}>Valor Máx. por Consultor (R$)</label>
                  <input type="number" value={form.max_expense_per_consultant} onChange={setF('max_expense_per_consultant')} style={iStyle} placeholder="Ilimitado" min="0" step="0.01" />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Vazio = ilimitado</p>
                </div>
                <div>
                  <label style={lStyle}>Prazo para Lançamento (dias)</label>
                  <input type="number" value={form.timesheet_retroactive_limit_days} onChange={setF('timesheet_retroactive_limit_days')} style={iStyle} placeholder="Padrão global" min="0" max="365" />
                </div>
              </div>
              <Toggle2 checked={form.allow_negative_balance} onChange={v => setForm(p => ({ ...p, allow_negative_balance: v }))} label="Permitir saldo negativo de horas" />
              {(() => {
                const ctn = optContractTypes.find(c => String(c.id) === form.contract_type_id)?.name?.toLowerCase() ?? ''
                if (!ctn.includes('banco de horas fixo')) return null
                return (
                  <Toggle2 checked={form.client_follows_timesheets}
                    onChange={v => setForm(p => ({ ...p, client_follows_timesheets: v }))}
                    label="Cliente acompanha apontamento (se desligado, o cliente não vê os apontamentos e o saldo aparece zerado — tudo consumido)" />
                )
              })()}
              <Toggle2
                checked={form.movidesk_integration_enabled}
                onChange={v => setForm(p => ({ ...p, movidesk_integration_enabled: v }))}
                label="Receber integração Movidesk (apontamentos importados deste cliente caem neste projeto)"
              />
              <Toggle2
                checked={form.extrato_visivel_cliente}
                onChange={v => setForm(p => ({ ...p, extrato_visivel_cliente: v }))}
                label="Cliente vê o Extrato (Situação do Contrato mês a mês) no perfil dele"
              />

              {/* Override de Coordenador (sustentação) — só admin */}
              {(() => {
                const stName = (optServiceTypes.find(s => s.id === Number(form.service_type_id))?.name ?? '').toLowerCase()
                const isSustentacao = stName.includes('sustenta')
                if (!isAdmin || !isSustentacao) return null
                return (
                  <div className="rounded-xl p-3 mt-2" style={{ background: 'var(--primary-soft)', border: '1px solid var(--ring)' }}>
                    <label style={lStyle} className="block mb-1">Gerenciado por outro coordenador</label>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-light)' }}>
                      Ao selecionar um coordenador, o card sai da fila de sustentação no Kanban e migra pra fila dele.
                      O projeto também some das abas Apontamentos/Despesas/Aprovações do Portal de Sustentação.
                    </p>
                    <select
                      value={form.kanban_coordinator_override_id}
                      onChange={setF('kanban_coordinator_override_id')}
                      style={iStyle}
                    >
                      <option value="">— Nenhum (segue fluxo padrão de sustentação) —</option>
                      {optCoordinators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )
              })()}
            </div>

            {/* ── Coluna Direita — Equipe ── */}
            <div className="flex flex-col">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-light)' }}>Equipe Alocada</p>
              <div className="flex gap-1 mb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                {([
                  ['coord',   'Coordenadores', form.coordinator_ids.length],
                  ['consult', 'Consultores',   form.consultant_ids.length],
                  ['group',   'Grupos',         form.consultant_group_ids.length],
                ] as const).map(([id, label, count]) => (
                  <button key={id} onClick={() => { setTeamTab(id); setTeamSearch('') }}
                    className="px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap"
                    style={{ color: teamTab === id ? 'var(--text)' : 'var(--text-muted)', borderBottom: teamTab === id ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: '-1px' }}>
                    {label}{count > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{count}</span>}
                  </button>
                ))}
              </div>
              {teamTab === 'consult' && (() => {
                const directConsultants: any[] = d.consultants ?? []
                const groupConsultants: any[] = (d.consultant_groups ?? []).flatMap((g: any) => g.consultants ?? [])
                const allProjectConsultants = [...directConsultants, ...groupConsultants].filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i)
                if (allProjectConsultants.length === 0) return null
                return (
                  <div className="mb-2 rounded-xl p-2" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5 px-1" style={{ color: 'var(--text-light)' }}>Apontamento manual — consultores no projeto</p>
                    {allProjectConsultants.map((c: any) => {
                      const allowManual = manualTimesheetIds.has(c.id)
                      return (
                        <div key={c.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[var(--surface-hover)]">
                          <span className="text-xs" style={{ color: 'var(--text)' }}>{c.name}</span>
                          <button
                            title={allowManual ? 'Bloquear apontamento manual' : 'Liberar apontamento manual'}
                            onClick={() => setManualTimesheetIds(prev => { const s = new Set(prev); allowManual ? s.delete(c.id) : s.add(c.id); return s })}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors shrink-0"
                            style={{ background: allowManual ? 'var(--success-bg)' : 'var(--surface-hover)', border: `1px solid ${allowManual ? 'var(--success-border)' : 'var(--border)'}`, color: allowManual ? 'var(--success-border)' : 'var(--text-light)' }}>
                            <Clock size={10} />
                            {allowManual ? 'Liberado' : 'Bloqueado'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
              {teamTab !== 'coord' && (
                <input value={teamSearch} onChange={e => setTeamSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="w-full text-xs px-3 py-2 rounded-xl outline-none mb-2"
                  style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              )}
              <div className="flex-1 overflow-y-auto space-y-1 rounded-xl p-2" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', maxHeight: 520 }}>
                {teamTab === 'coord' && (
                  <div className="px-1 py-1">
                    {form.coordinator_ids.length === 0 ? (
                      <p className="text-xs" style={{ color: 'var(--text-light)' }}>Nenhum coordenador definido.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {form.coordinator_ids.map(cid => {
                          const c = optCoordinators.find(o => o.id === cid)
                          return <span key={cid} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{c?.name ?? `#${cid}`}</span>
                        })}
                      </div>
                    )}
                    <p className="text-[10px] mt-3 leading-relaxed" style={{ color: 'var(--text-light)' }}>🔒 O coordenador é definido no Kanban de Contratos e não pode ser editado aqui.</p>
                  </div>
                )}
                {teamTab === 'consult' && filteredConsults.map(c => {
                  const sel = form.consultant_ids.includes(c.id)
                  return (
                    <button key={c.id} onClick={() => setForm(p => ({ ...p, consultant_ids: toggleId(p.consultant_ids, c.id) }))}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-[var(--surface-hover)]"
                      style={{ background: sel ? 'var(--surface-hover)' : 'transparent', border: `1px solid ${sel ? 'var(--brand-purple)' : 'transparent'}` }}>
                      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: sel ? 'var(--brand-purple)' : 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                        {sel && <Check size={10} style={{ color: 'var(--brand-purple)' }} />}
                      </div>
                      <span className="text-xs" style={{ color: sel ? 'var(--brand-purple)' : 'var(--text)' }}>{c.name}</span>
                    </button>
                  )
                })}
                {teamTab === 'group' && filteredGroups.map(g => {
                  const sel = form.consultant_group_ids.includes(g.id)
                  return (
                    <button key={g.id} onClick={() => setForm(p => ({ ...p, consultant_group_ids: toggleId(p.consultant_group_ids, g.id) }))}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-[var(--surface-hover)]"
                      style={{ background: sel ? 'var(--warning-bg)' : 'transparent', border: `1px solid ${sel ? 'var(--warning-border)' : 'transparent'}` }}>
                      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: sel ? 'var(--warning-border)' : 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                        {sel && <Check size={10} style={{ color: 'var(--warning-border)' }} />}
                      </div>
                      <span className="text-xs" style={{ color: sel ? 'var(--warning-border)' : 'var(--text)' }}>{g.name}</span>
                    </button>
                  )
                })}
                {teamTab === 'consult' && filteredConsults.length === 0 && <p className="text-xs text-center py-4" style={{ color: 'var(--text-light)' }}>Nenhum resultado</p>}
                {teamTab === 'group'   && filteredGroups.length   === 0 && <p className="text-xs text-center py-4" style={{ color: 'var(--text-light)' }}>Nenhum resultado</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
          <button onClick={() => handleSave()} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold" style={{ background: saving ? 'var(--primary-soft)' : 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>

      {/* Fluxo de troca de integração Movidesk (modais in-app) */}
      {movideskConflict && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Integração Movidesk</p>

            {movideskStep === 'confirm' && (
              <>
                <p className="text-[13px] leading-relaxed mb-5" style={{ color: 'var(--text-muted)' }}>
                  Cliente já tem a integração ativa em <strong style={{ color: 'var(--text)' }}>{movideskConflict.current?.code ?? ''} {movideskConflict.current?.name ?? ''}</strong>. Deseja mudar a integração para este projeto?
                </p>
                <div className="flex items-center justify-end gap-3">
                  <button onClick={() => setMovideskConflict(null)} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
                  <button onClick={() => setMovideskStep('migrate')} className="px-5 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)' }}>Sim, mudar</button>
                </div>
              </>
            )}

            {movideskStep === 'migrate' && (
              <>
                <p className="text-[13px] leading-relaxed mb-5" style={{ color: 'var(--text-muted)' }}>
                  Deseja migrar os apontamentos de origem Movidesk de <strong style={{ color: 'var(--text)' }}>{movideskConflict.current?.code ?? ''} {movideskConflict.current?.name ?? ''}</strong> para este projeto? (somente os apontamentos importados do Movidesk são movidos)
                </p>
                <div className="flex items-center justify-end gap-3">
                  <button onClick={() => submitMovideskSwap(false)} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Não migrar</button>
                  <button onClick={() => submitMovideskSwap(true)} className="px-5 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)' }}>Sim, migrar</button>
                </div>
              </>
            )}

            {movideskStep === 'processing' && (
              <>
                <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>{movideskMigrating ? 'Migrando apontamentos...' : 'Salvando...'}</p>
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                  <div className="h-full w-1/3 rounded-full animate-[mvProgress_1.1s_ease-in-out_infinite]" style={{ background: 'var(--primary)' }} />
                </div>
                <style>{`@keyframes mvProgress{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
              </>
            )}
          </div>
        </div>
      )}

      {/* Vigência do novo valor-hora */}
      {rateModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Vigência do valor hora</p>
            <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>
              A partir de qual mês esse novo valor hora passa a valer? Meses anteriores (fechamentos já feitos) não mudam.
            </p>
            <div className="mb-5">
              <label style={lStyle}>Mês de vigência</label>
              <input
                type="month"
                value={rateEffectiveMonth}
                min={new Date().toISOString().slice(0, 7)}
                onChange={e => setRateEffectiveMonth(e.target.value)}
                style={iStyle}
              />
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setRateModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button
                onClick={() => { setRateModalOpen(false); handleSave({ ...pendingEff, rate: `${rateEffectiveMonth}-01` }) }}
                disabled={!rateEffectiveMonth}
                className="px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)' }}
              >Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Histórico de valores-hora (somente leitura) */}
      {rateHistoryOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-lg rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Histórico de valores</p>
              <button onClick={() => setRateHistoryOpen(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
            {rateHistoryLoading ? (
              <p className="text-sm py-6 text-center animate-pulse" style={{ color: 'var(--text-light)' }}>Carregando...</p>
            ) : rateHistory.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhuma alteração registrada.</p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--surface-hover)', color: 'var(--text-light)' }}>
                      <th className="text-left font-semibold px-3 py-2">Vigência</th>
                      <th className="text-left font-semibold px-3 py-2">Valor</th>
                      <th className="text-left font-semibold px-3 py-2">Alterado por</th>
                      <th className="text-left font-semibold px-3 py-2">Em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rateHistory.filter((h: any, i: number, a: any[]) => a.findIndex((x: any) => String(x.created_at ?? '').slice(0, 10) === String(h.created_at ?? '').slice(0, 10)) === i).map((h, i) => (
                      <tr key={h.id ?? i} style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {h.effective_from
                            ? (() => { const [y, m] = String(h.effective_from).slice(0, 7).split('-'); return `${m}/${y}` })()
                            : <span title="vigência não informada (legado)" style={{ color: 'var(--text-light)' }}>—</span>}
                        </td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                          {h.old_value != null ? formatBRL(Number(h.old_value)) : '—'}
                          <span style={{ color: 'var(--text-light)' }}> → </span>
                          {h.new_value != null ? formatBRL(Number(h.new_value)) : '—'}
                        </td>
                        <td className="px-3 py-2">{h.changed_by_user?.name ?? '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                          {h.created_at ? new Date(h.created_at).toLocaleDateString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-end mt-5">
              <button onClick={() => setRateHistoryOpen(false)} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Vigência da nova quantidade de horas vendidas (BH Mensal) */}
      {soldHoursModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Vigência das horas vendidas</p>
            <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>
              A partir de qual mês essa nova quantidade de horas passa a valer? Meses anteriores (fechamentos já feitos) não mudam.
            </p>
            <div className="mb-5">
              <label style={lStyle}>Mês de vigência</label>
              <input
                type="month"
                value={soldHoursEffectiveMonth}
                min={new Date().toISOString().slice(0, 7)}
                onChange={e => setSoldHoursEffectiveMonth(e.target.value)}
                style={iStyle}
              />
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setSoldHoursModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button
                onClick={() => { setSoldHoursModalOpen(false); handleSave({ ...pendingEff, sold: `${soldHoursEffectiveMonth}-01` }) }}
                disabled={!soldHoursEffectiveMonth}
                className="px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)' }}
              >Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Histórico de horas vendidas (somente leitura) */}
      {soldHoursHistoryOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-lg rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Histórico de horas vendidas</p>
              <button onClick={() => setSoldHoursHistoryOpen(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
            {soldHoursHistoryLoading ? (
              <p className="text-sm py-6 text-center animate-pulse" style={{ color: 'var(--text-light)' }}>Carregando...</p>
            ) : soldHoursHistory.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhuma alteração registrada.</p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--surface-hover)', color: 'var(--text-light)' }}>
                      <th className="text-left font-semibold px-3 py-2">Vigência</th>
                      <th className="text-left font-semibold px-3 py-2">Horas</th>
                      <th className="text-left font-semibold px-3 py-2">Alterado por</th>
                      <th className="text-left font-semibold px-3 py-2">Em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {soldHoursHistory.map((h: any, i: number) => (
                      <tr key={h.id ?? i} style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {h.effective_from
                            ? (() => { const [y, m] = String(h.effective_from).slice(0, 7).split('-'); return `${m}/${y}` })()
                            : <span title="vigência não informada (legado)" style={{ color: 'var(--text-light)' }}>—</span>}
                        </td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                          {h.sold_hours != null ? `${Number(h.sold_hours)}h` : '—'}
                        </td>
                        <td className="px-3 py-2">{h.changer?.name ?? '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                          {h.created_at ? new Date(h.created_at).toLocaleDateString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-end mt-5">
              <button onClick={() => setSoldHoursHistoryOpen(false)} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectEditByIdModal({ projectId, onClose, onSaved }: { projectId: number; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState<ProjectFull | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get<ProjectFull>(`/projects/${projectId}`).then(setP).catch(() => toast.error('Erro ao carregar projeto')).finally(() => setLoading(false))
  }, [projectId])
  if (loading) return <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}><p className="text-sm animate-pulse" style={{ color: 'var(--text-light)' }}>Carregando...</p></div>
  if (!p) return null
  return <ProjectInlineEditModal project={p} onClose={onClose} onSaved={onSaved} />
}

// ─── Página ───────────────────────────────────────────────────────────────────

// useSearchParams exige Suspense no build de produção (next build) — wrapper abaixo.
export default function GestaoProjetosPage() {
  return <Suspense fallback={null}><GestaoProjetosInner /></Suspense>
}

function GestaoProjetosInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()

  // Consultor não acessa esta rotina, nem com extra_permissions — redireciona.
  useEffect(() => {
    if (user?.type === 'consultor') {
      router.replace('/meu-painel')
    }
  }, [user?.type, router])

  const isAdmin = user?.type === 'admin'
  const isCoordenador = user?.type === 'coordenador'
  const isCliente = user?.type === 'cliente'
  const ep = user?.extra_permissions ?? []
  const isAdministrativo = user?.type === 'administrativo'
  const canWrite = isAdmin || isAdministrativo
  const canEdit = canWrite
  const canChangeStatus = !isCliente
  const canDelete = canWrite

  const { filters: flt, set: setFilter } = usePersistedFilters(
    'gestao_projetos',
    user?.id,
    {
      search:             '',
      statusFilters:      [] as string[],
      clienteFilters:     [] as string[],
      saudeFilters:       [] as string[],
      soNegativos:        false,
      coordFilter:        '',
      filterContractType: '',
      filterServiceTypes: [] as string[],
      filterCoordinators: [] as string[],
      filterExecutives:   [] as string[],
      yearMonths:         [new Date().toISOString().slice(0, 7)] as string[],
    },
  )
  const { search, statusFilters, clienteFilters, saudeFilters, soNegativos, coordFilter, filterContractType, filterServiceTypes, filterCoordinators, filterExecutives, yearMonths } = flt
  const setSearch             = (v: string)   => setFilter('search', v)
  const setStatus             = (v: string[]) => setFilter('statusFilters', v)
  const setCliente            = (v: string[]) => setFilter('clienteFilters', v)
  const setSaude              = (v: string[]) => setFilter('saudeFilters', v)
  const setSoNegativos        = (v: boolean)  => setFilter('soNegativos', v)
  // Toggle multi-seleção: '' (Todos) limpa; cor adiciona/remove do conjunto.
  const toggleSaude = (id: string) => {
    if (id === '') { setSaude([]); return }
    setSaude(saudeFilters.includes(id) ? saudeFilters.filter(x => x !== id) : [...saudeFilters, id])
  }
  const setCoord              = (v: string)   => setFilter('coordFilter', v)
  const setFilterContractType = (v: string)   => setFilter('filterContractType', v)
  const setFilterServiceType  = (v: string[]) => setFilter('filterServiceTypes', v)
  const setFilterCoordinators = (v: string[]) => setFilter('filterCoordinators', v)
  const setFilterExecutives   = (v: string[]) => setFilter('filterExecutives', v)
  const setYearMonths         = (v: string[]) => setFilter('yearMonths', v)

  // Opções de mês p/ a coluna Consumo (multi-mês). Componente custom (Safari não
  // suporta <input type="month"> — renderizava como texto). Últimos 24 meses.
  const monthOptions = useMemo(() => {
    const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    const out: { id: string; name: string }[] = []
    const now = new Date()
    let y = now.getFullYear(), m = now.getMonth()
    for (let i = 0; i < 24; i++) {
      out.push({ id: `${y}-${String(m + 1).padStart(2, '0')}`, name: `${MES[m]}/${y}` })
      m--; if (m < 0) { m = 11; y-- }
    }
    return out
  }, [])

  const clearAllFilters = () => {
    setSearch('')
    setStatus([])
    setCliente([])
    setSaude([])
    setSoNegativos(false)
    setCoord('')
    setFilterContractType('')
    setFilterServiceType([])
    setFilterCoordinators([])
    setFilterExecutives([])
  }

  const hasActiveFilters = !!(search || statusFilters.length || clienteFilters.length || saudeFilters.length || soNegativos || coordFilter || filterContractType || filterServiceTypes.length || filterCoordinators.length || filterExecutives.length)

  const [projects, setProjects]   = useState<ProjectWithTeam[]>([])
  const [showClosed, setShowClosed] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [expanded, setExpanded]   = useState<Set<number>>(new Set())
  const [serviceTypes, setServiceTypes] = useState<{ id: number; name: string }[]>([])
  const [coordinatorsList, setCoordinatorsList] = useState<{ id: string; name: string }[]>([])
  const [executivesList, setExecutivesList]     = useState<{ id: string; name: string }[]>([])
  const [customerExecutiveMap, setCustomerExecutiveMap] = useState<Record<number, number>>({})
  // Nome do executivo por cliente (coluna Executivo): cruza customerExecutiveMap × executivesList.
  const executiveNameByCustomer = useMemo(() => {
    const byId = new Map(executivesList.map(e => [e.id, e.name]))
    const out: Record<number, string> = {}
    for (const [cid, eid] of Object.entries(customerExecutiveMap)) {
      const nm = byId.get(String(eid))
      if (nm) out[Number(cid)] = nm
    }
    return out
  }, [executivesList, customerExecutiveMap])
  const [multiContratual, setMultiContratual] = useState(false)
  const [multiShowClosed, setMultiShowClosed] = useState(false) // toggle: ver encerrados/cancelados na árvore multi-contratual
  const [rows, setRows] = useState<TreeRow[]>([])
  const [allCustomers, setAllCustomers] = useState<{ id: string; name: string }[]>([])

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

  // Modal de edição de projeto
  const [editProjectId, setEditProjectId] = useState<number | null>(null)

  // Abre modal de edição se URL contém ?edit=ID
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('edit')
    if (p) setEditProjectId(Number(p))
  }, [])

  // Modal de alteração de status
  const [statusModal, setStatusModal] = useState<{ open: boolean; project: ProjectWithTeam | null; newStatus: string }>({ open: false, project: null, newStatus: '' })
  const [statusSaving, setStatusSaving] = useState(false)

  // Modal de exclusão de projeto
  const [deleteProject, setDeleteProject] = useState<ProjectWithTeam | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Projetos com mensagens não lidas
  const [unreadProjectIds, setUnreadProjectIds] = useState<Set<number>>(new Set())
  useEffect(() => {
    if (!user || (user.type !== 'admin' && user.type !== 'coordenador')) return
    api.get<{ project_ids: number[] }>('/messages/unread-projects')
      .then(r => setUnreadProjectIds(new Set(r.project_ids ?? [])))
      .catch(() => {})
  }, [user])

  // ── Seleção de projetos em massa ──────────────────────────────────────────
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<number>>(new Set())
  const toggleProjectSelect = (id: number) =>
    setSelectedProjectIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Modal A — alocar em massa (seleciona projetos → escolhe recursos)
  const [bulkAllocOpen,     setBulkAllocOpen]     = useState(false)
  const [bulkAllocTab,      setBulkAllocTab]       = useState<'consultores' | 'grupos'>('consultores')
  const [bulkAllocMode,     setBulkAllocMode]      = useState<'add' | 'replace'>('add')
  const [bulkAllocConsIds,  setBulkAllocConsIds]   = useState<Set<number>>(new Set())
  const [bulkAllocGrpIds,   setBulkAllocGrpIds]    = useState<Set<number>>(new Set())
  const [bulkAllocSearch,   setBulkAllocSearch]    = useState('')
  const [bulkAllocSaving,   setBulkAllocSaving]    = useState(false)

  // Modal B — alocar por recurso (escolhe recurso → seleciona projetos)
  const [byResOpen,     setByResOpen]     = useState(false)
  const [byResTab,      setByResTab]      = useState<'consultor' | 'grupo'>('consultor')
  const [byResConsId,   setByResConsId]   = useState<number | null>(null)
  const [byResGroupId,  setByResGroupId]  = useState<number | null>(null)
  const [byResProjIds,  setByResProjIds]  = useState<Set<number>>(new Set())
  const [byResMode,     setByResMode]     = useState<'add' | 'replace'>('add')
  const [byResSearch,   setByResSearch]   = useState('')
  const [byResStep,     setByResStep]     = useState<1 | 2>(1)
  const [byResSaving,   setByResSaving]   = useState(false)

  useEffect(() => {
    const items = (r: any) => Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
    api.get<any>('/service-types?pageSize=100').then(r => setServiceTypes(items(r))).catch(() => {})
    api.get<any>('/users?type=coordenador&coordinator_type=projetos&pageSize=200')
      .then(r => setCoordinatorsList(items(r).map((u: any) => ({ id: String(u.id), name: u.name }))))
      .catch(() => {})
    api.get<any>('/executives?pageSize=200')
      .then(r => setExecutivesList(items(r).map((e: any) => ({ id: String(e.id), name: e.name }))))
      .catch(() => {})
  }, [])

  const PROJECT_STATUSES = [
    { value: 'awaiting_start', label: 'Aguardando Início' },
    { value: 'started',        label: 'Em Andamento' },
    { value: 'paused',         label: 'Pausado' },
    { value: 'finished',       label: 'Encerrado' },
    { value: 'cancelled',      label: 'Cancelado' },
  ]

  const handleChangeStatus = async () => {
    if (!statusModal.project || !statusModal.newStatus) return
    setStatusSaving(true)
    const projectId = statusModal.project.id
    const newStatus = statusModal.newStatus
    try {
      const res = await api.patch<{ status: string; status_display: string }>(`/projects/${projectId}/status`, { status: newStatus })
      toast.success('Status atualizado com sucesso')
      setStatusModal({ open: false, project: null, newStatus: '' })
      // Atualiza estado local imediatamente — sem depender de reload
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: res.status, status_display: res.status_display } : p))
      setRows(prev => prev.map(r => r.id === projectId ? { ...r, status: res.status, status_display: res.status_display } : r))
    } catch { toast.error('Erro ao atualizar status') }
    finally { setStatusSaving(false) }
  }

  const handleConsultantManualToggle = useCallback(async (projectId: number, userId: number, allow: boolean) => {
    try {
      await api.put(`/projects/${projectId}/consultants/${userId}/manual-timesheet`, { allow })
      setProjects(prev => prev.map(p => {
        if (p.id !== projectId) return p
        return {
          ...p,
          consultants: (p.consultants ?? []).map(c =>
            c.id === userId ? { ...c, pivot: { allow_manual_timesheet: allow } } : c
          ),
        }
      }))
      setRows(prev => prev.map(r => {
        if (r.id !== projectId) return r
        return {
          ...r,
          consultants: (r.consultants ?? []).map(c =>
            c.id === userId ? { ...c, pivot: { allow_manual_timesheet: allow } } : c
          ),
        }
      }))
      toast.success(allow ? 'Apontamento manual liberado' : 'Apontamento manual bloqueado')
    } catch { toast.error('Erro ao atualizar permissão') }
  }, [])

  // Modal de aportes
  const [aportesProject, setAportesProject]   = useState<ProjectWithTeam | null>(null)
  const [contributions, setContributions]     = useState<HourContribution[]>([])
  const [contribLoading, setContribLoading]   = useState(false)
  const [contribModal, setContribModal]       = useState<{ open: boolean; item?: HourContribution }>({ open: false })
  const [contribForm, setContribForm]         = useState({ contributed_hours: '', hourly_rate: '', contributed_at: '', description: '', motivo: 'aporte', reason: '' })
  const [contribSaving, setContribSaving]     = useState(false)
  const [contribDeleteConfirm, setContribDeleteConfirm] = useState<HourContribution | null>(null)
  // Aporte cujo histórico de auditoria está expandido (id) — null = nenhum.
  const [contribHistoryOpen, setContribHistoryOpen] = useState<number | null>(null)

  // Abre modal de Aportes do projeto se URL contém ?aportes=ID.
  // Fallback: a navegação principal usa o modal do ProjectViewModal (aba Aportes)
  // sem sair do Kanban, mas mantemos a entrada via URL pra deep-link/compartilhamento.
  useEffect(() => {
    const projectIdParam = new URLSearchParams(window.location.search).get('aportes')
    if (!projectIdParam) return
    let cancelled = false
    api.get<ProjectWithTeam>(`/projects/${projectIdParam}`)
      .then(p => { if (!cancelled) setAportesProject(p) })
      .catch(() => toast.error('Projeto não encontrado'))
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams({ pageSize: '1000', gestao: 'true' })
    if (yearMonths.length) qs.set('year_months', yearMonths.join(',')) // alimenta a coluna Consumo Mensal (soma dos meses selecionados)
    if (multiContratual) { qs.set('parent_projects_only', 'true'); qs.set('with_children_only', 'true') }
    api.get<PaginatedResponse<ProjectWithTeam>>(`/projects?${qs}`)
      .then(res => {
        const items = res.items ?? []
        setProjects(items)
        if (multiContratual) setRows(items.map(p => toTreeRow(p)))
      })
      .catch(() => toast.error('Erro ao carregar projetos'))
      .finally(() => setLoading(false))
  }, [multiContratual, refreshKey, yearMonths.join(',')])

  useEffect(() => {
    api.get<any>('/customers?pageSize=500').then(r => {
      const items: any[] = Array.isArray(r?.items) ? r.items : []
      setAllCustomers(items.map((c: any) => ({ id: String(c.id), name: c.name })))
      const map: Record<number, number> = {}
      items.forEach((c: any) => { if (c.executive_id) map[c.id] = c.executive_id })
      setCustomerExecutiveMap(map)
    }).catch(() => {})
  }, [])

  // União: clientes dos projetos carregados + todos da API (sem duplicatas)
  const clientes = useMemo(() => {
    const seen = new Set<string>()
    const fromProjects = projects
      .filter(p => p.customer?.name)
      .map(p => ({ id: String(p.customer_id), name: p.customer!.name }))
    const merged = [...fromProjects, ...allCustomers]
    return merged
      .filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [projects, allCustomers])

  const availableContractTypes = useMemo(() => {
    const seen = new Set<string>()
    const result: { id: string; name: string }[] = []
    for (const p of projects) {
      if (p.contract_type_display && !seen.has(p.contract_type_display)) {
        seen.add(p.contract_type_display)
        result.push({ id: p.contract_type_display, name: p.contract_type_display })
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [projects])

  type SortKey = 'name' | 'customer' | 'contract_type' | 'service_type' | 'monthly_hours' | 'sold_hours' | 'total_cont' | 'consumed' | 'balance' | 'pct' | 'coord'
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const toggleSort = (k: SortKey) => {
    if (sortKey !== k) { setSortKey(k); setSortDir('asc'); return }
    if (sortDir === 'asc') { setSortDir('desc'); return }
    setSortKey(null); setSortDir('asc')
  }

  const filtered = useMemo(() => {
    return projects.filter(p => {
      // Fila separada: encerrados/cancelados só aparecem na aba "Encerrados" (showClosed);
      // nas demais abas eles ficam de fora.
      const isClosed = p.status === 'finished' || p.status === 'cancelled'
      if (showClosed ? !isClosed : isClosed) return false
      if (filterContractType && p.contract_type_display !== filterContractType) return false
      if (filterServiceTypes.length > 0) {
        const stId = (p as any).service_type_id ?? (p as any).service_type?.id
        if (!filterServiceTypes.includes(String(stId))) return false
      }
      if (statusFilters.length > 0 && !statusFilters.includes(p.status ?? '')) return false
      if (clienteFilters.length > 0 && !clienteFilters.includes(String(p.customer_id))) return false
      if (filterCoordinators.length > 0) {
        const coords = (p as ProjectWithTeam).coordinators ?? []
        if (!coords.some(c => filterCoordinators.includes(String(c.id)))) return false
      }
      if (filterExecutives.length > 0) {
        const execId = customerExecutiveMap[p.customer_id]
        if (!execId || !filterExecutives.includes(String(execId))) return false
      }
      if (saudeFilters.length > 0) {
        const { displaySold, consumedHours } = calcProjHours(p)
        if (!saudeFilters.includes(projectHealth(p, displaySold, consumedHours, isAdmin).color)) return false
      }
      if (coordFilter) {
        const cm = coordinationMeta(p, calcProjHours(p).displaySold)
        if (!cm.explicit || cm.risk !== coordFilter) return false
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
  }, [projects, search, statusFilters, clienteFilters, saudeFilters, coordFilter, filterContractType, filterServiceTypes, filterCoordinators, filterExecutives, customerExecutiveMap, showClosed])

  const sortedFiltered = useMemo(() => {
    // Filtro "só negativos" (card Horas Negativas): saldo visível < 0 (exclui On Demand).
    const baseList = soNegativos ? filtered.filter(p => visibleSaldoOf(p) < 0) : filtered
    if (!sortKey) return baseList
    const dir = sortDir === 'asc' ? 1 : -1
    const getValue = (p: ProjectWithTeam): number | string => {
      const ctName = String((p as any).contract_type?.name ?? p.contract_type_display ?? '').toLowerCase()
      const isBhMensal = ctName.includes('mensal')
      switch (sortKey) {
        case 'name':          return p.name ?? ''
        case 'customer':      return p.customer?.name ?? ''
        case 'contract_type': return p.contract_type_display ?? p.contract_type?.name ?? ''
        case 'service_type':  return p.service_type?.name ?? ''
        case 'monthly_hours': return isBhMensal ? (p.sold_hours ?? 0) : -Infinity
        case 'sold_hours':    return calcProjHours(p).displaySold
        case 'total_cont':    return ((p as any).total_available_hours ?? p.sold_hours ?? 0)
        case 'consumed':      return calcProjHours(p).consumedHours
        case 'balance':       return (p as any).general_hours_balance ?? 0
        case 'pct': {
          const { displaySold, consumedHours } = calcProjHours(p)
          return projectHealth(p, displaySold, consumedHours).pct
        }
        case 'coord': {
          const bank = Number((p as any).coordination_hours ?? 0)
          if (bank <= 0) return -1
          return (Number((p as any).coordination_consumed_hours ?? 0) / bank) * 100
        }
      }
    }
    return [...baseList].sort((a, b) => {
      const va = getValue(a)
      const vb = getValue(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'pt-BR') * dir
    })
  }, [filtered, sortKey, sortDir, soNegativos])

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

  const filteredRows = useMemo(() => {
    if (!multiContratual) return [] as TreeRow[]
    const parentRows = rows.filter(r => r._level === 0)
    const filteredParents = parentRows.filter(p => {
      const isClosed = p.status === 'finished' || p.status === 'cancelled'
      // Multi-contratual: encerrados/cancelados só aparecem com o toggle "Ver encerrados" ligado.
      if (!multiShowClosed && isClosed) return false
      if (statusFilters.length > 0 && !statusFilters.includes(p.status ?? '')) return false
      if (clienteFilters.length > 0 && !clienteFilters.includes(String(p.customer_id))) return false
      if (filterCoordinators.length > 0) {
        const coords = (p as ProjectWithTeam).coordinators ?? []
        if (!coords.some(c => filterCoordinators.includes(String(c.id)))) return false
      }
      if (filterExecutives.length > 0) {
        const execId = customerExecutiveMap[p.customer_id]
        if (!execId || !filterExecutives.includes(String(execId))) return false
      }
      if (saudeFilters.length > 0) {
        const { displaySold, consumedHours } = calcProjHours(p)
        if (!saudeFilters.includes(projectHealth(p, displaySold, consumedHours, isAdmin).color)) return false
      }
      if (soNegativos && visibleSaldoOf(p) >= 0) return false
      if (coordFilter) {
        const cm = coordinationMeta(p, calcProjHours(p).displaySold)
        if (!cm.explicit || cm.risk !== coordFilter) return false
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
      if (live._isExpanded) result.push(...rows.filter(r => {
        if (r._parentId !== live.id || r._level <= 0) return false
        // Filhos encerrados/cancelados só aparecem com o toggle "Ver encerrados" ligado.
        const childClosed = r.status === 'finished' || r.status === 'cancelled'
        return multiShowClosed || !childClosed
      }))
    }
    return result
  }, [rows, multiContratual, statusFilters, clienteFilters, saudeFilters, soNegativos, search, filterCoordinators, filterExecutives, customerExecutiveMap, multiShowClosed])

  // ── Métricas dos cards ──
  const stats = useMemo(() => {
    // Evita DUPLICAR horas de filho nos cards: se o PAI está no filtro, o consumo/vendidas do
    // filho já estão agregados no banco do pai — só conta o filho quando o pai NÃO está no filtro.
    const filteredIds = new Set(filtered.map(p => p.id))
    const base = filtered.filter(p => {
      const parentId = p.parent_project_id ?? p.parent_project?.id
      return !(parentId && filteredIds.has(parentId))
    })
    const ativos    = base.filter(p => ['active', 'started'].includes(p.status)).length
    const vendidas  = base.reduce((s, p) => s + calcProjHours(p).displaySold, 0)
    const consumidas = base.reduce((s, p) => s + calcProjHours(p).consumedHours, 0)
    const saldo     = base.reduce((s, p) => s + visibleSaldoOf(p), 0)
    // % médio e contagem de críticos seguem a saúde efetiva (BH Mensal já considera
    // o próximo aporte) em vez do balance_percentage cru do backend.
    const healthOf = (p: ProjectWithTeam) => { const h = calcProjHours(p); return projectHealth(p, h.displaySold, h.consumedHours, isAdmin) }
    const comPct    = base.filter(p => calcProjHours(p).displaySold > 0)
    const avgPct    = comPct.length
      ? comPct.reduce((s, p) => s + healthOf(p).pct, 0) / comPct.length
      : 0
    const criticos  = base.filter(p => healthOf(p).color === 'red').length
    // Horas negativas: soma dos saldos VISÍVEIS negativos (exclui On Demand) + nº de contratos estourados.
    const horasNegativas = base.reduce((s, p) => { const b = visibleSaldoOf(p); return b < 0 ? s + b : s }, 0)
    const comSaldoNeg = base.filter(p => visibleSaldoOf(p) < 0).length
    return { ativos, vendidas, consumidas, saldo, avgPct, criticos, horasNegativas, comSaldoNeg }
  }, [filtered])

  const loadContributions = async (projectId: number) => {
    setContribLoading(true)
    try {
      const r = await api.get<{ items: HourContribution[] }>(`/projects/${projectId}/hour-contributions`)
      setContributions((r.items ?? []).map(c => ({
        ...c,
        contributed_hours: Number(c.contributed_hours),
        hourly_rate: Number(c.hourly_rate),
        total_value: Number(c.contributed_hours) * Number(c.hourly_rate),
      })))
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
      const payload: Record<string, unknown> = {
        contributed_hours: Number(contribForm.contributed_hours),
        hourly_rate: Number(contribForm.hourly_rate),
        contributed_at: contribForm.contributed_at,
        description: contribForm.description || null,
        motivo: contribForm.motivo || 'aporte',
      }
      if (contribModal.item) {
        // Auditoria: motivo da alteração (opcional) vai pro histórico.
        if (contribForm.reason.trim()) payload.reason = contribForm.reason.trim()
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

  const [viewProject, setViewProject] = useState<ProjectWithTeam | null>(null)
  const [viewProjectFull, setViewProjectFull] = useState<ProjectFull | null>(null)
  const [viewAttachments, setViewAttachments] = useState<any[]>([])
  const downloadViewAtt = async (projId: number, att: any) => {
    const res = await fetch(`/api/v1/projects/${projId}/attachments/${att.id}`, { credentials: 'same-origin' })
    if (!res.ok) { toast.error('Erro ao baixar arquivo'); return }
    const blob = await res.blob(); const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = att.original_name; a.click(); URL.revokeObjectURL(url)
  }
  const [viewProjectLoading, setViewProjectLoading] = useState(false)
  const [viewProjectTab, setViewProjectTab] = useState<'overview' | 'extrato' | 'cost'>('overview')
  // Histórico de valores-hora (somente leitura) — GET /projects/{id}/change-history?field_name=hourly_rate
  const [rateHistoryOpen, setRateHistoryOpen] = useState(false)
  const [rateHistory, setRateHistory] = useState<any[]>([])
  const [rateHistoryLoading, setRateHistoryLoading] = useState(false)
  const openRateHistory = async (projectId: number) => {
    setRateHistoryOpen(true)
    setRateHistoryLoading(true)
    try {
      const res = await api.get<{ hasNext: boolean; items: any[] }>(`/projects/${projectId}/change-history?field_name=hourly_rate&pageSize=100`)
      setRateHistory(Array.isArray(res?.items) ? res.items : [])
    } catch {
      setRateHistory([])
      toast.error('Erro ao carregar histórico de valores')
    } finally {
      setRateHistoryLoading(false)
    }
  }
  const [viewCostSummary, setViewCostSummary] = useState<CostSummary | null>(null)
  const [viewCostLoading, setViewCostLoading] = useState(false)
  const [messagesProject, setMessagesProject] = useState<ProjectWithTeam | null>(null)
  const [dataModal, setDataModal] = useState<{ project: ProjectWithTeam; tab: 'timesheets' | 'expenses' } | null>(null)
  const [openPeriodProject, setOpenPeriodProject] = useState<ProjectWithTeam | null>(null)
  const [detachModal, setDetachModal] = useState<{ project: ProjectWithTeam; newCode: string; suggestedCode: string; codeError: string } | null>(null)
  const [detaching, setDetaching] = useState(false)
  const [attachModal, setAttachModal] = useState<{ project: ProjectWithTeam; parentId: string; parents: { id: number; name: string; code: string }[]; loading: boolean } | null>(null)
  const [attaching, setAttaching] = useState(false)

  // Auto-open messages modal when ?messages=PROJECT_ID is in URL (deep-link do sino).
  // USA useSearchParams (reativo) → reage ao router.push do sino MESMO já estando nesta página
  // (antes dependia só de [projects] e não reabria = "nem abre"). Se o projeto não está na lista
  // carregada (filtro), busca por id. Limpa o ?messages via router.replace (atualiza o param).
  const messagesParam = searchParams.get('messages')
  useEffect(() => {
    if (!messagesParam) return
    const clear = () => router.replace('/gestao-projetos', { scroll: false })
    const found = projects.find(p => String(p.id) === messagesParam)
    if (found) {
      setMessagesProject(found)
      clear()
    } else if (projects.length > 0) {
      api.get<ProjectWithTeam>(`/projects/${messagesParam}`)
        .then(p => { if (p?.id) setMessagesProject(p) })
        .catch(() => {})
        .finally(clear)
    }
  }, [projects, messagesParam])

  const handleMenuAction = async (action: 'view' | 'costs' | 'timesheets' | 'expenses' | 'team' | 'aportes' | 'messages' | 'open-period' | 'detach-parent' | 'attach-parent', project: ProjectWithTeam) => {
    if (action === 'attach-parent') {
      setAttachModal({ project, parentId: '', parents: [], loading: true })
      try {
        const r = await api.get<any>(`/projects?customer_id=${project.customer_id}&parent_projects_only=true&pageSize=200&exclude_id=${project.id}`)
        const items: any[] = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
        setAttachModal(p => p ? { ...p, parents: items.map((x: any) => ({ id: x.id, name: x.name, code: x.code })), loading: false } : p)
      } catch {
        setAttachModal(p => p ? { ...p, loading: false } : p)
        toast.error('Erro ao carregar pais disponíveis')
      }
      return
    }
    if (action === 'detach-parent') {
      setDetachModal({ project, newCode: '', suggestedCode: '', codeError: '' })
      // Sugere próximo código baseado no cliente
      try {
        const r = await api.get<{ code: string }>(`/projects/next-code?customer_id=${project.customer_id}`)
        const sug = r?.code ?? ''
        setDetachModal(prev => prev ? { ...prev, suggestedCode: sug, newCode: sug } : prev)
      } catch { /* sem sugestão, user digita manual */ }
      return
    }
    if (action === 'view') {
      setViewProject(project)
      setViewProjectFull(null)
      setViewAttachments([])
      setViewProjectTab('overview')
      setViewCostSummary(null)
      setViewProjectLoading(true)
      api.get<ProjectFull>(`/projects/${project.id}`)
        .then(r => setViewProjectFull(r))
        .catch(() => {})
        .finally(() => setViewProjectLoading(false))
      api.get<any[]>(`/projects/${project.id}/attachments`)
        .then(r => setViewAttachments(Array.isArray(r) ? r : []))
        .catch(() => {})
      return
    }
    if (action === 'messages') { setMessagesProject(project); return }
    if (action === 'open-period') { setOpenPeriodProject(project); return }
    if (action === 'timesheets') { setDataModal({ project, tab: 'timesheets' }); return }
    if (action === 'expenses')   { setDataModal({ project, tab: 'expenses'   }); return }
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
      // Pré-seleciona os grupos já vinculados ao projeto (antes começava vazio,
      // dando impressão de que o save não persistia).
      setSelectedGroupIds(new Set(((project as any).consultant_groups ?? []).map((g: any) => g.id)))
      try {
        const promises: Promise<void>[] = []
        if (allConsultants.length === 0) {
          promises.push(
            api.get<{ items: { id: number; name: string }[] }>('/users?exclude_type=cliente&pageSize=200')
              .then(r => setAllConsultants(r.items ?? []))
          )
        }
        if (consultantGroups.length === 0) {
          promises.push(
            api.get<any>('/consultant-groups?pageSize=200')
              .then(r => setConsultantGroups(r.items ?? r.data ?? []))
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
      setProjects(prev => prev.map(p => p.id === teamProject.id
        ? {
            ...p,
            consultants: allConsultants.filter(c => selectedIds.has(c.id)).map(c => ({ ...c, email: '' })),
            consultant_groups: consultantGroups.filter(g => selectedGroupIds.has(g.id)).map(g => ({ id: g.id, name: g.name })),
          } as typeof p
        : p
      ))
      if (viewProject?.id === teamProject.id) {
        setViewProjectFull(null)
        setViewProjectLoading(true)
        api.get<ProjectFull>(`/projects/${teamProject.id}`)
          .then(r => setViewProjectFull(r))
          .catch(() => {})
          .finally(() => setViewProjectLoading(false))
      }
    } catch { toast.error('Erro ao salvar equipe') }
    finally { setTeamSaving(false) }
  }

  const ensureTeamData = async () => {
    const promises: Promise<void>[] = []
    if (allConsultants.length === 0)
      promises.push(api.get<{ items: { id: number; name: string }[] }>('/users?exclude_type=cliente&pageSize=200').then(r => setAllConsultants(r.items ?? [])))
    if (consultantGroups.length === 0)
      promises.push(api.get<any>('/consultant-groups?pageSize=200').then(r => setConsultantGroups(r.data ?? r.items ?? [])))
    await Promise.all(promises)
  }

  const openBulkAlloc = async () => {
    setBulkAllocConsIds(new Set())
    setBulkAllocGrpIds(new Set())
    setBulkAllocSearch('')
    setBulkAllocTab('consultores')
    setBulkAllocMode('add')
    setBulkAllocOpen(true)
    await ensureTeamData()
  }

  const executeBulkAlloc = async () => {
    setBulkAllocSaving(true)
    let ok = 0; let skipped = 0
    try {
      for (const projectId of selectedProjectIds) {
        const project = projects.find(p => p.id === projectId)
        if (project?.status === 'finished' || project?.status === 'cancelled') { skipped++; continue }
        try {
          let consultantIds: number[]
          if (bulkAllocMode === 'replace') {
            consultantIds = [...bulkAllocConsIds]
          } else {
            const existing = new Set((project?.consultants ?? []).map((c: any) => c.id))
            bulkAllocConsIds.forEach(id => existing.add(id))
            consultantIds = [...existing]
          }
          await api.put(`/projects/${projectId}`, {
            consultant_ids: consultantIds,
            consultant_group_ids: [...bulkAllocGrpIds],
          })
          ok++
        } catch { skipped++ }
      }
      if (ok > 0) toast.success(`Equipe atualizada em ${ok} projeto(s)${skipped > 0 ? ` · ${skipped} ignorado(s)` : ''}`)
      else toast.warning(`Nenhum projeto foi atualizado (${skipped} ignorado(s) — finalizados ou cancelados)`)
      setBulkAllocOpen(false)
      setSelectedProjectIds(new Set())
      setRefreshKey(k => k + 1)
    } catch { toast.error('Erro inesperado ao alocar equipe') }
    finally { setBulkAllocSaving(false) }
  }

  const openByRes = async () => {
    setByResConsId(null)
    setByResGroupId(null)
    setByResProjIds(new Set())
    setByResSearch('')
    setByResTab('consultor')
    setByResMode('add')
    setByResStep(1)
    setByResOpen(true)
    await ensureTeamData()
  }

  const executeByRes = async () => {
    if (byResProjIds.size === 0) { toast.error('Selecione ao menos um projeto'); return }
    if (byResTab === 'consultor' && !byResConsId) { toast.error('Selecione um consultor'); return }
    if (byResTab === 'grupo' && !byResGroupId)    { toast.error('Selecione um grupo'); return }
    setByResSaving(true)
    let ok = 0; let skipped = 0
    try {
      for (const projectId of byResProjIds) {
        const project = projects.find(p => p.id === projectId)
        if (project?.status === 'finished' || project?.status === 'cancelled') { skipped++; continue }
        try {
          if (byResTab === 'consultor' && byResConsId) {
            let consultantIds: number[]
            if (byResMode === 'replace') {
              consultantIds = [byResConsId]
            } else {
              const existing = new Set((project?.consultants ?? []).map((c: any) => c.id))
              existing.add(byResConsId)
              consultantIds = [...existing]
            }
            await api.put(`/projects/${projectId}`, { consultant_ids: consultantIds })
          } else if (byResTab === 'grupo' && byResGroupId) {
            await api.put(`/projects/${projectId}`, { consultant_group_ids: [byResGroupId] })
          }
          ok++
        } catch { skipped++ }
      }
      if (ok > 0) toast.success(`Recurso alocado em ${ok} projeto(s)${skipped > 0 ? ` · ${skipped} ignorado(s)` : ''}`)
      else toast.warning(`Nenhum projeto foi atualizado (${skipped} ignorado(s) — finalizados ou cancelados)`)
      setByResOpen(false)
      setRefreshKey(k => k + 1)
    } catch { toast.error('Erro inesperado ao alocar recurso') }
    finally { setByResSaving(false) }
  }

  const toggleExpand = (id: number) =>
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <AppLayout>
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-8">
        <PageHeader
          icon={Layers}
          title="Gestão de Contratos"
          subtitle="Visão operacional dos contratos sob sua coordenação"
        />

        {/* ── Cards de Resumo ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          <SummaryCard
            icon={<Layers size={15} color="var(--primary)" />}
            label="Projetos Ativos"
            value={String(stats.ativos)}
            sub={`de ${filtered.length} total`}
          />
          <SummaryCard
            icon={<Clock size={15} color="var(--primary)" />}
            label="Horas Vendidas"
            value={fmt(stats.vendidas, Number.isInteger(stats.vendidas) ? 0 : 1)}
            sub="horas contratadas"
          />
          <SummaryCard
            icon={<TrendingUp size={15} color="var(--primary)" />}
            label="Horas Consumidas"
            value={fmt(stats.consumidas, 1)}
            sub="apontadas aprovadas"
          />
          <SummaryCard
            icon={<BarChart2 size={15} color={stats.saldo < 0 ? 'var(--danger-border)' : 'var(--primary)'} />}
            label="Saldo Total"
            value={fmt(stats.saldo, 1) + ' h'}
            sub={stats.saldo < 0 ? 'saldo negativo' : 'horas disponíveis'}
          />
          <SummaryCard
            icon={<AlertTriangle size={15} color={stats.criticos > 0 ? 'var(--danger-border)' : 'var(--primary)'} />}
            label="Consumo Médio"
            value={`${Math.round(stats.avgPct)}%`}
            sub={stats.criticos > 0 ? `${stats.criticos} crítico(s)` : 'dentro do esperado'}
          />
          <SummaryCard
            icon={<TrendingDown size={15} color={stats.horasNegativas < 0 ? 'var(--danger-border)' : 'var(--primary)'} />}
            label="Horas Negativas"
            value={fmt(stats.horasNegativas, 1) + ' h'}
            sub={soNegativos ? 'filtrando negativos — clique p/ limpar' : (stats.comSaldoNeg > 0 ? `${stats.comSaldoNeg} contrato(s) estourado(s)` : 'nenhum saldo negativo')}
            onClick={() => setSoNegativos(!soNegativos)}
            active={soNegativos}
          />
        </div>

        {/* ── Filtros ── */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-48 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
            <input
              type="text"
              placeholder="Buscar projeto, código ou cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 h-9 rounded-xl text-xs outline-none"
              style={{ ...inputStyle }}
            />
          </div>
          <MultiSelect
            value={yearMonths}
            onChange={v => setYearMonths(v)}
            options={monthOptions}
            placeholder="Mês (Consumo)"
          />
          <MultiSelect
            value={clienteFilters}
            onChange={v => setCliente(v)}
            options={clientes}
            placeholder="Todos os clientes"
          />
          <MultiSelect
            value={statusFilters}
            onChange={v => setStatus(v)}
            placeholder="Todos os status"
            options={[
              { id: 'started',        name: 'Em Andamento' },
              { id: 'active',         name: 'Ativo' },
              { id: 'awaiting_start', name: 'Aguardando Início' },
              { id: 'paused',         name: 'Pausado' },
              { id: 'finished',       name: 'Finalizado' },
              { id: 'cancelled',      name: 'Cancelado' },
            ]}
          />
          <MultiSelect
            value={filterServiceTypes}
            onChange={v => setFilterServiceType(v)}
            placeholder="Todos os serviços"
            options={serviceTypes.map(s => ({ id: String(s.id), name: s.name }))}
          />
          {isAdmin && coordinatorsList.length > 0 && (
            <MultiSelect
              value={filterCoordinators}
              onChange={v => setFilterCoordinators(v)}
              options={coordinatorsList}
              placeholder="Todos os coordenadores"
            />
          )}
          {isAdmin && executivesList.length > 0 && (
            <MultiSelect
              value={filterExecutives}
              onChange={v => setFilterExecutives(v)}
              options={executivesList}
              placeholder="Todos os executivos"
            />
          )}
          {/* Filtro de Saúde — segmented control */}
          <div
            className="flex items-center gap-0.5 rounded-full p-1"
            style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}
          >
            {([
              { id: '',       label: 'Todos',    activeBg: 'var(--primary)',         activeFg: 'var(--primary-fg)' },
              { id: 'green',  label: 'Saudável', activeBg: 'var(--success-border)',  activeFg: 'var(--surface)' },
              { id: 'yellow', label: 'Atenção',  activeBg: 'var(--warning-border)',  activeFg: 'var(--surface)' },
              { id: 'red',    label: 'Crítico',  activeBg: 'var(--danger-border)',   activeFg: 'var(--surface)' },
            ] as const).map(opt => {
              const isActive = opt.id === '' ? saudeFilters.length === 0 : saudeFilters.includes(opt.id)
              return (
                <button key={opt.id} type="button"
                  onClick={() => toggleSaude(opt.id)}
                  className="px-3 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap"
                  style={isActive
                    ? { background: opt.activeBg, color: opt.activeFg }
                    : { background: 'transparent', color: 'var(--text-muted)' }
                  }
                  onMouseEnter={isActive ? undefined : (e) => (e.currentTarget.style.color = 'var(--text)')}
                  onMouseLeave={isActive ? undefined : (e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          {/* Filtro por risco do banco de coordenação */}
          <div
            className="flex items-center gap-0.5 rounded-full p-1"
            style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}
            title="Risco do banco de horas de coordenação"
          >
            <span className="px-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Coord</span>
            {([
              { id: '',          label: 'Todos',    activeBg: 'var(--primary)',        activeFg: 'var(--primary-fg)' },
              { id: 'atencao',   label: 'Atenção',  activeBg: 'var(--warning-border)', activeFg: 'var(--surface)' },
              { id: 'critico',   label: 'Crítica',  activeBg: 'var(--danger-border)',  activeFg: 'var(--surface)' },
              { id: 'estourado', label: 'Excedida', activeBg: 'var(--danger-border)',  activeFg: 'var(--surface)' },
            ] as const).map(opt => {
              const isActive = coordFilter === opt.id
              return (
                <button key={opt.id} type="button"
                  onClick={() => setCoord(opt.id)}
                  className="px-3 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap"
                  style={isActive
                    ? { background: opt.activeBg, color: opt.activeFg }
                    : { background: 'transparent', color: 'var(--text-muted)' }
                  }
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)' }}
            >
              <X size={12} /> Limpar filtros
            </button>
          )}
          <button
            onClick={openByRes}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ml-auto"
            style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)' }}
          >
            <UserPlus size={13} /> Alocar por Recurso
          </button>
        </div>

        {/* Linha 2: Multi-contratual + pills de tipo de contrato */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Botão Multi-contratual */}
          <button
            onClick={() => { setMultiContratual(v => !v); setShowClosed(false) }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
            style={multiContratual
              ? { background: 'var(--primary)', color: 'var(--primary-fg)', boxShadow: '0 0 12px var(--ring)' }
              : { background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)' }}
          >
            ⬡ Multi-contratual
          </button>
          {multiContratual && (
            <label
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer select-none whitespace-nowrap"
              style={multiShowClosed
                ? { background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)' }
                : { color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              title="Mostra/oculta projetos encerrados e cancelados na árvore multi-contratual"
            >
              <input type="checkbox" checked={multiShowClosed} onChange={e => setMultiShowClosed(e.target.checked)} />
              Ver encerrados
            </label>
          )}
          <div
            className="flex items-center gap-1 p-1 rounded-xl w-fit flex-wrap"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
          >
            <button
              onClick={() => { setFilterContractType(''); setMultiContratual(false); setShowClosed(false) }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={!filterContractType && !multiContratual && !showClosed
                ? { background: 'var(--primary)', color: 'var(--primary-fg)' }
                : { color: 'var(--text-muted)' }}
            >
              Todos
            </button>
            {availableContractTypes.map(ct => (
              <button
                key={ct.id}
                onClick={() => { setFilterContractType(String(ct.id)); setMultiContratual(false); setShowClosed(false) }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={filterContractType === String(ct.id) && !showClosed
                  ? { background: 'var(--primary)', color: 'var(--primary-fg)' }
                  : { color: 'var(--text-muted)' }}
              >
                {ct.name}
              </button>
            ))}
          </div>
          {/* Fila separada: Encerrados / Cancelados */}
          {(() => {
            const closedCount = projects.filter(p => p.status === 'finished' || p.status === 'cancelled').length
            return (
              <button
                onClick={() => { setShowClosed(true); setFilterContractType(''); setMultiContratual(false) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
                style={showClosed
                  ? { background: 'var(--danger-border)', color: 'var(--surface)' }
                  : { background: 'var(--surface-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                <CalendarOff size={13} /> Encerrados / Cancelados{closedCount ? ` (${closedCount})` : ''}
              </button>
            )
          })()}
        </div>

        {/* ── Tabela ── */}
        {loading ? (
          <Skeleton />
        ) : (multiContratual ? filteredRows : sortedFiltered).length === 0 ? (
          <div className="text-center py-20" style={{ color: 'var(--text-light)' }}>
            <Layers size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum projeto encontrado</p>
          </div>
        ) : (
          <>
          {/* ── Barra de ação em massa ── */}
          {selectedProjectIds.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl mb-3 text-sm"
              style={{ background: 'var(--primary-soft)', border: '1px solid var(--ring)' }}>
              <span className="font-semibold" style={{ color: 'var(--primary)' }}>
                {selectedProjectIds.size} projeto(s) selecionado(s)
              </span>
              <button onClick={openBulkAlloc}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors hover:opacity-90"
                style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)' }}>
                <UserPlus size={13} /> Alocar Equipe
              </button>
              <button onClick={() => setSelectedProjectIds(new Set())}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--surface-hover)]"
                style={{ color: 'var(--text-light)' }}>
                <X size={12} /> Limpar seleção
              </button>
            </div>
          )}
          <div className="rounded-xl overflow-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', maxHeight: 'calc(100vh - 26rem)' }}>
            <table className="w-full min-w-[1100px] text-left">
              <thead className="sticky top-0 z-20" style={{ background: 'var(--surface-sunken)', boxShadow: '0 1px 0 var(--border)' }}>
                <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)' }}>
                  <th className="w-8 pl-3">
                    <input type="checkbox"
                      className="w-4 h-4 rounded accent-[var(--primary)] cursor-pointer"
                      checked={selectedProjectIds.size > 0 && (multiContratual ? filteredRows : sortedFiltered).every(p => selectedProjectIds.has(p.id))}
                      onChange={e => {
                        const all = (multiContratual ? filteredRows : sortedFiltered).map(p => p.id)
                        setSelectedProjectIds(e.target.checked ? new Set(all) : new Set())
                      }}
                    />
                  </th>
                  <th className="w-8 pl-2" />
                  <th className="w-1" />
                  <SortableTh sortKey={sortKey} sortDir={sortDir} columnKey="name"          onSort={toggleSort} disabled={multiContratual} className="py-3 pr-4 pl-2">Projeto</SortableTh>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} columnKey="customer"      onSort={toggleSort} disabled={multiContratual} className="py-3 pr-4">Cliente</SortableTh>
                  <th className="py-3 pr-4 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Executivo</th>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} columnKey="contract_type" onSort={toggleSort} disabled={multiContratual} className="py-3 pr-4">Tipo Contrato</SortableTh>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} columnKey="service_type"  onSort={toggleSort} disabled={multiContratual} className="py-3 pr-4">Tipo Serviço</SortableTh>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} columnKey="monthly_hours" onSort={toggleSort} disabled={multiContratual} className="py-3 px-4" align="center">Hs Mensais</SortableTh>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} columnKey="sold_hours"    onSort={toggleSort} disabled={multiContratual} className="py-3 px-4" align="center">HS Vendidas</SortableTh>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} columnKey="total_cont"    onSort={toggleSort} disabled={multiContratual} className="py-3 px-4" align="center">Total Cont.</SortableTh>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} columnKey="consumed"      onSort={toggleSort} disabled={multiContratual} className="py-3 px-4" align="center">HS Consumidas</SortableTh>
                  <th className="py-3 px-4 text-xs font-semibold text-center" style={{ color: 'var(--text-muted)' }}>Consumo Mensal</th>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} columnKey="balance"       onSort={toggleSort} disabled={multiContratual} className="py-3 px-4" align="center">Saldo</SortableTh>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} columnKey="pct"           onSort={toggleSort} disabled={multiContratual} className="py-3 px-4" align="center" minWidth={140}>% Uso</SortableTh>
                  <SortableTh sortKey={sortKey} sortDir={sortDir} columnKey="coord"         onSort={toggleSort} disabled={multiContratual} className="py-3 px-4" align="center" minWidth={140}>Coord.</SortableTh>
                  <th className="py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(multiContratual ? filteredRows : sortedFiltered).map(project => {
                  const tr = multiContratual ? (project as TreeRow) : undefined
                  return (
                    <ProjectRow
                      key={tr ? `${project.id}-${tr._level}-${tr._parentId}` : project.id}
                      project={project}
                      expanded={expanded.has(project.id)}
                      onToggle={() => toggleExpand(project.id)}
                      onMenuAction={handleMenuAction}
                      canEdit={canEdit}
                      canChangeStatus={canChangeStatus}
                      canDetach={isAdmin}
                      onEdit={p => setEditProjectId(p.id)}
                      onChangeStatus={p => setStatusModal({ open: true, project: p, newStatus: p.status ?? '' })}
                      onDelete={canDelete ? p => setDeleteProject(p) : undefined}
                      hasUnread={unreadProjectIds.has(project.id)}
                      treeRow={tr}
                      onTreeToggle={tr ? () => { toggleTree(tr); toggleExpand(project.id) } : undefined}
                      isSelected={selectedProjectIds.has(project.id)}
                      onSelect={toggleProjectSelect}
                      onConsultantManualToggle={canEdit ? (userId, allow) => handleConsultantManualToggle(project.id, userId, allow) : undefined}
                      showUnbilled={isAdmin || isAdministrativo}
                      executiveName={executiveNameByCustomer[project.customer_id] ?? null}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
        )}

        {/* ── Legenda ── */}
        {!loading && (multiContratual ? filteredRows : sortedFiltered).length > 0 && (
          <div className="flex items-center gap-5 mt-4">
            <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>Saúde:</span>
            {(['green', 'yellow', 'red'] as const).map(c => (
              <div key={c} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: healthStyles[c].bar }} />
                <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>
                  {c === 'green' ? 'Saudável (<70%)' : c === 'yellow' ? 'Atenção (70–90%)' : 'Crítico (>90%)'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* ── Modal de Custos ── */}
      {costProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="flex flex-col rounded-2xl w-full max-w-2xl max-h-[90vh]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-light)' }}>{costProject.code}</p>
                <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{costProject.name}</h2>
              </div>
              <button onClick={() => setCostProject(null)} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {costLoading && <p className="text-xs text-center py-8" style={{ color: 'var(--text-light)' }}>Calculando custos...</p>}
              {!costLoading && !costSummary && <p className="text-xs text-center py-8" style={{ color: 'var(--text-light)' }}>Nenhum dado disponível.</p>}
              {!costLoading && costSummary && (() => {
                const { project_info: pi, hours_summary: hs, cost_calculation: cc, consultant_breakdown: cb } = costSummary
                const isPositive = cc.margin >= 0
                const marginColor = isPositive ? 'var(--success-border)' : 'var(--danger-border)'
                const hoursIniciais = Number((pi as any).initial_hours_consumed) || Math.abs(Number(pi.initial_hours_balance) || 0)
                const horasConsumidas = hoursIniciais + hs.total_logged_hours
                const totalDisp = hs.total_available_hours ?? pi.total_available_hours ?? 0
                const horasRestantes = Math.max(0, totalDisp - horasConsumidas)
                const pctUso = totalDisp > 0 ? Math.min(100, (horasConsumidas / totalDisp) * 100) : 0
                const hoursBarColor = pctUso >= 90 ? 'var(--danger-border)' : pctUso >= 70 ? 'var(--warning-border)' : 'var(--success-border)'
                const showHistorico = hoursIniciais !== 0 || (pi.initial_cost ?? 0) !== 0
                const isOnDemand = cc.is_on_demand
                return (
                  <div className="space-y-4">
                    {/* Bloco 1 — RECEITA */}
                    <div className="rounded-xl p-4" style={{ background: 'var(--primary-soft)', border: '1px solid var(--ring)' }}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--primary)' }}>
                        <DollarSign size={11} />Receita {isOnDemand && <span className="text-[9px] font-normal ml-1 opacity-70">(On Demand — horas × R$/h)</span>}
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: isOnDemand ? 'Horas × R$/h' : 'Valor Projeto', value: formatBRL(cc.project_revenue) },
                          { label: 'Aportes',        value: formatBRL(cc.aportes_total) },
                          { label: 'Receita Total',  value: formatBRL(cc.receita_total), highlight: true },
                        ].map(c => (
                          <div key={c.label} className="rounded-lg p-2.5" style={{ background: 'var(--bg)', border: `1px solid ${c.highlight ? 'var(--ring)' : 'var(--border)'}` }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>{c.label}</p>
                            <p className="text-sm font-bold tabular-nums" style={{ color: c.highlight ? 'var(--primary)' : 'var(--text)' }}>{c.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bloco 2 — CUSTO */}
                    <div className="rounded-xl p-4" style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--warning-border)' }}>
                        <TrendingUp size={11} />Custo
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: 'Custo Inicial',     value: formatBRL(pi.initial_cost ?? 0) },
                          { label: 'Custo Operacional', value: formatBRL(cc.custo_operacional) },
                          { label: 'Custo Total',        value: formatBRL(cc.custo_total), highlight: true },
                        ].map(c => (
                          <div key={c.label} className="rounded-lg p-2.5" style={{ background: 'var(--bg)', border: `1px solid ${c.highlight ? 'var(--warning-border)' : 'var(--border)'}` }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>{c.label}</p>
                            <p className="text-sm font-bold tabular-nums" style={{ color: c.highlight ? 'var(--warning-border)' : 'var(--text)' }}>{c.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bloco 3 — RESULTADO */}
                    <div className="rounded-xl p-4" style={{ background: isPositive ? 'var(--success-bg)' : 'var(--danger-bg)', border: `1px solid ${isPositive ? 'var(--success-border)' : 'var(--danger-border)'}` }}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: marginColor }}>
                        <BarChart2 size={11} />Resultado
                      </p>
                      <p className="text-[10px] tabular-nums mb-3" style={{ color: 'var(--text-light)' }}>
                        {formatBRL(cc.receita_total)} <span className="opacity-50">−</span> {formatBRL(cc.custo_total)} <span className="opacity-50">=</span> <span style={{ color: marginColor }}>{formatBRL(cc.margin)}</span>
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-lg p-3.5" style={{ background: 'var(--bg)', border: `1px solid ${isPositive ? 'var(--success-border)' : 'var(--danger-border)'}` }}>
                          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Margem R$</p>
                          <p className="text-xl font-bold tabular-nums" style={{ color: marginColor }}>{formatBRL(cc.margin)}</p>
                        </div>
                        <div className="rounded-lg p-3.5" style={{ background: 'var(--bg)', border: `1px solid ${isPositive ? 'var(--success-border)' : 'var(--danger-border)'}` }}>
                          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Margem %</p>
                          <p className="text-xl font-bold tabular-nums" style={{ color: marginColor }}>{cc.margin_percentage.toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>

                    {/* Bloco 4 — COORDENADOR (condicional) */}
                    {cc.coordinator_percentage > 0 && (
                      <div className="rounded-xl p-4" style={{ background: 'var(--surface-hover)', border: '1px solid var(--brand-purple)' }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--brand-purple)' }}>
                          <UserCheck size={11} />Coordenador
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-lg p-2.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>% da Margem</p>
                            <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--brand-purple)' }}>{cc.coordinator_percentage.toFixed(1)}%</p>
                          </div>
                          <div className="rounded-lg p-2.5" style={{ background: 'var(--bg)', border: '1px solid var(--brand-purple)' }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Valor a Receber</p>
                            <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--brand-purple)' }}>{formatBRL(cc.valor_coordenador)}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Bloco 5 — HORAS */}
                    <div className="rounded-xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-light)' }}>Horas</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
                        {[
                          { label: 'Iniciais',    value: `${hoursIniciais.toFixed(1)}h`,          color: 'var(--text)' },
                          { label: 'Apontadas',   value: `${hs.total_logged_hours.toFixed(1)}h`,  color: 'var(--text)' },
                          { label: 'Consumido',   value: `${horasConsumidas.toFixed(1)}h`,        color: 'var(--text)' },
                          { label: '% Uso',       value: `${pctUso.toFixed(1)}%`,                 color: hoursBarColor },
                          { label: 'Restantes',   value: `${horasRestantes.toFixed(1)}h`,         color: horasRestantes < 10 ? 'var(--danger-border)' : 'var(--text)' },
                        ].map(c => (
                          <div key={c.label}>
                            <p className="text-[9px]" style={{ color: 'var(--text-light)' }}>{c.label}</p>
                            <p className="font-bold tabular-nums mt-0.5 text-xs" style={{ color: c.color }}>{c.value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="w-full rounded-full h-1.5 mb-1" style={{ background: 'var(--border)' }}>
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pctUso}%`, background: hoursBarColor }} />
                      </div>
                      <p className="text-[10px] tabular-nums" style={{ color: 'var(--text-light)' }}>{pctUso.toFixed(1)}% das horas utilizadas</p>
                    </div>

                    {/* Bloco 6 — HISTÓRICO */}
                    {showHistorico && (
                      <div className="rounded-xl px-4 py-3 flex flex-wrap gap-x-6 gap-y-1" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                        <p className="text-[9px] font-semibold uppercase tracking-wider w-full mb-0.5" style={{ color: 'var(--text-light)' }}>Saldo do sistema anterior</p>
                        <span className="text-xs tabular-nums" style={{ color: 'var(--text-light)' }}>HS consumidas iniciais: <strong>{hoursIniciais.toFixed(1)}h</strong></span>
                        <span className="text-xs tabular-nums" style={{ color: 'var(--text-light)' }}>Custo inicial: <strong>{formatBRL(pi.initial_cost ?? 0)}</strong></span>
                      </div>
                    )}

                    {/* Tabela de custo por consultor */}
                    {cb.length > 0 && (
                      <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
                        <div className="px-4 py-3" style={{ background: 'var(--surface)' }}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}>
                            <UserCheck size={11} />Custo por Consultor
                          </p>
                        </div>
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                              {['Consultor','Hs Total','Aprovadas','Pendentes','Taxa/h','Custo'].map(h => (
                                <th key={h} className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {cb.map((c, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text)' }}>{c.consultant_name}</td>
                                <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--text)' }}>{c.total_hours.toFixed(1)}h</td>
                                <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--success-border)' }}>{c.approved_hours.toFixed(1)}h</td>
                                <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--warning-border)' }}>{c.pending_hours.toFixed(1)}h</td>
                                <td className="px-3 py-2.5 tabular-nums text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                  {c.consultant_hourly_rate != null ? formatBRL(c.consultant_hourly_rate) : '—'}
                                  {c.consultant_rate_type === 'monthly' && <span className="ml-1 opacity-60">÷160</span>}
                                </td>
                                <td className="px-3 py-2.5 tabular-nums font-bold" style={{ color: 'var(--text)' }}>{formatBRL(c.cost)}</td>
                              </tr>
                            ))}
                            <tr style={{ background: 'var(--primary-soft)', borderTop: '1px solid var(--border)' }}>
                              <td className="px-3 py-2.5 font-bold text-[11px] uppercase" style={{ color: 'var(--text-light)' }} colSpan={5}>Total Operacional</td>
                              <td className="px-3 py-2.5 font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{formatBRL(cc.custo_operacional)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
            <div className="flex justify-end px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setCostProject(null)} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Equipe ── */}
      {teamProject && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="flex flex-col rounded-2xl w-full max-w-md max-h-[80vh]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-light)' }}>Equipe</p>
                <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{teamProject.name}</h2>
              </div>
              <button onClick={() => setTeamProject(null)} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
            {/* Tabs */}
            <div className="flex border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              {(['consultores', 'grupos'] as const).map(tab => (
                <button key={tab} onClick={() => setTeamTab(tab)}
                  className={`px-5 py-2.5 text-xs font-semibold capitalize transition-colors ${teamTab === tab ? 'border-b-2 border-[var(--primary-soft)] text-[var(--primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
                  style={{ marginBottom: -1 }}>
                  {tab === 'consultores' ? 'Consultores' : 'Grupos de Consultores'}
                </button>
              ))}
            </div>
            <div className="px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
                <input value={teamSearch} onChange={e => setTeamSearch(e.target.value)}
                  placeholder={teamTab === 'consultores' ? 'Buscar consultor...' : 'Buscar grupo...'}
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {teamTab === 'consultores' && allConsultants.filter(c => c.name.toLowerCase().includes(teamSearch.toLowerCase())).map(c => (
                <label key={c.id} className="flex items-center gap-3 py-2 px-2 rounded-lg cursor-pointer hover:bg-[var(--surface-hover)] transition-colors">
                  <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => setSelectedIds(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n })} className="w-4 h-4 rounded accent-[var(--primary)]" />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>{c.name}</span>
                </label>
              ))}
              {teamTab === 'grupos' && consultantGroups.filter(g => g.name.toLowerCase().includes(teamSearch.toLowerCase())).map(g => (
                <label key={g.id} className="flex items-center gap-3 py-2 px-2 rounded-lg cursor-pointer hover:bg-[var(--surface-hover)] transition-colors">
                  <input type="checkbox" checked={selectedGroupIds.has(g.id)} onChange={() => setSelectedGroupIds(prev => { const n = new Set(prev); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n })} className="w-4 h-4 rounded accent-[var(--primary)]" />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>{g.name}</span>
                </label>
              ))}
              {teamTab === 'grupos' && consultantGroups.length === 0 && (
                <p className="text-xs text-center py-6" style={{ color: 'var(--text-light)' }}>Nenhum grupo disponível</p>
              )}
            </div>
            <div className="flex justify-between items-center px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-xs" style={{ color: 'var(--text-light)' }}>
                {selectedIds.size} consultor(es) · {selectedGroupIds.size} grupo(s)
              </span>
              <div className="flex gap-2">
                <button onClick={() => setTeamProject(null)} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
                <button onClick={saveTeam} disabled={teamSaving} className="px-4 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50" style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)' }}>{teamSaving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Aportes ── */}
      {aportesProject && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="flex flex-col rounded-2xl w-full max-w-2xl max-h-[90vh]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-light)' }}>Aportes de Horas</p>
                <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{aportesProject.name}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  setContribForm({ contributed_hours: '', hourly_rate: '', contributed_at: new Date().toISOString().slice(0, 10), description: '', motivo: 'aporte', reason: '' })
                  setContribModal({ open: true })
                }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:opacity-90"
                  style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)' }}>
                  <Plus size={12} /> Adicionar
                </button>
                <button onClick={() => { setAportesProject(null); setContribModal({ open: false }) }} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {((aportesProject.contract_type_display ?? aportesProject.contract_type?.name ?? '').toLowerCase().includes('mensal')) && (
                <MonthlyAccrualTable
                  startDate={(aportesProject as any).start_date ?? null}
                  hoursPerMonth={aportesProject.sold_hours ?? 0}
                  accumulated={(aportesProject as any).accumulated_sold_hours ?? null}
                  endDate={(aportesProject as any).encerramento_date ?? null}
                  projectId={aportesProject.id}
                  canEditConsumption={isAdmin || isCoordenador}
                />
              )}
              {contribLoading && <p className="text-xs text-center py-8" style={{ color: 'var(--text-light)' }}>Carregando aportes...</p>}
              {!contribLoading && contributions.length === 0 && (
                <div className="text-center py-10">
                  <TrendingUp size={32} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-light)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-light)' }}>Nenhum aporte registrado</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-light)' }}>Clique em "+ Adicionar" para registrar</p>
                </div>
              )}
              {!contribLoading && contributions.length > 0 && (() => {
                const totalHoras = contributions.reduce((s, c) => s + c.contributed_hours, 0)
                const totalValor = contributions.reduce((s, c) => s + c.contributed_hours * c.hourly_rate, 0)
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl p-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Total de Horas</p>
                        <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{totalHoras.toFixed(1)}h</p>
                      </div>
                      <div className="rounded-xl p-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Valor Total</p>
                        <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--warning-border)' }}>{totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                      </div>
                    </div>
                    <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 z-10" style={{ background: 'var(--surface)' }}>
                          <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                            {['Data','Horas','Valor/h','Total','Descrição',''].map(h => (
                              <th key={h} className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {contributions.map(c => {
                            const logs = c.change_logs ?? []
                            const histOpen = contribHistoryOpen === c.id
                            return (
                            <Fragment key={c.id}>
                            <tr style={{ borderBottom: histOpen ? 'none' : '1px solid var(--border)' }}>
                              <td className="px-3 py-2.5 tabular-nums whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                                {c.contributed_at ? c.contributed_at.slice(0, 10).split('-').reverse().join('/') : '—'}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: 'var(--primary)' }}>{c.contributed_hours.toFixed(1)}h</td>
                              <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--text-muted)' }}>{c.hourly_rate.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                              <td className="px-3 py-2.5 tabular-nums font-bold" style={{ color: 'var(--text)' }}>{(c.contributed_hours * c.hourly_rate).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                              <td className="px-3 py-2.5 max-w-[160px] truncate" style={{ color: 'var(--text-muted)' }}>{c.description ?? '—'}</td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1">
                                  {logs.length > 0 && (
                                    <button onClick={() => setContribHistoryOpen(histOpen ? null : c.id)}
                                      title={`${logs.length} alteração(ões) — ver histórico`}
                                      className="p-1 rounded hover:bg-[var(--surface-hover)] transition-colors flex items-center gap-0.5"
                                      style={{ color: histOpen ? 'var(--primary)' : 'var(--text-muted)' }}>
                                      <History size={12} />
                                      <span className="text-[9px] font-bold tabular-nums">{logs.length}</span>
                                    </button>
                                  )}
                                  <button onClick={() => {
                                    setContribModal({ open: true, item: c })
                                    setContribForm({
                                      contributed_hours: String(c.contributed_hours),
                                      hourly_rate: String(c.hourly_rate),
                                      contributed_at: c.contributed_at?.slice(0, 10) ?? '',
                                      description: c.description ?? '',
                                      motivo: (c as any).motivo ?? 'aporte',
                                      reason: '',
                                    })
                                  }} className="p-1 rounded hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)' }}>
                                    <Pencil size={12} />
                                  </button>
                                  <button onClick={() => setContribDeleteConfirm(c)} className="p-1 rounded hover:bg-[var(--danger-bg)] transition-colors text-[var(--danger)]">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {histOpen && (
                              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                                <td colSpan={6} className="px-3 py-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: 'var(--text-light)' }}>
                                    <History size={11} /> Histórico de alterações
                                  </p>
                                  <div className="space-y-1.5">
                                    {logs.map(l => (
                                      <div key={l.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
                                        <span className="font-semibold" style={{ color: 'var(--text)' }}>{l.field_label}:</span>
                                        {l.field_name === 'deleted' ? (
                                          <span className="text-[var(--danger)] font-medium">aporte excluído ({l.old_value})</span>
                                        ) : (
                                          <span style={{ color: 'var(--text-muted)' }}>
                                            <span className="line-through opacity-70">{l.old_value_formatted ?? '—'}</span>
                                            <span className="mx-1">→</span>
                                            <span className="font-semibold" style={{ color: 'var(--primary)' }}>{l.new_value_formatted ?? '—'}</span>
                                          </span>
                                        )}
                                        <span style={{ color: 'var(--text-light)' }}>
                                          · {l.changed_by_user?.name ?? 'sistema'}
                                          {l.created_at ? ' · ' + new Date(l.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                        </span>
                                        {l.reason && <span className="italic" style={{ color: 'var(--text-light)' }}>— {l.reason}</span>}
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                            </Fragment>
                          )})}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="flex justify-end px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => { setAportesProject(null); setContribModal({ open: false }) }} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sub-modal Adicionar/Editar Aporte ── */}
      {aportesProject && contribModal.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="rounded-2xl w-full max-w-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                {contribModal.item ? 'Editar Aporte' : 'Novo Aporte'}
              </h3>
              <button onClick={() => {
                setContribModal({ open: false })
                setContribForm({ contributed_hours: '', hourly_rate: '', contributed_at: '', description: '', motivo: 'aporte', reason: '' })
              }} className="p-1 rounded hover:bg-[var(--surface-hover)]"><X size={14} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-light)' }}>Horas *</label>
                  <input type="number" step="0.5" min="0" value={contribForm.contributed_hours}
                    onChange={e => setContribForm(f => ({ ...f, contributed_hours: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    placeholder="0.0" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-light)' }}>Valor/Hora *</label>
                  <input type="number" step="0.01" min="0" value={contribForm.hourly_rate}
                    onChange={e => setContribForm(f => ({ ...f, hourly_rate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-light)' }}>Data / Mês de vigência *</label>
                <input type="date" value={contribForm.contributed_at}
                  onChange={e => setContribForm(f => ({ ...f, contributed_at: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', colorScheme: 'dark' }} />
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>
                  Define a competência do aporte: o valor vale a partir deste mês e <strong>não altera os meses anteriores</strong>.
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-light)' }}>Motivo *</label>
                <select value={contribForm.motivo}
                  onChange={e => setContribForm(f => ({ ...f, motivo: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="aporte">Aporte</option>
                  <option value="excedentes">Excedentes</option>
                  <option value="absorvidas">Absorvidas</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-light)' }}>Descrição</label>
                <input type="text" value={contribForm.description}
                  onChange={e => setContribForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  placeholder="Opcional" />
              </div>
              {/* Auditoria: ao EDITAR um aporte, registra o motivo no histórico. */}
              {contribModal.item && (
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-light)' }}>Motivo da alteração</label>
                  <input type="text" value={contribForm.reason}
                    onChange={e => setContribForm(f => ({ ...f, reason: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    placeholder="Opcional — fica registrado no histórico" />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => {
                setContribModal({ open: false })
                setContribForm({ contributed_hours: '', hourly_rate: '', contributed_at: '', description: '', motivo: 'aporte', reason: '' })
              }} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={saveContrib} disabled={contribSaving}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)' }}>
                {contribSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmação de exclusão de aporte ── */}
      {contribDeleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="rounded-2xl w-full max-w-xs p-6 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <Trash2 size={28} className="mx-auto mb-3 text-[var(--danger)]" />
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Excluir aporte?</p>
            <p className="text-xs mb-5" style={{ color: 'var(--text-light)' }}>
              {contribDeleteConfirm.contributed_hours}h em {contribDeleteConfirm.contributed_at?.slice(0, 10).split('-').reverse().join('/')}. Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => setContribDeleteConfirm(null)} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={() => doDeleteContrib(contribDeleteConfirm)} className="px-4 py-2 rounded-xl text-sm font-bold bg-[var(--danger-bg)] text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Alterar Status ── */}
      {statusModal.open && statusModal.project && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="rounded-2xl w-full max-w-sm p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Alterar Status</h3>
              <button onClick={() => setStatusModal({ open: false, project: null, newStatus: '' })} style={{ color: 'var(--text-light)' }}><X size={16} /></button>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              Projeto: <strong style={{ color: 'var(--text)' }}>{statusModal.project.name}</strong>
            </p>
            <select
              value={statusModal.newStatus}
              onChange={e => setStatusModal(s => ({ ...s, newStatus: e.target.value }))}
              className="w-full appearance-none px-3 py-2.5 rounded-xl text-sm outline-none mb-5"
              style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}
            >
              {PROJECT_STATUSES.map(s => (
                <option key={s.value} value={s.value} style={{ background: 'var(--surface)' }}>{s.label}</option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setStatusModal({ open: false, project: null, newStatus: '' })}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Cancelar
              </button>
              <button onClick={handleChangeStatus} disabled={statusSaving || statusModal.newStatus === statusModal.project.status}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
                {statusSaving ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Visualização ── */}
      {viewProject && (
        <ProjectViewModal
          projectId={viewProject.id}
          onClose={() => { setViewProject(null); setViewProjectFull(null) }}
          userRole={user?.type ?? undefined}
          initialTab={viewProjectTab}
        />
      )}

      {/* ── Histórico de valores-hora (somente leitura) ── */}
      {rateHistoryOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-lg rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Histórico de valores</p>
              <button onClick={() => setRateHistoryOpen(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
            {rateHistoryLoading ? (
              <p className="text-sm py-6 text-center animate-pulse" style={{ color: 'var(--text-light)' }}>Carregando...</p>
            ) : rateHistory.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhuma alteração registrada.</p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--surface-hover)', color: 'var(--text-light)' }}>
                      <th className="text-left font-semibold px-3 py-2">Vigência</th>
                      <th className="text-left font-semibold px-3 py-2">Valor</th>
                      <th className="text-left font-semibold px-3 py-2">Por</th>
                      <th className="text-left font-semibold px-3 py-2">Em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rateHistory.filter((h: any, i: number, a: any[]) => a.findIndex((x: any) => String(x.created_at ?? '').slice(0, 10) === String(h.created_at ?? '').slice(0, 10)) === i).map((h, i) => (
                      <tr key={h.id ?? i} style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {h.effective_from
                            ? (() => { const [y, m] = String(h.effective_from).slice(0, 7).split('-'); return `${m}/${y}` })()
                            : <span title="vigência não informada (legado)" style={{ color: 'var(--text-light)' }}>—</span>}
                        </td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                          {h.old_value != null ? formatBRL(Number(h.old_value)) : '—'}
                          <span style={{ color: 'var(--text-light)' }}> → </span>
                          {h.new_value != null ? formatBRL(Number(h.new_value)) : '—'}
                        </td>
                        <td className="px-3 py-2">{h.changed_by_user?.name ?? '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                          {h.created_at ? new Date(h.created_at).toLocaleDateString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-end mt-5">
              <button onClick={() => setRateHistoryOpen(false)} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Mensagens ── */}
      {messagesProject && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="flex flex-col rounded-2xl w-full max-w-2xl max-h-[85vh]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-light)' }}>Mensagens</p>
                <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{messagesProject.name}</p>
                {messagesProject.customer?.name && (
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{messagesProject.customer.name}</p>
                )}
                <a
                  href={`/contratos/pipeline?project=${messagesProject.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold mt-1.5 hover:underline"
                  style={{ color: 'var(--primary)' }}
                >
                  <ExternalLink size={12} /> Abrir card em Demandas e Projetos
                </a>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {messagesProject.status && (() => {
                  // Status do projeto (mesmas labels/cores das colunas de Demandas e Projetos).
                  const M: Record<string, [string, string]> = { awaiting_start: ['Backlog', '#94a3b8'], backlog: ['Backlog', '#94a3b8'], planning: ['Em Planejamento', '#a78bfa'], started: ['Em Andamento', '#60a5fa'], liberado_para_testes: ['Em Homologação', '#22d3ee'], em_producao: ['Em Produção', '#14b8a6'], paused: ['Pausado', '#eab308'], finished: ['Encerrado', '#22c55e'], cancelled: ['Cancelado', '#ef4444'] }
                  const [lbl, c] = M[messagesProject.status] ?? [messagesProject.status, '#94a3b8']
                  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: `${c}22`, color: c, border: `1px solid ${c}55` }}>{lbl}</span>
                })()}
                <button onClick={() => setMessagesProject(null)} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <ProjectMessages projectId={messagesProject.id} userRole={user?.type ?? undefined} />
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Edição de Projeto ── */}
      {editProjectId && (
        <ProjectEditByIdModal
          projectId={editProjectId}
          onClose={() => setEditProjectId(null)}
          onSaved={() => {
            setEditProjectId(null)
            setRefreshKey(k => k + 1)
            if (viewProject) {
              setViewProjectFull(null)
              setViewProjectLoading(true)
              api.get<ProjectFull>(`/projects/${viewProject.id}`)
                .then(r => setViewProjectFull(r))
                .catch(() => {})
                .finally(() => setViewProjectLoading(false))
            }
          }}
        />
      )}

      {/* ── Modal de Exclusão de Projeto ── */}
      {deleteProject && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/45">
          <div className="rounded-2xl w-full max-w-sm overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--danger-border)' }}>
            <div className="px-6 py-5 flex items-center gap-3">
              <Trash2 size={20} className="text-[var(--danger)] shrink-0" />
              <div>
                <p className="font-semibold text-[var(--text)]">Excluir Projeto</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{deleteProject.name} · {deleteProject.code}</p>
              </div>
            </div>
            <div className="px-6 pb-4">
              <p className="text-sm text-[var(--text-muted)]">Tem certeza? Esta ação não pode ser desfeita.</p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setDeleteProject(null)} disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                Cancelar
              </button>
              <button disabled={deleting} onClick={async () => {
                setDeleting(true)
                try {
                  await api.delete(`/projects/${deleteProject.id}`)
                  toast.success('Projeto excluído')
                  setDeleteProject(null)
                  setRefreshKey(k => k + 1)
                } catch (e: any) {
                  toast.error(e?.message ?? 'Erro ao excluir projeto')
                } finally { setDeleting(false) }
              }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                style={{ background: 'var(--danger-bg)', color: 'var(--danger-border)', border: '1px solid var(--danger-border)' }}>
                <Trash2 size={14} /> {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Desvincular Projeto Filho do Pai ── */}
      {detachModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/45">
          <div className="rounded-2xl w-full max-w-md overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="px-6 py-5 flex items-center gap-3">
              <Layers size={20} style={{ color: 'var(--primary)' }} className="shrink-0" />
              <div>
                <p className="font-semibold text-[var(--text)]">Desvincular projeto do pai</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{detachModal.project.name} · {detachModal.project.code}</p>
              </div>
            </div>
            <div className="px-6 pb-4 space-y-3">
              <ul className="text-xs text-[var(--text-muted)] list-disc list-inside space-y-1">
                <li>O <b>sold_hours</b> do pai e do filho <b>não muda</b> — vínculo é apenas estrutural.</li>
                <li>O consumo do filho <b>deixa de ser contabilizado</b> no consumed_hours do pai (saldo do pai aumenta).</li>
                <li>O filho continua independente com o mesmo sold_hours que tinha.</li>
              </ul>
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                  Novo código <span className="text-[var(--danger)]">*</span>
                  {detachModal.suggestedCode && (
                    <span className="ml-2 text-[var(--text-light)]">
                      (sugestão: <button type="button" onClick={() => setDetachModal(p => p ? { ...p, newCode: p.suggestedCode, codeError: '' } : p)} className="text-[var(--primary)] hover:text-[var(--primary)] font-mono">{detachModal.suggestedCode}</button>)
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={detachModal.newCode}
                  onChange={e => setDetachModal(p => p ? { ...p, newCode: e.target.value.toUpperCase().trim(), codeError: '' } : p)}
                  placeholder="Ex: AAM004-25"
                  className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
                  style={{
                    background: 'var(--bg)',
                    border: `1px solid ${detachModal.codeError ? 'var(--danger-border)' : 'var(--border)'}`,
                    color: 'var(--text)',
                  }}
                />
                {detachModal.codeError && (
                  <p className="text-xs text-[var(--danger)] mt-1">{detachModal.codeError}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setDetachModal(null)} disabled={detaching}
                className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                Cancelar
              </button>
              <button disabled={detaching || !detachModal.newCode} onClick={async () => {
                if (!detachModal) return
                const code = detachModal.newCode.trim()
                if (!code) {
                  setDetachModal(p => p ? { ...p, codeError: 'Informe o novo código' } : p)
                  return
                }
                setDetaching(true)
                try {
                  const r = await api.post<any>(`/projects/${detachModal.project.id}/detach-from-parent`, { code })
                  toast.success(`Desvinculado. Novo código: ${r?.child?.code ?? code}`)
                  setDetachModal(null)
                  setRefreshKey(k => k + 1)
                } catch (e: any) {
                  const msg = e?.message ?? 'Erro ao desvincular projeto'
                  if (/já está em uso|in use/i.test(msg)) {
                    setDetachModal(p => p ? { ...p, codeError: msg } : p)
                  } else {
                    toast.error(msg)
                  }
                } finally { setDetaching(false) }
              }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
                <Layers size={14} /> {detaching ? 'Desvinculando...' : 'Desvincular'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Vincular Projeto Independente como Filho ── */}
      {attachModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/45">
          <div className="rounded-2xl w-full max-w-md overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="px-6 py-5 flex items-center gap-3">
              <Layers size={20} style={{ color: 'var(--primary)' }} className="shrink-0" />
              <div>
                <p className="font-semibold text-[var(--text)]">Vincular como filho</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{attachModal.project.name} · {attachModal.project.code}</p>
              </div>
            </div>
            <div className="px-6 pb-4 space-y-3">
              <ul className="text-xs text-[var(--text-muted)] list-disc list-inside space-y-1">
                <li>O <b>sold_hours</b> do pai e do filho <b>não muda</b> — vínculo é apenas estrutural.</li>
                <li><b>Fechado</b>: pai consome (no saldo) o <b>sold_hours + aportes</b> do filho no ato.</li>
                <li><b>BH Fixo</b>: pai consome (no saldo) o efetivamente apontado pelo filho.</li>
                <li>BH Mensal e On Demand <b>não podem</b> ser filhos.</li>
              </ul>
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                  Projeto pai <span className="text-[var(--danger)]">*</span>
                </label>
                {attachModal.loading ? (
                  <div className="text-xs text-[var(--text-light)]">Carregando projetos disponíveis...</div>
                ) : attachModal.parents.length === 0 ? (
                  <div className="text-xs text-[var(--text-light)]">Nenhum projeto pai disponível pra este cliente.</div>
                ) : (
                  <select
                    value={attachModal.parentId}
                    onChange={e => setAttachModal(p => p ? { ...p, parentId: e.target.value } : p)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                    }}
                  >
                    <option value="">Selecione um projeto pai</option>
                    {attachModal.parents.map(p => (
                      <option key={p.id} value={p.id}>{p.name} · {p.code}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setAttachModal(null)} disabled={attaching}
                className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                Cancelar
              </button>
              <button disabled={attaching || !attachModal.parentId} onClick={async () => {
                if (!attachModal || !attachModal.parentId) return
                setAttaching(true)
                try {
                  await api.post(`/projects/${attachModal.project.id}/attach-to-parent`, { parent_id: Number(attachModal.parentId) })
                  toast.success('Projeto vinculado com sucesso')
                  setAttachModal(null)
                  setRefreshKey(k => k + 1)
                } catch (e: any) {
                  toast.error(e?.message ?? 'Erro ao vincular projeto')
                } finally { setAttaching(false) }
              }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
                <Layers size={14} /> {attaching ? 'Vinculando...' : 'Vincular'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal A: Alocar Equipe em Massa ── */}
      {bulkAllocOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="flex flex-col rounded-2xl w-full max-w-md max-h-[80vh]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-light)' }}>Alocação em Massa</p>
                <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{selectedProjectIds.size} projeto(s) selecionado(s)</h2>
              </div>
              <button onClick={() => setBulkAllocOpen(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)]"><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
            </div>

            {/* Modo: adicionar ou substituir */}
            <div className="flex gap-2 px-6 pt-4 shrink-0">
              {(['add', 'replace'] as const).map(m => (
                <button key={m} onClick={() => setBulkAllocMode(m)}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors"
                  style={bulkAllocMode === m
                    ? { background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)' }
                    : { background: 'transparent', color: 'var(--text-light)', border: '1px solid var(--border)' }}>
                  {m === 'add' ? '+ Adicionar à equipe' : '↺ Substituir equipe'}
                </button>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex border-b mt-4 shrink-0" style={{ borderColor: 'var(--border)' }}>
              {(['consultores', 'grupos'] as const).map(tab => (
                <button key={tab} onClick={() => setBulkAllocTab(tab)}
                  className={`px-5 py-2.5 text-xs font-semibold capitalize transition-colors ${bulkAllocTab === tab ? 'border-b-2 border-[var(--primary-soft)] text-[var(--primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
                  style={{ marginBottom: -1 }}>
                  {tab === 'consultores' ? `Consultores (${bulkAllocConsIds.size})` : `Grupos (${bulkAllocGrpIds.size})`}
                </button>
              ))}
            </div>

            {/* Busca */}
            <div className="px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
                <input value={bulkAllocSearch} onChange={e => setBulkAllocSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {bulkAllocTab === 'consultores' && allConsultants
                .filter(c => c.name.toLowerCase().includes(bulkAllocSearch.toLowerCase()))
                .map(c => (
                  <label key={c.id} className="flex items-center gap-3 py-2 px-2 rounded-lg cursor-pointer hover:bg-[var(--surface-hover)] transition-colors">
                    <input type="checkbox" checked={bulkAllocConsIds.has(c.id)}
                      onChange={() => setBulkAllocConsIds(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n })}
                      className="w-4 h-4 rounded accent-[var(--primary)]" />
                    <span className="text-sm" style={{ color: 'var(--text)' }}>{c.name}</span>
                  </label>
                ))}
              {bulkAllocTab === 'grupos' && consultantGroups
                .filter(g => g.name.toLowerCase().includes(bulkAllocSearch.toLowerCase()))
                .map(g => (
                  <label key={g.id} className="flex items-center gap-3 py-2 px-2 rounded-lg cursor-pointer hover:bg-[var(--surface-hover)] transition-colors">
                    <input type="checkbox" checked={bulkAllocGrpIds.has(g.id)}
                      onChange={() => setBulkAllocGrpIds(prev => { const n = new Set(prev); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n })}
                      className="w-4 h-4 rounded accent-[var(--primary)]" />
                    <span className="text-sm" style={{ color: 'var(--text)' }}>{g.name}</span>
                  </label>
                ))}
            </div>

            <div className="flex justify-between items-center px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-xs" style={{ color: 'var(--text-light)' }}>
                {bulkAllocConsIds.size} consultor(es) · {bulkAllocGrpIds.size} grupo(s)
              </span>
              <div className="flex gap-2">
                <button onClick={() => setBulkAllocOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
                <button onClick={executeBulkAlloc} disabled={bulkAllocSaving || (bulkAllocConsIds.size === 0 && bulkAllocGrpIds.size === 0)}
                  className="px-4 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)' }}>
                  {bulkAllocSaving ? 'Salvando...' : 'Alocar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal B: Alocar por Recurso ── */}
      {byResOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="flex flex-col rounded-2xl w-full max-w-lg max-h-[85vh]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-light)' }}>
                  Alocar por Recurso — Passo {byResStep}/2
                </p>
                <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>
                  {byResStep === 1 ? 'Selecione o recurso' : 'Selecione os projetos'}
                </h2>
              </div>
              <button onClick={() => setByResOpen(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)]"><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
            </div>

            {/* ── Step 1: escolher recurso ── */}
            {byResStep === 1 && (<>
              <div className="flex border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
                {(['consultor', 'grupo'] as const).map(tab => (
                  <button key={tab} onClick={() => { setByResTab(tab); setByResConsId(null); setByResGroupId(null) }}
                    className={`px-5 py-2.5 text-xs font-semibold capitalize transition-colors ${byResTab === tab ? 'border-b-2 border-[var(--primary-soft)] text-[var(--primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
                    style={{ marginBottom: -1 }}>
                    {tab === 'consultor' ? 'Consultor' : 'Grupo de Consultores'}
                  </button>
                ))}
              </div>
              <div className="px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
                  <input value={byResSearch} onChange={e => setByResSearch(e.target.value)}
                    placeholder="Buscar..."
                    className="w-full pl-8 pr-3 py-2 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {byResTab === 'consultor' && allConsultants
                  .filter(c => c.name.toLowerCase().includes(byResSearch.toLowerCase()))
                  .map(c => (
                    <label key={c.id} className="flex items-center gap-3 py-2.5 px-2 rounded-lg cursor-pointer hover:bg-[var(--surface-hover)] transition-colors">
                      <input type="radio" name="byres-cons" checked={byResConsId === c.id}
                        onChange={() => setByResConsId(c.id)}
                        className="w-4 h-4 accent-[var(--primary)]" />
                      <span className="text-sm" style={{ color: 'var(--text)' }}>{c.name}</span>
                    </label>
                  ))}
                {byResTab === 'grupo' && consultantGroups
                  .filter(g => g.name.toLowerCase().includes(byResSearch.toLowerCase()))
                  .map(g => (
                    <label key={g.id} className="flex items-center gap-3 py-2.5 px-2 rounded-lg cursor-pointer hover:bg-[var(--surface-hover)] transition-colors">
                      <input type="radio" name="byres-grp" checked={byResGroupId === g.id}
                        onChange={() => setByResGroupId(g.id)}
                        className="w-4 h-4 accent-[var(--primary)]" />
                      <div>
                        <span className="text-sm" style={{ color: 'var(--text)' }}>{g.name}</span>
                        <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>grupo completo</span>
                      </div>
                    </label>
                  ))}
              </div>
              <div className="flex justify-end gap-2 px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
                <button onClick={() => setByResOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
                <button
                  disabled={byResTab === 'consultor' ? !byResConsId : !byResGroupId}
                  onClick={() => { setByResSearch(''); setByResStep(2) }}
                  className="px-4 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)' }}>
                  Próximo →
                </button>
              </div>
            </>)}

            {/* ── Step 2: escolher projetos ── */}
            {byResStep === 2 && (<>
              {/* Modo */}
              <div className="flex gap-2 px-6 pt-4 shrink-0">
                {(['add', 'replace'] as const).map(m => (
                  <button key={m} onClick={() => setByResMode(m)}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors"
                    style={byResMode === m
                      ? { background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)' }
                      : { background: 'transparent', color: 'var(--text-light)', border: '1px solid var(--border)' }}>
                    {m === 'add' ? '+ Adicionar à equipe' : '↺ Substituir equipe'}
                  </button>
                ))}
              </div>

              {/* Recurso selecionado */}
              <div className="mx-6 mt-3 px-3 py-2 rounded-lg text-xs shrink-0 flex items-center justify-between"
                style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-soft)', color: 'var(--primary)' }}>
                <span>
                  {byResTab === 'consultor'
                    ? allConsultants.find(c => c.id === byResConsId)?.name
                    : consultantGroups.find(g => g.id === byResGroupId)?.name}
                </span>
                <button onClick={() => { setByResStep(1); setByResSearch('') }} className="text-[11px] underline opacity-70 hover:opacity-100">Trocar</button>
              </div>

              {/* Busca projetos */}
              <div className="px-4 py-3 border-b mt-3 shrink-0" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
                    <input value={byResSearch} onChange={e => setByResSearch(e.target.value)}
                      placeholder="Buscar projeto..."
                      className="w-full pl-8 pr-3 py-2 rounded-lg text-xs outline-none"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  </div>
                  <button onClick={() => {
                    const all = filtered.map(p => p.id)
                    setByResProjIds(byResProjIds.size === all.length ? new Set() : new Set(all))
                  }} className="text-xs px-2 py-1.5 rounded-lg whitespace-nowrap"
                    style={{ color: 'var(--text-light)', border: '1px solid var(--border)' }}>
                    {byResProjIds.size === filtered.length ? 'Desmarcar todos' : 'Selecionar todos'}
                  </button>
                </div>
              </div>

              {/* Lista de projetos */}
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {filtered
                  .filter(p => !byResSearch || p.name.toLowerCase().includes(byResSearch.toLowerCase()) || (p.code ?? '').toLowerCase().includes(byResSearch.toLowerCase()))
                  .map(p => (
                    <label key={p.id} className="flex items-center gap-3 py-2 px-2 rounded-lg cursor-pointer hover:bg-[var(--surface-hover)] transition-colors">
                      <input type="checkbox" checked={byResProjIds.has(p.id)}
                        onChange={() => setByResProjIds(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}
                        className="w-4 h-4 rounded accent-[var(--primary)]" />
                      <div>
                        <span className="text-sm" style={{ color: 'var(--text)' }}>{p.name}</span>
                        <span className="ml-2 font-mono text-[11px]" style={{ color: 'var(--text-light)' }}>{p.code}</span>
                      </div>
                    </label>
                  ))}
              </div>

              <div className="flex justify-between items-center px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--text-light)' }}>{byResProjIds.size} projeto(s)</span>
                <div className="flex gap-2">
                  <button onClick={() => { setByResStep(1); setByResSearch('') }}
                    className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors"
                    style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>← Voltar</button>
                  <button onClick={executeByRes} disabled={byResSaving || byResProjIds.size === 0}
                    className="px-4 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)' }}>
                    {byResSaving ? 'Alocando...' : 'Alocar'}
                  </button>
                </div>
              </div>
            </>)}
          </div>
        </div>
      )}

      {dataModal && (
        <ProjectDataModal
          projectId={dataModal.project.id}
          projectName={dataModal.project.name}
          initialTab={dataModal.tab}
          onClose={() => setDataModal(null)}
        />
      )}

      {openPeriodProject && (
        <OpenPeriodModal
          project={openPeriodProject}
          onClose={() => setOpenPeriodProject(null)}
          onRefresh={(hasOpen: boolean) => {
            // Update otimista em AMBOS os estados:
            //   - projects (usado em filtered → modo flat)
            //   - rows (usado em filteredRows → modo multi-contratual)
            setProjects(prev => prev.map(p =>
              p.id === openPeriodProject.id ? { ...p, has_open_period: hasOpen } as ProjectWithTeam : p
            ))
            setRows(prev => prev.map(r =>
              r.id === openPeriodProject.id ? { ...r, has_open_period: hasOpen } as TreeRow : r
            ))
            // NÃO dispara refetch imediato — backend tem eventual consistency
            // e responder antes de processar a mudança sobrescrevia o otimista.
            // Resposta 200 do POST já confirmou; otimista é confiável.
          }}
        />
      )}

    </AppLayout>
  )
}

// ─── Modal Períodos Abertos ───────────────────────────────────────────────────

function OpenPeriodModal({ project, onClose, onRefresh }: {
  project: ProjectWithTeam
  onClose: () => void
  onRefresh: (hasOpen: boolean) => void
}) {
  const now = new Date()
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const defaultYearMonth = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`

  const [yearMonth, setYearMonth]     = useState(defaultYearMonth)
  const [openPeriods, setOpenPeriods] = useState<{ id: number; year_month: string }[]>([])
  const [saving, setSaving]           = useState(false)
  const [closing, setClosing]         = useState(false)

  useEffect(() => {
    // Parsing defensivo: API pode retornar { data: [...] } ou [...] direto
    api.get<any>(`/projects/${project.id}/open-periods`)
      .then(r => {
        const list = Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : [])
        setOpenPeriods(list)
      })
      .catch(() => {})
  }, [project.id])

  // ESC fecha o modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const fmtMonth = (ym: string) => {
    const [y, m] = ym.split('-')
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }

  const handleOpen = async () => {
    setSaving(true)
    try {
      await api.post(`/projects/${project.id}/open-period`, { year_month: yearMonth })
      toast.success(`Mês ${fmtMonth(yearMonth)} aberto para este projeto.`)
      onRefresh(true)         // optimistic: tem mês aberto agora
      onClose()               // fecha modal automaticamente
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao abrir período')
    } finally { setSaving(false) }
  }

  const handleCloseAll = async () => {
    setClosing(true)
    try {
      const r = await api.post<{ count: number }>(`/projects/${project.id}/close-periods`, {})
      toast.success(`${r.count} período(s) fechado(s).`)
      onRefresh(false)        // optimistic: não há mais meses abertos
      onClose()               // fecha modal automaticamente
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao fechar períodos')
    } finally { setClosing(false) }
  }

  // Gera opções: últimos 12 meses antes do atual
  const monthOptions: { value: string; label: string }[] = []
  for (let i = 1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthOptions.push({ value: val, label: fmtMonth(val) })
  }

  // Considera tanto a lista detalhada quanto o flag do projeto.
  // Garante botão "Fechar" mesmo se /open-periods retornar vazio mas
  // o backend listou o projeto com has_open_period=true.
  const hasOpenPeriods = openPeriods.length > 0 || (project as any).has_open_period === true

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--brand-card-shadow-md)' }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 p-1 transition-colors" style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <CalendarPlus size={14} style={{ color: 'var(--warning-border)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Períodos Abertos</h3>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            <strong>{project.name}</strong> — permite apontamentos em meses com competência fechada
          </p>

          {hasOpenPeriods && (
            <div className="mb-4 space-y-1.5">
              <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Meses atualmente abertos:</p>
              {openPeriods.length > 0 ? openPeriods.map(p => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', color: 'var(--warning)', fontWeight: 600 }}>
                  <CalendarPlus size={11} style={{ color: 'var(--warning-border)' }} />
                  {fmtMonth(p.year_month)}
                </div>
              )) : (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', color: 'var(--warning)', fontWeight: 600 }}>
                  <CalendarPlus size={11} style={{ color: 'var(--warning-border)' }} />
                  Há mês(es) aberto(s) neste projeto
                </div>
              )}
              {/* Ação primária quando há mês aberto: FECHAR (era a opção "secundária" antes) */}
              <button
                onClick={handleCloseAll}
                disabled={closing}
                className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                style={{ background: 'var(--danger)', color: 'var(--primary-fg)', border: '1px solid var(--danger)' }}
              >
                <CalendarOff size={12} />
                {closing ? 'Fechando...' : 'Fechar mês(es) aberto(s)'}
              </button>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
                {hasOpenPeriods ? 'Ou abrir outro mês:' : 'Abrir mês:'}
              </label>
              <select
                value={yearMonth}
                onChange={e => setYearMonth(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                {monthOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--surface)' }}>
                Cancelar
              </button>
              <button
                onClick={handleOpen}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={hasOpenPeriods
                  ? { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                  : { background: 'var(--warning-border)', color: 'var(--surface)', border: '1px solid var(--warning-border)' }}
              >
                {saving ? 'Abrindo...' : 'Abrir Mês'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
