'use client'

// Central de Fontes — gestão das solicitações de fonte (empresa, escopo, chamado,
// prioridade, solicitante). Ações: atender / rejeitar / reabrir. Só leitura do acervo.

import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, FilePlus2, GitCommitHorizontal, Ticket } from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, SkeletonTable, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'

interface Req {
  id: number
  customer_id: number | null
  customer_name: string | null
  repository: string | null
  ticket: string | null
  priority: 'baixa' | 'media' | 'alta' | string
  scope_type: 'source' | 'folder' | 'repository' | string
  paths: string[] | null
  note: string | null
  status: 'open' | 'provisioned' | 'rejected' | string
  requester_name: string | null
  hd_ticket_id: number | null
  hd_subject: string | null
  created_at: string | null
  kind?: 'provisioning' | 'ticket'
  raw_status?: string
}

interface Gmud {
  id: number; source_doc_id: number; ticket_number: string | null; gmud_id: number | null
  source_commit_sha: string | null; responsavel: string | null; diff_summary: string | null
  created_at: string | null; filename: string; repository: string; owner: string
  customer_id: number | null; customer_name: string | null
  hd_ticket_id: number | null; hd_subject: string | null
}

const dt = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR') : '—')
const shortSha = (s: string | null) => (s ? s.slice(0, 8) : '—')
const prioBadge = (p: string) => p === 'alta' ? <Badge variant="danger">Alta</Badge> : p === 'baixa' ? <Badge variant="default">Baixa</Badge> : <Badge variant="warning">Média</Badge>
const scopeLabel = (r: Req) => r.scope_type === 'folder' ? `Pasta${r.paths?.[0] ? ` · ${r.paths[0]}` : ''}` : r.scope_type === 'source' ? `${r.paths?.length ?? 0} fonte${(r.paths?.length ?? 0) === 1 ? '' : 's'}` : 'Repositório'

