'use client'

import { useState } from 'react'
import {
  X, Receipt, Pencil, Calendar, Building2, FolderOpen,
  Tag, CreditCard, Paperclip, FileText, Eye, Download,
} from 'lucide-react'
import type { Expense } from '@/types'
import { fetchAndOpenLegacyUrl } from '@/lib/attachments'
import { EntityAttachmentsPanel } from '@/components/attachments'

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
}

const EXP_STATUS_CONF: Record<string, { bg: string; color: string; label: string }> = {
  pending:              { bg: 'rgba(234,179,8,0.12)',  color: '#EAB308', label: 'Pendente' },
  approved:             { bg: 'rgba(34,197,94,0.12)',  color: '#22C55E', label: 'Aprovado' },
  rejected:             { bg: 'rgba(239,68,68,0.12)',  color: '#EF4444', label: 'Rejeitado' },
  adjustment_requested: { bg: 'rgba(249,115,22,0.12)', color: '#F97316', label: 'Ajuste Solicitado' },
}

const EXP_TYPE_LABEL: Record<string, string> = {
  reimbursement:  'Reembolso',
  advance:        'Adiantamento',
  corporate_card: 'Cartão Corporativo',
}

const PAYMENT_LABEL_MAP: Record<string, string> = {
  pix:           'PIX',
  credit_card:   'Cartão de Crédito',
  debit_card:    'Cartão de Débito',
  cash:          'Dinheiro',
  bank_transfer: 'Transferência Bancária',
}

// FASE 11.2.FE — Helper centralizado em src/lib/attachments.ts.
const fetchAndOpenFile = fetchAndOpenLegacyUrl

function ReceiptLink({ url }: { url: string }) {
  const [loading, setLoading] = useState(false)
  const handle = async (download: boolean) => {
    setLoading(true)
    try { await fetchAndOpenFile(url, download) }
    catch { alert(download ? 'Erro ao baixar comprovante' : 'Erro ao abrir comprovante') }
    finally { setLoading(false) }
  }
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => handle(false)} disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
        style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--primary-soft)' }}>
        <Eye size={11} /> {loading ? 'Carregando...' : 'Visualizar'}
      </button>
      <button type="button" onClick={() => handle(true)} disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
        style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-light)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <Download size={11} /> Baixar
      </button>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value, children, last }: {
  icon: React.ElementType; label: string; value?: string | null
  children?: React.ReactNode; last?: boolean
}) {
  return (
    <div className={`flex items-center gap-2.5 px-3.5 py-1.5 ${!last ? 'border-b' : ''}`}
      style={!last ? { borderColor: 'var(--border)' } : undefined}>
      <span className="shrink-0 p-1 rounded-md"
        style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
        <Icon size={12} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</p>
        {children ?? <p className="text-[13px] font-medium" style={{ color: 'var(--text)' }}>{value ?? '—'}</p>}
      </div>
    </div>
  )
}

export function ExpenseViewModal({
  expense, onClose, onEdit,
}: {
  expense: Expense
  onClose: () => void
  onEdit?: () => void
}) {
  const sc = EXP_STATUS_CONF[expense.status] ?? { bg: 'rgba(113,113,122,0.12)', color: '#71717A', label: expense.status }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="relative w-full max-w-lg mt-6 rounded-2xl shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <button onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
          style={{ color: 'var(--text-light)' }}>
          <X size={16} />
        </button>

        {/* Header */}
        <div className="px-4 pt-3.5 pb-2.5 flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg shrink-0"
            style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
            <Receipt size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Detalhes da Despesa</h3>
            <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>
              #{expense.id} · {formatDate(expense.expense_date)}
            </p>
          </div>
        </div>

        <div className="px-4 pb-4 space-y-2">
          {/* Status + Categoria */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: sc.bg, color: sc.color }}>
              {sc.label}
            </span>
            {expense.category?.name && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Tag size={11} /> {expense.category.name}
              </span>
            )}
          </div>

          {/* Motivo do ajuste / rejeição — exibe o que o aprovador escreveu */}
          {(expense.status === 'adjustment_requested' || expense.status === 'rejected') && expense.rejection_reason && (
            <div className="rounded-xl px-4 py-3" style={{ background: sc.bg, border: `1px solid ${sc.color}55` }}>
              <p className="text-[11px] uppercase tracking-widest font-semibold mb-1" style={{ color: sc.color }}>
                {expense.status === 'rejected' ? 'Motivo da rejeição' : 'Motivo do ajuste'}
              </p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{expense.rejection_reason}</p>
            </div>
          )}

          {/* Valor hero */}
          <div className="rounded-xl px-3.5 py-2.5 flex items-baseline justify-between gap-2"
            style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-soft)' }}>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-light)' }}>Valor Total</p>
            <p className="text-xl font-bold" style={{ color: 'var(--primary)' }}>{formatCurrency(expense.amount)}</p>
          </div>

          {/* Info card */}
          <div className="rounded-xl overflow-hidden"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <InfoRow icon={Calendar} label="Data" value={formatDate(expense.expense_date)} />
            {expense.user?.name && (
              <InfoRow icon={Building2} label="Colaborador" value={expense.user.name} />
            )}
            {expense.project?.customer?.name && (
              <InfoRow icon={Building2} label="Cliente" value={expense.project.customer.name} />
            )}
            <InfoRow icon={FolderOpen} label="Projeto" value={expense.project?.name} />
            {(expense as any).real_project?.name && (
              <InfoRow icon={FolderOpen} label="Projeto Real" value={(expense as any).real_project.name} />
            )}
            <InfoRow icon={Tag} label="Tipo" value={EXP_TYPE_LABEL[expense.expense_type] ?? expense.expense_type} />
            {expense.payment_method && (
              <InfoRow icon={CreditCard} label="Pagamento" value={PAYMENT_LABEL_MAP[expense.payment_method] ?? expense.payment_method} />
            )}
            <InfoRow icon={Paperclip} label="Comprovante" last>
              {expense.receipt_url
                ? <ReceiptLink url={expense.receipt_url} />
                : <span className="text-sm" style={{ color: 'var(--text-light)' }}>Sem comprovante</span>
              }
            </InfoRow>
            {/* FASE 11.2.FE — Painel composto: lista + upload de extras via nova camada.
                Coexiste com receipt_url legado acima. Quando 11.4 deprecar legado,
                a InfoRow "Comprovante" sai daqui e este painel é a fonte única. */}
            <div className="px-3.5 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
              <EntityAttachmentsPanel
                entityType="EXPENSE"
                entityId={expense.id}
                category="receipt"
                title="Anexos adicionais"
                accept="application/pdf,image/*"
                maxMb={10}
                hideWhenEmpty
                variant="compact"
              />
            </div>
          </div>

          {/* Descrição */}
          {expense.description && (
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 px-3.5 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                <FileText size={13} style={{ color: 'var(--primary)' }} />
                <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-light)' }}>Descrição</span>
              </div>
              <p className="px-3.5 py-2 text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {expense.description}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            {onEdit && (
              <button onClick={onEdit}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-[var(--surface-hover)]"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                <Pencil size={14} /> Editar
              </button>
            )}
            <button onClick={onClose}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-[var(--surface-hover)]"
              style={{ color: 'var(--text-light)', border: '1px solid var(--border)' }}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
