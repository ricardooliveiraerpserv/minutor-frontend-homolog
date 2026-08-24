'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus · Patches (C2) — fluxo próprio extraído da Visão Geral.
// Selecionar patch + validar (metadados/SDF) + aplicar → CONFIRMAÇÃO → PROGRESSO
// → RESULTADO + logs (runner reutilizado) + histórico de aplicações do ambiente.
// REUSA getBuildPatches, ops.patch() e ChangeHistoryTable. 100% fixtures; a
// aplicação NUNCA executa nada de verdade.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, History, Package, RefreshCw, ShieldCheck, XCircle,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ds'
import { useAuth } from '@/hooks/use-auth'
import { getOperacoesDataSource, operacoesDataMode } from '@/lib/operacoes/datasource'
import { canOperacoes } from '@/lib/operacoes/permissions'
import type { BuildPatches, ChangeEntry, ExclusiveState, ServiceRow } from '@/lib/operacoes/types'
import { useOperacoes } from './operacoes-context'
import { useOperations } from './operations'
import { ChangeHistoryTable, SectionHead } from './sections'
import { fmtDateTime } from './shared'

export function PatchesView({ previewEnvironmentId = null, demoAdmin = false }: { previewEnvironmentId?: string | null; demoAdmin?: boolean }) {
  const ds = getOperacoesDataSource()
  const { user } = useAuth()
  const ctx = useOperacoes()
  const environmentId = ctx?.environmentId ?? previewEnvironmentId ?? null
  const environmentLabel = ctx?.environmentLabel ?? null
  const companyName = ctx?.companyName ?? 'JNG'

  const can = useCallback((p: Parameters<typeof canOperacoes>[0]) => demoAdmin || canOperacoes(p, user), [user, demoAdmin])

  const [patches, setPatches] = useState<BuildPatches | null>(null)
  const [services, setServices] = useState<ServiceRow[] | null>(null)
  const [exclusive, setExclusive] = useState<ExclusiveState | null>(null)
  const [history, setHistory] = useState<ChangeEntry[]>([])
  const [validated, setValidated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!environmentId) return
    setLoading(true); setError(null); setValidated(false)
    try {
      const [pt, svc, exc, chg] = await Promise.all([
        ds.getBuildPatches(environmentId),
        ds.getServices(environmentId),
        ds.getExclusiveState(environmentId),
        ds.getChanges(environmentId, { type: 'patch-apply' }),
      ])
      setPatches(pt)
      setServices(svc)
      setExclusive(exc)
      setHistory(chg)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar os patches.'); setPatches(null)
    } finally { setLoading(false) }
  }, [ds, environmentId])

  useEffect(() => { void load() }, [load])

  const ops = useOperations(environmentId, () => { void load() })

  const debugActive = (services ?? []).some((s) => s.type === 'compiler' && s.status === 'Running')
  const canBuild = (exclusive?.active ?? false) || debugActive
  const hasSdf = (patches?.patches ?? []).some((p) => p.hasSdf)
  const lastJob = history[0] ?? null

  return (
    <>
      <PageHeader
        icon={Package}
        title="Patches"
        subtitle={`Empresa: ${companyName}${environmentLabel ? ` · Ambiente: ${environmentLabel}` : ''} — aplicação de pacotes .ptm no ambiente.`}
        actions={<Button variant="secondary" icon={RefreshCw} onClick={() => void load()} disabled={loading || !environmentId}>Atualizar</Button>}
      />

      {operacoesDataMode() === 'fixture' && (
        <div className="mb-4 flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
          <Package size={14} />
          Dados de demonstração (fixtures) — a aplicação de patches é simulada; nada é executado no ambiente real.
        </div>
      )}

      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <Card>
          <EmptyState icon={XCircle} title="Não foi possível carregar" description={error}
            action={<Button variant="primary" icon={RefreshCw} onClick={() => void load()}>Tentar novamente</Button>} />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {!canBuild && (
            <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
              <AlertTriangle size={15} /> Aplicar patches exige <b>Modo Debug</b> ou <b>Modo Exclusivo</b> ativo. Ative em AppServers · Utilidades.
            </div>
          )}

          {/* ── SELEÇÃO DE PATCHES ────────────────────────────────────────────── */}
          <Card padding="none">
            <div className="px-5 pt-5">
              <SectionHead icon={Package} title="Patches disponíveis" subtitle={patches?.dir ? `Pasta: ${patches.dir}` : undefined}>
                <Badge variant="default">{patches?.count ?? 0} patch(es)</Badge>
              </SectionHead>
            </div>
            {(patches?.patches ?? []).length === 0 ? (
              <div className="px-5 pb-8"><EmptyState icon={Package} title="Nenhum patch disponível" description="A pasta de patches está vazia para este ambiente." /></div>
            ) : (
              <div className="px-5 pb-4 flex flex-col gap-2">
                {(patches?.patches ?? []).map((p) => (
                  <div key={p.file} className="rounded-lg px-3 py-2.5" style={{ background: 'var(--surface-hover)' }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{p.meta?.name ?? p.name}</span>
                      {p.meta?.version && <Badge variant="primary">{p.meta.version}</Badge>}
                      {p.meta?.build && <Badge variant="default">build {p.meta.build}</Badge>}
                      {p.hasSdf && <Badge variant="warning">SDF</Badge>}
                      {p.orphan ? <Badge variant="danger">órfão</Badge> : validated ? <Badge variant="success">validado</Badge> : null}
                    </div>
                    <div className="text-xs font-mono mt-1 truncate" style={{ color: 'var(--text-light)' }}>{p.file}</div>
                  </div>
                ))}
              </div>
            )}
            {hasSdf && (
              <div className="mx-5 mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>Pasta SDF detectada. Após aplicar, execute o UPDDISTR no SmartClient antes de promover o RPO.</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-xs" style={{ color: 'var(--text-light)' }}>Ambiente: <b style={{ color: 'var(--text)' }}>{environmentLabel ?? '—'}</b></span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" icon={ShieldCheck} disabled={(patches?.count ?? 0) === 0} onClick={() => setValidated(true)}>Validar</Button>
                <Button variant="primary" icon={Package} disabled={!canBuild || !can('patch') || (patches?.count ?? 0) === 0} onClick={() => void ops.patch()}>Aplicar patches</Button>
              </div>
            </div>
          </Card>

          {/* ── STATUS DO ÚLTIMO JOB ──────────────────────────────────────────── */}
          <Card>
            <SectionHead icon={CheckCircle2} title="Status da última aplicação" />
            {lastJob ? (
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={lastJob.success ? 'success' : 'danger'}>{lastJob.success ? 'Sucesso' : 'Falha'}</Badge>
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{fmtDateTime(lastJob.timestamp)}</span>
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>· {lastJob.files.join(', ')} · {lastJob.username}</span>
              </div>
            ) : (
              <div className="text-sm" style={{ color: 'var(--text-light)' }}>Nenhuma aplicação registrada neste ambiente ainda.</div>
            )}
          </Card>

          {/* ── HISTÓRICO ─────────────────────────────────────────────────────── */}
          <Card padding="none">
            <div className="px-5 pt-5"><SectionHead icon={History} title="Histórico de patches" /></div>
            <ChangeHistoryTable rows={history} />
          </Card>
        </div>
      )}

      {ops.modals}
    </>
  )
}

function LoadingBlock() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-56 rounded-2xl" />
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  )
}
