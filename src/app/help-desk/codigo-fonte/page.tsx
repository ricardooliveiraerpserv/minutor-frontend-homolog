'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Search, Plus, X, Check, ChevronLeft, ChevronRight, FileCode, Loader2, Building2, AlertTriangle, ExternalLink } from 'lucide-react'

/**
 * Fase 1B — Wizard de Solicitação de Código-Fonte (Help Desk).
 * 4 passos: Cliente → Chamado → Fontes 1…N → Confirmação. Consome os endpoints da 1A
 * (/source-code/search e /source-code/tickets). A criação/anexação é a 1C.
 */
interface Customer { id: number; name: string }
interface TicketRow { id: number; ticket_number: string | null; subject: string; status: string | null; status_color?: string | null }
interface Commit { sha: string | null; date: string | null; author: string | null; message: string | null }
interface SearchItem { owner: string; repository: string; tipo: string; branch: string; path: string; name: string; commit: Commit | null }

interface ProcItem { id: number; filename: string; status: 'pending' | 'processing' | 'attached' | 'failed'; error?: string | null; original_commit_at?: string | null; original_commit_sha?: string | null }
const MAX_SOURCES = 30
const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const shortSha = (s?: string | null) => (s ? s.slice(0, 7) : '—')
const STEPS = ['Cliente', 'Chamado', 'Fontes', 'Confirmação']

