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
import { SearchSelect } from '@/components/ui/search-select'
import {
  EmailHero, EmailSection, EmailField, EmailBenefits, EmailCTA, EmailFooter,
  inputStyle, fieldCls, lbl,
} from '@/components/communication/email-blocks'
import { Send, Eye, X, Bookmark, Megaphone, History as HistoryIcon, Users, Trash2, Plus, AlertTriangle, CalendarClock, Monitor, Smartphone, PenLine } from 'lucide-react'

const MANAGERS = ['admin', 'coordenador', 'administrativo']
const TIPOS = [{ k: 'aviso', l: 'Aviso' }, { k: 'formal', l: 'Comunicação formal' }, { k: 'marketing', l: 'Marketing' }]
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
  const [tab, setTab] = useState<'novo' | 'historico' | 'listas' | 'grupos' | 'modelos'>('novo')
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
          {([['novo', 'Novo envio'], ['historico', 'Histórico'], ['listas', 'Listas de distribuição'], ['grupos', 'Grupos'], ['modelos', 'Modelos']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className="text-sm px-3 py-1.5 rounded-lg" style={{ background: tab === k ? 'var(--primary-soft)' : 'transparent', color: tab === k ? 'var(--primary)' : 'var(--text-muted)', fontWeight: tab === k ? 600 : 400 }}>{l}</button>
          ))}
        </div>

        {tab === 'novo' && <Compose />}
        {tab === 'historico' && <History />}
        {tab === 'listas' && <Lists />}
        {tab === 'grupos' && <Groups />}
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
  const [groupsC, setGroupsC] = useState<GroupRow[]>([])
  const [templates, setTemplates] = useState<CommTemplate[]>([])
  const [preview, setPreview] = useState<{ html: string; recipients: number } | null>(null)
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')

  const isMkt = tipo === 'marketing'
  const addBenefit = () => setBenefits(b => [...b, { id: benefitSeq.current++, html: '' }])
  const removeBenefit = (id: number) => { benefitRefs.current.delete(id); setBenefits(b => b.filter(x => x.id !== id)) }
  const [confirmMass, setConfirmMass] = useState(false)
  const [listModal, setListModal] = useState(false)
  const [listName, setListName] = useState('')
  const [savingList, setSavingList] = useState(false)
  const [sending, setSending] = useState(false)

  const loadTemplates = useCallback(() => api.get<{ data: CommTemplate[] }>('/communication-templates').then(r => setTemplates(r.data ?? [])).catch(() => {}), [])
  useEffect(() => {
    api.get<{ data: { customers: Customer[] } }>('/communications/meta').then(r => setCustomers(r.data?.customers ?? [])).catch(() => {})
    api.get<{ data: DistList[] }>('/distribution-lists').then(r => setLists(r.data ?? [])).catch(() => {})
    api.get<{ data: GroupRow[] }>('/communication-groups').then(r => setGroupsC(r.data ?? [])).catch(() => {})
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
  const saveList = () => { setListName(''); setListModal(true) }
  const confirmSaveList = async () => {
    const nome = listName.trim()
    if (!nome || savingList) return
    setSavingList(true)
    try {
      await api.post('/distribution-lists', { nome, customer_ids: pickedCustomers.map(c => c.id), user_ids: Array.from(selectedUsers), external_emails: externals })
      toast.success('Lista salva'); setListModal(false)
      api.get<{ data: DistList[] }>('/distribution-lists').then(r => setLists(r.data ?? []))
    } catch { toast.error('Erro ao salvar lista') }
    finally { setSavingList(false) }
  }
  const loadList = (l: DistList) => {
    setPickedCustomers((l.customer_ids ?? []).map(id => ({ id, name: customers.find(c => c.id === id)?.name ?? `#${id}` })))
    setExternals(l.external_emails ?? [])
    // os usuários serão carregados pelo efeito dos clientes; mantemos os explicitos
    setTimeout(() => setSelectedUsers(new Set(l.user_ids ?? [])), 400)
    toast.success(`Lista "${l.nome}" carregada`)
  }
  const loadGroup = async (id: number) => {
    try {
      const r = await api.get<{ data: { customer_ids: number[]; user_ids: number[]; external_emails: string[] } }>(`/communication-groups/${id}/resolve`)
      const d = r.data
      setPickedCustomers((d.customer_ids ?? []).map(cid => ({ id: cid, name: customers.find(c => c.id === cid)?.name ?? `#${cid}` })))
      setExternals(d.external_emails ?? [])
      setTimeout(() => setSelectedUsers(new Set(d.user_ids ?? [])), 400)
      toast.success(`Grupo "${groupsC.find(g => g.id === id)?.nome ?? ''}" carregado`)
    } catch { toast.error('Erro ao carregar grupo') }
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
            {(lists.length > 0 || groupsC.length > 0) && (
              <div className="grid grid-cols-2 gap-3">
                {lists.length > 0 && (
                  <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Carregar lista de distribuição</label>
                    <select className={fieldCls} style={inputStyle} value="" onChange={e => { const l = lists.find(x => x.id === Number(e.target.value)); if (l) loadList(l) }}>
                      <option value="">— selecionar —</option>{lists.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                    </select></div>
                )}
                {groupsC.length > 0 && (
                  <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Carregar grupo (blocos)</label>
                    <select className={fieldCls} style={inputStyle} value="" onChange={e => { const id = Number(e.target.value); if (id) loadGroup(id) }}>
                      <option value="">— selecionar —</option>{groupsC.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
                    </select></div>
                )}
              </div>
            )}
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

            <button onClick={saveList} className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}><Bookmark size={12} /> Salvar seleção como lista</button>
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
      {listModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.6)' }} onClick={() => !savingList && setListModal(false)}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4" style={{ background: 'var(--primary-soft)', borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2"><Bookmark size={18} style={{ color: 'var(--primary)' }} /><span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>Salvar lista de distribuição</span></div>
              <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>Reutilize esses destinatários depois na aba <b>Listas de distribuição</b>.</p>
            </div>
            <div className="p-5">
              <label className={lbl} style={{ color: 'var(--text-light)' }}>Nome da lista <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                autoFocus
                className={fieldCls}
                style={inputStyle}
                value={listName}
                onChange={e => setListName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmSaveList() } else if (e.key === 'Escape') { setListModal(false) } }}
                placeholder="Ex.: Clientes ativos ERPSERV"
              />
            </div>
            <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setListModal(false)} className="text-sm px-4 py-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
              <button onClick={confirmSaveList} disabled={!listName.trim() || savingList} className="text-sm px-5 py-2 rounded-lg font-medium" style={{ background: 'var(--primary)', color: 'var(--primary-fg)', opacity: (!listName.trim() || savingList) ? 0.5 : 1 }}>{savingList ? 'Salvando…' : 'Salvar lista'}</button>
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
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [hasStructure, setHasStructure] = useState(false)
  const [saving, setSaving] = useState(false)
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('aviso')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<{ html: string; nome: string } | null>(null)
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [viewingId, setViewingId] = useState<number | null>(null)
  const load = () => api.get<{ data: CommTemplate[] }>('/communication-templates').then(r => setRows(r.data ?? [])).catch(() => {})
  useEffect(() => { load() }, [])
  const del = async (t: CommTemplate) => { if (!confirm(`Excluir o modelo "${t.nome}"?`)) return; try { await api.delete(`/communication-templates/${t.id}`); load() } catch { toast.error('Erro') } }
  // Prévia do modelo com o MESMO render do envio (/communications/preview).
  const view = async (t: CommTemplate) => {
    const structure = (t.structure && Object.keys(t.structure).length > 0) ? t.structure : { content: t.message ?? '' }
    setViewingId(t.id)
    try {
      const r = await api.post<{ data: { html: string } }>('/communications/preview', {
        tipo_comunicacao: t.tipo_comunicacao, title: (t.title || t.nome || '').trim(),
        structure, customer_ids: [], user_ids: [], external_emails: [], all_customers: false, expires_at: null,
      })
      setPreview({ html: r.data?.html ?? '', nome: t.nome })
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? 'Não foi possível gerar a prévia deste modelo.')
    } finally { setViewingId(null) }
  }
  const resetForm = () => { setNome(''); setTipo('aviso'); setTitle(''); setMessage(''); setEditingId(null); setHasStructure(false) }
  const closeForm = () => { resetForm(); setCreating(false) }
  const startNew = () => { resetForm(); setCreating(true) }
  const startEdit = (t: CommTemplate) => {
    setEditingId(t.id)
    setNome(t.nome)
    setTipo(t.tipo_comunicacao || 'aviso')
    setTitle(t.title ?? '')
    setMessage(t.message ?? t.structure?.content ?? '')
    setHasStructure(!!t.structure && Object.keys(t.structure).length > 0)
    setCreating(true)
  }
  const save = async () => {
    if (!nome.trim()) { toast.error('Informe o nome do modelo'); return }
    setSaving(true)
    try {
      const payload = { nome: nome.trim(), tipo_comunicacao: tipo, title: title.trim(), message: message.trim() }
      if (editingId) {
        await api.put(`/communication-templates/${editingId}`, payload)
        toast.success('Modelo atualizado')
      } else {
        await api.post('/communication-templates', payload)
        toast.success('Modelo salvo')
      }
      closeForm(); load()
    } catch { toast.error(editingId ? 'Erro ao atualizar modelo' : 'Erro ao salvar modelo') } finally { setSaving(false) }
  }
  const fieldCls = 'w-full rounded-lg px-3 py-2 text-sm ds-input'
  return (
    <div className="ds-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs flex-1" style={{ color: 'var(--text-muted)' }}>Modelos de mensagem reutilizáveis (carregue-os na aba “Novo envio”). Crie um aqui em “Incluir modelo”, ou pela aba “Novo envio” no botão “Salvar como modelo” (que preserva toda a formatação rica).</p>
        <button onClick={() => creating ? closeForm() : startNew()} className="ds-btn-primary text-xs inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1.5">
          {creating ? <X size={13} /> : <Plus size={13} />}{creating ? 'Cancelar' : 'Incluir modelo'}
        </button>
      </div>
      {creating && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-[11px] font-semibold" style={{ color: 'var(--text)' }}>{editingId ? 'Editar modelo' : 'Novo modelo'}</p>
          {editingId && hasStructure && (
            <p className="text-[11px]" style={{ color: 'var(--warning)' }}>Este modelo tem formatação rica (blocos/CTA). Edite aqui nome, tipo e título; para alterar o conteúdo rico, carregue-o na aba “Novo envio” e use “Salvar como modelo”.</p>
          )}
          <div className="grid gap-2" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)' }}>
            <div><label className="text-[11px]" style={{ color: 'var(--text-light)' }}>Nome do modelo *</label>
              <input className={fieldCls} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Aviso de manutenção" /></div>
            <div><label className="text-[11px]" style={{ color: 'var(--text-light)' }}>Tipo</label>
              <select className={fieldCls} value={tipo} onChange={e => setTipo(e.target.value)}>
                {TIPOS.map(t => <option key={t.k} value={t.k}>{t.l}</option>)}
              </select></div>
          </div>
          <div><label className="text-[11px]" style={{ color: 'var(--text-light)' }}>Título</label>
            <input className={fieldCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Título da comunicação" /></div>
          <div><label className="text-[11px]" style={{ color: 'var(--text-light)' }}>Mensagem</label>
            <textarea className={fieldCls} rows={5} value={message} onChange={e => setMessage(e.target.value)} placeholder="Conteúdo do modelo…" /></div>
          <div className="flex justify-end gap-2">
            <button onClick={closeForm} className="ds-btn-secondary text-xs px-3 py-1.5">Cancelar</button>
            <button onClick={save} disabled={saving} className="ds-btn-primary text-xs px-3 py-1.5 disabled:opacity-60">{saving ? 'Salvando…' : (editingId ? 'Salvar alterações' : 'Salvar modelo')}</button>
          </div>
        </div>
      )}
      {rows.length === 0 && !creating && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum modelo salvo.</p>}
      {rows.map(t => (
        <div key={t.id} className="flex items-center gap-2 py-2 border-t text-sm" style={{ borderColor: 'var(--border)' }}>
          <Bookmark size={14} style={{ color: 'var(--primary)' }} />
          <span className="font-medium flex-1 truncate" style={{ color: 'var(--text)' }}>{t.nome}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{TIPO_L[t.tipo_comunicacao] ?? t.tipo_comunicacao}</span>
          <button onClick={() => view(t)} disabled={viewingId === t.id} title="Visualizar modelo"><Eye size={15} style={{ color: viewingId === t.id ? 'var(--text-light)' : 'var(--primary)' }} /></button>
          <button onClick={() => startEdit(t)} title="Editar modelo"><PenLine size={14} style={{ color: 'var(--text-muted)' }} /></button>
          <button onClick={() => del(t)} title="Excluir modelo"><Trash2 size={14} style={{ color: 'var(--danger-border)' }} /></button>
        </div>
      ))}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={() => setPreview(null)}>
          <div className="ds-card w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 p-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>Prévia · {preview.nome}</div>
              <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--surface-sunken)' }}>
                {([['desktop', Monitor, 'Desktop'], ['mobile', Smartphone, 'Mobile']] as const).map(([m, Icon, t]) => (
                  <button key={m} onClick={() => setPreviewMode(m)} title={t} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md"
                    style={{ background: previewMode === m ? 'var(--primary-soft)' : 'transparent', color: previewMode === m ? 'var(--primary)' : 'var(--text-muted)', fontWeight: previewMode === m ? 600 : 400 }}>
                    <Icon size={13} /> {t}
                  </button>
                ))}
              </div>
              <button onClick={() => setPreview(null)} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-auto p-3 flex justify-center" style={{ background: 'var(--surface-sunken)' }}>
              <div className="transition-all" style={{ width: previewMode === 'mobile' ? 380 : 640, maxWidth: '100%' }}>
                <EmailFrame key={previewMode} html={preview.html} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface GroupRow { id: number; nome: string; blocks_count: number; recipients_count: number }
