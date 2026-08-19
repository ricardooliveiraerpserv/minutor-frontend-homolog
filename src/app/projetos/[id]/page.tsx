'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'

export default function ProjectIndexPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()

  useEffect(() => {
    // Consultor tem UMA tela unificada (Operação/cronograma); demais perfis abrem na Visão Geral.
    const dest = user?.type === 'consultor' ? 'cronograma' : 'visao-geral'
    router.replace(`/projetos/${params.id}/${dest}`)
  }, [params.id, router, user?.type])

  return null
}
