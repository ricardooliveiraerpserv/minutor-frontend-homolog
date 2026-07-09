'use client'

import { useState, useRef } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { sanitizeRich } from '@/lib/sanitize-html'
import { Send, Paperclip, X, FileText, Clock } from 'lucide-react'
import { TimeSelect5 } from './time-select-5'

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
export function InteracaoComposer({ ticketId, onSent }: { ticketId: number; onSent: () => void }) {
  const [visibility, setVisibility] = useState<'customer' | 'internal'>('customer')
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
  const derivedTotal = deriveTotal(startTime, endTime)
  const totalDisplay = totalHours || derivedTotal
  const edRef = useRef<HTMLDivElement>(null)
  // Chave de idempotência por mensagem: reusada em retentativas (não duplica), zerada no sucesso.
  const idemRef = useRef<string | null>(null)

  const syncEmpty = () => { const ed = edRef.current; setEmpty(!ed || ed.textContent?.trim() === '' && !ed.querySelector('img')) }

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
      const fd = new FormData()
      fd.append('body', hasText ? html : '')
      fd.append('visibility', visibility)
      fd.append('idempotency_key', idemRef.current)
      files.forEach(f => fd.append('files[]', f))
      // Tempo trabalhado (opcional). total_hours prevalece; senão o servidor deriva de início→fim.
      if (workedDate) fd.append('worked_date', workedDate)
      if (startTime) fd.append('start_time', startTime)
      if (endTime) fd.append('end_time', endTime)
      if (totalHours) fd.append('total_hours', totalHours)
      fd.append('no_charge', noCharge ? '1' : '0')
      const resp = await api.post<{ data?: { apontamento_warning?: string } }>(`/help-desk/tickets/${ticketId}/comments`, fd)
      if (ed) ed.innerHTML = ''
      setFiles([]); setEmpty(true); idemRef.current = null // sucesso → próxima mensagem, nova chave
      setStartTime(''); setEndTime(''); setTotalHours(''); setWorkedDate(localToday()); setNoCharge(false)
      if (resp?.data?.apontamento_warning) toast.warning(resp.data.apontamento_warning)
      onSent()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao enviar')
    } finally { setSending(false) }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div
          ref={edRef}
          contentEditable
          suppressContentEditableWarning
          onInput={syncEmpty}
          onPaste={onPaste}
          className="hd-composer hd-rich w-full text-sm rounded-lg px-3 py-2.5 outline-none overflow-y-auto"
          // Fundo papel branco fixo (legível com print/e-mail colado em qualquer tema).
          style={{ background: '#ffffff', color: '#1f2937', border: '1px solid #e5e7eb', minHeight: 120, maxHeight: 600, resize: 'vertical' }}
        />
        {empty && (
          <span className="pointer-events-none absolute left-3 top-2.5 text-sm" style={{ color: '#9ca3af' }}>
            Escreva uma resposta…  (cole um print direto aqui ou anexe arquivos)
          </span>
        )}
      </div>

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
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs">
            {(['customer', 'internal'] as const).map(v => (
              <button key={v} onClick={() => setVisibility(v)} className="px-2 py-1 rounded-md"
                style={{ background: visibility === v ? 'var(--primary-soft)' : 'transparent', color: visibility === v ? 'var(--primary)' : 'var(--text-muted)' }}>
                {v === 'customer' ? 'Resposta ao cliente' : 'Nota interna'}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-1 text-xs cursor-pointer px-2 py-1 rounded-md" style={{ color: 'var(--text-muted)' }}>
            <Paperclip size={14} /> Anexar
            <input type="file" multiple className="hidden" onChange={e => { if (e.target.files) addFiles(e.target.files); e.currentTarget.value = '' }} />
          </label>
          {files.length > 0 && <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{files.length} anexo(s)</span>}
        </div>
        <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={send} disabled={sending || (empty && files.length === 0)}>
          <Send size={14} /> {sending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}
