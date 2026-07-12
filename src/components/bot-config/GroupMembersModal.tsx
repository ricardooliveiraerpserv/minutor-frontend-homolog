'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search, UserMinus, UserPlus, X } from 'lucide-react'
import {
  addGroupMember, getGroupMembers, listGroupUserOptions, removeGroupMember,
} from '@/lib/bot-config'
import type { AdminGroup } from '@/lib/bot-config'

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
}

export function GroupMembersModal({ group, onClose }: { group: AdminGroup; onClose: () => void }) {
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: membersRes } = useQuery({
    queryKey: ['group-members', group.id],
    queryFn: () => getGroupMembers(group.id),
  })
  const members = membersRes?.data.members ?? []
  const memberIds = new Set(members.map(m => m.user_id))

  const { data: usersRes } = useQuery({
    queryKey: ['group-user-options', query],
    queryFn: () => listGroupUserOptions(query),
  })
  const candidates = (usersRes?.data ?? []).filter(u => !memberIds.has(u.id))

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['group-members', group.id] })
    await qc.invalidateQueries({ queryKey: ['admin-groups'] })
  }

  const add = async (userId: number) => {
    setBusy(true)
    try {
      await addGroupMember(group.id, userId)
      await refresh()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const remove = async (userId: number, name: string | null) => {
    if (!confirm(`Remover ${name ?? 'usuário'} do grupo "${group.title}"?`)) return
    setBusy(true)
    try {
      await removeGroupMember(group.id, userId)
      await refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-[var(--surface)] border border-[var(--brand-border)] rounded-lg shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-[var(--brand-border)]">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">Membros · {group.title}</h2>
            <p className="text-[11px] text-[var(--text-light)]">{members.length} participante(s)</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-[var(--text-light)] hover:text-[var(--text)]">
            <X size={16} />
          </button>
        </header>

        <div className="grid grid-cols-2 gap-0 flex-1 overflow-hidden">
          {/* Membros atuais */}
          <div className="border-r border-[var(--brand-border)] overflow-y-auto p-3">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-light)] mb-2">No grupo</p>
            <ul className="space-y-1">
              {members.map(m => (
                <li key={m.user_id} className="flex items-center gap-2 p-2 rounded hover:bg-[var(--surface-hover)]">
                  <div className="w-7 h-7 rounded-md bg-[var(--surface-hover)] text-[var(--text)] flex items-center justify-center text-[10px] font-semibold ring-1 ring-[var(--brand-border)]">
                    {initials(m.name ?? '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--text)] truncate">{m.name}</p>
                    <p className="text-[10px] text-[var(--text-light)]">{m.is_creator ? 'criador' : m.role}</p>
                  </div>
                  {!m.is_creator && (
                    <button
                      type="button" disabled={busy}
                      onClick={() => remove(m.user_id, m.name)}
                      aria-label="Remover membro"
                      className="text-red-600 dark:text-red-300 hover:bg-red-500/10 p-1 rounded"
                    >
                      <UserMinus size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Adicionar */}
          <div className="overflow-y-auto p-3 flex flex-col">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-light)] mb-2">Adicionar</p>
            <div className="relative mb-2">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-light)]" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar usuário..."
                className="w-full bg-[var(--bg)] border border-[var(--brand-border)] rounded pl-7 pr-2 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-light)] focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <ul className="space-y-1 flex-1">
              {candidates.length === 0 ? (
                <li className="text-[11px] text-[var(--text-light)] italic p-2">Nenhum usuário disponível.</li>
              ) : candidates.map(u => (
                <li key={u.id} className="flex items-center gap-2 p-2 rounded hover:bg-[var(--surface-hover)]">
                  <div className="w-7 h-7 rounded-md bg-[var(--surface-hover)] text-[var(--text)] flex items-center justify-center text-[10px] font-semibold ring-1 ring-[var(--brand-border)]">
                    {initials(u.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--text)] truncate">{u.name}</p>
                    <p className="text-[10px] text-[var(--text-light)] truncate">{u.email}</p>
                  </div>
                  <button
                    type="button" disabled={busy}
                    onClick={() => add(u.id)}
                    aria-label="Adicionar ao grupo"
                    className="text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 p-1 rounded"
                  >
                    <UserPlus size={13} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
