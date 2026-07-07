'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'

interface CargoRow { profile: string; cargo: string }

const PROFILE_LABEL: Record<string, string> = {
  admin:          'Administrador',
  administrativo: 'Administrativo',
  coordenador:    'Coordenador',
  consultor:      'Consultor',
  parceiro_admin: 'Parceiro',
  cliente:        'Cliente',
}

/**
 * Vínculo Cargo × Perfil — o admin registra o cargo padrão de cada perfil (users.type).
 * Esse cargo alimenta a assinatura de e-mail dos usuários. Independente da navegação modular.
 */
export function CargosTab() {
  const [cargos, setCargos] = useState<CargoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    api.get<{ data: CargoRow[] }>('/profile-cargos')
      .then(r => setCargos(r?.data ?? []))
      .catch(() => toast.error('Erro ao carregar cargos'))
      .finally(() => setLoading(false))
  }, [])

  // Salva ao sair do campo (blur).
  const save = async (profile: string, cargo: string) => {
    const trimmed = cargo.trim()
    if (!trimmed) return
    setSaving(profile)
    try {
      await api.put(`/profile-cargos/${profile}`, { cargo: trimmed })
      toast.success('Cargo salvo')
    } catch {
      toast.error('Erro ao salvar cargo')
    } finally {
      setSaving(null)
    }
  }

  const setLocal = (profile: string, cargo: string) =>
    setCargos(cs => cs.map(c => c.profile === profile ? { ...c, cargo } : c))

  if (loading) return <div className="space-y-2">{[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-12" />)}</div>

  return (
    <div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        Defina o <b>cargo padrão de cada perfil</b>. Ele é usado como cargo na <b>assinatura de e-mail</b> dos usuários
        (quando o usuário não tem um cargo próprio). Não altera permissões nem acessos.
      </p>
      <div className="rounded-lg overflow-hidden max-w-xl" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--surface-sunken)' }}>
              <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Perfil</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Cargo (assinatura)</th>
            </tr>
          </thead>
          <tbody>
            {cargos.map(row => (
              <tr key={row.profile} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>
                  {PROFILE_LABEL[row.profile] ?? row.profile}
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={row.cargo}
                    onChange={e => setLocal(row.profile, e.target.value)}
                    onBlur={e => save(row.profile, e.target.value)}
                    placeholder="Cargo"
                    maxLength={120}
                    className="w-56 h-8 text-xs px-2 rounded-md"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  {saving === row.profile && <span className="ml-2 text-[10px]" style={{ color: 'var(--text-light)' }}>salvando…</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
