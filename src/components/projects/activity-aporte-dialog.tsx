'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, PlusCircle, Clock, AlertTriangle } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { useActivityAportes } from '@/hooks/use-activity-aportes'
import { useApiQuery } from '@/hooks/use-query'
import { useProjectStages } from '@/hooks/use-project-stages'
import { cronogramaPoolHours } from '@/lib/cronograma-pool'

interface Props {
  deliveryId: number
  deliveryName: string
  deliveryHoursPlanned: number
  projectId: number
  onClose: () => void
  /** Recebe o novo hours_planned da atividade após o aporte (pra o pai atualizar o card/painel). */
  onCreated: (newHoursPlanned: number) => void
  /** Pré-preenche o campo horas (ex.: devolução de sobra usa negativo). */
  initialHours?: number
  /** Pré-preenche a justificativa. */
  initialReason?: string
}

interface ProjectBalance {
  sold_hours?: number | string | null
  coordination_hours?: number | string | null
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatHours(n: number): string {
  const v = Number(n) || 0
  if (v === 0) return '0h'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  return `${sign}${abs >= 10 ? Math.round(abs) : abs.toFixed(1)}h`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

export function ActivityAporteDialog({
  deliveryId, deliveryName, deliveryHoursPlanned, projectId, onClose, onCreated,
  initialHours, initialReason,
}: Props) {
  const { items, totals, loading, refetch } = useActivityAportes(deliveryId)
  const { data: project } = useApiQuery<ProjectBalance>(`/projects/${projectId}`)
  const { stages } = useProjectStages(projectId)
  const [hours, setHours] = useState(initialHours != null ? String(initialHours) : '')
  const [reason, setReason] = useState(initialReason ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Saldo do projeto = pool liberado à gestão − SUM(deliveries.hours_planned across stages).
  // Como o frontend ainda não tem essa SUM direto, usamos a soma das stages (aproximação razoável; backend é authoritative).
  const pool = cronogramaPoolHours(project)
  const allocated = useMemo(() => stages.reduce((s, st) => s + num(st.hours_planned), 0), [stages])
  const remaining = pool - allocated
  const aporteValue = Number(hours)
  const isValid = Number.isFinite(aporteValue) && aporteValue !== 0
  const projectedRemaining = isValid ? remaining - aporteValue : remaining
  const projectedActivity = isValid ? deliveryHoursPlanned + aporteValue : deliveryHoursPlanned
  const projectExceeds = isValid && aporteValue > 0 && projectedRemaining < 0
  const activityBelowZero = isValid && aporteValue < 0 && projectedActivity < 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!Number.isFinite(aporteValue) || aporteValue === 0) {
      toast.error('Informe horas (≠ 0)')
      return
    }
    if (reason.trim().length < 5) {
      toast.error('Justificativa precisa ter pelo menos 5 caracteres')
      return
    }
    setSaving(true)
    try {
      await api.post(`/activities/${deliveryId}/aportes`, { hours: aporteValue, reason: reason.trim() })
      toast.success(aporteValue < 0 ? 'Horas devolvidas ao banco' : 'Aporte registrado')
      const newPlanned = Math.round((deliveryHoursPlanned + aporteValue) * 100) / 100
      setHours('')
      setReason('')
      refetch()
      onCreated(newPlanned)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao registrar aporte')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)', zIndex: 80,
        }}
      />
      <aside
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(460px, 100vw)',
          background: 'var(--bg)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.2)',
          zIndex: 90,
          display: 'flex', flexDirection: 'column',
          animation: 'slideInActAporte .18s ease',
        }}
      >
        <style>{`@keyframes slideInActAporte { from { transform: translateX(20px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>

        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Aporte na atividade
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
              {deliveryName}
            </div>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Fechar"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
          <div
            className="ds-card"
            style={{
              padding: '10px 12px', marginBottom: 12,
              borderLeft: projectExceeds ? '3px solid var(--danger)' : '3px solid var(--success)',
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Saldo do projeto
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: remaining < 0 ? 'var(--danger)' : 'var(--text)', marginTop: 2 }}>
                {formatHours(remaining)}
              </div>
              {isValid && (
                <div style={{
                  fontSize: 10, marginTop: 2,
                  color: projectExceeds ? 'var(--danger)' : 'var(--text-light)',
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                }}>
                  {projectExceeds && <AlertTriangle size={10} />}
                  Após: {formatHours(projectedRemaining)}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Atividade atual
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
                {formatHours(deliveryHoursPlanned)}
              </div>
              {isValid && (
                <div style={{
                  fontSize: 10, marginTop: 2,
                  color: activityBelowZero ? 'var(--danger)' : 'var(--text-light)',
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                }}>
                  {activityBelowZero && <AlertTriangle size={10} />}
                  Após: {formatHours(projectedActivity)}
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="ds-card ds-card-pad" style={{ padding: 14, marginBottom: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Horas
                </label>
                <input
                  type="number" step="0.5"
                  className="ds-input"
                  value={hours}
                  onChange={e => setHours(e.target.value)}
                  placeholder="5"
                  style={{ width: '100%', marginTop: 4 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Use negativo (-) pra extorno
                </label>
                <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>
                  Aporte positivo expande as horas previstas da atividade e consome saldo do projeto.
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Justificativa <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Ex: Adequação SPED 2026 — novo bloco requerido"
                className="ds-input"
                style={{ width: '100%', marginTop: 4, padding: 10, resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ fontSize: 10, color: 'var(--text-light)', marginTop: 2 }}>
                Mínimo 5 caracteres. Aparece no histórico desta atividade.
              </div>
            </div>

            <button
              type="submit"
              className="ds-btn-primary"
              disabled={saving || !hours || reason.trim().length < 5 || projectExceeds || activityBelowZero}
              style={{ fontSize: 13, padding: '8px 16px', marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <PlusCircle size={13} /> {saving ? 'Registrando…' : 'Registrar aporte'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Histórico · {totals.count}
            </div>
            {totals.hours !== 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Total aportado: <strong style={{ color: 'var(--text)' }}>{formatHours(totals.hours)}</strong>
              </div>
            )}
          </div>

          {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando…</div>}
          {!loading && items.length === 0 && (
            <div style={{
              padding: '20px 16px', textAlign: 'center', fontSize: 13,
              color: 'var(--text-muted)',
              border: '1px dashed var(--border)', borderRadius: 8,
            }}>
              Nenhum aporte registrado ainda.
            </div>
          )}
          {!loading && items.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map(a => (
                <li key={a.id} className="ds-card" style={{ padding: 10 }}>
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                    gap: 8, marginBottom: 4,
                  }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 13, fontWeight: 600,
                      color: Number(a.hours) >= 0 ? 'var(--success)' : 'var(--danger)',
                    }}>
                      <Clock size={11} /> {formatHours(Number(a.hours))}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {timeAgo(a.created_at)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>
                    {a.reason}
                  </div>
                  {a.user?.name && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      por {a.user.name}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}
