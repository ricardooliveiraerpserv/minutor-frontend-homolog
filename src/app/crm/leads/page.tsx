'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { UserPlus, X, Plus, AlertTriangle, Phone, ArrowRight, Trophy } from 'lucide-react'

interface Stage { id: number; name: string; ordem: number; is_won: boolean; is_lost: boolean }
interface Source { id: number; name: string; active: boolean; ordem: number }
interface UserOpt { id: number; name: string }
interface Lead {
  customer_id: number; empresa: string; company_name: string | null; crm_status: string
  stage_id: number | null
  lead_source?: { id: number; name: string } | null
  executive?: { id: number; name: string } | null
  observacoes: string | null; proxima_acao: string | null; proxima_acao_at: string | null
  ultima_interacao_at: string | null; lead_created_at: string | null
  lost_at: string | null; lost_reason: string | null; sem_proxima_acao: boolean
  contato?: { id: number; name: string; email: string | null; phone: string | null; whatsapp: string | null } | null
}

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('pt-BR') : null

export default function CrmLeadsPage() {
  const [stages, setStages] = useState<Stage[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [users, setUsers] = useState<UserOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<Lead | null>(null)
  const [addOpen, setAddOpen] = useState(false)

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
  }, [])

  const semProximaTotal = leads.filter(l => l.sem_proxima_acao).length

  return (
    <AppLayout title="Leads (CRM)">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <UserPlus size={18} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Leads</h1>
          <span className="text-xs" style={{ color: 'var(--text-light)' }}>— captação e qualificação (empresa única)</span>
          {semProximaTotal > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
              <AlertTriangle size={11} /> {semProximaTotal} sem próxima ação
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setAddOpen(true)} className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Novo Lead</button>
        </div>
      </div>

      {loading ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</p> : (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {stages.map(st => {
            const col = leads.filter(l => l.stage_id === st.id || (!l.stage_id && st.ordem === 1))
            return (
              <div key={st.id} className="w-72 shrink-0 rounded-xl" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: st.is_won ? '#10b981' : st.is_lost ? 'var(--danger-border)' : 'var(--text-muted)' }}>
                    {st.is_won && <Trophy size={12} />}{st.name}
                  </span>
                  <span className="text-[11px] px-1.5 rounded-full" style={{ background: 'var(--surface)', color: 'var(--text-light)' }}>{col.length}</span>
                </div>
                <div className="p-2 space-y-2 min-h-[120px]">
                  {st.is_won && col.length === 0 && <p className="text-[11px] px-2 py-3 text-center" style={{ color: 'var(--text-light)' }}>Leads qualificados viram Prospect e seguem para Oportunidades.</p>}
                  {col.map(l => (
                    <button key={l.customer_id} onClick={() => setSel(l)} className="w-full text-left rounded-lg p-2.5 hover:brightness-110 transition" style={{ background: 'var(--brand-surface)', border: l.lost_at ? '1px solid var(--danger-border)' : '1px solid var(--border)' }}>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{l.empresa}</p>
                      {l.contato?.name && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{l.contato.name}</p>}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {l.lead_source?.name && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{l.lead_source.name}</span>}
                        {l.lost_at ? <span className="text-[10px]" style={{ color: 'var(--danger-border)' }}>Perdido</span>
                          : l.sem_proxima_acao ? <span className="text-[10px] flex items-center gap-0.5" style={{ color: '#f59e0b' }}><AlertTriangle size={10} /> sem próxima ação</span>
                          : <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>{l.proxima_acao} · {fmtDate(l.proxima_acao_at)}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {addOpen && <AddLeadModal sources={sources} users={users} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load() }} />}
      {sel && <LeadDrawer lead={sel} stages={stages} sources={sources} onClose={() => setSel(null)} onChanged={() => { load() }} onConverted={() => { setSel(null); load() }} />}
    </AppLayout>
  )
}

// ── Cadastro rápido ───────────────────────────────────────────────────────
function AddLeadModal({ sources, users, onClose, onSaved }: { sources: Source[]; users: UserOpt[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ empresa: '', contato: '', telefone: '', whatsapp: '', email: '', cnpj: '', lead_source_id: '', executive_id: '', observacoes: '' })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }))
  const save = async () => {
    if (!f.empresa.trim()) { toast.error('Informe a empresa'); return }
    setSaving(true)
    try {
      await api.post('/crm/leads', {
        empresa: f.empresa, contato: f.contato || null, telefone: f.telefone || null, whatsapp: f.whatsapp || null,
        email: f.email || null, cnpj: f.cnpj || null,
        lead_source_id: f.lead_source_id ? Number(f.lead_source_id) : null,
        executive_id: f.executive_id ? Number(f.executive_id) : null,
        observacoes: f.observacoes || null,
      })
      toast.success('Lead cadastrado'); onSaved()
    } catch { toast.error('Erro ao cadastrar lead') } finally { setSaving(false) }
  }
  const field = (k: string, label: string, type = 'text') => (
    <div>
      <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <input type={type} value={(f as any)[k]} onChange={e => set(k, e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
    </div>
  )
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl p-5 max-h-[92vh] overflow-y-auto" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }} onClick={e => e.stopPropagation()}>
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
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Origem</label>
            <select value={f.lead_source_id} onChange={e => set('lead_source_id', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
              <option value="">—</option>
              {sources.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Responsável</label>
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


// ── Drawer do lead (próxima ação / interação / mover / converter) ────────────
function LeadDrawer({ lead, stages, sources, onClose, onChanged, onConverted }: { lead: Lead; stages: Stage[]; sources: Source[]; onClose: () => void; onChanged: () => void; onConverted: () => void }) {
  const [proxAcao, setProxAcao] = useState(lead.proxima_acao ?? '')
  const [proxAt, setProxAt] = useState(lead.proxima_acao_at ?? '')
  const [interacao, setInteracao] = useState('')
  const [convOpen, setConvOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const saveAcao = async () => {
    setBusy(true)
    try {
      await api.put(`/crm/leads/${lead.customer_id}`, { proxima_acao: proxAcao || null, proxima_acao_at: proxAt || null, interacao: interacao || null })
      toast.success(interacao ? 'Interação registrada' : 'Próxima ação salva'); setInteracao(''); onChanged()
    } catch { toast.error('Erro ao salvar') } finally { setBusy(false) }
  }
  const move = async (st: Stage) => {
    if (st.is_won) { setConvOpen(true); return }
    let lost_reason: string | null = null
    if (st.is_lost) { lost_reason = window.prompt('Motivo da perda (opcional):') }
    setBusy(true)
    try { await api.patch(`/crm/leads/${lead.customer_id}/stage`, { stage_id: st.id, lost_reason }); toast.success('Lead movido'); onChanged(); onClose() }
    catch { toast.error('Erro ao mover') } finally { setBusy(false) }
  }

  // Converter em Oportunidade: qualifica para prospect e abre a criação já pré-preenchida.
  const converterOportunidade = async () => {
    setBusy(true)
    try {
      if (lead.crm_status === 'lead') { await api.post(`/crm/leads/${lead.customer_id}/convert-prospect`, {}) }
      window.location.href = `/crm/pipeline?opp_for=${lead.customer_id}`
    } catch { toast.error('Erro ao converter'); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-md h-full overflow-y-auto p-5" style={{ background: 'var(--brand-surface)', borderLeft: '1px solid var(--brand-border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{lead.empresa}</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        {lead.contato && (
          <div className="rounded-lg p-3 mb-4 text-sm space-y-0.5" style={{ background: 'var(--surface-sunken)' }}>
            <p style={{ color: 'var(--text)' }}>{lead.contato.name}</p>
            {lead.contato.email && <p style={{ color: 'var(--text-muted)' }}>{lead.contato.email}</p>}
            {(lead.contato.phone || lead.contato.whatsapp) && <p className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><Phone size={11} /> {lead.contato.phone} {lead.contato.whatsapp && `· wpp ${lead.contato.whatsapp}`}</p>}
          </div>
        )}
        <div className="text-xs space-y-1 mb-4" style={{ color: 'var(--text-muted)' }}>
          {lead.lead_source?.name && <p>Origem: <span style={{ color: 'var(--text)' }}>{lead.lead_source.name}</span></p>}
          {lead.executive?.name && <p>Responsável: <span style={{ color: 'var(--text)' }}>{lead.executive.name}</span></p>}
          {lead.lead_created_at && <p>Criado em: {fmtDate(lead.lead_created_at)}</p>}
          {lead.ultima_interacao_at && <p>Última interação: {fmtDate(lead.ultima_interacao_at)}</p>}
          {lead.observacoes && <p className="pt-1" style={{ color: 'var(--text-light)' }}>{lead.observacoes}</p>}
        </div>

        {/* Próxima ação + registrar interação */}
        <div className="rounded-lg p-3 mb-4" style={{ border: '1px solid var(--border)' }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Próxima ação</p>
          <input value={proxAcao} onChange={e => setProxAcao(e.target.value)} placeholder="O que fazer…" className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-2" style={inputStyle} />
          <input type="date" value={proxAt} onChange={e => setProxAt(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3" style={inputStyle} />
          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Registrar interação</p>
          <input value={interacao} onChange={e => setInteracao(e.target.value)} placeholder="Ex.: Ligação realizada" className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-2" style={inputStyle} />
          <button onClick={saveAcao} disabled={busy} className="w-full px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>Salvar</button>
        </div>

        {/* Mover no funil */}
        <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Mover no funil</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {stages.filter(s => s.id !== lead.stage_id).map(st => (
            <button key={st.id} onClick={() => move(st)} disabled={busy} className="text-[11px] px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1"
              style={st.is_won ? { background: '#10b981', color: '#fff' } : st.is_lost ? { background: 'var(--danger-bg)', color: 'var(--danger-border)' } : { background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
              {st.is_won ? <Trophy size={11} /> : <ArrowRight size={11} />}{st.name}
            </button>
          ))}
        </div>

        <button onClick={() => setConvOpen(true)} className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5" style={{ background: '#10b981', color: '#fff' }}>
          <Trophy size={15} /> Converter para Prospect
        </button>
        <button onClick={converterOportunidade} disabled={busy} className="w-full mt-2 px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
          <ArrowRight size={15} /> Converter em Oportunidade
        </button>

        {convOpen && <ConvertModal lead={lead} onClose={() => setConvOpen(false)} onConverted={onConverted} />}
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
    } catch (e: any) { toast.error(e?.response?.data?.message ?? 'Erro ao qualificar') } finally { setSaving(false) }
  }
  const field = (k: string, label: string, type = 'text') => (
    <div>
      <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <input type={type} value={(f as any)[k]} onChange={e => set(k, e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
    </div>
  )
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-5" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }} onClick={e => e.stopPropagation()}>
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
          <button onClick={go} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: '#10b981', color: '#fff' }}>{saving ? 'Qualificando…' : 'Converter para Prospect'}</button>
        </div>
      </div>
    </div>
  )
}
