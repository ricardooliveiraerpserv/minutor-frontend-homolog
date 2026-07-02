'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { Clock, Plus, Pencil, Trash2, X, Search, Check } from 'lucide-react'

interface BalanceRow {
  id: number
  ticket: string
  customer_id: number
  project_id: number
  initial_minutes: number
  description: string | null
  created_at: string
  customer: { id: number; name: string } | null
  project:  { id: number; name: string; code: string } | null
  creator:  { id: number; name: string } | null
}

interface LookupResult {
  ticket: string
  customer: { id: number; name: string } | null
  project:  { id: number; name: string; code: string } | null
}

// HH:MM <-> minutos
function hhmmToMinutes(s: string): number | null {
  const t = s.trim()
  if (!t) return 0
  const m = t.match(/^(\d{1,5}):(\d{2})$/)
  if (!m) return null
  const h = parseInt(m[1], 10), mm = parseInt(m[2], 10)
  if (Number.isNaN(h) || Number.isNaN(mm) || mm >= 60) return null
  return h * 60 + mm
}
function minutesToHHMM(min: number): string {
  if (!min) return '0:00'
  const h = Math.floor(min / 60), m = min % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

export default function SaldoInicialTicketsPage() {
  const { user } = useAuth()
  const isAdmin = user?.type === 'admin'
  const isCoord = user?.type === 'coordenador'

  const [rows, setRows]       = useState<BalanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [modal, setModal]     = useState<{ open: boolean; row?: BalanceRow }>({ open: false })
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id?: number }>({ open: false })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ pageSize: '200' })
      if (search) qs.set('ticket', search)
      const r = await api.get<{ items: BalanceRow[] }>(`/ticket-initial-balances?${qs}`)
      setRows(r?.items ?? [])
    } catch {
      toast.error('Erro ao carregar saldos iniciais')
    } finally { setLoading(false) }
  }, [search])

  useEffect(() => { load() }, [load])

  const onDelete = async (id: number) => {
    try {
      await api.delete(`/ticket-initial-balances/${id}`)
      toast.success('Saldo inicial removido')
      setDeleteConfirm({ open: false })
      load()
    } catch { toast.error('Erro ao remover') }
  }

  if (!isAdmin && !isCoord) {
    return (
      <AppLayout title="Saldo Inicial de Tickets">
        <div className="max-w-3xl mx-auto p-6 text-center" style={{ color: 'var(--brand-muted)' }}>
          Apenas administradores e coordenadores têm acesso a este cadastro.
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Saldo Inicial de Tickets">
      <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 space-y-4">
        <header className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
            <Clock size={16} color="var(--primary)" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold" style={{ color: 'var(--brand-text)' }}>Saldo Inicial de Tickets</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--brand-muted)' }}>
              Horas históricas anteriores à entrada do ticket no Minutor. Somam apenas na coluna "Hist. de Hs Tikets" e no relatório de Apuração por Ticket — não geram receita/despesa.
            </p>
          </div>
          <button
            onClick={() => setModal({ open: true })}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
            style={{ background: 'var(--brand-primary)', color: 'var(--primary-fg)' }}
          >
            <Plus size={12} /> Novo
          </button>
        </header>

        <div className="rounded-2xl p-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Search size={13} className="text-[var(--text-light)]" />
            <input
              type="text"
              inputMode="numeric"
              placeholder="Buscar por ticket (ex: 48138)"
              value={search}
              onChange={e => setSearch(e.target.value.replace(/\D/g, ''))}
              className="flex-1 rounded-lg px-3 py-2 text-xs border outline-none"
              style={{ background: 'var(--brand-bg)', borderColor: 'var(--brand-border)', color: 'var(--brand-text)' }}
            />
          </div>

          <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--brand-border)' }}>
            <table className="w-full text-sm" style={{ background: 'var(--brand-surface)' }}>
              <thead className="text-xs uppercase tracking-wide" style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--brand-subtle)' }}>
                <tr>
                  <th className="text-left px-3 py-2.5">Ticket</th>
                  <th className="text-left px-3 py-2.5">Cliente</th>
                  <th className="text-left px-3 py-2.5">Projeto</th>
                  <th className="text-right px-3 py-2.5">Saldo Inicial</th>
                  <th className="text-left px-3 py-2.5">Descrição</th>
                  <th className="text-left px-3 py-2.5">Cadastrado por</th>
                  <th className="px-3 py-2.5 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-8 text-xs" style={{ color: 'var(--brand-muted)' }}>Carregando…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-xs" style={{ color: 'var(--brand-muted)' }}>Nenhum saldo inicial cadastrado.</td></tr>
                ) : rows.map(r => (
                  <tr key={r.id} className="border-t" style={{ borderColor: 'var(--brand-border)' }}>
                    <td className="px-3 py-2.5 font-mono text-xs">#{r.ticket}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--brand-text)' }}>{r.customer?.name ?? '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--brand-text)' }} title={r.project?.name ?? undefined}>{r.project?.code} — {r.project?.name}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: 'var(--brand-primary)' }}>{minutesToHHMM(r.initial_minutes)}</td>
                    <td className="px-3 py-2.5 text-xs max-w-[300px] truncate" title={r.description ?? undefined} style={{ color: 'var(--brand-muted)' }}>{r.description ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--brand-muted)' }}>{r.creator?.name ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={() => setModal({ open: true, row: r })} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)]" title="Editar">
                          <Pencil size={12} style={{ color: 'var(--brand-muted)' }} />
                        </button>
                        <button onClick={() => setDeleteConfirm({ open: true, id: r.id })} className="p-1.5 rounded-lg hover:bg-[var(--danger-bg)]" title="Remover">
                          <Trash2 size={12} className="text-[var(--danger)]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {modal.open && (
          <BalanceModal row={modal.row} onClose={() => setModal({ open: false })} onSaved={() => { setModal({ open: false }); load() }} />
        )}

        {deleteConfirm.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteConfirm({ open: false })} />
            <div className="relative rounded-2xl p-6 w-full max-w-sm mx-4" style={{ background: '#111113', border: '1px solid #3f3f46' }}>
              <h3 className="text-sm font-semibold text-white mb-3">Remover saldo inicial?</h3>
              <p className="text-xs text-[var(--text-muted)] mb-4">A operação é reversível (soft-delete), mas o saldo sumirá imediatamente da coluna "Hist. de Hs Tikets".</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setDeleteConfirm({ open: false })} className="px-3 py-1.5 text-xs rounded-lg text-[var(--text)] hover:bg-[var(--surface-hover)]">Cancelar</button>
                <button onClick={() => deleteConfirm.id && onDelete(deleteConfirm.id)} className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-[var(--danger-border)]">Remover</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function BalanceModal({ row, onClose, onSaved }: {
  row?: BalanceRow
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!row
  const [ticket,   setTicket]   = useState(row?.ticket ?? '')
  const [hhmm,     setHhmm]     = useState(row ? minutesToHHMM(row.initial_minutes) : '')
  const [description, setDescription] = useState(row?.description ?? '')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookup, setLookup] = useState<LookupResult | null>(
    row ? { ticket: row.ticket, customer: row.customer, project: row.project } : null
  )
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const doLookup = useCallback(async () => {
    if (!ticket || !/^\d{5}$/.test(ticket) || isEdit) return
    setLookupLoading(true)
    setLookupError(null)
    try {
      const r = await api.get<LookupResult>(`/ticket-initial-balances/lookup?ticket=${ticket}`)
      setLookup(r)
    } catch (e: any) {
      setLookup(null)
      setLookupError(e?.message ?? 'Ticket não encontrado nos apontamentos do Minutor')
    } finally { setLookupLoading(false) }
  }, [ticket, isEdit])

  const canSave = !!hhmm && (isEdit || (!!lookup?.customer && !!lookup?.project))
  const minutes = hhmmToMinutes(hhmm)

  const save = async () => {
    if (minutes === null) { toast.error('Formato inválido — use HH:MM (ex: 12:30)'); return }
    setSaving(true)
    try {
      if (isEdit) {
        await api.put(`/ticket-initial-balances/${row!.id}`, {
          initial_minutes: minutes,
          description: description || null,
        })
        toast.success('Saldo atualizado')
      } else {
        await api.post('/ticket-initial-balances', {
          ticket,
          customer_id: lookup!.customer!.id,
          project_id:  lookup!.project!.id,
          initial_minutes: minutes,
          description: description || null,
        })
        toast.success('Saldo inicial cadastrado')
      }
      onSaved()
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const lblStyle: React.CSSProperties = { fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brand-subtle)', marginBottom: '6px', display: 'block' }
  const inpStyle: React.CSSProperties = { width: '100%', background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', borderRadius: '0.625rem', padding: '0.5rem 0.75rem', fontSize: '0.8125rem', color: 'var(--brand-text)', outline: 'none' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative rounded-2xl p-6 w-full max-w-md mx-4" style={{ background: '#111113', border: '1px solid #3f3f46' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">
            {isEdit ? `Editar saldo — #${row!.ticket}` : 'Novo saldo inicial de ticket'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--surface-hover)] rounded-lg transition-colors">
            <X size={14} className="text-[var(--text-muted)]" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label style={lblStyle}>Ticket</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={5}
              value={ticket}
              onChange={e => { setTicket(e.target.value.replace(/\D/g, '')); if (!isEdit) { setLookup(null); setLookupError(null); } }}
              onBlur={doLookup}
              onKeyDown={e => { if (e.key === 'Enter') doLookup() }}
              disabled={isEdit}
              placeholder="ex: 48138"
              style={{ ...inpStyle, opacity: isEdit ? 0.6 : 1 }}
            />
            {!isEdit && lookupLoading && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--brand-muted)' }}>Buscando ticket nos apontamentos…</p>
            )}
            {!isEdit && lookupError && (
              <p className="text-[11px] mt-1 text-[var(--danger)]">{lookupError}</p>
            )}
          </div>

          {lookup?.customer && (
            <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-soft)' }}>
              <div className="flex items-center gap-1.5 mb-1" style={{ color: 'var(--brand-primary)' }}>
                <Check size={11} /> <span className="font-semibold">Ticket encontrado</span>
              </div>
              <div className="text-[11px]" style={{ color: 'var(--brand-text)' }}>
                <strong>Cliente:</strong> {lookup.customer.name}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--brand-text)' }}>
                <strong>Projeto:</strong> {lookup.project?.code} — {lookup.project?.name}
              </div>
            </div>
          )}

          <div>
            <label style={lblStyle}>Saldo Inicial (HH:MM)</label>
            <input
              type="text"
              value={hhmm}
              onChange={e => setHhmm(e.target.value)}
              placeholder="ex: 12:30"
              style={inpStyle}
            />
            {hhmm && minutes === null && (
              <p className="text-[11px] mt-1 text-[var(--danger)]">Formato inválido — use HH:MM</p>
            )}
          </div>

          <div>
            <label style={lblStyle}>Descrição (opcional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Motivo / referência do saldo"
              style={{ ...inpStyle, resize: 'vertical' }}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold transition-colors text-[var(--text)] hover:bg-[var(--surface-hover)]">Cancelar</button>
          <button
            onClick={save}
            disabled={!canSave || saving || minutes === null}
            className="px-4 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
            style={{ background: 'var(--brand-primary)', color: 'var(--primary-fg)' }}
          >
            {saving ? 'Salvando…' : (isEdit ? 'Salvar' : 'Cadastrar')}
          </button>
        </div>
      </div>
    </div>
  )
}
