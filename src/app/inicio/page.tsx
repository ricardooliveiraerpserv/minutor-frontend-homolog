'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { AlertTriangle, Sun, Sunrise, Moon, ListChecks, Eye, Target, Check, Users, Bell, Home, Megaphone, Settings, Send, BookOpen, ShieldAlert, CalendarDays, BarChart3, Plus, Clock, MapPin, Link2, DollarSign, ChevronDown } from 'lucide-react'
import { TimesheetFormModal } from '@/components/ui/timesheet-form-modal'
import { ExpenseQuickModal } from '@/components/ui/expense-quick-modal'
import { DOT, type CalEvento } from '@/components/notifications/calendar-mini'
import { useAuth } from '@/hooks/use-auth'
import { TasksCard } from '@/components/notifications/tasks-card'
import { MinimizableHint } from '@/components/ui/minimizable-hint'
import { AgendaSidebar } from '@/components/notifications/agenda-sidebar'
import { TeamDay } from '@/components/notifications/team-day'
import { OutlookIntegrationCard } from '@/components/notifications/outlook-integration-card'
import { BirthdayCard } from '@/components/notifications/birthday-card'
import { PendingChatsCard } from '@/components/notifications/pending-chats-card'
import { NotificationCenter } from '@/components/notifications/notification-center'
import { PublicacoesView } from '@/components/notifications/publicacoes-view'
import { AcoesView } from '@/components/notifications/acoes-view'
import { NotificationAdmin } from '@/components/notifications/notification-admin'

interface Task {
  id: number; title: string; completed: boolean; due_date: string | null; due_time: string | null
  type: string; entity_label: string | null; recurrence_type: string; delegated: boolean
}
interface Pub { id: number; tipo: string; title: string; created_at: string | null }
const TIPO_PUB: Record<string, string> = { aviso: 'Aviso', formal: 'Comunicação', campanha: 'Campanha', marketing: 'Marketing' }
type TabKey = 'dia' | 'acoes' | 'tarefas' | 'publicacoes'

const pad = (n: number) => String(n).padStart(2, '0')
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const hm = (t: string) => t.slice(0, 5)
const plus1hHM = () => new Date(Date.now() + 3600000).toTimeString().slice(0, 5)
const isOverdueTask = (t: Task) => {
  if (t.completed || !t.due_date) return false
  if (t.due_date < todayStr()) return true
  if (t.due_date === todayStr() && t.due_time) return hm(t.due_time) < new Date().toTimeString().slice(0, 5)
  return false
}
const taskScore = (t: Task) => {
  let s = 0
  if (isOverdueTask(t)) s += 100
  if (t.due_date === todayStr()) s += 50
  if (t.delegated) s += 20
  if (t.due_time && t.due_date === todayStr() && hm(t.due_time) <= plus1hHM()) s += 30
  if (!t.due_date) s += 5
  if (t.recurrence_type && t.recurrence_type !== 'none') s += 10
  return s
}
const TYPE_L: Record<string, string> = { pessoal: 'Pessoal', cliente: 'Cliente', 'follow-up': 'Follow-up', interno: 'Interno' }

