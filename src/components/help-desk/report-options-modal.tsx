'use client'

import { useState } from 'react'
import { X, FileText } from 'lucide-react'

// Opções do "Relatório de serviço (PDF)": todas as interações + assinatura sempre;
// apontamentos (horas por interação + tabela final) são opcionais.

export function ReportOptionsModal({ onClose, onGenerate }: { onClose: () => void; onGenerate: (includeApontamentos: boolean) => void }) {
  const [apont, setApont] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="ds-card w-full max-w-md overflow-hidden" style={{ padding: 0 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <FileText size={15} style={{ color: 'var(--primary)' }} /> Relatório de serviço
          </div>
          <button onClick={onClose}><X size={16} style={{ color: 'var(--text-light)' }} /></button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            O relatório traz <b>todas as interações</b> do chamado e a <b>assinatura do responsável</b>.
          </p>
          <button type="button" onClick={() => setApont(v => !v)} className="flex items-start gap-2.5 w-full text-left px-3 py-2 rounded-lg ds-row-hover">
            <span className="mt-0.5 w-4 h-4 rounded shrink-0 flex items-center justify-center" style={{ background: apont ? 'var(--primary)' : 'var(--surface-sunken)', border: `1px solid ${apont ? 'var(--primary)' : 'var(--border)'}` }}>
              {apont && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.5 2.5 4.5-5.5" stroke="var(--primary-fg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </span>
            <span>
              <span className="text-sm font-medium block" style={{ color: 'var(--text)' }}>Incluir apontamentos</span>
              <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>Mostra as horas em cada interação e uma tabela de apontamentos no final.</span>
            </span>
          </button>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button className="ds-btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="ds-btn-primary inline-flex items-center gap-1.5" onClick={() => { onGenerate(apont); onClose() }}>
            <FileText size={14} /> Gerar PDF
          </button>
        </div>
      </div>
    </div>
  )
}
