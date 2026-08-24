'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DEV-ONLY — harness de preview p/ captura de screenshots das VIEWs de Operações
// Protheus SEM o AppLayout (contorna o gate de auth). NÃO está na navegação; só
// mostra FIXTURES. Seleção:
//   ?view=visao-geral|fontes|mudancas|auditoria|configuracao
//   ?env=jng-prod|jng-hom|jng-dev     (força o ambiente)
//   ?fx=empty|error|loading|unconfigured   (lido internamente pelo datasource)
//   ?opfx=partial|fail                (variante das operações, p/ capturar resultado)
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { OperacoesProvider } from '../_components/operacoes-context'
import { VisaoGeralView } from '../_components/visao-geral-view'
import { FontesView } from '../_components/fontes-view'
import { MudancasView } from '../_components/mudancas-view'
import { AuditoriaView } from '../_components/auditoria-view'
import { ConfiguracaoView } from '../_components/configuracao-view'

function PreviewInner() {
  const sp = useSearchParams()
  const view = sp.get('view') ?? 'visao-geral'
  const env = sp.get('env') ?? 'jng-hom'
  const op = sp.get('op')
  const filter = (sp.get('filter') ?? 'all') as 'all' | 'sincronizado' | 'disco_mais_novo' | 'apenas_disco' | 'apenas_rpo'
  const query = sp.get('q') ?? ''

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <OperacoesProvider forcedEnvironmentId={env}>
          {view === 'fontes' ? <FontesView previewEnvironmentId={env} initialFilter={filter} initialQuery={query} />
            : view === 'mudancas' ? <MudancasView previewEnvironmentId={env} />
            : view === 'auditoria' ? <AuditoriaView previewEnvironmentId={env} demoAdmin />
            : view === 'configuracao' ? <ConfiguracaoView previewEnvironmentId={env} demoAdmin />
            : <VisaoGeralView previewEnvironmentId={env} demoAdmin autoOp={op} />}
        </OperacoesProvider>
      </div>
    </div>
  )
}

export default function OperacoesPreviewPage() {
  return <Suspense fallback={null}><PreviewInner /></Suspense>
}
