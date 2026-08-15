'use client'

import { useEffect, useState } from 'react'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  projectId: number
  initial: {
    allow_weekend_work: boolean
    allow_holiday_work: boolean
  }
  onSaved: () => void
  /**
   * Fase 10.1 — chamado SE o save mudou alguma flag de calendário.
   * Recebe o `simulate` pra page disparar o CronogramaRecalcModal (informativo).
   */
  onCalendarChanged?: (simulate: { allow_weekend_work?: boolean; allow_holiday_work?: boolean }) => void
}

/**
 * Modal de configurações operacionais do Cronograma (Fase 7).
 * Hoje: 2 toggles do calendário (sábado/feriado). Sem mexer em outras
 * configurações do projeto — só as que afetam o cronograma diretamente.
 */
export function CronogramaSettingsModal({ open, onClose, projectId, initial, onSaved, onCalendarChanged }: Props) {
  const [allowWeekend, setAllowWeekend] = useState(initial.allow_weekend_work)
  const [allowHoliday, setAllowHoliday] = useState(initial.allow_holiday_work)
  const [saving, setSaving] = useState(false)

  // Reseta state ao abrir
  useEffect(() => {
    if (open) {
      setAllowWeekend(initial.allow_weekend_work)
      setAllowHoliday(initial.allow_holiday_work)
    }
  }, [open, initial.allow_weekend_work, initial.allow_holiday_work])

  async function handleSave() {
    setSaving(true)
    try {
      await api.patch(`/projects/${projectId}`, {
        allow_weekend_work: allowWeekend,
        allow_holiday_work: allowHoliday,
      })
      toast.success('Configurações salvas')
      onSaved()

      // Fase 10.1: se alguma flag mudou, sinaliza a page pra abrir recalc modal
      const changed: { allow_weekend_work?: boolean; allow_holiday_work?: boolean } = {}
      if (allowWeekend !== initial.allow_weekend_work) changed.allow_weekend_work = allowWeekend
      if (allowHoliday !== initial.allow_holiday_work) changed.allow_holiday_work = allowHoliday
      onClose()
      if (Object.keys(changed).length > 0 && onCalendarChanged) {
        // Delay pra evitar 2 modais sobrepostos (settings fecha animado primeiro)
        setTimeout(() => onCalendarChanged(changed), 150)
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <ModalHeader
        title="Configurações do Cronograma"
        subtitle="Calendário operacional do projeto. Afeta cálculo de dias úteis e prazos."
      />
      <ModalBody>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '12px 14px',
              border: '1px solid var(--border)', borderRadius: 8,
              cursor: 'pointer',
              background: allowWeekend ? 'var(--primary-soft)' : 'var(--surface)',
            }}
          >
            <input
              type="checkbox"
              checked={allowWeekend}
              onChange={e => setAllowWeekend(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                Permitir execução em finais de semana
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Sábado e domingo contam como dias úteis para cálculo de prazo.
              </div>
            </div>
          </label>

          <label
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '12px 14px',
              border: '1px solid var(--border)', borderRadius: 8,
              cursor: 'pointer',
              background: allowHoliday ? 'var(--primary-soft)' : 'var(--surface)',
            }}
          >
            <input
              type="checkbox"
              checked={allowHoliday}
              onChange={e => setAllowHoliday(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                Permitir execução em feriados
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Feriados não interrompem o cronograma deste projeto (go-live,
                fechamento fiscal, suporte crítico).
              </div>
            </div>
          </label>
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="ds-btn-secondary" onClick={onClose} disabled={saving}>
          Cancelar
        </button>
        <button type="button" className="ds-btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </ModalFooter>
    </Modal>
  )
}
