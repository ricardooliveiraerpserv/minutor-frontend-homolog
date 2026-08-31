'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ENV-HUB — seção "Integração Protheus (Connector · AppServers · RPO)" no detalhe do ambiente.
// Recompõe a jornada: readiness + próximo passo → vincular AppServers observados aos cadastrais
// (binding HUMANO, nunca auto) → RPO → Operações. Orquestra endpoints existentes (deep-links), não duplica.
// Zero secret/INI/path. Estados são DERIVADOS pelo backend (operational-status/reconciliation).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { RadioTower, Server, CheckCircle2, AlertTriangle, ArrowRight, Link2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, Skeleton } from '@/components/ds'
import { api, ApiError } from '@/lib/api'

interface OpStatus {
  connector: { status: string; last_seen_at: string | null; connector_id: string | null }
  appservers: { configured: number; observed: number; bound: number; divergent: number; up: number; down: number; unbound: number }
  rpo: { discovery_status: string; targets: number; confirmed: number; consistency: string; divergence: boolean }
  readiness: string
  blocking_reasons: string[]
  attention_reasons: string[]
  journey: { progress: number; total: number; steps: { key: string; label: string; done: boolean }[]; next_step: string | null }
  actions: Record<string, boolean>
}
interface ReconRow {
  kind: string; env_appserver_id?: number; appserver_ref?: string | null; name?: string | null; state: string
  binding_id?: number | null; observed_up?: boolean | null
  suggestion?: { appserver_ref?: string; env_appserver_id?: number; name?: string | null } | null; suggestion_ambiguous?: boolean
}

const READINESS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'default' }> = {
  ready: { label: '● Operacional', variant: 'success' },
  attention: { label: 'Requer atenção', variant: 'warning' },
  setup_required: { label: 'Configuração incompleta', variant: 'warning' },
  unavailable: { label: 'Indisponível', variant: 'danger' },
}
const CONN: Record<string, string> = { not_enrolled: 'Não vinculado', never_seen: 'Sem heartbeat', online: 'Online', degraded: 'Online (degradado)', stale: 'Instável', offline: 'Offline', revoked: 'Revogado' }
const STATE_LABEL: Record<string, string> = {
  healthy: 'Vinculado · Online', bound_down: 'Vinculado · Offline', not_observed: 'Vinculado · não observado',
  connector_stale: 'Connector instável', connector_replaced: 'Connector trocado — revincular', cadastral_missing: 'Cadastral removido',
  unbound_cadastral: 'Cadastrado · aguardando vínculo', detected_unbound: 'Detectado · não vinculado', conflict: 'Conflito',
}
const BLOCK_LABEL: Record<string, string> = {
  connector_not_enrolled: 'Vincular o Connector', connector_offline: 'Connector offline', connector_revoked: 'Connector revogado',
  no_appservers: 'Cadastrar/detectar AppServers', appservers_unbound: 'Vincular os AppServers detectados', rpo_not_confirmed: 'Configurar o RPO',
}

