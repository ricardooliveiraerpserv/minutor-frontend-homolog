'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { PageHeader } from '@/components/ds'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollableX } from '@/components/ui/scrollable-x'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  CheckSquare, Clock, Receipt, ChevronLeft, ChevronRight,
  Check, XCircle, X, Filter, ChevronDown, Eye, Pencil, RotateCcw,
  Paperclip, Download, Calendar, User, Building2, FolderOpen, Tag, CreditCard, FileText,
  FileSpreadsheet, ChevronUp, ChevronsUpDown,
} from 'lucide-react'
import { RowMenu } from '@/components/ui/row-menu'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { TimesheetViewModal } from '@/components/ui/timesheet-view-modal'
import { TimesheetHoverTooltip, useTimesheetHover } from '@/components/ui/timesheet-hover-tooltip'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { api, ApiError } from '@/lib/api'
import { fetchAsBlob } from '@/lib/attachments'
import { previewText } from '@/lib/sanitize'
import { exportTimesheetsToExcel } from '@/lib/exportTimesheets'
import { useAuth } from '@/hooks/use-auth'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { toast } from 'sonner'
import type { Timesheet, Expense } from '@/types'

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
  ticket_total_minutes?: number | null
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
  status_display?: string
  is_paid?: boolean
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
  // Tempo/total sempre em DECIMAL (ex.: 4h00 → 4 ; 0h30 → 0,5 ; 449h15 → 449,25).
  return (Number(minutes || 0) / 60).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

