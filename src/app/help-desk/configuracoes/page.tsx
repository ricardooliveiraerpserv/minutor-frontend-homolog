'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Settings, Plus, Trash2, Save, ChevronRight, ChevronDown, Pencil } from 'lucide-react'
import { SearchSelect } from '@/components/ui/search-select'
import { AccessProfiles, HelpDeskPeople } from '@/components/help-desk/access-profiles'
import { AssociationRules } from '@/components/help-desk/association-rules'
import { EmailAccounts } from '@/components/help-desk/email-accounts'
import { Triggers } from '@/components/help-desk/triggers'
import { CommTemplate } from '@/components/help-desk/comm-template'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const lbl = 'text-[11px] font-semibold block mb-0.5'

interface Ref { id: number; name: string }
interface Category { id: number; name: string; color: string | null; active: boolean; default_team_id: number | null; sla_policy_id: number | null }
interface Status { id: number; key: string; label: string; color: string | null; sort_order: number; is_default: boolean; is_open: boolean; is_resolved: boolean; is_terminal: boolean; sla_paused: boolean; active: boolean }
interface Team { id: number; name: string; color: string | null; active: boolean; lead?: Ref | null; members?: Ref[] }
interface Tag { id: number; name: string; color: string | null }
interface SlaTarget { id?: number; priority: string; first_response_minutes: number | null; resolution_minutes: number | null }
interface SlaPolicy { id: number; name: string; is_default: boolean; active: boolean; targets: SlaTarget[] }

const TABS = [
  { id: 'categorias', label: 'Categorias' },
  { id: 'servicos', label: 'Serviços' },
  { id: 'justificativas', label: 'Justificativas' },
  { id: 'status', label: 'Status' },
  { id: 'filas', label: 'Equipes' },
  { id: 'perfis', label: 'Perfis de Acesso' },
  { id: 'pessoas', label: 'Pessoas' },
  { id: 'associacoes', label: 'Regras de Associação' },
  { id: 'contas-email', label: 'Contas de E-mail' },
  { id: 'gatilhos', label: 'Gatilhos (automação)' },
  { id: 'comunicacao', label: 'Comunicação' },
  { id: 'sla', label: 'SLA' },
  { id: 'tags', label: 'Tags' },
  { id: 'playbooks', label: 'Playbooks' },
] as const
type TabId = typeof TABS[number]['id']

const PRIORITIES = ['baixa', 'normal', 'alta', 'urgente']
const PRIO_LABEL: Record<string, string> = { baixa: 'Baixa', normal: 'Média', alta: 'Alta', urgente: 'Urgente' }
const AVAIL_LABEL: Record<string, string> = { public_and_internal: 'Tickets públicos e internos', public: 'Tickets públicos', internal: 'Tickets internos' }

export default function HelpDeskConfigPage() {
  return <Suspense fallback={null}><ConfigContent /></Suspense>
}

function ConfigContent() {
  const searchParams = useSearchParams()
  const urlTab = searchParams.get('tab') as TabId | null
  const [tab, setTab] = useState<TabId>(urlTab && TABS.some(t => t.id === urlTab) ? urlTab : 'categorias')
  // Deep-link: a navegação vem do menu lateral (?tab=); aqui só sincroniza a aba.
  useEffect(() => { if (urlTab && TABS.some(t => t.id === urlTab) && urlTab !== tab) setTab(urlTab) }, [urlTab]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AppLayout title="Configurações do Help Desk">
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
          <Settings size={20} style={{ color: 'var(--primary)' }} />
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Configurações do Help Desk</h1>
          <span style={{ color: 'var(--text-light)' }}>›</span>
          <span className="text-base font-medium" style={{ color: 'var(--primary)' }}>{TABS.find(t => t.id === tab)?.label}</span>
        </div>
        {tab === 'categorias' && <Categorias />}
        {tab === 'servicos' && <Servicos />}
        {tab === 'justificativas' && <Justificativas />}
        {tab === 'status' && <Statuses />}
        {tab === 'filas' && <Filas />}
        {tab === 'perfis' && <AccessProfiles />}
        {tab === 'pessoas' && <HelpDeskPeople />}
        {tab === 'associacoes' && <AssociationRules />}
        {tab === 'contas-email' && <EmailAccounts />}
        {tab === 'gatilhos' && <Triggers />}
        {tab === 'comunicacao' && <CommTemplate />}
        {tab === 'sla' && <SlaTab />}
        {tab === 'tags' && <Tags />}
        {tab === 'playbooks' && <Playbooks />}
      </div>
    </AppLayout>
  )
}

interface PlaybookActions {
  reply?: string; internal_comment?: string; status_id?: number; priority?: string; team_id?: number
  assignee_id?: number; checklist?: string[]; start_finalize?: boolean; finalize_status_id?: number
}
interface Playbook { id: number; name: string; category: string | null; color: string | null; icon: string | null; active: boolean; sort_order: number; actions: PlaybookActions }

