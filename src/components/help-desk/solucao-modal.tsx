'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { sanitizeRich } from '@/lib/sanitize-html'
import { RichEditor, type RichEditorHandle } from './rich-editor'

export interface Solution { diagnostico: string; acao: string; validacao: string }

const MIN_CHARS = 20 // mínimo por campo, SEM contar espaços

/** Nº de caracteres do texto (sem tags/entidades) desconsiderando espaços. */
function nonSpaceLen(html: string): number {
  const el = document.createElement('div'); el.innerHTML = html
  return (el.textContent || '').replace(/\s+/g, '').length
}

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

/** Chave do rascunho local por chamado (+ modo edição, p/ não colidir com "novo"). */
function draftKeyOf(ticketId?: number | string | null, editing?: boolean): string | null {
  if (ticketId == null) return null
  return `hd:solucao-draft:${editing ? 'edit:' : ''}${ticketId}`
}
function loadDraft(key: string | null): Solution | null {
  if (!key || typeof window === 'undefined') return null
  try { const raw = window.localStorage.getItem(key); return raw ? (JSON.parse(raw) as Solution) : null } catch { return null }
}

export function SolucaoModal({ initial, submitLabel = 'Salvar e resolver', ticketId, onClose, onSubmit }: {
  initial?: Solution | null
  submitLabel?: string
  ticketId?: number | string | null
  onClose: () => void
  onSubmit: (s: Solution, body: string) => Promise<void> | void
}) {
  const dRef = useRef<RichEditorHandle>(null)
  const aRef = useRef<RichEditorHandle>(null)
  const vRef = useRef<RichEditorHandle>(null)
  const [saving, setSaving] = useState(false)

  // Rascunho local: se o modal foi fechado sem enviar, recupera o que já estava digitado.
  const draftKey = draftKeyOf(ticketId, !!initial)
  const [draft] = useState<Solution | null>(() => loadDraft(draftKey))
  const [restored, setRestored] = useState<boolean>(!!draft)
  // Valores-semente dos editores (não-controlados). `editorKey` força remontar ao descartar.
  const [seed, setSeed] = useState<Solution>(() => ({
    diagnostico: draft?.diagnostico ?? initial?.diagnostico ?? '',
    acao: draft?.acao ?? initial?.acao ?? '',
    validacao: draft?.validacao ?? initial?.validacao ?? '',
  }))
  const [editorKey, setEditorKey] = useState(0)

  const [lens, setLens] = useState(() => ({
    d: nonSpaceLen(seed.diagnostico), a: nonSpaceLen(seed.acao), v: nonSpaceLen(seed.validacao),
  }))

  // Grava o rascunho a cada digitação e recalcula os contadores.
  const recount = () => {
    const s: Solution = {
      diagnostico: dRef.current?.getHtml() ?? '',
      acao: aRef.current?.getHtml() ?? '',
      validacao: vRef.current?.getHtml() ?? '',
    }
    setLens({ d: nonSpaceLen(s.diagnostico), a: nonSpaceLen(s.acao), v: nonSpaceLen(s.validacao) })
    if (draftKey && typeof window !== 'undefined') {
      const empty = !nonSpaceLen(s.diagnostico) && !nonSpaceLen(s.acao) && !nonSpaceLen(s.validacao)
      try { if (empty) window.localStorage.removeItem(draftKey); else window.localStorage.setItem(draftKey, JSON.stringify(s)) } catch { /* quota/priv */ }
    }
  }
  const clearDraft = () => { if (draftKey) { try { window.localStorage.removeItem(draftKey) } catch { /* ignore */ } } }
  const discardDraft = () => {
    clearDraft()
    const base: Solution = { diagnostico: initial?.diagnostico ?? '', acao: initial?.acao ?? '', validacao: initial?.validacao ?? '' }
    setSeed(base); setEditorKey(k => k + 1); setRestored(false)
    setLens({ d: nonSpaceLen(base.diagnostico), a: nonSpaceLen(base.acao), v: nonSpaceLen(base.validacao) })
  }

  const submit = async () => {
    const s: Solution = {
      diagnostico: dRef.current?.getHtml() ?? '',
      acao: aRef.current?.getHtml() ?? '',
      validacao: vRef.current?.getHtml() ?? '',
    }
    const short = ([
      ['Diagnóstico (Causa)', s.diagnostico],
      ['Ação Realizada (O Ajuste)', s.acao],
      ['Validação (Teste Efetuado)', s.validacao],
    ] as const).filter(([, html]) => nonSpaceLen(html) < MIN_CHARS).map(([label]) => label)
    if (short.length) {
      toast.error(`Preencha com no mínimo ${MIN_CHARS} caracteres (sem contar espaços): ${short.join(', ')}.`); return
    }
    setSaving(true)
    try { await onSubmit(s, composeSolutionBody(s)); clearDraft() } finally { setSaving(false) }
  }

  // Só fecha ao clicar no fundo se o clique COMEÇOU no fundo. Assim, selecionar texto
  // arrastando de dentro do editor e soltar o mouse fora NÃO fecha (e não perde o que foi digitado).
  const downOnBackdrop = useRef(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}
      onMouseDown={e => { downOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose() }}>
      <div className="ds-card p-5 w-full max-w-2xl space-y-3 overflow-y-auto" style={{ background: 'var(--surface)', maxHeight: '90vh' }} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <div className="text-lg font-semibold" style={{ color: 'var(--text)' }}>🛠️ Detalhamento da Solução</div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Todos os campos são obrigatórios (mín. {MIN_CHARS} caracteres cada, espaços não contam). Você pode colar prints de tela.</p>
        {restored && (
          <div className="flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
            <span>📝 Rascunho recuperado (não enviado da última vez).</span>
            <button type="button" className="font-semibold underline shrink-0" onClick={discardDraft}>Descartar rascunho</button>
          </div>
        )}
        <Field label="🔍 Diagnóstico (Causa)" hint="O que estava causando o problema? Ex.: “A regra fiscal estava desatualizada e gerava imposto errado na NF-e.”" count={lens.d}>
          <RichEditor key={`d-${editorKey}`} ref={dRef} initialHtml={seed.diagnostico} minHeight={80} onChange={recount} /></Field>
        <Field label="🚀 Ação Realizada (O Ajuste)" hint="O que você fez para corrigir? Ex.: “Atualizei a alíquota de ICMS e reprocessei as notas do período.”" count={lens.a}>
          <RichEditor key={`a-${editorKey}`} ref={aRef} initialHtml={seed.acao} minHeight={80} onChange={recount} /></Field>
        <Field label="✅ Validação (Teste Efetuado)" hint="Como confirmou que resolveu? Ex.: “Emiti uma NF-e de teste, o imposto saiu correto e o cliente validou.”" count={lens.v}>
          <RichEditor key={`v-${editorKey}`} ref={vRef} initialHtml={seed.validacao} minHeight={80} onChange={recount} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={onClose}>Cancelar</button>
          <button className="ds-btn-primary text-sm px-3 py-1.5 rounded-lg" onClick={submit} disabled={saving}>{saving ? 'Salvando…' : submitLabel}</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, count, children }: { label: string; hint?: string; count?: number; children: React.ReactNode }) {
  const ok = (count ?? 0) >= MIN_CHARS
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>{label}</label>
        {count !== undefined && (
          <span className="text-[11px] font-semibold" style={{ color: ok ? 'var(--success)' : 'var(--danger)' }}>{count}/{MIN_CHARS}{ok ? '' : ' • mínimo'}</span>
        )}
      </div>
      {hint && <p className="text-[11px] mb-1.5 leading-snug" style={{ color: 'var(--text-light)' }}>{hint}</p>}
      {children}
    </div>
  )
}
