'use client'

// Tela INDEPENDENTE de Indicadores da Sustentação (extraída da aba homônima do
// Portal de Sustentação). Reusa o endpoint existente /sustentacao/executive.
// Mesmo escopo de acesso do portal: admin ou coordenador de sustentação.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { useAuth } from '@/hooks/use-auth'
import { api } from '@/lib/api'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { InlineLoader } from '@/components/ui/loading'
import { RefreshCw, BarChart2 } from 'lucide-react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

const CYAN = 'var(--primary)'
const GREEN = '#22c55e'
const YELLOW = '#eab308'
const RED = '#ef4444'
const ORANGE = '#f97316'
const BLUE = '#3b82f6'

interface ExecutiveData {
  pct_critical: number
  pct_stopped: number
  sla_breach_pct: number | null
  avg_resolution_hours: number | null
  lead_time_avg_hours: number | null
  aging: { d0_3: number; d4_7: number; d8_15: number; d15_plus: number }
  pct_hours_consumed: number | null
  total_sold_h: number
  total_used_h: number
  hours_per_ticket: number | null
  top_clients: { name: string; used_h: number; sold_h: number; pct: number | null }[]
  by_category: { label: string; count: number }[]
  by_urgency: { label: string; count: number }[]
  period: { from: string; to: string }
}

