'use client'

// Gestão da ACL de um ambiente. Duas camadas:
//  • POR MEMBRO (custom) — sobrepõe tudo; sem marcação = herda de grupo ou do papel.
//  • POR GRUPO (Grupo de Consultores) — HERANÇA AUTOMÁTICA: todo membro do grupo herda,
//    inclusive quem entrar no grupo depois (resolvido no servidor em tempo de leitura).
// Precedência: custom-usuário > união dos grupos > padrão do papel. Só admin abre.

import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Modal } from '@/components/ds'
import { SearchSelect } from '@/components/ui/search-select'
import { api, ApiError } from '@/lib/api'

interface PermRow {
  user_id: number; name: string; email: string; role: string; has_custom: boolean; source: string
  can_view: boolean; can_reveal: boolean; can_copy: boolean; can_manage: boolean; can_admin: boolean
}
interface GroupRow {
  group_id: number; name: string; members: number; has_perm: boolean
  can_view: boolean; can_reveal: boolean; can_copy: boolean; can_manage: boolean; can_admin: boolean
}

const OPS: { key: 'can_view' | 'can_reveal' | 'can_copy' | 'can_manage' | 'can_admin'; label: string }[] = [
  { key: 'can_view', label: 'Ver' }, { key: 'can_reveal', label: 'Revelar' }, { key: 'can_copy', label: 'Copiar' },
  { key: 'can_manage', label: 'Gerenciar' }, { key: 'can_admin', label: 'Admin' },
]
const ROLE_LABEL: Record<string, string> = { admin: 'Admin', write: 'Edita', read: 'Lê' }
type Flags = { can_view: boolean; can_reveal: boolean; can_copy: boolean; can_manage: boolean; can_admin: boolean }
const EMPTY_FLAGS: Flags = { can_view: true, can_reveal: false, can_copy: false, can_manage: false, can_admin: false }

