'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { Plus, X, Calendar, AlertTriangle, LayoutGrid, List, Paperclip, Send } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { SearchSelect } from '@/components/ui/search-select'
import { HolidayDatePicker } from '@/components/ui/holiday-date-picker'
import { EntityAttachmentsPanel } from '@/components/attachments/EntityAttachmentsPanel'
import {
  FollowUp, FollowUpEvent, FU_STATUS_LABEL, FU_PRIORITY_LABEL, FU_CATEGORY_LABEL,
  FU_KANBAN_COLUMNS, fuColumnOf, type FollowUpStatus,
} from '@/lib/types/follow-up'

/** Vínculo/escopo do board (filtra a lista/summary e prefilla a criação). */
export interface FollowUpScope {
  project_id?: number
  stage_id?: number
  delivery_id?: number
  contract_id?: number
  customer_id?: number
}

const STATUS_STYLE: Record<FollowUpStatus, { bg: string; color: string }> = {
  pending:       { bg: 'var(--warning-bg)', color: 'var(--warning)' },
  in_progress:   { bg: 'var(--info-bg)', color: 'var(--info)' },
  waiting_third: { bg: 'rgba(139,92,246,.14)', color: '#8b5cf6' },
  completed:     { bg: 'var(--success-bg)', color: 'var(--success)' },
  cancelled:     { bg: 'var(--surface-hover)', color: 'var(--text-muted)' },
}
const PRIORITY_COLOR: Record<string, string> = { baixa: 'var(--text-muted)', media: 'var(--warning)', alta: '#f97316', critica: 'var(--danger)' }

