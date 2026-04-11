'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

// ─── Palette ──────────────────────────────────────────────────────────────────

const PALETTE = [
  '#00F5FF', '#8B5CF6', '#10B981', '#F59E0B',
  '#EF4444', '#3B82F6', '#EC4899', '#14B8A6',
  '#F97316', '#A78BFA',
]

const CHART_STYLE = {
  background: 'transparent',
  fontSize: 11,
}

const AXIS_TICK = { fill: '#6B7280', fontSize: 11 }
const GRID_COLOR = 'rgba(255,255,255,0.06)'
const TOOLTIP_STYLE = {
  background: '#111113',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  fontSize: 12,
  color: '#E5E7EB',
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface HoursByRequesterItem  { requester: string;  total_hours: number }
interface HoursByServiceItem    { service: string;    total_hours: number }
interface TicketsByStatusItem   { status: string;     ticket_count: number }
interface TicketsByLevelItem    { level: string;      ticket_count: number; percentage?: number }
interface TicketsByCategoryItem { category: string;   ticket_count: number }
interface TicketsAbove8Item     { ticket_id: string;  total_hours: number }
interface MonthlyTicketsItem    { month: string;      ticket_count: number }
interface MonthlyConsumptionItem{ month: string;      consumed_hours: number }

interface IndicatorData {
  requester:    HoursByRequesterItem[]
  service:      HoursByServiceItem[]
  status:       TicketsByStatusItem[]
  level:        TicketsByLevelItem[]
  category:     TicketsByCategoryItem[]
  above8:       TicketsAbove8Item[]
  monthlyTix:   MonthlyTicketsItem[]
  monthlyConsum: MonthlyConsumptionItem[]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChartCard({ title, children, fullWidth = false }: {
  title: string; children: React.ReactNode; fullWidth?: boolean
}) {
  return (
    <div
      className={`rounded-2xl p-5 flex flex-col gap-4 ${fullWidth ? 'col-span-full' : ''}`}
      style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function Empty() {
  return <p className="text-xs py-6 text-center" style={{ color: 'var(--brand-subtle)' }}>Nenhum dado disponível.</p>
}

function ChartSkeleton() {
  return (
    <div className="animate-pulse rounded-xl h-52" style={{ background: 'var(--brand-border)' }} />
  )
}

// Recharts custom tooltip
function CustomTooltip({ active, payload, label, valueLabel }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2">
      <p className="font-semibold mb-1 text-white">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>
          {valueLabel ?? p.name}: <strong>{typeof p.value === 'number' ? p.value.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : p.value}</strong>
        </p>
      ))}
    </div>
  )
}

// Pie custom label
function renderPieLabel({ percent }: { name?: string; percent?: number }) {
  if (percent == null || percent < 0.04) return ''
  return `${(percent * 100).toFixed(0)}%`
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  /** Base path sem trailing slash. Ex: '/dashboards/on-demand/indicators' */
  basePath: string
  params: URLSearchParams
  /** Se true, bloqueia a carga (ex: filtro obrigatório não preenchido) */
  disabled?: boolean
}