export function EnvHubSection({ environmentId, customerId }: { environmentId: number; customerId?: number }) {
  const [st, setSt] = useState<OpStatus | null>(null)
  const [rows, setRows] = useState<ReconRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, r] = await Promise.all([
        api.get<{ data: OpStatus }>(`/prosight/environments/${environmentId}/operational-status`),
        api.get<{ data: { rows: ReconRow[] } }>(`/prosight/environments/${environmentId}/appservers/reconciliation`),
      ])
      setSt(s.data); setRows(r.data.rows)
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao carregar status.') }
    finally { setLoading(false) }
  }, [environmentId])

  useEffect(() => { void load() }, [load])

  const collect = async () => {
    setBusy(true)
    try { await api.post(`/prosight/environments/${environmentId}/commands`, { command_type: 'collect_inventory_now' }); toast.success('Coleta solicitada.'); setTimeout(load, 1500) }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao coletar.') }
    finally { setBusy(false) }
  }

  const bind = async (envAppserverId: number, ref: string) => {
    setBusy(true)
    try { await api.post(`/prosight/environments/${environmentId}/appservers/${envAppserverId}/bind`, { appserver_ref: ref }); toast.success('Vínculo confirmado.'); void load() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao vincular.'); void load() }
    finally { setBusy(false) }
  }

  if (loading) return <Skeleton className="h-40 rounded-xl" />
  if (!st) return null
  const rd = READINESS[st.readiness] ?? READINESS.setup_required
  const canBind = !!st.actions.can_bind
  const cadastralRows = rows.filter((r) => r.kind === 'cadastral')
  const observedUnbound = rows.filter((r) => r.kind === 'observed')

  return (
    <Card>
      {/* Cabeçalho + readiness + jornada */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}><Server size={16} /> Integração Protheus (Connector · AppServers · RPO)</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Jornada operacional do ambiente. Publicação/rollback do RPO seguem em Operações RPO.</div>
        </div>
        <Badge variant={rd.variant}>{rd.label}</Badge>
      </div>

      {/* Configuração N de M + próximo passo */}
      <div className="rounded-xl px-4 py-3 mb-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>Configuração {st.journey.progress} de {st.journey.total}</div>
        <div className="flex flex-col gap-1">
          {st.journey.steps.map((s) => (
            <div key={s.key} className="flex items-center gap-2 text-sm">
              {s.done ? <CheckCircle2 size={14} style={{ color: 'var(--success)' }} /> : <span className="inline-block w-3.5 h-3.5 rounded-full" style={{ border: '1.5px solid var(--warning)' }} />}
              <span style={{ color: s.done ? 'var(--text-muted)' : 'var(--text)' }}>{s.label}</span>
            </div>
          ))}
        </div>
        {st.blocking_reasons.length > 0 && (() => {
          const reason = st.blocking_reasons[0]
          const isConnector = reason === 'connector_not_enrolled' || reason === 'connector_offline' || reason === 'connector_revoked'
          const goToConnector = () => {
            const el = typeof document !== 'undefined' ? document.getElementById('connector-conexao-card') : null
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            else window.location.href = '/prosight/configuracao'
          }
          return (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--warning)' }}>
              <span>Próxima etapa: <b>{BLOCK_LABEL[reason] ?? reason}</b></span>
              {isConnector && (
                <button type="button" onClick={goToConnector}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium"
                  style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                  <RadioTower size={12} /> Ir para gerar token
                </button>
              )}
            </div>
          )
        })()}
      </div>

      {/* Connector */}
      <div className="flex items-center justify-between gap-2 py-2" style={{ borderTop: '1px solid var(--border)' }}>
        <span className="text-sm"><RadioTower size={14} className="inline mr-1.5" style={{ color: 'var(--text-light)' }} />Connector: <b>{CONN[st.connector.status] ?? st.connector.status}</b></span>
        <div className="flex gap-2">
          {st.actions.can_collect && <Button size="sm" variant="secondary" icon={RadioTower} loading={busy} onClick={() => void collect()}>Coletar inventário</Button>}
          {st.actions.can_manage_connector && <Link href="/prosight/configuracao"><Button size="sm" variant="ghost">Gerenciar Connector</Button></Link>}
        </div>
      </div>

      {/* AppServers — reconciliação/binding */}
      <div className="py-2" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="text-sm mb-1.5">AppServers · <b>{st.appservers.configured}</b> cadastrados · <b>{st.appservers.observed}</b> detectados · <b>{st.appservers.bound}</b> vinculados · <b>{st.appservers.divergent}</b> divergências</div>
        {cadastralRows.map((r) => (
          <div key={`c${r.env_appserver_id}`} className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 mb-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <span className="text-sm truncate"><b>{r.name}</b> <Badge variant={r.state === 'healthy' ? 'success' : (['not_observed', 'connector_replaced', 'cadastral_missing', 'conflict', 'bound_down'].includes(r.state) ? 'warning' : 'default')}>{STATE_LABEL[r.state] ?? r.state}</Badge></span>
            {r.state === 'unbound_cadastral' && canBind && (
              r.suggestion?.appserver_ref ? (
                <span className="flex items-center gap-2 text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>Possível: {r.suggestion.name ?? ''} · {r.suggestion.appserver_ref.slice(0, 8)}</span>
                  <Button size="sm" icon={Link2} loading={busy} onClick={() => void bind(r.env_appserver_id!, r.suggestion!.appserver_ref!)}>Confirmar vínculo</Button>
                </span>
              ) : (
                <span className="text-xs" style={{ color: 'var(--text-light)' }}>{r.suggestion_ambiguous ? 'Correspondência não determinada — selecione abaixo' : 'Aguardando detecção'}</span>
              )
            )}
          </div>
        ))}
        {/* Observados ainda não vinculados (seleção explícita) */}
        {observedUnbound.length > 0 && (
          <div className="mt-1.5">
            <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Detectados não vinculados</div>
            {observedUnbound.map((o) => (
              <div key={`o${o.appserver_ref}`} className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 mb-1" style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}>
                <span className="text-sm"><b>{o.name}</b> · {o.appserver_ref?.slice(0, 8)} <Badge variant={o.observed_up ? 'success' : 'default'}>{o.observed_up ? 'online' : 'offline'}</Badge></span>
                {canBind && o.suggestion?.env_appserver_id && (
                  <Button size="sm" variant="secondary" icon={Link2} loading={busy} onClick={() => void bind(o.suggestion!.env_appserver_id!, o.appserver_ref!)}>Vincular a {o.suggestion.name}</Button>
                )}
              </div>
            ))}
          </div>
        )}
        {!canBind && (cadastralRows.some((r) => r.state === 'unbound_cadastral') || observedUnbound.length > 0) && (
          <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>Vínculo de AppServer requer permissão (appserver.bind).</div>
        )}
      </div>

      {/* RPO */}
      <div className="flex items-center justify-between gap-2 py-2 flex-wrap" style={{ borderTop: '1px solid var(--border)' }}>
        <span className="text-sm">RPO: <b>{st.rpo.discovery_status === 'confirmed' ? 'Configurado' : (st.rpo.discovery_status === 'detected' ? 'Detectado · aguardando confirmação' : 'Não detectado')}</b>{st.rpo.confirmed > 0 && <> · {st.rpo.consistency === 'consistent' ? '● consistente' : (st.rpo.divergence ? '⚠ divergente' : '')}</>}</span>
        <div className="flex gap-2">
          {st.actions.can_manage_rpo && <Link href="/prosight/configuracao"><Button size="sm" variant="ghost" icon={ArrowRight}>Revisar RPO</Button></Link>}
          <Link href="/operacoes-rpo"><Button size="sm" variant="ghost" icon={ArrowRight}>Abrir Operações RPO</Button></Link>
        </div>
      </div>

      <div className="flex justify-end mt-1"><Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => void load()}>Atualizar</Button></div>
    </Card>
  )
}
