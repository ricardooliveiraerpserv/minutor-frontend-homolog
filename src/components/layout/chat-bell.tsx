'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, Volume2, VolumeX, Play } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { listConversations } from '@/lib/inbox'
import { isChatSoundOn, setChatSoundOn, playChatSound } from '@/lib/chat-prefs'
import { useAuth } from '@/hooks/use-auth'
import type { ConversationSummary } from '@/types/inbox'

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
}

function displayName(c: ConversationSummary): string {
  return c.other_user?.name ?? c.title ?? 'Conversa'
}

/**
 * Ícone de mensagens no header. Badge com total não lido; ao clicar abre uma
 * lista das conversas com mensagens novas (remetente + prévia + hora). Clicar
 * num item abre a conversa no /inbox. Compartilha o cache ['inbox-conversations'].
 */
export function ChatBell() {
  const router = useRouter()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setSoundOn(isChatSoundOn()) }, [open])

  const toggleSound = () => {
    const next = !soundOn
    setSoundOn(next)
    setChatSoundOn(next)
  }

  const { data } = useQuery({
    queryKey: ['inbox-conversations'],
    queryFn: listConversations,
    refetchInterval: 20_000,
    staleTime: 10_000,
  })

  const conversations = data?.data ?? []
  const total = conversations.reduce((s, c) => s + (c.unread_count ?? 0), 0)
  const unreadConvs = conversations
    .filter(c => c.unread_count > 0)
    .sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const go = (id: number) => { setOpen(false); router.push(`/inbox?c=${id}`) }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Mensagens"
        aria-label={total > 0 ? `Mensagens (${total} não lidas)` : 'Mensagens'}
        className="relative p-1 sm:p-1.5 rounded-md transition-colors hover:bg-zinc-800"
        style={{ color: total > 0 ? 'var(--primary)' : '#71717A' }}
      >
        <MessageCircle size={16} className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        {total > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center pointer-events-none"
            style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
          >
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1rem)] rounded-xl border shadow-xl z-[90] overflow-hidden"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="px-3 py-2 border-b flex items-center justify-between gap-2" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Mensagens</span>
            <div className="flex items-center gap-1.5">
              {total > 0 && <span className="text-[11px] mr-0.5" style={{ color: 'var(--text-light)' }}>{total} não lida{total > 1 ? 's' : ''}</span>}
              <button
                type="button"
                onClick={() => playChatSound(user?.chat_sound ?? undefined, user?.chat_sound_volume ?? undefined)}
                title="Ouvir o som"
                aria-label="Ouvir o som de mensagens"
                className="p-1 rounded-md transition-colors hover:bg-[var(--surface-hover)]"
                style={{ color: 'var(--text-light)' }}
              >
                <Play size={13} />
              </button>
              <button
                type="button"
                onClick={toggleSound}
                title={soundOn ? 'Som ligado — clique para silenciar' : 'Som desligado — clique para ativar'}
                aria-label={soundOn ? 'Silenciar som de mensagens' : 'Ativar som de mensagens'}
                className="p-1 rounded-md transition-colors hover:bg-[var(--surface-hover)]"
                style={{ color: soundOn ? 'var(--primary)' : 'var(--text-light)' }}
              >
                {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {unreadConvs.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm" style={{ color: 'var(--text-light)' }}>
                Nenhuma mensagem nova
              </div>
            ) : (
              unreadConvs.map(c => {
                const rel = c.last_message_at
                  ? formatDistanceToNow(new Date(c.last_message_at), { addSuffix: false, locale: ptBR })
                  : ''
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => go(c.id)}
                    className="w-full text-left px-3 py-2.5 flex items-start gap-3 border-b transition-colors hover:bg-[var(--surface-hover)]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-semibold shrink-0"
                      style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
                    >
                      {initials(displayName(c))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{displayName(c)}</span>
                        {rel && <span className="text-[10px] shrink-0" style={{ color: 'var(--text-light)' }}>{rel}</span>}
                      </div>
                      <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>
                        {c.last_message?.preview || 'Nova mensagem'}
                      </p>
                    </div>
                    <span
                      className="shrink-0 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center mt-1"
                      style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
                    >
                      {c.unread_count > 9 ? '9+' : c.unread_count}
                    </span>
                  </button>
                )
              })
            )}
          </div>

          <button
            type="button"
            onClick={() => { setOpen(false); router.push('/inbox') }}
            className="w-full px-3 py-2 text-center text-xs font-semibold transition-colors hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--primary)' }}
          >
            Abrir chat
          </button>
        </div>
      )}
    </div>
  )
}
