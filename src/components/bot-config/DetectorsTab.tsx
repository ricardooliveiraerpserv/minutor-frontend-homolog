'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Pencil, Play, Plus, Radar, Save, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  type BotDetector,
  createDetector, deleteDetector, listDetectors,
  runAllDetectors, runDetector, testDetector, updateDetector,
  validateDetectorSql,
} from '@/lib/bot-config'
import { Skeleton } from '@/components/ui/skeleton'

const SEV_STYLE: Record<string, string> = {
  info:     'bg-blue-500/15 text-blue-300 border-blue-500/30',
  low:      'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  medium:   'bg-amber-500/15 text-amber-300 border-amber-500/30',
  high:     'bg-orange-500/15 text-orange-300 border-orange-500/30',
  critical: 'bg-red-500/15 text-red-300 border-red-500/30',
}

const TYPE_LABEL: Record<string, string> = {
  bank_hours_threshold:  'Banco de horas (saldo absoluto)',
  expense_payment_age:   'Despesas aprovadas sem pagamento',
  timesheet_pending_age: 'Apontamentos pendentes há X dias',
  ticket_stale_age:      'Tickets Movidesk parados',
  late_timesheets:       'Apontamentos late',
  sql:                   'SQL custom (SELECT)',
  custom:                'Custom (handler externo)',
}

const input = 'w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500'

function formatRelative(iso: string | null) {
  if (!iso) return 'nunca'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const h = Math.floor(diff / 3600_000)
  if (h < 1) return 'há minutos'
  if (h < 24) return `há ${h}h`
  const days = Math.floor(h / 24)
  return `há ${days}d`
}

interface EditorProps {
  detector?: BotDetector
  options: { types: string[]; severities: string[]; event_types: string[]; sources: string[] }
  onClose: () => void
}

