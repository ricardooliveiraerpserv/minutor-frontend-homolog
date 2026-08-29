'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Operações Protheus · Patches — produção GOVERNADA de artefato (Conector, P1–P3).
// Jornada REAL (sem fixtures): Entrada → Solicitação → Execução → Artefato candidato
// → Registrar no C5. Patch produz artefato; o C5 publica. Modo SIMULADO — sem física
// TOTVS. Rótulos honestos: candidato ≠ registrado ≠ qualificado ≠ publicado.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Boxes, CheckCircle2, FileCode2, Loader2, Package, PlayCircle, RefreshCw, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Modal, Skeleton, Table, Tbody, Td, Th, Thead, Tr, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useOperacoes } from './operacoes-context'
import { SectionHead } from './sections'

interface Avail { simulated: { available: boolean; reason: string | null }; live: { available: boolean; reason: string | null } }
interface Input { id: number; patch_id: string; digest: string; provenance: string | null }
interface Req { id: number; base_rpo_hash: string; execution_mode: string; workspace_unit_id: string | null; batch_digest: string | null; status: string }
interface Cand { id: number; candidate_digest: string; base_rpo_digest: string; handoff_status: string; is_simulated: boolean; is_registered: boolean; is_qualified: boolean; is_published: boolean; rpo_artifact_id: number | null; label: string }

