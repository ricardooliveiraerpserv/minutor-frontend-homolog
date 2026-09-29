'use client'

import { AlertTriangle, Trash2 } from 'lucide-react'

/** Modal de confirmação temático (substitui window.confirm). */
export function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar',
  danger = false, busy = false, icon, onConfirm, onCancel,
}: {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  icon?: React.ReactNode
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  const Ic = icon ?? (danger ? <Trash2 size={18} style={{ color: 'var(--danger-border)' }} /> : <AlertTriangle size={18} style={{ color: 'var(--primary)' }} />)
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onCancel} onKeyDown={e => { if (e.key === 'Escape') onCancel() }}>
      <div className="w-full max-w-sm rounded-2xl p-5 shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: danger ? 'var(--danger-bg)' : 'var(--primary-soft)' }}>{Ic}</div>
          <div className="min-w-0 pt-0.5">
            <h3 className="text-base font-bold leading-tight" style={{ color: 'var(--text)' }}>{title}</h3>
            {message && <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{message}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{cancelLabel}</button>
          <button onClick={onConfirm} disabled={busy} autoFocus className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60" style={danger ? { background: 'var(--danger-border)', color: '#fff' } : { background: 'var(--primary)', color: 'var(--primary-fg)' }}>{busy ? 'Aguarde…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
