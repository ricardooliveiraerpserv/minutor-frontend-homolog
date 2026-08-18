'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Central de Fontes — C2 · Busca Técnica. Pesquisa o read-model (source_doc_entities):
// função / tabela / campo / query / integração / dependência / risk, com filtro de acesso.
// Resultados agrupados por fonte, com a evidência (linha + contexto) e link para a ficha.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Crosshair, FileCode2, FolderGit2, Search, XCircle } from 'lucide-react'
import { Badge, Card, EmptyState, PageHeader, Pagination, SkeletonTable } from '@/components/ds'
import { api, ApiError } from '@/lib/api'

type EntityType = 'function' | 'table' | 'field' | 'query' | 'integration' | 'dependency' | 'risk'
const ENTITIES: { key: EntityType; label: string }[] = [
  { key: 'table', label: 'Tabela' },
  { key: 'field', label: 'Campo' },
  { key: 'function', label: 'Função' },
  { key: 'query', label: 'Query (SQL)' },
  { key: 'risk', label: 'Risk flag' },
  { key: 'integration', label: 'Integração' },
  { key: 'dependency', label: 'Dependência' },
]
const ACCESS = ['READ', 'INSERT', 'UPDATE', 'DELETE']
const HAS_ACCESS: EntityType[] = ['table', 'field', 'query']

interface Occ { name: string; parent: string | null; access: string[] | null; risk_flags: string[] | null; line_start: number | null; line_end: number | null }
interface Hit { source_doc: { id: number; filename: string; path: string; owner: string; repository: string; customer: { name: string } | null }; match_count: number; occurrences: Occ[] }
interface SearchResp { data: Hit[]; pagination: { current_page: number; per_page: number; total: number; last_page: number } }

