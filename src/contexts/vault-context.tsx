'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Cofre de Senhas — estado client-side do cofre destravado.
// As chaves (CryptoKey non-extractable) vivem SÓ EM MEMÓRIA (useRef) — nunca em
// state serializável, storage ou cookie. Fechar a aba = travado por construção.
// Auto-lock: inatividade (timeout configurável) + aba oculta por >60s.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import {
  aesGcmDecrypt, computeAuthHash, deriveMasterKey, importAesKey, importRsaPrivateKey,
  rsaUnwrap, type KdfParams, KDF_DEFAULTS,
} from '@/lib/vault-crypto'

export interface VaultProfile {
  configured: boolean
  /** driver do 2º fator: 'microsoft' (Entra, popup a cada unlock) ou 'totp' (app) */
  second_factor: 'microsoft' | 'totp'
  totp_confirmed: boolean
  ms_linked: boolean
  has_recovery: boolean
  kdf: KdfParams
}

export interface VaultSummary {
  id: number
  type: 'personal' | 'shared'
  name: string
  role: 'admin' | 'write' | 'read'
  key_version: number
  pending_rotation: boolean
  encrypted_vault_key: string
  member_key_version: number
  items_count: number
  members_count: number
}

export type VaultStatus = 'loading' | 'unconfigured' | 'locked' | 'unlocked'

// Timeout do auto-lock (minutos). Só o NÚMERO persiste — nunca chaves.
const LS_TIMEOUT_KEY = 'minutor_vault_lock_min'
export const LOCK_TIMEOUT_OPTIONS = [1, 5, 15, 30] as const
const HIDDEN_LOCK_MS = 60_000

interface VaultCtx {
  status: VaultStatus
  profile: VaultProfile | null
  vaults: VaultSummary[]
  publicKey: string | null
  lockTimeoutMin: number
  setLockTimeoutMin: (min: number) => void
  refreshProfile: () => Promise<void>
  unlock: (masterPassword: string, secondFactor: string) => Promise<void>
  lock: () => void
  refreshVaults: () => Promise<void>
  getVaultKey: (vaultId: number) => CryptoKey | undefined
  getPrivateKey: () => CryptoKey | undefined
  getUserKey: () => CryptoKey | undefined
  /** Blob cifrado da user key (ciphertext, não é segredo) — troca de master password local. */
  getEncSymKeyBlob: () => string | null
  /** Re-prompt local: prova a master password decifrando o blob offline (sem rede). */
  verifyMasterPasswordLocal: (masterPassword: string) => Promise<boolean>
}

