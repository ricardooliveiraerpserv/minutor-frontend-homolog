'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from 'next/navigation'
import { Briefcase, Clock, CheckCircle2, Activity } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProjectRow {
  id: number
  code: string
  name: string
  start_date: string | null
  status: string
  status_display: string
  contract_type: string | null
  parent_project_id: number | null
  sold_hours: number
  consumed_hours: number
  balance_hours: number
}

interface Summary {
  total_projects: number
  total_sold_hours: number
  total_consumed_hours: number
  finished_projects: number
  finished_percentage: number
}

type TopLimit = '5' | '10' | '20' | 'all'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fmtHours(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function IndicadoresAusterPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [rows, setRows]       = useState<ProjectRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [topLimit, setTopLimit] = useState<TopLimit>('10')
  const [topRows, setTopRows] = useState<ProjectRow[]>([])
  const [topLoading, setTopLoading] = useState(true)

  useEffect(() => {
    if (authLoading || !user) return
    const isAdmin = user.type === 'admin'
    const isAusterClient = user.type === 'cliente' && (user as any).customer_id === 220
    if (!isAdmin && !isAusterClient) {
      router.replace('/dashboard')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    setLoading(true)
    api.get<{ items: ProjectRow[]; summary: Summary }>('/indicadores/auster/projects')
      .then(r => { setRows(r.items ?? []); setSummary(r.summary ?? null) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setTopLoading(true)
    api.get<{ items: ProjectRow[] }>(`/indicadores/auster/top-consumed?limit=${topLimit}`)
      .then(r => setTopRows(r.items ?? []))
      .catch(() => {})
      .finally(() => setTopLoading(false))
  }, [topLimit])

  const statusBadge = (s: string, label: string) => {
    const palette: Record<string, { bg: string; fg: string }> = {
      finished:             { bg: 'var(--success-bg)', fg: 'var(--success)' },
      started:              { bg: 'var(--primary-soft)', fg: 'var(--primary)' },
      paused:               { bg: 'var(--warning-bg)', fg: 'var(--warning)' },
      cancelled:            { bg: 'var(--danger-bg)',  fg: 'var(--danger)'  },
      awaiting_start:       { bg: 'var(--surface-hover)', fg: 'var(--text-muted)' },
      liberado_para_testes: { bg: 'var(--primary-soft)', fg: 'var(--primary)' },
    }
    const c = palette[s] ?? { bg: 'var(--surface-hover)', fg: 'var(--text-muted)' }
    return (
      <span style={{
        background: c.bg, color: c.fg, padding: '2px 10px', borderRadius: 999,
        fontSize: 11, fontWeight: 600,
      }}>{label}</span>
    )
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Indicadores — Auster</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Todos os projetos Fechado da Auster (subprojetos).
            </p>
          </div>
        </header>

        {/* ─ Cards de resumo ─ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            label="Total de Projetos"
            value={summary ? String(summary.total_projects) : '—'}
            icon={<Briefcase size={18} />}
          />
          <SummaryCard
            label="Horas Contratadas"
            value={summary ? fmtHours(summary.total_sold_hours) : '—'}
            icon={<Clock size={18} />}
          />
          <SummaryCard
            label="Horas Consumidas"
            value={summary ? fmtHours(summary.total_consumed_hours) : '—'}
            icon={<Activity size={18} />}
          />
          <SummaryCard
            label="Concluídos"
            value={summary ? `${summary.finished_projects} (${summary.finished_percentage}%)` : '—'}
            icon={<CheckCircle2 size={18} />}
          />
        </div>

        {/* ─ Top horas consumidas (gráfico) ─ */}
        <section className="ds-card">
          <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Top Horas Consumidas</h2>
            <div className="flex gap-1">
              {(['5', '10', '20', 'all'] as TopLimit[]).map(l => (
                <button
                  key={l}
                  onClick={() => setTopLimit(l)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                  style={{
                    background: topLimit === l ? 'var(--primary)' : 'var(--surface-hover)',
                    color:      topLimit === l ? 'var(--primary-fg)' : 'var(--text)',
                  }}
                >
                  {l === 'all' ? 'Todos' : `Top ${l}`}
                </button>
              ))}
            </div>
          </div>
          <div className="p-5">
            {topLoading && (
              <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Carregando…</div>
            )}
            {!topLoading && topRows.length === 0 && (
              <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Sem dados.</div>
            )}
            {!topLoading && topRows.length > 0 && (() => {
              const maxConsumed = Math.max(...topRows.map(p => p.consumed_hours), 1)
              return (
                <div className="space-y-2.5">
                  {topRows.map((p, idx) => {
                    const pct = (p.consumed_hours / maxConsumed) * 100
                    return (
                      <div key={p.id} className="flex items-center gap-3">
                        <div className="w-6 text-right text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                          {idx + 1}
                        </div>
                        <div className="w-56 shrink-0 text-sm truncate" title={`${p.code} — ${p.name}`}>
                          <span className="font-mono text-xs" style={{ color: 'var(--text-light)' }}>{p.code}</span>
                          <span className="mx-1.5" style={{ color: 'var(--text-light)' }}>·</span>
                          <span style={{ color: 'var(--text)' }}>{p.name}</span>
                        </div>
                        <div className="flex-1 relative h-7 rounded overflow-hidden" style={{ background: 'var(--surface-hover)' }}>
                          <div
                            className="absolute inset-y-0 left-0 rounded transition-all"
                            style={{
                              width: `${pct}%`,
                              background: 'linear-gradient(90deg, var(--primary) 0%, var(--primary-hover, var(--primary)) 100%)',
                            }}
                          />
                          <div className="absolute inset-y-0 left-0 flex items-center px-2.5 text-xs font-semibold whitespace-nowrap" style={{
                            color: 'var(--primary-fg)',
                          }}>
                            {fmtHours(p.consumed_hours)}h
                          </div>
                        </div>
                        <div className="w-28 text-right text-xs" style={{ color: 'var(--text-muted)' }}>
                          <span className="font-mono">{fmtHours(p.sold_hours)}h</span>
                          <span className="ml-1">contr</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </section>

        {/* ─ Relação de Projetos ─ */}
        <section className="ds-card">
          <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Relação de Projetos</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <Th>Data</Th><Th>Código</Th><Th>Projeto</Th>
                  <Th align="right">Horas Contratadas</Th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={4} className="px-5 py-6 text-center" style={{ color: 'var(--text-muted)' }}>Carregando…</td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-6 text-center" style={{ color: 'var(--text-muted)' }}>Sem projetos.</td></tr>
                )}
                {!loading && rows.map(p => (
                  <tr key={p.id} className="ds-row-hover">
                    <Td>{fmtDate(p.start_date)}</Td>
                    <Td><span className="font-mono">{p.code}</span></Td>
                    <Td>
                      {p.parent_project_id && <span style={{ color: 'var(--text-light)' }}>↳ </span>}
                      {p.name}
                    </Td>
                    <Td align="right">{fmtHours(p.sold_hours)}</Td>
                  </tr>
                ))}
              </tbody>
              {!loading && summary && (
                <tfoot>
                  <tr style={{ borderTop: '1px solid var(--border)', fontWeight: 600 }}>
                    <Td colSpan={3}>Total</Td>
                    <Td align="right">{fmtHours(summary.total_sold_hours)}</Td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </div>
    </AppLayout>
  )
}

// ─── Helpers de UI ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="ds-card p-4 flex items-center gap-3">
      <div className="rounded-lg p-2.5" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
        <div className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{value}</div>
      </div>
    </div>
  )
}

function Th({ children, align = 'left', width }: { children: React.ReactNode; align?: 'left' | 'right' | 'center'; width?: number }) {
  return (
    <th
      className="px-5 py-2.5 text-xs font-medium uppercase tracking-wide"
      style={{ textAlign: align, width: width ? `${width}px` : undefined }}
    >{children}</th>
  )
}

function Td({ children, align = 'left', bold = false, muted = false, colSpan }: {
  children: React.ReactNode; align?: 'left' | 'right' | 'center'; bold?: boolean; muted?: boolean; colSpan?: number
}) {
  return (
    <td
      colSpan={colSpan}
      className="px-5 py-2.5"
      style={{
        textAlign: align,
        fontWeight: bold ? 600 : undefined,
        color: muted ? 'var(--text-muted)' : 'var(--text)',
      }}
    >{children}</td>
  )
}
