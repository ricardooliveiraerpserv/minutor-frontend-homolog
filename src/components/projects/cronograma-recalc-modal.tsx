'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, Loader2, AlertTriangle, CalendarClock,
  Activity, CheckCircle2, AlertOctagon, Layers,
} from 'lucide-react'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { usePreviewRecalc, type PreviewResult, type RecalcTrigger } from '@/hooks/use-preview-recalc'

interface Props {
  open: boolean
  projectId: number
  trigger: RecalcTrigger | null
  initialPreview?: PreviewResult | null
  compact?: boolean
  onApplied: () => void
  onCancel: () => void
}

type Mode = 'auto' | 'manual'
interface ManualRow { id: number; title: string; start: string; due: string; isEdited: boolean }

/**
 * Modal de IMPACTO do Cronograma (Fase 10.1+). Aparece ANTES de salvar (preview),
 * mostrando: resumo executivo, impacto operacional, prazo do projeto, impacto por
 * etapa, atividades impactadas (antes→depois) e indicador de risco.
 *
 * Triggers: delivery_field (cascade FS), stage_field (datas/horas de etapa),
 * project_calendar (durações). Modos (delivery_field): auto (aplica cascade) ou
 * manual (edita TODAS as impactadas, sugestões do motor como referência).
 */
