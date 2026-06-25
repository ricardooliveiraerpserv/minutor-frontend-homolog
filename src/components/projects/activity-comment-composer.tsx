'use client'

import { useRef, useState } from 'react'
import { Paperclip, Send, X } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'

interface Props {
  deliveryId: number
  onCreated: () => void
}

const MAX_BYTES = 20 * 1024 * 1024 // 20MB

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export function ActivityCommentComposer({ deliveryId, onCreated }: Props) {
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [toCliente, setToCliente] = useState(false)
  const [toConsultor, setToConsultor] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_BYTES) {
      toast.error('Anexo excede 20MB')
      e.target.value = ''
      return
    }
    setFile(f)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    const trimmed = text.trim()
    if (trimmed.length === 0 && !file) {
      toast.error('Escreva um comentário ou anexe um arquivo')
      return
    }

    const fd = new FormData()
    if (trimmed) fd.append('text', trimmed)
    if (file) fd.append('attachment', file)
    if (toCliente) fd.append('audiences[]', 'cliente')
    if (toConsultor) fd.append('audiences[]', 'consultor')

    setSaving(true)
    try {
      await api.post(`/activities/${deliveryId}/comments`, fd)
      setText('')
      setFile(null)
      setToCliente(false)
      setToConsultor(false)
      if (fileInput.current) fileInput.current.value = ''
      onCreated()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao comentar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="ds-card"
      style={{
        padding: 10,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Comentar nesta atividade…"
        rows={2}
        maxLength={5000}
        className="ds-input"
        style={{
          width: '100%', padding: 8, fontSize: 13,
          resize: 'vertical', fontFamily: 'inherit',
        }}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(e as unknown as React.FormEvent)
        }}
      />

      {file && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 8px',
          background: 'var(--surface-hover)',
          borderRadius: 4,
          fontSize: 11, color: 'var(--text-muted)',
        }}>
          <Paperclip size={11} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name} <span style={{ color: 'var(--text-light)' }}>· {formatSize(file.size)}</span>
          </span>
          <button
            type="button"
            onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = '' }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}
            aria-label="Remover anexo"
          >
            <X size={11} />
          </button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="file"
          ref={fileInput}
          onChange={pickFile}
          style={{ display: 'none' }}
          accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="ds-btn-ghost"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, padding: '4px 8px',
            color: 'var(--text-muted)',
          }}
        >
          <Paperclip size={12} /> Anexar
        </button>

        {/* Público da mensagem — admin/coordenador veem sempre. */}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: toCliente ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer' }} title="Visível para o cliente do projeto">
          <input type="checkbox" checked={toCliente} onChange={e => setToCliente(e.target.checked)} /> Cliente
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: toConsultor ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer' }} title="Visível para consultores">
          <input type="checkbox" checked={toConsultor} onChange={e => setToConsultor(e.target.checked)} /> Consultor
        </label>

        <div style={{ flex: 1, fontSize: 10, color: 'var(--text-light)' }}>
          {!toCliente && !toConsultor ? 'Só admin/coord' : 'Ctrl/⌘+Enter'}
        </div>

        <button
          type="submit"
          disabled={saving || (text.trim().length === 0 && !file)}
          className="ds-btn-primary"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, padding: '4px 12px',
          }}
        >
          <Send size={11} /> {saving ? 'Enviando…' : 'Comentar'}
        </button>
      </div>
    </form>
  )
}
