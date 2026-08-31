'use client'

// Rateio de Horas — configura os projetos-servidor (is_rateio) e os destinos que recebem
// as horas apontadas neles (com %). O fan-out em apontamentos-filhos é feito no backend.

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api, apiMessage } from '@/lib/api'
import { toast } from 'sonner'
import { SearchSelect } from '@/components/ui/search-select'
import { Plus, Trash2, Split, Save, Server } from 'lucide-react'

interface RateioProject { id: number; name: string; code: string | null; cliente: string | null; targets_count: number }
interface ProjOpt { id: number; name: string; code?: string | null; customer_id?: number | null }
interface TargetRow { target_project_id: number | ''; projeto?: string; cliente?: string; percentual: number }

export default function RateioHorasPage() {
  const [projects, setProjects] = useState<RateioProject[]>([])
  const [allProjects, setAllProjects] = useState<ProjOpt[]>([])
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

  const projOptions = allProjects.map(p => ({ id: p.id, name: `${p.code ? p.code + ' · ' : ''}${p.name}` }))
  const notRateioOptions = projOptions.filter(o => !projects.some(p => p.id === o.id))

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
                <button key={p.id} onClick={() => selectProject(p.id)}
                  className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                  style={selId === p.id ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : { borderColor: 'var(--border)', color: 'var(--text)' }}>
                  {p.code ? p.code + ' · ' : ''}{p.name}{p.cliente ? ` (${p.cliente})` : ''} · {p.targets_count} destino{p.targets_count !== 1 ? 's' : ''}
                </button>
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
                    <div className="flex-1"><SearchSelect value={String(row.target_project_id)} onChange={v => { const opt = allProjects.find(p => String(p.id) === v); setRow(i, { target_project_id: v ? Number(v) : '', projeto: opt?.name }) }} options={projOptions.filter(o => o.id !== selId)} placeholder="Projeto de destino…" /></div>
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
    </AppLayout>
  )
}
