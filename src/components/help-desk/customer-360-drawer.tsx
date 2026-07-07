'use client'

import { Customer360Panel } from '@/components/help-desk/customer-360-panel'
import { X, Building2 } from 'lucide-react'

// Drawer lateral direito (~35%) com o Customer 360 COMPLETO (componente inalterado).
// O chamado permanece totalmente visível (sem overlay escuro). Abre/fecha sem recarregar.
// O Customer360Panel só monta quando aberto → a telemetria customer_360.viewed/closed
// passa a refletir a INTENÇÃO real (abrir/fechar o contexto).
export function Customer360Drawer({ open, ticketId, onClose, onRunPlaybook }: { open: boolean; ticketId: number; onClose: () => void; onRunPlaybook?: (playbookId: number) => void }) {
  if (!open) return null
  return (
    <>
      {/* Captura clique fora p/ fechar — transparente, mantém o chamado visível. */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <aside
        className="fixed top-0 right-0 z-50 h-full w-[35%] min-w-[360px] max-w-[560px] overflow-y-auto shadow-2xl"
        style={{ background: 'var(--bg)', borderLeft: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--text)' }}>
            <Building2 size={15} style={{ color: 'var(--primary)' }} /> Contexto do cliente
          </span>
          <button onClick={onClose} className="rounded-lg p-1 ds-row-hover" aria-label="Fechar contexto"><X size={18} style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        <div className="p-3">
          <Customer360Panel ticketId={ticketId} onRunPlaybook={onRunPlaybook} />
        </div>
      </aside>
    </>
  )
}
