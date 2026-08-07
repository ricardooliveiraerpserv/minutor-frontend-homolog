'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { ArrowLeft, X, Plus, Check, Clock, AlertTriangle, Trophy, FileDown, Trash2, Building2, Package, ListChecks, History as HistoryIcon, FileText, Paperclip, Star } from 'lucide-react'

interface Task { id: number; tipo: string; titulo: string | null; data: string | null; prioridade?: string; concluida_at: string | null; categoria?: string | null; responsavel?: { name: string } | null }
interface Evt { id: number; event_type: string; from_value: string | null; to_value: string | null; created_at: string; triggered_by?: { name: string } | null }
interface Product { id: number; name: string; origem?: string | null; pivot: { quantidade: number | string; valor: number | string; custo?: number | string | null } }
interface OppFull {
  id: number; title: string; valor: number | string; status: string; stage_id: number
  stage?: { id: number; name: string }; pipeline?: { name: string }
  descricao?: string | null; proxima_acao?: string | null; proxima_acao_at?: string | null; previsao_fechamento?: string | null
  probabilidade?: number; valor_ponderado?: number; forecast_categoria?: string | null; dias_na_etapa?: number
  saude?: { status: string; motivos: string[]; diagnostico: string }
  qualificacao?: string | null; detalhes?: Record<string, any> | null
  products?: Product[]; tasks?: Task[]; events?: Evt[]
  contato?: { id: number; name: string; email?: string | null; phone?: string | null; whatsapp?: string | null } | null
  responsavel?: { id: number; name: string } | null
  customer?: { id: number; name: string; cgc?: string | null } | null
  contract_id?: number | null
}
interface ContactType { id: number; nome: string; slug: string }
interface Proposal { id: number; numero?: string; versao?: number; total?: number; valor?: number; status: string; data_validade?: string | null; document_id?: number | null }
interface Attachment { id: number; original_name?: string; file_name?: string; mime_type?: string }

