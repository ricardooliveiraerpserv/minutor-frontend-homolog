'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { api, ApiError } from '@/lib/api'
import { fetchAndOpenLegacyUrl } from '@/lib/attachments'
import { Expense, PaginatedResponse } from '@/types'
import { Button as UIButton } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  PageHeader, Table, Thead, Th, Tbody, Tr, Td,
  Badge, Button, SkeletonTable, EmptyState, Pagination,
} from '@/components/ds'
import { ReasonTooltip } from '@/components/ui/reason-tooltip'
import {
  Receipt, ChevronLeft, ChevronRight, Plus, Pencil, Trash2,
  X, Paperclip, Eye, Building2, FolderOpen, Tag,
  CreditCard, FileText, Calendar, MoreVertical, CalendarDays, RefreshCw, DollarSign, AlertTriangle, Download, Undo2,
} from 'lucide-react'
import { ConfirmDeleteModal } from '@/components/ui/confirm-delete-modal'
import { ExpenseViewModal } from '@/components/ui/expense-view-modal'
import { ExpenseHoverTooltip, useExpenseHover } from '@/components/ui/timesheet-hover-tooltip'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { MultiSelect } from '@/components/ui/multi-select'
import { useAuth } from '@/hooks/use-auth'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { useTableSort } from '@/hooks/use-table-sort'
import * as XLSX from 'xlsx'

// FASE 11.2.FE — Helper centralizado em src/lib/attachments.ts.
const fetchAndOpenFile = fetchAndOpenLegacyUrl

function ReceiptLink({ url }: { url: string }) {
  const [loading, setLoading] = useState(false)
  const handle = async (download: boolean) => {
    setLoading(true)
    try { await fetchAndOpenFile(url, download) }
    catch { alert(download ? 'Erro ao baixar comprovante' : 'Erro ao abrir comprovante') }
    finally { setLoading(false) }
  }
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => handle(false)} disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
        style={{ background: 'var(--primary-soft)', color: 'var(--brand-primary)', border: '1px solid var(--primary-soft)' }}>
        <Eye size={11} /> {loading ? 'Carregando...' : 'Visualizar'}
      </button>
      <button type="button" onClick={() => handle(true)} disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
        style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--brand-subtle)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <Download size={11} /> Baixar
      </button>
    </div>
  )
}

// ─── Expense detail helpers ───────────────────────────────────────────────────

const EXP_STATUS_CONF: Record<string, { bg: string; color: string; label: string }> = {
  pending:              { bg: 'rgba(234,179,8,0.12)',  color: '#EAB308', label: 'Pendente' },
  approved:             { bg: 'rgba(34,197,94,0.12)',  color: '#22C55E', label: 'Aprovado' },
  rejected:             { bg: 'rgba(239,68,68,0.12)',  color: '#EF4444', label: 'Rejeitado' },
  adjustment_requested: { bg: 'rgba(249,115,22,0.12)', color: '#F97316', label: 'Ajuste Solicitado' },
}
const EXP_TYPE_LABEL: Record<string, string> = {
  reimbursement:  'Reembolso',
  advance:        'Adiantamento',
  corporate_card: 'Cartão Corporativo',
}
const PAYMENT_LABEL_MAP: Record<string, string> = {
  pix:           'PIX',
  credit_card:   'Cartão de Crédito',
  debit_card:    'Cartão de Débito',
  cash:          'Dinheiro',
  bank_transfer: 'Transferência Bancária',
}

