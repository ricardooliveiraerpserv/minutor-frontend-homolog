'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Operações RPO (Conector) — console operacional do ciclo RPO HOT (C5.4).
// Registrar → qualificar known_good → PROMOTE hot → reconciliar (C-2) → ROLLBACK hot.
// Backend é a AUTORIDADE: nada é inferido/otimista no FE. Sucesso = "publicação
// tecnicamente confirmada" (NÃO validação funcional). known_good ≠ last_successfully_published.
// Incidente (contradicted/partial_apply/recovery_failed/unresolved) → banner forte + resolução
// governada (reason obrigatório); NUNCA "tentar de novo" numa operação destrutiva ambígua.
// ZERO exposição de path/credencial/bytes: só ids e hashes sha256.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, ClipboardCopy, GitCompareArrows, History, Loader2,
  RotateCcw, ShieldCheck, Undo2, Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Select, Skeleton, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'

// ── tipos (só o necessário; espelham o BE sanitizado) ──
interface Client { customer_id: number; customer_name: string }
interface Env { id: number; name: string; type: string; status: string }
interface Consistency { consistent: boolean; hash: string | null; per_appserver: { appserver_ref: string; rpo_hash: string | null }[] }
interface Kg { artifact_id: number; hash: string; qualified_at?: string; qualification_id?: number }
interface Target {
  id: number; name: string; status: string; appserver_refs: string[]; consistency: Consistency
  last_known_good: Kg | null; last_successfully_published: { artifact_id: number; hash: string; at: string } | null
}
interface Artifact { id: number; hash: string; version: string | null; provenance: string; status: string; revision: number; superseded_by_id: number | null }
interface Qual { id: number; rpo_artifact_id: number; hash: string; reason: string; qualified_by: number; qualified_at: string; revoked_at: string | null }
interface Capability { declared: { name?: string; activation_mode?: string; contract_version?: number } | null; available: boolean }
interface Operation {
  id: number; op_type: string; status: string; approval_state: string; reconciliation_state: string | null
  requested_by: number; approved_by: number | null; approvals_count: number | null; required_approvals: number | null
  rpo_target_id: number | null; outcome_authority: string | null
  precondition_snapshot: { from_hash?: string; to_hash?: string; qualification?: { id: number } } | null
  resolution: { disposition: string; reason: string } | null
  created_at: string
}

// Incidentes que CONGELAM o ambiente (exigem resolução humana governada).
const INCIDENT = new Set(['contradicted', 'unresolved'])
const isIncident = (o: Operation) => INCIDENT.has(o.status)
const TERMINAL = new Set(['failed', 'expired', 'canceled', 'rejected', 'reconciled_success', 'reconciled_noop'])

// Rótulos HONESTOS (sem "saudável"/"validado"). success = confirmação técnica, não funcional.
const STATUS: Record<string, { label: string; variant: string }> = {
  pending_approval: { label: 'Aguardando aprovação', variant: 'warning' },
  approved: { label: 'Aprovada', variant: 'info' },
  dispatchable: { label: 'Liberada p/ agente', variant: 'info' },
  claimed: { label: 'Reivindicada', variant: 'info' },
  execution_committed: { label: 'Barreira cruzada', variant: 'info' },
  executing: { label: 'Efeito iniciado', variant: 'info' },
  verifying: { label: 'Verificando (C-2)', variant: 'info' },
  reconciling: { label: 'Reconciliando', variant: 'info' },
  indeterminate: { label: 'Indeterminada (aguarda C-2)', variant: 'warning' },
  reconciled_success: { label: 'Publicação tecnicamente confirmada', variant: 'success' },
  reconciled_noop: { label: 'Sem efeito (noop)', variant: 'default' },
  contradicted: { label: 'INCIDENTE — contradição', variant: 'danger' },
  unresolved: { label: 'INCIDENTE — não resolvido', variant: 'danger' },
  failed: { label: 'Falhou', variant: 'danger' },
  expired: { label: 'Expirada (sem claim)', variant: 'default' },
  canceled: { label: 'Cancelada', variant: 'default' },
  rejected: { label: 'Rejeitada', variant: 'default' },
}
const RECON: Record<string, string> = {
  success: 'confirmado', noop: 'sem efeito', partial_apply: 'APLICAÇÃO PARCIAL', recovery_failed: 'FALHA DE RECUPERAÇÃO',
  contradicted: 'contradição', unresolved: 'não resolvido',
}
const short = (h?: string | null) => (h ? h.slice(0, 12) + '…' : '—')
const copy = (v: string) => { void navigator.clipboard?.writeText(v); toast.success('Copiado.') }

