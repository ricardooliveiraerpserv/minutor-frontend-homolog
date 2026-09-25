'use client'

// Prosight — Visão Geral EXECUTIVA (C3). O painel consolidado dos domínios
// (Fontes/Qualidade + Operação/Ambientes/Atividade + Licenciamento) vive na
// VisaoGeralExecutivaView. Permission-aware e resiliente por domínio; 100%
// fixtures (nenhuma chamada live). O AppLayout + shell vêm do layout do /prosight.

import { VisaoGeralExecutivaView } from '../_components/visao-geral-view'

export default function ProsightVisaoGeralPage() {
  return <VisaoGeralExecutivaView />
}
