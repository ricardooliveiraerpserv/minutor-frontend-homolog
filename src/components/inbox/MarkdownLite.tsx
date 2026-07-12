'use client'

import { Fragment, type ReactNode } from 'react'

/**
 * Renderer de markdown enxuto pro output do BOT. Cobre o que o modelo gera:
 * headers (#, ##), **negrito**, bullets (- / •), tabelas pipe, --- e parágrafos.
 * Não é um parser completo — proposital, pra não adicionar dependência.
 */

function renderInline(text: string, keyBase: string): ReactNode[] {
  // **negrito** e `code`
  const parts: ReactNode[] = []
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(<Fragment key={`${keyBase}-t${i}`}>{text.slice(last, m.index)}</Fragment>)
    const tok = m[0]
    if (tok.startsWith('**')) {
      parts.push(<strong key={`${keyBase}-b${i}`} className="font-semibold">{tok.slice(2, -2)}</strong>)
    } else {
      parts.push(
        <code key={`${keyBase}-c${i}`} className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-[0.85em] font-mono">
          {tok.slice(1, -1)}
        </code>,
      )
    }
    last = m.index + tok.length
    i++
  }
  if (last < text.length) parts.push(<Fragment key={`${keyBase}-tend`}>{text.slice(last)}</Fragment>)
  return parts
}

export function MarkdownLite({ source }: { source: string }) {
  const lines = source.split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // Tabela: linha com | seguida de linha separadora |---|
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-+:?\s*\|/.test(lines[i + 1])) {
      const header = line.split('|').map(s => s.trim()).filter((_, idx, arr) => !(idx === 0 && arr[0] === '') && !(idx === arr.length - 1 && arr[arr.length - 1] === ''))
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].includes('|')) {
        const cells = lines[i].split('|').map(s => s.trim())
        cells.shift() // remove leading empty
        if (cells[cells.length - 1] === '') cells.pop()
        rows.push(cells)
        i++
      }
      blocks.push(
        <div key={key++} className="my-2 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {header.map((h, hi) => (
                  <th key={hi} className="text-left font-semibold px-2 py-1 border-b border-[var(--brand-border)] text-[var(--text)]">
                    {renderInline(h, `h${key}-${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-[var(--brand-border)]/50">
                  {r.map((c, ci) => (
                    <td key={ci} className="px-2 py-1 align-top text-[var(--text-muted)]">
                      {renderInline(c, `c${key}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    // Horizontal rule
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="my-2 border-[var(--brand-border)]/60" />)
      i++
      continue
    }

    // Header
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const lvl = h[1].length
      blocks.push(
        <p key={key++} className={[
          'font-semibold text-[var(--text)]',
          lvl <= 2 ? 'text-sm mt-2' : 'text-[13px] mt-1.5',
        ].join(' ')}>
          {renderInline(h[2], `hd${key}`)}
        </p>,
      )
      i++
      continue
    }

    // Bullet list (agrupa consecutivos)
    if (/^\s*[-•*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-•*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-•*]\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={key++} className="my-1.5 space-y-0.5 list-disc list-inside marker:text-[var(--text-light)]">
          {items.map((it, idx) => (
            <li key={idx} className="text-[var(--text-muted)]">{renderInline(it, `li${key}-${idx}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    // Linha vazia
    if (line.trim() === '') {
      i++
      continue
    }

    // Parágrafo (junta linhas até vazio/estrutura)
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^\s*[-•*]\s+/.test(lines[i]) &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*---+\s*$/.test(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-+:?\s*\|/.test(lines[i + 1]))
    ) {
      para.push(lines[i])
      i++
    }
    blocks.push(
      <p key={key++} className="my-1 leading-relaxed text-[var(--text)]">
        {renderInline(para.join(' '), `p${key}`)}
      </p>,
    )
  }

  return <div className="space-y-0.5">{blocks}</div>
}
