'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useCallback, useEffect, useRef, useMemo, createContext, useContext } from 'react'
import { api, ApiError } from '@/lib/api'
import { fetchAndOpenLegacyUrl } from '@/lib/attachments'
import { NotasPjCell, type NotasPayload } from '@/components/fechamento/NotasPjCell'
import { previewText, sanitizeHtml } from '@/lib/sanitize'
import { formatBRL } from '@/lib/format'
import { exportTimesheetsToExcel } from '@/lib/exportTimesheets'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { ReasonTooltip } from '@/components/ui/reason-tooltip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, Lock,
  Clock, Receipt, BarChart2, LayoutDashboard, TrendingUp, TrendingDown, Minus, Eye, EyeOff,
  CalendarDays, RefreshCw, ChevronDown, ChevronUp, MoreVertical,
  AlertTriangle, AlertCircle, Zap, Users, DollarSign, Target, Activity, Paperclip, Download,
  Building2, FolderOpen, Tag, CreditCard, FileText, User, FileSpreadsheet,
} from 'lucide-react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { TimesheetConflictModal, type ConflictTimesheet } from '@/components/timesheet/TimesheetConflictModal'
import { TimesheetHoverTooltip, useTimesheetHover } from '@/components/ui/timesheet-hover-tooltip'

// ─── Máscara de valores (privacidade) ──────────────────────────────────────────
// Contexto que indica se os valores monetários da tela devem ficar ocultos.
// Default: oculto (a tela sempre abre com os valores escondidos; o olho revela).
const MoneyMaskContext = createContext(false)

/** Envolve um valor em R$ e o mascara com ••••• quando o olho está fechado.
 *  Mantém placeholders vazios ("—") visíveis. */
function Money({ children }: { children: React.ReactNode }) {
  const hidden = useContext(MoneyMaskContext)
  if (!hidden) return <>{children}</>
  if (children === '—' || children === '' || children == null) return <>{children}</>
  return <>R$ ••••••</>
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConflictingTs {
  id: number
  date: string
  start_time?: string
  end_time?: string
  effort_hours?: string
  customer_name?: string
  project_name?: string
  origin?: string | null
}

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
  stage_delivery_id?: number | null
  status: 'pending' | 'approved' | 'rejected' | 'conflicted' | 'adjustment_requested' | 'late'
  status_display: string
  consultant_pending_release?: boolean
  attachment_url?: string
  consultant_extra_pct?: number | null
  origin?: string | null
  conflicting_timesheets?: ConflictingTs[]
  rejection_reason?: string | null
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
  is_paid: boolean
  receipt_url?: string
  rejection_reason?: string | null
}

interface ProjectOption { id: number; name: string; code: string; customer?: { id: number; name: string }; service_type?: { id: number; name: string; code: string }; is_investimento_comercial?: boolean; categoria_interna?: string | null }
interface CategoryOption { id: number; name: string; parent_id?: number | null }

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const STATUS_COLORS: Record<string, string> = {
  pending:              'bg-[var(--warning-bg)] text-[var(--warning)] border-yellow-500/25',
  approved:             'bg-[var(--success-bg)]  text-[var(--success)]  border-green-500/25',
  rejected:             'bg-[var(--danger-bg)]    text-[var(--danger)]    border-red-500/25',
  conflicted:           'bg-[var(--warning-bg)] text-[var(--warning)] border-orange-500/25',
  adjustment_requested: 'bg-[var(--primary-soft)]   text-[var(--primary)]   border-blue-500/25',
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
  conflict_hours?: number
  month_balance: number
  previous_balance: number
  accumulated_balance: number
  paid_hours: number
  final_balance: number
}

function fmt(d: string | null | undefined) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
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

// ─── Recebimento do fechamento (espelha a tela do admin) ──────────────────────

interface MyClosing {
  tipo: 'consultor' | 'parceiro'
  total_servico: number
  total_despesas: number
  total_base: number
  desconto: number
  desconto_desc: string | null
  adiantamento: number
  adicional: number
  adicional_desc: string | null
  recebimento: number
}

/**
 * Bloco "Recebimento do fechamento" — mostra o MESMO valor que o admin vê na tela de
 * fechamento: total base + ajustes (desconto/adiantamento/adicional com motivos) e o
 * recebimento final em destaque. Só renderiza as linhas de ajuste ≠ 0.
 */
function RecebimentoFechamentoBlock({ closing }: { closing: MyClosing | null }) {
  if (!closing) return null

  const temAjustes = closing.desconto !== 0 || closing.adiantamento !== 0 || closing.adicional !== 0

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div className="px-5 py-3.5 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
        <DollarSign size={15} style={{ color: 'var(--primary)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Recebimento do fechamento</h3>
      </div>

      <div className="px-5 py-4 space-y-2.5">
        {/* Total do fechamento (serviço) */}
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'var(--text-muted)' }}>Total do fechamento</span>
          <span className="font-semibold tabular-nums" style={{ color: 'var(--text)' }}><Money>{formatBRL(closing.total_servico)}</Money></span>
        </div>

        {/* Despesa do mês (entra no recebimento) */}
        {closing.total_despesas > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: 'var(--text-muted)' }}>+ Despesa</span>
            <span className="font-medium tabular-nums shrink-0 ml-3" style={{ color: 'var(--success)' }}>+ <Money>{formatBRL(closing.total_despesas)}</Money></span>
          </div>
        )}

        {temAjustes && (
          <div className="space-y-2 pt-1 mt-1 border-t" style={{ borderColor: 'var(--border)' }}>
            {closing.desconto !== 0 && (
              <div className="flex items-start justify-between text-sm">
                <div className="min-w-0">
                  <span style={{ color: 'var(--text-muted)' }}>− Desconto</span>
                  {closing.desconto_desc && (
                    <p className="text-[11px] mt-0.5 break-words" style={{ color: 'var(--text-light)' }}>{closing.desconto_desc}</p>
                  )}
                </div>
                <span className="font-medium tabular-nums shrink-0 ml-3" style={{ color: 'var(--danger)' }}>− <Money>{formatBRL(closing.desconto)}</Money></span>
              </div>
            )}
            {closing.adiantamento !== 0 && (
              <div className="flex items-start justify-between text-sm">
                <span style={{ color: 'var(--text-muted)' }}>− Adiantamento</span>
                <span className="font-medium tabular-nums shrink-0 ml-3" style={{ color: 'var(--danger)' }}>− <Money>{formatBRL(closing.adiantamento)}</Money></span>
              </div>
            )}
            {closing.adicional !== 0 && (
              <div className="flex items-start justify-between text-sm">
                <div className="min-w-0">
                  <span style={{ color: 'var(--text-muted)' }}>+ Adicional</span>
                  {closing.adicional_desc && (
                    <p className="text-[11px] mt-0.5 break-words" style={{ color: 'var(--text-light)' }}>{closing.adicional_desc}</p>
                  )}
                </div>
                <span className="font-medium tabular-nums shrink-0 ml-3" style={{ color: 'var(--success)' }}>+ <Money>{formatBRL(closing.adicional)}</Money></span>
              </div>
            )}
          </div>
        )}

        {/* Recebimento final em destaque */}
        <div className="flex items-center justify-between pt-2.5 mt-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Recebimento</span>
          <span className="text-lg font-bold tabular-nums" style={{ color: 'var(--success)' }}><Money>{formatBRL(closing.recebimento)}</Money></span>
        </div>
      </div>
    </div>
  )
}

function HBBalancePill({ value, size = 'sm' }: { value: number; size?: 'sm' | 'lg' }) {
  const isPos  = value > 0
  const isNeg  = value < 0
  const color  = isPos ? 'var(--success-border)' : isNeg ? 'var(--danger-border)' : 'var(--text-light)'
  const bg     = isPos ? 'var(--success-bg)' : isNeg ? 'var(--danger-bg)' : 'rgba(113,113,122,0.1)'
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

// ─── Horista Payment Section ──────────────────────────────────────────────────

function HoristaPaymentSection({
  yearMonth, workedHours, billableHours, guaranteedHours, hourlyRate, expTotal, expPaid, proporcional, prorationRatio, recebimento,
}: {
  yearMonth: string
  workedHours: number
  billableHours: number
  guaranteedHours: number | null
  hourlyRate: number
  expTotal: number
  expPaid: number
  proporcional?: boolean
  prorationRatio?: number
  recebimento?: number | null
}) {
  const totalService = hourlyRate > 0 ? billableHours * hourlyRate : 0
  const expAllTotal  = expTotal + expPaid
  const isGuaranteed = guaranteedHours !== null && workedHours < Number(guaranteedHours)

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-5 grid grid-cols-[auto_1fr_auto] gap-x-8 items-center">

      {/* ESQUERDA */}
      <div className="flex flex-col gap-2 min-w-[120px]">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-light)]">Total a Receber</span>
        <span className="text-[12px] text-[var(--text-muted)] font-medium">{fmtYearMonth(yearMonth)}</span>
        {proporcional && prorationRatio !== undefined && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium w-fit" style={{ background: 'rgba(234,179,8,0.1)', color: '#eab308' }}>
            Proporcional {Math.round(prorationRatio * 100)}%
          </span>
        )}
        {isGuaranteed && guaranteedHours !== null && (
          <span className="text-[10px] px-2 py-0.5 rounded-full border w-fit bg-[var(--warning-bg)] border-yellow-500/20 text-[var(--warning)]">
            Piso {fmtHours(Number(guaranteedHours))}
          </span>
        )}
      </div>

      {/* CENTRO — Total a Receber = recebimento do fechamento (com ajustes) quando disponível */}
      <div className="flex flex-col gap-1 border-l border-[var(--border)] pl-8">
        <div className="text-[42px] font-extrabold leading-none tracking-tight text-[var(--primary)]">
          <Money>{recebimento != null ? formatBRL(recebimento) : (hourlyRate > 0 ? formatBRL(totalService) : '—')}</Money>
        </div>
        <span className="text-[11px] text-[var(--text-muted)] mt-1">
          {recebimento != null
            ? 'recebimento do fechamento (com ajustes)'
            : (hourlyRate > 0 ? `${fmtHours(billableHours)} × ${formatBRL(hourlyRate)}/h` : 'Taxa não configurada')}
        </span>
      </div>

      {/* DIREITA — despesas */}
      <div className="rounded-xl border border-orange-900/40 bg-[var(--warning-bg)] p-3 space-y-2 min-w-[280px]">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--warning)]/70 px-0.5">Despesas</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg p-2.5 border border-[var(--border)] bg-[var(--surface)]">
            <p className="text-[9px] uppercase tracking-wider mb-1 text-[var(--text-light)]">Total no Mês</p>
            <p className="text-sm font-bold" style={{ color: expAllTotal > 0 ? '#f97316' : 'var(--text-muted)' }}>
              <Money>{expAllTotal > 0 ? formatBRL(expAllTotal) : '—'}</Money>
            </p>
            <p className="text-[9px] mt-0.5 text-[var(--text-muted)]">reembolsos e gastos</p>
          </div>
          <div className="rounded-lg p-2.5 border border-[var(--border)] bg-[var(--surface)]">
            <p className="text-[9px] uppercase tracking-wider mb-1 text-[var(--text-light)]">Valor Pago</p>
            <p className="text-sm font-bold text-[var(--success)]"><Money>{expPaid > 0 ? formatBRL(expPaid) : '—'}</Money></p>
            <p className="text-[9px] mt-0.5 text-[var(--text-muted)]">já reembolsado</p>
          </div>
          <div className="rounded-lg p-2.5 border border-[var(--border)] bg-[var(--surface)]">
            <p className="text-[9px] uppercase tracking-wider mb-1 text-[var(--text-light)]">A Receber</p>
            <p className="text-sm font-bold text-[var(--warning)]"><Money>{expTotal > 0 ? formatBRL(expTotal) : '—'}</Money></p>
            <p className="text-[9px] mt-0.5 text-[var(--text-muted)]">em aberto</p>
          </div>
        </div>
      </div>

    </div>
  )
}

// ─── Fixo Payment Section ─────────────────────────────────────────────────────

function FixoPaymentSection({
  yearMonth, fixedMonthly, expTotal, expPaid, proporcional, prorationRatio,
}: {
  yearMonth: string
  fixedMonthly: number
  expTotal: number
  expPaid: number
  proporcional?: boolean
  prorationRatio?: number
}) {
  const expAllTotal = expTotal + expPaid

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-5 grid grid-cols-[auto_1fr_auto] gap-x-8 items-center">

      {/* ESQUERDA */}
      <div className="flex flex-col gap-2 min-w-[120px]">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-light)]">Total a Receber</span>
        <span className="text-[12px] text-[var(--text-muted)] font-medium">{fmtYearMonth(yearMonth)}</span>
        {proporcional && prorationRatio !== undefined && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium w-fit" style={{ background: 'rgba(234,179,8,0.1)', color: '#eab308' }}>
            Proporcional {Math.round(prorationRatio * 100)}%
          </span>
        )}
      </div>

      {/* CENTRO — valor fixo */}
      <div className="flex flex-col gap-1 border-l border-[var(--border)] pl-8">
        <div className="text-[42px] font-extrabold leading-none tracking-tight text-[var(--primary)]">
          <Money>{fixedMonthly > 0 ? formatBRL(fixedMonthly) : '—'}</Money>
        </div>
        <span className="text-[11px] text-[var(--text-muted)] mt-1">
          {proporcional && prorationRatio !== undefined
            ? `${Math.round(prorationRatio * 100)}% do mês (proporcional)`
            : 'valor fixo mensal'}
        </span>
      </div>

      {/* DIREITA — despesas */}
      <div className="rounded-xl border border-orange-900/40 bg-[var(--warning-bg)] p-3 space-y-2 min-w-[280px]">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--warning)]/70 px-0.5">Despesas</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg p-2.5 border border-[var(--border)] bg-[var(--surface)]">
            <p className="text-[9px] uppercase tracking-wider mb-1 text-[var(--text-light)]">Total no Mês</p>
            <p className="text-sm font-bold" style={{ color: expAllTotal > 0 ? '#f97316' : 'var(--text-muted)' }}>
              <Money>{expAllTotal > 0 ? formatBRL(expAllTotal) : '—'}</Money>
            </p>
            <p className="text-[9px] mt-0.5 text-[var(--text-muted)]">reembolsos e gastos</p>
          </div>
          <div className="rounded-lg p-2.5 border border-[var(--border)] bg-[var(--surface)]">
            <p className="text-[9px] uppercase tracking-wider mb-1 text-[var(--text-light)]">Valor Pago</p>
            <p className="text-sm font-bold text-[var(--success)]"><Money>{expPaid > 0 ? formatBRL(expPaid) : '—'}</Money></p>
            <p className="text-[9px] mt-0.5 text-[var(--text-muted)]">já reembolsado</p>
          </div>
          <div className="rounded-lg p-2.5 border border-[var(--border)] bg-[var(--surface)]">
            <p className="text-[9px] uppercase tracking-wider mb-1 text-[var(--text-light)]">A Receber</p>
            <p className="text-sm font-bold text-[var(--warning)]"><Money>{expTotal > 0 ? formatBRL(expTotal) : '—'}</Money></p>
            <p className="text-[9px] mt-0.5 text-[var(--text-muted)]">em aberto</p>
          </div>
        </div>
      </div>

    </div>
  )
}

