'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { PageHeader } from '@/components/ds'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { Eye, Users, Building2, Handshake, Search, Loader2 } from 'lucide-react'

type Kind = 'cliente' | 'consultor' | 'parceiro'

interface Candidate {
  id: number
  name: string
  email: string
  type: string
  consultant_type: string | null
  vinculo: string | null
}

const KINDS: { id: Kind; label: string; icon: typeof Users; hint: string }[] = [
  { id: 'cliente',   label: 'Cliente',   icon: Building2, hint: 'Portal do cliente' },
  { id: 'consultor', label: 'Consultor', icon: Users,     hint: 'Consultor, coordenador, administrativo…' },
  { id: 'parceiro',  label: 'Parceiro',  icon: Handshake, hint: 'Admin ou membro do parceiro' },
]

const TYPE_LABEL: Record<string, string> = {
  admin: 'Admin', administrativo: 'Administrativo', coordenador: 'Coordenador',
  consultor: 'Consultor', cliente: 'Cliente', parceiro_admin: 'Parceiro',
}

// Tipo de contrato (vínculo) exibido em cada linha.
const CONTRACT_LABEL: Record<string, string> = {
  horista: 'Horista', banco_de_horas: 'Banco de Horas', fixo: 'Fixo',
}

// Filtro do Consultor: por vínculo (consultant_type) ou por cargo (type).
const CONSULTOR_FILTERS: { v: string; l: string }[] = [
  { v: '',              l: 'Todos' },
  { v: 'horista',       l: 'Horista' },
  { v: 'banco_de_horas',l: 'Banco de Horas' },
  { v: 'fixo',          l: 'Fixo' },
  { v: 'consultor',     l: 'Consultor' },
  { v: 'coordenador',   l: 'Coordenador' },
  { v: 'administrativo',l: 'Administrativo' },
  { v: 'admin',         l: 'Admin' },
]

interface Partner { id: number; name: string }

