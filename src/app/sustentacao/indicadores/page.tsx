'use client'

// Tela independente de Indicadores da Sustentação = TODAS as abas analíticas
// (Status de Suporte, Visão Executiva, Fila Operacional, Indicadores, SLA,
// Produtividade, Financeiro, Por Cliente, Distribuição, Evolução, Diagnóstico).
import { SustentacaoWorkspace } from '@/components/sustentacao/sustentacao-workspace'

export default function IndicadoresSustentacaoPage() {
  return <SustentacaoWorkspace show="indicadores" />
}
