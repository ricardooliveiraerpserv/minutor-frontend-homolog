'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Central de Fontes — C4b · Análise de Impacto. "Se eu alterar X, onde impacta?"
// Fatos determinísticos (clientes/fontes/leitores/escritores) + árvore cliente→fonte→
// ocorrências, sobre o read-model C2, sem IA. Escopo/cross e sanitização vêm do backend.
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Crosshair, FileCode2, FolderGit2, Search, ShieldAlert } from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, Pagination, SkeletonTable, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'

type EntityType = 'field' | 'table' | 'function' | 'dependency' | 'integration' | 'risk'
const ENTITIES: { key: EntityType; label: string }[] = [
  { key: 'field', label: 'Campo' },
  { key: 'table', label: 'Tabela' },
  { key: 'function', label: 'Função' },
  { key: 'dependency', label: 'Dependência' },
  { key: 'integration', label: 'Integração' },
  { key: 'risk', label: 'Risk flag' },
]
const HAS_ACCESS: EntityType[] = ['field', 'table']

interface IntegrationProj { kind: 'endpoint' | 'label' | 'redacted'; scheme?: string; host?: string; has_path?: boolean; has_credential?: boolean; value?: string }
interface Occ {
  name: string | null; access: string[] | null; kind: 'read' | 'write' | 'both' | null
  line_start: number | null; line_end: number | null; risk_flags: string[] | null
  context: string | null; function: string | null; integration?: IntegrationProj
}
interface SourceGroup { source_doc: { id: number; filename: string; path: string; owner: string; repository: string; branch: string }; occurrences: Occ[] }
interface CustomerGroup { customer: { id: number; name: string | null }; sources: SourceGroup[] }
interface Summary { clientes: number; fontes: number; ocorrencias: number; contextos: number; leitores: number; escritores: number; risk_flags: Record<string, number> }
interface ImpactResp {
  summary: Summary; data: CustomerGroup[]
  pagination: { current_page: number; per_page: number; total_sources: number; last_page: number }
  query: { entity: EntityType; name: unknown; table: string | null; access: string; cross: boolean }
  notice: string | null
}

const isWrite = (a: string) => a === 'INSERT' || a === 'UPDATE' || a === 'DELETE'

