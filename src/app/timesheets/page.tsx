'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useApiQuery } from '@/hooks/use-query'
import { Timesheet, PaginatedResponse } from '@/types'
import { useState, useMemo, useCallback, useRef, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import {
  Clock, RefreshCw, FileSpreadsheet, Plus, Pencil,
  Trash2, X, Globe, Webhook, MoreVertical, Eye, Search, ChevronDown,
  Paperclip, Calendar, Building2, FolderOpen, Ticket, Hash,
  FileText, CheckCircle, User, CalendarDays, ChevronLeft, ChevronRight, DollarSign, TrendingUp,
} from 'lucide-react'
import { ConfirmDeleteModal } from '@/components/ui/confirm-delete-modal'
import { TimesheetViewModal } from '@/components/ui/timesheet-view-modal'
import { TimesheetFormModal } from '@/components/ui/timesheet-form-modal'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { MultiSelect } from '@/components/ui/multi-select'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { ApiError } from '@/lib/api'
import {
  PageHeader, Table, Thead, Th, Tbody, Tr, Td,
  Badge, Button, Select, TextInput, Pagination,
  EmptyState, SkeletonTable,
} from '@/components/ds'

// ─── Types ───────────────────────────────────────────────────────────────────

type SortField = 'date' | 'status' | 'user.name' | 'project.name' | 'customer.name' | 'effort_hours'
type SortDir   = 'asc' | 'desc'

interface SelectOption { id: number; name: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function formatMinutes(minutes: number) {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}

// ─── Origin badge ─────────────────────────────────────────────────────────────

function OriginBadge({ origin, isBillableOnly, isInternalAction, isReleased, canSeePct, clientExtraPct, consultantExtraPct }: {
  origin?: string
  isBillableOnly?: boolean
  isInternalAction?: boolean
  isReleased?: boolean
  canSeePct?: boolean
  clientExtraPct?: number | null
  consultantExtraPct?: number | null
}) {
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {isInternalAction && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(100,116,139,0.18)', color: '#94a3b8' }}
        >
          Ação Interna
        </span>
      )}
      {isReleased && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(16,185,129,0.14)', color: '#10B981' }}
        >
          Liberado
        </span>
      )}
      {isBillableOnly && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}
        >
          <DollarSign size={9} /> Fat. Admin
        </span>
      )}
      {canSeePct && clientExtraPct ? (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}
        >
          +{Number(clientExtraPct)}% cli
        </span>
      ) : null}
      {canSeePct && consultantExtraPct ? (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}
        >
          +{Number(consultantExtraPct)}% cons
        </span>
      ) : null}
      {origin === 'webhook' ? (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}
        >
          <Webhook size={9} /> Movidesk
        </span>
      ) : (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF' }}
        >
          <Globe size={9} /> Web
        </span>
      )}
    </span>
  )
}

// ─── DateRangePicker ──────────────────────────────────────────────────────────

const MONTH_NAMES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MONTH_SHORT_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
const DAY_NAMES_PT   = ['dom','seg','ter','qua','qui','sex','sáb']

