'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Central de Fontes — C1 · Catálogo de documentação de código-fonte (Protheus).
// Somente leitura. Indicadores 100% do banco (a situação Git é da página, rotulada
// como tal). Lista enxuta; ficha detalhada em /central-fontes/[id].
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle, Building2, CheckCircle2, ChevronDown, ChevronRight, Crosshair, EyeOff, FileCode2, FilePlus2, FolderGit2, HelpCircle, RotateCcw, Search, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { ImpactoInner } from './impacto/page'
import {
  Badge, Card, EmptyState, PageHeader, Pagination, Select, SkeletonTable,
  Table, Tbody, Td, Th, Thead, Tr,
} from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { SolicitarFonteModal } from '@/components/central-fontes/solicitar-fonte-modal'
import { useFontesCompany } from './_components/fontes-company-context'

type Situation = 'ATUALIZADA' | 'DESATUALIZADA' | 'NAO_VALIDADO'
type Semantic = 'completed' | 'partial' | 'none'

interface CatalogRow {
  id: number
  filename: string
  path: string
  owner: string
  repository: string
  branch: string
  lang: string | null
  tipo: string | null
  customer: { id: number; name: string } | null
  analysis_status: string
  functions_count: number | null
  semantic_quality: Semantic
  last_change_at: string | null
  last_gmud: { id: number | null; ticket_number: string | null; responsavel: string | null } | null
  situation: { status: Situation; reason: string | null } | null
}

interface CatalogResponse {
  data: CatalogRow[]
  pagination: { current_page: number; per_page: number; total: number; last_page: number }
  indicators: {
    total: number
    by_analysis: Record<string, number>
    by_semantic: { completed: number; partial: number; none: number }
  }
  page_situation: (Record<Situation, number> & { scope: string }) | null
}

interface CustomerRow {
  customer_id: number; name: string; repos: number; fontes: number
  documentadas: number; completas: number; parciais: number; pendentes: number; aguardando_aprovacao: number
  own_source?: boolean; hidden?: boolean
}
interface RepoLite { repository: string; branch: string; fontes: number; documentadas: number; cobertura_semantica: number; hidden?: boolean }

const SITUATION_META: Record<Situation, { variant: string; label: string; icon: typeof CheckCircle2 }> = {
  ATUALIZADA:    { variant: 'success', label: 'Atualizada',    icon: CheckCircle2 },
  DESATUALIZADA: { variant: 'warning', label: 'Desatualizada', icon: AlertTriangle },
  NAO_VALIDADO:  { variant: 'default', label: 'Não validada',  icon: HelpCircle },
}
const SEMANTIC_META: Record<Semantic, { variant: string; label: string }> = {
  completed: { variant: 'success', label: 'Completa' },
  partial:   { variant: 'warning', label: 'Parcial' },
  none:      { variant: 'default', label: 'Sem semântica' },
}

function fmtDate(v: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
}

