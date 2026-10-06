'use client'

// Compartilhamento do cofre do cliente entre a equipe. Adicionar (por usuário ou por
// Grupo de Consultores) RE-WRAPA a chave do cofre no client com a chave PÚBLICA do novo
// membro — o servidor nunca vê a chave. Listar/adicionar/mudar papel reusam os endpoints
// /vault/* (funcionam em cofre type='client'); a REMOÇÃO usa o endpoint aditivo do módulo
// de ambientes (revoga a membership; o gate do reveal corta o acesso na hora).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2, UserPlus, Users, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Modal, TextInput } from '@/components/ds'
import { SearchSelect } from '@/components/ui/search-select'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { rsaWrap } from '@/lib/vault-crypto'

interface MemberRow { user_id: number; name: string; email: string; role: 'admin' | 'write' | 'read'; key_version: number }
interface PublicKeyRow { user_id: number; name: string; email: string; public_key: string | null; configured: boolean }
interface TeamMember { user_id: number; name: string; email: string; public_key: string }
interface TeamRow { id: number; name: string; members: TeamMember[]; total: number; not_configured: number }

const ROLE_LABEL: Record<MemberRow['role'], string> = { admin: 'Admin', write: 'Edita', read: 'Lê' }

interface Props {
  open: boolean
  onClose: () => void
  vaultId: number
  customerId: number
  vaultName: string
  getVaultKeyBytes: () => Promise<Uint8Array | null>
  isVaultAdmin: boolean
  onChanged: () => void
}

