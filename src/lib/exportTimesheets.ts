import * as XLSX from 'xlsx'

export interface TimesheetExportRow {
  date: string
  user?: string
  client?: string
  project?: string
  ticket?: string
  ticket_subject?: string
  start_time?: string | null
  end_time?: string | null
  effort_hours?: string
  effort_minutes?: number
  observation?: string
  status_display?: string
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

function fmtDate(d: string): string {
  if (!d) return ''
  const [y, mo, day] = d.split('-')
  return `${day}/${mo}/${y}`
}

export function exportTimesheetsToExcel(rows: TimesheetExportRow[], filename = 'apontamentos') {
  const data = rows.map(r => {
    const hours = r.effort_hours
      ? r.effort_hours
      : r.effort_minutes !== undefined
        ? minutesToHHMM(r.effort_minutes)
        : ''

    const row: Record<string, string> = {
      'Data':           fmtDate(r.date),
      'Horas':          hours,
      'Status':         r.status_display ?? '',
      'Cliente':        r.client ?? '',
      'Projeto':        r.project ?? '',
      'Ticket #':       r.ticket ?? '',
      'Título':         r.ticket_subject ?? '',
      'Horário Início': r.start_time ?? '',
      'Horário Fim':    r.end_time ?? '',
      'Observação':     r.observation ?? '',
    }

    if (r.user) row['Consultor'] = r.user

    return row
  })

  const ws = XLSX.utils.json_to_sheet(data)

  // Ajusta largura das colunas
  const colWidths: Record<string, number> = {
    'Data': 12, 'Horas': 8, 'Status': 18, 'Cliente': 22, 'Projeto': 28,
    'Ticket #': 10, 'Título': 30, 'Horário Início': 14, 'Horário Fim': 14,
    'Observação': 40, 'Consultor': 24,
  }
  const headers = Object.keys(data[0] ?? {})
  ws['!cols'] = headers.map(h => ({ wch: colWidths[h] ?? 16 }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Apontamentos')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}
