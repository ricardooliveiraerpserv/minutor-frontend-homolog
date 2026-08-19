'use client'

// Central de Fontes — F5 · Busca integrada ao Acervo. Não é uma segunda exploração: cada resultado
// traz Empresa → Repo → Path → Fonte e "Mostrar no Acervo" (abre a fonte no Acervo com a árvore
// posicionada, ficha F3). Modos: Nome/Path e Conhecimento (catálogo, reusa filtros/escopo) e Símbolo
// (read-model C2). "Buscar neste escopo" chega por ?customer_id/&repository/&path. Termo/escopo persistem.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Search } from 'lucide-react'
import { Badge, Card, EmptyState, PageHeader, Pagination, Select, SkeletonTable, Table, Tbody, Td, Th, Thead, TextInput, Tr } from '@/components/ds'
import { api, ApiError } from '@/lib/api'

type Mode = 'nome' | 'conhecimento' | 'simbolo'
type Entity = 'table' | 'field' | 'function' | 'dependency'
const SS = 'busca-ctx'

interface CatalogRow { id: number; filename: string; path: string; repository: string; customer: { name: string } | null; semantic_quality: string; analysis_status: string }
interface SymbolHit { source_doc: { id: number; filename: string; path: string; repository: string; customer: { name: string } | null }; occurrences: { entity_type: string; name: string; line_start?: number }[] }

const semBadge = (s: string) => s === 'completed' ? <Badge variant="success">Completa</Badge> : s === 'partial' ? <Badge variant="warning">Parcial</Badge> : <Badge variant="default">Sem semântica</Badge>

