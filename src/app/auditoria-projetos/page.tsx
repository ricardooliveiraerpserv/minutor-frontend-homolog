'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { PageHeader, Table, Thead, Th, Tbody, Tr, Td, Button } from '@/components/ds'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { History, Search, ChevronLeft, ChevronRight } from 'lucide-react'

interface AuditItem {
  source: 'projeto' | 'aporte'
  project_id: number
  project: string
  field: string
  field_label: string
  old: string | null
  new: string | null
  user: string
  at: string
}
interface FieldOpt { value: string; label: string }

const fmtDate = (iso: string) => {
  const d = new Date(iso.replace(' ', 'T'))
  return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AuditoriaProjetosPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [items, setItems] = useState<AuditItem[]>([])
  const [fields, setFields] = useState<FieldOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [page, setPage] = useState(1)

  // filtros
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [field, setField] = useState('')
  const [source, setSource] = useState<'todos' | 'projeto' | 'aporte'>('todos')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => { if (user && user.type !== 'admin') router.replace('/inicio') }, [user, router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: '30', source })
      if (search) p.set('search', search)
      if (field) p.set('field', field)
      if (dateFrom) p.set('date_from', dateFrom)
      if (dateTo) p.set('date_to', dateTo)
      const r = await api.get<{ items: AuditItem[]; total: number; hasNext: boolean; fields: FieldOpt[] }>(`/projects/audit?${p}`)
      setItems(r.items ?? [])
      setTotal(r.total ?? 0)
      setHasNext(!!r.hasNext)
      if (r.fields) setFields(r.fields)
    } catch { toast.error('Erro ao carregar a auditoria') } finally { setLoading(false) }
  }, [page, search, field, source, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  const applySearch = () => { setPage(1); setSearch(searchInput.trim()) }
  const clearFilters = () => { setSearchInput(''); setSearch(''); setField(''); setSource('todos'); setDateFrom(''); setDateTo(''); setPage(1) }

  const inputCls = 'rounded-lg px-3 py-2 text-sm ds-input'
  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' } as const

  return (
    <AppLayout title="Auditoria de Projetos">
      <div className="space-y-6">
        <PageHeader
          icon={History}
          title="Auditoria de Projetos"
          subtitle="Todas as alterações de campos dos projetos (tipo de contrato/serviço, valores, horas, status, datas…) e os lançamentos/edições de aporte — com quem alterou e quando."
        />

        {/* Filtros */}
        <div className="ds-card p-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px]" style={{ color: 'var(--text-light)' }}>Projeto (código ou nome)</label>
            <div className="flex gap-1">
              <input className={inputCls} style={inputStyle} value={searchInput} onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') applySearch() }} placeholder="Ex.: PNM003-25" />
              <button onClick={applySearch} className="px-2.5 rounded-lg" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><Search size={15} /></button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px]" style={{ color: 'var(--text-light)' }}>Campo</label>
            <select className={inputCls} style={inputStyle} value={field} onChange={e => { setPage(1); setField(e.target.value) }}>
              <option value="">Todos os campos</option>
              {fields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px]" style={{ color: 'var(--text-light)' }}>Tipo</label>
            <select className={inputCls} style={inputStyle} value={source} onChange={e => { setPage(1); setSource(e.target.value as 'todos' | 'projeto' | 'aporte') }}>
              <option value="todos">Tudo</option>
              <option value="projeto">Só alterações de campo</option>
              <option value="aporte">Só aportes</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px]" style={{ color: 'var(--text-light)' }}>De</label>
            <input type="date" className={inputCls} style={inputStyle} value={dateFrom} onChange={e => { setPage(1); setDateFrom(e.target.value) }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px]" style={{ color: 'var(--text-light)' }}>Até</label>
            <input type="date" className={inputCls} style={inputStyle} value={dateTo} onChange={e => { setPage(1); setDateTo(e.target.value) }} />
          </div>
          <button onClick={clearFilters} className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>Limpar</button>
        </div>

        {loading ? (
          <p className="text-sm animate-pulse" style={{ color: 'var(--text-light)' }}>Carregando…</p>
        ) : items.length === 0 ? (
          <div className="ds-card p-8 text-center text-sm" style={{ color: 'var(--text-light)' }}>Nenhum registro de auditoria para os filtros escolhidos.</div>
        ) : (
          <div className="ds-card overflow-x-auto">
            <Table>
              <Thead>
                <Tr><Th>Projeto</Th><Th>Campo</Th><Th>De</Th><Th>Para</Th><Th>Usuário</Th><Th>Quando</Th></Tr>
              </Thead>
              <Tbody>
                {items.map((it, i) => (
                  <Tr key={i}>
                    <Td className="font-medium whitespace-nowrap" style={{ color: 'var(--text)' }}>{it.project}</Td>
                    <Td style={{ color: 'var(--text)' }}>
                      <span className="inline-flex items-center gap-1.5">
                        {it.source === 'aporte' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>APORTE</span>}
                        {it.field_label}
                      </span>
                    </Td>
                    <Td style={{ color: 'var(--text-light)' }}><span className="line-clamp-3 max-w-[280px] whitespace-pre-wrap">{it.old ?? '—'}</span></Td>
                    <Td style={{ color: 'var(--text)' }}><span className="line-clamp-3 max-w-[320px] whitespace-pre-wrap">{it.new ?? '—'}</span></Td>
                    <Td className="whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{it.user}</Td>
                    <Td className="whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{fmtDate(it.at)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        )}

        {/* Paginação */}
        {(page > 1 || hasNext) && (
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--text-light)' }}>{total} registro(s)</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Anterior</Button>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Página {page}</span>
              <Button size="sm" variant="secondary" icon={ChevronRight} disabled={!hasNext} onClick={() => setPage(p => p + 1)}>Próxima</Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
