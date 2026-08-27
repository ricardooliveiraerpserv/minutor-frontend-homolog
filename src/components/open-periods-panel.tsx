'use client'

import { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Lock, ChevronDown } from 'lucide-react'

interface OpenPeriod {
  id: number
  project_id: number
  project_code: string | null
  project_name: string | null
  cliente: string | null
  year_month: string
  opened_by: string | null
  created_at: string
  auto_close_at: string | null
}

const fmtYM = (ym: string) => { const [y, m] = ym.split('-'); return `${m}/${y}` }
const fmtDT = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * Visão dos períodos de projeto abertos (ProjectOpenPeriod, closed_at=null) + fechar todos.
 * Usada em Configurações, Fechamento Administrativo e Gestão de Contratos.
 * - `hideWhenEmpty`: não renderiza nada quando não há períodos abertos (não polui a tela).
 * - `collapsible`: modo discreto (barrinha recolhida por padrão, expande ao clicar).
 */
export function OpenPeriodsPanel({ hideWhenEmpty = false, collapsible = false }: { hideWhenEmpty?: boolean; collapsible?: boolean }) {
  const [openPeriods, setOpenPeriods] = useState<OpenPeriod[]>([])
  const [loadingPeriods, setLoadingPeriods] = useState(true)
  const [closingAll, setClosingAll] = useState(false)
  const [confirmCloseAll, setConfirmCloseAll] = useState(false)
  const [confirmRowId, setConfirmRowId] = useState<number | null>(null)
  const [closingRowId, setClosingRowId] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(!collapsible)

  const loadOpenPeriods = useCallback(async () => {
    setLoadingPeriods(true)
    try {
      const r = await api.get<{ data: OpenPeriod[] }>('/projects-open-periods')
      setOpenPeriods(r.data ?? [])
    } catch { /* silencioso */ }
    finally { setLoadingPeriods(false) }
  }, [])

  useEffect(() => { loadOpenPeriods() }, [loadOpenPeriods])

  const closeAllPeriods = async () => {
    setClosingAll(true)
    try {
      const r = await api.post<{ message: string; count: number }>('/projects-open-periods/close-all', {})
      toast.success(r.message ?? 'Períodos fechados')
      setConfirmCloseAll(false)
      await loadOpenPeriods()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao fechar períodos')
    } finally {
      setClosingAll(false)
    }
  }

  const closeOne = async (id: number) => {
    setClosingRowId(id)
    try {
      await api.post(`/projects-open-periods/${id}/close`, {})
      toast.success('Período fechado')
      setConfirmRowId(null)
      await loadOpenPeriods()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao fechar período')
    } finally {
      setClosingRowId(null)
    }
  }

  if (hideWhenEmpty && !loadingPeriods && openPeriods.length === 0) return null

  const closeAllControl = !loadingPeriods && openPeriods.length > 0 && (
    confirmCloseAll ? (
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-[var(--text-muted)]">Fechar {openPeriods.length}?</span>
        <Button variant="destructive" size="sm" onClick={closeAllPeriods} disabled={closingAll}>
          {closingAll ? 'Fechando…' : 'Sim, fechar todos'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirmCloseAll(false)} disabled={closingAll}>Cancelar</Button>
      </div>
    ) : (
      <Button variant="destructive" size="sm" className="shrink-0 gap-1.5" onClick={() => setConfirmCloseAll(true)}>
        <Lock size={13} /> Fechar todos ({openPeriods.length})
      </Button>
    )
  )

  const table = loadingPeriods ? (
    <Skeleton className="h-16 w-full" />
  ) : openPeriods.length === 0 ? (
    <p className="text-xs text-[var(--text-light)]">Nenhum período de projeto aberto — tudo encerrado. ✅</p>
  ) : (
    <div className="rounded-xl border border-[var(--border)] overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[var(--surface-hover)] text-[var(--text-light)]">
            <th className="text-left font-medium px-3 py-2">Projeto</th>
            <th className="text-left font-medium px-3 py-2">Competência</th>
            <th className="text-left font-medium px-3 py-2">Fecha em</th>
            <th className="text-left font-medium px-3 py-2">Aberto por</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {openPeriods.map(p => (
            <tr key={p.id} className="border-t border-[var(--border)]">
              <td className="px-3 py-2 text-[var(--text)]">
                <div className="flex flex-col">
                  <span>
                    <span className="font-medium">{p.project_code ?? '—'}</span>
                    {p.cliente && <span className="text-[var(--text-light)]"> · {p.cliente}</span>}
                  </span>
                  {p.project_name && <span className="text-[var(--text-light)]">{p.project_name}</span>}
                </div>
              </td>
              <td className="px-3 py-2 text-[var(--text-muted)] tabular-nums">{fmtYM(p.year_month)}</td>
              <td className="px-3 py-2 text-[var(--text-muted)] tabular-nums whitespace-nowrap">{fmtDT(p.auto_close_at)}</td>
              <td className="px-3 py-2 text-[var(--text-muted)]">{p.opened_by ?? '—'}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {confirmRowId === p.id ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Button variant="destructive" size="xs" onClick={() => closeOne(p.id)} disabled={closingRowId === p.id}>
                      {closingRowId === p.id ? 'Fechando…' : 'Fechar'}
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => setConfirmRowId(null)} disabled={closingRowId === p.id}>Não</Button>
                  </span>
                ) : (
                  <Button variant="ghost" size="xs" className="gap-1" onClick={() => setConfirmRowId(p.id)} title="Fechar este período">
                    <Lock size={11} /> Fechar
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const footnote = (
    <p className="text-[11px] text-[var(--text-light)] mt-2">Projetos com o mês reaberto para lançamento. Fechar trava novos apontamentos nesses meses — o mês atual nunca é fechado.</p>
  )

  // ─── Modo discreto (colapsável) ──────────────────────────────────────────
  if (collapsible) {
    return (
      <div className="rounded-xl border border-[var(--border)] overflow-hidden" style={{ background: 'var(--surface)' }}>
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between px-4 py-2.5 gap-3 transition-colors hover:bg-[var(--surface-hover)]"
        >
          <div className="flex items-center gap-2 text-xs">
            <Lock size={13} style={{ color: openPeriods.length ? 'var(--warning-border)' : 'var(--text-light)' }} />
            <span className="font-medium text-[var(--text)]">Períodos de projeto abertos</span>
            {!loadingPeriods && openPeriods.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'var(--warning-bg)', color: 'var(--warning-border)' }}>{openPeriods.length}</span>
            )}
          </div>
          <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} style={{ color: 'var(--text-light)' }} />
        </button>
        {expanded && (
          <div className="px-4 pb-4 pt-2 border-t border-[var(--border)]">
            {closeAllControl && <div className="flex justify-end mb-2">{closeAllControl}</div>}
            {table}
            {footnote}
          </div>
        )}
      </div>
    )
  }

  // ─── Modo completo (Configurações / Fechamento) ──────────────────────────
  return (
    <section>
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--border)] gap-3">
        <h3 className="text-sm font-medium text-[var(--text)]">Períodos de projeto abertos</h3>
        {closeAllControl}
      </div>
      {table}
      {footnote}
    </section>
  )
}
