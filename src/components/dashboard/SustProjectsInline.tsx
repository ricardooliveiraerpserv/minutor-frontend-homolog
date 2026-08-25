'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Search, Users } from 'lucide-react'

// Lista de Projetos de Sustentação EMBUTIDA (mesma fonte da tela Sustentação Portal:
// /projects?gestao=true, auto-escopada pro coordenador). Usada dentro do Kanban de
// Contratos para não trocar de seção do menu.

interface SustProject {
  id: number
  name: string
  code: string
  status: string
  status_display?: string
  sold_hours?: number
  consumed_hours?: number
  total_logged_minutes?: number | null
  accumulated_sold_hours?: number
  initial_hours_consumed?: number
  total_available_hours?: number
  contract_type_display?: string
  contract_type?: { name: string } | null
  customer?: { id: number; name: string } | null
  kanban_coordinator_override_id?: number | null
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativo', started: 'Em Andamento', awaiting_start: 'Aguardando',
  paused: 'Pausado', finished: 'Finalizado', cancelled: 'Cancelado',
}
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  started:        { bg: 'var(--primary-soft)',   color: 'var(--primary)' },
  active:         { bg: 'rgba(34,197,94,0.10)',   color: '#22C55E' },
  paused:         { bg: 'rgba(245,158,11,0.12)',  color: '#F59E0B' },
  cancelled:      { bg: 'rgba(239,68,68,0.12)',   color: '#EF4444' },
  finished:       { bg: 'rgba(161,161,170,0.12)', color: '#71717A' },
  awaiting_start: { bg: 'rgba(139,92,246,0.12)',  color: '#8B5CF6' },
}

