'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Paperclip, X, FileText, Smile, Bold, Italic, Underline, Link2, Palette, RemoveFormatting, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { sanitizeRich } from '@/lib/sanitize-html'

const EMOJIS = ['😀', '😅', '👍', '🙏', '🎉', '✅', '❗', '⚠️', '📌', '🔔', '📢', '💰', '📄', '🗓️', '🚀', '💡', '🔥', '⭐', '✔️', '❌', '➡️', '🕐', '👥', '🛠️', '📝', '📊', '💬', '🎯']
// Tamanhos via execCommand('fontSize', 1..7) — com styleWithCSS viram font-size em CSS (renderiza no e-mail).
const SIZES: { label: string; v: string }[] = [
  { label: 'Pequeno', v: '2' }, { label: 'Normal', v: '3' }, { label: 'Médio', v: '4' },
  { label: 'Grande', v: '5' }, { label: 'Título', v: '6' }, { label: 'Destaque', v: '7' },
]
const COLORS = ['#1f2937', '#6b7280', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#6d28d9', '#db2777', '#10b981', '#ffffff']
const tbBtn = 'inline-flex items-center justify-center w-7 h-7 rounded-lg'
const tbStyle = { border: '1px solid var(--border)', color: 'var(--text-muted)' } as const

export interface RichEditorHandle { getHtml: () => string; getFiles: () => File[] }

/**
 * Editor rico NÃO-CONTROLADO p/ editar interações (descrição/respostas). Define o HTML
 * inicial UMA vez (sem dangerouslySetInnerHTML em cada render → não reseta o cursor, dá pra
 * digitar). Cola PRINT inline (downscale → data:URI), igual ao compositor. Fundo "papel"
 * branco fixo p/ legibilidade do conteúdo de e-mail em qualquer tema. Lê o HTML via ref.getHtml().
 */
export const RichEditor = forwardRef<RichEditorHandle, { initialHtml: string; minHeight?: number; showAttach?: boolean; colors?: string[]; allowCustomColor?: boolean }>(
  function RichEditor({ initialHtml, minHeight = 100, showAttach = true, colors, allowCustomColor = true }, ref) {
    const palette = colors ?? COLORS
    const edRef = useRef<HTMLDivElement>(null)
    const fileRef = useRef<HTMLInputElement>(null)
    const [files, setFiles] = useState<File[]>([])
    const [showEmoji, setShowEmoji] = useState(false)
    const [showColors, setShowColors] = useState(false)
    const savedRange = useRef<Range | null>(null)

    // Salva a posição do cursor dentro do editor p/ inserir o emoji no lugar certo.
    const saveSel = () => {
      const s = window.getSelection()
      if (s && s.rangeCount && edRef.current?.contains(s.anchorNode)) savedRange.current = s.getRangeAt(0).cloneRange()
    }
    const insertEmoji = (emoji: string) => {
      const ed = edRef.current; if (!ed) return
      ed.focus()
      const sel = window.getSelection()
      if (savedRange.current && sel) { sel.removeAllRanges(); sel.addRange(savedRange.current) }
      document.execCommand('insertText', false, emoji)
      saveSel()
      setShowEmoji(false)
    }

    // Aplica um comando de formatação na seleção (restaura o cursor salvo; estilo via CSS inline p/ sobreviver no e-mail).
    const exec = (cmd: string, value?: string) => {
      const ed = edRef.current; if (!ed) return
      ed.focus()
      const sel = window.getSelection()
      if (savedRange.current && sel) { sel.removeAllRanges(); sel.addRange(savedRange.current) }
      try { document.execCommand('styleWithCSS', false, 'true') } catch { /* ignore */ }
      document.execCommand(cmd, false, value)
      saveSel()
    }
    const applyColor = (color: string) => { exec('foreColor', color); setShowColors(false) }
    const addLink = () => {
      const url = window.prompt('URL do link (ex: https://erpserv.com.br):', 'https://')
      if (url && /^https?:\/\/\S+/i.test(url)) exec('createLink', url)
      else if (url) toast.error('URL inválida (use http:// ou https://).')
    }
    useEffect(() => {
      if (!edRef.current) return
      edRef.current.innerHTML = sanitizeRich(initialHtml)
      // O sanitizer remove contenteditable; re-marca as imagens como NÃO-editáveis p/ o
      // navegador não clonar o estilo da "caixa" da imagem ao digitar/dar espaço ao lado dela.
      edRef.current.querySelectorAll('img').forEach(img => {
        const sp = img.parentElement
        if (sp && sp.tagName === 'SPAN') sp.setAttribute('contenteditable', 'false')
      })
    }, [initialHtml])
    useImperativeHandle(ref, () => ({
      getHtml: () => (edRef.current ? sanitizeRich(edRef.current.innerHTML) : ''),
      getFiles: () => files,
    }), [files])

    const MAX_W = 1400
    const downscale = (file: File): Promise<string> => new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, MAX_W / img.width)
        const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d'); URL.revokeObjectURL(url)
        if (!ctx) return resolve('')
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve('') }
      img.src = url
    })

    // 🚑 À prova de falhas contra o "bug dos campos vazios": o navegador CLONA a caixa da
    // imagem (span com border+resize) ao digitar/dar espaço ao lado, gerando caixas vazias;
    // e o execCommand descarta o contenteditable que colocamos no HTML. A cada input:
    //  • span-caixa COM <img> → marca contenteditable=false via DOM (atômico, não some);
    //  • span-caixa SEM <img> (o clone espúrio) → tira o estilo de caixa (vira texto normal,
    //    invisível) SEM remover o nó → não desloca o cursor.
    const cleanBoxes = () => {
      const ed = edRef.current; if (!ed) return
      ed.querySelectorAll('span[style*="resize"]').forEach(sp => {
        if (sp.querySelector('img')) {
          if (sp.getAttribute('contenteditable') !== 'false') sp.setAttribute('contenteditable', 'false')
        } else {
          sp.removeAttribute('style'); sp.removeAttribute('contenteditable')
        }
      })
    }

    const insertImage = (dataUrl: string) => {
      const ed = edRef.current; if (!ed) return
      ed.focus()
      // Imagem num bloco de alinhamento (text-align controla esquerda/centro/direita).
      // A linha <p><br></p> abaixo fica editável. cleanBoxes() reforça o contenteditable=false.
      document.execCommand('insertHTML', false,
        `<div style="text-align:center;margin:6px 0;">` +
        `<span contenteditable="false" style="display:inline-block;overflow:hidden;resize:horizontal;max-width:100%;min-width:80px;width:340px;border:1px solid rgba(125,125,125,.35);border-radius:8px;vertical-align:top;">` +
        `<img src="${dataUrl}" alt="print" style="width:100%;display:block;" /></span></div><p><br/></p>`)
      cleanBoxes()
    }

    // Alinha a imagem (a do cursor, ou a última) à esquerda/centro/direita via text-align do bloco.
    const alignImage = (dir: 'left' | 'center' | 'right') => {
      const ed = edRef.current; if (!ed) return
      const sel = window.getSelection()
      const anchor = savedRange.current?.startContainer || sel?.anchorNode || null
      let img: HTMLImageElement | null = null
      if (anchor) {
        let el: HTMLElement | null = anchor.nodeType === 1 ? anchor as HTMLElement : anchor.parentElement
        while (el && el !== ed) { const q = el.querySelector?.('img') as HTMLImageElement | null; if (q) { img = q; break } el = el.parentElement }
      }
      if (!img) { const imgs = ed.querySelectorAll('img'); img = imgs.length ? imgs[imgs.length - 1] as HTMLImageElement : null }
      if (!img) { toast.error('Insira ou selecione uma imagem primeiro.'); return }
      const span = img.parentElement; if (!span) return
      let block = span.parentElement
      // Reaproveita o div de alinhamento existente; se a imagem não estiver num div (conteúdo
      // antigo), envolve o span num div novo.
      if (!block || block === ed || block.tagName !== 'DIV') {
        const div = document.createElement('div'); div.style.margin = '6px 0'
        span.parentElement?.insertBefore(div, span); div.appendChild(span); block = div
      }
      block.style.textAlign = dir
      saveSel()
    }

    const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
      const imgs = Array.from(e.clipboardData.items).filter(it => it.type.startsWith('image/'))
      if (imgs.length) {
        e.preventDefault()
        imgs.forEach(async it => { const f = it.getAsFile(); if (!f) return; const data = await downscale(f); if (data) { insertImage(data); toast.success('Print inserido') } })
      } else {
        e.preventDefault()
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
      }
    }

    return (
      <div>
        {/* Barra de formatação: negrito/itálico/sublinhado, tamanho, cor, link, emoji */}
        <div className="relative mb-1 flex items-center gap-1 flex-wrap">
          {([['bold', Bold, 'Negrito'], ['italic', Italic, 'Itálico'], ['underline', Underline, 'Sublinhado']] as const).map(([cmd, Icon, t]) => (
            <button key={cmd} type="button" title={t} onMouseDown={ev => ev.preventDefault()} onClick={() => exec(cmd)} className={tbBtn} style={tbStyle}>
              <Icon size={14} />
            </button>
          ))}

          <select title="Tamanho da fonte" onMouseDown={saveSel} defaultValue="" onChange={e => { if (e.target.value) { exec('fontSize', e.target.value); e.target.value = '' } }}
            className="text-xs px-1.5 py-1 rounded-lg outline-none" style={tbStyle}>
            <option value="" disabled>Tamanho</option>
            {SIZES.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>

          <button type="button" title="Cor do texto" onMouseDown={ev => ev.preventDefault()} onClick={() => setShowColors(s => !s)} className={tbBtn} style={tbStyle}>
            <Palette size={14} />
          </button>
          {showColors && (
            <div className="absolute z-30 top-9 left-0 p-2 rounded-lg shadow-lg flex items-center gap-1.5 flex-wrap" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxWidth: 210 }}>
              {palette.map(c => (
                <button key={c} type="button" title={c} onMouseDown={ev => ev.preventDefault()} onClick={() => applyColor(c)} className="w-5 h-5 rounded-full" style={{ background: c, border: '1px solid var(--border)' }} />
              ))}
              {allowCustomColor && (
                <label className="w-5 h-5 rounded-full overflow-hidden cursor-pointer relative" title="Cor personalizada" style={{ border: '1px solid var(--border)', background: 'conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)' }}>
                  <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" onMouseDown={saveSel} onChange={e => applyColor(e.target.value)} />
                </label>
              )}
            </div>
          )}

          <button type="button" title="Inserir link" onMouseDown={ev => ev.preventDefault()} onClick={addLink} className={tbBtn} style={tbStyle}>
            <Link2 size={14} />
          </button>
          <button type="button" title="Limpar formatação" onMouseDown={ev => ev.preventDefault()} onClick={() => exec('removeFormat')} className={tbBtn} style={tbStyle}>
            <RemoveFormatting size={14} />
          </button>

          <span className="w-px h-5 mx-0.5" style={{ background: 'var(--border)' }} />

          {/* Alinhamento da imagem (print): esquerda / centro / direita */}
          {([['left', AlignLeft, 'Imagem à esquerda'], ['center', AlignCenter, 'Imagem centralizada'], ['right', AlignRight, 'Imagem à direita']] as const).map(([d, Icon, t]) => (
            <button key={d} type="button" title={t} onMouseDown={ev => ev.preventDefault()} onClick={() => alignImage(d)} className={tbBtn} style={tbStyle}>
              <Icon size={14} />
            </button>
          ))}

          <span className="w-px h-5 mx-0.5" style={{ background: 'var(--border)' }} />

          <button type="button" title="Emoji" onClick={() => setShowEmoji(s => !s)} className={tbBtn} style={tbStyle}>
            <Smile size={14} />
          </button>
          {showEmoji && (
            <div className="absolute z-30 top-9 right-0 p-2 rounded-lg grid grid-cols-7 gap-1 shadow-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxWidth: 260 }}>
              {EMOJIS.map(e => (
                <button key={e} type="button" onMouseDown={ev => ev.preventDefault()} onClick={() => insertEmoji(e)} className="text-lg leading-none w-7 h-7 rounded hover:bg-[var(--surface-hover)]">{e}</button>
              ))}
            </div>
          )}
        </div>
        <div ref={edRef} contentEditable suppressContentEditableWarning onPaste={onPaste} onInput={cleanBoxes}
          onKeyUp={saveSel} onMouseUp={saveSel} onBlur={saveSel}
          className="text-sm hd-rich rounded-lg p-3 outline-none overflow-auto"
          style={{ background: '#ffffff', color: '#1f2937', border: '1px solid #e5e7eb', borderRadius: 8, minHeight, maxHeight: 480 }} />
        {showAttach ? (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <Paperclip size={13} /> Anexar
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files) setFiles(f => [...f, ...Array.from(e.target.files!)]); if (fileRef.current) fileRef.current.value = '' }} />
            {files.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
                <FileText size={12} /> <span className="max-w-[140px] truncate">{f.name}</span>
                <button onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}><X size={11} /></button>
              </span>
            ))}
          </div>
        ) : <div className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Cole um print direto aqui (Ctrl/Cmd+V) para inseri-lo na mensagem.</div>}
      </div>
    )
  }
)
