'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { CentralReunioes } from '@/components/meetings/central-reunioes'

// Central de Reuniões — página dedicada. O conteúdo vive em <CentralReunioes/> (reusado como aba no Meu Dia).
export default function ReunioesPage() {
  return (
    <AppLayout title="Central de Reuniões">
      <div className="max-w-6xl mx-auto p-4">
        <CentralReunioes />
      </div>
    </AppLayout>
  )
}
