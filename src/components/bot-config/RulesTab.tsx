'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Bell, Plus, Pencil, Trash2, FlaskConical, CheckCircle2, XCircle, Eye, Send,
} from 'lucide-react'
import {
  deleteRule, dispatchTestRule, listRules, testRule, updateRule,
} from '@/lib/bot-config'
import { Skeleton } from '@/components/ui/skeleton'
import type { BotRule, RuleChannel, RuleSeverity, RuleTargetType } from '@/types/bot'
import { RuleEditorModal } from './RuleEditorModal'
import { RuleViewerModal } from './RuleViewerModal'

const SEV_COLOR: Record<RuleSeverity, string> = {
  info:     'bg-blue-500/15 text-blue-300 border-blue-500/30',
  low:      'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  medium:   'bg-amber-500/15 text-amber-300 border-amber-500/30',
  high:     'bg-orange-500/15 text-orange-300 border-orange-500/30',
  critical: 'bg-red-500/15 text-red-300 border-red-500/30',
}

const TARGET_LABEL: Record<RuleTargetType, string> = {
  user:          'Usuário',
  role:          'Papel',
  group:         'Grupo',
  all_admins:    'Todos admins',
  customer_team: 'Time do cliente',
  all_users:     'Todos usuários',
}

const CHANNEL_LABEL: Record<RuleChannel, string> = {
  inbox:  'Inbox',
  bot_dm: 'BOT DM',
  group:  'Grupo',
  email:  'E-mail',
  teams:  'Teams',
}

