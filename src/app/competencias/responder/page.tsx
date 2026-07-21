'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader } from '@/components/ui/loading'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { ClipboardList, ChevronRight, CheckCircle2 } from 'lucide-react'

interface MySurvey {
  survey_id: number; title: string; description: string | null
  deadline: string | null; status: string; submitted_at: string | null
}

export default function ResponderPage() {
  const [surveys, setSurveys] = useState<MySurvey[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ surveys: MySurvey[] }>('/competencias/minhas-pesquisas')
      .then(r => setSurveys(r.surveys ?? []))
      .catch(() => toast.error('Erro ao carregar suas pesquisas'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <AppLayout title="Minhas Pesquisas de Competências">
      <div className="space-y-4">
        {loading && <div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div>}

        {!loading && surveys.length === 0 && (
          <div className="ds-card ds-card-pad">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Você não tem pesquisas pendentes no momento.</p>
          </div>
        )}

        {!loading && surveys.map(s => {
          const done = s.status === 'submitted'
          return (
            <Link key={s.survey_id} href={done ? '#' : `/competencias/responder/${s.survey_id}`}
              className="block ds-card ds-card-pad ds-row-hover" style={{ textDecoration: 'none', opacity: done ? 0.7 : 1 }}
              onClick={e => { if (done) e.preventDefault() }}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {done ? <CheckCircle2 size={18} style={{ color: 'var(--success)' }} /> : <ClipboardList size={18} style={{ color: 'var(--primary)' }} />}
                  <div>
                    <div className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>{s.title}</div>
                    {s.description && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.description}</div>}
                    <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>
                      {done ? 'Respondida ✓' : s.deadline ? `Prazo: ${s.deadline}` : 'Aberta'}
                    </div>
                  </div>
                </div>
                {!done && <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />}
              </div>
            </Link>
          )
        })}
      </div>
    </AppLayout>
  )
}
