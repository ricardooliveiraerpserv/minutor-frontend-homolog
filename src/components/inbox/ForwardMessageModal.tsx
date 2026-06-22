'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Forward, Search, X } from 'lucide-react'
import { listConversations, sendMessage } from '@/lib/inbox'
import type { ConversationSummary, InboxMessage } from '@/types/inbox'

interface Props {
  message: InboxMessage
  onClose: () => void
}

export function ForwardMessageModal({ message, onClose }: Props) {
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const { data } = useQuery({
    queryKey: ['inbox-conversations'],
    queryFn: listConversations,
    staleTime: 30_000,
  })
  const allConvs = data?.data ?? []

  const list = useMemo(() => {
    const eligible = allConvs.filter(c => c.type !== 'bot' && c.id !== message.conversation_id)
    const q = query.trim().toLowerCase()
    if (!q) return eligible
    return eligible.filter(c =>
      c.title?.toLowerCase().includes(q)
      || c.other_user?.name?.toLowerCase().includes(q)
    )
  }, [allConvs, query, message.conversation_id])

  const forwardTo = async (target: ConversationSummary) => {
    setBusy(true)
    try {
      const senderName = message.sender?.name ?? 'usuário'
      const meta = {
        forwarded_from_user: senderName,
        forwarded_from_message_id: message.id,
      }
      await sendMessage(target.id, message.body, { metadata: meta })
      await qc.invalidateQueries({ queryKey: ['inbox-conversations'] })
      toast.success(`Encaminhada para ${target.title}`)
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-lg p-5 space-y-4 max-h-[80vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100 inline-flex items-center gap-2">
            <Forward size={14}/> Encaminhar mensagem
          </h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-200"><X size={16}/></button>
        </div>

        {/* Preview */}
        <div className="rounded-md bg-zinc-900/40 border border-zinc-800 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Conteúdo</p>
          <p className="text-xs text-zinc-300 line-clamp-3 whitespace-pre-wrap">
            {message.body || '[anexo]'}
          </p>
          <p className="text-[10px] text-zinc-500 mt-1">de {message.sender?.name ?? 'usuário'}</p>
          {(message.attachments?.length ?? 0) > 0 && (
            <p className="text-[10px] text-amber-500 mt-1">
              ⚠ Os {message.attachments?.length} anexo(s) não serão encaminhados (envie o arquivo original separadamente).
            </p>
          )}
        </div>

        {/* Busca */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"/>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar conversa por nome…"
            className="w-full bg-zinc-900 border border-zinc-700 rounded pl-8 pr-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto space-y-1">
          {list.length === 0 && <p className="text-xs text-zinc-500 px-1">Nenhuma conversa encontrada.</p>}
          {list.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => forwardTo(c)}
              disabled={busy}
              className="w-full flex items-center gap-3 p-2 rounded hover:bg-zinc-900/70 text-left disabled:opacity-50"
            >
              {c.avatar_url ? (
                <img src={c.avatar_url} alt={c.title} className="w-8 h-8 rounded-md object-cover shrink-0"/>
              ) : (
                <div className="w-8 h-8 rounded-md bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs font-semibold shrink-0">
                  {(c.title || '?').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-100 truncate">{c.title}</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{c.type === 'group' ? 'Grupo' : 'Direta'}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