function fmtBR(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}/${m}/${y.slice(2)}`
}
const scopeQS = (s?: FollowUpScope) => {
  const q = new URLSearchParams()
  if (s?.project_id) q.set('project_id', String(s.project_id))
  if (s?.stage_id) q.set('stage_id', String(s.stage_id))
  if (s?.delivery_id) q.set('delivery_id', String(s.delivery_id))
  if (s?.contract_id) q.set('contract_id', String(s.contract_id))
  if (s?.customer_id) q.set('customer_id', String(s.customer_id))
  return q
}

export function FollowUpsBoard({ scope, originDefaults, requireCompany, embedded, onCountChange }: {
  /** Filtra a lista/summary (aba do projeto/etapa/atividade). */
  scope?: FollowUpScope
  /** Vínculo herdado na criação (ex.: delivery_id da atividade). Trava os pickers. */
  originDefaults?: FollowUpScope
  /** Central global: exige ao menos Empresa e mostra pickers de vínculo. */
  requireCompany?: boolean
  /** Estilo compacto (dentro de aba/drawer, sem padding de página). */
  embedded?: boolean
  /** Notifica o total (pra atualizar contadores externos). */
  onCountChange?: (total: number) => void
}) {
  const [view, setView] = useState<'kanban' | 'lista'>('kanban')
  const [items, setItems] = useState<FollowUp[]>([])
  const [summary, setSummary] = useState<Record<string, number> | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<FollowUp | null>(null)

  const [userOpts, setUserOpts] = useState<{ id: number; name: string }[]>([])
  const [categoryOpts, setCategoryOpts] = useState<{ id: string; name: string }[]>([])
  const [clienteOpts, setClienteOpts] = useState<{ id: number; name: string }[]>([])
  const [customerOpts, setCustomerOpts] = useState<{ id: number; name: string }[]>([])
  const [projectOpts, setProjectOpts] = useState<{ id: number; name: string }[]>([])
  const [contractOpts, setContractOpts] = useState<{ id: number; name: string }[]>([])
  const [stageOpts, setStageOpts] = useState<{ id: number; name: string }[]>([])
  const [deliveryOpts, setDeliveryOpts] = useState<{ id: number; name: string }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = scopeQS(scope); qs.set('pageSize', '500')
      if (search) qs.set('search', search)
      const [r, s] = await Promise.all([
        api.get<{ items: FollowUp[] }>(`/follow-ups?${qs}`),
        api.get<Record<string, number>>(`/follow-ups/summary?${scopeQS(scope)}`).catch(() => null),
      ])
      setItems(r.items ?? [])
      setSummary(s)
      onCountChange?.((r.items ?? []).length)
    } catch { toast.error('Erro ao carregar Follow Ups') }
    finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, scope?.project_id, scope?.stage_id, scope?.delivery_id, scope?.contract_id, scope?.customer_id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const pick = (r: any) => Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
    Promise.all([
      api.get<any>('/users?type=consultor,coordenador&minimal=true&pageSize=500').catch(() => null),
      api.get<any>('/executives?pageSize=200').catch(() => null),
      api.get<any>('/users?type=cliente&minimal=true&pageSize=500').catch(() => null),
      requireCompany ? api.get<any>('/customers?pageSize=500').catch(() => null) : Promise.resolve(null),
      requireCompany ? api.get<any>('/projects?pageSize=500').catch(() => null) : Promise.resolve(null),
      requireCompany ? api.get<any>('/contracts?pageSize=500').catch(() => null) : Promise.resolve(null),
    ]).then(([u, e, cl, c, p, ct]) => {
      const byId = new Map<number, { id: number; name: string }>()
      for (const x of [...pick(u), ...pick(e)]) if (x?.id && x?.name && !byId.has(x.id)) byId.set(x.id, { id: x.id, name: x.name })
      setUserOpts([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)))
      setClienteOpts(pick(cl).filter((x: any) => x?.id && x?.name).map((x: any) => ({ id: x.id, name: x.name })).sort((a: any, b: any) => a.name.localeCompare(b.name)))
      setCustomerOpts(pick(c).filter((x: any) => x?.id).map((x: any) => ({ id: x.id, name: x.name })))
      setProjectOpts(pick(p).filter((x: any) => x?.id).map((x: any) => ({ id: x.id, name: x.code ? `${x.name} (${x.code})` : x.name })))
      setContractOpts(pick(ct).filter((x: any) => x?.id).map((x: any) => ({ id: x.id, name: x.code ?? x.title ?? `Contrato #${x.id}` })))
    })
  }, [requireCompany])

  // Time da atividade (consultores alocados) — opções do "Envolver consultor".
  const [teamOpts, setTeamOpts] = useState<{ id: number; name: string }[]>([])
  const ctxDeliveryId = scope?.delivery_id ?? originDefaults?.delivery_id ?? null
  useEffect(() => {
    if (!ctxDeliveryId) { setTeamOpts([]); return }
    api.get<any>(`/activities/${ctxDeliveryId}/allocations`).then(r => {
      const its = Array.isArray(r?.items) ? r.items : []
      const m = new Map<number, { id: number; name: string }>()
      for (const a of its) if (a?.user?.id && a?.user?.name) m.set(a.user.id, { id: a.user.id, name: a.user.name })
      setTeamOpts([...m.values()].sort((a, b) => a.name.localeCompare(b.name)))
    }).catch(() => setTeamOpts([]))
  }, [ctxDeliveryId])

  // Com contexto de projeto (aba/atividade): o seletor de cliente só traz os
  // clientes do MESMO customer do projeto (não vaza cliente de outro customer).
  const ctxProjectId = scope?.project_id ?? originDefaults?.project_id ?? null
  useEffect(() => {
    if (!ctxProjectId) return
    let cancel = false
    const pick = (r: any) => Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
    ;(async () => {
      try {
        const proj = await api.get<any>(`/projects/${ctxProjectId}`)
        const cid = proj?.customer?.id ?? proj?.customer_id
        const r = await api.get<any>(`/users?type=cliente&minimal=true&pageSize=500${cid ? `&customer_id=${cid}` : ''}`)
        if (cancel) return
        setClienteOpts(pick(r).filter((x: any) => x?.id && x?.name).map((x: any) => ({ id: x.id, name: x.name })).sort((a: any, b: any) => a.name.localeCompare(b.name)))
      } catch { /* mantém a lista geral */ }
    })()
    return () => { cancel = true }
  }, [ctxProjectId])

  // Categorias vêm do cadastro (gerenciável). Valor = nome da categoria.
  useEffect(() => {
    api.get<any>('/follow-up-categories?pageSize=200').then(r => {
      const items: any[] = Array.isArray(r?.items) ? r.items : []
      setCategoryOpts(items.filter(c => c.is_active).map(c => ({ id: c.name, name: c.name })))
    }).catch(() => {})
  }, [])

  // No contexto de projeto (aba), carrega etapas/atividades pra escolher o nível do vínculo.
  useEffect(() => {
    const pid = originDefaults?.project_id
    if (!pid || originDefaults?.delivery_id || originDefaults?.stage_id) return
    api.get<any>(`/projects/${pid}/schedule`).then(r => {
      const stages: any[] = r?.stages ?? []
      setStageOpts(stages.map(s => ({ id: s.id, name: s.name })))
      setDeliveryOpts(stages.flatMap(s => (s.deliveries ?? []).map((d: any) => ({ id: d.id, name: `${s.name} · ${d.title}` }))))
    }).catch(() => {})
  }, [originDefaults?.project_id, originDefaults?.delivery_id, originDefaults?.stage_id])

  const byColumn = useMemo(() => {
    const m: Record<string, FollowUp[]> = {}
    for (const c of FU_KANBAN_COLUMNS) m[c.key] = []
    for (const f of items) (m[fuColumnOf(f)] ??= []).push(f)
    for (const k of Object.keys(m)) m[k].sort((a, b) => (a.kanban_order - b.kanban_order) || a.id - b.id)
    return m
  }, [items])

  async function onDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result
    if (!destination || (source.droppableId === destination.droppableId && source.index === destination.index)) return
    const id = Number(draggableId); const toCol = destination.droppableId
    setItems(prev => prev.map(f => f.id === id ? applyColumn(f, toCol) : f))
    try {
      const updated = await api.patch<FollowUp>(`/follow-ups/${id}/kanban-move`, { to_column: toCol, order: destination.index })
      setItems(prev => prev.map(f => f.id === id ? { ...f, ...updated } : f))
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao mover'); load() }
  }

  const ind = summary

  return (
    <div style={{ padding: embedded ? 0 : 16 }}>
      {/* Indicadores (Acompanhamento = Aberto/Concluído) */}
      {ind && (() => {
        const abertos = (ind.pendentes ?? 0) + (ind.em_andamento ?? 0) + (ind.aguardando_cliente ?? 0) + (ind.aguardando_parceiro ?? 0)
        const total = abertos + (ind.concluidos ?? 0)
        return (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Indicator label="Acompanhamentos" value={total} />
            <Indicator label="Abertos" value={abertos} color="var(--warning)" />
            <Indicator label="Vencidos" value={ind.atrasados ?? 0} color="var(--danger)" />
            <Indicator label="Concluídos" value={ind.concluidos ?? 0} color="var(--success)" />
          </div>
        )
      })()}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input className="ds-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…" style={{ maxWidth: 260, fontSize: 13, padding: '6px 10px' }} />
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginLeft: 'auto' }}>
          <button onClick={() => setView('kanban')} className="ds-btn-ghost" style={tabBtn(view === 'kanban')}><LayoutGrid size={13} /> Kanban</button>
          <button onClick={() => setView('lista')} className="ds-btn-ghost" style={tabBtn(view === 'lista')}><List size={13} /> Lista</button>
        </div>
        <button onClick={() => setCreating(true)} className="ds-btn-primary" style={{ fontSize: 13, padding: '6px 14px', display: 'inline-flex', gap: 6, alignItems: 'center' }}><Plus size={14} /> Criar Follow Up</button>
      </div>

      {loading ? <div style={{ color: 'var(--text-muted)', padding: 24 }}>Carregando…</div>
        : view === 'kanban' ? (
          <DragDropContext onDragEnd={onDragEnd}>
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
              {FU_KANBAN_COLUMNS.map(col => (
                <Droppable droppableId={col.key} key={col.key}>
                  {(prov) => (
                    <div ref={prov.innerRef} {...prov.droppableProps} style={{ minWidth: 230, width: 230, flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '4px 6px 8px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{col.label}</span><span>{byColumn[col.key]?.length ?? 0}</span>
                      </div>
                      {(byColumn[col.key] ?? []).map((f, i) => (
                        <Draggable draggableId={String(f.id)} index={i} key={f.id}>
                          {(dp) => (
                            <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps} onClick={() => setSelected(f)}
                              style={{ ...dp.draggableProps.style, background: 'var(--bg)', border: '1px solid var(--border)', borderLeft: `3px solid ${PRIORITY_COLOR[f.priority]}`, borderRadius: 8, padding: 10, marginBottom: 8, cursor: 'pointer' }}>
                              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, marginBottom: 6 }}>{f.title}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: f.is_overdue ? 'var(--danger)' : 'var(--text-muted)' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Calendar size={11} /> {fmtBR(f.due_date)}{f.is_overdue && <AlertTriangle size={11} />}</span>
                                {f.responsible?.name && <span>· {f.responsible.name.split(' ')[0]}</span>}
                              </div>
                              {!scope?.delivery_id && (f.project?.name || f.customer?.name) && <div style={{ fontSize: 10, color: 'var(--text-light)', marginTop: 4 }}>{f.project?.name ?? f.customer?.name}</div>}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {prov.placeholder}
                    </div>
                  )}
                </Droppable>
              ))}
            </div>
          </DragDropContext>
        ) : (
          <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: 'var(--surface-hover)', textAlign: 'left' }}>
                {['Título', 'Status', 'Prioridade', 'Consultor', 'Prazo', 'Origem'].map(h => <th key={h} style={{ padding: '8px 12px', fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {items.length === 0 ? <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum Follow Up</td></tr>
                  : items.map(f => (
                    <tr key={f.id} onClick={() => setSelected(f)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                      <td style={{ padding: '8px 12px', color: 'var(--text)' }}>{f.title}</td>
                      <td style={{ padding: '8px 12px' }}><StatusBadge status={f.status} /></td>
                      <td style={{ padding: '8px 12px', color: PRIORITY_COLOR[f.priority], fontWeight: 500 }}>{FU_PRIORITY_LABEL[f.priority]}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{f.responsible?.name ?? '—'}</td>
                      <td style={{ padding: '8px 12px', color: f.is_overdue ? 'var(--danger)' : 'var(--text-muted)' }}>{fmtBR(f.due_date)}{f.is_overdue && ' ⚠'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-light)' }}>{f.delivery?.title ?? f.project?.name ?? f.customer?.name ?? '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

      {creating && (
        <FollowUpForm userOpts={userOpts} teamOpts={teamOpts} clienteOpts={clienteOpts} customerOpts={customerOpts} projectOpts={projectOpts} contractOpts={contractOpts}
          categoryOpts={categoryOpts} stageOpts={stageOpts} deliveryOpts={deliveryOpts}
          originDefaults={originDefaults} requireCompany={requireCompany}
          onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load() }} />
      )}
      {selected && (
        <FollowUpDetail followUp={selected} userOpts={userOpts} clienteOpts={clienteOpts}
          onClose={() => setSelected(null)} onChanged={() => load()} />
      )}
    </div>
  )
}

function Indicator({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', minWidth: 92, background: 'var(--surface)' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? 'var(--text)' }}>{value ?? 0}</div>
    </div>
  )
}
function tabBtn(active: boolean): React.CSSProperties {
  return { padding: '6px 10px', fontSize: 12, display: 'inline-flex', gap: 5, alignItems: 'center', color: active ? 'var(--primary)' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }
}
function applyColumn(f: FollowUp, col: string): FollowUp {
  const map: Record<string, [FollowUpStatus, FollowUp['waiting_subtype']]> = {
    pending: ['pending', null], in_progress: ['in_progress', null],
    waiting_client: ['waiting_third', 'client'], waiting_partner: ['waiting_third', 'partner'],
    completed: ['completed', null], cancelled: ['cancelled', null],
  }
  const [status, sub] = map[col] ?? ['pending', null]
  return { ...f, status, waiting_subtype: sub, status_display: FU_STATUS_LABEL[status] }
}
function StatusBadge({ status }: { status: FollowUpStatus }) {
  const s = STATUS_STYLE[status]
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: s.bg, color: s.color }}>{FU_STATUS_LABEL[status]}</span>
}

// ─── Form de criação ───────────────────────────────────────────────────────
function FollowUpForm({ userOpts, teamOpts, clienteOpts, customerOpts, projectOpts, contractOpts, categoryOpts, stageOpts, deliveryOpts, originDefaults, requireCompany, onClose, onCreated }: {
  userOpts: { id: number; name: string }[]; teamOpts: { id: number; name: string }[]; clienteOpts: { id: number; name: string }[]; customerOpts: { id: number; name: string }[]; projectOpts: { id: number; name: string }[]; contractOpts: { id: number; name: string }[]
  categoryOpts: { id: string; name: string }[]; stageOpts: { id: number; name: string }[]; deliveryOpts: { id: number; name: string }[]
  originDefaults?: FollowUpScope; requireCompany?: boolean; onClose: () => void; onCreated: () => void
}) {
  const [f, setF] = useState({ title: '', description: '', category: '', priority: 'media', due_date: null as string | null, responsible_user_id: '', requester_user_id: '', customer_id: '', contract_id: '', project_id: '', client_involved: false, client_user_id: '', client_email: '' })
  // "Envolver consultor" reaproveita responsible_user_id (o consultor envolvido vê/participa).
  const [consultorInvolved, setConsultorInvolved] = useState(false)
  const [saving, setSaving] = useState(false)
  const hasOrigin = !!originDefaults
  const fixedDeep = !!originDefaults?.delivery_id || !!originDefaults?.stage_id // veio da atividade/etapa (nível fixo)
  const projectContext = !!originDefaults?.project_id && !fixedDeep            // aba do projeto: escolhe o nível
  // Nível do vínculo dentro do projeto: projeto inteiro / etapa / atividade.
  const [level, setLevel] = useState<'project' | 'stage' | 'activity'>('project')
  const [linkStageId, setLinkStageId] = useState('')
  const [linkDeliveryId, setLinkDeliveryId] = useState('')

  async function save() {
    if (!f.title.trim()) { toast.error('Informe o título'); return }
    if (requireCompany && !originDefaults && !f.customer_id && !f.project_id && !f.contract_id) { toast.error('Vincule a Empresa, Contrato ou Projeto'); return }
    if (projectContext && level === 'stage' && !linkStageId) { toast.error('Escolha a etapa'); return }
    if (projectContext && level === 'activity' && !linkDeliveryId) { toast.error('Escolha a atividade'); return }
    setSaving(true)
    try {
      const body: Record<string, unknown> = { title: f.title.trim(), description: f.description || null, category: f.category, priority: f.priority, due_date: f.due_date, ...(originDefaults ?? {}) }
      // "__all__" = todos os consultores da atividade veem (via vínculo); sem responsável específico.
      if (f.responsible_user_id && f.responsible_user_id !== '__all__') body.responsible_user_id = Number(f.responsible_user_id)
      if (f.requester_user_id) body.requester_user_id = Number(f.requester_user_id)
      if (f.client_involved) {
        body.client_involved = true
        if (f.client_user_id) body.client_user_id = Number(f.client_user_id)
        if (f.client_email.trim()) body.client_email = f.client_email.trim()
      }
      // Nível escolhido na aba do projeto (BE denormaliza os pais; o mais profundo vence).
      if (projectContext) {
        if (level === 'stage') body.stage_id = Number(linkStageId)
        if (level === 'activity') body.delivery_id = Number(linkDeliveryId)
      }
      if (!hasOrigin) {
        if (f.customer_id) body.customer_id = Number(f.customer_id)
        if (f.contract_id) body.contract_id = Number(f.contract_id)
        if (f.project_id) body.project_id = Number(f.project_id)
      }
      await api.post('/follow-ups', body)
      toast.success('Follow Up criado'); onCreated()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao criar') }
    finally { setSaving(false) }
  }

  return (
    <Overlay onClose={onClose} title="Novo Follow Up">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {fixedDeep && <div style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-hover)', borderRadius: 6, padding: '6px 10px' }}>Vinculado à execução do projeto.</div>}
        {projectContext && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Field label="Vincular a">
              <SearchSelect value={level} onChange={v => setLevel((v as 'project' | 'stage' | 'activity') || 'project')}
                options={[{ id: 'project', name: 'Projeto inteiro' }, { id: 'stage', name: 'Uma etapa' }, { id: 'activity', name: 'Uma atividade' }]} placeholder="—" />
            </Field>
            {level === 'stage' && <Field label="Etapa"><SearchSelect value={linkStageId} onChange={setLinkStageId} options={stageOpts} placeholder="Escolher etapa…" fullWidth /></Field>}
            {level === 'activity' && <Field label="Atividade"><SearchSelect value={linkDeliveryId} onChange={setLinkDeliveryId} options={deliveryOpts} placeholder="Escolher atividade…" fullWidth /></Field>}
          </div>
        )}
        <Field label="Título"><input autoFocus className="ds-input" value={f.title} onChange={e => setF(s => ({ ...s, title: e.target.value }))} style={inp} placeholder="Ex: Cliente validar plano de contas" /></Field>
        <Field label="Descrição"><textarea className="ds-input" value={f.description} onChange={e => setF(s => ({ ...s, description: e.target.value }))} style={{ ...inp, minHeight: 64, resize: 'vertical' }} /></Field>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Field label="Categoria"><SearchSelect value={f.category} onChange={v => setF(s => ({ ...s, category: v }))} options={categoryOpts} placeholder="—" /></Field>
          <Field label="Prioridade"><SearchSelect value={f.priority} onChange={v => setF(s => ({ ...s, priority: v }))} options={Object.entries(FU_PRIORITY_LABEL).map(([id, name]) => ({ id, name }))} placeholder="—" /></Field>
          <Field label="Prazo"><HolidayDatePicker value={f.due_date} onChange={v => setF(s => ({ ...s, due_date: v }))} placeholder="Definir" /></Field>
        </div>
        {/* Envolver consultor: o consultor escolhido vê/participa do Follow Up. */}
        <div>
          <button type="button" onClick={() => { const next = !consultorInvolved; setConsultorInvolved(next); if (!next) setF(s => ({ ...s, responsible_user_id: '' })) }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, color: 'var(--text)' }}>
            <span style={{ width: 34, height: 18, borderRadius: 10, background: consultorInvolved ? 'var(--primary)' : 'var(--border)', position: 'relative', transition: 'background .15s' }}>
              <span style={{ position: 'absolute', top: 2, left: consultorInvolved ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
            </span>
            Envolver consultor
          </button>
          {consultorInvolved && (
            <div style={{ marginTop: 8 }}>
              <Field label="Consultor">
                <SearchSelect
                  value={f.responsible_user_id}
                  onChange={v => setF(s => ({ ...s, responsible_user_id: v }))}
                  options={originDefaults?.delivery_id
                    ? [{ id: '__all__', name: 'Todos os consultores da atividade' }, ...teamOpts]
                    : userOpts}
                  placeholder={originDefaults?.delivery_id ? 'Consultor da atividade…' : '—'}
                  fullWidth
                />
              </Field>
              {originDefaults?.delivery_id && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Só consultores envolvidos na atividade. "Todos" = toda a equipe da atividade vê.</div>
              )}
            </div>
          )}
        </div>
        {/* Quem participa: envolver cliente. Sem cliente envolvido, nenhum cliente vê comentários/anexos. */}
        <div>
          <button type="button" onClick={() => setF(s => ({ ...s, client_involved: !s.client_involved }))}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, color: 'var(--text)' }}>
            <span style={{ width: 34, height: 18, borderRadius: 10, background: f.client_involved ? 'var(--primary)' : 'var(--border)', position: 'relative', transition: 'background .15s' }}>
              <span style={{ position: 'absolute', top: 2, left: f.client_involved ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
            </span>
            Envolver cliente
          </button>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Sem cliente envolvido, o cliente não vê comentários nem anexos.</div>
          {f.client_involved && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              <Field label="Cliente"><SearchSelect value={f.client_user_id} onChange={v => setF(s => ({ ...s, client_user_id: v }))} options={clienteOpts} placeholder="cadastrado…" fullWidth /></Field>
              <Field label="ou e-mail externo"><input className="ds-input" type="email" value={f.client_email} onChange={e => setF(s => ({ ...s, client_email: e.target.value }))} style={inp} placeholder="cliente@empresa.com" /></Field>
            </div>
          )}
        </div>
        {!hasOrigin && requireCompany && (
          <>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '.04em' }}>Vínculo (ao menos um)</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Field label="Empresa"><SearchSelect value={f.customer_id} onChange={v => setF(s => ({ ...s, customer_id: v }))} options={customerOpts} placeholder="—" fullWidth /></Field>
              <Field label="Contrato"><SearchSelect value={f.contract_id} onChange={v => setF(s => ({ ...s, contract_id: v }))} options={contractOpts} placeholder="—" fullWidth /></Field>
              <Field label="Projeto"><SearchSelect value={f.project_id} onChange={v => setF(s => ({ ...s, project_id: v }))} options={projectOpts} placeholder="—" fullWidth /></Field>
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} className="ds-btn-ghost" style={{ fontSize: 13, padding: '8px 14px' }}>Cancelar</button>
          <button onClick={save} disabled={saving || !f.title.trim()} className="ds-btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}>{saving ? '…' : 'Criar'}</button>
        </div>
      </div>
    </Overlay>
  )
}

// ─── Detalhe (Conversa + Anexos) ─────────────────────────────────────────────
function FollowUpDetail({ followUp, userOpts, clienteOpts, onClose, onChanged }: {
  followUp: FollowUp; userOpts: { id: number; name: string }[]; clienteOpts: { id: number; name: string }[]; onClose: () => void; onChanged: () => void
}) {
  const [f, setF] = useState(followUp)
  const [tab, setTab] = useState<'conversa' | 'anexos'>('conversa')

  async function patch(field: string, value: unknown) {
    try {
      const updated = await api.patch<FollowUp>(`/follow-ups/${f.id}`, { [field]: value })
      setF(prev => ({ ...prev, ...updated })); onChanged()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
  }
  async function patchMany(fields: Record<string, unknown>) {
    try {
      const updated = await api.patch<FollowUp>(`/follow-ups/${f.id}`, fields)
      setF(prev => ({ ...prev, ...updated })); onChanged()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar') }
  }

  return (
    <Overlay onClose={onClose} title={f.title} wide>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Field label="Status"><SearchSelect value={f.status === 'completed' ? 'completed' : 'pending'} onChange={v => patch('status', v)} options={[{ id: 'pending', name: 'Aberto' }, { id: 'completed', name: 'Concluído' }]} placeholder="—" /></Field>
        <Field label="Prioridade"><SearchSelect value={f.priority} onChange={v => patch('priority', v)} options={Object.entries(FU_PRIORITY_LABEL).map(([id, name]) => ({ id, name }))} placeholder="—" /></Field>
        <Field label="Consultor envolvido"><SearchSelect value={f.responsible_user_id ? String(f.responsible_user_id) : ''} onChange={v => patch('responsible_user_id', v ? Number(v) : null)} options={userOpts} placeholder="—" fullWidth /></Field>
        <Field label="Prazo"><HolidayDatePicker value={f.due_date} onChange={v => patch('due_date', v)} placeholder="Definir" /></Field>
      </div>
      {f.description && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px' }}>{f.description}</p>}

      {/* Cliente envolvido (quem participa) */}
      <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: f.client_involved ? 'var(--info-bg)' : 'var(--surface-hover)', border: `1px solid ${f.client_involved ? 'var(--info)' : 'var(--border)'}` }}>
        <button type="button" onClick={() => patchMany(f.client_involved ? { client_involved: false, client_user_id: null } : { client_involved: true })}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, color: 'var(--text)' }}>
          <span style={{ width: 34, height: 18, borderRadius: 10, background: f.client_involved ? 'var(--info)' : 'var(--border)', position: 'relative' }}>
            <span style={{ position: 'absolute', top: 2, left: f.client_involved ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff' }} />
          </span>
          Cliente envolvido {f.client_involved ? '— vê comentários e anexos' : '— interno (cliente não vê nada)'}
        </button>
        {f.client_involved && (
          <div style={{ marginTop: 8 }}>
            <Field label="Cliente"><SearchSelect value={f.client_user_id ? String(f.client_user_id) : ''} onChange={v => patch('client_user_id', v ? Number(v) : null)} options={clienteOpts} placeholder="cadastrado…" fullWidth /></Field>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
        {(['conversa', 'anexos'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className="ds-btn-ghost" style={{ fontSize: 12, padding: '8px 10px', borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1, color: tab === t ? 'var(--primary)' : 'var(--text-muted)', fontWeight: tab === t ? 600 : 400, textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>

      {tab === 'conversa' ? <FollowUpTimeline followUpId={f.id} />
        : <EntityAttachmentsPanel entityType="FOLLOW_UP" entityId={f.id} category="document" title="Anexos" maxMb={25} />}
    </Overlay>
  )
}

function FollowUpTimeline({ followUpId }: { followUpId: number }) {
  const [events, setEvents] = useState<FollowUpEvent[]>([])
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    try { const r = await api.get<{ items: FollowUpEvent[] }>(`/follow-ups/${followUpId}/activity`); setEvents(r.items ?? []) } catch { /* */ }
  }, [followUpId])
  useEffect(() => { load() }, [load])

  async function send() {
    if (!text.trim() && !file) return
    setSending(true)
    try {
      const fd = new FormData()
      if (text.trim()) fd.append('text', text.trim())
      if (file) fd.append('attachment', file)
      await api.post(`/follow-ups/${followUpId}/comments`, fd)
      setText(''); setFile(null); load()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro ao comentar') }
    finally { setSending(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input className="ds-input" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }} placeholder="Comentar…" style={{ flex: 1, fontSize: 13, padding: '6px 10px' }} />
        <label className="ds-btn-ghost" style={{ fontSize: 12, padding: '6px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }} title="Anexar"><Paperclip size={14} /><input type="file" hidden onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
        <button onClick={send} disabled={sending || (!text.trim() && !file)} className="ds-btn-primary" style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Send size={13} /></button>
      </div>
      {file && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{file.name} <button onClick={() => setFile(null)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>remover</button></div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.map(ev => <EventRow key={ev.id} ev={ev} />)}
        {events.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-light)' }}>Sem atividade ainda.</p>}
      </div>
    </div>
  )
}

function EventRow({ ev }: { ev: FollowUpEvent }) {
  const who = ev.actor?.name ?? 'Sistema'
  const when = fmtBR(ev.created_at) + ' ' + ev.created_at.slice(11, 16)
  const text = (ev.payload?.text as string) || null
  const label = ev.type === 'comment' ? null : describe(ev)
  return (
    <div style={{ fontSize: 12, color: 'var(--text)', borderLeft: '2px solid var(--border)', paddingLeft: 10 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{who} · {when}</div>
      {label && <div style={{ color: 'var(--text-muted)' }}>{label}</div>}
      {text && <div style={{ marginTop: 2 }}>{text}</div>}
      {ev.attachment_original_name && <div style={{ marginTop: 2 }}><Paperclip size={11} /> {ev.attachment_original_name}</div>}
    </div>
  )
}
function describe(ev: FollowUpEvent): string {
  const p = ev.payload ?? {}
  switch (ev.type) {
    case 'created': return 'criou o Follow Up'
    case 'status_changed': return `mudou status: ${FU_STATUS_LABEL[p.from as FollowUpStatus] ?? p.from} → ${FU_STATUS_LABEL[p.to as FollowUpStatus] ?? p.to}`
    case 'waiting_set': return `marcou Aguardando (${p.subtype ?? '—'})`
    case 'waiting_cleared': return 'retomou (saiu de Aguardando)'
    case 'concluded': return 'concluiu'
    case 'reopened': return 'reabriu'
    case 'reassigned': return 'mudou o responsável'
    case 'deadline_changed': return `mudou o prazo: ${p.from ?? '—'} → ${p.to ?? '—'}`
    default: return ev.type
  }
}

// ─── primitives ──────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: '100%', fontSize: 13, padding: '6px 10px' }
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 150px' }}><span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '.04em' }}>{label}</span>{children}</label>
}
function Overlay({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: wide ? 640 : 520, maxWidth: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
