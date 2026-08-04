'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { ListTodo, Search, Plus, Check, Trash2, Pencil, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { CustomFieldsSection } from '@/components/crm/custom-fields-section'

interface Opp { id: number; title: string; customer_id?: number | null; customer?: { id?: number; name: string } | null }
interface ContactType { id: number; nome: string; slug: string }
interface UserOpt { id: number; name: string }
interface CustomerOpt { id: number; name: string }
interface Task {
  id: number; tipo: string; titulo: string | null; data: string | null; prioridade: string
  situacao: 'pendente' | 'atrasada' | 'concluida'; concluida: boolean; notas: string | null
  responsavel: string | null; opportunity: { id: number; title: string } | null; empresa: string | null
}
interface Resp { data: Task[]; resumo: { pendentes: number; atrasadas: number; concluidas: number }; page: number; has_more: boolean; total: number }

const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const fieldCls = 'w-full text-sm rounded-lg px-2.5 py-1.5 outline-none'
const lblCls = 'text-[11px] font-semibold block mb-0.5'
const SIT: Record<string, { l: string; cor: string }> = {
  pendente: { l: 'Pendente', cor: 'var(--text-muted)' }, atrasada: { l: 'Atrasada', cor: 'var(--danger-border)' }, concluida: { l: 'Concluída', cor: '#22c55e' },
}
const fmtDataHora = (d: string | null) => {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
// ISO → valor do <input type="datetime-local"> (hora local).
const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function TarefasPage() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<'abertas' | 'pendentes' | 'atrasadas' | 'concluidas' | 'todas'>('abertas')
  const [busca, setBusca] = useState('')
  const [respFiltro, setRespFiltro] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [periodoFiltro, setPeriodoFiltro] = useState('')

  const [tipos, setTipos] = useState<ContactType[]>([])
  const [users, setUsers] = useState<UserOpt[]>([])
  const [opps, setOpps] = useState<Opp[]>([])
  const [customers, setCustomers] = useState<CustomerOpt[]>([])
  const [modal, setModal] = useState(false)
  const [detail, setDetail] = useState<Task | null>(null) // detalhe da tarefa — campos personalizados
  const [editing, setEditing] = useState<Task | null>(null) // edição da tarefa

  useEffect(() => {
    api.get<{ data: ContactType[] }>('/crm/contact-types').then(r => setTipos(r?.data ?? [])).catch(() => {})
    api.get<{ data: UserOpt[] }>('/crm/users').then(r => setUsers(r?.data ?? [])).catch(() => {})
    api.get<{ data: Opp[] }>('/crm/opportunities?status=aberto').then(r => setOpps((r?.data ?? []).map((o: any) => ({ id: o.id, title: o.title, customer_id: o.customer_id ?? o.customer?.id, customer: o.customer })))).catch(() => {})
    api.get<any>('/customers?pageSize=500').then(r => setCustomers((Array.isArray(r) ? r : r?.data ?? r?.items ?? []).map((c: any) => ({ id: c.id, name: c.name })).sort((a: CustomerOpt, b: CustomerOpt) => a.name.localeCompare(b.name)))).catch(() => {})
  }, [])

  const qs = useMemo(() => {
    const p = new URLSearchParams({ status, page: String(page) })
    if (busca.trim()) p.set('q', busca.trim())
    if (respFiltro) p.set('responsavel_id', respFiltro)
    if (tipoFiltro) p.set('tipo', tipoFiltro)
    if (empresaFiltro) p.set('customer_id', empresaFiltro)
    if (periodoFiltro) p.set('periodo', periodoFiltro)
    return p.toString()
  }, [status, page, busca, respFiltro, tipoFiltro, empresaFiltro, periodoFiltro])

  const load = useCallback(() => {
    setLoading(true)
    api.get<Resp>(`/crm/tasks/agenda?${qs}`).then(r => setData(r ?? null)).catch(() => {}).finally(() => setLoading(false))
  }, [qs])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  const concluir = async (t: Task) => {
    try { await api.patch(`/crm/tasks/${t.id}/complete`, { done: !t.concluida }); load() } catch { /* */ }
  }
  const excluir = async (t: Task) => {
    if (!confirm('Excluir esta tarefa?')) return
    try { await api.delete(`/crm/tasks/${t.id}`); load() } catch { /* */ }
  }

  const Card = ({ label, value, cor, on }: { label: string; value: number; cor: string; on: () => void }) => (
    <button onClick={on} className="rounded-xl p-3 text-left" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{label}</p>
      <p className="text-xl font-bold mt-0.5" style={{ color: cor }}>{value}</p>
    </button>
  )

  return (
    <AppLayout title="Tarefas (CRM)">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <ListTodo size={18} style={{ color: 'var(--primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Tarefas</h1>
        <span className="text-xs" style={{ color: 'var(--text-light)' }}>— atividades comerciais (ligação, e-mail, reunião…)</span>
        <button onClick={() => setModal(true)} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}><Plus size={15} /> Nova tarefa</button>
      </div>

      {data && <div className="grid grid-cols-3 gap-3 mb-4">
        <Card label="Pendentes" value={data.resumo.pendentes} cor="var(--text)" on={() => { setStatus('pendentes'); setPage(1) }} />
        <Card label="Atrasadas" value={data.resumo.atrasadas} cor="var(--danger-border)" on={() => { setStatus('atrasadas'); setPage(1) }} />
        <Card label="Concluídas" value={data.resumo.concluidas} cor="#22c55e" on={() => { setStatus('concluidas'); setPage(1) }} />
      </div>}

      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5" style={{ color: 'var(--text-light)' }} />
          <input value={busca} onChange={e => { setBusca(e.target.value); setPage(1) }} placeholder="Buscar tarefa, oportunidade, empresa" className="pl-8 pr-3 py-2 rounded-lg text-sm outline-none w-72" style={inputStyle} />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value as any); setPage(1) }} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
          <option value="abertas">Abertas</option><option value="pendentes">Pendentes</option><option value="atrasadas">Atrasadas</option><option value="concluidas">Concluídas</option><option value="todas">Todas</option>
        </select>
        <select value={empresaFiltro} onChange={e => { setEmpresaFiltro(e.target.value); setPage(1) }} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
          <option value="">Empresa</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={respFiltro} onChange={e => { setRespFiltro(e.target.value); setPage(1) }} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
          <option value="">Responsável</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={tipoFiltro} onChange={e => { setTipoFiltro(e.target.value); setPage(1) }} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
          <option value="">Tipo</option>{tipos.map(t => <option key={t.id} value={t.slug}>{t.nome}</option>)}
        </select>
        <select value={periodoFiltro} onChange={e => { setPeriodoFiltro(e.target.value); setPage(1) }} className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
          <option value="">Período</option><option value="hoje">Hoje</option><option value="amanha">Amanhã</option><option value="semana">Esta semana</option><option value="sem_data">Sem data</option>
        </select>
      </div>

      <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm whitespace-nowrap">
          <thead><tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
            {['', 'Situação', 'Tarefa', 'Tipo', 'Empresa', 'Oportunidade', 'Responsável', 'Quando', 'Ações'].map((h, i) => <th key={i} className="px-3 py-2.5 text-xs font-semibold text-left">{h}</th>)}
          </tr></thead>
          <tbody>
            {loading && !data ? <tr><td colSpan={9} className="px-3 py-6 text-center" style={{ color: 'var(--text-light)' }}>Carregando…</td></tr>
            : (data?.data.length ?? 0) === 0 ? <tr><td colSpan={9} className="px-3 py-6 text-center" style={{ color: 'var(--text-light)' }}>Nenhuma tarefa.</td></tr>
            : data!.data.map(t => (
              <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-3 py-2.5">
                  <button onClick={() => concluir(t)} title={t.concluida ? 'Reabrir' : 'Concluir'} className="w-5 h-5 rounded flex items-center justify-center" style={{ border: '1px solid var(--border)', background: t.concluida ? '#22c55e' : 'transparent', color: '#fff' }}>{t.concluida && <Check size={13} />}</button>
                </td>
                <td className="px-3 py-2.5"><span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--surface-sunken)', color: SIT[t.situacao]?.cor }}>{SIT[t.situacao]?.l}</span></td>
                <td className="px-3 py-2.5 font-medium" style={{ textDecoration: t.concluida ? 'line-through' : 'none' }}>
                  <button onClick={() => setDetail(t)} className="text-left hover:underline" style={{ color: 'var(--primary)' }} title="Abrir tarefa (campos personalizados)">{t.titulo || '—'}</button>
                </td>
                <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{tipos.find(x => x.slug === t.tipo)?.nome ?? t.tipo}</td>
                <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{t.empresa || '—'}</td>
                <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{t.opportunity?.title || '—'}</td>
                <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{t.responsavel || '—'}</td>
                <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{fmtDataHora(t.data)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <button onClick={() => setEditing(t)} title="Editar" className="p-1 rounded hover:bg-[var(--surface-hover)]" style={{ color: 'var(--text-muted)' }}><Pencil size={14} /></button>
                  <button onClick={() => excluir(t)} title="Excluir" className="p-1 rounded hover:bg-[var(--surface-hover)] ml-1" style={{ color: 'var(--danger-border)' }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && <div className="flex items-center justify-between mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
        <span>{data.total} tarefa(s) · página {data.page}</span>
        <div className="flex gap-1.5">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg disabled:opacity-40" style={{ background: 'var(--surface-sunken)' }}><ChevronLeft size={14} /> Anterior</button>
          <button onClick={() => setPage(p => p + 1)} disabled={!data.has_more} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg disabled:opacity-40" style={{ background: 'var(--surface-sunken)' }}>Próxima <ChevronRight size={14} /></button>
        </div>
      </div>}

      {modal && <NovaTarefa tipos={tipos} users={users} opps={opps} customers={customers} onClose={() => setModal(false)} onSaved={() => { setModal(false); load() }} />}
      {detail && <TarefaDetalhe tarefa={detail} tipos={tipos} onClose={() => setDetail(null)} />}
      {editing && <EditarTarefa task={editing} tipos={tipos} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </AppLayout>
  )
}

// Detalhe da tarefa (abre ao clicar no título) — resumo + campos personalizados (auto-save, endpoint próprio).
function TarefaDetalhe({ tarefa, tipos, onClose }: { tarefa: Task; tipos: ContactType[]; onClose: () => void }) {
  const tipoNome = tipos.find(x => x.slug === tarefa.tipo)?.nome ?? tarefa.tipo
  const linha = (label: string, val: string) => (
    <div className="flex items-center justify-between text-sm py-1.5" style={{ borderTop: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="font-medium text-right" style={{ color: 'var(--text)' }}>{val}</span>
    </div>
  )
  return (
    <div className="fixed inset-0 z-[60] flex justify-end" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="w-full max-w-md h-full overflow-y-auto p-5" style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{tarefa.titulo || 'Tarefa'}</h2>
          <button onClick={onClose} className="opacity-60 hover:opacity-100" style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>
        <div className="rounded-lg px-3 py-1 mb-4" style={{ border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
          {linha('Situação', SIT[tarefa.situacao]?.l ?? tarefa.situacao)}
          {linha('Tipo', tipoNome)}
          {linha('Empresa', tarefa.empresa || '—')}
          {linha('Oportunidade', tarefa.opportunity?.title || '—')}
          {linha('Responsável', tarefa.responsavel || '—')}
          {linha('Quando', fmtDataHora(tarefa.data))}
        </div>
        <CustomFieldsSection urlContext="tasks" entityId={tarefa.id} title="Campos personalizados da tarefa" />
      </div>
    </div>
  )
}

function NovaTarefa({ tipos, users, opps, customers, onClose, onSaved }: { tipos: ContactType[]; users: UserOpt[]; opps: Opp[]; customers: CustomerOpt[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ customer_id: '', opportunity_id: '', tipo: tipos[0]?.slug ?? '', titulo: '', data: '', responsavel_id: '', prioridade: 'media', notas: '' })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }))
  // Oportunidades da empresa escolhida (a tarefa fica amarrada ao cadastro).
  const oppsEmpresa = opps.filter(o => !f.customer_id || String(o.customer_id ?? '') === f.customer_id)
  const salvar = async () => {
    if (!f.customer_id) return alert('Selecione a empresa.')
    if (!f.tipo) return alert('Selecione o tipo.')
    setSaving(true)
    try {
      await api.post('/crm/tasks', {
        customer_id: Number(f.customer_id),
        opportunity_id: f.opportunity_id ? Number(f.opportunity_id) : null,
        tipo: f.tipo, titulo: f.titulo || null,
        data: f.data || null, responsavel_id: f.responsavel_id ? Number(f.responsavel_id) : null, prioridade: f.prioridade, notas: f.notas || null,
      })
      onSaved()
    } catch { alert('Erro ao salvar a tarefa.') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Nova tarefa</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <div className="space-y-2.5">
          <label className="block">
            <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Empresa *</span>
            <select value={f.customer_id} onChange={e => setF(s => ({ ...s, customer_id: e.target.value, opportunity_id: '' }))} className={fieldCls} style={inputStyle}>
              <option value="">Selecione a empresa…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Oportunidade (opcional)</span>
            <select value={f.opportunity_id} onChange={e => set('opportunity_id', e.target.value)} disabled={!f.customer_id} className={fieldCls} style={inputStyle}>
              <option value="">{!f.customer_id ? 'Escolha a empresa primeiro' : (oppsEmpresa.length ? 'Sem vínculo a oportunidade' : 'Empresa sem oportunidades abertas')}</option>
              {oppsEmpresa.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Tipo *</span>
              <select value={f.tipo} onChange={e => set('tipo', e.target.value)} className={fieldCls} style={inputStyle}>
                {tipos.map(t => <option key={t.id} value={t.slug}>{t.nome}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Prioridade</span>
              <select value={f.prioridade} onChange={e => set('prioridade', e.target.value)} className={fieldCls} style={inputStyle}>
                <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Título</span>
            <input value={f.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ex.: Ligar para alinhar proposta" className={fieldCls} style={inputStyle} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Quando (data/hora)</span>
              <input type="datetime-local" value={f.data} onChange={e => set('data', e.target.value)} className={fieldCls} style={inputStyle} />
            </label>
            <label className="block">
              <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Responsável</span>
              <select value={f.responsavel_id} onChange={e => set('responsavel_id', e.target.value)} className={fieldCls} style={inputStyle}>
                <option value="">—</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Notas</span>
            <textarea rows={2} value={f.notas} onChange={e => set('notas', e.target.value)} className={fieldCls} style={inputStyle} />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>Cancelar</button>
          <button onClick={salvar} disabled={saving} className="px-3 py-1.5 rounded-lg text-sm font-bold disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saving ? 'Salvando…' : 'Criar tarefa'}</button>
        </div>
      </div>
    </div>
  )
}

// Edição de tarefa — o backend permite alterar tipo/título/quando/prioridade/notas.
// Empresa, oportunidade e responsável ficam fixos após a criação (exibidos como referência).
function EditarTarefa({ task, tipos, onClose, onSaved }: { task: Task; tipos: ContactType[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ tipo: task.tipo, titulo: task.titulo ?? '', data: toLocalInput(task.data), prioridade: task.prioridade || 'media', notas: task.notas ?? '' })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }))
  const salvar = async () => {
    setSaving(true)
    try {
      await api.put(`/crm/tasks/${task.id}`, { tipo: f.tipo, titulo: f.titulo || null, data: f.data || null, prioridade: f.prioridade, notas: f.notas || null })
      onSaved()
    } catch { alert('Erro ao salvar a tarefa.') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Editar tarefa</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <div className="text-[11px] mb-3 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
          {(task.empresa || '—')}{task.opportunity?.title ? ` · ${task.opportunity.title}` : ''}{task.responsavel ? ` · 👤 ${task.responsavel}` : ''}
        </div>
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Tipo *</span>
              <select value={f.tipo} onChange={e => set('tipo', e.target.value)} className={fieldCls} style={inputStyle}>
                {tipos.map(t => <option key={t.id} value={t.slug}>{t.nome}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Prioridade</span>
              <select value={f.prioridade} onChange={e => set('prioridade', e.target.value)} className={fieldCls} style={inputStyle}>
                <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Título</span>
            <input value={f.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ex.: Ligar para alinhar proposta" className={fieldCls} style={inputStyle} />
          </label>
          <label className="block">
            <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Quando (data/hora)</span>
            <input type="datetime-local" value={f.data} onChange={e => set('data', e.target.value)} className={fieldCls} style={inputStyle} />
          </label>
          <label className="block">
            <span className={lblCls} style={{ color: 'var(--text-muted)' }}>Notas</span>
            <textarea rows={2} value={f.notas} onChange={e => set('notas', e.target.value)} className={fieldCls} style={inputStyle} />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>Cancelar</button>
          <button onClick={salvar} disabled={saving} className="px-3 py-1.5 rounded-lg text-sm font-bold disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
