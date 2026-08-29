'use client'
// PATCH — console de produção GOVERNADA de artefato (Conector). Jornada: Entrada → Solicitação → Execução →
// Resultado → Artefato candidato → Registrar no C5. Fixture/simulated (SEM física TOTVS; Live indisponível).
// Rótulos HONESTOS: candidato ≠ registrado ≠ qualificado ≠ publicado. Patch aplicado ao workspace ≠ publicado em prod.
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Boxes, CheckCircle2, FileCode2, Layers, Loader2, PlayCircle, RotateCcw, Send, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Select, Skeleton, Table, Tbody, Td, Th, Thead, Tr, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'

interface Client { customer_id: number; customer_name: string }
interface Env { id: number; name: string; type: string; status: string }
interface Avail { fixture: Mode; simulated: Mode; live: Mode }
interface Mode { available: boolean; reason: string | null }
interface Input { id: number; patch_id: string; digest: string; provenance: string | null; classification: string | null }
interface Req { id: number; base_rpo_hash: string; execution_mode: string; workspace_unit_id: string | null; batch_digest: string | null; status: string }
interface Cand { id: number; patch_execution_id: number; candidate_digest: string; base_rpo_digest: string; batch_digest: string; handoff_status: string; is_simulated: boolean; is_registered: boolean; is_qualified: boolean; is_published: boolean; rpo_artifact_id: number | null; c5_artifact_nav: string | null; label: string }

function SectionHeader({ icon: Icon, title, action }: { icon: React.ComponentType<{ size?: number }>; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2 font-medium"><Icon size={16} /> {title}</div>
      {action}
    </div>
  )
}

