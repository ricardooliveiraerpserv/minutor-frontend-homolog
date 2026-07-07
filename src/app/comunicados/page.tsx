'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import {
  Megaphone, ChevronDown, ChevronLeft, ChevronRight, CalendarDays,
  CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { sanitizeRich } from '@/lib/sanitize-html'

interface Comunicado {
  id: number
  tipo: string
  prioridade: 'urgente' | 'importante' | 'informativo'
  badge: string | null
  title: string
  message: string
  sent_by: string | null
  read: boolean
  requires_ack: boolean
  acknowledged: boolean
  expires_at: string | null
  event_at: string | null
  created_at: string | null
}

const dtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
const dtShort = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

const needsAction = (c: Comunicado) => (c.requires_ack && !c.acknowledged) || (c.prioridade === 'urgente' && !c.read)

// Prioridade (indicador leve): 🔴 urgente · 🟡 importante · 🔵 informativo.
function prioMeta(c: Comunicado): { color: string; label: string } {
  if (c.prioridade === 'urgente') return { color: 'var(--danger-border)', label: 'Urgente' }
  if (c.prioridade === 'importante') return { color: 'var(--warning-border)', label: 'Importante' }
  return { color: 'var(--primary)', label: 'Informativo' }
}
// Status (badge discreto): Requer ação · Não lido · Lido.
function statusMeta(c: Comunicado): { label: string; color: string; bg: string } | null {
  if (c.requires_ack && !c.acknowledged) return { label: 'Requer ação', color: 'var(--warning-border)', bg: 'var(--warning-bg)' }
  if (!c.read) return { label: 'Não lido', color: 'var(--primary)', bg: 'var(--primary-soft)' }
  return null // lido → sem badge (discreto)
}

