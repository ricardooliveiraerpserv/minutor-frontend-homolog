'use client'

// Central de Fontes — F0 · Acervo (placeholder). O explorador Empresa → Repositório →
// Diretório Git → Fonte chega na F2 (árvore lazy + conteúdo de pasta). Aqui já existe a
// aba e a casca; a estrutura de navegação real é construída nas próximas fases.

import { FolderTree } from 'lucide-react'
import { PageHeader } from '@/components/ds'

export default function AcervoPage() {
  return (
    <>
      <PageHeader
        icon={FolderTree}
        title="Acervo"
        subtitle="Navegação por Empresa → Repositório → Diretório Git → Fonte."
      />
      <div className="rounded-lg border border-dashed border-[var(--border,#e2e8f0)] p-10 text-center text-sm text-[var(--muted-fg,#64748b)]">
        O explorador do acervo (árvore <strong>Empresa → Repositório → Diretório → Fonte</strong> com
        painel de conteúdo) será construído na fase F2. A casca unificada e as abas já estão no ar.
      </div>
    </>
  )
}
