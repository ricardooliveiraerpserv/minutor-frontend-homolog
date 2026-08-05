'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { CustomFieldsSection } from '@/components/crm/custom-fields-section'
import { toast } from 'sonner'
import { Building2, X, Search, LayoutDashboard, Plus, Trash2 } from 'lucide-react'

interface Customer { id: number; name: string; company_name: string | null; cgc: string; crm_status: string; executive?: { id: number; name: string } | null }
interface CrmTag { id: number; name: string; color: string | null; active?: boolean }
interface CrmProfile { region: string | null; segment: string | null; porte: string | null; faturamento_estimado: number | null; num_funcionarios: number | null; erp_atual: string | null; indicacao: string | null }
interface Vinculos { oportunidades: number; propostas: number; contratos: number; projetos: number }
interface TimelineItem { when: string; source: string; type: string; label: string | null; user?: string | null }

// Rótulos amigáveis dos tipos de evento (comercial + contratos + lead).
const EVT_LABEL: Record<string, string> = {
  created: 'Criada', stage_changed: 'Mudou de etapa', valor_alterado: 'Valor alterado',
  probabilidade_alterada: 'Probabilidade alterada', previsao_alterada: 'Previsão alterada', parada_alterada: 'Motivo da parada',
  task_done: 'Tarefa concluída', task_reopened: 'Tarefa reaberta', task_updated: 'Tarefa editada', note: 'Nota',
  won: 'Ganha', lost: 'Perdida', converted: 'Convertida em contrato', automacao: 'Automação', automacao_erro: 'Falha em automação',
  field_changed: 'Campo alterado', qualified: 'Qualificado', prospect: 'Virou prospect', lead_created: 'Lead criado',
  cliente_pendente_cnpj: 'Cliente pendente de CNPJ', product_added: 'Produto adicionado', product_removed: 'Produto removido',
  renovacao_ignorada: 'Renovação ignorada', proposta_criada: 'Proposta criada',
}
const evtLabel = (t: string) => EVT_LABEL[t] ?? (t ? t.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : t)

