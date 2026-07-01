import { permanentRedirect } from 'next/navigation'

export default async function PlanejamentoRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  permanentRedirect(`/projetos/${id}/cronograma?view=planejamento`)
}
