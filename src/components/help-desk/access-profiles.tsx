'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Trash2, Save, Pencil, ShieldCheck, Search } from 'lucide-react'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const lbl = 'text-[11px] font-semibold block mb-0.5'

type Kind = 'agent' | 'cliente'
interface AccessProfile { id: number; name: string; kind: Kind; is_default: boolean; enabled: boolean; permissions: Record<string, unknown> | null }

// ── Schema das permissões APLICÁVEIS ao nosso Help Desk (curado do Movidesk). ──
type Ctrl =
  | { key: string; label: string; type: 'toggle' }
  | { key: string; label: string; type: 'radio'; options: { value: string; label: string }[] }
  | { key: string; label: string; type: 'toggles'; items: { key: string; label: string }[] }
interface Section { title?: string; controls: Ctrl[] }
interface Tab { id: string; label: string; sections: Section[] }

const VIEW_SCOPE = [{ value: 'all', label: 'Todos' }, { value: 'assigned', label: 'Somente se for responsável' }, { value: 'parent', label: 'Somente se o ticket for pai do seu' }, { value: 'assigned_or_parent', label: 'Responsável ou pai' }, { value: 'none', label: 'Não permitir' }]
const ACTION_TYPES = [{ value: 'public', label: 'Ações públicas' }, { value: 'internal', label: 'Ações internas' }, { value: 'both', label: 'Públicas e internas' }, { value: 'none', label: 'Não permitir incluir ações' }]