export function CronogramaRecalcModal({
  open, projectId, trigger, initialPreview = null, compact = false,
  onApplied, onCancel,
}: Props) {
  const previewRecalc = usePreviewRecalc(projectId)
  const [preview, setPreview] = useState<PreviewResult | null>(initialPreview)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [mode, setMode] = useState<Mode>('auto')
  const [manualHours, setManualHours] = useState<string>('')
  // Linhas editáveis no modo manual: atividade alterada + impactadas (seed = sugestões).
  const [manualRows, setManualRows] = useState<ManualRow[]>([])

  const isCalendar = trigger?.type === 'project_calendar'
  const isDelivery = trigger?.type === 'delivery_field'
  const isStage = trigger?.type === 'stage_field'

  useEffect(() => {
    if (!open || !trigger) return
    const seed = (r: PreviewResult) => { setPreview(r); seedManual(trigger, r) }
    if (initialPreview) { seed(initialPreview); return }
    let cancelled = false
    setLoading(true); setPreview(null)
    previewRecalc(trigger)
      .then(r => { if (!cancelled) seed(r) })
      .catch(e => { if (!cancelled) { toast.error(e instanceof ApiError ? e.message : 'Erro ao calcular preview'); onCancel() } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trigger])

  useEffect(() => { if (open) setMode('auto') }, [open])

  function seedManual(t: RecalcTrigger, r: PreviewResult) {
    if (t.type !== 'delivery_field') { setManualRows([]); setManualHours(''); return }
    setManualHours(t.simulate.hours_planned != null ? String(t.simulate.hours_planned) : '')
    const editedTitle = r.summary.item_title ?? 'Atividade alterada'
    const editedStart = typeof t.simulate.planned_start_at === 'string' ? t.simulate.planned_start_at : ''
    const editedDue = typeof t.simulate.due_date === 'string' ? t.simulate.due_date : ''
    const rows: ManualRow[] = [{ id: t.deliveryId, title: editedTitle, start: editedStart, due: editedDue, isEdited: true }]
    for (const a of r.affected) {
      rows.push({ id: a.id, title: a.title, start: a.suggested_start ?? '', due: a.suggested_end ?? '', isEdited: false })
    }
    setManualRows(rows)
  }

  function setRow(id: number, patch: Partial<Pick<ManualRow, 'start' | 'due'>>) {
    setManualRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  // Conflito: alguma linha com fim < início.
  const manualConflict = useMemo(() => {
    if (mode !== 'manual') return null
    const bad = manualRows.find(r => r.start && r.due && r.due < r.start)
    return bad ? `Fim antes do início em "${bad.title}".` : null
  }, [mode, manualRows])

  if (!trigger) return null

  async function applyAuto() {
    if (!preview) return
    setApplying(true)
    try {
      if (trigger?.type === 'delivery_field') {
        await api.patch(`/deliveries/${trigger.deliveryId}`, trigger.simulate)
        await api.post(`/deliveries/${trigger.deliveryId}/recalc-dependents`, { apply: true })
        toast.success('Cronograma recalculado')
      } else if (trigger?.type === 'stage_field') {
        await api.patch(`/stages/${trigger.stageId}`, trigger.simulate)
        toast.success('Etapa atualizada')
      } else {
        toast.success('Calendário atualizado')
      }
      onApplied()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao aplicar')
    } finally { setApplying(false) }
  }

  async function applyManual() {
    if (trigger?.type !== 'delivery_field') return
    if (manualConflict) { toast.error(manualConflict); return }
    setApplying(true)
    try {
      // Atividade alterada (com horas) + cada impactada com as datas definidas.
      for (const r of manualRows) {
        const body: Record<string, unknown> = {}
        if (r.start) body.planned_start_at = r.start
        if (r.due) body.due_date = r.due
        if (r.isEdited && manualHours) body.hours_planned = Number(manualHours)
        if (Object.keys(body).length > 0) await api.patch(`/deliveries/${r.id}`, body)
      }
      toast.success('Datas aplicadas manualmente')
      onApplied()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao aplicar manualmente')
    } finally { setApplying(false) }
  }

  const s = preview?.summary
  const imp = preview?.impact
  const stages = preview?.affected_stages ?? []

  return (
    <Modal open={open} onClose={onCancel} size={compact ? 'sm' : 'lg'} zIndex={75}>
      <ModalHeader
        title="Impacto no cronograma detectado"
        subtitle={s?.trigger_label ?? 'Carregando…'}
        icon={isCalendar ? CalendarClock : isStage ? Layers : Activity}
        onClose={onCancel}
      />
      <ModalBody>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
            <Loader2 size={14} className="animate-spin" /> Calculando impacto…
          </div>
        )}

        {!loading && preview && imp && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Indicador de risco — quando o prazo do projeto se move */}
            {imp.days_diff !== 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8,
                background: imp.days_diff > 0 ? 'var(--danger-bg)' : 'var(--success-bg)',
                border: `1px solid ${imp.days_diff > 0 ? 'var(--danger)' : 'var(--success)'}`,
              }}>
                <AlertTriangle size={18} style={{ color: imp.days_diff > 0 ? 'var(--danger)' : 'var(--success)', flexShrink: 0 }} />
                <div style={{ fontSize: 13 }}>
                  <strong style={{ color: imp.days_diff > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {imp.days_diff > 0 ? 'O projeto sofrerá impacto de prazo.' : 'O projeto será adiantado.'}
                  </strong>{' '}
                  <span style={{ color: 'var(--text-muted)' }}>
                    {fmtDateFull(imp.project_end_current)} → {fmtDateFull(imp.project_end_new)} ·{' '}
                    {imp.days_diff > 0 ? 'atraso projetado' : 'adiantamento'} de {Math.abs(imp.days_diff)} dia(s).
                  </span>
                </div>
              </div>
            )}

            {/* Resumo executivo estruturado */}
            {!compact && (
              <Section icon={<Activity size={13} />} label="Resumo executivo">
                {s?.field_label ? (
                  <div style={{ fontSize: 13, color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>{s.item_kind === 'etapa' ? 'Etapa' : 'Atividade'}:</span> <strong>{s.item_title}</strong></div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>{s.field_label}:</span>{' '}
                      <span style={{ color: 'var(--text-muted)' }}>{s.old_value ?? '—'}</span>
                      <ArrowRight size={12} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 4px', color: 'var(--text-light)' }} />
                      <strong style={{ color: 'var(--primary)' }}>{s.new_value ?? '—'}</strong>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text)' }}>{s?.change_description}</div>
                )}
              </Section>
            )}

            {/* Impacto operacional */}
            <Section icon={<AlertOctagon size={13} />} label="Impacto operacional">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                <ImpactCard value={imp.affected_deliveries_count} label="atividade(s)" color={imp.affected_deliveries_count > 0 ? 'warning' : 'success'} />
                <ImpactCard value={imp.affected_stages_count} label="etapa(s)" color={imp.affected_stages_count > 0 ? 'warning' : 'success'} />
                <ImpactCard value={Math.abs(imp.days_diff)} label={imp.days_diff > 0 ? 'dias de atraso' : imp.days_diff < 0 ? 'dias adiantado' : 'sem mudança de prazo'} color={imp.days_diff > 0 ? 'danger' : imp.days_diff < 0 ? 'success' : 'default'} />
              </div>
            </Section>

            {/* Prazo final do projeto */}
            <Section icon={<CalendarClock size={13} />} label="Prazo final do projeto">
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600 }}>
                <span style={{ color: 'var(--text-muted)' }}>{fmtDateFull(imp.project_end_current)}</span>
                <ArrowRight size={14} style={{ color: 'var(--text-light)' }} />
                <span style={{ color: imp.days_diff > 0 ? 'var(--danger)' : imp.days_diff < 0 ? 'var(--success)' : 'var(--text)' }}>
                  {fmtDateFull(imp.project_end_new)}
                </span>
                {imp.days_diff !== 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 6px', borderRadius: 999, background: imp.days_diff > 0 ? 'var(--danger-bg)' : 'var(--success-bg)', color: imp.days_diff > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {imp.days_diff > 0 ? '+' : ''}{imp.days_diff}d
                  </span>
                )}
              </div>
            </Section>

            {/* Impacto por etapa */}
            {!compact && stages.length > 0 && (
              <Section icon={<Layers size={13} />} label={`Impacto por etapa (${stages.length})`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  {stages.map(st => (
                    <div key={st.stage_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.name}</span>
                      <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtRange(st.current_start, st.current_end)} <ArrowRight size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> <strong style={{ color: 'var(--primary)' }}>{fmtRange(st.new_start, st.new_end)}</strong>
                        {st.days_diff !== 0 && <span style={{ marginLeft: 6, color: st.days_diff > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>{st.days_diff > 0 ? '+' : ''}{st.days_diff}d</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Atividades impactadas — tabela ANTES/DEPOIS */}
            {!compact && preview.affected.length > 0 && (
              <Section icon={<AlertOctagon size={13} />} label={`Atividades impactadas (${preview.affected.length})`}>
                <AffectedTable items={preview.affected} isCalendar={isCalendar} />
              </Section>
            )}

            {/* Modo de recálculo — só pra delivery_field */}
            {isDelivery && (
              <Section icon={<CheckCircle2 size={13} />} label="Como aplicar">
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <ModeRadio checked={mode === 'auto'} onChange={() => setMode('auto')}
                    title="Recalcular automaticamente" desc="Aplica as datas sugeridas em todas as atividades dependentes." />
                  <ModeRadio checked={mode === 'manual'} onChange={() => setMode('manual')}
                    title="Definir manualmente" desc="Edite as datas das atividades impactadas (sugestões do motor como referência)." />
                </div>
                {mode === 'manual' && (
                  <div style={{ marginTop: 10, padding: 10, background: 'var(--surface-hover)', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {manualRows.map(r => (
                      <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 160px', minWidth: 0, fontSize: 12, color: r.isEdited ? 'var(--text)' : 'var(--text-muted)', fontWeight: r.isEdited ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingBottom: 6 }}>
                          {r.isEdited && <span style={{ color: 'var(--primary)' }}>● </span>}{r.title}
                        </div>
                        <ManualField label="Início">
                          <input type="date" className="ds-input" value={r.start} onChange={e => setRow(r.id, { start: e.target.value })} style={{ width: 138, fontSize: 12, padding: '4px 8px' }} />
                        </ManualField>
                        <ManualField label="Fim">
                          <input type="date" className="ds-input" value={r.due} onChange={e => setRow(r.id, { due: e.target.value })} style={{ width: 138, fontSize: 12, padding: '4px 8px' }} />
                        </ManualField>
                        {r.isEdited && (
                          <ManualField label="Horas">
                            <input type="number" min={0} step="0.5" className="ds-input" value={manualHours} onChange={e => setManualHours(e.target.value)} style={{ width: 80, fontSize: 12, padding: '4px 8px' }} />
                          </ManualField>
                        )}
                      </div>
                    ))}
                    {manualConflict && (
                      <div style={{ fontSize: 11, color: 'var(--warning)', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 4, padding: '4px 8px' }}>
                        ⚠ {manualConflict}
                      </div>
                    )}
                  </div>
                )}
              </Section>
            )}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <button type="button" className="ds-btn-secondary" onClick={onCancel} disabled={applying} style={{ padding: '8px 14px', fontSize: 13 }}>
          Cancelar
        </button>
        <button type="button" className="ds-btn-primary"
          onClick={mode === 'manual' ? applyManual : applyAuto}
          disabled={loading || applying || !preview || (mode === 'manual' && !!manualConflict)}
          style={{ padding: '8px 14px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {applying && <Loader2 size={13} className="animate-spin" />}
          {isCalendar ? 'Entendi' : mode === 'manual' ? 'Aplicar datas manuais' : 'Aplicar recálculo automático'}
        </button>
      </ModalFooter>
    </Modal>
  )
}

function Section({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <span style={{ color: 'var(--text-light)' }}>{icon}</span>
        {label}
      </div>
      {children}
    </div>
  )
}

function ImpactCard({ value, label, color }: { value: number; label: string; color: 'default' | 'warning' | 'danger' | 'success' }) {
  const fg = color === 'default' ? 'var(--text)' : `var(--${color})`
  const bg = color === 'default' ? 'var(--surface-hover)' : `var(--${color}-bg)`
  return (
    <div style={{ padding: '8px 10px', borderRadius: 6, background: bg }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: fg, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}

function AffectedTable({ items, isCalendar }: { items: PreviewResult['affected']; isCalendar: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, 10)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '.04em', paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
        <span style={{ flex: 1 }}>Atividade</span>
        <span style={{ width: 90, textAlign: 'right' }}>Antes</span>
        <span style={{ width: 90, textAlign: 'right' }}>Depois</span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 12 }}>
        {visible.map(a => (
          <li key={a.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
            {isCalendar ? (
              <>
                <span style={{ width: 90, textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{a.duration_old}d</span>
                <span style={{ width: 90, textAlign: 'right', color: 'var(--primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{a.duration_new}d</span>
              </>
            ) : (
              <>
                <span style={{ width: 90, textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtRange(a.current_start, a.current_end)}</span>
                <span style={{ width: 90, textAlign: 'right', color: 'var(--primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtRange(a.suggested_start, a.suggested_end)}</span>
              </>
            )}
          </li>
        ))}
      </ul>
      {items.length > 10 && (
        <button type="button" onClick={() => setExpanded(e => !e)} style={{ marginTop: 6, fontSize: 12, color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>
          {expanded ? 'Mostrar menos' : `+${items.length - 10} mais`}
        </button>
      )}
    </div>
  )
}

function ModeRadio({ checked, onChange, title, desc }: { checked: boolean; onChange: () => void; title: string; desc: string }) {
  return (
    <label style={{ flex: '1 1 200px', cursor: 'pointer', padding: '10px 12px', border: `1px solid ${checked ? 'var(--primary)' : 'var(--border)'}`, background: checked ? 'var(--primary-soft)' : 'var(--surface)', borderRadius: 6, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <input type="radio" checked={checked} onChange={onChange} style={{ marginTop: 2 }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
      </div>
    </label>
  )
}

function ManualField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
      {children}
    </label>
  )
}

function fmtRange(start: string | null, end: string | null): string {
  if (!start && !end) return '—'
  return `${start ? fmtDate(start) : '?'} → ${end ? fmtDate(end) : '?'}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}` : iso
}

function fmtDateFull(iso: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}
