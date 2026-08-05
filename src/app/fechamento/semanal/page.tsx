'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { SearchSelect } from '@/components/ui/search-select'
import { CalendarClock, RotateCcw, Lock, ClipboardList, RefreshCw, ChevronDown, ChevronRight, UserCog } from 'lucide-react'

interface WeekRow { n: number; week_start: string; week_end: string; deadline: string; status: string; reopen_auto_close_at: string | null }
interface MonthGroup { ym: string; label: string; status: string; deadline: string; reopen_auto_close_at: string | null; weeks: WeekRow[] }
interface ActiveReopen { period_kind: string; period_key: string; project_id: number | null; project: string | null; user_id: number | null; user: string | null; auto_close_at: string | null }
interface LogRow { id: number; event: string; period_kind: string; period_key: string; project: string | null; user: string | null; occurred_at: string; note: string | null }
interface Opt { id: number; name: string }
interface ProjOpt extends Opt { customer_id?: number | null }

const fmtDate = (ymd: string) => new Date(ymd + 'T00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const fmtDeadline = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtDT = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const EVENT_LABEL: Record<string, string> = {
  week_deadline_close: 'Semana encerrada (prazo)', week_reopen: 'Semana reaberta', week_reopen_autoclose: 'Reabertura de semana encerrada (23:59)',
  week_manual_close: 'Semana encerrada (manual)', month_reopen: 'Competência reaberta', month_reopen_autoclose: 'Reabertura de competência encerrada (23:59)',
  month_manual_close: 'Competência encerrada (manual)',
}
const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  aberta: { bg: 'var(--success-bg)', fg: 'var(--success)', label: 'Aberta' },
  fechada: { bg: 'var(--danger-bg)', fg: 'var(--danger)', label: 'Fechada' },
  fechada_mes: { bg: 'var(--warning-bg)', fg: 'var(--warning)', label: 'Fechada (mês)' },
  reaberta: { bg: 'var(--warning-bg)', fg: 'var(--warning)', label: 'Reaberta' },
}
const isClosed = (s: string) => s === 'fechada' || s === 'fechada_mes'
// Endpoints do Minutor variam: {items:[]} (customers/users/projects) | {data:[]} (paginate) | [].
const norm = (r: unknown): unknown[] => {
  if (Array.isArray(r)) return r
  const o = r as { items?: unknown; data?: unknown }
  if (Array.isArray(o?.items)) return o.items
  if (Array.isArray(o?.data)) return o.data
  if (Array.isArray((o?.data as { data?: unknown })?.data)) return (o.data as { data: unknown[] }).data
  return []
}