export default function PatchConsole() {
  const { user } = useAuth()
  const perms: string[] = (user as { permissions?: string[] } | null)?.permissions ?? []
  const can = (p: string) => perms.includes('*') || perms.includes(p)

  const [clients, setClients] = useState<Client[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [envs, setEnvs] = useState<Env[]>([])
  const [envId, setEnvId] = useState<number | null>(null)
  const [avail, setAvail] = useState<Avail | null>(null)
  const [inputs, setInputs] = useState<Input[]>([])
  const [reqs, setReqs] = useState<Req[]>([])
  const [cands, setCands] = useState<Cand[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  const [inputOpen, setInputOpen] = useState(false)
  const [reqOpen, setReqOpen] = useState(false)
  const [handoffFor, setHandoffFor] = useState<Cand | null>(null)
  const [fPatchId, setFPatchId] = useState(''); const [fDigest, setFDigest] = useState(''); const [fProv, setFProv] = useState('')
  const [fBase, setFBase] = useState(''); const [fWs, setFWs] = useState(''); const [fInputs, setFInputs] = useState<number[]>([])

  useEffect(() => { void api.get<Client[]>('/environments/clients').then(setClients).catch(() => {}) }, [])

  const loadEnvs = useCallback(async (cid: number) => {
    setEnvId(null); setInputs([]); setReqs([]); setCands([]); setAvail(null)
    try { const r = await api.get<{ data: { environments: Env[] } }>(`/prosight/environments?customer_id=${cid}`); setEnvs(r.data.environments) } catch { setEnvs([]) }
  }, [])

  const loadEnv = useCallback(async (eid: number) => {
    setLoading(true)
    try {
      const [avR, inR, rqR, cdR] = await Promise.all([
        api.get<{ data: Avail }>(`/prosight/environments/${eid}/patch/availability`),
        api.get<{ data: { inputs: Input[] } }>(`/prosight/environments/${eid}/patch/inputs`),
        api.get<{ data: { requests: Req[] } }>(`/prosight/environments/${eid}/patch/requests`),
        api.get<{ data: { candidates: Cand[] } }>(`/prosight/environments/${eid}/patch/candidates`),
      ])
      setAvail(avR.data); setInputs(inR.data.inputs); setReqs(rqR.data.requests); setCands(cdR.data.candidates)
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao carregar ambiente.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (envId) void loadEnv(envId) }, [envId, loadEnv])
  const refresh = useCallback(() => { if (envId) void loadEnv(envId) }, [envId, loadEnv])

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); toast.success(ok); refresh() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha.') }
    finally { setBusy(false) }
  }

  const createInput = () => act(async () => {
    await api.post(`/prosight/environments/${envId}/patch/inputs`, { patch_id: fPatchId, digest: fDigest.trim().toLowerCase(), provenance: fProv || undefined, classification: 'test' })
    setInputOpen(false); setFPatchId(''); setFDigest(''); setFProv('')
  }, 'Entrada registrada.')

  const createReq = () => act(async () => {
    await api.post(`/prosight/environments/${envId}/patch/requests`, { base_rpo_hash: fBase.trim().toLowerCase(), execution_mode: 'simulated', workspace_unit_id: fWs || undefined, patch_input_ids: fInputs, classification: 'test' })
    setReqOpen(false); setFBase(''); setFWs(''); setFInputs([])
  }, 'Solicitação criada.')

  const dispatch = (rq: Req) => act(() => api.post(`/prosight/patch/requests/${rq.id}/execute`, {}), 'Execução despachada (aguardando conector).')
  const doHandoff = (c: Cand) => act(async () => { await api.post(`/prosight/patch/candidates/${c.id}/handoff`, {}); setHandoffFor(null) }, 'Artefato registrado no C5.')

  return (
    <AppLayout title="Patch (Conector)">
      <PageHeader icon={Layers} title="Patch — produção governada de artefato"
        subtitle="Entrada → Solicitação → Execução → Artefato candidato → Registrar no C5. Patch produz artefato; o C5 publica. Modo SIMULADO — sem física TOTVS." />

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
          {avail && (
            <>
              <Badge variant={avail.simulated.available ? 'success' : 'default'}>Simulado {avail.simulated.available ? 'disponível' : 'indisponível'}</Badge>
              <Badge variant="default">Real (TOTVS) — ainda não disponível</Badge>
            </>
          )}
          {envId && <Button variant="ghost" size="sm" icon={RotateCcw} onClick={refresh}>Atualizar</Button>}
        </div>
      </Card>

      {envId && (
        <div className="mb-4 text-sm px-4 py-2 rounded" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>
          Patch aplicado ao <b>workspace</b> ≠ Patch <b>publicado em produção</b>. Registrar no C5 apenas <b>registra</b> o artefato — não qualifica, não promove, não altera o RPO ativo.
        </div>
      )}

      {loading && <Card><Skeleton className="h-24 w-full" /></Card>}

      {envId && !loading && (
        <>
          <Card className="mb-4">
            <SectionHeader icon={FileCode2} title="Entradas (.ptm)"
              action={can('prosight.operations.patch.request') ? <Button size="sm" icon={FileCode2} onClick={() => setInputOpen(true)}>Nova entrada</Button> : undefined} />
            {inputs.length === 0 ? <EmptyState title="Nenhuma entrada" description="Cadastre a identidade lógica de um .ptm (só metadados/digest — nunca bytes)." />
              : <Table><Thead><tr><Th>#</Th><Th>Patch</Th><Th>Digest</Th><Th>Proveniência</Th></tr></Thead>
                <Tbody>{inputs.map((i) => <Tr key={i.id}><Td mono>#{i.id}</Td><Td>{i.patch_id}</Td><Td mono>{i.digest.slice(0, 16)}…</Td><Td>{i.provenance ?? '—'}</Td></Tr>)}</Tbody></Table>}
          </Card>

          <Card className="mb-4">
            <SectionHeader icon={Boxes} title="Solicitações"
              action={can('prosight.operations.patch.request') ? <Button size="sm" icon={Boxes} disabled={!inputs.length} onClick={() => setReqOpen(true)}>Nova solicitação</Button> : undefined} />
            {reqs.length === 0 ? <EmptyState title="Nenhuma solicitação" description="Uma solicitação congela a base RPO + o lote ordenado de patches." />
              : <Table><Thead><tr><Th>#</Th><Th>Base RPO</Th><Th>Lote</Th><Th>Modo</Th><Th>Workspace</Th><Th>Status</Th><Th right>Ação</Th></tr></Thead>
                <Tbody>{reqs.map((r) => <Tr key={r.id}>
                  <Td mono>#{r.id}</Td><Td mono>{r.base_rpo_hash.slice(0, 12)}…</Td><Td mono>{r.batch_digest ? r.batch_digest.slice(0, 12) + '…' : '—'}</Td>
                  <Td><Badge variant="purple">{r.execution_mode}</Badge></Td><Td mono>{r.workspace_unit_id ?? '—'}</Td>
                  <Td>{r.status}</Td>
                  <Td right>{can('prosight.operations.patch.execute') && r.status === 'open' && r.workspace_unit_id
                    ? <Button size="sm" variant="secondary" icon={PlayCircle} disabled={busy} onClick={() => dispatch(r)}>Executar</Button> : '—'}</Td>
                </Tr>)}</Tbody></Table>}
          </Card>

          <Card className="mb-4">
            <SectionHeader icon={ShieldCheck} title="Artefatos candidatos" />
            {cands.length === 0 ? <EmptyState title="Nenhum artefato candidato" description="Uma execução concluída (3/3 + verificação) produz um artefato candidato — ainda não registrado no C5." />
              : <Table><Thead><tr><Th>#</Th><Th>Digest candidato</Th><Th>Base</Th><Th>Situação</Th><Th right>Ações</Th></tr></Thead>
                <Tbody>{cands.map((c) => (
                  <Tr key={c.id}>
                    <Td mono>#{c.id} {c.is_simulated && <Badge variant="purple">Simulado</Badge>}</Td>
                    <Td mono>{c.candidate_digest.slice(0, 16)}…</Td>
                    <Td mono>{c.base_rpo_digest.slice(0, 12)}…</Td>
                    <Td><Badge variant={c.is_registered ? 'success' : 'warning'}>{c.is_registered ? 'Registrado no C5 — ainda não qualificado' : 'Artefato candidato — ainda não registrado'}</Badge></Td>
                    <Td right>
                      {!c.is_registered && can('prosight.operations.patch.register') &&
                        <Button size="sm" icon={Send} disabled={busy} onClick={() => setHandoffFor(c)}>Registrar no C5</Button>}
                      {c.is_registered && c.rpo_artifact_id &&
                        <Button size="sm" variant="ghost" icon={CheckCircle2} onClick={() => router.push('/operacoes-rpo')}>Abrir no C5</Button>}
                    </Td>
                  </Tr>
                ))}</Tbody></Table>}
          </Card>
        </>
      )}

      <Modal open={inputOpen} onClose={() => setInputOpen(false)} title="Nova entrada (.ptm)">
        <div className="flex flex-col gap-3">
          <TextInput label="Identificador do patch" value={fPatchId} onChange={(e) => setFPatchId(e.target.value)} placeholder="PTM-1234" />
          <TextInput label="Digest (sha256, 64 hex)" value={fDigest} onChange={(e) => setFDigest(e.target.value)} placeholder="calculado on-prem" />
          <TextInput label="Proveniência (opcional)" value={fProv} onChange={(e) => setFProv(e.target.value)} placeholder="GMUD-123" />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Somente metadados/digest — bytes e caminhos permanecem on-prem.</p>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setInputOpen(false)}>Cancelar</Button>
            <Button icon={busy ? Loader2 : FileCode2} disabled={busy || fPatchId.length < 2 || fDigest.trim().length !== 64} onClick={createInput}>Registrar</Button></div>
        </div>
      </Modal>

      <Modal open={reqOpen} onClose={() => setReqOpen(false)} title="Nova solicitação (lote sobre base)">
        <div className="flex flex-col gap-3">
          <TextInput label="Base RPO (sha256, 64 hex)" value={fBase} onChange={(e) => setFBase(e.target.value)} placeholder="hash da base atual (on-prem)" />
          <TextInput label="Workspace (opaco, agent-derived)" value={fWs} onChange={(e) => setFWs(e.target.value)} placeholder="WS-…" />
          <div>
            <label className="text-sm block mb-1">Lote de patches (ordem = seleção)</label>
            <div className="flex flex-col gap-1 max-h-40 overflow-auto">
              {inputs.map((i) => {
                const idx = fInputs.indexOf(i.id)
                return <label key={i.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={idx >= 0} onChange={(e) => setFInputs((p) => e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id))} />
                  {idx >= 0 && <Badge variant="primary">{idx + 1}</Badge>} {i.patch_id} <span className="opacity-60 font-mono">{i.digest.slice(0, 10)}…</span>
                </label>
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setReqOpen(false)}>Cancelar</Button>
            <Button icon={busy ? Loader2 : Boxes} disabled={busy || fBase.trim().length !== 64 || fInputs.length === 0} onClick={createReq}>Criar solicitação</Button></div>
        </div>
      </Modal>

      <Modal open={!!handoffFor} onClose={() => setHandoffFor(null)} title="Registrar artefato no C5">
        {handoffFor && <div className="flex flex-col gap-3 text-sm">
          <p>Registrar o artefato candidato <span className="font-mono">{handoffFor.candidate_digest.slice(0, 16)}…</span> no C5.</p>
          <p style={{ color: 'var(--text-muted)' }}>Isso <b>registra</b> o artefato (proveniência producer=patch, simulado). <b>Não</b> qualifica, <b>não</b> promove e <b>não</b> altera o RPO ativo. Qualificação e promoção seguem no C5.</p>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setHandoffFor(null)}>Cancelar</Button>
            <Button icon={busy ? Loader2 : Send} disabled={busy} onClick={() => doHandoff(handoffFor)}>Registrar no C5</Button></div>
        </div>}
      </Modal>
    </AppLayout>
  )
}