function ParceiroSimplesSection({
  yearMonth, workedMinutes, expTotal, expPaid,
}: {
  yearMonth: string
  workedMinutes: number
  expTotal: number
  expPaid: number
}) {
  const expAllTotal = expTotal + expPaid
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-5 grid grid-cols-[auto_1fr_auto] gap-x-8 items-center">
      {/* ESQUERDA */}
      <div className="flex flex-col gap-2 min-w-[120px]">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-light)]">Horas no Período</span>
        <span className="text-[12px] text-[var(--text-muted)] font-medium">{fmtYearMonth(yearMonth)}</span>
      </div>
      {/* CENTRO — horas totais */}
      <div className="flex flex-col gap-1 border-l border-[var(--border)] pl-8">
        <div className="text-[42px] font-extrabold leading-none tracking-tight text-[var(--primary)]">
          {minutesToHours(workedMinutes)}
        </div>
        <span className="text-[11px] text-[var(--text-muted)] mt-1">
          {(workedMinutes / 60).toFixed(1)}h apontadas no período
        </span>
      </div>
      {/* DIREITA — despesas */}
      <div className="rounded-xl border border-orange-900/40 bg-[var(--warning-bg)] p-3 space-y-2 min-w-[280px]">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--warning)]/70 px-0.5">Despesas</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg p-2.5 border border-[var(--border)] bg-[var(--surface)]">
            <p className="text-[9px] uppercase tracking-wider mb-1 text-[var(--text-light)]">Total no Mês</p>
            <p className="text-sm font-bold" style={{ color: expAllTotal > 0 ? '#f97316' : 'var(--text-muted)' }}>
              <Money>{expAllTotal > 0 ? formatBRL(expAllTotal) : '—'}</Money>
            </p>
            <p className="text-[9px] mt-0.5 text-[var(--text-muted)]">reembolsos e gastos</p>
          </div>
          <div className="rounded-lg p-2.5 border border-[var(--border)] bg-[var(--surface)]">
            <p className="text-[9px] uppercase tracking-wider mb-1 text-[var(--text-light)]">Valor Pago</p>
            <p className="text-sm font-bold text-[var(--success)]"><Money>{expPaid > 0 ? formatBRL(expPaid) : '—'}</Money></p>
            <p className="text-[9px] mt-0.5 text-[var(--text-muted)]">já reembolsado</p>
          </div>
          <div className="rounded-lg p-2.5 border border-[var(--border)] bg-[var(--surface)]">
            <p className="text-[9px] uppercase tracking-wider mb-1 text-[var(--text-light)]">A Receber</p>
            <p className="text-sm font-bold text-[var(--warning)]"><Money>{expTotal > 0 ? formatBRL(expTotal) : '—'}</Money></p>
            <p className="text-[9px] mt-0.5 text-[var(--text-muted)]">em aberto</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function HBPaymentSection({ data, fixedSalary, expTotal, expPaid, showExtras = true }: { data: HourBankMonth; fixedSalary: number; expTotal: number; expPaid: number; showExtras?: boolean }) {
  const hasExtra     = showExtras && data.accumulated_balance > 0
  const extraHours   = hasExtra ? data.accumulated_balance : 0
  const valorHoraExt = fixedSalary > 0 ? fixedSalary / 160 : 0
  const totalExtra   = hasExtra ? extraHours * valorHoraExt : 0
  const totalSalario = fixedSalary + totalExtra
  const expAllTotal  = expTotal + expPaid

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-5 grid grid-cols-[auto_1fr_auto] gap-x-8 items-center">
      {/* ESQUERDA — contexto */}
      <div className="flex flex-col gap-2 min-w-[120px]">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-light)]">Total a Receber</span>
        <span className="text-[12px] text-[var(--text-muted)] font-medium">{fmtYearMonth(data.year_month)}</span>
        {hasExtra && (
          <div className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit bg-[var(--success-bg)] border-green-500/20 text-[var(--success)]">
            <TrendingUp size={9} />
            +{fmtHours(extraHours)} extras
          </div>
        )}
      </div>

      {/* CENTRO — valor (só serviços) */}
      <div className="flex flex-col gap-1 border-l border-[var(--border)] pl-8">
        <div className="text-[42px] font-extrabold leading-none tracking-tight text-[var(--primary)]">
          <Money>{fixedSalary > 0 ? formatBRL(totalSalario) : '—'}</Money>
        </div>
        <span className="text-[11px] text-[var(--text-muted)] mt-1">
          {hasExtra ? `base + ${fmtHours(extraHours)} extras` : 'base mensal'}
        </span>
      </div>

      {/* Despesas — breakdown */}
      <div className="rounded-xl border border-orange-900/40 bg-[var(--warning-bg)] p-3 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--warning)]/70 px-0.5">Despesas</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl p-3 border border-[var(--border)] bg-[var(--surface)]">
            <p className="text-[10px] uppercase tracking-wider mb-1 text-[var(--text-light)]">Total no Mês</p>
            <p className="text-base font-bold" style={{ color: expAllTotal > 0 ? '#f97316' : 'var(--text-muted)' }}>
              <Money>{expAllTotal > 0 ? formatBRL(expAllTotal) : '—'}</Money>
            </p>
            <p className="text-[10px] mt-0.5 text-[var(--text-muted)]">reembolsos e gastos</p>
          </div>
          <div className="rounded-xl p-3 border border-[var(--border)] bg-[var(--surface)]">
            <p className="text-[10px] uppercase tracking-wider mb-1 text-[var(--text-light)]">Valor Pago</p>
            <p className="text-base font-bold text-[var(--success)]"><Money>{expPaid > 0 ? formatBRL(expPaid) : '—'}</Money></p>
            <p className="text-[10px] mt-0.5 text-[var(--text-muted)]">já reembolsado</p>
          </div>
          <div className="rounded-xl p-3 border border-[var(--border)] bg-[var(--surface)]">
            <p className="text-[10px] uppercase tracking-wider mb-1 text-[var(--text-light)]">A Receber</p>
            <p className="text-base font-bold text-[var(--warning)]"><Money>{expTotal > 0 ? formatBRL(expTotal) : '—'}</Money></p>
            <p className="text-[10px] mt-0.5 text-[var(--text-muted)]">em aberto</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function HBCurrentMonthCard({ data, isCurrentMonth }: { data: HourBankMonth; isCurrentMonth: boolean }) {
  const isNegAccum = data.accumulated_balance < 0

  return (
    <div className="space-y-3">
      {/* Cabeçalho da seção */}
      <div className="flex items-center gap-2 px-1">
        <Clock size={12} className="text-[var(--text-muted)]" />
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-light)]">Banco de Horas</span>
        <span className="text-[10px] text-[var(--text-muted)]">—</span>
        <span className="text-[11px] text-[var(--text-muted)] font-medium">{fmtYearMonth(data.year_month)}</span>
        {isCurrentMonth && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--primary-soft)] text-[var(--primary)] border border-blue-500/20">Em andamento</span>
        )}
      </div>

      {/* 4 cards operacionais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { label: 'Horas Previstas',   value: fmtHours(data.expected_hours),   sub: `${data.working_days} dias úteis`, neg: false, neutral: true },
          { label: 'Horas Trabalhadas', value: fmtHours(data.worked_hours),     sub: '',                                 neg: false, neutral: false },
          { label: 'Saldo do Mês',      value: fmtHours(data.month_balance),    sub: data.month_balance < 0 ? 'Déficit mensal' : data.month_balance > 0 ? 'Superávit' : 'Zerado', neg: data.month_balance < 0, neutral: false },
          { label: 'Saldo Anterior',    value: fmtHours(data.previous_balance), sub: '',                                 neg: data.previous_balance < 0, neutral: data.previous_balance === 0 },
        ] as const).map(item => (
          <div key={item.label} className={`rounded-xl p-4 border ${item.neg ? 'border-red-500/20 bg-[var(--danger-bg)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
            <p className="text-[10px] uppercase tracking-wider mb-2 text-[var(--text-light)]">{item.label}</p>
            <p className={`text-xl font-bold ${item.neg ? 'text-[var(--danger)]' : item.neutral ? 'text-[var(--text-muted)]' : 'text-[var(--text)]'}`}>{item.value}</p>
            {item.sub && <p className={`text-[10px] mt-1 ${item.neg ? 'text-[var(--danger)]/60' : 'text-[var(--text-muted)]'}`}>{item.sub}</p>}
          </div>
        ))}
      </div>

      {/* Horas não contabilizadas por conflito dentro do horário comercial (09h–18h) */}
      {data.conflict_hours != null && data.conflict_hours > 0 && (
        <div className="rounded-xl px-5 py-3 border border-amber-500/25 bg-[var(--warning-bg)] flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-light)]">Não contabilizado ao banco — conflito no horário comercial</p>
            <p className="text-[11px] mt-0.5 text-[var(--text-muted)]">
              Horas apontadas dentro de 09h–18h acima do teto de 9h/dia (apontamentos sobrepostos em clientes diferentes) não entram no saldo. Fora desse horário soma normal.
            </p>
          </div>
          <span className="text-xl font-bold whitespace-nowrap text-[var(--warning)]">−{fmtHours(data.conflict_hours)}</span>
        </div>
      )}

      {/* Saldo acumulado banner */}
      <div className={`rounded-xl px-5 py-4 border flex items-center justify-between ${
        isNegAccum ? 'border-red-500/25 bg-[var(--danger-bg)]' : 'border-green-500/20 bg-[var(--success-bg)]'
      }`}>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-light)] mb-1.5">Saldo Acumulado</p>
          <div className="flex items-center gap-2">
            <HBBalancePill value={data.accumulated_balance} size="lg" />
            {isNegAccum && <span className="text-[10px] text-[var(--danger)]/60 font-medium">Déficit acumulado</span>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-light)] mb-1.5">Saldo Final</p>
          <HBBalancePill value={data.final_balance} size="lg" />
        </div>
      </div>

      {/* Alerta de saldo negativo */}
      {isNegAccum && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-[var(--warning-bg)] px-4 py-3">
          <AlertTriangle size={13} className="text-[var(--warning)] shrink-0 mt-0.5" />
          <p className="text-[11px] text-[var(--warning)]/70">
            Saldo negativo indica horas a compensar ou a faturar como extra, conforme contrato.
          </p>
        </div>
      )}
    </div>
  )
}

function HBEvolutionChart({ history, current }: { history: HourBankMonth[]; current: HourBankMonth | null }) {
  const all = [...history, ...(current ? [current] : [])].sort((a, b) => a.year_month.localeCompare(b.year_month))
  if (all.length < 2) return null

  const W = 560, H = 80, PADX = 10, PADY = 12
  const values = all.map(m => m.accumulated_balance)
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 0)
  const range = max - min || 1
  const toX = (i: number) => PADX + (i / (all.length - 1)) * (W - PADX * 2)
  const toY = (v: number) => PADY + ((max - v) / range) * (H - PADY * 2)
  const zeroY = toY(0)
  const pts = all.map((m, i) => `${toX(i)},${toY(m.accumulated_balance)}`).join(' ')
  const isAllNeg = values.every(v => v <= 0)
  const lineColor = isAllNeg ? 'var(--danger-border)' : 'var(--success-border)'

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-light)] mb-3">Evolução do Saldo Acumulado</p>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" style={{ minWidth: 280 }}>
        {/* Zero line */}
        <line x1={PADX} y1={zeroY} x2={W - PADX} y2={zeroY} stroke="#3f3f46" strokeWidth={1} strokeDasharray="4 3" />
        {/* Area fill */}
        <polygon
          points={`${PADX},${zeroY} ${pts} ${W - PADX},${zeroY}`}
          fill={isAllNeg ? 'var(--danger-bg)' : 'var(--success-bg)'}
        />
        {/* Line */}
        <polyline points={pts} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinejoin="round" />
        {/* Dots */}
        {all.map((m, i) => (
          <circle key={m.year_month} cx={toX(i)} cy={toY(m.accumulated_balance)} r={2.5}
            fill={m.accumulated_balance < 0 ? 'var(--danger-border)' : 'var(--success-border)'} />
        ))}
        {/* Month labels */}
        {all.map((m, i) => (
          <text key={`l-${m.year_month}`} x={toX(i)} y={H + 14} textAnchor="middle" fontSize={8} fill="#52525b">
            {fmtYearMonth(m.year_month).split('/')[0]}
          </text>
        ))}
      </svg>
    </div>
  )
}

function HBHistoryRow({ row }: { row: HourBankMonth }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr className="border-b cursor-pointer hover:bg-[var(--surface-hover)] transition-colors" style={{ borderColor: 'var(--border)' }}
        onClick={() => setOpen(o => !o)}>
        <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text)' }}>
          <span className="flex items-center gap-1.5">
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {fmtYearMonth(row.year_month)}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-center" style={{ color: 'var(--text-muted)' }}>{fmtHours(row.expected_hours)}</td>
        <td className="px-4 py-3 text-sm text-center" style={{ color: 'var(--text)' }}>{fmtHours(row.worked_hours)}</td>
        <td className="px-4 py-3 text-center"><HBBalancePill value={row.month_balance} /></td>
        <td className="px-4 py-3 text-center"><HBBalancePill value={row.previous_balance} /></td>
        <td className="px-4 py-3 text-center"><HBBalancePill value={row.final_balance} /></td>
      </tr>
      {open && (
        <tr style={{ background: 'var(--surface-sunken)', borderBottom: `1px solid var(--border)` }}>
          <td colSpan={6} className="px-6 py-3">
            <div className="flex items-center gap-6 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span><span className="text-[var(--text-light)]">Dias úteis:</span> {row.working_days}</span>
              <span><span className="text-[var(--text-light)]">Feriados:</span> {row.holidays_count}</span>
              <span><span className="text-[var(--text-light)]">H/dia:</span> {row.daily_hours}h</span>
              <span><span className="text-[var(--text-light)]">Acumulado:</span> <HBBalancePill value={row.accumulated_balance} /></span>
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

// FASE 11.2.FE — Helper centralizado em src/lib/attachments.ts.
const fetchAndOpenFile = fetchAndOpenLegacyUrl

async function openReceiptUrl(url: string) {
  try { await fetchAndOpenFile(url) }
  catch { alert('Erro ao abrir comprovante') }
}

function ReceiptLinkInline({ url, label = 'Visualizar' }: { url: string; label?: string }) {
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
        style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--primary-soft)' }}>
        <Eye size={11} /> {loading ? 'Carregando...' : label}
      </button>
      <button type="button" onClick={() => handle(true)} disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
        style={{ background: 'var(--surface-hover)', color: 'var(--text-light)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <Download size={11} /> Baixar
      </button>
    </div>
  )
}

// ─── Expense detail helpers ───────────────────────────────────────────────────

const EXP_STATUS_CONF: Record<string, { bg: string; color: string; label: string }> = {
  pending:              { bg: 'rgba(234,179,8,0.12)',  color: '#EAB308', label: 'Pendente' },
  approved:             { bg: 'var(--success-bg)',  color: 'var(--success-border)', label: 'Aprovado' },
  rejected:             { bg: 'var(--danger-bg)',  color: 'var(--danger-border)', label: 'Rejeitado' },
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
      style={ !last ? { borderColor: 'var(--border)' } : undefined }>
      <span className="mt-0.5 shrink-0 p-1.5 rounded-lg"
        style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
        <Icon size={11} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-light)' }}>{label}</p>
        {children ?? (
          <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>{value ?? '—'}</p>
        )}
      </div>
    </div>
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
    <div className="flex items-center gap-0.5 bg-[var(--surface-hover)] border border-[var(--border)]/50 rounded-full p-1">
      {options.map(opt => (
        <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
            value === opt.value
              ? 'bg-[var(--primary)] text-[var(--primary-fg)] shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
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
        <div className="text-center text-sm font-semibold text-[var(--primary)] mb-3">
          {MONTH_NAMES_PT[m]} {y}
        </div>
        <div className="grid grid-cols-7 mb-1">
          {DAY_NAMES_PT.map(d => (
            <div key={d} className="text-center text-[10px] text-[var(--text-muted)] py-1">{d}</div>
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
                  s || e ? 'bg-[var(--primary)] text-[var(--primary-fg)] font-bold'
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
    : from ? `${fmtDisplay(from)} – ...`
    : 'Período'

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setOpen(o => !o); setSelecting(null) }}
        className="flex items-center gap-2 h-9 px-3 bg-[var(--surface-hover)] border border-[var(--border)] text-xs text-[var(--text)] rounded-lg hover:border-[var(--border-strong)] transition-colors whitespace-nowrap">
        <CalendarDays size={13} className="text-[var(--text-light)] shrink-0" />
        <span className={from || to ? 'text-[var(--text)]' : 'text-[var(--text-light)]'}>{displayText}</span>
        {(from || to) && (
          <span onClick={e => { e.stopPropagation(); onChange('', '') }}
            className="ml-1 text-[var(--text-muted)] hover:text-[var(--text-muted)] cursor-pointer">
            <X size={10} />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl p-4 right-0">
          <div className="flex items-center gap-4">
            <button type="button" onClick={prevMonth}
              className="text-[var(--text-light)] hover:text-[var(--text)] p-1 shrink-0">
              <ChevronLeft size={14} />
            </button>
            <div className="flex gap-4">
              {renderMonth(leftYM.y, leftYM.m)}
              <div className="w-px bg-[var(--surface-hover)]" />
              {renderMonth(rightYM.y, rightYM.m)}
            </div>
            <button type="button" onClick={nextMonth}
              className="text-[var(--text-light)] hover:text-[var(--text)] p-1 shrink-0">
              <ChevronRight size={14} />
            </button>
          </div>
          {selecting && (
            <p className="text-[11px] text-[var(--text-light)] text-center mt-3">Clique para selecionar a data final</p>
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
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-lg shadow-2xl">
        <button onClick={onClose}
          className="absolute top-3.5 right-3.5 text-[var(--text-light)] hover:text-[var(--text)] transition-colors">
          <X size={15} />
        </button>
        {children}
      </div>
    </div>
  )
}

function SummaryCard({
  label, value, sub, icon: Icon, accent, onClick, featured = false, money = false,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  accent: string
  onClick?: () => void
  featured?: boolean
  money?: boolean
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl p-5 transition-colors ${
        featured
          ? 'border-2 border-[var(--primary)] bg-[var(--primary-soft)] shadow-[0_0_20px_var(--primary-soft)]'
          : `border border-[var(--border)] bg-[var(--surface)] ${onClick ? 'cursor-pointer hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]' : ''}`
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${featured ? 'text-[var(--primary)]' : 'text-[var(--text-light)]'}`}>{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${featured ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : accent}`}>
          <Icon size={14} />
        </div>
      </div>
      <div className={`font-bold tracking-tight break-all leading-tight ${featured ? 'text-2xl text-[var(--primary)]' : 'text-lg text-[var(--text)]'}`}>{money ? <Money>{value}</Money> : value}</div>
      {sub && <div className={`text-xs mt-1.5 ${featured ? 'text-[var(--primary-soft)]' : 'text-[var(--text-light)]'}`}>{sub}</div>}
    </div>
  )
}

function ExpenseBreakdownCard({ total, paid, pending, count, onClick }: {
  total: number; paid: number; pending: number; count: number; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl p-5 border border-[var(--border)] bg-[var(--surface)] transition-colors ${onClick ? 'cursor-pointer hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-light)]">Total Despesas</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[var(--warning-bg)] text-[var(--warning)]">
          <Receipt size={14} />
        </div>
      </div>
      <div className="text-lg font-bold text-[var(--text)] tracking-tight">{formatBRL(total)}</div>
      <div className="text-xs text-[var(--text-light)] mt-1 mb-3">{count} lançamento{count !== 1 ? 's' : ''}</div>
      <div className="space-y-1.5 border-t border-[var(--border)] pt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--text-light)]">Pago</span>
          <span className="font-semibold text-[var(--success)]">{formatBRL(paid)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--text-light)]">Em aberto</span>
          <span className={`font-semibold ${pending > 0 ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]'}`}>{formatBRL(pending)}</span>
        </div>
      </div>
    </div>
  )
}

function MiniDonut({ services, expenses }: { services: number; expenses: number }) {
  const total = services + expenses
  const r = 20, cx = 26, cy = 26
  const circ = 2 * Math.PI * r
  if (total <= 0) return (
    <svg width={52} height={52} viewBox="0 0 52 52">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-hover)" strokeWidth={6} />
    </svg>
  )
  const srvLen = (services / total) * circ
  const expLen = (expenses / total) * circ
  return (
    <svg width={52} height={52} viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-hover)" strokeWidth={6} />
      {srvLen > 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--primary)" strokeWidth={6}
          strokeDasharray={`${srvLen} ${circ - srvLen}`} strokeDashoffset={0} />
      )}
      {expLen > 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f97316" strokeWidth={6}
          strokeDasharray={`${expLen} ${circ - expLen}`} strokeDashoffset={circ - srvLen} />
      )}
    </svg>
  )
}

function HeroTotal({
  period, total, variation, prevLabel, expTotal, expPaid,
}: {
  period: string
  total: number | null
  variation: number | null
  prevLabel: string
  expTotal?: number
  expPaid?: number
}) {
  const isPos        = variation !== null && variation >= 0
  const hasExpenses  = expTotal !== undefined && expPaid !== undefined
  const expAllTotal  = hasExpenses ? (expTotal! + expPaid!) : 0
  const hasServices  = total !== null && total > 0
  const hasExpData   = hasExpenses && expAllTotal > 0
  const grandTotal   = (hasServices ? total! : 0) + (hasExpData ? expAllTotal : 0)
  const showGrand    = hasServices && hasExpData

  return (
    <div
      className="ds-card px-6 py-6 flex flex-col gap-5"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* ── Linha 1: contexto + valor principal alinhados à esquerda ── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{ color: 'var(--text-light)' }}
          >
            {showGrand ? 'Total do Período' : 'Total de Serviços'}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>· {period}</span>
          {variation !== null && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: isPos ? 'var(--success-bg)' : 'var(--danger-bg)',
                color:      isPos ? 'var(--success)'    : 'var(--danger)',
              }}
            >
              {isPos ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
              {isPos ? '+' : ''}{variation.toFixed(1)}% vs {prevLabel}
            </span>
          )}
        </div>

        <div
          className="text-[42px] font-extrabold leading-none tracking-tight"
          style={{ color: 'var(--primary)' }}
        >
          {showGrand
            ? formatBRL(grandTotal)
            : hasServices
              ? formatBRL(total!)
              : hasExpData
                ? formatBRL(expAllTotal)
                : '—'}
        </div>

        {!hasServices && !hasExpData && (
          <span className="text-[12px] mt-1" style={{ color: 'var(--text-light)' }}>
            Sem movimentação no período
          </span>
        )}
      </div>

      {/* ── Linha 2: breakdown serviços + despesas (composição interna) ── */}
      {(hasServices || hasExpData) && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          {/* Serviços */}
          <div className="flex flex-col gap-1">
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-light)' }}
            >
              Serviços
            </span>
            <span className="text-lg font-bold" style={{ color: 'var(--text)' }}>
              {hasServices ? formatBRL(total!) : '—'}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>
              total no período
            </span>
          </div>

          {/* Despesas — total */}
          {hasExpData && (
            <div className="flex flex-col gap-1">
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--warning)' }}
              >
                Despesas
              </span>
              <span className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                {formatBRL(expAllTotal)}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>
                total no mês
              </span>
            </div>
          )}

          {/* Despesas — pago / a receber */}
          {hasExpData && (
            <div className="flex gap-6">
              <div className="flex flex-col gap-1">
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--text-light)' }}
                >
                  Reembolsado
                </span>
                <span className="text-base font-bold" style={{ color: 'var(--success)' }}>
                  {expPaid! > 0 ? formatBRL(expPaid!) : '—'}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>
                  já pago
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--text-light)' }}
                >
                  A Receber
                </span>
                <span className="text-base font-bold" style={{ color: 'var(--warning)' }}>
                  {expTotal! > 0 ? formatBRL(expTotal!) : '—'}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>
                  em aberto
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BarChartRow({
  label, minutes, maxMinutes, color = 'var(--primary)',
}: {
  label: string; minutes: number; maxMinutes: number; color?: string
}) {
  const pct = maxMinutes > 0 ? (minutes / maxMinutes) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-xs text-[var(--text-muted)] text-right truncate shrink-0">{label}</div>
      <div className="flex-1 bg-[var(--surface-hover)] rounded-full h-2 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-14 text-xs text-[var(--text-muted)] text-right shrink-0">{minutesToHours(minutes)}</div>
    </div>
  )
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <tr key={i} className="border-b border-[var(--border)]">
          {[...Array(cols)].map((_, j) => (
            <td key={j} className="px-4 py-3.5"><Skeleton className="h-4 w-full" /></td>
          ))}
        </tr>
      ))}
    </>
  )
}

