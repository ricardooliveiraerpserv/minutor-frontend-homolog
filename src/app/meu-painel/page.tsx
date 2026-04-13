'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { api, ApiError } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, Lock,
  Clock, Receipt, BarChart2, LayoutDashboard, TrendingUp, TrendingDown, Minus, Eye,
  CalendarDays, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimesheetItem {
  id: number
  project_id: number
  project?: { id: number; name: string; customer?: { name: string } }
  date: string
  start_time: string
  end_time: string
  effort_hours: string
  effort_minutes: number
  observation?: string
  ticket?: string
  status: 'pending' | 'approved' | 'rejected' | 'conflicted'
  status_display: string
}

interface ExpenseItem {
  id: number
  project_id: number
  project?: { id: number; name: string }
  expense_category_id: number
  category?: { id: number; name: string }
  expense_date: string
  description: string
  amount: number
  formatted_amount: string
  expense_type: string
  payment_method: string
  status: string
  status_display: string
  charge_client: boolean
  receipt_url?: string
}

interface ProjectOption { id: number; name: string; code: string; customer?: { id: number; name: string }; service_type?: { id: number; name: string; code: string } }
interface CategoryOption { id: number; name: string; parent_id?: number | null }

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const STATUS_COLORS: Record<string, string> = {
  pending:              'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  approved:             'bg-green-500/15  text-green-400  border-green-500/25',
  rejected:             'bg-red-500/15    text-red-400    border-red-500/25',
  conflicted:           'bg-orange-500/15 text-orange-400 border-orange-500/25',
  adjustment_requested: 'bg-blue-500/15   text-blue-400   border-blue-500/25',
}

const STATUS_LABELS: Record<string, string> = {
  pending:              'Pendente',
  approved:             'Aprovado',
  rejected:             'Rejeitado',
  conflicted:           'Conflito',
  adjustment_requested: 'Ajuste',
}

const PAYMENT_FALLBACK = [
  { value: 'pix',           label: 'Pix' },
  { value: 'credit_card',   label: 'Cartão de Crédito' },
  { value: 'debit_card',    label: 'Cartão de Débito' },
  { value: 'cash',          label: 'Dinheiro' },
  { value: 'bank_transfer', label: 'Transferência' },
]

type TabType = 'overview' | 'timesheets' | 'expenses' | 'indicators' | 'hora-banco'

// ─── Banco de Horas types ─────────────────────────────────────────────────────

interface HourBankMonth {
  user_id: number
  year_month: string
  daily_hours: number
  working_days: number
  holidays_count: number
  expected_hours: number
  worked_hours: number
  month_balance: number
  previous_balance: number
  accumulated_balance: number
  paid_hours: number
  final_balance: number
}

function fmtHours(h: number): string {
  const abs = Math.abs(h)
  const hrs = Math.floor(abs)
  const min = Math.round((abs - hrs) * 60)
  const sign = h < 0 ? '-' : ''
  return min > 0 ? `${sign}${hrs}h${String(min).padStart(2, '0')}` : `${sign}${hrs}h`
}

function fmtYearMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(m) - 1]}/${y}`
}

function HBBalancePill({ value, size = 'sm' }: { value: number; size?: 'sm' | 'lg' }) {
  const isPos  = value > 0
  const isNeg  = value < 0
  const color  = isPos ? '#22c55e' : isNeg ? '#ef4444' : '#71717a'
  const bg     = isPos ? 'rgba(34,197,94,0.1)' : isNeg ? 'rgba(239,68,68,0.1)' : 'rgba(113,113,122,0.1)'
  const Icon   = isPos ? TrendingUp : isNeg ? TrendingDown : Minus
  const cls    = size === 'lg' ? 'text-lg font-bold' : 'text-xs font-semibold'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${cls}`}
      style={{ background: bg, color }}>
      <Icon size={size === 'lg' ? 14 : 10} />
      {fmtHours(value)}
    </span>
  )
}

function HBPaymentSection({ data, fixedSalary, expTotal }: { data: HourBankMonth; fixedSalary: number; expTotal: number }) {
  const hasExtra     = data.accumulated_balance > 0
  const extraHours   = hasExtra ? data.accumulated_balance : 0
  const valorHoraExt = fixedSalary > 0 ? fixedSalary / 180 : 0
  const totalExtra   = extraHours * valorHoraExt
  const totalSalario = fixedSalary + totalExtra
  const totalGeral   = totalSalario + expTotal

  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>
        Remuneração — {fmtYearMonth(data.year_month)}
      </p>

      {/* Linha 1: Valor do Serviço */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        {/* Valor Base Mensal */}
        <div className="rounded-xl p-3" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Valor Base Mensal</p>
          <p className="text-lg font-bold" style={{ color: 'var(--brand-text)' }}>
            {fixedSalary > 0 ? formatBRL(fixedSalary) : '—'}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--brand-subtle)' }}>mensal</p>
        </div>

        {/* Horas Extras */}
        <div className="rounded-xl p-3" style={{ background: hasExtra ? 'rgba(34,197,94,0.06)' : 'var(--brand-bg)', border: `1px solid ${hasExtra ? 'rgba(34,197,94,0.2)' : 'var(--brand-border)'}` }}>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Horas Extras</p>
          <p className="text-lg font-bold" style={{ color: hasExtra ? '#22c55e' : 'var(--brand-muted)' }}>
            {hasExtra ? fmtHours(extraHours) : '—'}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--brand-subtle)' }}>saldo acumulado {'>'} 0</p>
        </div>

        {/* Valor Hora Extra */}
        <div className="rounded-xl p-3" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Valor / Hora Extra</p>
          <p className="text-lg font-bold" style={{ color: valorHoraExt > 0 ? 'var(--brand-text)' : 'var(--brand-muted)' }}>
            {valorHoraExt > 0 ? formatBRL(valorHoraExt) : '—'}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--brand-subtle)' }}>fixo ÷ 180</p>
        </div>

        {/* Total do Serviço */}
        <div className="rounded-xl p-3" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Total do Serviço</p>
          <p className="text-lg font-bold" style={{ color: 'var(--brand-text)' }}>
            {fixedSalary > 0 ? formatBRL(totalSalario) : '—'}
          </p>
          {hasExtra
            ? <p className="text-[10px] mt-0.5 text-green-400">+{formatBRL(totalExtra)} extras</p>
            : <p className="text-[10px] mt-0.5" style={{ color: 'var(--brand-subtle)' }}>sem horas extras</p>
          }
        </div>
      </div>

      {/* Linha 2: Despesas + Total */}
      <div className="grid grid-cols-2 gap-3">
        {/* Despesas */}
        <div className="rounded-xl p-3" style={{ background: expTotal > 0 ? 'rgba(249,115,22,0.06)' : 'var(--brand-bg)', border: `1px solid ${expTotal > 0 ? 'rgba(249,115,22,0.2)' : 'var(--brand-border)'}` }}>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Despesas no Período</p>
          <p className="text-lg font-bold" style={{ color: expTotal > 0 ? '#f97316' : 'var(--brand-muted)' }}>
            {expTotal > 0 ? formatBRL(expTotal) : '—'}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--brand-subtle)' }}>reembolsos e gastos</p>
        </div>

        {/* Total Geral */}
        <div className="rounded-xl p-3" style={{ background: 'rgba(0,245,255,0.04)', border: '1px solid rgba(0,245,255,0.15)' }}>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>Total a Receber</p>
          <p className="text-lg font-bold" style={{ color: 'var(--brand-primary)' }}>
            {fixedSalary > 0 ? formatBRL(totalGeral) : '—'}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--brand-subtle)' }}>
            valor do serviço{hasExtra ? ' + extras' : ''}{expTotal > 0 ? ' + despesas' : ''}
          </p>
        </div>
      </div>
    </div>
  )
}

