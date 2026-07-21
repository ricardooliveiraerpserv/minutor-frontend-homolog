'use client'

import * as React from 'react'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal'
import { AlertTriangle } from 'lucide-react'

interface ConfirmOpts {
  title?: string
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

/**
 * Confirmação estilizada (substitui o window.confirm nativo). Uso:
 *   const { confirm, confirmDialog } = useConfirm()
 *   if (!(await confirm({ message: 'Excluir?' , danger: true }))) return
 *   ...e renderize {confirmDialog} no JSX da página.
 */
export function useConfirm() {
  const [state, setState] = React.useState<{ opts: ConfirmOpts; resolve: (v: boolean) => void } | null>(null)

  const confirm = React.useCallback((opts: ConfirmOpts) => new Promise<boolean>(resolve => setState({ opts, resolve })), [])

  const close = (value: boolean) => { state?.resolve(value); setState(null) }

  const confirmDialog = state ? (
    <Modal open onClose={() => close(false)} size="sm">
      <ModalHeader title={state.opts.title ?? 'Confirmar'} icon={state.opts.danger ? AlertTriangle : undefined} onClose={() => close(false)} />
      <ModalBody>
        <div className="text-sm" style={{ color: 'var(--text)' }}>{state.opts.message}</div>
      </ModalBody>
      <ModalFooter>
        <button className="ds-btn-secondary" onClick={() => close(false)}>{state.opts.cancelLabel ?? 'Cancelar'}</button>
        <button className="ds-btn-primary" style={state.opts.danger ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : undefined} onClick={() => close(true)}>
          {state.opts.confirmLabel ?? 'Confirmar'}
        </button>
      </ModalFooter>
    </Modal>
  ) : null

  return { confirm, confirmDialog }
}
