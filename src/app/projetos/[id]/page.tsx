'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function ProjectIndexPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  useEffect(() => {
    // Tela principal do projeto = ambiente de gestão (cronograma: header denso +
    // badges + abas Planejamento/Linha do Tempo/Operação), não a antiga Visão Geral.
    router.replace(`/projetos/${params.id}/cronograma`)
  }, [params.id, router])

  return null
}
