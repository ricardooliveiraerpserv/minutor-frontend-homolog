'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, X, Clock, AlertTriangle, Check, UserPlus, FileDown } from 'lucide-react'
import { SearchSelect } from '@/components/ui/search-select'
import { useAuth } from '@/hooks/use-auth'

interface Stage { id: number; name: string; is_won: boolean; is_lost: boolean }
interface Pipeline { id: number; name: string; code: string; stages: Stage[] }
interface Opp {
  id: number; title: string; valor: number; status: string; stage_id: number
  customer?: { id: number; name: string } | null
  responsavel?: { id: number; name: string } | null
  sem_proxima_acao?: boolean; proxima_acao_at?: string | null
  contract_id?: number | null
}
interface Column { stage: Stage; opportunities: Opp[]; total_valor: number; count: number
  forecast?: number; tempo_medio_dias?: number; vencidos?: number; sem_proxima_acao?: number; parados?: number }
interface Customer { id: number; name: string; crm_status?: string }
interface Source { id: number; name: string; active?: boolean }
interface CrmUser { id: number; name: string }
interface Contact { id: number; name: string }

const fmtBRL = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function CrmPipelinePage() {
  const { user } = useAuth()
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [pipeId, setPipeId] = useState<number | null>(null)
  const [cols, setCols] = useState<Column[]>([])
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<Customer[]>([])

  const [newOpen, setNewOpen] = useState(false)
  const NF0 = { title: '', descricao: '', pipeline_id: '', customer_id: '', customer_contact_id: '', lead_source_id: '', responsavel_id: '', valor: '', previsao_fechamento: '', proxima_acao: '', proxima_acao_at: '' }
  const [nf, setNf] = useState(NF0)
  const [sources, setSources] = useState<Source[]>([])
  const [crmUsers, setCrmUsers] = useState<CrmUser[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const NL0 = { open: false, empresa: '', contato: '', email: '', telefone: '', lead_source_id: '' }
  const [novoLead, setNovoLead] = useState(NL0)
  const [lossReasons, setLossReasons] = useState<{ id: number; name: string }[]>([])
  const [lossModal, setLossModal] = useState<{ oppId: number; stageId: number } | null>(null)
  const [wonModal, setWonModal] = useState<{ oppId: number; valor: number | null } | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)

  useEffect(() => {
    api.get<{ data: Pipeline[] }>('/crm/pipelines').then(r => { setPipelines(r?.data ?? []); if (r?.data?.[0]) setPipeId(r.data[0].id) }).catch(() => toast.error('Erro ao carregar funis'))
    api.get<any>('/customers?pageSize=500').then(r => setCustomers((Array.isArray(r) ? r : r?.data ?? r?.items ?? []).map((c: any) => ({ id: c.id, name: c.name, crm_status: c.crm_status })).sort((a: Customer, b: Customer) => a.name.localeCompare(b.name)))).catch(() => {})
    api.get<{ data: Source[] }>('/crm/lead-sources').then(r => setSources((r?.data ?? []).filter(s => s.active !== false))).catch(() => {})
    api.get<{ data: CrmUser[] }>('/crm/users').then(r => setCrmUsers(r?.data ?? [])).catch(() => {})
    api.get<{ data: { id: number; name: string; active?: boolean }[] }>('/crm/loss-reasons').then(r => setLossReasons((r?.data ?? []).filter(x => x.active !== false))).catch(() => {})
    // "Converter em Oportunidade" vindo da ficha do Lead (já qualificado a prospect).
    const opp_for = new URLSearchParams(window.location.search).get('opp_for')
    if (opp_for) { setNf(f => ({ ...f, customer_id: opp_for })); loadContacts(opp_for); setNewOpen(true) }
  }, [])

  const loadContacts = (customerId: string) => {
    if (!customerId) { setContacts([]); return }
    api.get<any>(`/customer-contacts?customer_id=${customerId}`).then(r => setContacts((Array.isArray(r) ? r : r?.data ?? []).map((c: any) => ({ id: c.id, name: c.name })))).catch(() => setContacts([]))
  }
  const pickCustomer = (id: string) => { setNf(f => ({ ...f, customer_id: id, customer_contact_id: '' })); loadContacts(id) }

  // Cliente novo: cadastra o lead sem sair da tela e já o seleciona.
  const createLeadInline = async () => {
    if (!novoLead.empresa.trim()) { toast.error('Informe o nome da empresa'); return }
    try {
      const r = await api.post<{ data: { customer_id: number } }>('/crm/leads', {
        empresa: novoLead.empresa, contato: novoLead.contato || null, email: novoLead.email || null,
        telefone: novoLead.telefone || null, lead_source_id: novoLead.lead_source_id ? Number(novoLead.lead_source_id) : null,
      })
      const id = r.data.customer_id
      setCustomers(cs => [...cs, { id, name: novoLead.empresa, crm_status: 'lead' }].sort((a, b) => a.name.localeCompare(b.name)))
      pickCustomer(String(id))
      setNf(f => ({ ...f, lead_source_id: novoLead.lead_source_id || f.lead_source_id }))
      setNovoLead(NL0)
      toast.success('Lead cadastrado e selecionado')
    } catch { toast.error('Erro ao cadastrar lead') }
  }

  const loadBoard = useCallback(() => {
    if (!pipeId) return
    setLoading(true)
    api.get<{ data: { stages: Column[] } }>(`/crm/opportunities/kanban?pipeline_id=${pipeId}`)
      .then(r => setCols(r?.data?.stages ?? []))
      .catch(() => toast.error('Erro ao carregar o funil'))
      .finally(() => setLoading(false))
  }, [pipeId])
  useEffect(() => { loadBoard() }, [loadBoard])

  const createOpp = async () => {
    if (!nf.title.trim() || !nf.customer_id || !nf.pipeline_id || !nf.customer_contact_id || !nf.lead_source_id || !nf.responsavel_id || !nf.proxima_acao.trim() || !nf.proxima_acao_at) {
      toast.error('Preencha título, pipeline, empresa, contato, origem, responsável e a próxima ação'); return
    }
    try {
      await api.post('/crm/opportunities', {
        title: nf.title, pipeline_id: Number(nf.pipeline_id), customer_id: Number(nf.customer_id),
        customer_contact_id: Number(nf.customer_contact_id), lead_source_id: Number(nf.lead_source_id),
        responsavel_id: Number(nf.responsavel_id), valor: nf.valor ? Number(nf.valor) : 0,
        descricao: nf.descricao || null,
        previsao_fechamento: nf.previsao_fechamento || null,
        proxima_acao: nf.proxima_acao, proxima_acao_at: nf.proxima_acao_at,
      })
      toast.success('Oportunidade criada')
      try { if (nf.lead_source_id) localStorage.setItem('crm:last_origem', nf.lead_source_id) } catch {} // origem lembrada
      // Vai para a aba do pipeline escolhido para exibir a nova oportunidade.
      const destino = pipelines.find(p => p.id === Number(nf.pipeline_id))
      setNewOpen(false); setNf(NF0); setContacts([])
      if (destino && destino.id !== pipeId) setPipeId(destino.id); else loadBoard()
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao criar') }
  }

  // Abre o modal com defaults inteligentes (reduz atrito — Fase A/UX).
  const openNewOpp = () => {
    let origem = ''
    try { origem = localStorage.getItem('crm:last_origem') || '' } catch {}
    const euResponsavel = crmUsers.some(u => u.id === user?.id) ? String(user?.id) : ''
    const em2dias = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
    setNf({ ...NF0, responsavel_id: euResponsavel, lead_source_id: origem, proxima_acao: 'Primeiro contato', proxima_acao_at: em2dias })
    setContacts([]); setNovoLead(NL0); setNewOpen(true)
  }

  const moveStage = async (opp: Opp, stageId: number) => {
    const stage = pipelines.flatMap(p => p.stages).find(s => s.id === stageId)
    if (stage?.is_lost) { setLossModal({ oppId: opp.id, stageId }); return } // Item 2: motivo obrigatório
    try {
      await api.patch(`/crm/opportunities/${opp.id}/stage`, { stage_id: stageId })
      await loadBoard()
      // Ao marcar GANHO, já abre o modal de geração de contrato (só se ainda não convertida).
      if (stage?.is_won && !opp.contract_id) {
        setWonModal({ oppId: opp.id, valor: opp.valor ?? null })
      }
    }
    catch (e: any) { toast.error(e?.message ?? 'Erro ao mover') } // Item 4: mensagem de produto obrigatório
  }
  const confirmLoss = async (loss_reason_id: number) => {
    if (!lossModal) return
    try { await api.patch(`/crm/opportunities/${lossModal.oppId}/stage`, { stage_id: lossModal.stageId, loss_reason_id }); setLossModal(null); loadBoard() }
    catch (e: any) { toast.error(e?.message ?? 'Erro ao registrar perda') }
  }

  const pickPipeline = (pid: string) => { setNf(f => ({ ...f, pipeline_id: pid })) }

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  const pipe = pipelines.find(p => p.id === pipeId)
  const totalForecast = cols.filter(c => !c.stage.is_won && !c.stage.is_lost).reduce((s, c) => s + c.total_valor, 0)

  // Motor configurável: a empresa pode ser qualquer (lead/prospect/cliente); pipeline define o funil.
  const empresaOptions = customers

  return (
    <AppLayout title="Pipeline (CRM)">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          {pipelines.map(p => (
            <button key={p.id} onClick={() => setPipeId(p.id)} className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
              style={pipeId === p.id ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{p.name}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Forecast aberto: <b style={{ color: 'var(--text)' }}>{fmtBRL(totalForecast)}</b></span>
          <button onClick={openNewOpp} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Nova oportunidade</button>
        </div>
      </div>

      {loading ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</p> : (
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
          {cols.map(col => (
            <div key={col.stage.id} className="shrink-0 w-72 rounded-xl flex flex-col" style={{ background: 'var(--brand-bg)', border: '1px solid var(--border)' }}>
              <div className="px-3 py-2.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: col.stage.is_won ? 'var(--success-border)' : col.stage.is_lost ? 'var(--danger)' : 'var(--text-muted)' }}>{col.stage.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>{col.count}</span>
              </div>
              {/* Indicadores da etapa (Fase 4) */}
              <div className="px-3 py-1 text-[10px] space-y-0.5" style={{ borderBottom: '1px solid var(--border)' }}>
                {col.total_valor > 0 && <div className="flex justify-between tabular-nums" style={{ color: 'var(--text-light)' }}><span>{fmtBRL(col.total_valor)}</span><span title="forecast">fc {fmtBRL(col.forecast ?? 0)}</span></div>}
                <div className="flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-light)' }}>
                  {!!col.tempo_medio_dias && <span title="tempo médio na etapa">⏱ {col.tempo_medio_dias}d</span>}
                  {!!col.vencidos && <span style={{ color: 'var(--danger-border)' }} title="vencidos (SLA)">⚠ {col.vencidos} venc.</span>}
                  {!!col.sem_proxima_acao && <span style={{ color: 'var(--warning-border)' }} title="sem próxima ação">◷ {col.sem_proxima_acao}</span>}
                  {!!col.parados && <span style={{ color: 'var(--warning-border)' }} title="parados (sem interação 7d+)">⏸ {col.parados}</span>}
                </div>
              </div>
              <div className="p-2 space-y-2 overflow-y-auto flex-1">
                {col.opportunities.map(o => (
                  <div key={o.id} onClick={() => setDetailId(o.id)} className="rounded-lg p-2.5 cursor-pointer hover:opacity-90" style={{ background: 'var(--brand-surface)', border: '1px solid var(--border)' }}>
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-sm font-semibold leading-tight" style={{ color: 'var(--text)' }}>{o.title}</span>
                      {o.sem_proxima_acao && <AlertTriangle size={13} style={{ color: 'var(--warning-border)' }} aria-label="Sem próxima ação" />}
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{o.customer?.name ?? '—'}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{fmtBRL(o.valor)}</span>
                      {o.responsavel && <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>👤 {o.responsavel.name.split(' ')[0]}</span>}
                    </div>
                    {!col.stage.is_won && !col.stage.is_lost && (
                      <select value="" onClick={e => e.stopPropagation()} onChange={e => { if (e.target.value) moveStage(o, Number(e.target.value)) }}
                        className="w-full mt-2 text-[10px] rounded px-1.5 py-1 outline-none" style={inputStyle}>
                        <option value="">Mover para…</option>
                        {pipe?.stages.filter(s => s.id !== o.stage_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    )}
                  </div>
                ))}
                {col.opportunities.length === 0 && <p className="text-[11px] text-center py-3" style={{ color: 'var(--text-light)' }}>—</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setNewOpen(false)}>
          <div className="w-full max-w-md rounded-2xl p-5" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Nova oportunidade</h2><button onClick={() => setNewOpen(false)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Pipeline *</label>
                <select value={nf.pipeline_id} onChange={e => pickPipeline(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                  <option value="">Selecione o pipeline…</option>
                  {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>A oportunidade nasce na etapa inicial do pipeline.</p></div>
              <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Título *</label><input value={nf.title} onChange={e => setNf(f => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
              <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Descrição da oportunidade</label><textarea rows={2} value={nf.descricao} onChange={e => setNf(f => ({ ...f, descricao: e.target.value }))} placeholder="O que o cliente pretende adquirir (opcional na criação, obrigatória antes da proposta)" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Empresa (Lead / Prospect / Cliente) *</label>
                <SearchSelect value={nf.customer_id} onChange={pickCustomer} fullWidth placeholder="Buscar empresa…"
                  options={empresaOptions.map(c => ({ id: c.id, name: c.crm_status ? `${c.name} · ${c.crm_status}` : c.name }))} />
                <>
                  <button type="button" onClick={() => setNovoLead(n => ({ ...NL0, open: !n.open }))} className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--primary)' }}>
                    <UserPlus size={12} /> Empresa nova? Cadastrar sem sair
                  </button>
                  {novoLead.open && <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Vira <b>Prospect</b> automaticamente ao criar a oportunidade.</p>}
                </>
                {novoLead.open && (
                  <div className="mt-2 p-3 rounded-lg space-y-2" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                    <input value={novoLead.empresa} onChange={e => setNovoLead(n => ({ ...n, empresa: e.target.value }))} placeholder="Empresa *" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={novoLead.contato} onChange={e => setNovoLead(n => ({ ...n, contato: e.target.value }))} placeholder="Contato" className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                      <input value={novoLead.telefone} onChange={e => setNovoLead(n => ({ ...n, telefone: e.target.value }))} placeholder="Telefone" className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                      <input value={novoLead.email} onChange={e => setNovoLead(n => ({ ...n, email: e.target.value }))} placeholder="E-mail" className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                      <select value={novoLead.lead_source_id} onChange={e => setNovoLead(n => ({ ...n, lead_source_id: e.target.value }))} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                        <option value="">Origem…</option>{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setNovoLead(NL0)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
                      <button type="button" onClick={createLeadInline} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Incluir lead</button>
                    </div>
                  </div>
                )}
              </div>
              <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Contato principal *</label>
                <select value={nf.customer_contact_id} onChange={e => setNf(f => ({ ...f, customer_contact_id: e.target.value }))} disabled={!nf.customer_id} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                  <option value="">{!nf.customer_id ? 'Selecione a empresa primeiro' : contacts.length ? 'Selecione…' : 'Empresa sem contatos — cadastre em Contatos'}</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Origem *</label>
                  <select value={nf.lead_source_id} onChange={e => setNf(f => ({ ...f, lead_source_id: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                    <option value="">Selecione…</option>{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select></div>
                <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Responsável comercial *</label>
                  <select value={nf.responsavel_id} onChange={e => setNf(f => ({ ...f, responsavel_id: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                    <option value="">Selecione…</option>{crmUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Valor (R$)</label><input type="number" value={nf.valor} onChange={e => setNf(f => ({ ...f, valor: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
                <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Previsão fechamento</label><input type="date" value={nf.previsao_fechamento} onChange={e => setNf(f => ({ ...f, previsao_fechamento: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Próxima ação *</label><input value={nf.proxima_acao} onChange={e => setNf(f => ({ ...f, proxima_acao: e.target.value }))} placeholder="Ex.: Ligar para alinhar escopo" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
                <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Data da próxima ação *</label><input type="date" value={nf.proxima_acao_at} onChange={e => setNf(f => ({ ...f, proxima_acao_at: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5"><button onClick={() => setNewOpen(false)} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button><button onClick={createOpp} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Criar</button></div>
          </div>
        </div>
      )}

      {lossModal && (
        <LossModal reasons={lossReasons} onCancel={() => setLossModal(null)} onConfirm={confirmLoss} />
      )}

      {wonModal && (
        <ContractModal oppId={wonModal.oppId} defaultValor={wonModal.valor}
          onClose={() => setWonModal(null)} onDone={() => { setWonModal(null); loadBoard() }} />
      )}

      {detailId && <OppDetail id={detailId} onClose={() => { setDetailId(null); loadBoard() }} />}
    </AppLayout>
  )
}

// ── Modal de motivo da perda (Item 2 — obrigatório) ──
function LossModal({ reasons, onCancel, onConfirm }: { reasons: { id: number; name: string }[]; onCancel: () => void; onConfirm: (id: number) => void }) {
  const [reasonId, setReasonId] = useState('')
  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Marcar como perdida</h2><button onClick={onCancel} style={{ color: 'var(--text-muted)' }}><X size={18} /></button></div>
        <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Motivo da perda *</label>
        <select value={reasonId} onChange={e => setReasonId(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
          <option value="">Selecione…</option>{reasons.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
          <button onClick={() => reasonId ? onConfirm(Number(reasonId)) : toast.error('Selecione o motivo')} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--danger)', color: '#fff' }}>Confirmar perda</button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de geração de contrato (reutilizado: botão do drawer + ao marcar Ganho no board) ──
function ContractModal({ oppId, defaultValor, onClose, onDone }: { oppId: number; defaultValor?: number | null; onClose: () => void; onDone: () => void }) {
  const [ctypes, setCtypes] = useState<{ id: number; name: string }[]>([])
  const [cf, setCf] = useState({ categoria: 'projeto', contract_type_id: '', tipo_faturamento: '', horas_contratadas: '', valor_projeto: defaultValor != null ? String(defaultValor) : '' })
  const [saving, setSaving] = useState(false)
  useEffect(() => { api.get<any>('/contract-types').then(r => setCtypes((Array.isArray(r) ? r : r?.data ?? []).map((c: any) => ({ id: c.id, name: c.name })))).catch(() => {}) }, [])
  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  const doConvert = async () => {
    setSaving(true)
    try {
      const r = await api.post<{ message: string }>(`/crm/opportunities/${oppId}/convert`, {
        categoria: cf.categoria,
        contract_type_id: cf.contract_type_id ? Number(cf.contract_type_id) : null,
        tipo_faturamento: cf.tipo_faturamento || null,
        horas_contratadas: cf.horas_contratadas ? Number(cf.horas_contratadas) : 0,
        valor_projeto: cf.valor_projeto ? Number(cf.valor_projeto) : null,
      })
      toast.success(r?.message ?? 'Convertido em contrato')
      onDone()
    } catch (e: any) { toast.error(e?.data?.message ?? 'Erro ao converter') }
    finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-5" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Gerar contrato (oportunidade ganha)</h2><button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button></div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Categoria</label>
              <select value={cf.categoria} onChange={e => setCf(f => ({ ...f, categoria: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                <option value="projeto">Projeto</option><option value="sustentacao">Sustentação</option>
              </select></div>
            <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Tipo de contrato</label>
              <select value={cf.contract_type_id} onChange={e => setCf(f => ({ ...f, contract_type_id: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                <option value="">—</option>{ctypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Faturamento</label>
              <select value={cf.tipo_faturamento} onChange={e => setCf(f => ({ ...f, tipo_faturamento: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                <option value="">—</option><option value="on_demand">On Demand</option><option value="banco_horas_fixo">Banco de Horas Fixo</option><option value="banco_horas_mensal">Banco de Horas Mensal</option><option value="por_servico">Por Serviço</option><option value="saas">SaaS</option>
              </select></div>
            <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Horas contratadas</label><input type="number" value={cf.horas_contratadas} onChange={e => setCf(f => ({ ...f, horas_contratadas: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
          </div>
          <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Valor do projeto (R$)</label><input type="number" value={cf.valor_projeto} onChange={e => setCf(f => ({ ...f, valor_projeto: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
          <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>O contrato nasce em "Novo Contrato"; o projeto é gerado depois no Kanban de Contratos.</p>
        </div>
        <div className="flex justify-end gap-2 mt-5"><button onClick={onClose} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Agora não</button><button onClick={doConvert} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60" style={{ background: 'var(--success)', color: '#fff' }}>{saving ? 'Gerando…' : 'Gerar contrato'}</button></div>
      </div>
    </div>
  )
}

// ── Drawer de detalhe da oportunidade: info + Próxima Ação (tarefas) + timeline ──
interface OppFull extends Opp { pipeline?: { name: string }; stage?: Stage; notas?: string | null; descricao?: string | null; proxima_acao?: string | null; previsao_fechamento?: string | null; ultima_interacao_at?: string | null
  contract_id?: number | null
  products?: { id: number; name: string; categoria: string | null; pivot: { quantidade: number | string; valor: number | string } }[]
  tasks?: { id: number; tipo: string; titulo: string | null; data: string | null; prioridade: string; concluida_at: string | null; responsavel?: { name: string } | null }[]
  events?: { id: number; event_type: string; from_value: string | null; to_value: string | null; created_at: string; triggered_by?: { name: string } | null }[] }

interface CatalogProduct { id: number; name: string; categoria: string | null; valor: number | string }

interface Proposal { id: number; numero: number; versao: number; valor: number; descontos: number; total: number; status: string; tipo?: string | null; codigo?: string | null; data_validade: string | null; vendedor?: { name: string } | null }

const PROPOSTA_TIPOS = [
  { v: 'bh_fixo', label: 'Banco de Horas Fixo', short: 'BH Fixo' },
  { v: 'bh_mensal', label: 'Banco de Horas Mensal', short: 'BH Mensal' },
  { v: 'on_demand', label: 'Consultoria Sob Demanda', short: 'Sob Demanda' },
  { v: 'projeto_fechado', label: 'Projeto Fechado', short: 'Projeto Fechado' },
] as const
const PROPOSTA_STATUS = ['em_elaboracao', 'enviada', 'em_negociacao', 'aprovada', 'reprovada', 'cancelada', 'expirada', 'reativada', 'convertida'] as const
const tipoShort = (t?: string | null) => PROPOSTA_TIPOS.find(x => x.v === t)?.short ?? t ?? '—'

function ProposalModal({ oppId, onClose, onDone }: { oppId: number; onClose: () => void; onDone: (newId?: number) => void }) {
  const [tipo, setTipo] = useState<string>('bh_fixo')
  const [f, setF] = useState({ horas_consultoria: '', valor_hora_cliente: '', duracao_meses: '12', valor_projeto: '', parcelas: '1', escopo_texto: '', data_validade: '', custo_h_consultoria: '', custo_h_coordenacao: '' })
  const [adv, setAdv] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))
  const isHoras = tipo === 'bh_fixo' || tipo === 'bh_mensal'
  const isOnDemand = tipo === 'on_demand'
  const isProjeto = tipo === 'projeto_fechado'
  const horasLabel = tipo === 'bh_mensal' ? 'Horas mensais' : 'Horas de consultoria'
  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  const num = (x: string) => x === '' ? undefined : Number(x)

  // prévia do total (visão cliente): horas × valor/hora, ou valor do projeto
  const previewTotal = isProjeto ? (num(f.valor_projeto) ?? 0)
    : isOnDemand ? (num(f.valor_hora_cliente) ?? 0)
    : (num(f.horas_consultoria) ?? 0) * (num(f.valor_hora_cliente) ?? 0)

  const submit = async () => {
    const inputs: Record<string, unknown> = {}
    if (isHoras) {
      inputs.horas_consultoria = num(f.horas_consultoria) ?? 0
      inputs.valor_hora_cliente = num(f.valor_hora_cliente) ?? 0
      inputs.venda_h = num(f.valor_hora_cliente) ?? 0
      inputs.duracao_meses = num(f.duracao_meses) ?? 12
    } else if (isOnDemand) {
      inputs.valor_hora_cliente = num(f.valor_hora_cliente) ?? 0
      inputs.venda_h = num(f.valor_hora_cliente) ?? 0
      if (f.horas_consultoria) inputs.horas_consultoria = Number(f.horas_consultoria)
    } else if (isProjeto) {
      const vp = num(f.valor_projeto) ?? 0
      inputs.valor_projeto = vp
      inputs.faturamento_fixo = vp
      inputs.parcelas = num(f.parcelas) ?? 1
      if (f.escopo_texto) inputs.escopo_texto = f.escopo_texto
      if (f.duracao_meses) inputs.duracao_meses = Number(f.duracao_meses)
    }
    if (f.custo_h_consultoria) inputs.custo_h_consultoria = Number(f.custo_h_consultoria)
    if (f.custo_h_coordenacao) inputs.custo_h_coordenacao = Number(f.custo_h_coordenacao)
    setSaving(true)
    try {
      const r = await api.post<{ data: { id: number } }>('/crm/proposals', { opportunity_id: oppId, tipo, modo_faturamento: isProjeto ? 'valor_fixo' : 'por_hora', inputs, data_validade: f.data_validade || null })
      toast.success('Proposta criada'); onDone(r?.data?.id)
    } catch { toast.error('Erro ao criar proposta') } finally { setSaving(false) }
  }

  const fieldCls = 'w-full text-sm rounded-lg px-2.5 py-1.5 outline-none'
  const lblCls = 'text-[11px] font-semibold block mb-0.5'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-xl p-5" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Nova proposta</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Tipo / template</span>
            <select value={tipo} onChange={e => setTipo(e.target.value)} className={fieldCls} style={inputStyle}>
              {PROPOSTA_TIPOS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </div>

          {(isHoras || isOnDemand) && (
            <div className="grid grid-cols-2 gap-2">
              {(isHoras || isOnDemand) && (
                <div className={isOnDemand ? 'col-span-1' : ''}>
                  <span className={lblCls} style={{ color: 'var(--text-muted)' }}>{horasLabel}{isOnDemand && ' (opcional)'}</span>
                  <input type="number" min={0} value={f.horas_consultoria} onChange={e => set('horas_consultoria', e.target.value)} className={fieldCls} style={inputStyle} />
                </div>
              )}
              <div>
                <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Valor/hora (cliente)</span>
                <input type="number" min={0} step="0.01" value={f.valor_hora_cliente} onChange={e => set('valor_hora_cliente', e.target.value)} className={fieldCls} style={inputStyle} />
              </div>
              {isHoras && (
                <div>
                  <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Duração (meses)</span>
                  <input type="number" min={1} value={f.duracao_meses} onChange={e => set('duracao_meses', e.target.value)} className={fieldCls} style={inputStyle} />
                </div>
              )}
            </div>
          )}

          {isProjeto && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Valor do projeto</span>
                  <input type="number" min={0} step="0.01" value={f.valor_projeto} onChange={e => set('valor_projeto', e.target.value)} className={fieldCls} style={inputStyle} />
                </div>
                <div>
                  <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Parcelas</span>
                  <input type="number" min={1} value={f.parcelas} onChange={e => set('parcelas', e.target.value)} className={fieldCls} style={inputStyle} />
                </div>
              </div>
              <div>
                <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Escopo (objetivo do projeto)</span>
                <textarea rows={2} value={f.escopo_texto} onChange={e => set('escopo_texto', e.target.value)} placeholder="Ex.: Atualização de release 12.1.2310 para a 12.1.2410" className={fieldCls} style={inputStyle} />
              </div>
            </>
          )}

          <div>
            <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Validade</span>
            <input type="date" value={f.data_validade} onChange={e => set('data_validade', e.target.value)} className={fieldCls} style={inputStyle} />
          </div>

          {/* memória de cálculo (custos p/ margem) — opcional */}
          <div>
            <button type="button" onClick={() => setAdv(a => !a)} className="text-[11px] font-semibold" style={{ color: 'var(--primary)' }}>
              {adv ? '− ' : '+ '}Memória de cálculo (custos / margem)
            </button>
            {adv && (
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                <div>
                  <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Custo/hora consultoria</span>
                  <input type="number" min={0} step="0.01" value={f.custo_h_consultoria} onChange={e => set('custo_h_consultoria', e.target.value)} className={fieldCls} style={inputStyle} />
                </div>
                <div>
                  <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Custo/hora coordenação</span>
                  <input type="number" min={0} step="0.01" value={f.custo_h_coordenacao} onChange={e => set('custo_h_coordenacao', e.target.value)} className={fieldCls} style={inputStyle} />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-1 text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Total (cliente)</span>
            <span className="font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{fmtBRL(previewTotal)}</span>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>Cancelar</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2 rounded-lg text-sm font-bold disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saving ? 'Criando…' : 'Criar proposta'}</button>
        </div>
      </div>
    </div>
  )
}

function OppDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const router = useRouter()
  const [o, setO] = useState<OppFull | null>(null)
  const [nt, setNt] = useState({ tipo: '', titulo: '', data: '', prox_tipo: '', prox_data: '' })
  const [contactTypes, setContactTypes] = useState<{ id: number; nome: string; slug: string }[]>([])
  useEffect(() => { api.get<{ data: { id: number; nome: string; slug: string }[] }>('/crm/contact-types').then(r => { const ct = r?.data ?? []; setContactTypes(ct); setNt(f => f.tipo ? f : { ...f, tipo: ct[0]?.slug ?? '' }) }).catch(() => {}) }, [])
  const tipoNome = (slug: string) => contactTypes.find(x => x.slug === slug)?.nome ?? slug
  const [proposals, setProposals] = useState<Proposal[]>([])
  const load = useCallback(() => { api.get<{ data: OppFull }>(`/crm/opportunities/${id}`).then(r => setO(r?.data ?? null)).catch(() => {}) }, [id])
  const loadProps = useCallback(() => { api.get<{ data: Proposal[] }>(`/crm/proposals?opportunity_id=${id}`).then(r => setProposals(r?.data ?? [])).catch(() => {}) }, [id])
  useEffect(() => { load(); loadProps() }, [load, loadProps])
  const setPropStatus = async (p: Proposal, status: string) => { try { await api.put(`/crm/proposals/${p.id}`, { status }); loadProps() } catch { toast.error('Erro') } }
  const [novaLoad, setNovaLoad] = useState(false)
  const novaProposta = async () => {
    setNovaLoad(true)
    try {
      const r = await api.post<{ data: { id: number } }>('/crm/proposals', { opportunity_id: id, tipo: novoTipo, modo_faturamento: novoTipo === 'projeto_fechado' ? 'valor_fixo' : 'por_hora' })
      if (r?.data?.id) router.push(`/crm/propostas/${r.data.id}`)
    } catch (e: any) { toast.error(e?.message || 'Erro ao criar proposta'); setNovaLoad(false) }
  }
  const [genId, setGenId] = useState<number | null>(null)
  const gerarPdf = async (p: Proposal) => {
    if (!p.codigo) { toast.error('Recrie a proposta pelo fluxo novo (com tipo) para gerar o PDF'); return }
    setGenId(p.id)
    try {
      const r = await api.post<{ data: { document_id: number } }>(`/crm/proposals/${p.id}/gerar`, {})
      const docId = r?.data?.document_id
      if (docId) window.open(`/api/v1/documents/${docId}/download`, '_blank')
      toast.success('PDF gerado'); loadProps()
    } catch { toast.error('Erro ao gerar PDF') } finally { setGenId(null) }
  }

  // Abas do card + tipo da nova proposta
  const [tab, setTab] = useState<'resumo' | 'timeline' | 'followups' | 'propostas' | 'anexos'>('resumo')
  const [novoTipo, setNovoTipo] = useState('bh_fixo')

  // Descrição da oportunidade (o que o cliente pretende adquirir) — obrigatória antes da proposta
  const [descr, setDescr] = useState('')
  const [descrSaving, setDescrSaving] = useState(false)
  useEffect(() => { setDescr(o?.descricao ?? '') }, [o?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const saveDescr = async () => {
    setDescrSaving(true)
    try { await api.put(`/crm/opportunities/${id}`, { descricao: descr }); toast.success('Descrição salva'); load() }
    catch { toast.error('Erro ao salvar descrição') } finally { setDescrSaving(false) }
  }

  // Anexos da oportunidade
  const [atts, setAtts] = useState<{ id: number; original_name?: string; file_name?: string; mime_type?: string }[]>([])
  const attFileRef = useRef<HTMLInputElement>(null)
  const loadAtts = useCallback(() => { api.get<{ data: any[] }>(`/crm/opportunities/${id}/attachments`).then(r => setAtts(r?.data ?? [])).catch(() => {}) }, [id])
  useEffect(() => { loadAtts() }, [loadAtts])
  const uploadAtt = async (file: File) => {
    const fd = new FormData(); fd.append('file', file)
    try { await api.post(`/crm/opportunities/${id}/attachments`, fd); toast.success('Anexo enviado'); loadAtts() }
    catch { toast.error('Erro ao enviar anexo') }
  }
  const delAtt = async (attId: number) => { try { await api.delete(`/crm/opportunities/${id}/attachments/${attId}`); loadAtts() } catch { toast.error('Erro') } }

  // Conversão comercial → contrato (modal reutilizável ContractModal)
  const [convOpen, setConvOpen] = useState(false)

  const addTask = async () => {
    if (!nt.tipo) { toast.error('Selecione o tipo de contato'); return }
    try {
      // follow-up registrado = contato JÁ FEITO → entra como concluído
      const r = await api.post<{ data: { id: number } }>('/crm/tasks', { opportunity_id: id, tipo: nt.tipo, titulo: nt.titulo || null, data: nt.data || new Date().toISOString() })
      if (r?.data?.id) await api.patch(`/crm/tasks/${r.data.id}/complete`, { done: true })
      // agenda o próximo contato (tarefa aberta → vira a próxima ação; fica "atrasado" se vencer)
      if (nt.prox_tipo && nt.prox_data) await api.post('/crm/tasks', { opportunity_id: id, tipo: nt.prox_tipo, data: nt.prox_data })
      setNt({ tipo: contactTypes[0]?.slug ?? '', titulo: '', data: '', prox_tipo: '', prox_data: '' }); load()
    } catch { toast.error('Erro ao registrar follow-up') }
  }
  const complete = async (taskId: number) => { try { await api.patch(`/crm/tasks/${taskId}/complete`, { done: true }); load() } catch { toast.error('Erro') } }

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  const fmtDt = (s?: string | null) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-md h-full overflow-y-auto p-5" style={{ background: 'var(--brand-surface)', borderLeft: '1px solid var(--brand-border)' }} onClick={e => e.stopPropagation()}>
        {!o ? <p style={{ color: 'var(--text-light)' }}>Carregando…</p> : (<>
          <div className="flex items-start justify-between mb-1">
            <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{o.title}</h2>
            <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{o.customer?.name}</p>
          <div className="flex items-center gap-2 mt-2 mb-4 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{o.stage?.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{o.status}</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{fmtBRL(o.valor)}</span>
          </div>

          {/* Abas do card */}
          <div className="flex gap-1 mb-4 text-xs font-semibold flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
            {([['resumo', 'Resumo'], ['propostas', 'Propostas'], ['followups', 'Follow-ups'], ['anexos', 'Anexos'], ['timeline', 'Timeline']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className="px-2.5 py-1.5 -mb-px" style={{ color: tab === k ? 'var(--primary)' : 'var(--text-muted)', borderBottom: tab === k ? '2px solid var(--primary)' : '2px solid transparent' }}>{l}</button>
            ))}
          </div>

          {/* RESUMO */}
          {tab === 'resumo' && (<>
            {o.contract_id ? (
              <div className="mb-4 text-xs rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: 'var(--success-bg)', color: 'var(--success-border)', border: '1px solid var(--success-border)' }}>
                <Check size={14} /> Convertida em contrato <b>#{o.contract_id}</b> — gere o projeto no Kanban de Contratos.
              </div>
            ) : o.status === 'ganho' ? (
              <button onClick={() => setConvOpen(true)} className="mb-4 w-full py-2 rounded-lg text-sm font-bold" style={{ background: 'var(--success)', color: '#fff' }}>Gerar contrato →</button>
            ) : null}
            {convOpen && <ContractModal oppId={id} defaultValor={o.valor} onClose={() => setConvOpen(false)} onDone={() => { setConvOpen(false); load() }} />}

            <div className="mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-light)' }}>Descrição da oportunidade</h3>
              <textarea rows={3} value={descr} onChange={e => setDescr(e.target.value)} placeholder="O que o cliente pretende adquirir (ex.: Implantação SmartView, Banco de Horas adicional, Upgrade de Release)…" className="w-full text-xs rounded-lg px-2.5 py-2 outline-none" style={inputStyle} />
              <button onClick={saveDescr} disabled={descrSaving} className="mt-1.5 px-3 py-1 rounded-lg text-xs font-semibold disabled:opacity-60" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}>{descrSaving ? 'Salvando…' : 'Salvar descrição'}</button>
              {!descr.trim() && <p className="text-[10px] mt-1" style={{ color: 'var(--warning-border)' }}>Obrigatória antes de criar a proposta.</p>}
            </div>

            <div className="text-xs space-y-1 rounded-lg px-3 py-2" style={{ background: 'var(--brand-bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <div className="flex justify-between"><span>Valor</span><b style={{ color: 'var(--primary)' }}>{fmtBRL(o.valor)}</b></div>
              <div className="flex justify-between"><span>Previsão de fechamento</span><span style={{ color: 'var(--text)' }}>{o.previsao_fechamento ? new Date(o.previsao_fechamento).toLocaleDateString('pt-BR') : '—'}</span></div>
              <div className="flex justify-between"><span>Próxima ação</span><span style={{ color: 'var(--text)' }}>{o.proxima_acao || '—'}{o.proxima_acao_at ? ` · ${fmtDt(o.proxima_acao_at)}` : ''}</span></div>
            </div>
          </>)}

          {/* PROPOSTAS */}
          {tab === 'propostas' && (<div>
            <div className="space-y-1.5 mb-2">
              {proposals.map(p => (
                <div key={p.id} className="flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 cursor-pointer ds-row-hover" style={{ background: 'var(--brand-bg)', border: '1px solid var(--border)' }} onClick={() => router.push(`/crm/propostas/${p.id}`)} title="Abrir editor">
                  <span className="font-semibold whitespace-nowrap" style={{ color: 'var(--text)' }}>{p.codigo ? p.codigo : `#${p.numero}`}<span style={{ color: 'var(--text-light)' }}>.{p.versao}</span></span>
                  {p.tipo && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{tipoShort(p.tipo)}</span>}
                  <span className="flex-1 tabular-nums text-right" style={{ color: 'var(--text-muted)' }}>{fmtBRL(p.total)}{Number(p.descontos) > 0 && <span style={{ color: 'var(--text-light)' }}> (desc. {fmtBRL(p.descontos)})</span>}</span>
                  <select value={p.status} onClick={e => e.stopPropagation()} onChange={e => setPropStatus(p, e.target.value)} className="text-[10px] rounded px-1 py-0.5 outline-none" style={inputStyle}>
                    {PROPOSTA_STATUS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                  <button onClick={e => { e.stopPropagation(); gerarPdf(p) }} disabled={genId === p.id || !p.codigo} title="Gerar / baixar PDF" className="disabled:opacity-40" style={{ color: 'var(--primary)' }}>
                    {genId === p.id ? <Clock size={13} className="animate-spin" /> : <FileDown size={13} />}
                  </button>
                </div>
              ))}
              {proposals.length === 0 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem propostas ainda.</p>}
            </div>
            <div className="flex gap-1.5">
              <select value={novoTipo} onChange={e => setNovoTipo(e.target.value)} className="flex-1 text-xs rounded-lg px-2 py-1.5 outline-none" style={inputStyle}>
                {PROPOSTA_TIPOS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select>
              <button onClick={novaProposta} disabled={novaLoad} className="px-3 rounded-lg text-xs font-semibold disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{novaLoad ? '…' : '+ Nova proposta'}</button>
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>A precificação (horas, valor, margem) fica dentro da proposta. Exige Descrição preenchida.</p>
          </div>)}

          {/* FOLLOW-UPS */}
          {tab === 'followups' && (<div>
            <div className="space-y-1.5 mb-3">
              {(o.tasks ?? []).map(t => {
                const atrasado = !t.concluida_at && !!t.data && new Date(t.data) < new Date()
                return (
                <div key={t.id} className="flex items-start gap-2 text-xs rounded-lg px-2 py-1.5" style={{ background: 'var(--brand-bg)', border: '1px solid var(--border)' }}>
                  <button onClick={() => complete(t.id)} disabled={!!t.concluida_at} className="shrink-0 mt-0.5" title={t.concluida_at ? 'Concluído' : 'Marcar como concluído'} style={{ color: t.concluida_at ? 'var(--success-border)' : 'var(--text-light)' }}><Check size={14} /></button>
                  <span className="flex-1" style={{ color: 'var(--text)', textDecoration: t.concluida_at ? 'line-through' : 'none' }}>
                    <b>{tipoNome(t.tipo)}</b>
                    {t.concluida_at
                      ? <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold ml-1.5" style={{ background: 'var(--success-bg)', color: 'var(--success-border)' }}>concluído</span>
                      : atrasado
                        ? <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold ml-1.5" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>atrasado</span>
                        : <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold ml-1.5" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>agendado</span>}
                    {t.titulo ? <><br /><span style={{ color: 'var(--text-muted)' }}>{t.titulo}</span></> : ''}
                  </span>
                  <span className="shrink-0" style={{ color: atrasado ? 'var(--danger)' : 'var(--text-light)' }}>{fmtDt(t.data)}</span>
                </div>
              ) })}
              {(o.tasks ?? []).length === 0 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem follow-ups. Registre abaixo.</p>}
            </div>

            <div className="rounded-lg px-3 py-2.5 space-y-2" style={{ border: '1px solid var(--border)' }}>
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Registrar follow-up</span>
              <div className="flex gap-1.5">
                <select value={nt.tipo} onChange={e => setNt(f => ({ ...f, tipo: e.target.value }))} className="text-xs rounded-lg px-2 py-1.5 outline-none" style={inputStyle}>
                  {contactTypes.map(t => <option key={t.slug} value={t.slug}>{t.nome}</option>)}
                </select>
                <input type="datetime-local" value={nt.data} onChange={e => setNt(f => ({ ...f, data: e.target.value }))} title="Data do contato" className="flex-1 text-xs rounded-lg px-2 py-1.5 outline-none" style={inputStyle} />
              </div>
              <textarea rows={3} value={nt.titulo} onChange={e => setNt(f => ({ ...f, titulo: e.target.value }))} placeholder="O que foi tratado / combinado…" className="w-full text-xs rounded-lg px-2.5 py-2 outline-none" style={inputStyle} />

              <div className="rounded-lg px-2.5 py-2" style={{ background: 'var(--surface-sunken)' }}>
                <span className="text-[10px] font-semibold flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><Clock size={11} /> Agendar próximo contato (opcional)</span>
                <div className="flex gap-1.5 mt-1.5">
                  <select value={nt.prox_tipo} onChange={e => setNt(f => ({ ...f, prox_tipo: e.target.value }))} className="text-xs rounded-lg px-2 py-1.5 outline-none" style={inputStyle}>
                    <option value="">Tipo…</option>
                    {contactTypes.map(t => <option key={t.slug} value={t.slug}>{t.nome}</option>)}
                  </select>
                  <input type="datetime-local" value={nt.prox_data} onChange={e => setNt(f => ({ ...f, prox_data: e.target.value }))} className="flex-1 text-xs rounded-lg px-2 py-1.5 outline-none" style={inputStyle} />
                </div>
              </div>

              <button onClick={addTask} className="w-full py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Registrar follow-up</button>
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-light)' }}>Follow-up = relacionamento comercial (alimenta Timeline, Saúde da Conta e Carteira). O próximo contato vira a próxima ação.</p>
          </div>)}

          {/* ANEXOS */}
          {tab === 'anexos' && (<div>
            <input ref={attFileRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadAtt(f); e.target.value = '' }} />
            <button onClick={() => attFileRef.current?.click()} className="w-full py-1.5 rounded-lg text-xs font-semibold mb-2" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>+ Enviar anexo</button>
            <div className="space-y-1.5">
              {atts.map(a => (
                <div key={a.id} className="flex items-center gap-2 text-xs rounded-lg px-2 py-1.5" style={{ background: 'var(--brand-bg)', border: '1px solid var(--border)' }}>
                  <a href={`/api/v1/crm/opportunities/${id}/attachments/${a.id}/download`} target="_blank" rel="noreferrer" className="flex-1 truncate" style={{ color: 'var(--text)' }}>{a.original_name ?? a.file_name ?? 'arquivo'}</a>
                  <button onClick={() => delAtt(a.id)} style={{ color: 'var(--text-light)' }} title="Remover"><X size={12} /></button>
                </div>
              ))}
              {atts.length === 0 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem anexos.</p>}
            </div>
          </div>)}

          {/* TIMELINE */}
          {tab === 'timeline' && (<div>
            <div className="space-y-1.5">
              {(o.events ?? []).slice().reverse().map(e => (
                <div key={e.id} className="text-[11px] flex gap-2" style={{ color: 'var(--text-muted)' }}>
                  <span style={{ color: 'var(--text-light)' }}>{fmtDt(e.created_at)}</span>
                  <span><b>{e.event_type}</b>{e.to_value ? `: ${e.to_value}` : ''}{e.triggered_by ? ` (${e.triggered_by.name.split(' ')[0]})` : ''}</span>
                </div>
              ))}
              {(o.events ?? []).length === 0 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem histórico.</p>}
            </div>
          </div>)}
        </>)}
      </div>
    </div>
  )
}