export default function DashboardIndicators({ basePath, params, disabled = false }: Props) {
  const [data, setData]       = useState<IndicatorData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(false)

  const load = useCallback(async () => {
    if (disabled) return
    setLoading(true)
    setError(false)
    try {
      const p = params.toString()
      const [req, svc, sta, lvl, cat, a8, mTix, mCon] = await Promise.all([
        api.get<any>(`${basePath}/hours-by-requester?${p}`),
        api.get<any>(`${basePath}/hours-by-service?${p}`),
        api.get<any>(`${basePath}/tickets-by-status?${p}`),
        api.get<any>(`${basePath}/tickets-by-level?${p}`),
        api.get<any>(`${basePath}/tickets-by-category?${p}`),
        api.get<any>(`${basePath}/tickets-above-8-hours?${p}`),
        api.get<any>(`${basePath}/monthly-tickets?${p}`),
        api.get<any>(`${basePath}/monthly-consumption?${p}`),
      ])
      setData({
        requester:    Array.isArray(req?.data)  ? req.data  : [],
        service:      Array.isArray(svc?.data)  ? svc.data  : [],
        status:       Array.isArray(sta?.data)  ? sta.data  : [],
        level:        Array.isArray(lvl?.data)  ? lvl.data  : [],
        category:     Array.isArray(cat?.data)  ? cat.data  : [],
        above8:       Array.isArray(a8?.data)   ? a8.data   : [],
        monthlyTix:   Array.isArray(mTix?.data) ? mTix.data : [],
        monthlyConsum:Array.isArray(mCon?.data) ? mCon.data : [],
      })
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [basePath, params, disabled])

  useEffect(() => { load() }, [load])

  if (disabled) return null

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={`rounded-2xl p-5 ${i >= 6 ? 'col-span-full' : ''}`}
            style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
            <ChartSkeleton />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <p className="text-sm" style={{ color: 'var(--brand-danger)' }}>Erro ao carregar indicadores.</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

      {/* 1 — Horas por Solicitante */}
      <ChartCard title="Horas por Solicitante">
        {data.requester.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.requester} layout="vertical" style={CHART_STYLE}
              margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} tickFormatter={v => `${v}h`} />
              <YAxis type="category" dataKey="requester" tick={AXIS_TICK} width={110} />
              <Tooltip content={<CustomTooltip valueLabel="Horas" />} />
              <Bar dataKey="total_hours" name="Horas" radius={[0, 6, 6, 0]}>
                {data.requester.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 2 — Horas por Módulo/Serviço */}
      <ChartCard title="Horas por Módulo">
        {data.service.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.service} style={CHART_STYLE}
              margin={{ top: 0, right: 16, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="service" tick={AXIS_TICK} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={AXIS_TICK} tickFormatter={v => `${v}h`} />
              <Tooltip content={<CustomTooltip valueLabel="Horas" />} />
              <Bar dataKey="total_hours" name="Horas" radius={[6, 6, 0, 0]}>
                {data.service.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 3 — Status por Tickets */}
      <ChartCard title="Status por Tickets">
        {data.status.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.status} style={CHART_STYLE}
              margin={{ top: 0, right: 16, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="status" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} allowDecimals={false} />
              <Tooltip content={<CustomTooltip valueLabel="Tickets" />} />
              <Bar dataKey="ticket_count" name="Tickets" radius={[6, 6, 0, 0]}>
                {data.status.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 4 — Níveis de Atendimento (Pie) */}
      <ChartCard title="Níveis de Atendimento">
        {data.level.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart style={CHART_STYLE}>
              <Pie
                data={data.level}
                dataKey="ticket_count"
                nameKey="level"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={renderPieLabel}
                labelLine={false}
              >
                {data.level.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.85} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip valueLabel="Tickets" />} />
              <Legend
                formatter={(value) => <span style={{ fontSize: 11, color: '#9CA3AF' }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 5 — Motivo de Abertura */}
      <ChartCard title="Motivo de Abertura">
        {data.category.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.category} style={CHART_STYLE}
              margin={{ top: 0, right: 16, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="category" tick={AXIS_TICK} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={AXIS_TICK} allowDecimals={false} />
              <Tooltip content={<CustomTooltip valueLabel="Tickets" />} />
              <Bar dataKey="ticket_count" name="Tickets" radius={[6, 6, 0, 0]}>
                {data.category.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 6 — Tickets acima de 8h */}
      <ChartCard title="Tickets acima de 08 horas">
        {data.above8.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.above8} style={CHART_STYLE}
              margin={{ top: 0, right: 16, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="ticket_id" tick={AXIS_TICK} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={AXIS_TICK} tickFormatter={v => `${v}h`} />
              <Tooltip content={<CustomTooltip valueLabel="Horas" />} />
              <Bar dataKey="total_hours" name="Horas" radius={[6, 6, 0, 0]} fill="#EF4444" fillOpacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 7 — Qtd. de Tickets Mensal (full width) */}
      <ChartCard title="Qtd. de Tickets Mensal" fullWidth>
        {data.monthlyTix.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.monthlyTix} style={CHART_STYLE}
              margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="month" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} allowDecimals={false} />
              <Tooltip content={<CustomTooltip valueLabel="Tickets" />} />
              <Line
                type="monotone" dataKey="ticket_count" name="Tickets"
                stroke="#00F5FF" strokeWidth={2} dot={{ fill: '#00F5FF', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 8 — Consumo Mensal (full width) */}
      <ChartCard title="Consumo de Horas Mensal" fullWidth>
        {data.monthlyConsum.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.monthlyConsum} style={CHART_STYLE}
              margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="month" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} tickFormatter={v => `${v}h`} />
              <Tooltip content={<CustomTooltip valueLabel="Horas" />} />
              <Line
                type="monotone" dataKey="consumed_hours" name="Horas consumidas"
                stroke="#8B5CF6" strokeWidth={2} dot={{ fill: '#8B5CF6', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

    </div>
  )
}