// Cor semântica do Consumo do Ticket por faixa de horas:
// < 4h verde | 4-8h amarelo | 8-12h laranja | > 12h vermelho
function ticketTotalColor(minutes: number): string {
  if (minutes < 240)  return '#10B981'
  if (minutes < 480)  return '#F59E0B'
  if (minutes < 720)  return '#F97316'
  return '#EF4444'
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
      <Label className="text-[11px] text-[var(--text-light)] mb-1 block">{label}</Label>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch('') }}
        className="w-full h-8 flex items-center justify-between gap-1 px-2 text-xs bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] rounded-md outline-none hover:border-[var(--border-strong)] transition-colors">
        <span className={`truncate ${!selected ? 'text-[var(--text-light)]' : ''}`}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown size={11} className={`shrink-0 text-[var(--text-light)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[180px] bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden">
          {/* Campo de busca */}
          <div className="p-1.5 border-b border-[var(--border)]">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full h-7 px-2 text-xs bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] rounded outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)]"
            />
          </div>
          {/* Opções */}
          <div className="max-h-48 overflow-y-auto py-0.5">
            <button type="button" onClick={() => select('')}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${
                !value ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
              }`}>
              {!value && <Check size={10} className="shrink-0" />}
              <span className={!value ? '' : 'ml-[14px]'}>{placeholder}</span>
            </button>
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-[11px] text-[var(--text-muted)] italic">Nenhum resultado</p>
            )}
            {filtered.map(o => (
              <button key={o.id} type="button" onClick={() => select(String(o.id))}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${
                  String(o.id) === value ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
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
  if (isBillableOnly)   return <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--warning-bg)] text-[var(--warning)]">Apenas Fatura</span>
  const labels: Record<string, string> = { manual: 'Manual', webhook: 'Webhook', integration: 'Integração', import: 'Importação' }
  return <span className="text-[10px] text-[var(--text-light)]">{labels[origin ?? ''] ?? (origin || '—')}</span>
}

function TsStatusBadge({ status, display }: { status: string; display?: string }) {
  const colors: Record<string, string> = {
    pending:              'bg-[var(--warning-bg)] text-[var(--warning)] border-yellow-500/20',
    approved:             'bg-[var(--success-bg)]  text-[var(--success)]  border-green-500/20',
    rejected:             'bg-[var(--danger-bg)]    text-[var(--danger)]    border-red-500/20',
    adjustment_requested: 'bg-[var(--primary-soft)]   text-[var(--primary)]   border-blue-500/20',
    conflicted:           'bg-[var(--purple-bg)] text-[var(--purple)] border-purple-500/20',
    internal:             'bg-slate-500/15  text-slate-400  border-slate-500/20',
    released:             'bg-[var(--primary-soft)]   text-[var(--primary)]   border-cyan-500/20',
  }
  const labels: Record<string, string> = {
    pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado',
    adjustment_requested: 'Ajuste', conflicted: 'Conflito', internal: 'Ação Interna', released: 'Liberado',
  }
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${colors[status] ?? 'bg-[var(--surface-hover)] text-[var(--text-muted)] border-[var(--border-strong)]/20'}`}>
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
    <div className="flex items-center gap-0.5 bg-[var(--surface-hover)] border border-[var(--border)]/50 rounded-full p-1 flex-wrap">
      {options.map(opt => (
        <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
            value === opt.value
              ? 'bg-cyan-400 text-zinc-900 shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}>
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Receipt helpers ──────────────────────────────────────────────────────────

// FASE 11.2.FE — Helper centralizado em src/lib/attachments.ts.
const fetchReceipt = fetchAsBlob

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
        className="inline-flex items-center gap-1.5 text-[var(--primary)] hover:text-[var(--primary)] text-xs disabled:opacity-50">
        <Eye size={11} /> {loading ? 'Carregando...' : 'Visualizar'}
      </button>
      <button onClick={() => handle(true)} disabled={loading}
        className="inline-flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text)] text-xs disabled:opacity-50">
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

const EXP_STATUS_CONF: Record<string, { bg: string; color: string; label: string }> = {
  pending:              { bg: 'rgba(234,179,8,0.12)',  color: '#EAB308', label: 'Pendente' },
  approved:             { bg: 'rgba(34,197,94,0.12)',  color: '#22C55E', label: 'Aprovado' },
  rejected:             { bg: 'rgba(239,68,68,0.12)',  color: '#EF4444', label: 'Rejeitado' },
  adjustment_requested: { bg: 'rgba(249,115,22,0.12)', color: '#F97316', label: 'Ajuste Solicitado' },
}
const EXP_TYPE_LABEL: Record<string, string> = {
  reimbursement: 'Reembolso', advance: 'Adiantamento', corporate_card: 'Cartão Corporativo',
}
const PAYMENT_LABEL_MAP: Record<string, string> = {
  pix: 'PIX', credit_card: 'Cartão de Crédito', debit_card: 'Cartão de Débito',
  cash: 'Dinheiro', bank_transfer: 'Transferência Bancária',
}

function ExpInfoRow({ icon: Icon, label, value, children, last }: {
  icon: React.ElementType; label: string; value?: string | null
  children?: React.ReactNode; last?: boolean
}) {
  return (
    <div className={`flex items-center gap-2.5 px-3.5 py-1.5 ${!last ? 'border-b' : ''}`}
      style={!last ? { borderColor: 'var(--brand-border)' } : undefined}>
      <span className="shrink-0 p-1 rounded-md"
        style={{ background: 'rgba(0,245,255,0.06)', color: 'var(--brand-primary)' }}>
        <Icon size={12} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{label}</p>
        {children ?? <p className="text-[13px] font-medium" style={{ color: 'var(--brand-text)' }}>{value ?? '—'}</p>}
      </div>
    </div>
  )
}

function ExpApproveModal({
  item, onClose, onApprove, onReject, onRequestAdjustment, approving,
}: {
  item: Expense
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

  const sc = EXP_STATUS_CONF[item.status] ?? { bg: 'rgba(113,113,122,0.12)', color: '#71717A', label: item.status }

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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="relative w-full max-w-lg mt-6 rounded-2xl shadow-2xl"
        style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <button onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
          style={{ color: 'var(--brand-subtle)' }}>
          <X size={16} />
        </button>

        {/* Header */}
        <div className="px-4 pt-3.5 pb-2.5 flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg shrink-0" style={{ background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)' }}>
            <Receipt size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold" style={{ color: 'var(--brand-text)' }}>Detalhes da Despesa</h3>
            <p className="text-[11px]" style={{ color: 'var(--brand-subtle)' }}>#{item.id} · {fmt(item.expense_date)}</p>
          </div>
        </div>

        <div className="px-4 pb-4 space-y-2">
          {/* Status + Categoria */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
            {item.category?.name && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Tag size={11} /> {item.category.name}
              </span>
            )}
          </div>

          {/* Valor hero */}
          <div className="rounded-xl px-3.5 py-2.5 flex items-baseline justify-between gap-2"
            style={{ background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.15)' }}>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--brand-subtle)' }}>Valor Total</p>
            <p className="text-xl font-bold" style={{ color: 'var(--brand-primary)' }}>{fmtBRL(Number(item.amount))}</p>
          </div>

          {/* Info card */}
          <div className="rounded-xl overflow-hidden"
            style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
            <ExpInfoRow icon={Calendar} label="Data" value={fmt(item.expense_date)} />
            <ExpInfoRow icon={User} label="Colaborador" value={item.user?.name} />
            <ExpInfoRow icon={Building2} label="Cliente" value={(item.project as any)?.customer?.name} />
            <ExpInfoRow icon={FolderOpen} label="Projeto" value={item.project?.name} />
            {(item as any).real_project?.name && (
              <ExpInfoRow icon={FolderOpen} label="Projeto Real" value={(item as any).real_project.name} />
            )}
            <ExpInfoRow icon={Paperclip} label="Comprovante" last>
              {item.receipt_url
                ? <ReceiptLink url={item.receipt_url} />
                : <span className="text-sm" style={{ color: 'var(--brand-subtle)' }}>Sem comprovante</span>}
            </ExpInfoRow>
          </div>

          {/* Descrição */}
          {item.description && (
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
              <div className="flex items-center gap-2 px-3.5 py-2" style={{ borderBottom: '1px solid var(--brand-border)' }}>
                <FileText size={13} style={{ color: 'var(--brand-primary)' }} />
                <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--brand-subtle)' }}>Descrição</span>
              </div>
              <p className="px-3.5 py-2 text-[13px] leading-relaxed" style={{ color: 'var(--brand-muted)' }}>{item.description}</p>
            </div>
          )}

          {/* Cobrar do cliente */}
          {mode === 'approve' && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] px-3.5 py-2.5 space-y-2">
              <p className={`text-xs font-semibold ${submitted && chargeClient === null ? 'text-[var(--danger)]' : 'text-[var(--text)]'}`}>
                Cobrar do cliente? *
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setChargeClient(true)}
                  className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${
                    chargeClient === true ? 'bg-[var(--success-bg)] border-green-500 text-[var(--success)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
                  }`}>
                  Sim — cobrar do cliente
                </button>
                <button type="button" onClick={() => setChargeClient(false)}
                  className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${
                    chargeClient === false ? 'bg-[var(--warning-bg)] border-orange-500 text-[var(--warning)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
                  }`}>
                  Não — absorver internamente
                </button>
              </div>
              {submitted && chargeClient === null && (
                <p className="text-[var(--danger)] text-[11px]">Selecione uma opção antes de aprovar</p>
              )}
            </div>
          )}

          {/* Solicitar ajuste */}
          {mode === 'adjust' && (
            <div className="rounded-xl border border-blue-700/40 bg-[var(--primary-soft)] px-4 py-3 space-y-2">
              <p className={`text-xs font-semibold ${adjSubmitted && !adjReason.trim() ? 'text-[var(--danger)]' : 'text-[var(--primary)]'}`}>
                O que precisa ser ajustado? *
              </p>
              <textarea autoFocus value={adjReason} onChange={e => setAdjReason(e.target.value)}
                placeholder="Descreva o que o colaborador deve corrigir..." rows={3}
                className="w-full bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 resize-none placeholder:text-[var(--text-muted)]" />
              {adjSubmitted && !adjReason.trim() && (
                <p className="text-[var(--danger)] text-[11px]">Informe o motivo do ajuste</p>
              )}
            </div>
          )}

          {/* Botões */}
          <div className="flex items-center gap-2 flex-wrap justify-end pt-1">
            {mode === 'approve' ? (
              <>
                <button onClick={onReject} disabled={approving}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-red-700/50 text-[var(--danger)] hover:bg-[var(--danger-bg)] disabled:opacity-50 transition-colors">
                  <XCircle size={12} /> Rejeitar
                </button>
                <button onClick={() => setMode('adjust')} disabled={approving}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-blue-700/50 text-[var(--primary)] hover:bg-[var(--primary-soft)] disabled:opacity-50 transition-colors">
                  <RotateCcw size={12} /> Solicitar Ajuste
                </button>
                <button onClick={onClose} disabled={approving}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleApprove} disabled={approving}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-green-600 hover:bg-[var(--success-border)] text-white disabled:opacity-50 transition-colors">
                  <Check size={12} /> {approving ? 'Aprovando...' : 'Aprovar'}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { setMode('approve'); setAdjReason(''); setAdjSubmitted(false) }} disabled={approving}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50 transition-colors">
                  Voltar
                </button>
                <button onClick={handleAdjustment} disabled={approving}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[var(--primary)] hover:bg-[var(--primary)] text-white disabled:opacity-50 transition-colors">
                  <RotateCcw size={12} /> {approving ? 'Enviando...' : 'Enviar Solicitação'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
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
      categoriaServico: '' as '' | 'sustentacao' | 'projeto' | 'bizify' | 'investimento',
    },
  )
  const { tab, dateFrom, dateTo, refMonth, refYear, filterMode, userId, coordinatorId, executiveId, projectId, customerId, categoriaServico } = flt
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
  const setCategoriaServico = (v: '' | 'sustentacao' | 'projeto' | 'bizify' | 'investimento') => setFilter('categoriaServico', v)

  // Vindo do card "Apontamentos para aprovar" do Meu Dia (/approvals?tab=timesheets&coordinator_id=ID):
  // aplica o escopo do coordenador (só os projetos que ele coordena) + a aba certa. window.location
  // evita exigir Suspense do useSearchParams nesta página.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const cid = sp.get('coordinator_id')
    const t   = sp.get('tab')
    if (cid) setFilter('coordinatorId', cid)
    if (t === 'expenses' || t === 'timesheets') setFilter('tab', t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tsStatus  = 'pending'
  const expStatus = 'pending'
  const [showFilters,   setShowFilters]   = useState(true)

  // Support data
  const [users,        setUsers]        = useState<UserOption[]>([])
  const [coordinators, setCoordinators] = useState<UserOption[]>([])
  const [executives,   setExecutives]   = useState<UserOption[]>([])
  // Executivos TAMBÉM coordenam projetos → entram na lista do filtro Coordenador (dedup por id).
  const coordinatorOptions = useMemo(() => {
    const m = new Map<number, UserOption>()
    ;[...coordinators, ...executives].forEach(o => m.set(o.id, o))
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [coordinators, executives])
  const hover = useTimesheetHover()
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
  const [tsView,         setTsView]        = useState<Timesheet | null>(null)
  const [tsViewLoading,  setTsViewLoading] = useState(false)
  const [expApprove,     setExpApprove]    = useState<Expense | null>(null)
  const [expApproveLoading, setExpApproveLoading] = useState(false)

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
    // Canônico: exclui parceiro_admin (gestores) e users de cliente — /users?is_executive=true
    // traria os Parceiros Gestores (mesma flag) por engano.
    api.get<any>('/executives?pageSize=100').then(r => {
      const l = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setExecutives(l.map((u: any) => ({ id: u.id, name: u.name })))
    }).catch(() => {})
    api.get<any>('/customers?pageSize=500').then(r => {
      const l = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setCustomers(l.map((c: any) => ({ id: c.id, name: c.name })))
    }).catch(() => {})
  }, [])

  // Projetos do dropdown — refetch quando o cliente muda. Sem status=active (projetos
  // ficam com status "started"/etc, não "active") e pageSize alto + customer_id, senão
  // o projeto não aparecia na busca (ex.: AUSTER tem 0 projetos status=active).
  useEffect(() => {
    const params = new URLSearchParams({ minimal: 'true', pageSize: '2000' })
    if (customerId) params.set('customer_id', customerId)
    api.get<any>(`/projects?${params.toString()}`).then(r => {
      const l = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
      setProjects(l.map((p: any) => ({ id: p.id, name: p.name })))
    }).catch(() => {})
  }, [customerId])

  // Ordenação de colunas (server-side; reaplica via filterParams → reseta página).
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('desc')
  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir('desc') }
  }
  const SortTh = ({ label, field, className = '', align = 'left' }: { label: string; field?: string; className?: string; align?: 'left' | 'right' }) => {
    const sortable = !!field
    const active = sortable && sortField === field
    return (
      <th className={`${align === 'right' ? 'text-right' : 'text-left'} px-3 py-2.5 text-[var(--text-light)] font-medium ${className} ${sortable ? 'cursor-pointer select-none hover:text-[var(--text)]' : ''}`}
        onClick={sortable ? () => handleSort(field!) : undefined}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          {label}
          {sortable && (active
            ? <ChevronUp size={12} className={sortDir === 'desc' ? 'rotate-180' : ''} style={{ color: 'var(--primary)' }} />
            : <ChevronsUpDown size={12} className="opacity-40" />)}
        </span>
      </th>
    )
  }

  const filterParams = useMemo(() => {
    const p = new URLSearchParams()
    if (dateFrom)      p.set('date_from',      dateFrom)
    if (dateTo)        p.set('date_to',        dateTo)
    if (userId)        p.set('user_id',        userId)
    if (coordinatorId) p.set('coordinator_id', coordinatorId)
    if (executiveId)   p.set('executive_id',   executiveId)
    if (projectId)     p.set('project_id',     projectId)
    if (customerId)    p.set('customer_id',    customerId)
    if (categoriaServico) p.set('categoria_servico', categoriaServico)
    if (sortField)     p.set('order', (sortDir === 'desc' ? '-' : '') + sortField)
    return p.toString()
  }, [dateFrom, dateTo, userId, coordinatorId, executiveId, projectId, customerId, categoriaServico, sortField, sortDir])

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

  // Totais de horas
  const totalPageMinutes     = tsItems.reduce((s, ts) => s + ts.effort_minutes, 0)
  const selectedMinutes      = tsItems.filter(ts => selected.includes(ts.id)).reduce((s, ts) => s + ts.effort_minutes, 0)

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

  // Open timesheet view modal (fetches full data)
  const openTsView = useCallback(async (ts: TSItem) => {
    setTsView(ts as unknown as Timesheet)
    setTsViewLoading(true)
    try {
      const resp = await api.get<any>(`/timesheets/${ts.id}`)
      setTsView(resp?.data ?? resp)
    } catch { /* mantém dados parciais */ }
    finally { setTsViewLoading(false) }
  }, [])

  // Open expense approve modal (fetches full data)
  const openExpApprove = useCallback(async (exp: ExpItem) => {
    setExpApprove(exp as unknown as Expense)
    setExpApproveLoading(true)
    try {
      const resp = await api.get<any>(`/expenses/${exp.id}`)
      setExpApprove(resp?.data ?? resp)
    } catch { /* mantém dados parciais */ }
    finally { setExpApproveLoading(false) }
  }, [])

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

  function exportTs() {
    exportTimesheetsToExcel(
      tsItems.map(ts => ({
        date:           ts.date,
        user:           ts.user?.name ?? '',
        client:         ts.project?.customer?.name ?? '',
        project:        ts.project?.name ?? '',
        ticket:         ts.ticket ?? '',
        ticket_subject: ts.ticket_subject ?? '',
        start_time:     ts.start_time ?? undefined,
        end_time:       ts.end_time ?? undefined,
        effort_minutes: ts.effort_minutes,
        observation:    ts.observation ?? '',
        status_display: ts.status_display ?? '',
      })),
      'apontamentos'
    )
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
      <PageHeader
        icon={CheckSquare}
        title="Aprovações"
        subtitle="Pendências de apontamentos e despesas para análise"
      />

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
                  : 'bg-transparent border-cyan-500/40 text-[var(--primary)] hover:border-cyan-400'
              }`}>
              <Icon size={14} />
              {label}
              {count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold ${
                  active ? 'bg-[var(--surface-hover)] text-zinc-900' : 'bg-[var(--primary-soft)] text-[var(--primary)]'
                }`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Filters ── */}
      <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <button onClick={() => setShowFilters(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
          <div className="flex items-center gap-2">
            <Filter size={13} />
            <span className="font-medium">Filtros</span>
            {hasFilters && (
              <span className="bg-[var(--primary-soft)] text-[var(--primary)] border border-blue-500/30 rounded-full px-2 py-0.5 text-[10px]">ativos</span>
            )}
          </div>
          <ChevronDown size={13} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        {showFilters && (
          <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
            {/* Linha 1: período + chips de categoria */}
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs self-end mb-0.5">
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
                  }}
                />
              ) : (
                <DateRangePicker
                  from={dateFrom}
                  to={dateTo}
                  onChange={(f, t) => { setDateFrom(f); setDateTo(t); setRefMonth(null); setRefYear(null) }}
                />
              )}
              {([
                { id: 'sustentacao',  label: 'Sustentação', color: '#f59e0b',            bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)' },
                { id: 'projeto',      label: 'Projeto',     color: '#00F5FF',            bg: 'rgba(0,245,255,0.12)',   border: 'rgba(0,245,255,0.35)' },
                { id: 'bizify',       label: 'Bizify',      color: '#a78bfa',            bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.35)' },
                { id: 'investimento', label: 'Investimento', color: '#ef4444',           bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)' },
              ] as const).map(opt => {
                const active = (categoriaServico || '') === opt.id
                return (
                  <button key={opt.id || 'all'}
                    onClick={() => setCategoriaServico(active ? '' : (opt.id as any))}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors self-end mb-0.5"
                    style={active
                      ? { background: opt.bg, color: opt.color, border: `1px solid ${opt.border}` }
                      : { background: 'transparent', color: 'var(--brand-subtle)', border: '1px solid var(--brand-border)' }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>

            {/* Linha 2: dropdowns de pessoas/cliente/projeto */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <SearchableSelect
                label="Colaborador"
                value={userId}
                onChange={setUserId}
                options={users}
              />
              <SearchableSelect
                label="Coordenador"
                value={coordinatorId}
                onChange={setCoordinatorId}
                options={coordinatorOptions}
              />
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
                className="mt-3 text-[11px] text-[var(--text-light)] hover:text-[var(--danger)] transition-colors flex items-center gap-1">
                <X size={11} /> Limpar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Bulk action bar (apontamentos only) ── */}
      {tab === 'timesheets' && selected.length > 0 && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--primary-soft)] border border-blue-500/20">
          <span className="text-xs text-[var(--primary)] flex-1">
            {selected.length} apontamento(s) selecionado(s)
            <span className="ml-2 font-semibold text-[var(--primary)]">· {fmtMin(selectedMinutes)}</span>
          </span>
          <button onClick={bulkApproveTs} disabled={approving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-green-600 hover:bg-[var(--success-border)] text-white disabled:opacity-50 transition-colors">
            <Check size={12} />{approving ? 'Aprovando...' : 'Aprovar todos'}
          </button>
          <button onClick={() => { setBulkAdjOpen(true); setBulkAdjReason('') }} disabled={approving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-amber-600 hover:bg-[var(--warning-border)] text-white disabled:opacity-50 transition-colors">
            <RotateCcw size={12} /> Solicitar Ajuste
          </button>
          <button onClick={() => { setRejectModal({ open: true, ids: selected }); setRejectReason('') }} disabled={approving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-red-600 hover:bg-[var(--danger-border)] text-white disabled:opacity-50 transition-colors">
            <XCircle size={12} /> Rejeitar todos
          </button>
          <button onClick={() => setSelected([])} className="p-1.5 rounded-md text-[var(--text-light)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Export bar ── */}
      {tab === 'timesheets' && tsItems.length > 0 && (
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)]/50 text-xs text-[var(--text-muted)]">
            <Clock size={12} className="text-[var(--primary)]" />
            Total da página:
            <span className="font-semibold text-[var(--primary)] ml-1">{fmtMin(totalPageMinutes)}</span>
          </div>
          <button onClick={exportTs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors">
            <FileSpreadsheet size={13} /> Exportar Excel
          </button>
        </div>
      )}

      {/* ── Table (desktop) ── */}
      <div className="hidden md:block rounded-xl border border-[var(--border)] overflow-hidden">
        <ScrollableX clipY>
        <table className="w-full min-w-max text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
              <th className="px-3 py-2.5 w-10"></th>
              {tab === 'timesheets' && (
                <th className="px-3 py-2.5 w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="rounded border-[var(--border-strong)] bg-[var(--surface-hover)] accent-blue-500" />
                </th>
              )}
              {tab === 'timesheets' && (
                <th
                  className="text-center px-3 py-2.5 font-medium hidden lg:table-cell whitespace-nowrap"
                  style={{ color: 'var(--brand-primary)', background: 'rgba(0,245,255,0.06)', borderLeft: '2px solid var(--brand-primary)', borderRight: '2px solid var(--brand-primary)' }}
                >Hist. de Hs Tikets</th>
              )}
              <SortTh label="Data" field="date" />
              {tab === 'timesheets' && <SortTh label="Início" field="start_time" className="hidden md:table-cell" />}
              {tab === 'timesheets' && <SortTh label="Fim" field="end_time" className="hidden md:table-cell" />}
              {tab === 'timesheets' && <SortTh label="Tempo" field="effort_minutes" align="right" className="hidden md:table-cell" />}
              {tab === 'timesheets' && <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden lg:table-cell">Ticket #</th>}
              <SortTh label="Inclusão" field="created_at" className="hidden sm:table-cell" />
              {tab === 'timesheets' && <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden sm:table-cell">Origem</th>}
              <SortTh label="Colaborador" field="user.name" />
              {tab === 'timesheets'
                ? <SortTh label="Cliente" field="customer.name" className="hidden md:table-cell" />
                : <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden md:table-cell">Cliente</th>}
              <SortTh label="Projeto" field="project.name" className="hidden lg:table-cell" />
              {tab === 'timesheets' && <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden xl:table-cell">Coordenador</th>}
              {tab === 'timesheets' && <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden xl:table-cell">Executivo</th>}
              {tab === 'timesheets' && <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden lg:table-cell">Título</th>}
              <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden lg:table-cell">Descrição</th>
              {tab === 'timesheets' && <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden xl:table-cell">Solicitante</th>}
              {tab === 'expenses'    && <SortTh label="Categoria" field="category.name" className="hidden lg:table-cell" />}
              <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden xl:table-cell">Tipo de Serviço</th>
              {tab === 'timesheets' && <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden xl:table-cell">Contrato</th>}
              {tab === 'expenses'   && <SortTh label="Valor" field="amount" align="right" />}
              <SortTh label="Status" field="status" />
              {tab === 'expenses' && <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium">Pagamento</th>}
            </tr>
          </thead>
          <tbody>
            {/* Loading */}
            {currentLoading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-[var(--border)]/60">
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
                <td colSpan={20} className="px-3 py-16 text-center text-[var(--text-light)]">
                  <CheckSquare size={28} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Nenhum item pendente de aprovação</p>
                  {hasFilters && (
                    <button onClick={clearFilters} className="mt-2 text-xs text-[var(--primary)] hover:text-[var(--primary)]">
                      Limpar filtros
                    </button>
                  )}
                </td>
              </tr>
            )}

            {/* Timesheets rows */}
            {!currentLoading && tab === 'timesheets' && tsItems.map(ts => (
              <tr key={ts.id} onClick={() => openTsView(ts)} {...hover.bind(ts)}
                className={`border-b border-[var(--border)]/60 cursor-pointer transition-colors ${
                  selected.includes(ts.id) ? 'bg-[var(--primary-soft)]' : 'hover:bg-[var(--surface-hover)]'
                }`}>
                <td className="px-2 py-2.5 w-10" onClick={e => e.stopPropagation()}>
                  <RowMenu items={[
                    { label: 'Visualizar', icon: <Eye size={12} />, onClick: () => openTsView(ts) },
                    { label: 'Aprovar', icon: <Check size={12} />, onClick: () => approveTs(ts.id), disabled: actioning === ts.id },
                    { label: 'Solicitar Ajuste', icon: <RotateCcw size={12} />, onClick: () => { setAdjModal({ open: true, id: ts.id, type: 'timesheet' }); setAdjReason('') } },
                    { label: 'Rejeitar', icon: <XCircle size={12} />, onClick: () => { setRejectModal({ open: true, ids: [ts.id] }); setRejectReason('') }, danger: true },
                  ]} />
                </td>
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.includes(ts.id)} onChange={() => toggleOne(ts.id)}
                    className="rounded border-[var(--border-strong)] bg-[var(--surface-hover)] accent-blue-500" />
                </td>
                <td
                  className="px-3 py-2.5 font-mono text-center hidden lg:table-cell"
                  style={{ background: 'rgba(0,245,255,0.06)', borderLeft: '2px solid var(--brand-primary)', borderRight: '2px solid var(--brand-primary)' }}
                >
                  {ts.ticket_total_minutes != null
                    ? <span style={{ color: ticketTotalColor(ts.ticket_total_minutes), fontWeight: 700, fontSize: '0.875rem' }}>{fmtMin(ts.ticket_total_minutes)}</span>
                    : <span style={{ color: 'var(--brand-subtle)' }}>—</span>}
                </td>
                <td className="px-3 py-2.5 text-[var(--text)] whitespace-nowrap">{fmt(ts.date)}</td>
                <td className="px-3 py-2.5 text-[var(--text-muted)] font-mono hidden md:table-cell">{ts.start_time ?? '—'}</td>
                <td className="px-3 py-2.5 text-[var(--text-muted)] font-mono hidden md:table-cell">{ts.end_time ?? '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[var(--text)] hidden md:table-cell">
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
                <td className="px-3 py-2.5 text-[var(--text-muted)] font-mono hidden lg:table-cell">
                  {ts.ticket
                    ? <a href={`https://erpserv.movidesk.com/Ticket/Edit/${ts.ticket}`} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()} className="hover:underline" style={{ color: '#22d3ee' }}>
                        #{ts.ticket}
                      </a>
                    : '—'}
                </td>
                <td className="px-3 py-2.5 text-[var(--text-muted)] whitespace-nowrap hidden sm:table-cell">{fmtDateTime(ts.created_at)}</td>
                <td className="px-3 py-2.5 hidden sm:table-cell">
                  <OriginLabel origin={ts.origin} isInternalAction={ts.is_internal_action} isBillableOnly={ts.is_billable_only} />
                </td>
                <td className="px-3 py-2.5 text-[var(--text)] font-medium">{ts.user?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-[var(--text-light)] hidden md:table-cell">{ts.project?.customer?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-[var(--text-muted)] hidden lg:table-cell truncate max-w-[280px]">
                  {ts.project?.name ?? '—'}
                  {(ts as any).real_project?.name && (
                    <span className="block text-[10px]" style={{ color: 'var(--text-light)' }}>Real: {(ts as any).real_project.name}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[var(--text-light)] hidden xl:table-cell truncate max-w-[160px]">
                  {(ts as any).coordinator_label || '—'}
                </td>
                <td className="px-3 py-2.5 text-[var(--text-light)] hidden xl:table-cell truncate max-w-[140px]">
                  {(ts.project as any)?.customer?.executive?.name ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-[var(--text-light)] hidden lg:table-cell truncate max-w-[160px]">{ts.ticket_subject ?? '—'}</td>
                <td className="px-3 py-2.5 hidden lg:table-cell max-w-[200px]">
                  {ts.observation ? (
                    <span title={previewText(ts.observation)} className="block truncate text-[var(--text-muted)] cursor-default">
                      {previewText(ts.observation)}
                    </span>
                  ) : <span className="text-[var(--text-muted)]">—</span>}
                </td>
                <td className="px-3 py-2.5 text-[var(--text-light)] hidden xl:table-cell truncate max-w-[120px]">{ts.ticket_solicitante?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-[var(--text-light)] hidden xl:table-cell truncate max-w-[120px]">{(ts.project as any)?.service_type?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-[var(--text-light)] hidden xl:table-cell truncate max-w-[120px]">{ts.project?.contract_type_display ?? '—'}</td>
                <td className="px-3 py-2.5">
                  <TsStatusBadge status={ts.status} display={ts.status_display} />
                </td>
              </tr>
            ))}

            {/* Expenses rows */}
            {!currentLoading && tab === 'expenses' && expItems.map(exp => (
              <tr key={exp.id}
                onClick={() => openExpApprove(exp)}
                className="border-b border-[var(--border)]/60 hover:bg-[var(--surface-hover)] transition-colors cursor-pointer">
                <td className="px-2 py-2.5 w-10" onClick={e => e.stopPropagation()}>
                  <RowMenu items={[
                    { label: 'Visualizar', icon: <Eye size={12} />, onClick: () => openExpApprove(exp) },
                    { label: 'Aprovar', icon: <Check size={12} />, onClick: () => openExpApprove(exp) },
                    { label: 'Solicitar Ajuste', icon: <RotateCcw size={12} />, onClick: () => { setAdjModal({ open: true, id: exp.id, type: 'expense' }); setAdjReason('') } },
                    { label: 'Rejeitar', icon: <XCircle size={12} />, onClick: () => { setRejectModal({ open: true, ids: [exp.id] }); setRejectReason('') }, danger: true },
                    ...(exp.receipt_url ? [
                      { label: 'Ver Comprovante', icon: <Paperclip size={12} />, onClick: () => openReceiptUrl(exp.receipt_url!) },
                    ] : []),
                  ]} />
                </td>
                <td className="px-3 py-2.5 text-[var(--text)] whitespace-nowrap">{fmt(exp.expense_date)}</td>
                <td className="px-3 py-2.5 text-[var(--text-muted)] whitespace-nowrap hidden sm:table-cell">{fmtDateTime(exp.created_at)}</td>
                <td className="px-3 py-2.5 text-[var(--text)] font-medium">{exp.user?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-[var(--text-light)] hidden md:table-cell">{exp.project?.customer?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-[var(--text-muted)] hidden lg:table-cell truncate max-w-[280px]">
                  {exp.project?.name ?? '—'}
                  {(exp as any).real_project?.name && (
                    <span className="block text-[10px]" style={{ color: 'var(--text-light)' }}>Real: {(exp as any).real_project.name}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 hidden lg:table-cell max-w-[200px]">
                  <div className="flex items-center gap-1.5">
                    <span title={exp.description} className="block truncate text-[var(--text-muted)] cursor-default">
                      {exp.description || '—'}
                    </span>
                    {exp.receipt_url && <Paperclip size={10} className="shrink-0 text-[var(--text-muted)]" />}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-[var(--text-light)] hidden lg:table-cell truncate max-w-[120px]">{exp.category?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-[var(--text-light)] hidden xl:table-cell truncate max-w-[120px]">{(exp.project as any)?.service_type?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[var(--text)]">{fmtBRL(parseFloat(String(exp.amount)) || 0)}</td>
                <td className="px-3 py-2.5">
                  <TsStatusBadge status={exp.status} display={exp.status_display} />
                </td>
                <td className="px-3 py-2.5">
                  {exp.is_paid
                    ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-[var(--success-bg)] text-[var(--success)] border-emerald-500/20">Pago</span>
                    : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-[var(--warning-bg)] text-[var(--warning)] border-amber-500/20">Em aberto</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </ScrollableX>
      </div>

      {/* ── Cards (mobile) — mesmo formato dos Apontamentos: toca abre modal, realce no toque ── */}
      <div className="md:hidden space-y-2">
        {currentLoading && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-2.5" style={{ borderColor: 'var(--brand-border)', background: 'var(--brand-surface)' }}>
            <div className="flex items-center justify-between gap-2 mb-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-5" /></div>
            <Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-3 w-full" />
          </div>
        ))}
        {!currentLoading && currentItems.length === 0 && (
          <div className="rounded-lg border px-3 py-16 text-center text-[var(--text-light)]" style={{ borderColor: 'var(--brand-border)', background: 'var(--brand-surface)' }}>
            <CheckSquare size={28} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm">Nenhum item pendente de aprovação</p>
            {hasFilters && <button onClick={clearFilters} className="mt-2 text-xs text-[var(--primary)] hover:text-[var(--primary)]">Limpar filtros</button>}
          </div>
        )}
        {!currentLoading && tab === 'timesheets' && tsItems.map(ts => (
          <div key={ts.id} onClick={() => openTsView(ts)}
            className={`rounded-lg border p-2.5 cursor-pointer transition-colors bg-[var(--brand-surface)] active:bg-[var(--surface-hover)] md:hover:bg-[var(--surface-hover)] ${selected.includes(ts.id) ? 'ring-1 ring-blue-500/40' : ''}`}
            style={{ borderColor: 'var(--brand-border)' }}>
            <div className="flex items-center gap-2">
              <span onClick={e => e.stopPropagation()} className="shrink-0 flex">
                <input type="checkbox" checked={selected.includes(ts.id)} onChange={() => toggleOne(ts.id)} className="rounded border-[var(--border-strong)] bg-[var(--surface-hover)] accent-blue-500" />
              </span>
              <span className="font-medium text-sm truncate flex-1 min-w-0" style={{ color: 'var(--brand-text)' }}>{ts.user?.name ?? '—'}</span>
              <div onClick={e => e.stopPropagation()} className="shrink-0">
                <RowMenu items={[
                  { label: 'Visualizar', icon: <Eye size={12} />, onClick: () => openTsView(ts) },
                  { label: 'Aprovar', icon: <Check size={12} />, onClick: () => approveTs(ts.id), disabled: actioning === ts.id },
                  { label: 'Solicitar Ajuste', icon: <RotateCcw size={12} />, onClick: () => { setAdjModal({ open: true, id: ts.id, type: 'timesheet' }); setAdjReason('') } },
                  { label: 'Rejeitar', icon: <XCircle size={12} />, onClick: () => { setRejectModal({ open: true, ids: [ts.id] }); setRejectReason('') }, danger: true },
                ]} />
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap"><TsStatusBadge status={ts.status} display={ts.status_display} /></div>
            <div className="mt-1.5 text-[11px] truncate" style={{ color: 'var(--brand-subtle)' }}>
              {fmt(ts.date)}{ts.ticket ? ` · #${ts.ticket}` : ''} · {fmtMin(ts.effort_minutes)}{ts.project?.customer?.name ? ` · ${ts.project.customer.name}` : ''}{ts.project?.name ? ` · ${ts.project.name}` : ''}
            </div>
          </div>
        ))}
        {!currentLoading && tab === 'expenses' && expItems.map(exp => (
          <div key={exp.id} onClick={() => openExpApprove(exp)}
            className="rounded-lg border p-2.5 cursor-pointer transition-colors bg-[var(--brand-surface)] active:bg-[var(--surface-hover)] md:hover:bg-[var(--surface-hover)]"
            style={{ borderColor: 'var(--brand-border)' }}>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate flex-1 min-w-0" style={{ color: 'var(--brand-text)' }}>{exp.user?.name ?? '—'}</span>
              <div onClick={e => e.stopPropagation()} className="shrink-0">
                <RowMenu items={[
                  { label: 'Visualizar', icon: <Eye size={12} />, onClick: () => openExpApprove(exp) },
                  { label: 'Aprovar', icon: <Check size={12} />, onClick: () => openExpApprove(exp) },
                  { label: 'Solicitar Ajuste', icon: <RotateCcw size={12} />, onClick: () => { setAdjModal({ open: true, id: exp.id, type: 'expense' }); setAdjReason('') } },
                  { label: 'Rejeitar', icon: <XCircle size={12} />, onClick: () => { setRejectModal({ open: true, ids: [exp.id] }); setRejectReason('') }, danger: true },
                  ...(exp.receipt_url ? [{ label: 'Ver Comprovante', icon: <Paperclip size={12} />, onClick: () => openReceiptUrl(exp.receipt_url!) }] : []),
                ]} />
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap"><TsStatusBadge status={exp.status} display={exp.status_display} /></div>
            <div className="mt-1.5 text-[11px] truncate flex items-center gap-1" style={{ color: 'var(--brand-subtle)' }}>
              {exp.receipt_url && <Paperclip size={10} className="shrink-0" />}
              {fmt(exp.expense_date)} · {fmtBRL(parseFloat(String(exp.amount)) || 0)}{exp.category?.name ? ` · ${exp.category.name}` : ''}{exp.project?.customer?.name ? ` · ${exp.project.customer.name}` : ''}
            </div>
          </div>
        ))}
      </div>

      {/* ── Pagination ── */}
      {currentItems.length > 0 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-[var(--text-light)]">
            {currentPag
              ? `${currentPag.from ?? 1}–${currentPag.to ?? currentItems.length} de ${currentPag.total} itens`
              : `${currentItems.length} itens`}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => tab === 'timesheets' ? setTsPage(p => Math.max(1, p - 1)) : setExpPage(p => Math.max(1, p - 1))}
              disabled={(currentPag?.current_page ?? 1) === 1}
              className="p-1.5 rounded-md text-[var(--text-light)] hover:bg-[var(--surface-hover)] disabled:opacity-30 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-[var(--text-light)] px-1">
              {currentPag?.current_page ?? 1} / {currentPag?.last_page ?? 1}
            </span>
            <button
              onClick={() => tab === 'timesheets' ? setTsPage(p => p + 1) : setExpPage(p => p + 1)}
              disabled={(currentPag?.current_page ?? 1) >= (currentPag?.last_page ?? 1)}
              className="p-1.5 rounded-md text-[var(--text-light)] hover:bg-[var(--surface-hover)] disabled:opacity-30 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Modal: visualizar apontamento ── */}
      {tsView && (
        <TimesheetViewModal
          ts={tsView}
          onClose={() => setTsView(null)}
          currentUser={user}
        />
      )}

      {/* Preview do apontamento ao passar o mouse na linha (canto superior direito) */}
      <TimesheetHoverTooltip ts={hover.ts} />


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
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-sm p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-white mb-1">Solicitar Ajuste</h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">{selected.length} apontamento(s) selecionado(s). Descreva o que os colaboradores devem corrigir.</p>
            <Label className="text-xs text-[var(--text-muted)]">Motivo do ajuste *</Label>
            <textarea
              autoFocus
              value={bulkAdjReason}
              onChange={e => setBulkAdjReason(e.target.value)}
              placeholder="Ex: Descrição incompleta, horas incorretas..."
              rows={3}
              className="mt-1 w-full bg-[var(--surface-hover)] border border-[var(--border)] text-white text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 resize-none placeholder:text-[var(--text-muted)]"
            />
            <div className="flex gap-2 mt-4 justify-end">
              <Button variant="outline" onClick={() => { setBulkAdjOpen(false); setBulkAdjReason('') }}
                className="h-8 text-xs border-[var(--border)] text-[var(--text)]">Cancelar</Button>
              <Button onClick={bulkAdjTs} disabled={bulkAdjLoading || !bulkAdjReason.trim()}
                className="h-8 text-xs bg-amber-600 hover:bg-[var(--warning-border)] text-white">
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
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-sm p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-white mb-1">Solicitar Ajuste</h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">Descreva o que o colaborador deve corrigir antes da aprovação.</p>
            <Label className="text-xs text-[var(--text-muted)]">Motivo do ajuste *</Label>
            <textarea
              autoFocus
              value={adjReason}
              onChange={e => setAdjReason(e.target.value)}
              placeholder="Ex: Comprovante ilegível, valor incorreto, descrição incompleta..."
              rows={3}
              className="mt-1 w-full bg-[var(--surface-hover)] border border-[var(--border)] text-white text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 resize-none placeholder:text-[var(--text-muted)]"
            />
            <div className="flex gap-2 mt-4 justify-end">
              <Button variant="outline" onClick={() => { setAdjModal({ open: false, id: null, type: 'expense' }); setAdjReason('') }}
                className="h-8 text-xs border-[var(--border)] text-[var(--text)]">Cancelar</Button>
              <Button onClick={handleAdjustment} disabled={adjLoading || !adjReason.trim()}
                className="h-8 text-xs bg-[var(--primary)] hover:bg-[var(--primary)] text-white">
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
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-sm p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-white mb-1">
              {rejectModal.ids.length === 1 ? 'Rejeitar item' : `Rejeitar ${rejectModal.ids.length} itens`}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">Informe o motivo da rejeição <span className="text-[var(--danger)] font-semibold">(obrigatório)</span>.</p>
            <Label className="text-xs text-[var(--text-muted)]">Motivo <span className="text-[var(--danger)]">*</span></Label>
            <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Ex: Fora do prazo, informação incorreta..."
              className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-white h-9 text-xs" />
            <div className="flex gap-2 mt-4 justify-end">
              <Button variant="outline" onClick={() => { setRejectModal({ open: false, ids: [] }); setRejectReason('') }}
                className="h-8 text-xs border-[var(--border)] text-[var(--text)]">Cancelar</Button>
              <Button onClick={handleReject} disabled={approving || !rejectReason.trim()}
                className="h-8 text-xs bg-red-600 hover:bg-[var(--danger-border)] text-white disabled:opacity-50">
                {approving ? 'Rejeitando...' : 'Confirmar rejeição'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
