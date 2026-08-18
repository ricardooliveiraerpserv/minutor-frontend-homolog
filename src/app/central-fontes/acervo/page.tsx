'use client'

// Central de Fontes — F2 · Acervo real: árvore lazy Empresa → Repositório → Diretório Git → Fonte
// sobre os dados da homolog. Diretórios derivados do path (backend). Arquivo abre a ficha atual
// (o split-view da ficha é F3). Usa os primitives da F1 (Tree, SplitPanel, Breadcrumb).

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, FileCode2, Folder, FolderGit2, GitBranch } from 'lucide-react'
import {
  Badge, Breadcrumb, Card, EmptyState, PageHeader, SplitPanel, Skeleton, Tree,
  Table, Thead, Tbody, Tr, Th, Td,
} from '@/components/ds'
import type { Crumb, TreeNode } from '@/components/ds'
import { api, ApiError } from '@/lib/api'

// ── tipos das respostas do backend (F2) ──────────────────────────────────────
interface CustomerRow { customer_id: number; name: string; repos: number; fontes: number; documentadas: number; completas: number; parciais: number; pendentes: number; aguardando_aprovacao: number }
interface RepoRow { repository: string; source_repo_id: number | null; branch: string; owner: string; fontes: number; documentadas: number; parciais: number; cobertura_semantica: number; ultima_atualizacao_acervo: string | null }
interface DirRow { name: string; path: string; fontes: number; documentadas: number; parciais: number }
interface FileRow { id: number; filename: string; name: string; path: string; tipo: string | null; lang: string | null; size_bytes: number | null; analysis_status: string; semantic: string; functions_count: number | null; last_change_at: string | null; cost_usd: number | null }

type Meta =
  | { type: 'customer'; customer_id: number; name: string; row: CustomerRow }
  | { type: 'repo'; customer_id: number; customerName: string; repository: string; row: RepoRow }
  | { type: 'dir'; customer_id: number; customerName: string; repository: string; path: string }
  | { type: 'file'; doc_id: number; filename: string }

const money = (n: number | null) => (n == null ? '—' : `US$ ${n.toFixed(2)}`)
const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')
const semBadge = (s: string) => s === 'completed' ? <Badge variant="success">Completa</Badge> : s === 'partial' ? <Badge variant="warning">Parcial</Badge> : <Badge variant="default">Sem semântica</Badge>

