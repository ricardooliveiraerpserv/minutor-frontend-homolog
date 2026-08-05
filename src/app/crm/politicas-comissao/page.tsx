'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Percent, Plus, Pencil, Trash2, X, Calculator, ArrowRight, Building2, History, Users } from 'lucide-react'

interface Pipeline { id: number; name: string }
interface Policy { id: number; name: string; active: boolean; priority: number; cargo: string | null; pipeline_id: number | null; tipo_negocio: string | null; min_valor: number | null; max_valor: number | null; min_margem: number | null; max_margem: number | null; min_atingimento: number | null; max_atingimento: number | null; percentual: number }
interface Settings { percentual_padrao: number; base_calculo: string; pagamento: string; forma_calculo: string }
interface Exception { user_id: number; name: string; cargo: string | null; percentual: number | null; vigencia_inicio: string | null; vigencia_fim: string | null; motivo: string | null }
interface Data { policies: Policy[]; pipelines: Pipeline[]; cargos: string[]; settings: Settings; exceptions: Exception[] }

const BASE_CALC = [{ v: 'valor', l: 'Valor da venda' }, { v: 'receita_liquida', l: 'Receita líquida' }, { v: 'margem', l: 'Margem' }]
const PAGAMENTO = [{ v: 'ganho', l: 'Oportunidade ganha' }, { v: 'faturado', l: 'Pedido faturado' }, { v: 'recebido', l: 'Pedido recebido' }]
const FORMA = [{ v: 'fixo', l: 'Percentual fixo' }, { v: 'progressivo', l: 'Progressivo' }, { v: 'faixa', l: 'Faixa' }, { v: 'margem', l: 'Margem' }]

const fmtBRL = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const TIPOS: { v: string; l: string }[] = [{ v: 'novo_cliente', l: 'Novo cliente' }, { v: 'renovacao', l: 'Renovação' }]
const tipoLabel = (v: string | null) => TIPOS.find(t => t.v === v)?.l ?? v

export default function CrmPoliticasComissaoPage() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [editing, setEditing] = useState<Policy | 'new' | null>(null)
  const [excEdit, setExcEdit] = useState<Exception | null>(null)
  const [showHist, setShowHist] = useState(false)

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
    if (p.tipo_negocio) parts.push(tipoLabel(p.tipo_negocio) as string)
    if (p.min_valor != null || p.max_valor != null) parts.push(`Valor ${p.min_valor != null ? fmtBRL(p.min_valor) : '0'}–${p.max_valor != null ? fmtBRL(p.max_valor) : '∞'}`)
    if (p.min_margem != null || p.max_margem != null) parts.push(`Margem ${p.min_margem ?? 0}–${p.max_margem ?? 100}%`)
    if (p.min_atingimento != null || p.max_atingimento != null) parts.push(`Atingim. ${p.min_atingimento ?? 0}–${p.max_atingimento != null ? p.max_atingimento : '∞'}%`)
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
        {d && <div className="flex items-center gap-2">
          <button onClick={() => setShowHist(true)} className="text-sm rounded-lg px-3 py-2 flex items-center gap-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}><History size={14} /> Auditoria</button>
          <button onClick={() => setEditing('new')} className="text-sm rounded-lg px-4 py-2 font-semibold flex items-center gap-1.5" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Nova regra</button>
        </div>}
      </div>

      {denied ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Você não tem acesso às políticas de comissão.</p>
      : loading ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</p>
      : d && (
        <div className="space-y-5">
          <PoliticaPadraoCard settings={d.settings} onSaved={load} />
          <ExcecoesCard exceptions={d.exceptions} onEdit={setExcEdit} onRemoved={load} />
          <div>
            <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>Regras condicionais</h2>
            <p className="text-[11px] mb-2" style={{ color: 'var(--text-light)' }}>Sobrepõem o % do vendedor/padrão quando as condições casam.</p>
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
          </div>
        </div>
      )}

      {editing && d && <PolicyEditor policy={editing === 'new' ? null : editing} pipelines={d.pipelines} cargos={d.cargos} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {excEdit && <ExceptionModal exc={excEdit} onClose={() => setExcEdit(null)} onSaved={() => { setExcEdit(null); load() }} />}
      {showHist && <AuditoriaDrawer onClose={() => setShowHist(false)} />}
    </AppLayout>
  )
}

