'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Central de Fontes — C1 · Ficha do fonte. Cabeçalho com os 4 status SEPARADOS
// (documentação · semântica · última GMUD · última validação). As 15 seções do
// motor viram 6 abas. O bloco pesado (deterministic ~350KB) e o histórico são
// carregados sob demanda.
// ─────────────────────────────────────────────────────────────────────────────

import { use, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Database, Download, ExternalLink, FileCode2,
  GitBranch, HelpCircle, History, Layers, ListTree, RefreshCw, ShieldAlert, ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { Badge, Button, Card, EmptyState, Modal, Skeleton } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'

type Situation = 'ATUALIZADA' | 'DESATUALIZADA' | 'NAO_VALIDADO'

interface Meta {
  id: number; filename: string; path: string; owner: string; repository: string; branch: string
  lang: string | null; tipo: string | null
  customer: { id: number; name: string } | null
  analysis_status: string
  situation: { status: Situation; reason: string | null; documented_blob_sha: string | null; current_blob_sha: string | null; checked_at: string | null; message: string | null }
  current_version: {
    id: number; analysis_status: string; semantic_quality: 'completed' | 'partial' | 'none'
    source_commit_sha: string | null; source_blob_sha: string | null
    gmud: { id: number | null; ticket_number: string | null } | null
    responsavel: string | null; created_at: string | null
  } | null
  documentation_meta: Record<string, unknown> | null
}

interface VersionRow {
  id: number; source_commit_sha: string | null; source_blob_sha: string | null
  gmud_id: number | null; ticket_number: string | null; responsavel: string | null
  analysis_status: string; diff_summary: string | null; created_at: string | null
}

interface ReprocessPlan {
  layer: string; force: boolean; action: 'reuse' | 'new_version' | 'reprocess_in_place' | 'immutable_noop'
  will_create_version: boolean; blob_sha: string | null; documented_blob_sha: string | null
  analysis_status: string | null; situation: string | null; ai_enabled: boolean; environment: string
  estimated_cost_usd: number; hard_limit_usd: number; blocked_reason: string | null
}

const SIT: Record<Situation, { variant: string; label: string; icon: typeof CheckCircle2 }> = {
  ATUALIZADA:    { variant: 'success', label: 'Atualizada',    icon: CheckCircle2 },
  DESATUALIZADA: { variant: 'warning', label: 'Desatualizada', icon: AlertTriangle },
  NAO_VALIDADO:  { variant: 'default', label: 'Não validada',  icon: HelpCircle },
}
const SEM: Record<string, { variant: string; label: string }> = {
  completed: { variant: 'success', label: 'Completa' },
  partial:   { variant: 'warning', label: 'Parcial' },
  none:      { variant: 'default', label: 'Não processada' },
}
const TABS = [
  { key: 'resumo', label: 'Resumo', icon: FileCode2 },
  { key: 'estrutura', label: 'Estrutura', icon: ListTree },
  { key: 'dados', label: 'Dados & SQL', icon: Database },
  { key: 'deps', label: 'Dependências', icon: Layers },
  { key: 'riscos', label: 'Riscos', icon: ShieldAlert },
  { key: 'historico', label: 'Histórico', icon: History },
] as const
type TabKey = typeof TABS[number]['key']

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v); return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR')
}
function asArray(v: unknown): unknown[] { return Array.isArray(v) ? v : [] }
function nameOf(item: unknown): string {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>
    return String(o.name ?? o.nome ?? o.table ?? o.field ?? o.to ?? JSON.stringify(o))
  }
  return String(item)
}

