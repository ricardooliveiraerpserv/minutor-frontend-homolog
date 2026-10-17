'use client'

// FASE 11.2.FE — Chip de um único anexo (uso transversal).
//
// Substitui as variantes paralelas de AttachmentChip que existiam em
// ProjectMessages.tsx e ContractMessages.tsx (quase idênticas).

import { Download, FileText, Image as ImageIcon, Paperclip, Trash2, X } from 'lucide-react'
import { Attachment, downloadAttachment } from '@/lib/attachments'

interface AttachmentChipProps {
  attachment: Attachment
  /** Mostra botão de remover (passa onRemove pra renderizar X) */
  onRemove?: (id: number) => void
  /** Variante compacta — pra uso em listagens densas (linha de mensagem) */
  compact?: boolean
  className?: string
}

function iconForMime(mime: string) {
  if (mime.startsWith('image/')) return ImageIcon
  if (mime === 'application/pdf' || mime.includes('document') || mime.includes('text')) return FileText
  return Paperclip
}

export function AttachmentChip({ attachment, onRemove, compact = false, className }: AttachmentChipProps) {
  const Icon = iconForMime(attachment.mime_type)
  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await downloadAttachment(attachment.id, { download: false })
    } catch (err) {
      console.error('Falha download anexo', err)
    }
  }

  const padding = compact ? 'px-1.5 py-0.5' : 'px-2 py-1'
  const fontSize = compact ? 'text-[11px]' : 'text-xs'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded ${padding} ${fontSize} ${className ?? ''}`}
      style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
    >
      <button
        type="button"
        onClick={handleDownload}
        className="inline-flex items-center gap-1 cursor-pointer hover:underline"
        title={`Baixar ${attachment.original_name} (${attachment.human_size})`}
      >
        <Icon size={compact ? 10 : 12} style={{ color: 'var(--text-muted)' }} />
        <span className="truncate max-w-[180px]">{attachment.original_name}</span>
        <Download size={compact ? 9 : 10} style={{ color: 'var(--text-light)' }} />
      </button>
      <span className="ml-1" style={{ color: 'var(--text-light)' }}>
        {attachment.human_size}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(attachment.id) }}
          className="ml-1 rounded hover:bg-[var(--surface-hover)] transition-colors"
          title="Remover anexo"
          aria-label="Remover anexo"
        >
          <X size={compact ? 9 : 11} style={{ color: 'var(--text-muted)' }} />
        </button>
      )}
    </span>
  )
}
