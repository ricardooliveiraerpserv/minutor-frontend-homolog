'use client'

import { useState } from 'react'
import { Bell, Bot, Cog, Radar, Settings2, ShieldCheck, Sparkles, Users, Zap, Volume2, HelpCircle, ChevronDown } from 'lucide-react'
import { AppLayout } from '@/components/layout/app-layout'
import { GeneralTab } from '@/components/bot-config/GeneralTab'
import { ProvidersTab } from '@/components/bot-config/ProvidersTab'
import { AgentsTab } from '@/components/bot-config/AgentsTab'
import { SkillsTab } from '@/components/bot-config/SkillsTab'
import { RulesTab } from '@/components/bot-config/RulesTab'
import { GroupsTab } from '@/components/bot-config/GroupsTab'
import { DetectorsTab } from '@/components/bot-config/DetectorsTab'
import { PermissionsTab } from '@/components/bot-config/PermissionsTab'
import { SoundTab } from '@/components/bot-config/SoundTab'

type TabKey = 'general' | 'providers' | 'agents' | 'skills' | 'detectors' | 'permissions' | 'rules' | 'groups' | 'sound'

const TABS: { key: TabKey; label: string; icon: typeof Bot; description: string }[] = [
  { key: 'general',   label: 'Geral',         icon: Cog,        description: 'Provedor padrão, modelo, temperatura, frequência de execução e janela anti-ruído.' },
  { key: 'providers', label: 'Providers IA',  icon: Settings2,  description: 'Provedores de IA conectados (Anthropic, OpenAI, etc) — endpoints, chaves e status.' },
  { key: 'agents',    label: 'Agents',        icon: Sparkles,   description: 'Agentes especializados (Account, Support, Growth…) com prompts, cooldown e limites diários.' },
  { key: 'skills',    label: 'Skills',        icon: Zap,        description: 'Regras determinísticas (Rule Engine) que classificam eventos antes da IA rodar.' },
  { key: 'detectors', label: 'Detectores',    icon: Radar,      description: 'Varreduras periódicas que detectam anomalias (banco de horas, despesas, tickets…) e criam alertas no Operational Feed.' },
  { key: 'permissions', label: 'Permissões',  icon: ShieldCheck, description: 'Define o que cada perfil de usuário pode perguntar ao BOT e quais dados pode ver. Aplicado como default na criação do user.' },
  { key: 'rules',     label: 'Notificações',  icon: Bell,       description: 'Para QUEM e por QUAL canal cada evento é entregue. Skill/severity → grupo/inbox/email.' },
  { key: 'groups',    label: 'Grupos',        icon: Users,      description: 'Grupos operacionais (Coordenadores, Sustentação, CS…) que recebem alertas do BOT e conversam entre si.' },
  { key: 'sound',     label: 'Som',           icon: Volume2,    description: 'Toque e volume do som de notificação do chat — vale para todos os usuários.' },
]

// Explicação amigável por aba (aparece recolhida por padrão; o usuário expande se quiser).
const TAB_HELP: Record<TabKey, string[]> = {
  general: [
    'Aqui você define o "cérebro" do BOT: qual inteligência artificial ele usa (provedor e modelo) e o quanto ele é criativo (temperatura — quanto menor, mais direto).',
    'Também define de quanto em quanto tempo o BOT roda sozinho (frequência) e a partir de qual gravidade ele te avisa. O "anti-ruído" evita que o mesmo alerta chegue repetido.',
  ],
  providers: [
    'É a lista das IAs que o BOT pode usar (Anthropic, OpenAI, etc.). Aqui ficam as chaves de acesso e o status de cada uma — é a "tomada" onde o BOT liga o motor de inteligência.',
    'Se uma chave estiver errada ou vencida, o BOT para de responder; é aqui que você corrige.',
  ],
  agents: [
    'Os Agents são assistentes especializados do BOT — por exemplo, um focado em contratos, outro em suporte, outro em crescimento.',
    'Cada um tem seu jeito de responder (prompt), um tempo de espera entre ações (cooldown) e um limite de quantas vezes pode agir por dia.',
  ],
  skills: [
    'Skills são regras automáticas que classificam o que acontece no sistema ANTES da IA entrar — tipo um pré-filtro rápido e barato.',
    'Elas decidem na hora se um evento é importante o suficiente para virar alerta, sem precisar gastar processamento de IA.',
  ],
  detectors: [
    'Os Detectores são "vigias" que rodam de tempos em tempos procurando problemas: banco de horas estourando, despesa parada, ticket travado, etc.',
    'Quando encontram algo, criam um alerta no Feed do BOT para a pessoa certa ver.',
  ],
  permissions: [
    'Aqui você controla o que cada tipo de usuário (admin, coordenador, consultor…) pode perguntar ao BOT e quais dados ele pode ver.',
    'É o controle de acesso do BOT — serve como padrão quando um novo usuário é criado.',
  ],
  rules: [
    'Define para QUEM e por QUAL canal cada alerta é entregue: grupo, chat interno ou e-mail, de acordo com o tipo do evento e a gravidade.',
    'Em resumo: é o "roteador" que decide onde cada aviso do BOT vai parar.',
  ],
  groups: [
    'Grupos são conjuntos de pessoas (ex.: Coordenadores, Sustentação, CS) que recebem alertas do BOT e podem conversar entre si no chat.',
    'Use-os para direcionar avisos a um time inteiro de uma vez, em vez de pessoa por pessoa.',
  ],
  sound: [
    'Escolhe o som que toca quando chega uma mensagem no chat, e o volume. Clique em "Ouvir" para testar antes de salvar.',
    'A escolha vale para todos os usuários. Mesmo assim, cada pessoa pode se silenciar individualmente no ícone de mensagens.',
  ],
}

function TabHelp({ paragraphs }: { paragraphs: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/40">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <HelpCircle size={14} className="text-emerald-400 shrink-0" />
        <span className="text-xs font-medium text-zinc-300 flex-1">Como funciona esta aba</span>
        <ChevronDown size={15} className={`text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0.5 space-y-2 border-t border-zinc-800">
          {paragraphs.map((p, i) => (
            <p key={i} className="text-[12px] leading-relaxed text-zinc-400">{p}</p>
          ))}
        </div>
      )}
    </div>
  )
}

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

        <p className="text-[11px] text-zinc-500 mb-3 px-1">{active.description}</p>

        <TabHelp key={tab} paragraphs={TAB_HELP[tab]} />

        <div className="space-y-1">
          {tab === 'general'   && <GeneralTab />}
          {tab === 'providers' && <ProvidersTab />}
          {tab === 'agents'    && <AgentsTab />}
          {tab === 'skills'    && <SkillsTab />}
          {tab === 'detectors' && <DetectorsTab />}
          {tab === 'permissions' && <PermissionsTab />}
          {tab === 'rules'     && <RulesTab />}
          {tab === 'groups'    && <GroupsTab />}
          {tab === 'sound'     && <SoundTab />}
        </div>
      </div>
    </AppLayout>
  )
}
