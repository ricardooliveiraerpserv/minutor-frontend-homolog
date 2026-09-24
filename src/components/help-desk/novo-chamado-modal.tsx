'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { X, FileCode, Paperclip, Trash2 } from 'lucide-react'
import { sanitizeRich } from '@/lib/sanitize-html'
import { SearchSelect } from '@/components/ui/search-select'
import { ServiceTreeSelect } from '@/components/help-desk/service-tree-select'
import { useActiveCompany } from '@/hooks/use-active-company'

// Modal de abertura de chamado — compartilhado entre a lista de Chamados e a Fila (Kanban),
// para o botão "Novo chamado" abrir o formulário INLINE (sem navegar para outra tela).

export interface NovoChamadoRef { id: number; name: string }
export interface NovoChamadoServiceOpt { id: number; parent_id: number | null; name: string; code: string | null; selectable_by_agent?: boolean }
export interface NovoChamadoMeta {
  priorities?: string[]
  categories?: { id: number; name: string; color?: string | null }[]
  services?: NovoChamadoServiceOpt[]
  my_inform?: Record<string, boolean>
  my_perms?: Record<string, boolean>
  companies_scope?: { id: number; name: string; slug?: string | null; color?: string | null }[] // multi-empresa: empresas que o agente atende
  is_multi_company?: boolean
}

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const PRIO_LABEL: Record<string, string> = { baixa: 'Baixa', normal: 'Média', alta: 'Alta', urgente: 'Urgente' }
// Cores de prioridade (mesmas do detalhe do chamado / Kanban).
const PRIO_META: Record<string, { color: string; bg: string }> = {
  baixa: { color: '#16a34a', bg: 'rgba(22,163,74,.14)' },
  normal: { color: '#ca8a04', bg: 'rgba(202,138,4,.14)' },
  alta: { color: '#ea580c', bg: 'rgba(234,88,12,.14)' },
  urgente: { color: '#dc2626', bg: 'rgba(220,38,38,.14)' },
}

