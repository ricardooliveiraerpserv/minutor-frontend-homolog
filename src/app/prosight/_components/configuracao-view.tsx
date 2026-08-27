'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Prosight · Configuração (admin) — REAL por empresa (Fase B / GAP-FE-002).
// Empresa vem do CONTEXTO GLOBAL (ProsightCompanyContext). "Todas" bloqueia edição.
//  • Repositório Git → client_source_repos (SourceReposSection real). GitHub App é GLOBAL/server-side;
//    o FE NUNCA recebe credencial.
//  • Allowlist de extensões elegíveis → source_doc_inventory_settings (global→empresa→repo→system_default),
//    com origem exibida e herança (remover override = voltar a herdar). Independente do custo de IA.
//  • Integração RPO → NÃO é desta fase: será configurada por Ambiente na Fase C (estado explícito).
// Segredos nunca em claro. Exclusões por glob (fixture antigo rpoExclusionPatterns) NÃO existem no backend.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { Settings2, FolderGit2, Filter, Server, Globe2, Building2, ShieldAlert, Save, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, PageHeader, Select, Skeleton, TextInput } from '@/components/ds'
import { useAuth } from '@/hooks/use-auth'
import { useProsightCompany } from '@/app/prosight/_components/company-context'
import { SourceReposSection } from '@/components/customers/source-repos-section'
import { api, ApiError } from '@/lib/api'

const ORIGIN_LABEL: Record<string, string> = {
  repo: 'Repositório', customer: 'Empresa', global: 'Global (sistema)', system_default: 'Padrão do sistema',
}

