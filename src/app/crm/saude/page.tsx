'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Saúde da Conta foi UNIFICADA na Minha Carteira. Mantido só como redirect
// para não quebrar links/bookmarks antigos.
export default function SaudeRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/crm/minha-carteira') }, [router])
  return null
}
