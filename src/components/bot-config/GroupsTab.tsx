'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Users, Pencil, Trash2, UsersRound, Sparkles } from 'lucide-react'
import {
  createGroupAdmin, deleteGroup, listGroups, renameGroup, seedDefaultGroups,
} from '@/lib/bot-config'
import type { AdminGroup } from '@/lib/bot-config'
import { Skeleton } from '@/components/ui/skeleton'
import { GroupMembersModal } from './GroupMembersModal'

const DEFAULTS = ['Coordenadores', 'Sustentação', 'Financeiro', 'Customer Success', 'Projetos', 'Diretoria']

export function GroupsTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['admin-groups'], queryFn: listGroups })
  const [managing, setManaging] = useState<AdminGroup | null>(null)
  const [busy, setBusy] = useState(false)

  if (isLoading) return <Skeleton className="h-40 bg-[var(--surface-hover)]" />
  const groups = data?.data ?? []

  const existingTitles = new Set(groups.map(g => g.title))
  const missingDefaults = DEFAULTS.filter(d => !existingTitles.has(d))

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-groups'] })

  const create = async () => {
    const name = prompt('Nome do novo grupo:')?.trim()
    if (!name) return
    setBusy(true)
    try {
      await createGroupAdmin(name)
      await refresh()
      toast.success(`Grupo "${name}" criado`)
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const rename = async (g: AdminGroup) => {
    const name = prompt('Novo nome:', g.title ?? '')?.trim()
    if (!name || name === g.title) return
    setBusy(true)
    try {
      await renameGroup(g.id, name)
      await refresh()
      toast.success('Grupo renomeado')
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const remove = async (g: AdminGroup) => {
    if (!confirm(`Excluir o grupo "${g.title}"?\n\nTodas as mensagens do grupo serão apagadas. Esta ação não pode ser desfeita.`)) return
    setBusy(true)
    try {
      await deleteGroup(g.id)
      await refresh()
      toast.success('Grupo excluído')
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const seed = async () => {
    setBusy(true)
    try {
      const res = await seedDefaultGroups()
      await refresh()
      const n = res.data.created.length
      toast.success(n > 0 ? `${n} grupo(s) padrão criado(s)` : 'Todos os grupos padrão já existem')
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-[var(--text-light)] flex-1">
          Grupos operacionais recebem alertas do BOT (via regras de notificação) e permitem conversa entre membros. Só admin/executivo gerencia aqui.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {missingDefaults.length > 0 && (
            <button
              type="button" onClick={seed} disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-violet-500/40 text-violet-700 dark:text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 text-xs font-semibold disabled:opacity-50"
            >
              <Sparkles size={12} /> Criar padrão ({missingDefaults.length})
            </button>
          )}
          <button
            type="button" onClick={create} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-400 disabled:opacity-50"
          >
            <Plus size={12} /> Novo grupo
          </button>
        </div>
      </div>

      {missingDefaults.length > 0 && (
        <div className="text-[11px] text-[var(--text-light)] bg-[var(--surface-hover)]/50 border border-[var(--brand-border)] rounded px-3 py-2">
          Grupos padrão ainda não criados: <strong className="text-[var(--text-muted)]">{missingDefaults.join(', ')}</strong>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="p-6 text-center text-xs text-[var(--text-light)] border border-dashed border-[var(--brand-border)] rounded-md">
          Nenhum grupo ainda. Crie os grupos operacionais padrão ou um novo grupo.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {groups.map(g => (
            <div key={g.id} className="border border-[var(--brand-border)] rounded-md bg-[var(--surface)] p-3 flex items-start gap-3">
              <div className="w-9 h-9 rounded-md bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500/30 flex items-center justify-center shrink-0">
                <Users size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-[var(--text)] truncate">{g.title}</h3>
                <p className="text-[11px] text-[var(--text-light)] mt-0.5">{g.members_count} membro(s)</p>
                <div className="mt-2 flex items-center gap-1">
                  <button
                    type="button" onClick={() => setManaging(g)}
                    className="text-[11px] text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 px-2 py-1 rounded inline-flex items-center gap-1"
                  >
                    <UsersRound size={11} /> Membros
                  </button>
                  <button
                    type="button" onClick={() => rename(g)} disabled={busy}
                    className="text-[11px] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] px-2 py-1 rounded inline-flex items-center gap-1"
                  >
                    <Pencil size={11} /> Renomear
                  </button>
                  <button
                    type="button" onClick={() => remove(g)} disabled={busy}
                    aria-label="Excluir grupo"
                    className="text-[11px] text-red-600 dark:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded inline-flex items-center gap-1"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {managing && <GroupMembersModal group={managing} onClose={() => setManaging(null)} />}
    </div>
  )
}
