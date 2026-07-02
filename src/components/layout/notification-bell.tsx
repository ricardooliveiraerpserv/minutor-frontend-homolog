'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Bell, X, ArrowRight, BarChart3, Megaphone } from 'lucide-react'
import { PollCard, type Poll } from '@/components/notifications/poll-card'
import { sanitizeRich, isHtmlBody } from '@/lib/sanitize-html'

interface Notif {
  id: number; title: string; message: string; type: string
  viewed: boolean; created_at?: string | null; poll: Poll | null
}
interface ActionItem { key: string; title: string; count: number }
interface Badges { overdue_tasks: number; pending_tasks: number; unread_notifications: number; critical: boolean }

const TIPO_L: Record<string, string> = { info: 'Info', aviso: 'Aviso', formal: 'Comunicação', poll: 'Enquete' }
const POLL_MS = 45000

/**
 * Sino da topbar — Notificações = APENAS informativo/awareness (sem execução).
 * Mostra um resumo de pendências (link "Ver no Meu Dia") + informativos/enquetes leves.
 * Tudo que exige ação (aprovar, confirmar, concluir) vive no Meu Dia.
 */
export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notif[]>([])
  const [actions, setActions] = useState<ActionItem[]>([])
  const [badges, setBadges] = useState<Badges>({ overdue_tasks: 0, pending_tasks: 0, unread_notifications: 0, critical: false })
  const [poll, setPoll] = useState<Notif | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    api.get<{ data: { notifications: Notif[] } }>('/notifications').then(r => setItems(r?.data?.notifications ?? [])).catch(() => {})
    api.get<{ data: ActionItem[] }>('/notifications/actions').then(r => setActions(r?.data ?? [])).catch(() => {})
    api.get<{ data: Badges }>('/me/badges').then(r => { if (r.data) setBadges(r.data) }).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [load])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Informativos (sem ação): info/aviso/formal + enquetes.
  const infos = items.filter(n => n.type === 'info' || n.type === 'aviso' || n.type === 'formal')
  const enquetes = items.filter(n => n.type === 'poll' && n.poll)
  const informativos = [...enquetes, ...infos]

  // Pendências de AÇÃO (resumo awareness → Meu Dia). Aprovações + atrasos + confirmações.
  const actionTotal = actions.reduce((s, a) => s + a.count, 0)
  const pendCount = actionTotal + badges.overdue_tasks
  // Badge do sino = informativos não lidos + um aviso de que há pendência.
  const unreadInfo = informativos.filter(n => !n.viewed).length
  const bellCount = unreadInfo

  const goMeuDia = () => { setOpen(false); router.push('/inicio') }
  const openItem = (n: Notif) => {
    if (n.type === 'poll' && n.poll) { setPoll(n); return }
    if (!n.viewed) { api.post(`/notifications/${n.id}/view`, {}).catch(() => {}); setItems(p => p.map(x => x.id === n.id ? { ...x, viewed: true } : x)) }
  }
  const dt = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="relative p-2 rounded-lg" style={{ color: 'var(--brand-text, var(--text))' }} title="Notificações" aria-label="Notificações">
        <Bell size={18} />
        {(bellCount > 0 || pendCount > 0) && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center" style={{ background: pendCount > 0 ? 'var(--danger-border)' : 'var(--warning-border)', color: '#fff' }}>
            {bellCount > 0 ? (bellCount > 9 ? '9+' : bellCount) : ''}
            {bellCount === 0 && pendCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[var(--surface)]" />}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] max-w-[90vw] rounded-xl shadow-2xl z-50 overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <Bell size={15} style={{ color: 'var(--primary)' }} />
            <span className="text-sm font-semibold flex-1" style={{ color: 'var(--text)' }}>Notificações</span>
            <button onClick={() => setOpen(false)} style={{ color: 'var(--text-muted)' }}><X size={15} /></button>
          </div>

          <div className="max-h-[70vh] overflow-auto">
            {/* Resumo de pendências de AÇÃO → leva ao Meu Dia (sem executar aqui) */}
            {pendCount > 0 && (
              <button onClick={goMeuDia} className="w-full text-left px-4 py-3 flex items-start gap-2.5" style={{ background: 'var(--danger-bg)', borderBottom: '1px solid var(--border)' }}>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--danger-border)' }}>Você tem {pendCount} pendência{pendCount > 1 ? 's' : ''} aguardando ação</div>
                  <div className="text-[12px] mt-0.5 space-y-0.5" style={{ color: 'var(--text-muted)' }}>
                    {actions.slice(0, 3).map(a => <div key={a.key}>• {a.count} {a.title.toLowerCase()}</div>)}
                    {badges.overdue_tasks > 0 && <div>• {badges.overdue_tasks} tarefa(s) atrasada(s)</div>}
                  </div>
                </div>
                <span className="text-[11px] font-medium inline-flex items-center gap-1 shrink-0 mt-0.5" style={{ color: 'var(--primary)' }}>Ver no Meu Dia <ArrowRight size={12} /></span>
              </button>
            )}

            {/* Informativos (leve, sem botões de ação) */}
            {informativos.length === 0 && pendCount === 0 ? (
              <div className="px-4 py-8 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>Nada novo por aqui. 🎉</div>
            ) : informativos.map(n => (
              <button key={n.id} onClick={() => openItem(n)} className="w-full text-left px-4 py-2.5 flex items-start gap-2.5 ds-row-hover" style={{ borderBottom: '1px solid var(--border)' }}>
                {!n.viewed && <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: 'var(--primary)' }} />}
                {n.viewed && <span className="w-2 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{TIPO_L[n.type] ?? n.type}</span>
                    <span className="text-[13px] font-medium truncate" style={{ color: 'var(--text)' }}>{n.title}</span>
                    <span className="text-[10px] ml-auto shrink-0" style={{ color: 'var(--text-light)' }}>{dt(n.created_at)}</span>
                  </div>
                  {n.type === 'poll'
                    ? <span className="text-[11px] inline-flex items-center gap-1 mt-0.5" style={{ color: 'var(--primary)' }}><BarChart3 size={11} /> Responder enquete</span>
                    : <p className="text-[12px] mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{n.message.replace(/<[^>]*>/g, '').slice(0, 120)}</p>}
                </div>
              </button>
            ))}
          </div>

          <button onClick={() => { setOpen(false); router.push('/publicacoes') }} className="w-full px-4 py-2.5 text-[12px] font-medium inline-flex items-center justify-center gap-1.5" style={{ borderTop: '1px solid var(--border)', color: 'var(--primary)' }}>
            <Megaphone size={13} /> Ver publicações
          </button>
        </div>
      )}

      {/* Enquete em modal (votar é opinião, não execução de trabalho) */}
      {poll?.poll && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={() => setPoll(null)}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'var(--primary-soft)' }}>
              <BarChart3 size={16} style={{ color: 'var(--primary)' }} />
              <span className="text-sm font-bold flex-1" style={{ color: 'var(--primary)' }}>{poll.title}</span>
              <button onClick={() => setPoll(null)} style={{ color: 'var(--primary)' }}><X size={16} /></button>
            </div>
            <div className="p-4">
              <PollCard title={poll.title} priority="medium" poll={poll.poll} />
              {isHtmlBody(poll.message) && <div className="text-[12px] mt-2 hd-rich" style={{ color: 'var(--text-muted)' }} dangerouslySetInnerHTML={{ __html: sanitizeRich(poll.message) }} />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
