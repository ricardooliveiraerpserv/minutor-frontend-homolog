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
  CalendarDays, RefreshCw, ChevronDown, ChevronUp, MoreVertical,
  AlertTriangle, Zap, Users, DollarSign, Target, Activity,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimesheetItem {
  id: number
  project_id: number
  project?: { id: number; name: string; customer?: { id: number; name: string } }
  customer?: { id: number; name: string }
  date: string
  start_time: string
  end_time: string
  effort_hours: string
  effort_minutes: number
  observation?: string
  ticket?: string
  ticket_subject?: string
  status: 'pending' | 'approved' | 'rejected' | 'conflicted' | 'adjustment_requested'
  status_display: string
}

interface ExpenseItem {
  id: number
  project_id: number
  project?: { id: number; name: string; customer?: { id: number; name: string } }
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
  adjustment_requested: 'Ajuste Solicitado',
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

// ─── StatusPills ──────────────────────────────────────────────────────────────

const TS_STATUS_OPTS  = [
  { value: '', label: 'Todos' },
  { value: 'pending',              label: 'Pendente' },
  { value: 'approved',             label: 'Aprovado' },
  { value: 'rejected',             label: 'Rejeitado' },
  { value: 'conflicted',           label: 'Conflito' },
  { value: 'adjustment_requested', label: 'Ajuste' },
]
const EXP_STATUS_OPTS = [
  { value: '', label: 'Todos' },
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
    <div className="flex items-center gap-0.5 bg-zinc-800/70 border border-zinc-700/50 rounded-full p-1">
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
  const [open,      setOpen]      = useState(false)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [hover,     setHover]     = useState<string | null>(null)
  const [leftYM,    setLeftYM]    = useState(() => {
    const d = from ? new Date(from + 'T00:00:00') : new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const ref = useRef<HTMLDivElement>(null)

  const rightYM = leftYM.m === 11
    ? { y: leftYM.y + 1, m: 0 }
    : { y: leftYM.y, m: leftYM.m + 1 }

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setSelecting(null); setHover(null)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

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
      onChange(s, e); setSelecting(null); setHover(null); setOpen(false)
    }
  }

  const renderMonth = (y: number, m: number) => {
    const days     = new Date(y, m + 1, 0).getDate()
    const firstDay = new Date(y, m, 1).getDay()
    const todayISO = new Date().toISOString().split('T')[0]
    const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
    while (cells.length % 7 !== 0) cells.push(null)
    return (
      <div className="w-[196px]">
        <div className="text-center text-sm font-semibold text-cyan-400 mb-3">
          {MONTH_NAMES_PT[m]} {y}
        </div>
        <div className="grid grid-cols-7 mb-1">
          {DAY_NAMES_PT.map(d => (
            <div key={d} className="text-center text-[10px] text-zinc-600 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="h-7" />
            const d  = dateISO(y, m, day)
            const s  = isStart(d)
            const e  = isEnd(d)
            const ir = inRange(d)
            const td = d === todayISO
            return (
              <button key={i} type="button"
                onMouseEnter={() => selecting && setHover(d)}
                onMouseLeave={() => setHover(null)}
                onClick={() => handleDay(d)}
                className={`h-7 w-full text-xs transition-colors rounded ${
                  s || e ? 'bg-cyan-400 text-zinc-900 font-bold'
                  : ir    ? 'bg-cyan-400/20 text-cyan-300'
                  : td    ? 'text-cyan-400 font-semibold hover:bg-zinc-700'
                  :         'text-zinc-300 hover:bg-zinc-700'
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
    : from ? `${fmtDisplay(from)} – ...`
    : 'Período'

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setOpen(o => !o); setSelecting(null) }}
        className="flex items-center gap-2 h-9 px-3 bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 rounded-lg hover:border-zinc-500 transition-colors whitespace-nowrap">
        <CalendarDays size={13} className="text-zinc-500 shrink-0" />
        <span className={from || to ? 'text-zinc-200' : 'text-zinc-500'}>{displayText}</span>
        {(from || to) && (
          <span onClick={e => { e.stopPropagation(); onChange('', '') }}
            className="ml-1 text-zinc-600 hover:text-zinc-400 cursor-pointer">
            <X size={10} />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-4 right-0">
          <div className="flex items-center gap-4">
            <button type="button" onClick={prevMonth}
              className="text-zinc-500 hover:text-zinc-200 p-1 shrink-0">
              <ChevronLeft size={14} />
            </button>
            <div className="flex gap-4">
              {renderMonth(leftYM.y, leftYM.m)}
              <div className="w-px bg-zinc-800" />
              {renderMonth(rightYM.y, rightYM.m)}
            </div>
            <button type="button" onClick={nextMonth}
              className="text-zinc-500 hover:text-zinc-200 p-1 shrink-0">
              <ChevronRight size={14} />
            </button>
          </div>
          {selecting && (
            <p className="text-[11px] text-zinc-500 text-center mt-3">Clique para selecionar a data final</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

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
  label, value, sub, icon: Icon, accent, onClick,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  accent: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-colors ${onClick ? 'cursor-pointer hover:border-zinc-600 hover:bg-zinc-800/60' : ''}`}
    >
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

// ─── RowMenu ──────────────────────────────────────────────────────────────────

interface RowMenuItem { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }

function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null)
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
    setPos({ left: r.right - 144, top: up ? r.top - dropH : r.bottom + 4, up })
  }

  return (
    <div ref={ref} className="flex justify-end">
      <button ref={btnRef} onClick={toggle}
        className={`p-1.5 rounded transition-colors ${open ? 'text-zinc-200 bg-zinc-700' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}
      >
        <MoreVertical size={14} />
      </button>
      {pos && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="min-w-[144px] bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl py-1 overflow-hidden">
          {items.map((item, i) => (
            <button key={i} onClick={() => { item.onClick(); setPos(null) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left ${
                item.danger
                  ? 'text-red-400 hover:bg-red-500/10'
                  : 'text-zinc-300 hover:bg-zinc-700'
              }`}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── SearchableSelect ─────────────────────────────────────────────────────────

function SearchableSelect({
  value, onChange, options, placeholder = 'Todos',
}: {
  value: string
  onChange: (v: string) => void
  options: { id: number | string; name: string }[]
  placeholder?: string
}) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = query
    ? options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))
    : options
  const selected = options.find(o => String(o.id) === value)

  return (
    <div ref={ref} className="relative">
      <button type="button"
        onClick={() => { setOpen(o => !o); setQuery('') }}
        className={`flex items-center justify-between gap-2 h-9 px-3 min-w-[150px] bg-zinc-800 border rounded-lg text-xs transition-colors ${
          open ? 'border-zinc-500 text-zinc-200' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
        }`}>
        <span className={selected ? 'text-zinc-200' : 'text-zinc-500'}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown size={12} className="text-zinc-500 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-full w-max max-w-[260px] bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-zinc-700">
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="w-full bg-zinc-900 border border-zinc-600 rounded-lg text-xs text-zinc-200 px-2.5 py-1.5 outline-none focus:border-zinc-400 placeholder:text-zinc-600" />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            <button type="button" onClick={() => { onChange(''); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${!value ? 'text-cyan-400' : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'}`}>
              {placeholder}
            </button>
            {filtered.map(o => (
              <button key={o.id} type="button"
                onClick={() => { onChange(String(o.id)); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  String(o.id) === value ? 'text-cyan-400 bg-zinc-700/50' : 'text-zinc-300 hover:bg-zinc-700 hover:text-zinc-200'
                }`}>
                {o.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-zinc-600">Nenhum resultado</p>
            )}
          </div>
        </div>
      )}
    </div>
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
  const [expenses,    setExpenses]   = useState<ExpenseItem[]>([])
  const [expLoading,  setExpLoading] = useState(true)
  const [expTotal,    setExpTotal]   = useState(0)
  const [expSearch,   setExpSearch]  = useState('')
  const [expCustomer, setExpCustomer] = useState('')
  const [expProject,  setExpProject] = useState('')
  const [expStatus,   setExpStatus]  = useState('')
  const [expDateFrom, setExpDateFrom] = useState('')
  const [expDateTo,   setExpDateTo]   = useState('')
  const [expCategory, setExpCategory] = useState('')
  const [expPage,     setExpPage]    = useState(1)
  const [expHasNext,  setExpHasNext] = useState(false)
  const [expModal,    setExpModal]   = useState<{ open: boolean; item?: ExpenseItem }>({ open: false })
  const [expViewItem, setExpViewItem] = useState<ExpenseItem | null>(null)
  const [expForm,     setExpForm]    = useState({ ...EMPTY_EXP })
  const [expSaving,   setExpSaving]  = useState(false)
  const [expFile,     setExpFile]    = useState<File | null>(null)
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
      const p = new URLSearchParams({
        page: String(expPage), pageSize: '50',
        start_date: expDateFrom || startDate,
        end_date:   expDateTo   || endDate,
      })
      if (expSearch)   p.set('search',      expSearch)
      if (expCustomer)  p.set('customer_id',  expCustomer)
      if (expProject)   p.set('project_id',   expProject)
      if (expStatus)    p.set('status',        expStatus)
      if (expCategory)  p.set('category_id',  expCategory)
      const r = await api.get<any>(`/expenses?${p}`)
      const list: ExpenseItem[] = Array.isArray(r?.items) ? r.items : []
      setExpenses(list)
      setExpHasNext(!!r?.hasNext)
      setExpTotal(list.reduce((acc, e) => acc + (parseFloat(String(e.amount)) || 0), 0))
    } catch { toast.error('Erro ao carregar despesas') }
    finally   { setExpLoading(false) }
  }, [expPage, startDate, endDate, expSearch, expCustomer, expProject, expStatus, expCategory, expDateFrom, expDateTo])

  const hasTsFilters = !!(tsSearch || tsCustomer || tsProject || tsStatus || tsDateFrom || tsDateTo)
  const hasExpFilters = !!(expSearch || expCustomer || expProject || expStatus || expCategory || expDateFrom || expDateTo)

  function clearTsFilters() {
    setTsSearch(''); setTsCustomer(''); setTsProject(''); setTsStatus(''); setTsDateFrom(''); setTsDateTo(''); setTsPage(1)
  }
  function clearExpFilters() {
    setExpSearch(''); setExpCustomer(''); setExpProject(''); setExpStatus(''); setExpCategory(''); setExpDateFrom(''); setExpDateTo(''); setExpPage(1)
  }

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
  const rejectedTs  = timesheets.filter(t => t.status === 'rejected').length
  const notApprTs   = timesheets.length - approvedTs
  const approvedExp = expenses.filter(e => e.status === 'approved').length
  const rejectedExp = expenses.filter(e => e.status === 'rejected').length
  const notApprExp  = expenses.length - approvedExp

  // ── Indicadores computados ─────────────────────────────────────────────────

  // Horas faturáveis: projetos que têm cliente (cobram); internas: sem cliente
  const billableMin  = useMemo(() =>
    timesheets.reduce((acc, ts) => acc + (ts.project?.customer ? ts.effort_minutes : 0), 0),
  [timesheets])
  const internalMin  = tsTotalMin - billableMin
  const billablePct  = tsTotalMin > 0 ? Math.round((billableMin / tsTotalMin) * 100) : 0

  // Ocupação: dias úteis no mês vs dias com apontamento
  const workingDaysInMonth = useMemo(() => {
    const d = new Date(year, month + 1, 0).getDate()
    let wd = 0
    for (let i = 1; i <= d; i++) {
      const dow = new Date(year, month, i).getDay()
      if (dow !== 0 && dow !== 6) wd++
    }
    return wd
  }, [year, month])

  const daysWorked = useMemo(() => {
    const days = new Set(timesheets.map(ts => ts.date))
    return days.size
  }, [timesheets])

  const occupancyPct = workingDaysInMonth > 0
    ? Math.min(100, Math.round((daysWorked / workingDaysInMonth) * 100))
    : 0

  // Ticket médio R$/h
  const avgTicket = workedHours > 0 && estimatedValue !== null
    ? estimatedValue / workedHours
    : null

  // Projeção: baseado nos dias já trabalhados no mês vs dias úteis restantes
  const today         = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month
  const dayOfMonth    = isCurrentMonth ? today.getDate() : new Date(year, month + 1, 0).getDate()
  const elapsedWD     = useMemo(() => {
    let wd = 0
    for (let i = 1; i <= dayOfMonth; i++) {
      const dow = new Date(year, month, i).getDay()
      if (dow !== 0 && dow !== 6) wd++
    }
    return wd
  }, [year, month, dayOfMonth])

  const projectedHours = elapsedWD > 0 && isCurrentMonth
    ? (workedHours / elapsedWD) * workingDaysInMonth
    : workedHours
  const projectedValue = hourlyRate > 0 && rateType === 'hourly' ? projectedHours * hourlyRate : null
  const projectedPct   = workingDaysInMonth > 0
    ? Math.min(100, Math.round((elapsedWD / workingDaysInMonth) * 100))
    : 100

  // Alertas
  const indAlerts: { level: 'warn' | 'danger'; msg: string }[] = []
  if (occupancyPct < 60 && isCurrentMonth && elapsedWD > 5)
    indAlerts.push({ level: 'warn', msg: `Ocupação baixa: apenas ${occupancyPct}% dos dias úteis com apontamento` })
  if (billablePct < 50 && tsTotalMin > 0)
    indAlerts.push({ level: 'warn', msg: `Apenas ${billablePct}% das horas são faturáveis` })
  if (rejectedTs > 0)
    indAlerts.push({ level: 'danger', msg: `${rejectedTs} apontamento${rejectedTs > 1 ? 's' : ''} rejeitado${rejectedTs > 1 ? 's' : ''} — requer atenção` })
  if (rejectedExp > 0)
    indAlerts.push({ level: 'warn', msg: `${rejectedExp} despesa${rejectedExp > 1 ? 's' : ''} rejeitada${rejectedExp > 1 ? 's' : ''}` })
  if (notApprTs > 0 && !isCurrentMonth)
    indAlerts.push({ level: 'warn', msg: `${notApprTs} apontamento${notApprTs > 1 ? 's' : ''} sem aprovação no período encerrado` })

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
              onClick={() => setActiveTab('timesheets')}
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
                  onClick={() => setActiveTab('expenses')}
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
                onClick={() => setActiveTab('expenses')}
              />
            )}
            <SummaryCard
              label="Apontamentos Pendentes"
              value={String(notApprTs)}
              sub={`${approvedTs} aprov. · ${rejectedTs} reprov. de ${timesheets.length}`}
              icon={BarChart2}
              accent="bg-purple-500/15 text-purple-400"
              onClick={() => setActiveTab('timesheets')}
            />
            <SummaryCard
              label="Despesas Pendentes"
              value={String(notApprExp)}
              sub={`${approvedExp} aprov. · ${rejectedExp} reprov. de ${expenses.length}`}
              icon={Receipt}
              accent="bg-yellow-500/15 text-yellow-400"
              onClick={() => setActiveTab('expenses')}
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
          {/* Status pills */}
          <div className="mb-3">
            <StatusPills value={tsStatus} onChange={v => { setTsStatus(v); setTsPage(1) }} options={TS_STATUS_OPTS} />
          </div>

          {/* Filters bar */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <Input value={tsSearch}
              onChange={e => { setTsSearch(e.target.value); setTsPage(1) }}
              placeholder="Buscar por projeto, observação, ticket..."
              className="flex-1 min-w-40 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
            <SearchableSelect
              value={tsCustomer}
              onChange={v => { setTsCustomer(v); setTsPage(1) }}
              options={consultantCustomers}
              placeholder="Todos os clientes"
            />
            <SearchableSelect
              value={tsProject}
              onChange={v => { setTsProject(v); setTsPage(1) }}
              options={projects}
              placeholder="Todos os projetos"
            />
            <DateRangePicker
              from={tsDateFrom} to={tsDateTo}
              onChange={(f, t) => { setTsDateFrom(f); setTsDateTo(t); setTsPage(1) }}
            />
            {hasTsFilters && (
              <button onClick={clearTsFilters}
                className="flex items-center gap-1 h-9 px-3 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg hover:border-zinc-500 transition-colors shrink-0">
                <X size={11} /> Limpar
              </button>
            )}
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
              <span>Pendentes: <span className="text-yellow-400 font-medium">{notApprTs}</span></span>
            </div>
          )}

          {/* Table */}
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60">
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium">Data</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium hidden md:table-cell">Cliente</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium">Projeto</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium hidden lg:table-cell">Ticket #</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium hidden xl:table-cell">Título</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium hidden md:table-cell">Horário</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium">Horas</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium hidden lg:table-cell">Observação</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium">Status</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {tsLoading ? (
                  <TableSkeleton cols={10} />
                ) : timesheets.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-14 text-center text-zinc-600">
                      Nenhum apontamento no período
                    </td>
                  </tr>
                ) : timesheets.map(ts => {
                  const locked = isLocked(ts.status)
                  const clientName = ts.customer?.name ?? ts.project?.customer?.name
                  return (
                    <tr key={ts.id}
                      className={`border-b border-zinc-800 transition-colors last:border-0 ${
                        locked ? 'bg-zinc-900/40' : 'hover:bg-zinc-800/25'
                      }`}>
                      <td className="px-4 py-3.5 text-zinc-300 font-medium tabular-nums whitespace-nowrap">{ts.date}</td>
                      <td className="px-4 py-3.5 text-zinc-400 hidden md:table-cell max-w-[120px] truncate">
                        {clientName ?? <span className="text-zinc-700">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-200 max-w-[140px] truncate">
                        {ts.project?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-400 font-mono hidden lg:table-cell">
                        {ts.ticket ?? <span className="text-zinc-700">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-400 hidden xl:table-cell max-w-[160px] truncate" title={ts.ticket_subject}>
                        {ts.ticket_subject ?? <span className="text-zinc-700">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-500 font-mono hidden md:table-cell whitespace-nowrap">
                        {ts.start_time} – {ts.end_time}
                      </td>
                      <td className="px-4 py-3.5 text-white font-mono font-bold whitespace-nowrap">{ts.effort_hours}</td>
                      <td className="px-4 py-3.5 text-zinc-500 hidden lg:table-cell max-w-[180px] truncate"
                        title={ts.observation}>
                        {ts.observation ?? <span className="text-zinc-700">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={ts.status} display={ts.status_display} />
                      </td>
                      <td className="px-4 py-3.5 w-10">
                        <RowMenu items={[
                          { label: 'Visualizar', icon: <Eye size={12} />, onClick: () => setTsViewItem(ts) },
                          ...(!locked ? [
                            { label: 'Editar', icon: <Pencil size={12} />, onClick: () => openEditTs(ts) },
                            { label: 'Excluir', icon: <Trash2 size={12} />, onClick: () => deleteTs(ts.id), danger: true },
                          ] : []),
                        ]} />
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
          {/* Status pills */}
          <div className="mb-3">
            <StatusPills value={expStatus} onChange={v => { setExpStatus(v); setExpPage(1) }} options={EXP_STATUS_OPTS} />
          </div>

          {/* Filters */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <Input value={expSearch}
              onChange={e => { setExpSearch(e.target.value); setExpPage(1) }}
              placeholder="Buscar por descrição..."
              className="flex-1 min-w-40 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
            <SearchableSelect
              value={expCustomer}
              onChange={v => { setExpCustomer(v); setExpPage(1) }}
              options={consultantCustomers}
              placeholder="Todos os clientes"
            />
            <SearchableSelect
              value={expProject}
              onChange={v => { setExpProject(v); setExpPage(1) }}
              options={projects}
              placeholder="Todos os projetos"
            />
            <SearchableSelect
              value={expCategory}
              onChange={v => { setExpCategory(v); setExpPage(1) }}
              options={categories}
              placeholder="Todas as categorias"
            />
            <DateRangePicker
              from={expDateFrom} to={expDateTo}
              onChange={(f, t) => { setExpDateFrom(f); setExpDateTo(t); setExpPage(1) }}
            />
            {hasExpFilters && (
              <button onClick={clearExpFilters}
                className="flex items-center gap-1 h-9 px-3 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg hover:border-zinc-500 transition-colors shrink-0">
                <X size={11} /> Limpar
              </button>
            )}
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
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium hidden md:table-cell">Cliente</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium">Descrição</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium hidden md:table-cell">Projeto</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium hidden lg:table-cell">Categoria</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium">Valor</th>
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium">Status</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {expLoading ? (
                  <TableSkeleton cols={8} />
                ) : expenses.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-14 text-center text-zinc-600">
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
                      <td className="px-4 py-3.5 text-zinc-300 font-medium tabular-nums whitespace-nowrap">{exp.expense_date}</td>
                      <td className="px-4 py-3.5 text-zinc-400 hidden md:table-cell max-w-[120px] truncate">
                        {exp.project?.customer?.name ?? <span className="text-zinc-700">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-200 max-w-[160px] truncate" title={exp.description}>{exp.description}</td>
                      <td className="px-4 py-3.5 text-zinc-400 hidden md:table-cell max-w-[140px] truncate">{exp.project?.name ?? '—'}</td>
                      <td className="px-4 py-3.5 text-zinc-400 hidden lg:table-cell">{exp.category?.name ?? '—'}</td>
                      <td className="px-4 py-3.5 text-white font-bold whitespace-nowrap">{exp.formatted_amount}</td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={exp.status} display={exp.status_display} />
                      </td>
                      <td className="px-4 py-3.5 w-10">
                        <RowMenu items={[
                          { label: 'Visualizar', icon: <Eye size={12} />, onClick: () => setExpViewItem(exp) },
                          ...(!locked ? [
                            { label: 'Editar', icon: <Pencil size={12} />, onClick: () => openEditExp(exp) },
                            { label: 'Excluir', icon: <Trash2 size={12} />, onClick: () => deleteExp(exp.id), danger: true },
                          ] : []),
                        ]} />
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
        <div className="space-y-5">

          {/* ── Alertas ──────────────────────────────────────────────────────── */}
          {indAlerts.length > 0 && (
            <div className="space-y-2">
              {indAlerts.map((a, i) => (
                <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl text-xs border ${
                  a.level === 'danger'
                    ? 'bg-red-500/8 border-red-500/20 text-red-300'
                    : 'bg-yellow-500/8 border-yellow-500/20 text-yellow-300'
                }`}>
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  {a.msg}
                </div>
              ))}
            </div>
          )}

          {/* ── Hero KPIs ────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

            {/* Valor Gerado */}
            <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 p-5 col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-cyan-500/20">
                  <DollarSign size={13} className="text-cyan-400" />
                </div>
                <span className="text-[11px] text-zinc-400 font-medium">Valor Gerado</span>
              </div>
              <div className="text-2xl font-bold text-white">
                {estimatedValue !== null ? formatBRL(estimatedValue) : '—'}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1.5">
                {estimatedValue !== null
                  ? guaranteedHours !== null && workedHours < Number(guaranteedHours)
                    ? `${formatBRL(hourlyRate)}/h × ${Number(guaranteedHours)}h garantidas`
                    : `${formatBRL(hourlyRate)}/h × ${workedHours.toFixed(1)}h`
                  : 'Taxa horária não configurada'}
              </div>
            </div>

            {/* Ticket Médio */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-violet-500/20">
                  <Zap size={13} className="text-violet-400" />
                </div>
                <span className="text-[11px] text-zinc-400 font-medium">Ticket Médio</span>
              </div>
              <div className="text-2xl font-bold text-white">
                {avgTicket !== null ? formatBRL(avgTicket) : '—'}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1.5">por hora trabalhada</div>
            </div>

            {/* Ocupação */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-orange-500/20">
                  <Target size={13} className="text-orange-400" />
                </div>
                <span className="text-[11px] text-zinc-400 font-medium">Ocupação</span>
              </div>
              <div className={`text-2xl font-bold ${occupancyPct >= 80 ? 'text-green-400' : occupancyPct >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                {occupancyPct}%
              </div>
              <div className="text-[11px] text-zinc-500 mt-1.5">
                {daysWorked} de {workingDaysInMonth} dias úteis
              </div>
            </div>

            {/* Total de Horas */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-blue-500/20">
                  <Activity size={13} className="text-blue-400" />
                </div>
                <span className="text-[11px] text-zinc-400 font-medium">Horas Totais</span>
              </div>
              <div className="text-2xl font-bold text-white">{minutesToHours(tsTotalMin)}</div>
              <div className="text-[11px] text-zinc-500 mt-1.5">{tsByProject.length} projeto{tsByProject.length !== 1 ? 's' : ''}</div>
            </div>
          </div>

          {/* ── Horas Faturáveis vs Internas + Projeção ──────────────────────── */}
          <div className="grid md:grid-cols-2 gap-4">

            {/* Faturáveis vs Internas */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h3 className="text-xs font-semibold text-zinc-300 mb-4 uppercase tracking-wider">
                Horas Faturáveis vs Internas
              </h3>
              <div className="flex items-end gap-3 mb-4">
                <div>
                  <div className="text-2xl font-bold text-cyan-400">{minutesToHours(billableMin)}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">Faturáveis ({billablePct}%)</div>
                </div>
                <div className="text-zinc-700 text-lg font-light mb-1">vs</div>
                <div>
                  <div className="text-2xl font-bold text-zinc-400">{minutesToHours(internalMin)}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">Internas ({100 - billablePct}%)</div>
                </div>
              </div>
              {/* Barra de proporção */}
              <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-500"
                  style={{ width: `${billablePct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-zinc-600 mt-1.5">
                <span>Faturável</span><span>Interno</span>
              </div>
            </div>

            {/* Projeção do mês */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h3 className="text-xs font-semibold text-zinc-300 mb-4 uppercase tracking-wider">
                Projeção do Mês
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Horas projetadas</span>
                  <span className="text-sm font-bold text-white font-mono">{minutesToHours(Math.round(projectedHours * 60))}</span>
                </div>
                {projectedValue !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Valor projetado</span>
                    <span className="text-sm font-bold text-cyan-400">{formatBRL(projectedValue)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Progresso do mês</span>
                  <span className="text-xs text-zinc-400">{projectedPct}% dos dias úteis</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-800 overflow-hidden mt-1">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all duration-500"
                    style={{ width: `${projectedPct}%` }}
                  />
                </div>
                {!isCurrentMonth && (
                  <p className="text-[10px] text-zinc-600 mt-1">Mês encerrado — valores finais</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Distribuição por Cliente ──────────────────────────────────────── */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex items-center gap-2 mb-5">
              <Users size={13} className="text-zinc-400" />
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Distribuição por Cliente</h3>
            </div>
            {tsByCustomer.length === 0 ? (
              <div className="py-8 text-center text-sm text-zinc-600">Nenhum dado no período</div>
            ) : (
              <div className="space-y-3">
                {tsByCustomer.map((c, i) => {
                  const pct = tsTotalMin > 0 ? (c.minutes / tsTotalMin) * 100 : 0
                  const colors = ['#00F5FF', '#a78bfa', '#fb923c', '#34d399', '#f472b6', '#60a5fa']
                  const color  = colors[i % colors.length]
                  return (
                    <div key={c.name}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-zinc-300 truncate max-w-[60%]">{c.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-zinc-500">{pct.toFixed(1)}%</span>
                          <span className="text-xs font-mono font-semibold text-zinc-200 w-14 text-right">{minutesToHours(c.minutes)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Horas por Projeto + Tabela ────────────────────────────────────── */}
          <div className="grid md:grid-cols-2 gap-4">

            {/* Horas por Projeto */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h3 className="text-xs font-semibold text-zinc-300 mb-5 uppercase tracking-wider">Horas por Projeto</h3>
              {tsByProject.length === 0 ? (
                <div className="py-8 text-center text-sm text-zinc-600">Nenhum dado no período</div>
              ) : (
                <div className="space-y-3.5">
                  {tsByProject.map(p => (
                    <BarChartRow key={p.name} label={p.name} minutes={p.minutes} maxMinutes={maxProjectMin} color="#00F5FF" />
                  ))}
                </div>
              )}
            </div>

            {/* Tabela Detalhamento */}
            {tsByProject.length > 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-800">
                  <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Detalhamento</h3>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left px-5 py-3 text-zinc-500 font-medium">Projeto</th>
                      <th className="text-right px-5 py-3 text-zinc-500 font-medium">Horas</th>
                      <th className="text-right px-5 py-3 text-zinc-500 font-medium">%</th>
                      {estimatedValue !== null && (
                        <th className="text-right px-5 py-3 text-zinc-500 font-medium">Valor</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {tsByProject.map(p => (
                      <tr key={p.name} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/20">
                        <td className="px-5 py-3 text-zinc-200 max-w-[120px] truncate">{p.name}</td>
                        <td className="px-5 py-3 text-right text-zinc-300 font-mono font-semibold">{minutesToHours(p.minutes)}</td>
                        <td className="px-5 py-3 text-right text-zinc-500">
                          {tsTotalMin > 0 ? ((p.minutes / tsTotalMin) * 100).toFixed(1) + '%' : '—'}
                        </td>
                        {estimatedValue !== null && (
                          <td className="px-5 py-3 text-right text-cyan-400 font-medium">
                            {formatBRL((p.minutes / 60) * hourlyRate)}
                          </td>
                        )}
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="bg-zinc-800/30 border-t border-zinc-700">
                      <td className="px-5 py-3 text-zinc-300 font-semibold">Total</td>
                      <td className="px-5 py-3 text-right text-white font-mono font-bold">{minutesToHours(tsTotalMin)}</td>
                      <td className="px-5 py-3 text-right text-zinc-400">100%</td>
                      {estimatedValue !== null && (
                        <td className="px-5 py-3 text-right text-cyan-300 font-bold">{formatBRL(estimatedValue)}</td>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 flex items-center justify-center py-16">
                <p className="text-sm text-zinc-600">Nenhum projeto no período</p>
              </div>
            )}
          </div>

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

      {/* ── Modal: Visualizar Despesa ── */}
      {expViewItem && (
        <ModalOverlay onClose={() => setExpViewItem(null)}>
          <div className="p-6 space-y-4">
            <h2 className="text-sm font-semibold text-white">Detalhes da Despesa</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Data</p>
                <p className="text-sm text-zinc-200 font-medium">{expViewItem.expense_date}</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Valor</p>
                <p className="text-sm text-white font-bold">{expViewItem.formatted_amount}</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Status</p>
                <StatusBadge status={expViewItem.status} display={expViewItem.status_display} />
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Categoria</p>
                <p className="text-sm text-zinc-200">{expViewItem.category?.name ?? '—'}</p>
              </div>
            </div>
            {expViewItem.project?.customer?.name && (
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Cliente</p>
                <p className="text-sm text-zinc-200">{expViewItem.project.customer.name}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Projeto</p>
              <p className="text-sm text-zinc-200">{expViewItem.project?.name ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Descrição</p>
              <p className="text-sm text-zinc-300">{expViewItem.description}</p>
            </div>
            {expViewItem.receipt_url && (
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Comprovante</p>
                <a href={expViewItem.receipt_url} target="_blank" rel="noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 underline">
                  Ver comprovante
                </a>
              </div>
            )}
            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={() => setExpViewItem(null)}
                className="h-8 text-xs border-zinc-700 text-zinc-300">
                Fechar
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