export function RulesTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['bot-rules'], queryFn: listRules })

  const [editing, setEditing] = useState<BotRule | null | undefined>(undefined)
  // undefined = fechado; null = criar; objeto = editar
  const [viewing, setViewing] = useState<BotRule | null>(null)

  if (isLoading) return <Skeleton className="h-40 bg-zinc-800" />
  const items = data?.data ?? []

  const toggle = async (rule: BotRule) => {
    try {
      await updateRule(rule.id, { active: !rule.active })
      await qc.invalidateQueries({ queryKey: ['bot-rules'] })
      toast.success(rule.active ? 'Regra desativada' : 'Regra ativada')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const remove = async (rule: BotRule) => {
    if (!confirm(`Excluir regra "${rule.name}"? Esta ação não pode ser desfeita.`)) return
    try {
      await deleteRule(rule.id)
      await qc.invalidateQueries({ queryKey: ['bot-rules'] })
      toast.success('Regra excluída')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const runPreview = async (rule: BotRule) => {
    try {
      const res = await testRule(rule.id)
      const d = res.data
      const recList = d.recipients.slice(0, 5).map(r => r.name).join(', ')
      const more = d.recipients.length > 5 ? ` +${d.recipients.length - 5}` : ''
      const matchEmoji = d.severity_match ? '✅' : '⚠️'
      toast.success(
        `${matchEmoji} ${d.severity_match ? 'Casaria com o último feed' : 'NÃO casaria com o último feed'}\n${d.recipients.length} destinatário(s): ${recList}${more}`,
        { duration: 7000 },
      )
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const runDispatch = async (rule: BotRule) => {
    const target = rule.target_label ?? rule.target_value ?? rule.target_type
    if (!confirm(
      `Disparar mensagem teste pela regra "${rule.name}"?\n\n` +
      `Vai postar uma mensagem REAL [TESTE] no canal "${rule.channel}" → "${target}".\n` +
      `Use o último feed como conteúdo.`,
    )) return
    try {
      const res = await dispatchTestRule(rule.id)
      const d = res.data
      const where = d.group
        ? `grupo "${d.group.title}"`
        : `${d.recipients_count} inbox(es) individual(is)`
      toast.success(
        `✅ Disparado · ${d.delivered} entrega(s) no canal "${d.channel}"\nDestino: ${where}`,
        { duration: 7000 },
      )
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-zinc-500 flex-1">
          Regras definem <strong>QUANDO</strong> (severidade, tipo de evento, skill) → <strong>PARA QUEM</strong> (usuário, papel, grupo, time) → <strong>POR QUAL CANAL</strong> (inbox, grupo, e-mail). A primeira regra que casa entrega.
        </p>
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500 text-zinc-950 text-xs font-semibold hover:bg-emerald-400 shrink-0"
        >
          <Plus size={12} /> Nova regra
        </button>
      </div>

      {items.length === 0 && (
        <div className="p-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-md">
          Nenhuma regra cadastrada ainda. Crie a primeira no botão acima.
        </div>
      )}

      {items.map(r => (
        <div key={r.id} className="border border-zinc-800 rounded-md bg-zinc-900/30 overflow-hidden">
          <div className="flex items-start gap-3 p-4">
            <div className="w-9 h-9 rounded-md bg-zinc-800 text-amber-300 flex items-center justify-center shrink-0 ring-1 ring-amber-500/30">
              <Bell size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-zinc-100">{r.name}</h3>
                <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEV_COLOR[r.severity_min]}`}>
                  ≥ {r.severity_min}
                </span>
                {r.event_type && (
                  <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded uppercase tracking-wider">
                    {r.event_type}
                  </span>
                )}
                {r.skill_slug && (
                  <span className="text-[10px] text-violet-300 bg-violet-500/10 px-1.5 py-0.5 rounded uppercase tracking-wider">
                    skill: {r.skill_slug}
                  </span>
                )}
                <span className="text-[10px] text-zinc-600 ml-auto">prio {r.priority}</span>
              </div>
              {r.description && (
                <p className="text-[11px] text-zinc-500 mt-1">{r.description}</p>
              )}
              <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-400 flex-wrap">
                <span className="text-zinc-600">→ Para:</span>
                <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">
                  {TARGET_LABEL[r.target_type]}{r.target_label ? `: ${r.target_label}` : r.target_value ? `: ${r.target_value}` : ''}
                </span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-600">Canal:</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  {CHANNEL_LABEL[r.channel] ?? r.channel}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-zinc-950/60 border-t border-zinc-800/60 px-4 py-2 flex items-center justify-between flex-wrap gap-2">
            <button
              type="button"
              onClick={() => toggle(r)}
              className={[
                'text-xs px-3 py-1 rounded border transition-colors inline-flex items-center gap-1.5',
                r.active
                  ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20'
                  : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800',
              ].join(' ')}
            >
              {r.active ? <CheckCircle2 size={11}/> : <XCircle size={11}/>}
              {r.active ? 'Ativa' : 'Inativa'}
            </button>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewing(r)}
                title="Visualizar detalhes"
                aria-label="Visualizar regra"
                className="text-[11px] text-zinc-300 hover:bg-zinc-800 px-2 py-1 rounded inline-flex items-center gap-1"
              >
                <Eye size={11}/> Ver
              </button>
              <button
                type="button"
                onClick={() => runPreview(r)}
                title="Pré-visualizar (não envia)"
                aria-label="Pré-visualizar regra"
                className="text-[11px] text-violet-700 dark:text-violet-300 hover:bg-violet-500/10 px-2 py-1 rounded inline-flex items-center gap-1"
              >
                <FlaskConical size={11}/> Preview
              </button>
              <button
                type="button"
                onClick={() => runDispatch(r)}
                title="Disparar mensagem teste REAL"
                aria-label="Disparar teste real"
                className="text-[11px] text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 px-2 py-1 rounded inline-flex items-center gap-1"
              >
                <Send size={11}/> Disparar
              </button>
              <button
                type="button"
                onClick={() => setEditing(r)}
                title="Editar"
                aria-label="Editar regra"
                className="text-[11px] text-zinc-300 hover:bg-zinc-800 px-2 py-1 rounded inline-flex items-center gap-1"
              >
                <Pencil size={11}/> Editar
              </button>
              <button
                type="button"
                onClick={() => remove(r)}
                title="Excluir"
                aria-label="Excluir regra"
                className="text-[11px] text-red-300 hover:bg-red-500/10 px-2 py-1 rounded inline-flex items-center gap-1"
              >
                <Trash2 size={11}/>
              </button>
            </div>
          </div>
        </div>
      ))}

      {editing !== undefined && (
        <RuleEditorModal rule={editing} onClose={() => setEditing(undefined)} />
      )}

      {viewing && (
        <RuleViewerModal
          rule={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing)
            setViewing(null)
          }}
        />
      )}
    </div>
  )
}
