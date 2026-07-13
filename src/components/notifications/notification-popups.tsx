'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { AlertTriangle, BarChart3, Bell, CheckCircle2, Zap, X, ShieldAlert, Info, Clock, ChevronsDown } from 'lucide-react'
import { sanitizeRich, isHtmlBody } from '@/lib/sanitize-html'

interface PollOpt { id: number; label: string }
interface PollData { poll_id: number; question: string; multiple_choice: boolean; options: PollOpt[]; has_voted: boolean; my_option_ids: number[]; closed: boolean }
interface Notif {
  id: number; title: string; message: string; type: 'info' | 'action' | 'require_ack' | 'poll'
  priority: 'low' | 'medium' | 'high' | 'critical'; requires_ack: boolean; pending_ack: boolean
  cta_label: string | null; cta_url: string | null; viewed: boolean; poll: PollData | null
  resent_at?: string | null; actions?: string[] | null   // botões de decisão personalizados
  expires_at?: string | null                              // prazo da decisão
  my_response?: string | null                             // botão de decisão já clicado (não re-perguntar)
}
// chave de "já exibido": muda quando o aviso é reenviado (resent_at) → o pop-up reaparece.
const keyOf = (n: Notif) => `${n.id}@${n.resent_at ?? ''}`

const RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
const POLL_MS = 30000   // rede de segurança; o tempo real vem do SSE (/notifications/stream)
const LS_KEY = (uid: number) => `notif_popped_${uid}`

// Cor + ícone seguem a CRITICIDADE (prioridade); o rótulo respeita o tipo quando faz sentido.
const PRIO_STYLE: Record<string, { bg: string; fg: string; label: string; icon: typeof Bell }> = {
  critical: { bg: 'var(--danger-bg)',     fg: 'var(--danger-border)',  label: 'Crítico',     icon: ShieldAlert },
  high:     { bg: 'var(--warning-bg)',    fg: 'var(--warning-border)', label: 'Importante',  icon: AlertTriangle },
  medium:   { bg: 'var(--primary-soft)',  fg: 'var(--primary)',        label: 'Aviso',       icon: Bell },
  low:      { bg: 'var(--surface-sunken)', fg: 'var(--text-muted)',    label: 'Informativo', icon: Info },
}
function headerFor(type: string, priority: string) {
  const p = PRIO_STYLE[priority] ?? PRIO_STYLE.medium
  const label = type === 'require_ack' ? 'Leitura obrigatória'
    : type === 'poll' ? 'Enquete'
    : type === 'action' ? 'Ação necessária'
    : p.label
  return { bg: p.bg, fg: p.fg, label, icon: type === 'poll' ? BarChart3 : p.icon }
}

function loadPopped(uid: number): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY(uid)) || '[]')) } catch { return new Set() }
}
function savePopped(uid: number, set: Set<string>) {
  try { localStorage.setItem(LS_KEY(uid), JSON.stringify(Array.from(set).slice(-300))) } catch {}
}

/**
 * Pop-up GLOBAL e chamativo: toda notificação nova (aviso / lembrete / ação / enquete) abre um
 * modal em qualquer tela do app. Obrigatórias exigem aceite; enquete permite "Decidir depois".
 * Já vistas não reaparecem (controle local por usuário); obrigatórias insistem até o aceite.
 */
