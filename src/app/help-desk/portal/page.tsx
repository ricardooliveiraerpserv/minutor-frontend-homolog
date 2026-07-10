'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { sanitizeRich, isHtmlBody } from '@/lib/sanitize-html'
import { EmailFrame } from '@/components/help-desk/email-frame'
import { AbrirChamadoModal } from '@/components/help-desk/abrir-chamado-modal'
import { toast } from 'sonner'
import { LifeBuoy, Plus, BookOpen, ArrowLeft, Send, ThumbsUp, ThumbsDown, Paperclip, Upload, Trash2, ChevronRight, CheckCircle2, Clock } from 'lucide-react'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const lbl = 'text-[11px] font-semibold block mb-0.5'
const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

// Payload do Portal (DTO curado — sem campos internos)
interface PortalSla { previsao_resolucao: string | null; respondido: boolean; resolvido_em: string | null; em_pausa: boolean }
interface PortalComment { id: number; de: 'voce' | 'atendimento'; mensagem: string; criado_em: string }
interface PortalAtt { id: number; nome: string | null; tamanho: string | null; criado_em: string | null; download: string }
interface PortalTicket {
  id: number; numero: string | null; assunto?: string; prioridade?: string
  status?: { label: string; cor: string | null } | null
  criado_em?: string; atualizado_em: string; sla?: PortalSla
  descricao?: string | null; comentarios?: PortalComment[]; anexos?: PortalAtt[]
  // Campos visíveis conforme o perfil de acesso do cliente (podem não vir)
  servico?: string | null; responsavel?: string | null; categoria?: string | null
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
function StatusPill({ status }: { status?: { label: string; cor: string | null } | null }) {
  if (!status) return null
  return <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: status.cor ?? 'var(--text)' }}>
    <span className="w-2 h-2 rounded-full" style={{ background: status.cor ?? 'var(--text-muted)' }} />{status.label}</span>
}

const isResolved = (t: PortalTicket) => !!t.sla?.resolvido_em

