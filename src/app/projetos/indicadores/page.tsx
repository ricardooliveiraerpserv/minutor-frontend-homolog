'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { api, apiMessage } from '@/lib/api'
import { useConfirm } from '@/components/ui/use-confirm'
import { toast } from 'sonner'
import { BarChart3, Search, ChevronUp, ChevronDown, Snowflake, TrendingUp, TrendingDown, LayoutList, Activity } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts'

/** Portfólio de indicadores — todos os projetos com EVM (horas) + operacional, filtrável. */

type Health = 'ok' | 'risk' | 'late'
type Row = {
  id: number; name: string; code: string | null; status: string
  customer: string | null; coordinators: string[]
  has_baseline: boolean
  pct_planned: number | null; pct_real: number | null; spi: number | null; cpi: number | null
  hours_planned: number; hours_ev: number; hours_actual: number
  deliveries: number; done: number; overdue: number; overdue_pct: number
  health: Health
}

const HEALTH: Record<Health, { label: string; cls: string; ord: number }> = {
  late: { label: 'Atrasado', cls: 'ds-status-danger', ord: 0 },
  risk: { label: 'Em risco', cls: 'ds-status-warning', ord: 1 },
  ok: { label: 'No prazo', cls: 'ds-status-success', ord: 2 },
}
const STATUS_OPTS = [
  { v: 'open', label: 'Em aberto' }, { v: 'active', label: 'Ativos' },
  { v: 'finished', label: 'Finalizados' }, { v: 'paused', label: 'Pausados' }, { v: 'cancelled', label: 'Cancelados' },
]

type CurvePt = { date: string; pv: number | null; ev: number | null; ac: number | null }

const idxTone = (v: number | null) => v == null ? 'var(--text-light)' : v >= 1 ? 'var(--success)' : v >= 0.9 ? 'var(--warning)' : 'var(--danger)'
const fmtIdx = (v: number | null) => v == null ? '—' : v.toFixed(2)
const fmtPct = (v: number | null) => v == null ? '—' : `${Math.round(v)}%`
const fmtH = (v: number) => `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}h`
const ddmm = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? iso : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }

type SortKey = 'name' | 'customer' | 'pct_real' | 'spi' | 'cpi' | 'overdue_pct' | 'health'

