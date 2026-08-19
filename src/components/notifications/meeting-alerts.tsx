'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, MapPin, User, Video, BellOff, X } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { api } from '@/lib/api'
import { playChatSound } from '@/lib/chat-prefs'
import type { CalEvento } from './calendar-mini'

/**
 * Aviso de início de reunião (Meu Dia / global).
 *
 * Montado nos Providers → roda em qualquer tela enquanto o Minutor estiver aberto.
 * Observa os eventos da agenda Microsoft (`tipo === 'outlook'`) do dia e dispara um
 * pop-up em DOIS momentos por reunião: 5 min antes ("começa em 5 min") e no horário
 * de início ("está iniciando"). Além do modal in-app, emite uma notificação do
 * sistema (Notification API) quando a aba está em segundo plano.
 *
 * - `hora` vem do backend como "HH:MM" em horário de São Paulo (Graph com
 *   Prefer: America/Sao_Paulo). O navegador do usuário é SP, então o alvo é
 *   montado com componentes locais (new Date(y, mo-1, d, hh, mm)).
 * - O que já disparou fica em localStorage por dia → não repete ao recarregar.
 */

type AlertKind = 'pre' | 'start'

interface MeetingAlert {
  key: string          // `${data}T${hora}|${titulo}|${kind}` — estável por reunião+momento
  kind: AlertKind
  titulo: string
  hora: string
  horaFim?: string | null
  local?: string
  link?: string
  organizador?: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const PRE_MIN = 5                          // aviso antecipado
const CHECK_MS = 20_000                    // varredura do relógio
const GRACE_START_MS = 10 * 60_000         // "iniciando" ainda dispara se a app abriu até 10min depois
const SNOOZE_MS = 5 * 60_000

// ── persistência do que já disparou (por dia) ──────────────────────────────────
const firedStoreKey = (dayIso: string) => `minutor.meetingAlerts.${dayIso}`
function loadFired(dayIso: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    // limpa dias antigos pra não vazar localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('minutor.meetingAlerts.') && k !== firedStoreKey(dayIso)) localStorage.removeItem(k)
    }
    return new Set(JSON.parse(localStorage.getItem(firedStoreKey(dayIso)) || '[]'))
  } catch { return new Set() }
}
function persistFired(dayIso: string, set: Set<string>) {
  try { localStorage.setItem(firedStoreKey(dayIso), JSON.stringify([...set])) } catch { /* quota */ }
}

// ── alvo local (SP wall-clock) a partir de data "YYYY-MM-DD" + hora "HH:MM" ─────
function targetMs(dataIso: string, hora: string): number | null {
  const md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataIso)
  const mh = /^(\d{1,2}):(\d{2})/.exec(hora)
  if (!md || !mh) return null
  const d = new Date(Number(md[1]), Number(md[2]) - 1, Number(md[3]), Number(mh[1]), Number(mh[2]), 0, 0)
  const t = d.getTime()
  return Number.isFinite(t) ? t : null
}

function ensureNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission === 'default') { try { Notification.requestPermission() } catch { /* ignore */ } }
}

function fireSystemNotification(a: MeetingAlert) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return
  if (!document.hidden) return   // aba visível → o modal já basta
  try {
    const body = a.kind === 'pre'
      ? `Começa às ${a.hora}${a.organizador ? ` · ${a.organizador}` : ''}`
      : `Iniciando agora${a.local ? ` · ${a.local}` : ''}`
    const n = new Notification(a.kind === 'pre' ? `Reunião em ${PRE_MIN} min: ${a.titulo}` : `Reunião iniciando: ${a.titulo}`, {
      body, tag: a.key, icon: '/favicon-prod.svg',
    })
    n.onclick = () => { window.focus(); if (a.link) window.open(a.link, '_blank', 'noopener'); n.close() }
  } catch { /* ignore */ }
}