const VaultContext = createContext<VaultCtx | null>(null)

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [status, setStatus] = useState<VaultStatus>('loading')
  const [profile, setProfile] = useState<VaultProfile | null>(null)
  const [vaults, setVaults] = useState<VaultSummary[]>([])
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [lockTimeoutMin, setLockTimeoutMinState] = useState<number>(() => {
    if (typeof window === 'undefined') return 5
    const v = Number(window.localStorage.getItem(LS_TIMEOUT_KEY))
    return LOCK_TIMEOUT_OPTIONS.includes(v as 1 | 5 | 15 | 30) ? v : 5
  })

  // Chaves destravadas — SÓ memória
  const userKeyRef = useRef<CryptoKey | undefined>(undefined)
  const privateKeyRef = useRef<CryptoKey | undefined>(undefined)
  const vaultKeysRef = useRef<Map<number, CryptoKey>>(new Map())
  // Blob (ciphertext, não é segredo) cacheado p/ verificação local no re-prompt
  const encSymKeyBlobRef = useRef<string | null>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const hiddenSinceRef = useRef<number | null>(null)

  const lock = useCallback(() => {
    userKeyRef.current = undefined
    privateKeyRef.current = undefined
    vaultKeysRef.current = new Map()
    setVaults([])
    setStatus(s => (s === 'unlocked' ? 'locked' : s))
  }, [])

  const refreshProfile = useCallback(async () => {
    try {
      const p = await api.get<VaultProfile>('/vault/profile')
      setProfile(p)
      setStatus(prev => {
        // `configured` (auth_hash + chaves) já implica que o 2º fator estava pronto
        // no setup — não exigir totp_confirmed aqui (no driver Microsoft ele é sempre
        // false e reabria o onboarding de um cofre já configurado).
        if (!p.configured) return 'unconfigured'
        return prev === 'unlocked' ? 'unlocked' : 'locked'
      })
    } catch (e) {
      // 403 = perfil sem acesso ao cofre; AppLayout já bloqueia a view — mantém loading discreto
      if (e instanceof ApiError && e.status === 403) setStatus('loading')
      else throw e
    }
  }, [])

  useEffect(() => {
    if (user) void refreshProfile()
  }, [user, refreshProfile])

  const decryptVaultKeys = useCallback(async (list: VaultSummary[]) => {
    const priv = privateKeyRef.current
    if (!priv) return
    const map = vaultKeysRef.current
    for (const v of list) {
      if (map.has(v.id)) continue
      try {
        map.set(v.id, await importAesKey(await rsaUnwrap(priv, v.encrypted_vault_key)))
      } catch {
        // wrap de key_version antiga (rotação em andamento) — cofre fica ilegível até re-sync
      }
    }
  }, [])

  const refreshVaults = useCallback(async () => {
    const list = await api.get<VaultSummary[]>('/vault/vaults')
    setVaults(list)
    await decryptVaultKeys(list)
  }, [decryptVaultKeys])

  // secondFactor = código TOTP (driver totp) ou stepup_token Microsoft (driver microsoft)
  const unlock = useCallback(async (masterPassword: string, secondFactor: string) => {
    if (!user) throw new Error('Sessão expirada')
    const kdf = profile?.kdf ?? KDF_DEFAULTS
    const masterKey = await deriveMasterKey(masterPassword, user.id, user.email, kdf)
    const authHash = await computeAuthHash(masterKey, masterPassword)
    // MS: step-up já foi validado no servidor pelo popup (consumido no unlock) — nada no payload.
    const factorField = profile?.second_factor === 'microsoft'
      ? {}
      : { totp_code: secondFactor }
    const res = await api.post<{
      encrypted_symmetric_key: string
      encrypted_private_key: string
      public_key: string
      kdf: KdfParams
    }>('/vault/unlock', { auth_hash: authHash, ...factorField })

    // Decifra a cadeia local — falha de tag GCM = senha errada (defesa extra local)
    const masterCryptoKey = await importAesKey(masterKey)
    const userKeyBytes = await aesGcmDecrypt(masterCryptoKey, res.encrypted_symmetric_key)
    const userKey = await importAesKey(userKeyBytes)
    const privBytes = await aesGcmDecrypt(userKey, res.encrypted_private_key)
    const priv = await importRsaPrivateKey(privBytes)

    userKeyRef.current = userKey
    privateKeyRef.current = priv
    encSymKeyBlobRef.current = res.encrypted_symmetric_key
    setPublicKey(res.public_key)
    lastActivityRef.current = Date.now()
    setStatus('unlocked')
    await refreshVaults()
  }, [user, profile, refreshVaults])

  const verifyMasterPasswordLocal = useCallback(async (masterPassword: string) => {
    if (!user || !encSymKeyBlobRef.current) return false
    try {
      const kdf = profile?.kdf ?? KDF_DEFAULTS
      const masterKey = await deriveMasterKey(masterPassword, user.id, user.email, kdf)
      await aesGcmDecrypt(await importAesKey(masterKey), encSymKeyBlobRef.current)
      return true
    } catch {
      return false
    }
  }, [user, profile])

  const setLockTimeoutMin = useCallback((min: number) => {
    setLockTimeoutMinState(min)
    try { window.localStorage.setItem(LS_TIMEOUT_KEY, String(min)) } catch { /* noop */ }
  }, [])

  // ── Auto-lock ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'unlocked') return

    let lastMark = 0
    const markActivity = () => {
      const now = Date.now()
      if (now - lastMark > 10_000) { // throttle 10s
        lastMark = now
        lastActivityRef.current = now
      }
    }
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    events.forEach(ev => window.addEventListener(ev, markActivity, { passive: true }))

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current = Date.now()
      } else {
        if (hiddenSinceRef.current && Date.now() - hiddenSinceRef.current > HIDDEN_LOCK_MS) lock()
        hiddenSinceRef.current = null
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    const interval = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current > lockTimeoutMin * 60_000) lock()
    }, 5_000)

    return () => {
      events.forEach(ev => window.removeEventListener(ev, markActivity))
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(interval)
    }
  }, [status, lockTimeoutMin, lock])

  return (
    <VaultContext.Provider value={{
      status, profile, vaults, publicKey, lockTimeoutMin, setLockTimeoutMin,
      refreshProfile, unlock, lock, refreshVaults,
      getVaultKey: (id: number) => vaultKeysRef.current.get(id),
      getPrivateKey: () => privateKeyRef.current,
      getUserKey: () => userKeyRef.current,
      getEncSymKeyBlob: () => encSymKeyBlobRef.current,
      verifyMasterPasswordLocal,
    }}>
      {children}
    </VaultContext.Provider>
  )
}

export function useVault(): VaultCtx {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error('useVault precisa do VaultProvider (layout de /cofre)')
  return ctx
}
