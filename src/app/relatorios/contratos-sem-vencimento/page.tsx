'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { CalendarX, AlertTriangle } from 'lucide-react'

interface Linha { id: number; projeto: string; cliente: string; crm_status: string | null; tipo: string; tipo_faturamento: string | null; responsavel: string; status: string; tem_projeto: boolean; criado_em: string | null }
interface Diag {
  total_contratos: number; com_vencimento: number; sem_vencimento: number; pct_sem_vencimento: number
  sem_vencimento_sem_projeto: number
  por_tipo: { tipo: string; qtd: number }[]
  por_status: { status: string; qtd: number }[]
  contratos: Linha[]
}

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

function Card({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: danger ? 'var(--danger-border)' : 'var(--text)' }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

export default function ContratosSemVencimentoPage() {
  const [d, setD] = useState<Diag | null>(null)
  const [loading, setLoading] = useState(true)
  const [fTipo, setFTipo] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    api.get<{ data: Diag }>('/contracts/data-quality/vencimentos').then(r => setD(r?.data ?? null)).finally(() => setLoading(false))
  }, [])

  const linhas = (d?.contratos ?? []).filter(c => {
    if (fTipo && c.tipo !== fTipo) return false
    if (fStatus && c.status !== fStatus) return false
    if (busca.trim()) { const q = busca.toLowerCase(); return c.cliente.toLowerCase().includes(q) || c.projeto.toLowerCase().includes(q) || c.responsavel.toLowerCase().includes(q) }
    return true
  })

  const exportCsv = () => {
    const head = ['Contrato', 'Cliente', 'Tipo', 'Faturamento', 'Responsável', 'Status', 'Tem projeto', 'Criado em']
    const rows = linhas.map(c => [c.projeto, c.cliente, c.tipo, c.tipo_faturamento ?? '', c.responsavel, c.status, c.tem_projeto ? 'Sim' : 'Não', c.criado_em ?? ''])
    const csv = '﻿' + [head, ...rows].map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'contratos-sem-vencimento.csv'; a.click()
  }

  return (
    <AppLayout title="Saneamento — Contratos sem vencimento">
      <div className="flex items-center gap-2 mb-1">
        <CalendarX size={18} style={{ color: 'var(--danger-border)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Contratos sem data de vencimento</h1>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-light)' }}>Relatório de saneamento cadastral — somente leitura. Nenhuma data é preenchida automaticamente.</p>

      {loading ? <p style={{ color: 'var(--text-light)' }}>Carregando…</p> : !d ? <p style={{ color: 'var(--text-light)' }}>Sem dados.</p> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <Card label="Total de contratos" value={String(d.total_contratos)} />
            <Card label="Com vencimento" value={String(d.com_vencimento)} />
            <Card label="Sem vencimento" value={String(d.sem_vencimento)} sub={`${d.pct_sem_vencimento}% do total`} danger={d.sem_vencimento > 0} />
            <Card label="Sem venc. e sem projeto" value={String(d.sem_vencimento_sem_projeto)} sub="provavelmente rascunhos" />
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente / contrato / responsável" className="px-3 py-2 rounded-lg text-sm outline-none w-72" style={inputStyle} />
            <select value={fTipo} onChange={e => setFTipo(e.target.value)} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Todos os tipos</option>{d.por_tipo.map(t => <option key={t.tipo} value={t.tipo}>{t.tipo} ({t.qtd})</option>)}</select>
            <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Todos os status</option>{d.por_status.map(s => <option key={s.status} value={s.status}>{s.status} ({s.qtd})</option>)}</select>
            <button onClick={exportCsv} className="px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>Exportar CSV</button>
          </div>

          <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm whitespace-nowrap">
              <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
                {['Contrato', 'Cliente', 'Tipo', 'Faturamento', 'Responsável', 'Status', 'Projeto', 'Criado'].map(h => <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {linhas.length === 0 ? <tr><td colSpan={8} className="px-3 py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhum contrato.</td></tr>
                : linhas.map(c => (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text)' }}>{c.projeto}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{c.cliente}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{c.tipo}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{c.tipo_faturamento ?? '—'}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{c.responsavel}</td>
                    <td className="px-3 py-2.5"><span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{c.status}</span></td>
                    <td className="px-3 py-2.5">{c.tem_projeto ? <span className="text-[11px]" style={{ color: '#22c55e' }}>Sim</span> : <span className="text-[11px] flex items-center gap-1" style={{ color: '#f59e0b' }}><AlertTriangle size={11} /> Não</span>}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-light)' }}>{c.criado_em ?? '—'}</td>
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
