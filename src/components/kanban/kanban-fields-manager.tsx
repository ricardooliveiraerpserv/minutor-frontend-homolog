'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { X, Trash2, Plus, Eye, EyeOff, Asterisk } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { kanbanApi, FIELD_TYPE_LABELS, type KField, type KFieldType } from '@/lib/client-kanban'

const NEEDS_OPTIONS: KFieldType[] = ['select', 'multiselect']

export function KanbanFieldsManager({ boardId, fields, onClose, onChanged }: {
  boardId: number; fields: KField[]; onClose: () => void; onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<KFieldType>('text')
  const [required, setRequired] = useState(false)
  const [showFront, setShowFront] = useState(false)
  const [optionsText, setOptionsText] = useState('')
  const [saving, setSaving] = useState(false)

  async function add() {
    if (!name.trim()) { toast.error('Dê um nome ao campo.'); return }
    const options = NEEDS_OPTIONS.includes(type)
      ? optionsText.split('\n').map(s => s.trim()).filter(Boolean)
      : undefined
    if (NEEDS_OPTIONS.includes(type) && (!options || options.length === 0)) { toast.error('Liste ao menos uma opção.'); return }
    setSaving(true)
    try {
      await kanbanApi.addField(boardId, { name: name.trim(), type, required, show_on_front: showFront, options })
      setName(''); setType('text'); setRequired(false); setShowFront(false); setOptionsText('')
      onChanged()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao criar campo') }
    finally { setSaving(false) }
  }

  async function toggle(f: KField, patch: Record<string, unknown>) {
    try { await kanbanApi.updateField(f.id, patch); onChanged() } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro') }
  }
  async function del(id: number) {
    if (!confirm('Excluir este campo? Os valores preenchidos nos cards serão perdidos.')) return
    try { await kanbanApi.deleteField(id); onChanged() } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro') }
  }

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={e => e.stopPropagation()} style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--text)' }}>Campos do quadro</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <div style={{ padding: 18, overflowY: 'auto' }}>
          {/* Lista */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {fields.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Nenhum campo personalizado ainda.</span>}
            {fields.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{f.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{FIELD_TYPE_LABELS[f.type]}{f.options.length ? ` · ${f.options.length} opções` : ''}</div>
                </div>
                <button onClick={() => toggle(f, { required: !f.required })} title={f.required ? 'Obrigatório' : 'Opcional'} style={{ ...chip, color: f.required ? 'var(--danger)' : 'var(--text-light)' }}><Asterisk size={13} /></button>
                <button onClick={() => toggle(f, { show_on_front: !f.show_on_front })} title={f.show_on_front ? 'Aparece na frente do card' : 'Só no detalhe'} style={{ ...chip, color: f.show_on_front ? 'var(--primary)' : 'var(--text-light)' }}>{f.show_on_front ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                <button onClick={() => del(f.id)} title="Excluir" style={{ ...chip, color: 'var(--text-muted)' }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>

          {/* Novo campo */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', marginBottom: 10 }}>Novo campo</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input className="ds-input" value={name} onChange={e => setName(e.target.value)} placeholder="Nome do campo" style={{ fontSize: 13, padding: '8px 10px' }} />
              <select className="ds-input" value={type} onChange={e => setType(e.target.value as KFieldType)} style={{ fontSize: 13, padding: '8px 10px' }}>
                {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {NEEDS_OPTIONS.includes(type) && (
              <textarea className="ds-input" value={optionsText} onChange={e => setOptionsText(e.target.value)} rows={3} placeholder={'Uma opção por linha…'} style={{ width: '100%', fontSize: 13, padding: 8, marginBottom: 10, resize: 'vertical', fontFamily: 'inherit' }} />
            )}
            <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
              <label style={chk}><input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} /> Obrigatório</label>
              <label style={chk}><input type="checkbox" checked={showFront} onChange={e => setShowFront(e.target.checked)} /> Exibir na frente do card</label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={add} disabled={saving} className="ds-btn-primary" style={{ fontSize: 13, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={15} /> {saving ? 'Adicionando…' : 'Adicionar campo'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const modal: React.CSSProperties = { width: '100%', maxWidth: 520, maxHeight: '88vh', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
const chip: React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'inline-flex', borderRadius: 6 }
const chk: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }
