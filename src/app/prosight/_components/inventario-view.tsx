'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Prosight · Inventário — tela principal (maior atenção de UX).
// Leitura executiva primeiro (saúde + KPIs + distribuição), detalhe operacional
// depois (tabela). Clicar em KPI / fatia do donut FILTRA a MESMA tabela na mesma
// tela (drill-down). Busca instantânea (client-side), filtros e ordenação.
// 100% fixtures via datasource — a UI não sabe se é fixture ou live.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  GitBranch, RefreshCw, Search, XCircle, PackageOpen, Download, ServerCog,
} from 'lucide-react'
import { toast } from 'sonner'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import {
  Badge, Button, Card, EmptyState, PageHeader, Skeleton, SkeletonTable,
  Table, Tbody, Td, Th, Thead, Tr,
} from '@/components/ds'
import { getProsightDataSource, prosightDataMode } from '@/lib/prosight/datasource'
import type {
  InventoryScanOk, InventoryStatus, InventoryResultRow,
} from '@/lib/prosight/types'
import {
  STATUS_META, STATUS_ORDER, HEALTH_META, fmtDateTime, fmtDiff, CHART_TOOLTIP_STYLE,
} from './shared'

type Filter = 'all' | 'rest_api' | InventoryStatus
type SortKey = 'program' | 'diskDate' | 'rpoDate' | 'diff' | 'rpoType' | 'status'

const FILTER_TITLES: Record<Filter, string> = {
  all: 'Todos os fontes',
  rest_api: 'APIs REST',
  sincronizado: STATUS_META.sincronizado.label,
  recompilar: STATUS_META.recompilar.label,
  verificar_rpo: STATUS_META.verificar_rpo.label,
  nao_compilado: STATUS_META.nao_compilado.label,
  so_rpo: STATUS_META.so_rpo.label,
}

