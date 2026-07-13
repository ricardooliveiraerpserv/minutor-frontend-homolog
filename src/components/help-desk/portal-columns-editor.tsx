'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { Plus, Trash2, ArrowUp, ArrowDown, GripVertical, Save, ShieldAlert, CalendarClock } from 'lucide-react'

export interface PortalColumn { label: string; cor: string | null; fallback?: boolean; rule?: 'scheduled' | null; statuses: string[] }
interface StatusOpt { key: string; label: string; cor: string | null; is_terminal: boolean }

/**
 * Rotina do ADMIN: configura as colunas do Kanban do PORTAL DO CLIENTE (config GLOBAL, vale p/ todos
 * os clientes). Definimos quais status entram em cada coluna. Um status pertence a no máximo uma
 * coluna; a coluna marcada como "fallback" recebe os status que não foram mapeados. Renderizada
 * como seção dentro de /help-desk/configuracoes (aba "Kanban do cliente"). O cliente NÃO edita.
 */
export function PortalColumnsEditor() {
  const { user } = useAuth()
  const [cols, setCols] = useState<PortalColumn[]>([])
  const [statuses, setStatuses] = useState<StatusOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const dragIdx = useRef<number | null>(null)   // índice da coluna sendo arrastada (reordenar)
  const isAdmin = user?.type === 'admin'

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return }
    api.get<{ columns: PortalColumn[]; statuses: StatusOpt[] }>('/help-desk/portal-columns')
      .then(r => { setCols((r?.columns ?? []).map(c => ({ ...c, statuses: [...(c.statuses ?? [])] }))); setStatuses(r?.statuses ?? []) })
      .catch(() => toast.error('Erro ao carregar configuração'))
      .finally(() => setLoading(false))
  }, [isAdmin])

  const patch = (i: number, up: Partial<PortalColumn>) => setCols(cs => cs.map((c, j) => j === i ? { ...c, ...up } : c))
  const addColumn = () => setCols(cs => [...cs, { label: 'Nova coluna', cor: '#6b7280', fallback: false, statuses: [] }])
  const removeColumn = (i: number) => setCols(cs => cs.filter((_, j) => j !== i))
  const moveColumn = (i: number, dir: -1 | 1) => setCols(cs => {
    const j = i + dir; if (j < 0 || j >= cs.length) return cs
    const next = [...cs];[next[i], next[j]] = [next[j], next[i]]; return next
  })
  // Reordena arrastando a alça: move a coluna `from` para a posição `to`.
  const moveTo = (from: number, to: number) => setCols(cs => {
    if (from === to || from < 0 || to < 0 || from >= cs.length || to >= cs.length) return cs
    const next = [...cs]; const [m] = next.splice(from, 1); next.splice(to, 0, m); return next
  })
  // Um status pertence a UMA coluna: ao marcar aqui, remove das outras.
  const toggleStatus = (i: number, key: string) => setCols(cs => cs.map((c, j) => {
    if (j === i) return c.statuses.includes(key) ? { ...c, statuses: c.statuses.filter(k => k !== key) } : { ...c, statuses: [...c.statuses, key] }
    return c.statuses.includes(key) ? { ...c, statuses: c.statuses.filter(k => k !== key) } : c
  }))
  // Fallback é exclusivo (só uma coluna recebe os não mapeados).
  const setFallback = (i: number) => setCols(cs => cs.map((c, j) => ({ ...c, fallback: j === i })))
  // Tipo da coluna: 'scheduled' = captura todo chamado com agendamento (sem status/fallback).
  const setRule = (i: number, rule: 'scheduled' | null) => setCols(cs => cs.map((c, j) => j === i ? { ...c, rule, ...(rule ? { fallback: false, statuses: [] } : {}) } : c))

  const columnOf = (key: string) => cols.findIndex(c => c.statuses.includes(key))
  const unmapped = statuses.filter(s => columnOf(s.key) < 0)

  const save = async () => {
    if (cols.length === 0) return toast.error('Deixe ao menos uma coluna.')
    if (cols.some(c => !c.label.trim())) return toast.error('Toda coluna precisa de um nome.')
    setSaving(true)
    try {
      const r = await api.put<{ columns: PortalColumn[] }>('/help-desk/portal-columns', { columns: cols })
      setCols((r?.columns ?? cols).map(c => ({ ...c, statuses: [...(c.statuses ?? [])] })))
      toast.success('Colunas do Kanban do cliente atualizadas.')
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  if (!isAdmin) {
    return (
      <div className="ds-card p-6 flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
        <ShieldAlert size={18} style={{ color: 'var(--warning)' }} />
        <span className="text-sm">Apenas o administrador configura o Kanban do cliente.</span>
      </div>
    )
  }
  if (loading) return <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Carregando…</div>

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Defina quais status entram em cada coluna do Kanban que o cliente vê no portal. Vale para <strong>todos os clientes</strong>.
        A coluna marcada como <strong>“Status não mapeados”</strong> recebe qualquer status que não esteja em nenhuma outra.
      </p>

      {cols.map((col, i) => {
        const isScheduled = col.rule === 'scheduled'
        return (
        <div key={i} className="ds-card p-3 space-y-2.5"
          onDragOver={e => { if (dragIdx.current !== null) e.preventDefault() }}
          onDrop={() => { if (dragIdx.current !== null && dragIdx.current !== i) moveTo(dragIdx.current, i); dragIdx.current = null }}>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Controles à ESQUERDA (sempre visíveis): arrastar a alça OU usar ↑ ↓ */}
            <span draggable onDragStart={() => { dragIdx.current = i }} onDragEnd={() => { dragIdx.current = null }}
              title="Arraste para reordenar a coluna" className="shrink-0 cursor-grab active:cursor-grabbing p-0.5 rounded"
              style={{ color: 'var(--text-light)' }}>
              <GripVertical size={16} />
            </span>
            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={() => moveColumn(i, -1)} disabled={i === 0} className="p-1 rounded disabled:opacity-30" title="Subir"><ArrowUp size={14} style={{ color: 'var(--text-muted)' }} /></button>
              <button onClick={() => moveColumn(i, 1)} disabled={i === cols.length - 1} className="p-1 rounded disabled:opacity-30" title="Descer"><ArrowDown size={14} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
            <input type="color" value={col.cor ?? '#6b7280'} onChange={e => patch(i, { cor: e.target.value })}
              className="w-7 h-7 rounded cursor-pointer shrink-0 border-0 bg-transparent p-0" title="Cor da coluna" />
            <input value={col.label} onChange={e => patch(i, { label: e.target.value })} placeholder="Nome da coluna"
              className="text-sm rounded-lg px-2.5 py-1.5 outline-none flex-1 min-w-[140px]"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <select value={col.rule ?? ''} onChange={e => setRule(i, e.target.value === 'scheduled' ? 'scheduled' : null)}
              title="Como a coluna captura chamados" className="text-xs rounded-lg px-2 py-1.5 outline-none shrink-0"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <option value="">Por status</option>
              <option value="scheduled">Agendados</option>
            </select>
            {!isScheduled && (
              <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer px-2 py-1 rounded-md shrink-0"
                title="Recebe os status que não estão em nenhuma coluna"
                style={{ color: col.fallback ? 'var(--primary)' : 'var(--text-muted)', background: col.fallback ? 'var(--primary-soft)' : 'transparent', border: `1px solid ${col.fallback ? 'var(--primary)' : 'var(--border)'}` }}>
                <input type="radio" name="hd-portal-fallback" checked={!!col.fallback} onChange={() => setFallback(i)} className="accent-current" />
                Status não mapeados
              </label>
            )}
            <button onClick={() => removeColumn(i)} className="p-1 rounded shrink-0 ml-auto" title="Remover coluna"><Trash2 size={14} style={{ color: 'var(--danger)' }} /></button>
          </div>
          {isScheduled ? (
            <div className="pl-6 text-[11px] inline-flex items-center gap-1.5" style={{ color: 'var(--primary)' }}>
              <CalendarClock size={13} /> Captura todo chamado <strong>com agendamento</strong>, independente do status. O chamado agendado fica só nesta coluna.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 pl-6">
              {statuses.map(s => {
                const owner = columnOf(s.key)
                const mine = owner === i
                const elsewhere = owner >= 0 && !mine
                return (
                  <button key={s.key} onClick={() => toggleStatus(i, s.key)}
                    title={elsewhere ? `Atualmente em "${cols[owner].label}"` : undefined}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md transition"
                    style={{
                      background: mine ? `${s.cor ?? '#6b7280'}22` : 'var(--surface-sunken)',
                      color: mine ? (s.cor ?? 'var(--text)') : 'var(--text-muted)',
                      border: `1px solid ${mine ? (s.cor ?? 'var(--border)') : 'var(--border)'}`,
                      opacity: elsewhere ? 0.5 : 1,
                    }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.cor ?? 'var(--text-muted)' }} />
                    {s.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )})}

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={addColumn} className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg ds-btn-secondary"><Plus size={15} /> Adicionar coluna</button>
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg ds-btn-primary" style={{ opacity: saving ? 0.6 : 1 }}>
          <Save size={15} /> {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      {unmapped.length > 0 && (
        <div className="text-[11px] rounded-lg px-3 py-2" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
          {unmapped.length} status sem coluna ({unmapped.map(s => s.label).join(', ')}) — vão para a coluna marcada como <strong>“Status não mapeados”</strong>.
        </div>
      )}
    </div>
  )
}
