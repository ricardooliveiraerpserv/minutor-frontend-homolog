'use client'

/**
 * Modal — modal canônico do Minutor.
 *
 * Estrutura:
 *   <Modal open={open} onClose={() => setOpen(false)} size="md">
 *     <ModalHeader title="Editar Projeto" subtitle="Atualize as informações" />
 *     <ModalBody>
 *       <Input ... />
 *     </ModalBody>
 *     <ModalFooter>
 *       <button className="ds-btn-secondary" onClick={onClose}>Cancelar</button>
 *       <button className="ds-btn-primary" onClick={onSave}>Salvar</button>
 *     </ModalFooter>
 *   </Modal>
 *
 * Visual:
 *  - Overlay: rgba(0,0,0,0.45) (= --shadow-overlay backdrop)
 *  - Box: var(--surface) + var(--border) + var(--shadow-lg) + rounded-2xl
 *  - Header: 16-20px padding + border-bottom var(--border)
 *  - Body: 20px padding
 *  - Footer: 16-20px padding + border-top var(--border) + flex justify-end gap-2
 *
 * Acessibilidade: ESC fecha, clicar fora fecha, z-index 70.
 */

import * as React from 'react'
import { X as CloseIcon } from 'lucide-react'

const SIZE_MAP = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
} as const

interface ModalProps {
  open: boolean
  onClose: () => void
  /** Tamanho do modal. Default md. */
  size?: keyof typeof SIZE_MAP
  /** Fechar ao clicar no overlay. Default true. */
  closeOnOverlay?: boolean
  /** Fechar com tecla ESC. Default true. */
  closeOnEscape?: boolean
  /** z-index. Default 70. */
  zIndex?: number
  children: React.ReactNode
}

export function Modal({
  open, onClose, size = 'md',
  closeOnOverlay = true, closeOnEscape = true,
  zIndex = 70, children,
}: ModalProps) {
  React.useEffect(() => {
    if (!open || !closeOnEscape) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeOnEscape, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 animate-in fade-in-0 duration-150"
      style={{ background: 'rgba(0,0,0,0.45)', zIndex }}
      onClick={closeOnOverlay ? (e) => { if (e.target === e.currentTarget) onClose() } : undefined}
    >
      <div
        className={`flex flex-col w-full ${SIZE_MAP[size]} max-h-[90vh] rounded-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200`}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

// ─── Header ──────────────────────────────────────────────────────────────────

interface ModalHeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Ícone à esquerda do título (chip soft). */
  icon?: React.ElementType
  /** Esconder botão de fechar. */
  hideClose?: boolean
  onClose?: () => void
}

export function ModalHeader({ title, subtitle, icon: Icon, hideClose, onClose }: ModalHeaderProps) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-5 py-4 shrink-0"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
          >
            <Icon size={15} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-base font-semibold truncate" style={{ color: 'var(--text)' }}>{title}</h2>
          {subtitle && (
            <p className="text-[12px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
          )}
        </div>
      </div>
      {!hideClose && onClose && (
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          aria-label="Fechar modal"
        >
          <CloseIcon size={16} />
        </button>
      )}
    </div>
  )
}

// ─── Body ────────────────────────────────────────────────────────────────────

export function ModalBody({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex-1 overflow-y-auto px-5 py-5 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

// ─── Footer ──────────────────────────────────────────────────────────────────

export function ModalFooter({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex items-center justify-end gap-2 px-5 py-3 shrink-0 ${className}`}
      style={{ borderTop: '1px solid var(--border)' }}
      {...props}
    >
      {children}
    </div>
  )
}
