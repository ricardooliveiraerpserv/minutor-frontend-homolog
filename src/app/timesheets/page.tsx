'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useApiQuery } from '@/hooks/use-query'
import { Timesheet, PaginatedResponse } from '@/types'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import {
  Clock, RefreshCw, FileSpreadsheet, Plus, Pencil,
  Trash2, X, Globe, Webhook, MoreVertical, Eye, Search, ChevronDown,
  Paperclip, Calendar, Building2, FolderOpen, Ticket, Hash,
  FileText, CheckCircle, User, CalendarDays, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { ConfirmDeleteModal } from '@/components/ui/confirm-delete-modal'
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

function OriginBadge({ origin }: { origin?: string }) {
  if (origin === 'webhook') return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}
    >
      <Webhook size={9} /> Auto
    </span>
  )
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF' }}
    >
      <Globe size={9} /> Web
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

// ─── Timesheet view modal ─────────────────────────────────────────────────────

function AttachmentLink({ url }: { url: string }) {
  const [loading, setLoading] = useState(false)
  const open = async () => {
    setLoading(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('minutor_token') : null
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok) { alert('Anexo não encontrado no servidor'); return }
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      window.open(blobUrl, '_blank')
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
    } catch { alert('Erro ao abrir anexo') }
    finally { setLoading(false) }
  }
  return (
    <button type="button" onClick={open} disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
      style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)', border: '1px solid rgba(0,245,255,0.15)' }}>
      <Paperclip size={11} />
      {loading ? 'Abrindo...' : 'Visualizar Anexo'}
    </button>
  )
}

