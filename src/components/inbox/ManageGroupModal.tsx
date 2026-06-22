'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search, UserMinus, UserPlus, X } from 'lucide-react'
import { getGroupMembers, listGroupUserOptions, addGroupMember, removeGroupMember } from '@/lib/bot-config'

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
}

interface Props {
  conversationId: number
  title: string
  onClose: () => void
}

export function ManageGroupModal({ conversationId, title, onClose }: Props) {
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: membersRes, refetch: refetchMembers } = useQuery({
    queryKey: ['inbox-group-members', conversationId],
    queryFn: () => getGroupMembers(conversationId),
  })
  const members = membersRes?.data.members ?? []
  const memberIds = new Set(members.map(m => m.user_id))

  const { data: usersRes } = useQuery({
    queryKey: ['inbox-group-user-options', query],
    queryFn: () => listGroupUserOptions(query),
  })
  const candidates = (usersRes?.data ?? []).filter(u => !memberIds.has(u.id))

  const refresh = async () => {
    await refetchMembers()
    await qc.invalidateQueries({ queryKey: ['inbox-conversations'] })
  }

  const add = async (userId: number) => {
    setBusy(true)
    try {
      await addGroupMember(conversationId, userId)
      await refresh()
      toast.success('Membro adicionado')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (userId: number, name: string | null) => {
    if (!confirm(`Remover ${name ?? 'este usuário'} do grupo?`)) return
    setBusy(true)
    try {
      await removeGroupMember(conversationId, userId)
      await refresh()
      toast.success('Membro removido')
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
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Gerenciar membros · {title}</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-200"><X size={16}/></button>
        </div>

        {/* Membros atuais */}
        <div>
          <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-2">Membros ({members.length})</p>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {members.length === 0 && <p className="text-xs text-zinc-500">Sem membros.</p>}
            {members.map(m => (
              <div key={m.user_id} className="flex items-center gap-3 p-2 rounded border border-zinc-800/60 bg-zinc-900/30">
                <div className="w-8 h-8 rounded-md bg-zinc-800 text-zinc-200 flex items-center justify-center text-xs font-semibold shrink-0">
                  {initials(m.name ?? '?')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-100 truncate">
                    {m.name}
                    {m.is_creator && <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">Criador</span>}
                  </p>
                  <p className="text-[11px] text-zinc-500 truncate">{m.email}</p>
                </div>
                {!m.is_creator && (
                  <button
                    type="button"
                    onClick={() => remove(m.user_id, m.name)}
                    disabled={busy}
                    title="Remover membro"
                    className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <UserMinus size={14}/>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Adicionar membros */}
        <div className="pt-4 border-t border-zinc-800">
          <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-2">Adicionar usuários</p>
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por nome ou e-mail..."
              className="w-full bg-zinc-900 border border-zinc-700 rounded pl-8 pr-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {candidates.length === 0 && (
              <p className="text-xs text-zinc-500 px-1">
                {query ? 'Nenhum usuário encontrado.' : 'Digite para buscar usuários...'}
              </p>
            )}
            {candidates.slice(0, 50).map(u => (
              <div key={u.id} className="flex items-center gap-3 p-2 rounded hover:bg-zinc-900/50">
                <div className="w-8 h-8 rounded-md bg-zinc-800 text-zinc-200 flex items-center justify-center text-xs font-semibold shrink-0">
                  {initials(u.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-100 truncate">{u.name}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{u.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => add(u.id)}
                  disabled={busy}
                  title="Adicionar"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-50"
                >
                  <UserPlus size={12}/> Adicionar
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-1.5 rounded text-xs text-zinc-300 hover:bg-zinc-800">Fechar</button>
        </div>
      </div>
    </div>
  )
}