export default function IndicadoresSustentacaoPage() {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!user) return
    const isAdmin = user.type === 'admin'
    const isSustentacaoCoord = user.type === 'coordenador' && user.coordinator_type === 'sustentacao'
    if (!isAdmin && !isSustentacaoCoord) router.replace('/dashboard')
  }, [user, router])

  const now = new Date()
  const [filterMode, setFilterMode] = useState<'month' | 'period'>('month')
  const [refMonth, setRefMonth] = useState<number | null>(now.getMonth() + 1)
  const [refYear, setRefYear] = useState<number | null>(now.getFullYear())
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0] })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])

  const from = filterMode === 'month' && refMonth && refYear
    ? `${refYear}-${String(refMonth).padStart(2, '0')}-01`
    : dateFrom
  const to = filterMode === 'month' && refMonth && refYear
    ? new Date(refYear, refMonth, 0).toISOString().split('T')[0]
    : dateTo

  const [data, setData] = useState<ExecutiveData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await api.get<ExecutiveData>(`/sustentacao/executive?from=${from}&to=${to}`)
      setData(r)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar indicadores.')
    } finally { setLoading(false) }
  }, [from, to])

  useEffect(() => { load() }, [load])

  const dash = useMemo(() => {
    if (!data) return null
    const { pct_critical, pct_stopped, sla_breach_pct, avg_resolution_hours, lead_time_avg_hours, aging, pct_hours_consumed, total_sold_h, total_used_h, hours_per_ticket, top_clients, by_category, by_urgency } = data
    const kpiColor = (v: number | null, thresholds: [number, number]): string => {
      if (v == null) return 'var(--text-light)'
      if (v < thresholds[0]) return GREEN
      if (v < thresholds[1]) return YELLOW
      return RED
    }
    const agingBuckets = [
      { label: '0–3 dias', value: aging.d0_3, color: GREEN },
      { label: '4–7 dias', value: aging.d4_7, color: YELLOW },
      { label: '8–15 dias', value: aging.d8_15, color: ORANGE },
      { label: '+15 dias', value: aging.d15_plus, color: RED },
    ]
    const agingMax = Math.max(...agingBuckets.map(b => b.value), 1)
    return (
      <div className="space-y-5">
        {/* ROW 1 — 4 KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: '% Críticos (Alta/Urgente)', value: `${pct_critical}%`, sub: 'do total do período', color: kpiColor(pct_critical, [40, 60]) },
            { label: '% Parados', value: `${pct_stopped}%`, sub: 'de todos os ativos', color: kpiColor(pct_stopped, [20, 35]) },
            { label: 'SLA Violado', value: sla_breach_pct != null ? `${sla_breach_pct}%` : '—', sub: 'resolvidos fora do prazo', color: kpiColor(sla_breach_pct, [20, 40]) },
            { label: 'Tempo Médio Resolução', value: avg_resolution_hours != null ? `${avg_resolution_hours}h` : '—', sub: 'baseado em sla_solution_time', color: kpiColor(avg_resolution_hours, [8, 24]) },
          ].map(c => (
            <div key={c.label} className="rounded-xl border p-4 flex flex-col gap-1" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <span className="text-[11px] text-[var(--text-muted)]">{c.label}</span>
              <span className="text-3xl font-bold" style={{ color: c.color }}>{c.value}</span>
              <span className="text-[10px] text-[var(--text-muted)]">{c.sub}</span>
            </div>
          ))}
        </div>

        {/* ROW 2 — Aging + Lead Time/Horas por Ticket */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <p className="text-xs font-semibold text-[var(--text)] mb-4">Aging — Tickets Abertos</p>
            <div className="space-y-3">
              {agingBuckets.map(b => (
                <div key={b.label} className="flex items-center gap-3">
                  <span className="text-[11px] text-[var(--text-muted)] w-20 shrink-0">{b.label}</span>
                  <div className="flex-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)', height: 10 }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${(b.value / agingMax) * 100}%`, background: b.color }} />
                  </div>
                  <span className="text-[11px] font-semibold w-8 text-right" style={{ color: b.color }}>{b.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border p-4 flex flex-col gap-1" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <span className="text-[11px] text-[var(--text-muted)]">Lead Time Médio</span>
              <span className="text-3xl font-bold" style={{ color: kpiColor(lead_time_avg_hours, [8, 24]) }}>
                {lead_time_avg_hours != null ? `${lead_time_avg_hours}h` : '—'}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">abertura → fechamento</span>
            </div>
            <div className="rounded-xl border p-4 flex flex-col gap-1" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <span className="text-[11px] text-[var(--text-muted)]">Horas / Ticket</span>
              <span className="text-3xl font-bold" style={{ color: CYAN }}>
                {hours_per_ticket != null ? `${hours_per_ticket}h` : '—'}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">horas apontadas por ticket resolvido</span>
            </div>
          </div>
        </div>

        {/* ROW 3 — Consumo de Horas */}
        <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs font-semibold text-[var(--text)]">Consumo de Horas por Cliente</p>
            <div className="flex flex-col items-end">
              <span className="text-xs text-[var(--text-light)]">Consumido / Vendido</span>
              <span className="text-sm font-bold" style={{ color: kpiColor(pct_hours_consumed, [70, 90]) }}>
                {total_used_h}h / {total_sold_h}h
                {pct_hours_consumed != null && <span className="ml-1 text-[11px]">({pct_hours_consumed}%)</span>}
              </span>
            </div>
          </div>
          {top_clients.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, top_clients.length * 32)}>
              <BarChart layout="vertical"
                data={top_clients.map(c => ({ name: c.name.length > 22 ? c.name.slice(0, 20) + '…' : c.name, fullName: c.name, 'Usado (h)': c.used_h, 'Vendido (h)': c.sold_h, pct: c.pct }))}
                margin={{ left: 0, right: 55, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--text-light)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fill: 'var(--text)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--surface-hover)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(_: any, pl: any) => pl?.[0]?.payload?.fullName ?? ''} formatter={(v: any, name: any) => [`${v}h`, name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Vendido (h)" fill="var(--border-strong)" radius={[0, 3, 3, 0]} />
                <Bar dataKey="Usado (h)" fill={CYAN} radius={[0, 3, 3, 0]}
                  label={{ position: 'right', fill: 'var(--text-light)', fontSize: 10, formatter: (v: any) => v > 0 ? `${v}h` : '' }} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-[var(--text-light)] py-4 text-center">Nenhum dado de timesheet no período.</p>
          )}
        </div>

        {/* ROW 4 — Distribuição Categoria + Urgência */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <p className="text-xs font-semibold text-[var(--text)] mb-3">Distribuição por Categoria</p>
            <ResponsiveContainer width="100%" height={Math.max(160, by_category.length * 30)}>
              <BarChart layout="vertical" data={by_category.map(b => ({ name: b.label, count: b.count }))} margin={{ left: 0, right: 40, top: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fill: 'var(--text-light)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fill: 'var(--text)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--surface-hover)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" name="Tickets" fill={BLUE} radius={[0, 3, 3, 0]}
                  label={{ position: 'right', fill: 'var(--text-light)', fontSize: 10, formatter: (v: any) => v > 0 ? v : '' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <p className="text-xs font-semibold text-[var(--text)] mb-3">Distribuição por Urgência</p>
            <ResponsiveContainer width="100%" height={Math.max(160, by_urgency.length * 30)}>
              <BarChart layout="vertical" data={by_urgency.map(b => ({ name: b.label, count: b.count }))} margin={{ left: 0, right: 40, top: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fill: 'var(--text-light)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={70} tick={{ fill: 'var(--text)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--surface-hover)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" name="Tickets" radius={[0, 3, 3, 0]}
                  label={{ position: 'right', fill: 'var(--text-light)', fontSize: 10, formatter: (v: any) => v > 0 ? v : '' }}>
                  {by_urgency.map((b, i) => (
                    <Cell key={i} fill={b.label === 'Urgente' ? RED : b.label === 'Alta' ? ORANGE : b.label === 'Normal' || b.label === 'Média' ? CYAN : 'var(--text-light)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    )
  }, [data])

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 md:px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <BarChart2 size={18} style={{ color: 'var(--primary)' }} />
            <div>
              <h1 className="text-lg font-bold text-[var(--text)]">Indicadores — Sustentação</h1>
              <p className="text-xs text-[var(--text-light)]">Dashboard executivo operacional — Movidesk + Minutor</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
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
              <MonthYearPicker month={refMonth} year={refYear}
                onChange={(m, y) => { if (m === 0) { setRefMonth(null); setRefYear(null) } else { setRefMonth(m); setRefYear(y); setData(null) } }} />
            ) : (
              <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); setData(null) }} />
            )}
            <button onClick={() => { setData(null); load() }} className="p-1.5 rounded hover:bg-[var(--surface-hover)] transition-colors">
              <RefreshCw size={14} className={`text-[var(--text-muted)] ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {error && <div className="mb-4 text-xs text-[var(--danger)]">{error}</div>}
          {loading && !data && <InlineLoader />}
          {dash}
        </div>
      </div>
    </AppLayout>
  )
}
