'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Building2, Calculator } from 'lucide-react'
import { CostCentersManager, portalCostCenterEndpoints } from '@/components/customers/cost-centers-modal'
import { RateioTab } from '@/components/projects/project-view-modal'

interface MyProject { id: number; code: string | null; name: string }

export default function PortalCentrosCustoPage() {
  const [projects, setProjects] = useState<MyProject[]>([])
  const [projectId, setProjectId] = useState<number | ''>('')

  useEffect(() => {
    api.get<{ data: MyProject[] }>('/client/portal/my-projects')
      .then(r => setProjects(r.data ?? []))
      .catch(() => {})
  }, [])

  return (
    <AppLayout title="Centros de Custo">
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        {/* Cadastro dos centros de custo do cliente */}
        <section className="rounded-2xl p-4 md:p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={16} style={{ color: 'var(--primary)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Meus Centros de Custo</h2>
          </div>
          <CostCentersManager endpoints={portalCostCenterEndpoints} canEdit />
        </section>

        {/* Rateio por projeto */}
        <section className="rounded-2xl p-4 md:p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Calculator size={16} style={{ color: 'var(--primary)' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Rateio por Projeto</h2>
            </div>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value ? Number(e.target.value) : '')}
              className="text-sm rounded-lg px-2.5 py-1.5 outline-none max-w-[280px]"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
            >
              <option value="">Selecione um projeto…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.code ? `${p.code} · ` : ''}{p.name}</option>)}
            </select>
          </div>

          {projectId === '' ? (
            <div className="text-center py-8 text-sm rounded-xl" style={{ color: 'var(--text-muted)', border: '1px dashed var(--border)' }}>
              Escolha um projeto para distribuir o rateio entre seus centros de custo.
            </div>
          ) : (
            <RateioTab key={projectId} projectId={projectId} canEdit pathPrefix="/client/portal/projects" />
          )}
        </section>
      </div>
    </AppLayout>
  )
}