export function NotificationPopups({ userId }: { userId: number }) {
  const router = useRouter()
  const qc = useQueryClient()
  const [queue, setQueue] = useState<Notif[]>([])
  const [sel, setSel] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [canOk, setCanOk] = useState(true)   // gate: só libera o OK após rolar até o fim quando há barra
  const popped = useRef<Set<string>>(new Set())

  useEffect(() => { popped.current = loadPopped(userId) }, [userId])

  const fetchNew = useCallback(async () => {
    try {
      const r = await api.get<{ data: { notifications: Notif[] } }>('/notifications')
      const list = r.data?.notifications ?? []
      const toShow = list
        .filter(n => {
          if (n.actions?.length) {
            // Decisão (botões): "Decidir depois" adia até a PRÓXIMA recorrência (resent_at muda a chave).
            // Não re-perguntar a cada navegação/refresh; e se já respondeu, nunca mais reabre.
            return !n.my_response && !popped.current.has(keyOf(n))
          }
          // Leitura obrigatória pura: insiste até o aceite. Demais: só enquanto não exibida.
          return n.pending_ack || !popped.current.has(keyOf(n))
        })
        .sort((a, b) => (RANK[b.priority] ?? 0) - (RANK[a.priority] ?? 0))
      setQueue(prev => {
        const ids = new Set(prev.map(x => x.id))
        return [...prev, ...toShow.filter(n => !ids.has(n.id))]
      })
    } catch {}
  }, [])

  // Polling de segurança (caso SSE seja bloqueado por proxy) + refetch ao focar a aba.
  useEffect(() => {
    fetchNew()
    const t = setInterval(fetchNew, POLL_MS)
    const onFocus = () => fetchNew()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [fetchNew])

  // REALTIME via SSE: o backend empurra "notify" assim que surge notificação nova (~3s).
  // O EventSource manda o cookie (mesma origem) → o middleware Next injeta o Bearer → sanctum.
  // Reconecta sozinho ao fim de cada janela; degrada pro polling acima se o SSE não passar.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return
    let es: EventSource | null = null
    try {
      es = new EventSource('/api/v1/notifications/stream')
      es.addEventListener('notify', () => fetchNew())
      // Chat em tempo real: ao chegar mensagem nova, invalida o cache de conversas —
      // o ChatBell/ChatNotifier (mesmo queryKey) atualizam e sobem o pop-up na hora.
      es.addEventListener('inbox', () => qc.invalidateQueries({ queryKey: ['inbox-conversations'] }))
      // onerror: o próprio EventSource reconecta (respeitando o "retry"); nada a fazer.
    } catch { /* sem SSE → fica só o polling */ }
    return () => { es?.close() }
  }, [fetchNew, qc])

  const current = queue[0]

  // prepara seleção da enquete ao trocar de card
  useEffect(() => { setSel(current?.poll?.my_option_ids ?? []) }, [current?.id])

  // Ao trocar de card: se a mensagem tem barra de rolagem (texto longo), trava o OK até rolar
  // até o fim; se couber inteira (sem barra), libera direto.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = bodyRef.current
      setCanOk(!el || el.scrollHeight <= el.clientHeight + 4)
    })
    return () => cancelAnimationFrame(id)
  }, [current?.id])
  const onBodyScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 6) setCanOk(true)
  }

  if (!current) return null
  const h = headerFor(current.type, current.priority)
  const Icon = h.icon

  const markSeen = (n: Notif) => {
    popped.current.add(keyOf(n)); savePopped(userId, popped.current)
    api.post(`/notifications/${n.id}/view`, {}).catch(() => {})
  }
  const close = (n: Notif) => { markSeen(n); setQueue(q => q.filter(x => x.id !== n.id)) }

  const confirmAck = async (n: Notif) => {
    setBusy(true)
    try { await api.post(`/notifications/${n.id}/ack`, {}); markSeen(n); setQueue(q => q.filter(x => x.id !== n.id)); toast.success('Leitura confirmada') }
    catch { toast.error('Erro ao confirmar') } finally { setBusy(false) }
  }

  const goAction = (n: Notif) => { markSeen(n); setQueue(q => q.filter(x => x.id !== n.id)); if (n.cta_url) router.push(n.cta_url) }

  // Responde a um botão de decisão → registra e fecha (sai de pendente).
  const respond = async (n: Notif, action: string) => {
    setBusy(true)
    try { await api.post(`/notifications/${n.id}/respond`, { action }); markSeen(n); setQueue(q => q.filter(x => x.id !== n.id)); toast.success('Resposta registrada ✓') }
    catch { toast.error('Erro ao responder') } finally { setBusy(false) }
  }

  const togglePoll = (id: number) => {
    if (current.poll?.multiple_choice) setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
    else setSel([id])
  }
  const vote = async (n: Notif) => {
    if (!n.poll || sel.length === 0) return toast.error('Selecione uma opção.')
    setBusy(true)
    try {
      const body = n.poll.multiple_choice ? { option_ids: sel } : { option_id: sel[0] }
      await api.post(`/polls/${n.poll.poll_id}/vote`, body)
      markSeen(n); setQueue(q => q.filter(x => x.id !== n.id)); toast.success('Voto registrado! 🎉')
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao votar') } finally { setBusy(false) }
  }

  const mandatory = current.type === 'require_ack' || current.pending_ack

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl animate-[popIn_.18s_ease-out]"
        style={{ background: 'var(--surface)', border: `1px solid ${h.fg}` }}>
        {/* Cabeçalho chamativo */}
        <div className="px-5 py-3 flex items-center gap-2" style={{ background: h.bg }}>
          <Icon size={18} style={{ color: h.fg }} />
          <span className="text-sm font-bold" style={{ color: h.fg }}>{h.label}</span>
          {queue.length > 1 && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: h.fg, color: 'var(--surface)' }}>+{queue.length - 1}</span>}
          {!mandatory && <button onClick={() => close(current)} className="ml-auto" style={{ color: h.fg }} aria-label="Fechar"><X size={16} /></button>}
        </div>

        <div className="p-5 space-y-3">
          <h2 className="text-[17px] font-semibold" style={{ color: 'var(--text)' }}>{current.title}</h2>

          {current.type === 'poll' && current.poll ? (
            <>
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{current.poll.question}</p>
              <div className="space-y-1.5 max-h-56 overflow-auto">
                {current.poll.options.map(o => {
                  const on = sel.includes(o.id)
                  return (
                    <button key={o.id} type="button" onClick={() => togglePoll(o.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm"
                      style={{ border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary-soft)' : 'var(--surface)', color: 'var(--text)' }}>
                      <span className="inline-flex items-center justify-center shrink-0" style={{ width: 16, height: 16, borderRadius: current.poll!.multiple_choice ? 4 : 999, border: `1.5px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary)' : 'transparent' }}>
                        {on && <CheckCircle2 size={11} style={{ color: 'var(--primary-fg)' }} />}
                      </span>
                      {o.label}
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <div ref={bodyRef} onScroll={onBodyScroll} className="text-sm max-h-60 overflow-auto" style={{ color: 'var(--text-muted)' }}>
              {isHtmlBody(current.message)
                ? <div className="hd-rich" dangerouslySetInnerHTML={{ __html: sanitizeRich(current.message) }} />
                : <p className="whitespace-pre-wrap">{current.message}</p>}
            </div>
          )}
        </div>

        {/* Botões — chamativos */}
        <div className="px-5 py-3 flex items-center justify-end gap-2 flex-wrap" style={{ borderTop: '1px solid var(--border)' }}>
          {current.actions?.length ? (
            <>
              {/* Legenda do prazo da decisão (limite) */}
              {current.expires_at && (
                <span className="text-[11px] mr-auto inline-flex items-center gap-1" style={{ color: 'var(--text-light)' }}>
                  <Clock size={12} /> Prazo para decidir: <b style={{ color: 'var(--text-muted)' }}>{new Date(current.expires_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</b>
                </span>
              )}
              {/* Decidir depois: adia sem responder; reaparece na próxima recorrência / próximo acesso, até o limite */}
              <button onClick={() => close(current)} className="ds-btn-secondary text-sm px-4 py-2 rounded-lg font-medium" style={{ border: '1.5px solid var(--text-light)', background: 'var(--surface-sunken)', color: 'var(--text)' }}>Decidir depois</button>
              {current.actions.map(a => (
                <button key={a} onClick={() => respond(current, a)} disabled={busy} className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg">{a}</button>
              ))}
            </>
          ) : current.type === 'require_ack' || current.pending_ack ? (
            <>
              {!canOk && <span className="text-[11px] mr-auto inline-flex items-center gap-1" style={{ color: 'var(--text-light)' }}><ChevronsDown size={12} /> Role a mensagem até o fim para confirmar</span>}
              <button onClick={() => confirmAck(current)} disabled={busy || !canOk} className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-5 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"><CheckCircle2 size={15} /> Confirmar leitura</button>
            </>
          ) : current.type === 'poll' && current.poll ? (
            <>
              <button onClick={() => close(current)} className="text-sm px-4 py-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>Decidir depois</button>
              <button onClick={() => vote(current)} disabled={busy} className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-5 py-2 rounded-lg"><BarChart3 size={15} /> Votar</button>
            </>
          ) : current.type === 'action' && current.cta_label && current.cta_url ? (
            <>
              <button onClick={() => close(current)} className="text-sm px-4 py-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>Ver depois</button>
              <button onClick={() => goAction(current)} className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-5 py-2 rounded-lg"><Zap size={15} /> {current.cta_label}</button>
            </>
          ) : (
            <>
              {!canOk && <span className="text-[11px] mr-auto inline-flex items-center gap-1" style={{ color: 'var(--text-light)' }}><ChevronsDown size={12} /> Role a mensagem até o fim</span>}
              <button onClick={() => close(current)} disabled={!canOk} className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-5 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"><CheckCircle2 size={15} /> Ok, entendi</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
