'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Percent, Plus, Pencil, Trash2, X, Calculator, ArrowRight } from 'lucide-react'

interface Pipeline { id: number; name: string }
interface Policy { id: number; name: string; active: boolean; priority: number; cargo: string | null; pipeline_id: number | null; min_valor: number | null; max_valor: number | null; min_margem: number | null; max_margem: number | null; percentual: number }
interface Data { policies: Policy[]; pipelines: Pipeline[]; cargos: string[] }

const fmtBRL = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export default function CrmPoliticasComissaoPage() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [editing, setEditing] = useState<Policy | 'new' | null>(null)

  const load = useCallback(() => {
    setLoading(true); setDenied(false)
    api.get<{ data: Data }>('/crm/comissoes/politicas')
      .then(r => setD(r?.data ?? null))
      .catch((e: any) => { if (String(e?.message || '').match(/acesso|403/)) setDenied(true); else toast.error('Erro ao carregar políticas') })
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const pipeName = (id: number | null) => d?.pipelines.find(p => p.id === id)?.name ?? null
  const cond = (p: Policy) => {
    const parts: string[] = []
    if (p.cargo) parts.push(`Cargo ${p.cargo}`)
    if (p.pipeline_id) parts.push(`Funil ${pipeName(p.pipeline_id) ?? p.pipeline_id}`)
    if (p.min_valor != null || p.max_valor != null) parts.push(`Valor ${p.min_valor != null ? fmtBRL(p.min_valor) : '0'}–${p.max_valor != null ? fmtBRL(p.max_valor) : '∞'}`)
    if (p.min_margem != null || p.max_margem != null) parts.push(`Margem ${p.min_margem ?? 0}–${p.max_margem ?? 100}%`)
    return parts.length ? parts : ['Qualquer negócio']
  }

  const remove = async (p: Policy) => {
    if (!confirm(`Excluir a política "${p.name}"?`)) return
    try { await api.delete(`/crm/comissoes/politicas/${p.id}`); toast.success('Política excluída'); load() }
    catch { toast.error('Erro ao excluir') }
  }

  return (
    <AppLayout title="Políticas de Comissão (CRM)">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}><Percent size={20} style={{ color: 'var(--primary)' }} /> Políticas de Comissão</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-light)' }}>Regras de percentual por condição. A 1ª regra (por prioridade) que casa vence; sem regra, usa o % do vendedor.</p>
        </div>
        {d && <button onClick={() => setEditing('new')} className="text-sm rounded-lg px-4 py-2 font-semibold flex items-center gap-1.5" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Nova política</button>}
      </div>

      {denied ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Você não tem acesso às políticas de comissão.</p>
      : loading ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</p>
      : d && (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
          <div className="min-w-0">
            {d.policies.length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={{ border: '1px dashed var(--border)', color: 'var(--text-light)' }}>Nenhuma política. A comissão usa o % por vendedor. Crie regras para variar por cargo, funil, valor ou margem.</div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <table className="w-full text-sm">
                  <thead><tr style={{ color: 'var(--text-light)' }}>
                    {['Prior.', 'Política', 'Condições', '%', ''].map((h, i) => <th key={i} className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wide ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {d.policies.map(p => (
                      <tr key={p.id} className="transition hover:brightness-110" style={{ borderTop: '1px solid var(--border)', opacity: p.active ? 1 : 0.55 }}>
                        <td className="px-3 py-2.5 text-center tabular-nums" style={{ color: 'var(--text-light)' }}>{p.priority}</td>
                        <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text)' }}>{p.name}{!p.active && <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>inativa</span>}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {cond(p).map((c, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{c}</span>)}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{p.percentual}%</td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => setEditing(p)} className="p-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}><Pencil size={13} /></button>
                            <button onClick={() => remove(p)} className="p-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--danger-border)' }}><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <Simulador pipelines={d.pipelines} cargos={d.cargos} />
        </div>
      )}

      {editing && d && <PolicyEditor policy={editing === 'new' ? null : editing} pipelines={d.pipelines} cargos={d.cargos} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </AppLayout>
  )
}

function Simulador({ pipelines, cargos }: { pipelines: Pipeline[]; cargos: string[] }) {
  const [valor, setValor] = useState('')
  const [margem, setMargem] = useState('')
  const [cargo, setCargo] = useState('')
  const [pipelineId, setPipelineId] = useState('')
  const [res, setRes] = useState<{ base: number; percentual: number; comissao: number; regra: string | null; origem: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const simular = async () => {
    const v = Number(valor.replace(/\./g, '').replace(',', '.'))
    if (isNaN(v) || v <= 0) { toast.error('Informe o valor'); return }
    setLoading(true)
    try {
      const r = await api.post<{ data: any }>('/crm/comissoes/simular', {
        valor: v, margem: margem ? Number(margem.replace(',', '.')) : null,
        cargo: cargo || null, pipeline_id: pipelineId ? Number(pipelineId) : null,
      })
      setRes(r.data)
    } catch { toast.error('Erro ao simular') } finally { setLoading(false) }
  }

  const inp = { background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }
  return (
    <aside className="rounded-xl p-4 self-start" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: 'var(--text)' }}><Calculator size={16} style={{ color: 'var(--primary)' }} /> Simulador</h3>
      <div className="space-y-2.5">
        <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Valor da venda</label><input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none tabular-nums" style={inp} /></div>
        <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Margem (%)</label><input inputMode="decimal" value={margem} onChange={e => setMargem(e.target.value)} placeholder="opcional" className="w-full px-3 py-2 rounded-lg text-sm outline-none tabular-nums" style={inp} /></div>
        <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Cargo</label><select value={cargo} onChange={e => setCargo(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inp}><option value="">Qualquer</option>{cargos.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Funil</label><select value={pipelineId} onChange={e => setPipelineId(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inp}><option value="">Qualquer</option>{pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <button onClick={simular} disabled={loading} className="w-full py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{loading ? 'Simulando…' : 'Simular'}</button>
      </div>
      {res && (
        <div className="mt-4 rounded-lg p-3" style={{ background: 'var(--surface-sunken)' }}>
          <div className="flex items-center justify-between text-xs mb-1"><span style={{ color: 'var(--text-muted)' }}>Base</span><span className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{fmtBRL(res.base)}</span></div>
          <div className="flex items-center justify-between text-xs mb-1"><span style={{ color: 'var(--text-muted)' }}>Percentual</span><span className="tabular-nums font-semibold" style={{ color: 'var(--primary)' }}>{res.percentual}%</span></div>
          <div className="flex items-center justify-between text-sm pt-1.5" style={{ borderTop: '1px solid var(--border)' }}><span style={{ color: 'var(--text-muted)' }}>Comissão</span><span className="tabular-nums font-bold" style={{ color: '#17914e' }}>{fmtBRL(res.comissao)}</span></div>
          <p className="text-[10px] mt-2 flex items-center gap-1" style={{ color: 'var(--text-light)' }}><ArrowRight size={10} /> {res.regra ? `Regra: ${res.regra}` : res.origem}</p>
        </div>
      )}
    </aside>
  )
}

function PolicyEditor({ policy, pipelines, cargos, onClose, onSaved }: { policy: Policy | null; pipelines: Pipeline[]; cargos: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: policy?.name ?? '', active: policy?.active ?? true, priority: String(policy?.priority ?? 100),
    cargo: policy?.cargo ?? '', pipeline_id: policy?.pipeline_id ? String(policy.pipeline_id) : '',
    min_valor: policy?.min_valor != null ? String(policy.min_valor) : '', max_valor: policy?.max_valor != null ? String(policy.max_valor) : '',
    min_margem: policy?.min_margem != null ? String(policy.min_margem) : '', max_margem: policy?.max_margem != null ? String(policy.max_margem) : '',
    percentual: policy?.percentual != null ? String(policy.percentual) : '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setF(s => ({ ...s, [k]: v }))
  const num = (v: string) => v === '' ? null : Number(String(v).replace(/\./g, '').replace(',', '.'))

  const save = async () => {
    if (!f.name.trim()) { toast.error('Informe o nome'); return }
    const pct = Number(String(f.percentual).replace(',', '.'))
    if (isNaN(pct) || pct < 0 || pct > 100) { toast.error('Percentual inválido (0–100)'); return }
    setSaving(true)
    const body = {
      name: f.name, active: f.active, priority: Number(f.priority) || 100,
      cargo: f.cargo || null, pipeline_id: f.pipeline_id ? Number(f.pipeline_id) : null,
      min_valor: num(f.min_valor), max_valor: num(f.max_valor),
      min_margem: f.min_margem === '' ? null : Number(String(f.min_margem).replace(',', '.')),
      max_margem: f.max_margem === '' ? null : Number(String(f.max_margem).replace(',', '.')),
      percentual: pct,
    }
    try {
      if (policy) await api.put(`/crm/comissoes/politicas/${policy.id}`, body)
      else await api.post('/crm/comissoes/politicas', body)
      toast.success('Política salva'); onSaved()
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  const inp = { background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }
  // função (não componente) para não remontar o input e perder foco a cada tecla
  const field = (label: string, k: string, ph?: string) => (
    <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label><input inputMode="decimal" value={(f as any)[k]} onChange={e => set(k, e.target.value)} placeholder={ph} className="w-full px-3 py-2 rounded-lg text-sm outline-none tabular-nums" style={inp} /></div>
  )
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl p-5 max-h-[92vh] overflow-y-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>{policy ? 'Editar política' : 'Nova política'}</h3><button onClick={onClose}><X size={18} style={{ color: 'var(--text-light)' }} /></button></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Nome</label><input value={f.name} onChange={e => set('name', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inp} /></div>
          <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Prioridade</label><input inputMode="numeric" value={f.priority} onChange={e => set('priority', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none tabular-nums" style={inp} /></div>
          <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Percentual (%)</label><input inputMode="decimal" value={f.percentual} onChange={e => set('percentual', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none tabular-nums" style={inp} /></div>
          <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Cargo</label><select value={f.cargo} onChange={e => set('cargo', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inp}><option value="">Qualquer</option>{cargos.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Funil</label><select value={f.pipeline_id} onChange={e => set('pipeline_id', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inp}><option value="">Qualquer</option>{pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          {field('Valor mín. (R$)', 'min_valor', '—')}
          {field('Valor máx. (R$)', 'max_valor', '—')}
          {field('Margem mín. (%)', 'min_margem', '—')}
          {field('Margem máx. (%)', 'max_margem', '—')}
          <label className="col-span-2 flex items-center gap-2 text-sm mt-1" style={{ color: 'var(--text-muted)' }}><input type="checkbox" checked={f.active} onChange={e => set('active', e.target.checked)} /> Ativa</label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>Cancelar</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
