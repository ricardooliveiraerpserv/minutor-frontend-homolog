'use client'

// Campo de formulário com botão COPIAR (e revelar, quando senha). Usado nos modais de
// inclusão do Cofre de Ambientes em usuário/senha/URL. As senhas chegam prontas — não há
// geração; só digitar/colar e, se quiser, copiar de volta.

import { useState } from 'react'
import { Copy, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  label: string
  value: string
  onChange: (v: string) => void
  password?: boolean
  placeholder?: string
  autoComplete?: string
  mono?: boolean
}

export function CopyableInput({ label, value, onChange, password = false, placeholder, autoComplete, mono }: Props) {
  const [show, setShow] = useState(false)

  const copy = async () => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copiado.`)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</label>
      <div className="relative">
        <input
          className={`ds-input w-full ${password ? 'pr-16' : 'pr-10'} ${password || mono ? 'font-mono' : ''}`}
          type={password && !show ? 'password' : 'text'}
          autoComplete={autoComplete ?? (password ? 'new-password' : 'off')}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {password && (
            <button type="button" className="p-1 rounded hover:opacity-80" style={{ color: 'var(--text-muted)' }} title={show ? 'Esconder' : 'Revelar'} onClick={() => setShow(s => !s)}>
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
          <button type="button" className="p-1 rounded hover:opacity-80 disabled:opacity-40" style={{ color: 'var(--text-muted)' }} title="Copiar" disabled={!value} onClick={copy}>
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
