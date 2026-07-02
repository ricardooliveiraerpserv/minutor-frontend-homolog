'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { type RichEditorHandle } from '@/components/help-desk/rich-editor'
import { EmailFrame } from '@/components/help-desk/email-frame'
import { MultiSelect, type MSOpt } from '@/components/notifications/multi-select'
import {
  EmailHero, EmailSection, EmailField, EmailBenefits, EmailCTA, EmailFooter,
  inputStyle, fieldCls, lbl,
} from '@/components/communication/email-blocks'
import { Send, Eye, X, Bookmark, Megaphone, History as HistoryIcon, Users, Trash2, Plus, AlertTriangle, CalendarClock, Monitor, Smartphone, PenLine } from 'lucide-react'

const MANAGERS = ['admin', 'coordenador', 'administrativo']
// "Comunicação formal" aposentada (só Aviso); TIPO_L mantém o rótulo p/ exibir publicações antigas.
const TIPOS = [{ k: 'aviso', l: 'Aviso' }, { k: 'marketing', l: 'Marketing' }]
const TIPO_L: Record<string, string> = { aviso: 'Aviso', formal: 'Comunicação formal', marketing: 'Marketing' }
// Data de expiração padrão = hoje + 30 dias (campo obrigatório).
function defaultExpiry(): string { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10) }

interface Customer { id: number; name: string }
interface CustUser { id: number; name: string; email: string; customer_id: number }
interface DistList { id: number; nome: string; customer_ids: number[]; user_ids: number[]; external_emails: string[] }
interface Structure {
  badge?: string; subtitle?: string
  intro?: string; problema?: string; autoridade?: string       // marketing
  content?: string; greeting?: string; prazo?: string; acao_esperada?: string; contato?: string  // formal
  datahora?: string; observacao?: string                       // aviso
  benefits?: string[]; cta?: { label: string; url: string }; signature?: { enabled?: boolean } | null
}
interface CommTemplate { id: number; nome: string; tipo_comunicacao: string; title: string | null; message: string | null; structure: Structure | null }
interface HistItem { id: number; tipo: string; title: string; customers: string[]; recipients: number; sent_by: string | null; created_at: string }

export default function CentralComunicacaoPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<'novo' | 'historico' | 'listas' | 'modelos'>('novo')
  useEffect(() => { if (user && !MANAGERS.includes(user.type ?? '')) router.replace('/inicio') }, [user, router])

  return (
    <AppLayout title="Central de Comunicação">
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-2.5">
          <Megaphone size={22} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Central de Comunicação</h1>
          <span className="text-xs" style={{ color: 'var(--text-light)' }}>· Comunicação externa com clientes</span>
        </div>

        <div className="flex items-center gap-1">
          {([['novo', 'Novo envio'], ['historico', 'Histórico'], ['listas', 'Listas de distribuição'], ['modelos', 'Modelos']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className="text-sm px-3 py-1.5 rounded-lg" style={{ background: tab === k ? 'var(--primary-soft)' : 'transparent', color: tab === k ? 'var(--primary)' : 'var(--text-muted)', fontWeight: tab === k ? 600 : 400 }}>{l}</button>
          ))}
        </div>

        {tab === 'novo' && <Compose />}
        {tab === 'historico' && <History />}
        {tab === 'listas' && <Lists />}
        {tab === 'modelos' && <Templates />}
      </div>
    </AppLayout>
  )
}

