'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, Bell, Send, CheckCircle, AlertTriangle, Loader2, Users } from 'lucide-react'
import { api, apiMessage } from '@/lib/api'
import { toast } from 'sonner'

interface HoursAlert {
  id: number
  band: number
  percentual: number | string
  available: number | string
  consumed: number | string
  approved: number | string | null
  balance: number | string
  basis: string | null
  classification: string | null
  recipients_to: string[] | null
  recipients_cc: string[] | null
  status: string
  error: string | null
  sent_at: string | null
  created_at: string
}

interface CurrentMetrics {
  available: number; consumed: number; approved: number; balance: number; percentual: number; basis: string
}

interface AlertContact {
  id: number; name: string; email: string | null; cargo: string | null; recebe_alerta_consumo: boolean
}

interface PreviewField { label: string; value: string }
interface Preview { band: number; fields: PreviewField[]; subject?: string; html?: string; recipients?: { to: string[]; cc: string[] } }

interface ExtraEmail { id: number; email: string }
interface CustomerContactOpt { id: number; name: string; email: string; cargo: string | null }

interface Payload {
  enabled: boolean
  contract_id: number | null
  current: CurrentMetrics | null
  preview: Preview | null
  contacts: AlertContact[]
  extra_emails?: ExtraEmail[]
  customer_contacts?: CustomerContactOpt[]
  alerts: HoursAlert[]
}

interface Props {
  /** Use projectId (Gestão de Contratos) OU contractId. */
  projectId?: number | null
  contractId?: number | null
  contractLabel?: string
  isAdmin?: boolean
  onClose: () => void
}

const STATUS_META: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  sent:         { label: 'Enviado',          color: '#22C55E', icon: CheckCircle },
  failed:       { label: 'Falha no envio',   color: '#EF4444', icon: AlertTriangle },
  no_recipient: { label: 'Sem destinatário', color: '#F97316', icon: AlertTriangle },
  pending:      { label: 'Pendente',         color: '#94A3B8', icon: AlertTriangle },
}

