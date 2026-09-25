'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus · Compilação (C2) — fluxo próprio extraído da Visão Geral.
// Seleção de fontes + ambiente + gate (Debug/Exclusivo) → CONFIRMAÇÃO → PROGRESSO
// → RESULTADO por fonte + logs (runner reutilizado de operations.tsx) → status do
// último job + histórico de compilações do ambiente. REUSA getBuildSources,
// ops.compile() e ChangeHistoryTable. 100% fixtures; a compilação NUNCA executa.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, FileText, Hammer, History, RefreshCw, XCircle,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ds'
import { useAuth } from '@/hooks/use-auth'
import { getOperacoesDataSource, operacoesDataMode } from '@/lib/operacoes/datasource'
import { canOperacoes } from '@/lib/operacoes/permissions'
import type { BuildSources, ChangeEntry, ExclusiveState, ServiceRow } from '@/lib/operacoes/types'
import { useOperacoes } from './operacoes-context'
import { ProsightNotConnected } from '@/app/prosight/_components/company-context'
import { useOperations } from './operations'
import { ChangeHistoryTable, SectionHead } from './sections'
import { fmtDateTime } from './shared'

export function CompilacaoView({ previewEnvironmentId = null, demoAdmin = false }: { previewEnvironmentId?: string | null; demoAdmin?: boolean }) {
  const ds = getOperacoesDataSource()
  const { user } = useAuth()
  const ctx = useOperacoes()
  const environmentId = ctx?.environmentId ?? previewEnvironmentId ?? null
  const environmentLabel = ctx?.environmentLabel ?? null
  const companyName = ctx?.companyName ?? 'JNG'

  const can = useCallback((p: Parameters<typeof canOperacoes>[0]) => demoAdmin || canOperacoes(p, user), [user, demoAdmin])

  const [sources, setSources] = useState<BuildSources | null>(null)
  const [services, setServices] = useState<ServiceRow[] | null>(null)
  const [exclusive, setExclusive] = useState<ExclusiveState | null>(null)
  const [history, setHistory] = useState<ChangeEntry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!environmentId) return
    setLoading(true); setError(null)
    try {
      const [src, svc, exc, chg] = await Promise.all([
        ds.getBuildSources(environmentId),
        ds.getServices(environmentId),
        ds.getExclusiveState(environmentId),
        ds.getChanges(environmentId, { type: 'compile' }),
      ])
      setSources(src)
      setServices(svc)
      setExclusive(exc)
      setHistory(chg)
      setSelected(new Set(src.files))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar as fontes.'); setSources(null)
    } finally { setLoading(false) }
  }, [ds, environmentId])

  useEffect(() => { void load() }, [load])

  const ops = useOperations(environmentId, () => { void load() })

  const debugActive = (services ?? []).some((s) => s.type === 'compiler' && s.status === 'Running')
  const canBuild = (exclusive?.active ?? false) || debugActive
  const lastJob = history[0] ?? null

  const toggle = (f: string) => setSelected((cur) => {
    const next = new Set(cur)
    if (next.has(f)) next.delete(f); else next.add(f)
    return next
  })

  if (ctx && !ctx.demoAllowed) {
    return <ProsightNotConnected companyName={ctx.companyName} />
  }

  return (
    <>
      <PageHeader
        icon={Hammer}
        title="Compilação"
        subtitle={`Empresa: ${companyName}${environmentLabel ? ` · Ambiente: ${environmentLabel}` : ''} — compila os fontes do ambiente.`}
        actions={<Button variant="secondary" icon={RefreshCw} onClick={() => void load()} disabled={loading || !environmentId}>Atualizar</Button>}
      />

      {operacoesDataMode() === 'fixture' && (
        <div className="mb-4 flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
          <Hammer size={14} />
          Dados de demonstração (fixtures) — a compilação é simulada; nada é executado no ambiente real.
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
              <AlertTriangle size={15} /> A compilação exige <b>Modo Debug</b> ou <b>Modo Exclusivo</b> ativo. Ative em AppServers · Utilidades.
            </div>
          )}

          {/* ── SELEÇÃO DE FONTES ─────────────────────────────────────────────── */}
          <Card padding="none">
            <div className="px-5 pt-5">
              <SectionHead icon={Hammer} title="Fontes a compilar" subtitle={sources?.dir ? `Pasta: ${sources.dir}` : undefined}>
                <Badge variant="default">{selected.size} de {sources?.count ?? 0} selecionado(s)</Badge>
              </SectionHead>
            </div>
            <div className="px-5 pb-4 flex flex-col gap-1.5">
              {(sources?.files ?? []).map((f) => {
                const name = f.split(/[\\/]/).pop() ?? f
                const on = selected.has(f)
                return (
                  <label key={f} className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer" style={{ background: 'var(--surface-hover)' }}>
                    <input type="checkbox" checked={on} onChange={() => toggle(f)} style={{ accentColor: 'var(--primary)' }} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{name}</div>
                      <div className="text-xs font-mono truncate" style={{ color: 'var(--text-light)' }}>{f}</div>
                    </div>
                  </label>
                )
              })}
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-xs" style={{ color: 'var(--text-light)' }}>Ambiente: <b style={{ color: 'var(--text)' }}>{environmentLabel ?? '—'}</b></span>
              <Button variant="primary" icon={Hammer} disabled={!canBuild || !can('compile') || selected.size === 0} onClick={() => void ops.compile()}>
                Compilar {selected.size} fonte(s)
              </Button>
            </div>
          </Card>

          {/* ── STATUS DO ÚLTIMO JOB ──────────────────────────────────────────── */}
          <Card>
            <SectionHead icon={CheckCircle2} title="Status do último job" />
            {lastJob ? (
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={lastJob.success ? 'success' : 'danger'}>{lastJob.success ? 'Sucesso' : 'Falha'}</Badge>
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{fmtDateTime(lastJob.timestamp)}</span>
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>· {lastJob.files.length} fonte(s) · {lastJob.username}</span>
                {lastJob.logFile && (
                  <span className="flex items-center gap-1.5 text-xs font-mono" style={{ color: 'var(--text-light)' }}>
                    <FileText size={12} /> {lastJob.logFile.split(/[\\/]/).pop()}
                  </span>
                )}
              </div>
            ) : (
              <div className="text-sm" style={{ color: 'var(--text-light)' }}>Nenhuma compilação registrada neste ambiente ainda.</div>
            )}
          </Card>

          {/* ── HISTÓRICO ─────────────────────────────────────────────────────── */}
          <Card padding="none">
            <div className="px-5 pt-5"><SectionHead icon={History} title="Histórico de compilações" /></div>
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
