'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { Wallet, Search, LayoutDashboard, HeartPulse } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'

interface Cliente {
  customer_id: number; name: string; crm_status: string | null; segmento: string | null; regiao: string | null; executivo: string | null
  saude: string | null; score: number; motivos: string[]
  receita: number; margem: number | null; renovacoes_abertas: number; followups_pendentes: number; projetos_risco: number; dias_sem_interacao: number | null
}
interface Carteira {
  executivo_id: number | null; pode_ver_todos: boolean; executivos: { id: number; name: string }[]
  resumo: { clientes: number; receita_total: number; margem_total: number; renovacoes_abertas: number; followups_pendentes: number; projetos_risco: number; clientes_criticos: number; clientes_atencao: number; clientes_saudaveis: number; clientes_sem_interacao: number }
  clientes: Cliente[]
}

const fmtBRL = (n: number | null) => n == null ? '—' : (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const SAUDE: Record<string, { l: string; emoji: string; cor: string; bg: string }> = {
  saudavel: { l: 'Saudável', emoji: '🟢', cor: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  atencao:  { l: 'Atenção',  emoji: '🟡', cor: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  critico:  { l: 'Crítico',  emoji: '🔴', cor: 'var(--danger-border)', bg: 'var(--danger-bg)' },
}
const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

function Card({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</p>
      <p className="text-lg font-bold mt-0.5" style={{ color: danger ? 'var(--danger-border)' : 'var(--text)' }}>{value}</p>
    </div>
  )
}

function HealthCard({ label, value, cor, active, onClick }: { label: string; value: string; cor: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left rounded-xl p-3 transition" style={{ background: active ? cor.replace('var(--danger-border)', 'var(--danger-bg)') : 'var(--surface)', border: `1px solid ${active ? cor : 'var(--border)'}`, boxShadow: active ? `0 0 0 1px ${cor} inset` : 'none' }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</p>
      <p className="text-lg font-bold mt-0.5" style={{ color: cor }}>{value}</p>
    </button>
  )
}

export default function MinhaCarteiraPage() {
  const router = useRouter()
  const [d, setD] = useState<Carteira | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [f, setF] = useState({ executivo_id: '', crm_status: '', segmento: '', regiao: '' })
  const [fStatus, setFStatus] = useState('')
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

  const linhas = (d?.clientes ?? []).filter(c => {
    if (fStatus && c.saude !== fStatus) return false
    if (busca.trim()) return c.name.toLowerCase().includes(busca.toLowerCase())
    return true
  })

  return (
    <AppLayout title="Minha Carteira (CRM)">
      <div className="flex items-center gap-2 mb-4">
        <Wallet size={18} style={{ color: 'var(--primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Minha Carteira</h1>
        <span className="text-xs" style={{ color: 'var(--text-light)' }}>— carteira + saúde da conta consolidadas</span>
      </div>

      {loading ? <p style={{ color: 'var(--text-light)' }}>Carregando…</p>
        : forbidden ? <p style={{ color: 'var(--danger-border)' }}>Sem acesso à carteira.</p>
        : (
        <>
          {d && <>
            {/* Saúde da conta (clicáveis → filtram a tabela) */}
            <div className="flex items-center gap-1.5 mb-2 mt-1">
              <HeartPulse size={14} style={{ color: 'var(--primary)' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Saúde da conta</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <HealthCard label="🔴 Críticos" value={String(d.resumo.clientes_criticos)} cor="var(--danger-border)" active={fStatus === 'critico'} onClick={() => setFStatus(s => s === 'critico' ? '' : 'critico')} />
              <HealthCard label="🟡 Atenção" value={String(d.resumo.clientes_atencao)} cor="#f59e0b" active={fStatus === 'atencao'} onClick={() => setFStatus(s => s === 'atencao' ? '' : 'atencao')} />
              <HealthCard label="🟢 Saudáveis" value={String(d.resumo.clientes_saudaveis)} cor="#22c55e" active={fStatus === 'saudavel'} onClick={() => setFStatus(s => s === 'saudavel' ? '' : 'saudavel')} />
            </div>

            {/* KPIs da carteira */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
              <Card label="Clientes" value={String(d.resumo.clientes)} />
              <Card label="Receita" value={fmtBRL(d.resumo.receita_total)} />
              <Card label="Margem" value={fmtBRL(d.resumo.margem_total)} danger={d.resumo.margem_total < 0} />
              <Card label="Renovações" value={String(d.resumo.renovacoes_abertas)} />
              <Card label="Follow-ups" value={String(d.resumo.followups_pendentes)} />
              <Card label="Projetos risco" value={String(d.resumo.projetos_risco)} danger={d.resumo.projetos_risco > 0} />
            </div>
          </>}

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
            <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Saúde</option><option value="critico">🔴 Crítico</option><option value="atencao">🟡 Atenção</option><option value="saudavel">🟢 Saudável</option></select>
            <select value={f.crm_status} onChange={e => setF(s => ({ ...s, crm_status: e.target.value }))} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Status CRM</option>{['lead','prospect','cliente','em_renovacao'].map(s => <option key={s} value={s}>{s}</option>)}</select>
            <input value={f.segmento} onChange={e => setF(s => ({ ...s, segmento: e.target.value }))} placeholder="Segmento" className="px-3 py-2 rounded-lg text-sm outline-none w-32" style={inputStyle} />
            <input value={f.regiao} onChange={e => setF(s => ({ ...s, regiao: e.target.value }))} placeholder="Região" className="px-3 py-2 rounded-lg text-sm outline-none w-28" style={inputStyle} />
          </div>

          <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm whitespace-nowrap">
              <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
                {['Saúde', 'Empresa', 'Status', 'Executivo', 'Receita', 'Margem', 'Renov.', 'Follow-ups', 'Proj. risco', 'Sem inter.', 'Motivos', 'Ficha'].map((h, i) => <th key={h} className={`px-3 py-2.5 text-xs font-semibold ${[4,5,6,7,8].includes(i) ? 'text-right' : 'text-left'}`}>{h}</th>)}
              </tr></thead>
              <tbody>
                {linhas.length === 0 ? <tr><td colSpan={12} className="px-3 py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhum cliente na carteira.</td></tr>
                : linhas.map(c => { const si = c.saude ? SAUDE[c.saude] : null; return (
                  <tr key={c.customer_id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-3 py-2.5">{si ? <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap" style={{ background: si.bg, color: si.cor }}>{si.emoji} {si.l}{c.score > 0 ? ` (${c.score})` : ''}</span> : '—'}</td>
                    <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text)' }}>{c.name}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{c.crm_status ?? '—'}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{c.executivo ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text)' }}>{fmtBRL(c.receita)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: (c.margem ?? 0) < 0 ? 'var(--danger-border)' : 'var(--text-muted)' }}>{fmtBRL(c.margem)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{c.renovacoes_abertas || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{c.followups_pendentes || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: c.projetos_risco > 0 ? 'var(--danger-border)' : 'var(--text-muted)' }}>{c.projetos_risco || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: (c.dias_sem_interacao ?? 0) >= 30 ? '#f59e0b' : 'var(--text-light)' }}>{c.dias_sem_interacao != null ? `${c.dias_sem_interacao}d` : '—'}</td>
                    <td className="px-3 py-2.5 text-xs max-w-[280px] truncate" style={{ color: 'var(--text-light)' }} title={c.motivos.join(' · ')}>{c.motivos.slice(0, 3).join(' · ') || '—'}</td>
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