interface GRecipient { id?: number; user_id: number | null; email: string; name: string | null; kind: 'cadastrado' | 'manual' }
interface GBlock { id: number; customer_id: number | null; customer_name: string | null; label: string | null; recipients: GRecipient[] }
interface GroupDetail { id: number; nome: string; blocks: GBlock[] }

function GroupBlock({ groupId, block, onChange, onDeleted, onCopy }: {
  groupId: number; block: GBlock; onChange: (b: GBlock) => void; onDeleted: () => void; onCopy: () => void
}) {
  const [users, setUsers] = useState<CustUser[]>([])
  const [manual, setManual] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!block.customer_id) { setUsers([]); return }
    api.get<{ data: CustUser[] }>(`/communications/customer-users?customer_ids[]=${block.customer_id}`).then(r => setUsers(r.data ?? [])).catch(() => setUsers([]))
  }, [block.customer_id])

  const emails = new Set(block.recipients.map(r => r.email.toLowerCase()))
  const manuals = block.recipients.filter(r => r.kind === 'manual')

  const save = async (recipients: GRecipient[]) => {
    setSaving(true)
    try { const r = await api.put<{ data: GBlock }>(`/communication-groups/${groupId}/blocks/${block.id}`, { recipients }); onChange(r.data) }
    catch { toast.error('Erro ao salvar bloco') }
    finally { setSaving(false) }
  }

  const toggleUser = (u: CustUser) => {
    const em = u.email.toLowerCase()
    const next: GRecipient[] = emails.has(em)
      ? block.recipients.filter(r => r.email.toLowerCase() !== em)
      : [...block.recipients, { user_id: u.id, email: u.email, name: u.name, kind: 'cadastrado' }]
    save(next)
  }
  const addManual = () => {
    const e = manual.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { toast.error('E-mail inválido'); return }
    if (emails.has(e)) { setManual(''); return }
    save([...block.recipients, { user_id: null, email: e, name: null, kind: 'manual' }]); setManual('')
  }
  const removeRecipient = (email: string) => save(block.recipients.filter(r => r.email.toLowerCase() !== email.toLowerCase()))

  const allChecked = users.length > 0 && users.every(u => emails.has(u.email.toLowerCase()))
  const toggleAll = () => {
    if (allChecked) save(block.recipients.filter(r => !users.some(u => u.email.toLowerCase() === r.email.toLowerCase())))
    else { const add: GRecipient[] = users.filter(u => !emails.has(u.email.toLowerCase())).map(u => ({ user_id: u.id, email: u.email, name: u.name, kind: 'cadastrado' })); save([...block.recipients, ...add]) }
  }

  return (
    <div className="ds-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Users size={15} style={{ color: 'var(--primary)' }} />
        <span className="text-sm font-bold flex-1 truncate" style={{ color: 'var(--text)' }}>{block.customer_name ?? block.label ?? 'Bloco'}</span>
        <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{block.recipients.length} e-mail(s){saving ? ' · salvando…' : ''}</span>
        <button onClick={onCopy} title="Copiar bloco para outro grupo" className="text-[11px] px-2 py-1 rounded-md" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>Copiar →</button>
        <button onClick={() => { if (confirm('Remover este bloco?')) api.delete(`/communication-groups/${groupId}/blocks/${block.id}`).then(onDeleted).catch(() => toast.error('Erro')) }}><Trash2 size={14} style={{ color: 'var(--danger-border)' }} /></button>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>E-mails cadastrados</span>
          {users.length > 0 && <button onClick={toggleAll} className="text-[11px]" style={{ color: 'var(--primary)' }}>{allChecked ? 'Desmarcar todos' : 'Marcar todos'}</button>}
        </div>
        {users.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum e-mail cadastrado para este cliente.</p>}
        <div className="grid gap-1 mt-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {users.map(u => (
            <label key={u.id} className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={emails.has(u.email.toLowerCase())} onChange={() => toggleUser(u)} />
              <span className="truncate" style={{ color: 'var(--text)' }}>{u.name} <span style={{ color: 'var(--text-light)' }}>· {u.email}</span></span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>E-mails manuais (sem cadastro)</span>
        <div className="flex gap-1 mt-1">
          <input className={fieldCls} style={inputStyle} placeholder="email@cliente.com" value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManual() } }} />
          <button onClick={addManual} className="shrink-0 px-3 rounded-lg text-sm" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>Add</button>
        </div>
        {manuals.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {manuals.map(r => (
              <span key={r.email} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-hover)', color: 'var(--text)' }}>
                {r.email}<button onClick={() => removeRecipient(r.email)}><X size={11} /></button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Groups() {
  const [rows, setRows] = useState<GroupRow[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selId, setSelId] = useState<number | null>(null)
  const [detail, setDetail] = useState<GroupDetail | null>(null)
  const [newName, setNewName] = useState('')
  const [addCust, setAddCust] = useState('')
  const [copyFrom, setCopyFrom] = useState<GBlock | null>(null)
  const [copyTarget, setCopyTarget] = useState('')

  const loadRows = useCallback(() => api.get<{ data: GroupRow[] }>('/communication-groups').then(r => setRows(r.data ?? [])).catch(() => {}), [])
  useEffect(() => { loadRows(); api.get<{ data: { customers: Customer[] } }>('/communications/meta').then(r => setCustomers(r.data?.customers ?? [])).catch(() => {}) }, [loadRows])

  const openGroup = useCallback((id: number) => { setSelId(id); api.get<{ data: GroupDetail }>(`/communication-groups/${id}`).then(r => setDetail(r.data)).catch(() => toast.error('Erro ao abrir grupo')) }, [])

  const createGroup = async () => {
    const nome = newName.trim(); if (!nome) return
    try { const r = await api.post<{ data: { id: number } }>('/communication-groups', { nome }); setNewName(''); await loadRows(); openGroup(r.data.id) } catch { toast.error('Erro ao criar grupo') }
  }
  const delGroup = async (g: GroupRow) => { if (!confirm(`Excluir o grupo "${g.nome}" e todos os blocos?`)) return; try { await api.delete(`/communication-groups/${g.id}`); if (selId === g.id) { setSelId(null); setDetail(null) } loadRows() } catch { toast.error('Erro') } }

  const addBlock = async () => {
    if (!detail || !addCust) return
    try { const r = await api.post<{ data: GBlock }>(`/communication-groups/${detail.id}/blocks`, { customer_id: Number(addCust) }); setDetail(d => d ? { ...d, blocks: [...d.blocks, r.data] } : d); setAddCust(''); loadRows() } catch { toast.error('Erro ao adicionar bloco') }
  }
  const onBlockChange = (b: GBlock) => { setDetail(d => d ? { ...d, blocks: d.blocks.map(x => x.id === b.id ? b : x) } : d); loadRows() }
  const onBlockDeleted = (id: number) => { setDetail(d => d ? { ...d, blocks: d.blocks.filter(x => x.id !== id) } : d); loadRows() }

  const doCopy = async () => {
    if (!detail || !copyFrom || !copyTarget) return
    try { await api.post(`/communication-groups/${detail.id}/blocks/${copyFrom.id}/copy`, { target_group_id: Number(copyTarget) }); toast.success('Bloco copiado'); setCopyFrom(null); setCopyTarget(''); loadRows() }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao copiar bloco') }
  }

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(200px, 260px) 1fr' }}>
      <div className="ds-card p-3 space-y-2 self-start">
        <div className="flex gap-1">
          <input className={fieldCls} style={inputStyle} placeholder="Novo grupo…" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createGroup() }} />
          <button onClick={createGroup} className="shrink-0 px-2 rounded-lg" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={16} /></button>
        </div>
        {rows.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum grupo ainda.</p>}
        {rows.map(g => (
          <div key={g.id} onClick={() => openGroup(g.id)} className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer" style={{ background: selId === g.id ? 'var(--primary-soft)' : 'transparent' }}>
            <Users size={14} style={{ color: 'var(--primary)' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: selId === g.id ? 'var(--primary)' : 'var(--text)' }}>{g.nome}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>{g.blocks_count} bloco(s) · {g.recipients_count} e-mail(s)</p>
            </div>
            <button onClick={e => { e.stopPropagation(); delGroup(g) }}><Trash2 size={13} style={{ color: 'var(--danger-border)' }} /></button>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {!detail && <div className="ds-card p-6 text-sm text-center" style={{ color: 'var(--text-muted)' }}>Selecione ou crie um grupo. Cada grupo é organizado em <b>blocos por cliente</b> — puxe os e-mails já cadastrados ou adicione manuais.</div>}
        {detail && (
          <>
            <div className="ds-card p-3 flex items-center gap-2 flex-wrap">
              <div style={{ minWidth: 260, maxWidth: 360, flex: 1 }}>
                <SearchSelect
                  placeholder="+ Adicionar bloco de cliente…"
                  value={addCust}
                  onChange={v => setAddCust(v)}
                  options={customers.filter(c => !detail.blocks.some(b => b.customer_id === c.id)).map(c => ({ id: c.id, name: c.name }))}
                />
              </div>
              <button onClick={addBlock} disabled={!addCust} className="text-sm px-3 py-1.5 rounded-lg font-medium" style={{ background: 'var(--primary-soft)', color: 'var(--primary)', opacity: addCust ? 1 : .5 }}>Adicionar bloco</button>
            </div>
            {detail.blocks.length === 0 && <div className="ds-card p-4 text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum bloco. Adicione um cliente acima.</div>}
            {detail.blocks.map(b => (
              <GroupBlock key={b.id} groupId={detail.id} block={b} onChange={onBlockChange} onDeleted={() => onBlockDeleted(b.id)} onCopy={() => { setCopyFrom(b); setCopyTarget('') }} />
            ))}
          </>
        )}
      </div>

      {copyFrom && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.6)' }} onClick={() => setCopyFrom(null)}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4" style={{ background: 'var(--primary-soft)', borderBottom: '1px solid var(--border)' }}><span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>Copiar bloco “{copyFrom.customer_name ?? copyFrom.label}”</span></div>
            <div className="p-5">
              <label className={lbl} style={{ color: 'var(--text-light)' }}>Para qual grupo?</label>
              <select className={fieldCls} style={inputStyle} value={copyTarget} onChange={e => setCopyTarget(e.target.value)}>
                <option value="">— selecionar grupo —</option>
                {rows.filter(g => g.id !== detail?.id).map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </select>
            </div>
            <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setCopyFrom(null)} className="text-sm px-4 py-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
              <button onClick={doCopy} disabled={!copyTarget} className="text-sm px-5 py-2 rounded-lg font-medium" style={{ background: 'var(--primary)', color: 'var(--primary-fg)', opacity: copyTarget ? 1 : .5 }}>Copiar</button>
            </div>
          </div>
        </div>
      )}
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
