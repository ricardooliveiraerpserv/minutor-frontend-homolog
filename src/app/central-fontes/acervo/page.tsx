'use client'

// Central de Fontes — F3 · Acervo como tela de trabalho: árvore lazy Empresa→Repo→Diretório→Fonte +
// ficha da fonte no painel direito (split-view), navegação cross-source dentro do próprio Acervo,
// "Mostrar no Acervo" (via ?doc=) e persistência de contexto (sessionStorage + URL). Sem lógica de motor.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Building2, ChevronRight, EyeOff, FileCode2, FilePlus2, Folder, FolderGit2, GitBranch, RotateCcw, Search } from 'lucide-react'
import { toast } from 'sonner'
import {
  Badge, Breadcrumb, Card, EmptyState, PageHeader, SplitPanel, Skeleton, Tree,
  Table, Thead, Tbody, Tr, Th, Td,
} from '@/components/ds'
import type { Crumb, TreeNode } from '@/components/ds'
import { useAuth } from '@/contexts/auth-context'
import { api, ApiError } from '@/lib/api'
import { SourceDocDetail } from '@/app/central-fontes/[id]/page'
import { SolicitarFonteModal, type SolicitarCtx } from '@/components/central-fontes/solicitar-fonte-modal'
import { useProsightCompany } from '@/app/prosight/_components/company-context'

interface CustomerRow { customer_id: number; name: string; repos: number; fontes: number; documentadas: number; completas: number; parciais: number; pendentes: number; aguardando_aprovacao: number }
interface RepoRow { repository: string; source_repo_id: number | null; branch: string; owner: string; fontes: number; documentadas: number; parciais: number; cobertura_semantica: number; ultima_atualizacao_acervo: string | null; hidden?: boolean }
interface DirRow { name: string; path: string; fontes: number; documentadas: number; parciais: number }
interface FileRow { id: number; filename: string; name: string; path: string; analysis_status: string; semantic: string; functions_count: number | null; last_change_at: string | null; cost_usd: number | null }
interface Ident { data: { id: number; filename: string; path: string; repository: string; customer?: { id: number; name: string } | null } }

type Meta =
  | { type: 'customer'; customer_id: number; name: string; row?: CustomerRow }
  | { type: 'repo'; customer_id: number; customerName: string; repository: string; row?: RepoRow }
  | { type: 'dir'; customer_id: number; customerName: string; repository: string; path: string }
  | { type: 'file'; doc_id: number; filename: string }

const money = (n: number | null) => (n == null ? '—' : `US$ ${n.toFixed(2)}`)
const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')
const semBadge = (s: string) => s === 'completed' ? <Badge variant="success">Completa</Badge> : s === 'partial' ? <Badge variant="warning">Parcial</Badge> : <Badge variant="default">Sem semântica</Badge>
const fileBadge = (s: string) => s === 'completed' ? '●' : s === 'partial' ? '◐' : '○'

// ── Navegação progressiva (default) — dirigida por URL, reusa os mesmos painéis ──
export default function AcervoPage() {
  return <Suspense fallback={<div className="p-6"><Skeleton className="h-64" /></div>}><AcervoRouter /></Suspense>
}

function AcervoRouter() {
  const sp = useSearchParams()
  const router = useRouter()
  const customerId = sp.get('customer_id') ? Number(sp.get('customer_id')) : null
  const docId = sp.get('doc') ? Number(sp.get('doc')) : null
  // Dentro de uma empresa (ou ao abrir uma fonte): árvore escopada + ficha ao lado (split-view).
  if (customerId || docId) return <TreeExplorer customerId={customerId} initialDoc={docId} />
  // Entrada sem empresa: lista de empresas (mesma da Visão Geral).
  return <EmpresaEntry onOpen={(id) => router.push(buildAcervoHref({ customer_id: id }))} />
}

function buildAcervoHref(p: { customer_id?: number | null; repository?: string; path?: string; doc?: number; view?: string }): string {
  const q = new URLSearchParams()
  if (p.customer_id) q.set('customer_id', String(p.customer_id))
  if (p.repository) q.set('repository', p.repository)
  if (p.path) q.set('path', p.path)
  if (p.doc) q.set('doc', String(p.doc))
  if (p.view) q.set('view', p.view)
  const s = q.toString()
  return s ? `/central-fontes/acervo?${s}` : '/central-fontes/acervo'
}

function EmpresaList({ customers, err, onOpen }: { customers: CustomerRow[] | null; err: string | null; onOpen: (id: number) => void }) {
  const pct = (d: number, t: number) => (t ? Math.round((d / t) * 100) : 0)
  return (
    <div className="p-5">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-fg)]">Acervo por empresa</div>
      {err ? <EmptyState icon={Building2} title="Erro" description={err} />
        : customers === null ? <Skeleton className="h-40" />
        : customers.length === 0 ? <EmptyState icon={Building2} title="Sem empresas" description="Nenhuma empresa no seu escopo." />
        : <Table><Thead><Tr><Th>Empresa</Th><Th right>Fontes</Th><Th right>Cobertura</Th><Th right>Repos.</Th><Th></Th></Tr></Thead>
            <Tbody>{customers.map((c) => (
              <Tr key={c.customer_id} onClick={() => onOpen(c.customer_id)} className="cursor-pointer">
                <Td><div className="flex items-center gap-2 font-medium"><Building2 size={15} className="text-[color:var(--muted-fg)]" /> {c.name}</div></Td>
                <Td right>{c.fontes}</Td><Td right>{pct(c.documentadas, c.fontes)}%</Td><Td right>{c.repos}</Td>
                <Td right><ChevronRight size={16} className="text-[color:var(--muted-fg)]" /></Td>
              </Tr>
            ))}</Tbody></Table>}
    </div>
  )
}

