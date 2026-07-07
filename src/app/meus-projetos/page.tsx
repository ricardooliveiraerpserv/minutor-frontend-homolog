'use client'

import Link from 'next/link'
import { FolderOpen, ArrowRight } from 'lucide-react'
import { AppLayout } from '@/components/layout/app-layout'
import { useApiQuery } from '@/hooks/use-query'
import { cronogramaPoolHours } from '@/lib/cronograma-pool'

interface MyProject {
  id: number
  name: string
  code?: string | null
  customer?: { id: number; name: string } | null
  service_type?: { id: number; name: string; code: string } | null
  sold_hours?: number | string | null
  coordination_hours?: number | string | null
  consumed_hours?: number | string | null
}

function n(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

function fmtHours(v: number): string {
  if (!v) return '0h'
  return v >= 100 ? `${Math.round(v)}h` : `${v.toFixed(1)}h`
}

export default function MeusProjetosPage() {
  const { data, loading, error } = useApiQuery<{ items: MyProject[] }>(
    '/my-projects?pageSize=200&status=open'
  )
  const projects = data?.items ?? []

  return (
    <AppLayout title="Meus Projetos">
      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <FolderOpen size={20} style={{ color: 'var(--primary)' }} />
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Meus Projetos</h1>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0, marginBottom: 20 }}>
          Abra um projeto para ver suas atividades no cronograma e apontar as horas.
        </p>

        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Carregando…</p>
        ) : error ? (
          <p style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</p>
        ) : projects.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-light)' }}>Você não está alocado em nenhum projeto aberto.</p>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 12,
          }}>
            {projects.map(p => {
              const pool = cronogramaPoolHours(p)
              const consumed = n(p.consumed_hours)
              const pct = pool > 0 ? Math.min(100, Math.round((consumed / pool) * 100)) : 0
              return (
                <Link
                  key={p.id}
                  href={`/projetos/${p.id}/cronograma?from=meus-projetos`}
                  className="ds-card ds-row-hover"
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 8,
                    padding: 16, textDecoration: 'none', color: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{p.name}</span>
                    {p.code && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.code}</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
                    {p.customer?.name && <span>{p.customer.name}</span>}
                    {p.service_type?.name && (
                      <span className="ds-status ds-status-info" style={{ fontSize: 10 }}>{p.service_type.name}</span>
                    )}
                  </div>

                  <div style={{ marginTop: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                      <span>Apontáveis <strong style={{ color: 'var(--text)' }}>{fmtHours(pool)}</strong></span>
                      <span>Consumidas <strong style={{ color: 'var(--text)' }}>{fmtHours(consumed)}</strong> · {pct}%</span>
                    </div>
                    {pool > 0 && (
                      <div style={{ height: 4, width: '100%', background: 'var(--surface-hover)', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--success)' }} />
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>
                    Abrir cronograma <ArrowRight size={13} />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
