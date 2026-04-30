'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from 'next/navigation'
import { formatBRL } from '@/lib/format'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { ExpenseViewModal } from '@/components/ui/expense-view-modal'
import {
  DollarSign, CheckCircle2, Receipt, ChevronDown,
  Search, X, Check, RotateCcw, Eye, Undo2,
} from 'lucide-react'
import {
  PageHeader, Table, Thead, Th, Tbody, Tr, Td,
  Badge, Button, SkeletonTable, EmptyState, Pagination,
} from '@/components/ds'
import { toast } from 'sonner'
import type { Expense } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserOption { id: number; name: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function fmtBRL(v: number | string | null | undefined) {
  if (v == null || v === '') return '—'
  const n = typeof v === 'string' ? parseFloat(v) : v
  return formatBRL(isNaN(n) ? 0 : n)
}

// ─── SearchSelect ─────────────────────────────────────────────────────────────

function SearchSelect({
  value, onChange, options, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: UserOption[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = React.useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = useMemo(() =>
    q ? options.filter(o => o.name.toLowerCase().includes(q.toLowerCase())) : options
  , [options, q])

  const selected = options.find(o => String(o.id) === value)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-colors min-w-[200px]"
        style={{
          background: 'var(--brand-surface)',
          borderColor: 'var(--brand-border)',
          color: selected ? 'var(--brand-text)' : 'var(--brand-muted)',
        }}
      >
        <span className="flex-1 text-left truncate">{selected?.name ?? placeholder}</span>
        {value ? (
          <X size={12} onClick={e => { e.stopPropagation(); onChange('') }} style={{ color: 'var(--brand-subtle)' }} />
        ) : (
          <ChevronDown size={12} style={{ color: 'var(--brand-subtle)' }} />
        )}
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 rounded-xl border shadow-xl min-w-[220px]"
          style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'var(--brand-border)' }}>
            <div className="flex items-center gap-2 px-2">
              <Search size={12} style={{ color: 'var(--brand-subtle)' }} />
              <input
                autoFocus value={q} onChange={e => setQ(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--brand-text)' }}
                placeholder="Buscar..."
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); setQ('') }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-colors"
              style={{ color: 'var(--brand-muted)' }}
            >
              {placeholder}
            </button>
            {filtered.map(o => (
              <button
                key={o.id} type="button"
                onClick={() => { onChange(String(o.id)); setOpen(false); setQ('') }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-colors"
                style={{ color: String(o.id) === value ? '#00F5FF' : 'var(--brand-text)' }}
              >
                {o.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm" style={{ color: 'var(--brand-muted)' }}>Nenhum resultado</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string; sub?: string
  icon: React.ElementType; accent: 'primary' | 'success' | 'warning'
}) {
  const color = accent === 'primary' ? '#00F5FF' : accent === 'success' ? '#10B981' : '#F59E0B'
  const bg = accent === 'primary' ? 'rgba(0,245,255,0.08)' : accent === 'success' ? 'rgba(16,185,129,0.10)' : 'rgba(245,158,11,0.10)'
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{label}</span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: bg }}>
          <Icon size={15} color={color} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-extrabold tracking-tight" style={{ color }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--brand-muted)' }}>{sub}</p>}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function PagamentoDespesasPage() {
  const { user } = useAuth()
  const router = useRouter()

  const isAdmin          = user?.type === 'admin'
  const isAdministrativo = user?.type === 'administrativo'
  const canPay           = isAdmin || isAdministrativo

  useEffect(() => {
    if (user && !canPay) router.replace('/expenses')
  }, [user, canPay, router])

  // ── Filter state ──
  const now = new Date()
  const [refMonth,  setRefMonth]  = useState<number | null>(now.getMonth() + 1)
  const [refYear,   setRefYear]   = useState<number | null>(now.getFullYear())
  const [dateFrom,  setDateFrom]  = useState(() => {
    const m = String(now.getMonth() + 1).padStart(2, '0')
    return `${now.getFullYear()}-${m}-01`
  })
  const [dateTo, setDateTo] = useState(() => {
    const m = now.getMonth() + 1
    const last = new Date(now.getFullYear(), m, 0).getDate()
    return `${now.getFullYear()}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  })
  const [selectedUser, setSelectedUser] = useState('')
  const [paidFilter,  setPaidFilter]   = useState<'pending' | 'paid' | 'all'>('pending')
  const [page, setPage]   = useState(1)
  const [hasNext, setHasNext] = useState(false)

  // ── Data ──
  const [users,    setUsers]    = useState<UserOption[]>([])
  const [items,    setItems]    = useState<Expense[]>([])
  const [loading,  setLoading]  = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [paying,   setPaying]   = useState<Set<number>>(new Set())

  // ── View modal ──
  const [viewExp,     setViewExp]     = useState<Expense | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  // ── Revert modal ──
  const [revertTarget,  setRevertTarget]  = useState<Expense | null>(null)
  const [revertReason,  setRevertReason]  = useState('')
  const [reverting,     setReverting]     = useState(false)

  // Load consultants
  useEffect(() => {
    api.get<any>('/users?pageSize=200&exclude_type=cliente')
      .then(r => setUsers(Array.isArray(r?.items) ? r.items : []))
      .catch(() => {})
  }, [])

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), per_page: '100', status: 'approved' })
    if (dateFrom) p.set('start_date', dateFrom)
    if (dateTo)   p.set('end_date', dateTo)
    if (selectedUser) p.set('user_id[]', selectedUser)
    if (paidFilter === 'paid')    p.set('is_paid', 'true')
    if (paidFilter === 'pending') p.set('is_paid', 'false')
    return p
  }, [page, dateFrom, dateTo, selectedUser, paidFilter])

  const fetchData = useCallback(() => {
    setLoading(true)
    setSelected(new Set())
    api.get<any>(`/expenses?${buildParams()}`)
      .then(r => {
        const raw = r?.data ?? r
        setItems(Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [])
        setHasNext(!!(raw?.next_page_url ?? (raw?.current_page < raw?.last_page)))
      })
      .catch(() => { setItems([]); toast.error('Erro ao carregar despesas') })
      .finally(() => setLoading(false))
  }, [buildParams])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Totals ──
  const totalAmount   = useMemo(() => items.reduce((a, e) => a + (e.amount ?? 0), 0), [items])
  const paidItems     = useMemo(() => items.filter(e => e.is_paid), [items])
  const pendingItems  = useMemo(() => items.filter(e => !e.is_paid), [items])
  const paidAmount    = useMemo(() => paidItems.reduce((a, e) => a + (e.amount ?? 0), 0), [paidItems])
  const pendingAmount = useMemo(() => pendingItems.reduce((a, e) => a + (e.amount ?? 0), 0), [pendingItems])

  // ── Toggle paid ──
  const togglePaid = useCallback(async (exp: Expense, forcePaid?: boolean) => {
    const newVal = forcePaid ?? !exp.is_paid
    setPaying(p => new Set(p).add(exp.id))
    try {
      await api.post(`/expenses/${exp.id}/set-paid`, { is_paid: newVal })
      setItems(prev => prev.map(e => e.id === exp.id ? { ...e, is_paid: newVal } : e))
      toast.success(newVal ? 'Despesa marcada como paga.' : 'Marcação removida.')
    } catch {
      toast.error('Erro ao atualizar pagamento.')
    } finally {
      setPaying(p => { const s = new Set(p); s.delete(exp.id); return s })
    }
  }, [])

  const markSelectedPaid = useCallback(async () => {
    const ids = Array.from(selected).filter(id => {
      const exp = items.find(e => e.id === id)
      return exp && !exp.is_paid
    })
    if (ids.length === 0) return
    await Promise.all(ids.map(id => togglePaid(items.find(e => e.id === id)!, true)))
    setSelected(new Set())
  }, [selected, items, togglePaid])

  // ── View ──
  const openView = useCallback(async (exp: Expense) => {
    setViewExp(exp)
    setViewLoading(true)
    try {
      const r = await api.get<any>(`/expenses/${exp.id}`)
      setViewExp(r?.data ?? r)
    } catch { }
    finally { setViewLoading(false) }
  }, [])

  // ── Revert approval ──
  const submitRevert = useCallback(async () => {
    if (!revertTarget || !revertReason.trim()) return
    setReverting(true)
    try {
      await api.post(`/expenses/${revertTarget.id}/reverse-approval`, { reason: revertReason.trim() })
      setItems(prev => prev.filter(e => e.id !== revertTarget.id))
      toast.success('Aprovação estornada com sucesso.')
      setRevertTarget(null)
      setRevertReason('')
    } catch (err: any) {
      const msg = err?.response?.data?.message
      toast.error(msg ?? 'Erro ao estornar aprovação.')
    } finally {
      setReverting(false)
    }
  }, [revertTarget, revertReason])

  // ── Selection ──
  const visibleIds  = useMemo(() => items.filter(e => !e.is_paid).map(e => e.id), [items])
  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id))
  const toggleAll   = () => allSelected ? setSelected(new Set()) : setSelected(new Set(visibleIds))
  const toggleOne   = (id: number) => setSelected(prev => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s
  })

  if (!canPay) return null

  return (
    <AppLayout title="Pagamento de Despesas">
      <div className="max-w-7xl mx-auto space-y-6">

        <PageHeader
          icon={DollarSign}
          title="Pagamento de Despesas"
          subtitle="Gerencie o pagamento de despesas aprovadas por consultor e período"
          actions={
            selected.size > 0 ? (
              <Button variant="primary" size="sm" onClick={markSelectedPaid}>
                <Check size={14} />
                Marcar {selected.size} como Pago
              </Button>
            ) : undefined
          }
        />

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard
            label="Total Aprovadas"
            value={fmtBRL(totalAmount)}
            sub={`${items.length} despesa${items.length !== 1 ? 's' : ''}`}
            icon={Receipt}
            accent="primary"
          />
          <SummaryCard
            label="A Pagar"
            value={fmtBRL(pendingAmount)}
            sub={`${pendingItems.length} despesa${pendingItems.length !== 1 ? 's' : ''}`}
            icon={DollarSign}
            accent="warning"
          />
          <SummaryCard
            label="Pagas"
            value={fmtBRL(paidAmount)}
            sub={`${paidItems.length} despesa${paidItems.length !== 1 ? 's' : ''}`}
            icon={CheckCircle2}
            accent="success"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4 p-5 rounded-2xl"
          style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Período</label>
            <MonthYearPicker
              month={refMonth}
              year={refYear}
              onChange={(m, y) => {
                if (m === 0) {
                  setRefMonth(null); setRefYear(null); setDateFrom(''); setDateTo('')
                } else {
                  const mm = String(m).padStart(2, '0')
                  const last = new Date(y, m, 0).getDate()
                  setRefMonth(m); setRefYear(y)
                  setDateFrom(`${y}-${mm}-01`); setDateTo(`${y}-${mm}-${String(last).padStart(2, '0')}`)
                }
                setPage(1)
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Consultor</label>
            <SearchSelect
              value={selectedUser}
              onChange={v => { setSelectedUser(v); setPage(1) }}
              options={users}
              placeholder="Todos os consultores"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>Status</label>
            <div className="flex rounded-xl border overflow-hidden text-sm"
              style={{ borderColor: 'var(--brand-border)' }}>
              {([
                ['pending', 'A Pagar'],
                ['paid',    'Pagas'],
                ['all',     'Todas'],
              ] as const).map(([val, lbl]) => (
                <button
                  key={val}
                  onClick={() => { setPaidFilter(val); setPage(1) }}
                  className="px-4 py-2 font-medium transition-colors"
                  style={{
                    background: paidFilter === val ? 'rgba(0,245,255,0.12)' : 'transparent',
                    color: paidFilter === val ? '#00F5FF' : '#71717a',
                  }}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <SkeletonTable rows={8} cols={7} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Nenhuma despesa encontrada"
            description="Ajuste os filtros para visualizar as despesas aprovadas."
          />
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
            <div className="overflow-x-auto">
              <Table>
                <Thead>
                  <Tr baseBackground="var(--brand-surface)">
                    <Th>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="w-4 h-4 rounded accent-cyan-400"
                      />
                    </Th>
                    <Th>Data</Th>
                    <Th>Consultor</Th>
                    <Th>Projeto</Th>
                    <Th>Cliente</Th>
                    <Th>Categoria</Th>
                    <Th right>Valor</Th>
                    <Th>Status Pag.</Th>
                    <Th right>Ações</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {items.map(exp => {
                    const isPaid    = !!exp.is_paid
                    const isLoading = paying.has(exp.id)
                    return (
                      <Tr key={exp.id} baseBackground="transparent">
                        <Td>
                          {!isPaid && (
                            <input
                              type="checkbox"
                              checked={selected.has(exp.id)}
                              onChange={() => toggleOne(exp.id)}
                              className="w-4 h-4 rounded accent-cyan-400"
                            />
                          )}
                        </Td>
                        <Td mono>{fmtDate(exp.expense_date)}</Td>
                        <Td>
                          <span style={{ color: 'var(--brand-text)' }}>
                            {exp.user?.name ?? '—'}
                          </span>
                        </Td>
                        <Td>
                          <span className="truncate max-w-[160px] block" title={(exp.project as any)?.name}>
                            {(exp.project as any)?.name ?? '—'}
                          </span>
                        </Td>
                        <Td>
                          <span className="truncate max-w-[130px] block">
                            {(exp.project as any)?.customer?.name ?? '—'}
                          </span>
                        </Td>
                        <Td muted>
                          {exp.category?.name ?? '—'}
                        </Td>
                        <Td right mono>
                          <span className="font-semibold" style={{ color: isPaid ? 'var(--brand-muted)' : 'var(--brand-primary)' }}>
                            {exp.formatted_amount ?? fmtBRL(exp.amount)}
                          </span>
                        </Td>
                        <Td>
                          {isPaid
                            ? <Badge variant="success">Pago</Badge>
                            : <Badge variant="warning">A Pagar</Badge>
                          }
                        </Td>
                        <Td right>
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Visualizar */}
                            <button
                              onClick={() => openView(exp)}
                              title="Visualizar"
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                              style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF' }}
                            >
                              <Eye size={11} /> Ver
                            </button>
                            {/* Estornar aprovação */}
                            <button
                              onClick={() => { setRevertTarget(exp); setRevertReason('') }}
                              title="Estornar aprovação"
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                              style={{ background: 'rgba(249,115,22,0.10)', color: '#F97316' }}
                            >
                              <Undo2 size={11} /> Estornar
                            </button>
                            {/* Pagar / Desfazer */}
                            <button
                              disabled={isLoading}
                              onClick={() => togglePaid(exp)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                              style={isPaid
                                ? { background: 'rgba(239,68,68,0.10)', color: '#EF4444' }
                                : { background: 'rgba(16,185,129,0.10)', color: '#10B981' }
                              }
                            >
                              {isLoading ? (
                                <span className="w-3 h-3 border border-current rounded-full border-t-transparent animate-spin" />
                              ) : isPaid ? (
                                <><RotateCcw size={11} /> Desfazer</>
                              ) : (
                                <><CheckCircle2 size={11} /> Pagar</>
                              )}
                            </button>
                          </div>
                        </Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            </div>
            {(page > 1 || hasNext) && (
              <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--brand-border)' }}>
                <Pagination
                  page={page}
                  hasNext={hasNext}
                  onPrev={() => setPage(p => Math.max(1, p - 1))}
                  onNext={() => setPage(p => p + 1)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal Visualizar ── */}
      {viewExp && !viewLoading && (
        <ExpenseViewModal expense={viewExp} onClose={() => setViewExp(null)} />
      )}
      {viewLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Modal Estornar Aprovação ── */}
      {revertTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={e => { if (e.target === e.currentTarget) setRevertTarget(null) }}
        >
          <div
            className="w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-5"
            style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(249,115,22,0.12)' }}>
                <Undo2 size={16} color="#F97316" />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>Estornar Aprovação</h3>
                <p className="text-xs" style={{ color: 'var(--brand-muted)' }}>
                  Despesa #{revertTarget.id} · {revertTarget.formatted_amount ?? fmtBRL(revertTarget.amount)}
                </p>
              </div>
            </div>

            {/* Info */}
            <div className="rounded-xl p-3 text-sm space-y-1"
              style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)' }}>
              <p style={{ color: '#F97316' }}>
                Esta ação irá reverter a aprovação da despesa, retornando-a ao status <strong>rejeitado</strong>.
              </p>
            </div>

            {/* Motivo */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>
                Motivo do estorno <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <textarea
                rows={3}
                value={revertReason}
                onChange={e => setRevertReason(e.target.value)}
                placeholder="Descreva o motivo do estorno..."
                className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--brand-border)',
                  color: 'var(--brand-text)',
                }}
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setRevertTarget(null)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)' }}
              >
                Cancelar
              </button>
              <button
                onClick={submitRevert}
                disabled={reverting || !revertReason.trim()}
                className="flex-1 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'rgba(249,115,22,0.15)', color: '#F97316', border: '1px solid rgba(249,115,22,0.3)' }}
              >
                {reverting
                  ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : <><Undo2 size={13} /> Confirmar Estorno</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

    </AppLayout>
  )
}
