'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { ListFilter, Download, AlertTriangle, SlidersHorizontal, Bookmark, Save, CalendarPlus } from 'lucide-react'

interface Stage { id: number; name: string; ordem: number }
interface Pipeline { id: number; name: string; stages: Stage[] }
interface Opp {
  id: number; title: string; status: string; valor: number | string
  probabilidade: number; forecast: number; ultima_interacao_at: string | null; proxima_acao: string | null; proxima_acao_at: string | null
  created_at: string; previsao_fechamento?: string | null; sem_proxima_acao: boolean; proxima_acao_vencida?: boolean; dias_sem_interacao?: number | null
  saude?: { status: string; diagnostico?: string } | null
  customer?: { name: string } | null; pipeline?: { name: string } | null
  stage?: { name: string } | null; responsavel?: { id?: number; name: string } | null
}
interface Opt { id: number; name: string }
interface ContactType { id: number; nome: string; slug: string }

const fmtBRL = (n: number | string) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('pt-BR') : '—'
const STATUS = ['aberto', 'ganho', 'perdido']
const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

// Saúde (sinal de leitura instantânea — sem clique/modal)
const SAUDE: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  saudavel: { emoji: '🟢', label: 'Saudável', color: 'var(--success-border)', bg: 'var(--success-bg)' },
  atencao: { emoji: '🟡', label: 'Atenção', color: 'var(--warning-border)', bg: 'var(--warning-bg)' },
  em_risco: { emoji: '🔴', label: 'Em risco', color: 'var(--danger-border)', bg: 'var(--danger-bg)' },
}
// Dias desde o último contato — elimina cálculo mental
const diasColor = (d?: number | null) => d == null || d > 10 ? 'var(--danger-border)' : d <= 3 ? 'var(--success-border)' : 'var(--warning-border)'
const diasLabel = (d?: number | null) => d == null ? 'Sem contato' : d === 0 ? 'Hoje' : d === 1 ? 'Ontem' : `${d} dias`
const iniciais = (name?: string | null) => (name ?? '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '—'
// Urgência da próxima ação por data
const URG: Record<string, { dot: string; color: string }> = { atrasada: { dot: '🔴', color: 'var(--danger-border)' }, hoje: { dot: '🟡', color: 'var(--warning-border)' }, futuro: { dot: '🟢', color: 'var(--text-muted)' } }
const urgencia = (s?: string | null): string | null => { if (!s) return null; const d = new Date(s); d.setHours(0, 0, 0, 0); const t = new Date(); t.setHours(0, 0, 0, 0); return d < t ? 'atrasada' : d.getTime() === t.getTime() ? 'hoje' : 'futuro' }

export default function CrmOportunidadesPage() {
  const [rows, setRows] = useState<Opp[]>([])
  const [loading, setLoading] = useState(true)
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [customers, setCustomers] = useState<Opt[]>([])
  const [users, setUsers] = useState<Opt[]>([])
  const [origens, setOrigens] = useState<Opt[]>([])
  const [motivos, setMotivos] = useState<Opt[]>([])
  const [produtos, setProdutos] = useState<Opt[]>([])
  const [mais, setMais] = useState(false)
  const [soRisco, setSoRisco] = useState(false) // filtro de leitura (cliente) — saúde não é filtro de API
  const [soMes, setSoMes] = useState(false)     // só com previsão no mês atual
  const [soPrioridade, setSoPrioridade] = useState(false) // 🔥 prioridade do dia
  const [metaMes, setMetaMes] = useState(0)     // meta da empresa (competência atual)
  const [contactTypes, setContactTypes] = useState<ContactType[]>([])
  const [quick, setQuick] = useState<Opp | null>(null) // ação rápida (📅) — criar próxima ação sem drawer
  const F0 = { customer_id: '', responsavel_id: '', pipeline_id: '', stage_id: '', status: '', de: '', ate: '', search: '', lead_source_id: '', loss_reason_id: '', produto_id: '', valor_min: '', valor_max: '', lc_de: '', lc_ate: '', sem_proxima_acao: '' }
  const [f, setF] = useState<Record<string, string>>(F0)
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v, ...(k === 'pipeline_id' ? { stage_id: '' } : {}) }))

  // Filtros salvos
  const [saved, setSaved] = useState<{ id: number; name: string; payload: Record<string, string> }[]>([])
  const loadSaved = useCallback(() => { api.get<{ data: any[] }>('/crm/saved-filters?scope=opportunities').then(r => setSaved(r?.data ?? [])).catch(() => {}) }, [])
  const salvarFiltro = async () => {
    const ativos = Object.fromEntries(Object.entries(f).filter(([, v]) => v))
    if (Object.keys(ativos).length === 0) return toast.error('Nenhum filtro ativo para salvar.')
    const name = prompt('Nome do filtro salvo:')?.trim(); if (!name) return
    try { await api.post('/crm/saved-filters', { scope: 'opportunities', name, payload: ativos }); toast.success('Filtro salvo'); loadSaved() }
    catch { toast.error('Erro ao salvar filtro') }
  }
  const aplicarFiltro = (payload: Record<string, string>) => setF({ ...F0, ...payload })
  const excluirFiltro = async (id: number) => { try { await api.delete(`/crm/saved-filters/${id}`); loadSaved() } catch { /* */ } }

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
    api.get<{ data: any[] }>('/crm/users').then(r => setUsers((r?.data ?? []).map((u: any) => ({ id: u.id, name: u.name })))).catch(() => {})
    api.get<{ data: any[] }>('/crm/lead-sources').then(r => setOrigens((r?.data ?? []).map((o: any) => ({ id: o.id, name: o.name })))).catch(() => {})
    api.get<{ data: any[] }>('/crm/loss-reasons').then(r => setMotivos((r?.data ?? []).map((m: any) => ({ id: m.id, name: m.name })))).catch(() => {})
    api.get<{ data: any[] }>('/crm/products').then(r => setProdutos((r?.data ?? []).map((p: any) => ({ id: p.id, name: p.name })))).catch(() => {})
    // Meta da empresa (competência atual) — dá contexto ao forecast (endpoint existente).
    const ym = new Date().toISOString().slice(0, 7)
    api.get<{ data: { empresa: number } }>(`/crm/sales-targets?periodo=${ym}`).then(r => setMetaMes(Number(r?.data?.empresa ?? 0))).catch(() => {})
    api.get<{ data: ContactType[] }>('/crm/contact-types').then(r => setContactTypes(r?.data ?? [])).catch(() => {})
    loadSaved()
  }, [loadSaved])

  const stageOpts: { id: number; label: string }[] = f.pipeline_id
    ? (pipelines.find(p => String(p.id) === f.pipeline_id)?.stages ?? []).map(s => ({ id: s.id, label: s.name }))
    : pipelines.flatMap(p => p.stages.map(s => ({ id: s.id, label: `${p.name} · ${s.name}` })))

  // Cards executivos (a partir dos dados já carregados — sem novo cálculo)
  const ym = new Date().toISOString().slice(0, 7)
  const noMes = (s?: string | null) => !!s && s.slice(0, 7) === ym
  const abertas = rows.filter(r => r.status === 'aberto')
  const totalValorAberto = abertas.reduce((s, r) => s + (Number(r.valor) || 0), 0)
  const previstoMes = abertas.filter(r => noMes(r.previsao_fechamento)).reduce((s, r) => s + (Number(r.forecast) || 0), 0)
  const gap = metaMes - previstoMes
  const emRisco = rows.filter(r => r.saude?.status === 'em_risco')
  const semAcao = rows.filter(r => r.sem_proxima_acao)
  // Contadores de ações (radar diário)
  const atrasadasCount = rows.filter(r => r.proxima_acao_vencida).length
  const hojeCount = rows.filter(r => !r.sem_proxima_acao && urgencia(r.proxima_acao_at) === 'hoje').length
  // Prioridade do dia: sem próxima ação OU atrasada OU em risco
  const ehPrioridade = (r: Opp) => r.sem_proxima_acao || r.proxima_acao_vencida || r.saude?.status === 'em_risco'

  // Filtros de leitura (cliente): "em risco", "previsão no mês" e "prioridade do dia"
  const visible = rows.filter(r => (!soRisco || r.saude?.status === 'em_risco') && (!soMes || noMes(r.previsao_fechamento)) && (!soPrioridade || ehPrioridade(r)))
  // ORDENAÇÃO PADRÃO INTELIGENTE — problemas primeiro (ação > risco > previsão).
  const prio = (o: Opp): number[] => [
    o.sem_proxima_acao ? 0 : 1,
    o.saude?.status === 'em_risco' ? 0 : 1,
    o.proxima_acao_vencida ? 0 : 1,
    -(Number(o.forecast) || 0),
    -(o.dias_sem_interacao ?? 9999),
  ]
  const ordered = [...visible].sort((a, b) => { const pa = prio(a), pb = prio(b); for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]; return 0 })
  const totalValor = visible.reduce((s, r) => s + (Number(r.valor) || 0), 0)
  const totalForecastVis = visible.reduce((s, r) => s + (Number(r.forecast) || 0), 0)

  const exportCsv = async () => {
    try {
      const res = await fetch(`/api/v1/crm/opportunities/export${qs ? `?${qs}` : ''}`, { credentials: 'same-origin' })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'oportunidades.csv'; a.click(); URL.revokeObjectURL(url)
    } catch { toast.error('Erro ao exportar') }
  }

  const card = (label: string, valor: string, sub: string, cor: string, onClick: () => void, ativo = false) => (
    <button onClick={onClick} className="rounded-xl p-3 text-left transition hover:brightness-110" style={{ background: 'var(--brand-surface)', border: `1px solid ${ativo ? cor : 'var(--border)'}` }}>
      <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</p>
      <p className="text-lg font-bold tabular-nums mt-0.5" style={{ color: cor }}>{valor}</p>
      <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>{sub}</p>
    </button>
  )
  const limpar = () => { setF(F0); setSoRisco(false); setSoMes(false); setSoPrioridade(false) }

  return (
    <AppLayout title="Oportunidades (CRM)">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ListFilter size={18} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Oportunidades</h1>
          <span className="text-xs" style={{ color: 'var(--text-light)' }}>{rows.length} registro(s)</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Radar de ações pendentes */}
          {atrasadasCount > 0 && <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ background: 'var(--danger-bg)', color: 'var(--danger-border)' }}>🔴 {atrasadasCount} atrasada{atrasadasCount > 1 ? 's' : ''}</span>}
          {hojeCount > 0 && <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ background: 'var(--warning-bg)', color: 'var(--warning-border)' }}>🟡 {hojeCount} hoje</span>}
          <button onClick={exportCsv} className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><Download size={14} /> Exportar CSV</button>
        </div>
      </div>

      {/* CARDS EXECUTIVOS — clicáveis (viram filtro). Gestão responde sem abrir registro */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        {card('Oportunidades abertas', String(abertas.length), fmtBRL(totalValorAberto) + ' · limpar filtros', 'var(--text)', limpar)}
        {/* Forecast do mês com contexto de META / GAP */}
        <button onClick={() => { setSoMes(true); setSoRisco(false) }} className="rounded-xl p-3 text-left transition hover:brightness-110" style={{ background: 'var(--brand-surface)', border: `1px solid ${soMes ? 'var(--primary)' : 'var(--border)'}` }}>
          <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Forecast do mês</p>
          <p className="text-lg font-bold tabular-nums mt-0.5" style={{ color: 'var(--primary)' }}>{fmtBRL(previstoMes)}</p>
          {metaMes > 0
            ? <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>meta {fmtBRL(metaMes)} · gap <b style={{ color: gap > 0 ? 'var(--danger-border)' : 'var(--success-border)' }}>{gap > 0 ? fmtBRL(gap) : 'batida ✓'}</b></p>
            : <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>defina a meta no Forecast</p>}
        </button>
        {card('Em risco', String(emRisco.length), 'oportunidades', emRisco.length ? 'var(--danger-border)' : 'var(--text)', () => { setSoRisco(true); setSoMes(false) }, soRisco)}
        {card('Sem próxima ação', String(semAcao.length), 'risco operacional', semAcao.length ? 'var(--warning-border)' : 'var(--text)', () => set('sem_proxima_acao', f.sem_proxima_acao === '1' ? '' : '1'), f.sem_proxima_acao === '1')}
      </div>

      {/* FILTROS BÁSICOS sempre visíveis */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => setSoPrioridade(v => !v)} className="px-2.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5" style={{ background: soPrioridade ? 'var(--danger)' : 'var(--danger-bg)', color: soPrioridade ? '#fff' : 'var(--danger-border)' }}>🔥 Prioridade do dia</button>
        <input value={f.search} onChange={e => set('search', e.target.value)} placeholder="Buscar título…" className="px-3 py-2 rounded-lg text-sm outline-none" style={{ ...inputStyle, minWidth: 160 }} />
        <select value={f.responsavel_id} onChange={e => set('responsavel_id', e.target.value)} className="px-2 py-2 rounded-lg text-sm outline-none" style={{ ...inputStyle, borderColor: f.responsavel_id ? 'var(--primary)' : 'var(--border)' }}><option value="">Responsável</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <select value={f.stage_id} onChange={e => set('stage_id', e.target.value)} className="px-2 py-2 rounded-lg text-sm outline-none" style={{ ...inputStyle, borderColor: f.stage_id ? 'var(--primary)' : 'var(--border)' }}><option value="">Etapa</option>{stageOpts.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <button onClick={() => set('sem_proxima_acao', f.sem_proxima_acao === '1' ? '' : '1')} className="px-2.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5" style={{ background: f.sem_proxima_acao === '1' ? 'var(--warning-bg)' : 'var(--surface-sunken)', color: f.sem_proxima_acao === '1' ? 'var(--warning-border)' : 'var(--text-muted)' }}><AlertTriangle size={12} /> Sem próxima ação</button>
        <button onClick={() => setSoRisco(v => !v)} className="px-2.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5" style={{ background: soRisco ? 'var(--danger-bg)' : 'var(--surface-sunken)', color: soRisco ? 'var(--danger-border)' : 'var(--text-muted)' }}>🔴 Em risco</button>
        <button onClick={() => setMais(m => !m)} className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold" style={{ background: mais ? 'var(--primary-soft)' : 'var(--surface-sunken)', color: mais ? 'var(--primary)' : 'var(--text-muted)' }}><SlidersHorizontal size={13} /> Filtros avançados</button>
        <div className="ml-auto flex items-center gap-2">
          <Bookmark size={14} style={{ color: 'var(--text-light)' }} />
          <select onChange={e => { const s = saved.find(x => String(x.id) === e.target.value); if (s) aplicarFiltro(s.payload); e.target.value = '' }} className="px-2 py-1.5 rounded-lg text-xs outline-none" style={inputStyle} defaultValue="">
            <option value="">Filtros salvos…</option>
            {saved.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {saved.length > 0 && <select onChange={e => { if (e.target.value) excluirFiltro(Number(e.target.value)); e.target.value = '' }} className="px-2 py-1.5 rounded-lg text-xs outline-none" style={inputStyle} defaultValue="" title="Excluir filtro salvo"><option value="">Excluir…</option>{saved.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
          <button onClick={salvarFiltro} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}><Save size={13} /> Salvar filtro</button>
          <button onClick={limpar} className="px-2.5 py-1.5 rounded-lg text-xs" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>Limpar</button>
        </div>
      </div>

      {/* FILTROS AVANÇADOS (empresa, pipeline, datas, status, forecast, etc.) */}
      {mais && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4 p-3 rounded-xl" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
          <label className="block"><span className="text-[10px] block mb-0.5" style={{ color: 'var(--text-light)' }}>Empresa</span>
            <select value={f.customer_id} onChange={e => set('customer_id', e.target.value)} className="w-full px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Todas</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="block"><span className="text-[10px] block mb-0.5" style={{ color: 'var(--text-light)' }}>Pipeline</span>
            <select value={f.pipeline_id} onChange={e => set('pipeline_id', e.target.value)} className="w-full px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Todos</option>{pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="block"><span className="text-[10px] block mb-0.5" style={{ color: 'var(--text-light)' }}>Status</span>
            <select value={f.status} onChange={e => set('status', e.target.value)} className="w-full px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Todos</option>{STATUS.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
          <label className="block"><span className="text-[10px] block mb-0.5" style={{ color: 'var(--text-light)' }}>Origem</span>
            <select value={f.lead_source_id} onChange={e => set('lead_source_id', e.target.value)} className="w-full px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Todas</option>{origens.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <label className="block"><span className="text-[10px] block mb-0.5" style={{ color: 'var(--text-light)' }}>Motivo de perda</span>
            <select value={f.loss_reason_id} onChange={e => set('loss_reason_id', e.target.value)} className="w-full px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Todos</option>{motivos.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label className="block"><span className="text-[10px] block mb-0.5" style={{ color: 'var(--text-light)' }}>Produto</span>
            <select value={f.produto_id} onChange={e => set('produto_id', e.target.value)} className="w-full px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Todos</option>{produtos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="block"><span className="text-[10px] block mb-0.5" style={{ color: 'var(--text-light)' }}>Abertura de</span>
            <input type="date" value={f.de} onChange={e => set('de', e.target.value)} className="w-full px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></label>
          <label className="block"><span className="text-[10px] block mb-0.5" style={{ color: 'var(--text-light)' }}>Abertura até</span>
            <input type="date" value={f.ate} onChange={e => set('ate', e.target.value)} className="w-full px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></label>
          <label className="block"><span className="text-[10px] block mb-0.5" style={{ color: 'var(--text-light)' }}>Valor mín (R$)</span>
            <input type="number" step="0.01" value={f.valor_min} onChange={e => set('valor_min', e.target.value)} className="w-full px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></label>
          <label className="block"><span className="text-[10px] block mb-0.5" style={{ color: 'var(--text-light)' }}>Valor máx (R$)</span>
            <input type="number" step="0.01" value={f.valor_max} onChange={e => set('valor_max', e.target.value)} className="w-full px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></label>
          <label className="block"><span className="text-[10px] block mb-0.5" style={{ color: 'var(--text-light)' }}>Últ. contato de</span>
            <input type="date" value={f.lc_de} onChange={e => set('lc_de', e.target.value)} className="w-full px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></label>
          <label className="block"><span className="text-[10px] block mb-0.5" style={{ color: 'var(--text-light)' }}>Últ. contato até</span>
            <input type="date" value={f.lc_ate} onChange={e => set('lc_ate', e.target.value)} className="w-full px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></label>
        </div>
      )}

      <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm whitespace-nowrap">
          <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
            {['Saúde', 'Empresa', 'Oportunidade', 'Valor', 'Resp.', 'Próxima ação', 'Contato', ''].map((h, i) => (
              <th key={i} className={`px-3 py-2 text-xs font-semibold ${h === 'Valor' ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="px-3 py-6 text-center" style={{ color: 'var(--text-light)' }}>Carregando…</td></tr>
            : ordered.length === 0 ? <tr><td colSpan={8} className="px-3 py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhuma oportunidade.</td></tr>
            : ordered.map(o => {
              const s = SAUDE[o.saude?.status ?? ''] ?? null
              const saud = o.saude?.status === 'saudavel'
              const u = o.sem_proxima_acao ? null : urgencia(o.proxima_acao_at)
              return (
              <tr key={o.id} style={{ borderTop: '1px solid var(--border)', borderLeft: o.sem_proxima_acao ? '3px solid var(--danger-border)' : '3px solid transparent' }}>
                {/* SAÚDE — saudável discreto (só o ponto), exceções com destaque */}
                <td className="px-3 py-1.5">{!s ? '—' : saud ? <span title={o.saude?.diagnostico}>{s.emoji}</span> : <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap" title={o.saude?.diagnostico} style={{ background: s.bg, color: s.color }}>{s.emoji} {s.label}</span>}</td>
                <td className="px-3 py-1.5" style={{ color: 'var(--text)' }}>{o.customer?.name ?? '—'}</td>
                <td className="px-3 py-1.5 font-medium" style={{ color: 'var(--text-muted)' }} title={`Etapa: ${o.stage?.name ?? '—'} · Probabilidade: ${o.probabilidade}%`}>{o.title}</td>
                {/* VALOR em destaque */}
                <td className="px-3 py-1.5 text-right tabular-nums text-[15px] font-bold" style={{ color: 'var(--text)' }}>{fmtBRL(o.valor)}</td>
                {/* RESPONSÁVEL avatar-only clicável */}
                <td className="px-3 py-1.5">
                  <button onClick={() => o.responsavel?.id && set('responsavel_id', String(o.responsavel.id))} title={o.responsavel?.name ?? 'Sem responsável'} className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold mx-auto" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{iniciais(o.responsavel?.name)}</button>
                </td>
                {/* PRÓXIMA AÇÃO — futura neutra; hoje/atrasada com destaque */}
                <td className="px-3 py-1.5">
                  {o.sem_proxima_acao
                    ? <span className="text-[11px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap flex items-center gap-1 w-max" style={{ background: 'var(--danger-bg)', color: 'var(--danger-border)' }}><AlertTriangle size={11} /> SEM PRÓXIMA AÇÃO</span>
                    : <span className="flex items-center gap-1.5" style={{ color: u === 'atrasada' ? 'var(--danger-border)' : u === 'hoje' ? 'var(--warning-border)' : 'var(--text)' }}>{(u === 'atrasada' || u === 'hoje') && <span>{URG[u].dot}</span>}<span>{o.proxima_acao || 'Próxima ação'} <span style={{ color: 'var(--text-light)' }}>· {fmtDate(o.proxima_acao_at)}</span></span></span>}
                </td>
                {/* ÚLTIMO CONTATO: bolinha + indicador curto */}
                <td className="px-3 py-1.5"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: diasColor(o.dias_sem_interacao) }} /><span style={{ color: diasColor(o.dias_sem_interacao) }}>{diasLabel(o.dias_sem_interacao)}</span></span></td>
                {/* AÇÃO RÁPIDA */}
                <td className="px-3 py-1.5 text-center"><button onClick={() => setQuick(o)} title="Criar próxima ação" className="opacity-60 hover:opacity-100" style={{ color: o.sem_proxima_acao ? 'var(--danger-border)' : 'var(--primary)' }}><CalendarPlus size={16} /></button></td>
              </tr>
            ) })}
          </tbody>
          {ordered.length > 0 && (
            <tfoot><tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-sunken)' }}>
              <td colSpan={3} className="px-3 py-2 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>Totais ({ordered.length})</td>
              <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: 'var(--text)' }}>{fmtBRL(totalValor)}</td>
              <td colSpan={4} className="px-3 py-2 text-xs" style={{ color: 'var(--text-light)' }}>forecast {fmtBRL(totalForecastVis)}</td>
            </tr></tfoot>
          )}
        </table>
      </div>

      {quick && <QuickAction opp={quick} contactTypes={contactTypes} onClose={() => setQuick(null)} onSaved={() => { setQuick(null); load() }} />}
    </AppLayout>
  )
}

// Ação rápida: cria a próxima ação (CrmTask) sem abrir o drawer.
function QuickAction({ opp, contactTypes, onClose, onSaved }: { opp: Opp; contactTypes: ContactType[]; onClose: () => void; onSaved: () => void }) {
  const [tipo, setTipo] = useState(contactTypes[0]?.slug ?? '')
  const [data, setData] = useState('')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const salvar = async () => {
    if (!tipo) { toast.error('Selecione o tipo'); return }
    setSaving(true)
    try { await api.post('/crm/tasks', { opportunity_id: opp.id, tipo, data: data || null, titulo: desc || null }); toast.success('Próxima ação criada'); onSaved() }
    catch { toast.error('Erro ao criar ação') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }} onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-bold mb-1" style={{ color: 'var(--text)' }}>Próxima ação</h2>
        <p className="text-xs mb-3" style={{ color: 'var(--text-light)' }}>{opp.customer?.name} · {opp.title}</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select value={tipo} onChange={e => setTipo(e.target.value)} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>{contactTypes.map(c => <option key={c.slug} value={c.slug}>{c.nome}</option>)}</select>
          <input type="date" value={data} onChange={e => setData(e.target.value)} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
        </div>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="O que fazer (ex.: Ligar cliente)" className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3" style={inputStyle} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
          <button onClick={salvar} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saving ? 'Salvando…' : 'Criar ação'}</button>
        </div>
      </div>
    </div>
  )
}
