'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { AlertTriangle, Users, Flame, Check, ExternalLink, Megaphone, X, CheckCircle2, ChevronDown } from 'lucide-react'

interface TeamTask {
  id: number; title: string; description: string | null; completed: boolean
  due_date: string | null; due_time: string | null; type: string; entity_label: string | null
  recurrence_type: string; assigned_to: number | null; assigned_name: string | null
}
interface Member { id: number; name: string }

const pad = (n: number) => String(n).padStart(2, '0')
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const hm = (t: string) => t.slice(0, 5)
const plus1hHM = () => new Date(Date.now() + 3600000).toTimeString().slice(0, 5)
const isOverdue = (t: TeamTask) => {
  if (t.completed || !t.due_date) return false
  if (t.due_date < todayStr()) return true
  if (t.due_date === todayStr() && t.due_time) return hm(t.due_time) < new Date().toTimeString().slice(0, 5)
  return false
}
const isToday = (t: TeamTask) => !isOverdue(t) && t.due_date === todayStr()
const score = (t: TeamTask) => {
  let s = 0
  if (isOverdue(t)) s += 100
  if (t.due_date === todayStr()) s += 50
  if (t.due_time && t.due_date === todayStr() && hm(t.due_time) <= plus1hHM()) s += 30
  if (!t.due_date) s += 5
  if (t.recurrence_type && t.recurrence_type !== 'none') s += 10
  return s
}
const firstName = (n: string | null) => (n ?? '').trim().split(' ').slice(0, 2).join(' ')

const POLL_MS = 60000

