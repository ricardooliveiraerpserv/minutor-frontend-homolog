'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Clock } from 'lucide-react'
import { api } from '@/lib/api'
import { sanitizeRich } from '@/lib/sanitize-html'
import { SearchSelect } from '@/components/ui/search-select'
import { RichEditor, type RichEditorHandle } from './rich-editor'
import { TimeSelect5 } from './time-select-5'

// Tempo trabalhado da interação do formulário (vira apontamento quando o contrato tem integração).
export interface FormTime { worked_date: string; start_time: string; end_time: string; total_hours: string; no_charge: boolean }
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function deriveTotal(start: string, end: string): string {
  if (!start || !end) return ''
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  if (!Number.isFinite(mins) || mins <= 0) return ''
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`
}

// Tags de preenchimento automático: substitui {chave} pelo valor do mapa (nome, cliente, etc.).
// Tag desconhecida fica como está (não some) — assim o autor percebe erro de digitação.
export function applyTokens(text: string | null | undefined, tokens: Record<string, string>): string {
  if (!text) return text ?? ''
  return text.replace(/\{([a-z0-9_.]+)\}/gi, (m, key) => (key in tokens && tokens[key] !== '') ? tokens[key] : m)
}
// Catálogo de tags disponíveis (rótulo p/ o construtor). Os valores vêm do ticket em runtime.
export const FORM_TAGS: { tag: string; label: string }[] = [
  { tag: '{ticket.creator.name}', label: 'Nome de quem abriu o chamado' },
  { tag: '{ticket.creator.email}', label: 'E-mail de quem abriu' },
  { tag: '{ticket.number}', label: 'Número do chamado' },
  { tag: '{ticket.subject}', label: 'Assunto do chamado' },
  { tag: '{cliente}', label: 'Nome do cliente (empresa)' },
  { tag: '{consultor}', label: 'Consultor responsável (atribuído)' },
  { tag: '{contato}', label: 'Contato do cliente' },
  { tag: '{usuario}', label: 'Seu nome (quem está preenchendo)' },
  { tag: '{data}', label: 'Data de hoje' },
]

// 'title' = bloco de cabeçalho (texto grande centralizado); 'section' = divisor de bloco.
// Em ambos, `required` é REAPROVEITADO como flag "carregar logo" (mostra o logo acima).
// Nenhum dos dois gera input no preenchimento.
export type FieldType = 'title' | 'section' | 'text' | 'richtext' | 'checkbox' | 'date' | 'time' | 'user'
// rule = automação condicional: quando o checkbox `when` está marcado, o campo recebe `value` e trava.
// require_attachment: checkbox que, ao ser marcado, EXIGE anexar arquivo comprimido antes de salvar.
// counts_for_section: campo (ex.: "Outros") que, se PREENCHIDO, satisfaz o mínimo da seção como um checkbox.
export interface FieldRule { when?: string | null; value?: string | null; require_attachment?: boolean; counts_for_section?: boolean }
// Extensões de arquivo comprimido aceitas quando o anexo é obrigatório (Código Fonte etc.).
const COMPRESSED_RE = /\.(zip|rar|7z|tar|gz|tgz|bz2|xz|z)$/i
export interface FormField { id?: number; key: string; ftype: FieldType; label: string; hint?: string | null; required?: boolean; min_chars?: number | null; rule?: FieldRule | null }
export interface HdForm { id: number; name: string; status_id: number | null; title?: string | null; subtitle?: string | null; intro?: string | null; show_logo?: boolean; active?: boolean; fields: FormField[]; status?: { id: number; key: string; label: string } | null }
export interface FormValueField { key: string; label: string; hint?: string | null; ftype: FieldType; value: string | boolean }
export interface FormInstance { form_id: number; title?: string | null; subtitle?: string | null; intro?: string | null; show_logo?: boolean; fields: FormValueField[] }

const nonSpaceLen = (html: string) => { const el = document.createElement('div'); el.innerHTML = html; return (el.textContent || '').replace(/\s+/g, '').length }
const isBlank = (v: string | boolean | null | undefined) => v == null ? true : (typeof v === 'boolean' ? !v : nonSpaceLen(String(v)) === 0)
// Campo "com conteúdo" p/ o render final: checkbox marcado, ou texto/rich/data/hora não-vazio.
const fieldHasContent = (f: FormValueField) => f.ftype !== 'title' && f.ftype !== 'section' && (f.ftype === 'checkbox' ? !!f.value : !isBlank(f.value))
// Uma seção só é trazida se houver algum campo com conteúdo até a próxima seção/título.
const sectionHasContent = (fields: FormValueField[], from: number) => {
  for (let j = from + 1; j < fields.length; j++) {
    if (fields[j].ftype === 'section' || fields[j].ftype === 'title') break
    if (fieldHasContent(fields[j])) return true
  }
  return false
}

/** Monta o HTML (body/e-mail) a partir da instância preenchida. */
export function composeFormBody(inst: FormInstance): string {
  let html = ''
  if (inst.show_logo) html += '<div style="text-align:center;margin:0 0 10px 0;"><img src="/logo.png" alt="ERPSERV" style="height:44px;" /></div>'
  if (inst.title) html += `<div style="text-align:center;font-size:18px;font-weight:bold;color:#5b21b6;margin:0 0 4px 0;">${inst.title}</div>`
  if (inst.subtitle) html += `<div style="text-align:center;font-size:14px;font-weight:bold;color:#5b21b6;margin:0 0 8px 0;">${inst.subtitle}</div>`
  if (inst.intro) html += `<p style="text-align:center;color:#374151;margin:0 0 14px 0;">${inst.intro.replace(/\n/g, '<br>')}</p>`
  inst.fields.forEach((f, i) => {
    if (f.ftype === 'title') {
      // `value` (boolean) = flag "carregar logo" do bloco de título.
      if (f.value) html += '<div style="text-align:center;margin:10px 0 8px 0;"><img src="/logo.png" alt="ERPSERV" style="height:44px;" /></div>'
      html += `<div style="text-align:center;font-size:18px;font-weight:bold;color:#5b21b6;margin:0 0 12px 0;">${f.label}</div>`
    }
    else if (f.ftype === 'section') {
      // Só traz a seção se houver algum campo preenchido até a próxima seção/título.
      if (!sectionHasContent(inst.fields, i)) return
      if (f.value) html += '<div style="text-align:center;margin:14px 0 8px 0;"><img src="/logo.png" alt="ERPSERV" style="height:44px;" /></div>'
      html += `<p style="font-weight:bold;font-size:15px;margin:16px 0 6px 0;border-top:1px solid #e5e7eb;padding-top:10px;">${f.label}</p>`
    }
    // Campos vazios (e checkbox desmarcado) não são trazidos.
    else if (f.ftype === 'richtext') { if (!isBlank(f.value)) html += `<div style="margin:0 0 12px 0;"><p style="font-weight:bold;margin:0 0 3px 0;">${f.label}</p><div style="padding-left:6px;">${f.value as string}</div></div>` }
    else if (f.ftype === 'checkbox') { if (f.value) html += `<div style="margin:0 0 4px 0;">☑ ${f.label}</div>` }
    else { if (!isBlank(f.value)) html += `<div style="margin:0 0 6px 0;"><strong>${f.label}:</strong> ${f.value as string}</div>` }
  })
  return html
}

const inputStyle = { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'

export function DynamicFormModal({ form, initial, initialTime, tokens = {}, currentUserName, timeMode = 'optional', submitLabel = 'Salvar e aplicar', onClose, onSubmit }: {
  form: HdForm
  initial?: FormInstance | null
  initialTime?: FormTime | null
  tokens?: Record<string, string>   // preenchimento automático: {ticket.creator.name} etc.
  currentUserName?: string          // atalho "eu" nos campos de usuário
  // Horas da interação: 'optional' (pode marcar "Sem apontamento"), 'required' (obrigatório informar,
  // sem escape) ou 'hidden' (não aponta por aqui). Espelha o modo do compositor (sustentação).
  timeMode?: 'optional' | 'required' | 'hidden'
  submitLabel?: string
  onClose: () => void
  onSubmit: (inst: FormInstance, body: string, time: FormTime, files: File[]) => Promise<void> | void
}) {
  // Tempo trabalhado da interação (obrigatório informar — é uma interação). Edição pré-preenche.
  const [workedDate, setWorkedDate] = useState(initialTime?.worked_date || localToday())
  const [startTime, setStartTime] = useState(initialTime?.start_time || '')
  const [endTime, setEndTime] = useState(initialTime?.end_time || '')
  const [totalHours, setTotalHours] = useState(initialTime?.total_hours || '')
  // 'required' não permite "Sem apontamento"; 'hidden' não aponta (no_charge).
  const [noCharge, setNoCharge] = useState(timeMode === 'hidden' ? true : (timeMode === 'required' ? false : !!initialTime?.no_charge))
  const derivedTotal = deriveTotal(startTime, endTime)
  const totalDisplay = totalHours || derivedTotal
  // Campos do tipo "user" buscam do cadastro de usuários (internos).
  const [users, setUsers] = useState<{ id: number; name: string }[]>([])
  useEffect(() => {
    if (form.fields.some(f => f.ftype === 'user')) {
      api.get<{ data: { id: number; name: string }[] }>('/help-desk/agents?candidates=1').then(r => setUsers(r?.data ?? [])).catch(() => {})
    }
  }, [form])
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
  // Automação: campo travado quando o checkbox `rule.when` está marcado → recebe `rule.value`.
  const ruleValue = (f: FormField) => f.rule?.value || 'não se aplica'
  const ruleLocked = (f: FormField) => !!(f.rule?.when && vals[f.rule.when])
  const fieldLabel = (key?: string | null) => form.fields.find(x => x.key === key)?.label ?? ''

  const submit = async () => {
    // Lê os rich do ref.
    const values: Record<string, string | boolean> = { ...vals }
    for (const f of form.fields) if (f.ftype === 'richtext') values[f.key] = richRefs.current[f.key]?.getHtml() ?? ''
    // Campos travados por automação recebem o valor da regra (sobrepõe leitura acima).
    for (const f of form.fields) if (ruleLocked(f)) values[f.key] = ruleValue(f)

    const errors: string[] = []
    for (const f of form.fields) {
      if (f.ftype === 'section' || f.ftype === 'title' || ruleLocked(f)) continue
      const v = values[f.key]
      if (f.required && isBlank(v)) errors.push(f.label)
      else if ((f.ftype === 'richtext' || f.ftype === 'text') && f.min_chars && !isBlank(v) && nonSpaceLen(String(v)) < f.min_chars) errors.push(`${f.label} (mín. ${f.min_chars})`)
    }
    // Seção com `min_chars` = exige ao menos N CHECKBOXES marcados entre ela e a próxima
    // seção/título ("selecione pelo menos N"). Conta SÓ checkbox — campos de texto/richtext da
    // seção não satisfazem (senão um campo obrigatório seguinte já "cumpriria" o mínimo).
    for (let i = 0; i < form.fields.length; i++) {
      const sec = form.fields[i]
      if (sec.ftype !== 'section' || !sec.min_chars || sec.min_chars < 1) continue
      let count = 0
      for (let j = i + 1; j < form.fields.length; j++) {
        const fj = form.fields[j]
        if (fj.ftype === 'section' || fj.ftype === 'title') break
        // Conta: checkbox marcado; ou campo marcado `counts_for_section` (ex.: "Outros") preenchido.
        if (fj.ftype === 'checkbox' ? !!values[fj.key] : (fj.rule?.counts_for_section && !isBlank(values[fj.key]))) count++
      }
      if (count < sec.min_chars) errors.push(`${sec.label} — selecione ao menos ${sec.min_chars}`)
    }
    // Anexos coletados dos editores (botão "Anexar"). Hoje é a única via de arquivo do formulário.
    const files = form.fields.filter(f => f.ftype === 'richtext').flatMap(f => richRefs.current[f.key]?.getFiles() ?? [])
    // Checkbox com rule.require_attachment marcado → exige anexar arquivo COMPRIMIDO (ex.: Código Fonte).
    for (const f of form.fields) {
      if (f.ftype !== 'checkbox' || !f.rule?.require_attachment || !values[f.key]) continue
      if (files.length === 0) errors.push(`${f.label}: anexe o arquivo (comprimido: .zip, .rar, .7z…) pelo botão “Anexar”`)
      else if (!files.every(x => COMPRESSED_RE.test(x.name))) errors.push(`${f.label}: o anexo deve ser um arquivo comprimido (.zip, .rar, .7z, .tar, .gz)`)
    }
    if (errors.length) { toast.error(errors.join(' · ')); return }

    // Tempo da interação: 'required' obriga informar (sem "Sem apontamento"); 'hidden' não aponta.
    if (timeMode !== 'hidden') {
      if (!noCharge && startTime && endTime && !derivedTotal) { toast.error('A hora de fim deve ser maior que a de início.'); return }
      if (!noCharge && !totalDisplay) { toast.error(timeMode === 'required' ? 'Informe as horas da interação (início→fim ou total).' : 'Informe as horas da interação (início→fim ou total) ou marque “Sem apontamento”.'); return }
    }

    // Tags resolvidas AGORA (grava o valor real na instância — o timeline/e-mail já saem prontos).
    const tk = (s: string | null | undefined) => applyTokens(s, tokens)
    const inst: FormInstance = {
      form_id: form.id, title: tk(form.title), subtitle: tk(form.subtitle), intro: tk(form.intro), show_logo: form.show_logo,
      // Título/Seção: `value` guarda o flag "carregar logo" (f.required) — não têm input de usuário.
      // Campos escalares nunca gravam null (senão renderiza "null" no resultado). Tags resolvidas no texto.
      fields: form.fields.map(f => ({ key: f.key, label: tk(f.label), hint: f.hint, ftype: f.ftype, value: (f.ftype === 'title' || f.ftype === 'section') ? !!f.required : (f.ftype === 'checkbox' ? !!values[f.key] : tk(String(values[f.key] ?? ''))) })),
    }
    const time: FormTime = { worked_date: workedDate, start_time: noCharge ? '' : startTime, end_time: noCharge ? '' : endTime, total_hours: noCharge ? '' : totalDisplay, no_charge: noCharge }
    setSaving(true)
    try { await onSubmit(inst, composeFormBody(inst), time, files) } finally { setSaving(false) }
  }

  const lbl = 'text-[15px] font-bold'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="ds-card p-5 w-full max-w-2xl space-y-3 overflow-y-auto" style={{ background: 'var(--surface)', maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        <div className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{applyTokens(form.title, tokens) || form.name}</div>
        {form.subtitle && <div className="text-sm font-bold" style={{ color: 'var(--primary)' }}>{applyTokens(form.subtitle, tokens)}</div>}
        {form.intro && <p className="text-xs whitespace-pre-line" style={{ color: 'var(--text-muted)' }}>{applyTokens(form.intro, tokens)}</p>}
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
          const locked = ruleLocked(f)
          return (
            <div key={f.key}>
              {f.ftype !== 'checkbox' && (
                <div className="flex items-center justify-between">
                  <label className={lbl} style={{ color: 'var(--text)' }}>{f.label}{f.required ? ' *' : ''}</label>
                  {!locked && f.ftype === 'richtext' && f.min_chars ? <span className="text-[11px] font-semibold" style={{ color: ok ? 'var(--success)' : 'var(--danger)' }}>{lens[f.key] ?? 0}/{f.min_chars}</span> : null}
                </div>
              )}
              {f.hint && f.ftype !== 'checkbox' && !locked && <p className="text-[11px] mb-1 leading-snug" style={{ color: 'var(--text-light)' }}>{f.hint}</p>}
              {locked && f.ftype !== 'checkbox' ? (
                <div className="text-sm rounded-lg px-2.5 py-1.5 flex items-center gap-2" style={{ background: 'var(--surface-hover)', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
                  <span className="italic">{ruleValue(f)}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>travado por “{fieldLabel(f.rule?.when)}”</span>
                </div>
              ) : (<>
              {f.ftype === 'richtext' && <RichEditor ref={el => { richRefs.current[f.key] = el }} initialHtml={String(initMap[f.key] || '')} minHeight={70} onChange={() => recount(f.key)} />}
              {f.ftype === 'text' && <input className={`${fieldCls} w-full`} style={inputStyle} value={String(vals[f.key] || '')} onChange={e => setV(f.key, e.target.value)} />}
              {f.ftype === 'date' && <input type="date" className={fieldCls} style={inputStyle} value={String(vals[f.key] || '')} onChange={e => setV(f.key, e.target.value)} />}
              {f.ftype === 'time' && <input type="time" className={fieldCls} style={inputStyle} value={String(vals[f.key] || '')} onChange={e => setV(f.key, e.target.value)} />}
              {f.ftype === 'user' && (
                <div className="flex items-center gap-2">
                  <div className="flex-1"><SearchSelect value={String(vals[f.key] || '')} onChange={v => setV(f.key, v)}
                    options={users.map(u => ({ id: u.name, name: u.name }))} placeholder="Buscar usuário…" fullWidth /></div>
                  {currentUserName && (
                    <button type="button" onClick={() => setV(f.key, currentUserName)}
                      className="text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap"
                      style={{ background: vals[f.key] === currentUserName ? 'var(--primary)' : 'var(--primary-soft)', color: vals[f.key] === currentUserName ? 'var(--primary-fg)' : 'var(--primary)' }}
                      title={`Sou eu (${currentUserName})`}>Sou eu</button>
                  )}
                </div>
              )}
              </>)}
              {f.ftype === 'checkbox' && (
                <label className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
                  <input type="checkbox" checked={!!vals[f.key]} onChange={e => setV(f.key, e.target.checked)} style={{ accentColor: 'var(--primary)' }} /> {f.label}{f.required ? ' *' : ''}
                </label>
              )}
            </div>
          )
        })}

        {/* Tempo da interação — o formulário É uma interação; movimenta horas quando o contrato tem a
            integração ligada. 'required' obriga informar (sem "Sem apontamento"); 'hidden' não aponta aqui. */}
        {timeMode !== 'hidden' && (
        <div className="rounded-lg px-2.5 py-2 text-xs" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><Clock size={13} /> Tempo{timeMode === 'required' ? ' *' : ''}</span>
            <input type="date" value={workedDate} max={localToday()} onChange={e => setWorkedDate(e.target.value)}
              disabled={noCharge} aria-label="Data da interação"
              className="ds-input" style={{ height: 30, fontSize: 12, width: 140, padding: '0 8px', opacity: noCharge ? 0.5 : 1 }} />
            <span style={{ color: 'var(--text-light)' }}>·</span>
            <TimeSelect5 value={startTime} onChange={v => { setStartTime(v); setNoCharge(false) }} ariaLabel="Hora início" maxBefore={endTime}
              topOption={timeMode === 'required' ? undefined : { label: 'Sem apontamento', active: noCharge, onSelect: () => { setNoCharge(true); setStartTime(''); setEndTime(''); setTotalHours('') } }} />
            <span style={{ color: 'var(--text-light)' }}>→</span>
            <TimeSelect5 value={endTime} onChange={setEndTime} disabled={noCharge} ariaLabel="Hora fim" minAfter={startTime} />
            <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>Total</span>
            <input type="text" value={noCharge ? '' : totalDisplay} onChange={e => setTotalHours(e.target.value)}
              placeholder="0:00" disabled={noCharge} aria-label="Total de horas"
              className="ds-input" style={{ height: 30, fontSize: 12, width: 64, padding: '0 8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', opacity: noCharge ? 0.5 : 1 }} />
          </div>
        </div>
        )}

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
      {instance.title && <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, color: '#5b21b6', marginBottom: 4 }}>{instance.title}</div>}
      {instance.subtitle && <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#5b21b6', marginBottom: 8 }}>{instance.subtitle}</div>}
      {instance.intro && <p style={{ textAlign: 'center', color: '#374151', marginBottom: 14, whiteSpace: 'pre-line' }}>{instance.intro}</p>}
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
        if (f.ftype === 'section') {
          // Seção sem nenhum campo preenchido até a próxima seção/título não é trazida.
          if (!sectionHasContent(instance.fields, i)) return null
          return (
            <div key={i} style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10, margin: '16px 0 6px' }}>
              {f.value && (
                // eslint-disable-next-line @next/next/no-img-element
                <div style={{ textAlign: 'center', marginBottom: 6 }}><img src="/logo.png" alt="ERPSERV" style={{ height: 44, display: 'inline-block' }} /></div>
              )}
              <div style={{ fontWeight: 700, fontSize: 15 }}>{f.label}</div>
            </div>
          )
        }
        // Campos vazios (e checkbox desmarcado) não são trazidos.
        if (f.ftype === 'richtext') return isBlank(f.value) ? null : <div key={i} style={{ marginBottom: 12 }}><div style={{ fontWeight: 700, marginBottom: 3 }}>{f.label}</div><div className="hd-rich" style={{ paddingLeft: 6 }} dangerouslySetInnerHTML={{ __html: sanitizeRich(String(f.value || '')) }} /></div>
        if (f.ftype === 'checkbox') return f.value ? <div key={i} style={{ marginBottom: 4 }}>☑ {f.label}</div> : null
        return isBlank(f.value) ? null : <div key={i} style={{ marginBottom: 6 }}><strong>{f.label}:</strong> {String(f.value)}</div>
      })}
    </div>
  )
}
