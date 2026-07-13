'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { X, MessageCircle } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { listConversations } from '@/lib/inbox'
import { isChatSoundOn } from '@/lib/chat-prefs'
import type { ConversationSummary } from '@/types/inbox'

interface Popup {
  key: string
  convId: number
  name: string
  preview: string
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
}

/** "Ding" curto de 2 notas via Web Audio — sem arquivo de áudio, sem rede. */
function playPing() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime
    ;[880, 1180].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = now + i * 0.12
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.25, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(t); osc.stop(t + 0.2)
    })
    setTimeout(() => ctx.close().catch(() => {}), 700)
  } catch { /* navegador bloqueou áudio até interação — silêncio */ }
}

function displayName(c: ConversationSummary): string {
  return c.other_user?.name ?? c.title ?? 'Conversa'
}

/**
 * Notificador global de mensagens de chat.
 *
 * Montado nos Providers → roda em qualquer tela. A cada poll compara o último
 * message id de cada conversa; quando chega mensagem nova NÃO lida, sobe um
 * pop-up no canto inferior direito (some sozinho em 7s; clicar abre a conversa).
 * Não notifica enquanto o usuário está na própria tela do chat (/inbox).
 * Compartilha o cache ['inbox-conversations'] com o header e o Inbox (1 request só).
 */
export function ChatNotifier() {
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const onInbox = pathname?.startsWith('/inbox') ?? false

  const { data } = useQuery({
    queryKey: ['inbox-conversations'],
    queryFn: listConversations,
    enabled: !!user,
    refetchInterval: 20_000,
  })

  const lastSeen = useRef<Record<number, number>>({})
  const initialized = useRef(false)
  const [popups, setPopups] = useState<Popup[]>([])

  useEffect(() => {
    const convs = data?.data
    if (!convs) return

    // Primeiro carregamento: só estabelece a linha de base, sem notificar.
    if (!initialized.current) {
      convs.forEach(c => { if (c.last_message) lastSeen.current[c.id] = c.last_message.id })
      initialized.current = true
      return
    }

    const fresh: Popup[] = []
    convs.forEach(c => {
      const lm = c.last_message
      if (!lm) return
      const prev = lastSeen.current[c.id] ?? 0
      // Mensagem nova (id maior) E ainda não lida → é de outra pessoa/bot.
      if (lm.id > prev && c.unread_count > 0 && !onInbox) {
        fresh.push({ key: `${c.id}-${lm.id}`, convId: c.id, name: displayName(c), preview: lm.preview || 'Nova mensagem' })
      }
      lastSeen.current[c.id] = lm.id
    })

    if (fresh.length) {
      setPopups(prev => [...fresh, ...prev].slice(0, 4))
      if (isChatSoundOn()) playPing()
    }
  }, [data, onInbox])

  // Auto-dismiss de cada pop-up após 7s.
  useEffect(() => {
    if (!popups.length) return
    const timers = popups.map(p =>
      setTimeout(() => setPopups(prev => prev.filter(x => x.key !== p.key)), 7000),
    )
    return () => timers.forEach(clearTimeout)
  }, [popups])

  const dismiss = (key: string) => setPopups(prev => prev.filter(x => x.key !== key))
  const open = (convId: number, key: string) => { dismiss(key); router.push(`/inbox?c=${convId}`) }

  if (!popups.length) return null

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2.5 w-[400px] max-w-[calc(100vw-2rem)]">
      {popups.map(p => (
        <div
          key={p.key}
          role="button"
          tabIndex={0}
          onClick={() => open(p.convId, p.key)}
          onKeyDown={e => { if (e.key === 'Enter') open(p.convId, p.key) }}
          className="group cursor-pointer rounded-2xl border shadow-xl p-4 flex items-start gap-3.5 animate-in slide-in-from-bottom-2 fade-in duration-200"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-semibold shrink-0"
            style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
          >
            {initials(p.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <MessageCircle size={14} style={{ color: 'var(--primary)' }} />
              <span className="text-base font-semibold truncate" style={{ color: 'var(--text)' }}>{p.name}</span>
            </div>
            <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{p.preview}</p>
          </div>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); dismiss(p.key) }}
            className="shrink-0 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: 'var(--text-light)' }}
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
