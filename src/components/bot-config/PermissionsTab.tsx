'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  type BotPermissionProfile,
  listPermissionProfiles, updatePermissionProfile,
} from '@/lib/bot-config'
import { Skeleton } from '@/components/ui/skeleton'
import { BotScopesEditor } from '@/components/users/BotScopesEditor'
import { BotVisibilityEditor } from '@/components/users/BotVisibilityEditor'

function ProfileCard({ profile }: { profile: BotPermissionProfile }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<BotPermissionProfile>(profile)
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile)

  const save = async () => {
    setBusy(true)
    try {
      await updatePermissionProfile(profile.profile_type, {
        label: draft.label,
        description: draft.description,
        can_use_bot: draft.can_use_bot,
        allowed_scopes: draft.allowed_scopes,
        visibility: draft.visibility,
        scope_overrides: draft.scope_overrides,
      })
      await qc.invalidateQueries({ queryKey: ['bot-permission-profiles'] })
      toast.success(`"${draft.label}" salvo`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-zinc-800 rounded-md bg-zinc-900/30 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-md bg-zinc-800 text-violet-300 flex items-center justify-center shrink-0 ring-1 ring-violet-500/30">
          <ShieldCheck size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-100">{profile.label}</h3>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
              {profile.profile_type}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Política aplicada por padrão ao criar um usuário deste perfil.
            Cada user pode sobrescrever no próprio cadastro.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500 text-zinc-950 text-xs font-semibold hover:bg-emerald-400 disabled:opacity-40"
        >
          <Save size={12}/> Salvar
        </button>
      </div>

      <div>
        <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Descrição</label>
        <input
          value={draft.description ?? ''}
          onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
        />
      </div>

      <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
        <input
          type="checkbox"
          checked={draft.can_use_bot}
          onChange={e => setDraft(d => ({ ...d, can_use_bot: e.target.checked }))}
          className="accent-emerald-500"
        />
        Pode usar @bot por padrão
      </label>

      {draft.can_use_bot && (
        <>
          <BotScopesEditor
            value={draft.allowed_scopes}
            onChange={v => setDraft(d => ({ ...d, allowed_scopes: v }))}
          />
          <BotVisibilityEditor
            visibility={draft.visibility}
            overrides={draft.scope_overrides}
            onChangeVisibility={v => setDraft(d => ({ ...d, visibility: v }))}
            onChangeOverrides={o => setDraft(d => ({ ...d, scope_overrides: o }))}
          />
        </>
      )}
    </div>
  )
}

export function PermissionsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['bot-permission-profiles'],
    queryFn: listPermissionProfiles,
  })

  if (isLoading) return <Skeleton className="h-40 bg-zinc-800" />
  const profiles = data?.data ?? []

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-zinc-900/40 border border-zinc-800 p-3">
        <div className="flex items-center gap-2 text-zinc-300 text-sm font-medium">
          <ShieldCheck size={14}/> Permissões padrão do BOT por perfil
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          Configure quem pode usar o BOT e quais dados cada perfil enxerga.
          Estes valores viram o <strong>default</strong> aplicado ao criar um novo usuário.
          O cadastro do usuário individual pode sobrescrever caso a caso.
        </p>
      </div>

      {profiles.map(p => (
        <ProfileCard key={p.profile_type} profile={p} />
      ))}
    </div>
  )
}
