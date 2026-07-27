'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { toast } from 'sonner'
import {
  TrendingUp, AlertTriangle, Clock, CheckCircle, DollarSign,
  History, Search, RefreshCw, X, Upload, Pencil, Save, CalendarClock, Plus, Trash2, Building2, Undo2, Send, Mail,
} from 'lucide-react'
import { PageHeader, Card, Badge, Button, Th, Tbody, Tr, Td, SkeletonTable, EmptyState } from '@/components/ds'
import { ReajusteModal, type ReajusteTarget } from '@/components/contratos/ReajusteModal'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal'
import { SearchSelect } from '@/components/ui/search-select'

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
  data_aviso?: string | null
  project_backed?: boolean
  project_id?: number | null
  project_name?: string | null
  dias_para_vencimento: number | null
  status_reajuste: 'vencido' | 'proximo' | 'em_dia' | 'recente'
  taxa_reajuste: string
  percentual_estimado: number
  valor_estimado_reajuste: number
  periodo: { inicio: string; fim: string; label: string }
  percentual_acumulado: number | null
  valor_acumulado: number | null
  periodo_acumulado: { inicio: string; fim: string; label: string } | null
  // Inclusão manual (sem contrato): linha em cor diferente + empresa ERPSERV|BIZIFY
  manual?: boolean
  empresa?: string | null
  customer_id?: number | null
  can_reverse?: boolean
  can_resend?: boolean
  can_resend_estorno?: boolean
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
// "Avisar em" já chegou (data <= hoje) → hora de enviar o aviso prévio.
const avisoDue = (d: string | null | undefined) => !!d && new Date(d + 'T00:00:00') <= new Date(new Date().toDateString())

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
  const [manualModal, setManualModal] = useState<Row | 'new' | null>(null)

  const [estornando, setEstornando] = useState(false)
  const [estornoConfirm, setEstornoConfirm] = useState<Row | null>(null)
  const [estornoPreview, setEstornoPreview] = useState<{ subject: string; html: string } | null>(null)
  const [estornoMsg, setEstornoMsg] = useState('')
  const [estornoSeeded, setEstornoSeeded] = useState(false)
  const [resend, setResend] = useState<{ row: Row; tipo: 'reajuste' | 'estorno' } | null>(null)
  const [aviso, setAviso] = useState<Row | null>(null)

  const estornoBase = (r: Row) => r.manual ? `/contracts/reajustes/manual/${r.id}` : `/contracts/${r.id}`
  // Ao abrir o modal de estorno, busca a prévia + semeia o corpo editável.
  useEffect(() => {
    if (!estornoConfirm) { setEstornoPreview(null); setEstornoMsg(''); setEstornoSeeded(false); return }
    setEstornoPreview(null)
    api.get<{ subject: string; html: string; mensagem_padrao?: string }>(`${estornoBase(estornoConfirm)}/adjustment-email-preview?estorno=1`)
      .then(res => { setEstornoPreview({ subject: res.subject, html: res.html }); setEstornoMsg(res.mensagem_padrao ?? ''); setEstornoSeeded(true) })
      .catch(() => {})
  }, [estornoConfirm])
  const refreshEstornoPreview = () => {
    if (!estornoConfirm) return
    api.get<{ subject: string; html: string }>(`${estornoBase(estornoConfirm)}/adjustment-email-preview?estorno=1&mensagem=${encodeURIComponent(estornoMsg)}`)
      .then(res => setEstornoPreview({ subject: res.subject, html: res.html })).catch(() => {})
  }
  const estornarReajuste = async (row: Row, notificar: boolean) => {
    setEstornando(true)
    try {
      const url = row.manual
        ? `/contracts/reajustes/manual/${row.id}/reverse-adjustment`
        : `/contracts/${row.id}/reverse-adjustment`
      const res = await api.post<{ email_sent?: boolean }>(url, { notificar, mensagem: (notificar && estornoSeeded) ? estornoMsg : undefined })
      toast.success(!notificar
        ? 'Reajuste estornado (cliente não avisado)'
        : (res?.email_sent ? 'Reajuste estornado · e-mail enviado ao cliente' : 'Reajuste estornado (sem e-mail: nenhum destinatário)'))
      setEstornoConfirm(null)
      setHistRow(null)
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao estornar')
    } finally {
      setEstornando(false)
    }
  }

  const deleteManual = async (row: Row) => {
    if (!confirm(`Excluir a inclusão manual "${row.cliente_nome ?? ''}"?`)) return
    try {
      await api.delete(`/contracts/reajustes/manual/${row.id}`)
      toast.success('Inclusão manual excluída')
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao excluir')
    }
  }

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
      const url = row.manual
        ? `/contracts/reajustes/manual/${row.id}/value-changes`
        : `/contracts/${row.id}/value-changes`
      const res = await api.get<{ data: HistRow[] }>(url)
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
              <Button size="sm" variant="secondary" icon={Plus} onClick={() => setManualModal('new')}>
                Inclusão manual
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
          <Kpi icon={DollarSign} tone="info" label="Impacto financeiro"
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
          <div className="rounded-2xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm" style={{ background: 'var(--surface)' }}>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th right>Valor inicial</Th>
                  <Th right>Valor atual</Th>
                  <Th>Último reajuste</Th>
                  <Th>Próximo reajuste</Th>
                  <Th>Avisar em</Th>
                  <Th>Status</Th>
                  <Th right>Impacto estimado</Th>
                  <Th right>Acumulado (desde assinatura)</Th>
                  <Th>Ação</Th>
                </tr>
              </thead>
              <Tbody>
                {filtered.map(r => {
                  const st = STATUS[r.status_reajuste]
                  // Linha manual (sem contrato) tem cor própria (lilás) p/ destacar.
                  const rowBg = (r.manual && !r.project_backed) ? 'var(--primary-soft)' : (r.status_reajuste === 'vencido' ? 'var(--danger-bg)' : undefined)
                  const dias = r.dias_para_vencimento
                  return (
                    <Tr key={`${r.manual ? 'm' : 'c'}${r.id}`} baseBackground={rowBg}>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium" style={{ color: 'var(--text)' }}>{r.cliente_nome ?? '—'}</span>
                          {r.manual && r.project_backed && (
                            <Badge variant="success">
                              <Building2 size={10} className="inline -mt-0.5 mr-0.5" />Projeto
                            </Badge>
                          )}
                          {r.manual && !r.project_backed && (
                            <Badge variant={r.empresa === 'BIZIFY' ? 'warning' : 'primary'}>
                              <Building2 size={10} className="inline -mt-0.5 mr-0.5" />{r.empresa ?? 'ERPSERV'}
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{r.codigo ?? (r.manual ? 'Inclusão manual' : '—')}</div>
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
                      <Td>
                        {(() => { const due = avisoDue(r.data_aviso); return (
                          <span style={{ color: due ? 'var(--warning)' : 'var(--text-muted)', fontWeight: due ? 700 : 400 }}>
                            {fmtDate(r.data_aviso ?? null)}{due ? ' • avisar' : ''}
                          </span>
                        )})()}
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
                          {r.manual ? (
                            <>
                              <button onClick={() => setReajusteTarget({ id: r.id, label: `${r.cliente_nome ?? '—'} · ${r.codigo ?? 'Manual'}`, periodo: r.periodo, manual: true })}
                                title="Reajustar"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium"
                                style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
                                <TrendingUp size={13} /> Reajustar
                              </button>
                              <button onClick={() => setAviso(r)}
                                title="Avisar cliente do reajuste do próximo mês"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium"
                                style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                                <CalendarClock size={13} /> Aviso
                              </button>
                              <button onClick={() => openHistorico(r)}
                                title="Ver histórico"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium"
                                style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                                <History size={13} /> Histórico
                              </button>
                              {r.can_reverse && (
                                <button onClick={() => setEstornoConfirm(r)}
                                  title="Estornar último reajuste"
                                  className="inline-flex items-center justify-center rounded-md p-1.5"
                                  style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning)', color: 'var(--warning)' }}>
                                  <Undo2 size={14} />
                                </button>
                              )}
                              <button onClick={() => setManualModal(r)}
                                title="Editar inclusão manual"
                                className="inline-flex items-center justify-center rounded-md p-1.5"
                                style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => deleteManual(r)}
                                title="Excluir inclusão manual"
                                className="inline-flex items-center justify-center rounded-md p-1.5"
                                style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
                                <Trash2 size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => setReajusteTarget({ id: r.id, label: `${r.cliente_nome ?? '—'} · ${r.codigo ?? '—'}`, periodo: r.periodo })}
                                title="Reajustar"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium"
                                style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
                                <TrendingUp size={13} /> Reajustar
                              </button>
                              <button onClick={() => setAviso(r)}
                                title="Avisar cliente do reajuste do próximo mês"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium"
                                style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                                <CalendarClock size={13} /> Aviso
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
                              {r.can_reverse && (
                                <button onClick={() => setEstornoConfirm(r)}
                                  title="Estornar último reajuste"
                                  className="inline-flex items-center justify-center rounded-md p-1.5"
                                  style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning)', color: 'var(--warning)' }}>
                                  <Undo2 size={14} />
                                </button>
                              )}
                            </>
                          )}
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

      {/* Modal de confirmação de estorno */}
      {estornoConfirm && (
        <Modal open onClose={() => { if (!estornando) setEstornoConfirm(null) }} size="md">
          <ModalHeader icon={Undo2} title="Estornar reajuste"
            subtitle={`${estornoConfirm.cliente_nome ?? '—'} · ${estornoConfirm.codigo ?? '—'}`}
            onClose={() => { if (!estornando) setEstornoConfirm(null) }} />
          <ModalBody>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
              O valor volta ao anterior e o registro sai do histórico. Escolha abaixo se deseja <b>avisar o cliente</b> (envia o e-mail abaixo + cópias internas da Central) ou estornar em silêncio.
            </p>
            <p className="text-xs mt-1 mb-3" style={{ color: 'var(--text-muted)' }}>Esta ação não pode ser desfeita.</p>
<div style={{ marginBottom: 10 }}>
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Corpo do e-mail (editável)</label>
              <textarea value={estornoMsg} onChange={e => setEstornoMsg(e.target.value)} rows={4}
                className="w-full rounded-lg px-3 py-2 text-sm mt-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', resize: 'vertical', fontFamily: 'inherit' }} />
              <button onClick={refreshEstornoPreview}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium mt-1.5"
                style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <Mail size={13} /> Atualizar prévia
              </button>
            </div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Prévia do e-mail de estorno</label>
            {estornoPreview ? (
              <div className="mt-1 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <div className="px-3 py-2 text-xs font-semibold" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  Assunto: <span style={{ color: 'var(--text)' }}>{estornoPreview.subject}</span>
                </div>
                <iframe title="Prévia do estorno" srcDoc={estornoPreview.html}
                  style={{ width: '100%', height: 300, border: 'none', background: '#fff' }} />
              </div>
            ) : (
              <p className="text-sm py-6 text-center mt-1 rounded-lg" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Gerando prévia…</p>
            )}
          </ModalBody>
          <ModalFooter>
            <button onClick={() => { if (!estornando) setEstornoConfirm(null) }} disabled={estornando}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <X size={15} /> Cancelar
            </button>
            <button onClick={() => estornarReajuste(estornoConfirm, false)} disabled={estornando}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <Undo2 size={15} /> Estornar sem avisar
            </button>
            <button onClick={() => estornarReajuste(estornoConfirm, true)} disabled={estornando || !estornoPreview}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--danger)', color: '#fff' }}>
              <Undo2 size={15} /> {estornando ? 'Estornando…' : 'Estornar e avisar cliente'}
            </button>
          </ModalFooter>
        </Modal>
      )}

      {/* Modal de aviso prévio de reajuste (próximo mês) */}
      {aviso && (
        <AvisoModal key={`av-${aviso.manual ? 'm' : 'c'}${aviso.id}`} row={aviso} onClose={() => setAviso(null)} />
      )}

      {/* Modal de reenvio de e-mail (reajuste ou estorno) */}
      {resend && (
        <ResendModal key={`${resend.tipo}-${resend.row.manual ? 'm' : 'c'}${resend.row.id}`}
          row={resend.row} tipo={resend.tipo} onClose={() => setResend(null)} />
      )}

      {/* Modal de inclusão manual (sem contrato) */}
      {manualModal && (
        <ManualModal
          key={manualModal === 'new' ? 'new' : manualModal.id}
          row={manualModal === 'new' ? null : manualModal}
          onClose={() => setManualModal(null)}
          onSaved={() => { setManualModal(null); load() }}
        />
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
          {histRow && (histRow.can_resend || histRow.can_resend_estorno || histRow.can_reverse) && (
            <ModalFooter>
              {histRow.can_resend && (
                <button onClick={() => { const r = histRow; setHistRow(null); setResend({ row: r, tipo: 'reajuste' }) }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <Send size={15} /> Reenviar reajuste
                </button>
              )}
              {histRow.can_resend_estorno && (
                <button onClick={() => { const r = histRow; setHistRow(null); setResend({ row: r, tipo: 'estorno' }) }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <Send size={15} /> Reenviar estorno
                </button>
              )}
              {histRow.can_reverse && (
                <button onClick={() => histRow && setEstornoConfirm(histRow)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
                  <Undo2 size={15} /> Estornar último reajuste
                </button>
              )}
            </ModalFooter>
          )}
        </Modal>
      )}
    </AppLayout>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function Kpi({ icon: Icon, tone, label, value, sub, loading, isText }: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  tone: 'danger' | 'warning' | 'success' | 'primary' | 'info'
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

// ─── Modal: inclusão manual de reajuste (sem contrato) ───────────────────────
function ManualModal({ row, onClose, onSaved }: { row: Row | null; onClose: () => void; onSaved: () => void }) {
  const editing = !!row
  const [cliente, setCliente] = useState(row?.cliente_nome ?? '')
  const [customerId, setCustomerId] = useState<string>(row?.customer_id != null ? String(row.customer_id) : '')
  const [customers, setCustomers] = useState<{ id: number; name: string }[]>([])
  const [descricao, setDescricao] = useState(row?.codigo ?? '')
  const [empresa, setEmpresa] = useState<'ERPSERV' | 'BIZIFY'>((row?.empresa as 'ERPSERV' | 'BIZIFY') ?? 'ERPSERV')
  const [valorInicial, setValorInicial] = useState(row?.valor_inicial != null ? String(row.valor_inicial) : '')
  const [assinatura, setAssinatura] = useState(row?.data_assinatura ?? '')
  const [ultimoReajuste, setUltimoReajuste] = useState(row?.data_ultimo_reajuste ?? '')
  const [taxa, setTaxa] = useState(row?.taxa_reajuste ?? '')
  const [pct, setPct] = useState(row?.pct_reajuste != null ? String(row.pct_reajuste) : '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<any>('/customers?pageSize=500')
      .then(r => setCustomers((r?.items ?? r?.data ?? r ?? []).map((c: any) => ({ id: c.id, name: c.name }))))
      .catch(() => {})
  }, [])

  const st = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  const inp = 'w-full rounded-md px-2.5 py-2 text-sm'
  const lbl = 'text-xs font-medium'

  const save = async () => {
    if (!cliente.trim()) { toast.error('Informe o cliente'); return }
    setSaving(true)
    const payload = {
      cliente_nome: cliente.trim(),
      customer_id: customerId ? Number(customerId) : null,
      descricao: descricao.trim() || null,
      empresa,
      valor_inicial: valorInicial !== '' ? Number(valorInicial) : null,
      data_assinatura: assinatura || null,
      data_ultimo_reajuste: ultimoReajuste || null,
      taxa_reajuste: taxa || null,
      pct_reajuste: pct !== '' ? Number(pct) : null,
    }
    try {
      if (editing) await api.patch(`/contracts/reajustes/manual/${row!.id}`, payload)
      else await api.post('/contracts/reajustes/manual', payload)
      toast.success(editing ? 'Inclusão manual atualizada' : 'Inclusão manual criada')
      onSaved()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={() => { if (!saving) onClose() }} size="md">
      <ModalHeader icon={Plus} title={editing ? 'Editar inclusão manual' : 'Inclusão manual (sem contrato)'}
        subtitle="Próximo reajuste = último + 1 ano. Só rastreio — não aplica nem notifica."
        onClose={() => { if (!saving) onClose() }} />
      <ModalBody>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Cliente *</label>
            <input value={cliente} onChange={e => setCliente(e.target.value)} className={inp} style={st} placeholder="Nome do cliente" />
          </div>
          <div className="col-span-2">
            <SearchSelect
              label="Vincular cliente (opcional — puxa e-mails do cadastro)"
              value={customerId}
              onChange={(v) => { setCustomerId(v); const c = customers.find(x => String(x.id) === v); if (c && !cliente.trim()) setCliente(c.name) }}
              options={customers}
              placeholder="Sem vínculo"
              fullWidth
            />
          </div>
          <div>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Empresa *</label>
            <select value={empresa} onChange={e => setEmpresa(e.target.value as 'ERPSERV' | 'BIZIFY')} className={inp} style={st}>
              <option value="ERPSERV">ERPSERV</option>
              <option value="BIZIFY">BIZIFY</option>
            </select>
          </div>
          <div>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Descrição (contrato)</label>
            <input value={descricao} onChange={e => setDescricao(e.target.value)} className={inp} style={st} placeholder="Ex: LICENÇA MOVIDESK - TI" />
          </div>
          <div className="col-span-2">
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Saldo inicial (valor base)</label>
            <input type="number" step="0.01" min="0" value={valorInicial} onChange={e => setValorInicial(e.target.value)} className={inp} style={st} />
          </div>
          <div>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Assinatura (data-base)</label>
            <input type="date" value={assinatura} onChange={e => setAssinatura(e.target.value)} className={inp} style={st} />
          </div>
          <div>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Último reajuste</label>
            <input type="date" value={ultimoReajuste} onChange={e => setUltimoReajuste(e.target.value)} className={inp} style={st} />
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>O próximo é calculado: último + 1 ano.</p>
          </div>
          <div>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Taxa</label>
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

// ─── Modal: reenvio de comunicado (reajuste ou estorno) ──────────────────────
function ResendModal({ row, tipo, onClose }: { row: Row; tipo: 'reajuste' | 'estorno'; onClose: () => void }) {
  const base = row.manual ? `/contracts/reajustes/manual/${row.id}` : `/contracts/${row.id}`
  const previewTipo = tipo === 'estorno' ? 'estorno_resend' : 'reajuste'
  const [emails, setEmails] = useState<string[]>([])
  const [novoEmail, setNovoEmail] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [seeded, setSeeded] = useState(false)
  const [salvar, setSalvar] = useState(true)
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  const fetchPreview = useCallback(async (msg?: string) => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ tipo: previewTipo })
      if (msg !== undefined) q.set('mensagem', msg)
      const res = await api.get<{ subject: string; html: string; mensagem_padrao?: string; cliente_emails?: string[] }>(`${base}/adjustment-email-preview?${q.toString()}`)
      setPreview({ subject: res.subject, html: res.html })
      if (!seeded) { setMensagem(res.mensagem_padrao ?? ''); setEmails(res.cliente_emails ?? []); setSeeded(true) }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gerar a prévia')
    } finally { setLoading(false) }
  }, [base, previewTipo, seeded])

  useEffect(() => { void fetchPreview() }, [fetchPreview])

  const addEmail = () => {
    const e = novoEmail.trim().toLowerCase()
    if (!e) return
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { toast.error('E-mail inválido'); return }
    if (!emails.includes(e)) setEmails(prev => [...prev, e])
    setNovoEmail('')
  }
  const removeEmail = (e: string) => setEmails(prev => prev.filter(x => x !== e))

  const enviar = async () => {
    if (!emails.length) { toast.error('Informe ao menos um e-mail'); return }
    setSending(true)
    try {
      const res = await api.post<{ emails: string[] }>(`${base}/resend-adjustment`, { tipo, emails, mensagem: seeded ? mensagem : undefined, salvar })
      toast.success(`Reenviado (${res.emails.length} destinatário${res.emails.length !== 1 ? 's' : ''})`)
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao reenviar')
    } finally { setSending(false) }
  }

  const st = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  return (
    <Modal open onClose={() => { if (!sending) onClose() }} size="md">
      <ModalHeader icon={Send} title={tipo === 'estorno' ? 'Reenviar comunicado de estorno' : 'Reenviar comunicado de reajuste'}
        subtitle={`${row.cliente_nome ?? '—'} · ${row.codigo ?? '—'}`} onClose={() => { if (!sending) onClose() }} />
      <ModalBody>
        <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
          <Mail size={14} /> Destinatários (pode adicionar novos)
        </label>
        {emails.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {emails.map(e => (
              <span key={e} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}>
                {e}<button onClick={() => removeEmail(e)} style={{ color: 'var(--success)', lineHeight: 0 }}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input type="email" value={novoEmail} onChange={e => setNovoEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail() } }}
            placeholder="adicionar e-mail…" className="flex-1 rounded-lg px-3 py-2 text-sm" style={st} />
          <button onClick={addEmail} className="px-3 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}>Adicionar</button>
        </div>
        <label className="flex items-start gap-2 mt-2.5 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={salvar} onChange={e => setSalvar(e.target.checked)} className="mt-0.5" />
          <span>Salvar estes e-mails {row.manual ? 'nesta inclusão manual' : 'no cadastro do cliente'} para os próximos.</span>
        </label>

        <div className="mt-3">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Corpo do e-mail (editável)</label>
          <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={4}
            className="w-full rounded-lg px-3 py-2 text-sm mt-1" style={{ ...st, resize: 'vertical', fontFamily: 'inherit' }} />
          <button onClick={() => fetchPreview(mensagem)} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium mt-2 disabled:opacity-60"
            style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <Mail size={14} /> {loading ? 'Gerando prévia…' : 'Atualizar prévia'}
          </button>
          {preview && (
            <div className="mt-2 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div className="px-3 py-2 text-xs font-semibold" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                Assunto: <span style={{ color: 'var(--text)' }}>{preview.subject}</span>
              </div>
              <iframe title="Prévia" srcDoc={preview.html} style={{ width: '100%', height: 300, border: 'none', background: '#fff' }} />
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <button onClick={() => { if (!sending) onClose() }} disabled={sending}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <X size={15} /> Cancelar
        </button>
        <button onClick={enviar} disabled={sending || !emails.length || !preview}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
          <Send size={15} /> {sending ? 'Enviando…' : 'Reenviar e-mail'}
        </button>
      </ModalFooter>
    </Modal>
  )
}

// ─── Modal: aviso prévio de reajuste (próximo mês, estimativa) ───────────────
function AvisoModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const base = row.manual ? `/contracts/reajustes/manual/${row.id}` : `/contracts/${row.id}`
  const [idx, setIdx] = useState<'IGPM' | 'IPCA'>((row.taxa_reajuste as 'IGPM' | 'IPCA') || 'IGPM')
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
  const [mensagem, setMensagem] = useState('')
  const [seeded, setSeeded] = useState(false)
  const [emails, setEmails] = useState<string[]>([])
  const [novoEmail, setNovoEmail] = useState('')
  const [salvar, setSalvar] = useState(true)
  const [est, setEst] = useState<{ pct: number; valor: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  const fetchPrev = useCallback(async (index: string, msg?: string) => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ index_type: index })
      if (msg !== undefined) q.set('mensagem', msg)
      const res = await api.get<{ subject: string; html: string; mensagem_padrao?: string; cliente_emails?: string[]; percentual?: number; valor_estimado?: number }>(`${base}/aviso-preview?${q.toString()}`)
      setPreview({ subject: res.subject, html: res.html })
      setEst({ pct: res.percentual ?? 0, valor: res.valor_estimado ?? 0 })
      if (!seeded) { setMensagem(res.mensagem_padrao ?? ''); setEmails(res.cliente_emails ?? []); setSeeded(true) }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gerar a prévia do aviso')
    } finally { setLoading(false) }
  }, [base, seeded])

  useEffect(() => { setSeeded(false); void fetchPrev(idx) /* eslint-disable-next-line */ }, [idx])

  const addEmail = () => {
    const e = novoEmail.trim().toLowerCase()
    if (!e) return
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { toast.error('E-mail inválido'); return }
    if (!emails.includes(e)) setEmails(prev => [...prev, e])
    setNovoEmail('')
  }
  const enviar = async () => {
    if (!emails.length) { toast.error('Informe ao menos um e-mail'); return }
    setSending(true)
    try {
      const res = await api.post<{ emails: string[] }>(`${base}/aviso-send`, { index_type: idx, emails, mensagem: seeded ? mensagem : undefined, salvar })
      toast.success(`Aviso enviado (${res.emails.length} destinatário${res.emails.length !== 1 ? 's' : ''})`)
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao enviar o aviso')
    } finally { setSending(false) }
  }
  const st = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  return (
    <Modal open onClose={() => { if (!sending) onClose() }} size="md">
      <ModalHeader icon={CalendarClock} title="Avisar reajuste do próximo mês"
        subtitle={`${row.cliente_nome ?? '—'} · ${row.codigo ?? '—'}`} onClose={() => { if (!sending) onClose() }} />
      <ModalBody>
        <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Índice (12 meses fechados)</label>
        <div className="flex gap-2 mt-1.5 mb-3">
          {(['IGPM', 'IPCA'] as const).map(opt => (
            <button key={opt} onClick={() => setIdx(opt)}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-medium"
              style={{ background: idx === opt ? 'var(--primary-soft)' : 'var(--surface)', border: `1px solid ${idx === opt ? 'var(--primary)' : 'var(--border)'}`, color: 'var(--text)' }}>
              {opt === 'IGPM' ? 'IGP-M' : 'IPCA'}
            </button>
          ))}
        </div>
        {est && (
          <div className="rounded-lg px-3 py-2 mb-3 text-sm" style={{ background: 'var(--success-bg)', border: '1px solid var(--success)', color: 'var(--text)' }}>
            Reajuste: <b>+{est.pct}%</b> → <b>{formatBRL(est.valor)}</b> <span style={{ color: 'var(--text-muted)' }}>(valor consolidado — 12 meses fechados)</span>
          </div>
        )}
        <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}><Mail size={14} /> Destinatários</label>
        {emails.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {emails.map(e => (
              <span key={e} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}>
                {e}<button onClick={() => setEmails(prev => prev.filter(x => x !== e))} style={{ color: 'var(--success)', lineHeight: 0 }}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input type="email" value={novoEmail} onChange={e => setNovoEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail() } }}
            placeholder="adicionar e-mail…" className="flex-1 rounded-lg px-3 py-2 text-sm" style={st} />
          <button onClick={addEmail} className="px-3 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}>Adicionar</button>
        </div>
        <label className="flex items-start gap-2 mt-2.5 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={salvar} onChange={e => setSalvar(e.target.checked)} className="mt-0.5" />
          <span>Salvar estes e-mails {row.manual ? 'nesta inclusão manual' : 'no cadastro do cliente'} para os próximos.</span>
        </label>
        <div className="mt-3">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Corpo do e-mail (editável)</label>
          <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={4} className="w-full rounded-lg px-3 py-2 text-sm mt-1" style={{ ...st, resize: 'vertical', fontFamily: 'inherit' }} />
          <button onClick={() => fetchPrev(idx, mensagem)} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium mt-2 disabled:opacity-60" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <Mail size={14} /> {loading ? 'Gerando prévia…' : 'Atualizar prévia'}
          </button>
          {preview && (
            <div className="mt-2 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div className="px-3 py-2 text-xs font-semibold" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Assunto: <span style={{ color: 'var(--text)' }}>{preview.subject}</span></div>
              <iframe title="Prévia do aviso" srcDoc={preview.html} style={{ width: '100%', height: 300, border: 'none', background: '#fff' }} />
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <button onClick={() => { if (!sending) onClose() }} disabled={sending} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <X size={15} /> Cancelar
        </button>
        <button onClick={enviar} disabled={sending || !emails.length || !preview} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
          <Send size={15} /> {sending ? 'Enviando…' : 'Enviar aviso'}
        </button>
      </ModalFooter>
    </Modal>
  )
}
