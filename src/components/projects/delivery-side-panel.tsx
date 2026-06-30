'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import type { StageDelivery, DeliveryStatus, DeliveryPriority } from '@/lib/types/project-stage'
import { DeliveryTimeline } from './delivery-timeline'

interface Props {
  delivery: StageDelivery
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

export function DeliverySidePanel({ delivery, onClose, onUpdated, onDeleted }: Props) {
  const [title, setTitle] = useState(delivery.title)
  const [description, setDescription] = useState(delivery.description ?? '')
  const [hours, setHours] = useState(String(delivery.hours_planned ?? ''))
  const [priority, setPriority] = useState<DeliveryPriority>(delivery.priority)
  const [status, setStatus] = useState<DeliveryStatus>(delivery.status)
  const [due, setDue] = useState(delivery.due_date ?? '')
  const [respId, setRespId] = useState<string>(delivery.responsible_user_id ? String(delivery.responsible_user_id) : '')
  const [respOpts, setRespOpts] = useState<{ id: number; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [timelineKey, setTimelineKey] = useState(0)

  // Responsável da atividade: consultores + parceiros (alocar o responsável).
  useEffect(() => {
    let cancel = false
    api.get<any>('/users?type=consultor,parceiro,parceiro_admin&pageSize=200').then(u => {
      if (cancel) return
      const items = Array.isArray(u?.items) ? u.items : Array.isArray(u?.data) ? u.data : []
      setRespOpts(items.filter((x: any) => x?.id && x?.name).map((x: any) => ({ id: x.id, name: x.name })))
    }).catch(() => {})
    return () => { cancel = true }
  }, [])

  // Reset state quando troca de delivery
  useEffect(() => {
    setTitle(delivery.title)
    setDescription(delivery.description ?? '')
    setHours(String(delivery.hours_planned ?? ''))
    setPriority(delivery.priority)
    setStatus(delivery.status)
    setDue(delivery.due_date ?? '')
    setRespId(delivery.responsible_user_id ? String(delivery.responsible_user_id) : '')
  }, [delivery.id])

  // Esc fecha
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await api.patch<StageDelivery>(`/deliveries/${delivery.id}`, {
        title: title.trim(),
        description: description.trim() || null,
        hours_planned: hours ? Number(hours) : 0,
        priority,
        status,
        due_date: due || null,
        responsible_user_id: respId ? Number(respId) : null,
      })
      onUpdated(updated)
      setTimelineKey(k => k + 1)
      toast.success('Entrega atualizada')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Excluir a entrega "${delivery.title}"?`)) return
    try {
      await api.delete(`/deliveries/${delivery.id}`)
      onDeleted(delivery.id)
      toast.success('Entrega excluída')
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
          width: 'min(480px, 100vw)',
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
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Entrega #{delivery.id}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
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

          <div style={{ marginTop: 14 }}>
            <Field label="Responsável">
              <select
                className="ds-input"
                value={respId}
                onChange={e => setRespId(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">Sem responsável</option>
                {respOpts.map(o => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
            <Field label="Status">
              <select
                className="ds-input"
                value={status}
                onChange={e => setStatus(e.target.value as DeliveryStatus)}
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

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
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
              }}
            >
              Excluir
            </button>
          </div>

          <div style={{ marginTop: 28 }}>
            <div style={{
              fontSize: 11, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '.04em',
              marginBottom: 8,
            }}>
              Atividade
            </div>
            <DeliveryTimeline key={timelineKey} deliveryId={delivery.id} />
          </div>
        </div>
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
