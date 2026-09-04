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

interface AlertOpts {
  title?: string
  message: React.ReactNode
  okLabel?: string
  danger?: boolean
}

type State =
  | { mode: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { mode: 'alert'; opts: AlertOpts; resolve: () => void }

/**
 * Diálogos centrais estilizados (substituem window.confirm/alert e toasts de bloqueio). Uso:
 *   const { confirm, alert, confirmDialog } = useConfirm()
 *   if (!(await confirm({ message: 'Excluir?', danger: true }))) return
 *   await alert({ title: 'Atenção', message: '…', danger: true })   // aviso central, 1 botão
 *   ...e renderize {confirmDialog} no JSX (serve para confirm E alert).
 */
export function useConfirm() {
  const [state, setState] = React.useState<State | null>(null)

  const confirm = React.useCallback(
    (opts: ConfirmOpts) => new Promise<boolean>(resolve => setState({ mode: 'confirm', opts, resolve })),
    [],
  )
  const alert = React.useCallback(
    (opts: AlertOpts) => new Promise<void>(resolve => setState({ mode: 'alert', opts, resolve })),
    [],
  )

  const closeConfirm = (value: boolean) => {
    if (state?.mode === 'confirm') state.resolve(value)
    setState(null)
  }
  const closeAlert = () => {
    if (state?.mode === 'alert') state.resolve()
    setState(null)
  }

  let confirmDialog: React.ReactNode = null
  if (state?.mode === 'confirm') {
    const o = state.opts
    confirmDialog = (
      <Modal open onClose={() => closeConfirm(false)} size="sm">
        <ModalHeader title={o.title ?? 'Confirmar'} icon={o.danger ? AlertTriangle : undefined} onClose={() => closeConfirm(false)} />
        <ModalBody>
          <div className="text-sm" style={{ color: 'var(--text)' }}>{o.message}</div>
        </ModalBody>
        <ModalFooter>
          <button className="ds-btn-secondary" onClick={() => closeConfirm(false)}>{o.cancelLabel ?? 'Cancelar'}</button>
          <button className="ds-btn-primary" style={o.danger ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : undefined} onClick={() => closeConfirm(true)}>
            {o.confirmLabel ?? 'Confirmar'}
          </button>
        </ModalFooter>
      </Modal>
    )
  } else if (state?.mode === 'alert') {
    const o = state.opts
    confirmDialog = (
      <Modal open onClose={closeAlert} size="sm">
        <ModalHeader title={o.title ?? 'Atenção'} icon={AlertTriangle} onClose={closeAlert} />
        <ModalBody>
          <div className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{o.message}</div>
        </ModalBody>
        <ModalFooter>
          <button className="ds-btn-primary" style={o.danger ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : undefined} onClick={closeAlert}>
            {o.okLabel ?? 'Entendi'}
          </button>
        </ModalFooter>
      </Modal>
    )
  }

  return { confirm, alert, confirmDialog }
}
