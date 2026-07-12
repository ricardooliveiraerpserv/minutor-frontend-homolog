'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getBotConfig, listProviders, updateBotConfig } from '@/lib/bot-config'
import { Skeleton } from '@/components/ui/skeleton'

export function GeneralTab() {
  const qc = useQueryClient()

  const { data: configData, isLoading: loadingConfig } = useQuery({
    queryKey: ['bot-config'],
    queryFn: getBotConfig,
  })
  const { data: providersData, isLoading: loadingProviders } = useQuery({
    queryKey: ['bot-providers'],
    queryFn: listProviders,
  })

  const [providerId, setProviderId] = useState<number | ''>('')
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState('0.30')
  const [cron, setCron] = useState('0 6 * * 1')
  const [threshold, setThreshold] = useState('high')
  const [cooldown, setCooldown] = useState(30)
  const [dedupeWindow, setDedupeWindow] = useState(60)

  useEffect(() => {
    if (!configData?.data) return
    const c = configData.data
    setProviderId(c.active_provider?.id ?? '')
    setModel(c.default_model ?? '')
    setTemperature(String(c.temperature ?? '0.30'))
    setCron(c.frequency_cron ?? '0 6 * * 1')
    setThreshold(c.default_severity_threshold ?? 'high')
    setCooldown(c.cooldown_minutes ?? 30)
    setDedupeWindow(c.dedupe_window_minutes ?? 60)
  }, [configData])

  if (loadingConfig || loadingProviders) {
    return <Skeleton className="h-40 bg-zinc-800" />
  }

  const providers = providersData?.data ?? []

  const save = async () => {
    try {
      await updateBotConfig({
        active_provider_id: providerId === '' ? undefined : Number(providerId),
        default_model: model,
        temperature: Number(temperature),
        frequency_cron: cron,
        default_severity_threshold: threshold,
        cooldown_minutes: cooldown,
        dedupe_window_minutes: dedupeWindow,
      })
      await qc.invalidateQueries({ queryKey: ['bot-config'] })
      toast.success('Configuração salva')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="space-y-1">
      <label className="text-xs text-zinc-400">{label}</label>
      {children}
    </div>
  )

  const input = 'w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500'

  return (
    <div className="max-w-xl space-y-4">
      <Field label="Provedor IA ativo">
        <select
          value={providerId}
          onChange={e => setProviderId(e.target.value ? Number(e.target.value) : '')}
          className={input}
        >
          <option value="">(nenhum)</option>
          {providers.map(p => (
            <option key={p.id} value={p.id} disabled={!p.enabled}>
              {p.name} {!p.has_key ? '— sem key' : ''}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Modelo padrão">
        <input value={model} onChange={e => setModel(e.target.value)} className={input} placeholder="claude-sonnet-4-6" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Temperatura">
          <input value={temperature} onChange={e => setTemperature(e.target.value)} className={input} />
        </Field>
        <Field label="Frequência (cron)">
          <input value={cron} onChange={e => setCron(e.target.value)} className={input} placeholder="0 6 * * 1" />
        </Field>
      </div>

      <Field label="Severidade mínima para notificação">
        <select value={threshold} onChange={e => setThreshold(e.target.value)} className={input}>
          <option value="info">info</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </select>
      </Field>

      <div className="border-t border-zinc-800 pt-4 mt-2">
        <h3 className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Anti-ruído (preparado, motor inativo)</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cooldown (minutos)">
            <input type="number" min={0} value={cooldown} onChange={e => setCooldown(Number(e.target.value))} className={input} />
          </Field>
          <Field label="Janela de dedupe (minutos)">
            <input type="number" min={0} value={dedupeWindow} onChange={e => setDedupeWindow(Number(e.target.value))} className={input} />
          </Field>
        </div>
        <p className="text-[11px] text-zinc-600 mt-2">
          Hoje as regras passam direto. Quando o motor for ativado, eventos idênticos dentro da janela serão suprimidos.
        </p>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={save}
          className="px-4 py-2 rounded bg-emerald-500 text-zinc-950 text-sm font-semibold hover:bg-emerald-400 transition-colors"
        >
          Salvar
        </button>
      </div>
    </div>
  )
}
