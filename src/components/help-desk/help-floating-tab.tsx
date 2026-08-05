'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { api } from '@/lib/api'
import { HelpCircle } from 'lucide-react'
import { NovoChamadoModal, type NovoChamadoMeta } from './novo-chamado-modal'

interface Ref { id: number; name: string }

/**
 * Aba flutuante GLOBAL "Preciso de ajuda?" — fixa na borda direita (parte de baixo),
 * presente em todas as telas. Ao clicar, abre o formulário de abertura de chamado num
 * painel lateral (drawer) deslizando da direita. Carrega meta/clientes sob demanda.
 */
export function HelpFloatingTab() {
  const { user } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [meta, setMeta] = useState<NovoChamadoMeta | null>(null)
  const [customers, setCustomers] = useState<Ref[]>([])

  // Só para usuários internos (o formulário é a abertura de chamado do agente).
  if (!user || user.type === 'cliente') return null

  const abrir = () => {
    setOpen(true)
    if (!meta) {
      api.get<{ data: NovoChamadoMeta }>('/help-desk/meta').then(r => { if (r?.data) setMeta(r.data) }).catch(() => {})
    }
    if (customers.length === 0) {
      api.get<Ref[] | { data?: Ref[]; items?: Ref[] }>('/customers?pageSize=500')
        .then(r => {
          const list = Array.isArray(r) ? r : (r?.data ?? r?.items ?? [])
          setCustomers(list.map(c => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)))
        })
        .catch(() => {})
    }
  }

  return (
    <>
      <button
        onClick={abrir}
        title="Preciso de ajuda? Abrir um chamado"
        aria-label="Abrir um chamado"
        className="fixed right-0 bottom-24 z-40 flex flex-col items-center gap-2 rounded-l-2xl shadow-lg px-2.5 py-4 transition-all hover:px-3.5 hover:shadow-xl"
        style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
      >
        <HelpCircle size={18} className="shrink-0" />
        <span className="text-sm font-semibold tracking-wide" style={{ writingMode: 'vertical-rl' }}>Preciso de ajuda?</span>
      </button>

      {open && (
        <NovoChamadoModal
          meta={meta}
          customers={customers}
          variant="drawer"
          heading="Preciso de ajuda? Abra um chamado"
          onClose={() => setOpen(false)}
          onCreated={(id) => { setOpen(false); router.push(`/help-desk/tickets/${id}`) }}
        />
      )}
    </>
  )
}