// initialFilter/initialQuery são usados SOMENTE pelo harness dev-only /prosight/preview
// (para capturar os estados de drill-down / busca / filtro-sem-resultado). Em produção
// as telas começam sempre em 'all' / '' e o usuário interage normalmente.
export function InventarioView({ initialFilter = 'all', initialQuery = '' }: { initialFilter?: Filter; initialQuery?: string }) {
  const [scan, setScan] = useState<InventoryScanOk | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rescanning, setRescanning] = useState(false)

  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [q, setQ] = useState(initialQuery)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'program', dir: 'asc' })
  const tableRef = useRef<HTMLDivElement>(null)

  const ds = getProsightDataSource()

  const load = useCallback(async (isRescan = false) => {
    if (isRescan) setRescanning(true)
    else setLoading(true)
    setError(null)
    try {
      const res = await ds.scanInventory()
      if ('ok' in res && res.ok === false) {
        setError(res.error)
        setScan(null)
      } else {
        setScan(res as InventoryScanOk)
        if (isRescan) toast.success(`Scan concluído — ${(res as InventoryScanOk).summary.total} fontes analisados`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro inesperado ao varrer o inventário.')
      setScan(null)
    } finally {
      setLoading(false)
      setRescanning(false)
    }
  }, [ds])

  useEffect(() => { void load(false) }, [load])

  // ── Drill-down: KPI / donut → filtra a MESMA tabela; rola até ela.
  const drillTo = useCallback((f: Filter) => {
    setFilter(f)
    setQ('')
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40)
  }, [])

  const rows = scan?.results ?? []

  const filtered = useMemo(() => {
    let list = rows.filter((r) => {
      if (filter === 'rest_api') return r.isRestApi
      if (filter !== 'all') return r.status === filter
      return true
    })
    const term = q.trim().toLowerCase()
    if (term) list = list.filter((r) => r.program.toLowerCase().includes(term))
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      let va: number | string
      let vb: number | string
      if (sort.key === 'diff') {
        va = a.diskDate && a.rpoDate ? new Date(a.diskDate).getTime() - new Date(a.rpoDate).getTime() : -Infinity
        vb = b.diskDate && b.rpoDate ? new Date(b.diskDate).getTime() - new Date(b.rpoDate).getTime() : -Infinity
      } else if (sort.key === 'diskDate' || sort.key === 'rpoDate') {
        va = a[sort.key] ? new Date(a[sort.key] as string).getTime() : -Infinity
        vb = b[sort.key] ? new Date(b[sort.key] as string).getTime() : -Infinity
      } else {
        va = (a[sort.key] ?? '') as string
        vb = (b[sort.key] ?? '') as string
      }
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return 0
    })
  }, [rows, filter, q, sort])

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  const summary = scan?.summary
  const isEmpty = !loading && !error && summary && summary.total === 0

  // Donut de distribuição (recharts) — fatias clicáveis (drill-down).
  const donutData = useMemo(() => {
    if (!summary) return []
    return STATUS_ORDER
      .map((k) => ({ key: k, name: STATUS_META[k].label, value: summary.counts[k], color: STATUS_META[k].color }))
      .filter((d) => d.value > 0)
  }, [summary])

  const health = summary ? HEALTH_META[summary.healthLabel] : null
  const gaugeData = summary
    ? [{ name: 'ok', value: summary.healthPct }, { name: 'rest', value: 100 - summary.healthPct }]
    : []

  const kpis: { key: Filter; label: string; value: number; sub: string; color: string }[] = summary
    ? [
        { key: 'all', label: 'Total de fontes', value: summary.total, sub: 'disco + RPO', color: 'var(--text)' },
        { key: 'sincronizado', label: STATUS_META.sincronizado.label, value: summary.counts.sincronizado, sub: STATUS_META.sincronizado.sub, color: STATUS_META.sincronizado.color },
        { key: 'recompilar', label: STATUS_META.recompilar.label, value: summary.counts.recompilar, sub: STATUS_META.recompilar.sub, color: STATUS_META.recompilar.color },
        { key: 'verificar_rpo', label: STATUS_META.verificar_rpo.label, value: summary.counts.verificar_rpo, sub: STATUS_META.verificar_rpo.sub, color: STATUS_META.verificar_rpo.color },
        { key: 'nao_compilado', label: STATUS_META.nao_compilado.label, value: summary.counts.nao_compilado, sub: STATUS_META.nao_compilado.sub, color: STATUS_META.nao_compilado.color },
        { key: 'so_rpo', label: STATUS_META.so_rpo.label, value: summary.counts.so_rpo, sub: STATUS_META.so_rpo.sub, color: STATUS_META.so_rpo.color },
        { key: 'rest_api', label: 'APIs REST', value: summary.restApiCount, sub: 'programas', color: 'var(--info)' },
      ]
    : []

  return (
    <>
      <PageHeader
        icon={GitBranch}
        title="Inventário"
        subtitle={
          scan
            ? `Fonte: API AdvPL · Último scan ${fmtDateTime(scan.scannedAt)}`
            : 'Comparação disco (Git) × RPO — saúde e situação dos fontes.'
        }
        actions={
          <Button variant="primary" icon={RefreshCw} loading={rescanning} onClick={() => void load(true)} disabled={loading}>
            Atualizar scan
          </Button>
        }
      />

      {prosightDataMode() === 'fixture' && (
        <div className="mb-4 flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs"
          style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
          <ServerCog size={14} />
          Dados de demonstração (fixtures) — Prosight ainda não conectado à infraestrutura real.
        </div>
      )}

      {loading ? (
        <InventarioLoading />
      ) : error ? (
        <Card>
          <EmptyState
            icon={XCircle}
            title="Não foi possível executar o scan"
            description={error}
            action={<Button variant="primary" icon={RefreshCw} onClick={() => void load(false)}>Tentar novamente</Button>}
          />
        </Card>
      ) : isEmpty ? (
        <Card>
          <EmptyState
            icon={PackageOpen}
            title="Nenhum fonte encontrado"
            description="O scan não encontrou fontes no disco nem no RPO. Verifique o repositório Git e a API RPO em Configuração."
          />
        </Card>
      ) : summary ? (
        <>
          {/* ── Leitura executiva: saúde + distribuição ─────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
            {/* Gauge de saúde */}
            <Card className="flex flex-col">
              <div className="font-semibold" style={{ color: 'var(--text)' }}>Saúde do inventário</div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>
                {summary.counts.sincronizado} sincronizados de {summary.total} fontes
              </div>
              <div className="relative mx-auto" style={{ width: 180, height: 180 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={gaugeData}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                      innerRadius={64}
                      outerRadius={82}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      <Cell fill={health?.color ?? 'var(--primary)'} />
                      <Cell fill="var(--border)" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-3xl font-extrabold leading-none" style={{ color: health?.color }}>{summary.healthPct}%</div>
                  <div className="text-xs font-semibold mt-1" style={{ color: health?.color }}>{health?.label}</div>
                </div>
              </div>
            </Card>

            {/* Donut de distribuição — clicável */}
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold" style={{ color: 'var(--text)' }}>Distribuição por status</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Clique numa fatia para filtrar a tabela</div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
                <div style={{ width: 180, height: 180 }} className="shrink-0">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={80}
                        isAnimationActive={false}
                        paddingAngle={2}
                        stroke="none"
                        onClick={(_, index) => { const k = donutData[index]?.key; if (k) drillTo(k) }}
                        className="cursor-pointer"
                      >
                        {donutData.map((d) => <Cell key={d.key} fill={d.color} />)}
                      </Pie>
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 w-full grid grid-cols-1 gap-1.5">
                  {STATUS_ORDER.map((k) => {
                    const meta = STATUS_META[k]
                    const val = summary.counts[k]
                    const pct = summary.total ? ((val / summary.total) * 100).toFixed(1) : '0.0'
                    return (
                      <button
                        key={k}
                        onClick={() => drillTo(k)}
                        className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors"
                        style={{ background: filter === k ? 'var(--surface-hover)' : 'transparent' }}
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: meta.color }} />
                        <span className="flex-1 text-sm" style={{ color: 'var(--text-muted)' }}>{meta.label}</span>
                        <b className="text-sm" style={{ color: 'var(--text)' }}>{val}</b>
                        <span className="text-xs w-12 text-right" style={{ color: 'var(--text-light)' }}>{pct}%</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </Card>
          </div>

          {/* ── KPIs clicáveis ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
            {kpis.map((k) => {
              const active = filter === k.key
              return (
                <button
                  key={k.key}
                  onClick={() => drillTo(k.key)}
                  className="text-left rounded-xl px-4 py-3 transition-all"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    boxShadow: active ? `inset 3px 0 0 ${k.color}` : undefined,
                    outline: active ? '1px solid var(--primary)' : 'none',
                  }}
                >
                  <div className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: 'var(--text)' }}>{k.label}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>{k.sub}</div>
                </button>
              )
            })}
          </div>

          {/* ── Detalhe operacional: busca + tabela ─────────────────────────── */}
          <div ref={tableRef}>
            <Card padding="none">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold" style={{ color: 'var(--text)' }}>{FILTER_TITLES[filter]}</span>
                  <Badge variant="default">{filtered.length} de {rows.length}</Badge>
                  {filter !== 'all' && (
                    <button onClick={() => setFilter('all')} className="text-xs font-medium" style={{ color: 'var(--primary)' }}>limpar filtro</button>
                  )}
                </div>
                <div className="relative sm:ml-auto sm:w-72">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="buscar por programa…"
                    className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                </div>
              </div>

              {filtered.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="Nenhum resultado para este filtro"
                  description={q ? `Nada encontrado para "${q}".` : 'Não há fontes neste status.'}
                  action={<Button variant="secondary" onClick={() => { setQ(''); setFilter('all') }}>Limpar busca e filtro</Button>}
                />
              ) : (
                <Table>
                  <Thead>
                    <Tr>
                      <Th sortable active={sort.key === 'program'} dir={sort.dir} onClick={() => toggleSort('program')}>Arquivo</Th>
                      <Th sortable active={sort.key === 'diskDate'} dir={sort.dir} onClick={() => toggleSort('diskDate')}>Data Disco</Th>
                      <Th sortable active={sort.key === 'rpoDate'} dir={sort.dir} onClick={() => toggleSort('rpoDate')}>Data RPO</Th>
                      <Th sortable active={sort.key === 'diff'} dir={sort.dir} onClick={() => toggleSort('diff')} right>Diferença</Th>
                      <Th sortable active={sort.key === 'rpoType'} dir={sort.dir} onClick={() => toggleSort('rpoType')}>Tipo RPO</Th>
                      <Th sortable active={sort.key === 'status'} dir={sort.dir} onClick={() => toggleSort('status')}>Status</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {filtered.map((r) => <InventarioRow key={r.program} row={r} />)}
                  </Tbody>
                </Table>
              )}
            </Card>
          </div>
        </>
      ) : null}
    </>
  )
}

function InventarioRow({ row }: { row: InventoryResultRow }) {
  const meta = STATUS_META[row.status]
  const onDownload = () =>
    toast.info('Download disponível na conexão real (F6).', {
      description: `${row.program} — ${row.diskPath ?? 'sem fonte no disco'}`,
    })
  return (
    <Tr>
      <Td>
        <div className="flex items-center gap-2">
          {row.diskPath ? (
            <button onClick={onDownload} className="inline-flex items-center gap-1.5 font-semibold hover:underline" style={{ color: 'var(--primary)' }} title="Baixar fonte">
              <Download size={13} /> {row.program}
            </button>
          ) : (
            <span className="font-semibold" style={{ color: 'var(--text)' }}>{row.program}</span>
          )}
          {row.isRestApi && <Badge variant="primary">API</Badge>}
        </div>
        {row.diskPath && <div className="text-xs mt-0.5" style={{ color: 'var(--text-light)' }}>{row.diskPath}</div>}
      </Td>
      <Td muted>{fmtDateTime(row.diskDate)}</Td>
      <Td muted>{fmtDateTime(row.rpoDate)}</Td>
      <Td right mono>{fmtDiff(row.diskDate, row.rpoDate)}</Td>
      <Td>{row.rpoType ? <Badge variant={row.rpoType === 'Custom' ? 'purple' : 'default'}>{row.rpoType}</Badge> : <span style={{ color: 'var(--text-light)' }}>—</span>}</Td>
      <Td><Badge variant={meta.variant}>{meta.label}</Badge></Td>
    </Tr>
  )
}

function InventarioLoading() {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        <Skeleton className="h-[220px] rounded-2xl" />
        <Skeleton className="lg:col-span-2 h-[220px] rounded-2xl" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
        {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-[86px] rounded-xl" />)}
      </div>
      <SkeletonTable rows={8} cols={6} />
    </>
  )
}
