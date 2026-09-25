// ─────────────────────────────────────────────────────────────────────────────
// Cofre de Senhas — criptografia CLIENT-SIDE (zero-knowledge).
//
// CONTRATO DE BLOBS (FE ↔ BE — o servidor trata tudo como TEXT opaco):
//   AES-256-GCM : "v1.<base64(iv 12B)>.<base64(ciphertext||tag)>"
//   RSA-OAEP    : "v1r.<base64(ciphertext)>"
//   Chave pública: base64 de SPKI · privada: PKCS8 cifrado no formato AES acima
//
// Hierarquia de chaves (modelo Bitwarden simplificado):
//   master password ──Argon2id──► master key (nunca sai do client)
//   master key ──AES-GCM──► user symmetric key (aleatória) ──► private key RSA
//   vault key (por cofre) ──wrap RSA-OAEP por membro──► itens AES-GCM
//   auth hash (derivado ≠ master key) é o ÚNICO segredo enviado ao servidor.
//
// NUNCA persistir chaves/senhas em storage — só memória (VaultProvider).
// Nota CSP futura: hash-wasm exige 'wasm-unsafe-eval' em script-src.
// ─────────────────────────────────────────────────────────────────────────────

export const KDF_DEFAULTS = { iterations: 3, memory: 65536, parallelism: 4 } as const
export type KdfParams = { iterations: number; memory: number; parallelism: number }

export interface VaultItemData {
  username?: string
  password?: string
  url?: string
  notes?: string
  totp_seed?: string
  /** exigir master password de novo para revelar/copiar */
  reprompt?: boolean
}

const te = new TextEncoder()
const td = new TextDecoder()

function toB64(bytes: Uint8Array): string {
  let bin = ''
  bytes.forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin)
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64)
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

async function sha256(data: string | Uint8Array): Promise<Uint8Array> {
  const bytes = typeof data === 'string' ? te.encode(data) : data
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
}

// ── KDF (Argon2id via hash-wasm, import dinâmico p/ não inflar o bundle) ────

/** master password → master key (32B). Sal determinístico por conta. */
export async function deriveMasterKey(masterPassword: string, userId: number, email: string, kdf: KdfParams = KDF_DEFAULTS): Promise<Uint8Array> {
  const { argon2id } = await import('hash-wasm')
  const salt = await sha256(`${userId}:${email.trim().toLowerCase()}`)
  return argon2id({
    password: masterPassword,
    salt,
    iterations: kdf.iterations,
    memorySize: kdf.memory,
    parallelism: kdf.parallelism,
    hashLength: 32,
    outputType: 'binary',
  })
}

/**
 * Auth hash: o que vai ao servidor no unlock (lá vira bcrypt). Derivação one-way
 * a partir da master key — o servidor não consegue chegar na master key por ele.
 */
export async function computeAuthHash(masterKey: Uint8Array, masterPassword: string): Promise<string> {
  const { argon2id } = await import('hash-wasm')
  const salt = await sha256(masterPassword)
  const out: Uint8Array = await argon2id({
    password: masterKey,
    salt,
    iterations: 1,
    memorySize: 8192,
    parallelism: 1,
    hashLength: 32,
    outputType: 'binary',
  })
  return toB64(out)
}

// ── AES-256-GCM ("v1.") ──────────────────────────────────────────────────────

export function generateKey32(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32))
}

/** Importa bytes como CryptoKey AES-GCM. Default NON-EXTRACTABLE (só rotação exporta). */
export async function importAesKey(bytes: Uint8Array, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bytes as BufferSource, { name: 'AES-GCM' }, extractable, ['encrypt', 'decrypt'])
}

export async function aesGcmEncrypt(key: CryptoKey, plaintext: Uint8Array | string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = typeof plaintext === 'string' ? te.encode(plaintext) : plaintext
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource))
  return `v1.${toB64(iv)}.${toB64(ct)}`
}

/** Lança se o blob for inválido ou a chave errada (tag GCM não confere). */
export async function aesGcmDecrypt(key: CryptoKey, blob: string): Promise<Uint8Array> {
  const [ver, ivB64, ctB64] = blob.split('.')
  if (ver !== 'v1' || !ivB64 || !ctB64) throw new Error('Blob AES inválido')
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ivB64) as BufferSource },
    key,
    fromB64(ctB64) as BufferSource,
  )
  return new Uint8Array(pt)
}

export async function aesGcmDecryptString(key: CryptoKey, blob: string): Promise<string> {
  return td.decode(await aesGcmDecrypt(key, blob))
}

// ── RSA-OAEP-2048 ("v1r.") — compartilhamento de vault keys ─────────────────

const RSA_PARAMS: RsaHashedKeyGenParams = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
}

/** Gera o par do usuário. Privada sai EXPORTADA (PKCS8) p/ ser cifrada com a user key. */
export async function rsaGenerate(): Promise<{ publicKeySpkiB64: string; privatePkcs8: Uint8Array }> {
  const pair = await crypto.subtle.generateKey(RSA_PARAMS, true, ['encrypt', 'decrypt'])
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  return { publicKeySpkiB64: toB64(spki), privatePkcs8: pkcs8 }
}

