'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Prosight — contexto GLOBAL de EMPRESA (escopo do módulo). UMA chave só, no topo
// da casca, comum a todos os domínios do Prosight. Fonte da lista = EMPRESAS REAIS
// (/source-docs/tree/customers) — os mesmos clientes da Central de Fontes.
//
// Ao selecionar uma empresa aqui, a Central de Fontes ACATA (abre direto na empresa).
// Os domínios ainda em fixture (Inventário/Licenciamento) recebem o companyId real e
// derivam um perfil de demonstração determinístico (companySeed = id % 4) — sem quebrar.
// Operações mantém o próprio seletor (empresa × ambiente, eixo diferente).
//
// "Todas as empresas" = companyId null (Central de Fontes mostra o catálogo; fixtures
// caem no perfil 0). Seleção PERSISTIDA (localStorage) e compartilhada entre as cascas
// do Prosight e da Central de Fontes (que são árvores de layout distintas).
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Building2, ServerCog, ChevronDown, Search, Check } from 'lucide-react'
import { Card, EmptyState } from '@/components/ds'
import { api } from '@/lib/api'

export interface ProsightCompany { id: number; name: string }

interface Ctx {
  companyId: number | null
  companyName: string | null
  companies: ProsightCompany[]
  setCompanyId: (id: number | null) => void
}

const ProsightCompanyContext = createContext<Ctx | null>(null)
const LS_KEY = 'prosight_company'

function readPersisted(): number | null {
  if (typeof window === 'undefined') return null
  const v = window.localStorage.getItem(LS_KEY)
  return v ? Number(v) : null
}

export function ProsightCompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<ProsightCompany[]>([])
  // init síncrono da seleção persistida (evita flash antes de escopar/redirecionar).
  const [companyId, setCompanyIdState] = useState<number | null>(readPersisted)

  const setCompanyId = (id: number | null) => {
    setCompanyIdState(id)
    if (typeof window === 'undefined') return
    if (id != null) window.localStorage.setItem(LS_KEY, String(id))
    else window.localStorage.removeItem(LS_KEY)
  }

  // Empresas REAIS (clientes) — a mesma fonte da Central de Fontes.
  useEffect(() => {
    api.get<{ data: { customer_id: number; name: string }[] }>('/source-docs/tree/customers?include_empty=1')
      .then((r) => setCompanies(r.data.map((c) => ({ id: c.customer_id, name: c.name }))))
      .catch(() => setCompanies([]))
  }, [])

  const companyName = companies.find((c) => c.id === companyId)?.name ?? null

  return (
    <ProsightCompanyContext.Provider value={{ companyId, companyName, companies, setCompanyId }}>
      {children}
    </ProsightCompanyContext.Provider>
  )
}

/** Retorna o contexto de empresa do Prosight, ou null fora do provider (ex.: harness). */
export function useProsightCompany(): Ctx | null {
  return useContext(ProsightCompanyContext)
}

// ─────────────────────────────────────────────────────────────────────────────
// DEMONSTRAÇÃO (fixtures) — política de exibição. Enquanto o Prosight não conecta
// à infraestrutura real, dados de demonstração só aparecem para a empresa INTERNA
// (ERPSERV). Nas demais empresas NÃO se exibe fixture: ou há dado real conectado,
// ou o estado honesto "não conectado" (ProsightNotConnected). Nunca número fake.
// ─────────────────────────────────────────────────────────────────────────────
export function isProsightDemoCompany(name: string | null | undefined): boolean {
  return (name ?? '').trim().toUpperCase() === 'ERPSERV'
}

/** Estado honesto para empresas sem conexão real (nenhum dado de demonstração exibido). */
export function ProsightNotConnected({ companyName }: { companyName?: string | null }) {
  return (
    <Card>
      <EmptyState
        icon={ServerCog}
        title="Prosight não conectado a esta empresa"
        description={`O Prosight ainda não está conectado à infraestrutura real${companyName ? ` de ${companyName}` : ''}. Fora da ERPSERV, nenhum dado de demonstração é exibido — os indicadores aparecem quando a conexão real estiver ativa.`}
      />
    </Card>
  )
}

/** Seletor GLOBAL de empresa — vive na casca do Prosight (ao lado das abas). */
/** Seletor de empresa com BUSCA por texto (combobox) — a lista de clientes é grande. */
export function ProsightCompanySelect() {
  const ctx = useProsightCompany()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    setTimeout(() => inputRef.current?.focus(), 0)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  if (!ctx || ctx.companies.length === 0) return null
  const current = ctx.companyId != null ? (ctx.companies.find((c) => c.id === ctx.companyId)?.name ?? '—') : 'Todas as empresas'
  const q = query.trim().toLowerCase()
  const filtered = q ? ctx.companies.filter((c) => c.name.toLowerCase().includes(q)) : ctx.companies

  const pick = (id: number | null) => { ctx.setCompanyId(id); setOpen(false); setQuery('') }

  return (
    <div className="relative" ref={boxRef}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
        <Building2 size={15} style={{ color: 'var(--text-muted)' }} />
        <span className="max-w-[220px] truncate">{current}</span>
        <ChevronDown size={15} style={{ color: 'var(--text-light)' }} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-72 rounded-xl overflow-hidden shadow-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <Search size={14} style={{ color: 'var(--text-light)' }} />
            <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar empresa…"
              className="flex-1 bg-transparent text-sm outline-none" style={{ color: 'var(--text)' }} />
          </div>
          <div className="overflow-auto" style={{ maxHeight: 320 }}>
            <button type="button" onClick={() => pick(null)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left" style={{ color: 'var(--text-muted)' }}>
              <span className="w-4">{ctx.companyId == null && <Check size={14} style={{ color: 'var(--primary)' }} />}</span>
              Todas as empresas
            </button>
            {filtered.map((c) => (
              <button key={c.id} type="button" onClick={() => pick(c.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left ds-row-hover"
                style={{ color: 'var(--text)', background: c.id === ctx.companyId ? 'var(--surface-hover)' : 'transparent' }}>
                <span className="w-4">{c.id === ctx.companyId && <Check size={14} style={{ color: 'var(--primary)' }} />}</span>
                <span className="truncate">{c.name}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-4 text-center text-sm" style={{ color: 'var(--text-light)' }}>Nenhuma empresa encontrada.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