export default function CodigoFontePage() {
  const searchParams = useSearchParams()
  const [step, setStep] = useState(0) // 0..3

  // Passo 1 — Cliente
  const [customers, setCustomers] = useState<Customer[]>([])
  const [custQuery, setCustQuery] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)

  // Chamado travado (veio do botão "Solicitar código-fonte" no detalhe do chamado).
  // Fica vinculado independentemente do cliente escolhido (cobre chamado interno erpserv/bizify).
  const [lockedTicket, setLockedTicket] = useState<TicketRow | null>(null)

  // Passo 2 — Chamado
  const [ticketMode, setTicketMode] = useState<'existing' | 'new'>('existing')
  const [ticketQuery, setTicketQuery] = useState('')
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [ticket, setTicket] = useState<TicketRow | null>(null)

  // Passo 3 — Fontes (cada slot = 1 fonte; null = ainda buscando)
  const [sources, setSources] = useState<(SearchItem | null)[]>([null])

  // Passo 4 — processamento (1C)
  const router = useRouter()
  const [phase, setPhase] = useState<'form' | 'processing' | 'done'>('form')
  const [submitting, setSubmitting] = useState(false)
  const [reqInfo, setReqInfo] = useState<{ id: number; ticket_id: number; ticket_number: string | null } | null>(null)
  const [procItems, setProcItems] = useState<ProcItem[]>([])

  useEffect(() => {
    // Só clientes com repositório de código-fonte AMARRADO (ativo) — sem vínculo, não aparece.
    api.get<{ data: Customer[] }>('/source-code/clients')
      .then(r => setCustomers((r?.data ?? []).map(c => ({ id: c.id, name: c.name }))))
      .catch(() => {})
  }, [])
  const custFiltered = customers.filter(c => c.name.toLowerCase().includes(custQuery.toLowerCase())).slice(0, 40)

  // Chamados do cliente (server-side, debounce)
  useEffect(() => {
    if (!customer || ticketMode !== 'existing') return
    const t = setTimeout(() => {
      api.get<{ data: TicketRow[] }>(`/source-code/tickets?customer_id=${customer.id}&q=${encodeURIComponent(ticketQuery)}`)
        .then(r => setTickets(r?.data ?? [])).catch(() => setTickets([]))
    }, 300)
    return () => clearTimeout(t)
  }, [customer, ticketQuery, ticketMode])

  // Pré-preenchimento vindo do detalhe de um chamado (?ticket_id=&ticket_number=&customer_id=).
  const prefillTicketDone = useRef(false)
  const prefillCustDone = useRef(false)
  useEffect(() => {
    if (prefillTicketDone.current) return
    const tid = searchParams.get('ticket_id')
    if (!tid) return
    const lt: TicketRow = { id: Number(tid), ticket_number: searchParams.get('ticket_number'), subject: '', status: null }
    setLockedTicket(lt); setTicket(lt); setTicketMode('existing')
    prefillTicketDone.current = true
  }, [searchParams])
  // Assim que a lista de clientes carrega: se o cliente do chamado tiver repo, pré-seleciona e pula
  // direto pro passo Fontes. Se NÃO tiver (interno erpserv/bizify), deixa o seletor de cliente aberto.
  useEffect(() => {
    if (prefillCustDone.current || customers.length === 0) return
    const cid = searchParams.get('customer_id')
    if (!cid) { prefillCustDone.current = true; return }
    const found = customers.find(c => String(c.id) === cid)
    if (found) {
      setCustomer(found)
      if (searchParams.get('ticket_id')) setStep(2)
    }
    prefillCustDone.current = true
  }, [customers, searchParams])

  const pickCustomer = (c: Customer) => { setCustomer(c); if (!lockedTicket) { setTicket(null); setTickets([]) } setSources([null]) }

  const chosenSources = sources.filter(Boolean) as SearchItem[]
  const canNext =
    (step === 0 && !!customer) ||
    (step === 1 && (ticketMode === 'new' || !!ticket)) ||
    (step === 2 && chosenSources.length > 0) ||
    step === 3

  const addSlot = () => { if (sources.length < MAX_SOURCES) setSources(s => [...s, null]) }
  const removeSlot = (i: number) => setSources(s => s.length === 1 ? [null] : s.filter((_, idx) => idx !== i))
  const setSlot = (i: number, item: SearchItem | null) => setSources(s => s.map((v, idx) => idx === i ? item : v))

  // Anexa UM item; atualiza o estado visual (⟳ → ✓/⚠). Nunca desfaz os que deram certo.
  const attachOne = async (itemId: number) => {
    setProcItems(ps => ps.map(p => p.id === itemId ? { ...p, status: 'processing' } : p))
    try {
      const r = await api.post<{ data: ProcItem }>(`/source-code/request-items/${itemId}/attach`, {})
      setProcItems(ps => ps.map(p => p.id === itemId ? { ...p, ...r.data } : p))
    } catch (e) {
      setProcItems(ps => ps.map(p => p.id === itemId ? { ...p, status: 'failed', error: (e as { message?: string })?.message ?? 'Erro' } : p))
    }
  }

  const confirmAndAttach = async () => {
    if (!customer || chosenSources.length === 0) return
    setSubmitting(true)
    try {
      const body = {
        customer_id: customer.id,
        ticket_id: ticketMode === 'existing' ? (ticket?.id ?? null) : null,
        items: chosenSources.map(s => ({ owner: s.owner, repository: s.repository, branch: s.branch, path: s.path })),
      }
      const r = await api.post<{ data: { id: number; items: ProcItem[] }; ticket: { id: number; ticket_number: string | null } }>('/source-code/requests', body)
      setReqInfo({ id: r.data.id, ticket_id: r.ticket.id, ticket_number: r.ticket.ticket_number })
      setProcItems(r.data.items.map(i => ({ ...i, status: 'pending' as const })))
      setPhase('processing')
      for (const it of r.data.items) { await attachOne(it.id) }   // sequencial
      await api.post(`/source-code/requests/${r.data.id}/finalize`, {}).catch(() => {})
      setPhase('done')
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? 'Erro ao criar a solicitação')
    } finally {
      setSubmitting(false)
    }
  }

  const retryFailed = async () => {
    const failed = procItems.filter(p => p.status === 'failed')
    for (const it of failed) { await attachOne(it.id) }
    if (reqInfo) await api.post(`/source-code/requests/${reqInfo.id}/finalize`, {}).catch(() => {})
  }

  return (
    <AppLayout title="Solicitação de Código-Fonte">
      <div className="max-w-3xl mx-auto">
        {/* Stepper */}
        <div className="flex items-center gap-2 mb-5">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
                  style={{ background: i <= step ? 'var(--primary)' : 'var(--surface-sunken)', color: i <= step ? 'var(--primary-fg)' : 'var(--text-light)' }}>
                  {i < step ? <Check size={13} /> : i + 1}
                </span>
                <span className="text-xs font-semibold" style={{ color: i === step ? 'var(--text)' : 'var(--text-light)' }}>{s}</span>
              </div>
              {i < STEPS.length - 1 && <span className="w-6 h-px" style={{ background: 'var(--border)' }} />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {/* PASSO 1 — CLIENTE */}
          {step === 0 && (
            <div>
              <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--text)' }}>Selecione o cliente</h2>
              <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>Só aparecem clientes com repositório de código-fonte configurado no cadastro. A busca fica restrita aos repositórios autorizados do cliente.</p>
              <div className="flex items-center gap-2 rounded-lg px-2.5 mb-2" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                <Search size={14} style={{ color: 'var(--text-light)' }} />
                <input value={custQuery} onChange={e => setCustQuery(e.target.value)} placeholder="Buscar cliente…" className="flex-1 bg-transparent outline-none text-sm py-2" style={{ color: 'var(--text)' }} />
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1">
                {custFiltered.map(c => (
                  <button key={c.id} onClick={() => pickCustomer(c)} className="w-full text-left flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm"
                    style={{ background: customer?.id === c.id ? 'var(--primary-soft)' : 'transparent', color: customer?.id === c.id ? 'var(--primary)' : 'var(--text)' }}>
                    <Building2 size={14} className="shrink-0" style={{ color: 'var(--text-light)' }} /> {c.name}
                    {customer?.id === c.id && <Check size={14} className="ml-auto" />}
                  </button>
                ))}
                {custFiltered.length === 0 && <p className="text-xs px-2 py-3" style={{ color: 'var(--text-light)' }}>Nenhum cliente com repositório configurado. Cadastre em Clientes → "Repositórios de Código-Fonte".</p>}
              </div>
            </div>
          )}

          {/* PASSO 2 — CHAMADO */}
          {step === 1 && lockedTicket && (
            <div>
              <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Chamado vinculado</h2>
              <div className="rounded-lg px-3 py-3 flex items-center gap-2" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)' }}>
                <FileCode size={16} style={{ color: 'var(--primary)' }} />
                <div className="min-w-0">
                  <div className="text-xs font-bold" style={{ color: 'var(--primary)' }}>{lockedTicket.ticket_number ?? `#${lockedTicket.id}`}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>As fontes serão anexadas a este chamado.</div>
                </div>
              </div>
            </div>
          )}

          {step === 1 && !lockedTicket && (
            <div>
              <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Existe um chamado relacionado?</h2>
              <div className="flex gap-2 mb-3">
                {([['existing', 'Sim, vincular chamado existente'], ['new', 'Não, criar chamado automaticamente']] as const).map(([m, label]) => (
                  <button key={m} onClick={() => setTicketMode(m)} className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-left"
                    style={{ background: ticketMode === m ? 'var(--primary-soft)' : 'var(--surface-sunken)', color: ticketMode === m ? 'var(--primary)' : 'var(--text-muted)', border: `1px solid ${ticketMode === m ? 'var(--primary)' : 'var(--border)'}` }}>{label}</button>
                ))}
              </div>
              {ticketMode === 'existing' ? (
                <div>
                  <div className="flex items-center gap-2 rounded-lg px-2.5 mb-2" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                    <Search size={14} style={{ color: 'var(--text-light)' }} />
                    <input value={ticketQuery} onChange={e => setTicketQuery(e.target.value)} placeholder={`Buscar chamado de ${customer?.name ?? ''}…`} className="flex-1 bg-transparent outline-none text-sm py-2" style={{ color: 'var(--text)' }} />
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {tickets.map(t => (
                      <button key={t.id} onClick={() => setTicket(t)} className="w-full text-left rounded-lg px-2.5 py-2"
                        style={{ background: ticket?.id === t.id ? 'var(--primary-soft)' : 'var(--surface-sunken)', border: `1px solid ${ticket?.id === t.id ? 'var(--primary)' : 'var(--border)'}` }}>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{t.ticket_number ?? `#${t.id}`}</span>
                          {t.status && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface)', color: t.status_color ?? 'var(--text-muted)' }}>{t.status}</span>}
                        </div>
                        <div className="text-[12px] truncate mt-0.5" style={{ color: 'var(--text)' }}>{t.subject}</div>
                      </button>
                    ))}
                    {tickets.length === 0 && <p className="text-xs px-2 py-3" style={{ color: 'var(--text-light)' }}>Nenhum chamado {ticketQuery ? 'encontrado' : 'ainda'} para este cliente.</p>}
                  </div>
                </div>
              ) : (
                <p className="text-xs rounded-lg px-3 py-3" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
                  Será criado um chamado automático — tipo <b>Solicitação de código-fonte</b>, cliente <b>{customer?.name}</b>, solicitado por você.
                </p>
              )}
            </div>
          )}

          {/* PASSO 3 — FONTES */}
          {step === 2 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Fontes solicitados</h2>
                <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{chosenSources.length}/{MAX_SOURCES}</span>
              </div>
              <div className="space-y-3">
                {sources.map((sel, i) => (
                  <div key={i} className="rounded-xl p-3" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Fonte {i + 1}</span>
                      <button onClick={() => removeSlot(i)} title="Remover" style={{ color: 'var(--text-light)' }}><X size={14} /></button>
                    </div>
                    {sel ? (
                      <ConsolidatedSource item={sel} onChange={() => setSlot(i, null)} />
                    ) : (
                      <SourcePicker customerId={customer!.id} onPick={item => setSlot(i, item)} />
                    )}
                  </div>
                ))}
              </div>
              <button onClick={addSlot} disabled={sources.length >= MAX_SOURCES} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--primary)', opacity: sources.length >= MAX_SOURCES ? 0.5 : 1 }}>
                <Plus size={14} /> Adicionar outro fonte
              </button>
            </div>
          )}

          {/* PASSO 4 — CONFIRMAÇÃO */}
          {step === 3 && phase === 'form' && (
            <div>
              <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Solicitação de código-fonte</h2>
              <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                <div><div className="text-[10px]" style={{ color: 'var(--text-light)' }}>Cliente</div><div className="font-semibold" style={{ color: 'var(--text)' }}>{customer?.name}</div></div>
                <div><div className="text-[10px]" style={{ color: 'var(--text-light)' }}>Chamado</div><div className="font-semibold" style={{ color: 'var(--text)' }}>{ticketMode === 'new' ? 'Criar automático' : (ticket?.ticket_number ?? `#${ticket?.id}`)}</div></div>
              </div>
              <div className="text-[11px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Fontes ({chosenSources.length})</div>
              <div className="space-y-1.5">
                {chosenSources.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                    <FileCode size={13} className="shrink-0" style={{ color: 'var(--primary)' }} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{i + 1}. {s.name}</div>
                      <div className="truncate" style={{ color: 'var(--text-light)' }}>{s.owner}/{s.repository} · {s.branch} · {s.path}</div>
                    </div>
                    <div className="text-right shrink-0 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      <div>{fmtDateTime(s.commit?.date)}</div>
                      <div className="text-[10px]">{shortSha(s.commit?.sha)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {step === 3 && phase !== 'form' && (
            <div>
              <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>{phase === 'done' ? 'Solicitação concluída' : 'Anexando os fontes…'}</h2>
              <div className="space-y-1.5">
                {procItems.map(p => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                    {p.status === 'attached' ? <Check size={14} className="shrink-0" style={{ color: 'var(--success-border)' }} />
                      : p.status === 'failed' ? <AlertTriangle size={14} className="shrink-0" style={{ color: 'var(--danger-border)' }} />
                      : <Loader2 size={14} className="shrink-0 animate-spin" style={{ color: 'var(--text-light)' }} />}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{p.filename}</div>
                      {p.status === 'failed' && p.error && <div className="truncate" style={{ color: 'var(--danger-border)' }}>{p.error}</div>}
                      {p.status === 'attached' && <div className="truncate" style={{ color: 'var(--text-light)' }}>{fmtDateTime(p.original_commit_at)} · {shortSha(p.original_commit_sha)}</div>}
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold" style={{ color: p.status === 'attached' ? 'var(--success-border)' : p.status === 'failed' ? 'var(--danger-border)' : 'var(--text-muted)' }}>
                      {p.status === 'attached' ? '✓ Anexado' : p.status === 'failed' ? '⚠ Falha' : '⟳ Processando'}
                    </span>
                  </div>
                ))}
              </div>
              {phase === 'done' && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {procItems.some(p => p.status === 'failed') && (
                    <button onClick={retryFailed} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Tentar novamente</button>
                  )}
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Anexados na interação <b>"Códigos-fonte anexados"</b> do chamado {reqInfo?.ticket_number ?? ''}.</p>
                </div>
              )}
            </div>
          )}

          {/* Navegação */}
          <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0 || phase !== 'form'} className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--text-muted)', opacity: (step === 0 || phase !== 'form') ? 0.4 : 1 }}>
              <ChevronLeft size={14} /> Voltar
            </button>
            {phase === 'form' && step < 3 && (
              <button onClick={() => setStep(s => s + 1)} disabled={!canNext} className="inline-flex items-center gap-1 text-xs font-semibold px-4 py-2 rounded-lg" style={{ background: 'var(--primary)', color: 'var(--primary-fg)', opacity: canNext ? 1 : 0.5 }}>
                Avançar <ChevronRight size={14} />
              </button>
            )}
            {phase === 'form' && step === 3 && (
              <button onClick={confirmAndAttach} disabled={submitting || chosenSources.length === 0} className="inline-flex items-center gap-1 text-xs font-semibold px-4 py-2 rounded-lg" style={{ background: 'var(--primary)', color: 'var(--primary-fg)', opacity: (submitting || chosenSources.length === 0) ? 0.5 : 1 }}>
                {submitting ? <><Loader2 size={13} className="animate-spin" /> Enviando…</> : <>Confirmar e anexar</>}
              </button>
            )}
            {phase === 'processing' && (
              <button disabled className="inline-flex items-center gap-1 text-xs font-semibold px-4 py-2 rounded-lg" style={{ background: 'var(--primary)', color: 'var(--primary-fg)', opacity: 0.6, cursor: 'not-allowed' }}>
                <Loader2 size={13} className="animate-spin" /> Processando…
              </button>
            )}
            {phase === 'done' && (
              <button onClick={() => reqInfo && router.push(`/help-desk/tickets/${reqInfo.ticket_id}`)} className="inline-flex items-center gap-1 text-xs font-semibold px-4 py-2 rounded-lg" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
                Ir para o chamado <ExternalLink size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

/** Card consolidado de um fonte já selecionado. */
function ConsolidatedSource({ item, onChange }: { item: SearchItem; onChange: () => void }) {
  return (
    <div>
      <div className="flex items-start gap-2">
        <FileCode size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--primary)' }} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{item.name}</div>
          <div className="text-[11px] truncate" style={{ color: 'var(--text-light)' }}>{item.owner}/{item.repository} · {item.branch} · {item.path}</div>
          <div className="text-[11px] mt-1 flex flex-wrap gap-x-3" style={{ color: 'var(--text-muted)' }}>
            <span>Última alteração: <b style={{ color: 'var(--text)' }}>{fmtDateTime(item.commit?.date)}</b></span>
            <span title={item.commit?.author ?? undefined}>Commit: {shortSha(item.commit?.sha)}</span>
          </div>
        </div>
        <button onClick={onChange} className="text-[11px] font-semibold shrink-0" style={{ color: 'var(--primary)' }}>Alterar seleção</button>
      </div>
    </div>
  )
}

/** Busca fuzzy de fontes dentro dos repos do cliente (debounce próprio). Não seleciona sozinho. */
function SourcePicker({ customerId, onPick }: { customerId: number; onPick: (i: SearchItem) => void }) {
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<SearchItem[]>([])
  const [truncated, setTruncated] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const run = useCallback((term: string) => {
    if (timer.current) clearTimeout(timer.current)
    if (!term.trim()) { setItems([]); setLoading(false); return }
    setLoading(true)
    timer.current = setTimeout(() => {
      api.get<{ items: SearchItem[]; truncated: boolean }>(`/source-code/search?customer_id=${customerId}&q=${encodeURIComponent(term.trim())}`)
        .then(r => { setItems(r?.items ?? []); setTruncated(!!r?.truncated) })
        .catch(() => setItems([]))
        .finally(() => setLoading(false))
    }, 400)
  }, [customerId])

  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg px-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {loading ? <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-light)' }} /> : <Search size={14} style={{ color: 'var(--text-light)' }} />}
        <input value={q} onChange={e => { setQ(e.target.value); run(e.target.value) }} placeholder="Nome ou parte do fonte (ex.: MATA410)…" className="flex-1 bg-transparent outline-none text-sm py-2" style={{ color: 'var(--text)' }} />
      </div>
      {q.trim() && !loading && items.length === 0 && <p className="text-[11px] px-1 py-2" style={{ color: 'var(--text-light)' }}>Nenhum fonte encontrado nos repositórios do cliente.</p>}
      <div className="mt-2 space-y-1">
        {items.map((it, idx) => (
          <button key={idx} onClick={() => onPick(it)} className="w-full text-left rounded-lg px-2.5 py-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{it.name}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{it.tipo}</span>
            </div>
            <div className="text-[11px] truncate" style={{ color: 'var(--text-light)' }}>{it.repository} / {it.path}</div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Última alteração: {fmtDateTime(it.commit?.date)} · {it.branch} · {shortSha(it.commit?.sha)}</div>
          </button>
        ))}
        {truncated && <p className="text-[10px] px-1" style={{ color: 'var(--text-light)' }}>Muitos arquivos no repositório — refine o termo.</p>}
      </div>
    </div>
  )
}
