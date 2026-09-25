'use client'

// Help Desk → "Solicitações de Código-Fonte" — relação de TODAS as solicitações de
// fonte feitas + commits de GMUD (consulta e rastreabilidade). Adaptada do Central de
// Fontes do homolog: no dev2 NÃO há o contexto de empresa do Prosight, então a tela
// carrega todas as empresas (admin) e as ações (atender/rejeitar/reabrir) ficam sempre
// liberadas. Extras: baixar o FONTE ANEXO (.zip do commit) e ABRIR O CHAMADO num
// painel lateral (drawer), sem sair da tela — nas duas abas.

import { useCallback, useEffect, useState } from 'react'
import { Download, ExternalLink, FilePlus2, GitCommitHorizontal, Info, Paperclip, Ticket, X } from 'lucide-react'
import { AppLayout } from '@/components/layout/app-layout'
import { Badge, Button, Card, EmptyState, PageHeader, SkeletonTable, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { DateRangePicker } from '@/components/ui/date-range-picker'

interface Source {
  filename: string
  path: string | null
  repository: string | null
  status: string
  attachment_id: number | null
}

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
  sources?: Source[]
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

export default function SolicitacoesFontePage() {
  const [view, setView] = useState<'solicitacoes' | 'gmud'>('solicitacoes')
  const [rows, setRows] = useState<Req[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sQ, setSQ] = useState('')
  const [dateMode, setDateMode] = useState<'month' | 'period'>('month')
  const [refMonth, setRefMonth] = useState<number | null>(null)
  const [refYear, setRefYear] = useState<number | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [dlBusy, setDlBusy] = useState<number | null>(null)
  const [gmud, setGmud] = useState<Gmud[] | null>(null)
  const [gmudErr, setGmudErr] = useState<string | null>(null)
  const [gQ, setGQ] = useState('')
  const [gFrom, setGFrom] = useState('')
  const [gTo, setGTo] = useState('')

  // Drawer do chamado (abrir sem sair da tela)
  const [drawerTicket, setDrawerTicket] = useState<number | null>(null)
  const [tk, setTk] = useState<Record<string, any> | null>(null)
  const [tkLoading, setTkLoading] = useState(false)

  const load = useCallback(() => {
    setRows(null); setError(null)
    const p = new URLSearchParams({ status: 'all' })   // todas as solicitações, todas as empresas
    api.get<{ data: Req[] }>(`/source-docs/source-requests?${p.toString()}`)
      .then((r) => setRows(r.data))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Falha ao carregar as solicitações.'))
  }, [])
  useEffect(() => { load() }, [load])

  const inDate = (iso: string | null) => {
    if (dateMode === 'month') {
      if (refMonth == null || refYear == null) return true
      if (!iso) return false
      const d = new Date(iso)
      return d.getMonth() + 1 === refMonth && d.getFullYear() === refYear
    }
    if (!dateFrom && !dateTo) return true
    if (!iso) return false
    const t = new Date(iso).getTime()
    if (dateFrom && t < new Date(`${dateFrom}T00:00:00`).getTime()) return false
    if (dateTo && t > new Date(`${dateTo}T23:59:59`).getTime()) return false
    return true
  }
  const filtered = (rows ?? []).filter((r) => {
    if (!inDate(r.created_at)) return false
    const q = sQ.trim().toLowerCase()
    if (!q) return true
    return [r.customer_name, r.ticket, r.hd_subject, r.requester_name, r.repository].some((x) => (x ?? '').toString().toLowerCase().includes(q))
  })

  const loadGmud = useCallback(() => {
    setGmud(null); setGmudErr(null)
    const p = new URLSearchParams()
    if (gQ.trim()) p.set('q', gQ.trim())
    if (gFrom) p.set('from', gFrom)
    if (gTo) p.set('to', gTo)
    api.get<{ data: Gmud[] }>(`/source-docs/gmud-commits?${p.toString()}`)
      .then((r) => setGmud(r.data))
      .catch((e) => setGmudErr(e instanceof ApiError ? e.message : 'Falha ao carregar os commits.'))
  }, [gQ, gFrom, gTo])
  useEffect(() => { if (view !== 'gmud') return; const t = setTimeout(loadGmud, 300); return () => clearTimeout(t) }, [view, loadGmud])

  const on = 'bg-[var(--primary,#157582)] text-white'
  const off = 'text-[color:var(--text-muted)] hover:text-[color:var(--text)]'

  const setReqStatus = async (id: number, s: string) => {
    setBusy(id)
    try { await api.patch(`/source-docs/source-requests/${id}`, { status: s }); toast.success('Solicitação atualizada.'); load() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao atualizar.') }
    finally { setBusy(null) }
  }

  // Fonte anexo: pega a URL assinada e abre p/ download.
  const downloadSource = async (attId: number | null) => {
    if (!attId) return
    setDlBusy(attId)
    try {
      const r = await api.get<{ url: string }>(`/attachments/${attId}/url`)
      if (r?.url) window.open(r.url, '_blank', 'noopener')
      else toast.error('Fonte indisponível para download.')
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao obter o fonte.') }
    finally { setDlBusy(null) }
  }

  // Abrir chamado no drawer (sem sair da tela).
  const openTicket = useCallback((id: number | null) => {
    if (!id) return
    setDrawerTicket(id); setTk(null); setTkLoading(true)
    api.get<{ data: Record<string, any> }>(`/help-desk/tickets/${id}`)
      .then((r) => setTk(r.data))
      .catch((e) => toast.error(e instanceof ApiError ? e.message : 'Falha ao carregar o chamado.'))
      .finally(() => setTkLoading(false))
  }, [])

  const attachedCount = (r: Req) => (r.sources ?? []).filter((s) => s.attachment_id).length

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</span>
      <span className="text-sm" style={{ color: 'var(--text)' }}>{value ?? '—'}</span>
    </div>
  )

  return (
    <AppLayout title="Solicitações de Código-Fonte">
      <PageHeader icon={FilePlus2} title="Solicitações de Código-Fonte" subtitle="Consulta e rastreabilidade — todas as solicitações de fonte e commits de GMUD." />

      <div className="mb-4 flex items-start gap-2 rounded-xl px-4 py-2.5 text-xs" style={{ background: 'var(--info-bg)', color: 'var(--info)', border: '1px solid var(--info)' }}>
        <Info size={14} className="mt-px shrink-0" />
        <span>
          Visão de <b>consulta e rastreabilidade</b> das solicitações. Baixe o <b>fonte anexo</b> (.zip do commit) e abra o <b>chamado</b> no painel lateral, sem sair da tela.
        </span>
      </div>

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
            <div className="inline-flex items-center gap-1.5">
              <div className="flex rounded-lg overflow-hidden text-xs" style={{ border: '1px solid var(--border)' }}>
                {(['month', 'period'] as const).map((mode) => (
                  <button key={mode} onClick={() => setDateMode(mode)} className="px-2.5 py-1.5 font-medium transition-colors"
                    style={{ background: dateMode === mode ? 'var(--primary)' : 'transparent', color: dateMode === mode ? 'var(--primary-fg)' : 'var(--text-muted)' }}>
                    {mode === 'month' ? 'Mês/Ano' : 'Período'}
                  </button>
                ))}
              </div>
              {dateMode === 'month'
                ? <MonthYearPicker month={refMonth} year={refYear} onChange={(m, y) => { if (!m) { setRefMonth(null); setRefYear(null) } else { setRefMonth(m); setRefYear(y) } }} />
                : <DateRangePicker from={dateFrom} to={dateTo} onChange={(fr, to) => { setDateFrom(fr); setDateTo(to) }} />}
            </div>
          </div>
        </div>

        {error ? <EmptyState icon={FilePlus2} title="Erro" description={error} />
          : rows === null ? <SkeletonTable rows={6} cols={8} />
            : filtered.length === 0 ? <EmptyState icon={FilePlus2} title="Nenhuma solicitação" description={sQ ? 'Nada encontrado com esses filtros.' : 'Não há solicitações.'} />
              : (
                <div className="overflow-x-auto">
                  <Table>
                    <Thead><Tr><Th>Empresa</Th><Th>Escopo</Th><Th>Fonte</Th><Th>Chamado</Th><Th>Prioridade</Th><Th>Solicitante</Th><Th>Data</Th><Th></Th></Tr></Thead>
                    <Tbody>
                      {filtered.map((r) => (
                        <Tr key={r.id} onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="cursor-pointer">
                          <Td><div className="font-medium">{r.customer_name ?? (r.customer_id ? `#${r.customer_id}` : '—')}</div><div className="text-xs" style={{ color: 'var(--text-light)' }}>{r.repository ?? '—'}</div></Td>
                          <Td>
                            <div className="text-sm">{scopeLabel(r)}</div>
                            {expanded === r.id && r.paths && r.paths.length > 0 && <div className="mt-1 max-w-md text-xs" style={{ color: 'var(--text-light)' }}>{r.paths.slice(0, 20).join(', ')}{r.paths.length > 20 ? '…' : ''}</div>}
                            {expanded === r.id && r.note && <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Obs.: {r.note}</div>}
                            {expanded === r.id && r.sources && r.sources.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                                {r.sources.map((s, i) => (
                                  <button key={i} disabled={!s.attachment_id || dlBusy === s.attachment_id} onClick={() => downloadSource(s.attachment_id)}
                                    title={s.attachment_id ? 'Baixar o fonte (.zip do commit)' : (s.status === 'failed' ? 'Falha ao obter o fonte' : 'Fonte ainda não anexado')}
                                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                                    style={{ borderColor: 'var(--border)', color: s.attachment_id ? 'var(--primary)' : 'var(--text-light)', background: 'var(--surface-hover)' }}>
                                    <Download size={11} /> {s.filename}{s.attachment_id ? '' : ` (${s.status})`}
                                  </button>
                                ))}
                              </div>
                            )}
                          </Td>
                          <Td>
                            {attachedCount(r) > 0
                              ? <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--primary)' }} title="Fontes anexados — expanda a linha para baixar"><Paperclip size={12} /> {attachedCount(r)}</span>
                              : <span className="text-xs" style={{ color: 'var(--text-light)' }}>—</span>}
                          </Td>
                          <Td>{r.ticket ? <Badge variant={r.hd_ticket_id ? 'success' : 'default'}>#{r.ticket}</Badge> : '—'}</Td>
                          <Td>{prioBadge(r.priority)}</Td>
                          <Td className="text-sm">{r.requester_name ?? '—'}</Td>
                          <Td className="text-xs">{dt(r.created_at)}</Td>
                          <Td>
                            <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-end gap-1">
                              {r.hd_ticket_id && (
                                <Button size="sm" variant="secondary" onClick={() => openTicket(r.hd_ticket_id)} title="Abrir o chamado sem sair da tela"><Ticket size={13} /> Chamado</Button>
                              )}
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
            : gmud.length === 0 ? <EmptyState icon={GitCommitHorizontal} title="Sem commits de GMUD" description="Nenhuma versão de fonte criada via GMUD." />
              : (
                <div className="overflow-x-auto">
                  <Table>
                    <Thead><Tr><Th>Fonte</Th><Th>Empresa</Th><Th>Chamado</Th><Th>Commit</Th><Th>Responsável</Th><Th>Resumo</Th><Th>Data</Th><Th></Th></Tr></Thead>
                    <Tbody>
                      {gmud.map((g) => (
                        <Tr key={g.id}>
                          <Td><div className="font-medium">{g.filename}</div><div className="text-xs" style={{ color: 'var(--text-light)' }}>{g.owner}/{g.repository}</div></Td>
                          <Td className="text-sm">{g.customer_name ?? (g.customer_id ? `#${g.customer_id}` : '—')}</Td>
                          <Td>{g.hd_ticket_id ? <button onClick={() => openTicket(g.hd_ticket_id)} title={g.hd_subject ? `Abrir chamado: ${g.hd_subject}` : 'Abrir chamado'} className="group inline-flex flex-col gap-0.5 text-left"><span className="inline-flex items-center gap-1"><Badge variant="success">#{g.ticket_number}</Badge><Ticket size={12} style={{ color: 'var(--primary)' }} className="opacity-60 group-hover:opacity-100" /></span>{g.hd_subject && <span className="max-w-[180px] truncate text-xs group-hover:underline" style={{ color: 'var(--text-light)' }}>{g.hd_subject}</span>}</button> : g.ticket_number ? <Badge variant="default">{g.ticket_number}</Badge> : g.gmud_id ? <Badge variant="default">GMUD #{g.gmud_id}</Badge> : '—'}</Td>
                          <Td>{g.source_commit_sha ? <a href={`https://github.com/${g.owner}/${g.repository}/commit/${g.source_commit_sha}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 font-mono text-xs hover:underline" style={{ color: 'var(--primary)' }} title="Ver o fonte no commit (GitHub)">{shortSha(g.source_commit_sha)} <ExternalLink size={11} /></a> : '—'}</Td>
                          <Td className="text-sm">{g.responsavel ?? '—'}</Td>
                          <Td className="max-w-xs truncate text-xs" style={{ color: 'var(--text-muted)' }}>{g.diff_summary ?? '—'}</Td>
                          <Td className="text-xs">{dt(g.created_at)}</Td>
                          <Td>{g.hd_ticket_id && <Button size="sm" variant="secondary" onClick={() => openTicket(g.hd_ticket_id)} title="Abrir o chamado sem sair da tela"><Ticket size={13} /> Chamado</Button>}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
      </Card>
      )}

      {/* Drawer do chamado — abre sem sair da tela */}
      {drawerTicket != null && (
        <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setDrawerTicket(null)}>
          <div className="h-full w-full max-w-xl overflow-y-auto shadow-2xl" style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b px-4 py-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <Ticket size={16} style={{ color: 'var(--primary)' }} />
                <span className="truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  {tk ? `#${tk.ticket_number ?? tk.id} · ${tk.subject ?? ''}` : 'Chamado'}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a href={`/help-desk/tickets/${drawerTicket}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--primary)' }} title="Abrir o chamado completo em nova aba">Completo <ExternalLink size={11} /></a>
                <button onClick={() => setDrawerTicket(null)} className="rounded-md p-1.5 hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-light)' }}><X size={16} /></button>
              </div>
            </div>

            <div className="p-4">
              {tkLoading ? <SkeletonTable rows={6} cols={2} />
                : !tk ? <EmptyState icon={Ticket} title="Chamado" description="Não foi possível carregar o chamado." />
                  : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {tk.status && <Badge variant="default">{typeof tk.status === 'object' ? (tk.status.label ?? tk.status.name) : tk.status}</Badge>}
                        {tk.priority && prioBadge(String(tk.priority))}
                        {tk.reopen_count ? <span className="text-xs" style={{ color: 'var(--text-light)' }}>Reaberturas: {tk.reopen_count}</span> : null}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Empresa" value={tk.customer?.name ?? '—'} />
                        <Field label="Solicitante" value={tk.requester?.name ?? tk.solicitante_nome ?? tk.requester_name ?? '—'} />
                        <Field label="Categoria" value={tk.category?.name ?? '—'} />
                        <Field label="Serviço" value={tk.service?.name ?? '—'} />
                        <Field label="Equipe" value={tk.team?.name ?? '—'} />
                        <Field label="Responsável" value={tk.assignee?.name ?? 'Não atribuído'} />
                        <Field label="Aberto em" value={dt(tk.created_at ?? null)} />
                        <Field label="Nível" value={tk.level ?? '—'} />
                      </div>
                      {tk.description && (
                        <div>
                          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Descrição</span>
                          <div className="mt-1 whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--surface-hover)' }}>{tk.description}</div>
                        </div>
                      )}
                    </div>
                  )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
