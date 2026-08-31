'use client'

// Rateio de Horas — configura os projetos-servidor (is_rateio) e os destinos que recebem
// as horas apontadas neles (com %). O fan-out em apontamentos-filhos é feito no backend.

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api, apiMessage } from '@/lib/api'
import { toast } from 'sonner'
import { SearchSelect } from '@/components/ui/search-select'
import { Plus, Trash2, Split, Save, Server, X, UserPlus, Users } from 'lucide-react'

interface TeamMember { id: number; name: string }
interface RateioProject { id: number; name: string; code: string | null; cliente: string | null; targets_count: number; consultants?: TeamMember[]; coordinator?: TeamMember | null }
interface ProjOpt { id: number; name: string; code?: string | null; customer_id?: number | null }
interface TargetRow { target_project_id: number | ''; projeto?: string; cliente?: string; percentual: number }

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
  const [rows, setRows] = useState<TargetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [markPick, setMarkPick] = useState('')

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

  const loadTargets = useCallback((id: number) => {
    api.get<{ targets: { target_project_id: number; projeto: string; projeto_codigo: string | null; cliente: string | null; percentual: number }[] }>(`/rateio-hours/projects/${id}/targets`)
      .then(r => setRows((r.targets ?? []).map(t => ({ target_project_id: t.target_project_id, projeto: t.projeto, cliente: t.cliente ?? undefined, percentual: t.percentual }))))
      .catch(e => toast.error(apiMessage(e, 'Erro ao carregar destinos')))
  }, [])

  const selectProject = (id: number) => { setSelId(id); loadTargets(id) }

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
    if (!confirm(`Desfazer "${p.name}" como projeto de rateio? Os destinos configurados serão removidos.`)) return
    try {
      await api.put(`/rateio-hours/projects/${p.id}/targets`, { targets: [] })
      await api.put(`/projects/${p.id}`, { is_rateio: false })
      toast.success('Projeto deixou de ser de rateio')
      if (selId === p.id) { setSelId(null); setRows([]) }
      loadProjects()
    } catch (e) { toast.error(apiMessage(e, 'Erro ao desfazer')) }
  }

  const addRow = () => setRows(r => [...r, { target_project_id: '', percentual: 0 }])
  const removeRow = (i: number) => setRows(r => r.filter((_, idx) => idx !== i))
  const setRow = (i: number, patch: Partial<TargetRow>) => setRows(r => r.map((row, idx) => idx === i ? { ...row, ...patch } : row))

  const distribuir = () => {
    const n = rows.length
    if (n === 0) { toast.error('Adicione ao menos um destino.'); return }
    const base = Math.floor((100 / n) * 100) / 100
    setRows(r => r.map((row, i) => ({ ...row, percentual: i === n - 1 ? Math.round((100 - base * (n - 1)) * 100) / 100 : base })))
  }

  const soma = Math.round(rows.reduce((a, r) => a + (Number(r.percentual) || 0), 0) * 100) / 100
  const somaOk = rows.length === 0 || Math.abs(soma - 100) < 0.01

  const save = async () => {
    if (!selId) return
    if (!somaOk) { toast.error(`A soma dos percentuais deve ser 100% (atual: ${soma}%).`); return }
    if (rows.some(r => !r.target_project_id)) { toast.error('Selecione o projeto de destino em todas as linhas.'); return }
    setSaving(true)
    try {
      await api.put(`/rateio-hours/projects/${selId}/targets`, { targets: rows.map(r => ({ target_project_id: Number(r.target_project_id), percentual: Number(r.percentual) })) })
      toast.success('Destinos salvos')
      loadProjects(); loadTargets(selId)
    } catch (e) { toast.error(apiMessage(e, 'Erro ao salvar destinos')) }
    finally { setSaving(false) }
  }

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
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Um projeto de rateio recebe apontamentos e distribui as horas para os destinos. Ele não aparece como card nos Kanbans.</p>
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
                    {p.code ? p.code + ' · ' : ''}{p.name}{p.cliente ? ` (${p.cliente})` : ''} · {p.targets_count} destino{p.targets_count !== 1 ? 's' : ''}
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

        {/* Editor de destinos */}
        {selId && (
          <div className="ds-card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Destinos e percentuais</p>
              <div className="flex items-center gap-2">
                <button onClick={distribuir} className="text-xs inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}><Split size={13} /> Dividir igualmente</button>
                <button onClick={addRow} className="text-xs inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}><Plus size={13} /> Adicionar destino</button>
                <button onClick={save} disabled={saving} className="ds-btn-primary text-xs inline-flex items-center gap-1 px-3 py-1.5 disabled:opacity-60"><Save size={13} /> {saving ? 'Salvando…' : 'Salvar'}</button>
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum destino. Adicione os projetos que receberão as horas (podem ser de qualquer cliente).</p>
            ) : (
              <div className="space-y-2">
                {rows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1"><SearchSelect value={String(row.target_project_id)} onChange={v => { const opt = destProjects.find(p => String(p.id) === v); setRow(i, { target_project_id: v ? Number(v) : '', projeto: opt?.name }) }} options={destOptions.filter(o => o.id !== selId && (o.id === row.target_project_id || !rows.some((rr, ri) => ri !== i && Number(rr.target_project_id) === o.id)))} placeholder="Projeto de destino (Cloud)…" /></div>
                    <input type="number" min={0} max={100} step="0.01" value={row.percentual} onChange={e => setRow(i, { percentual: Number(e.target.value) })}
                      className="w-24 text-xs px-2 py-2 rounded-lg text-right" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>%</span>
                    <button onClick={() => removeRow(i)} className="p-1.5 rounded-lg" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                  </div>
                ))}
                <div className="flex items-center justify-end gap-2 pt-1 text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>Soma:</span>
                  <span className="font-semibold" style={{ color: somaOk ? 'var(--success)' : 'var(--danger)' }}>{soma}%</span>
                </div>
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