/** Bloco de um cliente: contatos vinculados (checkbox) + inclusão manual de e-mail para este envio. */
function ClientBlock({ customer, users, selectedUsers, onToggle, onSelectAll, onAddExternal }: {
  customer: MSOpt
  users: CustUser[]
  selectedUsers: Set<number>
  onToggle: (id: number) => void
  onSelectAll: (on: boolean) => void
  onAddExternal: (email: string) => boolean
}) {
  const [manualOpen, setManualOpen] = useState(false)
  const [manual, setManual] = useState('')
  const selCount = users.filter(u => selectedUsers.has(u.id)).length
  const allOn = users.length > 0 && selCount === users.length
  const submitManual = () => { if (onAddExternal(manual)) { setManual(''); setManualOpen(false) } }

  return (
    <div className="rounded-lg p-2" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{customer.name}</span>
        <div className="flex items-center gap-2 shrink-0">
          {users.length > 0 && <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{selCount}/{users.length}</span>}
          {users.length > 0 && (
            <button onClick={() => onSelectAll(!allOn)} className="text-[11px]" style={{ color: 'var(--primary)' }}>{allOn ? 'desmarcar' : 'todos'}</button>
          )}
        </div>
      </div>

      {users.length === 0
        ? <p className="text-[11px] px-0.5" style={{ color: 'var(--text-light)' }}>Nenhum contato cadastrado para este cliente.</p>
        : <div className="max-h-40 overflow-auto">
            {users.map(u => (
              <label key={u.id} className="flex items-center gap-2 text-[13px] px-1.5 py-1 rounded cursor-pointer" style={{ color: 'var(--text)' }}>
                <input type="checkbox" checked={selectedUsers.has(u.id)} onChange={() => onToggle(u.id)} />
                <span className="flex-1 truncate">{u.name} <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· {u.email}</span></span>
              </label>
            ))}
          </div>}

      {/* Inclusão manual deste envio */}
      {manualOpen ? (
        <div className="flex items-center gap-1.5 mt-1.5">
          <input autoFocus className={`${fieldCls} flex-1`} style={inputStyle} value={manual} onChange={e => setManual(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitManual() } if (e.key === 'Escape') { setManual(''); setManualOpen(false) } }}
            placeholder="email@cliente.com + Enter" />
          <button onClick={submitManual} className="ds-btn-secondary text-xs px-2.5 py-1.5 rounded-lg"><Plus size={13} /></button>
        </div>
      ) : (
        <button onClick={() => setManualOpen(true)} className="text-[11px] inline-flex items-center gap-1 mt-1.5" style={{ color: 'var(--primary)' }}>
          <Plus size={12} /> incluir e-mail manual
        </button>
      )}
    </div>
  )
}

