'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { PageHeader, Table, Thead, Th, Tbody, Tr, Td, EmptyState, SkeletonTable, Button } from '@/components/ds'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { useTableSort } from '@/hooks/use-table-sort'
import { DollarSign, Users, Download, FileText, X } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Row {
  tipo: 'consultor' | 'parceiro'
  empresa: string
  nome: string
  vinculo: string | null
  vinculo_label: string
  contract_type: string | null
  contract_type_label: string
  valor: number
  envio_em: string | null
}

function Chips<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]
}) {
  return (
    <div className="inline-flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      {options.map((o, i) => {
        const active = value === o.value
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            className="px-3 py-1.5 text-xs transition-colors"
            style={{
              background: active ? 'var(--primary)' : 'transparent',
              color: active ? 'var(--primary-fg)' : 'var(--text-muted)',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
            }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export default function PagamentosPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear]   = useState(now.getFullYear())
  const [mode, setMode]   = useState<'mes' | 'periodo'>('mes')
  const [fromM, setFromM] = useState(now.getMonth() + 1)
  const [fromY, setFromY] = useState(now.getFullYear())
  const [toM, setToM]     = useState(now.getMonth() + 1)
  const [toY, setToY]     = useState(now.getFullYear())
  const [rows, setRows]   = useState<Row[]>([])
  const [loading, setLoading] = useState(false)

  const [tipo, setTipo]         = useState<'todos' | 'consultor' | 'parceiro'>('todos')
  const [vinculo, setVinculo]   = useState<'todos' | 'horista' | 'banco_de_horas' | 'fixo'>('todos')
  const [contrato, setContrato] = useState<'todos' | 'cooperado' | 'clt' | 'pj'>('todos')
  const [busca, setBusca]       = useState('')
  const [comMovimento, setComMovimento] = useState(true)

  const monthsToFetch = useMemo(() => {
    if (mode === 'mes') return [`${year}-${String(month).padStart(2, '0')}`]
    const out: string[] = []
    let y = fromY, m = fromM, guard = 0
    while ((y < toY || (y === toY && m <= toM)) && guard++ < 48) {
      out.push(`${y}-${String(m).padStart(2, '0')}`)
      m++; if (m > 12) { m = 1; y++ }
    }
    return out.length ? out : [`${fromY}-${String(fromM).padStart(2, '0')}`]
  }, [mode, month, year, fromM, fromY, toM, toY])

  useEffect(() => {
    setLoading(true)
    Promise.all(monthsToFetch.map(ym =>
      api.get<{ data: { rows: Row[] } }>(`/relatorios/pagamentos/${ym}`)
        .then(r => r?.data?.rows ?? []).catch(() => [] as Row[])
    )).then(results => {
      const all = results.flat()
      if (monthsToFetch.length === 1) { setRows(all); return }
      // Período: agrega por pessoa (tipo + empresa + nome) somando o valor a pagar.
      const map = new Map<string, Row>()
      for (const r of all) {
        const k = `${r.tipo}:${r.empresa}:${r.nome}`
        const e = map.get(k)
        if (!e) map.set(k, { ...r })
        else {
          e.valor += (r.valor || 0)
          if (r.envio_em && (!e.envio_em || r.envio_em > e.envio_em)) e.envio_em = r.envio_em
        }
      }
      setRows([...map.values()].map(r => ({ ...r, valor: Math.round(r.valor * 100) / 100 })))
    }).finally(() => setLoading(false))
  }, [monthsToFetch])

  const filtered = useMemo(() => rows.filter(r => {
    if (comMovimento && r.valor === 0) return false
    if (tipo !== 'todos' && r.tipo !== tipo) return false
    if (vinculo !== 'todos' && r.vinculo !== vinculo) return false
    if (contrato !== 'todos' && r.contract_type !== contrato) return false
    if (busca.trim() && !r.nome.toLowerCase().includes(busca.trim().toLowerCase())) return false
    return true
  }), [rows, tipo, vinculo, contrato, busca, comMovimento])

  // Ordenação por colunas (client-side, sobre as linhas filtradas).
  const { sorted, thProps } = useTableSort(filtered)

  const total = useMemo(() => filtered.reduce((s, r) => s + (r.valor || 0), 0), [filtered])

  const limpar = () => { setTipo('todos'); setVinculo('todos'); setContrato('todos'); setBusca(''); setComMovimento(true) }
  const hasFiltros = tipo !== 'todos' || vinculo !== 'todos' || contrato !== 'todos' || busca.trim() !== '' || !comMovimento

  const fmtYm = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) }
  const fmtMes = () => monthsToFetch.length === 1
    ? new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : `${fmtYm(monthsToFetch[0])} – ${fmtYm(monthsToFetch[monthsToFetch.length - 1])}`
  const periodoLabel = monthsToFetch.length === 1 ? monthsToFetch[0] : `${monthsToFetch[0]}_a_${monthsToFetch[monthsToFetch.length - 1]}`

  const exportExcel = () => {
    const data = sorted.map(r => ({
      Nome: r.nome,
      Tipo: r.tipo === 'parceiro' ? 'Parceiro' : 'Consultor',
      Empresa: r.empresa,
      'Contratação': r.vinculo_label,
      Contrato: r.contract_type_label,
      Valor: r.valor,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    for (let row = 1; row <= range.e.r; row++) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c: 5 })]
      if (cell) cell.z = '"R$" #,##0.00'
    }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pagamentos')
    XLSX.writeFile(wb, `pagamentos_${periodoLabel}.xlsx`)
  }

  const exportPdf = () => {
    const linhas = sorted.map(r => `
      <tr>
        <td>${r.nome}</td>
        <td>${r.tipo === 'parceiro' ? 'Parceiro' : 'Consultor'}</td>
        <td>${r.empresa}</td>
        <td>${r.vinculo_label}</td>
        <td>${r.contract_type_label}</td>
        <td class="r">${formatBRL(r.valor)}</td>
      </tr>`).join('')
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pagamentos — ${fmtMes()}</title>
      <style>
        body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;font-size:12px;padding:24px;}
        h1{font-size:18px;color:#5b21b6;margin:0 0 2px;} .sub{color:#6b7280;font-size:11px;margin-bottom:16px;}
        table{width:100%;border-collapse:collapse;} th{background:#ede9fe;color:#5b21b6;text-align:left;padding:6px 8px;font-size:10px;text-transform:uppercase;}
        td{border-bottom:1px solid #f3f4f6;padding:6px 8px;} .r{text-align:right;} tfoot td{font-weight:bold;border-top:2px solid #7c3aed;}
        @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
      </style></head><body>
      <h1>Relatório de Pagamentos</h1>
      <div class="sub">${fmtMes()} · ${filtered.length} registro(s)${comMovimento ? ' · só com movimento' : ''}</div>
      <table><thead><tr><th>Nome</th><th>Tipo</th><th>Empresa</th><th>Contratação</th><th>Contrato</th><th class="r">Valor</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><td colspan="5" class="r">Total</td><td class="r">${formatBRL(total)}</td></tr></tfoot></table>
      <script>window.onload=function(){window.print();}</script></body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  return (
    <AppLayout title="Relatório de Pagamentos">
      <div className="max-w-7xl mx-auto">
        <PageHeader
          icon={DollarSign}
          title="Pagamentos"
          subtitle="Pagamentos de consultores e parceiros por mês"
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {(['mes', 'periodo'] as const).map((mo, i) => (
                  <button key={mo} onClick={() => setMode(mo)} className="px-3 py-1.5 text-xs font-medium transition-colors"
                    style={{ background: mode === mo ? 'var(--primary)' : 'transparent', color: mode === mo ? 'var(--primary-fg)' : 'var(--text-muted)', borderLeft: i > 0 ? '1px solid var(--border)' : undefined }}>
                    {mo === 'mes' ? 'Mês/Ano' : 'Período'}
                  </button>
                ))}
              </div>
              {mode === 'mes' ? (
                <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y) }} />
              ) : (
                <>
                  <MonthYearPicker month={fromM} year={fromY} onChange={(m, y) => { setFromM(m); setFromY(y) }} placeholder="De" />
                  <span className="text-xs" style={{ color: 'var(--text-light)' }}>→</span>
                  <MonthYearPicker month={toM} year={toY} onChange={(m, y) => { setToM(m); setToY(y) }} placeholder="Até" />
                </>
              )}
              <Button variant="ghost" size="sm" icon={Download} onClick={exportExcel} disabled={filtered.length === 0}>Excel</Button>
              <Button variant="ghost" size="sm" icon={FileText} onClick={exportPdf} disabled={filtered.length === 0}>PDF</Button>
            </div>
          }
        />

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Movimento</p>
            <Chips value={comMovimento ? 'mov' : 'todos'} onChange={(v) => setComMovimento(v === 'mov')} options={[
              { value: 'mov', label: 'Com movimento' },
              { value: 'todos', label: 'Todos' },
            ]} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Tipo</p>
            <Chips value={tipo} onChange={setTipo} options={[
              { value: 'todos', label: 'Todos' },
              { value: 'consultor', label: 'Consultores' },
              { value: 'parceiro', label: 'Parceiros' },
            ]} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Contratação</p>
            <Chips value={vinculo} onChange={setVinculo} options={[
              { value: 'todos', label: 'Todos' },
              { value: 'horista', label: 'Horista' },
              { value: 'banco_de_horas', label: 'Banco de Horas' },
              { value: 'fixo', label: 'Fixo' },
            ]} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Contrato</p>
            <Chips value={contrato} onChange={setContrato} options={[
              { value: 'todos', label: 'Todos' },
              { value: 'cooperado', label: 'Cooperado' },
              { value: 'clt', label: 'CLT' },
              { value: 'pj', label: 'PJ' },
            ]} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Buscar</p>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome..."
              className="w-full px-3 py-2 rounded-xl text-xs outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <Button variant="ghost" size="sm" icon={X} onClick={limpar} disabled={!hasFiltros}>Limpar</Button>
        </div>

        {/* Total */}
        <div className="flex items-center gap-2 mb-3 text-sm">
          <Users size={14} style={{ color: 'var(--text-muted)' }} />
          <span style={{ color: 'var(--text-muted)' }}>{filtered.length} registro{filtered.length !== 1 ? 's' : ''} ·</span>
          <span className="font-bold" style={{ color: 'var(--brand-primary)' }}>Total: {formatBRL(total)}</span>
        </div>

        {/* Tabela */}
        {loading ? (
          <SkeletonTable rows={8} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={DollarSign} title="Sem pagamentos" description="Nenhum pagamento para os filtros/mês selecionados." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th {...thProps('nome')}>Nome</Th>
                <Th {...thProps('tipo')}>Tipo</Th>
                <Th {...thProps('empresa')}>Empresa</Th>
                <Th {...thProps('vinculo_label')}>Contratação</Th>
                <Th {...thProps('contract_type_label')}>Contrato</Th>
                <Th right {...thProps('valor')}>Valor</Th>
              </tr>
            </Thead>
            <Tbody>
              {sorted.map((r, i) => (
                <Tr key={i}>
                  <Td className="font-medium" style={{ color: 'var(--text)' }}>{r.nome}</Td>
                  <Td>
                    <span className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider"
                      style={{ background: 'var(--surface-hover)', color: r.tipo === 'parceiro' ? 'var(--warning)' : 'var(--brand-muted)' }}>
                      {r.tipo === 'parceiro' ? 'Parceiro' : 'Consultor'}
                    </span>
                  </Td>
                  <Td muted>{r.empresa}</Td>
                  <Td muted>{r.vinculo_label}</Td>
                  <Td muted>{r.contract_type_label}</Td>
                  <Td right className="font-semibold tabular-nums">{formatBRL(r.valor)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>
    </AppLayout>
  )
}