export function EnvPermissionsModal({ open, onClose, envId }: { open: boolean; onClose: () => void; envId: number }) {
  const [rows, setRows] = useState<PermRow[]>([])
  const [savingId, setSavingId] = useState<number | null>(null)
  // ACL por grupo (herança automática)
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [gPick, setGPick] = useState<number | ''>('')
  const [gFlags, setGFlags] = useState<Flags>(EMPTY_FLAGS)
  const [gSaving, setGSaving] = useState(false)

  const load = useCallback(async () => {
    const [perms, grps] = await Promise.all([
      api.get<PermRow[]>(`/environments/environments/${envId}/permissions`),
      api.get<GroupRow[]>(`/environments/environments/${envId}/group-permissions`).catch(() => [] as GroupRow[]),
    ])
    setRows(perms); setGroups(grps)
  }, [envId])
  useEffect(() => { if (open) { void load(); setGPick(''); setGFlags(EMPTY_FLAGS) } }, [open, load])

  // Ao escolher um grupo, carrega as marcações atuais dele (ou o default).
  const pickGroup = (id: number | '') => {
    setGPick(id)
    const g = groups.find(x => x.group_id === id)
    setGFlags(g && g.has_perm
      ? { can_view: g.can_view, can_reveal: g.can_reveal, can_copy: g.can_copy, can_manage: g.can_manage, can_admin: g.can_admin }
      : EMPTY_FLAGS)
  }

  const saveGroup = async () => {
    if (gPick === '') return
    setGSaving(true)
    try {
      await api.put(`/environments/environments/${envId}/group-permissions/${gPick}`, gFlags)
      toast.success('Permissão da equipe salva — os membros herdam automaticamente.')
      setGPick(''); setGFlags(EMPTY_FLAGS); await load()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Falha ao salvar permissão da equipe.') }
    finally { setGSaving(false) }
  }

  const removeGroup = async (groupId: number) => {
    try {
      await api.delete(`/environments/environments/${envId}/group-permissions/${groupId}`)
      toast.success('Herança da equipe removida.'); await load()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Falha ao remover.') }
  }

  const save = async (r: PermRow, patch: Partial<PermRow>) => {
    const next = { ...r, ...patch }
    setSavingId(r.user_id)
    setRows(rs => rs.map(x => x.user_id === r.user_id ? { ...next, has_custom: true, source: 'custom' } : x))
    try {
      await api.put(`/environments/environments/${envId}/permissions/${r.user_id}`, {
        can_view: next.can_view, can_reveal: next.can_reveal, can_copy: next.can_copy, can_manage: next.can_manage, can_admin: next.can_admin,
      })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao salvar.')
      void load()
    } finally { setSavingId(null) }
  }

  const reset = async (r: PermRow) => {
    try { await api.delete(`/environments/environments/${envId}/permissions/${r.user_id}`); void load() }
    catch (err) { toast.error(err instanceof ApiError ? err.message : 'Falha ao redefinir.') }
  }

  const withPerm = groups.filter(g => g.has_perm)

  return (
    <Modal open={open} onClose={onClose} title="Permissões do ambiente" width="max-w-2xl">
      <div className="flex flex-col gap-3">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Defina por <b>membro</b> ou por <b>equipe</b>. Precedência: marcação do membro &gt; herança da equipe &gt; padrão do papel.
        </p>
        <div className="overflow-x-auto">
          <table className="ds-table w-full">
            <thead>
              <tr>
                <th>Membro</th>
                {OPS.map(o => <th key={o.key} className="text-center">{o.label}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.user_id} style={{ opacity: savingId === r.user_id ? 0.6 : 1 }}>
                  <td>
                    <div className="text-sm" style={{ color: 'var(--text)' }}>{r.name}</div>
                    <div className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      {r.email}{' '}
                      {r.has_custom
                        ? <Badge variant="primary">Personalizado</Badge>
                        : r.source === 'group'
                          ? <Badge variant="success">Equipe</Badge>
                          : <Badge>{ROLE_LABEL[r.role] ?? r.role}</Badge>}
                    </div>
                  </td>
                  {OPS.map(o => (
                    <td key={o.key} className="text-center">
                      <input type="checkbox" checked={r[o.key]} onChange={e => save(r, { [o.key]: e.target.checked })} />
                    </td>
                  ))}
                  <td className="text-right">
                    {r.has_custom && (
                      <button type="button" className="p-1.5 rounded hover:opacity-80" style={{ color: 'var(--text-muted)' }} title="Voltar ao padrão (herda de grupo/papel)" onClick={() => reset(r)}>
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── ACL POR GRUPO (herança automática) ── */}
        {groups.length > 0 && (
          <div className="flex flex-col gap-2 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Permissão por equipe (Grupo de Consultores)</p>
            <p className="text-xs" style={{ color: 'var(--text-light)' }}>A permissão é do grupo — <b>todo membro herda automaticamente</b>, inclusive quem entrar depois. Marcação individual acima sobrepõe.</p>

            {/* Grupos que já têm permissão */}
            {withPerm.length > 0 && (
              <div className="flex flex-col gap-1">
                {withPerm.map(g => (
                  <div key={g.group_id} className="flex items-center justify-between text-sm px-2 py-1.5 rounded-lg" style={{ background: 'var(--surface-hover)' }}>
                    <span style={{ color: 'var(--text)' }}>
                      <Badge variant="success">{g.name}</Badge>{' '}
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {OPS.filter(o => g[o.key]).map(o => o.label).join(' · ') || 'sem permissão'} · {g.members} membro(s)
                      </span>
                    </span>
                    <div className="flex items-center gap-1">
                      <button type="button" className="text-xs hover:underline" style={{ color: 'var(--primary)' }} onClick={() => pickGroup(g.group_id)}>editar</button>
                      <button type="button" className="p-1 rounded hover:opacity-80" style={{ color: 'var(--danger)' }} title="Remover herança" onClick={() => removeGroup(g.group_id)}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Editor: escolher grupo + marcar + salvar */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <SearchSelect label="Equipe" placeholder="Buscar equipe…" value={gPick} onChange={v => pickGroup(v === '' ? '' : Number(v))} options={groups.map(g => ({ id: g.group_id, name: `${g.name} — ${g.members} membro(s)` }))} fullWidth />
              </div>
              {OPS.map(o => (
                <label key={o.key} className="flex items-center gap-1.5 text-xs" style={{ color: gPick === '' ? 'var(--text-light)' : 'var(--text)' }}>
                  <input type="checkbox" disabled={gPick === ''} checked={gFlags[o.key]} onChange={e => setGFlags(f => ({ ...f, [o.key]: e.target.checked }))} /> {o.label}
                </label>
              ))}
              <Button variant="secondary" loading={gSaving} disabled={gPick === ''} onClick={saveGroup}>Salvar permissão da equipe</Button>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  )
}
