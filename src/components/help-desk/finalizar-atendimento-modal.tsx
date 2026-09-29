'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { X, Play, Pause, Clock, RotateCcw } from 'lucide-react'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const lbl = 'text-[11px] font-semibold block mb-0.5'

interface StatusOpt { id: number; key: string; label: string; is_resolved?: boolean; is_terminal?: boolean }
interface ProjectOpt { id: number; name: string }

const hhmm = (sec: number) => {
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

/** Cronômetro auxiliar (V1 localStorage). O dado oficial é o tempo informado no campo. */
function useStopwatch(ticketId: number) {
  const KEY = `hd_timer_${ticketId}`
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0) // segundos
  const accRef = useRef(0); const startRef = useRef<number | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) { const s = JSON.parse(raw); accRef.current = s.acc ?? 0; startRef.current = s.startedAt ?? null }
    } catch { /* ignore */ }
    setRunning(startRef.current != null)
    setElapsed(accRef.current + (startRef.current ? Math.floor((Date.now() - startRef.current) / 1000) : 0))
  }, [KEY])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setElapsed(accRef.current + (startRef.current ? Math.floor((Date.now() - startRef.current) / 1000) : 0)), 1000)
    return () => clearInterval(id)
  }, [running])

  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify({ acc: accRef.current, startedAt: startRef.current })) } catch { /* */ } }
  const toggle = () => {
    if (startRef.current) { accRef.current += Math.floor((Date.now() - startRef.current) / 1000); startRef.current = null; setRunning(false) }
    else { startRef.current = Date.now(); setRunning(true) }
    persist(); setElapsed(accRef.current + (startRef.current ? 0 : 0))
  }
  const reset = () => { accRef.current = 0; startRef.current = null; setRunning(false); setElapsed(0); try { localStorage.removeItem(KEY) } catch { /* */ } }
  const clear = () => { try { localStorage.removeItem(KEY) } catch { /* */ } }
  return { running, elapsed, toggle, reset, clear }
}

