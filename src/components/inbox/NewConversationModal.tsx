'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search, Users, X } from 'lucide-react'
import {
  createDirectConversation, createGroupConversation, listChatUsers,
} from '@/lib/inbox'
import type { ChatUser } from '@/types/inbox'
import { PresenceDot } from './PresenceDot'

interface Props {
  onClose: () => void
  onCreated: (conversationId: number) => void
}

type Mode = 'direct' | 'group'

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
}

export function NewConversationModal({ onClose, onCreated }: Props) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<Mode>('direct')
  const [query, setQuery] = useState('')
  const [groupName, setGroupName] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)

  const { data, isFetching } = useQuery({
    queryKey: ['chat-users', query],
    queryFn: () => listChatUsers(query),
    refetchOnWindowFocus: false,
  })

  const users = useMemo<ChatUser[]>(() => data?.data ?? [], [data])

  useEffect(() => {
    setSelected(new Set())
  }, [mode])

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const submit = async () => {
    setBusy(true)
    try {
      let newId: number
      if (mode === 'direct') {
        const target = [...selected][0]
        if (!target) {
          toast.error('Selecione um usuário')
          return
        }
        const res = await createDirectConversation(target)
        newId = res.data.id
      } else {
        if (!groupName.trim()) {
          toast.error('Dê um nome ao grupo')
          return
        }
        if (selected.size === 0) {
          toast.error('Adicione pelo menos 1 participante')
          return
        }
        const res = await createGroupConversation(groupName.trim(), [...selected])
        newId = res.data.id
      }

      // Força refetch e ESPERA terminar antes de selecionar — evita race onde
      // selectedId aponta para conv ainda ausente no cache (composer não renderiza)
      await qc.refetchQueries({ queryKey: ['inbox-conversations'] })
      onCreated(newId)
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-100">Nova conversa</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X size={16} />
          </button>
        </header>

        <div className="px-4 pt-3 flex gap-1">
          <button
            type="button"
            onClick={() => setMode('direct')}
            className={[
              'px-3 py-1.5 text-xs uppercase tracking-wider rounded',
              mode === 'direct' ? 'bg-zinc-100 text-zinc-900 font-semibold' : 'text-zinc-400 hover:bg-zinc-800',
            ].join(' ')}
          >
            Direct (1:1)
          </button>
          <button
            type="button"
            onClick={() => setMode('group')}
            className={[
              'px-3 py-1.5 text-xs uppercase tracking-wider rounded inline-flex items-center gap-1.5',
              mode === 'group' ? 'bg-zinc-100 text-zinc-900 font-semibold' : 'text-zinc-400 hover:bg-zinc-800',
            ].join(' ')}
          >
            <Users size={12}/> Grupo
          </button>
        </div>

        {mode === 'group' && (
          <div className="px-4 pt-3 space-y-2">
            <input
              type="text"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Nome do grupo (ex.: Coordenadores)"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
            />
            <p className="text-[11px] text-zinc-500 px-0.5">
              Dê um nome ao grupo e selecione abaixo os <strong>usuários que farão parte</strong>. Para acessar grupos
              já existentes, use a lista de conversas à esquerda.
            </p>
          </div>
        )}

        <div className="px-4 pt-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={mode === 'group' ? 'Buscar usuários para adicionar ao grupo…' : 'Buscar pessoa por nome ou e-mail…'}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 mt-2">
          {isFetching && users.length === 0 ? (
            <p className="p-3 text-xs text-zinc-500">Buscando…</p>
          ) : users.length === 0 ? (
            <p className="p-3 text-xs text-zinc-500">Nenhum usuário encontrado.</p>
          ) : (
            <ul className="space-y-1">
              {users.map(u => {
                const isSel = selected.has(u.id)
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (mode === 'direct') {
                          setSelected(new Set([u.id]))
                        } else {
                          toggle(u.id)
                        }
                      }}
                      className={[
                        'w-full flex items-center gap-3 px-3 py-2 rounded transition-colors text-left',
                        isSel ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40' : 'hover:bg-zinc-900',
                      ].join(' ')}
                    >
                      <div className="relative">
                        <div className="w-9 h-9 rounded-md bg-zinc-800 text-zinc-300 flex items-center justify-center text-[11px] font-semibold ring-1 ring-zinc-700">
                          {initials(u.name)}
                        </div>
                        <PresenceDot status={u.presence.status} className="absolute -bottom-0.5 -right-0.5 border-2 border-zinc-950" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-200 truncate">{u.name}</p>
                        <p className="text-[11px] text-zinc-500 truncate">{u.email}</p>
                      </div>
                      {mode === 'group' && (
                        <input type="checkbox" checked={isSel} onChange={() => {}} className="accent-emerald-500 pointer-events-none" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <footer className="p-3 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">
            {mode === 'direct' ? '1 pessoa' : `${selected.size} selecionado(s)`}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 rounded">
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || (mode === 'direct' && selected.size === 0) || (mode === 'group' && (!groupName.trim() || selected.size === 0))}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-emerald-500 text-zinc-950 text-xs font-semibold hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {mode === 'direct' ? 'Iniciar conversa' : 'Criar grupo'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
