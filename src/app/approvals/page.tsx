'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  CheckSquare, Clock, Receipt, ChevronLeft, ChevronRight,
  Check, XCircle, X, Filter, ChevronDown, Eye, Pencil, RotateCcw,
  Paperclip, Download,
} from 'lucide-react'
import { RowMenu } from '@/components/ui/row-menu'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { api, ApiError, toRelativePath } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TSItem {
  id: number
  date: string
  start_time?: string | null
  end_time?: string | null
  created_at?: string
  user?: { id: number; name: string }
  project?: { id: number; name: string; customer?: { id: number; name: string }; contract_type_display?: string }
  effort_minutes: number
  observation?: string
  ticket?: string
  ticket_subject?: string
  ticket_solicitante?: { id?: number; name?: string } | null
  origin?: string
  is_billable_only?: boolean
  is_internal_action?: boolean
  status: string
  status_display?: string
  attachment_url?: string
  consultant_extra_pct?: number | null
  client_extra_pct?: number | null
}

interface ExpItem {
  id: number
  expense_date: string
  created_at?: string
  user?: { id: number; name: string }
  project?: { id: number; name: string; customer?: { id: number; name: string } }
  category?: { id: number; name: string }
  amount: number
  description: string
  expense_type?: string
  payment_method?: string
  charge_client: boolean
  receipt_url?: string
  status: string
}

interface Pagination {
  current_page: number
  last_page: number
  total: number
  per_page: number
  from?: number
  to?: number
}

interface UserOption    { id: number; name: string }
interface ProjectOption { id: number; name: string }
interface CustomerOption{ id: number; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | null | undefined) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function fmtDateTime(d: string | null | undefined) {
  if (!d) return '—'
  const dt = new Date(d)
  const day  = String(dt.getDate()).padStart(2, '0')
  const mon  = String(dt.getMonth() + 1).padStart(2, '0')
  const year = dt.getFullYear()
  const h    = String(dt.getHours()).padStart(2, '0')
  const min  = String(dt.getMinutes()).padStart(2, '0')
  return `${day}/${mon}/${year} ${h}:${min}`
}

function fmtMin(minutes: number) {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}

function fmtBRL(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
}

// ─── SearchableSelect ─────────────────────────────────────────────────────────

interface SelectOption { id: number | string; name: string }

