'use client'

// Central de Fontes — F3 · Acervo como tela de trabalho: árvore lazy Empresa→Repo→Diretório→Fonte +
// ficha da fonte no painel direito (split-view), navegação cross-source dentro do próprio Acervo,
// "Mostrar no Acervo" (via ?doc=) e persistência de contexto (sessionStorage + URL). Sem lógica de motor.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Building2, ChevronRight, FileCode2, Folder, FolderGit2, GitBranch, List, Network, Search } from 'lucide-react'
import {
  Badge, Breadcrumb, Card, EmptyState, PageHeader, SplitPanel, Skeleton, Tree,
  Table, Thead, Tbody, Tr, Th, Td,
} from '@/components/ds'
import type { Crumb, TreeNode } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { SourceDocPanel } from '@/components/central-fontes/source-doc-panel'

interface CustomerRow { customer_id: number; name: string; repos: number; fontes: number; documentadas: number; completas: number; parciais: number; pendentes: number; aguardando_aprovacao: number }
interface RepoRow { repository: string; source_repo_id: number | null; branch: string; owner: string; fontes: number; documentadas: number; parciais: number; cobertura_semantica: number; ultima_atualizacao_acervo: string | null }
interface DirRow { name: string; path: string; fontes: number; documentadas: number; parciais: number }
interface FileRow { id: number; filename: string; name: string; path: string; analysis_status: string; semantic: string; functions_count: number | null; last_change_at: string | null; cost_usd: number | null }
interface Ident { data: { id: number; filename: string; path: string; repository: string; customer?: { id: number; name: string } | null } }

type Meta =
  | { type: 'customer'; customer_id: number; name: string; row?: CustomerRow }
  | { type: 'repo'; customer_id: number; customerName: string; repository: string; row?: RepoRow }
  | { type: 'dir'; customer_id: number; customerName: string; repository: string; path: string }
  | { type: 'file'; doc_id: number; filename: string }

const SS_KEY = 'acervo-ctx'
const money = (n: number | null) => (n == null ? '—' : `US$ ${n.toFixed(2)}`)
const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')
const semBadge = (s: string) => s === 'completed' ? <Badge variant="success">Completa</Badge> : s === 'partial' ? <Badge variant="warning">Parcial</Badge> : <Badge variant="default">Sem semântica</Badge>
const fileBadge = (s: string) => s === 'completed' ? '●' : s === 'partial' ? '◐' : '○'

// ── Navegação progressiva (default) — dirigida por URL, reusa os mesmos painéis ──
export default function AcervoPage() {
  return <Suspense fallback={<div className="p-6"><Skeleton className="h-64" /></div>}><AcervoRouter /></Suspense>
}

