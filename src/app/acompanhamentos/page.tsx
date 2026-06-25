'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { FollowUpsBoard } from '@/components/follow-ups/follow-ups-board'
import { ListChecks } from 'lucide-react'

/**
 * Central de Acompanhamentos — visão global administrativa (coordenador/gestor).
 * Todos os acompanhamentos abertos com pendências por responsável, cliente e
 * vencimento. O escopo de visibilidade é por perfil (FollowUpController::scope):
 * admin vê tudo; coordenador vê os projetos que coordena + os seus.
 */
export default function CentralAcompanhamentosPage() {
  return (
    <AppLayout>
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <ListChecks size={20} /> Central de Acompanhamentos
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 16px' }}>
          Visão global dos compromissos abertos do projeto — pendências por responsável, cliente e vencimento. Use a busca para filtrar por responsável ou cliente.
        </p>
        <FollowUpsBoard requireCompany />
      </div>
    </AppLayout>
  )
}
