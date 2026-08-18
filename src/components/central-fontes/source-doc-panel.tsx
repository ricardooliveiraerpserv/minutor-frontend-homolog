'use client'

// Central de Fontes — F3 · Ficha da Fonte integrada ao Acervo (painel direito). Reaproveita os
// endpoints existentes (/source-docs/{id}, /documentation, /versions, /source). Somente leitura.
// A dependência cross-source é CLICÁVEL → onNavigateSource(source_doc_id) navega no próprio Acervo.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, ExternalLink, FileCode2 } from 'lucide-react'
import { Accordion, AccordionItem, Badge, Breadcrumb, Card, Skeleton, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ds'
import type { Crumb } from '@/components/ds'
import { api } from '@/lib/api'

type Dict = Record<string, unknown>
const A = (v: unknown): Dict[] => Array.isArray(v) ? (v as Dict[]) : []
const S = (v: unknown, d = ''): string => (typeof v === 'string' ? v : v == null ? d : String(v))
const D = (v: unknown): Dict => (v && typeof v === 'object' ? (v as Dict) : {})
const dt = (s: unknown) => { const v = S(s); return v ? new Date(v).toLocaleDateString('pt-BR') : '—' }

interface Meta {
  id: number; filename: string; path: string; owner: string; repository: string; branch: string; lang: string | null
  customer?: { id: number; name: string } | null
  current_version?: { id: number; semantic_quality?: string; created_at?: string; gmud?: { ticket_number?: string } | null } | null
  situation?: { status?: string; documented_blob_sha?: string | null; checked_at?: string } | null
  documentation_meta?: { semantic?: Dict; security_findings?: unknown } | null
}

const TABS = ['Visão Geral', 'Regras', 'Funções', 'Dependências', 'Evidências', 'Código', 'Histórico'] as const
type Tab = typeof TABS[number]

const confBadge = (c: unknown) => { const v = S(c); return v === 'high' ? <Badge variant="success">alta</Badge> : v === 'medium' ? <Badge variant="warning">média</Badge> : v ? <Badge variant="default">baixa</Badge> : null }

export function SourceDocPanel({ docId, onNavigateSource }: { docId: number; onNavigateSource?: (targetId: number) => void }) {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [det, setDet] = useState<Dict | null>(null)
  const [versions, setVersions] = useState<Dict[] | null>(null)
  const [code, setCode] = useState<{ content: string; bytes: number } | null>(null)
  const [tab, setTab] = useState<Tab>('Visão Geral')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true; setLoading(true); setMeta(null); setDet(null); setVersions(null); setCode(null); setTab('Visão Geral')
    api.get<{ data: Meta }>(`/source-docs/${docId}`).then((r) => alive && setMeta(r.data)).catch(() => {}).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [docId])

  // lazy por aba
  useEffect(() => {
    let alive = true
    if ((tab === 'Funções' || tab === 'Dependências') && det === null) {
      api.get<{ data: { deterministic: Dict | null } }>(`/source-docs/${docId}/documentation`).then((r) => alive && setDet(r.data.deterministic ?? {})).catch(() => alive && setDet({}))
    }
    if (tab === 'Histórico' && versions === null) {
      api.get<{ data: Dict[] }>(`/source-docs/${docId}/versions`).then((r) => alive && setVersions(r.data ?? [])).catch(() => alive && setVersions([]))
    }
    if (tab === 'Código' && code === null) {
      api.get<{ data: { content: string; bytes: number } }>(`/source-docs/${docId}/source`).then((r) => alive && setCode(r.data)).catch(() => alive && setCode({ content: '', bytes: 0 }))
    }
    return () => { alive = false }
  }, [tab, docId, det, versions, code])

  const sm = useMemo(() => D(meta?.documentation_meta?.semantic), [meta])
  const ef = useMemo(() => D(sm.entendimento_funcional), [sm])
  const ghUrl = meta ? `https://github.com/${meta.owner}/${meta.repository}/blob/${meta.branch}/${meta.path}` : '#'

  if (loading || !meta) return <div className="p-5"><Skeleton className="h-64" /></div>

  const crumbs: Crumb[] = [
    { label: meta.customer?.name ?? '—' }, { label: meta.repository },
    ...meta.path.split('/').slice(0, -1).map((s) => ({ label: s })), { label: meta.filename },
  ]
  const sem = meta.current_version?.semantic_quality
  const compl = S(D(sm.documentary_completeness).level)
  const usage = D(sm.usage)
  const cost = usage.total_cost_usd ?? usage.actual_cost_usd

  return (
    <div className="flex h-full flex-col">
      {/* cabeçalho compacto */}
      <div className="border-b border-[color:var(--border)] px-5 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><FileCode2 size={16} className="shrink-0" /><h2 className="truncate text-base font-semibold">{meta.filename}</h2></div>
            <div className="mt-1 max-w-full"><Breadcrumb items={crumbs} maxItems={6} /></div>
          </div>
          <a href={ghUrl} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-[color:var(--muted-fg)] hover:text-[color:var(--fg)]"><ExternalLink size={13} /> GitHub</a>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[color:var(--muted-fg)]">
          <span>Semântica: {sem === 'completed' ? <Badge variant="success">Completa</Badge> : sem === 'partial' ? <Badge variant="warning">Parcial</Badge> : <Badge variant="default">—</Badge>}</span>
          {compl && <span>Completude: {compl}</span>}
          {meta.lang && <span>Ling.: {meta.lang}</span>}
          <span>Última análise: {dt(meta.current_version?.created_at)}</span>
          {meta.situation?.documented_blob_sha && <span>blob: {S(meta.situation.documented_blob_sha).slice(0, 10)}</span>}
          {cost != null && <span>Custo IA: US$ {Number(cost).toFixed(2)}</span>}
          {meta.situation?.status === 'DESATUALIZADA' && <Badge variant="warning">Desatualizada</Badge>}
        </div>
      </div>

      {/* abas */}
      <nav className="flex gap-1 overflow-x-auto border-b border-[color:var(--border)] px-3">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${tab === t ? 'border-[color:var(--accent,#2563eb)] text-[color:var(--accent,#2563eb)] font-medium' : 'border-transparent text-[color:var(--muted-fg)] hover:text-[color:var(--fg)]'}`}>{t}</button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {tab === 'Visão Geral' && <Overview sm={sm} ef={ef} />}
        {tab === 'Regras' && <Regras sm={sm} />}
        {tab === 'Funções' && <Funcoes sm={sm} det={det} />}
        {tab === 'Dependências' && <Dependencias sm={sm} onNavigateSource={onNavigateSource} />}
        {tab === 'Evidências' && <Evidencias sm={sm} onNavigateSource={onNavigateSource} />}
        {tab === 'Código' && (code === null ? <Skeleton className="h-64" /> : (
          <pre className="max-h-full overflow-auto rounded-md border border-[color:var(--border)] bg-[color:var(--muted-bg,#f8fafc)] p-3 text-xs leading-relaxed"><code>{code.content || '// código indisponível'}</code></pre>
        ))}
        {tab === 'Histórico' && (versions === null ? <Skeleton className="h-40" /> : <Historico versions={versions} />)}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null
  return <div className="mb-3"><div className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted-fg)]">{label}</div><div className="mt-0.5 text-sm">{children}</div></div>
}

function Overview({ sm, ef }: { sm: Dict; ef: Dict }) {
  const pm = D(ef.processo_modulo)
  return (
    <div>
      <Field label="O que é / uma frase">{S(D(ef.uma_frase).texto) || S(ef.objetivo) || '—'}</Field>
      <Field label="Objetivo / responsabilidade">{S(ef.objetivo)}</Field>
      <Field label="Quando é utilizada">{S(ef.quando_usado)}</Field>
      <Field label="Processo / módulo">{[S(pm.processo), S(pm.modulo)].filter(Boolean).join(' · ') || '—'}</Field>
      {A(ef.entradas_principais).length > 0 && <Field label="Entradas">{<ul className="list-disc pl-5">{A(ef.entradas_principais).map((e, i) => <li key={i}>{S(e.nome)} — {S(e.descricao)}</li>)}</ul>}</Field>}
      {A(ef.saidas_principais).length > 0 && <Field label="Saídas / efeitos">{<ul className="list-disc pl-5">{A(ef.saidas_principais).map((e, i) => <li key={i}>{S(e.nome)} — {S(e.descricao)}</li>)}</ul>}</Field>}
      {A(sm.pontos_atencao).length > 0 && <Field label="Pontos de atenção">{<ul className="list-disc pl-5">{A(sm.pontos_atencao).map((p, i) => <li key={i}>{S(p.ponto)}</li>)}</ul>}</Field>}
      {D(sm.risco_alteracao).resumo != null && <Field label="Risco de alteração">{S(D(sm.risco_alteracao).resumo)} {D(sm.risco_alteracao).nivel ? <Badge variant="warning">{S(D(sm.risco_alteracao).nivel)}</Badge> : null}</Field>}
    </div>
  )
}

function Regras({ sm }: { sm: Dict }) {
  const rules = A(sm.regras_negocio).length ? A(sm.regras_negocio) : A(sm.business_rules)
  const trace = D(sm.funcoes_trace)
  const ni = A(trace.not_identified)
  if (!rules.length) return <p className="text-sm text-[color:var(--muted-fg)]">Sem regras de negócio documentadas.</p>
  return (
    <div className="flex flex-col gap-3">
      {rules.map((r, i) => (
        <Card key={i}>
          <div className="mb-1 flex items-center gap-2"><span className="font-semibold">{S(r.id) || `RN${i + 1}`}</span><span className="text-sm">{S(r.titulo) || S(r.descricao)}</span><span className="ml-auto">{confBadge(r.confidence)}</span></div>
          {r.condicao != null && <div className="text-sm"><span className="text-[color:var(--muted-fg)]">Condição:</span> <code className="text-xs">{S(r.condicao)}</code></div>}
          {r.efeito != null && <div className="text-sm"><span className="text-[color:var(--muted-fg)]">Efeito:</span> <code className="text-xs">{S(r.efeito)}</code></div>}
          {A(r.evidence).length > 0 && <div className="mt-1 text-xs text-[color:var(--muted-fg)]">Evidência: {A(r.evidence).map((e, j) => <code key={j} className="mr-1">{S(e.type)}:{S(e.table)}{S(e.field) ? '.' + S(e.field) : S(e.name)}</code>)}</div>}
        </Card>
      ))}
      {ni.length > 0 && <Card><div className="text-sm"><AlertTriangle size={14} className="mr-1 inline text-[color:var(--warning,#d97706)]" /> Não identificadas ({ni.length}): <span className="text-[color:var(--muted-fg)]">{ni.map((x) => S(x.name) || S(x.reason)).join(', ')}</span></div></Card>}
    </div>
  )
}

function Funcoes({ sm, det }: { sm: Dict; det: Dict | null }) {
  const sems = A(sm.funcoes)
  const dets = det ? A(det.functions) : []
  const detByName = new Map(dets.map((f) => [S(f.name).toLowerCase(), f]))
  const trace = D(sm.funcoes_trace)
  return (
    <div className="flex flex-col gap-2">
      {sems.length === 0 && dets.length === 0 && <p className="text-sm text-[color:var(--muted-fg)]">Sem funções.</p>}
      <Accordion>
        {(sems.length ? sems : dets).map((f, i) => {
          const d = detByName.get(S(f.name).toLowerCase()) ?? (det ? {} : null)
          return (
            <AccordionItem key={i} title={S(f.name)} badge={confBadge(f.confidence)} defaultOpen={i === 0}>
              {S(f.finalidade) && <p className="mb-2">{S(f.finalidade)}</p>}
              {det === null ? <span className="text-xs text-[color:var(--muted-fg)]">Carregando detalhes…</span> : d && (
                <div className="text-xs text-[color:var(--muted-fg)]">
                  {A(d.params).length > 0 && <div>Parâmetros: {A(d.params).map((p) => S(p.name) || S(p)).join(', ')}</div>}
                  {A(d.tables).length > 0 && <div>Tabelas: {A(d.tables).map((t) => S(t.name) || S(t)).join(', ')}</div>}
                  {A(d.calls).length > 0 && <div>Chamadas: {A(d.calls).map((c) => S(c.name) || S(c)).join(', ')}</div>}
                </div>
              )}
            </AccordionItem>
          )
        })}
      </Accordion>
      <div className="mt-1 text-xs text-[color:var(--muted-fg)]">Trace: {A(trace.completed).length} documentadas · {A(trace.not_identified).length} não identificadas · {A(trace.requested).length} solicitadas</div>
    </div>
  )
}

function crossTargets(sm: Dict) {
  const map = new Map<string, Dict>() // symbol → source
  for (const s of A(D(sm.cross_source).sources)) map.set(S(s.symbol).toLowerCase(), s)
  return map
}

function Dependencias({ sm, onNavigateSource }: { sm: Dict; onNavigateSource?: (id: number) => void }) {
  const deps = A(sm.dependencias_criticas)
  const targets = crossTargets(sm)
  const cross = deps.filter((d) => A(d.evidence).some((e) => S(e.level) === 'C' && e.source_doc_id != null))
  const local = deps.filter((d) => !cross.includes(d))
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-fg)]">Dependências locais</h3>
        {local.length === 0 ? <p className="text-sm text-[color:var(--muted-fg)]">—</p> : (
          <div className="flex flex-col gap-1.5">{local.map((d, i) => (
            <Card key={i}><div className="flex items-center gap-2"><span className="font-medium">{S(d.nome)}</span>{d.kind ? <Badge variant="default">{S(d.kind)}</Badge> : null}<span className="ml-auto">{confBadge(d.confidence)}</span></div>{S(d.como_participa) && <p className="mt-1 text-xs text-[color:var(--muted-fg)]">{S(d.como_participa)}</p>}</Card>
          ))}</div>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-fg)]">Cross-source (evidência C)</h3>
        {cross.length === 0 ? <p className="text-sm text-[color:var(--muted-fg)]">Nenhuma dependência entre fontes.</p> : (
          <div className="flex flex-col gap-1.5">{cross.map((d, i) => {
            const ev = A(d.evidence).find((e) => S(e.level) === 'C' && e.source_doc_id != null) ?? {}
            const tgt = targets.get(S(ev.symbol).toLowerCase())
            const targetPath = S(tgt?.path)
            const targetName = targetPath ? targetPath.split('/').pop() : `#${S(ev.source_doc_id)}`
            const tid = Number(ev.source_doc_id)
            return (
              <Card key={i}>
                <button onClick={() => onNavigateSource?.(tid)} className="flex w-full items-center gap-2 text-left hover:text-[color:var(--accent,#2563eb)]">
                  <span className="font-medium">{S(d.nome)}</span><ArrowRight size={14} className="text-[color:var(--muted-fg)]" /><span className="font-medium underline decoration-dotted">{targetName}</span>
                  <span className="ml-auto text-xs text-[color:var(--muted-fg)]">Mostrar no Acervo →</span>
                </button>
                <div className="mt-1 text-xs text-[color:var(--muted-fg)]">símbolo {S(ev.symbol)} · relação {S(ev.relation)} · blob {S(ev.blob_sha).slice(0, 10)} · nível {S(ev.level)}{targetPath ? ' · ' + targetPath : ''}</div>
                {S(d.como_participa) && <p className="mt-1 text-xs text-[color:var(--muted-fg)]">{S(d.como_participa)}</p>}
              </Card>
            )
          })}</div>
        )}
      </section>
    </div>
  )
}