const SCHEMA: Record<Kind, Tab[]> = {
  agent: [
    { id: 'tickets', label: 'Tickets', sections: [
      { title: 'Abertura de tickets', controls: [
        { key: 'tickets.open', label: 'Permitir abrir tickets', type: 'radio', options: [{ value: 'public_and_internal', label: 'Públicos e internos' }, { value: 'public', label: 'Apenas públicos' }, { value: 'internal', label: 'Apenas internos' }, { value: 'none', label: 'Não permitir' }] },
        { key: 'tickets.inform', label: 'Permitir informar na abertura', type: 'toggles', items: [{ key: 'tickets.inform.service', label: 'Serviço' }, { key: 'tickets.inform.sla_due', label: 'Data de vencimento (SLA)' }, { key: 'tickets.inform.category', label: 'Categoria' }, { key: 'tickets.inform.urgency', label: 'Urgência' }, { key: 'tickets.inform.subject', label: 'Assunto' }, { key: 'tickets.inform.tags', label: 'TAGs' }] },
        { key: 'tickets.kb_suggestions', label: 'Exibir sugestão de artigos da Base de Conhecimento', type: 'toggle' },
      ] },
      { title: 'Listagem e visualização', controls: [
        { key: 'tickets.personal_views', label: 'Criar visualizações pessoais', type: 'toggle' },
        { key: 'tickets.shared_views', label: 'Editar/criar painéis compartilhados', type: 'radio', options: [{ value: 'any', label: 'Qualquer agente' }, { value: 'same_team', label: 'Somente mesma equipe' }, { value: 'none', label: 'Não permitir' }] },
        { key: 'tickets.bulk_actions', label: 'Manutenção coletiva de tickets', type: 'toggle' },
      ] },
    ] },
    { id: 'atendimento', label: 'Atendimento', sections: [
      { controls: [
        { key: 'service.delete_tickets', label: 'Permitir excluir ticket', type: 'toggle' },
        { key: 'service.merge_tickets', label: 'Permitir mesclar tickets', type: 'toggle' },
        { key: 'service.print_ticket', label: 'Permitir imprimir/gerar PDF do ticket', type: 'toggle' },
        { key: 'service.view_sla', label: 'Exibir “Detalhes do SLA” (política, prazos e situação de vencimento)', type: 'toggle' },
        { key: 'service.clone_tickets', label: 'Permitir clonar ticket (abrir cópia com a mesma classificação)', type: 'toggle' },
        { key: 'service.send_email', label: 'Permitir enviar e-mail avulso a partir do ticket', type: 'toggle' },
        { key: 'service.reopen_tickets', label: 'Permitir reabrir ticket', type: 'toggle' },
        { key: 'service.close_tickets', label: 'Permitir encerrar ticket (coordenador e admin já têm por padrão)', type: 'toggle' },
        { key: 'service.collision', label: 'Sinalização de colisão (quem está vendo o ticket)', type: 'toggle' },
        { key: 'service.default_action', label: 'Tipo padrão da ação em tickets públicos', type: 'radio', options: [{ value: 'public', label: 'Ação pública' }, { value: 'internal', label: 'Ação interna' }] },
        { key: 'service.edit_actions', label: 'Permitir edição de ações', type: 'radio', options: [{ value: 'last_own', label: 'Somente a última e de sua autoria' }, { value: 'last_any', label: 'Somente a última, qualquer agente' }, { value: 'any_own', label: 'Qualquer ação de sua autoria' }, { value: 'any_any', label: 'Qualquer ação, qualquer agente' }, { value: 'none', label: 'Não permitir' }] },
        { key: 'service.candidate_kb', label: 'Candidatar ações como artigos KB', type: 'radio', options: [{ value: 'none', label: 'Não permitir' }, { value: 'own', label: 'Qualquer ação de sua autoria' }, { value: 'any_any', label: 'Qualquer ação, qualquer agente' }] },
      ] },
    ] },
    { id: 'policies', label: 'Políticas de acesso', sections: [
      { controls: [
        { key: 'policies.all_catalog', label: 'Acesso a todos os itens do catálogo de serviços', type: 'toggle' },
        { key: 'policies.can_be_assignee', label: 'Pode ser atribuído como responsável', type: 'toggle' },
        { key: 'policies.see_new_column', label: 'Exibir a coluna “Novo” na fila (tickets ainda não distribuídos)', type: 'toggle' },
        { key: 'policies.global_search', label: 'Busca global (lupa) — pesquisar e abrir qualquer chamado, mesmo fora da sua fila', type: 'toggle' },
        { key: 'policies.view_tickets', label: 'Permitir visualizar tickets (defina se enxerga os não distribuídos a ele)', type: 'radio', options: VIEW_SCOPE },
        { key: 'policies.edit_tickets', label: 'Permitir editar tickets', type: 'radio', options: VIEW_SCOPE },
        { key: 'policies.actions_editable', label: 'Criar ações onde tem acesso a edição', type: 'radio', options: ACTION_TYPES },
        { key: 'policies.actions_not_editable', label: 'Criar ações onde NÃO tem acesso a edição', type: 'radio', options: ACTION_TYPES },
      ] },
    ] },
    { id: 'apontamentos', label: 'Apontamentos', sections: [
      { controls: [
        { key: 'time.apontamentos_scope', label: 'Ver apontamentos do ticket', type: 'radio', options: [{ value: 'all', label: 'Todos os apontamentos' }, { value: 'own', label: 'Somente os do usuário logado' }] },
        { key: 'time.view_contract', label: 'Ver contrato no resumo do chamado (tipo e saldo de horas)', type: 'toggle' },
        { key: 'time.see_worked_values', label: 'Ver valores de horas trabalhadas do ticket', type: 'toggle' },
        { key: 'time.contract_summary', label: 'Acessar relatório de resumo do contrato de horas', type: 'toggle' },
        { key: 'time.contract_chart', label: 'Exibir gráfico de consumo de horas do contrato', type: 'toggle' },
        { key: 'time.see_extra_expenses', label: 'Ver despesas extras do ticket', type: 'toggle' },
      ] },
    ] },
  ],
  cliente: [
    { id: 'tickets', label: 'Tickets', sections: [
      { title: 'Abertura de tickets', controls: [
        { key: 'tickets.open', label: 'Permitir que o cliente abra tickets', type: 'radio', options: [{ value: 'any', label: 'Para qualquer cliente' }, { value: 'same_org', label: 'Mesma organização' }, { value: 'own', label: 'Somente em seu nome' }, { value: 'none', label: 'Não permitir' }] },
        { key: 'tickets.inform', label: 'Permitir que o cliente informe na abertura', type: 'toggles', items: [{ key: 'tickets.inform.service', label: 'Serviço' }, { key: 'tickets.inform.category', label: 'Categoria' }, { key: 'tickets.inform.urgency', label: 'Urgência' }, { key: 'tickets.inform.subject', label: 'Assunto' }, { key: 'tickets.inform.tags', label: 'TAGs' }] },
        { key: 'tickets.kb_suggestions', label: 'Exibir sugestão de artigos da Base de Conhecimento', type: 'toggle' },
        { key: 'tickets.open_on_behalf', label: 'Abertura por outras pessoas no nome do cliente', type: 'toggle' },
      ] },
      { title: 'Listagem e visualização', controls: [
        { key: 'tickets.personal_views', label: 'Criar visualizações personalizadas', type: 'toggle' },
        { key: 'tickets.view_tickets', label: 'Permitir que o cliente visualize tickets', type: 'radio', options: [{ value: 'any', label: 'Todos de qualquer cliente' }, { value: 'same_org', label: 'Mesma organização' }, { value: 'own', label: 'Somente em seu nome' }, { value: 'none', label: 'Não permitir' }] },
        { key: 'tickets.view_in', label: 'Permitir que o cliente visualize NO ticket', type: 'toggles', items: [{ key: 'tickets.view_in.service', label: 'Serviço' }, { key: 'tickets.view_in.responsible', label: 'Responsável' }, { key: 'tickets.view_in.category', label: 'Categoria' }, { key: 'tickets.view_in.urgency', label: 'Urgência' }, { key: 'tickets.view_in.sla_due', label: 'SLA (vencimento)' }, { key: 'tickets.view_in.sla_first', label: 'SLA 1ª resposta' }, { key: 'tickets.view_in.status', label: 'Status' }, { key: 'tickets.view_in.justification', label: 'Justificativa' }, { key: 'tickets.view_in.subject', label: 'Assunto' }, { key: 'tickets.view_in.agent_times', label: 'Tempos apontados pelos agentes' }, { key: 'tickets.view_in.tags', label: 'TAGs' }] },
      ] },
    ] },
    { id: 'gerais', label: 'Gerais', sections: [
      { controls: [
        { key: 'general.edit_own_profile', label: 'Visualizar/editar o próprio perfil', type: 'toggle' },
        { key: 'general.default_screen', label: 'Tela padrão após o logon', type: 'radio', options: [{ value: 'principal', label: 'Principal' }, { value: 'tickets', label: 'Listagem de tickets' }] },
      ] },
    ] },
    { id: 'policies', label: 'Políticas de acesso', sections: [
      { controls: [{ key: 'policies.all_catalog', label: 'Acesso a todos os itens do catálogo de serviços', type: 'toggle' }] },
    ] },
    { id: 'apontamentos', label: 'Apontamentos', sections: [
      { controls: [
        { key: 'time.see_worked_values', label: 'Ver valores de horas trabalhadas do ticket', type: 'toggle' },
        { key: 'time.contract_summary', label: 'Acessar relatório de resumo do contrato de horas', type: 'toggle' },
        { key: 'time.contract_chart', label: 'Exibir gráfico de consumo de horas do contrato', type: 'toggle' },
        { key: 'time.see_extra_expenses', label: 'Ver despesas extras do ticket', type: 'toggle' },
      ] },
    ] },
  ],
}

