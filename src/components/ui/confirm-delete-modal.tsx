'use client'

import { Trash2 } from 'lucide-react'
import { Button } from './button'

interface Props {
  open: boolean
  title?: string
  message?: string
  confirmLabel?: string
  loading?: boolean
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmDeleteModal({ open, title, message, confirmLabel, loading, onClose, onConfirm }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-sm shadow-xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--danger-bg)] flex items-center justify-center shrink-0">
            <Trash2 size={18} className="text-[var(--danger)]" />
          </div>
          <h3 className="text-base font-semibold text-[var(--text)]">{title ?? 'Confirmar exclusão'}</h3>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          {message ?? 'Deseja excluir este item? Esta ação não pode ser desfeita.'}
        </p>
        <div className="flex gap-3 justify-end pt-1">
          <Button variant="outline" onClick={onClose} disabled={loading}
            className="border-[var(--border)] text-[var(--text)]">
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={loading}
            className="bg-[var(--danger-border)] hover:bg-[var(--danger)] text-[var(--primary-fg)]">
            {loading ? 'Aguarde...' : (confirmLabel ?? 'Excluir')}
          </Button>
        </div>
      </div>
    </div>
  )
}