function Evidencias({ sm, onNavigateSource }: { sm: Dict; onNavigateSource?: (id: number) => void }) {
  const cs = D(sm.cross_source)
  const acc = A(cs.evidence_accepted), rej = A(cs.evidence_rejected)
  const row = (e: Dict, verdict: string) => (
    <Tr key={S(e.symbol) + verdict + S(e.blob_sha)}>
      <Td>{verdict === 'ACCEPT' ? <Badge variant="success">ACCEPT</Badge> : <Badge variant="default">REJECT</Badge>}</Td>
      <Td>{S(e.level)}</Td><Td>{S(e.evidence_type) || S(e.relation)}</Td><Td>{S(e.symbol)}</Td>
      <Td>{e.source_doc_id != null ? <button className="underline decoration-dotted hover:text-[color:var(--accent,#2563eb)]" onClick={() => onNavigateSource?.(Number(e.source_doc_id))}>#{S(e.source_doc_id)}</button> : '—'}</Td>
      <Td><code className="text-xs">{S(e.blob_sha).slice(0, 12)}</code></Td>
    </Tr>
  )
  if (!acc.length && !rej.length) return <p className="text-sm text-[color:var(--muted-fg)]">Sem evidências cross-source registradas.</p>
  return (
    <Table>
      <Thead><Tr><Th>Veredito</Th><Th>Level</Th><Th>Tipo</Th><Th>Símbolo</Th><Th>source_doc</Th><Th>blob</Th></Tr></Thead>
      <Tbody>{acc.map((e) => row(e, 'ACCEPT'))}{rej.map((e) => row(e, 'REJECT'))}</Tbody>
    </Table>
  )
}

function Historico({ versions }: { versions: Dict[] }) {
  if (!versions.length) return <p className="text-sm text-[color:var(--muted-fg)]">Sem histórico.</p>
  return (
    <Table>
      <Thead><Tr><Th>Data</Th><Th>GMUD</Th><Th>Responsável</Th><Th>Status</Th><Th>Mudança</Th></Tr></Thead>
      <Tbody>{versions.map((v, i) => (
        <Tr key={i}><Td>{dt(v.created_at ?? v.date)}</Td><Td>{S(D(v.gmud).ticket_number) || S(v.gmud_id) || '—'}</Td><Td>{S(v.responsavel) || '—'}</Td><Td>{S(v.analysis_status) || S(v.status)}</Td><Td>{S(v.diff_summary) || S(v.change_summary) || '—'}</Td></Tr>
      ))}</Tbody>
    </Table>
  )
}
