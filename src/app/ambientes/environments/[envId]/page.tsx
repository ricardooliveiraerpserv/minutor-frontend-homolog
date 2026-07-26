'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Detalhe do AMBIENTE — abrir um ambiente e encontrar tudo dentro.
// F1a+F1b: Credenciais, Banco, AppServer, VPN (senha via reveal enforced).
// Certificados/Links/Documentação entram nas próximas sub-fases.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  ArrowLeft, Database, FileText, KeyRound, Link2, Plus, Server, ShieldAlert, Trash2, Wifi,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Skeleton } from '@/components/ds'
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

interface EnvDetail { id: number; name: string; type: string; status: string; vault_id: number }
interface CredRow { id: number; category: string; label: string; username: string | null; has_secret: boolean; secret_id: number | null; critical: boolean }
interface DbRow { id: number; engine: string; server: string; port: number | null; instance: string | null; database: string | null; username: string | null; has_password: boolean; secret_id: number | null; always_on: boolean; critical: boolean }
interface AppRow { id: number; name: string; version: string | null; build: string | null; root_path: string | null; port: number | null; ini_attachment_id: number | null }
interface VpnRow { id: number; provider: string; server: string | null; group: string | null; username: string | null; has_password: boolean; secret_id: number | null; critical: boolean; ovpn_attachment_id: number | null }
interface CertRow { id: number; name: string; type: string; valid_to: string | null; days_to_expire: number | null; has_pfx_password: boolean; pfx_pass_secret_id: number | null; pfx_attachment_id: number | null; critical: boolean }

const TYPE_LABEL: Record<string, string> = { prod: 'Produção', homolog: 'Homologação', dev: 'Desenvolvimento', dr: 'DR' }
const CAT_LABEL: Record<string, string> = {
  win_admin: 'Admin Windows', sql: 'Admin SQL', protheus: 'Admin Protheus', fluig: 'Admin Fluig',
  totvs_license: 'TOTVS License', smtp: 'SMTP', ftp: 'FTP', azure: 'Azure', aws: 'AWS', gcp: 'GCP', o365: 'Office 365', portal: 'Portal',
}

