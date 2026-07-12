'use client'

import { useState } from 'react'
import { Activity } from 'lucide-react'
import { AppLayout } from '@/components/layout/app-layout'
import { Timeline } from '@/components/feed-operacional/Timeline'
import { FeedFilters } from '@/components/feed-operacional/FeedFilters'
import type {
  FeedEventTypeValue,
  FeedSeverityValue,
  FeedSourceValue,
} from '@/types/operational-feed'

export default function FeedOperacionalPage() {
  const [severity, setSeverity] = useState<FeedSeverityValue[]>([])
  const [source, setSource] = useState<FeedSourceValue[]>([])
  const [eventType, setEventType] = useState<FeedEventTypeValue[]>([])

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto p-6">
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Activity size={18} className="text-zinc-300" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-zinc-100">Feed Operacional</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Timeline de eventos, alertas, diagnósticos IA e oportunidades — gerados pelo
                Health Engine, CS Engine e integrações externas.
              </p>
            </div>
          </div>
        </header>

        <FeedFilters
          severity={severity}
          source={source}
          eventType={eventType}
          onSeverityChange={setSeverity}
          onSourceChange={setSource}
          onEventTypeChange={setEventType}
          onClear={() => {
            setSeverity([])
            setSource([])
            setEventType([])
          }}
        />

        <Timeline severity={severity} source={source} eventType={eventType} />
      </div>
    </AppLayout>
  )
}
