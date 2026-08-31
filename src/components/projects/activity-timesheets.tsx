'use client'

import { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Check, XCircle, Trash2, Clock, Edit3, Pencil, RotateCcw, Receipt } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { ExpenseQuickModal } from '@/components/ui/expense-quick-modal'
import { SearchSelect } from '@/components/ui/search-select'

/**
 * Apontamentos da atividade — usa os MESMOS registros/endpoints/aprovação da tela
 * padrão (/timesheets, /timesheets/{id}/approve|reject, DELETE). Os campos espelham
 * o modal tradicional (Usuário, Data, Horário|Total, Observação). Coordenador/admin
 * pode apontar PELO consultor — só os consultores ALOCADOS na atividade aparecem.
 */
interface TS {
  id: number
  date: string
  effort_hours: string
  effort_minutes?: number | null
  observation?: string | null
  status: string
  status_display: string
  user?: { id: number; name: string } | null
  user_id: number
}
// Status que CONSOMEM as horas da atividade: pendente + aprovado (released = aprovado).
const CONSUMES = ['pending', 'approved', 'released']
interface AllocUser { id: number; name: string }

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:              { bg: 'var(--warning-bg)', color: 'var(--warning)' },
  approved:             { bg: 'var(--success-bg)', color: 'var(--success)' },
  rejected:             { bg: 'var(--danger-bg, rgba(239,68,68,.12))', color: 'var(--danger)' },
  adjustment_requested: { bg: 'var(--info-bg)', color: 'var(--info)' },
  conflicted:           { bg: 'rgba(139,92,246,.14)', color: '#8b5cf6' },
}
const fmtBR = (d: string) => { const [y, m, dd] = d.slice(0, 10).split('-'); return `${dd}/${m}/${y.slice(2)}` }
const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = () => ({ user_id: '', date: today(), mode: 'time' as 'time' | 'total', start_time: '', end_time: '', total_hours: '', observation: '' })