export default function MeuDiaPage() {
  const [tab, setTab] = useState<TabKey>('dia')
  const [pubMode, setPubMode] = useState<'recebidas' | 'mural' | 'criadas' | 'gerenciar' | 'lembretes'>('recebidas')
  const [pubAction, setPubAction] = useState<string | null>(null) // ação a abrir ao ir p/ Gerenciar
  const [pubMenuOpen, setPubMenuOpen] = useState(false)           // dropdown "Comunicação Interna"
  const [tasks, setTasks] = useState<Task[]>([])
  const [pubs, setPubs] = useState<Pub[]>([])
  const [actionsCount, setActionsCount] = useState(0)
  const [badges, setBadges] = useState({ overdue_tasks: 0, pending_tasks: 0, unread_notifications: 0, critical: false })
  const [eventsToday, setEventsToday] = useState(0)
  const [todayEvents, setTodayEvents] = useState<CalEvento[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [agendaKey, setAgendaKey] = useState(0)
  const [tasksKey, setTasksKey] = useState(0)
  const [view, setView] = useState<'mine' | 'team'>('mine')
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.type === 'admin'
  const canTeam = ['admin', 'coordenador', 'administrativo'].includes(user?.type ?? '')
  const canActions = ['consultor', 'coordenador', 'admin', 'administrativo', 'parceiro_admin'].includes(user?.type ?? '')
  const tasksRef = useRef<HTMLDivElement>(null)
  const [tsOpen, setTsOpen] = useState(false)     // modal apontar horas (mesmo da Operação)
  const [expOpen, setExpOpen] = useState(false)   // modal apontar despesa
  const agendaRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (user?.type === 'cliente') router.replace('/dashboard') }, [user?.type, router])

  const loadTasks = useCallback(() => {
    Promise.all([
      api.get<{ data: Task[] }>('/tasks?filter=mine').catch(() => ({ data: [] as Task[] })),
      api.get<{ data: Task[] }>('/tasks?filter=to_me').catch(() => ({ data: [] as Task[] })),
    ]).then(([a, b]) => {
      const map = new Map<number, Task>()
      ;(a.data ?? []).filter(t => !t.completed).forEach(t => map.set(t.id, t))
      ;(b.data ?? []).filter(t => !t.completed).forEach(t => map.set(t.id, { ...t, delegated: true }))
      setTasks([...map.values()])
    }).catch(() => {})
  }, [])

  const load = useCallback(() => {
    loadTasks()
    api.get<{ data: typeof badges }>('/me/badges').then(r => { if (r.data) setBadges(r.data) }).catch(() => {})
    api.get<{ data: Pub[] }>('/communications/mine').then(r => setPubs(r.data ?? [])).catch(() => {})
    api.get<{ data: { count: number }[] }>('/notifications/actions').then(r => setActionsCount((r.data ?? []).reduce((s, a) => s + (a.count || 0), 0))).catch(() => {})
    const d = new Date()
    api.get<{ data: { eventos: CalEvento[] } }>(`/calendar/events?month=${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
      .then(r => { const hoje = (r.data?.eventos ?? []).filter(e => e.data === todayStr()); setEventsToday(hoje.length); setTodayEvents(hoje) }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTasks])
  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [load])

  const concluir = async (t: Task) => {
    setTasks(p => p.filter(x => x.id !== t.id))
    try { await api.put(`/tasks/${t.id}`, { completed: true }); toast.success('Tarefa concluída ✓'); setTasksKey(k => k + 1) }
    catch { toast.error('Erro ao concluir'); loadTasks() }
  }

  const sortedTasks = [...tasks].sort((a, b) => taskScore(b) - taskScore(a))
  const topTask = sortedTasks[0] ?? null
  const overdue = tasks.filter(isOverdueTask).sort((a, b) => taskScore(b) - taskScore(a))
  const todayTasks = tasks.filter(t => !isOverdueTask(t) && t.due_date === todayStr())
  const pendingCount = tasks.length
  const relevant = tasks.filter(t => isOverdueTask(t) || t.due_date === todayStr())
  const foco = (() => {
    const byKey = new Map<string, Task[]>()
    relevant.forEach(t => { const k = t.entity_label || (TYPE_L[t.type] ?? t.type); if (k) byKey.set(k, [...(byKey.get(k) ?? []), t]) })
    if (!byKey.size) return null
    let best: { label: string; count: number; urgent: number } | null = null; let bestScore = -1
    for (const [label, arr] of byKey) {
      const s = arr.reduce((acc, t) => acc + taskScore(t), 0)
      if (s > bestScore) { bestScore = s; best = { label, count: arr.length, urgent: arr.filter(isOverdueTask).length } }
    }
    return best
  })()

  // Publicações de HOJE — aparecem como 1º item do Meu Dia; depois do dia, só na aba Publicações.
  const todayPubs = pubs.filter(p => (p.created_at ?? '').slice(0, 10) === todayStr())

  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const GreetIcon = hour < 12 ? Sunrise : hour < 18 ? Sun : Moon
  const firstName = (user?.name ?? '').trim().split(' ')[0]
  const scrollToTasks = () => tasksRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // Indicador de pendência por aba: número (quando >0) + ponto. Vermelho = ação/atraso; amarelo = hoje.
  const taskPending = overdue.length + todayTasks.length
  const TABS: { k: TabKey; label: string; icon: typeof Bell; badge?: number; badgeColor?: string }[] = [
    { k: 'dia', label: 'Meu Dia', icon: Home, badge: overdue.length, badgeColor: 'var(--danger-border)' },
    ...(canActions ? [{ k: 'acoes' as TabKey, label: 'Ações', icon: ShieldAlert, badge: actionsCount, badgeColor: 'var(--danger-border)' }] : []),
    { k: 'tarefas', label: 'Tarefas', icon: ListChecks, badge: taskPending, badgeColor: overdue.length ? 'var(--danger-border)' : 'var(--warning-border)' },
    { k: 'publicacoes', label: 'Publicações', icon: Megaphone },
  ]

  return (
    <AppLayout title="Meu Dia">
      <div className="space-y-4 max-w-6xl">
        {/* ── HEADER: saudação + foco ── */}
        <div className="ds-card p-4" style={{ background: 'linear-gradient(135deg, var(--primary-soft), transparent)' }}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
              <GreetIcon size={18} style={{ color: 'var(--primary)' }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{greet}{firstName ? `, ${firstName}` : ''} 👋</div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <h1 className="text-xl font-bold leading-tight" style={{ color: 'var(--text)' }}>Meu Dia</h1>
                {foco && <span className="text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><Target size={11} /> Foco: {foco.label} ({foco.urgent > 0 ? `${foco.urgent} urgente${foco.urgent > 1 ? 's' : ''}` : `${foco.count} tarefa${foco.count > 1 ? 's' : ''}`})</span>}
              </div>
            </div>
            {canActions && (
              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end shrink-0">
                <button onClick={() => setTsOpen(true)} className="ds-btn-primary inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"><Clock size={14} /> Apontar horas</button>
                <button onClick={() => setExpOpen(true)} className="ds-btn-secondary inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"><DollarSign size={14} /> Apontar despesa</button>
              </div>
            )}
          </div>
        </div>

        {/* ── ABAS ── */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1" style={{ borderBottom: '1px solid var(--border)' }}>
          {TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.k
            return (
              <button key={t.k} onClick={() => setTab(t.k)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg relative -mb-px"
                style={{ color: active ? 'var(--primary)' : 'var(--text-muted)', borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent' }}>
                <span className="relative">
                  <Icon size={15} />
                  {/* Ponto de pendência (ação/leitura) no ícone — visível mesmo sem olhar o número */}
                  {!!t.badge && t.badge > 0 && <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full" style={{ background: t.badgeColor, boxShadow: '0 0 0 2px var(--bg)' }} />}
                </span>
                {t.label}
                {!!t.badge && t.badge > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none" style={{ background: t.badgeColor, color: '#fff', minWidth: 16, textAlign: 'center' }}>{t.badge > 99 ? '99+' : t.badge}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* ════════ MEU DIA — HUB DE AÇÃO (Próxima ação + Para resolver + tarefas + calendário) ════════ */}
        {tab === 'dia' && (
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            <div className="w-full lg:w-[68%] space-y-5 min-w-0">
              {/* CONVERSAS PENDENTES DO CHAT — substitui o e-mail de digest */}
              <PendingChatsCard />
              {/* PUBLICAÇÕES DE HOJE — 1º item (só no dia; depois fica na aba Publicações) */}
              {view === 'mine' && todayPubs.length > 0 && (
                <button onClick={() => setTab('publicacoes')} className="w-full ds-card p-3 text-left flex items-start gap-2.5 animate-[popIn_.2s_ease-out]" style={{ borderLeft: '4px solid var(--primary)', background: 'var(--primary-soft)' }}>
                  <Megaphone size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold" style={{ color: 'var(--primary)' }}>Publicação{todayPubs.length > 1 ? 'ões' : ''} de hoje{todayPubs.length > 1 ? ` · ${todayPubs.length}` : ''}</div>
                    {todayPubs.slice(0, 3).map(p => (
                      <div key={p.id} className="text-[13px] mt-0.5 truncate" style={{ color: 'var(--text)' }}>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full mr-1.5" style={{ background: 'var(--surface)', color: 'var(--primary)' }}>{TIPO_PUB[p.tipo] ?? p.tipo}</span>{p.title}
                      </div>
                    ))}
                    {todayPubs.length > 3 && <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>+ {todayPubs.length - 3} outra(s)</div>}
                  </div>
                  <span className="text-[11px] inline-flex items-center gap-1 shrink-0 mt-0.5" style={{ color: 'var(--primary)' }}>Ver <Eye size={12} /></span>
                </button>
              )}
              {canTeam && (
                <div className="flex justify-end">
                  <div className="inline-flex rounded-lg p-0.5" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                    {(['mine', 'team'] as const).map(v => (
                      <button key={v} onClick={() => setView(v)} className="text-xs px-3 py-1 rounded-md font-medium inline-flex items-center gap-1.5"
                        style={{ background: view === v ? 'var(--surface)' : 'transparent', color: view === v ? 'var(--primary)' : 'var(--text-muted)' }}>
                        {v === 'mine' ? <><ListChecks size={13} /> Minhas tarefas</> : <><Users size={13} /> Equipe</>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {view === 'team' ? <TeamDay /> : <>
                {/* PRÓXIMA AÇÃO */}
                {topTask && (() => {
                  const over = isOverdueTask(topTask)
                  const isToday = !over && topTask.due_date === todayStr()
                  const sc = over ? 'var(--danger-border)' : isToday ? 'var(--warning-border)' : 'var(--text-muted)'
                  const status = over
                    ? `Atrasada desde ${topTask.due_date ? ddmm(topTask.due_date) : ''}${topTask.due_time ? ` • ${hm(topTask.due_time)}` : ''}`
                    : isToday ? `Hoje${topTask.due_time ? ` • ${hm(topTask.due_time)}` : ''}`
                    : topTask.due_date ? ddmm(topTask.due_date) : 'Sem data definida'
                  return (
                    <div key={topTask.id} onClick={scrollToTasks} className="ds-card p-5 cursor-pointer animate-[popIn_.2s_ease-out]"
                      style={{ borderLeft: `5px solid ${sc}`, background: over ? 'var(--danger-bg)' : 'var(--surface)', boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                      <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: sc }}>Próxima ação</div>
                      <div className="text-[20px] font-bold leading-tight" style={{ color: 'var(--text)' }}>{topTask.title}</div>
                      <div className="text-[13px] font-semibold mt-1 inline-flex items-center gap-1" style={{ color: sc }}>{over && <AlertTriangle size={13} />}{status}</div>
                      {topTask.entity_label && <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{topTask.entity_label}</div>}
                      <div className="flex items-center gap-2 mt-3">
                        <button onClick={e => { e.stopPropagation(); concluir(topTask) }} className="inline-flex items-center gap-1.5 text-sm px-4 h-9 rounded-lg font-medium" style={{ background: 'var(--success-border)', color: '#fff' }}><Check size={15} /> Concluir agora</button>
                        <button onClick={e => { e.stopPropagation(); scrollToTasks() }} className="inline-flex items-center gap-1.5 text-sm px-4 h-9 rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}><Eye size={14} /> Ver detalhes</button>
                      </div>
                    </div>
                  )
                })()}

                {/* PARA RESOLVER — aprovações + leitura obrigatória + botões de decisão + ações */}
                <NotificationCenter />

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>
                  <Stat n={pendingCount} label="pendente(s)" onClick={scrollToTasks} />
                  <Stat n={overdue.length} label="atrasada(s)" danger onClick={scrollToTasks} />
                  <Stat n={eventsToday} label="evento(s) hoje" />
                </div>

                {/* EVENTOS DE HOJE — trazidos do calendário (agenda) p/ a tela principal */}
                {todayEvents.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <CalendarDays size={16} style={{ color: 'var(--primary)' }} />
                      <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Eventos de hoje</span>
                      <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· {todayEvents.length}</span>
                    </div>
                    {todayEvents.map((e, i) => {
                      const d = DOT[e.tipo]
                      const conv = e.convidados ?? []
                      const grupos = ([
                        ['Aceitaram', conv.filter(c => c.resposta === 'accepted')],
                        ['Talvez', conv.filter(c => c.resposta === 'tentativelyAccepted')],
                        ['Recusaram', conv.filter(c => c.resposta === 'declined')],
                        ['Sem resposta', conv.filter(c => !['accepted', 'tentativelyAccepted', 'declined'].includes(c.resposta))],
                      ] as [string, typeof conv][]).filter(([, l]) => l.length > 0)
                      const isTeams = !!e.link && e.link.includes('teams.microsoft.com')
                      return (
                        <div key={i} className="ds-card p-2.5" style={{ borderLeft: `3px solid ${d?.color ?? 'var(--primary)'}` }}>
                          <div className="flex items-center gap-2.5">
                            <span className="shrink-0 text-[15px]">{d?.icon ?? '📅'}</span>
                            <span className="flex-1 min-w-0 truncate text-[13px] font-medium" style={{ color: 'var(--text)' }}>{e.titulo}</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'var(--surface-sunken)', color: d?.color ?? 'var(--text-muted)' }}>{d?.label ?? e.tipo}</span>
                          </div>
                          {e.tipo === 'outlook' && (e.hora || e.local || e.link || conv.length > 0) && (
                            <div className="mt-1.5 ml-[26px] space-y-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                              {e.hora && <div className="flex items-center gap-1.5"><Clock size={11} className="shrink-0" /> <span>{e.hora}{e.hora_fim ? ` – ${e.hora_fim}` : ''}{e.organizador ? ` · por ${e.organizador}` : ''}</span></div>}
                              {e.local && <div className="flex items-start gap-1.5"><MapPin size={11} className="mt-[2px] shrink-0" /> <span>{e.local}</span></div>}
                              {e.link && <a href={e.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium" style={{ color: 'var(--primary)' }}><Link2 size={11} className="shrink-0" /> {isTeams ? 'Ingressar no Teams' : 'Abrir convite'}</a>}
                              {grupos.length > 0 && (
                                <div className="flex items-start gap-1.5">
                                  <Users size={11} className="mt-[2px] shrink-0" />
                                  <div className="space-y-0.5">
                                    {grupos.map(([label, lista]) => (
                                      <div key={label}><span style={{ color: 'var(--text-light)' }}>{label} ({lista.length}):</span> {lista.map(c => c.nome).join(', ')}</div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* PARA FAZER HOJE — só vencidas + de hoje (gestão completa fica na aba Tarefas) */}
                <div ref={tasksRef} className="space-y-1.5 scroll-mt-4">
                  <div className="flex items-center gap-2">
                    <ListChecks size={16} style={{ color: 'var(--primary)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Para fazer hoje</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>· vencidas e de hoje</span>
                    <button onClick={() => setTab('tarefas')} className="ml-auto text-[11px] inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}>Todas as tarefas <Eye size={12} /></button>
                  </div>
                  {[...overdue, ...todayTasks].length === 0 ? (
                    <div className="ds-card p-4 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>Nada vencendo hoje. 🎉</div>
                  ) : [...overdue, ...todayTasks].map(t => {
                    const over = isOverdueTask(t)
                    return (
                      <div key={t.id} className="ds-card p-2.5 flex items-center gap-2.5" style={{ borderLeft: `3px solid ${over ? 'var(--danger-border)' : 'var(--warning-border)'}` }}>
                        <button onClick={() => concluir(t)} title="Concluir" className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center" style={{ border: '1.5px solid var(--success-border)', color: 'var(--success-border)' }}><Check size={12} /></button>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium truncate" style={{ color: 'var(--text)' }}>{t.title}</div>
                          <div className="text-[11px]" style={{ color: over ? 'var(--danger-border)' : 'var(--text-muted)' }}>
                            {over ? `Atrasada${t.due_date ? ` desde ${ddmm(t.due_date)}` : ''}` : 'Hoje'}{t.due_time ? ` • ${hm(t.due_time)}` : ''}{t.entity_label ? ` · ${t.entity_label}` : ''}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>}
            </div>

            {/* Coluna direita: calendário (mantido) + aniversários */}
            {view === 'mine' && (
              <div ref={agendaRef} className="w-full lg:w-[32%] lg:shrink-0 space-y-4 lg:sticky lg:top-4 lg:self-start scroll-mt-4">
                <BirthdayCard />
                <AgendaSidebar key={agendaKey} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
                <OutlookIntegrationCard onChange={() => setAgendaKey(k => k + 1)} />
              </div>
            )}
          </div>
        )}

        {/* ════════ AÇÕES — pendências do perfil (persistem até resolver) ════════ */}
        {tab === 'acoes' && canActions && <AcoesView isAdmin={isAdmin} />}

        {/* ════════ TAREFAS ════════ */}
        {tab === 'tarefas' && (
          <div className="max-w-4xl">
            <MinimizableHint storageKey="hint:rotina-x-tarefa" title="Rotina × Tarefa — qual a diferença?">
              <p><b style={{ color: 'var(--text)' }}>Tarefa</b> é um item de trabalho <b>pontual</b>, atribuído a alguém, com prazo e conclusão (feito/não feito).</p>
              <p><b style={{ color: 'var(--text)' }}>Rotina</b> é um <b>checklist recorrente para uma equipe</b>: ela <b>gera tarefas automaticamente</b> (diária/semanal/mensal) e acompanha quem cumpriu. A rotina não é feita direto — ela <b>vira tarefas</b>.</p>
            </MinimizableHint>
            <TasksCard key={`full-${tasksKey}`} onChanged={loadTasks} />
          </div>
        )}

        {/* ════════ PUBLICAÇÕES — recebidas + gerenciar/publicar (admin) ════════ */}
        {tab === 'publicacoes' && (
          <div className="space-y-3 max-w-4xl">
            <MinimizableHint storageKey="hint:publicacoes" title="Publicações — o que é cada botão e suas variações">
              <p><b style={{ color: 'var(--text)' }}>Abas:</b> <b>Recebidas</b> = as que chegaram pra você · <b>Mural</b> = tudo que você pode ler · <b>Criadas</b> = as que você publicou · <b>Gerenciar/Publicar</b> = administração (admin).</p>
              {isAdmin && <>
                <p><b style={{ color: 'var(--text)' }}>Comunicação Interna</b> — menu com <b>Confirmar presença</b>, <b>Nova enquete</b> e <b>Novo Aviso</b> (publicação para o time). <b>Variações do Novo Aviso:</b></p>
                <p className="pl-3">• <b>Aviso</b> — exige <b>"Confirmar leitura"</b> e registra quem leu (log). Se a mensagem for longa, o botão só libera após <b>rolar até o fim</b>.</p>
                <p className="pl-3">• <b>Ação (com botão)</b> — inclui um <b>botão-link (CTA)</b> com texto + rota. Pode ainda ter <b>"Botões de decisão"</b> (ex.: "Confirmo"/"Não vou") que exigem resposta e geram log de quem clicou.</p>
                <p><b style={{ color: 'var(--text)' }}>Confirmar presença</b> — atalho que já cria uma notificação com botões de decisão (registra quem confirmou).</p>
                <p><b style={{ color: 'var(--text)' }}>Nova enquete</b> — votação com opções; resultados consolidados.</p>
                <p><b style={{ color: 'var(--text)' }}>Comunicação com cliente</b> — aviso/comunicado para <b>clientes</b> (Central de Comunicação).</p>
              </>}
            </MinimizableHint>
            <div className="inline-flex rounded-lg p-0.5 flex-wrap" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
              {([
                ['recebidas', 'Recebidas', Megaphone],
                ['mural', 'Mural', BookOpen],
                ...(canTeam ? [['criadas', 'Criadas', Send], ['gerenciar', 'Gerenciar / Publicar', Settings]] : []),
              ] as ['recebidas' | 'mural' | 'criadas' | 'gerenciar', string, typeof Megaphone][]).map(([m, l, Ic]) => (
                <button key={m} onClick={() => setPubMode(m)} className="text-xs px-3 py-1 rounded-md font-medium inline-flex items-center gap-1.5"
                  style={{ background: pubMode === m ? 'var(--surface)' : 'transparent', color: pubMode === m ? 'var(--primary)' : 'var(--text-muted)' }}>
                  <Ic size={13} /> {l}
                </button>
              ))}
            </div>
            {/* Ações rápidas (admin/coordenador/administrativo) — fora do Gerenciar, abrem o fluxo direto */}
            {canTeam && pubMode !== 'gerenciar' && (
              <div className="flex items-center gap-2 flex-wrap">
                {/* Externo: comunicação com cliente (fica separado) */}
                <button onClick={() => { setPubAction('comm'); setPubMode('gerenciar') }} className="ds-btn-secondary inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"><Megaphone size={14} /> Comunicação com cliente</button>
                {/* Interno: Confirmar presença + Nova enquete + Novo Aviso, agrupados num dropdown */}
                <div className="relative">
                  <button onClick={() => setPubMenuOpen(o => !o)} className="ds-btn-primary inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"><Send size={14} /> Comunicação Interna <ChevronDown size={13} /></button>
                  {pubMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-[60]" onClick={() => setPubMenuOpen(false)} />
                      <div className="absolute left-0 top-full mt-1 z-[61] rounded-lg p-1 shadow-xl min-w-[210px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        {([
                          ['presence', 'Confirmar presença', CalendarDays],
                          ['poll', 'Nova enquete', BarChart3],
                          ['new', 'Novo Aviso', Plus],
                        ] as [string, string, typeof Megaphone][]).map(([a, l, Ic]) => (
                          <button key={a} onClick={() => { setPubAction(a); setPubMode('gerenciar'); setPubMenuOpen(false) }} className="w-full text-left text-[12px] px-2.5 py-2 rounded-md inline-flex items-center gap-2 ds-row-hover" style={{ color: 'var(--text)' }}><Ic size={13} style={{ color: 'var(--primary)' }} /> {l}</button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            {pubMode === 'mural' ? <PublicacoesView scope="feed" />
              : canTeam && pubMode === 'criadas' ? <PublicacoesView scope="all" />
              : canTeam && pubMode === 'gerenciar' ? <NotificationAdmin onChanged={load} initialAction={pubAction} onActionConsumed={() => setPubAction(null)} />
              : <PublicacoesView scope="mine" />}
          </div>
        )}
      </div>

      <TimesheetFormModal open={tsOpen} onClose={() => setTsOpen(false)} onSaved={() => { setTsOpen(false); load() }} currentUser={user} />
      <ExpenseQuickModal open={expOpen} onClose={() => setExpOpen(false)} onSaved={() => { setExpOpen(false); load() }} currentUser={user} />
    </AppLayout>
  )
}

function Stat({ n, label, danger, onClick }: { n: number; label: string; danger?: boolean; onClick?: () => void }) {
  const color = danger && n > 0 ? 'var(--danger-border)' : 'var(--text)'
  return (
    <span className={`inline-flex items-baseline gap-1 ${onClick ? 'cursor-pointer hover:underline' : ''}`} onClick={onClick}>
      <b style={{ color, fontSize: 15 }}>{n}</b>
      <span style={{ color: danger && n > 0 ? 'var(--danger-border)' : 'var(--text-muted)' }}>{label}</span>
    </span>
  )
}
