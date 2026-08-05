'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { UserCheck, Search, ShieldCheck } from 'lucide-react'
import { PoliticaComercialDrawer } from '@/components/crm/politica-comercial-drawer'

interface UserRow { id: number; name: string; type: string; is_executive: boolean; is_crm_responsavel: boolean }

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

export default function CrmResponsaveisPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [soResp, setSoResp] = useState(false)
  const [polUser, setPolUser] = useState<{ id: number; name: string } | null>(null)

  useEffect(() => {
    api.get<{ data: UserRow[] }>('/crm/responsaveis').then(r => setUsers(r?.data ?? [])).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false))
  }, [])

  const toggle = async (u: UserRow) => {
    const novo = !u.is_crm_responsavel
    setUsers(us => us.map(x => x.id === u.id ? { ...x, is_crm_responsavel: novo } : x)) // otimista
    try { await api.put(`/crm/responsaveis/${u.id}`, { is_crm_responsavel: novo }) }
    catch { toast.error('Erro ao salvar'); setUsers(us => us.map(x => x.id === u.id ? { ...x, is_crm_responsavel: !novo } : x)) }
  }

  const total = users.filter(u => u.is_crm_responsavel).length
  const linhas = users.filter(u => {
    if (soResp && !u.is_crm_responsavel) return false
    if (busca.trim()) return u.name.toLowerCase().includes(busca.toLowerCase())
    return true
  })

  return (
    <AppLayout title="Responsáveis Comerciais (CRM)">
      <div className="flex items-center gap-2 mb-1">
        <UserCheck size={18} style={{ color: 'var(--primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Responsáveis Comerciais</h1>
        <span className="text-xs" style={{ color: 'var(--text-light)' }}>{total} vinculado(s)</span>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-light)' }}>Vincule usuários como responsáveis de oportunidade (forecast, metas, comissões). Aparecem no campo "Responsável comercial" da oportunidade.</p>

      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5" style={{ color: 'var(--text-light)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar usuário" className="pl-8 pr-3 py-2 rounded-lg text-sm outline-none w-64" style={inputStyle} />
        </div>
        <button onClick={() => setSoResp(s => !s)} className="px-3 py-2 rounded-lg text-sm font-medium" style={soResp ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Só responsáveis</button>
      </div>

      <div className="rounded-xl overflow-hidden max-w-2xl" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
            <th className="text-left px-4 py-2.5 text-xs font-semibold">Usuário</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold">Perfil</th>
            <th className="text-center px-4 py-2.5 text-xs font-semibold">Política Comercial</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold w-40">Responsável comercial</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Carregando…</td></tr>
            : linhas.length === 0 ? <tr><td colSpan={4} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhum usuário.</td></tr>
            : linhas.map(u => (
              <tr key={u.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text)' }}>{u.name}</td>
                <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{u.type}</td>
                <td className="px-4 py-2.5 text-center">
                  <button onClick={() => setPolUser({ id: u.id, name: u.name })} className="text-[11px] px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><ShieldCheck size={12} /> Definir</button>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => toggle(u)} className="text-[11px] px-2.5 py-1 rounded-full font-semibold" style={u.is_crm_responsavel ? { background: 'rgba(34,197,94,0.15)', color: '#22c55e' } : { background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>{u.is_crm_responsavel ? 'Vinculado' : 'Vincular'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {polUser && <PoliticaComercialDrawer userId={polUser.id} userName={polUser.name} onClose={() => setPolUser(null)} />}
    </AppLayout>
  )
}
