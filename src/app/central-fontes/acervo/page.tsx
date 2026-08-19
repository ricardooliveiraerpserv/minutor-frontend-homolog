'use client'

// Central de Fontes — F3 · Acervo como tela de trabalho: árvore lazy Empresa→Repo→Diretório→Fonte +
// ficha da fonte no painel direito (split-view), navegação cross-source dentro do próprio Acervo,
// "Mostrar no Acervo" (via ?doc=) e persistência de contexto (sessionStorage + URL). Sem lógica de motor.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Building2, FileCode2, Folder, FolderGit2, GitBranch } from 'lucide-react'
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

export default function AcervoPage() {
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

  // persiste contexto mínimo (fonte selecionada) — restauração razoável ao voltar
  useEffect(() => { try { sessionStorage.setItem(SS_KEY, JSON.stringify({ fileId, expanded: [...expanded] })) } catch {} }, [fileId, expanded])

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
      <PageHeader icon={FolderGit2} title="Acervo" subtitle="Empresa → Repositório → Diretório Git → Fonte → Conhecimento. Explorador técnico do legado." />
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
  useEffect(() => { let alive = true; setK(null)
    const qs = `customer_id=${scope.customer_id}${scope.repository ? `&repository=${encodeURIComponent(scope.repository)}` : ''}${scope.path ? `&path=${encodeURIComponent(scope.path)}` : ''}`
    api.get<{ data: Knowledge }>(`/source-docs/tree/knowledge?${qs}`).then((r) => alive && setK(r.data)).catch(() => {})
    return () => { alive = false }
  }, [scope.customer_id, scope.repository, scope.path])
  return k
}

function KnowledgeBlock({ k, onNavigateSource, onHealth }: { k: Knowledge | null; onNavigateSource?: (id: number) => void; onHealth?: (key: string) => void }) {
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
  if (selected.type === 'customer') return <CustomerPanel key={`c:${selected.customer_id}`} m={selected} onOpenDir={onOpenDir} onNavigateSource={onNavigateSource} />
  if (selected.type === 'repo') return <RepoPanel key={`r:${selected.customer_id}:${selected.repository}`} m={selected} onOpenDir={onOpenDir} onNavigateSource={onNavigateSource} />
  if (selected.type !== 'dir') return null
  return <FolderPanel key={nodeIdOf(selected)} selected={selected} onOpenDir={onOpenDir} onOpenFile={onOpenFile} onNavigateSource={onNavigateSource} />
}

function CustomerPanel({ m, onOpenDir, onNavigateSource }: { m: Extract<Meta, { type: 'customer' }>; onOpenDir: (id: string) => void; onNavigateSource: (id: number) => void }) {
  const k = useKnowledge({ customer_id: m.customer_id })
  const [repos, setRepos] = useState<RepoRow[] | null>(null)
  useEffect(() => { let a = true; api.get<{ data: RepoRow[] }>(`/source-docs/tree/customers/${m.customer_id}/repos`).then((r) => a && setRepos(r.data)); return () => { a = false } }, [m.customer_id])
  return <div className="flex h-full flex-col gap-4 overflow-auto p-5"><Breadcrumb items={[{ label: m.name }]} /><h2 className="flex items-center gap-2 text-lg font-semibold"><Building2 size={18} /> {m.name}</h2>
    <ScopeSearch customer_id={m.customer_id} />
    <KnowledgeBlock k={k} onNavigateSource={onNavigateSource} />
    <div><div className="mb-1 text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">Repositórios</div>
      {repos === null ? <Skeleton className="h-16" /> : <div className="flex flex-col gap-1">{repos.map((rp) => (
        <div key={rp.repository} className="flex items-center gap-3 rounded-md border border-[color:var(--border)] px-3 py-2 text-sm"><FolderGit2 size={14} className="text-[color:var(--muted-fg)]" /><span className="font-medium">{rp.repository}</span><span className="text-xs text-[color:var(--muted-fg)]">{rp.fontes} fontes · {rp.cobertura_semantica}%</span></div>
      ))}</div>}</div></div>
}

function RepoPanel({ m, onOpenDir, onNavigateSource }: { m: Extract<Meta, { type: 'repo' }>; onOpenDir: (id: string) => void; onNavigateSource: (id: number) => void }) {
  const k = useKnowledge({ customer_id: m.customer_id, repository: m.repository })
  const [dirs, setDirs] = useState<DirRow[] | null>(null)
  useEffect(() => { let a = true; api.get<{ data: { dirs: DirRow[] } }>(`/source-docs/tree/nodes?customer_id=${m.customer_id}&repository=${encodeURIComponent(m.repository)}&path=`).then((r) => a && setDirs(r.data.dirs)); return () => { a = false } }, [m.customer_id, m.repository])
  return <div className="flex h-full flex-col gap-4 overflow-auto p-5"><Breadcrumb items={[{ label: m.customerName }, { label: m.repository }]} /><h2 className="flex items-center gap-2 text-lg font-semibold"><FolderGit2 size={18} /> {m.repository}</h2>
    <ScopeSearch customer_id={m.customer_id} repository={m.repository} />
    {m.row && <div className="text-xs text-[color:var(--muted-fg)]"><span className="inline-flex items-center gap-1"><GitBranch size={12} /> {m.row.branch}</span> · Última atualização do acervo: {dt(m.row.ultima_atualizacao_acervo)} <span className="opacity-70">(não é sync do GitHub)</span></div>}
    <KnowledgeBlock k={k} onNavigateSource={onNavigateSource} />
    <div><div className="mb-1 text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">Estrutura principal</div>
      {dirs === null ? <Skeleton className="h-16" /> : <div className="flex flex-wrap gap-2">{dirs.map((d) => { const cob = d.fontes ? Math.round(d.documentadas / d.fontes * 100) : 0; return (
        <button key={d.path} onClick={() => onOpenDir(`d:${m.customer_id}:${m.repository}:${d.path}`)} className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--border)] px-2.5 py-1.5 text-sm hover:bg-[color:var(--muted-bg,#f1f5f9)]"><Folder size={14} className="text-[color:var(--muted-fg)]" /> {d.name} <span className="text-xs text-[color:var(--muted-fg)]">{d.fontes} · {cob}%</span></button>
      ) })}</div>}</div></div>
}

