'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { SearchSelect } from '@/components/ui/search-select'
import { CalendarClock, RotateCcw, Lock, ClipboardList, RefreshCw } from 'lucide-react'

interface WeekRow { week_start: string; week_end: string; deadline: string; status: 'aberta' | 'fechada' | 'reaberta'; reopen_auto_close_at: string | null }
interface ProjReopen { week_start: string; project_id: number; project: string | null; auto_close_at: string | null }
interface LogRow { id: number; event: string; period_kind: string; period_key: string; project: string | null; user: string | null; occurred_at: string; note: string | null }
interface ProjOpt { id: number; name: string }

const fmtDate = (ymd: string) => new Date(ymd + 'T00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const fmtDeadline = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtDT = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const EVENT_LABEL: Record<string, string> = {
  week_deadline_close: 'Semana encerrada (prazo)',
  week_reopen: 'Semana reaberta',
  week_reopen_autoclose: 'Reabertura de semana encerrada (23:59)',
  month_reopen: 'Competência reaberta',
  month_reopen_autoclose: 'Reabertura de competência encerrada (23:59)',
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  aberta:   { bg: 'var(--success-bg)', fg: 'var(--success)', label: 'Aberta' },
  fechada:  { bg: 'var(--danger-bg)',  fg: 'var(--danger)',  label: 'Fechada' },
  reaberta: { bg: 'var(--warning-bg)', fg: 'var(--warning)', label: 'Reaberta' },
}

export default function FechamentoSemanalPage() {
  const [weeks, setWeeks] = useState<WeekRow[]>([])
  const [projReopens, setProjReopens] = useState<ProjReopen[]>([])
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [projects, setProjects] = useState<ProjOpt[]>([])
  const [selProj, setSelProj] = useState('')
  const [selWeek, setSelWeek] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get<{ data: WeekRow[]; project_reopens: ProjReopen[] }>('/weekly-closings'),
      api.get<{ data: LogRow[] }>('/weekly-closings/logs'),
    ]).then(([w, l]) => {
      setWeeks(w.data ?? []); setProjReopens(w.project_reopens ?? []); setLogs(l.data ?? [])
    }).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  // Carrega projetos (para reabrir por projeto) sob demanda.
  useEffect(() => {
    api.get<{ data: unknown }>('/projects?pageSize=1000').then(r => {
      const raw = Array.isArray(r.data) ? r.data : ((r.data as { data?: unknown })?.data ?? [])
      const list = (raw as { id: number; name: string }[]).map(p => ({ id: p.id, name: p.name })).filter(p => p.id && p.name)
      setProjects(list)
    }).catch(() => {})
  }, [])

  const reopenGlobal = async (week: string) => {
    if (!confirm(`Reabrir a semana ${week} para TODOS os projetos até as 23:59 de hoje?`)) return
    setBusy(week)
    try { await api.post('/weekly-closings/reopen', { week_start: week }); toast.success('Semana reaberta (global) até 23:59'); load() }
    catch { toast.error('Erro ao reabrir') } finally { setBusy('') }
  }
  const reopenProject = async () => {
    if (!selProj || !selWeek) { toast.error('Escolha o projeto e a semana'); return }
    setBusy('proj')
    try { await api.post('/weekly-closings/reopen', { week_start: selWeek, project_id: Number(selProj) }); toast.success('Semana reaberta para o projeto até 23:59'); setSelProj(''); setSelWeek(''); load() }
    catch { toast.error('Erro ao reabrir') } finally { setBusy('') }
  }
  const closeReopen = async (week: string, projectId?: number) => {
    setBusy(week + (projectId ?? ''))
    try { await api.post('/weekly-closings/close', { week_start: week, ...(projectId ? { project_id: projectId } : {}) }); toast.success('Reabertura fechada'); load() }
    catch { toast.error('Erro ao fechar') } finally { setBusy('') }
  }

  return (
    <AppLayout title="Fechamento Semanal">
      <div className="space-y-4 max-w-6xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}><CalendarClock size={18} style={{ color: 'var(--primary)' }} /> Fechamento Semanal</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Semana de segunda a domingo. O prazo de digitação encerra no <b>2º dia útil da semana seguinte, às 23:59</b>. Coexiste com o fechamento mensal.</p>
          </div>
          <button onClick={load} className="ds-btn-secondary text-xs inline-flex items-center gap-1 px-2.5 py-1.5"><RefreshCw size={13} /> Atualizar</button>
        </div>

        {/* Reabrir por projeto */}
        <div className="ds-card p-4">
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Reabrir por projeto</p>
          <div className="flex flex-wrap items-end gap-2">
            <div style={{ minWidth: 260 }}>
              <SearchSelect label="Projeto" value={selProj} onChange={setSelProj} options={projects} placeholder="Buscar projeto…" />
            </div>
            <div style={{ minWidth: 200 }}>
              <SearchSelect label="Semana" value={selWeek} onChange={setSelWeek}
                options={weeks.map(w => ({ id: w.week_start, name: `${fmtDate(w.week_start)}–${fmtDate(w.week_end)}` }))}
                placeholder="Escolha a semana…" />
            </div>
            <button onClick={reopenProject} disabled={busy === 'proj'} className="ds-btn-primary text-xs inline-flex items-center gap-1 px-3 py-2 disabled:opacity-60"><RotateCcw size={13} /> Reabrir projeto</button>
          </div>
          {projReopens.length > 0 && (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-light)' }}>Reaberturas de projeto ativas</p>
              <div className="flex flex-wrap gap-2">
                {projReopens.map(p => (
                  <span key={`${p.week_start}-${p.project_id}`} className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                    {p.project ?? `#${p.project_id}`} · {fmtDate(p.week_start)} · até {fmtDT(p.auto_close_at)}
                    <button title="Fechar agora" onClick={() => closeReopen(p.week_start, p.project_id)}><Lock size={11} /></button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Semanas */}
        <div className="ds-card p-4">
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Semanas</p>
          {loading ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Carregando…</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left" style={{ color: 'var(--text-light)' }}>
                  <th className="py-1.5 font-medium">Semana</th><th className="font-medium">Prazo (2º dia útil)</th><th className="font-medium">Status</th><th className="font-medium text-right">Ação</th>
                </tr></thead>
                <tbody>
                  {weeks.map(w => {
                    const st = STATUS_STYLE[w.status]
                    return (
                      <tr key={w.week_start} className="border-t" style={{ borderColor: 'var(--border)' }}>
                        <td className="py-2" style={{ color: 'var(--text)' }}>{fmtDate(w.week_start)} – {fmtDate(w.week_end)}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{fmtDeadline(w.deadline)}</td>
                        <td>
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                          {w.status === 'reaberta' && <span className="text-[10px] ml-1.5" style={{ color: 'var(--text-light)' }}>até {fmtDT(w.reopen_auto_close_at)}</span>}
                        </td>
                        <td className="text-right">
                          {w.status === 'reaberta'
                            ? <button onClick={() => closeReopen(w.week_start)} disabled={busy === w.week_start} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-md" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}><Lock size={12} /> Fechar</button>
                            : <button onClick={() => reopenGlobal(w.week_start)} disabled={busy === w.week_start} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-md" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><RotateCcw size={12} /> Reabrir (global)</button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Log de encerramentos */}
        <div className="ds-card p-4">
          <p className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text)' }}><ClipboardList size={15} style={{ color: 'var(--primary)' }} /> Log de encerramentos</p>
          {logs.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum encerramento registrado ainda.</p> : (
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
