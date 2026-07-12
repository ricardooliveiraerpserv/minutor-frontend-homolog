'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import {
  createRule, getRuleOptions, listChatUsersForRule, updateRule,
} from '@/lib/bot-config'
import type { BotRule, RuleChannel, RuleSeverity, RuleTargetType } from '@/types/bot'

interface Props {
  rule: BotRule | null    // null = criar; preenchido = editar
  onClose: () => void
}

const SEV_LABEL: Record<RuleSeverity, string> = {
  info: 'Informativo', low: 'Baixo', medium: 'Médio', high: 'Alto', critical: 'Crítico',
}

const CHANNEL_LABEL: Record<RuleChannel, string> = {
  inbox:  'Inbox (BOT individual de cada user)',
  bot_dm: 'BOT DM (alias do inbox)',
  group:  'Grupo (uma mensagem na conversa do grupo)',
  email:  'E-mail (pendente)',
  teams:  'Teams legacy (pendente)',
}

const TARGET_LABEL: Record<RuleTargetType, string> = {
  user:          'Usuário específico',
  role:          'Por papel (admin/coordinator/etc)',
  group:         'Grupo (Conversation tipo group)',
  all_admins:    'Todos os admins/coordenadores/executivos',
  customer_team: 'Time do cliente do feed',
  all_users:     'Todos os usuários ativos',
}

const empty: Partial<BotRule> = {
  name: '',
  description: '',
  trigger_event: 'App\\Events\\OperationalFeedCreated',
  event_type: null,
  skill_slug: null,
  severity_min: 'high',
  target_type: 'all_admins',
  target_value: null,
  channel: 'inbox',
  active: true,
  priority: 100,
}

