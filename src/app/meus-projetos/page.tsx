'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FolderOpen, ArrowRight, Search } from 'lucide-react'
import { AppLayout } from '@/components/layout/app-layout'
import { useApiQuery } from '@/hooks/use-query'
import { cronogramaPoolHours } from '@/lib/cronograma-pool'
import { SearchSelect } from '@/components/ui/search-select'

interface MyProject {
  id: number
  name: string
  code?: string | null
  customer?: { id: number; name: string } | null
  service_type?: { id: number; name: string; code: string } | null
  status?: string | null
  status_display?: string | null
  sold_hours?: number | string | null
  coordination_hours?: number | string | null
  consumed_hours?: number | string | null
  // Horas DO CONSULTOR neste projeto (backend, modo activity_allocated): alocadas a ele e consumidas
  // por ele. É o que "Meus Projetos" deve mostrar — não o total do projeto.
  my_allocated_hours?: number | string | null
  my_consumed_hours?: number | string | null
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
  // Aba: ativos (status=open) ou encerrados/cancelados (status=closed).
  const [statusTab, setStatusTab] = useState<'open' | 'closed'>('open')
  const isClosed = statusTab === 'closed'
  // activity_allocated: só projetos onde o consultor está alocado em ATIVIDADE.
  const { data, loading, error } = useApiQuery<{ items: MyProject[] }>(
    `/my-projects?pageSize=200&status=${statusTab}&activity_allocated=true`
  )
  const projects = useMemo(() => data?.items ?? [], [data])

  // Só visão em LISTA (opção "Grade" removida a pedido).
  const [view] = useState<'grid' | 'list'>('list')
  const [q, setQ] = useState('')
  const [clientId, setClientId] = useState('')

  // Clientes distintos dos projetos (pro filtro).
  const clientOptions = useMemo(() => {
    const map = new Map<number, string>()
    for (const p of projects) if (p.customer?.id) map.set(p.customer.id, p.customer.name)
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [projects])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return projects.filter(p => {
      if (clientId && String(p.customer?.id ?? '') !== clientId) return false
      if (term) {
        const hay = `${p.name} ${p.code ?? ''} ${p.customer?.name ?? ''}`.toLowerCase()
        if (!hay.includes(term)) return false
      }
      return true
    })
  }, [projects, q, clientId])

  const metrics = (p: MyProject) => {
    // Perfil do consultor: horas DELE neste projeto.
    //  disponibilizadas = horas das atividades onde ele é responsável (backend my_allocated_hours)
    //  apontadas        = horas que ele apontou (my_consumed_hours)
    //  saldo            = disponibilizadas − apontadas
    // Fallback pro total do projeto se o backend não mandar os campos por consultor (compat).
    const available = p.my_allocated_hours != null ? n(p.my_allocated_hours) : cronogramaPoolHours(p)
    const logged = p.my_consumed_hours != null ? n(p.my_consumed_hours) : n(p.consumed_hours)
    const saldo = Math.round((available - logged) * 100) / 100
    const pct = available > 0 ? Math.min(100, Math.round((logged / available) * 100)) : 0
    return { available, logged, saldo, pct, pool: available, consumed: logged }
  }

  return (
    <AppLayout title="Meus Projetos">
      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <FolderOpen size={20} style={{ color: 'var(--primary)' }} />
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Meus Projetos</h1>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0, marginBottom: 12 }}>
          {isClosed
            ? 'Projetos encerrados ou cancelados em que você atuou.'
            : 'Abra um projeto para ver suas atividades no cronograma e apontar as horas.'}
        </p>

        {/* Aba: ativos × encerrados/cancelados */}
        <div style={{ display: 'inline-flex', gap: 4, marginBottom: 14, border: '1px solid var(--border)', borderRadius: 10, padding: 3, background: 'var(--surface)' }}>
          {([['open', 'Ativos'], ['closed', 'Encerrados e cancelados']] as const).map(([val, label]) => (
            <button key={val} type="button" onClick={() => setStatusTab(val)}
              style={{
                padding: '6px 14px', fontSize: 13, fontWeight: statusTab === val ? 700 : 500,
                border: 'none', borderRadius: 7, cursor: 'pointer',
                background: statusTab === val ? 'var(--primary)' : 'transparent',
                color: statusTab === val ? 'var(--primary-fg)' : 'var(--text-muted)',
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Filtros + alternância de visão */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
            <input
              className="ds-input"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar projeto ou código…"
              style={{ width: '100%', paddingLeft: 30, fontSize: 13 }}
            />
          </div>
          <div style={{ flex: '0 1 240px', minWidth: 180 }}>
            <SearchSelect
              value={clientId}
              onChange={setClientId}
              options={clientOptions}
              placeholder="Todos os clientes"
              fullWidth
            />
          </div>
        </div>

        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Carregando…</p>
        ) : error ? (
          <p style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</p>
        ) : projects.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-light)' }}>Você não está alocado em nenhum projeto aberto.</p>
        ) : filtered.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-light)' }}>Nenhum projeto para os filtros selecionados.</p>
        ) : view === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {filtered.map(p => {
              const { pool, consumed, pct } = metrics(p)
              return (
                <Link
                  key={p.id}
                  href={`/projetos/${p.id}/cronograma?from=meus-projetos`}
                  className="ds-card ds-row-hover"
                  style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{p.name}</span>
                    {p.code && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.code}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
                    {p.customer?.name && <span>{p.customer.name}</span>}
                    {p.service_type?.name && <span className="ds-status ds-status-info" style={{ fontSize: 10 }}>{p.service_type.name}</span>}
                    {isClosed && p.status_display && <span className={`ds-status ${p.status === 'cancelled' ? 'ds-status-danger' : 'ds-status-warning'}`} style={{ fontSize: 10 }}>{p.status_display}</span>}
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
        ) : (
          /* Visão em LISTA */
          <div className="ds-card" style={{ overflow: 'hidden', padding: 0 }}>
            {filtered.map((p, i) => {
              const { available, logged, saldo } = metrics(p)
              return (
                <Link
                  key={p.id}
                  href={`/projetos/${p.id}/cronograma?from=meus-projetos`}
                  className="ds-row-hover"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    textDecoration: 'none', color: 'inherit',
                    borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div style={{ flex: '2 1 240px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      {p.code && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', flexShrink: 0 }}>{p.code}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {p.customer?.name && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.customer.name}</span>}
                      {p.service_type?.name && <span className="ds-status ds-status-info" style={{ fontSize: 10, flexShrink: 0 }}>{p.service_type.name}</span>}
                      {isClosed && p.status_display && <span className={`ds-status ${p.status === 'cancelled' ? 'ds-status-danger' : 'ds-status-warning'}`} style={{ fontSize: 10, flexShrink: 0 }}>{p.status_display}</span>}
                    </div>
                  </div>
                  <div style={{ flex: '1 1 300px', minWidth: 210, textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', display: 'flex', gap: 14, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <span title="Horas disponibilizadas a você (atividades sob sua responsabilidade)">Disponibilizadas <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{fmtHours(available)}</strong></span>
                    <span title="Horas que você apontou neste projeto">Apontadas <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{fmtHours(logged)}</strong></span>
                    <span title="Saldo = disponibilizadas − apontadas">Saldo <strong style={{ color: saldo < 0 ? 'var(--danger)' : 'var(--text)', fontWeight: 600 }}>{fmtHours(saldo)}</strong></span>
                  </div>
                  <ArrowRight size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