// Toggles ligados por padrão (estilo Movidesk) — o resto começa desligado.
const ON_BY_DEFAULT: Record<Kind, Set<string>> = {
  agent: new Set(['tickets.inform.service', 'tickets.inform.sla_due', 'tickets.inform.category', 'tickets.inform.urgency', 'tickets.inform.subject', 'tickets.inform.tags', 'policies.all_catalog', 'policies.can_be_assignee', 'policies.see_new_column', 'policies.global_search', 'service.merge_tickets', 'service.print_ticket', 'service.view_sla', 'service.clone_tickets', 'service.send_email', 'service.reopen_tickets', 'time.view_contract', 'tickets.personal_views', 'tickets.bulk_actions']),
  cliente: new Set(['tickets.inform.category', 'tickets.inform.subject', 'tickets.personal_views', 'tickets.view_in.service', 'tickets.view_in.responsible', 'tickets.view_in.category', 'tickets.view_in.sla_due', 'tickets.view_in.status', 'tickets.view_in.justification', 'tickets.view_in.subject', 'policies.all_catalog']),
}
function defaultsFor(kind: Kind): Record<string, unknown> {
  const on = ON_BY_DEFAULT[kind]
  const p: Record<string, unknown> = {}
  for (const tab of SCHEMA[kind]) for (const s of tab.sections) for (const c of s.controls) {
    if (c.type === 'radio') p[c.key] = c.options[0].value
    else if (c.type === 'toggle') p[c.key] = on.has(c.key)
    else c.items.forEach(i => { p[i.key] = on.has(i.key) })
  }
  return p
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (b: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-2 text-sm text-left">
      <span className="w-9 h-5 rounded-full p-0.5 transition-colors shrink-0" style={{ background: on ? 'var(--primary)' : 'var(--surface-sunken)' }}>
        <span className="block w-4 h-4 rounded-full transition-transform" style={{ background: 'var(--surface)', transform: on ? 'translateX(16px)' : 'none' }} />
      </span>
      <span style={{ color: 'var(--text)' }}>{label}</span>
    </button>
  )
}

