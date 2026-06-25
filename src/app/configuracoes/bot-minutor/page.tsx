'use client'

import { useState } from 'react'
import { Bell, Bot, Cog, Radar, Settings2, Sparkles, Users, Zap } from 'lucide-react'
import { AppLayout } from '@/components/layout/app-layout'
import { GeneralTab } from '@/components/bot-config/GeneralTab'
import { ProvidersTab } from '@/components/bot-config/ProvidersTab'
import { AgentsTab } from '@/components/bot-config/AgentsTab'
import { SkillsTab } from '@/components/bot-config/SkillsTab'
import { RulesTab } from '@/components/bot-config/RulesTab'
import { GroupsTab } from '@/components/bot-config/GroupsTab'
import { DetectorsTab } from '@/components/bot-config/DetectorsTab'

type TabKey = 'general' | 'providers' | 'agents' | 'skills' | 'detectors' | 'rules' | 'groups'

const TABS: { key: TabKey; label: string; icon: typeof Bot; description: string }[] = [
  { key: 'general',   label: 'Geral',         icon: Cog,        description: 'Provedor padrão, modelo, temperatura, frequência de execução e janela anti-ruído.' },
  { key: 'providers', label: 'Providers IA',  icon: Settings2,  description: 'Provedores de IA conectados (Anthropic, OpenAI, etc) — endpoints, chaves e status.' },
  { key: 'agents',    label: 'Agents',        icon: Sparkles,   description: 'Agentes especializados (Account, Support, Growth…) com prompts, cooldown e limites diários.' },
  { key: 'skills',    label: 'Skills',        icon: Zap,        description: 'Regras determinísticas (Rule Engine) que classificam eventos antes da IA rodar.' },
  { key: 'detectors', label: 'Detectores',    icon: Radar,      description: 'Varreduras periódicas que detectam anomalias (banco de horas, despesas, tickets…) e criam alertas no Operational Feed.' },
  { key: 'rules',     label: 'Notificações',  icon: Bell,       description: 'Para QUEM e por QUAL canal cada evento é entregue. Skill/severity → grupo/inbox/email.' },
  { key: 'groups',    label: 'Grupos',        icon: Users,      description: 'Grupos operacionais (Coordenadores, Sustentação, CS…) que recebem alertas do BOT e conversam entre si.' },
]

export default function BotMinutorConfigPage() {
  const [tab, setTab] = useState<TabKey>('general')
  const active = TABS.find(t => t.key === tab)!

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto p-6">
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30 flex items-center justify-center">
              <Bot size={18} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-zinc-100">BOT Minutor</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Entidade operacional mestre — alertas, diagnósticos IA, agents e regras de roteamento.
              </p>
            </div>
          </div>
        </header>

        <nav className="flex gap-1 border-b border-zinc-800 mb-2" role="tablist">
          {TABS.map(t => {
            const Icon = t.icon
            const selected = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(t.key)}
                className={[
                  'inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2',
                  selected
                    ? 'text-emerald-300 border-emerald-500'
                    : 'text-zinc-400 border-transparent hover:text-zinc-200',
                ].join(' ')}
              >
                <Icon size={13} /> {t.label}
              </button>
            )
          })}
        </nav>

        <p className="text-[11px] text-zinc-500 mb-5 px-1">{active.description}</p>

        <div className="space-y-1">
          {tab === 'general'   && <GeneralTab />}
          {tab === 'providers' && <ProvidersTab />}
          {tab === 'agents'    && <AgentsTab />}
          {tab === 'skills'    && <SkillsTab />}
          {tab === 'detectors' && <DetectorsTab />}
          {tab === 'rules'     && <RulesTab />}
          {tab === 'groups'    && <GroupsTab />}
        </div>
      </div>
    </AppLayout>
  )
}