function EmpresaEntry({ onOpen }: { onOpen: (id: number) => void }) {
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { api.get<{ data: CustomerRow[] }>('/source-docs/tree/customers').then((r) => setCustomers(r.data)).catch((e) => setErr(e instanceof ApiError ? e.message : 'Falha ao carregar empresas.')) }, [])
  return <>
    <PageHeader icon={FolderGit2} title="Central de Fontes — Acervo" subtitle="Escolha uma empresa para explorar: Empresa → Repositório → Diretório → Fonte." />
    <Card padding="none"><EmpresaList customers={customers} err={err} onOpen={onOpen} /></Card>
  </>
}

function TreeExplorer({ customerId, initialDoc }: { customerId: number | null; initialDoc: number | null }) {
  const router = useRouter()
  const company = useProsightCompany()
  // Mantém o seletor GLOBAL sincronizado com a empresa aberta no Acervo (deep-link/árvore).
  useEffect(() => {
    if (customerId && company && company.companyId !== customerId) company.setCompanyId(customerId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Meta | null>(null)
  const [fileId, setFileId] = useState<number | null>(null)
  const [rootLoading, setRootLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [custName, setCustName] = useState('')
  const cidRef = useRef<number | null>(customerId)
  const meta = useRef<Record<string, Meta>>({})

  const patch = useCallback((id: string, fn: (n: TreeNode) => TreeNode) => {
    setNodes((prev) => { const walk = (l: TreeNode[]): TreeNode[] => l.map((n) => n.id === id ? fn(n) : (n.children ? { ...n, children: walk(n.children) } : n)); return walk(prev) })
  }, [])
  const mergeChildren = useCallback((id: string, children: TreeNode[]) => patch(id, (n) => ({ ...n, loading: false, hasChildren: false, children })), [patch])

  const buildRepoNodes = useCallback((cid: number, cname: string, repos: RepoRow[]): TreeNode[] => repos.map((repo) => {
    const id = `r:${cid}:${repo.repository}`; meta.current[id] = { type: 'repo', customer_id: cid, customerName: cname, repository: repo.repository, row: repo }
    return { id, label: repo.repository, icon: FolderGit2, badge: repo.fontes, hasChildren: repo.fontes > 0 }
  }), [])
  const buildNodeChildren = useCallback((cid: number, cname: string, repo: string, data: { dirs: DirRow[]; files: FileRow[] }): TreeNode[] => {
    const dirs = data.dirs.map<TreeNode>((d) => { const id = `d:${cid}:${repo}:${d.path}`; meta.current[id] = { type: 'dir', customer_id: cid, customerName: cname, repository: repo, path: d.path }; return { id, label: d.name, icon: Folder, badge: d.fontes, hasChildren: true } })
    const files = data.files.map<TreeNode>((f) => { const id = `f:${f.id}`; meta.current[id] = { type: 'file', doc_id: f.id, filename: f.filename }; return { id, label: f.filename, icon: FileCode2, badge: fileBadge(f.semantic) } })
    return [...dirs, ...files]
  }, [])

  const getRepos = (cid: number) => api.get<{ data: RepoRow[] }>(`/source-docs/tree/customers/${cid}/repos`).then((r) => r.data)
  const getNodes = (cid: number, repo: string, path: string) => api.get<{ data: { dirs: DirRow[]; files: FileRow[] } }>(`/source-docs/tree/nodes?customer_id=${cid}&repository=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`).then((r) => r.data)

  const selectFile = useCallback((docId: number, filename: string) => {
    meta.current[`f:${docId}`] = { type: 'file', doc_id: docId, filename }
    setFileId(docId); setSelected({ type: 'file', doc_id: docId, filename })
    try { window.history.replaceState(null, '', buildAcervoHref({ customer_id: cidRef.current, doc: docId })) } catch {}
  }, [])

  // revela uma fonte na árvore da empresa; se for de outra empresa, troca o escopo via URL.
  const revealDoc = useCallback(async (targetId: number, select = true) => {
    try {
      const m = (await api.get<Ident>(`/source-docs/${targetId}`)).data
      const cid = m.customer?.id, repo = m.repository, path = m.path
      if (!cid || !repo) return
      if (cidRef.current && cid !== cidRef.current) { router.push(buildAcervoHref({ customer_id: cid, doc: targetId })); return }
      const cname = m.customer?.name ?? custName
      mergeChildren(`r:${cid}:${repo}`, buildNodeChildren(cid, cname, repo, await getNodes(cid, repo, '')))
      const dirs = path.split('/').slice(0, -1); let prefix = ''
      for (const seg of dirs) { prefix = prefix ? `${prefix}/${seg}` : seg; mergeChildren(`d:${cid}:${repo}:${prefix}`, buildNodeChildren(cid, cname, repo, await getNodes(cid, repo, prefix))) }
      setExpanded((prev) => { const s = new Set(prev); s.add(`r:${cid}:${repo}`); let p = ''; for (const seg of dirs) { p = p ? `${p}/${seg}` : seg; s.add(`d:${cid}:${repo}:${p}`) } return s })
      if (select) selectFile(targetId, m.filename)
      else { meta.current[`f:${targetId}`] = { type: 'file', doc_id: targetId, filename: m.filename }; setFileId(targetId); setSelected({ type: 'file', doc_id: targetId, filename: m.filename }) }
    } catch { /* silencioso */ }
  }, [mergeChildren, buildNodeChildren, selectFile, custName, router])

  // carga inicial: raiz = repositórios da EMPRESA (escopo). Resolve empresa via doc quando só há ?doc=.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        let cid = customerId; let cname = ''
        if (!cid && initialDoc) { const idn = (await api.get<Ident>(`/source-docs/${initialDoc}`)).data; cid = idn.customer?.id ?? null; cname = idn.customer?.name ?? '' }
        if (!cid) { if (alive) { setErr('Empresa não identificada.'); setRootLoading(false) } return }
        if (!cname) { const cs = (await api.get<{ data: CustomerRow[] }>('/source-docs/tree/customers')).data; cname = cs.find((c) => c.customer_id === cid)?.name ?? '' }
        if (!alive) return
        cidRef.current = cid; setCustName(cname)
        meta.current[`c:${cid}`] = { type: 'customer', customer_id: cid, name: cname }
        const repos = await getRepos(cid)
        if (!alive) return
        setNodes(buildRepoNodes(cid, cname, repos))
        setSelected({ type: 'customer', customer_id: cid, name: cname })
        setRootLoading(false)
        if (initialDoc) void revealDoc(initialDoc, true)
      } catch (e) { if (alive) { setErr(e instanceof ApiError ? e.message : 'Falha ao carregar o acervo.'); setRootLoading(false) } }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, initialDoc])

  const loadChildren = useCallback(async (node: TreeNode) => {
    const m = meta.current[node.id]; if (!m) return
    patch(node.id, (n) => ({ ...n, loading: true }))
    try {
      if (m.type === 'repo') mergeChildren(node.id, buildNodeChildren(m.customer_id, m.customerName, m.repository, await getNodes(m.customer_id, m.repository, '')))
      else if (m.type === 'dir') mergeChildren(node.id, buildNodeChildren(m.customer_id, m.customerName, m.repository, await getNodes(m.customer_id, m.repository, m.path)))
    } catch { patch(node.id, (n) => ({ ...n, loading: false, badge: '⚠' })) }
  }, [patch, mergeChildren, buildNodeChildren])

  const onToggle = useCallback((node: TreeNode, willExpand: boolean) => {
    setExpanded((prev) => { const s = new Set(prev); willExpand ? s.add(node.id) : s.delete(node.id); return s })
    if (willExpand && node.hasChildren && !node.children?.length) void loadChildren(node)
  }, [loadChildren])

  const onSelect = useCallback((node: TreeNode) => {
    const m = meta.current[node.id]; if (!m) return
    if (m.type === 'file') { selectFile(m.doc_id, m.filename); return }
    setFileId(null); setSelected(m)
    try { window.history.replaceState(null, '', buildAcervoHref({ customer_id: cidRef.current })) } catch {}
    if ((m.type === 'dir' || m.type === 'repo') && !node.children?.length && node.hasChildren) { setExpanded((prev) => new Set(prev).add(node.id)); void loadChildren(node) }
  }, [selectFile, loadChildren])

  // reveal p/ resultados da busca contextual (pasta/repo) — seleciona o nó e mostra no painel direito
  const revealRepo = useCallback(async (cid: number, cname: string, repo: string) => {
    mergeChildren(`r:${cid}:${repo}`, buildNodeChildren(cid, cname, repo, await getNodes(cid, repo, '')))
    setExpanded((prev) => new Set(prev).add(`r:${cid}:${repo}`))
    const mm: Meta = { type: 'repo', customer_id: cid, customerName: cname, repository: repo }; meta.current[`r:${cid}:${repo}`] = mm; setFileId(null); setSelected(mm)
  }, [mergeChildren, buildNodeChildren])
  const revealDir = useCallback(async (cid: number, cname: string, repo: string, path: string) => {
    mergeChildren(`r:${cid}:${repo}`, buildNodeChildren(cid, cname, repo, await getNodes(cid, repo, '')))
    const dirs = path.split('/'); let prefix = ''
    for (const seg of dirs) { prefix = prefix ? `${prefix}/${seg}` : seg; mergeChildren(`d:${cid}:${repo}:${prefix}`, buildNodeChildren(cid, cname, repo, await getNodes(cid, repo, prefix))) }
    setExpanded((prev) => { const s = new Set(prev); s.add(`r:${cid}:${repo}`); let p = ''; for (const seg of dirs) { p = p ? `${p}/${seg}` : seg; s.add(`d:${cid}:${repo}:${p}`) } return s })
    const mm: Meta = { type: 'dir', customer_id: cid, customerName: cname, repository: repo, path }; meta.current[`d:${cid}:${repo}:${path}`] = mm; setFileId(null); setSelected(mm)
  }, [mergeChildren, buildNodeChildren])

  const treeNav: NavAbs = useMemo(() => ({
    file: (h) => void revealDoc(h.id),
    folder: (repo, path) => void revealDir(cidRef.current ?? 0, custName, repo, path),
    repo: (repo) => void revealRepo(cidRef.current ?? 0, custName, repo),
  }), [revealDoc, revealDir, revealRepo, custName])

  const selectedTreeId = fileId ? `f:${fileId}` : (selected && selected.type !== 'file' ? nodeIdOf(selected) : undefined)

  return (
    <>
      <PageHeader icon={Building2} title={custName || 'Acervo'} subtitle="Empresa → Repositório → Diretório → Fonte → Conhecimento."
        actions={<button onClick={() => { company?.setCompanyId(null); router.push('/central-fontes/acervo') }} className="inline-flex items-center gap-1 text-sm text-[color:var(--muted-fg)] hover:text-[color:var(--fg)]"><ArrowLeft size={14} /> Empresas</button>} />
      {err ? <EmptyState icon={FolderGit2} title="Erro" description={err} /> : (
        <Card padding="none" className="overflow-hidden">
          <div className="h-[calc(100vh-260px)] min-h-[480px]">
            <SplitPanel storageKey="acervo-split" className="h-full" defaultWidth={320}
              left={
                <div className="h-full overflow-auto border-r border-[color:var(--border)] p-2">
                  <div className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">{custName || 'Navegador'}</div>
                  {rootLoading ? <Skeleton className="h-40" /> : nodes.length === 0 ? <EmptyState icon={FolderGit2} title="Sem repositórios" description="Empresa sem repositório de fonte." /> : <Tree nodes={nodes} expandedIds={expanded} onToggle={onToggle} selectedId={selectedTreeId} onSelect={onSelect} />}
                </div>
              }
              right={
                fileId ? <SourceDocDetail docId={fileId} embedded />
                  : <RightPanel selected={selected} nav={treeNav} onOpenRepo={(repo) => void revealRepo(cidRef.current ?? 0, custName, repo)} onOpenDir={(id) => { const n = findNode(nodes, id); if (n) onSelect(n) }} onOpenFile={(id, fn) => selectFile(id, fn)} onNavigateSource={(id) => void revealDoc(id)} />
              }
            />
          </div>
        </Card>
      )}
    </>
  )
}

function nodeIdOf(m: Meta): string {
  if (m.type === 'customer') return `c:${m.customer_id}`
  if (m.type === 'repo') return `r:${m.customer_id}:${m.repository}`
  if (m.type === 'dir') return `d:${m.customer_id}:${m.repository}:${m.path}`
  return `f:${m.doc_id}`
}
function findNode(list: TreeNode[], id: string): TreeNode | undefined { for (const n of list) { if (n.id === id) return n; if (n.children) { const f = findNode(n.children, id); if (f) return f } } return undefined }

interface Knowledge {
  fontes: number; documentadas: number; completas: number; parciais: number; pendentes: number; cobertura_semantica: number
  funcoes: number; tabelas: number; queries: number; com_risco: number; regras: number; dependencias: number; com_gaps: number
  custo_ia_usd: number; aguardando_aprovacao: number
  saude: { sem_documentacao: number; parcial: number; completa: number; com_gaps: number; aguardando: number }
  linguagens: { lang: string; fontes: number }[]
  processos_modulos: { modulo: string; fontes: number }[]
  cross_source: { from_id: number; from_name: string; symbol: string; to_id: number; to_name: string; to_path: string; to_customer: string }[]
}

function useKnowledge(scope: { customer_id: number; repository?: string; path?: string }) {
  const [k, setK] = useState<Knowledge | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => { let alive = true; setK(null); setFailed(false)
    const qs = `customer_id=${scope.customer_id}${scope.repository ? `&repository=${encodeURIComponent(scope.repository)}` : ''}${scope.path ? `&path=${encodeURIComponent(scope.path)}` : ''}`
    api.get<{ data: Knowledge }>(`/source-docs/tree/knowledge?${qs}`).then((r) => alive && setK(r.data)).catch(() => alive && setFailed(true))
    return () => { alive = false }
  }, [scope.customer_id, scope.repository, scope.path])
  return { k, failed }
}