function SearchableSelect({
  value, onChange, options, placeholder = 'Todos', label,
}: {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
  label: string
}) {
  const [open,    setOpen]    = useState(false)
  const [search,  setSearch]  = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() =>
    options.filter(o => o.name.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  )

  const selected = options.find(o => String(o.id) === value)

  // Fecha ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (id: string) => {
    onChange(id); setOpen(false); setSearch('')
  }

  return (
    <div ref={ref} className="relative">
      <Label className="text-[11px] text-zinc-500 mb-1 block">{label}</Label>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch('') }}
        className="w-full h-8 flex items-center justify-between gap-1 px-2 text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-md outline-none hover:border-zinc-500 transition-colors">
        <span className={`truncate ${!selected ? 'text-zinc-500' : ''}`}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown size={11} className={`shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[180px] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
          {/* Campo de busca */}
          <div className="p-1.5 border-b border-zinc-800">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full h-7 px-2 text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 rounded outline-none placeholder:text-zinc-600 focus:border-zinc-500"
            />
          </div>
          {/* Opções */}
          <div className="max-h-48 overflow-y-auto py-0.5">
            <button type="button" onClick={() => select('')}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${
                !value ? 'bg-blue-600/20 text-blue-300' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}>
              {!value && <Check size={10} className="shrink-0" />}
              <span className={!value ? '' : 'ml-[14px]'}>{placeholder}</span>
            </button>
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-[11px] text-zinc-600 italic">Nenhum resultado</p>
            )}
            {filtered.map(o => (
              <button key={o.id} type="button" onClick={() => select(String(o.id))}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${
                  String(o.id) === value ? 'bg-blue-600/20 text-blue-300' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                }`}>
                {String(o.id) === value && <Check size={10} className="shrink-0" />}
                <span className={String(o.id) === value ? '' : 'ml-[14px]'}>{o.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── OriginLabel / TsStatusBadge ─────────────────────────────────────────────

function OriginLabel({ origin, isInternalAction, isBillableOnly }: {
  origin?: string
  isInternalAction?: boolean
  isBillableOnly?: boolean
}) {
  if (isInternalAction) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">Ação Interna</span>
  if (isBillableOnly)   return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-700/30 text-amber-400">Apenas Fatura</span>
  const labels: Record<string, string> = { manual: 'Manual', webhook: 'Webhook', integration: 'Integração', import: 'Importação' }
  return <span className="text-[10px] text-zinc-500">{labels[origin ?? ''] ?? (origin || '—')}</span>
}

function TsStatusBadge({ status, display }: { status: string; display?: string }) {
  const colors: Record<string, string> = {
    pending:              'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    approved:             'bg-green-500/15  text-green-400  border-green-500/20',
    rejected:             'bg-red-500/15    text-red-400    border-red-500/20',
    adjustment_requested: 'bg-blue-500/15   text-blue-400   border-blue-500/20',
    conflicted:           'bg-purple-500/15 text-purple-400 border-purple-500/20',
    internal:             'bg-slate-500/15  text-slate-400  border-slate-500/20',
    released:             'bg-cyan-500/15   text-cyan-400   border-cyan-500/20',
  }
  const labels: Record<string, string> = {
    pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado',
    adjustment_requested: 'Ajuste', conflicted: 'Conflito', internal: 'Ação Interna', released: 'Liberado',
  }
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${colors[status] ?? 'bg-zinc-700/30 text-zinc-400 border-zinc-600/20'}`}>
      {display ?? labels[status] ?? status}
    </span>
  )
}

// ─── StatusPills ──────────────────────────────────────────────────────────────

const TS_STATUS_OPTS = [
  { value: '',                     label: 'Todos' },
  { value: 'pending',              label: 'Pendente' },
  { value: 'approved',             label: 'Aprovado' },
  { value: 'rejected',             label: 'Rejeitado' },
  { value: 'adjustment_requested', label: 'Ajuste' },
  { value: 'conflicted',           label: 'Conflito' },
]

const EXP_STATUS_OPTS = [
  { value: '',                     label: 'Todos' },
  { value: 'pending',              label: 'Pendente' },
  { value: 'approved',             label: 'Aprovado' },
  { value: 'rejected',             label: 'Rejeitado' },
  { value: 'adjustment_requested', label: 'Ajuste' },
]

function StatusPills({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex items-center gap-0.5 bg-zinc-800/70 border border-zinc-700/50 rounded-full p-1 flex-wrap">
      {options.map(opt => (
        <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
            value === opt.value
              ? 'bg-cyan-400 text-zinc-900 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}>
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Modal: visualizar apontamento ───────────────────────────────────────────

function TsViewModal({ item, onClose }: { item: TSItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">Apontamento</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={15} /></button>
        </div>
        <div className="px-5 py-4 space-y-3 text-xs">
          <Row label="Colaborador"  value={item.user?.name} />
          <Row label="Data"         value={fmt(item.date)} />
          <Row label="Cliente"      value={item.project?.customer?.name} />
          <Row label="Projeto"      value={item.project?.name} />
          <Row label="Tempo" value={fmtMin(item.effort_minutes)} />
          {item.consultant_extra_pct ? (() => {
            const extraMin = Math.round(item.effort_minutes * (Number(item.consultant_extra_pct) / 100))
            const totalMin = item.effort_minutes + extraMin
            return (
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-zinc-500">% extra cons</span>
                <span style={{ color: '#22C55E' }}>+{Number(item.consultant_extra_pct)}% = {fmtMin(totalMin)}</span>
              </div>
            )
          })() : null}
          {item.ticket && <Row label="Ticket" value={`#${item.ticket}`} />}
          {item.observation && (
            <div>
              <span className="text-zinc-500 block mb-1">Descrição</span>
              <p className="text-zinc-200 bg-zinc-800 rounded-lg p-3 leading-relaxed">{item.observation}</p>
            </div>
          )}
          <div>
            <span className="text-zinc-500 block mb-1">Anexo</span>
            {item.attachment_url
              ? <ReceiptLink url={item.attachment_url} />
              : <span className="text-zinc-600">Sem anexo</span>
            }
          </div>
        </div>
        <div className="px-5 py-3 border-t border-zinc-800 flex justify-end">
          <Button variant="outline" onClick={onClose} className="h-8 text-xs border-zinc-700 text-zinc-300">Fechar</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Receipt helpers ──────────────────────────────────────────────────────────

async function fetchReceipt(url: string): Promise<{ blobUrl: string; filename: string }> {
  const token = localStorage.getItem('minutor_token')
  const res = await fetch(toRelativePath(url), { headers: { Authorization: `Bearer ${token ?? ''}` } })
  if (!res.ok) throw new Error('not_found')
  const blob = await res.blob()
  const cd = res.headers.get('content-disposition') ?? ''
  const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
  const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'pdf'
  const filename = match?.[1]?.replace(/['"]/g, '') ?? `comprovante.${ext}`
  return { blobUrl: URL.createObjectURL(blob), filename }
}

function triggerAnchor(href: string, download?: string) {
  const a = document.createElement('a')
  a.href = href
  if (download) { a.download = download } else { a.target = '_blank'; a.rel = 'noopener noreferrer' }
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(href), 60000)
}

function ReceiptLink({ url }: { url: string }) {
  const [loading, setLoading] = useState(false)

  const handle = async (download: boolean) => {
    setLoading(true)
    try {
      const { blobUrl, filename } = await fetchReceipt(url)
      triggerAnchor(blobUrl, download ? filename : undefined)
    } catch { toast.error(download ? 'Erro ao baixar comprovante' : 'Erro ao abrir comprovante') }
    finally { setLoading(false) }
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={() => handle(false)} disabled={loading}
        className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs disabled:opacity-50">
        <Eye size={11} /> {loading ? 'Carregando...' : 'Visualizar'}
      </button>
      <button onClick={() => handle(true)} disabled={loading}
        className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 text-xs disabled:opacity-50">
        <Download size={11} /> Baixar
      </button>
    </div>
  )
}

async function openReceiptUrl(url: string) {
  try {
    const { blobUrl } = await fetchReceipt(url)
    triggerAnchor(blobUrl)
  } catch { toast.error('Erro ao abrir comprovante') }
}

// ─── Modal: visualizar / aprovar despesa ─────────────────────────────────────

function ExpApproveModal({
  item, onClose, onApprove, onReject, onRequestAdjustment, approving,
}: {
  item: ExpItem
  onClose: () => void
  onApprove: (chargeClient: boolean) => void
  onReject: () => void
  onRequestAdjustment: (reason: string) => void
  approving: boolean
}) {
  const [chargeClient, setChargeClient] = useState<boolean | null>(null)
  const [submitted,    setSubmitted]    = useState(false)
  const [mode,         setMode]         = useState<'approve' | 'adjust'>('approve')
  const [adjReason,    setAdjReason]    = useState('')
  const [adjSubmitted, setAdjSubmitted] = useState(false)

  const handleApprove = () => {
    setSubmitted(true)
    if (chargeClient === null) return
    onApprove(chargeClient)
  }

  const handleAdjustment = () => {
    setAdjSubmitted(true)
    if (!adjReason.trim()) return
    onRequestAdjustment(adjReason.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">Aprovação de Despesa</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={15} /></button>
        </div>

        <div className="px-5 py-4 space-y-3 text-xs">
          <Row label="Colaborador"  value={item.user?.name} />
          <Row label="Data"         value={fmt(item.expense_date)} />
          <Row label="Cliente"      value={item.project?.customer?.name} />
          <Row label="Projeto"      value={item.project?.name} />
          <Row label="Categoria"    value={item.category?.name} />
          <Row label="Valor"        value={fmtBRL(parseFloat(String(item.amount)) || 0)} highlight />
          <div>
            <span className="text-zinc-500 block mb-1">Descrição</span>
            <p className="text-zinc-200 bg-zinc-800 rounded-lg p-3 leading-relaxed">{item.description || '—'}</p>
          </div>
          {item.receipt_url && <ReceiptLink url={item.receipt_url} />}

          {mode === 'approve' && (
            <div className="pt-2 border-t border-zinc-800">
              <Label className={`text-xs mb-2 block font-semibold ${submitted && chargeClient === null ? 'text-red-400' : 'text-zinc-300'}`}>
                Cobrar do cliente? *
              </Label>
              <div className="flex gap-3">
                <button type="button" onClick={() => setChargeClient(true)}
                  className={`flex-1 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                    chargeClient === true ? 'bg-green-600/20 border-green-500 text-green-300' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                  }`}>
                  Sim — cobrar do cliente
                </button>
                <button type="button" onClick={() => setChargeClient(false)}
                  className={`flex-1 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                    chargeClient === false ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                  }`}>
                  Não — absorver internamente
                </button>
              </div>
              {submitted && chargeClient === null && (
                <p className="text-red-400 text-[11px] mt-1.5">Selecione uma opção antes de aprovar</p>
              )}
            </div>
          )}

          {mode === 'adjust' && (
            <div className="pt-2 border-t border-zinc-800">
              <Label className={`text-xs mb-2 block font-semibold ${adjSubmitted && !adjReason.trim() ? 'text-red-400' : 'text-blue-300'}`}>
                O que precisa ser ajustado? *
              </Label>
              <textarea
                autoFocus
                value={adjReason}
                onChange={e => setAdjReason(e.target.value)}
                placeholder="Descreva o que o colaborador deve corrigir..."
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 resize-none placeholder:text-zinc-600"
              />
              {adjSubmitted && !adjReason.trim() && (
                <p className="text-red-400 text-[11px] mt-1">Informe o motivo do ajuste</p>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-zinc-800 flex gap-2 justify-end flex-wrap">
          {mode === 'approve' ? (
            <>
              <Button variant="outline" onClick={onReject} disabled={approving}
                className="h-8 text-xs border-red-700/50 text-red-400 hover:bg-red-400/10">
                <XCircle size={12} className="mr-1" /> Rejeitar
              </Button>
              <Button variant="outline" onClick={() => setMode('adjust')} disabled={approving}
                className="h-8 text-xs border-blue-700/50 text-blue-400 hover:bg-blue-400/10">
                Solicitar Ajuste
              </Button>
              <Button variant="outline" onClick={onClose} disabled={approving}
                className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={handleApprove} disabled={approving}
                className="h-8 text-xs bg-green-600 hover:bg-green-500 text-white">
                <Check size={12} className="mr-1" />
                {approving ? 'Aprovando...' : 'Aprovar'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => { setMode('approve'); setAdjReason(''); setAdjSubmitted(false) }} disabled={approving}
                className="h-8 text-xs border-zinc-700 text-zinc-300">Voltar</Button>
              <Button onClick={handleAdjustment} disabled={approving}
                className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white">
                {approving ? 'Enviando...' : 'Enviar Solicitação'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value?: string | null; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className={`text-right font-medium ${highlight ? 'text-cyan-400' : 'text-zinc-200'}`}>{value || '—'}</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const { user } = useAuth()
  const isCoordenador = user?.type === 'coordenador'

  const { filters: flt, set: setFilter, clear: clearPersistedFilters } = usePersistedFilters(
    'approvals',
    user?.id,
    {
      tab:          'timesheets' as 'timesheets' | 'expenses',
      dateFrom:     '',
      dateTo:       '',
      refMonth:     null as number | null,
      refYear:      null as number | null,
      filterMode:   'month' as 'month' | 'period',
      userId:       '',
      coordinatorId: '',
      executiveId:  '',
      projectId:    '',
      customerId:   '',
    },
  )
  const { tab, dateFrom, dateTo, refMonth, refYear, filterMode, userId, coordinatorId, executiveId, projectId, customerId } = flt
  const setTab          = (v: 'timesheets' | 'expenses') => setFilter('tab', v)
  const setDateFrom     = (v: string)                    => setFilter('dateFrom', v)
  const setDateTo       = (v: string)                    => setFilter('dateTo', v)
  const setRefMonth     = (v: number | null)             => setFilter('refMonth', v)
  const setRefYear      = (v: number | null)             => setFilter('refYear', v)
  const setFilterMode   = (v: 'month' | 'period')        => setFilter('filterMode', v)
  const setUserId       = (v: string)                    => setFilter('userId', v)
  const setCoordinatorId= (v: string)                    => setFilter('coordinatorId', v)
  const setExecutiveId  = (v: string)                    => setFilter('executiveId', v)
  const setProjectId    = (v: string)                    => setFilter('projectId', v)
  const setCustomerId   = (v: string)                    => setFilter('customerId', v)

  const tsStatus  = 'pending'
  const expStatus = 'pending'
  const [showFilters,   setShowFilters]   = useState(true)

  // Support data
  const [users,        setUsers]        = useState<UserOption[]>([])
  const [coordinators, setCoordinators] = useState<UserOption[]>([])
  const [executives,   setExecutives]   = useState<UserOption[]>([])
  const [projects,     setProjects]     = useState<ProjectOption[]>([])
  const [customers,    setCustomers]    = useState<CustomerOption[]>([])

  // List state
  const [tsItems,    setTsItems]    = useState<TSItem[]>([])
  const [expItems,   setExpItems]   = useState<ExpItem[]>([])
  const [tsPag,      setTsPag]      = useState<Pagination | null>(null)
  const [expPag,     setExpPag]     = useState<Pagination | null>(null)
  const [tsLoading,  setTsLoading]  = useState(true)
  const [expLoading, setExpLoading] = useState(true)
  const [tsPage,     setTsPage]     = useState(1)
  const [expPage,    setExpPage]    = useState(1)

  // Selection & actions (only timesheets use bulk)
  const [selected,     setSelected]     = useState<number[]>([])
  const [approving,    setApproving]    = useState(false)
  const [actioning,    setActioning]    = useState<number | null>(null)
  const [rejectModal,  setRejectModal]  = useState<{ open: boolean; ids: number[] }>({ open: false, ids: [] })
  const [rejectReason, setRejectReason] = useState('')
  const [adjModal,     setAdjModal]     = useState<{ open: boolean; id: number | null; type: 'timesheet' | 'expense' }>({ open: false, id: null, type: 'expense' })
  const [adjReason,    setAdjReason]    = useState('')
  const [bulkAdjOpen,  setBulkAdjOpen]  = useState(false)
  const [bulkAdjReason, setBulkAdjReason] = useState('')
  const [bulkAdjLoading, setBulkAdjLoading] = useState(false)
  const [adjLoading,   setAdjLoading]   = useState(false)

  // View / approve-expense modals
  const [tsView,       setTsView]       = useState<TSItem | null>(null)
  const [expApprove,   setExpApprove]   = useState<ExpItem | null>(null)

  // Load support data
  useEffect(() => {
    api.get<any>('/users?pageSize=100').then(r => {
      const l = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setUsers(l.map((u: any) => ({ id: u.id, name: u.name })))
    }).catch(() => {})
    api.get<any>('/users?pageSize=100&role=coordenador').then(r => {
      const l = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setCoordinators(l.map((u: any) => ({ id: u.id, name: u.name })))
    }).catch(() => {})
    api.get<any>('/users?pageSize=100&is_executive=true').then(r => {
      const l = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setExecutives(l.map((u: any) => ({ id: u.id, name: u.name })))
    }).catch(() => {})
    api.get<any>('/projects?minimal=true&pageSize=200&status=active').then(r => {
      const l = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setProjects(l.map((p: any) => ({ id: p.id, name: p.name })))
    }).catch(() => {})
    api.get<any>('/customers?pageSize=500').then(r => {
      const l = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setCustomers(l.map((c: any) => ({ id: c.id, name: c.name })))
    }).catch(() => {})
  }, [])

  const filterParams = useMemo(() => {
    const p = new URLSearchParams()
    if (dateFrom)      p.set('date_from',      dateFrom)
    if (dateTo)        p.set('date_to',        dateTo)
    if (userId)        p.set('user_id',        userId)
    if (coordinatorId) p.set('coordinator_id', coordinatorId)
    if (executiveId)   p.set('executive_id',   executiveId)
    if (projectId)     p.set('project_id',     projectId)
    if (customerId)    p.set('customer_id',    customerId)
    return p.toString()
  }, [dateFrom, dateTo, userId, coordinatorId, executiveId, projectId, customerId])

  const loadTs = useCallback(async () => {
    setTsLoading(true)
    try {
      const p = new URLSearchParams(filterParams)
      p.set('page', String(tsPage)); p.set('per_page', '100')
      if (tsStatus) p.set('status', tsStatus)
      const r = await api.get<any>(`/approvals/timesheets?${p}`)
      setTsItems(Array.isArray(r?.data) ? r.data : [])
      setTsPag(r?.pagination ?? null)
    } catch { toast.error('Erro ao carregar apontamentos') }
    finally { setTsLoading(false) }
  }, [tsPage, filterParams, tsStatus])

  const loadExp = useCallback(async () => {
    setExpLoading(true)
    try {
      const p = new URLSearchParams(filterParams)
      p.set('page', String(expPage)); p.set('per_page', '100')
      if (expStatus) p.set('status', expStatus)
      const r = await api.get<any>(`/approvals/expenses?${p}`)
      setExpItems(Array.isArray(r?.data) ? r.data : [])
      setExpPag(r?.pagination ?? null)
    } catch { toast.error('Erro ao carregar despesas') }
    finally { setExpLoading(false) }
  }, [expPage, filterParams, expStatus])

  useEffect(() => { loadTs() },  [loadTs])
  useEffect(() => { loadExp() }, [loadExp])
  useEffect(() => { setTsPage(1); setExpPage(1); setSelected([]) }, [filterParams])

  const clearFilters = () => {
    clearPersistedFilters()
  }
  const hasFilters = !!(dateFrom || dateTo || userId || coordinatorId || executiveId || projectId || customerId)

  // Timesheets: bulk allowed
  const currentItems   = tab === 'timesheets' ? tsItems   : expItems
  const currentLoading = tab === 'timesheets' ? tsLoading : expLoading
  const currentPag     = tab === 'timesheets' ? tsPag     : expPag

  const allSelected = currentItems.length > 0 && currentItems.every(i => selected.includes(i.id))
  const toggleAll   = () => {
    if (allSelected) setSelected(s => s.filter(id => !currentItems.find(i => i.id === id)))
    else setSelected(s => [...new Set([...s, ...currentItems.map(i => i.id)])])
  }
  const toggleOne = (id: number) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  // Approve timesheet (direct)
  const approveTs = async (id: number) => {
    setActioning(id)
    try {
      await api.post(`/timesheets/${id}/approve`, {})
      toast.success('Apontamento aprovado')
      loadTs()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao aprovar') }
    finally { setActioning(null) }
  }

  // Approve expense (via modal with charge_client)
  const approveExp = async (chargeClient: boolean) => {
    if (!expApprove) return
    setApproving(true)
    try {
      await api.post(`/expenses/${expApprove.id}/approve`, { charge_client: chargeClient })
      toast.success('Despesa aprovada')
      setExpApprove(null)
      loadExp()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao aprovar') }
    finally { setApproving(false) }
  }

  // Request adjustment on expense (from modal)
  const requestAdjustmentExp = async (reason: string) => {
    if (!expApprove) return
    setApproving(true)
    try {
      await api.post(`/expenses/${expApprove.id}/request-adjustment`, { reason })
      toast.success('Ajuste solicitado ao colaborador')
      setExpApprove(null)
      loadExp()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao solicitar ajuste') }
    finally { setApproving(false) }
  }

  // Request adjustment (from row button) — works for both timesheets and expenses
  const handleAdjustment = async () => {
    if (!adjModal.id || !adjReason.trim()) return
    setAdjLoading(true)
    try {
      const endpoint = adjModal.type === 'timesheet'
        ? `/timesheets/${adjModal.id}/request-adjustment`
        : `/expenses/${adjModal.id}/request-adjustment`
      await api.post(endpoint, { reason: adjReason.trim() })
      toast.success('Ajuste solicitado ao colaborador')
      setAdjModal({ open: false, id: null, type: 'expense' }); setAdjReason('')
      if (adjModal.type === 'timesheet') loadTs(); else loadExp()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao solicitar ajuste') }
    finally { setAdjLoading(false) }
  }

  // Bulk approve timesheets only
  const bulkApproveTs = async () => {
    if (!selected.length) return
    setApproving(true)
    try {
      await api.post('/approvals/timesheets/bulk-approve', { timesheet_ids: selected })
      toast.success(`${selected.length} apontamento(s) aprovado(s)`)
      setSelected([])
      loadTs()
    } catch { toast.error('Erro ao aprovar em lote') }
    finally { setApproving(false) }
  }

  // Bulk request adjustment
  const bulkAdjTs = async () => {
    if (!selected.length || !bulkAdjReason.trim()) return
    setBulkAdjLoading(true)
    try {
      await Promise.all(selected.map(id =>
        api.post(`/timesheets/${id}/request-adjustment`, { reason: bulkAdjReason.trim() })
      ))
      toast.success(`Ajuste solicitado para ${selected.length} apontamento(s)`)
      setBulkAdjOpen(false); setBulkAdjReason('')
      setSelected([])
      loadTs()
    } catch { toast.error('Erro ao solicitar ajuste em lote') }
    finally { setBulkAdjLoading(false) }
  }

  // Reject
  const handleReject = async () => {
    if (!rejectModal.ids.length) return
    if (!rejectReason.trim()) { toast.error('Informe o motivo da rejeição'); return }
    setApproving(true)
    try {
      if (tab === 'timesheets') {
        if (rejectModal.ids.length === 1)
          await api.post(`/timesheets/${rejectModal.ids[0]}/reject`, { reason: rejectReason })
        else
          await api.post('/approvals/timesheets/bulk-reject', { timesheet_ids: rejectModal.ids, reason: rejectReason })
        toast.success(`${rejectModal.ids.length} apontamento(s) rejeitado(s)`)
        loadTs()
      } else {
        await api.post(`/expenses/${rejectModal.ids[0]}/reject`, { reason: rejectReason })
        toast.success('Despesa rejeitada')
        setExpApprove(null)
        loadExp()
      }
      setSelected([])
      setRejectModal({ open: false, ids: [] })
      setRejectReason('')
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao rejeitar') }
    finally { setApproving(false) }
  }

  const handleTabChange = (t: 'timesheets' | 'expenses') => {
    setTab(t); setSelected([])
  }

  return (
    <AppLayout title="Aprovações">

      {/* ── Tabs ── */}
      <div className="flex items-center gap-2 mb-5">
        {([
          { id: 'timesheets' as const, icon: Clock,   label: 'Apontamentos', count: tsPag?.total  ?? 0 },
          { id: 'expenses'   as const, icon: Receipt, label: 'Despesas',     count: expPag?.total ?? 0 },
        ]).map(({ id, icon: Icon, label, count }) => {
          const active = tab === id
          return (
            <button key={id} onClick={() => handleTabChange(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                active
                  ? 'bg-cyan-400 border-cyan-400 text-zinc-900'
                  : 'bg-transparent border-cyan-500/40 text-cyan-400 hover:border-cyan-400'
              }`}>
              <Icon size={14} />
              {label}
              {count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold ${
                  active ? 'bg-zinc-900/30 text-zinc-900' : 'bg-cyan-400/20 text-cyan-300'
                }`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Filters ── */}
      <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900">
        <button onClick={() => setShowFilters(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
          <div className="flex items-center gap-2">
            <Filter size={13} />
            <span className="font-medium">Filtros</span>
            {hasFilters && (
              <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full px-2 py-0.5 text-[10px]">ativos</span>
            )}
          </div>
          <ChevronDown size={13} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        {showFilters && (
          <div className="border-t border-zinc-800 px-4 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              <div className="flex items-end gap-2 col-span-2">
                <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs self-end mb-0.5">
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
                      if (m === 0) { setRefMonth(null); setRefYear(null); setDateFrom(''); setDateTo('') }
                      else {
                        const mm = String(m).padStart(2, '0')
                        const last = new Date(y, m, 0).getDate()
                        setRefMonth(m); setRefYear(y)
                        setDateFrom(`${y}-${mm}-01`); setDateTo(`${y}-${mm}-${String(last).padStart(2, '0')}`)
                      }
                    }}
                  />
                ) : (
                  <DateRangePicker
                    from={dateFrom}
                    to={dateTo}
                    onChange={(f, t) => { setDateFrom(f); setDateTo(t); setRefMonth(null); setRefYear(null) }}
                  />
                )}
              </div>
              <SearchableSelect
                label="Colaborador"
                value={userId}
                onChange={setUserId}
                options={users}
              />
              {!isCoordenador && (
              <SearchableSelect
                label="Coordenador"
                value={coordinatorId}
                onChange={setCoordinatorId}
                options={coordinators}
              />
              )}
              <SearchableSelect
                label="Executivo"
                value={executiveId}
                onChange={setExecutiveId}
                options={executives}
              />
              <SearchableSelect
                label="Cliente"
                value={customerId}
                onChange={v => { setCustomerId(v); setProjectId('') }}
                options={customers}
              />
              <SearchableSelect
                label="Projeto"
                value={projectId}
                onChange={setProjectId}
                options={projects}
              />
            </div>
            {hasFilters && (
              <button onClick={clearFilters}
                className="mt-3 text-[11px] text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1">
                <X size={11} /> Limpar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Bulk action bar (apontamentos only) ── */}
      {tab === 'timesheets' && selected.length > 0 && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600/10 border border-blue-500/20">
          <span className="text-xs text-blue-300 flex-1">{selected.length} apontamento(s) selecionado(s)</span>
          <button onClick={bulkApproveTs} disabled={approving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 transition-colors">
            <Check size={12} />{approving ? 'Aprovando...' : 'Aprovar todos'}
          </button>
          <button onClick={() => { setBulkAdjOpen(true); setBulkAdjReason('') }} disabled={approving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 transition-colors">
            <RotateCcw size={12} /> Solicitar Ajuste
          </button>
          <button onClick={() => { setRejectModal({ open: true, ids: selected }); setRejectReason('') }} disabled={approving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 transition-colors">
            <XCircle size={12} /> Rejeitar todos
          </button>
          <button onClick={() => setSelected([])} className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900">
              <th className="px-3 py-2.5 w-10"></th>
              {tab === 'timesheets' && (
                <th className="px-3 py-2.5 w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="rounded border-zinc-600 bg-zinc-800 accent-blue-500" />
                </th>
              )}
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Data</th>
              {tab === 'timesheets' && <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden md:table-cell">Início</th>}
              {tab === 'timesheets' && <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden md:table-cell">Fim</th>}
              {tab === 'timesheets' && <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden lg:table-cell">Ticket #</th>}
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden sm:table-cell">Gravação</th>
              {tab === 'timesheets' && <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden sm:table-cell">Origem</th>}
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Colaborador</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden md:table-cell">Cliente</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden lg:table-cell">Projeto</th>
              {tab === 'timesheets' && <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden lg:table-cell">Título</th>}
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden lg:table-cell">Descrição</th>
              {tab === 'timesheets' && <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden xl:table-cell">Solicitante</th>}
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden xl:table-cell">Tipo de Serviço</th>
              {tab === 'timesheets' && <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden xl:table-cell">Contrato</th>}
              <th className="text-right px-3 py-2.5 text-zinc-500 font-medium">
                {tab === 'timesheets' ? 'Tempo' : 'Valor'}
              </th>
              {tab === 'timesheets' && <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden xl:table-cell">Status</th>}
            </tr>
          </thead>
          <tbody>
            {/* Loading */}
            {currentLoading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-zinc-800/60">
                {tab === 'timesheets' && <td className="px-3 py-2.5"><Skeleton className="h-3 w-3" /></td>}
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-20" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-28" /></td>
                <td className="px-3 py-2.5 hidden sm:table-cell"><Skeleton className="h-3 w-24" /></td>
                <td className="px-3 py-2.5 hidden md:table-cell"><Skeleton className="h-3 w-32" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-14 ml-auto" /></td>
                <td className="px-3 py-2.5"><Skeleton className="h-3 w-16 ml-auto" /></td>
              </tr>
            ))}

            {/* Empty */}
            {!currentLoading && currentItems.length === 0 && (
              <tr>
                <td colSpan={20} className="px-3 py-16 text-center text-zinc-500">
                  <CheckSquare size={28} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Nenhum item pendente de aprovação</p>
                  {hasFilters && (
                    <button onClick={clearFilters} className="mt-2 text-xs text-blue-400 hover:text-blue-300">
                      Limpar filtros
                    </button>
                  )}
                </td>
              </tr>
            )}

            {/* Timesheets rows */}
            {!currentLoading && tab === 'timesheets' && tsItems.map(ts => (
              <tr key={ts.id} onClick={() => toggleOne(ts.id)}
                className={`border-b border-zinc-800/60 cursor-pointer transition-colors ${
                  selected.includes(ts.id) ? 'bg-blue-950/30' : 'hover:bg-zinc-800/40'
                }`}>
                <td className="px-2 py-2.5 w-10" onClick={e => e.stopPropagation()}>
                  <RowMenu items={[
                    { label: 'Visualizar', icon: <Eye size={12} />, onClick: () => setTsView(ts) },
                    { label: 'Aprovar', icon: <Check size={12} />, onClick: () => approveTs(ts.id), disabled: actioning === ts.id },
                    { label: 'Solicitar Ajuste', icon: <RotateCcw size={12} />, onClick: () => { setAdjModal({ open: true, id: ts.id, type: 'timesheet' }); setAdjReason('') } },
                    { label: 'Rejeitar', icon: <XCircle size={12} />, onClick: () => { setRejectModal({ open: true, ids: [ts.id] }); setRejectReason('') }, danger: true },
                  ]} />
                </td>
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.includes(ts.id)} onChange={() => toggleOne(ts.id)}
                    className="rounded border-zinc-600 bg-zinc-800 accent-blue-500" />
                </td>
                <td className="px-3 py-2.5 text-zinc-300 whitespace-nowrap">{fmt(ts.date)}</td>
                <td className="px-3 py-2.5 text-zinc-400 font-mono hidden md:table-cell">{ts.start_time ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-400 font-mono hidden md:table-cell">{ts.end_time ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-400 font-mono hidden lg:table-cell">
                  {ts.ticket
                    ? ts.ticket.length >= 5
                      ? <a href={`https://erpserv.movidesk.com/Ticket/Edit/${ts.ticket}`} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()} className="hover:underline" style={{ color: '#22d3ee' }}>
                          #{ts.ticket}
                        </a>
                      : `#${ts.ticket}`
                    : '—'}
                </td>
                <td className="px-3 py-2.5 text-zinc-400 whitespace-nowrap hidden sm:table-cell">{fmtDateTime(ts.created_at)}</td>
                <td className="px-3 py-2.5 hidden sm:table-cell">
                  <OriginLabel origin={ts.origin} isInternalAction={ts.is_internal_action} isBillableOnly={ts.is_billable_only} />
                </td>
                <td className="px-3 py-2.5 text-zinc-200 font-medium">{ts.user?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-500 hidden md:table-cell">{ts.project?.customer?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-400 hidden lg:table-cell truncate max-w-[160px]">{ts.project?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-500 hidden lg:table-cell truncate max-w-[160px]">{ts.ticket_subject ?? '—'}</td>
                <td className="px-3 py-2.5 hidden lg:table-cell max-w-[200px]">
                  {ts.observation ? (
                    <span title={ts.observation} className="block truncate text-zinc-400 cursor-default">
                      {ts.observation}
                    </span>
                  ) : <span className="text-zinc-600">—</span>}
                </td>
                <td className="px-3 py-2.5 text-zinc-500 hidden xl:table-cell truncate max-w-[120px]">{ts.ticket_solicitante?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-500 hidden xl:table-cell truncate max-w-[120px]">{(ts.project as any)?.service_type?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-500 hidden xl:table-cell truncate max-w-[120px]">{ts.project?.contract_type_display ?? '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-300">
                  {ts.consultant_extra_pct ? (() => {
                    const extraMin = Math.round(ts.effort_minutes * (Number(ts.consultant_extra_pct) / 100))
                    const totalMin = ts.effort_minutes + extraMin
                    return (
                      <div className="flex flex-col items-end gap-0.5">
                        <span>{fmtMin(ts.effort_minutes)}</span>
                        <span className="text-[10px] font-normal" style={{ color: '#22C55E' }}>
                          +{Number(ts.consultant_extra_pct)}% = {fmtMin(totalMin)}
                        </span>
                      </div>
                    )
                  })() : fmtMin(ts.effort_minutes)}
                </td>
                <td className="px-3 py-2.5 hidden xl:table-cell">
                  <TsStatusBadge status={ts.status} display={ts.status_display} />
                </td>
              </tr>
            ))}

            {/* Expenses rows */}
            {!currentLoading && tab === 'expenses' && expItems.map(exp => (
              <tr key={exp.id}
                className="border-b border-zinc-800/60 hover:bg-zinc-800/40 transition-colors">
                <td className="px-2 py-2.5 w-10">
                  <RowMenu items={[
                    { label: 'Visualizar', icon: <Eye size={12} />, onClick: () => setExpApprove(exp) },
                    { label: 'Aprovar', icon: <Check size={12} />, onClick: () => setExpApprove(exp) },
                    { label: 'Solicitar Ajuste', icon: <RotateCcw size={12} />, onClick: () => { setAdjModal({ open: true, id: exp.id, type: 'expense' }); setAdjReason('') } },
                    { label: 'Rejeitar', icon: <XCircle size={12} />, onClick: () => { setRejectModal({ open: true, ids: [exp.id] }); setRejectReason('') }, danger: true },
                    ...(exp.receipt_url ? [
                      { label: 'Ver Comprovante', icon: <Paperclip size={12} />, onClick: () => openReceiptUrl(exp.receipt_url!) },
                    ] : []),
                  ]} />
                </td>
                <td className="px-3 py-2.5 text-zinc-300 whitespace-nowrap">{fmt(exp.expense_date)}</td>
                <td className="px-3 py-2.5 text-zinc-400 whitespace-nowrap hidden sm:table-cell">{fmtDateTime(exp.created_at)}</td>
                <td className="px-3 py-2.5 text-zinc-200 font-medium">{exp.user?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-500 hidden md:table-cell">{exp.project?.customer?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-400 hidden lg:table-cell truncate max-w-[160px]">{exp.project?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-500 hidden xl:table-cell truncate max-w-[120px]">{(exp.project as any)?.service_type?.name ?? '—'}</td>
                <td className="px-3 py-2.5 hidden lg:table-cell max-w-[200px]">
                  {exp.description ? (
                    <span title={exp.description} className="block truncate text-zinc-400 cursor-default">
                      {exp.description}
                    </span>
                  ) : <span className="text-zinc-600">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-300">{fmtBRL(parseFloat(String(exp.amount)) || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {currentItems.length > 0 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-zinc-500">
            {currentPag
              ? `${currentPag.from ?? 1}–${currentPag.to ?? currentItems.length} de ${currentPag.total} itens`
              : `${currentItems.length} itens`}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => tab === 'timesheets' ? setTsPage(p => Math.max(1, p - 1)) : setExpPage(p => Math.max(1, p - 1))}
              disabled={(currentPag?.current_page ?? 1) === 1}
              className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-800 disabled:opacity-30 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-zinc-500 px-1">
              {currentPag?.current_page ?? 1} / {currentPag?.last_page ?? 1}
            </span>
            <button
              onClick={() => tab === 'timesheets' ? setTsPage(p => p + 1) : setExpPage(p => p + 1)}
              disabled={(currentPag?.current_page ?? 1) >= (currentPag?.last_page ?? 1)}
              className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-800 disabled:opacity-30 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Modal: visualizar apontamento ── */}
      {tsView && <TsViewModal item={tsView} onClose={() => setTsView(null)} />}

      {/* ── Modal: aprovar despesa ── */}
      {expApprove && (
        <ExpApproveModal
          item={expApprove}
          approving={approving}
          onClose={() => setExpApprove(null)}
          onApprove={approveExp}
          onRequestAdjustment={requestAdjustmentExp}
          onReject={() => {
            setRejectModal({ open: true, ids: [expApprove.id] })
            setRejectReason('')
            setExpApprove(null)
          }}
        />
      )}

      {/* ── Modal: solicitar ajuste em lote ── */}
      {bulkAdjOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-white mb-1">Solicitar Ajuste</h3>
            <p className="text-xs text-zinc-400 mb-3">{selected.length} apontamento(s) selecionado(s). Descreva o que os colaboradores devem corrigir.</p>
            <Label className="text-xs text-zinc-400">Motivo do ajuste *</Label>
            <textarea
              autoFocus
              value={bulkAdjReason}
              onChange={e => setBulkAdjReason(e.target.value)}
              placeholder="Ex: Descrição incompleta, horas incorretas..."
              rows={3}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 resize-none placeholder:text-zinc-600"
            />
            <div className="flex gap-2 mt-4 justify-end">
              <Button variant="outline" onClick={() => { setBulkAdjOpen(false); setBulkAdjReason('') }}
                className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={bulkAdjTs} disabled={bulkAdjLoading || !bulkAdjReason.trim()}
                className="h-8 text-xs bg-amber-600 hover:bg-amber-500 text-white">
                <RotateCcw size={12} className="mr-1" />
                {bulkAdjLoading ? 'Enviando...' : 'Solicitar ajuste'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: solicitar ajuste ── */}
      {adjModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-white mb-1">Solicitar Ajuste</h3>
            <p className="text-xs text-zinc-400 mb-3">Descreva o que o colaborador deve corrigir antes da aprovação.</p>
            <Label className="text-xs text-zinc-400">Motivo do ajuste *</Label>
            <textarea
              autoFocus
              value={adjReason}
              onChange={e => setAdjReason(e.target.value)}
              placeholder="Ex: Comprovante ilegível, valor incorreto, descrição incompleta..."
              rows={3}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 resize-none placeholder:text-zinc-600"
            />
            <div className="flex gap-2 mt-4 justify-end">
              <Button variant="outline" onClick={() => { setAdjModal({ open: false, id: null, type: 'expense' }); setAdjReason('') }}
                className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={handleAdjustment} disabled={adjLoading || !adjReason.trim()}
                className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white">
                <RotateCcw size={12} className="mr-1" />
                {adjLoading ? 'Enviando...' : 'Solicitar ajuste'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: rejeição ── */}
      {rejectModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-white mb-1">
              {rejectModal.ids.length === 1 ? 'Rejeitar item' : `Rejeitar ${rejectModal.ids.length} itens`}
            </h3>
            <p className="text-xs text-zinc-400 mb-3">Informe o motivo da rejeição <span className="text-red-400 font-semibold">(obrigatório)</span>.</p>
            <Label className="text-xs text-zinc-400">Motivo <span className="text-red-400">*</span></Label>
            <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Ex: Fora do prazo, informação incorreta..."
              className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
            <div className="flex gap-2 mt-4 justify-end">
              <Button variant="outline" onClick={() => { setRejectModal({ open: false, ids: [] }); setRejectReason('') }}
                className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={handleReject} disabled={approving || !rejectReason.trim()}
                className="h-8 text-xs bg-red-600 hover:bg-red-500 text-white disabled:opacity-50">
                {approving ? 'Rejeitando...' : 'Confirmar rejeição'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
