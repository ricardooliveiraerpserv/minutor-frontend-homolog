'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Detalhe do AMBIENTE — a experiência central: abrir um ambiente e encontrar tudo.
// F1a: Servidor (metadados) + Credenciais (com reveal enforced). Banco/AppServer/
// VPN/Certificados/Links/Documentação entram nas próximas sub-fases.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft, Database, FileText, Globe, HardDrive, KeyRound, Link2, Lock,
  Plus, Server, ShieldAlert, Trash2, Wifi,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Skeleton } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { useVault } from '@/contexts/vault-context'
import { UnlockScreen } from '@/components/vault/unlock-screen'
import { EnvRevealField } from '@/components/environments/env-reveal-field'
import { EnvCredentialModal } from '@/components/environments/env-credential-modal'

interface EnvDetail { id: number; name: string; type: string; status: string; vault_id: number; inventory: Record<string, unknown> | null; notes: string | null }
interface CredRow { id: number; category: string; label: string; username: string | null; url: string | null; has_secret: boolean; secret_id: number | null; critical: boolean }

const TYPE_LABEL: Record<string, string> = { prod: 'Produção', homolog: 'Homologação', dev: 'Desenvolvimento', dr: 'DR' }
const CAT_LABEL: Record<string, string> = {
  win_admin: 'Admin Windows', sql: 'Admin SQL', protheus: 'Admin Protheus', fluig: 'Admin Fluig',
  totvs_license: 'TOTVS License', smtp: 'SMTP', ftp: 'FTP', azure: 'Azure', aws: 'AWS', gcp: 'GCP', o365: 'Office 365', portal: 'Portal',
}

// Seções do ambiente (F1a só Credenciais ativo; resto "em breve")
const SECTIONS = [
  { key: 'server', label: 'Servidor', icon: HardDrive, ready: true },
  { key: 'credentials', label: 'Credenciais', icon: KeyRound, ready: true },
  { key: 'database', label: 'Banco', icon: Database, ready: false },
  { key: 'appserver', label: 'AppServer', icon: Server, ready: false },
  { key: 'vpn', label: 'VPN', icon: Wifi, ready: false },
  { key: 'certificates', label: 'Certificados', icon: ShieldAlert, ready: false },
  { key: 'links', label: 'Links', icon: Link2, ready: false },
  { key: 'docs', label: 'Documentação', icon: FileText, ready: false },
]

export default function AmbienteDetailPage() {
  const { envId } = useParams<{ envId: string }>()
  const { status, getVaultKey } = useVault()
  const [env, setEnv] = useState<EnvDetail | null>(null)
  const [creds, setCreds] = useState<CredRow[]>([])
  const [loading, setLoading] = useState(true)
  const [credModal, setCredModal] = useState(false)
  const [delCred, setDelCred] = useState<CredRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [e, c] = await Promise.all([
        api.get<EnvDetail>(`/environments/environments/${envId}`),
        api.get<CredRow[]>(`/environments/environments/${envId}/credentials`),
      ])
      setEnv(e); setCreds(c)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) toast.error('Ambiente sem acesso.')
    } finally { setLoading(false) }
  }, [envId])

  useEffect(() => { if (status === 'unlocked') void load() }, [status, load])

  const vaultKey = useMemo(() => env ? getVaultKey(env.vault_id) : undefined, [env, getVaultKey])

  const confirmDelete = async () => {
    if (!delCred) return
    try {
      await api.delete(`/environments/credentials/${delCred.id}`)
      toast.success('Credencial excluída.')
      setDelCred(null); void load()
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
        actions={<Link href={`/ambientes/${env.id ? '' : ''}`}><Button icon={ArrowLeft} onClick={() => history.back()}>Voltar</Button></Link>}
      />

      {/* Navegação de seções (abrir ambiente → tudo dentro) */}
      <div className="flex flex-wrap gap-2 mb-5">
        {SECTIONS.map(s => (
          <div key={s.key} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm" style={{
            background: s.ready ? 'var(--surface)' : 'transparent',
            border: '1px solid var(--border)',
            color: s.ready ? 'var(--text)' : 'var(--text-light)',
            opacity: s.ready ? 1 : 0.6,
          }}>
            <s.icon className="w-4 h-4" />{s.label}{!s.ready && <span className="text-[10px]">em breve</span>}
          </div>
        ))}
      </div>

      {/* Credenciais */}
      <Card padding="none" className="overflow-x-auto">
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text)' }}>
            <KeyRound className="w-4 h-4" style={{ color: 'var(--primary)' }} /> Credenciais
          </h3>
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setCredModal(true)}>Nova credencial</Button>
        </div>
        {creds.length === 0 ? (
          <div className="p-6"><EmptyState icon={KeyRound} title="Sem credenciais" description="Adicione Admin Windows/SQL/Protheus, SMTP, Azure…" /></div>
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
                  <td className="text-right">
                    <button type="button" className="p-1.5 rounded hover:opacity-80" style={{ color: 'var(--danger)' }} title="Excluir" onClick={() => setDelCred(c)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <EnvCredentialModal open={credModal} onClose={() => setCredModal(false)} onSaved={load} envId={env.id} vaultKey={vaultKey} />

      <Modal open={delCred !== null} onClose={() => setDelCred(null)} title="Excluir credencial">
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Excluir <b>{delCred?.label}</b>? A senha cifrada também é removida.</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDelCred(null)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmDelete}>Excluir</Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  )
}
