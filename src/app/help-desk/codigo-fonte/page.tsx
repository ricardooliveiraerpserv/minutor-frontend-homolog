'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Search, Plus, X, Check, ChevronLeft, ChevronRight, FileCode, Loader2, Building2 } from 'lucide-react'

/**
 * Fase 1B — Wizard de Solicitação de Código-Fonte (Help Desk).
 * 4 passos: Cliente → Chamado → Fontes 1…N → Confirmação. Consome os endpoints da 1A
 * (/source-code/search e /source-code/tickets). A criação/anexação é a 1C.
 */
interface Customer { id: number; name: string }
interface TicketRow { id: number; ticket_number: string | null; subject: string; status: string | null; status_color?: string | null }
interface Commit { sha: string | null; date: string | null; author: string | null; message: string | null }
interface SearchItem { owner: string; repository: string; tipo: string; branch: string; path: string; name: string; commit: Commit | null }

const MAX_SOURCES = 30
const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const shortSha = (s?: string | null) => (s ? s.slice(0, 7) : '—')
const STEPS = ['Cliente', 'Chamado', 'Fontes', 'Confirmação']

export default function CodigoFontePage() {
  const [step, setStep] = useState(0) // 0..3

  // Passo 1 — Cliente
  const [customers, setCustomers] = useState<Customer[]>([])
  const [custQuery, setCustQuery] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)

  // Passo 2 — Chamado
  const [ticketMode, setTicketMode] = useState<'existing' | 'new'>('existing')
  const [ticketQuery, setTicketQuery] = useState('')
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [ticket, setTicket] = useState<TicketRow | null>(null)

  // Passo 3 — Fontes (cada slot = 1 fonte; null = ainda buscando)
  const [sources, setSources] = useState<(SearchItem | null)[]>([null])

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

  const pickCustomer = (c: Customer) => { setCustomer(c); setTicket(null); setTickets([]); setSources([null]) }

  const chosenSources = sources.filter(Boolean) as SearchItem[]
  const canNext =
    (step === 0 && !!customer) ||
    (step === 1 && (ticketMode === 'new' || !!ticket)) ||
    (step === 2 && chosenSources.length > 0) ||
    step === 3

  const addSlot = () => { if (sources.length < MAX_SOURCES) setSources(s => [...s, null]) }
  const removeSlot = (i: number) => setSources(s => s.length === 1 ? [null] : s.filter((_, idx) => idx !== i))
  const setSlot = (i: number, item: SearchItem | null) => setSources(s => s.map((v, idx) => idx === i ? item : v))

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
          {step === 1 && (
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
          {step === 3 && (
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
              <p className="mt-3 text-[11px] rounded-lg px-3 py-2" style={{ background: 'var(--warning-bg)', color: 'var(--warning-border)' }}>
                O botão <b>Confirmar e anexar</b> (processamento por fonte + anexação no chamado) entra na próxima etapa (1C). Por ora, este passo já valida a busca e a seleção.
              </p>
            </div>
          )}

          {/* Navegação */}
          <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--text-muted)', opacity: step === 0 ? 0.4 : 1 }}>
              <ChevronLeft size={14} /> Voltar
            </button>
            {step < 3 ? (
              <button onClick={() => setStep(s => s + 1)} disabled={!canNext} className="inline-flex items-center gap-1 text-xs font-semibold px-4 py-2 rounded-lg" style={{ background: 'var(--primary)', color: 'var(--primary-fg)', opacity: canNext ? 1 : 0.5 }}>
                Avançar <ChevronRight size={14} />
              </button>
            ) : (
              <button disabled title="Disponível na etapa 1C" className="inline-flex items-center gap-1 text-xs font-semibold px-4 py-2 rounded-lg" style={{ background: 'var(--primary)', color: 'var(--primary-fg)', opacity: 0.5, cursor: 'not-allowed' }}>
                Confirmar e anexar
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