function SectionCard({ icon: Icon, title, count, onAdd, children }: {
  icon: typeof KeyRound; title: string; count: number; onAdd: () => void; children: React.ReactNode
}) {
  return (
    <Card padding="none" className="overflow-x-auto">
      <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text)' }}>
          <Icon className="w-4 h-4" style={{ color: 'var(--primary)' }} /> {title}
          <span className="text-xs font-normal" style={{ color: 'var(--text-light)' }}>({count})</span>
        </h3>
        <Button variant="primary" size="sm" icon={Plus} onClick={onAdd}>Adicionar</Button>
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
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null | 'cred' | 'db' | 'app' | 'vpn' | 'cert'>(null)
  const [del, setDel] = useState<null | { kind: string; id: number; label: string; path: string }>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [e, c, d, a, v, ce] = await Promise.all([
        api.get<EnvDetail>(`/environments/environments/${envId}`),
        api.get<CredRow[]>(`/environments/environments/${envId}/credentials`),
        api.get<DbRow[]>(`/environments/environments/${envId}/databases`),
        api.get<AppRow[]>(`/environments/environments/${envId}/appservers`),
        api.get<VpnRow[]>(`/environments/environments/${envId}/vpns`),
        api.get<CertRow[]>(`/environments/environments/${envId}/certificates`),
      ])
      setEnv(e); setCreds(c); setDbs(d); setApps(a); setVpns(v); setCerts(ce)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) toast.error('Ambiente sem acesso.')
    } finally { setLoading(false) }
  }, [envId])

  useEffect(() => { if (status === 'unlocked') void load() }, [status, load])

  const vaultKey = useMemo(() => env ? getVaultKey(env.vault_id) : undefined, [env, getVaultKey])

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

  const notReady = [
    { key: 'links', label: 'Links', icon: Link2 },
    { key: 'docs', label: 'Documentação', icon: FileText },
  ]

  return (
    <AppLayout>
      <PageHeader
        icon={Server}
        title={env.name}
        subtitle={TYPE_LABEL[env.type] ?? env.type}
        actions={<Button icon={ArrowLeft} onClick={() => history.back()}>Voltar</Button>}
      />

      <div className="flex flex-col gap-4">
        {/* Credenciais */}
        <SectionCard icon={KeyRound} title="Credenciais" count={creds.length} onAdd={() => setModal('cred')}>
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
                    <td>{c.has_secret && c.secret_id ? <EnvRevealField secretId={c.secret_id} /> : <span style={{ color: 'var(--text-light)' }}>—</span>}</td>
                    <td className="text-right"><DelBtn onClick={() => setDel({ kind: 'Credencial', id: c.id, label: c.label, path: `/environments/credentials/${c.id}` })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        {/* Banco */}
        <SectionCard icon={Database} title="Banco de Dados" count={dbs.length} onAdd={() => setModal('db')}>
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
                    <td>{d.has_password && d.secret_id ? <EnvRevealField secretId={d.secret_id} /> : <span style={{ color: 'var(--text-light)' }}>—</span>}</td>
                    <td>{d.always_on ? <Badge variant="success">Sim</Badge> : <span style={{ color: 'var(--text-light)' }}>—</span>}</td>
                    <td className="text-right"><DelBtn onClick={() => setDel({ kind: 'Banco', id: d.id, label: d.server, path: `/environments/databases/${d.id}` })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        {/* AppServer */}
        <SectionCard icon={Server} title="AppServer" count={apps.length} onAdd={() => setModal('app')}>
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
                    <td><EnvEncryptedFile entityType="ENV_APPSERVER_INI" entityId={a.id} category="ini" vaultKey={vaultKey} attachmentId={a.ini_attachment_id} originalName="appserver.ini" onChanged={load} /></td>
                    <td className="text-right"><DelBtn onClick={() => setDel({ kind: 'AppServer', id: a.id, label: a.name, path: `/environments/appservers/${a.id}` })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        {/* VPN */}
        <SectionCard icon={Wifi} title="VPN" count={vpns.length} onAdd={() => setModal('vpn')}>
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
                    <td>{v.has_password && v.secret_id ? <EnvRevealField secretId={v.secret_id} /> : <span style={{ color: 'var(--text-light)' }}>—</span>}</td>
                    <td><EnvEncryptedFile entityType="ENV_VPN_OVPN" entityId={v.id} category="ovpn" vaultKey={vaultKey} attachmentId={v.ovpn_attachment_id} originalName={`${v.provider}.ovpn`} onChanged={load} /></td>
                    <td className="text-right"><DelBtn onClick={() => setDel({ kind: 'VPN', id: v.id, label: v.provider, path: `/environments/vpns/${v.id}` })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        {/* Certificados */}
        <SectionCard icon={ShieldAlert} title="Certificados" count={certs.length} onAdd={() => setModal('cert')}>
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
                    <td>{c.has_pfx_password && c.pfx_pass_secret_id ? <EnvRevealField secretId={c.pfx_pass_secret_id} /> : <span style={{ color: 'var(--text-light)' }}>—</span>}</td>
                    <td><EnvEncryptedFile entityType="ENV_CERT_PFX" entityId={c.id} category="pfx" vaultKey={vaultKey} attachmentId={c.pfx_attachment_id} originalName={`${c.name}.pfx`} onChanged={load} /></td>
                    <td className="text-right"><DelBtn onClick={() => setDel({ kind: 'Certificado', id: c.id, label: c.name, path: `/environments/certificates/${c.id}` })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        {/* Em breve */}
        <div className="flex flex-wrap gap-2">
          {notReady.map(s => (
            <div key={s.key} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm" style={{ border: '1px solid var(--border)', color: 'var(--text-light)', opacity: 0.6 }}>
              <s.icon className="w-4 h-4" />{s.label} <span className="text-[10px]">em breve</span>
            </div>
          ))}
        </div>
      </div>

      {/* Modais */}
      <EnvCredentialModal open={modal === 'cred'} onClose={() => setModal(null)} onSaved={load} envId={env.id} vaultKey={vaultKey} />
      <EnvDatabaseModal open={modal === 'db'} onClose={() => setModal(null)} onSaved={load} envId={env.id} vaultKey={vaultKey} />
      <EnvAppserverModal open={modal === 'app'} onClose={() => setModal(null)} onSaved={load} envId={env.id} />
      <EnvVpnModal open={modal === 'vpn'} onClose={() => setModal(null)} onSaved={load} envId={env.id} vaultKey={vaultKey} />
      <EnvCertificateModal open={modal === 'cert'} onClose={() => setModal(null)} onSaved={load} envId={env.id} vaultKey={vaultKey} />

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

function DelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="p-1.5 rounded hover:opacity-80" style={{ color: 'var(--danger)' }} title="Excluir" onClick={onClick}>
      <Trash2 className="w-4 h-4" />
    </button>
  )
}
