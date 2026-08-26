'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Central de Fontes — aba QUALIDADE (CodeAnalysis). Consome SOMENTE o backend do
// Minutor (A2): GET/POST /source-docs/{id}/quality, /quality/history e
// /quality/{analysis}/findings. O browser nunca fala com o CodeAnalysis direto e
// nunca recebe código-fonte quando o usuário não tem source_docs.view_git (o backend
// já remove os trechos). Polling só enquanto queued/running; para no unmount.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, Clock, Gauge, History, RefreshCw, Search, ShieldAlert, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, EmptyState, Skeleton } from '@/components/ds'
import { api, ApiError } from '@/lib/api'

type QualityState = 'never_analyzed' | 'queued' | 'running' | 'completed' | 'failed' | 'outdated'

interface Counts { critical: number | null; warnings: number | null; recommendations: number | null; total: number | null }
interface Analysis {
  id: number; status: string; source_blob_sha: string | null; external_job_id: string | null
  score: number | null; grade: string | null; risk: string | null; counts: Counts
  engine: string | null; engine_version: string | null; rules_version: string | null
  requested_at: string | null; started_at: string | null; completed_at: string | null; failed_at: string | null
  error_code: string | null; error_message: string | null; stale: boolean
}
interface QualityView { state: QualityState; source_doc_id: number; current_blob_sha: string | null; analysis: Analysis | null; service_enabled?: boolean }
interface Finding {
  severity: string; category?: string; rule?: string; title?: string; description?: string
  line?: number | null; start_line?: number | null; snippet?: string; count?: number; recommendation?: string
}
interface HistoryItem { id: number; status: string; source_blob_sha: string | null; score: number | null; grade: string | null; risk: string | null; requested_at: string | null; completed_at: string | null; stale: boolean }

const INFLIGHT = ['queued', 'running']
const POLL_MS = 4000

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v); return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR')
}
function shortSha(s: string | null | undefined): string { return s ? s.slice(0, 8) : '—' }

function sevVariant(sev: string): string {
  const s = (sev || '').toUpperCase()
  if (s === 'BLOCKER' || s === 'CRITICAL') return 'danger'
  if (s === 'MAJOR') return 'warning'
  return 'default'
}
function sevLabel(sev: string): string {
  const s = (sev || '').toUpperCase()
  if (s === 'BLOCKER' || s === 'CRITICAL') return 'Crítico'
  if (s === 'MAJOR') return 'Alerta'
  if (s === 'MINOR') return 'Recomendação'
  return s || '—'
}

