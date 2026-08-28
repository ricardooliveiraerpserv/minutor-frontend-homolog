'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Detalhe do AMBIENTE — abrir um ambiente e encontrar tudo dentro.
// F1a+F1b: Credenciais, Banco, AppServer, VPN (senha via reveal enforced).
// Certificados/Links/Documentação entram nas próximas sub-fases.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  ArrowLeft, Database, KeyRound, Link2, Pencil, Plus, Server, ShieldAlert, ShieldCheck, Trash2, Wifi,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Select, Skeleton, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { useVault } from '@/contexts/vault-context'
import { UnlockScreen } from '@/components/vault/unlock-screen'
import { EnvRevealField } from '@/components/environments/env-reveal-field'
import { EnvCredentialModal } from '@/components/environments/env-credential-modal'
import { EnvDatabaseModal } from '@/components/environments/env-database-modal'
import { EnvAppserverModal } from '@/components/environments/env-appserver-modal'
import { EnvVpnModal } from '@/components/environments/env-vpn-modal'
import { EnvCertificateModal } from '@/components/environments/env-certificate-modal'
import { EnvEncryptedFile } from '@/components/environments/env-encrypted-file'
import { EnvLinkModal } from '@/components/environments/env-link-modal'
import { EnvDocs } from '@/components/environments/env-docs'
import { EnvPermissionsModal } from '@/components/environments/env-permissions-modal'
import { EnvQuickAccess } from '@/components/environments/env-quick-access'
import { EnvHubSection } from '@/components/environments/env-hub-section'

interface EnvPerms { view: boolean; reveal: boolean; copy: boolean; manage: boolean; admin: boolean; source: string }
interface EnvDetail { id: number; name: string; type: string; status: string; vault_id: number; rdp_host: string | null; rdp_port: number | null; is_favorite?: boolean; permissions?: EnvPerms }
interface CredRow { id: number; category: string; label: string; username: string | null; has_secret: boolean; secret_id: number | null; critical: boolean }
interface DbRow { id: number; engine: string; server: string; port: number | null; instance: string | null; database: string | null; username: string | null; has_password: boolean; secret_id: number | null; always_on: boolean; critical: boolean }
interface AppRow { id: number; name: string; version: string | null; build: string | null; root_path: string | null; port: number | null; ini_attachment_id: number | null }
interface VpnRow { id: number; provider: string; server: string | null; group: string | null; username: string | null; has_password: boolean; secret_id: number | null; critical: boolean; ovpn_attachment_id: number | null }
interface CertRow { id: number; name: string; type: string; valid_to: string | null; days_to_expire: number | null; has_pfx_password: boolean; pfx_pass_secret_id: number | null; pfx_attachment_id: number | null; critical: boolean }
interface LinkRow { id: number; label: string; url: string; kind: string }

const TYPE_LABEL: Record<string, string> = { prod: 'Produção', homolog: 'Homologação', dev: 'Desenvolvimento', dr: 'DR' }
const CAT_LABEL: Record<string, string> = {
  win_admin: 'Admin Windows', sql: 'Admin SQL', protheus: 'Admin Protheus', fluig: 'Admin Fluig',
  totvs_license: 'TOTVS License', smtp: 'SMTP', ftp: 'FTP', azure: 'Azure', aws: 'AWS', gcp: 'GCP', o365: 'Office 365', portal: 'Portal',
}

function SectionCard({ icon: Icon, title, count, onAdd, canManage, children }: {
  icon: typeof KeyRound; title: string; count: number; onAdd: () => void; canManage: boolean; children: React.ReactNode
}) {
  return (
    <Card padding="none" className="overflow-x-auto">
      <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text)' }}>
          <Icon className="w-4 h-4" style={{ color: 'var(--primary)' }} /> {title}
          <span className="text-xs font-normal" style={{ color: 'var(--text-light)' }}>({count})</span>
        </h3>
        {canManage && <Button variant="primary" size="sm" icon={Plus} onClick={onAdd}>Adicionar</Button>}
      </div>
      {children}
    </Card>
  )
}

