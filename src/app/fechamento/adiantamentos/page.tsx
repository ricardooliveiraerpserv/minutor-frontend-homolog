'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api, apiMessage } from '@/lib/api'
import { useAsyncAction } from '@/hooks/use-async-action'
import { formatBRL } from '@/lib/format'
import { toast } from 'sonner'
import { Banknote, Plus, Pencil, Trash2, Save, X } from 'lucide-react'
import { SearchSelect } from '@/components/ui/search-select'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import {
  Table, Thead, Th, Tbody, Tr, Td,
  Badge, Button, TextInput, SkeletonTable, EmptyState, Modal,
} from '@/components/ds'

// ─── Tipos ───────────────────────────────────────────────────────────────────
type Tipo = 'consultor' | 'parceiro'
type Natureza = 'adiantamento' | 'emprestimo'

interface Parcela { numero?: number; year_month: string; valor: number }

interface Adiantamento {
  id: number
  beneficiario_tipo: Tipo
  beneficiario_id: number
  beneficiario_nome: string
  tipo: Natureza
  valor_total: number
  data_realizado: string | null
  disponibilizado: boolean
  num_parcelas: number
  primeira_competencia: string
  descricao: string | null
  criado_por: string | null
  created_at: string | null
  parcelas: Parcela[]
  parcelas_pagas: number
  parcelas_restantes: number
  valor_pago: number
  valor_devido: number
  encerrado: boolean
}

interface Benef { id: number; nome: string }

// ─── Helpers de competência (AAAA-MM) ────────────────────────────────────────
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const fmtComp = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return m >= 1 && m <= 12 ? `${MESES[m - 1]}/${y}` : ym
}
const toYM = (m: number, y: number) => `${y}-${String(m).padStart(2, '0')}`

// Gera parcelas mensais consecutivas (total ÷ N, última absorve arredondamento).
function gerarParcelas(total: number, n: number, startYM: string): Parcela[] {
  if (!total || !n || !startYM) return []
  const base = Math.floor((total / n) * 100) / 100
  const resto = Math.round((total - base * n) * 100) / 100
  const [y, m] = startYM.split('-').map(Number)
  const out: Parcela[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(y, (m - 1) + i, 1)
    out.push({
      numero: i + 1,
      year_month: toYM(d.getMonth() + 1, d.getFullYear()),
      valor: i === n - 1 ? Math.round((base + resto) * 100) / 100 : base,
    })
  }
  return out
}

