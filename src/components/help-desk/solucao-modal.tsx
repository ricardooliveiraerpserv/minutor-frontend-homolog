'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { sanitizeRich } from '@/lib/sanitize-html'
import { RichEditor, type RichEditorHandle } from './rich-editor'

export interface Solution { diagnostico: string; acao: string; validacao: string }

const strip = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
const hasContent = (html: string) => strip(html) !== '' || /<img/i.test(html)

/**
 * HTML composto (usado no `body` da interação e no e-mail): logo + título centralizado +
 * as 3 seções com ESPAÇAMENTO. Prints vêm inline nas seções.
 */
export function composeSolutionBody(s: Solution): string {
  const sec = (emoji: string, title: string, html: string) =>
    `<div style="margin:0 0 18px 0;"><p style="font-weight:bold;margin:0 0 4px 0;">${emoji} ${title}</p>`
    + `<div style="padding-left:6px;">${html || ''}</div></div>`
  return '<div style="text-align:center;margin:0 0 14px 0;">'
    + '<img src="/logo.png" alt="ERPSERV" style="height:44px;" />'
    + '<div style="font-size:18px;font-weight:bold;color:#5b21b6;margin-top:6px;">🛠️ Detalhamento da Solução</div></div>'
    + sec('🔍', 'Diagnóstico (Causa)', s.diagnostico)
    + sec('🚀', 'Ação Realizada (O Ajuste)', s.acao)
    + sec('✅', 'Validação (Teste Efetuado)', s.validacao)
}

/** Render dedicado da solução no timeline (logo + título + seções espaçadas, fundo papel). */
export function SolutionView({ solution }: { solution: Solution }) {
  const sec = (emoji: string, title: string, html: string) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{emoji} {title}</div>
      <div className="hd-rich" style={{ paddingLeft: 8 }} dangerouslySetInnerHTML={{ __html: sanitizeRich(html || '') }} />
    </div>
  )
  return (
    <div className="rounded-lg p-4" style={{ background: '#ffffff', color: '#1f2937', border: '1px solid #e5e7eb' }}>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="ERPSERV" style={{ height: 44, display: 'inline-block' }} />
        <div style={{ fontSize: 18, fontWeight: 700, color: '#5b21b6', marginTop: 6 }}>🛠️ Detalhamento da Solução</div>
      </div>
      {sec('🔍', 'Diagnóstico (Causa)', solution.diagnostico)}
      {sec('🚀', 'Ação Realizada (O Ajuste)', solution.acao)}
      {sec('✅', 'Validação (Teste Efetuado)', solution.validacao)}
    </div>
  )
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