function Chamados() {
  const [rows, setRows] = useState<PortalTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<number | null>(null)
  const [novo, setNovo] = useState(false)
  const [filter, setFilter] = useState<'abertos' | 'resolvidos' | 'todos'>('abertos')
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

  const abertos = rows.filter(t => !isResolved(t))
  const resolvidos = rows.filter(t => isResolved(t))
  const shown = filter === 'todos' ? rows : filter === 'resolvidos' ? resolvidos : abertos
  const FILTERS: { id: typeof filter; label: string; count: number }[] = [
    { id: 'abertos', label: 'Em aberto', count: abertos.length },
    { id: 'resolvidos', label: 'Resolvidos', count: resolvidos.length },
    { id: 'todos', label: 'Todos', count: rows.length },
  ]

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

      {/* Filtros por situação */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full font-medium"
            style={{ background: filter === f.id ? 'var(--primary)' : 'var(--surface-sunken)', color: filter === f.id ? 'var(--primary-fg)' : 'var(--text-muted)' }}>
            {f.label}<span className="text-[11px] px-1.5 rounded-full" style={{ background: filter === f.id ? 'rgba(255,255,255,.25)' : 'var(--surface)', color: filter === f.id ? 'var(--primary-fg)' : 'var(--text-light)' }}>{f.count}</span>
          </button>
        ))}
      </div>

      {/* Lista em CARDS */}
      {loading ? (
        <div className="py-10 text-center" style={{ color: 'var(--text-muted)' }}>Carregando…</div>
      ) : shown.length === 0 ? (
        <div className="ds-card py-10 px-4 text-center space-y-2">
          <LifeBuoy size={30} className="mx-auto" style={{ color: 'var(--text-light)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{filter === 'abertos' ? 'Você não tem chamados em aberto.' : filter === 'resolvidos' ? 'Nenhum chamado resolvido ainda.' : 'Você ainda não tem chamados.'}</p>
          {filter !== 'resolvidos' && <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => setNovo(true)}><Plus size={15} /> Abrir meu primeiro chamado</button>}
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map(t => (
            <button key={t.id} onClick={() => setSel(t.id)} className="ds-card p-3 w-full text-left flex items-center gap-3 hover:shadow transition">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[11px]" style={{ color: 'var(--text-light)' }}>{t.numero ?? `#${t.id}`}</span>
                  <StatusPill status={t.status} />
                  {isResolved(t) && <span className="inline-flex items-center gap-0.5 text-[11px]" style={{ color: 'var(--success-border)' }}><CheckCircle2 size={11} /> resolvido</span>}
                  {!isResolved(t) && t.sla?.em_pausa && <span className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--warning-bg)', color: 'var(--warning-border)' }}>aguardando você</span>}
                </div>
                <div className="font-medium mt-0.5 truncate" style={{ color: 'var(--text)' }}>{t.assunto}</div>
                <div className="flex items-center gap-1 text-xs mt-0.5" style={{ color: 'var(--text-light)' }}>
                  <Clock size={11} /> Atualizado {fmtDate(t.atualizado_em)}
                  {!isResolved(t) && t.sla?.previsao_resolucao ? ` · previsão ${fmtDate(t.sla.previsao_resolucao)}` : ''}
                </div>
              </div>
              <ChevronRight size={18} className="shrink-0" style={{ color: 'var(--text-light)' }} />
            </button>
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
  const [uploading, setUploading] = useState(false)
  const load = useCallback(() => { api.get<{ data: PortalTicket }>(`/help-desk/portal/tickets/${id}`).then(r => setT(r?.data ?? null)).catch(() => toast.error('Erro')) }, [id])
  useEffect(() => { load() }, [load])
  const send = async () => { if (!body.trim()) return; setSending(true); try { await api.post(`/help-desk/portal/tickets/${id}/comments`, { body: body.trim() }); setBody(''); load() } catch { toast.error('Erro ao enviar') } finally { setSending(false) } }
  const upload = async (file: File) => {
    setUploading(true); const fd = new FormData(); fd.append('file', file)
    try { await api.post(`/help-desk/portal/tickets/${id}/attachments`, fd); toast.success('Arquivo anexado'); load() }
    catch { toast.error('Erro ao anexar') } finally { setUploading(false) }
  }
  const delAtt = async (attId: number) => { try { await api.delete(`/help-desk/portal/tickets/${id}/attachments/${attId}`); load() } catch { toast.error('Erro ao excluir') } }

  if (!t) return <div className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>Carregando…</div>
  const prazo = t.sla?.previsao_resolucao
  return (
    <div className="space-y-3 max-w-2xl">
      <div className="flex items-center gap-2">
        <button onClick={onBack}><ArrowLeft size={18} style={{ color: 'var(--text-muted)' }} /></button>
        <span className="font-mono text-xs" style={{ color: 'var(--text-light)' }}>{t.numero ?? `#${t.id}`}</span>
        <StatusPill status={t.status} />
        {t.sla?.em_pausa && <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--warning-bg)', color: 'var(--warning-border)' }}>aguardando você</span>}
      </div>
      {t.assunto && <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{t.assunto}</h1>}
      {prazo && !t.sla?.resolvido_em && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Previsão de resolução: {fmtDate(prazo)}</p>}

      {/* Detalhes visíveis conforme o perfil de acesso (só mostra o que vier) */}
      {(t.servico || t.responsavel || t.categoria || t.justificativa || t.prioridade || t.horas_apontadas != null || (t.tags && t.tags.length > 0) || t.sla_primeira_resposta) && (
        <div className="ds-card p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          {t.servico && <PRow k="Serviço" v={t.servico} />}
          {t.categoria && <PRow k="Categoria" v={t.categoria} />}
          {t.prioridade && <PRow k="Urgência" v={t.prioridade} />}
          {t.responsavel && <PRow k="Responsável" v={t.responsavel} />}
          {t.justificativa && <PRow k="Justificativa" v={t.justificativa} />}
          {t.horas_apontadas != null && <PRow k="Horas apontadas" v={`${t.horas_apontadas}h`} />}
          {t.sla_primeira_resposta && <PRow k="Limite 1ª resposta" v={fmtDate(t.sla_primeira_resposta)} />}
          {t.tags && t.tags.length > 0 && <PRow k="Tags" v={t.tags.join(', ')} />}
        </div>
      )}
      {t.descricao && (isHtmlBody(t.descricao)
        ? <EmailFrame html={t.descricao} />
        : <div className="ds-card p-3"><p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{t.descricao}</p></div>)}

      {/* Anexos */}
      <div className="ds-card p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className={lbl} style={{ color: 'var(--text-light)' }}><Paperclip size={12} className="inline -mt-0.5 mr-1" />Anexos ({t.anexos?.length ?? 0})</span>
          <label className="inline-flex items-center gap-1 text-xs cursor-pointer" style={{ color: 'var(--primary)' }}>
            {uploading ? 'Enviando…' : <><Upload size={13} /> Anexar arquivo</>}
            <input type="file" className="hidden" disabled={uploading} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = '' }} />
          </label>
        </div>
        {(t.anexos ?? []).length === 0 ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum anexo.</p> : (t.anexos ?? []).map(a => (
          <div key={a.id} className="flex items-center justify-between text-xs">
            <a href={a.download} className="ds-link truncate" style={{ color: 'var(--primary)' }}>{a.nome ?? `Anexo #${a.id}`} {a.tamanho ? `· ${a.tamanho}` : ''}</a>
            <button onClick={() => delAtt(a.id)} title="Excluir meu anexo"><Trash2 size={13} style={{ color: 'var(--danger-border)' }} /></button>
          </div>
        ))}
      </div>

      {/* Conversa */}
      <div className="ds-card p-3 space-y-3">
        {(t.comentarios ?? []).length === 0 && <p className="text-sm text-center py-2" style={{ color: 'var(--text-muted)' }}>Sem respostas ainda.</p>}
        {(t.comentarios ?? []).map(c => (
          <div key={c.id} className="rounded-lg p-3" style={{ background: c.de === 'voce' ? 'var(--primary-soft)' : 'var(--surface-sunken)' }}>
            <div className="flex items-center justify-between mb-1"><span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{c.de === 'voce' ? 'Você' : 'Atendimento'}</span><span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{fmtDate(c.criado_em)}</span></div>
            {isHtmlBody(c.mensagem)
              ? <div className="text-sm hd-rich" style={{ color: 'var(--text)' }} dangerouslySetInnerHTML={{ __html: sanitizeRich(c.mensagem) }} />
              : <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{c.mensagem}</p>}
          </div>
        ))}
        <div className="border-t pt-3 space-y-2" style={{ borderColor: 'var(--border)' }}>
          <div className="flex gap-2">
            <textarea className={`${fieldCls} flex-1`} style={inputStyle} rows={2} placeholder="Escreva uma resposta… (cole um print com Ctrl+V)" value={body} onChange={e => setBody(e.target.value)}
              onPaste={e => { const imgs = Array.from(e.clipboardData.items).filter(it => it.type.startsWith('image/')); const fs = imgs.map(it => it.getAsFile()).filter(Boolean) as File[]; fs.forEach(f => upload(f)) }} />
            <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 rounded-lg self-end py-2" onClick={send} disabled={sending || !body.trim()}><Send size={14} /></button>
          </div>
          <label className="inline-flex items-center gap-1 text-xs cursor-pointer" style={{ color: 'var(--primary)' }}>
            {uploading ? 'Enviando…' : <><Paperclip size={13} /> Anexar arquivo</>}
            <input type="file" className="hidden" disabled={uploading} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = '' }} />
          </label>
        </div>
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
