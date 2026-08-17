'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Central de Fontes — Campanha de Documentação Semântica Inicial (Admin).
// Painel governado: progresso, custo est/real/reservado, dedup, ETA, eventos + controles.
// Baseline one-shot; NÃO é o fluxo de GMUD. Interno ERPSERV.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { Megaphone, Play, Pause, RotateCcw, XCircle, RefreshCw } from 'lucide-react'
import { AppLayout } from '@/components/layout/app-layout'
import { Badge, Button, Card, EmptyState, PageHeader, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'

interface Campaign {
  id: number; name: string; status: string; pause_reason: string | null
  budget_usd: string; safety_margin: string; estimated_total_usd: string
  actual_cost_usd: string; reserved_cost_usd: string; max_concurrent: number
  total_candidates: number; unique_blobs: number; processed: number; reused: number
  completed: number; partial: number; skipped: number; failed: number
  cost_limit_skipped: number; giants_excluded: number
}
interface Detail { campaign: Campaign; progress: number; dedup_saving_usd_est: number; events: { id: number; event: string; created_at: string; meta: unknown }[] }

const STATUS_VARIANT: Record<string, string> = {
  draft: 'default', estimating: 'default', ready: 'primary', running: 'success',
  paused: 'warning', completed: 'success', completed_with_errors: 'warning', cancelled: 'default',
}

export default function CampanhaPage() {
  const [list, setList] = useState<Campaign[]>([])
  const [sel, setSel] = useState<Detail | null>(null)
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('300')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadList = useCallback(async () => {
    try { const r = await api.get<{ data: Campaign[] }>('/source-docs/campaigns'); setList(r.data) } catch (e) { setError(e instanceof ApiError ? e.message : 'Falha ao listar.') }
  }, [])
  const loadDetail = useCallback(async (id: number) => {
    try { const r = await api.get<{ data: Detail }>(`/source-docs/campaigns/${id}`); setSel(r.data) } catch { /* noop */ }
  }, [])

  useEffect(() => { void loadList() }, [loadList])
  // auto-refresh do detalhe enquanto roda
  useEffect(() => {
    if (!sel || !['running', 'estimating'].includes(sel.campaign.status)) return
    const t = setInterval(() => loadDetail(sel.campaign.id), 5000)
    return () => clearInterval(t)
  }, [sel, loadDetail])

  const create = async () => {
    setBusy(true); setError(null)
    try {
      const r = await api.post<{ data: Campaign }>('/source-docs/campaigns', { name: name || undefined, budget_usd: Number(budget) })
      await loadList(); await loadDetail(r.data.id); setName('')
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Falha ao criar.') } finally { setBusy(false) }
  }
  const act = async (id: number, action: string) => {
    setBusy(true)
    try { await api.post(`/source-docs/campaigns/${id}/${action}`, {}); await loadDetail(id); await loadList() }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Falha na ação.') } finally { setBusy(false) }
  }

  const c = sel?.campaign
  const money = (v: unknown) => `US$ ${Number(v ?? 0).toFixed(2)}`

  return (
    <AppLayout>
      <PageHeader icon={Megaphone} title="Campanha de Documentação Semântica"
        subtitle="Carga inicial governada do acervo — orçamento global, dedup por blob, pausa/retomada. Interno ERPSERV." />

      {error && <div className="mb-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</div>}

      <Card className="mb-4">
        <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Nova campanha (rascunho + estimativa)</h3>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]"><TextInput label="Nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Campanha baseline" /></div>
          <div className="w-40"><TextInput label="Orçamento (US$)" value={budget} onChange={(e) => setBudget(e.target.value)} /></div>
          <Button variant="primary" loading={busy} onClick={create}>Criar + estimar</Button>
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-light)' }}>Gigantes são excluídos automaticamente. O piloto usa um subconjunto (via API).</p>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold" style={{ color: 'var(--text)' }}>Campanhas</h3>
            <button onClick={loadList} title="Atualizar"><RefreshCw size={15} style={{ color: 'var(--text-light)' }} /></button>
          </div>
          {list.length === 0 ? <EmptyState icon={Megaphone} title="Nenhuma campanha" description="Crie a primeira acima." /> : (
            <div className="flex flex-col gap-2">
              {list.map((x) => (
                <Card key={x.id} padding="sm" onClick={() => loadDetail(x.id)} className="cursor-pointer">
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate" style={{ color: 'var(--text)' }}>{x.name}</span>
                    <Badge variant={STATUS_VARIANT[x.status] ?? 'default'}>{x.status}</Badge>
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-light)' }}>{x.processed}/{x.total_candidates} · {money(x.actual_cost_usd)}/{money(x.budget_usd)}</div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="md:col-span-2">
          {!c ? <EmptyState icon={Megaphone} title="Selecione uma campanha" description="Clique numa campanha à esquerda." /> : (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-semibold text-lg" style={{ color: 'var(--text)' }}>{c.name}</div>
                  <Badge variant={STATUS_VARIANT[c.status] ?? 'default'}>{c.status}</Badge>
                  {c.pause_reason && <span className="text-xs ml-2" style={{ color: 'var(--warning)' }}>({c.pause_reason})</span>}
                </div>
                <div className="flex gap-1.5">
                  {['ready', 'paused'].includes(c.status) && <Button size="sm" variant="primary" icon={c.status === 'paused' ? RotateCcw : Play} loading={busy} onClick={() => act(c.id, c.status === 'paused' ? 'resume' : 'start')}>{c.status === 'paused' ? 'Retomar' : 'Iniciar'}</Button>}
                  {c.status === 'running' && <Button size="sm" variant="secondary" icon={Pause} loading={busy} onClick={() => act(c.id, 'pause')}>Pausar</Button>}
                  {!['completed', 'cancelled'].includes(c.status) && <Button size="sm" variant="ghost" icon={XCircle} loading={busy} onClick={() => act(c.id, 'cancel')}>Cancelar</Button>}
                </div>
              </div>

              {/* barra de progresso */}
              <div className="h-2 rounded-full mb-1" style={{ background: 'var(--surface)' }}>
                <div className="h-2 rounded-full" style={{ width: `${sel?.progress ?? 0}%`, background: 'var(--primary)' }} />
              </div>
              <div className="text-xs mb-3" style={{ color: 'var(--text-light)' }}>{sel?.progress ?? 0}% · {c.processed}/{c.total_candidates} fontes · {c.unique_blobs} blobs únicos · {c.giants_excluded} gigantes excluídos</div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                {[
                  ['Orçamento', money(c.budget_usd)], ['Gasto real', money(c.actual_cost_usd)],
                  ['Reservado', money(c.reserved_cost_usd)], ['Estimado total', money(c.estimated_total_usd)],
                  ['Completas', c.completed], ['Parciais', c.partial], ['Reusos', c.reused], ['Falhas', c.failed],
                  ['Skipped', c.skipped], ['Cost-limit', c.cost_limit_skipped], ['Economia dedup', money(sel?.dedup_saving_usd_est)], ['Concorrência', c.max_concurrent],
                ].map(([k, v]) => (
                  <div key={String(k)} className="rounded-lg p-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="text-sm font-semibold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                    <div className="text-xs" style={{ color: 'var(--text-light)' }}>{k}</div>
                  </div>
                ))}
              </div>

              <h4 className="font-semibold mb-1 text-sm" style={{ color: 'var(--text)' }}>Eventos</h4>
              <div className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                {(sel?.events ?? []).map((e) => (
                  <div key={e.id}>• {e.event}{typeof e.meta === 'object' && e.meta ? ` (${JSON.stringify(e.meta)})` : ''} <span style={{ color: 'var(--text-light)' }}>{e.created_at?.slice(0, 19).replace('T', ' ')}</span></div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
