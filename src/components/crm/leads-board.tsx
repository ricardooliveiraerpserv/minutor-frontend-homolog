'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { UserPlus, X, Plus, AlertTriangle, Phone, ArrowRight, Trophy, Clock, Activity, ShieldAlert } from 'lucide-react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'

interface Stage { id: number; name: string; ordem: number; is_won: boolean; is_lost: boolean }
interface Source { id: number; name: string; active: boolean; ordem: number }
interface UserOpt { id: number; name: string }
interface ContactType { id: number; nome: string; slug: string }
interface Followup { id: number; tipo: string; titulo: string | null; data: string | null; concluida_at: string | null; usuario: string | null }
interface Lead {
  customer_id: number; empresa: string; company_name: string | null; crm_status: string
  stage_id: number | null
  lead_source?: { id: number; name: string } | null
  executive?: { id: number; name: string } | null
  observacoes: string | null
  proxima_task_id?: number | null; proxima_acao: string | null; proxima_tipo?: string | null; proxima_descricao?: string | null
  proxima_acao_at: string | null; proxima_objetivo?: string | null
  proxima_acao_atrasada?: boolean
  ultima_interacao_at: string | null; lead_created_at: string | null
  dias_sem_interacao?: number | null; temperatura?: string
  valor_potencial?: number | null; faixa_potencial?: string | null; followups_count?: number
  sem_responsavel?: boolean; primeiro_contato_horas?: number | null; primeiro_contato_feito?: boolean; sla_primeiro_contato_estourado?: boolean
  lost_at: string | null; lost_reason: string | null; sem_proxima_acao: boolean
  contato?: { id: number; name: string; email: string | null; phone: string | null; whatsapp: string | null } | null
}
interface Health { temperatura: string; dias_sem_interacao: number | null; proxima_acao: string | null; proxima_objetivo: string | null; proxima_acao_atrasada: boolean; followups_count: number; valor_potencial: number | null; previsao_label: string | null; risco: string; motivos: string[]; diagnostico: string }

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('pt-BR') : null
const fmtBRL = (n?: number | null) => n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const TEMP: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  quente: { emoji: '🔥', label: 'Quente', color: 'var(--danger-border)', bg: 'var(--danger-bg)' },
  morno: { emoji: '🌤', label: 'Morno', color: 'var(--warning-border)', bg: 'var(--warning-bg)' },
  frio: { emoji: '❄', label: 'Frio', color: 'var(--primary)', bg: 'var(--primary-soft)' },
}
const FAIXA_LABEL: Record<string, string> = { ate_5k: 'Até R$ 5k', '5k_20k': 'R$ 5–20k', acima_20k: '+ R$ 20k' }
const diasColor = (d?: number | null) => d == null || d > 10 ? 'var(--danger-border)' : d <= 3 ? 'var(--success-border)' : 'var(--warning-border)'
const diasLabel = (d?: number | null) => d == null ? 'Sem interação' : d === 0 ? 'Hoje' : `Há ${d} ${d === 1 ? 'dia' : 'dias'}`
// Lead saudável (carteira): tem dono + próxima ação + interação recente + não atrasado + tem origem.
const leadSaudavel = (l: Lead) => !l.sem_responsavel && !!l.proxima_acao_at && l.dias_sem_interacao != null && l.dias_sem_interacao <= 10 && !l.proxima_acao_atrasada && !!l.lead_source && !l.lost_at

