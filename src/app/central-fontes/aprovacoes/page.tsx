'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Central de Fontes — Frente A · Aprovações de IA.
// Fila das solicitações abertas quando o próximo passo estouraria o limite operacional
// por fonte. Aprovador: liberar só o próximo passo, elevar o teto desta fonte (≤ teto
// administrativo), encerrar parcial ou rejeitar. Interno ERPSERV. Motor congelado.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, ChevronDown, Coins, FileCode2, Gauge, XCircle } from 'lucide-react'
import { AppLayout } from '@/components/layout/app-layout'
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Select, Skeleton, TextInput } from '@/components/ds'
import { api, ApiError } from '@/lib/api'

interface Approval {
  id: number; source_doc_id: number; status: string
  actual_cost_usd: number; authorized_limit_usd: number
  next_step: string; estimated_next_usd: number; new_limit_usd: number | null
  reason: string | null; completeness_level: string | null; recommendation: string | null
  gaps_json: string[] | null
  filename: string | null; path: string | null; repository: string | null
  customer_id: number | null; customer_name: string | null
  created_at: string
}
interface DetailSettings {
  automatic_cost_limit_usd: number; safety_margin_percent: number
  operational_limit_usd: number; max_approved_cost_usd: number
  source_label: string
}

const money = (n: number | null | undefined) => `US$ ${Number(n || 0).toFixed(2)}`
const STEP_LABEL: Record<string, string> = { reprocess: 'Reprocessamento', top_up: 'Top-up', critical_rules: 'Regras críticas', deepen: 'Aprofundamento', initial: 'Análise inicial' }

