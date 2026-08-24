'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Prosight · Licenciamento — uso do sistema por período.
// Leitura executiva: KPIs → gráficos → detalhamento por módulo → customizações.
// Preserva a capacidade real: De/Até + 30/60/90d, barras de módulos, donut de
// perfis, atividade 24h, tabela de módulos, seção de customizações (KPIs + tabela
// ordenável + busca + filtro all/used/unused). 100% fixtures via datasource.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3, RefreshCw, XCircle, CalendarRange, Search,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LabelList,
} from 'recharts'
import {
  Badge, Button, Card, EmptyState, PageHeader, Skeleton, SkeletonTable,
  Table, Tbody, Td, Th, Thead, Tr,
} from '@/components/ds'
import { getProsightDataSource, prosightDataMode } from '@/lib/prosight/datasource'
import { useActiveCompany } from '@/hooks/use-active-company'
import type { LicensingData, CustomRow, LicensingCustomsOk } from '@/lib/prosight/types'
import {
  fmtDate, fmtYmd, inputToPt, toInputVal, addDays, CHART_PALETTE, CHART_TOOLTIP_STYLE,
} from './shared'

type CustomsSort = { col: 'programa' | 'execucoes' | 'usuariosUnicos' | 'ultimaExecucao'; dir: 1 | -1 }
type State = 'loading' | 'error' | 'empty' | 'ok'

// autoLoadCustoms é usado SOMENTE pelo harness dev-only /prosight/preview (screenshot
// da seção de customizações carregada). Em produção a seção é sob demanda (botão).
export function LicenciamentoView({ autoLoadCustoms = false, previewCompanyId = null }: { autoLoadCustoms?: boolean; previewCompanyId?: number | null }) {
  const ds = getProsightDataSource()
  // Empresa ATIVA do Minutor (mesma do Inventário); previewCompanyId só p/ o harness dev.
  const { active } = useActiveCompany()
  const companyId = active?.id ?? previewCompanyId ?? null
  const companyName = active?.name ?? active?.slug ?? (previewCompanyId != null ? `Empresa #${previewCompanyId}` : null)
  const [dtIni, setDtIni] = useState('')
  const [dtFim, setDtFim] = useState('')
  const [state, setState] = useState<State>('loading')
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<LicensingData | null>(null)

  // Defaults no cliente (evita mismatch de SSR): últimos 15 dias.
  useEffect(() => {
    const hoje = new Date()
    setDtIni(toInputVal(addDays(hoje, -15)))
    setDtFim(toInputVal(hoje))
  }, [])

  const load = useCallback(async (ini: string, fim: string) => {
    if (!ini || !fim) return
    setState('loading')
    setError(null)
    try {
      const res = await ds.getLicensingData(companyId, inputToPt(ini), inputToPt(fim))
      if ('ok' in res) { setError(res.error); setState('error'); return }
      if ('vazio' in res) { setState('empty'); return }
      setData(res.data)
      setState('ok')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar o licenciamento.')
      setState('error')
    }
  }, [ds, companyId])

  useEffect(() => { if (dtIni && dtFim) void load(dtIni, dtFim) }, [dtIni, dtFim, load])

  const setRange = (days: number) => {
    const hoje = new Date()
    setDtIni(toInputVal(addDays(hoje, -days)))
    setDtFim(toInputVal(hoje))
  }

  return (
    <>
      <PageHeader
        icon={BarChart3}
        title="Licenciamento"
        subtitle={
          `${data
            ? `${data.totalEventos.toLocaleString('pt-BR')} eventos de ${fmtDate(data.periodo.inicio)} a ${fmtDate(data.periodo.fim)}`
            : 'Uso do sistema por período — eventos, usuários e módulos.'}${companyName ? ` · Empresa: ${companyName}` : ''}`
        }
        actions={
          <Button variant="primary" icon={RefreshCw} loading={state === 'loading'} onClick={() => void load(dtIni, dtFim)}>
            Atualizar
          </Button>
        }
      />

      {prosightDataMode() === 'fixture' && (
        <div className="mb-4 flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs"
          style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
          <CalendarRange size={14} />
          Dados de demonstração (fixtures) — o período selecionado não afeta os números nesta fase.
        </div>
      )}

      {/* Filtro de período */}
      <Card className="mb-4" padding="sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>De</span>
            <input type="date" value={dtIni} onChange={(e) => setDtIni(e.target.value)}
              className="rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Até</span>
            <input type="date" value={dtFim} onChange={(e) => setDtFim(e.target.value)}
              className="rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </label>
          <div className="flex items-center gap-1.5">
            {[30, 60, 90].map((d) => (
              <Button key={d} variant="secondary" size="sm" onClick={() => setRange(d)}>Últimos {d}d</Button>
            ))}
          </div>
          <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>Períodos maiores podem demorar na conexão real.</span>
        </div>
      </Card>

      {state === 'loading' ? (
        <LicenciamentoLoading />
      ) : state === 'error' ? (
        <Card>
          <EmptyState icon={XCircle} title="Não foi possível carregar" description={error ?? ''}
            action={<Button variant="primary" icon={RefreshCw} onClick={() => void load(dtIni, dtFim)}>Tentar novamente</Button>} />
        </Card>
      ) : state === 'empty' ? (
        <Card>
          <EmptyState icon={CalendarRange} title="Nenhum dado no período"
            description="Não há eventos de licenciamento no intervalo selecionado. Amplie as datas." />
        </Card>
      ) : data ? (
        <>
          <KpiRow data={data} />
          <ChartsGrid data={data} />
          <ModulosTable data={data} />
          <CustomsSection ds={ds} companyId={companyId} dtIni={dtIni} dtFim={dtFim} autoLoad={autoLoadCustoms} />
        </>
      ) : null}
    </>
  )
}

