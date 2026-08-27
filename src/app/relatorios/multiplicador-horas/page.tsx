'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader } from '@/components/ui/loading'
import { SearchSelect } from '@/components/ui/search-select'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal'
import { useState, useEffect, useCallback } from 'react'
import { api, apiMessage } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Percent, Info, Ban, CheckCircle } from 'lucide-react'

interface Rule {
  id: number; contract_id: number; customer_id: number; customer_name: string | null
  contract_label: string; percent: number; factor: number
  start_date: string | null; end_date: string | null; active: boolean; reason: string | null
  created_by: string | null; created_at: string | null
}
interface Opt { id: string | number; name: string }
// Faixa editável no modal: multiplicador (×) + período. Fim vazio quando "sem fim".
interface Faixa { id?: number; factor: string; start: string; noEnd: boolean; end: string; reason: string }

const fmtDate = (d: string | null) => (d ? d.split('-').reverse().join('/') : null)
const today = () => new Date().toISOString().slice(0, 10)
const emptyFaixa = (): Faixa => ({ factor: '', start: today(), noEnd: true, end: '', reason: '' })
const ruleToFaixa = (r: Rule): Faixa => ({
  id: r.id, factor: String(r.factor).replace('.', ','),
  start: r.start_date ?? today(), noEnd: !r.end_date, end: r.end_date ?? '', reason: r.reason ?? '',
})
const parseFactor = (v: string) => Number(String(v).replace(',', '.'))
const previewFor = (v: string) => {
  const f = parseFactor(v)
  return f > 1 ? (10 * f).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') : null
}

