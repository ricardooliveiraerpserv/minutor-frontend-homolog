'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RPO-DISCOVERY (C5.0) — painel "Integração RPO" por AMBIENTE. Topologia DETECTADA pelo Connector
// (observação sanitizada) → Target SUGERIDO (agrupado por publish_unit_id) → CONFIRMAR (governado, → C5.1)
// → Operações RPO. Observação ≠ Capability (capacidade executável é fonte SEPARADA). Nunca "Cadastrar RPO".
// Divergência pós-confirmação é advisory (nunca auto-altera). Zero path/INI/secret na tela (só identidade).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Server, RotateCcw, CheckCircle2, AlertTriangle, RadioTower, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Select, Skeleton } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { fetchProsightEnvironments, requestInventoryCollection } from '@/lib/prosight/environments'

interface Env { id: number; name?: string; type?: string }
interface Member { appserver_ref: string; environment_name: string | null; role: string; role_source: string; publish_unit_id: string | null; rpo_hash: string | null; up: boolean; service_name: string | null }
interface Suggestion { environment_name: string | null; publish_unit_id: string; member_refs: string[]; members: { appserver_ref: string; role: string; role_source: string }[]; state: string; existing_target_id: number | null; suggested_name: string }
interface Divergence { target_id: number; name: string; reason: string; confirmed_refs: string[]; observed_refs: string[] | null }
interface Capability { name?: string; activation_mode?: string; restart_strategy?: string; contract_version?: number }
interface TopoView {
  observation: { observation_id: string | null; topology_revision: number; topology_fingerprint: string; agent_observed_at: string | null; backend_received_at: string | null; fresh: boolean; members: Member[] } | null
  suggestions: Suggestion[]; divergences: Divergence[]; capability: Capability | null
}

const roleLabel = (r: string, src: string) => {
  const base = ({ compiler: 'Compilador', slave: 'Slave', exclusive: 'Exclusivo', unknown: 'Papel desconhecido' } as Record<string, string>)[r] ?? r
  const prov = src === 'observed' ? 'observado' : src === 'configured' ? 'configurado' : src === 'inferred' ? 'inferido' : 'não provado'
  return `${base} · ${prov}`
}
const short = (s: string | null, n = 8) => (s ? s.slice(0, n) : '—')