function dateISO(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function DateRangePicker({ from, to, onChange }: {
  from: string; to: string
  onChange: (from: string, to: string) => void
}) {
  const [pos,       setPos]       = useState<{ top: number; left: number } | null>(null)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [hover,     setHover]     = useState<string | null>(null)
  const [leftYM,    setLeftYM]    = useState(() => {
    const d = from ? new Date(from + 'T00:00:00') : new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const ref    = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const open   = pos !== null

  const rightYM = leftYM.m === 11
    ? { y: leftYM.y + 1, m: 0 }
    : { y: leftYM.y, m: leftYM.m + 1 }

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setPos(null); setSelecting(null); setHover(null)
      }
    }
    const s = () => setPos(null)
    document.addEventListener('mousedown', h)
    window.addEventListener('scroll', s, { passive: true })
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('scroll', s) }
  }, [open])

  const toggle = () => {
    if (open) { setPos(null); setSelecting(null); return }
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    // dropdown is ~500px wide; position so it doesn't overflow right edge
    const dropW = 500
    const left  = Math.min(r.left, window.innerWidth - dropW - 8)
    setPos({ top: r.bottom + 4, left: Math.max(8, left) })
  }

  const prevMonth = () => setLeftYM(p => p.m === 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m: p.m - 1 })
  const nextMonth = () => setLeftYM(p => p.m === 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m: p.m + 1 })

  const isStart  = (d: string) => d === (selecting ?? from)
  const isEnd    = (d: string) => selecting ? d === hover : d === to
  const inRange  = (d: string) => {
    const s = selecting ?? from
    const e = selecting ? (hover ?? '') : to
    if (!s || !e) return false
    const [a, b] = s <= e ? [s, e] : [e, s]
    return d > a && d < b
  }

  const handleDay = (d: string) => {
    if (!selecting) { setSelecting(d) }
    else {
      const [s, e] = selecting <= d ? [selecting, d] : [d, selecting]
      onChange(s, e); setSelecting(null); setHover(null); setPos(null)
    }
  }

  const renderMonth = (y: number, m: number) => {
    const days     = new Date(y, m + 1, 0).getDate()
    const firstDay = new Date(y, m, 1).getDay()
    const todayStr = new Date().toISOString().split('T')[0]
    const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
    while (cells.length % 7 !== 0) cells.push(null)
    return (
      <div className="w-[196px]">
        <div className="text-center text-sm font-semibold mb-3" style={{ color: 'var(--brand-primary)' }}>
          {MONTH_NAMES_PT[m]} {y}
        </div>
        <div className="grid grid-cols-7 mb-1">
          {DAY_NAMES_PT.map(d => (
            <div key={d} className="text-center text-[10px] py-1" style={{ color: 'var(--brand-subtle)' }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="h-7" />
            const d  = dateISO(y, m, day)
            const s  = isStart(d)
            const e  = isEnd(d)
            const ir = inRange(d)
            const td = d === todayStr
            return (
              <button key={i} type="button"
                onMouseEnter={() => selecting && setHover(d)}
                onMouseLeave={() => setHover(null)}
                onClick={() => handleDay(d)}
                className={`h-7 w-full text-xs transition-colors rounded ${s || e ? 'font-bold' : ir ? '' : td ? 'font-semibold' : ''}`}
                style={{
                  background: s || e ? 'var(--brand-primary)' : ir ? 'rgba(0,245,255,0.15)' : undefined,
                  color: s || e ? '#0A0A0B' : ir ? 'var(--brand-primary)' : td ? 'var(--brand-primary)' : 'var(--brand-text)',
                }}>
                {day}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const fmtDisplay = (iso: string) => {
    const [, mm, dd] = iso.split('-')
    return `${parseInt(dd)} ${MONTH_SHORT_PT[parseInt(mm) - 1]}`
  }
  const displayText = from && to ? `${fmtDisplay(from)} – ${fmtDisplay(to)}`
    : from ? `${fmtDisplay(from)} – ...`
    : 'Período'

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle}
        className="flex items-center gap-2 h-10 px-3 rounded-xl text-sm outline-none whitespace-nowrap"
        style={{
          background: 'var(--brand-bg)',
          border: `1px solid ${from || to ? 'var(--brand-primary)' : 'var(--brand-border)'}`,
          color: from || to ? 'var(--brand-text)' : 'var(--brand-subtle)',
        }}>
        <CalendarDays size={13} style={{ color: from || to ? 'var(--brand-primary)' : 'var(--brand-subtle)', flexShrink: 0 }} />
        <span className="text-sm">{displayText}</span>
        {(from || to) && (
          <span onClick={e => { e.stopPropagation(); onChange('', '') }}
            className="ml-1 cursor-pointer" style={{ color: 'var(--brand-subtle)' }}>
            <X size={10} />
          </span>
        )}
      </button>

      {pos && (
        <div ref={ref}
          className="rounded-xl shadow-2xl p-4"
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          <div className="flex items-center gap-4">
            <button type="button" onClick={prevMonth}
              className="p-1 shrink-0" style={{ color: 'var(--brand-subtle)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--brand-text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--brand-subtle)')}>
              <ChevronLeft size={14} />
            </button>
            <div className="flex gap-4">
              {renderMonth(leftYM.y, leftYM.m)}
              <div className="w-px" style={{ background: 'var(--brand-border)' }} />
              {renderMonth(rightYM.y, rightYM.m)}
            </div>
            <button type="button" onClick={nextMonth}
              className="p-1 shrink-0" style={{ color: 'var(--brand-subtle)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--brand-text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--brand-subtle)')}>
              <ChevronRight size={14} />
            </button>
          </div>
          {selecting && (
            <p className="text-[11px] text-center mt-3" style={{ color: 'var(--brand-subtle)' }}>
              Clique para selecionar a data final
            </p>
          )}
        </div>
      )}
    </>
  )
}

// ─── Extra Pct Modal ─────────────────────────────────────────────────────────

function ExtraPctModal({ ids, initialClientPct, initialConsultantPct, isBillableOnly, onClose, onSaved }: {
  ids: number[]
  initialClientPct?: number | null
  initialConsultantPct?: number | null
  isBillableOnly?: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const isBulk = ids.length > 1
  const [clientPct,     setClientPct]     = useState(initialClientPct != null ? String(initialClientPct) : '')
  const [consultantPct, setConsultantPct] = useState(initialConsultantPct != null ? String(initialConsultantPct) : '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      if (isBulk) {
        const body: Record<string, any> = { ids }
        if (clientPct !== '')     body.client_extra_pct     = clientPct ? parseFloat(clientPct) : null
        if (consultantPct !== '') body.consultant_extra_pct = consultantPct ? parseFloat(consultantPct) : null
        await api.put('/timesheets/bulk-extra-pct', body)
        toast.success(`% extras aplicados em ${ids.length} apontamentos`)
      } else {
        await api.put(`/timesheets/${ids[0]}`, {
          client_extra_pct:     clientPct !== '' ? (clientPct ? parseFloat(clientPct) : null) : null,
          consultant_extra_pct: consultantPct !== '' ? (consultantPct ? parseFloat(consultantPct) : null) : null,
        })
        toast.success('% extras atualizados')
      }
      onSaved()
      onClose()
    } catch {
      toast.error('Erro ao salvar % extras')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative rounded-2xl p-6 w-full max-w-sm mx-4" style={{ background: '#111113', border: '1px solid #3f3f46' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">
            {isBulk ? `% Extras — ${ids.length} apontamentos` : `% Extras — #${ids[0]}`}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
            <X size={14} className="text-zinc-400" />
          </button>
        </div>

        {isBulk && (
          <p className="text-[11px] text-zinc-500 mb-3">Campos vazios não serão alterados nos apontamentos selecionados.</p>
        )}

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-zinc-400">% Extra Cliente</Label>
            <div className="relative mt-1">
              <input
                type="number" min="0" max="999" step="0.01"
                value={clientPct}
                onChange={e => setClientPct(e.target.value)}
                placeholder={isBulk ? 'Não alterar' : '0'}
                className="w-full px-3 py-2 pr-7 rounded-xl text-sm outline-none bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-amber-400 pointer-events-none">%</span>
            </div>
          </div>
          <div>
            <Label className="text-xs text-zinc-400">% Extra Consultor</Label>
            <div className="relative mt-1">
              <input
                type="number" min="0" max="999" step="0.01"
                value={isBillableOnly ? '' : consultantPct}
                onChange={e => setConsultantPct(e.target.value)}
                placeholder={isBillableOnly ? 'N/A — Fat. Admin' : (isBulk ? 'Não alterar' : '0')}
                disabled={isBillableOnly}
                className="w-full px-3 py-2 pr-7 rounded-xl text-sm outline-none bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-green-400 pointer-events-none">%</span>
            </div>
            {isBillableOnly && (
              <p className="text-[10px] text-amber-500 mt-1">Apontamento Fat. Admin — % consultor não aplicável.</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={() => { setClientPct(''); setConsultantPct('') }}
            className="px-3 py-2 rounded-xl text-xs text-zinc-400 hover:bg-white/5 transition-colors border border-zinc-700">
            Limpar
          </button>
          <button onClick={onClose}
            className="px-3 py-2 rounded-xl text-xs text-zinc-400 hover:bg-white/5 transition-colors border border-zinc-700">
            Cancelar
          </button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 transition-all"
            style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Row actions ─────────────────────────────────────────────────────────────

interface RowMenuItem { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }

function RowActions({ id, onView, onDeleted, viewOnly, onExtraPct, onRelease, onReverseRelease }: {
  id: number; onView: () => void; onDeleted: () => void; viewOnly?: boolean; onExtraPct?: () => void; onRelease?: () => void; onReverseRelease?: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const confirmDelete = async () => {
    setDeleteConfirm(false)
    setDeleting(true)
    try {
      await api.delete(`/timesheets/${id}`)
      toast.success('Apontamento excluído')
      onDeleted()
    } catch {
      toast.error('Erro ao excluir')
    } finally { setDeleting(false) }
  }

  const items: RowMenuItem[] = viewOnly
    ? [{ label: 'Visualizar', icon: <Eye size={12} />, onClick: onView }]
    : [
        { label: 'Visualizar', icon: <Eye size={12} />, onClick: onView },
        { label: 'Editar',     icon: <Pencil size={12} />, onClick: () => { window.location.href = `/timesheets/${id}/edit` } },
        ...(onRelease ? [{ label: 'Liberar', icon: <CheckCircle size={12} />, onClick: onRelease }] : []),
        ...(onReverseRelease ? [{ label: 'Estornar liberação', icon: <X size={12} />, onClick: onReverseRelease }] : []),
        ...(onExtraPct ? [{ label: '% Extras', icon: <TrendingUp size={12} />, onClick: onExtraPct }] : []),
        { label: deleting ? 'Excluindo...' : 'Excluir', icon: <Trash2 size={12} />, onClick: () => setDeleteConfirm(true), danger: true },
      ]

  return (
    <>
      <RowMenu items={items} />
      <ConfirmDeleteModal
        open={deleteConfirm}
        message="Deseja excluir este apontamento? Esta ação não pode ser desfeita."
        onClose={() => setDeleteConfirm(false)}
        onConfirm={confirmDelete}
      />
    </>
  )
}

function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref    = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const open = pos !== null

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setPos(null)
    }
    document.addEventListener('mousedown', handler)
    window.addEventListener('scroll', () => setPos(null), { passive: true })
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('scroll', () => setPos(null))
    }
  }, [open])

  if (items.length === 0) return null

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (open) { setPos(null); return }
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const dropH = items.length * 36 + 8
    const up = r.bottom + dropH > window.innerHeight
    setPos({ left: r.left, top: up ? r.top - dropH : r.bottom + 4 })
  }

  return (
    <div ref={ref}>
      <button ref={btnRef} onClick={toggle}
        className={`p-1.5 rounded transition-colors ${open ? 'text-zinc-200 bg-zinc-700' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}>
        <MoreVertical size={14} />
      </button>
      {pos && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="min-w-[152px] bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl py-1 overflow-hidden">
          {items.map((item, i) => (
            <button key={i} onClick={() => { item.onClick(); setPos(null) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left ${
                item.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-zinc-300 hover:bg-zinc-700'
              }`}>
              {item.icon}{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── STATUS OPTIONS ──────────────────────────────────────────────────────────

const STATUS_PILLS = [
  { value: '',                     label: 'Todos' },
  { value: 'pending',              label: 'Pendente' },
  { value: 'approved',             label: 'Aprovado' },
  { value: 'rejected',             label: 'Rejeitado' },
  { value: 'adjustment_requested', label: 'Ajuste' },
  { value: 'conflicted',           label: 'Conflito' },
  { value: 'internal',             label: 'Ação Interna' },
  { value: 'released',             label: 'Liberado' },
]

const ORIGIN_OPTIONS = [
  { value: '',        label: 'Todas as origens' },
  { value: 'web',     label: 'Web (manual)' },
  { value: 'webhook', label: 'Auto (Movidesk)' },
]

// ─── SearchSelect ─────────────────────────────────────────────────────────────

interface SearchSelectOption { id: number | string; name: string }

function SearchSelect({ value, onChange, options, placeholder }: {
  value: string
  onChange: (v: string) => void
  options: SearchSelectOption[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find(o => String(o.id) === value)
  const filtered = options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  useEffect(() => {
    if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  const select = (id: string) => { onChange(id); setOpen(false) }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm outline-none text-left"
        style={{
          background: 'var(--brand-bg)',
          border: '1px solid var(--brand-border)',
          color: selected ? 'var(--brand-text)' : 'var(--brand-subtle)',
        }}
      >
        <span className="truncate text-sm">{selected ? selected.name : placeholder}</span>
        <ChevronDown size={13} style={{ color: 'var(--brand-subtle)', flexShrink: 0 }} />
      </button>
      {open && (
        <div
          className="absolute top-full mt-1 left-0 z-50 w-full min-w-56 rounded-xl shadow-2xl overflow-hidden"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'var(--brand-border)' }}>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--brand-subtle)' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-7 pr-3 py-1.5 rounded-lg text-xs outline-none"
                style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            <button type="button" onClick={() => select('')}
              className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors"
              style={{ color: !value ? 'var(--brand-primary)' : 'var(--brand-subtle)' }}>
              {placeholder}
            </button>
            {filtered.length === 0
              ? <p className="px-3 py-2 text-xs" style={{ color: 'var(--brand-subtle)' }}>Nenhum resultado</p>
              : filtered.map(o => (
                <button key={o.id} type="button" onClick={() => select(String(o.id))}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors"
                  style={{ color: String(o.id) === value ? 'var(--brand-primary)' : 'var(--brand-text)' }}>
                  {o.name}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Modal Overlay ────────────────────────────────────────────────────────────

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 z-10"><X size={16} /></button>
        {children}
      </div>
    </div>
  )
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function parseHHMM(s: string): number | null {
  if (!s) return null
  if (s.includes(':')) {
    const parts = s.split(':').map(Number)
    if (parts.length !== 2 || parts.some(isNaN)) return null
    return parts[0] * 60 + parts[1]
  }
  // suporta formato decimal: "3.5" ou "3,5" → 210 min
  const dec = parseFloat(s.replace(',', '.'))
  if (isNaN(dec) || dec < 0) return null
  return Math.round(dec * 60)
}

function toHHMM(mins: number): string {
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`
}

// ─── Page ────────────────────────────────────────────────────────────────────

function TimesheetsPageContent() {
  const { user } = useAuth()
  const isAdmin        = user?.type === 'admin'
  const isCoordenador  = user?.type === 'coordenador'
  const canActAsUser   = isAdmin || isCoordenador
  const isCliente      = user?.type === 'cliente'
  const searchParams = useSearchParams()
  const spProjectId  = searchParams.get('project_id') ?? ''
  const spCustomerId = searchParams.get('customer_id')
  const spStartDate  = searchParams.get('start_date') ?? ''
  const spEndDate    = searchParams.get('end_date') ?? ''
  const spTicket     = searchParams.get('ticket') ?? ''
  const spRequester  = searchParams.get('requester') ?? ''
  const spTicketSvc  = searchParams.get('ticket_service') ?? ''

  const { filters, set: setFilter, clear: clearPersistedFilters } = usePersistedFilters(
    'timesheets',
    user?.id,
    {
      projectId:        spProjectId,
      page:             1,
      status:           '',
      origins:          [] as string[],
      serviceTypeIds:   [] as string[],
      contractTypeIds:  [] as string[],
      customerIds:      spCustomerId ? [spCustomerId] : [] as string[],
      coordinatorIds:   [] as string[],
      executiveIds:     [] as string[],
      userIds:          [] as string[],
      startDate:       spStartDate,
      endDate:         spEndDate,
      refMonth:        null as number | null,
      refYear:         null as number | null,
      filterMode:      'month' as 'month' | 'period',
      ticket:          spTicket,
      requester:       spRequester,
      ticketService:   spTicketSvc,
      sortField:       'date' as SortField | null,
      sortDir:         'desc' as SortDir,
    },
  )

  const {
    projectId, page, status, origins, serviceTypeIds, contractTypeIds,
    customerIds, coordinatorIds, executiveIds, userIds, startDate, endDate, refMonth, refYear,
    filterMode, ticket, requester, ticketService, sortField, sortDir,
  } = filters

  const setProjectId      = (v: string)              => setFilter('projectId', v)
  const setPage           = (v: number | ((p: number) => number)) => {
    setFilter('page', typeof v === 'function' ? v(filters.page) : v)
  }
  const setStatus         = (v: string)              => setFilter('status', v)
  const setOrigins        = (v: string[])            => setFilter('origins', v)
  const setServiceTypeIds = (v: string[])            => setFilter('serviceTypeIds', v)
  const setContractTypeIds= (v: string[])            => setFilter('contractTypeIds', v)
  const setCustomerIds    = (v: string[])            => setFilter('customerIds', v)
  const setCoordinatorIds = (v: string[])            => setFilter('coordinatorIds', v)
  const setExecutiveIds   = (v: string[])            => setFilter('executiveIds', v)
  const setUserIds        = (v: string[])            => setFilter('userIds', v)
  const setStartDate      = (v: string)              => setFilter('startDate', v)
  const setEndDate        = (v: string)              => setFilter('endDate', v)
  const setRefMonth       = (v: number | null)       => setFilter('refMonth', v)
  const setRefYear        = (v: number | null)       => setFilter('refYear', v)
  const setFilterMode     = (v: 'month' | 'period')  => setFilter('filterMode', v)
  const setTicket         = (v: string)              => setFilter('ticket', v)
  const setRequester      = (v: string)              => setFilter('requester', v)
  const setTicketService  = (v: string)              => setFilter('ticketService', v)
  const [exporting, setExporting]     = useState(false)
  const [customers, setCustomers]       = useState<SelectOption[]>([])
  const [coordinators, setCoordinators] = useState<SelectOption[]>([])
  const [executives, setExecutives]     = useState<SelectOption[]>([])
  const [consultants, setConsultants]   = useState<SelectOption[]>([])
  const [viewItem, setViewItem]       = useState<Timesheet | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [extraPctModalData, setExtraPctModalData] = useState<{ ids: number[]; ts?: Timesheet } | null>(null)
  const [reprocessing, setReprocessing] = useState(false)
  const [reprocessResult, setReprocessResult] = useState<string | null>(null)

  const handleReprocessMovidesk = async (ids?: number[]) => {
    setReprocessing(true)
    setReprocessResult(null)
    try {
      const body = ids && ids.length > 0 ? { ids } : {}
      const res = await api.post<{ message: string; updated: number; skipped: number; errors: number }>('/timesheets/reprocess-movidesk', body)
      setReprocessResult(res.message)
      if (res.updated > 0) refetch()
    } catch {
      setReprocessResult('Erro ao reprocessar. Tente novamente.')
    } finally {
      setReprocessing(false)
      setTimeout(() => setReprocessResult(null), 6000)
    }
  }

  // ── New timesheet modal ──────────────────────────────────────────────────
  const [newModalOpen, setNewModalOpen] = useState(false)

  const openView = useCallback(async (ts: Timesheet) => {
    setViewItem(ts)
    setViewLoading(true)
    try {
      const raw = await api.get<{ success: boolean; data: Timesheet } | Timesheet>(`/timesheets/${ts.id}`)
      const full = (raw as any)?.data ?? raw as Timesheet
      setViewItem(full)
    } catch { /* keep list data */ }
    finally { setViewLoading(false) }
  }, [])

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setFilter('sortDir', sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setFilter('sortDir', 'asc')
      setFilter('sortField', field)
    }
    setFilter('page', 1)
  }, [sortField, sortDir, setFilter])

  const { data: serviceTypes }  = useApiQuery<{ items: SelectOption[] } | SelectOption[]>('/service-types')
  const { data: contractTypes } = useApiQuery<{ items: SelectOption[] } | SelectOption[]>('/contract-types')

  const isSustentacaoCoordenador = isCoordenador && (user as any)?.coordinator_type === 'sustentacao'

  const allServiceTypeList: SelectOption[] = Array.isArray(serviceTypes)
    ? serviceTypes : (serviceTypes as any)?.items ?? []
  const serviceTypeList: SelectOption[] = isSustentacaoCoordenador
    ? allServiceTypeList.filter(s => ['sustentacao', 'cloud'].includes((s as any).code ?? ''))
    : allServiceTypeList
  const contractTypeList: SelectOption[] = Array.isArray(contractTypes)
    ? contractTypes : (contractTypes as any)?.items ?? []

  interface ClienteProject { id: number; name: string; contract_type_id?: number; contract_type_display?: string }
  const [clienteProjects, setClienteProjects] = useState<ClienteProject[]>([])

  const clienteContractTypes = useMemo(() => {
    const seen = new Set<number>()
    const result: { id: number; name: string }[] = []
    for (const p of clienteProjects) {
      if (p.contract_type_id && !seen.has(p.contract_type_id)) {
        seen.add(p.contract_type_id)
        result.push({ id: p.contract_type_id, name: p.contract_type_display ?? String(p.contract_type_id) })
      }
    }
    return result
  }, [clienteProjects])

  // Carrega clientes e executivos
  useEffect(() => {
    const items = (r: any) => Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
    if (isCliente) {
      // Para cliente: carrega apenas os projetos do seu customer_id
      if (user?.customer_id) {
        api.get<any>(`/projects?pageSize=200&customer_id=${user.customer_id}&status=active`)
          .then(r => setClienteProjects(items(r))).catch(() => {})
      }
    } else {
      const customerEndpoint = isAdmin
        ? '/customers?pageSize=500'
        : '/customers/user-linked?pageSize=500'
      Promise.all([
        api.get<any>(customerEndpoint),
        api.get<any>('/executives?pageSize=100'),
        api.get<any>('/users?pageSize=200&exclude_type=cliente'),
        api.get<any>('/users?pageSize=100&type=coordenador'),
        api.get<any>('/users?pageSize=100&type=admin'),
      ]).then(([c, ex, us, coords, admins]) => {
        setCustomers(items(c))
        setExecutives(items(ex))
        setConsultants(items(us))
        const coordList = items(coords)
        const adminList = items(admins)
        setCoordinators([...coordList, ...adminList.filter((a: any) => !coordList.some((c: any) => c.id === a.id))])
      }).catch(() => {})
    }
  }, [isCliente, isAdmin, user?.customer_id])

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), per_page: '100' })
    if (status) p.set('status', status)
    origins.forEach(v => p.append('origin[]', v))
    serviceTypeIds.forEach(v => p.append('service_type_id[]', v))
    contractTypeIds.forEach(v => p.append('contract_type_id[]', v))
    if (isCliente && user?.customer_id) p.set('customer_id', String(user.customer_id))
    else customerIds.forEach(v => p.append('customer_id[]', v))
    coordinatorIds.forEach(v => p.append('coordinator_id[]', v))
    executiveIds.forEach(v => p.append('executive_id[]', v))
    userIds.forEach(v => p.append('user_id[]', v))
    if (startDate)     p.set('start_date', startDate)
    if (endDate)       p.set('end_date', endDate)
    if (ticket)        p.set('ticket', ticket)
    if (requester)     p.set('requester', requester)
    if (ticketService) p.set('ticket_service', ticketService)
    if (projectId)     p.set('project_id', projectId)
    if (sortField)     p.set('order', sortDir === 'desc' ? `-${sortField}` : sortField)
    return p.toString()
  }, [page, status, origins, serviceTypeIds, contractTypeIds, customerIds, coordinatorIds, executiveIds, userIds, projectId, startDate, endDate, ticket, requester, ticketService, sortField, sortDir, isCliente, user?.customer_id])

  const { data, loading, error, refetch } = useApiQuery<PaginatedResponse<Timesheet>>(
    `/timesheets?${params}`, [params]
  )

  const resetPage = useCallback(() => setPage(1), [])
  const hasFilters = !!(status || origins.length || serviceTypeIds.length || contractTypeIds.length || customerIds.length || coordinatorIds.length || executiveIds.length || userIds.length || projectId || startDate || endDate || ticket || requester || ticketService)

  const clearFilters = useCallback(() => {
    clearPersistedFilters()
  }, [clearPersistedFilters])

  const handleExport = async () => {
    setExporting(true)
    try {
      const p = new URLSearchParams()
      if (status) p.set('status', status)
      serviceTypeIds.forEach(v => p.append('service_type_id[]', v))
      contractTypeIds.forEach(v => p.append('contract_type_id[]', v))
      if (isCliente && user?.customer_id) p.set('customer_id', String(user.customer_id))
      else customerIds.forEach(v => p.append('customer_id[]', v))
      userIds.forEach(v => p.append('user_id[]', v))
      if (projectId)     p.set('project_id', projectId)
      if (startDate)     p.set('start_date', startDate)
      if (endDate)       p.set('end_date', endDate)
      if (ticket)        p.set('ticket', ticket)
      if (requester)     p.set('requester', requester)
      if (ticketService) p.set('ticket_service', ticketService)
      const token = localStorage.getItem('minutor_token')
      const res = await fetch(`/api/v1/timesheets/export?${p}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `apontamentos_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { alert('Erro ao exportar. Tente novamente.') }
    finally { setExporting(false) }
  }

  const handleRelease = async (id: number) => {
    try {
      await api.post(`/timesheets/${id}/release`, {})
      toast.success('Ação interna liberada!')
      refetch()
    } catch {
      toast.error('Erro ao liberar ação interna')
    }
  }

  const handleReverseRelease = async (id: number) => {
    try {
      await api.post(`/timesheets/${id}/reverse-release`, {})
      toast.success('Liberação estornada!')
      refetch()
    } catch {
      toast.error('Erro ao estornar liberação')
    }
  }

  return (
    <AppLayout title="Apontamentos">
      <div className="max-w-7xl mx-auto">
        <PageHeader
          icon={Clock}
          title="Apontamentos"
          subtitle="Registro de horas por projeto e colaborador"
          actions={
            <>
              <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => refetch()}>Atualizar</Button>
              <Button variant="secondary" size="sm" icon={FileSpreadsheet} onClick={handleExport} loading={exporting}>
                {exporting ? 'Exportando...' : 'Excel'}
              </Button>
              {(isAdmin || isCoordenador) && (
                <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => handleReprocessMovidesk()} loading={reprocessing}>
                  {reprocessing ? 'Reprocessando...' : 'Reprocessar'}
                </Button>
              )}
              {!isCliente && (
                <Button variant="primary" size="sm" icon={Plus} onClick={() => setNewModalOpen(true)}>Novo</Button>
              )}
            </>
          }
        />

        {/* Aviso para cliente */}
        {isCliente && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-4 text-xs"
            style={{ background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.18)', color: 'var(--brand-muted)' }}>
            <span style={{ color: 'var(--brand-primary)', marginTop: 1 }}>ℹ</span>
            <span>O status de aprovação indica apenas uma validação interna da equipe, sem impacto para o cliente.</span>
          </div>
        )}

        {/* Filters */}
        <div
          className="p-4 rounded-2xl mb-4 space-y-3"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
        >
          {/* Linha 1: selects */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {isCliente ? (
              // Filtros para cliente: apenas Projeto
              <>
                <SearchSelect
                  value={projectId}
                  onChange={v => { setProjectId(v); resetPage() }}
                  options={clienteProjects}
                  placeholder="Todos os projetos"
                />
              </>
            ) : (
              // Filtros completos para admin/coordenador/consultor
              <>
                <MultiSelect
                  value={userIds}
                  onChange={v => { setUserIds(v); resetPage() }}
                  options={consultants}
                  placeholder="Todos os colaboradores"
                />
                <MultiSelect
                  value={customerIds}
                  onChange={v => { setCustomerIds(v); resetPage() }}
                  options={customers}
                  placeholder="Todos os clientes"
                />
                {coordinators.length > 0 && (
                  <MultiSelect
                    value={coordinatorIds}
                    onChange={v => { setCoordinatorIds(v); resetPage() }}
                    options={coordinators}
                    placeholder="Todos os coordenadores"
                  />
                )}
                {executives.length > 0 && (
                  <MultiSelect
                    value={executiveIds}
                    onChange={v => { setExecutiveIds(v); resetPage() }}
                    options={executives}
                    placeholder="Todos os executivos"
                  />
                )}
                <MultiSelect
                  value={serviceTypeIds}
                  onChange={v => { setServiceTypeIds(v); resetPage() }}
                  options={serviceTypeList}
                  placeholder="Tipo de serviço"
                />
                <MultiSelect
                  value={contractTypeIds}
                  onChange={v => { setContractTypeIds(v); resetPage() }}
                  options={contractTypeList}
                  placeholder="Tipo de contrato"
                />
                <MultiSelect
                  value={origins}
                  onChange={v => { setOrigins(v); resetPage() }}
                  options={ORIGIN_OPTIONS.filter(o => o.value).map(o => ({ id: o.value, name: o.label }))}
                  placeholder="Todas as origens"
                />
                <TextInput
                  placeholder="Nº ticket..."
                  value={ticket}
                  onChange={e => { setTicket(e.target.value); resetPage() }}
                />
              </>
            )}
          </div>

          {/* Linha 2: datas + limpar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
              {(['month', 'period'] as const).map((mode) => (
                <button key={mode} onClick={() => setFilterMode(mode)}
                  className="px-3 py-1.5 font-medium transition-colors"
                  style={{ background: filterMode === mode ? 'rgba(0,245,255,0.12)' : 'transparent', color: filterMode === mode ? '#00F5FF' : '#71717a' }}>
                  {mode === 'month' ? 'Mês/Ano' : 'Período'}
                </button>
              ))}
            </div>
            {filterMode === 'month' ? (
              <MonthYearPicker
                month={refMonth}
                year={refYear}
                onChange={(m, y) => {
                  if (m === 0) { setRefMonth(null); setRefYear(null); setStartDate(''); setEndDate('') }
                  else {
                    const mm = String(m).padStart(2, '0')
                    const last = new Date(y, m, 0).getDate()
                    setRefMonth(m); setRefYear(y)
                    setStartDate(`${y}-${mm}-01`); setEndDate(`${y}-${mm}-${String(last).padStart(2, '0')}`)
                  }
                  resetPage()
                }}
              />
            ) : (
              <DateRangePicker
                from={startDate}
                to={endDate}
                onChange={(f, t) => { setStartDate(f); setEndDate(t); setRefMonth(null); setRefYear(null); resetPage() }}
              />
            )}
            {projectId && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
                style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.2)', color: 'var(--brand-primary)' }}>
                Projeto #{projectId}
                <button onClick={() => { setProjectId(''); resetPage() }} className="ml-1 hover:opacity-70 transition-opacity">
                  <X size={10} />
                </button>
              </div>
            )}
            {requester && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
                style={{ background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.25)', color: '#8B5CF6' }}>
                Solicitante: {requester}
                <button onClick={() => { setRequester(''); resetPage() }} className="ml-1 hover:opacity-70 transition-opacity">
                  <X size={10} />
                </button>
              </div>
            )}
            {ticketService && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
                style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.25)', color: '#10B981' }}>
                Módulo: {ticketService}
                <button onClick={() => { setTicketService(''); resetPage() }} className="ml-1 hover:opacity-70 transition-opacity">
                  <X size={10} />
                </button>
              </div>
            )}
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2.5 rounded-xl text-xs transition-all hover:bg-white/5"
                style={{ color: 'var(--brand-danger)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                <X size={11} /> Limpar
              </button>
            )}
          </div>
        </div>

        {/* Pills de tipo de contrato — apenas para cliente */}
        {isCliente && clienteContractTypes.length > 0 && (
          <div className="flex items-center gap-1 p-1 rounded-xl w-fit mb-4"
            style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
            <button
              onClick={() => { setContractTypeIds([]); resetPage() }}
              className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={contractTypeIds.length === 0
                ? { background: 'var(--brand-primary)', color: '#0A0A0B' }
                : { color: 'var(--brand-muted)', background: 'transparent' }
              }>
              Total Geral
            </button>
            {clienteContractTypes.map(ct => (
              <button key={ct.id}
                onClick={() => { setContractTypeIds([String(ct.id)]); resetPage() }}
                className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={contractTypeIds.includes(String(ct.id))
                  ? { background: 'var(--brand-primary)', color: '#0A0A0B' }
                  : { color: 'var(--brand-muted)', background: 'transparent' }
                }>
                {ct.name}
              </button>
            ))}
          </div>
        )}

        {/* Status pills — oculto para clientes */}
        {!isCliente && <div className="flex items-center gap-1 p-1 rounded-xl w-fit mb-6" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          {STATUS_PILLS.map(s => (
            <button
              key={s.value}
              onClick={() => { setStatus(s.value); setPage(1) }}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={status === s.value

                ? { background: 'var(--brand-primary)', color: '#0A0A0B' }
                : { color: 'var(--brand-muted)', background: 'transparent' }
              }
            >
              {s.label}
            </button>
          ))}
        </div>}

        {/* Total horas */}
        {data && data.totalEffortHours && (() => {
          const fatAdminMin  = data.totalBillableOnlyMinutes ?? 0
          const allMin       = data.totalEffortMinutes ?? 0
          const baseMin      = allMin - fatAdminMin
          const extraMin     = data.totalConsultantExtraMinutes ?? 0
          const totalMin     = baseMin + extraMin
          const canSeeFatAdmin = isAdmin || isCoordenador
          const baseHours    = formatMinutes(baseMin)

          return (
            <div className="mb-4 flex items-center gap-1 flex-wrap">
              {extraMin > 0 ? (
                <>
                  <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Apontadas:</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--brand-primary)' }}>{baseHours}</span>
                  <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>+ % extra:</span>
                  <span className="text-sm font-bold" style={{ color: '#22C55E' }}>+{formatMinutes(extraMin)}</span>
                  <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>=</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--brand-primary)' }}>Total efetivo: {formatMinutes(totalMin)}</span>
                </>
              ) : (
                <>
                  <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Total de horas:</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--brand-primary)' }}>{baseHours}</span>
                </>
              )}
              {canSeeFatAdmin && fatAdminMin > 0 && (
                <>
                  <span className="text-xs mx-1" style={{ color: 'var(--brand-subtle)' }}>|</span>
                  <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Fat. Admin:</span>
                  <span className="text-sm font-semibold" style={{ color: '#F59E0B' }}>{formatMinutes(fatAdminMin)}</span>
                </>
              )}
            </div>
          )
        })()}

        {/* Table */}
        {loading ? (
          <SkeletonTable rows={8} cols={12} />
        ) : error ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--brand-danger)' }}>{error}</div>
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th className="w-10" />
                {(isAdmin || isCoordenador) && (
                  <Th className="w-8">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 accent-cyan-400 cursor-pointer"
                      checked={!!(data?.items.length && data.items.every(ts => selectedIds.has(ts.id)))}
                      onChange={e => {
                        if (e.target.checked) setSelectedIds(new Set(data?.items.map(ts => ts.id) ?? []))
                        else setSelectedIds(new Set())
                      }}
                    />
                  </Th>
                )}
                <Th>Status</Th>
                {(isAdmin || isCoordenador) && (
                  <Th sortable active={sortField === 'user.name'} dir={sortDir} onClick={() => handleSort('user.name')}>Colaborador</Th>
                )}
                <Th sortable active={sortField === 'date'}          dir={sortDir} onClick={() => handleSort('date')}>Data</Th>
                <Th className="hidden md:table-cell">Início</Th>
                <Th className="hidden md:table-cell">Fim</Th>
                <Th className="hidden lg:table-cell">Ticket #</Th>
                <Th right sortable active={sortField === 'effort_hours'} dir={sortDir} onClick={() => handleSort('effort_hours')}>Tempo</Th>
                <Th className="hidden sm:table-cell">Origem</Th>
                {!(isAdmin || isCoordenador) && (
                  <Th sortable active={sortField === 'user.name'} dir={sortDir} onClick={() => handleSort('user.name')}>Colaborador</Th>
                )}
                {(isAdmin || isCoordenador) && (
                  <Th sortable active={sortField === 'customer.name'} dir={sortDir} onClick={() => handleSort('customer.name')}>Cliente</Th>
                )}
                <Th sortable active={sortField === 'project.name'}  dir={sortDir} onClick={() => handleSort('project.name')}>Projeto</Th>
                <Th className="hidden lg:table-cell">Título</Th>
                <Th className="hidden xl:table-cell">Descrição</Th>
                <Th className="hidden xl:table-cell">Solicitante</Th>
                <Th className="hidden xl:table-cell">Tipo de Serviço</Th>
                <Th className="hidden xl:table-cell">Contrato</Th>
              </tr>
            </Thead>
            <Tbody>
              {data?.items.length === 0 ? (
                <tr>
                  <td colSpan={14}>
                    <EmptyState icon={Clock} title="Nenhum apontamento encontrado" description="Tente ajustar os filtros ou criar um novo apontamento." />
                  </td>
                </tr>
              ) : data?.items.map(ts => (
                <Tr key={ts.id} baseBackground={ts.is_internal_action ? 'rgba(100,116,139,0.07)' : ts.is_billable_only ? 'rgba(245,158,11,0.06)' : undefined}>
                  <Td className="w-10">
                    <RowActions
                      id={ts.id}
                      onView={() => openView(ts)}
                      onDeleted={refetch}
                      viewOnly={isCliente}
                      onExtraPct={(isAdmin || isCoordenador) ? () => setExtraPctModalData({ ids: [ts.id], ts }) : undefined}
                      onRelease={(isAdmin || isCoordenador) && ts.is_internal_action && ts.status === 'internal' ? () => handleRelease(ts.id) : undefined}
                      onReverseRelease={(isAdmin || isCoordenador) && ts.is_internal_action && ts.status === 'released' ? () => handleReverseRelease(ts.id) : undefined}
                    />
                  </Td>
                  {(isAdmin || isCoordenador) && (
                    <Td className="w-8">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 accent-cyan-400 cursor-pointer"
                        checked={selectedIds.has(ts.id)}
                        onChange={e => {
                          setSelectedIds(prev => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(ts.id)
                            else next.delete(ts.id)
                            return next
                          })
                        }}
                      />
                    </Td>
                  )}
                  <Td>
                    <span className="inline-flex items-center gap-1 flex-wrap">
                      {ts.is_internal_action
                        ? (
                          <>
                            <Badge variant="internal">Ação Interna</Badge>
                            {ts.status === 'released' && <Badge variant="approved">Liberado</Badge>}
                          </>
                        )
                        : <Badge
                            variant={ts.status}
                            title={(ts.status === 'rejected' || ts.status === 'adjustment_requested') && ts.rejection_reason ? ts.rejection_reason : undefined}
                            className={(ts.status === 'rejected' || ts.status === 'adjustment_requested') && ts.rejection_reason ? 'cursor-help' : undefined}
                          >{ts.status_display ?? ts.status}</Badge>
                      }
                      {ts.is_paid && <Badge variant="success">Pago</Badge>}
                    </span>
                  </Td>
                  {(isAdmin || isCoordenador) && (
                    <Td muted>{ts.user?.name ?? '—'}</Td>
                  )}
                  <Td className="whitespace-nowrap font-medium">{formatDate(ts.date)}</Td>
                  <Td muted className="hidden md:table-cell font-mono tabular-nums">{ts.start_time ?? '—'}</Td>
                  <Td muted className="hidden md:table-cell font-mono tabular-nums">{ts.end_time ?? '—'}</Td>
                  <Td muted className="hidden lg:table-cell font-mono">
                    {ts.ticket
                      ? <a
                          href={`https://erpserv.movidesk.com/Ticket/Edit/${ts.ticket}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="hover:underline cursor-pointer"
                          style={{ color: 'var(--brand-primary)', pointerEvents: 'auto' }}
                        >#{ts.ticket}</a>
                      : '—'}
                  </Td>
                  <Td right mono className="font-semibold" style={{ color: 'var(--brand-primary)' }}>
                    {!isCliente && ts.consultant_extra_pct ? (() => {
                      const extraMin = Math.round(ts.effort_minutes * (Number(ts.consultant_extra_pct) / 100))
                      const totalMin = ts.effort_minutes + extraMin
                      return (
                        <div className="flex flex-col items-end gap-0.5">
                          <span>{formatMinutes(ts.effort_minutes)}</span>
                          <span className="text-[10px] font-normal" style={{ color: '#22C55E' }}>
                            +{Number(ts.consultant_extra_pct)}% = {formatMinutes(totalMin)}
                          </span>
                        </div>
                      )
                    })() : formatMinutes(ts.effort_minutes)}
                  </Td>
                  <Td className="hidden sm:table-cell">
                    <OriginBadge
                      origin={ts.origin}
                      isBillableOnly={ts.is_billable_only}
                      isInternalAction={ts.is_internal_action}
                      isReleased={ts.status === 'released'}
                      canSeePct={isAdmin || isCoordenador}
                      clientExtraPct={ts.client_extra_pct}
                      consultantExtraPct={ts.consultant_extra_pct}
                    />
                  </Td>
                  {!(isAdmin || isCoordenador) && (
                    <Td muted>{ts.user?.name ?? '—'}</Td>
                  )}
                  {(isAdmin || isCoordenador) && (
                    <Td muted>{ts.customer?.name ?? ts.project?.customer?.name ?? '—'}</Td>
                  )}
                  <Td className="max-w-[160px]">
                    <button
                      onClick={() => openView(ts)}
                      className="truncate block text-left transition-colors hover:underline w-full"
                      style={{ color: 'var(--brand-text)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--brand-primary)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--brand-text)')}
                    >
                      {ts.project?.name ?? `Projeto #${ts.project_id}`}
                    </button>
                  </Td>
                  <Td muted className="hidden lg:table-cell truncate max-w-[160px]">
                    {ts.ticket_subject ?? '—'}
                  </Td>
                  <Td muted className="hidden xl:table-cell max-w-[180px]">
                    {ts.observation ? (
                      <div className="relative group w-full">
                        <span className="block truncate cursor-default" style={{ color: 'var(--brand-muted)' }}>
                          {ts.observation.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
                        </span>
                        <div className="pointer-events-none absolute z-50 left-0 top-full mt-1 hidden group-hover:block w-72 rounded-xl p-3 text-xs leading-relaxed shadow-2xl"
                          style={{ background: '#111113', border: '1px solid rgba(255,255,255,0.12)', color: '#E5E7EB' }}>
                          {ts.observation.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
                        </div>
                      </div>
                    ) : <span>—</span>}
                  </Td>
                  <Td muted className="hidden xl:table-cell truncate max-w-[140px]">
                    {ts.ticket_solicitante?.name ?? '—'}
                  </Td>
                  <Td muted className="hidden xl:table-cell truncate max-w-[140px]">
                    {(ts.project as any)?.service_type?.name ?? '—'}
                  </Td>
                  <Td muted className="hidden xl:table-cell truncate max-w-[140px]">
                    {ts.project?.contract_type_display ?? '—'}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}

        {/* Pagination */}
        {!loading && (data?.items.length ?? 0) > 0 && (
          <Pagination
            page={page}
            hasNext={data?.hasNext ?? false}
            onPrev={() => setPage(p => Math.max(1, p - 1))}
            onNext={() => setPage(p => p + 1)}
          />
        )}
      </div>

      {/* Modal: Visualizar Apontamento */}
      {viewItem && (
        <TimesheetViewModal
          ts={viewItem}
          onClose={() => setViewItem(null)}
          onEdit={() => { window.location.href = `/timesheets/${viewItem.id}/edit` }}
          currentUser={user}
        />
      )}
      {viewLoading && viewItem && (
        <div className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)', color: 'var(--brand-subtle)' }}>
          <Clock size={12} className="animate-spin" /> Carregando detalhes...
        </div>
      )}

      <TimesheetFormModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onSaved={refetch}
        currentUser={user}
      />

      {/* Reprocess result toast */}
      {reprocessResult && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm px-4 py-3 rounded-xl text-xs shadow-2xl"
          style={{ background: '#18181B', border: '1px solid #3f3f46', color: '#e4e4e7' }}>
          {reprocessResult}
        </div>
      )}

      {/* Bulk action bar */}
      {(isAdmin || isCoordenador) && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl"
          style={{ background: '#18181B', border: '1px solid #3f3f46' }}>
          <span className="text-xs text-zinc-300">
            {selectedIds.size} apontamento{selectedIds.size > 1 ? 's' : ''} selecionado{selectedIds.size > 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setExtraPctModalData({ ids: Array.from(selectedIds) })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
            style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}
          >
            <TrendingUp size={11} /> % Extras
          </button>
          <button
            onClick={() => handleReprocessMovidesk(Array.from(selectedIds))}
            disabled={reprocessing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
            style={{ background: '#3f3f46', color: '#e4e4e7' }}
          >
            <RefreshCw size={11} className={reprocessing ? 'animate-spin' : ''} /> Reprocessar Movidesk
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={14} className="text-zinc-400" />
          </button>
        </div>
      )}

      {/* ExtraPct Modal */}
      {extraPctModalData && (
        <ExtraPctModal
          ids={extraPctModalData.ids}
          initialClientPct={extraPctModalData.ts?.client_extra_pct}
          initialConsultantPct={extraPctModalData.ts?.consultant_extra_pct}
          isBillableOnly={extraPctModalData.ids.length === 1 ? extraPctModalData.ts?.is_billable_only : false}
          onClose={() => setExtraPctModalData(null)}
          onSaved={() => { refetch(); setSelectedIds(new Set()) }}
        />
      )}
    </AppLayout>
  )
}

export default function TimesheetsPage() {
  return (
    <Suspense>
      <TimesheetsPageContent />
    </Suspense>
  )
}