export function ActivityTimesheets({ projectId, stageId, deliveryId, responsible, previstas = 0, showSummary = true, deliveryStatus, onChanged, onSummary }: {
  projectId: number
  stageId?: number | null
  deliveryId: number
  /** Responsável da atividade — entra na lista de "alocados" mesmo sem stage_allocation. */
  responsible?: AllocUser | null
  /** Horas previstas da atividade (teto de apontamento). */
  previstas?: number
  /** Mostra o resumo Disponível/Apontadas/Saldo aqui (quando já está no cabeçalho, false). */
  showSummary?: boolean
  /** Status da atividade — usado pra ocultar saldo do CONSULTOR em atividade concluída c/ sobra. */
  deliveryStatus?: string
  onChanged?: () => void
  /** Reporta o resumo de horas ao pai (pra decidir "devolver sobra ao banco"). */
  onSummary?: (s: { previstas: number; apontadas: number; saldo: number }) => void
}) {
  const { user } = useAuth()
  const [expenseOpen, setExpenseOpen] = useState(false)
  const canActAsUser = user?.type === 'admin' || user?.type === 'coordenador'
  const canApprove = canActAsUser
  const [items, setItems] = useState<TS[]>([])
  const [allocUsers, setAllocUsers] = useState<AllocUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ items: TS[] }>(`/timesheets?stage_delivery_id=${deliveryId}&pageSize=100&order=-date`)
      setItems(r.items ?? [])
      setLoadError(null)
    } catch (e) {
      // NÃO engolir em silêncio: um erro aqui fazia a lista mostrar "Nenhum apontamento"
      // (falso) mesmo quando o apontamento foi criado — mascarava a causa real.
      setLoadError(e instanceof ApiError ? e.message : 'Falha ao carregar os apontamentos.')
    }
    finally { setLoading(false) }
  }, [deliveryId])
  useEffect(() => { load() }, [load])

  // Consultores que podem ser apontados: responsável da atividade + alocados (equipe).
  useEffect(() => {
    const merge = (rows: { user?: AllocUser | null }[]) => {
      const seen = new Set<number>()
      const us: AllocUser[] = []
      if (responsible) { seen.add(responsible.id); us.push({ id: responsible.id, name: responsible.name }) }
      for (const a of rows) {
        if (a.user && !seen.has(a.user.id)) { seen.add(a.user.id); us.push({ id: a.user.id, name: a.user.name }) }
      }
      setAllocUsers(us)
    }
    api.get<{ items: { user?: AllocUser | null }[] }>(`/activities/${deliveryId}/allocations`)
      .then(r => merge(r.items ?? []))
      .catch(() => merge([]))
  }, [deliveryId, responsible?.id, responsible?.name])

  function openForm() {
    // Default: eu mesmo se alocado; senão o responsável; senão o primeiro da lista.
    const meAllocated = allocUsers.some(u => u.id === user?.id)
    const def = !canActAsUser
      ? String(user?.id ?? '')
      : meAllocated ? String(user?.id ?? '')
      : responsible ? String(responsible.id)
      : allocUsers[0] ? String(allocUsers[0].id) : ''
    setEditingId(null)
    setForm({ ...emptyForm(), user_id: def })
    setCreating(true)
  }

  function openEdit(t: TS) {
    const min = Number(t.effort_minutes) || 0
    const total = `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
    setEditingId(t.id)
    setForm({ user_id: String(t.user_id), date: t.date.slice(0, 10), mode: 'total', start_time: '', end_time: '', total_hours: total, observation: t.observation ?? '' })
    setCreating(true)
  }

  async function save() {
    if (!form.user_id) { toast.error('Selecione o consultor (alocado na atividade)'); return }
    if (form.mode === 'total') {
      if (!form.total_hours.trim()) { toast.error('Informe o total de horas'); return }
    } else if (!form.start_time || !form.end_time) {
      toast.error('Informe início e fim'); return
    }
    if (!form.observation.trim()) { toast.error('A observação é obrigatória'); return }
    setBusy(true)
    try {
      const body: Record<string, unknown> = { date: form.date, observation: form.observation.trim() }
      if (canActAsUser && form.user_id) body.user_id = Number(form.user_id)
      if (form.mode === 'total') body.total_hours = form.total_hours.trim()
      else { body.start_time = form.start_time; body.end_time = form.end_time }
      if (editingId) {
        await api.patch(`/timesheets/${editingId}`, body)
        toast.success('Apontamento atualizado')
      } else {
        body.project_id = projectId
        body.stage_id = stageId ?? undefined
        body.stage_delivery_id = deliveryId
        await api.post('/timesheets', body)
        toast.success('Apontamento criado')
      }
      setCreating(false); setEditingId(null); setForm(emptyForm())
      load(); onChanged?.()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
    finally { setBusy(false) }
  }

  async function estornar(t: TS) {
    const reason = window.prompt('Motivo do estorno:')
    if (reason === null) return
    if (!reason.trim()) { toast.error('Motivo é obrigatório'); return }
    const url = t.status === 'approved' ? 'reverse-approval' : 'reverse-rejection'
    try { await api.post(`/timesheets/${t.id}/${url}`, { reason: reason.trim() }); toast.success('Estornado'); load(); onChanged?.() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao estornar') }
  }

  async function approve(id: number) {
    try { await api.post(`/timesheets/${id}/approve`, {}); toast.success('Aprovado'); load(); onChanged?.() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao aprovar') }
  }
  async function reject(id: number) {
    const reason = window.prompt('Motivo da rejeição:')
    if (reason === null) return
    try { await api.post(`/timesheets/${id}/reject`, { reason }); toast.success('Rejeitado'); load(); onChanged?.() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao rejeitar') }
  }
  async function requestAdjustment(id: number) {
    const reason = window.prompt('O que precisa de ajuste?')
    if (reason === null) return
    if (!reason.trim()) { toast.error('Motivo do ajuste é obrigatório'); return }
    try { await api.post(`/timesheets/${id}/request-adjustment`, { reason: reason.trim() }); toast.success('Ajuste solicitado'); load(); onChanged?.() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao solicitar ajuste') }
  }
  async function remove(id: number) {
    if (!confirm('Excluir este apontamento?')) return
    try { await api.delete(`/timesheets/${id}`); toast.success('Excluído'); load(); onChanged?.() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir') }
  }

  const editable = (s: string) => ['pending', 'rejected', 'conflicted', 'adjustment_requested'].includes(s)
  const lbl: React.CSSProperties = { fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '.04em' }

  // Resumo de horas da atividade: apontadas = soma de pendentes + aprovados (em minutos).
  const apontadas = Math.round(
    items.filter(t => CONSUMES.includes(t.status))
      .reduce((s, t) => s + (Number(t.effort_minutes) || 0), 0) / 60 * 100
  ) / 100
  const saldo = Math.round((previstas - apontadas) * 100) / 100
  const overTs = apontadas > previstas + 0.001
  const pctTs = previstas > 0 ? Math.min(100, Math.round((apontadas / previstas) * 100)) : 0
  // Consultor + atividade CONCLUÍDA + saldo positivo: não mostra Disponível/Saldo, só Apontadas.
  const hideBalance = user?.type === 'consultor' && deliveryStatus === 'done' && saldo >= 0

  // Reporta o resumo ao pai (o painel usa o saldo pra habilitar "devolver sobra ao banco").
  useEffect(() => {
    onSummary?.({ previstas, apontadas, saldo })
  }, [previstas, apontadas, saldo, onSummary])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Apontamentos desta atividade</span>
        <div style={{ display: 'inline-flex', gap: 6 }}>
          <button onClick={() => setExpenseOpen(true)} className="ds-btn-ghost" style={{ fontSize: 12, padding: '5px 10px', display: 'inline-flex', gap: 4, alignItems: 'center' }}><Receipt size={12} /> Despesa</button>
          <button onClick={() => (creating ? (setCreating(false), setEditingId(null)) : openForm())} className="ds-btn-primary" style={{ fontSize: 12, padding: '5px 10px', display: 'inline-flex', gap: 4, alignItems: 'center' }}><Plus size={12} /> Apontar</button>
        </div>
      </div>

      {/* Resumo do teto: horas disponíveis (previstas), apontadas e saldo. */}
      {showSummary && previstas > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 12, background: 'var(--surface)' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {!hideBalance && (
              <div style={{ flex: 1 }}>
                <div style={lbl}>Disponível</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{previstas}h</div>
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={lbl}>Apontadas</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{apontadas}h</div>
            </div>
            {!hideBalance && (
              <div style={{ flex: 1 }}>
                <div style={lbl}>Saldo</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: saldo < 0 ? 'var(--danger)' : 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>{saldo}h</div>
              </div>
            )}
          </div>
          {!hideBalance && (
            <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-hover)', overflow: 'hidden', marginTop: 8 }}>
              <div style={{ height: '100%', width: `${pctTs}%`, background: overTs ? 'var(--danger)' : pctTs > 85 ? 'var(--warning)' : 'var(--success)', transition: 'width .2s ease' }} />
            </div>
          )}
        </div>
      )}

      {creating && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Usuário — só consultores alocados na atividade. Admin/coord aponta pelo consultor. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={lbl}>Usuário (consultor alocado)</span>
              {canActAsUser && allocUsers.some(u => u.id === user?.id) && (
                <button type="button" onClick={() => setForm(f => ({ ...f, user_id: String(user?.id ?? '') }))}
                  style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 11, fontWeight: 500, padding: 0 }}>
                  → Colocar-me
                </button>
              )}
            </div>
            {canActAsUser ? (
              allocUsers.length === 0
                ? <span style={{ fontSize: 12, color: 'var(--text-light)' }}>Nenhum consultor alocado nesta atividade.</span>
                : <SearchSelect value={form.user_id} onChange={v => setForm(f => ({ ...f, user_id: v }))} options={allocUsers} placeholder="Selecione o consultor…" fullWidth />
            ) : (
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{user?.name}</span>
            )}
          </div>

          {/* Data */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 200 }}>
            <span style={lbl}>Data</span>
            <input type="date" className="ds-input" value={form.date} max={today()} onChange={e => setForm(s => ({ ...s, date: e.target.value }))} style={{ fontSize: 13, padding: '5px 8px' }} />
          </label>

          {/* Toggle Horário | Total de Horas */}
          <div>
            <div style={{ display: 'inline-flex', gap: 4, marginBottom: 6 }}>
              {(['time', 'total'] as const).map(m => (
                <button key={m} type="button" onClick={() => setForm(s => ({ ...s, mode: m }))}
                  className={form.mode === m ? 'ds-btn-primary' : 'ds-btn-ghost'}
                  style={{ fontSize: 12, padding: '4px 10px' }}>
                  {m === 'time' ? 'Horário' : 'Total de Horas'}
                </button>
              ))}
            </div>
            {form.mode === 'time' ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={lbl}>Início</span>
                  <input type="time" className="ds-input" value={form.start_time} onChange={e => setForm(s => ({ ...s, start_time: e.target.value }))} style={{ fontSize: 13, padding: '5px 8px' }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={lbl}>Fim</span>
                  <input type="time" className="ds-input" value={form.end_time} onChange={e => setForm(s => ({ ...s, end_time: e.target.value }))} style={{ fontSize: 13, padding: '5px 8px' }} />
                </label>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Mensagem padrão (mesma do apontamento tradicional) ao lançar por Total de Horas. */}
                <div style={{ borderRadius: 8, padding: '8px 10px', fontSize: 12, lineHeight: 1.5, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#F59E0B' }}>
                  <strong>Atenção:</strong> O lançamento por &quot;Total de Horas&quot; deve ser realizado em comum acordo com o coordenador responsável.
                </div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 160 }}>
                  <span style={lbl}>Total</span>
                  <input className="ds-input" value={form.total_hours} onChange={e => setForm(s => ({ ...s, total_hours: e.target.value }))} placeholder="ex: 2:30 ou 2,5" style={{ fontSize: 13, padding: '5px 8px' }} />
                </label>
              </div>
            )}
          </div>

          {/* Observação — OBRIGATÓRIA */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={lbl}>Observação <span style={{ color: 'var(--danger)' }}>*</span></span>
            <textarea className="ds-input" value={form.observation} onChange={e => setForm(s => ({ ...s, observation: e.target.value }))} placeholder="Descreva as atividades realizadas…" rows={2} style={{ width: '100%', padding: 8, resize: 'vertical', fontSize: 13 }} />
          </label>

          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => { setCreating(false); setEditingId(null) }} className="ds-btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}>Cancelar</button>
            <button onClick={save} disabled={busy} className="ds-btn-primary" style={{ fontSize: 12, padding: '5px 12px' }}>{busy ? '…' : 'Salvar'}</button>
          </div>
        </div>
      )}

      {loading ? <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Carregando…</p>
        : loadError ? (
          <div style={{ fontSize: 12, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>{loadError}</span>
            <button onClick={() => load()} className="ds-btn-ghost" style={{ fontSize: 12, padding: '3px 8px' }}>Tentar de novo</button>
          </div>
        )
        : items.length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-light)' }}>Nenhum apontamento nesta atividade.</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(t => {
                const st = STATUS_STYLE[t.status] ?? { bg: 'var(--surface-hover)', color: 'var(--text-muted)' }
                return (
                  <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.effort_hours}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtBR(t.date)}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {t.user?.name ?? '—'}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 6, background: st.bg, color: st.color, marginLeft: 'auto' }}>{t.status_display}</span>
                    </div>
                    {t.observation && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{t.observation}</div>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {canApprove && t.status === 'pending' && (
                        <>
                          <button onClick={() => approve(t.id)} title="Aprovar" style={actBtn('var(--success)')}><Check size={12} /> Aprovar</button>
                          <button onClick={() => requestAdjustment(t.id)} title="Solicitar ajuste" style={actBtn('var(--warning)')}><Edit3 size={12} /> Ajuste</button>
                          <button onClick={() => reject(t.id)} title="Rejeitar" style={actBtn('var(--danger)')}><XCircle size={12} /> Rejeitar</button>
                        </>
                      )}
                      {/* Estornar: desfaz aprovação/rejeição/ajuste → volta a pendente. */}
                      {canApprove && ['approved', 'rejected', 'adjustment_requested'].includes(t.status) && (
                        <button onClick={() => estornar(t)} title="Estornar (voltar a pendente)" style={actBtn('var(--info)')}><RotateCcw size={12} /> Estornar</button>
                      )}
                      {editable(t.status) && (
                        <button onClick={() => openEdit(t)} title="Editar apontamento" style={actBtn('var(--text-muted)')}><Pencil size={12} /> Editar</button>
                      )}
                      {editable(t.status) && (
                        <button onClick={() => remove(t.id)} title="Excluir" style={{ ...actBtn('var(--text-muted)'), marginLeft: 'auto' }}><Trash2 size={12} /></button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
      <ExpenseQuickModal
        open={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        onSaved={() => { setExpenseOpen(false); load() }}
        currentUser={user}
      />
    </div>
  )
}

function actBtn(color: string): React.CSSProperties {
  return { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: `1px solid ${color}`, color }
}
