'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Prosight · Configuração (admin) — cara de configuração administrativa do
// Minutor. Seções: Repositório Git / Integração RPO / Exclusões.
// Segredos NUNCA em claro: mostramos só o estado "Configurado" (flags do backend);
// campos de senha ficam vazios com placeholder "manter atual".
// Ações (Salvar / Testar API) são SIMULADAS via datasource fixture — zero infra.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import {
  Settings2, FolderGit2, Server, Filter, Save, PlugZap, CheckCircle2, XCircle, AlertTriangle, ShieldAlert, Lock,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Badge, Button, Card, EmptyState, PageHeader, Skeleton,
} from '@/components/ds'
import { useAuth } from '@/hooks/use-auth'
import { getProsightDataSource } from '@/lib/prosight/datasource'
import type { ProsightConfig, CheckApiResult } from '@/lib/prosight/types'
import { fmtDateTime } from './shared'

export function ConfiguracaoView({ demoAdmin = false }: { demoAdmin?: boolean }) {
  // ── Ponto de integração de PERMISSÃO ──────────────────────────────────────
  // Gate simples: só admin do Minutor edita a configuração do Prosight.
  // (F6: se houver permissão dedicada, trocar por hasPermission('prosight.config').)
  // `demoAdmin` é usado SOMENTE pelo harness dev-only /prosight/__preview (screenshots).
  const { user, loading: authLoading } = useAuth()
  const isAdmin = demoAdmin || user?.type === 'admin'

  const ds = getProsightDataSource()
  const [cfg, setCfg] = useState<ProsightConfig | null>(null)
  const [loading, setLoading] = useState(true)

  // form
  const [gitUrl, setGitUrl] = useState('')
  const [gitBranch, setGitBranch] = useState('')
  const [gitToken, setGitToken] = useState('')
  const [rpoApiUrl, setRpoApiUrl] = useState('')
  const [rpoApiUser, setRpoApiUser] = useState('')
  const [rpoApiPassword, setRpoApiPassword] = useState('')
  const [rpoExclusionPatterns, setRpoExclusionPatterns] = useState('')

  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<CheckApiResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const c = await ds.getConfig()
      setCfg(c)
      setGitUrl(c.gitUrl)
      setGitBranch(c.gitBranch)
      setRpoApiUrl(c.rpoApiUrl)
      setRpoApiUser(c.rpoApiUser)
      setRpoExclusionPatterns(c.rpoExclusionPatterns)
      // segredos NUNCA vêm em claro — campos ficam vazios ("manter atual")
      setGitToken('')
      setRpoApiPassword('')
    } finally {
      setLoading(false)
    }
  }, [ds])

  useEffect(() => { if (isAdmin) void load() }, [isAdmin, load])

  const onSave = async () => {
    if (!gitUrl.trim()) { toast.error('Informe a URL do repositório Git.'); return }
    setSaving(true)
    try {
      const res = await ds.saveConfig({
        gitUrl: gitUrl.trim(),
        gitBranch: gitBranch.trim(),
        rpoApiUrl: rpoApiUrl.trim(),
        rpoApiUser: rpoApiUser.trim(),
        rpoExclusionPatterns: rpoExclusionPatterns.trim(),
        ...(rpoApiPassword ? { rpoApiPassword } : {}),
        ...(gitToken ? { gitToken } : {}),
      })
      if (res.success) {
        toast.success('Configuração salva com sucesso.')
        setGitToken('')
        setRpoApiPassword('')
        await load()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const onCheck = async () => {
    setChecking(true)
    setCheckResult(null)
    try {
      const r = await ds.checkApi({ rpoApiUrl: rpoApiUrl.trim(), rpoApiUser: rpoApiUser.trim(), rpoApiPassword })
      setCheckResult(r)
    } catch (e) {
      setCheckResult({ configured: false, online: false, compiled: false, responseMs: 0, message: e instanceof Error ? e.message : 'Falha ao testar.' })
    } finally {
      setChecking(false)
    }
  }

  if (authLoading && !demoAdmin) {
    return <><PageHeader icon={Settings2} title="Configuração" /><Card><Skeleton className="h-40 w-full" /></Card></>
  }

  if (!isAdmin) {
    return (
      <>
        <PageHeader icon={Settings2} title="Configuração" subtitle="Repositório Git, integração RPO e exclusões." />
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="Acesso restrito"
            description="A configuração do Prosight é exclusiva de administradores do Minutor."
          />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        icon={Settings2}
        title="Configuração"
        subtitle="Repositório Git, integração RPO e exclusões."
        actions={<Button variant="primary" icon={Save} loading={saving} onClick={() => void onSave()}>Salvar alterações</Button>}
      />

      {loading ? (
        <div className="flex flex-col gap-4">
          <Card><Skeleton className="h-32 w-full" /></Card>
          <Card><Skeleton className="h-40 w-full" /></Card>
          <Card><Skeleton className="h-24 w-full" /></Card>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* ── Repositório Git ─────────────────────────────────────────────── */}
          <Section icon={FolderGit2} title="Repositório Git" description="Origem dos fontes comparados no inventário.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="URL do repositório" required>
                <input value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://git.exemplo/…/repo.git" className={inputCls} style={inputStyle} />
              </Field>
              <Field label="Branch">
                <input value={gitBranch} onChange={(e) => setGitBranch(e.target.value)} placeholder="main" className={inputCls} style={inputStyle} />
              </Field>
              <Field label="Token de acesso" hint={<SecretState set={cfg?.gitTokenSet} />}>
                <input value={gitToken} onChange={(e) => setGitToken(e.target.value)} type="password" placeholder={cfg?.gitTokenSet ? 'manter atual' : 'informe o token'} className={inputCls} style={inputStyle} autoComplete="new-password" />
              </Field>
            </div>
          </Section>

          {/* ── Integração RPO ──────────────────────────────────────────────── */}
          <Section icon={Server} title="Integração RPO" description="API AdvPL usada para ler a situação de compilação.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="URL da API RPO">
                <input value={rpoApiUrl} onChange={(e) => setRpoApiUrl(e.target.value)} placeholder="https://rpo.exemplo/advpl" className={inputCls} style={inputStyle} />
              </Field>
              <Field label="Usuário">
                <input value={rpoApiUser} onChange={(e) => setRpoApiUser(e.target.value)} placeholder="usuário do serviço" className={inputCls} style={inputStyle} />
              </Field>
              <Field label="Senha" hint={<SecretState set={cfg?.rpoApiPasswordSet} />}>
                <input value={rpoApiPassword} onChange={(e) => setRpoApiPassword(e.target.value)} type="password" placeholder={cfg?.rpoApiPasswordSet ? 'manter atual' : 'informe a senha'} className={inputCls} style={inputStyle} autoComplete="new-password" />
              </Field>
            </div>
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <Button variant="secondary" icon={PlugZap} loading={checking} onClick={() => void onCheck()}>Testar conexão</Button>
              {checkResult && <CheckBadge r={checkResult} />}
            </div>
          </Section>

          {/* ── Exclusões ───────────────────────────────────────────────────── */}
          <Section icon={Filter} title="Exclusões" description="Padrões de fontes ignorados no scan (separados por vírgula).">
            <Field label="Padrões de exclusão">
              <textarea value={rpoExclusionPatterns} onChange={(e) => setRpoExclusionPatterns(e.target.value)} rows={2}
                placeholder="TEST*, TMP*, *_BKP" className={inputCls} style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
          </Section>

          {cfg && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-light)' }}>
              <Lock size={12} />
              Última atualização por <b style={{ color: 'var(--text-muted)' }}>{cfg.updatedBy}</b> em {fmtDateTime(cfg.updatedAt)}.
            </div>
          )}
        </div>
      )}
    </>
  )
}

const inputCls = 'w-full rounded-xl px-4 py-2.5 text-sm outline-none'
const inputStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

function Section({ icon: Icon, title, description, children }: { icon: typeof Settings2; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
          <Icon size={15} color="var(--primary)" />
        </div>
        <div>
          <div className="font-semibold" style={{ color: 'var(--text)' }}>{title}</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{description}</div>
        </div>
      </div>
      {children}
    </Card>
  )
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>
          {label}{required && <span style={{ color: 'var(--danger)' }}> *</span>}
        </label>
        {hint}
      </div>
      {children}
    </div>
  )
}

function SecretState({ set }: { set?: boolean }) {
  return set
    ? <Badge variant="success">Configurado</Badge>
    : <Badge variant="default">Não configurado</Badge>
}

function CheckBadge({ r }: { r: CheckApiResult }) {
  if (r.compiled && r.online) {
    return <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--success)' }}><CheckCircle2 size={15} /> API OK — {r.responseMs}ms</span>
  }
  if (r.online && !r.compiled) {
    return <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--warning)' }}><AlertTriangle size={15} /> Servidor online, API não encontrada no RPO</span>
  }
  return <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--danger)' }}><XCircle size={15} /> {r.message || 'Falha ao conectar'}</span>
}
