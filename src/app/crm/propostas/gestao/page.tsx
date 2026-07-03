'use client'

// Gestão operacional Proposal-Centric — Kanban das propostas por status + drawer 4 abas.
// Sem dashboards/métricas: foco em ACOMPANHAR o ciclo e achar gargalos/paradas.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { api, apiMessage } from '@/lib/api'
import { useAsyncAction } from '@/hooks/use-async-action'
import { X, Lock, AlertTriangle, Search } from 'lucide-react'
import { ContractFormModal } from '@/components/contracts/ContractFormModal'
import { buildWonPrefill, criarCardsCloud, criarSubprojeto } from '@/app/crm/pipeline/page'

interface Card { id: number; codigo: string; status: string; cliente: string | null; customer_id: number | null; valor: number; vendedor: string | null; vendedor_id: number | null; atualizado_em: string | null; dias_parada: number; versao: number; bloqueada: boolean; revisoes_pendentes?: number; ciclo_dias?: number | null; engajamento?: number; prontidao?: { score: number; classificacao: string } | null }
const PRONT_LABEL: Record<string, string> = { 'Pronta para conversão': 'Pronta', 'Próxima do fechamento': 'Próxima', 'Em evolução': 'Em evolução', 'Risco': 'Risco' }
const engDot = (s?: number) => (s == null ? '' : s >= 81 ? '🟢' : s >= 51 ? '🟡' : '🔴')
interface Board { propostas: Card[]; cards: Record<string, number>; paradas: { d7: number; d15: number; d30: number } }

