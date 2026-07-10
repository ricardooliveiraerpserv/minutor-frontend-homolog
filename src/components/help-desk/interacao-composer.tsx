'use client'

import { useState, useRef, useImperativeHandle, forwardRef } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { sanitizeRich } from '@/lib/sanitize-html'
import { Send, Paperclip, X, FileText, Clock, Lock, Zap, ChevronDown } from 'lucide-react'
import { TimeSelect5 } from './time-select-5'

// Macro (ex-playbook): só preenche o texto da interação.
export interface MacroItem { id: number; name: string; color?: string | null; category?: string | null; reply?: string | null; internal?: string | null }
export interface ComposerHandle { insertMacroReply: (text: string) => void }

// Data local (YYYY-MM-DD) — NÃO usar toISOString (UTC empurra p/ o dia seguinte à noite no Brasil).
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// HH:MM a partir de início→fim; '' se inválido/incompleto.
function deriveTotal(start: string, end: string): string {
  if (!start || !end) return ''
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  if (!Number.isFinite(mins) || mins <= 0) return ''
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`
}

// Compositor de interação estilo e-mail:
//  • campo amplo (contenteditable) — o PRINT colado entra INLINE no texto (imagem embutida),
//    exatamente onde está o cursor; não vira anexo separado.
//  • botão "Anexar" continua para ARQUIVOS (pdf, planilha, etc.) → vão como anexo.
// O corpo é enviado como HTML sanitizado; imagens inline são data:URI auto-contidas.
export interface ComposerStatus { id: number; label: string; is_resolved?: boolean; allows_scheduling?: boolean }
export const InteracaoComposer = forwardRef<ComposerHandle, {
  ticketId: number
  onSent: () => void
  statuses?: ComposerStatus[]
  currentStatusId?: number
  onApplyStatus?: (statusId: number) => void | Promise<void>
  onSchedule?: (date: string, time: string) => void | Promise<void>   // agenda (pausa SLA) quando o status permite
  formStatusIds?: number[]      // status que têm FORMULÁRIO (abre ao selecionar)
  onFormStatus?: (statusId: number) => void
  macros?: MacroItem[]          // macros (ex-playbooks) — preenchem o texto
  signature?: string            // assinatura anexada às RESPOSTAS AO CLIENTE
}>(function InteracaoComposer({ ticketId, onSent, statuses = [], currentStatusId, onApplyStatus, onSchedule, formStatusIds = [], onFormStatus, macros = [], signature }, ref) {
  const [visibility, setVisibility] = useState<'customer' | 'internal'>('customer')
  // Status é OBRIGATÓRIO antes de escrever (há status com formulário). Começa em "Selecione";
  // a resposta só libera após escolher. Escolher o status atual = manter.
  const [sendStatus, setSendStatus] = useState<number | undefined>(undefined)
  const [files, setFiles] = useState<File[]>([])
  const [empty, setEmpty] = useState(true)
  const [sending, setSending] = useState(false)
  // Tempo trabalhado NESTA interação (opcional). Movimenta horas quando o contrato
  // de sustentação tem a chave de integração ligada (substitui o Movidesk).
  const [workedDate, setWorkedDate] = useState(localToday())
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [totalHours, setTotalHours] = useState('')
  const [noCharge, setNoCharge] = useState(false)
  // Agendamento inline: aparece quando o status escolhido "permite agendamento".
  const [schedDate, setSchedDate] = useState('')
  const [schedTime, setSchedTime] = useState('')
  const selStatus = statuses.find(s => s.id === sendStatus)
  const canSchedule = !!selStatus?.allows_scheduling
  const derivedTotal = deriveTotal(startTime, endTime)
  const totalDisplay = totalHours || derivedTotal
  const edRef = useRef<HTMLDivElement>(null)
  // Chave de idempotência por mensagem: reusada em retentativas (não duplica), zerada no sucesso.
  const idemRef = useRef<string | null>(null)

  const syncEmpty = () => { const ed = edRef.current; setEmpty(!ed || ed.textContent?.trim() === '' && !ed.querySelector('img')) }

  // Macro (ex-playbook): APENAS insere o texto no campo de resposta. Só após escolher o status.
  const [macroOpen, setMacroOpen] = useState(false)
  const insertMacroReply = (text: string) => {
    if (!sendStatus) { toast.error('Escolha o status antes de aplicar a macro.'); return }
    const t = (text ?? '').trim()
    if (!t) { toast.error('Esta macro não tem texto de resposta.'); return }
    const ed = edRef.current; if (!ed) return
    ed.focus()
    const safe = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
    document.execCommand('insertHTML', false, (ed.textContent?.trim() ? '<br>' : '') + safe)
    syncEmpty()
  }
  useImperativeHandle(ref, () => ({ insertMacroReply }), [sendStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  const insertImage = (dataUrl: string) => {
    const ed = edRef.current; if (!ed) return
    ed.focus()
    // Imagem REDIMENSIONÁVEL com o mouse (como no Movidesk): o container tem resize horizontal
    // (alça no canto), a imagem preenche 100% e a altura segue a proporção. O tamanho escolhido
    // fica no style inline → persiste no envio.
    document.execCommand('insertHTML', false,
      `<span style="display:inline-block;overflow:hidden;resize:horizontal;max-width:100%;min-width:80px;width:340px;border:1px solid rgba(125,125,125,.35);border-radius:8px;margin:6px 0;vertical-align:top;">` +
      `<img src="${dataUrl}" alt="print" style="width:100%;display:block;" /></span><br/>`)
    syncEmpty()
  }

  // Reduz a imagem colada (canvas) antes de embutir: telas Retina geram base64 de vários MB
  // que estouram o limite de POST do servidor (422). Reescala p/ no máx. 1400px e exporta
  // comprimido — o corpo fica pequeno e o print continua legível (o original pode ir em "Anexar").
  const MAX_W = 1400
  const downscale = (file: File): Promise<string> => new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_W / img.width)
      const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      URL.revokeObjectURL(url)
      if (!ctx) return resolve('')
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h) // fundo branco (JPEG não tem alpha)
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve('') }
    img.src = url
  })

  // Cola print direto NO CAMPO (inline). Texto é colado como texto puro (sem HTML externo).
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.clipboardData.items)
    const imgs = items.filter(it => it.type.startsWith('image/'))
    if (imgs.length) {
      e.preventDefault()
      imgs.forEach(async it => { const f = it.getAsFile(); if (!f) return; const data = await downscale(f); if (data) { insertImage(data); toast.success('Print inserido no texto') } })
    } else {
      e.preventDefault()
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
      syncEmpty()
    }
  }

  const addFiles = (list: FileList | File[]) => { const arr = Array.from(list); if (arr.length) setFiles(f => [...f, ...arr]) }
  const removeFile = (idx: number) => setFiles(f => f.filter((_, i) => i !== idx))

  const send = async () => {
    if (statuses.length > 0 && !sendStatus) { toast.error('Escolha o status antes de enviar.'); return }
    const ed = edRef.current
    const html = ed ? sanitizeRich(ed.innerHTML) : ''
    const hasText = !empty
    if (!hasText && files.length === 0) return
    // Rede de segurança: corpo grande demais → mensagem clara (em vez de 422 do servidor).
    if (new Blob([html]).size > 6 * 1024 * 1024) {
      toast.error('Conteúdo muito grande. Use "Anexar" para enviar a imagem como arquivo.')
      return
    }
    // Pré-validação de anexos (servidor limita ~25MB) — feedback instantâneo, sem 422.
    const big = files.find(f => f.size > 25 * 1024 * 1024)
    if (big) { toast.error(`"${big.name}" excede 25MB.`); return }
    // Guard de horário: se início e fim vieram, fim precisa ser depois do início.
    if (startTime && endTime && !derivedTotal) {
      toast.error('A hora de fim deve ser maior que a de início.'); return
    }
    // Mesma mensagem mantém a MESMA chave em retentativas → o servidor não duplica.
    if (!idemRef.current) idemRef.current = (crypto?.randomUUID?.() ?? String(Date.now()) + Math.random())
    setSending(true)
    try {
      // Assinatura: só em RESPOSTA AO CLIENTE com texto (nota interna e anexo-só não assinam).
      let bodyHtml = hasText ? html : ''
      if (visibility === 'customer' && signature && bodyHtml) {
        const sig = signature.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
        bodyHtml += `<div data-hd-sig="1" style="color:#6b7280;margin-top:14px;">${sig}</div>`
      }
      const fd = new FormData()
      fd.append('body', bodyHtml)
      fd.append('visibility', visibility)
      fd.append('idempotency_key', idemRef.current)
      files.forEach(f => fd.append('files[]', f))
      // Tempo trabalhado (opcional). total_hours prevalece; senão o servidor deriva de início→fim.
      // Nota interna NÃO gera apontamento → não manda tempo (só resposta ao cliente movimenta horas).
      if (visibility !== 'internal') {
        if (workedDate) fd.append('worked_date', workedDate)
        if (startTime) fd.append('start_time', startTime)
        if (endTime) fd.append('end_time', endTime)
        if (totalHours) fd.append('total_hours', totalHours)
        fd.append('no_charge', noCharge ? '1' : '0')
      }
      const resp = await api.post<{ data?: { apontamento_warning?: string } }>(`/help-desk/tickets/${ticketId}/comments`, fd)
      if (ed) ed.innerHTML = ''
      setFiles([]); setEmpty(true); idemRef.current = null // sucesso → próxima mensagem, nova chave
      setStartTime(''); setEndTime(''); setTotalHours(''); setWorkedDate(localToday()); setNoCharge(false)
      if (resp?.data?.apontamento_warning) toast.warning(resp.data.apontamento_warning)
      onSent()
      // Aplica o status escolhido (só quando MUDA — manter não faz nada).
      if (onApplyStatus && sendStatus && sendStatus !== currentStatusId) await onApplyStatus(sendStatus)
      // Status "agendável" + data informada → agenda (pausa o SLA). Feito APÓS aplicar o status.
      if (canSchedule && schedDate && onSchedule) { await onSchedule(schedDate, schedTime); toast.success('Chamado agendado — SLA pausado') }
      setSchedDate(''); setSchedTime('')
      setSendStatus(undefined) // volta a exigir escolha na próxima interação
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao enviar')
    } finally { setSending(false) }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div
          ref={edRef}
          contentEditable={!!sendStatus}
          suppressContentEditableWarning
          onInput={syncEmpty}
          onPaste={onPaste}
          className="hd-composer hd-rich w-full text-sm rounded-lg px-3 py-2.5 outline-none overflow-y-auto"
          // Fundo papel branco fixo (legível com print/e-mail). Nota interna → fundo ROXO bem
          // evidente (não vai para o cliente), com borda roxa mais grossa.
          style={{ background: visibility === 'internal' ? '#ede9fe' : '#ffffff', color: '#1f2937', border: visibility === 'internal' ? '2px solid #7c3aed' : `1px solid ${sendStatus ? '#e5e7eb' : '#f59e0b'}`, minHeight: 120, maxHeight: 600, resize: 'vertical', opacity: sendStatus ? 1 : 0.85, cursor: sendStatus ? 'text' : 'not-allowed' }}
        />
        {visibility === 'internal' && (
          <span className="pointer-events-none absolute right-3 top-2 text-[11px] font-bold inline-flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ background: '#7c3aed', color: '#ffffff' }}>
            <Lock size={11} /> NOTA INTERNA — não vai ao cliente
          </span>
        )}
        {!sendStatus ? (
          <span className="pointer-events-none absolute left-3 top-2.5 text-sm font-medium" style={{ color: '#b45309' }}>
            ⚠️ Escolha o status em “Ao enviar → status” para liberar a resposta.
          </span>
        ) : empty && (
          <span className="pointer-events-none absolute left-3 top-2.5 text-sm" style={{ color: visibility === 'internal' ? '#6d28d9' : '#9ca3af' }}>
            {visibility === 'internal' ? '🔒 Escreva uma nota interna… (só a equipe vê — não vai ao cliente)' : 'Escreva uma resposta…  (cole um print direto aqui ou anexe arquivos)'}
          </span>
        )}
      </div>

      {/* Aviso da assinatura (só resposta ao cliente) */}
      {visibility === 'customer' && signature && (
        <div className="text-[11px] flex items-start gap-1 whitespace-pre-line px-1" style={{ color: 'var(--text-light)' }}>
          <span>✍️</span><span><strong>Assinatura incluída no envio:</strong>{'\n'}{signature}</span>
        </div>
      )}

      {/* Anexos de ARQUIVO (não-inline) — pré-visualização antes de enviar */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative rounded-lg overflow-hidden flex items-center gap-1.5 px-2 py-1.5" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
              <FileText size={14} style={{ color: 'var(--text-muted)' }} />
              <span className="text-[11px] max-w-[140px] truncate" style={{ color: 'var(--text-muted)' }}>{f.name}</span>
              <button onClick={() => removeFile(i)} aria-label="Remover anexo"><X size={13} style={{ color: 'var(--text-light)' }} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Tempo trabalhado por interação (opcional). Vira apontamento quando o contrato tem a
          integração ligada. A 1ª hora tem "Sem apontamento" no topo → trava os demais campos
          (registra a interação sem movimentar horas). */}
      <div className="rounded-lg px-2.5 py-2 text-xs"
        style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Nota interna NÃO gera apontamento → esconde o Tempo (só resposta ao cliente movimenta horas). */}
          {visibility === 'internal' ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: '#7c3aed' }}>
              <Lock size={12} /> Nota interna — não gera apontamento de horas
            </span>
          ) : (<>
          <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <Clock size={13} /> Tempo
          </span>
          <input type="date" value={workedDate} max={localToday()} onChange={e => setWorkedDate(e.target.value)}
            disabled={noCharge} aria-label="Data da interação"
            className="ds-input" style={{ height: 30, fontSize: 12, width: 140, padding: '0 8px', opacity: noCharge ? 0.5 : 1 }} />
          <span style={{ color: 'var(--text-light)' }}>·</span>
          <TimeSelect5 value={startTime} onChange={v => { setStartTime(v); setNoCharge(false) }} ariaLabel="Hora início"
            maxBefore={endTime}
            topOption={{ label: 'Sem apontamento', active: noCharge, onSelect: () => { setNoCharge(true); setStartTime(''); setEndTime(''); setTotalHours('') } }} />
          <span style={{ color: 'var(--text-light)' }}>→</span>
          <TimeSelect5 value={endTime} onChange={setEndTime} disabled={noCharge} ariaLabel="Hora fim" minAfter={startTime} />
          <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>Total</span>
          <input type="text" value={noCharge ? '' : totalDisplay} onChange={e => setTotalHours(e.target.value)}
            placeholder="0:00" disabled={noCharge} aria-label="Total de horas"
            className="ds-input" style={{ height: 30, fontSize: 12, width: 64, padding: '0 8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', opacity: noCharge ? 0.5 : 1 }} />
          </>)}
          {statuses.length > 0 && (
            <span className="inline-flex items-center gap-1.5 ml-auto">
              <span style={{ color: 'var(--text-muted)' }}>Ao enviar → status</span>
              <select value={sendStatus ?? ''} onChange={e => {
                  const v = e.target.value ? Number(e.target.value) : undefined
                  // Status COM FORMULÁRIO: abre o formulário na hora (o form é a interação).
                  if (v && formStatusIds.includes(v)) { onFormStatus?.(v); setSendStatus(undefined); return }
                  setSendStatus(v)
                }} aria-label="Status ao enviar"
                className="ds-input" style={{ height: 30, fontSize: 12, padding: '0 8px', borderColor: sendStatus ? 'var(--border)' : '#f59e0b' }}>
                <option value="">— Selecione o status —</option>
                {statuses.map(s => <option key={s.id} value={s.id}>{s.id === currentStatusId ? `Manter: ${s.label}` : s.label}</option>)}
              </select>
              {/* Status "agendável": data (obrigatória p/ agendar) + hora opcional ao lado. Pausa o SLA. */}
              {canSchedule && (
                <span className="inline-flex items-center gap-1 pl-1.5 ml-1.5" style={{ borderLeft: '1px solid var(--border)' }}>
                  <span title="Ao enviar, agenda o chamado e pausa o SLA até esta data." style={{ color: 'var(--text-muted)' }}>📅 agendar</span>
                  <input type="date" value={schedDate} min={localToday()} onChange={e => setSchedDate(e.target.value)} aria-label="Data do agendamento"
                    className="ds-input" style={{ height: 30, fontSize: 12, width: 130, padding: '0 6px' }} />
                  <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} aria-label="Hora do agendamento (opcional)"
                    className="ds-input" style={{ height: 30, fontSize: 12, width: 88, padding: '0 6px' }} />
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs">
            {(['customer', 'internal'] as const).map(v => {
              const active = visibility === v
              // Nota interna ATIVA destaca em ROXO (bem evidente que é interno).
              const bg = active ? (v === 'internal' ? '#7c3aed' : 'var(--primary-soft)') : 'transparent'
              const fg = active ? (v === 'internal' ? '#ffffff' : 'var(--primary)') : 'var(--text-muted)'
              return (
                <button key={v} onClick={() => { setVisibility(v); if (v === 'internal') { setStartTime(''); setEndTime(''); setTotalHours(''); setNoCharge(false) } }} className="px-2 py-1 rounded-md inline-flex items-center gap-1 font-medium"
                  style={{ background: bg, color: fg }}>
                  {v === 'internal' && <Lock size={12} />}
                  {v === 'customer' ? 'Resposta ao cliente' : 'Nota interna'}
                </button>
              )
            })}
          </div>
          <label className="inline-flex items-center gap-1 text-xs cursor-pointer px-2 py-1 rounded-md" style={{ color: 'var(--text-muted)' }}>
            <Paperclip size={14} /> Anexar
            <input type="file" multiple className="hidden" onChange={e => { if (e.target.files) addFiles(e.target.files); e.currentTarget.value = '' }} />
          </label>
          {/* Macro — insere o texto da resposta. Só habilita após escolher o status. */}
          {macros.length > 0 && (
            <div className="relative">
              <button type="button" onClick={() => setMacroOpen(o => !o)} disabled={!sendStatus}
                title={sendStatus ? 'Inserir o texto de uma macro' : 'Escolha o status primeiro'}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md font-medium"
                style={{ color: sendStatus ? 'var(--primary)' : 'var(--text-light)', background: 'var(--primary-soft)', opacity: sendStatus ? 1 : 0.55, cursor: sendStatus ? 'pointer' : 'not-allowed' }}>
                <Zap size={13} /> Macro <ChevronDown size={12} />
              </button>
              {macroOpen && sendStatus && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMacroOpen(false)} />
                  <div className="absolute left-0 bottom-full mb-1 z-50 w-64 ds-card p-1 max-h-72 overflow-y-auto" style={{ boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}>
                    {macros.map(m => (
                      <button key={m.id} type="button" onClick={() => { setMacroOpen(false); insertMacroReply(visibility === 'internal' ? (m.internal || m.reply || '') : (m.reply || '')) }}
                        className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded ds-row-hover text-sm">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.color ?? 'var(--text-muted)' }} />
                        <span className="flex-1 truncate" style={{ color: 'var(--text)' }}>{m.name}</span>
                        {m.category && <span className="text-[10px] shrink-0" style={{ color: 'var(--text-light)' }}>{m.category}</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {files.length > 0 && <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{files.length} anexo(s)</span>}
        </div>
        <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={send} disabled={sending || !sendStatus || (empty && files.length === 0)}>
          <Send size={14} /> {sending ? 'Enviando…' : (sendStatus && sendStatus !== currentStatusId ? `Enviar e mover para: ${statuses.find(s => s.id === sendStatus)?.label ?? ''}` : 'Enviar')}
        </button>
      </div>
    </div>
  )
})
