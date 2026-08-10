'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { sanitizeRich } from '@/lib/sanitize-html'
import { RichEditor, type RichEditorHandle } from './rich-editor'
import { type Solution, SolutionView, composeSolutionBody } from './solucao-modal'

const MIN = 20
const nonSpaceLen = (html: string) => { const el = document.createElement('div'); el.innerHTML = html; return (el.textContent || '').replace(/\s+/g, '').length }

export interface Gmud {
  itens: { dicionario: boolean; codigo_fonte: boolean; configuracao: boolean; outros: string }
  analista_executor: string; autorizado_por: string; testado_por: string
  data_aplicacao: string; horario: string
  tcloud: boolean; rpo_backup: string; rpo_atual: string
  procedimento: string
  anexos: { fontes: boolean; patch: boolean; evidencia: boolean; print_validacao: boolean; documento_aprovacao: boolean; outros: string }
  solution: Solution
}

const EMPTY: Gmud = {
  itens: { dicionario: false, codigo_fonte: false, configuracao: false, outros: '' },
  analista_executor: '', autorizado_por: '', testado_por: '',
  data_aplicacao: '', horario: '',
  tcloud: false, rpo_backup: '', rpo_atual: '',
  procedimento: '',
  anexos: { fontes: false, patch: false, evidencia: false, print_validacao: false, documento_aprovacao: false, outros: '' },
  solution: { diagnostico: '', acao: '', validacao: '' },
}

const inputStyle = { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const check = (label: string, on: boolean, set: (v: boolean) => void) => (
  <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text)' }}>
    <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} style={{ accentColor: 'var(--primary)' }} /> {label}
  </label>
)

/** HTML composto do GMUD + Solução (body/e-mail). */
export function composeGmudBody(g: Gmud): string {
  const mark = (b: boolean) => b ? '☑' : '☐'
  return '<div style="text-align:center;margin:0 0 12px 0;">'
    + '<img src="/logo.png" alt="ERPSERV" style="height:44px;" />'
    + '<div style="font-size:18px;font-weight:bold;color:#5b21b6;margin-top:6px;">🔧 GMUD EM PRODUÇÃO (Gestão de Mudanças)</div></div>'
    + `<p><strong>📁 1. Itens Alterados</strong></p><ul style="margin:0 0 14px 18px;">`
    + `<li>${mark(g.itens.dicionario)} Dicionário (Campos, Parâmetros, Gatilhos)</li>`
    + `<li>${mark(g.itens.codigo_fonte)} Código Fonte (RDMAKE / Patch)</li>`
    + `<li>${mark(g.itens.configuracao)} Configuração (TSS, AppServer, DBAccess)</li>`
    + (g.itens.outros ? `<li>☑ Outros: ${g.itens.outros}</li>` : '') + '</ul>'
    + `<p><strong>👤 2. Responsáveis</strong></p><div style="margin:0 0 14px 0;">Analista Executor: ${g.analista_executor || '—'}<br/>Autorizado por: ${g.autorizado_por || '—'}<br/>Testado por: ${g.testado_por || '—'}</div>`
    + `<p><strong>📅 3. Execução</strong></p><div style="margin:0 0 14px 0;">Data da aplicação: ${g.data_aplicacao || '—'}<br/>Horário: ${g.horario || '—'}</div>`
    + `<p><strong>💾 4. Controle de Versão (RPO)</strong></p><div style="margin:0 0 14px 0;">${mark(g.tcloud)} Ambiente TCLOUD (não se aplica RPO manual)<br/>RPO Backup (antes): ${g.rpo_backup || '—'}<br/>RPO Atual (após): ${g.rpo_atual || '—'}</div>`
    + `<p><strong>📋 5. Procedimento Executado</strong></p><div style="margin:0 0 14px 0;">${g.procedimento || ''}</div>`
    + `<p><strong>📎 6. Anexos Obrigatórios</strong></p><ul style="margin:0 0 14px 18px;">`
    + `<li>${mark(g.anexos.fontes)} Fontes aplicados (.PRW / .TLPP)</li>`
    + `<li>${mark(g.anexos.patch)} Patch ou pacote aplicado</li>`
    + `<li>${mark(g.anexos.evidencia)} Evidência de compilação</li>`
    + `<li>${mark(g.anexos.print_validacao)} Print de validação/teste</li>`
    + `<li>${mark(g.anexos.documento_aprovacao)} Documento de aprovação</li>`
    + (g.anexos.outros ? `<li>☑ Outros: ${g.anexos.outros}</li>` : '') + '</ul>'
    + '<hr style="border:none;border-top:2px solid #5b21b6;margin:16px 0;" />'
    + composeSolutionBody(g.solution)
}

