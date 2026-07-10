'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { X, CheckCircle2, ArrowRight } from 'lucide-react'
import { RichEditor, type RichEditorHandle } from './rich-editor'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const lbl = 'text-[11px] font-semibold block mb-0.5'

// Cor por criticidade (baixa→verde, normal→azul, alta→âmbar, urgente→vermelho).
const PRIOS: { v: string; label: string; color: string }[] = [
  { v: 'baixa', label: 'Baixa', color: '#16a34a' },
  { v: 'normal', label: 'Normal', color: '#3b82f6' },
  { v: 'alta', label: 'Alta', color: '#f59e0b' },
  { v: 'urgente', label: 'Urgente', color: '#ef4444' },
]

// A descrição vira HTML (print colado INLINE). Vazio = sem texto e sem imagem.
function htmlIsBlank(html: string): boolean {
  const el = document.createElement('div'); el.innerHTML = html
  return (el.textContent || '').trim() === '' && !el.querySelector('img')
}

/** Modal de abertura de chamado do cliente — reusável (portal e faixa "Precisa de ajuda?").
 *  Descrição com editor rico: COLAR PRINT entra inline no texto; anexos vão pelo próprio editor. */
export function AbrirChamadoModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [subject, setSubject] = useState('')
  const [priority, setPriority] = useState('normal')
  const [saving, setSaving] = useState(false)
  const [canUrgency, setCanUrgency] = useState(true)
  const [created, setCreated] = useState<{ id: number; numero: string | null } | null>(null)
  const descRef = useRef<RichEditorHandle>(null)
  useEffect(() => { api.get<{ data: { inform?: Record<string, boolean> } }>('/help-desk/portal/permissions').then(r => setCanUrgency(r?.data?.inform?.urgency ?? true)).catch(() => {}) }, [])

  const submit = async () => {
    if (!subject.trim()) return toast.error('Informe o assunto.')
    const html = descRef.current?.getHtml() ?? ''
    const descFiles = descRef.current?.getFiles() ?? []
    setSaving(true)
    try {
      const r = await api.post<{ data: { id: number; numero: string | null } }>('/help-desk/portal/tickets', { subject: subject.trim(), description: htmlIsBlank(html) ? null : html, priority })
      const id = r.data.id
      for (const f of descFiles) {
        try { const fd = new FormData(); fd.append('file', f); await api.post(`/help-desk/portal/tickets/${id}/attachments`, fd) }
        catch { toast.error(`Falha ao anexar "${f.name}"`) }
      }
      setCreated({ id, numero: r.data.numero })   // → modal de sucesso com o número + "Ver chamado"
    } catch { toast.error('Erro ao abrir chamado') } finally { setSaving(false) }
  }

  // Modal de SUCESSO: número gerado + botão para ver o chamado.
  if (created) return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-24 px-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="ds-card w-full max-w-md p-6 text-center space-y-3" onClick={e => e.stopPropagation()}>
        <CheckCircle2 size={40} className="mx-auto" style={{ color: 'var(--success-border)' }} />
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Chamado aberto!</h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Seu chamado foi registrado com o número:</p>
        <div className="text-2xl font-bold font-mono" style={{ color: 'var(--primary)' }}>{created.numero ?? `#${created.id}`}</div>
        <p className="text-xs" style={{ color: 'var(--text-light)' }}>Você pode acompanhar respostas, prazos e anexos por aqui.</p>
        <div className="flex justify-center gap-2 pt-1">
          <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={onClose}>Fechar</button>
          <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg" onClick={() => onCreated(created.id)}>Ver chamado <ArrowRight size={15} /></button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-10 px-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="ds-card w-full max-w-4xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Abrir chamado</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--text-muted)' }} /></button></div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Assunto *</label><input className={`${fieldCls} w-full`} style={inputStyle} value={subject} onChange={e => setSubject(e.target.value)} autoFocus /></div>
        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Descrição <span style={{ color: 'var(--text-light)' }}>· cole um print direto aqui (Ctrl+V) ou anexe arquivos</span></label>
          <RichEditor ref={descRef} initialHtml="" minHeight={240} />
        </div>

        {canUrgency && (
          <div>
            <label className={lbl} style={{ color: 'var(--text-light)' }}>Prioridade</label>
            <div className="flex gap-2 flex-wrap">
              {PRIOS.map(p => {
                const active = priority === p.v
                return (
                  <button key={p.v} type="button" onClick={() => setPriority(p.v)}
                    className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-medium"
                    style={{ background: active ? p.color : 'var(--surface-sunken)', color: active ? '#ffffff' : 'var(--text-muted)', border: `1px solid ${active ? p.color : 'var(--border)'}` }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: active ? '#ffffff' : p.color }} />{p.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={onClose}>Cancelar</button>
          <button className="ds-btn-primary text-sm px-3 py-1.5 rounded-lg" onClick={submit} disabled={saving}>{saving ? 'Abrindo…' : 'Abrir'}</button>
        </div>
      </div>
    </div>
  )
}
