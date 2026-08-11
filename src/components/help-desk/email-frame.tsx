'use client'

import { useCallback, useRef, useState } from 'react'
import { sanitizeEmail } from '@/lib/sanitize-html'

/**
 * Renderiza o corpo de um e-mail (descrição/resposta recebida) num <iframe> ISOLADO —
 * o HTML do remetente roda com o próprio CSS, sem o CSS do app interferir → fidelidade
 * total ("exatamente como recebe", igual ao Movidesk).
 *
 * Segurança: conteúdo sanitizado (DOMPurify) + sandbox sem allow-scripts (nenhum JS do
 * e-mail executa). `allow-same-origin` só p/ medir a altura; `allow-popups` p/ links abrirem.
 * Renderiza sobre "papel" branco (e-mail é desenhado p/ fundo claro) — legível em qualquer tema.
 */
export function EmailFrame({ html, onImageClick }: { html: string; onImageClick?: (src: string, alt?: string) => void }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(60)

  const resize = useCallback(() => {
    const doc = ref.current?.contentDocument
    if (!doc?.body) return
    const h = Math.max(doc.documentElement?.scrollHeight ?? 0, doc.body.scrollHeight ?? 0)
    if (h > 0) setHeight(h + 4)
  }, [])

  // O iframe é same-origin (allow-same-origin) → o app consegue tornar as imagens do e-mail
  // clicáveis: ao clicar num print dentro do corpo, abre o lightbox no documento pai.
  const wireImages = useCallback(() => {
    const doc = ref.current?.contentDocument
    if (!doc || !onImageClick) return
    doc.querySelectorAll('img').forEach((img) => {
      img.style.cursor = 'zoom-in'
      img.onclick = (e) => { e.preventDefault(); onImageClick(img.currentSrc || img.src, img.alt || undefined) }
    })
  }, [onImageClick])

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank">
<style>
  html,body{margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;background:#fff;padding:12px 14px;word-wrap:break-word;overflow-wrap:break-word}
  img{max-width:100%;height:auto}
  table{max-width:100%}
  a{color:#2563eb}
</style></head><body>${sanitizeEmail(html)}</body></html>`

  return (
    <iframe
      ref={ref}
      title="Corpo do e-mail"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
      onLoad={() => { resize(); setTimeout(resize, 60); setTimeout(resize, 350); wireImages(); setTimeout(wireImages, 400) }}
      style={{ width: '100%', height, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', display: 'block', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}
    />
  )
}
