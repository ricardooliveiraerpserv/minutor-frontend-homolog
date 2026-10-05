'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus · Controle de Fontes — comparação disco × RPO.
// Resumo executivo + busca instantânea + filtros por status + ordenação.
// O STATUS vem PRONTO do backend (não recalculamos a regra no front); a coluna
// "Diferença" é só apresentação (disco − RPO). Estados: loading/populated/empty/
// error/filtro-sem-resultado.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import { GitCompare, PackageOpen, RefreshCw, Search, XCircle } from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, PageHeader, SkeletonTable,
  Table, Tbody, Td, Th, Thead, Tr,
} from '@/components/ds'
import { getOperacoesDataSource } from '@/lib/operacoes/datasource'
import type { SourceInvItem, SourceInvStatus, SourcesInventory } from '@/lib/operacoes/types'
import { useOperacoes } from './operacoes-context'
import { SOURCE_STATUS_META, fmtDateTime } from './shared'

type Filter = 'all' | SourceInvStatus
type SortKey = 'name' | 'diskMtime' | 'rpoTimestamp' | 'diff' | 'status'

export function FontesView({ previewEnvironmentId = null, initialFilter = 'all', initialQuery = '' }: { previewEnvironmentId?: string | null; initialFilter?: Filter; initialQuery?: string }) {
  const ds = getOperacoesDataSource()
  const ctx = useOperacoes()
  const environmentId = ctx?.environmentId ?? previewEnvironmentId ?? null

  const [inv, setInv] = useState<SourcesInventory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [q, setQ] = useState(initialQuery)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' })

  const load = useCallback(async () => {
    if (!environmentId) return
    setLoading(true); setError(null)
    try {
      setInv(await ds.getSourcesInventory(environmentId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao ler o inventário de fontes.'); setInv(null)
    } finally { setLoading(false) }
  }, [ds, environmentId])

  useEffect(() => { void load() }, [load])

  const items = inv?.items ?? []
  const summary = inv?.summary
  const isEmpty = !loading && !error && items.length === 0

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  const filtered = useMemo(() => {
    let list = items.filter((i) => (filter === 'all' || i.status === filter))
    const t = q.trim().toLowerCase()
    if (t) list = list.filter((i) => i.name.toLowerCase().includes(t))
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      let va: number | string, vb: number | string
      if (sort.key === 'diff') { va = diffMs(a); vb = diffMs(b) }
      else if (sort.key === 'diskMtime' || sort.key === 'rpoTimestamp') {
        va = a[sort.key] ? new Date(a[sort.key] as string).getTime() : -Infinity
        vb = b[sort.key] ? new Date(b[sort.key] as string).getTime() : -Infinity
      } else { va = a[sort.key] ?? ''; vb = b[sort.key] ?? '' }
      return va < vb ? -dir : va > vb ? dir : 0
    })
  }, [items, filter, q, sort])

  const kpis: { key: Filter; label: string; value: number; color: string }[] = summary ? [
    { key: 'all', label: 'Total', value: items.length, color: 'var(--text)' },
    { key: 'sincronizado', label: SOURCE_STATUS_META.sincronizado.label, value: summary.sincronizado, color: SOURCE_STATUS_META.sincronizado.color },
    { key: 'disco_mais_novo', label: SOURCE_STATUS_META.disco_mais_novo.label, value: summary.disco_mais_novo, color: SOURCE_STATUS_META.disco_mais_novo.color },
    { key: 'apenas_disco', label: SOURCE_STATUS_META.apenas_disco.label, value: summary.apenas_disco, color: SOURCE_STATUS_META.apenas_disco.color },
    { key: 'apenas_rpo', label: SOURCE_STATUS_META.apenas_rpo.label, value: summary.apenas_rpo, color: SOURCE_STATUS_META.apenas_rpo.color },
  ] : []

  return (
    <>
      <PageHeader
        icon={GitCompare}
        title="Controle de Fontes"
        subtitle={inv?.dir ? `Pasta: ${inv.dir}` : 'Comparação disco × RPO dos fontes do ambiente.'}
        actions={<Button variant="primary" icon={RefreshCw} onClick={() => void load()} disabled={loading || !environmentId}>Atualizar</Button>}
      />

      {loading ? (
        <SkeletonTable rows={8} cols={5} />
      ) : error ? (
        <Card>
          <EmptyState icon={XCircle} title="Não foi possível ler os fontes" description={error}
            action={<Button variant="primary" icon={RefreshCw} onClick={() => void load()}>Tentar novamente</Button>} />
        </Card>
      ) : isEmpty ? (
        <Card>
          <EmptyState icon={PackageOpen} title="Nenhum fonte encontrado" description="A pasta de fontes está vazia e o RPO não trouxe registros para este ambiente." />
        </Card>
      ) : (
        <>
          {/* Resumo executivo */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            {kpis.map((k) => {
              const active = filter === k.key
              return (
                <button key={k.key} onClick={() => setFilter(k.key)} className="text-left rounded-xl px-4 py-3 transition-all"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', outline: active ? '1px solid var(--primary)' : 'none', boxShadow: active ? `inset 3px 0 0 ${k.color}` : undefined }}>
                  <div className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: 'var(--text)' }}>{k.label}</div>
                </button>
              )
            })}
          </div>

          <Card padding="none">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <span className="font-semibold" style={{ color: 'var(--text)' }}>{filter === 'all' ? 'Todos os fontes' : SOURCE_STATUS_META[filter].label}</span>
                <Badge variant="default">{filtered.length} de {items.length}</Badge>
                {filter !== 'all' && <button onClick={() => setFilter('all')} className="text-xs font-medium" style={{ color: 'var(--primary)' }}>limpar filtro</button>}
              </div>
              <div className="relative sm:ml-auto sm:w-72">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar por fonte…"
                  className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState icon={Search} title="Nenhum resultado" description={q ? `Nada encontrado para "${q}".` : 'Não há fontes neste status.'}
                action={<Button variant="secondary" onClick={() => { setQ(''); setFilter('all') }}>Limpar busca e filtro</Button>} />
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th sortable active={sort.key === 'name'} dir={sort.dir} onClick={() => toggleSort('name')}>Fonte</Th>
                    <Th sortable active={sort.key === 'diskMtime'} dir={sort.dir} onClick={() => toggleSort('diskMtime')}>Modificado disco</Th>
                    <Th sortable active={sort.key === 'rpoTimestamp'} dir={sort.dir} onClick={() => toggleSort('rpoTimestamp')}>Compilado RPO</Th>
                    <Th sortable active={sort.key === 'diff'} dir={sort.dir} onClick={() => toggleSort('diff')} right>Diferença</Th>
                    <Th sortable active={sort.key === 'status'} dir={sort.dir} onClick={() => toggleSort('status')}>Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filtered.map((it) => <FonteRow key={it.name} item={it} />)}
                </Tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </>
  )
}