const num = (v: number | string | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' h'

const fmtDate = (s: string | null) =>
  !s ? '—' : new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function HoursAlertsModal({ projectId, contractId, contractLabel, isAdmin, onClose }: Props) {
  const open = !!projectId || !!contractId
  const base = projectId ? `/projects/${projectId}/hours-alerts` : `/contracts/${contractId}/hours-alerts`

  const [loading, setLoading] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [current, setCurrent] = useState<CurrentMetrics | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [contacts, setContacts] = useState<AlertContact[]>([])
  const [extraEmails, setExtraEmails] = useState<string[]>([])
  const [customerContacts, setCustomerContacts] = useState<CustomerContactOpt[]>([])
  const [pendingImports, setPendingImports] = useState<number[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [importSearch, setImportSearch] = useState('')
  const [newContacts, setNewContacts] = useState<{ name: string; email: string }[]>([])
  const [ncName, setNcName] = useState('')
  const [ncEmail, setNcEmail] = useState('')
  const [alerts, setAlerts] = useState<HoursAlert[]>([])
  const [resendingId, setResendingId] = useState<number | null>(null)
  const [savingFlag, setSavingFlag] = useState(false)
  const [savingContacts, setSavingContacts] = useState(false)
  const [sending, setSending] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const apply = (r: Payload) => {
    setEnabled(!!r.enabled); setCurrent(r.current); setPreview(r.preview); setContacts(r.contacts ?? []); setAlerts(r.alerts ?? [])
    setExtraEmails((r.extra_emails ?? []).map(x => x.email))
    setCustomerContacts(r.customer_contacts ?? [])
    setPendingImports([])
    setNewEmail(''); setImportSearch(''); setNewContacts([]); setNcName(''); setNcEmail('')
  }

  const load = useCallback(async () => {
    if (!open) return
    setLoading(true)
    try { apply(await api.get<Payload>(base)) }
    catch (e) { toast.error(apiMessage(e, 'Erro ao carregar alertas')) }
    finally { setLoading(false) }
  }, [open, base])

  useEffect(() => { if (open) load() }, [open, load])

  const toggleFlag = async () => {
    setSavingFlag(true)
    try {
      const r = await api.put<{ enabled: boolean }>(`/contracts/hours-alerts/settings`, { enabled: !enabled })
      setEnabled(!!r.enabled)
      toast.success(r.enabled ? 'Alertas de consumo ativados' : 'Alertas de consumo desativados')
    } catch (e) { toast.error(apiMessage(e, 'Erro ao alterar configuração')) }
    finally { setSavingFlag(false) }
  }

  const toggleContact = (id: number) =>
    setContacts(cs => cs.map(c => c.id === id ? { ...c, recebe_alerta_consumo: !c.recebe_alerta_consumo } : c))

  const addExtraEmail = () => {
    const e = newEmail.trim()
    if (!e) return
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { toast.error('E-mail inválido'); return }
    if (extraEmails.some(x => x.toLowerCase() === e.toLowerCase())) { setNewEmail(''); return }
    setExtraEmails(l => [...l, e]); setNewEmail('')
  }
  const removeExtraEmail = (e: string) => setExtraEmails(l => l.filter(x => x !== e))

  const queueImport = (id: number) => setPendingImports(l => l.includes(id) ? l : [...l, id])
  const removeImport = (id: number) => setPendingImports(l => l.filter(x => x !== id))

  const addNewContact = () => {
    const name = ncName.trim(), email = ncEmail.trim()
    if (!name || !email) return
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast.error('E-mail inválido'); return }
    const dup = newContacts.some(c => c.email.toLowerCase() === email.toLowerCase())
      || contacts.some(c => (c.email || '').toLowerCase() === email.toLowerCase())
    if (dup) { toast.error('E-mail já é destinatário'); return }
    setNewContacts(l => [...l, { name, email }]); setNcName(''); setNcEmail('')
  }
  const removeNewContact = (email: string) => setNewContacts(l => l.filter(c => c.email !== email))

  const saveContacts = async () => {
    setSavingContacts(true)
    try {
      const r = await api.put<Payload>(`${base}/contacts`, {
        contacts: contacts.map(c => ({ id: c.id, recebe_alerta_consumo: c.recebe_alerta_consumo })),
        add_customer_contacts: pendingImports,
        new_contacts: newContacts,
        extra_emails: extraEmails,
      })
      apply(r)
      toast.success('Destinatários atualizados')
    } catch (e) { toast.error(apiMessage(e, 'Erro ao salvar destinatários')) }
    finally { setSavingContacts(false) }
  }

  // "Enviar agora" NÃO envia direto: grava os destinatários (sempre), atualiza a prévia
  // e abre o modal de confirmação com o e-mail real + para quem vai.
  const openConfirm = async () => {
    setSending(true)
    try {
      await saveContacts()   // grava a seleção (fica gravado sempre)
      await load()           // prévia + destinatários resolvidos frescos
      setConfirming(true)
    } catch (e) { toast.error(apiMessage(e, 'Erro ao preparar o envio')) }
    finally { setSending(false) }
  }

  const sendNow = async () => {
    setSending(true)
    try {
      const r = await api.post<Payload & { message: string }>(`${base}/send`, {})
      apply(r)
      toast[(r as any).alert?.status === 'sent' ? 'success' : 'error']((r as any).message ?? 'Processado')
    } catch (e) { toast.error(apiMessage(e, 'Erro ao enviar')) }
    finally { setSending(false) }
  }

  const resend = async (id: number) => {
    setResendingId(id)
    try {
      const r = await api.post<{ message: string; alert: HoursAlert }>(`${base}/${id}/resend`, {})
      toast[r.alert?.status === 'sent' ? 'success' : 'error'](r.message)
      await load()
    } catch (e) { toast.error(apiMessage(e, 'Erro ao reenviar')) }
    finally { setResendingId(null) }
  }

  if (!open) return null
  const pct = current ? Math.round(current.percentual) : null
  const anyRecipient = contacts.some(c => c.recebe_alerta_consumo)

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-2xl flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <Bell size={18} style={{ color: '#F97316' }} />
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Alertas de consumo de horas</h3>
              {contractLabel && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{contractLabel}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {/* Master flag */}
          <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Envio automático de alertas</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Configuração geral do sistema. Faixas 70/80/90/100% e a cada 10% depois.</p>
            </div>
            <button disabled={!isAdmin || savingFlag} onClick={toggleFlag}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50"
              style={{ background: enabled ? '#22C55E' : 'var(--border)' }} title={isAdmin ? '' : 'Somente administrador'}>
              <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: enabled ? 'translateX(24px)' : 'translateX(4px)' }} />
            </button>
          </div>
          {!enabled && <p className="text-xs" style={{ color: '#F97316' }}>Os alertas automáticos estão <b>desativados</b>. Você pode configurar os destinatários abaixo e usar o reenvio manual mesmo assim.</p>}

          {/* Current metrics */}
          {current && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { l: 'Limite', v: num(current.available) },
                { l: 'Consumidas', v: num(current.consumed) },
                { l: current.balance < 0 ? 'Excedente' : 'Saldo', v: num(Math.abs(current.balance)) },
                { l: '% Uso', v: pct != null ? `${pct}%` : '—' },
              ].map((k, idx) => (
                <div key={idx} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{k.l}</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: k.l === 'Excedente' ? 'var(--danger-border)' : 'var(--text)' }}>{k.v}</p>
                </div>
              ))}
            </div>
          )}

          {/* Prévia do e-mail (dados reais) + envio manual */}
          {preview && (
            <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Prévia do e-mail</p>
                <button disabled={sending} onClick={openConfirm}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                  style={{ background: '#F97316', color: '#fff' }}>
                  {sending ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />} Enviar agora
                </button>
              </div>
              {preview.html ? (
                <iframe title="Prévia do e-mail" srcDoc={preview.html} className="w-full rounded-lg bg-white" style={{ height: 340, border: '1px solid var(--border)' }} />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                  {preview.fields.map((f, idx) => (
                    <div key={idx} className="flex justify-between gap-3 py-0.5 text-[12px]" style={{ borderBottom: '1px dashed var(--border)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{f.label}</span>
                      <span className="font-medium text-right" style={{ color: 'var(--text)' }}>{f.value}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
                O envio manual dispara agora para os destinatários marcados abaixo + executivo, independente do envio automático estar ligado, e fica registrado no histórico.
              </p>
            </div>
          )}

          {/* Destinatários (contatos do contrato) */}
          <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <Users size={13} /> Destinatários (contatos que recebem)
              </p>
              <button disabled={savingContacts} onClick={saveContacts}
                className="text-xs px-2.5 py-1 rounded-lg transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>
                {savingContacts ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
            {/* Contatos do contrato (toggle) */}
            {contacts.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum contato no contrato ainda. Importe do cliente ou adicione um e-mail avulso abaixo.</p>
            ) : (
              <div className="space-y-1.5">
                {contacts.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer select-none py-0.5" style={{ color: 'var(--text)' }}>
                    <input type="checkbox" checked={c.recebe_alerta_consumo} onChange={() => toggleContact(c.id)} />
                    <span className="font-medium">{c.name || '—'}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{[c.cargo, c.email].filter(Boolean).join(' · ')}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Importar contato do cliente (busca por texto; clicar adiciona; copia p/ o contrato) */}
            {customerContacts.length > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px dashed var(--border)' }}>
                <p className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Importar contato do cliente</p>
                <input type="text" value={importSearch} onChange={e => setImportSearch(e.target.value)}
                  placeholder="Buscar por nome ou e-mail…" className="w-full text-xs px-2 py-1.5 rounded-lg" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
                {(() => {
                  const q = importSearch.trim().toLowerCase()
                  const opts = customerContacts.filter(cc => !pendingImports.includes(cc.id)
                    && (!q || `${cc.name ?? ''} ${cc.email ?? ''}`.toLowerCase().includes(q)))
                  if (!opts.length) return <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>Nenhum contato encontrado.</p>
                  return (
                    <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
                      {opts.map(cc => (
                        <button key={cc.id} type="button" onClick={() => queueImport(cc.id)}
                          className="w-full text-left text-xs px-2.5 py-1.5 flex flex-col transition-colors hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text)' }}>
                          <span className="font-medium">{cc.name}</span>
                          {cc.email && <span style={{ color: 'var(--text-muted)' }}>{cc.email}</span>}
                        </button>
                      ))}
                    </div>
                  )
                })()}
                {pendingImports.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {pendingImports.map(id => {
                      const cc = customerContacts.find(x => x.id === id)
                      return (
                        <span key={id} className="inline-flex items-center gap-1 text-[11px] pl-2 pr-1 py-0.5 rounded-md" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                          {cc?.name ?? cc?.email ?? id}
                          <button onClick={() => removeImport(id)} className="hover:opacity-70"><X size={11} /></button>
                        </span>
                      )
                    })}
                    <span className="text-[11px] self-center" style={{ color: 'var(--text-muted)' }}>a copiar ao salvar</span>
                  </div>
                )}
              </div>
            )}

            {/* Cadastrar novo contato (nome + e-mail) → vira contato do contrato */}
            <div className="mt-3 pt-3" style={{ borderTop: '1px dashed var(--border)' }}>
              <p className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Cadastrar novo contato</p>
              {newContacts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {newContacts.map(c => (
                    <span key={c.email} className="inline-flex items-center gap-1 text-[11px] pl-2 pr-1 py-0.5 rounded-md" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                      {c.name} · {c.email}
                      <button onClick={() => removeNewContact(c.email)} className="hover:opacity-70"><X size={11} /></button>
                    </span>
                  ))}
                  <span className="text-[11px] self-center" style={{ color: 'var(--text-muted)' }}>a criar ao salvar</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input type="text" value={ncName} onChange={e => setNcName(e.target.value)} placeholder="Nome"
                  className="flex-1 text-xs px-2 py-1.5 rounded-lg" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
                <input type="email" value={ncEmail} onChange={e => setNcEmail(e.target.value)} placeholder="e-mail"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNewContact() } }}
                  className="flex-1 text-xs px-2 py-1.5 rounded-lg" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
                <button onClick={addNewContact} disabled={!ncName.trim() || !ncEmail.trim()}
                  className="text-xs px-2.5 py-1.5 rounded-lg transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>Adicionar</button>
              </div>
            </div>

            {/* E-mail avulso (destinatário adicional; não vira contato) */}
            <div className="mt-3 pt-3" style={{ borderTop: '1px dashed var(--border)' }}>
              <p className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>E-mail avulso (destinatário adicional)</p>
              {extraEmails.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {extraEmails.map(e => (
                    <span key={e} className="inline-flex items-center gap-1 text-[11px] pl-2 pr-1 py-0.5 rounded-md" style={{ background: 'var(--surface-hover)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                      {e}
                      <button onClick={() => removeExtraEmail(e)} className="hover:opacity-70"><X size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtraEmail() } }}
                  placeholder="nome@empresa.com" className="flex-1 text-xs px-2 py-1.5 rounded-lg" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
                <button onClick={addExtraEmail} disabled={!newEmail.trim()}
                  className="text-xs px-2.5 py-1.5 rounded-lg transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>Adicionar</button>
              </div>
            </div>

            <p className="text-[11px] mt-3" style={{ color: 'var(--text-muted)' }}>O executivo de contas do cliente também recebe automaticamente. Clique em <strong>Salvar</strong> para gravar importações e e-mails avulsos.</p>
          </div>

          {/* History */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Histórico de alertas</p>
            {loading ? (
              <div className="flex items-center justify-center py-8" style={{ color: 'var(--text-muted)' }}><Loader2 className="animate-spin" size={18} /></div>
            ) : alerts.length === 0 ? (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--text-muted)' }}>Nenhum alerta registrado para este contrato.</p>
            ) : (
              <div className="space-y-2">
                {alerts.map(a => {
                  const sm = STATUS_META[a.status] ?? STATUS_META.pending
                  const Icon = sm.icon
                  const to = (a.recipients_to ?? []); const cc = (a.recipients_cc ?? [])
                  return (
                    <div key={a.id} className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold px-2 py-0.5 rounded-md" style={{ background: 'rgba(249,115,22,.12)', color: '#F97316' }}>{a.band}%</span>
                          <span className="text-xs" style={{ color: 'var(--text)' }}>{a.classification ?? '—'}</span>
                          <span className="inline-flex items-center gap-1 text-xs" style={{ color: sm.color }}><Icon size={13} /> {sm.label}</span>
                        </div>
                        <button disabled={resendingId === a.id} onClick={() => resend(a.id)}
                          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>
                          {resendingId === a.id ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />}
                          {a.status === 'sent' ? 'Reenviar' : 'Enviar'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        <span>Consumidas: <b style={{ color: 'var(--text)' }}>{num(a.consumed)}</b></span>
                        <span>Limite: <b style={{ color: 'var(--text)' }}>{num(a.available)}</b></span>
                        <span>%: <b style={{ color: 'var(--text)' }}>{Number(a.percentual).toFixed(0)}%</b></span>
                        <span>{a.sent_at ? `Enviado: ${fmtDate(a.sent_at)}` : `Registrado: ${fmtDate(a.created_at)}`}</span>
                      </div>
                      {(to.length > 0 || cc.length > 0) && (
                        <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>Para: {to.join(', ') || '—'}{cc.length ? ` · Cc: ${cc.join(', ')}` : ''}</p>
                      )}
                      {a.error && <p className="mt-1 text-[11px]" style={{ color: 'var(--danger-border)' }}>{a.error}</p>}
                    </div>
                  )
                })}
              </div>
            )}
            {!loading && !anyRecipient && contacts.length > 0 && (
              <p className="text-[11px] mt-2" style={{ color: '#F97316' }}>Nenhum contato marcado — só o executivo de contas receberá.</p>
            )}
          </div>
        </div>
      </div>

      {/* Confirmação de envio: prévia do e-mail REAL + para quem vai */}
      {confirming && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.6)' }}
          onClick={e => { e.stopPropagation(); setConfirming(false) }}>
          <div className="w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-2xl flex flex-col"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Confirmar envio do alerta</h3>
              {preview?.subject && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Assunto: {preview.subject}</p>}
            </div>
            <div className="overflow-y-auto p-4 space-y-3">
              <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Será enviado para</p>
                {(preview?.recipients?.to?.length || preview?.recipients?.cc?.length) ? (
                  <div className="text-xs space-y-0.5">
                    {(preview?.recipients?.to ?? []).map(em => <div key={em} style={{ color: 'var(--text)' }}>{em}</div>)}
                    {(preview?.recipients?.cc ?? []).map(em => <div key={em} style={{ color: 'var(--text-muted)' }}>{em} · em cópia</div>)}
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--danger-border)' }}>Nenhum destinatário — marque contatos e salve antes de enviar.</p>
                )}
              </div>
              {preview?.html && <iframe title="Prévia do e-mail" srcDoc={preview.html} className="w-full rounded-lg bg-white" style={{ height: 420, border: '1px solid var(--border)' }} />}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setConfirming(false)} className="text-xs px-3 py-2 rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>Cancelar</button>
              <button disabled={sending || !preview?.recipients?.to?.length} onClick={async () => { await sendNow(); setConfirming(false) }}
                className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-medium disabled:opacity-50" style={{ background: '#F97316', color: '#fff' }}>
                {sending ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />} Confirmar e enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