export default function AprovacoesIaPage() {
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Approval[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [detail, setDetail] = useState<Record<number, DetailSettings>>({})
  const [limitModal, setLimitModal] = useState<Approval | null>(null)
  const [newLimit, setNewLimit] = useState('')
  const [confirm, setConfirm] = useState<{ a: Approval; action: string; title: string; lines: string[]; note: string; confirmLabel: string; variant: 'primary' | 'danger' } | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await api.get<{ data: Approval[] }>(`/source-docs/cost-approvals?status=${status}`)
      setRows(resp.data || [])
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : 'Falha ao carregar a fila.' })
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { void load() }, [load])

  const fetchDetail = useCallback(async (a: Approval) => {
    if (detail[a.id]) return
    try {
      const resp = await api.get<{ data: { settings: DetailSettings } }>(`/source-docs/cost-approvals/${a.id}`)
      if (resp.data?.settings) setDetail((d) => ({ ...d, [a.id]: resp.data.settings }))
    } catch { /* silencioso: o card ainda funciona sem o bloco de origem */ }
  }, [detail])

  const openDetail = useCallback(async (a: Approval) => {
    setExpanded(expanded === a.id ? null : a.id)
    await fetchDetail(a)
  }, [expanded, fetchDetail])

  const act = useCallback(async (a: Approval, action: string, body?: unknown) => {
    setBusy(a.id); setMsg(null)
    try {
      await api.post(`/source-docs/cost-approvals/${a.id}/${action}`, body ?? {})
      setMsg({ kind: 'ok', text: 'Decisão registrada e auditada.' })
      setLimitModal(null)
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : 'Falha ao decidir.' })
    } finally {
      setBusy(null)
    }
  }, [load])

  return (
    <AppLayout>
      <PageHeader
        icon={BadgeCheck}
        title="Aprovações de IA"
        subtitle="Solicitações abertas quando o próximo passo ultrapassaria o limite operacional por fonte. Nenhuma IA é chamada até a decisão."
        actions={
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Pendentes</option>
            <option value="approved_step">Passo liberado</option>
            <option value="approved_limit">Teto elevado</option>
            <option value="closed_partial">Encerradas parciais</option>
            <option value="rejected">Rejeitadas</option>
            <option value="all">Todas</option>
          </Select>
        }
      />

      {msg && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${msg.kind === 'ok' ? 'bg-[var(--success-bg,#ecfdf5)] text-[var(--success-fg,#047857)]' : 'bg-[var(--danger-bg,#fef2f2)] text-[var(--danger-fg,#b91c1c)]'}`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <EmptyState icon={BadgeCheck} title="Nenhuma solicitação" description="Não há aprovações neste filtro." />
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((a) => {
            const projected = Number(a.actual_cost_usd) + Number(a.estimated_next_usd)
            const isOpen = a.status === 'pending'
            const d = detail[a.id]
            return (
              <Card key={a.id}>
                <div className="flex flex-col gap-3">
                  {/* cabeçalho: fonte + status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCode2 size={16} className="shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{a.filename || a.path}</div>
                        <div className="text-xs text-[var(--muted-fg,#64748b)] truncate">
                          {a.customer_name ? `${a.customer_name} · ` : ''}{a.repository} · {a.path}
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>

                  {/* métricas do card (exatamente: custo atual / próximo passo / total projetado) */}
                  <div className="flex flex-wrap gap-x-8 gap-y-2">
                    <Metric label="Custo atual" value={money(a.actual_cost_usd)} />
                    <Metric label={`Próximo passo (${STEP_LABEL[a.next_step] || a.next_step})`} value={money(a.estimated_next_usd)} />
                    <Metric label="Total projetado" value={money(projected)} strong />
                    <Metric label="Limite operacional" value={money(a.authorized_limit_usd)} />
                  </div>

                  {a.reason && <div className="text-sm text-[var(--muted-fg,#64748b)]">Motivo: {a.reason}</div>}

                  {/* detalhe (origem do limite efetivo + operacional pós-margem) */}
                  <button onClick={() => openDetail(a)} className="self-start text-xs flex items-center gap-1 text-[var(--accent-fg,#2563eb)]">
                    <ChevronDown size={14} className={expanded === a.id ? 'rotate-180 transition' : 'transition'} /> Detalhes do limite
                  </button>
                  {expanded === a.id && (
                    <div className="rounded-lg bg-[var(--subtle-bg,#f8fafc)] px-4 py-3 text-sm">
                      {d ? (
                        <div className="flex flex-wrap gap-x-8 gap-y-2">
                          <Metric label="Configurado" value={money(d.automatic_cost_limit_usd)} />
                          <Metric label="Margem" value={`${d.safety_margin_percent}%`} />
                          <Metric label="Operacional" value={money(d.operational_limit_usd)} />
                          <Metric label="Teto aprovável" value={money(d.max_approved_cost_usd)} />
                          <div className="flex flex-col">
                            <span className="text-xs text-[var(--muted-fg,#64748b)]">Origem</span>
                            <span className="text-sm font-medium">{d.source_label}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--muted-fg,#64748b)]">Carregando origem…</span>
                      )}
                      {a.completeness_level && <div className="mt-2 text-xs">Completude atual: <Badge variant="warning">{a.completeness_level}</Badge></div>}
                      {a.gaps_json && a.gaps_json.length > 0 && <div className="mt-1 text-xs text-[var(--muted-fg,#64748b)]">Falta: {a.gaps_json.join(', ')}</div>}
                      {a.recommendation && <div className="mt-1 text-xs">Recomendação: {a.recommendation}</div>}
                    </div>
                  )}

                  {/* ações (só para pendentes) — toda ação financeira/irreversível passa por confirmação */}
                  {isOpen && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="primary" icon={BadgeCheck} disabled={busy === a.id} onClick={() => setConfirm({
                        a, action: 'approve-step', title: 'Aprovar próximo passo?', variant: 'primary', confirmLabel: 'Aprovar passo',
                        lines: [`Fonte: ${a.filename || a.path}`, `Custo atual: ${money(a.actual_cost_usd)}`, `Próximo passo: até ${money(a.estimated_next_usd)}`, `Total projetado: até ${money(Number(a.actual_cost_usd) + Number(a.estimated_next_usd))}`],
                        note: 'Esta autorização é válida somente para o próximo passo semântico.',
                      })}>
                        Aprovar próximo passo
                      </Button>
                      <Button size="sm" variant="secondary" icon={Gauge} disabled={busy === a.id} onClick={() => { setLimitModal(a); void fetchDetail(a); setNewLimit((Math.min(Number(a.actual_cost_usd) + 0.5, (detail[a.id]?.max_approved_cost_usd ?? 3))).toFixed(2)) }}>
                        Alterar teto desta fonte
                      </Button>
                      <Button size="sm" variant="secondary" disabled={busy === a.id} onClick={() => setConfirm({
                        a, action: 'close-partial', title: 'Encerrar como parcial?', variant: 'primary', confirmLabel: 'Encerrar parcial',
                        lines: [`Fonte: ${a.filename || a.path}`],
                        note: 'A fonte permanecerá documentada no estado atual e não consumirá novos passos.',
                      })}>
                        Encerrar parcial
                      </Button>
                      <Button size="sm" variant="danger" icon={XCircle} disabled={busy === a.id} onClick={() => setConfirm({
                        a, action: 'reject', title: 'Rejeitar solicitação?', variant: 'danger', confirmLabel: 'Rejeitar',
                        lines: [`Fonte: ${a.filename || a.path}`],
                        note: 'A solicitação será encerrada sem ampliar o orçamento desta fonte.',
                      })}>
                        Rejeitar
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal: alterar teto da fonte (clamp administrativo visível) */}
      <Modal open={!!limitModal} onClose={() => setLimitModal(null)} title="Alterar teto desta fonte">
        {limitModal && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[var(--muted-fg,#64748b)]">
              Novo teto por fonte para <strong>{limitModal.filename || limitModal.path}</strong>.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>Custo atual: <strong>{money(limitModal.actual_cost_usd)}</strong></span>
              <span>Limite operacional atual: <strong>{money(limitModal.authorized_limit_usd)}</strong></span>
              <Badge variant="warning">Teto máximo aprovável: {money(detail[limitModal.id]?.max_approved_cost_usd ?? 3)}</Badge>
            </div>
            <TextInput label="Novo teto por fonte (USD)" type="number" step="0.05" value={newLimit} onChange={(e) => setNewLimit(e.target.value)} icon={Coins} />
            <p className="text-xs text-[var(--muted-fg,#64748b)]">O valor é limitado ao teto administrativo ({money(detail[limitModal.id]?.max_approved_cost_usd ?? 3)}) — pedidos acima são reduzidos automaticamente.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setLimitModal(null)}>Cancelar</Button>
              <Button variant="primary" disabled={busy === limitModal.id} onClick={() => act(limitModal, 'approve-limit', { new_limit_usd: parseFloat(newLimit) })}>
                Aplicar novo teto
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: confirmação de ações financeiras/irreversíveis (aprovar passo / encerrar parcial / rejeitar) */}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? ''} width="max-w-md">
        {confirm && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 text-sm">
              {confirm.lines.map((l, i) => <span key={i}>{l}</span>)}
            </div>
            <p className="text-sm text-[var(--muted-fg,#64748b)]">{confirm.note}</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirm(null)}>Cancelar</Button>
              <Button variant={confirm.variant} disabled={busy === confirm.a.id} onClick={() => { const c = confirm; setConfirm(null); void act(c.a, c.action) }}>
                {confirm.confirmLabel}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  )
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-[var(--muted-fg,#64748b)]">{label}</span>
      <span className={strong ? 'text-base font-semibold' : 'text-sm font-medium'}>{value}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { v: 'default' | 'success' | 'warning'; t: string }> = {
    pending: { v: 'warning', t: 'Aguardando aprovação' },
    approved_step: { v: 'success', t: 'Passo liberado' },
    approved_limit: { v: 'success', t: 'Teto elevado' },
    closed_partial: { v: 'default', t: 'Encerrada parcial' },
    rejected: { v: 'default', t: 'Rejeitada' },
  }
  const m = map[status] || { v: 'default' as const, t: status }
  return <Badge variant={m.v}>{m.t}</Badge>
}
