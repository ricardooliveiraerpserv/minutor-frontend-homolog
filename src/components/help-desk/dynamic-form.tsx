'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { sanitizeRich } from '@/lib/sanitize-html'
import { RichEditor, type RichEditorHandle } from './rich-editor'

// 'title' = bloco de cabeçalho (texto grande centralizado); 'section' = divisor de bloco.
// Em ambos, `required` é REAPROVEITADO como flag "carregar logo" (mostra o logo acima).
// Nenhum dos dois gera input no preenchimento.
export type FieldType = 'title' | 'section' | 'text' | 'richtext' | 'checkbox' | 'date' | 'time'
export interface FormField { id?: number; key: string; ftype: FieldType; label: string; hint?: string | null; required?: boolean; min_chars?: number | null }
export interface HdForm { id: number; name: string; status_id: number | null; title?: string | null; intro?: string | null; show_logo?: boolean; active?: boolean; fields: FormField[]; status?: { id: number; key: string; label: string } | null }
export interface FormValueField { key: string; label: string; hint?: string | null; ftype: FieldType; value: string | boolean }
export interface FormInstance { form_id: number; title?: string | null; intro?: string | null; show_logo?: boolean; fields: FormValueField[] }

const nonSpaceLen = (html: string) => { const el = document.createElement('div'); el.innerHTML = html; return (el.textContent || '').replace(/\s+/g, '').length }
const isBlank = (v: string | boolean) => typeof v === 'boolean' ? !v : nonSpaceLen(String(v)) === 0

/** Monta o HTML (body/e-mail) a partir da instância preenchida. */
export function composeFormBody(inst: FormInstance): string {
  let html = ''
  if (inst.show_logo) html += '<div style="text-align:center;margin:0 0 10px 0;"><img src="/logo.png" alt="ERPSERV" style="height:44px;" /></div>'
  if (inst.title) html += `<div style="text-align:center;font-size:18px;font-weight:bold;color:#5b21b6;margin:0 0 8px 0;">${inst.title}</div>`
  if (inst.intro) html += `<p style="text-align:center;color:#374151;margin:0 0 14px 0;">${inst.intro}</p>`
  for (const f of inst.fields) {
    if (f.ftype === 'title') {
      // `value` (boolean) = flag "carregar logo" do bloco de título.
      if (f.value) html += '<div style="text-align:center;margin:10px 0 8px 0;"><img src="/logo.png" alt="ERPSERV" style="height:44px;" /></div>'
      html += `<div style="text-align:center;font-size:18px;font-weight:bold;color:#5b21b6;margin:0 0 12px 0;">${f.label}</div>`
    }
    else if (f.ftype === 'section') {
      // `value` (boolean) = flag "carregar logo" da seção.
      if (f.value) html += '<div style="text-align:center;margin:14px 0 8px 0;"><img src="/logo.png" alt="ERPSERV" style="height:44px;" /></div>'
      html += `<p style="font-weight:bold;font-size:15px;margin:16px 0 6px 0;border-top:1px solid #e5e7eb;padding-top:10px;">${f.label}</p>`
    }
    else if (f.ftype === 'richtext') html += `<div style="margin:0 0 12px 0;"><p style="font-weight:bold;margin:0 0 3px 0;">${f.label}</p><div style="padding-left:6px;">${(f.value as string) || ''}</div></div>`
    else if (f.ftype === 'checkbox') html += `<div style="margin:0 0 4px 0;">${f.value ? '☑' : '☐'} ${f.label}</div>`
    else html += `<div style="margin:0 0 6px 0;"><strong>${f.label}:</strong> ${(f.value as string) || '—'}</div>`
  }
  return html
}

