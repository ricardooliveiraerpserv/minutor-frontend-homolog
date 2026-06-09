'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, PlusCircle, Clock, MessageSquare, History, FileText } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import type { StageDelivery, DeliveryStatus, DeliveryPriority } from '@/lib/types/project-stage'
import { DeliveryTimeline } from './delivery-timeline'
import { AcompanhamentosList } from './acompanhamentos-list'
import { ActivityAporteDialog } from './activity-aporte-dialog'
import { ActivityTimesheets } from './activity-timesheets'
import { ActivityExtraSections, type NewActivityDraft } from './project-schedule-table'
import { DeliveryApprovalCard } from './delivery-approval-card'
import { ApprovalRequestModal } from './approval-request-modal'
import { useActivityAllocations } from '@/hooks/use-activity-allocations'
import { SearchSelect } from '@/components/ui/search-select'

interface Props {
  delivery: StageDelivery
  projectId: number
  onClose: () => void
  onUpdated: (d: StageDelivery) => void
  onDeleted: (id: number) => void
}

const STATUS_OPTIONS: { value: DeliveryStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'waiting_client', label: 'Aguardando cliente' },
  { value: 'review', label: 'Homologação' },
  { value: 'done', label: 'Concluído' },
]

const PRIORITY_OPTIONS: { value: DeliveryPriority; label: string }[] = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
]

type Tab = 'detalhes' | 'apontamentos' | 'acompanhamentos' | 'historico'

const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: 'detalhes',        label: 'Detalhes',        icon: FileText },
  { id: 'apontamentos',    label: 'Apontamentos',    icon: Clock },
  { id: 'acompanhamentos', label: 'Acompanhamentos', icon: MessageSquare },
  { id: 'historico',       label: 'Histórico',       icon: History },
]

// Constrói o draft (mesmo shape do Planejamento) a partir da atividade existente.
function draftFromDelivery(d: StageDelivery): NewActivityDraft {
  return {
    title: d.title ?? '',
    responsible_user_id: d.responsible_user_id ? String(d.responsible_user_id) : '',
    planned_start_at: d.planned_start_at ?? '',
    due_date: d.due_date ?? '',
    hours_planned: d.hours_planned != null ? String(d.hours_planned) : '',
    client_involved: !!d.client_involved,
    client_user_id: d.client_user_id ? String(d.client_user_id) : '',
    client_email: d.client_email ?? '',
    extra_clients: (d.extra_clients ?? []).map(c => ({
      user_id: c.user_id ?? undefined,
      email: c.email ?? undefined,
      name: c.name ?? (c.email ?? ''),
    })),
    extra_allocations: [],
    dueTouched: !!d.due_date,
  }
}