export default function OperacoesRpoPage() {
  const { user } = useAuth()
  const perms: string[] = (user as { permissions?: string[] } | null)?.permissions ?? []
  const can = (p: string) => perms.includes('*') || perms.includes(p)

  const [clients, setClients] = useState<Client[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [envs, setEnvs] = useState<Env[]>([])
  const [envId, setEnvId] = useState<number | null>(null)
  const [cap, setCap] = useState<Capability | null>(null)
  const [targets, setTargets] = useState<Target[]>([])
  const [targetId, setTargetId] = useState<number | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [quals, setQuals] = useState<Qual[]>([])
  const [ops, setOps] = useState<Operation[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const [promoteOpen, setPromoteOpen] = useState(false)
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [qualifyOpen, setQualifyOpen] = useState(false)
  const [resolveFor, setResolveFor] = useState<Operation | null>(null)
  const [auditFor, setAuditFor] = useState<number | null>(null)

  const target = useMemo(() => targets.find((t) => t.id === targetId) ?? null, [targets, targetId])
  const liveIncident = useMemo(() => ops.find(isIncident) ?? null, [ops])
  const anyAlive = useMemo(() => ops.find((o) => !TERMINAL.has(o.status)) ?? null, [ops])

  // ── carregadores ──
  useEffect(() => { void api.get<Client[]>('/environments/clients').then(setClients).catch(() => {}) }, [])

  const loadEnvs = useCallback(async (cid: number) => {
    setEnvId(null); setTargets([]); setTargetId(null); setOps([]); setCap(null)
    try { const r = await api.get<{ data: { environments: Env[] } }>(`/prosight/environments?customer_id=${cid}`); setEnvs(r.data.environments) } catch { setEnvs([]) }
  }, [])

  const loadEnv = useCallback(async (eid: number) => {
    setLoading(true)
    try {
      const [capR, tgR, arR, opR] = await Promise.all([
        api.get<{ data: Capability }>(`/prosight/environments/${eid}/rpo/capability`),
        api.get<{ data: { targets: Target[] } }>(`/prosight/environments/${eid}/rpo/targets`),
        api.get<{ data: { registered: Artifact[] } }>(`/prosight/environments/${eid}/rpo/artifacts`),
        api.get<{ data: { operations: Operation[] } }>(`/prosight/environments/${eid}/operations`),
      ])
      setCap(capR.data); setTargets(tgR.data.targets); setArtifacts(arR.data.registered); setOps(opR.data.operations)
      if (tgR.data.targets.length && !tgR.data.targets.some((t) => t.id === targetId)) setTargetId(tgR.data.targets[0].id)
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao carregar ambiente.') }
    finally { setLoading(false) }
  }, [targetId])

  const loadQuals = useCallback(async (tid: number) => {
    try { const r = await api.get<{ data: { history: Qual[] } }>(`/prosight/rpo/targets/${tid}/qualifications`); setQuals(r.data.history) } catch { setQuals([]) }
  }, [])

  useEffect(() => { if (envId) void loadEnv(envId) }, [envId, loadEnv])
  useEffect(() => { if (targetId) void loadQuals(targetId) }, [targetId, loadQuals])

  const refresh = useCallback(() => { if (envId) void loadEnv(envId); if (targetId) void loadQuals(targetId) }, [envId, targetId, loadEnv, loadQuals])

  // polling leve enquanto há operação viva (acompanhamento — nunca declara sucesso no FE)
  useEffect(() => {
    if (!anyAlive || !envId) return
    const t = setInterval(() => { void loadEnv(envId) }, 5000)
    return () => clearInterval(t)
  }, [anyAlive, envId, loadEnv])

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); toast.success(ok); refresh() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha.') }
    finally { setBusy(false) }
  }

  const validQuals = quals.filter((q) => !q.revoked_at)

  return (
    <AppLayout title="Operações RPO">
      <PageHeader icon={GitCompareArrows} title="Operações RPO (Conector)"
        subtitle="Publicação e rollback governados de RPO — apenas ativação hot. O Conector/C-2 é a autoridade do resultado." />

      {/* Seleção de contexto */}
      <Card className="mb-4">
        <div className="flex flex-wrap gap-4 items-end">
          <Select label="Empresa" value={customerId ?? ''} onChange={(e) => { const v = Number(e.target.value) || null; setCustomerId(v); if (v) void loadEnvs(v) }}>
            <option value="">Selecione…</option>
            {clients.map((c) => <option key={c.customer_id} value={c.customer_id}>{c.customer_name}</option>)}
          </Select>
          <Select label="Ambiente" value={envId ?? ''} disabled={!envs.length} onChange={(e) => setEnvId(Number(e.target.value) || null)}>
            <option value="">Selecione…</option>
            {envs.map((en) => <option key={en.id} value={en.id}>{en.name} ({en.type})</option>)}
          </Select>
          {cap && (
            <Badge variant={cap.available ? 'success' : 'default'}>
              Capability {cap.available ? `hot=${cap.declared?.activation_mode ?? '?'} v${cap.declared?.contract_version ?? '?'}` : 'indisponível'}
            </Badge>
          )}
          {envId && <Button variant="ghost" size="sm" icon={RotateCcw} onClick={refresh}>Atualizar</Button>}
        </div>
      </Card>

      {loading && <Card><Skeleton className="h-24 w-full" /></Card>}

      {/* Banner de INCIDENTE (freeze) */}
      {liveIncident && (
        <Card className="mb-4" style={{ border: '2px solid var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, var(--surface))' }}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={22} style={{ color: 'var(--danger)' }} />
            <div className="flex-1">
              <div className="font-bold" style={{ color: 'var(--danger)' }}>
                Ambiente congelado — incidente na operação #{liveIncident.id} ({liveIncident.op_type})
              </div>
              <div className="text-sm mt-1">
                Estado: {STATUS[liveIncident.status]?.label ?? liveIncident.status}
                {liveIncident.reconciliation_state && ` · ${RECON[liveIncident.reconciliation_state] ?? liveIncident.reconciliation_state}`}.
                {' '}Nenhuma nova publicação/rollback é permitida até resolução governada. <strong>Não existe “tentar de novo”</strong> para uma operação destrutiva ambígua.
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="secondary" icon={History} onClick={() => setAuditFor(liveIncident.id)}>Auditoria</Button>
                {can('prosight.operations.rpo.approve') && (
                  <Button size="sm" variant="primary" onClick={() => setResolveFor(liveIncident)}>Resolver incidente</Button>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {envId && !loading && (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
          {/* TARGETS + detalhe */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Alvos (targets)</h3>
            </div>
            {!targets.length ? <EmptyState title="Nenhum target" description="Cadastre um target de RPO (cadastral + confirmação por observação)." /> : (
              <div className="flex flex-col gap-2">
                <Select label="Target" value={targetId ?? ''} onChange={(e) => setTargetId(Number(e.target.value) || null)}>
                  {targets.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.status}</option>)}
                </Select>
                {target && (
                  <div className="text-sm flex flex-col gap-1 mt-2">
                    <Row k="Confirmação"><Badge variant={target.status === 'confirmed' ? 'success' : 'warning'}>{target.status}</Badge></Row>
                    <Row k="Consistência">
                      <Badge variant={target.consistency.consistent ? 'success' : 'danger'}>{target.consistency.consistent ? 'consistente' : 'inconsistente'}</Badge>
                    </Row>
                    <Row k="RPO ativo (observed_current)"><Hash h={target.consistency.hash} /></Row>
                    <Row k="Membros">{target.appserver_refs.length} AppServer(s)</Row>
                    <Row k="Última publicação técnica"><Hash h={target.last_successfully_published?.hash} /> <span className="opacity-60 text-xs">≠ known_good</span></Row>
                    <Row k="Known_good atual">
                      {target.last_known_good ? <Hash h={target.last_known_good.hash} /> : <span className="opacity-60">nenhum</span>}
                    </Row>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="primary" icon={Upload} disabled={!!anyAlive || !can('prosight.operations.rpo.promote')} onClick={() => setPromoteOpen(true)}>Promover (hot)</Button>
                      <Button size="sm" variant="secondary" icon={Undo2} disabled={!!anyAlive || !can('prosight.operations.rpo.rollback')} onClick={() => setRollbackOpen(true)}>Rollback (hot)</Button>
                    </div>
                    {anyAlive && <div className="text-xs opacity-70 mt-1">Operação #{anyAlive.id} em andamento — novas ações bloqueadas (1 por ambiente).</div>}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* KNOWN-GOOD */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2"><ShieldCheck size={16} /> Known-good (contextual)</h3>
              {target && can('prosight.operations.rpo.qualify') && <Button size="sm" variant="ghost" onClick={() => setQualifyOpen(true)}>Qualificar</Button>}
            </div>
            {!target ? <EmptyState title="Selecione um target" /> : !validQuals.length ? <EmptyState title="Sem known-good" description="Qualifique um artefato registered como known_good deste target." /> : (
              <div className="flex flex-col gap-2 text-sm">
                {validQuals.map((q) => (
                  <div key={q.id} className="flex items-center justify-between border-b pb-1" style={{ borderColor: 'var(--border)' }}>
                    <div><Hash h={q.hash} /> <span className="opacity-60 text-xs">#{q.id} · art {q.rpo_artifact_id}</span><div className="text-xs opacity-60">{q.reason}</div></div>
                    {can('prosight.operations.rpo.qualify') && <Button size="sm" variant="ghost" onClick={() => void act(() => api.post(`/prosight/rpo/qualifications/${q.id}/revoke`, {}), 'Qualificação revogada.')}>Revogar</Button>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* OPERAÇÕES */}
          <Card style={{ gridColumn: '1 / -1' }}>
            <h3 className="font-semibold mb-3">Operações recentes</h3>
            {!ops.length ? <EmptyState title="Nenhuma operação" /> : (
              <div className="flex flex-col gap-2">
                {ops.slice(0, 15).map((o) => <OpRow key={o.id} o={o} can={can} busy={busy}
                  onApprove={() => void act(() => api.post(`/prosight/operations/${o.id}/approve`, {}), 'Aprovação registrada.')}
                  onReject={() => void act(() => api.post(`/prosight/operations/${o.id}/reject`, {}), 'Rejeitada.')}
                  onReconcile={() => void act(() => api.post(`/prosight/operations/${o.id}/reconcile`, {}), 'Reconciliação executada (autoridade C-2).')}
                  onResolve={() => setResolveFor(o)} onAudit={() => setAuditFor(o.id)} />)}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Modais */}
      {promoteOpen && target && <PromoteModal target={target} artifacts={artifacts} busy={busy}
        onClose={() => setPromoteOpen(false)}
        onDone={() => { setPromoteOpen(false); refresh() }} />}
      {rollbackOpen && target && <RollbackModal target={target} quals={validQuals} busy={busy}
        onClose={() => setRollbackOpen(false)} onDone={() => { setRollbackOpen(false); refresh() }} />}
      {qualifyOpen && target && <QualifyModal targetId={target.id} artifacts={artifacts.filter((a) => !a.superseded_by_id)} busy={busy}
        onClose={() => setQualifyOpen(false)} onDone={() => { setQualifyOpen(false); refresh() }} />}
      {resolveFor && <ResolveModal op={resolveFor} onClose={() => setResolveFor(null)} onDone={() => { setResolveFor(null); refresh() }} />}
      {auditFor && <AuditModal id={auditFor} onClose={() => setAuditFor(null)} />}
    </AppLayout>
  )
}

// ── subcomponentes ──
function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2"><span className="opacity-60">{k}</span><span className="flex items-center gap-1">{children}</span></div>
}
function Hash({ h }: { h?: string | null }) {
  if (!h) return <span className="opacity-60">—</span>
  return <span className="inline-flex items-center gap-1 font-mono text-xs">{short(h)}<button onClick={() => copy(h)} title="Copiar hash completo"><ClipboardCopy size={12} /></button></span>
}

function OpRow({ o, can, busy, onApprove, onReject, onReconcile, onResolve, onAudit }: {
  o: Operation; can: (p: string) => boolean; busy: boolean
  onApprove: () => void; onReject: () => void; onReconcile: () => void; onResolve: () => void; onAudit: () => void
}) {
  const st = STATUS[o.status] ?? { label: o.status, variant: 'default' }
  const s = o.precondition_snapshot ?? {}
  const canApprove = can('prosight.operations.rpo.approve')
  return (
    <div className="flex items-center gap-3 border-b pb-2 text-sm flex-wrap" style={{ borderColor: 'var(--border)' }}>
      <span className="font-mono opacity-60">#{o.id}</span>
      <Badge variant={o.op_type === 'rpo_rollback' ? 'info' : 'default'}>{o.op_type === 'rpo_rollback' ? 'ROLLBACK' : 'PROMOTE'}</Badge>
      <span className="font-mono text-xs">{short(s.from_hash)} → {short(s.to_hash)}</span>
      <Badge variant={st.variant}>{st.label}</Badge>
      {o.reconciliation_state && <span className="text-xs opacity-70">{RECON[o.reconciliation_state] ?? o.reconciliation_state}</span>}
      {o.status === 'pending_approval' && o.required_approvals != null && <span className="text-xs">{o.approvals_count ?? 0}/{o.required_approvals}</span>}
      {o.outcome_authority === 'human' && <Badge variant="warning">resolvido por humano</Badge>}
      <div className="flex gap-1 ml-auto">
        {o.status === 'pending_approval' && canApprove && <><Button size="sm" variant="primary" disabled={busy} onClick={onApprove}>Aprovar</Button><Button size="sm" variant="ghost" disabled={busy} onClick={onReject}>Rejeitar</Button></>}
        {['verifying', 'indeterminate', 'reconciling'].includes(o.status) && canApprove && <Button size="sm" variant="secondary" disabled={busy} onClick={onReconcile}>Reconciliar</Button>}
        {['contradicted', 'unresolved'].includes(o.status) && canApprove && <Button size="sm" variant="primary" disabled={busy} onClick={onResolve}>Resolver</Button>}
        <Button size="sm" variant="ghost" icon={History} onClick={onAudit}>Auditoria</Button>
      </div>
    </div>
  )
}

function PromoteModal({ target, artifacts, busy, onClose, onDone }: { target: Target; artifacts: Artifact[]; busy: boolean; onClose: () => void; onDone: () => void }) {
  const [artId, setArtId] = useState<number | null>(null)
  const [preview, setPreview] = useState<{ eligible: boolean; reasons: string[]; from?: { hash: string }; to?: { hash: string } } | null>(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const doPreview = async (id: number) => {
    setLoading(true); setPreview(null)
    try { const r = await api.post<{ data: typeof preview }>(`/prosight/rpo/targets/${target.id}/preview`, { to_artifact_id: id }); setPreview(r.data) }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha no preview.') } finally { setLoading(false) }
  }
  const create = async () => {
    if (!artId || !reason.trim()) return
    try { await api.post(`/prosight/rpo/targets/${target.id}/promote`, { to_artifact_id: artId, reason }); toast.success('Promoção criada — aguardando aprovação.'); onDone() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao criar.') }
  }
  return (
    <Modal open onClose={onClose} title="Promover RPO (hot)" width="max-w-xl">
      <div className="flex flex-col gap-3 text-sm">
        <Select label="Artefato de destino (registered)" value={artId ?? ''} onChange={(e) => { const v = Number(e.target.value) || null; setArtId(v); if (v) void doPreview(v) }}>
          <option value="">Selecione…</option>
          {artifacts.filter((a) => !a.superseded_by_id).map((a) => <option key={a.id} value={a.id}>#{a.id} · {short(a.hash)} · {a.version ?? 's/v'} · rev{a.revision}</option>)}
        </Select>
        {loading && <Loader2 className="animate-spin" size={16} />}
        {preview && (
          <div className="p-3 rounded-lg" style={{ background: 'var(--surface-2, var(--surface))', border: '1px solid var(--border)' }}>
            <div className="font-mono text-xs">{short(preview.from?.hash)} → {short(preview.to?.hash)}</div>
            {preview.eligible ? <Badge variant="success">Elegível</Badge> : <><Badge variant="danger">Inelegível</Badge><ul className="list-disc ml-5 mt-1 text-xs">{preview.reasons.map((r) => <li key={r}>{r}</li>)}</ul></>}
          </div>
        )}
        <TextInput label="Motivo (auditoria)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: publicação GMUD-1234" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={busy || !preview?.eligible || !reason.trim()} onClick={create}>Criar promoção</Button>
        </div>
        <p className="text-xs opacity-60">O backend REAVALIA a regra na criação e revalida no dispatch. Sucesso só após reconciliação C-2 (não é validação funcional).</p>
      </div>
    </Modal>
  )
}

function RollbackModal({ target, quals, busy, onClose, onDone }: { target: Target; quals: Qual[]; busy: boolean; onClose: () => void; onDone: () => void }) {
  const [qid, setQid] = useState<number | null>(null)
  const [preview, setPreview] = useState<{ eligible: boolean; reasons: string[]; from?: { hash: string }; to?: { hash: string }; selected?: { id: number }; other_valid_known_good?: unknown[] } | null>(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const doPreview = async (id: number) => {
    setLoading(true); setPreview(null)
    try { const r = await api.post<{ data: typeof preview }>(`/prosight/rpo/targets/${target.id}/rollback-preview`, { qualification_id: id }); setPreview(r.data) }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha no preview.') } finally { setLoading(false) }
  }
  const create = async () => {
    if (!qid || !reason.trim()) return
    try { await api.post(`/prosight/rpo/targets/${target.id}/rollback`, { qualification_id: qid, reason }); toast.success('Rollback criado — aguardando aprovação.'); onDone() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao criar.') }
  }
  return (
    <Modal open onClose={onClose} title="Rollback de RPO (hot)" width="max-w-xl">
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-xs opacity-70">Escolha EXPLICITAMENTE uma known-good válida (não “a última”). from = RPO observado atual.</p>
        <Select label="Known-good de destino (qualification)" value={qid ?? ''} onChange={(e) => { const v = Number(e.target.value) || null; setQid(v); if (v) void doPreview(v) }}>
          <option value="">Selecione…</option>
          {quals.map((q) => <option key={q.id} value={q.id}>#{q.id} · {short(q.hash)} · {q.reason}</option>)}
        </Select>
        {loading && <Loader2 className="animate-spin" size={16} />}
        {preview && (
          <div className="p-3 rounded-lg" style={{ background: 'var(--surface-2, var(--surface))', border: '1px solid var(--border)' }}>
            <div className="font-mono text-xs">{short(preview.from?.hash)} → {short(preview.to?.hash)}</div>
            {preview.eligible ? <Badge variant="success">Elegível</Badge> : <><Badge variant="danger">Inelegível</Badge><ul className="list-disc ml-5 mt-1 text-xs">{preview.reasons.map((r) => <li key={r}>{r === 'already_at_rollback_target' ? 'Target já está no destino escolhido' : r}</li>)}</ul></>}
          </div>
        )}
        <TextInput label="Motivo (auditoria)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: recuperação após incidente #NNN" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={busy || !preview?.eligible || !reason.trim()} onClick={create}>Criar rollback</Button>
        </div>
      </div>
    </Modal>
  )
}

function QualifyModal({ targetId, artifacts, busy, onClose, onDone }: { targetId: number; artifacts: Artifact[]; busy: boolean; onClose: () => void; onDone: () => void }) {
  const [artId, setArtId] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const create = async () => {
    if (!artId || !reason.trim()) return
    try { await api.post(`/prosight/rpo/targets/${targetId}/qualify`, { artifact_id: artId, reason }); toast.success('Artefato qualificado como known_good.'); onDone() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao qualificar.') }
  }
  return (
    <Modal open onClose={onClose} title="Qualificar known-good" width="max-w-lg">
      <div className="flex flex-col gap-3 text-sm">
        <Select label="Artefato (registered)" value={artId ?? ''} onChange={(e) => setArtId(Number(e.target.value) || null)}>
          <option value="">Selecione…</option>
          {artifacts.map((a) => <option key={a.id} value={a.id}>#{a.id} · {short(a.hash)} · {a.version ?? 's/v'}</option>)}
        </Select>
        <TextInput label="Motivo (por que é known-good)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={busy || !artId || !reason.trim()} onClick={create}>Qualificar</Button>
        </div>
      </div>
    </Modal>
  )
}

function ResolveModal({ op, onClose, onDone }: { op: Operation; onClose: () => void; onDone: () => void }) {
  const [disposition, setDisposition] = useState<'failed' | 'noop'>('failed')
  const [reason, setReason] = useState('')
  const create = async () => {
    if (!reason.trim()) return
    try { await api.post(`/prosight/operations/${op.id}/resolve`, { resolution: disposition, reason }); toast.success('Incidente resolvido (trava removida).'); onDone() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao resolver.') }
  }
  return (
    <Modal open onClose={onClose} title={`Resolver incidente #${op.id}`} width="max-w-lg">
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-xs opacity-70">Resolver FECHA o incidente e remove a trava — NÃO reescreve o passado para “sucesso” (autoridade física = C-2). A evidência observada é preservada.</p>
        <Select label="Disposição" value={disposition} onChange={(e) => setDisposition(e.target.value as 'failed' | 'noop')}>
          <option value="failed">Falha reconhecida (incidente tratado)</option>
          <option value="noop">Sem efeito (nenhuma mudança tomou)</option>
        </Select>
        <TextInput label="Motivo (obrigatório)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: rollback manual executado / investigação concluída" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!reason.trim()} onClick={create}>Resolver</Button>
        </div>
      </div>
    </Modal>
  )
}

interface Audit { operation: Operation; chain: Record<string, unknown>; timeline: { at: string; event: string; outcome: string; detail: string }[] }
function AuditModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [data, setData] = useState<Audit | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { void api.get<{ data: Audit }>(`/prosight/operations/${id}/audit`).then((r) => setData(r.data)).catch(() => toast.error('Falha na auditoria.')).finally(() => setLoading(false)) }, [id])
  const chain = data?.chain as { transition?: { from_hash?: string; to_hash?: string }; execution?: Record<string, string>; decision?: Record<string, string>; qualification?: { id: number } | null } | undefined
  return (
    <Modal open onClose={onClose} title={`Auditoria — operação #${id}`} width="max-w-2xl">
      {loading ? <Skeleton className="h-40 w-full" /> : !data ? <EmptyState title="Sem dados" /> : (
        <div className="flex flex-col gap-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <Row k="Tipo">{data.operation.op_type}</Row>
            <Row k="Transição"><span className="font-mono text-xs">{short(chain?.transition?.from_hash)} → {short(chain?.transition?.to_hash)}</span></Row>
            <Row k="execution_id"><span className="font-mono text-xs">{String(chain?.execution?.execution_id ?? '—').slice(0, 12)}…</span></Row>
            {chain?.qualification && <Row k="Qualification">#{chain.qualification.id}</Row>}
            <Row k="Barreira">{chain?.execution?.execution_committed_at ? '✓ committed' : '—'}</Row>
            <Row k="Efeito iniciado">{chain?.execution?.effect_started_at ? '✓' : '—'}</Row>
            <Row k="Decisão final"><Badge variant={STATUS[String(chain?.decision?.status)]?.variant ?? 'default'}>{STATUS[String(chain?.decision?.status)]?.label ?? String(chain?.decision?.status)}</Badge></Row>
            {chain?.decision?.outcome_authority && <Row k="Autoridade">{chain.decision.outcome_authority}</Row>}
          </div>
          <div>
            <h4 className="font-semibold mb-1 flex items-center gap-1"><History size={14} /> Timeline correlacionada</h4>
            <div className="flex flex-col gap-1">
              {data.timeline.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-xs border-b pb-1" style={{ borderColor: 'var(--border)' }}>
                  {e.outcome === 'fail' ? <AlertTriangle size={12} style={{ color: 'var(--danger)' }} /> : <CheckCircle2 size={12} style={{ color: 'var(--success)' }} />}
                  <span className="opacity-60 font-mono">{new Date(e.at).toLocaleString('pt-BR')}</span>
                  <span className="font-medium">{e.event}</span>
                  <span className="opacity-70">{e.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