const COLS: { k: string; label: string }[] = [
  { k: 'em_elaboracao', label: 'Em Elaboração' }, { k: 'enviada', label: 'Enviada' },
  { k: 'em_analise', label: 'Em Análise' }, { k: 'em_negociacao', label: 'Em Negociação' },
  { k: 'em_revisao', label: 'Em Revisão' }, { k: 'aprovada', label: 'Aprovada' },
  { k: 'aguardando_assinatura', label: 'Aguard. Assinatura' }, { k: 'assinada', label: 'Assinada' },
  { k: 'convertida', label: 'Convertida' },
]
const COL_COLOR: Record<string, string> = { em_elaboracao: '#71717a', enviada: '#0ea5e9', em_analise: '#6366f1', em_negociacao: '#8b5cf6', em_revisao: '#a855f7', aprovada: '#3b82f6', aguardando_assinatura: '#f59e0b', assinada: '#0891b2', liberada: '#14b8a6', convertida: '#16a34a' }
const money = (v: number) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (iso?: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const minLabel = (min?: number | null) => { if (min == null) return '—'; if (min < 60) return `${min} min`; const h = Math.floor(min / 60), m = min % 60; return m ? `${h}h ${m}m` : `${h}h` }
const secToMin = (sec?: number | null) => (sec == null || sec <= 0) ? '' : (sec < 60 ? `${sec}s` : `${Math.round(sec / 60)} min`)

export default function GestaoPropostas() {
  const [board, setBoard] = useState<Board | null>(null)
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fBloq, setFBloq] = useState(false)
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [sel, setSel] = useState<Card | null>(null)
  const [conteudoOpen, setConteudoOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (fStatus) p.set('status', fStatus)
    if (fBloq) p.set('bloqueadas', '1')
    if (de) p.set('de', de)
    if (ate) p.set('ate', ate)
    api.get<{ data: Board }>(`/crm/proposals/board?${p.toString()}`).then(r => setBoard(r?.data ?? null)).catch(() => setBoard(null)).finally(() => setLoading(false))
  }, [fStatus, fBloq, de, ate])
  useEffect(() => { load() }, [load])

  const propostas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const list = board?.propostas ?? []
    return q ? list.filter(c => (c.codigo + ' ' + (c.cliente ?? '') + ' ' + (c.vendedor ?? '')).toLowerCase().includes(q)) : list
  }, [board, busca])
  const porStatus = (k: string) => propostas.filter(c => c.status === k)
  const paradas = useMemo(() => propostas.filter(c => c.dias_parada > 7 && !['convertida', 'reprovada', 'cancelada', 'expirada'].includes(c.status)).sort((a, b) => b.dias_parada - a.dias_parada), [propostas])

  return (
    <AppLayout>
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Gestão de Propostas</h1>
          <button onClick={() => setConteudoOpen(true)} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface-sunken)', color: 'var(--text)', border: '1px solid var(--border)' }}>📊 Inteligência de Conteúdo</button>
        </div>
        {conteudoOpen && <ConteudoModal onClose={() => setConteudoOpen(false)} />}

        {/* Cards operacionais */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {[['Em Revisão', board?.cards.em_revisao ?? 0, '#a855f7'], ['Assinadas', board?.cards.assinada ?? 0, '#3b82f6'], ['Convertidas', board?.cards.convertida ?? 0, '#16a34a']].map(([label, n, c]: any) => (
            <div key={label} className="rounded-xl px-4 py-3" style={{ background: 'var(--surface)', border: `1px solid ${c}44` }}>
              <div className="text-[11px] font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>{label}</div>
              <div className="text-2xl font-bold mt-0.5" style={{ color: c }}>{n}</div>
            </div>
          ))}
        </div>

        {/* Paradas */}
        {board && (board.paradas.d7 + board.paradas.d15 + board.paradas.d30 > 0) && (
          <div className="rounded-xl px-4 py-2 mb-3 flex items-center gap-3 flex-wrap" style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning)' }}>
            <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'var(--warning)' }}><AlertTriangle size={13} /> Propostas paradas</span>
            <span className="text-xs" style={{ color: 'var(--text)' }}>&gt;7d: <b>{board.paradas.d7}</b></span>
            <span className="text-xs" style={{ color: 'var(--text)' }}>&gt;15d: <b>{board.paradas.d15}</b></span>
            <span className="text-xs" style={{ color: 'var(--text)' }}>&gt;30d: <b>{board.paradas.d30}</b></span>
          </div>
        )}

        {/* Filtros */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <Search size={13} style={{ color: 'var(--text-light)' }} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Código, cliente, responsável…" className="text-sm outline-none bg-transparent" style={{ color: 'var(--text)', width: 220 }} />
          </div>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="text-sm rounded-lg px-2 py-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <option value="">Todos os status</option>
            {COLS.map(c => <option key={c.k} value={c.k}>{c.label}</option>)}
          </select>
          <label className="text-sm flex items-center gap-1.5" style={{ color: 'var(--text)' }}><input type="checkbox" checked={fBloq} onChange={e => setFBloq(e.target.checked)} /> Retidas</label>
          <input type="date" value={de} onChange={e => setDe(e.target.value)} className="text-sm rounded-lg px-2 py-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <input type="date" value={ate} onChange={e => setAte(e.target.value)} className="text-sm rounded-lg px-2 py-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>

        {/* Kanban */}
        {loading ? <p style={{ color: 'var(--text-muted)' }}>Carregando…</p> : (
          <div className="flex gap-3 overflow-x-auto pb-3">
            {COLS.map(col => {
              const items = porStatus(col.k)
              return (
                <div key={col.k} className="shrink-0 w-[260px] rounded-xl p-2" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between px-1 mb-2">
                    <span className="text-xs font-bold" style={{ color: COL_COLOR[col.k] }}>{col.label}</span>
                    <span className="text-[10px] font-bold px-1.5 rounded-full" style={{ background: `${COL_COLOR[col.k]}22`, color: COL_COLOR[col.k] }}>{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map(c => (
                      <button key={c.id} onClick={() => setSel(c)} className="w-full text-left rounded-lg p-2.5" style={{ background: 'var(--surface)', border: `1px solid ${c.bloqueada ? 'var(--danger)' : 'var(--border)'}` }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold" style={{ color: 'var(--primary)' }}>{c.codigo}</span>
                          {c.bloqueada && <Lock size={11} style={{ color: 'var(--danger)' }} />}
                        </div>
                        <div className="text-xs truncate" style={{ color: 'var(--text)' }}>{c.cliente ?? '—'}</div>
                        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{money(c.valor)}{c.vendedor ? ` · ${c.vendedor}` : ''}</div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px]" style={{ color: c.dias_parada > 15 ? 'var(--danger)' : c.dias_parada > 7 ? 'var(--warning)' : 'var(--text-light)' }}>{c.dias_parada}d nesta etapa</span>
                          <div className="flex items-center gap-1.5">
                            {(c.revisoes_pendentes ?? 0) > 0 && <span className="text-[10px] font-bold px-1.5 rounded-full" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }} title="Revisões pendentes">💬 {c.revisoes_pendentes}</span>}
                            <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>v{c.versao}</span>
                          </div>
                        </div>
                        {(c.engajamento != null || c.prontidao) && (
                          <div className="flex items-center justify-between mt-1 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                            <span className="text-[10px]" title={`Engajamento ${c.engajamento ?? 0}/100`}>{engDot(c.engajamento)} <span style={{ color: 'var(--text-light)' }}>eng {c.engajamento ?? 0}</span></span>
                            {c.prontidao && <span className="text-[9px] font-bold px-1.5 rounded-full" style={{ background: c.prontidao.score >= 81 ? 'var(--success-bg)' : c.prontidao.score >= 61 ? 'var(--primary-soft)' : c.prontidao.score >= 31 ? 'var(--warning-bg)' : 'var(--danger-bg)', color: c.prontidao.score >= 81 ? 'var(--success)' : c.prontidao.score >= 61 ? 'var(--primary)' : c.prontidao.score >= 31 ? 'var(--warning)' : 'var(--danger)' }} title={`Prontidão ${c.prontidao.score}/100`}>{PRONT_LABEL[c.prontidao.classificacao] ?? c.prontidao.classificacao}</span>}
                          </div>
                        )}
                      </button>
                    ))}
                    {!items.length && <div className="text-[11px] text-center py-2" style={{ color: 'var(--text-light)' }}>—</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {sel && <Drawer card={sel} onClose={() => setSel(null)} onChanged={load} />}
    </AppLayout>
  )
}

function Drawer({ card, onClose, onChanged }: { card: Card; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<'comercial' | 'participantes' | 'revisoes' | 'liberacao' | 'juridica'>(card.status === 'em_revisao' ? 'revisoes' : 'liberacao')
  const [eng, setEng] = useState<any>(null)
  const [ana, setAna] = useState<any>(null)
  const [lib, setLib] = useState<any>(null)
  const [parts, setParts] = useState<any[]>([])
  const [threads, setThreads] = useState<any[]>([])
  const [revSummary, setRevSummary] = useState<any>(null)
  const [reply, setReply] = useState<Record<number, string>>({})
  const [fbComment, setFbComment] = useState('')
  const [lossReasons, setLossReasons] = useState<{ id: number; name: string }[]>([])
  const [perda, setPerda] = useState<{ status: string; loss_reason_id: string; observacao: string }>({ status: 'reprovada', loss_reason_id: '', observacao: '' })
  const [np, setNp] = useState<{ name: string; email: string; roles: string[] }>({ name: '', email: '', roles: [] })
  const [contract, setContract] = useState<{ prefill: any; prefillContacts: any[]; opportunityId?: number } | null>(null)
  const router = useRouter()
  const id = card.id

  // Gerar contrato pelo MESMO modal padrão do Pipeline/Kanban (ContractFormModal), pré-preenchido pela proposta.
  // Workflow — geração de contrato (Cat B, espera servidor). useAsyncAction (concorrência) + apiMessage.
  const gerarContratoAction = useAsyncAction(async () => {
    const det = await api.get<{ data: any }>(`/crm/proposals/${id}`).then(r => r?.data)
    const oppId = det?.opportunity_id
    if (oppId) {
      const opp = await api.get<{ data: any }>(`/crm/opportunities/${oppId}`).then(r => r?.data)
      const { prefill, prefillContacts } = await buildWonPrefill(opp)
      if (await criarCardsCloud(oppId, prefill, prefillContacts, aposContrato)) return
      if (await criarSubprojeto(oppId, prefill, prefillContacts, aposContrato)) return
      setContract({ prefill, prefillContacts, opportunityId: oppId })
    } else {
      setContract({ prefill: { customer_id: card.customer_id ? String(card.customer_id) : '', project_name: card.codigo, valor_projeto: String(card.valor || '') }, prefillContacts: [] })
    }
  }, { onError: e => toast.error(apiMessage(e, 'Erro ao preparar contrato')) })
  const gerarContrato = () => gerarContratoAction.run()
  // Após criar o contrato pelo modal, marca a proposta como CONVERTIDA (gerar contrato = liberada).
  const aposContrato = async () => { try { await api.put(`/crm/proposals/${id}`, { status: 'convertida' }) } catch { /* */ } setContract(null); loadLib(); onChanged() }
  // Via CRM, abrir a proposta em MODO EDIÇÃO (editor), não a visão do cliente (portal).
  const abrirProposta = () => router.push(`/crm/propostas/${id}`)

  const loadLib = useCallback(() => { api.get<{ data: any }>(`/crm/proposals/${id}/liberacao`).then(r => setLib(r?.data ?? null)).catch(() => {}) }, [id])
  const loadEng = useCallback(() => { api.get<{ data: any }>(`/crm/proposals/${id}/engajamento`).then(r => setEng(r?.data ?? null)).catch(() => {}) }, [id])
  const loadAna = useCallback(() => { api.get<{ data: any }>(`/crm/proposals/${id}/analytics`).then(r => setAna(r?.data ?? null)).catch(() => {}) }, [id])
  const loadParts = useCallback(() => { api.get<{ data: any[] }>(`/crm/proposals/${id}/participantes`).then(r => setParts(r?.data ?? [])).catch(() => {}) }, [id])
  const loadThreads = useCallback(() => { api.get<{ data: any[]; summary?: any }>(`/crm/proposals/${id}/threads`).then(r => { setThreads(r?.data ?? []); setRevSummary((r as any)?.summary ?? null) }).catch(() => {}) }, [id])
  useEffect(() => { loadLib(); loadEng(); loadAna(); loadParts(); loadThreads() }, [loadLib, loadEng, loadAna, loadParts, loadThreads])
  useEffect(() => { api.get<{ data: any[] }>('/crm/loss-reasons').then(r => setLossReasons((r?.data ?? []).filter((x: any) => x.active !== false))).catch(() => {}) }, [])
  const enviarFeedbackAction = useAsyncAction(async (resposta: 'sim' | 'parcial' | 'nao') => {
    await api.post(`/crm/proposals/${id}/diagnostico-feedback`, { resposta, comentario: fbComment }); setFbComment(''); toast.success('Feedback registrado — obrigado!'); loadAna()
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const enviarFeedback = (resposta: 'sim' | 'parcial' | 'nao') => enviarFeedbackAction.run(resposta)
  const marcarPerdaAction = useAsyncAction(async () => {
    if (!perda.loss_reason_id) { toast.error('Selecione o motivo da perda'); return }
    if (!window.confirm('Encerrar esta proposta? Esta ação registra a perda com o motivo selecionado.')) return
    await api.post(`/crm/proposals/${id}/marcar-perda`, perda); toast.success('Proposta encerrada (perda registrada)'); loadLib(); onChanged()
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const marcarPerda = () => marcarPerdaAction.run()
  const responderThreadAction = useAsyncAction(async (tid: number) => {
    const txt = (reply[tid] ?? '').trim(); if (!txt) return
    await api.post(`/crm/proposals/${id}/threads/${tid}/mensagens`, { message: txt }); setReply(s => ({ ...s, [tid]: '' })); toast.success('Resposta enviada'); loadThreads()
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const responderThread = (tid: number) => responderThreadAction.run(tid)
  const resolverThreadAction = useAsyncAction(async (tid: number) => {
    if (!window.confirm('Marcar esta revisão como resolvida?')) return
    await api.post(`/crm/proposals/${id}/threads/${tid}/resolver`, {}); toast.success('Revisão resolvida'); loadThreads(); loadLib(); onChanged()
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const resolverThread = (tid: number) => resolverThreadAction.run(tid)
  const toggleRole = (r: string) => setNp(s => ({ ...s, roles: s.roles.includes(r) ? s.roles.filter(x => x !== r) : [...s.roles, r] }))
  const addPartAction = useAsyncAction(async () => {
    if (!np.name.trim() || !np.email.trim() || !np.roles.length) { toast.error('Nome, e-mail e ao menos um papel'); return }
    await api.post<{ data: { link: string } }>(`/crm/proposals/${id}/participantes`, np); toast.success('Participante adicionado — convite enviado por e-mail'); setNp({ name: '', email: '', roles: [] }); loadParts()
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const addPart = () => addPartAction.run()
  const reenviarConviteAction = useAsyncAction(async (pp: any) => {
    const r = await api.post<{ data: { sent: boolean; message: string } }>(`/crm/proposals/${id}/participantes/${pp.id}/reenviar`, {}); (r?.data?.sent ? toast.success : toast.error)(r?.data?.message ?? 'Convite reenviado'); loadParts()
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const reenviarConvite = (pp: any) => reenviarConviteAction.run(pp)
  const desativarPartAction = useAsyncAction(async (pp: any) => {
    if (!window.confirm(`Desativar ${pp.name}? Ele(a) deixa de receber e-mails e de acessar o portal (histórico preservado).`)) return
    await api.delete(`/crm/proposals/${id}/participantes/${pp.id}`); toast.success('Participante desativado'); loadParts()
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const desativarPart = (pp: any) => desativarPartAction.run(pp)
  const copiarLink = (pp: any) => { if (pp.link) navigator.clipboard.writeText(pp.link).then(() => toast.success('Link copiado')).catch(() => {}) }

  // act(fn, ok) substituído por useAsyncAction individual (mesmo efeito: toast.success + loadLib + onChanged).
  const solicitarAssinaturaAction = useAsyncAction(async () => {
    await api.post(`/crm/proposals/${id}/solicitar-assinatura`, {}); toast.success('Assinatura solicitada ao cliente'); loadLib(); onChanged()
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const solicitarAssinatura = () => solicitarAssinaturaAction.run()
  const bloquearAction = useAsyncAction(async (motivo: string) => {
    await api.post(`/crm/proposals/${id}/bloquear`, { motivo }); toast.success('Retida'); loadLib(); onChanged()
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const bloquear = () => { const m = window.prompt('Motivo da retenção:'); if (!m?.trim()) return; bloquearAction.run(m.trim()) }
  const desbloquearAction = useAsyncAction(async () => {
    await api.post(`/crm/proposals/${id}/desbloquear`, {}); toast.success('Liberada a retenção'); loadLib(); onChanged()
  }, { onError: e => toast.error(apiMessage(e, 'Erro')) })
  const desbloquear = () => desbloquearAction.run()

  // busy compartilhado (imediato) — deriva do pending de TODAS as ações do Workflow (cross-disable).
  const busy = gerarContratoAction.pending || enviarFeedbackAction.pending || marcarPerdaAction.pending || responderThreadAction.pending || resolverThreadAction.pending || addPartAction.pending || reenviarConviteAction.pending || desativarPartAction.pending || solicitarAssinaturaAction.pending || bloquearAction.pending || desbloquearAction.pending

  const TABS = [['comercial', 'Comercial'], ['participantes', 'Participantes'], ['revisoes', `Revisões${threads.length ? ` (${threads.length})` : ''}`], ['liberacao', 'Liberação'], ['juridica', 'Jurídica']] as const
  const ROLE_LABEL: Record<string, string> = { viewer: 'Viewer', reviewer: 'Reviewer', approver: 'Approver', signer: 'Signer' }
  return (
    <>
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="h-full w-[440px] max-w-[96vw] flex flex-col" style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          <div><div className="font-bold" style={{ color: 'var(--text)' }}>{card.codigo}</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>{card.cliente} · {money(card.valor)}</div></div>
          <div className="flex items-center gap-2">
            <button onClick={abrirProposta} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }} title="Abrir a proposta no editor para alterar e atender a revisão">✎ Editar proposta</button>
            <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
          </div>
        </div>
        <div className="flex" style={{ borderBottom: '1px solid var(--border)' }}>
          {TABS.map(([k, label]) => <button key={k} onClick={() => setTab(k)} className="flex-1 py-2 text-xs font-semibold" style={{ color: tab === k ? 'var(--primary)' : 'var(--text-muted)', borderBottom: tab === k ? '2px solid var(--primary)' : '2px solid transparent' }}>{label}</button>)}
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-sm">
          {tab === 'comercial' && (
            <div className="space-y-3">
              {!ana ? <p style={{ color: 'var(--text-muted)' }}>Carregando…</p> : <>
                {/* BLOCO 1 — Resumo Executivo (primeira dobra) */}
                <div className="rounded-lg p-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>{String(ana.status ?? card.status).replace(/_/g, ' ')}</span>
                    <span className="text-[10px]" style={{ color: (ana.resumo?.dias_parada ?? 0) > 7 ? 'var(--danger)' : 'var(--text-muted)' }}>parada há {ana.resumo?.dias_parada ?? 0}d · últ. {fmt(ana.resumo?.ultima_atividade_em)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <ScoreCard l="Engajamento" score={ana.score_engajamento?.score} cls={ana.score_engajamento?.classificacao} kind="eng" />
                    <ScoreCard l="Prontidão" score={ana.score_prontidao?.score} cls={ana.score_prontidao?.classificacao} kind="pront" />
                  </div>
                </div>

                {/* BLOCO 2 — O que está travando (principal bloqueador) */}
                <div className="rounded-lg p-3" style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)' }}>
                  <div className="text-[10px] font-bold uppercase" style={{ color: 'var(--danger)' }}>O que está travando</div>
                  <div className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text)' }}>{ana.resumo?.o_que_trava ?? '— Sem bloqueios'}</div>
                </div>

                {/* BLOCO 3 — Próxima ação recomendada (única) */}
                <div className="rounded-lg p-3" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)' }}>
                  <div className="text-[10px] font-bold uppercase" style={{ color: 'var(--primary)' }}>Próxima ação recomendada</div>
                  <div className="text-sm font-bold mt-0.5" style={{ color: 'var(--text)' }}>➜ {ana.diagnostico?.proximo_passo ?? '—'}</div>
                </div>

                {/* V1.2 — feedback do diagnóstico */}
                <div className="rounded-lg p-2.5" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                  {ana.diagnostico_feedback ? (
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Diagnóstico avaliado: <b style={{ color: 'var(--text)' }}>{({ sim: 'Correto', parcial: 'Parcialmente', nao: 'Incorreto' } as any)[ana.diagnostico_feedback.resposta]}</b>{ana.diagnostico_feedback.por ? ` · ${ana.diagnostico_feedback.por}` : ''} <button onClick={() => loadAna()} className="ml-1" style={{ color: 'var(--primary)' }}>reavaliar</button></div>
                  ) : <>
                    <div className="text-[11px] font-semibold mb-1" style={{ color: 'var(--text)' }}>O diagnóstico está correto?</div>
                    <input value={fbComment} onChange={e => setFbComment(e.target.value)} placeholder="Comentário (opcional)" className="w-full text-xs rounded px-2 py-1 mb-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                    <div className="flex gap-1.5">
                      <button onClick={() => enviarFeedback('sim')} disabled={busy} className="flex-1 text-[11px] font-bold px-2 py-1 rounded" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>Sim</button>
                      <button onClick={() => enviarFeedback('parcial')} disabled={busy} className="flex-1 text-[11px] font-bold px-2 py-1 rounded" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>Parcialmente</button>
                      <button onClick={() => enviarFeedback('nao')} disabled={busy} className="flex-1 text-[11px] font-bold px-2 py-1 rounded" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>Não</button>
                    </div>
                  </>}
                </div>

                {/* BLOCO 4 — Participantes (tabela simples; destaque p/ pendentes) */}
                {ana.participantes?.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Participantes</div>
                    <div className="space-y-1">
                      {ana.participantes.map((x: any) => {
                        const pend = (x.papeis?.includes('approver') && !x.aprovou) || (x.papeis?.includes('signer') && !x.assinou)
                        const st = x.assinou ? 'Assinou' : x.aprovou ? 'Aprovou' : x.total_acessos > 0 ? 'Acessou' : 'Não acessou'
                        return (
                          <div key={x.id} className="flex items-center justify-between rounded px-2 py-1" style={{ background: pend ? 'var(--danger-bg)' : 'var(--surface-sunken)' }}>
                            <div className="min-w-0"><span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{x.nome}</span> <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>{(x.papeis ?? []).join('+')}</span></div>
                            <div className="text-[10px] text-right shrink-0" style={{ color: pend ? 'var(--danger)' : 'var(--text-muted)' }}>{st} · {fmt(x.ultimo_acesso)}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* BLOCO 5 — Analytics detalhados (recolhido, não compete com o resumo) */}
                <details className="rounded-lg" style={{ border: '1px solid var(--border)' }}>
                  <summary className="text-[11px] font-bold px-2.5 py-1.5 cursor-pointer" style={{ color: 'var(--text-muted)' }}>📊 Analytics detalhados</summary>
                  <div className="p-2.5 space-y-2">
                    {ana.diagnostico?.frases?.length > 0 && <div className="space-y-0.5">{ana.diagnostico.frases.map((f: string, i: number) => <div key={i} className="text-xs" style={{ color: 'var(--text)' }}>• {f}</div>)}</div>}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <Kpi l="Tempo até abrir" v={minLabel(ana.engajamento?.tempo_ate_abertura_min)} />
                      <Kpi l="Engajados" v={`${ana.engajamento?.participantes_engajados ?? 0}/${ana.engajamento?.participantes_total ?? 0}`} />
                      <Kpi l="Seção + vista" v={ana.navegacao?.mais_visualizada ?? '—'} />
                      <Kpi l="Seção c/ dúvidas" v={ana.revisoes?.secao_mais_duvidas ?? '—'} />
                      <Kpi l="Revisões" v={`${ana.revisoes?.total ?? 0} (${ana.revisoes?.pendentes ?? 0} pend.)`} />
                      <Kpi l="Negociação" v={ana.aprovacao?.tempo_negociacao_dias != null ? `${ana.aprovacao.tempo_negociacao_dias}d` : '—'} />
                    </div>
                    {ana.leitura_pdf?.disponivel ? (() => { const L = ana.leitura_pdf; return (
                      <div className="rounded-lg p-2.5 space-y-1.5" style={{ background: 'var(--surface-sunken)' }}>
                        <div className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Leitura do PDF</div>
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          <span className="px-2 py-0.5 rounded-full font-bold" style={{ background: L.diagnostico.chegou_investimento ? 'var(--success-bg)' : 'var(--danger-bg)', color: L.diagnostico.chegou_investimento ? 'var(--success)' : 'var(--danger)' }}>{L.diagnostico.chegou_investimento ? '✓' : '✗'} Investimento</span>
                          <span className="px-2 py-0.5 rounded-full font-bold" style={{ background: L.diagnostico.chegou_aceite ? 'var(--success-bg)' : 'var(--danger-bg)', color: L.diagnostico.chegou_aceite ? 'var(--success)' : 'var(--danger)' }}>{L.diagnostico.chegou_aceite ? '✓' : '✗'} Aceite</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <Kpi l="% lido" v={`${L.leitura.percentual_lido}%`} />
                          <Kpi l="Foi até" v={L.leitura.ultima_pagina_label} />
                          <Kpi l="Mais atenção" v={L.interesse.pagina_mais_vista?.label ?? '—'} />
                          <Kpi l="Abandono" v={L.abandono.pagina_abandono ?? 'leu até o fim'} />
                        </div>
                      </div>
                    ) })() : <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>Leitura do PDF: sem dados ainda.</div>}
                    {Array.isArray(eng?.eventos) && eng.eventos.length > 0 && <div><div className="text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Timeline</div>{eng.eventos.map((e: any, i: number) => <div key={i} className="flex gap-2 text-xs"><span className="w-24 shrink-0" style={{ color: 'var(--text-light)' }}>{fmt(e.em)}</span><span style={{ color: 'var(--text)' }}>{e.tipo}</span></div>)}</div>}
                  </div>
                </details>
              </>}
            </div>
          )}
          {tab === 'liberacao' && (
            <div className="space-y-3">
              {!lib ? <p style={{ color: 'var(--text-muted)' }}>Carregando…</p> : <>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Status: <b style={{ color: 'var(--text)' }}>{String(lib.status).replace(/_/g, ' ')}</b></div>
                <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Fluxo: cliente <b>aprova</b> e <b>assina</b> no Portal → comercial <b>gera o contrato</b> (gerar contrato já implica liberação). O CRM não cria projeto/cronograma — o contrato nasce no Kanban de Serviços pelo modal padrão.</p>
                {lib.status === 'aprovada' && <button onClick={solicitarAssinatura} disabled={busy} className="w-full text-sm font-bold px-3 py-2 rounded-lg" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Solicitar assinatura ao cliente</button>}
                {['assinada', 'liberada'].includes(lib.status) && <button onClick={gerarContrato} disabled={busy} className="w-full text-sm font-bold px-3 py-2 rounded-lg disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }} title="Abre o modal padrão de Novo Contrato (mesmo do Pipeline/Kanban)">→ Gerar contrato</button>}
                {lib.status === 'convertida' && <div className="rounded-lg px-2.5 py-1.5 text-xs" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>✓ Convertida — contrato gerado no Kanban de Serviços</div>}
                {lib.bloqueio ? <div className="rounded-lg px-2.5 py-1.5 flex items-center justify-between text-xs" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}><span>🔒 {lib.bloqueio.bloqueado_por}: {lib.bloqueio.motivo}</span><button onClick={desbloquear} style={{ fontWeight: 600 }}>Desbloquear</button></div>
                  : <button onClick={bloquear} className="text-[11px]" style={{ color: 'var(--text-muted)' }}>🔒 Reter (hold comercial)</button>}

                {/* V1.5 — Motivo de Perda */}
                {lib.perda ? (
                  <div className="rounded-lg px-2.5 py-2 text-xs" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                    ✗ Encerrada — <b>{lib.perda.motivo}</b>{lib.perda.observacao ? ` · ${lib.perda.observacao}` : ''} <span style={{ opacity: 0.8 }}>({fmt(lib.perda.perdida_em)})</span>
                  </div>
                ) : !['convertida', 'liberada'].includes(lib.status) && (
                  <details className="rounded-lg" style={{ border: '1px solid var(--border)' }}>
                    <summary className="text-[11px] font-semibold px-2.5 py-1.5 cursor-pointer" style={{ color: 'var(--danger)' }}>✗ Marcar como perdida / recusada</summary>
                    <div className="p-2.5 space-y-1.5">
                      <select value={perda.status} onChange={e => setPerda(s => ({ ...s, status: e.target.value }))} className="w-full text-xs rounded px-2 py-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                        <option value="reprovada">Recusada pelo cliente</option>
                        <option value="cancelada">Perdida</option>
                        <option value="expirada">Expirada</option>
                      </select>
                      <select value={perda.loss_reason_id} onChange={e => setPerda(s => ({ ...s, loss_reason_id: e.target.value }))} className="w-full text-xs rounded px-2 py-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                        <option value="">Motivo da perda…</option>
                        {lossReasons.map(lr => <option key={lr.id} value={lr.id}>{lr.name}</option>)}
                      </select>
                      <textarea value={perda.observacao} onChange={e => setPerda(s => ({ ...s, observacao: e.target.value }))} rows={2} placeholder="Observação (opcional)" className="w-full text-xs rounded px-2 py-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                      <button onClick={marcarPerda} disabled={busy} className="w-full text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-60" style={{ background: 'var(--danger)', color: '#fff' }}>Registrar perda</button>
                    </div>
                  </details>
                )}
              </>}
            </div>
          )}
          {tab === 'participantes' && (
            <div className="space-y-3">
              <div className="space-y-1">
                {parts.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum participante. O contato principal é convidado automaticamente ao enviar a proposta.</p> : parts.map(pp => (
                  <div key={pp.id} className="rounded-lg px-2.5 py-2 space-y-1" style={{ background: 'var(--surface-sunken)', opacity: pp.is_active === false ? 0.55 : 1 }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>{pp.name}</div>
                        <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{pp.email} · {(pp.roles ?? []).map((r: string) => ROLE_LABEL[r] ?? r).join(' + ')}</div>
                      </div>
                      <span className="text-[10px] font-bold shrink-0" style={{ color: pp.is_active === false ? 'var(--text-light)' : pp.signed ? 'var(--success)' : pp.approved ? 'var(--primary)' : 'var(--text-muted)' }}>{pp.status}</span>
                    </div>
                    <div className="text-[10px] flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: 'var(--text-light)' }}>
                      <span>Convite: {fmt(pp.invited_at)}{pp.invite_count > 1 ? ` (${pp.invite_count}×)` : ''}</span>
                      {pp.accepted_at && <span>Aceite: {fmt(pp.accepted_at)}</span>}
                      <span>Acessos: {pp.access_count ?? 0}{pp.last_access_at ? ` · últ. ${fmt(pp.last_access_at)}` : ''}</span>
                    </div>
                    {pp.is_active !== false && (
                      <div className="flex items-center gap-3 pt-0.5">
                        <button onClick={() => reenviarConvite(pp)} disabled={busy} className="text-[10px] font-semibold disabled:opacity-50" style={{ color: 'var(--primary)' }}>Reenviar convite</button>
                        {pp.link && <button onClick={() => copiarLink(pp)} className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Copiar link</button>}
                        <button onClick={() => desativarPart(pp)} disabled={busy} className="text-[10px] disabled:opacity-50 ml-auto" style={{ color: 'var(--danger)' }}>Desativar</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="rounded-lg p-2.5 space-y-2" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                <div className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Adicionar participante</div>
                <div className="flex gap-1.5">
                  <input value={np.name} onChange={e => setNp(s => ({ ...s, name: e.target.value }))} placeholder="Nome" className="flex-1 text-xs rounded px-2 py-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  <input value={np.email} onChange={e => setNp(s => ({ ...s, email: e.target.value }))} placeholder="E-mail" className="flex-1 text-xs rounded px-2 py-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                </div>
                <div className="flex gap-3 flex-wrap">
                  {['viewer', 'reviewer', 'approver', 'signer'].map(r => (
                    <label key={r} className="text-xs flex items-center gap-1" style={{ color: 'var(--text)' }}><input type="checkbox" checked={np.roles.includes(r)} onChange={() => toggleRole(r)} /> {ROLE_LABEL[r]}</label>
                  ))}
                </div>
                <button onClick={addPart} disabled={busy} className="w-full text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Convidar (envia e-mail automático)</button>
              </div>
            </div>
          )}
          {tab === 'revisoes' && (
            <div className="space-y-3">
              {revSummary && (revSummary.pendentes_total > 0 || revSummary.total_resolvidas > 0) && (
                <div className="rounded-lg p-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-extrabold" style={{ color: revSummary.pendentes_total > 0 ? 'var(--danger)' : 'var(--success)' }}>{revSummary.pendentes_total}</span>
                    <span className="text-[11px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>{revSummary.pendentes_total === 1 ? 'revisão aberta' : 'revisões abertas'}</span>
                  </div>
                  {revSummary.por_secao?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {revSummary.por_secao.map((x: any) => <span key={x.section_key} className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>{x.section_title} <b style={{ color: 'var(--danger)' }}>{x.count}</b></span>)}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-[10px]" style={{ color: 'var(--text-light)' }}>
                    {revSummary.ultima_revisao_at && <span>Última: {fmt(revSummary.ultima_revisao_at)}{revSummary.ultimo_participante ? ` · ${revSummary.ultimo_participante}` : ''}</span>}
                    <span>Resolvidas: {revSummary.total_resolvidas}</span>
                    {revSummary.tempo_medio_resolucao_horas != null && <span>Tempo médio: {revSummary.tempo_medio_resolucao_horas}h</span>}
                  </div>
                </div>
              )}
              {threads.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhuma discussão de revisão. As threads abertas pelo cliente no Portal aparecem aqui, por seção.</p> : threads.map(t => {
                const stat: Record<string, { l: string; c: string }> = { aberta: { l: 'Aberta', c: 'var(--warning)' }, respondida: { l: 'Respondida', c: 'var(--primary)' }, resolvida: { l: 'Resolvida', c: 'var(--success)' } }
                return (
                  <div key={t.id} className="rounded-lg p-2.5" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-light)' }}>{t.section_title}</div>
                        <div className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>{t.subject}</div>
                      </div>
                      <span className="text-[10px] font-bold shrink-0" style={{ color: stat[t.status]?.c ?? 'var(--text-muted)' }}>{stat[t.status]?.l ?? t.status}</span>
                    </div>
                    {(t.opened_revision || t.resolved_revision) && (
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-light)' }}>
                        {t.opened_revision ? `Aberta na v${String(t.opened_revision).padStart(2, '0')}` : ''}{t.resolved_revision ? ` · Resolvida na v${String(t.resolved_revision).padStart(2, '0')}` : ''}
                      </div>
                    )}
                    <div className="mt-2 space-y-1.5">
                      {t.messages.map((m: any) => (
                        <div key={m.id} className="rounded px-2 py-1.5" style={{ background: m.is_internal ? 'var(--primary-soft)' : 'var(--surface)' }}>
                          <div className="text-[10px] font-bold" style={{ color: m.is_internal ? 'var(--primary)' : 'var(--text-muted)' }}>{m.author}</div>
                          <div className="text-xs whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{m.message}</div>
                        </div>
                      ))}
                    </div>
                    {t.status !== 'resolvida' && (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex gap-1.5">
                          <input value={reply[t.id] ?? ''} onChange={e => setReply(s => ({ ...s, [t.id]: e.target.value }))} placeholder="Responder…" className="flex-1 text-xs rounded px-2 py-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                          <button onClick={() => responderThread(t.id)} disabled={busy} className="text-xs font-bold px-3 py-1.5 rounded disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Enviar</button>
                        </div>
                        <button onClick={() => resolverThread(t.id)} disabled={busy} className="text-[11px] font-semibold disabled:opacity-60" style={{ color: 'var(--success)' }}>✓ Marcar como resolvida</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {tab === 'juridica' && (
            <div className="space-y-1.5 text-xs">{lib?.juridica ? <>
              <Linha l="Base jurídica" v={lib.juridica.umbrella_ref || lib.juridica.contrato_numero || '— (sem guarda-chuva)'} />
              <Linha l="Cliente" v={lib.juridica.cliente} /><Linha l="CNPJ" v={lib.juridica.cnpj} />
              <Linha l="Contrato guarda-chuva" v={lib.juridica.contrato_numero || '—'} />
              <Linha l="Assinatura" v={lib.juridica.contrato_assinatura || '—'} /><Linha l="Vigência" v={lib.juridica.contrato_vigencia || '—'} />
            </> : <p style={{ color: 'var(--text-muted)' }}>—</p>}</div>
          )}
        </div>
      </div>
    </div>
    {/* Modal FORA do backdrop do drawer — senão o clique em "Próximo" borbulha e fecha o drawer. */}
    {contract && <ContractFormModal open opportunityId={contract.opportunityId} prefill={contract.prefill} prefillContacts={contract.prefillContacts} onClose={() => setContract(null)} onSaved={aposContrato} />}
    </>
  )
}
function Kpi({ l, v }: { l: string; v: string }) { return <div className="rounded-lg px-2 py-1.5" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}><div className="text-[9px] uppercase" style={{ color: 'var(--text-light)' }}>{l}</div><div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{v}</div></div> }
function ScoreCard({ l, score, cls, kind }: { l: string; score?: number; cls?: string; kind: 'eng' | 'pront' }) {
  const s = score ?? 0
  const c = kind === 'eng'
    ? (s >= 81 ? 'var(--success)' : s >= 51 ? 'var(--warning)' : 'var(--danger)')
    : (s >= 81 ? 'var(--success)' : s >= 61 ? 'var(--primary)' : s >= 31 ? 'var(--warning)' : 'var(--danger)')
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-sunken)', border: `1px solid ${c}` }}>
      <div className="text-[9px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>{l}</div>
      <div className="flex items-baseline gap-1.5"><span className="text-2xl font-extrabold" style={{ color: c }}>{s}</span><span className="text-[10px]" style={{ color: 'var(--text-light)' }}>/100</span></div>
      <div className="text-[10px] font-semibold" style={{ color: c }}>{cls ?? '—'}</div>
    </div>
  )
}
function Linha({ l, v }: { l: string; v: string | null }) { return <div className="flex justify-between gap-2"><span style={{ color: 'var(--text-muted)' }}>{l}</span><span className="text-right" style={{ color: 'var(--text)' }}>{v ?? '—'}</span></div> }

// P-E.1.2 §4 — Inteligência de Conteúdo agregada (rankings).
function ConteudoModal({ onClose }: { onClose: () => void }) {
  const [d, setD] = useState<any>(null)
  useEffect(() => { api.get<{ data: any }>('/crm/proposals/analytics-conteudo').then(r => setD(r?.data ?? null)).catch(() => setD(null)) }, [])
  const Rank = ({ titulo, itens, label, valor }: { titulo: string; itens: any[]; label: (x: any) => string; valor: (x: any) => string }) => (
    <div className="rounded-lg p-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
      <div className="text-[10px] font-bold uppercase mb-1.5" style={{ color: 'var(--text-muted)' }}>{titulo}</div>
      {(!itens || !itens.length) ? <p className="text-xs" style={{ color: 'var(--text-light)' }}>—</p> : itens.map((x, i) => (
        <div key={i} className="flex justify-between text-xs py-0.5"><span style={{ color: 'var(--text)' }}>{i + 1}. {label(x)}</span><span style={{ color: 'var(--text-muted)' }}>{valor(x)}</span></div>
      ))}
    </div>
  )
  const min = (s: number) => s < 60 ? `${s}s` : `${Math.round(s / 60)} min`
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-[720px] max-w-[96vw] max-h-[90vh] overflow-y-auto rounded-2xl p-4" style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold" style={{ color: 'var(--text)' }}>📊 Inteligência de Conteúdo — quais partes travam negociações</span>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        {!d ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Carregando…</p> : (
          <div className="grid grid-cols-2 gap-2">
            <Rank titulo="Seções mais revisadas" itens={d.secoes_mais_revisadas} label={x => x.secao} valor={x => `${x.total}`} />
            <Rank titulo="Seções com maior leitura" itens={d.secoes_maior_leitura} label={x => x.secao} valor={x => min(x.segundos)} />
            <Rank titulo="Seções mais ignoradas" itens={d.secoes_mais_ignoradas} label={x => x.secao} valor={x => min(x.segundos)} />
            <Rank titulo="Páginas c/ maior permanência" itens={d.paginas_maior_permanencia} label={x => `Página ${x.pagina}`} valor={x => min(x.segundos)} />
            <Rank titulo="Páginas c/ maior abandono" itens={d.paginas_maior_abandono} label={x => `Página ${x.pagina}`} valor={x => `${x.sessoes} sessão(ões)`} />
          </div>
        )}
      </div>
    </div>
  )
}