function Playbooks() {
  const [rows, setRows] = useState<Playbook[]>([])
  const [statuses, setStatuses] = useState<{ id: number; label: string }[]>([])
  const [teams, setTeams] = useState<Ref[]>([])
  const [agents, setAgents] = useState<Ref[]>([])
  const [editing, setEditing] = useState<Playbook | 'new' | null>(null)
  const load = useCallback(() => { api.get<{ data: Playbook[] }>('/help-desk/playbooks/manage').then(r => setRows(r?.data ?? [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.get<{ data: { statuses: { id: number; label: string }[]; teams: Ref[] } }>('/help-desk/meta').then(r => { setStatuses(r?.data?.statuses ?? []); setTeams(r?.data?.teams ?? []) }).catch(() => {})
    api.get<{ data: Ref[] }>('/help-desk/agents').then(r => setAgents(r?.data ?? [])).catch(() => {})
  }, [])
  const del = async (p: Playbook) => { if (!confirm(`Excluir "${p.name}"?`)) return; try { await api.delete(`/help-desk/playbooks/${p.id}`); load() } catch { toast.error('Erro') } }

  if (editing) return <PlaybookEditor pb={editing} statuses={statuses} teams={teams} agents={agents} onBack={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />

  const summary = (a: PlaybookActions) => [
    a.reply && 'resposta', a.internal_comment && 'nota interna', a.status_id && 'status', a.priority && 'prioridade',
    a.team_id && 'fila', a.assignee_id && 'responsável', a.checklist?.length && `checklist(${a.checklist.length})`, a.start_finalize && 'finalizar',
  ].filter(Boolean).join(' · ')

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Procedimentos operacionais executados em uma ação.</p>
        <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => setEditing('new')}><Plus size={15} /> Novo playbook</button>
      </div>
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum playbook.</p>}
        {rows.map(p => (
          <div key={p.id} className="ds-card p-3 flex items-center justify-between gap-2">
            <button className="flex items-center gap-2 flex-1 text-left" onClick={() => setEditing(p)}>
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.color ?? 'var(--text-muted)' }} />
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{p.name} {!p.active && <span className="text-[10px]" style={{ color: 'var(--text-light)' }}>(inativo)</span>}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>{p.category ? `${p.category} · ` : ''}{summary(p.actions)}</div>
              </div>
            </button>
            <button onClick={() => del(p)}><Trash2 size={15} style={{ color: 'var(--danger-border)' }} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlaybookEditor({ pb, statuses, teams, agents, onBack, onSaved }: {
  pb: Playbook | 'new'; statuses: { id: number; label: string }[]; teams: Ref[]; agents: Ref[]; onBack: () => void; onSaved: () => void
}) {
  const p = pb === 'new' ? null : pb
  const [name, setName] = useState(p?.name ?? '')
  const [category, setCategory] = useState(p?.category ?? '')
  const [color, setColor] = useState(p?.color ?? '#6366f1')
  const [active, setActive] = useState(p?.active ?? true)
  const [sortOrder, setSortOrder] = useState(String(p?.sort_order ?? 0))
  const a = p?.actions ?? {}
  const [reply, setReply] = useState(a.reply ?? '')
  const [internal, setInternal] = useState(a.internal_comment ?? '')
  const [statusId, setStatusId] = useState(a.status_id ? String(a.status_id) : '')
  const [priority, setPriority] = useState(a.priority ?? '')
  const [teamId, setTeamId] = useState(a.team_id ? String(a.team_id) : '')
  const [assigneeId, setAssigneeId] = useState(a.assignee_id ? String(a.assignee_id) : '')
  const [checklist, setChecklist] = useState((a.checklist ?? []).join('\n'))
  const [startFinalize, setStartFinalize] = useState(a.start_finalize ?? false)
  const [finalizeStatusId, setFinalizeStatusId] = useState(a.finalize_status_id ? String(a.finalize_status_id) : '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) return toast.error('Informe o nome.')
    setSaving(true)
    const actions: PlaybookActions = {
      reply: reply.trim() || undefined, internal_comment: internal.trim() || undefined,
      status_id: statusId ? Number(statusId) : undefined, priority: priority || undefined,
      team_id: teamId ? Number(teamId) : undefined, assignee_id: assigneeId ? Number(assigneeId) : undefined,
      checklist: checklist.split('\n').map(s => s.trim()).filter(Boolean),
      start_finalize: startFinalize || undefined, finalize_status_id: startFinalize && finalizeStatusId ? Number(finalizeStatusId) : undefined,
    }
    const body = { name: name.trim(), category: category.trim() || null, color, active, sort_order: Number(sortOrder) || 0, actions }
    try {
      if (p) await api.put(`/help-desk/playbooks/${p.id}`, body)
      else await api.post('/help-desk/playbooks', body)
      toast.success('Playbook salvo'); onSaved()
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <button onClick={onBack} className="text-sm" style={{ color: 'var(--text-muted)' }}>← Voltar</button>
      <div className="ds-card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Nome</label><input className={`${fieldCls} w-full`} style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></div>
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Categoria</label><input className={`${fieldCls} w-full`} style={inputStyle} value={category} onChange={e => setCategory(e.target.value)} /></div>
        </div>
        <div className="flex items-center gap-3">
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Cor</label><input type="color" className="h-8 w-12 rounded" value={color} onChange={e => setColor(e.target.value)} /></div>
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Ordem</label><input type="number" className={`${fieldCls} w-20`} style={inputStyle} value={sortOrder} onChange={e => setSortOrder(e.target.value)} /></div>
          <label className="flex items-center gap-1.5 text-sm mt-4" style={{ color: 'var(--text)' }}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Ativo</label>
        </div>
        <div className="border-t pt-2" style={{ borderColor: 'var(--border)' }}>
          <div className={lbl} style={{ color: 'var(--text-light)' }}>Ações (executa só o configurado)</div>
        </div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Resposta ao cliente</label><textarea className={`${fieldCls} w-full`} style={inputStyle} rows={2} value={reply} onChange={e => setReply(e.target.value)} /></div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Comentário interno</label><textarea className={`${fieldCls} w-full`} style={inputStyle} rows={2} value={internal} onChange={e => setInternal(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Status</label><select className={`${fieldCls} w-full`} style={inputStyle} value={statusId} onChange={e => setStatusId(e.target.value)}><option value="">—</option>{statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Prioridade</label><select className={`${fieldCls} w-full`} style={inputStyle} value={priority} onChange={e => setPriority(e.target.value)}><option value="">—</option>{PRIORITIES.map(pr => <option key={pr} value={pr}>{PRIO_LABEL[pr]}</option>)}</select></div>
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Fila</label><select className={`${fieldCls} w-full`} style={inputStyle} value={teamId} onChange={e => setTeamId(e.target.value)}><option value="">—</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Responsável</label><select className={`${fieldCls} w-full`} style={inputStyle} value={assigneeId} onChange={e => setAssigneeId(e.target.value)}><option value="">—</option>{agents.map(ag => <option key={ag.id} value={ag.id}>{ag.name}</option>)}</select></div>
        </div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Checklist (um item por linha)</label><textarea className={`${fieldCls} w-full`} style={inputStyle} rows={3} value={checklist} onChange={e => setChecklist(e.target.value)} /></div>
        <label className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text)' }}><input type="checkbox" checked={startFinalize} onChange={e => setStartFinalize(e.target.checked)} /> Abrir fluxo &quot;Finalizar Atendimento&quot;</label>
        {startFinalize && <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Status sugerido na finalização</label><select className={`${fieldCls} w-64`} style={inputStyle} value={finalizeStatusId} onChange={e => setFinalizeStatusId(e.target.value)}><option value="">—</option>{statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>}
        <div className="flex justify-end"><button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg" onClick={save} disabled={saving}><Save size={14} /> Salvar playbook</button></div>
      </div>
    </div>
  )
}

function Categorias() {
  const [rows, setRows] = useState<Category[]>([])
  const [teams, setTeams] = useState<Ref[]>([])
  const [policies, setPolicies] = useState<Ref[]>([])
  const [name, setName] = useState(''); const [color, setColor] = useState('#6366f1')
  const [teamId, setTeamId] = useState(''); const [policyId, setPolicyId] = useState('')
  const [editing, setEditing] = useState<Category | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => { api.get<{ data: Category[] }>('/help-desk/categories?all=1').then(r => setRows(r?.data ?? [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.get<{ data: { teams: Ref[]; sla_policies: Ref[] } }>('/help-desk/meta').then(r => { setTeams(r?.data?.teams ?? []); setPolicies(r?.data?.sla_policies ?? []) }).catch(() => {})
  }, [])

  const startEdit = (c: Category) => { setEditing(c); setName(c.name); setColor(c.color ?? '#6366f1'); setTeamId(c.default_team_id ? String(c.default_team_id) : ''); setPolicyId(c.sla_policy_id ? String(c.sla_policy_id) : ''); setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0) }
  const cancelEdit = () => { setEditing(null); setName(''); setColor('#6366f1'); setTeamId(''); setPolicyId('') }
  const save = async () => {
    if (!name.trim()) return toast.error('Informe o nome.')
    const body = { name: name.trim(), color, default_team_id: teamId || null, sla_policy_id: policyId || null }
    try {
      if (editing) await api.put(`/help-desk/categories/${editing.id}`, body)
      else await api.post('/help-desk/categories', body)
      cancelEdit(); toast.success('Categoria salva'); load()
    } catch { toast.error('Erro ao salvar') }
  }
  const toggle = async (c: Category) => { try { await api.put(`/help-desk/categories/${c.id}`, { active: !c.active }); load() } catch { toast.error('Erro') } }
  const del = async (c: Category) => { if (!confirm(`Excluir "${c.name}"?`)) return; try { await api.delete(`/help-desk/categories/${c.id}`); if (editing?.id === c.id) cancelEdit(); load() } catch { toast.error('Erro') } }

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Clique no lápis para editar.</p>
      <div ref={formRef} className="ds-card p-3 flex items-end gap-2 flex-wrap" style={{ border: editing ? '1px solid var(--primary)' : undefined }}>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>{editing ? 'Editando categoria' : 'Nome'}</label><input className={`${fieldCls} w-48`} style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Cor</label><input type="color" className="h-8 w-12 rounded" value={color} onChange={e => setColor(e.target.value)} /></div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Fila padrão</label>
          <select className={fieldCls} style={inputStyle} value={teamId} onChange={e => setTeamId(e.target.value)}><option value="">—</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>SLA</label>
          <select className={fieldCls} style={inputStyle} value={policyId} onChange={e => setPolicyId(e.target.value)}><option value="">—</option>{policies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={save}>{editing ? <><Save size={15} /> Salvar</> : <><Plus size={15} /> Adicionar</>}</button>
        {editing && <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={cancelEdit}>Cancelar</button>}
      </div>
      <CrudTable rows={rows} cols={['Nome', 'Ativa', '']} render={c => (
        <tr key={c.id} className="border-t ds-row-hover" style={{ borderColor: 'var(--border)', background: editing?.id === c.id ? 'var(--primary-soft)' : undefined }}>
          <td className="px-3 py-2"><button className="inline-flex items-center gap-2 text-left" style={{ color: editing?.id === c.id ? 'var(--primary)' : 'var(--text)' }} onClick={() => startEdit(c)}><span className="w-3 h-3 rounded-full" style={{ background: c.color ?? 'var(--text-muted)' }} />{c.name}</button></td>
          <td className="px-3 py-2"><button onClick={() => toggle(c)} className="text-xs px-2 py-0.5 rounded-full" style={{ background: c.active ? 'var(--success-bg)' : 'var(--surface-sunken)', color: c.active ? 'var(--success-border)' : 'var(--text-muted)' }}>{c.active ? 'Ativa' : 'Inativa'}</button></td>
          <td className="px-3 py-2 text-right whitespace-nowrap"><button className="mr-2" title="Editar" onClick={() => startEdit(c)}><Pencil size={14} style={{ color: 'var(--primary)' }} /></button><button title="Excluir" onClick={() => del(c)}><Trash2 size={15} style={{ color: 'var(--danger-border)' }} /></button></td>
        </tr>
      )} />
    </div>
  )
}

function Statuses() {
  const [rows, setRows] = useState<Status[]>([])
  const [justs, setJusts] = useState<Justification[]>([])
  const [label, setLabel] = useState(''); const [color, setColor] = useState('#3b82f6')
  const load = useCallback(() => {
    api.get<{ data: Status[] }>('/help-desk/statuses?all=1').then(r => setRows(r?.data ?? [])).catch(() => {})
    api.get<{ data: Justification[] }>('/help-desk/justifications?all=1').then(r => setJusts(r?.data ?? [])).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])
  const add = async () => {
    if (!label.trim()) return toast.error('Informe o rótulo.')
    try { await api.post('/help-desk/statuses', { key: label.trim(), label: label.trim(), color, is_open: true, sort_order: (rows.at(-1)?.sort_order ?? 0) + 10 }); setLabel(''); toast.success('Status criado'); load() }
    catch { toast.error('Erro ao criar') }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Status do fluxo (editáveis no lápis). As justificativas aparecem aninhadas no status a que pertencem.</p>
      <div className="ds-card p-3 flex items-end gap-2">
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Novo status</label><input className={`${fieldCls} w-56`} style={inputStyle} value={label} onChange={e => setLabel(e.target.value)} placeholder="ex.: Aguardando aprovação" /></div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Cor</label><input type="color" className="h-8 w-12 rounded" value={color} onChange={e => setColor(e.target.value)} /></div>
        <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={add}><Plus size={15} /> Adicionar</button>
      </div>
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum status.</p>}
        {rows.map(s => <StatusBlock key={s.id} status={s} justs={justs.filter(j => j.status_id === s.id)} reload={load} />)}
      </div>
    </div>
  )
}

function StatusBlock({ status, justs, reload }: { status: Status; justs: Justification[]; reload: () => void }) {
  const [edit, setEdit] = useState(false)
  const [label, setLabel] = useState(status.label)
  const [color, setColor] = useState(status.color ?? '#3b82f6')
  const [f, setF] = useState({ is_default: status.is_default, is_open: status.is_open, is_resolved: status.is_resolved, is_terminal: status.is_terminal, sla_paused: status.sla_paused })
  const [jName, setJName] = useState(''); const [jAvail, setJAvail] = useState('public_and_internal')
  const [jEditId, setJEditId] = useState<number | null>(null); const [jEditName, setJEditName] = useState('')

  const FLAGS: [keyof typeof f, string][] = [['is_default', 'inicial'], ['is_open', 'aberto'], ['is_resolved', 'resolvido'], ['is_terminal', 'terminal'], ['sla_paused', 'SLA pausa']]
  const saveStatus = async () => { try { await api.put(`/help-desk/statuses/${status.id}`, { label: label.trim(), color, ...f }); setEdit(false); toast.success('Status salvo'); reload() } catch { toast.error('Erro ao salvar') } }
  const delStatus = async () => { if (!confirm(`Excluir "${status.label}"?`)) return; try { await api.delete(`/help-desk/statuses/${status.id}`); reload() } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') } }
  const addJust = async () => { if (!jName.trim()) return toast.error('Informe a justificativa.'); try { await api.post('/help-desk/justifications', { name: jName.trim(), status_id: status.id, availability: jAvail }); setJName(''); reload() } catch { toast.error('Erro') } }
  const saveJust = async (id: number) => { if (!jEditName.trim()) return; try { await api.put(`/help-desk/justifications/${id}`, { name: jEditName.trim() }); setJEditId(null); reload() } catch { toast.error('Erro') } }
  const toggleJust = async (j: Justification) => { try { await api.put(`/help-desk/justifications/${j.id}`, { active: !j.active }); reload() } catch { toast.error('Erro') } }
  const delJust = async (j: Justification) => { if (!confirm(`Excluir "${j.name}"?`)) return; try { await api.delete(`/help-desk/justifications/${j.id}`); reload() } catch { toast.error('Erro') } }

  return (
    <div className="ds-card overflow-hidden">
      <div className="px-3 py-2">
        {!edit ? (
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 font-medium" style={{ color: status.color ?? 'var(--text)' }}><span className="w-2.5 h-2.5 rounded-full" style={{ background: status.color ?? 'var(--text-muted)' }} />{status.label}</span>
            <div className="flex items-center gap-2">
              <div className="space-x-1">{FLAGS.map(([k, t]) => <span key={k} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: status[k as keyof Status] ? 'var(--primary-soft)' : 'transparent', color: status[k as keyof Status] ? 'var(--primary)' : 'var(--text-light)' }}>{t}</span>)}</div>
              <button title="Editar" onClick={() => setEdit(true)}><Pencil size={14} style={{ color: 'var(--primary)' }} /></button>
              <button title="Excluir" onClick={delStatus}><Trash2 size={15} style={{ color: 'var(--danger-border)' }} /></button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-end gap-2 flex-wrap">
              <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Rótulo</label><input className={`${fieldCls} w-56`} style={inputStyle} value={label} onChange={e => setLabel(e.target.value)} /></div>
              <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Cor</label><input type="color" className="h-8 w-12 rounded" value={color} onChange={e => setColor(e.target.value)} /></div>
            </div>
            <div className="flex flex-wrap gap-3">
              {FLAGS.map(([k, t]) => <label key={k} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text)' }}><input type="checkbox" checked={f[k]} onChange={e => setF(s => ({ ...s, [k]: e.target.checked }))} /> {t}</label>)}
            </div>
            <div className="flex gap-2"><button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={saveStatus}><Save size={14} /> Salvar</button><button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={() => setEdit(false)}>Cancelar</button></div>
          </div>
        )}
      </div>
      {/* Justificativas — filhas deste status */}
      <div className="border-t px-3 py-2 space-y-1.5" style={{ borderColor: 'var(--border)', background: 'var(--surface-sunken)' }}>
        <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>Justificativas</div>
        {justs.map(j => (
          <div key={j.id} className="flex items-center justify-between gap-2 pl-3">
            {jEditId === j.id
              ? <input autoFocus className={`${fieldCls} flex-1`} style={inputStyle} value={jEditName} onChange={e => setJEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveJust(j.id) }} />
              : <span className="text-sm flex-1" style={{ color: j.active ? 'var(--text)' : 'var(--text-light)' }}>{j.name}</span>}
            <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>{AVAIL_LABEL[j.availability] ?? j.availability}</span>
            <button onClick={() => toggleJust(j)} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: j.active ? 'var(--success-bg)' : 'var(--surface)', color: j.active ? 'var(--success-border)' : 'var(--text-muted)' }}>{j.active ? 'Ativo' : 'Inativo'}</button>
            {jEditId === j.id
              ? <button title="Salvar" onClick={() => saveJust(j.id)}><Save size={14} style={{ color: 'var(--primary)' }} /></button>
              : <button title="Editar" onClick={() => { setJEditId(j.id); setJEditName(j.name) }}><Pencil size={13} style={{ color: 'var(--primary)' }} /></button>}
            <button title="Excluir" onClick={() => delJust(j)}><Trash2 size={13} style={{ color: 'var(--danger-border)' }} /></button>
          </div>
        ))}
        {justs.length === 0 && <p className="text-[11px] pl-3" style={{ color: 'var(--text-light)' }}>Nenhuma justificativa neste status.</p>}
        <div className="flex items-center gap-2 pt-1 pl-3">
          <input className={`${fieldCls} flex-1`} style={inputStyle} placeholder="Nova justificativa…" value={jName} onChange={e => setJName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addJust() }} />
          <select className={fieldCls} style={inputStyle} value={jAvail} onChange={e => setJAvail(e.target.value)}>{Object.entries(AVAIL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button className="ds-btn-secondary inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg" onClick={addJust}><Plus size={13} /> Justificativa</button>
        </div>
      </div>
    </div>
  )
}

function Filas() {
  const [rows, setRows] = useState<Team[]>([])
  const [agents, setAgents] = useState<Ref[]>([])
  const [name, setName] = useState(''); const [color, setColor] = useState('#0ea5e9')
  const [editId, setEditId] = useState<number | null>(null)
  const load = useCallback(() => { api.get<{ data: Team[] }>('/help-desk/teams?all=1').then(r => setRows(r?.data ?? [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { api.get<{ data: Ref[] }>('/help-desk/agents?candidates=1').then(r => setAgents(r?.data ?? [])).catch(() => {}) }, [])
  const add = async () => { if (!name.trim()) return toast.error('Informe o nome.'); try { await api.post('/help-desk/teams', { name: name.trim(), color }); setName(''); toast.success('Equipe criada'); load() } catch { toast.error('Erro') } }
  const del = async (t: Team) => { if (!confirm(`Excluir "${t.name}"?`)) return; try { await api.delete(`/help-desk/teams/${t.id}`); load() } catch { toast.error('Erro') } }
  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Equipes de atendimento. <strong>Ao vincular um consultor a uma equipe, ele é automaticamente promovido a Agente</strong> (passa a poder responder e ser atribuído a chamados).</p>
      <div className="ds-card p-3 flex items-end gap-2">
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Nome da equipe</label><input className={`${fieldCls} w-56`} style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Cor</label><input type="color" className="h-8 w-12 rounded" value={color} onChange={e => setColor(e.target.value)} /></div>
        <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={add}><Plus size={15} /> Adicionar</button>
      </div>
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma equipe.</p>}
        {rows.map(t => (
          <div key={t.id} className="ds-card overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="inline-flex items-center gap-2" style={{ color: 'var(--text)' }}><span className="w-3 h-3 rounded-full" style={{ background: t.color ?? 'var(--text-muted)' }} />{t.name}</span>
              <div className="flex items-center gap-3 text-sm">
                <span style={{ color: 'var(--text-muted)' }}>{(t.members?.length ?? 0)} membro(s){t.lead ? ` · resp. ${t.lead.name}` : ''}</span>
                <button className="ds-link text-xs" style={{ color: 'var(--primary)' }} onClick={() => setEditId(editId === t.id ? null : t.id)}>{editId === t.id ? 'Fechar' : 'Membros'}</button>
                <button onClick={() => del(t)}><Trash2 size={15} style={{ color: 'var(--danger-border)' }} /></button>
              </div>
            </div>
            {editId === t.id && <TeamMembersEditor team={t} agents={agents} onSaved={() => { setEditId(null); load() }} />}
          </div>
        ))}
      </div>
    </div>
  )
}

function TeamMembersEditor({ team, agents, onSaved }: { team: Team; agents: Ref[]; onSaved: () => void }) {
  const [sel, setSel] = useState<number[]>(() => (team.members ?? []).map(m => m.id))
  const [leadId, setLeadId] = useState<string>(team.lead?.id ? String(team.lead.id) : '')
  const [saving, setSaving] = useState(false)
  const toggle = (id: number) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const save = async () => {
    setSaving(true)
    try { await api.put(`/help-desk/teams/${team.id}`, { member_ids: sel, lead_user_id: leadId || null }); toast.success('Fila atualizada'); onSaved() }
    catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }
  return (
    <div className="border-t px-3 py-3 space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-sunken)' }}>
      <div>
        <label className={lbl} style={{ color: 'var(--text-light)' }}>Responsável da equipe</label>
        <div className="w-64"><SearchSelect value={leadId} onChange={setLeadId} options={[{ id: '', name: '— sem responsável —' }, ...agents]} placeholder="Buscar pessoa…" fullWidth /></div>
      </div>
      <div>
        <label className={lbl} style={{ color: 'var(--text-light)' }}>Membros ({sel.length})</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-48 overflow-y-auto">
          {agents.map(a => (
            <label key={a.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={sel.includes(a.id)} onChange={() => toggle(a.id)} />
              <span style={{ color: 'var(--text)' }}>{a.name}</span>
            </label>
          ))}
        </div>
      </div>
      <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={save} disabled={saving}><Save size={14} /> Salvar membros</button>
    </div>
  )
}

function SlaTab() {
  const [rows, setRows] = useState<SlaPolicy[]>([])
  const load = useCallback(() => { api.get<{ data: SlaPolicy[] }>('/help-desk/sla-policies?all=1').then(r => setRows(r?.data ?? [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  return (
    <div className="space-y-4">
      {rows.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma política. (a política “SLA Padrão” é semeada no banco.)</p>}
      {rows.map(p => <PolicyCard key={p.id} policy={p} onSaved={load} />)}
    </div>
  )
}

function PolicyCard({ policy, onSaved }: { policy: SlaPolicy; onSaved: () => void }) {
  const byPrio = (pr: string) => policy.targets.find(t => t.priority === pr) ?? { priority: pr, first_response_minutes: null, resolution_minutes: null }
  const [draft, setDraft] = useState<Record<string, { fr: string; res: string }>>(() =>
    Object.fromEntries(PRIORITIES.map(pr => { const t = byPrio(pr); return [pr, { fr: t.first_response_minutes?.toString() ?? '', res: t.resolution_minutes?.toString() ?? '' }] })))
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      const targets = PRIORITIES.map(pr => ({ priority: pr, first_response_minutes: draft[pr].fr ? Number(draft[pr].fr) : null, resolution_minutes: draft[pr].res ? Number(draft[pr].res) : null }))
      await api.put(`/help-desk/sla-policies/${policy.id}`, { targets }); toast.success('SLA salvo'); onSaved()
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }
  return (
    <div className="ds-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold" style={{ color: 'var(--text)' }}>{policy.name} {policy.is_default && <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>padrão</span>}</div>
        <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={save} disabled={saving}><Save size={14} /> Salvar</button>
      </div>
      <table className="w-full text-sm">
        <thead><tr style={{ color: 'var(--text-muted)' }} className="text-left text-[11px] uppercase"><th className="py-1">Prioridade</th><th className="py-1">1ª resposta (min)</th><th className="py-1">Resolução (min)</th></tr></thead>
        <tbody>
          {PRIORITIES.map(pr => (
            <tr key={pr} className="border-t" style={{ borderColor: 'var(--border)' }}>
              <td className="py-1.5" style={{ color: 'var(--text)' }}>{PRIO_LABEL[pr]}</td>
              <td className="py-1.5"><input type="number" className={`${fieldCls} w-28`} style={inputStyle} value={draft[pr].fr} onChange={e => setDraft(d => ({ ...d, [pr]: { ...d[pr], fr: e.target.value } }))} /></td>
              <td className="py-1.5"><input type="number" className={`${fieldCls} w-28`} style={inputStyle} value={draft[pr].res} onChange={e => setDraft(d => ({ ...d, [pr]: { ...d[pr], res: e.target.value } }))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Tags() {
  const [rows, setRows] = useState<Tag[]>([])
  const [name, setName] = useState(''); const [color, setColor] = useState('#64748b')
  const load = useCallback(() => { api.get<{ data: Tag[] }>('/help-desk/tags').then(r => setRows(r?.data ?? [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  const add = async () => { if (!name.trim()) return toast.error('Informe o nome.'); try { await api.post('/help-desk/tags', { name: name.trim(), color }); setName(''); load() } catch { toast.error('Erro (nome duplicado?)') } }
  const del = async (t: Tag) => { try { await api.delete(`/help-desk/tags/${t.id}`); load() } catch { toast.error('Erro') } }
  return (
    <div className="space-y-3">
      <div className="ds-card p-3 flex items-end gap-2">
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Nova tag</label><input className={`${fieldCls} w-48`} style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Cor</label><input type="color" className="h-8 w-12 rounded" value={color} onChange={e => setColor(e.target.value)} /></div>
        <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={add}><Plus size={15} /> Adicionar</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {rows.map(t => (
          <span key={t.id} className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full" style={{ background: 'var(--surface-sunken)', color: t.color ?? 'var(--text)' }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color ?? 'var(--text-muted)' }} />{t.name}
            <button onClick={() => del(t)}><Trash2 size={12} style={{ color: 'var(--danger-border)' }} /></button>
          </span>
        ))}
        {rows.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma tag.</p>}
      </div>
    </div>
  )
}

// ── Catálogo de Serviços (árvore) ──────────────────────────────────────────
interface Service {
  id: number; parent_id: number | null; name: string; code: string | null; availability: string
  visible_to_agent: boolean; visible_to_client: boolean; selectable_by_agent: boolean; selectable_by_client: boolean
  allow_conclusion: boolean; active: boolean; sort_order: number
}
function Servicos() {
  const [rows, setRows] = useState<Service[]>([])
  const [editing, setEditing] = useState<Service | 'new' | null>(null)
  const [sel, setSel] = useState<number | null>(null) // nó (pai) selecionado na árvore; null = raiz do catálogo
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const load = useCallback(() => { api.get<{ data: Service[] }>('/help-desk/services?all=1').then(r => setRows(r?.data ?? [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  const del = async (s: Service) => { if (!confirm(`Excluir "${s.name}"?`)) return; try { await api.delete(`/help-desk/services/${s.id}`); load() } catch { toast.error('Erro') } }
  const toggle = async (s: Service) => { try { await api.put(`/help-desk/services/${s.id}`, { active: !s.active }); load() } catch { toast.error('Erro') } }

  if (editing) return <ServiceForm svc={editing} services={rows} defaultParentId={sel} onBack={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />

  const childrenOf = (pid: number | null) => rows.filter(r => (r.parent_id ?? null) === pid).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'pt-BR'))
  const who = (a: boolean, c: boolean) => [a && 'Agente', c && 'Cliente'].filter(Boolean).join(', ') || '—'
  const toggleExp = (id: number) => setExpanded(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const TreeNode = ({ node, depth }: { node: Service; depth: number }) => {
    const kids = childrenOf(node.id)
    const isSel = sel === node.id
    return (
      <div>
        <div className="flex items-center gap-0.5 rounded" style={{ paddingLeft: 2 + depth * 14, background: isSel ? 'var(--primary-soft)' : 'transparent' }}>
          {kids.length > 0
            ? <button onClick={() => toggleExp(node.id)} className="p-0.5 shrink-0" aria-label="Expandir">{expanded.has(node.id) ? <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />}</button>
            : <span className="w-[18px] shrink-0" />}
          <button className="text-sm text-left flex-1 py-1 truncate" onClick={() => setSel(node.id)} style={{ color: isSel ? 'var(--primary)' : 'var(--text)' }}>{node.name}</button>
        </div>
        {kids.length > 0 && expanded.has(node.id) && kids.map(k => <TreeNode key={k.id} node={k} depth={depth + 1} />)}
      </div>
    )
  }

  const selName = sel ? (rows.find(r => r.id === sel)?.name ?? '') : 'Catálogo de serviços'
  const list = childrenOf(sel)
  return (
    <div className="flex gap-4 items-start">
      {/* Esquerda — árvore "Catálogo de serviços" */}
      <div className="w-60 shrink-0 ds-card p-2">
        <button onClick={() => setSel(null)} className="w-full text-left text-[11px] font-semibold uppercase tracking-wide px-1.5 py-1 rounded mb-1" style={{ color: sel === null ? 'var(--primary)' : 'var(--text-muted)', background: sel === null ? 'var(--primary-soft)' : 'transparent' }}>Catálogo de serviços</button>
        {childrenOf(null).map(n => <TreeNode key={n.id} node={n} depth={0} />)}
        {rows.length === 0 && <p className="text-xs px-1.5 py-2" style={{ color: 'var(--text-light)' }}>Nenhum serviço.</p>}
      </div>
      {/* Direita — tabela dos filhos do nó selecionado */}
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex justify-between items-center gap-2">
          <div>
            <div className="text-base font-semibold" style={{ color: 'var(--text)' }}>{selName}</div>
            <div className="text-[11px]" style={{ color: 'var(--text-light)' }}>{list.length} registro(s)</div>
          </div>
          <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => setEditing('new')}><Plus size={15} /> Novo serviço</button>
        </div>
        <CrudTable rows={list} cols={['Nome', 'Disponível para tickets', 'Visível para', 'Permitir a seleção para', 'Código', 'Conclusão', 'Habilitado', '']} render={s => (
          <tr key={s.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
            <td className="px-3 py-2"><button className="text-left" style={{ color: 'var(--text)' }} onClick={() => setEditing(s)}>{s.name}{childrenOf(s.id).length > 0 && <span className="text-[10px] ml-1" style={{ color: 'var(--text-light)' }}>({childrenOf(s.id).length})</span>}</button></td>
            <td className="px-3 py-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>{AVAIL_LABEL[s.availability] ?? s.availability}</td>
            <td className="px-3 py-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>{who(s.visible_to_agent, s.visible_to_client)}</td>
            <td className="px-3 py-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>{who(s.selectable_by_agent, s.selectable_by_client)}</td>
            <td className="px-3 py-2 text-[11px]" style={{ color: 'var(--text-light)' }}>{s.code ?? '—'}</td>
            <td className="px-3 py-2">{s.allow_conclusion ? <span style={{ color: 'var(--success-border)' }}>✓</span> : <span style={{ color: 'var(--text-light)' }}>—</span>}</td>
            <td className="px-3 py-2"><button onClick={() => toggle(s)} className="text-xs px-2 py-0.5 rounded-full" style={{ background: s.active ? 'var(--success-bg)' : 'var(--surface-sunken)', color: s.active ? 'var(--success-border)' : 'var(--text-muted)' }}>{s.active ? 'Sim' : 'Não'}</button></td>
            <td className="px-3 py-2 text-right"><button onClick={() => del(s)}><Trash2 size={15} style={{ color: 'var(--danger-border)' }} /></button></td>
          </tr>
        )} />
      </div>
    </div>
  )
}

function ServiceForm({ svc, services, defaultParentId = null, onBack, onSaved }: { svc: Service | 'new'; services: Service[]; defaultParentId?: number | null; onBack: () => void; onSaved: () => void }) {
  const s = svc === 'new' ? null : svc
  const [name, setName] = useState(s?.name ?? '')
  const [parentId, setParentId] = useState(s?.parent_id ? String(s.parent_id) : (defaultParentId ? String(defaultParentId) : ''))
  const [code, setCode] = useState(s?.code ?? '')
  const [availability, setAvailability] = useState(s?.availability ?? 'public_and_internal')
  const [visAgent, setVisAgent] = useState(s?.visible_to_agent ?? true)
  const [visClient, setVisClient] = useState(s?.visible_to_client ?? true)
  const [selAgent, setSelAgent] = useState(s?.selectable_by_agent ?? true)
  const [selClient, setSelClient] = useState(s?.selectable_by_client ?? false)
  const [allowConc, setAllowConc] = useState(s?.allow_conclusion ?? true)
  const [active, setActive] = useState(s?.active ?? true)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) return toast.error('Informe o nome.')
    setSaving(true)
    const body = { name: name.trim(), parent_id: parentId ? Number(parentId) : null, code: code.trim() || null, availability,
      visible_to_agent: visAgent, visible_to_client: visClient, selectable_by_agent: selAgent, selectable_by_client: selClient, allow_conclusion: allowConc, active }
    try {
      if (s) await api.put(`/help-desk/services/${s.id}`, body); else await api.post('/help-desk/services', body)
      toast.success('Serviço salvo'); onSaved()
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }
  const Chk = ({ v, set, children }: { v: boolean; set: (b: boolean) => void; children: React.ReactNode }) => (
    <label className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text)' }}><input type="checkbox" checked={v} onChange={e => set(e.target.checked)} /> {children}</label>
  )
  return (
    <div className="space-y-3 max-w-2xl">
      <button onClick={onBack} className="text-sm" style={{ color: 'var(--text-muted)' }}>← Voltar</button>
      <div className="ds-card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Nome</label><input className={`${fieldCls} w-full`} style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></div>
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Serviço pai (opcional)</label>
            <select className={`${fieldCls} w-full`} style={inputStyle} value={parentId} onChange={e => setParentId(e.target.value)}><option value="">— (raiz)</option>{services.filter(x => x.id !== s?.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Código</label><input className={`${fieldCls} w-full`} style={inputStyle} value={code} onChange={e => setCode(e.target.value)} /></div>
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Disponível para tickets</label>
            <select className={`${fieldCls} w-full`} style={inputStyle} value={availability} onChange={e => setAvailability(e.target.value)}>{Object.entries(AVAIL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
          <div className="space-y-1"><div className={lbl} style={{ color: 'var(--text-light)' }}>Visível para</div><Chk v={visAgent} set={setVisAgent}>Agente</Chk><Chk v={visClient} set={setVisClient}>Cliente</Chk></div>
          <div className="space-y-1"><div className={lbl} style={{ color: 'var(--text-light)' }}>Permitir a seleção para</div><Chk v={selAgent} set={setSelAgent}>Agente</Chk><Chk v={selClient} set={setSelClient}>Cliente</Chk></div>
        </div>
        <div className="flex gap-4 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
          <Chk v={allowConc} set={setAllowConc}>Permitir a conclusão</Chk>
          <Chk v={active} set={setActive}>Habilitado</Chk>
        </div>
        <div className="flex justify-end"><button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg" onClick={save} disabled={saving}><Save size={14} /> Salvar serviço</button></div>
      </div>
    </div>
  )
}

// ── Justificativas de ticket (vinculadas a status) ─────────────────────────
interface Justification { id: number; status_id: number; name: string; availability: string; active: boolean; status?: { id: number; label: string; color: string | null } }
function Justificativas() {
  const [rows, setRows] = useState<Justification[]>([])
  const [statuses, setStatuses] = useState<{ id: number; label: string; color: string | null }[]>([])
  const [name, setName] = useState(''); const [statusId, setStatusId] = useState(''); const [availability, setAvailability] = useState('public_and_internal')
  const [editing, setEditing] = useState<Justification | null>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const load = useCallback(() => { api.get<{ data: Justification[] }>('/help-desk/justifications?all=1').then(r => setRows(r?.data ?? [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { api.get<{ data: { statuses: { id: number; label: string; color: string | null }[] } }>('/help-desk/meta').then(r => setStatuses(r?.data?.statuses ?? [])).catch(() => {}) }, [])
  const startEdit = (j: Justification) => { setEditing(j); setName(j.name); setStatusId(String(j.status_id)); setAvailability(j.availability); setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0) }
  const cancelEdit = () => { setEditing(null); setName(''); setStatusId(''); setAvailability('public_and_internal') }
  const save = async () => {
    if (!name.trim()) return toast.error('Informe o nome.')
    if (!statusId) return toast.error('Selecione o status.')
    const body = { name: name.trim(), status_id: Number(statusId), availability }
    try {
      if (editing) await api.put(`/help-desk/justifications/${editing.id}`, body)
      else await api.post('/help-desk/justifications', body)
      cancelEdit(); toast.success('Justificativa salva'); load()
    } catch { toast.error('Erro ao salvar') }
  }
  const toggle = async (j: Justification) => { try { await api.put(`/help-desk/justifications/${j.id}`, { active: !j.active }); load() } catch { toast.error('Erro') } }
  const del = async (j: Justification) => { if (!confirm(`Excluir "${j.name}"?`)) return; try { await api.delete(`/help-desk/justifications/${j.id}`); if (editing?.id === j.id) cancelEdit(); load() } catch { toast.error('Erro') } }
  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Motivos vinculados a um status (ex.: ao cancelar, escolher “Aberto em duplicidade”). Clique numa linha para editar.</p>
      <div ref={formRef} className="ds-card p-3 flex items-end gap-2 flex-wrap" style={{ border: editing ? '1px solid var(--primary)' : undefined }}>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>{editing ? 'Editando justificativa' : 'Nome da justificativa'}</label><input className={`${fieldCls} w-56`} style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Status</label>
          <select className={fieldCls} style={inputStyle} value={statusId} onChange={e => setStatusId(e.target.value)}><option value="">—</option>{statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Disponível para</label>
          <select className={fieldCls} style={inputStyle} value={availability} onChange={e => setAvailability(e.target.value)}>{Object.entries(AVAIL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={save}>{editing ? <><Save size={15} /> Salvar</> : <><Plus size={15} /> Adicionar</>}</button>
        {editing && <button className="ds-btn-secondary text-sm px-3 py-1.5 rounded-lg" onClick={cancelEdit}>Cancelar</button>}
      </div>
      <CrudTable rows={rows} cols={['Nome da Justificativa', 'Status', 'Disponível', 'Ativo', '']} render={j => (
        <tr key={j.id} className="border-t ds-row-hover" style={{ borderColor: 'var(--border)', background: editing?.id === j.id ? 'var(--primary-soft)' : undefined }}>
          <td className="px-3 py-2"><button className="text-left" style={{ color: editing?.id === j.id ? 'var(--primary)' : 'var(--text)' }} onClick={() => startEdit(j)}>{j.name}</button></td>
          <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 text-sm" style={{ color: j.status?.color ?? 'var(--text-muted)' }}><span className="w-2 h-2 rounded-full" style={{ background: j.status?.color ?? 'var(--text-muted)' }} />{j.status?.label ?? '—'}</span></td>
          <td className="px-3 py-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>{AVAIL_LABEL[j.availability] ?? j.availability}</td>
          <td className="px-3 py-2"><button onClick={() => toggle(j)} className="text-xs px-2 py-0.5 rounded-full" style={{ background: j.active ? 'var(--success-bg)' : 'var(--surface-sunken)', color: j.active ? 'var(--success-border)' : 'var(--text-muted)' }}>{j.active ? 'Ativo' : 'Inativo'}</button></td>
          <td className="px-3 py-2 text-right whitespace-nowrap"><button className="mr-2" title="Editar" onClick={() => startEdit(j)}><Pencil size={14} style={{ color: 'var(--primary)' }} /></button><button title="Excluir" onClick={() => del(j)}><Trash2 size={15} style={{ color: 'var(--danger-border)' }} /></button></td>
        </tr>
      )} />
    </div>
  )
}

function CrudTable<T>({ rows, cols, render }: { rows: T[]; cols: string[]; render: (row: T) => React.ReactNode }) {
  return (
    <div className="ds-card overflow-hidden">
      <table className="w-full text-sm">
        <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }} className="text-left text-[11px] uppercase">{cols.map((c, i) => <th key={i} className="px-3 py-2">{c}</th>)}</tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={cols.length} className="px-3 py-6 text-center" style={{ color: 'var(--text-muted)' }}>Nenhum registro.</td></tr> : rows.map(render)}</tbody>
      </table>
    </div>
  )
}