/** Visão de EQUIPE (Coordenador/Admin): gargalos + ação rápida sobre tarefas travadas. */
export function TeamDay() {
  const [tasks, setTasks] = useState<TeamTask[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showAllAlert, setShowAllAlert] = useState(false)
  const [selectedMember, setSelectedMember] = useState<number | null>(null)
  const [openTask, setOpenTask] = useState<TeamTask | null>(null)

  const load = useCallback(() => {
    api.get<{ data: { members: Member[]; tasks: TeamTask[] } }>('/tasks/team')
      .then(r => { setMembers(r.data?.members ?? []); setTasks((r.data?.tasks ?? []).filter(t => !t.completed)) })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [load])

  // Resolve (otimista) — coordenador marca tarefa da equipe como resolvida.
  const resolve = async (t: TeamTask) => {
    setTasks(p => p.filter(x => x.id !== t.id))
    setOpenTask(null)
    try { await api.patch(`/tasks/${t.id}/resolve`, {}); toast.success('Tarefa resolvida ✓') }
    catch { toast.error('Não foi possível resolver'); load() }
  }

  // Por membro: atrasadas / hoje / pendentes.
  const byMember = useMemo(() => {
    const map = new Map<number, { id: number; name: string; tasks: TeamTask[] }>()
    members.forEach(m => map.set(m.id, { id: m.id, name: m.name, tasks: [] }))
    tasks.forEach(t => {
      if (t.assigned_to == null) return
      if (!map.has(t.assigned_to)) map.set(t.assigned_to, { id: t.assigned_to, name: t.assigned_name ?? 'Sem nome', tasks: [] })
      map.get(t.assigned_to)!.tasks.push(t)
    })
    return [...map.values()].map(m => ({
      ...m,
      overdue: m.tasks.filter(isOverdue),
      today: m.tasks.filter(isToday),
      pending: m.tasks,
    }))
  }, [members, tasks])

  const sortedTasks = useMemo(() => [...tasks].sort((a, b) => score(b) - score(a)), [tasks])
  const topTask = sortedTasks[0] ?? null
  const allOverdue = useMemo(() => tasks.filter(isOverdue), [tasks])

  // ALERTA: membros com atrasadas, mais atrasos primeiro.
  const alertMembers = useMemo(() =>
    byMember.filter(m => m.overdue.length > 0).sort((a, b) => b.overdue.length - a.overdue.length)
  , [byMember])
  const involvedConsultores = alertMembers.length

  // EQUIPE HOJE: por criticidade (atrasadas → hoje → pendentes).
  const teamRows = useMemo(() =>
    [...byMember].sort((a, b) =>
      b.overdue.length - a.overdue.length || b.today.length - a.today.length || b.pending.length - a.pending.length || a.name.localeCompare(b.name))
  , [byMember])

  // GARGALOS: atrasadas agrupadas por projeto/vínculo, top 2.
  const gargalos = useMemo(() => {
    const map = new Map<string, number>()
    allOverdue.forEach(t => { const k = t.entity_label || 'Sem vínculo'; map.set(k, (map.get(k) ?? 0) + 1) })
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
  }, [allOverdue])

  const selectedRow = selectedMember != null ? teamRows.find(m => m.id === selectedMember) : null

  if (!loaded) return <div className="ds-card p-6 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>Carregando equipe…</div>

  if (members.length === 0) {
    return (
      <div className="ds-card p-6 text-center space-y-1">
        <Users size={22} className="mx-auto" style={{ color: 'var(--text-light)' }} />
        <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Nenhuma equipe vinculada</div>
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Você não coordena consultores com tarefas no momento.</div>
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="ds-card p-6 text-center space-y-1" style={{ borderLeft: '4px solid var(--success-border)' }}>
        <CheckCircle2 size={22} className="mx-auto" style={{ color: 'var(--success-border)' }} />
        <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Sua equipe está em dia 🎉</div>
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{members.length} pessoa{members.length > 1 ? 's' : ''} sem tarefas pendentes.</div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── ALERTA DE EQUIPE ── */}
      {alertMembers.length > 0 && (
        <div className="rounded-xl p-3.5 space-y-2" style={{ background: 'color-mix(in srgb, var(--danger-bg) 55%, transparent)', border: '1px solid var(--danger-border)' }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={17} style={{ color: 'var(--danger-border)' }} />
            <span className="text-sm font-bold" style={{ color: 'var(--danger-border)' }}>Alerta de equipe</span>
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {allOverdue.length} tarefa{allOverdue.length > 1 ? 's' : ''} atrasada{allOverdue.length > 1 ? 's' : ''} · {involvedConsultores} {involvedConsultores > 1 ? 'pessoas envolvidas' : 'pessoa envolvida'}
            </span>
          </div>
          <div className="space-y-1">
            {(showAllAlert ? alertMembers : alertMembers.slice(0, 3)).map(m => {
              const top = [...m.overdue].sort((a, b) => score(b) - score(a))[0]
              return (
                <button key={m.id} onClick={() => setSelectedMember(m.id)} className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg ds-row-hover">
                  <span className="text-[13px] font-semibold shrink-0" style={{ color: 'var(--text)' }}>{firstName(m.name)}</span>
                  <span className="text-[12px] font-semibold shrink-0" style={{ color: 'var(--danger-border)' }}>{m.overdue.length} atrasada{m.overdue.length > 1 ? 's' : ''}</span>
                  {top?.entity_label && <span className="text-[12px] truncate" style={{ color: 'var(--text-muted)' }}>({top.entity_label})</span>}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            {alertMembers.length > 3 && (
              <button onClick={() => setShowAllAlert(s => !s)} className="text-[12px] inline-flex items-center gap-1 font-medium" style={{ color: 'var(--danger-border)' }}>
                <ChevronDown size={13} className={showAllAlert ? 'rotate-180 transition-transform' : 'transition-transform'} /> {showAllAlert ? 'Ver menos' : `Ver todas (${alertMembers.length})`}
              </button>
            )}
            <button onClick={() => toast.info('Cobrança de equipe (WhatsApp / e-mail) em breve.')} className="text-[12px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium ml-auto" style={{ border: '1px solid var(--danger-border)', color: 'var(--danger-border)' }}>
              <Megaphone size={12} /> Cobrar equipe
            </button>
          </div>
        </div>
      )}

      {/* ── PRÓXIMA AÇÃO (EQUIPE) ── */}
      {topTask && (() => {
        const over = isOverdue(topTask)
        const td = isToday(topTask)
        const sc = over ? 'var(--danger-border)' : td ? 'var(--warning-border)' : 'var(--text-muted)'
        const status = over
          ? `Atrasada desde ${topTask.due_date ? ddmm(topTask.due_date) : ''}${topTask.due_time ? ` • ${hm(topTask.due_time)}` : ''}`
          : td ? `Hoje${topTask.due_time ? ` • ${hm(topTask.due_time)}` : ''}`
          : topTask.due_date ? ddmm(topTask.due_date) : 'Sem data definida'
        return (
          <div key={topTask.id} className="ds-card p-5 animate-[popIn_.2s_ease-out]" style={{ borderLeft: `5px solid ${sc}`, background: over ? 'var(--danger-bg)' : 'var(--surface)', boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: sc }}>Próxima ação · equipe</div>
            <div className="text-[20px] font-bold leading-tight" style={{ color: 'var(--text)' }}>{topTask.title}</div>
            <div className="text-[13px] font-semibold mt-1 inline-flex items-center gap-1" style={{ color: sc }}>
              {over && <AlertTriangle size={13} />}{status}
            </div>
            <div className="text-[12px] mt-0.5 flex flex-wrap gap-x-2" style={{ color: 'var(--text-muted)' }}>
              <span className="inline-flex items-center gap-1 font-medium"><Users size={12} /> {firstName(topTask.assigned_name)}</span>
              {topTask.entity_label && <span>· {topTask.entity_label}</span>}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button onClick={() => resolve(topTask)} className="inline-flex items-center gap-1.5 text-sm px-4 h-9 rounded-lg font-medium" style={{ background: 'var(--success-border)', color: '#fff' }}><Check size={15} /> Marcar como resolvida</button>
              <button onClick={() => setOpenTask(topTask)} className="inline-flex items-center gap-1.5 text-sm px-4 h-9 rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}><ExternalLink size={14} /> Abrir tarefa</button>
            </div>
          </div>
        )
      })()}

      {/* ── GARGALOS ── */}
      {gargalos.length > 0 && (
        <div className="ds-card p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <Flame size={15} style={{ color: 'var(--warning-border)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Gargalos detectados</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {gargalos.map(([label, n]) => (
              <span key={label} className="text-[12px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium" style={{ background: 'var(--warning-bg)', color: 'var(--warning-border)' }}>
                {label} <b>({n} atrasada{n > 1 ? 's' : ''})</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── EQUIPE HOJE ── */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Users size={16} style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Equipe hoje</span>
          <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· por criticidade</span>
        </div>
        <div className="space-y-1">
          {teamRows.map(m => {
            const crit = m.overdue.length > 0
            const ok = m.pending.length === 0
            return (
              <div key={m.id}>
                <button onClick={() => setSelectedMember(selectedMember === m.id ? null : m.id)} className="w-full ds-card p-2.5 flex items-center gap-2.5 text-left" style={{ borderLeft: `3px solid ${crit ? 'var(--danger-border)' : ok ? 'var(--success-border)' : 'var(--border)'}` }}>
                  <span className="text-[14px] font-semibold flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>{m.name}</span>
                  {ok ? (
                    <span className="text-[12px] inline-flex items-center gap-1 shrink-0" style={{ color: 'var(--success-border)' }}><Check size={13} /> em dia</span>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                      {m.overdue.length > 0 && <span className="px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--danger-bg)', color: 'var(--danger-border)' }}>{m.overdue.length} atrasada{m.overdue.length > 1 ? 's' : ''}</span>}
                      {m.today.length > 0 && <span className="px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--warning-bg)', color: 'var(--warning-border)' }}>{m.today.length} hoje</span>}
                      <span className="px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{m.pending.length} pendente{m.pending.length > 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {!ok && <ChevronDown size={14} className={`shrink-0 transition-transform ${selectedMember === m.id ? 'rotate-180' : ''}`} style={{ color: 'var(--text-light)' }} />}
                </button>
                {selectedMember === m.id && selectedRow && selectedRow.pending.length > 0 && (
                  <div className="mt-1 ml-3 pl-3 space-y-1 animate-[popIn_.15s_ease-out]" style={{ borderLeft: '2px solid var(--border)' }}>
                    {[...selectedRow.pending].sort((a, b) => score(b) - score(a)).map(t => {
                      const over = isOverdue(t); const td = isToday(t)
                      const sc = over ? 'var(--danger-border)' : td ? 'var(--warning-border)' : 'var(--text-light)'
                      return (
                        <div key={t.id} className="flex items-center gap-2 py-1">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sc }} />
                          <span className="text-[13px] flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>{t.title}</span>
                          {over && <span className="text-[10px] shrink-0" style={{ color: 'var(--danger-border)' }}>atrasada</span>}
                          {t.due_date && <span className="text-[11px] shrink-0" style={{ color: 'var(--text-light)' }}>{ddmm(t.due_date)}</span>}
                          <button onClick={() => resolve(t)} title="Marcar como resolvida" className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md" style={{ border: '1px solid var(--success-border)', color: 'var(--success-border)' }}><Check size={13} /></button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal "Abrir tarefa" (read-only) */}
      {openTask && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'var(--primary-soft)' }}>
              <ExternalLink size={17} style={{ color: 'var(--primary)' }} />
              <span className="text-sm font-bold flex-1" style={{ color: 'var(--primary)' }}>Tarefa da equipe</span>
              <button onClick={() => setOpenTask(null)} style={{ color: 'var(--primary)' }}><X size={16} /></button>
            </div>
            <div className="p-5 space-y-2.5">
              <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{openTask.title}</h2>
              {openTask.description && <p className="text-[13px] whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>{openTask.description}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                <span className="inline-flex items-center gap-1"><Users size={12} /> {firstName(openTask.assigned_name)}</span>
                {openTask.entity_label && <span>{openTask.entity_label}</span>}
                {openTask.due_date && <span style={{ color: isOverdue(openTask) ? 'var(--danger-border)' : 'var(--text-muted)' }}>{isOverdue(openTask) ? 'Atrasada · ' : ''}{ddmm(openTask.due_date)}{openTask.due_time ? ` • ${hm(openTask.due_time)}` : ''}</span>}
              </div>
            </div>
            <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setOpenTask(null)} className="text-sm px-4 py-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>Fechar</button>
              <button onClick={() => resolve(openTask)} className="inline-flex items-center gap-1.5 text-sm px-5 py-2 rounded-lg font-medium" style={{ background: 'var(--success-border)', color: '#fff' }}><Check size={15} /> Marcar como resolvida</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
