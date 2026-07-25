'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding do Cofre — 4 passos:
//  1. Master password (mín. 12, medidor de força, aviso de irrecuperabilidade)
//  2. 2FA: QR TOTP (renderizado no client) + confirmação do código
//  3. Derivação das chaves + RECOVERY KEY exibida UMA ÚNICA VEZ
//  4. Conclusão → volta pra tela de unlock
// Toda a criptografia acontece aqui no browser; o servidor só recebe blobs.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { AlertTriangle, Check, Copy, KeyRound, Printer, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useVault } from '@/contexts/vault-context'
import { requestMicrosoftStepUp, StepUpCancelled } from '@/lib/vault-stepup'
import {
  aesGcmEncrypt, computeAuthHash, deriveMasterKey, formatRecoveryKey, generateKey32,
  importAesKey, KDF_DEFAULTS, passwordStrength, rsaGenerate, rsaWrap,
} from '@/lib/vault-crypto'

const STRENGTH_LABEL = ['Fraca demais', 'Razoável', 'Forte', 'Excelente'] as const
const STRENGTH_COLOR = ['var(--danger)', 'var(--warning)', 'var(--success)', 'var(--success)'] as const

function StrengthMeter({ password }: { password: string }) {
  const s = passwordStrength(password)
  if (!password) return null
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${(s + 1) * 25}%`, background: STRENGTH_COLOR[s] }} />
      </div>
      <span className="text-xs" style={{ color: STRENGTH_COLOR[s] }}>{STRENGTH_LABEL[s]}</span>
    </div>
  )
}

export function OnboardingWizard() {
  const { user } = useAuth()
  const { profile, refreshProfile } = useVault()
  const isMs = profile?.second_factor === 'microsoft'
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [busy, setBusy] = useState(false)

  // passo 1
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  // passo 2 (TOTP)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [totpSecret, setTotpSecret] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [totpConfirmed, setTotpConfirmed] = useState(false)
  // passo 2 (Microsoft) — token do step-up guardado p/ mandar no setup
  const [msToken, setMsToken] = useState<string | null>(null)
  // passo 3
  const [recoveryDisplay, setRecoveryDisplay] = useState<string | null>(null)
  const [recoverySaved, setRecoverySaved] = useState(false)

  const factorReady = isMs ? !!msToken : totpConfirmed
  const pwOk = passwordStrength(pw) >= 1 && pw.length >= 12 && pw === pw2

  // Avança do passo 1: no driver Microsoft não há QR — só segue pro passo de vínculo.
  const goToFactor = async () => {
    if (isMs) { setStep(2); return }
    setBusy(true)
    try {
      const res = await api.post<{ otpauth_uri: string; secret_base32: string }>('/vault/totp/setup', {})
      const QRCode = (await import('qrcode')).default
      setQrDataUrl(await QRCode.toDataURL(res.otpauth_uri, { margin: 1, width: 220 }))
      setTotpSecret(res.secret_base32)
      setStep(2)
    } catch {
      toast.error('Não foi possível iniciar o 2FA. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  const linkMicrosoft = async () => {
    setBusy(true)
    try {
      const token = await requestMicrosoftStepUp()
      setMsToken(token)
      toast.success('Conta Microsoft vinculada!')
    } catch (err) {
      if (err instanceof StepUpCancelled) toast.info('Verificação cancelada.')
      else toast.error(err instanceof Error ? err.message : 'Falha na verificação Microsoft.')
    } finally {
      setBusy(false)
    }
  }

  const confirmTotp = async () => {
    setBusy(true)
    try {
      await api.post('/vault/totp/confirm', { code: totpCode })
      setTotpConfirmed(true)
      toast.success('Autenticador confirmado!')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Código inválido.')
    } finally {
      setBusy(false)
    }
  }

  /** Deriva TODA a cadeia de chaves no browser e envia só os blobs. */
  const generateAndSetup = async () => {
    if (!user) return
    setBusy(true)
    try {
      const masterKey = await deriveMasterKey(pw, user.id, user.email, KDF_DEFAULTS)
      const authHash = await computeAuthHash(masterKey, pw)
      const masterCryptoKey = await importAesKey(masterKey)

      const userKeyBytes = generateKey32()
      const userKey = await importAesKey(userKeyBytes)
      const { publicKeySpkiB64, privatePkcs8 } = await rsaGenerate()
      const recoveryBytes = generateKey32()
      const recoveryKey = await importAesKey(recoveryBytes)
      const personalVaultKeyBytes = generateKey32()

      const payload = {
        auth_hash: authHash,
        encrypted_symmetric_key: await aesGcmEncrypt(masterCryptoKey, userKeyBytes),
        public_key: publicKeySpkiB64,
        encrypted_private_key: await aesGcmEncrypt(userKey, privatePkcs8),
        recovery_symmetric_key: await aesGcmEncrypt(recoveryKey, userKeyBytes),
        kdf_iterations: KDF_DEFAULTS.iterations,
        kdf_memory: KDF_DEFAULTS.memory,
        kdf_parallelism: KDF_DEFAULTS.parallelism,
        personal_vault: {
          encrypted_vault_key: await rsaWrap(publicKeySpkiB64, personalVaultKeyBytes),
        },
        // driver Microsoft exige step-up fresco no próprio setup
        ...(isMs && msToken ? { stepup_token: msToken } : {}),
      }
      await api.post('/vault/profile/setup', payload)
      setRecoveryDisplay(formatRecoveryKey(recoveryBytes))
      setPw(''); setPw2('') // zera segredos do state o quanto antes
      setStep(3)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao configurar o cofre.')
    } finally {
      setBusy(false)
    }
  }

  const copyRecovery = async () => {
    if (!recoveryDisplay) return
    await navigator.clipboard.writeText(recoveryDisplay)
    toast.success('Recovery key copiada — guarde em local seguro!')
  }

  const printRecovery = () => {
    if (!recoveryDisplay) return
    const w = window.open('', '_blank', 'width=600,height=400')
    if (!w) return
    w.document.write(`<pre style="font-size:16px;padding:24px">Minutor — Recovery Key do Cofre\nUsuário: ${user?.email ?? ''}\n\n${recoveryDisplay}\n\nGuarde impresso em local seguro. Sem ela + master password, o cofre pessoal é IRRECUPERÁVEL.</pre>`)
    w.document.close()
    w.print()
  }

  const finish = async () => {
    setRecoveryDisplay(null) // nunca mais exibida
    setStep(4)
    await refreshProfile()
  }

  return (
    <div className="flex justify-center pt-6">
      <Card className="w-full max-w-xl">
        {/* progresso */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map(n => (
            <div key={n} className="flex-1 h-1.5 rounded-full" style={{ background: step > n ? 'var(--success)' : step === n ? 'var(--primary)' : 'var(--border)' }} />
          ))}
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text)' }}>Crie sua master password</h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                É a chave de TUDO no seu cofre — e nunca sai do seu navegador.
              </p>
            </div>
            <div className="flex items-start gap-2 rounded-xl p-3 text-sm" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Ninguém — nem o administrador do Minutor — consegue recuperá-la. Se você esquecer a master
                password E perder a recovery key (próximo passo), o cofre pessoal é <b>perdido para sempre</b>.
              </span>
            </div>
            <TextInput label="Master password (mín. 12 caracteres)" icon={KeyRound} type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} />
            <StrengthMeter password={pw} />
            <TextInput label="Confirme a master password" icon={KeyRound} type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} />
            {pw2 && pw !== pw2 && <p className="text-xs" style={{ color: 'var(--danger)' }}>As senhas não conferem.</p>}
            <Button variant="primary" loading={busy} disabled={!pwOk} onClick={goToFactor}>Continuar</Button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text)' }}>
                {isMs ? 'Vincule sua conta Microsoft' : 'Ative o 2FA (obrigatório)'}
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {isMs
                  ? 'Sua conta corporativa Microsoft é o 2º fator do cofre — você a confirmará a cada destravamento.'
                  : 'Escaneie o QR no seu app autenticador (Google Authenticator, 1Password, Authy…).'}
              </p>
            </div>

            {isMs ? (
              !msToken ? (
                <Button variant="primary" icon={ShieldCheck} loading={busy} onClick={linkMicrosoft}>
                  Verificar com a Microsoft
                </Button>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--success)' }}>
                    <Check className="w-4 h-4" /> Conta Microsoft vinculada
                  </div>
                  <Button variant="primary" loading={busy} onClick={generateAndSetup}>Gerar chaves do cofre</Button>
                  <p className="text-xs text-center" style={{ color: 'var(--text-light)' }}>
                    A derivação leva ~1s — todo o processamento acontece no seu navegador.
                  </p>
                </>
              )
            ) : (
              <>
                {qrDataUrl && (
                  <div className="flex flex-col items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt="QR Code TOTP" className="rounded-xl" style={{ border: '1px solid var(--border)' }} />
                    <p className="text-xs font-mono break-all text-center" style={{ color: 'var(--text-light)' }}>{totpSecret}</p>
                  </div>
                )}
                {!totpConfirmed ? (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <TextInput label="Código do app" icon={ShieldCheck} inputMode="numeric" placeholder="000000" maxLength={6} value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))} />
                    </div>
                    <Button variant="primary" loading={busy} disabled={totpCode.length < 6} onClick={confirmTotp}>Confirmar</Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--success)' }}>
                      <Check className="w-4 h-4" /> Autenticador confirmado
                    </div>
                    <Button variant="primary" loading={busy} onClick={generateAndSetup}>
                      Gerar chaves do cofre
                    </Button>
                    <p className="text-xs text-center" style={{ color: 'var(--text-light)' }}>
                      A derivação leva ~1s — todo o processamento acontece no seu navegador.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {step === 3 && recoveryDisplay && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text)' }}>Sua recovery key</h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Exibida <b>apenas esta vez</b>. É o único jeito de recuperar o cofre se você esquecer a master password.
              </p>
            </div>
            <div className="rounded-xl p-4 font-mono text-sm break-all select-all text-center" style={{ background: 'var(--surface-hover)', border: '1px dashed var(--border)', color: 'var(--text)' }}>
              {recoveryDisplay}
            </div>
            <div className="flex gap-2">
              <Button icon={Copy} onClick={copyRecovery}>Copiar</Button>
              <Button icon={Printer} onClick={printRecovery}>Imprimir</Button>
            </div>
            <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
              <input type="checkbox" className="mt-1" checked={recoverySaved} onChange={e => setRecoverySaved(e.target.checked)} />
              <span>Guardei minha recovery key em local seguro. Entendo que ela não será exibida novamente.</span>
            </label>
            <Button variant="primary" disabled={!recoverySaved} onClick={finish}>Concluir</Button>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--success-bg)' }}>
              <Check className="w-6 h-6" style={{ color: 'var(--success)' }} />
            </div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Cofre configurado!</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Destrave com sua master password + código do autenticador para começar a usar.
            </p>
          </div>
        )}
      </Card>
    </div>
  )
}