export function Compose({ allowedTypes, onSent }: { allowedTypes?: string[]; onSent?: () => void } = {}) {
  const tipos = TIPOS.filter(t => !allowedTypes || allowedTypes.includes(t.k))
  const { user } = useAuth()
  // Editores ricos registrados por nome de campo (intro/problema/autoridade/content/acao_esperada).
  const editorRefs = useRef<Map<string, RichEditorHandle>>(new Map())
  const benefitRefs = useRef<Map<number, RichEditorHandle>>(new Map())
  const registerEditor = (key: string) => (h: RichEditorHandle | null) => { if (h) editorRefs.current.set(key, h) }
  const readEd = (key: string) => editorRefs.current.get(key)?.getHtml() ?? ''

  const [tipo, setTipo] = useState(() => (allowedTypes && !allowedTypes.includes('aviso') ? allowedTypes[0] : 'aviso'))
  const [title, setTitle] = useState('')
  // Campos estruturados (texto simples).
  const [badge, setBadge] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [greeting, setGreeting] = useState('Prezados,')
  const [prazo, setPrazo] = useState('')
  const [contato, setContato] = useState('')
  const [datahora, setDatahora] = useState('')
  const [observacao, setObservacao] = useState('')
  // Valores iniciais dos campos ricos (p/ carregar modelo).
  const [init, setInit] = useState<Record<string, string>>({})
  const [benefits, setBenefits] = useState<{ id: number; html: string }[]>([])
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [sigEnabled, setSigEnabled] = useState(true) // inclui a assinatura padrão do remetente
  const [formKey, setFormKey] = useState(0) // força remount dos editores ao carregar modelo
  const benefitSeq = useRef(1)

  const [customers, setCustomers] = useState<Customer[]>([])
  const [pickedCustomers, setPickedCustomers] = useState<MSOpt[]>([])
  const [allCustomers, setAllCustomers] = useState(false)
  const [loadedUsers, setLoadedUsers] = useState<CustUser[]>([])
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set())
  const [externals, setExternals] = useState<string[]>([])
  const [extInput, setExtInput] = useState('')
  const [expiresAt, setExpiresAt] = useState(defaultExpiry)
  const [lists, setLists] = useState<DistList[]>([])
  const [templates, setTemplates] = useState<CommTemplate[]>([])
  const [preview, setPreview] = useState<{ html: string; recipients: number } | null>(null)
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')

  const isMkt = tipo === 'marketing'
  const addBenefit = () => setBenefits(b => [...b, { id: benefitSeq.current++, html: '' }])
  const removeBenefit = (id: number) => { benefitRefs.current.delete(id); setBenefits(b => b.filter(x => x.id !== id)) }
  const [confirmMass, setConfirmMass] = useState(false)
  const [sending, setSending] = useState(false)

  const loadTemplates = useCallback(() => api.get<{ data: CommTemplate[] }>('/communication-templates').then(r => setTemplates(r.data ?? [])).catch(() => {}), [])
  useEffect(() => {
    api.get<{ data: { customers: Customer[] } }>('/communications/meta').then(r => setCustomers(r.data?.customers ?? [])).catch(() => {})
    api.get<{ data: DistList[] }>('/distribution-lists').then(r => setLists(r.data ?? [])).catch(() => {})
    loadTemplates()
  }, [loadTemplates])

  const loadTemplate = (t: CommTemplate) => {
    const s = t.structure ?? {}
    setTipo(t.tipo_comunicacao || 'aviso'); setTitle(t.title ?? '')
    setBadge(s.badge ?? ''); setSubtitle(s.subtitle ?? '')
    setGreeting(s.greeting ?? 'Prezados,'); setPrazo(s.prazo ?? ''); setContato(s.contato ?? '')
    setDatahora(s.datahora ?? ''); setObservacao(s.observacao ?? '')
    setInit({ intro: s.intro ?? '', problema: s.problema ?? '', autoridade: s.autoridade ?? '', content: s.content ?? t.message ?? '', acao_esperada: s.acao_esperada ?? '' })
    benefitRefs.current.clear()
    setBenefits((s.benefits ?? []).map(h => ({ id: benefitSeq.current++, html: h })))
    setCtaLabel(s.cta?.label ?? ''); setCtaUrl(s.cta?.url ?? '')
    setSigEnabled(s.signature?.enabled ?? true)
    setFormKey(k => k + 1)
    toast.success(`Modelo "${t.nome}" carregado`)
  }
  const saveTemplate = async () => {
    const nome = window.prompt('Nome do modelo:', title.trim() || 'Novo modelo')
    if (!nome) return
    try { await api.post('/communication-templates', { nome, tipo_comunicacao: tipo, title: title.trim(), structure: buildStructure() }); toast.success('Modelo salvo'); loadTemplates() }
    catch { toast.error('Erro ao salvar modelo') }
  }

  // Ao mudar os clientes, carrega automaticamente os contatos e marca todos.
  useEffect(() => {
    const ids = pickedCustomers.map(c => c.id)
    if (!ids.length) { setLoadedUsers([]); setSelectedUsers(new Set()); return }
    api.get<{ data: CustUser[] }>(`/communications/customer-users?${ids.map(i => `customer_ids[]=${i}`).join('&')}`)
      .then(r => { const us = r.data ?? []; setLoadedUsers(us); setSelectedUsers(new Set(us.map(u => u.id))) }).catch(() => {})
  }, [pickedCustomers])

  const searchCustomers = useCallback(async (q: string): Promise<MSOpt[]> => {
    const t = q.trim().toLowerCase()
    return customers.filter(c => !t || c.name.toLowerCase().includes(t)).slice(0, 50).map(c => ({ id: c.id, name: c.name }))
  }, [customers])

  const toggleUser = (id: number) => setSelectedUsers(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectClient = (us: CustUser[], on: boolean) => setSelectedUsers(s => { const n = new Set(s); us.forEach(u => on ? n.add(u.id) : n.delete(u.id)); return n })
  const pushExternal = (raw: string): boolean => {
    const e = raw.trim().toLowerCase()
    if (!e) return false
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { toast.error('E-mail inválido.'); return false }
    setExternals(x => x.includes(e) ? x : [...x, e])
    return true
  }
  const addExternal = () => { if (pushExternal(extInput)) setExtInput('') }

  const readBenefits = () => benefits
    .map(b => benefitRefs.current.get(b.id)?.getHtml() ?? b.html)
    .filter(h => h.replace(/<[^>]*>/g, '').trim() !== '')
  const stripped = (h: string) => h.replace(/<[^>]*>/g, '').trim()

  const buildStructure = (): Structure => {
    const sig0 = { enabled: sigEnabled }
    if (isMkt) return {
      badge: badge.trim(), subtitle: subtitle.trim(),
      intro: readEd('intro'), problema: readEd('problema'), autoridade: readEd('autoridade'),
      benefits: readBenefits(),
      cta: { label: ctaLabel.trim(), url: ctaUrl.trim() },
      signature: sig0,
    }
    if (tipo === 'formal') return {
      greeting: greeting.trim(), content: readEd('content'),
      prazo: prazo.trim(), acao_esperada: readEd('acao_esperada'), contato: contato.trim(),
      signature: sig0,
    }
    return { content: readEd('content'), datahora: datahora.trim(), observacao: observacao.trim(), signature: sig0 }
  }
  // Inclui o e-mail digitado no campo mas ainda não "adicionado" (sem Enter/＋).
  const effExternals = () => {
    const e = extInput.trim().toLowerCase()
    if (e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && !externals.includes(e)) return [...externals, e]
    return externals
  }
  const body = () => ({
    tipo_comunicacao: tipo, title: title.trim(),
    structure: buildStructure(),
    customer_ids: pickedCustomers.map(c => c.id),
    user_ids: allCustomers ? [] : Array.from(selectedUsers),
    external_emails: effExternals(),
    all_customers: allCustomers,
    expires_at: expiresAt || null,
  })
  const valid = (requireRecipients = true) => {
    if (!title.trim()) { toast.error('Informe o título.'); return false }
    if (isMkt) {
      if (!subtitle.trim()) { toast.error('Informe o subtítulo do HERO.'); return false }
      if (stripped(readEd('intro')) === '' && stripped(readEd('problema')) === '') { toast.error('Preencha a introdução ou o cenário.'); return false }
      if (readBenefits().length < 1) { toast.error('Inclua ao menos 1 benefício.'); return false }
      if (!ctaLabel.trim() || !ctaUrl.trim()) { toast.error('O botão (CTA) é obrigatório em Marketing.'); return false }
      if (!/^https?:\/\/\S+/i.test(ctaUrl.trim())) { toast.error('A URL do botão deve começar com http:// ou https://.'); return false }
    } else if (stripped(readEd('content')) === '') {
      toast.error('Informe o conteúdo.'); return false
    }
    if (requireRecipients) {
      if (!allCustomers && selectedUsers.size === 0 && effExternals().length === 0) { toast.error('Selecione destinatários.'); return false }
      if (!expiresAt) { toast.error('Informe a data de expiração.'); return false }
    }
    return true
  }

  const doPreview = async () => {
    if (!valid(false)) return
    try { const r = await api.post<{ data: { html: string; recipients: number } }>('/communications/preview', body()); setPreview({ html: r.data?.html ?? '', recipients: r.data?.recipients ?? 0 }) }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') }
  }
  const send = async (confirm = false) => {
    if (!valid()) return
    if (allCustomers && !confirm) { setConfirmMass(true); return }
    setSending(true)
    try {
      const r = await api.post<{ data: { sent: number } }>('/communications/send', { ...body(), confirm })
      toast.success(`Comunicação enviada para ${r.data?.sent ?? 0} destinatário(s)`); setConfirmMass(false)
      setTitle(''); setPickedCustomers([]); setExternals([]); setExtInput(''); setAllCustomers(false); setExpiresAt(defaultExpiry())
      setBadge(''); setSubtitle(''); setGreeting('Prezados,'); setPrazo(''); setContato(''); setDatahora(''); setObservacao('')
      setInit({}); benefitRefs.current.clear(); setBenefits([]); setCtaLabel(''); setCtaUrl(''); setSigEnabled(true); setFormKey(k => k + 1)
      onSent?.()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao enviar') } finally { setSending(false) }
  }
  const saveList = async () => {
    const nome = window.prompt('Nome da lista de distribuição:')
    if (!nome) return
    try { await api.post('/distribution-lists', { nome, customer_ids: pickedCustomers.map(c => c.id), user_ids: Array.from(selectedUsers), external_emails: externals }); toast.success('Lista salva'); api.get<{ data: DistList[] }>('/distribution-lists').then(r => setLists(r.data ?? [])) }
    catch { toast.error('Erro ao salvar lista') }
  }
  const loadList = (l: DistList) => {
    setPickedCustomers((l.customer_ids ?? []).map(id => ({ id, name: customers.find(c => c.id === id)?.name ?? `#${id}` })))
    setExternals(l.external_emails ?? [])
    // os usuários serão carregados pelo efeito dos clientes; mantemos os explicitos
    setTimeout(() => setSelectedUsers(new Set(l.user_ids ?? [])), 400)
    toast.success(`Lista "${l.nome}" carregada`)
  }

  return (
    <div className="ds-card p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Tipo <span style={{ color: 'var(--danger)' }}>*</span></label>
          <select className={fieldCls} style={inputStyle} value={tipo} onChange={e => setTipo(e.target.value)}>{tipos.map(t => <option key={t.k} value={t.k}>{t.l}</option>)}</select></div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Carregar modelo de {TIPO_L[tipo]}</label>
          <select className={fieldCls} style={inputStyle} value="" onChange={e => { const t = templates.find(x => x.id === Number(e.target.value)); if (t) loadTemplate(t) }}>
            <option value="">— selecionar —</option>
            {templates.filter(t => t.tipo_comunicacao === tipo).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select></div>
      </div>

      {/* Estrutura do conteúdo — blocos controlados por tipo (usuário NÃO monta layout) */}
      <div className="rounded-xl p-3 space-y-3" style={{ border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-bold inline-flex items-center gap-1.5" style={{ color: 'var(--text)' }}><PenLine size={14} /> Conteúdo · {TIPO_L[tipo]}</div>
          <button onClick={saveTemplate} className="text-[11px] inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}><Bookmark size={11} /> Salvar como modelo</button>
        </div>

        {isMkt ? (
          <>
            <EmailHero title={title} onTitle={setTitle} subtitle={subtitle} onSubtitle={setSubtitle} badge={badge} onBadge={setBadge} />
            <EmailSection label="Intro" hint="Texto curto inicial." initialHtml={init.intro ?? ''} onRegister={registerEditor('intro')} formKey={formKey} minHeight={70} />
            <EmailSection label="Problema / cenário" hint="Descreva o cenário que motiva a ação." initialHtml={init.problema ?? ''} onRegister={registerEditor('problema')} formKey={formKey} minHeight={80} />
            <EmailBenefits benefits={benefits} onAdd={addBenefit} onRemove={removeBenefit} onRegister={id => h => { if (h) benefitRefs.current.set(id, h) }} formKey={formKey} />
            <EmailCTA label={ctaLabel} onLabel={setCtaLabel} url={ctaUrl} onUrl={setCtaUrl} required />
            <EmailSection label="Bloco de autoridade (opcional)" hint="Diferenciais / expertise ERPSERV." initialHtml={init.autoridade ?? ''} onRegister={registerEditor('autoridade')} formKey={formKey} minHeight={64} />
          </>
        ) : tipo === 'formal' ? (
          <>
            <EmailField label="Título" required value={title} onChange={setTitle} placeholder="Assunto da comunicação" />
            <EmailField label="Saudação" value={greeting} onChange={setGreeting} placeholder="Prezados," />
            <EmailSection label="Conteúdo principal" required initialHtml={init.content ?? ''} onRegister={registerEditor('content')} formKey={formKey} minHeight={130} />
            <EmailField label="Prazo (opcional)" value={prazo} onChange={setPrazo} placeholder="ex.: 30/07/2026" />
            <EmailSection label="Ação esperada (opcional)" initialHtml={init.acao_esperada ?? ''} onRegister={registerEditor('acao_esperada')} formKey={formKey} minHeight={60} />
            <EmailField label="Contato (opcional)" value={contato} onChange={setContato} placeholder="e-mail / telefone para retorno" />
          </>
        ) : (
          <>
            <EmailField label="Título" required value={title} onChange={setTitle} placeholder="Assunto do aviso" />
            <EmailSection label="Mensagem" required initialHtml={init.content ?? ''} onRegister={registerEditor('content')} formKey={formKey} minHeight={110} />
            <EmailField label="Data / Hora (opcional)" value={datahora} onChange={setDatahora} placeholder="ex.: 01/07/2026 · 08h às 18h" />
            <EmailField label="Observação (opcional)" value={observacao} onChange={setObservacao} placeholder="nota adicional" maxLength={300} />
          </>
        )}

        <div className="rounded-lg p-2.5" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          <label className="flex items-center gap-2 text-[12px] font-bold cursor-pointer" style={{ color: 'var(--text)' }}>
            <input type="checkbox" checked={sigEnabled} onChange={e => setSigEnabled(e.target.checked)} /> Incluir assinatura padrão
          </label>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-light)' }}>Usa a sua assinatura cadastrada no perfil (ou a da empresa, se você não tiver). Cadastre em Usuários → seu perfil → Assinatura.</p>
        </div>
        <EmailFooter />
      </div>

      {/* Destinatários */}
      <div className="rounded-xl p-3 space-y-3" style={{ border: '1px solid var(--border)' }}>
        <div className="text-[12px] font-bold inline-flex items-center gap-1.5" style={{ color: 'var(--text)' }}><Users size={14} /> Destinatários (clientes)</div>

        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: allCustomers ? 'var(--danger)' : 'var(--text)' }}>
          <input type="checkbox" checked={allCustomers} onChange={e => setAllCustomers(e.target.checked)} />
          <span className="font-semibold">Enviar para TODOS os clientes</span> <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>(exige confirmação)</span>
        </label>

        {!allCustomers && (
          <>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Selecionar grupo de contato</label>
              <select className={fieldCls} style={inputStyle} value="" disabled={lists.length === 0} onChange={e => { const l = lists.find(x => x.id === Number(e.target.value)); if (l) loadList(l) }}>
                <option value="">{lists.length === 0 ? '— nenhum grupo salvo ainda (crie abaixo) —' : '— selecionar grupo —'}</option>
                {lists.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Carrega os destinatários salvos no grupo. Gerencie em <b>Listas de distribuição</b> (aba acima).</p>
            </div>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Clientes</label>
              <MultiSelect placeholder="Buscar clientes…" selected={pickedCustomers} onChange={setPickedCustomers} search={searchCustomers} /></div>

            {/* Um bloco por cliente com seus contatos vinculados + inclusão manual */}
            {pickedCustomers.map(c => (
              <ClientBlock key={c.id} customer={c}
                users={loadedUsers.filter(u => u.customer_id === c.id)}
                selectedUsers={selectedUsers} onToggle={toggleUser}
                onSelectAll={(on) => selectClient(loadedUsers.filter(u => u.customer_id === c.id), on)}
                onAddExternal={pushExternal}
              />
            ))}

            {/* E-mails avulsos (sem cliente) */}
            <div>
              <label className={lbl} style={{ color: 'var(--text-light)' }}>E-mails avulsos (sem cliente)</label>
              {externals.length > 0 && <div className="flex flex-wrap gap-1.5 mb-1.5">{externals.map(e => (
                <span key={e} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{e}<button onClick={() => setExternals(x => x.filter(y => y !== e))}><X size={12} /></button></span>
              ))}</div>}
              <div className="flex items-center gap-1.5">
                <input className={`${fieldCls} flex-1`} style={inputStyle} value={extInput} onChange={e => setExtInput(e.target.value)} onBlur={() => addExternal()} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExternal() } }} placeholder="email@externo.com + Enter" />
                <button onClick={addExternal} className="ds-btn-secondary text-xs px-2.5 py-1.5 rounded-lg"><Plus size={13} /></button>
              </div>
            </div>

            <button onClick={saveList} className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}><Bookmark size={12} /> Criar grupo de contato (salvar seleção acima)</button>
          </>
        )}
      </div>

      <div className="ds-card p-3 space-y-1.5">
        <div className="text-[12px] font-bold inline-flex items-center gap-1.5" style={{ color: 'var(--text)' }}><CalendarClock size={14} /> Visualização no Minutor</div>
        <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>O cliente verá este comunicado na aba <b>Comunicados</b> ao acessar o Minutor até a data de expiração (o e-mail já enviado permanece).</p>
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-semibold" style={{ color: 'var(--text-light)' }}>Expira em <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input type="date" required className="text-sm rounded-lg px-2.5 py-1.5 outline-none" style={inputStyle} value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
          {!expiresAt && <span className="text-[11px]" style={{ color: 'var(--danger)' }}>obrigatório</span>}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={doPreview} className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg"><Eye size={14} /> Prévia</button>
        <button onClick={() => send(false)} disabled={sending} className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg"><Send size={14} /> Enviar</button>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={() => setPreview(null)}>
          <div className="ds-card w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 p-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>Prévia do e-mail</div>
              <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--surface-sunken)' }}>
                {([['desktop', Monitor, 'Desktop'], ['mobile', Smartphone, 'Mobile']] as const).map(([m, Icon, t]) => (
                  <button key={m} onClick={() => setPreviewMode(m)} title={t} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md"
                    style={{ background: previewMode === m ? 'var(--primary-soft)' : 'transparent', color: previewMode === m ? 'var(--primary)' : 'var(--text-muted)', fontWeight: previewMode === m ? 600 : 400 }}>
                    <Icon size={13} /> {t}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3"><span className="text-xs px-2 py-0.5 rounded-lg whitespace-nowrap" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{preview.recipients} dest.</span><button onClick={() => setPreview(null)} style={{ color: 'var(--text-muted)' }}><X size={16} /></button></div>
            </div>
            <div className="flex-1 overflow-auto p-3 flex justify-center" style={{ background: 'var(--surface-sunken)' }}>
              <div className="transition-all" style={{ width: previewMode === 'mobile' ? 380 : 640, maxWidth: '100%' }}>
                <EmailFrame key={previewMode} html={preview.html} />
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmMass && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.6)' }}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--danger-border)' }}>
            <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'var(--danger-bg)' }}><AlertTriangle size={18} style={{ color: 'var(--danger-border)' }} /><span className="text-sm font-bold" style={{ color: 'var(--danger-border)' }}>Envio em massa</span></div>
            <div className="p-5"><p className="text-sm" style={{ color: 'var(--text)' }}>Isto enviará para <b>TODOS os clientes</b>. Tem certeza?</p></div>
            <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setConfirmMass(false)} className="text-sm px-4 py-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
              <button onClick={() => send(true)} disabled={sending} className="text-sm px-5 py-2 rounded-lg font-medium" style={{ background: 'var(--danger-border)', color: '#fff' }}>Enviar para todos</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function History() {
  const [rows, setRows] = useState<HistItem[]>([])
  useEffect(() => { api.get<{ data: HistItem[] }>('/communications').then(r => setRows(r.data ?? [])).catch(() => {}) }, [])
  const dt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <div className="ds-card p-4 space-y-2">
      {rows.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum envio realizado.</p>}
      {rows.map(c => (
        <div key={c.id} className="py-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{TIPO_L[c.tipo] ?? c.tipo}</span>
            <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{c.title}</span>
            <span className="text-[11px] ml-auto" style={{ color: 'var(--text-light)' }}>{dt(c.created_at)}</span>
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {c.customers.length ? c.customers.join(', ') : 'destinatários avulsos'} · <b>{c.recipients}</b> destinatário(s){c.sent_by ? ` · por ${c.sent_by}` : ''}
          </div>
        </div>
      ))}
    </div>
  )
}