export default function AdiantamentosPage() {
  const [lista, setLista] = useState<Adiantamento[]>([])
  const [aba, setAba] = useState<'ativos' | 'encerrados'>('ativos')
  const [loading, setLoading] = useState(true)
  const [benef, setBenef] = useState<{ consultores: Benef[]; parceiros: Benef[] }>({ consultores: [], parceiros: [] })

  // Form (modal)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [natureza, setNatureza] = useState<Natureza>('adiantamento')
  const [tipo, setTipo] = useState<Tipo>('consultor')
  const [beneficiarioId, setBeneficiarioId] = useState<string>('')
  const [valorTotal, setValorTotal] = useState('')
  const [disponibilizado, setDisponibilizado] = useState(true)
  const [feitoMonth, setFeitoMonth] = useState<number | null>(null)
  const [feitoYear, setFeitoYear] = useState<number | null>(null)
  const [numParcelas, setNumParcelas] = useState('1')
  const [compMonth, setCompMonth] = useState<number | null>(null)
  const [compYear, setCompYear] = useState<number | null>(null)
  const [descricao, setDescricao] = useState('')
  const [parcelas, setParcelas] = useState<Parcela[]>([])

  const load = useCallback(() => {
    setLoading(true)
    api.get<{ data: Adiantamento[] }>('/adiantamentos')
      .then(r => setLista(r.data ?? []))
      .catch(() => toast.error('Erro ao carregar adiantamentos'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.get<{ consultores: Benef[]; parceiros: Benef[] }>('/adiantamentos/beneficiarios')
      .then(r => setBenef({ consultores: r.consultores ?? [], parceiros: r.parceiros ?? [] }))
      .catch(() => {})
  }, [])

  const startYM = compMonth && compYear ? toYM(compMonth, compYear) : ''

  // Recalcula as parcelas ao mudar valor / nº / competência inicial.
  useEffect(() => {
    const total = parseFloat(valorTotal.replace(',', '.')) || 0
    const n = parseInt(numParcelas) || 0
    setParcelas(gerarParcelas(total, n, startYM))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorTotal, numParcelas, startYM])

  const beneficiarioOptions = useMemo(
    () => (tipo === 'consultor' ? benef.consultores : benef.parceiros).map(b => ({ id: b.id, name: b.nome })),
    [tipo, benef],
  )

  const somaParcelas = parcelas.reduce((s, p) => s + (Number(p.valor) || 0), 0)

  const openNovo = () => {
    setEditingId(null)
    setNatureza('adiantamento')
    setTipo('consultor'); setBeneficiarioId(''); setValorTotal(''); setNumParcelas('1')
    setDisponibilizado(true)
    setFeitoMonth(null); setFeitoYear(null)
    setCompMonth(null); setCompYear(null); setDescricao(''); setParcelas([])
    setModalOpen(true)
  }

  const openEditar = (a: Adiantamento) => {
    setEditingId(a.id)
    setNatureza(a.tipo ?? 'adiantamento')
    setTipo(a.beneficiario_tipo)
    setBeneficiarioId(String(a.beneficiario_id))
    setValorTotal(String(a.valor_total))
    setDisponibilizado(a.disponibilizado ?? true)
    setNumParcelas(String(a.num_parcelas))
    if (a.data_realizado) {
      const [fy, fm] = a.data_realizado.split('-').map(Number)
      setFeitoMonth(fm); setFeitoYear(fy)
    } else { setFeitoMonth(null); setFeitoYear(null) }
    const [y, m] = a.primeira_competencia.split('-').map(Number)
    setCompMonth(m); setCompYear(y)
    setDescricao(a.descricao ?? '')
    setParcelas(a.parcelas.map(p => ({ numero: p.numero, year_month: p.year_month, valor: Number(p.valor) })))
    setModalOpen(true)
  }

  // Ao escolher a data em que foi feito, sugere a competência de desconto/quitação:
  // adiantamento desconta no mesmo mês; empréstimo começa a quitar no mês seguinte.
  const pickFeito = (m: number, y: number) => {
    setFeitoMonth(m || null); setFeitoYear(y || null)
    if (m && y) {
      const offset = natureza === 'emprestimo' ? 1 : 0
      const d = new Date(y, (m - 1) + offset, 1)
      setCompMonth(d.getMonth() + 1); setCompYear(d.getFullYear())
    }
  }

  const setParcelaValor = (idx: number, v: string) =>
    setParcelas(prev => prev.map((p, i) => i === idx ? { ...p, valor: parseFloat(v.replace(',', '.')) || 0 } : p))
  const setParcelaComp = (idx: number, m: number, y: number) =>
    setParcelas(prev => prev.map((p, i) => i === idx ? { ...p, year_month: toYM(m, y) } : p))

  // Sub-6 Cadastros · Adiantamentos (CRUD) — Cat B. useAsyncAction por operação (excluir tem confirm custom
  // + remoção local, não refetch → não força useCrudActions). Payload/modal/sequência intactos.
  const salvarAction = useAsyncAction(async () => {
    if (!beneficiarioId) { toast.error('Selecione o beneficiário'); return }
    const total = parseFloat(valorTotal.replace(',', '.')) || 0
    if (total <= 0) { toast.error('Informe o valor total'); return }
    if (!feitoMonth || !feitoYear) { toast.error('Informe a data em que foi feito'); return }
    if (!startYM) { toast.error('Informe a competência inicial'); return }
    if (parcelas.length === 0) { toast.error('Nenhuma parcela gerada'); return }

    const payload = {
      beneficiario_tipo: tipo,
      tipo: natureza,
      beneficiario_id: Number(beneficiarioId),
      valor_total: total,
      disponibilizado: natureza === 'emprestimo' ? disponibilizado : true,
      data_realizado: `${feitoYear}-${String(feitoMonth).padStart(2, '0')}-01`,
      num_parcelas: parcelas.length,
      primeira_competencia: parcelas[0].year_month,
      descricao: descricao.trim() || null,
      parcelas: parcelas.map(p => ({ year_month: p.year_month, valor: p.valor })),
    }
    if (editingId) await api.put(`/adiantamentos/${editingId}`, payload)
    else await api.post('/adiantamentos', payload)
    toast.success(editingId ? 'Adiantamento atualizado' : 'Adiantamento criado')
    setModalOpen(false)
    load()
  }, { onError: e => toast.error(apiMessage(e, 'Erro ao salvar o adiantamento')) })
  const salvar = () => salvarAction.run()
  const saving = salvarAction.pending

  const excluirAction = useAsyncAction(async (a: Adiantamento) => {
    if (!confirm(`Excluir o adiantamento de ${a.beneficiario_nome} (${formatBRL(a.valor_total)})?`)) return
    await api.delete(`/adiantamentos/${a.id}`)
    toast.success('Adiantamento excluído')
    setLista(prev => prev.filter(x => x.id !== a.id))
  }, { onError: e => toast.error(apiMessage(e, 'Erro ao excluir')) })
  const excluir = (a: Adiantamento) => excluirAction.run(a)

  const ativos = lista.filter(a => !a.encerrado)
  const encerrados = lista.filter(a => a.encerrado)
  const listaFiltrada = aba === 'encerrados' ? encerrados : ativos

  return (
    <AppLayout title="Adiantamentos e Empréstimos">
      <div className="flex-1 flex flex-col min-h-0 overflow-auto">
        <div className="px-4 md:px-6 pt-6 pb-4 border-b flex items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <Banknote size={20} style={{ color: 'var(--primary)' }} />
            <div>
              <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Adiantamentos e Empréstimos</h1>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Colaboradores (consultores, diretores, coordenadores) e parceiros. <b>Adiantamento</b> desconta no fechamento; <b>empréstimo</b> soma no mês em que foi feito e é quitado pelas parcelas.
              </p>
            </div>
          </div>
          <Button variant="primary" size="sm" icon={Plus} onClick={openNovo}>Incluir adiantamento ou empréstimo</Button>
        </div>

        <div className="px-4 md:px-6 pt-4 flex items-center gap-1">
          {([['ativos', 'Ativos', ativos.length], ['encerrados', 'Encerrados', encerrados.length]] as const).map(([k, label, n]) => (
            <button key={k} type="button" onClick={() => setAba(k)}
              className="flex items-center gap-2" style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, fontWeight: aba === k ? 600 : 400, background: aba === k ? 'var(--primary-soft)' : 'transparent', color: aba === k ? 'var(--primary)' : 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
              {label} <span style={{ fontSize: 11, background: 'var(--surface-sunken)', borderRadius: 999, padding: '1px 8px' }}>{n}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-4 md:p-6">
          {loading ? <SkeletonTable rows={6} cols={6} /> :
            listaFiltrada.length === 0 ? (
              <EmptyState icon={Banknote} title={aba === 'encerrados' ? 'Nenhum encerrado' : 'Nenhum adiantamento ativo'}
                description={aba === 'encerrados' ? 'Adiantamentos/empréstimos totalmente quitados aparecem aqui.' : 'Cadastre um adiantamento para colaborador ou parceiro — as parcelas entram no fechamento.'} />
            ) : (
              <Table>
                <Thead>
                  <tr>
                    <Th>Beneficiário</Th>
                    <Th>Natureza</Th>
                    <Th>Perfil</Th>
                    <Th right>Valor total</Th>
                    <Th right>Devido</Th>
                    <Th>Feito em</Th>
                    <Th>Parcelas</Th>
                    <Th>Progresso</Th>
                    <Th>Período</Th>
                    <Th>Descrição</Th>
                    <Th right>Ações</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {listaFiltrada.map(a => {
                    const ult = a.parcelas[a.parcelas.length - 1]
                    const isEmp = a.tipo === 'emprestimo'
                    const pct = a.num_parcelas > 0 ? Math.round((a.parcelas_pagas / a.num_parcelas) * 100) : 0
                    return (
                      <Tr key={a.id}>
                        <Td className="text-sm font-medium">{a.beneficiario_nome}</Td>
                        <Td>
                          <div className="flex items-center gap-1.5">
                            <Badge variant={isEmp ? 'success' : 'warning'}>
                              {isEmp ? 'Empréstimo' : 'Adiantamento'}
                            </Badge>
                            {isEmp && !a.disponibilizado && (
                              <Badge variant="danger">Pendente</Badge>
                            )}
                          </div>
                        </Td>
                        <Td>
                          <Badge variant={a.beneficiario_tipo === 'parceiro' ? 'purple' : 'primary'}>
                            {a.beneficiario_tipo === 'parceiro' ? 'Parceiro' : 'Colaborador'}
                          </Badge>
                        </Td>
                        <Td right className="tabular-nums text-sm font-semibold">{formatBRL(a.valor_total)}</Td>
                        <Td right className="tabular-nums text-sm font-semibold" style={{ color: a.valor_devido > 0 ? 'var(--warning)' : 'var(--success)' }}>{formatBRL(a.valor_devido)}</Td>
                        <Td className="text-xs" muted>{a.data_realizado ? fmtComp(a.data_realizado.slice(0, 7)) : '—'}</Td>
                        <Td className="text-xs" muted>{a.num_parcelas}x</Td>
                        <Td>
                          {a.encerrado ? (
                            <Badge variant="success">Quitado</Badge>
                          ) : (
                            <div style={{ minWidth: 120 }}>
                              <div className="flex items-center justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                                <span><b style={{ color: 'var(--success)' }}>{a.parcelas_pagas}</b> pagas · <b style={{ color: 'var(--warning)' }}>{a.parcelas_restantes}</b> faltam</span>
                              </div>
                              <div style={{ height: 5, borderRadius: 999, background: 'var(--surface-sunken)', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--success)' }} />
                              </div>
                            </div>
                          )}
                        </Td>
                        <Td className="text-xs" muted>
                          {fmtComp(a.primeira_competencia)}{ult ? ` — ${fmtComp(ult.year_month)}` : ''}
                        </Td>
                        <Td className="text-xs" muted>{a.descricao || '—'}</Td>
                        <Td right>
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openEditar(a)}>Editar</Button>
                            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => excluir(a)}>Excluir</Button>
                          </div>
                        </Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            )}
        </div>
      </div>

      {/* Modal de cadastro/edição */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Editar lançamento' : 'Incluir adiantamento ou empréstimo'} width="max-w-2xl">
        <div className="flex flex-col gap-4">
          {/* Natureza: adiantamento (desconta) × empréstimo (soma e quita) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>
              Natureza
            </label>
            <div className="flex gap-2">
              {(['adiantamento', 'emprestimo'] as const).map(n => (
                <button key={n} type="button"
                  onClick={() => setNatureza(n)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={natureza === n
                    ? { background: 'var(--primary)', color: 'var(--primary-fg)' }
                    : { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                >
                  {n === 'adiantamento' ? 'Adiantamento' : 'Empréstimo'}
                </button>
              ))}
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {natureza === 'emprestimo'
                ? 'No empréstimo o valor é somado ao fechamento do mês em que foi feito, e depois descontado nas parcelas dos meses seguintes.'
                : 'No adiantamento o valor é descontado do fechamento, nas parcelas informadas abaixo.'}
            </p>
          </div>

          {/* Empréstimo: só entra no fechamento quando o valor já foi disponibilizado */}
          {natureza === 'emprestimo' && (
            <label className="flex items-start gap-2.5 rounded-lg p-3 cursor-pointer"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <input type="checkbox" checked={disponibilizado}
                onChange={e => setDisponibilizado(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0" style={{ accentColor: 'var(--primary)' }} />
              <span className="text-xs" style={{ color: 'var(--text)' }}>
                <b>Disponibilizar no fechamento</b>
                <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {disponibilizado
                    ? 'O valor é somado a este fechamento e as parcelas começam a descontar nos meses seguintes.'
                    : 'O empréstimo fica só registrado (pendente) e não altera nenhum fechamento.'}
                </span>
              </span>
            </label>
          )}

          {/* Perfil do beneficiário */}
          <div className="flex gap-2">
            {(['consultor', 'parceiro'] as const).map(t => (
              <button key={t} type="button"
                onClick={() => { setTipo(t); setBeneficiarioId('') }}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                style={tipo === t
                  ? { background: 'var(--primary)', color: 'var(--primary-fg)' }
                  : { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
              >
                {t === 'consultor' ? 'Colaborador' : 'Parceiro'}
              </button>
            ))}
          </div>

          <SearchSelect
            label="Beneficiário"
            value={beneficiarioId}
            onChange={setBeneficiarioId}
            options={beneficiarioOptions}
            placeholder={`Selecionar ${tipo === 'consultor' ? 'colaborador' : 'parceiro'}...`}
            fullWidth
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TextInput label="Valor total (R$)" type="number" min="0" step="0.01" inputMode="decimal"
              value={valorTotal} onChange={e => setValorTotal(e.target.value)} placeholder="0,00" />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>
                Data em que foi feito
              </label>
              <MonthYearPicker month={feitoMonth} year={feitoYear} onChange={(m, y) => pickFeito(m, y)} />
            </div>
            <TextInput label="Nº de parcelas" type="number" min="1" max="120"
              value={numParcelas} onChange={e => setNumParcelas(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5 max-w-[220px]">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>
              {natureza === 'emprestimo' ? 'Quitação começa em' : 'Começa a descontar em'}
            </label>
            <MonthYearPicker month={compMonth} year={compYear} onChange={(m, y) => { setCompMonth(m || null); setCompYear(y || null) }} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Descrição</label>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2}
              placeholder="Motivo / observação do adiantamento" className="ds-input w-full resize-none" />
          </div>

          {/* Parcelas (editáveis) */}
          {parcelas.length > 0 && (
            <div className="rounded-lg p-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--text-light)' }}>
                  Parcelas ({parcelas.length})
                </p>
                <span className="text-xs tabular-nums" style={{ color: Math.abs(somaParcelas - (parseFloat(valorTotal.replace(',', '.')) || 0)) < 0.01 ? 'var(--success)' : 'var(--danger)' }}>
                  Soma {formatBRL(somaParcelas)}
                </span>
              </div>
              <div className="flex flex-col gap-2 max-h-56 overflow-y-auto">
                {parcelas.map((p, i) => {
                  const [py, pm] = p.year_month.split('-').map(Number)
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs w-6 shrink-0" style={{ color: 'var(--text-muted)' }}>{i + 1}.</span>
                      <div className="w-40 shrink-0">
                        <MonthYearPicker month={pm} year={py} onChange={(m, y) => setParcelaComp(i, m, y)} />
                      </div>
                      <input type="number" min="0" step="0.01" inputMode="decimal"
                        value={p.valor}
                        onChange={e => setParcelaValor(i, e.target.value)}
                        className="ds-input flex-1 tabular-nums" />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" icon={X} onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" size="sm" icon={Save} loading={saving} onClick={salvar}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  )
}
