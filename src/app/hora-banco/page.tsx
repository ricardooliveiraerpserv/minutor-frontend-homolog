'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  Clock, ChevronDown, ChevronUp, Lock, Unlock, RefreshCw,
  TrendingUp, TrendingDown, Minus, CalendarDays, User,
} from 'lucide-react'
import { ConfirmDeleteModal } from '@/components/ui/confirm-delete-modal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConsultantSummary {
  id: number
  name: string
  email: string
  daily_hours: number
  current_balance: number
  last_closed: string | null
}

interface HourBankClosing {
  id?: number
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
  status: 'open' | 'closed'
  closed_at?: string | null
  closed_by?: number | null
  notes?: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(h: number): string {
  const abs = Math.abs(h)
  const hrs = Math.floor(abs)
  const min = Math.round((abs - hrs) * 60)
  const sign = h < 0 ? '-' : ''
  return min > 0 ? `${sign}${hrs}h${String(min).padStart(2, '0')}` : `${sign}${hrs}h`
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(m) - 1]}/${y}`
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function BalancePill({ value, size = 'sm' }: { value: number; size?: 'sm' | 'lg' }) {
  const isPos  = value > 0
  const isNeg  = value < 0
  const isZero = value === 0
  const color  = isPos ? '#22c55e' : isNeg ? '#ef4444' : '#71717a'
  const bg     = isPos ? 'rgba(34,197,94,0.1)' : isNeg ? 'rgba(239,68,68,0.1)' : 'rgba(113,113,122,0.1)'
  const Icon   = isPos ? TrendingUp : isNeg ? TrendingDown : Minus
  const cls    = size === 'lg' ? 'text-lg font-bold' : 'text-xs font-semibold'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${cls}`}
      style={{ background: bg, color }}>
      <Icon size={size === 'lg' ? 14 : 10} />
      {fmt(value)}
    </span>
  )
}

// ─── Card do Mês Atual (preview) ──────────────────────────────────────────────

function CurrentMonthCard({
  data, onClose, closing
}: {
  data: HourBankClosing
  onClose: () => void
  closing: boolean
}) {
  const [notes, setNotes] = useState('')

  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays size={15} color="var(--brand-primary)" />
          <span className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>
            {fmtMonth(data.year_month)}
          </span>
          {data.status === 'open'
            ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">Em aberto</span>
            : <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-500/15 text-zinc-400 border border-zinc-500/20 flex items-center gap-1"><Lock size={8}/> Fechado</span>
          }
        </div>
        {data.status === 'open' && (
          <div className="flex items-center gap-2">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Observação (opcional)"
              rows={1}
              className="text-xs px-3 py-1.5 rounded-xl resize-none outline-none"
              style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)', width: '220px' }}
            />
            <button
              onClick={() => onClose()}
              disabled={closing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}
            >
              <Lock size={11} />
              {closing ? 'Fechando...' : 'Fechar Mês'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Horas Previstas', value: fmt(data.expected_hours), sub: `${data.working_days} dias úteis`, color: 'var(--brand-muted)' },
          { label: 'Horas Trabalhadas', value: fmt(data.worked_hours), sub: '', color: 'var(--brand-text)' },
          { label: 'Saldo do Mês', value: fmt(data.month_balance), sub: '', color: data.month_balance >= 0 ? '#22c55e' : '#ef4444' },
          { label: 'Saldo Anterior', value: fmt(data.previous_balance), sub: '', color: data.previous_balance >= 0 ? '#22c55e' : data.previous_balance < 0 ? '#ef4444' : 'var(--brand-muted)' },
        ].map(item => (
          <div key={item.label} className="rounded-xl p-3" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--brand-subtle)' }}>{item.label}</p>
            <p className="text-xl font-bold" style={{ color: item.color }}>{item.value}</p>
            {item.sub && <p className="text-[10px] mt-0.5" style={{ color: 'var(--brand-subtle)' }}>{item.sub}</p>}
          </div>
        ))}
      </div>

      {/* Resultado */}
      <div className="mt-3 rounded-xl px-4 py-3 flex items-center justify-between"
        style={{ background: data.paid_hours > 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${data.paid_hours > 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.15)'}` }}>
        <div>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Saldo Acumulado</p>
          <BalancePill value={data.accumulated_balance} size="lg" />
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>
            {data.paid_hours > 0 ? 'Horas a Pagar' : 'Saldo Final'}
          </p>
          {data.paid_hours > 0
            ? <span className="text-lg font-bold text-green-400">{fmt(data.paid_hours)} a pagar</span>
            : <BalancePill value={data.final_balance} size="lg" />
          }
        </div>
      </div>
    </div>
  )
}

// ─── Linha do histórico ────────────────────────────────────────────────────────

