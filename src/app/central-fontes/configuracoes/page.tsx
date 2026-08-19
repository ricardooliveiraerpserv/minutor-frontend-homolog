'use client'

// Central de Fontes — F6 · Configurações de IA e Custos por nível (Global → Empresa → Repositório).
// Reusa o CostSettingsResolver do backend (cascata + origem). Deixa claro Herdado × Personalizado;
// permite criar/editar/remover override sem copiar config herdada. A Fonte recebe teto pela aprovação.

import { useCallback, useEffect, useState } from 'react'
import { Coins, Save, Trash2 } from 'lucide-react'
import { Badge, Button, Card, PageHeader, Select, Skeleton, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'

type Level = 'global' | 'customer' | 'repo'
interface Eff { automatic_cost_limit_usd: number; safety_margin_percent: number; operational_limit_usd: number; max_semantic_step_usd: number; max_approved_cost_usd: number; approval_required_above_limit: boolean; approval_mandatory_above_usd: number | null; source: string; source_label: string }
interface Resolved { level: Level; scope_id: number; effective: Eff; has_own_override: boolean; own: Partial<Eff> | null }

const money = (n: number) => `US$ ${Number(n).toFixed(2)}`

export default function IaCustosConfigPage() {
  const [level, setLevel] = useState<Level>('global')
  const [customers, setCustomers] = useState<{ customer_id: number; name: string }[]>([])
  const [repos, setRepos] = useState<{ source_repo_id: number | null; repository: string }[]>([])
  const [customerId, setCustomerId] = useState('')
  const [repoId, setRepoId] = useState('')
  const [res, setRes] = useState<Resolved | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  // form
  const [f, setF] = useState({ auto: '1.00', margin: '10', step: '0.30', approval: '1', maxApproved: '3.00', mand: '' })

  useEffect(() => { api.get<{ data: { customer_id: number; name: string }[] }>('/source-docs/tree/customers').then((r) => setCustomers(r.data)).catch(() => {}) }, [])
  useEffect(() => { if (!customerId) { setRepos([]); return } api.get<{ data: { source_repo_id: number | null; repository: string }[] }>(`/source-docs/tree/customers/${customerId}/repos`).then((r) => setRepos(r.data)).catch(() => {}) }, [customerId])

  const customerName = customers.find((c) => String(c.customer_id) === customerId)?.name
  const repository = repos.find((r) => String(r.source_repo_id) === repoId)?.repository

  const load = useCallback(async () => {
    setRes(null); setEditing(false); setMsg(null); setErrors({})
    const p = new URLSearchParams()
    if (level !== 'global' && customerId) { p.set('customer_id', customerId); if (customerName) p.set('customer_name', customerName) }
    if (level === 'repo' && repoId) { p.set('source_repo_id', repoId); if (repository) p.set('repository', repository) }
    try {
      const r = await api.get<{ data: Resolved }>(`/source-docs/cost-settings/resolve?${p}`)
      setRes(r.data)
      const src = r.data.own ?? r.data.effective
      setF({ auto: Number(src.automatic_cost_limit_usd).toFixed(2), margin: String(src.safety_margin_percent), step: Number(src.max_semantic_step_usd).toFixed(2), approval: src.approval_required_above_limit ? '1' : '0', maxApproved: Number(src.max_approved_cost_usd).toFixed(2), mand: src.approval_mandatory_above_usd != null ? String(src.approval_mandatory_above_usd) : '' })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : 'Falha ao carregar a configuração deste nível.' })
    }
  }, [level, customerId, repoId, customerName, repository])

  useEffect(() => { if (level === 'global' || (level === 'customer' && customerId) || (level === 'repo' && customerId && repoId)) void load(); else setRes(null) }, [level, customerId, repoId, load])

  const scopeArgs = () => level === 'repo' ? { scope_type: 'repo', scope_id: Number(repoId) } : level === 'customer' ? { scope_type: 'customer', scope_id: Number(customerId) } : { scope_type: 'global', scope_id: 0 }

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
      else setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : 'Falha ao salvar.' })
    } finally { setSaving(false) }
  }, [f, level, customerId, repoId, load])

  const removeOverride = useCallback(async () => {
    if (level === 'global') return
    setSaving(true); setMsg(null)
    try { await api.delete(`/source-docs/cost-settings?scope_type=${level}&scope_id=${level === 'repo' ? repoId : customerId}`); setMsg({ kind: 'ok', text: 'Override removido — voltou a herdar do nível superior.' }); await load() }
    catch (e) { setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : 'Falha ao remover.' }) }
    finally { setSaving(false) }
  }, [level, customerId, repoId, load])

  const operationalPreview = (() => { const a = parseFloat(f.auto) || 0; const m = parseFloat(f.margin) || 0; return Math.round(a * (1 - m / 100) * 100) / 100 })()

  return (
    <>
      <PageHeader icon={Coins} title="Configurações · IA e Custos" subtitle="Limites por nível: Global → Empresa → Repositório. A fonte recebe teto específico pelo fluxo de aprovação. Herança sem cópia física." />
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-2">
          <Select label="Nível" value={level} onChange={(e) => { setLevel(e.target.value as Level); setEditing(false) }}>
            <option value="global">Global</option><option value="customer">Empresa</option><option value="repo">Empresa / Repositório</option>
          </Select>
          {level !== 'global' && <Select label="Empresa" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setRepoId('') }}><option value="">Selecione…</option>{customers.map((c) => <option key={c.customer_id} value={c.customer_id}>{c.name}</option>)}</Select>}
          {level === 'repo' && <Select label="Repositório" value={repoId} onChange={(e) => setRepoId(e.target.value)}><option value="">Selecione…</option>{repos.map((r) => <option key={r.source_repo_id ?? r.repository} value={r.source_repo_id ?? ''} disabled={r.source_repo_id == null}>{r.repository}{r.source_repo_id == null ? ' (sem override)' : ''}</option>)}</Select>}
        </div>
      </Card>

      {msg && <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${msg.kind === 'ok' ? 'bg-[var(--success-bg,#ecfdf5)] text-[var(--success-fg,#047857)]' : 'bg-[var(--danger-bg,#fef2f2)] text-[var(--danger-fg,#b91c1c)]'}`}>{msg.text}</div>}

      {!res ? (msg?.kind === 'err' ? null : <Skeleton className="h-64" />) : (
        <div className="flex flex-col gap-4">
          <Card>
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
            <div className="mt-4 flex gap-2">
              {!editing && <Button variant="primary" onClick={() => setEditing(true)}>{res.has_own_override ? 'Editar override' : 'Criar override neste nível'}</Button>}
              {res.has_own_override && level !== 'global' && <Button variant="danger" icon={Trash2} disabled={saving} onClick={removeOverride}>Remover override (voltar a herdar)</Button>}
            </div>
          </Card>

          {editing && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold">{res.has_own_override ? 'Editar' : 'Criar'} configuração — {level === 'global' ? 'Global' : level === 'customer' ? `Empresa ${customerName}` : `Repositório ${repository}`}</h3>
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
