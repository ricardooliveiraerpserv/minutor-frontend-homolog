'use client'

// Central de Fontes — F6 · Configurações de IA e Custos (Governança).
// Contexto de EMPRESA = seletor GLOBAL do Prosight (fonte única — sem seletor local de cliente).
//  • Empresa selecionada → editar override daquela empresa (nível Empresa ou Empresa/Repositório).
//  • "Todas as empresas"  → SOMENTE leitura consolidada (config global vigente); edição bloqueada.
//  • "Configuração Global do sistema" → ação SEPARADA e explícita (perfil admin), nunca via "Todas".
// Reusa o CostSettingsResolver do backend (cascata + origem). O BE revalida o escopo (anti-IDOR).

import { useCallback, useEffect, useState } from 'react'
import { Coins, Globe2, Save, Trash2, Building2 } from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, Select, Skeleton, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'
import { useProsightCompany } from '@/app/prosight/_components/company-context'
import { useAuth } from '@/hooks/use-auth'

type Level = 'global' | 'customer' | 'repo'
type Mode = 'empresa' | 'global'
interface Eff { automatic_cost_limit_usd: number; safety_margin_percent: number; operational_limit_usd: number; max_semantic_step_usd: number; max_approved_cost_usd: number; approval_required_above_limit: boolean; approval_mandatory_above_usd: number | null; source: string; source_label: string }
interface Resolved { level: Level; scope_id: number; effective: Eff; has_own_override: boolean; own: Partial<Eff> | null }

const money = (n: number) => `US$ ${Number(n).toFixed(2)}`

