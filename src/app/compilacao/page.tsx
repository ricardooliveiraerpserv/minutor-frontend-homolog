'use client'

// ─────────────────────────────────────────────────────────────────────────────
// C6 — Console de COMPILAÇÃO (Conector). Fonte → Solicitar compilação → acompanhar
// execução → diagnóstico → artefato candidato → REGISTRAR no C5. Compile PRODUZ um
// artefato; NÃO publica RPO. Labels HONESTOS: "Compilado" ≠ "Publicado", "Artefato" ≠
// "Known-good". Três modos explícitos (Fixture/Teste · Simulado · Real). Live real ainda
// indisponível (validação física TOTVS pendente) — sem fake, sem fallback. A qualificação
// e a publicação pertencem ao fluxo de RPO (C5). Nunca "Publicado/Aplicado/Ativado" aqui.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Ban, CheckCircle2, FileCode2, Hammer, Loader2, RotateCcw, Send, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Select, Skeleton, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'

interface Client { customer_id: number; customer_name: string }
interface Env { id: number; name: string; type: string; status: string }
interface Capability {
  executable_modes: string[]
  allow_fixture: boolean
  supported_languages: string[]
  live: { available: boolean; reason: string | null }
  capability_declared: { name?: string; contract_version?: number } | null
}
interface Req {
  id: number; environment_id: number; repository: string; branch: string; source_path: string
  source_blob_sha: string; language: string; target: string | null; execution_mode: string
  classification: string | null; status: string; correlation_id: string; requested_at: string | null
}
interface Exec {
  id: number; execution_id: string; execution_mode: string; adapter: string | null
  status: string; outcome: string | null; error: string | null; diagnostics: Record<string, unknown> | null
  claimed_at: string | null; started_at: string | null; finished_at: string | null
}
interface Candidate {
  id: number; compile_execution_id: number; artifact_digest: string; artifact_unit: string
  size_bytes: number | null; artifact_metadata: Record<string, unknown> | null
  provenance: Record<string, unknown> | null; classification: string | null
  handoff_status: string; rpo_artifact_id: number | null; is_known_good: boolean; is_published: boolean
}
interface Detail { request: Req; context: Record<string, unknown> | null; executions: Exec[]; candidates: Candidate[] }

// ── Labels HONESTOS (impossível confundir estados) ──
const MODE_LABEL: Record<string, string> = { fixture: 'Fixture / Teste', simulated: 'Simulado', live: 'Real (TOTVS)' }
const modeLabel = (m: string) => MODE_LABEL[m] ?? m
const EXEC_LABEL: Record<string, string> = {
  pending: 'Pendente', claimed: 'Reivindicada', running: 'Executando',
  succeeded: 'Compilação concluída', failed: 'Falhou', timed_out: 'Tempo esgotado',
  cancelled: 'Cancelada', unknown: 'Indeterminado',
}
const execVariant = (s: string) => s === 'succeeded' ? 'success' : (['failed', 'timed_out'].includes(s) ? 'danger' : (s === 'unknown' ? 'warning' : 'default'))
const handoffLabel = (s: string) => s === 'registered'
  ? 'Registrado no C5 — ainda não qualificado'
  : (s === 'requested' ? 'Registro em andamento…' : 'Artefato candidato — ainda não registrado')

