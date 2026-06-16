// Usa o fork xlsx-js-style (API idêntica ao xlsx 0.18) — necessário p/ cor/fonte de célula,
// que o xlsx da comunidade ignora na escrita. Demais telas continuam no 'xlsx' puro.
import * as XLSX from 'xlsx-js-style'

export interface RelatorioRow {
  date_inclusion: string
  date_inclusion_late?: boolean  // digitado fora da competência (serviço no mês, lançado depois)
  requester: string
  consultant: string
  ticket: string
  title: string
  description: string
  start_time: string
  end_time: string
  effort_hours: string         // formato HH:MM para o PDF/preview
  effort_decimal: number       // decimal para o Excel (ex: 0.5, 1.5)
  date_service: string
}

export interface RelatorioMeta {
  client: string
  title: string         // título do documento — ex.: "Relatório de Apontamentos — Maio de 2026"
  period: string
  emittedAt: string
  totalHours: string
  totalHoursDecimal: number  // total exato em horas decimais (minutos totais / 60), p/ o totalizador
  totalRecords: number
  ticketHeader?: string  // 'Ticket' (default) ou 'Ticket ERPSERV' (VEDAMOTORS)
  titleHeader?:  string  // 'Título' (default) ou 'Ticket Vedamotors' (VEDAMOTORS)
}

function buildCols(meta: RelatorioMeta): string[] {
  return [
    'Data de Inclusão', 'Solicitante', 'Consultor',
    meta.ticketHeader ?? 'Ticket',
    meta.titleHeader  ?? 'Título',
    'Descrição', 'Início', 'Fim', 'Esforço (h)', 'Data do Serviço',
  ]
}

// Remove acentos e caracteres inválidos pro nome do arquivo (\w não casa á/ç/ê).
function slug(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}

function fmtFilename(meta: RelatorioMeta): string {
  const client = slug(meta.client).slice(0, 40)
  const title  = slug(meta.title || 'Relatorio de Apontamentos').slice(0, 60)
  return `${title}_${client}`
}

// ── Paleta roxa (RRGGBB sem alfa, como o xlsx-js-style espera)
const C = {
  titleBg: '4C1D95', // roxo profundo (título)
  headBg:  '5B21B6', // roxo (cabeçalho de colunas)
  totalBg: '5B21B6', // roxo (totalizador)
  zebra:   'F5F3FF', // roxo bem claro (linhas pares)
  white:   'FFFFFF',
  text:    '374151', // cinza escuro (corpo)
  border:  'DDD6FE', // roxo claro (bordas)
}

const thin = { style: 'thin', color: { rgb: C.border } } as const
const allBorders = { top: thin, bottom: thin, left: thin, right: thin }

