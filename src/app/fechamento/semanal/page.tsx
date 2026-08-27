'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { SearchSelect } from '@/components/ui/search-select'
import { OpenPeriodsPanel } from '@/components/open-periods-panel'
import { CalendarClock, RotateCcw, Lock, ClipboardList, RefreshCw, ChevronDown, ChevronRight, UserCog, Save } from 'lucide-react'

interface BlockSettings { timesheet_retroactive_limit_days?: number | null; fechamento_auto_dia_util?: number | null; [k: string]: unknown }

interface WeekRow { n: number; week_start: string; week_end: string; deadline: string; status: string; reopen_auto_close_at: string | null }
interface MonthGroup { ym: string; label: string; status: string; deadline: string; reopen_auto_close_at: string | null; weeks: WeekRow[] }
interface ActiveReopen { period_kind: string; period_key: string; project_id: number | null; project: string | null; customer_id?: number | null; customer?: string | null; all_projects?: boolean; projects_count?: number; user_id: number | null; user: string | null; auto_close_at: string | null }
interface ScopedClosure { id: number; period_kind: string; period_key: string; project_id: number | null; project: string | null; user_id: number | null; user: string | null; closed_by: number | null; closed_by_name: string | null; closed_at: string | null }
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
  futura: { bg: 'var(--surface-hover)', fg: 'var(--text-muted)', label: 'Futura' },
}
const isClosed = (s: string) => s === 'fechada' || s === 'fechada_mes'
// Hoje em São Paulo (YYYY-MM-DD) — comparação lexicográfica com week_start.
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
// Semana ainda NÃO começou (segunda no futuro) → linha inativa.
const isFutureWeek = (weekStart: string) => weekStart > todayStr()
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
  const [scopedClosures, setScopedClosures] = useState<ScopedClosure[]>([])
  // Config de bloqueio (vinda de Configurações → agora centralizada aqui).
  const [cfg, setCfg] = useState<BlockSettings>({})
  const [savingCfg, setSavingCfg] = useState(false)
  useEffect(() => { api.get<{ data: BlockSettings }>('/system-settings').then(r => setCfg(r.data ?? {})).catch(() => {}) }, [])
  const saveCfg = async () => {
    setSavingCfg(true)
    try { await api.put('/system-settings', cfg); toast.success('Configurações salvas') }
    catch { toast.error('Erro ao salvar') } finally { setSavingCfg(false) }
  }
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
      api.get<{ months: MonthGroup[]; active_reopens: ActiveReopen[]; scoped_closures?: ScopedClosure[] }>('/weekly-closings'),
      api.get<{ data: LogRow[] }>('/weekly-closings/logs'),
    ]).then(([w, l]) => {
      setMonths(w.months ?? []); setActiveReopens(w.active_reopens ?? []); setScopedClosures(w.scoped_closures ?? []); setLogs(l.data ?? [])
      setExpanded(prev => prev.size ? prev : new Set((w.months ?? []).slice(0, 1).map(m => m.ym)))
    }).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.get<{ data?: unknown }>('/customers?pageSize=500').then(r => setCustomers((norm(r) as Opt[]).map(c => ({ id: c.id, name: c.name })).filter(c => c.id && c.name))).catch(() => {})
    // minimal + status=open: traz TODOS os projetos NÃO encerrados/cancelados (inclui os aguardando início);
    // status=open exclui finished/cancelled; minimal eleva o cap p/ vir a lista completa (não só 200 por nome).
    api.get<{ data?: unknown }>('/projects?minimal=1&status=open&pageSize=2000').then(r => setProjects((norm(r) as ProjOpt[]).map(p => ({ id: p.id, name: p.name, customer_id: p.customer_id })).filter(p => p.id && p.name))).catch(() => {})
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
      ...(fProjeto ? { project_id: Number(fProjeto) } : (fCliente ? { customer_id: Number(fCliente) } : {})),
      ...(fUser ? { user_id: Number(fUser) } : {}),
    }, 'form')
  }
  // Seletor de usuário INLINE (na linha da semana/mês): reabre/encerra para 1 usuário
  // em TODOS os projetos dele (escopo global de projeto + user_id).
  const [userScope, setUserScope] = useState<{ kind: 'week' | 'month'; key: string } | null>(null)
  const [userPick, setUserPick] = useState('')
  const openUserPicker = (kind: 'week' | 'month', key: string) => {
    setUserScope(cur => (cur && cur.kind === kind && cur.key === key) ? null : { kind, key }); setUserPick('')
  }
  const submitUserScope = async (action: 'reopen' | 'close') => {
    if (!userScope) return
    if (!userPick) { toast.error('Escolha o usuário'); return }
    await doAction(action, { period_kind: userScope.kind, period_key: userScope.key, user_id: Number(userPick) }, 'us')
    setUserScope(null); setUserPick('')
  }
  const userPicker = (
    <div className="flex flex-wrap items-end gap-2 px-4 py-3" style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
      <div style={{ minWidth: 240 }}>
        <label className="text-[11px]" style={{ color: 'var(--text-light)' }}>Abrir para o usuário (todos os projetos dele)</label>
        <SearchSelect value={userPick} onChange={setUserPick} options={users} placeholder="Escolha o usuário…" />
      </div>
      <button onClick={() => submitUserScope('reopen')} disabled={busy === 'us'} className="ds-btn-primary text-xs inline-flex items-center gap-1 px-3 py-2 disabled:opacity-60"><RotateCcw size={13} /> Reabrir p/ usuário</button>
      <button onClick={() => submitUserScope('close')} disabled={busy === 'us'} className="text-xs inline-flex items-center gap-1 px-3 py-2 rounded-lg font-medium disabled:opacity-60" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)' }}><Lock size={13} /> Encerrar p/ usuário</button>
      <button onClick={() => setUserScope(null)} className="ds-btn-secondary text-xs px-3 py-2">Cancelar</button>
    </div>
  )
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
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Semana (seg–dom) fecha no 1º dia útil da semana seguinte, 23:59. Reabertura auto-fecha às 23:59 do dia. Reabrir o mês libera as semanas dele.</p>
          </div>
          <button onClick={load} className="ds-btn-secondary text-xs inline-flex items-center gap-1 px-2.5 py-1.5"><RefreshCw size={13} /> Atualizar</button>
        </div>

        {/* Bloqueio de apontamento — centralizado aqui (saiu de Configurações) */}
        <div className="ds-card p-4">
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Bloqueio de apontamento</p>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <div>
              <label className="text-[11px]" style={{ color: 'var(--text-light)' }}>Limite de dias para lançamento retroativo</label>
              <input type="number" min={0} max={365} value={cfg.timesheet_retroactive_limit_days ?? ''}
                onChange={e => setCfg(s => ({ ...s, timesheet_retroactive_limit_days: e.target.value === '' ? null : Number(e.target.value) }))}
                className="mt-1 w-40 rounded-lg px-3 py-2 text-sm ds-input" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-light)' }}>0 = sem limite. Máximo 365 dias.</p>
            </div>
            <div>
              <label className="text-[11px]" style={{ color: 'var(--text-light)' }}>Encerrar competência no Nº dia útil do mês</label>
              <input type="number" min={1} max={20} value={cfg.fechamento_auto_dia_util ?? 2}
                onChange={e => setCfg(s => ({ ...s, fechamento_auto_dia_util: Number(e.target.value) }))}
                className="mt-1 w-40 rounded-lg px-3 py-2 text-sm ds-input" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-light)' }}>A competência do mês anterior é encerrada automaticamente neste dia útil (pula fins de semana e feriados). Padrão: 2.</p>
            </div>
          </div>
          <div className="mt-3">
            <button onClick={saveCfg} disabled={savingCfg} className="ds-btn-primary text-xs inline-flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-60"><Save size={13} /> {savingCfg ? 'Salvando…' : 'Salvar configurações'}</button>
          </div>
        </div>

        {/* Períodos de projeto abertos (reabertos para lançamento) */}
        <OpenPeriodsPanel />

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
                  <span key={i} className="inline-flex items-center gap-2 text-[11px] pl-2 pr-1 py-1 rounded-md" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                    <span>{p.period_kind === 'week' ? 'Semana' : 'Mês'} {p.period_kind === 'week' ? fmtDate(p.period_key) : p.period_key} · {p.all_projects ? `${p.customer ?? 'Cliente'} · projetos = todos` : (p.project ? `${p.customer ? p.customer + ' · ' : ''}${p.project}` : 'global')}{p.user ? ` · ${p.user}` : ''} · até {fmtDT(p.auto_close_at)}</span>
                    <button title={p.all_projects ? 'Encerrar a reabertura de TODOS os projetos deste cliente' : 'Encerrar esta reabertura agora'} disabled={busy === `ar${i}`}
                      onClick={() => doAction('close', { period_kind: p.period_kind, period_key: p.period_key, ...(p.all_projects && p.customer_id ? { customer_id: p.customer_id } : (p.project_id ? { project_id: p.project_id } : {})), ...(p.user_id ? { user_id: p.user_id } : {}) }, `ar${i}`)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold disabled:opacity-60"
                      style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)' }}>
                      <Lock size={10} /> Encerrar
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {scopedClosures.length > 0 && (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[11px] uppercase tracking-wide mb-1 inline-flex items-center gap-1" style={{ color: 'var(--danger)' }}>
                <Lock size={11} /> Bloqueios individuais (usuário/projeto) — não aparecem no status global
              </p>
              <div className="flex flex-wrap gap-2">
                {scopedClosures.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-2 text-[11px] pl-2 pr-1 py-1 rounded-md" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)' }}
                    title={c.closed_by_name ? `Encerrado por ${c.closed_by_name}${c.closed_at ? ' em ' + fmtDT(c.closed_at) : ''}` : ''}>
                    <span>{c.period_kind === 'week' ? 'Semana' : 'Mês'} {c.period_kind === 'week' ? fmtDate(c.period_key) : c.period_key} · {c.user ?? c.project ?? 'escopo'} bloqueado{c.closed_by_name ? ` (por ${c.closed_by_name})` : ''}</span>
                    <button title="Reabrir para este usuário/projeto" disabled={busy === `sc${c.id}`}
                      onClick={() => doAction('reopen', { period_kind: c.period_kind, period_key: c.period_key, ...(c.project_id ? { project_id: c.project_id } : {}), ...(c.user_id ? { user_id: c.user_id } : {}) }, `sc${c.id}`)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold disabled:opacity-60"
                      style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                      <RotateCcw size={10} /> Reabrir
                    </button>
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
                {(() => { const n = scopedClosures.filter(c => c.period_key === m.ym || c.period_key.startsWith(m.ym + '-')).length; return n > 0 ? <span className="text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }} title={`${n} usuário(s)/projeto(s) bloqueado(s) individualmente neste mês`}><Lock size={9} /> {n} bloqueio{n > 1 ? 's' : ''}</span> : null })()}
                {m.deadline && <span className="text-[10px] inline-flex items-center gap-1" style={{ color: 'var(--text-light)' }} title="Prazo de fechamento do mês — 1º dia útil do mês seguinte, 23:59"><CalendarClock size={11} /> Prazo: {fmtDeadline(m.deadline)}</span>}
                {m.status === 'reaberta' && <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>até {fmtDT(m.reopen_auto_close_at)}</span>}
                <div className="flex-1" />
                <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                  {m.status === 'reaberta'
                    ? iconBtn(() => doAction('close', { period_kind: 'month', period_key: m.ym }, `mc${m.ym}`), busy === `mc${m.ym}`, { bg: 'var(--surface-hover)', fg: 'var(--text-muted)' }, Lock, 'Fechar mês', 'Fechar reabertura do mês')
                    : iconBtn(() => doAction('reopen', { period_kind: 'month', period_key: m.ym }, `mr${m.ym}`), busy === `mr${m.ym}`, { bg: 'var(--primary-soft)', fg: 'var(--primary)' }, RotateCcw, 'Abrir mês', 'Reabrir o mês inteiro (global)')}
                  {iconBtn(() => doAction('close', { period_kind: 'month', period_key: m.ym }, `me${m.ym}`), busy === `me${m.ym}` || isClosed(m.status), { bg: 'var(--danger-bg)', fg: 'var(--danger)' }, Lock, 'Encerrar', isClosed(m.status) ? 'Mês já está fechado' : 'Encerrar o mês (global)')}
                  {iconBtn(() => openUserPicker('month', m.ym), false, { bg: 'var(--bg)', fg: 'var(--text-muted)' }, UserCog, 'Usuário', 'Abrir mês só para um usuário')}
                </div>
              </div>
              {userScope?.kind === 'month' && userScope.key === m.ym && userPicker}
              {open && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left" style={{ color: 'var(--text-light)' }}>
                      <th className="px-4 py-1.5 font-medium">Semana</th><th className="font-medium">Prazo</th><th className="font-medium">Status</th><th className="font-medium text-right pr-4">Ação</th>
                    </tr></thead>
                    <tbody>
                      {m.weeks.map(w => {
                        // Semana futura (ainda não começou) = linha inativa, sem ações.
                        const future = isFutureWeek(w.week_start)
                        // Mês fechado bloqueia a semana mesmo que a regra semanal a mostre "aberta".
                        const eff = future ? 'futura' : ((isClosed(m.status) && w.status === 'aberta') ? 'fechada_mes' : w.status)
                        const st = STATUS_STYLE[eff] ?? STATUS_STYLE.aberta
                        return (
                          <Fragment key={w.week_start}>
                          <tr className="border-t" style={{ borderColor: 'var(--border)', opacity: future ? 0.55 : 1 }}>
                            <td className="px-4 py-2" style={{ color: 'var(--text)' }}><b>Semana {w.n}</b> <span style={{ color: 'var(--text-muted)' }}>· {fmtDate(w.week_start)} – {fmtDate(w.week_end)}</span></td>
                            <td style={{ color: 'var(--text-muted)' }}>{fmtDeadline(w.deadline)}</td>
                            <td><span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: st.bg, color: st.fg }}>{st.label}</span>{!future && w.status === 'reaberta' && <span className="text-[10px] ml-1.5" style={{ color: 'var(--text-light)' }}>até {fmtDT(w.reopen_auto_close_at)}</span>}</td>
                            <td className="text-right pr-4">
                              <div className="inline-flex gap-1.5">
                                {w.status === 'reaberta'
                                  ? iconBtn(() => doAction('close', { period_kind: 'week', period_key: w.week_start }, `wc${w.week_start}`), future || busy === `wc${w.week_start}`, { bg: 'var(--surface-hover)', fg: 'var(--text-muted)' }, Lock, 'Fechar', 'Fechar reabertura')
                                  : iconBtn(() => doAction('reopen', { period_kind: 'week', period_key: w.week_start }, `wr${w.week_start}`), future || busy === `wr${w.week_start}`, { bg: 'var(--primary-soft)', fg: 'var(--primary)' }, RotateCcw, 'Reabrir', future ? 'Semana ainda não iniciada' : 'Reabrir a semana (global)')}
                                {iconBtn(() => doAction('close', { period_kind: 'week', period_key: w.week_start }, `we${w.week_start}`), future || busy === `we${w.week_start}` || isClosed(eff), { bg: 'var(--danger-bg)', fg: 'var(--danger)' }, Lock, 'Encerrar', future ? 'Semana ainda não iniciada' : (isClosed(eff) ? 'Semana já está fechada' : 'Encerrar a semana (global)'))}
                                {iconBtn(() => openUserPicker('week', w.week_start), future, { bg: 'var(--bg)', fg: 'var(--text-muted)' }, UserCog, 'Usuário', future ? 'Semana ainda não iniciada' : 'Reabrir só para um usuário')}
                              </div>
                            </td>
                          </tr>
                          {userScope?.kind === 'week' && userScope.key === w.week_start && (
                            <tr><td colSpan={4} className="p-0">{userPicker}</td></tr>
                          )}
                          </Fragment>
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
