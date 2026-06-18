'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { HeartPulse, Search, LayoutDashboard } from 'lucide-react'

interface Linha { customer_id: number; name: string; crm_status: string | null; segmento: string | null; regiao: string | null; executivo: string | null; status: string; score: number; motivos: string[] }
interface Painel { resumo: { critico: number; atencao: number; saudavel: number }; clientes: Linha[] }
interface Opt { id: number; name: string }

const SAUDE: Record<string, { l: string; emoji: string; cor: string; bg: string }> = {
  saudavel: { l: 'Saudável', emoji: '🟢', cor: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  atencao:  { l: 'Atenção',  emoji: '🟡', cor: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  critico:  { l: 'Crítico',  emoji: '🔴', cor: 'var(--danger-border)', bg: 'var(--danger-bg)' },
}
const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

function Card({ label, value, cor }: { label: string; value: string; cor?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
      <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: cor ?? 'var(--text)' }}>{value}</p>
    </div>
  )
}

export default function CrmSaudePage() {
  const router = useRouter()
  const [d, setD] = useState<Painel | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [users, setUsers] = useState<Opt[]>([])
  const [f, setF] = useState({ executivo_id: '', crm_status: '', segmento: '', regiao: '' })
  const [busca, setBusca] = useState('')
  const [fStatus, setFStatus] = useState('')

  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString()
  const load = useCallback(() => {
    setLoading(true)
    api.get<{ data: Painel }>(`/crm/saude/painel${qs ? `?${qs}` : ''}`)
      .then(r => setD(r?.data ?? null)).catch((e: any) => { if (e?.status === 403) setForbidden(true) }).finally(() => setLoading(false))
  }, [qs])
  useEffect(() => { load() }, [load])
  useEffect(() => { api.get<any>('/crm/users').then(r => setUsers(r?.data ?? [])).catch(() => {}) }, [])

  const linhas = (d?.clientes ?? []).filter(c => {
    if (fStatus && c.status !== fStatus) return false
    if (busca.trim()) return c.name.toLowerCase().includes(busca.toLowerCase())
    return true
  })

  return (
    <AppLayout title="Saúde da Conta (CRM)">
      <div className="flex items-center gap-2 mb-4">
        <HeartPulse size={18} style={{ color: 'var(--primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Saúde da Conta</h1>
        <span className="text-xs" style={{ color: 'var(--text-light)' }}>— quais clientes exigem ação, e por quê</span>
      </div>

      {loading ? <p style={{ color: 'var(--text-light)' }}>Carregando…</p>
        : forbidden ? <p style={{ color: 'var(--danger-border)' }}>Sem acesso à Saúde da Conta.</p>
        : !d ? <p style={{ color: 'var(--text-light)' }}>Sem dados.</p> : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <button onClick={() => setFStatus(s => s === 'critico' ? '' : 'critico')} className="text-left"><Card label="🔴 Críticos" value={String(d.resumo.critico)} cor="var(--danger-border)" /></button>
            <button onClick={() => setFStatus(s => s === 'atencao' ? '' : 'atencao')} className="text-left"><Card label="🟡 Atenção" value={String(d.resumo.atencao)} cor="#f59e0b" /></button>
            <button onClick={() => setFStatus(s => s === 'saudavel' ? '' : 'saudavel')} className="text-left"><Card label="🟢 Saudáveis" value={String(d.resumo.saudavel)} cor="#22c55e" /></button>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5" style={{ color: 'var(--text-light)' }} />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar empresa" className="pl-8 pr-3 py-2 rounded-lg text-sm outline-none w-56" style={inputStyle} />
            </div>
            <select value={f.executivo_id} onChange={e => setF(s => ({ ...s, executivo_id: e.target.value }))} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Executivo</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            <select value={f.crm_status} onChange={e => setF(s => ({ ...s, crm_status: e.target.value }))} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Status CRM</option>{['lead','prospect','cliente','contrato_ativo','em_renovacao','inativo'].map(s => <option key={s} value={s}>{s}</option>)}</select>
            <input value={f.segmento} onChange={e => setF(s => ({ ...s, segmento: e.target.value }))} placeholder="Segmento" className="px-3 py-2 rounded-lg text-sm outline-none w-32" style={inputStyle} />
            <input value={f.regiao} onChange={e => setF(s => ({ ...s, regiao: e.target.value }))} placeholder="Região" className="px-3 py-2 rounded-lg text-sm outline-none w-28" style={inputStyle} />
          </div>

          <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
                {['Saúde', 'Empresa', 'Status CRM', 'Executivo', 'Motivos', 'Ficha'].map(h => <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {linhas.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhum cliente.</td></tr>
                : linhas.map(c => { const si = SAUDE[c.status]; return (
                  <tr key={c.customer_id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-3 py-2.5"><span className="text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap" style={{ background: si.bg, color: si.cor }}>{si.emoji} {si.l}{c.score > 0 ? ` (${c.score})` : ''}</span></td>
                    <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text)' }}>{c.name}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{c.crm_status ?? '—'}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{c.executivo ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-light)' }}>{c.motivos.slice(0, 3).join(' · ') || '—'}</td>
                    <td className="px-3 py-2.5"><button onClick={() => router.push(`/empresas/${c.customer_id}/360`)} className="text-[11px] px-2 py-1 rounded-lg font-semibold inline-flex items-center gap-1" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><LayoutDashboard size={12} /> 360°</button></td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppLayout>
  )
}
