'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Prosight C4 · Configuração de Ambiente — detalhe CADASTRAL real de UM ambiente.
// Eixo oficial: ProsightCompanyContext.customer_id + environment_id (selecionado em
// C3). Mostra SOMENTE o que o Env* sabe hoje: ambiente, AppServers (version/build/
// patch), engine do banco (+ AlwaysOn CADASTRADO), links. Broker/compilação/RPO/
// REST/health/folders/janela/n8n/operação = Conector → seção estática "aguardando".
// Nada de secret/host/porta/URL. Sem fallback fixture no live: erro = indisponível.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Boxes, Building2, Database, DownloadCloud, ExternalLink, Layers, Link2, RefreshCw, Server, ServerCog, Settings, XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ds'
import { ApiError, apiMessage } from '@/lib/api'
import {
  fetchCommandStatus, fetchEnvironmentObserved, fetchEnvironmentPresence, fetchProsightEnvironmentConfig,
  presenceLabel, requestInventoryCollection,
  type ConnectorCommandStatus, type EnvironmentObserved, type EnvironmentPresence, type SafeEnvironmentConfig,
} from '@/lib/prosight/environments'
import { useProsightCompany } from '@/app/prosight/_components/company-context'
import { useProsightEnvSelection } from '@/app/prosight/_components/env-selection-context'
import { useAuth } from '@/contexts/auth-context'

const TYPE_LABEL: Record<SafeEnvironmentConfig['environment']['type'], string> = {
  prod: 'Produção', homolog: 'Homologação', dev: 'Desenvolvimento', dr: 'Disaster Recovery',
}
const ENGINE_LABEL: Record<string, string> = {
  sqlserver: 'SQL Server', postgres: 'PostgreSQL', oracle: 'Oracle', mysql: 'MySQL',
}
const STATUS_VARIANT: Record<string, string> = {
  ativo: 'default', inativo: 'danger', manutencao: 'warning', indefinido: 'default',
}
// Operações que ALTERAM infraestrutura ainda não disponíveis (Connector-4+). Observação (C-2) e a
// SOLICITAÇÃO de coleta (C-3, botão na seção Observado) já existem; aqui fica só o destrutivo/controlado.
const PENDING = [
  'Start / Stop / Restart', 'Compilação', 'Aplicação de patch', 'Promoção / rollback de RPO',
]

// previewEnvironmentId/demoAdmin: aceitos p/ compatibilidade do harness de preview; o C4 usa o contexto real.
export function ConfiguracaoView(_props: { previewEnvironmentId?: string | null; demoAdmin?: boolean } = {}) {
  const company = useProsightCompany()
  const sel = useProsightEnvSelection()
  const companyId = company?.companyId ?? null
  const companyName = company?.companyName ?? null
  const environmentId = sel?.environmentId ?? null

  const [config, setConfig] = useState<SafeEnvironmentConfig | null>(null)
  const [presence, setPresence] = useState<EnvironmentPresence | null>(null)
  const [observed, setObserved] = useState<EnvironmentObserved | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (companyId == null || environmentId == null) { setConfig(null); return }
    setLoading(true); setError(null)
    try {
      const [cfg, pres, obs] = await Promise.all([
        fetchProsightEnvironmentConfig(companyId, environmentId),
        fetchEnvironmentPresence(environmentId).catch(() => null),   // presença (best-effort)
        fetchEnvironmentObserved(environmentId).catch(() => null),   // inventário observado (best-effort)
      ])
      setConfig(cfg); setPresence(pres); setObserved(obs)
    }
    catch (e) {
      setConfig(null)
      // 404 = ambiente não pertence a esta empresa / fora de escopo → limpa a seleção (sem stale).
      if (e instanceof ApiError && e.status === 404) { sel?.setEnvironmentId(null); setError(null) }
      else { setError(apiMessage(e, 'Falha ao carregar a configuração do ambiente.')) }
    }
    finally { setLoading(false) }
  }, [companyId, environmentId, sel])

  useEffect(() => { void load() }, [load])

  // Refresh SÓ do inventário observado (sem togg*/loading → NÃO desmonta o ConfigDetail). Usado após
  // uma coleta concluída, p/ o estado observado atualizar SEM apagar o chip de status do botão.
  const refreshObserved = useCallback(async () => {
    if (environmentId == null) return
    try { setObserved(await fetchEnvironmentObserved(environmentId)) } catch { /* mantém o anterior */ }
  }, [environmentId])

  const needSelection = companyId == null || environmentId == null

  return (
    <>
      <PageHeader
        icon={Settings}
        title="Configuração de Ambiente"
        subtitle="Configuração cadastral do ambiente selecionado (Cofre). Operação, health e RPO ao vivo entram com o Conector."
        actions={<Button variant="primary" icon={RefreshCw} onClick={() => void load()} disabled={loading || needSelection}>Atualizar</Button>}
      />

      {needSelection ? (
        <Card><EmptyState icon={Building2} title="Selecione empresa e ambiente"
          description="A Configuração exige uma empresa (seletor acima) e um ambiente específico. Abra em Ambientes e use “Ver configuração”." /></Card>
      ) : loading ? (
        <div className="flex flex-col gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      ) : error ? (
        <Card><EmptyState icon={XCircle} title="Configuração indisponível" description={error}
          action={<Button variant="primary" icon={RefreshCw} onClick={() => void load()}>Tentar novamente</Button>} /></Card>
      ) : !config ? (
        <Card><EmptyState icon={Layers} title="Ambiente não disponível"
          description="O ambiente selecionado não está disponível para esta empresa. Selecione um ambiente em Ambientes." /></Card>
      ) : (
        <ConfigDetail config={config} presence={presence} observed={observed} companyName={companyName}
          environmentId={environmentId} onRefreshObserved={refreshObserved} />
      )}
    </>
  )
}