export function GmudModal({ initial, submitLabel = 'Salvar e resolver (GMUD)', onClose, onSubmit }: {
  initial?: Gmud | null
  submitLabel?: string
  onClose: () => void
  onSubmit: (g: Gmud, body: string) => Promise<void> | void
}) {
  const start = initial ?? EMPTY
  const [g, setG] = useState<Gmud>(start)
  const [saving, setSaving] = useState(false)
  const procRef = useRef<RichEditorHandle>(null)
  const dRef = useRef<RichEditorHandle>(null)
  const aRef = useRef<RichEditorHandle>(null)
  const vRef = useRef<RichEditorHandle>(null)
  const [lens, setLens] = useState({ d: nonSpaceLen(start.solution.diagnostico), a: nonSpaceLen(start.solution.acao), v: nonSpaceLen(start.solution.validacao) })
  const recount = () => setLens({ d: nonSpaceLen(dRef.current?.getHtml() ?? ''), a: nonSpaceLen(aRef.current?.getHtml() ?? ''), v: nonSpaceLen(vRef.current?.getHtml() ?? '') })

  const submit = async () => {
    const sol: Solution = { diagnostico: dRef.current?.getHtml() ?? '', acao: aRef.current?.getHtml() ?? '', validacao: vRef.current?.getHtml() ?? '' }
    const full: Gmud = { ...g, procedimento: procRef.current?.getHtml() ?? '', solution: sol }
    // Obrigatórios do GMUD
    const req: [string, string][] = [['Analista Executor', full.analista_executor], ['Autorizado por', full.autorizado_por], ['Testado por', full.testado_por], ['Data da aplicação', full.data_aplicacao]]
    const missing = req.filter(([, v]) => !String(v).trim()).map(([l]) => l)
    if (missing.length) { toast.error(`Preencha: ${missing.join(', ')}.`); return }
    if (nonSpaceLen(full.procedimento) < 10) { toast.error('Descreva o Procedimento Executado.'); return }
    const short = ([['Diagnóstico', sol.diagnostico], ['Ação Realizada', sol.acao], ['Validação', sol.validacao]] as const).filter(([, h]) => nonSpaceLen(h) < MIN).map(([l]) => l)
    if (short.length) { toast.error(`Mínimo ${MIN} caracteres (sem espaços): ${short.join(', ')}.`); return }
    setSaving(true)
    try { await onSubmit(full, composeGmudBody(full)) } finally { setSaving(false) }
  }

  const lbl = 'text-[11px] font-semibold block mb-0.5'
  // O modal NÃO fecha ao clicar no fundo — só pelo botão Cancelar ou ao salvar.
  // Elimina fechamento acidental ao selecionar texto (mouse OU teclado).
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="ds-card p-5 w-full max-w-2xl space-y-4 overflow-y-auto" style={{ background: 'var(--surface)', maxHeight: '92vh' }}>
        <div className="text-lg font-semibold" style={{ color: 'var(--text)' }}>🔧 GMUD em Produção + Detalhamento da Solução</div>

        {/* 1. Itens Alterados */}
        <div>
          <div className="text-[15px] font-bold mb-1" style={{ color: 'var(--text)' }}>📁 1. Itens Alterados</div>
          <div className="flex flex-col gap-1">
            {check('Dicionário (Campos, Parâmetros, Gatilhos)', g.itens.dicionario, v => setG(s => ({ ...s, itens: { ...s.itens, dicionario: v } })))}
            {check('Código Fonte (RDMAKE / Patch)', g.itens.codigo_fonte, v => setG(s => ({ ...s, itens: { ...s.itens, codigo_fonte: v } })))}
            {check('Configuração (TSS, AppServer, DBAccess)', g.itens.configuracao, v => setG(s => ({ ...s, itens: { ...s.itens, configuracao: v } })))}
            <input placeholder="Outros…" className={`${fieldCls} w-full mt-1`} style={inputStyle} value={g.itens.outros} onChange={e => setG(s => ({ ...s, itens: { ...s.itens, outros: e.target.value } }))} />
          </div>
        </div>

        {/* 2. Responsáveis */}
        <div>
          <div className="text-[15px] font-bold mb-1" style={{ color: 'var(--text)' }}>👤 2. Responsáveis</div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Analista Executor *</label><input className={`${fieldCls} w-full`} style={inputStyle} value={g.analista_executor} onChange={e => setG(s => ({ ...s, analista_executor: e.target.value }))} /></div>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Autorizado por *</label><input className={`${fieldCls} w-full`} style={inputStyle} value={g.autorizado_por} onChange={e => setG(s => ({ ...s, autorizado_por: e.target.value }))} /></div>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Testado por *</label><input className={`${fieldCls} w-full`} style={inputStyle} value={g.testado_por} onChange={e => setG(s => ({ ...s, testado_por: e.target.value }))} /></div>
          </div>
        </div>

        {/* 3. Execução */}
        <div>
          <div className="text-[15px] font-bold mb-1" style={{ color: 'var(--text)' }}>📅 3. Execução</div>
          <div className="flex gap-2">
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Data da aplicação *</label><input type="date" className={fieldCls} style={inputStyle} value={g.data_aplicacao} onChange={e => setG(s => ({ ...s, data_aplicacao: e.target.value }))} /></div>
            <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Horário</label><input type="time" className={fieldCls} style={inputStyle} value={g.horario} onChange={e => setG(s => ({ ...s, horario: e.target.value }))} /></div>
          </div>
        </div>

        {/* 4. RPO */}
        <div>
          <div className="text-[15px] font-bold mb-1" style={{ color: 'var(--text)' }}>💾 4. Controle de Versão (RPO)</div>
          {check('Ambiente TCLOUD (não se aplica RPO manual)', g.tcloud, v => setG(s => ({ ...s, tcloud: v })))}
          {!g.tcloud && (
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div><label className={lbl} style={{ color: 'var(--text-light)' }}>RPO Backup (antes)</label><input className={`${fieldCls} w-full`} style={inputStyle} value={g.rpo_backup} onChange={e => setG(s => ({ ...s, rpo_backup: e.target.value }))} /></div>
              <div><label className={lbl} style={{ color: 'var(--text-light)' }}>RPO Atual (após)</label><input className={`${fieldCls} w-full`} style={inputStyle} value={g.rpo_atual} onChange={e => setG(s => ({ ...s, rpo_atual: e.target.value }))} /></div>
            </div>
          )}
        </div>

        {/* 5. Procedimento */}
        <div>
          <div className="text-[15px] font-bold mb-1" style={{ color: 'var(--text)' }}>📋 5. Procedimento Executado *</div>
          <p className="text-[11px] mb-1" style={{ color: 'var(--text-light)' }}>Descreva objetivamente as etapas aplicadas em produção conforme planejamento aprovado.</p>
          <RichEditor ref={procRef} initialHtml={start.procedimento} minHeight={80} />
        </div>

        {/* 6. Anexos */}
        <div>
          <div className="text-[15px] font-bold mb-1" style={{ color: 'var(--text)' }}>📎 6. Anexos Obrigatórios</div>
          <div className="flex flex-col gap-1">
            {check('Fontes aplicados (.PRW / .TLPP)', g.anexos.fontes, v => setG(s => ({ ...s, anexos: { ...s.anexos, fontes: v } })))}
            {check('Patch ou pacote aplicado', g.anexos.patch, v => setG(s => ({ ...s, anexos: { ...s.anexos, patch: v } })))}
            {check('Evidência de compilação', g.anexos.evidencia, v => setG(s => ({ ...s, anexos: { ...s.anexos, evidencia: v } })))}
            {check('Print de validação/teste', g.anexos.print_validacao, v => setG(s => ({ ...s, anexos: { ...s.anexos, print_validacao: v } })))}
            {check('Documento de aprovação', g.anexos.documento_aprovacao, v => setG(s => ({ ...s, anexos: { ...s.anexos, documento_aprovacao: v } })))}
            <input placeholder="Outros…" className={`${fieldCls} w-full mt-1`} style={inputStyle} value={g.anexos.outros} onChange={e => setG(s => ({ ...s, anexos: { ...s.anexos, outros: e.target.value } }))} />
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '2px solid var(--primary)' }} />

        {/* Detalhamento da Solução */}
        <div className="text-lg font-semibold" style={{ color: 'var(--text)' }}>🛠️ Detalhamento da Solução</div>
        <SolField label="🔍 Diagnóstico (Causa)" count={lens.d}><RichEditor ref={dRef} initialHtml={start.solution.diagnostico} minHeight={70} onChange={recount} /></SolField>
        <SolField label="🚀 Ação Realizada (O Ajuste)" count={lens.a}><RichEditor ref={aRef} initialHtml={start.solution.acao} minHeight={70} onChange={recount} /></SolField>
        <SolField label="✅ Validação (Teste Efetuado)" count={lens.v}><RichEditor ref={vRef} initialHtml={start.solution.validacao} minHeight={70} onChange={recount} /></SolField>

        <div className="flex justify-end gap-2 pt-1">
          <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={onClose}>Cancelar</button>
          <button className="ds-btn-primary text-sm px-3 py-1.5 rounded-lg" onClick={submit} disabled={saving}>{saving ? 'Salvando…' : submitLabel}</button>
        </div>
      </div>
    </div>
  )
}