function DetectorEditorModal({ detector, options, onClose }: EditorProps) {
  const qc = useQueryClient()
  const isEdit = !!detector
  const [busy, setBusy] = useState(false)

  const [slug, setSlug] = useState(detector?.slug ?? '')
  const [name, setName] = useState(detector?.name ?? '')
  const [description, setDescription] = useState(detector?.description ?? '')
  const [type, setType] = useState(detector?.detector_type ?? 'expense_payment_age')
  const [severity, setSeverity] = useState(detector?.severity ?? 'medium')
  const [source, setSource] = useState(detector?.source ?? 'ai')
  const [eventType, setEventType] = useState(detector?.event_type ?? 'financial_alert')
  const [dedupeHours, setDedupeHours] = useState(detector?.dedupe_window_hours ?? 24)
  const [active, setActive] = useState(detector?.active ?? true)
  // Campos específicos
  const cfg = detector?.config ?? {}
  const [thresholdHours, setThresholdHours] = useState<number>((cfg.threshold_hours as number) ?? 16)
  const [days, setDays] = useState<number>((cfg.days as number) ?? 7)
  const [sql, setSql] = useState<string>((cfg.sql as string) ?? '')
  const [titleTpl, setTitleTpl] = useState<string>((cfg.title_template as string) ?? '')
  const [messageTpl, setMessageTpl] = useState<string>((cfg.message_template as string) ?? '')
  const [maxRows, setMaxRows] = useState<number>((cfg.max_rows as number) ?? 50)
  const [sqlError, setSqlError] = useState<string | null>(null)

  const buildConfig = (): Record<string, unknown> => {
    switch (type) {
      case 'bank_hours_threshold':   return { threshold_hours: Number(thresholdHours) || 16 }
      case 'expense_payment_age':
      case 'timesheet_pending_age':
      case 'ticket_stale_age':       return { days: Number(days) || 7 }
      case 'late_timesheets':        return {}
      case 'sql':
      case 'custom':                 return {
        sql: sql.trim(),
        title_template: titleTpl.trim(),
        message_template: messageTpl.trim(),
        max_rows: Number(maxRows) || 50,
      }
      default: return {}
    }
  }

  const checkSql = async () => {
    if (!sql.trim()) { setSqlError('SQL vazio'); return }
    try {
      const { valid, error } = await validateDetectorSql(sql)
      setSqlError(valid ? null : error)
      if (valid) toast.success('SQL válido')
      else toast.error(error ?? 'SQL inválido')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((type === 'sql') && sqlError) {
      toast.error('Corrija o SQL antes de salvar')
      return
    }
    setBusy(true)
    try {
      const payload: Partial<BotDetector> = {
        slug: slug.trim(),
        name: name.trim(),
        description: description.trim() || null,
        detector_type: type,
        config: buildConfig(),
        severity,
        source,
        event_type: eventType,
        dedupe_window_hours: Number(dedupeHours) || 24,
        active,
      }
      if (isEdit) await updateDetector(detector!.id, payload)
      else        await createDetector(payload)
      await qc.invalidateQueries({ queryKey: ['bot-detectors'] })
      toast.success(isEdit ? 'Detector atualizado' : 'Detector criado')
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const isSystem = !!detector?.is_system

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">
            {isEdit ? `Editar detector — ${detector!.slug}` : 'Novo detector proativo'}
          </h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-200"><X size={16}/></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Slug *</label>
            <input
              value={slug}
              onChange={e => setSlug(e.target.value)}
              disabled={isSystem}
              className={`${input} disabled:opacity-60`}
              placeholder="ex: contratos_expirando"
              required
              pattern="[a-z0-9_-]+"
            />
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Nome *</label>
            <input value={name} onChange={e => setName(e.target.value)} className={input} required />
          </div>
        </div>

        <div>
          <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Descrição</label>
          <input value={description ?? ''} onChange={e => setDescription(e.target.value)} className={input} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Tipo *</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              disabled={isSystem}
              className={`${input} disabled:opacity-60`}
            >
              {options.types.map(t => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Severidade</label>
            <select value={severity} onChange={e => setSeverity(e.target.value)} className={input}>
              {options.severities.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Source</label>
            <select value={source} onChange={e => setSource(e.target.value)} className={input}>
              {options.sources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Event type</label>
            <select value={eventType} onChange={e => setEventType(e.target.value)} className={input}>
              {options.event_types.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Dedupe (horas)</label>
            <input type="number" min={1} max={720} value={dedupeHours} onChange={e => setDedupeHours(Number(e.target.value))} className={input} />
          </div>
        </div>

        {/* Campos por tipo */}
        <div className="p-3 rounded bg-zinc-900/50 border border-zinc-800 space-y-3">
          {type === 'bank_hours_threshold' && (
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Limite de horas (|saldo| ≥)</label>
              <input type="number" min={1} value={thresholdHours} onChange={e => setThresholdHours(Number(e.target.value))} className={input} />
              <p className="text-[11px] text-zinc-500 mt-1">Acima desse valor (positivo ou negativo) o consultor entra no alerta.</p>
            </div>
          )}

          {(type === 'expense_payment_age' || type === 'timesheet_pending_age' || type === 'ticket_stale_age') && (
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Dias</label>
              <input type="number" min={1} value={days} onChange={e => setDays(Number(e.target.value))} className={input} />
            </div>
          )}

          {type === 'late_timesheets' && (
            <p className="text-[11px] text-zinc-500">Sem parâmetros — conta os apontamentos com status <code>late</code>.</p>
          )}

          {(type === 'sql' || type === 'custom') && (
            <>
              <div>
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider">SQL (apenas SELECT) *</label>
                <textarea
                  value={sql}
                  onChange={e => { setSql(e.target.value); setSqlError(null) }}
                  rows={6}
                  className={`${input} font-mono text-[12px]`}
                  placeholder={`SELECT id AS dedupe_key, customer_id, name AS row_name\nFROM customers\nWHERE active = true`}
                  required={type === 'sql'}
                />
                {sqlError && <p className="text-[11px] text-red-400 mt-1">⚠ {sqlError}</p>}
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] text-zinc-500">
                    Colunas reservadas: <code>dedupe_key</code>, <code>customer_id</code>, <code>contract_id</code>, <code>project_id</code>, <code>severity</code>.
                  </p>
                  <button type="button" onClick={checkSql} className="text-[11px] text-emerald-300 hover:underline">Validar SQL</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Título (template)</label>
                  <input value={titleTpl} onChange={e => setTitleTpl(e.target.value)} className={input} placeholder="Alerta para {{row_name}}" />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Mensagem (template)</label>
                  <input value={messageTpl} onChange={e => setMessageTpl(e.target.value)} className={input} placeholder="Cliente {{customer_id}} precisa atenção" />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Max linhas / execução</label>
                <input type="number" min={1} max={500} value={maxRows} onChange={e => setMaxRows(Number(e.target.value))} className={input} />
              </div>
              <p className="text-[10px] text-zinc-500">
                Use <code>{'{{coluna}}'}</code> para substituir colunas do resultado nos templates de título/mensagem.
              </p>
            </>
          )}
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="accent-emerald-500" />
          Ativo
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-1.5 rounded text-xs text-zinc-300 hover:bg-zinc-800">Cancelar</button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-emerald-500 text-zinc-950 text-xs font-semibold hover:bg-emerald-400 disabled:opacity-50"
          >
            <Save size={12}/> {isEdit ? 'Salvar' : 'Criar detector'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function DetectorsTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['bot-detectors'], queryFn: listDetectors })
  const [editing, setEditing] = useState<BotDetector | undefined>(undefined)
  const [modalOpen, setModalOpen] = useState(false)
  const [runningId, setRunningId] = useState<number | null>(null)

  if (isLoading) return <Skeleton className="h-40 bg-zinc-800" />
  const items = data?.data ?? []
  const options = {
    types: data?.types ?? [],
    severities: data?.severities ?? [],
    event_types: data?.event_types ?? [],
    sources: data?.sources ?? [],
  }

  const toggle = async (d: BotDetector) => {
    try {
      await updateDetector(d.id, { active: !d.active })
      await qc.invalidateQueries({ queryKey: ['bot-detectors'] })
      toast.success(d.active ? 'Detector desativado' : 'Detector ativado')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const remove = async (d: BotDetector) => {
    if (d.is_system) {
      toast.error('Detectores de sistema não podem ser excluídos. Desative em vez de excluir.')
      return
    }
    if (!confirm(`Excluir o detector "${d.name}"?`)) return
    try {
      await deleteDetector(d.id)
      await qc.invalidateQueries({ queryKey: ['bot-detectors'] })
      toast.success('Detector excluído')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const test = async (d: BotDetector) => {
    setRunningId(d.id)
    try {
      const r = await testDetector(d.id)
      if (r.error) toast.error(`Erro: ${r.error}`)
      else toast.success(`${r.would_create} alerta(s) seriam criados`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRunningId(null)
    }
  }

  const run = async (d: BotDetector) => {
    if (!confirm(`Executar agora "${d.name}" e criar alertas reais no Operational Feed?`)) return
    setRunningId(d.id)
    try {
      const r = await runDetector(d.id, false)
      if (r.error) toast.error(`Erro: ${r.error}`)
      else toast.success(`${r.alerts} alerta(s) criados`)
      await qc.invalidateQueries({ queryKey: ['bot-detectors'] })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRunningId(null)
    }
  }

  const runAll = async () => {
    if (!confirm('Executar TODOS os detectores ativos agora?')) return
    try {
      const r = await runAllDetectors(false)
      toast.success(`${r.alerts} alerta(s) criados ao todo`)
      await qc.invalidateQueries({ queryKey: ['bot-detectors'] })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-zinc-900/40 border border-zinc-800 p-3 flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-zinc-300 text-sm font-medium">
            <Radar size={14} /> Detectores proativos
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Varreduras agendadas (cron <code>bot:proactive-alerts</code>, 1×/dia às 8h). Cada detector ativo gera eventos
            no Operational Feed que, por sua vez, são roteados conforme as regras de notificação.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={runAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 text-xs font-semibold hover:bg-zinc-800"
            title="Executar todos os ativos agora"
          >
            <Play size={12}/> Rodar todos
          </button>
          <button
            type="button"
            onClick={() => { setEditing(undefined); setModalOpen(true) }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500 text-zinc-950 text-xs font-semibold hover:bg-emerald-400"
          >
            <Plus size={12}/> Novo detector
          </button>
        </div>
      </div>

      {items.length === 0 && (
        <p className="text-xs text-zinc-500 px-1">Nenhum detector cadastrado.</p>
      )}

      {items.map(d => (
        <div key={d.id} className="border border-zinc-800 rounded-md bg-zinc-900/30 overflow-hidden">
          <div className="flex items-start gap-3 p-4">
            <div className="w-10 h-10 rounded-md bg-zinc-800 text-emerald-300 flex items-center justify-center shrink-0 ring-1 ring-emerald-500/30">
              <Radar size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-zinc-100">{d.name}</h3>
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{d.slug}</span>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">{TYPE_LABEL[d.detector_type] ?? d.detector_type}</span>
                <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEV_STYLE[d.severity] ?? 'border-zinc-700 text-zinc-400'}`}>
                  {d.severity}
                </span>
                {d.is_system && (
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-blue-500/30 text-blue-300 bg-blue-500/10">sistema</span>
                )}
              </div>
              {d.description && (
                <p className="text-[11px] text-zinc-500 mt-1">{d.description}</p>
              )}
              <p className="text-[10px] text-zinc-600 mt-1">
                Última execução: {formatRelative(d.last_run_at)} · {d.last_run_alerts} alerta(s)
                {d.last_run_error && <span className="text-red-400"> · erro: {d.last_run_error.slice(0, 80)}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => test(d)}
                disabled={runningId === d.id}
                title="Testar (dry-run)"
                className="text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center gap-1"
              >
                <CheckCircle2 size={12}/> Testar
              </button>
              <button
                type="button"
                onClick={() => run(d)}
                disabled={runningId === d.id}
                title="Executar agora"
                className="text-xs px-2.5 py-1.5 rounded border border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 inline-flex items-center gap-1"
              >
                <Play size={12}/> Rodar
              </button>
              <button
                type="button"
                onClick={() => toggle(d)}
                className={[
                  'text-xs px-3 py-1.5 rounded border transition-colors',
                  d.active
                    ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20'
                    : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800',
                ].join(' ')}
              >
                {d.active ? 'Ativo' : 'Inativo'}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(d); setModalOpen(true) }}
                title="Editar detector"
                className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
              >
                <Pencil size={14}/>
              </button>
              <button
                type="button"
                onClick={() => remove(d)}
                disabled={d.is_system}
                title={d.is_system ? 'Detectores de sistema não podem ser excluídos' : 'Excluir detector'}
                className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500"
              >
                <Trash2 size={14}/>
              </button>
            </div>
          </div>
        </div>
      ))}

      {modalOpen && (
        <DetectorEditorModal
          detector={editing}
          options={options}
          onClose={() => { setModalOpen(false); setEditing(undefined) }}
        />
      )}
    </div>
  )
}
