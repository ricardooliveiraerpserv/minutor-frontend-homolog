'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus · RPO (C2) — fluxo próprio extraído da Visão Geral.
// Situação atual (versão/arquivos RPO) + destinos de promoção + PROMOVER +
// ROLLBACK → CONFIRMAÇÃO → PROGRESSO → RESULTADO (runner reutilizado) + hashes/
// versões + histórico (promoções/rollbacks) + alertas de fontes pendentes.
// REUSA getPromoteDestinations, ops.promote()/ops.rollback() e ChangeHistoryTable.
// 100% fixtures; promoção/rollback NUNCA executam nada de verdade.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, History, Package, RefreshCw, RotateCcw, Server, Upload, XCircle,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ds'
import { useAuth } from '@/hooks/use-auth'
import { getOperacoesDataSource, operacoesDataMode } from '@/lib/operacoes/datasource'
import { canOperacoes } from '@/lib/operacoes/permissions'
import type {
  ChangeEntry, PromoteDestinations, SourcesInventory, SystemInfo,
} from '@/lib/operacoes/types'
import { useOperacoes } from './operacoes-context'
import { useOperations } from './operations'
import { ChangeHistoryTable, SectionHead } from './sections'
import { fmtDateTime } from './shared'

export function RpoView({ previewEnvironmentId = null, demoAdmin = false }: { previewEnvironmentId?: string | null; demoAdmin?: boolean }) {
  const ds = getOperacoesDataSource()
  const { user } = useAuth()
  const ctx = useOperacoes()
  const environmentId = ctx?.environmentId ?? previewEnvironmentId ?? null
  const environmentLabel = ctx?.environmentLabel ?? null
  const companyName = ctx?.companyName ?? 'JNG'

  const can = useCallback((p: Parameters<typeof canOperacoes>[0]) => demoAdmin || canOperacoes(p, user), [user, demoAdmin])

  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [dests, setDests] = useState<PromoteDestinations | null>(null)
  const [inv, setInv] = useState<SourcesInventory | null>(null)
  const [history, setHistory] = useState<ChangeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!environmentId) return
    setLoading(true); setError(null)
    try {
      const [sysInfo, pd, inventory, chg] = await Promise.all([
        ds.getSystemInfo(environmentId),
        ds.getPromoteDestinations(environmentId),
        ds.getSourcesInventory(environmentId),
        ds.getChanges(environmentId),
      ])
      setInfo(sysInfo)
      setDests(pd)
      setInv(inventory)
      setHistory(chg.filter((e) => e.type === 'promote-rpo' || e.type === 'rollback-rpo'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar o RPO.'); setInfo(null)
    } finally { setLoading(false) }
  }, [ds, environmentId])

  useEffect(() => { void load() }, [load])

  const ops = useOperations(environmentId, () => { void load() })

  const pending = (inv?.summary.disco_mais_novo ?? 0) + (inv?.summary.apenas_disco ?? 0)

  return (
    <>
      <PageHeader
        icon={Upload}
        title="RPO"
        subtitle={`Empresa: ${companyName}${environmentLabel ? ` · Ambiente: ${environmentLabel}` : ''} — promoção e rollback do RPO nos slaves.`}
        actions={<Button variant="secondary" icon={RefreshCw} onClick={() => void load()} disabled={loading || !environmentId}>Atualizar</Button>}
      />

      {operacoesDataMode() === 'fixture' && (
        <div className="mb-4 flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
          <Upload size={14} />
          Dados de demonstração (fixtures) — promoção/rollback são simulados; nada é executado no ambiente real.
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
          {pending > 0 && (
            <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
              <AlertTriangle size={15} /> <b>{pending} fonte(s)</b> com alterações ainda não promovidas ao RPO. Compile e promova para publicar nos slaves.
            </div>
          )}

          {/* ── SITUAÇÃO ATUAL + AÇÕES ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2">
              <Card>
                <SectionHead icon={Package} title="Situação atual do RPO" subtitle={info?.appEnvironment ? `${info.appEnvironment}` : undefined} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Field label="Versão RPO" value={info?.rpoVersion || '—'} mono />
                  <Field label="RPO Custom" value={info?.rpoCustom || '—'} mono />
                  {(info?.rpoFiles ?? []).map((f) => (
                    <Field key={f.path} label={f.name} value={f.mtime ? fmtDateTime(f.mtime) : (f.error || '—')} mono />
                  ))}
                </div>
              </Card>
            </div>
            <Card>
              <SectionHead icon={Upload} title="Ações de RPO" />
              <div className="flex flex-col gap-3">
                <Button variant="primary" icon={Upload} disabled={!can('rpo.promote')} onClick={() => void ops.promote()}>Promover RPO</Button>
                <Button variant="danger" icon={RotateCcw} disabled={!can('rpo.rollback')} onClick={() => ops.rollback()}>Rollback RPO</Button>
                <p className="text-xs" style={{ color: 'var(--text-light)' }}>
                  Promover publica o RPO do compilador nos slaves (backup .bak + verificação de hash). Rollback restaura o .bak anterior.
                </p>
              </div>
            </Card>
          </div>

          {/* ── DESTINOS ──────────────────────────────────────────────────────── */}
          <Card padding="none">
            <div className="px-5 pt-5">
              <SectionHead icon={Server} title="Destinos de promoção" subtitle={dests?.compilerSourcePath ? `Origem (compilador): ${dests.compilerSourcePath}` : undefined}>
                <Badge variant="default">{dests?.destinations.length ?? 0} destino(s)</Badge>
              </SectionHead>
            </div>
            <div className="px-5 pb-5 flex flex-col gap-2">
              {(dests?.destinations ?? []).map((d) => (
                <div key={d.key} className="rounded-lg px-3 py-2.5" style={{ background: 'var(--surface-hover)' }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Server size={14} style={{ color: 'var(--text-light)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{d.label}</span>
                  </div>
                  <div className="text-xs font-mono mt-1 truncate" style={{ color: 'var(--text-light)' }}>{d.rpoCustom}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* ── HISTÓRICO ─────────────────────────────────────────────────────── */}
          <Card padding="none">
            <div className="px-5 pt-5"><SectionHead icon={History} title="Histórico de promoções e rollbacks" /></div>
            <ChangeHistoryTable rows={history} />
          </Card>
        </div>
      )}

      {ops.modals}
    </>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-hover)' }}>
      <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</div>
      <div className={`text-sm mt-0.5 ${mono ? 'font-mono' : ''} truncate`} style={{ color: 'var(--text)' }}>{value}</div>
    </div>
  )
}

function LoadingBlock() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Skeleton className="lg:col-span-2 h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  )
}
