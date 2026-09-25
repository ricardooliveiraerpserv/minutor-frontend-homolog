'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus · Auditoria — rastreia compile/patch/promote/rollback/
// start-stop/exclusive/debug/cleanup/config. Colunas: Quem, Quando, Ação,
// Ambiente, Resultado, Detalhes. Filtros coerentes + busca. Estados loading/
// populated/empty/error. Só quem tem audit.view enxerga.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardList, RefreshCw, Search, ShieldAlert, XCircle } from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, PageHeader, Select, SkeletonTable,
  Table, Tbody, Td, Th, Thead, Tr,
} from '@/components/ds'
import { useAuth } from '@/hooks/use-auth'
import { getOperacoesDataSource } from '@/lib/operacoes/datasource'
import { canOperacoes } from '@/lib/operacoes/permissions'
import type { AuditEntry } from '@/lib/operacoes/types'
import { useOperacoes } from './operacoes-context'
import { auditActionMeta, fmtDateTime } from './shared'

type ResultFilter = 'all' | 'ok' | 'fail'

export function AuditoriaView({ previewEnvironmentId = null, demoAdmin = false }: { previewEnvironmentId?: string | null; demoAdmin?: boolean }) {
  const ds = getOperacoesDataSource()
  const { user } = useAuth()
  const ctx = useOperacoes()
  const environmentId = ctx?.environmentId ?? previewEnvironmentId ?? null
  const environmentLabel = ctx?.environmentLabel ?? '—'
  const canView = demoAdmin || canOperacoes('audit.view', user)

  const [rows, setRows] = useState<AuditEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionF, setActionF] = useState('all')
  const [resultF, setResultF] = useState<ResultFilter>('all')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    if (!environmentId) return
    setLoading(true); setError(null)
    try {
      setRows(await ds.getAudit(environmentId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar a auditoria.'); setRows(null)
    } finally { setLoading(false) }
  }, [ds, environmentId])

  useEffect(() => { if (canView) void load() }, [canView, load])

  const all = rows ?? []
  const isEmpty = !loading && !error && all.length === 0
  const actions = useMemo(() => Array.from(new Set(all.map((e) => e.action))), [all])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return all.filter((e) => {
      if (actionF !== 'all' && e.action !== actionF) return false
      if (resultF === 'ok' && !e.success) return false
      if (resultF === 'fail' && e.success) return false
      if (t && !`${e.username} ${e.action} ${e.detail}`.toLowerCase().includes(t)) return false
      return true
    })
  }, [all, actionF, resultF, q])

  if (!canView) {
    return (
      <>
        <PageHeader icon={ClipboardList} title="Auditoria" subtitle="Rastreamento das operações do ambiente." />
        <Card><EmptyState icon={ShieldAlert} title="Acesso restrito" description="A auditoria de Operações Protheus é exclusiva de administradores do Minutor." /></Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        icon={ClipboardList}
        title="Auditoria"
        subtitle="Quem fez o quê, quando e com que resultado — no ambiente selecionado."
        actions={<Button variant="primary" icon={RefreshCw} onClick={() => void load()} disabled={loading || !environmentId}>Atualizar</Button>}
      />

      {!loading && !error && !isEmpty && (
        <Card padding="sm" className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={actionF} onChange={(e) => setActionF(e.target.value)} className="!py-2">
              <option value="all">Todas as ações</option>
              {actions.map((a) => <option key={a} value={a}>{auditActionMeta(a).label}</option>)}
            </Select>
            <Select value={resultF} onChange={(e) => setResultF(e.target.value as ResultFilter)} className="!py-2">
              <option value="all">Qualquer resultado</option>
              <option value="ok">Sucesso</option>
              <option value="fail">Falha</option>
            </Select>
            <div className="relative sm:ml-auto sm:w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar…"
                className="w-full rounded-xl pl-9 pr-4 py-2 text-sm outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : error ? (
        <Card>
          <EmptyState icon={XCircle} title="Não foi possível carregar" description={error}
            action={<Button variant="primary" icon={RefreshCw} onClick={() => void load()}>Tentar novamente</Button>} />
        </Card>
      ) : isEmpty ? (
        <Card><EmptyState icon={ClipboardList} title="Sem registros de auditoria" description="Nenhuma ação auditável foi executada neste ambiente ainda." /></Card>
      ) : (
        <Card padding="none">
          {filtered.length === 0 ? (
            <EmptyState icon={Search} title="Nenhum registro para o filtro" description="Ajuste os filtros ou a busca."
              action={<Button variant="secondary" onClick={() => { setActionF('all'); setResultF('all'); setQ('') }}>Limpar filtros</Button>} />
          ) : (
            <Table>
              <Thead>
                <Tr><Th>Quem</Th><Th>Quando</Th><Th>Ação</Th><Th>Ambiente</Th><Th>Resultado</Th><Th>Detalhes</Th></Tr>
              </Thead>
              <Tbody>
                {filtered.map((e) => {
                  const meta = auditActionMeta(e.action)
                  return (
                    <Tr key={e.id}>
                      <Td mono muted>{e.username}</Td>
                      <Td muted>{fmtDateTime(e.timestamp)}</Td>
                      <Td><Badge variant={meta.variant}>{meta.label}</Badge></Td>
                      <Td muted>{environmentLabel}</Td>
                      <Td><Badge variant={e.success ? 'success' : 'danger'}>{e.success ? 'OK' : 'Falhou'}</Badge></Td>
                      <Td muted><span className="text-xs">{e.detail || '—'}</span></Td>
                    </Tr>
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