export default function AcervoPage() {
  const router = useRouter()
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Meta | null>(null)
  const [rootLoading, setRootLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const meta = useRef<Record<string, Meta>>({})

  const patch = useCallback((id: string, fn: (n: TreeNode) => TreeNode) => {
    const walk = (list: TreeNode[]): TreeNode[] => list.map((n) => n.id === id ? fn(n) : (n.children ? { ...n, children: walk(n.children) } : n))
    setNodes((prev) => walk(prev))
  }, [])

  // L1: empresas
  useEffect(() => {
    let alive = true
    api.get<{ data: CustomerRow[] }>('/source-docs/tree/customers')
      .then((r) => {
        if (!alive) return
        const ns = r.data.map<TreeNode>((c) => {
          meta.current[`c:${c.customer_id}`] = { type: 'customer', customer_id: c.customer_id, name: c.name, row: c }
          return { id: `c:${c.customer_id}`, label: c.name, icon: Building2, badge: c.fontes, hasChildren: c.fontes > 0 }
        })
        setNodes(ns)
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Falha ao carregar empresas.'))
      .finally(() => alive && setRootLoading(false))
    return () => { alive = false }
  }, [])

  const loadChildren = useCallback(async (node: TreeNode) => {
    const m = meta.current[node.id]
    if (!m) return
    patch(node.id, (n) => ({ ...n, loading: true }))
    try {
      let children: TreeNode[] = []
      if (m.type === 'customer') {
        const r = await api.get<{ data: RepoRow[] }>(`/source-docs/tree/customers/${m.customer_id}/repos`)
        children = r.data.map((repo) => {
          const id = `r:${m.customer_id}:${repo.repository}`
          meta.current[id] = { type: 'repo', customer_id: m.customer_id, customerName: m.name, repository: repo.repository, row: repo }
          return { id, label: repo.repository, icon: FolderGit2, badge: repo.fontes, hasChildren: repo.fontes > 0 }
        })
      } else if (m.type === 'repo' || m.type === 'dir') {
        const cid = m.customer_id, repo = m.repository, path = m.type === 'dir' ? m.path : ''
        const cname = m.type === 'repo' ? m.customerName : m.customerName
        const r = await api.get<{ data: { dirs: DirRow[]; files: FileRow[] } }>(`/source-docs/tree/nodes?customer_id=${cid}&repository=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`)
        const dirNodes = r.data.dirs.map<TreeNode>((d) => {
          const id = `d:${cid}:${repo}:${d.path}`
          meta.current[id] = { type: 'dir', customer_id: cid, customerName: cname, repository: repo, path: d.path }
          return { id, label: d.name, icon: Folder, badge: d.fontes, hasChildren: true }
        })
        const fileNodes = r.data.files.map<TreeNode>((f) => {
          const id = `f:${f.id}`
          meta.current[id] = { type: 'file', doc_id: f.id, filename: f.filename }
          return { id, label: f.filename, icon: FileCode2, badge: f.semantic === 'completed' ? '●' : f.semantic === 'partial' ? '◐' : '○' }
        })
        children = [...dirNodes, ...fileNodes]
      }
      patch(node.id, (n) => ({ ...n, loading: false, hasChildren: false, children }))
    } catch (e) {
      // erro por nó não derruba a árvore
      patch(node.id, (n) => ({ ...n, loading: false, badge: '⚠' }))
    }
  }, [patch])

  const onToggle = useCallback((node: TreeNode, willExpand: boolean) => {
    setExpanded((prev) => { const s = new Set(prev); willExpand ? s.add(node.id) : s.delete(node.id); return s })
    if (willExpand && node.hasChildren && !node.children?.length) void loadChildren(node)
  }, [loadChildren])

  const onSelect = useCallback((node: TreeNode) => {
    const m = meta.current[node.id]
    if (!m) return
    if (m.type === 'file') { router.push(`/central-fontes/${m.doc_id}`); return } // ficha atual (split-view = F3)
    setSelected(m)
    // dir/repo selecionado: garante children carregados p/ o painel
    if ((m.type === 'dir' || m.type === 'repo') && !node.children?.length && (node.hasChildren)) {
      setExpanded((prev) => new Set(prev).add(node.id))
      void loadChildren(node)
    }
  }, [router, loadChildren])

  return (
    <>
      <PageHeader icon={FolderGit2} title="Acervo" subtitle="Empresa → Repositório → Diretório Git → Fonte. Diretórios derivados do path real; carregamento sob demanda." />
      {err ? (
        <EmptyState icon={FolderGit2} title="Erro" description={err} />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="h-[calc(100vh-320px)] min-h-[420px]">
            <SplitPanel
              storageKey="acervo-split"
              className="h-full"
              left={
                <div className="h-full border-r border-[color:var(--border)] p-2">
                  <div className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">Navegador</div>
                  {rootLoading ? <Skeleton className="h-40" /> : (
                    <Tree nodes={nodes} expandedIds={expanded} onToggle={onToggle} selectedId={selected && selected.type !== 'file' ? nodeIdOf(selected) : undefined} onSelect={onSelect} />
                  )}
                </div>
              }
              right={<RightPanel selected={selected} onOpenDir={(id) => { const n = findNode(nodes, id); if (n) onSelect(n) }} onOpenFile={(docId) => router.push(`/central-fontes/${docId}`)} />}
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
function findNode(list: TreeNode[], id: string): TreeNode | undefined {
  for (const n of list) { if (n.id === id) return n; if (n.children) { const f = findNode(n.children, id); if (f) return f } }
  return undefined
}

// ── painel direito por tipo de nó ─────────────────────────────────────────────
function RightPanel({ selected, onOpenDir, onOpenFile }: {
  selected: Meta | null
  onOpenDir: (id: string) => void; onOpenFile: (docId: number) => void
}) {
  if (!selected) {
    return <div className="p-6"><EmptyState icon={FolderGit2} title="Selecione no navegador" description="Escolha uma empresa, repositório ou pasta para ver os detalhes." /></div>
  }
  if (selected.type === 'customer') {
    const r = selected.row
    return (
      <div className="flex flex-col gap-4 p-5">
        <Breadcrumb items={[{ label: r.name }]} />
        <h2 className="text-lg font-semibold">{r.name}</h2>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <Metric label="Repositórios" value={r.repos} /><Metric label="Fontes" value={r.fontes} />
          <Metric label="Documentadas" value={r.documentadas} /><Metric label="Completas" value={r.completas} />
          <Metric label="Parciais" value={r.parciais} /><Metric label="Pendentes" value={r.pendentes} />
          <Metric label="Aguardando aprovação IA" value={r.aguardando_aprovacao} />
        </div>
        <p className="text-xs text-[color:var(--muted-fg)]">Expanda a empresa no navegador para abrir os repositórios.</p>
      </div>
    )
  }
  if (selected.type === 'repo') {
    const r = selected.row
    return (
      <div className="flex flex-col gap-4 p-5">
        <Breadcrumb items={[{ label: selected.customerName }, { label: r.repository }]} />
        <h2 className="flex items-center gap-2 text-lg font-semibold"><FolderGit2 size={18} /> {r.repository}</h2>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <span className="inline-flex items-center gap-1.5 text-sm"><GitBranch size={14} /> {r.branch}</span>
          <Metric label="Fontes" value={r.fontes} /><Metric label="Documentadas" value={r.documentadas} />
          <Metric label="Parciais" value={r.parciais} /><Metric label="Cobertura semântica" value={`${r.cobertura_semantica}%`} />
        </div>
        <div className="text-xs text-[color:var(--muted-fg)]">Última atualização do acervo: {dt(r.ultima_atualizacao_acervo)} <span className="opacity-70">(não é o último sync do GitHub)</span></div>
        <p className="text-xs text-[color:var(--muted-fg)]">Expanda o repositório no navegador para ver as pastas raiz.</p>
      </div>
    )
  }
  // dir → conteúdo da pasta (subpastas + fontes diretamente no nível). (file nunca chega aqui.)
  if (selected.type !== 'dir') return null
  return <FolderPanel key={nodeIdOf(selected)} selected={selected} onOpenDir={onOpenDir} onOpenFile={onOpenFile} />
}

function FolderPanel({ selected, onOpenDir, onOpenFile }: { selected: Extract<Meta, { type: 'dir' }>; onOpenDir: (id: string) => void; onOpenFile: (docId: number) => void }) {
  const [data, setData] = useState<{ dirs: DirRow[]; files: FileRow[] } | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true; setLoading(true)
    api.get<{ data: { dirs: DirRow[]; files: FileRow[] } }>(`/source-docs/tree/nodes?customer_id=${selected.customer_id}&repository=${encodeURIComponent(selected.repository)}&path=${encodeURIComponent(selected.path)}`)
      .then((r) => alive && setData(r.data)).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [selected])

  const crumbs: Crumb[] = [{ label: selected.customerName }, { label: selected.repository }, ...selected.path.split('/').map((seg) => ({ label: seg }))]

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <Breadcrumb items={crumbs} maxItems={6} />
      {loading || !data ? <Skeleton className="h-40" /> : (
        <>
          {data.dirs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.dirs.map((d) => (
                <button key={d.path} onClick={() => onOpenDir(`d:${selected.customer_id}:${selected.repository}:${d.path}`)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--border)] px-2.5 py-1.5 text-sm hover:bg-[color:var(--muted-bg,#f1f5f9)]">
                  <Folder size={14} className="text-[color:var(--muted-fg)]" /> {d.name}
                  <span className="text-xs text-[color:var(--muted-fg)]">{d.fontes}</span>
                </button>
              ))}
            </div>
          )}
          {data.files.length === 0 && data.dirs.length === 0 ? (
            <EmptyState icon={Folder} title="Pasta vazia" description="Sem fontes neste nível." />
          ) : data.files.length > 0 && (
            <Table>
              <Thead><Tr><Th>Fonte</Th><Th>Semântica</Th><Th>Análise</Th><Th>Funções</Th><Th>Última análise</Th><Th>Custo IA</Th></Tr></Thead>
              <Tbody>
                {data.files.map((f) => (
                  <Tr key={f.id} onClick={() => onOpenFile(f.id)}>
                    <Td>{f.filename}</Td>
                    <Td>{semBadge(f.semantic)}</Td>
                    <Td>{f.analysis_status}</Td>
                    <Td>{f.functions_count ?? '—'}</Td>
                    <Td>{dt(f.last_change_at)}</Td>
                    <Td>{money(f.cost_usd)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-[color:var(--muted-fg)]">{label}</span>
      <span className="text-base font-semibold tabular-nums">{value}</span>
    </div>
  )
}
