'use client'

// FASE 11.5 — Painel admin de observabilidade da camada global de anexos.
//
// 3 endpoints consumidos: /attachments/stats, /attachments/health, /attachments/events.
// Auto-refresh a cada 30s (configurável). Acesso restrito a admin.
//
// Não bloqueia tela em loading inicial — mostra skeletons. Erros aparecem por
// seção, não derrubam o resto do painel.

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Database, FileText, Loader2, RefreshCw, ShieldAlert, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { AppLayout } from '@/components/layout/app-layout'
import { useAuth } from '@/hooks/use-auth'
import { PageHeader } from '@/components/ds'

// ── Tipos do BE ────────────────────────────────────────────────────────────

interface StatsResponse {
  data: {
    totals: { live: number; all: number; deleted: number; bytes: number; human_size: string }
    uploads: { last_24h: number; last_7d: number; last_30d: number }
    by_entity_type: Array<{ entity_type: string; count: number; bytes: number; human_size: string; in_registry: boolean }>
    by_category: Array<{ entity_type: string; category: string; count: number }>
    by_provider: Array<{ provider: string; count: number; bytes: number }>
    by_visibility: Record<string, number>
    top_uploaders: Array<{ user_id: number; name: string | null; count: number }>
  }
}

interface HealthResponse {
  data: {
    healthy: boolean
    integrity_fail_24h: number
    integrity_fail_7d: number
    mime_violations_24h: number
    permission_denied_24h: number
    soft_deleted_24h: number
    recent_failures: Array<{
      created_at: string
      attachment_id: number
      entity: string | null
      category: string | null
      storage_path: string | null
      failures: Array<{ reason: string; detail?: string | null }>
    }>
  }
}

interface EventsResponse {
  data: Array<{
    id: number
    event_type: string
    created_at: string
    metadata: Record<string, unknown> | null
    ip: string | null
    actor: { id: number; name: string; type: string; email: string } | null
    attachment: {
      id: number
      entity_type: string
      entity_id: number
      category: string
      original_name: string
      visibility: string
    } | null
  }>
  meta: { page: number; per_page: number; total: number; last_page: number; has_next: boolean }
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminAttachmentsPage() {
  const { user } = useAuth()
  const isAdmin = user?.type === 'admin'

  const [stats, setStats] = useState<StatsResponse['data'] | null>(null)
  const [health, setHealth] = useState<HealthResponse['data'] | null>(null)
  const [events, setEvents] = useState<EventsResponse['data']>([])
  const [eventsTotal, setEventsTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAll = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const [s, h, e] = await Promise.all([
        api.get<StatsResponse>('/attachments/stats'),
        api.get<HealthResponse>('/attachments/health'),
        api.get<EventsResponse>('/attachments/events?per_page=50'),
      ])
      setStats(s.data)
      setHealth(h.data)
      setEvents(e.data)
      setEventsTotal(e.meta.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar dados.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    void fetchAll()
    const id = setInterval(fetchAll, 30_000)
    return () => clearInterval(id)
  }, [isAdmin, fetchAll])

  if (!isAdmin) {
    return (
      <AppLayout title="Anexos — Admin">
        <div className="max-w-2xl mx-auto py-12 text-center">
          <ShieldAlert size={36} className="mx-auto mb-3" style={{ color: 'var(--danger)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Acesso restrito a administradores.</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Anexos — Admin">
      <div className="max-w-7xl mx-auto px-4 py-6 md:px-6 space-y-6">
        <PageHeader
          icon={Database}
          title="Anexos — Observabilidade"
          subtitle="Saúde, uso e timeline da camada global de anexos (FASE 11)"
          actions={
            <button
              type="button"
              onClick={fetchAll}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            >
              {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Atualizar
            </button>
          }
        />

        {error && (
          <div className="rounded-xl p-3 flex items-center gap-2"
            style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)' }}>
            <AlertCircle size={14} />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Saúde — banner */}
        <HealthBanner health={health} loading={loading} />

        {/* KPIs */}
        <KpiGrid stats={stats} loading={loading} />

        {/* Por entity_type + por category */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ByEntityTable stats={stats} loading={loading} />
          <ByCategoryTable stats={stats} loading={loading} />
        </div>

        {/* Top uploaders + visibility breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopUploaders stats={stats} loading={loading} />
          <VisibilityBreakdown stats={stats} loading={loading} />
        </div>

        {/* Eventos recentes */}
        <EventsTimeline events={events} total={eventsTotal} loading={loading} />

        {/* Falhas de integridade (se houver) */}
        <IntegrityFailuresPanel health={health} />
      </div>
    </AppLayout>
  )
}

// ── Subcomponentes ─────────────────────────────────────────────────────────

function HealthBanner({ health, loading }: { health: HealthResponse['data'] | null; loading: boolean }) {
  if (loading || !health) {
    return (
      <div className="rounded-xl p-3 flex items-center gap-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Verificando saúde…</span>
      </div>
    )
  }
  const bg = health.healthy ? 'var(--success-bg)' : 'var(--danger-bg)'
  const border = health.healthy ? 'var(--success-border)' : 'var(--danger-border)'
  const color = health.healthy ? 'var(--success)' : 'var(--danger)'
  const Icon = health.healthy ? CheckCircle2 : AlertCircle

  return (
    <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: bg, border: `1px solid ${border}` }}>
      <Icon size={18} style={{ color }} />
      <div className="flex-1">
        <p className="text-sm font-semibold" style={{ color }}>
          {health.healthy ? 'Saudável' : 'Atenção: falhas detectadas'}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          integrity_fail 24h: <strong>{health.integrity_fail_24h}</strong> · 7d: <strong>{health.integrity_fail_7d}</strong>
          {' · '}mime_violation 24h: <strong>{health.mime_violations_24h}</strong>
          {' · '}permission_denied 24h: <strong>{health.permission_denied_24h}</strong>
        </p>
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: React.ElementType }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-light)' }}>{label}</p>
        <Icon size={14} style={{ color: 'var(--text-muted)' }} />
      </div>
      <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text)' }}>{value}</p>
      {sub && <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

function KpiGrid({ stats, loading }: { stats: StatsResponse['data'] | null; loading: boolean }) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1,2,3,4].map(i => (
          <div key={i} className="rounded-xl p-4 animate-pulse" style={{ background: 'var(--surface)', border: '1px solid var(--border)', height: 96 }} />
        ))}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard label="Anexos vivos" value={stats.totals.live.toLocaleString('pt-BR')} sub={`${stats.totals.deleted.toLocaleString('pt-BR')} soft-deleted`} icon={FileText} />
      <KpiCard label="Armazenado" value={stats.totals.human_size} sub={`${stats.totals.bytes.toLocaleString('pt-BR')} bytes`} icon={Database} />
      <KpiCard label="Uploads 24h" value={stats.uploads.last_24h.toLocaleString('pt-BR')} sub={`${stats.uploads.last_7d} em 7d / ${stats.uploads.last_30d} em 30d`} icon={RefreshCw} />
      <KpiCard label="Uploaders únicos" value={String(stats.top_uploaders.length)} sub="distintos (top 10)" icon={Users} />
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--text-light)' }}>{children}</p>
}