export default function AmbienteDetailPage() {
  const { envId } = useParams<{ envId: string }>()
  const { status, getVaultKey } = useVault()
  const [env, setEnv] = useState<EnvDetail | null>(null)
  const [creds, setCreds] = useState<CredRow[]>([])
  const [dbs, setDbs] = useState<DbRow[]>([])
  const [apps, setApps] = useState<AppRow[]>([])
  const [vpns, setVpns] = useState<VpnRow[]>([])
  const [certs, setCerts] = useState<CertRow[]>([])
  const [links, setLinks] = useState<LinkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null | 'cred' | 'db' | 'app' | 'vpn' | 'cert' | 'link'>(null)
  const [del, setDel] = useState<null | { kind: string; id: number; label: string; path: string }>(null)
  const [showPerms, setShowPerms] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [e, c, d, a, v, ce, l] = await Promise.all([
        api.get<EnvDetail>(`/environments/environments/${envId}`),
        api.get<CredRow[]>(`/environments/environments/${envId}/credentials`),
        api.get<DbRow[]>(`/environments/environments/${envId}/databases`),
        api.get<AppRow[]>(`/environments/environments/${envId}/appservers`),
        api.get<VpnRow[]>(`/environments/environments/${envId}/vpns`),
        api.get<CertRow[]>(`/environments/environments/${envId}/certificates`),
        api.get<LinkRow[]>(`/environments/environments/${envId}/links`),
      ])
      setEnv(e); setCreds(c); setDbs(d); setApps(a); setVpns(v); setCerts(ce); setLinks(l)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) toast.error('Ambiente sem acesso.')
    } finally { setLoading(false) }
  }, [envId])

  useEffect(() => { if (status === 'unlocked') void load() }, [status, load])

  const vaultKey = useMemo(() => env ? getVaultKey(env.vault_id) : undefined, [env, getVaultKey])
  // Sem `permissions` no payload (compat), assume tudo liberado — o BE ainda enforça.
  const perms: EnvPerms = env?.permissions ?? { view: true, reveal: true, copy: true, manage: true, admin: false, source: 'default' }

  const confirmDelete = async () => {
    if (!del) return
    try {
      await api.delete(del.path)
      toast.success(`${del.kind} excluído.`)
      setDel(null); void load()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Falha ao excluir.') }
  }

  if (status === 'locked') return <AppLayout><UnlockScreen /></AppLayout>
  if (status !== 'unlocked' || loading) return <AppLayout><Skeleton className="h-64" /></AppLayout>
  if (!env) return <AppLayout><Card><EmptyState icon={Server} title="Ambiente não encontrado" /></Card></AppLayout>

  return (
    <AppLayout>
      <PageHeader
        icon={Server}
        title={env.name}
        subtitle={TYPE_LABEL[env.type] ?? env.type}
        actions={
          <div className="flex gap-2">
            {perms.manage && <Button icon={Pencil} onClick={() => setEditOpen(true)}>Editar</Button>}
            {perms.admin && <Button icon={ShieldCheck} onClick={() => setShowPerms(true)}>Permissões</Button>}
            <Button icon={ArrowLeft} onClick={() => history.back()}>Voltar</Button>
          </div>
        }
      />

      {/* ⚡ Acesso Rápido ao Ambiente */}
      <div className="mb-4">
        <EnvQuickAccess env={env} creds={creds} dbs={dbs} apps={apps} vpns={vpns} links={links} vaultKey={vaultKey} perms={perms} />
      </div>

      {/* ENV-HUB — jornada operacional (Connector · AppServers · RPO) */}
      <div className="mb-4">
        <EnvHubSection environmentId={Number(envId)} />
      </div>

      <div className="flex flex-col gap-4">
        {/* Credenciais */}
        <SectionCard icon={KeyRound} title="Credenciais" count={creds.length} onAdd={() => setModal('cred')} canManage={perms.manage}>
          {creds.length === 0 ? (
            <div className="p-6"><EmptyState icon={KeyRound} title="Sem credenciais" /></div>
          ) : (
            <table className="ds-table w-full">
              <thead><tr><th>Categoria</th><th>Rótulo</th><th>Usuário</th><th>Senha</th><th /></tr></thead>
              <tbody>
                {creds.map(c => (
                  <tr key={c.id}>
                    <td><Badge variant={c.critical ? 'danger' : 'default'}>{CAT_LABEL[c.category] ?? c.category}</Badge></td>
                    <td className="text-sm" style={{ color: 'var(--text)' }}>{c.label}</td>
                    <td className="text-sm font-mono" style={{ color: 'var(--text)' }}>{c.username ?? '—'}</td>
                    <td>{c.has_secret && c.secret_id ? <EnvRevealField secretId={c.secret_id} critical={c.critical} canReveal={perms.reveal} canCopy={perms.copy} /> : <span style={{ color: 'var(--text-light)' }}>—</span>}</td>
                    <td className="text-right">{perms.manage && <DelBtn onClick={() => setDel({ kind: 'Credencial', id: c.id, label: c.label, path: `/environments/credentials/${c.id}` })} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        {/* Banco */}
        <SectionCard icon={Database} title="Banco de Dados" count={dbs.length} onAdd={() => setModal('db')} canManage={perms.manage}>
          {dbs.length === 0 ? (
            <div className="p-6"><EmptyState icon={Database} title="Sem bancos" /></div>
          ) : (
            <table className="ds-table w-full">
              <thead><tr><th>Servidor</th><th>Instância / DB</th><th>Usuário</th><th>Senha</th><th>AlwaysOn</th><th /></tr></thead>
              <tbody>
                {dbs.map(d => (
                  <tr key={d.id}>
                    <td className="text-sm" style={{ color: 'var(--text)' }}>{d.server}{d.port ? `:${d.port}` : ''} <span className="text-xs" style={{ color: 'var(--text-light)' }}>{d.engine}</span></td>
                    <td className="text-sm" style={{ color: 'var(--text)' }}>{[d.instance, d.database].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="text-sm font-mono" style={{ color: 'var(--text)' }}>{d.username ?? '—'}</td>
                    <td>{d.has_password && d.secret_id ? <EnvRevealField secretId={d.secret_id} critical={d.critical} canReveal={perms.reveal} canCopy={perms.copy} /> : <span style={{ color: 'var(--text-light)' }}>—</span>}</td>
                    <td>{d.always_on ? <Badge variant="success">Sim</Badge> : <span style={{ color: 'var(--text-light)' }}>—</span>}</td>
                    <td className="text-right">{perms.manage && <DelBtn onClick={() => setDel({ kind: 'Banco', id: d.id, label: d.server, path: `/environments/databases/${d.id}` })} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        {/* AppServer */}
        <SectionCard icon={Server} title="AppServer" count={apps.length} onAdd={() => setModal('app')} canManage={perms.manage}>
          {apps.length === 0 ? (
            <div className="p-6"><EmptyState icon={Server} title="Sem AppServers" /></div>
          ) : (
            <table className="ds-table w-full">
              <thead><tr><th>Nome</th><th>Versão</th><th>Build</th><th>RootPath</th><th>appserver.ini</th><th /></tr></thead>
              <tbody>
                {apps.map(a => (
                  <tr key={a.id}>
                    <td className="text-sm" style={{ color: 'var(--text)' }}>{a.name}</td>
                    <td className="text-sm" style={{ color: 'var(--text)' }}>{a.version ?? '—'}</td>
                    <td className="text-sm" style={{ color: 'var(--text)' }}>{a.build ?? '—'}</td>
                    <td className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>{a.root_path ?? '—'}</td>
                    <td><EnvEncryptedFile entityType="ENV_APPSERVER_INI" entityId={a.id} category="ini" vaultKey={vaultKey} attachmentId={a.ini_attachment_id} originalName="appserver.ini" onChanged={load} canManage={perms.manage} /></td>
                    <td className="text-right">{perms.manage && <DelBtn onClick={() => setDel({ kind: 'AppServer', id: a.id, label: a.name, path: `/environments/appservers/${a.id}` })} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        {/* VPN */}
        <SectionCard icon={Wifi} title="VPN" count={vpns.length} onAdd={() => setModal('vpn')} canManage={perms.manage}>
          {vpns.length === 0 ? (
            <div className="p-6"><EmptyState icon={Wifi} title="Sem VPNs" /></div>
          ) : (
            <table className="ds-table w-full">
              <thead><tr><th>Provedor</th><th>Servidor</th><th>Usuário</th><th>Senha</th><th>.ovpn</th><th /></tr></thead>
              <tbody>
                {vpns.map(v => (
                  <tr key={v.id}>
                    <td><Badge variant={v.critical ? 'danger' : 'default'}>{v.provider}</Badge></td>
                    <td className="text-sm" style={{ color: 'var(--text)' }}>{v.server ?? '—'}</td>
                    <td className="text-sm font-mono" style={{ color: 'var(--text)' }}>{v.username ?? '—'}</td>
                    <td>{v.has_password && v.secret_id ? <EnvRevealField secretId={v.secret_id} critical={v.critical} canReveal={perms.reveal} canCopy={perms.copy} /> : <span style={{ color: 'var(--text-light)' }}>—</span>}</td>
                    <td><EnvEncryptedFile entityType="ENV_VPN_OVPN" entityId={v.id} category="ovpn" vaultKey={vaultKey} attachmentId={v.ovpn_attachment_id} originalName={`${v.provider}.ovpn`} onChanged={load} canManage={perms.manage} /></td>
                    <td className="text-right">{perms.manage && <DelBtn onClick={() => setDel({ kind: 'VPN', id: v.id, label: v.provider, path: `/environments/vpns/${v.id}` })} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        {/* Certificados */}
        <SectionCard icon={ShieldAlert} title="Certificados" count={certs.length} onAdd={() => setModal('cert')} canManage={perms.manage}>
          {certs.length === 0 ? (
            <div className="p-6"><EmptyState icon={ShieldAlert} title="Sem certificados" description="Cadastre o A1 da Receita — o .pfx é cifrado no seu navegador." /></div>
          ) : (
            <table className="ds-table w-full">
              <thead><tr><th>Nome</th><th>Tipo</th><th>Validade</th><th>Senha PFX</th><th>Arquivo .pfx</th><th /></tr></thead>
              <tbody>
                {certs.map(c => (
                  <tr key={c.id}>
                    <td className="text-sm" style={{ color: 'var(--text)' }}>{c.name}</td>
                    <td><Badge variant={c.critical ? 'danger' : 'default'}>{c.type}</Badge></td>
                    <td className="text-sm">
                      {c.valid_to ? (
                        <span style={{ color: c.days_to_expire !== null && c.days_to_expire <= 30 ? 'var(--danger)' : 'var(--text)' }}>
                          {new Date(c.valid_to).toLocaleDateString('pt-BR')}
                          {c.days_to_expire !== null && c.days_to_expire <= 30 && <span className="text-xs"> ({Math.max(0, Math.round(c.days_to_expire))}d)</span>}
                        </span>
                      ) : <span style={{ color: 'var(--text-light)' }}>—</span>}
                    </td>
                    <td>{c.has_pfx_password && c.pfx_pass_secret_id ? <EnvRevealField secretId={c.pfx_pass_secret_id} critical={c.critical} canReveal={perms.reveal} canCopy={perms.copy} /> : <span style={{ color: 'var(--text-light)' }}>—</span>}</td>
                    <td><EnvEncryptedFile entityType="ENV_CERT_PFX" entityId={c.id} category="pfx" vaultKey={vaultKey} attachmentId={c.pfx_attachment_id} originalName={`${c.name}.pfx`} onChanged={load} canManage={perms.manage} /></td>
                    <td className="text-right">{perms.manage && <DelBtn onClick={() => setDel({ kind: 'Certificado', id: c.id, label: c.name, path: `/environments/certificates/${c.id}` })} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        {/* Links */}
        <SectionCard icon={Link2} title="Links" count={links.length} onAdd={() => setModal('link')} canManage={perms.manage}>
          {links.length === 0 ? (
            <div className="p-6"><EmptyState icon={Link2} title="Sem links" description="Portais Fluig/TSS/Portal TOTVS/Power BI/RDP…" /></div>
          ) : (
            <table className="ds-table w-full">
              <thead><tr><th>Rótulo</th><th>Tipo</th><th>URL</th><th /></tr></thead>
              <tbody>
                {links.map(l => (
                  <tr key={l.id}>
                    <td className="text-sm" style={{ color: 'var(--text)' }}>{l.label}</td>
                    <td><Badge>{l.kind}</Badge></td>
                    <td><a href={l.url.startsWith('http') ? l.url : `https://${l.url}`} target="_blank" rel="noopener noreferrer" className="text-sm hover:underline" style={{ color: 'var(--primary)' }}>{l.url}</a></td>
                    <td className="text-right">{perms.manage && <DelBtn onClick={() => setDel({ kind: 'Link', id: l.id, label: l.label, path: `/environments/links/${l.id}` })} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        {/* Documentação */}
        <Card padding="none" className="overflow-x-auto">
          <EnvDocs envId={env.id} canManage={perms.manage} />
        </Card>
      </div>

      {/* Modais */}
      <EnvCredentialModal open={modal === 'cred'} onClose={() => setModal(null)} onSaved={load} envId={env.id} vaultKey={vaultKey} />
      <EnvDatabaseModal open={modal === 'db'} onClose={() => setModal(null)} onSaved={load} envId={env.id} vaultKey={vaultKey} />
      <EnvAppserverModal open={modal === 'app'} onClose={() => setModal(null)} onSaved={load} envId={env.id} />
      <EnvVpnModal open={modal === 'vpn'} onClose={() => setModal(null)} onSaved={load} envId={env.id} vaultKey={vaultKey} />
      <EnvCertificateModal open={modal === 'cert'} onClose={() => setModal(null)} onSaved={load} envId={env.id} vaultKey={vaultKey} />
      <EnvLinkModal open={modal === 'link'} onClose={() => setModal(null)} onSaved={load} envId={env.id} />

      <EnvPermissionsModal open={showPerms} onClose={() => setShowPerms(false)} envId={env.id} />
      <EditEnvModal open={editOpen} onClose={() => setEditOpen(false)} env={env} onSaved={load} />

      <Modal open={del !== null} onClose={() => setDel(null)} title={`Excluir ${del?.kind ?? ''}`}>
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Excluir <b>{del?.label}</b>? A senha cifrada também é removida.</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDel(null)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmDelete}>Excluir</Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  )
}

const STATUS_OPTS: { v: string; l: string }[] = [
  { v: 'unknown', l: '—' }, { v: 'online', l: 'Online' }, { v: 'offline', l: 'Offline' }, { v: 'maintenance', l: 'Manutenção' },
]

function EditEnvModal({ open, onClose, env, onSaved }: { open: boolean; onClose: () => void; env: EnvDetail; onSaved: () => void }) {
  const [name, setName] = useState(env.name)
  const [type, setType] = useState(env.type)
  const [statusV, setStatusV] = useState(env.status)
  const [rdpHost, setRdpHost] = useState(env.rdp_host ?? '')
  const [rdpPort, setRdpPort] = useState(env.rdp_port ? String(env.rdp_port) : '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setName(env.name); setType(env.type); setStatusV(env.status); setRdpHost(env.rdp_host ?? ''); setRdpPort(env.rdp_port ? String(env.rdp_port) : '') }
  }, [open, env])

  const save = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await api.put(`/environments/environments/${env.id}`, {
        name: name.trim(), type, status: statusV,
        rdp_host: rdpHost.trim() || null,
        rdp_port: rdpPort.trim() ? Number(rdpPort) : null,
      })
      toast.success('Ambiente atualizado.'); onSaved(); onClose()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Falha ao salvar.') } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar ambiente">
      <div className="flex flex-col gap-4">
        <TextInput label="Nome" value={name} onChange={e => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Tipo" value={type} onChange={e => setType(e.target.value)}>
            {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Select label="Status" value={statusV} onChange={e => setStatusV(e.target.value)}>
            {STATUS_OPTS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <TextInput label="Host RDP" placeholder="10.0.0.5 ou srv.cliente.com" value={rdpHost} onChange={e => setRdpHost(e.target.value)} />
          </div>
          <TextInput label="Porta RDP" inputMode="numeric" placeholder="3389" value={rdpPort} onChange={e => setRdpPort(e.target.value.replace(/\D/g, ''))} />
        </div>
        <p className="text-xs" style={{ color: 'var(--text-light)' }}>O host RDP habilita o "Abrir RDP" no Acesso Rápido (gera um .rdp). É metadado — nunca a senha.</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={save}>Salvar</Button>
        </div>
      </div>
    </Modal>
  )
}

function DelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="p-1.5 rounded hover:opacity-80" style={{ color: 'var(--danger)' }} title="Excluir" onClick={onClick}>
      <Trash2 className="w-4 h-4" />
    </button>
  )
}
