'use client'

import { useQuery } from '@tanstack/react-query'
import {
  Bell, Check, Tag, Target, Users, X, Zap, AlertCircle,
} from 'lucide-react'
import { testRule } from '@/lib/bot-config'
import type { BotRule, RuleChannel, RuleSeverity, RuleTargetType } from '@/types/bot'

interface Props {
  rule: BotRule
  onClose: () => void
  onEdit: () => void
}

const SEV_COLOR: Record<RuleSeverity, string> = {
  info:     'bg-blue-500/15 text-blue-300 border-blue-500/30',
  low:      'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  medium:   'bg-amber-500/15 text-amber-300 border-amber-500/30',
  high:     'bg-orange-500/15 text-orange-300 border-orange-500/30',
  critical: 'bg-red-500/15 text-red-300 border-red-500/30',
}

const TARGET_LABEL: Record<RuleTargetType, string> = {
  user: 'Usuário', role: 'Por papel', group: 'Grupo',
  all_admins: 'Todos os admins/coordenadores/executivos',
  customer_team: 'Time do cliente do feed',
  all_users: 'Todos os usuários ativos',
}

const CHANNEL_LABEL: Record<RuleChannel, string> = {
  inbox: 'Inbox (BOT individual de cada user)',
  bot_dm: 'BOT DM',
  group: 'Grupo (uma mensagem na conversa do grupo)',
  email: 'E-mail',
  teams: 'Teams',
}

export function RuleViewerModal({ rule, onClose, onEdit }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['rule-preview', rule.id],
    queryFn: () => testRule(rule.id),
    refetchOnWindowFocus: false,
  })

  const preview = data?.data

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-amber-300" />
            <h2 className="text-sm font-semibold text-zinc-100">Regra de notificação #{rule.id}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-200" aria-label="Fechar">
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Nome + descrição */}
          <div>
            <h3 className="text-base font-semibold text-zinc-100">{rule.name}</h3>
            {rule.description && (
              <p className="text-xs text-zinc-400 mt-1">{rule.description}</p>
            )}
            <div className="flex items-center gap-1.5 mt-2 text-[10px] uppercase tracking-wider">
              <span className={`px-1.5 py-0.5 rounded border ${rule.active ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' : 'border-zinc-700 text-zinc-500'}`}>
                {rule.active ? 'Ativa' : 'Inativa'}
              </span>
              <span className="text-zinc-600">prioridade {rule.priority}</span>
            </div>
          </div>

          {/* QUANDO */}
          <Section icon={<Zap size={12}/>} title="Quando disparar">
            <Row label="Severidade mínima">
              <span className={`text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEV_COLOR[rule.severity_min]}`}>
                ≥ {rule.severity_min}
              </span>
            </Row>
            <Row label="Tipo de evento">
              <span className="text-sm text-zinc-200">{rule.event_type ?? <em className="text-zinc-500">Qualquer</em>}</span>
            </Row>
            <Row label="Skill responsável">
              <span className="text-sm text-zinc-200">{rule.skill_slug ?? <em className="text-zinc-500">Qualquer</em>}</span>
            </Row>
            <Row label="Trigger event">
              <code className="text-[11px] text-zinc-400 font-mono">{rule.trigger_event}</code>
            </Row>
          </Section>

          {/* PARA QUEM */}
          <Section icon={<Target size={12}/>} title="Para quem entregar">
            <Row label="Tipo de destino">
              <span className="text-sm text-zinc-200">{TARGET_LABEL[rule.target_type] ?? rule.target_type}</span>
            </Row>
            {rule.target_value && (
              <Row label="Valor">
                <span className="text-sm text-zinc-200">
                  {rule.target_label ?? rule.target_value}
                  {rule.target_label && <span className="text-zinc-500 text-[11px] ml-1">#{rule.target_value}</span>}
                </span>
              </Row>
            )}
          </Section>

          {/* CANAL */}
          <Section icon={<Tag size={12}/>} title="Canal de entrega">
            <Row label="Canal">
              <span className="text-sm text-emerald-300">{CHANNEL_LABEL[rule.channel] ?? rule.channel}</span>
            </Row>
          </Section>

          {/* PREVIEW DE DESTINATÁRIOS */}
          <Section icon={<Users size={12}/>} title="Destinatários efetivos (baseado no último feed)">
            {isLoading && <p className="text-xs text-zinc-500">Calculando…</p>}
            {isError && (
              <p className="text-xs text-amber-400 inline-flex items-center gap-1.5">
                <AlertCircle size={12}/> Não foi possível calcular agora. Tente novamente em instantes.
              </p>
            )}
            {preview && (
              <>
                <div className="flex items-center gap-2 text-[11px] mb-2">
                  {preview.severity_match ? (
                    <span className="inline-flex items-center gap-1 text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                      <Check size={11}/> Casaria com o último feed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                      <AlertCircle size={11}/> Não casaria com o último feed (severity/evento)
                    </span>
                  )}
                  <span className="text-zinc-500">· {preview.recipients.length} destinatário(s)</span>
                </div>
                {preview.group && (
                  <p className="text-[11px] text-zinc-400 mb-2">
                    📨 Mensagem postada no grupo <strong className="text-zinc-200">{preview.group.title ?? `#${preview.group.id}`}</strong>
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {preview.recipients.slice(0, 50).map(r => (
                    <span key={r.id} className="text-[11px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">
                      {r.name}
                    </span>
                  ))}
                  {preview.recipients.length > 50 && (
                    <span className="text-[11px] text-zinc-500">+ {preview.recipients.length - 50} ...</span>
                  )}
                </div>
              </>
            )}
          </Section>
        </div>

        <footer className="p-3 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-[10px] text-zinc-600">
            Criada em {rule.created_at?.slice(0, 10)} · Atualizada em {rule.updated_at?.slice(0, 10)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 rounded"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="px-4 py-1.5 rounded bg-emerald-500 text-zinc-950 text-xs font-semibold hover:bg-emerald-400"
            >
              Editar regra
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-zinc-800 rounded-md p-3 bg-zinc-900/30">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
        {icon} {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-baseline gap-2">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <div>{children}</div>
    </div>
  )
}
