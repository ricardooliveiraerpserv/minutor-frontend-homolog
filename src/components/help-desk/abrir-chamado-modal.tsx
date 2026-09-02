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
  const [categoryId, setCategoryId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [saving, setSaving] = useState(false)
  const [inform, setInform] = useState<Record<string, boolean>>({ urgency: true, category: true, service: true })
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([])
  const [services, setServices] = useState<{ id: number; name: string }[]>([])
  const [contactId, setContactId] = useState('')
  const [onBehalf, setOnBehalf] = useState(false)
  const [contacts, setContacts] = useState<{ id: string; name: string; email?: string }[]>([])
  const [kbEnabled, setKbEnabled] = useState(false)
  const [kbResults, setKbResults] = useState<{ id: number; titulo?: string; title?: string }[]>([])
  const [tagOptions, setTagOptions] = useState<{ id: number; name: string; color?: string | null }[]>([])
  const [selectedTags, setSelectedTags] = useState<number[]>([])
  const [ccEmails, setCcEmails] = useState<string[]>([])
  const [ccInput, setCcInput] = useState('')
  const addCc = () => {
    const e = ccInput.trim().replace(/[;,]$/, '')
    if (!e) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast.error('E-mail inválido'); return }
    setCcEmails(cur => cur.includes(e) ? cur : [...cur, e]); setCcInput('')
  }
  const [created, setCreated] = useState<{ id: number; numero: string | null } | null>(null)
  const descRef = useRef<RichEditorHandle>(null)
  useEffect(() => {
    api.get<{ data: { inform?: Record<string, boolean>; categories?: { id: number; name: string }[]; services?: { id: number; name: string }[]; kb_suggestions?: boolean; open_on_behalf?: boolean; contacts?: { id: string; name: string; email?: string }[]; tags?: { id: number; name: string; color?: string | null }[] } }>('/help-desk/portal/permissions')
      .then(r => { const d = r?.data; if (d?.inform) setInform(d.inform); setCategories(d?.categories ?? []); setServices(d?.services ?? []); setKbEnabled(!!d?.kb_suggestions); setOnBehalf(!!d?.open_on_behalf); setContacts(d?.contacts ?? []); setTagOptions(d?.tags ?? []) }).catch(() => {})
  }, [])
  // Sugestão de artigos da KB conforme o cliente digita o assunto (só se o perfil permitir).
  useEffect(() => {
    if (!kbEnabled || subject.trim().length < 3) { setKbResults([]); return }
    const t = setTimeout(() => {
      api.get<{ data: { id: number; titulo?: string; title?: string }[] }>(`/help-desk/portal/kb?search=${encodeURIComponent(subject.trim())}`)
        .then(r => setKbResults((r?.data ?? []).slice(0, 4))).catch(() => setKbResults([]))
    }, 350)
    return () => clearTimeout(t)
  }, [subject, kbEnabled])

  const submit = async () => {
    if (!subject.trim()) return toast.error('Informe o assunto.')
    const html = descRef.current?.getHtml() ?? ''
    const descFiles = descRef.current?.getFiles() ?? []
    setSaving(true)
    try {
      const cc = [...ccEmails]
      const pend = ccInput.trim().replace(/[;,]$/, '')
      if (pend && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pend) && !cc.includes(pend)) cc.push(pend)
      const r = await api.post<{ data: { id: number; numero: string | null } }>('/help-desk/portal/tickets', { subject: subject.trim(), description: htmlIsBlank(html) ? null : html, priority, category_id: categoryId ? Number(categoryId) : null, service_id: serviceId ? Number(serviceId) : null, on_behalf: contactId || null, tags: selectedTags, cc_emails: cc })
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
        {/* Sugestão de artigos da Base de Conhecimento (se o perfil permitir). */}
        {kbEnabled && kbResults.length > 0 && (
          <div className="rounded-lg p-2.5" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)' }}>
            <div className="text-[11px] font-semibold mb-1" style={{ color: 'var(--primary)' }}>💡 Talvez estes artigos ajudem:</div>
            <ul className="space-y-0.5 text-sm">
              {kbResults.map(a => <li key={a.id} style={{ color: 'var(--text)' }}>• {a.titulo ?? a.title}</li>)}
            </ul>
          </div>
        )}
        {/* Abrir em nome de outra pessoa (contato) — se o perfil permitir. */}
        {onBehalf && contacts.length > 0 && (
          <div>
            <label className={lbl} style={{ color: 'var(--text-light)' }}>Em nome de <span style={{ color: 'var(--text-light)' }}>(opcional)</span></label>
            <select className={`${fieldCls} w-full`} style={inputStyle} value={contactId} onChange={e => setContactId(e.target.value)}>
              <option value="">Eu mesmo</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.email ? ` — ${c.email}` : ''}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Descrição <span style={{ color: 'var(--text-light)' }}>· cole um print direto aqui (Ctrl+V) ou anexe arquivos</span></label>
          <RichEditor ref={descRef} initialHtml="" minHeight={240} />
        </div>

        {/* Campos que o cliente pode INFORMAR na abertura — cada um respeita o perfil de acesso. */}
        {((inform.service && services.length > 0) || (inform.category && categories.length > 0)) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {inform.service && services.length > 0 && (
              <div>
                <label className={lbl} style={{ color: 'var(--text-light)' }}>Serviço</label>
                <select className={`${fieldCls} w-full`} style={inputStyle} value={serviceId} onChange={e => setServiceId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            {inform.category && categories.length > 0 && (
              <div>
                <label className={lbl} style={{ color: 'var(--text-light)' }}>Categoria</label>
                <select className={`${fieldCls} w-full`} style={inputStyle} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {/* TAGs — se o perfil permitir informar. Chips clicáveis (multi-seleção). */}
        {inform.tags && tagOptions.length > 0 && (
          <div>
            <label className={lbl} style={{ color: 'var(--text-light)' }}>TAGs</label>
            <div className="flex gap-2 flex-wrap">
              {tagOptions.map(tg => {
                const on = selectedTags.includes(tg.id)
                return (
                  <button key={tg.id} type="button"
                    onClick={() => setSelectedTags(s => on ? s.filter(x => x !== tg.id) : [...s, tg.id])}
                    className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-medium"
                    style={{ background: on ? (tg.color ?? 'var(--primary)') : 'var(--surface-sunken)', color: on ? '#ffffff' : 'var(--text-muted)', border: `1px solid ${on ? (tg.color ?? 'var(--primary)') : 'var(--border)'}` }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: on ? '#ffffff' : (tg.color ?? 'var(--text-light)') }} />{tg.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* CC — pessoas em CÓPIA (todos os perfis). Digite o e-mail e Enter. */}
        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Em cópia (CC) <span style={{ color: 'var(--text-light)' }}>· e-mails que receberão as atualizações</span></label>
          {ccEmails.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {ccEmails.map(e => (
                <span key={e} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  {e}<button type="button" onClick={() => setCcEmails(cur => cur.filter(x => x !== e))} style={{ color: 'var(--text-light)' }}>×</button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input className={`${fieldCls} flex-1`} style={inputStyle} value={ccInput} onChange={e => setCcInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ',' || e.key === ';') { e.preventDefault(); addCc() } }}
              placeholder="email@empresa.com e Enter" />
            <button type="button" className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={addCc}>Adicionar</button>
          </div>
        </div>

        {inform.urgency && (
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
