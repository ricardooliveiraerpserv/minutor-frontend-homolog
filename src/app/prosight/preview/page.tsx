'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DEV-ONLY — harness de preview para captura de screenshots das VIEWs do Prosight
// SEM o AppLayout (contorna o gate de auth). NÃO está na navegação/sidebar; só
// mostra FIXTURES (nenhum dado real). Seleção: ?view=inventario|licenciamento|configuracao
// Estados de fixture continuam por ?fx=empty|error|loading (lido pelo datasource).
// Visão Geral EXECUTIVA (C3): ?view=visao-geral com &role=admin|coordenador|operador
// (perfil de permissão simulado) e &err=fontes|operacao (força o erro de UM domínio
// p/ provar a resiliência da página). Tudo DEV-only, 100% fixtures.
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { InventarioView } from '../_components/inventario-view'
import { LicenciamentoView } from '../_components/licenciamento-view'
import { ConfiguracaoView } from '../_components/configuracao-view'
import { VisaoGeralExecutivaView } from '../_components/visao-geral-view'
import { AtividadeView } from '../_components/atividade-view'

function PreviewInner() {
  const sp = useSearchParams()
  const view = sp.get('view') ?? 'inventario'
  const filter = (sp.get('filter') ?? 'all') as never
  const query = sp.get('q') ?? ''
  const customs = sp.get('customs') === '1'
  // Dev-only: força a empresa (sem /my-companies no harness) p/ capturar 2 empresas.
  const companyParam = sp.get('company')
  const previewCompanyId = companyParam != null ? Number(companyParam) : null
  const role = (sp.get('role') ?? 'admin') as 'admin' | 'coordenador' | 'operador'
  const err = sp.get('err') as 'fontes' | 'operacao' | null
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        {view === 'atividade' ? <AtividadeView previewRole={role} />
          : view === 'visao-geral' ? <VisaoGeralExecutivaView previewRole={role} previewCompanyId={previewCompanyId ?? 1} previewForceError={err} />
          : view === 'licenciamento' ? <LicenciamentoView autoLoadCustoms={customs} previewCompanyId={previewCompanyId} />
          : view === 'configuracao' ? <ConfiguracaoView demoAdmin />
          : <InventarioView initialFilter={filter} initialQuery={query} previewCompanyId={previewCompanyId} />}
      </div>
    </div>
  )
}

export default function ProsightPreviewPage() {
  return <Suspense fallback={null}><PreviewInner /></Suspense>
}
