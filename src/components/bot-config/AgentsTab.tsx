'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, ChevronDown, ChevronRight, Save, Trash2, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createAgent, deleteAgent, listAgents, updateAgent } from '@/lib/bot-config'
import { Skeleton } from '@/components/ui/skeleton'
import type { BotAgent } from '@/types/bot'

const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const

const ALL_SCOPES = ['customer', 'project', 'contract', 'financial', 'billing', 'payroll', 'bankhours', 'approvals', 'overview'] as const

const SCOPE_LABEL: Record<string, string> = {
  customer:  'Clientes',
  project:   'Projetos',
  contract:  'Contratos',
  financial: 'Apontamentos & Despesas',
  billing:   'Faturamento (cliente)',
  payroll:   'Pagamento (consultor)',
  bankhours: 'Banco de horas',
  approvals: 'Pendências de aprovação',
  overview:  'Resumos gerais',
}

const input = 'w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500'

function AgentCard({ agent }: { agent: BotAgent }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState(agent.name)
  const [active, setActive] = useState(agent.active)
  const [priority, setPriority] = useState(agent.priority)
  const [minSev, setMinSev] = useState(agent.min_severity)
  const [cooldown, setCooldown] = useState(agent.cooldown_minutes)
  const [maxPerDay, setMaxPerDay] = useState(agent.max_per_day)
  const [modelOverride, setModelOverride] = useState(agent.model_override ?? '')
  const [tempOverride, setTempOverride] = useState(agent.temperature_override?.toString() ?? '')
  const [prompt, setPrompt] = useState(agent.system_prompt)
  const [scopes, setScopes] = useState<string[]>(agent.allowed_scopes ?? [...ALL_SCOPES])

  useEffect(() => setDirty(true), [name, active, priority, minSev, cooldown, maxPerDay, modelOverride, tempOverride, prompt, scopes])
  useEffect(() => setDirty(false), [agent])

  const toggleScope = (s: string) => {
    setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  const save = async () => {
    setBusy(true)
    try {
      await updateAgent(agent.id, {
        name,
        active,
        priority,
        min_severity: minSev,
        cooldown_minutes: cooldown,
        max_per_day: maxPerDay,
        model_override: modelOverride || null,
        temperature_override: tempOverride === '' ? null : Number(tempOverride),
        system_prompt: prompt,
        allowed_scopes: scopes,
      })
      await qc.invalidateQueries({ queryKey: ['bot-agents'] })
      toast.success('Agent atualizado')
      setDirty(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Excluir o agent "${agent.name}"? Esta ação é permanente.`)) return
    setBusy(true)
    try {
      await deleteAgent(agent.id)
      await qc.invalidateQueries({ queryKey: ['bot-agents'] })
      toast.success('Agent excluído')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-zinc-800 rounded-md bg-zinc-900/30">
      <div className="flex items-start gap-3 p-4">
        <div className="w-10 h-10 rounded-md bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 ring-1 ring-emerald-500/30">
          <Bot size={17} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-zinc-100">{agent.name}</h3>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{agent.slug}</span>
          </div>
          {agent.role_description && (
            <p className="text-[11px] text-zinc-500 mt-1">{agent.role_description}</p>
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200"
          >
            {expanded ? <ChevronDown size={11}/> : <ChevronRight size={11}/>} {expanded ? 'fechar configuração' : 'configurar'}
          </button>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={e => setActive(e.target.checked)}
              className="accent-emerald-500"
            />
            {active ? 'Ativo' : 'Inativo'}
          </label>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            title="Excluir agent"
            className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
          >
            <Trash2 size={14}/>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-zinc-800/50 pt-4">
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Nome</label>
            <input value={name} onChange={e => setName(e.target.value)} className={input} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Prioridade</label>
              <input type="number" value={priority} onChange={e => setPriority(Number(e.target.value))} className={input} />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Severidade mín.</label>
              <select value={minSev} onChange={e => setMinSev(e.target.value)} className={input}>
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Cooldown (min)</label>
              <input type="number" min={0} value={cooldown} onChange={e => setCooldown(Number(e.target.value))} className={input} />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Máx./dia</label>
              <input type="number" min={1} value={maxPerDay} onChange={e => setMaxPerDay(Number(e.target.value))} className={input} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Modelo (override)</label>
              <input value={modelOverride} onChange={e => setModelOverride(e.target.value)} className={input} placeholder="(usa o padrão)" />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Temperatura (override)</label>
              <input value={tempOverride} onChange={e => setTempOverride(e.target.value)} className={input} placeholder="(usa o padrão)" />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">System Prompt</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={8}
              className={`${input} font-mono leading-relaxed`}
            />
          </div>

          <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold">Áreas do Minutor que este agent pode consultar</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setScopes([...ALL_SCOPES])} className="text-[10px] text-emerald-300 hover:underline">Todas</button>
                <button type="button" onClick={() => setScopes([])} className="text-[10px] text-zinc-500 hover:underline">Nenhuma</button>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 mb-2">
              Limita o que o BOT pode acessar ao responder. Áreas marcadas viram tools disponíveis pro modelo IA.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
              {ALL_SCOPES.map(s => {
                const checked = scopes.includes(s)
                return (
                  <label key={s} className={[
                    'flex items-center gap-2 px-2 py-1.5 rounded border text-xs cursor-pointer transition-colors',
                    checked
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                      : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700',
                  ].join(' ')}>
                    <input type="checkbox" checked={checked} onChange={() => toggleScope(s)} className="accent-emerald-500"/>
                    <span>{SCOPE_LABEL[s] ?? s}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[10px] text-zinc-600">trigger_conditions: <code>{JSON.stringify(agent.trigger_conditions)}</code></p>
            <button
              type="button"
              onClick={save}
              disabled={busy || !dirty}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-emerald-500 text-zinc-950 text-xs font-semibold hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={12}/> Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function NewAgentModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [roleDesc, setRoleDesc] = useState('')
  const [prompt, setPrompt] = useState('Você é um analista. Responda em português brasileiro, conciso e acionável.')
  const [minSev, setMinSev] = useState<typeof SEVERITIES[number]>('info')
  const [priority, setPriority] = useState(100)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await createAgent({
        slug: slug.trim(),
        name: name.trim(),
        role_description: roleDesc.trim() || null,
        system_prompt: prompt,
        priority,
        min_severity: minSev,
        active: true,
      })
      await qc.invalidateQueries({ queryKey: ['bot-agents'] })
      toast.success('Agent criado')
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Novo Agent</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-200"><X size={16}/></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Slug *</label>
            <input value={slug} onChange={e => setSlug(e.target.value)} className={input} placeholder="ex: marketing_intel" required pattern="[a-z0-9_-]+" />
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Nome *</label>
            <input value={name} onChange={e => setName(e.target.value)} className={input} placeholder="ex: Marketing Intelligence" required />
          </div>
        </div>
        <div>
          <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Descrição do papel</label>
          <input value={roleDesc} onChange={e => setRoleDesc(e.target.value)} className={input} placeholder="ex: Analisa funil e oportunidades comerciais." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Severidade mín.</label>
            <select value={minSev} onChange={e => setMinSev(e.target.value as typeof SEVERITIES[number])} className={input}>
              {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Prioridade</label>
            <input type="number" value={priority} onChange={e => setPriority(Number(e.target.value))} className={input} />
          </div>
        </div>
        <div>
          <label className="text-[11px] text-zinc-500 uppercase tracking-wider">System Prompt *</label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={8} className={`${input} font-mono leading-relaxed`} required />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-1.5 rounded text-xs text-zinc-300 hover:bg-zinc-800">Cancelar</button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-emerald-500 text-zinc-950 text-xs font-semibold hover:bg-emerald-400 disabled:opacity-50"
          >
            <Save size={12}/> Criar Agent
          </button>
        </div>
      </form>
    </div>
  )
}

export function AgentsTab() {
  const { data, isLoading } = useQuery({ queryKey: ['bot-agents'], queryFn: listAgents })
  const [newOpen, setNewOpen] = useState(false)

  if (isLoading) return <Skeleton className="h-40 bg-zinc-800" />
  const items = data?.data ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-zinc-500 flex-1">
          Agents executam em ordem de prioridade. Cooldown e máx./dia protegem contra ruído e custo de IA.
        </p>
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500 text-zinc-950 text-xs font-semibold hover:bg-emerald-400 shrink-0"
        >
          <Plus size={12}/> Novo Agent
        </button>
      </div>
      {items.map(a => <AgentCard key={a.id} agent={a} />)}
      {newOpen && <NewAgentModal onClose={() => setNewOpen(false)} />}
    </div>
  )
}