function InfoRowModal({ icon: Icon, label, value, children, last }: {
  icon: React.ElementType; label: string; value?: string | null
  children?: React.ReactNode; last?: boolean
}) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 ${!last ? 'border-b' : ''}`}
      style={ !last ? { borderColor: 'var(--brand-border)' } : undefined }>
      <span className="mt-0.5 shrink-0 p-1.5 rounded-lg"
        style={{ background: 'var(--primary-soft)', color: 'var(--brand-primary)' }}>
        <Icon size={11} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--brand-subtle)' }}>{label}</p>
        {children ?? (
          <p className="text-xs font-medium" style={{ color: 'var(--brand-text)' }}>{value ?? '—'}</p>
        )}
      </div>
    </div>
  )
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
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm outline-none text-left"
        style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: selected ? 'var(--brand-text)' : 'var(--brand-subtle)' }}>
        <span className="truncate text-sm">{selected ? selected.name : placeholder}</span>
        <ChevronRight size={12} className="rotate-90 shrink-0" style={{ color: 'var(--brand-subtle)' }} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-full min-w-52 rounded-xl shadow-2xl overflow-hidden"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          <div className="p-2 border-b" style={{ borderColor: 'var(--brand-border)' }}>
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar..."
              className="w-full px-3 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }} />
          </div>
          <div className="max-h-52 overflow-y-auto">
            <button type="button" onClick={() => select('')}
              className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface-hover)] transition-colors"
              style={{ color: !value ? 'var(--brand-primary)' : 'var(--brand-subtle)' }}>{placeholder}</button>
            {filtered.length === 0
              ? <p className="px-3 py-2 text-xs" style={{ color: 'var(--brand-subtle)' }}>Nenhum resultado</p>
              : filtered.map(o => (
                <button key={o.id} type="button" onClick={() => select(String(o.id))}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface-hover)] transition-colors"
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

const STATUS_CLASS: Record<string, string> = {
  pending:              'bg-[var(--warning-bg)] text-[var(--warning)] border-yellow-500/30',
  approved:             'bg-[var(--success-bg)] text-[var(--success)] border-green-500/30',
  rejected:             'bg-[var(--danger-bg)] text-[var(--danger)] border-red-500/30',
  adjustment_requested: 'bg-[var(--warning-bg)] text-[var(--warning)] border-orange-500/30',
}

const STATUS_LABEL: Record<string, string> = {
  pending:              'Pendente',
  approved:             'Aprovado',
  rejected:             'Rejeitado',
  adjustment_requested: 'Ajuste Solicitado',
}

interface Category { id: number; name: string; parent_id?: number | null }
interface SelectOption { id: number; name: string }

function formatDateTime(d: string | null | undefined) {
  if (!d) return '—'
  const dt = new Date(d)
  const day = String(dt.getDate()).padStart(2, '0')
  const mon = String(dt.getMonth() + 1).padStart(2, '0')
  const h   = String(dt.getHours()).padStart(2, '0')
  const min = String(dt.getMinutes()).padStart(2, '0')
  return `${day}/${mon}/${dt.getFullYear()} ${h}:${min}`
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
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

  const rightYM = leftYM.m === 11 ? { y: leftYM.y + 1, m: 0 } : { y: leftYM.y, m: leftYM.m + 1 }

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
    const dropW = 500
    const left  = Math.min(r.left, window.innerWidth - dropW - 8)
    setPos({ top: r.bottom + 4, left: Math.max(8, left) })
  }

  const prevMonth = () => setLeftYM(p => p.m === 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m: p.m - 1 })
  const nextMonth = () => setLeftYM(p => p.m === 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m: p.m + 1 })

  const isStart = (d: string) => d === (selecting ?? from)
  const isEnd   = (d: string) => selecting ? d === hover : d === to
  const inRange = (d: string) => {
    const s = selecting ?? from; const e = selecting ? (hover ?? '') : to
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
        <div className="text-center text-sm font-semibold mb-3 text-[var(--primary)]">{MONTH_NAMES_PT[m]} {y}</div>
        <div className="grid grid-cols-7 mb-1">
          {DAY_NAMES_PT.map(d => <div key={d} className="text-center text-[10px] text-[var(--text-muted)] py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="h-7" />
            const d = dateISO(y, m, day)
            const s = isStart(d); const e = isEnd(d); const ir = inRange(d); const td = d === todayStr
            return (
              <button key={i} type="button"
                onMouseEnter={() => selecting && setHover(d)}
                onMouseLeave={() => setHover(null)}
                onClick={() => handleDay(d)}
                className={`h-7 w-full text-xs transition-colors rounded ${
                  s || e ? 'bg-cyan-400 text-zinc-900 font-bold'
                  : ir    ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
                  : td    ? 'text-[var(--primary)] font-semibold hover:bg-[var(--surface-hover)]'
                  :         'text-[var(--text)] hover:bg-[var(--surface-hover)]'
                }`}>
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
    : from ? `${fmtDisplay(from)} – ...` : 'Período'

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle}
        className={`flex items-center gap-2 h-8 px-3 bg-[var(--surface-hover)] border text-xs rounded-md hover:border-[var(--border-strong)] transition-colors whitespace-nowrap ${from || to ? 'border-cyan-500/50 text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>
        <CalendarDays size={12} className={from || to ? 'text-[var(--primary)]' : 'text-[var(--text-light)]'} />
        {displayText}
        {(from || to) && (
          <span onClick={e => { e.stopPropagation(); onChange('', '') }}
            className="ml-1 text-[var(--text-muted)] hover:text-[var(--text-muted)] cursor-pointer">
            <X size={10} />
          </span>
        )}
      </button>
      {pos && (
        <div ref={ref} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl p-4"
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}>
          <div className="flex items-center gap-4">
            <button type="button" onClick={prevMonth} className="text-[var(--text-light)] hover:text-[var(--text)] p-1 shrink-0"><ChevronLeft size={14} /></button>
            <div className="flex gap-4">
              {renderMonth(leftYM.y, leftYM.m)}
              <div className="w-px bg-[var(--surface-hover)]" />
              {renderMonth(rightYM.y, rightYM.m)}
            </div>
            <button type="button" onClick={nextMonth} className="text-[var(--text-light)] hover:text-[var(--text)] p-1 shrink-0"><ChevronRight size={14} /></button>
          </div>
          {selecting && <p className="text-[11px] text-[var(--text-light)] text-center mt-3">Clique para selecionar a data final</p>}
        </div>
      )}
    </>
  )
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-3 right-3 text-[var(--text-light)] hover:text-[var(--text)] z-10"><X size={16} /></button>
        {children}
      </div>
    </div>
  )
}

async function openReceipt(url: string) {
  try { await fetchAndOpenFile(url) }
  catch { alert('Erro ao abrir comprovante') }
}

