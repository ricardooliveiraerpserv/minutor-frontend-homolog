'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { api } from '@/lib/api'
import { HelpCircle } from 'lucide-react'
import { NovoChamadoModal, type NovoChamadoMeta } from './novo-chamado-modal'
import { AbrirChamadoModal } from './abrir-chamado-modal'

interface Ref { id: number; name: string }

/**
 * Aba flutuante GLOBAL "Preciso de ajuda?" — fixa na borda direita (parte de baixo),
 * presente em todas as telas. Ao clicar, abre a abertura de chamado num painel lateral.
 * Interno (agente) → NovoChamadoModal. Cliente → AbrirChamadoModal (fluxo do portal),
 * com seletor de empresa quando o cliente pode abrir em mais de uma (ERPSERV/BIZIFY).
 */
export function HelpFloatingTab() {
  const { user } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [meta, setMeta] = useState<NovoChamadoMeta | null>(null)
  const [customers, setCustomers] = useState<Ref[]>([])
  const [companies, setCompanies] = useState<{ id: number; name: string }[]>([])

  const isCliente = user?.type === 'cliente'

  // Cliente: carrega as empresas permitidas (para o seletor de empresa do chamado).
  useEffect(() => {
    if (!isCliente) return
    api.get<{ data: { companies?: { id: number; name: string }[] } }>('/help-desk/portal/permissions')
      .then(r => setCompanies(r?.data?.companies ?? [])).catch(() => {})
  }, [isCliente])

  if (!user) return null

  const abrir = () => {
    setOpen(true)
    if (isCliente) return // cliente usa AbrirChamadoModal (carrega permissions sozinho)
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

      {open && (isCliente ? (
        <AbrirChamadoModal
          variant="drawer"
          companies={companies}
          onClose={() => setOpen(false)}
          onCreated={(id) => { setOpen(false); router.push(`/help-desk/portal?ticket=${id}`) }}
        />
      ) : (
        <NovoChamadoModal
          meta={meta}
          customers={customers}
          variant="drawer"
          heading="Preciso de ajuda? Abra um chamado"
          onClose={() => setOpen(false)}
          onCreated={(id) => { setOpen(false); router.push(`/help-desk/tickets/${id}`) }}
        />
      ))}
    </>
  )
}