export function PatchesView({ previewEnvironmentId = null }: { previewEnvironmentId?: string | null; demoAdmin?: boolean }) {
  const { user } = useAuth()
  const perms: string[] = (user as { permissions?: string[] } | null)?.permissions ?? []
  const can = (p: string) => perms.includes('*') || perms.includes(p)
  const ctx = useOperacoes()
  const environmentId = ctx?.environmentId ?? previewEnvironmentId ?? null
  const environmentLabel = ctx?.environmentLabel ?? null
  const companyName = ctx?.companyName ?? ''
  const router = useRouter()

  const [avail, setAvail] = useState<Avail | null>(null)
  const [inputs, setInputs] = useState<Input[]>([])
  const [reqs, setReqs] = useState<Req[]>([])
  const [cands, setCands] = useState<Cand[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [inputOpen, setInputOpen] = useState(false)
  const [reqOpen, setReqOpen] = useState(false)
  const [handoffFor, setHandoffFor] = useState<Cand | null>(null)
  const [fPatchId, setFPatchId] = useState(''); const [fDigest, setFDigest] = useState(''); const [fProv, setFProv] = useState('')
  const [fBase, setFBase] = useState(''); const [fWs, setFWs] = useState(''); const [fInputs, setFInputs] = useState<number[]>([])

  const load = useCallback(async () => {
    if (!environmentId) return
    setLoading(true); setError(null)
    try {
      const [av, inp, rq, cd] = await Promise.all([
        api.get<{ data: Avail }>(`/prosight/environments/${environmentId}/patch/availability`),
        api.get<{ data: { inputs: Input[] } }>(`/prosight/environments/${environmentId}/patch/inputs`),
        api.get<{ data: { requests: Req[] } }>(`/prosight/environments/${environmentId}/patch/requests`),
        api.get<{ data: { candidates: Cand[] } }>(`/prosight/environments/${environmentId}/patch/candidates`),
      ])
      setAvail(av.data); setInputs(inp.data.inputs); setReqs(rq.data.requests); setCands(cd.data.candidates)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Falha ao carregar os patches.')
    } finally { setLoading(false) }
  }, [environmentId])

  useEffect(() => { void load() }, [load])

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); toast.success(ok); await load() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha.') }
    finally { setBusy(false) }
  }

  const createInput = () => act(async () => {
    await api.post(`/prosight/environments/${environmentId}/patch/inputs`, { patch_id: fPatchId, digest: fDigest.trim().toLowerCase(), provenance: fProv || undefined, classification: 'test' })
    setInputOpen(false); setFPatchId(''); setFDigest(''); setFProv('')
  }, 'Entrada registrada.')

  const createReq = () => act(async () => {
    await api.post(`/prosight/environments/${environmentId}/patch/requests`, { base_rpo_hash: fBase.trim().toLowerCase(), execution_mode: 'simulated', workspace_unit_id: fWs || undefined, patch_input_ids: fInputs, classification: 'test' })
    setReqOpen(false); setFBase(''); setFWs(''); setFInputs([])
  }, 'Solicitação criada.')

  const dispatch = (rq: Req) => act(() => api.post(`/prosight/patch/requests/${rq.id}/execute`, {}), 'Execução despachada (aguardando conector).')
  const doHandoff = (c: Cand) => act(async () => { await api.post(`/prosight/patch/candidates/${c.id}/handoff`, {}); setHandoffFor(null) }, 'Artefato registrado no C5.')

  if (!environmentId) {
    return <Card><EmptyState icon={Package} title="Selecione um ambiente" description="A produção de patches é por ambiente. Escolha empresa e ambiente para começar." /></Card>
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHead icon={Package} title="Patches — produção governada de artefato"
        subtitle={`${companyName}${environmentLabel ? ` · ${environmentLabel}` : ''} — Entrada → Solicitação → Execução → Artefato candidato → Registrar no C5. SIMULADO (sem física TOTVS).`}>
        <div className="flex items-center gap-2">
          {avail && <><Badge variant={avail.simulated.available ? 'success' : 'default'}>Simulado {avail.simulated.available ? 'disponível' : 'indisponível'}</Badge>
            <Badge variant="default">Real (TOTVS) — ainda não disponível</Badge></>}
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => void load()}>Atualizar</Button>
        </div>
      </SectionHead>

      <div className="text-sm px-4 py-2 rounded" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>
        Patch aplicado ao <b>workspace</b> ≠ Patch <b>publicado em produção</b>. Registrar no C5 apenas <b>registra</b> o artefato — não qualifica, não promove, não altera o RPO ativo.
      </div>

      {loading && <Card><Skeleton className="h-24 w-full" /></Card>}
      {error && !loading && <Card><EmptyState icon={Package} title="Não foi possível carregar" description={error} action={<Button size="sm" icon={RefreshCw} onClick={() => void load()}>Tentar novamente</Button>} /></Card>}

      {!loading && !error && (
        <>
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 font-medium"><FileCode2 size={16} /> Entradas (.ptm)</div>
              {can('prosight.operations.patch.request') && <Button size="sm" icon={FileCode2} onClick={() => setInputOpen(true)}>Nova entrada</Button>}
            </div>
            {inputs.length === 0 ? <EmptyState icon={FileCode2} title="Nenhuma entrada" description="Cadastre a identidade lógica de um .ptm (só metadados/digest — nunca bytes)." />
              : <Table><Thead><tr><Th>#</Th><Th>Patch</Th><Th>Digest</Th><Th>Proveniência</Th></tr></Thead>
                <Tbody>{inputs.map((i) => <Tr key={i.id}><Td mono>#{i.id}</Td><Td>{i.patch_id}</Td><Td mono>{i.digest.slice(0, 16)}…</Td><Td>{i.provenance ?? '—'}</Td></Tr>)}</Tbody></Table>}
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 font-medium"><Boxes size={16} /> Solicitações</div>
              {can('prosight.operations.patch.request') && <Button size="sm" icon={Boxes} disabled={!inputs.length} onClick={() => setReqOpen(true)}>Nova solicitação</Button>}
            </div>
            {reqs.length === 0 ? <EmptyState icon={Boxes} title="Nenhuma solicitação" description="Uma solicitação congela a base RPO + o lote ordenado de patches." />
              : <Table><Thead><tr><Th>#</Th><Th>Base RPO</Th><Th>Lote</Th><Th>Modo</Th><Th>Workspace</Th><Th>Status</Th><Th right>Ação</Th></tr></Thead>
                <Tbody>{reqs.map((r) => <Tr key={r.id}>
                  <Td mono>#{r.id}</Td><Td mono>{r.base_rpo_hash.slice(0, 12)}…</Td><Td mono>{r.batch_digest ? r.batch_digest.slice(0, 12) + '…' : '—'}</Td>
                  <Td><Badge variant="purple">{r.execution_mode}</Badge></Td><Td mono>{r.workspace_unit_id ?? '—'}</Td><Td>{r.status}</Td>
                  <Td right>{can('prosight.operations.patch.execute') && r.status === 'open' && r.workspace_unit_id
                    ? <Button size="sm" variant="secondary" icon={PlayCircle} disabled={busy} onClick={() => dispatch(r)}>Executar</Button> : '—'}</Td>
                </Tr>)}</Tbody></Table>}
          </Card>

          <Card>
            <div className="flex items-center gap-2 font-medium mb-3"><CheckCircle2 size={16} /> Artefatos candidatos</div>
            {cands.length === 0 ? <EmptyState icon={CheckCircle2} title="Nenhum artefato candidato" description="Uma execução concluída (3/3 + verificação) produz um artefato candidato — ainda não registrado no C5." />
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
    </div>
  )
}
