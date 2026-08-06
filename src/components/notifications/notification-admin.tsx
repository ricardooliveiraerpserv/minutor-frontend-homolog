'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Trash2, Save, Pencil, Send, Eye, X, BarChart3, Users, Bookmark, RefreshCw, Repeat, Megaphone, CalendarCheck, ClipboardList, Mail, Bell, Download, ChevronDown } from 'lucide-react'
import { Compose } from '@/app/central-comunicacao/page'
import { RichEditor, type RichEditorHandle } from '@/components/help-desk/rich-editor'
import { EmailFrame } from '@/components/help-desk/email-frame'
import { MultiSelect, type MSOpt } from '@/components/notifications/multi-select'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const lbl = 'text-[11px] font-semibold block mb-0.5'

const INTERNAL_ROLES = [{ k: 'admin', l: 'Admin' }, { k: 'administrativo', l: 'Administrativo' }, { k: 'coordenador', l: 'Coordenador' }]
// Consultor deixou de ser um chip único → vira dois por VÍNCULO (work_bond): Interno | Free Lance.
const CONSULTANT_BONDS = [{ k: 'fixo', l: 'Consultor Interno' }, { k: 'freelance', l: 'Consultor Free Lance' }]

/** Chip de destinatário com seta p/ expandir os membros do grupo e RETIRAR alguns do envio. */
function RecipientChip({ label, active, onToggle, params, fetchMembers, excluded, setExcluded, chipStyle }: {
  label: string
  active: boolean
  onToggle: () => void
  params: string   // query p/ /users (ex.: 'type=admin' | 'type=consultor&work_bond=fixo' | 'contract_type=3')
  fetchMembers: (params: string) => Promise<{ id: number; name: string; sub?: string | null }[]>
  excluded: number[]
  setExcluded: (fn: (prev: number[]) => number[]) => void
  chipStyle: (on: boolean) => CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<{ id: number; name: string; sub?: string | null }[] | null>(null)
  const [loading, setLoading] = useState(false)
  const expand = async () => {
    const next = !open; setOpen(next)
    if (next && members === null) {
      setLoading(true)
      try { setMembers(await fetchMembers(params)) } catch { setMembers([]) } finally { setLoading(false) }
    }
  }
  return (
    <div className="inline-flex flex-col align-top">
      <div className="inline-flex items-center rounded-lg overflow-hidden" style={chipStyle(active)}>
        <button type="button" onClick={onToggle} className="text-xs pl-2.5 pr-1.5 py-1">{label}</button>
        <button type="button" onClick={expand} title="Ver / retirar destinatários" className="px-1 py-1" style={{ borderLeft: '1px solid rgba(0,0,0,.08)' }}>
          <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
        </button>
      </div>
      {open && (
        <div className="mt-1 rounded-lg p-2 max-h-48 overflow-auto min-w-[180px]" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          {loading && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Carregando…</p>}
          {!loading && members && members.length === 0 && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Nenhum destinatário neste grupo.</p>}
          {!active && members && members.length > 0 && <p className="text-[10px] mb-1" style={{ color: 'var(--text-light)' }}>Selecione o grupo para incluí-los.</p>}
          {members?.map(m => {
            const on = !excluded.includes(m.id)
            return (
              <label key={m.id} className="flex items-center gap-1.5 text-xs py-0.5 cursor-pointer">
                <input type="checkbox" checked={on} onChange={() => setExcluded(prev => on ? [...prev, m.id] : prev.filter(x => x !== m.id))} />
                <span style={{ textDecoration: on ? 'none' : 'line-through', opacity: on ? 1 : .5, color: 'var(--text)' }}>
                  {m.name}{m.sub ? <span style={{ color: 'var(--text-light)' }}> — {m.sub}</span> : null}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface PollOpt { id: number; label: string; order: number; votes: number; percent: number; mine: boolean }
interface PollData {
  poll_id: number; question: string; multiple_choice: boolean; allow_change_vote: boolean; show_results: boolean
  expires_at: string | null; closed: boolean; options: PollOpt[]; total_votes: number
}
interface Notif {
  id: number; title: string; message: string; type: string; priority: string
  target_roles: string[] | null; target_contract_types: string[] | null
  target_customer_id: number | null; target_customer_ids: number[] | null
  send_email: boolean; visible: boolean; requires_ack: boolean; cta_label: string | null; cta_url: string | null
  version: number; expires_at: string | null; acks_count?: number; poll?: PollData | null
  recurrence?: string; recurrence_value?: number | null; resent_at?: string | null
  is_template?: boolean; template_name?: string | null; actions?: string[] | null
}
const RECUR = [
  { k: 'none', l: 'Não repetir' },
  { k: 'every_days', l: 'A cada X dias' },
  { k: 'day_of_month', l: 'Todo dia X do mês' },
  { k: 'business_day', l: 'No Xº dia útil do mês' },
]
type Draft = Partial<Notif & { target_users: number[] }>
interface Opt { id: number; name: string }
interface UserHit { id: number; name: string; email: string; type: string }
interface Voter { user_id: number; user_name: string; user_email: string; option_id: number; option: string; voted_at: string }

// Data de expiração: input é DATA local (YYYY-MM-DD); o backend roda em UTC.
const pad2 = (n: number) => String(n).padStart(2, '0')
const todayLocal = (): string => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }
const toLocalDate = (iso?: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
// data (ou vazio = hoje) → expira às 23:59:59 LOCAL desse dia, convertido p/ UTC ISO.
const expiryIso = (dateStr: string): string => {
  const base = dateStr || todayLocal()
  const [y, m, d] = base.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59).toISOString()
}
const isPastDate = (dateStr: string): boolean => !!dateStr && dateStr < todayLocal()

export function NotificationAdmin({ onChanged, initialAction, onActionConsumed }: { onChanged?: () => void; initialAction?: string | null; onActionConsumed?: () => void }) {
  const [showComm, setShowComm] = useState(false)
  const [rows, setRows] = useState<Notif[]>([])
  const [editing, setEditing] = useState<Draft | null>(null)
  const [results, setResults] = useState<Notif | null>(null)

  // Abre o fluxo solicitado por uma ação rápida vinda de fora (Recebidas/Mural).
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current || !initialAction) return
    didInit.current = true
    if (initialAction === 'comm') setShowComm(true)
    else if (initialAction === 'presence') setEditing({ type: 'aviso', priority: 'medium', target_roles: [], version: 1, title: 'Confirmação de presença', actions: ['✅ Confirmo presença', '❌ Não poderei ir'] })
    else if (initialAction === 'poll') setEditing({ type: 'poll', priority: 'medium', target_roles: [], version: 1 })
    else if (initialAction === 'new') setEditing({ type: 'aviso', priority: 'medium', target_roles: [], version: 1 })
    onActionConsumed?.()
  }, [initialAction, onActionConsumed])
  const [logTarget, setLogTarget] = useState<Notif | null>(null)
  const [resendMenu, setResendMenu] = useState<number | null>(null)   // qual notif tem o menu de reenvio aberto
  const [tplPreview, setTplPreview] = useState<{ html: string; recipients: number } | null>(null)

  // Prévia do e-mail de um modelo (sem precisar abri-lo).
  const previewTemplate = async (t: Notif) => {
    const body: Record<string, unknown> = {
      title: t.title, message: t.message || '', type: t.type, priority: t.priority,
      target_roles: t.target_roles ?? [], target_contract_types: t.target_contract_types ?? [],
      target_customer_ids: t.target_customer_ids ?? [],
      ...(t.type === 'poll' && t.poll ? { poll: {
        question: t.poll.question, options: t.poll.options.map(o => o.label),
        multiple_choice: t.poll.multiple_choice, allow_change_vote: t.poll.allow_change_vote, show_results: t.poll.show_results,
      } } : {}),
    }
    try {
      const r = await api.post<{ data: { html: string; recipients: number } }>('/notifications/preview', body)
      setTplPreview({ html: r.data?.html ?? '', recipients: r.data?.recipients ?? 0 })
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro na prévia') }
  }
  const load = useCallback(() => { api.get<{ data: Notif[] }>('/notifications/manage').then(r => setRows(r?.data ?? [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])

  const del = async (n: Notif) => { if (!confirm(`Excluir "${n.title}"?`)) return; try { await api.delete(`/notifications/${n.id}`); load(); onChanged?.() } catch { toast.error('Erro') } }
  const resend = async (n: Notif, channel: 'email' | 'popup') => {
    setResendMenu(null)
    const desc = channel === 'popup' ? 'Reabre o pop-up para todos, SEM reenviar e-mail.' : 'Reabre para todos E dispara o e-mail novamente.'
    if (!confirm(`Reenviar "${n.title}" agora?\n\n${desc}`)) return
    try { await api.post(`/notifications/${n.id}/resend`, { channel }); toast.success(channel === 'popup' ? 'Pop-up reenviado (sem e-mail)' : 'Reenviado (e-mail + pop-up)'); load(); onChanged?.() }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao reenviar') }
  }
  // Usar um modelo → abre o form prefilled como NOVA notificação (sem id, sem flag de modelo).
  const useTemplate = (t: Notif) => setEditing({ ...t, id: undefined, is_template: false, template_name: null, target_users: (t as Draft).target_users })

  const recurLabel = (n: Notif) => n.recurrence && n.recurrence !== 'none'
    ? (n.recurrence === 'every_days' ? `a cada ${n.recurrence_value}d` : n.recurrence === 'day_of_month' ? `dia ${n.recurrence_value}` : `${n.recurrence_value}º dia útil`)
    : null

  if (editing) return <Form draft={editing} onBack={() => setEditing(null)} onSaved={() => { setEditing(null); load(); onChanged?.() }} />

  const notifs = rows.filter(n => !n.is_template)
  const templates = rows.filter(n => n.is_template)

  return (
    <div className="ds-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Gerenciar notificações</span>
        <div className="flex items-center gap-2">
          <button className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => setShowComm(true)} title="Aviso / Comunicação formal para clientes (sem marketing)"><Megaphone size={15} /> Comunicação com cliente</button>
          <button className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" title="Notificação com botões de decisão (você nomeia) + log de quem clicou" onClick={() => setEditing({
            type: 'info', priority: 'medium', target_roles: [], version: 1,
            title: 'Confirmação de presença',
            actions: ['✅ Confirmo presença', '❌ Não poderei ir'],
          })}><CalendarCheck size={15} /> Confirmar presença</button>
          <button className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => setEditing({ type: 'poll', priority: 'medium', target_roles: [], version: 1 })}><BarChart3 size={15} /> Nova enquete</button>
          <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => setEditing({ type: 'info', priority: 'medium', target_roles: [], version: 1 })}><Plus size={15} /> Novo Aviso</button>
        </div>
      </div>
      <div className="space-y-1.5">
        {notifs.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhuma notificação publicada.</p>}
        {notifs.map(n => (
          <div key={n.id} className="flex items-center gap-2 text-sm py-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
            <span className="font-medium flex-1 truncate" style={{ color: 'var(--text)' }}>{n.title}</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{n.type}</span>
            <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{n.priority}</span>
            {recurLabel(n) && <span className="text-[11px] inline-flex items-center gap-0.5" style={{ color: 'var(--primary)' }}><Repeat size={11} /> {recurLabel(n)}</span>}
            {n.requires_ack && <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· {n.acks_count ?? 0} aceite(s)</span>}
            {n.type === 'poll' && n.poll && <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· {n.poll.total_votes} voto(s)</span>}
            {!!n.actions?.length && <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· {n.actions.length} botão(ões)</span>}
            {n.type === 'poll' && <button className="ml-2" title="Resultados" onClick={() => setResults(n)}><BarChart3 size={15} style={{ color: 'var(--primary)' }} /></button>}
            <button className={n.type === 'poll' ? '' : 'ml-2'} title="Log: quem viu e o que respondeu" onClick={() => setLogTarget(n)}><ClipboardList size={15} style={{ color: 'var(--primary)' }} /></button>
            <div className="relative">
              <button title="Reenviar agora" onClick={() => setResendMenu(resendMenu === n.id ? null : n.id)}><RefreshCw size={14} style={{ color: 'var(--primary)' }} /></button>
              {resendMenu === n.id && (
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setResendMenu(null)} />
                  <div className="absolute right-0 top-full mt-1 z-[61] rounded-lg p-1 shadow-xl min-w-[190px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="text-[10px] px-2.5 pt-1 pb-0.5 uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Reenviar como</div>
                    <button className="w-full text-left text-[12px] px-2.5 py-2 rounded-md flex items-center gap-2 ds-row-hover" style={{ color: 'var(--text)' }} onClick={() => resend(n, 'email')}><Mail size={13} style={{ color: 'var(--primary)' }} /> E-mail + pop-up</button>
                    <button className="w-full text-left text-[12px] px-2.5 py-2 rounded-md flex items-center gap-2 ds-row-hover" style={{ color: 'var(--text)' }} onClick={() => resend(n, 'popup')}><Bell size={13} style={{ color: 'var(--primary)' }} /> Somente pop-up</button>
                  </div>
                </>
              )}
            </div>
            <button title="Editar" onClick={() => setEditing(n)}><Pencil size={14} style={{ color: 'var(--primary)' }} /></button>
            <button title="Excluir" onClick={() => del(n)}><Trash2 size={15} style={{ color: 'var(--danger-border)' }} /></button>
          </div>
        ))}
      </div>

      {templates.length > 0 && (
        <div className="space-y-1.5 pt-2">
          <div className="text-xs font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}><Bookmark size={13} /> Modelos salvos</div>
          {templates.map(t => (
            <div key={t.id} className="flex items-center gap-2 text-sm py-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
              <span className="font-medium flex-1 truncate" style={{ color: 'var(--text)' }}>{t.template_name || t.title}</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{t.type}</span>
              <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }} title="Prévia" onClick={() => previewTemplate(t)}><Eye size={13} /> Prévia</button>
              <button className="ds-btn-secondary text-xs px-2.5 py-1 rounded-lg" title="Usar modelo" onClick={() => useTemplate(t)}>Usar</button>
              <button title="Excluir modelo" onClick={() => del(t)}><Trash2 size={15} style={{ color: 'var(--danger-border)' }} /></button>
            </div>
          ))}
        </div>
      )}
      {/* Lembretes recorrentes das AÇÕES ficam só na aba "Ações" (acoes-view), não aqui. */}

      {results?.poll && <PollResults notif={results} onClose={() => setResults(null)} />}
      {logTarget && <NotifLog notif={logTarget} onClose={() => setLogTarget(null)} />}

      {/* Prévia do modelo */}
      {tplPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={() => setTplPreview(null)}>
          <div className="ds-card w-full max-w-xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>Prévia do modelo</div>
              <div className="flex items-center gap-3">
                <span className="text-xs px-2 py-0.5 rounded-lg" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{tplPreview.recipients} destinatário(s)</span>
                <button onClick={() => setTplPreview(null)} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3"><EmailFrame html={tplPreview.html} /></div>
          </div>
        </div>
      )}

      {/* Comunicação com cliente — modal in-screen, só Aviso e Comunicação formal (sem marketing) */}
      {showComm && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 overflow-auto" style={{ background: 'rgba(0,0,0,.5)' }}>
          <div className="ds-card w-full max-w-3xl my-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b sticky top-0 z-10" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              <div className="text-sm font-bold inline-flex items-center gap-1.5" style={{ color: 'var(--text)' }}><Megaphone size={15} style={{ color: 'var(--primary)' }} /> Comunicação com cliente</div>
              <button onClick={() => setShowComm(false)} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
            </div>
            <div className="p-4">
              <Compose allowedTypes={['aviso']} onSent={() => setShowComm(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Resultados detalhados da enquete (admin): % por opção + quem votou (auditoria). */
function PollResults({ notif, onClose }: { notif: Notif; onClose: () => void }) {
  const poll = notif.poll!
  const [voters, setVoters] = useState<Voter[]>([])
  const [showVoters, setShowVoters] = useState(false)
  useEffect(() => { api.get<{ data: Voter[] }>(`/polls/${poll.poll_id}/voters`).then(r => setVoters(r.data ?? [])).catch(() => {}) }, [poll.poll_id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="ds-card w-full max-w-lg max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--text)' }}><BarChart3 size={15} style={{ color: 'var(--primary)' }} /> {notif.title}</div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{poll.question}</p>
          <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>{poll.total_votes} voto(s) · {poll.multiple_choice ? 'múltipla escolha' : 'escolha única'}{poll.closed ? ' · encerrada' : ''}</p>
          <div className="space-y-1.5">
            {poll.options.map(o => (
              <div key={o.id} className="relative rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div className="absolute inset-y-0 left-0" style={{ width: `${o.percent}%`, background: 'var(--primary-soft)' }} />
                <div className="relative flex items-center gap-2 px-2.5 py-1.5">
                  <span className="text-[13px] flex-1" style={{ color: 'var(--text)' }}>{o.label}</span>
                  <span className="text-[12px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{o.percent}%</span>
                  <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-light)' }}>({o.votes})</span>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setShowVoters(s => !s)} className="text-xs inline-flex items-center gap-1.5" style={{ color: 'var(--primary)' }}><Users size={13} /> {showVoters ? 'Ocultar' : 'Ver'} quem votou ({voters.length})</button>
          {showVoters && (
            <div className="space-y-1 rounded-lg p-2" style={{ border: '1px solid var(--border)' }}>
              {voters.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum voto ainda.</p>}
              {voters.map((v, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  <span className="flex-1 truncate" style={{ color: 'var(--text)' }}>{v.user_name}</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[11px]" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{v.option}</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>{new Date(v.voted_at).toLocaleString('pt-BR')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Form({ draft, onBack, onSaved }: { draft: Draft; onBack: () => void; onSaved: () => void }) {
  const editingExisting = !!draft.id
  const [title, setTitle] = useState(draft.title ?? '')
  const msgRef = useRef<RichEditorHandle>(null)
  const [type, setType] = useState(draft.type ?? 'aviso')
  const [priority, setPriority] = useState(draft.priority ?? 'medium')
  const [roles, setRoles] = useState<string[]>(draft.target_roles ?? [])
  const [bonds, setBonds] = useState<string[]>((draft as { target_bonds?: string[] }).target_bonds ?? [])
  const [excluded, setExcluded] = useState<number[]>((draft as { excluded_user_ids?: number[] }).excluded_user_ids ?? [])
  const [contractTypes, setContractTypes] = useState<string[]>(draft.target_contract_types ?? [])
  const [pickedUsers, setPickedUsers] = useState<MSOpt[]>([])
  const [sendEmail, setSendEmail] = useState<boolean>(draft.send_email ?? true)
  const [ctaLabel, setCtaLabel] = useState(draft.cta_label ?? '')
  const [ctaUrl, setCtaUrl] = useState(draft.cta_url ?? '')
  const [version, setVersion] = useState(draft.version ?? 1)
  // "Expira em" é OBRIGATÓRIO; default = hoje. Se for hoje, expira às 23:59. Não aceita data passada.
  // Sempre em branco em publicação nova (força o cadastro); ao editar, mantém a data atual.
  const [expires, setExpires] = useState(toLocalDate(draft.expires_at))
  const [visible, setVisible] = useState<boolean>(draft.visible ?? true)
  const [recurrence, setRecurrence] = useState<string>(draft.recurrence ?? 'none')
  const [recurrenceValue, setRecurrenceValue] = useState<number>(draft.recurrence_value ?? 1)
  const [saving, setSaving] = useState(false)

  // Botões de decisão personalizados (nomes definidos pelo admin) — exigem resposta + geram log/resultado.
  const [actions, setActions] = useState<string[]>(draft.actions ?? [])
  const setActionLabel = (i: number, v: string) => setActions(a => a.map((x, idx) => idx === i ? v : x))
  const addAction = () => setActions(a => [...a, ''])
  const removeAction = (i: number) => setActions(a => a.filter((_, idx) => idx !== i))

  // enquete (type=poll)
  const [pollQuestion, setPollQuestion] = useState(draft.poll?.question ?? '')
  const [pollOptions, setPollOptions] = useState<string[]>(draft.poll?.options?.map(o => o.label) ?? ['', ''])
  const [pollMultiple, setPollMultiple] = useState<boolean>(draft.poll?.multiple_choice ?? false)
  const [pollAllowChange, setPollAllowChange] = useState<boolean>(draft.poll?.allow_change_vote ?? true)
  const [pollShowResults, setPollShowResults] = useState<boolean>(draft.poll?.show_results ?? true)
  const pollHasVotes = (draft.poll?.total_votes ?? 0) > 0

  // meta (tipos de contratação)
  const [contractOpts, setContractOpts] = useState<Opt[]>([])
  const draftUserIds = draft.target_users ?? []

  // prévia
  const [preview, setPreview] = useState<{ html: string; recipients: number } | null>(null)
  const [previewing, setPreviewing] = useState(false)

  useEffect(() => {
    api.get<{ data: { contract_types: Opt[] } }>('/notifications/meta')
      .then(r => setContractOpts(r.data?.contract_types ?? []))
      .catch(() => {})
  }, [])

  // hidrata os chips dos usuários já selecionados (edição)
  useEffect(() => {
    if (!draftUserIds.length) return
    api.get<{ data: UserHit[] }>('/notifications/users')
      .then(r => setPickedUsers((r.data ?? []).filter(u => draftUserIds.includes(u.id)).map(u => ({ id: u.id, name: u.name, sub: u.email }))))
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // busca de usuários (servidor) p/ o multi-select
  const searchUsers = useCallback(async (q: string): Promise<MSOpt[]> => {
    const r = await api.get<{ data: UserHit[] }>(`/notifications/users?search=${encodeURIComponent(q)}`)
    return (r.data ?? []).map(u => ({ id: u.id, name: u.name, sub: u.email }))
  }, [])

  const toggleRole = (r: string) => setRoles(rs => rs.includes(r) ? rs.filter(x => x !== r) : [...rs, r])
  const toggleBond = (b: string) => setBonds(bs => bs.includes(b) ? bs.filter(x => x !== b) : [...bs, b])
  const toggleContract = (c: string) => setContractTypes(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c])
  // Busca os membros de um grupo (p/ expandir e retirar do envio). Usa /users com filtros.
  const fetchMembers = useCallback(async (params: string): Promise<{ id: number; name: string; sub?: string | null }[]> => {
    const r = await api.get<{ data?: unknown; items?: unknown }>(`/users?${params}&pageSize=500`)
    const raw = (r as { data?: unknown; items?: unknown }).data ?? (r as { items?: unknown }).items ?? []
    const arr = Array.isArray(raw) ? raw : []
    return arr.map((u) => ({ id: (u as { id: number }).id, name: (u as { name: string }).name, sub: (u as { partner_name?: string | null }).partner_name })).filter(u => u.id && u.name)
  }, [])

  const setOption = (i: number, v: string) => setPollOptions(opts => opts.map((o, idx) => idx === i ? v : o))
  const addOption = () => setPollOptions(opts => [...opts, ''])
  const removeOption = (i: number) => setPollOptions(opts => opts.length <= 2 ? opts : opts.filter((_, idx) => idx !== i))

  const buildBody = (): Record<string, unknown> | null => {
    const message = msgRef.current?.getHtml() ?? ''
    const isPoll = type === 'poll'
    if (!title.trim()) { toast.error('Informe o título.'); return null }
    if (!isPoll && message.replace(/<[^>]*>/g, '').trim() === '') { toast.error('Informe a mensagem.'); return null }
    if (!expires) { toast.error('Informe a data de expiração.'); return null }
    if (isPastDate(expires)) { toast.error('A data de expiração não pode ser anterior a hoje.'); return null }

    const expiresAt = expiryIso(expires)  // vazio/hoje → hoje 23:59; senão a data escolhida 23:59

    let poll: Record<string, unknown> | undefined
    if (isPoll) {
      const cleanOpts = pollOptions.map(o => o.trim()).filter(o => o !== '')
      if (!pollQuestion.trim()) { toast.error('Informe a pergunta da enquete.'); return null }
      if (cleanOpts.length < 2) { toast.error('A enquete precisa de ao menos 2 opções.'); return null }
      poll = {
        question: pollQuestion.trim(), options: cleanOpts,
        multiple_choice: pollMultiple, allow_change_vote: pollAllowChange,
        show_results: pollShowResults,
        expires_at: expiresAt,
      }
    }

    return {
      title: title.trim(), message, type, priority,
      target_roles: roles,
      target_bonds: bonds,
      target_users: pickedUsers.map(u => u.id),
      target_contract_types: contractTypes,
      excluded_user_ids: excluded,
      target_customer_id: null,
      target_customer_ids: [],
      send_email: sendEmail,
      visible,
      recurrence,
      recurrence_value: recurrence === 'none' ? null : (Number(recurrenceValue) || 1),
      requires_ack: type === 'require_ack' || type === 'aviso',   // todo Aviso exige aceite (log de leitura)
      cta_label: type === 'action' ? (ctaLabel.trim() || null) : null,
      cta_url: type === 'action' ? (ctaUrl.trim() || null) : null,
      actions: type === 'poll' ? [] : actions.map(a => a.trim()).filter(Boolean),
      version: Number(version) || 1, expires_at: expiresAt,
      ...(poll ? { poll } : {}),
    }
  }

  // Salva o aviso atual como MODELO reutilizável (não publica/dispara).
  const saveTemplate = async () => {
    const body = buildBody(); if (!body) return
    const name = window.prompt('Nome do modelo:', title.trim() || 'Novo modelo')
    if (!name) return
    body.is_template = true; body.template_name = name
    setSaving(true)
    try { await api.post('/notifications', body); toast.success('Modelo salvo'); onSaved() }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao salvar modelo') } finally { setSaving(false) }
  }

  const doPreview = async () => {
    const body = buildBody(); if (!body) return
    setPreviewing(true)
    try {
      const r = await api.post<{ data: { html: string; recipients: number } }>('/notifications/preview', body)
      setPreview({ html: r.data?.html ?? '', recipients: r.data?.recipients ?? 0 })
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro na prévia') } finally { setPreviewing(false) }
  }

  const save = async () => {
    const body = buildBody(); if (!body) return
    setSaving(true)
    try {
      if (editingExisting) await api.put(`/notifications/${draft.id}`, body); else await api.post('/notifications', body)
      toast.success(editingExisting ? 'Notificação atualizada' : 'Notificação publicada'); onSaved()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') } finally { setSaving(false) }
  }

  const chip = (on: boolean, danger = false) => ({
    border: `1px solid ${on ? (danger ? 'var(--danger)' : 'var(--primary)') : 'var(--border)'}`,
    background: on ? (danger ? 'var(--danger-bg)' : 'var(--primary-soft)') : 'transparent',
    color: on ? 'var(--danger)' : (danger ? 'var(--danger)' : 'var(--text-muted)'),
  })

  return (
    <div className="ds-card p-4 space-y-3 max-w-2xl">
      <button onClick={onBack} className="text-sm" style={{ color: 'var(--text-muted)' }}>← Voltar</button>
      <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Título</label><input className={`${fieldCls} w-full`} style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} /></div>
      <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Mensagem {type === 'poll' && <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>(opcional — introdução da enquete)</span>} <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>(cole prints direto aqui)</span></label><RichEditor ref={msgRef} initialHtml={draft.message ?? ''} minHeight={110} showAttach={false} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Tipo</label>
          <select className={`${fieldCls} w-full`} style={inputStyle} value={type} onChange={e => setType(e.target.value)} disabled={editingExisting}>
            {/* Informativo/Comunicação formal/Obrigatória aposentados; Enquete tem botão próprio
                ("Nova enquete"). Esses só aparecem ao abrir/editar um item já desse tipo. */}
            {type === 'info' && <option value="info">Informativo</option>}
            <option value="aviso">Aviso</option>
            {type === 'formal' && <option value="formal">Comunicação formal</option>}
            <option value="action">Ação (com botão)</option>
            {type === 'require_ack' && <option value="require_ack">Obrigatória (exige aceite)</option>}
            {type === 'poll' && <option value="poll">Enquete</option>}
          </select>
        </div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Prioridade</label>
          <select className={`${fieldCls} w-full`} style={inputStyle} value={priority} onChange={e => setPriority(e.target.value)}>
            <option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="critical">Crítica</option>
          </select>
        </div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Versão {editingExisting && <span className="text-[10px]">(mudar = novo aceite)</span>}</label><input type="number" min={1} className={`${fieldCls} w-full`} style={inputStyle} value={version} onChange={e => setVersion(Number(e.target.value))} /></div>
      </div>
      {type === 'action' && (
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Texto do botão</label><input className={`${fieldCls} w-full`} style={inputStyle} value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} placeholder="ex.: Revisar apontamentos" /></div>
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Link (rota)</label><input className={`${fieldCls} w-full`} style={inputStyle} value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} placeholder="ex.: /apontamentos" /></div>
        </div>
      )}

      {/* ── Botões de decisão (não-enquete): nomes definidos pelo admin, exige resposta, gera log/resultado ── */}
      {type !== 'poll' && (
        <div className="rounded-xl p-3 space-y-2" style={{ border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold inline-flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
              <CalendarCheck size={14} /> Botões de decisão
              <span className="font-normal text-[11px]" style={{ color: 'var(--text-light)' }}>(opcional — exige resposta + gera log)</span>
            </span>
            <button type="button" onClick={addAction} className="text-[11px] inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}><Plus size={12} /> Adicionar botão</button>
          </div>
          {actions.length === 0 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem botões = notificação comum. Adicione (ex.: &quot;Confirmo presença&quot;, &quot;Não vou&quot;) para o usuário clicar — fica pendente até responder e você vê quem clicou em quê.</p>}
          {actions.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={`${fieldCls} flex-1`} style={inputStyle} value={a} onChange={e => setActionLabel(i, e.target.value)} placeholder={`Nome do botão ${i + 1}`} maxLength={80} />
              <button type="button" onClick={() => removeAction(i)}><Trash2 size={14} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
          ))}
          {/* Limite da decisão + recorrência p/ re-perguntar (o usuário pode "Decidir depois" até o limite) */}
          {actions.length > 0 && (
            <div className="grid grid-cols-2 gap-3 pt-2 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
              <div>
                <label className={lbl} style={{ color: 'var(--text-light)' }}>Limite da decisão <span style={{ color: 'var(--danger-border)' }}>*</span></label>
                <input type="date" required min={todayLocal()} className={`${fieldCls} w-full`} style={inputStyle} value={expires} onChange={e => setExpires(e.target.value)} />
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-light)' }}>Decidir até esta data (hoje = 23:59).</div>
              </div>
              <div>
                <label className={lbl} style={{ color: 'var(--text-light)' }}>Re-perguntar automaticamente</label>
                <label className="flex items-center gap-2 text-[13px] cursor-pointer mt-0.5" style={{ color: 'var(--text)' }}>
                  <input type="checkbox" checked={recurrence !== 'none'} onChange={e => setRecurrence(e.target.checked ? 'every_days' : 'none')} />
                  Perguntar sozinho até decidirem
                </label>
                {recurrence !== 'none' && (
                  <div className="flex items-center gap-1.5 mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    a cada
                    <input type="number" min={1} max={recurrence === 'every_hours' ? 168 : 31} className={`${fieldCls} w-16`} style={inputStyle}
                      value={recurrenceValue || ''}
                      onChange={e => setRecurrenceValue(e.target.value === '' ? 0 : Number(e.target.value))}
                      onBlur={() => setRecurrenceValue(v => Math.min(recurrence === 'every_hours' ? 168 : 31, Math.max(1, v || 1)))} />
                    <select className={`${fieldCls}`} style={inputStyle} value={recurrence === 'every_hours' ? 'hours' : 'days'} onChange={e => setRecurrence(e.target.value === 'hours' ? 'every_hours' : 'every_days')}>
                      <option value="hours">hora(s)</option>
                      <option value="days">dia(s)</option>
                    </select>
                  </div>
                )}
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-light)' }}>O sistema reabre e re-pergunta sozinho no intervalo (horas: de hora em hora · dias: 1×/dia). "Decidir depois" adia até a próxima.</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Enquete ───────────────────────────────────────────── */}
      {type === 'poll' && (
        <div className="rounded-xl p-3 space-y-3" style={{ border: '1px solid var(--primary)', background: 'var(--primary-soft)' }}>
          <div className="text-[12px] font-bold inline-flex items-center gap-1.5" style={{ color: 'var(--primary)' }}><BarChart3 size={14} /> Enquete</div>
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Pergunta</label><input className={`${fieldCls} w-full`} style={inputStyle} value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="ex.: Qual dia prefere para o evento?" /></div>
          <div>
            <label className={lbl} style={{ color: 'var(--text-light)' }}>Opções</label>
            {pollHasVotes && <div className="text-[10px] mb-1" style={{ color: 'var(--warning-border)' }}>Esta enquete já tem votos — as opções não podem ser alteradas.</div>}
            <div className="space-y-1.5">
              {pollOptions.map((o, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input className={`${fieldCls} flex-1`} style={inputStyle} value={o} onChange={e => setOption(i, e.target.value)} placeholder={`Opção ${i + 1}`} disabled={pollHasVotes} />
                  {pollOptions.length > 2 && !pollHasVotes && <button type="button" onClick={() => removeOption(i)} title="Remover"><X size={15} style={{ color: 'var(--danger-border)' }} /></button>}
                </div>
              ))}
            </div>
            {!pollHasVotes && <button type="button" onClick={addOption} className="text-xs mt-1.5 inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}><Plus size={12} /> Adicionar opção</button>}
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={pollMultiple} onChange={e => setPollMultiple(e.target.checked)} disabled={pollHasVotes} /> Permitir múltiplas opções
            </label>
            <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={pollAllowChange} onChange={e => setPollAllowChange(e.target.checked)} /> Permitir alterar o voto
            </label>
            <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={pollShowResults} onChange={e => setPollShowResults(e.target.checked)} /> Acompanhar resultado
            </label>
          </div>
          <div className="text-[10px]" style={{ color: 'var(--text-light)' }}>
            A votação encerra na data de expiração definida abaixo.
            {!pollShowResults && ' Com "Acompanhar resultado" desligado, o usuário apenas vota e a enquete some pra ele (não vê os números).'}
          </div>
        </div>
      )}

      {/* ── Destinatários ──────────────────────────────────────── */}
      <div className="rounded-xl p-3 space-y-3" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>Destinatários</div>

        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Equipe interna <span className="text-[10px]">· clique na seta ▾ para ver/retirar pessoas</span></label>
          <div className="flex flex-wrap gap-2 items-start">
            {INTERNAL_ROLES.map(r => (
              <RecipientChip key={r.k} label={r.l} active={roles.includes(r.k)} onToggle={() => toggleRole(r.k)}
                params={`type=${r.k}`} fetchMembers={fetchMembers} excluded={excluded} setExcluded={setExcluded} chipStyle={chip} />
            ))}
            {CONSULTANT_BONDS.map(b => (
              <RecipientChip key={b.k} label={b.l} active={bonds.includes(b.k)} onToggle={() => toggleBond(b.k)}
                params={`type=consultor&work_bond=${b.k}`} fetchMembers={fetchMembers} excluded={excluded} setExcluded={setExcluded} chipStyle={chip} />
            ))}
            <RecipientChip label="Parceiro" active={roles.includes('parceiro_admin')} onToggle={() => toggleRole('parceiro_admin')}
              params="type=parceiro_admin" fetchMembers={fetchMembers} excluded={excluded} setExcluded={setExcluded} chipStyle={chip} />
          </div>
        </div>

        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Por tipo de contratação</label>
          <div className="flex flex-wrap gap-2 items-start">
            {contractOpts.map(c => (
              <RecipientChip key={c.id} label={c.name} active={contractTypes.includes(String(c.id))} onToggle={() => toggleContract(String(c.id))}
                params={`contract_type=${c.id}`} fetchMembers={fetchMembers} excluded={excluded} setExcluded={setExcluded} chipStyle={chip} />
            ))}
          </div>
        </div>

        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Usuários específicos</label>
          <MultiSelect placeholder="Buscar por nome ou e-mail…" selected={pickedUsers} onChange={setPickedUsers} search={searchUsers} />
        </div>

        <div className="text-[10px]" style={{ color: 'var(--text-light)' }}>Comunicação com clientes agora é feita na <b>Central de Comunicação</b> (Menu → Comunicação).</div>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
        <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
        Enviar também por e-mail aos destinatários selecionados
      </label>

      <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
        <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} />
        Visível na Central <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>(se desligado, não aparece na tela — só vai por e-mail)</span>
      </label>

      {/* Expira/Recorrência gerais — escondidos quando há botões de decisão (lá viram "Limite da decisão" + "Re-perguntar") */}
      {actions.length === 0 && <>
      <div>
        <label className={lbl} style={{ color: 'var(--text-light)' }}>Expira em <span style={{ color: 'var(--danger-border)' }}>*</span></label>
        <input type="date" required min={todayLocal()} className={`${fieldCls}`} style={inputStyle} value={expires} onChange={e => setExpires(e.target.value)} />
        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-light)' }}>Obrigatório. Se for hoje, vale até às 23:59. Não aceita data anterior a hoje.</div>
      </div>

      {/* Recorrência */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Recorrência</label>
          <select className={`${fieldCls} w-full`} style={inputStyle} value={recurrence} onChange={e => setRecurrence(e.target.value)}>
            {RECUR.map(r => <option key={r.k} value={r.k}>{r.l}</option>)}
          </select>
        </div>
        {recurrence !== 'none' && (
          <div>
            <label className={lbl} style={{ color: 'var(--text-light)' }}>
              {recurrence === 'every_days' ? 'A cada quantos dias' : recurrence === 'day_of_month' ? 'Dia do mês (1–31)' : 'Qual dia útil (1–23)'}
            </label>
            <input type="number" min={1} max={recurrence === 'every_days' ? 365 : 31} className={`${fieldCls} w-full`} style={inputStyle} value={recurrenceValue} onChange={e => setRecurrenceValue(Number(e.target.value))} />
          </div>
        )}
      </div>
      {recurrence !== 'none' && <div className="text-[10px] -mt-1" style={{ color: 'var(--text-light)' }}>O aviso reabre p/ todos e reenvia o e-mail automaticamente conforme a recorrência (verificado 1×/dia).</div>}
      </>}

      <div className="flex justify-end gap-2 flex-wrap">
        <button className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg" onClick={saveTemplate} disabled={saving}><Bookmark size={14} /> Salvar modelo</button>
        <button className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg" onClick={doPreview} disabled={previewing}><Eye size={14} /> Prévia</button>
        <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg" onClick={save} disabled={saving}>{editingExisting ? <Save size={14} /> : <Send size={14} />} {editingExisting ? 'Salvar' : 'Publicar'}</button>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={() => setPreview(null)}>
          <div className="ds-card w-full max-w-xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>Prévia do e-mail</div>
              <div className="flex items-center gap-3">
                <span className="text-xs px-2 py-0.5 rounded-lg" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{preview.recipients} destinatário(s)</span>
                <button onClick={() => setPreview(null)} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3">
              <EmailFrame html={preview.html} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface LogRow { user_id: number; user_name: string; user_email: string; viewed_at: string | null; response: string | null; responded_at: string | null }
interface LogData { recipients: LogRow[]; summary: { total: number; viewed: number; responded: number; actions: string[]; by_action: Record<string, number> } }

/** Log de uma comunicação (admin): quem visualizou (e quando) + resultado dos botões de decisão. */
function NotifLog({ notif, onClose }: { notif: Notif; onClose: () => void }) {
  const [data, setData] = useState<LogData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'viewed' | 'pending'>('all')
  const [respFilter, setRespFilter] = useState<string>('all') // 'all' | 'none' | <rótulo da resposta>

  useEffect(() => {
    api.get<{ data: LogData }>(`/notifications/${notif.id}/log`)
      .then(r => setData(r.data ?? null)).catch(() => {}).finally(() => setLoading(false))
  }, [notif.id])

  const dt = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR') : '—'
  const rows = (data?.recipients ?? []).filter(r => {
    const okView = filter === 'all' ? true : filter === 'viewed' ? !!r.viewed_at : !r.viewed_at
    const okResp = respFilter === 'all' ? true : respFilter === 'none' ? !r.response : r.response === respFilter
    return okView && okResp
  })

  // Exporta as linhas FILTRADAS em CSV (abre no Excel; BOM + ';' p/ pt-BR e acentos).
  const exportCsv = () => {
    const header = ['Destinatário', 'E-mail', 'Visualizou', 'Resposta']
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = rows.map(r => [r.user_name, r.user_email, r.viewed_at ? dt(r.viewed_at) : '', r.response ?? ''])
    const csv = '﻿' + [header, ...lines].map(l => l.map(esc).join(';')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `log-${(notif.title || 'comunicado').replace(/[^\w]+/g, '_').slice(0, 40)}.csv`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'var(--primary-soft)' }}>
          <ClipboardList size={17} style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-bold flex-1 truncate" style={{ color: 'var(--primary)' }}>Log · {notif.title}</span>
          <button onClick={onClose} style={{ color: 'var(--primary)' }}><X size={16} /></button>
        </div>

        <div className="p-4 space-y-3 overflow-auto">
          {loading && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Carregando…</p>}
          {data && (
            <>
              {/* Resumo */}
              <div className="flex flex-wrap gap-2 text-[12px]">
                <span className="px-2 py-1 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><b>{data.summary.viewed}</b>/{data.summary.total} visualizaram</span>
                {data.summary.actions.length > 0 && <span className="px-2 py-1 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><b>{data.summary.responded}</b> responderam</span>}
                {data.summary.actions.map(a => (
                  <span key={a} className="px-2 py-1 rounded-lg" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{a}: <b>{data.summary.by_action[a] ?? 0}</b></span>
                ))}
              </div>

              {/* Filtro por visualização + exportar */}
              <div className="flex items-center gap-1 text-[11px]">
                {([['all', 'Todos'], ['viewed', 'Visualizaram'], ['pending', 'Não viram']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setFilter(k)} className="px-2.5 py-1 rounded-md font-medium"
                    style={{ background: filter === k ? 'var(--primary-soft)' : 'transparent', color: filter === k ? 'var(--primary)' : 'var(--text-muted)' }}>{l}</button>
                ))}
                <div className="flex-1" />
                <button onClick={exportCsv} title="Exportar em Excel (CSV)" className="ds-btn-secondary inline-flex items-center gap-1 px-2.5 py-1 whitespace-nowrap"><Download size={12} /> Exportar Excel</button>
              </div>

              {/* Filtro por RESPOSTA (só quando há botões de decisão) */}
              {data.summary.actions.length > 0 && (
                <div className="flex items-center gap-1 text-[11px] flex-wrap">
                  <span className="mr-0.5" style={{ color: 'var(--text-light)' }}>Resposta:</span>
                  {([['all', 'Todas'], ...data.summary.actions.map(a => [a, a] as [string, string]), ['none', 'Não respondida']] as [string, string][]).map(([k, l]) => (
                    <button key={k} onClick={() => setRespFilter(k)} className="px-2.5 py-1 rounded-md font-medium"
                      style={{ background: respFilter === k ? 'var(--primary-soft)' : 'transparent', color: respFilter === k ? 'var(--primary)' : 'var(--text-muted)' }}>{l}</button>
                  ))}
                </div>
              )}

              {/* Tabela */}
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ background: 'var(--surface-sunken)' }}>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-muted)' }}>Destinatário</th>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-muted)' }}>Visualizou</th>
                      {data.summary.actions.length > 0 && <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-muted)' }}>Resposta</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && <tr><td colSpan={3} className="px-3 py-3 text-center" style={{ color: 'var(--text-muted)' }}>Nenhum destinatário.</td></tr>}
                    {rows.map(r => (
                      <tr key={r.user_id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="px-3 py-2" style={{ color: 'var(--text)' }}>{r.user_name}<div className="text-[10px]" style={{ color: 'var(--text-light)' }}>{r.user_email}</div></td>
                        <td className="px-3 py-2" style={{ color: r.viewed_at ? 'var(--text-muted)' : 'var(--text-light)' }}>{r.viewed_at ? dt(r.viewed_at) : '—'}</td>
                        {data.summary.actions.length > 0 && (
                          <td className="px-3 py-2">
                            {r.response
                              ? <span className="px-1.5 py-0.5 rounded-full text-[11px]" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{r.response}</span>
                              : <span style={{ color: 'var(--text-light)' }}>—</span>}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
