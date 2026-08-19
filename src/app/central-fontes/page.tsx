'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Central de Fontes — C1 · Catálogo de documentação de código-fonte (Protheus).
// Somente leitura. Indicadores 100% do banco (a situação Git é da página, rotulada
// como tal). Lista enxuta; ficha detalhada em /central-fontes/[id].
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle, Building2, CheckCircle2, ChevronRight, Crosshair, FileCode2, FolderGit2, HelpCircle, Search, XCircle,
} from 'lucide-react'
import { ImpactoInner } from './impacto/page'
import {
  Badge, Card, EmptyState, PageHeader, Pagination, Select, SkeletonTable,
  Table, Tbody, Td, Th, Thead, Tr,
} from '@/components/ds'
import { api, ApiError } from '@/lib/api'

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
}

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
  const [mainTab, setMainTab] = useState<'acervo' | 'impacto'>('acervo')
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Acervo por Empresa (nível 1 da navegação progressiva) — só aparece quando não há busca/filtro
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null)
  const [custErr, setCustErr] = useState<string | null>(null)
  const hasFilter = !!(q.trim() || analysis || semantic || situation)

  useEffect(() => {
    api.get<{ data: CustomerRow[] }>('/source-docs/tree/customers?include_empty=1')
      .then((r) => setCustomers(r.data))
      .catch((e) => setCustErr(e instanceof ApiError ? e.message : 'Falha ao carregar empresas.'))
  }, [])

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
        <EmpresaBlock customers={customers} err={custErr} onOpen={(id) => router.push(`/central-fontes/acervo?customer_id=${id}`)} />
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
      </>) : (<Suspense fallback={null}><ImpactoInner embedded /></Suspense>)}
    </>
  )
}

function EmpresaBlock({ customers, err, onOpen }: { customers: CustomerRow[] | null; err: string | null; onOpen: (id: number) => void }) {
  const pct = (doc: number, total: number) => total ? Math.round((doc / total) * 100) : 0
  return (
    <Card padding="none">
      <div className="px-5 pt-4 pb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Acervo por empresa</div>
      {err ? (
        <EmptyState icon={XCircle} title="Não foi possível carregar as empresas" description={err} />
      ) : customers === null ? (
        <SkeletonTable rows={6} cols={5} />
      ) : customers.length === 0 ? (
        <EmptyState icon={Building2} title="Nenhuma empresa com acervo" description="Nenhum cliente tem repositório de fonte no seu escopo." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Thead>
              <Tr><Th>Empresa</Th><Th right>Fontes</Th><Th right>Com semântica</Th><Th right>Cobertura</Th><Th right>Repos.</Th><Th></Th></Tr>
            </Thead>
            <Tbody>
              {customers.map((c) => {
                const empty = c.fontes === 0
                return (
                <Tr key={c.customer_id} onClick={empty ? undefined : () => onOpen(c.customer_id)} className={empty ? '' : 'cursor-pointer'} style={empty ? { opacity: 0.5 } : undefined}>
                  <Td>
                    <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text)' }}>
                      <Building2 size={15} style={{ color: 'var(--text-light)' }} /> {c.name}
                      {empty && <Badge variant="default">sem dados</Badge>}
                      {c.aguardando_aprovacao > 0 && <Badge variant="warning">{c.aguardando_aprovacao} aguard. IA</Badge>}
                    </div>
                  </Td>
                  <Td right>{empty ? '—' : c.fontes}</Td>
                  <Td right>{empty ? '—' : c.documentadas}</Td>
                  <Td right>{empty ? '—' : `${pct(c.documentadas, c.fontes)}%`}</Td>
                  <Td right>{c.repos}</Td>
                  <Td right>{!empty && <ChevronRight size={16} style={{ color: 'var(--text-light)' }} />}</Td>
                </Tr>
                )
              })}
            </Tbody>
          </Table>
        </div>
      )}
    </Card>
  )
}
