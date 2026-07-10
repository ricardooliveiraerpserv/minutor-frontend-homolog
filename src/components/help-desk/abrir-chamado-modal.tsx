'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { X, Paperclip, FileText, Image as ImageIcon } from 'lucide-react'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const lbl = 'text-[11px] font-semibold block mb-0.5'
const PRIO = ['baixa', 'normal', 'alta', 'urgente']

/** Modal de abertura de chamado do cliente — reusável (portal e faixa "Precisa de ajuda?").
 *  Permite COLAR PRINT (paste) e ANEXAR arquivos, enviados após criar o chamado. */
export function AbrirChamadoModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [canUrgency, setCanUrgency] = useState(true)
  useEffect(() => { api.get<{ data: { inform?: Record<string, boolean> } }>('/help-desk/portal/permissions').then(r => setCanUrgency(r?.data?.inform?.urgency ?? true)).catch(() => {}) }, [])

  const addFiles = (list: FileList | File[]) => { const arr = Array.from(list); if (arr.length) setFiles(f => [...f, ...arr]) }
  const removeFile = (i: number) => setFiles(f => f.filter((_, j) => j !== i))
  // Colar print (Ctrl+V) na descrição → vira anexo.
  const onPaste = (e: React.ClipboardEvent) => {
    const imgs = Array.from(e.clipboardData.items).filter(it => it.type.startsWith('image/'))
    if (imgs.length) {
      const fs = imgs.map(it => it.getAsFile()).filter(Boolean) as File[]
      if (fs.length) { addFiles(fs); toast.success('Print anexado') }
    }
  }

  const submit = async () => {
    if (!subject.trim()) return toast.error('Informe o assunto.')
    setSaving(true)
    try {
      const r = await api.post<{ data: { id: number } }>('/help-desk/portal/tickets', { subject: subject.trim(), description: description.trim() || null, priority })
      const id = r.data.id
      // Sobe os anexos/prints (best-effort) — o chamado já foi criado.
      for (const f of files) {
        try { const fd = new FormData(); fd.append('file', f); await api.post(`/help-desk/portal/tickets/${id}/attachments`, fd) }
        catch { toast.error(`Falha ao anexar "${f.name}"`) }
      }
      toast.success('Chamado aberto'); onCreated(id)
    } catch { toast.error('Erro ao abrir chamado') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-10 px-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="ds-card w-full max-w-4xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Abrir chamado</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--text-muted)' }} /></button></div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Assunto *</label><input className={`${fieldCls} w-full`} style={inputStyle} value={subject} onChange={e => setSubject(e.target.value)} autoFocus /></div>
        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Descrição <span style={{ color: 'var(--text-light)' }}>· cole um print aqui (Ctrl+V)</span></label>
          <textarea className={`${fieldCls} w-full`} style={{ ...inputStyle, minHeight: 260, resize: 'vertical' }} rows={10} value={description} onChange={e => setDescription(e.target.value)} onPaste={onPaste} />
        </div>
        {canUrgency && <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Prioridade</label><select className={`${fieldCls} w-full capitalize`} style={inputStyle} value={priority} onChange={e => setPriority(e.target.value)}>{PRIO.map(p => <option key={p} value={p}>{p}</option>)}</select></div>}

        {/* Anexos escolhidos */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px]" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
                {f.type.startsWith('image/') ? <ImageIcon size={12} /> : <FileText size={12} />}
                <span className="max-w-[140px] truncate">{f.name}</span>
                <button onClick={() => removeFile(i)} aria-label="Remover"><X size={12} style={{ color: 'var(--text-light)' }} /></button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <label className="inline-flex items-center gap-1 text-xs cursor-pointer px-2 py-1 rounded-md" style={{ color: 'var(--primary)' }}>
            <Paperclip size={14} /> Anexar arquivo
            <input type="file" multiple className="hidden" onChange={e => { if (e.target.files) addFiles(e.target.files); e.currentTarget.value = '' }} />
          </label>
          <div className="flex gap-2"><button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={onClose}>Cancelar</button><button className="ds-btn-primary text-sm px-3 py-1.5 rounded-lg" onClick={submit} disabled={saving}>{saving ? 'Abrindo…' : 'Abrir'}</button></div>
        </div>
      </div>
    </div>
  )
}