function SolField({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const ok = count >= MIN
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>{label}</label>
        <span className="text-[11px] font-semibold" style={{ color: ok ? 'var(--success)' : 'var(--danger)' }}>{count}/{MIN}{ok ? '' : ' • mínimo'}</span>
      </div>
      {children}
    </div>
  )
}

/** Render do GMUD no timeline (fundo papel). */
export function GmudView({ gmud }: { gmud: Gmud }) {
  const mark = (b: boolean) => b ? '☑' : '☐'
  const row = (k: string, v: string) => <div><strong>{k}:</strong> {v || '—'}</div>
  return (
    <div className="rounded-lg p-4 text-sm" style={{ background: '#ffffff', color: '#1f2937', border: '1px solid #e5e7eb' }}>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="ERPSERV" style={{ height: 44, display: 'inline-block' }} />
        <div style={{ fontSize: 18, fontWeight: 700, color: '#5b21b6', marginTop: 6 }}>🔧 GMUD EM PRODUÇÃO (Gestão de Mudanças)</div>
      </div>
      <div style={{ marginBottom: 14 }}><div style={{ fontWeight: 700, marginBottom: 4 }}>📁 1. Itens Alterados</div>
        <div>{mark(gmud.itens.dicionario)} Dicionário · {mark(gmud.itens.codigo_fonte)} Código Fonte · {mark(gmud.itens.configuracao)} Configuração{gmud.itens.outros ? ` · Outros: ${gmud.itens.outros}` : ''}</div></div>
      <div style={{ marginBottom: 14 }}><div style={{ fontWeight: 700, marginBottom: 4 }}>👤 2. Responsáveis</div>
        {row('Analista Executor', gmud.analista_executor)}{row('Autorizado por', gmud.autorizado_por)}{row('Testado por', gmud.testado_por)}</div>
      <div style={{ marginBottom: 14 }}><div style={{ fontWeight: 700, marginBottom: 4 }}>📅 3. Execução</div>
        {row('Data da aplicação', gmud.data_aplicacao)}{row('Horário', gmud.horario)}</div>
      <div style={{ marginBottom: 14 }}><div style={{ fontWeight: 700, marginBottom: 4 }}>💾 4. Controle de Versão (RPO)</div>
        <div>{mark(gmud.tcloud)} Ambiente TCLOUD (não se aplica RPO manual)</div>{!gmud.tcloud && <>{row('RPO Backup (antes)', gmud.rpo_backup)}{row('RPO Atual (após)', gmud.rpo_atual)}</>}</div>
      <div style={{ marginBottom: 14 }}><div style={{ fontWeight: 700, marginBottom: 4 }}>📋 5. Procedimento Executado</div>
        <div className="hd-rich" dangerouslySetInnerHTML={{ __html: sanitizeRich(gmud.procedimento || '') }} /></div>
      <div style={{ marginBottom: 14 }}><div style={{ fontWeight: 700, marginBottom: 4 }}>📎 6. Anexos Obrigatórios</div>
        <div>{mark(gmud.anexos.fontes)} Fontes · {mark(gmud.anexos.patch)} Patch · {mark(gmud.anexos.evidencia)} Ev. compilação · {mark(gmud.anexos.print_validacao)} Print · {mark(gmud.anexos.documento_aprovacao)} Doc. aprovação{gmud.anexos.outros ? ` · Outros: ${gmud.anexos.outros}` : ''}</div></div>
      <hr style={{ border: 'none', borderTop: '2px solid #5b21b6', margin: '16px 0' }} />
      <SolutionView solution={gmud.solution} />
    </div>
  )
}
