'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Central de Fontes — contexto/seletor de EMPRESA na casca do Prosight.
// Exceção pontual ao Frontend Freeze, autorizada pelo Ricardo (2026-08-25):
// a Central de Fontes deve abrir DIRETO na tela da empresa selecionada (sem o
// passo "Acervo por empresa"). Usa CLIENTES REAIS (/source-docs/tree/customers) —
// NÃO o seletor fixture de demonstração (Alfa/Beta) dos outros domínios do Prosight.
// A empresa escolhida navega para /central-fontes/acervo?customer_id=X (a tela do
// cliente). "Todas as empresas" volta ao catálogo. Seleção persistida (localStorage).
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, Suspense, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/ds'
import { api } from '@/lib/api'

interface FontesCustomer { customer_id: number; name: string; fontes: number }
interface Ctx {
  customers: FontesCustomer[]
  selectedId: number | null
  setSelectedId: (id: number | null) => void
}

const FontesCompanyContext = createContext<Ctx | null>(null)
const LS_KEY = 'fontes_company'

function readPersisted(): number | null {
  if (typeof window === 'undefined') return null
  const v = window.localStorage.getItem(LS_KEY)
  return v ? Number(v) : null
}

export function FontesCompanyProvider({ children }: { children: ReactNode }) {
  const [customers, setCustomers] = useState<FontesCustomer[]>([])
  // init síncrono (evita flash do catálogo antes de redirecionar p/ a empresa).
  const [selectedId, setSelectedIdState] = useState<number | null>(readPersisted)

  const setSelectedId = (id: number | null) => {
    setSelectedIdState(id)
    if (typeof window === 'undefined') return
    if (id) window.localStorage.setItem(LS_KEY, String(id))
    else window.localStorage.removeItem(LS_KEY)
  }

  useEffect(() => {
    api.get<{ data: FontesCustomer[] }>('/source-docs/tree/customers?include_empty=1')
      .then((r) => setCustomers(r.data)).catch(() => setCustomers([]))
  }, [])

  return (
    <FontesCompanyContext.Provider value={{ customers, selectedId, setSelectedId }}>
      {children}
    </FontesCompanyContext.Provider>
  )
}

export function useFontesCompany(): Ctx {
  const c = useContext(FontesCompanyContext)
  return c ?? { customers: [], selectedId: null, setSelectedId: () => {} }
}

function FontesCompanySelectInner() {
  const { customers, selectedId, setSelectedId } = useFontesCompany()
  const router = useRouter()
  const sp = useSearchParams()
  const urlCustomer = sp?.get('customer_id') ? Number(sp.get('customer_id')) : null

  // Sincroniza o seletor com a empresa aberta no Acervo (?customer_id) — ex.: deep-link,
  // clique na árvore, "Mostrar no Acervo".
  useEffect(() => {
    if (urlCustomer && urlCustomer !== selectedId) setSelectedId(urlCustomer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCustomer])

  if (customers.length === 0) return null
  const value = urlCustomer ?? selectedId ?? ''
  const onChange = (raw: string) => {
    const id = raw ? Number(raw) : null
    setSelectedId(id)
    if (id) router.push(`/central-fontes/acervo?customer_id=${id}`)
    else router.push('/central-fontes')
  }
  return (
    <Select value={String(value)} onChange={(e) => onChange(e.target.value)} className="w-52 max-w-full">
      <option value="">Todas as empresas</option>
      {customers.map((c) => <option key={c.customer_id} value={c.customer_id}>{c.name}</option>)}
    </Select>
  )
}

export function FontesCompanySelect() {
  return <Suspense fallback={null}><FontesCompanySelectInner /></Suspense>
}
