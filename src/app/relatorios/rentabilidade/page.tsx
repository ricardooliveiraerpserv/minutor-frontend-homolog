'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { PageHeader, Table, Thead, Th, Tbody, Tr, Td, EmptyState, SkeletonTable, Button } from '@/components/ds'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { SearchSelect } from '@/components/ui/search-select'
import { useTableSort } from '@/hooks/use-table-sort'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { TrendingUp, Download, FileText } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Row {
  user_id: number; consultor: string
  project_id: number; projeto: string; cliente: string
  valor_hora_projeto: number; valor_hora_consultor: number
  horas: number; receita: number; custo: number; margem: number; margem_pct: number | null
}

const fmtH = (h: number) => `${h.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}h`
const pctColor = (p: number | null) => p == null ? 'var(--text-light)' : p < 0 ? 'var(--danger)' : p < 20 ? 'var(--warning)' : 'var(--success)'

export default function RentabilidadePage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear]   = useState(now.getFullYear())
  const [rows, setRows]   = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')
  const [soReceita, setSoReceita] = useState(true)
  const [fCliente, setFCliente]     = useState('')
  const [fProjeto, setFProjeto]     = useState('')
  const [fConsultor, setFConsultor] = useState('')

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`

  useEffect(() => {
    setLoading(true)
    api.get<{ data: { rows: Row[] } }>(`/relatorios/rentabilidade/${yearMonth}`)
      .then(r => setRows(r?.data?.rows ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [yearMonth])

  // Opções dos filtros (distintos, derivados das linhas carregadas).
  const optClientes = useMemo(() => {
    const set = new Map<string, string>()
    rows.forEach(r => { if (r.cliente) set.set(r.cliente, r.cliente) })
    return [...set.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(c => ({ id: c, name: c }))
  }, [rows])
  const optProjetos = useMemo(() => {
    const set = new Map<number, string>()
    rows.forEach(r => set.set(r.project_id, r.projeto))
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([id, name]) => ({ id, name }))
  }, [rows])
  const optConsultores = useMemo(() => {
    const set = new Map<number, string>()
    rows.forEach(r => set.set(r.user_id, r.consultor))
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([id, name]) => ({ id, name }))
  }, [rows])

  const filtered = useMemo(() => rows.filter(r => {
    if (soReceita && r.receita === 0) return false
    if (fCliente && r.cliente !== fCliente) return false
    if (fProjeto && String(r.project_id) !== fProjeto) return false
    if (fConsultor && String(r.user_id) !== fConsultor) return false
    if (busca.trim()) {
      const q = busca.trim().toLowerCase()
      if (!r.consultor.toLowerCase().includes(q) && !r.projeto.toLowerCase().includes(q) && !r.cliente.toLowerCase().includes(q)) return false
    }
    return true
  }), [rows, busca, soReceita, fCliente, fProjeto, fConsultor])

  const { sorted, thProps } = useTableSort(filtered)

  const tot = useMemo(() => {
    const receita = filtered.reduce((s, r) => s + r.receita, 0)
    const custo   = filtered.reduce((s, r) => s + r.custo, 0)
    const horas   = filtered.reduce((s, r) => s + r.horas, 0)
    return { receita, custo, horas, margem: receita - custo, pct: receita > 0 ? (receita - custo) / receita * 100 : null }
  }, [filtered])

  const fmtMes = () => new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const exportExcel = () => {
    const data = sorted.map(r => ({
      Consultor: r.consultor, Projeto: r.projeto, Cliente: r.cliente,
      Horas: r.horas, 'R$/h Projeto': r.valor_hora_projeto, 'R$/h Consultor': r.valor_hora_consultor,
      Receita: r.receita, Custo: r.custo, Margem: r.margem, 'Margem %': r.margem_pct,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rentabilidade')
    XLSX.writeFile(wb, `rentabilidade_${yearMonth}.xlsx`)
  }

  const exportPdf = () => {
    const linhas = sorted.map(r => `
      <tr>
        <td>${r.consultor}</td><td>${r.projeto}</td><td>${r.cliente}</td>
        <td class="r">${fmtH(r.horas)}</td><td class="r">${formatBRL(r.valor_hora_projeto)}</td><td class="r">${formatBRL(r.valor_hora_consultor)}</td>
        <td class="r">${formatBRL(r.receita)}</td><td class="r">${formatBRL(r.custo)}</td><td class="r">${formatBRL(r.margem)}</td>
        <td class="r">${r.margem_pct == null ? '—' : r.margem_pct + '%'}</td>
      </tr>`).join('')
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Rentabilidade — ${fmtMes()}</title>
      <style>
        body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;font-size:11px;padding:20px;}
        h1{font-size:18px;color:#5b21b6;margin:0 0 2px;} .sub{color:#6b7280;font-size:11px;margin-bottom:14px;}
        table{width:100%;border-collapse:collapse;} th{background:#ede9fe;color:#5b21b6;text-align:left;padding:5px 6px;font-size:9px;text-transform:uppercase;}
        td{border-bottom:1px solid #f3f4f6;padding:5px 6px;} .r{text-align:right;} tfoot td{font-weight:bold;border-top:2px solid #7c3aed;}
        @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
      </style></head><body>
      <h1>Relatório de Rentabilidade</h1>
      <div class="sub">${fmtMes()} · ${filtered.length} linha(s)</div>
      <table><thead><tr><th>Consultor</th><th>Projeto</th><th>Cliente</th><th class="r">Horas</th><th class="r">R$/h Proj</th><th class="r">R$/h Cons</th><th class="r">Receita</th><th class="r">Custo</th><th class="r">Margem</th><th class="r">%</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><td colspan="6" class="r">Total</td><td class="r">${formatBRL(tot.receita)}</td><td class="r">${formatBRL(tot.custo)}</td><td class="r">${formatBRL(tot.margem)}</td><td class="r">${tot.pct == null ? '—' : tot.pct.toFixed(1) + '%'}</td></tr></tfoot></table>
      <script>window.onload=function(){window.print();}</script></body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  return (
    <AppLayout title="Relatório de Rentabilidade">
      <div className="max-w-[1400px] mx-auto">
        <PageHeader
          icon={TrendingUp}
          title="Rentabilidade"
          subtitle="Receita, custo e margem por consultor × projeto"
          actions={
            <div className="flex items-center gap-2">
              <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y) }} />
              <Button variant="ghost" size="sm" icon={Download} onClick={exportExcel} disabled={filtered.length === 0}>Excel</Button>
              <Button variant="ghost" size="sm" icon={FileText} onClick={exportPdf} disabled={filtered.length === 0}>PDF</Button>
            </div>
          }
        />

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="min-w-[180px]">
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Cliente</p>
            <SearchSelect value={fCliente} onChange={setFCliente} options={[{ id: '', name: 'Todos os clientes' }, ...optClientes]} placeholder="Todos os clientes" />
          </div>
          <div className="min-w-[180px]">
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Projeto</p>
            <SearchSelect value={fProjeto} onChange={setFProjeto} options={[{ id: '', name: 'Todos os projetos' }, ...optProjetos]} placeholder="Todos os projetos" />
          </div>
          <div className="min-w-[180px]">
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Consultor</p>
            <SearchSelect value={fConsultor} onChange={setFConsultor} options={[{ id: '', name: 'Todos os consultores' }, ...optConsultores]} placeholder="Todos os consultores" />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer pb-2" style={{ color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={soReceita} onChange={e => setSoReceita(e.target.checked)} />
            Só com receita
          </label>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..."
            className="flex-1 min-w-[160px] px-3 py-2 rounded-xl text-xs outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>

        {/* Cards de total */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Receita', value: formatBRL(tot.receita), color: 'var(--text)' },
            { label: 'Custo', value: formatBRL(tot.custo), color: 'var(--text)' },
            { label: 'Margem', value: formatBRL(tot.margem), color: 'var(--brand-primary)' },
            { label: 'Margem %', value: tot.pct == null ? '—' : tot.pct.toFixed(1) + '%', color: pctColor(tot.pct) },
          ].map(c => (
            <div key={c.label} className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{c.label}</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <SkeletonTable rows={8} cols={10} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Sem dados" description="Nenhum apontamento para o mês/filtros." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th {...thProps('consultor')}>Consultor</Th><Th {...thProps('projeto')}>Projeto</Th><Th {...thProps('cliente')}>Cliente</Th>
                <Th right {...thProps('horas')}>Horas</Th><Th right {...thProps('valor_hora_projeto')}>R$/h Proj.</Th><Th right {...thProps('valor_hora_consultor')}>R$/h Cons.</Th>
                <Th right {...thProps('receita')}>Receita</Th><Th right {...thProps('custo')}>Custo</Th><Th right {...thProps('margem')}>Margem</Th><Th right {...thProps('margem_pct')}>%</Th>
              </tr>
            </Thead>
            <Tbody>
              {sorted.map((r, i) => (
                <Tr key={i}>
                  <Td className="font-medium" style={{ color: 'var(--text)' }}>{r.consultor}</Td>
                  <Td muted className="truncate max-w-[200px]">{r.projeto}</Td>
                  <Td muted className="truncate max-w-[140px]">{r.cliente}</Td>
                  <Td right className="tabular-nums">{fmtH(r.horas)}</Td>
                  <Td right muted className="tabular-nums">{formatBRL(r.valor_hora_projeto)}</Td>
                  <Td right muted className="tabular-nums">{formatBRL(r.valor_hora_consultor)}</Td>
                  <Td right className="tabular-nums">{formatBRL(r.receita)}</Td>
                  <Td right muted className="tabular-nums">{formatBRL(r.custo)}</Td>
                  <Td right className="font-semibold tabular-nums">{formatBRL(r.margem)}</Td>
                  <Td right className="font-semibold tabular-nums" style={{ color: pctColor(r.margem_pct) }}>{r.margem_pct == null ? '—' : r.margem_pct + '%'}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>
    </AppLayout>
  )
}
