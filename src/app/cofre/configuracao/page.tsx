'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Configuração do Cofre: auto-lock, troca de master password e recuperação
// por recovery key. Troca de senha = só RE-WRAP da user key (itens intocados).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Copy, Eye, EyeOff, KeyRound, LifeBuoy, ShieldCheck, Timer, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { Button, Card, PageHeader, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { LOCK_TIMEOUT_OPTIONS, useVault } from '@/contexts/vault-context'
import { requestMicrosoftStepUp, StepUpCancelled } from '@/lib/vault-stepup'
import {
  aesGcmDecrypt, aesGcmEncrypt, computeAuthHash, deriveMasterKey, formatRecoveryKey,
  generateKey32, generatePassword, importAesKey, KDF_DEFAULTS, parseRecoveryKey,
  PASSWORD_DEFAULTS, passwordStrength,
} from '@/lib/vault-crypto'

/** Gera uma senha forte, preenche os dois campos (nova + confirmação) e revela. */
function genInto(
  setPw: (v: string) => void,
  setPw2: (v: string) => void,
  setShown: (v: boolean) => void,
) {
  const pw = generatePassword(PASSWORD_DEFAULTS)
  setPw(pw); setPw2(pw); setShown(true)
  navigator.clipboard?.writeText(pw).catch(() => {})
  toast.success('Senha forte gerada e copiada — guarde-a antes de salvar.')
}

/** Linha "Gerar senha segura" + copiar + revelar, abaixo do campo de nova senha. */
function GenPwRow({ onGen, onCopy, canCopy, shown, onToggle }: { onGen: () => void; onCopy: () => void; canCopy: boolean; shown: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-2 -mt-1">
      <Button variant="secondary" size="sm" icon={Wand2} onClick={onGen}>Gerar senha segura</Button>
      <Button variant="ghost" size="sm" icon={Copy} disabled={!canCopy} onClick={onCopy}>Copiar</Button>
      <Button variant="ghost" size="sm" icon={shown ? EyeOff : Eye} onClick={onToggle}>
        {shown ? 'Ocultar' : 'Mostrar'}
      </Button>
    </div>
  )
}

/** Copia um valor para a área de transferência com feedback. */
function copyPw(value: string) {
  if (!value) return
  navigator.clipboard?.writeText(value).then(() => toast.success('Senha copiada — guarde-a antes de salvar.')).catch(() => {})
}

