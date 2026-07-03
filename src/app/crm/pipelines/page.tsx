'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { useAsyncAction } from '@/hooks/use-async-action'
import { GitBranch, Plus, Trash2, Lock, Unlock, GripVertical, Trophy, XCircle, Flag, Zap, X, Archive, Copy, History } from 'lucide-react'

const AUTO_TIPOS: { k: string; l: string }[] = [
  { k: 'criar_tarefa', l: 'Criar tarefa / follow-up' },
  { k: 'alterar_status_empresa', l: 'Alterar status da empresa' },
  { k: 'enviar_email', l: 'Enviar e-mail' },
  { k: 'notificar', l: 'Notificar (timeline)' },
  { k: 'gerar_proposta', l: 'Gerar proposta (rascunho)' },
  { k: 'gerar_contrato', l: 'Sinalizar contrato (semi-auto)' },
  { k: 'webhook', l: 'Webhook' },
]
const CRM_STATUS_OPTS = ['lead', 'prospect', 'cliente', 'em_renovacao', 'inativo']

interface Stage {
  id: number; name: string; ordem: number; cor: string | null; probabilidade: number | null; sla_dias: number | null
  is_won: boolean; is_lost: boolean; is_inicial: boolean; ativa: boolean; oportunidades_count: number
  regras: string[] | null
}
const REGRAS: { k: string; l: string }[] = [
  { k: 'produto', l: 'Produto' }, { k: 'valor', l: 'Valor' }, { k: 'responsavel', l: 'Responsável' },
  { k: 'proxima_acao', l: 'Próxima ação' }, { k: 'contato', l: 'Contato' },
]
interface Pipeline {
  id: number; name: string; descricao: string | null; cor: string | null; active: boolean; bloqueado: boolean; arquivado: boolean; tipo: string; tipos_empresa: string[] | null; stages: Stage[]
}

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }

// Tipos de empresa (crm_status) que um pipeline pode trabalhar. Nenhum selecionado = todos.
const TIPOS_EMPRESA: { v: string; label: string }[] = [
  { v: 'lead', label: 'Lead' },
  { v: 'prospect', label: 'Prospect' },
  { v: 'cliente', label: 'Cliente' },
  { v: 'em_renovacao', label: 'Em renovação' },
  { v: 'inativo', label: 'Inativo' },
]

