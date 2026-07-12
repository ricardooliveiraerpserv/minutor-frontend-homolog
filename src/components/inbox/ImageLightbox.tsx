'use client'

import { useEffect } from 'react'
import { Download, X } from 'lucide-react'

interface Props {
  src: string
  filename?: string
  onClose: () => void
}

export function ImageLightbox({ src, filename, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <a
          href={src}
          download={filename}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="w-10 h-10 rounded-md bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          title="Baixar"
        >
          <Download size={18}/>
        </a>
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-md bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          title="Fechar (Esc)"
        >
          <X size={18}/>
        </button>
      </div>
      <img
        src={src}
        alt={filename ?? 'Imagem'}
        onClick={e => e.stopPropagation()}
        className="max-w-full max-h-full object-contain rounded shadow-2xl"
      />
    </div>
  )
}