function FolderPanel({ selected, onOpenDir, onOpenFile, onNavigateSource }: { selected: Extract<Meta, { type: 'dir' }>; onOpenDir: (id: string) => void; onOpenFile: (id: number, fn: string) => void; onNavigateSource: (id: number) => void }) {
  const [data, setData] = useState<{ dirs: DirRow[]; files: FileRow[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string | null>(null)
  const k = useKnowledge({ customer_id: selected.customer_id, repository: selected.repository, path: selected.path })
  useEffect(() => { let alive = true; setLoading(true); setFilter(null)
    api.get<{ data: { dirs: DirRow[]; files: FileRow[] } }>(`/source-docs/tree/nodes?customer_id=${selected.customer_id}&repository=${encodeURIComponent(selected.repository)}&path=${encodeURIComponent(selected.path)}`).then((r) => alive && setData(r.data)).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [selected])
  const crumbs: Crumb[] = [{ label: selected.customerName }, { label: selected.repository }, ...selected.path.split('/').map((s) => ({ label: s }))]
  const files = (data?.files ?? []).filter((f) => !filter || f.semantic === filter)
  return <div className="flex h-full flex-col gap-4 overflow-auto p-5"><Breadcrumb items={crumbs} maxItems={6} />
    <ScopeSearch customer_id={selected.customer_id} repository={selected.repository} path={selected.path} />
    <KnowledgeBlock k={k} onNavigateSource={onNavigateSource} onHealth={(key) => setFilter(key === 'completed' || key === 'partial' || key === 'none' ? key : (key === 'gaps' ? 'partial' : null))} />
    {loading || !data ? <Skeleton className="h-40" /> : <>
      {data.dirs.length > 0 && <div><div className="mb-1 text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">Subdiretórios</div><div className="flex flex-wrap gap-2">{data.dirs.map((d) => { const cob = d.fontes ? Math.round(d.documentadas / d.fontes * 100) : 0; return <button key={d.path} onClick={() => onOpenDir(`d:${selected.customer_id}:${selected.repository}:${d.path}`)} className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--border)] px-2.5 py-1.5 text-sm hover:bg-[color:var(--muted-bg,#f1f5f9)]"><Folder size={14} className="text-[color:var(--muted-fg)]" /> {d.name} <span className="text-xs text-[color:var(--muted-fg)]">{d.fontes} · {cob}%</span></button> })}</div></div>}
      {(data.files.length > 0) && (
        <div><div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">Fontes {filter && <button onClick={() => setFilter(null)} className="text-[color:var(--accent,#2563eb)] normal-case">(limpar filtro: {filter})</button>}</div>
        <Table><Thead><Tr><Th>Fonte</Th><Th>Conhecimento</Th><Th>Funções</Th><Th>Análise</Th><Th>Última análise</Th><Th>Custo IA</Th></Tr></Thead>
          <Tbody>{files.map((f) => <Tr key={f.id} onClick={() => onOpenFile(f.id, f.filename)}><Td>{f.filename}</Td><Td>{semBadge(f.semantic)}</Td><Td>{f.functions_count ?? '—'}</Td><Td>{f.analysis_status}</Td><Td>{dt(f.last_change_at)}</Td><Td>{money(f.cost_usd)}</Td></Tr>)}</Tbody></Table></div>
      )}
      {data.files.length === 0 && data.dirs.length === 0 && <EmptyState icon={Folder} title="Pasta vazia" description="Sem fontes neste nível." />}
    </>}
  </div>
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex flex-col"><span className="text-xs text-[color:var(--muted-fg)]">{label}</span><span className="text-base font-semibold tabular-nums">{value}</span></div>
}

function ScopeSearch({ customer_id, repository, path }: { customer_id: number; repository?: string; path?: string }) {
  const qs = new URLSearchParams({ scope: '1', customer_id: String(customer_id) })
  if (repository) qs.set('repository', repository)
  if (path) qs.set('path', path)
  return <a href={`/central-fontes/busca?${qs.toString()}`} className="inline-flex w-fit items-center gap-1 text-xs text-[color:var(--accent,#2563eb)] hover:underline">🔍 Buscar neste escopo</a>
}