function KnowledgeBlock({ k, failed, onNavigateSource, onHealth }: { k: Knowledge | null; failed?: boolean; onNavigateSource?: (id: number) => void; onHealth?: (key: string) => void }) {
  if (failed) return <div className="rounded-md bg-[var(--danger-bg,#fef2f2)] px-3 py-2 text-xs text-[var(--danger-fg,#b91c1c)]">Não foi possível carregar o conhecimento agregado deste escopo.</div>
  if (!k) return <Skeleton className="h-40" />
  const chip = (label: string, n: number, key: string, tone: string) => (
    <button disabled={!onHealth} onClick={() => onHealth?.(key)} className={`rounded-md border border-[color:var(--border)] px-2.5 py-1 text-xs ${onHealth ? 'hover:bg-[color:var(--muted-bg,#f1f5f9)]' : 'cursor-default'}`}>
      <span className="tabular-nums font-semibold" style={{ color: tone }}>{n}</span> <span className="text-[color:var(--muted-fg)]">{label}</span>
    </button>
  )
  const processos = k.processos_modulos.filter((p) => p.modulo !== '—')
  return (
    <div className="flex flex-col gap-5">
      {/* Indicadores em tiles (coloridos por métrica; cobertura por faixa) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatTile label="Fontes" value={k.fontes} tone="var(--primary,#157582)" />
        <StatTile label="Documentadas" value={k.documentadas} tone="#16a34a" />
        <StatTile label="Cobertura" value={`${k.cobertura_semantica}%`} tone={k.cobertura_semantica >= 70 ? '#16a34a' : k.cobertura_semantica >= 30 ? '#d97706' : '#dc2626'} />
        <StatTile label="Funções" value={k.funcoes} tone="#2563eb" />
        <StatTile label="Regras" value={k.regras} tone="#7c3aed" />
        <StatTile label="Dependências" value={k.dependencias} tone="#0891b2" />
      </div>

      <KSection title="Saúde do conhecimento">
        <div className="flex flex-wrap gap-2">
          {chip('completas', k.saude.completa, 'completed', 'var(--success,#16a34a)')}
          {chip('parciais', k.saude.parcial, 'partial', 'var(--warning,#d97706)')}
          {chip('sem doc.', k.saude.sem_documentacao, 'none', 'var(--muted-fg)')}
          {chip('com gaps', k.saude.com_gaps, 'gaps', 'var(--warning,#d97706)')}
          {chip('aguardando IA', k.saude.aguardando, 'await', 'var(--accent,#2563eb)')}
        </div>
      </KSection>

      {processos.length > 0 && (
        <KSection title="Processos / módulos identificados">
          <div className="flex flex-wrap gap-1.5">{processos.map((p, i) => <Badge key={i} variant="default">{p.modulo} · {p.fontes}</Badge>)}</div>
        </KSection>
      )}

      {k.linguagens.length > 0 && (
        <KSection title="Linguagens">
          <div className="flex flex-wrap gap-1.5">{k.linguagens.map((l, i) => <Badge key={i} variant="default">{l.lang} · {l.fontes}</Badge>)}</div>
        </KSection>
      )}

      {k.cross_source.length > 0 && (
        <KSection title={`Relações com outras fontes (${k.cross_source.length})`}>
          <div className="flex flex-col divide-y divide-[color:var(--border)] overflow-hidden rounded-md border border-[color:var(--border)]">{k.cross_source.slice(0, 12).map((e, i) => (
            <button key={i} onClick={() => onNavigateSource?.(e.to_id)} className="flex items-center gap-1.5 px-3 py-2 text-left text-sm hover:bg-[color:var(--muted-bg,#f1f5f9)]">
              <span className="font-medium">{e.from_name}</span><span className="text-[color:var(--muted-fg)]">→ {e.symbol} →</span><span className="font-medium underline decoration-dotted">{e.to_name}</span>
              <span className="ml-auto truncate text-xs text-[color:var(--muted-fg)]">{e.to_path}</span>
            </button>
          ))}</div>
        </KSection>
      )}
    </div>
  )
}

function StatTile({ label, value, tone }: { label: string; value: React.ReactNode; tone: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[var(--surface)] px-3 py-2.5" style={{ borderLeft: `3px solid ${tone}` }}>
      <div className="text-xl font-bold tabular-nums leading-tight" style={{ color: tone }}>{value}</div>
      <div className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">{label}</div>
    </div>
  )
}
function KSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-fg)]">{title}</div>
      {children}
    </div>
  )
}

function RightPanel({ selected, onOpenDir, onOpenFile, onNavigateSource, onOpenRepo, nav }: { selected: Meta | null; onOpenDir: (id: string) => void; onOpenFile: (id: number, fn: string) => void; onNavigateSource: (id: number) => void; onOpenRepo?: (repository: string) => void; nav?: NavAbs }) {
  if (!selected) return <div className="p-6"><EmptyState icon={FolderGit2} title="Selecione no navegador" description="Escolha um repositório, pasta ou fonte na árvore." /></div>
  if (selected.type === 'customer') return <CustomerPanel key={`c:${selected.customer_id}`} m={selected} onNavigateSource={onNavigateSource} onOpenRepo={onOpenRepo} nav={nav} />
  if (selected.type === 'repo') return <RepoPanel key={`r:${selected.customer_id}:${selected.repository}`} m={selected} onOpenDir={onOpenDir} onNavigateSource={onNavigateSource} nav={nav} />
  if (selected.type !== 'dir') return null
  return <FolderPanel key={nodeIdOf(selected)} selected={selected} onOpenDir={onOpenDir} onOpenFile={onOpenFile} onNavigateSource={onNavigateSource} nav={nav} />
}

function CustomerPanel({ m, onNavigateSource, onOpenRepo, crumbs, nav }: { m: Extract<Meta, { type: 'customer' }>; onNavigateSource: (id: number) => void; onOpenRepo?: (repository: string) => void; crumbs?: Crumb[]; nav?: NavAbs }) {
  const { k, failed } = useKnowledge({ customer_id: m.customer_id })
  const [repos, setRepos] = useState<RepoRow[] | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const { hasPermission } = useAuth()
  const canManage = hasPermission('source_docs.inventory')
  const loadRepos = useCallback(() => {
    setRepos(null)
    api.get<{ data: RepoRow[] }>(`/source-docs/tree/customers/${m.customer_id}/repos${showHidden ? '?include_hidden=1' : ''}`)
      .then((r) => setRepos(r.data)).catch(() => setRepos([]))
  }, [m.customer_id, showHidden])
  useEffect(() => { loadRepos() }, [loadRepos])
  const toggleRepo = async (repository: string, hidden: boolean) => {
    setBusy(repository)
    try {
      await api.put('/source-docs/repos/settings', { customer_id: m.customer_id, repository, hidden })
      toast.success(hidden ? `Repositório "${repository}" desabilitado — não aparece mais nas consultas.` : `Repositório "${repository}" reativado.`)
      loadRepos()
    } catch { toast.error('Não foi possível atualizar o repositório.') } finally { setBusy(null) }
  }
  const search = useScopedSearch({ customer_id: m.customer_id })
  const hiddenCount = (repos ?? []).filter((r) => r.hidden).length
  return <div className="flex h-full flex-col gap-4 overflow-auto p-5"><Breadcrumb items={crumbs ?? [{ label: m.name }]} /><h2 className="flex items-center gap-2 text-lg font-semibold"><Building2 size={18} /> {m.name}</h2>
    {nav && <ScopeSearchBox search={search} label={m.name} />}
    <KnowledgeBlock k={k} failed={failed} onNavigateSource={onNavigateSource} />
    {nav && search.term.trim() ? <ScopeResults search={search} scopeLabel={m.name} repos={repos} nav={nav} /> : (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">Repositórios</div>
        {canManage && (
          <button onClick={() => setShowHidden((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-[color:var(--border)] px-2 py-1 text-[11px] font-medium text-[color:var(--muted-fg)] hover:bg-[color:var(--muted-bg,#f1f5f9)]">
            <EyeOff size={12} /> {showHidden ? 'Ocultar desabilitados' : `Mostrar desabilitados${hiddenCount ? ` (${hiddenCount})` : ''}`}
          </button>
        )}
      </div>
      {repos === null ? <Skeleton className="h-16" /> : repos.length === 0 ? <EmptyState icon={FolderGit2} title="Sem repositórios" description="Nenhum repositório de fonte nesta empresa." /> : (
        <Table><Thead><Tr><Th>Repositório</Th><Th>Branch</Th><Th right>Fontes</Th><Th right>Com semântica</Th><Th right>Cobertura</Th><Th></Th></Tr></Thead>
          <Tbody>{repos.map((rp) => (
            <Tr key={rp.repository} onClick={() => !rp.hidden && onOpenRepo?.(rp.repository)} className={`${onOpenRepo && !rp.hidden ? 'cursor-pointer' : ''} ${rp.hidden ? 'opacity-50' : ''}`}>
              <Td><div className="flex items-center gap-2 font-medium"><FolderGit2 size={14} className="text-[color:var(--muted-fg)]" /> {rp.repository}{rp.hidden && <Badge variant="default">desabilitado</Badge>}</div></Td>
              <Td>{rp.branch}</Td><Td right>{rp.fontes}</Td><Td right>{rp.documentadas}</Td><Td right>{rp.cobertura_semantica}%</Td>
              <Td right>
                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  {canManage && (rp.hidden
                    ? <button disabled={busy === rp.repository} onClick={() => toggleRepo(rp.repository, false)} title="Reativar (volta a aparecer nas consultas)" className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-[color:var(--primary,#157582)] hover:bg-[color:var(--muted-bg,#f1f5f9)] disabled:opacity-40"><RotateCcw size={13} /> Reativar</button>
                    : <button disabled={busy === rp.repository} onClick={() => toggleRepo(rp.repository, true)} title="Desabilitar (some das consultas; mantém a ingestão)" className="inline-flex items-center rounded-md px-1.5 py-1 text-[color:var(--muted-fg)] hover:bg-[color:var(--danger-bg,#fef2f2)] hover:text-[color:var(--danger-fg,#b91c1c)] disabled:opacity-40"><EyeOff size={14} /></button>)}
                  {onOpenRepo && !rp.hidden && <ChevronRight size={15} className="text-[color:var(--muted-fg)]" />}
                </div>
              </Td>
            </Tr>
          ))}</Tbody></Table>
      )}</div>
    )}</div>
}

function RepoPanel({ m, onOpenDir, onNavigateSource, crumbs, nav }: { m: Extract<Meta, { type: 'repo' }>; onOpenDir: (id: string) => void; onNavigateSource: (id: number) => void; crumbs?: Crumb[]; nav?: NavAbs }) {
  const { k, failed } = useKnowledge({ customer_id: m.customer_id, repository: m.repository })
  const [dirs, setDirs] = useState<DirRow[] | null>(null)
  useEffect(() => { let a = true; api.get<{ data: { dirs: DirRow[] } }>(`/source-docs/tree/nodes?customer_id=${m.customer_id}&repository=${encodeURIComponent(m.repository)}&path=`).then((r) => a && setDirs(r.data.dirs)).catch(() => a && setDirs([])); return () => { a = false } }, [m.customer_id, m.repository])
  const search = useScopedSearch({ customer_id: m.customer_id, repository: m.repository })
  return <div className="flex h-full flex-col gap-4 overflow-auto p-5"><Breadcrumb items={crumbs ?? [{ label: m.customerName }, { label: m.repository }]} /><h2 className="flex items-center gap-2 text-lg font-semibold"><FolderGit2 size={18} /> {m.repository}</h2>
    {nav && <ScopeSearchBox search={search} label={m.repository} />}
    {m.row && <div className="text-xs text-[color:var(--muted-fg)]"><span className="inline-flex items-center gap-1"><GitBranch size={12} /> {m.row.branch}</span> · Última atualização do acervo: {dt(m.row.ultima_atualizacao_acervo)} <span className="opacity-70">(não é sync do GitHub)</span></div>}
    <KnowledgeBlock k={k} failed={failed} onNavigateSource={onNavigateSource} />
    {nav && search.term.trim() ? <ScopeResults search={search} scopeLabel={`${m.customerName} / ${m.repository}`} nav={nav} /> : (
    <div><div className="mb-1 text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">Diretórios</div>
      {dirs === null ? <Skeleton className="h-16" /> : dirs.length === 0 ? <EmptyState icon={Folder} title="Sem diretórios" description="Repositório sem estrutura de pastas." /> : (
        <Table><Thead><Tr><Th>Diretório</Th><Th right>Fontes</Th><Th right>Com semântica</Th><Th right>Cobertura</Th><Th right>Parciais</Th><Th></Th></Tr></Thead>
          <Tbody>{dirs.map((d) => { const cob = d.fontes ? Math.round(d.documentadas / d.fontes * 100) : 0; return (
            <Tr key={d.path} onClick={() => onOpenDir(`d:${m.customer_id}:${m.repository}:${d.path}`)} className="cursor-pointer">
              <Td><div className="flex items-center gap-2 font-medium"><Folder size={14} className="text-[color:var(--muted-fg)]" /> {d.name}</div></Td>
              <Td right>{d.fontes}</Td><Td right>{d.documentadas}</Td><Td right>{cob}%</Td><Td right>{d.parciais}</Td>
              <Td right><ChevronRight size={15} className="text-[color:var(--muted-fg)]" /></Td>
            </Tr>
          ) })}</Tbody></Table>
      )}</div>
    )}</div>
}

function FolderPanel({ selected, onOpenDir, onOpenFile, onNavigateSource, crumbs, nav }: { selected: Extract<Meta, { type: 'dir' }>; onOpenDir: (id: string) => void; onOpenFile: (id: number, fn: string) => void; onNavigateSource: (id: number) => void; crumbs?: Crumb[]; nav?: NavAbs }) {
  const [data, setData] = useState<{ dirs: DirRow[]; files: FileRow[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [reqCtx, setReqCtx] = useState<SolicitarCtx | null>(null)
  const { k, failed } = useKnowledge({ customer_id: selected.customer_id, repository: selected.repository, path: selected.path })
  useEffect(() => { let alive = true; setLoading(true); setFilter(null); setSel(new Set())
    api.get<{ data: { dirs: DirRow[]; files: FileRow[] } }>(`/source-docs/tree/nodes?customer_id=${selected.customer_id}&repository=${encodeURIComponent(selected.repository)}&path=${encodeURIComponent(selected.path)}`).then((r) => alive && setData(r.data)).catch(() => alive && setData({ dirs: [], files: [] })).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [selected])
  const search = useScopedSearch({ customer_id: selected.customer_id, repository: selected.repository, path: selected.path })
  const folderName = selected.path.split('/').filter(Boolean).slice(-1)[0] ?? selected.repository
  const builtCrumbs: Crumb[] = [{ label: selected.customerName }, { label: selected.repository }, ...selected.path.split('/').filter(Boolean).map((s) => ({ label: s }))]
  const files = (data?.files ?? []).filter((f) => !filter || f.semantic === filter)
  return <div className="flex h-full flex-col gap-4 overflow-auto p-5"><Breadcrumb items={crumbs ?? builtCrumbs} maxItems={6} />
    {nav && <ScopeSearchBox search={search} label={folderName} />}
    <KnowledgeBlock k={k} failed={failed} onNavigateSource={onNavigateSource} onHealth={(key) => setFilter(key === 'completed' || key === 'partial' || key === 'none' ? key : (key === 'gaps' ? 'partial' : null))} />
    {nav && search.term.trim() ? <ScopeResults search={search} scopeLabel={`${selected.customerName} / ${selected.repository} / ${selected.path}`} nav={nav} /> : (
    loading || !data ? <Skeleton className="h-40" /> : <>
      {data.dirs.length > 0 && <div><div className="mb-1 text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">Subdiretórios</div>
        <Table><Thead><Tr><Th>Diretório</Th><Th right>Fontes</Th><Th right>Com semântica</Th><Th right>Cobertura</Th><Th right>Parciais</Th><Th></Th></Tr></Thead>
          <Tbody>{data.dirs.map((d) => { const cob = d.fontes ? Math.round(d.documentadas / d.fontes * 100) : 0; return (
            <Tr key={d.path} onClick={() => onOpenDir(`d:${selected.customer_id}:${selected.repository}:${d.path}`)} className="cursor-pointer">
              <Td><div className="flex items-center gap-2 font-medium"><Folder size={14} className="text-[color:var(--muted-fg)]" /> {d.name}</div></Td>
              <Td right>{d.fontes}</Td><Td right>{d.documentadas}</Td><Td right>{cob}%</Td><Td right>{d.parciais}</Td>
              <Td right><ChevronRight size={15} className="text-[color:var(--muted-fg)]" /></Td>
            </Tr>
          ) })}</Tbody></Table></div>}
      {(data.files.length > 0) && (
        <div><div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">Fontes {filter && <button onClick={() => setFilter(null)} className="text-[color:var(--accent,#2563eb)] normal-case">(limpar filtro: {filter})</button>}
          <span className="ml-auto flex items-center gap-3 normal-case">
            {sel.size > 0 && <button onClick={() => setReqCtx({ title: `Solicitar fontes — ${folderName}`, customerId: selected.customer_id, repository: selected.repository, scopeType: 'source', items: files.filter((f) => sel.has(f.id)).map((f) => ({ path: f.path, label: f.filename })) })} className="inline-flex items-center gap-1 text-[color:var(--primary,#157582)]"><FilePlus2 size={13} /> Solicitar {sel.size}</button>}
            <button onClick={() => setReqCtx({ title: `Solicitar pasta — ${folderName}`, customerId: selected.customer_id, repository: selected.repository, scopeType: 'folder', folderPath: selected.path })} className="inline-flex items-center gap-1 text-[color:var(--muted-fg)] hover:text-[color:var(--fg)]"><FilePlus2 size={13} /> Solicitar pasta</button>
          </span></div>
        <Table><Thead><Tr><Th></Th><Th>Fonte</Th><Th>Conhecimento</Th><Th right>Funções</Th><Th>Análise</Th><Th>Última análise</Th><Th right>Custo IA</Th></Tr></Thead>
          <Tbody>{files.map((f) => <Tr key={f.id} onClick={() => onOpenFile(f.id, f.filename)} className="cursor-pointer"><Td><input type="checkbox" checked={sel.has(f.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => setSel((prev) => { const s = new Set(prev); e.target.checked ? s.add(f.id) : s.delete(f.id); return s })} /></Td><Td>{f.filename}</Td><Td>{semBadge(f.semantic)}</Td><Td right>{f.functions_count ?? '—'}</Td><Td>{f.analysis_status}</Td><Td>{dt(f.last_change_at)}</Td><Td right>{money(f.cost_usd)}</Td></Tr>)}</Tbody></Table></div>
      )}
      {data.files.length === 0 && data.dirs.length === 0 && <EmptyState icon={Folder} title="Pasta vazia" description="Sem fontes neste nível." />}
    </>
    )}
    {reqCtx && <SolicitarFonteModal ctx={reqCtx} onClose={() => { setReqCtx(null); setSel(new Set()) }} />}
  </div>
}

// ── Busca contextual instantânea (nível atual do Acervo) — reusa GET /source-docs ──
interface Hit { id: number; filename: string; path: string; repository: string; customer?: { id: number; name: string } | null; semantic_quality?: string; functions_count?: number | null }
interface FolderHit { name: string; path: string; repository: string; count: number }
type NavAbs = { file: (h: Hit) => void; folder: (repository: string, path: string) => void; repo: (repository: string) => void }
const dirOf = (p: string) => p.split('/').slice(0, -1).join('/')
const semLabel = (s: string) => (s === 'completed' ? 'Completa' : s === 'partial' ? 'Parcial' : 'Sem semântica')

function deriveFolders(hits: Hit[], term: string): FolderHit[] {
  const t = term.toLowerCase(); const map = new Map<string, FolderHit>()
  for (const h of hits) {
    const segs = h.path.split('/').filter(Boolean); let acc = ''
    for (let i = 0; i < segs.length - 1; i++) {
      acc = acc ? `${acc}/${segs[i]}` : segs[i]
      if (segs[i].toLowerCase().includes(t)) { const key = `${h.repository}|${acc}`; const e = map.get(key) ?? { name: segs[i], path: acc, repository: h.repository, count: 0 }; e.count++; map.set(key, e) }
    }
  }
  return [...map.values()].slice(0, 8)
}

function useScopedSearch(scope: { customer_id: number; repository?: string; path?: string }) {
  const [term, setTerm] = useState('')
  const [inKnowledge, setInKnowledge] = useState(false)
  const [hits, setHits] = useState<Hit[] | null>(null) // null = sem busca ativa
  const [updating, setUpdating] = useState(false)
  const seq = useRef(0)
  const ctrl = useRef<AbortController | null>(null)
  const scopeKey = `${scope.customer_id}|${scope.repository ?? ''}|${scope.path ?? ''}`

  // novo contexto → zera termo/toggle/resultados (toggle sempre volta desligado)
  useEffect(() => { setTerm(''); setInKnowledge(false); setHits(null); setUpdating(false) }, [scopeKey])

  useEffect(() => {
    const t = term.trim()
    if (!t) { setHits(null); setUpdating(false); if (ctrl.current) ctrl.current.abort(); return }
    setUpdating(true)
    const timer = setTimeout(() => {
      const my = ++seq.current
      if (ctrl.current) ctrl.current.abort()
      const c = new AbortController(); ctrl.current = c
      const p = new URLSearchParams({ q: t, per_page: '40', with_situation: 'false' })
      p.set('customer_id', String(scope.customer_id))
      if (scope.repository) p.set('repository', scope.repository)
      if (scope.path) p.set('path_prefix', scope.path)
      if (inKnowledge) p.set('in', 'knowledge')
      api.get<{ data: Hit[] }>(`/source-docs?${p.toString()}`, { signal: c.signal })
        .then((r) => { if (my === seq.current) { setHits(r.data); setUpdating(false) } })
        .catch((e) => { if ((e as { name?: string })?.name === 'AbortError') return; if (my === seq.current) { setHits([]); setUpdating(false) } })
    }, 350)
    return () => clearTimeout(timer)
  }, [term, inKnowledge, scopeKey, scope.customer_id, scope.repository, scope.path])

  return { term, setTerm, inKnowledge, setInKnowledge, hits, updating, clear: () => setTerm('') }
}
type ScopedSearch = ReturnType<typeof useScopedSearch>

function ScopeSearchBox({ search, label }: { search: ScopedSearch; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--muted-fg)]" />
          <input value={search.term} onChange={(e) => search.setTerm(e.target.value)} placeholder={`Buscar em ${label}…`} className="w-full rounded-lg border border-[color:var(--border)] bg-[var(--surface)] py-2 pl-9 pr-8 text-sm outline-none" />
          {search.updating && <span className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-xs text-[color:var(--muted-fg)]">⟳</span>}
        </div>
        {search.term && <button onClick={search.clear} className="whitespace-nowrap text-xs text-[color:var(--muted-fg)] hover:text-[color:var(--fg)]">Limpar busca</button>}
      </div>
      <label className="flex w-fit items-center gap-1.5 text-xs text-[color:var(--muted-fg)]">
        <input type="checkbox" checked={search.inKnowledge} onChange={(e) => search.setInKnowledge(e.target.checked)} /> Buscar também no conhecimento
      </label>
    </div>
  )
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><div className="mb-1 text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">{title}</div><div className="flex flex-col divide-y divide-[color:var(--border)] overflow-hidden rounded-md border border-[color:var(--border)]">{children}</div></div>
}
function ResultRow({ onClick, icon: Icon, title, sub }: { onClick: () => void; icon: typeof Folder; title: string; sub: string }) {
  return <button onClick={onClick} className="flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[color:var(--muted-bg,#f1f5f9)]"><Icon size={14} className="shrink-0 text-[color:var(--muted-fg)]" /><span className="min-w-0 truncate"><span className="font-medium">{title}</span> <span className="text-xs text-[color:var(--muted-fg)]">{sub}</span></span><ChevronRight size={15} className="ml-auto shrink-0 text-[color:var(--muted-fg)]" /></button>
}

function ScopeResults({ search, scopeLabel, repos, nav }: { search: ScopedSearch; scopeLabel: string; repos?: RepoRow[] | null; nav: NavAbs }) {
  const hits = search.hits
  const term = search.term.trim()
  const folders = useMemo(() => (hits ? deriveFolders(hits, term) : []), [hits, term])
  const matchRepos = useMemo(() => (repos ?? []).filter((r) => r.repository.toLowerCase().includes(term.toLowerCase())), [repos, term])
  if (hits === null) return <div className="py-6 text-sm text-[color:var(--muted-fg)]">Buscando…</div>
  const total = hits.length + folders.length + matchRepos.length
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-xs text-[color:var(--muted-fg)]">Buscando em: <Badge variant="default">{scopeLabel}</Badge> · {total} encontrado{total === 1 ? '' : 's'}{search.updating && <span className="animate-spin">⟳</span>}</div>
      {total === 0 && <EmptyState icon={Search} title="Nada encontrado" description="Ajuste o termo ou limpe a busca." />}
      {matchRepos.length > 0 && <ResultSection title="Repositórios">{matchRepos.map((r) => <ResultRow key={`r:${r.repository}`} onClick={() => nav.repo(r.repository)} icon={FolderGit2} title={r.repository} sub={`${r.fontes} fontes · ${r.cobertura_semantica}%`} />)}</ResultSection>}
      {folders.length > 0 && <ResultSection title="Pastas">{folders.map((f) => <ResultRow key={`d:${f.repository}:${f.path}`} onClick={() => nav.folder(f.repository, f.path)} icon={Folder} title={f.name} sub={`${f.repository}/${f.path} · ${f.count} fonte${f.count === 1 ? '' : 's'}`} />)}</ResultSection>}
      {hits.length > 0 && <ResultSection title="Fontes">{hits.map((h) => <ResultRow key={`f:${h.id}`} onClick={() => nav.file(h)} icon={FileCode2} title={h.filename} sub={`${h.repository}/${h.path}${h.semantic_quality ? ' · ' + semLabel(h.semantic_quality) : ''}${h.functions_count != null ? ' · ' + h.functions_count + ' funções' : ''}`} />)}</ResultSection>}
    </div>
  )
}
