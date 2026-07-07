'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { CalendarDays, X, Clock, MapPin, Link2, Settings } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { CalendarMini, DOT, type CalEvento, type CalEventoConvidado } from './calendar-mini'

interface VisConfig { visibility: Record<string, string[]>; types: Record<string, string>; profiles: Record<string, string> }

const pad = (n: number) => String(n).padStart(2, '0')
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const MAX_VISIBLE = 5

/**
 * Coluna direita da Central: calendário compacto + eventos do dia/mês.
 * `selectedDate`/`onSelectDate` são controlados pela página (integra com a lista de notificações).
 */
export function AgendaSidebar({ selectedDate, onSelectDate }: { selectedDate: string | null; onSelectDate: (iso: string | null) => void }) {
  const today = new Date()
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)   // 1-12
  const [monthLabel, setMonthLabel] = useState('')
  const [events, setEvents] = useState<CalEvento[]>([])
  const [showAll, setShowAll] = useState(false)
  const [modalDate, setModalDate] = useState<string | null>(null)   // dia clicado no calendário → pop-up de detalhes
  const { user } = useAuth()
  const isAdmin = user?.type === 'admin'
  const [cfgOpen, setCfgOpen] = useState(false)
  const [cfg, setCfg] = useState<VisConfig | null>(null)
  const [savingCfg, setSavingCfg] = useState(false)

  const openCfg = () => { setCfgOpen(true); api.get<{ data: VisConfig }>('/calendar/visibility').then(r => setCfg(r.data ?? null)).catch(() => toast.error('Erro ao carregar config')) }
  const toggleCfg = (tipo: string, perfil: string) => setCfg(c => {
    if (!c) return c
    const cur = c.visibility[tipo] ?? []
    return { ...c, visibility: { ...c.visibility, [tipo]: cur.includes(perfil) ? cur.filter(p => p !== perfil) : [...cur, perfil] } }
  })
  const saveCfg = async () => {
    if (!cfg) return
    setSavingCfg(true)
    try { await api.put('/calendar/visibility', { visibility: cfg.visibility }); toast.success('Visibilidade salva ✓'); setCfgOpen(false); load(year, month) }
    catch { toast.error('Erro ao salvar') }
    finally { setSavingCfg(false) }
  }

  const load = useCallback((y: number, m: number) => {
    api.get<{ data: { eventos: CalEvento[]; mes: string } }>(`/calendar/events?month=${y}-${pad(m)}`)
      .then(r => { setEvents(r.data?.eventos ?? []); setMonthLabel(r.data?.mes ?? '') })
      .catch(() => {})
  }, [])
  useEffect(() => { load(year, month) }, [load, year, month])

  const shift = (delta: number) => {
    onSelectDate(null)
    const d = new Date(year, month - 1 + delta, 1)
    setYear(d.getFullYear()); setMonth(d.getMonth() + 1)
  }

  // Lista exibida: dia selecionado ou todos do mês (já ordenados por data pelo backend).
  // Sem dia selecionado: só os PRÓXIMOS (hoje em diante). Com dia: os daquele dia.
  const full = selectedDate ? events.filter(e => e.data === selectedDate) : events.filter(e => e.data >= todayIso)
  const list = showAll ? full : full.slice(0, MAX_VISIBLE)
  const hidden = full.length - list.length

  return (
    <div className="ds-card p-3 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarDays size={15} style={{ color: 'var(--primary)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Agenda</span>
        {isAdmin && <button onClick={openCfg} className="ml-auto p-1 rounded-md" title="Configurar o que cada perfil vê na agenda" style={{ color: 'var(--text-muted)' }}><Settings size={14} /></button>}
      </div>

      <CalendarMini
        year={year} month={month} monthLabel={monthLabel} events={events}
        todayIso={todayIso} selectedIso={selectedDate}
        onPrev={() => shift(-1)} onNext={() => shift(1)}
        onSelect={iso => { if (events.some(e => e.data === iso)) setModalDate(iso); onSelectDate(selectedDate === iso ? null : iso) }}
      />

      {/* Legenda */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
        {Object.values(DOT).map(d => (
          <span key={d.label} className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-light)' }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: d.color, display: 'inline-block' }} />{d.label}
          </span>
        ))}
      </div>

      {/* Eventos (do dia selecionado ou do mês) — máx 5 visíveis */}
      <div className="border-t pt-2" style={{ borderColor: 'var(--border)' }}>
        <div className="text-[11px] font-semibold mb-1.5 flex items-center" style={{ color: 'var(--text-muted)' }}>
          {selectedDate ? `Eventos de ${ddmm(selectedDate)}` : 'Próximos eventos'}
          {selectedDate && <button onClick={() => onSelectDate(null)} className="ml-2 text-[10px]" style={{ color: 'var(--primary)' }}>ver próximos</button>}
        </div>
        {full.length === 0 ? (
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Nenhum evento{selectedDate ? ' neste dia' : ' próximo'}.</p>
        ) : (
          <div className="space-y-1">
            {list.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px] px-1.5 py-1 rounded-md"
                style={e.is_today ? { background: 'var(--primary-soft)' } : undefined}>
                <span className="tabular-nums shrink-0" style={{ color: 'var(--text-light)', width: 36 }}>{ddmm(e.data)}</span>
                <span className="shrink-0">{DOT[e.tipo].icon}</span>
                <span className="flex-1 truncate" style={{ color: 'var(--text)' }}>{e.titulo}{e.hora ? <span style={{ color: 'var(--text-light)' }}> · {e.hora}{e.hora_fim ? `–${e.hora_fim}` : ''}</span> : ''}</span>
              </div>
            ))}
            {hidden > 0 && (
              <button onClick={() => setShowAll(true)} className="text-[11px] mt-0.5" style={{ color: 'var(--primary)' }}>+{hidden} evento{hidden === 1 ? '' : 's'}</button>
            )}
            {showAll && full.length > MAX_VISIBLE && (
              <button onClick={() => setShowAll(false)} className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>ver menos</button>
            )}
          </div>
        )}
      </div>

      {/* Pop-up de detalhes ao clicar num dia com evento */}
      {modalDate && (() => {
        const evs = events.filter(e => e.data === modalDate)
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setModalDate(null)}>
            <div className="ds-card w-full max-w-md max-h-[85vh] overflow-y-auto p-4 space-y-3" onClick={ev => ev.stopPropagation()}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Eventos de {ddmm(modalDate)}</span>
                <button onClick={() => setModalDate(null)} aria-label="Fechar" style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
              </div>
              {evs.map((e, i) => {
                const conv = e.convidados ?? []
                const grupos = ([
                  ['Aceitaram', conv.filter(c => c.resposta === 'accepted')],
                  ['Talvez', conv.filter(c => c.resposta === 'tentativelyAccepted')],
                  ['Recusaram', conv.filter(c => c.resposta === 'declined')],
                  ['Sem resposta', conv.filter(c => !['accepted', 'tentativelyAccepted', 'declined'].includes(c.resposta))],
                ] as [string, CalEventoConvidado[]][]).filter(([, l]) => l.length > 0)
                return (
                  <div key={i} className="space-y-1.5 pb-2.5 border-b last:border-0 last:pb-0" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2">
                      <span>{DOT[e.tipo].icon}</span>
                      <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{e.titulo}</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-auto" style={{ background: 'var(--surface-sunken)', color: DOT[e.tipo].color }}>{DOT[e.tipo].label}</span>
                    </div>
                    <div className="space-y-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      {e.hora && <div className="flex items-center gap-1.5"><Clock size={12} className="shrink-0" /> <span>{e.hora}{e.hora_fim ? ` – ${e.hora_fim}` : ''}{e.organizador ? ` · por ${e.organizador}` : ''}</span></div>}
                      {e.local && <div className="flex items-start gap-1.5"><MapPin size={12} className="mt-[2px] shrink-0" /> <span>{e.local}</span></div>}
                      {e.link && <a href={e.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium" style={{ color: 'var(--primary)' }}><Link2 size={12} className="shrink-0" /> {e.link.includes('teams.microsoft.com') ? 'Ingressar no Teams' : 'Abrir convite'}</a>}
                    </div>
                    {grupos.length > 0 && (
                      <div className="space-y-1 pt-0.5">
                        {grupos.map(([label, lista]) => (
                          <div key={label} className="text-[11px] leading-snug">
                            <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>{label} ({lista.length}):</span>{' '}
                            <span style={{ color: 'var(--text-light)' }}>{lista.map(c => c.nome).join(', ')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Config admin: quem vê o quê na agenda */}
      {cfgOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setCfgOpen(false)}>
          <div className="ds-card w-full max-w-lg max-h-[85vh] overflow-y-auto p-4 space-y-3" onClick={ev => ev.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Visibilidade da agenda por perfil</span>
              <button onClick={() => setCfgOpen(false)} aria-label="Fechar" style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Marque quais eventos cada perfil pode ver no calendário. O <b>Administrador vê todos</b>.</p>
            {!cfg ? (
              <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Carregando…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr>
                      <th className="text-left py-1.5 pr-2" style={{ color: 'var(--text-muted)' }}>Evento</th>
                      {Object.entries(cfg.profiles).map(([pk, pl]) => (
                        <th key={pk} className="px-1.5 py-1.5 font-medium text-center" style={{ color: 'var(--text-muted)' }}>{pl}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(cfg.types).map(([tk, tl]) => (
                      <tr key={tk} className="border-t" style={{ borderColor: 'var(--border)' }}>
                        <td className="py-2 pr-2 flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                          <span>{DOT[tk as CalEvento['tipo']]?.icon ?? '•'}</span> {tl}
                        </td>
                        {Object.keys(cfg.profiles).map(pk => (
                          <td key={pk} className="text-center py-2">
                            <input type="checkbox" checked={(cfg.visibility[tk] ?? []).includes(pk)} onChange={() => toggleCfg(tk, pk)} style={{ accentColor: 'var(--primary)', width: 15, height: 15, cursor: 'pointer' }} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setCfgOpen(false)} className="ds-btn-secondary text-[12px] px-3 py-1.5">Cancelar</button>
              <button onClick={saveCfg} disabled={savingCfg || !cfg} className="ds-btn-primary text-[12px] px-3 py-1.5">{savingCfg ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
