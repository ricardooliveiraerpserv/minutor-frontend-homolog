'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { ListFilter, Download, AlertTriangle } from 'lucide-react'

interface Stage { id: number; name: string; ordem: number }
interface Pipeline { id: number; name: string; stages: Stage[] }
interface Opp {
  id: number; title: string; status: string; valor: number | string
  probabilidade: number; forecast: number; ultima_interacao_at: string | null; proxima_acao_at: string | null
  created_at: string; sem_proxima_acao: boolean
  customer?: { name: string } | null; pipeline?: { name: string } | null
  stage?: { name: string } | null; responsavel?: { name: string } | null
}
interface Opt { id: number; name: string }

const fmtBRL = (n: number | string) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('pt-BR') : '—'
const STATUS = ['aberto', 'ganho', 'perdido']
const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

export default function CrmOportunidadesPage() {
  const [rows, setRows] = useState<Opp[]>([])
  const [loading, setLoading] = useState(true)
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [customers, setCustomers] = useState<Opt[]>([])
  const [users, setUsers] = useState<Opt[]>([])
  const [f, setF] = useState({ customer_id: '', responsavel_id: '', pipeline_id: '', stage_id: '', status: '', de: '', ate: '', search: '' })
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v, ...(k === 'pipeline_id' ? { stage_id: '' } : {}) }))

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v) })
    return p.toString()
  }, [f])

  const load = useCallback(() => {
    setLoading(true)
    api.get<{ data: Opp[] }>(`/crm/opportunities${qs ? `?${qs}` : ''}`)
      .then(r => setRows(r?.data ?? [])).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false))
  }, [qs])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.get<{ data: Pipeline[] }>('/crm/pipelines').then(r => setPipelines(r?.data ?? [])).catch(() => {})
    api.get<any>('/customers?pageSize=500').then(r => setCustomers((Array.isArray(r) ? r : r?.data ?? r?.items ?? []).map((c: any) => ({ id: c.id, name: c.name })).sort((a: Opt, b: Opt) => a.name.localeCompare(b.name)))).catch(() => {})
    // Responsável: somente usuários marcados como responsáveis comerciais (não todos os usuários).
    api.get<{ data: any[] }>('/crm/users').then(r => setUsers((r?.data ?? []).map((u: any) => ({ id: u.id, name: u.name })))).catch(() => {})
  }, [])

  // Etapa independente do Pipeline: sem pipeline selecionado, lista as etapas de todos
  // os pipelines (prefixadas pelo nome do pipeline); com pipeline, só as dele.
  const stageOpts: { id: number; label: string }[] = f.pipeline_id
    ? (pipelines.find(p => String(p.id) === f.pipeline_id)?.stages ?? []).map(s => ({ id: s.id, label: s.name }))
    : pipelines.flatMap(p => p.stages.map(s => ({ id: s.id, label: `${p.name} · ${s.name}` })))
  const totalForecast = rows.filter(r => r.status === 'aberto').reduce((s, r) => s + (Number(r.forecast) || 0), 0)
  const totalValor = rows.reduce((s, r) => s + (Number(r.valor) || 0), 0)

  const exportCsv = async () => {
    try {
      const res = await fetch(`/api/v1/crm/opportunities/export${qs ? `?${qs}` : ''}`, { credentials: 'same-origin' })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'oportunidades.csv'; a.click(); URL.revokeObjectURL(url)
    } catch { toast.error('Erro ao exportar') }
  }

  return (
    <AppLayout title="Oportunidades (CRM)">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ListFilter size={18} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Oportunidades</h1>
          <span className="text-xs" style={{ color: 'var(--text-light)' }}>{rows.length} registro(s) · forecast aberto {fmtBRL(totalForecast)}</span>
        </div>
        <button onClick={exportCsv} className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><Download size={14} /> Exportar CSV</button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
        <input value={f.search} onChange={e => set('search', e.target.value)} placeholder="Buscar título…" className="px-3 py-2 rounded-lg text-sm outline-none col-span-2" style={inputStyle} />
        <select value={f.customer_id} onChange={e => set('customer_id', e.target.value)} className="px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Empresa</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={f.responsavel_id} onChange={e => set('responsavel_id', e.target.value)} className="px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Responsável</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <select value={f.pipeline_id} onChange={e => set('pipeline_id', e.target.value)} className="px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Pipeline</option>{pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select value={f.stage_id} onChange={e => set('stage_id', e.target.value)} className="px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Etapa</option>{stageOpts.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <select value={f.status} onChange={e => set('status', e.target.value)} className="px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Status</option>{STATUS.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <input type="date" value={f.de} onChange={e => set('de', e.target.value)} title="Abertura de" className="px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
        <input type="date" value={f.ate} onChange={e => set('ate', e.target.value)} title="Abertura até" className="px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
      </div>

      <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm whitespace-nowrap">
          <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
            {['Empresa', 'Oportunidade', 'Pipeline', 'Etapa', 'Responsável', 'Valor', 'Prob.', 'Forecast', 'Últ. interação', 'Próx. ação', 'Status', 'Criada'].map(h => (
              <th key={h} className={`px-3 py-2.5 text-xs font-semibold ${['Valor', 'Prob.', 'Forecast'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={12} className="px-3 py-6 text-center" style={{ color: 'var(--text-light)' }}>Carregando…</td></tr>
            : rows.length === 0 ? <tr><td colSpan={12} className="px-3 py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhuma oportunidade.</td></tr>
            : rows.map(o => (
              <tr key={o.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{o.customer?.name ?? '—'}</td>
                <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text)' }}>{o.title}</td>
                <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{o.pipeline?.name ?? '—'}</td>
                <td className="px-3 py-2.5"><span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{o.stage?.name ?? '—'}</span></td>
                <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{o.responsavel?.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text)' }}>{fmtBRL(o.valor)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{o.probabilidade}%</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: 'var(--primary)' }}>{fmtBRL(o.forecast)}</td>
                <td className="px-3 py-2.5" style={{ color: 'var(--text-light)' }}>{fmtDate(o.ultima_interacao_at)}</td>
                <td className="px-3 py-2.5" style={{ color: o.sem_proxima_acao ? '#f59e0b' : 'var(--text-light)' }}>{o.sem_proxima_acao ? <span className="flex items-center gap-1"><AlertTriangle size={11} /> —</span> : fmtDate(o.proxima_acao_at)}</td>
                <td className="px-3 py-2.5"><span className="text-[11px]" style={{ color: o.status === 'ganho' ? '#22c55e' : o.status === 'perdido' ? 'var(--danger-border)' : 'var(--text-muted)' }}>{o.status}</span></td>
                <td className="px-3 py-2.5" style={{ color: 'var(--text-light)' }}>{fmtDate(o.created_at)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-sunken)' }}>
              <td colSpan={5} className="px-3 py-2 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>Totais</td>
              <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: 'var(--text)' }}>{fmtBRL(totalValor)}</td>
              <td></td>
              <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: 'var(--primary)' }}>{fmtBRL(totalForecast)}</td>
              <td colSpan={4}></td>
            </tr></tfoot>
          )}
        </table>
      </div>
    </AppLayout>
  )
}
