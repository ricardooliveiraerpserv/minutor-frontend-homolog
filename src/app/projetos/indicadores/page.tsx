'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { BarChart3, FolderKanban, Clock, AlertTriangle, CheckCircle2, TrendingUp, CalendarClock, X } from 'lucide-react'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts'

/* ── Mapeamento de status → coluna/label/cor (mesmo do pipeline Demandas e Projetos) ── */
const STATUS_COLS = [
  { id: 'proj_backlog',   label: 'Backlog',         statuses: ['backlog', 'awaiting_start'],   color: '#94a3b8' },
  { id: 'em_planejamento',label: 'Em Planejamento', statuses: ['planning'],                    color: '#a78bfa' },
  { id: 'em_andamento',   label: 'Em Andamento',    statuses: ['started'],                     color: '#60a5fa' },
  { id: 'em_homologacao', label: 'Em Homologação',  statuses: ['liberado_para_testes'],        color: '#22d3ee' },
  { id: 'em_producao',    label: 'Em Produção',     statuses: ['em_producao'],                 color: '#14b8a6' },
  { id: 'pausado',        label: 'Pausado',         statuses: ['paused'],                      color: '#eab308' },
  { id: 'encerrado',      label: 'Encerrado',       statuses: ['finished'],                    color: '#22c55e' },
  { id: 'cancelado',      label: 'Cancelado',       statuses: ['cancelled'],                   color: '#ef4444' },
] as const

const STATUS_TO_COL: Record<string, string> = {}
STATUS_COLS.forEach(c => c.statuses.forEach(s => { STATUS_TO_COL[s] = c.id }))
const COL_BY_ID = Object.fromEntries(STATUS_COLS.map(c => [c.id, c]))

const HEALTH = [
  { key: 'saudavel', label: 'Saudável', color: '#22c55e' },
  { key: 'atencao',  label: 'Atenção',  color: '#f59e0b' },
  { key: 'critico',  label: 'Crítico',  color: '#ef4444' },
]
function healthOf(sold: number, consumed: number): 'saudavel' | 'atencao' | 'critico' {
  const pct = sold > 0 ? (consumed / sold) * 100 : 0
  return pct >= 90 ? 'critico' : pct >= 70 ? 'atencao' : 'saudavel'
}

type Card = {
  id?: number; project_id?: number; code?: string; project_name?: string; customer_name?: string
  status?: string; sold_hours?: number; consumed_hours?: number; delivery_percentage?: number | null
  start_date?: string | null; expected_end_date?: string | null; service_type?: string; contract_type?: string
  executivo_conta_name?: string | null; card_type?: string
}

const fmtNum = (n: number) => n.toLocaleString('pt-BR')
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'
const daysTo = (d?: string | null) => d ? Math.ceil((new Date(d + 'T00:00:00Z').getTime() - Date.now()) / 86400000) : null