function KpiRow({ data }: { data: LicensingData }) {
  const kpis = [
    { label: 'Período', value: `${data.periodo.dias}d`, sub: `${fmtDate(data.periodo.inicio)} — ${fmtDate(data.periodo.fim)}`, color: 'var(--primary)' },
    { label: 'Total Eventos', value: data.totalEventos.toLocaleString('pt-BR'), sub: 'acessos registrados', color: 'var(--purple)' },
    { label: 'Usuários', value: String(data.totalUsuarios), sub: 'ativos no período', color: 'var(--success)' },
    { label: 'Pico Simultâneo', value: String(data.picoGlobal.valor), sub: fmtDate(data.picoGlobal.horario), color: 'var(--warning)' },
    { label: 'Média / Dia', value: String(data.mediaDia), sub: 'usuários por dia', color: 'var(--info)' },
    { label: 'Hora de Pico', value: `${String(data.horaPico).padStart(2, '0')}h`, sub: 'maior atividade', color: 'var(--primary)' },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
      {kpis.map((k) => (
        <div key={k.label} className="rounded-xl px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{k.label}</div>
          <div className="text-2xl font-bold mt-0.5" style={{ color: k.color }}>{k.value}</div>
          <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-light)' }}>{k.sub}</div>
        </div>
      ))}
    </div>
  )
}