export function LeadsBoard() {
  const [stages, setStages] = useState<Stage[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [users, setUsers] = useState<UserOpt[]>([])
  const [contactTypes, setContactTypes] = useState<ContactType[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<Lead | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [fOrigem, setFOrigem] = useState('')
  const [fResp, setFResp] = useState('')
  const [fTemp, setFTemp] = useState('')
  const [worklistOpen, setWorklistOpen] = useState(true)
  const [rankingOpen, setRankingOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get<{ data: { pipeline: { stages: Stage[] }; leads: Lead[] } }>('/crm/leads')
      .then(r => { setStages(r?.data?.pipeline?.stages ?? []); setLeads(r?.data?.leads ?? []) })
      .catch(() => toast.error('Erro ao carregar leads'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.get<{ data: Source[] }>('/crm/lead-sources').then(r => setSources(r?.data ?? [])).catch(() => {})
    api.get<any>('/users?pageSize=500').then(r => setUsers((Array.isArray(r) ? r : r?.data ?? r?.items ?? []).map((u: any) => ({ id: u.id, name: u.name })))).catch(() => {})
    api.get<{ data: ContactType[] }>('/crm/contact-types').then(r => setContactTypes(r?.data ?? [])).catch(() => {})
  }, [])
  useEffect(() => { if (sel) { const f = leads.find(l => l.customer_id === sel.customer_id); if (f) setSel(f) } }, [leads]) // eslint-disable-line react-hooks/exhaustive-deps

  const ativos = leads.filter(l => !l.lost_at)
  const orfaos = leads.filter(l => l.sem_responsavel && !l.lost_at)
  const slaEstourado = leads.filter(l => l.sla_primeiro_contato_estourado && !l.primeiro_contato_feito && !l.lost_at)
  const saudaveis = ativos.filter(leadSaudavel)
  const pctSaudavel = ativos.length ? Math.round(saudaveis.length / ativos.length * 100) : 0

  const filtered = leads.filter(l =>
    (!fOrigem || String(l.lead_source?.id ?? '') === fOrigem) &&
    (!fResp || String(l.executive?.id ?? '') === fResp) &&
    (!fTemp || l.temperatura === fTemp))

  // Ranking de carteira por vendedor
  const ranking = Object.values(ativos.reduce((acc, l) => {
    const key = l.executive?.name ?? 'Sem responsável'
    acc[key] = acc[key] || { responsavel: key, ativos: 0, sem_proxima: 0, atrasados: 0, em_risco: 0, valor: 0 }
    acc[key].ativos++
    if (l.sem_proxima_acao) acc[key].sem_proxima++
    if (l.proxima_acao_atrasada) acc[key].atrasados++
    if (l.temperatura === 'frio') acc[key].em_risco++
    acc[key].valor += l.valor_potencial ?? 0
    return acc
  }, {} as Record<string, { responsavel: string; ativos: number; sem_proxima: number; atrasados: number; em_risco: number; valor: number }>))
    .sort((a, b) => b.ativos - a.ativos)

  // Drag-and-drop entre etapas (igual aos demais pipelines). is_won exige conversão.
  const onDragEnd = async (r: DropResult) => {
    if (!r.destination) return
    const toId = Number(r.destination.droppableId)
    const lead = leads.find(l => l.customer_id === Number(r.draggableId))
    if (!lead || lead.stage_id === toId) return
    const st = stages.find(s => s.id === toId)
    if (!st) return
    if (st.is_won) { toast('Use "Converter para Prospect" para qualificar este lead.'); return }
    const prev = leads
    setLeads(ls => ls.map(l => l.customer_id === lead.customer_id ? { ...l, stage_id: toId } : l))
    try { await api.patch(`/crm/leads/${lead.customer_id}/stage`, { stage_id: toId }); load() }
    catch { setLeads(prev); toast.error('Erro ao mover lead') }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const in7 = new Date(today); in7.setDate(in7.getDate() + 7)
  const comAcao = filtered.filter(l => l.proxima_acao_at && !l.lost_at)
  const atrasadas = comAcao.filter(l => new Date(l.proxima_acao_at!) < today)
  const hoje = comAcao.filter(l => { const d = new Date(l.proxima_acao_at!); d.setHours(0, 0, 0, 0); return d.getTime() === today.getTime() })
  const prox7 = comAcao.filter(l => { const d = new Date(l.proxima_acao_at!); d.setHours(0, 0, 0, 0); return d > today && d <= in7 })

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <select value={fOrigem} onChange={e => setFOrigem(e.target.value)} className="text-sm rounded-lg px-2.5 py-2 outline-none" style={{ ...inputStyle, borderColor: fOrigem ? 'var(--primary)' : 'var(--border)' }}>
          <option value="">Todas as origens</option>
          {sources.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={fResp} onChange={e => setFResp(e.target.value)} className="text-sm rounded-lg px-2.5 py-2 outline-none" style={{ ...inputStyle, borderColor: fResp ? 'var(--primary)' : 'var(--border)' }}>
          <option value="">Todos os responsáveis</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={fTemp} onChange={e => setFTemp(e.target.value)} className="text-sm rounded-lg px-2.5 py-2 outline-none" style={{ ...inputStyle, borderColor: fTemp ? 'var(--primary)' : 'var(--border)' }}>
          <option value="">Toda temperatura</option>
          <option value="quente">🔥 Quente</option>
          <option value="morno">🌤 Morno</option>
          <option value="frio">❄ Frio</option>
        </select>
        {(fOrigem || fResp || fTemp) && <button onClick={() => { setFOrigem(''); setFResp(''); setFTemp('') }} className="text-xs px-2.5 py-2 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>Limpar filtros</button>}
        <div className="flex-1" />
        <button onClick={() => setAddOpen(true)} className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Novo Lead</button>
      </div>

      {loading ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</p> : (
        <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-3">
          {stages.map(st => {
            const col = filtered.filter(l => l.stage_id === st.id || (!l.stage_id && st.ordem === 1))
            return (
              <div key={st.id} className="w-72 shrink-0 rounded-xl" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: st.is_won ? 'var(--success-border)' : st.is_lost ? 'var(--danger-border)' : 'var(--text-muted)' }}>
                    {st.is_won && <Trophy size={12} />}{st.name}
                  </span>
                  <span className="text-[11px] px-1.5 rounded-full" style={{ background: 'var(--surface)', color: 'var(--text-light)' }}>{col.length}</span>
                </div>
                <Droppable droppableId={String(st.id)}>
                {(prov) => (
                <div ref={prov.innerRef} {...prov.droppableProps} className="p-2 space-y-2 min-h-[120px]">
                  {st.is_won && col.length === 0 && <p className="text-[11px] px-2 py-3 text-center" style={{ color: 'var(--text-light)' }}>Leads qualificados viram Prospect e seguem para Oportunidades.</p>}
                  {col.map((l, i) => {
                    const temp = TEMP[l.temperatura ?? 'frio']
                    return (
                    <Draggable key={l.customer_id} draggableId={String(l.customer_id)} index={i}>
                    {(dp) => (
                    <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps}>
                    <button onClick={() => setSel(l)} className="w-full text-left rounded-lg p-2.5 hover:brightness-110 transition" style={{ background: 'var(--surface)', border: l.lost_at ? '1px solid var(--danger-border)' : l.sem_responsavel ? '1px solid var(--danger-border)' : '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: temp.bg, color: temp.color }}>{temp.emoji} {temp.label}</span>
                        {l.sem_responsavel && !l.lost_at && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5" style={{ background: 'var(--danger-bg)', color: 'var(--danger-border)' }} title="Lead sem responsável"><ShieldAlert size={9} /> órfão</span>}
                      </div>
                      <p className="text-sm font-semibold mt-1" style={{ color: 'var(--text)' }}>{l.empresa}</p>
                      {l.contato?.name && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{l.contato.name}</p>}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[10px]">
                        {l.lead_source?.name && <span className="px-1.5 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{l.lead_source.name}</span>}
                        {l.valor_potencial != null && <span className="px-1.5 py-0.5 rounded-full font-semibold tabular-nums" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}>{fmtBRL(l.valor_potencial)}</span>}
                        {l.executive?.name && <span className="px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>👤 {l.executive.name.split(' ')[0]}</span>}
                      </div>
                      {/* Alerta de SLA só quando ESTOURADO */}
                      {l.sla_primeiro_contato_estourado && !l.primeiro_contato_feito && !l.lost_at && (
                        <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: 'var(--danger-border)' }}>
                          <AlertTriangle size={10} /> 1º contato {l.primeiro_contato_horas}h (SLA estourado)
                        </p>
                      )}
                      {/* Próxima ação (Nível 1). Última interação e objetivo saem do card. */}
                      {l.lost_at ? <p className="text-[10px] mt-1.5" style={{ color: 'var(--danger-border)' }}>Perdido</p>
                        : l.proxima_acao_at ? (
                          <div className="mt-1.5 rounded px-1.5 py-1 text-[10px] flex items-center gap-1.5" style={{ background: 'var(--surface-sunken)', color: l.proxima_acao_atrasada ? 'var(--danger-border)' : 'var(--text-muted)' }}>
                            <Clock size={10} className="shrink-0" />
                            <span className="truncate flex-1">{l.proxima_acao || 'Próxima ação'}</span>
                            {l.proxima_acao_atrasada && <span className="px-1 rounded font-bold whitespace-nowrap" style={{ background: 'var(--danger-bg)', color: 'var(--danger-border)' }}>Atrasada</span>}
                            <span className="tabular-nums whitespace-nowrap">{fmtDate(l.proxima_acao_at)}</span>
                          </div>
                        ) : <p className="text-[10px] mt-1.5 flex items-center gap-0.5" style={{ color: 'var(--warning-border)' }}><AlertTriangle size={10} /> sem próxima ação</p>}
                    </button>
                    </div>
                    )}
                    </Draggable>
                  ) })}
                  {prov.placeholder}
                </div>
                )}
                </Droppable>
              </div>
            )
          })}
        </div>
        </DragDropContext>
      )}

      {addOpen && <AddLeadModal sources={sources} users={users} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load() }} />}
      {sel && <LeadDrawer lead={sel} stages={stages} contactTypes={contactTypes} users={users} onClose={() => setSel(null)} onChanged={load} onConverted={() => { setSel(null); load() }} />}
    </div>
  )
}

// ── Cadastro rápido ───────────────────────────────────────────────────────
function AddLeadModal({ sources, users, onClose, onSaved }: { sources: Source[]; users: UserOpt[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ empresa: '', contato: '', telefone: '', whatsapp: '', email: '', cnpj: '', lead_source_id: '', executive_id: '', valor_potencial: '', observacoes: '' })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }))
  const save = async () => {
    if (!f.empresa.trim()) { toast.error('Informe a empresa'); return }
    if (!f.lead_source_id) { toast.error('Origem é obrigatória'); return }
    setSaving(true)
    try {
      await api.post('/crm/leads', {
        empresa: f.empresa, contato: f.contato || null, telefone: f.telefone || null, whatsapp: f.whatsapp || null,
        email: f.email || null, cnpj: f.cnpj || null,
        lead_source_id: Number(f.lead_source_id),
        executive_id: f.executive_id ? Number(f.executive_id) : null,
        valor_potencial: f.valor_potencial ? Number(f.valor_potencial) : null,
        observacoes: f.observacoes || null,
      })
      toast.success('Lead cadastrado'); onSaved()
    } catch (e: any) { toast.error(e?.message || 'Erro ao cadastrar lead') } finally { setSaving(false) }
  }
  const field = (k: string, label: string, type = 'text') => (
    <div>
      <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <input type={type} value={(f as any)[k]} onChange={e => set(k, e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
    </div>
  )
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl p-5 max-h-[92vh] overflow-y-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Novo Lead</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">{field('empresa', 'Empresa *')}</div>
          {field('cnpj', 'CNPJ (opcional)')}
          {field('contato', 'Contato')}
          {field('telefone', 'Telefone')}
          {field('whatsapp', 'WhatsApp')}
          {field('email', 'E-mail', 'email')}
          {field('valor_potencial', 'Valor potencial (R$)', 'number')}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Origem *</label>
            <select value={f.lead_source_id} onChange={e => set('lead_source_id', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ ...inputStyle, borderColor: f.lead_source_id ? 'var(--border)' : 'var(--danger-border)' }}>
              <option value="">Selecione…</option>
              {sources.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Responsável <span style={{ color: 'var(--text-light)' }}>(recomendado — lead sem dono não avança)</span></label>
            <select value={f.executive_id} onChange={e => set('executive_id', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
              <option value="">—</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Observações</label>
            <textarea value={f.observacoes} onChange={e => set('observacoes', e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
          </div>
        </div>
        <p className="text-[11px] mt-3" style={{ color: 'var(--text-light)' }}>Segmento, porte, ERP e faturamento são preenchidos na qualificação (Lead → Prospect).</p>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saving ? 'Salvando…' : 'Cadastrar lead'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Drawer do lead ────────────────────────────────────────────────────────
function LeadDrawer({ lead, stages, contactTypes, users, onClose, onChanged, onConverted }: { lead: Lead; stages: Stage[]; contactTypes: ContactType[]; users: UserOpt[]; onClose: () => void; onChanged: () => void; onConverted: () => void }) {
  const [convOpen, setConvOpen] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [followups, setFollowups] = useState<Followup[]>([])

  // Fluxo UNIFICADO: registrar interação + próximo passo num único formulário.
  const [fuTipo, setFuTipo] = useState('')
  const [fuDesc, setFuDesc] = useState('')
  const [npTipo, setNpTipo] = useState('')
  const [npDesc, setNpDesc] = useState('')
  const [npObj, setNpObj] = useState('')
  const [npData, setNpData] = useState('')
  const [npResp, setNpResp] = useState('')
  const [fuSaving, setFuSaving] = useState(false)

  useEffect(() => {
    setFuTipo(contactTypes[0]?.slug ?? ''); setNpTipo(contactTypes[0]?.slug ?? '')
    setNpResp(String(lead.executive?.id ?? ''))
  }, [lead.customer_id, contactTypes]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadFups = useCallback(() => { api.get<{ data: Followup[] }>(`/crm/leads/${lead.customer_id}/followups`).then(r => setFollowups(r?.data ?? [])).catch(() => {}) }, [lead.customer_id])
  useEffect(() => { loadFups() }, [loadFups])

  const temp = TEMP[lead.temperatura ?? 'frio']

  const salvarResponsavel = async (uid: string) => {
    try { await api.put(`/crm/leads/${lead.customer_id}`, { executive_id: uid ? Number(uid) : null }); toast.success('Responsável atualizado'); onChanged() }
    catch { toast.error('Erro ao salvar responsável') }
  }
  // Registra interação e (recomendado) já agenda o próximo passo — fonte única CrmTask.
  const registrar = async () => {
    if (!fuTipo) { toast.error('Selecione o tipo da interação'); return }
    const temProx = !!npTipo && (!!npDesc || !!npData)
    if (!temProx && !window.confirm('Nenhum próximo passo agendado. Um lead ativo não deveria ficar sem próxima ação. Registrar mesmo assim?')) return
    setFuSaving(true)
    try {
      const proxima = temProx ? { tipo: npTipo, descricao: npDesc || null, objetivo: npObj || null, data: npData || null, responsavel_id: npResp ? Number(npResp) : null } : null
      await api.post(`/crm/leads/${lead.customer_id}/followups`, { tipo: fuTipo, descricao: fuDesc || null, concluir_proxima: !!proxima, proxima })
      toast.success(proxima ? 'Interação + próxima ação registradas' : 'Interação registrada')
      setFuDesc(''); setNpDesc(''); setNpObj(''); setNpData('')
      loadFups(); onChanged()
    } catch { toast.error('Erro ao registrar') } finally { setFuSaving(false) }
  }
  const move = async (st: Stage) => {
    let lost_reason: string | null = null
    if (st.is_lost) { lost_reason = window.prompt('Motivo da perda (opcional):') }
    setBusy(true)
    try { await api.patch(`/crm/leads/${lead.customer_id}/stage`, { stage_id: st.id, lost_reason }); toast.success('Lead movido'); onChanged(); onClose() }
    catch { toast.error('Erro ao mover') } finally { setBusy(false) }
  }
  const converter = () => {
    if (lead.sem_responsavel) { toast.error('Defina um responsável antes de converter para Prospect'); return }
    setConvOpen(true)
  }

  const ordered = [...stages].filter(s => !s.is_won && !s.is_lost).sort((a, b) => a.ordem - b.ordem)
  const curIdx = ordered.findIndex(s => s.id === lead.stage_id)
  const proximaEtapa = curIdx >= 0 && curIdx < ordered.length - 1 ? ordered[curIdx + 1] : null
  const etapaPerdido = stages.find(s => s.is_lost)
  const fmtDt = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-md h-full overflow-y-auto p-5" style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{lead.empresa}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setHealthOpen(true)} title="Por que está nessa temperatura?" className="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1" style={{ background: temp.bg, color: temp.color }}>{temp.emoji} {temp.label}</button>
            <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
          </div>
        </div>

        {/* Contato clicável no topo (produtividade) */}
        {lead.contato && (
          <div className="rounded-lg p-3 mb-3 text-sm space-y-0.5" style={{ background: 'var(--surface-sunken)' }}>
            <p style={{ color: 'var(--text)' }}>{lead.contato.name}</p>
            {lead.contato.email && <a href={`mailto:${lead.contato.email}`} className="block" style={{ color: 'var(--primary)' }}>{lead.contato.email}</a>}
            {(lead.contato.phone || lead.contato.whatsapp) && <p className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}><Phone size={11} /> {lead.contato.phone}{lead.contato.whatsapp && <a href={`https://wa.me/${lead.contato.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ color: 'var(--success-border)' }}>· WhatsApp</a>}</p>}
          </div>
        )}

        {/* RESUMO COMERCIAL */}
        <div className="rounded-lg p-3 mb-4" style={{ background: 'var(--surface-sunken)', border: lead.sem_responsavel ? '1px solid var(--danger-border)' : '1px solid var(--border)' }}>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Resumo comercial</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <div><span style={{ color: 'var(--text-light)' }}>Temperatura</span><br /><span className="font-semibold" style={{ color: temp.color }}>{temp.emoji} {temp.label}</span></div>
            <div><span style={{ color: 'var(--text-light)' }}>Valor potencial</span><br /><span className="font-semibold" style={{ color: 'var(--text)' }}>{lead.valor_potencial != null ? fmtBRL(lead.valor_potencial) : (lead.faixa_potencial ? FAIXA_LABEL[lead.faixa_potencial] : '—')}</span></div>
            <div><span style={{ color: 'var(--text-light)' }}>Origem</span><br /><span style={{ color: 'var(--text)' }}>{lead.lead_source?.name ?? '—'}</span></div>
            <div><span style={{ color: 'var(--text-light)' }}>Última interação</span><br /><span className="font-semibold" style={{ color: diasColor(lead.dias_sem_interacao) }}>{diasLabel(lead.dias_sem_interacao)}</span></div>
            <div className="col-span-2"><span style={{ color: 'var(--text-light)' }}>Próxima ação</span><br /><span style={{ color: lead.proxima_acao_atrasada ? 'var(--danger-border)' : 'var(--text)' }}>{lead.proxima_acao ? `${lead.proxima_acao} · ${fmtDate(lead.proxima_acao_at)}` : '— nenhuma agendada'}</span>{lead.proxima_objetivo && <span className="block text-[11px]" style={{ color: 'var(--text-light)' }}>🎯 {lead.proxima_objetivo}</span>}</div>
          </div>
          {/* Responsável (accountability) */}
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <label className="text-[11px]" style={{ color: 'var(--text-light)' }}>Responsável {lead.sem_responsavel && <span style={{ color: 'var(--danger-border)' }}>— sem dono!</span>}</label>
            <select value={String(lead.executive?.id ?? '')} onChange={e => salvarResponsavel(e.target.value)} className="w-full mt-0.5 text-xs rounded-lg px-2 py-1.5 outline-none" style={{ ...inputStyle, borderColor: lead.sem_responsavel ? 'var(--danger-border)' : 'var(--border)' }}>
              <option value="">— sem responsável</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>

        {/* REGISTRAR INTERAÇÃO + PRÓXIMO PASSO (fluxo unificado) */}
        <div className="rounded-lg p-3 mb-3" style={{ border: '1px solid var(--border)' }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Registrar interação</p>
          <select value={fuTipo} onChange={e => setFuTipo(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-2" style={inputStyle}>
            {contactTypes.map(c => <option key={c.slug} value={c.slug}>{c.nome}</option>)}
          </select>
          <textarea value={fuDesc} onChange={e => setFuDesc(e.target.value)} rows={2} placeholder="O que foi tratado / combinado…" className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-2" style={inputStyle} />
          <div className="rounded-lg p-2.5 mb-2 space-y-2" style={{ background: 'var(--surface-sunken)' }}>
            <p className="text-[10px] font-semibold uppercase" style={{ color: 'var(--primary)' }}>Próximo passo (recomendado)</p>
            <div className="grid grid-cols-2 gap-2">
              <select value={npTipo} onChange={e => setNpTipo(e.target.value)} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>{contactTypes.map(c => <option key={c.slug} value={c.slug}>{c.nome}</option>)}</select>
              <input type="date" value={npData} onChange={e => setNpData(e.target.value)} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </div>
            <input value={npDesc} onChange={e => setNpDesc(e.target.value)} placeholder="Próxima ação (ex.: Enviar apresentação)" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            <input value={npObj} onChange={e => setNpObj(e.target.value)} placeholder="🎯 Objetivo do próximo passo" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            <select value={npResp} onChange={e => setNpResp(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}><option value="">Responsável…</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </div>
          <button onClick={registrar} disabled={fuSaving} className="w-full px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{fuSaving ? 'Salvando…' : 'Registrar interação + próxima ação'}</button>
        </div>

        {/* HISTÓRICO */}
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Histórico de follow-ups</p>
          <div className="space-y-2">
            {followups.map(f => (
              <div key={f.id} className="text-xs rounded-lg px-2.5 py-2" style={{ background: 'var(--surface-sunken)', borderLeft: `2px solid ${f.concluida_at ? 'var(--success-border)' : 'var(--primary)'}` }}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold" style={{ color: 'var(--text)' }}>{f.tipo}{!f.concluida_at && <span className="ml-1.5 text-[9px] px-1 rounded" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>aberta</span>}</span>
                  <span style={{ color: 'var(--text-light)' }}>{fmtDt(f.data)}</span>
                </div>
                {f.titulo && <p style={{ color: 'var(--text-muted)' }}>{f.titulo}</p>}
                {f.usuario && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-light)' }}>por {f.usuario}</p>}
              </div>
            ))}
            {followups.length === 0 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Nenhum follow-up registrado.</p>}
          </div>
        </div>

        {/* CONVERSÃO (fluxo estrito) */}
        <div className="space-y-2">
          {proximaEtapa && (
            <button onClick={() => move(proximaEtapa)} disabled={busy} className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5" style={{ background: 'var(--surface-sunken)', color: 'var(--text)' }}>
              <ArrowRight size={15} /> Avançar para “{proximaEtapa.name}”
            </button>
          )}
          <button onClick={converter} disabled={busy || lead.sem_responsavel} title={lead.sem_responsavel ? 'Defina um responsável primeiro' : ''} className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50" style={{ background: 'var(--success)', color: '#fff' }}>
            <Trophy size={15} /> Converter para Prospect
          </button>
          {lead.sem_responsavel && <p className="text-[10px] text-center" style={{ color: 'var(--danger-border)' }}>Lead sem responsável não pode avançar.</p>}
          {etapaPerdido && !lead.lost_at && (
            <button onClick={() => move(etapaPerdido)} disabled={busy} className="w-full px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--danger-bg)', color: 'var(--danger-border)' }}>Marcar como perdido</button>
          )}
        </div>
        <p className="text-[10px] mt-2" style={{ color: 'var(--text-light)' }}>Fluxo: Lead → Prospect → Oportunidade.</p>

        {convOpen && <ConvertModal lead={lead} onClose={() => setConvOpen(false)} onConverted={onConverted} />}
        {healthOpen && <HealthModal customerId={lead.customer_id} onClose={() => setHealthOpen(false)} />}
      </div>
    </div>
  )
}

// ── Diagnóstico (explica a temperatura) ─────────────────────────────────────
function HealthModal({ customerId, onClose }: { customerId: number; onClose: () => void }) {
  const [h, setH] = useState<Health | null>(null)
  useEffect(() => { api.get<{ data: Health }>(`/crm/leads/${customerId}/health`).then(r => setH(r?.data ?? null)).catch(() => {}) }, [customerId])
  const temp = h ? TEMP[h.temperatura] : null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold flex items-center gap-1.5" style={{ color: 'var(--text)' }}><Activity size={16} /> Diagnóstico do lead</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        {!h ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</p> : (
          <>
            {temp && <span className="px-2.5 py-1 rounded-full text-sm font-bold inline-block mb-3" style={{ background: temp.bg, color: temp.color }}>{temp.emoji} {temp.label}</span>}
            <p className="text-sm mb-3" style={{ color: 'var(--text)' }}>{h.diagnostico}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg px-2.5 py-2" style={{ background: 'var(--surface-sunken)' }}><span style={{ color: 'var(--text-light)' }}>Última interação</span><br /><span className="font-semibold" style={{ color: diasColor(h.dias_sem_interacao) }}>{diasLabel(h.dias_sem_interacao)}</span></div>
              <div className="rounded-lg px-2.5 py-2" style={{ background: 'var(--surface-sunken)' }}><span style={{ color: 'var(--text-light)' }}>Follow-ups</span><br /><span className="font-semibold" style={{ color: 'var(--text)' }}>{h.followups_count}</span></div>
              <div className="rounded-lg px-2.5 py-2 col-span-2" style={{ background: 'var(--surface-sunken)' }}><span style={{ color: 'var(--text-light)' }}>Próxima ação</span><br /><span className="font-semibold" style={{ color: h.proxima_acao_atrasada ? 'var(--danger-border)' : 'var(--text)' }}>{h.proxima_acao ?? '— nenhuma agendada'}</span></div>
            </div>
            {h.motivos.length > 0 && <div className="mt-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>Por quê: {h.motivos.join(', ')}.</div>}
          </>
        )}
      </div>
    </div>
  )
}

// ── Qualificação: Lead → Prospect ────────────────────────────────────────────
function ConvertModal({ lead, onClose, onConverted }: { lead: Lead; onClose: () => void; onConverted: () => void }) {
  const [f, setF] = useState({ segment: '', erp_atual: '', porte: '', faturamento_estimado: '', num_funcionarios: '', region: '' })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }))
  const go = async () => {
    setSaving(true)
    try {
      await api.post(`/crm/leads/${lead.customer_id}/convert-prospect`, {
        segment: f.segment || null, erp_atual: f.erp_atual || null, porte: f.porte || null,
        faturamento_estimado: f.faturamento_estimado ? Number(f.faturamento_estimado) : null,
        num_funcionarios: f.num_funcionarios ? Number(f.num_funcionarios) : null, region: f.region || null,
      })
      toast.success('Lead qualificado → Prospect'); onConverted()
    } catch (e: any) { toast.error(e?.response?.data?.message ?? e?.message ?? 'Erro ao qualificar') } finally { setSaving(false) }
  }
  const field = (k: string, label: string, type = 'text') => (
    <div>
      <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <input type={type} value={(f as any)[k]} onChange={e => set(k, e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
    </div>
  )
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Qualificar para Prospect</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <p className="text-[11px] mb-4" style={{ color: 'var(--text-light)' }}>Complete o perfil firmográfico de <b>{lead.empresa}</b>. Tudo opcional — o lead vira Prospect e segue para Oportunidades.</p>
        <div className="grid grid-cols-2 gap-3">
          {field('segment', 'Segmento')}
          {field('erp_atual', 'ERP atual')}
          {field('porte', 'Porte')}
          {field('region', 'Região')}
          {field('faturamento_estimado', 'Faturamento estimado (R$)', 'number')}
          {field('num_funcionarios', 'Nº funcionários', 'number')}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
          <button onClick={go} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--success)', color: '#fff' }}>{saving ? 'Qualificando…' : 'Converter para Prospect'}</button>
        </div>
      </div>
    </div>
  )
}
