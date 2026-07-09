'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { RichEditor, type RichEditorHandle } from './rich-editor'

export interface Solution { diagnostico: string; acao: string; validacao: string }

const strip = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
const hasContent = (html: string) => strip(html) !== '' || /<img/i.test(html)

/** HTML composto (renderiza como texto na timeline). As 3 seções vêm com prints inline. */
export function composeSolutionBody(s: Solution): string {
  return '<h3>🛠️ Detalhamento da Solução</h3>'
    + '<p><strong>🔍 Diagnóstico (Causa)</strong></p>' + (s.diagnostico || '')
    + '<p><strong>🚀 Ação Realizada (O Ajuste)</strong></p>' + (s.acao || '')
    + '<p><strong>✅ Validação (Teste Efetuado)</strong></p>' + (s.validacao || '')
}

export function SolucaoModal({ initial, submitLabel = 'Salvar e resolver', onClose, onSubmit }: {
  initial?: Solution | null
  submitLabel?: string
  onClose: () => void
  onSubmit: (s: Solution, body: string) => Promise<void> | void
}) {
  const dRef = useRef<RichEditorHandle>(null)
  const aRef = useRef<RichEditorHandle>(null)
  const vRef = useRef<RichEditorHandle>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const s: Solution = {
      diagnostico: dRef.current?.getHtml() ?? '',
      acao: aRef.current?.getHtml() ?? '',
      validacao: vRef.current?.getHtml() ?? '',
    }
    if (!hasContent(s.diagnostico) || !hasContent(s.acao) || !hasContent(s.validacao)) {
      toast.error('Preencha Diagnóstico, Ação Realizada e Validação.'); return
    }
    setSaving(true)
    try { await onSubmit(s, composeSolutionBody(s)) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="ds-card p-5 w-full max-w-2xl space-y-3 overflow-y-auto" style={{ background: 'var(--surface)', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        <div className="text-lg font-semibold" style={{ color: 'var(--text)' }}>🛠️ Detalhamento da Solução</div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Obrigatório ao resolver. Você pode colar prints de tela em cada campo.</p>
        <Field label="🔍 Diagnóstico (Causa)"><RichEditor ref={dRef} initialHtml={initial?.diagnostico ?? ''} minHeight={80} /></Field>
        <Field label="🚀 Ação Realizada (O Ajuste)"><RichEditor ref={aRef} initialHtml={initial?.acao ?? ''} minHeight={80} /></Field>
        <Field label="✅ Validação (Teste Efetuado)"><RichEditor ref={vRef} initialHtml={initial?.validacao ?? ''} minHeight={80} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={onClose}>Cancelar</button>
          <button className="ds-btn-primary text-sm px-3 py-1.5 rounded-lg" onClick={submit} disabled={saving}>{saving ? 'Salvando…' : submitLabel}</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>{children}</div>
}
