'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { BellRing, Clock, Save, Eye, X } from 'lucide-react'
import { EmailFrame } from '@/components/help-desk/email-frame'

interface Rule {
  key: string; label: string; audience: string
  enabled: boolean; unit: 'hours' | 'days'; interval: number
  last_fired_at: string | null
  workflow: string | null; workflow_label: string | null
}

/**
 * Rotina (admin): define a RECORRÊNCIA dos lembretes de ações não resolvidas (apontamentos
 * rejeitados/ajuste, aprovações, despesas...). Por tipo: liga/desliga + a cada X horas/dias.
 * O lembrete reabre o pop-up no Meu Dia + reenvia o e-mail até a ação ser resolvida.
 */
export function ActionRemindersPanel() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ label: string; html: string; recipients: number } | null>(null)
  const [previewKey, setPreviewKey] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get<{ data: Rule[] }>('/action-reminders')
      .then(r => setRules([...(r.data ?? [])].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))))
      .catch(() => toast.error('Erro ao carregar as regras'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const patch = (key: string, p: Partial<Rule>) => setRules(rs => rs.map(r => r.key === key ? { ...r, ...p } : r))

  const save = async (r: Rule) => {
    setSavingKey(r.key)
    try {
      await api.put(`/action-reminders/${r.key}`, { enabled: r.enabled, unit: r.unit, interval: Math.max(1, r.interval) })
      toast.success('Recorrência salva ✓')
    } catch { toast.error('Erro ao salvar'); load() } finally { setSavingKey(null) }
  }

  const openPreview = async (r: Rule) => {
    setPreviewKey(r.key)
    try {
      const res = await api.get<{ data: { html: string; recipients: number } }>(`/action-reminders/${r.key}/preview`)
      setPreview({ label: r.label, html: res.data?.html ?? '', recipients: res.data?.recipients ?? 0 })
    } catch { toast.error('Erro na prévia') } finally { setPreviewKey(null) }
  }

  if (loading) return <div className="ds-card p-4 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>Carregando…</div>

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <BellRing size={16} style={{ color: 'var(--primary)', marginTop: 2 }} />
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          Defina a cada quanto tempo cada <b style={{ color: 'var(--text)' }}>ação não resolvida</b> volta a lembrar o responsável
          (reabre o aviso no Meu Dia e reenvia o e-mail), até ser resolvida.
        </p>
      </div>

      {rules.map(r => (
        <div key={r.key} className="ds-card p-3 flex flex-wrap items-center gap-x-4 gap-y-2"
          style={{ borderLeft: `3px solid ${r.enabled ? 'var(--primary)' : 'var(--border)'}` }}>
          {/* liga/desliga */}
          <button onClick={() => patch(r.key, { enabled: !r.enabled })} role="switch" aria-checked={r.enabled}
            className="relative shrink-0 rounded-full transition-colors" style={{ width: 38, height: 22, background: r.enabled ? 'var(--primary)' : 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
            <span className="absolute top-0.5 rounded-full transition-all" style={{ width: 16, height: 16, background: '#fff', left: r.enabled ? 19 : 3 }} />
          </button>

          <div className="min-w-[180px] flex-1">
            <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{r.label}</div>
            <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>{r.audience}{r.last_fired_at ? ` · último: ${new Date(r.last_fired_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</div>
            {r.workflow_label && <div className="text-[10px] mt-0.5 inline-flex items-center gap-1" style={{ color: 'var(--primary)' }} title="Cópias e destinatários extras vêm da Central de Workflows">⤷ Workflow: {r.workflow_label}</div>}
          </div>

          {/* a cada X horas/dias */}
          <div className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: r.enabled ? 'var(--text)' : 'var(--text-light)' }}>
            <Clock size={13} /> a cada
            <input type="number" min={1} max={744} value={r.interval} disabled={!r.enabled}
              onChange={e => patch(r.key, { interval: parseInt(e.target.value || '1', 10) })}
              className="ds-input w-14 text-center px-1 py-1 text-[13px]" />
            <select value={r.unit} disabled={!r.enabled} onChange={e => patch(r.key, { unit: e.target.value as Rule['unit'] })}
              className="ds-input px-2 py-1 text-[13px]">
              <option value="hours">horas</option>
              <option value="days">dias</option>
            </select>
          </div>

          <button onClick={() => openPreview(r)} disabled={previewKey === r.key}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg shrink-0" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            title="Ver prévia do e-mail e quem receberia agora">
            <Eye size={13} /> {previewKey === r.key ? '…' : 'Prévia'}
          </button>
          <button onClick={() => save(r)} disabled={savingKey === r.key}
            className="ds-btn-primary inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg shrink-0">
            <Save size={13} /> {savingKey === r.key ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      ))}

      {/* Prévia do e-mail do lembrete + nº de destinatários (mesma visão da Central) */}
      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={() => setPreview(null)}>
          <div className="ds-card w-full max-w-xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>Prévia · {preview.label}</div>
              <div className="flex items-center gap-3">
                <span className="text-xs px-2 py-0.5 rounded-lg whitespace-nowrap" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{preview.recipients} destinatário(s)</span>
                <button onClick={() => setPreview(null)} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3"><EmailFrame html={preview.html} /></div>
          </div>
        </div>
      )}
    </div>
  )
}
