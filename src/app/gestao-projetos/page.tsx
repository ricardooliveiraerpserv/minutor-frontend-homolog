'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { Project, PaginatedResponse, HourContribution } from '@/types'
import { formatBRL } from '@/lib/format'
import { toast } from 'sonner'
import { Layers, Search, ChevronDown, ChevronRight, Users, TrendingUp, Clock, BarChart2, AlertTriangle, DollarSign, X, UserCheck, Pencil, Trash2, Plus, Edit2, MessageCircle, Eye, Check } from 'lucide-react'
import { ProjectMessages } from '@/components/shared/ProjectMessages'
import { MultiSelect } from '@/components/ui/multi-select'
import { PageHeader } from '@/components/ds'
import { RowMenu } from '@/components/ui/row-menu'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ProjectWithTeam extends Project {
  consultants?: { id: number; name: string; email: string }[]
  coordinators?: { id: number; name: string; email: string }[]
  child_projects?: ProjectWithTeam[]
  service_type?: { id: number; name: string } | null
  contract_type?: { id: number; name: string } | null
  contract_type_display?: string
}

interface ProjectFull extends ProjectWithTeam {
  description?: string | null
  start_date?: string | null
  project_value?: number | null
  hourly_rate?: number | null
  additional_hourly_rate?: number | null
  initial_cost?: number | null
  initial_hours_balance?: number | null
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
  onMenuAction: (action: 'view' | 'costs' | 'timesheets' | 'expenses' | 'team' | 'aportes' | 'messages', project: ProjectWithTeam) => void
  canEdit?: boolean
  canChangeStatus?: boolean
  onEdit?: (project: ProjectWithTeam) => void
  onChangeStatus?: (project: ProjectWithTeam) => void
  onDelete?: (project: ProjectWithTeam) => void
  treeRow?: TreeRow
  onTreeToggle?: () => void
  hasUnread?: boolean
}

