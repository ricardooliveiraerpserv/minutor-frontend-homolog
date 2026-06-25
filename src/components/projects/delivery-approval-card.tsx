'use client'

import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { ShieldCheck, ShieldQuestion, ShieldX, Send, Check, X } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import type { StageDelivery } from '@/lib/types/project-stage'
import { ApprovalRequestModal } from './approval-request-modal'

/**
 * Workflow de aprovação do cliente na atividade. Aparece no painel interno.
 * - Card em "Aguardando cliente" → pode Aprovar / Reprovar (em nome do cliente)
 *   ou Reenviar a solicitação. Coordenador/admin.
 * - Mesma rotina existe no Portal do Cliente (o cliente aprova lá).
 */
export function DeliveryApprovalCard({ delivery, onChanged }: {
  delivery: StageDelivery
  onChanged: (d: StageDelivery) => void
}) {
  const { user } = useAuth()
  const canManage = user?.type === 'admin' || user?.type === 'coordenador'
  const [busy, setBusy] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)

  const st = delivery.approval_status ?? 'none'
  const isWaiting = delivery.status === 'waiting_client'

  // Nada a mostrar: sem aprovação e fora de "Aguardando cliente".
  if (st === 'none' && !isWaiting) return null

  async function act(path: string, withNote?: 'approve' | 'reject') {
    let note: string | null = null
    if (withNote === 'reject') {
      note = window.prompt('Motivo / ajustes solicitados (opcional):') ?? null
      if (note === null) return // cancelou
    }
    setBusy(true)
    try {
      const updated = await api.post<StageDelivery>(`/deliveries/${delivery.id}/${path}`, note != null ? { note } : {})
      onChanged(updated)
      toast.success(path === 'approve' ? 'Atividade aprovada' : path === 'reject' ? 'Ajustes solicitados' : 'Aprovação solicitada')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro na aprovação')
    } finally {
      setBusy(false)
    }
  }

  // Cores/ícone por estado
  const cfg = st === 'approved'
    ? { bg: 'var(--success-bg)', fg: 'var(--success)', icon: ShieldCheck, label: 'Aprovado pelo cliente' }
    : st === 'pending'
      ? { bg: 'var(--warning-bg)', fg: 'var(--warning)', icon: ShieldQuestion, label: 'Aguardando aprovação do cliente' }
      : (st === 'rejected' || st === 'changes_requested')
        ? { bg: 'var(--info-bg)', fg: 'var(--info)', icon: ShieldX, label: 'Ajustes solicitados pelo cliente' }
        : { bg: 'var(--surface)', fg: 'var(--text-muted)', icon: ShieldQuestion, label: 'Sem aprovação' }
  const Icon = cfg.icon

  return (
    <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: cfg.bg, border: `1px solid ${cfg.fg}33` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={16} style={{ color: cfg.fg }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: cfg.fg }}>{cfg.label}</span>
      </div>

      {delivery.approval_note && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
          “{delivery.approval_note}”
        </div>
      )}

      {(st === 'approved' || st === 'rejected' || st === 'changes_requested') && (delivery.approval_decider?.name || delivery.approval_decided_at) && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          {st === 'approved' ? 'Aprovado' : 'Ajustes solicitados'}
          {delivery.approval_decider?.name ? ` por ${delivery.approval_decider.name}` : ''}
          {delivery.approval_decided_at ? ` · ${fmtDateTime(delivery.approval_decided_at)}` : ''}
        </div>
      )}

      {!canManage && st === 'pending' && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          O cliente envolvido aprova pelo Portal do Cliente.
        </div>
      )}

      {canManage && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {st === 'pending' && (
            <>
              <button onClick={() => act('approve')} disabled={busy} style={btn('var(--success)')}>
                <Check size={13} /> Aprovar
              </button>
              <button onClick={() => act('reject', 'reject')} disabled={busy} style={btn('var(--info)')}>
                <X size={13} /> Solicitar ajustes
              </button>
              <button onClick={() => setRequestOpen(true)} disabled={busy} style={btn('var(--text-muted)')}>
                <Send size={13} /> Reenviar
              </button>
            </>
          )}
          {st !== 'pending' && (
            <button onClick={() => setRequestOpen(true)} disabled={busy} style={btn('var(--primary)')}>
              <Send size={13} /> Solicitar aprovação
            </button>
          )}
        </div>
      )}

      {requestOpen && (
        <ApprovalRequestModal
          deliveryId={delivery.id}
          title={delivery.title}
          onClose={() => setRequestOpen(false)}
          onDone={(u) => { setRequestOpen(false); onChanged(u) }}
        />
      )}
    </div>
  )
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function btn(color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6,
    cursor: 'pointer', background: 'transparent', border: `1px solid ${color}`, color,
  }
}
