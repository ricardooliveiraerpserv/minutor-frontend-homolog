'use client'

import { useState } from 'react'
import { X, Pencil, Trash2 } from 'lucide-react'
import { EntityAttachmentsPanel } from '@/components/attachments'
import { api } from '@/lib/api'
import { toast } from 'sonner'

export interface AporteDetail {
  id: number
  customer_id: number | null
  customer_name: string | null
  project_id: number
  project_code: string | null
  project_name: string | null
  horas: number
  valor_hora: number
  total: number
  motivo: 'aporte' | 'excedentes' | 'absorvidas' | string | null
  description: string | null
  has_proposta?: boolean
  proposta_original_name?: string | null
  kanban_status: 'novo_contrato' | 'aporte' | string
  contributed_by: string | null
  contributed_at: string | null
}

const APORTE_COLOR = '#22c55e'

const MOTIVO_LABEL: Record<string, string> = {
  aporte:     'Aporte',
  excedentes: 'Excedentes',
  absorvidas: 'Absorvidas',
}

/**
 * Modal de detalhe do card de aporte (Kanban Contratos / Pipeline).
 * Botão "Ver aporte no projeto" abre o modal de Aportes do projeto destino.
 * Botão "Mover pra Aporte" só aparece em kanban_status='novo_contrato' (governança).
 * Editar/Excluir (canWrite): PUT/DELETE /projects/{id}/hour-contributions/{id}.
 */