function fmt(n: number | null | undefined, dec = 0) {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
function healthColor(pct: number) {
  if (pct >= 90) return '#ef4444'
  if (pct >= 70) return '#f59e0b'
  return '#22c55e'
}
// Mesmo cálculo da tela Sustentação Portal.
function calcHours(p: SustProject): { vendidas: number; consumed: number } {
  const isBhMensal = (p.contract_type_display ?? p.contract_type?.name ?? '').toLowerCase().includes('mensal')
  if (isBhMensal) {
    const contributions = (p.total_available_hours ?? p.sold_hours ?? 0) - (p.sold_hours ?? 0)
    const vendidas = (p.accumulated_sold_hours ?? p.sold_hours ?? 0) + contributions
    const consumed = (p.initial_hours_consumed ?? 0) + (p.total_logged_minutes != null ? p.total_logged_minutes / 60 : 0)
    return { vendidas, consumed }
  }
  const vendidas = p.sold_hours ?? 0
  const consumed = p.consumed_hours ?? (p.total_logged_minutes != null ? p.total_logged_minutes / 60 : 0)
  return { vendidas, consumed }
}

export function SustProjectsInline({ onSelectTeam }: { onSelectTeam?: (p: { id: number; name: string }) => void }) {
  const [projects, setProjects] = useState<SustProject[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    api.get<{ items?: SustProject[]; data?: SustProject[] }>('/projects?pageSize=200&gestao=true')
      .then(r => {
        const items = r.items ?? r.data ?? []
        setProjects(items.filter(p => !p.kanban_coordinator_override_id))
      })
      .catch(() => toast.error('Erro ao carregar projetos'))
      .finally(() => setLoading(false))
  }, [])

  const ql = q.trim().toLowerCase()
  const rows = useMemo(() => ql
    ? projects.filter(p => (p.name ?? '').toLowerCase().includes(ql) || (p.code ?? '').toLowerCase().includes(ql) || (p.customer?.name ?? '').toLowerCase().includes(ql))
    : projects, [projects, ql])

  const totals = useMemo(() => {
    let vendidas = 0, saldo = 0
    projects.forEach(p => { const h = calcHours(p); vendidas += h.vendidas; saldo += (h.vendidas - h.consumed) })
    return {
      total: projects.length,
      ativos: projects.filter(p => ['started', 'active'].includes(p.status)).length,
      vendidas, saldo,
    }
  }, [projects])

  const KPIS = [
    { label: 'Total', value: String(totals.total), sub: 'projetos listados' },
    { label: 'Ativos', value: String(totals.ativos), sub: 'em andamento' },
    { label: 'Hs Vendidas', value: fmt(totals.vendidas), sub: 'horas contratadas' },
    { label: 'Saldo Total', value: fmt(totals.saldo, 1) + ' h', sub: totals.saldo < 0 ? 'saldo negativo' : 'horas disponíveis' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {KPIS.map(c => (
          <div key={c.label} className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{c.label}</p>
            <p className="text-xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>{c.value}</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="relative" style={{ maxWidth: 360 }}>
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar projeto, código ou cliente…"
          className="ds-input" style={{ paddingLeft: 30, width: '100%' }} />
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th className="text-left font-medium px-4 py-3" style={{ fontSize: 11 }}>PROJETO</th>
                <th className="text-left font-medium px-3 py-3" style={{ fontSize: 11 }}>CLIENTE</th>
                <th className="text-left font-medium px-3 py-3" style={{ fontSize: 11 }}>TIPO CONTRATO</th>
                <th className="text-right font-medium px-3 py-3" style={{ fontSize: 11 }}>HS VENDIDAS</th>
                <th className="text-right font-medium px-3 py-3" style={{ fontSize: 11 }}>HS CONSUMIDAS</th>
                <th className="text-right font-medium px-3 py-3" style={{ fontSize: 11 }}>SALDO</th>
                <th className="text-left font-medium px-3 py-3" style={{ fontSize: 11 }}>% USO</th>
                <th className="text-left font-medium px-3 py-3" style={{ fontSize: 11 }}>STATUS</th>
                {onSelectTeam && <th className="px-3 py-3" />}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={onSelectTeam ? 9 : 8} className="px-4 py-8 text-center" style={{ color: 'var(--text-light)' }}>Carregando…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={onSelectTeam ? 9 : 8} className="px-4 py-8 text-center" style={{ color: 'var(--text-light)' }}>Nenhum projeto.</td></tr>}
              {!loading && rows.map(p => {
                const { vendidas, consumed } = calcHours(p)
                const saldo = vendidas - consumed
                const pct = vendidas > 0 ? Math.min((consumed / vendidas) * 100, 999) : 0
                const hc = healthColor(pct)
                const ss = STATUS_STYLE[p.status] ?? { bg: 'rgba(161,161,170,0.12)', color: '#A1A1AA' }
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }} className="ds-row-hover">
                    <td className="px-4 py-3">
                      <div style={{ color: 'var(--text)', fontWeight: 600 }}>{p.name}</div>
                      {p.code && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{p.code}</div>}
                    </td>
                    <td className="px-3 py-3" style={{ color: 'var(--text-muted)' }}>{p.customer?.name ?? '—'}</td>
                    <td className="px-3 py-3" style={{ color: 'var(--text-muted)' }}>{p.contract_type_display ?? p.contract_type?.name ?? '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums" style={{ color: 'var(--text)' }}>{fmt(vendidas)}</td>
                    <td className="px-3 py-3 text-right tabular-nums" style={{ color: 'var(--text)' }}>{fmt(consumed, 1)}</td>
                    <td className="px-3 py-3 text-right tabular-nums" style={{ color: saldo < 0 ? '#ef4444' : 'var(--text)', fontWeight: 600 }}>{fmt(saldo, 1)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div style={{ width: 56, height: 6, borderRadius: 999, background: 'var(--surface-hover)', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: hc }} />
                        </div>
                        <span style={{ fontSize: 11, color: hc }}>{fmt(pct)}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap" style={{ background: ss.bg, color: ss.color }}>
                        {p.status_display ?? STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                    {onSelectTeam && (
                      <td className="px-3 py-3 text-right">
                        <button onClick={() => onSelectTeam({ id: p.id, name: p.name })}
                          title="Selecionar equipe"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                          style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                          <Users size={13} /> Equipe
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
