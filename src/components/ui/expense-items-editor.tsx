'use client'

import { useRef } from 'react'
import { Plus, Trash2, Paperclip, X, FileText } from 'lucide-react'

// ── Draft de item de despesa (categoria + descrição + valor + comprovante) ──
export interface ExpenseItemDraft {
  id?: number
  expense_category_id: string
  description: string
  amount: string
  file: File | null
  receipt_url?: string | null
}

export function emptyExpenseItem(): ExpenseItemDraft {
  return { expense_category_id: '', description: '', amount: '', file: null }
}

export function parseExpenseAmount(v: string): number {
  const s = String(v ?? '').trim()
  if (!s) return 0
  // "1.234,56"/"45,50" → vírgula é decimal, ponto é milhar; "45.50"/"45" → ponto decimal.
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = parseFloat(normalized)
  return isNaN(n) ? 0 : n
}

export function expenseItemsTotal(items: ExpenseItemDraft[]): number {
  return items.reduce((s, it) => s + parseExpenseAmount(it.amount), 0)
}

export function expenseItemsValid(items: ExpenseItemDraft[]): boolean {
  return items.length > 0 && items.every(
    it => it.expense_category_id && it.description.trim() && parseExpenseAmount(it.amount) > 0
  )
}

/** Serializa os itens no FormData no formato items[i][campo] esperado pelo backend. */
export function appendExpenseItems(fd: FormData, items: ExpenseItemDraft[]): void {
  items.forEach((it, i) => {
    if (it.id) fd.append(`items[${i}][id]`, String(it.id))
    fd.append(`items[${i}][expense_category_id]`, it.expense_category_id)
    fd.append(`items[${i}][description]`, it.description)
    fd.append(`items[${i}][amount]`, String(parseExpenseAmount(it.amount)))
    if (it.file) fd.append(`items[${i}][receipt]`, it.file)
  })
}

/** Converte uma despesa vinda da API em drafts editáveis. Despesa legada (sem
 *  itens) vira um único item a partir do cabeçalho. */
export function expenseToItemDrafts(exp: any): ExpenseItemDraft[] {
  if (exp?.items && Array.isArray(exp.items) && exp.items.length > 0) {
    return exp.items.map((it: any) => ({
      id: it.id,
      expense_category_id: String(it.expense_category_id ?? ''),
      description: it.description ?? '',
      amount: it.amount != null ? String(it.amount) : '',
      file: null,
      receipt_url: it.receipt_url ?? null,
    }))
  }
  return [{
    expense_category_id: String(exp?.expense_category_id ?? ''),
    description: exp?.description ?? '',
    amount: exp?.amount != null ? String(exp.amount) : '',
    file: null,
    receipt_url: exp?.receipt_url ?? null,
  }]
}

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function ItemRow({ item, index, canRemove, categories, onPatch, onRemove }: {
  item: ExpenseItemDraft
  index: number
  canRemove: boolean
  categories: { id: number; name: string }[]
  onPatch: (patch: Partial<ExpenseItemDraft>) => void
  onRemove: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[var(--text-light)]">Item {index + 1}</span>
        {canRemove && (
          <button type="button" onClick={onRemove} title="Remover item"
            className="p-1 rounded-md text-[var(--text-light)] hover:text-red-500 hover:bg-red-500/10 transition-colors">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px] gap-2">
        <select
          value={item.expense_category_id}
          onChange={e => onPatch({ expense_category_id: e.target.value })}
          className="h-9 px-2 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg text-xs text-[var(--text)] outline-none focus:border-[var(--border-strong)]">
          <option value="">Categoria…</option>
          {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
        <input
          inputMode="decimal"
          value={item.amount}
          onChange={e => onPatch({ amount: e.target.value })}
          placeholder="Valor (R$)"
          className="h-9 px-2 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg text-xs text-[var(--text)] outline-none focus:border-[var(--border-strong)] text-right" />
      </div>

      <input
        value={item.description}
        onChange={e => onPatch({ description: e.target.value })}
        placeholder="Descrição do item"
        className="h-9 px-2 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg text-xs text-[var(--text)] outline-none focus:border-[var(--border-strong)]" />

      <div className="flex items-center gap-2 flex-wrap">
        <input ref={fileRef} type="file" accept="image/*,.pdf,.webp,.xlsx,.xls,.csv" className="hidden"
          onChange={e => onPatch({ file: e.target.files?.[0] ?? null })} />
        <button type="button" onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] text-[11px] text-[var(--text-muted)] hover:border-[var(--border-strong)] transition-colors">
          <Paperclip size={12} /> {item.file ? 'Trocar comprovante' : item.receipt_url ? 'Substituir comprovante' : 'Anexar comprovante'}
        </button>
        {item.file ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text)] max-w-[180px]">
            <FileText size={12} className="shrink-0" />
            <span className="truncate">{item.file.name}</span>
            <button type="button" onClick={() => onPatch({ file: null })} className="text-[var(--text-light)] hover:text-red-500"><X size={12} /></button>
          </span>
        ) : item.receipt_url ? (
          <a href={item.receipt_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-[var(--primary)] hover:underline">
            <FileText size={12} /> Comprovante atual
          </a>
        ) : (
          <span className="text-[11px] text-[var(--text-light)]">Sem comprovante</span>
        )}
      </div>
    </div>
  )
}

export function ExpenseItemsEditor({ items, onChange, categories }: {
  items: ExpenseItemDraft[]
  onChange: (items: ExpenseItemDraft[]) => void
  categories: { id: number; name: string }[]
}) {
  const patch = (i: number, p: Partial<ExpenseItemDraft>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...p } : it)))
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i))
  const add = () => onChange([...items, emptyExpenseItem()])
  const total = expenseItemsTotal(items)

  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => (
        <ItemRow key={i} item={it} index={i} canRemove={items.length > 1}
          categories={categories} onPatch={p => patch(i, p)} onRemove={() => remove(i)} />
      ))}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <button type="button" onClick={add}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-dashed border-[var(--border-strong)] text-xs font-medium text-[var(--primary)] hover:bg-[var(--primary)]/10 transition-colors">
          <Plus size={14} /> Adicionar item
        </button>
        <div className="text-xs text-[var(--text-muted)]">
          Total: <span className="font-semibold text-[var(--text)]">{brl(total)}</span>
        </div>
      </div>
    </div>
  )
}
