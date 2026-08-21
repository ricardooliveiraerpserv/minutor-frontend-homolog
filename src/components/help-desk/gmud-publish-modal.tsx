'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { Modal, Badge } from '@/components/ds'
import { toast } from 'sonner'
import { FileCode, FolderGit2, CheckCircle2, AlertTriangle, GitCommit, Loader2 } from 'lucide-react'
// nota: componente de modal de publicação (G7)

/**
 * GMUD G4/G6/G7 — modal de PUBLICAÇÃO governada. Abre ao gravar a Solução com GMUD: espera a
 * análise, deixa escolher UMA pasta de destino p/ os fontes NOVOS (existentes mantêm o path,
 * ambíguos você resolve, idênticos são ignorados), mostra o preview e PUBLICA num commit atômico.
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

type Detail = {
  id: number
  original_name: string
  status: string
  error: string | null
  files: PackageFile[]
}

const IN_PROGRESS = new Set(['received', 'extracting', 'analyzing'])

export function GmudPublishModal({ packageId, open, onClose, onPublished }: {
  packageId: number | null
  open: boolean
  onClose: () => void
  onPublished?: () => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [dirs, setDirs] = useState<string[]>([])
  const [basePath, setBasePath] = useState('')
  const [destFolder, setDestFolder] = useState('')
  const [resolutions, setResolutions] = useState<Record<number, string>>({})
  const [publishing, setPublishing] = useState(false)
  const [result, setResult] = useState<{ commit_sha: string; repo: string; branch: string; published: number; skipped: number } | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    if (!packageId) return
    try {
      const res = await api.get<{ data: Detail }>(`/gmud/packages/${packageId}`)
      setDetail(res.data)
      return res.data.status
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message)
      return null
    }
  }, [packageId])

  const loadDirs = useCallback(async () => {
    if (!packageId) return
    try {
      const res = await api.get<{ data: { dirs: string[]; base_path: string } }>(`/gmud/packages/${packageId}/dirs`)
      setDirs(res.data.dirs || [])
      setBasePath(res.data.base_path || '')
    } catch { /* diretórios são opcionais p/ o preview */ }
  }, [packageId])

  // Ao abrir: carrega detalhe (poll enquanto analisa) + diretórios.
  useEffect(() => {
    if (!open || !packageId) return
    setResult(null); setResolutions({}); setDestFolder('')
    let cancelled = false
    const tick = async () => {
      const st = await load()
      if (cancelled) return
      if (st && IN_PROGRESS.has(st)) { pollRef.current = setTimeout(tick, 2000); return }
      if (st === 'analyzed') void loadDirs()
    }
    void tick()
    return () => { cancelled = true; if (pollRef.current) clearTimeout(pollRef.current) }
  }, [open, packageId, load, loadDirs])

  const sources = (detail?.files ?? []).filter(f => f.is_source)
  const news = sources.filter(f => f.match_status === 'new' || f.match_status == null)
  const ambiguous = sources.filter(f => f.match_status === 'ambiguous')
  const analyzing = detail && IN_PROGRESS.has(detail.status)
  const alreadyPublished = detail?.status === 'published'

  // destino final de cada arquivo (preview)
  const destOf = (f: PackageFile): { path: string | null; action: 'add' | 'modify' | 'skip' | 'pending' } => {
    if (f.match_status === 'identical') return { path: null, action: 'skip' }
    if (f.match_status === 'existing') return { path: f.matched_git_path, action: 'modify' }
    if (f.match_status === 'ambiguous') {
      const r = resolutions[f.id]
      return r ? { path: r, action: 'modify' } : { path: null, action: 'pending' }
    }
    // new / null
    const folder = destFolder.trim().replace(/^\/+|\/+$/g, '')
    return { path: folder ? `${folder}/${f.filename}` : f.filename, action: 'add' }
  }

  const needsFolder = news.length > 0 && destFolder.trim() === ''
  const unresolved = ambiguous.some(f => !resolutions[f.id])
  const canPublish = !analyzing && !alreadyPublished && sources.some(f => f.match_status !== 'identical') && !needsFolder && !unresolved

  const doPublish = async () => {
    if (!packageId) return
    setPublishing(true)
    try {
      const body: Record<string, unknown> = { dest_folder: destFolder.trim().replace(/^\/+|\/+$/g, '') }
      if (Object.keys(resolutions).length) body.resolutions = resolutions
      const res = await api.post<{ data: typeof result }>(`/gmud/packages/${packageId}/publish`, body)
      setResult(res.data)
      toast.success(`Publicado no Git — commit ${res.data?.commit_sha?.slice(0, 7)}`)
      onPublished?.()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Falha ao publicar')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Publicação de Fontes no Git (GMUD)" width="max-w-3xl">
      {!detail ? (
        <div className="flex items-center gap-2 text-sm py-6" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={16} className="animate-spin" /> Carregando pacote…
        </div>
      ) : result ? (
        <div className="space-y-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--success)' }}>
            <CheckCircle2 size={18} /> Publicado com sucesso
          </div>
          <div className="rounded-lg p-3 text-sm space-y-1" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}>
            <div className="flex items-center gap-1.5"><GitCommit size={14} /> commit <span className="font-mono">{result.commit_sha.slice(0, 10)}</span></div>
            <div>Repositório: <b>{result.repo}</b> @ {result.branch}</div>
            <div>{result.published} fonte(s) gravado(s){result.skipped ? ` · ${result.skipped} idêntico(s) ignorado(s)` : ''}</div>
          </div>
          <div className="flex justify-end"><button onClick={onClose} className="ds-btn-primary px-3 py-1.5 rounded-lg text-sm">Fechar</button></div>
        </div>
      ) : analyzing ? (
        <div className="flex items-center gap-2 text-sm py-6" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={16} className="animate-spin" /> Analisando o pacote <b>{detail.original_name}</b>… extraindo e casando fontes com o Git.
        </div>
      ) : alreadyPublished ? (
        <div className="flex items-center gap-2 text-sm py-6" style={{ color: 'var(--success)' }}>
          <CheckCircle2 size={18} /> Este pacote já foi publicado no Git.
        </div>
      ) : sources.length === 0 ? (
        <div className="text-sm py-6" style={{ color: 'var(--text-muted)' }}>Nenhum fonte reconhecido no pacote — nada a publicar.</div>
      ) : (
        <div className="space-y-4">
          {/* Seletor de pasta p/ os NOVOS */}
          {news.length > 0 && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text)' }}>
                <FolderGit2 size={14} /> Pasta de destino dos fontes NOVOS {basePath && <span style={{ color: 'var(--text-light)' }}>(base: {basePath}/)</span>}
              </label>
              <input
                value={destFolder}
                onChange={e => setDestFolder(e.target.value)}
                placeholder="ex.: src/protheus/fontes"
                className="w-full text-sm rounded-lg px-2.5 py-1.5 outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              {dirs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {dirs.slice(0, 40).map(d => (
                    <button key={d} onClick={() => setDestFolder(d)}
                      className="text-[11px] px-2 py-0.5 rounded-full"
                      style={{ background: destFolder === d ? 'var(--primary-soft)' : 'var(--surface-sunken)', color: destFolder === d ? 'var(--primary)' : 'var(--text-muted)' }}>
                      {d}
                    </button>
                  ))}
                </div>
              )}
              {needsFolder && <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--warning)' }}><AlertTriangle size={12} /> Escolha a pasta dos fontes novos.</div>}
            </div>
          )}

          {/* Tabela de arquivos + preview do destino */}
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>
                  <th className="text-left px-2.5 py-1.5 font-semibold">Arquivo</th>
                  <th className="text-left px-2.5 py-1.5 font-semibold">Situação</th>
                  <th className="text-left px-2.5 py-1.5 font-semibold">Destino no Git</th>
                </tr>
              </thead>
              <tbody>
                {sources.map(f => {
                  const d = destOf(f)
                  return (
                    <tr key={f.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-2.5 py-1.5">
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs" style={{ color: 'var(--text)' }}>
                          <FileCode size={12} style={{ color: 'var(--primary)' }} /> {f.filename}
                        </span>
                      </td>
                      <td className="px-2.5 py-1.5"><SituBadge s={f.match_status} /></td>
                      <td className="px-2.5 py-1.5">
                        {f.match_status === 'ambiguous' ? (
                          <select
                            value={resolutions[f.id] ?? ''}
                            onChange={e => setResolutions(r => ({ ...r, [f.id]: e.target.value }))}
                            className="text-xs rounded-lg px-2 py-1 outline-none max-w-full"
                            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                          >
                            <option value="">— escolha a ocorrência —</option>
                            {(f.match_candidates ?? []).map(c => <option key={c.path} value={c.path}>{c.path}</option>)}
                          </select>
                        ) : d.action === 'skip' ? (
                          <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>ignorado (idêntico)</span>
                        ) : (
                          <span className="font-mono text-[11px] break-all" style={{ color: 'var(--text-muted)' }}>
                            {d.path} <ActionTag action={d.action} />
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>Publicar grava tudo num único commit atômico no repositório do cliente.</span>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="ds-btn-secondary px-3 py-1.5 rounded-lg text-sm">Cancelar</button>
              <button onClick={doPublish} disabled={!canPublish || publishing}
                className="ds-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm disabled:opacity-50">
                {publishing ? <Loader2 size={14} className="animate-spin" /> : <GitCommit size={14} />} Publicar no Git
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
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

function ActionTag({ action }: { action: 'add' | 'modify' | 'skip' | 'pending' }) {
  if (action === 'add') return <span style={{ color: 'var(--success)' }}>· novo</span>
  if (action === 'modify') return <span style={{ color: 'var(--warning)' }}>· sobrescreve</span>
  return null
}