export default function VerComoPage() {
  const [kind, setKind] = useState<Kind | null>(null)
  // null = "Todos" (admin + membro juntos). true = admin, false = membro.
  const [parceiroAdmin, setParceiroAdmin] = useState<boolean | null>(null)
  const [filter, setFilter] = useState('')            // consultor: vínculo/cargo
  const [partners, setPartners] = useState<Partner[]>([])
  const [partnerId, setPartnerId] = useState('')      // parceiro: empresa
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [entering, setEntering] = useState<number | null>(null)
  // Blocos (cliente/consultor/parceiro) liberados a ESTE usuário — vêm do backend
  // (bloco liberado no Configurador + trava de nível). null = ainda carregando.
  const [allowedKinds, setAllowedKinds] = useState<Kind[] | null>(null)

  useEffect(() => {
    api.get<{ data: Kind[] }>('/impersonate/kinds')
      .then(r => setAllowedKinds(r.data ?? []))
      .catch(() => setAllowedKinds([]))
  }, [])

  const visibleKinds = KINDS.filter(k => (allowedKinds ?? []).includes(k.id))

  const load = useCallback(async (k: Kind, admin: boolean | null, query: string, flt: string, pid: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ kind: k, q: query })
      // Só envia `admin` quando NÃO é "Todos" (null) — omitido = sem filtro is_executive.
      if (admin !== null) params.set('admin', admin ? '1' : '0')
      if (k === 'consultor' && flt) params.set('filter', flt)
      if (k === 'parceiro' && pid) params.set('partner_id', pid)
      const r = await api.get<{ data: Candidate[] }>(`/impersonate/candidates?${params.toString()}`)
      setResults(r.data ?? [])
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao buscar')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Recarrega ao trocar de tipo / toggle admin / filtro / empresa / busca (debounce).
  useEffect(() => {
    if (!kind) return
    const t = setTimeout(() => load(kind, parceiroAdmin, q, filter, partnerId), 250)
    return () => clearTimeout(t)
  }, [kind, parceiroAdmin, q, filter, partnerId, load])

  // Carrega as empresas parceiras (uma vez) ao entrar no modo Parceiro.
  useEffect(() => {
    if (kind !== 'parceiro' || partners.length) return
    api.get<{ data: Partner[] }>('/impersonate/partners').then(r => setPartners(r.data ?? [])).catch(() => {})
  }, [kind, partners.length])

  // Ao VOLTAR de uma visão (banner "Voltar para admin" → /ver-como), restaura o card/opções
  // que estavam selecionados. One-shot: limpa após restaurar (visita nova começa nos tiles).
  useEffect(() => {
    try {
      const raw = localStorage.getItem('minutor:vercomo:return')
      if (!raw) return
      localStorage.removeItem('minutor:vercomo:return')
      const s = JSON.parse(raw) as { kind?: Kind; parceiroAdmin?: boolean | null; filter?: string; partnerId?: string; results?: Candidate[] }
      if (!s.kind) return
      setKind(s.kind)
      if (s.parceiroAdmin !== undefined) setParceiroAdmin(s.parceiroAdmin)
      if (s.filter) setFilter(s.filter)
      if (s.partnerId) setPartnerId(s.partnerId)
      if (s.results?.length) setResults(s.results)  // mostra a lista em cache na hora; o load atualiza em silêncio
    } catch { /* ignora */ }
  }, [])

  const enter = async (c: Candidate) => {
    setEntering(c.id)
    // Guarda card/opções + a LISTA atual p/ restaurar ao voltar (mostra em cache, sem re-buscar).
    try { localStorage.setItem('minutor:vercomo:return', JSON.stringify({ kind, parceiroAdmin, filter, partnerId, results })) } catch {}
    try {
      const stoken = typeof window !== 'undefined' ? window.sessionStorage.getItem('minutor_token') : null
      const res = await fetch('/api/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(stoken ? { Authorization: `Bearer ${stoken}` } : {}) },
        body: JSON.stringify({ user_id: c.id }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.message ?? 'Falha ao entrar na visão')
      }
      // Per-aba: guarda os tokens no sessionStorage → impersonation isolada NESTA aba (as outras
      // abas seguem como estavam). Guarda o token do admin p/ voltar depois.
      const d = await res.json().catch(() => ({}))
      try {
        if (d.token) window.sessionStorage.setItem('minutor_token', d.token)
        if (d.adminToken) window.sessionStorage.setItem('minutor_admin_token', d.adminToken)
        if (d.user) window.sessionStorage.setItem('minutor_impersonating', JSON.stringify(d.user))
      } catch { /* noop */ }
      // Recarrega já como o usuário-alvo — visão REAL dele.
      window.location.href = '/'
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro')
      setEntering(null)
    }
  }

  const selectKind = (k: Kind) => {
    setKind(k)
    setQ('')
    setFilter('')
    setPartnerId('')
    setResults([])
    if (k === 'parceiro') setParceiroAdmin(true)
  }

  // Sem nenhum bloco liberado → sem acesso. (Quem tem a tela no menu mas nenhum bloco
  // liberado no Configurador cai aqui. Admin/administrativo sempre têm todos.)
  if (allowedKinds !== null && allowedKinds.length === 0) {
    return (
      <AppLayout title="Ver como">
        <div className="p-8"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Você não tem nenhum tipo de visão liberado. Fale com um administrador.</p></div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Ver como">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
        <PageHeader
          icon={Eye}
          title="Ver como"
          subtitle="Simula a visão REAL de um cliente, consultor ou parceiro — idêntica à que ele vê."
        />

        {/* Passo 1 — tipo de visão */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {visibleKinds.map(({ id, label, icon: Icon, hint }) => {
            const active = kind === id
            return (
              <button
                key={id}
                onClick={() => selectKind(id)}
                className="text-left rounded-2xl border p-4 transition-all"
                style={{
                  borderColor: active ? 'var(--primary)' : 'var(--border)',
                  background: active ? 'var(--primary-soft)' : 'var(--surface)',
                }}
              >
                <Icon size={18} style={{ color: active ? 'var(--primary)' : 'var(--text-muted)' }} />
                <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>{label}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>{hint}</p>
              </button>
            )
          })}
        </div>

        {/* Passo 2 — parceiro: admin/não + empresa parceira */}
        {kind === 'parceiro' && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Tipo de parceiro:</span>
            <div className="inline-flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
              {[{ v: null, l: 'Todos' }, { v: true, l: 'Admin do parceiro' }, { v: false, l: 'Membro (não-admin)' }].map(o => (
                <button
                  key={String(o.v)}
                  onClick={() => setParceiroAdmin(o.v)}
                  className="px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    background: parceiroAdmin === o.v ? 'var(--primary)' : 'transparent',
                    color: parceiroAdmin === o.v ? 'var(--primary-fg)' : 'var(--text-muted)',
                  }}
                >
                  {o.l}
                </button>
              ))}
            </div>
            <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>Empresa:</span>
            <select
              value={partnerId}
              onChange={e => setPartnerId(e.target.value)}
              className="text-xs rounded-lg px-2 py-1.5 bg-[var(--surface-hover)] border border-[var(--border)] text-white h-8"
            >
              <option value="">Todas</option>
              {partners.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
            </select>
          </div>
        )}

        {/* Passo 2 — consultor: filtro por vínculo (BH/horista/fixo) ou cargo (coord/adm…) */}
        {kind === 'consultor' && (
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <span className="text-xs mr-1" style={{ color: 'var(--text-muted)' }}>Filtrar:</span>
            {CONSULTOR_FILTERS.map(o => (
              <button
                key={o.v}
                onClick={() => setFilter(o.v)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors border"
                style={filter === o.v
                  ? { background: 'var(--primary)', color: 'var(--primary-fg)', borderColor: 'var(--primary)' }
                  : { color: 'var(--text-muted)', borderColor: 'var(--border)' }}
              >
                {o.l}
              </button>
            ))}
          </div>
        )}

        {/* Passo 3 — busca + resultados */}
        {kind && (
          <>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
              <Input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={kind === 'cliente' ? 'Buscar cliente…' : kind === 'parceiro' ? 'Buscar parceiro…' : 'Buscar consultor / coordenador / administrativo…'}
                className="pl-9 bg-[var(--surface-hover)] border-[var(--border)] text-white h-10"
              />
            </div>

            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              {loading && results.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-8 text-xs" style={{ color: 'var(--text-light)' }}>
                  <Loader2 size={14} className="animate-spin" /> Buscando…
                </div>
              ) : results.length === 0 ? (
                <p className="py-8 text-center text-xs" style={{ color: 'var(--text-light)' }}>Nenhum resultado.</p>
              ) : (
                results.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{c.name}</p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--text-light)' }}>
                        {TYPE_LABEL[c.type] ?? c.type}{c.vinculo ? ` · ${c.vinculo}` : ''}{c.email ? ` · ${c.email}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.consultant_type && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
                          {CONTRACT_LABEL[c.consultant_type] ?? c.consultant_type}
                        </span>
                      )}
                      <Button size="sm" className="gap-1.5" onClick={() => enter(c)} disabled={entering === c.id}>
                        {entering === c.id ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
                        Ver como
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
