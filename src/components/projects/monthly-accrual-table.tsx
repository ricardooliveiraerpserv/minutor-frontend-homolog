'use client'

// Tabela das horas mensais incrementadas de um projeto Banco de Horas Mensal.
//
// DOIS MODOS:
//  • Legado (sem `projectId`): puramente derivada (start_date + horas/mês +
//    acumulado). Só a coluna Horas. Usado no perfil do cliente por ora.
//  • Extrato (com `projectId`): busca `/projects/{id}/monthly-statement` e mostra
//    Horas (acumulado) · Consumo (mensal) · Saldo (acumulado). O consumo dos meses
//    anteriores ao corte (2026-05) é editável quando `canEditConsumption`; de
//    2026-05 em diante vem dos apontamentos (read-only).

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'

interface MonthlyAccrualTableProps {
  startDate?: string | null
  /** Só usado no modo legado (sem projectId). No modo extrato vem do backend. */
  hoursPerMonth?: number
  /** Total acumulado (já congelado no encerramento). Define o nº de meses. */
  accumulated?: number | null
  /** Encerramento — usado só no fallback quando não há acumulado. */
  endDate?: string | null
  variant?: 'brand' | 'default'
  /** Ativa o modo extrato (consumo + saldo) buscando o statement do backend. */
  projectId?: number
  /** Permite editar o consumo dos meses anteriores ao corte (admin/coord). */
  canEditConsumption?: boolean
  /** Statement já pronto (ex.: perfil do cliente — vem do summary, sem fetch nem edição). */
  statement?: Statement | null
  /** Breakdown mensal vigência-aware vindo do backend (soma das horas vendidas vigentes
   *  por mês). Quando presente, o modo legado usa isto em vez da derivação naive. */
  monthlyIncrements?: { year_month: string; hours: number }[] | null
}

type StatementType = 'monthly' | 'fixed' | 'on_demand' | 'none'
interface StatementRow {
  year_month: string
  vendidas_hours: number | null
  /** Incremento de horas vendidas deste mês (BH Mensal): valor VIGENTE na competência. */
  monthly_hours?: number | null
  aporte_hours?: number
  consumption_hours: number
  child_block_hours?: number
  accumulated_consumption_hours: number
  balance_hours: number | null
  editable: boolean
}
interface Statement {
  statement_type: StatementType
  rows: StatementRow[]
  total_vendidas_hours: number | null
  total_consumption_hours: number
  balance_hours: number | null
  cutoff: string
}

function tokens(variant: 'brand' | 'default') {
  return variant === 'brand'
    ? { surface: 'var(--brand-surface)', border: 'var(--brand-border)', text: 'var(--brand-text)', muted: 'var(--brand-muted)', subtle: 'var(--brand-subtle)' }
    : { surface: 'var(--surface)', border: 'var(--border)', text: 'var(--text)', muted: 'var(--text-muted)', subtle: 'var(--text-light)' }
}