function Templates() {
  const [rows, setRows] = useState<CommTemplate[]>([])
  const load = () => api.get<{ data: CommTemplate[] }>('/communication-templates').then(r => setRows(r.data ?? [])).catch(() => {})
  useEffect(() => { load() }, [])
  const del = async (t: CommTemplate) => { if (!confirm(`Excluir o modelo "${t.nome}"?`)) return; try { await api.delete(`/communication-templates/${t.id}`); load() } catch { toast.error('Erro') } }
  return (
    <div className="ds-card p-4 space-y-2">
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Modelos de mensagem reutilizáveis (carregue-os na aba “Novo envio”). Salve um novo modelo lá pelo botão “Salvar como modelo”.</p>
      {rows.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum modelo salvo.</p>}
      {rows.map(t => (
        <div key={t.id} className="flex items-center gap-2 py-2 border-t text-sm" style={{ borderColor: 'var(--border)' }}>
          <Bookmark size={14} style={{ color: 'var(--primary)' }} />
          <span className="font-medium flex-1 truncate" style={{ color: 'var(--text)' }}>{t.nome}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{TIPO_L[t.tipo_comunicacao] ?? t.tipo_comunicacao}</span>
          <button onClick={() => del(t)}><Trash2 size={14} style={{ color: 'var(--danger-border)' }} /></button>
        </div>
      ))}
    </div>
  )
}

