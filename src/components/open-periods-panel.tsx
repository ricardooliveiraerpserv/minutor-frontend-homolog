'use client'

import { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Lock } from 'lucide-react'

interface OpenPeriod {
  id: number
  project_id: number
  project_code: string | null
  project_name: string | null
  cliente: string | null
  year_month: string
  opened_by: string | null
  created_at: string
}

const fmtYM = (ym: string) => { const [y, m] = ym.split('-'); return `${m}/${y}` }

/**
 * Visão dos períodos de projeto abertos (ProjectOpenPeriod, closed_at=null) + fechar todos.
 * Usada em Configurações e na tela de Fechamento Administrativo.
 * `hideWhenEmpty`: não renderiza nada quando não há períodos abertos (útil pra não poluir telas).
 */
export function OpenPeriodsPanel({ hideWhenEmpty = false }: { hideWhenEmpty?: boolean }) {
  const [openPeriods, setOpenPeriods] = useState<OpenPeriod[]>([])
  const [loadingPeriods, setLoadingPeriods] = useState(true)
  const [closingAll, setClosingAll] = useState(false)
  const [confirmCloseAll, setConfirmCloseAll] = useState(false)

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

  if (hideWhenEmpty && !loadingPeriods && openPeriods.length === 0) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--border)] gap-3">
        <h3 className="text-sm font-medium text-[var(--text)]">Períodos de projeto abertos</h3>
        {!loadingPeriods && openPeriods.length > 0 && (
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
        )}
      </div>

      {loadingPeriods ? (
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
                <th className="text-left font-medium px-3 py-2">Aberto por</th>
              </tr>
            </thead>
            <tbody>
              {openPeriods.map(p => (
                <tr key={p.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 text-[var(--text)]">
                    <span className="font-medium">{p.project_code ?? '—'}</span>
                    {p.cliente && <span className="text-[var(--text-light)]"> · {p.cliente}</span>}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-muted)] tabular-nums">{fmtYM(p.year_month)}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{p.opened_by ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-[var(--text-light)] mt-2">Projetos com o mês reaberto para lançamento. Fechar trava novos apontamentos nesses meses — o mês atual nunca é fechado.</p>
    </section>
  )
}
