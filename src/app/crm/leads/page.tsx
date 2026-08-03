'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { LeadsBoard } from '@/components/crm/leads-board'

// Rota /crm/leads mantida para deep-links. O menu passou a acessar Leads pelo
// seletor de pipeline em /crm/pipeline (Leads = pipeline de qualificação).
export default function CrmLeadsPage() {
  return (
    <AppLayout title="Leads (CRM)">
      <LeadsBoard />
    </AppLayout>
  )
}
