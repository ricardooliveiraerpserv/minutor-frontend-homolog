'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Central de Fontes — Frente A · Configurações › IA e Custos.
// Config administrativa persistente dos limites de IA (sem deploy). Limite operacional
// por fonte = automático × (1 − margem). Interno ERPSERV (Admin). Motor congelado.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Coins, Save, ShieldCheck } from 'lucide-react'
import { Badge, Button, Card, PageHeader, Select, Skeleton, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'

interface Settings {
  automatic_cost_limit_usd: number
  safety_margin_percent: number
  operational_limit_usd: number
  max_semantic_step_usd: number
  approval_required_above_limit: boolean
  max_approved_cost_usd: number
  approval_mandatory_above_usd: number | null
  source: string
  source_label: string
}
interface Override {
  id: number; scope_type: string; scope_id: number
  automatic_cost_limit_usd: number; safety_margin_percent: number; max_approved_cost_usd: number
}

const money = (n: number) => `US$ ${Number(n).toFixed(2)}`

export default function IaCustosConfigPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [global, setGlobal] = useState<Settings | null>(null)
  const [overrides, setOverrides] = useState<Override[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // form
  const [autoLimit, setAutoLimit] = useState('1.00')
  const [margin, setMargin] = useState('10')
  const [stepMax, setStepMax] = useState('0.30')
  const [approvalRequired, setApprovalRequired] = useState('1')
  const [maxApproved, setMaxApproved] = useState('3.00')
  const [mandatoryAbove, setMandatoryAbove] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await api.get<{ data: { global: Settings; overrides: Override[] } }>('/source-docs/cost-settings')
      const g = resp.data.global
      setGlobal(g); setOverrides(resp.data.overrides || [])
      setAutoLimit(g.automatic_cost_limit_usd.toFixed(2))
      setMargin(String(g.safety_margin_percent))
      setStepMax(g.max_semantic_step_usd.toFixed(2))
      setApprovalRequired(g.approval_required_above_limit ? '1' : '0')
      setMaxApproved(g.max_approved_cost_usd.toFixed(2))
      setMandatoryAbove(g.approval_mandatory_above_usd != null ? String(g.approval_mandatory_above_usd) : '')
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : 'Falha ao carregar configuração.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // limite operacional recalculado ao vivo (auto × (1 − margem%))
  const operational = useMemo(() => {
    const a = parseFloat(autoLimit) || 0
    const m = parseFloat(margin) || 0
    return Math.round(a * (1 - m / 100) * 10000) / 10000
  }, [autoLimit, margin])

  const save = useCallback(async () => {
    setSaving(true); setErrors({}); setMsg(null)
    try {
      const resp = await api.put<{ data: { global: Settings } }>('/source-docs/cost-settings', {
        automatic_cost_limit_usd: parseFloat(autoLimit),
        safety_margin_percent: parseFloat(margin),
        max_semantic_step_usd: parseFloat(stepMax),
        approval_required_above_limit: approvalRequired === '1',
        max_approved_cost_usd: parseFloat(maxApproved),
        approval_mandatory_above_usd: mandatoryAbove.trim() === '' ? null : parseFloat(mandatoryAbove),
      })
      setGlobal(resp.data.global)
      setMsg({ kind: 'ok', text: 'Configuração salva. Passa a valer imediatamente, sem deploy.' })
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        const errs = e.data?.errors as Record<string, string> | undefined
        setErrors(errs || {})
        setMsg({ kind: 'err', text: 'Configuração inconsistente — ajuste os campos destacados.' })
      } else {
        setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : 'Falha ao salvar.' })
      }
    } finally {
      setSaving(false)
    }
  }, [autoLimit, margin, stepMax, approvalRequired, maxApproved, mandatoryAbove])

  return (
    <>
      <PageHeader
        icon={Coins}
        title="Configurações · IA e Custos"
        subtitle="Limites de custo da documentação por IA. Alterações valem na hora, sem deploy. O motor semântico não é afetado."
      />

      {loading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="flex flex-col gap-6">
          {msg && (
            <div className={`rounded-lg px-4 py-3 text-sm ${msg.kind === 'ok' ? 'bg-[var(--success-bg,#ecfdf5)] text-[var(--success-fg,#047857)]' : 'bg-[var(--danger-bg,#fef2f2)] text-[var(--danger-fg,#b91c1c)]'}`}>
              {msg.text}
            </div>
          )}

          {/* Resumo do limite operacional vigente + origem */}
          <Card>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <Metric label="Configurado por fonte" value={money(parseFloat(autoLimit) || 0)} />
              <Metric label="Margem de segurança" value={`${parseFloat(margin) || 0}%`} />
              <Metric label="Limite operacional" value={money(operational)} strong />
              <Metric label="Máximo por passo" value={money(parseFloat(stepMax) || 0)} />
              <Metric label="Teto aprovável" value={money(parseFloat(maxApproved) || 0)} />
              {global && (
                <div className="ml-auto">
                  <Badge variant="default">Origem: {global.source_label}</Badge>
                </div>
              )}
            </div>
          </Card>

          {/* Formulário */}
          <Card>
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><ShieldCheck size={16} /> Automação</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Limite automático por fonte (USD)" value={autoLimit} onChange={setAutoLimit} error={errors.automatic_cost_limit_usd} step="0.01" />
              <Field label="Margem de segurança (%)" value={margin} onChange={setMargin} error={errors.safety_margin_percent} step="1" />
              <Field label="Máximo por passo semântico (USD)" value={stepMax} onChange={setStepMax} error={errors.max_semantic_step_usd} step="0.01" />
            </div>
            <h3 className="text-sm font-semibold mt-6 mb-4 flex items-center gap-2"><ShieldCheck size={16} /> Aprovação</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Select label="Exigir aprovação ao ultrapassar limite" value={approvalRequired} onChange={(e) => setApprovalRequired(e.target.value)}>
                <option value="1">Sim — enviar para a fila de aprovação</option>
                <option value="0">Não — encerrar como parcial</option>
              </Select>
              <Field label="Teto máximo aprovável por fonte (USD)" value={maxApproved} onChange={setMaxApproved} error={errors.max_approved_cost_usd} step="0.01" />
              <Field label="Aprovação obrigatória acima de (USD, vazio = limite)" value={mandatoryAbove} onChange={setMandatoryAbove} error={errors.approval_mandatory_above_usd} step="0.01" />
            </div>
            <div className="mt-6 flex justify-end">
              <Button variant="primary" icon={Save} onClick={save} disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar configuração'}
              </Button>
            </div>
          </Card>

          {/* Overrides por cliente/repositório (informativo) */}
          {overrides.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold mb-3">Exceções por cliente/repositório</h3>
              <div className="text-sm text-[var(--muted-fg,#64748b)]">
                {overrides.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 py-1">
                    <Badge variant="default">{o.scope_type} #{o.scope_id}</Badge>
                    <span>auto {money(o.automatic_cost_limit_usd)} · margem {o.safety_margin_percent}% · teto {money(o.max_approved_cost_usd)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  )
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-[var(--muted-fg,#64748b)]">{label}</span>
      <span className={strong ? 'text-lg font-semibold' : 'text-sm font-medium'}>{value}</span>
    </div>
  )
}

function Field({ label, value, onChange, error, step }: { label: string; value: string; onChange: (v: string) => void; error?: string; step?: string }) {
  return (
    <div>
      <TextInput label={label} type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)} />
      {error && <span className="text-xs text-[var(--danger-fg,#b91c1c)] mt-1 block">{error}</span>}
    </div>
  )
}