interface RowMenuItem { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }

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
    <div ref={ref} className="flex justify-end">
      <button ref={btnRef} onClick={toggle}
        className={`p-1.5 rounded transition-colors ${open ? 'text-[var(--text)] bg-[var(--surface-hover)]' : 'text-[var(--text-light)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'}`}>
        <MoreVertical size={14} />
      </button>
      {pos && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="min-w-[152px] bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl shadow-2xl py-1 overflow-hidden">
          {items.map((item, i) => (
            <button key={i} onClick={() => { item.onClick(); setPos(null) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left ${
                item.danger ? 'text-[var(--danger)] hover:bg-[var(--danger-bg)]' : 'text-[var(--text)] hover:bg-[var(--surface-hover)]'
              }`}>
              {item.icon}{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export interface ExpensesScreenProps {
  scope?: 'sustentacao'
  embedded?: boolean
}

export function ExpensesScreen({ scope, embedded }: ExpensesScreenProps = {}) {
  const { user } = useAuth()
  const isCoordenador    = user?.type === 'coordenador'
  const isAdmin          = user?.type === 'admin'
  const isAdministrativo = user?.type === 'administrativo'
  const canActAsUser     = isAdmin || isCoordenador || isAdministrativo
  const isCliente        = user?.type === 'cliente'
  const canPay           = isAdmin || isAdministrativo
  // Chip "Meus projetos / Todos" pra coordenador (idem Apontamentos / Demandas).
  const [coordScope, setCoordScope] = useState<'meus' | 'todos'>('meus')

  const { filters: flt, set: setFilter, clear: clearPersistedFilters } = usePersistedFilters(
    'expenses',
    user?.id,
    {
      page:            1,
      status:          '',
      isPaidFilter:    '' as '' | 'false' | 'true' | 'no_fechamento',
      dateFrom:        '',
      dateTo:          '',
      refMonth:        null as number | null,
      refYear:         null as number | null,
      filterMode:      'month' as 'month' | 'period',
      customerIds:     [] as string[],
      projectId:       '',
      userIds:         [] as string[],
      coordinatorIds:  [] as string[],
      executiveIds:    [] as string[],
      contractTypeId:  '',
      categoriaServico: '' as '' | 'sustentacao' | 'projeto' | 'bizify' | 'investimento',
    },
  )
  const { page, status, isPaidFilter, dateFrom, dateTo, refMonth, refYear, filterMode, customerIds, projectId, userIds, coordinatorIds, executiveIds, contractTypeId, categoriaServico } = flt
  const setPage           = (v: number)                     => setFilter('page', v)
  const setStatus         = (v: string)                     => setFilter('status', v)
  const setIsPaidFilter   = (v: '' | 'false' | 'true' | 'no_fechamento') => setFilter('isPaidFilter', v)
  const setDateFrom       = (v: string)                     => setFilter('dateFrom', v)
  const setDateTo         = (v: string)                     => setFilter('dateTo', v)
  const setRefMonth       = (v: number | null)              => setFilter('refMonth', v)
  const setRefYear        = (v: number | null)              => setFilter('refYear', v)
  const setFilterMode     = (v: 'month' | 'period')         => setFilter('filterMode', v)
  const setCustomerIds    = (v: string[])                   => setFilter('customerIds', v)
  const setProjectId      = (v: string)                     => setFilter('projectId', v)
  const setUserIds        = (v: string[])                   => setFilter('userIds', v)
  const setCoordinatorIds = (v: string[])                   => setFilter('coordinatorIds', v)
  const setExecutiveIds   = (v: string[])                   => setFilter('executiveIds', v)
  const setContractTypeId = (v: string)                     => setFilter('contractTypeId', v)
  const setCategoriaServico = (v: '' | 'sustentacao' | 'projeto' | 'bizify' | 'investimento') => setFilter('categoriaServico', v)

  const [data, setData] = useState<PaginatedResponse<Expense> | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; item?: Expense }>({ open: false })
  const [paidBlockModal,   setPaidBlockModal]   = useState<{ open: boolean; expense?: Expense }>({ open: false })
  const [revertTarget,     setRevertTarget]     = useState<Expense | null>(null)
  const [revertReason,     setRevertReason]     = useState('')
  const [reverting,        setReverting]        = useState(false)
  const [form, setForm] = useState({
    customer_id: '', project_id: '', real_project_id: '', expense_category_id: '', expense_date: '',
    description: '', amount: '', expense_type: 'reimbursement',
    payment_method: 'pix', charge_client: false, user_id: '',
  })
  const [modalUsers, setModalUsers] = useState<SelectOption[]>([])
  const [receipt, setReceipt] = useState<File | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [projects, setProjects] = useState<SelectOption[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id?: number }>({ open: false })
  const [viewItem,       setViewItem]       = useState<Expense | null>(null)
  const [customers,        setCustomers]        = useState<SelectOption[]>([])
  const [allProjects,      setAllProjects]      = useState<SelectOption[]>([])
  const [consultants,      setConsultants]      = useState<SelectOption[]>([])
  const [coordinators,     setCoordinators]     = useState<SelectOption[]>([])
  const [executives,       setExecutives]       = useState<SelectOption[]>([])
  interface ClienteProject { id: number; name: string; contract_type_id?: number; contract_type_display?: string }
  const [clienteProjects,  setClienteProjects]  = useState<ClienteProject[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

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

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '100' })
    if (status)       p.set('status',    status)
    if (isPaidFilter === 'no_fechamento') { p.set('is_paid', 'false'); p.set('has_partner', '1') }
    else if (isPaidFilter === 'false')    { p.set('is_paid', 'false'); p.set('has_partner', '0') }
    else if (isPaidFilter) p.set('is_paid', isPaidFilter)
    if (dateFrom)     p.set('start_date', dateFrom)
    if (dateTo)       p.set('end_date',  dateTo)
    if (contractTypeId) p.set('contract_type_id', contractTypeId)
    if (categoriaServico) p.set('categoria_servico', categoriaServico)
    if (isCliente && user?.customer_id) p.set('customer_id', String(user.customer_id))
    else customerIds.forEach(v => p.append('customer_id[]', v))
    if (projectId) p.set('project_id', projectId)
    userIds.forEach(v => p.append('user_id[]', v))
    coordinatorIds.forEach(v => p.append('coordinator_id[]', v))
    // Chip "Meus projetos" do coordenador: força coordinator_id = user.id quando ativo.
    if (isCoordenador && coordScope === 'meus' && user?.id && !coordinatorIds.includes(String(user.id))) {
      p.append('coordinator_id[]', String(user.id))
    }
    executiveIds.forEach(v => p.append('executive_id[]', v))
    if (scope) p.set('scope', scope)
    return p.toString()
  }, [page, status, isPaidFilter, dateFrom, dateTo, customerIds, projectId, userIds, coordinatorIds, executiveIds, contractTypeId, categoriaServico, isCliente, user?.customer_id, user?.id, scope, isCoordenador, coordScope])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<PaginatedResponse<Expense>>(`/expenses?${params}`)
      setData(r)
    } catch { toast.error('Erro ao carregar despesas') }
    finally { setLoading(false) }
  }, [params])

  useEffect(() => { load() }, [load])

  // Load filter options once on mount
  useEffect(() => {
    const items = (r: PromiseSettledResult<any>) =>
      r.status === 'fulfilled'
        ? (Array.isArray(r.value?.items) ? r.value.items : Array.isArray(r.value?.data) ? r.value.data : [])
        : []

    if (isCliente && user?.customer_id) {
      Promise.allSettled([
        api.get<any>(`/projects?pageSize=200&customer_id=${user.customer_id}&status=active`),
      ]).then(([proj]) => {
        setClienteProjects(items(proj))
      })
    } else {
      const customerEndpoint = isAdmin
        ? '/customers?pageSize=500'
        : '/customers/user-linked?pageSize=500'
      Promise.allSettled([
        api.get<any>(customerEndpoint),
        // Colaborador: inclui consultor + coordenador + administrativo + admin (todos os
        // internos, exclui só cliente) — pra filtrar despesas lançadas por qualquer um deles.
        api.get<any>('/users?pageSize=300&exclude_type=cliente'),
        api.get<any>('/users?pageSize=100&role=Coordenador'),
        api.get<any>('/executives?pageSize=100'),
      ]).then(([cu, co, cr, ex]) => {
        setCustomers(items(cu))
        setConsultants(items(co))
        setCoordinators(items(cr))
        setExecutives(items(ex))
      })
    }
  }, [isCliente, isAdmin, user?.customer_id])

  const loadOptions = useCallback(async () => {
    try {
      const [c, u] = await Promise.all([
        api.get<{ items?: Category[]; data?: Category[] }>('/expense-categories?pageSize=100'),
        canActAsUser ? api.get<any>('/users?pageSize=200&exclude_type=cliente') : Promise.resolve(null),
      ])
      setCategories(Array.isArray(c?.items) ? c.items : Array.isArray(c?.data) ? c.data : [])
      if (u) setModalUsers(Array.isArray(u?.items) ? u.items : [])
    } catch { /* silencioso */ }
  }, [canActAsUser])

  // Reload modal projects when customer changes — só carrega se houver cliente selecionado
  useEffect(() => {
    if (!modal.open) return
    if (!form.customer_id) { setProjects([]); return }
    let cancelled = false
    const qs = new URLSearchParams({ pageSize: '200', customer_id: form.customer_id, status: 'open', include_investimento_comercial: 'true' })
    if (isCoordenador) qs.set('consultant_only', 'true')
    api.get<PaginatedResponse<SelectOption>>(`/projects?${qs}`)
      .then(p => { if (!cancelled) setProjects(Array.isArray(p?.items) ? p.items : []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [modal.open, form.customer_id])

  const openCreate = () => {
    setForm({ customer_id: '', project_id: '', real_project_id: '', expense_category_id: '', expense_date: new Date().toISOString().split('T')[0], description: '', amount: '', expense_type: 'reimbursement', payment_method: 'pix', charge_client: false, user_id: '' })
    setReceipt(null)
    loadOptions()
    setModal({ open: true })
  }

  const openEdit = (item: Expense) => {
    const custId = item.project?.customer_id ? String(item.project.customer_id) : ''
    setForm({
      customer_id: custId,
      project_id: String(item.project_id),
      real_project_id: String((item as any).real_project_id ?? ''),
      expense_category_id: String(item.expense_category_id),
      expense_date: item.expense_date,
      description: item.description,
      amount: String(item.amount),
      expense_type: item.expense_type,
      payment_method: item.payment_method,
      charge_client: item.charge_client,
      user_id: String(item.user_id ?? ''),
    })
    setReceipt(null)
    loadOptions()
    setModal({ open: true, item })
  }

  // ERPSERV (empresa própria): investimento interno não pede Projeto Real (sem projeto de cliente real).
  const selectedCustomer = (customers as any[]).find(c => String(c.id) === form.customer_id)
  const isErpservCustomer = String(selectedCustomer?.name ?? '').trim().toUpperCase() === 'ERPSERV'

  const save = async () => {
    setSaving(true)
    try {
      const selProj = (projects as any[]).find(p => String(p.id) === form.project_id)
      const isInvestimento = !!selProj?.is_investimento_comercial && !isErpservCustomer
      if (isInvestimento && !form.real_project_id) { toast.error('Selecione o Projeto Real'); setSaving(false); return }
      const fd = new FormData()
      fd.append('project_id', form.project_id)
      if (isInvestimento && form.real_project_id) fd.append('real_project_id', form.real_project_id)
      fd.append('expense_category_id', form.expense_category_id)
      fd.append('expense_date', form.expense_date)
      fd.append('description', form.description)
      fd.append('amount', form.amount)
      fd.append('expense_type', form.expense_type)
      fd.append('payment_method', form.payment_method)
      if (canActAsUser && form.user_id) fd.append('user_id', form.user_id)
      if (receipt) fd.append('receipt', receipt)
      if (modal.item) fd.append('_method', 'PUT')

      const url = modal.item ? `/api/v1/expenses/${modal.item.id}` : '/api/v1/expenses'
      const res = await fetch(url, { method: 'POST', headers: { Accept: 'application/json' }, credentials: 'same-origin', body: fd })
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new ApiError(res.status, b.message ?? 'Erro ao salvar') }

      toast.success(modal.item ? 'Despesa atualizada' : 'Despesa criada')
      setModal({ open: false })
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }


  const remove = (id: number) => setDeleteConfirm({ open: true, id })

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return
    setDeleting(deleteConfirm.id)
    setDeleteConfirm({ open: false })
    try {
      await api.delete(`/expenses/${deleteConfirm.id}`)
      toast.success('Despesa excluída')
      load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
    finally { setDeleting(null) }
  }

  const canEdit = (exp: Expense) => ['pending', 'rejected', 'adjustment_requested'].includes(exp.status)

  async function togglePaid(exp: Expense) {
    if (!exp.is_paid && exp.status !== 'approved') {
      setPaidBlockModal({ open: true, expense: exp })
      return
    }
    try {
      await api.post(`/expenses/${exp.id}/set-paid`, { is_paid: !exp.is_paid })
      toast.success(exp.is_paid ? 'Marcação removida.' : 'Despesa marcada como paga.')
      load()
    } catch (err: any) {
      const msg = err?.response?.data?.message
      toast.error(msg ?? 'Erro ao atualizar status de pagamento')
    }
  }

  async function submitRevert() {
    if (!revertTarget) return
    const targetId = revertTarget.id
    // Update OTIMISTA: marca como pending na lista local (o estorno já muda o status no banco).
    // NÃO refazer load() imediato — o refetch logo após o POST volta stale (eventual consistency),
    // mostrava "Aprovado" e fazia tentar de novo → "já estornada". Ver feedback de optimistic-no-refetch.
    const markPending = () => setData(prev => prev
      ? { ...prev, items: prev.items.map(e => e.id === targetId ? { ...e, status: 'pending' } : e) }
      : prev)
    setReverting(true)
    try {
      await api.post(`/expenses/${targetId}/reverse-approval`, {})
      toast.success('Aprovação estornada com sucesso.')
      markPending()
    } catch (err: any) {
      const msg: string = (err as any)?.message ?? ''
      // 422 com "aprovada" = já estava estornada (no banco já está pending) → reflete na UI
      if (msg.toLowerCase().includes('aprovada')) {
        toast.info('Despesa já havia sido estornada anteriormente.')
        markPending()
      } else {
        toast.error(msg || 'Erro ao estornar aprovação.')
      }
    } finally {
      setReverting(false)
      setRevertTarget(null)
      setRevertReason('')
    }
  }

  // ─── Ordenação client-side da página atual (campos aninhados via accessor) ───
  const items = data?.items ?? []
  const expenseSortAccessor = useCallback((row: Expense, key: string): unknown => {
    switch (key) {
      case 'expense_date': return row.expense_date
      case 'user':         return row.user?.name ?? ''
      case 'project':      return row.project?.name ?? ''
      case 'customer':     return row.project?.customer?.name ?? ''
      case 'description':  return row.description ?? ''
      case 'category':     return row.category?.name ?? ''
      case 'service_type': return (row.project as any)?.service_type?.name ?? ''
      case 'amount':       return Number(row.amount) || 0
      case 'status':       return row.status ?? ''
      case 'is_paid':      return row.is_paid ? 1 : 0
      case 'created_at':   return row.created_at ?? ''
      default:             return (row as any)[key]
    }
  }, [])
  const { sorted: sortedItems, thProps } = useTableSort(items, expenseSortAccessor)
  const expHover = useExpenseHover()

  // ─── Exportar Excel (apenas a página visível ordenada — mesma regra do print) ──
  const exportToExcel = () => {
    if (sortedItems.length === 0) {
      toast.info('Sem despesas para exportar — ajuste os filtros.')
      return
    }
    const STATUS_LABEL_LOCAL: Record<string, string> = {
      pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado', adjustment_requested: 'Ajuste',
    }
    const rows = sortedItems.map(e => ({
      Data: e.expense_date ? e.expense_date.split('-').reverse().join('/') : '',
      Colaborador: e.user?.name ?? '',
      Projeto: e.project?.name ?? '',
      Cliente: e.project?.customer?.name ?? '',
      Descrição: e.description ?? '',
      Categoria: e.category?.name ?? '',
      'Tipo de Serviço': (e.project as any)?.service_type?.name ?? '',
      Valor: Number(e.amount) || 0,
      Status: STATUS_LABEL_LOCAL[e.status] ?? e.status ?? '',
      Pagamento: e.is_paid ? 'Pago' : 'Em aberto',
      'Cobrar Cliente': e.charge_client ? 'Sim' : 'Não',
      'Inclusão': e.created_at ? new Date(e.created_at).toLocaleString('pt-BR') : '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    // Formatação BRL na coluna H (Valor) — XLSX aceita numFmt por célula.
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    for (let r = 1; r <= range.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: 7 })]
      if (cell) cell.z = '"R$" #,##0.00'
    }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Despesas')
    const stamp = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `despesas_${stamp}.xlsx`)
  }

  return (
    <div>
      <div className={embedded ? '' : 'max-w-7xl mx-auto'}>
        <PageHeader
          icon={Receipt}
          title="Despesas"
          subtitle="Registro de despesas e reembolsos"
          actions={
            <>
              <Button variant="ghost" size="sm" icon={Download} onClick={exportToExcel} disabled={sortedItems.length === 0}>Exportar Excel</Button>
              <Button variant="ghost" size="sm" icon={RefreshCw} onClick={load}>Atualizar</Button>
              {!isCliente && <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>Nova</Button>}
            </>
          }
        />

        {/* Chip "Meus projetos / Todos" — coordenador, perto da tabela */}
        {isCoordenador && (
          <div className="mb-3 inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {(['meus', 'todos'] as const).map(opt => {
              const active = coordScope === opt
              return (
                <button key={opt} onClick={() => setCoordScope(opt)}
                  className="px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    background: active ? 'var(--primary)' : 'var(--surface)',
                    color: active ? 'var(--primary-fg)' : 'var(--text-muted)',
                    borderRight: opt === 'meus' ? '1px solid var(--border)' : undefined,
                  }}>
                  {opt === 'meus' ? 'Meus projetos' : 'Todos'}
                </button>
              )
            })}
          </div>
        )}

        {/* Filter card */}
        <div className="p-4 rounded-2xl mb-4 space-y-3"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          {isCliente ? (
            <div className="grid grid-cols-1 gap-2">
              <SearchSelect value={projectId} onChange={v => { setProjectId(v); setPage(1) }} options={clienteProjects} placeholder="Todos os projetos" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
              <MultiSelect value={customerIds}    onChange={v => { setCustomerIds(v);    setPage(1) }} options={customers}    placeholder="Todos os clientes"     />
              <SearchSelect value={projectId}     onChange={v => { setProjectId(v);     setPage(1) }} options={allProjects}  placeholder="Todos os projetos"     />
              <MultiSelect value={userIds}        onChange={v => { setUserIds(v);        setPage(1) }} options={consultants}  placeholder="Todos os colaboradores" />
              <MultiSelect value={coordinatorIds} onChange={v => { setCoordinatorIds(v); setPage(1) }} options={coordinators} placeholder="Todos os coordenadores" />
              <MultiSelect value={executiveIds}   onChange={v => { setExecutiveIds(v);   setPage(1) }} options={executives}   placeholder="Todos os executivos"   />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
              {(['month', 'period'] as const).map((mode) => (
                <button key={mode} onClick={() => setFilterMode(mode)}
                  className="px-3 py-1.5 font-medium transition-colors"
                  style={{ background: filterMode === mode ? 'var(--primary)' : 'transparent', color: filterMode === mode ? 'var(--primary-fg)' : 'var(--text-muted)' }}>
                  {mode === 'month' ? 'Mês/Ano' : 'Período'}
                </button>
              ))}
            </div>
            {filterMode === 'month' ? (
              <MonthYearPicker
                month={refMonth}
                year={refYear}
                onChange={(m, y) => {
                  if (m === 0) { setRefMonth(null); setRefYear(null); setDateFrom(''); setDateTo('') }
                  else {
                    const mm = String(m).padStart(2, '0')
                    const last = new Date(y, m, 0).getDate()
                    setRefMonth(m); setRefYear(y)
                    setDateFrom(`${y}-${mm}-01`); setDateTo(`${y}-${mm}-${String(last).padStart(2, '0')}`)
                  }
                  setPage(1)
                }}
              />
            ) : (
              <DateRangePicker
                from={dateFrom} to={dateTo}
                onChange={(f, t) => { setDateFrom(f); setDateTo(t); setRefMonth(null); setRefYear(null); setPage(1) }}
              />
            )}
            {!isCliente && ([
              { id: 'sustentacao',  label: 'Sustentação', color: '#f59e0b',            bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)' },
              { id: 'projeto',      label: 'Projeto',     color: 'var(--primary)',            bg: 'var(--primary-soft)',   border: 'var(--primary)' },
              { id: 'bizify',       label: 'Bizify',      color: '#a78bfa',            bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.35)' },
              { id: 'investimento', label: 'Investimento', color: '#ef4444',           bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)' },
            ] as const).map(opt => {
              const active = (categoriaServico || '') === opt.id
              return (
                <button key={opt.id || 'all'}
                  onClick={() => { setCategoriaServico(active ? '' : (opt.id as any)); setPage(1) }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={active
                    ? { background: opt.bg, color: opt.color, border: `1px solid ${opt.border}` }
                    : { background: 'transparent', color: 'var(--brand-subtle)', border: '1px solid var(--brand-border)' }}>
                  {opt.label}
                </button>
              )
            })}
            {(customerIds.length > 0 || projectId || userIds.length > 0 || coordinatorIds.length > 0 || executiveIds.length > 0 || contractTypeId || dateFrom || dateTo) && (
              <button onClick={() => clearPersistedFilters()}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs transition-all hover:bg-[var(--surface-hover)]"
                style={{ color: 'var(--brand-danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
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
              onClick={() => { setContractTypeId(''); setPage(1) }}
              className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={!contractTypeId
                ? { background: 'var(--brand-primary)', color: 'var(--primary-fg)' }
                : { color: 'var(--brand-muted)', background: 'transparent' }
              }>
              Total Geral
            </button>
            {clienteContractTypes.map(ct => (
              <button key={ct.id}
                onClick={() => { setContractTypeId(String(ct.id)); setPage(1) }}
                className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={contractTypeId === String(ct.id)
                  ? { background: 'var(--brand-primary)', color: 'var(--primary-fg)' }
                  : { color: 'var(--brand-muted)', background: 'transparent' }
                }>
                {ct.name}
              </button>
            ))}
          </div>
        )}

        {/* Status pills — oculto para cliente */}
        {!isCliente && (
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex items-center gap-1 p-1 rounded-xl w-fit"
              style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
              {[
                { value: '', label: 'Todos' },
                { value: 'pending', label: 'Pendente' },
                { value: 'approved', label: 'Aprovado' },
                { value: 'rejected', label: 'Rejeitado' },
                { value: 'adjustment_requested', label: 'Ajuste' },
              ].map(s => (
                <button key={s.value} onClick={() => { setStatus(s.value); setPage(1) }}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={status === s.value
                    ? { background: 'var(--brand-primary)', color: 'var(--primary-fg)' }
                    : { color: 'var(--brand-muted)', background: 'transparent' }
                  }>
                  {s.label}
                </button>
              ))}
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1 p-1 rounded-xl w-fit"
                style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
                {([
                  { value: '' as const, label: 'Todas' },
                  { value: 'false' as const, label: 'A pagar' },
                  { value: 'no_fechamento' as const, label: 'No Fechamento' },
                  { value: 'true' as const, label: 'Pagas' },
                ]).map(s => (
                  <button key={s.value} onClick={() => { setIsPaidFilter(s.value); setPage(1) }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={isPaidFilter === s.value
                      ? { background: s.value === 'true' ? '#3f3f46' : 'var(--brand-primary)', color: s.value === 'true' ? '#a1a1aa' : '#0A0A0B' }
                      : { color: 'var(--brand-muted)', background: 'transparent' }
                    }>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tabela */}
        {loading ? (
          <SkeletonTable rows={8} cols={7} />
        ) : sortedItems.length === 0 ? (
          <EmptyState icon={Receipt} title="Nenhuma despesa encontrada" description="Tente ajustar os filtros ou criar uma nova despesa." />
        ) : (
          <>
          {/* Desktop: tabela (inalterada) */}
          <div className="hidden md:block">
          <Table>
            <Thead>
              <tr>
                {!isCliente && <Th className="w-10" />}
                <Th {...thProps('expense_date')}>Data</Th>
                <Th {...thProps('user')}>Colaborador</Th>
                <Th {...thProps('project')} className="hidden md:table-cell">Projeto</Th>
                {!isCliente && <Th {...thProps('customer')} className="hidden sm:table-cell">Cliente</Th>}
                {!isCliente && <Th {...thProps('description')}>Descrição</Th>}
                {!isCliente && <Th {...thProps('category')} className="hidden lg:table-cell">Categoria</Th>}
                <Th {...thProps('service_type')} className="hidden xl:table-cell">Tipo de Serviço</Th>
                <Th {...thProps('amount')} right>Valor</Th>
                {!isCliente && <Th {...thProps('status')}>Status</Th>}
                {!isCliente && <Th {...thProps('is_paid')}>Pagamento</Th>}
                <Th {...thProps('created_at')} className="hidden lg:table-cell">Inclusão</Th>
              </tr>
            </Thead>
            <Tbody>
              {sortedItems.map(exp => (
                <Tr key={exp.id} onClick={() => setViewItem(exp)} {...expHover.bind(exp)}>
                  {!isCliente && (
                    <Td className="w-10">
                      <div onClick={e => e.stopPropagation()}>
                      <RowMenu items={[
                        { label: 'Visualizar', icon: <Eye size={12} />, onClick: () => setViewItem(exp) },
                        ...(canEdit(exp) ? [
                          { label: 'Editar', icon: <Pencil size={12} />, onClick: () => openEdit(exp) },
                          { label: 'Excluir', icon: <Trash2 size={12} />, onClick: () => remove(exp.id), danger: true },
                        ] : []),
                        ...(exp.receipt_url ? [
                          { label: 'Ver Comprovante', icon: <Paperclip size={12} />, onClick: () => openReceipt(exp.receipt_url!) },
                        ] : []),
                        ...(canPay && (exp.status === 'approved' || exp.is_paid) ? [
                          { label: exp.is_paid ? 'Desmarcar Pago' : 'Marcar como Pago', icon: <DollarSign size={12} />, onClick: () => togglePaid(exp) },
                        ] : []),
                        ...(canPay && exp.status === 'approved' && !exp.is_paid ? [
                          { label: 'Estornar Aprovação', icon: <Undo2 size={12} />, onClick: () => setRevertTarget(exp), danger: true },
                        ] : []),
                      ]} />
                      </div>
                    </Td>
                  )}
                  <Td className="whitespace-nowrap font-medium">{formatDate(exp.expense_date)}</Td>
                  <Td muted className="truncate max-w-[140px]">{exp.user?.name ?? '—'}</Td>
                  <Td muted className="hidden md:table-cell truncate max-w-[260px]">
                    {exp.project?.name ?? '—'}
                    {(exp as any).real_project?.name && (
                      <span className="block text-[10px]" style={{ color: 'var(--text-light)' }}>Real: {(exp as any).real_project.name}</span>
                    )}
                  </Td>
                  {!isCliente && <Td muted className="hidden sm:table-cell truncate max-w-[120px]">{exp.project?.customer?.name ?? '—'}</Td>}
                  {!isCliente && (
                    <Td className="max-w-[200px]">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate block" style={{ color: 'var(--brand-text)' }}>{exp.description}</span>
                        {exp.receipt_url && <Paperclip size={10} aria-label="Tem comprovante" style={{ color: 'var(--brand-subtle)', flexShrink: 0 }} />}
                      </div>
                    </Td>
                  )}
                  {!isCliente && <Td muted className="hidden lg:table-cell">{exp.category?.name ?? '—'}</Td>}
                  <Td muted className="hidden xl:table-cell truncate max-w-[120px]">{(exp.project as any)?.service_type?.name ?? '—'}</Td>
                  <Td right mono className={`font-semibold ${exp.is_paid ? 'opacity-40' : ''}`} style={{ color: exp.is_paid ? 'var(--brand-muted)' : 'var(--brand-primary)' }}>
                    {formatCurrency(isCliente && (exp.project as any)?.max_expense_per_consultant != null
                      ? Number((exp.project as any).max_expense_per_consultant)
                      : Number(exp.amount))}
                  </Td>
                  {!isCliente && <Td><ReasonTooltip status={exp.status} reason={exp.rejection_reason}><Badge variant={exp.status as any}>{STATUS_LABEL[exp.status] ?? exp.status}</Badge></ReasonTooltip></Td>}
                  {!isCliente && (
                    <Td>
                      {exp.is_paid
                        ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-[var(--success)]">Pago</span>
                        : (exp.user?.partner_id != null && exp.status === 'approved')
                          ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-[var(--success)]">Pago no fechamento</span>
                          : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-950 text-[var(--warning)]">Em aberto</span>
                      }
                    </Td>
                  )}
                  <Td muted className="hidden lg:table-cell whitespace-nowrap">{formatDateTime(exp.created_at)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          </div>

          {/* Mobile: cards (um por despesa, sem scroll horizontal) */}
          <div className="md:hidden space-y-2">
            {sortedItems.map(exp => (
              <div
                key={exp.id}
                onClick={() => setViewItem(exp)}
                className="rounded-xl border p-3 active:opacity-80 transition"
                style={{ borderColor: 'var(--brand-border)', background: 'var(--brand-surface)' }}
              >
                {/* Linha 1: descrição + valor (+ menu) */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isCliente ? (
                      <span className="font-medium truncate" style={{ color: 'var(--brand-text)' }}>
                        {exp.project?.name ?? '—'}
                      </span>
                    ) : (
                      <>
                        <span className="font-medium truncate" style={{ color: 'var(--brand-text)' }}>
                          {exp.description}
                        </span>
                        {exp.receipt_url && (
                          <Paperclip size={11} aria-label="Tem comprovante" style={{ color: 'var(--brand-subtle)', flexShrink: 0 }} />
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`font-bold text-sm ${exp.is_paid ? 'opacity-40' : ''}`}
                      style={{ color: exp.is_paid ? 'var(--brand-muted)' : 'var(--brand-primary)' }}>
                      {formatCurrency(isCliente && (exp.project as any)?.max_expense_per_consultant != null
                        ? Number((exp.project as any).max_expense_per_consultant)
                        : Number(exp.amount))}
                    </span>
                    {!isCliente && (
                      <div onClick={e => e.stopPropagation()}>
                        <RowMenu items={[
                          { label: 'Visualizar', icon: <Eye size={12} />, onClick: () => setViewItem(exp) },
                          ...(canEdit(exp) ? [
                            { label: 'Editar', icon: <Pencil size={12} />, onClick: () => openEdit(exp) },
                            { label: 'Excluir', icon: <Trash2 size={12} />, onClick: () => remove(exp.id), danger: true },
                          ] : []),
                          ...(exp.receipt_url ? [
                            { label: 'Ver Comprovante', icon: <Paperclip size={12} />, onClick: () => openReceipt(exp.receipt_url!) },
                          ] : []),
                          ...(canPay && (exp.status === 'approved' || exp.is_paid) ? [
                            { label: exp.is_paid ? 'Desmarcar Pago' : 'Marcar como Pago', icon: <DollarSign size={12} />, onClick: () => togglePaid(exp) },
                          ] : []),
                          ...(canPay && exp.status === 'approved' && !exp.is_paid ? [
                            { label: 'Estornar Aprovação', icon: <Undo2 size={12} />, onClick: () => setRevertTarget(exp), danger: true },
                          ] : []),
                        ]} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Linha 2: meta (Data · Colaborador · Projeto) */}
                <div className="mt-1 text-[11px] truncate" style={{ color: 'var(--brand-subtle)' }}>
                  {isCliente ? (
                    <>{formatDate(exp.expense_date)}</>
                  ) : (
                    <>
                      {formatDate(exp.expense_date)}
                      {exp.user?.name && <> · {exp.user.name}</>}
                      {exp.project?.name && <> · {exp.project.name}</>}
                    </>
                  )}
                </div>

                {/* Linha 3: status + pagamento (oculto p/ cliente) */}
                {!isCliente && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <ReasonTooltip status={exp.status} reason={exp.rejection_reason}>
                      <Badge variant={exp.status as any}>{STATUS_LABEL[exp.status] ?? exp.status}</Badge>
                    </ReasonTooltip>
                    {exp.is_paid
                      ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-[var(--success)]">Pago</span>
                      : (exp.user?.partner_id != null && exp.status === 'approved')
                        ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-[var(--success)]">Pago no fechamento</span>
                        : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-950 text-[var(--warning)]">Em aberto</span>
                    }
                  </div>
                )}
              </div>
            ))}
          </div>
          </>
        )}

        {/* Paginação */}
        {!loading && (data?.items.length ?? 0) > 0 && (
          <Pagination
            page={page}
            hasNext={data?.hasNext ?? false}
            onPrev={() => setPage(Math.max(1, page - 1))}
            onNext={() => setPage(page + 1)}
          />
        )}
      </div>

      {/* Modal criar/editar */}
      {modal.open && (
        <ModalOverlay onClose={() => setModal({ open: false })}>
          <div className="p-5">
            <h3 className="text-sm font-semibold text-white mb-4">{modal.item ? 'Editar Despesa' : 'Nova Despesa'}</h3>
            <div className="space-y-3">
              {canActAsUser && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs text-[var(--text-muted)]">Usuário</Label>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, user_id: String(user?.id ?? '') }))}
                      className="text-xs font-medium transition-colors"
                      style={{ color: 'var(--brand-primary)' }}
                    >
                      → Colocar-me como responsável
                    </button>
                  </div>
                  <SearchSelect
                    value={form.user_id}
                    onChange={v => setForm(f => ({ ...f, user_id: v }))}
                    options={modalUsers}
                    placeholder="Selecione o usuário..."
                  />
                </div>
              )}
              <div>
                <Label className="text-xs text-[var(--text-muted)]">Cliente</Label>
                <div className="mt-1">
                  <SearchSelect
                    value={form.customer_id}
                    onChange={v => setForm(f => ({ ...f, customer_id: v, project_id: '' }))}
                    options={customers}
                    placeholder="Todos os clientes"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-[var(--text-muted)]">Projeto *</Label>
                <div className="mt-1">
                  <SearchSelect
                    value={form.project_id}
                    onChange={v => setForm(f => ({ ...f, project_id: v, real_project_id: '' }))}
                    options={projects}
                    placeholder="Selecione o projeto..."
                  />
                </div>
              </div>

              {/* Projeto Real — só para projetos de INVESTIMENTO (despesa contabiliza no investimento). */}
              {(() => {
                const sel = (projects as any[]).find(p => String(p.id) === form.project_id)
                if (!sel?.is_investimento_comercial || isErpservCustomer) return null
                const soSustentacao = sel?.categoria_interna === 'Suporte'
                const realOpts = (projects as any[]).filter(p => {
                  if (p.is_investimento_comercial || String(p.id) === form.project_id) return false
                  if (soSustentacao && p.service_type?.code !== 'sustentacao') return false
                  return true
                })
                return (
                  <div>
                    <Label className="text-xs text-[var(--text-muted)]">Projeto Real *{soSustentacao ? ' (Sustentação)' : ''}</Label>
                    <div className="mt-1">
                      <SearchSelect
                        value={form.real_project_id}
                        onChange={v => setForm(f => ({ ...f, real_project_id: v }))}
                        options={realOpts}
                        placeholder="Selecione o projeto real..."
                      />
                    </div>
                  </div>
                )
              })()}
              <div>
                <Label className="text-xs text-[var(--text-muted)]">Categoria *</Label>
                <div className="mt-1">
                  <SearchSelect
                    value={form.expense_category_id}
                    onChange={v => setForm(f => ({ ...f, expense_category_id: v }))}
                    options={categories.map(c => ({ id: c.id, name: c.parent_id ? `└ ${c.name}` : c.name }))}
                    placeholder="Selecione a categoria..."
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">Data *</Label>
                  <Input type="date" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
                    className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-white h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">Valor *</Label>
                  <Input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-white h-9 text-xs" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-[var(--text-muted)]">Descrição *</Label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-white h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-[var(--text-muted)]">Comprovante</Label>
                <div className="mt-1 flex items-center gap-2">
                  <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-hover)] border border-[var(--border)] rounded-md text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors">
                    <Paperclip size={12} /> {receipt ? receipt.name : 'Selecionar arquivo'}
                  </button>
                  {receipt && <button onClick={() => setReceipt(null)} className="text-[var(--text-light)] hover:text-[var(--text)]"><X size={12} /></button>}
                </div>
                <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setReceipt(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <UIButton variant="outline" onClick={() => setModal({ open: false })} className="h-8 text-xs border-[var(--border)] text-[var(--text)]">Cancelar</UIButton>
              <UIButton onClick={save} disabled={saving || !form.project_id || !form.expense_category_id || !form.expense_date || !form.amount || !form.description}
                className="h-8 text-xs bg-[var(--primary)] hover:bg-[var(--primary)] text-white">
                {saving ? 'Salvando...' : 'Salvar'}
              </UIButton>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Modal: Visualizar Despesa */}
      <ExpenseHoverTooltip exp={expHover.exp} />

      {viewItem && (
        <ExpenseViewModal
          expense={viewItem}
          onClose={() => setViewItem(null)}
          onEdit={['pending', 'rejected', 'adjustment_requested'].includes(viewItem.status)
            ? () => { setViewItem(null); openEdit(viewItem) }
            : undefined}
        />
      )}

      <ConfirmDeleteModal
        open={deleteConfirm.open}
        message="Deseja excluir esta despesa? Esta ação não pode ser desfeita."
        onClose={() => setDeleteConfirm({ open: false })}
        onConfirm={confirmDelete}
      />

      {paidBlockModal.open && (
        <ModalOverlay onClose={() => setPaidBlockModal({ open: false })}>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-950 flex items-center justify-center">
                <AlertTriangle size={18} className="text-[var(--warning)]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Pagamento não permitido</h3>
                <p className="text-xs text-[var(--text-light)] mt-0.5">Despesa pendente de aprovação</p>
              </div>
            </div>
            <p className="text-sm text-[var(--text)] mb-2">
              Esta despesa ainda não foi aprovada e <strong className="text-white">não pode ser marcada como paga</strong>.
            </p>
            <p className="text-sm text-[var(--text-light)] mb-6">
              O pagamento só pode ser registrado após a aprovação pelo gestor responsável. Solicite a aprovação antes de efetuar o pagamento.
            </p>
            {paidBlockModal.expense && (
              <div className="rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] px-4 py-3 text-xs text-[var(--text-muted)] space-y-1 mb-6">
                <div><span className="text-[var(--text-light)]">Descrição:</span> {paidBlockModal.expense.description}</div>
                <div><span className="text-[var(--text-light)]">Status atual:</span> {paidBlockModal.expense.status_display}</div>
                <div><span className="text-[var(--text-light)]">Valor:</span> {paidBlockModal.expense.formatted_amount}</div>
              </div>
            )}
            <button
              onClick={() => setPaidBlockModal({ open: false })}
              className="w-full py-2 rounded-lg bg-[var(--surface-hover)] hover:bg-[var(--surface-hover)] text-sm text-[var(--text)] transition-colors"
            >
              Entendi
            </button>
          </div>
        </ModalOverlay>
      )}
      {/* ── Modal Estornar Aprovação ── */}
      {revertTarget && (
        <ModalOverlay onClose={() => setRevertTarget(null)}>
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(249,115,22,0.12)' }}>
                <Undo2 size={16} color="#F97316" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Estornar Aprovação</h3>
                <p className="text-xs text-[var(--text-light)]">
                  Despesa #{revertTarget.id} · {revertTarget.formatted_amount}
                </p>
              </div>
            </div>
            <div className="rounded-xl p-3 text-sm" style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)' }}>
              <p style={{ color: '#F97316' }}>
                Esta ação irá reverter a aprovação, retornando a despesa ao status <strong>pendente</strong>.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setRevertTarget(null)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-[var(--surface-hover)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={submitRevert}
                disabled={reverting}
                className="flex-1 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'rgba(249,115,22,0.15)', color: '#F97316', border: '1px solid rgba(249,115,22,0.3)' }}
              >
                {reverting
                  ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : <><Undo2 size={13} /> Confirmar Estorno</>
                }
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

    </div>
  )
}