export function FinalizarAtendimentoModal({ ticketId, statuses, defaultProjectId, defaultReply, defaultStatusId, onClose, onDone }: {
  ticketId: number; statuses: StatusOpt[]; defaultProjectId: number | null; defaultReply?: string | null; defaultStatusId?: number | null; onClose: () => void; onDone: () => void
}) {
  const resolvedId = statuses.find(s => s.is_resolved)?.id ?? statuses.find(s => s.key === 'resolvido')?.id ?? statuses[0]?.id
  const [statusId, setStatusId] = useState<number | undefined>(defaultStatusId ?? resolvedId)
  const [totalHours, setTotalHours] = useState('')
  const [observation, setObservation] = useState('')
  const [reply, setReply] = useState(defaultReply ?? '')
  const [projectId, setProjectId] = useState<string>(defaultProjectId ? String(defaultProjectId) : '')
  const [candidates, setCandidates] = useState<ProjectOpt[] | null>(null)
  const [saving, setSaving] = useState(false)
  const sw = useStopwatch(ticketId)
  // R1 — chave de idempotência persistida em localStorage por chamado: sobrevive a retry/timeout/duplo
  // clique E a REFRESH da página (mesma chave reusada até um finalize bem-sucedido limpá-la). Duas abas
  // compartilham o localStorage → mesma chave → dedup no servidor.
  const idemKey = useRef<string>('')
  if (!idemKey.current) {
    const k = `hd_idem_${ticketId}`
    let v: string | null = null
    try { v = localStorage.getItem(k) } catch { /* */ }
    if (!v) {
      v = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `hd-${ticketId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
      try { localStorage.setItem(k, v) } catch { /* */ }
    }
    idemKey.current = v
  }

  const aplicarCronometro = useCallback(() => { if (sw.elapsed > 0) setTotalHours(hhmm(sw.elapsed)) }, [sw])

  const submit = async () => {
    if (!statusId) return toast.error('Selecione o próximo status.')
    // R3 — descrição obrigatória quando há horas.
    if (totalHours.trim() && !observation.trim()) return toast.error('A descrição técnica é obrigatória ao registrar horas.')
    setSaving(true)
    try {
      await api.post(`/help-desk/tickets/${ticketId}/finalize`, {
        status_id: statusId,
        total_hours: totalHours.trim() || null,
        observation: observation.trim() || null,
        reply: reply.trim() || null,
        project_id: projectId || null,
        idempotency_key: idemKey.current,
      })
      sw.clear() // zera o cronômetro do chamado encerrado
      try { localStorage.removeItem(`hd_idem_${ticketId}`) } catch { /* */ } // próxima finalização usa chave nova
      toast.success('Atendimento finalizado')
      onDone()
    } catch (e) {
      if (e instanceof ApiError && (e.data as { code?: string })?.code === 'PROJECT_REQUIRED') {
        setCandidates((e.data as { candidates?: ProjectOpt[] })?.candidates ?? [])
        toast.error('Selecione o projeto para registrar as horas.')
      } else {
        toast.error(e instanceof ApiError ? e.message : 'Erro ao finalizar')
      }
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 px-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="ds-card w-full max-w-lg p-4 space-y-3 mb-12" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Finalizar atendimento</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--text-muted)' }} /></button>
        </div>

        {/* Tempo trabalhado + cronômetro auxiliar */}
        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Tempo trabalhado</label>
          <div className="flex items-center gap-2">
            <input className={`${fieldCls} w-28`} style={inputStyle} placeholder="ex.: 1:30 ou 1.5" value={totalHours} onChange={e => setTotalHours(e.target.value)} />
            <div className="flex items-center gap-1.5 text-xs rounded-lg px-2 py-1" style={{ background: 'var(--surface-sunken)' }}>
              <Clock size={13} style={{ color: 'var(--text-muted)' }} />
              <span className="font-mono" style={{ color: 'var(--text)' }}>{hhmm(sw.elapsed)}</span>
              <button onClick={sw.toggle} title={sw.running ? 'Pausar' : 'Iniciar'} style={{ color: 'var(--primary)' }}>{sw.running ? <Pause size={14} /> : <Play size={14} />}</button>
              {sw.elapsed > 0 && <button onClick={sw.reset} title="Zerar"><RotateCcw size={13} style={{ color: 'var(--text-light)' }} /></button>}
            </div>
            <button className="text-xs ds-link" style={{ color: 'var(--primary)' }} onClick={aplicarCronometro}>usar cronômetro</button>
          </div>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-light)' }}>Cronômetro é auxiliar — o valor oficial é o tempo informado. Deixe vazio para finalizar sem apontamento.</p>
        </div>

        {/* Projeto — só aparece se ambíguo */}
        {candidates && (
          <div>
            <label className={lbl} style={{ color: 'var(--danger-border)' }}>Projeto (obrigatório — há mais de um)</label>
            <select className={`${fieldCls} w-full`} style={inputStyle} value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">Selecione…</option>
              {candidates.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className={lbl} style={{ color: totalHours.trim() ? 'var(--danger-border)' : 'var(--text-light)' }}>Descrição técnica {totalHours.trim() ? '(obrigatória)' : '(apontamento)'}</label>
          <textarea className={`${fieldCls} w-full`} style={inputStyle} rows={3} value={observation} onChange={e => setObservation(e.target.value)} placeholder="O que foi feito" />
        </div>

        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Resposta ao cliente (opcional)</label>
          <textarea className={`${fieldCls} w-full`} style={inputStyle} rows={2} value={reply} onChange={e => setReply(e.target.value)} placeholder="Mensagem que o cliente verá" />
        </div>

        <div>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Próximo status do chamado</label>
          <select className={`${fieldCls} w-full`} style={inputStyle} value={statusId ?? ''} onChange={e => setStatusId(Number(e.target.value))}>
            {statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={onClose}>Cancelar</button>
          <button className="ds-btn-primary text-sm px-4 py-1.5 rounded-lg" onClick={submit} disabled={saving}>{saving ? 'Finalizando…' : 'Finalizar atendimento'}</button>
        </div>
      </div>
    </div>
  )
}
