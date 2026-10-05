'use client'

// Campo sensível com olho/copiar. Se o item tem flag reprompt, exige a master
// password de novo (verificação LOCAL — decifra o blob offline, sem rede).
// Copiar limpa o clipboard após 30s (best-effort: só se a aba tiver foco).

import { useState } from 'react'
import { Copy, Eye, EyeOff, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Modal, TextInput } from '@/components/ds'
import { api } from '@/lib/api'
import { useVault } from '@/contexts/vault-context'

const CLIPBOARD_CLEAR_MS = 30_000

export function copyWithAutoClear(value: string) {
  void navigator.clipboard.writeText(value).then(() => {
    window.setTimeout(() => {
      // não sobrescrever se o usuário já copiou outra coisa / trocou de app
      if (document.hasFocus()) {
        void navigator.clipboard.readText?.().then(cur => {
          if (cur === value) void navigator.clipboard.writeText('')
        }).catch(() => { /* permissão negada — ignora */ })
      }
    }, CLIPBOARD_CLEAR_MS)
  })
}

interface RevealFieldProps {
  itemId: number
  value: string
  reprompt?: boolean
  /** 'reveal' mostra/esconde · 'copy' só copia */
  mode: 'reveal' | 'copy'
  masked?: string
}

export function RevealField({ itemId, value, reprompt, mode, masked = '••••••••' }: RevealFieldProps) {
  const { verifyMasterPasswordLocal } = useVault()
  const [shown, setShown] = useState(false)
  const [askPw, setAskPw] = useState<null | (() => void)>(null)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)

  const withReprompt = (action: () => void) => {
    if (reprompt) setAskPw(() => action)
    else action()
  }

  const confirmPw = async () => {
    setBusy(true)
    const ok = await verifyMasterPasswordLocal(pw)
    setBusy(false)
    setPw('')
    if (!ok) { toast.error('Master password incorreta.'); return }
    const action = askPw
    setAskPw(null)
    action?.()
  }

  const doReveal = () => {
    setShown(s => !s)
    // Auditoria (item 4 do laudo): este log é INDICATIVO, não um controle infalível.
    // No modelo zero-knowledge o navegador já detém o bloco decifrado, então quem já
    // destravou o cofre consegue ler/copiar sem gerar este registro (é enviado pelo
    // próprio cliente, best-effort). Para segredos que exijam trilha FORTE de acesso,
    // usar o Cofre de Ambientes (revelação validada NO SERVIDOR + justificativa + 2FA).
    if (!shown) void api.post(`/vault/items/${itemId}/log`, { action: 'reveal' }).catch(() => { /* best-effort */ })
  }

  const doCopy = () => {
    copyWithAutoClear(value)
    toast.success('Copiado — o clipboard será limpo em 30s.')
    void api.post(`/vault/items/${itemId}/log`, { action: 'copy' }).catch(() => { /* auditoria best-effort */ })
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {mode === 'reveal' && (
        <>
          <span className="font-mono text-sm select-all" style={{ color: 'var(--text)' }}>
            {shown ? value : masked}
          </span>
          <button
            type="button"
            className="p-1 rounded hover:opacity-80"
            style={{ color: 'var(--text-muted)' }}
            title={shown ? 'Esconder' : 'Revelar'}
            onClick={() => (shown ? setShown(false) : withReprompt(doReveal))}
          >
            {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </>
      )}
      <button
        type="button"
        className="p-1 rounded hover:opacity-80"
        style={{ color: 'var(--text-muted)' }}
        title="Copiar"
        onClick={() => withReprompt(doCopy)}
      >
        <Copy className="w-4 h-4" />
      </button>

      <Modal open={askPw !== null} onClose={() => { setAskPw(null); setPw('') }} title="Confirme sua master password">
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Este item exige nova confirmação para ser revelado ou copiado.
          </p>
          <TextInput
            label="Master password"
            icon={KeyRound}
            type="password"
            autoFocus
            autoComplete="off"
            value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && pw) void confirmPw() }}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => { setAskPw(null); setPw('') }}>Cancelar</Button>
            <Button variant="primary" loading={busy} disabled={!pw} onClick={confirmPw}>Confirmar</Button>
          </div>
        </div>
      </Modal>
    </span>
  )
}
