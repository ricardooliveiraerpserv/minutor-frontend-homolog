'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { PageHeader, Table, Thead, Th, Tbody, Tr, Td, EmptyState, SkeletonTable, Button } from '@/components/ds'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { DollarSign, Users, Download, FileText } from 'lucide-react'
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
  const [rows, setRows]   = useState<Row[]>([])
  const [loading, setLoading] = useState(false)

  const [tipo, setTipo]         = useState<'todos' | 'consultor' | 'parceiro'>('todos')
  const [vinculo, setVinculo]   = useState<'todos' | 'horista' | 'banco_de_horas' | 'fixo'>('todos')
  const [contrato, setContrato] = useState<'todos' | 'cooperado' | 'clt' | 'pj'>('todos')
  const [busca, setBusca]       = useState('')
  const [comMovimento, setComMovimento] = useState(true)

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`

  useEffect(() => {
    setLoading(true)
    api.get<{ data: { rows: Row[] } }>(`/relatorios/pagamentos/${yearMonth}`)
      .then(r => setRows(r?.data?.rows ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [yearMonth])

  const filtered = useMemo(() => rows.filter(r => {
    if (comMovimento && r.valor === 0) return false
    if (tipo !== 'todos' && r.tipo !== tipo) return false
    if (vinculo !== 'todos' && r.vinculo !== vinculo) return false
    if (contrato !== 'todos' && r.contract_type !== contrato) return false
    if (busca.trim() && !r.nome.toLowerCase().includes(busca.trim().toLowerCase())) return false
    return true
  }), [rows, tipo, vinculo, contrato, busca, comMovimento])

  const total = useMemo(() => filtered.reduce((s, r) => s + (r.valor || 0), 0), [filtered])

  const fmtMes = () => new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const exportExcel = () => {
    const data = filtered.map(r => ({
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
    XLSX.writeFile(wb, `pagamentos_${yearMonth}.xlsx`)
  }

  const exportPdf = () => {
    const linhas = filtered.map(r => `
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
            <div className="flex items-center gap-2">
              <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y) }} />
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
                <Th>Nome</Th>
                <Th>Tipo</Th>
                <Th>Empresa</Th>
                <Th>Contratação</Th>
                <Th>Contrato</Th>
                <Th right>Valor</Th>
              </tr>
            </Thead>
            <Tbody>
              {filtered.map((r, i) => (
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
