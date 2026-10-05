'use client'

// ⚡ Acesso Rápido ao Ambiente — o diferencial Protheus. Concentra as ações mais
// usadas: Abrir RDP · Copiar usuário · Copiar conexão SQL · Abrir VPN · Baixar
// appserver.ini · Abrir portais. Cada ação sensível passa pelo MESMO gate de
// reveal/ACL do resto do módulo (o servidor enforça; itens críticos exigem step-up).

import { useState } from 'react'
import { Copy, Database, Download, ExternalLink, Loader2, Monitor, Star, User, Wifi, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { aesGcmDecryptString } from '@/lib/vault-crypto'
import { decryptEnc, fetchEncryptedAttachment, triggerDownload } from '@/lib/env-file-crypto'

const CLIPBOARD_CLEAR_MS = 30_000
const PORTAL_KINDS = new Set(['tss', 'fluig', 'portal', 'powerbi', 'sharepoint'])

interface Perms { reveal: boolean; copy: boolean }
interface Env { id: number; name: string; rdp_host: string | null; rdp_port: number | null; is_favorite?: boolean }
interface Cred { id: number; category: string; label: string; username: string | null }
interface Db { id: number; engine: string; server: string; port: number | null; instance: string | null; database: string | null; username: string | null; has_password: boolean; secret_id: number | null; critical: boolean }
interface App { id: number; name: string; ini_attachment_id: number | null }
interface Vpn { id: number; provider: string; ovpn_attachment_id: number | null }
interface Link { id: number; label: string; url: string; kind: string }

interface Props {
  env: Env
  creds: Cred[]
  dbs: Db[]
  apps: App[]
  vpns: Vpn[]
  links: Link[]
  vaultKey: CryptoKey | undefined
  perms: Perms
  onFavoriteChanged?: (fav: boolean) => void
}

/** Botão-ação compacto do launcher. */
function Chip({ icon: Icon, label, onClick, busy, disabled, title, tone = 'default' }: {
  icon: typeof Copy; label: string; onClick: () => void; busy?: boolean; disabled?: boolean; title?: string; tone?: 'default' | 'primary' | 'warning'
}) {
  const color = tone === 'primary' ? 'var(--primary)' : tone === 'warning' ? 'var(--warning)' : 'var(--text)'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      title={title ?? label}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color }}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      <span className="truncate max-w-[200px]">{label}</span>
    </button>
  )
}