function AcervoRouter() {
  const view = useSearchParams()?.get('view')
  return view === 'tree' ? <TreeExplorer /> : <ProgressiveNav />
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

function ViewToggle({ current, ctx }: { current: 'list' | 'tree'; ctx?: { customer_id?: number | null; repository?: string; path?: string } }) {
  const on = 'bg-[var(--primary,#157582)] text-white'
  const off = 'text-[color:var(--muted-fg)] hover:text-[color:var(--fg)]'
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-[color:var(--border)] text-sm">
      <Link href={buildAcervoHref({ ...(ctx ?? {}) })} className={`flex items-center gap-1 px-3 py-1.5 ${current === 'list' ? on : off}`}><List size={14} /> Lista</Link>
      <Link href={buildAcervoHref({ view: 'tree' })} className={`flex items-center gap-1 border-l border-[color:var(--border)] px-3 py-1.5 ${current === 'tree' ? on : off}`}><Network size={14} /> Árvore</Link>
    </div>
  )
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

function ProgressiveNav() {
  const router = useRouter()
  const sp = useSearchParams()
  const customerId = sp.get('customer_id') ? Number(sp.get('customer_id')) : null
  const repository = sp.get('repository') || ''
  const path = sp.get('path') || ''
  const docId = sp.get('doc') ? Number(sp.get('doc')) : null

  const [customers, setCustomers] = useState<CustomerRow[] | null>(null)
  const [custErr, setCustErr] = useState<string | null>(null)
  useEffect(() => { api.get<{ data: CustomerRow[] }>('/source-docs/tree/customers').then((r) => setCustomers(r.data)).catch((e) => setCustErr(e instanceof ApiError ? e.message : 'Falha ao carregar empresas.')) }, [])
  const customerName = customers?.find((c) => c.customer_id === customerId)?.name ?? ''

  // linha do repo (branch/última atualização) — só quando estamos no nível repo
  const [repoRow, setRepoRow] = useState<RepoRow | null>(null)
  useEffect(() => {
    if (!customerId || !repository) { setRepoRow(null); return }
    let a = true
    api.get<{ data: RepoRow[] }>(`/source-docs/tree/customers/${customerId}/repos`).then((r) => { if (a) setRepoRow(r.data.find((x) => x.repository === repository) ?? null) }).catch(() => {})
    return () => { a = false }
  }, [customerId, repository])

  // deep-link ?doc= (Mostrar no Acervo): resolve empresa/repo/path p/ breadcrumb
  const [docIdent, setDocIdent] = useState<Ident['data'] | null>(null)
  useEffect(() => {
    if (!docId) { setDocIdent(null); return }
    let a = true
    api.get<Ident>(`/source-docs/${docId}`).then((r) => { if (a) setDocIdent(r.data) }).catch(() => {})
    return () => { a = false }
  }, [docId])

  const openCustomer = useCallback((id: number) => router.push(buildAcervoHref({ customer_id: id })), [router])
  const openRepo = useCallback((repo: string) => router.push(buildAcervoHref({ customer_id: customerId, repository: repo })), [router, customerId])
  const openDirPath = useCallback((p: string) => router.push(buildAcervoHref({ customer_id: customerId, repository, path: p })), [router, customerId, repository])
  const openFile = useCallback((id: number) => router.push(buildAcervoHref({ customer_id: customerId, repository, path, doc: id })), [router, customerId, repository, path])
  const gotoSource = useCallback(async (id: number) => {
    try {
      const m = (await api.get<Ident>(`/source-docs/${id}`)).data
      const dir = m.path.split('/').slice(0, -1).join('/')
      router.push(buildAcervoHref({ customer_id: m.customer?.id ?? null, repository: m.repository, path: dir, doc: id }))
    } catch { /* ignore */ }
  }, [router])
  const dirPathFromId = (id: string) => id.replace(`d:${customerId}:${repository}:`, '')
  // navegação absoluta p/ resultados da busca contextual (usa dados do próprio hit)
  const navAbs: NavAbs = useMemo(() => ({
    file: (h) => router.push(buildAcervoHref({ customer_id: h.customer?.id ?? customerId ?? undefined, repository: h.repository, path: dirOf(h.path), doc: h.id })),
    folder: (repo, p) => router.push(buildAcervoHref({ customer_id: customerId, repository: repo, path: p })),
    repo: (repo) => router.push(buildAcervoHref({ customer_id: customerId, repository: repo })),
  }), [router, customerId])

  const effRepo = repository || docIdent?.repository || ''
  const effCustId = customerId ?? docIdent?.customer?.id ?? null
  const effCustName = customerName || docIdent?.customer?.name || ''
  const effDir = docIdent ? docIdent.path.split('/').slice(0, -1).join('/') : path
  const crumbs: Crumb[] = useMemo(() => {
    const out: Crumb[] = [{ label: 'Central de Fontes', href: '/central-fontes' }]
    if (effCustId) out.push({ label: effCustName || '…', href: buildAcervoHref({ customer_id: effCustId }) })
    if (effRepo) out.push({ label: effRepo, href: buildAcervoHref({ customer_id: effCustId, repository: effRepo }) })
    if (effDir) { let acc = ''; for (const seg of effDir.split('/').filter(Boolean)) { acc = acc ? `${acc}/${seg}` : seg; out.push({ label: seg, href: buildAcervoHref({ customer_id: effCustId, repository: effRepo, path: acc }) }) } }
    if (docId && docIdent) out.push({ label: docIdent.filename })
    return out
  }, [effCustId, effCustName, effRepo, effDir, docId, docIdent])

  const header = <PageHeader icon={FolderGit2} title="Central de Fontes — Acervo" subtitle="Empresa → Repositório → Diretório → Fonte → Conhecimento." actions={<ViewToggle current="list" ctx={{ customer_id: customerId, repository, path }} />} />

  if (docId) {
    return <>{header}
      <div className="mb-3 flex items-center justify-between gap-2">
        <Breadcrumb items={crumbs} maxItems={7} />
        <button onClick={() => router.push(buildAcervoHref({ customer_id: effCustId, repository: effRepo, path: effDir }))} className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-[color:var(--muted-fg)] hover:text-[color:var(--fg)]"><ArrowLeft size={14} /> Voltar</button>
      </div>
      <Card padding="none" className="overflow-hidden"><div className="min-h-[60vh]"><SourceDocPanel docId={docId} onNavigateSource={gotoSource} /></div></Card>
    </>
  }

  let body: React.ReactNode
  if (!customerId) body = <EmpresaList customers={customers} err={custErr} onOpen={openCustomer} />
  else if (!repository) body = <CustomerPanel m={{ type: 'customer', customer_id: customerId, name: customerName }} onNavigateSource={gotoSource} onOpenRepo={openRepo} crumbs={crumbs} nav={navAbs} />
  else if (!path) body = <RepoPanel m={{ type: 'repo', customer_id: customerId, customerName, repository, row: repoRow ?? undefined }} onOpenDir={(id) => openDirPath(dirPathFromId(id))} onNavigateSource={gotoSource} crumbs={crumbs} nav={navAbs} />
  else body = <FolderPanel selected={{ type: 'dir', customer_id: customerId, customerName, repository, path }} onOpenDir={(id) => openDirPath(dirPathFromId(id))} onOpenFile={(id) => openFile(id)} onNavigateSource={gotoSource} crumbs={crumbs} nav={navAbs} />

  return <>{header}<Card padding="none" className="overflow-hidden"><div className="min-h-[60vh]">{body}</div></Card></>
}

function TreeExplorer() {
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Meta | null>(null)
  const [fileId, setFileId] = useState<number | null>(null)
  const [rootLoading, setRootLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
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

  // L1: empresas + reconstrução de contexto (URL ?doc= tem prioridade; senão sessionStorage)
  useEffect(() => {
    let alive = true
    api.get<{ data: CustomerRow[] }>('/source-docs/tree/customers').then((r) => {
      if (!alive) return
      setNodes(r.data.map<TreeNode>((c) => { meta.current[`c:${c.customer_id}`] = { type: 'customer', customer_id: c.customer_id, name: c.name, row: c }; return { id: `c:${c.customer_id}`, label: c.name, icon: Building2, badge: c.fontes, hasChildren: c.fontes > 0 } }))
      const urlDoc = new URLSearchParams(window.location.search).get('doc')
      let saved: { fileId?: number } = {}
      try { saved = JSON.parse(sessionStorage.getItem(SS_KEY) || '{}') } catch {}
      const target = urlDoc ? Number(urlDoc) : saved.fileId
      if (target) void revealDoc(target, false)
    }).catch((e) => setErr(e instanceof ApiError ? e.message : 'Falha ao carregar empresas.')).finally(() => alive && setRootLoading(false))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // persiste contexto mínimo (fonte selecionada); revealDoc reconstrói a cadeia da árvore ao voltar
  useEffect(() => { try { sessionStorage.setItem(SS_KEY, JSON.stringify({ fileId })) } catch {} }, [fileId])

  const getRepos = (cid: number) => api.get<{ data: RepoRow[] }>(`/source-docs/tree/customers/${cid}/repos`).then((r) => r.data)
  const getNodes = (cid: number, repo: string, path: string) => api.get<{ data: { dirs: DirRow[]; files: FileRow[] } }>(`/source-docs/tree/nodes?customer_id=${cid}&repository=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`).then((r) => r.data)

  const loadChildren = useCallback(async (node: TreeNode) => {
    const m = meta.current[node.id]; if (!m) return
    patch(node.id, (n) => ({ ...n, loading: true }))
    try {
      if (m.type === 'customer') mergeChildren(node.id, buildRepoNodes(m.customer_id, m.name, await getRepos(m.customer_id)))
      else if (m.type === 'repo') mergeChildren(node.id, buildNodeChildren(m.customer_id, m.customerName, m.repository, await getNodes(m.customer_id, m.repository, '')))
      else if (m.type === 'dir') mergeChildren(node.id, buildNodeChildren(m.customer_id, m.customerName, m.repository, await getNodes(m.customer_id, m.repository, m.path)))
    } catch { patch(node.id, (n) => ({ ...n, loading: false, badge: '⚠' })) }
  }, [patch, mergeChildren, buildRepoNodes, buildNodeChildren])

  const onToggle = useCallback((node: TreeNode, willExpand: boolean) => {
    setExpanded((prev) => { const s = new Set(prev); willExpand ? s.add(node.id) : s.delete(node.id); return s })
    if (willExpand && node.hasChildren && !node.children?.length) void loadChildren(node)
  }, [loadChildren])

  const selectFile = useCallback((docId: number, filename: string) => {
    meta.current[`f:${docId}`] = { type: 'file', doc_id: docId, filename }
    setFileId(docId); setSelected({ type: 'file', doc_id: docId, filename })
    try { window.history.replaceState(null, '', `/central-fontes/acervo?doc=${docId}`) } catch {}
  }, [])

  // revela uma fonte no Acervo (cross-source / Mostrar no Acervo): carrega a cadeia e seleciona.
  const revealDoc = useCallback(async (targetId: number, select = true) => {
    try {
      const m = (await api.get<Ident>(`/source-docs/${targetId}`)).data
      const cid = m.customer?.id, cname = m.customer?.name ?? '—', repo = m.repository, path = m.path
      if (!cid || !repo) return
      mergeChildren(`c:${cid}`, buildRepoNodes(cid, cname, await getRepos(cid)))
      mergeChildren(`r:${cid}:${repo}`, buildNodeChildren(cid, cname, repo, await getNodes(cid, repo, '')))
      const dirs = path.split('/').slice(0, -1); let prefix = ''
      for (const seg of dirs) { prefix = prefix ? `${prefix}/${seg}` : seg; mergeChildren(`d:${cid}:${repo}:${prefix}`, buildNodeChildren(cid, cname, repo, await getNodes(cid, repo, prefix))) }
      setExpanded((prev) => { const s = new Set(prev); s.add(`c:${cid}`); s.add(`r:${cid}:${repo}`); let p = ''; for (const seg of dirs) { p = p ? `${p}/${seg}` : seg; s.add(`d:${cid}:${repo}:${p}`) } return s })
      if (select) selectFile(targetId, m.filename)
      else { meta.current[`f:${targetId}`] = { type: 'file', doc_id: targetId, filename: m.filename }; setFileId(targetId); setSelected({ type: 'file', doc_id: targetId, filename: m.filename }) }
    } catch { /* silencioso */ }
  }, [mergeChildren, buildRepoNodes, buildNodeChildren, selectFile])

  const onSelect = useCallback((node: TreeNode) => {
    const m = meta.current[node.id]; if (!m) return
    if (m.type === 'file') { selectFile(m.doc_id, m.filename); return }
    setFileId(null); setSelected(m)
    if ((m.type === 'dir' || m.type === 'repo') && !node.children?.length && node.hasChildren) { setExpanded((prev) => new Set(prev).add(node.id)); void loadChildren(node) }
  }, [selectFile, loadChildren])

  const selectedTreeId = fileId ? `f:${fileId}` : (selected && selected.type !== 'file' ? nodeIdOf(selected) : undefined)

  return (
    <>
      <PageHeader icon={FolderGit2} title="Acervo — Árvore" subtitle="Empresa → Repositório → Diretório Git → Fonte → Conhecimento. Explorador técnico do legado." actions={<ViewToggle current="tree" />} />
      {err ? <EmptyState icon={FolderGit2} title="Erro" description={err} /> : (
        <Card padding="none" className="overflow-hidden">
          <div className="h-[calc(100vh-300px)] min-h-[460px]">
            <SplitPanel storageKey="acervo-split" className="h-full" defaultWidth={340}
              left={
                <div className="h-full border-r border-[color:var(--border)] p-2">
                  <div className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">Navegador</div>
                  {rootLoading ? <Skeleton className="h-40" /> : <Tree nodes={nodes} expandedIds={expanded} onToggle={onToggle} selectedId={selectedTreeId} onSelect={onSelect} />}
                </div>
              }
              right={
                fileId ? <SourceDocPanel docId={fileId} onNavigateSource={(id) => void revealDoc(id)} />
                  : <RightPanel selected={selected} onOpenDir={(id) => { const n = findNode(nodes, id); if (n) onSelect(n) }} onOpenFile={(id, fn) => selectFile(id, fn)} onNavigateSource={(id) => void revealDoc(id)} />
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
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Metric label="Fontes" value={k.fontes} /><Metric label="Documentadas" value={k.documentadas} /><Metric label="Cobertura" value={`${k.cobertura_semantica}%`} />
        <Metric label="Funções" value={k.funcoes} /><Metric label="Regras" value={k.regras} /><Metric label="Dependências" value={k.dependencias} />
        <Metric label="Custo IA" value={`US$ ${k.custo_ia_usd.toFixed(2)}`} />
      </div>
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">Saúde do conhecimento</div>
        <div className="flex flex-wrap gap-2">
          {chip('completas', k.saude.completa, 'completed', 'var(--success,#16a34a)')}
          {chip('parciais', k.saude.parcial, 'partial', 'var(--warning,#d97706)')}
          {chip('sem doc.', k.saude.sem_documentacao, 'none', 'var(--muted-fg)')}
          {chip('com gaps', k.saude.com_gaps, 'gaps', 'var(--warning,#d97706)')}
          {chip('aguardando IA', k.saude.aguardando, 'await', 'var(--accent,#2563eb)')}
        </div>
      </div>
      {k.processos_modulos.filter((p) => p.modulo !== '—').length > 0 && (
        <div><div className="mb-1 text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">Processos / módulos identificados</div>
          <div className="flex flex-wrap gap-1.5">{k.processos_modulos.filter((p) => p.modulo !== '—').map((p, i) => <Badge key={i} variant="default">{p.modulo} · {p.fontes}</Badge>)}</div></div>
      )}
      {k.linguagens.length > 0 && <div className="text-xs text-[color:var(--muted-fg)]">Linguagens: {k.linguagens.map((l) => `${l.lang} (${l.fontes})`).join(' · ')}</div>}
      {k.cross_source.length > 0 && (
        <div><div className="mb-1 text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">Relações com outras fontes ({k.cross_source.length})</div>
          <div className="flex flex-col gap-1">{k.cross_source.slice(0, 12).map((e, i) => (
            <button key={i} onClick={() => onNavigateSource?.(e.to_id)} className="flex items-center gap-1.5 rounded px-1 py-0.5 text-left text-sm hover:text-[color:var(--accent,#2563eb)]">
              <span className="font-medium">{e.from_name}</span><span className="text-[color:var(--muted-fg)]">→ {e.symbol} →</span><span className="font-medium underline decoration-dotted">{e.to_name}</span>
              <span className="ml-auto text-xs text-[color:var(--muted-fg)]">{e.to_path}</span>
            </button>
          ))}</div></div>
      )}
    </div>
  )
}

function RightPanel({ selected, onOpenDir, onOpenFile, onNavigateSource }: { selected: Meta | null; onOpenDir: (id: string) => void; onOpenFile: (id: number, fn: string) => void; onNavigateSource: (id: number) => void }) {
  if (!selected) return <div className="p-6"><EmptyState icon={FolderGit2} title="Selecione no navegador" description="Escolha uma empresa, repositório, pasta ou fonte." /></div>
  if (selected.type === 'customer') return <CustomerPanel key={`c:${selected.customer_id}`} m={selected} onNavigateSource={onNavigateSource} />
  if (selected.type === 'repo') return <RepoPanel key={`r:${selected.customer_id}:${selected.repository}`} m={selected} onOpenDir={onOpenDir} onNavigateSource={onNavigateSource} />
  if (selected.type !== 'dir') return null
  return <FolderPanel key={nodeIdOf(selected)} selected={selected} onOpenDir={onOpenDir} onOpenFile={onOpenFile} onNavigateSource={onNavigateSource} />
}

function CustomerPanel({ m, onNavigateSource, onOpenRepo, crumbs, nav }: { m: Extract<Meta, { type: 'customer' }>; onNavigateSource: (id: number) => void; onOpenRepo?: (repository: string) => void; crumbs?: Crumb[]; nav?: NavAbs }) {
  const { k, failed } = useKnowledge({ customer_id: m.customer_id })
  const [repos, setRepos] = useState<RepoRow[] | null>(null)
  useEffect(() => { let a = true; api.get<{ data: RepoRow[] }>(`/source-docs/tree/customers/${m.customer_id}/repos`).then((r) => a && setRepos(r.data)).catch(() => a && setRepos([])); return () => { a = false } }, [m.customer_id])
  const search = useScopedSearch({ customer_id: m.customer_id })
  return <div className="flex h-full flex-col gap-4 overflow-auto p-5"><Breadcrumb items={crumbs ?? [{ label: m.name }]} /><h2 className="flex items-center gap-2 text-lg font-semibold"><Building2 size={18} /> {m.name}</h2>
    {nav && <ScopeSearchBox search={search} label={m.name} />}
    <KnowledgeBlock k={k} failed={failed} onNavigateSource={onNavigateSource} />
    {nav && search.term.trim() ? <ScopeResults search={search} scopeLabel={m.name} repos={repos} nav={nav} /> : (
    <div><div className="mb-1 text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">Repositórios</div>
      {repos === null ? <Skeleton className="h-16" /> : repos.length === 0 ? <EmptyState icon={FolderGit2} title="Sem repositórios" description="Nenhum repositório de fonte nesta empresa." /> : (
        <Table><Thead><Tr><Th>Repositório</Th><Th>Branch</Th><Th right>Fontes</Th><Th right>Com semântica</Th><Th right>Cobertura</Th><Th></Th></Tr></Thead>
          <Tbody>{repos.map((rp) => (
            <Tr key={rp.repository} onClick={() => onOpenRepo?.(rp.repository)} className={onOpenRepo ? 'cursor-pointer' : ''}>
              <Td><div className="flex items-center gap-2 font-medium"><FolderGit2 size={14} className="text-[color:var(--muted-fg)]" /> {rp.repository}</div></Td>
              <Td>{rp.branch}</Td><Td right>{rp.fontes}</Td><Td right>{rp.documentadas}</Td><Td right>{rp.cobertura_semantica}%</Td>
              <Td right>{onOpenRepo && <ChevronRight size={15} className="text-[color:var(--muted-fg)]" />}</Td>
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
  const { k, failed } = useKnowledge({ customer_id: selected.customer_id, repository: selected.repository, path: selected.path })
  useEffect(() => { let alive = true; setLoading(true); setFilter(null)
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
        <div><div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">Fontes {filter && <button onClick={() => setFilter(null)} className="text-[color:var(--accent,#2563eb)] normal-case">(limpar filtro: {filter})</button>}</div>
        <Table><Thead><Tr><Th>Fonte</Th><Th>Conhecimento</Th><Th right>Funções</Th><Th>Análise</Th><Th>Última análise</Th><Th right>Custo IA</Th></Tr></Thead>
          <Tbody>{files.map((f) => <Tr key={f.id} onClick={() => onOpenFile(f.id, f.filename)} className="cursor-pointer"><Td>{f.filename}</Td><Td>{semBadge(f.semantic)}</Td><Td right>{f.functions_count ?? '—'}</Td><Td>{f.analysis_status}</Td><Td>{dt(f.last_change_at)}</Td><Td right>{money(f.cost_usd)}</Td></Tr>)}</Tbody></Table></div>
      )}
      {data.files.length === 0 && data.dirs.length === 0 && <EmptyState icon={Folder} title="Pasta vazia" description="Sem fontes neste nível." />}
    </>
    )}
  </div>
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex flex-col"><span className="text-xs text-[color:var(--muted-fg)]">{label}</span><span className="text-base font-semibold tabular-nums">{value}</span></div>
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
