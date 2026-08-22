'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { Modal, Badge, Tree } from '@/components/ds'
import type { TreeNode } from '@/components/ds/tree'
import { toast } from 'sonner'
import { FileCode, Folder, FolderPlus, CheckCircle2, AlertTriangle, GitCommit, Loader2, FolderGit2, Link2, X } from 'lucide-react'

/**
 * GMUD G3-G7 — pop-up de PUBLICAÇÃO governada, aberto AO GRAVAR a Solução com GMUD (via ticketId)
 * ou pelo botão Publicar (via packageId). O consultor define TUDO: classificação, e — navegando a
 * ÁRVORE do repositório — vincula CADA fonte novo à sua pasta específica (pode criar e excluir
 * pastas criadas nesta operação). Existentes mantêm o path, ambíguos ele resolve, idênticos são
 * ignorados. Publicar = 1 commit atômico.
 */

type MatchStatus = 'existing' | 'new' | 'ambiguous' | 'identical' | null

type PackageFile = {
  id: number
  filename: string
  is_source: boolean
  match_status: MatchStatus
  matched_git_path: string | null
  match_candidates: Array<{ path: string; blob_sha: string; source_doc_id: number | null }> | null
}
type Detail = { id: number; original_name: string; status: string; error: string | null; files: PackageFile[] }

const IN_PROGRESS = new Set(['received', 'extracting', 'analyzing'])
const ROOT_ID = ' root'

function allPrefixes(paths: string[]): string[] {
  const set = new Set<string>()
  for (const p of paths) { const segs = p.split('/').filter(Boolean); let acc = ''; for (const s of segs) { acc = acc ? `${acc}/${s}` : s; set.add(acc) } }
  return Array.from(set)
}

interface RawNode { id: string; label: string; children: Record<string, RawNode> }
function buildTree(paths: string[], created: Set<string>): TreeNode[] {
  const roots: Record<string, RawNode> = {}
  for (const p of paths) {
    const segs = p.split('/').filter(Boolean); let level = roots; let acc = ''
    for (const s of segs) { acc = acc ? `${acc}/${s}` : s; if (!level[s]) level[s] = { id: acc, label: s, children: {} }; level = level[s].children }
  }
  const toNodes = (obj: Record<string, RawNode>): TreeNode[] =>
    Object.values(obj).sort((a, b) => a.label.localeCompare(b.label)).map((n): TreeNode => {
      const kids = toNodes(n.children)
      const isNew = created.has(n.id)
      return { id: n.id, label: isNew ? `${n.label}  (nova)` : n.label, icon: Folder, children: kids.length ? kids : undefined }
    })
  return toNodes(roots)
}