export default function PortfolioIndicadoresPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('open')
  const [search, setSearch] = useState('')
  const [cliente, setCliente] = useState('')
  const [coord, setCoord] = useState('')
  const [saude, setSaude] = useState<'' | Health>('')
  const [onlyBaseline, setOnlyBaseline] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'health', dir: 'asc' })
  const [mode, setMode] = useState<'lista' | 'consolidado'>('lista')
  const [curve, setCurve] = useState<CurvePt[]>([])
  const [curveLoading, setCurveLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ projects: Row[] }>(`/projects-portfolio?status=${status}`)
      setRows(r?.projects ?? [])
    } catch (e) { toast.error(apiMessage(e, 'Erro ao carregar indicadores')) }
    finally { setLoading(false) }
  }, [status])
  useEffect(() => { load() }, [load])

  // Curva-S consolidada (server): reflete os filtros de status + busca.
  const loadCurve = useCallback(async () => {
    setCurveLoading(true)
    try { const r = await api.get<{ curve: CurvePt[] }>(`/projects-portfolio/curve?status=${status}&search=${encodeURIComponent(search)}`); setCurve(r?.curve ?? []) }
    catch { setCurve([]) }
    finally { setCurveLoading(false) }
  }, [status, search])
  useEffect(() => { if (mode === 'consolidado') loadCurve() }, [mode, loadCurve])

  const { confirm, confirmDialog } = useConfirm()
  const [freezing, setFreezing] = useState(false)
  const freezeMissing = async () => {
    const okc = await confirm({
      title: 'Congelar linha de base em lote',
      message: 'Congelar a linha de base de todos os projetos do filtro atual que têm cronograma e ainda não têm base? Isso habilita o EVM (SPI/CPI/curva) para eles. Projetos já congelados não são alterados.',
      confirmLabel: 'Congelar', cancelLabel: 'Cancelar',
    })
    if (!okc) return
    setFreezing(true)
    try {
      const r = await api.post<{ frozen: number }>(`/projects-portfolio/freeze-missing?status=${status}&search=${encodeURIComponent(search)}`, {})
      toast.success(`${r?.frozen ?? 0} linha(s) de base congelada(s).`)
      await load(); if (mode === 'consolidado') await loadCurve()
    } catch (e) { toast.error(apiMessage(e, 'Erro ao congelar em lote')) }
    finally { setFreezing(false) }
  }

  const clientes = useMemo(() => Array.from(new Set(rows.map(r => r.customer).filter(Boolean))).sort() as string[], [rows])
  const coords = useMemo(() => Array.from(new Set(rows.flatMap(r => r.coordinators))).sort(), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let out = rows.filter(r =>
      (!q || r.name.toLowerCase().includes(q) || (r.code ?? '').toLowerCase().includes(q) || (r.customer ?? '').toLowerCase().includes(q)) &&
      (!cliente || r.customer === cliente) &&
      (!coord || r.coordinators.includes(coord)) &&
      (!saude || r.health === saude) &&
      (!onlyBaseline || r.has_baseline)
    )
    const dir = sort.dir === 'asc' ? 1 : -1
    out = out.slice().sort((a, b) => {
      let va: number | string, vb: number | string
      switch (sort.key) {
        case 'name': va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break
        case 'customer': va = (a.customer ?? '').toLowerCase(); vb = (b.customer ?? '').toLowerCase(); break
        case 'health': va = HEALTH[a.health].ord; vb = HEALTH[b.health].ord; break
        default: va = (a[sort.key] ?? -1) as number; vb = (b[sort.key] ?? -1) as number
      }
      return va < vb ? -dir : va > vb ? dir : a.name.localeCompare(b.name)
    })
    return out
  }, [rows, search, cliente, coord, saude, onlyBaseline, sort])

  const kpi = useMemo(() => {
    const late = filtered.filter(r => r.health === 'late').length
    const risk = filtered.filter(r => r.health === 'risk').length
    const ok = filtered.filter(r => r.health === 'ok').length
    const spis = filtered.map(r => r.spi).filter((v): v is number => v != null)
    const avgSpi = spis.length ? spis.reduce((a, b) => a + b, 0) / spis.length : null
    return { total: filtered.length, late, risk, ok, avgSpi, semBase: filtered.filter(r => !r.has_baseline).length }
  }, [filtered])

  const toggleSort = (key: SortKey) => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'customer' ? 'asc' : 'desc' })
  const SortH = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide cursor-pointer select-none ${right ? 'text-right' : 'text-left'}`}
      style={{ color: 'var(--text-light)' }} onClick={() => toggleSort(k)}>
      <span className={`inline-flex items-center gap-1 ${right ? 'flex-row-reverse' : ''}`}>
        {children}{sort.key === k && (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </span>
    </th>
  )

  const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5'
  const fieldStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' } as const

  return (
    <AppLayout title="Indicadores de Projetos">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <BarChart3 size={20} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Indicadores de Projetos</h1>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>({filtered.length})</span>
          <div className="ml-auto inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {([['lista', 'Lista', LayoutList], ['consolidado', 'Consolidado', Activity]] as const).map(([v, lbl, Icon]) => (
              <button key={v} onClick={() => setMode(v)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
                style={{ background: mode === v ? 'var(--primary)' : 'transparent', color: mode === v ? 'var(--primary-fg, #fff)' : 'var(--text-muted)' }}>
                <Icon size={14} /> {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          <Kpi label="Projetos" value={String(kpi.total)} tone="var(--text)" sub={kpi.semBase ? `${kpi.semBase} sem linha de base` : 'no filtro'} />
          <Kpi label="No prazo" value={String(kpi.ok)} tone="var(--success)" sub="SPI ok, sem atraso" />
          <Kpi label="Em risco" value={String(kpi.risk)} tone="var(--warning)" sub="atenção" />
          <Kpi label="Atrasados" value={String(kpi.late)} tone="var(--danger)" sub="SPI<0,9 ou ≥20% atraso" />
          <Kpi label="SPI médio" value={fmtIdx(kpi.avgSpi)} tone={idxTone(kpi.avgSpi)} sub="prazo (horas)" />
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
            <input className={`${fieldCls} pl-8 w-56`} style={fieldStyle} placeholder="Buscar projeto/cliente…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className={fieldCls} style={fieldStyle} value={status} onChange={e => setStatus(e.target.value)}>
            {STATUS_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          <select className={fieldCls} style={fieldStyle} value={cliente} onChange={e => setCliente(e.target.value)}>
            <option value="">Cliente (todos)</option>
            {clientes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={fieldCls} style={fieldStyle} value={coord} onChange={e => setCoord(e.target.value)}>
            <option value="">Coordenador (todos)</option>
            {coords.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={fieldCls} style={fieldStyle} value={saude} onChange={e => setSaude(e.target.value as '' | Health)}>
            <option value="">Saúde (todas)</option>
            <option value="late">Atrasado</option>
            <option value="risk">Em risco</option>
            <option value="ok">No prazo</option>
          </select>
          <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer select-none" style={{ color: onlyBaseline ? 'var(--primary)' : 'var(--text-muted)' }}>
            <input type="checkbox" checked={onlyBaseline} onChange={e => setOnlyBaseline(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
            Só com linha de base
          </label>
          <button onClick={freezeMissing} disabled={freezing}
            className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg disabled:opacity-60 ml-auto"
            title="Congela a linha de base dos projetos do filtro que têm cronograma e ainda não têm base">
            <Snowflake size={14} /> {freezing ? 'Congelando…' : 'Congelar base (lote)'}
          </button>
        </div>

        {/* Tabela */}
        {mode === 'lista' && (
        <div className="ds-card overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 900 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <SortH k="name">Projeto</SortH>
                <SortH k="customer">Cliente</SortH>
                <SortH k="pct_real" right>% Real / Plan.</SortH>
                <SortH k="spi" right>SPI</SortH>
                <SortH k="cpi" right>CPI</SortH>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-right" style={{ color: 'var(--text-light)' }}>Atividades</th>
                <SortH k="overdue_pct" right>% Atraso</SortH>
                <SortH k="health">Saúde</SortH>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-sm" style={{ color: 'var(--text-light)' }}>Nenhum projeto no filtro.</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="ds-row-hover cursor-pointer" style={{ borderBottom: '1px solid var(--border)' }}
                  onClick={() => router.push(`/projetos/indicadores/${r.id}`)}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium" style={{ color: 'var(--text)' }}>{r.name}</div>
                    <div className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--text-light)' }}>
                      {r.code && <span>{r.code}</span>}
                      {r.coordinators[0] && <span>· {r.coordinators[0]}{r.coordinators.length > 1 ? ` +${r.coordinators.length - 1}` : ''}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{r.customer ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right">
                    {r.has_baseline ? (
                      <span style={{ color: 'var(--text)' }}>
                        <b style={{ color: (r.pct_real ?? 0) < (r.pct_planned ?? 0) ? 'var(--warning)' : 'var(--success)' }}>{fmtPct(r.pct_real)}</b>
                        <span style={{ color: 'var(--text-light)' }}> / {fmtPct(r.pct_planned)}</span>
                      </span>
                    ) : <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-light)' }}><Snowflake size={11} /> sem base</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold" style={{ color: idxTone(r.spi) }}>
                    <span className="inline-flex items-center gap-1 justify-end">
                      {r.spi != null && (r.spi >= 1 ? <TrendingUp size={13} /> : <TrendingDown size={13} />)}{fmtIdx(r.spi)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold" style={{ color: idxTone(r.cpi) }}>{fmtIdx(r.cpi)}</td>
                  <td className="px-3 py-2.5 text-right" style={{ color: 'var(--text-muted)' }}>
                    {r.done}/{r.deliveries} <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· {fmtH(r.hours_actual)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold" style={{ color: r.overdue_pct >= 20 ? 'var(--danger)' : r.overdue_pct > 0 ? 'var(--warning)' : 'var(--success)' }}>{r.overdue_pct}%</td>
                  <td className="px-3 py-2.5"><span className={`ds-status ${HEALTH[r.health].cls} text-[11px]`}>{HEALTH[r.health].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        {mode === 'consolidado' && <ConsolidatedView filtered={filtered} curve={curve} curveLoading={curveLoading} onOpen={id => router.push(`/projetos/indicadores/${id}`)} />}
        {confirmDialog}
      </div>
    </AppLayout>
  )
}

function ConsolidatedView({ filtered, curve, curveLoading, onOpen }: { filtered: Row[]; curve: CurvePt[]; curveLoading: boolean; onOpen: (id: number) => void }) {
  const withBase = filtered.filter(r => r.has_baseline)
  const sum = (f: (r: Row) => number) => filtered.reduce((a, r) => a + f(r), 0)
  const sumB = (f: (r: Row) => number) => withBase.reduce((a, r) => a + f(r), 0)
  const bac = sumB(r => r.hours_planned)
  const ev = sumB(r => r.hours_ev)
  const ac = sumB(r => r.hours_actual)
  const pv = sumB(r => (r.pct_planned ?? 0) / 100 * r.hours_planned)
  const spi = pv > 0 ? ev / pv : null
  const cpi = ac > 0 ? ev / ac : null
  const pctPlan = bac > 0 ? pv / bac * 100 : null
  const pctReal = bac > 0 ? ev / bac * 100 : null
  const deliveries = sum(r => r.deliveries), done = sum(r => r.done), overdue = sum(r => r.overdue)
  const overduePct = deliveries > 0 ? overdue / deliveries * 100 : 0
  const ok = filtered.filter(r => r.health === 'ok').length
  const risk = filtered.filter(r => r.health === 'risk').length
  const late = filtered.filter(r => r.health === 'late').length

  const chartData = curve.map(p => ({ ...p, label: ddmm(p.date) }))
  const worstSpi = withBase.filter(r => r.spi != null).sort((a, b) => (a.spi as number) - (b.spi as number)).slice(0, 6)
  const mostOverdue = filtered.filter(r => r.overdue > 0).sort((a, b) => b.overdue_pct - a.overdue_pct || b.overdue - a.overdue).slice(0, 6)
  const donut = [
    { name: 'No prazo', value: ok, color: 'var(--success)' },
    { name: 'Em risco', value: risk, color: 'var(--warning)' },
    { name: 'Atrasado', value: late, color: 'var(--danger)' },
  ].filter(d => d.value > 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Kpi label="% Real vs Planejado" value={`${fmtPct(pctReal)} / ${fmtPct(pctPlan)}`} tone={(pctReal ?? 0) < (pctPlan ?? 0) ? 'var(--warning)' : 'var(--success)'} sub="carteira (horas)" />
        <Kpi label="SPI carteira" value={fmtIdx(spi)} tone={idxTone(spi)} sub="prazo · EV/PV" />
        <Kpi label="CPI carteira" value={fmtIdx(cpi)} tone={idxTone(cpi)} sub="esforço · EV/AC" />
        <Kpi label="% Atrasadas" value={`${Math.round(overduePct)}%`} tone={overduePct >= 20 ? 'var(--danger)' : overduePct > 0 ? 'var(--warning)' : 'var(--success)'} sub={`${overdue} de ${deliveries} atividades`} />
      </div>

      <div className="ds-card p-4">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Curva-S consolidada · horas (PV/EV/AC)</span>
          <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{withBase.length} projeto(s) com linha de base</span>
        </div>
        {curveLoading ? (
          <div style={{ height: 260 }} className="flex items-center justify-center text-sm" ><span style={{ color: 'var(--text-light)' }}>Carregando curva…</span></div>
        ) : chartData.length === 0 ? (
          <div style={{ height: 260 }} className="flex items-center justify-center text-sm text-center px-4"><span style={{ color: 'var(--text-light)' }}>Nenhum projeto com linha de base congelada no filtro atual — congele a baseline nos projetos para ver a curva consolidada.</span></div>
        ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-light)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-light)' }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${Math.round(v)}h`} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }} labelStyle={{ color: 'var(--text-muted)' }}
                  formatter={(value, name) => [value == null ? '—' : fmtH(Number(value)), name === 'pv' ? 'Planejado (PV)' : name === 'ev' ? 'Feito (EV)' : 'Apontado (AC)']} />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => v === 'pv' ? 'Planejado (PV)' : v === 'ev' ? 'Feito (EV)' : 'Apontado (AC)'} />
                <Line type="monotone" dataKey="pv" stroke="#8b5cf6" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="ev" stroke="#22c55e" strokeWidth={2} dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="ac" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          <span>BAC <b style={{ color: 'var(--text)' }}>{fmtH(bac)}</b></span>
          <span>EV <b style={{ color: 'var(--text)' }}>{fmtH(ev)}</b></span>
          <span>AC <b style={{ color: 'var(--text)' }}>{fmtH(ac)}</b></span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="ds-card p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Saúde da carteira</span>
          <div style={{ width: '100%', height: 170 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name" innerRadius={42} outerRadius={66} paddingAngle={2}>
                  {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>
            <span><span style={{ color: 'var(--success)' }}>●</span> {ok} no prazo</span>
            <span><span style={{ color: 'var(--warning)' }}>●</span> {risk} risco</span>
            <span><span style={{ color: 'var(--danger)' }}>●</span> {late} atraso</span>
          </div>
        </div>

        <RankCard title="Piores SPI (prazo)" rows={worstSpi} onOpen={onOpen} value={r => fmtIdx(r.spi)} tone={r => idxTone(r.spi)} />
        <RankCard title="Mais atrasadas" rows={mostOverdue} onOpen={onOpen} value={r => `${r.overdue_pct}%`} tone={r => r.overdue_pct >= 20 ? 'var(--danger)' : 'var(--warning)'} />
      </div>
    </div>
  )
}

function RankCard({ title, rows, onOpen, value, tone }: { title: string; rows: Row[]; onOpen: (id: number) => void; value: (r: Row) => string; tone: (r: Row) => string }) {
  return (
    <div className="ds-card p-4">
      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>{title}</span>
      <div className="flex flex-col mt-2">
        {rows.length === 0 ? <span className="text-[12px]" style={{ color: 'var(--text-light)' }}>—</span> : rows.map(r => (
          <button key={r.id} onClick={() => onOpen(r.id)} className="flex items-center justify-between gap-2 py-1.5 text-sm ds-row-hover rounded px-1 text-left">
            <span className="truncate" style={{ color: 'var(--text)' }}>{r.name}</span>
            <span className="font-semibold shrink-0" style={{ color: tone(r) }}>{value(r)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Kpi({ label, value, tone, sub }: { label: string; value: string; tone: string; sub: string }) {
  return (
    <div className="ds-card px-3.5 py-2.5" style={{ borderLeft: `3px solid ${tone}` }}>
      <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>{label}</div>
      <div className="text-2xl font-bold" style={{ color: tone }}>{value}</div>
      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  )
}