export default function FechamentoSemanalPage() {
  const [months, setMonths] = useState<MonthGroup[]>([])
  const [activeReopens, setActiveReopens] = useState<ActiveReopen[]>([])
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [customers, setCustomers] = useState<Opt[]>([])
  const [projects, setProjects] = useState<ProjOpt[]>([])
  const [users, setUsers] = useState<Opt[]>([])
  const [fCliente, setFCliente] = useState('')
  const [fProjeto, setFProjeto] = useState('')
  const [fKind, setFKind] = useState<'week' | 'month'>('week')
  const [fMonth, setFMonth] = useState('')
  const [fWeek, setFWeek] = useState('')
  const [fUser, setFUser] = useState('')
  const formRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get<{ months: MonthGroup[]; active_reopens: ActiveReopen[] }>('/weekly-closings'),
      api.get<{ data: LogRow[] }>('/weekly-closings/logs'),
    ]).then(([w, l]) => {
      setMonths(w.months ?? []); setActiveReopens(w.active_reopens ?? []); setLogs(l.data ?? [])
      setExpanded(prev => prev.size ? prev : new Set((w.months ?? []).slice(0, 1).map(m => m.ym)))
    }).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.get<{ data?: unknown }>('/customers?pageSize=500').then(r => setCustomers((norm(r) as Opt[]).map(c => ({ id: c.id, name: c.name })).filter(c => c.id && c.name))).catch(() => {})
    api.get<{ data?: unknown }>('/projects?pageSize=1000').then(r => setProjects((norm(r) as ProjOpt[]).map(p => ({ id: p.id, name: p.name, customer_id: p.customer_id })).filter(p => p.id && p.name))).catch(() => {})
    api.get<{ data?: unknown }>('/users?pageSize=1000').then(r => setUsers((norm(r) as Opt[]).map(u => ({ id: u.id, name: u.name })).filter(u => u.id && u.name))).catch(() => {})
  }, [])

  const projectOptions = projects.filter(p => !fCliente || String(p.customer_id) === fCliente)
  const monthOptions = months.map(m => ({ id: m.ym, name: m.label }))
  const weeksOfMonth = months.find(m => m.ym === fMonth)?.weeks ?? []
  const weekOptions = weeksOfMonth.map(w => ({ id: w.week_start, name: `Semana ${w.n} (${fmtDate(w.week_start)}–${fmtDate(w.week_end)})` }))

  const doAction = async (action: 'reopen' | 'close', body: Record<string, unknown>, key: string) => {
    setBusy(key)
    try { await api.post(`/weekly-closings/${action}`, body); toast.success(action === 'reopen' ? 'Período reaberto até 23:59' : 'Período encerrado'); load() }
    catch { toast.error('Erro na operação') } finally { setBusy('') }
  }
  const submitForm = (action: 'reopen' | 'close') => {
    if (!fMonth) { toast.error('Escolha o mês'); return }
    if (fKind === 'week' && !fWeek) { toast.error('Escolha a semana'); return }
    doAction(action, {
      period_kind: fKind,
      period_key: fKind === 'month' ? fMonth : fWeek,
      ...(fProjeto ? { project_id: Number(fProjeto) } : {}),
      ...(fUser ? { user_id: Number(fUser) } : {}),
    }, 'form')
  }
  const scopeToUser = (kind: 'week' | 'month', ym: string, weekStart?: string) => {
    setFKind(kind); setFMonth(ym); setFWeek(kind === 'week' ? (weekStart ?? '') : ''); setFUser('')
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    toast.info('Escolha o usuário (e opcionalmente o projeto) e clique em Reabrir')
  }
  const toggle = (ym: string) => setExpanded(p => { const n = new Set(p); n.has(ym) ? n.delete(ym) : n.add(ym); return n })

  const iconBtn = (onClick: () => void, disabled: boolean, style: { bg: string; fg: string }, Icon: typeof RotateCcw, label: string, title: string) => (
    <button onClick={onClick} disabled={disabled} title={title} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-md whitespace-nowrap disabled:opacity-60" style={{ background: style.bg, color: style.fg }}><Icon size={12} /> {label}</button>
  )

  return (
    <AppLayout title="Abertura de Competência">
      <div className="space-y-4 max-w-6xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}><CalendarClock size={18} style={{ color: 'var(--primary)' }} /> Abertura de Competência</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Semana (seg–dom) fecha no 2º dia útil da semana seguinte, 23:59. Reabertura auto-fecha às 23:59 do dia. Reabrir o mês libera as semanas dele.</p>
          </div>
          <button onClick={load} className="ds-btn-secondary text-xs inline-flex items-center gap-1 px-2.5 py-1.5"><RefreshCw size={13} /> Atualizar</button>
        </div>

        {/* Formulário de reabertura/encerramento por escopo */}
        <div ref={formRef} className="ds-card p-4">
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Reabrir / Encerrar por escopo</p>
          <div className="grid gap-2 items-end" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <div><label className="text-[11px]" style={{ color: 'var(--text-light)' }}>Cliente (filtra projeto)</label>
              <SearchSelect value={fCliente} onChange={v => { setFCliente(v); setFProjeto('') }} options={customers} placeholder="Todos os clientes" /></div>
            <div><label className="text-[11px]" style={{ color: 'var(--text-light)' }}>Projeto (vazio = global)</label>
              <SearchSelect value={fProjeto} onChange={setFProjeto} options={projectOptions} placeholder="Todos / global" /></div>
            <div><label className="text-[11px]" style={{ color: 'var(--text-light)' }}>Período</label>
              <div className="flex gap-1 mt-1">
                {(['week', 'month'] as const).map(k => (
                  <button key={k} onClick={() => { setFKind(k); setFWeek('') }} className="flex-1 text-xs py-1.5 rounded-md font-medium" style={{ background: fKind === k ? 'var(--primary-soft)' : 'var(--bg)', color: fKind === k ? 'var(--primary)' : 'var(--text-muted)', border: '1px solid var(--border)' }}>{k === 'week' ? 'Semana' : 'Mês'}</button>
                ))}
              </div></div>
            <div><label className="text-[11px]" style={{ color: 'var(--text-light)' }}>Mês</label>
              <SearchSelect value={fMonth} onChange={v => { setFMonth(v); setFWeek('') }} options={monthOptions} placeholder="Escolha o mês…" /></div>
            {fKind === 'week' && (
              <div><label className="text-[11px]" style={{ color: 'var(--text-light)' }}>Semana {!fMonth && <span style={{ color: 'var(--text-light)' }}>(escolha o mês)</span>}</label>
                <SearchSelect value={fWeek} onChange={setFWeek} options={weekOptions} placeholder={fMonth ? 'Escolha a semana…' : 'Escolha o mês primeiro'} disabled={!fMonth} /></div>
            )}
            <div><label className="text-[11px]" style={{ color: 'var(--text-light)' }}>Usuário (vazio = todos)</label>
              <SearchSelect value={fUser} onChange={setFUser} options={users} placeholder="Todos os usuários" /></div>
            <div className="flex gap-2">
              <button onClick={() => submitForm('reopen')} disabled={busy === 'form'} className="ds-btn-primary text-xs inline-flex items-center gap-1 px-3 py-2 disabled:opacity-60"><RotateCcw size={13} /> Reabrir</button>
              <button onClick={() => submitForm('close')} disabled={busy === 'form'} className="text-xs inline-flex items-center gap-1 px-3 py-2 rounded-lg font-medium disabled:opacity-60" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)' }}><Lock size={13} /> Encerrar</button>
            </div>
          </div>
          {activeReopens.length > 0 && (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-light)' }}>Reaberturas ativas (escopo)</p>
              <div className="flex flex-wrap gap-2">
                {activeReopens.map((p, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                    {p.period_kind === 'week' ? 'Semana' : 'Mês'} {p.period_kind === 'week' ? fmtDate(p.period_key) : p.period_key} · {p.project ?? 'global'}{p.user ? ` · ${p.user}` : ''} · até {fmtDT(p.auto_close_at)}
                    <button title="Fechar agora" onClick={() => doAction('close', { period_kind: p.period_kind, period_key: p.period_key, ...(p.project_id ? { project_id: p.project_id } : {}), ...(p.user_id ? { user_id: p.user_id } : {}) }, `ar${i}`)}><Lock size={11} /></button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Meses (grupos expansíveis) */}
        {loading ? <div className="ds-card p-4 text-sm" style={{ color: 'var(--text-muted)' }}>Carregando…</div> : months.map(m => {
          const mst = STATUS_STYLE[m.status] ?? STATUS_STYLE.aberta
          const open = expanded.has(m.ym)
          return (
            <div key={m.ym} className="ds-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 cursor-pointer" onClick={() => toggle(m.ym)} style={{ background: 'var(--surface-sunken)' }}>
                {open ? <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />}
                <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{m.label}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: mst.bg, color: mst.fg }}>{mst.label}</span>
                {m.status === 'reaberta' && <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>até {fmtDT(m.reopen_auto_close_at)}</span>}
                <div className="flex-1" />
                <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                  {m.status === 'reaberta'
                    ? iconBtn(() => doAction('close', { period_kind: 'month', period_key: m.ym }, `mc${m.ym}`), busy === `mc${m.ym}`, { bg: 'var(--surface-hover)', fg: 'var(--text-muted)' }, Lock, 'Fechar mês', 'Fechar reabertura do mês')
                    : iconBtn(() => doAction('reopen', { period_kind: 'month', period_key: m.ym }, `mr${m.ym}`), busy === `mr${m.ym}`, { bg: 'var(--primary-soft)', fg: 'var(--primary)' }, RotateCcw, 'Abrir mês', 'Reabrir o mês inteiro (global)')}
                  {iconBtn(() => doAction('close', { period_kind: 'month', period_key: m.ym }, `me${m.ym}`), busy === `me${m.ym}` || isClosed(m.status), { bg: 'var(--danger-bg)', fg: 'var(--danger)' }, Lock, 'Encerrar', isClosed(m.status) ? 'Mês já está fechado' : 'Encerrar o mês (global)')}
                  {iconBtn(() => scopeToUser('month', m.ym), false, { bg: 'var(--bg)', fg: 'var(--text-muted)' }, UserCog, 'Usuário', 'Abrir mês só para um usuário')}
                </div>
              </div>
              {open && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left" style={{ color: 'var(--text-light)' }}>
                      <th className="px-4 py-1.5 font-medium">Semana</th><th className="font-medium">Prazo</th><th className="font-medium">Status</th><th className="font-medium text-right pr-4">Ação</th>
                    </tr></thead>
                    <tbody>
                      {m.weeks.map(w => {
                        // Mês fechado bloqueia a semana mesmo que a regra semanal a mostre "aberta".
                        const eff = (isClosed(m.status) && w.status === 'aberta') ? 'fechada_mes' : w.status
                        const st = STATUS_STYLE[eff] ?? STATUS_STYLE.aberta
                        return (
                          <tr key={w.week_start} className="border-t" style={{ borderColor: 'var(--border)' }}>
                            <td className="px-4 py-2" style={{ color: 'var(--text)' }}><b>Semana {w.n}</b> <span style={{ color: 'var(--text-muted)' }}>· {fmtDate(w.week_start)} – {fmtDate(w.week_end)}</span></td>
                            <td style={{ color: 'var(--text-muted)' }}>{fmtDeadline(w.deadline)}</td>
                            <td><span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: st.bg, color: st.fg }}>{st.label}</span>{w.status === 'reaberta' && <span className="text-[10px] ml-1.5" style={{ color: 'var(--text-light)' }}>até {fmtDT(w.reopen_auto_close_at)}</span>}</td>
                            <td className="text-right pr-4">
                              <div className="inline-flex gap-1.5">
                                {w.status === 'reaberta'
                                  ? iconBtn(() => doAction('close', { period_kind: 'week', period_key: w.week_start }, `wc${w.week_start}`), busy === `wc${w.week_start}`, { bg: 'var(--surface-hover)', fg: 'var(--text-muted)' }, Lock, 'Fechar', 'Fechar reabertura')
                                  : iconBtn(() => doAction('reopen', { period_kind: 'week', period_key: w.week_start }, `wr${w.week_start}`), busy === `wr${w.week_start}`, { bg: 'var(--primary-soft)', fg: 'var(--primary)' }, RotateCcw, 'Reabrir', 'Reabrir a semana (global)')}
                                {iconBtn(() => doAction('close', { period_kind: 'week', period_key: w.week_start }, `we${w.week_start}`), busy === `we${w.week_start}` || isClosed(eff), { bg: 'var(--danger-bg)', fg: 'var(--danger)' }, Lock, 'Encerrar', isClosed(eff) ? 'Semana já está fechada' : 'Encerrar a semana (global)')}
                                {iconBtn(() => scopeToUser('week', m.ym, w.week_start), false, { bg: 'var(--bg)', fg: 'var(--text-muted)' }, UserCog, 'Usuário', 'Reabrir só para um usuário')}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}

        {/* Log */}
        <div className="ds-card p-4">
          <p className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text)' }}><ClipboardList size={15} style={{ color: 'var(--primary)' }} /> Log de encerramentos</p>
          {logs.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum registro ainda.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left" style={{ color: 'var(--text-light)' }}>
                  <th className="py-1.5 font-medium">Quando</th><th className="font-medium">Evento</th><th className="font-medium">Período</th><th className="font-medium">Projeto</th><th className="font-medium">Por</th>
                </tr></thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-1.5" style={{ color: 'var(--text-muted)' }}>{fmtDT(l.occurred_at)}</td>
                      <td style={{ color: 'var(--text)' }}>{EVENT_LABEL[l.event] ?? l.event}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{l.period_kind === 'week' ? 'Semana' : 'Mês'} {l.period_key}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{l.project ?? (l.event.startsWith('week_deadline') ? '(todos)' : '—')}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{l.user ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