function HBCurrentMonthCard({ data, isCurrentMonth }: { data: HourBankMonth; isCurrentMonth: boolean }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays size={15} color="var(--brand-primary)" />
        <span className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>
          {fmtYearMonth(data.year_month)}
        </span>
        {isCurrentMonth && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">Em andamento</span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Horas Previstas',   value: fmtHours(data.expected_hours),   sub: `${data.working_days} dias úteis`, color: 'var(--brand-muted)' },
          { label: 'Horas Trabalhadas', value: fmtHours(data.worked_hours),     sub: '', color: 'var(--brand-text)' },
          { label: 'Saldo do Mês',      value: fmtHours(data.month_balance),    sub: '', color: data.month_balance >= 0 ? '#22c55e' : '#ef4444' },
          { label: 'Saldo Anterior',    value: fmtHours(data.previous_balance), sub: '', color: data.previous_balance > 0 ? '#22c55e' : data.previous_balance < 0 ? '#ef4444' : 'var(--brand-muted)' },
        ].map(item => (
          <div key={item.label} className="rounded-xl p-3" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>{item.label}</p>
            <p className="text-xl font-bold" style={{ color: item.color }}>{item.value}</p>
            {item.sub && <p className="text-[10px] mt-0.5" style={{ color: 'var(--brand-subtle)' }}>{item.sub}</p>}
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl px-4 py-3 flex items-center justify-between"
        style={{ background: data.accumulated_balance >= 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${data.accumulated_balance >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.15)'}` }}>
        <div>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Saldo Acumulado</p>
          <HBBalancePill value={data.accumulated_balance} size="lg" />
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Saldo Final</p>
          <HBBalancePill value={data.final_balance} size="lg" />
        </div>
      </div>
    </div>
  )
}

function HBHistoryRow({ row }: { row: HourBankMonth }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr className="border-b cursor-pointer hover:bg-white/[0.02] transition-colors" style={{ borderColor: 'var(--brand-border)' }}
        onClick={() => setOpen(o => !o)}>
        <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--brand-text)' }}>
          <span className="flex items-center gap-1.5">
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {fmtYearMonth(row.year_month)}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-center" style={{ color: 'var(--brand-muted)' }}>{fmtHours(row.expected_hours)}</td>
        <td className="px-4 py-3 text-sm text-center" style={{ color: 'var(--brand-text)' }}>{fmtHours(row.worked_hours)}</td>
        <td className="px-4 py-3 text-center"><HBBalancePill value={row.month_balance} /></td>
        <td className="px-4 py-3 text-center"><HBBalancePill value={row.previous_balance} /></td>
        <td className="px-4 py-3 text-center"><HBBalancePill value={row.final_balance} /></td>
      </tr>
      {open && (
        <tr style={{ background: 'rgba(255,255,255,0.015)', borderBottom: `1px solid var(--brand-border)` }}>
          <td colSpan={6} className="px-6 py-3">
            <div className="flex items-center gap-6 text-xs" style={{ color: 'var(--brand-muted)' }}>
              <span><span className="text-zinc-500">Dias úteis:</span> {row.working_days}</span>
              <span><span className="text-zinc-500">Feriados:</span> {row.holidays_count}</span>
              <span><span className="text-zinc-500">H/dia:</span> {row.daily_hours}h</span>
              <span><span className="text-zinc-500">Acumulado:</span> <HBBalancePill value={row.accumulated_balance} /></span>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function minutesToHours(minutes: number): string {
  if (!minutes) return '0h'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function isLocked(status: string): boolean {
  return status === 'approved'
}

function periodBounds(year: number, month: number): { startDate: string; endDate: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(year, month + 1, 0).getDate()
  return {
    startDate: `${year}-${pad(month + 1)}-01`,
    endDate:   `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReceiptLinkInline({ url }: { url: string }) {
  const [loading, setLoading] = useState(false)
  const open = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('minutor_token')
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok) { alert('Comprovante não encontrado no servidor'); return }
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      window.open(blobUrl, '_blank')
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
    } catch { alert('Erro ao abrir comprovante') }
    finally { setLoading(false) }
  }
  return (
    <button type="button" onClick={open} disabled={loading}
      className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50">
      {loading ? 'Abrindo...' : 'Visualizar'}
    </button>
  )
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg shadow-2xl">
        <button onClick={onClose}
          className="absolute top-3.5 right-3.5 text-zinc-500 hover:text-zinc-300 transition-colors">
          <X size={15} />
        </button>
        {children}
      </div>
    </div>
  )
}

function SummaryCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  accent: string
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>
          <Icon size={14} />
        </div>
      </div>
      <div className="text-3xl font-bold text-white tracking-tight">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1.5">{sub}</div>}
    </div>
  )
}

function BarChartRow({
  label, minutes, maxMinutes, color = '#00F5FF',
}: {
  label: string; minutes: number; maxMinutes: number; color?: string
}) {
  const pct = maxMinutes > 0 ? (minutes / maxMinutes) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-xs text-zinc-400 text-right truncate shrink-0">{label}</div>
      <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-14 text-xs text-zinc-400 text-right shrink-0">{minutesToHours(minutes)}</div>
    </div>
  )
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <tr key={i} className="border-b border-zinc-800">
          {[...Array(cols)].map((_, j) => (
            <td key={j} className="px-4 py-3.5"><Skeleton className="h-4 w-full" /></td>
          ))}
        </tr>
      ))}
    </>
  )
}

function StatusBadge({ status, display }: { status: string; display?: string }) {
  if (status === 'approved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-green-500/15 text-green-400 border-green-500/25">
        <Lock size={9} />
        Aprovado
      </span>
    )
  }
  return (
    <Badge variant="outline" className={`text-[10px] font-medium border ${STATUS_COLORS[status] ?? 'text-zinc-400 border-zinc-700'}`}>
      {STATUS_LABELS[status] ?? display ?? status}
    </Badge>
  )
}

function SelectField({ label, value, onChange, children, required }: {
  label: string
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <div>
      <Label className="text-xs text-zinc-400">{label}{required && ' *'}</Label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1.5 w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg h-9 px-2.5 outline-none focus:border-zinc-500 transition-colors appearance-none"
      >
        {children}
      </select>
    </div>
  )
}

// ─── Initial form states ──────────────────────────────────────────────────────

const todayISO = () => new Date().toISOString().split('T')[0]

// ── Time helpers ─────────────────────────────────────────────────────────────
function addHoursToTime(timeStr: string, hours: number): string {
  const [h, m] = timeStr.split(':').map(Number)
  const totalMin = h * 60 + m + Math.round(hours * 60)
  const newH = Math.floor(totalMin / 60) % 24
  const newM = totalMin % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}
function timeDiffHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startMin = sh * 60 + sm
  let endMin = eh * 60 + em
  if (endMin <= startMin) endMin += 24 * 60
  return (endMin - startMin) / 60
}
function hoursToHHMM(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function isSustentacao(serviceTypeName?: string): boolean {
  if (!serviceTypeName) return false
  return serviceTypeName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('sustentacao')
}

const EMPTY_TS = {
  customer_id: '',
  project_id:  '',
  date:        todayISO(),
  start_time:  '',
  end_time:    '',
  total_hours: '',
  observation: '',
  ticket:      '',
}

const EMPTY_EXP = {
  customer_id:         '',
  project_id:          '',
  expense_category_id: '',
  expense_date:        todayISO(),
  description:         '',
  amount:              '',
  expense_type:        'reimbursement',
  payment_method:      '',
  charge_client:       false,
  receipt_url:         '' as string,
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MeuPainelPage() {
  const { user } = useAuth()

  // Period
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const { startDate, endDate } = periodBounds(year, month)

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  // Tabs
  const [activeTab, setActiveTab] = useState<TabType>('overview')

  // ── Timesheet state ────────────────────────────────────────────────────────
  const [timesheets, setTimesheets] = useState<TimesheetItem[]>([])
  const [tsLoading,  setTsLoading]  = useState(true)
  const [tsTotalMin, setTsTotalMin] = useState(0)
  const [tsSearch,   setTsSearch]   = useState('')
  const [tsProject,  setTsProject]  = useState('')
  const [tsCustomer, setTsCustomer] = useState('')
  const [tsStatus,   setTsStatus]   = useState('')
  const [tsDateFrom, setTsDateFrom] = useState('')
  const [tsDateTo,   setTsDateTo]   = useState('')
  const [tsPage,     setTsPage]     = useState(1)
  const [tsHasNext,  setTsHasNext]  = useState(false)
  const [tsModal,    setTsModal]    = useState<{ open: boolean; item?: TimesheetItem }>({ open: false })
  const [tsViewItem, setTsViewItem] = useState<TimesheetItem | null>(null)
  const [tsForm,     setTsForm]     = useState({ ...EMPTY_TS })
  const [tsSaving,   setTsSaving]   = useState(false)

  // ── Expense state ──────────────────────────────────────────────────────────
  const [expenses,   setExpenses]  = useState<ExpenseItem[]>([])
  const [expLoading, setExpLoading] = useState(true)
  const [expTotal,   setExpTotal]   = useState(0)
  const [expSearch,  setExpSearch]  = useState('')
  const [expProject, setExpProject] = useState('')
  const [expStatus,  setExpStatus]  = useState('')
  const [expPage,    setExpPage]    = useState(1)
  const [expHasNext, setExpHasNext] = useState(false)
  const [expModal,   setExpModal]   = useState<{ open: boolean; item?: ExpenseItem }>({ open: false })
  const [expForm,    setExpForm]    = useState({ ...EMPTY_EXP })
  const [expSaving,  setExpSaving]  = useState(false)
  const [expFile,    setExpFile]    = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Banco de Horas state ───────────────────────────────────────────────────
  const [hbCurrent,    setHbCurrent]    = useState<HourBankMonth | null>(null)
  const [hbHistory,    setHbHistory]    = useState<HourBankMonth[]>([])
  const [hbLoading,    setHbLoading]    = useState(false)
  const [hbKey,        setHbKey]        = useState(0)
  const [hbStartDate,  setHbStartDate]  = useState<string | null>(null)

  // ── Support data ───────────────────────────────────────────────────────────
  const [projects,       setProjects]       = useState<ProjectOption[]>([])
  const [categories,     setCategories]     = useState<CategoryOption[]>([])
  const [paymentMethods, setPaymentMethods] = useState<{ value: string; label: string }[]>([])

  // Load support data once
  useEffect(() => {
    api.get<any>('/my-projects?pageSize=200').then(r =>
      setProjects(Array.isArray(r?.items) ? r.items : [])
    ).catch(() => {})

    api.get<any>('/expense-categories?per_page=200').then(r => {
      const list: CategoryOption[] = Array.isArray(r?.data)  ? r.data
                                   : Array.isArray(r?.items) ? r.items : []
      setCategories(list.filter(c => !c.parent_id))
    }).catch(() => {})

    api.get<any>('/payment-methods').then(r => {
      const list = Array.isArray(r?.data) ? r.data : Array.isArray(r?.items) ? r.items : []
      if (list.length > 0) {
        setPaymentMethods(list.map((pm: any) => ({
          value: pm.code ?? pm.value,
          label: pm.name ?? pm.label,
        })))
      }
    }).catch(() => {})
  }, [])

  // ── Load timesheets ────────────────────────────────────────────────────────
  const loadTimesheets = useCallback(async () => {
    setTsLoading(true)
    try {
      const p = new URLSearchParams({
        page: String(tsPage),
        per_page: '50',
        start_date: tsDateFrom || startDate,
        end_date:   tsDateTo   || endDate,
      })
      if (tsSearch)   p.set('search',      tsSearch)
      if (tsProject)  p.set('project_id',  tsProject)
      if (tsCustomer) p.set('customer_id', tsCustomer)
      if (tsStatus)   p.set('status',      tsStatus)
      const r = await api.get<any>(`/timesheets?${p}`)
      setTimesheets(Array.isArray(r?.items) ? r.items : [])
      setTsHasNext(!!r?.hasNext)
      setTsTotalMin(r?.totalEffortMinutes ?? 0)
    } catch { toast.error('Erro ao carregar apontamentos') }
    finally   { setTsLoading(false) }
  }, [tsPage, startDate, endDate, tsSearch, tsProject, tsCustomer, tsStatus, tsDateFrom, tsDateTo])

  // ── Load expenses ──────────────────────────────────────────────────────────
  const loadExpenses = useCallback(async () => {
    setExpLoading(true)
    try {
      const p = new URLSearchParams({ page: String(expPage), pageSize: '50', start_date: startDate, end_date: endDate })
      if (expSearch)  p.set('search',     expSearch)
      if (expProject) p.set('project_id', expProject)
      if (expStatus)  p.set('status',     expStatus)
      const r = await api.get<any>(`/expenses?${p}`)
      const list: ExpenseItem[] = Array.isArray(r?.items) ? r.items : []
      setExpenses(list)
      setExpHasNext(!!r?.hasNext)
      setExpTotal(list.reduce((acc, e) => acc + (parseFloat(String(e.amount)) || 0), 0))
    } catch { toast.error('Erro ao carregar despesas') }
    finally   { setExpLoading(false) }
  }, [expPage, startDate, endDate, expSearch, expProject, expStatus])

  useEffect(() => { loadTimesheets() }, [loadTimesheets])
  useEffect(() => { loadExpenses() },  [loadExpenses])

  // Reset pages when period changes
  useEffect(() => { setTsPage(1); setExpPage(1) }, [startDate, endDate])

  // ── Load Banco de Horas (only for bh_fixo / bh_mensal consultants) ─────────
  useEffect(() => {
    const ct = (user as any)?.consultant_type
    if (ct !== 'bh_fixo' && ct !== 'bh_mensal') return
    if (!user?.id) return
    setHbLoading(true)
    const pad = (n: number) => String(n).padStart(2, '0')
    const yearMonth = `${year}-${pad(month + 1)}`
    api.get<{ current: HourBankMonth | null; history: HourBankMonth[]; bank_hours_start_date: string | null }>(
      `/consultant-hour-bank/${user.id}/range?year_month=${yearMonth}`
    )
      .then(r => {
        setHbCurrent(r.current ?? null)
        setHbHistory(r.history ?? [])
        setHbStartDate(r.bank_hours_start_date ?? null)
      })
      .catch(() => toast.error('Erro ao carregar banco de horas'))
      .finally(() => setHbLoading(false))
  }, [user, year, month, hbKey])

  // ── Timesheet CRUD ─────────────────────────────────────────────────────────

  const openCreateTs = () => {
    setTsForm({ ...EMPTY_TS, date: todayISO() })
    setTsModal({ open: true })
  }

  const openEditTs = (item: TimesheetItem) => {
    const proj = projects.find(p => p.id === item.project_id)
    const derivedTotal = item.start_time && item.end_time
      ? String(Math.round(timeDiffHours(item.start_time, item.end_time) * 10) / 10)
      : item.effort_hours ? String(Math.round(parseFloat(item.effort_hours) * 10) / 10) : ''
    setTsForm({
      customer_id: proj?.customer ? String(proj.customer.id) : '',
      project_id:  String(item.project_id),
      date:        item.date,
      start_time:  item.start_time,
      end_time:    item.end_time,
      total_hours: derivedTotal,
      observation: item.observation ?? '',
      ticket:      item.ticket ?? '',
    })
    setTsModal({ open: true, item })
  }

  const saveTs = async () => {
    if (!tsForm.project_id) { toast.error('Selecione um projeto'); return }
    if (!tsForm.date)        { toast.error('Informe a data'); return }
    const totalVal = parseFloat(tsForm.total_hours)
    const hasTotal = !isNaN(totalVal) && totalVal > 0
    const hasStart = !!tsForm.start_time
    if (!hasTotal && !hasStart) { toast.error('Informe o horário ou o total de horas'); return }
    if (!tsForm.observation || tsForm.observation.trim().length < 20) {
      toast.error('Descrição obrigatória com no mínimo 20 caracteres'); return
    }
    const selectedProject = projects.find(p => p.id === Number(tsForm.project_id))
    const projectIsSustentacao = isSustentacao(selectedProject?.service_type?.name)
    if (projectIsSustentacao) {
      if (!tsForm.ticket || !tsForm.ticket.trim()) { toast.error('Informe o número do ticket'); return }
      if (!/^\d+$/.test(tsForm.ticket.trim()))    { toast.error('O ticket deve ser numérico'); return }
    }
    setTsSaving(true)
    try {
      const payload: Record<string, unknown> = {
        project_id:  Number(tsForm.project_id),
        date:        tsForm.date,
        observation: tsForm.observation || undefined,
        ticket:      tsForm.ticket      || undefined,
      }
      if (hasTotal && !hasStart) {
        // Total informado sem início/fim — envia total_hours diretamente
        payload.total_hours = hoursToHHMM(totalVal)
        payload.start_time  = null
        payload.end_time    = null
      } else {
        payload.start_time = tsForm.start_time
        payload.end_time   = tsForm.end_time
      }
      if (tsModal.item) await api.put(`/timesheets/${tsModal.item.id}`, payload)
      else              await api.post('/timesheets', payload)
      toast.success(tsModal.item ? 'Apontamento atualizado' : 'Apontamento criado')
      setTsModal({ open: false })
      loadTimesheets()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally     { setTsSaving(false) }
  }

  const deleteTs = async (id: number) => {
    if (!confirm('Excluir este apontamento?')) return
    try {
      await api.delete(`/timesheets/${id}`)
      toast.success('Apontamento excluído')
      loadTimesheets()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
  }

  // ── Expense CRUD ───────────────────────────────────────────────────────────

  const openCreateExp = () => {
    setExpForm({ ...EMPTY_EXP, expense_date: todayISO() })
    setExpFile(null)
    setExpModal({ open: true })
  }

  const openEditExp = (item: ExpenseItem) => {
    const proj = projects.find(p => p.id === item.project_id)
    setExpForm({
      customer_id:         proj?.customer ? String(proj.customer.id) : '',
      project_id:          String(item.project_id),
      expense_category_id: String(item.expense_category_id),
      expense_date:        item.expense_date,
      description:         item.description,
      amount:              String(item.amount),
      expense_type:        item.expense_type,
      payment_method:      item.payment_method,
      charge_client:       item.charge_client,
      receipt_url:         item.receipt_url ?? '',
    })
    setExpFile(null)
    setExpModal({ open: true, item })
  }

  const saveExp = async () => {
    if (!expForm.project_id)  { toast.error('Selecione um projeto'); return }
    if (!expForm.description) { toast.error('Informe a descrição'); return }
    if (!expForm.amount)      { toast.error('Informe o valor'); return }
    setExpSaving(true)
    try {
      const token = localStorage.getItem('minutor_token')
      const fd = new FormData()
      fd.append('project_id',          expForm.project_id)
      fd.append('expense_category_id', expForm.expense_category_id)
      fd.append('expense_date',        expForm.expense_date)
      fd.append('description',         expForm.description)
      fd.append('amount',              expForm.amount)
      fd.append('expense_type',        expForm.expense_type)
      fd.append('payment_method',      expForm.payment_method)
      fd.append('charge_client',       expForm.charge_client ? '1' : '0')
      if (expFile) fd.append('receipt', expFile)

      const url    = expModal.item ? `/api/v1/expenses/${expModal.item.id}` : '/api/v1/expenses'
      const method = 'POST'
      if (expModal.item) fd.append('_method', 'PUT')

      const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const details = err.details ?? err.errors
        const detailMsg = Array.isArray(details) ? details.join('; ')
          : typeof details === 'object' && details !== null
            ? Object.values(details).flat().join('; ')
            : undefined
        throw new Error(detailMsg ?? err.detailMessage ?? err.message ?? 'Erro ao salvar')
      }
      toast.success(expModal.item ? 'Despesa atualizada' : 'Despesa criada')
      setExpModal({ open: false })
      loadExpenses()
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao salvar') }
    finally          { setExpSaving(false) }
  }

  const deleteExp = async (id: number) => {
    if (!confirm('Excluir esta despesa?')) return
    try {
      await api.delete(`/expenses/${id}`)
      toast.success('Despesa excluída')
      loadExpenses()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
  }

  // ── Indicators data ────────────────────────────────────────────────────────

  const tsByProject = useMemo(() => {
    const map: Record<string, { name: string; minutes: number }> = {}
    timesheets.forEach(ts => {
      const key = String(ts.project_id)
      if (!map[key]) map[key] = { name: ts.project?.name ?? `Projeto ${ts.project_id}`, minutes: 0 }
      map[key].minutes += ts.effort_minutes
    })
    return Object.values(map).sort((a, b) => b.minutes - a.minutes).slice(0, 8)
  }, [timesheets])

  const tsByCustomer = useMemo(() => {
    const map: Record<string, { name: string; minutes: number }> = {}
    timesheets.forEach(ts => {
      const key = ts.project?.customer?.name ?? 'Sem cliente'
      if (!map[key]) map[key] = { name: key, minutes: 0 }
      map[key].minutes += ts.effort_minutes
    })
    return Object.values(map).sort((a, b) => b.minutes - a.minutes).slice(0, 6)
  }, [timesheets])

  const maxProjectMin  = tsByProject[0]?.minutes  ?? 1
  const maxCustomerMin = tsByCustomer[0]?.minutes ?? 1

  // Estimated value (if user has hourly_rate)
  const hourlyRate       = (user as any)?.hourly_rate ?? 0
  const rateType         = (user as any)?.rate_type ?? 'hourly'
  const guaranteedHours  = (user as any)?.guaranteed_hours ?? null
  const workedHours      = tsTotalMin / 60
  // Para horistas com horas garantidas: piso mínimo de cobrança
  const billableHours    = guaranteedHours !== null
    ? Math.max(workedHours, Number(guaranteedHours))
    : workedHours
  const estimatedValue   = hourlyRate > 0 && rateType === 'hourly'
    ? billableHours * hourlyRate
    : null

  const approvedTs  = timesheets.filter(t => t.status === 'approved').length
  const pendingTs   = timesheets.filter(t => t.status === 'pending').length
  const pendingExp  = expenses.filter(e => e.status === 'pending').length

  // ── Tabs config ────────────────────────────────────────────────────────────

  const isHBConsultant = ['bh_fixo', 'bh_mensal'].includes((user as any)?.consultant_type ?? '')

  const TABS: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'overview',   label: 'Total Geral',  icon: LayoutDashboard },
    { id: 'timesheets', label: 'Apontamentos', icon: Clock },
    { id: 'expenses',   label: 'Despesas',     icon: Receipt },
    { id: 'indicators', label: 'Indicadores',  icon: BarChart2 },
    ...(isHBConsultant ? [{ id: 'hora-banco' as TabType, label: 'Banco de Horas', icon: CalendarDays }] : []),
  ]

  const pmOptions = paymentMethods.length > 0 ? paymentMethods : PAYMENT_FALLBACK

  // Clientes únicos derivados dos projetos do usuário
  const consultantCustomers = useMemo(() => {
    const seen = new Set<number>()
    const list: { id: number; name: string }[] = []
    projects.forEach(p => {
      if (p.customer && !seen.has(p.customer.id)) {
        seen.add(p.customer.id)
        list.push(p.customer)
      }
    })
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [projects])

  // Projetos filtrados pelo cliente selecionado no form de despesa
  const expProjectOptions = useMemo(() => {
    if (!expForm.customer_id) return projects
    return projects.filter(p => p.customer && String(p.customer.id) === expForm.customer_id)
  }, [projects, expForm.customer_id])

  // Projetos filtrados pelo cliente selecionado no form de apontamento
  const tsProjectOptions = useMemo(() => {
    if (!tsForm.customer_id) return projects
    return projects.filter(p => p.customer && String(p.customer.id) === tsForm.customer_id)
  }, [projects, tsForm.customer_id])

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <AppLayout title="Meu Painel">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">

        {/* Period selector */}
        <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-1.5 py-1">
          <button onClick={prevMonth}
            className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-semibold text-white min-w-[148px] text-center select-none">
            {MONTHS[month]} {year}
          </span>
          <button onClick={nextMonth}
            className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Quick add */}
        <div className="flex items-center gap-2">
          <Button onClick={openCreateTs}
            className="bg-blue-600 hover:bg-blue-500 text-white h-9 px-4 text-xs gap-2">
            <Clock size={13} />
            Apontamento
          </Button>
          <Button onClick={openCreateExp} variant="outline"
            className="border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 h-9 px-4 text-xs gap-2">
            <Receipt size={13} />
            Despesa
          </Button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-0.5 border-b border-zinc-800 mb-6">
        {TABS.map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                active
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
              }`}>
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Tab: Total Geral
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-5">

          {/* Summary cards */}
          <div className={`grid gap-3 ${isHBConsultant ? 'grid-cols-2 lg:grid-cols-5' : 'grid-cols-2 lg:grid-cols-6'}`}>
            <SummaryCard
              label="Horas no Período"
              value={minutesToHours(tsTotalMin)}
              sub={`${(tsTotalMin / 60).toFixed(1)}h apontadas`}
              icon={Clock}
              accent="bg-blue-500/15 text-blue-400"
            />
            {isHBConsultant ? (() => {
              const pad = (n: number) => String(n).padStart(2, '0')
              const selectedYM    = `${year}-${pad(month + 1)}`
              const startYM       = hbStartDate ? hbStartDate.substring(0, 7) : null
              const beforeStart   = startYM !== null && selectedYM < startYM
              const fixedSalary   = hourlyRate
              const extraHours    = !beforeStart && hbCurrent && hbCurrent.accumulated_balance > 0 ? hbCurrent.accumulated_balance : 0
              const valorHoraExt  = fixedSalary > 0 ? fixedSalary / 180 : 0
              const totalExtra    = extraHours * valorHoraExt
              const total         = fixedSalary + totalExtra + expTotal
              return (
                <SummaryCard
                  label="Total a Receber"
                  value={beforeStart ? '—' : fixedSalary > 0 ? formatBRL(total) : '—'}
                  sub={beforeStart
                    ? `Inicia em ${startYM ? fmtYearMonth(startYM) : '—'}`
                    : extraHours > 0 || expTotal > 0
                      ? `Valor do serviço${extraHours > 0 ? ' + extras' : ''}${expTotal > 0 ? ' + despesas' : ''}`
                      : 'Sem extras ou despesas'}
                  icon={TrendingUp}
                  accent="bg-green-500/15 text-green-400"
                />
              )
            })() : (
              <>
                <SummaryCard
                  label="Valor Total do Serviço"
                  value={estimatedValue !== null ? formatBRL(estimatedValue) : '—'}
                  sub={estimatedValue !== null
                    ? guaranteedHours !== null && workedHours < Number(guaranteedHours)
                      ? `${formatBRL(hourlyRate)}/h × ${Number(guaranteedHours)}h (garantido)`
                      : `${formatBRL(hourlyRate)}/h × ${workedHours.toFixed(1)}h`
                    : 'Taxa não configurada'}
                  icon={TrendingUp}
                  accent="bg-green-500/15 text-green-400"
                />
                <SummaryCard
                  label="Total Despesas"
                  value={formatBRL(expTotal)}
                  sub={`${expenses.length} lançamento${expenses.length !== 1 ? 's' : ''}`}
                  icon={Receipt}
                  accent="bg-orange-500/15 text-orange-400"
                />
                <SummaryCard
                  label="Total Geral"
                  value={estimatedValue !== null ? formatBRL(estimatedValue + expTotal) : expTotal > 0 ? formatBRL(expTotal) : '—'}
                  sub={estimatedValue !== null
                    ? expTotal > 0 ? 'Serviço + despesas' : 'Somente serviço'
                    : expTotal > 0 ? 'Somente despesas' : 'Sem lançamentos'}
                  icon={TrendingUp}
                  accent="bg-cyan-500/15 text-cyan-400"
                />
              </>
            )}
            {isHBConsultant && (
              <SummaryCard
                label="Total Despesas"
                value={formatBRL(expTotal)}
                sub={`${expenses.length} lançamento${expenses.length !== 1 ? 's' : ''}`}
                icon={Receipt}
                accent="bg-orange-500/15 text-orange-400"
              />
            )}
            <SummaryCard
              label="Aprovações"
              value={`${approvedTs} / ${timesheets.length}`}
              sub={`${pendingTs} pendente${pendingTs !== 1 ? 's' : ''}`}
              icon={BarChart2}
              accent="bg-purple-500/15 text-purple-400"
            />
            <SummaryCard
              label="Despesas Pendentes"
              value={String(pendingExp)}
              sub={pendingExp > 0 ? 'aguardando aprovação' : 'sem pendências'}
              icon={Receipt}
              accent="bg-yellow-500/15 text-yellow-400"
            />
          </div>

          {/* Recent lists */}
          <div className="grid md:grid-cols-2 gap-4">

            {/* Recent timesheets */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900">
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Apontamentos Recentes</h3>
                <button onClick={() => setActiveTab('timesheets')}
                  className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors">
                  Ver todos →
                </button>
              </div>
              <div className="divide-y divide-zinc-800">
                {tsLoading
                  ? [...Array(4)].map((_, i) => (
                      <div key={i} className="px-5 py-3.5 flex items-center gap-3">
                        <Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-16" />
                      </div>
                    ))
                  : timesheets.length === 0
                    ? <div className="px-5 py-8 text-center text-sm text-zinc-600">Nenhum apontamento no período</div>
                    : timesheets.slice(0, 6).map(ts => (
                        <div key={ts.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-zinc-200 truncate">
                              {ts.project?.name ?? '—'}
                            </div>
                            <div className="text-[11px] text-zinc-600 mt-0.5">{ts.date}</div>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="text-xs font-mono font-semibold text-zinc-300">
                              {ts.effort_hours}
                            </span>
                            <StatusBadge status={ts.status} display={ts.status_display} />
                          </div>
                        </div>
                      ))
                }
              </div>
            </div>

            {/* Recent expenses */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900">
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Despesas Recentes</h3>
                <button onClick={() => setActiveTab('expenses')}
                  className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors">
                  Ver todas →
                </button>
              </div>
              <div className="divide-y divide-zinc-800">
                {expLoading
                  ? [...Array(4)].map((_, i) => (
                      <div key={i} className="px-5 py-3.5 flex items-center gap-3">
                        <Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-16" />
                      </div>
                    ))
                  : expenses.length === 0
                    ? <div className="px-5 py-8 text-center text-sm text-zinc-600">Nenhuma despesa no período</div>
                    : expenses.slice(0, 6).map(exp => (
                        <div key={exp.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-zinc-200 truncate">{exp.description}</div>
                            <div className="text-[11px] text-zinc-600 mt-0.5">
                              {exp.expense_date} · {exp.project?.name}
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="text-xs font-semibold text-zinc-300">{exp.formatted_amount}</span>
                            <StatusBadge status={exp.status} display={exp.status_display} />
                          </div>
                        </div>
                      ))
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Tab: Apontamentos
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'timesheets' && (
        <div>
          {/* Filters bar */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <Input value={tsSearch}
              onChange={e => { setTsSearch(e.target.value); setTsPage(1) }}
              placeholder="Buscar por projeto, observação..."
              className="flex-1 min-w-40 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
            <select value={tsCustomer}
              onChange={e => { setTsCustomer(e.target.value); setTsPage(1) }}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg h-9 px-2.5 outline-none">
              <option value="">Todos os clientes</option>
              {consultantCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={tsProject}
              onChange={e => { setTsProject(e.target.value); setTsPage(1) }}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg h-9 px-2.5 outline-none">
              <option value="">Todos os projetos</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={tsStatus}
              onChange={e => { setTsStatus(e.target.value); setTsPage(1) }}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg h-9 px-2.5 outline-none">
              <option value="">Todos os status</option>
              <option value="pending">Pendente</option>
              <option value="approved">Aprovado</option>
              <option value="rejected">Rejeitado</option>
            </select>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500 shrink-0">De</span>
              <input type="date" value={tsDateFrom}
                onChange={e => { setTsDateFrom(e.target.value); setTsPage(1) }}
                className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg h-9 px-2.5 outline-none" />
              <span className="text-xs text-zinc-500 shrink-0">até</span>
              <input type="date" value={tsDateTo}
                onChange={e => { setTsDateTo(e.target.value); setTsPage(1) }}
                className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg h-9 px-2.5 outline-none" />
            </div>
            <Button onClick={openCreateTs}
              className="bg-blue-600 hover:bg-blue-500 text-white h-9 px-4 text-xs gap-1.5 shrink-0">
              <Plus size={13} /> Novo
            </Button>
          </div>

          {/* Total bar */}
          {!tsLoading && tsTotalMin > 0 && (
            <div className="flex items-center gap-4 mb-3 text-xs text-zinc-500">
              <span>Total: <span className="text-white font-semibold">{minutesToHours(tsTotalMin)}</span></span>
              <span>Aprovados: <span className="text-green-400 font-medium">{approvedTs}</span></span>
              <span>Pendentes: <span className="text-yellow-400 font-medium">{pendingTs}</span></span>
            </div>
          )}

          {/* Table */}
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60">
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium">Data</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium">Projeto</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium hidden md:table-cell">Horário</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium">Horas</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium hidden lg:table-cell">Observação</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium">Status</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {tsLoading ? (
                  <TableSkeleton cols={7} />
                ) : timesheets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-14 text-center text-zinc-600">
                      Nenhum apontamento no período
                    </td>
                  </tr>
                ) : timesheets.map(ts => {
                  const locked = isLocked(ts.status)
                  return (
                    <tr key={ts.id}
                      className={`border-b border-zinc-800 transition-colors last:border-0 ${
                        locked ? 'bg-zinc-900/40' : 'hover:bg-zinc-800/25'
                      }`}>
                      <td className="px-4 py-3.5 text-zinc-300 font-medium tabular-nums">{ts.date}</td>
                      <td className="px-4 py-3.5 text-zinc-200 max-w-[160px] truncate">
                        {ts.project?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-500 font-mono hidden md:table-cell">
                        {ts.start_time} – {ts.end_time}
                      </td>
                      <td className="px-4 py-3.5 text-white font-mono font-bold">{ts.effort_hours}</td>
                      <td className="px-4 py-3.5 text-zinc-500 hidden lg:table-cell max-w-[200px] truncate">
                        {ts.observation ?? <span className="text-zinc-700">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={ts.status} display={ts.status_display} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-0.5 justify-end">
                          <button onClick={() => setTsViewItem(ts)}
                            className="p-1.5 text-zinc-600 hover:text-blue-400 transition-colors rounded">
                            <Eye size={12} />
                          </button>
                          {!locked && (
                            <>
                              <button onClick={() => openEditTs(ts)}
                                className="p-1.5 text-zinc-600 hover:text-zinc-200 transition-colors rounded">
                                <Pencil size={12} />
                              </button>
                              <button onClick={() => deleteTs(ts.id)}
                                className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors rounded">
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {(tsPage > 1 || tsHasNext) && (
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setTsPage(p => p - 1)} disabled={tsPage === 1}
                className="p-1.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-30 rounded transition-colors">
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-zinc-500">Página {tsPage}</span>
              <button onClick={() => setTsPage(p => p + 1)} disabled={!tsHasNext}
                className="p-1.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-30 rounded transition-colors">
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Tab: Despesas
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'expenses' && (
        <div>
          {/* Filters */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <Input value={expSearch}
              onChange={e => { setExpSearch(e.target.value); setExpPage(1) }}
              placeholder="Buscar por descrição..."
              className="flex-1 min-w-40 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
            <select value={expProject}
              onChange={e => { setExpProject(e.target.value); setExpPage(1) }}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg h-9 px-2.5 outline-none">
              <option value="">Todos os projetos</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={expStatus}
              onChange={e => { setExpStatus(e.target.value); setExpPage(1) }}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg h-9 px-2.5 outline-none">
              <option value="">Todos os status</option>
              <option value="pending">Pendente</option>
              <option value="approved">Aprovado</option>
              <option value="rejected">Rejeitado</option>
            </select>
            <Button onClick={openCreateExp}
              className="bg-blue-600 hover:bg-blue-500 text-white h-9 px-4 text-xs gap-1.5 shrink-0">
              <Plus size={13} /> Nova
            </Button>
          </div>

          {/* Total */}
          {!expLoading && expTotal > 0 && (
            <div className="text-xs text-zinc-500 mb-3">
              Total: <span className="text-white font-semibold">{formatBRL(expTotal)}</span>
              <span className="ml-4">
                Aprovadas: <span className="text-green-400 font-medium">
                  {expenses.filter(e => e.status === 'approved').length}
                </span>
              </span>
            </div>
          )}

          {/* Table */}
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60">
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium">Data</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium">Descrição</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium hidden md:table-cell">Projeto</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium hidden lg:table-cell">Categoria</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium">Valor</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium">Status</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {expLoading ? (
                  <TableSkeleton cols={7} />
                ) : expenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-14 text-center text-zinc-600">
                      Nenhuma despesa no período
                    </td>
                  </tr>
                ) : expenses.map(exp => {
                  const locked = isLocked(exp.status)
                  return (
                    <tr key={exp.id}
                      className={`border-b border-zinc-800 transition-colors last:border-0 ${
                        locked ? 'bg-zinc-900/40' : 'hover:bg-zinc-800/25'
                      }`}>
                      <td className="px-4 py-3.5 text-zinc-300 font-medium tabular-nums">{exp.expense_date}</td>
                      <td className="px-4 py-3.5 text-zinc-200 max-w-[180px] truncate">{exp.description}</td>
                      <td className="px-4 py-3.5 text-zinc-400 hidden md:table-cell">{exp.project?.name ?? '—'}</td>
                      <td className="px-4 py-3.5 text-zinc-400 hidden lg:table-cell">{exp.category?.name ?? '—'}</td>
                      <td className="px-4 py-3.5 text-white font-bold">{exp.formatted_amount}</td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={exp.status} display={exp.status_display} />
                      </td>
                      <td className="px-4 py-3.5">
                        {!locked && (
                          <div className="flex items-center gap-0.5 justify-end">
                            <button onClick={() => openEditExp(exp)}
                              className="p-1.5 text-zinc-600 hover:text-zinc-200 transition-colors rounded">
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => deleteExp(exp.id)}
                              className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors rounded">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {(expPage > 1 || expHasNext) && (
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setExpPage(p => p - 1)} disabled={expPage === 1}
                className="p-1.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-30 rounded transition-colors">
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-zinc-500">Página {expPage}</span>
              <button onClick={() => setExpPage(p => p + 1)} disabled={!expHasNext}
                className="p-1.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-30 rounded transition-colors">
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Tab: Indicadores
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'indicators' && (
        <div className="space-y-4">

          {/* Top summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-center">
              <div className="text-3xl font-bold text-white">{minutesToHours(tsTotalMin)}</div>
              <div className="text-xs text-zinc-500 mt-2">Total de Horas</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-center">
              <div className="text-3xl font-bold text-white">{tsByProject.length}</div>
              <div className="text-xs text-zinc-500 mt-2">Projetos com Horas</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-center">
              <div className="text-3xl font-bold text-white">{formatBRL(expTotal)}</div>
              <div className="text-xs text-zinc-500 mt-2">Total Despesas</div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">

            {/* Horas por Projeto */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h3 className="text-sm font-semibold text-white mb-5">Horas por Projeto</h3>
              {tsByProject.length === 0 ? (
                <div className="py-8 text-center text-sm text-zinc-600">Nenhum dado no período</div>
              ) : (
                <div className="space-y-3.5">
                  {tsByProject.map(p => (
                    <BarChartRow
                      key={p.name}
                      label={p.name}
                      minutes={p.minutes}
                      maxMinutes={maxProjectMin}
                      color="#00F5FF"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Horas por Cliente */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h3 className="text-sm font-semibold text-white mb-5">Horas por Cliente</h3>
              {tsByCustomer.length === 0 ? (
                <div className="py-8 text-center text-sm text-zinc-600">Nenhum dado no período</div>
              ) : (
                <div className="space-y-3.5">
                  {tsByCustomer.map(c => (
                    <BarChartRow
                      key={c.name}
                      label={c.name}
                      minutes={c.minutes}
                      maxMinutes={maxCustomerMin}
                      color="#a78bfa"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Breakdown table */}
          {tsByProject.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-white">Detalhamento por Projeto</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-5 py-3 text-zinc-500 font-medium">Projeto</th>
                    <th className="text-right px-5 py-3 text-zinc-500 font-medium">Horas</th>
                    <th className="text-right px-5 py-3 text-zinc-500 font-medium">% do total</th>
                    {estimatedValue !== null && (
                      <th className="text-right px-5 py-3 text-zinc-500 font-medium">Valor Est.</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {tsByProject.map(p => (
                    <tr key={p.name} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/20">
                      <td className="px-5 py-3 text-zinc-200">{p.name}</td>
                      <td className="px-5 py-3 text-right text-zinc-300 font-mono font-semibold">
                        {minutesToHours(p.minutes)}
                      </td>
                      <td className="px-5 py-3 text-right text-zinc-500">
                        {tsTotalMin > 0 ? ((p.minutes / tsTotalMin) * 100).toFixed(1) + '%' : '—'}
                      </td>
                      {estimatedValue !== null && (
                        <td className="px-5 py-3 text-right text-zinc-300">
                          {formatBRL((p.minutes / 60) * hourlyRate)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Tab: Banco de Horas
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'hora-banco' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text)' }}>Banco de Horas</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--brand-subtle)' }}>
                Horas previstas, trabalhadas e saldo acumulado — {MONTHS[month]} {year}
              </p>
            </div>
            <button onClick={() => setHbKey(k => k + 1)} className="p-2 rounded-lg hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-subtle)' }}>
              <RefreshCw size={14} />
            </button>
          </div>

          {hbLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-44 w-full rounded-2xl" />
              <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
          ) : !hbCurrent && hbStartDate ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-2xl" style={{ border: '1px dashed var(--brand-border)' }}>
              <CalendarDays size={28} style={{ color: 'var(--brand-subtle)' }} />
              <p className="mt-3 text-sm font-medium" style={{ color: 'var(--brand-text)' }}>
                Banco de horas não iniciado neste período
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--brand-subtle)' }}>
                Inicia em {fmtYearMonth(hbStartDate.substring(0, 7))}
              </p>
            </div>
          ) : (
            <>
              {hbCurrent && (() => {
                const now = new Date()
                const isCurrentMonth = hbCurrent.year_month === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
                const fixedSalary = (user as any)?.rate_type === 'monthly' ? ((user as any)?.hourly_rate ?? 0) : 0
                return (
                  <>
                    <HBPaymentSection data={hbCurrent} fixedSalary={fixedSalary} expTotal={expTotal} />
                    <HBCurrentMonthCard data={hbCurrent} isCurrentMonth={isCurrentMonth} />
                  </>
                )
              })()}

              {hbHistory.length > 0 && (
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                  <div className="px-4 py-3 border-b" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                    <p className="text-xs font-semibold" style={{ color: 'var(--brand-muted)' }}>Meses Anteriores</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" style={{ background: 'var(--brand-surface)' }}>
                      <thead style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--brand-border)' }}>
                        <tr>
                          {['Mês', 'Previsto', 'Trabalhado', 'Saldo Mês', 'Saldo Ant.', 'Saldo Final'].map(h => (
                            <th key={h} className="px-4 py-2.5 text-center font-semibold uppercase tracking-wider text-[10px] first:text-left" style={{ color: 'var(--brand-subtle)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {hbHistory.map((row, i) => (
                          <HBHistoryRow key={`${row.user_id}-${row.year_month}-${i}`} row={row} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 text-[10px] px-1" style={{ color: 'var(--brand-subtle)' }}>
                <span className="flex items-center gap-1"><TrendingUp size={10} className="text-green-400" /> Saldo positivo</span>
                <span className="flex items-center gap-1"><TrendingDown size={10} className="text-red-400" /> Saldo negativo</span>
                <span className="flex items-center gap-1"><Minus size={10} className="text-zinc-500" /> Zerado</span>
                {hbCurrent && <span className="ml-auto">HP = Dias úteis × {hbCurrent.daily_hours}h/dia</span>}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Modal: Novo / Editar Apontamento
      ══════════════════════════════════════════════════════════════════════ */}
      {tsModal.open && (
        <ModalOverlay onClose={() => setTsModal({ open: false })}>
          <div className="p-6 max-h-[90vh] overflow-y-auto space-y-4">
            <h3 className="text-base font-semibold text-white">
              {tsModal.item ? 'Editar Apontamento' : 'Novo Apontamento'}
            </h3>

            <SelectField label="Cliente" value={tsForm.customer_id}
              onChange={v => setTsForm(f => ({ ...f, customer_id: v, project_id: '' }))}>
              <option value="">Selecione o cliente...</option>
              {consultantCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectField>

            <SelectField label="Projeto" value={tsForm.project_id}
              onChange={v => setTsForm(f => ({ ...f, project_id: v }))} required>
              <option value="">Selecione o projeto...</option>
              {tsProjectOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectField>

            {(() => {
              const selProj = projects.find(p => p.id === Number(tsForm.project_id))
              const stName = selProj?.service_type?.name
              if (!stName) return null
              const colorMap: Record<string, string> = {
                default: 'bg-zinc-700/60 text-zinc-300',
                sustentacao: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
                projeto: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
              }
              const normalized = stName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
              const colorKey = normalized.includes('sustentacao') ? 'sustentacao'
                : normalized.includes('projeto') ? 'projeto'
                : 'default'
              return (
                <div className="flex items-center gap-2 -mt-1">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Tipo de serviço:</span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${colorMap[colorKey]}`}>{stName}</span>
                </div>
              )
            })()}

            <div>
              <Label className="text-xs text-zinc-400">Data *</Label>
              <Input type="date" value={tsForm.date}
                onChange={e => setTsForm(f => ({ ...f, date: e.target.value }))}
                className="mt-1.5 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-zinc-400">Início</Label>
                <Input type="time" value={tsForm.start_time}
                  onChange={e => {
                    const start = e.target.value
                    setTsForm(f => {
                      const hours = parseFloat(f.total_hours)
                      const end = !isNaN(hours) && hours > 0 && start
                        ? addHoursToTime(start, hours)
                        : f.end_time
                      return { ...f, start_time: start, end_time: end }
                    })
                  }}
                  className="mt-1.5 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Fim</Label>
                <Input type="time" value={tsForm.end_time}
                  onChange={e => {
                    const end = e.target.value
                    setTsForm(f => {
                      const total = f.start_time && end
                        ? String(Math.round(timeDiffHours(f.start_time, end) * 10) / 10)
                        : f.total_hours
                      return { ...f, end_time: end, total_hours: total }
                    })
                  }}
                  className="mt-1.5 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Total (h)</Label>
                <Input
                  type="number" min="0.5" max="24" step="0.5"
                  value={tsForm.total_hours}
                  onChange={e => {
                    const val = e.target.value
                    setTsForm(f => {
                      const hours = parseFloat(val)
                      const end = !isNaN(hours) && hours > 0 && f.start_time
                        ? addHoursToTime(f.start_time, hours)
                        : f.end_time
                      return { ...f, total_hours: val, end_time: end }
                    })
                  }}
                  placeholder="–"
                  className="mt-1.5 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-zinc-400">Descrição *</Label>
                <span className={`text-[10px] ${(tsForm.observation?.length ?? 0) < 20 ? 'text-zinc-500' : 'text-green-500'}`}>
                  {tsForm.observation?.length ?? 0}/20 mín.
                </span>
              </div>
              <textarea value={tsForm.observation}
                onChange={e => setTsForm(f => ({ ...f, observation: e.target.value }))}
                rows={3}
                placeholder="Descreva o que foi feito (mínimo 20 caracteres)..."
                className="mt-1.5 w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-2.5 outline-none resize-none focus:border-zinc-500 transition-colors" />
            </div>

            {(() => {
              const selProj = projects.find(p => p.id === Number(tsForm.project_id))
              if (!isSustentacao(selProj?.service_type?.name)) return null
              return (
                <div>
                  <Label className="text-xs text-zinc-400">Ticket / Chamado *</Label>
                  <Input value={tsForm.ticket}
                    onChange={e => setTsForm(f => ({ ...f, ticket: e.target.value.replace(/\D/g, '') }))}
                    placeholder="Ex: 123456"
                    inputMode="numeric"
                    className="mt-1.5 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
                </div>
              )
            })()}

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setTsModal({ open: false })}
                className="h-9 text-xs border-zinc-700 text-zinc-300">
                Cancelar
              </Button>
              <Button onClick={saveTs} disabled={tsSaving}
                className="h-9 text-xs bg-blue-600 hover:bg-blue-500 text-white px-6">
                {tsSaving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Modal: Nova / Editar Despesa
      ══════════════════════════════════════════════════════════════════════ */}
      {expModal.open && (
        <ModalOverlay onClose={() => setExpModal({ open: false })}>
          <div className="p-6 max-h-[90vh] overflow-y-auto space-y-4">
            <h3 className="text-base font-semibold text-white">
              {expModal.item ? 'Editar Despesa' : 'Nova Despesa'}
            </h3>

            <SelectField label="Cliente" value={expForm.customer_id}
              onChange={v => setExpForm(f => ({ ...f, customer_id: v, project_id: '' }))}>
              <option value="">Selecione o cliente...</option>
              {consultantCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectField>

            <SelectField label="Projeto" value={expForm.project_id}
              onChange={v => setExpForm(f => ({ ...f, project_id: v }))} required>
              <option value="">Selecione o projeto...</option>
              {expProjectOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectField>

            {categories.length > 0 && (
              <SelectField label="Categoria" value={expForm.expense_category_id}
                onChange={v => setExpForm(f => ({ ...f, expense_category_id: v }))}>
                <option value="">Selecione a categoria...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </SelectField>
            )}

            <div>
              <Label className="text-xs text-zinc-400">Data *</Label>
              <Input type="date" value={expForm.expense_date}
                onChange={e => setExpForm(f => ({ ...f, expense_date: e.target.value }))}
                className="mt-1.5 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
            </div>

            <div>
              <Label className="text-xs text-zinc-400">Descrição *</Label>
              <Input value={expForm.description}
                onChange={e => setExpForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Ex.: Passagem para São Paulo"
                className="mt-1.5 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
            </div>

            <div>
              <Label className="text-xs text-zinc-400">Valor (R$) *</Label>
              <Input type="number" min="0" step="0.01" value={expForm.amount}
                onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0,00"
                className="mt-1.5 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Tipo" value={expForm.expense_type}
                onChange={v => setExpForm(f => ({ ...f, expense_type: v }))}>
                <option value="reimbursement">Reembolso</option>
                <option value="advance">Adiantamento</option>
                <option value="corporate_card">Cartão Corporativo</option>
              </SelectField>

              <SelectField label="Forma de Pagamento" value={expForm.payment_method}
                onChange={v => setExpForm(f => ({ ...f, payment_method: v }))}>
                <option value="">Selecione...</option>
                {pmOptions.map(pm => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
              </SelectField>
            </div>

            {/* Receipt upload */}
            <div>
              <Label className="text-xs text-zinc-400">Comprovante</Label>

              {/* Comprovante existente (modo edição) */}
              {expForm.receipt_url && !expFile && (
                <div className="mt-1.5 flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700">
                  <span className="text-xs text-green-400 flex-1">Comprovante anexado</span>
                  <ReceiptLinkInline url={expForm.receipt_url} />
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
                    Substituir
                  </button>
                </div>
              )}

              {/* Upload area */}
              {(!expForm.receipt_url || expFile) && (
                <div
                  onClick={() => fileRef.current?.click()}
                  className="mt-1.5 border border-dashed border-zinc-700 rounded-lg p-4 cursor-pointer hover:border-zinc-500 transition-colors text-center">
                  <span className="text-xs text-zinc-500">
                    {expFile
                      ? <span className="text-blue-400">{expFile.name}</span>
                      : 'Clique para anexar comprovante (opcional)'}
                  </span>
                </div>
              )}

              <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden"
                onChange={e => setExpFile(e.target.files?.[0] ?? null)} />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setExpModal({ open: false })}
                className="h-9 text-xs border-zinc-700 text-zinc-300">
                Cancelar
              </Button>
              <Button onClick={saveExp} disabled={expSaving}
                className="h-9 text-xs bg-blue-600 hover:bg-blue-500 text-white px-6">
                {expSaving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Modal: Visualizar Apontamento ── */}
      {tsViewItem && (
        <ModalOverlay onClose={() => setTsViewItem(null)}>
          <div className="p-6 space-y-4">
            <h3 className="text-base font-semibold text-white">Detalhes do Apontamento</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Data</p>
                <p className="text-sm text-zinc-200 font-medium">{tsViewItem.date}</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Horário</p>
                <p className="text-sm text-zinc-200 font-mono">{tsViewItem.start_time} – {tsViewItem.end_time}</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Horas</p>
                <p className="text-sm text-white font-bold font-mono">{tsViewItem.effort_hours}</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Status</p>
                <StatusBadge status={tsViewItem.status} display={tsViewItem.status_display} />
              </div>
            </div>

            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Projeto</p>
              <p className="text-sm text-zinc-200">{tsViewItem.project?.name ?? '—'}</p>
            </div>

            {tsViewItem.project?.customer?.name && (
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Cliente</p>
                <p className="text-sm text-zinc-200">{tsViewItem.project.customer.name}</p>
              </div>
            )}

            {tsViewItem.observation && (
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Observação</p>
                <p className="text-sm text-zinc-300">{tsViewItem.observation}</p>
              </div>
            )}

            {tsViewItem.ticket && (
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Ticket</p>
                <p className="text-sm text-zinc-300 font-mono">{tsViewItem.ticket}</p>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={() => setTsViewItem(null)}
                className="h-8 text-xs border-zinc-700 text-zinc-300">
                Fechar
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

    </AppLayout>
  )
}