export function EnvQuickAccess({ env, creds, dbs, apps, vpns, links, vaultKey, perms, onFavoriteChanged }: Props) {
  const [fav, setFav] = useState(!!env.is_favorite)
  const [busy, setBusy] = useState<string | null>(null)

  const openLinks = links.filter(l => PORTAL_KINDS.has(l.kind))
  const sqlDbs = dbs.filter(d => d.has_password && d.secret_id)
  const iniApps = apps.filter(a => a.ini_attachment_id)
  const ovpns = vpns.filter(v => v.ovpn_attachment_id)
  const adminUser = creds.find(c => c.username)?.username ?? null

  const toggleFav = async () => {
    setBusy('fav')
    try {
      const res = await api.post<{ favorited: boolean }>(`/environments/environments/${env.id}/favorite`, {})
      setFav(res.favorited); onFavoriteChanged?.(res.favorited)
    } catch { toast.error('Falha ao favoritar.') } finally { setBusy(null) }
  }

  /** Revela uma senha pelo endpoint enforced e decifra no client. */
  const revealSecret = async (secretId: number): Promise<string | null> => {
    if (!vaultKey) { toast.error('Cofre travado ou sem chave deste cliente.'); return null }
    const res = await api.post<{ data: string; vault_id: number }>(`/environments/secrets/${secretId}/reveal`, { action: 'copy' })
    return aesGcmDecryptString(vaultKey, res.data)
  }

  const clearClipboardLater = (value: string) => {
    window.setTimeout(() => {
      if (document.hasFocus()) navigator.clipboard.readText?.().then(cur => { if (cur === value) void navigator.clipboard.writeText('') }).catch(() => {})
    }, CLIPBOARD_CLEAR_MS)
  }

  const copyText = async (value: string, msg: string, clear = false) => {
    await navigator.clipboard.writeText(value)
    toast.success(msg)
    if (clear) clearClipboardLater(value)
  }

  const openRdp = () => {
    if (!env.rdp_host) return
    const port = env.rdp_port ?? 3389
    const content = `full address:s:${env.rdp_host}:${port}\r\nprompt for credentials:i:1\r\nadministrative session:i:0\r\n`
    triggerDownload(new TextEncoder().encode(content), `${env.name.replace(/[^\w.-]+/g, '_')}.rdp`)
    toast.success('Arquivo .rdp gerado — abra com a Conexão de Área de Trabalho Remota.')
  }

  const copySql = async (d: Db) => {
    if (!(perms.copy && perms.reveal)) { toast.error('Sem permissão para revelar/copiar a senha.'); return }
    setBusy(`sql${d.id}`)
    try {
      const pwd = await revealSecret(d.secret_id!)
      if (pwd === null) return
      const host = d.instance ? `${d.server}\\${d.instance}` : d.server + (d.port ? `,${d.port}` : '')
      const conn = `Server=${host};Database=${d.database ?? ''};User Id=${d.username ?? ''};Password=${pwd};`
      await copyText(conn, 'Conexão SQL copiada — o clipboard será limpo em 30s.', true)
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 422 ? 'Banco crítico: revele na seção Banco (exige justificativa).' : (err instanceof ApiError ? err.message : 'Falha ao montar a conexão.'))
    } finally { setBusy(null) }
  }

  const downloadEnc = async (attachmentId: number, name: string, key: string) => {
    if (!vaultKey) { toast.error('Cofre travado ou sem chave deste cliente.'); return }
    setBusy(key)
    try {
      const plain = await decryptEnc(vaultKey, await fetchEncryptedAttachment(attachmentId))
      triggerDownload(plain, name)
      toast.success('Arquivo decifrado e baixado.')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Falha ao baixar/decifrar.') } finally { setBusy(null) }
  }

  const hasActions = env.rdp_host || adminUser || sqlDbs.length || ovpns.length || iniApps.length || openLinks.length

  return (
    <Card padding="sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 font-semibold text-sm" style={{ color: 'var(--primary)' }}>
          <Zap className="w-4 h-4" /> Acesso Rápido
        </h3>
        <button
          type="button" onClick={toggleFav} disabled={busy === 'fav'} title={fav ? 'Remover dos favoritos' : 'Favoritar ambiente'}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm hover:opacity-80"
          style={{ color: fav ? 'var(--warning)' : 'var(--text-muted)' }}
        >
          <Star className="w-4 h-4" fill={fav ? 'currentColor' : 'none'} /> {fav ? 'Favorito' : 'Favoritar'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {env.rdp_host && (
          <>
            <Chip icon={Monitor} label="Abrir RDP" onClick={openRdp} tone="primary" title={`RDP ${env.rdp_host}:${env.rdp_port ?? 3389}`} />
            <Chip icon={Copy} label="Copiar host RDP" onClick={() => copyText(`${env.rdp_host}:${env.rdp_port ?? 3389}`, 'Host RDP copiado.')} />
          </>
        )}
        {adminUser && (
          <Chip icon={User} label={`Copiar usuário (${adminUser})`} onClick={() => copyText(adminUser, 'Usuário copiado.')} />
        )}
        {sqlDbs.map(d => (
          <Chip key={`sql${d.id}`} icon={Database} label={`Conexão SQL · ${d.server}`} onClick={() => copySql(d)} busy={busy === `sql${d.id}`}
            disabled={!(perms.copy && perms.reveal)} tone={d.critical ? 'warning' : 'default'}
            title={!(perms.copy && perms.reveal) ? 'Sem permissão' : `Copiar string de conexão de ${d.server}`} />
        ))}
        {ovpns.map(v => (
          <Chip key={`vpn${v.id}`} icon={Wifi} label={`Abrir VPN · ${v.provider}`} onClick={() => downloadEnc(v.ovpn_attachment_id!, `${v.provider}.ovpn`, `vpn${v.id}`)} busy={busy === `vpn${v.id}`} />
        ))}
        {iniApps.map(a => (
          <Chip key={`ini${a.id}`} icon={Download} label={`appserver.ini · ${a.name}`} onClick={() => downloadEnc(a.ini_attachment_id!, `${a.name}-appserver.ini`, `ini${a.id}`)} busy={busy === `ini${a.id}`} />
        ))}
        {openLinks.map(l => (
          <Chip key={`lnk${l.id}`} icon={ExternalLink} label={l.label} onClick={() => window.open(l.url.startsWith('http') ? l.url : `https://${l.url}`, '_blank', 'noopener,noreferrer')} title={l.url} />
        ))}
        {!hasActions && (
          <p className="text-xs" style={{ color: 'var(--text-light)' }}>
            Sem ações rápidas ainda — cadastre credenciais, banco, VPN, appserver.ini, links ou o host RDP do ambiente.
          </p>
        )}
      </div>
    </Card>
  )
}
