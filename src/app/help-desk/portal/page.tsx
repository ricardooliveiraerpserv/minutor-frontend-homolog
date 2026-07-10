'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { sanitizeRich, isHtmlBody } from '@/lib/sanitize-html'
import { EmailFrame } from '@/components/help-desk/email-frame'
import { AbrirChamadoModal } from '@/components/help-desk/abrir-chamado-modal'
import { toast } from 'sonner'
import { LifeBuoy, Plus, BookOpen, ArrowLeft, Send, ThumbsUp, ThumbsDown, Paperclip, Trash2, CheckCircle2, Search, X } from 'lucide-react'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

// Payload do Portal (DTO curado — sem campos internos)
interface PortalSla { previsao_resolucao: string | null; respondido: boolean; resolvido_em: string | null; em_pausa: boolean }
interface PortalCommentAtt { id: number; nome: string | null; tamanho: string | null; is_image: boolean; download: string }
interface PortalComment { id: number; de: 'voce' | 'atendimento'; mensagem: string; criado_em: string; anexos?: PortalCommentAtt[] }
interface PortalAtt { id: number; nome: string | null; tamanho: string | null; is_image?: boolean; criado_em: string | null; download: string }
interface PortalTicket {
  id: number; numero: string | null; assunto?: string; prioridade?: string
  status?: { label: string; cor: string | null; is_resolved?: boolean; is_terminal?: boolean } | null
  criado_em?: string; atualizado_em: string; sla?: PortalSla
  descricao?: string | null; comentarios?: PortalComment[]; anexos?: PortalAtt[]
  // Campos visíveis conforme o perfil de acesso do cliente (podem não vir)
  cliente?: string | null; solicitante?: string | null; agente?: string | null; equipe?: string | null
  categoria?: string | null; servico?: string | null; nivel?: string | null; reaberturas?: number; cc?: string[]
  responsavel?: string | null
  justificativa?: string | null; horas_apontadas?: number; tags?: string[]; sla_primeira_resposta?: string | null
}
interface KbArticle { id: number; titulo: string; resumo: string | null; conteudo?: string | null; categoria?: string | null }

export default function HelpDeskPortalPage() {
  const [tab, setTab] = useState<'chamados' | 'kb'>('chamados')
  return (
    <AppLayout title="Central de Atendimento">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <LifeBuoy size={20} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Central de Atendimento</h1>
        </div>
        <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
          {(['chamados', 'kb'] as const).map(x => (
            <button key={x} onClick={() => setTab(x)} className="px-4 py-2 text-sm font-medium"
              style={{ color: tab === x ? 'var(--primary)' : 'var(--text-muted)', borderBottom: tab === x ? '2px solid var(--primary)' : '2px solid transparent' }}>
              {x === 'chamados' ? 'Meus chamados' : 'Base de Conhecimento'}
            </button>
          ))}
        </div>
        {tab === 'chamados' ? <Chamados /> : <Kb />}
      </div>
    </AppLayout>
  )
}