export function exportRelatorioToExcel(rows: RelatorioRow[], meta: RelatorioMeta) {
  const cols = buildCols(meta)
  const ncols = cols.length          // 10 colunas (A..J)
  const TITLE_R  = 0                  // linha do título
  const HEAD_R   = 1                  // linha de cabeçalho (alvo do AutoFilter)
  const DATA_R0  = 2                  // 1ª linha de dados
  const TOTAL_R  = DATA_R0 + rows.length

  // Total exato em horas decimais (vem dos minutos totais / 60). Fallback: soma dos decimais por linha.
  const totalEffort = Number.isFinite(meta.totalHoursDecimal)
    ? meta.totalHoursDecimal
    : rows.reduce((acc, r) => acc + (Number(r.effort_decimal) || 0), 0)

  const aoa: (string | number)[][] = [
    [meta.title],                    // 1 linha só com o título
    cols,                            // cabeçalho (filtrável)
    ...rows.map(r => [
      // Marcador "⚠" destaca digitação fora da competência.
      r.date_inclusion_late ? `⚠ ${r.date_inclusion}` : r.date_inclusion,
      r.requester, r.consultant, r.ticket, r.title,
      r.description, r.start_time, r.end_time, r.effort_decimal, r.date_service,
    ]),
    // Totalizador: rótulo (A..H) + soma do esforço (I) + nº de registros (J)
    [`TOTAL — ${meta.totalRecords} registro(s)`, '', '', '', '', '', '', '', totalEffort, ''],
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  ws['!cols'] = [
    { wch: 16 }, { wch: 24 }, { wch: 22 }, { wch: 14 },
    { wch: 18 }, { wch: 50 }, { wch: 8 }, { wch: 8 }, { wch: 11 }, { wch: 14 },
  ]
  ws['!rows'] = [{ hpt: 26 }, { hpt: 20 }]  // alturas do título e do cabeçalho

  // Título (A1:J1) e totalizador (A:H) mesclados.
  ws['!merges'] = [
    { s: { r: TITLE_R, c: 0 }, e: { r: TITLE_R, c: ncols - 1 } },
    { s: { r: TOTAL_R, c: 0 }, e: { r: TOTAL_R, c: 7 } }, // rótulo A..H; deixa I (Esforço) livre p/ o total
  ]

  // AutoFilter no cabeçalho cobrindo só cabeçalho + dados (totalizador fica fora p/ não sumir ao filtrar).
  ws['!autofilter'] = {
    ref: `${XLSX.utils.encode_cell({ r: HEAD_R, c: 0 })}:${XLSX.utils.encode_cell({ r: Math.max(HEAD_R, TOTAL_R - 1), c: ncols - 1 })}`,
  }

  const setStyle = (r: number, c: number, s: Record<string, unknown>) => {
    const addr = XLSX.utils.encode_cell({ r, c })
    const cell = ws[addr]
    if (cell) cell.s = s
  }

  // Título — roxo profundo, texto branco, negrito, centralizado.
  setStyle(TITLE_R, 0, {
    fill: { patternType: 'solid', fgColor: { rgb: C.titleBg } },
    font: { color: { rgb: C.white }, bold: true, sz: 14 },
    alignment: { horizontal: 'center', vertical: 'center' },
  })

  // Cabeçalho de colunas — roxo, branco, negrito, centralizado, com borda.
  for (let c = 0; c < ncols; c++) {
    setStyle(HEAD_R, c, {
      fill: { patternType: 'solid', fgColor: { rgb: C.headBg } },
      font: { color: { rgb: C.white }, bold: true },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: allBorders,
    })
  }

  // Dados — zebra clara, esforço (col I) à direita com 2 casas.
  for (let i = 0; i < rows.length; i++) {
    const r = DATA_R0 + i
    const even = i % 2 === 1
    for (let c = 0; c < ncols; c++) {
      const isEffort = c === 8
      setStyle(r, c, {
        fill: even ? { patternType: 'solid', fgColor: { rgb: C.zebra } } : undefined,
        font: { color: { rgb: C.text } },
        alignment: { horizontal: isEffort ? 'right' : 'left', vertical: 'top', wrapText: c === 5 },
        border: allBorders,
      })
    }
    const effCell = ws[XLSX.utils.encode_cell({ r, c: 8 })]
    if (effCell && typeof effCell.v === 'number') { effCell.t = 'n'; effCell.z = '0.00' }
  }

  // Totalizador — roxo, branco, negrito; soma do esforço com 2 casas.
  for (let c = 0; c < ncols; c++) {
    setStyle(TOTAL_R, c, {
      fill: { patternType: 'solid', fgColor: { rgb: C.totalBg } },
      font: { color: { rgb: C.white }, bold: true },
      alignment: { horizontal: c === 8 ? 'right' : (c === 0 ? 'left' : 'center'), vertical: 'center' },
      border: allBorders,
    })
  }
  const totCell = ws[XLSX.utils.encode_cell({ r: TOTAL_R, c: 8 })]
  if (totCell && typeof totCell.v === 'number') { totCell.t = 'n'; totCell.z = '0.00' }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Apontamentos')
  XLSX.writeFile(wb, `${fmtFilename(meta)}.xlsx`)
}