export default function CompilacaoPage() {
  const { user } = useAuth()
  const perms: string[] = (user as { permissions?: string[] } | null)?.permissions ?? []
  const can = (p: string) => perms.includes('*') || perms.includes(p)

  const [clients, setClients] = useState<Client[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [envs, setEnvs] = useState<Env[]>([])
  const [envId, setEnvId] = useState<number | null>(null)
  const [cap, setCap] = useState<Capability | null>(null)
  const [requests, setRequests] = useState<Req[]>([])
  const [selId, setSelId] = useState<number | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newOpen, setNewOpen] = useState(false)

  const canRequest = can('prosight.compile.request')
  const canHandoff = can('prosight.compile.handoff')

  // ── carregadores ──
  useEffect(() => { void api.get<Client[]>('/environments/clients').then(setClients).catch(() => {}) }, [])

  const loadEnvs = useCallback(async (cid: number) => {
    setEnvId(null); setCap(null); setRequests([]); setSelId(null); setDetail(null)
    try { const r = await api.get<{ data: { environments: Env[] } }>(`/prosight/environments?customer_id=${cid}`); setEnvs(r.data.environments) } catch { setEnvs([]) }
  }, [])

  const loadEnv = useCallback(async (eid: number) => {
    setLoading(true)
    try {
      const [capR, reqR] = await Promise.all([
        api.get<{ data: Capability }>(`/prosight/environments/${eid}/compile/capability`),
        api.get<{ data: { requests: Req[] } }>(`/prosight/environments/${eid}/compile/requests`),
      ])
      setCap(capR.data); setRequests(reqR.data.requests)
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao carregar ambiente.') }
    finally { setLoading(false) }
  }, [])

  const loadDetail = useCallback(async (id: number) => {
    try { const r = await api.get<{ data: Detail }>(`/prosight/compile/requests/${id}`); setDetail(r.data) } catch { setDetail(null) }
  }, [])

  useEffect(() => { if (envId) void loadEnv(envId) }, [envId, loadEnv])
  useEffect(() => { if (selId) void loadDetail(selId) }, [selId, loadDetail])

  const refresh = useCallback(() => { if (envId) void loadEnv(envId); if (selId) void loadDetail(selId) }, [envId, selId, loadEnv, loadDetail])

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); toast.success(ok); refresh() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha.') }
    finally { setBusy(false) }
  }

  const executeReq = async (id: number) => {
    setBusy(true)
    try {
      const r = await api.post<{ blocked?: boolean; message?: string; data?: unknown }>(`/prosight/compile/requests/${id}/execute`, {})
      if (r.blocked) { toast.warning(r.message || 'Compilação real ainda não disponível.') }
      else { toast.success('Execução concluída.') }
      refresh()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha na execução.') }
    finally { setBusy(false) }
  }

  const handoff = async (candidateId: number) => {
    setBusy(true)
    try {
      const r = await api.post<{ data: { message?: string } }>(`/prosight/compile/candidates/${candidateId}/handoff`, {})
      toast.success(r.data?.message || 'Artefato registrado. A qualificação e eventual publicação são realizadas no fluxo de RPO.')
      refresh()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao registrar no C5.') }
    finally { setBusy(false) }
  }

  const availableModes = useMemo(() => {
    const m = [...(cap?.executable_modes ?? [])]
    if (cap?.allow_fixture && !m.includes('fixture')) m.unshift('fixture')
    return m
  }, [cap])

  return (
    <AppLayout title="Compilação">
      <PageHeader icon={Hammer} title="Compilação (Conector)"
        subtitle="Compila uma fonte e produz um artefato candidato. Compilar não publica RPO — a qualificação e a publicação seguem no fluxo de RPO (C5)." />

      {/* Contexto */}
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
            <div className="flex flex-wrap gap-2 items-center">
              {availableModes.map((m) => <Badge key={m} variant={m === 'live' ? 'default' : 'success'}>{modeLabel(m)}</Badge>)}
              {/* Live: estado explícito, jamais confundível com disponível */}
              <Badge variant={cap.live.available ? 'success' : 'warning'}>
                {cap.live.available ? 'Compilação real disponível' : 'Compilação real ainda não disponível'}
              </Badge>
            </div>
          )}
          {envId && <Button variant="ghost" size="sm" icon={RotateCcw} onClick={refresh}>Atualizar</Button>}
          {envId && canRequest && <Button size="sm" icon={FileCode2} onClick={() => setNewOpen(true)}>Nova compilação</Button>}
        </div>
      </Card>

      {loading ? (
        <div className="grid gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : !envId ? (
        <Card><EmptyState icon={Hammer} title="Selecione empresa e ambiente" description="A compilação é por ambiente. Escolha o contexto para começar." /></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Lista de compilações */}
          <Card>
            <div className="mb-3 font-semibold" style={{ color: 'var(--text)' }}>Compilações recentes</div>
            {requests.length === 0 ? (
              <EmptyState icon={FileCode2} title="Nenhuma compilação" description="Solicite uma nova compilação de uma fonte." />
            ) : (
              <div className="flex flex-col gap-2">
                {requests.map((r) => (
                  <button key={r.id} onClick={() => setSelId(r.id)}
                    className="text-left rounded-xl px-3 py-2 transition"
                    style={{ background: selId === r.id ? 'var(--primary-soft)' : 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate" style={{ color: 'var(--text)' }}>#{r.id} · {r.source_path}</span>
                      <Badge variant="default">{modeLabel(r.execution_mode)}</Badge>
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {r.language.toUpperCase()} · {r.repository} · blob {r.source_blob_sha.slice(0, 10)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Detalhe */}
          <Card>
            {!detail ? (
              <EmptyState icon={FileCode2} title="Selecione uma compilação" description="Veja execução, diagnóstico e artefato candidato." />
            ) : (
              <CompileDetail
                detail={detail} busy={busy} canRequest={canRequest} canHandoff={canHandoff}
                onExecute={() => void executeReq(detail.request.id)}
                onCancel={() => void act(() => api.post(`/prosight/compile/requests/${detail.request.id}/cancel`, {}), 'Compilação cancelada.')}
                onHandoff={(cid) => void handoff(cid)}
              />
            )}
          </Card>
        </div>
      )}

      {newOpen && cap && (
        <NewCompileModal
          modes={availableModes} languages={cap.supported_languages}
          onClose={() => setNewOpen(false)} busy={busy}
          onCreate={async (body) => {
            setBusy(true)
            try {
              const r = await api.post<{ data: { id: number } }>(`/prosight/environments/${envId}/compile/requests`, body)
              toast.success('Compilação solicitada.'); setNewOpen(false); setSelId(r.data.id); refresh()
            } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao solicitar.') }
            finally { setBusy(false) }
          }}
        />
      )}
    </AppLayout>
  )
}

// ── Detalhe: execuções + diagnóstico + artefato candidato ──
function CompileDetail({ detail, busy, canRequest, canHandoff, onExecute, onCancel, onHandoff }: {
  detail: Detail; busy: boolean; canRequest: boolean; canHandoff: boolean
  onExecute: () => void; onCancel: () => void; onHandoff: (candidateId: number) => void
}) {
  const { request: r, executions, candidates } = detail
  const alive = executions.some((e) => !['succeeded', 'failed', 'timed_out', 'cancelled', 'unknown'].includes(e.status))
  const lastExec = executions[executions.length - 1] ?? null
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-semibold" style={{ color: 'var(--text)' }}>#{r.id} · {r.source_path}</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.repository}@{r.branch} · {r.language.toUpperCase()} · <Badge variant="default">{modeLabel(r.execution_mode)}</Badge></div>
        </div>
        <div className="flex gap-2">
          {canRequest && !alive && <Button size="sm" icon={Hammer} loading={busy} onClick={onExecute}>Compilar</Button>}
          {canRequest && r.status !== 'completed' && r.status !== 'canceled' && <Button size="sm" variant="ghost" icon={Ban} onClick={onCancel}>Cancelar</Button>}
        </div>
      </div>

      {/* Execuções */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Execuções</div>
        {executions.length === 0 ? (
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Ainda não executada. Use “Compilar”.</div>
        ) : executions.map((e) => (
          <div key={e.id} className="rounded-xl px-3 py-2 mb-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm">
                {e.status === 'running' && <Loader2 size={13} className="animate-spin" />}
                {e.status === 'succeeded' && <CheckCircle2 size={13} style={{ color: 'var(--success)' }} />}
                {['failed', 'timed_out'].includes(e.status) && <AlertTriangle size={13} style={{ color: 'var(--danger)' }} />}
                <Badge variant={execVariant(e.status)}>{EXEC_LABEL[e.status] ?? e.status}</Badge>
                <span style={{ color: 'var(--text-muted)' }}>{e.execution_id.slice(0, 8)}</span>
              </span>
              {e.error && <span className="text-[11px]" style={{ color: 'var(--danger)' }}>{e.error === 'live_unavailable' ? 'Compilação real ainda não disponível' : e.error}</span>}
            </div>
            {e.diagnostics && Object.keys(e.diagnostics).length > 0 && (
              <pre className="mt-1 text-[11px] overflow-x-auto rounded-lg p-2" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>{JSON.stringify(e.diagnostics, null, 2)}</pre>
            )}
          </div>
        ))}
      </div>

      {/* Artefato candidato */}
      {candidates.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Artefato candidato</div>
          {candidates.map((c) => (
            <div key={c.id} className="rounded-xl px-3 py-2.5 mb-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <FileCode2 size={14} style={{ color: 'var(--primary)' }} />
                  <span className="font-mono text-xs" style={{ color: 'var(--text)' }}>{c.artifact_digest.slice(0, 16)}…</span>
                  <Badge variant="default">{c.artifact_unit}</Badge>
                </span>
                <Badge variant={c.handoff_status === 'registered' ? 'success' : 'warning'}>{handoffLabel(c.handoff_status)}</Badge>
              </div>
              {/* Fronteira arquitetural explícita */}
              <div className="mt-1.5 flex items-start gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <ShieldCheck size={13} className="mt-px shrink-0" style={{ color: 'var(--text-light)' }} />
                <span>Compilado ≠ Publicado · Artefato ≠ Known-good. A qualificação e a publicação são realizadas no fluxo de RPO (C5).</span>
              </div>
              {c.handoff_status === 'none' && canHandoff && (
                <div className="mt-2">
                  <Button size="sm" icon={Send} loading={busy} onClick={() => onHandoff(c.id)}>Registrar artefato no C5</Button>
                </div>
              )}
              {c.handoff_status === 'registered' && (
                <div className="mt-2 text-[11px]" style={{ color: 'var(--success)' }}>
                  Artefato registrado no C5 (id {c.rpo_artifact_id}). A qualificação e eventual publicação são realizadas no fluxo de RPO.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {lastExec && lastExec.status === 'succeeded' && candidates.length === 0 && (
        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Execução concluída sem artefato registrável.</div>
      )}
    </div>
  )
}

// ── Modal: solicitar nova compilação ──
function NewCompileModal({ modes, languages, onClose, onCreate, busy }: {
  modes: string[]; languages: string[]; onClose: () => void; busy: boolean
  onCreate: (body: Record<string, unknown>) => void | Promise<void>
}) {
  const [repository, setRepository] = useState('')
  const [branch, setBranch] = useState('main')
  const [sourcePath, setSourcePath] = useState('')
  const [blob, setBlob] = useState('')
  const [language, setLanguage] = useState(languages[0] ?? 'advpl')
  const [target, setTarget] = useState('appserver')
  const [mode, setMode] = useState(modes.includes('simulated') ? 'simulated' : (modes[0] ?? 'simulated'))
  const [classification, setClassification] = useState('test')
  const valid = repository.includes('/') && sourcePath.trim() && /^[0-9a-f]{64}$/i.test(blob.trim())
  return (
    <Modal open onClose={onClose} title="Nova compilação">
      <div className="flex flex-col gap-3">
        <TextInput label="Repositório (owner/repo)" value={repository} onChange={(e) => setRepository(e.target.value)} placeholder="erpserv/cliente" />
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
          <Select label="Linguagem" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {languages.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
          </Select>
        </div>
        <TextInput label="Caminho da fonte" value={sourcePath} onChange={(e) => setSourcePath(e.target.value)} placeholder="src/PROGRAMA.prw" />
        <TextInput label="Blob SHA (git, 64 hex)" value={blob} onChange={(e) => setBlob(e.target.value)} placeholder="sha256 do blob da fonte" />
        <div className="grid grid-cols-3 gap-3">
          <TextInput label="Target" value={target} onChange={(e) => setTarget(e.target.value)} />
          <Select label="Modo" value={mode} onChange={(e) => setMode(e.target.value)}>
            {modes.map((m) => <option key={m} value={m}>{MODE_LABEL[m] ?? m}</option>)}
          </Select>
          <Select label="Classificação" value={classification} onChange={(e) => setClassification(e.target.value)}>
            <option value="test">Teste</option>
            <option value="demo">Demo</option>
            <option value="operational">Operacional</option>
          </Select>
        </div>
        {mode === 'live' && (
          <div className="flex items-start gap-1.5 text-[11px] rounded-lg px-3 py-2" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning)' }}>
            <AlertTriangle size={13} className="mt-px shrink-0" />
            <span>Modo Real: a compilação TOTVS real ainda não está disponível. A execução ficará bloqueada com aviso explícito — nenhum resultado falso é produzido.</span>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button icon={FileCode2} disabled={!valid} loading={busy}
            onClick={() => onCreate({ repository, branch, source_path: sourcePath, source_blob_sha: blob.trim().toLowerCase(), language, target, execution_mode: mode, classification })}>
            Solicitar compilação
          </Button>
        </div>
      </div>
    </Modal>
  )
}
