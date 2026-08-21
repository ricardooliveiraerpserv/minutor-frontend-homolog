'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { Badge } from '@/components/ds'
import { toast } from 'sonner'
import { UploadCloud, RefreshCw, FileCode, ShieldCheck, FolderGit2 } from 'lucide-react'

/**
 * GMUD — Publicação Governada de Fontes. ENTRADA COMPACTA no chamado: só um lançador (Enviar ZIP +
 * "Abrir publicação"). Toda a revisão/seleção de pasta/publicação acontece no POP-UP (GmudPublishModal),
 * aberto ao gravar a GMUD ou por este lançador. Nada é publicado no Git sem o aceite explícito no modal.
 */

type Manifest = {
  id: number
  customer_id: number | null
  original_name: string
  size_bytes: number
  status: string
  received_at: string | null
  files_count: number
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
          <button onClick={() => void loadList()} className="ds-btn-secondary inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg" title="Atualizar"><RefreshCw size={13} /></button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="ds-btn-primary inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg disabled:opacity-60">
            <UploadCloud size={14} /> {uploading ? 'Enviando…' : 'Enviar ZIP'}
          </button>
          <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f) }} />
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
            return (
              <div key={p.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-2" style={{ borderColor: 'var(--border)' }}>
                <FileCode size={14} style={{ color: 'var(--primary)' }} />
                <span className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>{p.original_name}</span>
                <Badge variant={st.variant}>{st.label}</Badge>
                <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{p.files_count} fonte(s) · {human(p.size_bytes)} · {fmt(p.received_at)}</span>
                <button onClick={() => onPublish(p.id)} className="ml-auto ds-btn-primary inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg">
                  {busy ? 'Acompanhar' : p.status === 'published' ? 'Ver publicação' : 'Abrir publicação'}
                </button>
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