const STATUS: { v: string; l: string; bg: string; fg: string }[] = [
  { v: 'lead',           l: 'Lead',          bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' },
  { v: 'prospect',       l: 'Prospect',      bg: 'rgba(56,189,248,0.15)',  fg: '#38bdf8' },
  { v: 'cliente',        l: 'Cliente',       bg: 'rgba(34,197,94,0.15)',   fg: '#22c55e' },
  { v: 'em_renovacao',   l: 'Em Renovação',  bg: 'rgba(245,158,11,0.15)',  fg: '#f59e0b' },
  { v: 'inativo',        l: 'Inativo',       bg: 'rgba(120,120,120,0.15)', fg: '#9ca3af' },
]
// "contrato_ativo" foi unificado em "cliente" — alias p/ não quebrar dado residual.
const statusInfo = (v: string) => STATUS.find(s => s.v === (v === 'contrato_ativo' ? 'cliente' : v)) ?? STATUS[0]
const EMPTY_PROFILE: CrmProfile = { region: '', segment: '', porte: '', faturamento_estimado: null, num_funcionarios: null, erp_atual: '', indicacao: '' }

export default function CrmEmpresasPage() {
  const router = useRouter()
  const [list, setList] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [fStatus, setFStatus] = useState('')
  const [busca, setBusca] = useState('')
  const [allTags, setAllTags] = useState<CrmTag[]>([])
  const [segmentos, setSegmentos] = useState<{ id: number; name: string }[]>([])

  // Edição CRM
  const [sel, setSel] = useState<Customer | null>(null)
  const [crmStatus, setCrmStatus] = useState('lead')
  const [cgc, setCgc] = useState('')
  const [profile, setProfile] = useState<CrmProfile>(EMPTY_PROFILE)
  const [tagIds, setTagIds] = useState<number[]>([])
  const [newTag, setNewTag] = useState('')
  const [saving, setSaving] = useState(false)
  const [vinculos, setVinculos] = useState<Vinculos | null>(null)
  // Incluir empresa
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newEmp, setNewEmp] = useState({ name: '', company_name: '', cgc: '', crm_status: 'prospect' })
  const [deleting, setDeleting] = useState(false)
  const [timeline, setTimeline] = useState<TimelineItem[]>([])

  const load = useCallback(() => {
    setLoading(true)
    api.get<any>('/customers?pageSize=500')
      .then(r => setList((Array.isArray(r) ? r : r?.data ?? r?.items ?? []).map((c: any) => ({ id: c.id, name: c.name, company_name: c.company_name, cgc: c.cgc, crm_status: c.crm_status ?? 'lead', executive: c.executive }))))
      .catch(() => toast.error('Erro ao carregar empresas'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { api.get<{ data: CrmTag[] }>('/crm/tags').then(r => setAllTags(r?.data ?? [])).catch(() => {}) }, [])
  useEffect(() => { api.get<{ data: { id: number; name: string }[] }>('/crm/segments?only_active=1').then(r => setSegmentos(r?.data ?? [])).catch(() => {}) }, [])

  const open = async (c: Customer) => {
    setSel(c); setVinculos(null); setTimeline([])
    try {
      const r = await api.get<{ data: { crm_status: string; cgc: string | null; profile: CrmProfile | null; tags: CrmTag[] } }>(`/customers/${c.id}/crm`)
      setCrmStatus(r.data.crm_status ?? 'lead')
      setCgc(r.data.cgc ?? '')
      setProfile(r.data.profile ?? EMPTY_PROFILE)
      setTagIds((r.data.tags ?? []).map(t => t.id))
    } catch { toast.error('Erro ao carregar dados CRM') }
    api.get<{ data: { vinculos: Vinculos; timeline: TimelineItem[] } }>(`/customers/${c.id}/crm/timeline`)
      .then(r => { setVinculos(r?.data?.vinculos ?? null); setTimeline(r?.data?.timeline ?? []) })
      .catch(() => {})
  }

  const createTag = async () => {
    const name = newTag.trim()
    if (!name) return
    try {
      const r = await api.post<{ data: CrmTag }>('/crm/tags', { name })
      setAllTags(ts => [...ts, r.data]); setTagIds(ids => [...ids, r.data.id]); setNewTag('')
    } catch { toast.error('Tag já existe ou inválida') }
  }

  const save = async () => {
    if (!sel) return
    setSaving(true)
    try {
      await api.put(`/customers/${sel.id}/crm`, {
        crm_status: crmStatus,
        cgc: cgc.trim() || null,
        profile: { ...profile, faturamento_estimado: profile.faturamento_estimado === ('' as any) ? null : profile.faturamento_estimado, num_funcionarios: profile.num_funcionarios === ('' as any) ? null : profile.num_funcionarios },
        tag_ids: tagIds,
      })
      toast.success('Empresa atualizada')
      setList(xs => xs.map(x => x.id === sel.id ? { ...x, crm_status: crmStatus } : x))
      setSel(null)
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao salvar') } finally { setSaving(false) }
  }

  // Incluir empresa (= criar customer; CNPJ só é obrigatório se o status for cliente — o BE valida).
  const createEmpresa = async () => {
    if (!newEmp.name.trim()) { toast.error('Informe o nome da empresa'); return }
    setCreating(true)
    try {
      await api.post('/customers', {
        name: newEmp.name.trim(),
        company_name: newEmp.company_name.trim() || null,
        cgc: newEmp.cgc.replace(/\D/g, '') || null,
        crm_status: newEmp.crm_status,
      })
      toast.success('Empresa incluída')
      setShowCreate(false)
      setNewEmp({ name: '', company_name: '', cgc: '', crm_status: 'prospect' })
      load()
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao incluir empresa') } finally { setCreating(false) }
  }

  // Excluir empresa: só se NÃO tiver vínculos (BE bloqueia contrato/projeto real/oportunidade).
  const deleteEmpresa = async () => {
    if (!sel) return
    if (!confirm(`Excluir a empresa "${sel.name}"? Essa ação não pode ser desfeita.`)) return
    setDeleting(true)
    try {
      await api.delete(`/customers/${sel.id}`)
      toast.success('Empresa excluída')
      setList(xs => xs.filter(x => x.id !== sel.id))
      setSel(null)
    } catch (e: any) { toast.error(e?.message ?? 'Não foi possível excluir a empresa') } finally { setDeleting(false) }
  }

  const filtered = list.filter(c => {
    if (fStatus && c.crm_status !== fStatus) return false
    if (busca.trim()) { const q = busca.toLowerCase(); const d = busca.replace(/\D/g, ''); return c.name.toLowerCase().includes(q) || (c.company_name ?? '').toLowerCase().includes(q) || (d && c.cgc.includes(d)) }
    return true
  })

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  const setP = (k: keyof CrmProfile, v: any) => setProfile(p => ({ ...p, [k]: v }))

  return (
    <AppLayout title="Empresas (CRM)">
      <div className="flex items-center gap-2 mb-4">
        <Building2 size={18} style={{ color: 'var(--primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Empresas</h1>
        <span className="text-xs" style={{ color: 'var(--text-light)' }}>— mesma base de clientes (empresa única)</span>
        <button onClick={() => setShowCreate(true)} className="ml-auto flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
          <Plus size={15} /> Nova empresa
        </button>
      </div>

      {/* Indicadores por status (refletem customers.crm_status — empresa única) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        {(['lead', 'prospect', 'cliente', 'em_renovacao'] as const).map(v => {
          // conta cliente + qualquer dado residual contrato_ativo sob "cliente"
          const si = statusInfo(v); const n = list.filter(c => (c.crm_status === 'contrato_ativo' ? 'cliente' : c.crm_status) === v).length
          return (
            <button key={v} onClick={() => setFStatus(f => f === v ? '' : v)} className="rounded-xl p-3 text-left transition" style={{ background: 'var(--surface)', border: `1px solid ${fStatus === v ? si.fg : 'var(--border)'}` }}>
              <p className="text-xl font-bold tabular-nums" style={{ color: si.fg }}>{n}</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{si.l}</p>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5" style={{ color: 'var(--text-light)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome / CNPJ" className="pl-8 pr-3 py-2 rounded-lg text-sm outline-none w-64" style={inputStyle} />
        </div>
        {/* Filtros rápidos por status */}
        <button onClick={() => setFStatus('')} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={fStatus === '' ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Todos</button>
        {STATUS.map(s => (
          <button key={s.v} onClick={() => setFStatus(f => f === s.v ? '' : s.v)} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={fStatus === s.v ? { background: s.bg, color: s.fg, border: `1px solid ${s.fg}` } : { color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{s.l}</button>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
            <th className="text-left px-4 py-2.5 text-xs font-semibold">Empresa</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold">CNPJ/CPF</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold">Status comercial</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold">Executivo</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold">Ficha</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Carregando…</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhuma empresa.</td></tr>
            : filtered.map(c => { const si = statusInfo(c.crm_status); return (
              <tr key={c.id} onClick={() => open(c)} className="cursor-pointer hover:bg-[var(--surface-hover)]" style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>{c.name}{c.company_name && <span className="block text-[11px]" style={{ color: 'var(--text-light)' }}>{c.company_name}</span>}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{c.cgc}</td>
                <td className="px-4 py-3"><span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: si.bg, color: si.fg }}>{si.l}</span></td>
                <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{c.executive?.name ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={e => { e.stopPropagation(); router.push(`/empresas/${c.id}/360`) }} className="text-[11px] px-2 py-1 rounded-lg font-semibold inline-flex items-center gap-1" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }} title="Visão 360°">
                    <LayoutDashboard size={12} /> 360°
                  </button>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {sel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setSel(null)}>
          <div className="w-full max-w-xl rounded-2xl p-5 max-h-[92vh] overflow-y-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{sel.name} — perfil comercial</h2>
              <button onClick={() => setSel(null)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Status comercial</label>
                <select value={crmStatus} onChange={e => setCrmStatus(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                  {STATUS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  CNPJ / CPF {['cliente', 'em_renovacao'].includes(crmStatus) && <span style={{ color: 'var(--danger-border)' }}>* obrigatório p/ cliente</span>}
                </label>
                <input value={cgc} onChange={e => setCgc(e.target.value)} placeholder="Opcional para lead/prospect" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([['region', 'Região'], ['segment', 'Segmento'], ['porte', 'Porte'], ['erp_atual', 'ERP atual'], ['indicacao', 'Indicação / origem']] as [keyof CrmProfile, string][]).map(([k, l]) => (
                  <div key={k}>
                    <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{l}</label>
                    {k === 'segment' ? (
                      <select value={(profile.segment as any) ?? ''} onChange={e => setP('segment', e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                        <option value="">—</option>
                        {profile.segment && !segmentos.some(s => s.name === profile.segment) && <option value={profile.segment}>{profile.segment}</option>}
                        {segmentos.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>
                    ) : (
                      <input value={(profile[k] as any) ?? ''} onChange={e => setP(k, e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                    )}
                  </div>
                ))}
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Faturamento estimado (R$)</label>
                  <input type="number" step="0.01" value={(profile.faturamento_estimado as any) ?? ''} onChange={e => setP('faturamento_estimado', e.target.value === '' ? null : Number(e.target.value))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Nº de funcionários</label>
                  <input type="number" value={(profile.num_funcionarios as any) ?? ''} onChange={e => setP('num_funcionarios', e.target.value === '' ? null : Number(e.target.value))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Tags</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {allTags.filter(t => t.active !== false || tagIds.includes(t.id)).map(t => {
                    const on = tagIds.includes(t.id)
                    return <button key={t.id} type="button" onClick={() => setTagIds(ids => on ? ids.filter(i => i !== t.id) : [...ids, t.id])}
                      className="text-[11px] px-2 py-1 rounded-full font-medium"
                      style={on ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{t.name}</button>
                  })}
                </div>
                <div className="flex gap-2">
                  <input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createTag() } }} placeholder="Nova tag…" className="flex-1 px-3 py-1.5 rounded-lg text-xs outline-none" style={inputStyle} />
                  <button onClick={createTag} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>+ Tag</button>
                </div>
              </div>

              {/* Vínculos + timeline única (comercial ↔ operação) */}
              <div className="pt-3 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
                <label className="block text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Vínculos</label>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {([['oportunidades', 'Oportun.'], ['propostas', 'Propostas'], ['contratos', 'Contratos'], ['projetos', 'Projetos']] as [keyof Vinculos, string][]).map(([k, l]) => (
                    <div key={k} className="rounded-lg p-2 text-center" style={{ background: 'var(--surface-sunken)' }}>
                      <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--text)' }}>{vinculos ? vinculos[k] : '—'}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>{l}</p>
                    </div>
                  ))}
                </div>
                <label className="block text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Histórico (comercial + contratos)</label>
                {timeline.length === 0 ? (
                  <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem eventos registrados.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {timeline.map((t, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="mt-0.5 text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase shrink-0"
                          style={t.source === 'lead' ? { background: 'rgba(56,189,248,0.15)', color: '#38bdf8' }
                            : t.source === 'crm' ? { background: 'var(--primary-soft)', color: 'var(--primary)' }
                            : { background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                          {t.source === 'lead' ? 'Lead' : t.source === 'crm' ? 'CRM' : 'Contrato'}
                        </span>
                        <span className="flex-1" style={{ color: 'var(--text-muted)' }}>{evtLabel(t.type)}{t.label ? ` · ${t.label}` : ''}{t.user ? <span style={{ color: 'var(--text-light)' }}> · 👤 {t.user}</span> : ''}</span>
                        <span className="shrink-0 tabular-nums" style={{ color: 'var(--text-light)' }}>{t.when ? new Date(t.when).toLocaleDateString('pt-BR') : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3">
              <CustomFieldsSection urlContext="customers" entityId={sel.id} />
            </div>
            {(() => {
              // Empresa com vínculos = cliente de verdade → não exclui (o BE também bloqueia).
              const locked = !!vinculos && (vinculos.contratos > 0 || vinculos.oportunidades > 0)
              return (
                <div className="flex items-center gap-2 mt-5">
                  {locked ? (
                    <span className="text-[11px] inline-flex items-center gap-1" style={{ color: 'var(--text-light)' }}>
                      <Trash2 size={12} /> Cliente com vínculos (contrato/oportunidade) — não pode ser excluída.
                    </span>
                  ) : (
                    <button onClick={deleteEmpresa} disabled={deleting} className="px-3 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5"
                      style={{ color: 'var(--danger)', border: '1px solid var(--danger)' }} title="Excluir empresa">
                      <Trash2 size={14} /> {deleting ? 'Excluindo…' : 'Excluir'}
                    </button>
                  )}
                  <div className="flex-1" />
                  <button onClick={() => setSel(null)} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
                  <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saving ? 'Salvando…' : 'Salvar'}</button>
                </div>
              )
            })()}
          </div>
        </div>
      )}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Nova empresa</h2>
              <button onClick={() => setShowCreate(false)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Nome / Razão social *</label>
                <input value={newEmp.name} onChange={e => setNewEmp(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Nome fantasia</label>
                <input value={newEmp.company_name} onChange={e => setNewEmp(f => ({ ...f, company_name: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>CNPJ/CPF</label>
                  <input value={newEmp.cgc} onChange={e => setNewEmp(f => ({ ...f, cgc: e.target.value }))} placeholder="opcional" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Status comercial</label>
                  <select value={newEmp.crm_status} onChange={e => setNewEmp(f => ({ ...f, crm_status: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                    {STATUS.filter(s => s.v === 'lead' || s.v === 'prospect').map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Só é possível incluir como <b>Lead</b> ou <b>Prospect</b> — clientes nascem da <b>conversão do lead</b>, não são criados aqui.</p>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={createEmpresa} disabled={creating} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{creating ? 'Incluindo…' : 'Incluir'}</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