export function NovoChamadoModal({ meta, customers, onClose, onCreated, variant = 'modal', heading = 'Novo chamado' }: { meta: NovoChamadoMeta | null; customers: NovoChamadoRef[]; onClose: () => void; onCreated: (id: number) => void; variant?: 'modal' | 'drawer'; heading?: string }) {
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')
  const [categoryId, setCategoryId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [contactId, setContactId] = useState('') // codificado "user:<id>" | "contact:<id>"
  const [contacts, setContacts] = useState<{ kind: 'user' | 'contact'; id: number; name: string; email: string | null; department?: string | null; perfil?: string | null }[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [prioOpen, setPrioOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  // Chamado "interno" = cliente ERPSERV (resolvido pelo nome, sem hardcode de id).
  const erpserv = customers.find(c => /erpserv/i.test(c.name))

  // "Solicitação de Fontes" NÃO é selecionável na abertura manual — é acionado
  // automaticamente pelo assistente de código-fonte. Remove o nó (e descendentes) do seletor.
  const visibleServices = useMemo(() => {
    const all = meta?.services ?? []
    const hidden = new Set<number>()
    all.forEach(s => { if (/solicita[çc][aã]o\s+de\s+fontes/i.test(s.name)) hidden.add(s.id) })
    let grew = true
    while (grew) { grew = false; all.forEach(s => { if (s.parent_id && hidden.has(s.parent_id) && !hidden.has(s.id)) { hidden.add(s.id); grew = true } }) }
    return all.filter(s => !hidden.has(s.id))
  }, [meta?.services])

  // Solicitante: usuários do PORTAL do cliente + contatos do cadastro (interno/ERPSERV não tem).
  useEffect(() => {
    setContactId('')
    setContacts([])
    if (!customerId || customerId === String(erpserv?.id ?? '')) return
    let alive = true
    api.get<{ data: { kind: 'user' | 'contact'; id: number; name: string; email: string | null; department?: string | null; perfil?: string | null }[] }>(`/help-desk/requesters?customer_id=${customerId}`)
      .then(r => { if (alive) setContacts(r.data ?? []) })
      .catch(() => { if (alive) setContacts([]) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])
  // Multi-empresa: quem atende 2+ empresas escolhe a EMPRESA DO GRUPO onde o chamado é aberto.
  const { active } = useActiveCompany()
  // ERPSERV sempre primeiro nos botões de empresa do chamado.
  const companyOpts = [...(meta?.companies_scope ?? [])].sort((a, b) => (/erpserv/i.test(b.name) ? 1 : 0) - (/erpserv/i.test(a.name) ? 1 : 0))
  const showCompanyPicker = !!meta?.is_multi_company && companyOpts.length > 1
  const [companyId, setCompanyId] = useState<string>('')
  // Default = empresa ativa (se estiver no escopo), senão a 1ª do escopo.
  const effectiveCompanyId = companyId || (companyOpts.some(c => c.id === active?.id) ? String(active?.id) : String(companyOpts[0]?.id ?? ''))

  // Cliente "interno" acompanha a EMPRESA do chamado: BIZIFY → cliente BIZIFY; senão ERPSERV.
  const effectiveCompany = companyOpts.find(c => String(c.id) === effectiveCompanyId)
  const internalCustomer = (effectiveCompany
    ? customers.find(c => c.name.toLowerCase() === effectiveCompany.name.toLowerCase())
    : null) ?? erpserv
  const internalIds = new Set(
    ([erpserv?.id, ...companyOpts.map(co => customers.find(c => c.name.toLowerCase() === co.name.toLowerCase())?.id)]
      .filter(Boolean) as number[]),
  )
  const isInternalClient = !customerId || internalIds.has(Number(customerId))

  // Anexos (arquivos avulsos, ex.: .pdf/.zip). Prints são colados NO CORPO (inline).
  const addFiles = (list: FileList | File[]) => { const arr = Array.from(list); if (arr.length) setFiles(f => [...f, ...arr]) }
  const removeFile = (idx: number) => setFiles(f => f.filter((_, i) => i !== idx))

  // Descrição = editor rico: aceita colar print direto no corpo (inline, redimensionável).
  const edRef = useRef<HTMLDivElement>(null)
  const [descEmpty, setDescEmpty] = useState(true)
  const syncDesc = () => {
    const ed = edRef.current; if (!ed) return
    // Enter perto do print pode fazer o browser deixar spans .hd-img vazios (quadros azuis
    // sem imagem). Remove-os antes de medir/salvar.
    ed.querySelectorAll('.hd-img').forEach(s => { if (!s.querySelector('img')) s.remove() })
    const hasContent = !!(ed.textContent?.trim() || ed.querySelector('img'))
    setDescEmpty(!hasContent)
    setDescription(hasContent ? sanitizeRich(ed.innerHTML) : '')
  }
  // Reduz o print antes de embutir (evita base64 gigante que estoura o POST).
  const MAX_W = 1400
  const downscale = (file: File): Promise<string> => new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_W / img.width)
      const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d'); URL.revokeObjectURL(url)
      if (!ctx) return resolve('')
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve('') }
    img.src = url
  })
  const insertImage = (dataUrl: string) => {
    const ed = edRef.current; if (!ed) return
    ed.focus()
    // contenteditable=false → o container do print é ATÔMICO: apertar Enter ao lado não o
    // divide (era o que gerava os quadros azuis vazios). Insere uma linha antes e depois p/
    // o cursor ter onde ficar (permite dar espaço acima/abaixo).
    document.execCommand('insertHTML', false,
      `<p><br/></p><span class="hd-img" contenteditable="false" title="Arraste o canto para redimensionar" style="display:inline-block;overflow:hidden;resize:horizontal;max-width:100%;min-width:100px;width:360px;border:2px solid #2563eb;border-radius:8px;margin:6px 0;vertical-align:top;cursor:ew-resize;">` +
      `<img src="${dataUrl}" alt="print" style="width:100%;display:block;" /></span><p><br/></p>`)
    syncDesc()
  }
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const imgs = Array.from(e.clipboardData.items).filter(it => it.type.startsWith('image/'))
    if (imgs.length) {
      e.preventDefault()
      imgs.forEach(async it => { const f = it.getAsFile(); if (!f) return; const data = await downscale(f); if (data) { insertImage(data); toast.success('Print colado no corpo') } })
    } else {
      e.preventDefault()
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
      syncDesc()
    }
  }

  const submit = async () => {
    if (!subject.trim()) return toast.error('Informe o assunto.')
    if (descEmpty) return toast.error('Informe a descrição.')
    if (!priority) return toast.error('Informe a urgência.')
    setSaving(true)
    try {
      const r = await api.post<{ data: { id: number } }>('/help-desk/tickets', {
        subject: subject.trim(), description: description.trim() || null, priority,
        category_id: categoryId || null, service_id: serviceId || null,
        customer_id: customerId || internalCustomer?.id || null, // vazio (interno) → empresa do chamado (ERPSERV/BIZIFY)
        // Solicitante: usuário do portal → requester_user_id; contato do cadastro → customer_contact_id.
        requester_user_id: contactId.startsWith('user:') ? Number(contactId.slice(5)) : null,
        customer_contact_id: contactId.startsWith('contact:') ? Number(contactId.slice(8)) : null,
        company_id: showCompanyPicker && effectiveCompanyId ? Number(effectiveCompanyId) : null, // empresa do grupo escolhida
      })
      // Anexos: enviados 1 a 1 após criar o chamado (endpoint aceita um arquivo por request).
      for (const f of files) {
        const fd = new FormData(); fd.append('file', f)
        try { await api.post(`/help-desk/tickets/${r.data.id}/attachments`, fd) }
        catch { toast.error(`Falha ao anexar ${f.name}`) }
      }
      toast.success('Chamado aberto')
      onCreated(r.data.id)
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao abrir chamado') } finally { setSaving(false) }
  }

  const lbl = 'text-[11px] font-semibold block mb-0.5'
  const drawer = variant === 'drawer'
  return (
    <div
      className={`fixed z-50 inset-0 ${drawer ? 'pointer-events-none' : 'flex items-start justify-center pt-16 px-4'}`}
      style={{ background: drawer ? 'transparent' : 'rgba(0,0,0,0.4)' }}
      onClick={drawer ? undefined : onClose}
    >
      <div
        className={`ds-card p-4 space-y-3 ${drawer ? 'pointer-events-auto fixed right-4 bottom-4 w-[min(94vw,560px)] max-h-[88vh] overflow-y-auto shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200' : 'w-full max-w-2xl max-h-[88vh] overflow-y-auto'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{heading}</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        <a href="/help-desk/codigo-fonte" onClick={onClose} className="flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-2" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
          <FileCode size={13} /> Precisa de código-fonte? Abrir o assistente de solicitação →
        </a>
        {showCompanyPicker && (
          <div>
            <label className={lbl} style={{ color: 'var(--text-light)' }}>Empresa do chamado *</label>
            <div className="flex gap-1.5 flex-wrap">
              {companyOpts.map(c => {
                const sel = effectiveCompanyId === String(c.id)
                return (
                  <button key={c.id} type="button" onClick={() => setCompanyId(String(c.id))}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors"
                    style={{ borderColor: sel ? (c.color || 'var(--primary)') : 'var(--border)', background: sel ? (c.color ? c.color + '22' : 'var(--primary-soft)') : 'var(--surface)', color: sel ? (c.color || 'var(--primary)') : 'var(--text-muted)' }}>
                    {sel ? '✓ ' : ''}{c.name}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Você atende mais de uma empresa — escolha em qual o chamado será aberto.</p>
          </div>
        )}
        <div className="space-y-2">
          <div>
            <label className={lbl} style={{ color: 'var(--text-light)' }}>Assunto *</label>
            <input className={`${fieldCls} w-full`} style={inputStyle} value={subject} onChange={e => setSubject(e.target.value)} autoFocus />
          </div>
        </div>
        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Descrição *</label>
          <div className="relative">
            <div
              ref={edRef}
              contentEditable
              suppressContentEditableWarning
              onInput={syncDesc}
              onKeyUp={syncDesc}
              onMouseUp={syncDesc}
              onPaste={onPaste}
              onDrop={() => setTimeout(syncDesc, 0)}
              className="hd-rich w-full text-sm rounded-lg px-3 py-2.5 outline-none overflow-y-auto"
              style={{ background: '#ffffff', color: '#1f2937', border: '1px solid var(--border)', minHeight: 240, maxHeight: 520, resize: 'vertical' }}
            />
            {descEmpty && (
              <span className="pointer-events-none absolute left-3 top-2.5 text-sm" style={{ color: 'var(--text-light)' }}>
                Descreva o chamado… (cole prints com Ctrl+V direto no corpo)
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(meta?.my_inform?.urgency ?? true) && (
            <div>
              <label className={lbl} style={{ color: 'var(--text-light)' }}>Urgência *</label>
              {(() => {
                const opts = meta?.priorities ?? ['baixa', 'normal', 'alta', 'urgente']
                const m = PRIO_META[priority] ?? { color: 'var(--text-muted)', bg: 'var(--surface)' }
                return (
                  <div className="relative">
                    <button type="button" onClick={() => setPrioOpen(o => !o)}
                      className={`${fieldCls} w-full flex items-center justify-between gap-2`}
                      style={{ background: m.bg, border: `1px solid ${m.color}`, color: m.color, fontWeight: 600 }}>
                      <span className="flex items-center gap-2">
                        <span style={{ width: 9, height: 9, borderRadius: 999, background: m.color, display: 'inline-block' }} />
                        {PRIO_LABEL[priority] ?? priority}
                      </span>
                      <span style={{ opacity: .7 }}>▾</span>
                    </button>
                    {prioOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setPrioOpen(false)} />
                        <div className="absolute z-50 mt-1 w-full rounded-lg py-1 shadow-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                          {opts.map(p => {
                            const pm = PRIO_META[p] ?? { color: 'var(--text-muted)', bg: 'transparent' }
                            const sel = p === priority
                            return (
                              <button key={p} type="button" onClick={() => { setPriority(p); setPrioOpen(false) }}
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm text-left"
                                style={{ background: sel ? pm.bg : 'transparent', color: 'var(--text)', fontWeight: sel ? 600 : 400 }}>
                                <span style={{ width: 9, height: 9, borderRadius: 999, background: pm.color, display: 'inline-block' }} />
                                {PRIO_LABEL[p] ?? p}
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )
              })()}
            </div>
          )}
          {(meta?.my_inform?.category ?? true) && (
            <div>
              <label className={lbl} style={{ color: 'var(--text-light)' }}>Categoria</label>
              <select className={`${fieldCls} w-full`} style={inputStyle} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                <option value="">—</option>
                {(meta?.categories ?? []).map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>
        {(meta?.my_inform?.service ?? true) && (
          <div>
            <label className={lbl} style={{ color: 'var(--text-light)' }}>Serviço</label>
            <ServiceTreeSelect services={visibleServices} value={serviceId ? Number(serviceId) : null} onChange={id => setServiceId(id ? String(id) : '')} />
          </div>
        )}
        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Cliente</label>
          <SearchSelect fullWidth placeholder="Buscar cliente…" value={customerId} onChange={setCustomerId}
            options={[{ id: '', name: `${effectiveCompany?.name ?? 'ERPSERV'} (interno)` }, ...customers.filter(c => !internalIds.has(c.id)).map(c => ({ id: c.id, name: c.name }))]} />
        </div>
        {!isInternalClient && (
          <div>
            <label className={lbl} style={{ color: 'var(--text-light)' }}>Solicitante</label>
            <SearchSelect fullWidth disabled={contacts.length === 0}
              placeholder={contacts.length === 0 ? 'Cliente sem solicitantes cadastrados' : 'Selecionar solicitante…'}
              value={contactId} onChange={setContactId}
              options={[{ id: '', name: 'Sem solicitante definido' }, ...contacts.map(c => ({ id: `${c.kind}:${c.id}`, name: [c.name, c.email, c.department].filter(Boolean).join(' · ') }))]} />
          </div>
        )}
        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Anexos</label>
          <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold rounded-lg px-2.5 py-2 w-fit"
            style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
            <Paperclip size={13} /> Anexar arquivos
            <input type="file" multiple className="hidden" onChange={e => { if (e.target.files) addFiles(e.target.files); e.currentTarget.value = '' }} />
          </label>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Arquivos avulsos (PDF, ZIP, etc.). Prints podem ser colados direto no corpo da Descrição.</p>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-xs rounded-lg px-2 py-1" style={{ background: 'var(--surface-hover)', color: 'var(--text)' }}>
                  <span className="truncate">{f.name} <span style={{ color: 'var(--text-light)' }}>· {(f.size / 1024).toFixed(0)} KB</span></span>
                  <button type="button" onClick={() => removeFile(i)} title="Remover"><Trash2 size={13} style={{ color: 'var(--danger)' }} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={onClose}>Cancelar</button>
          <button className="ds-btn-primary text-sm px-3 py-1.5 rounded-lg" onClick={submit} disabled={saving}>{saving ? 'Abrindo…' : 'Abrir chamado'}</button>
        </div>
      </div>
    </div>
  )
}
