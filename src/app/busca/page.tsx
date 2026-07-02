'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import {
  Search as SearchIcon, Mail, Phone, ExternalLink, Check, Filter,
  EyeOff,
} from 'lucide-react'

interface SearchRow {
  id: number
  name: string
  type: 'internal' | 'candidate' | 'partner'
  email: string | null
  phone: string | null
  hourly_rate: number | null
  availability: 'integral' | 'parcial' | 'indisponivel' | null
  city: string | null
  state: string | null
  skill_id: number
  skill: string
  level: string
  level_weight: number
  candidate_status: string | null
  contact_hidden: boolean
}
interface AdvancedResponse {
  data: SearchRow[]
  total: number
  limited: boolean
}

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'internal',  label: 'Interno' },
  { value: 'candidate', label: 'Candidato' },
  { value: 'partner',   label: 'Parceiro' },
]
const LEVEL_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Básico' },
  { value: 2, label: 'Intermediário' },
  { value: 3, label: 'Avançado' },
  { value: 4, label: 'Especialista' },
]
const AVAIL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'full',    label: 'Integral' },
  { value: 'partial', label: 'Parcial' },
]

export default function BuscaPage() {
  const [q, setQ] = useState('')
  const [types, setTypes] = useState<string[]>([])
  const [levels, setLevels] = useState<number[]>([])
  const [availability, setAvailability] = useState<string[]>([])
  const [rows, setRows] = useState<SearchRow[]>([])
  const [loading, setLoading] = useState(false)
  const [limited, setLimited] = useState(false)
  const [approvingId, setApprovingId] = useState<number | null>(null)

  // Deep-link inicial: ?q=faturamento
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const qp = params.get('q')
    if (qp) setQ(qp)
    const tp = params.get('type')
    if (tp) setTypes(tp.split(','))
    const lv = params.get('levels')
    if (lv) setLevels(lv.split(',').map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 4))
    const av = params.get('availability')
    if (av) setAvailability(av.split(','))
  }, [])

  // Sync URL
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (types.length) params.set('type', types.join(','))
    if (levels.length > 0) params.set('levels', levels.slice().sort().join(','))
    if (availability.length) params.set('availability', availability.join(','))
    const qs = params.toString()
    const newUrl = qs ? `?${qs}` : window.location.pathname
    window.history.replaceState({}, '', newUrl)
  }, [q, types, levels, availability])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params: string[] = []
      if (q.trim()) params.push(`q=${encodeURIComponent(q.trim())}`)
      if (types.length) params.push(`type=${types.join(',')}`)
      if (levels.length > 0) params.push(`levels=${levels.slice().sort().join(',')}`)
      if (availability.length) params.push(`availability=${availability.join(',')}`)
      const qs = params.length ? `?${params.join('&')}` : ''
      const r = await api.get<AdvancedResponse>(`/search/advanced${qs}`)
      setRows(r.data ?? [])
      setLimited(!!r.limited)
    } catch {
      toast.error('Erro ao buscar')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [q, types, levels, availability])

  // Debounce 350ms ao mudar q; mudanças de filtro disparam imediato
  useEffect(() => {
    const t = setTimeout(fetchData, 350)
    return () => clearTimeout(t)
  }, [fetchData])

  function toggleArr<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]
  }

  async function approveCandidate(id: number, name: string) {
    setApprovingId(id)
    try {
      await api.patch(`/candidates/${id}/status`, { status: 'approved' })
      toast.success(`✓ ${name} aprovado — contato agora visível`)
      // Refresh list
      fetchData()
    } catch {
      toast.error('Erro ao aprovar')
    } finally {
      setApprovingId(null)
    }
  }

  const totalUniqueUsers = useMemo(() => new Set(rows.map(r => r.id)).size, [rows])

  return (
    <AppLayout title="Busca Avançada">
      <div className="space-y-3">

        {/* Header: input + filtros */}
        <div className="ds-card ds-card-pad">
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <SearchIcon size={14} style={{
              position: 'absolute', left: 10, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--text-muted)',
            }} />
            <input
              autoFocus
              className="ds-input w-full"
              style={{ paddingLeft: 32, fontSize: 13, height: 36 }}
              placeholder="Buscar por termo de negócio (ex: faturamento, financeiro, estoque…)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <FilterGroup label="Tipo">
              {TYPE_OPTIONS.map(o => {
                const on = types.includes(o.value)
                return (
                  <Chip key={o.value} on={on} onClick={() => setTypes(toggleArr(types, o.value))}>
                    {o.label}
                  </Chip>
                )
              })}
            </FilterGroup>

            <FilterGroup label="Nível">
              {LEVEL_OPTIONS.map(o => {
                const on = levels.includes(o.value)
                return (
                  <Chip
                    key={o.value}
                    on={on}
                    onClick={() => setLevels(toggleArr(levels, o.value))}
                  >
                    {o.label}
                  </Chip>
                )
              })}
            </FilterGroup>

            <FilterGroup label="Disponibilidade">
              {AVAIL_OPTIONS.map(o => {
                const on = availability.includes(o.value)
                return (
                  <Chip key={o.value} on={on} onClick={() => setAvailability(toggleArr(availability, o.value))}>
                    {o.label}
                  </Chip>
                )
              })}
            </FilterGroup>
          </div>

          <div className="flex items-center justify-between" style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
            <span>
              {loading ? 'Buscando…' : (
                <>
                  <strong style={{ color: 'var(--text)' }}>{rows.length}</strong> resultado{rows.length === 1 ? '' : 's'}
                  {totalUniqueUsers !== rows.length && (
                    <> · {totalUniqueUsers} pessoa{totalUniqueUsers === 1 ? '' : 's'} única{totalUniqueUsers === 1 ? '' : 's'}</>
                  )}
                  {limited && <> · <span style={{ color: 'var(--warning)' }}>limite 100 atingido</span></>}
                </>
              )}
            </span>
            {(q || types.length > 0 || levels.length > 0 || availability.length > 0) && (
              <button
                type="button"
                onClick={() => { setQ(''); setTypes([]); setLevels([]); setAvailability([]) }}
                style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 4,
                  background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                <Filter size={10} /> Limpar filtros
              </button>
            )}
          </div>
        </div>

        {/* Tabela */}
        <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <Th>Nome</Th>
                  <Th>Tipo</Th>
                  <Th>Skill</Th>
                  <Th>Nível</Th>
                  <Th>Disp.</Th>
                  <Th align="right">Valor/h</Th>
                  <Th>Cidade</Th>
                  <Th>Email</Th>
                  <Th>Telefone</Th>
                  <Th align="right">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                      Nenhum resultado{q && <> pra <strong>"{q}"</strong></>}
                    </td>
                  </tr>
                )}
                {rows.map((r, i) => {
                  const isPending = r.type === 'candidate'
                    && (r.candidate_status === 'new' || r.candidate_status === 'screening')
                  return (
                    <tr key={`${r.id}-${r.skill_id}-${i}`}
                        style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}
                        className="ds-row-hover">
                      <Td>
                        <Link
                          href={`/perfil-skills/${r.id}`}
                          style={{
                            color: 'var(--text)', fontWeight: 600,
                            textDecoration: 'none',
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                          }}
                        >
                          {r.name}
                          <ExternalLink size={10} style={{ color: 'var(--text-muted)' }} />
                        </Link>
                      </Td>
                      <Td><TypeBadge type={r.type} /></Td>
                      <Td><span style={{ color: 'var(--text)' }}>{r.skill}</span></Td>
                      <Td><LevelBadge level={r.level} weight={r.level_weight} /></Td>
                      <Td><AvailBadge avail={r.availability} /></Td>
                      <Td align="right">
                        {r.hourly_rate != null
                          ? <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>R$ {r.hourly_rate.toFixed(2)}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </Td>
                      <Td>
                        {r.city || r.state ? (
                          <span style={{ color: 'var(--text-muted)' }}>
                            {r.city}{r.city && r.state ? '/' : ''}{r.state}
                          </span>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </Td>
                      <Td>
                        {r.contact_hidden ? (
                          <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }} title="LGPD: candidato não-aprovado">
                            <EyeOff size={10} /> oculto
                          </span>
                        ) : r.email ? (
                          <a href={`mailto:${r.email}`}
                             style={{ color: 'var(--primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Mail size={10} />{r.email}
                          </a>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </Td>
                      <Td>
                        {r.contact_hidden ? (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        ) : r.phone ? (
                          <a href={`https://wa.me/${r.phone.replace(/\D/g, '')}`}
                             target="_blank" rel="noopener noreferrer"
                             style={{ color: 'var(--success)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Phone size={10} />{r.phone}
                          </a>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </Td>
                      <Td align="right">
                        <div className="flex items-center gap-1" style={{ justifyContent: 'flex-end' }}>
                          {isPending && (
                            <button
                              type="button"
                              disabled={approvingId === r.id}
                              onClick={() => approveCandidate(r.id, r.name)}
                              style={{
                                fontSize: 10, padding: '3px 8px', borderRadius: 3,
                                background: 'var(--success-bg)', border: '1px solid var(--success-border)',
                                color: 'var(--success)', fontWeight: 600, cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                              }}
                              title="Aprova o candidato (libera contato + entra no motor de recomendação)"
                            >
                              <Check size={9} /> Aprovar
                            </button>
                          )}
                          <Link
                            href={`/perfil-skills/${r.id}`}
                            style={{
                              fontSize: 10, padding: '3px 8px', borderRadius: 3,
                              background: 'transparent', border: '1px solid var(--border)',
                              color: 'var(--text)', fontWeight: 500, textDecoration: 'none',
                            }}
                          >
                            Ver Perfil
                          </Link>
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
        letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4,
      }}>
        {label}
      </div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  )
}

function Chip({
  on, onClick, children,
}: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 11, padding: '3px 9px', borderRadius: 3,
        background: on ? 'var(--primary-soft)' : 'transparent',
        border: '1px solid',
        borderColor: on ? 'var(--primary)' : 'var(--border)',
        color: on ? 'var(--primary)' : 'var(--text)',
        fontWeight: on ? 600 : 500, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th style={{
      padding: '8px 12px', textAlign: align,
      fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
      letterSpacing: '0.04em', textTransform: 'uppercase',
      background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 1,
    }}>{children}</th>
  )
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td style={{ padding: '8px 12px', textAlign: align, verticalAlign: 'middle' }}>
      {children}
    </td>
  )
}

function TypeBadge({ type }: { type: 'internal' | 'candidate' | 'partner' }) {
  const map = {
    internal:  { label: 'Interno',  bg: 'var(--info-bg)', fg: 'var(--info)', bd: 'var(--info-border)' },
    candidate: { label: 'Candidato', bg: 'var(--warning-bg)',   fg: 'var(--warning)', bd: 'var(--warning-border)' },
    partner:   { label: 'Parceiro',  bg: 'transparent',         fg: 'var(--text-muted)', bd: 'var(--border)' },
  } as const
  const cfg = map[type]
  return (
    <span style={{
      fontSize: 10, fontWeight: 600,
      padding: '2px 7px', borderRadius: 3,
      background: cfg.bg, color: cfg.fg, border: `1px solid ${cfg.bd}`,
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>{cfg.label}</span>
  )
}

function LevelBadge({ level, weight }: { level: string; weight: number }) {
  // 1=Básico, 2=Intermediário, 3=Avançado, 4=Especialista
  const palette = [
    { bg: 'transparent',          fg: 'var(--text-muted)',     bd: 'var(--border)' },          // 0 (shouldn't happen)
    { bg: 'transparent',          fg: 'var(--text-muted)',     bd: 'var(--border)' },          // 1
    { bg: 'var(--warning-bg)',    fg: 'var(--warning)',        bd: 'var(--warning-border)' },  // 2
    { bg: 'var(--warning-bg)',    fg: 'var(--warning)',        bd: 'var(--warning-border)' },  // 3
    { bg: 'var(--success-bg)',    fg: 'var(--success)',        bd: 'var(--success-border)' },  // 4
  ]
  const cfg = palette[Math.max(0, Math.min(4, weight))]
  return (
    <span style={{
      fontSize: 10, fontWeight: 600,
      padding: '2px 7px', borderRadius: 3,
      background: cfg.bg, color: cfg.fg, border: `1px solid ${cfg.bd}`,
    }}>{level}</span>
  )
}

function AvailBadge({ avail }: { avail: 'integral' | 'parcial' | 'indisponivel' | null }) {
  if (!avail) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  const map = {
    integral:     { label: 'Integral',     fg: 'var(--success)', bd: 'var(--success-border)', bg: 'var(--success-bg)' },
    parcial:      { label: 'Parcial',      fg: 'var(--warning)', bd: 'var(--warning-border)', bg: 'var(--warning-bg)' },
    indisponivel: { label: 'Indisponível', fg: 'var(--danger)',  bd: 'var(--danger-border)',  bg: 'var(--danger-bg)' },
  } as const
  const cfg = map[avail]
  return (
    <span style={{
      fontSize: 10, fontWeight: 600,
      padding: '2px 7px', borderRadius: 3,
      background: cfg.bg, color: cfg.fg, border: `1px solid ${cfg.bd}`,
    }}>{cfg.label}</span>
  )
}
