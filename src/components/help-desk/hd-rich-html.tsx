'use client'

import * as React from 'react'
import { fetchAuthedObjectUrl } from '@/lib/authed-image'

// Renderiza o corpo rico do Help Desk (JÁ sanitizado por sanitizeRich) e resolve os anexos inline
// importados do Movidesk:
//   <img data-att-id="123">           → busca /api/v1/attachments/123/download (com token) e vira a imagem
//   <span data-att-id="123">📎 x</span> → chip clicável que abre o download autenticado do arquivo
// Reusa fetchAuthedObjectUrl (mesmo mecanismo do AuthedImg: fetch com Bearer → object URL cacheado).
// Sem data-att-id no HTML, é um dangerouslySetInnerHTML normal — zero custo extra.
export function HdRichHtml({ html, className }: { html: string; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const root = ref.current
    if (!root) return
    let alive = true
    const els = root.querySelectorAll<HTMLElement>('[data-att-id]')
    els.forEach((el) => {
      const id = el.getAttribute('data-att-id')
      if (!id || !/^\d+$/.test(id)) return
      const url = `/api/v1/attachments/${id}/download`

      if (el.tagName === 'IMG') {
        const img = el as HTMLImageElement
        img.style.maxWidth = '100%'
        img.style.height = 'auto'
        img.style.borderRadius = '8px'
        fetchAuthedObjectUrl(url).then((u) => { if (alive) img.src = u }).catch(() => {})
      } else {
        // Chip de arquivo (não-imagem): estiliza e torna clicável (abre o download autenticado).
        el.style.cursor = 'pointer'
        el.style.display = 'inline-flex'
        el.style.alignItems = 'center'
        el.style.gap = '4px'
        el.style.padding = '2px 8px'
        el.style.margin = '2px 0'
        el.style.borderRadius = '6px'
        el.style.border = '1px solid var(--border)'
        el.style.color = 'var(--primary)'
        el.style.fontSize = '12px'
        el.setAttribute('role', 'button')
        el.onclick = () => {
          fetchAuthedObjectUrl(url).then((u) => window.open(u, '_blank', 'noopener')).catch(() => {})
        }
      }
    })
    return () => { alive = false }
  }, [html])

  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