export async function importRsaPrivateKey(pkcs8: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', pkcs8 as BufferSource, RSA_PARAMS, false, ['decrypt'])
}

/** Cifra bytes (vault key) com a chave PÚBLICA de um membro. */
export async function rsaWrap(publicKeySpkiB64: string, keyBytes: Uint8Array): Promise<string> {
  const pub = await crypto.subtle.importKey('spki', fromB64(publicKeySpkiB64) as BufferSource, RSA_PARAMS, false, ['encrypt'])
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, keyBytes as BufferSource))
  return `v1r.${toB64(ct)}`
}

export async function rsaUnwrap(privateKey: CryptoKey, blob: string): Promise<Uint8Array> {
  const [ver, ctB64] = blob.split('.')
  if (ver !== 'v1r' || !ctB64) throw new Error('Blob RSA inválido')
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, fromB64(ctB64) as BufferSource))
}

// ── Itens ────────────────────────────────────────────────────────────────────

export async function encryptItem(vaultKey: CryptoKey, item: VaultItemData): Promise<string> {
  return aesGcmEncrypt(vaultKey, JSON.stringify(item))
}

export async function decryptItem(vaultKey: CryptoKey, blob: string): Promise<VaultItemData> {
  return JSON.parse(await aesGcmDecryptString(vaultKey, blob)) as VaultItemData
}

// ── Recovery key (32B, exibida UMA vez em base32 agrupado) ──────────────────

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(bytes: Uint8Array): string {
  let out = ''
  let bits = 0
  let value = 0
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '')
  const out: number[] = []
  let bits = 0
  let value = 0
  for (const ch of clean) {
    value = (value << 5) | B32_ALPHABET.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

/** "XXXX-XXXX-…" (13 grupos de 4). Aceita colar com/sem hífens/espaços no parse. */
export function formatRecoveryKey(bytes: Uint8Array): string {
  return (base32Encode(bytes).match(/.{1,4}/g) ?? []).join('-')
}

export function parseRecoveryKey(display: string): Uint8Array {
  const bytes = base32Decode(display)
  if (bytes.length !== 32) throw new Error('Recovery key inválida')
  return bytes
}

// ── Gerador de senhas + entropia ────────────────────────────────────────────

export interface PasswordOptions {
  length: number
  upper: boolean
  lower: boolean
  digits: boolean
  symbols: boolean
}

export const PASSWORD_DEFAULTS: PasswordOptions = { length: 20, upper: true, lower: true, digits: true, symbols: true }

const CHARSETS = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // sem I/O (ambíguos)
  lower: 'abcdefghijkmnopqrstuvwxyz', // sem l
  digits: '23456789', // sem 0/1
  symbols: '!@#$%&*+-=?_',
} as const

export function generatePassword(opts: PasswordOptions = PASSWORD_DEFAULTS): string {
  const pools = (['upper', 'lower', 'digits', 'symbols'] as const).filter(k => opts[k])
  if (pools.length === 0 || opts.length < 4) return ''
  const all = pools.map(k => CHARSETS[k]).join('')
  const rand = (max: number) => {
    // rejection sampling — uniforme, sem viés de módulo
    const limit = Math.floor(0x100000000 / max) * max
    const buf = new Uint32Array(1)
    let v: number
    do { crypto.getRandomValues(buf); v = buf[0] } while (v >= limit)
    return v % max
  }
  // garante ≥1 char de cada classe ativa, resto uniforme, depois embaralha
  const chars = pools.map(k => CHARSETS[k][rand(CHARSETS[k].length)])
  while (chars.length < opts.length) chars.push(all[rand(all.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

/** Entropia estimada em bits (log2 do espaço do charset detectado × comprimento). */
export function passwordEntropy(password: string): number {
  if (!password) return 0
  let space = 0
  if (/[a-z]/.test(password)) space += 26
  if (/[A-Z]/.test(password)) space += 26
  if (/\d/.test(password)) space += 10
  if (/[^a-zA-Z0-9]/.test(password)) space += 32
  return Math.round(password.length * Math.log2(space || 1))
}

/** Classificação simples p/ o medidor: 0 fraca · 1 ok · 2 forte · 3 excelente. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  const bits = passwordEntropy(password)
  if (password.length < 12 || bits < 60) return 0
  if (bits < 80) return 1
  if (bits < 110) return 2
  return 3
}

// ── TOTP de ITENS (seeds guardadas cifradas; código gerado no client) ───────

export async function totpCode(seedBase32: string, period = 30, digits = 6): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', base32Decode(seedBase32) as BufferSource, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  )
  const timestep = Math.floor(Date.now() / 1000 / period)
  const counter = new Uint8Array(8)
  new DataView(counter.buffer).setBigUint64(0, BigInt(timestep))
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter as BufferSource))
  const offset = hmac[hmac.length - 1] & 0x0f
  const value = (
    ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]
  ) % 10 ** digits
  return String(value).padStart(digits, '0')
}

/** Segundos restantes do código TOTP atual. */
export function totpRemaining(period = 30): number {
  return period - (Math.floor(Date.now() / 1000) % period)
}
