'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

/**
 * Visualizador de imagem em tela cheia (lightbox) — abre o print MAIOR sobre a tela,
 * sem sair do chamado. Fecha no ✕, no fundo escuro ou com ESC. Trava o scroll do body
 * enquanto aberto. Overlay `fixed inset-0` com z-index alto → cobre tudo independente
 * de onde estiver no DOM (não precisa de portal).
 */
export function ImageLightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Visualização da imagem"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out' }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer' }}
      >
        <X size={20} />
      </button>
      <img
        src={src}
        alt={alt ?? ''}
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '95vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.5)', cursor: 'default' }}
      />
    </div>
  )
}