export default function MultiplicadorHorasPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<Opt[]>([])

  const [open, setOpen] = useState(false)
  // Contrato em edição (null = criação, com seletor de cliente/contrato).
  const [editingContract, setEditingContract] = useState<{ id: number; label: string; customer_name: string | null } | null>(null)
  const [fCustomer, setFCustomer] = useState('')
  const [fContract, setFContract] = useState('')
  const [contractOpts, setContractOpts] = useState<Opt[]>([])
  const [faixas, setFaixas] = useState<Faixa[]>([emptyFaixa()])
  const [loadingFaixas, setLoadingFaixas] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ items: Rule[] }>('/contract-hour-multipliers')
      setRules(r.items ?? [])
    } catch (e) { toast.error(apiMessage(e, 'Erro ao carregar')) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.get<any>('/customers?pageSize=500').then(r => {
      const items = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []
      setCustomers(items.filter((c: any) => c?.id && c?.name).map((c: any) => ({ id: c.id, name: c.name }))
        .sort((a: Opt, b: Opt) => a.name.localeCompare(b.name, 'pt-BR')))
    }).catch(() => {})
  }, [])

  // Contratos do cliente selecionado (modo criação).
  useEffect(() => {
    if (!fCustomer || editingContract) return
    setFContract('')
    api.get<{ items: { id: number; label: string }[] }>(`/contract-hour-multipliers/contracts?customer_id=${fCustomer}`)
      .then(r => setContractOpts((r.items ?? []).map(c => ({ id: c.id, name: c.label }))))
      .catch(() => setContractOpts([]))
  }, [fCustomer, editingContract])

  // Ao escolher um contrato (criação), carrega as faixas ativas que ele já tenha —
  // o sync substitui o conjunto ativo, então precisamos partir do que existe.
  const loadFaixasOf = useCallback(async (contractId: number) => {
    setLoadingFaixas(true)
    try {
      const r = await api.get<{ items: Rule[] }>(`/contract-hour-multipliers/faixas?contract_id=${contractId}`)
      const items = r.items ?? []
      setFaixas(items.length ? items.map(ruleToFaixa) : [emptyFaixa()])
    } catch { setFaixas([emptyFaixa()]) }
    finally { setLoadingFaixas(false) }
  }, [])

  useEffect(() => {
    if (!fContract || editingContract) return
    loadFaixasOf(Number(fContract))
  }, [fContract, editingContract, loadFaixasOf])

  function openNew() {
    setEditingContract(null); setFCustomer(''); setFContract(''); setContractOpts([])
    setFaixas([emptyFaixa()]); setOpen(true)
  }
  function openEdit(r: Rule) {
    setEditingContract({ id: r.contract_id, label: r.contract_label, customer_name: r.customer_name })
    setFCustomer(String(r.customer_id)); setFContract(String(r.contract_id))
    setContractOpts([{ id: r.contract_id, name: r.contract_label }])
    setFaixas([]); setOpen(true)
    loadFaixasOf(r.contract_id)
  }

  const setFaixa = (i: number, patch: Partial<Faixa>) =>
    setFaixas(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f))
  const addFaixa = () => setFaixas(prev => [...prev, emptyFaixa()])
  const removeFaixa = (i: number) => setFaixas(prev => prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i))

  // Retorna a mensagem do 1º problema (validação + sobreposição de datas), ou null se OK.
  function validate(): string | null {
    for (let i = 0; i < faixas.length; i++) {
      const f = faixas[i]
      const factor = parseFactor(f.factor)
      const n = i + 1
      if (!Number.isFinite(factor) || factor <= 1) return `Faixa ${n}: informe um multiplicador maior que 1 (ex.: 1,5, 2, 3).`
      if (!f.start) return `Faixa ${n}: informe a data de início.`
      if (!f.noEnd && !f.end) return `Faixa ${n}: informe a data de fim ou marque "sem fim".`
      if (!f.noEnd && f.end < f.start) return `Faixa ${n}: a data de fim não pode ser antes do início.`
    }
    // Sobreposição: fim vazio ("sem fim") = infinito.
    const INF = '9999-12-31'
    const ranges = faixas.map(f => ({ s: f.start, e: f.noEnd ? INF : f.end }))
    for (let a = 0; a < ranges.length; a++) {
      for (let b = a + 1; b < ranges.length; b++) {
        if (ranges[a].s <= ranges[b].e && ranges[b].s <= ranges[a].e) {
          return `As faixas ${a + 1} e ${b + 1} têm datas que se sobrepõem. Ajuste os períodos (uma faixa por período).`
        }
      }
    }
    return null
  }

  async function save() {
    const contractId = editingContract ? editingContract.id : Number(fContract)
    if (!contractId) return toast.error('Selecione o contrato')
    const err = validate()
    if (err) return toast.error(err)

    const payload = {
      contract_id: contractId,
      faixas: faixas.map(f => ({
        id: f.id,
        // Guardamos como % de acréscimo: fator 1,5 → percent 50. Todo o SQL usa (1 + percent/100).
        percent: Math.round((parseFactor(f.factor) - 1) * 100 * 100) / 100,
        start_date: f.start,
        end_date: f.noEnd ? null : f.end,
        reason: f.reason.trim() || null,
      })),
    }
    setSaving(true)
    try {
      await api.post('/contract-hour-multipliers/sync', payload)
      toast.success('Faixas salvas')
      setOpen(false); load()
    } catch (e) { toast.error(apiMessage(e, 'Erro ao salvar')) }
    finally { setSaving(false) }
  }

  async function remove(r: Rule) {
    if (!window.confirm(`Remover esta faixa (×${r.factor.toFixed(2).replace('.', ',')}) de ${r.customer_name ?? 'cliente'} — ${r.contract_label}?`)) return
    try { await api.delete(`/contract-hour-multipliers/${r.id}`); toast.success('Faixa removida'); load() }
    catch (e) { toast.error(apiMessage(e, 'Erro ao remover')) }
  }

  // Ativa/desativa sem apagar. Desativada → horas voltam ao real; reativada → volta a inflar.
  async function toggleActive(r: Rule) {
    try {
      await api.put(`/contract-hour-multipliers/${r.id}`, {
        percent: r.percent, start_date: r.start_date, end_date: r.end_date,
        reason: r.reason, active: !r.active,
      })
      toast.success(r.active ? 'Faixa desativada' : 'Faixa ativada')
      load()
    } catch (e) { toast.error(apiMessage(e, 'Erro ao alterar status')) }
  }

  return (
    <AppLayout title="Multiplicador de Horas">
      <div className="space-y-4 max-w-6xl">
        {/* Explicação */}
        <div className="ds-card ds-card-pad" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Info size={15} style={{ color: 'var(--primary)', marginTop: 2, flexShrink: 0 }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)', margin: 0 }}>
            Aplica um <strong style={{ color: 'var(--text)' }}>multiplicador</strong> nas horas apontadas de um contrato,
            <strong style={{ color: 'var(--text)' }}> só do lado do cliente</strong> (fechamentos do cliente/contrato, faturamento e receita da rentabilidade).
            Um contrato pode ter <strong style={{ color: 'var(--text)' }}>várias faixas</strong> (períodos com alíquotas diferentes) — a multiplicação só ocorre nos apontamentos <strong style={{ color: 'var(--text)' }}>dentro do período</strong> de cada faixa; datas sem faixa ficam no real.
            <strong style={{ color: 'var(--text)' }}> Nunca</strong> afeta o consultor/parceiro (apontamento, fechamento, pagamento) — as horas a mais têm custo zero.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <h3 className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>Faixas cadastradas <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{rules.length}</span></h3>
          <button onClick={openNew} className="ds-btn-primary inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"><Plus size={14} /> Nova regra</button>
        </div>

        {loading ? <div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div> : (
          <div className="ds-card" style={{ overflow: 'hidden' }}>
            {rules.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)', padding: 20 }}>Nenhuma regra cadastrada ainda.</p>
            ) : (
              <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th className="px-4 py-2 font-medium">Cliente</th>
                    <th className="px-4 py-2 font-medium">Contrato</th>
                    <th className="px-4 py-2 font-medium text-center">Multiplicador</th>
                    <th className="px-4 py-2 font-medium">Início</th>
                    <th className="px-4 py-2 font-medium">Vigência</th>
                    <th className="px-4 py-2 font-medium text-center">Status</th>
                    <th className="px-4 py-2 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text)', opacity: r.active ? 1 : 0.55 }}>
                      <td className="px-4 py-2.5">{r.customer_name ?? '—'}</td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{r.contract_label}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span style={{ fontWeight: 600 }}>×{r.factor.toFixed(2).replace('.', ',')}</span>
                      </td>
                      <td className="px-4 py-2.5">{fmtDate(r.start_date) ?? '—'}</td>
                      <td className="px-4 py-2.5">{r.end_date ? fmtDate(r.end_date) : <span style={{ color: 'var(--text-light)' }}>sem fim</span>}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600, background: r.active ? 'var(--success-bg)' : 'var(--surface-hover)', color: r.active ? 'var(--success)' : 'var(--text-muted)' }}>{r.active ? 'Ativa' : 'Inativa'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button onClick={() => toggleActive(r)} title={r.active ? 'Desativar' : 'Ativar'} className="p-1.5 rounded-md hover:bg-[var(--surface-hover)]" style={{ color: r.active ? 'var(--warning)' : 'var(--success)' }}>{r.active ? <Ban size={14} /> : <CheckCircle size={14} />}</button>
                        <button onClick={() => openEdit(r)} title="Editar faixas do contrato" className="p-1.5 rounded-md hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)' }}><Pencil size={14} /></button>
                        <button onClick={() => remove(r)} title="Remover" className="p-1.5 rounded-md hover:bg-[var(--surface-hover)]" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {open && (
        <Modal open onClose={() => setOpen(false)} size="lg">
          <ModalHeader title={editingContract ? 'Editar faixas do contrato' : 'Nova regra de multiplicação'} subtitle="Multiplicador de horas faturáveis ao cliente, por contrato" icon={Percent} onClose={() => setOpen(false)} />
          <ModalBody className="space-y-3">
            <div>
              <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Cliente</div>
              <SearchSelect value={fCustomer} onChange={setFCustomer} options={customers} placeholder="Selecione o cliente" fullWidth disabled={!!editingContract} />
            </div>
            <div>
              <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Contrato afetado</div>
              <SearchSelect value={fContract} onChange={setFContract} options={contractOpts} placeholder={fCustomer ? 'Selecione o contrato' : 'Escolha o cliente primeiro'} fullWidth disabled={!!editingContract || !fCustomer} />
              {editingContract && <div className="text-[11px] mt-1" style={{ color: 'var(--text-light)' }}>O contrato não muda na edição — crie uma nova regra para outro contrato.</div>}
            </div>

            {/* Faixas: período + alíquota. + adiciona, 🗑 remove. Datas não podem sobrepor. */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[12px]" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Faixas (período · multiplicador)</div>
                <button type="button" onClick={addFaixa} className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-md" style={{ color: 'var(--primary)', border: '1px solid var(--border)' }}><Plus size={13} /> Adicionar faixa</button>
              </div>

              {loadingFaixas ? <div className="ds-card ds-card-pad"><SectionLoader label="Carregando faixas…" /></div> : (
                <div className="space-y-2">
                  {faixas.map((f, i) => {
                    const pv = previewFor(f.factor)
                    return (
                      <div key={i} className="ds-card" style={{ padding: 12, position: 'relative' }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px]" style={{ color: 'var(--text-light)', fontWeight: 600 }}>Faixa {i + 1}</span>
                          {faixas.length > 1 && (
                            <button type="button" onClick={() => removeFaixa(i)} title="Remover faixa" className="p-1 rounded-md hover:bg-[var(--surface-hover)]" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Multiplicador (×)</div>
                            <input className="ds-input" type="number" min={1} step="0.1" value={f.factor} onChange={e => setFaixa(i, { factor: e.target.value })} placeholder="Ex.: 2" style={{ width: '100%' }} />
                            <div className="text-[11px] mt-1" style={{ color: 'var(--text-light)' }}>{pv ? `Cada 10h vira ${pv}h` : 'Ex.: 1,5 · 2 · 3'}</div>
                          </div>
                          <div>
                            <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Início</div>
                            <input className="ds-input" type="date" value={f.start} onChange={e => setFaixa(i, { start: e.target.value })} style={{ width: '100%' }} />
                          </div>
                          <div>
                            <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Fim</div>
                            <input className="ds-input" type="date" value={f.end} min={f.start} disabled={f.noEnd} onChange={e => setFaixa(i, { end: e.target.value })} style={{ width: '100%', opacity: f.noEnd ? 0.5 : 1 }} />
                            <label className="flex items-center gap-1.5 text-[11px] mt-1" style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
                              <input type="checkbox" checked={f.noEnd} onChange={e => setFaixa(i, { noEnd: e.target.checked, end: e.target.checked ? '' : f.end })} /> Sem fim (indefinida)
                            </label>
                          </div>
                        </div>
                        <div className="mt-2">
                          <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Motivo (opcional)</div>
                          <input className="ds-input" value={f.reason} onChange={e => setFaixa(i, { reason: e.target.value })} placeholder="Ex.: markup comercial contrato X" maxLength={500} style={{ width: '100%' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <button className="ds-btn-secondary" onClick={() => setOpen(false)} disabled={saving}>Cancelar</button>
            <button className="ds-btn-primary" onClick={save} disabled={saving || loadingFaixas}>{saving ? 'Salvando…' : 'Salvar faixas'}</button>
          </ModalFooter>
        </Modal>
      )}
    </AppLayout>
  )
}