function Lists() {
  const [rows, setRows] = useState<DistList[]>([])
  const load = () => api.get<{ data: DistList[] }>('/distribution-lists').then(r => setRows(r.data ?? [])).catch(() => {})
  useEffect(() => { load() }, [])
  const del = async (l: DistList) => { if (!confirm(`Excluir a lista "${l.nome}"?`)) return; try { await api.delete(`/distribution-lists/${l.id}`); load() } catch { toast.error('Erro') } }
  return (
    <div className="ds-card p-4 space-y-2">
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Listas reutilizáveis (carregue-as na aba “Novo envio”).</p>
      {rows.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma lista salva.</p>}
      {rows.map(l => (
        <div key={l.id} className="flex items-center gap-2 py-2 border-t text-sm" style={{ borderColor: 'var(--border)' }}>
          <Bookmark size={14} style={{ color: 'var(--primary)' }} />
          <span className="font-medium flex-1 truncate" style={{ color: 'var(--text)' }}>{l.nome}</span>
          <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{(l.customer_ids?.length ?? 0)} cliente(s) · {(l.user_ids?.length ?? 0)} contato(s) · {(l.external_emails?.length ?? 0)} externo(s)</span>
          <button onClick={() => del(l)}><Trash2 size={14} style={{ color: 'var(--danger-border)' }} /></button>
        </div>
      ))}
    </div>
  )
}