export default function CofreConfiguracaoPage() {
  const { user } = useAuth()
  const { status, profile, lockTimeoutMin, setLockTimeoutMin, lock, refreshProfile, getEncSymKeyBlob } = useVault()

  // troca de master password
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [totp, setTotp] = useState('')
  const [busy, setBusy] = useState(false)
  const [newRecovery, setNewRecovery] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showRecNew, setShowRecNew] = useState(false)

  // recuperação
  const [recTotp, setRecTotp] = useState('')
  const [recKey, setRecKey] = useState('')
  const [recNewPw, setRecNewPw] = useState('')
  const [recNewPw2, setRecNewPw2] = useState('')
  const [recBusy, setRecBusy] = useState(false)
  const [recNextRecovery, setRecNextRecovery] = useState<string | null>(null)


  const kdf = profile?.kdf ?? KDF_DEFAULTS
  const isMs = profile?.second_factor === 'microsoft'

  /** 2º fator conforme driver: popup Microsoft (validado server-side) ou código TOTP digitado. */
  const secondFactorPayload = async (totpValue: string) => {
    if (isMs) { await requestMicrosoftStepUp(); return {} }
    return { totp_code: totpValue }
  }

  /**
   * Troca normal: exige cofre DESTRAVADO (o blob da user key já está em memória).
   * Decifra a user key com a master password atual e re-wrapa com a nova —
   * um único código TOTP, uma única chamada.
   */
  const changePassword = async () => {
    if (!user) return
    if (newPw !== newPw2 || passwordStrength(newPw) < 1 || newPw.length < 12) {
      toast.error('A nova master password precisa de 12+ caracteres e força razoável.')
      return
    }
    const blob = getEncSymKeyBlob()
    if (status !== 'unlocked' || !blob) {
      toast.error('Destrave o cofre antes de trocar a master password.')
      return
    }
    setBusy(true)
    try {
      const curMaster = await deriveMasterKey(curPw, user.id, user.email, kdf)
      const curAuthHash = await computeAuthHash(curMaster, curPw)
      const userKeyBytes = await aesGcmDecrypt(await importAesKey(curMaster), blob) // lança se a atual estiver errada

      const newMaster = await deriveMasterKey(newPw, user.id, user.email, kdf)
      const newAuthHash = await computeAuthHash(newMaster, newPw)
      const recoveryBytes = generateKey32()
      await api.post('/vault/master-password', {
        current_auth_hash: curAuthHash,
        ...(await secondFactorPayload(totp)),
        new_auth_hash: newAuthHash,
        new_encrypted_symmetric_key: await aesGcmEncrypt(await importAesKey(newMaster), userKeyBytes),
        new_recovery_symmetric_key: await aesGcmEncrypt(await importAesKey(recoveryBytes), userKeyBytes),
      })
      setNewRecovery(formatRecoveryKey(recoveryBytes))
      setCurPw(''); setNewPw(''); setNewPw2(''); setTotp('')
      lock()
      toast.success('Master password alterada — anote a NOVA recovery key!')
    } catch (err) {
      if (err instanceof StepUpCancelled) toast.info('Verificação Microsoft cancelada.')
      else toast.error(err instanceof ApiError && err.status === 422 ? 'Senha atual ou 2º fator inválido.' : 'Master password atual incorreta ou falha na troca.')
    } finally {
      setBusy(false)
    }
  }

  /** Recuperação: recovery key decifra a user key → define nova master password. */
  const recover = async () => {
    if (!user) return
    if (recNewPw !== recNewPw2 || passwordStrength(recNewPw) < 1 || recNewPw.length < 12) {
      toast.error('A nova master password precisa de 12+ caracteres e força razoável.')
      return
    }
    setRecBusy(true)
    try {
      // 1 verificação (TOTP ou Microsoft) → blob + token efêmero que autoriza a troca (10 min)
      const res = await api.post<{ recovery_symmetric_key: string; recovery_token: string }>('/vault/recovery/unlock', await secondFactorPayload(recTotp))
      const recoveryKey = await importAesKey(parseRecoveryKey(recKey))
      const userKeyBytes = await aesGcmDecrypt(recoveryKey, res.recovery_symmetric_key) // lança se a key estiver errada

      const newMaster = await deriveMasterKey(recNewPw, user.id, user.email, kdf)
      const newAuthHash = await computeAuthHash(newMaster, recNewPw)
      const nextRecoveryBytes = generateKey32()
      await api.post('/vault/master-password', {
        recovery_token: res.recovery_token,
        new_auth_hash: newAuthHash,
        new_encrypted_symmetric_key: await aesGcmEncrypt(await importAesKey(newMaster), userKeyBytes),
        new_recovery_symmetric_key: await aesGcmEncrypt(await importAesKey(nextRecoveryBytes), userKeyBytes),
      })
      setRecNextRecovery(formatRecoveryKey(nextRecoveryBytes))
      setRecTotp(''); setRecKey(''); setRecNewPw(''); setRecNewPw2('')
      await refreshProfile()
      toast.success('Acesso recuperado! Anote a NOVA recovery key (a antiga foi invalidada).')
    } catch (err) {
      if (err instanceof StepUpCancelled) toast.info('Verificação Microsoft cancelada.')
      else toast.error(err instanceof ApiError && err.status === 422 ? '2º fator inválido.' : 'Recovery key incorreta ou falha na recuperação.')
    } finally {
      setRecBusy(false)
    }
  }

  return (
    <AppLayout>
      <PageHeader
        icon={KeyRound}
        title="Configuração do Cofre"
        actions={<Link href="/cofre"><Button icon={ArrowLeft}>Voltar ao cofre</Button></Link>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Auto-lock — REGRA GLOBAL: só o admin vê e altera; vale para todos os usuários. */}
        {profile?.is_vault_admin && (
          <Card className="lg:col-span-2">
            <h3 className="flex items-center gap-2 font-semibold mb-3" style={{ color: 'var(--text)' }}>
              <Timer className="w-4 h-4" style={{ color: 'var(--primary)' }} /> Auto-lock por inatividade
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>regra global · admin</span>
            </h3>
            <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
              Define para <b>todos os usuários</b> o tempo até o cofre travar sozinho sem atividade (e ao ficar mais de 1 min em outra aba). Fechar a aba sempre trava.
            </p>
            <div className="flex gap-2">
              {LOCK_TIMEOUT_OPTIONS.map(min => (
                <Button key={min} size="sm" variant={lockTimeoutMin === min ? 'primary' : 'secondary'} onClick={() => setLockTimeoutMin(min)}>
                  {min} min
                </Button>
              ))}
            </div>
          </Card>
        )}

        {/* Trocar master password */}
        <Card>
          <h3 className="flex items-center gap-2 font-semibold mb-3" style={{ color: 'var(--text)' }}>
            <KeyRound className="w-4 h-4" style={{ color: 'var(--primary)' }} /> Trocar master password
          </h3>
          {newRecovery ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sua NOVA recovery key (a anterior foi invalidada) — exibida só agora:</p>
              <div className="rounded-xl p-3 font-mono text-sm break-all select-all text-center" style={{ background: 'var(--surface-hover)', border: '1px dashed var(--border)', color: 'var(--text)' }}>{newRecovery}</div>
              <Button variant="primary" onClick={() => setNewRecovery(null)}>Guardei em local seguro</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <TextInput label="Master password atual" type="password" autoComplete="off" value={curPw} onChange={e => setCurPw(e.target.value)} />
              <TextInput label="Nova master password (mín. 12)" type={showNew ? 'text' : 'password'} autoComplete="new-password" value={newPw} onChange={e => setNewPw(e.target.value)} />
              <GenPwRow onGen={() => genInto(setNewPw, setNewPw2, setShowNew)} onCopy={() => copyPw(newPw)} canCopy={!!newPw} shown={showNew} onToggle={() => setShowNew(s => !s)} />
              <TextInput label="Confirme a nova" type={showNew ? 'text' : 'password'} autoComplete="new-password" value={newPw2} onChange={e => setNewPw2(e.target.value)} />
              {!isMs && (
                <TextInput label="Código do autenticador" icon={ShieldCheck} inputMode="numeric" placeholder="000000" maxLength={6} value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g, ''))} />
              )}
              <Button variant="primary" loading={busy} disabled={!curPw || !newPw || newPw !== newPw2 || (!isMs && totp.length < 6)} onClick={changePassword}>
                {isMs ? 'Verificar com Microsoft e trocar' : 'Trocar master password'}
              </Button>
              <p className="text-xs" style={{ color: 'var(--text-light)' }}>
                Seus itens não são recifrados — só a proteção da chave muda. Uma nova recovery key será gerada.
              </p>
            </div>
          )}
        </Card>

        {/* Recuperação — lado a lado com "Trocar" */}
        <Card>
          <h3 className="flex items-center gap-2 font-semibold mb-3" style={{ color: 'var(--text)' }}>
            <LifeBuoy className="w-4 h-4" style={{ color: 'var(--warning)' }} /> Esqueci a master password (recovery key)
          </h3>
          {recNextRecovery ? (
            <div className="flex flex-col gap-3 max-w-xl">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Acesso recuperado. Sua NOVA recovery key:</p>
              <div className="rounded-xl p-3 font-mono text-sm break-all select-all text-center" style={{ background: 'var(--surface-hover)', border: '1px dashed var(--border)', color: 'var(--text)' }}>{recNextRecovery}</div>
              <Button variant="primary" onClick={() => setRecNextRecovery(null)}>Guardei em local seguro</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <TextInput label="Recovery key" placeholder="XXXX-XXXX-…" autoComplete="off" value={recKey} onChange={e => setRecKey(e.target.value)} />
              {!isMs && (
                <TextInput label="Código do autenticador" icon={ShieldCheck} inputMode="numeric" placeholder="000000" maxLength={6} value={recTotp} onChange={e => setRecTotp(e.target.value.replace(/\D/g, ''))} />
              )}
              <TextInput label="Nova master password (mín. 12)" type={showRecNew ? 'text' : 'password'} autoComplete="new-password" value={recNewPw} onChange={e => setRecNewPw(e.target.value)} />
              <GenPwRow onGen={() => genInto(setRecNewPw, setRecNewPw2, setShowRecNew)} onCopy={() => copyPw(recNewPw)} canCopy={!!recNewPw} shown={showRecNew} onToggle={() => setShowRecNew(s => !s)} />
              <TextInput label="Confirme a nova" type={showRecNew ? 'text' : 'password'} autoComplete="new-password" value={recNewPw2} onChange={e => setRecNewPw2(e.target.value)} />
              <Button variant="primary" loading={recBusy} disabled={!recKey || (!isMs && recTotp.length < 6) || !recNewPw || recNewPw !== recNewPw2} onClick={recover}>
                {isMs ? 'Verificar com Microsoft e recuperar' : 'Recuperar acesso'}
              </Button>
            </div>
          )}
          <div className="mt-3 rounded-lg p-3 text-xs flex gap-2" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)' }}>
            <ShieldCheck className="w-4 h-4 shrink-0 mt-px" />
            <span>
              <b>Não sabe a recovery key?</b> Procure um administrador — ele gera um <b>link de redefinição</b> para você criar uma nova
              master password e uma nova recovery key. Atenção: por ser zero-knowledge, os <b>itens do seu cofre pessoal são perdidos</b> nesse
              reset (ninguém, nem o admin, consegue decifrá-los sem a senha ou a recovery key). Já os <b>cofres compartilhados voltam</b> automaticamente
              quando um admin te reconvida.
            </span>
          </div>
        </Card>

        {status !== 'unlocked' && (
          <p className="text-xs lg:col-span-2" style={{ color: 'var(--text-light)' }}>
            Para trocar a master password, destrave o cofre primeiro. Esqueceu? Use a recuperação acima.
          </p>
        )}
      </div>
    </AppLayout>
  )
}