export function GmudPublishModal({ packageId, ticketId, open, onClose, onPublished }: {
  packageId?: number | null
  ticketId?: number | null
  open: boolean
  onClose: () => void
  onPublished?: () => void
}) {
  const [pkgId, setPkgId] = useState<number | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [noPackage, setNoPackage] = useState(false)
  const [dirs, setDirs] = useState<string[]>([])
  const [basePath, setBasePath] = useState('')
  const [createdDirs, setCreatedDirs] = useState<string[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [newFolder, setNewFolder] = useState('')
  const [activeFolder, setActiveFolder] = useState<string>('')      // pasta selecionada na árvore
  const [perFileFolder, setPerFileFolder] = useState<Record<number, string>>({}) // fonte novo → pasta
  const [classification, setClassification] = useState<'projeto' | 'avulso'>('projeto')
  const [projectName, setProjectName] = useState('')
  const [resolutions, setResolutions] = useState<Record<number, string>>({})
  const [publishing, setPublishing] = useState(false)
  const [result, setResult] = useState<{ commit_sha: string; repo: string; branch: string; published: number; skipped: number } | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Resolve o pacote: por packageId direto, ou (ao gravar a GMUD) buscando o mais novo do chamado.
  useEffect(() => {
    if (!open) return
    setResult(null); setResolutions({}); setPerFileFolder({}); setActiveFolder(''); setCreatedDirs([]); setNewFolder(''); setClassification('projeto'); setProjectName(''); setDetail(null); setNoPackage(false)
    let cancelled = false
    if (packageId) { setPkgId(packageId); return }
    if (!ticketId) return
    setPkgId(null)
    let tries = 0
    // "ensure" = garante o pacote do ÚLTIMO zip anexado ao chamado (determinístico) → sempre o certo.
    const find = async () => {
      try {
        const res = await api.post<{ data: { id: number } | null }>(`/help-desk/tickets/${ticketId}/gmud/packages/ensure`, {})
        if (cancelled) return
        if (res.data?.id) { setPkgId(res.data.id); return }
        setNoPackage(true)
      } catch {
        if (++tries <= 5) pollRef.current = setTimeout(find, 1500); else setNoPackage(true)
      }
    }
    void find()
    return () => { cancelled = true; if (pollRef.current) clearTimeout(pollRef.current) }
  }, [open, packageId, ticketId])

  const loadDirs = useCallback(async (id: number) => {
    try {
      const res = await api.get<{ data: { dirs: string[]; base_path: string } }>(`/gmud/packages/${id}/dirs`)
      setDirs(res.data.dirs || []); setBasePath(res.data.base_path || '')
    } catch { /* opcional */ }
  }, [])

  // Carrega o detalhe do pacote resolvido (poll enquanto analisa).
  useEffect(() => {
    if (!open || !pkgId) return
    let cancelled = false
    const tick = async () => {
      try {
        const res = await api.get<{ data: Detail }>(`/gmud/packages/${pkgId}`)
        if (cancelled) return
        setDetail(res.data)
        if (IN_PROGRESS.has(res.data.status)) { pollRef.current = setTimeout(tick, 2000); return }
        if (res.data.status === 'analyzed') void loadDirs(pkgId)
      } catch (e) { if (e instanceof ApiError) toast.error(e.message) }
    }
    void tick()
    return () => { cancelled = true; if (pollRef.current) clearTimeout(pollRef.current) }
  }, [open, pkgId, loadDirs])

  const sources = (detail?.files ?? []).filter(f => f.is_source)
  const news = sources.filter(f => f.match_status === 'new' || f.match_status == null)
  const ambiguous = sources.filter(f => f.match_status === 'ambiguous')
  const analyzing = detail && IN_PROGRESS.has(detail.status)
  const alreadyPublished = detail?.status === 'published'

  const createdSet = useMemo(() => new Set(createdDirs), [createdDirs])
  const treeNodes = useMemo(() => buildTree(allPrefixes([...dirs, ...createdDirs]), createdSet), [dirs, createdDirs, createdSet])

  const expandAncestors = (path: string) => setExpanded(prev => {
    const next = new Set(prev); const segs = path.split('/').filter(Boolean); let acc = ''
    for (const s of segs) { acc = acc ? `${acc}/${s}` : s; next.add(acc) } ; return next
  })

  const selectFolder = (path: string) => { setActiveFolder(path); if (path !== ROOT_ID) expandAncestors(path) }

  const folderLabel = (p: string) => p === ROOT_ID ? '/ (raiz)' : (p || '/ (raiz)')

  const assignActive = (fileId: number) => {
    if (activeFolder === '') { toast.error('Selecione uma pasta na árvore (ou a raiz) primeiro.'); return }
    setPerFileFolder(m => ({ ...m, [fileId]: activeFolder === ROOT_ID ? '' : activeFolder }))
  }
  const assignAll = () => {
    if (activeFolder === '') { toast.error('Selecione uma pasta na árvore (ou a raiz) primeiro.'); return }
    setPerFileFolder(() => { const m: Record<number, string> = {}; news.forEach(f => { m[f.id] = activeFolder === ROOT_ID ? '' : activeFolder }); return m })
  }

  const createFolder = () => {
    const name = newFolder.trim().replace(/[\\/]+/g, '').replace(/\.\./g, '')
    if (!name) return
    const parent = activeFolder && activeFolder !== ROOT_ID ? activeFolder : ''
    const path = parent ? `${parent}/${name}` : name
    setCreatedDirs(prev => Array.from(new Set([...prev, path])))
    setNewFolder(''); selectFolder(path)
  }

  const removeCreated = (path: string) => {
    setCreatedDirs(prev => prev.filter(d => d !== path && !d.startsWith(path + '/')))
    // desvincula fontes que apontavam p/ a pasta removida (ou subpasta dela)
    setPerFileFolder(m => {
      const next: Record<number, string> = {}
      for (const [k, v] of Object.entries(m)) { if (v === path || v.startsWith(path + '/')) continue; next[Number(k)] = v }
      return next
    })
    if (activeFolder === path || activeFolder.startsWith(path + '/')) setActiveFolder('')
  }

  // PROJETO = uma pasta única (a selecionada na árvore) para TODOS os novos.
  // AVULSO  = vínculo individual por fonte.
  const projectMode = classification === 'projeto'
  const globalFolder = activeFolder === ROOT_ID ? '' : activeFolder

  const destOf = (f: PackageFile): { path: string | null; action: 'add' | 'modify' | 'skip' | 'pending' } => {
    if (f.match_status === 'identical') return { path: null, action: 'skip' }
    if (f.match_status === 'existing') return { path: f.matched_git_path, action: 'modify' }
    if (f.match_status === 'ambiguous') { const r = resolutions[f.id]; return r ? { path: r, action: 'modify' } : { path: null, action: 'pending' } }
    // NOVO
    if (projectMode) {
      if (activeFolder === '') return { path: null, action: 'pending' }
      return { path: globalFolder ? `${globalFolder}/${f.filename}` : f.filename, action: 'add' }
    }
    if (!(f.id in perFileFolder)) return { path: null, action: 'pending' }
    const folder = perFileFolder[f.id]
    return { path: folder ? `${folder}/${f.filename}` : f.filename, action: 'add' }
  }

  const unassignedNews = projectMode
    ? (activeFolder === '' ? news : [])
    : news.filter(f => !(f.id in perFileFolder))
  const unresolved = ambiguous.some(f => !resolutions[f.id])
  const canPublish = !analyzing && !alreadyPublished && sources.some(f => f.match_status !== 'identical') && unassignedNews.length === 0 && !unresolved

  const doPublish = async () => {
    if (!pkgId) return
    setPublishing(true)
    try {
      const body: Record<string, unknown> = { classification, project_name: projectMode ? projectName : null }
      if (projectMode) {
        // pasta única do projeto p/ todos os novos (dest_folder global; folders vazio)
        body.dest_folder = globalFolder
        body.folders = {}
      } else {
        const folders: Record<number, string> = {}
        news.forEach(f => { if (f.id in perFileFolder) folders[f.id] = perFileFolder[f.id] })
        body.dest_folder = ''
        body.folders = folders
      }
      if (Object.keys(resolutions).length) body.resolutions = resolutions
      const res = await api.post<{ data: typeof result }>(`/gmud/packages/${pkgId}/publish`, body)
      setResult(res.data)
      toast.success(`Publicado no Git — commit ${res.data?.commit_sha?.slice(0, 7)}`)
      onPublished?.()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Falha ao publicar')
    } finally { setPublishing(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Publicação de Fontes no Git (GMUD)" width="max-w-4xl">
      {noPackage ? (
        <div className="text-sm py-6" style={{ color: 'var(--text-muted)' }}>Nenhum pacote de fontes foi anexado nesta GMUD.</div>
      ) : !detail ? (
        <Loading text="Preparando o pacote…" />
      ) : result ? (
        <Published result={result} onClose={onClose} />
      ) : analyzing ? (
        <Loading text={`Analisando "${detail.original_name}"… extraindo e casando fontes com o Git.`} />
      ) : alreadyPublished ? (
        <div className="flex items-center gap-2 text-sm py-6" style={{ color: 'var(--success)' }}><CheckCircle2 size={18} /> Este pacote já foi publicado no Git.</div>
      ) : sources.length === 0 ? (
        <div className="text-sm py-6" style={{ color: 'var(--text-muted)' }}>Nenhum fonte reconhecido no pacote — nada a publicar.</div>
      ) : (
        <div className="space-y-4">
          {/* Cabeçalho do pacote */}
          <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--surface-sunken)' }}>
            <FileCode size={14} style={{ color: 'var(--primary)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{detail.original_name}</span>
            <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{sources.length} fonte(s)</span>
          </div>

          {/* Classificação */}
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Classificação:</span>
            {(['projeto', 'avulso'] as const).map(c => (
              <label key={c} className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
                <input type="radio" name="gmud-class" checked={classification === c} onChange={() => setClassification(c)} style={{ accentColor: 'var(--primary)' }} />
                {c === 'projeto' ? 'Projeto' : 'Avulso'}
              </label>
            ))}
            {classification === 'projeto' && (
              <input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Nome do projeto (opcional)"
                className="text-sm rounded-lg px-2.5 py-1.5 outline-none flex-1 min-w-[180px]" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ESQUERDA: árvore de diretórios + criar/excluir pasta */}
            {news.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text)' }}>
                  <FolderGit2 size={14} /> {projectMode ? 'Pasta do projeto (todos os fontes novos aqui)' : 'Diretórios do repositório'} {basePath && <span style={{ color: 'var(--text-light)' }}>(base: {basePath}/)</span>}
                </div>
                <div className="rounded-lg border max-h-56 overflow-auto p-1.5" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                  <button onClick={() => selectFolder(ROOT_ID)} className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm text-left"
                    style={{ background: activeFolder === ROOT_ID ? 'var(--primary-soft)' : 'transparent', color: activeFolder === ROOT_ID ? 'var(--primary)' : 'var(--text-muted)' }}>
                    <Folder size={14} /> / (raiz do repositório)
                  </button>
                  {treeNodes.length > 0 ? (
                    <Tree nodes={treeNodes} selectedId={activeFolder} onSelect={(n) => selectFolder(n.id)} expandedIds={expanded}
                      onToggle={(n, willExpand) => setExpanded(prev => { const next = new Set(prev); willExpand ? next.add(n.id) : next.delete(n.id); return next })}
                      ariaLabel="Diretórios do repositório" />
                  ) : (
                    <div className="px-2 py-1 text-[11px]" style={{ color: 'var(--text-light)' }}>Sem subpastas — use a raiz ou crie uma pasta.</div>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <input value={newFolder} onChange={e => setNewFolder(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createFolder() }}
                    placeholder={activeFolder && activeFolder !== ROOT_ID ? `nova pasta em ${activeFolder}/` : 'nova pasta na raiz'}
                    className="text-xs rounded-lg px-2.5 py-1.5 outline-none flex-1" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  <button onClick={createFolder} disabled={!newFolder.trim()} className="ds-btn-secondary inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg disabled:opacity-50">
                    <FolderPlus size={13} /> Criar
                  </button>
                </div>
                {createdDirs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {createdDirs.map(d => (
                      <span key={d} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                        {d}
                        <button onClick={() => removeCreated(d)} title="Excluir pasta criada" className="hover:opacity-70"><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>
                  {projectMode ? 'Todos os novos irão para: ' : 'Selecionada: '}
                  <b style={{ color: 'var(--text)' }}>{activeFolder === '' ? '— nenhuma —' : folderLabel(activeFolder)}</b>
                  {!projectMode && news.length > 1 && activeFolder !== '' && <button onClick={assignAll} className="ml-2" style={{ color: 'var(--primary)' }}>vincular a todos os novos</button>}
                </div>
              </div>
            )}

            {/* DIREITA: fontes → vincular cada um à pasta */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Fontes do pacote</div>
              <div className="rounded-lg border divide-y" style={{ borderColor: 'var(--border)' }}>
                {sources.map(f => {
                  const d = destOf(f)
                  const isNew = f.match_status === 'new' || f.match_status == null
                  return (
                    <div key={f.id} className="p-2 space-y-1" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>
                          <FileCode size={12} style={{ color: 'var(--primary)' }} /> {f.filename}
                        </span>
                        <SituBadge s={f.match_status} />
                      </div>
                      {f.match_status === 'ambiguous' ? (
                        <select value={resolutions[f.id] ?? ''} onChange={e => setResolutions(r => ({ ...r, [f.id]: e.target.value }))}
                          className="w-full text-xs rounded-lg px-2 py-1 outline-none" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                          <option value="">— escolha a ocorrência —</option>
                          {(f.match_candidates ?? []).map(c => <option key={c.path} value={c.path}>{c.path}</option>)}
                        </select>
                      ) : isNew ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] flex-1 min-w-0 truncate" style={{ color: d.action === 'pending' ? 'var(--warning)' : 'var(--text-muted)' }}>
                            {d.action === 'pending' ? (projectMode ? '— defina a pasta do projeto —' : '— defina a pasta —') : d.path}
                          </span>
                          {/* PROJETO: pasta única (sem vínculo individual). AVULSO: vincula cada fonte. */}
                          {!projectMode && (
                            <button onClick={() => assignActive(f.id)} className="ds-btn-secondary inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg shrink-0" title="Vincular à pasta selecionada na árvore">
                              <Link2 size={11} /> vincular pasta
                            </button>
                          )}
                        </div>
                      ) : d.action === 'skip' ? (
                        <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>ignorado (idêntico ao Git)</span>
                      ) : (
                        <span className="font-mono text-[11px] break-all" style={{ color: 'var(--text-muted)' }}>{d.path} <span style={{ color: 'var(--warning)' }}>· sobrescreve</span></span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>
              {unassignedNews.length > 0 ? <span style={{ color: 'var(--warning)' }}><AlertTriangle size={11} className="inline" /> {unassignedNews.length} fonte(s) novo(s) sem pasta</span> : 'Publicar grava tudo num único commit atômico.'}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="ds-btn-secondary px-3 py-1.5 rounded-lg text-sm">Cancelar</button>
              <button onClick={doPublish} disabled={!canPublish || publishing} className="ds-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm disabled:opacity-50">
                {publishing ? <Loader2 size={14} className="animate-spin" /> : <GitCommit size={14} />} Publicar no Git
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Loading({ text }: { text: string }) {
  return <div className="flex items-center gap-2 text-sm py-6" style={{ color: 'var(--text-muted)' }}><Loader2 size={16} className="animate-spin" /> {text}</div>
}

function Published({ result, onClose }: { result: { commit_sha: string; repo: string; branch: string; published: number; skipped: number }; onClose: () => void }) {
  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--success)' }}><CheckCircle2 size={18} /> Publicado com sucesso</div>
      <div className="rounded-lg p-3 text-sm space-y-1" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}>
        <div className="flex items-center gap-1.5"><GitCommit size={14} /> commit <span className="font-mono">{result.commit_sha.slice(0, 10)}</span></div>
        <div>Repositório: <b>{result.repo}</b> @ {result.branch}</div>
        <div>{result.published} fonte(s) gravado(s){result.skipped ? ` · ${result.skipped} idêntico(s) ignorado(s)` : ''}</div>
      </div>
      <div className="flex justify-end"><button onClick={onClose} className="ds-btn-primary px-3 py-1.5 rounded-lg text-sm">Fechar</button></div>
    </div>
  )
}

function SituBadge({ s }: { s: MatchStatus }) {
  const m: Record<string, { label: string; variant: string }> = {
    existing:  { label: 'Existente', variant: 'warning' },
    new:       { label: 'Novo',      variant: 'primary' },
    identical: { label: 'Idêntico',  variant: 'default' },
    ambiguous: { label: 'Ambíguo',   variant: 'danger' },
  }
  const v = m[s ?? ''] ?? { label: '—', variant: 'default' }
  return <Badge variant={v.variant}>{v.label}</Badge>
}