function FonteRow({ item }: { item: SourceInvItem }) {
  const meta = SOURCE_STATUS_META[item.status]
  return (
    <Tr>
      <Td mono><span style={{ color: 'var(--text)' }}>{item.name}</span></Td>
      <Td muted>{fmtDateTime(item.diskMtime)}</Td>
      <Td muted>{fmtDateTime(item.rpoTimestamp)}</Td>
      <Td right mono>{fmtDiff(item)}</Td>
      <Td><Badge variant={meta.variant}>{meta.label}</Badge></Td>
    </Tr>
  )
}

function diffMs(i: SourceInvItem): number {
  if (!i.diskMtime || !i.rpoTimestamp) return -Infinity
  return new Date(i.diskMtime).getTime() - new Date(i.rpoTimestamp).getTime()
}

function fmtDiff(i: SourceInvItem): string {
  if (!i.diskMtime || !i.rpoTimestamp) return '—'
  const diff = Math.round(diffMs(i) / 1000)
  const abs = Math.abs(diff)
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : ''
  if (abs < 60) return `${sign}${abs}s`
  if (abs < 3600) return `${sign}${Math.round(abs / 60)}m`
  if (abs < 86400) return `${sign}${Math.round(abs / 3600)}h`
  return `${sign}${Math.round(abs / 86400)}d`
}
