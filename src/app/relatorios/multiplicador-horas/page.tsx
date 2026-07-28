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

const fmtDate = (d: string | null) => (d ? d.split('-').reverse().join('/') : null)
const today = () => new Date().toISOString().slice(0, 10)

export default function MultiplicadorHorasPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<Opt[]>([])

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Rule | null>(null)
  const [fCustomer, setFCustomer] = useState('')
  const [fContract, setFContract] = useState('')
  const [contractOpts, setContractOpts] = useState<Opt[]>([])
  const [fFactor, setFFactor] = useState('')
  const [fStart, setFStart] = useState('')
  const [fNoEnd, setFNoEnd] = useState(true)
  const [fEnd, setFEnd] = useState('')
  const [fReason, setFReason] = useState('')
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
    if (!fCustomer || editing) return
    setFContract('')
    api.get<{ items: { id: number; label: string }[] }>(`/contract-hour-multipliers/contracts?customer_id=${fCustomer}`)
      .then(r => setContractOpts((r.items ?? []).map(c => ({ id: c.id, name: c.label }))))
      .catch(() => setContractOpts([]))
  }, [fCustomer, editing])

  function openNew() {
    setEditing(null); setFCustomer(''); setFContract(''); setContractOpts([])
    setFFactor(''); setFStart(today()); setFNoEnd(true); setFEnd(''); setFReason('')
    setOpen(true)
  }
  function openEdit(r: Rule) {
    setEditing(r); setFCustomer(String(r.customer_id)); setFContract(String(r.contract_id))
    setContractOpts([{ id: r.contract_id, name: r.contract_label }])
    setFFactor(String(r.factor)); setFStart(r.start_date ?? today()); setFNoEnd(!r.end_date); setFEnd(r.end_date ?? ''); setFReason(r.reason ?? '')
    setOpen(true)
  }

  async function save() {
    const factor = Number(String(fFactor).replace(',', '.'))
    // Internamente guardamos como % de acréscimo: fator 1,5 → percent 50. Todo o SQL usa (1 + percent/100) = fator.
    const percent = Math.round((factor - 1) * 100 * 100) / 100
    if (!editing && !fContract) return toast.error('Selecione o contrato')
    if (!Number.isFinite(factor) || factor <= 1) return toast.error('Informe um multiplicador maior que 1 (ex.: 1,5, 2, 3)')
    if (!fStart) return toast.error('Informe a data de início')
    if (!fNoEnd && !fEnd) return toast.error('Informe a vigência (fim) ou marque "sem fim"')
    const payload: Record<string, unknown> = {
      percent, start_date: fStart, end_date: fNoEnd ? null : fEnd,
      reason: fReason.trim() || null, active: true,
    }
    setSaving(true)
    try {
      if (editing) await api.put(`/contract-hour-multipliers/${editing.id}`, payload)
      else await api.post('/contract-hour-multipliers', { ...payload, contract_id: Number(fContract) })
      toast.success(editing ? 'Regra atualizada' : 'Regra criada')
      setOpen(false); load()
    } catch (e) { toast.error(apiMessage(e, 'Erro ao salvar')) }
    finally { setSaving(false) }
  }

  async function remove(r: Rule) {
    if (!window.confirm(`Remover a regra de ${r.customer_name ?? 'cliente'} — ${r.contract_label}?`)) return
    try { await api.delete(`/contract-hour-multipliers/${r.id}`); toast.success('Regra removida'); load() }
    catch (e) { toast.error(apiMessage(e, 'Erro ao remover')) }
  }

  // Ativa/desativa sem apagar. Desativada → horas voltam ao real; reativada → volta a inflar.
  async function toggleActive(r: Rule) {
    try {
      await api.put(`/contract-hour-multipliers/${r.id}`, {
        percent: r.percent, start_date: r.start_date, end_date: r.end_date,
        reason: r.reason, active: !r.active,
      })
      toast.success(r.active ? 'Regra desativada' : 'Regra ativada')
      if (editing?.id === r.id) setOpen(false)
      load()
    } catch (e) { toast.error(apiMessage(e, 'Erro ao alterar status')) }
  }

  const factorNum = Number(String(fFactor).replace(',', '.'))
  const previewHours = factorNum > 1 ? (10 * factorNum).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') : null

  return (
    <AppLayout title="Multiplicador de Horas">
      <div className="space-y-4 max-w-6xl">
        {/* Explicação */}
        <div className="ds-card ds-card-pad" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Info size={15} style={{ color: 'var(--primary)', marginTop: 2, flexShrink: 0 }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)', margin: 0 }}>
            Aplica um <strong style={{ color: 'var(--text)' }}>multiplicador</strong> nas horas apontadas de um contrato,
            <strong style={{ color: 'var(--text)' }}> só do lado do cliente</strong> (fechamentos do cliente/contrato, faturamento e receita da rentabilidade).
            Ex.: ×1,5 → cada 10h vira 15h; ×2 → 10h vira 20h; ×3 → 30h. <strong style={{ color: 'var(--text)' }}>Nunca</strong> afeta o consultor/parceiro
            (apontamento, fechamento, pagamento) — as horas a mais têm custo zero. O cliente vê o total já multiplicado, sem o fator.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <h3 className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>Regras cadastradas <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{rules.length}</span></h3>
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
                        <button onClick={() => openEdit(r)} title="Editar" className="p-1.5 rounded-md hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)' }}><Pencil size={14} /></button>
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
        <Modal open onClose={() => setOpen(false)} size="md">
          <ModalHeader title={editing ? 'Editar regra' : 'Nova regra de multiplicação'} subtitle="Multiplicador de horas faturáveis ao cliente, por contrato" icon={Percent} onClose={() => setOpen(false)} />
          <ModalBody className="space-y-3">
            <div>
              <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Cliente</div>
              <SearchSelect value={fCustomer} onChange={setFCustomer} options={customers} placeholder="Selecione o cliente" fullWidth disabled={!!editing} />
            </div>
            <div>
              <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Contrato afetado</div>
              <SearchSelect value={fContract} onChange={setFContract} options={contractOpts} placeholder={fCustomer ? 'Selecione o contrato' : 'Escolha o cliente primeiro'} fullWidth disabled={!!editing || !fCustomer} />
              {editing && <div className="text-[11px] mt-1" style={{ color: 'var(--text-light)' }}>O contrato não muda na edição — crie uma nova regra para outro contrato.</div>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Multiplicador (×)</div>
                <input className="ds-input" type="number" min={1} step="0.1" value={fFactor} onChange={e => setFFactor(e.target.value)} placeholder="Ex.: 2" style={{ width: '100%' }} />
                <div className="text-[11px] mt-1" style={{ color: 'var(--text-light)' }}>{previewHours ? `Cada 10h vira ${previewHours}h` : 'Ex.: 1,5 · 2 · 3'}</div>
              </div>
              <div>
                <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Data de início</div>
                <input className="ds-input" type="date" value={fStart} onChange={e => setFStart(e.target.value)} style={{ width: '100%' }} />
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm mb-2" style={{ color: 'var(--text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={fNoEnd} onChange={e => setFNoEnd(e.target.checked)} /> Vigência sem fim (indefinida)
              </label>
              {!fNoEnd && (
                <>
                  <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Vigência até</div>
                  <input className="ds-input" type="date" value={fEnd} min={fStart} onChange={e => setFEnd(e.target.value)} style={{ width: '100%' }} />
                </>
              )}
            </div>
            <div>
              <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Motivo (opcional)</div>
              <input className="ds-input" value={fReason} onChange={e => setFReason(e.target.value)} placeholder="Ex.: markup comercial contrato X" maxLength={500} style={{ width: '100%' }} />
            </div>
          </ModalBody>
          <ModalFooter>
            {editing && (
              <button
                onClick={() => toggleActive(editing)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg"
                style={{ marginRight: 'auto', color: editing.active ? 'var(--warning)' : 'var(--success)', border: '1px solid var(--border)' }}
              >
                {editing.active ? <><Ban size={14} /> Desativar</> : <><CheckCircle size={14} /> Ativar</>}
              </button>
            )}
            <button className="ds-btn-secondary" onClick={() => setOpen(false)} disabled={saving}>Cancelar</button>
            <button className="ds-btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : (editing ? 'Salvar' : 'Criar regra')}</button>
          </ModalFooter>
        </Modal>
      )}
    </AppLayout>
  )
}