export function EnvMembersModal({ open, onClose, vaultId, customerId, vaultName, getVaultKeyBytes, isVaultAdmin, onChanged }: Props) {
  const { user } = useAuth()
  const [members, setMembers] = useState<MemberRow[]>([])
  const [candidates, setCandidates] = useState<PublicKeyRow[]>([])
  const [role, setRole] = useState<MemberRow['role']>('read')
  const [busy, setBusy] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null)
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [teamPick, setTeamPick] = useState<number | ''>('')
  const [teamRole, setTeamRole] = useState<MemberRow['role']>('read')
  const [teamBusy, setTeamBusy] = useState(false)
  const [candQ, setCandQ] = useState('')

  const load = useCallback(async () => {
    const rows = await api.get<MemberRow[]>(`/vault/vaults/${vaultId}/members`)
    setMembers(rows)
    if (isVaultAdmin) {
      const keys = await api.get<PublicKeyRow[]>('/vault/allocatable-users')
      const memberIds = new Set(rows.map(r => r.user_id))
      setCandidates(keys.filter(k => !memberIds.has(k.user_id)))
      setTeams(await api.get<TeamRow[]>('/vault/teams'))
    }
  }, [vaultId, isVaultAdmin])

  const filteredCandidates = useMemo(() => {
    const q = candQ.trim().toLowerCase()
    const base = q ? candidates.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) : candidates
    return [...base].sort((a, b) => Number(b.configured) - Number(a.configured) || a.name.localeCompare(b.name, 'pt-BR'))
  }, [candidates, candQ])

  useEffect(() => {
    if (open) { void load(); setRole('read'); setRemoveTarget(null); setTeamPick(''); setTeamRole('read'); setCandQ('') }
  }, [open, load])

  const add = async (target: PublicKeyRow) => {
    if (!target.configured || !target.public_key) return
    setBusy(true)
    try {
      const keyBytes = await getVaultKeyBytes()
      if (!keyBytes) throw new Error('Cofre travado ou sem acesso à chave deste cliente.')
      await api.post(`/vault/vaults/${vaultId}/members`, {
        user_id: target.user_id, role, encrypted_vault_key: await rsaWrap(target.public_key, keyBytes),
      })
      toast.success(`${target.name} agora tem acesso a este cliente.`)
      await load(); onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : (err instanceof Error ? err.message : 'Falha ao adicionar membro.'))
    } finally { setBusy(false) }
  }

  /** Adiciona todos os membros aptos de uma equipe (que já configuraram o cofre). */
  const addTeam = async () => {
    const team = teams.find(t => t.id === teamPick)
    if (!team) return
    const memberIds = new Set(members.map(m => m.user_id))
    const toAdd = team.members.filter(m => !memberIds.has(m.user_id))
    if (toAdd.length === 0) { toast.info('Todos os membros aptos desta equipe já têm acesso.'); return }
    setTeamBusy(true)
    try {
      const keyBytes = await getVaultKeyBytes()
      if (!keyBytes) throw new Error('Cofre travado ou sem acesso à chave deste cliente.')
      let added = 0
      for (const m of toAdd) {
        try {
          await api.post(`/vault/vaults/${vaultId}/members`, { user_id: m.user_id, role: teamRole, encrypted_vault_key: await rsaWrap(m.public_key, keyBytes) })
          added++
        } catch { /* pula o que falhar, segue o lote */ }
      }
      toast.success(`${added} membro(s) de "${team.name}" adicionado(s).` + (team.not_configured > 0 ? ` ${team.not_configured} sem cofre configurado ficaram de fora.` : ''))
      setTeamPick(''); await load(); onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao adicionar a equipe.')
    } finally { setTeamBusy(false) }
  }

  const remove = async () => {
    if (!removeTarget) return
    setBusy(true)
    try {
      await api.delete(`/environments/clients/${customerId}/members/${removeTarget.user_id}`)
      toast.warning('Acesso revogado. A rotação de chave (recifrar segredos) entra na próxima fase.')
      setRemoveTarget(null); await load(); onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao remover membro.')
    } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Compartilhar — ${vaultName}`} width="max-w-xl">
      <div className="flex flex-col gap-4">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Quem está aqui pode abrir os ambientes deste cliente (conforme o papel). A chave é embrulhada no seu navegador para cada membro — o servidor nunca a vê.
        </p>

        <table className="ds-table w-full">
          <thead><tr><th>Membro</th><th>Papel</th><th /></tr></thead>
          <tbody>
            {members.map(m => (
              <tr key={m.user_id}>
                <td>
                  <div className="text-sm" style={{ color: 'var(--text)' }}>{m.name}{m.user_id === user?.id && ' (você)'}</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{m.email}</div>
                </td>
                <td>
                  {isVaultAdmin && m.user_id !== user?.id ? (
                    <select className="ds-input text-sm" value={m.role}
                      onChange={async e => {
                        try { await api.put(`/vault/vaults/${vaultId}/members/${m.user_id}`, { role: e.target.value }); await load() }
                        catch (err) { toast.error(err instanceof ApiError ? err.message : 'Falha ao alterar papel.') }
                      }}>
                      <option value="admin">Admin</option>
                      <option value="write">Edita</option>
                      <option value="read">Lê</option>
                    </select>
                  ) : <Badge>{ROLE_LABEL[m.role]}</Badge>}
                </td>
                <td className="text-right">
                  {isVaultAdmin && m.user_id !== user?.id && (
                    <button type="button" className="p-1.5 rounded hover:opacity-80" style={{ color: 'var(--danger)' }} title="Remover acesso" onClick={() => setRemoveTarget(m)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {isVaultAdmin && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Adicionar pessoa</span>
              <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>Papel:</span>
              <select className="ds-input text-sm" value={role} onChange={e => setRole(e.target.value as MemberRow['role'])}>
                <option value="read">Lê</option><option value="write">Edita</option><option value="admin">Admin</option>
              </select>
            </div>
            <TextInput icon={Search} placeholder="Buscar por nome ou e-mail…" value={candQ} onChange={e => setCandQ(e.target.value)} className="!py-1.5 text-sm" />
            <div className="flex flex-col gap-1 max-h-56 overflow-y-auto" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 4 }}>
              {filteredCandidates.length === 0 && <span className="text-xs px-2 py-2 text-center" style={{ color: 'var(--text-light)' }}>Nenhum usuário encontrado.</span>}
              {filteredCandidates.map(c => (
                <div key={c.user_id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm" style={{ opacity: c.configured ? 1 : 0.55 }}>
                  <div className="flex-1 min-w-0">
                    <div className="truncate" style={{ color: 'var(--text)' }}>{c.name}</div>
                    <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{c.email}</div>
                  </div>
                  {c.configured
                    ? <Button size="sm" variant="secondary" icon={UserPlus} loading={busy} onClick={() => add(c)}>Adicionar</Button>
                    : <Badge variant="neutral">sem cofre</Badge>}
                </div>
              ))}
            </div>
          </div>
        )}

        {isVaultAdmin && teams.length > 0 && (
          <div className="flex items-end gap-2 flex-wrap pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex-1 min-w-[220px]">
              <SearchSelect label="Adicionar equipe (Grupo de Consultores)" placeholder="Buscar equipe…" value={teamPick}
                onChange={v => setTeamPick(v === '' ? '' : Number(v))}
                options={teams.map(t => ({ id: t.id, name: `${t.name} — ${t.members.length} apto(s)${t.not_configured > 0 ? `, ${t.not_configured} sem cofre` : ''}` }))} fullWidth />
            </div>
            <select className="ds-input" value={teamRole} onChange={e => setTeamRole(e.target.value as MemberRow['role'])}>
              <option value="read">Lê</option><option value="write">Edita</option><option value="admin">Admin</option>
            </select>
            <Button variant="secondary" icon={Users} loading={teamBusy} disabled={teamPick === ''} onClick={addTeam}>Adicionar equipe</Button>
          </div>
        )}

        {isVaultAdmin && (
          <p className="text-xs" style={{ color: 'var(--text-light)' }}>
            Todos os usuários internos aparecem. Quem ainda não configurou o próprio cofre fica como <b>sem cofre</b> (não dá para dar acesso até fazer o setup — a chave é cifrada com a chave pública dele). O mesmo vale para membros de equipe.
          </p>
        )}

        <Modal open={removeTarget !== null} onClose={() => setRemoveTarget(null)} title="Remover acesso">
          <div className="flex flex-col gap-4">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Remover o acesso de <b>{removeTarget?.name}</b> a este cliente? O reveal passa a ser bloqueado imediatamente.
            </p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setRemoveTarget(null)}>Cancelar</Button>
              <Button variant="danger" loading={busy} onClick={remove}>Remover acesso</Button>
            </div>
          </div>
        </Modal>
      </div>
    </Modal>
  )
}