export function MeetingAlerts() {
  const { user } = useAuth()

  const today = new Date()
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const monthParam = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`

  const { data } = useQuery({
    queryKey: ['calendar-events', monthParam],
    queryFn: () => api.get<{ data: { eventos: CalEvento[] } }>(`/calendar/events?month=${monthParam}`).then(r => r.data?.eventos ?? []),
    enabled: !!user,
    refetchInterval: 180_000,   // 3 min — pega convites novos/movidos (BE auto-sync 10min)
    staleTime: 60_000,
  })

  const fired = useRef<Set<string>>(loadFired(todayIso))
  const snoozed = useRef<Map<string, number>>(new Map())   // key → timestamp em que pode redisparar
  const [queue, setQueue] = useState<MeetingAlert[]>([])

  useEffect(() => { if (user) ensureNotificationPermission() }, [user])

  const enqueue = useCallback((a: MeetingAlert) => {
    setQueue(prev => (prev.some(x => x.key === a.key) ? prev : [...prev, a]))
    playChatSound('alerta', 85)
    fireSystemNotification(a)
  }, [])

  // Relógio: a cada CHECK_MS avalia os eventos outlook de hoje e dispara na janela.
  useEffect(() => {
    if (!user) return
    const events = (data ?? []).filter(e => e.tipo === 'outlook' && e.data === todayIso && e.hora)

    const tick = () => {
      const now = Date.now()
      for (const e of events) {
        const startMs = targetMs(e.data, e.hora as string)
        if (startMs == null) continue
        const base: Omit<MeetingAlert, 'key' | 'kind'> = {
          titulo: e.titulo || 'Reunião', hora: e.hora as string, horaFim: e.hora_fim,
          local: e.local, link: e.link, organizador: e.organizador,
        }
        // 5 min antes — janela [start-5min, start)
        const preAt = startMs - PRE_MIN * 60_000
        const preKey = `${e.data}T${e.hora}|${e.titulo}|pre`
        if (now >= preAt && now < startMs && !fired.current.has(preKey)) {
          fired.current.add(preKey); persistFired(todayIso, fired.current)
          enqueue({ ...base, key: preKey, kind: 'pre' })
        }
        // no horário — janela [start, start+grace)
        const startKey = `${e.data}T${e.hora}|${e.titulo}|start`
        if (now >= startMs && now < startMs + GRACE_START_MS && !fired.current.has(startKey)) {
          fired.current.add(startKey); persistFired(todayIso, fired.current)
          enqueue({ ...base, key: startKey, kind: 'start' })
        }
        // soneca — redispara uma vez quando o timer estourar
        const sz = snoozed.current.get(startKey)
        if (sz != null && now >= sz) {
          snoozed.current.delete(startKey)
          enqueue({ ...base, key: startKey, kind: 'start' })
        }
      }
    }

    tick()
    const id = setInterval(tick, CHECK_MS)
    return () => clearInterval(id)
  }, [data, user, todayIso, enqueue])

  const dismiss = useCallback((key: string) => setQueue(prev => prev.filter(x => x.key !== key)), [])
  const snooze = useCallback((a: MeetingAlert) => {
    snoozed.current.set(a.key.replace(/\|(pre|start)$/, '|start'), Date.now() + SNOOZE_MS)
    dismiss(a.key)
  }, [dismiss])

  if (!queue.length) return null
  const a = queue[0]   // um por vez (fila)

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'color-mix(in srgb, #000 55%, transparent)' }}>
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200"
        style={{ background: 'var(--surface, var(--card, #16181d))', border: '1px solid var(--border, rgba(255,255,255,0.08))' }}
        role="alertdialog"
        aria-live="assertive"
      >
        {/* faixa/cabeçalho */}
        <div className="px-5 py-4 flex items-start gap-3" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
          <CalendarClock size={22} className="shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">
              {a.kind === 'pre' ? `Reunião em ${PRE_MIN} minutos` : 'Reunião iniciando agora'}
            </div>
            <div className="text-lg font-bold leading-tight mt-0.5 break-words">{a.titulo}</div>
          </div>
          <button onClick={() => dismiss(a.key)} className="shrink-0 p-1 rounded-md opacity-80 hover:opacity-100" aria-label="Fechar" style={{ color: 'var(--primary-fg)' }}>
            <X size={18} />
          </button>
        </div>

        {/* corpo */}
        <div className="px-5 py-4 space-y-2 text-sm" style={{ color: 'var(--text)' }}>
          <div className="flex items-center gap-2"><CalendarClock size={15} style={{ color: 'var(--text-muted)' }} /><span>{a.hora}{a.horaFim ? ` – ${a.horaFim}` : ''}</span></div>
          {a.organizador && <div className="flex items-center gap-2"><User size={15} style={{ color: 'var(--text-muted)' }} /><span className="truncate">{a.organizador}</span></div>}
          {a.local && <div className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }} /><span className="break-words">{a.local}</span></div>}
        </div>

        {/* ações */}
        <div className="px-5 pb-5 pt-1 flex flex-wrap gap-2 justify-end">
          <button
            onClick={() => snooze(a)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border, rgba(255,255,255,0.12))' }}
          >
            <BellOff size={15} /> Soneca 5 min
          </button>
          <button
            onClick={() => dismiss(a.key)}
            className="px-3 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'transparent', color: 'var(--text)', border: '1px solid var(--border, rgba(255,255,255,0.12))' }}
          >
            Dispensar
          </button>
          {a.link && (
            <button
              onClick={() => { window.open(a.link, '_blank', 'noopener'); dismiss(a.key) }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
            >
              <Video size={15} /> Entrar na reunião
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