function Simulador({ pipelines, cargos }: { pipelines: Pipeline[]; cargos: string[] }) {
  const [valor, setValor] = useState('')
  const [margem, setMargem] = useState('')
  const [cargo, setCargo] = useState('')
  const [pipelineId, setPipelineId] = useState('')
  const [tipo, setTipo] = useState('')
  const [ating, setAting] = useState('')
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
        tipo_negocio: tipo || null, atingimento: ating ? Number(ating.replace(',', '.')) : null,
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
        <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Tipo de negócio</label><select value={tipo} onChange={e => setTipo(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inp}><option value="">Qualquer</option>{TIPOS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
        <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Atingimento de meta (%)</label><input inputMode="decimal" value={ating} onChange={e => setAting(e.target.value)} placeholder="opcional" className="w-full px-3 py-2 rounded-lg text-sm outline-none tabular-nums" style={inp} /></div>
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
    cargo: policy?.cargo ?? '', pipeline_id: policy?.pipeline_id ? String(policy.pipeline_id) : '', tipo_negocio: policy?.tipo_negocio ?? '',
    min_valor: policy?.min_valor != null ? String(policy.min_valor) : '', max_valor: policy?.max_valor != null ? String(policy.max_valor) : '',
    min_margem: policy?.min_margem != null ? String(policy.min_margem) : '', max_margem: policy?.max_margem != null ? String(policy.max_margem) : '',
    min_atingimento: policy?.min_atingimento != null ? String(policy.min_atingimento) : '', max_atingimento: policy?.max_atingimento != null ? String(policy.max_atingimento) : '',
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
    const pctNum = (v: string) => v === '' ? null : Number(String(v).replace(',', '.'))
    const body = {
      name: f.name, active: f.active, priority: Number(f.priority) || 100,
      cargo: f.cargo || null, pipeline_id: f.pipeline_id ? Number(f.pipeline_id) : null, tipo_negocio: f.tipo_negocio || null,
      min_valor: num(f.min_valor), max_valor: num(f.max_valor),
      min_margem: pctNum(f.min_margem), max_margem: pctNum(f.max_margem),
      min_atingimento: pctNum(f.min_atingimento), max_atingimento: pctNum(f.max_atingimento),
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
          <div className="col-span-2"><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Tipo de negócio</label><select value={f.tipo_negocio} onChange={e => set('tipo_negocio', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inp}><option value="">Qualquer</option>{TIPOS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
          {field('Valor mín. (R$)', 'min_valor', '—')}
          {field('Valor máx. (R$)', 'max_valor', '—')}
          {field('Margem mín. (%)', 'min_margem', '—')}
          {field('Margem máx. (%)', 'max_margem', '—')}
          {field('Atingim. mín. (%)', 'min_atingimento', '—')}
          {field('Atingim. máx. (%)', 'max_atingimento', '—')}
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

function PoliticaPadraoCard({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [pct, setPct] = useState(String(settings.percentual_padrao))
  const [base, setBase] = useState(settings.base_calculo)
  const [pag, setPag] = useState(settings.pagamento)
  const [forma, setForma] = useState(settings.forma_calculo)
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const inp = { background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }
  const dirty = String(settings.percentual_padrao) !== pct || settings.base_calculo !== base || settings.pagamento !== pag || settings.forma_calculo !== forma

  const save = async () => {
    const v = Number(pct.replace(',', '.'))
    if (isNaN(v) || v < 0 || v > 100) { toast.error('Percentual inválido'); return }
    setSaving(true)
    try { await api.put('/crm/comissoes/politicas/settings', { percentual_padrao: v, base_calculo: base, pagamento: pag, forma_calculo: forma, motivo: motivo || null }); toast.success('Política padrão salva'); setMotivo(''); onSaved() }
    catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }
  const seg = (val: string, set: (v: string) => void, opts: { v: string; l: string }[]) => (
    <div className="flex flex-wrap gap-1.5">{opts.map(o => <button key={o.v} onClick={() => set(o.v)} className="text-[11px] px-2.5 py-1.5 rounded-lg font-medium" style={val === o.v ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{o.l}</button>)}</div>
  )
  return (
    <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <h2 className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: 'var(--text)' }}><Building2 size={16} style={{ color: 'var(--primary)' }} /> Política Padrão da empresa</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Percentual padrão (%)</label><input inputMode="decimal" value={pct} onChange={e => setPct(e.target.value)} className="w-32 px-3 py-2 rounded-lg text-sm outline-none tabular-nums" style={inp} /></div>
        <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Base de cálculo</label>{seg(base, setBase, BASE_CALC)}</div>
        <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Pagamento da comissão</label>{seg(pag, setPag, PAGAMENTO)}</div>
        <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Forma de cálculo</label>{seg(forma, setForma, FORMA)}</div>
      </div>
      {dirty && <div className="flex items-end gap-2 mt-3">
        <div className="flex-1"><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Motivo da alteração</label><input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: nova política comercial" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inp} /></div>
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saving ? 'Salvando…' : 'Salvar'}</button>
      </div>}
    </div>
  )
}

function ExcecoesCard({ exceptions, onEdit, onRemoved }: { exceptions: Exception[]; onEdit: (e: Exception) => void; onRemoved: () => void }) {
  const remove = async (e: Exception) => {
    if (!confirm(`Remover a exceção de ${e.name}? Voltará a usar a política padrão.`)) return
    try { await api.delete(`/crm/comissoes/politicas/excecao/${e.user_id}`); toast.success('Exceção removida'); onRemoved() }
    catch { toast.error('Erro ao remover') }
  }
  const fmtV = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : null
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div className="p-3 flex items-center gap-1.5" style={{ borderBottom: '1px solid var(--border)' }}><Users size={16} style={{ color: 'var(--primary)' }} /><h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Exceções por vendedor</h2><span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· sem exceção usa a política padrão</span></div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr style={{ color: 'var(--text-light)' }}>{['Vendedor', 'Cargo', '%', 'Vigência', 'Motivo', ''].map((h, i) => <th key={i} className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wide ${i === 2 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {exceptions.map(e => (
              <tr key={e.user_id} className="transition hover:brightness-110" style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--text)' }}>{e.name}</td>
                <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{e.cargo ?? '—'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: e.percentual != null ? 'var(--primary)' : 'var(--text-light)' }}>{e.percentual != null ? `${e.percentual}%` : 'padrão'}</td>
                <td className="px-3 py-2.5 text-[11px]" style={{ color: 'var(--text-light)' }}>{e.vigencia_inicio ? `${fmtV(e.vigencia_inicio)}${e.vigencia_fim ? ` – ${fmtV(e.vigencia_fim)}` : ''}` : '—'}</td>
                <td className="px-3 py-2.5 text-[11px] truncate max-w-[180px]" style={{ color: 'var(--text-light)' }} title={e.motivo ?? ''}>{e.motivo ?? '—'}</td>
                <td className="px-3 py-2.5 text-right"><div className="flex gap-1 justify-end">
                  <button onClick={() => onEdit(e)} className="p-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}><Pencil size={13} /></button>
                  {e.percentual != null && <button onClick={() => remove(e)} className="p-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--danger-border)' }}><Trash2 size={13} /></button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ExceptionModal({ exc, onClose, onSaved }: { exc: Exception; onClose: () => void; onSaved: () => void }) {
  const [usarPadrao, setUsarPadrao] = useState(exc.percentual == null)
  const [pct, setPct] = useState(exc.percentual != null ? String(exc.percentual) : '')
  const [ini, setIni] = useState(exc.vigencia_inicio ?? '')
  const [fim, setFim] = useState(exc.vigencia_fim ?? '')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const inp = { background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text)' }

  const save = async () => {
    if (!motivo.trim()) { toast.error('Informe o motivo'); return }
    setSaving(true)
    try {
      if (usarPadrao) { await api.delete(`/crm/comissoes/politicas/excecao/${exc.user_id}`) }
      else {
        const v = Number(pct.replace(',', '.'))
        if (isNaN(v) || v < 0 || v > 100) { toast.error('Percentual inválido'); setSaving(false); return }
        await api.put('/crm/comissoes/politicas/excecao', { user_id: exc.user_id, percentual: v, vigencia_inicio: ini || null, vigencia_fim: fim || null, motivo })
      }
      toast.success('Exceção salva'); onSaved()
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>Editar exceção · {exc.name}</h3><button onClick={onClose}><X size={18} style={{ color: 'var(--text-light)' }} /></button></div>
        <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer" style={{ color: 'var(--text)' }}><input type="checkbox" checked={usarPadrao} onChange={e => setUsarPadrao(e.target.checked)} /> Usar política padrão da empresa</label>
        {!usarPadrao && <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Percentual (%)</label><input inputMode="decimal" value={pct} onChange={e => setPct(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none tabular-nums" style={inp} /></div>
            <div />
            <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Vigência início</label><input type="date" value={ini} onChange={e => setIni(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inp} /></div>
            <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Vigência fim</label><input type="date" value={fim} onChange={e => setFim(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inp} /></div>
          </div>
        </>}
        <label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Motivo *</label>
        <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Promoção, campanha, mudança de cargo…" className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-4" style={inp} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>Cancelar</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

function AuditoriaDrawer({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { api.get<{ data: any[] }>('/crm/comissoes/politicas/historico').then(r => setRows(r?.data ?? [])).catch(() => {}).finally(() => setLoading(false)) }, [])
  const fmtDt = (s: string | null) => s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-2xl h-full overflow-y-auto p-5" style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="font-bold" style={{ color: 'var(--text)' }}>Auditoria de comissões</h3><button onClick={onClose}><X size={18} style={{ color: 'var(--text-light)' }} /></button></div>
        {loading ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</p>
        : rows.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Sem alterações registradas.</p>
        : <div className="space-y-2">{rows.map(h => (
            <div key={h.id} className="rounded-lg p-3 text-sm" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between"><span className="font-medium" style={{ color: 'var(--text)' }}>{h.alvo}{h.campo === 'politica_padrao' && <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>padrão</span>}</span><span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{fmtDt(h.em)}</span></div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{h.valor_anterior != null ? `${h.valor_anterior}%` : '—'} → <b style={{ color: 'var(--text)' }}>{h.valor_novo != null ? `${h.valor_novo}%` : 'removida'}</b>{h.por && ` · ${h.por}`}{h.ip && <span style={{ color: 'var(--text-light)' }}> · {h.ip}</span>}</p>
              {h.motivo && <p className="text-[11px] mt-1 italic" style={{ color: 'var(--text-light)' }}>“{h.motivo}”</p>}
            </div>
          ))}</div>}
      </div>
    </div>
  )
}