export function RuleEditorModal({ rule, onClose }: Props) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<Partial<BotRule>>(rule ?? empty)

  const { data: optsRes } = useQuery({
    queryKey: ['rule-options'],
    queryFn: getRuleOptions,
  })
  const opts = optsRes?.data

  // Busca usuários só quando target_type=user
  const { data: usersRes } = useQuery({
    queryKey: ['rule-users'],
    queryFn: listChatUsersForRule,
    enabled: form.target_type === 'user',
  })

  const set = <K extends keyof BotRule>(k: K, v: BotRule[K] | null) => {
    setForm(f => ({ ...f, [k]: v }))
  }

  /**
   * Trocar target_type: limpa target_value SE muda de tipo, para evitar
   * id de user/grupo "órfão" quando o admin mudou o tipo. Não dispara no
   * mount/edição (preserva o valor que veio do servidor).
   */
  const changeTargetType = (newType: RuleTargetType) => {
    setForm(f => f.target_type === newType
      ? f
      : { ...f, target_type: newType, target_value: null }
    )
  }

  const submit = async () => {
    if (!form.name?.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    if (['user', 'role', 'group'].includes(form.target_type ?? '') && !form.target_value) {
      toast.error('Selecione o valor do destinatário')
      return
    }

    setBusy(true)
    try {
      if (rule) {
        await updateRule(rule.id, form)
        toast.success('Regra atualizada')
      } else {
        await createRule(form)
        toast.success('Regra criada')
      }
      await qc.invalidateQueries({ queryKey: ['bot-rules'] })
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const needsTargetValue = ['user', 'role', 'group'].includes(form.target_type ?? '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-100">
            {rule ? `Editar regra #${rule.id}` : 'Nova regra de notificação'}
          </h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Nome + descrição */}
          <Section title="Identificação">
            <Field label="Nome">
              <input
                value={form.name ?? ''}
                onChange={e => set('name', e.target.value)}
                className={inputCls}
                placeholder='Ex.: "Critical → Coordenadores"'
              />
            </Field>
            <Field label="Descrição (opcional)">
              <textarea
                value={form.description ?? ''}
                onChange={e => set('description', e.target.value)}
                rows={2}
                className={`${inputCls} font-normal`}
                placeholder="Explique o que esta regra faz"
              />
            </Field>
          </Section>

          {/* QUANDO (trigger) */}
          <Section title="Quando disparar (filtros do evento)">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Severidade mínima">
                <select
                  value={form.severity_min ?? 'high'}
                  onChange={e => set('severity_min', e.target.value as RuleSeverity)}
                  className={inputCls}
                >
                  {(opts?.severities ?? []).map(s => (
                    <option key={s} value={s}>{SEV_LABEL[s] ?? s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo de evento (opcional)">
                <select
                  value={form.event_type ?? ''}
                  onChange={e => set('event_type', e.target.value || null)}
                  className={inputCls}
                >
                  <option value="">Qualquer</option>
                  {(opts?.event_types ?? []).map(e => (
                    <option key={e.value} value={e.value}>{e.label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Skill responsável (opcional)">
              <select
                value={form.skill_slug ?? ''}
                onChange={e => set('skill_slug', e.target.value || null)}
                className={inputCls}
              >
                <option value="">Qualquer</option>
                {(opts?.skills ?? []).map(s => (
                  <option key={s.slug} value={s.slug}>{s.name}</option>
                ))}
              </select>
            </Field>
          </Section>

          {/* PARA QUEM (target) */}
          <Section title="Para quem entregar (destino)">
            <Field label="Tipo de destino">
              <select
                value={form.target_type ?? 'all_admins'}
                onChange={e => changeTargetType(e.target.value as RuleTargetType)}
                className={inputCls}
              >
                {(opts?.target_types ?? []).map(t => (
                  <option key={t} value={t}>{TARGET_LABEL[t] ?? t}</option>
                ))}
              </select>
            </Field>

            {needsTargetValue && (
              <Field label="Valor do destinatário">
                {form.target_type === 'user' && (
                  <select
                    value={form.target_value ?? ''}
                    onChange={e => set('target_value', e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— escolha um usuário —</option>
                    {(usersRes?.data ?? []).map(u => (
                      <option key={u.id} value={String(u.id)}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                )}
                {form.target_type === 'role' && (
                  <select
                    value={form.target_value ?? ''}
                    onChange={e => set('target_value', e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— escolha um papel —</option>
                    {(opts?.roles ?? []).map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                )}
                {form.target_type === 'group' && (
                  <select
                    value={form.target_value ?? ''}
                    onChange={e => set('target_value', e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— escolha um grupo —</option>
                    {(opts?.groups ?? []).map(g => (
                      <option key={g.id} value={String(g.id)}>{g.name}</option>
                    ))}
                  </select>
                )}
              </Field>
            )}
          </Section>

          {/* COMO (channel) */}
          <Section title="Canal de entrega">
            <Field label="Canal">
              <select
                value={form.channel ?? 'inbox'}
                onChange={e => set('channel', e.target.value as RuleChannel)}
                className={inputCls}
              >
                {(opts?.channels ?? []).map(c => (
                  <option key={c} value={c}>{CHANNEL_LABEL[c] ?? c}</option>
                ))}
              </select>
            </Field>
            {form.channel === 'group' && form.target_type !== 'group' && (
              <p className="text-[11px] text-amber-400">
                Atenção: canal = grupo, mas o destino não é um grupo. A mensagem será postada no grupo definido em `target_value` apenas se for um id válido de grupo.
              </p>
            )}
          </Section>

          {/* META */}
          <Section title="Metadados">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prioridade (menor roda primeiro)">
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={form.priority ?? 100}
                  onChange={e => set('priority', Number(e.target.value))}
                  className={inputCls}
                />
              </Field>
              <Field label="Status">
                <label className="inline-flex items-center gap-2 mt-1.5">
                  <input
                    type="checkbox"
                    checked={!!form.active}
                    onChange={e => set('active', e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span className="text-sm text-zinc-300">{form.active ? 'Ativa' : 'Inativa'}</span>
                </label>
              </Field>
            </div>
          </Section>
        </div>

        <footer className="p-4 border-t border-zinc-800 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 rounded">
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="px-4 py-1.5 rounded bg-emerald-500 text-zinc-950 text-xs font-semibold hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {rule ? 'Salvar alterações' : 'Criar regra'}
          </button>
        </footer>
      </div>
    </div>
  )
}

// ─── helpers visuais ─────────────────────────────────────────────────

const inputCls = 'w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-zinc-400">{label}</label>
      {children}
    </div>
  )
}
