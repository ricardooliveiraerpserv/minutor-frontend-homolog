'use client'

// Código TOTP de um ITEM (seed guardada cifrada no blob) com countdown.
// Gerado 100% no client via WebCrypto — a seed nunca vai ao servidor em claro.

import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { totpCode, totpRemaining } from '@/lib/vault-crypto'
import { copyWithAutoClear } from '@/components/vault/reveal-field'

export function TotpCell({ itemId, seed }: { itemId: number; seed: string }) {
  const [code, setCode] = useState('')
  const [remaining, setRemaining] = useState(totpRemaining())

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const c = await totpCode(seed)
        if (alive) { setCode(c); setRemaining(totpRemaining()) }
      } catch {
        if (alive) setCode('')
      }
    }
    void tick()
    const t = window.setInterval(tick, 1000)
    return () => { alive = false; window.clearInterval(t) }
  }, [seed])

  if (!code) return <span style={{ color: 'var(--text-light)' }}>seed inválida</span>

  const copy = () => {
    copyWithAutoClear(code)
    toast.success('Código TOTP copiado.')
    void api.post(`/vault/items/${itemId}/log`, { action: 'autofill_totp' }).catch(() => { /* best-effort */ })
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-sm tabular-nums" style={{ color: 'var(--text)' }}>
        {code.slice(0, 3)} {code.slice(3)}
      </span>
      <span className="text-xs tabular-nums w-6 text-center rounded-full" style={{ color: remaining <= 5 ? 'var(--danger)' : 'var(--text-light)', border: '1px solid var(--border)' }}>
        {remaining}
      </span>
      <button type="button" className="p-1 rounded hover:opacity-80" style={{ color: 'var(--text-muted)' }} title="Copiar código" onClick={copy}>
        <Copy className="w-4 h-4" />
      </button>
    </span>
  )
}