export function QualityTab({ docId, canRun, canViewGit, ghBlobUrl }: {
  docId: string | number; canRun: boolean; canViewGit: boolean; ghBlobUrl?: string
}) {
  const id = String(docId)
  const [view, setView] = useState<QualityView | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [findingsLoading, setFindingsLoading] = useState(false)
  const [hist, setHist] = useState<HistoryItem[] | null>(null)
  const [unavailable, setUnavailable] = useState(false) // serviço off/indisponível → painel limpo

  const [sevFilter, setSevFilter] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [search, setSearch] = useState('')

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const aliveRef = useRef(true)

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const loadFindings = useCallback(async (analysisId: number) => {
    setFindingsLoading(true)
    try {
      const r = await api.get<{ data: { findings: Finding[] } }>(`/source-docs/${id}/quality/${analysisId}/findings`)
      if (aliveRef.current) setFindings(r.data.findings ?? [])
    } catch { if (aliveRef.current) setFindings([]) }
    finally { if (aliveRef.current) setFindingsLoading(false) }
  }, [id])

  const loadHistory = useCallback(async () => {
    try {
      const r = await api.get<{ data: { items: HistoryItem[] } }>(`/source-docs/${id}/quality/history`)
      if (aliveRef.current) setHist(r.data.items ?? [])
    } catch { /* histórico é secundário */ }
  }, [id])

  // Aplica um novo estado; dispara findings/histórico e (des)liga o polling conforme o caso.
  const applyView = useCallback((v: QualityView) => {
    if (!aliveRef.current) return
    setView(v)
    if (v.analysis && (v.state === 'completed' || v.state === 'outdated')) {
      void loadFindings(v.analysis.id)
    }
    if (!INFLIGHT.includes(v.state)) {
      // R1: se o polling ESTAVA ativo e agora chegou a um estado terminal (completed/failed/
      // outdated), a linha do Histórico ainda mostra o snapshot queued/running. Refetch do
      // histórico para refletir status/score finais SEM F5. (Na carga inicial pollRef é null,
      // então não refaz — o histórico já foi carregado no mount.)
      const wasPolling = pollRef.current !== null
      stopPolling()
      if (wasPolling) void loadHistory()
    }
  }, [loadFindings, stopPolling, loadHistory])

  const poll = useCallback(async () => {
    try {
      const r = await api.get<{ data: QualityView }>(`/source-docs/${id}/quality`)
      applyView(r.data)
    } catch { /* segue tentando enquanto o intervalo viver */ }
  }, [id, applyView])

  const startPolling = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(poll, POLL_MS)
  }, [poll, stopPolling])

  // Carga inicial (por fonte). Reinicia ao trocar de docId.
  useEffect(() => {
    aliveRef.current = true
    setLoading(true); setView(null); setFindings(null); setHist(null); setUnavailable(false)
    ;(async () => {
      try {
        const r = await api.get<{ data: QualityView }>(`/source-docs/${id}/quality`)
        if (!aliveRef.current) return
        if (r.data.service_enabled === false) { setUnavailable(true); return } // backend sinaliza off (opcional)
        applyView(r.data)
        if (INFLIGHT.includes(r.data.state)) startPolling()
      } catch {
        // Não parecer quebrado: indisponibilidade vira estado limpo (sem stacktrace/toast técnico).
        if (aliveRef.current) setUnavailable(true)
      } finally { if (aliveRef.current) setLoading(false) }
    })()
    void loadHistory()
    return () => { aliveRef.current = false; stopPolling() } // para o polling no unmount/troca de fonte
  }, [id, applyView, startPolling, loadHistory, stopPolling])

  const doRun = useCallback(async () => {
    if (running || (view && INFLIGHT.includes(view.state))) return // anti-duplo-clique (o A2 também é atômico)
    setRunning(true)
    try {
      const r = await api.post<{ data: QualityView }>(`/source-docs/${id}/quality`, {})
      applyView(r.data)
      if (INFLIGHT.includes(r.data.state)) startPolling()
      void loadHistory()
    } catch (e) {
      // 503 = serviço desabilitado/indisponível → painel limpo (não toast de erro).
      if (e instanceof ApiError && e.status === 503) setUnavailable(true)
      else toast.error(e instanceof ApiError ? e.message : 'Não foi possível iniciar a análise.')
    } finally { if (aliveRef.current) setRunning(false) }
  }, [id, running, view, applyView, startPolling, loadHistory])

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>
  if (unavailable) return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text)' }}>
        <Gauge size={18} style={{ color: 'var(--text-light)' }} /> Análise de qualidade indisponível neste ambiente
      </div>
      <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
        O serviço de análise não está habilitado ou disponível. A qualidade aparecerá aqui quando o serviço estiver ativo.
      </p>
    </div>
  )
  if (!view) return <EmptyState icon={Gauge} title="Qualidade indisponível" />

  const a = view.analysis
  const inflight = INFLIGHT.includes(view.state)
  const runBtn = (label: string) => canRun
    ? <Button size="sm" variant="primary" icon={RefreshCw} loading={running} disabled={inflight} onClick={doRun}>{label}</Button>
    : null

  return (
    <div className="space-y-5">
      {/* ── NUNCA ANALISADO ── */}
      {view.state === 'never_analyzed' && (
        <EmptyState icon={Gauge}
          title="Sem análise de qualidade para a versão atual"
          action={canRun
            ? <Button size="sm" variant="primary" icon={Gauge} loading={running} onClick={doRun}>Analisar fonte</Button>
            : <span className="text-sm" style={{ color: 'var(--text-light)' }}>Você não tem permissão para disparar a análise.</span>} />
      )}

      {/* ── EM ANDAMENTO ── */}
      {inflight && (
        <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <RefreshCw size={18} className="animate-spin" style={{ color: 'var(--primary)' }} />
          <div className="text-sm">
            <div className="font-semibold" style={{ color: 'var(--text)' }}>Análise em andamento…</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-light)' }}>
              versão {shortSha(a?.source_blob_sha)} · solicitada {fmtDateTime(a?.requested_at)} · status {view.state}
            </div>
          </div>
        </div>
      )}

      {/* ── FALHA ── */}
      {view.state === 'failed' && (
        <div className="rounded-xl p-4" style={{ background: 'var(--danger-bg, var(--surface))', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--danger, var(--text))' }}>
            <XCircle size={18} /> Não foi possível concluir a análise.
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {a?.error_message || 'O serviço de análise não respondeu. Tente novamente em instantes.'}
          </p>
          <div className="mt-3">{runBtn('Tentar novamente')}</div>
        </div>
      )}

      {/* ── VERSÃO ANTERIOR (OUTDATED) ── */}
      {view.state === 'outdated' && (
        <div className="rounded-xl p-4" style={{ background: 'var(--warning-bg, var(--surface))', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--warning, var(--text))' }}>
            <AlertTriangle size={18} /> Análise da versão anterior
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            A última análise disponível pertence a outra versão do fonte (blob {shortSha(a?.source_blob_sha)}),
            diferente da versão atual ({shortSha(view.current_blob_sha)}). O score abaixo <b>não</b> reflete a versão vigente.
          </p>
          <div className="mt-3">{runBtn('Analisar versão atual')}</div>
        </div>
      )}

      {/* ── CABEÇALHO DE SCORE (completed; ou outdated como "versão anterior") ── */}
      {a && (view.state === 'completed' || view.state === 'outdated') && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <Gauge size={16} style={{ color: 'var(--primary)' }} />
              {view.state === 'outdated' ? 'Qualidade (versão anterior)' : 'Qualidade do código'}
            </h3>
            {view.state === 'completed' && runBtn('Analisar novamente')}
          </div>
          <div className="text-xs mb-3 flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: 'var(--text-light)' }}>
            <span>Última análise: {fmtDateTime(a.completed_at || a.requested_at)}</span>
            <span>Versão: {shortSha(a.source_blob_sha)}</span>
            {a.engine && <span>Engine: {a.engine}</span>}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ScoreCell label="Score" value={a.score != null ? `${a.score}/100${a.grade ? ` · ${a.grade}` : ''}` : '—'} accent />
            <ScoreCell label="Críticos" value={a.counts.critical ?? 0} tone="danger" />
            <ScoreCell label="Alertas" value={a.counts.warnings ?? 0} tone="warning" />
            <ScoreCell label="Recomendações" value={a.counts.recommendations ?? 0} />
          </div>
        </div>
      )}

      {/* ── ACHADOS (só quando há análise concluída) ── */}
      {a && (view.state === 'completed' || view.state === 'outdated') && (
        <FindingsBlock
          findings={findings} loading={findingsLoading}
          sevFilter={sevFilter} setSevFilter={setSevFilter}
          catFilter={catFilter} setCatFilter={setCatFilter}
          search={search} setSearch={setSearch}
          canViewGit={canViewGit} ghBlobUrl={ghBlobUrl}
        />
      )}

      {/* ── HISTÓRICO ── */}
      {hist && hist.length > 0 && (
        <div>
          <h4 className="font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <History size={15} /> Histórico <span className="text-xs font-normal" style={{ color: 'var(--text-light)' }}>({hist.length})</span>
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-left" style={{ color: 'var(--text-light)' }}>
                  <th className="py-2 pr-4">Data</th><th className="py-2 pr-4">Score</th>
                  <th className="py-2 pr-4">Status</th><th className="py-2 pr-4">Versão</th><th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {hist.map((h) => (
                  <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="py-2.5 pr-4" style={{ color: 'var(--text)' }}>{fmtDateTime(h.completed_at || h.requested_at)}</td>
                    <td className="py-2.5 pr-4">{h.score != null ? `${h.score}/100${h.grade ? ` · ${h.grade}` : ''}` : '—'}</td>
                    <td className="py-2.5 pr-4"><Badge variant={h.status === 'completed' ? 'success' : h.status === 'failed' ? 'danger' : 'default'}>{h.status}</Badge></td>
                    <td className="py-2.5 pr-4" style={{ color: 'var(--text-muted)' }}>{shortSha(h.source_blob_sha)}</td>
                    <td className="py-2.5">{!h.stale && <Badge variant="success">ATUAL</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function ScoreCell({ label, value, accent, tone }: { label: string; value: string | number; accent?: boolean; tone?: 'danger' | 'warning' }) {
  const color = tone === 'danger' ? 'var(--danger, var(--text))' : tone === 'warning' ? 'var(--warning, var(--text))' : 'var(--text)'
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: accent ? 'var(--primary-soft)' : 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>{label}</div>
      <div className="text-lg font-bold" style={{ color: accent ? 'var(--primary)' : color }}>{value}</div>
    </div>
  )
}

function FindingsBlock({
  findings, loading, sevFilter, setSevFilter, catFilter, setCatFilter, search, setSearch, canViewGit, ghBlobUrl,
}: {
  findings: Finding[] | null; loading: boolean
  sevFilter: string; setSevFilter: (v: string) => void
  catFilter: string; setCatFilter: (v: string) => void
  search: string; setSearch: (v: string) => void
  canViewGit: boolean; ghBlobUrl?: string
}) {
  if (loading) return <div className="space-y-2"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-24" /></div>
  const all = findings ?? []
  if (all.length === 0) return (
    <Section title="Achados">
      <div className="flex items-center gap-2 text-sm rounded-xl p-3" style={{ background: 'var(--success-bg, var(--surface))', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
        <CheckCircle2 size={16} style={{ color: 'var(--success, var(--primary))' }} /> Nenhum achado nesta análise.
      </div>
    </Section>
  )

  const severities = Array.from(new Set(all.map((f) => (f.severity || '').toUpperCase()).filter(Boolean)))
  const categories = Array.from(new Set(all.map((f) => f.category || '').filter(Boolean)))
  const q = search.trim().toLowerCase()
  const shown = all.filter((f) => {
    if (sevFilter && (f.severity || '').toUpperCase() !== sevFilter) return false
    if (catFilter && (f.category || '') !== catFilter) return false
    if (q) {
      const hay = `${f.title ?? ''} ${f.description ?? ''} ${f.rule ?? ''} ${f.category ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const hasFilters = all.length > 6
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h4 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <ShieldAlert size={15} /> Achados
          <span className="text-xs font-normal" style={{ color: 'var(--text-light)' }}>
            ({all.length} achado{all.length === 1 ? '' : 's'}{shown.length !== all.length ? ` · ${shown.length} exibidos` : ''})
          </span>
        </h4>
      </div>

      {hasFilters && (
        <div className="flex flex-wrap gap-2 mb-3">
          <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value)} className="ds-input text-sm" style={{ maxWidth: 180 }}>
            <option value="">Severidade (todas)</option>
            {severities.map((s) => <option key={s} value={s}>{sevLabel(s)}</option>)}
          </select>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="ds-input text-sm" style={{ maxWidth: 220 }}>
            <option value="">Categoria (todas)</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="relative flex-1" style={{ minWidth: 180 }}>
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar achado…"
              className="ds-input text-sm w-full" style={{ paddingLeft: 30 }} />
          </div>
        </div>
      )}

      <div className="space-y-2">
        {shown.map((f, i) => {
          const line = f.line ?? f.start_line ?? null
          const gh = canViewGit && ghBlobUrl && line ? `${ghBlobUrl}#L${line}` : null
          return (
            <div key={i} className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={sevVariant(f.severity)}>{sevLabel(f.severity)}</Badge>
                {f.category && <span className="text-xs" style={{ color: 'var(--text-light)' }}>{f.category}</span>}
                {f.rule && <span className="text-xs font-mono" style={{ color: 'var(--text-light)' }}>{f.rule}</span>}
                {f.count && f.count > 1 ? <span className="text-xs" style={{ color: 'var(--text-light)' }}>×{f.count}</span> : null}
              </div>
              <div className="text-sm font-medium mt-1" style={{ color: 'var(--text)' }}>{f.title || f.rule || 'Achado'}</div>
              {f.description && <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{f.description}</p>}
              <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: 'var(--text-light)' }}>
                {line != null && <span>Linha {line}</span>}
                {gh && <a href={gh} target="_blank" rel="noopener noreferrer" className="font-medium" style={{ color: 'var(--primary)' }}>Ver no código</a>}
              </div>
              {/* trecho só aparece quando o backend o forneceu (usuário com view_git) */}
              {f.snippet && (
                <pre className="text-xs mt-2 p-2 rounded-lg overflow-x-auto" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{f.snippet}</pre>
              )}
              {f.recommendation && <p className="text-xs mt-1.5" style={{ color: 'var(--text-light)' }}><b>Sugestão:</b> {f.recommendation}</p>}
            </div>
          )
        })}
        {shown.length === 0 && <p className="text-sm" style={{ color: 'var(--text-light)' }}>Nenhum achado corresponde aos filtros.</p>}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h4 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>{title}</h4>{children}</div>
}
