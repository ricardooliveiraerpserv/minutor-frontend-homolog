'use client'

import { X } from 'lucide-react'
import type {
  FeedEventTypeValue,
  FeedSeverityValue,
  FeedSourceValue,
} from '@/types/operational-feed'

const SEVERITIES: { value: FeedSeverityValue; label: string }[] = [
  { value: 'critical', label: 'Crítico' },
  { value: 'high',     label: 'Alto' },
  { value: 'medium',   label: 'Médio' },
  { value: 'low',      label: 'Baixo' },
  { value: 'info',     label: 'Info' },
]

const SOURCES: { value: FeedSourceValue; label: string }[] = [
  { value: 'system',        label: 'Sistema' },
  { value: 'ai',            label: 'IA' },
  { value: 'movidesk',      label: 'Movidesk' },
  { value: 'manual',        label: 'Manual' },
  { value: 'health_engine', label: 'Health Engine' },
  { value: 'cs_engine',     label: 'CS Engine' },
  { value: 'finance',       label: 'Financeiro' },
  { value: 'training',      label: 'Treinamento' },
]

const EVENT_TYPES: { value: FeedEventTypeValue; label: string }[] = [
  { value: 'hour_overrun',          label: 'Estouro de horas' },
  { value: 'sla_breach',            label: 'SLA crítico' },
  { value: 'ticket_spike',          label: 'Aumento de tickets' },
  { value: 'churn_risk',            label: 'Risco de churn' },
  { value: 'expansion_opportunity', label: 'Oportunidade de expansão' },
  { value: 'project_stalled',       label: 'Projeto parado' },
  { value: 'ai_suggestion',         label: 'Sugestão da IA' },
  { value: 'financial_alert',       label: 'Alerta financeiro' },
  { value: 'training_recommended',  label: 'Treinamento recomendado' },
  { value: 'contract_renewal',      label: 'Renovação de contrato' },
  { value: 'custom',                label: 'Personalizado' },
]

interface FeedFiltersProps {
  severity: FeedSeverityValue[]
  source: FeedSourceValue[]
  eventType: FeedEventTypeValue[]
  onSeverityChange: (next: FeedSeverityValue[]) => void
  onSourceChange: (next: FeedSourceValue[]) => void
  onEventTypeChange: (next: FeedEventTypeValue[]) => void
  onClear: () => void
}

function toggle<T extends string>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]
}

function Chip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center px-2.5 py-1 text-[11px] rounded border transition-colors',
        active
          ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
          : 'bg-zinc-900/60 text-zinc-300 border-zinc-700 hover:bg-zinc-800',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function FeedFilters(props: FeedFiltersProps) {
  const activeCount =
    props.severity.length + props.source.length + props.eventType.length

  return (
    <section className="bg-zinc-950/50 border border-zinc-800 rounded-md p-4 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-200">Filtros</h2>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={props.onClear}
            className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-100"
          >
            <X size={12} /> Limpar ({activeCount})
          </button>
        )}
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Severidade</div>
        <div className="flex flex-wrap gap-1.5">
          {SEVERITIES.map(s => (
            <Chip
              key={s.value}
              active={props.severity.includes(s.value)}
              onClick={() => props.onSeverityChange(toggle(props.severity, s.value))}
            >
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Origem</div>
        <div className="flex flex-wrap gap-1.5">
          {SOURCES.map(s => (
            <Chip
              key={s.value}
              active={props.source.includes(s.value)}
              onClick={() => props.onSourceChange(toggle(props.source, s.value))}
            >
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Tipo de evento</div>
        <div className="flex flex-wrap gap-1.5">
          {EVENT_TYPES.map(t => (
            <Chip
              key={t.value}
              active={props.eventType.includes(t.value)}
              onClick={() => props.onEventTypeChange(toggle(props.eventType, t.value))}
            >
              {t.label}
            </Chip>
          ))}
        </div>
      </div>
    </section>
  )
}
