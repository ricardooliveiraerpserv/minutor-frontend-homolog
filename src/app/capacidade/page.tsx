'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw, Users } from 'lucide-react'
import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader, InlineLoader } from '@/components/ui/loading'
import { useUserCapacity, useUserCapacityIndex } from '@/hooks/use-user-capacity'

const HEALTH_COLOR: Record<string, string> = {
  ok: 'var(--success)',
  atencao: 'var(--warning)',
  estourado: 'var(--danger)',
  unknown: 'var(--border)',
}

function formatHours(n: number): string {
  const v = Number(n) || 0
  return v >= 10 ? `${Math.round(v)}h` : `${v.toFixed(1)}h`
}

function UsageBar({ pct, overload }: { pct: number; overload: boolean }) {
  const clamped = Math.min(150, Math.max(0, pct))
  const color = overload
    ? 'var(--danger)'
    : clamped > 80
      ? 'var(--warning)'
      : 'var(--success)'
  return (
    <div style={{
      flex: 1,
      height: 6,
      background: 'var(--surface-hover)',
      borderRadius: 3,
      overflow: 'hidden',
      minWidth: 60,
    }}>
      <div style={{
        height: '100%',
        width: `${Math.min(100, clamped)}%`,
        background: color,
        transition: 'width .2s ease',
      }} />
    </div>
  )
}

function ConsultantRow({
  row,
  expanded,
  onToggle,
}: {
  row: ReturnType<typeof useUserCapacityIndex>['items'][number]
  expanded: boolean
  onToggle: () => void
}) {
  const { data: detail, loading } = useUserCapacity(expanded ? row.user.id : null)

  return (
    <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          padding: '12px 14px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'inherit',
        }}
      >
        <span style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
              {row.user.name}
            </span>
            {row.overload && (
              <span
                title={row.overload_reasons.join(' · ')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 10, fontWeight: 600,
                  padding: '1px 6px', borderRadius: 4,
                  background: 'var(--danger-bg)', color: 'var(--danger)',
                  border: '1px solid var(--danger)',
                  textTransform: 'uppercase', letterSpacing: 0.3,
                }}
              >
                <AlertTriangle size={9} /> Sobrecarregado
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {row.allocation_count} {row.allocation_count === 1 ? 'alocação ativa' : 'alocações ativas'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 280px' }}>
          <UsageBar pct={row.usage_pct} overload={row.overload} />
          <span style={{
            fontSize: 11,
            color: row.overload ? 'var(--danger)' : 'var(--text-muted)',
            fontWeight: row.overload ? 600 : 400,
            whiteSpace: 'nowrap',
            minWidth: 100,
            textAlign: 'right',
          }}>
            {formatHours(row.planned_hours)} / {formatHours(row.capacity_hours)} ({row.usage_pct}%)
          </span>
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', background: 'var(--surface-hover)' }}>
          {loading && <InlineLoader label="Carregando alocações…" />}
          {detail && detail.items.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sem alocações ativas.</div>
          )}
          {detail && detail.items.length > 0 && (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
              {detail.items.map(a => {
                const pct = a.planned_hours > 0
                  ? Math.min(150, Math.round((a.actual_hours / a.planned_hours) * 100))
                  : 0
                return (
                  <li key={a.allocation_id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '6px 8px', borderRadius: 4,
                    background: 'var(--surface)',
                  }}>
                    <span
                      style={{
                        display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                        background: HEALTH_COLOR[a.health], flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.project_name} · <span style={{ color: 'var(--text-muted)' }}>{a.stage_name}</span>
                      </div>
                      {a.customer_name && (
                        <div style={{ fontSize: 10, color: 'var(--text-light)' }}>{a.customer_name}</div>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: a.health === 'estourado' ? 'var(--danger)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatHours(a.actual_hours)} / {formatHours(a.planned_hours)} · {pct}%
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default function CapacidadePage() {
  const { items, summary, loading, error, refetch } = useUserCapacityIndex()
  const [expandedId, setExpandedId] = useState<number | null>(null)

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 18,
        }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={18} /> Capacidade dos consultores
            </h1>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {summary.total_count} consultores · {summary.overloaded_count > 0 && (
                <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                  {summary.overloaded_count} sobrecarregado{summary.overloaded_count === 1 ? '' : 's'}
                </span>
              )}
              {summary.overloaded_count === 0 && summary.total_count > 0 && (
                <span style={{ color: 'var(--success)' }}>todos dentro da capacidade</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="ds-btn-ghost"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 10px' }}
          >
            <RefreshCw size={12} /> Atualizar
          </button>
        </div>

        {loading && items.length === 0 && <SectionLoader />}
        {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}

        {!loading && !error && items.length === 0 && (
          <div style={{
            padding: '32px 24px', textAlign: 'center',
            border: '1px dashed var(--border)', borderRadius: 8,
            color: 'var(--text-muted)', fontSize: 13,
          }}>
            Nenhum consultor encontrado.
          </div>
        )}

        {!error && items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(row => (
              <ConsultantRow
                key={row.user.id}
                row={row}
                expanded={expandedId === row.user.id}
                onToggle={() => setExpandedId(expandedId === row.user.id ? null : row.user.id)}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
