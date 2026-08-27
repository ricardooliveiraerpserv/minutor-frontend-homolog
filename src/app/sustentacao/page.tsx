'use client'

// Portal de Sustentação = Central de Lançamentos (rotinas operacionais).
// Os indicadores/abas analíticas ficam na tela separada /sustentacao/indicadores.
import { SustentacaoWorkspace } from '@/components/sustentacao/sustentacao-workspace'

export default function SustentacaoPortalPage() {
  return <SustentacaoWorkspace show="central" />
}