export default function SolicitacoesPage() {
  const [view, setView] = useState<'solicitacoes' | 'gmud'>('solicitacoes')
  const [rows, setRows] = useState<Req[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sCustomer, setSCustomer] = useState('')
  const [custText, setCustText] = useState('')
  const [sQ, setSQ] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [gmud, setGmud] = useState<Gmud[] | null>(null)
  const [gmudErr, setGmudErr] = useState<string | null>(null)
  const [customers, setCustomers] = useState<{ customer_id: number; name: string }[]>([])
  const [gCustomer, setGCustomer] = useState('')
  const [gQ, setGQ] = useState('')
  const [gFrom, setGFrom] = useState('')
  const [gTo, setGTo] = useState('')

  const load = useCallback(() => {
    setRows(null); setError(null)
    const p = new URLSearchParams({ status: 'all' })   // sem mecanismo de aprovação → sempre todas
    if (sCustomer) p.set('customer_id', sCustomer)
    api.get<{ data: Req[] }>(`/source-docs/source-requests?${p.toString()}`)
      .then((r) => setRows(r.data))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Falha ao carregar as solicitações.'))
  }, [sCustomer])
  useEffect(() => { load() }, [load])

  // Busca de texto (client-side) sobre o que já veio.
  const filtered = (rows ?? []).filter((r) => {
    const q = sQ.trim().toLowerCase()
    if (!q) return true
    return [r.customer_name, r.ticket, r.hd_subject, r.requester_name, r.repository].some((x) => (x ?? '').toString().toLowerCase().includes(q))
  })

  useEffect(() => { api.get<{ data: { customer_id: number; name: string }[] }>('/source-docs/tree/customers').then((r) => setCustomers(r.data)).catch(() => {}) }, [])

  const loadGmud = useCallback(() => {
    setGmud(null); setGmudErr(null)
    const p = new URLSearchParams()
    if (gCustomer) p.set('customer_id', gCustomer)
    if (gQ.trim()) p.set('q', gQ.trim())
    if (gFrom) p.set('from', gFrom)
    if (gTo) p.set('to', gTo)
    api.get<{ data: Gmud[] }>(`/source-docs/gmud-commits?${p.toString()}`)
      .then((r) => setGmud(r.data))
      .catch((e) => setGmudErr(e instanceof ApiError ? e.message : 'Falha ao carregar os commits.'))
  }, [gCustomer, gQ, gFrom, gTo])
  useEffect(() => { if (view !== 'gmud') return; const t = setTimeout(loadGmud, 300); return () => clearTimeout(t) }, [view, loadGmud])

  const on = 'bg-[var(--primary,#157582)] text-white'
  const off = 'text-[color:var(--muted-fg)] hover:text-[color:var(--fg)]'

  const setReqStatus = async (id: number, s: string) => {
    setBusy(id)
    try { await api.patch(`/source-docs/source-requests/${id}`, { status: s }); toast.success('Solicitação atualizada.'); load() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao atualizar.') }
    finally { setBusy(null) }
  }

  return (
    <>
      <PageHeader icon={FilePlus2} title="Solicitações e GMUDs" subtitle="Pedidos de provisionamento de fontes e os commits de mudança (GMUD) do acervo." />

      <div className="mb-4 inline-flex overflow-hidden rounded-lg border border-[color:var(--border)] text-sm">
        <button onClick={() => setView('solicitacoes')} className={`flex items-center gap-1.5 px-4 py-2 font-medium ${view === 'solicitacoes' ? on : off}`}><FilePlus2 size={14} /> Solicitações</button>
        <button onClick={() => setView('gmud')} className={`flex items-center gap-1.5 border-l border-[color:var(--border)] px-4 py-2 font-medium ${view === 'gmud' ? on : off}`}><GitCommitHorizontal size={14} /> Commits GMUD</button>
      </div>

      {view === 'solicitacoes' ? (
      <Card padding="none">
        <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2 flex-wrap">
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Solicitações</div>
          <div className="flex items-center gap-2 flex-wrap">
            <input value={sQ} onChange={(e) => setSQ(e.target.value)} placeholder="Buscar (empresa, chamado, assunto, solicitante)…"
              className="rounded-lg border border-[color:var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[color:var(--text)] outline-none w-72 max-w-full" />
            <input list="cf-solic-customers" value={custText}
              onChange={(e) => { const v = e.target.value; setCustText(v); const m = customers.find((c) => c.name.toLowerCase() === v.trim().toLowerCase()); setSCustomer(m ? String(m.customer_id) : '') }}
              placeholder="Cliente (digite ou escolha)…"
              className="rounded-lg border border-[color:var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[color:var(--text)] outline-none w-56 max-w-full" />
            <datalist id="cf-solic-customers">
              {customers.map((c) => <option key={c.customer_id} value={c.name} />)}
            </datalist>
          </div>
        </div>

        {error ? <EmptyState icon={FilePlus2} title="Erro" description={error} />
          : rows === null ? <SkeletonTable rows={6} cols={7} />
            : filtered.length === 0 ? <EmptyState icon={FilePlus2} title="Nenhuma solicitação" description={sQ || sCustomer ? 'Nada encontrado com esses filtros.' : 'Não há solicitações.'} />
              : (
                <div className="overflow-x-auto">
                  <Table>
                    <Thead><Tr><Th>Empresa</Th><Th>Escopo</Th><Th>Chamado</Th><Th>Prioridade</Th><Th>Solicitante</Th><Th>Data</Th><Th></Th></Tr></Thead>
                    <Tbody>
                      {filtered.map((r) => (
                        <Tr key={r.id} onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="cursor-pointer">
                          <Td><div className="font-medium">{r.customer_name ?? (r.customer_id ? `#${r.customer_id}` : '—')}</div><div className="text-xs" style={{ color: 'var(--text-light)' }}>{r.repository ?? '—'}</div></Td>
                          <Td><div className="text-sm">{scopeLabel(r)}</div>{expanded === r.id && r.paths && r.paths.length > 0 && <div className="mt-1 max-w-md text-xs" style={{ color: 'var(--text-light)' }}>{r.paths.slice(0, 20).join(', ')}{r.paths.length > 20 ? '…' : ''}</div>}{expanded === r.id && r.note && <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Obs.: {r.note}</div>}</Td>
                          <Td>{r.ticket ? (r.hd_ticket_id ? <a href={`/help-desk/tickets/${r.hd_ticket_id}`} onClick={(e) => e.stopPropagation()} title={r.hd_subject ? `Abrir chamado: ${r.hd_subject}` : 'Abrir chamado'} className="group inline-flex items-center gap-1"><Badge variant="success">#{r.ticket}</Badge><Ticket size={12} style={{ color: 'var(--primary)' }} className="opacity-60 group-hover:opacity-100" /></a> : <Badge variant="default">#{r.ticket}</Badge>) : '—'}</Td>
                          <Td>{prioBadge(r.priority)}</Td>
                          <Td className="text-sm">{r.requester_name ?? '—'}</Td>
                          <Td className="text-xs">{dt(r.created_at)}</Td>
                          <Td>
                            <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-end gap-1">
                              {r.kind === 'ticket' ? (
                                <span className="text-xs" style={{ color: 'var(--text-light)' }} title="Pedido aberto pelo chamado — atendido no próprio chamado">via chamado</span>
                              ) : (
                                <>
                                  {r.status !== 'provisioned' && <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => setReqStatus(r.id, 'provisioned')}>Atender</Button>}
                                  {r.status === 'open' && <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => setReqStatus(r.id, 'rejected')}>Rejeitar</Button>}
                                  {r.status !== 'open' && <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => setReqStatus(r.id, 'open')}>Reabrir</Button>}
                                </>
                              )}
                            </div>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
      </Card>
      ) : (
      <Card padding="none">
        <div className="flex flex-wrap items-end gap-2 border-b border-[color:var(--border)] px-5 py-3">
          <label className="flex flex-col text-[11px] uppercase tracking-wide text-[color:var(--text-light)]">Cliente
            <select value={gCustomer} onChange={(e) => setGCustomer(e.target.value)} className="mt-1 rounded-lg border border-[color:var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm normal-case text-[color:var(--text)] outline-none"><option value="">Todas</option>{customers.map((c) => <option key={c.customer_id} value={c.customer_id}>{c.name}</option>)}</select>
          </label>
          <label className="flex min-w-[180px] flex-1 flex-col text-[11px] uppercase tracking-wide text-[color:var(--text-light)]">Buscar fonte
            <input value={gQ} onChange={(e) => setGQ(e.target.value)} placeholder="nome do fonte…" className="mt-1 rounded-lg border border-[color:var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm normal-case text-[color:var(--text)] outline-none" />
          </label>
          <label className="flex flex-col text-[11px] uppercase tracking-wide text-[color:var(--text-light)]">De
            <input type="date" value={gFrom} onChange={(e) => setGFrom(e.target.value)} className="mt-1 rounded-lg border border-[color:var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[color:var(--text)] outline-none" />
          </label>
          <label className="flex flex-col text-[11px] uppercase tracking-wide text-[color:var(--text-light)]">Até
            <input type="date" value={gTo} onChange={(e) => setGTo(e.target.value)} className="mt-1 rounded-lg border border-[color:var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[color:var(--text)] outline-none" />
          </label>
        </div>
        {gmudErr ? <EmptyState icon={GitCommitHorizontal} title="Erro" description={gmudErr} />
          : gmud === null ? <SkeletonTable rows={6} cols={7} />
            : gmud.length === 0 ? <EmptyState icon={GitCommitHorizontal} title="Sem commits de GMUD" description="Nenhuma versão de fonte criada via GMUD no seu escopo." />
              : (
                <div className="overflow-x-auto">
                  <Table>
                    <Thead><Tr><Th>Fonte</Th><Th>Empresa</Th><Th>Chamado</Th><Th>Commit</Th><Th>Responsável</Th><Th>Resumo</Th><Th>Data</Th></Tr></Thead>
                    <Tbody>
                      {gmud.map((g) => (
                        <Tr key={g.id}>
                          <Td><a href={`/central-fontes/acervo?doc=${g.source_doc_id}`} className="font-medium hover:underline" style={{ color: 'var(--primary)' }}>{g.filename}</a><div className="text-xs" style={{ color: 'var(--text-light)' }}>{g.owner}/{g.repository}</div></Td>
                          <Td className="text-sm">{g.customer_name ?? (g.customer_id ? `#${g.customer_id}` : '—')}</Td>
                          <Td>{g.hd_ticket_id ? <a href={`/help-desk/tickets/${g.hd_ticket_id}`} title={g.hd_subject ? `Abrir chamado: ${g.hd_subject}` : 'Abrir chamado'} className="group inline-flex flex-col gap-0.5"><span className="inline-flex items-center gap-1"><Badge variant="success">#{g.ticket_number}</Badge><Ticket size={12} style={{ color: 'var(--primary)' }} className="opacity-60 group-hover:opacity-100" /></span>{g.hd_subject && <span className="max-w-[180px] truncate text-xs group-hover:underline" style={{ color: 'var(--text-light)' }}>{g.hd_subject}</span>}</a> : g.ticket_number ? <Badge variant="default">{g.ticket_number}</Badge> : g.gmud_id ? <Badge variant="default">GMUD #{g.gmud_id}</Badge> : '—'}</Td>
                          <Td>{g.source_commit_sha ? <a href={`https://github.com/${g.owner}/${g.repository}/commit/${g.source_commit_sha}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 font-mono text-xs hover:underline" style={{ color: 'var(--primary)' }}>{shortSha(g.source_commit_sha)} <ExternalLink size={11} /></a> : '—'}</Td>
                          <Td className="text-sm">{g.responsavel ?? '—'}</Td>
                          <Td className="max-w-xs truncate text-xs" style={{ color: 'var(--text-muted)' }}>{g.diff_summary ?? '—'}</Td>
                          <Td className="text-xs">{dt(g.created_at)}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
      </Card>
      )}
    </>
  )
}
