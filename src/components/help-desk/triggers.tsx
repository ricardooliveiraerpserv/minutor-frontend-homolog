'use client'

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Trash2, Save, Pencil, Zap, ChevronLeft, Wand2, Eye, X, LayoutTemplate, Code2, ChevronDown } from 'lucide-react'
import { EmailFrame } from '@/components/help-desk/email-frame'
import { isHtmlBody, sanitizeEmail } from '@/lib/sanitize-html'

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'text-sm rounded-lg px-2.5 py-1.5 outline-none'
const lbl = 'text-[11px] font-semibold block mb-0.5'

interface Opt { id: number | string; name?: string; label?: string; key?: string; email?: string; parent_id?: number | null }
interface CatalogField { key: string; label: string; type: 'text' | 'number' | 'bool' | 'enum' | 'select'; operators: string[]; source?: string }
interface Meta {
  events: Record<string, string>; catalog: CatalogField[]; operators: Record<string, string>
  actionTypes: Record<string, string>; recipients: Record<string, string>
  blocks: Record<string, string>
  channels: Opt[]; priorities: Opt[]; commentBy: Opt[]
  statuses: Opt[]; categories: Opt[]; services: Opt[]; teams: Opt[]; tags: Opt[]; agents: Opt[]; justifications: Opt[]; accounts: Opt[]; placeholders: string[]
}
const sourceOf = (m: Meta, key?: string): Opt[] => key ? ((m as unknown as Record<string, Opt[]>)[key] ?? []) : []
interface RecipeInput { k: string; label: string; type: string }
interface Recipe { key: string; name: string; icon: string; desc: string; inputs: RecipeInput[] }
interface Cond { field: string; operator: string; value: unknown; group?: 'all' | 'any' }
interface Action { type: string; params: Record<string, unknown> }
interface Trigger {
  id: number; name: string; enabled: boolean; event: string; condition_logic: string
  conditions: Cond[] | null; actions: Action[] | null; recipe: string | null; created_by?: { name?: string } | null
}

type View = 'list' | 'choose' | { recipe: Recipe } | { trigger: Trigger | 'new' }

