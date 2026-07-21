'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader } from '@/components/ui/loading'
import { SkillMatrixWizard, type WizardData, type AutosavePayload } from '@/components/competencias/matrix-wizard'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

interface Payload {
  survey: { id: number; type: string; title: string; description: string | null; deadline: string | null }
  cadastral_schema: WizardData['cadastralSchema']
  cadastral: Record<string, unknown>
  matrix: WizardData['matrix'] & { version: { number: number } }
  submission: { id: number; status: string; progress: { current_step?: number } | null; answers: { item_id: number; level_id: number | null }[] }
}

export default function ResponderWizardPage() {
  const params = useParams()
  const router = useRouter()
  const surveyId = Number(params?.surveyId)

  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [alreadyDone, setAlreadyDone] = useState(false)
  const submissionIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!surveyId) return
    api.get<Payload>(`/competencias/surveys/${surveyId}/responder`)
      .then(p => {
        setData(p)
        submissionIdRef.current = p.submission.id
        if (p.submission.status === 'submitted') setAlreadyDone(true)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Não foi possível abrir a pesquisa.'))
      .finally(() => setLoading(false))
  }, [surveyId])

  if (loading) return <AppLayout title="Pesquisa de Competências"><div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div></AppLayout>
  if (error || !data) return (
    <AppLayout title="Pesquisa de Competências">
      <div className="ds-card ds-card-pad ds-card-highlight-danger flex items-center gap-2">
        <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
        <p className="text-sm" style={{ color: 'var(--text)' }}>{error ?? 'Pesquisa indisponível.'}</p>
      </div>
    </AppLayout>
  )
  if (alreadyDone) return (
    <AppLayout title={data.survey.title}>
      <div className="ds-card ds-card-pad ds-card-highlight-success text-center" style={{ padding: 40 }}>
        <CheckCircle2 size={44} style={{ color: 'var(--success)', margin: '0 auto 12px' }} />
        <h2 className="text-lg" style={{ fontWeight: 700, color: 'var(--text)' }}>Avaliação já enviada</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Suas respostas foram registradas.</p>
        <button className="ds-btn-primary mt-4" onClick={() => router.push('/competencias/responder')}>Voltar</button>
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