export function DeliverySidePanel({ delivery, projectId, onClose, onUpdated, onDeleted }: Props) {
  const [tab, setTab] = useState<Tab>('detalhes')
  const [title, setTitle] = useState(delivery.title)
  const [description, setDescription] = useState(delivery.description ?? '')
  const [hours, setHours] = useState(String(delivery.hours_planned ?? ''))
  const [priority, setPriority] = useState<DeliveryPriority>(delivery.priority)
  const [status, setStatus] = useState<DeliveryStatus>(delivery.status)
  const [due, setDue] = useState(delivery.due_date ?? '')
  // Responsável / cliente / equipe — MESMO modelo do Planejamento (ActivityExtraSections).
  const [draft, setDraft] = useState<NewActivityDraft>(() => draftFromDelivery(delivery))
  const [respOpts, setRespOpts] = useState<{ id: number; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [timelineKey, setTimelineKey] = useState(0)
  const [aporteOpen, setAporteOpen] = useState(false)
  const [approvalModalOpen, setApprovalModalOpen] = useState(false)

  // Equipe já alocada (informativo) — onde a atividade está alocada hoje.
  const { items: currentAllocations, refetch: refetchAllocations } = useActivityAllocations(delivery.id)

  // Horas apontadas (pendente + aprovado) p/ o resumo do cabeçalho — visível em qualquer aba.
  const [apontadasMin, setApontadasMin] = useState(0)
  const loadApontadas = useCallback(async () => {
    try {
      const r = await api.get<{ items: { status: string; effort_minutes?: number | null }[] }>(`/timesheets?stage_delivery_id=${delivery.id}&pageSize=200`)
      const min = (r.items ?? [])
        .filter(t => ['pending', 'approved', 'released'].includes(t.status))
        .reduce((s, t) => s + (Number(t.effort_minutes) || 0), 0)
      setApontadasMin(min)
    } catch { /* */ }
  }, [delivery.id])
  useEffect(() => { loadApontadas() }, [loadApontadas])

  const previstasHdr = Number(delivery.hours_planned) || 0
  const apontadasHdr = Math.round(apontadasMin / 60 * 100) / 100
  const saldoHdr = Math.round((previstasHdr - apontadasHdr) * 100) / 100
  const overHdr = apontadasHdr > previstasHdr + 0.001
  const pctHdr = previstasHdr > 0 ? Math.min(100, Math.round(apontadasHdr / previstasHdr * 100)) : 0

  // Equipe do projeto (definida na Visão Geral): consultores p/ Responsável e
  // clientes p/ "Envolver cliente". As atividades só oferecem essas pessoas.
  const [clienteOpts, setClienteOpts] = useState<{ id: number; name: string }[]>([])
  useEffect(() => {
    api.get<any>(`/projects/${projectId}/team`).then(t => {
      const arr = (x: any) => Array.isArray(x) ? x : []
      setRespOpts(arr(t?.consultores).filter((x: any) => x?.id && x?.name).map((x: any) => ({ id: x.id, name: x.name })))
      setClienteOpts(arr(t?.clientes).filter((x: any) => x?.id && x?.name).map((x: any) => ({ id: x.id, name: x.name })))
    }).catch(() => {})
  }, [projectId])

  useEffect(() => {
    setTitle(delivery.title)
    setDescription(delivery.description ?? '')
    setHours(String(delivery.hours_planned ?? ''))
    setPriority(delivery.priority)
    setStatus(delivery.status)
    setDue(delivery.due_date ?? '')
    setDraft(draftFromDelivery(delivery))
    setTab('detalhes')
  }, [delivery.id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSave() {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        hours_planned: hours ? Number(hours) : 0,
        priority,
        status,
        due_date: due || null,
      }
      // Responsável (consultor/equipe) e cliente são INDEPENDENTES — coexistem na atividade.
      body.responsible_user_id = draft.responsible_user_id ? Number(draft.responsible_user_id) : null
      if (draft.client_involved) {
        body.client_involved = true
        body.client_user_id = draft.client_user_id ? Number(draft.client_user_id) : null
        body.client_email = draft.client_email.trim() || null
        body.extra_clients = draft.extra_clients.map(c => ({
          user_id: c.user_id ?? null, email: c.email ?? null, name: c.name,
        }))
      } else {
        body.client_involved = false
        body.client_user_id = null
        body.client_email = null
        body.extra_clients = []
      }

      const updated = await api.patch<StageDelivery>(`/deliveries/${delivery.id}`, body)

      // 1 consultor por atividade: o responsável recebe as HORAS PREVISTAS da atividade
      // (não há campo separado de horas do consultor). Cria/atualiza a alocação dele.
      if (draft.responsible_user_id && Number(hours) >= 0.5) {
        const uid = Number(draft.responsible_user_id)
        const hoursNum = Number(hours)
        const mine = currentAllocations.find(a => a.user_id === uid)
        try {
          if (mine) {
            if (Number(mine.planned_hours) !== hoursNum || !mine.is_primary) {
              await api.patch(`/allocations/${mine.id}`, { planned_hours: hoursNum, is_primary: true })
            }
          } else {
            await api.post(`/activities/${delivery.id}/allocations`, { user_id: uid, planned_hours: hoursNum, is_primary: true })
          }
        } catch (e) {
          toast.error(e instanceof ApiError ? e.message : 'Erro ao alocar horas do responsável')
        }
      }

      // Alocações novas (equipe) — não remove as existentes; mesmo padrão do Planejamento.
      const newAllocs = draft.extra_allocations.filter(a => Number(a.planned_hours) >= 0.5)
      if (newAllocs.length > 0) {
        await Promise.all(newAllocs.map(a =>
          api.post(`/activities/${delivery.id}/allocations`, {
            user_id: a.user_id, planned_hours: Number(a.planned_hours),
          }).catch(() => null)
        ))
        setDraft(d => ({ ...d, extra_allocations: [] }))
      }

      refetchAllocations()
      onUpdated(updated)
      setTimelineKey(k => k + 1)
      toast.success('Atividade atualizada')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Excluir a atividade "${delivery.title}"?`)) return
    try {
      await api.delete(`/deliveries/${delivery.id}`)
      onDeleted(delivery.id)
      toast.success('Atividade excluída')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir')
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.35)', zIndex: 40,
        }}
      />
      <aside
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(640px, 100vw)',
          background: 'var(--bg)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.18)',
          zIndex: 50,
          display: 'flex', flexDirection: 'column',
          animation: 'slideIn .18s ease',
        }}
      >
        <style>{`@keyframes slideIn { from { transform: translateX(20px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>

        {/* Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Atividade #{delivery.id}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {delivery.title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 4, flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Action bar — sempre visível, sem depender da tab */}
        <div style={{
          padding: '8px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          display: 'flex', gap: 6, flexWrap: 'wrap',
        }}>
          <button
            type="button"
            onClick={() => setAporteOpen(true)}
            className="ds-btn-ghost"
            style={{
              fontSize: 12, padding: '5px 10px',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              color: 'var(--primary)',
            }}
            title="Aportar horas com justificativa"
          >
            <PlusCircle size={12} /> Aportar
          </button>
          <button
            type="button"
            onClick={() => setTab('apontamentos')}
            className="ds-btn-ghost"
            style={{
              fontSize: 12, padding: '5px 10px',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              color: 'var(--text)',
            }}
            title="Apontar horas trabalhadas nesta atividade (sem sair da tela)"
          >
            <Clock size={12} /> Apontar
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
        }}>
          {TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1,
                  padding: '10px 8px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
                  color: active ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: active ? 600 : 400,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  transition: 'color .12s ease, border-color .12s ease',
                }}
              >
                <Icon size={12} /> {t.label}
              </button>
            )
          })}
        </div>

        {/* Resumo de horas FIXO — visível em qualquer aba. */}
        {previstasHdr > 0 && (
          <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '.04em' }}>Disponível</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{previstasHdr}h</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '.04em' }}>Apontadas</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{apontadasHdr}h</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '.04em' }}>Saldo</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: saldoHdr < 0 ? 'var(--danger)' : 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>{saldoHdr}h</div>
              </div>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: 'var(--surface-hover)', overflow: 'hidden', marginTop: 6 }}>
              <div style={{ height: '100%', width: `${pctHdr}%`, background: overHdr ? 'var(--danger)' : pctHdr > 85 ? 'var(--warning)' : 'var(--success)', transition: 'width .2s ease' }} />
            </div>
          </div>
        )}

        {/* Tab content */}
        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
          {tab === 'detalhes' && (
            <>
              <input
                className="ds-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Título"
                style={{ width: '100%', fontSize: 16, fontWeight: 500, padding: '10px 12px' }}
              />

              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Descrição (opcional)"
                rows={3}
                className="ds-input"
                style={{ width: '100%', marginTop: 10, padding: 10, resize: 'vertical', fontFamily: 'inherit' }}
              />

              {/* Workflow de aprovação do cliente (Aguardando cliente). */}
              <DeliveryApprovalCard
                delivery={delivery}
                onChanged={(d) => { setStatus(d.status); onUpdated(d) }}
              />

              <div style={{ marginTop: 14 }}>
                <Field label="Responsável">
                  <SearchSelect
                    value={draft.responsible_user_id}
                    onChange={v => setDraft(d => ({ ...d, responsible_user_id: v }))}
                    options={respOpts}
                    placeholder="Buscar consultor/coordenador/executivo…"
                    fullWidth
                  />
                </Field>
                <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>
                  O responsável recebe as <strong>{Number(hours) || 0}h previstas</strong> da atividade.
                </div>
              </div>

              {/* Responsável = a equipe: envolver cliente + incluir mais clientes + alocar mais
                  consultores. IDÊNTICO ao Planejamento (mesmo componente ActivityExtraSections). */}
              <ActivityExtraSections
                draft={draft}
                setDraft={setDraft}
                coordinators={[]}
                responsibleOptions={respOpts}
                clientOptions={clienteOpts}
              />

              {/* Equipe já alocada (informativo) — onde a atividade está alocada hoje. */}
              {currentAllocations.length > 0 && (
                <div style={{ marginTop: 14, padding: 10, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Equipe já alocada</div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {currentAllocations.map(a => (
                      <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)' }}>
                        <span style={{ flex: 1 }}>{a.user?.name ?? `#${a.user_id}`}{a.is_primary ? ' · principal' : ''}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{Number(a.planned_hours) || 0}h</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                <Field label="Status">
                  <select
                    className="ds-input"
                    value={status}
                    onChange={e => {
                      const v = e.target.value as DeliveryStatus
                      // Mover p/ "Aguardando cliente" exige mensagem (modal) — não troca direto.
                      if (v === 'waiting_client' && delivery.status !== 'waiting_client') { setApprovalModalOpen(true); return }
                      setStatus(v)
                    }}
                    style={{ width: '100%' }}
                  >
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>

                <Field label="Prioridade">
                  <select
                    className="ds-input"
                    value={priority}
                    onChange={e => setPriority(e.target.value as DeliveryPriority)}
                    style={{ width: '100%' }}
                  >
                    {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>

                <Field label="Horas previstas">
                  <input
                    type="number" min={0} step="0.5"
                    className="ds-input"
                    value={hours}
                    onChange={e => setHours(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </Field>

                <Field label="Prazo">
                  <input
                    type="date"
                    className="ds-input"
                    value={due}
                    onChange={e => setDue(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </Field>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="ds-btn-primary"
                  onClick={handleSave}
                  disabled={saving || !title.trim()}
                  style={{ fontSize: 13, padding: '8px 16px' }}
                >
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  style={{
                    fontSize: 13, padding: '8px 16px',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--danger)',
                    borderRadius: 6, cursor: 'pointer',
                    marginLeft: 'auto',
                  }}
                >
                  Excluir
                </button>
              </div>
            </>
          )}

          {tab === 'apontamentos' && (
            <ActivityTimesheets
              projectId={projectId}
              stageId={delivery.stage_id}
              deliveryId={delivery.id}
              responsible={delivery.responsible ? { id: delivery.responsible.id, name: delivery.responsible.name } : null}
              previstas={Number(delivery.hours_planned) || 0}
              showSummary={false}
              onChanged={loadApontadas}
            />
          )}

          {tab === 'acompanhamentos' && (
            <AcompanhamentosList projectId={projectId} stageId={delivery.stage_id} deliveryId={delivery.id} />
          )}


          {tab === 'historico' && (
            <DeliveryTimeline key={`hist-${timelineKey}`} deliveryId={delivery.id} />
          )}
        </div>

        {approvalModalOpen && (
          <ApprovalRequestModal
            deliveryId={delivery.id}
            title={delivery.title}
            onClose={() => setApprovalModalOpen(false)}
            onDone={(u) => { setApprovalModalOpen(false); setStatus('waiting_client'); setTimelineKey(k => k + 1); onUpdated(u) }}
          />
        )}

        {aporteOpen && (
          <ActivityAporteDialog
            deliveryId={delivery.id}
            deliveryName={delivery.title}
            deliveryHoursPlanned={Number(delivery.hours_planned ?? 0)}
            projectId={projectId}
            onClose={() => setAporteOpen(false)}
            onCreated={() => {
              setAporteOpen(false)
              setTimelineKey(k => k + 1)
              onUpdated({ ...delivery })
            }}
          />
        )}
      </aside>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'block', fontSize: 11, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4,
      }}>
        {label}
      </span>
      {children}
    </label>
  )
}
