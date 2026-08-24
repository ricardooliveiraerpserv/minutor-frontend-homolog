'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { api, apiMessage } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useConfirm } from '@/components/ui/use-confirm'
import { SearchSelect } from '@/components/ui/search-select'
import { toast } from 'sonner'
import { BarChart3, Search, ChevronUp, ChevronDown, Snowflake, TrendingUp, TrendingDown, FolderKanban, Clock, CheckCircle2, AlertTriangle, CalendarX } from 'lucide-react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts'

/** Indicadores de Projetos — dashboard (estilo prod) + tabela EVM (merge). Somente tipo Projeto. */

type Health = 'ok' | 'risk' | 'late'
type Row = {
  id: number; name: string; code: string | null; status: string
  customer: string | null; coordinators: string[]
  has_baseline: boolean; using_live_plan?: boolean
  pct_planned: number | null; pct_real: number | null; spi: number | null; cpi: number | null
  hours_planned: number; hours_ev: number; hours_actual: number; hours_appointable: number
  deliveries: number; done: number; overdue: number; overdue_pct: number
  health: Health
}

const HEALTH: Record<Health, { label: string; cls: string; ord: number }> = {
  late: { label: 'Atrasado', cls: 'ds-status-danger', ord: 0 },
  risk: { label: 'Em risco', cls: 'ds-status-warning', ord: 1 },
  ok: { label: 'No prazo', cls: 'ds-status-success', ord: 2 },
}

// Status granular do projeto → rótulo + cor (igual ao pipeline / prod).
const STATUS_META: Record<string, { label: string; color: string }> = {
  backlog:              { label: 'Backlog',          color: '#94a3b8' },
  awaiting_start:       { label: 'Backlog',          color: '#94a3b8' },
  planning:             { label: 'Em Planejamento',  color: '#a78bfa' },
  started:              { label: 'Em Andamento',     color: '#60a5fa' },
  liberado_para_testes: { label: 'Em Homologação',   color: '#22d3ee' },
  em_producao:          { label: 'Em Produção',      color: '#14b8a6' },
  paused:               { label: 'Pausado',          color: '#eab308' },
  finished:             { label: 'Encerrado',        color: '#22c55e' },
  cancelled:            { label: 'Cancelado',        color: '#ef4444' },
}
const statusLabel = (s: string) => STATUS_META[s]?.label ?? s
const statusColor = (s: string) => STATUS_META[s]?.color ?? '#94a3b8'

// Chips (ordem prod). Cada chip agrupa 1+ status granulares.
const CHIPS: { key: string; label: string; match: (s: string) => boolean; color: string }[] = [
  { key: 'all',                  label: 'Todos',           match: () => true,                                   color: 'var(--primary)' },
  { key: 'backlog',              label: 'Backlog',         match: s => s === 'backlog' || s === 'awaiting_start', color: '#94a3b8' },
  { key: 'planning',             label: 'Em Planejamento', match: s => s === 'planning',                        color: '#a78bfa' },
  { key: 'started',              label: 'Em Andamento',    match: s => s === 'started',                         color: '#60a5fa' },
  { key: 'liberado_para_testes', label: 'Em Homologação',  match: s => s === 'liberado_para_testes',            color: '#22d3ee' },
  { key: 'em_producao',          label: 'Em Produção',     match: s => s === 'em_producao',                     color: '#14b8a6' },
  { key: 'paused',               label: 'Pausado',         match: s => s === 'paused',                          color: '#eab308' },
  { key: 'finished',             label: 'Encerrado',       match: s => s === 'finished',                        color: '#22c55e' },
  { key: 'cancelled',            label: 'Cancelado',       match: s => s === 'cancelled',                       color: '#ef4444' },
]

const idxTone = (v: number | null) => v == null ? 'var(--text-light)' : v >= 1 ? 'var(--success)' : v >= 0.9 ? 'var(--warning)' : 'var(--danger)'
const fmtIdx = (v: number | null) => v == null ? '—' : v.toFixed(2)
const fmtPct = (v: number | null) => v == null ? '—' : `${Math.round(v)}%`
const fmtH = (v: number) => `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}h`
const deliveryPct = (r: Row) => r.deliveries > 0 ? Math.round(r.done / r.deliveries * 100) : 0

type SortKey = 'name' | 'customer' | 'pct_real' | 'spi' | 'cpi' | 'overdue_pct' | 'health'

