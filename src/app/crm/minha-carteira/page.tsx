'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { Wallet, Search, LayoutDashboard } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'

interface Cliente { customer_id: number; name: string; crm_status: string | null; segmento: string | null; regiao: string | null; executivo: string | null; saude: string | null; receita: number; margem: number | null; renovacoes_abertas: number; followups_pendentes: number; projetos_risco: number; dias_sem_interacao: number | null }
interface Carteira {
  executivo_id: number | null; pode_ver_todos: boolean; executivos: { id: number; name: string }[]
  resumo: { clientes: number; receita_total: number; margem_total: number; renovacoes_abertas: number; followups_pendentes: number; projetos_risco: number; clientes_criticos: number; clientes_sem_interacao: number }
  clientes: Cliente[]
}

const fmtBRL = (n: number | null) => n == null ? '—' : (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const SAUDE: Record<string, { l: string; cor: string }> = { saudavel: { l: '🟢', cor: '#22c55e' }, atencao: { l: '🟡', cor: '#f59e0b' }, critico: { l: '🔴', cor: 'var(--danger-border)' } }
const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

function Card({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</p>
      <p className="text-lg font-bold mt-0.5" style={{ color: danger ? 'var(--danger-border)' : 'var(--text)' }}>{value}</p>
    </div>
  )
}

export default function MinhaCarteiraPage() {
  const router = useRouter()
  const [d, setD] = useState<Carteira | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [f, setF] = useState({ executivo_id: '', crm_status: '', segmento: '', regiao: '', saude: '' })
  const [busca, setBusca] = useState('')
  const { user } = useAuth()
  const [execs, setExecs] = useState<{ id: number; name: string }[]>([])
  useEffect(() => { api.get<{ data: { id: number; name: string }[] }>('/crm/users').then(r => setExecs(r?.data ?? [])).catch(() => {}) }, [])
  const gestor = user?.type === 'admin' || user?.type === 'administrativo' || !!d?.pode_ver_todos

  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString()
  const load = useCallback(() => {
    setLoading(true)
    api.get<{ data: Carteira }>(`/crm/carteira${qs ? `?${qs}` : ''}`)
      .then(r => setD(r?.data ?? null)).catch((e: any) => { if (e?.status === 403) setForbidden(true) }).finally(() => setLoading(false))
  }, [qs])
  useEffect(() => { load() }, [load])

  const linhas = (d?.clientes ?? []).filter(c => !busca.trim() || c.name.toLowerCase().includes(busca.toLowerCase()))

  return (
    <AppLayout title="Minha Carteira (CRM)">
      <div className="flex items-center gap-2 mb-4">
        <Wallet size={18} style={{ color: 'var(--primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Minha Carteira</h1>
        <span className="text-xs" style={{ color: 'var(--text-light)' }}>— visão consolidada da carteira do executivo</span>
      </div>

      {loading ? <p style={{ color: 'var(--text-light)' }}>Carregando…</p>
        : forbidden ? <p style={{ color: 'var(--danger-border)' }}>Sem acesso à carteira.</p>
        : (
        <>
          {d && <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
            <Card label="Clientes" value={String(d.resumo.clientes)} />
            <Card label="Receita" value={fmtBRL(d.resumo.receita_total)} />
            <Card label="Margem" value={fmtBRL(d.resumo.margem_total)} danger={d.resumo.margem_total < 0} />
            <Card label="Renovações" value={String(d.resumo.renovacoes_abertas)} />
            <Card label="Follow-ups" value={String(d.resumo.followups_pendentes)} />
            <Card label="Projetos risco" value={String(d.resumo.projetos_risco)} danger={d.resumo.projetos_risco > 0} />
            <Card label="Críticos" value={String(d.resumo.clientes_criticos)} danger={d.resumo.clientes_criticos > 0} />
            <Card label="Sem interação 30d+" value={String(d.resumo.clientes_sem_interacao)} danger={d.resumo.clientes_sem_interacao > 0} />
          </div>}

          <div className="flex flex-wrap gap-2 mb-3">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5" style={{ color: 'var(--text-light)' }} />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar empresa" className="pl-8 pr-3 py-2 rounded-lg text-sm outline-none w-52" style={inputStyle} />
            </div>
            {gestor && execs.length > 0 && (
              <label className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                <span className="whitespace-nowrap">Responsável:</span>
                <select value={f.executivo_id} onChange={e => setF(s => ({ ...s, executivo_id: e.target.value }))} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                  <option value="">Todos os responsáveis</option>
                  {execs.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
            )}
            <select value={f.saude} onChange={e => setF(s => ({ ...s, saude: e.target.value }))} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Saúde</option><option value="critico">🔴 Crítico</option><option value="atencao">🟡 Atenção</option><option value="saudavel">🟢 Saudável</option></select>
            <select value={f.crm_status} onChange={e => setF(s => ({ ...s, crm_status: e.target.value }))} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Status CRM</option>{['lead','prospect','cliente','em_renovacao'].map(s => <option key={s} value={s}>{s}</option>)}</select>
            <input value={f.segmento} onChange={e => setF(s => ({ ...s, segmento: e.target.value }))} placeholder="Segmento" className="px-3 py-2 rounded-lg text-sm outline-none w-32" style={inputStyle} />
            <input value={f.regiao} onChange={e => setF(s => ({ ...s, regiao: e.target.value }))} placeholder="Região" className="px-3 py-2 rounded-lg text-sm outline-none w-28" style={inputStyle} />
          </div>

          <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm whitespace-nowrap">
              <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
                {['Saúde', 'Empresa', 'Status', 'Receita', 'Margem', 'Renov.', 'Follow-ups', 'Proj. risco', 'Sem inter.', 'Ficha'].map((h, i) => <th key={h} className={`px-3 py-2.5 text-xs font-semibold ${[3,4,5,6,7,8].includes(i) ? 'text-right' : 'text-left'}`}>{h}</th>)}
              </tr></thead>
              <tbody>
                {linhas.length === 0 ? <tr><td colSpan={10} className="px-3 py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhum cliente na carteira.</td></tr>
                : linhas.map(c => (
                  <tr key={c.customer_id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-3 py-2.5">{c.saude ? <span title={c.saude} style={{ color: SAUDE[c.saude]?.cor }}>{SAUDE[c.saude]?.l ?? c.saude}</span> : '—'}</td>
                    <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text)' }}>{c.name}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{c.crm_status ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text)' }}>{fmtBRL(c.receita)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: (c.margem ?? 0) < 0 ? 'var(--danger-border)' : 'var(--text-muted)' }}>{fmtBRL(c.margem)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{c.renovacoes_abertas || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{c.followups_pendentes || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: c.projetos_risco > 0 ? 'var(--danger-border)' : 'var(--text-muted)' }}>{c.projetos_risco || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: (c.dias_sem_interacao ?? 0) >= 30 ? '#f59e0b' : 'var(--text-light)' }}>{c.dias_sem_interacao != null ? `${c.dias_sem_interacao}d` : '—'}</td>
                    <td className="px-3 py-2.5"><button onClick={() => router.push(`/empresas/${c.customer_id}/360`)} className="text-[11px] px-2 py-1 rounded-lg font-semibold inline-flex items-center gap-1" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><LayoutDashboard size={12} /> 360°</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppLayout>
  )
}
