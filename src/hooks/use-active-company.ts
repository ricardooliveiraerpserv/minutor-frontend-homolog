'use client'

import { useApiQuery } from './use-query'

interface CompanyItem { id: number; slug: string; name?: string; active: boolean }

/**
 * Empresa ATIVA do usuário (multi-empresa). Base para telas que precisam variar
 * comportamento por empresa logada — ex.: filtrar pelo executivo Bizify quando Bizify.
 */
export function useActiveCompany() {
  const { data } = useApiQuery<{ data: CompanyItem[] }>('/my-companies')
  const active = data?.data?.find(c => c.active) ?? null
  return { active, isBizify: active?.slug === 'bizify' }
}