export default function CrmPipelinesPage() {
  const [pipes, setPipes] = useState<Pipeline[]>([])
  const [selId, setSelId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoStage, setAutoStage] = useState<Stage | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)

  const load = useCallback((keep?: number) => {
    api.get<{ data: Pipeline[] }>('/crm/pipelines/manage')
      .then(r => { const d = r?.data ?? []; setPipes(d); setSelId(keep ?? (id => id ?? d[0]?.id ?? null)(selId)) })
      .catch((e: any) => { if (e?.status === 403) setForbidden(true); else toast.error('Erro ao carregar') }).finally(() => setLoading(false))
  }, [selId])
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sel = pipes.find(p => p.id === selId) ?? null

  // Ações únicas — useAsyncAction trava concorrência (sem duplo-clique). Recarrega p/ mostrar o novo.
  const duplicateAction = useAsyncAction(async () => {
    if (!sel) return
    const r = await api.post<{ data: Pipeline }>(`/crm/pipelines/${sel.id}/duplicate`, {}); await load(r.data.id); toast.success('Pipeline duplicado')
  }, { onError: () => toast.error('Erro ao duplicar') })
  const duplicate = () => duplicateAction.run()

  const createAction = useAsyncAction(async (name: string) => {
    const r = await api.post<{ data: Pipeline }>('/crm/pipelines', { name }); await load(r.data.id); toast.success('Pipeline criado')
  }, { onError: () => toast.error('Erro ao criar pipeline') })
  const createPipe = () => { const name = window.prompt('Nome do novo pipeline:'); if (!name?.trim()) return; createAction.run(name) }

  // Otimista + rollback (snapshot) + sync silencioso; concorrência via useAsyncAction.
  const patchPipeAction = useAsyncAction(async (patch: Partial<Pipeline>) => {
    if (!sel) return
    let snap: Pipeline[] = []
    setPipes(ps => { snap = ps; return ps.map(p => p.id === sel.id ? { ...p, ...patch } : p) })
    try { await api.put(`/crm/pipelines/${sel.id}`, patch); load(sel.id) } catch (e) { setPipes(snap); throw e }
  }, { onError: () => toast.error('Erro ao salvar') })
  const patchPipe = (patch: Partial<Pipeline>) => patchPipeAction.run(patch)

  const addStageAction = useAsyncAction(async () => {
    if (!sel) return
    await api.post(`/crm/pipelines/${sel.id}/stages`, { name: 'Nova etapa', probabilidade: 0 }); load(sel.id)
  }, { onError: () => toast.error('Erro ao adicionar etapa') })
  const addStage = () => addStageAction.run()

  const patchStageAction = useAsyncAction(async (st: Stage, patch: Partial<Stage>) => {
    if (!sel) return
    let snap: Pipeline[] = []
    setPipes(ps => { snap = ps; return ps.map(p => p.id === sel.id ? { ...p, stages: p.stages.map(s => s.id === st.id ? { ...s, ...patch } : s) } : p) })
    try { await api.put(`/crm/pipeline-stages/${st.id}`, patch); load(sel.id) } catch (e) { setPipes(snap); throw e }
  }, { onError: (e: any) => toast.error(e?.message ?? 'Erro ao salvar etapa') })
  const patchStage = (st: Stage, patch: Partial<Stage>) => patchStageAction.run(st, patch)

  const delStageAction = useAsyncAction(async (st: Stage) => {
    if (!sel) return
    await api.delete(`/crm/pipeline-stages/${st.id}`); toast.success('Etapa excluída'); load(sel.id)
  }, { onError: (e: any) => toast.error(e?.message ?? 'Erro ao excluir') })
  const delStage = (st: Stage) => { if (!sel) return; if (!window.confirm(`Excluir a etapa "${st.name}"?`)) return; delStageAction.run(st) }

  // Categoria A — reorder de colunas (drag): otimista + rollback (snapshot) + sync silencioso + concorrência.
  const reorderAction = useAsyncAction(async (arr: Stage[]) => {
    if (!sel) return
    let snap: Pipeline[] = []
    setPipes(ps => { snap = ps; return ps.map(p => p.id === sel.id ? { ...p, stages: arr } : p) })
    try { await api.patch(`/crm/pipelines/${sel.id}/stages/reorder`, { ordem: arr.map(s => s.id) }); load(sel.id) } catch (e) { setPipes(snap); throw e }
  }, { onError: () => toast.error('Erro ao reordenar') })
  const onDragEnd = (r: DropResult) => {
    if (!sel || !r.destination || r.destination.index === r.source.index) return
    if (sel.bloqueado) { toast.error('Pipeline bloqueado: ordem não pode ser alterada'); return }
    const arr = Array.from(sel.stages)
    const [moved] = arr.splice(r.source.index, 1); arr.splice(r.destination.index, 0, moved)
    reorderAction.run(arr)
  }

  return (
    <AppLayout title="Pipelines (CRM)">
      <div className="flex items-center gap-2 mb-4">
        <GitBranch size={18} style={{ color: 'var(--primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Configuração de Pipelines</h1>
        <span className="text-xs" style={{ color: 'var(--text-light)' }}>— funis e etapas configuráveis</span>
      </div>

      {loading ? <p style={{ color: 'var(--text-light)' }}>Carregando…</p>
        : forbidden ? <p style={{ color: 'var(--danger-border)' }}>Você não tem permissão para configurar pipelines do CRM (restrito a Admin/Administrativo).</p> : (
        <div className="flex gap-4">
          {/* Lista de pipelines */}
          <div className="w-64 shrink-0 space-y-2">
            {pipes.map(p => (
              <button key={p.id} onClick={() => setSelId(p.id)} className="w-full text-left rounded-xl p-3" style={{ background: 'var(--surface)', border: `1px solid ${selId === p.id ? 'var(--primary)' : 'var(--border)'}`, opacity: p.arquivado ? 0.55 : 1 }}>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.cor || 'var(--text-light)' }} />
                  <span className="text-sm font-semibold flex-1" style={{ color: 'var(--text)' }}>{p.name}</span>
                  {p.bloqueado && <Lock size={12} style={{ color: 'var(--warning-border)' }} />}
                  {p.arquivado ? <span className="text-[9px]" style={{ color: 'var(--text-light)' }}>arquivado</span> : !p.active && <span className="text-[9px]" style={{ color: 'var(--text-light)' }}>inativo</span>}
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-light)' }}>{p.tipo === 'qualificacao' ? 'Qualificação (Leads)' : `${p.stages.length} etapas`}</p>
              </button>
            ))}
            <button onClick={createPipe} className="w-full rounded-xl p-2.5 text-sm font-semibold flex items-center justify-center gap-1.5" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><Plus size={14} /> Novo pipeline</button>
          </div>

          {/* Detalhe do pipeline selecionado */}
          {sel && (
            <div className="flex-1 space-y-4">
              <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Nome</label><input defaultValue={sel.name} onBlur={e => e.target.value !== sel.name && patchPipe({ name: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
                  <div><label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Descrição</label><input defaultValue={sel.descricao ?? ''} onBlur={e => patchPipe({ descricao: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} /></div>
                </div>
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                  <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>Cor <input type="color" value={sel.cor || '#7c3aed'} onChange={e => patchPipe({ cor: e.target.value })} className="w-7 h-7 rounded cursor-pointer" /></label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}><input type="checkbox" checked={sel.active} onChange={e => patchPipe({ active: e.target.checked })} /> Ativo</label>
                  <button onClick={() => patchPipe({ bloqueado: !sel.bloqueado })} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg" style={sel.bloqueado ? { background: 'rgba(245,158,11,0.15)', color: '#f59e0b' } : { color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    {sel.bloqueado ? <Lock size={12} /> : <Unlock size={12} />} {sel.bloqueado ? 'Bloqueado (governança)' : 'Bloquear'}
                  </button>
                  <button onClick={() => patchPipe({ arquivado: !sel.arquivado })} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg" style={sel.arquivado ? { background: 'var(--surface-sunken)', color: 'var(--text-light)' } : { color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    <Archive size={12} /> {sel.arquivado ? 'Arquivado' : 'Arquivar'}
                  </button>
                  <button onClick={duplicate} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}><Copy size={12} /> Duplicar</button>
                  <button onClick={() => setAuditOpen(true)} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}><History size={12} /> Auditoria</button>
                </div>
                {/* Tipos de empresa trabalhados neste pipeline (multi-seleção). Vazio = todos. */}
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Tipos de empresa na fila <span style={{ color: 'var(--text-light)' }}>(pode escolher mais de um — vazio = todos)</span></label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {TIPOS_EMPRESA.map(t => {
                      const sels = sel.tipos_empresa ?? []
                      const on = sels.includes(t.v)
                      return (
                        <button key={t.v} type="button"
                          onClick={() => patchPipe({ tipos_empresa: on ? sels.filter(x => x !== t.v) : [...sels, t.v] })}
                          className="text-xs px-2.5 py-1 rounded-full font-semibold transition-colors"
                          style={on
                            ? { background: 'var(--primary)', color: 'var(--primary-fg)', border: '1px solid var(--primary)' }
                            : { color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                          {on ? '✓ ' : ''}{t.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Etapas com drag-and-drop */}
              <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>Etapas {sel.bloqueado && <span style={{ color: '#f59e0b' }}>· bloqueado</span>}</h3>
                  <button onClick={addStage} className="text-xs px-2.5 py-1 rounded-lg font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>+ Etapa</button>
                </div>
                <DragDropContext onDragEnd={onDragEnd}>
                  <Droppable droppableId="stages">
                    {prov => (
                      <div ref={prov.innerRef} {...prov.droppableProps} className="space-y-2">
                        {sel.stages.map((st, i) => (
                          <Draggable key={st.id} draggableId={String(st.id)} index={i} isDragDisabled={sel.bloqueado}>
                            {p2 => (
                              <div ref={p2.innerRef} {...p2.draggableProps} className="rounded-lg p-2.5 flex items-center gap-2 flex-wrap" style={{ background: 'var(--surface-sunken)', border: `1px solid ${st.cor || 'var(--border)'}`, ...p2.draggableProps.style }}>
                                <span {...p2.dragHandleProps} style={{ color: 'var(--text-light)', cursor: sel.bloqueado ? 'not-allowed' : 'grab' }}><GripVertical size={14} /></span>
                                <input defaultValue={st.name} onBlur={e => e.target.value !== st.name && patchStage(st, { name: e.target.value })} className="px-2 py-1 rounded text-sm outline-none flex-1 min-w-32" style={inputStyle} />
                                <input type="color" value={st.cor || '#64748b'} onChange={e => patchStage(st, { cor: e.target.value })} className="w-6 h-6 rounded cursor-pointer shrink-0" title="Cor" />
                                <label className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-light)' }}>Prob<input type="number" min={0} max={100} defaultValue={st.probabilidade ?? 0} onBlur={e => patchStage(st, { probabilidade: Number(e.target.value) })} className="w-12 px-1 py-0.5 rounded text-xs outline-none text-center" style={inputStyle} />%</label>
                                <label className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-light)' }}>SLA<input type="number" min={0} defaultValue={st.sla_dias ?? ''} onBlur={e => patchStage(st, { sla_dias: e.target.value === '' ? null : Number(e.target.value) })} className="w-12 px-1 py-0.5 rounded text-xs outline-none text-center" style={inputStyle} />d</label>
                                <button onClick={() => patchStage(st, { is_inicial: !st.is_inicial })} title="Etapa inicial" className="p-1 rounded" style={{ color: st.is_inicial ? 'var(--primary)' : 'var(--text-light)' }}><Flag size={13} /></button>
                                <button onClick={() => patchStage(st, { is_won: !st.is_won, is_lost: false })} title="Ganho" className="p-1 rounded" style={{ color: st.is_won ? '#22c55e' : 'var(--text-light)' }}><Trophy size={13} /></button>
                                <button onClick={() => patchStage(st, { is_lost: !st.is_lost, is_won: false })} title="Perda" className="p-1 rounded" style={{ color: st.is_lost ? 'var(--danger-border)' : 'var(--text-light)' }}><XCircle size={13} /></button>
                                <label className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-light)' }}><input type="checkbox" checked={st.ativa} onChange={e => patchStage(st, { ativa: e.target.checked })} />ativa</label>
                                <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>{st.oportunidades_count} opp</span>
                                <button onClick={() => setAutoStage(st)} className="p-1 rounded" style={{ color: 'var(--primary)' }} title="Automações"><Zap size={13} /></button>
                                <button onClick={() => delStage(st)} className="p-1 rounded" style={{ color: 'var(--text-light)' }} title="Excluir"><Trash2 size={13} /></button>
                                {/* Fase 2 — regras de transição (exigir para ENTRAR na etapa) */}
                                <div className="w-full flex items-center gap-1.5 flex-wrap mt-1 pl-6">
                                  <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>Exigir p/ entrar:</span>
                                  {REGRAS.map(rg => {
                                    const on = (st.regras ?? []).includes(rg.k)
                                    return (
                                      <button key={rg.k} onClick={() => patchStage(st, { regras: on ? (st.regras ?? []).filter(x => x !== rg.k) : [...(st.regras ?? []), rg.k] })}
                                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                        style={on ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : { background: 'var(--surface)', color: 'var(--text-light)', border: '1px solid var(--border)' }}>{rg.l}</button>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {prov.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              </div>
            </div>
          )}
        </div>
      )}

      {autoStage && <AutomationsModal stage={autoStage} onClose={() => setAutoStage(null)} />}
      {auditOpen && sel && <AuditModal pipelineId={sel.id} pipelineName={sel.name} onClose={() => setAuditOpen(false)} />}
    </AppLayout>
  )
}

// ── Auditoria de configuração (Fase 5 · Item 4) ──
interface AuditEvent { acao: string; descricao: string | null; usuario: string | null; when: string | null }
function AuditModal({ pipelineId, pipelineName, onClose }: { pipelineId: number; pipelineName: string; onClose: () => void }) {
  const [list, setList] = useState<AuditEvent[]>([])
  useEffect(() => { api.get<{ data: AuditEvent[] }>(`/crm/pipeline-events?pipeline_id=${pipelineId}`).then(r => setList(r?.data ?? [])).catch(() => {}) }, [pipelineId])
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl p-5 max-h-[85vh] overflow-y-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold flex items-center gap-1.5" style={{ color: 'var(--text)' }}><History size={15} /> Auditoria — {pipelineName}</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        {list.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Sem eventos de configuração.</p> : (
          <div className="space-y-1.5">
            {list.map((e, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="shrink-0 w-24 tabular-nums" style={{ color: 'var(--text-light)' }}>{e.when ? new Date(e.when).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{e.acao}</span>
                <span className="flex-1" style={{ color: 'var(--text-muted)' }}>{e.descricao}</span>
                <span className="shrink-0" style={{ color: 'var(--text-light)' }}>{e.usuario}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Automações da etapa (Fase 3) ──
interface Automation { id: number; tipo: string; config: Record<string, any> | null; ativa: boolean; ordem: number }
function AutomationsModal({ stage, onClose }: { stage: Stage; onClose: () => void }) {
  const [list, setList] = useState<Automation[]>([])
  const [tipo, setTipo] = useState('criar_tarefa')
  const [cfg, setCfg] = useState<Record<string, any>>({})
  const load = useCallback(() => { api.get<{ data: Automation[] }>(`/crm/pipeline-stages/${stage.id}/automations`).then(r => setList(r?.data ?? [])).catch(() => {}) }, [stage.id])
  useEffect(() => { load() }, [load])

  const add = async () => {
    try { await api.post(`/crm/pipeline-stages/${stage.id}/automations`, { tipo, config: cfg }); setCfg({}); load(); toast.success('Automação adicionada') }
    catch { toast.error('Erro ao adicionar') }
  }
  const toggle = async (a: Automation) => { try { await api.put(`/crm/stage-automations/${a.id}`, { ativa: !a.ativa }); load() } catch { toast.error('Erro') } }
  const del = async (a: Automation) => { try { await api.delete(`/crm/stage-automations/${a.id}`); load() } catch { toast.error('Erro') } }
  const set = (k: string, v: any) => setCfg(c => ({ ...c, [k]: v }))
  const inp = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
  const resume = (a: Automation) => {
    const c = a.config ?? {}
    if (a.tipo === 'criar_tarefa') return `${c.titulo ?? 'tarefa'} (+${c.dias_prazo ?? 1}d)`
    if (a.tipo === 'alterar_status_empresa') return `→ ${c.status ?? '?'}`
    if (a.tipo === 'enviar_email') return `p/ ${c.para ?? 'contato'}: ${c.assunto ?? ''}`
    if (a.tipo === 'webhook') return c.url ?? ''
    if (a.tipo === 'notificar') return c.mensagem ?? ''
    return ''
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold flex items-center gap-1.5" style={{ color: 'var(--text)' }}><Zap size={15} /> Automações — {stage.name}</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <p className="text-[11px] mb-3" style={{ color: 'var(--text-light)' }}>Executadas ao ENTRAR nesta etapa. "Sinalizar contrato" não gera contrato automaticamente (semi-automático).</p>

        <div className="space-y-1.5 mb-4">
          {list.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Nenhuma automação.</p>
            : list.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-xs rounded-lg px-2.5 py-2" style={{ background: 'var(--surface-sunken)' }}>
                <span className="font-semibold" style={{ color: 'var(--text)' }}>{AUTO_TIPOS.find(t => t.k === a.tipo)?.l ?? a.tipo}</span>
                <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{resume(a)}</span>
                <button onClick={() => toggle(a)} className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={a.ativa ? { background: 'rgba(34,197,94,0.15)', color: '#22c55e' } : { background: 'var(--surface)', color: 'var(--text-light)' }}>{a.ativa ? 'ativa' : 'inativa'}</button>
                <button onClick={() => del(a)} style={{ color: 'var(--text-light)' }}><Trash2 size={12} /></button>
              </div>
            ))}
        </div>

        <div className="rounded-lg p-3 space-y-2" style={{ border: '1px solid var(--border)' }}>
          <select value={tipo} onChange={e => { setTipo(e.target.value); setCfg({}) }} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inp}>
            {AUTO_TIPOS.map(t => <option key={t.k} value={t.k}>{t.l}</option>)}
          </select>
          {tipo === 'criar_tarefa' && (<div className="grid grid-cols-2 gap-2">
            <input placeholder="Título" onChange={e => set('titulo', e.target.value)} className="px-2 py-1.5 rounded text-sm outline-none col-span-2" style={inp} />
            <input type="number" placeholder="Prazo (dias)" onChange={e => set('dias_prazo', Number(e.target.value))} className="px-2 py-1.5 rounded text-sm outline-none" style={inp} />
            <select onChange={e => set('tipo', e.target.value)} className="px-2 py-1.5 rounded text-sm outline-none" style={inp}><option value="ligacao">Ligação</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="reuniao">Reunião</option></select>
          </div>)}
          {tipo === 'alterar_status_empresa' && (
            <select onChange={e => set('status', e.target.value)} className="w-full px-2 py-1.5 rounded text-sm outline-none" style={inp}><option value="">Status…</option>{CRM_STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}</select>
          )}
          {tipo === 'enviar_email' && (<div className="space-y-2">
            <select onChange={e => set('para', e.target.value)} className="w-full px-2 py-1.5 rounded text-sm outline-none" style={inp}><option value="contato">Contato principal</option><option value="responsavel">Responsável comercial</option><option value="fixo">E-mail fixo</option></select>
            <input placeholder="E-mail fixo (se aplicável)" onChange={e => set('email_fixo', e.target.value)} className="w-full px-2 py-1.5 rounded text-sm outline-none" style={inp} />
            <input placeholder="Assunto" onChange={e => set('assunto', e.target.value)} className="w-full px-2 py-1.5 rounded text-sm outline-none" style={inp} />
            <textarea placeholder="Corpo" onChange={e => set('corpo', e.target.value)} rows={2} className="w-full px-2 py-1.5 rounded text-sm outline-none" style={inp} />
          </div>)}
          {tipo === 'notificar' && <input placeholder="Mensagem" onChange={e => set('mensagem', e.target.value)} className="w-full px-2 py-1.5 rounded text-sm outline-none" style={inp} />}
          {tipo === 'webhook' && <input placeholder="URL do webhook" onChange={e => set('url', e.target.value)} className="w-full px-2 py-1.5 rounded text-sm outline-none" style={inp} />}
          {(tipo === 'gerar_proposta' || tipo === 'gerar_contrato') && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>{tipo === 'gerar_proposta' ? 'Gera uma proposta rascunho com o valor da oportunidade.' : 'Apenas sinaliza que está pronto para gerar contrato (geração permanece manual).'}</p>}
          <button onClick={add} className="w-full px-3 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={14} /> Adicionar automação</button>
        </div>
      </div>
    </div>
  )
}
