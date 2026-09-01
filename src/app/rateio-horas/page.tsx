'use client'

// Rateio de Horas — projetos-servidor (is_rateio) distribuem as horas apontadas neles para
// destinos Cloud, POR PERÍODO de vigência (cada empresa entra numa data). O consultor NÃO vê
// a divisão; a gestão (períodos, equipe e ajuste manual por apontamento) é feita aqui.

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api, apiMessage } from '@/lib/api'
import { toast } from 'sonner'
import { SearchSelect } from '@/components/ui/search-select'
import { Plus, Trash2, Split, Save, Server, X, UserPlus, Users, CalendarRange, ListChecks, Pencil } from 'lucide-react'

interface TeamMember { id: number; name: string }
interface RateioProject { id: number; name: string; code: string | null; cliente: string | null; plans_count?: number; consultants?: TeamMember[]; coordinator?: TeamMember | null }
interface ProjOpt { id: number; name: string; code?: string | null; customer_id?: number | null }
interface TargetRow { target_project_id: number | ''; projeto?: string; percentual: number }
interface PlanRow { id?: number; data_inicio: string; data_fim: string; semFim: boolean; targets: TargetRow[] }
interface Aponta { id: number; date: string; consultor: string | null; effort_minutes: number; status: string; overridden?: boolean; splits: { target_project_id: number; projeto: string | null; projeto_codigo: string | null; minutes: number }[] }

const fmtDate = (d?: string | null) => d ? d.split('-').reverse().join('/') : null
const hh = (min: number) => (min / 60).toFixed(2) + 'h'