export function RpoTopologyPanel({ customerId }: { customerId: number }) {
  const [envs, setEnvs] = useState<Env[]>([])
  const [envId, setEnvId] = useState<number | null>(null)
  const [data, setData] = useState<TopoView | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => { void fetchProsightEnvironments(customerId).then((e) => setEnvs(e as Env[])).catch(() => setEnvs([])) }, [customerId])

  const load = useCallback(async (eid: number) => {
    setLoading(true)
    try { const r = await api.get<{ data: TopoView }>(`/prosight/environments/${eid}/rpo/topology`); setData(r.data) }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao carregar topologia.'); setData(null) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (envId) void load(envId) }, [envId, load])

  const collect = async () => {
    if (!envId) return
    setBusy(true)
    try { await requestInventoryCollection(envId); toast.success('Coleta solicitada. A topologia aparece após o Connector reportar.'); setTimeout(() => void load(envId), 1500) }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao solicitar coleta.') }
    finally { setBusy(false) }
  }

  const confirm = async (s: Suggestion) => {
    if (!envId || !data?.observation) return
    setBusy(true)
    try {
      await api.post(`/prosight/environments/${envId}/rpo/topology/confirm`, {
        publish_unit_id: s.publish_unit_id, member_refs: s.member_refs,
        topology_revision: data.observation.topology_revision, topology_fingerprint: data.observation.topology_fingerprint,
      })
      toast.success('Target RPO confirmado. Publicação/rollback seguem em Operações RPO.')
      void load(envId)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Falha ao confirmar.'
      toast.error(msg)
      void load(envId) // recarrega (pode ter ficado stale)
    } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Ambiente" value={envId ?? ''} disabled={!envs.length} onChange={(e) => setEnvId(Number(e.target.value) || null)}>
          <option value="">Selecione…</option>
          {envs.map((en) => <option key={en.id} value={en.id}>{en.name ?? `Ambiente ${en.id}`}{en.type ? ` (${en.type})` : ''}</option>)}
        </Select>
        {envId && <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => void load(envId)}>Atualizar</Button>}
        {envId && <Button variant="secondary" size="sm" icon={RadioTower} loading={busy} onClick={() => void collect()}>Coletar configuração agora</Button>}
        {envId && <Link href="/operacoes-rpo" className="ml-auto"><Button variant="ghost" size="sm" icon={ArrowRight}>Abrir Operações RPO</Button></Link>}
      </div>

      {!envId ? (
        <Card><EmptyState icon={Server} title="Selecione um ambiente" description="A integração RPO é por ambiente. Escolha o ambiente para ver a topologia detectada." /></Card>
      ) : loading ? (
        <div className="grid gap-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : !data?.observation || !data.observation.fresh ? (
        <Card>
          <EmptyState icon={RadioTower} title="Topologia RPO ainda não detectada"
            description="O Connector precisa coletar a configuração dos AppServers deste ambiente antes que um Target RPO possa ser confirmado." />
          <div className="flex justify-center mt-2"><Button icon={RadioTower} loading={busy} onClick={() => void collect()}>Coletar configuração agora</Button></div>
        </Card>
      ) : (
        <>
          {/* Divergências (advisory) */}
          {data.divergences.length > 0 && data.divergences.map((d) => (
            <div key={d.target_id} className="flex items-start gap-2 rounded-xl px-4 py-2.5 text-xs" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning)' }}>
              <AlertTriangle size={14} className="mt-px shrink-0" />
              <span><b>Topologia divergente — revisão necessária</b> no target <b>{d.name}</b>. Confirmado {d.confirmed_refs.length} membro(s); observado {d.observed_refs?.length ?? '—'}. O membership NÃO é alterado automaticamente — reconfirme se desejar.</span>
            </div>
          ))}

          {/* Topologia detectada (observação) */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Topologia detectada (observada pelo Connector · rev {data.observation.topology_revision})</div>
            <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-sm">
                <thead><tr style={{ background: 'var(--surface)', color: 'var(--text-light)' }}>
                  {['AppServer', 'Environment', 'Papel', 'RPO / Unidade', 'Estado'].map((h) => <th key={h} className="text-left font-semibold px-3 py-2 text-[11px] uppercase tracking-wider">{h}</th>)}
                </tr></thead>
                <tbody>
                  {data.observation.members.map((m) => (
                    <tr key={m.appserver_ref} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--text)' }}>{short(m.appserver_ref, 8)}{m.service_name ? ` · ${m.service_name}` : ''}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{m.environment_name ?? '—'}</td>
                      <td className="px-3 py-2"><Badge variant={m.role === 'unknown' ? 'default' : 'default'}>{roleLabel(m.role, m.role_source)}</Badge></td>
                      <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{m.publish_unit_id ?? '—'} · {short(m.rpo_hash, 10)}</td>
                      <td className="px-3 py-2"><Badge variant={m.up ? 'success' : 'danger'}>{m.up ? 'up' : 'down'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Capacidade executável — FONTE SEPARADA (não é observação) */}
          <div className="flex items-start gap-2 rounded-xl px-4 py-2.5 text-xs" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            <Server size={14} className="mt-px shrink-0" style={{ color: 'var(--text-light)' }} />
            <span>
              <b>Capacidade executável (homologada)</b> — fonte separada da observação:{' '}
              {data.capability ? <>rpo_publish · ativação <b>{data.capability.activation_mode ?? '?'}</b>{data.capability.restart_strategy ? ` · ${data.capability.restart_strategy}` : ''}</> : <span style={{ color: 'var(--warning)' }}>não declarada pelo agente</span>}. Quem governa a execução é a capability, não a topologia.
            </span>
          </div>

          {/* Targets sugeridos */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Targets sugeridos (agrupados por unidade de publicação)</div>
            {data.suggestions.length === 0 ? (
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum grupo com unidade de publicação identificada.</div>
            ) : data.suggestions.map((s) => (
              <div key={s.publish_unit_id} className="rounded-xl px-3 py-2.5 mb-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                    {s.suggested_name} <span style={{ color: 'var(--text-light)' }}>· {s.member_refs.length} membro(s)</span>
                  </span>
                  {s.state === 'suggested_new' && <Button size="sm" icon={CheckCircle2} loading={busy} onClick={() => void confirm(s)}>Confirmar Target RPO</Button>}
                  {s.state === 'already_targeted' && <Badge variant="success">Já confirmado (target #{s.existing_target_id})</Badge>}
                  {s.state === 'conflict' && <Badge variant="warning">Conflito — revisão manual</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {s.members.map((mm) => <Badge key={mm.appserver_ref} variant="default">{short(mm.appserver_ref, 8)} · {roleLabel(mm.role, mm.role_source)}</Badge>)}
                </div>
              </div>
            ))}
          </div>

          <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>
            Confirmar um target apenas o registra para governança (C5). A publicação/rollback do RPO são realizadas em <b>Operações RPO</b>.
          </div>
        </>
      )}
    </div>
  )
}