const fmtMonth = (ym: string) => { const [y, m] = ym.split('-'); return `${m}/${y}` }
const fmtH = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}h`

export function MonthlyAccrualTable({ startDate, hoursPerMonth = 0, accumulated, endDate, variant = 'default', projectId, canEditConsumption, statement, monthlyIncrements }: MonthlyAccrualTableProps) {
  const t = tokens(variant)

  // ── Estado do modo extrato (hooks sempre chamados; corpo é condicional) ──
  const [stmt, setStmt] = useState<Statement | null>(null)
  const [loading, setLoading] = useState(false)
  const [savingYm, setSavingYm] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})

  const loadStmt = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const data = await api.get<Statement>(`/projects/${projectId}/monthly-statement`)
      setStmt(data)
      setDraft({})
    } catch {
      /* silencioso — sem statement cai no "nada a mostrar" */
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { if (projectId) void loadStmt() }, [projectId, loadStmt])

  const saveConsumption = async (ym: string, value: string) => {
    if (!projectId) return
    const hours = value.trim() === '' ? 0 : Number(value.replace(',', '.'))
    if (isNaN(hours) || hours < 0) { toast.error('Valor de consumo inválido'); return }
    setSavingYm(ym)
    try {
      await api.put(`/projects/${projectId}/monthly-consumption`, { year_month: ym, hours })
      await loadStmt()
      toast.success(`Consumo de ${fmtMonth(ym)} atualizado`)
    } catch {
      toast.error('Erro ao salvar consumo')
    } finally {
      setSavingYm(null)
    }
  }

  // ───────────────────────── MODO EXTRATO ─────────────────────────
  // projectId → busca o statement (admin, com edição); `statement` pronto → só exibe (cliente).
  if (projectId || statement) {
    if (projectId && loading && !stmt) {
      return (
        <div className="rounded-xl px-4 py-6 text-center text-xs" style={{ border: `1px solid ${t.border}`, background: t.surface, color: t.subtle }}>
          Carregando extrato…
        </div>
      )
    }
    const s = projectId ? stmt : statement
    const editable = !!projectId && !!canEditConsumption
    if (!s || s.rows.length === 0) return null

    // Colunas por tipo: Mensal/Fixo/Fechado mostram Vendidas+Saldo; On Demand só Consumo.
    const showVendidas = s.statement_type === 'monthly' || s.statement_type === 'fixed'
    const vendidasLabel = s.statement_type === 'monthly' ? 'Vendidas (acum.)' : 'Vendidas'
    const headerRight = showVendidas
      ? `${s.rows.length} ${s.rows.length === 1 ? 'mês' : 'meses'} · ${fmtH(s.total_vendidas_hours ?? 0)} vendidas`
      : `${s.rows.length} ${s.rows.length === 1 ? 'mês' : 'meses'} · ${fmtH(s.total_consumption_hours)} consumidas`
    const thCls = 'px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider'

    return (
      <div className="rounded-xl overflow-clip" style={{ border: `1px solid ${t.border}`, background: t.surface }}>
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: t.border }}>
          <h3 className="text-sm font-bold" style={{ color: t.text }}>Situação do Contrato (mês a mês)</h3>
          <span className="text-xs" style={{ color: t.subtle }}>{headerRight}</span>
        </div>
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10" style={{ background: t.surface }}>
              <tr style={{ borderBottom: `1px solid ${t.border}` }}>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.subtle }}>Mês</th>
                {showVendidas && <th className={thCls} style={{ color: t.subtle }}>{vendidasLabel}</th>}
                <th className={thCls} style={{ color: t.subtle }}>Consumo</th>
                {showVendidas && <th className={thCls} style={{ color: t.subtle }}>Saldo</th>}
              </tr>
            </thead>
            <tbody>
              {s.rows.map(r => {
                const negative = (r.balance_hours ?? 0) < 0
                const canEdit = r.editable && editable
                return (
                  <tr key={r.year_month} style={{ borderBottom: `1px solid ${t.border}` }}>
                    <td className="px-3 py-2 tabular-nums" style={{ color: t.muted }}>{fmtMonth(r.year_month)}</td>
                    {showVendidas && (
                      <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: t.text }}>
                        {fmtH(r.vendidas_hours ?? 0)}
                        {(r.monthly_hours ?? 0) > 0 && (
                          <span className="block text-[10px] font-medium" style={{ color: 'var(--primary)' }}>+{fmtH(r.monthly_hours ?? 0)} mensal</span>
                        )}
                        {(r.aporte_hours ?? 0) > 0 && (
                          <span className="block text-[10px] font-medium" style={{ color: 'var(--success)' }}>+{fmtH(r.aporte_hours ?? 0)} aporte</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: t.text }}>
                      {canEdit ? (
                        <div className="inline-flex items-center gap-1 justify-end">
                          <input
                            type="number" min="0" step="0.5"
                            disabled={savingYm === r.year_month}
                            value={draft[r.year_month] ?? (r.consumption_hours ? String(r.consumption_hours) : '')}
                            onChange={e => setDraft(d => ({ ...d, [r.year_month]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                            onBlur={e => {
                              const v = e.target.value
                              const current = r.consumption_hours ? String(r.consumption_hours) : ''
                              if (v !== current) void saveConsumption(r.year_month, v)
                            }}
                            placeholder="0"
                            className="w-16 px-1.5 py-1 rounded-md text-right text-xs tabular-nums outline-none focus:ring-1 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:opacity-50"
                            style={{ background: 'var(--surface-sunken)', border: `1px solid ${t.border}`, color: t.text }}
                          />
                          <span className="text-[11px]" style={{ color: t.subtle }}>h</span>
                        </div>
                      ) : (
                        <span className="font-semibold">{fmtH(r.consumption_hours)}</span>
                      )}
                      {(r.child_block_hours ?? 0) > 0 && (
                        <span className="block text-[10px] font-medium" style={{ color: 'var(--warning)' }}>+{fmtH(r.child_block_hours ?? 0)} filho</span>
                      )}
                    </td>
                    {showVendidas && <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: negative ? 'var(--danger)' : t.text }}>{r.balance_hours != null ? fmtH(r.balance_hours) : '—'}</td>}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `1px solid ${t.border}` }}>
                <td className="px-3 py-2.5 text-right text-[13px] font-bold" style={{ color: t.text }}>Total</td>
                {showVendidas && <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: t.text }}>{fmtH(s.total_vendidas_hours ?? 0)}</td>}
                <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: t.text }}>{fmtH(s.total_consumption_hours)}</td>
                {showVendidas && <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: (s.balance_hours ?? 0) < 0 ? 'var(--danger)' : t.text }}>{s.balance_hours != null ? fmtH(s.balance_hours) : '—'}</td>}
              </tr>
            </tfoot>
          </table>
        </div>
        {editable && (
          <div className="px-4 py-2 text-[10px]" style={{ borderTop: `1px solid ${t.border}`, color: t.subtle }}>
            Consumo editável até 04/2026 (histórico). De 05/2026 em diante vem dos apontamentos.
          </div>
        )}
      </div>
    )
  }

  // ───────────────────────── MODO LEGADO (derivado) ─────────────────────────
  // Preferir o breakdown vigência-aware do backend (monthlyIncrements): cada mês com
  // a quantidade VIGENTE — não muda os meses anteriores ao alterar as horas. Sem ele,
  // cai na derivação naive (start_date + horas/mês constante).
  let rows: { label: string; hours: number }[] = []
  if (monthlyIncrements && monthlyIncrements.length > 0) {
    rows = monthlyIncrements.map(mi => ({ label: fmtMonth(mi.year_month), hours: mi.hours }))
  } else {
    // Nº de meses: preferir o acumulado (congela no encerramento); senão, do
    // início até hoje (ou até o encerramento, se informado).
    let months = 0
    if (hoursPerMonth > 0) {
      if (accumulated != null && accumulated > 0) {
        months = Math.max(0, Math.round(accumulated / hoursPerMonth))
      } else if (startDate) {
        const s = new Date(startDate + 'T00:00:00')
        const end = endDate ? new Date(endDate + 'T00:00:00') : new Date()
        months = Math.max(0, (end.getFullYear() - s.getFullYear()) * 12 + (end.getMonth() - s.getMonth()) + 1)
      }
    }
    if (!startDate || hoursPerMonth <= 0 || months <= 0) return null
    const s = new Date(startDate + 'T00:00:00')
    rows = Array.from({ length: months }, (_, i) => {
      const d = new Date(s.getFullYear(), s.getMonth() + i, 1)
      return { label: `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`, hours: hoursPerMonth }
    })
  }

  if (rows.length === 0) return null
  const total = rows.reduce((s, r) => s + r.hours, 0)

  return (
    <div className="rounded-xl overflow-clip" style={{ border: `1px solid ${t.border}`, background: t.surface }}>
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: t.border }}>
        <h3 className="text-sm font-bold" style={{ color: t.text }}>Horas Mensais Incrementadas</h3>
        <span className="text-xs" style={{ color: t.subtle }}>{rows.length} {rows.length === 1 ? 'mês' : 'meses'} · {total}h</span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10" style={{ background: t.surface }}>
            <tr style={{ borderBottom: `1px solid ${t.border}` }}>
              <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.subtle }}>Mês</th>
              <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.subtle }}>Horas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${t.border}` }}>
                <td className="px-4 py-2 tabular-nums" style={{ color: t.muted }}>{r.label}</td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold" style={{ color: t.text }}>{r.hours}h</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `1px solid ${t.border}` }}>
              <td className="px-4 py-2.5 text-right text-[13px] font-bold" style={{ color: t.text }}>Total</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-bold" style={{ color: t.text }}>{total}h</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