function ImpactoInner() {
  const router = useRouter()
  const sp = useSearchParams()

  const [entity, setEntity] = useState<EntityType>((sp.get('entity') as EntityType) || 'field')
  const [name, setName] = useState(sp.get('name') || '')
  const [table, setTable] = useState(sp.get('table') || '')
  const [access, setAccess] = useState<'any' | 'read' | 'write'>((sp.get('access') as 'read' | 'write') || 'any')
  const [cross, setCross] = useState(sp.get('cross') === 'true')

  const [resp, setResp] = useState<ImpactResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (toPage = 1) => {
    const nm = name.trim()
    if (!nm) return
    setLoading(true); setError(null)
    try {
      const p = new URLSearchParams({ entity, name: nm, per_page: '30', page: String(toPage) })
      if (table.trim() && entity === 'field') p.set('table', table.trim())
      if (access !== 'any' && HAS_ACCESS.includes(entity)) p.set('access', access)
      if (cross) p.set('cross', 'true')
      const r = await api.get<ImpactResp>(`/source-docs/impact?${p.toString()}`)
      setResp(r)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Falha ao analisar o impacto.')
      setResp(null)
    } finally { setLoading(false) }
  }, [entity, name, table, access, cross])

  // auto-executa quando veio com ?name= na URL (deep-link de "Ver impacto")
  useEffect(() => { if (sp.get('name')) run(1) /* eslint-disable-next-line */ }, [])

  const s = resp?.summary

  return (
    <>
      <PageHeader icon={Crosshair} title="Análise de Impacto"
        subtitle="Onde uma alteração pode impactar — cliente, fonte, função, acesso e evidência. Sobre o índice técnico, sem IA." />

      {/* controles */}
      <Card className="mb-4">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {ENTITIES.map((e) => {
            const on = entity === e.key
            return (
              <button key={e.key} onClick={() => setEntity(e.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={on ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {e.label}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[220px]">
            <TextInput label="Entidade" icon={Search} value={name} onChange={(ev) => setName(ev.target.value)}
              placeholder={entity === 'field' ? 'ex.: STATUSMAIL' : entity === 'table' ? 'ex.: SPED050' : 'nome…'}
              onKeyDown={(ev) => { if (ev.key === 'Enter') run(1) }} />
          </div>
          {entity === 'field' && (
            <div className="w-40">
              <TextInput label="Tabela (opcional)" value={table} onChange={(ev) => setTable(ev.target.value)} placeholder="ex.: SPED050" />
            </div>
          )}
          <Button variant="primary" icon={Crosshair} loading={loading} onClick={() => run(1)}>Analisar</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          {HAS_ACCESS.includes(entity) && (
            <div className="flex gap-1">
              {(['any', 'read', 'write'] as const).map((a) => (
                <button key={a} onClick={() => setAccess(a)}
                  className="px-2.5 py-1 rounded-lg text-xs capitalize"
                  style={access === a ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  {a === 'any' ? 'Todos' : a === 'read' ? 'Leitura' : 'Escrita'}
                </button>
              ))}
            </div>
          )}
          <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={cross} onChange={(ev) => setCross(ev.target.checked)} />
            Cruzar entre clientes
          </label>
        </div>
      </Card>

      {resp?.notice && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
          style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
          <ShieldAlert size={14} /> {resp.notice}
        </div>
      )}

      {loading && <SkeletonTable rows={4} cols={3} />}
      {error && <EmptyState icon={ShieldAlert} title="Erro" description={error} />}

      {!loading && s && (
        <>
          {/* resumo de FATOS (sem grau BAIXO/MÉDIO/ALTO) */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
            {[
              { k: 'Clientes', v: s.clientes }, { k: 'Fontes', v: s.fontes },
              { k: 'Contextos', v: s.contextos }, { k: 'Leitores', v: s.leitores }, { k: 'Escritores', v: s.escritores },
            ].map((c) => (
              <Card key={c.k} padding="sm">
                <div className="text-2xl font-bold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{c.v}</div>
                <div className="text-xs" style={{ color: 'var(--text-light)' }}>{c.k}</div>
              </Card>
            ))}
          </div>

          {Object.keys(s.risk_flags || {}).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4 items-center">
              <span className="text-xs" style={{ color: 'var(--text-light)' }}>Riscos:</span>
              {Object.entries(s.risk_flags).map(([f, n]) => <Badge key={f} variant="warning">{f} ({n})</Badge>)}
            </div>
          )}

          {resp.data.length === 0 ? (
            <EmptyState icon={Search} title="Sem impacto no seu escopo"
              description="Nenhuma ocorrência encontrada para esta entidade dentro dos clientes que você pode ver." />
          ) : (
            <div className="flex flex-col gap-3">
              {resp.data.map((cg) => (
                <Card key={cg.customer.id}>
                  <div className="font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text)' }}>
                    <FolderGit2 size={15} /> {cg.customer.name ?? `Cliente #${cg.customer.id}`}
                    <span className="text-xs font-normal" style={{ color: 'var(--text-light)' }}>({cg.sources.length} fonte{cg.sources.length > 1 ? 's' : ''})</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {cg.sources.map((sg) => (
                      <div key={sg.source_doc.id} className="rounded-lg p-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileCode2 size={14} style={{ color: 'var(--text-light)' }} />
                            <span className="font-medium truncate" style={{ color: 'var(--text)' }}>{sg.source_doc.filename}</span>
                            <span className="text-xs truncate" style={{ color: 'var(--text-light)' }}>{sg.source_doc.path}</span>
                          </div>
                          <button onClick={() => router.push(`/central-fontes/${sg.source_doc.id}`)}
                            className="text-xs shrink-0 px-2 py-1 rounded-lg" style={{ color: 'var(--primary)' }}>abrir ficha</button>
                        </div>
                        <div className="flex flex-col gap-1">
                          {sg.occurrences.map((o, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                              {o.integration ? (
                                <IntegrationChip p={o.integration} />
                              ) : (
                                <>
                                  {o.name && <b style={{ color: 'var(--text)' }}>{o.name}</b>}
                                  {o.function && <span>em <span className="font-mono">{o.function}</span></span>}
                                  {o.context && !o.function && <span>em {o.context}</span>}
                                  {o.access?.map((a) => <Badge key={a} variant={isWrite(a) ? 'warning' : 'default'}>{a}</Badge>)}
                                  {o.line_start && <span style={{ color: 'var(--text-light)' }}>L{o.line_start}{o.line_end ? `–${o.line_end}` : ''}</span>}
                                  {o.risk_flags?.map((r) => <Badge key={r} variant="danger">{r}</Badge>)}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}

              <Pagination page={resp.pagination.current_page}
                hasNext={resp.pagination.current_page < resp.pagination.last_page}
                onPrev={() => run(resp.pagination.current_page - 1)}
                onNext={() => run(resp.pagination.current_page + 1)}
                total={resp.pagination.total_sources} />
            </div>
          )}
        </>
      )}
    </>
  )
}

function IntegrationChip({ p }: { p: IntegrationProj }) {
  if (p.kind === 'redacted') return <Badge variant="default">integração (protegida)</Badge>
  if (p.kind === 'label') return <b style={{ color: 'var(--text)' }}>{p.value}</b>
  return (
    <span className="flex items-center gap-1.5">
      <b style={{ color: 'var(--text)' }}>{p.scheme}://{p.host}</b>
      {p.has_path && <Badge variant="default">tem path</Badge>}
      {p.has_credential && <Badge variant="warning">credencial</Badge>}
    </span>
  )
}

// useSearchParams exige Suspense no build de produção.
export default function ImpactoPage() {
  return <Suspense fallback={null}><ImpactoInner /></Suspense>
}