export default function RateioHorasPage() {
  const [projects, setProjects] = useState<RateioProject[]>([])
  const [allProjects, setAllProjects] = useState<ProjOpt[]>([])
  // Destinos do rateio: só projetos com contrato tipo CLOUD (regra de negócio).
  const [destProjects, setDestProjects] = useState<ProjOpt[]>([])
  // Alocação de equipe do servidor de rateio (consultores apontam + coordenador aprova).
  const [allocFor, setAllocFor] = useState<RateioProject | null>(null)
  const [consultantOpts, setConsultantOpts] = useState<TeamMember[]>([])
  const [coordOpts, setCoordOpts] = useState<TeamMember[]>([])
  const [pickedConsultants, setPickedConsultants] = useState<number[]>([])
  const [pickedCoord, setPickedCoord] = useState<string>('')
  const [savingTeam, setSavingTeam] = useState(false)
  const [customers, setCustomers] = useState<Record<number, string>>({})
  const [selId, setSelId] = useState<number | null>(null)
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [apontas, setApontas] = useState<Aponta[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [markPick, setMarkPick] = useState('')
  // Ajuste manual da divisão de um apontamento (expansível inline, por PERCENTUAL).
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editRows, setEditRows] = useState<{ target_project_id: number | ''; projeto?: string; percentual: number }[]>([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)  // apontamento em modo edição
  const [openPlans, setOpenPlans] = useState<number[]>([])          // índices de períodos expandidos
  const togglePlan = (pi: number) => setOpenPlans(o => o.includes(pi) ? o.filter(x => x !== pi) : [...o, pi])

  const loadProjects = useCallback(() => {
    setLoading(true)
    api.get<{ data: RateioProject[] }>('/rateio-hours/projects')
      .then(r => setProjects(r.data ?? []))
      .catch(e => toast.error(apiMessage(e, 'Erro ao carregar projetos de rateio')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadProjects() }, [loadProjects])
  useEffect(() => {
    api.get<{ items: ProjOpt[] }>('/projects?minimal=1&status=open&pageSize=2000')
      .then(r => setAllProjects((r.items ?? []).filter(p => p.id && p.name)))
      .catch(() => {})
    // Destinos = só contratos tipo Cloud.
    api.get<{ items: ProjOpt[] }>('/projects?minimal=1&status=open&contract_type_code=cloud&pageSize=2000')
      .then(r => setDestProjects((r.items ?? []).filter(p => p.id && p.name)))
      .catch(() => {})
    api.get<{ data?: { id: number; name: string }[] }>('/customers?pageSize=1000')
      .then(r => { const list = (r as any).data ?? (r as any).items ?? []; const m: Record<number, string> = {}; list.forEach((c: any) => { if (c.id) m[c.id] = c.name }); setCustomers(m) })
      .catch(() => {})
    // Consultores que podem apontar + coordenadores que podem aprovar.
    const asList = (r: any): TeamMember[] => ((r?.data ?? r?.items ?? r ?? []) as any[]).filter(u => u?.id).map(u => ({ id: u.id, name: u.name }))
    api.get<any>('/users?type=consultor,parceiro_admin&pageSize=500').then(r => setConsultantOpts(asList(r))).catch(() => {})
    api.get<any>('/users?type=coordenador&pageSize=500').then(r => setCoordOpts(asList(r))).catch(() => {})
  }, [])

  const loadPlans = useCallback((id: number) => {
    api.get<{ plans: { id: number; data_inicio: string | null; data_fim: string | null; targets: { target_project_id: number; projeto: string; projeto_codigo: string | null; cliente: string | null; percentual: number }[] }[] }>(`/rateio-hours/projects/${id}/plans`)
      .then(r => setPlans((r.plans ?? []).map(p => ({
        id: p.id,
        data_inicio: p.data_inicio ?? '',
        data_fim: p.data_fim ?? '',
        semFim: !p.data_fim,
        targets: (p.targets ?? []).map(t => ({ target_project_id: t.target_project_id, projeto: t.projeto, percentual: t.percentual })),
      }))))
      .catch(e => toast.error(apiMessage(e, 'Erro ao carregar períodos')))
  }, [])

  const loadTimesheets = useCallback((id: number) => {
    api.get<{ data: Aponta[] }>(`/rateio-hours/projects/${id}/timesheets`)
      .then(r => setApontas(r.data ?? []))
      .catch(() => setApontas([]))
  }, [])

  const selectProject = (id: number) => { setSelId(id); loadPlans(id); loadTimesheets(id) }

  const markAsRateio = async () => {
    const id = Number(markPick)
    if (!id) return
    try {
      await api.put(`/projects/${id}`, { is_rateio: true })
      toast.success('Projeto marcado como rateio')
      setMarkPick(''); loadProjects(); selectProject(id)
    } catch (e) { toast.error(apiMessage(e, 'Erro ao marcar projeto')) }
  }

  const unmark = async (p: RateioProject) => {
    if (!confirm(`Desfazer "${p.name}" como projeto de rateio? Os períodos e destinos serão removidos.`)) return
    try {
      await api.put(`/rateio-hours/projects/${p.id}/plans`, { plans: [] })
      await api.put(`/projects/${p.id}`, { is_rateio: false })
      toast.success('Projeto deixou de ser de rateio')
      if (selId === p.id) { setSelId(null); setPlans([]); setApontas([]) }
      loadProjects()
    } catch (e) { toast.error(apiMessage(e, 'Erro ao desfazer')) }
  }

  // ── Períodos ──
  const addPlan = () => setPlans(p => { setOpenPlans(o => [...o, p.length]); return [...p, { data_inicio: '', data_fim: '', semFim: true, targets: [] }] })
  const removePlan = (pi: number) => setPlans(p => p.filter((_, i) => i !== pi))
  const setPlanField = (pi: number, patch: Partial<PlanRow>) => setPlans(p => p.map((pl, i) => i === pi ? { ...pl, ...patch } : pl))
  const addTarget = (pi: number) => setPlans(p => p.map((pl, i) => i === pi ? { ...pl, targets: [...pl.targets, { target_project_id: '', percentual: 0 }] } : pl))
  const removeTarget = (pi: number, ti: number) => setPlans(p => p.map((pl, i) => i === pi ? { ...pl, targets: pl.targets.filter((_, j) => j !== ti) } : pl))
  const setTarget = (pi: number, ti: number, patch: Partial<TargetRow>) => setPlans(p => p.map((pl, i) => i === pi ? { ...pl, targets: pl.targets.map((t, j) => j === ti ? { ...t, ...patch } : t) } : pl))
  // Ao editar o peso de um destino, redistribui o restante (100 - valor) entre os DEMAIS
  // proporcionalmente aos pesos atuais deles (sobra no último), pra fechar sempre 100%.
  const setTargetPct = (pi: number, ti: number, val: number) => setPlans(p => p.map((pl, i) => {
    if (i !== pi) return pl
    const v = Math.max(0, Math.min(100, isNaN(val) ? 0 : val))
    const targets = pl.targets.map(t => ({ ...t }))
    targets[ti].percentual = v
    const others = targets.map((t, j) => ({ j, w: Number(t.percentual) || 0 })).filter(o => o.j !== ti)
    if (others.length > 0) {
      const remaining = Math.round((100 - v) * 100) / 100
      const sumOthers = others.reduce((a, o) => a + o.w, 0)
      let acc = 0
      others.forEach((o, k) => {
        const share = k === others.length - 1
          ? Math.round((remaining - acc) * 100) / 100
          : (sumOthers > 0 ? Math.round((o.w / sumOthers) * remaining * 100) / 100 : Math.round((remaining / others.length) * 100) / 100)
        if (k !== others.length - 1) acc += share
        targets[o.j].percentual = Math.max(0, share)
      })
    }
    return { ...pl, targets }
  }))
  const distribuirPlan = (pi: number) => setPlans(p => p.map((pl, i) => {
    if (i !== pi) return pl
    const n = pl.targets.length
    if (n === 0) { toast.error('Adicione ao menos um destino no período.'); return pl }
    const base = Math.floor((100 / n) * 100) / 100
    return { ...pl, targets: pl.targets.map((t, k) => ({ ...t, percentual: k === n - 1 ? Math.round((100 - base * (n - 1)) * 100) / 100 : base })) }
  }))
  const planSoma = (pl: PlanRow) => Math.round(pl.targets.reduce((a, t) => a + (Number(t.percentual) || 0), 0) * 100) / 100

  const savePlans = async () => {
    if (!selId) return
    for (const pl of plans) {
      if (pl.targets.some(t => !t.target_project_id)) { toast.error('Selecione o destino em todas as linhas dos períodos.'); return }
      if (pl.data_inicio && !pl.semFim && pl.data_fim && pl.data_inicio > pl.data_fim) { toast.error('Um período tem início depois do fim.'); return }
    }
    setSaving(true)
    try {
      await api.put(`/rateio-hours/projects/${selId}/plans`, {
        plans: plans.map(pl => ({
          data_inicio: pl.data_inicio || null,
          data_fim: pl.semFim ? null : (pl.data_fim || null),
          targets: pl.targets.map(t => ({ target_project_id: Number(t.target_project_id), percentual: Number(t.percentual) })),
        })),
      })
      toast.success('Períodos salvos')
      loadProjects(); loadPlans(selId); loadTimesheets(selId)
    } catch (e) { toast.error(apiMessage(e, 'Erro ao salvar períodos')) }
    finally { setSaving(false) }
  }

  // ── Ajuste manual de um apontamento ──
  // Expandir um apontamento: carrega os destinos atuais como PERCENTUAL (editável).
  // Expandir = só VER (read-only). A edição é destravada pelo botão "Editar".
  const toggleExpand = (a: Aponta) => {
    if (expandedId === a.id) { setExpandedId(null); setEditingId(null); return }
    setExpandedId(a.id); setEditingId(null)
  }
  const startEdit = (a: Aponta) => {
    setEditingId(a.id)
    const total = a.effort_minutes || 1
    setEditRows(a.splits.length > 0
      ? a.splits.map(s => ({ target_project_id: s.target_project_id, projeto: s.projeto ?? undefined, percentual: Math.round(s.minutes / total * 10000) / 100 }))
      : [])
  }
  const cancelEdit = () => { setEditingId(null); setEditRows([]) }
  const addEditRow = () => setEditRows(r => [...r, { target_project_id: '', percentual: 0 }])
  const removeEditRow = (i: number) => setEditRows(r => r.filter((_, idx) => idx !== i))
  const setEditRow = (i: number, patch: Partial<{ target_project_id: number | ''; projeto?: string; percentual: number }>) => setEditRows(r => r.map((row, idx) => idx === i ? { ...row, ...patch } : row))
  // Editar o % de um destino rebalanceia os demais p/ fechar 100% (igual ao editor de períodos).
  const setEditPct = (i: number, val: number) => setEditRows(rows => {
    const v = Math.max(0, Math.min(100, isNaN(val) ? 0 : val))
    const out = rows.map(r => ({ ...r })); out[i].percentual = v
    const others = out.map((r, j) => ({ j, w: Number(r.percentual) || 0 })).filter(o => o.j !== i)
    if (others.length > 0) {
      const remaining = Math.round((100 - v) * 100) / 100
      const sumO = others.reduce((a, o) => a + o.w, 0)
      let acc = 0
      others.forEach((o, k) => {
        const share = k === others.length - 1 ? Math.round((remaining - acc) * 100) / 100
          : (sumO > 0 ? Math.round((o.w / sumO) * remaining * 100) / 100 : Math.round((remaining / others.length) * 100) / 100)
        if (k !== others.length - 1) acc += share
        out[o.j].percentual = Math.max(0, share)
      })
    }
    return out
  })
  const editDistribuir = () => setEditRows(rows => {
    const n = rows.length; if (!n) return rows
    const base = Math.floor((100 / n) * 100) / 100
    return rows.map((r, k) => ({ ...r, percentual: k === n - 1 ? Math.round((100 - base * (n - 1)) * 100) / 100 : base }))
  })
  const saveEdit = async (a: Aponta) => {
    if (!selId) return
    if (editRows.length === 0 || editRows.some(r => !r.target_project_id)) { toast.error('Selecione o contrato em todas as linhas.'); return }
    const total = a.effort_minutes; const n = editRows.length; let acc = 0
    const dist = editRows.map((r, i) => {
      const m = i === n - 1 ? total - acc : Math.round(total * (Number(r.percentual) || 0) / 100)
      if (i !== n - 1) acc += m
      return { target_project_id: Number(r.target_project_id), minutes: m }
    }).filter(d => d.minutes > 0)
    setSavingEdit(true)
    try {
      await api.put(`/rateio-hours/projects/${selId}/timesheets/${a.id}/override`, { distribution: dist })
      toast.success('Divisão ajustada')
      setEditingId(null); loadTimesheets(selId)
    } catch (e) { toast.error(apiMessage(e, 'Erro ao ajustar divisão')) }
    finally { setSavingEdit(false) }
  }
  const resetOverride = async (a: Aponta) => {
    if (!selId) return
    if (!confirm('Voltar a divisão automática (pelo período) deste apontamento? O ajuste manual será perdido.')) return
    try {
      await api.put(`/rateio-hours/projects/${selId}/timesheets/${a.id}/override`, { auto: true })
      toast.success('Voltou ao automático')
      setExpandedId(null); loadTimesheets(selId)
    } catch (e) { toast.error(apiMessage(e, 'Erro ao reverter')) }
  }
  const editSum = Math.round(editRows.reduce((a, r) => a + (Number(r.percentual) || 0), 0) * 100) / 100

  const openAlloc = (p: RateioProject) => {
    setAllocFor(p)
    setPickedConsultants((p.consultants ?? []).map(c => c.id))
    setPickedCoord(p.coordinator ? String(p.coordinator.id) : '')
  }
  const saveTeam = async () => {
    if (!allocFor) return
    setSavingTeam(true)
    try {
      await api.put(`/rateio-hours/projects/${allocFor.id}/team`, { consultant_ids: pickedConsultants, coordinator_id: pickedCoord ? Number(pickedCoord) : null })
      toast.success('Equipe alocada.')
      setAllocFor(null)
      loadProjects()
    } catch (e) { toast.error(apiMessage(e, 'Erro ao alocar equipe')) }
    finally { setSavingTeam(false) }
  }

  const labelOf = (p: ProjOpt) => { const cli = p.customer_id ? customers[p.customer_id] : undefined; return `${cli ? cli + ' · ' : ''}${p.code ? p.code + ' · ' : ''}${p.name}` }
  // Seletor "tornar de rateio" = qualquer projeto (o servidor pode ser On Demand etc.).
  const notRateioOptions = allProjects.map(p => ({ id: p.id, name: labelOf(p) })).filter(o => !projects.some(p => p.id === o.id))
  // Seletor de DESTINO = só Cloud.
  const destOptions = destProjects.map(p => ({ id: p.id, name: labelOf(p) }))

  return (
    <AppLayout title="Rateio de Horas">
      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* Marcar projeto como rateio */}
        <div className="ds-card p-4">
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Projetos de rateio</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Um projeto de rateio recebe apontamentos e distribui as horas para os destinos Cloud, por período. Ele não aparece como card nos Kanbans, e o consultor não vê a divisão.</p>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 max-w-md"><SearchSelect value={markPick} onChange={setMarkPick} options={notRateioOptions} placeholder="Escolher projeto para tornar de rateio…" /></div>
            <button onClick={markAsRateio} disabled={!markPick} className="ds-btn-primary text-xs inline-flex items-center gap-1 px-3 py-2 disabled:opacity-60"><Server size={13} /> Tornar projeto de rateio</button>
          </div>
          {loading ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Carregando…</p> : (
            <div className="flex flex-wrap gap-2">
              {projects.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum projeto de rateio ainda.</p>}
              {projects.map(p => (
                <span key={p.id} className="inline-flex items-center rounded-lg border transition-colors"
                  style={selId === p.id ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : { borderColor: 'var(--border)', color: 'var(--text)' }}>
                  <button onClick={() => selectProject(p.id)} className="text-xs pl-3 pr-2 py-1.5">
                    {p.code ? p.code + ' · ' : ''}{p.name}{p.cliente ? ` (${p.cliente})` : ''} · {p.plans_count ?? 0} período{(p.plans_count ?? 0) !== 1 ? 's' : ''}
                  </button>
                  <button onClick={() => openAlloc(p)} title="Alocar consultores + coordenador (apontar/aprovar)" className="px-1.5 py-1.5 hover:opacity-70 inline-flex items-center gap-0.5 border-l" style={{ borderColor: selId === p.id ? 'rgba(255,255,255,0.35)' : 'var(--border)' }}>
                    <UserPlus size={12} />{(p.consultants?.length ?? 0) > 0 ? <span className="text-[10px] font-semibold">{p.consultants!.length}</span> : null}
                  </button>
                  <button onClick={() => unmark(p)} title="Deixar de ser projeto de rateio" className="pr-2 pl-0.5 py-1.5 hover:opacity-70"><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Editor de períodos */}
        {selId && (
          <div className="ds-card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--text)' }}><CalendarRange size={15} /> Períodos de rateio</p>
              <div className="flex items-center gap-2">
                <button onClick={addPlan} className="text-xs inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}><Plus size={13} /> Adicionar período</button>
                <button onClick={savePlans} disabled={saving} className="ds-btn-primary text-xs inline-flex items-center gap-1 px-3 py-1.5 disabled:opacity-60"><Save size={13} /> {saving ? 'Salvando…' : 'Salvar'}</button>
              </div>
            </div>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>Cada empresa entra numa data. O apontamento cai no período da sua data e as horas são divididas entre os destinos daquele período (pesos normalizados p/ 100%). Datas dos períodos não podem se sobrepor. Ao <b>salvar</b>, os apontamentos já lançados são re-distribuídos pelos períodos — exceto os ajustados manualmente (✏).</p>
            {plans.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum período. Adicione um período (início/fim) e os destinos Cloud que recebem as horas nessa faixa.</p>
            ) : (
              <div className="space-y-3">
                {plans.map((pl, pi) => {
                  const somaP = planSoma(pl)
                  const openP = openPlans.includes(pi)
                  return (
                    <div key={pi} className="rounded-xl" style={{ border: '1px solid var(--border)', background: 'var(--surface-hover)' }}>
                      <div className="flex flex-wrap items-center gap-3 p-3">
                        <button onClick={() => togglePlan(pi)} title={openP ? 'Recolher' : 'Expandir'} className="text-xs" style={{ color: 'var(--text-light)' }}>{openP ? '▾' : '▸'}</button>
                        <div className="inline-flex items-center gap-1.5">
                          <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>Início</span>
                          <input type="date" value={pl.data_inicio} onChange={e => setPlanField(pi, { data_inicio: e.target.value })}
                            className="text-xs px-2 py-1.5 rounded-lg" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
                        </div>
                        <div className="inline-flex items-center gap-1.5">
                          <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>Fim</span>
                          <input type="date" value={pl.data_fim} disabled={pl.semFim} onChange={e => setPlanField(pi, { data_fim: e.target.value })}
                            className="text-xs px-2 py-1.5 rounded-lg disabled:opacity-40" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
                          <label className="text-[11px] inline-flex items-center gap-1 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                            <input type="checkbox" checked={pl.semFim} onChange={e => setPlanField(pi, { semFim: e.target.checked, data_fim: e.target.checked ? '' : pl.data_fim })} />
                            sem data fim
                          </label>
                        </div>
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{pl.targets.length} destino{pl.targets.length !== 1 ? 's' : ''} · soma {somaP}</span>
                        <button onClick={() => removePlan(pi)} title="Remover período" className="ml-auto p-1 rounded-lg" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                      </div>
                      {openP && (<div className="px-3 pb-3">
                      <div className="flex items-center justify-end gap-2 mb-2">
                        <button onClick={() => distribuirPlan(pi)} className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}><Split size={12} /> Dividir igual</button>
                        <button onClick={() => addTarget(pi)} className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}><Plus size={12} /> Destino</button>
                      </div>
                      {pl.targets.length === 0 ? (
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Sem destinos neste período.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {pl.targets.map((t, ti) => {
                            const efetivo = somaP > 0 ? Math.round((Number(t.percentual) || 0) / somaP * 1000) / 10 : 0
                            return (
                              <div key={ti} className="flex items-center gap-2">
                                <div className="flex-1"><SearchSelect value={String(t.target_project_id)} onChange={v => { const opt = destProjects.find(p => String(p.id) === v); setTarget(pi, ti, { target_project_id: v ? Number(v) : '', projeto: opt?.name }) }}
                                  options={destOptions.filter(o => o.id !== selId && (o.id === t.target_project_id || !pl.targets.some((tt, tj) => tj !== ti && Number(tt.target_project_id) === o.id)))} placeholder="Projeto de destino (Cloud)…" /></div>
                                <input type="number" min={0} max={100} step="0.01" value={t.percentual} onChange={e => setTargetPct(pi, ti, Number(e.target.value))}
                                  className="w-20 text-xs px-2 py-2 rounded-lg text-right" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
                                <span className="text-[11px] w-14 text-right" style={{ color: 'var(--text-muted)' }} title="% efetivo (normalizado)">→ {efetivo}%</span>
                                <button onClick={() => removeTarget(pi, ti)} className="p-1.5 rounded-lg" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                              </div>
                            )
                          })}
                          <div className="flex items-center justify-end gap-2 pt-0.5 text-[11px]">
                            <span style={{ color: 'var(--text-muted)' }}>Soma dos pesos: {somaP} {Math.abs(somaP - 100) > 0.01 ? '(normalizado p/ 100%)' : ''}</span>
                          </div>
                        </div>
                      )}
                      </div>)}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Apontamentos do servidor + ajuste manual */}
        {selId && (
          <div className="ds-card p-4">
            <p className="text-sm font-semibold inline-flex items-center gap-1.5 mb-1" style={{ color: 'var(--text)' }}><ListChecks size={15} /> Apontamentos no servidor</p>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>Horas lançadas no servidor (o apontamento-origem não aparece na lista de Apontamentos — os rateios é que pagam o consultor). Clique numa linha para <b>ver/editar</b> a divisão por percentual ou trocar os contratos.</p>
            {apontas.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum apontamento no servidor ainda.</p>
            ) : (
              <div className="space-y-1">
                {apontas.map(a => {
                  const open = expandedId === a.id
                  return (
                    <div key={a.id} className="rounded-lg border" style={{ borderColor: open ? 'var(--primary)' : 'var(--border)' }}>
                      <button onClick={() => toggleExpand(a)} className="w-full flex items-start gap-3 px-3 py-2 text-left">
                        <span className="text-[10px] mt-0.5" style={{ color: 'var(--text-light)' }}>{open ? '▾' : '▸'}</span>
                        <span className="w-20 text-xs shrink-0" style={{ color: 'var(--text)' }}>{fmtDate(a.date)}</span>
                        <span className="w-40 text-xs shrink-0 truncate" style={{ color: 'var(--text-muted)' }}>{a.consultor ?? '—'}</span>
                        <span className="w-16 text-xs shrink-0 font-semibold" style={{ color: 'var(--text)' }}>{hh(a.effort_minutes)}</span>
                        <span className="flex-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {a.overridden && <span className="inline-block mr-2 px-1.5 py-0.5 rounded text-[10px] font-semibold align-middle" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>✏ manual</span>}
                          {a.splits.length === 0 ? <span style={{ color: 'var(--warning)' }}>Sem divisão (sem período nesta data)</span>
                            : a.splits.map((s, i) => <span key={i} className="inline-block mr-2">{s.projeto_codigo ?? s.projeto}: <b style={{ color: 'var(--text)' }}>{hh(s.minutes)}</b></span>)}
                        </span>
                      </button>
                      {open && (
                        <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                          {editingId !== a.id ? (
                            <>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Divisão do apontamento ({hh(a.effort_minutes)})</span>
                                <div className="flex items-center gap-2">
                                  {a.overridden && <button onClick={() => resetOverride(a)} title="Voltar à divisão automática (pelo período)" className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>Voltar ao automático</button>}
                                  <button onClick={() => startEdit(a)} className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}><Pencil size={12} /> Editar</button>
                                </div>
                              </div>
                              {a.splits.length === 0 ? (
                                <p className="text-[11px]" style={{ color: 'var(--warning)' }}>Sem divisão (sem período nesta data).</p>
                              ) : (
                                <div className="space-y-1">
                                  {a.splits.map((s, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                                      <span className="flex-1 truncate" style={{ color: 'var(--text)' }}>{s.projeto_codigo ? s.projeto_codigo + ' · ' : ''}{s.projeto}</span>
                                      <span className="w-12 text-right" style={{ color: 'var(--text-muted)' }}>{a.effort_minutes ? Math.round(s.minutes / a.effort_minutes * 100) : 0}%</span>
                                      <span className="w-16 text-right font-semibold" style={{ color: 'var(--text)' }}>{hh(s.minutes)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Editar divisão ({hh(a.effort_minutes)}) — por percentual</span>
                                <div className="flex items-center gap-2">
                                  <button onClick={editDistribuir} className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}><Split size={12} /> Dividir igual</button>
                                  <button onClick={addEditRow} className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}><Plus size={12} /> Contrato</button>
                                </div>
                              </div>
                              {editRows.length === 0 ? (
                                <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>Sem destinos. Adicione os contratos que recebem estas horas.</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {editRows.map((r, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                      <div className="flex-1"><SearchSelect value={String(r.target_project_id)} onChange={v => { const opt = destProjects.find(p => String(p.id) === v); setEditRow(i, { target_project_id: v ? Number(v) : '', projeto: opt?.name }) }}
                                        options={destOptions.filter(o => o.id === r.target_project_id || !editRows.some((rr, ri) => ri !== i && Number(rr.target_project_id) === o.id))} placeholder="Contrato (Cloud)…" /></div>
                                      <input type="number" min={0} max={100} step="0.01" value={r.percentual} onChange={e => setEditPct(i, Number(e.target.value))}
                                        className="w-20 text-xs px-2 py-2 rounded-lg text-right" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
                                      <span className="text-[11px] w-16 text-right" style={{ color: 'var(--text-muted)' }}>{hh(Math.round(a.effort_minutes * (Number(r.percentual) || 0) / 100))}</span>
                                      <button onClick={() => removeEditRow(i)} className="p-1.5 rounded-lg" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="flex items-center justify-between mt-3">
                                <span className="text-[11px]" style={{ color: Math.abs(editSum - 100) > 0.01 ? 'var(--warning)' : 'var(--text-muted)' }}>Soma: {editSum}%{Math.abs(editSum - 100) > 0.01 ? ' (será normalizada p/ 100%)' : ''}</span>
                                <div className="flex items-center gap-2">
                                  <button onClick={cancelEdit} className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>Cancelar</button>
                                  <button onClick={() => saveEdit(a)} disabled={savingEdit} className="ds-btn-primary text-xs inline-flex items-center gap-1 px-3 py-1.5 disabled:opacity-60"><Save size={13} /> {savingEdit ? 'Salvando…' : 'Salvar divisão'}</button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Alocar equipe do servidor de rateio: consultores apontam + 1 coordenador aprova. */}
      {allocFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setAllocFor(null)}>
          <div className="ds-card w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}><Users size={14} className="inline mr-1" /> Alocar equipe</p>
              <button onClick={() => setAllocFor(null)} className="hover:opacity-70"><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{allocFor.code ? allocFor.code + ' · ' : ''}{allocFor.name}. Os consultores poderão <b>apontar</b> horas neste projeto; o coordenador <b>aprova</b>.</p>

            <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-light)' }}>Consultores (apontam)</p>
            <SearchSelect value="" onChange={v => { const id = Number(v); if (id && !pickedConsultants.includes(id)) setPickedConsultants(c => [...c, id]) }}
              options={consultantOpts.filter(o => !pickedConsultants.includes(o.id))} placeholder="Adicionar consultor…" />
            <div className="flex flex-wrap gap-1.5 mt-2 mb-4">
              {pickedConsultants.length === 0 && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum consultor.</span>}
              {pickedConsultants.map(id => { const c = consultantOpts.find(o => o.id === id); return (
                <span key={id} className="inline-flex items-center gap-1 text-xs rounded-lg border px-2 py-1" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
                  {c?.name ?? `#${id}`}<button onClick={() => setPickedConsultants(cs => cs.filter(x => x !== id))} className="hover:opacity-70"><X size={11} /></button>
                </span>
              ) })}
            </div>

            <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-light)' }}>Coordenador (aprova)</p>
            <SearchSelect value={pickedCoord} onChange={setPickedCoord} options={coordOpts.map(o => ({ id: o.id, name: o.name }))} placeholder="Escolher coordenador…" />

            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setAllocFor(null)} className="text-xs px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>Cancelar</button>
              <button onClick={saveTeam} disabled={savingTeam} className="ds-btn-primary text-xs inline-flex items-center gap-1 px-3 py-2 disabled:opacity-60"><Save size={13} /> {savingTeam ? 'Salvando…' : 'Salvar equipe'}</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