const num = (x: any) => Number(x) || 0
const fmtBRL = (n: any) => num(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (s: string | null | undefined) => s ? new Date(s).toLocaleDateString('pt-BR') : '—'
const fmtDateHora = (s: string | null | undefined) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const SAUDE: Record<string, { l: string; c: string; b: string }> = {
  saudavel: { l: 'Saudável', c: '#16a34a', b: 'rgba(34,197,94,.15)' },
  atencao: { l: 'Atenção', c: '#f59e0b', b: 'rgba(245,158,11,.15)' },
  em_risco: { l: 'Em risco', c: 'var(--danger-border)', b: 'var(--danger-bg)' },
}
const STATUS_INFO: Record<string, { l: string; c: string; b: string }> = {
  aberto: { l: 'Em andamento', c: '#0ea5e9', b: 'rgba(14,165,233,.14)' },
  ganho: { l: 'Ganho', c: '#16a34a', b: 'rgba(34,197,94,.15)' },
  perdido: { l: 'Perdido', c: 'var(--danger-border)', b: 'var(--danger-bg)' },
}
const FORECAST_CAT: [string, string][] = [['', '— categoria'], ['commit', 'Comprometido'], ['best_case', 'Melhor cenário'], ['pipeline', 'Pipeline'], ['omitido', 'Omitido']]
const EVT_LABEL: Record<string, string> = {
  created: 'Criada', stage_changed: 'Mudou de etapa', valor_alterado: 'Valor alterado', probabilidade_alterada: 'Probabilidade alterada',
  previsao_alterada: 'Previsão alterada', parada_alterada: 'Motivo da parada', task_done: 'Tarefa concluída', task_reopened: 'Tarefa reaberta',
  task_updated: 'Tarefa editada', note: 'Nota', won: 'Ganha', lost: 'Perdida', converted: 'Convertida em contrato',
  automacao: 'Automação', automacao_erro: 'Falha em automação', qualificado: 'Qualificado', product_added: 'Produto adicionado', product_removed: 'Produto removido',
}
const evtLabel = (t: string) => EVT_LABEL[t] ?? (t ? t.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : t)
const atrasada = (t: Task) => !t.concluida_at && !!t.data && new Date(t.data) < new Date()

function Row({ l, v }: { l: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2 text-xs"><span style={{ color: 'var(--text-light)' }}>{l}</span><span className="text-right" style={{ color: 'var(--text)' }}>{v}</span></div>
}

/** Detalhe rico da oportunidade. Reutilizável: página inteira (`onClose` ausente) ou modal grande (`onClose`). */
export function OportunidadeDetalhe({ id, onClose, initialTab = 'atividades' }: { id: number; onClose?: () => void; initialTab?: 'atividades' | 'historico' | 'propostas' | 'anexos' }) {
  const router = useRouter()
  const [o, setO] = useState<OppFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'atividades' | 'historico' | 'propostas' | 'anexos'>(initialTab)
  const [cTypes, setCTypes] = useState<ContactType[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [atts, setAtts] = useState<Attachment[]>([])

  const load = useCallback(() => api.get<{ data: OppFull }>(`/crm/opportunities/${id}`).then(r => setO(r?.data ?? null)).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false)), [id])
  useEffect(() => { load() }, [load])
  useEffect(() => { api.get<{ data: ContactType[] }>('/crm/contact-types').then(r => setCTypes(r?.data ?? [])).catch(() => {}) }, [])
  const loadProps = useCallback(() => api.get<{ data: Proposal[] }>(`/crm/proposals?opportunity_id=${id}`).then(r => setProposals(r?.data ?? [])).catch(() => {}), [id])
  const loadAtts = useCallback(() => api.get<{ data: Attachment[] }>(`/crm/opportunities/${id}/attachments`).then(r => setAtts(r?.data ?? [])).catch(() => {}), [id])
  useEffect(() => { if (tab === 'propostas') loadProps(); if (tab === 'anexos') loadAtts() }, [tab, loadProps, loadAtts])

  const patch = async (body: Record<string, any>) => { try { await api.put(`/crm/opportunities/${id}`, body); load() } catch (e: any) { toast.error(e?.message ?? 'Erro ao salvar') } }

  // Pesquisa de qualificação (dirige a previsibilidade automática). Sincroniza quando a oportunidade carrega.
  const [q, setQ] = useState({ estrelas: 3, aceite: false, necessidade: false, decisor: false, champion: false, budget_confirmado: false })
  const [qOpen, setQOpen] = useState(false)
  useEffect(() => {
    if (!o) return
    const r = (o.detalhes?.qualificacao_report ?? {}) as any
    setQ({ estrelas: r.estrelas ?? 3, aceite: !!r.aceite_executivos, necessidade: !!r.necessidade, decisor: !!o.detalhes?.decisor, champion: !!o.detalhes?.champion, budget_confirmado: !!o.detalhes?.budget_confirmado })
  }, [o?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const saveQual = async () => {
    try { await api.put(`/crm/opportunities/${id}/qualificacao`, { estrelas: q.estrelas, aceite_executivos: q.aceite, necessidade: q.necessidade, decisor: q.decisor, champion: q.champion, budget_confirmado: q.budget_confirmado }); setQOpen(false); load(); toast.success('Pesquisa atualizada') } catch { toast.error('Erro ao salvar pesquisa') }
  }

  const [nt, setNt] = useState({ tipo: '', titulo: '', data: '' })
  const addTask = async () => {
    if (!nt.titulo.trim() && !nt.tipo) { toast.error('Descreva a atividade'); return }
    try {
      await api.post('/crm/tasks', { opportunity_id: id, tipo: nt.tipo || (cTypes[0]?.slug ?? 'ligacao'), titulo: nt.titulo.trim() || null, data: nt.data ? new Date(nt.data).toISOString() : null })
      setNt({ tipo: '', titulo: '', data: '' }); load(); toast.success('Atividade adicionada')
    } catch { toast.error('Erro ao adicionar atividade') }
  }
  const toggleTask = async (t: Task) => { try { await api.patch(`/crm/tasks/${t.id}/complete`, { done: !t.concluida_at }); load() } catch { toast.error('Erro') } }

  const setPropStatus = async (p: Proposal, status: string) => { try { await api.put(`/crm/proposals/${p.id}`, { status }); loadProps() } catch { toast.error('Erro') } }
  const delProp = async (p: Proposal) => { if (!confirm('Excluir proposta?')) return; try { await api.delete(`/crm/proposals/${p.id}`); loadProps() } catch { toast.error('Erro') } }
  const novaProposta = async () => {
    try { const r = await api.post<{ data: { id: number } }>('/crm/proposals', { opportunity_id: id, tipo: 'bh_fixo', modo_faturamento: 'por_hora', inputs: {} }); if (r?.data?.id) router.push(`/crm/propostas/${r.data.id}`) } catch { toast.error('Erro ao criar proposta') }
  }
  const gerarPdf = async (p: Proposal) => { try { const r = await api.post<{ data: { document_id: number } }>(`/crm/proposals/${p.id}/gerar`, {}); const did = r?.data?.document_id; if (did) window.open(`/api/v1/documents/${did}/download`, '_blank') } catch { toast.error('Erro ao gerar PDF') } }

  const upload = async (f: File) => { const fd = new FormData(); fd.append('file', f); try { await api.post(`/crm/opportunities/${id}/attachments`, fd); loadAtts() } catch { toast.error('Erro no upload') } }
  const delAtt = async (a: Attachment) => { try { await api.delete(`/crm/opportunities/${id}/attachments/${a.id}`); loadAtts() } catch { toast.error('Erro') } }

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  const back = onClose ?? (() => router.back())

  if (loading) return <p style={{ color: 'var(--text-light)' }}>Carregando…</p>
  if (!o) return <p style={{ color: 'var(--text-light)' }}>Oportunidade não encontrada.</p>

  const st = STATUS_INFO[o.status] ?? STATUS_INFO.aberto
  const sd = o.saude ? SAUDE[o.saude.status] : null
  const tasks = o.tasks ?? []
  const abertas = tasks.filter(t => !t.concluida_at).sort((a, b) => (a.data ?? '').localeCompare(b.data ?? ''))
  const feitas = tasks.filter(t => t.concluida_at).sort((a, b) => (b.concluida_at ?? '').localeCompare(a.concluida_at ?? ''))
  const events = [...(o.events ?? [])].reverse()
  const prods = o.products ?? []
  const totReceita = prods.reduce((s, p) => s + num(p.pivot.quantidade) * num(p.pivot.valor), 0)
  const totCusto = prods.reduce((s, p) => s + num(p.pivot.quantidade) * num(p.pivot.custo), 0)
  const totMargem = totReceita - totCusto
  const tipoNome = (slug: string) => cTypes.find(c => c.slug === slug)?.nome ?? slug
  const paAtrasada = !!o.proxima_acao_at && new Date(o.proxima_acao_at) < new Date()
  const rep = (o.detalhes?.qualificacao_report ?? null) as any
  const QK: ['necessidade' | 'decisor' | 'champion' | 'budget_confirmado', string][] = [['necessidade', 'Necessidade'], ['decisor', 'Decisor'], ['champion', 'Champion'], ['budget_confirmado', 'Budget']]

  const TABS: [typeof tab, string, any][] = [['atividades', 'Atividades', ListChecks], ['historico', 'Histórico', HistoryIcon], ['propostas', 'Propostas', FileText], ['anexos', 'Anexos', Paperclip]]

  return (
    <>
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="min-w-0">
          <button onClick={back} className="flex items-center gap-1 text-xs mb-1" style={{ color: 'var(--text-muted)' }}><ArrowLeft size={13} /> {onClose ? 'Fechar' : 'Voltar'}</button>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{o.title}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {o.customer && <button onClick={() => router.push(`/empresas/${o.customer!.id}/360`)} className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}><Building2 size={13} /> {o.customer.name}</button>}
            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: st.b, color: st.c }}>{st.l}</span>
            {o.stage && <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{o.stage.name}</span>}
            {sd && <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: sd.b, color: sd.c }}>● {sd.l}</span>}
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text)' }}>{fmtBRL(o.valor)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {o.contract_id
            ? <span className="text-xs inline-flex items-center gap-1 px-3 py-2 rounded-lg" style={{ background: 'rgba(34,197,94,.12)', color: '#16a34a' }}><Trophy size={14} /> Contrato #{o.contract_id}</span>
            : <button onClick={novaProposta} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><FileText size={16} /> Nova proposta</button>}
          {onClose && <button onClick={onClose} className="p-2 rounded-lg" style={{ color: 'var(--text-muted)' }} title="Fechar"><X size={18} /></button>}
        </div>
      </div>

      {/* Próxima ação em destaque */}
      <div className="rounded-xl p-3 mb-4 flex items-center gap-2 flex-wrap" style={{ background: paAtrasada ? 'var(--danger-bg)' : 'var(--surface-sunken)' }}>
        <Clock size={16} style={{ color: paAtrasada ? 'var(--danger-border)' : 'var(--primary)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Próxima ação:</span>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{o.proxima_acao || '—'}</span>
        <span className="text-xs" style={{ color: 'var(--text-light)' }}>· {fmtDateHora(o.proxima_acao_at)}</span>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(300px,360px)' }}>
        {/* PRINCIPAL: atividades + histórico em foco */}
        <div className="min-w-0">
          <div className="flex gap-1 mb-4 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
            {TABS.map(([k, l, Ic]) => (
              <button key={k} onClick={() => setTab(k)} className="px-3 py-2 text-sm font-semibold -mb-px inline-flex items-center gap-1.5" style={tab === k ? { color: 'var(--primary)', borderBottom: '2px solid var(--primary)' } : { color: 'var(--text-muted)', borderBottom: '2px solid transparent' }}>
                <Ic size={14} /> {l}{k === 'atividades' && abertas.length > 0 ? ` (${abertas.length})` : ''}
              </button>
            ))}
          </div>

          {tab === 'atividades' && (
            <div className="space-y-4">
              <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex gap-2 flex-wrap items-end">
                  <div className="flex-1 min-w-40">
                    <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Atividade</label>
                    <input value={nt.titulo} onChange={e => setNt(f => ({ ...f, titulo: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') addTask() }} placeholder="Ex.: Ligar para alinhar escopo" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Tipo</label>
                    <select value={nt.tipo} onChange={e => setNt(f => ({ ...f, tipo: e.target.value }))} className="px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                      <option value="">Tipo…</option>
                      {cTypes.map(c => <option key={c.id} value={c.slug}>{c.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Prazo</label>
                    <input type="datetime-local" value={nt.data} onChange={e => setNt(f => ({ ...f, data: e.target.value }))} className="px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                  </div>
                  <button onClick={addTask} className="px-3 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Adicionar</button>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>A fazer ({abertas.length})</h3>
                {abertas.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Nenhuma atividade pendente. 🎉</p> : (
                  <div className="space-y-1.5">
                    {abertas.map(t => (
                      <div key={t.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5" style={{ background: 'var(--surface)', border: `1px solid ${atrasada(t) ? 'var(--danger-border)' : 'var(--border)'}` }}>
                        <button onClick={() => toggleTask(t)} title="Concluir" className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center" style={{ border: '1.5px solid var(--border)' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{t.titulo || tipoNome(t.tipo)}</p>
                          <p className="text-[11px]" style={{ color: atrasada(t) ? 'var(--danger-border)' : 'var(--text-light)' }}>
                            {tipoNome(t.tipo)}{t.data ? ` · ${fmtDateHora(t.data)}` : ''}{atrasada(t) ? ' · atrasada' : ''}{t.responsavel ? ` · 👤 ${t.responsavel.name}` : ''}
                          </p>
                        </div>
                        {atrasada(t) && <AlertTriangle size={15} style={{ color: 'var(--danger-border)' }} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {feitas.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-light)' }}>Concluídas ({feitas.length})</h3>
                  <div className="space-y-1">
                    {feitas.slice(0, 20).map(t => (
                      <div key={t.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2" style={{ background: 'var(--surface-sunken)' }}>
                        <button onClick={() => toggleTask(t)} title="Reabrir" className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center" style={{ background: '#16a34a' }}><Check size={12} style={{ color: '#fff' }} /></button>
                        <span className="flex-1 text-sm truncate" style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>{t.titulo || tipoNome(t.tipo)}</span>
                        <span className="text-[11px] shrink-0" style={{ color: 'var(--text-light)' }}>{fmtDate(t.concluida_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'historico' && (
            <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {events.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Sem eventos registrados.</p> : (
                <div className="space-y-2.5">
                  {events.map(e => (
                    <div key={e.id} className="flex items-start gap-2.5 text-xs">
                      <span className="w-20 shrink-0 tabular-nums" style={{ color: 'var(--text-light)' }}>{fmtDateHora(e.created_at)}</span>
                      <span className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: 'var(--primary)' }} />
                      <span className="flex-1" style={{ color: 'var(--text-muted)' }}>
                        <b style={{ color: 'var(--text)' }}>{evtLabel(e.event_type)}</b>
                        {e.to_value ? ` · ${e.to_value}` : ''}{e.triggered_by ? <span style={{ color: 'var(--text-light)' }}> · 👤 {e.triggered_by.name}</span> : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'propostas' && (
            <div className="space-y-2">
              <div className="flex justify-end"><button onClick={novaProposta} className="text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>+ Nova proposta</button></div>
              {proposals.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Nenhuma proposta.</p> : proposals.map(p => (
                <div key={p.id} className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <button onClick={() => router.push(`/crm/propostas/${p.id}`)} className="flex-1 text-left text-sm font-medium" style={{ color: 'var(--primary)' }}>{p.numero ?? `Proposta #${p.id}`}{p.versao ? ` v${p.versao}` : ''}</button>
                  <span className="text-sm tabular-nums" style={{ color: 'var(--text)' }}>{fmtBRL(p.total ?? p.valor)}</span>
                  <select value={p.status} onChange={e => setPropStatus(p, e.target.value)} className="text-[11px] rounded px-1.5 py-1 outline-none" style={inputStyle}>
                    {['em_elaboracao', 'enviada', 'em_negociacao', 'aprovada', 'reprovada', 'expirada', 'cancelada'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => gerarPdf(p)} className="p-1.5 rounded" title="PDF" style={{ color: 'var(--text-muted)' }}><FileDown size={14} /></button>
                  <button onClick={() => delProp(p)} className="p-1.5 rounded" title="Excluir" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {tab === 'anexos' && (
            <div className="space-y-2">
              <label className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold cursor-pointer" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                <Plus size={13} /> Anexar arquivo
                <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
              </label>
              {atts.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-light)' }}>Nenhum anexo.</p> : atts.map(a => (
                <div key={a.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <Paperclip size={13} style={{ color: 'var(--text-light)' }} />
                  <a href={`/api/v1/crm/opportunities/${id}/attachments/${a.id}/download`} target="_blank" rel="noreferrer" className="flex-1 text-sm truncate" style={{ color: 'var(--primary)' }}>{a.original_name ?? a.file_name ?? `Anexo ${a.id}`}</a>
                  <button onClick={() => delAtt(a)} className="p-1 rounded" style={{ color: 'var(--danger)' }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* LATERAL */}
        <div className="space-y-4 self-start">
          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <label className="block text-[10px] uppercase tracking-wider font-bold mb-1.5" style={{ color: 'var(--text-light)' }}>Descrição</label>
            <textarea key={`d${o.id}`} defaultValue={o.descricao ?? ''} onBlur={e => { if (e.target.value !== (o.descricao ?? '')) patch({ descricao: e.target.value }) }} rows={3} className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y" style={inputStyle} />
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div>
                <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Valor (R$)</label>
                <input key={`v${o.id}-${o.valor}`} type="number" step="0.01" defaultValue={String(o.valor)} onBlur={e => { if (e.target.value !== String(o.valor)) patch({ valor: e.target.value === '' ? 0 : Number(e.target.value) }) }} className="w-full px-3 py-2 rounded-lg text-sm outline-none text-right tabular-nums" style={inputStyle} />
              </div>
              <div>
                <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Previsão</label>
                <input key={`pf${o.id}`} type="date" defaultValue={o.previsao_fechamento ?? ''} onBlur={e => { if (e.target.value !== (o.previsao_fechamento ?? '')) patch({ previsao_fechamento: e.target.value || null }) }} className="w-full px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <label className="block text-[10px] uppercase tracking-wider font-bold mb-1.5" style={{ color: 'var(--text-light)' }}>Próxima ação</label>
            <input key={`pa${o.id}`} defaultValue={o.proxima_acao ?? ''} onBlur={e => { if (e.target.value !== (o.proxima_acao ?? '')) patch({ proxima_acao: e.target.value }) }} placeholder="O que fazer a seguir" className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-2" style={inputStyle} />
            <input key={`pad${o.id}`} type="date" defaultValue={o.proxima_acao_at ? o.proxima_acao_at.slice(0, 10) : ''} onBlur={e => { if (e.target.value !== (o.proxima_acao_at?.slice(0, 10) ?? '')) patch({ proxima_acao_at: e.target.value || null }) }} className="w-full px-2 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
          </div>

          {/* Pesquisa de qualificação → dirige a previsibilidade automática */}
          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text-light)' }}>Qualificação (pesquisa)</h3>
              <button onClick={() => setQOpen(v => !v)} className="text-[11px] font-semibold" style={{ color: 'var(--primary)' }}>{qOpen ? 'Cancelar' : 'Atualizar'}</button>
            </div>
            {!qOpen ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex gap-0.5">{[1, 2, 3, 4, 5].map(n => <Star key={n} size={15} style={{ color: (rep?.estrelas ?? 0) >= n ? '#f59e0b' : 'var(--border)' }} fill={(rep?.estrelas ?? 0) >= n ? '#f59e0b' : 'none'} />)}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{o.qualificacao ?? 'sem pesquisa'}</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" onClick={() => setQ(s => ({ ...s, estrelas: n }))}><Star size={22} style={{ color: q.estrelas >= n ? '#f59e0b' : 'var(--border)' }} fill={q.estrelas >= n ? '#f59e0b' : 'none'} /></button>)}
                  <span className="text-[11px] ml-1 font-semibold" style={{ color: 'var(--text-muted)' }}>{q.estrelas * 20}%</span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {QK.map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setQ(s => ({ ...s, [k]: !s[k] }))} className="flex items-center gap-1 px-2 py-1 rounded text-[11px]" style={q[k] ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{q[k] ? <Check size={11} /> : null}{l}</button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text)' }}><input type="checkbox" checked={q.aceite} onChange={e => setQ(s => ({ ...s, aceite: e.target.checked }))} /> Aceito pelos executivos</label>
                <button onClick={saveQual} className="w-full px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Salvar pesquisa</button>
              </div>
            )}
          </div>

          <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text-light)' }}>Previsibilidade <span className="normal-case font-normal" style={{ color: 'var(--text-light)' }}>(automática)</span></h3>
            <Row l="Probabilidade" v={<b style={{ color: 'var(--primary)' }}>{o.probabilidade ?? 0}%</b>} />
            <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>Calculada pela etapa do funil + a pesquisa de qualificação.</p>
            <Row l="Valor ponderado" v={fmtBRL(o.valor_ponderado)} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs" style={{ color: 'var(--text-light)' }}>Categoria forecast</span>
              <select value={o.forecast_categoria ?? ''} onChange={e => patch({ forecast_categoria: e.target.value || null })} className="text-[11px] rounded px-1.5 py-1 outline-none" style={inputStyle}>
                {FORECAST_CAT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <Row l="Tempo na etapa" v={`${o.dias_na_etapa ?? 0} dias`} />
            {o.saude && sd && (
              <div className="rounded-lg p-2 mt-1" style={{ background: sd.b }}>
                <p className="text-[11px] font-semibold" style={{ color: sd.c }}>● {sd.l}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{o.saude.diagnostico}</p>
              </div>
            )}
          </div>

          {prods.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1" style={{ color: 'var(--text-light)' }}><Package size={12} /> Produtos</h3>
                <span className="text-[11px] font-semibold" style={{ color: totMargem >= 0 ? '#16a34a' : 'var(--danger-border)' }}>Margem {fmtBRL(totMargem)}</span>
              </div>
              <div className="space-y-1">
                {prods.map(p => {
                  const rec = num(p.pivot.quantidade) * num(p.pivot.valor), cus = num(p.pivot.quantidade) * num(p.pivot.custo)
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate" style={{ color: 'var(--text)' }}>{p.name}</span>
                      <span className="tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>{fmtBRL(rec)}<span style={{ color: 'var(--text-light)' }}> · m {fmtBRL(rec - cus)}</span></span>
                    </div>
                  )
                })}
              </div>
              <div className="flex justify-between text-[11px] mt-2 pt-2" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <span>Σ receita {fmtBRL(totReceita)} · custo {fmtBRL(totCusto)}</span>
              </div>
            </div>
          )}

          <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text-light)' }}>Envolvidos</h3>
            {o.contato && <div className="text-xs"><span style={{ color: 'var(--text-light)' }}>Contato: </span><span style={{ color: 'var(--text)' }}>{o.contato.name}</span>{o.contato.email && <span style={{ color: 'var(--text-light)' }}> · {o.contato.email}</span>}</div>}
            <Row l="Responsável" v={o.responsavel?.name ?? '—'} />
            {o.customer?.cgc && <Row l="CNPJ/CPF" v={o.customer.cgc} />}
          </div>
        </div>
      </div>
    </>
  )
}