function HistoryRow({ row, onReopen }: { row: HourBankClosing; onReopen: (ym: string) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <tr
        className="border-b cursor-pointer hover:bg-white/[0.02] transition-colors"
        style={{ borderColor: 'var(--brand-border)' }}
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--brand-text)' }}>
          <span className="flex items-center gap-1.5">
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {fmtMonth(row.year_month)}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-center" style={{ color: 'var(--brand-muted)' }}>{fmt(row.expected_hours)}</td>
        <td className="px-4 py-3 text-sm text-center" style={{ color: 'var(--brand-text)' }}>{fmt(row.worked_hours)}</td>
        <td className="px-4 py-3 text-center"><BalancePill value={row.month_balance} /></td>
        <td className="px-4 py-3 text-center"><BalancePill value={row.previous_balance} /></td>
        <td className="px-4 py-3 text-center">
          {row.paid_hours > 0
            ? <span className="text-xs font-semibold text-green-400">{fmt(row.paid_hours)}</span>
            : <span style={{ color: 'var(--brand-subtle)' }} className="text-xs">—</span>
          }
        </td>
        <td className="px-4 py-3 text-center"><BalancePill value={row.final_balance} /></td>
        <td className="px-4 py-3 text-center">
          {row.status === 'closed'
            ? <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full text-zinc-400 bg-zinc-500/10"><Lock size={8}/>Fechado</span>
            : <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">Aberto</span>
          }
        </td>
      </tr>
      {open && (
        <tr style={{ background: 'rgba(255,255,255,0.015)', borderBottom: `1px solid var(--brand-border)` }}>
          <td colSpan={8} className="px-6 py-3">
            <div className="flex items-start gap-6 text-xs" style={{ color: 'var(--brand-muted)' }}>
              <span><span className="text-zinc-500">Dias úteis:</span> {row.working_days}</span>
              <span><span className="text-zinc-500">Feriados:</span> {row.holidays_count}</span>
              <span><span className="text-zinc-500">H/dia:</span> {row.daily_hours}h</span>
              <span><span className="text-zinc-500">Acumulado:</span> <BalancePill value={row.accumulated_balance} /></span>
              {row.notes && <span><span className="text-zinc-500">Obs:</span> {row.notes}</span>}
              {row.status === 'closed' && (
                <button
                  onClick={e => { e.stopPropagation(); onReopen(row.year_month) }}
                  className="ml-auto flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                >
                  <Unlock size={9} /> Reabrir
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HoraBancoPage() {
  const [consultants, setConsultants] = useState<ConsultantSummary[]>([])
  const [selected, setSelected] = useState<ConsultantSummary | null>(null)
  const [preview, setPreview] = useState<HourBankClosing | null>(null)
  const [history, setHistory] = useState<HourBankClosing[]>([])
  const [loadingConsultants, setLoadingConsultants] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [closing, setClosing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [reopenConfirm, setReopenConfirm] = useState<{ open: boolean; yearMonth?: string }>({ open: false })

  // ── Carregar lista de consultores ──
  useEffect(() => {
    api.get<{ items: ConsultantSummary[] }>('/consultant-hour-bank/consultants')
      .then(r => setConsultants(r.items ?? []))
      .catch(() => toast.error('Erro ao carregar consultores'))
      .finally(() => setLoadingConsultants(false))
  }, [refreshKey])

  // ── Carregar dados do consultor selecionado ──
  const loadConsultantData = useCallback(async (userId: number, dailyHours: number) => {
    setLoadingData(true)
    try {
      const [prev, hist] = await Promise.all([
        api.get<HourBankClosing>(`/consultant-hour-bank/${userId}/preview`),
        api.get<{ items: HourBankClosing[] }>(`/consultant-hour-bank/${userId}/history`),
      ])
      setPreview(prev)
      setHistory(hist.items ?? [])
    } catch { toast.error('Erro ao carregar banco de horas') }
    finally { setLoadingData(false) }
  }, [])

  useEffect(() => {
    if (selected) loadConsultantData(selected.id, selected.daily_hours)
  }, [selected, refreshKey, loadConsultantData])

  const handleClose = async () => {
    if (!selected || !preview) return
    setClosing(true)
    try {
      await api.post(`/consultant-hour-bank/${selected.id}/close`, {
        year_month: preview.year_month,
        daily_hours: selected.daily_hours,
      })
      toast.success(`Mês ${fmtMonth(preview.year_month)} fechado com sucesso`)
      setRefreshKey(k => k + 1)
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao fechar mês') }
    finally { setClosing(false) }
  }

  const handleReopen = (yearMonth: string) => {
    if (!selected) return
    setReopenConfirm({ open: true, yearMonth })
  }

  const confirmReopen = async () => {
    if (!selected || !reopenConfirm.yearMonth) return
    const yearMonth = reopenConfirm.yearMonth
    setReopenConfirm({ open: false })
    try {
      await api.post(`/consultant-hour-bank/${selected.id}/reopen`, { year_month: yearMonth })
      toast.success(`Mês ${fmtMonth(yearMonth)} reaberto`)
      setRefreshKey(k => k + 1)
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao reabrir') }
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto w-full space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--brand-text)' }}>Banco de Horas — Consultores</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--brand-subtle)' }}>
              Acompanhamento mensal de horas previstas, trabalhadas e saldo acumulado
            </p>
          </div>
          <button onClick={() => setRefreshKey(k => k + 1)} className="p-2 rounded-lg hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-subtle)' }}>
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="flex gap-6">
          {/* ── Sidebar: lista de consultores ── */}
          <div className="w-64 shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: 'var(--brand-subtle)' }}>Consultores</p>
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--brand-border)', background: 'var(--brand-surface)' }}>
              {loadingConsultants ? (
                <div className="p-3 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : consultants.length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: 'var(--brand-subtle)' }}>Nenhum consultor</p>
              ) : consultants.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className="w-full flex items-start gap-2.5 px-3 py-3 text-left transition-colors border-b last:border-0"
                  style={{
                    borderColor: 'var(--brand-border)',
                    background: selected?.id === c.id ? 'rgba(0,245,255,0.06)' : 'transparent',
                  }}
                >
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5"
                    style={{ background: selected?.id === c.id ? 'rgba(0,245,255,0.15)' : 'rgba(255,255,255,0.05)', color: selected?.id === c.id ? 'var(--brand-primary)' : 'var(--brand-muted)' }}>
                    {c.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: selected?.id === c.id ? 'var(--brand-primary)' : 'var(--brand-text)' }}>{c.name}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: c.current_balance < 0 ? '#ef4444' : c.current_balance > 0 ? '#22c55e' : 'var(--brand-subtle)' }}>
                      {c.current_balance !== 0 ? fmt(c.current_balance) : 'Zerado'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Conteúdo ── */}
          <div className="flex-1 min-w-0 space-y-5">
            {!selected ? (
              <div className="flex flex-col items-center justify-center py-20 rounded-2xl" style={{ border: '1px dashed var(--brand-border)' }}>
                <User size={32} style={{ color: 'var(--brand-subtle)' }} />
                <p className="mt-3 text-sm" style={{ color: 'var(--brand-subtle)' }}>Selecione um consultor para ver o banco de horas</p>
              </div>
            ) : loadingData ? (
              <div className="space-y-4">
                <Skeleton className="h-44 w-full rounded-2xl" />
                <Skeleton className="h-64 w-full rounded-2xl" />
              </div>
            ) : (
              <>
                {/* Preview mês atual */}
                {preview && (
                  <CurrentMonthCard data={preview} onClose={handleClose} closing={closing} />
                )}

                {/* Histórico */}
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
                  <div className="px-4 py-3 border-b" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
                    <p className="text-xs font-semibold" style={{ color: 'var(--brand-muted)' }}>Histórico de Fechamentos</p>
                  </div>
                  {history.length === 0 ? (
                    <p className="text-xs text-center py-8" style={{ color: 'var(--brand-subtle)' }}>Nenhum fechamento registrado</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs" style={{ background: 'var(--brand-surface)' }}>
                        <thead style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--brand-border)' }}>
                          <tr>
                            {['Mês', 'Previsto', 'Trabalhado', 'Saldo Mês', 'Saldo Ant.', 'Pago', 'Saldo Final', 'Status'].map(h => (
                              <th key={h} className="px-4 py-2.5 text-center font-semibold uppercase tracking-wider text-[10px] first:text-left" style={{ color: 'var(--brand-subtle)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((row, i) => (
                            <HistoryRow key={`${row.user_id}-${row.year_month}-${i}`} row={row} onReopen={handleReopen} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Legenda */}
                <div className="flex items-center gap-4 text-[10px] px-1" style={{ color: 'var(--brand-subtle)' }}>
                  <span className="flex items-center gap-1"><TrendingUp size={10} className="text-green-400" /> Saldo positivo</span>
                  <span className="flex items-center gap-1"><TrendingDown size={10} className="text-red-400" /> Saldo negativo</span>
                  <span className="flex items-center gap-1"><Minus size={10} className="text-zinc-500" /> Zerado</span>
                  <span className="ml-auto">HP = Dias úteis × {selected.daily_hours}h/dia</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmDeleteModal
        open={reopenConfirm.open}
        title="Confirmar reabertura"
        message={`Reabrir o mês ${reopenConfirm.yearMonth ? fmtMonth(reopenConfirm.yearMonth) : ''}? Esta ação é controlada e deve ser usada com cautela.`}
        confirmLabel="Reabrir"
        onClose={() => setReopenConfirm({ open: false })}
        onConfirm={confirmReopen}
      />
    </AppLayout>
  )
}
