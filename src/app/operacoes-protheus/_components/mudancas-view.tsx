'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus · Mudanças — histórico de compile/patch/promote/rollback.
// Filtros: período, tipo, resultado, busca. Clicar numa linha com output abre o
// detalhe. Estados: loading/populated/empty/error. Alimentado pelo store fixture
// (operações executadas na Visão Geral aparecem aqui — sensação fim-a-fim).
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { History, RefreshCw, Search, XCircle } from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, PageHeader, Select, SkeletonTable,
  Table, Tbody, Td, Th, Thead, Tr,
} from '@/components/ds'
import { getOperacoesDataSource } from '@/lib/operacoes/datasource'
import type { ChangeEntry, ChangeType } from '@/lib/operacoes/types'
import { useOperacoes } from './operacoes-context'
import { CHANGE_TYPE_META, fmtDateTime } from './shared'

type TypeFilter = 'all' | ChangeType
type ResultFilter = 'all' | 'ok' | 'fail'
type PeriodFilter = 'all' | '24h' | '7d'

export function MudancasView({ previewEnvironmentId = null }: { previewEnvironmentId?: string | null }) {
  const ds = getOperacoesDataSource()
  const ctx = useOperacoes()
  const environmentId = ctx?.environmentId ?? previewEnvironmentId ?? null

  const [rows, setRows] = useState<ChangeEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeF, setTypeF] = useState<TypeFilter>('all')
  const [resultF, setResultF] = useState<ResultFilter>('all')
  const [periodF, setPeriodF] = useState<PeriodFilter>('all')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!environmentId) return
    setLoading(true); setError(null)
    try {
      setRows(await ds.getChanges(environmentId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar o histórico.'); setRows(null)
    } finally { setLoading(false) }
  }, [ds, environmentId])

  useEffect(() => { void load() }, [load])

  const all = rows ?? []
  const isEmpty = !loading && !error && all.length === 0

  const filtered = useMemo(() => {
    const now = Date.now()
    const t = q.trim().toLowerCase()
    return all.filter((e) => {
      if (typeF !== 'all' && e.type !== typeF) return false
      if (resultF === 'ok' && !e.success) return false
      if (resultF === 'fail' && e.success) return false
      if (periodF !== 'all') {
        const age = now - new Date(e.timestamp).getTime()
        if (periodF === '24h' && age > 24 * 3600e3) return false
        if (periodF === '7d' && age > 7 * 24 * 3600e3) return false
      }
      if (t) {
        const hay = `${e.username} ${e.files.join(' ')} ${e.type}`.toLowerCase()
        if (!hay.includes(t)) return false
      }
      return true
    })
  }, [all, typeF, resultF, periodF, q])

  return (
    <>
      <PageHeader
        icon={History}
        title="Mudanças"
        subtitle="Histórico de compilações, patches, promoções e rollbacks do ambiente."
        actions={<Button variant="primary" icon={RefreshCw} onClick={() => void load()} disabled={loading || !environmentId}>Atualizar</Button>}
      />

      {!loading && !error && !isEmpty && (
        <Card padding="sm" className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={typeF} onChange={(e) => setTypeF(e.target.value as TypeFilter)} className="!py-2">
              <option value="all">Todos os tipos</option>
              {(Object.keys(CHANGE_TYPE_META) as ChangeType[]).map((k) => <option key={k} value={k}>{CHANGE_TYPE_META[k].label}</option>)}
            </Select>
            <Select value={resultF} onChange={(e) => setResultF(e.target.value as ResultFilter)} className="!py-2">
              <option value="all">Qualquer resultado</option>
              <option value="ok">Sucesso</option>
              <option value="fail">Falha</option>
            </Select>
            <Select value={periodF} onChange={(e) => setPeriodF(e.target.value as PeriodFilter)} className="!py-2">
              <option value="all">Todo o período</option>
              <option value="24h">Últimas 24h</option>
              <option value="7d">Últimos 7 dias</option>
            </Select>
            <div className="relative sm:ml-auto sm:w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar usuário/arquivo…"
                className="w-full rounded-xl pl-9 pr-4 py-2 text-sm outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : error ? (
        <Card>
          <EmptyState icon={XCircle} title="Não foi possível carregar" description={error}
            action={<Button variant="primary" icon={RefreshCw} onClick={() => void load()}>Tentar novamente</Button>} />
        </Card>
      ) : isEmpty ? (
        <Card><EmptyState icon={History} title="Sem mudanças registradas" description="Nenhuma operação foi executada neste ambiente ainda." /></Card>
      ) : (
        <Card padding="none">
          {filtered.length === 0 ? (
            <EmptyState icon={Search} title="Nenhum registro para o filtro" description="Ajuste os filtros ou a busca."
              action={<Button variant="secondary" onClick={() => { setTypeF('all'); setResultF('all'); setPeriodF('all'); setQ('') }}>Limpar filtros</Button>} />
          ) : (
            <Table>
              <Thead>
                <Tr><Th>Tipo</Th><Th>Usuário</Th><Th>Data/hora</Th><Th>Arquivos</Th><Th>Resultado</Th></Tr>
              </Thead>
              <Tbody>
                {filtered.map((e) => {
                  const meta = CHANGE_TYPE_META[e.type]
                  const files = e.files.slice(0, 4).join(', ') + (e.files.length > 4 ? ` (+${e.files.length - 4})` : '')
                  const hasOutput = !!e.output?.trim()
                  return (
                    <Fragment key={e.id}>
                      <Tr onClick={hasOutput ? () => setOpenId(openId === e.id ? null : e.id) : undefined}>
                        <Td><Badge variant={meta.variant}>{meta.label}</Badge></Td>
                        <Td mono muted>{e.username}</Td>
                        <Td muted>{fmtDateTime(e.timestamp)}</Td>
                        <Td muted><span className="text-xs">{files || '—'}</span></Td>
                        <Td><Badge variant={e.success ? 'success' : 'danger'}>{e.success ? 'OK' : 'Falhou'}</Badge></Td>
                      </Tr>
                      {hasOutput && openId === e.id && (
                        <Tr>
                          <Td colSpan={5}>
                            <pre className="rounded-lg p-3 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-56" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>{e.output}</pre>
                          </Td>
                        </Tr>
                      )}
                    </Fragment>
                  )
                })}
              </Tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  )
}
