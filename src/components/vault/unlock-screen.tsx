'use client'

import { useState } from 'react'
import { KeyRound, Lock, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, TextInput } from '@/components/ds'
import { useVault } from '@/contexts/vault-context'
import { ApiError } from '@/lib/api'
import { requestMicrosoftStepUp, StepUpCancelled } from '@/lib/vault-stepup'

/**
 * Tela de destravamento: master password + 2º fator.
 * Driver microsoft → popup Entra (prompt=login, MFA corporativa) a cada unlock.
 * Driver totp → código do app autenticador.
 */
export function UnlockScreen() {
  const { unlock, profile } = useVault()
  const isMs = profile?.second_factor === 'microsoft'
  const [masterPassword, setMasterPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [busy, setBusy] = useState(false)

  const canSubmit = !!masterPassword && (isMs || totp.length >= 6)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || busy) return
    setBusy(true)
    try {
      if (isMs) await requestMicrosoftStepUp() // popup Microsoft grava o step-up no servidor
      await unlock(masterPassword, isMs ? '' : totp)
      setMasterPassword('')
      setTotp('')
    } catch (err) {
      if (err instanceof StepUpCancelled) {
        toast.info('Verificação Microsoft cancelada.')
      } else if (err instanceof ApiError && err.status === 429) {
        toast.error('Muitas tentativas — aguarde um minuto.')
      } else if (err instanceof Error && !(err instanceof ApiError) && err.message.includes('Microsoft')) {
        toast.error(err.message)
      } else {
        // Erro GENÉRICO de propósito (não dizer se foi senha ou 2º fator)
        toast.error('Credenciais do cofre inválidas.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex justify-center pt-10">
      <Card className="w-full max-w-md">
        <div className="flex flex-col items-center gap-2 mb-6 text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
            <Lock className="w-6 h-6" style={{ color: 'var(--primary)' }} />
          </div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Cofre travado</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {isMs
              ? 'Digite sua master password — você confirmará sua identidade na Microsoft em seguida.'
              : 'Digite sua master password e o código do autenticador.'}
            {' '}Nada disso é enviado em claro ao servidor.
          </p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <TextInput
            label="Master password"
            icon={KeyRound}
            type="password"
            autoFocus
            autoComplete="off"
            value={masterPassword}
            onChange={e => setMasterPassword(e.target.value)}
          />
          {!isMs && (
            <TextInput
              label="Código do autenticador"
              icon={ShieldCheck}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              value={totp}
              onChange={e => setTotp(e.target.value.replace(/\D/g, ''))}
            />
          )}
          <Button type="submit" variant="primary" loading={busy} disabled={!canSubmit}>
            {isMs ? 'Verificar com Microsoft e destravar' : 'Destravar cofre'}
          </Button>
        </form>
        <p className="text-xs mt-4 text-center" style={{ color: 'var(--text-light)' }}>
          Esqueceu a master password? Use sua recovery key em Configuração do Cofre.
        </p>
      </Card>
    </div>
  )
}
