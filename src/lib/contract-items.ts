// Itens SaaS/Cloud de contrato (Setup / Desenvolvimento) — cada um vira um card de projeto Fechado.
export interface ContractItemForm {
  id?: number
  tipo: 'setup' | 'desenvolvimento' | 'setup_dev' | 'banco_horas_mensal'
  descricao: string
  horas_contratadas: string
  valor_hora: string
  valor_projeto: string   // "Valor Total"
  hora_adicional: string
  condicao_pagamento: string
  project?: { code?: string } | null
}

export const ITEM_TIPO_OPTS: { v: ContractItemForm['tipo']; l: string }[] = [
  { v: 'setup', l: 'Setup' },
  { v: 'desenvolvimento', l: 'Desenvolvimento' },
  { v: 'setup_dev', l: 'Setup + Desenvolvimento' },
  { v: 'banco_horas_mensal', l: 'Banco de Horas Mensal' },
]

export const emptyContractItem = (): ContractItemForm => ({
  tipo: 'setup', descricao: '', horas_contratadas: '', valor_hora: '', valor_projeto: '', hora_adicional: '', condicao_pagamento: '',
})

/**
 * Auto-cálculo bidirecional entre Horas × Valor da Hora × Valor Total:
 *  - editou Horas ou Valor Hora (com o outro preenchido) → recalcula Valor Total.
 *  - editou Valor Total (com Valor Hora) → recalcula Horas.  (com Horas) → recalcula Valor Hora.
 */
export function computeContractItem(it: ContractItemForm, field: keyof ContractItemForm, raw: string): ContractItemForm {
  const n: ContractItemForm = { ...it, [field]: raw }
  const h  = Number(field === 'horas_contratadas' ? raw : n.horas_contratadas) || 0
  const vh = Number(field === 'valor_hora' ? raw : n.valor_hora) || 0
  const vt = Number(field === 'valor_projeto' ? raw : n.valor_projeto) || 0
  if (field === 'horas_contratadas') {
    if (vh > 0) n.valor_projeto = (vh * h).toFixed(2)
    else if (vt > 0 && h > 0) n.valor_hora = (vt / h).toFixed(2)
  } else if (field === 'valor_hora') {
    if (h > 0) n.valor_projeto = (vh * h).toFixed(2)
    else if (vt > 0 && vh > 0) n.horas_contratadas = String(Math.round(vt / vh))
  } else if (field === 'valor_projeto') {
    if (vh > 0) n.horas_contratadas = String(Math.round(vt / vh))
    else if (h > 0) n.valor_hora = (vt / h).toFixed(2)
  }
  return n
}

/** Valida os itens: tudo obrigatório menos Hora Adicional. Retorna a 1ª mensagem de erro ou null. */
export function validateContractItems(items: ContractItemForm[]): string | null {
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const miss: string[] = []
    if (!it.tipo) miss.push('Tipo')
    if (!String(it.horas_contratadas).trim()) miss.push('Horas contratadas')
    if (!String(it.valor_hora).trim()) miss.push('Valor da Hora')
    if (!String(it.valor_projeto).trim()) miss.push('Valor Total')
    if (!String(it.condicao_pagamento).trim()) miss.push('Condição de Pagamento')
    if (!String(it.descricao).trim()) miss.push('Descrição')
    if (miss.length) return `Item ${i + 1}: preencha ${miss.join(', ')}.`
  }
  return null
}

/** Código previsto do card do item = código-base do contrato + sufixo de letra (A, B, C…) pela posição. */
export function itemCodePreview(baseCode: string, index: number): string {
  if (!baseCode) return ''
  return `${baseCode}-${String.fromCharCode(65 + index)}`
}

/** Payload dos itens p/ a API. */
export function contractItemsPayload(items: ContractItemForm[]) {
  return items.map(it => ({
    id: it.id ?? null,
    tipo: it.tipo,
    descricao: it.descricao || null,
    horas_contratadas: it.horas_contratadas ? Number(it.horas_contratadas) : null,
    valor_hora: it.valor_hora ? Number(it.valor_hora) : null,
    valor_projeto: it.valor_projeto ? Number(it.valor_projeto) : null,
    hora_adicional: it.hora_adicional ? Number(it.hora_adicional) : null,
    condicao_pagamento: it.condicao_pagamento || null,
  }))
}
