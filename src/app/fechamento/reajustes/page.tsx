'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { toast } from 'sonner'
import {
  TrendingUp, AlertTriangle, Clock, CheckCircle, DollarSign,
  History, Search, RefreshCw, X, Upload, Pencil, Save, CalendarClock,
} from 'lucide-react'
import { PageHeader, Card, Badge, Button, Th, Tbody, Tr, Td, SkeletonTable, EmptyState } from '@/components/ds'
import { ReajusteModal, type ReajusteTarget } from '@/components/contratos/ReajusteModal'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal'

// ─── Types ──────────────────────────────────────────────────────────────────
interface Summary {
  total_contratos: number
  contratos_em_dia: number
  contratos_vencidos: number
  contratos_proximos: number
  valor_total_reajustar: number
  valor_total_contratos: number
  valor_total_acumulado: number
  defasagem_acumulada: number
  indices: { IPCA: number; IGPM: number }
}
interface Row {
  id: number
  cliente_nome: string | null
  codigo: string | null
  valor_atual: number
  data_assinatura: string | null
  valor_inicial: number | null
  pct_reajuste: number | null
  data_ultimo_reajuste: string | null
  data_proximo_reajuste: string | null
  dias_para_vencimento: number | null
  status_reajuste: 'vencido' | 'proximo' | 'em_dia' | 'recente'
  taxa_reajuste: string
  percentual_estimado: number
  valor_estimado_reajuste: number
  periodo: { inicio: string; fim: string; label: string }
  percentual_acumulado: number | null
  valor_acumulado: number | null
  periodo_acumulado: { inicio: string; fim: string; label: string } | null
}
interface HistRow {
  id: number
  valor_anterior: number
  valor_novo: number
  percentual: number
  indice: string
  periodo_formatado: string | null
  usuario: string | null
  data: string | null
}

const STATUS: Record<Row['status_reajuste'], { label: string; variant: string }> = {
  vencido: { label: 'Vencido', variant: 'danger' },
  proximo: { label: 'Próximo', variant: 'warning' },
  em_dia:  { label: 'Em dia', variant: 'success' },
  recente: { label: 'Recente', variant: 'primary' },
}
const fmtDate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

