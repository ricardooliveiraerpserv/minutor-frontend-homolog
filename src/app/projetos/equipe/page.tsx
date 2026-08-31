'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { api, apiMessage } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { SearchSelect } from '@/components/ui/search-select'
import { toast } from 'sonner'
import { Users, Clock, Search } from 'lucide-react'

/**
 * Equipe · Alocação & Apontamento (consolidado, cross-project).
 *  - Alocação por consultor: (projeto × consultor) contratadas/consumidas/saldo.
 *  - Apontamento semanal: horas apontadas por (semana × consultor × projeto).
 * Fontes: GET /consultant-allocation e GET /weekly-timesheets.
 */

type AllocRow = {
  project_id: number; project_code: string | null; project_name: string; project_status: string
  customer_name: string | null; user_id: number; user_name: string; role: string
  planned_hours: number; consumed_hours: number; balance_hours: number
}
type WeeklyRow = {
  week_start: string; user_id: number; user_name: string
  project_id: number; project_code: string | null; project_name: string; hours: number
}

const fmtH = (v: number) => `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}h`
// Número da semana ISO-8601 (semana começa na segunda; semana 1 = a que contém a 1ª quinta).
const isoWeek = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}
const weekLabel = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  const end = new Date(d); end.setDate(end.getDate() + 6)
  const dd = (x: Date) => `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`
  return `Sem. ${isoWeek(d)} · ${dd(d)} – ${dd(end)}`
}