export default function CentralFontesPage() {
  const router = useRouter()
  const [resp, setResp] = useState<CatalogResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [semantic, setSemantic] = useState('')
  const [situation, setSituation] = useState('')
  const [mainTab, setMainTab] = useState<'acervo' | 'impacto' | 'inativos'>('acervo')
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Acervo por Empresa (nível 1) — só aparece quando não há busca/filtro; o EmpresaBlock
  // gerencia o próprio fetch (todas as empresas, detentor, ocultar, solicitar fonte).
  const hasFilter = !!(q.trim() || analysis || semantic || situation)

  // C4.x — empresa vinda do seletor da casca: a Central de Fontes abre DIRETO na tela
  // do cliente (print AUSTER), pulando o passo "Acervo por empresa". "Todas" (selectedId
  // null) mantém o catálogo. Busca/filtro ou aba ≠ Acervo não redirecionam.
  const { selectedId } = useFontesCompany()
  useEffect(() => {
    if (selectedId && mainTab === 'acervo' && !hasFilter) {
      router.replace(`/central-fontes/acervo?customer_id=${selectedId}`)
    }
  }, [selectedId, mainTab, hasFilter, router])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const p = new URLSearchParams({ per_page: '50', page: String(page) })
      if (q.trim()) p.set('q', q.trim())
      if (analysis) p.set('analysis_status', analysis)
      if (semantic) p.set('semantic', semantic)
      if (situation) p.set('situation', situation)
      const r = await api.get<CatalogResponse>(`/source-docs?${p.toString()}`)
      setResp(r)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao carregar o catálogo.')
    } finally {
      setLoading(false)
    }
  }, [page, q, analysis, semantic, situation])

  // busca com debounce; filtros aplicam imediato
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(load, q ? 300 : 0)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [load, q])

  useEffect(() => { setPage(1) }, [q, analysis, semantic, situation])

  const ind = resp?.indicators
  const ps = resp?.page_situation

  const chips = useMemo(() => ([
    { label: 'Fontes', value: ind?.total ?? 0, onClick: () => { setAnalysis(''); setSemantic(''); setSituation('') } },
    { label: 'Com semântica', value: ind ? ind.by_semantic.completed + ind.by_semantic.partial : 0, onClick: () => setSemantic('completed') },
    { label: 'Sem semântica', value: ind?.by_semantic.none ?? 0, onClick: () => setSemantic('none') },
    { label: 'Análise concluída', value: ind?.by_analysis.completed ?? 0, onClick: () => setAnalysis('completed') },
    { label: 'Análise falha', value: ind?.by_analysis.failed ?? 0, onClick: () => setAnalysis('failed') },
  ]), [ind])

  return (
    <>
      <PageHeader
        icon={FolderGit2}
        title="Central de Fontes"
        subtitle="Catálogo técnico vivo — documentação, situação e histórico dos fontes por cliente."
      />

      <div className="mb-4 inline-flex overflow-hidden rounded-lg border border-[color:var(--border)] text-sm">
        <button onClick={() => setMainTab('acervo')} className="flex items-center gap-1.5 px-4 py-2 font-medium" style={mainTab === 'acervo' ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { color: 'var(--text-muted)' }}><FolderGit2 size={14} /> Acervo</button>
        <button onClick={() => setMainTab('impacto')} className="flex items-center gap-1.5 border-l border-[color:var(--border)] px-4 py-2 font-medium" style={mainTab === 'impacto' ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { color: 'var(--text-muted)' }}><Crosshair size={14} /> Impacto</button>
        <button onClick={() => setMainTab('inativos')} className="flex items-center gap-1.5 border-l border-[color:var(--border)] px-4 py-2 font-medium" style={mainTab === 'inativos' ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { color: 'var(--text-muted)' }}><EyeOff size={14} /> Inativos</button>
      </div>

      {mainTab === 'acervo' ? (<>
      {/* Indicadores — 100% do banco (clicáveis) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {chips.map((c) => (
          <button key={c.label} onClick={c.onClick}
            className="text-left rounded-xl px-4 py-3 transition-colors"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
              {loading && !resp ? '—' : c.value}
            </div>
            <div className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{c.label}</div>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <Card className="mb-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <div className="flex-1">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Buscar</label>
            <div className="relative mt-1.5">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
              <input
                value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="nome do arquivo ou caminho…"
                className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>
          </div>
          <Select label="Situação" value={situation} onChange={(e) => setSituation(e.target.value)}>
            <option value="">Todas</option>
            <option value="ATUALIZADA">Atualizada</option>
            <option value="DESATUALIZADA">Desatualizada</option>
            <option value="NAO_VALIDADO">Não validada</option>
          </Select>
          <Select label="Semântica" value={semantic} onChange={(e) => setSemantic(e.target.value)}>
            <option value="">Todas</option>
            <option value="completed">Completa</option>
            <option value="partial">Parcial</option>
            <option value="none">Sem semântica</option>
          </Select>
          <Select label="Análise" value={analysis} onChange={(e) => setAnalysis(e.target.value)}>
            <option value="">Todas</option>
            <option value="completed">Concluída</option>
            <option value="partial">Parcial</option>
            <option value="analyzing">Analisando</option>
            <option value="failed">Falha</option>
          </Select>
        </div>
      </Card>

      {/* Sem busca/filtro: o protagonista é o Acervo por Empresa (nível 1). */}
      {!hasFilter ? (
        <EmpresaBlock onOpen={(id) => router.push(`/central-fontes/acervo?customer_id=${id}`)} />
      ) : (
       <>
      {/* Roll-up da situação — SÓ da página, rotulado */}
      {ps && (
        <div className="flex items-center gap-2 mb-3 text-xs" style={{ color: 'var(--text-light)' }}>
          <span>Situação nesta página:</span>
          <Badge variant="success">{ps.ATUALIZADA} atual.</Badge>
          <Badge variant="warning">{ps.DESATUALIZADA} desat.</Badge>
          <Badge variant="default">{ps.NAO_VALIDADO} não val.</Badge>
        </div>
      )}

      {/* Tabela */}
      <Card padding="none">
        {loading ? (
          <SkeletonTable rows={8} cols={7} />
        ) : error ? (
          <EmptyState icon={XCircle} title="Não foi possível carregar" description={error}
            action={<button onClick={load} className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>Tentar novamente</button>} />
        ) : !resp || resp.data.length === 0 ? (
          <EmptyState icon={FileCode2} title="Nenhum fonte encontrado"
            description="Ajuste os filtros ou verifique se o cliente tem repositório de fonte cadastrado." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Thead>
                <Tr><Th>Fonte</Th><Th>Cliente / Repositório</Th><Th>Situação</Th><Th>Semântica</Th>
                  <Th right>Funções</Th><Th>Última alteração</Th><Th>GMUD</Th></Tr>
              </Thead>
              <Tbody>
                {resp.data.map((row) => {
                  const sit = row.situation ? SITUATION_META[row.situation.status] : null
                  const sem = SEMANTIC_META[row.semantic_quality]
                  return (
                    <Tr key={row.id} onClick={() => router.push(`/central-fontes/${row.id}`)} className="cursor-pointer">
                      <Td>
                        <div className="font-semibold" style={{ color: 'var(--text)' }}>{row.filename}</div>
                        <div className="text-xs" style={{ color: 'var(--text-light)' }}>{row.path}</div>
                      </Td>
                      <Td>
                        <div style={{ color: 'var(--text)' }}>{row.customer?.name ?? '—'}</div>
                        <div className="text-xs" style={{ color: 'var(--text-light)' }}>{row.owner}/{row.repository}</div>
                      </Td>
                      <Td>{sit ? <Badge variant={sit.variant}>{sit.label}</Badge> : <span style={{ color: 'var(--text-light)' }}>—</span>}</Td>
                      <Td><Badge variant={sem.variant}>{sem.label}</Badge></Td>
                      <Td right>{row.functions_count ?? '—'}</Td>
                      <Td>{fmtDate(row.last_change_at)}</Td>
                      <Td>{row.last_gmud?.ticket_number ?? '—'}</Td>
                    </Tr>
                  )
                })}
              </Tbody>
            </Table>
          </div>
        )}
      </Card>

      {resp && resp.pagination.total > resp.pagination.per_page && (
        <Pagination
          page={resp.pagination.current_page}
          hasNext={resp.pagination.current_page < resp.pagination.last_page}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          total={resp.pagination.total}
        />
      )}
       </>
      )}
      </>) : mainTab === 'impacto' ? (<Suspense fallback={null}><ImpactoInner embedded /></Suspense>) : (<InativosPanel />)}
    </>
  )
}