export default function PortfolioIndicadoresPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [chip, setChip] = useState('all')
  const [search, setSearch] = useState('')
  const [cliente, setCliente] = useState('')
  const [coord, setCoord] = useState('')
  // "Meus projetos / Todos" — igual à tela Demandas. 'meus' = projetos onde o
  // usuário logado é coordenador (casa pelo nome, mesma fonte do filtro Coordenador).
  const [scope, setScope] = useState<'meus' | 'todos'>('todos')
  const [saude, setSaude] = useState<'' | Health>('')
  const [onlyBaseline, setOnlyBaseline] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'health', dir: 'asc' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ projects: Row[] }>(`/projects-portfolio?status=`) // todos (tipo Projeto)
      setRows(r?.projects ?? [])
    } catch (e) { toast.error(apiMessage(e, 'Erro ao carregar indicadores')) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const { confirm, confirmDialog } = useConfirm()
  const [freezing, setFreezing] = useState(false)
  const freezeMissing = async () => {
    const okc = await confirm({
      title: 'Congelar linha de base em lote',
      message: 'Congelar a linha de base de todos os projetos do filtro atual que têm cronograma e ainda não têm base? Isso habilita o EVM (SPI/CPI) para eles. Projetos já congelados não são alterados.',
      confirmLabel: 'Congelar', cancelLabel: 'Cancelar',
    })
    if (!okc) return
    setFreezing(true)
    try {
      const r = await api.post<{ frozen: number }>(`/projects-portfolio/freeze-missing?status=&search=${encodeURIComponent(search)}`, {})
      toast.success(`${r?.frozen ?? 0} linha(s) de base congelada(s).`)
      await load()
    } catch (e) { toast.error(apiMessage(e, 'Erro ao congelar em lote')) }
    finally { setFreezing(false) }
  }

  const clientes = useMemo(() => Array.from(new Set(rows.map(r => r.customer).filter(Boolean))).sort() as string[], [rows])
  const coords = useMemo(() => Array.from(new Set(rows.flatMap(r => r.coordinators))).sort(), [rows])
  // Só mostra o toggle "Meus projetos" quando o usuário logado é coordenador de algum projeto.
  const myName = (user as { name?: string } | null)?.name ?? ''
  const isCoordOfAny = useMemo(() => !!myName && rows.some(r => r.coordinators.includes(myName)), [rows, myName])

  // base = tudo, exceto o chip (p/ contar os chips dentro dos demais filtros)
  const base = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r =>
      (!q || r.name.toLowerCase().includes(q) || (r.code ?? '').toLowerCase().includes(q) || (r.customer ?? '').toLowerCase().includes(q)) &&
      (!cliente || r.customer === cliente) &&
      (!coord || r.coordinators.includes(coord)) &&
      (scope === 'todos' || (!!myName && r.coordinators.includes(myName))) &&
      (!saude || r.health === saude) &&
      (!onlyBaseline || r.has_baseline)
    )
  }, [rows, search, cliente, coord, scope, myName, saude, onlyBaseline])

  const chipCount = useCallback((key: string) => {
    const c = CHIPS.find(x => x.key === key)!
    return base.filter(r => c.match(r.status)).length
  }, [base])

  const filtered = useMemo(() => {
    const c = CHIPS.find(x => x.key === chip) ?? CHIPS[0]
    let out = base.filter(r => c.match(r.status))
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
  }, [base, chip, sort])

  // ── Dashboard (a partir do que está filtrado) ──
  const dash = useMemo(() => {
    const total = filtered.length
    const cnt = (s: string) => filtered.filter(r => r.status === s).length
    const criticos = filtered.filter(r => r.health === 'late').length
    const prazoVencido = filtered.filter(r => r.overdue > 0).length

    // Status donut (agrupado por rótulo)
    const byLabel = new Map<string, { value: number; color: string }>()
    filtered.forEach(r => {
      const lbl = statusLabel(r.status); const col = statusColor(r.status)
      const cur = byLabel.get(lbl) ?? { value: 0, color: col }
      cur.value += 1; byLabel.set(lbl, cur)
    })
    const statusDonut = Array.from(byLabel.entries()).map(([name, v]) => ({ name, value: v.value, color: v.color })).sort((a, b) => b.value - a.value)

    // Criticidade donut (saúde)
    const ok = filtered.filter(r => r.health === 'ok').length
    const risk = filtered.filter(r => r.health === 'risk').length
    const late = filtered.filter(r => r.health === 'late').length
    const critDonut = [
      { name: 'Saudável', value: ok, color: 'var(--success)' },
      { name: 'Atenção', value: risk, color: 'var(--warning)' },
      { name: 'Crítico', value: late, color: 'var(--danger)' },
    ].filter(d => d.value > 0)

    // Percentual de entrega (buckets)
    const buckets = [
      { label: '0%', color: '#94a3b8', test: (p: number) => p === 0 },
      { label: '1–25%', color: '#f59e0b', test: (p: number) => p >= 1 && p <= 25 },
      { label: '26–50%', color: '#eab308', test: (p: number) => p >= 26 && p <= 50 },
      { label: '51–75%', color: '#60a5fa', test: (p: number) => p >= 51 && p <= 75 },
      { label: '76–99%', color: '#22d3ee', test: (p: number) => p >= 76 && p <= 99 },
      { label: '100%', color: '#22c55e', test: (p: number) => p >= 100 },
    ]
    const pcts = filtered.map(deliveryPct)
    const deliveryBars = buckets.map(b => ({ label: b.label, color: b.color, value: pcts.filter(b.test).length }))
    const avgDelivery = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0

    return { total, emAndamento: cnt('started'), emHomologacao: cnt('liberado_para_testes'), emProducao: cnt('em_producao'), criticos, prazoVencido, statusDonut, critDonut, ok, risk, late, deliveryBars, avgDelivery }
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

  const tt = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }

  return (
    <AppLayout title="Indicadores de Projetos">
      <div className="flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
            <BarChart3 size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Indicadores de Projetos</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Visão em dashboards de Demandas e Projetos</p>
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
            {/* "Meus projetos / Todos" — só p/ quem é coordenador de algum projeto */}
            {isCoordOfAny && (
              <div className="inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {(['meus', 'todos'] as const).map(opt => {
                  const active = scope === opt
                  return (
                    <button key={opt} onClick={() => setScope(opt)}
                      className="px-3 py-1.5 text-xs font-semibold transition-colors"
                      style={{
                        background: active ? 'var(--primary)' : 'var(--surface)',
                        color: active ? 'var(--primary-fg)' : 'var(--text-muted)',
                        borderRight: opt === 'meus' ? '1px solid var(--border)' : undefined,
                      }}>
                      {opt === 'meus' ? 'Meus projetos' : 'Todos'}
                    </button>
                  )
                })}
              </div>
            )}
            <div style={{ minWidth: 220 }}>
              <SearchSelect value={cliente} onChange={setCliente} options={clientes.map(c => ({ id: c, name: c }))} placeholder="Todos os clientes" fullWidth />
            </div>
          </div>
        </div>

        {/* Chips de status */}
        <div className="flex items-center gap-2 flex-wrap">
          {CHIPS.map(c => {
            const active = chip === c.key
            const n = chipCount(c.key)
            return (
              <button key={c.key} onClick={() => setChip(c.key)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                style={{ background: active ? c.color : 'var(--surface)', color: active ? '#fff' : 'var(--text)', border: `1px solid ${active ? c.color : 'var(--border)'}` }}>
                {c.key !== 'all' && <span className="w-2 h-2 rounded-full" style={{ background: active ? '#fff' : c.color }} />}
                {c.label} <span style={{ opacity: 0.85 }}>({n})</span>
              </button>
            )
          })}
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <StatCard icon={<FolderKanban size={18} />} label="Total de Projetos" value={dash.total} tone="var(--text)" bg="var(--surface-hover)" />
          <StatCard icon={<Clock size={18} />} label="Em Andamento" value={dash.emAndamento} tone="#2563eb" bg="rgba(96,165,250,0.15)" />
          <StatCard icon={<TrendingUp size={18} />} label="Em Homologação" value={dash.emHomologacao} tone="#0891b2" bg="rgba(34,211,238,0.15)" />
          <StatCard icon={<CheckCircle2 size={18} />} label="Em Produção" value={dash.emProducao} tone="#0d9488" bg="rgba(20,184,166,0.15)" />
          <StatCard icon={<AlertTriangle size={18} />} label="Críticos" value={dash.criticos} tone="var(--danger)" bg="var(--danger-bg)" />
          <StatCard icon={<CalendarX size={18} />} label="Prazo Vencido" value={dash.prazoVencido} tone="var(--warning)" bg="var(--warning-bg)" />
        </div>

        {/* 3 gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Status dos Projetos */}
          <div className="ds-card p-4">
            <div className="font-semibold" style={{ color: 'var(--text)' }}>Status dos Projetos</div>
            <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>{dash.total} projeto(s)</div>
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={dash.statusDonut} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} paddingAngle={2} stroke="none">
                    {dash.statusDonut.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tt} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {dash.statusDonut.map(d => (
                <span key={d.name} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} /><span className="flex-1 truncate">{d.name}</span><b style={{ color: 'var(--text)' }}>{d.value}</b></span>
              ))}
            </div>
          </div>

          {/* Criticidade dos Projetos */}
          <div className="ds-card p-4">
            <div className="font-semibold" style={{ color: 'var(--text)' }}>Criticidade dos Projetos</div>
            <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Por saúde do projeto</div>
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={dash.critDonut} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} paddingAngle={2} stroke="none">
                    {dash.critDonut.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tt} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-around text-center">
              <div><div className="text-xl font-bold" style={{ color: 'var(--success)' }}>{dash.ok}</div><div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Saudável</div></div>
              <div><div className="text-xl font-bold" style={{ color: 'var(--warning)' }}>{dash.risk}</div><div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Atenção</div></div>
              <div><div className="text-xl font-bold" style={{ color: 'var(--danger)' }}>{dash.late}</div><div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Crítico</div></div>
            </div>
          </div>

          {/* Percentual de Entrega */}
          <div className="ds-card p-4">
            <div className="font-semibold" style={{ color: 'var(--text)' }}>Percentual de Entrega</div>
            <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Média: {dash.avgDelivery}%</div>
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer>
                <BarChart data={dash.deliveryBars} margin={{ top: 18, right: 8, bottom: 0, left: -18 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-light)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-light)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tt} cursor={{ fill: 'rgba(125,125,125,0.08)' }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {dash.deliveryBars.map((b, i) => <Cell key={i} fill={b.color} />)}
                    <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Filtros da tabela */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
            <input className={`${fieldCls} pl-8 w-56`} style={fieldStyle} placeholder="Buscar projeto/cliente…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
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

        {/* Tabela EVM (indicadores do homolog) */}
        <div className="ds-card overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 980 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <SortH k="name">Projeto</SortH>
                <SortH k="customer">Cliente</SortH>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-left" style={{ color: 'var(--text-light)' }}>Status</th>
                <SortH k="pct_real" right>% Real / Plan.</SortH>
                <SortH k="spi" right>SPI</SortH>
                <SortH k="cpi" right>CPI</SortH>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-right" style={{ color: 'var(--text-light)' }}>Atividades</th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-right" style={{ color: 'var(--text-light)' }}>Apontáveis</th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-right" style={{ color: 'var(--text-light)' }}>Apontadas</th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-right" style={{ color: 'var(--text-light)' }}>Saldo</th>
                <SortH k="overdue_pct" right>% Atraso</SortH>
                <SortH k="health">Saúde</SortH>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="px-3 py-8 text-center text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="px-3 py-8 text-center text-sm" style={{ color: 'var(--text-light)' }}>Nenhum projeto no filtro.</td></tr>
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
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: statusColor(r.status) }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: statusColor(r.status) }} />{statusLabel(r.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {(r.pct_real != null || r.pct_planned != null) ? (
                      <span style={{ color: 'var(--text)' }} title={r.using_live_plan ? 'Estimado pelo plano atual (sem linha de base congelada)' : undefined}>
                        {r.using_live_plan && <span style={{ color: 'var(--text-light)' }} title="estimado">≈ </span>}
                        <b style={{ color: (r.pct_real ?? 0) < (r.pct_planned ?? 0) ? 'var(--warning)' : 'var(--success)' }}>{fmtPct(r.pct_real)}</b>
                        <span style={{ color: 'var(--text-light)' }}> / {fmtPct(r.pct_planned)}</span>
                      </span>
                    ) : <span style={{ color: 'var(--text-light)' }}>—</span>}
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
                  <td className="px-3 py-2.5 text-right" style={{ color: 'var(--text-muted)' }}>{fmtH(r.hours_appointable)}</td>
                  <td className="px-3 py-2.5 text-right" style={{ color: 'var(--text-muted)' }}>{fmtH(r.hours_actual)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold" style={{ color: (r.hours_appointable - r.hours_actual) < 0 ? 'var(--danger)' : 'var(--text)' }}>{fmtH(r.hours_appointable - r.hours_actual)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold" style={{ color: r.overdue_pct >= 20 ? 'var(--danger)' : r.overdue_pct > 0 ? 'var(--warning)' : 'var(--success)' }}>{r.overdue_pct}%</td>
                  <td className="px-3 py-2.5"><span className={`ds-status ${HEALTH[r.health].cls} text-[11px]`}>{HEALTH[r.health].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {confirmDialog}
      </div>
    </AppLayout>
  )
}

function StatCard({ icon, label, value, tone, bg }: { icon: React.ReactNode; label: string; value: number; tone: string; bg: string }) {
  return (
    <div className="ds-card px-3.5 py-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg, color: tone }}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide truncate" style={{ color: 'var(--text-light)' }}>{label}</div>
        <div className="text-2xl font-bold leading-none mt-0.5" style={{ color: 'var(--text)' }}>{value}</div>
      </div>
    </div>
  )
}