function ByEntityTable({ stats, loading }: { stats: StatsResponse['data'] | null; loading: boolean }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <SectionTitle>Por entity_type</SectionTitle>
      {loading || !stats ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Carregando…</p> : (
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: 'var(--text-light)', borderBottom: '1px solid var(--border)' }}>
              <th className="text-left py-1.5">Tipo</th>
              <th className="text-right py-1.5">Count</th>
              <th className="text-right py-1.5">Tamanho</th>
              <th className="text-center py-1.5">Registry</th>
            </tr>
          </thead>
          <tbody>
            {stats.by_entity_type.map(r => (
              <tr key={r.entity_type} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="py-1.5 font-mono" style={{ color: 'var(--text)' }}>{r.entity_type}</td>
                <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{r.count.toLocaleString('pt-BR')}</td>
                <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{r.human_size}</td>
                <td className="py-1.5 text-center" style={{ color: r.in_registry ? 'var(--success)' : 'var(--warning)' }}>
                  {r.in_registry ? '✓' : '⚠'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function ByCategoryTable({ stats, loading }: { stats: StatsResponse['data'] | null; loading: boolean }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <SectionTitle>Por category (top 15)</SectionTitle>
      {loading || !stats ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Carregando…</p> : (
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: 'var(--text-light)', borderBottom: '1px solid var(--border)' }}>
              <th className="text-left py-1.5">Entity / Category</th>
              <th className="text-right py-1.5">Count</th>
            </tr>
          </thead>
          <tbody>
            {stats.by_category.map((r, i) => (
              <tr key={`${r.entity_type}-${r.category}-${i}`} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="py-1.5 font-mono" style={{ color: 'var(--text)' }}>
                  {r.entity_type} <span style={{ color: 'var(--text-light)' }}>/</span> {r.category}
                </td>
                <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{r.count.toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function TopUploaders({ stats, loading }: { stats: StatsResponse['data'] | null; loading: boolean }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <SectionTitle>Top uploaders (top 10)</SectionTitle>
      {loading || !stats ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Carregando…</p> : (
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: 'var(--text-light)', borderBottom: '1px solid var(--border)' }}>
              <th className="text-left py-1.5">Usuário</th>
              <th className="text-right py-1.5">Anexos</th>
            </tr>
          </thead>
          <tbody>
            {stats.top_uploaders.length === 0 && (
              <tr><td colSpan={2} className="py-2 text-center" style={{ color: 'var(--text-light)' }}>Sem dados.</td></tr>
            )}
            {stats.top_uploaders.map(u => (
              <tr key={u.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="py-1.5" style={{ color: 'var(--text)' }}>{u.name ?? `#${u.user_id}`}</td>
                <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{u.count.toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function VisibilityBreakdown({ stats, loading }: { stats: StatsResponse['data'] | null; loading: boolean }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <SectionTitle>Por visibilidade</SectionTitle>
      {loading || !stats ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Carregando…</p> : (
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.by_visibility).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <span style={{ color: 'var(--text-muted)' }}>{k}</span>
              <span className="tabular-nums">{Number(v).toLocaleString('pt-BR')}</span>
            </span>
          ))}
          <div className="w-full mt-2 text-[11px]" style={{ color: 'var(--text-light)' }}>
            Por storage_provider:{' '}
            {stats.by_provider.map((p, i) => (
              <span key={p.provider}>
                <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{p.provider}</span>={p.count}
                {i < stats.by_provider.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const EVENT_LABEL: Record<string, string> = {
  uploaded: '📤 Upload',
  downloaded: '⬇️ Download',
  url_signed: '🔗 Signed URL',
  soft_deleted: '🗑️ Removido',
  restored: '↩️ Restaurado',
  integrity_fail: '⚠️ Integridade',
  mime_violation: '🚫 MIME',
  size_exceeded: '📦 Tamanho',
  permission_denied: '🔒 Permissão',
}

function EventsTimeline({ events, total, loading }: { events: EventsResponse['data']; total: number; loading: boolean }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <SectionTitle>Timeline transversal — eventos recentes</SectionTitle>
        <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>{total.toLocaleString('pt-BR')} eventos no total</span>
      </div>
      {loading ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Carregando…</p> : (
        <div className="max-h-96 overflow-y-auto overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: 'var(--text-light)', borderBottom: '1px solid var(--border)' }}>
                <th className="text-left py-1.5">Quando</th>
                <th className="text-left py-1.5">Evento</th>
                <th className="text-left py-1.5">Anexo</th>
                <th className="text-left py-1.5">Quem</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr><td colSpan={4} className="py-2 text-center" style={{ color: 'var(--text-light)' }}>Sem eventos.</td></tr>
              )}
              {events.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="py-1.5 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                    {new Date(e.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-1.5" style={{ color: 'var(--text)' }}>{EVENT_LABEL[e.event_type] ?? e.event_type}</td>
                  <td className="py-1.5 font-mono" style={{ color: 'var(--text-muted)' }}>
                    {e.attachment ? `${e.attachment.entity_type}#${e.attachment.entity_id}/${e.attachment.category}` : '—'}
                  </td>
                  <td className="py-1.5" style={{ color: 'var(--text-muted)' }}>{e.actor?.name ?? 'sistema'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function IntegrityFailuresPanel({ health }: { health: HealthResponse['data'] | null }) {
  if (!health || health.recent_failures.length === 0) return null
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }}>
      <p className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--danger)' }}>
        <AlertCircle size={14} />
        Falhas de integridade recentes
      </p>
      <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ color: 'var(--text-light)', borderBottom: '1px solid var(--danger-border)' }}>
            <th className="text-left py-1.5">Quando</th>
            <th className="text-left py-1.5">Anexo</th>
            <th className="text-left py-1.5">Falhas</th>
          </tr>
        </thead>
        <tbody>
          {health.recent_failures.map((f, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--danger-border)' }}>
              <td className="py-1.5 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                {new Date(f.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </td>
              <td className="py-1.5 font-mono" style={{ color: 'var(--text)' }}>
                {f.entity ?? '?'}/{f.category ?? '?'} (att#{f.attachment_id})
              </td>
              <td className="py-1.5" style={{ color: 'var(--text-muted)' }}>
                {f.failures.map(x => x.reason).join('; ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
