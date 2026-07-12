'use client'

import { AlertOctagon, AlertTriangle, Info } from 'lucide-react'
import type { SeverityBreakdown } from '@/types/inbox'

interface SeveritySummaryProps {
  bySeverity: SeverityBreakdown | undefined
}

export function SeveritySummary({ bySeverity }: SeveritySummaryProps) {
  const critical = bySeverity?.critical ?? 0
  const high     = bySeverity?.high ?? 0
  const medium   = bySeverity?.medium ?? 0
  const low      = bySeverity?.low ?? 0
  const info     = bySeverity?.info ?? 0

  const items = [
    {
      key: 'critical',
      label: 'críticas',
      count: critical + high, // pra UX, agrupa "Alto/Crítico" como "críticas"
      Icon: AlertOctagon,
      ring: 'ring-red-500/30',
      bg: 'bg-red-500/10',
      text: 'text-red-300',
      number: 'text-red-200',
    },
    {
      key: 'attention',
      label: 'atenção',
      count: medium,
      Icon: AlertTriangle,
      ring: 'ring-amber-500/30',
      bg: 'bg-amber-500/10',
      text: 'text-amber-300',
      number: 'text-amber-200',
    },
    {
      key: 'info',
      label: 'informativas',
      count: low + info,
      Icon: Info,
      ring: 'ring-blue-500/30',
      bg: 'bg-blue-500/10',
      text: 'text-blue-300',
      number: 'text-blue-200',
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-3 px-5 py-4 border-b border-zinc-800 bg-gradient-to-b from-zinc-950 to-zinc-950/80">
      {items.map(it => (
        <div
          key={it.key}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-md ${it.bg} ring-1 ${it.ring}`}
        >
          <it.Icon className={it.text} size={18} />
          <div className="leading-tight">
            <div className={`text-xl font-bold tabular-nums ${it.number}`}>{it.count}</div>
            <div className={`text-[10px] uppercase tracking-wider ${it.text}`}>{it.label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