export default function ComunicadosPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const [rows, setRows] = useState<Comunicado[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [holidays, setHolidays] = useState<{ data: string; titulo: string }[]>([])

  useEffect(() => { if (user && user.type !== 'cliente') router.replace('/inicio') }, [user, router])

  useEffect(() => {
    if (!resolvedTheme) return
    const theme = resolvedTheme === 'dark' ? 'dark' : 'light'
    api.get<{ data: Comunicado[] }>(`/communications/mine?theme=${theme}`)
      .then(r => setRows(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [resolvedTheme])

  // Feriados do mês exibido — mesma fonte/cor dos outros perfis (/calendar/events → tipo holiday).
  useEffect(() => {
    const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
    api.get<{ data: { eventos: { tipo: string; data: string; titulo: string }[] } }>(`/calendar/events?month=${ym}`)
      .then(r => setHolidays((r.data?.eventos ?? []).filter(e => e.tipo === 'holiday').map(e => ({ data: e.data, titulo: e.titulo }))))
      .catch(() => setHolidays([]))
  }, [cursor])

  const markRead = (id: number) => {
    setRows(rs => rs.map(c => c.id === id ? { ...c, read: true } : c))
    api.post('/communications/mark-read', { ids: [id] }).catch(() => {})
  }
  const ack = async (id: number) => {
    setBusy(id)
    try { await api.post('/communications/ack', { id }); setRows(rs => rs.map(c => c.id === id ? { ...c, read: true, acknowledged: true } : c)) }
    catch { /* noop */ } finally { setBusy(null) }
  }
  const toggle = (c: Comunicado) => {
    const next = open === c.id ? null : c.id
    setOpen(next)
    if (next === c.id && !c.read) markRead(c.id)
  }
  const jumpTo = (id: number) => {
    setOpen(id)
    const c = rows.find(x => x.id === id); if (c && !c.read) markRead(id)
    setTimeout(() => document.getElementById(`com-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  }

  // Destaque ÚNICO e CONDICIONAL: só existe se houver item crítico (ação/urgente).
  const actions = useMemo(() => {
    // "O que depende de mim?" → o que EXIGE confirmação vem antes do urgente informativo.
    const rank = (c: Comunicado) => (c.requires_ack && !c.acknowledged ? 100 : 0) + (c.prioridade === 'urgente' ? 50 : 0)
    return rows.filter(needsAction).sort((a, b) => rank(b) - rank(a) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  }, [rows])
  const hero = actions[0] ?? null

  // Lista única: tudo que não é o destaque; pendências/ação primeiro, depois recentes.
  const lista = useMemo(() =>
    rows.filter(c => c.id !== hero?.id).sort((a, b) =>
      Number(needsAction(b)) - Number(needsAction(a)) || Number(a.read) - Number(b.read) || (b.created_at ?? '').localeCompare(a.created_at ?? '')),
  [rows, hero])
  const listaVisible = showAll ? lista : lista.slice(0, 5)

  const events = useMemo(() => rows.filter(c => c.event_at).map(c => ({ date: new Date(c.event_at!), c })), [rows])

  // Contador do topo.
  const pend = useMemo(() => rows.filter(c => !c.read).length, [rows])
  const acao = useMemo(() => rows.filter(c => c.requires_ack && !c.acknowledged).length, [rows])

  return (
    <AppLayout title="Central de Comunicação">
      <div className="space-y-4 max-w-6xl">
        <div>
          <div className="flex items-center gap-2.5">
            <Megaphone size={20} style={{ color: 'var(--text-muted)' }} />
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Central de Comunicação</h1>
          </div>
          {!loading && rows.length > 0 && (
            <p className="text-xs mt-1 ml-[30px]" style={{ color: 'var(--text-muted)' }}>
              {pend > 0
                ? <>{pend} pendente{pend > 1 ? 's' : ''}{acao > 0 && <> · <span style={{ color: 'var(--warning-border)', fontWeight: 600 }}>{acao} requer{acao > 1 ? 'em' : ''} ação</span></>}</>
                : 'Tudo em dia — nenhum comunicado pendente'}
            </p>
          )}
        </div>

        {loading ? (
          <div className="text-sm" style={{ color: 'var(--text-light)' }}>Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="ds-card p-10 text-center max-w-lg">
            <CheckCircle2 size={34} className="mx-auto mb-3" style={{ color: 'var(--text-light)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Nenhum comunicado recente</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-light)' }}>Você será notificado aqui quando houver atualizações importantes.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            <div className="lg:col-span-2 space-y-3">
              {/* Destaque único condicional */}
              {hero && <Hero c={hero} onOpen={() => jumpTo(hero.id)} onAck={() => ack(hero.id)} busy={busy === hero.id} />}

              {/* Lista com prioridade + status */}
              {lista.length > 0 && (
                <div className="space-y-2">
                  {listaVisible.map(c => <Row key={c.id} c={c} open={open === c.id} onToggle={() => toggle(c)} onAck={() => ack(c.id)} busy={busy === c.id} />)}
                  {lista.length > 5 && (
                    <button onClick={() => setShowAll(s => !s)} className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      {showAll ? 'Mostrar menos' : `Ver todos (${lista.length})`}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Agenda (suporte) — clique no dia expande o comunicado na lista */}
            <div className="lg:sticky lg:top-4">
              <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-light)' }}>Agenda</p>
              <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <ImpactCalendar events={events} holidays={holidays} cursor={cursor} setCursor={setCursor} onPick={jumpTo} />
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .comunicado-body img { max-width: 100%; height: auto; border-radius: 8px; }
        .comunicado-body a { color: var(--primary); text-decoration: underline; }
        .comunicado-body p { margin: 0 0 .6em; line-height: 1.55; }
        .comunicado-body ul, .comunicado-body ol { padding-left: 1.4em; margin: 0 0 .6em; }
      `}</style>
    </AppLayout>
  )
}

/** Destaque único — card simples (sem exagero), só quando há item crítico. */
function Hero({ c, onOpen, onAck, busy }: { c: Comunicado; onOpen: () => void; onAck: () => void; busy: boolean }) {
  const prio = prioMeta(c)
  const needsAck = c.requires_ack && !c.acknowledged
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${prio.color}` }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <AlertTriangle size={14} style={{ color: prio.color }} />
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: prio.color }}>{needsAck ? 'Requer sua ação' : prio.label}</span>
      </div>
      <button onClick={onOpen} className="block text-left w-full">
        <p className="text-base font-bold" style={{ color: 'var(--text)' }}>{c.title}</p>
        {c.event_at && <p className="text-xs mt-1 inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><CalendarDays size={12} /> {dtShort(c.event_at)}</p>}
      </button>
      <div className="flex items-center gap-2 mt-3">
        <button onClick={onOpen} className="ds-btn-secondary text-xs px-3 py-1.5 rounded-lg">Ler comunicado</button>
        {needsAck && (
          <button onClick={onAck} disabled={busy} className="ds-btn-primary text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1">
            <CheckCircle2 size={13} /> {busy ? 'Confirmando…' : 'Confirmar recebimento'}
          </button>
        )}
      </div>
    </div>
  )
}

/** Linha da lista: bolinha de prioridade + título + badge de status (discreto). */
function Row({ c, open, onToggle, onAck, busy }: { c: Comunicado; open: boolean; onToggle: () => void; onAck: () => void; busy: boolean }) {
  const prio = prioMeta(c)
  const status = statusMeta(c)
  const needsAck = c.requires_ack && !c.acknowledged
  return (
    <div id={`com-${c.id}`} className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <button onClick={onToggle} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: prio.color }} title={prio.label} />
        {c.prioridade === 'urgente' && <span className="text-[10px] font-bold shrink-0" style={{ color: prio.color }}>Urgente</span>}
        <span className="flex-1 text-sm truncate" style={{ color: 'var(--text)', fontWeight: c.read ? 400 : 600 }}>{c.title}</span>
        {c.event_at && <span className="text-[11px] shrink-0 hidden sm:inline-flex items-center gap-1" style={{ color: 'var(--text-light)' }}><CalendarDays size={11} /> {dtShort(c.event_at)}</span>}
        {status && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: status.bg, color: status.color }}>{status.label}</span>}
        <ChevronDown size={15} className="shrink-0 transition-transform" style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="comunicado-body text-sm" style={{ color: 'var(--text)' }} dangerouslySetInnerHTML={{ __html: sanitizeRich(c.message) }} />
          <div className="mt-3 pt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="text-[11px] flex flex-wrap gap-x-4 gap-y-1" style={{ color: 'var(--text-light)' }}>
              {c.sent_by && <span>Enviado por {c.sent_by}</span>}
              {c.created_at && <span>{dtDate(c.created_at)}</span>}
              {c.event_at && <span className="inline-flex items-center gap-1"><CalendarDays size={11} /> {dtShort(c.event_at)}</span>}
            </div>
            {needsAck && (
              <button onClick={onAck} disabled={busy} className="ds-btn-primary text-xs px-3 py-1.5 rounded-lg ml-auto inline-flex items-center gap-1">
                <CheckCircle2 size={13} /> {busy ? 'Confirmando…' : 'Confirmar recebimento'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const HOLIDAY_COLOR = '#f97316' // mesma cor de feriado dos outros perfis (calendar-mini)

/** Calendário como suporte: comunicados datados + feriados; clicar no dia expande o comunicado. */
function ImpactCalendar({ events, holidays, cursor, setCursor, onPick }: { events: { date: Date; c: Comunicado }[]; holidays: { data: string; titulo: string }[]; cursor: Date; setCursor: (d: Date) => void; onPick: (id: number) => void }) {
  const y = cursor.getFullYear(), m = cursor.getMonth()
  const startWeekday = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const today = startOfDay(new Date())

  const byDay = new Map<number, Comunicado[]>()
  events.filter(e => e.date.getFullYear() === y && e.date.getMonth() === m).forEach(e => {
    const d = e.date.getDate(); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d)!.push(e.c)
  })
  const holByDay = new Map<number, string>()
  holidays.forEach(h => { const [hy, hm, hd] = h.data.split('-').map(Number); if (hy === y && hm === m + 1) holByDay.set(hd, h.titulo) })
  const cells: (number | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setCursor(new Date(y, m - 1, 1))} className="p-1 rounded hover:bg-[var(--surface-hover)]"><ChevronLeft size={14} style={{ color: 'var(--text-light)' }} /></button>
        <span className="text-[11px] font-semibold capitalize" style={{ color: 'var(--text-muted)' }}>{cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
        <button onClick={() => setCursor(new Date(y, m + 1, 1))} className="p-1 rounded hover:bg-[var(--surface-hover)]"><ChevronRight size={14} style={{ color: 'var(--text-light)' }} /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <span key={i} className="text-[9px] py-1" style={{ color: 'var(--text-light)' }}>{d}</span>)}
        {cells.map((day, i) => {
          if (day === null) return <span key={i} />
          const items = byDay.get(day)
          const hol = holByDay.get(day)
          const marked = !!items || !!hol
          const isToday = today.getFullYear() === y && today.getMonth() === m && today.getDate() === day
          const accent = items ? prioMeta(items[0]).color : null
          const tip = [...(items?.map(c => `${dtShort(c.event_at)} · ${c.title}`) ?? []), ...(hol ? [`🏖️ ${hol}`] : [])].join('\n') || undefined
          return (
            <button
              key={i} onClick={() => items && onPick(items[0].id)} disabled={!items}
              className="aspect-square rounded-md flex flex-col items-center justify-center text-[11px]"
              style={{ fontWeight: marked ? 600 : 400, background: isToday ? 'var(--surface-hover)' : 'transparent', cursor: items ? 'pointer' : 'default' }}
              title={tip}
            >
              <span style={{ color: marked ? 'var(--text)' : 'var(--text-light)' }}>{day}</span>
              <span className="flex gap-0.5 mt-0.5 h-1 items-center justify-center">
                {items && <span className="w-1 h-1 rounded-full" style={{ background: accent! }} />}
                {hol && <span className="w-1 h-1 rounded-full" style={{ background: HOLIDAY_COLOR }} />}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