function StatusBadge({ status, display, reason, pendingRelease }: { status: string; display?: string; reason?: string | null; pendingRelease?: boolean }) {
  if (pendingRelease) {
    return (
      <span title="Apontamento em atraso: conta para o cliente, mas NÃO reflete no seu fechamento/pagamento. Fale com o seu coordenador para liberar as horas."
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap"
        style={{ background: 'var(--danger-bg)', color: 'var(--danger)', borderColor: 'var(--danger-border)' }}>
        Em atraso — fale com o coordenador
      </span>
    )
  }
  if (status === 'approved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-[var(--success-bg)] text-[var(--success)] border-green-500/25">
        <Lock size={9} />
        Aprovado
      </span>
    )
  }
  return (
    <ReasonTooltip status={status} reason={reason}>
      <Badge variant="outline" className={`text-[10px] font-medium border ${STATUS_COLORS[status] ?? 'text-[var(--text-muted)] border-[var(--border)]'}`}>
        {STATUS_LABELS[status] ?? display ?? status}
      </Badge>
    </ReasonTooltip>
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
        className={`p-1.5 rounded transition-colors ${open ? 'text-[var(--text)] bg-[var(--surface-hover)]' : 'text-[var(--text-light)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'}`}
      >
        <MoreVertical size={14} />
      </button>
      {pos && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="min-w-[144px] bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl shadow-2xl py-1 overflow-hidden">
          {items.map((item, i) => (
            <button key={i} onClick={() => { item.onClick(); setPos(null) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left ${
                item.danger
                  ? 'text-[var(--danger)] hover:bg-[var(--danger-bg)]'
                  : 'text-[var(--text)] hover:bg-[var(--surface-hover)]'
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
        className={`flex items-center justify-between gap-2 h-9 px-3 min-w-[150px] bg-[var(--surface-hover)] border rounded-lg text-xs transition-colors ${
          open ? 'border-[var(--border-strong)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--text)] hover:border-[var(--border-strong)]'
        }`}>
        <span className={selected ? 'text-[var(--text)]' : 'text-[var(--text-light)]'}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown size={12} className="text-[var(--text-light)] shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-full w-max max-w-[260px] bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-[var(--border)]">
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="w-full bg-[var(--surface)] border border-[var(--border-strong)] rounded-lg text-xs text-[var(--text)] px-2.5 py-1.5 outline-none focus:border-[var(--border-strong)] placeholder:text-[var(--text-muted)]" />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            <button type="button" onClick={() => { onChange(''); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${!value ? 'text-[var(--primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'}`}>
              {placeholder}
            </button>
            {filtered.map(o => (
              <button key={o.id} type="button"
                onClick={() => { onChange(String(o.id)); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  String(o.id) === value ? 'text-[var(--primary)] bg-[var(--surface-hover)]' : 'text-[var(--text)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
                }`}>
                {o.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-[var(--text-muted)]">Nenhum resultado</p>
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
      <Label className="text-xs text-[var(--text-muted)]">{label}{required && ' *'}</Label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1.5 w-full bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] text-xs rounded-lg h-9 px-2.5 outline-none focus:border-[var(--border-strong)] transition-colors appearance-none"
      >
        {children}
      </select>
    </div>
  )
}

function SearchSelectField({ label, value, onChange, options, placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void
  options: { id: number | string; name: string }[]; placeholder: string; required?: boolean
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
  useEffect(() => { if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 50) } }, [open])

  return (
    <div ref={ref} className="relative">
      <Label className="text-xs text-[var(--text-muted)]">{label}{required && ' *'}</Label>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="mt-1.5 w-full flex items-center justify-between gap-2 px-2.5 rounded-lg text-xs outline-none text-left h-9"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: selected ? 'var(--text)' : 'var(--text-light)' }}>
        <span className="truncate">{selected ? selected.name : placeholder}</span>
        <ChevronRight size={12} className="rotate-90 shrink-0" style={{ color: 'var(--text-light)' }} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-full rounded-xl shadow-2xl overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar..."
              className="w-full px-3 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button type="button" onClick={() => { onChange(''); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface-hover)] transition-colors"
              style={{ color: !value ? 'var(--primary)' : 'var(--text-light)' }}>{placeholder}</button>
            {filtered.length === 0
              ? <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-light)' }}>Nenhum resultado</p>
              : filtered.map(o => (
                <button key={o.id} type="button" onClick={() => { onChange(String(o.id)); setOpen(false) }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface-hover)] transition-colors"
                  style={{ color: String(o.id) === value ? 'var(--primary)' : 'var(--text)' }}>
                  {o.name}
                </button>
              ))}
          </div>
        </div>
      )}
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
  user_id:     '',   // admin/coord podem apontar por outro usuário; vazio = eu mesmo
  customer_id: '',
  project_id:  '',
  stage_delivery_id: '',
  real_project_id: '',
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
  real_project_id:     '',
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

/**
 * Card self-contained: o consultor PJ envia suas NFS-e + Nota de débito do mês.
 * Busca o estado via GET /fechamento/notas/consultor/{id}/{ym}; se a resposta vier
 * `notas: null` (consultor não-PJ), o card não aparece. Só upload — o aceite/recusa é do admin.
 */
function MinhasNotasFiscaisCard({ userId }: { userId: number }) {
  // O fechamento a faturar é sempre o do MÊS ANTERIOR — a nota é emitida no mês vigente
  // (prazo dia 15 deste mês) e o valor = recebimento do fechamento do mês passado.
  // Por isso o card abre no mês anterior; o consultor ainda pode navegar pelo seletor.
  const [ym, setYm] = useState(() => {
    const d = new Date()
    d.setDate(1)                    // evita overflow ao voltar de meses de 31 dias
    d.setMonth(d.getMonth() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [notas, setNotas] = useState<NotasPayload>(null)
  const [isPj, setIsPj] = useState<boolean | null>(null)
  // Recebimento esperado do fechamento (o valor da nota deve ser igual a ele).
  const [expectedValue, setExpectedValue] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    api.get<{ notas: NotasPayload }>(`/fechamento/notas/consultor/${userId}/${ym}`)
      .then(r => { if (alive) { setNotas(r.notas ?? null); setIsPj(r.notas != null) } })
      .catch(() => { if (alive) setIsPj(false) })
    api.get<{ data: { recebimento: number } }>(`/my-closing/${ym}`)
      .then(r => { if (alive) setExpectedValue(r?.data?.recebimento ?? null) })
      .catch(() => { if (alive) setExpectedValue(null) })
    return () => { alive = false }
  }, [userId, ym])

  if (isPj !== true) return null // não-PJ ou ainda carregando: não mostra

  return (
    <div className="mb-4 rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Minhas Notas Fiscais (PJ)</h3>
        <input
          type="month"
          value={ym}
          onChange={e => setYm(e.target.value)}
          className="px-2 py-1 rounded bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] text-xs"
        />
      </div>
      <p className="text-xs text-[var(--text-light)] mb-3">Envie a NFS-e do mês. O administrativo valida (aceita ou recusa com motivo).</p>
      <NotasPjCell type="consultor" id={userId} yearMonth={ym} notas={notas} canDecide={false} canUpload expectedValue={expectedValue} onChanged={setNotas} />
    </div>
  )
}

export default function MeuPainelPage() {
  const { user } = useAuth()
  const isCoordenador = user?.type === 'coordenador'
  const isAdmin = user?.type === 'admin'
  const canActAsUser = isAdmin || isCoordenador   // podem apontar por outro consultor
  const hover = useTimesheetHover()

  // Period
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const { startDate, endDate } = periodBounds(year, month)

  const nowForNav  = new Date()
  const isAtCurrentMonth = year > nowForNav.getFullYear() ||
    (year === nowForNav.getFullYear() && month >= nowForNav.getMonth())

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (isAtCurrentMonth) return
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  // Tabs
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  // Privacidade: a tela sempre abre com os valores monetários ocultos; o olho revela.
  const [moneyHidden, setMoneyHidden] = useState(true)

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
  const [tsModal,       setTsModal]       = useState<{ open: boolean; item?: TimesheetItem }>({ open: false })
  const [tsViewItem,    setTsViewItem]    = useState<TimesheetItem | null>(null)
  const [tsConflictItem, setTsConflictItem] = useState<TimesheetItem | null>(null)
  const [tsEditConflict, setTsEditConflict] = useState<{ date: string; start_time?: string; end_time?: string; customer_name?: string; project_name?: string } | null>(null)
  const [tsForm,     setTsForm]     = useState({ ...EMPTY_TS })
  const [tsModeTotal, setTsModeTotal] = useState(false)
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; message: string; onConfirm: () => void } | null>(null)
  const [tsSaving,   setTsSaving]   = useState(false)

  // ── Sticky sub-header height measurement ──────────────────────────────────
  const stickyHeaderRef = useRef<HTMLDivElement>(null)
  const [stickyHeaderH, setStickyHeaderH] = useState(0)
  useEffect(() => {
    const el = stickyHeaderRef.current
    if (!el) return
    const update = () => setStickyHeaderH(el.offsetHeight)
    const ro = new ResizeObserver(update)
    ro.observe(el)
    update()
    return () => ro.disconnect()
  }, [])

  // ── Expense state ──────────────────────────────────────────────────────────
  const [expenses,    setExpenses]   = useState<ExpenseItem[]>([])
  const [expLoading,  setExpLoading] = useState(true)
  const [expTotal,    setExpTotal]   = useState(0)
  const [expPaid,     setExpPaid]    = useState(0)
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

  // ── Recebimento do fechamento (mesmo valor que o admin vê) ──────────────────
  const [myClosing, setMyClosing] = useState<MyClosing | null>(null)

  // ── Support data ───────────────────────────────────────────────────────────
  const [projects,       setProjects]       = useState<ProjectOption[]>([])
  const [tsRealProjects, setTsRealProjects] = useState<any[]>([])
  const [expRealProjects, setExpRealProjects] = useState<any[]>([])
  const [categories,     setCategories]     = useState<CategoryOption[]>([])
  const [paymentMethods, setPaymentMethods] = useState<{ value: string; label: string }[]>([])
  // Admin/coord apontando por outro: lista de usuários + projetos DO usuário selecionado.
  const [tsUsers,        setTsUsers]        = useState<{ id: number; name: string }[]>([])
  const [tsUserProjects, setTsUserProjects] = useState<ProjectOption[]>([])

  // Load support data once
  useEffect(() => {
    api.get<any>('/my-projects?pageSize=200&status=open').then(r =>
      setProjects(Array.isArray(r?.items) ? r.items : [])
    ).catch(() => {})

    if (canActAsUser) {
      api.get<any>('/users?pageSize=300&exclude_type=cliente').then(r => {
        const list = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
        setTsUsers(list.map((u: any) => ({ id: u.id, name: u.name })))
      }).catch(() => {})
    }

    api.get<any>('/expense-categories?per_page=50').then(r => {
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
    if (!user?.id) return  // aguarda auth carregar — Meu Painel é sempre do usuário logado
    setTsLoading(true)
    try {
      const p = new URLSearchParams({
        page: String(tsPage),
        pageSize: '100',
        start_date: tsDateFrom || startDate,
        end_date:   tsDateTo   || endDate,
      })
      p.set('user_id', String(user.id))
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
  }, [tsPage, startDate, endDate, tsSearch, tsProject, tsCustomer, tsStatus, tsDateFrom, tsDateTo, isCoordenador, user?.id])

  // ── Load expenses ──────────────────────────────────────────────────────────
  const loadExpenses = useCallback(async () => {
    if (!user?.id) return  // aguarda auth carregar
    setExpLoading(true)
    try {
      const p = new URLSearchParams({
        page: String(expPage), pageSize: '50',
        start_date: expDateFrom || startDate,
        end_date:   expDateTo   || endDate,
      })
      p.set('user_id', String(user.id))
      if (expSearch)   p.set('search',      expSearch)
      if (expCustomer)  p.set('customer_id',  expCustomer)
      if (expProject)   p.set('project_id',   expProject)
      if (expStatus)    p.set('status',        expStatus)
      if (expCategory)  p.set('category_id',  expCategory)
      const r = await api.get<any>(`/expenses?${p}`)
      const list: ExpenseItem[] = Array.isArray(r?.items) ? r.items : []
      setExpenses(list)
      setExpHasNext(!!r?.hasNext)
      const toNum = (e: ExpenseItem) => parseFloat(String(e.amount)) || 0
      setExpPaid(list.filter(e => e.is_paid).reduce((acc, e) => acc + toNum(e), 0))
      setExpTotal(list.filter(e => !e.is_paid).reduce((acc, e) => acc + toNum(e), 0))
    } catch { toast.error('Erro ao carregar despesas') }
    finally   { setExpLoading(false) }
  }, [expPage, startDate, endDate, expSearch, expCustomer, expProject, expStatus, expCategory, expDateFrom, expDateTo, isCoordenador, user?.id])

  const hasTsFilters = !!(tsSearch || tsCustomer || tsProject || tsStatus || tsDateFrom || tsDateTo)
  const hasExpFilters = !!(expSearch || expCustomer || expProject || expStatus || expCategory || expDateFrom || expDateTo)

  function exportTs() {
    exportTimesheetsToExcel(
      timesheets.map(ts => ({
        date:           ts.date,
        client:         ts.customer?.name ?? ts.project?.customer?.name ?? '',
        project:        ts.project?.name ?? '',
        ticket:         ts.ticket ?? '',
        ticket_subject: ts.ticket_subject ?? '',
        start_time:     ts.start_time,
        end_time:       ts.end_time,
        effort_hours:   ts.effort_hours,
        effort_minutes: ts.effort_minutes,
        observation:    ts.observation ?? '',
        status_display: ts.status_display,
      })),
      'apontamentos'
    )
  }

  function clearTsFilters() {
    setTsSearch(''); setTsCustomer(''); setTsProject(''); setTsStatus(''); setTsDateFrom(''); setTsDateTo(''); setTsPage(1)
  }
  function clearExpFilters() {
    setExpSearch(''); setExpCustomer(''); setExpProject(''); setExpStatus(''); setExpCategory(''); setExpDateFrom(''); setExpDateTo(''); setExpPage(1)
  }

  useEffect(() => { loadTimesheets() }, [loadTimesheets])
  useEffect(() => { loadExpenses() },  [loadExpenses])

  // ── Recebimento do fechamento do próprio usuário (espelha a tela do admin) ──
  useEffect(() => {
    if (!user?.id) return
    const ym = `${year}-${String(month + 1).padStart(2, '0')}`
    let alive = true
    setMyClosing(null)
    api.get<{ data: MyClosing }>(`/my-closing/${ym}`)
      .then(r => { if (alive) setMyClosing(r?.data ?? null) })
      .catch(() => { if (alive) setMyClosing(null) })
    return () => { alive = false }
  }, [year, month, user?.id])

  // Reset pages when period changes
  useEffect(() => { setTsPage(1); setExpPage(1) }, [startDate, endDate])

  // ── History: últimos 12 meses ──────────────────────────────────────────────

  interface MonthPoint {
    ym: string        // 'YYYY-MM'
    label: string     // 'Jan', 'Fev' ...
    hours: number     // horas aprovadas
    revenue: number   // R$ (approved hours × rate)
    expenses: number  // R$ despesas aprovadas
    isCurrent: boolean
  }

  const [history,        setHistory]        = useState<MonthPoint[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    const rawRate = (user as any)?.hourly_rate ?? 0
    const rType   = (user as any)?.rate_type ?? 'hourly'
    const rate    = rawRate > 0 ? (rType === 'monthly' ? rawRate / 160 : rawRate) : 0

    async function load() {
      setHistoryLoading(true)
      try {
        const now   = new Date()
        const end12 = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`
        const start = new Date(now.getFullYear(), now.getMonth() - 11, 1)
        const start12 = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`

        const uid = user?.id ? `&user_id=${user.id}` : ''
        const [tsRes, expRes] = await Promise.all([
          api.get<any>(`/timesheets?start_date=${start12}&end_date=${end12}&per_page=2000&status=approved${uid}`),
          api.get<any>(`/expenses?start_date=${start12}&end_date=${end12}&per_page=2000&status=approved${uid}`),
        ])

        const tsList: TimesheetItem[] = Array.isArray(tsRes?.items) ? tsRes.items : []
        const expList: ExpenseItem[]  = Array.isArray(expRes?.items) ? expRes.items : []

        // Build month buckets
        const MONTH_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
        const points: MonthPoint[] = []
        for (let i = 11; i >= 0; i--) {
          const d   = new Date(now.getFullYear(), now.getMonth() - i, 1)
          const ym  = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          const isCurrent = i === 0

          const monthTs  = tsList.filter(t => t.date?.startsWith(ym))
          const monthExp = expList.filter(e => e.expense_date?.startsWith(ym))

          const totalMin = monthTs.reduce((a, t) => a + (t.effort_minutes ?? 0), 0)
          const hours    = totalMin / 60
          const revenue  = rate > 0 ? hours * rate : 0
          const expenses = monthExp.reduce((a, e) => a + (parseFloat(String(e.amount)) || 0), 0)

          points.push({ ym, label: MONTH_SHORT[d.getMonth()], hours, revenue, expenses, isCurrent })
        }
        setHistory(points)
      } catch { /* silent */ }
      finally { setHistoryLoading(false) }
    }

    load()
  }, [user])

  // ── Load Banco de Horas (only for bh_fixo / bh_mensal consultants) ─────────
  useEffect(() => {
    const ct = (user as any)?.consultant_type
    if (!['banco_de_horas', 'bh_fixo', 'bh_mensal'].includes(ct)) return
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
    setTsModeTotal(false)
    setTsModal({ open: true })
  }

  const openEditTs = (item: TimesheetItem) => {
    const proj = projects.find(p => p.id === item.project_id)
    const derivedTotal = item.start_time && item.end_time
      ? String(Math.round(timeDiffHours(item.start_time, item.end_time) * 10) / 10)
      : item.effort_hours ? String(Math.round(parseFloat(String(item.effort_hours).replace(',', '.')) * 10) / 10) : ''
    setTsModeTotal(!item.start_time && !!item.effort_hours)
    setTsForm({
      user_id:     '',
      customer_id: proj?.customer ? String(proj.customer.id) : '',
      project_id:  String(item.project_id),
      stage_delivery_id: item.stage_delivery_id ? String(item.stage_delivery_id) : '',
      real_project_id: String((item as any).real_project_id ?? ''),
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
    const selectedProject = tsFormProjects.find(p => p.id === Number(tsForm.project_id)) as any
    const scTs = tsFormCustomers.find(c => String(c.id) === tsForm.customer_id)
    const isErpTs = String(scTs?.name ?? '').toUpperCase().includes('ERPSERV')
    const tsIsInvestimento = !!selectedProject?.is_investimento_comercial && !isErpTs
      && (selectedProject?.categoria_interna === 'Projeto' || selectedProject?.categoria_interna === 'Suporte')
    if (tsIsInvestimento && !tsForm.real_project_id) { toast.error('Selecione o Projeto Real'); return }
    const projectIsSustentacao = isSustentacao(selectedProject?.service_type?.name)
    if (projectIsSustentacao) {
      if (!tsForm.ticket || !tsForm.ticket.trim()) { toast.error('Informe o número do ticket'); return }
      if (!/^\d+$/.test(tsForm.ticket.trim()))    { toast.error('O ticket deve ser numérico'); return }
    }
    setTsSaving(true)
    try {
      const payload: Record<string, unknown> = {
        project_id:  Number(tsForm.project_id),
        ...(tsIsInvestimento && tsForm.real_project_id ? { real_project_id: Number(tsForm.real_project_id) } : {}),
        date:        tsForm.date,
        observation: tsForm.observation || undefined,
        ticket:      tsForm.ticket      || undefined,
      }
      if (tsForm.stage_delivery_id) payload.stage_delivery_id = Number(tsForm.stage_delivery_id)
      // Admin/coord apontando por outro consultor → manda o user_id (senão o BE usa o logado).
      if (tsActingAsOther) payload.user_id = Number(tsForm.user_id)
      if (hasTotal && !hasStart) {
        payload.total_hours = hoursToHHMM(totalVal)
      } else {
        payload.start_time = tsForm.start_time
        payload.end_time   = tsForm.end_time
      }
      if (tsModal.item) await api.put(`/timesheets/${tsModal.item.id}`, payload)
      else              await api.post('/timesheets', payload)

      toast.success(tsModal.item ? 'Apontamento atualizado' : 'Apontamento criado')
      setTsModal({ open: false })
      loadTimesheets()
    } catch (e: any) {
      if (e instanceof ApiError && e.data?.code === 'TIMESHEET_CONFLICT' && e.data?.conflicting_timesheet) {
        setTsEditConflict(e.data.conflicting_timesheet as any)
      } else {
        toast.error(e instanceof ApiError ? e.message : (e?.message ?? 'Erro ao salvar'))
      }
    }
    finally     { setTsSaving(false) }
  }

  const deleteTs = (id: number) => {
    setConfirmModal({
      open: true,
      message: 'Deseja excluir este apontamento? Esta ação não pode ser desfeita.',
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await api.delete(`/timesheets/${id}`)
          toast.success('Apontamento excluído')
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) {
            toast.info('Apontamento já havia sido removido')
          } else {
            toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir')
          }
        } finally {
          loadTimesheets()
        }
      },
    })
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
      real_project_id:     String((item as any).real_project_id ?? ''),
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
    const spExp = projects.find(p => p.id === Number(expForm.project_id)) as any
    const scExp = consultantCustomers.find(c => String(c.id) === expForm.customer_id)
    const isErpExp = String(scExp?.name ?? '').toUpperCase().includes('ERPSERV')
    const expIsInvestimento = !!spExp?.is_investimento_comercial && !isErpExp
    if (expIsInvestimento && !expForm.real_project_id) { toast.error('Selecione o Projeto Real'); return }
    setExpSaving(true)
    try {
      const fd = new FormData()
      fd.append('project_id',          expForm.project_id)
      if (expIsInvestimento && expForm.real_project_id) fd.append('real_project_id', expForm.real_project_id)
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

      const res = await fetch(url, { method, credentials: 'same-origin', body: fd })
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

  const deleteExp = (id: number) => {
    setConfirmModal({
      open: true,
      message: 'Deseja excluir esta despesa? Esta ação não pode ser desfeita.',
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await api.delete(`/expenses/${id}`)
          toast.success('Despesa excluída')
          loadExpenses()
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) {
            setExpenses(prev => prev.filter(ex => ex.id !== id))
            toast.success('Despesa excluída')
          } else {
            toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir')
          }
        }
      },
    })
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

  // Taxa efetiva: horistas usam o valor direto; mensalistas dividem por 160
  const hourlyRate      = Number((user as any)?.hourly_rate ?? 0)
  const rateType        = (user as any)?.rate_type ?? 'hourly'
  const guaranteedHours = (user as any)?.guaranteed_hours != null ? Number((user as any).guaranteed_hours) : null
  const effectiveRate   = hourlyRate > 0
    ? (rateType === 'monthly' ? hourlyRate / 160 : hourlyRate)
    : 0
  const tsPctExtraMin = useMemo(() =>
    timesheets.reduce((acc, ts) => acc + (ts.consultant_extra_pct
      ? Math.round(ts.effort_minutes * (ts.consultant_extra_pct / 100))
      : 0), 0),
  [timesheets])
  const workedHours     = tsTotalMin / 60

  // Proporcionalidade: se bank_hours_start_date cai no mês selecionado
  const consultantStartStr = (user as any)?.bank_hours_start_date as string | null | undefined
  const prorationRatio = (() => {
    if (!consultantStartStr) return 1
    // Garante formato YYYY-MM-DD independente de vir com timestamp da API
    const dateOnly = consultantStartStr.substring(0, 10)
    const sd = new Date(dateOnly + 'T00:00:00')
    const startYM    = sd.getFullYear() * 12 + sd.getMonth()
    const selectedYM = year * 12 + month
    if (selectedYM < startYM) return 0  // mês anterior à contratação: sem valor
    if (selectedYM > startYM) return 1  // mês posterior: valor cheio
    // Mesmo mês de entrada: proporcional pelos dias úteis a partir do dia de início
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    let fullWD = 0, periodWD = 0
    for (let i = 1; i <= daysInMonth; i++) {
      const dow = new Date(year, month, i).getDay()
      if (dow !== 0 && dow !== 6) {
        fullWD++
        if (i >= sd.getDate()) periodWD++
      }
    }
    return fullWD > 0 ? periodWD / fullWD : 1
  })()
  const isProporcional = prorationRatio < 1

  // Para horistas com horas garantidas: piso mínimo de cobrança (proporcional se entrou no mês)
  const guaranteedProrated  = guaranteedHours !== null ? Math.round(guaranteedHours * prorationRatio * 100) / 100 : null
  const billableHours   = prorationRatio === 0
    ? 0  // mês anterior à contratação: sem horas faturáveis
    : guaranteedProrated !== null
      ? Math.max(workedHours, guaranteedProrated)
      : workedHours
  const estimatedValue  = effectiveRate > 0
    ? billableHours * effectiveRate
    : null

  const approvedTs  = timesheets.filter(t => t.status === 'approved').length
  const rejectedTs  = timesheets.filter(t => t.status === 'rejected').length
  const lateTs      = timesheets.filter(t => t.consultant_pending_release).length // atraso não liberado: não é "pendente de aprovação"
  const notApprTs   = timesheets.length - approvedTs - lateTs
  const approvedExp = expenses.filter(e => e.status === 'approved').length
  const rejectedExp = expenses.filter(e => e.status === 'rejected').length
  const notApprExp  = expenses.length - approvedExp

  // ── HB totals (computed at component level — no IIFE closure issues) ────────
  const hbSelectedYM  = `${year}-${String(month + 1).padStart(2, '0')}`
  const hbStartYM     = hbStartDate ? hbStartDate.substring(0, 7) : null
  const hbBeforeStart = hbStartYM !== null && hbSelectedYM < hbStartYM
  const hbExtraHours  = !hbBeforeStart && hbCurrent && hbCurrent.accumulated_balance > 0
    ? hbCurrent.accumulated_balance : 0
  const hbExtraValue  = hourlyRate > 0 ? hbExtraHours * (hourlyRate / 160) : 0
  const hbServiceVal  = hourlyRate + hbExtraValue
  const hbTotalGeral  = hbServiceVal + expTotal

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

  // daysWorked: busca todos os apontamentos do mês (sem paginação) para calcular dias únicos
  const [daysWorked, setDaysWorked] = useState(0)
  useEffect(() => {
    if (!startDate || !endDate || !user?.id) return
    api.get<any>(`/timesheets?start_date=${startDate}&end_date=${endDate}&per_page=1000&user_id=${user.id}`)
      .then(r => {
        const all: TimesheetItem[] = Array.isArray(r?.items) ? r.items : []
        setDaysWorked(new Set(all.map((t: TimesheetItem) => t.date)).size)
      })
      .catch(() => {})
  }, [startDate, endDate, user?.id])

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
  const projectedValue = effectiveRate > 0 ? projectedHours * effectiveRate : null
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

  const isHBConsultant    = ['banco_de_horas', 'bh_fixo', 'bh_mensal'].includes((user as any)?.consultant_type ?? '')
  const isHorista         = (user as any)?.consultant_type === 'horista'
  const isFixo            = (user as any)?.consultant_type === 'fixo'
  const isParceiroSimples = user?.type === 'parceiro_admin' && !user?.is_executive

  // ── Hero Total computation ─────────────────────────────────────────────────
  const _heroPad = (n: number) => String(n).padStart(2, '0')
  const heroPeriodLabel = fmtYearMonth(`${year}-${_heroPad(month + 1)}`)
  const heroPrevPoint   = history.length >= 2 ? history[history.length - 2] : null
  const heroCurrPoint   = history.length >= 1 ? history[history.length - 1] : null
  const heroPrevSvc     = heroPrevPoint ? heroPrevPoint.revenue : null
  const heroCurrSvc     = heroCurrPoint ? heroCurrPoint.revenue : null
  const heroVariation   = heroPrevSvc && heroPrevSvc > 0 && heroCurrSvc !== null
    ? ((heroCurrSvc - heroPrevSvc) / heroPrevSvc) * 100
    : null
  const heroPrevLabel   = heroPrevPoint?.label ?? '—'

  let heroTotal: number | null = null
  if (!isParceiroSimples) {
    if (isFixo) {
      const fixedMonthlySvc = hourlyRate > 0 ? Math.round(hourlyRate * prorationRatio * 100) / 100 : null
      heroTotal = fixedMonthlySvc
    } else if (isHBConsultant) {
      if (!hbBeforeStart && hourlyRate > 0) heroTotal = hbServiceVal
    } else if (rateType === 'monthly' && hourlyRate > 0) {
      // Mensalistas (ex: coordenadores com salário fixo) → valor fixo proporcional
      heroTotal = Math.round(hourlyRate * prorationRatio * 100) / 100
    } else {
      heroTotal = estimatedValue
    }
  }

  const TABS: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'overview',   label: 'Total Geral',  icon: LayoutDashboard },
    { id: 'timesheets', label: 'Apontamentos', icon: Clock },
    { id: 'expenses',   label: 'Despesas',     icon: Receipt },
    { id: 'indicators', label: 'Indicadores',  icon: BarChart2 },
    ...(!isFixo && !isParceiroSimples && (isHBConsultant || isHorista) ? [{ id: 'hora-banco' as TabType, label: 'Remuneração', icon: DollarSign }] : []),
  ]

  // Se activeTab não existe na lista (ex: fixo que estava em hora-banco), volta ao overview
  const validTab = TABS.some(t => t.id === activeTab) ? activeTab : 'overview'

  const pmOptions = paymentMethods.length > 0 ? paymentMethods : PAYMENT_FALLBACK

  // Clientes únicos derivados dos projetos do usuário
  // Candidatos a "Projeto Real" (investimento): TODOS os projetos abertos do cliente.
  const mapReal = (p: any) => ({ id: p.id, name: p.name, service_type_code: p.service_type?.code ?? null, is_investimento_comercial: !!p.is_investimento_comercial, categoria_interna: p.categoria_interna ?? null })
  useEffect(() => {
    if (!tsForm.customer_id) { setTsRealProjects([]); return }
    let c = false
    api.get<{ items: any[] }>(`/projects?pageSize=200&customer_id=${tsForm.customer_id}&status=open&include_investimento_comercial=true`)
      .then(r => { if (!c) setTsRealProjects(Array.isArray(r?.items) ? r.items.map(mapReal) : []) }).catch(() => {})
    return () => { c = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tsForm.customer_id])
  useEffect(() => {
    if (!expForm.customer_id) { setExpRealProjects([]); return }
    let c = false
    api.get<{ items: any[] }>(`/projects?pageSize=200&customer_id=${expForm.customer_id}&status=open&include_investimento_comercial=true`)
      .then(r => { if (!c) setExpRealProjects(Array.isArray(r?.items) ? r.items.map(mapReal) : []) }).catch(() => {})
    return () => { c = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expForm.customer_id])

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
  // Admin/coord apontando por OUTRO usuário → carrega os projetos DELE (escopo do consultor).
  const tsActingAsOther = canActAsUser && !!tsForm.user_id && tsForm.user_id !== String(user?.id)
  useEffect(() => {
    if (!tsActingAsOther) { setTsUserProjects([]); return }
    api.get<any>(`/projects?pageSize=200&status=open&consultant_only=true&user_id=${tsForm.user_id}`)
      .then(r => setTsUserProjects(Array.isArray(r?.items) ? r.items : []))
      .catch(() => setTsUserProjects([]))
  }, [tsActingAsOther, tsForm.user_id])

  // Projetos/clientes do form de APONTAMENTO: os do usuário selecionado (se apontando por outro) ou os meus.
  const tsFormProjects = tsActingAsOther ? tsUserProjects : projects
  const tsFormCustomers = useMemo(() => {
    const seen = new Set<number>(); const list: { id: number; name: string }[] = []
    tsFormProjects.forEach(p => { if (p.customer && !seen.has(p.customer.id)) { seen.add(p.customer.id); list.push(p.customer) } })
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [tsFormProjects])
  const tsProjectOptions = useMemo(() => {
    if (!tsForm.customer_id) return tsFormProjects
    return tsFormProjects.filter(p => p.customer && String(p.customer.id) === tsForm.customer_id)
  }, [tsFormProjects, tsForm.customer_id])

  // Atividades (deliveries) do projeto selecionado — para vincular o apontamento
  // a uma atividade do cronograma (opcional). Consultor recebe só as que apontar.
  const [tsActivities, setTsActivities] = useState<{ id: number; title: string; stage_name: string }[]>([])
  const [tsActivitiesLoading, setTsActivitiesLoading] = useState(false)

  useEffect(() => {
    const pid = tsForm.project_id
    if (!pid) { setTsActivities([]); return }
    let alive = true
    setTsActivitiesLoading(true)
    api.get<{ items: { id: number; title: string; stage_name: string }[] }>(`/projects/${pid}/deliveries`)
      .then(r => { if (alive) setTsActivities(r.items ?? []) })
      .catch(() => { if (alive) setTsActivities([]) })
      .finally(() => { if (alive) setTsActivitiesLoading(false) })
    return () => { alive = false }
  }, [tsForm.project_id])

  const tsActivityOptions = useMemo(
    () => tsActivities.map(a => ({ id: a.id, name: `${a.stage_name} — ${a.title}` })),
    [tsActivities],
  )

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <AppLayout title="Meu Painel">
     <MoneyMaskContext.Provider value={moneyHidden}>

      {user?.id && <MinhasNotasFiscaisCard userId={user.id} />}

      {/* ── Sticky sub-header (period nav + tabs) ── */}
      <div
        ref={stickyHeaderRef}
        className="sticky top-0 z-20 -mx-8 px-8 border-b"
        style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
      >
        {/* Header row */}
        <div className="flex items-center justify-between py-3 gap-3 flex-wrap">

          {/* Period selector */}
          <div
            className="flex items-center gap-1 rounded-lg border px-1.5 py-1"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <button onClick={prevMonth}
              className="p-1.5 rounded transition-colors"
              style={{ color: 'var(--text-muted)' }}>
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold min-w-[148px] text-center select-none" style={{ color: 'var(--text)' }}>
              {MONTHS[month]} {year}
            </span>
            <button onClick={nextMonth} disabled={isAtCurrentMonth}
              className="p-1.5 rounded transition-colors"
              style={{ color: isAtCurrentMonth ? 'var(--text-light)' : 'var(--text-muted)', cursor: isAtCurrentMonth ? 'not-allowed' : 'pointer' }}>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Quick add */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMoneyHidden(v => !v)}
              title={moneyHidden ? 'Mostrar valores' : 'Ocultar valores'}
              aria-label={moneyHidden ? 'Mostrar valores' : 'Ocultar valores'}
              aria-pressed={!moneyHidden}
              className="h-9 w-9 flex items-center justify-center rounded-lg border transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}>
              {moneyHidden ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <Button onClick={openCreateTs}
              className="h-9 px-4 text-xs gap-2"
              style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}>
              <Clock size={13} />
              Apontamento
            </Button>
            <Button onClick={openCreateExp} variant="outline"
              className="h-9 px-4 text-xs gap-2"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface)' }}>
              <Receipt size={13} />
              Despesa
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 border-b overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
          {TABS.map(tab => {
            const Icon = tab.icon
            const active = validTab === tab.id
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px"
                style={{
                  borderColor: active ? 'var(--primary)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text-muted)',
                  fontWeight: active ? 600 : 500,
                }}>
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-5" />

      {/* ══════════════════════════════════════════════════════════════════════
          Tab: Total Geral
      ══════════════════════════════════════════════════════════════════════ */}
      {validTab === 'overview' && (
        <div className="space-y-5">

          {/* Hero Horista — valor de serviço + despesas */}
          {isHorista && !isParceiroSimples && !isFixo && (
            <HoristaPaymentSection
              yearMonth={`${year}-${String(month + 1).padStart(2, '0')}`}
              workedHours={workedHours}
              billableHours={billableHours}
              guaranteedHours={guaranteedHours}
              hourlyRate={hourlyRate}
              recebimento={myClosing?.recebimento ?? null}
              expTotal={expTotal}
              expPaid={expPaid}
              proporcional={isProporcional}
              prorationRatio={prorationRatio}
            />
          )}

          {/* Hero Banco de Horas — usa HBPaymentSection quando dados disponíveis */}
          {isHBConsultant && !isParceiroSimples && !isFixo && (
            hbCurrent
              ? <HBPaymentSection
                  data={hbCurrent}
                  fixedSalary={rateType === 'monthly' ? hourlyRate : 0}
                  expTotal={expTotal}
                  expPaid={expPaid}
                  showExtras={['banco_de_horas', 'bh_mensal'].includes((user as any)?.consultant_type ?? '')}
                />
              : <HeroTotal
                  period={heroPeriodLabel}
                  total={heroTotal}
                  variation={heroVariation}
                  prevLabel={heroPrevLabel}
                  expTotal={expTotal}
                  expPaid={expPaid}
                />
          )}

          {/* Hero mensalista não-fixo (ex: coordenador com salário mensal) */}
          {!isHorista && !isHBConsultant && !isParceiroSimples && !isFixo && rateType === 'monthly' && (
            <FixoPaymentSection
              yearMonth={`${year}-${String(month + 1).padStart(2, '0')}`}
              fixedMonthly={Math.round(hourlyRate * prorationRatio * 100) / 100}
              expTotal={expTotal}
              expPaid={expPaid}
              proporcional={isProporcional}
              prorationRatio={prorationRatio}
            />
          )}

          {/* Hero Total — outros perfis (horista sem tipo, etc.) com despesas */}
          {!isHorista && !isHBConsultant && !isParceiroSimples && !isFixo && rateType !== 'monthly' && (
            <HeroTotal
              period={heroPeriodLabel}
              total={heroTotal}
              variation={heroVariation}
              prevLabel={heroPrevLabel}
              expTotal={expTotal}
              expPaid={expPaid}
            />
          )}

          {/* Hero Parceiro Simples — horas + despesas */}
          {isParceiroSimples && (
            <ParceiroSimplesSection
              yearMonth={`${year}-${String(month + 1).padStart(2, '0')}`}
              workedMinutes={tsTotalMin}
              expTotal={expTotal}
              expPaid={expPaid}
            />
          )}

          {/* Linha 1 — Serviços (oculto para parceiro simples que já tem hero) */}
          {!isParceiroSimples && <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 [&>*]:min-w-0">
            <SummaryCard
              label="Horas no Período"
              value={minutesToHours(tsTotalMin)}
              sub={`${(tsTotalMin / 60).toFixed(1)}h apontadas`}
              icon={Clock}
              accent="bg-[var(--primary-soft)] text-[var(--primary)]"
              onClick={() => setActiveTab('timesheets')}
            />
            {!isParceiroSimples && (isFixo ? (
              <>
                <SummaryCard
                  label="Horas Trabalhadas"
                  value={fmtHours(workedHours)}
                  sub="apontadas no período"
                  icon={Clock}
                  accent="bg-[var(--primary-soft)] text-[var(--primary)]"
                  onClick={() => setActiveTab('timesheets')}
                />
                <SummaryCard
                  label="Valor Fixo Mensal"
                  value={hourlyRate > 0 ? formatBRL(hourlyRate) : '—'}
                  sub="valor do serviço mensal"
                  icon={DollarSign}
                  accent="bg-indigo-500/15 text-indigo-400"
                  money
                />
              </>
            ) : isHBConsultant ? (
              <>
                <SummaryCard
                  label="Valor Fixo Mensal"
                  value={hourlyRate > 0 ? formatBRL(hourlyRate) : '—'}
                  sub="valor do serviço mensal"
                  icon={DollarSign}
                  accent="bg-indigo-500/15 text-indigo-400"
                  money
                />
                {['banco_de_horas', 'bh_mensal'].includes((user as any)?.consultant_type ?? '') && (
                  <SummaryCard
                    label="Total a Receber"
                    value={hbBeforeStart ? '—' : hourlyRate > 0 ? formatBRL(hbServiceVal) : '—'}
                    sub={hbBeforeStart
                      ? `Inicia em ${hbStartYM ? fmtYearMonth(hbStartYM) : '—'}`
                      : hbExtraHours > 0
                        ? `Salário base + ${hbExtraHours.toFixed(1)}h extras`
                        : 'Salário base mensal'}
                    icon={TrendingUp}
                    accent="bg-[var(--success-bg)] text-[var(--success)]"
                    money
                  />
                )}
              </>
            ) : (
              <>
                <SummaryCard
                  label={rateType === 'monthly' ? 'Valor Fixo Mensal' : 'Taxa / Hora'}
                  value={hourlyRate > 0 ? formatBRL(hourlyRate) : '—'}
                  sub={rateType === 'monthly' ? 'salário base mensal' : 'por hora trabalhada'}
                  icon={DollarSign}
                  accent="bg-indigo-500/15 text-indigo-400"
                  money
                />
                <SummaryCard
                  label="Valor Total do Serviço"
                  value={estimatedValue !== null ? formatBRL(estimatedValue) : '—'}
                  sub={estimatedValue !== null
                    ? prorationRatio === 0
                      ? 'Período anterior à contratação'
                      : guaranteedProrated !== null && workedHours < guaranteedProrated
                        ? `${formatBRL(effectiveRate)}/h × ${guaranteedProrated}h (garantido)`
                        : `${formatBRL(effectiveRate)}/h × ${workedHours.toFixed(1)}h`
                    : 'Taxa não configurada'}
                  icon={TrendingUp}
                  accent="bg-[var(--success-bg)] text-[var(--success)]"
                  money
                />
              </>
            ))}
            <SummaryCard
              label="Apontamentos Pendentes"
              value={String(notApprTs)}
              sub={`${approvedTs} aprov. · ${rejectedTs} reprov. de ${timesheets.length}`}
              icon={BarChart2}
              accent="bg-[var(--purple-bg)] text-[var(--purple)]"
              onClick={() => setActiveTab('timesheets')}
            />
          </div>}

          {/* Hero de remuneração — fixo com despesas inline */}
          {isFixo && !isParceiroSimples && (
            <FixoPaymentSection
              yearMonth={`${year}-${String(month + 1).padStart(2, '0')}`}
              fixedMonthly={Math.round(hourlyRate * prorationRatio * 100) / 100}
              expTotal={expTotal}
              expPaid={expPaid}
              proporcional={isProporcional}
              prorationRatio={prorationRatio}
            />
          )}

          {/* Recebimento do fechamento — mesmo valor que o admin vê na tela de fechamento */}
          <RecebimentoFechamentoBlock closing={myClosing} />

          {/* Recent lists */}
          <div className="grid md:grid-cols-2 gap-4">

            {/* Recent timesheets */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text)]">Apontamentos Recentes</h3>
                <button onClick={() => setActiveTab('timesheets')}
                  className="text-[11px] text-[var(--primary)] hover:text-[var(--primary)] transition-colors">
                  Ver todos →
                </button>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {tsLoading
                  ? [...Array(4)].map((_, i) => (
                      <div key={i} className="px-5 py-3.5 flex items-center gap-3">
                        <Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-16" />
                      </div>
                    ))
                  : timesheets.length === 0
                    ? <div className="px-5 py-8 text-center text-sm text-[var(--text-muted)]">Nenhum apontamento no período</div>
                    : timesheets.slice(0, 6).map(ts => (
                        <div key={ts.id} className="px-5 py-3.5 flex items-center justify-between gap-3" style={ts.consultant_pending_release ? { background: 'var(--danger-bg)', boxShadow: 'inset 3px 0 0 var(--danger)' } : undefined}>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-[var(--text)] truncate">
                              {ts.project?.name ?? '—'}
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{fmt(ts.date)}</div>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="text-xs font-mono font-semibold text-[var(--text)]">
                              {ts.effort_hours}
                            </span>
                            <StatusBadge status={ts.status} display={ts.status_display} reason={ts.rejection_reason} pendingRelease={ts.consultant_pending_release} />
                          </div>
                        </div>
                      ))
                }
              </div>
            </div>

            {/* Recent expenses */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text)]">Despesas Recentes</h3>
                <button onClick={() => setActiveTab('expenses')}
                  className="text-[11px] text-[var(--primary)] hover:text-[var(--primary)] transition-colors">
                  Ver todas →
                </button>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {expLoading
                  ? [...Array(4)].map((_, i) => (
                      <div key={i} className="px-5 py-3.5 flex items-center gap-3">
                        <Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-16" />
                      </div>
                    ))
                  : expenses.length === 0
                    ? <div className="px-5 py-8 text-center text-sm text-[var(--text-muted)]">Nenhuma despesa no período</div>
                    : expenses.slice(0, 6).map(exp => (
                        <div key={exp.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-[var(--text)] truncate">{exp.description}</div>
                            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                              {fmt(exp.expense_date)} · {exp.project?.name}
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="text-xs font-semibold text-[var(--text)]"><Money>{exp.formatted_amount}</Money></span>
                            <StatusBadge status={exp.status} display={exp.status_display} reason={exp.rejection_reason} />
                            {exp.status === 'approved' && (exp.is_paid
                              ? <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--success-bg)] text-[var(--success)]">Pago</span>
                              : <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--warning-bg)] text-[var(--warning)]">Em aberto</span>
                            )}
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
      {validTab === 'timesheets' && (
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
              className="flex-1 min-w-40 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
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
                className="flex items-center gap-1 h-9 px-3 text-xs text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] rounded-lg hover:border-[var(--border-strong)] transition-colors shrink-0">
                <X size={11} /> Limpar
              </button>
            )}
            {timesheets.length > 0 && (
              <button onClick={exportTs}
                className="flex items-center gap-1 h-9 px-3 text-xs text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] rounded-lg hover:border-[var(--border-strong)] transition-colors shrink-0">
                <FileSpreadsheet size={13} /> Excel
              </button>
            )}
            <Button onClick={openCreateTs}
              className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-fg)] h-9 px-4 text-xs gap-1.5 shrink-0">
              <Plus size={13} /> Novo
            </Button>
          </div>

          {/* Total bar */}
          {!tsLoading && tsTotalMin > 0 && (
            <div className="flex items-center gap-4 mb-3 text-xs text-[var(--text-light)] flex-wrap">
              {tsPctExtraMin > 0 ? (
                <span className="flex items-center gap-1.5">
                  <span>Apontadas: <span className="text-[var(--text)] font-semibold">{minutesToHours(tsTotalMin)}</span></span>
                  <span className="text-[var(--text-muted)]">+</span>
                  <span>% extra: <span className="text-[var(--success)] font-semibold">+{minutesToHours(tsPctExtraMin)}</span></span>
                  <span className="text-[var(--text-muted)]">=</span>
                  <span>Total efetivo: <span className="text-[var(--text)] font-bold">{minutesToHours(tsTotalMin + tsPctExtraMin)}</span></span>
                </span>
              ) : (
                <span>Total: <span className="text-[var(--text)] font-semibold">{minutesToHours(tsTotalMin)}</span></span>
              )}
              <span>Aprovados: <span className="text-[var(--success)] font-medium">{approvedTs}</span></span>
              <span>Pendentes: <span className="text-[var(--warning)] font-medium">{notApprTs}</span></span>
              {lateTs > 0 && <span title="Apontamentos em atraso não liberados pelo coordenador — não contam no seu fechamento.">Em atraso: <span className="font-medium" style={{ color: 'var(--danger)' }}>{lateTs}</span></span>}
            </div>
          )}

          {/* Table */}
          <div className="rounded-xl border border-[var(--border)] overflow-x-auto overflow-y-clip">
            <table className="w-full min-w-max text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium">Data</th>
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium hidden md:table-cell">Cliente</th>
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium">Projeto</th>
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium hidden lg:table-cell">Ticket #</th>
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium hidden xl:table-cell">Título</th>
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium hidden md:table-cell">Horário</th>
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium">Horas</th>
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium hidden xl:table-cell">Tipo de Serviço</th>
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium hidden lg:table-cell">Observação</th>
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium">Status</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {tsLoading ? (
                  <TableSkeleton cols={11} />
                ) : timesheets.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-14 text-center text-[var(--text-muted)]">
                      Nenhum apontamento no período
                    </td>
                  </tr>
                ) : timesheets.map(ts => {
                  const locked = isLocked(ts.status)
                  const clientName = ts.customer?.name ?? ts.project?.customer?.name
                  return (
                    <tr key={ts.id}
                      {...hover.bind(ts)}
                      className={`border-b border-[var(--border)] transition-colors last:border-0 ${
                        ts.consultant_pending_release ? '' : (locked ? 'bg-[var(--surface-hover)]' : 'hover:bg-[var(--surface-hover)]')
                      }`}
                      style={ts.consultant_pending_release ? { background: 'var(--danger-bg)', boxShadow: 'inset 3px 0 0 var(--danger)' } : undefined}>
                      <td className="px-4 py-3.5 text-[var(--text)] font-medium tabular-nums whitespace-nowrap">{fmt(ts.date)}</td>
                      <td className="px-4 py-3.5 text-[var(--text-muted)] hidden md:table-cell max-w-[120px] truncate">
                        {clientName ?? <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-[var(--text)] max-w-[140px] truncate">
                        {ts.project?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3.5 text-[var(--text-muted)] font-mono hidden lg:table-cell">
                        {ts.ticket
                          ? <a href={`https://erpserv.movidesk.com/Ticket/Edit/${ts.ticket}`} target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] hover:text-[var(--primary)]">#{ts.ticket}</a>
                          : <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-[var(--text-muted)] hidden xl:table-cell max-w-[160px] truncate" title={ts.ticket_subject}>
                        {ts.ticket_subject ?? <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-[var(--text-light)] font-mono hidden md:table-cell whitespace-nowrap">
                        {ts.start_time} – {ts.end_time}
                      </td>
                      <td className="px-4 py-3.5 text-[var(--text)] font-mono font-bold whitespace-nowrap">
                        {ts.consultant_extra_pct ? (() => {
                          const extraMin  = Math.round(ts.effort_minutes * (ts.consultant_extra_pct / 100))
                          const totalMin  = ts.effort_minutes + extraMin
                          return (
                            <span className="flex flex-col gap-0.5">
                              <span className="flex items-center gap-1">
                                <span className="text-[var(--text-muted)] font-normal">{ts.effort_hours}</span>
                                <span className="text-[10px] text-[var(--success)] font-semibold">+{ts.consultant_extra_pct}%</span>
                                <span className="text-[10px] text-[var(--success)]">+{minutesToHours(extraMin)}</span>
                              </span>
                              <span className="text-[var(--success)] text-[11px]">= {minutesToHours(totalMin)}</span>
                            </span>
                          )
                        })() : (
                          <span className="flex items-center gap-1.5">
                            {ts.effort_hours}
                            {ts.attachment_url && <Paperclip size={10} className="text-[var(--text-light)] shrink-0" aria-label="Tem anexo" />}
                          </span>
                        )}
                        {ts.consultant_extra_pct && ts.attachment_url && <Paperclip size={10} className="text-[var(--text-light)] shrink-0 mt-0.5" aria-label="Tem anexo" />}
                      </td>
                      <td className="px-4 py-3.5 text-[var(--text-light)] hidden xl:table-cell max-w-[120px] truncate">
                        {(ts as any).project?.service_type?.name ?? <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-[var(--text-light)] hidden lg:table-cell max-w-[180px] truncate"
                        title={previewText(ts.observation)}>
                        {ts.observation ? previewText(ts.observation) : <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={ts.status} display={ts.status_display} reason={ts.rejection_reason} />
                      </td>
                      <td className="px-4 py-3.5 w-10">
                        <RowMenu items={[
                          { label: 'Visualizar', icon: <Eye size={12} />, onClick: () => setTsViewItem(ts) },
                          ...(ts.status === 'conflicted' && ts.origin !== 'webhook' ? [
                            { label: 'Ver conflito', icon: <AlertTriangle size={12} />, onClick: () => setTsConflictItem(ts) },
                            { label: 'Editar', icon: <Pencil size={12} />, onClick: () => openEditTs(ts) },
                            { label: 'Excluir', icon: <Trash2 size={12} />, onClick: () => deleteTs(ts.id), danger: true },
                          ] : !locked ? [
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
                className="p-1.5 text-[var(--text-light)] hover:text-[var(--text)] disabled:opacity-30 rounded transition-colors">
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-[var(--text-light)]">Página {tsPage}</span>
              <button onClick={() => setTsPage(p => p + 1)} disabled={!tsHasNext}
                className="p-1.5 text-[var(--text-light)] hover:text-[var(--text)] disabled:opacity-30 rounded transition-colors">
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Tab: Despesas
      ══════════════════════════════════════════════════════════════════════ */}
      {validTab === 'expenses' && (
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
              className="flex-1 min-w-40 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
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
                className="flex items-center gap-1 h-9 px-3 text-xs text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] rounded-lg hover:border-[var(--border-strong)] transition-colors shrink-0">
                <X size={11} /> Limpar
              </button>
            )}
            <Button onClick={openCreateExp}
              className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-fg)] h-9 px-4 text-xs gap-1.5 shrink-0">
              <Plus size={13} /> Nova
            </Button>
          </div>

          {/* Total */}
          {!expLoading && expTotal > 0 && (
            <div className="text-xs text-[var(--text-light)] mb-3">
              Total: <span className="text-[var(--text)] font-semibold">{formatBRL(expTotal)}</span>
              <span className="ml-4">
                Aprovadas: <span className="text-[var(--success)] font-medium">
                  {expenses.filter(e => e.status === 'approved').length}
                </span>
              </span>
            </div>
          )}

          {/* Table */}
          <div className="rounded-xl border border-[var(--border)] overflow-x-auto overflow-y-clip">
            <table className="w-full min-w-max text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium">Data</th>
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium hidden md:table-cell">Cliente</th>
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium">Descrição</th>
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium hidden md:table-cell">Projeto</th>
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium hidden lg:table-cell">Categoria</th>
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium hidden xl:table-cell">Tipo de Serviço</th>
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium">Valor</th>
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-[var(--text-light)] font-medium">Pagamento</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {expLoading ? (
                  <TableSkeleton cols={9} />
                ) : expenses.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-14 text-center text-[var(--text-muted)]">
                      Nenhuma despesa no período
                    </td>
                  </tr>
                ) : expenses.map(exp => {
                  const locked = isLocked(exp.status)
                  return (
                    <tr key={exp.id}
                      className={`border-b border-[var(--border)] transition-colors last:border-0 ${
                        locked ? 'bg-[var(--surface-hover)]' : 'hover:bg-[var(--surface-hover)]'
                      }`}>
                      <td className="px-4 py-3.5 text-[var(--text)] font-medium tabular-nums whitespace-nowrap">{fmt(exp.expense_date)}</td>
                      <td className="px-4 py-3.5 text-[var(--text-muted)] hidden md:table-cell max-w-[120px] truncate">
                        {exp.project?.customer?.name ?? <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-[var(--text)] max-w-[160px] truncate" title={exp.description}>{exp.description}</td>
                      <td className="px-4 py-3.5 text-[var(--text-muted)] hidden md:table-cell max-w-[260px] truncate">{exp.project?.name ?? '—'}</td>
                      <td className="px-4 py-3.5 text-[var(--text-muted)] hidden lg:table-cell">{exp.category?.name ?? '—'}</td>
                      <td className="px-4 py-3.5 text-[var(--text-light)] hidden xl:table-cell max-w-[120px] truncate">{(exp as any).project?.service_type?.name ?? '—'}</td>
                      <td className="px-4 py-3.5 text-[var(--text)] font-bold whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          {exp.formatted_amount}
                          {exp.receipt_url && <Paperclip size={10} className="text-[var(--text-light)] shrink-0" aria-label="Tem comprovante" />}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={exp.status} display={exp.status_display} reason={exp.rejection_reason} />
                      </td>
                      <td className="px-4 py-3.5">
                        {exp.is_paid
                          ? <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--success-bg)] text-[var(--success)]">Pago</span>
                          : exp.status === 'approved' && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--warning-bg)] text-[var(--warning)]">Em aberto</span>
                        }
                      </td>
                      <td className="px-4 py-3.5 w-10">
                        <RowMenu items={[
                          { label: 'Visualizar', icon: <Eye size={12} />, onClick: () => setExpViewItem(exp) },
                          ...(!locked ? [
                            { label: 'Editar', icon: <Pencil size={12} />, onClick: () => openEditExp(exp) },
                            { label: 'Excluir', icon: <Trash2 size={12} />, onClick: () => deleteExp(exp.id), danger: true },
                          ] : []),
                          ...(exp.receipt_url ? [
                            { label: 'Ver Comprovante', icon: <Paperclip size={12} />, onClick: () => openReceiptUrl(exp.receipt_url!) },
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
                className="p-1.5 text-[var(--text-light)] hover:text-[var(--text)] disabled:opacity-30 rounded transition-colors">
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-[var(--text-light)]">Página {expPage}</span>
              <button onClick={() => setExpPage(p => p + 1)} disabled={!expHasNext}
                className="p-1.5 text-[var(--text-light)] hover:text-[var(--text)] disabled:opacity-30 rounded transition-colors">
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Tab: Indicadores
      ══════════════════════════════════════════════════════════════════════ */}
      {validTab === 'indicators' && (
        <div className="space-y-5">

          {/* ── Alertas ──────────────────────────────────────────────────────── */}
          {indAlerts.length > 0 && (
            <div className="space-y-2">
              {indAlerts.map((a, i) => (
                <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl text-xs border ${
                  a.level === 'danger'
                    ? 'bg-[var(--danger-bg)] border-red-500/20 text-[var(--danger)]'
                    : 'bg-[var(--warning-bg)] border-yellow-500/20 text-[var(--warning)]'
                }`}>
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  {a.msg}
                </div>
              ))}
            </div>
          )}

          {/* ── Hero KPIs ────────────────────────────────────────────────────── */}
          <div className={`grid gap-3 ${isParceiroSimples ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'}`}>

            {/* Valor Gerado */}
            {!isParceiroSimples && (
            <div className="rounded-xl border border-[var(--primary)]/20 bg-gradient-to-br from-[var(--primary-soft)] to-[var(--primary-soft)] p-5 col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-[var(--primary-soft)]">
                  <DollarSign size={13} className="text-[var(--primary)]" />
                </div>
                <span className="text-[11px] text-[var(--text-muted)] font-medium">Valor Gerado</span>
              </div>
              <div className="text-2xl font-bold text-[var(--text)]">
                {estimatedValue !== null ? formatBRL(estimatedValue) : '—'}
              </div>
              <div className="text-[11px] text-[var(--text-light)] mt-1.5">
                {estimatedValue !== null
                  ? prorationRatio === 0
                    ? 'Período anterior à contratação'
                    : guaranteedProrated !== null && workedHours < guaranteedProrated
                      ? `${formatBRL(effectiveRate)}/h × ${guaranteedProrated}h garantidas`
                      : `${formatBRL(effectiveRate)}/h × ${workedHours.toFixed(1)}h`
                  : 'Taxa não configurada no perfil'}
              </div>
            </div>
            )}

            {/* Ticket Médio */}
            {!isParceiroSimples && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-[var(--purple-bg)]">
                  <Zap size={13} className="text-[var(--purple)]" />
                </div>
                <span className="text-[11px] text-[var(--text-muted)] font-medium">Ticket Médio</span>
              </div>
              <div className="text-2xl font-bold text-[var(--text)]">
                {avgTicket !== null ? formatBRL(avgTicket) : '—'}
              </div>
              <div className="text-[11px] text-[var(--text-light)] mt-1.5">por hora trabalhada</div>
            </div>
            )}

            {/* Ocupação */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-[var(--warning-bg)]">
                  <Target size={13} className="text-[var(--warning)]" />
                </div>
                <span className="text-[11px] text-[var(--text-muted)] font-medium">Ocupação</span>
              </div>
              <div className={`text-2xl font-bold ${occupancyPct >= 80 ? 'text-[var(--success)]' : occupancyPct >= 60 ? 'text-[var(--warning)]' : 'text-[var(--danger)]'}`}>
                {occupancyPct}%
              </div>
              <div className="text-[11px] text-[var(--text-light)] mt-1.5">
                {daysWorked} de {workingDaysInMonth} dias úteis
              </div>
            </div>

            {/* Total de Horas */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-[var(--primary-soft)]">
                  <Activity size={13} className="text-[var(--primary)]" />
                </div>
                <span className="text-[11px] text-[var(--text-muted)] font-medium">Horas Totais</span>
              </div>
              <div className="text-2xl font-bold text-[var(--text)]">{minutesToHours(tsTotalMin)}</div>
              <div className="text-[11px] text-[var(--text-light)] mt-1.5">{tsByProject.length} projeto{tsByProject.length !== 1 ? 's' : ''}</div>
            </div>
          </div>

          {/* ── Ritmo & Progresso ────────────────────────────────────────────── */}
          {(() => {
            const avgHPerDay    = daysWorked > 0 ? workedHours / daysWorked : 0
            const remainingWD   = isCurrentMonth ? Math.max(0, workingDaysInMonth - elapsedWD) : 0
            const targetMin     = guaranteedHours !== null ? Number(guaranteedHours) * 60 : null
            const targetPct     = targetMin !== null && targetMin > 0
              ? Math.min(100, Math.round((tsTotalMin / targetMin) * 100))
              : null
            const remainingToTarget = targetMin !== null ? Math.max(0, targetMin - tsTotalMin) : null
            return (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-xs font-semibold text-[var(--text)] uppercase tracking-wider">Ritmo & Progresso</h3>
                  {!isCurrentMonth && (
                    <span className="text-[10px] text-[var(--text-muted)] bg-[var(--surface-hover)] px-2 py-0.5 rounded-full">Mês encerrado</span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-5">
                  <div>
                    <div className="text-[11px] text-[var(--text-light)] mb-1">Dias úteis decorridos</div>
                    <div className="text-lg font-bold text-[var(--text)]">{elapsedWD} <span className="text-xs font-normal text-[var(--text-light)]">de {workingDaysInMonth}</span></div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[var(--text-light)] mb-1">Dias com apontamento</div>
                    <div className="text-lg font-bold text-[var(--text)]">{daysWorked} <span className="text-xs font-normal text-[var(--text-light)]">dias</span></div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[var(--text-light)] mb-1">Média por dia</div>
                    <div className="text-lg font-bold text-[var(--text)] font-mono">{avgHPerDay.toFixed(1)}<span className="text-xs font-normal text-[var(--text-light)]">h/dia</span></div>
                  </div>
                  {isCurrentMonth && remainingWD > 0 ? (
                    <div>
                      <div className="text-[11px] text-[var(--text-light)] mb-1">Dias úteis restantes</div>
                      <div className="text-lg font-bold text-[var(--warning)]">{remainingWD} <span className="text-xs font-normal text-[var(--text-light)]">dias</span></div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-[11px] text-[var(--text-light)] mb-1">Total apontado</div>
                      <div className="text-lg font-bold text-[var(--text)] font-mono">{minutesToHours(tsTotalMin)}</div>
                    </div>
                  )}
                </div>

                {/* Barra de progresso do mês */}
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--text-light)]">
                  <span>Progresso do mês</span>
                  <span>{projectedPct}% dos dias úteis</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--surface-hover)] overflow-hidden mb-4">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all duration-500"
                    style={{ width: `${projectedPct}%` }} />
                </div>

                {/* Meta de horas (se configurada) */}
                {targetMin !== null && targetPct !== null ? (
                  <>
                    <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--text-light)]">
                      <span>Meta de horas ({minutesToHours(targetMin)})</span>
                      <span className={targetPct >= 100 ? 'text-[var(--success)] font-semibold' : 'text-[var(--text-muted)]'}>
                        {targetPct}% concluído
                        {remainingToTarget !== null && remainingToTarget > 0 && ` · faltam ${minutesToHours(remainingToTarget)}`}
                        {targetPct >= 100 && ' ✓ atingida'}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--surface-hover)] overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${targetPct >= 100 ? 'bg-gradient-to-r from-green-500 to-green-400' : 'bg-gradient-to-r from-cyan-500 to-cyan-400'}`}
                        style={{ width: `${targetPct}%` }} />
                    </div>
                    {estimatedValue !== null && !isParceiroSimples && (
                      <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center justify-between">
                        <span className="text-[11px] text-[var(--text-light)]">Valor pelo mês completo</span>
                        <span className="text-sm font-bold text-[var(--primary)]">{formatBRL(billableHours * effectiveRate)}</span>
                      </div>
                    )}
                  </>
                ) : estimatedValue !== null && !isParceiroSimples && isCurrentMonth && remainingWD > 0 ? (
                  <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between">
                    <span className="text-[11px] text-[var(--text-light)]">
                      Se mantiver o ritmo de {avgHPerDay.toFixed(1)}h/dia nos {remainingWD} dias restantes
                    </span>
                    <span className="text-sm font-bold text-[var(--primary)]">
                      {formatBRL((workedHours + avgHPerDay * remainingWD) * effectiveRate)}
                    </span>
                  </div>
                ) : null}
              </div>
            )
          })()}

          {/* ── Distribuição por Cliente ──────────────────────────────────────── */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex items-center gap-2 mb-5">
              <Users size={13} className="text-[var(--text-muted)]" />
              <h3 className="text-xs font-semibold text-[var(--text)] uppercase tracking-wider">Distribuição por Cliente</h3>
            </div>
            {tsByCustomer.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--text-muted)]">Nenhum dado no período</div>
            ) : (
              <div className="space-y-3">
                {tsByCustomer.map((c, i) => {
                  const pct = tsTotalMin > 0 ? (c.minutes / tsTotalMin) * 100 : 0
                  const colors = ['var(--primary)', '#a78bfa', '#fb923c', '#34d399', '#f472b6', '#60a5fa']
                  const color  = colors[i % colors.length]
                  return (
                    <div key={c.name}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-[var(--text)] truncate max-w-[60%]">{c.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[var(--text-light)]">{pct.toFixed(1)}%</span>
                          <span className="text-xs font-mono font-semibold text-[var(--text)] w-14 text-right">{minutesToHours(c.minutes)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--surface-hover)] overflow-hidden">
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
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h3 className="text-xs font-semibold text-[var(--text)] mb-5 uppercase tracking-wider">Horas por Projeto</h3>
              {tsByProject.length === 0 ? (
                <div className="py-8 text-center text-sm text-[var(--text-muted)]">Nenhum dado no período</div>
              ) : (
                <div className="space-y-3.5">
                  {tsByProject.map(p => (
                    <BarChartRow key={p.name} label={p.name} minutes={p.minutes} maxMinutes={maxProjectMin} color="var(--primary)" />
                  ))}
                </div>
              )}
            </div>

            {/* Tabela Detalhamento */}
            {tsByProject.length > 0 ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-x-auto">
                <div className="px-5 py-4 border-b border-[var(--border)]">
                  <h3 className="text-xs font-semibold text-[var(--text)] uppercase tracking-wider">Detalhamento</h3>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left px-5 py-3 text-[var(--text-light)] font-medium">Projeto</th>
                      <th className="text-right px-5 py-3 text-[var(--text-light)] font-medium">Horas</th>
                      <th className="text-right px-5 py-3 text-[var(--text-light)] font-medium">%</th>
                      {estimatedValue !== null && !isParceiroSimples && (
                        <th className="text-right px-5 py-3 text-[var(--text-light)] font-medium">Valor</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {tsByProject.map(p => (
                      <tr key={p.name} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)]">
                        <td className="px-5 py-3 text-[var(--text)] max-w-[120px] truncate">{p.name}</td>
                        <td className="px-5 py-3 text-right text-[var(--text)] font-mono font-semibold">{minutesToHours(p.minutes)}</td>
                        <td className="px-5 py-3 text-right text-[var(--text-light)]">
                          {tsTotalMin > 0 ? ((p.minutes / tsTotalMin) * 100).toFixed(1) + '%' : '—'}
                        </td>
                        {estimatedValue !== null && !isParceiroSimples && (
                          <td className="px-5 py-3 text-right text-[var(--primary)] font-medium">
                            {formatBRL((p.minutes / 60) * hourlyRate)}
                          </td>
                        )}
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="bg-[var(--surface-hover)] border-t border-[var(--border)]">
                      <td className="px-5 py-3 text-[var(--text)] font-semibold">Total</td>
                      <td className="px-5 py-3 text-right text-[var(--text)] font-mono font-bold">{minutesToHours(tsTotalMin)}</td>
                      <td className="px-5 py-3 text-right text-[var(--text-muted)]">100%</td>
                      {estimatedValue !== null && !isParceiroSimples && (
                        <td className="px-5 py-3 text-right text-[var(--primary)] font-bold">{formatBRL(estimatedValue)}</td>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] flex items-center justify-center py-16">
                <p className="text-sm text-[var(--text-muted)]">Nenhum projeto no período</p>
              </div>
            )}
          </div>

          {/* ── Histórico: últimos 12 meses ───────────────────────────────────── */}
          {(() => {
            const hasRate     = effectiveRate > 0 && !isParceiroSimples
            const hasExpHist  = history.some(p => p.expenses > 0)
            const hasMonetary = hasRate || hasExpHist

            const nonEmpty = (arr: typeof history) => arr.filter(p => p.hours > 0)
            const avgHours    = nonEmpty(history).length > 0
              ? nonEmpty(history).reduce((a, p) => a + p.hours, 0) / nonEmpty(history).length : 0
            const avgRevenue  = nonEmpty(history).length > 0 && hasRate
              ? nonEmpty(history).reduce((a, p) => a + p.revenue, 0) / nonEmpty(history).length : 0
            const avgExpenses = history.filter(p => p.expenses > 0).length > 0
              ? history.filter(p => p.expenses > 0).reduce((a, p) => a + p.expenses, 0) / history.filter(p => p.expenses > 0).length : 0

            // Tendência horas: últimos 3 vs 3 anteriores
            const last3h  = history.slice(-3).reduce((a, p) => a + p.hours, 0) / 3
            const prev3h  = history.slice(-6, -3).reduce((a, p) => a + p.hours, 0) / 3
            const trendH  = prev3h > 0 ? ((last3h - prev3h) / prev3h) * 100 : 0
            const maxHours = Math.max(...history.map(p => p.hours), 1)

            // Tooltip customizado
            const CustomTooltip = ({ active, payload, label }: any) => {
              if (!active || !payload?.length) return null
              const hoursEntry   = payload.find((p: any) => p.dataKey === 'hours')
              const expEntry     = payload.find((p: any) => p.dataKey === 'expenses')
              const revEntry     = payload.find((p: any) => p.dataKey === 'revenue')
              // variação vs mês anterior
              const idx = history.findIndex(p => p.label === label)
              const prev = idx > 0 ? history[idx - 1].hours : null
              const varH = prev !== null && prev > 0 ? ((history[idx].hours - prev) / prev) * 100 : null
              return (
                <div style={{
                  background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12, padding: '12px 16px', minWidth: 160,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>{label}</p>
                  {hoursEntry && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-light)' }}>Horas</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace' }}>
                        {Number(hoursEntry.value).toFixed(1)}h
                        {varH !== null && (
                          <span style={{ marginLeft: 6, fontSize: 10, color: varH >= 0 ? '#4ade80' : '#f87171' }}>
                            {varH >= 0 ? '+' : ''}{varH.toFixed(0)}%
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {expEntry && Number(expEntry.value) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-light)' }}>Despesas</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning-border)' }}>{formatBRL(Number(expEntry.value))}</span>
                    </div>
                  )}
                  {revEntry && Number(revEntry.value) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-light)' }}>Receita</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#a78bfa' }}>{formatBRL(Number(revEntry.value))}</span>
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">

                {/* ── Header ── */}
                <div className="flex flex-wrap items-start justify-between gap-6 mb-6">
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--text)] uppercase tracking-wider">Evolução — Últimos 12 Meses</h3>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Horas aprovadas{hasExpHist ? ' · despesas' : ''}{hasRate ? ' · receita' : ''}</p>
                  </div>

                  {/* Stats pills */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-[var(--text-light)]">Horas médias</span>
                      <span className="text-sm font-bold text-[var(--text)] font-mono">{avgHours.toFixed(1)}h</span>
                    </div>
                    {hasRate && avgRevenue > 0 && (
                      <div className="flex flex-col items-end pl-3 border-l border-[var(--border)]">
                        <span className="text-[10px] text-[var(--text-light)]">Receita média</span>
                        <span className="text-sm font-bold text-[var(--purple)]">{formatBRL(avgRevenue)}</span>
                      </div>
                    )}
                    {hasExpHist && avgExpenses > 0 && (
                      <div className="flex flex-col items-end pl-3 border-l border-[var(--border)]">
                        <span className="text-[10px] text-[var(--text-light)]">Despesas médias</span>
                        <span className="text-sm font-bold text-[var(--warning)]">{formatBRL(avgExpenses)}</span>
                      </div>
                    )}
                    <div className={`flex items-center gap-1.5 pl-3 border-l border-[var(--border)] text-sm font-bold ${trendH > 2 ? 'text-[var(--success)]' : trendH < -2 ? 'text-[var(--danger)]' : 'text-[var(--text-light)]'}`}>
                      {trendH > 2 ? <TrendingUp size={14} /> : trendH < -2 ? <TrendingDown size={14} /> : <Minus size={14} />}
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-[var(--text-light)] font-normal">Tendência 3m</span>
                        <span>{trendH > 0 ? '+' : ''}{trendH.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {historyLoading ? (
                  <div className="h-56 flex items-center justify-center">
                    <div className="text-xs text-[var(--text-muted)] animate-pulse">Carregando histórico…</div>
                  </div>
                ) : history.every(p => p.hours === 0 && p.expenses === 0) ? (
                  <div className="h-56 flex items-center justify-center">
                    <p className="text-sm text-[var(--text-muted)]">Nenhum dado aprovado nos últimos 12 meses</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={230}>
                    <ComposedChart data={history} margin={{ top: 8, right: hasMonetary ? 48 : 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />

                      <XAxis
                        dataKey="label"
                        tick={{ fill: '#52525B', fontSize: 11 }}
                        axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                        tickLine={false}
                      />

                      {/* Eixo esquerdo: horas */}
                      <YAxis
                        yAxisId="hours"
                        orientation="left"
                        tick={{ fill: '#52525B', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={v => v === 0 ? '0h' : `${v}h`}
                        domain={[0, Math.ceil(maxHours * 1.2)]}
                        width={40}
                      />

                      {/* Eixo direito: R$ */}
                      {hasMonetary && (
                        <YAxis
                          yAxisId="money"
                          orientation="right"
                          tick={{ fill: '#52525B', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={v => v === 0 ? 'R$0' : `R$${(v / 1000).toFixed(v < 1000 ? 1 : 0)}k`}
                          width={52}
                        />
                      )}

                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--surface-hover)', radius: 4 } as any} />

                      {/* Linha de referência: média de horas */}
                      {avgHours > 0 && (
                        <ReferenceLine
                          yAxisId="hours" y={avgHours}
                          stroke="var(--primary-soft)"
                          strokeDasharray="5 4"
                          label={{ value: `~${avgHours.toFixed(0)}h`, position: 'insideTopLeft', fill: 'var(--primary-soft)', fontSize: 10 }}
                        />
                      )}

                      {/* Barras de horas — Cell para cor individual */}
                      <Bar yAxisId="hours" dataKey="hours" name="Horas" radius={[5, 5, 0, 0]} maxBarSize={36} isAnimationActive>
                        {history.map((p) => (
                          <Cell
                            key={p.ym}
                            fill={p.isCurrent ? 'var(--primary)' : 'var(--primary-soft)'}
                          />
                        ))}
                      </Bar>

                      {/* Linha de despesas */}
                      {hasExpHist && (
                        <Line
                          yAxisId="money"
                          dataKey="expenses"
                          name="Despesas"
                          type="monotone"
                          stroke="var(--warning-border)"
                          strokeWidth={2}
                          dot={(props: any) => {
                            const { cx, cy, payload } = props
                            if (!payload.expenses) return <g key={`exp-${cx}`} />
                            return payload.isCurrent
                              ? <circle key={`exp-${cx}`} cx={cx} cy={cy} r={4} fill="var(--warning-border)" stroke="var(--surface)" strokeWidth={2} />
                              : <circle key={`exp-${cx}`} cx={cx} cy={cy} r={2.5} fill="var(--warning-border)" stroke="transparent" />
                          }}
                          activeDot={{ r: 5, fill: 'var(--warning-border)', stroke: 'var(--surface)', strokeWidth: 2 }}
                        />
                      )}

                      {/* Linha de receita */}
                      {hasRate && (
                        <Line
                          yAxisId="money"
                          dataKey="revenue"
                          name="Receita"
                          type="monotone"
                          stroke="#a78bfa"
                          strokeWidth={2}
                          dot={(props: any) => {
                            const { cx, cy, payload } = props
                            if (!payload.revenue) return <g key={`rev-${cx}`} />
                            return payload.isCurrent
                              ? <circle key={`rev-${cx}`} cx={cx} cy={cy} r={4} fill="#a78bfa" stroke="var(--surface)" strokeWidth={2} />
                              : <circle key={`rev-${cx}`} cx={cx} cy={cy} r={2.5} fill="#a78bfa" stroke="transparent" />
                          }}
                          activeDot={{ r: 5, fill: '#a78bfa', stroke: 'var(--surface)', strokeWidth: 2 }}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}

                {/* ── Legenda ── */}
                <div className="flex items-center gap-5 mt-5 justify-center flex-wrap">
                  <div className="flex items-center gap-2 text-[11px] text-[var(--text-light)]">
                    <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--primary-soft)' }} />
                    Horas
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] font-medium">
                    <div className="w-3 h-3 rounded-sm bg-[var(--primary)]" />
                    Horas (mês atual)
                  </div>
                  {hasExpHist && (
                    <div className="flex items-center gap-2 text-[11px] text-[var(--text-light)]">
                      <div className="w-5 h-0.5 bg-amber-400" />
                      Despesas aprovadas
                    </div>
                  )}
                  {hasRate && (
                    <div className="flex items-center gap-2 text-[11px] text-[var(--text-light)]">
                      <div className="w-5 h-0.5 bg-violet-400" />
                      Receita estimada
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Tab: Banco de Horas
      ══════════════════════════════════════════════════════════════════════ */}
      {validTab === 'hora-banco' && !isFixo && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
                {isHorista ? 'Horas & Remuneração' : isFixo ? 'Remuneração Fixo' : 'Banco de Horas'}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-light)' }}>
                {isHorista || isFixo
                  ? `Horas trabalhadas e remuneração — ${MONTHS[month]} ${year}`
                  : `Horas previstas, trabalhadas e saldo acumulado — ${MONTHS[month]} ${year}`}
              </p>
            </div>
            {!isHorista && !isFixo && (
              <button onClick={() => setHbKey(k => k + 1)} className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-light)' }}>
                <RefreshCw size={14} />
              </button>
            )}
          </div>

          {/* Recebimento do fechamento — mesmo valor que o admin vê na tela de fechamento */}
          <RecebimentoFechamentoBlock closing={myClosing} />

          {isFixo ? (
            /* ── Fixo: valor mensal fixo + horas trabalhadas (sem extras) ── */
            timesheets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 rounded-2xl" style={{ border: '1px dashed var(--border)' }}>
                <Clock size={28} style={{ color: 'var(--text-light)' }} />
                <p className="mt-3 text-sm font-medium" style={{ color: 'var(--text)' }}>
                  Nenhum apontamento no período
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-light)' }}>
                  {MONTHS[month]} {year}
                </p>
              </div>
            ) : (
              <>
                {!isParceiroSimples && (
                  <FixoPaymentSection
                    yearMonth={`${year}-${String(month + 1).padStart(2, '0')}`}
                    fixedMonthly={hourlyRate}
                    expTotal={expTotal}
                    expPaid={expPaid}
                  />
                )}

                {/* Apontamentos do período */}
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <div className="px-4 py-3 border-b" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                      Apontamentos do Período — {timesheets.length} registro{timesheets.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" style={{ background: 'var(--surface)' }}>
                      <thead style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)' }}>
                        <tr>
                          <th className="px-2 py-2.5 w-10" />
                          {['Data', 'Projeto', 'Horas', 'Status'].map(h => (
                            <th key={h} className="px-4 py-2.5 text-center font-semibold uppercase tracking-wider text-[10px] first:text-left" style={{ color: 'var(--text-light)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {timesheets.map(ts => {
                          const hrs = ts.effort_minutes / 60
                          const locked = isLocked(ts.status)
                          return (
                            <tr key={ts.id} {...hover.bind(ts)} className="border-b hover:bg-[var(--surface-hover)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                              <td className="px-2 py-2.5 w-10">
                                <RowMenu items={[
                                  { label: 'Visualizar', icon: <Eye size={12} />, onClick: () => setTsViewItem(ts) },
                                  ...(ts.status === 'conflicted' && ts.origin !== 'webhook' ? [
                                    { label: 'Ver conflito', icon: <AlertTriangle size={12} />, onClick: () => setTsConflictItem(ts) },
                                    { label: 'Editar', icon: <Pencil size={12} />, onClick: () => openEditTs(ts) },
                                    { label: 'Excluir', icon: <Trash2 size={12} />, onClick: () => deleteTs(ts.id), danger: true },
                                  ] : !locked && ['pending', 'rejected', 'adjustment_requested'].includes(ts.status) ? [
                                    { label: 'Editar', icon: <Pencil size={12} />, onClick: () => openEditTs(ts) },
                                    { label: 'Excluir', icon: <Trash2 size={12} />, onClick: () => deleteTs(ts.id), danger: true },
                                  ] : []),
                                ]} />
                              </td>
                              <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text)' }}>{fmt(ts.date)}</td>
                              <td className="px-4 py-2.5 text-center max-w-[280px] truncate" style={{ color: 'var(--text-muted)' }}>{ts.project?.name ?? '—'}</td>
                              <td className="px-4 py-2.5 text-center font-mono" style={{ color: 'var(--text)' }}>{fmtHours(hrs)}</td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  ts.status === 'approved' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                                  ts.status === 'rejected' ? 'bg-[var(--danger-bg)] text-[var(--danger)]' :
                                  'bg-[var(--surface-hover)] text-[var(--text-muted)]'
                                }`}>{ts.status_display}</span>
                                {ts.rejection_reason && ['rejected', 'adjustment_requested'].includes(ts.status) && (
                                  <p className="text-[10px] mt-0.5 text-[var(--danger)] truncate max-w-[140px] mx-auto" title={ts.rejection_reason}>
                                    {ts.rejection_reason}
                                  </p>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[10px] px-1" style={{ color: 'var(--text-light)' }}>
                  {!isParceiroSimples && <span>Valor fixo: {hourlyRate > 0 ? formatBRL(hourlyRate) : '—'}/mês</span>}
                  <span className="ml-auto">Total trabalhado: {fmtHours(workedHours)}</span>
                </div>
              </>
            )
          ) : isHorista ? (
            /* ── Horista: view baseada nos apontamentos já carregados ── */
            timesheets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 rounded-2xl" style={{ border: '1px dashed var(--border)' }}>
                <Clock size={28} style={{ color: 'var(--text-light)' }} />
                <p className="mt-3 text-sm font-medium" style={{ color: 'var(--text)' }}>
                  Nenhum apontamento no período
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-light)' }}>
                  {MONTHS[month]} {year}
                </p>
              </div>
            ) : (
              <>
                {!isParceiroSimples && (
                  <HoristaPaymentSection
                    yearMonth={`${year}-${String(month + 1).padStart(2, '0')}`}
                    workedHours={workedHours}
                    billableHours={billableHours}
                    guaranteedHours={guaranteedProrated}
                    hourlyRate={hourlyRate}
                    recebimento={myClosing?.recebimento ?? null}
                    expTotal={expTotal}
                    expPaid={expPaid}
                    proporcional={isProporcional}
                    prorationRatio={prorationRatio}
                  />
                )}

                {/* Apontamentos do período */}
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <div className="px-4 py-3 border-b" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                      Apontamentos do Período — {timesheets.length} registro{timesheets.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" style={{ background: 'var(--surface)' }}>
                      <thead style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)' }}>
                        <tr>
                          <th className="px-2 py-2.5 w-10" />
                          {['Data', 'Projeto', 'Horas', ...(isParceiroSimples ? [] : ['Valor']), 'Status'].map(h => (
                            <th key={h} className="px-4 py-2.5 text-center font-semibold uppercase tracking-wider text-[10px] first:text-left" style={{ color: 'var(--text-light)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {timesheets.map(ts => {
                          const hrs = ts.effort_minutes / 60
                          const val = effectiveRate > 0 ? hrs * effectiveRate : null
                          const locked = isLocked(ts.status)
                          return (
                            <tr key={ts.id} {...hover.bind(ts)} className="border-b hover:bg-[var(--surface-hover)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                              <td className="px-2 py-2.5 w-10">
                                <RowMenu items={[
                                  { label: 'Visualizar', icon: <Eye size={12} />, onClick: () => setTsViewItem(ts) },
                                  ...(ts.status === 'conflicted' && ts.origin !== 'webhook' ? [
                                    { label: 'Ver conflito', icon: <AlertTriangle size={12} />, onClick: () => setTsConflictItem(ts) },
                                    { label: 'Editar', icon: <Pencil size={12} />, onClick: () => openEditTs(ts) },
                                    { label: 'Excluir', icon: <Trash2 size={12} />, onClick: () => deleteTs(ts.id), danger: true },
                                  ] : !locked && ['pending', 'rejected', 'adjustment_requested'].includes(ts.status) ? [
                                    { label: 'Editar', icon: <Pencil size={12} />, onClick: () => openEditTs(ts) },
                                    { label: 'Excluir', icon: <Trash2 size={12} />, onClick: () => deleteTs(ts.id), danger: true },
                                  ] : []),
                                ]} />
                              </td>
                              <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text)' }}>{fmt(ts.date)}</td>
                              <td className="px-4 py-2.5 text-center max-w-[280px] truncate" style={{ color: 'var(--text-muted)' }}>{ts.project?.name ?? '—'}</td>
                              <td className="px-4 py-2.5 text-center font-mono" style={{ color: 'var(--text)' }}>{fmtHours(hrs)}</td>
                              {!isParceiroSimples && <td className="px-4 py-2.5 text-center font-mono" style={{ color: val ? 'var(--success-border)' : 'var(--text-light)' }}>{val ? formatBRL(val) : '—'}</td>}
                              <td className="px-4 py-2.5 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  ts.status === 'approved' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                                  ts.status === 'rejected' ? 'bg-[var(--danger-bg)] text-[var(--danger)]' :
                                  'bg-[var(--surface-hover)] text-[var(--text-muted)]'
                                }`}>{ts.status_display}</span>
                                {ts.rejection_reason && ['rejected', 'adjustment_requested'].includes(ts.status) && (
                                  <p className="text-[10px] mt-0.5 text-[var(--danger)] truncate max-w-[140px] mx-auto" title={ts.rejection_reason}>
                                    {ts.rejection_reason}
                                  </p>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[10px] px-1" style={{ color: 'var(--text-light)' }}>
                  {!isParceiroSimples && <span>Taxa: {hourlyRate > 0 ? formatBRL(hourlyRate) : '—'}/h</span>}
                  {!isParceiroSimples && guaranteedHours !== null && <span>Garantido: {fmtHours(Number(guaranteedHours))}/mês</span>}
                  <span className="ml-auto">Total faturável: {fmtHours(billableHours)}</span>
                </div>
              </>
            )
          ) : (
            /* ── BH Consultor: banco de horas com saldo ── */
            hbLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-44 w-full rounded-2xl" />
                <Skeleton className="h-64 w-full rounded-2xl" />
              </div>
            ) : !hbCurrent && hbStartDate ? (
              <div className="flex flex-col items-center justify-center py-16 rounded-2xl" style={{ border: '1px dashed var(--border)' }}>
                <CalendarDays size={28} style={{ color: 'var(--text-light)' }} />
                <p className="mt-3 text-sm font-medium" style={{ color: 'var(--text)' }}>
                  Banco de horas não iniciado neste período
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-light)' }}>
                  Inicia em {fmtYearMonth(hbStartDate.substring(0, 7))}
                </p>
              </div>
            ) : (
              <>
                {hbCurrent && (() => {
                  const now = new Date()
                  const isCurrentMonth = hbCurrent.year_month === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
                  const fixedSalary = (user as any)?.rate_type === 'monthly' ? Number((user as any)?.hourly_rate ?? 0) : 0
                  const showExtras = (user as any)?.consultant_type !== 'bh_fixo'
                  return (
                    <>
                      <HBPaymentSection data={hbCurrent} fixedSalary={fixedSalary} expTotal={expTotal} expPaid={expPaid} showExtras={showExtras} />
                      <HBCurrentMonthCard data={hbCurrent} isCurrentMonth={isCurrentMonth} />
                    </>
                  )
                })()}

                {(hbHistory.length > 0 || hbCurrent) && (
                  <HBEvolutionChart history={hbHistory} current={hbCurrent} />
                )}

                {hbHistory.length > 0 && (
                  <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    <div className="px-4 py-3 border-b" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Meses Anteriores</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs" style={{ background: 'var(--surface)' }}>
                        <thead style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)' }}>
                          <tr>
                            {['Mês', 'Previsto', 'Trabalhado', 'Saldo Mês', 'Saldo Ant.', 'Saldo Final'].map(h => (
                              <th key={h} className="px-4 py-2.5 text-center font-semibold uppercase tracking-wider text-[10px] first:text-left" style={{ color: 'var(--text-light)' }}>{h}</th>
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

                <div className="flex items-center gap-4 text-[10px] px-1" style={{ color: 'var(--text-light)' }}>
                  <span className="flex items-center gap-1"><TrendingUp size={10} className="text-[var(--success)]" /> Saldo positivo</span>
                  <span className="flex items-center gap-1"><TrendingDown size={10} className="text-[var(--danger)]" /> Saldo negativo</span>
                  <span className="flex items-center gap-1"><Minus size={10} className="text-[var(--text-light)]" /> Zerado</span>
                  {hbCurrent && <span className="ml-auto">HP = Dias úteis × {hbCurrent.daily_hours}h/dia</span>}
                </div>
              </>
            )
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Modal: Novo / Editar Apontamento
      ══════════════════════════════════════════════════════════════════════ */}
      {/* Modal de Confirmação de Exclusão */}
      {confirmModal?.open && (
        <ModalOverlay onClose={() => setConfirmModal(null)}>
          <div className="p-6 space-y-5 w-full max-w-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--danger-bg)] flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-[var(--danger)]" />
              </div>
              <h3 className="text-base font-semibold text-[var(--text)]">Confirmar exclusão</h3>
            </div>
            <p className="text-sm text-[var(--text-muted)]">{confirmModal.message}</p>
            <div className="flex gap-3 justify-end pt-1">
              <Button variant="outline" onClick={() => setConfirmModal(null)}>Cancelar</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-[var(--primary-fg)]" onClick={confirmModal.onConfirm}>
                Excluir
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {tsModal.open && (
        <ModalOverlay onClose={() => setTsModal({ open: false })}>
          <div className="p-6 max-h-[90vh] overflow-y-auto space-y-4">
            <h3 className="text-base font-semibold text-[var(--text)]">
              {tsModal.item ? 'Editar Apontamento' : 'Novo Apontamento'}
            </h3>

            {/* Usuário — admin/coord podem apontar por outro consultor (vazio = eu mesmo). */}
            {canActAsUser && (
              <SearchSelectField label="Usuário" value={tsForm.user_id}
                onChange={v => setTsForm(f => ({ ...f, user_id: v, customer_id: '', project_id: '' }))}
                options={tsUsers}
                placeholder="Você mesmo — ou selecione outro consultor…"
              />
            )}

            <SearchSelectField label="Cliente" value={tsForm.customer_id}
              onChange={v => setTsForm(f => ({ ...f, customer_id: v, project_id: '', stage_delivery_id: '', real_project_id: '' }))}
              options={tsFormCustomers}
              placeholder="Selecione o cliente..."
            />

            <SearchSelectField label="Projeto" value={tsForm.project_id}
              onChange={v => setTsForm(f => ({ ...f, project_id: v, stage_delivery_id: '', real_project_id: '' }))}
              options={tsProjectOptions}
              placeholder={tsForm.customer_id ? 'Selecione o projeto...' : 'Selecione o cliente primeiro'}
              required
            />

            <SearchSelectField label="Atividade" value={tsForm.stage_delivery_id}
              onChange={v => setTsForm(f => ({ ...f, stage_delivery_id: v }))}
              options={tsActivityOptions}
              placeholder={
                !tsForm.project_id ? 'Selecione o projeto primeiro'
                : tsActivitiesLoading ? 'Carregando atividades…'
                : tsActivityOptions.length === 0 ? 'Nenhuma atividade neste projeto'
                : 'Opcional — vincule a uma atividade'
              }
            />

            {(() => {
              const sp = tsFormProjects.find(p => p.id === Number(tsForm.project_id)) as any
              const sc = tsFormCustomers.find(c => String(c.id) === tsForm.customer_id)
              const isErp = String(sc?.name ?? '').toUpperCase().includes('ERPSERV')
              if (!sp?.is_investimento_comercial || isErp) return null
              if (!(sp?.categoria_interna === 'Projeto' || sp?.categoria_interna === 'Suporte')) return null
              const soSust = sp?.categoria_interna === 'Suporte'
              const opts = tsRealProjects.filter((p: any) => {
                if (p.is_investimento_comercial || String(p.id) === tsForm.project_id) return false
                if (soSust && p.service_type_code !== 'sustentacao') return false
                return true
              })
              return (
                <SearchSelectField label={`Projeto Real *${soSust ? ' (Sustentação)' : ''}`}
                  value={tsForm.real_project_id}
                  onChange={v => setTsForm(f => ({ ...f, real_project_id: v }))}
                  options={opts}
                  placeholder="Selecione o projeto real..."
                  required
                />
              )
            })()}

            {(() => {
              const selProj = tsFormProjects.find(p => p.id === Number(tsForm.project_id))
              const stName = selProj?.service_type?.name
              if (!stName) return null
              const colorMap: Record<string, string> = {
                default: 'bg-[var(--surface-hover)] text-[var(--text)]',
                sustentacao: 'bg-[var(--primary-soft)] text-[var(--primary)] border border-blue-500/30',
                projeto: 'bg-[var(--purple-bg)] text-[var(--purple)] border border-purple-500/30',
              }
              const normalized = stName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
              const colorKey = normalized.includes('sustentacao') ? 'sustentacao'
                : normalized.includes('projeto') ? 'projeto'
                : 'default'
              return (
                <div className="flex items-center gap-2 -mt-1">
                  <span className="text-[10px] text-[var(--text-light)] uppercase tracking-wider">Tipo de serviço:</span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${colorMap[colorKey]}`}>{stName}</span>
                </div>
              )
            })()}

            <div>
              <Label className="text-xs text-[var(--text-muted)]">Data *</Label>
              <Input type="date" value={tsForm.date} max={todayISO()}
                onChange={e => setTsForm(f => ({ ...f, date: e.target.value }))}
                className="mt-1.5 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
            </div>

            {/* Toggle Horário / Total de Horas */}
            <div className="flex items-center gap-2">
              {(['Horário', 'Total de Horas'] as const).map((label, i) => {
                const active = i === 0 ? !tsModeTotal : tsModeTotal
                return (
                  <button key={label} type="button"
                    onClick={() => setTsModeTotal(i === 1)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={active
                      ? { background: 'var(--primary)', color: 'var(--primary-fg)' }
                      : { background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--primary-soft)' }
                    }>{label}</button>
                )
              })}
            </div>

            {/* Modo Horário */}
            {!tsModeTotal && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">Início</Label>
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
                    className="mt-1.5 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">Fim</Label>
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
                    className="mt-1.5 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">Total (h)</Label>
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
                    className="mt-1.5 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
                </div>
              </div>
            )}

            {/* Modo Total de Horas */}
            {tsModeTotal && (
              <div className="space-y-3">
                <div className="rounded-lg px-3 py-2.5 text-xs" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', color: '#ca8a04' }}>
                  <span className="font-semibold">Atenção:</span> O lançamento por &quot;Total de Horas&quot; deve ser realizado em comum acordo com o coordenador responsável.
                </div>
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">Total de Horas *</Label>
                  <Input
                    type="number" min="0.5" max="24" step="0.5"
                    value={tsForm.total_hours}
                    onChange={e => setTsForm(f => ({ ...f, total_hours: e.target.value, start_time: '', end_time: '' }))}
                    placeholder="ex: 2.5"
                    className="mt-1.5 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-[var(--text-muted)]">Descrição *</Label>
                <span className={`text-[10px] ${(tsForm.observation?.length ?? 0) < 20 ? 'text-[var(--text-light)]' : 'text-[var(--success)]'}`}>
                  {tsForm.observation?.length ?? 0}/20 mín.
                </span>
              </div>
              <textarea value={tsForm.observation}
                onChange={e => setTsForm(f => ({ ...f, observation: e.target.value }))}
                rows={3}
                placeholder="Descreva o que foi feito (mínimo 20 caracteres)..."
                className="mt-1.5 w-full bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] text-xs rounded-lg px-3 py-2.5 outline-none resize-none focus:border-[var(--border-strong)] transition-colors" />
            </div>

            {(() => {
              const selProj = projects.find(p => p.id === Number(tsForm.project_id))
              if (!isSustentacao(selProj?.service_type?.name)) return null
              return (
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">Ticket / Chamado *</Label>
                  <Input type="number" value={tsForm.ticket}
                    onChange={e => setTsForm(f => ({ ...f, ticket: e.target.value.replace(/\D/g, '') }))}
                    placeholder="Ex: 123456"
                    className="mt-1.5 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                </div>
              )
            })()}

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setTsModal({ open: false })}
                className="h-9 text-xs border-[var(--border)] text-[var(--text)]">
                Cancelar
              </Button>
              <Button onClick={saveTs} disabled={tsSaving}
                className="h-9 text-xs bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-fg)] px-6">
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
            <h3 className="text-base font-semibold text-[var(--text)]">
              {expModal.item ? 'Editar Despesa' : 'Nova Despesa'}
            </h3>

            <SearchSelectField label="Cliente" value={expForm.customer_id}
              onChange={v => setExpForm(f => ({ ...f, customer_id: v, project_id: '' }))}
              options={consultantCustomers}
              placeholder="Selecione o cliente..."
            />

            <SearchSelectField label="Projeto" value={expForm.project_id}
              onChange={v => setExpForm(f => ({ ...f, project_id: v, real_project_id: '' }))}
              options={expProjectOptions}
              placeholder="Selecione o projeto..."
              required
            />

            {(() => {
              const sp = projects.find(p => p.id === Number(expForm.project_id)) as any
              const sc = consultantCustomers.find(c => String(c.id) === expForm.customer_id)
              const isErp = String(sc?.name ?? '').toUpperCase().includes('ERPSERV')
              if (!sp?.is_investimento_comercial || isErp) return null
              const soSust = sp?.categoria_interna === 'Suporte'
              const opts = expRealProjects.filter((p: any) => {
                if (p.is_investimento_comercial || String(p.id) === expForm.project_id) return false
                if (soSust && p.service_type_code !== 'sustentacao') return false
                return true
              })
              return (
                <SearchSelectField label={`Projeto Real *${soSust ? ' (Sustentação)' : ''}`}
                  value={expForm.real_project_id}
                  onChange={v => setExpForm(f => ({ ...f, real_project_id: v }))}
                  options={opts}
                  placeholder="Selecione o projeto real..."
                  required
                />
              )
            })()}

            {categories.length > 0 && (
              <SearchSelectField label="Categoria" value={expForm.expense_category_id}
                onChange={v => setExpForm(f => ({ ...f, expense_category_id: v }))}
                options={categories}
                placeholder="Selecione a categoria..."
              />
            )}

            <div>
              <Label className="text-xs text-[var(--text-muted)]">Data *</Label>
              <Input type="date" value={expForm.expense_date}
                onChange={e => setExpForm(f => ({ ...f, expense_date: e.target.value }))}
                className="mt-1.5 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
            </div>

            <div>
              <Label className="text-xs text-[var(--text-muted)]">Descrição *</Label>
              <Input value={expForm.description}
                onChange={e => setExpForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Ex.: Passagem para São Paulo"
                className="mt-1.5 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
            </div>

            <div>
              <Label className="text-xs text-[var(--text-muted)]">Valor (R$) *</Label>
              <Input type="number" min="0" step="0.01" value={expForm.amount}
                onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0,00"
                className="mt-1.5 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
            </div>

            {/* Receipt upload */}
            <div>
              <Label className="text-xs text-[var(--text-muted)]">Comprovante</Label>

              {/* Comprovante existente (modo edição) */}
              {expForm.receipt_url && !expFile && (
                <div className="mt-1.5 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)]">
                  <span className="text-xs text-[var(--success)] flex-1">Comprovante anexado</span>
                  <ReceiptLinkInline url={expForm.receipt_url} />
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="text-[11px] text-[var(--text-light)] hover:text-[var(--text)] transition-colors">
                    Substituir
                  </button>
                </div>
              )}

              {/* Upload area */}
              {(!expForm.receipt_url || expFile) && (
                <div
                  onClick={() => fileRef.current?.click()}
                  className="mt-1.5 border border-dashed border-[var(--border)] rounded-lg p-4 cursor-pointer hover:border-[var(--border-strong)] transition-colors text-center">
                  <span className="text-xs text-[var(--text-light)]">
                    {expFile
                      ? <span className="text-[var(--primary)]">{expFile.name}</span>
                      : 'Clique para anexar comprovante (opcional)'}
                  </span>
                </div>
              )}

              <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden"
                onChange={e => setExpFile(e.target.files?.[0] ?? null)} />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setExpModal({ open: false })}
                className="h-9 text-xs border-[var(--border)] text-[var(--text)]">
                Cancelar
              </Button>
              <Button onClick={saveExp} disabled={expSaving}
                className="h-9 text-xs bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-fg)] px-6">
                {expSaving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Modal: Visualizar Despesa ── */}
      {expViewItem && (() => {
        const sc = EXP_STATUS_CONF[expViewItem.status] ?? { bg: 'rgba(113,113,122,0.12)', color: 'var(--text-light)', label: expViewItem.status_display ?? expViewItem.status }
        const canEdit = ['pending', 'rejected', 'adjustment_requested'].includes(expViewItem.status)
        return (
          <ModalOverlay onClose={() => setExpViewItem(null)}>
            <div className="max-h-[88vh] overflow-y-auto">
              {/* Header */}
              <div className="px-5 pt-5 pb-4 flex items-start gap-3">
                <div className="p-2.5 rounded-xl shrink-0"
                  style={{ background: 'rgba(249,115,22,0.1)', color: '#F97316' }}>
                  <Receipt size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--text)]">Detalhes da Despesa</h3>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>
                    #{expViewItem.id} · {fmt(expViewItem.expense_date)}
                  </p>
                </div>
              </div>

              <div className="px-5 pb-5 space-y-4">
                {/* Status + Categoria */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                    style={{ background: sc.bg, color: sc.color }}>
                    {sc.label}
                  </span>
                  {expViewItem.category?.name && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                      style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      <Tag size={9} /> {expViewItem.category.name}
                    </span>
                  )}
                </div>

                {/* Valor hero */}
                <div className="rounded-xl px-4 py-4"
                  style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.15)' }}>
                  <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-light)' }}>Valor Total</p>
                  <p className="text-2xl font-bold" style={{ color: '#F97316' }}>{expViewItem.formatted_amount}</p>
                </div>

                {/* Info card */}
                <div className="rounded-xl overflow-hidden"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <InfoRowModal icon={CalendarDays} label="Data" value={fmt(expViewItem.expense_date)} />
                  {expViewItem.project?.customer?.name && (
                    <InfoRowModal icon={Building2} label="Cliente" value={expViewItem.project.customer.name} />
                  )}
                  <InfoRowModal icon={FolderOpen} label="Projeto" value={expViewItem.project?.name} />
                  <InfoRowModal icon={Paperclip} label="Comprovante" last>
                    {expViewItem.receipt_url
                      ? <ReceiptLinkInline url={expViewItem.receipt_url} label="Visualizar Comprovante" />
                      : <span className="text-xs" style={{ color: 'var(--text-light)' }}>Sem comprovante</span>
                    }
                  </InfoRowModal>
                </div>

                {/* Descrição */}
                {expViewItem.description && (
                  <div className="rounded-xl overflow-hidden"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2 px-4 py-2.5"
                      style={{ borderBottom: '1px solid var(--border)' }}>
                      <FileText size={11} style={{ color: 'var(--primary)' }} />
                      <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--text-light)' }}>Descrição</span>
                    </div>
                    <p className="px-4 py-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      {expViewItem.description}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  {canEdit && (
                    <Button variant="outline" onClick={() => { setExpViewItem(null); openEditExp(expViewItem) }}
                      className="h-8 text-xs border-[var(--border)] text-[var(--text)] gap-1.5">
                      <Pencil size={11} /> Editar
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setExpViewItem(null)}
                    className="h-8 text-xs border-[var(--border)] text-[var(--text)]">
                    Fechar
                  </Button>
                </div>
              </div>
            </div>
          </ModalOverlay>
        )
      })()}

      {/* ── Modal: Visualizar Apontamento ── */}
      {tsViewItem && (() => {
        const sc = EXP_STATUS_CONF[tsViewItem.status] ?? { bg: 'rgba(113,113,122,0.12)', color: 'var(--text-light)', label: tsViewItem.status_display ?? tsViewItem.status }
        const canEditTs = ['pending', 'rejected', 'adjustment_requested'].includes(tsViewItem.status)
        return (
          <ModalOverlay onClose={() => setTsViewItem(null)}>
            <div className="max-h-[88vh] overflow-y-auto">
              {/* Header */}
              <div className="px-5 pt-5 pb-4 flex items-start gap-3">
                <div className="p-2.5 rounded-xl shrink-0"
                  style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                  <Clock size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--text)]">Detalhes do Apontamento</h3>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>
                    #{tsViewItem.id} · {fmt(tsViewItem.date)}
                  </p>
                </div>
              </div>

              <div className="px-5 pb-5 space-y-4">
                {/* Status */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                    style={{ background: sc.bg, color: sc.color }}>
                    {tsViewItem.status === 'approved' && <Lock size={9} />}
                    {sc.label}
                  </span>
                </div>

                {/* Horas hero */}
                <div className="rounded-xl px-4 py-4"
                  style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-soft)' }}>
                  <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-light)' }}>Total de Horas</p>
                  <p className="text-2xl font-bold font-mono" style={{ color: 'var(--primary)' }}>{tsViewItem.effort_hours}</p>
                  {tsViewItem.start_time && tsViewItem.end_time && (
                    <p className="text-[11px] mt-1 font-mono" style={{ color: 'var(--text-muted)' }}>
                      {tsViewItem.start_time} → {tsViewItem.end_time}
                    </p>
                  )}
                </div>

                {/* Info card */}
                <div className="rounded-xl overflow-hidden"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <InfoRowModal icon={CalendarDays} label="Data" value={fmt(tsViewItem.date)} />
                  {tsViewItem.project?.customer?.name && (
                    <InfoRowModal icon={Building2} label="Cliente" value={tsViewItem.project.customer.name} />
                  )}
                  <InfoRowModal icon={FolderOpen} label="Projeto" value={tsViewItem.project?.name} />
                  {tsViewItem.ticket && (
                    <InfoRowModal icon={Tag} label="Ticket">
                      <a href={`https://erpserv.movidesk.com/Ticket/Edit/${tsViewItem.ticket}`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[var(--primary)] hover:text-[var(--primary)]">#{tsViewItem.ticket}</a>
                    </InfoRowModal>
                  )}
                  <InfoRowModal icon={Paperclip} label="Anexo" last>
                    {tsViewItem.attachment_url
                      ? <ReceiptLinkInline url={tsViewItem.attachment_url} label="Visualizar Anexo" />
                      : <span className="text-xs" style={{ color: 'var(--text-light)' }}>Sem anexo</span>
                    }
                  </InfoRowModal>
                </div>

                {/* Observação */}
                {tsViewItem.observation && (
                  <div className="rounded-xl overflow-hidden"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2 px-4 py-2.5"
                      style={{ borderBottom: '1px solid var(--border)' }}>
                      <FileText size={11} style={{ color: 'var(--primary)' }} />
                      <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--text-light)' }}>Observação</span>
                    </div>
                    <div
                      className="
                        px-4 py-3 text-sm leading-relaxed
                        [&_img]:max-w-full [&_img]:rounded-lg
                        [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse
                        [&_th]:border [&_th]:border-[var(--border)] [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:bg-[var(--bg)]
                        [&_td]:border [&_td]:border-[var(--border)] [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top
                        [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1.5
                        [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5
                        [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1
                        [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-2 [&_h4]:mb-1
                        [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
                        [&_a]:underline [&_a]:text-[var(--primary)]
                        [&_hr]:my-3 [&_hr]:border-[var(--border)]
                      "
                      style={{ color: 'var(--text-muted)' }}
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(tsViewItem.observation) }}
                    />
                  </div>
                )}

                {/* Motivo da rejeição / ajuste */}
                {tsViewItem.rejection_reason && ['rejected', 'adjustment_requested'].includes(tsViewItem.status) && (
                  <div className="rounded-xl overflow-hidden"
                    style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-bg)' }}>
                    <div className="flex items-center gap-2 px-4 py-2.5"
                      style={{ borderBottom: '1px solid var(--danger-bg)' }}>
                      <AlertCircle size={11} style={{ color: 'var(--danger-border)' }} />
                      <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--danger-border)' }}>
                        {tsViewItem.status === 'adjustment_requested' ? 'Motivo do Ajuste' : 'Motivo da Rejeição'}
                      </span>
                    </div>
                    <p className="px-4 py-3 text-sm leading-relaxed" style={{ color: '#FCA5A5' }}>
                      {tsViewItem.rejection_reason}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  {canEditTs && (
                    <Button variant="outline" onClick={() => { setTsViewItem(null); openEditTs(tsViewItem) }}
                      className="h-8 text-xs border-[var(--border)] text-[var(--text)] gap-1.5">
                      <Pencil size={11} /> Editar
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setTsViewItem(null)}
                    className="h-8 text-xs border-[var(--border)] text-[var(--text)]">
                    Fechar
                  </Button>
                </div>
              </div>
            </div>
          </ModalOverlay>
        )
      })()}

      {/* ── Modal de Conflito (componente compartilhado) ─────────── */}
      {tsConflictItem && (
        <TimesheetConflictModal
          timesheet={tsConflictItem as unknown as ConflictTimesheet}
          onClose={() => setTsConflictItem(null)}
        />
      )}

      {/* ── Modal de conflito ao salvar edição ────────────────────────── */}
      {tsEditConflict && (
        <ModalOverlay onClose={() => setTsEditConflict(null)}>
          <div className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]" style={{ background: 'var(--danger-bg)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--danger-bg)' }}>
                <AlertTriangle size={16} className="text-[var(--danger)]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-[var(--danger)]">Conflito de Horário</p>
                <p className="text-[11px] text-[var(--text-light)] mt-0.5">O horário conflita com o apontamento abaixo</p>
              </div>
              <button onClick={() => setTsEditConflict(null)} className="text-[var(--text-light)] hover:text-[var(--text)] transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-2.5">
              <div className="rounded-xl p-3.5 space-y-2" style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-bg)' }}>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-light)]">Data</span>
                  <span className="text-[var(--text)] font-medium">{fmt(tsEditConflict.date)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-light)]">Horário</span>
                  <span className="text-[var(--text)] font-medium font-mono">
                    {tsEditConflict.start_time ?? '—'} – {tsEditConflict.end_time ?? '—'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-light)]">Cliente</span>
                  <span className="text-[var(--text)] font-medium">{tsEditConflict.customer_name ?? '—'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-light)]">Projeto</span>
                  <span className="text-[var(--text)] font-medium">{tsEditConflict.project_name ?? '—'}</span>
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] text-center pt-1">
                Ajuste o horário para não sobrepor este apontamento.
              </p>
            </div>

            <div className="px-5 py-4 border-t border-[var(--border)] flex justify-end">
              <Button variant="outline" onClick={() => setTsEditConflict(null)}>Entendido</Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      <TimesheetHoverTooltip ts={hover.ts} />
     </MoneyMaskContext.Provider>
    </AppLayout>
  )
}