function InfoRowModal({ icon: Icon, label, value, children, last }: {
  icon: React.ElementType; label: string; value?: string | null
  children?: React.ReactNode; last?: boolean
}) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 ${!last ? 'border-b' : ''}`}
      style={!last ? { borderColor: 'var(--brand-border)' } : undefined}>
      <span className="mt-0.5 shrink-0 p-1.5 rounded-lg"
        style={{ background: 'rgba(0,245,255,0.06)', color: 'var(--brand-primary)' }}>
        <Icon size={11} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--brand-subtle)' }}>{label}</p>
        {children ?? <p className="text-xs font-medium" style={{ color: 'var(--brand-text)' }}>{value ?? '—'}</p>}
      </div>
    </div>
  )
}

function OriginChip({ origin }: { origin?: string }) {
  if (origin === 'webhook') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}>
      <Webhook size={11} /> Auto (Movidesk)
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)' }}>
      <Globe size={11} /> Web (manual)
    </span>
  )
}

function TimesheetViewModal({ ts, onClose, onEdit }: { ts: Timesheet; onClose: () => void; onEdit: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-md rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <button onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          style={{ color: 'var(--brand-subtle)' }}>
          <X size={14} />
        </button>

        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-start gap-3">
          <div className="p-2.5 rounded-xl shrink-0"
            style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)' }}>
            <Clock size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>Detalhe do Apontamento</h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--brand-subtle)' }}>
              #{ts.id} · {formatDate(ts.date)}
            </p>
          </div>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Status + origem */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={ts.status}>{ts.status_display ?? ts.status}</Badge>
            <OriginChip origin={ts.origin} />
            {ts.rejection_reason && (
              <span className="text-xs" style={{ color: 'var(--brand-danger)' }}>{ts.rejection_reason}</span>
            )}
          </div>

          {/* Horas hero */}
          <div className="rounded-xl px-4 py-4"
            style={{ background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.15)' }}>
            <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--brand-subtle)' }}>Período</p>
            <p className="text-xl font-bold" style={{ color: 'var(--brand-primary)' }}>
              {ts.start_time} – {ts.end_time}
              <span className="ml-2 text-sm font-medium" style={{ color: 'var(--brand-muted)' }}>({ts.effort_hours})</span>
            </p>
          </div>

          {/* Info card */}
          <div className="rounded-xl overflow-hidden"
            style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
            <InfoRowModal icon={Calendar} label="Data" value={formatDate(ts.date)} />
            <InfoRowModal icon={User} label="Colaborador" value={ts.user?.name} />
            <InfoRowModal icon={Building2} label="Cliente" value={ts.customer?.name ?? ts.project?.customer?.name} />
            <InfoRowModal icon={FolderOpen} label="Projeto">
              <p className="text-xs font-medium" style={{ color: 'var(--brand-text)' }}>
                {ts.project?.name ?? '—'}
                {ts.project?.contract_type_display && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-subtle)' }}>
                    {ts.project.contract_type_display}
                  </span>
                )}
              </p>
            </InfoRowModal>
            {ts.ticket && (
              <InfoRowModal icon={Ticket} label="Ticket">
                <p className="text-xs font-medium" style={{ color: 'var(--brand-text)' }}>
                  <span style={{ color: 'var(--brand-primary)' }}>#{ts.ticket}</span>
                  {ts.ticket_subject && (
                    <span className="ml-2" style={{ color: 'var(--brand-muted)' }}>— {ts.ticket_subject}</span>
                  )}
                </p>
              </InfoRowModal>
            )}
            {ts.movidesk_appointment_id && (
              <InfoRowModal icon={Hash} label="ID Movidesk" value={String(ts.movidesk_appointment_id)} />
            )}
            <InfoRowModal icon={Paperclip} label="Anexo" last>
              {(ts as any).attachment_url
                ? <AttachmentLink url={(ts as any).attachment_url} />
                : <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Sem anexo</span>
              }
            </InfoRowModal>
          </div>

          {/* Observação */}
          {ts.observation && (
            <div className="rounded-xl overflow-hidden"
              style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
              <div className="flex items-center gap-2 px-4 py-2.5"
                style={{ borderBottom: '1px solid var(--brand-border)' }}>
                <FileText size={11} style={{ color: 'var(--brand-primary)' }} />
                <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--brand-subtle)' }}>Observação</span>
              </div>
              <div className="px-4 py-3 text-xs leading-relaxed [&_img]:max-w-full [&_img]:rounded-lg"
                style={{ color: 'var(--brand-muted)' }}
                dangerouslySetInnerHTML={{ __html: ts.observation }} />
            </div>
          )}

          {/* Revisão */}
          {ts.reviewedBy && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs"
              style={{ background: 'rgba(0,245,255,0.04)', border: '1px solid var(--brand-border)', color: 'var(--brand-subtle)' }}>
              <CheckCircle size={13} style={{ color: 'var(--brand-primary)' }} />
              Revisado por <strong style={{ color: 'var(--brand-muted)' }}>{ts.reviewedBy.name}</strong>
              {ts.reviewed_at && ` em ${formatDate(ts.reviewed_at.slice(0, 10))}`}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={onEdit}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors hover:bg-white/5"
              style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>
              <Pencil size={11} /> Editar
            </button>
            <button onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors hover:bg-white/5"
              style={{ color: 'var(--brand-subtle)', border: '1px solid var(--brand-border)' }}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Row actions ─────────────────────────────────────────────────────────────

interface RowMenuItem { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }

function RowActions({ id, onView, onDeleted }: { id: number; onView: () => void; onDeleted: () => void }) {
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

  const items: RowMenuItem[] = [
    { label: 'Visualizar', icon: <Eye size={12} />, onClick: onView },
    { label: 'Editar',     icon: <Pencil size={12} />, onClick: () => { window.location.href = `/timesheets/${id}/edit` } },
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

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TimesheetsPage() {
  const [page, setPage]               = useState(1)
  const [status, setStatus]           = useState('')
  const [origin, setOrigin]           = useState('')
  const [serviceTypeId, setServiceTypeId] = useState('')
  const [contractTypeId, setContractTypeId] = useState('')
  const [customerId, setCustomerId]   = useState('')
  const [executiveId, setExecutiveId] = useState('')
  const [userId, setUserId]           = useState('')
  const [startDate, setStartDate]     = useState('')
  const [endDate, setEndDate]         = useState('')
  const [ticket, setTicket]           = useState('')
  const [exporting, setExporting]     = useState(false)
  const [sortField, setSortField]     = useState<SortField | null>('date')
  const [sortDir, setSortDir]         = useState<SortDir>('desc')
  const [customers, setCustomers]     = useState<SelectOption[]>([])
  const [executives, setExecutives]   = useState<SelectOption[]>([])
  const [consultants, setConsultants] = useState<SelectOption[]>([])
  const [viewItem, setViewItem]       = useState<Timesheet | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

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
    setSortField(prev => {
      if (prev === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return field }
      setSortDir('asc'); return field
    })
    setPage(1)
  }, [])

  const { data: serviceTypes }  = useApiQuery<{ items: SelectOption[] } | SelectOption[]>('/service-types')
  const { data: contractTypes } = useApiQuery<{ items: SelectOption[] } | SelectOption[]>('/contract-types')

  const serviceTypeList: SelectOption[] = Array.isArray(serviceTypes)
    ? serviceTypes : (serviceTypes as any)?.items ?? []
  const contractTypeList: SelectOption[] = Array.isArray(contractTypes)
    ? contractTypes : (contractTypes as any)?.items ?? []

  // Carrega clientes e executivos
  useEffect(() => {
    const items = (r: any) => Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
    Promise.all([
      api.get<any>('/customers?pageSize=100'),
      api.get<any>('/executives?pageSize=100'),
      api.get<any>('/users?pageSize=200'),
    ]).then(([c, ex, us]) => {
      setCustomers(items(c))
      setExecutives(items(ex))
      setConsultants(items(us))
    }).catch(() => {})
  }, [])

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), per_page: '20' })
    if (status)         p.set('status', status)
    if (origin)         p.set('origin', origin)
    if (serviceTypeId)  p.set('service_type_id', serviceTypeId)
    if (contractTypeId) p.set('contract_type_id', contractTypeId)
    if (customerId)     p.set('customer_id', customerId)
    if (executiveId)    p.set('executive_id', executiveId)
    if (userId)         p.set('user_id', userId)
    if (startDate)      p.set('start_date', startDate)
    if (endDate)        p.set('end_date', endDate)
    if (ticket)         p.set('ticket', ticket)
    if (sortField)      p.set('order', sortDir === 'desc' ? `-${sortField}` : sortField)
    return p.toString()
  }, [page, status, origin, serviceTypeId, contractTypeId, customerId, executiveId, userId, startDate, endDate, ticket, sortField, sortDir])

  const { data, loading, error, refetch } = useApiQuery<PaginatedResponse<Timesheet>>(
    `/timesheets?${params}`, [params]
  )

  const resetPage = useCallback(() => setPage(1), [])
  const hasFilters = !!(status || origin || serviceTypeId || contractTypeId || customerId || executiveId || userId || startDate || endDate || ticket)

  const clearFilters = useCallback(() => {
    setStatus(''); setOrigin(''); setServiceTypeId(''); setContractTypeId('')
    setCustomerId(''); setExecutiveId(''); setUserId('')
    setStartDate(''); setEndDate(''); setTicket(''); setPage(1)
  }, [])

  const handleExport = async () => {
    setExporting(true)
    try {
      const p = new URLSearchParams()
      if (status)         p.set('status', status)
      if (serviceTypeId)  p.set('service_type_id', serviceTypeId)
      if (contractTypeId) p.set('contract_type_id', contractTypeId)
      if (startDate)      p.set('start_date', startDate)
      if (endDate)        p.set('end_date', endDate)
      if (ticket)         p.set('ticket', ticket)
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
              <Link href="/timesheets/new">
                <Button variant="primary" size="sm" icon={Plus}>Novo</Button>
              </Link>
            </>
          }
        />

        {/* Filters */}
        <div
          className="p-4 rounded-2xl mb-4 space-y-3"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
        >
          {/* Linha 1: selects */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <SearchSelect
              value={userId}
              onChange={v => { setUserId(v); resetPage() }}
              options={consultants}
              placeholder="Todos os colaboradores"
            />
            <SearchSelect
              value={customerId}
              onChange={v => { setCustomerId(v); resetPage() }}
              options={customers}
              placeholder="Todos os clientes"
            />
            {executives.length > 0 && (
              <SearchSelect
                value={executiveId}
                onChange={v => { setExecutiveId(v); resetPage() }}
                options={executives}
                placeholder="Todos os executivos"
              />
            )}
            <SearchSelect
              value={serviceTypeId}
              onChange={v => { setServiceTypeId(v); resetPage() }}
              options={serviceTypeList}
              placeholder="Tipo de serviço"
            />
            <SearchSelect
              value={contractTypeId}
              onChange={v => { setContractTypeId(v); resetPage() }}
              options={contractTypeList}
              placeholder="Tipo de contrato"
            />
            <Select value={origin} onChange={e => { setOrigin(e.target.value); resetPage() }}>
              {ORIGIN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <TextInput
              placeholder="Nº ticket..."
              value={ticket}
              onChange={e => { setTicket(e.target.value); resetPage() }}
            />
          </div>

          {/* Linha 2: datas + limpar */}
          <div className="flex items-center gap-2 flex-wrap">
            <DateRangePicker
              from={startDate}
              to={endDate}
              onChange={(f, t) => { setStartDate(f); setEndDate(t); resetPage() }}
            />
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

        {/* Status pills */}
        <div className="flex items-center gap-1 p-1 rounded-xl w-fit mb-6" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
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
        </div>

        {/* Total horas */}
        {data && data.totalEffortHours && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Total de horas:</span>
            <span className="text-sm font-bold" style={{ color: 'var(--brand-primary)' }}>{data.totalEffortHours}</span>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <SkeletonTable rows={8} cols={10} />
        ) : error ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--brand-danger)' }}>{error}</div>
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th className="w-10" />
                <Th sortable active={sortField === 'date'}          dir={sortDir} onClick={() => handleSort('date')}>Data</Th>
                <Th>Status</Th>
                <Th className="hidden sm:table-cell">Origem</Th>
                <Th sortable active={sortField === 'user.name'}     dir={sortDir} onClick={() => handleSort('user.name')}>Colaborador</Th>
                <Th sortable active={sortField === 'project.name'}  dir={sortDir} onClick={() => handleSort('project.name')}>Projeto</Th>
                <Th sortable active={sortField === 'customer.name'} dir={sortDir} onClick={() => handleSort('customer.name')} className="hidden lg:table-cell">Cliente</Th>
                <Th className="hidden xl:table-cell">Contrato</Th>
                <Th className="hidden lg:table-cell">Ticket #</Th>
                <Th className="hidden xl:table-cell">Título</Th>
                <Th right sortable active={sortField === 'effort_hours'} dir={sortDir} onClick={() => handleSort('effort_hours')}>Tempo</Th>
              </tr>
            </Thead>
            <Tbody>
              {data?.items.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    <EmptyState icon={Clock} title="Nenhum apontamento encontrado" description="Tente ajustar os filtros ou criar um novo apontamento." />
                  </td>
                </tr>
              ) : data?.items.map(ts => (
                <Tr key={ts.id}>
                  <Td className="w-10">
                    <RowActions id={ts.id} onView={() => openView(ts)} onDeleted={refetch} />
                  </Td>
                  <Td className="whitespace-nowrap font-medium">{formatDate(ts.date)}</Td>
                  <Td>
                    <Badge variant={ts.status}>{ts.status_display ?? ts.status}</Badge>
                  </Td>
                  <Td className="hidden sm:table-cell">
                    <OriginBadge origin={ts.origin} />
                  </Td>
                  <Td muted>{ts.user?.name ?? '—'}</Td>
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
                  <Td muted className="hidden lg:table-cell truncate max-w-[140px]">
                    {ts.customer?.name ?? ts.project?.customer?.name ?? '—'}
                  </Td>
                  <Td muted className="hidden xl:table-cell truncate max-w-[140px]">
                    {ts.project?.contract_type_display ?? '—'}
                  </Td>
                  <Td muted className="hidden lg:table-cell font-mono">
                    {ts.ticket ? `#${ts.ticket}` : '—'}
                  </Td>
                  <Td muted className="hidden xl:table-cell truncate max-w-[160px]">
                    {ts.ticket_subject ?? '—'}
                  </Td>
                  <Td right mono className="font-semibold" style={{ color: 'var(--brand-primary)' }}>
                    {formatMinutes(ts.effort_minutes)}
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
        />
      )}
      {viewLoading && viewItem && (
        <div className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)', color: 'var(--brand-subtle)' }}>
          <Clock size={12} className="animate-spin" /> Carregando detalhes...
        </div>
      )}
    </AppLayout>
  )
}