export default function BuscaPage() {
  const [mode, setMode] = useState<Mode>('nome')
  const [entity, setEntity] = useState<Entity>('function')
  const [q, setQ] = useState('')
  const [lang, setLang] = useState('')
  const [semantic, setSemantic] = useState('')
  // escopo (Buscar neste escopo)
  const [customerId, setCustomerId] = useState('')
  const [repository, setRepository] = useState('')
  const [path, setPath] = useState('')
  const [customers, setCustomers] = useState<{ customer_id: number; name: string }[]>([])
  const [repos, setRepos] = useState<string[]>([])

  const [rows, setRows] = useState<CatalogRow[] | null>(null)
  const [hits, setHits] = useState<SymbolHit[] | null>(null)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoRun, setAutoRun] = useState(false)
  const inited = useRef(false)

  // empresas p/ o filtro
  useEffect(() => { api.get<{ data: { customer_id: number; name: string }[] }>('/source-docs/tree/customers').then((r) => setCustomers(r.data)).catch(() => {}) }, [])
  // repos ao escolher empresa
  useEffect(() => { if (!customerId) { setRepos([]); return } api.get<{ data: { repository: string }[] }>(`/source-docs/tree/customers/${customerId}/repos`).then((r) => setRepos(r.data.map((x) => x.repository))).catch(() => {}) }, [customerId])

  const run = useCallback(async (toPage = 1) => {
    if (!q.trim() && mode !== 'nome') return
    setLoading(true); setPage(toPage); setError(null)
    try {
      if (mode === 'simbolo') {
        const p = new URLSearchParams({ entity, q: q.trim(), match: 'contains', per_page: '30', page: String(toPage) })
        if (customerId) p.set('customer_id', customerId); if (repository) p.set('repository', repository)
        const r = await api.get<{ data: SymbolHit[]; pagination?: { last_page: number } }>(`/source-docs/search?${p}`)
        setHits(r.data); setRows(null); setPages(r.pagination?.last_page ?? 1)
      } else {
        const p = new URLSearchParams({ per_page: '30', page: String(toPage) })
        if (q.trim()) p.set('q', q.trim())
        if (mode === 'conhecimento') p.set('in', 'knowledge')
        if (customerId) p.set('customer_id', customerId); if (repository) p.set('repository', repository)
        if (path) p.set('path_prefix', path); if (lang) p.set('lang', lang); if (semantic) p.set('semantic', semantic)
        p.set('with_situation', 'false')
        const r = await api.get<{ data: CatalogRow[]; pagination: { last_page: number } }>(`/source-docs?${p}`)
        setRows(r.data); setHits(null); setPages(r.pagination.last_page)
      }
      try { sessionStorage.setItem(SS, JSON.stringify({ mode, entity, q, customerId, repository, path, lang, semantic })) } catch {}
    } catch (e) {
      setRows(null); setHits(null)
      setError(e instanceof ApiError ? e.message : 'Falha ao buscar. Tente novamente.')
    } finally { setLoading(false) }
  }, [mode, entity, q, customerId, repository, path, lang, semantic])

  // deep-link ?q= dispara a busca só depois que termo/escopo entraram no estado (evita closure obsoleta)
  useEffect(() => { if (autoRun) { setAutoRun(false); void run(1) } }, [autoRun, run])

  // reconstrução de contexto: ?customer_id/&repository/&path (Buscar neste escopo) OU sessionStorage
  useEffect(() => {
    if (inited.current) return; inited.current = true
    const u = new URLSearchParams(window.location.search)
    if (u.get('customer_id') || u.get('scope')) {
      setCustomerId(u.get('customer_id') || ''); setRepository(u.get('repository') || ''); setPath(u.get('path') || '')
      if (u.get('q')) { setQ(u.get('q') || ''); setAutoRun(true) }
      return
    }
    try { const s = JSON.parse(sessionStorage.getItem(SS) || '{}'); if (s.q !== undefined) { setMode(s.mode || 'nome'); setEntity(s.entity || 'function'); setQ(s.q || ''); setCustomerId(s.customerId || ''); setRepository(s.repository || ''); setPath(s.path || ''); setLang(s.lang || ''); setSemantic(s.semantic || '') } } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scopeLabel = [customers.find((c) => String(c.customer_id) === customerId)?.name, repository, path].filter(Boolean).join(' / ')

  return (
    <>
      <PageHeader icon={Search} title="Busca" subtitle="Encontre fontes por nome/path, conhecimento documentado ou símbolo. Cada resultado leva ao Acervo." />
      <Card className="mb-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <Select label="Modo" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="nome">Nome / Path</option><option value="conhecimento">Conhecimento (objetivo/regras/processo)</option><option value="simbolo">Símbolo (função/tabela/campo/dep)</option>
            </Select>
            {mode === 'simbolo' && <Select label="Tipo" value={entity} onChange={(e) => setEntity(e.target.value as Entity)}><option value="function">função</option><option value="table">tabela</option><option value="field">campo</option><option value="dependency">dependência</option></Select>}
            <div className="min-w-[220px] flex-1"><TextInput label="Termo" icon={Search} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run(1)} placeholder={mode === 'conhecimento' ? 'ex.: pedido, cnab, aprovação…' : 'nome, path ou símbolo'} /></div>
            <button onClick={() => run(1)} className="rounded-md bg-[color:var(--accent,#2563eb)] px-4 py-2 text-sm font-medium text-white">Buscar</button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Select label="Empresa" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setRepository('') }}><option value="">Todas</option>{customers.map((c) => <option key={c.customer_id} value={c.customer_id}>{c.name}</option>)}</Select>
            <Select label="Repositório" value={repository} onChange={(e) => setRepository(e.target.value)}><option value="">Todos</option>{repos.map((r) => <option key={r} value={r}>{r}</option>)}</Select>
            {mode !== 'simbolo' && <><Select label="Linguagem" value={lang} onChange={(e) => setLang(e.target.value)}><option value="">Todas</option><option value="advpl">advpl</option><option value="tlpp">tlpp</option></Select>
            <Select label="Conhecimento" value={semantic} onChange={(e) => setSemantic(e.target.value)}><option value="">Qualquer</option><option value="completed">Completa</option><option value="partial">Parcial</option><option value="none">Sem</option></Select></>}
          </div>
          {(customerId || path) && <div className="flex items-center gap-2 text-xs text-[color:var(--muted-fg)]">Escopo: <Badge variant="default">{scopeLabel || 'empresa'}</Badge>
            {path && <button className="text-[color:var(--accent,#2563eb)]" onClick={() => { setPath(''); run(1) }}>ampliar p/ repo</button>}
            {repository && !path && <button className="text-[color:var(--accent,#2563eb)]" onClick={() => { setRepository(''); run(1) }}>ampliar p/ empresa</button>}
            {customerId && !repository && !path && <button className="text-[color:var(--accent,#2563eb)]" onClick={() => { setCustomerId(''); run(1) }}>ampliar p/ todo o acervo</button>}</div>}
        </div>
      </Card>

      {error && <div className="mb-4 rounded-lg bg-[var(--danger-bg,#fef2f2)] px-4 py-3 text-sm text-[var(--danger-fg,#b91c1c)]">{error}</div>}
      {loading ? <SkeletonTable /> : error ? null : hits ? (
        hits.length === 0 ? <EmptyState icon={Search} title="Sem resultados" description="Nenhum símbolo encontrado." /> : (
          <Table><Thead><Tr><Th>Fonte</Th><Th>Empresa / Repo</Th><Th>Ocorrências</Th><Th>Acervo</Th></Tr></Thead>
            <Tbody>{hits.map((h) => <Tr key={h.source_doc.id}><Td><div className="font-medium">{h.source_doc.filename}</div><div className="text-xs text-[color:var(--muted-fg)]">{h.source_doc.path}</div></Td><Td>{h.source_doc.customer?.name} / {h.source_doc.repository}</Td><Td className="text-xs">{h.occurrences.slice(0, 4).map((o) => o.name).join(', ')}{h.occurrences.length > 4 ? '…' : ''}</Td><Td><Acervo id={h.source_doc.id} /></Td></Tr>)}</Tbody></Table>
        )
      ) : rows ? (
        rows.length === 0 ? <EmptyState icon={Search} title="Sem resultados" description="Ajuste o termo ou o escopo." /> : (
          <>
            <Table><Thead><Tr><Th>Fonte</Th><Th>Empresa / Repo</Th><Th>Path</Th><Th>Conhecimento</Th><Th>Acervo</Th></Tr></Thead>
              <Tbody>{rows.map((r) => <Tr key={r.id}><Td className="font-medium">{r.filename}</Td><Td>{r.customer?.name} / {r.repository}</Td><Td className="text-xs text-[color:var(--muted-fg)]">{r.path}</Td><Td>{semBadge(r.semantic_quality)}</Td><Td><Acervo id={r.id} /></Td></Tr>)}</Tbody></Table>
            {pages > 1 && <div className="mt-3"><Pagination page={page} hasNext={page < pages} onPrev={() => run(page - 1)} onNext={() => run(page + 1)} /></div>}
          </>
        )
      ) : <EmptyState icon={Search} title="Busque no acervo" description="Escolha um modo, digite um termo e (opcional) restrinja por empresa/repo/escopo." />}
    </>
  )
}

function Acervo({ id }: { id: number }) {
  return <a href={`/central-fontes/acervo?doc=${id}`} className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-[color:var(--accent,#2563eb)] hover:underline">Mostrar no Acervo <ArrowUpRight size={12} /></a>
}