export function Triggers() {
  const [rows, setRows] = useState<Trigger[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [view, setView] = useState<View>('list')

  const load = useCallback(() => { api.get<{ data: Trigger[] }>('/help-desk/triggers').then(r => setRows(r?.data ?? [])).catch(() => {}) }, [])
  useEffect(() => {
    load()
    api.get<{ data: Meta }>('/help-desk/triggers/meta').then(r => setMeta(r?.data ?? null)).catch(() => {})
    api.get<{ data: Recipe[] }>('/help-desk/triggers/recipes').then(r => setRecipes(r?.data ?? [])).catch(() => {})
  }, [load])

  const toggle = async (t: Trigger) => { try { await api.put(`/help-desk/triggers/${t.id}`, { enabled: !t.enabled }); setRows(rs => rs.map(x => x.id === t.id ? { ...x, enabled: !x.enabled } : x)) } catch { toast.error('Erro') } }
  const del = async (t: Trigger) => { if (!confirm(`Excluir "${t.name}"?`)) return; try { await api.delete(`/help-desk/triggers/${t.id}`); load() } catch { toast.error('Erro') } }

  const [preview, setPreview] = useState<{ name: string; mode: string; subject: string; html?: string; body?: string; footer?: string; sample: string } | null>(null)
  const emailActionOf = (t: Trigger) => (t.actions ?? []).find(a => a.type === 'send_email')
  const openPreview = async (t: Trigger) => {
    const ea = emailActionOf(t); if (!ea) return
    const pr = ea.params ?? {}
    const isTpl = pr.layout === 'template' || (pr.message !== undefined && pr.body === undefined)
    const payload = isTpl
      ? { subject: String(pr.subject ?? ''), notification_title: String(pr.notification_title ?? ''), notification_subtitle: String(pr.notification_subtitle ?? ''), message: String(pr.message ?? ''), blocks: (pr.blocks as string[]) ?? [], to: (pr.to as string[]) ?? [] }
      : { subject: String(pr.subject ?? ''), body: String(pr.body ?? '') }
    try {
      const r = await api.post<{ data: { mode: string; subject: string; html?: string; body?: string; footer?: string; sample: string } }>('/help-desk/triggers/preview-email', payload)
      setPreview({ name: t.name, ...(r?.data ?? { mode: 'raw', subject: '', sample: '' }) })
    } catch { toast.error('Erro ao gerar prévia') }
  }

  const done = () => { setView('list'); load() }

  if (view === 'choose') return <Chooser recipes={recipes} onPick={r => setView({ recipe: r })} onAdvanced={() => setView({ trigger: 'new' })} onBack={() => setView('list')} />
  if (typeof view === 'object' && 'recipe' in view && meta) return <RecipeForm recipe={view.recipe} meta={meta} onBack={() => setView('choose')} onSaved={done} />
  if (typeof view === 'object' && 'trigger' in view && meta) return <AdvancedForm trigger={view.trigger} meta={meta} onBack={() => setView('list')} onSaved={done} />

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Automações: <b>quando</b> algo acontece num chamado, <b>faça</b> ações (enviar e-mail, mudar status, alterar campo, tags). Sem precisar de desenvolvimento.</p>
        <button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg" onClick={() => setView('choose')}><Plus size={15} /> Nova automação</button>
      </div>
      <div className="ds-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }} className="text-left text-[11px] uppercase">
            <th className="px-3 py-2">Nome</th><th className="px-3 py-2">Quando</th><th className="px-3 py-2">Habilitado</th><th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center" style={{ color: 'var(--text-muted)' }}>Nenhuma automação ainda.</td></tr>}
            {rows.map(t => (
              <tr key={t.id} className="border-t ds-row-hover" style={{ borderColor: 'var(--border)' }}>
                <td className="px-3 py-2"><button className="text-left inline-flex items-center gap-1.5" style={{ color: 'var(--text)' }} onClick={() => setView({ trigger: t })}>
                  {t.recipe ? <Wand2 size={13} style={{ color: 'var(--primary)' }} /> : <Zap size={13} style={{ color: 'var(--text-light)' }} />}{t.name}</button></td>
                <td className="px-3 py-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>{meta?.events[t.event] ?? t.event}</td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => toggle(t)} className="w-9 h-5 rounded-full p-0.5 transition-colors" style={{ background: t.enabled ? 'var(--primary)' : 'var(--surface-sunken)' }}>
                    <span className="block w-4 h-4 rounded-full transition-transform" style={{ background: 'var(--surface)', transform: t.enabled ? 'translateX(16px)' : 'none' }} />
                  </button>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {emailActionOf(t) && <button className="mr-2" title="Pré-visualizar e-mail" onClick={() => openPreview(t)}><Eye size={14} style={{ color: 'var(--primary)' }} /></button>}
                  <button className="mr-2" title="Editar" onClick={() => setView({ trigger: t })}><Pencil size={14} style={{ color: 'var(--primary)' }} /></button>
                  <button title="Excluir" onClick={() => del(t)}><Trash2 size={15} style={{ color: 'var(--danger-border)' }} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setPreview(null)}>
          <div className="w-full max-w-2xl rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>Prévia do e-mail · {preview.name}</div>
              <button onClick={() => setPreview(null)}><X size={16} style={{ color: 'var(--text-light)' }} /></button>
            </div>
            <div className="px-4 py-2 text-[12px]" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>Assunto: <span style={{ color: 'var(--text)' }}>{preview.subject || '—'}</span></div>
            <div className="max-h-[68vh] overflow-auto">
              {preview.mode === 'template' && preview.html
                ? <EmailFrame html={preview.html} />
                : <div className="p-4" style={{ background: '#ffffff', color: '#1f2937' }}>{preview.body && isHtmlBody(preview.body) ? <div className="text-sm" dangerouslySetInnerHTML={{ __html: sanitizeEmail(preview.body) }} /> : <div className="text-sm whitespace-pre-wrap">{preview.body || '—'}</div>}{preview.footer && <div dangerouslySetInnerHTML={{ __html: preview.footer }} />}</div>}
            </div>
            <div className="px-4 py-2 text-[11px]" style={{ color: 'var(--text-light)', borderTop: '1px solid var(--border)' }}>Renderizado com dados do chamado {preview.sample}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function Chooser({ recipes, onPick, onAdvanced, onBack }: { recipes: Recipe[]; onPick: (r: Recipe) => void; onAdvanced: () => void; onBack: () => void }) {
  return (
    <div className="space-y-4 max-w-3xl">
      <button onClick={onBack} className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><ChevronLeft size={15} /> Voltar</button>
      <div>
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Receitas prontas (recomendado)</h3>
        <div className="grid grid-cols-2 gap-2">
          {recipes.map(r => (
            <button key={r.key} onClick={() => onPick(r)} className="ds-card p-3 text-left hover:border-[var(--primary)] transition-colors" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text)' }}><Wand2 size={14} style={{ color: 'var(--primary)' }} /> {r.name}</div>
              <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>{r.desc}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        <button onClick={onAdvanced} className="text-sm inline-flex items-center gap-1.5" style={{ color: 'var(--primary)' }}><Zap size={14} /> Criar do zero (avançado) — monte condições e ações livres</button>
      </div>
    </div>
  )
}

function RecipeForm({ recipe, meta, onBack, onSaved }: { recipe: Recipe; meta: Meta; onBack: () => void; onSaved: () => void }) {
  const [name, setName] = useState(recipe.name)
  const [inputs, setInputs] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: unknown) => setInputs(o => ({ ...o, [k]: v }))

  const save = async () => {
    setSaving(true)
    try { await api.post('/help-desk/triggers/apply-recipe', { recipe: recipe.key, inputs: { ...inputs, name } }); toast.success('Automação criada'); onSaved() }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-3 max-w-xl">
      <button onClick={onBack} className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><ChevronLeft size={15} /> Voltar</button>
      <div className="ds-card p-4 space-y-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--text)' }}><Wand2 size={15} style={{ color: 'var(--primary)' }} /> {recipe.name}</div>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{recipe.desc}</p>
        <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Nome da automação</label><input className={`${fieldCls} w-full`} style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></div>
        {recipe.inputs.map(inp => (
          <div key={inp.k}><label className={lbl} style={{ color: 'var(--text-light)' }}>{inp.label}</label><RecipeInputCtl inp={inp} meta={meta} value={inputs[inp.k]} onChange={v => set(inp.k, v)} /></div>
        ))}
        <div className="flex justify-end"><button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg" onClick={save} disabled={saving}><Save size={14} /> Criar automação</button></div>
      </div>
    </div>
  )
}

function RecipeInputCtl({ inp, meta, value, onChange }: { inp: RecipeInput; meta: Meta; value: unknown; onChange: (v: unknown) => void }) {
  if (inp.type === 'recipient') return (
    <select className={`${fieldCls} w-full`} style={inputStyle} value={String(value ?? '')} onChange={e => onChange(e.target.value)}>
      <option value="">— selecione —</option>
      {Object.entries(meta.recipients).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  )
  if (inp.type === 'channels') return (
    <div className="flex flex-wrap gap-2 pt-1">
      {meta.channels.map(c => { const id = String(c.id); const arr = (value as string[]) ?? []; const on = arr.includes(id); return (
        <button key={id} type="button" onClick={() => onChange(on ? arr.filter(x => x !== id) : [...arr, id])} className="text-xs px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', background: on ? 'var(--primary-soft)' : 'transparent', color: on ? 'var(--primary)' : 'var(--text-muted)' }}>{c.name ?? id}</button>
      ) })}
    </div>
  )
  if (inp.type === 'status') return <SelectOpt opts={meta.statuses} value={value} onChange={onChange} label="status" />
  if (inp.type === 'service') return <SelectOpt opts={meta.services} value={value} onChange={onChange} label="serviço" />
  if (inp.type === 'field') return (
    <select className={`${fieldCls} w-full`} style={inputStyle} value={String(value ?? '')} onChange={e => onChange(e.target.value)}>
      <option value="">— selecione —</option>
      <option value="team_id">Equipe</option><option value="category_id">Categoria</option><option value="priority">Urgência</option><option value="level">Nível</option>
    </select>
  )
  if (inp.type === 'fieldvalue') return <input className={`${fieldCls} w-full`} style={inputStyle} value={String(value ?? '')} onChange={e => onChange(e.target.value)} placeholder="ID da equipe/categoria ou valor (baixa/media/alta/urgente)" />
  return <input className={`${fieldCls} w-full`} style={inputStyle} value={String(value ?? '')} onChange={e => onChange(e.target.value)} />
}

function SelectOpt({ opts, value, onChange, label }: { opts: Opt[]; value: unknown; onChange: (v: unknown) => void; label: string }) {
  return (
    <select className={`${fieldCls} w-full`} style={inputStyle} value={String(value ?? '')} onChange={e => onChange(e.target.value ? Number(e.target.value) : '')}>
      <option value="">— selecione {label} —</option>
      {opts.map(o => <option key={o.id} value={o.id}>{o.name ?? o.label}</option>)}
    </select>
  )
}

function AdvancedForm({ trigger, meta, onBack, onSaved }: { trigger: Trigger | 'new'; meta: Meta; onBack: () => void; onSaved: () => void }) {
  const t = trigger === 'new' ? null : trigger
  const [name, setName] = useState(t?.name ?? '')
  const [event, setEvent] = useState(t?.event ?? 'ticket_created')
  const initConds = t?.conditions ?? []
  // Legado sem 'group': se condition_logic='any', cai no grupo QUALQUER; senão, TODAS.
  const legacyAny = t?.condition_logic === 'any'
  const [condsAll, setCondsAll] = useState<Cond[]>(initConds.filter(c => (c.group ?? (legacyAny ? 'any' : 'all')) === 'all'))
  const [condsAny, setCondsAny] = useState<Cond[]>(initConds.filter(c => (c.group ?? (legacyAny ? 'any' : 'all')) === 'any'))
  const [actions, setActions] = useState<Action[]>(t?.actions ?? [{ type: 'send_email', params: { to: ['responsavel'], subject: 'Chamado {ticket.number} atribuído a você', layout: 'template', message: '', blocks: ['ticket_data', 'button'] } }])
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) return toast.error('Dê um nome.')
    setSaving(true)
    const conditions = [
      ...condsAll.map(c => ({ ...c, group: 'all' as const })),
      ...condsAny.map(c => ({ ...c, group: 'any' as const })),
    ]
    const body = { name: name.trim(), event, condition_logic: 'all', conditions, actions }
    try { if (t) await api.put(`/help-desk/triggers/${t.id}`, body); else await api.post('/help-desk/triggers', body); toast.success('Automação salva'); onSaved() }
    catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-3 max-w-4xl">
      <button onClick={onBack} className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><ChevronLeft size={15} /> Voltar</button>
      <div className="ds-card p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Nome</label><input className={`${fieldCls} w-full`} style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></div>
          <div><label className={lbl} style={{ color: 'var(--text-light)' }}>Quando (evento)</label>
            <select className={`${fieldCls} w-full`} style={inputStyle} value={event} onChange={e => setEvent(e.target.value)}>
              {Object.entries(meta.events).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="border-t pt-3 space-y-3" style={{ borderColor: 'var(--border)' }}>
          <label className={lbl} style={{ color: 'var(--text-light)' }}>Se (condições)</label>
          <CondGroup title="Atende TODAS as condições (E)" hint="O gatilho roda só se TODAS forem atendidas." meta={meta} conds={condsAll} setConds={setCondsAll} />
          <CondGroup title="Atende QUALQUER condição (OU)" hint="O gatilho roda se UMA ou mais forem atendidas." meta={meta} conds={condsAny} setConds={setCondsAny} />
        </div>

        <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <label className={lbl + ' mb-2'} style={{ color: 'var(--text-light)' }}>Faça (ações)</label>
          {actions.map((a, i) => (
            <div key={i} className="rounded-lg p-2.5 mb-2" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <select className={`${fieldCls}`} style={inputStyle} value={a.type} onChange={e => setActions(as => as.map((x, j) => j === i ? { type: e.target.value, params: {} } : x))}>
                  {Object.entries(meta.actionTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button className="ml-auto" onClick={() => setActions(as => as.filter((_, j) => j !== i))}><Trash2 size={14} style={{ color: 'var(--danger-border)' }} /></button>
              </div>
              <ActionParams action={a} meta={meta} onChange={p => setActions(as => as.map((x, j) => j === i ? { ...x, params: p } : x))} />
            </div>
          ))}
          <button onClick={() => setActions(as => [...as, { type: 'change_status', params: {} }])} className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}><Plus size={13} /> ação</button>
        </div>

        <div className="flex justify-end"><button className="ds-btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg" onClick={save} disabled={saving}><Save size={14} /> Salvar automação</button></div>
      </div>
    </div>
  )
}

function CondGroup({ title, hint, meta, conds, setConds }: { title: string; hint: string; meta: Meta; conds: Cond[]; setConds: Dispatch<SetStateAction<Cond[]>> }) {
  return (
    <div className="rounded-lg p-2.5" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
      <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{title}</div>
      <div className="text-[10px] mb-2" style={{ color: 'var(--text-light)' }}>{hint}</div>
      {conds.map((c, i) => { const fld = meta.catalog.find(f => f.key === c.field); return (
        <div key={i} className="flex flex-wrap items-center gap-1.5 mb-1.5">
          <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>Se</span>
          <select className={`${fieldCls} flex-1 min-w-0`} style={inputStyle} value={c.field} onChange={e => { const nf = meta.catalog.find(f => f.key === e.target.value); setConds(cs => cs.map((x, j) => j === i ? { field: e.target.value, operator: nf?.operators[0] ?? 'eq', value: '' } : x)) }}>
            <option value="">— campo —</option>{meta.catalog.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <select className={`${fieldCls} flex-1 min-w-0`} style={inputStyle} value={c.operator} onChange={e => setConds(cs => cs.map((x, j) => j === i ? { ...x, operator: e.target.value } : x))}>
            {(fld?.operators ?? Object.keys(meta.operators)).map(k => <option key={k} value={k}>{meta.operators[k]}</option>)}
          </select>
          <CondValue fld={fld} opts={fld?.source ? sourceOf(meta, fld.source) : null} value={c.value} onChange={v => setConds(cs => cs.map((x, j) => j === i ? { ...x, value: v } : x))} />
          <button onClick={() => setConds(cs => cs.filter((_, j) => j !== i))}><Trash2 size={14} style={{ color: 'var(--danger-border)' }} /></button>
        </div>
      ) })}
      <button onClick={() => setConds(cs => [...cs, { field: '', operator: 'eq', value: '' }])} className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}><Plus size={13} /> condição</button>
    </div>
  )
}

function CondValue({ fld, opts, value, onChange }: { fld?: CatalogField; opts: Opt[] | null; value: unknown; onChange: (v: unknown) => void }) {
  if (!fld) return <input className={`${fieldCls} flex-1 min-w-0`} style={inputStyle} value={String(value ?? '')} onChange={e => onChange(e.target.value)} placeholder="valor" />
  if (fld.type === 'bool') return <span className="text-[11px] flex-1" style={{ color: 'var(--text-light)' }}>(definido pelo operador sim/não)</span>
  if (fld.type === 'number') return <input type="number" className={`${fieldCls} flex-1 min-w-0`} style={inputStyle} value={String(value ?? '')} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} placeholder="número" />
  if (fld.type === 'text') return <input className={`${fieldCls} flex-1 min-w-0`} style={inputStyle} value={String(value ?? '')} onChange={e => onChange(e.target.value)} placeholder="texto" />
  // enum (string id) | select (numeric id)
  const numeric = fld.type === 'select'
  return (
    <select className={`${fieldCls} flex-1 min-w-0`} style={inputStyle} value={String(value ?? '')} onChange={e => onChange(e.target.value === '' ? '' : (numeric ? Number(e.target.value) : e.target.value))}>
      <option value="">—</option>
      {(opts ?? []).map(o => <option key={String(o.id)} value={String(o.id)}>{o.name ?? o.label}</option>)}
    </select>
  )
}

interface EmailTpl { key: string; name: string; subject: string; message: string; blocks: string[] }
function SendEmailParams({ p, setMany, set, meta }: { p: Record<string, unknown>; setMany: (o: Record<string, unknown>) => void; set: (k: string, v: unknown) => void; meta: Meta }) {
  const isRaw = p.layout === 'raw' || (p.body !== undefined && p.message === undefined)
  const mode: 'template' | 'raw' = isRaw ? 'raw' : 'template'
  const to = (p.to as string[]) ?? []
  const blocks = (p.blocks as string[]) ?? []
  const [pv, setPv] = useState<{ mode: string; subject: string; html?: string; body?: string; footer?: string; sample: string } | null>(null)
  const [tpls, setTpls] = useState<EmailTpl[]>([])
  const [showTpl, setShowTpl] = useState(false)
  const [showBlocks, setShowBlocks] = useState(false)
  const [showVars, setShowVars] = useState(false)

  useEffect(() => {
    const h = setTimeout(async () => {
      try {
        const payload = mode === 'template'
          ? { subject: String(p.subject ?? ''), notification_title: String(p.notification_title ?? ''), notification_subtitle: String(p.notification_subtitle ?? ''), message: String(p.message ?? ''), blocks, to }
          : { subject: String(p.subject ?? ''), body: String(p.body ?? '') }
        const r = await api.post<{ data: typeof pv }>('/help-desk/triggers/preview-email', payload)
        setPv(r?.data ?? null)
      } catch { /* silencioso na prévia ao vivo */ }
    }, 400)
    return () => clearTimeout(h)
  }, [p.subject, p.message, p.body, JSON.stringify(blocks), JSON.stringify(to), mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const openTpls = () => { setShowTpl(s => !s); if (!tpls.length) api.get<{ data: EmailTpl[] }>('/help-desk/triggers/email-templates').then(r => setTpls(r?.data ?? [])).catch(() => {}) }
  const applyTpl = (t: EmailTpl) => { setMany({ layout: 'template', subject: t.subject, message: t.message, blocks: t.blocks, body: undefined }); setShowTpl(false) }
  const toggleBlock = (b: string) => setMany({ blocks: blocks.includes(b) ? blocks.filter(x => x !== b) : [...blocks, b], layout: 'template' })

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>Para:</span>
        {Object.entries(meta.recipients).map(([k, v]) => { const on = to.includes(k); return (
          <button key={k} type="button" onClick={() => set('to', on ? to.filter(x => x !== k) : [...to, k])} className="text-xs px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', background: on ? 'var(--primary-soft)' : 'transparent', color: on ? 'var(--primary)' : 'var(--text-muted)' }}>{v}</button>
        ) })}
        <div className="ml-auto flex items-center gap-1 text-[11px]">
          <button type="button" onClick={() => setMany({ layout: 'template', message: String(p.message ?? ''), blocks: blocks.length ? blocks : ['ticket_data', 'button'], body: undefined })} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', background: mode === 'template' ? 'var(--primary-soft)' : 'transparent', color: mode === 'template' ? 'var(--primary)' : 'var(--text-muted)' }}><LayoutTemplate size={12} /> Institucional</button>
          <button type="button" onClick={() => setMany({ layout: 'raw', body: String(p.body ?? '') })} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', background: mode === 'raw' ? 'var(--primary-soft)' : 'transparent', color: mode === 'raw' ? 'var(--primary)' : 'var(--text-muted)' }}><Code2 size={12} /> HTML avançado</button>
        </div>
      </div>

      <input className={`${fieldCls} w-full`} style={inputStyle} value={String(p.subject ?? '')} onChange={e => set('subject', e.target.value)} placeholder="Assunto — ex.: Chamado {ticket.number} atribuído a você" />

      {mode === 'template' ? <>
        <input className={`${fieldCls} w-full`} style={inputStyle} value={String(p.notification_title ?? '')} onChange={e => set('notification_title', e.target.value)} placeholder="Título da notificação — ex.: 🔔 Chamados unificados" />
        <input className={`${fieldCls} w-full`} style={inputStyle} value={String(p.notification_subtitle ?? '')} onChange={e => set('notification_subtitle', e.target.value)} placeholder="Descrição curta — ex.: Sua solicitação foi vinculada a um chamado já existente." />
        <div className="relative">
          <button type="button" onClick={openTpls} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--primary)' }}><LayoutTemplate size={13} /> Usar um modelo <ChevronDown size={12} /></button>
          {showTpl && (
            <div className="absolute z-10 mt-1 w-72 max-h-60 overflow-auto rounded-lg" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              {tpls.map(t => <button key={t.key} onClick={() => applyTpl(t)} className="block w-full text-left px-2.5 py-1.5 ds-row-hover text-sm" style={{ color: 'var(--text)' }}>{t.name}</button>)}
            </div>
          )}
        </div>
        <textarea className={`${fieldCls} w-full`} style={inputStyle} rows={4} value={String(p.message ?? '')} onChange={e => set('message', e.target.value)} placeholder="Escreva a mensagem. Ex.: Um chamado foi atribuído a você. Analise e inicie o atendimento." />

        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px]" style={{ color: 'var(--text-light)' }}>Blocos:</span>
            {blocks.map(b => <span key={b} className="inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{meta.blocks[b] ?? b}<button onClick={() => toggleBlock(b)}><X size={11} /></button></span>)}
            <button type="button" onClick={() => setShowBlocks(s => !s)} className="text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded-lg" style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)' }}><Plus size={12} /> Inserir bloco</button>
          </div>
          {showBlocks && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {Object.entries(meta.blocks).filter(([k]) => !blocks.includes(k)).map(([k, v]) => (
                <button key={k} onClick={() => { toggleBlock(k); setShowBlocks(false) }} className="text-xs px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{v}</button>
              ))}
            </div>
          )}
        </div>

        <button type="button" onClick={() => setShowVars(s => !s)} className="text-[11px] inline-flex items-center gap-1" style={{ color: 'var(--text-light)' }}><ChevronDown size={12} /> Variáveis avançadas (placeholders)</button>
        {showVars && <div className="text-[10px] flex flex-wrap gap-1.5" style={{ color: 'var(--text-light)' }}>{meta.placeholders.map(ph => <code key={ph} className="px-1 rounded" style={{ background: 'var(--surface-sunken)' }}>{ph}</code>)}</div>}
      </> : <>
        <textarea className={`${fieldCls} w-full`} style={inputStyle} rows={5} value={String(p.body ?? '')} onChange={e => set('body', e.target.value)} placeholder="HTML/texto livre do corpo. Placeholders: {ticket.url} {ticket.customer} {tenant.name}" />
        <div className="text-[10px]" style={{ color: 'var(--text-light)' }}>Disponíveis: {meta.placeholders.join('  ')}</div>
      </>}

      {/* Prévia ao vivo */}
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="px-2.5 py-1.5 flex items-center gap-1.5" style={{ background: 'var(--surface-sunken)' }}>
          <Eye size={12} style={{ color: 'var(--text-light)' }} /><span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Prévia em tempo real {pv?.sample ? `(chamado ${pv.sample})` : ''}</span>
        </div>
        {pv?.subject && <div className="px-3 py-1.5 text-[12px]" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>Assunto: <span style={{ color: 'var(--text)' }}>{pv.subject}</span></div>}
        {pv?.mode === 'template' && pv.html ? <EmailFrame html={pv.html} />
          : <div className="p-3" style={{ background: '#ffffff', color: '#1f2937' }}>{pv?.body && isHtmlBody(pv.body) ? <div className="text-sm" dangerouslySetInnerHTML={{ __html: sanitizeEmail(pv.body) }} /> : <div className="text-sm whitespace-pre-wrap">{pv?.body || '—'}</div>}{pv?.footer && <div dangerouslySetInnerHTML={{ __html: pv.footer }} />}</div>}
      </div>
    </div>
  )
}

function ActionParams({ action, meta, onChange }: { action: Action; meta: Meta; onChange: (p: Record<string, unknown>) => void }) {
  const p = action.params ?? {}
  const set = (k: string, v: unknown) => onChange({ ...p, [k]: v })

  if (action.type === 'send_email') return <SendEmailParams p={p} set={set} setMany={obj => onChange({ ...p, ...obj })} meta={meta} />
  if (action.type === 'change_status') return <SelectOpt opts={meta.statuses} value={p.status_id} onChange={v => set('status_id', v)} label="status alvo" />
  if (action.type === 'set_field') return (
    <div className="flex items-center gap-1.5">
      <select className={`${fieldCls}`} style={inputStyle} value={String(p.field ?? '')} onChange={e => set('field', e.target.value)}>
        <option value="">— campo —</option><option value="team_id">Equipe</option><option value="category_id">Categoria</option><option value="priority">Urgência</option><option value="level">Nível</option>
      </select>
      <input className={`${fieldCls} flex-1 min-w-0`} style={inputStyle} value={String(p.value ?? '')} onChange={e => set('value', e.target.value)} placeholder="valor (ID ou baixa/media/alta/urgente)" />
    </div>
  )
  if (action.type === 'add_tag' || action.type === 'remove_tag') return <SelectOpt opts={meta.tags} value={p.tag_id} onChange={v => set('tag_id', v)} label="tag" />
  if (action.type === 'assign') return (
    <div className="flex items-center gap-1.5">
      <input className={`${fieldCls} flex-1 min-w-0`} style={inputStyle} value={String(p.assignee_id ?? '')} onChange={e => set('assignee_id', e.target.value ? Number(e.target.value) : '')} placeholder="ID do responsável (opcional)" />
      <SelectOpt opts={meta.teams} value={p.team_id} onChange={v => set('team_id', v)} label="equipe" />
    </div>
  )
  return null
}