export function ConfiguracaoView({ demoAdmin = false }: { demoAdmin?: boolean }) {
  const { user, loading: authLoading } = useAuth()
  const isAdmin = demoAdmin || user?.type === 'admin'
  const company = useProsightCompany()
  const companyId = company?.companyId ?? null
  const companyName = company?.companyName ?? null

  if (authLoading && !demoAdmin) {
    return <><PageHeader icon={Settings2} title="Configuração" /><Card><Skeleton className="h-40 w-full" /></Card></>
  }
  if (!isAdmin) {
    return (
      <>
        <PageHeader icon={Settings2} title="Configuração" subtitle="Repositório Git, allowlist de inventário e integrações — por empresa." />
        <Card><EmptyState icon={ShieldAlert} title="Acesso restrito" description="A configuração do Prosight é exclusiva de administradores do Minutor." /></Card>
      </>
    )
  }

  return (
    <>
      <PageHeader icon={Settings2} title="Configuração"
        subtitle="Por empresa (do seletor no topo): Repositório Git, allowlist de extensões e integrações."
        actions={<Badge variant={companyId ? 'default' : 'warning'}>{companyName ?? 'Todas as empresas'}</Badge>} />

      {companyId == null ? (
        <Card>
          <EmptyState icon={Building2} title="Selecione uma empresa para continuar"
            description="A configuração é por empresa. Escolha uma empresa no seletor do topo para editar repositórios Git e a allowlist de inventário." />
          {/* Allowlist GLOBAL do sistema é uma ação separada (admin), disponível mesmo em 'Todas'. */}
          <div className="mt-4"><AllowlistEditor scope="global" title="Allowlist Global do sistema" /></div>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {/* ── Repositório Git (real, por empresa) ── */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 font-semibold" style={{ color: 'var(--text)' }}>
              <FolderGit2 size={16} /> Repositórios Git da empresa
            </h3>
            <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
              Origem dos fontes comparados no inventário. Autenticação via <strong>GitHub App (global, server-side)</strong> — o token nunca é exposto aqui.
            </p>
            <SourceReposSection customerId={companyId} />
          </section>

          {/* ── Allowlist de extensões (inventário) — por empresa/repo ── */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 font-semibold" style={{ color: 'var(--text)' }}>
              <Filter size={16} /> Extensões elegíveis (inventário)
            </h3>
            <AllowlistEditor scope="company" customerId={companyId} companyName={companyName} />
          </section>

          {/* ── RPO — Fase C ── */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 font-semibold" style={{ color: 'var(--text)' }}>
              <Server size={16} /> Integração RPO
            </h3>
            <Card>
              <div className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                <Server size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--text-light)' }} />
                <span>A integração RPO (compilação AdvPL) pertence ao <strong>ambiente</strong>, não à empresa — será configurada em <strong>Ambientes</strong> na próxima fase (Fase C). Aqui não há configuração de RPO por empresa (evita configuração intermediária sem correspondente real).</span>
              </div>
            </Card>
          </section>

          {/* Allowlist GLOBAL do sistema (admin) — ação separada, não confundir com a da empresa. */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 font-semibold" style={{ color: 'var(--text)' }}>
              <Globe2 size={16} /> Allowlist Global do sistema
            </h3>
            <AllowlistEditor scope="global" />
          </section>
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Editor da allowlist de extensões — resolve/edita/remove override, com ORIGEM e herança.
// scope='global' → nível global (admin, sem empresa). scope='company' → empresa (+ repo opcional).
// ─────────────────────────────────────────────────────────────────────────────
interface Resolved { level: string; scope_id: number; extensions: string[]; origin: string; has_own_override: boolean; own: string[] | null; system_default: string[] }

function AllowlistEditor({ scope, customerId, companyName, title }: { scope: 'global' | 'company'; customerId?: number | null; companyName?: string | null; title?: string }) {
  const [level, setLevel] = useState<'customer' | 'repo'>('customer')
  const [repos, setRepos] = useState<{ source_repo_id: number | null; repository: string }[]>([])
  const [repoId, setRepoId] = useState('')
  const [res, setRes] = useState<Resolved | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [text, setText] = useState('') // extensões separadas por vírgula/espaço

  const scopeType = scope === 'global' ? 'global' : level
  const scopeId = scope === 'global' ? 0 : (level === 'repo' ? Number(repoId || 0) : Number(customerId || 0))

  useEffect(() => {
    if (scope !== 'company' || !customerId) { setRepos([]); return }
    setRepoId('')
    api.get<{ data: { source_repo_id: number | null; repository: string }[] }>(`/source-docs/tree/customers/${customerId}/repos`)
      .then((r) => setRepos(r.data)).catch(() => setRepos([]))
  }, [scope, customerId])

  const load = useCallback(async () => {
    setRes(null); setEditing(false)
    const p = new URLSearchParams()
    if (scope === 'company' && customerId) {
      p.set('customer_id', String(customerId))
      if (level === 'repo' && repoId) p.set('source_repo_id', repoId)
    }
    try {
      const r = await api.get<{ data: Resolved }>(`/source-docs/inventory-settings/resolve?${p}`)
      setRes(r.data)
      setText((r.data.own ?? r.data.extensions).join(', '))
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) toast.error('Sem acesso a esta empresa.')
    }
  }, [scope, customerId, level, repoId])

  useEffect(() => {
    if (scope === 'global') { void load(); return }
    if (level === 'customer' && customerId) { void load(); return }
    if (level === 'repo' && customerId && repoId) { void load(); return }
    setRes(null)
  }, [scope, level, customerId, repoId, load])

  const parseExts = (s: string): string[] => Array.from(new Set(s.split(/[\s,;]+/).map((x) => x.trim().toLowerCase().replace(/^\./, '')).filter(Boolean)))

  const save = async () => {
    setSaving(true)
    try {
      const extensions = parseExts(text) // [] = nenhuma extensão (override explícito)
      await api.put('/source-docs/inventory-settings', { scope_type: scopeType, scope_id: scopeId, extensions })
      toast.success('Allowlist salva.'); await load()
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) toast.error(e.message || 'Extensão inválida.')
      else if (e instanceof ApiError && (e.status === 403 || e.status === 404)) toast.error('Sem acesso a esta empresa.')
      else toast.error('Falha ao salvar.')
    } finally { setSaving(false) }
  }

  const removeOverride = async () => {
    setSaving(true)
    try { await api.delete(`/source-docs/inventory-settings?scope_type=${scopeType}&scope_id=${scopeId}`); toast.success('Override removido — voltou a herdar.'); await load() }
    catch { toast.error('Falha ao remover.') }
    finally { setSaving(false) }
  }

  const needsRepo = scope === 'company' && level === 'repo' && !repoId
  const canEdit = scope === 'global' || (!!customerId && (level === 'customer' || !!repoId))

  return (
    <Card>
      {title && <div className="mb-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</div>}
      {scope === 'company' && (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Select label="Nível" value={level} onChange={(e) => setLevel(e.target.value as 'customer' | 'repo')}>
            <option value="customer">Empresa {companyName ? `(${companyName})` : ''}</option>
            <option value="repo">Empresa / Repositório</option>
          </Select>
          {level === 'repo' && (
            <Select label="Repositório" value={repoId} onChange={(e) => setRepoId(e.target.value)}>
              <option value="">Selecione…</option>
              {repos.map((r) => <option key={r.source_repo_id ?? r.repository} value={r.source_repo_id ?? ''} disabled={r.source_repo_id == null}>{r.repository}{r.source_repo_id == null ? ' (sem override)' : ''}</option>)}
            </Select>
          )}
        </div>
      )}

      {needsRepo ? (
        <p className="text-sm" style={{ color: 'var(--text-light)' }}>Selecione um repositório para ver/editar a allowlist deste nível.</p>
      ) : !res ? (
        <Skeleton className="h-24" />
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            {res.has_own_override ? <Badge variant="success">Override neste nível</Badge> : <Badge variant="default">Herdado</Badge>}
            <span style={{ color: 'var(--text-muted)' }}>Origem efetiva: <strong>{ORIGIN_LABEL[res.origin] ?? res.origin}</strong></span>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {res.extensions.length === 0
              ? <Badge variant="warning">nenhuma extensão elegível</Badge>
              : res.extensions.map((x) => <Badge key={x} variant="default">.{x}</Badge>)}
          </div>

          {!editing ? (
            <div className="flex flex-wrap gap-2">
              {canEdit && <Button variant="primary" onClick={() => setEditing(true)}>{res.has_own_override ? 'Editar override' : 'Criar override neste nível'}</Button>}
              {res.has_own_override && scope !== 'global' && <Button variant="danger" icon={RotateCcw} disabled={saving} onClick={removeOverride}>Remover override (voltar a herdar)</Button>}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <TextInput label="Extensões (separadas por vírgula) — vazio = nenhuma extensão elegível" value={text} onChange={(e) => setText(e.target.value)} placeholder="prw, prx, tlpp" />
              <div className="text-xs" style={{ color: 'var(--text-light)' }}>Padrão do sistema: {res.system_default.map((x) => '.' + x).join(', ')}</div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => { setEditing(false); setText((res.own ?? res.extensions).join(', ')) }}>Cancelar</Button>
                <Button variant="primary" icon={Save} disabled={saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar'}</Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
