'use client'

import { useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { OportunidadeDetalhe } from '@/components/crm/oportunidade-detalhe'

export default function OportunidadeDetalhePage() {
  const params = useParams<{ id: string }>()
  return (
    <AppLayout title="Oportunidade">
      <OportunidadeDetalhe id={Number(params.id)} />
    </AppLayout>
  )
}
