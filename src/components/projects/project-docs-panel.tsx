'use client'

import { useEffect, useRef, useState } from 'react'
import { Paperclip, Download, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { uploadDirect } from '@/lib/upload'
import { toast } from 'sonner'

/**
 * Painel de Documentos do projeto (anexos, exclui source 'contract') — versão
 * inline usada como aba dentro da tela do projeto (coord/admin/relacionados).
 * Mesma lógica do modal do pipeline (portado do prod). Upload/baixar/remover.
 */
export function ProjectDocsPanel({ projectId, canEdit = true }: { projectId: number; canEdit?: boolean }) {
  const [docs, setDocs] = useState<{ id: number; original_name: string; source?: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = () => {
    setLoading(true)
    api.get<any>(`/projects/${projectId}/attachments`)
      .then(r => setDocs((Array.isArray(r) ? r : []).filter((a: any) => a.source !== 'contract')))
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('type', 'outro')
      await uploadDirect(`/projects/${projectId}/attachments`, fd)
      toast.success('Documento enviado'); load()
    } catch { toast.error('Erro ao enviar documento') }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = '' }
  }
  const download = async (d: { id: number; original_name: string }) => {
    const res = await fetch(`/api/v1/projects/${projectId}/attachments/${d.id}`, { credentials: 'same-origin' })
    if (!res.ok) { toast.error('Erro ao baixar arquivo'); return }
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a'); a.href = url; a.download = d.original_name; a.click(); URL.revokeObjectURL(url)
  }
  const remove = async (d: { id: number; source?: string }) => {
    if (d.source === 'contract') { toast.error('Anexo do contrato — gerencie na Gestão de Contratos.'); return }
    if (!confirm('Remover este documento?')) return
    try { await api.delete(`/projects/${projectId}/attachments/${d.id}`); toast.success('Documento removido'); load() }
    catch { toast.error('Erro ao remover documento') }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Documentos do projeto</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Anexos documentais do projeto (coordenador, admin e relacionados).</p>
        </div>
        {canEdit && (
          <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
            <Paperclip size={13} /> {uploading ? 'Enviando…' : 'Anexar documento'}
          </button>
        )}
        <input ref={inputRef} type="file" className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.txt,.csv,.zip"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
      </div>

      {loading ? (
        <p className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>Carregando…</p>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Paperclip size={22} style={{ color: 'var(--text-light)' }} />
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Nenhum documento anexado ainda.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {docs.map(d => (
            <div key={`${d.source}-${d.id}`} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
              <button type="button" onClick={() => download(d)} className="flex items-center gap-2 min-w-0 text-left">
                <Paperclip size={14} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm truncate" style={{ color: 'var(--text)' }}>{d.original_name}</span>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => download(d)} title="Baixar" className="p-1.5 rounded-md hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)' }}><Download size={14} /></button>
                {canEdit && d.source !== 'contract' && (
                  <button type="button" onClick={() => remove(d)} title="Remover" className="p-1.5 rounded-md hover:bg-[var(--surface-hover)]" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