export function AccessProfiles() {
  const [rows, setRows] = useState<AccessProfile[]>([])
  const [editing, setEditing] = useState<AccessProfile | 'new' | null>(null)
  const load = useCallback(() => { api.get<{ data: AccessProfile[] }>('/help-desk/access-profiles?all=1').then(r => setRows(r?.data ?? [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  const del = async (p: AccessProfile) => { if (!confirm(`Excluir "${p.name}"?`)) return; try { await api.delete(`/help-desk/access-profiles/${p.id}`); load() } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') } }

  if (editing) return <AccessProfileForm profile={editing} onBack={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Perfis de acesso vinculados a Agente ou Cliente. Definem o que cada um pode ver/fazer no Help Desk.</p>
        <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => setEditing('new')}><Plus size={15} /> Novo perfil</button>
      </div>
      <div className="ds-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }} className="text-left text-[11px] uppercase">
            <th className="px-3 py-2">Nome</th><th className="px-3 py-2">Perfil de</th><th className="px-3 py-2">Padrão</th><th className="px-3 py-2">Habilitado</th><th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center" style={{ color: 'var(--text-muted)' }}>Nenhum perfil.</td></tr>}
            {rows.map(p => (
              <tr key={p.id} className="border-t ds-row-hover" style={{ borderColor: 'var(--border)' }}>
                <td className="px-3 py-2"><button className="inline-flex items-center gap-1.5 text-left" style={{ color: 'var(--text)' }} onClick={() => setEditing(p)}><ShieldCheck size={14} style={{ color: 'var(--primary)' }} />{p.name}</button></td>
                <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{p.kind === 'agent' ? 'Agente' : 'Cliente'}</td>
                <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{p.is_default ? 'Sim' : 'Não'}</td>
                <td className="px-3 py-2"><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: p.enabled ? 'var(--success-bg)' : 'var(--surface-sunken)', color: p.enabled ? 'var(--success-border)' : 'var(--text-muted)' }}>{p.enabled ? 'Sim' : 'Não'}</span></td>
                <td className="px-3 py-2 text-right whitespace-nowrap"><button className="mr-2" title="Editar" onClick={() => setEditing(p)}><Pencil size={14} style={{ color: 'var(--primary)' }} /></button><button title="Excluir" onClick={() => del(p)}><Trash2 size={15} style={{ color: 'var(--danger-border)' }} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AccessProfileForm({ profile, onBack, onSaved }: { profile: AccessProfile | 'new'; onBack: () => void; onSaved: () => void }) {
  const p = profile === 'new' ? null : profile
  const [name, setName] = useState(p?.name ?? '')
  const [kind, setKind] = useState<Kind>(p?.kind ?? 'agent')
  const [isDefault, setIsDefault] = useState(p?.is_default ?? false)
  const [enabled, setEnabled] = useState(p?.enabled ?? true)
  const [perms, setPerms] = useState<Record<string, unknown>>(() => ({ ...defaultsFor(p?.kind ?? 'agent'), ...(p?.permissions ?? {}) }))
  const [tab, setTab] = useState(SCHEMA[p?.kind ?? 'agent'][0].id)
  const [saving, setSaving] = useState(false)

  const switchKind = (k: Kind) => { setKind(k); setPerms({ ...defaultsFor(k), ...(p?.kind === k ? (p?.permissions ?? {}) : {}) }); setTab(SCHEMA[k][0].id) }
  const set = (key: string, v: unknown) => setPerms(s => ({ ...s, [key]: v }))

  const save = async () => {
    if (!name.trim()) return toast.error('Informe o nome.')
    setSaving(true)
    const body = { name: name.trim(), kind, is_default: isDefault, enabled, permissions: perms }
    try {
      if (p) await api.put(`/help-desk/access-profiles/${p.id}`, body); else await api.post('/help-desk/access-profiles', body)
      toast.success('Perfil salvo'); onSaved()
    } catch { toast.error('Erro ao salvar') } finally { setSaving(false) }
  }

  const tabs = SCHEMA[kind]
  const current = tabs.find(t => t.id === tab) ?? tabs[0]

  return (
    <div className="space-y-3 max-w-3xl">
      <button onClick={onBack} className="text-sm" style={{ color: 'var(--text-muted)' }}>← Voltar</button>
      <div className="ds-card p-4 space-y-3">
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Nome</label><input className={`${fieldCls} w-full max-w-md`} style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--text-light)' }}>Perfil para:</span>
          {(['cliente', 'agent'] as Kind[]).map(k => (
            <button key={k} onClick={() => switchKind(k)} className="text-sm px-3 py-1 rounded-lg" style={{ background: kind === k ? 'var(--primary-soft)' : 'transparent', color: kind === k ? 'var(--primary)' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
              {kind === k ? '✓ ' : ''}{k === 'cliente' ? 'CLIENTES' : 'AGENTES'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}><input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} /> Usar este perfil por padrão ao cadastrar novas pessoas <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>(apenas 1 por tipo)</span></label>
        <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text)' }}>
          <label className="flex items-center gap-1.5"><input type="radio" checked={enabled} onChange={() => setEnabled(true)} /> Habilitado</label>
          <label className="flex items-center gap-1.5"><input type="radio" checked={!enabled} onChange={() => setEnabled(false)} /> Desabilitado</label>
        </div>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className="px-3 py-2 text-sm font-medium whitespace-nowrap" style={{ color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)', borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent' }}>{t.label}</button>
        ))}
      </div>

      <div className="ds-card p-4 space-y-4">
        {current.sections.map((sec, si) => (
          <div key={si} className="space-y-2">
            {sec.title && <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-light)' }}>{sec.title}</div>}
            {sec.controls.map(c => (
              <div key={c.key} className="space-y-1">
                {c.type === 'toggle' && <Toggle on={!!perms[c.key]} onChange={v => set(c.key, v)} label={c.label} />}
                {c.type === 'radio' && (
                  <div>
                    <div className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{c.label}</div>
                    <div className="space-y-0.5 pl-1">
                      {c.options.map(o => (
                        <label key={o.value} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                          <input type="radio" checked={perms[c.key] === o.value} onChange={() => set(c.key, o.value)} /> {o.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {c.type === 'toggles' && (
                  <div>
                    <div className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{c.label}</div>
                    <div className="grid grid-cols-2 gap-1 pl-1">
                      {c.items.map(i => <Toggle key={i.key} on={!!perms[i.key]} onChange={v => set(i.key, v)} label={i.label} />)}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="flex justify-end"><button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg" onClick={save} disabled={saving}><Save size={14} /> Salvar perfil</button></div>
    </div>
  )
}

// ── Pessoas do Help Desk — vínculo usuário ↔ perfil de acesso (+ departamento p/ clientes) ──
interface Person { id: number; name: string; type: string; helpdesk_access_profile_id: number | null; customer_id?: number | null; helpdesk_department_id?: number | null }
interface Dept { id: number; name: string; active: boolean }
export function HelpDeskPeople() {
  const [kind, setKind] = useState<Kind>('agent')
  const [people, setPeople] = useState<Person[]>([])
  const [profiles, setProfiles] = useState<AccessProfile[]>([])
  // Departamentos por cliente (só carregados no modo 'cliente'). Escopo por customer_id.
  const [deptsByCustomer, setDeptsByCustomer] = useState<Record<number, Dept[]>>({})
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkProfile, setBulkProfile] = useState('')
  const load = useCallback(() => {
    api.get<{ data: Person[] }>(`/help-desk/people?kind=${kind}`).then(r => {
      const ppl = r?.data ?? []
      setPeople(ppl)
      if (kind === 'cliente') {
        const custIds = Array.from(new Set(ppl.map(p => p.customer_id).filter((x): x is number => !!x)))
        Promise.all(custIds.map(cid =>
          api.get<{ data: Dept[] }>(`/help-desk/departments?customer_id=${cid}`)
            .then(r => [cid, (r?.data ?? []).filter(d => d.active)] as const).catch(() => [cid, [] as Dept[]] as const)
        )).then(pairs => setDeptsByCustomer(Object.fromEntries(pairs)))
      } else {
        setDeptsByCustomer({})
      }
    }).catch(() => {})
    api.get<{ data: AccessProfile[] }>(`/help-desk/access-profiles?all=1&kind=${kind}`).then(r => setProfiles((r?.data ?? []).filter(p => p.enabled))).catch(() => {})
  }, [kind])
  useEffect(() => { load(); setSelected(new Set()); setTypeFilter('') }, [load])
  const setProfile = async (userId: number, profileId: string) => {
    try {
      await api.patch(`/help-desk/people/${userId}/access-profile`, { access_profile_id: profileId ? Number(profileId) : null })
      setPeople(ps => ps.map(p => p.id === userId ? { ...p, helpdesk_access_profile_id: profileId ? Number(profileId) : null } : p))
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao vincular') }
  }
  const setDept = async (userId: number, deptId: string) => {
    try {
      await api.patch(`/help-desk/people/${userId}/department`, { helpdesk_department_id: deptId ? Number(deptId) : null })
      setPeople(ps => ps.map(p => p.id === userId ? { ...p, helpdesk_department_id: deptId ? Number(deptId) : null } : p))
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao vincular departamento') }
  }
  const types = Array.from(new Set(people.map(p => p.type))).sort()
  const filtered = people.filter(p => p.name.toLowerCase().includes(q.trim().toLowerCase()) && (!typeFilter || p.type === typeFilter))

  const toggleOne = (id: number) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id))
  const toggleAll = () => setSelected(s => {
    const n = new Set(s)
    if (allSelected) filtered.forEach(p => n.delete(p.id)); else filtered.forEach(p => n.add(p.id))
    return n
  })
  const bulkApply = async () => {
    const ids = Array.from(selected)
    if (!ids.length) return
    try {
      const r = await api.patch<{ data: { applied: number; skipped: number } }>('/help-desk/people/access-profile/bulk', { user_ids: ids, access_profile_id: bulkProfile ? Number(bulkProfile) : null })
      const pid = bulkProfile ? Number(bulkProfile) : null
      setPeople(ps => ps.map(p => selected.has(p.id) && !(pid && (p.type === 'cliente') !== (profiles.find(pr => pr.id === pid)?.kind === 'cliente')) ? { ...p, helpdesk_access_profile_id: pid } : p))
      toast.success(`${r?.data?.applied ?? ids.length} pessoa(s) atualizada(s)${r?.data?.skipped ? `, ${r.data.skipped} puladas (tipo incompatível)` : ''}`)
      setSelected(new Set())
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro na atualização em massa') }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Vincule o perfil de acesso de cada pessoa. Perfil de agente para agentes; perfil de cliente para clientes.</p>
      <div className="flex items-center gap-2 flex-wrap">
        {(['agent', 'cliente'] as Kind[]).map(k => (
          <button key={k} onClick={() => { setKind(k); setQ('') }} className="text-sm px-3 py-1.5 rounded-lg" style={{ background: kind === k ? 'var(--primary-soft)' : 'var(--surface)', color: kind === k ? 'var(--primary)' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
            {k === 'agent' ? 'Agentes' : 'Clientes'}
          </button>
        ))}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
          <input className={`${fieldCls} pl-8 w-full`} style={inputStyle} placeholder="Buscar pessoa…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className={fieldCls} style={inputStyle} value={typeFilter} onChange={e => setTypeFilter(e.target.value)} title="Perfil de usuário">
          <option value="">Todos os perfis</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Atualização em massa */}
      {selected.size > 0 && (
        <div className="ds-card p-2.5 flex items-center gap-2 flex-wrap" style={{ borderColor: 'var(--primary)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--primary)' }}>{selected.size} selecionada(s)</span>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>aplicar perfil:</span>
          <select className={fieldCls} style={inputStyle} value={bulkProfile} onChange={e => setBulkProfile(e.target.value)}>
            <option value="">— sem perfil —</option>
            {profiles.map(pr => <option key={pr.id} value={pr.id}>{pr.name}{pr.is_default ? ' (padrão)' : ''}</option>)}
          </select>
          <button onClick={bulkApply} className="ds-btn-primary text-sm px-3 py-1.5 rounded-lg">Aplicar aos selecionados</button>
          <button onClick={() => setSelected(new Set())} className="text-sm px-2 py-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}>Limpar seleção</button>
        </div>
      )}
      <div className="ds-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }} className="text-left text-[11px] uppercase">
            <th className="px-3 py-2 w-8"><input type="checkbox" checked={allSelected} onChange={toggleAll} title="Selecionar todos" /></th>
            <th className="px-3 py-2">Nome</th><th className="px-3 py-2">Perfil de usuário</th><th className="px-3 py-2">Perfil de acesso</th>
            {kind === 'cliente' && <th className="px-3 py-2">Departamento</th>}
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={kind === 'cliente' ? 5 : 4} className="px-3 py-6 text-center" style={{ color: 'var(--text-muted)' }}>Nenhuma pessoa.</td></tr>}
            {filtered.map(p => (
              <tr key={p.id} className="border-t" style={{ borderColor: selected.has(p.id) ? 'var(--primary)' : 'var(--border)', background: selected.has(p.id) ? 'var(--primary-soft)' : 'transparent' }}>
                <td className="px-3 py-2"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} /></td>
                <td className="px-3 py-2" style={{ color: 'var(--text)' }}>{p.name}</td>
                <td className="px-3 py-2 text-[11px]" style={{ color: 'var(--text-light)' }}>{p.type}</td>
                <td className="px-3 py-2">
                  <select className={`${fieldCls} max-w-xs`} style={inputStyle} value={p.helpdesk_access_profile_id ?? ''} onChange={e => setProfile(p.id, e.target.value)}>
                    <option value="">— sem perfil —</option>
                    {profiles.map(pr => <option key={pr.id} value={pr.id}>{pr.name}{pr.is_default ? ' (padrão)' : ''}</option>)}
                  </select>
                </td>
                {kind === 'cliente' && (
                  <td className="px-3 py-2">
                    {(() => {
                      const deps = p.customer_id ? (deptsByCustomer[p.customer_id] ?? []) : []
                      if (!p.customer_id) return <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>sem cliente</span>
                      return (
                        <select className={`${fieldCls} max-w-xs`} style={inputStyle} value={p.helpdesk_department_id ?? ''} onChange={e => setDept(p.id, e.target.value)} title={deps.length === 0 ? 'Cadastre departamentos deste cliente na aba Departamentos' : ''}>
                          <option value="">— sem departamento —</option>
                          {deps.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      )
                    })()}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length >= 500 && <p className="text-[11px]" style={{ color: 'var(--text-light)' }}>Mostrando os primeiros 500 — refine a busca.</p>}
    </div>
  )
}
