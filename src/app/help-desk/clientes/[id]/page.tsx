'use client'

import { useParams, useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { Customer360Panel } from '@/components/help-desk/customer-360-panel'
import { ArrowLeft, Ticket } from 'lucide-react'

/** Customer 360 do Help Desk SEM chamado — destino do "Abrir Customer 360" da Central de Operações. */
export default function HelpDeskCliente360Page() {
  const params = useParams()
  const router = useRouter()
  const customerId = Number(params?.id)

  return (
    <AppLayout title="Customer 360">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft size={15} /> Voltar
          </button>
          <button onClick={() => router.push(`/help-desk/tickets?customer_id=${customerId}`)} className="ds-btn-secondary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg">
            <Ticket size={15} /> Ver chamados do cliente
          </button>
        </div>
        {Number.isFinite(customerId) && <Customer360Panel customerId={customerId} />}
      </div>
    </AppLayout>
  )
}
