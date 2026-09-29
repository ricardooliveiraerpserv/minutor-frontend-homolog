'use client'

import { useEffect, useState } from 'react'
import { getWorkSession, wsPosition, wsPrev, wsElapsedMs, wsTogglePause, type WorkSession } from '@/lib/work-session'
import { Pause, Play, SkipForward, ChevronLeft, Square } from 'lucide-react'

export interface SessionSummary {
  atendidos: number; pulados: number; resolvidos: number; encaminhados: number
  playbooks: number; horas_apontadas: number; tempo_total_segundos: number
}

export function fmtDur(ms: number): string {
  const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m}:${String(ss).padStart(2, '0')}`
}

/** Barra de controles do Modo Atendimento — sempre visível no topo enquanto a sessão durar. */
export function ModoAtendimentoBar({ currentId, onPrev, onSkip, onEnd }: { currentId: number; onPrev: () => void; onSkip: () => void; onEnd: () => void }) {
  const [s, setS] = useState<WorkSession | null>(getWorkSession())
  const [, setTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id) }, [])
  useEffect(() => { setS(getWorkSession()) }, [currentId])
  if (!s) return null
  const pos = wsPosition(currentId)
  const hasPrev = wsPrev(currentId) != null
  const elapsed = wsElapsedMs(s)
  const avg = s.atendidos > 0 ? elapsed / s.atendidos : 0

  return (
    <div className="ds-card flex items-center justify-between gap-3 p-2.5 flex-wrap" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)' }}>
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: 'var(--primary)' }}>● Modo Atendimento</span>
        <span style={{ color: 'var(--text)' }}>{s.label}</span>
        {pos && <span style={{ color: 'var(--text-muted)' }}>{pos.pos} de {pos.total}</span>}
        <span style={{ color: 'var(--text-muted)' }}>⏱ {fmtDur(elapsed)}{s.paused ? ' (pausado)' : ''}</span>
        <span style={{ color: 'var(--text-muted)' }}>{s.atendidos} atendidos{s.atendidos > 0 ? ` · média ${fmtDur(avg)}` : ''}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button className="ds-btn-secondary text-xs px-2 py-1 rounded-lg inline-flex items-center gap-1" onClick={() => setS(wsTogglePause())}>{s.paused ? <><Play size={13} /> Retomar</> : <><Pause size={13} /> Pausar</>}</button>
        <button className="ds-btn-secondary text-xs px-2 py-1 rounded-lg inline-flex items-center gap-1" disabled={!hasPrev} onClick={onPrev}><ChevronLeft size={13} /> Anterior</button>
        <button className="ds-btn-secondary text-xs px-2 py-1 rounded-lg inline-flex items-center gap-1" onClick={onSkip}><SkipForward size={13} /> Pular</button>
        <button className="ds-btn-secondary text-xs px-2 py-1 rounded-lg inline-flex items-center gap-1" style={{ color: 'var(--danger-border)' }} onClick={onEnd}><Square size={13} /> Encerrar</button>
      </div>
    </div>
  )
}

function Ind({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-sunken)' }}>
      <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>{label}</div>
      <div className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{v}</div>
    </div>
  )
}

/** Tela "Fila concluída" — indicadores da sessão + ações. */
export function FilaConcluida({ summary, onRefresh, onEnd }: { summary: SessionSummary | null; onRefresh: () => void; onEnd: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="ds-card max-w-md w-full p-6 text-center space-y-4">
        <div className="text-3xl">✓</div>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Fila concluída</h2>
        {summary && (
          <div className="grid grid-cols-3 gap-2 text-left">
            <Ind label="Atendidos" v={summary.atendidos} />
            <Ind label="Resolvidos" v={summary.resolvidos} />
            <Ind label="Encaminhados" v={summary.encaminhados} />
            <Ind label="Pulados" v={summary.pulados} />
            <Ind label="Horas" v={`${summary.horas_apontadas}h`} />
            <Ind label="Tempo total" v={fmtDur(summary.tempo_total_segundos * 1000)} />
          </div>
        )}
        <div className="flex justify-center gap-2 pt-1">
          <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={onRefresh}>Atualizar fila</button>
          <button className="ds-btn-primary text-sm px-3 py-1.5 rounded-lg" onClick={onEnd}>Encerrar sessão</button>
        </div>
      </div>
    </div>
  )
}