export function AporteDetailModal({ aporte, onClose, onViewInProject, onMoveToFinal, onSaved, onDeleted, canWrite }: {
  aporte: AporteDetail
  onClose: () => void
  onViewInProject: () => void
  onMoveToFinal?: () => void
  onSaved?: () => void
  onDeleted?: () => void
  canWrite?: boolean
}) {
  const motivo = aporte.motivo ?? 'aporte'
  const isNovo = aporte.kanban_status === 'novo_contrato'

  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [horas, setHoras]     = useState(String(aporte.horas ?? ''))
  const [valor, setValor]     = useState(String(aporte.valor_hora ?? ''))
  const [mot, setMot]         = useState<string>(motivo)
  const [desc, setDesc]       = useState(aporte.description ?? '')
  const [data, setData]       = useState(aporte.contributed_at ? aporte.contributed_at.slice(0, 10) : '')

  const total = (Number(horas) || 0) * (Number(valor) || 0)

  const salvar = async () => {
    const h = Number(horas), v = Number(valor)
    if (!(h > 0)) { toast.error('Informe as horas (maior que zero).'); return }
    if (!(v > 0)) { toast.error('Informe o valor/hora (maior que zero).'); return }
    if (!data) { toast.error('Informe a data do aporte.'); return }
    setSaving(true)
    try {
      await api.put(`/projects/${aporte.project_id}/hour-contributions/${aporte.id}`, {
        contributed_hours: h,
        hourly_rate: v,
        motivo: mot,
        description: desc || null,
        contributed_at: data,
      })
      toast.success('Aporte atualizado')
      onSaved?.()
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao atualizar aporte')
    } finally {
      setSaving(false)
    }
  }

  const excluir = async () => {
    if (!confirm('Excluir este aporte? O anexo é preservado (soft-delete), mas o aporte sai do banco de horas.')) return
    setDeleting(true)
    try {
      await api.delete(`/projects/${aporte.project_id}/hour-contributions/${aporte.id}`)
      toast.success('Aporte excluído')
      onDeleted?.()
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao excluir aporte')
    } finally {
      setDeleting(false)
    }
  }

  const inputStyle = { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-2xl border overflow-hidden flex flex-col" style={{ background: 'var(--surface)', borderColor: 'var(--border)', maxHeight: '90vh' }}>
        <div className="flex items-start justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--border)', background: `${APORTE_COLOR}10` }}>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: APORTE_COLOR }}>
              💰 Aporte · {editing ? (MOTIVO_LABEL[mot] ?? mot) : (MOTIVO_LABEL[motivo] ?? motivo)}
            </p>
            <h2 className="text-base font-semibold mt-0.5 truncate" style={{ color: 'var(--text)' }}>
              {aporte.customer_name ?? '—'}
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{aporte.project_name ?? '—'}</p>
            {aporte.project_code && (
              <p className="font-mono text-xs mt-0.5" style={{ color: 'var(--primary)' }}>{aporte.project_code}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors shrink-0">
            <X size={16} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Aporte gerado automaticamente por um subprojeto faturado (borda verde + código). */}
          {(() => {
            const m = /ref\. subprojeto faturado\s*\(([^\s)]+)/i.exec(aporte.description ?? '')
            if (!m) return null
            return (
              <div className="rounded-lg px-3 py-2 text-xs font-medium"
                style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}>
                Criado automaticamente pelo subprojeto <span className="font-mono font-bold">{m[1]}</span>
              </div>
            )
          })()}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Status</span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: isNovo ? 'rgba(245,158,11,0.18)' : `${APORTE_COLOR}20`,
                color: isNovo ? '#f59e0b' : APORTE_COLOR,
                border: `1px solid ${isNovo ? '#f59e0b66' : APORTE_COLOR}55`,
              }}>
              {isNovo ? 'Em revisão (Novo Contrato)' : 'Confirmado (coluna Aporte)'}
            </span>
          </div>

          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Horas</p>
                  <input type="number" step="0.5" min="0" value={horas} onChange={e => setHoras(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Valor/h (R$)</p>
                  <input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
                </div>
              </div>
              <div className="rounded-lg p-2 text-center" style={{ background: `${APORTE_COLOR}10`, border: `1px solid ${APORTE_COLOR}33` }}>
                <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>Total: </span>
                <span className="text-sm font-bold tabular-nums" style={{ color: APORTE_COLOR }}>
                  {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Data do aporte</p>
                  <input type="date" value={data} onChange={e => setData(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Motivo</p>
                  <select value={mot} onChange={e => setMot(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
                    <option value="aporte">Aporte</option>
                    <option value="excedentes">Excedentes</option>
                    <option value="absorvidas">Absorvidas</option>
                  </select>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Descrição</p>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} maxLength={1000}
                  className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg p-3 text-center" style={{ background: `${APORTE_COLOR}10`, border: `1px solid ${APORTE_COLOR}33` }}>
                  <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>Horas</p>
                  <p className="text-base font-bold tabular-nums" style={{ color: APORTE_COLOR }}>{Number(aporte.horas).toFixed(1)}h</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: `${APORTE_COLOR}10`, border: `1px solid ${APORTE_COLOR}33` }}>
                  <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>Valor/h</p>
                  <p className="text-base font-bold tabular-nums" style={{ color: APORTE_COLOR }}>
                    {Number(aporte.valor_hora).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: `${APORTE_COLOR}20`, border: `1px solid ${APORTE_COLOR}55` }}>
                  <p className="text-[10px]" style={{ color: 'var(--text-light)' }}>Total</p>
                  <p className="text-base font-bold tabular-nums" style={{ color: APORTE_COLOR }}>
                    {Number(aporte.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
              </div>

              {aporte.description && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Descrição</p>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{aporte.description}</p>
                </div>
              )}
            </>
          )}

          {aporte.has_proposta && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-light)' }}>Aprovação / Proposta Anexada</p>
              <a
                href={`/api/v1/projects/${aporte.project_id}/hour-contributions/${aporte.id}/proposta`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--primary)' }}
              >
                📎 {aporte.proposta_original_name ?? 'Baixar anexo'}
              </a>
            </div>
          )}

          {/* FASE 11.2.FE — Painel composto (lista + upload). Coexiste com has_proposta legado. */}
          <EntityAttachmentsPanel
            entityType="HOUR_CONTRIBUTION"
            entityId={aporte.id}
            category="proposal"
            title="Anexos adicionais"
            accept="application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip"
            maxMb={20}
            hideWhenEmpty
            variant="compact"
          />

          <div className="flex items-center justify-between text-[11px] pt-2 border-t" style={{ color: 'var(--text-light)', borderColor: 'var(--border)' }}>
            <span>Criado por <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>{aporte.contributed_by ?? '—'}</span></span>
            <span>{aporte.contributed_at ? new Date(aporte.contributed_at).toLocaleDateString('pt-BR') : ''}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface-hover)' }}>
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} disabled={saving}
                className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-white transition-colors disabled:opacity-40">
                Cancelar
              </button>
              <button onClick={salvar} disabled={saving}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
                style={{ background: `${APORTE_COLOR}20`, color: APORTE_COLOR, border: `1px solid ${APORTE_COLOR}55` }}>
                {saving ? 'Salvando…' : 'Salvar alterações'}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button onClick={onClose}
                  className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-white transition-colors">
                  Fechar
                </button>
                {canWrite && (
                  <button onClick={excluir} disabled={deleting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
                    style={{ color: 'var(--danger-border)', border: '1px solid var(--danger-border)' }}>
                    <Trash2 size={13} /> {deleting ? 'Excluindo…' : 'Excluir'}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {canWrite && (
                  <button onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                    style={{ background: 'var(--surface-hover)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                    <Pencil size={13} /> Editar
                  </button>
                )}
                {isNovo && canWrite && onMoveToFinal && (
                  <button
                    onClick={() => { onMoveToFinal(); onClose() }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                    style={{ background: `${APORTE_COLOR}20`, color: APORTE_COLOR, border: `1px solid ${APORTE_COLOR}55` }}
                  >
                    Mover pra coluna Aporte →
                  </button>
                )}
                <button
                  onClick={onViewInProject}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--ring)' }}
                >
                  Ver no projeto →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