export default function IndicadoresProjetosPage() {
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('') // col id ou ''
  const [clientFilter, setClientFilter] = useState<string>('')
  const [view, setView] = useState<'consolidado' | 'projeto'>('consolidado')
  const [selected, setSelected] = useState<Card | null>(null)

  useEffect(() => {
    setLoading(true)
    api.get<{ project_cards?: Card[] }>('/contracts/kanban')
      .then(r => setCards(Array.isArray(r?.project_cards) ? r.project_cards : []))
      .catch(() => setCards([]))
      .finally(() => setLoading(false))
  }, [])

  const clients = useMemo(
    () => Array.from(new Set(cards.map(c => c.customer_name).filter(Boolean) as string[])).sort(),
    [cards],
  )

  const filtered = useMemo(() => cards.filter(c => {
    const col = STATUS_TO_COL[c.status ?? ''] ?? 'proj_backlog'
    if (statusFilter && col !== statusFilter) return false
    if (clientFilter && c.customer_name !== clientFilter) return false
    return true
  }), [cards, statusFilter, clientFilter])

  /* ── Agregações ── */
  const total = filtered.length
  const byStatus = STATUS_COLS.map(c => ({
    ...c, count: filtered.filter(x => (STATUS_TO_COL[x.status ?? ''] ?? 'proj_backlog') === c.id).length,
  })).filter(c => c.count > 0)

  const health = HEALTH.map(h => ({
    ...h, count: filtered.filter(x => healthOf(Number(x.sold_hours ?? 0), Number(x.consumed_hours ?? 0)) === h.key).length,
  }))

  const deliveryBuckets = [
    { label: '0%',      min: 0,   max: 0,   color: '#94a3b8' },
    { label: '1–25%',   min: 1,   max: 25,  color: '#f97316' },
    { label: '26–50%',  min: 26,  max: 50,  color: '#eab308' },
    { label: '51–75%',  min: 51,  max: 75,  color: '#60a5fa' },
    { label: '76–99%',  min: 76,  max: 99,  color: '#22d3ee' },
    { label: '100%',    min: 100, max: 100, color: '#22c55e' },
  ].map(b => ({
    ...b, count: filtered.filter(x => {
      const p = Math.round(Number(x.delivery_percentage ?? 0))
      return p >= b.min && p <= b.max
    }).length,
  }))
  const avgDelivery = total > 0
    ? Math.round(filtered.reduce((s, x) => s + Number(x.delivery_percentage ?? 0), 0) / total)
    : 0

  const criticos = health.find(h => h.key === 'critico')?.count ?? 0
  const emAndamento = byStatus.find(c => c.id === 'em_andamento')?.count ?? 0
  const emHomolog = byStatus.find(c => c.id === 'em_homologacao')?.count ?? 0
  const emProducao = byStatus.find(c => c.id === 'em_producao')?.count ?? 0
  const encerrados = byStatus.find(c => c.id === 'encerrado')?.count ?? 0

  // Prazos: só ativos (não encerrado/cancelado), ordenados pela previsão
  const prazos = filtered
    .filter(x => !['finished', 'cancelled'].includes(x.status ?? ''))
    .filter(x => x.expected_end_date)
    .sort((a, b) => (a.expected_end_date! < b.expected_end_date! ? -1 : 1))
  const vencidos = prazos.filter(x => (daysTo(x.expected_end_date) ?? 1) < 0).length

  /* ── UI ── */
  const KPI = ({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: React.ReactNode; color: string }) => (
    <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}1a`, color }}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider truncate" style={{ color: 'var(--text-light)' }}>{label}</p>
        <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text)' }}>{value}</p>
      </div>
    </div>
  )
  const Card2 = ({ title, children, sub }: { title: string; sub?: string; children: React.ReactNode }) => (
    <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="mb-3">
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</p>
        {sub && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>{sub}</p>}
      </div>
      {children}
    </div>
  )
  const TT = ({ active, payload }: any) => active && payload?.length ? (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
      <b>{payload[0].payload.label}</b>: {payload[0].value} projeto(s)
    </div>
  ) : null

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
            <BarChart3 size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Indicadores de Projetos</h1>
            <p className="text-xs" style={{ color: 'var(--text-light)' }}>Visão em dashboards de Demandas e Projetos</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle Consolidado / Por Projeto */}
          <div className="flex rounded-xl p-0.5" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
            {(['consolidado', 'projeto'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
                style={view === v ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { color: 'var(--text-muted)' }}>
                {v === 'consolidado' ? 'Consolidado' : 'Por Projeto'}
              </button>
            ))}
          </div>
          {/* Filtro cliente */}
          <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
            className="text-sm rounded-xl px-3 py-2 outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <option value="">Todos os clientes</option>
            {clients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Filtro de status (chips) */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setStatusFilter('')}
          className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
          style={statusFilter === '' ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          Todos ({cards.filter(c => !clientFilter || c.customer_name === clientFilter).length})
        </button>
        {STATUS_COLS.map(c => {
          const n = cards.filter(x => (STATUS_TO_COL[x.status ?? ''] ?? 'proj_backlog') === c.id && (!clientFilter || x.customer_name === clientFilter)).length
          if (n === 0) return null
          const on = statusFilter === c.id
          return (
            <button key={c.id} onClick={() => setStatusFilter(on ? '' : c.id)}
              className="text-xs px-3 py-1.5 rounded-full font-medium transition-all flex items-center gap-1.5"
              style={on ? { background: c.color, color: '#0a0a0a' } : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />{c.label} ({n})
            </button>
          )
        })}
        {(statusFilter || clientFilter) && (
          <button onClick={() => { setStatusFilter(''); setClientFilter('') }} className="text-xs px-2 py-1 rounded-full flex items-center gap-1" style={{ color: 'var(--text-light)' }}>
            <X size={12} /> limpar
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-24 text-center text-sm" style={{ color: 'var(--text-light)' }}>Carregando indicadores…</div>
      ) : (
        <>
          {/* KPIs — Dash Número de Projetos */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KPI icon={<FolderKanban size={18} />} label="Total de Projetos" value={fmtNum(total)} color="var(--primary)" />
            <KPI icon={<Clock size={18} />}        label="Em Andamento"      value={fmtNum(emAndamento)} color="#60a5fa" />
            <KPI icon={<TrendingUp size={18} />}   label="Em Homologação"    value={fmtNum(emHomolog)} color="#22d3ee" />
            <KPI icon={<CheckCircle2 size={18} />} label="Em Produção"       value={fmtNum(emProducao)} color="#14b8a6" />
            <KPI icon={<AlertTriangle size={18} />}label="Críticos"          value={fmtNum(criticos)} color="#ef4444" />
            <KPI icon={<CalendarClock size={18} />}label="Prazo vencido"     value={fmtNum(vencidos)} color="#f97316" />
          </div>

          {view === 'consolidado' && <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Status dos Projetos */}
            <Card2 title="Status dos Projetos" sub={`${total} projeto(s)`}>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byStatus} dataKey="count" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={2}>
                      {byStatus.map(s => <Cell key={s.id} fill={s.color} />)}
                    </Pie>
                    <Tooltip content={<TT />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
                {byStatus.map(s => (
                  <div key={s.id} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 truncate" style={{ color: 'var(--text-muted)' }}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />{s.label}
                    </span>
                    <b style={{ color: 'var(--text)' }}>{s.count}</b>
                  </div>
                ))}
              </div>
            </Card2>

            {/* Criticidade dos Projetos */}
            <Card2 title="Criticidade dos Projetos" sub="Por % de horas consumidas">
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={health} dataKey="count" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={2}>
                      {health.map(h => <Cell key={h.key} fill={h.color} />)}
                    </Pie>
                    <Tooltip content={<TT />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-around mt-1">
                {health.map(h => (
                  <div key={h.key} className="text-center">
                    <p className="text-lg font-bold tabular-nums" style={{ color: h.color }}>{h.count}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>{h.label}</p>
                  </div>
                ))}
              </div>
            </Card2>

            {/* Percentual de entrega */}
            <Card2 title="Percentual de Entrega" sub={`Média: ${avgDelivery}%`}>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deliveryBuckets} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-light)' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-light)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<TT />} cursor={{ fill: 'var(--surface-hover)' }} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {deliveryBuckets.map(b => <Cell key={b.label} fill={b.color} />)}
                      <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-hover)' }}>
                <div className="h-full rounded-full" style={{ width: `${avgDelivery}%`, background: 'var(--primary)' }} />
              </div>
            </Card2>
          </div>

          {/* Datas: Início e Previsão de finalização */}
          <Card2 title="Prazos — Data de Início e Previsão de Finalização" sub={`${prazos.length} projeto(s) ativo(s) com previsão · ${vencidos} vencido(s)`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left" style={{ color: 'var(--text-light)' }}>
                    <th className="py-2 pr-3 font-medium text-xs uppercase tracking-wider">Projeto</th>
                    <th className="py-2 px-3 font-medium text-xs uppercase tracking-wider">Cliente</th>
                    <th className="py-2 px-3 font-medium text-xs uppercase tracking-wider">Status</th>
                    <th className="py-2 px-3 font-medium text-xs uppercase tracking-wider text-center">Entrega</th>
                    <th className="py-2 px-3 font-medium text-xs uppercase tracking-wider">Início</th>
                    <th className="py-2 px-3 font-medium text-xs uppercase tracking-wider">Previsão</th>
                    <th className="py-2 pl-3 font-medium text-xs uppercase tracking-wider text-right">Prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {prazos.map((p, i) => {
                    const col = COL_BY_ID[STATUS_TO_COL[p.status ?? ''] ?? 'proj_backlog']
                    const dt = daysTo(p.expected_end_date)
                    const del = Math.round(Number(p.delivery_percentage ?? 0))
                    return (
                      <tr key={p.id ?? i} onClick={() => setSelected(p)} className="cursor-pointer transition-colors hover:brightness-95" style={{ borderTop: '1px solid var(--border)', background: 'transparent' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td className="py-2 pr-3">
                          <p className="font-medium truncate max-w-[220px]" style={{ color: 'var(--text)' }}>{p.project_name || '—'}</p>
                          <p className="text-[11px] font-mono" style={{ color: 'var(--text-light)' }}>{p.code}</p>
                        </td>
                        <td className="py-2 px-3 truncate max-w-[140px]" style={{ color: 'var(--text-muted)' }}>{p.customer_name}</td>
                        <td className="py-2 px-3">
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ background: `${col?.color}22`, color: col?.color }}>{col?.label}</span>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-hover)' }}>
                              <div className="h-full rounded-full" style={{ width: `${del}%`, background: del >= 100 ? '#22c55e' : 'var(--primary)' }} />
                            </div>
                            <span className="text-[11px] tabular-nums w-8" style={{ color: 'var(--text-muted)' }}>{del}%</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 tabular-nums whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{fmtDate(p.start_date)}</td>
                        <td className="py-2 px-3 tabular-nums whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{fmtDate(p.expected_end_date)}</td>
                        <td className="py-2 pl-3 text-right whitespace-nowrap">
                          {dt === null ? '—' : (
                            <span className="text-xs font-medium" style={{ color: dt < 0 ? '#ef4444' : dt <= 7 ? '#f97316' : 'var(--text-light)' }}>
                              {dt < 0 ? `venceu há ${Math.abs(dt)}d` : dt === 0 ? 'vence hoje' : `em ${dt}d`}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {prazos.length === 0 && (
                    <tr><td colSpan={7} className="py-8 text-center text-xs" style={{ color: 'var(--text-light)' }}>Nenhum projeto ativo com previsão de finalização.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card2>
          </>}

          {view === 'projeto' && (
            <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Indicadores por Projeto <span className="text-[11px] font-normal" style={{ color: 'var(--text-light)' }}>· {filtered.length} projeto(s)</span></p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="text-left" style={{ color: 'var(--text-light)' }}>
                      <th className="py-2 pr-3 font-medium text-xs uppercase tracking-wider">Projeto</th>
                      <th className="py-2 px-3 font-medium text-xs uppercase tracking-wider">Cliente</th>
                      <th className="py-2 px-3 font-medium text-xs uppercase tracking-wider">Status</th>
                      <th className="py-2 px-3 font-medium text-xs uppercase tracking-wider">Criticidade</th>
                      <th className="py-2 px-3 font-medium text-xs uppercase tracking-wider text-center">Entrega</th>
                      <th className="py-2 px-3 font-medium text-xs uppercase tracking-wider text-right">Horas</th>
                      <th className="py-2 px-3 font-medium text-xs uppercase tracking-wider">Início</th>
                      <th className="py-2 px-3 font-medium text-xs uppercase tracking-wider">Previsão</th>
                      <th className="py-2 pl-3 font-medium text-xs uppercase tracking-wider text-right">Prazo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p, i) => {
                      const col = COL_BY_ID[STATUS_TO_COL[p.status ?? ''] ?? 'proj_backlog']
                      const hk = healthOf(Number(p.sold_hours ?? 0), Number(p.consumed_hours ?? 0))
                      const h = HEALTH.find(x => x.key === hk)!
                      const del = Math.round(Number(p.delivery_percentage ?? 0))
                      const dt = daysTo(p.expected_end_date)
                      const sold = Number(p.sold_hours ?? 0), cons = Number(p.consumed_hours ?? 0)
                      return (
                        <tr key={p.id ?? i} onClick={() => setSelected(p)} className="cursor-pointer transition-colors hover:brightness-95" style={{ borderTop: '1px solid var(--border)', background: 'transparent' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <td className="py-2 pr-3">
                            <p className="font-medium truncate max-w-[240px]" style={{ color: 'var(--text)' }}>{p.project_name || '—'}</p>
                            <p className="text-[11px] font-mono" style={{ color: 'var(--text-light)' }}>{p.code}</p>
                          </td>
                          <td className="py-2 px-3 truncate max-w-[150px]" style={{ color: 'var(--text-muted)' }}>{p.customer_name}</td>
                          <td className="py-2 px-3"><span className="text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ background: `${col?.color}22`, color: col?.color }}>{col?.label}</span></td>
                          <td className="py-2 px-3"><span className="text-[11px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1" style={{ background: `${h.color}1a`, color: h.color }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: h.color }} />{h.label}</span></td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-1.5">
                              <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-hover)' }}><div className="h-full rounded-full" style={{ width: `${del}%`, background: del >= 100 ? '#22c55e' : 'var(--primary)' }} /></div>
                              <span className="text-[11px] tabular-nums w-8" style={{ color: 'var(--text-muted)' }}>{del}%</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{cons.toFixed(1)}/{sold.toFixed(1)}h</td>
                          <td className="py-2 px-3 tabular-nums whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{fmtDate(p.start_date)}</td>
                          <td className="py-2 px-3 tabular-nums whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{fmtDate(p.expected_end_date)}</td>
                          <td className="py-2 pl-3 text-right whitespace-nowrap">{dt === null ? '—' : <span className="text-xs font-medium" style={{ color: dt < 0 ? '#ef4444' : dt <= 7 ? '#f97316' : 'var(--text-light)' }}>{dt < 0 ? `venceu há ${Math.abs(dt)}d` : dt === 0 ? 'hoje' : `em ${dt}d`}</span>}</td>
                        </tr>
                      )
                    })}
                    {filtered.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-xs" style={{ color: 'var(--text-light)' }}>Nenhum projeto.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal: indicadores do projeto selecionado */}
      {selected && (() => {
        const p = selected
        const sold = Number(p.sold_hours ?? 0), cons = Number(p.consumed_hours ?? 0)
        const saldo = Math.round((sold - cons) * 100) / 100
        const pctCons = sold > 0 ? Math.min(100, Math.round((cons / sold) * 100)) : 0
        const col = COL_BY_ID[STATUS_TO_COL[p.status ?? ''] ?? 'proj_backlog']
        const hk = healthOf(sold, cons); const h = HEALTH.find(x => x.key === hk)!
        const del = Math.round(Number(p.delivery_percentage ?? 0))
        const dt = daysTo(p.expected_end_date)
        const Box = ({ label, value, color, bar }: { label: string; value: React.ReactNode; color?: string; bar?: number }) => (
          <div className="rounded-xl p-3" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>{label}</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: color ?? 'var(--text)' }}>{value}</p>
            {bar !== undefined && (
              <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken, var(--border))' }}>
                <div className="h-full rounded-full" style={{ width: `${bar}%`, background: color ?? 'var(--primary)' }} />
              </div>
            )}
          </div>
        )
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setSelected(null)}>
            <div className="w-full max-w-2xl rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b flex items-start justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>{p.code}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${col?.color}22`, color: col?.color }}>{col?.label}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1" style={{ background: `${h.color}1a`, color: h.color }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: h.color }} />{h.label}</span>
                  </div>
                  <p className="text-base font-bold truncate" style={{ color: 'var(--text)' }}>{p.project_name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-light)' }}>{p.customer_name}{p.executivo_conta_name ? ` · Exec: ${p.executivo_conta_name}` : ''}</p>
                </div>
                <button onClick={() => setSelected(null)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 90px)' }}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Box label="Horas Apontáveis" value={`${sold.toFixed(1)}h`} />
                  <Box label="Horas Consumidas" value={`${cons.toFixed(1)}h`} color="var(--text-muted)" />
                  <Box label="Saldo" value={`${saldo.toFixed(1)}h`} color={saldo < 0 ? '#ef4444' : '#22c55e'} />
                  <Box label="Consumido" value={`${pctCons}%`} color={h.color} bar={pctCons} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Box label="Percentual de Entrega" value={`${del}%`} color={del >= 100 ? '#22c55e' : 'var(--primary)'} bar={del} />
                  <div className="rounded-xl p-3" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                    <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Data de Início</p>
                    <p className="text-base font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmtDate(p.start_date)}</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                    <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Previsão de Finalização</p>
                    <p className="text-base font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmtDate(p.expected_end_date)}</p>
                    {dt !== null && (
                      <p className="text-[11px] font-medium mt-0.5" style={{ color: dt < 0 ? '#ef4444' : dt <= 7 ? '#f97316' : 'var(--text-light)' }}>
                        {dt < 0 ? `venceu há ${Math.abs(dt)}d` : dt === 0 ? 'vence hoje' : `faltam ${dt}d`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs pt-1">
                  <a href={`/contratos/pipeline?project=${p.id}`} className="px-3 py-1.5 rounded-lg font-medium" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>Abrir no pipeline →</a>
                  <span style={{ color: 'var(--text-light)' }}>Tipo: {p.contract_type || p.service_type || '—'}</span>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
