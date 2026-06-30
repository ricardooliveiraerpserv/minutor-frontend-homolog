'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { useNavConfig } from '@/contexts/nav-config-context'

type ModuleId = string
interface ProfileRow { profile: string; modules: ModuleId[] }

const PROFILE_LABEL: Record<string, string> = {
  admin:          'Administrador',
  administrativo: 'Administrativo',
  coordenador:    'Coordenador',
  consultor:      'Consultor',
  parceiro_admin: 'Parceiro',
}

// Cadastro de Perfil → Módulos de navegação (Serviços / Administrativo).
// Define quais módulos cada perfil enxerga. NÃO altera permissões.
export function ProfileModulesTab() {
  const { modules } = useNavConfig()
  const [rows, setRows] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    api.get<{ data: ProfileRow[] }>('/profile-modules')
      .then(r => setRows(r?.data ?? []))
      .catch(() => toast.error('Erro ao carregar perfis'))
      .finally(() => setLoading(false))
  }, [])

  const toggle = async (profile: string, mod: ModuleId, on: boolean) => {
    const row = rows.find(r => r.profile === profile)
    if (!row) return
    const next = on ? [...new Set([...row.modules, mod])] : row.modules.filter(m => m !== mod)
    const prev = rows
    setRows(rs => rs.map(r => r.profile === profile ? { ...r, modules: next } : r))
    setSaving(profile)
    try {
      await api.put(`/profile-modules/${profile}`, { modules: next })
      toast.success('Módulos do perfil salvos')
    } catch {
      setRows(prev) // rollback
      toast.error('Erro ao salvar')
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12" />)}</div>

  return (
    <div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        Defina quais <b>módulos de navegação</b> (Serviços / Administrativo) cada perfil enxerga.
        Isto organiza apenas o menu — não altera permissões nem acessos. O perfil <b>Cliente</b> não usa módulos (mantém o portal).
      </p>
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--surface-sunken)' }}>
              <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Perfil</th>
              {modules.map(m => (
                <th key={m.key} className="text-center px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.profile} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>
                  {PROFILE_LABEL[row.profile] ?? row.profile}
                  {saving === row.profile && <span className="ml-2 text-[10px]" style={{ color: 'var(--text-light)' }}>salvando…</span>}
                </td>
                {modules.map(m => (
                  <td key={m.key} className="text-center px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer"
                      style={{ accentColor: 'var(--primary)' }}
                      checked={row.modules.includes(m.key)}
                      onChange={e => toggle(row.profile, m.key, e.target.checked)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
