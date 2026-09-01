import * as XLSX from 'xlsx'

export interface ProjetoExportRow {
  cliente: string
  projeto: string
  codigo: string
  tipoContrato: string
  tipoServico: string
  fase: string
  horas: string
  consumidas?: string
  saldo?: string
  saude?: string
  coord?: string
  status: string
  /** % Entrega (delivery_percentage). */
  deliveryPct?: string
}

/** Exporta a lista de projetos (Demandas e Projetos) para .xlsx. */
export function exportProjetosToExcel(rows: ProjetoExportRow[], includeInternal: boolean, filename = 'projetos') {
  const data = rows.map(r => {
    const row: Record<string, string> = {
      'Cliente':       r.cliente,
      'Projeto':       r.projeto,
      'Código':        r.codigo,
      'Tipo Contrato': r.tipoContrato,
      'Tipo Serviço':  r.tipoServico,
      'Fase':          r.fase,
      'Horas':         r.horas,
    }
    if (includeInternal) {
      row['HS Consumidas'] = r.consumidas ?? ''
      row['Saldo']         = r.saldo ?? ''
      row['Saúde']         = r.saude ?? ''
      row['Coordenação']   = r.coord ?? ''
    }
    row['Status'] = r.status
    row['% Entrega'] = r.deliveryPct ?? ''
    return row
  })

  const ws = XLSX.utils.json_to_sheet(data)
  const widths: Record<string, number> = {
    'Cliente': 24, 'Projeto': 34, 'Código': 16, 'Tipo Contrato': 16, 'Tipo Serviço': 16,
    'Fase': 16, 'Horas': 10, 'HS Consumidas': 14, 'Saldo': 10, 'Saúde': 12, 'Coordenação': 14, 'Status': 16, '% Entrega': 12,
  }
  const headers = Object.keys(data[0] ?? {})
  ws['!cols'] = headers.map(h => ({ wch: widths[h] ?? 16 }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Projetos')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}