function ConfigDetail({ config, presence, observed, companyName, environmentId, onRefreshObserved }: {
  config: SafeEnvironmentConfig; presence: EnvironmentPresence | null; observed: EnvironmentObserved | null
  companyName: string | null; environmentId: number; onRefreshObserved: () => void | Promise<void>
}) {
  const env = config.environment
  const pres = presenceLabel(presence)
  const { hasPermission } = useAuth()
  // Guardrail: só quem tem prosight.operations.execute vê o botão de solicitar coleta.
  const canExecute = hasPermission('prosight.operations.execute')
  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho do ambiente */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
              <Server size={17} color="var(--primary)" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>
                {companyName ? `${companyName} · ` : ''}{env.name}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-light)' }}>{TYPE_LABEL[env.type] ?? env.type}</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={STATUS_VARIANT[env.status.code] ?? 'default'}>{env.status.label}</Badge>
            {/* Presença OBSERVADA (Conector) — conceito DISTINTO do status cadastral acima */}
            <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-light)' }}>
              Presença: <Badge variant={pres.variant}>{pres.label}</Badge>
              {presence?.observed?.since_s != null && <span>· há {fmtSince(presence.observed.since_s)}</span>}
            </span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          {env.responsible_name && <span>Responsável: <b style={{ color: 'var(--text)' }}>{env.responsible_name}</b></span>}
          {env.updated_at && <span>Atualizado: {new Date(env.updated_at).toLocaleString('pt-BR')}</span>}
          <span style={{ color: 'var(--text-light)' }}>{env.status.note} · Presença = observada pelo agente (Conector), não é o status cadastral.</span>
        </div>
      </div>

      {/* AppServers cadastrados */}
      <Section icon={ServerCog} title={`${config.appservers.length} AppServer${config.appservers.length === 1 ? '' : 's'} cadastrado${config.appservers.length === 1 ? '' : 's'}`}>
        {config.appservers.length === 0 ? <Empty /> : (
          <div className="flex flex-col gap-1">
            {config.appservers.map((a, i) => (
              <div key={i} className="text-sm font-mono truncate" style={{ color: 'var(--text)' }}>
                {a.name}{a.version ? ` · ${a.version}` : ''}{a.build ? ` · build ${a.build}` : ''}{a.patch ? ` · patch ${a.patch}` : ''}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Banco (engine + AlwaysOn cadastrado) */}
      <Section icon={Database} title="Banco de dados">
        {config.databases.length === 0 ? <Empty /> : (
          <div className="flex flex-col gap-1">
            {config.databases.map((d, i) => (
              <div key={i} className="text-sm" style={{ color: 'var(--text)' }}>
                {ENGINE_LABEL[d.engine] ?? d.engine}
                <span style={{ color: 'var(--text-light)' }}> · AlwaysOn (cadastrado): {d.always_on_cadastrado ? 'sim' : 'não'}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Links / integrações cadastradas */}
      <Section icon={Link2} title="Integrações cadastradas">
        {config.links.length === 0 ? <Empty /> : (
          <div className="flex flex-wrap gap-1.5">
            {config.links.map((l, i) => (
              <span key={i} className="rounded-full px-2.5 py-0.5 text-[11px]" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
                {l.label} · {l.kind}
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* OBSERVADO (Conector) — estado real coletado pelo agente; DISTINTO do cadastral, nunca reconcilia */}
      <ObservedSection observed={observed} environmentId={environmentId} canExecute={canExecute} onRefreshObserved={onRefreshObserved} />

      {/* Operações remotas ainda sem conexão (Connector-3+) */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--surface-hover)', border: '1px dashed var(--border)' }}>
        <div className="flex items-center gap-1.5 mb-2">
          <Boxes size={14} style={{ color: 'var(--text-muted)' }} />
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Operações remotas que ALTERAM infraestrutura — aguardando Connector-4+</span>
        </div>
        <div className="flex flex-col gap-1">
          {PENDING.map((p) => (
            <div key={p} className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>{p}</span>
              <span style={{ color: 'var(--text-light)' }}>Aguardando Conector</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function fmtStale(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

function ObservedSection({ observed, environmentId, canExecute, onRefreshObserved }: {
  observed: EnvironmentObserved | null; environmentId: number; canExecute: boolean
  onRefreshObserved: () => void | Promise<void>
}) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <ServerCog size={14} style={{ color: 'var(--text-light)' }} />
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Observado (Conector) — coletado pelo agente</span>
        </div>
        <div className="flex items-center gap-2">
          {observed?.stale_s != null && <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>coletado há {fmtStale(observed.stale_s)}</span>}
          {/* Connector-3 — solicitar NOVA coleta (perm operations.execute). Reusa comando collect_inventory_now. */}
          {canExecute && <InventoryCommandButton environmentId={environmentId} onCollected={onRefreshObserved} />}
        </div>
      </div>
      {!observed?.has_inventory || !observed.inventory ? (
        <div className="text-sm" style={{ color: 'var(--text-light)' }}>Inventário observado: aguardando coleta do agente.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* AppServers observados */}
          {observed.inventory.appservers.map((a, i) => (
            <div key={i} className="text-xs font-mono flex flex-wrap items-center gap-2" style={{ color: 'var(--text)' }}>
              <Badge variant={a.up ? 'success' : 'danger'}>{a.up ? 'up' : 'down'}</Badge>
              {a.name}{a.version ? ` · ${a.version}` : ''}{a.build ? ` · build ${a.build}` : ''}{a.patch ? ` · patch ${a.patch}` : ''}
              {/* C4.0 — incarnação do processo (opaca); muda no restart do AppServer */}
              {a.process_instance_id && <span style={{ color: 'var(--text-light)' }}>· inst {a.process_instance_id.slice(0, 8)}…</span>}
            </div>
          ))}
          {/* RPO observado (hash) */}
          {observed.inventory.rpo.map((r, i) => (
            <div key={`rpo${i}`} className="text-xs" style={{ color: 'var(--text-muted)' }}>
              RPO: <span className="font-mono">{r.hash.slice(0, 12)}…</span>{r.version ? ` · ${r.version}` : ''}
            </div>
          ))}
          {/* REST health observado */}
          {observed.inventory.rest.map((r, i) => (
            <div key={`rest${i}`} className="text-xs inline-flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              REST {r.name}: <Badge variant={r.healthy ? 'success' : 'danger'}>{r.healthy ? 'healthy' : 'unhealthy'}</Badge>
            </div>
          ))}
          {/* DIVERGÊNCIA Cadastral × Observado — nunca reconcilia */}
          {(observed.divergence?.length ?? 0) > 0 && (
            <div className="mt-1 rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning)' }}>
              <b>Divergência Cadastral × Observado:</b>
              {observed.divergence.map((d, i) => (
                <div key={i}>{d.appserver} · {d.field}: cadastral <b>{d.cadastral ?? '—'}</b> ≠ observado <b>{d.observed ?? '—'}</b></div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Connector-3 (C3-FE) — emitir collect_inventory_now e acompanhar o ciclo real ────────────────
// Reusa API/permissões/status/timeline existentes. Zero endpoint/tabela novos. Polling brando (3s,
// cap ~150s, para em terminal). succeeded = "a SOLICITAÇÃO de coleta terminou" (NÃO "Protheus saudável").
type CmdPhase = 'idle' | 'requesting' | 'queued' | 'collecting' | 'done' | 'failed' | 'expired' | 'canceled' | 'error'
const ACTIVE_PHASES: CmdPhase[] = ['requesting', 'queued', 'collecting']

function phaseFromStatus(s: ConnectorCommandStatus): CmdPhase {
  switch (s) {
    case 'queued': return 'queued'
    case 'claimed': case 'running': return 'collecting'
    case 'succeeded': return 'done'
    case 'failed': return 'failed'
    case 'expired': return 'expired'
    case 'canceled': return 'canceled'
    default: return 'idle'
  }
}

function InventoryCommandButton({ environmentId, onCollected }: { environmentId: number; onCollected: () => void | Promise<void> }) {
  const [phase, setPhase] = useState<CmdPhase>('idle')
  const [note, setNote] = useState<string | null>(null)
  const cmdRef = useRef<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const triesRef = useRef(0)
  const mounted = useRef(true)

  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  useEffect(() => () => { mounted.current = false; stopPoll() }, [])

  const start = useCallback(async () => {
    if (ACTIVE_PHASES.includes(phase)) return
    setPhase('requesting'); setNote(null); triesRef.current = 0
    try {
      const { command, coalesced } = await requestInventoryCollection(environmentId)
      if (!mounted.current) return
      cmdRef.current = command.id
      if (coalesced) setNote('Já havia uma coleta em andamento — acompanhando a existente.')
      const p0 = phaseFromStatus(command.status)
      setPhase(p0)
      if (!ACTIVE_PHASES.includes(p0)) { if (p0 === 'done') await onCollected(); return }
      stopPoll()
      pollRef.current = setInterval(async () => {
        triesRef.current += 1
        if (cmdRef.current == null || triesRef.current > 50) { stopPoll(); return } // cap ~150s (> TTL 120s)
        try {
          const c = await fetchCommandStatus(cmdRef.current)
          if (!mounted.current) return
          const p = phaseFromStatus(c.status)
          setPhase(p)
          if (!ACTIVE_PHASES.includes(p)) { stopPoll(); if (p === 'done') await onCollected() }
        } catch { /* transitório — continua até o cap */ }
      }, 3000)
    } catch (e) {
      if (!mounted.current) return
      stopPoll(); setPhase('error'); setNote(apiMessage(e, 'Não foi possível solicitar a coleta.'))
    }
  }, [environmentId, onCollected, phase])

  const busy = ACTIVE_PHASES.includes(phase)
  return (
    <div className="inline-flex items-center gap-2">
      <CmdStatusChip phase={phase} note={note} />
      <Button variant="secondary" icon={DownloadCloud} onClick={() => void start()} disabled={busy}>
        {busy ? 'Coletando…' : 'Solicitar nova coleta'}
      </Button>
    </div>
  )
}

const CMD_PHASE_UI: Record<Exclude<CmdPhase, 'idle'>, { label: string; variant: string }> = {
  requesting: { label: 'Solicitando…', variant: 'default' },
  queued: { label: 'Na fila…', variant: 'default' },
  collecting: { label: 'Coletando…', variant: 'warning' },
  done: { label: 'Coleta concluída', variant: 'success' }, // a SOLICITAÇÃO terminou (não é "saudável")
  failed: { label: 'Falha na coleta', variant: 'danger' },
  expired: { label: 'Solicitação expirada', variant: 'danger' },
  canceled: { label: 'Coleta cancelada', variant: 'default' },
  error: { label: 'Erro na solicitação', variant: 'danger' },
}

function CmdStatusChip({ phase, note }: { phase: CmdPhase; note: string | null }) {
  if (phase === 'idle') return null
  const m = CMD_PHASE_UI[phase]
  const showAudit = phase === 'failed' || phase === 'expired'
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] flex-wrap justify-end" style={{ color: 'var(--text-light)', maxWidth: 340 }}>
      <Badge variant={m.variant}>{m.label}</Badge>
      {showAudit && (
        <Link href="/prosight/atividade" className="inline-flex items-center gap-0.5 underline" style={{ color: 'var(--text-muted)' }}>
          auditoria <ExternalLink size={11} />
        </Link>
      )}
      {note && <span style={{ color: 'var(--text-light)' }}>{note}</span>}
    </span>
  )
}

function Section({ icon: Icon, title, children }: { icon: typeof Server; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={14} style={{ color: 'var(--text-light)' }} />
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function Empty() {
  return <div className="text-sm" style={{ color: 'var(--text-light)' }}>—</div>
}

function fmtSince(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}