function ChartsGrid({ data }: { data: LicensingData }) {
  const top = data.modulos.filter((m) => m.sigla !== 'CFG').slice(0, 8)
  const modBars = top.map((m, i) => ({ sigla: m.sigla, nome: m.nome, eventos: m.eventos, color: CHART_PALETTE[i % CHART_PALETTE.length] }))

  const perfil = [
    { label: 'Full (2+ módulos)', value: data.perfis.full, color: 'var(--purple)' },
    { label: 'Light (1 módulo)', value: data.perfis.light, color: 'var(--primary)' },
    { label: 'Adm / Config', value: data.perfis.cfgOnly, color: 'var(--warning)' },
  ]
  const totalPerfil = perfil.reduce((s, p) => s + p.value, 0)

  const horas = data.atividadePorHora.map((v, h) => ({ hora: `${String(h).padStart(2, '0')}h`, value: v }))
  const maxHora = Math.max(...data.atividadePorHora, 1)

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        {/* Módulos por volume */}
        <Card padding="sm">
          <div className="font-semibold" style={{ color: 'var(--text)' }}>Volume de acessos por módulo</div>
          <div className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>Top {top.length} módulos (sem Configurador)</div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={modBars} margin={{ top: 12, right: 8, bottom: 0, left: -14 }}>
                <XAxis dataKey="sigla" tick={{ fontSize: 11, fill: 'var(--text-light)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-light)' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'var(--surface-hover)' }}
                  labelFormatter={(l) => modBars.find((m) => m.sigla === l)?.nome ?? l} />
                <Bar dataKey="eventos" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                  {modBars.map((m) => <Cell key={m.sigla} fill={m.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Perfil de usuários */}
        <Card padding="sm">
          <div className="font-semibold" style={{ color: 'var(--text)' }}>Perfil de usuários</div>
          <div className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>{totalPerfil} usuários no período</div>
          <div className="flex items-center gap-4">
            <div style={{ width: 160, height: 160 }} className="shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={perfil} dataKey="value" nameKey="label" innerRadius={46} outerRadius={76} paddingAngle={2} stroke="none" isAnimationActive={false}>
                    {perfil.map((p) => <Cell key={p.label} fill={p.color} />)}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 flex flex-col gap-2">
              {perfil.map((p) => {
                const pct = totalPerfil ? Math.round((p.value / totalPerfil) * 100) : 0
                return (
                  <div key={p.label} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                    <span className="flex-1 text-sm" style={{ color: 'var(--text-muted)' }}>{p.label}</span>
                    <b className="text-sm" style={{ color: 'var(--text)' }}>{p.value}</b>
                    <span className="text-xs w-10 text-right" style={{ color: 'var(--text-light)' }}>{pct}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </Card>
      </div>

      {/* Atividade por hora */}
      <Card padding="sm" className="mb-4">
        <div className="font-semibold" style={{ color: 'var(--text)' }}>Atividade por hora do dia</div>
        <div className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>Usuários únicos por faixa horária</div>
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={horas} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <XAxis dataKey="hora" tick={{ fontSize: 9, fill: 'var(--text-light)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} interval={1} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-light)' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'var(--surface-hover)' }} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {horas.map((h) => {
                  const ratio = h.value / maxHora
                  const color = ratio > 0.7 ? 'var(--warning)' : ratio > 0.4 ? 'var(--primary)' : 'var(--info)'
                  return <Cell key={h.hora} fill={color} fillOpacity={ratio > 0.4 ? 1 : 0.55} />
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </>
  )
}

function ModulosTable({ data }: { data: LicensingData }) {
  const mods = data.modulos.filter((m) => m.sigla !== 'CFG')
  const maxEv = Math.max(...mods.map((m) => m.eventos), 1)
  return (
    <Card padding="none" className="mb-8">
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="font-semibold" style={{ color: 'var(--text)' }}>Detalhamento por módulo</div>
      </div>
      <Table>
        <Thead>
          <Tr><Th>Módulo</Th><Th right>Eventos</Th><Th right>Usuários Únicos</Th><Th right>Pico Simultâneo</Th><Th>Distribuição</Th></Tr>
        </Thead>
        <Tbody>
          {mods.map((m) => (
            <Tr key={m.sigla}>
              <Td>
                <span className="font-semibold" style={{ color: 'var(--text)' }}>{m.sigla}</span>
                <span className="text-xs ml-2" style={{ color: 'var(--text-light)' }}>{m.nome}</span>
              </Td>
              <Td right>{m.eventos.toLocaleString('pt-BR')}</Td>
              <Td right>{m.usuariosUnicos}</Td>
              <Td right>{m.pico15min}</Td>
              <Td>
                <div className="h-2 rounded-full" style={{ width: `${Math.max(4, Math.round((m.eventos / maxEv) * 100))}%`, background: 'var(--primary)' }} />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Card>
  )
}

// ── Customizações ─────────────────────────────────────────────────────────────
function CustomsSection({ ds, companyId, dtIni, dtFim, autoLoad = false }: { ds: ReturnType<typeof getProsightDataSource>; companyId: number | null; dtIni: string; dtFim: string; autoLoad?: boolean }) {
  const [loaded, setLoaded] = useState<LicensingCustomsOk | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'used' | 'unused'>('all')
  const [sort, setSort] = useState<CustomsSort>({ col: 'execucoes', dir: -1 })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await ds.getLicensingCustoms(companyId, inputToPt(dtIni), inputToPt(dtFim))
      if ('ok' in res) { setError(res.error); return }
      setLoaded(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar customizações.')
    } finally {
      setLoading(false)
    }
  }, [ds, companyId, dtIni, dtFim])

  // Dev-only: o harness /prosight/preview auto-carrega as customizações p/ screenshot.
  useEffect(() => { if (autoLoad && dtIni && dtFim && !loaded) void load() }, [autoLoad, dtIni, dtFim, loaded, load])

  const rows = useMemo(() => {
    if (!loaded) return []
    let list = loaded.itens.filter((r: CustomRow) => {
      if (filter === 'used' && r.execucoes === 0) return false
      if (filter === 'unused' && r.execucoes > 0) return false
      if (q && !r.programa.toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
    list = [...list].sort((a, b) => {
      const va = a[sort.col] ?? ''
      const vb = b[sort.col] ?? ''
      if (va < vb) return sort.dir
      if (va > vb) return -sort.dir
      return 0
    })
    return list
  }, [loaded, filter, q, sort])

  const toggleSort = (col: CustomsSort['col']) =>
    setSort((s) => (s.col === col ? { col, dir: (s.dir * -1) as 1 | -1 } : { col, dir: -1 }))

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Utilização de customizações</h2>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Fontes com funções U_ cruzadas com execuções do período.</div>
        </div>
        <Button variant="primary" icon={RefreshCw} loading={loading} onClick={() => void load()}>
          {loaded ? 'Recarregar' : 'Carregar customizações'}
        </Button>
      </div>

      {error ? (
        <Card>
          <EmptyState icon={XCircle} title="Não foi possível carregar as customizações" description={error}
            action={<Button variant="primary" onClick={() => void load()}>Tentar novamente</Button>} />
        </Card>
      ) : !loaded ? (
        <Card>
          <EmptyState icon={Search} title="Customizações não carregadas"
            description="Clique em “Carregar customizações” para cruzar as fontes U_ com as execuções do período." />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Total Customizações', value: loaded.total, sub: 'fontes no RPO', color: 'var(--purple)' },
              { label: 'Com Uso no Período', value: loaded.comUso, sub: 'executadas ≥ 1x', color: 'var(--success)' },
              { label: 'Sem Uso no Período', value: loaded.semUso, sub: 'nenhuma execução', color: 'var(--warning)' },
            ].map((k) => (
              <div key={k.label} className="rounded-xl px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{k.label}</div>
                <div className="text-2xl font-bold mt-0.5" style={{ color: k.color }}>{k.value}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>{k.sub}</div>
              </div>
            ))}
          </div>

          <Card padding="none">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="font-semibold" style={{ color: 'var(--text)' }}>Fontes por execuções no período</div>
              <div className="relative sm:ml-auto sm:w-56">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filtrar fonte…"
                  className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <div className="inline-flex overflow-hidden rounded-lg text-sm" style={{ border: '1px solid var(--border)' }}>
                {(['all', 'used', 'unused'] as const).map((f, i) => (
                  <button key={f} onClick={() => setFilter(f)}
                    className="px-3 py-2 font-medium"
                    style={{
                      background: filter === f ? 'var(--primary)' : 'transparent',
                      color: filter === f ? 'var(--primary-fg)' : 'var(--text-muted)',
                      borderLeft: i > 0 ? '1px solid var(--border)' : undefined,
                    }}>
                    {f === 'all' ? 'Todos' : f === 'used' ? 'Com uso' : 'Sem uso'}
                  </button>
                ))}
              </div>
            </div>

            {rows.length === 0 ? (
              <EmptyState icon={Search} title="Nenhuma fonte para este filtro" description={q ? `Nada encontrado para "${q}".` : 'Ajuste o filtro.'} />
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th sortable active={sort.col === 'programa'} dir={sort.dir === 1 ? 'asc' : 'desc'} onClick={() => toggleSort('programa')}>Fonte</Th>
                    <Th sortable active={sort.col === 'execucoes'} dir={sort.dir === 1 ? 'asc' : 'desc'} onClick={() => toggleSort('execucoes')} right>Execuções</Th>
                    <Th sortable active={sort.col === 'usuariosUnicos'} dir={sort.dir === 1 ? 'asc' : 'desc'} onClick={() => toggleSort('usuariosUnicos')} right>Usuários</Th>
                    <Th sortable active={sort.col === 'ultimaExecucao'} dir={sort.dir === 1 ? 'asc' : 'desc'} onClick={() => toggleSort('ultimaExecucao')}>Última Execução</Th>
                    <Th>Tipo</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {rows.map((r) => (
                    <Tr key={r.programa}>
                      <Td mono>{r.programa}</Td>
                      <Td right>
                        {r.execucoes > 0
                          ? <span className="font-semibold" style={{ color: 'var(--success)' }}>{r.execucoes.toLocaleString('pt-BR')}</span>
                          : <span style={{ color: 'var(--text-light)' }}>0</span>}
                      </Td>
                      <Td right>{r.usuariosUnicos || 0}</Td>
                      <Td mono>{r.ultimaExecucao ? fmtYmd(r.ultimaExecucao) : '—'}</Td>
                      <Td><Badge variant={r.tipo === 'PARTNER' ? 'warning' : 'purple'}>{r.tipo}</Badge></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
            <div className="px-5 py-3 text-xs" style={{ color: 'var(--text-light)' }}>{rows.length} fonte(s) exibida(s)</div>
          </Card>
        </>
      )}
    </div>
  )
}

function LicenciamentoLoading() {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[82px] rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        <Skeleton className="h-[260px] rounded-2xl" /><Skeleton className="h-[260px] rounded-2xl" />
      </div>
      <Skeleton className="h-[240px] rounded-2xl mb-4" />
      <SkeletonTable rows={6} cols={5} />
      <div className="mt-2"><Skeleton className="h-4 w-40" /></div>
    </>
  )
}
