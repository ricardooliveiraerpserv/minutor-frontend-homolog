'use client'

// Documentação do ambiente — anexos NÃO-secretos (PDF/DOCX/XLSX/XML…). Upload e
// download normais (servidor lê estes; diferente dos arquivos .enc cifrados).

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileText, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button, EmptyState } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { fetchEncryptedAttachment, triggerDownload } from '@/lib/env-file-crypto'

interface DocRow { id: number; original_name: string; extension: string; size_bytes: number; created_at: string }

export function EnvDocs({ envId }: { envId: number }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [docs, setDocs] = useState<DocRow[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setDocs(await api.get<DocRow[]>(`/environments/environments/${envId}/docs`))
  }, [envId])
  useEffect(() => { void load() }, [load])

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('entity_type', 'ENV_DOC')
      fd.append('entity_id', String(envId))
      fd.append('category', 'doc')
      fd.append('visibility', 'restricted')
      fd.append('file', file)
      await api.post('/attachments', fd)
      toast.success('Documento enviado.'); void load()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Falha no upload.') } finally { setBusy(false) }
  }

  const download = async (d: DocRow) => {
    try {
      const bytes = await fetchEncryptedAttachment(d.id) // aqui não há cifra — bytes originais
      triggerDownload(new Uint8Array(bytes), d.original_name)
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Falha ao baixar.') }
  }

  const remove = async (id: number) => {
    try { await api.delete(`/attachments/${id}`); void load() }
    catch (err) { toast.error(err instanceof ApiError ? err.message : 'Falha ao excluir.') }
  }

  return (
    <div>
      <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text)' }}>
          <FileText className="w-4 h-4" style={{ color: 'var(--primary)' }} /> Documentação
          <span className="text-xs font-normal" style={{ color: 'var(--text-light)' }}>({docs.length})</span>
        </h3>
        <Button variant="primary" size="sm" icon={Upload} loading={busy} onClick={() => inputRef.current?.click()}>Enviar documento</Button>
        <input ref={inputRef} type="file" className="hidden" onChange={upload} />
      </div>
      {docs.length === 0 ? (
        <div className="p-6"><EmptyState icon={FileText} title="Sem documentos" description="Manuais, layouts, XMLs, procedimentos…" /></div>
      ) : (
        <table className="ds-table w-full">
          <thead><tr><th>Arquivo</th><th>Tamanho</th><th /></tr></thead>
          <tbody>
            {docs.map(d => (
              <tr key={d.id}>
                <td className="text-sm" style={{ color: 'var(--text)' }}>{d.original_name}</td>
                <td className="text-sm" style={{ color: 'var(--text-muted)' }}>{(d.size_bytes / 1024).toFixed(0)} KB</td>
                <td className="text-right whitespace-nowrap">
                  <button type="button" className="p-1.5 rounded hover:opacity-80" style={{ color: 'var(--text-muted)' }} title="Baixar" onClick={() => download(d)}><Download className="w-4 h-4" /></button>
                  <button type="button" className="p-1.5 rounded hover:opacity-80" style={{ color: 'var(--danger)' }} title="Excluir" onClick={() => remove(d.id)}><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