export default function DashboardReajustesPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [statusF, setStatusF] = useState('')
  const [indexF, setIndexF] = useState('')
  const [search, setSearch] = useState('')
  const [reajusteTarget, setReajusteTarget] = useState<ReajusteTarget | null>(null)
  const [histRow, setHistRow] = useState<Row | null>(null)
  const [hist, setHist] = useState<HistRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [editRow, setEditRow] = useState<Row | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusF) params.set('status', statusF)
      if (indexF) params.set('index_type', indexF)
      const qs = params.toString()
      const [s, l] = await Promise.all([
        api.get<Summary>('/contracts/reajustes/summary'),
        api.get<{ data: Row[] }>(`/contracts/reajustes${qs ? '?' + qs : ''}`),
      ])
      setSummary(s)
      setRows(l.data ?? [])
    } catch {
      toast.error('Erro ao carregar o dashboard de reajustes')
    } finally {
      setLoading(false)
    }
  }, [statusF, indexF])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return rows
    return rows.filter(r =>
      (r.cliente_nome ?? '').toLowerCase().includes(q) || (r.codigo ?? '').toLowerCase().includes(q))
  }, [rows, search])

  const openHistorico = async (row: Row) => {
    setHistRow(row)
    setHist(null)
    try {
      const res = await api.get<{ data: HistRow[] }>(`/contracts/${row.id}/value-changes`)
      setHist(res.data ?? [])
    } catch {
      toast.error('Erro ao carregar o histórico')
      setHist([])
    }
  }

  const onPickFile = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0]
    if (ev.target) ev.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const res = await api.post<{ matched: number; unmatched_count: number }>('/contracts/recorrentes/import', (() => {
        const fd = new FormData(); fd.append('file', file); return fd
      })())
      toast.success(`${res.matched} contrato(s) amarrado(s)${res.unmatched_count ? ` · ${res.unmatched_count} sem correspondência` : ''}`)
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao importar a planilha')
    } finally {
      setImporting(false)
    }
  }

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  const selectCls = 'rounded-lg px-3 py-2 text-sm'

  return (
    <AppLayout title="Fechamento — Reajuste de Contrato">
      <div className="space-y-6">
        <PageHeader
          icon={TrendingUp}
          title="Reajuste de Contrato"
          subtitle="Contratos que precisam de reajuste — priorização, impacto e aplicação"
          actions={
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onPickFile} />
              <Button size="sm" variant="secondary" icon={Upload} loading={importing} disabled={importing}
                onClick={() => fileRef.current?.click()}>
                {importing ? 'Importando…' : 'Importar planilha'}
              </Button>
              <Button size="sm" variant="secondary" icon={RefreshCw} onClick={load} loading={loading} disabled={loading}>
                Atualizar
              </Button>
            </div>
          }
        />

        {/* Alerta global de vencidos */}
        {!loading && summary && summary.contratos_vencidos > 0 && (
          <div
            className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium"
            style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)' }}
          >
            <AlertTriangle size={18} className="shrink-0" />
            ⚠️ {summary.contratos_vencidos} contrato{summary.contratos_vencidos !== 1 ? 's' : ''} com reajuste <strong>vencido</strong>
            {summary.valor_total_reajustar > 0 && <> — impacto estimado total <strong>{formatBRL(summary.valor_total_reajustar)}</strong></>}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Kpi icon={AlertTriangle} tone="danger" label="Vencidos"
            value={summary?.contratos_vencidos ?? 0}
            sub={summary ? `${formatBRL(summary.valor_total_reajustar)} impacto` : ''} loading={loading} />
          <Kpi icon={Clock} tone="warning" label="Próximos (30 dias)"
            value={summary?.contratos_proximos ?? 0} sub="a vencer" loading={loading} />
          <Kpi icon={CheckCircle} tone="success" label="Em dia"
            value={summary?.contratos_em_dia ?? 0}
            sub={summary ? `de ${summary.total_contratos} contratos` : ''} loading={loading} />
          <Kpi icon={DollarSign} tone="primary" label="Impacto financeiro"
            value={summary ? formatBRL(summary.valor_total_reajustar) : '—'}
            sub="vencidos + próximos" loading={loading} isText />
          <Kpi icon={CalendarClock} tone="warning" label="Defasagem acumulada"
            value={summary ? formatBRL(summary.defasagem_acumulada) : '—'}
            sub={summary ? `corrigido: ${formatBRL(summary.valor_total_acumulado)}` : ''} loading={loading} isText />
        </div>

        {/* Legenda dos KPIs financeiros */}
        <p className="text-[11px] -mt-3 leading-snug" style={{ color: 'var(--text-light)' }}>
          <strong style={{ color: 'var(--text-muted)' }}>Defasagem acumulada</strong>: soma dos contratos corrigidos pela inflação (IPCA/IGP-M) desde a assinatura, menos o valor atual — o gap histórico total, <em>não</em> o reajuste a aplicar agora (esse é o <strong style={{ color: 'var(--text-muted)' }}>Impacto financeiro</strong>, 1 ciclo de 12 meses).
        </p>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente ou código..."
              className="pl-8 pr-3 py-2 rounded-lg text-sm w-64" style={inputStyle} />
          </div>
          <select value={statusF} onChange={e => setStatusF(e.target.value)} className={selectCls} style={inputStyle}>
            <option value="">Todos os status</option>
            <option value="vencido">Vencidos</option>
            <option value="proximo">Próximos</option>
            <option value="em_dia">Em dia</option>
            <option value="recente">Recentes</option>
          </select>
          <select value={indexF} onChange={e => setIndexF(e.target.value)} className={selectCls} style={inputStyle}>
            <option value="">Todos os índices</option>
            <option value="IGPM">IGP-M</option>
            <option value="IPCA">IPCA</option>
          </select>
          {summary && (
            <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
              Estimativa 12m — IPCA {summary.indices.IPCA}% · IGP-M {summary.indices.IGPM}%
            </span>
          )}
        </div>

        {/* Tabela */}
        {loading ? (
          <SkeletonTable rows={6} cols={9} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Nenhum contrato" description="Nenhum contrato recorrente para os filtros atuais." />
        ) : (
          <div className="rounded-2xl overflow-x-auto" style={{ border: '1px solid var(--brand-border)' }}>
            <table className="w-full text-sm" style={{ background: 'var(--brand-surface)' }}>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th right>Valor inicial</Th>
                  <Th right>Valor atual</Th>
                  <Th>Último reajuste</Th>
                  <Th>Próximo reajuste</Th>
                  <Th>Status</Th>
                  <Th right>Impacto estimado</Th>
                  <Th right>Acumulado (desde assinatura)</Th>
                  <Th>Ação</Th>
                </tr>
              </thead>
              <Tbody>
                {filtered.map(r => {
                  const st = STATUS[r.status_reajuste]
                  const rowBg = r.status_reajuste === 'vencido' ? 'var(--danger-bg)' : undefined
                  const dias = r.dias_para_vencimento
                  return (
                    <Tr key={r.id} baseBackground={rowBg}>
                      <Td>
                        <div className="font-medium" style={{ color: 'var(--text)' }}>{r.cliente_nome ?? '—'}</div>
                        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{r.codigo ?? '—'}</div>
                      </Td>
                      <Td right mono className="tabular-nums" style={{ color: 'var(--text-muted)' }}>{formatBRL(r.valor_inicial ?? r.valor_atual)}</Td>
                      <Td right mono className="tabular-nums">{formatBRL(r.valor_atual)}</Td>
                      <Td style={{ color: 'var(--text-muted)' }}>{fmtDate(r.data_ultimo_reajuste)}</Td>
                      <Td>
                        <div style={{ color: 'var(--text)' }}>↪ {fmtDate(r.data_proximo_reajuste)}</div>
                        {dias != null && (
                          <div className="text-[11px]" style={{ color: dias < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                            {dias < 0 ? `${Math.abs(dias)} dias atrás` : `em ${dias} dias`}
                          </div>
                        )}
                      </Td>
                      <Td><Badge variant={st.variant}>{st.label}</Badge></Td>
                      <Td right mono className="tabular-nums">
                        <span style={{ color: 'var(--success)' }}>+{formatBRL(r.valor_estimado_reajuste)}</span>
                        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>~{r.percentual_estimado}% {r.taxa_reajuste}</div>
                      </Td>
                      <Td right mono className="tabular-nums">
                        {r.percentual_acumulado != null ? (
                          <>
                            <span style={{ color: 'var(--text)' }}>{formatBRL(r.valor_acumulado ?? 0)}</span>
                            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                              +{r.percentual_acumulado}% {r.taxa_reajuste} · {r.periodo_acumulado?.label}
                            </div>
                          </>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </Td>
                      <Td>
                        <div className="inline-flex items-center gap-1.5">
                          <button onClick={() => setReajusteTarget({ id: r.id, label: `${r.cliente_nome ?? '—'} · ${r.codigo ?? '—'}`, periodo: r.periodo })}
                            title="Reajustar"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium"
                            style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
                            <TrendingUp size={13} /> Reajustar
                          </button>
                          <button onClick={() => openHistorico(r)}
                            title="Ver histórico"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium"
                            style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                            <History size={13} /> Histórico
                          </button>
                          <button onClick={() => setEditRow(r)}
                            title="Editar cadastro (assinatura, vencimento, valor inicial, taxa)"
                            className="inline-flex items-center justify-center rounded-md p-1.5"
                            style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                            <Pencil size={14} />
                          </button>
                        </div>
                      </Td>
                    </Tr>
                  )
                })}
              </Tbody>
            </table>
          </div>
        )}
        {!loading && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{filtered.length} contrato(s)</p>}
      </div>

      {/* Modal de reajuste (compartilhado) */}
      {reajusteTarget && (
        <ReajusteModal
          key={reajusteTarget.id}
          target={reajusteTarget}
          onClose={() => setReajusteTarget(null)}
          onApplied={load}
        />
      )}

      {/* Modal de edição de cadastro (assinatura/vencimento/valor inicial/taxa/%) */}
      {editRow && (
        <EditCadastroModal key={editRow.id} row={editRow} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); load() }} />
      )}

      {/* Modal de histórico */}
      {histRow && (
        <Modal open onClose={() => setHistRow(null)} size="md">
          <ModalHeader icon={History} title="Histórico de reajustes"
            subtitle={`${histRow.cliente_nome ?? '—'} · ${histRow.codigo ?? '—'}`}
            onClose={() => setHistRow(null)} />
          <ModalBody>
            {hist === null ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>Carregando…</p>
            ) : hist.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>Nenhum reajuste aplicado ainda.</p>
            ) : (
              <div className="space-y-2">
                {hist.map(h => (
                  <div key={h.id} className="rounded-lg p-3" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between">
                      {h.indice === 'RENOVACAO' ? (
                        <>
                          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Renovado sem reajuste</span>
                          <Badge variant="success">+1 ano</Badge>
                        </>
                      ) : (
                        <>
                          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                            {formatBRL(h.valor_anterior)} → {formatBRL(h.valor_novo)}
                          </span>
                          <Badge variant="primary">+{h.percentual}% {h.indice === 'IGPM' ? 'IGP-M' : h.indice}</Badge>
                        </>
                      )}
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                      Período: {h.periodo_formatado ?? '—'} · {h.usuario ?? '—'} · {h.data ? new Date(h.data).toLocaleString('pt-BR') : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ModalBody>
        </Modal>
      )}
    </AppLayout>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function Kpi({ icon: Icon, tone, label, value, sub, loading, isText }: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  tone: 'danger' | 'warning' | 'success' | 'primary'
  label: string
  value: number | string
  sub?: string
  loading?: boolean
  isText?: boolean
}) {
  const color = `var(--${tone})`
  const bg = tone === 'primary' ? 'var(--primary-soft)' : `var(--${tone}-bg)`
  return (
    <Card padding="md">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center rounded-xl shrink-0" style={{ width: 44, height: 44, background: bg }}>
          <Icon size={22} style={{ color }} />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</div>
          <div className={`font-bold ${isText ? 'text-lg' : 'text-2xl'} tabular-nums`} style={{ color: 'var(--text)' }}>
            {loading ? '…' : value}
          </div>
          {sub && <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>{sub}</div>}
        </div>
      </div>
    </Card>
  )
}

// ─── Modal: editar cadastro do contrato recorrente ───────────────────────────
function EditCadastroModal({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: () => void }) {
  const [assinatura, setAssinatura] = useState(row.data_assinatura ?? '')
  const [vencimento, setVencimento] = useState(row.data_proximo_reajuste ?? '')
  const [valorInicial, setValorInicial] = useState(row.valor_inicial != null ? String(row.valor_inicial) : '')
  const [taxa, setTaxa] = useState(row.taxa_reajuste ?? '')
  const [pct, setPct] = useState(row.pct_reajuste != null ? String(row.pct_reajuste) : '')
  const [ultimoReajuste, setUltimoReajuste] = useState(row.data_ultimo_reajuste ?? '')
  const [saving, setSaving] = useState(false)

  const st = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  const inp = 'w-full rounded-md px-2.5 py-2 text-sm'
  const lbl = 'text-xs font-medium'

  const save = async () => {
    setSaving(true)
    try {
      await api.patch(`/contracts/${row.id}/recorrente`, {
        data_assinatura: assinatura || null,
        data_vencimento: vencimento || null,
        data_ultimo_reajuste: ultimoReajuste || null,
        valor_inicial: valorInicial !== '' ? Number(valorInicial) : null,
        taxa_reajuste: taxa || null,
        pct_reajuste: pct !== '' ? Number(pct) : null,
      })
      toast.success('Cadastro atualizado')
      onSaved()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={() => { if (!saving) onClose() }} size="md">
      <ModalHeader icon={Pencil} title="Editar cadastro" subtitle={`${row.cliente_nome ?? '—'} · ${row.codigo ?? '—'}`} onClose={() => { if (!saving) onClose() }} />
      <ModalBody>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Valor inicial (base do reajuste)</label>
            <input type="number" step="0.01" min="0" value={valorInicial} onChange={e => setValorInicial(e.target.value)} className={inp} style={st} />
          </div>
          <div>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Taxa aplicada</label>
            <select value={taxa} onChange={e => setTaxa(e.target.value)} className={inp} style={st}>
              <option value="">—</option>
              <option value="IPCA">IPCA</option>
              <option value="IGPM">IGP-M</option>
            </select>
          </div>
          <div>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Percentual (%)</label>
            <input type="number" step="0.001" value={pct} onChange={e => setPct(e.target.value)} className={inp} style={st} />
          </div>
          <div>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Assinatura (data-base)</label>
            <input type="date" value={assinatura} onChange={e => setAssinatura(e.target.value)} className={inp} style={st} />
          </div>
          <div>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Vencimento (aniversário)</label>
            <input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} className={inp} style={st} />
          </div>
          <div>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Último reajuste</label>
            <input type="date" value={ultimoReajuste} onChange={e => setUltimoReajuste(e.target.value)} className={inp} style={st} />
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Âncora do período de 12 meses; deixe vazio se nunca reajustou.</p>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <button onClick={() => { if (!saving) onClose() }} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <X size={15} /> Cancelar
        </button>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
          <Save size={15} /> {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </ModalFooter>
    </Modal>
  )
}