export default function EquipeAlocacaoPage() {
  const { user } = useAuth()
  const isCoord = (user as { type?: string } | null)?.type === 'coordenador'
  const myId = (user as { id?: number } | null)?.id
  const [tab, setTab] = useState<'alocacao' | 'semanal'>('alocacao')
  const [scope, setScope] = useState<'meus' | 'todos'>('todos')
  const [alloc, setAlloc] = useState<AllocRow[]>([])
  const [weekly, setWeekly] = useState<WeeklyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cliente, setCliente] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const coordQ = (scope === 'meus' && isCoord && myId) ? `&coordinator_id=${myId}` : ''
    try {
      const [a, w] = await Promise.all([
        api.get<{ rows: AllocRow[] }>(`/consultant-allocation?_=1${coordQ}`),
        api.get<{ rows: WeeklyRow[] }>(`/weekly-timesheets?weeks=8${coordQ}`),
      ])
      setAlloc(a?.rows ?? [])
      setWeekly(w?.rows ?? [])
    } catch (e) { toast.error(apiMessage(e, 'Erro ao carregar equipe')) }
    finally { setLoading(false) }
  }, [scope, isCoord, myId])
  useEffect(() => { load() }, [load])

  const clientes = useMemo(
    () => Array.from(new Set(alloc.map(r => r.customer_name).filter(Boolean))).sort() as string[],
    [alloc],
  )

  const q = search.trim().toLowerCase()
  const allocView = useMemo(() => alloc.filter(r =>
    (!cliente || r.customer_name === cliente) &&
    (!q || r.project_name.toLowerCase().includes(q) || (r.project_code ?? '').toLowerCase().includes(q) || r.user_name.toLowerCase().includes(q) || (r.customer_name ?? '').toLowerCase().includes(q)),
  ), [alloc, cliente, q])

  const clienteByProject = useMemo(() => {
    const m = new Map<number, string | null>()
    alloc.forEach(r => m.set(r.project_id, r.customer_name))
    return m
  }, [alloc])
  const weeklyView = useMemo(() => weekly.filter(r => {
    const cust = clienteByProject.get(r.project_id) ?? null
    return (!cliente || cust === cliente) &&
      (!q || r.project_name.toLowerCase().includes(q) || (r.project_code ?? '').toLowerCase().includes(q) || r.user_name.toLowerCase().includes(q))
  }), [weekly, cliente, q, clienteByProject])

  const th = 'px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-left'
  const thR = th.replace('text-left', 'text-right')

  return (
    <AppLayout title="Equipe · Alocação & Apontamento">
      <div className="flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
            <Users size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Equipe · Alocação & Apontamento</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Quem está vinculado a cada projeto e quanto apontou por semana</p>
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
            {isCoord && (
              <div className="inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {(['meus', 'todos'] as const).map(opt => {
                  const active = scope === opt
                  return (
                    <button key={opt} onClick={() => setScope(opt)}
                      className="px-3 py-1.5 text-xs font-semibold transition-colors"
                      style={{ background: active ? 'var(--primary)' : 'var(--surface)', color: active ? 'var(--primary-fg)' : 'var(--text-muted)', borderRight: opt === 'meus' ? '1px solid var(--border)' : undefined }}>
                      {opt === 'meus' ? 'Meus projetos' : 'Todos'}
                    </button>
                  )
                })}
              </div>
            )}
            <div style={{ minWidth: 200 }}>
              <SearchSelect value={cliente} onChange={setCliente} options={clientes.map(c => ({ id: c, name: c }))} placeholder="Todos os clientes" fullWidth />
            </div>
          </div>
        </div>

        {/* Tabs + busca */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {([['alocacao', 'Alocação por Consultor', Users], ['semanal', 'Apontamento Semanal', Clock]] as const).map(([id, label, Icon]) => {
              const active = tab === id
              return (
                <button key={id} onClick={() => setTab(id)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors"
                  style={{ background: active ? 'var(--primary-soft)' : 'var(--surface)', color: active ? 'var(--primary)' : 'var(--text-muted)' }}>
                  <Icon size={14} /> {label}
                </button>
              )
            })}
          </div>
          <div className="relative" style={{ minWidth: 240 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar projeto ou consultor…"
              className="w-full text-sm rounded-lg pl-8 pr-3 py-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
        </div>

        {loading ? (
          <div className="ds-card p-8 text-center text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</div>
        ) : tab === 'alocacao' ? (
          <div className="ds-card overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 820 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className={th} style={{ color: 'var(--text-light)' }}>Projeto</th>
                  <th className={th} style={{ color: 'var(--text-light)' }}>Cliente</th>
                  <th className={th} style={{ color: 'var(--text-light)' }}>Consultor</th>
                  <th className={th} style={{ color: 'var(--text-light)' }}>Papel</th>
                  <th className={thR} style={{ color: 'var(--text-light)' }}>Alocadas</th>
                  <th className={thR} style={{ color: 'var(--text-light)' }}>Consumidas</th>
                  <th className={thR} style={{ color: 'var(--text-light)' }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {allocView.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-sm" style={{ color: 'var(--text-light)' }}>Nenhum vínculo no filtro.</td></tr>
                ) : allocView.map((r, i) => {
                  const first = i === 0 || allocView[i - 1].project_id !== r.project_id
                  return (
                    <tr key={`${r.project_id}-${r.user_id}`} style={{ borderBottom: '1px solid var(--border)', borderTop: first && i > 0 ? '2px solid var(--border)' : undefined }}>
                      <td className="px-3 py-2.5">
                        {first ? (
                          <div>
                            <div className="font-medium" style={{ color: 'var(--text)' }}>{r.project_name}</div>
                            {r.project_code && <div className="text-[11px] font-mono" style={{ color: 'var(--primary)' }}>{r.project_code}</div>}
                          </div>
                        ) : <span style={{ color: 'var(--text-light)' }}>↳</span>}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{first ? (r.customer_name ?? '—') : ''}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{r.user_name}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{r.role}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text)' }}>{fmtH(r.planned_hours)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text)' }}>{fmtH(r.consumed_hours)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: r.balance_hours < 0 ? 'var(--danger)' : 'var(--success)' }}>{fmtH(r.balance_hours)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ds-card overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className={th} style={{ color: 'var(--text-light)' }}>Semana</th>
                  <th className={th} style={{ color: 'var(--text-light)' }}>Consultor</th>
                  <th className={th} style={{ color: 'var(--text-light)' }}>Projeto</th>
                  <th className={thR} style={{ color: 'var(--text-light)' }}>Horas</th>
                  <th className={th} style={{ color: 'var(--text-light)' }}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {weeklyView.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-sm" style={{ color: 'var(--text-light)' }}>Sem apontamentos no período.</td></tr>
                ) : weeklyView.map((r, i) => {
                  const first = i === 0 || weeklyView[i - 1].week_start !== r.week_start
                  return (
                    <tr key={`${r.week_start}-${r.user_id}-${r.project_id}`} style={{ borderBottom: '1px solid var(--border)', borderTop: first && i > 0 ? '2px solid var(--border)' : undefined }}>
                      <td className="px-3 py-2.5" style={{ color: first ? 'var(--text)' : 'var(--text-light)' }}>{first ? weekLabel(r.week_start) : ''}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{r.user_name}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>
                        {r.project_name}{r.project_code ? <span className="text-[11px] font-mono" style={{ color: 'var(--primary)' }}> · {r.project_code}</span> : null}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{fmtH(r.hours)}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--success)' }}>
                          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--success)' }} /> Apontou
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'semanal' && !loading && (
          <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Últimas 8 semanas · horas apontadas (aprovadas + pendentes). Semana começa na segunda-feira.</p>
        )}
      </div>
    </AppLayout>
  )
}
