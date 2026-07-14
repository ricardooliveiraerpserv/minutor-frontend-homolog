'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useModules } from '@/contexts/module-context'
import { moduleColorByIndex } from '@/lib/module-color'
import { Building2 } from 'lucide-react'

interface CompanyItem { id: number; name: string; color: string | null; active: boolean }

/**
 * Faixa de contexto: deixa EVIDENTE a empresa ativa (selo na cor da empresa) e o
 * módulo atual (faixa colorida por módulo). Ao trocar de empresa ou de módulo, a
 * cor muda — a diferença é sentida na hora.
 */
export function ContextBar() {
  const { selectedModule, modules } = useModules()
  const { data } = useQuery({
    queryKey: ['my-companies'],
    queryFn: () => api.get<{ data: CompanyItem[] }>('/my-companies'),
    staleTime: 60_000,
  })

  const company = data?.data?.find(c => c.active) ?? data?.data?.[0]
  const modIndex = modules.findIndex(m => m.key === selectedModule)
  const mod = modIndex >= 0 ? modules[modIndex] : undefined
  const modColor = moduleColorByIndex(modIndex >= 0 ? modIndex : 0)
  const companyColor = company?.color || '#64748b'

  if (!company && !mod) return null

  return (
    <div
      className="shrink-0 flex items-center gap-3 px-4 md:px-6 h-11"
      style={{
        borderTop: `4px solid ${modColor}`,
        background: `linear-gradient(90deg, ${modColor}2e 0%, ${modColor}12 45%, transparent 100%)`,
      }}
    >
      {company && (
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-extrabold uppercase tracking-wide shadow-sm"
          style={{ background: companyColor, color: '#fff' }}
        >
          <Building2 size={15} /> {company.name}
        </span>
      )}
      {mod && (
        <span
          className="inline-flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-bold uppercase tracking-wide"
          style={{ background: `${modColor}26`, color: modColor }}
        >
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: modColor }} />
          {mod.label}
        </span>
      )}
    </div>
  )
}
