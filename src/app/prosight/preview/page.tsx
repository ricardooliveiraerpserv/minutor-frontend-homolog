'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DEV-ONLY — harness de preview para captura de screenshots das VIEWs do Prosight
// SEM o AppLayout (contorna o gate de auth). NÃO está na navegação/sidebar; só
// mostra FIXTURES (nenhum dado real). Seleção: ?view=inventario|licenciamento|configuracao
// Estados de fixture continuam por ?fx=empty|error|loading (lido pelo datasource).
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { InventarioView } from '../_components/inventario-view'
import { LicenciamentoView } from '../_components/licenciamento-view'
import { ConfiguracaoView } from '../_components/configuracao-view'

function PreviewInner() {
  const sp = useSearchParams()
  const view = sp.get('view') ?? 'inventario'
  const filter = (sp.get('filter') ?? 'all') as never
  const query = sp.get('q') ?? ''
  const customs = sp.get('customs') === '1'
  // Dev-only: força a empresa (sem /my-companies no harness) p/ capturar 2 empresas.
  const companyParam = sp.get('company')
  const previewCompanyId = companyParam != null ? Number(companyParam) : null
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        {view === 'licenciamento' ? <LicenciamentoView autoLoadCustoms={customs} previewCompanyId={previewCompanyId} />
          : view === 'configuracao' ? <ConfiguracaoView demoAdmin />
          : <InventarioView initialFilter={filter} initialQuery={query} previewCompanyId={previewCompanyId} />}
      </div>
    </div>
  )
}

export default function ProsightPreviewPage() {
  return <Suspense fallback={null}><PreviewInner /></Suspense>
}
