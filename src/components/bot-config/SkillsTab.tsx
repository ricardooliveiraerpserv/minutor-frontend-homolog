'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Trash2, X, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { createSkill, deleteSkill, listSkills, updateSkill } from '@/lib/bot-config'
import { Skeleton } from '@/components/ui/skeleton'
import type { BotSkill } from '@/types/bot'

const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const
const RULE_TYPES = ['threshold', 'sql', 'event'] as const

const SEV_STYLE: Record<string, string> = {
  info:     'bg-blue-500/15 text-blue-300 border-blue-500/30',
  low:      'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  medium:   'bg-amber-500/15 text-amber-300 border-amber-500/30',
  high:     'bg-orange-500/15 text-orange-300 border-orange-500/30',
  critical: 'bg-red-500/15 text-red-300 border-red-500/30',
}

const input = 'w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500'

function RuleClause({ skill }: { skill: BotSkill }) {
  const cfg = skill.config as Record<string, unknown>

  if (skill.rule_type === 'threshold') {
    const metric = cfg.metric as string | undefined
    const operator = cfg.operator as string | undefined
    const value = cfg.value
    const and = cfg.and as Record<string, unknown> | undefined

    return (
      <div className="font-mono text-[11px] text-zinc-300 leading-relaxed">
        <div>
          <span className="text-zinc-500">IF</span>{' '}
          <span className="text-emerald-300">{metric}</span>{' '}
          <span className="text-amber-300">{operator}</span>{' '}
          <span className="text-violet-300">{String(value)}</span>
          {and && (
            <>
              {'  '}
              <span className="text-zinc-500">AND</span>{' '}
              <span className="text-emerald-300">{String(and.metric)}</span>{' '}
              <span className="text-amber-300">{String(and.operator)}</span>{' '}
              <span className="text-violet-300">{String(and.value)}</span>
            </>
          )}
        </div>
        <div className="mt-1">
          <span className="text-zinc-500">THEN</span>{' '}
          <span className="text-zinc-200">severity</span>{' '}
          <span className="text-amber-300">=</span>{' '}
          <span className="text-red-300">{skill.severity}</span>
        </div>
      </div>
    )
  }

  if (skill.rule_type === 'sql') {
    return (
      <pre className="font-mono text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap">
        {String(cfg.sql ?? '(sem SQL definido)')}
      </pre>
    )
  }

  if (skill.rule_type === 'event') {
    return (
      <div className="font-mono text-[11px] text-zinc-300 leading-relaxed">
        <span className="text-zinc-500">ON event</span>{' '}
        <span className="text-emerald-300">{String(cfg.event_class ?? '?')}</span>
      </div>
    )
  }

  return null
}

function NewSkillModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<typeof SEVERITIES[number]>('medium')
  const [ruleType, setRuleType] = useState<typeof RULE_TYPES[number]>('threshold')
  // threshold fields
  const [metric, setMetric] = useState('')
  const [operator, setOperator] = useState('>')
  const [value, setValue] = useState('')
  // sql / event
  const [sql, setSql] = useState('')
  const [eventClass, setEventClass] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    let config: Record<string, unknown> = {}
    if (ruleType === 'threshold') {
      config = { metric: metric.trim(), operator, value: isNaN(Number(value)) ? value : Number(value) }
    } else if (ruleType === 'sql') {
      config = { sql: sql.trim() }
    } else {
      config = { event_class: eventClass.trim() }
    }
    try {
      await createSkill({
        slug: slug.trim(),
        name: name.trim(),
        description: description.trim() || null,
        rule_type: ruleType,
        config,
        severity,
        active: true,
      })
      await qc.invalidateQueries({ queryKey: ['bot-skills'] })
      toast.success('Skill criada')
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
          <h2 className="text-sm font-semibold text-zinc-100">Nova Skill</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-200"><X size={16}/></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Slug *</label>
            <input value={slug} onChange={e => setSlug(e.target.value)} className={input} placeholder="ex: revenue_drop" required pattern="[a-z0-9_-]+" />
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Nome *</label>
            <input value={name} onChange={e => setName(e.target.value)} className={input} placeholder="ex: Queda de receita" required />
          </div>
        </div>
        <div>
          <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Descrição</label>
          <input value={description} onChange={e => setDescription(e.target.value)} className={input} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Tipo *</label>
            <select value={ruleType} onChange={e => setRuleType(e.target.value as typeof RULE_TYPES[number])} className={input}>
              {RULE_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Severidade *</label>
            <select value={severity} onChange={e => setSeverity(e.target.value as typeof SEVERITIES[number])} className={input}>
              {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        {ruleType === 'threshold' && (
          <div className="grid grid-cols-3 gap-3 p-3 rounded bg-zinc-900/50 border border-zinc-800">
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Métrica *</label>
              <input value={metric} onChange={e => setMetric(e.target.value)} className={input} placeholder="ex: tickets_90d" required />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Operador</label>
              <select value={operator} onChange={e => setOperator(e.target.value)} className={input}>
                {['>', '>=', '<', '<=', '=', '!='].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Valor *</label>
              <input value={value} onChange={e => setValue(e.target.value)} className={input} placeholder="ex: 15" required />
            </div>
          </div>
        )}
        {ruleType === 'sql' && (
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">SQL *</label>
            <textarea value={sql} onChange={e => setSql(e.target.value)} rows={5} className={`${input} font-mono`} required />
          </div>
        )}
        {ruleType === 'event' && (
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Event class *</label>
            <input value={eventClass} onChange={e => setEventClass(e.target.value)} className={input} placeholder="ex: App\\Events\\TicketCreated" required />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-1.5 rounded text-xs text-zinc-300 hover:bg-zinc-800">Cancelar</button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-emerald-500 text-zinc-950 text-xs font-semibold hover:bg-emerald-400 disabled:opacity-50"
          >
            <Save size={12}/> Criar Skill
          </button>
        </div>
      </form>
    </div>
  )
}

export function SkillsTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['bot-skills'], queryFn: listSkills })
  const [newOpen, setNewOpen] = useState(false)

  if (isLoading) return <Skeleton className="h-40 bg-zinc-800" />
  const items = data?.data ?? []

  const toggle = async (id: number, active: boolean) => {
    try {
      await updateSkill(id, { active: !active })
      await qc.invalidateQueries({ queryKey: ['bot-skills'] })
      toast.success(active ? 'Skill desativada' : 'Skill ativada')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const remove = async (s: BotSkill) => {
    if (!confirm(`Excluir a skill "${s.name}"? Esta ação é permanente.`)) return
    try {
      await deleteSkill(s.id)
      await qc.invalidateQueries({ queryKey: ['bot-skills'] })
      toast.success('Skill excluída')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-zinc-900/40 border border-zinc-800 p-3 flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-zinc-300 text-sm font-medium">
            <Zap size={14} /> Rule Engine
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Skills são regras determinísticas. A classificação acontece <strong>antes</strong> de chamar IA — agents só rodam se uma skill disparar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500 text-zinc-950 text-xs font-semibold hover:bg-emerald-400 shrink-0"
        >
          <Plus size={12}/> Nova Skill
        </button>
      </div>

      {items.map(s => (
        <div key={s.id} className="border border-zinc-800 rounded-md bg-zinc-900/30 overflow-hidden">
          <div className="flex items-start gap-3 p-4">
            <div className="w-10 h-10 rounded-md bg-zinc-800 text-amber-300 flex items-center justify-center shrink-0 ring-1 ring-amber-500/30">
              <Zap size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-zinc-100">{s.name}</h3>
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{s.slug}</span>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">{s.rule_type}</span>
                <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEV_STYLE[s.severity] ?? 'border-zinc-700 text-zinc-400'}`}>
                  → {s.severity}
                </span>
              </div>
              {s.description && (
                <p className="text-[11px] text-zinc-500 mt-1">{s.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => toggle(s.id, s.active)}
                className={[
                  'text-xs px-3 py-1.5 rounded border transition-colors',
                  s.active
                    ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20'
                    : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800',
                ].join(' ')}
              >
                {s.active ? 'Ativa' : 'Inativa'}
              </button>
              <button
                type="button"
                onClick={() => remove(s)}
                title="Excluir skill"
                className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
              >
                <Trash2 size={14}/>
              </button>
            </div>
          </div>

          <div className="bg-zinc-950/60 border-t border-zinc-800/60 px-4 py-3">
            <RuleClause skill={s} />
          </div>
        </div>
      ))}

      {newOpen && <NewSkillModal onClose={() => setNewOpen(false)} />}
    </div>
  )
}