export default function IaCustosConfigPage() {
  const { user } = useAuth()
  const isAdmin = user?.type === 'admin' // gate do FE para a ação "Configuração Global"; o BE exige cost_settings.manage
  const company = useProsightCompany()
  const companyId = company?.companyId ?? null
  const customerId = companyId != null ? String(companyId) : ''
  const customerName = company?.companyName ?? null

  const [mode, setMode] = useState<Mode>('empresa')
  const [subLevel, setSubLevel] = useState<'customer' | 'repo'>('customer') // dentro da empresa
  const [repos, setRepos] = useState<{ source_repo_id: number | null; repository: string }[]>([])
  const [repoId, setRepoId] = useState('')
  const [res, setRes] = useState<Resolved | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [f, setF] = useState({ auto: '1.00', margin: '10', step: '0.30', approval: '1', maxApproved: '3.00', mand: '' })

  // nível efetivo (para resolve/scope). Global só via modo "global" (admin).
  const level: Level = mode === 'global' ? 'global' : subLevel

  // repos da empresa do CONTEXTO. Troca de empresa → recarrega e limpa repo.
  useEffect(() => { setRepoId(''); if (!customerId) { setRepos([]); return } api.get<{ data: { source_repo_id: number | null; repository: string }[] }>(`/source-docs/tree/customers/${customerId}/repos`).then((r) => setRepos(r.data)).catch(() => setRepos([])) }, [customerId])

  const repository = repos.find((r) => String(r.source_repo_id) === repoId)?.repository

  const load = useCallback(async () => {
    setRes(null); setEditing(false); setMsg(null); setErrors({})
    const p = new URLSearchParams()
    if (level === 'customer' && customerId) { p.set('customer_id', customerId); if (customerName) p.set('customer_name', customerName) }
    if (level === 'repo' && customerId) { p.set('customer_id', customerId); if (customerName) p.set('customer_name', customerName); if (repoId) { p.set('source_repo_id', repoId); if (repository) p.set('repository', repository) } }
    try {
      const r = await api.get<{ data: Resolved }>(`/source-docs/cost-settings/resolve?${p}`)
      setRes(r.data)
      const src = r.data.own ?? r.data.effective
      setF({ auto: Number(src.automatic_cost_limit_usd).toFixed(2), margin: String(src.safety_margin_percent), step: Number(src.max_semantic_step_usd).toFixed(2), approval: src.approval_required_above_limit ? '1' : '0', maxApproved: Number(src.max_approved_cost_usd).toFixed(2), mand: src.approval_mandatory_above_usd != null ? String(src.approval_mandatory_above_usd) : '' })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : 'Falha ao carregar a configuração deste nível.' })
    }
  }, [level, customerId, repoId, customerName, repository])

  // Carrega quando há alvo resolvível: global (admin) · empresa · empresa/repo · OU "Todas" (leitura da global).
  useEffect(() => {
    if (mode === 'global') { if (isAdmin) void load(); else setRes(null); return }
    if (subLevel === 'customer' && customerId) { void load(); return }
    if (subLevel === 'repo' && customerId && repoId) { void load(); return }
    if (!customerId) { void load(); return } // "Todas" → resolve a GLOBAL vigente (somente leitura)
    setRes(null)
  }, [mode, subLevel, customerId, repoId, isAdmin, load])

  const scopeArgs = () => mode === 'global' ? { scope_type: 'global', scope_id: 0 }
    : subLevel === 'repo' ? { scope_type: 'repo', scope_id: Number(repoId) }
    : { scope_type: 'customer', scope_id: Number(customerId) }

  const canEdit = mode === 'global' ? isAdmin : !!customerId // "Todas" (sem empresa) NÃO edita

  const save = useCallback(async () => {
    setSaving(true); setErrors({}); setMsg(null)
    try {
      await api.put('/source-docs/cost-settings', {
        ...scopeArgs(),
        automatic_cost_limit_usd: parseFloat(f.auto), safety_margin_percent: parseFloat(f.margin), max_semantic_step_usd: parseFloat(f.step),
        approval_required_above_limit: f.approval === '1', max_approved_cost_usd: parseFloat(f.maxApproved), approval_mandatory_above_usd: f.mand.trim() === '' ? null : parseFloat(f.mand),
      })
      setMsg({ kind: 'ok', text: 'Configuração salva (vale na hora, sem deploy).' }); await load()
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) { setErrors((e.data?.errors as Record<string, string>) || {}); setMsg({ kind: 'err', text: 'Configuração inconsistente.' }) }
      else if (e instanceof ApiError && (e.status === 403 || e.status === 404)) setMsg({ kind: 'err', text: 'Sem acesso a esta empresa.' })
      else setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : 'Falha ao salvar.' })
    } finally { setSaving(false) }
    // scopeArgs é derivado de mode/subLevel/customerId/repoId (já nas deps) — recriado a cada render de propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, mode, subLevel, customerId, repoId, load])

  const removeOverride = useCallback(async () => {
    if (mode === 'global') return
    setSaving(true); setMsg(null)
    try { await api.delete(`/source-docs/cost-settings?scope_type=${subLevel}&scope_id=${subLevel === 'repo' ? repoId : customerId}`); setMsg({ kind: 'ok', text: 'Override removido — voltou a herdar do nível superior.' }); await load() }
    catch (e) { setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : 'Falha ao remover.' }) }
    finally { setSaving(false) }
  }, [mode, subLevel, customerId, repoId, load])

  const operationalPreview = (() => { const a = parseFloat(f.auto) || 0; const m = parseFloat(f.margin) || 0; return Math.round(a * (1 - m / 100) * 100) / 100 })()

  const blockedTodas = mode === 'empresa' && !customerId // leitura consolidada, sem edição
  const scopeTitle = mode === 'global' ? 'Configuração Global do sistema' : !customerId ? 'Configuração global vigente (leitura)' : subLevel === 'repo' ? `Repositório ${repository ?? ''} · ${customerName}` : `Empresa ${customerName}`

  return (
    <>
      <PageHeader icon={Coins} title="Configurações · IA e Custos" subtitle="Limites por nível: Global → Empresa → Repositório. Empresa vem do seletor no topo; herança sem cópia física." />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={mode === 'empresa' ? 'primary' : 'secondary'} icon={Building2} onClick={() => setMode('empresa')}>Configuração da empresa</Button>
            {isAdmin && <Button variant={mode === 'global' ? 'primary' : 'secondary'} icon={Globe2} onClick={() => setMode('global')}>Configuração Global do sistema</Button>}
          </div>
          {mode === 'empresa' && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={customerId ? 'default' : 'warning'}>{customerName ?? 'Todas as empresas'}</Badge>
              {customerId && <>
                <Select label="Nível" value={subLevel} onChange={(e) => setSubLevel(e.target.value as 'customer' | 'repo')}>
                  <option value="customer">Empresa</option><option value="repo">Empresa / Repositório</option>
                </Select>
                {subLevel === 'repo' && <Select label="Repositório" value={repoId} onChange={(e) => setRepoId(e.target.value)}><option value="">Selecione…</option>{repos.map((r) => <option key={r.source_repo_id ?? r.repository} value={r.source_repo_id ?? ''} disabled={r.source_repo_id == null}>{r.repository}{r.source_repo_id == null ? ' (sem override)' : ''}</option>)}</Select>}
              </>}
            </div>
          )}
        </div>
        {mode === 'global' && <div className="mt-2 text-xs text-[color:var(--warning)]">Esta configuração é o <strong>default herdado por TODAS as empresas</strong> que não têm override próprio. Não é o mesmo que “Todas as empresas” no seletor.</div>}
      </Card>

      {msg && <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${msg.kind === 'ok' ? 'bg-[var(--success-bg,#ecfdf5)] text-[var(--success-fg,#047857)]' : 'bg-[var(--danger-bg,#fef2f2)] text-[var(--danger-fg,#b91c1c)]'}`}>{msg.text}</div>}

      {mode === 'empresa' && !customerId && (
        <EmptyState icon={Building2} title="Selecione uma empresa para continuar" description="Escolha uma empresa no seletor do topo para criar/editar overrides. Abaixo, apenas a configuração global vigente (leitura)." />
      )}

      {!res ? (msg?.kind === 'err' ? null : <Skeleton className="h-64" />) : (
        <div className="flex flex-col gap-4">
          <Card>
            <div className="mb-1 text-sm font-semibold" style={{ color: 'var(--text)' }}>{scopeTitle}</div>
            <div className="mb-3 flex items-center gap-2">
              {res.has_own_override
                ? <Badge variant="success">Personalizado neste nível</Badge>
                : <Badge variant="default">Herdado</Badge>}
              <span className="text-sm text-[color:var(--muted-fg)]">
                {res.has_own_override ? `Definido em: ${res.effective.source_label}` : `Herdado de: ${res.effective.source_label}`}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <Metric label="Limite automático" value={money(res.effective.automatic_cost_limit_usd)} strong />
              <Metric label="Margem de segurança" value={`${res.effective.safety_margin_percent}%`} />
              <Metric label="Limite operacional" value={money(res.effective.operational_limit_usd)} strong />
              <Metric label="Máximo por passo" value={money(res.effective.max_semantic_step_usd)} />
              <Metric label="Teto máximo aprovável" value={money(res.effective.max_approved_cost_usd)} />
              <Metric label="Aprovação" value={res.effective.approval_required_above_limit ? 'Manual (fila)' : 'Automática (parcial)'} />
            </div>
            {canEdit && !blockedTodas && (
              <div className="mt-4 flex gap-2">
                {!editing && <Button variant="primary" onClick={() => setEditing(true)}>{res.has_own_override ? 'Editar override' : (mode === 'global' ? 'Editar configuração global' : 'Criar override neste nível')}</Button>}
                {res.has_own_override && mode !== 'global' && <Button variant="danger" icon={Trash2} disabled={saving} onClick={removeOverride}>Remover override (voltar a herdar)</Button>}
              </div>
            )}
            {blockedTodas && <div className="mt-3 text-xs text-[color:var(--muted-fg)]">Leitura consolidada. Selecione uma empresa para editar overrides, ou use “Configuração Global do sistema”.</div>}
          </Card>

          {editing && canEdit && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold">{res.has_own_override ? 'Editar' : 'Criar'} — {scopeTitle}</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Limite automático (USD)" v={f.auto} on={(x) => setF({ ...f, auto: x })} err={errors.automatic_cost_limit_usd} />
                <Field label="Margem de segurança (%)" v={f.margin} on={(x) => setF({ ...f, margin: x })} err={errors.safety_margin_percent} step="1" />
                <Field label="Máximo por passo (USD)" v={f.step} on={(x) => setF({ ...f, step: x })} err={errors.max_semantic_step_usd} />
                <div><Select label="Aprovação ao ultrapassar" value={f.approval} onChange={(e) => setF({ ...f, approval: e.target.value })}><option value="1">Manual (fila)</option><option value="0">Automática (parcial)</option></Select></div>
                <Field label="Teto máximo aprovável (USD)" v={f.maxApproved} on={(x) => setF({ ...f, maxApproved: x })} err={errors.max_approved_cost_usd} />
                <Field label="Aprovação obrigatória acima de (vazio=limite)" v={f.mand} on={(x) => setF({ ...f, mand: x })} err={errors.approval_mandatory_above_usd} />
              </div>
              <div className="mt-2 text-xs text-[color:var(--muted-fg)]">Limite operacional resultante: <strong>{money(operationalPreview)}</strong> (automático × (1 − margem)).</div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => { setEditing(false); void load() }}>Cancelar</Button>
                <Button variant="primary" icon={Save} disabled={saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar'}</Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  )
}

function Metric({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return <div className="flex flex-col"><span className="text-xs text-[color:var(--muted-fg)]">{label}</span><span className={strong ? 'text-lg font-semibold' : 'text-sm font-medium'}>{value}</span></div>
}
function Field({ label, v, on, err, step }: { label: string; v: string; on: (x: string) => void; err?: string; step?: string }) {
  return <div><TextInput label={label} type="number" step={step ?? '0.01'} value={v} onChange={(e) => on(e.target.value)} />{err && <span className="mt-1 block text-xs text-[color:var(--danger-fg,#b91c1c)]">{err}</span>}</div>
}
