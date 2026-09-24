'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { Badge } from '@/components/ds'
import { toast } from 'sonner'
import { RefreshCw, FileCode, ShieldCheck, FolderGit2, ChevronDown, ChevronRight, BarChart3 } from 'lucide-react'
import { FindingCards, gradeColor, type CaFinding } from '@/components/help-desk/code-analysis-comment'

/**
 * GMUD — Publicação Governada de Fontes. ENTRADA COMPACTA no chamado: só um lançador (Enviar ZIP +
 * "Abrir publicação"). Toda a revisão/seleção de pasta/publicação acontece no POP-UP (GmudPublishModal),
 * aberto ao gravar a GMUD ou por este lançador. Nada é publicado no Git sem o aceite explícito no modal.
 */

type QualityFile = {
  id: number
  filename: string
  grade: string | null
  score: number | null
  findings: CaFinding[]
  analyzed_at: string | null
}
type Manifest = {
  id: number
  customer_id: number | null
  original_name: string
  size_bytes: number
  status: string
  received_at: string | null
  files_count: number
  uploaded_by_name?: string | null
  interaction_seq?: number | null
  quality_files?: QualityFile[]
}

const IN_PROGRESS = new Set(['received', 'extracting', 'analyzing'])

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
function fmt(dt: string | null): string {
  if (!dt) return '—'
  const d = new Date(dt)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const STATUS_META: Record<string, { label: string; variant: string }> = {
  received:   { label: 'Recebido',   variant: 'default' },
  extracting: { label: 'Extraindo',  variant: 'primary' },
  analyzing:  { label: 'Analisando', variant: 'primary' },
  analyzed:   { label: 'Analisado',  variant: 'success' },
  failed:     { label: 'Falha',      variant: 'danger' },
  publishing: { label: 'Publicando', variant: 'primary' },
  published:  { label: 'Publicado',  variant: 'success' },
  publish_failed: { label: 'Falha ao publicar', variant: 'danger' },
}

// Pior nota (A melhor … F pior) entre os fontes — resumo do bloco recolhido.
function worstGrade(files: QualityFile[]): string | null {
  const order = 'ABCDEF'
  let worst: string | null = null
  for (const f of files) {
    const g = (f.grade || '').toUpperCase()
    if (!g || order.indexOf(g) < 0) continue
    if (worst === null || order.indexOf(g) > order.indexOf(worst)) worst = g
  }
  return worst
}

// Linha de resultado do CodeAnalysis por fonte: Fonte · Nota · #interação · Autor + expandir (cards).
function SourceQualityRow({ file, seq, author, open, onToggle }: { file: QualityFile; seq?: number | null; author?: string | null; open: boolean; onToggle: () => void }) {
  const n = file.findings?.length ?? 0
  return (
    <div className="rounded-md" style={{ background: 'var(--surface-sunken)' }}>
      <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] flex-wrap">
        <BarChart3 size={12} style={{ color: 'var(--text-light)' }} />
        <span className="font-mono truncate" style={{ color: 'var(--text)' }}>{file.filename}</span>
        <span className="font-semibold" style={{ color: gradeColor(file.grade) }}>{file.grade ?? '—'}{file.score != null ? ` · ${file.score}/100` : ''}</span>
        <span style={{ color: 'var(--text-light)' }}>· {n} achado(s)</span>
        {seq != null && <span className="font-mono px-1 rounded" title="Interação da publicação" style={{ color: 'var(--primary)', background: 'var(--primary-soft)' }}>#{seq}</span>}
        {author && <span style={{ color: 'var(--text-light)' }}>· {author}</span>}
        {n > 0 && (
          <button onClick={onToggle} className="ml-auto inline-flex items-center gap-1 font-medium" style={{ color: 'var(--primary)' }}>
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{open ? 'Ocultar' : 'Ver críticas'}
          </button>
        )}
      </div>
      {open && n > 0 && <div className="px-2 pb-2"><FindingCards findings={file.findings} /></div>}
    </div>
  )
}

export function GmudPublicacaoPanel({ ticketId, gmudActive = true, onPublish }: {
  ticketId: number
  customerId?: number | null
  gmudActive?: boolean
  onPublish: (packageId: number) => void
}) {
  const [packages, setPackages] = useState<Manifest[] | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // Fontes com "críticas" expandidas (controlado no painel p/ ter "Fechar tudo").
  const [openFiles, setOpenFiles] = useState<Set<number>>(new Set())
  const toggleFile = (id: number) => setOpenFiles((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  // Pacotes com o bloco "CodeAnalysis por fonte" EXPANDIDO (padrão: recolhido/minimizado).
  const [openPkgs, setOpenPkgs] = useState<Set<number>>(new Set())
  const togglePkg = (id: number) => setOpenPkgs((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const loadList = useCallback(async () => {
    try {
      const res = await api.get<{ data: Manifest[] }>(`/help-desk/tickets/${ticketId}/gmud/packages`)
      setPackages(res.data)
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 401)) { setForbidden(true); return }
      setPackages([])
    }
  }, [ticketId])

  useEffect(() => { void loadList() }, [loadList])

  const onUpload = async (file: File) => {
    if (!/\.zip$/i.test(file.name)) { toast.error('Envie um arquivo .zip'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post<{ data: Manifest }>(`/help-desk/tickets/${ticketId}/gmud/packages`, fd)
      toast.success('Pacote recebido — abrindo publicação…')
      await loadList()
      onPublish(res.data.id) // ao enviar o ZIP, abre direto o pop-up
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Falha ao enviar o pacote')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (forbidden) return null
  if (!gmudActive && (!packages || packages.length === 0)) return null

  return (
    <div className="ds-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <FolderGit2 size={14} style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Publicação de Fontes (GMUD)</span>
        </div>
        <div className="flex items-center gap-2">
          {(openFiles.size > 0 || openPkgs.size > 0) && (
            <button onClick={() => { setOpenFiles(new Set()); setOpenPkgs(new Set()) }} className="ds-btn-secondary inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg" title="Recolher todos os blocos e críticas abertos">
              <ChevronRight size={13} /> Fechar tudo
            </button>
          )}
          <button onClick={() => void loadList()} className="ds-btn-secondary inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg" title="Atualizar"><RefreshCw size={13} /></button>
        </div>
      </div>

      {packages === null ? (
        <div className="text-xs" style={{ color: 'var(--text-light)' }}>Carregando…</div>
      ) : packages.length === 0 ? (
        <div className="text-xs" style={{ color: 'var(--text-light)' }}>
          Nenhum pacote. Ao gravar a GMUD (ou enviar o ZIP), abre o pop-up para conferir os fontes, escolher as pastas e publicar.
        </div>
      ) : (
        <div className="space-y-1.5">
          {packages.map((p) => {
            const st = STATUS_META[p.status] ?? { label: p.status, variant: 'default' }
            const busy = IN_PROGRESS.has(p.status)
            const analyzed = (p.quality_files ?? []).filter((f) => f.analyzed_at)
            return (
              <div key={p.id} className="rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <FileCode size={14} style={{ color: 'var(--primary)' }} />
                  <span className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>{p.original_name}</span>
                  <Badge variant={st.variant}>{st.label}</Badge>
                  <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{p.files_count} fonte(s) · {human(p.size_bytes)} · {fmt(p.received_at)}</span>
                  <button onClick={() => onPublish(p.id)} className="ml-auto ds-btn-primary inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg">
                    {busy ? 'Acompanhar' : p.status === 'published' ? 'Ver publicação' : 'Abrir publicação'}
                  </button>
                </div>
                {analyzed.length > 0 && (() => {
                  const pkgOpen = openPkgs.has(p.id)
                  const worst = worstGrade(analyzed)
                  return (
                    <div className="border-t px-2 py-2" style={{ borderColor: 'var(--border)' }}>
                      <button onClick={() => togglePkg(p.id)} className="flex items-center gap-1.5 w-full text-[10px] uppercase tracking-wide px-1" style={{ color: 'var(--text-light)' }}>
                        {pkgOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <span>CodeAnalysis por fonte · {analyzed.length} fonte(s)</span>
                        {worst && <span className="font-semibold" style={{ color: gradeColor(worst) }}>· pior nota {worst}</span>}
                      </button>
                      {pkgOpen && (
                        <div className="space-y-1 mt-1.5">
                          {analyzed.map((f) => (
                            <SourceQualityRow key={f.id} file={f} seq={p.interaction_seq} author={p.uploaded_by_name} open={openFiles.has(f.id)} onToggle={() => toggleFile(f.id)} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
        <ShieldCheck size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />
        <span>Enviar o ZIP <b>não publica</b> sozinho. Tudo (conferência, pastas e commit) é definido no pop-up, com aceite explícito.</span>
      </div>
    </div>
  )
}