function PRow({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between gap-2"><span style={{ color: 'var(--text-light)' }}>{k}</span><span className="text-right truncate" style={{ color: 'var(--text)' }}>{v}</span></div>
}

const isResolved = (t: PortalTicket) => !!t.sla?.resolvido_em

// Pílula de prioridade colorida (igual ao Kanban do agente).
const PRIO_MAP: Record<string, { label: string; color: string; bg: string }> = {
  baixa:   { label: 'Baixa',   color: '#16a34a', bg: 'rgba(22,163,74,.16)' },
  normal:  { label: 'Média',   color: '#3b82f6', bg: 'rgba(59,130,246,.16)' },
  alta:    { label: 'Alta',    color: '#f59e0b', bg: 'rgba(245,158,11,.16)' },
  urgente: { label: 'Urgente', color: '#ef4444', bg: 'rgba(239,68,68,.16)' },
}
// Kanban do CLIENTE: agluttina os status internos em buckets simples (perfil interno não muda).
const BUCKETS: { label: string; cor: string; statuses: string[] }[] = [
  { label: 'Pendente ERPSERV',   cor: '#3b82f6', statuses: ['Novo', 'Em andamento', 'GMUD em Planejamento', 'Em Desenvolvimento'] },
  { label: 'Pendente cliente',   cor: '#f59e0b', statuses: ['Aguardando cliente'] },
  { label: 'Pendente terceiros', cor: '#a855f7', statuses: ['Pendente terceiros'] },
  { label: 'Resolvido',          cor: '#16a34a', statuses: ['Resolvido', 'Solução com GMUD'] },
  { label: 'Fechado',            cor: '#6b7280', statuses: ['Fechado', 'Cancelado'] },
]
const KNOWN_STATUSES = new Set(BUCKETS.flatMap(b => b.statuses))

// Status do SLA voltado ao cliente (rótulo + cor).
function slaStatus(t: PortalTicket): { label: string; color: string } {
  if (t.sla?.resolvido_em) return { label: 'Resolvido', color: 'var(--success-border)' }
  if (t.sla?.em_pausa) return { label: 'Pausado — aguardando você', color: 'var(--warning-border)' }
  const p = t.sla?.previsao_resolucao
  if (!p) return { label: '—', color: 'var(--text-muted)' }
  const diff = new Date(p).getTime() - Date.now()
  if (diff < 0) return { label: 'Prazo estourado', color: 'var(--danger-border)' }
  if (diff < 24 * 3600 * 1000) return { label: 'Vencendo', color: 'var(--warning-border)' }
  return { label: 'No prazo', color: 'var(--success-border)' }
}

// Bolinha de criticidade do prazo (voltada ao cliente): resolvido/pausa sem bolinha; senão pela previsão.
function portalDot(t: PortalTicket): { dot: string; title: string } {
  if (isResolved(t) || t.sla?.em_pausa) return { dot: '', title: '' }
  const p = t.sla?.previsao_resolucao
  if (!p) return { dot: '🟢', title: 'No prazo' }
  const diff = new Date(p).getTime() - Date.now()
  if (diff < 0) return { dot: '🔴', title: 'Prazo estourado' }
  if (diff < 24 * 3600 * 1000) return { dot: '🟡', title: 'Vencendo' }
  return { dot: '🟢', title: 'No prazo' }
}

function Chamados() {
  const [rows, setRows] = useState<PortalTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<number | null>(null)
  const [novo, setNovo] = useState(false)
  const [q, setQ] = useState('')            // busca geral (assunto/nº/pessoas)
  const [qTicket, setQTicket] = useState('') // busca por número do ticket
  const [fSolic, setFSolic] = useState('')   // filtro solicitante
  const [fResp, setFResp] = useState('')     // filtro responsável (agente)
  const load = useCallback(() => {
    setLoading(true)
    api.get<{ data: PortalTicket[] }>('/help-desk/portal/tickets').then(r => setRows(r?.data ?? [])).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])
  // Deep-link: /help-desk/portal?ticket=<id> (ex.: "Ver chamado" da faixa de ajuda) abre o chamado.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('ticket')
    if (p && /^\d+$/.test(p)) setSel(Number(p))
  }, [])

  if (sel) return <TicketView id={sel} onBack={() => { setSel(null); load() }} />

  // Opções de filtro (valores distintos presentes) + aplicação dos filtros.
  const solicitantes = Array.from(new Set(rows.map(t => t.solicitante).filter(Boolean))) as string[]
  const responsaveis = Array.from(new Set(rows.map(t => t.agente).filter(Boolean))) as string[]
  const norm = (s?: string | null) => (s ?? '').toLowerCase()
  const filteredRows = rows.filter(t => {
    if (fSolic && t.solicitante !== fSolic) return false
    if (fResp && t.agente !== fResp) return false
    if (qTicket && !norm(t.numero).includes(qTicket.toLowerCase())) return false
    if (q && ![t.numero, t.assunto, t.solicitante, t.agente].map(norm).join(' ').includes(q.toLowerCase())) return false
    return true
  })
  const hasFilter = !!(q || qTicket || fSolic || fResp)

  // Colunas do Kanban = BUCKETS fixos (chamados filtrados). Status desconhecido cai em "Pendente ERPSERV".
  const columns = BUCKETS.map(b => ({
    label: b.label, cor: b.cor,
    items: filteredRows.filter(t => {
      const l = t.status?.label ?? ''
      return b.statuses.includes(l) || (b.label === 'Pendente ERPSERV' && !KNOWN_STATUSES.has(l))
    }),
  }))

  return (
    <div className="space-y-4">
      {/* Chamada de ação — bem clara */}
      <div className="ds-card p-4 flex items-center justify-between gap-3 flex-wrap" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)' }}>
        <div className="min-w-0">
          <div className="font-semibold" style={{ color: 'var(--primary)' }}>Precisa de ajuda?</div>
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Abra um chamado e acompanhe tudo por aqui — respostas, prazos e anexos.</div>
        </div>
        <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg shrink-0" onClick={() => setNovo(true)}><Plus size={16} /> Abrir chamado</button>
      </div>

      {/* Filtros: busca geral, por ticket, solicitante e responsável */}
      {rows.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar (assunto, nº, pessoa)…" className={`${fieldCls} w-full`} style={{ ...inputStyle, paddingLeft: 30 }} />
          </div>
          <input value={qTicket} onChange={e => setQTicket(e.target.value)} placeholder="Nº do ticket" className={fieldCls} style={{ ...inputStyle, width: 130 }} />
          <select value={fSolic} onChange={e => setFSolic(e.target.value)} className={fieldCls} style={{ ...inputStyle, maxWidth: 200 }}>
            <option value="">Solicitante: todos</option>
            {solicitantes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={fResp} onChange={e => setFResp(e.target.value)} className={fieldCls} style={{ ...inputStyle, maxWidth: 200 }}>
            <option value="">Responsável: todos</option>
            {responsaveis.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {hasFilter && <button onClick={() => { setQ(''); setQTicket(''); setFSolic(''); setFResp('') }} className="text-xs px-2 py-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}>Limpar</button>}
        </div>
      )}

      {/* KANBAN — colunas por bucket (única visão do cliente) */}
      {loading ? (
        <div className="py-10 text-center" style={{ color: 'var(--text-muted)' }}>Carregando…</div>
      ) : rows.length === 0 ? (
        <div className="ds-card py-10 px-4 text-center space-y-2">
          <LifeBuoy size={30} className="mx-auto" style={{ color: 'var(--text-light)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Você ainda não tem chamados.</p>
          <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => setNovo(true)}><Plus size={15} /> Abrir meu primeiro chamado</button>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map(col => (
            <div key={col.label} className="w-[270px] shrink-0">
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col.cor ?? 'var(--text-muted)' }} />
                <span className="text-sm font-semibold truncate" style={{ color: col.cor ?? 'var(--text)' }}>{col.label}</span>
                <span className="text-[11px] px-1.5 rounded-full" style={{ background: 'var(--surface-sunken)', color: 'var(--text-light)' }}>{col.items.length}</span>
              </div>
              <div className="space-y-2 rounded-lg p-2" style={{ background: 'var(--surface-sunken)', minHeight: 80 }}>
                {col.items.map(t => {
                  const prio = t.prioridade ? PRIO_MAP[t.prioridade] : null
                  const d = portalDot(t)
                  return (
                    <button key={t.id} onClick={() => setSel(t.id)} className="ds-card p-3 w-full text-left space-y-2 hover:shadow transition" style={{ background: 'var(--surface)' }}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-[11px]" style={{ color: 'var(--text-light)' }}>{t.numero ?? `#${t.id}`}</span>
                        {d.dot && <span title={d.title} className="text-xs leading-none">{d.dot}</span>}
                      </div>
                      <div className="font-semibold text-sm leading-snug" style={{ color: 'var(--text)' }}>{t.assunto}</div>
                      <div className="flex items-center justify-between gap-2">
                        {prio && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ color: prio.color, background: prio.bg }}>{prio.label}</span>}
                        {isResolved(t) ? <span className="inline-flex items-center gap-0.5 text-[10px]" style={{ color: 'var(--success-border)' }}><CheckCircle2 size={10} /> resolvido</span>
                          : t.sla?.em_pausa && <span className="text-[10px]" style={{ color: 'var(--warning-border)' }}>aguardando você</span>}
                      </div>
                    </button>
                  )
                })}
                {col.items.length === 0 && <p className="text-[11px] text-center py-3" style={{ color: 'var(--text-light)' }}>—</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {novo && <AbrirChamadoModal onClose={() => setNovo(false)} onCreated={(id) => { setNovo(false); load(); setSel(id) }} />}
    </div>
  )
}

function TicketView({ id, onBack }: { id: number; onBack: () => void }) {
  const [t, setT] = useState<PortalTicket | null>(null)
  const [body, setBody] = useState(''); const [sending, setSending] = useState(false)
  const [files, setFiles] = useState<File[]>([])   // anexos/prints DA interação (vão junto do envio)
  const [rejecting, setRejecting] = useState(false); const [reason, setReason] = useState(''); const [acting, setActing] = useState(false)
  const load = useCallback(() => { api.get<{ data: PortalTicket }>(`/help-desk/portal/tickets/${id}`).then(r => setT(r?.data ?? null)).catch(() => toast.error('Erro')) }, [id])
  useEffect(() => { load() }, [load])
  const addFiles = (list: FileList | File[]) => { const arr = Array.from(list); if (arr.length) setFiles(f => [...f, ...arr]) }
  const removeFile = (i: number) => setFiles(f => f.filter((_, j) => j !== i))
  const accept = async () => { setActing(true); try { await api.post(`/help-desk/portal/tickets/${id}/accept`, {}); toast.success('Chamado encerrado. Obrigado!'); load() } catch { toast.error('Erro ao aceitar') } finally { setActing(false) } }
  const reject = async () => {
    if (!reason.trim()) return toast.error('Informe o motivo da recusa.')
    setActing(true)
    try { await api.post(`/help-desk/portal/tickets/${id}/reject`, { reason: reason.trim() }); toast.success('Solução recusada — o chamado voltou para atendimento.'); setRejecting(false); setReason(''); load() }
    catch { toast.error('Erro ao recusar') } finally { setActing(false) }
  }
  const send = async () => {
    if (!body.trim() && files.length === 0) return
    setSending(true)
    try {
      const fd = new FormData()
      fd.append('body', body.trim())
      files.forEach(f => fd.append('files[]', f))
      await api.post(`/help-desk/portal/tickets/${id}/comments`, fd)
      setBody(''); setFiles([]); load()
    } catch { toast.error('Erro ao enviar') } finally { setSending(false) }
  }

  if (!t) return <div className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>Carregando…</div>
  const prazo = t.sla?.previsao_resolucao
  const sla = slaStatus(t)
  const prio = t.prioridade ? PRIO_MAP[t.prioridade] : null
  return (
    <div className="space-y-3 w-full max-w-5xl">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg ds-btn-secondary" title="Voltar para meus chamados">
          <ArrowLeft size={16} /> Voltar
        </button>
        <span className="font-mono text-xl font-bold" style={{ color: 'var(--text)' }}>{t.numero ?? `#${t.id}`}</span>
        {t.status && (
          <span className="inline-flex items-center gap-1.5 text-base font-semibold" style={{ color: t.status.cor ?? 'var(--text)' }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.status.cor ?? 'var(--text-muted)' }} />{t.status.label}
          </span>
        )}
        {t.sla?.em_pausa && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--warning-bg)', color: 'var(--warning-border)' }}>aguardando você</span>}
      </div>
      {t.assunto && <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{t.assunto}</h1>}
      {prazo && !t.sla?.resolvido_em && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Previsão de resolução: {fmtDate(prazo)}</p>}

      {/* Aceite/Recusa da solução — quando resolvido (e ainda não encerrado). */}
      {t.status?.is_resolved && !t.status?.is_terminal && (
        <div className="ds-card p-4 space-y-3" style={{ border: '1px solid var(--success-border)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>O atendimento marcou este chamado como <strong>resolvido</strong>. A solução resolveu?</div>
          {!rejecting ? (
            <div className="flex gap-2 flex-wrap">
              <button onClick={accept} disabled={acting} className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg" style={{ background: '#16a34a', color: '#fff', opacity: acting ? 0.6 : 1 }}>
                <CheckCircle2 size={16} /> Aceitar e encerrar
              </button>
              <button onClick={() => setRejecting(true)} disabled={acting} className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg" style={{ background: '#ef4444', color: '#fff', opacity: acting ? 0.6 : 1 }}>
                <X size={16} /> Recusar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} autoFocus placeholder="Diga o que faltou ou por que a solução não resolveu…"
                className={`${fieldCls} w-full`} style={{ background: '#ffffff', color: '#1f2937', border: '1px solid #e5e7eb' }} />
              <div className="flex gap-2">
                <button onClick={reject} disabled={acting || !reason.trim()} className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-lg" style={{ background: '#ef4444', color: '#fff', opacity: (acting || !reason.trim()) ? 0.6 : 1 }}>Enviar recusa</button>
                <button onClick={() => { setRejecting(false); setReason('') }} className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detalhes do chamado — o cliente vê os dados do próprio chamado */}
      <div className="ds-card p-3 space-y-1.5 text-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-light)' }}>Detalhes</div>
        {t.cliente && <PRow k="Cliente" v={t.cliente} />}
        {t.solicitante && <PRow k="Solicitante" v={t.solicitante} />}
        {(t.agente || t.responsavel) && <PRow k="Agente" v={(t.agente || t.responsavel)!} />}
        {t.equipe && <PRow k="Equipe" v={t.equipe} />}
        {t.categoria && <PRow k="Categoria" v={t.categoria} />}
        {t.servico && <PRow k="Serviço" v={t.servico} />}
        {prio && (
          <div className="flex items-center justify-between gap-2">
            <span style={{ color: 'var(--text-light)' }}>Urgência</span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ color: prio.color, background: prio.bg }}>{prio.label}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span style={{ color: 'var(--text-light)' }}>SLA</span>
          <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: sla.color }}>
            <span className="w-2 h-2 rounded-full" style={{ background: sla.color }} />{sla.label}
          </span>
        </div>
        {t.nivel && <PRow k="Nível" v={t.nivel} />}
        {t.cc && t.cc.length > 0 && <PRow k="CC (envolvidos)" v={t.cc.join(', ')} />}
        {t.reaberturas != null && <PRow k="Reaberturas" v={String(t.reaberturas)} />}
        {t.criado_em && <PRow k="Aberto em" v={fmtDate(t.criado_em)} />}
        {t.justificativa && <PRow k="Justificativa" v={t.justificativa} />}
        {t.horas_apontadas != null && <PRow k="Horas apontadas" v={`${t.horas_apontadas}h`} />}
        {t.sla_primeira_resposta && <PRow k="Limite 1ª resposta" v={fmtDate(t.sla_primeira_resposta)} />}
        {t.tags && t.tags.length > 0 && <PRow k="Tags" v={t.tags.join(', ')} />}
      </div>

      {/* Conversa — compositor no topo, mais RECENTE primeiro. Anexos vão junto de cada interação. */}
      <div className="ds-card p-3 space-y-3">
        {/* Compositor no topo */}
        <div className="space-y-2 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px]" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
                  <Paperclip size={11} /><span className="max-w-[140px] truncate">{f.name}</span>
                  <button onClick={() => removeFile(i)} aria-label="Remover"><Trash2 size={11} style={{ color: 'var(--text-light)' }} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <textarea className={`${fieldCls} flex-1`} style={{ background: '#ffffff', color: '#1f2937', border: '1px solid #e5e7eb' }} rows={2} placeholder="Escreva uma resposta… (cole um print com Ctrl+V ou anexe arquivos)" value={body} onChange={e => setBody(e.target.value)}
              onPaste={e => { const imgs = Array.from(e.clipboardData.items).filter(it => it.type.startsWith('image/')); const fs = imgs.map(it => it.getAsFile()).filter(Boolean) as File[]; if (fs.length) { addFiles(fs); toast.success('Print anexado') } }} />
            <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 rounded-lg self-end py-2" onClick={send} disabled={sending || (!body.trim() && files.length === 0)}><Send size={14} /></button>
          </div>
          <label className="inline-flex items-center gap-1 text-xs cursor-pointer" style={{ color: 'var(--primary)' }}>
            <Paperclip size={13} /> Anexar arquivo
            <input type="file" multiple className="hidden" onChange={e => { if (e.target.files) addFiles(e.target.files); e.currentTarget.value = '' }} />
          </label>
        </div>
        {(t.comentarios ?? []).length === 0 && <p className="text-sm text-center py-2" style={{ color: 'var(--text-muted)' }}>Sem respostas ainda.</p>}
        {(t.comentarios ?? []).slice().reverse().map(c => (
          <div key={c.id} className="rounded-lg p-3" style={{ background: c.de === 'voce' ? 'var(--primary-soft)' : 'var(--surface-sunken)' }}>
            <div className="flex items-center justify-between mb-1"><span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{c.de === 'voce' ? 'Você' : 'Atendimento'}</span><span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{fmtDate(c.criado_em)}</span></div>
            {c.mensagem && (
              <div className="text-sm rounded-lg px-3 py-2" style={{ background: '#ffffff', color: '#1f2937' }}>
                {isHtmlBody(c.mensagem)
                  ? <div className="hd-rich" dangerouslySetInnerHTML={{ __html: sanitizeRich(c.mensagem) }} />
                  : <p className="whitespace-pre-wrap">{c.mensagem}</p>}
              </div>
            )}
            {c.anexos && c.anexos.length > 0 && (
              <div className="mt-2 space-y-2">
                {c.anexos.filter(a => a.is_image).map(a => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={a.id} href={a.download} target="_blank" rel="noopener noreferrer"><img src={a.download} alt={a.nome ?? 'anexo'} className="rounded-lg max-h-64" style={{ border: '1px solid var(--border)' }} /></a>
                ))}
                {c.anexos.filter(a => !a.is_image).map(a => (
                  <a key={a.id} href={a.download} className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--primary)' }}><Paperclip size={12} /> {a.nome ?? `Anexo #${a.id}`}{a.tamanho ? ` · ${a.tamanho}` : ''}</a>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Descrição = interação MAIS ANTIGA → por último (a conversa é mais novo primeiro). */}
        {(t.descricao || (t.anexos && t.anexos.length > 0)) && (
          <div className="rounded-lg p-3" style={{ background: 'var(--surface-sunken)' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--text)' }}>Você
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>descrição inicial</span>
              </span>
              <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{fmtDate(t.criado_em)}</span>
            </div>
            {t.descricao && (isHtmlBody(t.descricao)
              ? <EmailFrame html={t.descricao} />
              : <div className="text-sm rounded-lg px-3 py-2 whitespace-pre-wrap" style={{ background: '#ffffff', color: '#1f2937' }}>{t.descricao}</div>)}
            {t.anexos && t.anexos.length > 0 && (
              <div className="mt-2 space-y-2">
                {t.anexos.filter(a => a.is_image).map(a => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={a.id} href={a.download} target="_blank" rel="noopener noreferrer"><img src={a.download} alt={a.nome ?? 'anexo'} className="rounded-lg max-h-64" style={{ border: '1px solid var(--border)' }} /></a>
                ))}
                {t.anexos.filter(a => !a.is_image).map(a => (
                  <a key={a.id} href={a.download} className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--primary)' }}><Paperclip size={12} /> {a.nome ?? `Anexo #${a.id}`}{a.tamanho ? ` · ${a.tamanho}` : ''}</a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Kb() {
  const [arts, setArts] = useState<KbArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<KbArticle | null>(null)
  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams(); if (search) p.set('search', search)
    api.get<{ data: KbArticle[] }>(`/help-desk/portal/kb${p.toString() ? `?${p}` : ''}`).then(r => setArts(r?.data ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [search])
  useEffect(() => { load() }, [load])
  const read = async (a: KbArticle) => { try { const r = await api.get<{ data: KbArticle }>(`/help-desk/portal/kb/${a.id}`); setOpen(r?.data ?? a) } catch { setOpen(a) } }
  const feedback = async (helpful: boolean) => { if (!open) return; try { await api.post(`/help-desk/portal/kb/${open.id}/feedback`, { helpful }); toast.success('Obrigado pelo feedback!'); setOpen(null) } catch { toast.error('Erro') } }

  if (open) return (
    <div className="space-y-3 max-w-2xl">
      <button onClick={() => setOpen(null)} className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--text-muted)' }}><ArrowLeft size={16} /> Voltar</button>
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>{open.titulo}</h1>
      <div className="ds-card p-4"><p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{open.conteudo ?? open.resumo}</p></div>
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        Este artigo foi útil?
        <button onClick={() => feedback(true)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg ds-btn-secondary"><ThumbsUp size={14} /> Sim</button>
        <button onClick={() => feedback(false)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg ds-btn-secondary"><ThumbsDown size={14} /> Não</button>
      </div>
    </div>
  )

  return (
    <div className="space-y-3">
      <input className={`${fieldCls} w-full max-w-md`} style={inputStyle} placeholder="Buscar artigos…" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {loading ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Carregando…</p>
          : arts.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum artigo disponível.</p>
          : arts.map(a => (
          <button key={a.id} onClick={() => read(a)} className="ds-card text-left p-4 hover:shadow transition">
            <div className="flex items-center gap-2 mb-1"><BookOpen size={15} style={{ color: 'var(--primary)' }} /><span className="font-semibold" style={{ color: 'var(--text)' }}>{a.titulo}</span></div>
            <p className="text-sm line-clamp-2" style={{ color: 'var(--text-muted)' }}>{a.resumo ?? '—'}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