function EmpresaBlock({ onOpen }: { onOpen: (id: number) => void }) {
  const { hasPermission } = useAuth()
  const canManage = hasPermission('source_docs.inventory')
  const pct = (doc: number, total: number) => total ? Math.round((doc / total) * 100) : 0
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [reqModal, setReqModal] = useState<{ customer_id: number; name: string } | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [repos, setRepos] = useState<Record<number, RepoLite[] | 'loading'>>({})
  const [repoBusy, setRepoBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    setCustomers(null); setErr(null)
    // Acervo mostra só ATIVAS; inativas (ocultas) ficam na aba Inativos.
    const p = new URLSearchParams({ include_empty: '1' })
    api.get<{ data: CustomerRow[] }>(`/source-docs/tree/customers?${p.toString()}`)
      .then((r) => setCustomers(r.data))
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Falha ao carregar empresas.'))
  }, [])
  useEffect(() => { load() }, [load])

  const patchSetting = async (id: number, body: { own_source?: boolean; hidden?: boolean }) => {
    setBusy(id)
    try { await api.put(`/source-docs/customers/${id}/settings`, body); load() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao atualizar.') }
    finally { setBusy(null) }
  }

  const loadRepos = useCallback((id: number) => {
    setRepos((r) => ({ ...r, [id]: 'loading' }))
    // Acervo lista só repos ATIVOS; os inativos ficam na aba Inativos.
    api.get<{ data: RepoLite[] }>(`/source-docs/tree/customers/${id}/repos`)
      .then((r) => setRepos((prev) => ({ ...prev, [id]: r.data })))
      .catch(() => setRepos((prev) => ({ ...prev, [id]: [] })))
  }, [])

  const toggleExpand = (id: number) => {
    setOpenId((cur) => {
      const next = cur === id ? null : id
      if (next !== null && repos[next] === undefined) loadRepos(next)
      return next
    })
  }

  const toggleRepoHidden = async (customer_id: number, repository: string, hidden: boolean) => {
    const key = `${customer_id}:${repository}`
    setRepoBusy(key)
    try {
      await api.put('/source-docs/repos/settings', { customer_id, repository, hidden })
      toast.success(hidden ? `Repositório "${repository}" desabilitado — some das consultas.` : `Repositório "${repository}" reativado.`)
      loadRepos(customer_id); load() // atualiza sub-lista e os contadores da empresa
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao atualizar o repositório.') }
    finally { setRepoBusy(null) }
  }

  return (
    <Card padding="none">
      <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Acervo por empresa</div>
        {canManage && <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>Empresas e repositórios inativos ficam na aba <b>Inativos</b>.</div>}
      </div>
      {err ? (
        <EmptyState icon={XCircle} title="Não foi possível carregar as empresas" description={err} />
      ) : customers === null ? (
        <SkeletonTable rows={6} cols={6} />
      ) : customers.length === 0 ? (
        <EmptyState icon={Building2} title="Nenhuma empresa" description="Nenhum cliente no seu escopo." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Thead>
              <Tr><Th>Empresa</Th><Th>Detentor</Th><Th right>Fontes</Th><Th right>Com semântica</Th><Th right>Cobertura</Th><Th right>Repos.</Th><Th></Th></Tr>
            </Thead>
            <Tbody>
              {customers.map((c) => {
                const empty = c.fontes === 0
                const isOpen = openId === c.customer_id
                const rlist = repos[c.customer_id]
                return (
                <Fragment key={c.customer_id}>
                <Tr onClick={empty ? undefined : () => onOpen(c.customer_id)} className={`${empty ? '' : 'cursor-pointer'} ${c.hidden ? 'opacity-40' : empty ? 'opacity-60' : ''}`}>
                  <Td>
                    <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text)' }}>
                      <Building2 size={15} style={{ color: 'var(--text-light)' }} /> {c.name}
                      {c.hidden && <Badge variant="default">oculta</Badge>}
                      {empty && !c.hidden && <Badge variant="default">sem dados</Badge>}
                      {c.aguardando_aprovacao > 0 && <Badge variant="warning">{c.aguardando_aprovacao} aguard. IA</Badge>}
                    </div>
                  </Td>
                  <Td>
                    {canManage ? (
                      <button onClick={(e) => { e.stopPropagation(); void patchSetting(c.customer_id, { own_source: !c.own_source }) }} disabled={busy === c.customer_id} title="Alternar detentor">
                        <Badge variant={c.own_source ? 'success' : 'default'}>{c.own_source ? 'Sim' : 'Não'}</Badge>
                      </button>
                    ) : <Badge variant={c.own_source ? 'success' : 'default'}>{c.own_source ? 'Sim' : 'Não'}</Badge>}
                  </Td>
                  <Td right>{empty ? '—' : c.fontes}</Td>
                  <Td right>{empty ? '—' : c.documentadas}</Td>
                  <Td right>{empty ? '—' : `${pct(c.documentadas, c.fontes)}%`}</Td>
                  <Td right>
                    {empty ? c.repos : (
                      <button onClick={(e) => { e.stopPropagation(); toggleExpand(c.customer_id) }} title="Ver / desabilitar repositórios" className="inline-flex items-center gap-1 font-medium hover:underline" style={{ color: 'var(--primary)' }}>
                        {c.repos} {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    )}
                  </Td>
                  <Td right>
                    <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-end gap-1.5">
                      {empty && <button onClick={() => setReqModal({ customer_id: c.customer_id, name: c.name })} className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--primary)' }}><FilePlus2 size={13} /> Solicitar fonte</button>}
                      {canManage && !empty && (
                        <button onClick={() => void patchSetting(c.customer_id, { hidden: true })} disabled={busy === c.customer_id} title="Tornar a empresa inativa (some da Central; vai para a aba Inativos)">
                          <Badge variant="success">Ativo</Badge>
                        </button>
                      )}
                    </div>
                  </Td>
                </Tr>
                {isOpen && (
                  <Tr>
                    <Td colSpan={7}>
                      <div className="px-2 py-1">
                        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Repositórios de {c.name} — tornar inativo tira das consultas (mantém a ingestão)</div>
                        {rlist === 'loading' || rlist === undefined ? <div className="py-2 text-xs" style={{ color: 'var(--text-light)' }}>Carregando…</div>
                          : rlist.length === 0 ? <div className="py-2 text-xs" style={{ color: 'var(--text-light)' }}>Nenhum repositório ativo.</div>
                          : (
                            <div className="flex flex-col divide-y" style={{ borderColor: 'var(--border)' }}>
                              {rlist.map((rp) => {
                                const rk = `${c.customer_id}:${rp.repository}`
                                return (
                                  <div key={rp.repository} className="flex items-center gap-3 py-1.5">
                                    <FolderGit2 size={14} style={{ color: 'var(--text-light)' }} />
                                    <span className="font-medium" style={{ color: 'var(--text)' }}>{rp.repository}</span>
                                    <span className="text-xs" style={{ color: 'var(--text-light)' }}>{rp.fontes} fontes · {rp.cobertura_semantica}%</span>
                                    {canManage && (
                                      <button onClick={() => void toggleRepoHidden(c.customer_id, rp.repository, true)} disabled={repoBusy === rk}
                                        className="ml-auto disabled:opacity-40"
                                        title="Tornar o repositório inativo (some das consultas; vai para a aba Inativos)">
                                        <Badge variant="success">Ativo</Badge>
                                      </button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                      </div>
                    </Td>
                  </Tr>
                )}
                </Fragment>
                )
              })}
            </Tbody>
          </Table>
        </div>
      )}
      {reqModal && <SolicitarFonteModal ctx={{ title: `Solicitar fonte — ${reqModal.name}`, customerId: reqModal.customer_id, scopeType: 'repository', items: [] }} onClose={() => setReqModal(null)} />}
    </Card>
  )
}

// ── Segmento INATIVOS: local gerencial de ativo/inativo. Empresas ocultas + repositórios
// desabilitados (= inativos). Reativar volta às consultas. Inativo mantém a ingestão.
interface HiddenRepoRow { customer_id: number; customer_name: string | null; repository: string; fontes: number }
function InativosPanel() {
  const { hasPermission } = useAuth()
  const canManage = hasPermission('source_docs.inventory')
  const [empresas, setEmpresas] = useState<CustomerRow[] | null>(null)
  const [repos, setRepos] = useState<HiddenRepoRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    setEmpresas(null); setRepos(null)
    api.get<{ data: CustomerRow[] }>('/source-docs/tree/customers?include_empty=1&include_hidden=1')
      .then((r) => setEmpresas(r.data.filter((c) => c.hidden))).catch(() => setEmpresas([]))
    api.get<{ data: HiddenRepoRow[] }>('/source-docs/repos/hidden')
      .then((r) => setRepos(r.data)).catch(() => setRepos([]))
  }, [])
  useEffect(() => { load() }, [load])

  const reativarEmpresa = async (id: number) => {
    setBusy(`c:${id}`)
    try { await api.put(`/source-docs/customers/${id}/settings`, { hidden: false }); toast.success('Empresa reativada.'); load() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao reativar.') } finally { setBusy(null) }
  }
  const reativarRepo = async (customer_id: number, repository: string) => {
    setBusy(`r:${customer_id}:${repository}`)
    try { await api.put('/source-docs/repos/settings', { customer_id, repository, hidden: false }); toast.success(`Repositório "${repository}" reativado.`); load() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao reativar.') } finally { setBusy(null) }
  }

  const nEmp = empresas?.length ?? 0
  const nRepo = repos?.length ?? 0
  const loading = empresas === null || repos === null

  return (
    <Card padding="none">
      <div className="px-5 pt-4 pb-2">
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Inativos</div>
        <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-light)' }}>Empresas e repositórios inativos não aparecem nas consultas (mas seguem sendo ingeridos). Reative quando precisar.</div>
      </div>

      {loading ? <SkeletonTable rows={5} cols={3} /> : nEmp === 0 && nRepo === 0 ? (
        <EmptyState icon={EyeOff} title="Nada inativo" description="Nenhuma empresa ou repositório inativo. Torne inativo pela aba Acervo (chip Ativo)." />
      ) : (
        <div className="flex flex-col gap-4 px-5 pb-5">
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Empresas inativas ({nEmp})</div>
            {nEmp === 0 ? <div className="text-xs" style={{ color: 'var(--text-light)' }}>Nenhuma empresa inativa.</div> : (
              <div className="flex flex-col divide-y rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                {empresas!.map((c) => (
                  <div key={c.customer_id} className="flex items-center gap-3 px-3 py-2">
                    <Building2 size={15} style={{ color: 'var(--text-light)' }} />
                    <span className="font-medium" style={{ color: 'var(--text)' }}>{c.name}</span>
                    <span className="text-xs" style={{ color: 'var(--text-light)' }}>{c.fontes} fontes · {c.repos} repos</span>
                    <Badge variant="default">inativo</Badge>
                    {canManage && <button onClick={() => void reativarEmpresa(c.customer_id)} disabled={busy === `c:${c.customer_id}`} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium disabled:opacity-40" style={{ color: 'var(--primary)' }}><RotateCcw size={13} /> Reativar</button>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Repositórios inativos ({nRepo})</div>
            {nRepo === 0 ? <div className="text-xs" style={{ color: 'var(--text-light)' }}>Nenhum repositório inativo.</div> : (
              <div className="flex flex-col divide-y rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                {repos!.map((rp) => (
                  <div key={`${rp.customer_id}:${rp.repository}`} className="flex items-center gap-3 px-3 py-2">
                    <FolderGit2 size={15} style={{ color: 'var(--text-light)' }} />
                    <span className="font-medium" style={{ color: 'var(--text)' }}>{rp.repository}</span>
                    <span className="text-xs" style={{ color: 'var(--text-light)' }}>{rp.customer_name ?? `#${rp.customer_id}`} · {rp.fontes} fontes</span>
                    <Badge variant="default">inativo</Badge>
                    {canManage && <button onClick={() => void reativarRepo(rp.customer_id, rp.repository)} disabled={busy === `r:${rp.customer_id}:${rp.repository}`} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium disabled:opacity-40" style={{ color: 'var(--primary)' }}><RotateCcw size={13} /> Reativar</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