const inputStyle = { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'

export function DynamicFormModal({ form, initial, submitLabel = 'Salvar e aplicar', onClose, onSubmit }: {
  form: HdForm
  initial?: FormInstance | null
  submitLabel?: string
  onClose: () => void
  onSubmit: (inst: FormInstance, body: string) => Promise<void> | void
}) {
  // Valor inicial por chave (edição usa a instância salva).
  const initMap: Record<string, string | boolean> = {}
  for (const f of form.fields) {
    const saved = initial?.fields.find(x => x.key === f.key)
    initMap[f.key] = saved ? saved.value : (f.ftype === 'checkbox' ? false : '')
  }
  const [vals, setVals] = useState<Record<string, string | boolean>>(initMap)
  const [saving, setSaving] = useState(false)
  const richRefs = useRef<Record<string, RichEditorHandle | null>>({})
  const [lens, setLens] = useState<Record<string, number>>(() => {
    const o: Record<string, number> = {}
    for (const f of form.fields) if (f.ftype === 'richtext') o[f.key] = nonSpaceLen(String(initMap[f.key] || ''))
    return o
  })
  const recount = (key: string) => setLens(l => ({ ...l, [key]: nonSpaceLen(richRefs.current[key]?.getHtml() ?? '') }))
  const setV = (key: string, v: string | boolean) => setVals(s => ({ ...s, [key]: v }))

  const submit = async () => {
    // Lê os rich do ref.
    const values: Record<string, string | boolean> = { ...vals }
    for (const f of form.fields) if (f.ftype === 'richtext') values[f.key] = richRefs.current[f.key]?.getHtml() ?? ''

    const errors: string[] = []
    for (const f of form.fields) {
      if (f.ftype === 'section' || f.ftype === 'title') continue
      const v = values[f.key]
      if (f.required && isBlank(v)) errors.push(f.label)
      else if ((f.ftype === 'richtext' || f.ftype === 'text') && f.min_chars && !isBlank(v) && nonSpaceLen(String(v)) < f.min_chars) errors.push(`${f.label} (mín. ${f.min_chars})`)
    }
    if (errors.length) { toast.error(`Preencha: ${errors.join(', ')}.`); return }

    const inst: FormInstance = {
      form_id: form.id, title: form.title, intro: form.intro, show_logo: form.show_logo,
      // Título/Seção: `value` guarda o flag "carregar logo" (f.required) — não têm input de usuário.
      fields: form.fields.map(f => ({ key: f.key, label: f.label, hint: f.hint, ftype: f.ftype, value: (f.ftype === 'title' || f.ftype === 'section') ? !!f.required : values[f.key] })),
    }
    setSaving(true)
    try { await onSubmit(inst, composeFormBody(inst)) } finally { setSaving(false) }
  }

  const lbl = 'text-[15px] font-bold'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="ds-card p-5 w-full max-w-2xl space-y-3 overflow-y-auto" style={{ background: 'var(--surface)', maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        <div className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{form.title || form.name}</div>
        {form.intro && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{form.intro}</p>}
        {form.fields.map(f => {
          if (f.ftype === 'title') return (
            <div key={f.key} className="text-center py-1">
              {f.required && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/logo.png" alt="ERPSERV" style={{ height: 40, display: 'inline-block', marginBottom: 6 }} />
              )}
              <div className="text-lg font-bold" style={{ color: 'var(--primary)' }}>{f.label}</div>
            </div>
          )
          if (f.ftype === 'section') return (
            <div key={f.key} className="pt-2 mt-1 border-t" style={{ borderColor: 'var(--border)' }}>
              {f.required && (
                // eslint-disable-next-line @next/next/no-img-element
                <div className="text-center mb-1.5"><img src="/logo.png" alt="ERPSERV" style={{ height: 40, display: 'inline-block' }} /></div>
              )}
              <div className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>{f.label}</div>
            </div>
          )
          const ok = !f.min_chars || (lens[f.key] ?? 0) >= f.min_chars
          return (
            <div key={f.key}>
              {f.ftype !== 'checkbox' && (
                <div className="flex items-center justify-between">
                  <label className={lbl} style={{ color: 'var(--text)' }}>{f.label}{f.required ? ' *' : ''}</label>
                  {f.ftype === 'richtext' && f.min_chars ? <span className="text-[11px] font-semibold" style={{ color: ok ? 'var(--success)' : 'var(--danger)' }}>{lens[f.key] ?? 0}/{f.min_chars}</span> : null}
                </div>
              )}
              {f.hint && f.ftype !== 'checkbox' && <p className="text-[11px] mb-1 leading-snug" style={{ color: 'var(--text-light)' }}>{f.hint}</p>}
              {f.ftype === 'richtext' && <RichEditor ref={el => { richRefs.current[f.key] = el }} initialHtml={String(initMap[f.key] || '')} minHeight={70} onChange={() => recount(f.key)} />}
              {f.ftype === 'text' && <input className={`${fieldCls} w-full`} style={inputStyle} value={String(vals[f.key] || '')} onChange={e => setV(f.key, e.target.value)} />}
              {f.ftype === 'date' && <input type="date" className={fieldCls} style={inputStyle} value={String(vals[f.key] || '')} onChange={e => setV(f.key, e.target.value)} />}
              {f.ftype === 'time' && <input type="time" className={fieldCls} style={inputStyle} value={String(vals[f.key] || '')} onChange={e => setV(f.key, e.target.value)} />}
              {f.ftype === 'checkbox' && (
                <label className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
                  <input type="checkbox" checked={!!vals[f.key]} onChange={e => setV(f.key, e.target.checked)} style={{ accentColor: 'var(--primary)' }} /> {f.label}{f.required ? ' *' : ''}
                </label>
              )}
            </div>
          )
        })}
        <div className="flex justify-end gap-2 pt-1">
          <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={onClose}>Cancelar</button>
          <button className="ds-btn-primary text-sm px-3 py-1.5 rounded-lg" onClick={submit} disabled={saving}>{saving ? 'Salvando…' : submitLabel}</button>
        </div>
      </div>
    </div>
  )
}

/** Render de uma instância preenchida no timeline (fundo papel). */
export function DynamicFormView({ instance }: { instance: FormInstance }) {
  return (
    <div className="rounded-lg p-4 text-sm" style={{ background: '#ffffff', color: '#1f2937', border: '1px solid #e5e7eb' }}>
      {instance.show_logo && (
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="ERPSERV" style={{ height: 44, display: 'inline-block' }} />
        </div>
      )}
      {instance.title && <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, color: '#5b21b6', marginBottom: 8 }}>{instance.title}</div>}
      {instance.intro && <p style={{ textAlign: 'center', color: '#374151', marginBottom: 14 }}>{instance.intro}</p>}
      {instance.fields.map((f, i) => {
        if (f.ftype === 'title') return (
          <div key={i} style={{ textAlign: 'center', marginBottom: 12 }}>
            {f.value && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/logo.png" alt="ERPSERV" style={{ height: 44, display: 'inline-block', marginBottom: 6 }} />
            )}
            <div style={{ fontSize: 18, fontWeight: 700, color: '#5b21b6' }}>{f.label}</div>
          </div>
        )
        if (f.ftype === 'section') return (
          <div key={i} style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10, margin: '16px 0 6px' }}>
            {f.value && (
              // eslint-disable-next-line @next/next/no-img-element
              <div style={{ textAlign: 'center', marginBottom: 6 }}><img src="/logo.png" alt="ERPSERV" style={{ height: 44, display: 'inline-block' }} /></div>
            )}
            <div style={{ fontWeight: 700, fontSize: 15 }}>{f.label}</div>
          </div>
        )
        if (f.ftype === 'richtext') return <div key={i} style={{ marginBottom: 12 }}><div style={{ fontWeight: 700, marginBottom: 3 }}>{f.label}</div><div className="hd-rich" style={{ paddingLeft: 6 }} dangerouslySetInnerHTML={{ __html: sanitizeRich(String(f.value || '')) }} /></div>
        if (f.ftype === 'checkbox') return <div key={i} style={{ marginBottom: 4 }}>{f.value ? '☑' : '☐'} {f.label}</div>
        return <div key={i} style={{ marginBottom: 6 }}><strong>{f.label}:</strong> {String(f.value) || '—'}</div>
      })}
    </div>
  )
}