function ProjectRow({ project, expanded, onToggle, onMenuAction, canEdit, canChangeStatus, onEdit, onChangeStatus, onDelete, treeRow, onTreeToggle, hasUnread }: ProjectRowProps) {
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

  // Tree visual
  const isChild           = treeRow ? treeRow._level > 0 : false
  const isParent          = treeRow ? treeRow._level === 0 && treeRow._hasChildren : false
  const isInactive        = isChild && (project as any).node_state === 'DISABLED'
  const isActive          = isChild && (project as any).node_state !== 'DISABLED'
  const isParentIndirect  = isParent && (project as any).coordinator_is_direct === false
  const rowBg             = isActive ? 'rgba(0,245,255,0.06)' : 'transparent'
  const rowBorderLeft     = isActive ? '3px solid #00F5FF'
    : isParent ? '2px solid rgba(255,255,255,0.07)'
    : isInactive ? '2px solid rgba(255,255,255,0.04)' : undefined
  const rowBoxShadow      = isActive ? 'inset 0 0 0 1px rgba(0,245,255,0.08)' : undefined
  const rowOpacity        = isInactive ? 0.4 : isParentIndirect ? 0.6 : 1

  const statusRowClass = project.status === 'cancelled' ? 'row--cancelado'
    : project.status === 'finished' ? 'row--encerrado'
    : project.status === 'paused' ? 'row--pausado'
    : ''
  const childRowClass = isChild ? 'row--child' : ''

  return (
    <>
      <tr
        className={`border-b transition-all cursor-pointer ${statusRowClass} ${childRowClass}`.trim()}
        style={{
          borderColor: 'var(--brand-border)',
          // Se filho ativo na tree, hierarquia visual prevalece sobre status
          background: isActive ? rowBg : !statusRowClass ? rowBg : undefined,
          borderLeft: isActive ? rowBorderLeft : !statusRowClass ? rowBorderLeft : undefined,
          boxShadow: rowBoxShadow,
          opacity: !statusRowClass ? rowOpacity : undefined,
        }}
        onClick={treeRow ? (treeRow._hasChildren ? onTreeToggle : undefined) : onToggle}
      >
        {/* Menu de ações */}
        <td className="py-2 pl-2 pr-1" style={{ width: 60 }} onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <RowMenu items={[
              { label: 'Visualizar', icon: <Eye size={12} />, onClick: () => onMenuAction('view', project) },
              ...(canEdit ? [{ label: 'Editar', icon: <Edit2 size={12} />, onClick: () => onEdit?.(project) }] : []),
              ...(canChangeStatus ? [{ label: 'Alterar Status', icon: <Layers size={12} />, onClick: () => onChangeStatus?.(project) }] : []),
              { label: 'Custo',             icon: <DollarSign  size={12} />, onClick: () => onMenuAction('costs',      project) },
              { label: 'Apontamentos',      icon: <Clock       size={12} />, onClick: () => onMenuAction('timesheets', project) },
              { label: 'Despesas',          icon: <BarChart2   size={12} />, onClick: () => onMenuAction('expenses',   project) },
              { label: 'Aportes',           icon: <TrendingUp  size={12} />, onClick: () => onMenuAction('aportes',    project) },
              { label: 'Selecionar Equipe', icon: <Users       size={12} />, onClick: () => onMenuAction('team',       project) },
              ...(onDelete ? [{ label: 'Excluir', icon: <Trash2 size={12} className="text-red-400" />, onClick: () => onDelete(project), danger: true }] : []),
            ]} />
            <button
              onClick={() => onMenuAction('messages', project)}
              className="relative flex items-center justify-center w-7 h-7 rounded transition-colors"
              style={hasUnread
                ? { color: '#00F5FF', background: 'rgba(0,245,255,0.12)' }
                : { color: '#52525B' }}
              title="Mensagens"
            >
              <MessageCircle size={13} />
              {hasUnread && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: '#00F5FF', boxShadow: '0 0 6px rgba(0,245,255,0.8)' }} />
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
                    ? <ChevronDown size={14} style={{ color: 'var(--brand-primary)' }} />
                    : <ChevronRight size={14} style={{ color: 'var(--brand-subtle)' }} />)
                : isChild
                  ? <span className="text-xs shrink-0" style={{ color: 'var(--brand-subtle)' }}>└─</span>
                  : <span className="w-3.5" />
              : teamCount > 0
                ? (expanded
                    ? <ChevronDown size={14} style={{ color: 'var(--brand-subtle)' }} />
                    : <ChevronRight size={14} style={{ color: 'var(--brand-subtle)' }} />)
                : <span className="w-3.5" />
            }
            <div>
              <div className="flex items-center gap-1.5">
                <p
                  className="text-sm font-semibold"
                  style={{ color: isActive ? '#00F5FF' : isParent ? 'var(--brand-subtle)' : 'var(--brand-muted)' }}
                >
                  {project.name}
                </p>
                {treeRow && isParent && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-subtle)' }}>PAI</span>
                )}
                {treeRow && isActive && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,245,255,0.12)', color: '#00F5FF' }}>ATIVO</span>
                )}
              </div>
              <p className="text-xs font-mono" style={{ color: 'var(--brand-subtle)' }}>
                {project.code}
              </p>
            </div>
          </div>
        </td>

        {/* Cliente */}
        <td className="py-3 pr-4 text-sm" style={{ color: 'var(--brand-muted)' }}>
          {project.customer?.name ?? '—'}
        </td>

        {/* Tipo de Contrato */}
        <td className="py-3 pr-4 text-xs" style={{ color: 'var(--brand-subtle)' }}>
          {project.contract_type_display ?? project.contract_type?.name ?? '—'}
        </td>

        {/* Tipo de Serviço */}
        <td className="py-3 pr-4 text-xs" style={{ color: 'var(--brand-subtle)' }}>
          {project.service_type?.name ?? '—'}
        </td>

        {/* HS Vendidas */}
        <td className="py-3 px-4 text-sm text-center tabular-nums" style={{ color: 'var(--brand-muted)' }}>
          {fmt(project.sold_hours)}
        </td>

        {/* HS Consumidas */}
        <td className="py-3 px-4 text-sm text-center tabular-nums" style={{ color: 'var(--brand-muted)' }}>
          {project.consumed_hours != null
            ? fmt(project.consumed_hours)
            : project.total_logged_minutes != null
              ? fmt(project.total_logged_minutes / 60, 1)
              : '—'
          }
        </td>

        {/* Saldo */}
        <td className="py-3 px-4 text-sm text-center tabular-nums font-semibold"
          style={{ color: saldoNeg ? '#ef4444' : 'var(--brand-text)' }}>
          {saldo != null ? fmt(saldo, 1) : '—'}
        </td>

        {/* % Uso + barra */}
        <td className="py-3 px-4 min-w-[140px]">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(pct, 100)}%`, background: hs.bar }}
              />
            </div>
            <span className="text-xs tabular-nums w-9 text-center" style={{ color: hs.text }}>
              {project.sold_hours ? `${Math.round(pct)}%` : '—'}
            </span>
          </div>
        </td>

        {/* Status */}
        <td className="py-3 whitespace-nowrap">
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{
              background: project.status === 'started' ? 'rgba(0,245,255,0.10)'
                : project.status === 'paused' ? 'rgba(245,158,11,0.12)'
                : project.status === 'cancelled' ? 'rgba(239,68,68,0.12)'
                : project.status === 'finished' ? 'rgba(161,161,170,0.12)'
                : project.status === 'awaiting_start' ? 'rgba(139,92,246,0.12)'
                : 'rgba(161,161,170,0.12)',
              color: project.status === 'started' ? '#00F5FF'
                : project.status === 'paused' ? '#F59E0B'
                : project.status === 'cancelled' ? '#EF4444'
                : project.status === 'finished' ? '#71717A'
                : project.status === 'awaiting_start' ? '#8B5CF6'
                : '#A1A1AA',
            }}
          >
            {project.status_display ?? statusLabel[project.status] ?? project.status}
          </span>
        </td>
      </tr>

      {/* Expansão: equipe */}
      {expanded && teamCount > 0 && (
        <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
          <td /><td />
          <td colSpan={9} className="py-3 px-4">
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

// ─── Project Edit Form ────────────────────────────────────────────────────────

interface ProjectEditForm {
  name: string; description: string; status: string
  start_date: string; expected_end_date: string
  sold_hours: string; project_value: string
  hourly_rate: string; additional_hourly_rate: string
  initial_hours_balance: string; initial_cost: string
  consultant_hours: string; coordinator_hours: string
  parent_project_id: string
  service_type_id: string; contract_type_id: string
  tipo_faturamento: string; tipo_alocacao: string
  condicao_pagamento: string; vendedor_id: string
  cobra_despesa_cliente: boolean
  observacoes_contrato: string
  max_expense_per_consultant: string
  timesheet_retroactive_limit_days: string
  allow_manual_timesheets: boolean; allow_negative_balance: boolean
  coordinator_ids: number[]; consultant_ids: number[]; consultant_group_ids: number[]
}

function ProjectInlineEditModal({ project, onClose, onSaved }: { project: ProjectFull; onClose: () => void; onSaved: () => void }) {
  const d = project as any
  const [form, setForm] = useState<ProjectEditForm>({
    name:                            d.name ?? '',
    description:                     d.description ?? '',
    status:                          d.status ?? 'awaiting_start',
    start_date:                      d.start_date?.slice(0, 10) ?? '',
    expected_end_date:               d.expected_end_date?.slice(0, 10) ?? '',
    sold_hours:                      d.sold_hours != null ? String(d.sold_hours) : '',
    project_value:                   d.project_value != null ? String(d.project_value) : '',
    hourly_rate:                     d.hourly_rate != null ? String(d.hourly_rate) : '',
    additional_hourly_rate:          d.additional_hourly_rate != null ? String(d.additional_hourly_rate) : '',
    initial_hours_balance:           d.initial_hours_balance != null ? String(d.initial_hours_balance) : '',
    initial_cost:                    d.initial_cost != null ? String(d.initial_cost) : '',
    consultant_hours:                d.consultant_hours != null ? String(d.consultant_hours) : '',
    coordinator_hours:               d.coordinator_hours != null ? String(d.coordinator_hours) : '',
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
    coordinator_ids:                 (d.coordinators ?? d.approvers ?? []).map((c: any) => c.id),
    consultant_ids:                  (d.consultants ?? []).map((c: any) => c.id),
    consultant_group_ids:            (d.consultant_groups ?? []).map((g: any) => g.id),
  })
  const [saving, setSaving] = useState(false)

  const [optServiceTypes,    setOptServiceTypes]    = useState<{id:number;name:string}[]>([])
  const [optContractTypes,   setOptContractTypes]   = useState<{id:number;name:string}[]>([])
  const [optCoordinators,    setOptCoordinators]    = useState<{id:number;name:string}[]>([])
  const [optConsultants,     setOptConsultants]     = useState<{id:number;name:string}[]>([])
  const [optGroups,          setOptGroups]          = useState<{id:number;name:string}[]>([])
  const [optParentProjects,  setOptParentProjects]  = useState<{id:number;name:string}[]>([])
  const [teamSearch,         setTeamSearch]         = useState('')
  const [teamTab,            setTeamTab]            = useState<'coord'|'consult'|'group'>('coord')

  useEffect(() => {
    const items = (r: any) => Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
    Promise.allSettled([
      api.get<any>('/service-types?pageSize=100'),
      api.get<any>('/contract-types?pageSize=100'),
      api.get<any>('/users?type=coordenador&coordinator_type=projetos&pageSize=200'),
      api.get<any>('/users?type=consultor&pageSize=200'),
      api.get<any>('/consultant-groups?pageSize=100&active=1'),
    ]).then(([st, ct, coords, consults, grps]) => {
      if (st.status === 'fulfilled')      setOptServiceTypes(items(st.value))
      if (ct.status === 'fulfilled')      setOptContractTypes(items(ct.value))
      if (coords.status === 'fulfilled')  setOptCoordinators(items(coords.value))
      if (consults.status === 'fulfilled') setOptConsultants(items(consults.value))
      if (grps.status === 'fulfilled')    setOptGroups(items(grps.value))
    })
    const customerId = d.customer_id
    if (customerId) {
      const qs = new URLSearchParams({ pageSize: '200', parent_projects_only: 'true', customer_id: String(customerId), exclude_id: String(project.id) })
      api.get<any>(`/projects?${qs}`).then(r => {
        const list = items(r)
        setOptParentProjects(list.map((p: any) => ({ id: p.id, name: `${p.code} - ${p.name}` })))
      }).catch(() => {})
    }
  }, [])

  const toggleId = (ids: number[], id: number) => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
  const setF = (key: keyof ProjectEditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }))

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Nome obrigatório'); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        description:          form.description || null,
        status:               form.status,
        start_date:           form.start_date || null,
        expected_end_date:    form.expected_end_date || null,
        allow_manual_timesheets: form.allow_manual_timesheets,
        allow_negative_balance:  form.allow_negative_balance,
        cobra_despesa_cliente:   form.cobra_despesa_cliente,
        observacoes_contrato: form.observacoes_contrato || null,
        condicao_pagamento:   form.condicao_pagamento || null,
        coordinator_ids:      form.coordinator_ids,
        consultant_ids:       form.consultant_ids,
        consultant_group_ids: form.consultant_group_ids,
      }
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
      if (form.initial_hours_balance !== '') payload.initial_hours_balance        = Number(form.initial_hours_balance)
      if (form.initial_cost !== '')          payload.initial_cost                 = Number(form.initial_cost)
      if (form.max_expense_per_consultant !== '') payload.max_expense_per_consultant = Number(form.max_expense_per_consultant)
      if (form.timesheet_retroactive_limit_days !== '') payload.timesheet_retroactive_limit_days = Number(form.timesheet_retroactive_limit_days)
      await api.put(`/projects/${project.id}`, payload)
      toast.success('Projeto atualizado')
      onSaved()
    } catch { toast.error('Erro ao salvar projeto') }
    finally { setSaving(false) }
  }

  const iStyle: React.CSSProperties = { width: '100%', background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', borderRadius: '0.625rem', padding: '0.5rem 0.75rem', fontSize: '0.8125rem', color: 'var(--brand-text)', outline: 'none' }
  const lStyle: React.CSSProperties = { fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brand-subtle)', marginBottom: '0.375rem', display: 'block' }
  const SecTitle = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[10px] font-semibold uppercase tracking-wider pt-3 pb-2" style={{ color: 'var(--brand-subtle)', borderTop: '1px solid var(--brand-border)' }}>{children}</p>
  )
  const Toggle2 = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--brand-border)' }}>
      <button type="button" onClick={() => onChange(!checked)}
        className="relative w-10 h-5 rounded-full transition-colors shrink-0"
        style={{ background: checked ? '#22c55e' : 'rgba(255,255,255,0.1)' }}>
        <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform" style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }} />
      </button>
      <span className="text-xs" style={{ color: 'var(--brand-text)' }}>{label}</span>
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="flex flex-col rounded-2xl w-full max-w-5xl max-h-[94vh]" style={{ background: 'var(--brand-surface)', border: '1px solid rgba(0,245,255,0.25)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>{d.code}</p>
            <h3 className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>Editar Projeto</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-6">

            {/* ── Coluna Esquerda ── */}
            <div className="space-y-3">

              {/* Identificação */}
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Identificação</p>
              <div><label style={lStyle}>Nome do Projeto *</label><input value={form.name} onChange={setF('name')} style={iStyle} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={lStyle}>Status</label>
                  <select value={form.status} onChange={setF('status')} style={iStyle}>
                    {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div><label style={lStyle}>Data de Início</label><input type="date" value={form.start_date} onChange={setF('start_date')} style={iStyle} /></div>
              </div>
              <div><label style={lStyle}>Data de Conclusão</label><input type="date" value={form.expected_end_date} onChange={setF('expected_end_date')} style={iStyle} /></div>
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
                <select value={form.parent_project_id} onChange={setF('parent_project_id')} style={iStyle}>
                  <option value="">Nenhum</option>
                  {optParentProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div><label style={lStyle}>Descrição</label><textarea value={form.description} onChange={setF('description')} style={{ ...iStyle, resize: 'vertical', minHeight: '64px' }} /></div>

              {/* Financeiro */}
              <SecTitle>Financeiro</SecTitle>
              <div className="grid grid-cols-2 gap-3">
                <div><label style={lStyle}>Valor do Projeto (R$)</label><input type="number" value={form.project_value} onChange={setF('project_value')} style={iStyle} placeholder="0.00" step="0.01" /></div>
                <div><label style={lStyle}>Valor da Hora (R$)</label><input type="number" value={form.hourly_rate} onChange={setF('hourly_rate')} style={iStyle} placeholder="0.00" step="0.01" /></div>
                <div><label style={lStyle}>Hora Adicional (R$)</label><input type="number" value={form.additional_hourly_rate} onChange={setF('additional_hourly_rate')} style={iStyle} placeholder="0.00" step="0.01" /></div>
                <div><label style={lStyle}>Horas Contratadas</label><input type="number" value={form.sold_hours} onChange={setF('sold_hours')} style={iStyle} placeholder="0" step="1" /></div>
                <div><label style={lStyle}>% Horas Coordenador</label><input type="number" value={form.coordinator_hours} onChange={setF('coordinator_hours')} style={iStyle} placeholder="0" step="1" min="0" max="100" /></div>
                <div><label style={lStyle}>Horas Consultor</label><input type="number" value={form.consultant_hours} onChange={setF('consultant_hours')} style={iStyle} placeholder="0" step="1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-xl p-3" style={{ border: '1px solid var(--brand-border)', background: 'rgba(255,255,255,0.02)' }}>
                <div><label style={{ ...lStyle, marginBottom: 0 }}>Histórico do sistema anterior</label></div>
                <div />
                <div><label style={lStyle}>Saldo Inicial de Horas</label><input type="number" value={form.initial_hours_balance} onChange={setF('initial_hours_balance')} style={iStyle} placeholder="0" step="0.5" /></div>
                <div><label style={lStyle}>Custo Inicial (R$)</label><input type="number" value={form.initial_cost} onChange={setF('initial_cost')} style={iStyle} placeholder="0.00" step="0.01" /></div>
              </div>

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
                  <p className="text-[10px] mt-1" style={{ color: 'var(--brand-subtle)' }}>Vazio = ilimitado</p>
                </div>
                <div>
                  <label style={lStyle}>Prazo para Lançamento (dias)</label>
                  <input type="number" value={form.timesheet_retroactive_limit_days} onChange={setF('timesheet_retroactive_limit_days')} style={iStyle} placeholder="Padrão global" min="0" max="365" />
                </div>
              </div>
              <Toggle2 checked={form.allow_manual_timesheets} onChange={v => setForm(p => ({ ...p, allow_manual_timesheets: v }))} label="Apontamentos manuais permitidos" />
              <Toggle2 checked={form.allow_negative_balance} onChange={v => setForm(p => ({ ...p, allow_negative_balance: v }))} label="Permitir saldo negativo de horas" />
            </div>

            {/* ── Coluna Direita — Equipe ── */}
            <div className="flex flex-col">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Equipe Alocada</p>
              <div className="flex gap-1 mb-3 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                {([
                  ['coord',   'Coordenadores', form.coordinator_ids.length],
                  ['consult', 'Consultores',   form.consultant_ids.length],
                  ['group',   'Grupos',         form.consultant_group_ids.length],
                ] as const).map(([id, label, count]) => (
                  <button key={id} onClick={() => { setTeamTab(id); setTeamSearch('') }}
                    className="px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap"
                    style={{ color: teamTab === id ? '#00F5FF' : 'var(--brand-subtle)', borderBottom: teamTab === id ? '2px solid #00F5FF' : '2px solid transparent', marginBottom: '-1px' }}>
                    {label}{count > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: 'rgba(0,245,255,0.12)', color: '#00F5FF' }}>{count}</span>}
                  </button>
                ))}
              </div>
              <input value={teamSearch} onChange={e => setTeamSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full text-xs px-3 py-2 rounded-xl outline-none mb-2"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }} />
              <div className="flex-1 overflow-y-auto space-y-1 rounded-xl p-2" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--brand-border)', maxHeight: 520 }}>
                {teamTab === 'coord' && filteredCoords.map(c => {
                  const sel = form.coordinator_ids.includes(c.id)
                  return (
                    <button key={c.id} onClick={() => setForm(p => ({ ...p, coordinator_ids: toggleId(p.coordinator_ids, c.id) }))}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/5"
                      style={{ background: sel ? 'rgba(0,245,255,0.06)' : 'transparent', border: `1px solid ${sel ? 'rgba(0,245,255,0.2)' : 'transparent'}` }}>
                      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: sel ? 'rgba(0,245,255,0.2)' : 'rgba(255,255,255,0.06)', border: '1px solid var(--brand-border)' }}>
                        {sel && <Check size={10} style={{ color: '#00F5FF' }} />}
                      </div>
                      <span className="text-xs" style={{ color: sel ? '#00F5FF' : 'var(--brand-text)' }}>{c.name}</span>
                    </button>
                  )
                })}
                {teamTab === 'consult' && filteredConsults.map(c => {
                  const sel = form.consultant_ids.includes(c.id)
                  return (
                    <button key={c.id} onClick={() => setForm(p => ({ ...p, consultant_ids: toggleId(p.consultant_ids, c.id) }))}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/5"
                      style={{ background: sel ? 'rgba(139,92,246,0.06)' : 'transparent', border: `1px solid ${sel ? 'rgba(139,92,246,0.25)' : 'transparent'}` }}>
                      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: sel ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)', border: '1px solid var(--brand-border)' }}>
                        {sel && <Check size={10} style={{ color: '#a78bfa' }} />}
                      </div>
                      <span className="text-xs" style={{ color: sel ? '#a78bfa' : 'var(--brand-text)' }}>{c.name}</span>
                    </button>
                  )
                })}
                {teamTab === 'group' && filteredGroups.map(g => {
                  const sel = form.consultant_group_ids.includes(g.id)
                  return (
                    <button key={g.id} onClick={() => setForm(p => ({ ...p, consultant_group_ids: toggleId(p.consultant_group_ids, g.id) }))}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/5"
                      style={{ background: sel ? 'rgba(245,158,11,0.06)' : 'transparent', border: `1px solid ${sel ? 'rgba(245,158,11,0.25)' : 'transparent'}` }}>
                      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: sel ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)', border: '1px solid var(--brand-border)' }}>
                        {sel && <Check size={10} style={{ color: '#f59e0b' }} />}
                      </div>
                      <span className="text-xs" style={{ color: sel ? '#f59e0b' : 'var(--brand-text)' }}>{g.name}</span>
                    </button>
                  )
                })}
                {teamTab === 'coord'   && filteredCoords.length   === 0 && <p className="text-xs text-center py-4" style={{ color: 'var(--brand-subtle)' }}>Nenhum resultado</p>}
                {teamTab === 'consult' && filteredConsults.length === 0 && <p className="text-xs text-center py-4" style={{ color: 'var(--brand-subtle)' }}>Nenhum resultado</p>}
                {teamTab === 'group'   && filteredGroups.length   === 0 && <p className="text-xs text-center py-4" style={{ color: 'var(--brand-subtle)' }}>Nenhum resultado</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold" style={{ background: saving ? 'rgba(0,245,255,0.05)' : 'rgba(0,245,255,0.1)', color: '#00F5FF', border: '1px solid rgba(0,245,255,0.3)', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProjectEditByIdModal({ projectId, onClose, onSaved }: { projectId: number; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState<ProjectFull | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get<ProjectFull>(`/projects/${projectId}`).then(setP).catch(() => toast.error('Erro ao carregar projeto')).finally(() => setLoading(false))
  }, [projectId])
  if (loading) return <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}><p className="text-sm animate-pulse" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p></div>
  if (!p) return null
  return <ProjectInlineEditModal project={p} onClose={onClose} onSaved={onSaved} />
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function GestaoProjetosPage() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.type === 'admin'
  const isCoordenador = user?.type === 'coordenador'
  const isCliente = user?.type === 'cliente'
  const ep = user?.extra_permissions ?? []
  const canEdit = !isCliente
  const canChangeStatus = !isCliente
  const canDelete = isAdmin || isCoordenador

  const [projects, setProjects]   = useState<ProjectWithTeam[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState('')
  const [clienteFilters, setCliente] = useState<string[]>([])
  const [saudeFilter, setSaude]   = useState('')
  const [expanded, setExpanded]   = useState<Set<number>>(new Set())
  const [filterContractType, setFilterContractType] = useState('')
  const [filterServiceTypes, setFilterServiceType] = useState<string[]>([])
  const [serviceTypes, setServiceTypes] = useState<{ id: number; name: string }[]>([])
  const [multiContratual, setMultiContratual] = useState(false)
  const [rows, setRows] = useState<TreeRow[]>([])

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

  useEffect(() => {
    const items = (r: any) => Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
    api.get<any>('/service-types?pageSize=100').then(r => setServiceTypes(items(r))).catch(() => {})
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

  // Modal de aportes
  const [aportesProject, setAportesProject]   = useState<ProjectWithTeam | null>(null)
  const [contributions, setContributions]     = useState<HourContribution[]>([])
  const [contribLoading, setContribLoading]   = useState(false)
  const [contribModal, setContribModal]       = useState<{ open: boolean; item?: HourContribution }>({ open: false })
  const [contribForm, setContribForm]         = useState({ contributed_hours: '', hourly_rate: '', contributed_at: '', description: '' })
  const [contribSaving, setContribSaving]     = useState(false)
  const [contribDeleteConfirm, setContribDeleteConfirm] = useState<HourContribution | null>(null)

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams({ pageSize: '200', gestao: 'true' })
    if (multiContratual) qs.set('parent_projects_only', 'true')
    if (!multiContratual && filterContractType) qs.set('contract_type_id', filterContractType)
    api.get<PaginatedResponse<ProjectWithTeam>>(`/projects?${qs}`)
      .then(res => {
        const items = res.items ?? []
        setProjects(items)
        if (multiContratual) setRows(items.map(p => toTreeRow(p)))
      })
      .catch(() => toast.error('Erro ao carregar projetos'))
      .finally(() => setLoading(false))
  }, [multiContratual, filterContractType, refreshKey])

  const clientes = useMemo(() => {
    const seen = new Set<string>()
    return projects
      .filter(p => p.customer?.name)
      .map(p => ({ id: String(p.customer_id), name: p.customer!.name }))
      .filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [projects])

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

  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (filterContractType && p.contract_type_display !== filterContractType) return false
      if (filterServiceTypes.length > 0) {
        const stId = (p as any).service_type_id ?? (p as any).service_type?.id
        if (!filterServiceTypes.includes(String(stId))) return false
      }
      if (statusFilter && p.status !== statusFilter) return false
      if (clienteFilters.length > 0 && !clienteFilters.includes(String(p.customer_id))) return false
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
  }, [projects, search, statusFilter, clienteFilters, saudeFilter, filterContractType, filterServiceTypes])

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
      if (statusFilter && p.status !== statusFilter) return false
      if (clienteFilters.length > 0 && !clienteFilters.includes(String(p.customer_id))) return false
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
  }, [rows, multiContratual, statusFilter, clienteFilters, saudeFilter, search])

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

  const [viewProject, setViewProject] = useState<ProjectWithTeam | null>(null)
  const [viewProjectFull, setViewProjectFull] = useState<ProjectFull | null>(null)
  const [viewProjectLoading, setViewProjectLoading] = useState(false)
  const [viewProjectTab, setViewProjectTab] = useState<'overview' | 'cost'>('overview')
  const [viewCostSummary, setViewCostSummary] = useState<CostSummary | null>(null)
  const [viewCostLoading, setViewCostLoading] = useState(false)
  const [messagesProject, setMessagesProject] = useState<ProjectWithTeam | null>(null)

  // Auto-open messages modal when ?messages=PROJECT_ID is in URL
  useEffect(() => {
    if (projects.length === 0) return
    const pid = new URLSearchParams(window.location.search).get('messages')
    if (!pid) return
    const found = projects.find(p => String(p.id) === pid)
    if (found) setMessagesProject(found)
    window.history.replaceState({}, '', window.location.pathname)
  }, [projects])

  const handleMenuAction = async (action: 'view' | 'costs' | 'timesheets' | 'expenses' | 'team' | 'aportes' | 'messages', project: ProjectWithTeam) => {
    if (action === 'view') {
      setViewProject(project)
      setViewProjectFull(null)
      setViewProjectTab('overview')
      setViewCostSummary(null)
      setViewProjectLoading(true)
      api.get<ProjectFull>(`/projects/${project.id}`)
        .then(r => setViewProjectFull(r))
        .catch(() => {})
        .finally(() => setViewProjectLoading(false))
      return
    }
    if (action === 'messages') { setMessagesProject(project); return }
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
            api.get<{ items: { id: number; name: string }[] }>('/users?exclude_type=cliente&pageSize=200')
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
          <MultiSelect
            value={clienteFilters}
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
          <MultiSelect
            value={filterServiceTypes}
            onChange={v => setFilterServiceType(v)}
            placeholder="Todos os serviços"
            options={serviceTypes.map(s => ({ id: String(s.id), name: s.name }))}
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
            onClick={() => { setMultiContratual(v => !v) }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
            style={multiContratual
              ? { background: 'var(--brand-primary)', color: '#0A0A0B', boxShadow: '0 0 12px rgba(0,245,255,0.35)' }
              : { background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)', border: '1px solid rgba(0,245,255,0.25)' }}
          >
            ⬡ Multi-contratual
          </button>
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
            {availableContractTypes.map(ct => (
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
        {loading ? (
          <Skeleton />
        ) : (multiContratual ? filteredRows : filtered).length === 0 ? (
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
                  <th className="py-3 pr-4 text-xs font-semibold" style={{ color: 'var(--brand-muted)' }}>Tipo Contrato</th>
                  <th className="py-3 pr-4 text-xs font-semibold" style={{ color: 'var(--brand-muted)' }}>Tipo Serviço</th>
                  <th className="py-3 px-4 text-xs font-semibold text-center" style={{ color: 'var(--brand-muted)' }}>HS Vendidas</th>
                  <th className="py-3 px-4 text-xs font-semibold text-center" style={{ color: 'var(--brand-muted)' }}>HS Consumidas</th>
                  <th className="py-3 px-4 text-xs font-semibold text-center" style={{ color: 'var(--brand-muted)' }}>Saldo</th>
                  <th className="py-3 px-4 text-xs font-semibold text-center" style={{ color: 'var(--brand-muted)', minWidth: 140 }}>% Uso</th>
                  <th className="py-3 text-xs font-semibold" style={{ color: 'var(--brand-muted)' }}>Status</th>
                </tr>
              </thead>
              <tbody style={{ background: 'var(--brand-bg)' }}>
                {(multiContratual ? filteredRows : filtered).map(project => {
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
                      onEdit={p => setEditProjectId(p.id)}
                      onChangeStatus={p => setStatusModal({ open: true, project: p, newStatus: p.status ?? '' })}
                      onDelete={canDelete ? p => setDeleteProject(p) : undefined}
                      hasUnread={unreadProjectIds.has(project.id)}
                      treeRow={tr}
                      onTreeToggle={tr ? () => toggleTree(tr) : undefined}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

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

      {/* ── Modal: Alterar Status ── */}
      {statusModal.open && statusModal.project && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl w-full max-w-sm p-6" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Alterar Status</h3>
              <button onClick={() => setStatusModal({ open: false, project: null, newStatus: '' })} style={{ color: 'var(--brand-subtle)' }}><X size={16} /></button>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--brand-muted)' }}>
              Projeto: <strong style={{ color: 'var(--brand-text)' }}>{statusModal.project.name}</strong>
            </p>
            <select
              value={statusModal.newStatus}
              onChange={e => setStatusModal(s => ({ ...s, newStatus: e.target.value }))}
              className="w-full appearance-none px-3 py-2.5 rounded-xl text-sm outline-none mb-5"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
            >
              {PROJECT_STATUSES.map(s => (
                <option key={s.value} value={s.value} style={{ background: '#161618' }}>{s.label}</option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setStatusModal({ open: false, project: null, newStatus: '' })}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>
                Cancelar
              </button>
              <button onClick={handleChangeStatus} disabled={statusSaving || statusModal.newStatus === statusModal.project.status}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}>
                {statusSaving ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Visualização ── */}
      {viewProject && (() => {
        const base = viewProject
        const p: ProjectFull = viewProjectFull ?? base
        const consumed = p.consumed_hours ?? (p.total_logged_minutes != null ? p.total_logged_minutes / 60 : 0)
        const totalAvail = p.total_available_hours ?? ((p.sold_hours ?? 0) + (p.hour_contribution ?? 0))
        const pct = totalAvail > 0 ? (consumed / totalAvail) * 100 : 0
        const color = healthColor(pct)
        const hs = healthStyles[color]
        const statusLabel: Record<string, string> = {
          active: 'Ativo', started: 'Em Andamento', awaiting_start: 'Aguardando Início',
          paused: 'Pausado', finished: 'Finalizado', cancelled: 'Cancelado',
        }
        const fmtDate = (d?: string | null) => d ? d.slice(0,10).split('-').reverse().join('/') : '—'
        const fmtBRL  = (v?: number | null) => v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'
        const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
          <div className="flex items-start justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--brand-border)' }}>
            <span className="text-xs shrink-0 w-40" style={{ color: 'var(--brand-subtle)' }}>{label}</span>
            <span className="text-xs font-semibold text-right" style={{ color: 'var(--brand-text)' }}>{value ?? '—'}</span>
          </div>
        )
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
            <div className="flex flex-col rounded-2xl w-full max-w-3xl max-h-[92vh]" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-12 rounded-full" style={{ background: hs.bar }} />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>{p.code}</p>
                    <h2 className="text-lg font-bold" style={{ color: 'var(--brand-text)' }}>{p.name}</h2>
                    {p.parent_project && (
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--brand-subtle)' }}>Subprojeto de: {p.parent_project.name} ({p.parent_project.code})</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setViewProject(null); setViewProjectFull(null); router.push(`/timesheets?project_id=${base.id}`) }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}><Clock size={11} /> Apontamentos</button>
                  <button onClick={() => { setViewProject(null); setViewProjectFull(null); router.push(`/expenses?project_id=${base.id}`) }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}><BarChart2 size={11} /> Despesas</button>
                  <button onClick={() => { setViewProject(null); setMessagesProject(base) }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}><MessageCircle size={11} /> Mensagens</button>
                  {canEdit && (
                    <button onClick={() => { setViewProject(null); setEditProjectId(p.id) }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors" style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)', border: '1px solid rgba(0,245,255,0.2)' }}><Edit2 size={11} /> Editar</button>
                  )}
                  <button onClick={() => { setViewProject(null); setViewProjectFull(null) }} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"><X size={16} style={{ color: 'var(--brand-muted)' }} /></button>
                </div>
              </div>

              {/* Status badge row */}
              <div className="flex items-center gap-3 px-6 py-3 border-b shrink-0 flex-wrap" style={{ borderColor: 'var(--brand-border)', background: 'rgba(0,0,0,0.2)' }}>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{
                    background: p.status === 'started' ? 'rgba(0,245,255,0.10)' : p.status === 'paused' ? 'rgba(245,158,11,0.12)' : p.status === 'cancelled' ? 'rgba(239,68,68,0.12)' : p.status === 'finished' ? 'rgba(161,161,170,0.12)' : 'rgba(139,92,246,0.12)',
                    color: p.status === 'started' ? '#00F5FF' : p.status === 'paused' ? '#F59E0B' : p.status === 'cancelled' ? '#EF4444' : p.status === 'finished' ? '#71717A' : '#8B5CF6',
                  }}>
                  {p.status_display ?? statusLabel[p.status] ?? p.status}
                </span>
                {p.customer?.name && <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)' }}>{p.customer.name}</span>}
                {(p.contract_type_display ?? p.contract_type?.name) && <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)' }}>{p.contract_type_display ?? p.contract_type?.name}</span>}
                {p.service_type?.name && <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)' }}>{p.service_type.name}</span>}
                {viewProjectLoading && <span className="text-[10px] animate-pulse" style={{ color: 'var(--brand-subtle)' }}>Carregando detalhes...</span>}
              </div>

              {/* Tab nav */}
              <div className="flex gap-1 px-6 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                {(['overview', 'cost'] as const).map(t => (
                  <button key={t} onClick={() => {
                    setViewProjectTab(t)
                    if (t === 'cost' && !viewCostSummary && !viewCostLoading) {
                      setViewCostLoading(true)
                      api.get<CostSummary>(`/projects/${base.id}/cost-summary`)
                        .then(r => setViewCostSummary(r))
                        .catch(() => {})
                        .finally(() => setViewCostLoading(false))
                    }
                  }}
                    className="px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap"
                    style={{ color: viewProjectTab === t ? '#00F5FF' : 'var(--brand-subtle)', borderBottom: viewProjectTab === t ? '2px solid #00F5FF' : '2px solid transparent', marginBottom: '-1px' }}>
                    {t === 'overview' ? 'Visão Geral' : 'Custo'}
                  </button>
                ))}
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto">
                {viewProjectTab === 'cost' && (
                  <div className="p-6 space-y-5">
                    {viewCostLoading && <p className="text-xs text-center py-8" style={{ color: 'var(--brand-subtle)' }}>Calculando custos...</p>}
                    {!viewCostLoading && !viewCostSummary && <p className="text-xs text-center py-8" style={{ color: 'var(--brand-subtle)' }}>Nenhum dado de custo disponível.</p>}
                    {!viewCostLoading && viewCostSummary && (() => {
                      const { project_info: pi, hours_summary: hs, cost_calculation: cc, consultant_breakdown: cb } = viewCostSummary
                      const marginColor = cc.margin_percentage >= 30 ? '#22c55e' : cc.margin_percentage >= 10 ? '#f59e0b' : '#ef4444'
                      const hoursUsedPct = Math.min(100, Math.max(0, hs.hours_percentage ?? 0))
                      const hoursBarColor = hoursUsedPct >= 90 ? '#ef4444' : hoursUsedPct >= 70 ? '#f59e0b' : '#22c55e'
                      return (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { label: 'Valor do Projeto', value: fmtBRL(pi.project_value ?? 0),         icon: DollarSign, color: '#00F5FF' },
                              { label: 'Custo Total',       value: fmtBRL(cc.total_cost),                 icon: TrendingUp,  color: '#f59e0b' },
                              { label: 'Margem',            value: fmtBRL(cc.margin),                     icon: BarChart2,   color: marginColor },
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
                                      <td className="px-3 py-2.5 tabular-nums text-[11px]" style={{ color: 'var(--brand-muted)' }}>{c.consultant_hourly_rate != null ? fmtBRL(c.consultant_hourly_rate) : '—'}{c.consultant_rate_type === 'monthly' && <span className="ml-1 opacity-60">÷180</span>}</td>
                                      <td className="px-3 py-2.5 tabular-nums font-bold" style={{ color: 'var(--brand-text)' }}>{fmtBRL(c.cost)}</td>
                                    </tr>
                                  ))}
                                  <tr style={{ background: 'rgba(0,245,255,0.04)', borderTop: '1px solid var(--brand-border)' }}>
                                    <td className="px-3 py-2.5 font-bold text-[11px] uppercase" style={{ color: 'var(--brand-subtle)' }} colSpan={5}>Total</td>
                                    <td className="px-3 py-2.5 font-bold tabular-nums" style={{ color: '#00F5FF' }}>{fmtBRL(cc.total_cost)}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
                {viewProjectTab === 'overview' && (
                <div className="grid grid-cols-2 gap-0 divide-x" style={{ borderColor: 'var(--brand-border)' }}>

                  {/* Coluna esquerda */}
                  <div className="p-5 space-y-5">

                    {/* Identificação */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Identificação</p>
                      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                        <div className="divide-y" style={{ borderColor: 'var(--brand-border)' }}>
                          <Row label="Código" value={<span className="font-mono">{p.code}</span>} />
                          <Row label="Cliente" value={p.customer?.name} />
                          <Row label="Tipo de Serviço" value={p.service_type?.name} />
                          <Row label="Tipo de Contrato" value={p.contract_type_display ?? p.contract_type?.name} />
                          <Row label="Projeto Pai" value={p.parent_project ? `${p.parent_project.name} (${p.parent_project.code})` : null} />
                          <Row label="Data de Início" value={fmtDate(p.start_date)} />
                          {p.proj_year && <Row label="Ano / Seq." value={`${p.proj_year} / ${p.proj_sequence ?? '—'}`} />}
                        </div>
                      </div>
                    </div>

                    {/* Descrição */}
                    {p.description && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Descrição</p>
                        <div className="rounded-xl p-3 text-xs leading-relaxed" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)' }}>
                          {p.description}
                        </div>
                      </div>
                    )}

                    {/* Financeiro */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Financeiro</p>
                      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                        <div className="divide-y" style={{ borderColor: 'var(--brand-border)' }}>
                          <Row label="Valor do Projeto" value={<span style={{ color: '#00F5FF' }}>{fmtBRL(p.project_value)}</span>} />
                          {p.total_project_value != null && p.total_project_value !== p.project_value && (
                            <Row label="Valor Total (c/ aportes)" value={<span style={{ color: '#00F5FF' }}>{fmtBRL(p.total_project_value)}</span>} />
                          )}
                          <Row label="Valor da Hora" value={fmtBRL(p.hourly_rate)} />
                          {p.weighted_hourly_rate != null && <Row label="Taxa Média Ponderada" value={fmtBRL(p.weighted_hourly_rate)} />}
                          <Row label="Hora Adicional" value={fmtBRL(p.additional_hourly_rate)} />
                          <Row label="Custo Inicial" value={fmtBRL(p.initial_cost)} />
                          {p.save_erpserv != null && p.save_erpserv > 0 && <Row label="Save ERPSERV" value={fmtBRL(p.save_erpserv)} />}
                          {p.max_expense_per_consultant != null && <Row label="Limite Despesa/Consultor" value={fmtBRL(p.max_expense_per_consultant)} />}
                          {p.expense_responsible_party && <Row label="Resp. Despesas" value={p.expense_responsible_party === 'client' ? 'Cliente' : 'Consultoria'} />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Coluna direita */}
                  <div className="p-5 space-y-5">

                    {/* Horas */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Horas</p>
                      {/* Barra principal */}
                      <div className="rounded-xl p-4 mb-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--brand-border)' }}>
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          {[
                            { label: 'Vendidas',   value: fmt(p.sold_hours) + 'h',              color: 'var(--brand-text)' },
                            { label: 'Consumidas', value: fmt(consumed, 1) + 'h',               color: 'var(--brand-muted)' },
                            { label: 'Saldo',      value: fmt(p.general_hours_balance, 1) + 'h', color: (p.general_hours_balance ?? 0) < 0 ? '#ef4444' : '#22c55e' },
                          ].map(it => (
                            <div key={it.label} className="text-center">
                              <p className="text-[10px] mb-1" style={{ color: 'var(--brand-subtle)' }}>{it.label}</p>
                              <p className="text-base font-bold tabular-nums" style={{ color: it.color }}>{it.value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="w-full h-2 rounded-full overflow-hidden mb-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: hs.bar }} />
                        </div>
                        <div className="flex justify-between text-[10px]" style={{ color: hs.text }}>
                          <span>{totalAvail > 0 ? `${Math.round(pct)}% consumido` : 'Sem horas'}</span>
                          <span>{fmt(totalAvail, 1)}h disponíveis</span>
                        </div>
                      </div>
                      {/* Detalhes de horas */}
                      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                        <div className="divide-y" style={{ borderColor: 'var(--brand-border)' }}>
                          <Row label="Horas Contratadas" value={p.sold_hours != null ? `${p.sold_hours}h` : null} />
                          {p.hour_contribution != null && p.hour_contribution > 0 && <Row label="Aporte Inicial" value={`${p.hour_contribution}h`} />}
                          {viewProjectFull?.full_contributions_hours != null && viewProjectFull.full_contributions_hours > 0 && <Row label="Total Aportes" value={`${fmt(viewProjectFull.full_contributions_hours, 1)}h`} />}
                          {p.exceeded_hour_contribution != null && <Row label="Aporte Excedido" value={`${p.exceeded_hour_contribution}h`} />}
                          {p.consultant_hours != null && <Row label="Horas Consultores" value={`${p.consultant_hours}h`} />}
                          {p.coordinator_hours != null && <Row label="Horas Coordenadores" value={`${p.coordinator_hours}h`} />}
                          {p.initial_hours_balance != null && <Row label="Saldo Inicial" value={`${p.initial_hours_balance}h`} />}
                          <Row label="% Consumido" value={<span style={{ color: hs.text }}>{totalAvail > 0 ? `${Math.round(pct)}%` : '—'}</span>} />
                        </div>
                      </div>
                    </div>

                    {/* Equipe */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Equipe</p>
                      <div className="rounded-xl p-3 space-y-3" style={{ border: '1px solid var(--brand-border)' }}>
                        {(p.coordinators?.length ?? 0) > 0 && (
                          <div>
                            <p className="text-[10px] mb-1.5 font-medium" style={{ color: 'var(--brand-subtle)' }}>Coordenadores</p>
                            <div className="flex flex-wrap gap-1.5">
                              {p.coordinators!.map(u => <span key={u.id} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF' }}>{u.name}</span>)}
                            </div>
                          </div>
                        )}
                        {(p.consultants?.length ?? 0) > 0 && (
                          <div>
                            <p className="text-[10px] mb-1.5 font-medium" style={{ color: 'var(--brand-subtle)' }}>Consultores</p>
                            <div className="flex flex-wrap gap-1.5">
                              {p.consultants!.map(u => <span key={u.id} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)' }}>{u.name}</span>)}
                            </div>
                          </div>
                        )}
                        {(viewProjectFull?.approvers?.length ?? 0) > 0 && (
                          <div>
                            <p className="text-[10px] mb-1.5 font-medium" style={{ color: 'var(--brand-subtle)' }}>Aprovadores</p>
                            <div className="flex flex-wrap gap-1.5">
                              {viewProjectFull!.approvers!.map(u => <span key={u.id} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'rgba(139,92,246,0.10)', color: '#8B5CF6' }}>{u.name}</span>)}
                            </div>
                          </div>
                        )}
                        {(p.coordinators?.length ?? 0) === 0 && (p.consultants?.length ?? 0) === 0 && (
                          <p className="text-xs text-center py-2" style={{ color: 'var(--brand-subtle)' }}>Sem equipe cadastrada</p>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-3 shrink-0" style={{ borderTop: '1px solid var(--brand-border)' }}>
                <div className="flex gap-2">
                  <button onClick={() => { setViewProject(null); handleMenuAction('aportes', base) }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}><TrendingUp size={11} /> Aportes</button>
                  <button onClick={() => { setViewProject(null); handleMenuAction('team', base) }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}><Users size={11} /> Equipe</button>
                </div>
                <button onClick={() => { setViewProject(null); setViewProjectFull(null) }} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>Fechar</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Modal de Mensagens ── */}
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

      {/* ── Modal de Edição de Projeto ── */}
      {editProjectId && (
        <ProjectEditByIdModal
          projectId={editProjectId}
          onClose={() => setEditProjectId(null)}
          onSaved={() => { setEditProjectId(null); setRefreshKey(k => k + 1) }}
        />
      )}

      {/* ── Modal de Exclusão de Projeto ── */}
      {deleteProject && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70">
          <div className="rounded-2xl w-full max-w-sm overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid rgba(239,68,68,0.4)' }}>
            <div className="px-6 py-5 flex items-center gap-3">
              <Trash2 size={20} className="text-red-400 shrink-0" />
              <div>
                <p className="font-semibold text-white">Excluir Projeto</p>
                <p className="text-xs text-zinc-400 mt-0.5">{deleteProject.name} · {deleteProject.code}</p>
              </div>
            </div>
            <div className="px-6 pb-4">
              <p className="text-sm text-zinc-300">Tem certeza? Esta ação não pode ser desfeita.</p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: 'var(--brand-border)' }}>
              <button onClick={() => setDeleteProject(null)} disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors">
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
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                <Trash2 size={14} /> {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

    </AppLayout>
  )
}