export default function FichaFontePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('resumo')

  const [det, setDet] = useState<Record<string, unknown> | null>(null)
  const [detLoading, setDetLoading] = useState(false)
  const [versions, setVersions] = useState<VersionRow[] | null>(null)
  const [verLoading, setVerLoading] = useState(false)

  const { hasPermission } = useAuth()
  const [validating, setValidating] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [reproOpen, setReproOpen] = useState(false)
  const [plan, setPlan] = useState<ReprocessPlan | null>(null)
  const [reproLayer, setReproLayer] = useState<'deterministic' | 'semantic' | 'both'>('both')
  const [reproForce, setReproForce] = useState(false)
  const [exec, setExec] = useState<{ status: string; reason?: string | null } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const reload = useCallback(async () => {
    try { const r = await api.get<{ data: Meta }>(`/source-docs/${id}`); setMeta(r.data) } catch { /* noop */ }
  }, [id])

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const r = await api.get<{ data: Meta }>(`/source-docs/${id}`)
        if (alive) setMeta(r.data)
      } catch (e) {
        if (alive) setError(e instanceof ApiError && e.status === 404 ? 'Fonte não encontrada.' : 'Erro ao carregar a ficha.')
      } finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false; if (pollRef.current) clearInterval(pollRef.current) }
  }, [id])

  // ── ações (C3) ──────────────────────────────────────────────────────────────
  const doValidate = useCallback(async () => {
    setValidating(true)
    try {
      const r = await api.post<{ data: { situation: { status: string } } }>(`/source-docs/${id}/validate`, {})
      toast.success(`Situação: ${r.data.situation.status}`)
      await reload()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao validar.') }
    finally { setValidating(false) }
  }, [id, reload])

  const doDownload = useCallback(async (format: 'docx' | 'pdf' | 'md') => {
    setDownloading(format)
    try {
      // download binário (o api client parseia JSON) — fetch direto com o token da aba.
      const token = typeof window !== 'undefined' ? window.sessionStorage.getItem('minutor_token') : null
      const res = await fetch(`/api/v1/source-docs/${id}/render?format=${format}`, {
        credentials: 'same-origin',
        headers: { Accept: '*/*', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-Screen-Path': window.location.pathname },
      })
      if (!res.ok) throw new ApiError(res.status, 'Falha no download.')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${meta?.filename?.replace(/\.[^.]+$/, '') ?? 'fonte'}.${format}`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha no download.') }
    finally { setDownloading(null) }
  }, [id, meta])

  const openReprocess = useCallback(async () => {
    setReproOpen(true); setPlan(null)
    try {
      const r = await api.get<{ data: ReprocessPlan }>(`/source-docs/${id}/reprocess/plan?layer=${reproLayer}&force=${reproForce}`)
      setPlan(r.data)
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Falha ao montar o plano.') }
  }, [id, reproLayer, reproForce])

  useEffect(() => { if (reproOpen) openReprocess() }, [reproLayer, reproForce, reproOpen, openReprocess])

  const confirmReprocess = useCallback(async () => {
    try {
      const r = await api.post<{ data: { action: string; execution_id?: number } }>(`/source-docs/${id}/reprocess`, { layer: reproLayer, force: reproForce })
      setReproOpen(false)
      if (r.data.action === 'reuse') { toast.info('Documentação já reflete o blob atual (reutilizada).'); return }
      toast.success('Reprocessamento enfileirado.')
      setExec({ status: 'queued' })
      pollRef.current = setInterval(async () => {
        try {
          const e = await api.get<{ data: { status: string; reason?: string | null } | null }>(`/source-docs/${id}/execution`)
          const st = e.data?.status
          setExec(e.data)
          if (st === 'ok' || st === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current)
            if (st === 'ok') { toast.success('Reprocessamento concluído.'); await reload() }
            else toast.error(`Reprocessamento falhou: ${e.data?.reason ?? ''}`)
          }
        } catch { /* segue tentando */ }
      }, 3000)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Falha ao reprocessar.'
      toast.error(msg)
    }
  }, [id, reproLayer, reproForce, reload])

  // lazy: documentação pesada (só quando abre uma aba que precisa)
  const loadDet = useCallback(async () => {
    if (det || detLoading) return
    setDetLoading(true)
    try {
      const r = await api.get<{ data: { deterministic: Record<string, unknown> | null } }>(`/source-docs/${id}/documentation`)
      setDet(r.data.deterministic ?? {})
    } catch { setDet({}) } finally { setDetLoading(false) }
  }, [id, det, detLoading])

  const loadVersions = useCallback(async () => {
    if (versions || verLoading) return
    setVerLoading(true)
    try {
      const r = await api.get<{ data: VersionRow[] }>(`/source-docs/${id}/versions`)
      setVersions(r.data)
    } catch { setVersions([]) } finally { setVerLoading(false) }
  }, [id, versions, verLoading])

  useEffect(() => {
    if (['estrutura', 'dados', 'deps'].includes(tab)) loadDet()
    if (tab === 'historico') loadVersions()
  }, [tab, loadDet, loadVersions])

  if (loading) {
    return <AppLayout><div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /></div></AppLayout>
  }
  if (error || !meta) {
    return <AppLayout><EmptyState icon={HelpCircle} title={error ?? 'Erro'}
      action={<Link href="/central-fontes" className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>Voltar ao catálogo</Link>} /></AppLayout>
  }

  const sit = SIT[meta.situation.status]
  const sem = SEM[meta.current_version?.semantic_quality ?? 'none']
  const sm = (meta.documentation_meta?.semantic ?? {}) as Record<string, unknown>
  const ghUrl = `https://github.com/${meta.owner}/${meta.repository}/blob/${meta.branch}/${meta.path}`

  return (
    <AppLayout>
      <Link href="/central-fontes" className="inline-flex items-center gap-1.5 text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
        <ArrowLeft size={15} /> Voltar ao catálogo
      </Link>

      {/* Cabeçalho + 4 status separados */}
      <Card className="mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileCode2 size={18} style={{ color: 'var(--primary)' }} />
              <h1 className="text-lg font-bold truncate" style={{ color: 'var(--text)' }}>{meta.filename}</h1>
            </div>
            <div className="text-xs mt-1 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: 'var(--text-light)' }}>
              <span>{meta.customer?.name ?? '—'}</span>
              <span className="inline-flex items-center gap-1"><GitBranch size={12} />{meta.owner}/{meta.repository}@{meta.branch}</span>
              <span>{meta.lang ?? ''}</span>
              <span className="truncate">{meta.path}</span>
            </div>
          </div>
          {hasPermission('source_docs.view_git') && (
            <a href={ghUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium shrink-0" style={{ color: 'var(--primary)' }}>
              Ver no GitHub <ExternalLink size={14} />
            </a>
          )}
        </div>

        {/* Ações operacionais (C3) — cada uma gateada por sua permissão */}
        <div className="flex flex-wrap gap-2 mt-4">
          {hasPermission('source_docs.validate') && (
            <Button size="sm" variant="secondary" icon={ShieldCheck} loading={validating} onClick={doValidate}>Validar agora</Button>
          )}
          {hasPermission('source_docs.reprocess') && (
            <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => { setReproOpen(true) }}>Reprocessar</Button>
          )}
          {hasPermission('source_docs.download') && (
            <>
              <Button size="sm" variant="secondary" icon={Download} loading={downloading === 'docx'} onClick={() => doDownload('docx')}>DOCX</Button>
              <Button size="sm" variant="secondary" icon={Download} loading={downloading === 'pdf'} onClick={() => doDownload('pdf')}>PDF</Button>
              <Button size="sm" variant="secondary" icon={Download} loading={downloading === 'md'} onClick={() => doDownload('md')}>MD</Button>
            </>
          )}
          {exec && exec.status !== 'ok' && exec.status !== 'failed' && (
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg" style={{ background: 'var(--warning-soft, var(--surface))', color: 'var(--warning, var(--text-muted))', border: '1px solid var(--border)' }}>
              <RefreshCw size={12} className="animate-spin" /> reprocessando… ({exec.status})
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <StatusCell label="Documentação">
            <Badge variant={sit.variant}>{sit.label}</Badge>
            {meta.situation.reason && <span className="block text-[11px] mt-1" style={{ color: 'var(--text-light)' }}>{meta.situation.reason}</span>}
          </StatusCell>
          <StatusCell label="Semântica"><Badge variant={sem.variant}>{sem.label}</Badge></StatusCell>
          <StatusCell label="Última GMUD">
            <span style={{ color: 'var(--text)' }}>{meta.current_version?.gmud?.ticket_number ?? '—'}</span>
            <span className="block text-[11px]" style={{ color: 'var(--text-light)' }}>{fmtDateTime(meta.current_version?.created_at)}</span>
          </StatusCell>
          <StatusCell label="Última validação">
            <span className="text-sm" style={{ color: 'var(--text)' }}>{fmtDateTime(meta.situation.checked_at)}</span>
          </StatusCell>
        </div>
      </Card>

      {/* Abas */}
      <div className="flex flex-wrap gap-1 mb-4">
        {TABS.map((t) => {
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors"
              style={active
                ? { background: 'var(--primary)', color: 'var(--primary-fg)' }
                : { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              <t.icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      <Card>
        {tab === 'resumo' && (
          <Section title="Objetivo">
            <Prose value={sm.objetivo ?? sm.resumo ?? sm.finalidade} />
            {sm.fluxo != null && <><h4 className="font-semibold mt-4 mb-1" style={{ color: 'var(--text)' }}>Fluxo</h4><Prose value={sm.fluxo} /></>}
          </Section>
        )}

        {tab === 'estrutura' && (
          <LazyBlock loading={detLoading}>
            <NameList title="Funções / rotinas" items={asArray(det?.functions)} />
          </LazyBlock>
        )}

        {tab === 'dados' && (
          <LazyBlock loading={detLoading}>
            <NameList title="Tabelas" items={asArray(det?.tables)} />
            <NameList title="Campos" items={asArray(det?.fields)} />
            <NameList title="Consultas SQL" items={asArray(det?.sql)} render={(x) => {
              const o = x as Record<string, unknown>
              return typeof x === 'string' ? x : String(o.summary ?? o.type ?? o.operation ?? nameOf(x))
            }} />
          </LazyBlock>
        )}

        {tab === 'deps' && (
          <LazyBlock loading={detLoading}>
            <NameList title="Dependências" items={asArray(det?.dependencies)} />
            <NameList title="Integrações externas" items={asArray(det?.integrations)} />
            <NameList title="Chamadas (call graph)" items={asArray(det?.call_graph)} render={(x) => {
              const o = x as Record<string, unknown>
              return typeof x === 'string' ? x : `${o.from ?? '?'} → ${o.to ?? o.called_as ?? '?'}`
            }} />
          </LazyBlock>
        )}

        {tab === 'riscos' && (
          <Section title="Pontos de atenção">
            <NameList title="Achados de segurança" items={asArray(meta.documentation_meta?.security_findings)} render={(x) => {
              const o = x as Record<string, unknown>
              return typeof x === 'string' ? x : `${o.type ?? 'achado'} — ${o.location ?? ''} (${o.severity ?? '?'})`
            }} />
            <NameList title="Atenção (semântico)" items={asArray(sm.pontos_atencao ?? sm.riscos)} />
          </Section>
        )}

        {tab === 'historico' && (
          <LazyBlock loading={verLoading}>
            {!versions || versions.length === 0 ? (
              <EmptyState icon={History} title="Sem histórico de versões" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: 'var(--text-light)' }} className="text-xs uppercase tracking-wider text-left">
                      <th className="py-2 pr-4">Data</th><th className="py-2 pr-4">GMUD</th>
                      <th className="py-2 pr-4">Responsável</th><th className="py-2 pr-4">Status</th><th className="py-2">Resumo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map((v) => (
                      <tr key={v.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="py-2.5 pr-4" style={{ color: 'var(--text)' }}>{fmtDateTime(v.created_at)}</td>
                        <td className="py-2.5 pr-4">{v.ticket_number ?? '—'}</td>
                        <td className="py-2.5 pr-4">{v.responsavel ?? '—'}</td>
                        <td className="py-2.5 pr-4"><Badge variant={v.analysis_status === 'completed' ? 'success' : 'warning'}>{v.analysis_status}</Badge></td>
                        <td className="py-2.5" style={{ color: 'var(--text-muted)' }}>{v.diff_summary ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </LazyBlock>
        )}
      </Card>

      {/* Modal de reprocessamento — plano + confirmação */}
      {reproOpen && (
        <Modal open onClose={() => setReproOpen(false)} title="Reprocessar documentação">
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-light)' }}>Camada</div>
              <div className="flex gap-1">
                {(['deterministic', 'semantic', 'both'] as const).map((l) => (
                  <button key={l} onClick={() => setReproLayer(l)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={reproLayer === l ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {l === 'deterministic' ? 'Determinístico' : l === 'semantic' ? 'Semântico' : 'Ambos'}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={reproForce} onChange={(e) => setReproForce(e.target.checked)} /> Forçar (mesmo blob)
            </label>

            {!plan ? (
              <div className="text-sm" style={{ color: 'var(--text-light)' }}>Montando plano…</div>
            ) : (
              <div className="rounded-xl p-3 text-sm space-y-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div><b>Ação:</b> {plan.action === 'reuse' ? 'Reutilizar (nada a fazer)' : plan.action === 'new_version' ? 'Criar NOVA versão (código mudou)' : plan.action === 'reprocess_in_place' ? 'Reprocessar a versão atual' : 'Imutável — sem mudanças'}</div>
                <div><b>Situação:</b> {plan.situation ?? '—'} · <b>blob:</b> {(plan.blob_sha ?? '—').slice(0, 8)}</div>
                {(reproLayer !== 'deterministic') && (
                  <div><b>Semântica:</b> {plan.ai_enabled ? `IA on (${plan.environment})` : `IA indisponível (${plan.environment})`}
                    {plan.ai_enabled && <> · custo estimado <b>US$ {plan.estimated_cost_usd.toFixed(4)}</b> / limite US$ {plan.hard_limit_usd.toFixed(2)}</>}
                  </div>
                )}
                {plan.blocked_reason === 'cost_over_limit' && <div style={{ color: 'var(--danger, #b23a3a)' }}>Estimativa acima do limite — não será enfileirado.</div>}
                {plan.action === 'immutable_noop' && <div style={{ color: 'var(--warning, #a6631b)' }}>Versão concluída idêntica é imutável.</div>}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="secondary" onClick={() => setReproOpen(false)}>Cancelar</Button>
              <Button size="sm" variant="primary" icon={RefreshCw}
                disabled={!plan || plan.blocked_reason === 'cost_over_limit' || plan.action === 'immutable_noop'}
                onClick={confirmReprocess}>
                {plan?.action === 'reuse' ? 'Reprocessar mesmo assim' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </AppLayout>
  )
}

function StatusCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>{label}</div>
      {children}
    </div>
  )
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>{title}</h3>{children}</div>
}
function Prose({ value }: { value: unknown }) {
  if (value == null || value === '') return <p style={{ color: 'var(--text-light)' }}>Não informado.</p>
  if (typeof value === 'string') return <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{value}</p>
  return <pre className="text-xs whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>{JSON.stringify(value, null, 2)}</pre>
}
function LazyBlock({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  if (loading) return <div className="space-y-2"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-24" /></div>
  return <>{children}</>
}
function NameList({ title, items, render }: { title: string; items: unknown[]; render?: (x: unknown) => string }) {
  return (
    <div className="mb-5 last:mb-0">
      <h4 className="font-semibold mb-1.5 flex items-center gap-2" style={{ color: 'var(--text)' }}>
        {title} <span className="text-xs font-normal" style={{ color: 'var(--text-light)' }}>({items.length})</span>
      </h4>
      {items.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-light)' }}>Nenhum.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.slice(0, 200).map((it, i) => (
            <span key={i} className="inline-block px-2.5 py-1 rounded-lg text-xs"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              {render ? render(it) : nameOf(it)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
