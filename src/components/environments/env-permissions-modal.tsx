'use client'

// Gestão da ACL fina de um ambiente: por membro, marca ver/revelar/copiar/gerenciar/
// administrar. Sem marcação custom = default do papel (mostra a origem). Só admin abre.

import { useCallback, useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Modal } from '@/components/ds'
import { api, ApiError } from '@/lib/api'

interface PermRow {
  user_id: number; name: string; email: string; role: string; has_custom: boolean; source: string
  can_view: boolean; can_reveal: boolean; can_copy: boolean; can_manage: boolean; can_admin: boolean
}

const OPS: { key: keyof PermRow; label: string }[] = [
  { key: 'can_view', label: 'Ver' }, { key: 'can_reveal', label: 'Revelar' }, { key: 'can_copy', label: 'Copiar' },
  { key: 'can_manage', label: 'Gerenciar' }, { key: 'can_admin', label: 'Admin' },
]

export function EnvPermissionsModal({ open, onClose, envId }: { open: boolean; onClose: () => void; envId: number }) {
  const [rows, setRows] = useState<PermRow[]>([])
  const [savingId, setSavingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setRows(await api.get<PermRow[]>(`/environments/environments/${envId}/permissions`))
  }, [envId])
  useEffect(() => { if (open) void load() }, [open, load])

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

  return (
    <Modal open={open} onClose={onClose} title="Permissões do ambiente" width="max-w-2xl">
      <div className="flex flex-col gap-3">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Por membro, defina o que cada um pode fazer NESTE ambiente. Sem marcação = padrão do papel.
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
                      {r.email} {r.has_custom ? <Badge variant="primary">custom</Badge> : <Badge>{r.role}</Badge>}
                    </div>
                  </td>
                  {OPS.map(o => (
                    <td key={o.key} className="text-center">
                      <input type="checkbox" checked={r[o.key] as boolean} onChange={e => save(r, { [o.key]: e.target.checked } as Partial<PermRow>)} />
                    </td>
                  ))}
                  <td className="text-right">
                    {r.has_custom && (
                      <button type="button" className="p-1.5 rounded hover:opacity-80" style={{ color: 'var(--text-muted)' }} title="Voltar ao padrão do papel" onClick={() => reset(r)}>
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end">
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  )
}
