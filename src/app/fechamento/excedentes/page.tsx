'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { toast } from 'sonner'
import { Clock, RefreshCw, Search, DollarSign, AlertTriangle, CheckCircle, Ban, FileText, Send } from 'lucide-react'
import { PageHeader, Card, Badge, Button, Th, Tbody, Tr, Td, SkeletonTable, EmptyState } from '@/components/ds'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal'

interface Row {
  project_id: number
  code: string
  project_name: string
  customer_id: number
  customer_name: string
  basis: 'monthly' | 'fixed' | 'closed'
  contracted_hours: number
  consumed_hours: number
  excess_hours: number
  additional_hourly_rate: number
  excess_value: number
  charge: boolean
  status: 'pendente' | 'cobrado' | 'nao_cobrar'
  record_id: number | null
  closed_at: string | null
  envio_em?: string | null
  envio_por?: string | null
}

const STATUS: Record<Row['status'], { label: string; variant: string }> = {
  pendente:   { label: 'Pendente',    variant: 'warning' },
  cobrado:    { label: 'Cobrado',     variant: 'success' },
  nao_cobrar: { label: 'Não cobrar',  variant: 'default' },
}

function ExcedentesPage() {
  const now = new Date()
  // Default: mês anterior fechado (a cobrança olha sempre a apuração do mês passado).
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const [month, setMonth] = useState<number | null>(prev.getMonth() + 1)
  const [year, setYear] = useState<number | null>(prev.getFullYear())
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [basisFilter, setBasisFilter] = useState<'' | 'monthly' | 'fixed' | 'closed'>('')
  const [busy, setBusy] = useState<number | null>(null)

  const ym = month && year ? `${year}-${String(month).padStart(2, '0')}` : null

  const load = useCallback(async () => {
    if (!ym) return
    setLoading(true)
    try {
      const res = await api.get<{ data: Row[]; total_geral: number }>(`/fechamento-excedente?year_month=${ym}`)
      setRows(res.data ?? [])
      setTotal(res.total_geral ?? 0)
    } catch {
      toast.error('Erro ao carregar horas excedentes')
    } finally {
      setLoading(false)
    }
  }, [ym])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r =>
      (!basisFilter || r.basis === basisFilter) &&
      (!q || r.customer_name.toLowerCase().includes(q) || (r.code ?? '').toLowerCase().includes(q)))
  }, [rows, search, basisFilter])

  const totalCobravel = useMemo(
    () => filtered.filter(r => r.charge && r.status !== 'nao_cobrar').reduce((s, r) => s + r.excess_value, 0),
    [filtered])

  // Otimista: atualiza o estado sem refetch (evita sobrescrever por consistência eventual).
  const patch = (projectId: number, upd: Partial<Row>) =>
    setRows(rs => rs.map(r => r.project_id === projectId ? { ...r, ...upd } : r))

  const toggleFlag = async (r: Row) => {
    const next = !r.charge
    setBusy(r.project_id); patch(r.project_id, { charge: next })
    try {
      await api.patch(`/fechamento-excedente/${r.project_id}/flag`, { charge_excess_hours: next })
    } catch {
      patch(r.project_id, { charge: r.charge }); toast.error('Erro ao alterar o flag de cobrança')
    } finally { setBusy(null) }
  }

  const setStatus = async (r: Row, status: Row['status']) => {
    if (!ym) return
    setBusy(r.project_id); patch(r.project_id, { status })
    try {
      await api.post(`/fechamento-excedente/${r.project_id}/${ym}`, { status })
      toast.success(status === 'cobrado' ? 'Marcado como cobrado' : status === 'nao_cobrar' ? 'Marcado como não cobrar' : 'Reaberto')
    } catch {
      patch(r.project_id, { status: r.status }); toast.error('Erro ao salvar o status')
    } finally { setBusy(null) }
  }

  // ── Relatório + e-mail por cliente ──
  const [reportFor, setReportFor] = useState<{ customerId: number; name: string; envio_em?: string | null } | null>(null)
  const [reportHtml, setReportHtml] = useState('')
  const [reportLoading, setReportLoading] = useState(false)
  const [emails, setEmails] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  // Semeia o textarea só no 1º fetch; depois a prévia atualiza sozinha ao editar a mensagem.
  const previewSeededRef = useRef(false)

  // Prévia = o E-MAIL real (layout branded), não o PDF. Live: re-busca ao editar a mensagem.
  const fetchEmailPreview = useCallback(async (customerId: number, mensagem?: string) => {
    setReportLoading(true)
    try {
      const payload: Record<string, unknown> = {}
      if (mensagem !== undefined) payload.mensagem = mensagem
      const res = await api.post<{ html: string; default_message?: string }>(`/fechamento-excedente/${customerId}/${ym}/email-preview`, payload)
      setReportHtml(res.html ?? '')
      if (!previewSeededRef.current) { previewSeededRef.current = true; setMessage(res.default_message ?? '') }
    } catch {
      toast.error('Erro ao gerar a prévia do e-mail')
    } finally { setReportLoading(false) }
  }, [ym])

  const openReport = async (r: Row) => {
    previewSeededRef.current = false
    setReportFor({ customerId: r.customer_id, name: r.customer_name, envio_em: r.envio_em })
    setEmails(''); setMessage(''); setReportHtml('')
    void fetchEmailPreview(r.customer_id)
  }

  // Live update da prévia ao editar a mensagem (debounce ~450ms), depois do 1º fetch.
  useEffect(() => {
    if (!reportFor || !previewSeededRef.current) return
    const t = setTimeout(() => { void fetchEmailPreview(reportFor.customerId, message) }, 450)
    return () => clearTimeout(t)
  }, [message, reportFor, fetchEmailPreview])

  const sendEmail = async () => {
    if (!reportFor || !ym) return
    const list = emails.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
    if (list.length === 0) { toast.error('Informe ao menos um e-mail'); return }
    setSending(true)
    try {
      const res = await api.post<{ success: boolean; message: string }>(
        `/fechamento-excedente/${reportFor.customerId}/${ym}/email`, { emails: list, mensagem: message || undefined })
      toast.success(res.message ?? 'Enviado')
      setReportFor(null)
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Falha ao enviar o e-mail')
    } finally { setSending(false) }
  }

  return (
    <AppLayout title="Fechamento — Horas Excedentes">
      <div className="space-y-6">
        <PageHeader
          icon={Clock}
          title="Horas Excedentes"
          subtitle="Cobrança de horas consumidas acima das contratadas (Banco de Horas Mensal e Fixo)"
          actions={
            <div className="flex items-center gap-2">
              <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m || null); setYear(y || null) }} />
              <Button size="sm" variant="secondary" icon={RefreshCw} onClick={load} loading={loading} disabled={loading}>
                Atualizar
              </Button>
            </div>
          }
        />

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <div className="flex items-center gap-3">
              <AlertTriangle size={18} style={{ color: 'var(--warning)' }} />
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Contratos com excedente</div>
                <div className="text-lg font-semibold">{loading ? '—' : filtered.length}</div>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <DollarSign size={18} style={{ color: 'var(--primary)' }} />
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Total apurado (excedente)</div>
                <div className="text-lg font-semibold">{loading ? '—' : formatBRL(total)}</div>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <CheckCircle size={18} style={{ color: 'var(--success)' }} />
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>A cobrar (flag ligado)</div>
                <div className="text-lg font-semibold">{loading ? '—' : formatBRL(totalCobravel)}</div>
              </div>
            </div>
          </Card>
        </div>

        <p className="text-[11px] -mt-3 leading-snug" style={{ color: 'var(--text-light)' }}>
          <strong style={{ color: 'var(--text-muted)' }}>BH Mensal</strong>: excedente do mês (consumo − contratadas do mês). <strong style={{ color: 'var(--text-muted)' }}>BH Fixo</strong>: estado atual (banco esgotado). Valor = horas excedentes × <strong style={{ color: 'var(--text-muted)' }}>Hora Adicional</strong> do contrato — contratos com Hora Adicional zerada aparecem com valor R$ 0,00.
        </p>

        {/* Busca */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente ou código..."
              className="pl-8 pr-3 py-2 rounded-lg text-sm w-64"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <select value={basisFilter} onChange={e => setBasisFilter(e.target.value as '' | 'monthly' | 'fixed' | 'closed')}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <option value="">Todos os tipos</option>
            <option value="monthly">BH Mensal</option>
            <option value="fixed">BH Fixo</option>
          </select>
        </div>

        {/* Tabela */}
        {loading ? (
          <SkeletonTable rows={6} cols={9} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Clock} title="Sem horas excedentes" description="Nenhum contrato de Banco de Horas com excedente na competência." />
        ) : (
          <div className="rounded-2xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm" style={{ background: 'var(--surface)' }}>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Tipo</Th>
                  <Th right>Contratadas</Th>
                  <Th right>Consumido</Th>
                  <Th right>Excedente</Th>
                  <Th right>Hora adic.</Th>
                  <Th right>Valor</Th>
                  <Th>Cobrar</Th>
                  <Th>Status</Th>
                  <Th>Ações</Th>
                </tr>
              </thead>
              <Tbody>
                {filtered.map(r => {
                  const st = STATUS[r.status]
                  return (
                    <Tr key={r.project_id}>
                      <Td>
                        <div className="font-medium">{r.customer_name}</div>
                        <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>{r.code} — {r.project_name}</div>
                      </Td>
                      <Td><Badge variant={r.basis === 'monthly' ? 'default' : 'primary'}>{r.basis === 'fixed' ? 'BH Fixo' : r.basis === 'closed' ? 'Fechado' : 'BH Mensal'}</Badge></Td>
                      <Td right mono className="tabular-nums" style={{ color: 'var(--text-muted)' }}>{r.contracted_hours}h</Td>
                      <Td right mono className="tabular-nums">{r.consumed_hours}h</Td>
                      <Td right mono className="tabular-nums" style={{ color: 'var(--warning)' }}>{r.excess_hours}h</Td>
                      <Td right mono className="tabular-nums" style={{ color: 'var(--text-muted)' }}>{formatBRL(r.additional_hourly_rate)}</Td>
                      <Td right mono className="tabular-nums" style={{ color: r.excess_value > 0 ? 'var(--text)' : 'var(--text-light)' }}>{formatBRL(r.excess_value)}</Td>
                      <Td>
                        <button
                          onClick={() => toggleFlag(r)} disabled={busy === r.project_id}
                          className="text-[11px] font-semibold px-2 py-1 rounded-full transition-colors"
                          style={{
                            background: r.charge ? 'var(--success-bg)' : 'var(--surface-hover)',
                            color: r.charge ? 'var(--success)' : 'var(--text-light)',
                            border: `1px solid ${r.charge ? 'var(--success)' : 'var(--border)'}`,
                          }}
                        >
                          {r.charge ? 'Cobrar' : 'Não cobrar'}
                        </button>
                      </Td>
                      <Td><Badge variant={st.variant}>{st.label}</Badge></Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="secondary" icon={FileText} disabled={busy === r.project_id}
                            onClick={() => openReport(r)}>Relatório</Button>
                          {r.status !== 'cobrado' && (
                            <Button size="sm" variant="secondary" icon={CheckCircle} disabled={busy === r.project_id}
                              onClick={() => setStatus(r, 'cobrado')}>Cobrado</Button>
                          )}
                          {r.status !== 'nao_cobrar' && (
                            <Button size="sm" variant="ghost" icon={Ban} disabled={busy === r.project_id}
                              onClick={() => setStatus(r, 'nao_cobrar')}>Não cobrar</Button>
                          )}
                          {r.status !== 'pendente' && (
                            <Button size="sm" variant="ghost" disabled={busy === r.project_id}
                              onClick={() => setStatus(r, 'pendente')}>Reabrir</Button>
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
      </div>

      <Modal open={!!reportFor} onClose={() => setReportFor(null)} size="lg">
        <ModalHeader
          title={`Horas Excedentes — ${reportFor?.name ?? ''}`}
          subtitle={reportFor?.envio_em ? `Já enviado em ${new Date(reportFor.envio_em).toLocaleString('pt-BR')}` : 'Revise o relatório e envie ao cliente'}
          icon={FileText}
          onClose={() => setReportFor(null)}
        />
        <ModalBody>
          <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid var(--border)', height: 420, background: '#fff' }}>
            {reportLoading && !reportHtml
              ? <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--text-muted)' }}>Gerando prévia do e-mail…</div>
              : <iframe title="Prévia do e-mail" srcDoc={reportHtml} className="w-full h-full border-0" />}
          </div>
          <div className="space-y-2">
            <div>
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>E-mails do destino (separe por vírgula)</label>
              <input value={emails} onChange={e => setEmails(e.target.value)} placeholder="cliente@empresa.com, financeiro@empresa.com"
                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Mensagem (modelo preenchido — edite se quiser)</label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={14} placeholder="Deixe em branco para usar a mensagem padrão."
                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>
              Enviado como você (remetente logado), com cópia para os papéis da Central de Workflows. O PDF vai anexo.
            </p>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setReportFor(null)} disabled={sending}>Cancelar</Button>
          <Button variant="primary" icon={Send} onClick={sendEmail} loading={sending} disabled={sending || reportLoading}>
            Enviar ao cliente
          </Button>
        </ModalFooter>
      </Modal>
    </AppLayout>
  )
}

export default ExcedentesPage