export default function BuscaTecnicaPage() {
  const router = useRouter()
  const [entity, setEntity] = useState<EntityType>('table')
  const [q, setQ] = useState('')
  const [match, setMatch] = useState<'prefix' | 'exact' | 'contains'>('prefix')
  const [access, setAccess] = useState<string[]>([])
  const [page, setPage] = useState(1)

  const [resp, setResp] = useState<SearchResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ran, setRan] = useState(false)

  const [sugs, setSugs] = useState<string[]>([])
  const [showSugs, setShowSugs] = useState(false)
  const sugTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // autocomplete
  useEffect(() => {
    if (sugTimer.current) clearTimeout(sugTimer.current)
    if (!q.trim()) { setSugs([]); return }
    sugTimer.current = setTimeout(async () => {
      try {
        const r = await api.get<{ data: string[] }>(`/source-docs/search/suggest?entity=${entity}&q=${encodeURIComponent(q.trim())}`)
        setSugs(r.data ?? [])
      } catch { setSugs([]) }
    }, 250)
    return () => { if (sugTimer.current) clearTimeout(sugTimer.current) }
  }, [q, entity])

  const run = useCallback(async (toPage = 1) => {
    setLoading(true); setError(null); setRan(true); setShowSugs(false)
    try {
      const p = new URLSearchParams({ entity, per_page: '30', page: String(toPage) })
      if (q.trim()) { p.set('q', q.trim()); p.set('match', match) }
      if (access.length && HAS_ACCESS.includes(entity)) p.set('access', access.join(','))
      const r = await api.get<SearchResp>(`/source-docs/search?${p.toString()}`)
      setResp(r); setPage(toPage)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro na busca.')
    } finally { setLoading(false) }
  }, [entity, q, match, access])

  const toggleAccess = (a: string) => setAccess((cur) => cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a])

  return (
    <>
      <PageHeader icon={FolderGit2} title="Busca Técnica"
        subtitle="Pesquise o acervo por entidade técnica — quem usa uma tabela, escreve num campo, chama uma função, ou tem SQL de risco." />

      <Card className="mb-4">
        {/* dimensão */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {ENTITIES.map((e) => {
            const on = entity === e.key
            return (
              <button key={e.key} onClick={() => { setEntity(e.key); setAccess([]) }}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={on ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {e.label}
              </button>
            )
          })}
        </div>

        {/* busca */}
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <div className="flex-1 relative">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Nome</label>
            <div className="relative mt-1.5">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setShowSugs(true) }}
                onKeyDown={(e) => { if (e.key === 'Enter') run(1) }}
                onFocus={() => setShowSugs(true)}
                placeholder={entity === 'field' ? 'ex.: STATUSMAIL' : entity === 'table' ? 'ex.: SC2' : entity === 'risk' ? 'ex.: dynamic_sql_by_concatenation' : 'nome…'}
                className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              {showSugs && sugs.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 rounded-xl overflow-hidden max-h-60 overflow-y-auto"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  {sugs.map((s) => (
                    <button key={s} onClick={() => { setQ(s); setShowSugs(false); setMatch('exact') }}
                      className="block w-full text-left px-4 py-2 text-sm hover:opacity-80"
                      style={{ color: 'var(--text)' }}>{s}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-light)' }}>Correspondência</label>
            <div className="flex gap-1">
              {(['prefix', 'exact', 'contains'] as const).map((m) => (
                <button key={m} onClick={() => setMatch(m)}
                  className="px-2.5 py-2 rounded-lg text-xs font-medium"
                  style={match === m ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  {m === 'prefix' ? 'Começa com' : m === 'exact' ? 'Exato' : 'Contém'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => run(1)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>Buscar</button>
            {/* C4b — Ver impacto da entidade pesquisada (query→table; entidades sem impacto ficam de fora) */}
            {q.trim() && (() => {
              const impactEntity = entity === 'query' ? 'table' : entity
              const supported = ['field', 'table', 'function', 'dependency', 'integration', 'risk'].includes(impactEntity)
              return supported ? (
                <button onClick={() => router.push(`/central-fontes/impacto?entity=${impactEntity}&name=${encodeURIComponent(q.trim())}`)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--primary)' }}>
                  <Crosshair size={15} /> Ver impacto
                </button>
              ) : null
            })()}
          </div>
        </div>

        {/* acesso (só p/ tabela/campo/query) */}
        {HAS_ACCESS.includes(entity) && (
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Acesso:</span>
            {ACCESS.map((a) => (
              <button key={a} onClick={() => toggleAccess(a)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium"
                style={access.includes(a) ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {a}
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* resultados */}
      {loading ? (
        <Card padding="none"><SkeletonTable rows={6} cols={3} /></Card>
      ) : error ? (
        <EmptyState icon={XCircle} title="Erro na busca" description={error} />
      ) : !ran ? (
        <EmptyState icon={Search} title="Escolha uma dimensão e busque" description="Ex.: Campo → STATUSMAIL → Acesso UPDATE." />
      ) : !resp || resp.data.length === 0 ? (
        <EmptyState icon={FileCode2} title="Nenhum fonte encontrado" description="Ajuste o termo, a correspondência ou o acesso." />
      ) : (
        <>
          <div className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
            <b>{resp.pagination.total}</b> fonte(s) encontrada(s)
          </div>
          <div className="flex flex-col gap-3">
            {resp.data.map((hit) => (
              <Card key={hit.source_doc.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold" style={{ color: 'var(--text)' }}>{hit.source_doc.filename}</div>
                    <div className="text-xs" style={{ color: 'var(--text-light)' }}>
                      {hit.source_doc.customer?.name ?? '—'} · {hit.source_doc.owner}/{hit.source_doc.repository} · {hit.source_doc.path}
                    </div>
                  </div>
                  <button onClick={() => router.push(`/central-fontes/${hit.source_doc.id}`)}
                    className="text-sm font-medium shrink-0" style={{ color: 'var(--primary)' }}>Abrir ficha →</button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {hit.occurrences.map((o, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <b style={{ color: 'var(--text)' }}>{o.name}</b>
                      {o.parent && <span>em {o.parent}</span>}
                      {o.access?.map((a) => <Badge key={a} variant={a === 'UPDATE' || a === 'DELETE' || a === 'INSERT' ? 'warning' : 'default'}>{a}</Badge>)}
                      {o.line_start && <span style={{ color: 'var(--text-light)' }}>L{o.line_start}{o.line_end && o.line_end !== o.line_start ? `–${o.line_end}` : ''}</span>}
                    </span>
                  ))}
                  {hit.match_count > hit.occurrences.length && (
                    <span className="text-xs" style={{ color: 'var(--text-light)' }}>+{hit.match_count - hit.occurrences.length} mais</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
          {resp.pagination.total > resp.pagination.per_page && (
            <Pagination page={resp.pagination.current_page}
              hasNext={resp.pagination.current_page < resp.pagination.last_page}
              onPrev={() => run(Math.max(1, page - 1))} onNext={() => run(page + 1)}
              total={resp.pagination.total} />
          )}
        </>
      )}
    </>
  )
}
