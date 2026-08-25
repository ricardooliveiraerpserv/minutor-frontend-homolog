'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader } from '@/components/ui/loading'
import { SkillMatrixWizard, type WizardData, type AutosavePayload } from '@/components/competencias/matrix-wizard'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { AlertTriangle } from 'lucide-react'

interface Payload {
  survey: { id: number; type: string; title: string; description: string | null; deadline: string | null }
  cadastral_schema: WizardData['cadastralSchema']
  cadastral: Record<string, unknown>
  matrix: WizardData['matrix'] & { version: { number: number } }
  submission: { id: number; status: string; progress: { current_step?: number } | null; answers: { item_id: number; level_id: number | null }[] }
}

export default function AutoAvaliacaoPage() {
  const router = useRouter()
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const submissionIdRef = useRef<number | null>(null)

  useEffect(() => {
    api.post<Payload>('/competencias/auto-avaliacao', {})
      .then(p => { setData(p); submissionIdRef.current = p.submission.id })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Não foi possível abrir a auto-avaliação.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <AppLayout title="Atualizar minhas competências"><div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div></AppLayout>
  if (error || !data) return (
    <AppLayout title="Atualizar minhas competências">
      <div className="ds-card ds-card-pad ds-card-highlight-danger flex items-center gap-2">
        <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
        <p className="text-sm" style={{ color: 'var(--text)' }}>{error ?? 'Indisponível.'}</p>
      </div>
    </AppLayout>
  )

  const answers: Record<number, number> = {}
  data.submission.answers.forEach(a => { if (a.level_id) answers[a.item_id] = a.level_id })

  const wizardData: WizardData = {
    title: data.survey.title,
    description: data.survey.description,
    cadastralSchema: data.cadastral_schema,
    cadastral: data.cadastral ?? {},
    matrix: data.matrix,
    answers,
    initialStep: data.submission.progress?.current_step ?? 0,
  }

  return (
    <AppLayout title={data.survey.title}>
      <SkillMatrixWizard
        data={wizardData}
        onAutosave={(payload: AutosavePayload) => api.patch(`/competencias/submissions/${submissionIdRef.current}/autosave`, payload).then(() => undefined)}
        onSubmit={() => api.post(`/competencias/submissions/${submissionIdRef.current}/submit`, {}).then(() => undefined)}
        onDone={() => router.push('/competencias/responder')}
      />
    </AppLayout>
  )
}
