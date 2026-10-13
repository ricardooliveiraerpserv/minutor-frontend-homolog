'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { FaturamentoOnDemandPanel } from '@/components/on-demand/faturamento-on-demand-panel'

export default function FaturamentoOnDemandPage() {
  return (
    <AppLayout>
      <div className="p-6">
        <FaturamentoOnDemandPanel />
      </div>
    </AppLayout>
  )
}
