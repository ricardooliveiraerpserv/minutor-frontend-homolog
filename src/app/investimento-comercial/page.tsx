'use client'

import { useEffect, useState, useMemo, Fragment } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useActiveCompany } from '@/hooks/use-active-company'
import { useRouter } from 'next/navigation'
import {
  Search, Users, X, Check, TrendingUp, Clock,
  BarChart2, Building2, User, ChevronDown, ChevronRight, Plus, Pencil, Trash2,
  CalendarPlus, CalendarOff,
} from 'lucide-react'
import { PageHeader, Table, Thead, Th, Tbody, Tr, Td, Button, SkeletonTable, EmptyState } from '@/components/ds'
import { TimesheetsScreen } from '@/components/screens/TimesheetsScreen'
import { ApprovalsScreen } from '@/components/screens/ApprovalsScreen'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { MultiSelect } from '@/components/ui/multi-select'
import { SearchSelect } from '@/components/ui/search-select'
import { toast } from 'sonner'
import type { LucideIcon } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Consultant { id: number; name: string; email: string }
interface ConsultantGroup { id: number; name: string; users: Consultant[] }

interface ICProject {
  id: number; name: string; code: string; status: string
  categoria_interna: string | null
  customer: { id: number; name: string; active?: boolean } | null
  consultants: Consultant[]
  coordinators: Consultant[]
  parent_project_id: number | null
  has_open_period?: boolean
}

interface HoursSummary { project_id: number; total_hours: number }

interface ByCustomer  { customer_id: number; customer_name: string; total_hours: number; total_cost: number }
interface ByConsultant { user_id: number; user_name: string; total_hours: number; total_cost: number; num_customers: number }
interface Monthly     { month: string; total_hours: number; total_cost: number }
interface Detail      { user_id: number; user_name: string; customer_id: number; customer_name: string; total_hours: number; total_cost: number }

interface Analytics {
  by_customer: ByCustomer[]
  by_consultant: ByConsultant[]
  monthly: Monthly[]
  detail: Detail[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputStyle  = { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }
const surfaceStyle = { background: 'var(--surface)', border: '1px solid var(--border)' }
const cardStyle   = { background: 'var(--bg)', border: '1px solid var(--border)' }

function periodBounds(month: number, year: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

function fmtHours(h: number) {
  if (h === 0) return '—'
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60)
  return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`
}

function fmtCurrency(v: number) {
  return v === 0 ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtMonth(m: string) {
  const [y, mo] = m.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[parseInt(mo) - 1]}/${y}`
}

function MiniBar({ value, max, color = 'var(--primary)' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(3, (value / max) * 100) : 0
  return (
    <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-hover)' }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

// ─── Abas ─────────────────────────────────────────────────────────────────────

type Tab = 'projetos' | 'apontamentos' | 'aprovacoes' | 'clientes' | 'consultores' | 'mensal' | 'detalhe'

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'projetos',    label: 'Projetos',         icon: TrendingUp as LucideIcon },
  { id: 'apontamentos', label: 'Apontamentos',     icon: Clock      as LucideIcon },
  { id: 'aprovacoes',  label: 'Aprovações',        icon: Check      as LucideIcon },
  { id: 'clientes',    label: 'Por Cliente',       icon: Building2  as LucideIcon },
  { id: 'consultores', label: 'Por Consultor',     icon: User       as LucideIcon },
  { id: 'mensal',      label: 'Evolução Mensal',   icon: BarChart2  as LucideIcon },
  { id: 'detalhe',     label: 'Detalhamento',      icon: Clock      as LucideIcon },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvestimentoComercialPage() {
  const { user } = useAuth()
  const router   = useRouter()
  // Multi-empresa: a "CASA" do investimento interno é a empresa ATIVA (Bizify → cliente BIZIFY).
  const { isBizify } = useActiveCompany()
  const houseName = isBizify ? 'BIZIFY' : 'ERPSERV'

  const now = new Date()
  const [filterMonth, setFilterMonth] = useState<number>(now.getMonth() + 1)
  const [filterYear,  setFilterYear]  = useState<number>(now.getFullYear())
  const [clientSearch, setClientSearch] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('projetos')

  // projetos tab
  const [projects,     setProjects]     = useState<ICProject[]>([])
  const [hoursMap,     setHoursMap]     = useState<Record<number, number>>({})
  const [hoursLoading, setHoursLoading] = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [allUsers,     setAllUsers]     = useState<Consultant[]>([])
  // Aprovadores possíveis (coordenadores + admins) — quem pode aprovar os apontamentos.
  const [approvers,    setApprovers]    = useState<Consultant[]>([])
  const [groups,       setGroups]       = useState<ConsultantGroup[]>([])
  const [modal,        setModal]        = useState<{ open: boolean; project: ICProject | null }>({ open: false, project: null })
  const [selected,     setSelected]     = useState<number[]>([])
  const [userSearch,   setUserSearch]   = useState('')
  const [saving,       setSaving]       = useState(false)
  // Projetos reais por consultor (alocação em investimento): opções do cliente + mapa escolhido.
  const [realProjectOpts, setRealProjectOpts] = useState<{ id: number; name: string }[]>([])
  const [realByConsultant, setRealByConsultant] = useState<Record<number, number[]>>({})

  // Modal de criação de projeto interno (ERPSERV)
  const [newProjectOpen,      setNewProjectOpen]      = useState(false)
  const [newProjectName,      setNewProjectName]      = useState('')
  const [newProjectCategoria, setNewProjectCategoria] = useState<'Sustentação' | 'Projeto' | 'Suporte' | 'Comercial' | 'Leads'>('Projeto')
  const [newProjectApprover,  setNewProjectApprover]  = useState('')
  const [newProjectParent,    setNewProjectParent]    = useState('')
  const [leadMode,            setLeadMode]            = useState(false) // criação de Lead (nome=cliente, sempre Leads)
  const [creatingProject,     setCreatingProject]     = useState(false)

  // Opções de aprovador (coordenadores+admins), garantindo o usuário logado na lista.
  const approverOptions = useMemo(() => {
    const opts = approvers.map(a => ({ id: a.id as number | string, name: a.name }))
    if (user && !opts.some(o => String(o.id) === String(user.id))) opts.unshift({ id: user.id, name: user.name })
    return opts
  }, [approvers, user])

  // Modal de edição de projeto interno
  type EditableCategoria = '' | 'Sustentação' | 'Projeto' | 'Suporte' | 'Comercial' | 'Leads'
  const [editProject,     setEditProject]     = useState<ICProject | null>(null)
  const [editName,        setEditName]        = useState('')
  const [editCategoria,   setEditCategoria]   = useState<EditableCategoria>('')
  const [editApprover,    setEditApprover]    = useState('')
  // Modal de abertura/fechamento de mês (períodos abertos) — igual aos projetos tradicionais
  const [openPeriodProject, setOpenPeriodProject] = useState<ICProject | null>(null)
  const [savingEdit,      setSavingEdit]      = useState(false)
  const [deletingEdit,    setDeletingEdit]    = useState(false)
  const openEditModal = (p: ICProject) => {
    setEditProject(p)
    setEditName(p.name ?? '')
    setEditCategoria(((p.categoria_interna ?? '') as EditableCategoria))
    setEditApprover(p.coordinators?.[0]?.id ? String(p.coordinators[0].id) : '')
  }
  const closeEditModal = () => { setEditProject(null); setEditName(''); setEditCategoria(''); setEditApprover('') }
  const handleSaveEdit = async () => {
    if (!editProject) return
    const name = editName.trim()
    if (name.length < 2) { toast.error('Informe um nome válido (mín. 2 caracteres)'); return }
    setSavingEdit(true)
    try {
      const payload: { name: string; categoria_interna: string | null; coordinator_ids: number[] } = {
        name,
        categoria_interna: editCategoria === '' ? null : editCategoria,
        coordinator_ids: editApprover ? [Number(editApprover)] : [],
      }
      await api.patch(`/projects/${editProject.id}`, payload)
      const newCoords = editApprover ? approvers.filter(a => String(a.id) === editApprover) : []
      setProjects(prev => prev.map(p => p.id === editProject.id
        ? { ...p, name, categoria_interna: payload.categoria_interna, coordinators: newCoords }
        : p))
      toast.success('Projeto atualizado')
      closeEditModal()
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao atualizar projeto')
    } finally {
      setSavingEdit(false)
    }
  }
  const handleDeleteEdit = async () => {
    if (!editProject) return
    const ok = window.confirm(`Excluir o projeto "${editProject.name}" (${editProject.code})?\n\nA exclusão é bloqueada se houver apontamentos vinculados.`)
    if (!ok) return
    setDeletingEdit(true)
    try {
      await api.delete(`/projects/${editProject.id}`)
      setProjects(prev => prev.filter(p => p.id !== editProject.id))
      toast.success('Projeto excluído')
      closeEditModal()
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao excluir projeto')
    } finally {
      setDeletingEdit(false)
    }
  }

  // Árvore: clientes expandidos
  const [expandedCustomers, setExpandedCustomers] = useState<Set<number>>(new Set())
  // Filtro de categoria
  const [categoriaFilter, setCategoriaFilter] = useState<'todas' | 'Sustentação' | 'Projeto' | 'Suporte' | 'Comercial' | 'Leads' | 'sem'>('todas')
  const toggleCustomerExpand = (customerId: number) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev)
      if (next.has(customerId)) next.delete(customerId)
      else next.add(customerId)
      return next
    })
  }

  // analytics tabs
  const [analytics,        setAnalytics]        = useState<Analytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [expandedConsultant, setExpandedConsultant] = useState<number | null>(null)

  const isAdmin = user?.type === 'admin'
  const isCoordenador = user?.type === 'coordenador'
  // Alocação (consultores + projeto real) liberada p/ coordenador também — mesma rotina,
  // mesmo privilégio de alocar. Criar/editar/abrir-mês seguem admin-only.
  const canAllocate = isAdmin || isCoordenador

  useEffect(() => {
    // Rotina disponível para admin e TODOS os coordenadores.
    if (user && user.type !== 'admin' && user.type !== 'coordenador') router.replace('/dashboard')
  }, [user, router])

  const reloadProjects = async () => {
    try {
      const projRes = await api.get<any>('/projects?only_investimento_comercial=true&pageSize=2000&gestao=true&with_team=true')
      const rawProjects: any[] = projRes?.items ?? projRes?.data ?? []
      setProjects(rawProjects.map(p => ({ id: p.id, name: p.name ?? '', code: p.code, status: p.status, categoria_interna: p.categoria_interna ?? null, customer: p.customer ?? null, consultants: p.consultants ?? [], coordinators: p.coordinators ?? [], parent_project_id: p.parent_project_id ?? null, has_open_period: p.has_open_period ?? false })))
    } catch {
      toast.error('Erro ao recarregar projetos')
    }
  }

  useEffect(() => {
    let cancelled = false
    // Cada request com catch próprio: falha de uma lista (ex.: /users sem permissão
    // para o coordenador) não pode derrubar a lista de projetos nem as abas novas.
    Promise.all([
      api.get<any>('/projects?only_investimento_comercial=true&pageSize=2000&gestao=true&with_team=true').catch(() => ({})),
      api.get<any>('/users?exclude_type=cliente&pageSize=500').catch(() => ({})),
      api.get<any>('/consultant-groups?pageSize=200&with_users=true').catch(() => ({})),
      api.get<any>('/users?type=coordenador&pageSize=300').catch(() => ({})),
      api.get<any>('/users?type=admin&pageSize=100').catch(() => ({})),
    ]).then(([projRes, usersRes, groupsRes, coordsRes, adminsRes]) => {
      if (cancelled) return
      const rawProjects: any[] = projRes?.items ?? projRes?.data ?? []
      setProjects(rawProjects.map(p => ({ id: p.id, name: p.name ?? '', code: p.code, status: p.status, categoria_interna: p.categoria_interna ?? null, customer: p.customer ?? null, consultants: p.consultants ?? [], coordinators: p.coordinators ?? [], parent_project_id: p.parent_project_id ?? null, has_open_period: p.has_open_period ?? false })))
      const rawUsers: any[] = usersRes?.items ?? usersRes?.data ?? []
      setAllUsers(rawUsers.map((u: any) => ({ id: u.id, name: u.name, email: u.email })))
      // Aprovadores = coordenadores + admins (dedup por id).
      const rawCoords: any[] = coordsRes?.items ?? coordsRes?.data ?? []
      const rawAdmins: any[] = adminsRes?.items ?? adminsRes?.data ?? []
      const byId = new Map<number, Consultant>()
      ;[...rawCoords, ...rawAdmins].forEach((u: any) => byId.set(u.id, { id: u.id, name: u.name, email: u.email }))
      setApprovers([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)))
      const rawGroups: any[] = groupsRes?.data ?? groupsRes?.items ?? []
      setGroups(rawGroups.map((g: any) => ({
        id: g.id,
        name: g.name,
        users: (g.users ?? g.consultants ?? []).map((u: any) => ({ id: u.id, name: u.name, email: u.email })),
      })))
    }).catch(() => toast.error('Erro ao carregar dados'))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Auto-expandir o cliente ERPSERV ao carregar (é o destaque da página)
  useEffect(() => {
    const erpserv = projects.find(p => (p.customer?.name ?? '').toUpperCase().includes(houseName))?.customer
    if (!erpserv) return
    setExpandedCustomers(prev => prev.has(erpserv.id) ? prev : new Set(prev).add(erpserv.id))
  }, [projects, houseName])

  const handleCreateProject = async () => {
    const name = newProjectName.trim()
    if (name.length < 2) { toast.error('Informe um nome válido (mín. 2 caracteres)'); return }
    setCreatingProject(true)
    try {
      await api.post('/investimento-interno/projects', {
        name,
        categoria: newProjectCategoria,
        approver_id: newProjectApprover ? Number(newProjectApprover) : undefined,
        parent_project_id: newProjectParent ? Number(newProjectParent) : undefined,
      })
      toast.success('Projeto interno criado')
      setNewProjectOpen(false)
      setNewProjectName('')
      setNewProjectCategoria('Projeto')
      setNewProjectApprover('')
      setNewProjectParent('')
      await reloadProjects()
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao criar projeto')
    } finally {
      setCreatingProject(false)
    }
  }

  // horas por projeto (aba projetos)
  useEffect(() => {
    if (!filterMonth || !filterYear || activeTab !== 'projetos') { setHoursMap({}); return }
    let cancelled = false
    setHoursLoading(true)
    const { start, end } = periodBounds(filterMonth, filterYear)
    api.get<HoursSummary[]>(`/projects/ic-summary?start_date=${start}&end_date=${end}`)
      .then(rows => { if (cancelled) return; const map: Record<number, number> = {}; rows.forEach(r => { map[r.project_id] = r.total_hours }); setHoursMap(map) })
      .catch(() => toast.error('Erro ao carregar horas'))
      .finally(() => { if (!cancelled) setHoursLoading(false) })
    return () => { cancelled = true }
  }, [filterMonth, filterYear, activeTab])

  // analytics (abas clientes / consultores / mensal / detalhe)
  useEffect(() => {
    if (activeTab === 'projetos') return
    let cancelled = false
    setAnalyticsLoading(true)

    const params = new URLSearchParams()
    if (filterMonth && filterYear) {
      const { start, end } = periodBounds(filterMonth, filterYear)
      params.set('start_date', start)
      params.set('end_date', end)
    }

    api.get<Analytics>(`/projects/ic-analytics?${params}`)
      .then(data => { if (!cancelled) setAnalytics(data) })
      .catch(() => toast.error('Erro ao carregar analytics'))
      .finally(() => { if (!cancelled) setAnalyticsLoading(false) })
    return () => { cancelled = true }
  }, [activeTab, filterMonth, filterYear])

  const filtered = useMemo(() => {
    const q = clientSearch.toLowerCase()
    return projects.filter(p => {
      // Somente clientes ATIVOS (a CASA é ativa; leads ficam aninhados na CASA e não são dropados).
      if (p.customer && p.customer.active === false) return false
      if (q && !(p.customer?.name.toLowerCase().includes(q) || p.consultants.some(c => c.name.toLowerCase().includes(q)) || (p.name ?? '').toLowerCase().includes(q))) return false
      if (categoriaFilter === 'todas') return true
      if (categoriaFilter === 'sem')   return !p.categoria_interna
      return p.categoria_interna === categoriaFilter
    })
  }, [projects, clientSearch, categoriaFilter])

  // Contagem de CLIENTES distintos (não de projetos) para o rótulo "N clientes".
  const clientCount = useMemo(
    () => new Set(filtered.map(p => p.customer?.id).filter(Boolean)).size,
    [filtered],
  )

  // Opções de Lead (categoria Leads) p/ o filtro das abas Apontamentos/Aprovações.
  const leadOptions = useMemo(
    () => projects.filter(p => p.categoria_interna === 'Leads').map(p => ({ id: p.id, name: p.name || p.code })),
    [projects],
  )

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase()
    return allUsers.filter(u => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }, [allUsers, userSearch])

  const totalHours = useMemo(() => filtered.reduce((acc, p) => acc + (hoursMap[p.id] ?? 0), 0), [filtered, hoursMap])

  function openModal(project: ICProject) {
    setModal({ open: true, project })
    setSelected(project.consultants.map(c => c.id))
    setUserSearch('')
    setRealProjectOpts([])
    setRealByConsultant({})
    // Projeto Real só se aplica a investimentos de Projeto/Suporte (não Comercial).
    if (project.categoria_interna === 'Projeto' || project.categoria_interna === 'Suporte') {
      api.get<{ real_projects: { id: number; name: string }[]; assignments: Record<string, number[]> }>(`/projects/${project.id}/real-project-assignments`)
        .then(r => {
          setRealProjectOpts(Array.isArray(r?.real_projects) ? r.real_projects.map(p => ({ id: p.id, name: p.name })) : [])
          const map: Record<number, number[]> = {}
          Object.entries(r?.assignments ?? {}).forEach(([uid, ids]) => { map[Number(uid)] = (ids as number[]).map(Number) })
          setRealByConsultant(map)
        })
        .catch(() => {})
    }
  }
  function closeModal() { setModal({ open: false, project: null }); setSelected([]); setUserSearch(''); setRealProjectOpts([]); setRealByConsultant({}) }
  function toggleUser(id: number) { setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }

  async function saveTeam() {
    if (!modal.project) return
    setSaving(true)
    try {
      // Envia só os reais dos consultores ainda selecionados.
      const realMap: Record<number, number[]> = {}
      selected.forEach(id => { realMap[id] = realByConsultant[id] ?? [] })
      // Endpoint dedicado (assign_consultants) — coordenador também aloca.
      await api.patch(`/projects/${modal.project.id}/investment-allocation`, { consultant_ids: selected, real_projects_by_consultant: realMap })
      const updatedConsultants = allUsers.filter(u => selected.includes(u.id))
      setProjects(prev => prev.map(p => p.id === modal.project!.id ? { ...p, consultants: updatedConsultants } : p))
      toast.success('Equipe atualizada')
      closeModal()
    } catch { toast.error('Erro ao salvar equipe') }
    finally { setSaving(false) }
  }

  // Abre o modal de criação já aninhado abaixo de um investimento pai (lead).
  const addLead = (parent: ICProject) => {
    setLeadMode(true)
    setNewProjectParent(String(parent.id))
    setNewProjectCategoria('Leads')
    setNewProjectName('')
    setNewProjectApprover('')
    setNewProjectOpen(true)
  }

  // Linha de um mini-projeto. depth 0 = topo (investimento); depth 1 = lead (filho).
  function renderProjectRow(project: ICProject, depth: number) {
    const hours = hoursMap[project.id] ?? 0
    const nameIndent = depth === 0 ? 'pl-6' : 'pl-12'
    const subIndent  = depth === 0 ? 'pl-12' : 'pl-[4.5rem]'
    return (
      <Tr key={project.id}>
        <Td>
          <span className={`flex items-center gap-2 ${nameIndent}`}>
            <span className="text-[var(--text-muted)]">{depth === 0 ? '└' : '↳'}</span>
            <span className="text-sm" style={{ color: 'var(--text)' }}>{project.name || '—'}</span>
            {project.categoria_interna && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
                style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
                {project.categoria_interna}
              </span>
            )}
          </span>
          <span className={`block ${subIndent} text-[10px] mt-0.5`} style={{ color: 'var(--text-light)' }}>
            Aprovador: {project.coordinators?.[0]?.name ?? '— (só admin)'}
          </span>
        </Td>
        <Td><span className="text-xs font-mono font-medium px-2 py-0.5 rounded" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>{project.code}</span></Td>
        <Td>
          {project.consultants.length === 0
            ? <span className="text-xs" style={{ color: 'var(--text-light)' }}>Nenhum alocado</span>
            : <div className="flex flex-wrap gap-1">
                {project.consultants.slice(0, 4).map(c => (
                  <span key={c.id} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>{c.name.split(' ')[0]}</span>
                ))}
                {project.consultants.length > 4 && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-hover)', color: 'var(--text-light)' }}>+{project.consultants.length - 4}</span>}
              </div>
          }
        </Td>
        <Td>
          {hoursLoading
            ? <span className="text-xs" style={{ color: 'var(--text-light)' }}>…</span>
            : <span className="text-sm font-semibold tabular-nums" style={{ color: hours > 0 ? 'var(--text)' : 'var(--text-light)' }}>{fmtHours(hours)}</span>
          }
        </Td>
        <Td>
          <div className="flex items-center gap-1 justify-end">
            {isAdmin && (<>
              {depth === 0 && project.categoria_interna === 'Comercial' && (project.customer?.name ?? '').toUpperCase().includes(houseName) && (
                <Button size="sm" variant="ghost" onClick={() => addLead(project)} aria-label="Adicionar lead">
                  <Plus size={13} className="mr-1" /> Lead
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => openEditModal(project)} aria-label="Editar projeto">
                <Pencil size={13} className="mr-1" /> Editar
              </Button>
            </>)}
            {canAllocate && (
              <Button size="sm" variant="ghost" onClick={() => openModal(project)}>
                <Users size={13} className="mr-1" /> Alocação
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" variant="ghost" onClick={() => setOpenPeriodProject(project)}
                aria-label={project.has_open_period ? 'Fechar mês' : 'Abrir mês'}
                style={project.has_open_period ? { color: 'var(--warning)' } : undefined}>
                {project.has_open_period
                  ? <><CalendarOff size={13} className="mr-1" /> Fechar Mês</>
                  : <><CalendarPlus size={13} className="mr-1" /> Abrir Mês</>}
              </Button>
            )}
          </div>
        </Td>
      </Tr>
    )
  }

  // ── Conteúdo de cada aba ─────────────────────────────────────────────────────

  function renderProjetos() {
    if (loading) return <SkeletonTable rows={8} cols={5} />
    if (filtered.length === 0) return <EmptyState icon={TrendingUp as LucideIcon} title="Nenhum projeto encontrado" description="Ajuste a busca." />

    // Agrupa por cliente preservando a ordem em que apareceram em filtered.
    const groups = new Map<number, { customer: { id: number; name: string }; projects: ICProject[] }>()
    for (const p of filtered) {
      if (!p.customer) continue
      const key = p.customer.id
      if (!groups.has(key)) groups.set(key, { customer: p.customer, projects: [] })
      groups.get(key)!.projects.push(p)
    }
    const isErpserv = (name: string) => name.toUpperCase().includes(houseName)
    const groupList = [...groups.values()].sort((a, b) => {
      const aErp = isErpserv(a.customer.name)
      const bErp = isErpserv(b.customer.name)
      if (aErp && !bErp) return -1
      if (!aErp && bErp) return 1
      return a.customer.name.localeCompare(b.customer.name)
    })
    const firstNonErpservId = groupList.find(g => !isErpserv(g.customer.name))?.customer.id

    return (
      <Table>
        <Thead>
          <Tr>
            <Th>Cliente / Projeto</Th><Th>Código</Th><Th>Consultores Alocados</Th>
            <Th><span className="flex items-center gap-1"><Clock size={12} />{filterMonth > 0 ? 'Horas no Período' : 'Horas'}</span></Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {groupList.map(({ customer, projects }) => {
            const expanded = expandedCustomers.has(customer.id)
            const totalHoursCustomer = projects.reduce((s, p) => s + (hoursMap[p.id] ?? 0), 0)
            const totalConsultorIds = new Set(projects.flatMap(p => p.consultants.map(c => c.id)))
            const erpservRow = isErpserv(customer.name)
            const showDivider = customer.id === firstNonErpservId
            return (
              <Fragment key={customer.id}>
                {showDivider && (
                  <Tr baseBackground="transparent">
                    <Td colSpan={5}>
                      <div className="flex items-center gap-2 py-1">
                        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                        <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-light)' }}>Clientes</span>
                        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                      </div>
                    </Td>
                  </Tr>
                )}
                {/* Linha do cliente (pai) */}
                <Tr baseBackground={erpservRow ? 'var(--primary-soft)' : undefined}>
                  <Td>
                    <button onClick={() => toggleCustomerExpand(customer.id)}
                      className="flex items-center gap-2 text-left w-full hover:opacity-80 transition-opacity">
                      {expanded
                        ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
                        : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
                      <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{customer.name}</span>
                      {erpservRow && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-widest font-bold"
                          style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
                          Casa
                        </span>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>{projects.length}</span>
                    </button>
                  </Td>
                  <Td><span className="text-xs" style={{ color: 'var(--text-light)' }}>—</span></Td>
                  <Td>
                    {totalConsultorIds.size === 0
                      ? <span className="text-xs" style={{ color: 'var(--text-light)' }}>Nenhum alocado</span>
                      : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{totalConsultorIds.size} {totalConsultorIds.size === 1 ? 'consultor' : 'consultores'}</span>}
                  </Td>
                  <Td>
                    {hoursLoading
                      ? <span className="text-xs" style={{ color: 'var(--text-light)' }}>…</span>
                      : <span className="text-sm font-semibold tabular-nums" style={{ color: totalHoursCustomer > 0 ? 'var(--text)' : 'var(--text-light)' }}>{fmtHours(totalHoursCustomer)}</span>}
                  </Td>
                  <Td></Td>
                </Tr>
                {/* Linhas dos projetos — topo + leads aninhados abaixo do pai */}
                {expanded && (() => {
                  const childrenByParent = new Map<number, ICProject[]>()
                  const tops: ICProject[] = []
                  for (const p of projects) {
                    if (p.parent_project_id && projects.some(x => x.id === p.parent_project_id)) {
                      const arr = childrenByParent.get(p.parent_project_id) ?? []
                      arr.push(p); childrenByParent.set(p.parent_project_id, arr)
                    } else {
                      tops.push(p)
                    }
                  }
                  const rows: ReturnType<typeof renderProjectRow>[] = []
                  for (const t of tops) {
                    rows.push(renderProjectRow(t, 0))
                    for (const c of (childrenByParent.get(t.id) ?? [])) rows.push(renderProjectRow(c, 1))
                  }
                  return rows
                })()}
              </Fragment>
            )
          })}
        </Tbody>
      </Table>
    )
  }

  function renderClientes() {
    if (analyticsLoading) return <SkeletonTable rows={6} cols={3} />
    const data = analytics?.by_customer ?? []
    if (data.length === 0) return <EmptyState icon={Building2 as LucideIcon} title="Sem dados" description="Nenhum apontamento IC no período." />
    const maxHours = Math.max(...data.map(r => r.total_hours))
    const maxCost  = Math.max(...data.map(r => r.total_cost))
    const totalH = data.reduce((s, r) => s + r.total_hours, 0)
    const totalC = data.reduce((s, r) => s + r.total_cost, 0)
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl px-4 py-3" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)' }}>
            <p className="text-[10px] uppercase tracking-widest mb-1 font-semibold" style={{ color: 'var(--text-muted)' }}>Total Horas</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{fmtHours(totalH)}</p>
          </div>
          <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
            <p className="text-[10px] uppercase tracking-widest mb-1 font-semibold" style={{ color: 'var(--text-muted)' }}>Custo Total</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--text)' }}>{fmtCurrency(totalC)}</p>
          </div>
        </div>
        <Table>
          <Thead>
            <Tr><Th>Cliente</Th><Th>Horas</Th><Th>Custo Interno</Th></Tr>
          </Thead>
          <Tbody>
            {data.map(r => (
              <Tr key={r.customer_id}>
                <Td><span className="font-medium text-sm" style={{ color: 'var(--text)' }}>{r.customer_name}</span></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmtHours(r.total_hours)}</span>
                    <MiniBar value={r.total_hours} max={maxHours} color="var(--primary)" />
                  </div>
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmtCurrency(r.total_cost)}</span>
                    <MiniBar value={r.total_cost} max={maxCost} color="var(--text-muted)" />
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>
    )
  }

  function renderConsultores() {
    if (analyticsLoading) return <SkeletonTable rows={6} cols={4} />
    const data = analytics?.by_consultant ?? []
    const detail = analytics?.detail ?? []
    if (data.length === 0) return <EmptyState icon={User as LucideIcon} title="Sem dados" description="Nenhum apontamento IC no período." />
    const maxH = Math.max(...data.map(r => r.total_hours))
    return (
      <Table>
        <Thead>
          <Tr><Th>Consultor</Th><Th>Horas</Th><Th>Custo</Th><Th>Clientes</Th><Th></Th></Tr>
        </Thead>
        <Tbody>
          {data.map(r => {
            const expanded = expandedConsultant === r.user_id
            const myDetail = detail.filter(d => d.user_id === r.user_id)
            return [
              <Tr key={r.user_id}>
                <Td><span className="font-medium text-sm" style={{ color: 'var(--text)' }}>{r.user_name}</span></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmtHours(r.total_hours)}</span>
                    <MiniBar value={r.total_hours} max={maxH} />
                  </div>
                </Td>
                <Td><span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmtCurrency(r.total_cost)}</span></Td>
                <Td><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>{r.num_customers} cliente{r.num_customers !== 1 ? 's' : ''}</span></Td>
                <Td>
                  {myDetail.length > 0 && (
                    <button onClick={() => setExpandedConsultant(expanded ? null : r.user_id)}
                      className="flex items-center gap-1 text-xs transition-colors hover:opacity-70"
                      style={{ color: 'var(--text-light)' }}>
                      {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      {expanded ? 'fechar' : 'ver'}
                    </button>
                  )}
                </Td>
              </Tr>,
              ...(expanded ? myDetail.map(d => (
                <Tr key={`${r.user_id}-${d.customer_id}`} baseBackground="var(--surface-hover)">
                  <Td>
                    <span className="ml-5 text-xs" style={{ color: 'var(--text-light)' }}>↳ {d.customer_name}</span>
                  </Td>
                  <Td><span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtHours(d.total_hours)}</span></Td>
                  <Td><span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtCurrency(d.total_cost)}</span></Td>
                  <Td /><Td />
                </Tr>
              )) : [])
            ]
          })}
        </Tbody>
      </Table>
    )
  }

  function renderMensal() {
    if (analyticsLoading) return <SkeletonTable rows={6} cols={3} />
    const data = analytics?.monthly ?? []
    if (data.length === 0) return <EmptyState icon={BarChart2 as LucideIcon} title="Sem dados" description="Nenhum apontamento IC no período." />
    const maxH = Math.max(...data.map(r => r.total_hours))
    const maxC = Math.max(...data.map(r => r.total_cost))
    return (
      <div className="space-y-3">
        {/* Gráfico de barras simples */}
        <div className="rounded-xl p-4" style={cardStyle}>
          <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--text-light)' }}>Horas por Mês</p>
          <div className="flex items-end gap-1.5 h-28">
            {data.map(r => {
              const pct = maxH > 0 ? (r.total_hours / maxH) * 100 : 0
              return (
                <div key={r.month} className="flex-1 flex flex-col items-center gap-1 group">
                  <span className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity tabular-nums" style={{ color: 'var(--primary)' }}>{fmtHours(r.total_hours)}</span>
                  <div className="w-full rounded-t-sm transition-all" style={{ height: `${Math.max(4, pct)}%`, background: 'var(--primary)', minHeight: 4 }} />
                  <span className="text-[9px] rotate-0 whitespace-nowrap" style={{ color: 'var(--text-light)', fontSize: '8px' }}>{fmtMonth(r.month)}</span>
                </div>
              )
            })}
          </div>
        </div>
        <Table>
          <Thead>
            <Tr><Th>Mês</Th><Th>Horas</Th><Th>Custo Interno</Th></Tr>
          </Thead>
          <Tbody>
            {data.map(r => (
              <Tr key={r.month}>
                <Td><span className="font-medium text-sm" style={{ color: 'var(--text)' }}>{fmtMonth(r.month)}</span></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmtHours(r.total_hours)}</span>
                    <MiniBar value={r.total_hours} max={maxH} />
                  </div>
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmtCurrency(r.total_cost)}</span>
                    <MiniBar value={r.total_cost} max={maxC} color="var(--text-muted)" />
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>
    )
  }

  function renderDetalhe() {
    if (analyticsLoading) return <SkeletonTable rows={8} cols={4} />
    const data = analytics?.detail ?? []
    if (data.length === 0) return <EmptyState icon={Clock as LucideIcon} title="Sem dados" description="Nenhum apontamento IC no período." />
    return (
      <Table>
        <Thead>
          <Tr><Th>Consultor</Th><Th>Cliente</Th><Th>Horas</Th><Th>Custo</Th></Tr>
        </Thead>
        <Tbody>
          {data.map((r, i) => (
            <Tr key={i}>
              <Td><span className="text-sm" style={{ color: 'var(--text)' }}>{r.user_name}</span></Td>
              <Td><span className="text-sm" style={{ color: 'var(--text-muted)' }}>{r.customer_name}</span></Td>
              <Td><span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmtHours(r.total_hours)}</span></Td>
              <Td><span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmtCurrency(r.total_cost)}</span></Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    )
  }

  // ── Render principal ──────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <PageHeader
        icon={TrendingUp as LucideIcon}
        title="Investimento Interno"
        subtitle="Projetos internos por cliente — não cobrados, refletidos no fechamento dos consultores"
      />

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {activeTab === 'projetos' && (
          <div className="relative min-w-48 flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-light)' }} />
            <input type="text" placeholder="Filtrar por cliente ou consultor..." value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              className="w-full pl-9 pr-3 h-9 rounded-xl text-xs outline-none" style={inputStyle} />
          </div>
        )}

        <MonthYearPicker month={filterMonth} year={filterYear}
          onChange={(m, y) => { if (m === 0) { setFilterMonth(0); setFilterYear(0) } else { setFilterMonth(m); setFilterYear(y) } }} />

        {activeTab === 'projetos' && (
          <>
            <span className="text-xs ml-auto" style={{ color: 'var(--text-light)' }}>
              {clientCount} cliente{clientCount !== 1 ? 's' : ''}
              {filterMonth > 0 && !hoursLoading && (
                <span> · <span className="font-semibold" style={{ color: 'var(--text)' }}>{fmtHours(totalHours)}</span> total</span>
              )}
            </span>
            {isAdmin && (
              <Button size="sm" variant="primary" onClick={() => {
                setLeadMode(false); setNewProjectParent(''); setNewProjectCategoria('Projeto')
                setNewProjectName(''); setNewProjectApprover(''); setNewProjectOpen(true)
              }}>
                <Plus size={13} className="mr-1" /> Novo Projeto Interno ({houseName})
              </Button>
            )}
          </>
        )}
      </div>

      {/* Abas — ativo: fundo primary sólido + texto branco (contraste máximo) */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {TABS.map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={active
                ? { background: 'var(--primary)', color: 'var(--primary-fg)', border: '1px solid var(--primary)' }
                : { background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' }
              }>
              <Icon size={12} /> {tab.label}
            </button>
          )
        })}
      </div>

      {/* Filtro de categoria (apenas na aba projetos) */}
      {activeTab === 'projetos' && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {([
            { id: 'todas',       label: 'Todas as categorias' },
            { id: 'Comercial',   label: 'Comercial' },
            { id: 'Leads',       label: 'Leads' },
            { id: 'Sustentação', label: 'Sustentação' },
            { id: 'Projeto',     label: 'Projeto' },
            { id: 'Suporte',     label: 'Suporte' },
            { id: 'sem',         label: 'Sem categoria' },
          ] as const).map(opt => {
            const active = categoriaFilter === opt.id
            return (
              <button key={opt.id} onClick={() => setCategoriaFilter(opt.id)}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors"
                style={active
                  ? { background: 'var(--primary)', color: 'var(--primary-fg)', border: '1px solid var(--primary)' }
                  : { background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                {opt.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Conteúdo */}
      {activeTab === 'projetos'    && renderProjetos()}
      {activeTab === 'apontamentos' && <TimesheetsScreen scope="investimento" embedded leadOptions={leadOptions} />}
      {activeTab === 'aprovacoes'  && <ApprovalsScreen scope="investimento" embedded leadOptions={leadOptions} />}
      {activeTab === 'clientes'    && renderClientes()}
      {activeTab === 'consultores' && renderConsultores()}
      {activeTab === 'mensal'      && renderMensal()}
      {activeTab === 'detalhe'     && renderDetalhe()}

      {/* Modal: Novo Projeto Interno ({houseName}) */}
      {newProjectOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={() => !creatingProject && setNewProjectOpen(false)}>
          <div className="flex flex-col rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{leadMode ? 'Novo Lead' : 'Novo Projeto Interno'}</h2>
              <button onClick={() => !creatingProject && setNewProjectOpen(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)]">
                <X size={16} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs" style={{ color: 'var(--text-light)' }}>
                Cliente: <span className="font-semibold" style={{ color: 'var(--text)' }}>{houseName}</span> · sem horas e sem valor de contrato
              </p>
              {leadMode ? (
                <p className="text-xs" style={{ color: 'var(--text-light)' }}>
                  Lead abaixo de: <span className="font-semibold" style={{ color: 'var(--text)' }}>
                    {projects.find(p => String(p.id) === newProjectParent)?.name ?? 'Investimento Comercial'}
                  </span>
                </p>
              ) : (
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    Investimento pai (opcional)
                  </label>
                  <SearchSelect
                    fullWidth
                    value={newProjectParent}
                    onChange={setNewProjectParent}
                    options={projects
                      .filter(p => (p.customer?.name ?? '').toUpperCase().includes(houseName) && !p.parent_project_id)
                      .map(p => ({ id: p.id, name: p.name || p.code }))}
                    placeholder="Aninhar abaixo de um investimento (ex.: Investimento Leads)..."
                  />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Deixe vazio para um projeto de topo. Selecione p/ criar um lead abaixo do investimento.</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  {leadMode ? 'Nome do Cliente' : 'Nome do Projeto'} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input type="text" autoFocus value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !creatingProject) handleCreateProject() }}
                  placeholder={leadMode ? 'Ex: Acme Indústria' : 'Ex: Desenvolvimento Minutor'}
                  className="w-full px-3 h-9 rounded-xl text-sm outline-none" style={inputStyle} />
              </div>
              {!leadMode && (
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    Categoria <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select value={newProjectCategoria}
                    onChange={e => setNewProjectCategoria(e.target.value as 'Sustentação' | 'Projeto' | 'Suporte' | 'Comercial' | 'Leads')}
                    className="w-full px-3 h-9 rounded-xl text-sm outline-none" style={inputStyle}>
                    <option value="Sustentação">Sustentação</option>
                    <option value="Projeto">Projeto</option>
                    <option value="Suporte">Suporte</option>
                    <option value="Comercial">Comercial</option>
                    <option value="Leads">Leads</option>
                  </select>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Aprovador</label>
                  <button type="button" onClick={() => setNewProjectApprover(String(user?.id ?? ''))}
                    className="text-[11px] font-medium transition-colors" style={{ color: 'var(--primary)' }}>
                    → Me colocar como aprovador
                  </button>
                </div>
                <SearchSelect
                  fullWidth
                  value={newProjectApprover}
                  onChange={setNewProjectApprover}
                  options={approverOptions}
                  placeholder="Quem aprova os apontamentos (coordenador)..."
                />
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Sem aprovador, só admin aprova os apontamentos deste projeto.</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <Button variant="ghost" onClick={() => setNewProjectOpen(false)} disabled={creatingProject}>Cancelar</Button>
              <Button variant="primary" onClick={handleCreateProject} disabled={creatingProject || newProjectName.trim().length < 2}>
                {creatingProject ? 'Criando...' : (leadMode ? 'Criar Lead' : 'Criar Projeto')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar Projeto Interno */}
      {editProject && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={() => !savingEdit && closeEditModal()}>
          <div className="flex flex-col rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Editar Projeto Interno</h2>
              <button onClick={() => !savingEdit && closeEditModal()} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)]">
                <X size={16} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs" style={{ color: 'var(--text-light)' }}>
                Cliente: <span className="font-semibold" style={{ color: 'var(--text)' }}>{editProject.customer?.name ?? '—'}</span>
                {' · '}<span className="font-mono">{editProject.code}</span>
              </p>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  Nome do Projeto <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input type="text" autoFocus value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !savingEdit) handleSaveEdit() }}
                  className="w-full px-3 h-9 rounded-xl text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Categoria</label>
                <select value={editCategoria}
                  onChange={e => setEditCategoria(e.target.value as EditableCategoria)}
                  className="w-full px-3 h-9 rounded-xl text-sm outline-none" style={inputStyle}>
                  <option value="">— Sem categoria —</option>
                  <option value="Sustentação">Sustentação</option>
                  <option value="Projeto">Projeto</option>
                  <option value="Suporte">Suporte</option>
                  <option value="Comercial">Comercial</option>
                  <option value="Leads">Leads</option>
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Aprovador</label>
                  <button type="button" onClick={() => setEditApprover(String(user?.id ?? ''))}
                    className="text-[11px] font-medium transition-colors" style={{ color: 'var(--primary)' }}>
                    → Me colocar como aprovador
                  </button>
                </div>
                <SearchSelect
                  fullWidth
                  value={editApprover}
                  onChange={setEditApprover}
                  options={approverOptions}
                  placeholder="Quem aprova os apontamentos (coordenador)..."
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <button
                type="button"
                onClick={handleDeleteEdit}
                disabled={savingEdit || deletingEdit}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                style={{ background: 'rgba(239,68,68,0.10)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                <Trash2 size={13} /> {deletingEdit ? 'Excluindo...' : 'Excluir'}
              </button>
              <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={closeEditModal} disabled={savingEdit || deletingEdit}>Cancelar</Button>
                <Button variant="primary" onClick={handleSaveEdit} disabled={savingEdit || deletingEdit || editName.trim().length < 2}>
                  {savingEdit ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal gerenciar equipe */}
      {modal.open && modal.project && (() => {
        const userOpts = allUsers.map(u => ({ id: u.id, name: u.name }))
        const groupOpts = groups.map(g => ({ id: g.id, name: `${g.name} (${g.users.length})` }))

        const addGroup = (groupId: string) => {
          if (!groupId) return
          const g = groups.find(x => String(x.id) === String(groupId))
          if (!g) return
          const ids = g.users.map(u => u.id)
          setSelected(prev => [...new Set([...prev, ...ids])])
        }

        const removeUser = (id: number) => setSelected(prev => prev.filter(x => x !== id))
        const usersById = new Map(allUsers.map(u => [u.id, u]))

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-4" style={surfaceStyle}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>Investimento Interno</p>
                  <h2 className="text-base font-bold mt-0.5" style={{ color: 'var(--text)' }}>{modal.project!.customer?.name ?? '—'}</h2>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-light)' }}>{modal.project!.name} · <span className="font-mono">{modal.project!.code}</span></p>
                </div>
                <button onClick={closeModal} className="p-1 rounded-lg hover:bg-[var(--surface-hover)] transition-colors" style={{ color: 'var(--text-light)' }}><X size={16} /></button>
              </div>

              <div>
                <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Consultores</label>
                <MultiSelect
                  fullWidth
                  value={selected.map(String)}
                  onChange={vals => setSelected(vals.map(Number))}
                  options={userOpts}
                  placeholder="Selecione um ou mais consultores..."
                />
              </div>

              {groups.length > 0 && (
                <div>
                  <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Adicionar grupo (atalho)</label>
                  <SearchSelect
                    fullWidth
                    value=""
                    onChange={addGroup}
                    options={groupOpts}
                    placeholder="Selecione um grupo para adicionar todos os consultores..."
                  />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-light)' }}>Adiciona todos os consultores do grupo à seleção acima.</p>
                </div>
              )}

              {selected.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{selected.length} selecionado{selected.length !== 1 ? 's' : ''}</p>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {selected.map(id => {
                      const u = usersById.get(id)
                      if (!u) return null
                      return (
                        <span key={id} className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full"
                          style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--primary)' }}>
                          {u.name}
                          <button onClick={() => removeUser(id)} className="hover:opacity-70 transition-opacity" aria-label="Remover">
                            <X size={11} style={{ color: 'var(--primary)' }} />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Projeto Real por consultor — só em investimentos de Projeto/Suporte.
                  Define quais projetos reais do cliente cada consultor pode apontar. */}
              {(modal.project!.categoria_interna === 'Projeto' || modal.project!.categoria_interna === 'Suporte') && !(modal.project!.customer?.name ?? '').toUpperCase().includes(houseName) && selected.length > 0 && (
                <div>
                  <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Projeto Real por consultor</label>
                  <p className="text-[10px] mb-2" style={{ color: 'var(--text-light)' }}>
                    Escolha os projetos reais que cada consultor pode apontar ao lançar horas neste investimento. No apontamento aparecem só os escolhidos aqui.
                  </p>
                  <div className="flex flex-col gap-2.5 max-h-64 overflow-y-auto pr-0.5">
                    {selected.map(id => {
                      const u = usersById.get(id)
                      if (!u) return null
                      return (
                        <div key={id} className="rounded-xl p-2.5" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                          <p className="text-[11px] font-medium mb-1" style={{ color: 'var(--text)' }}>{u.name}</p>
                          <MultiSelect
                            fullWidth
                            value={(realByConsultant[id] ?? []).map(String)}
                            onChange={vals => setRealByConsultant(prev => ({ ...prev, [id]: vals.map(Number) }))}
                            options={realProjectOpts}
                            placeholder={realProjectOpts.length === 0 ? 'Nenhum projeto real disponível' : 'Selecione o(s) projeto(s) real(is)...'}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="secondary" className="flex-1" onClick={closeModal}>Cancelar</Button>
                <Button variant="primary" className="flex-1" onClick={saveTeam} disabled={saving}>{saving ? 'Salvando…' : 'Salvar Equipe'}</Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal: Abrir/Fechar mês (períodos abertos) — mesma regra dos projetos tradicionais */}
      {openPeriodProject && (
        <ICOpenPeriodModal
          project={openPeriodProject}
          onClose={() => setOpenPeriodProject(null)}
          onRefresh={(hasOpen) => setProjects(prev => prev.map(p => p.id === openPeriodProject.id ? { ...p, has_open_period: hasOpen } : p))}
        />
      )}
    </AppLayout>
  )
}

// ─── Modal de abertura/fechamento de mês ────────────────────────────────────────
// Reusa os endpoints genéricos de projeto (/projects/{id}/open-period|close-periods|
// open-periods) — os mesmos da Gestão de Projetos tradicional.
function ICOpenPeriodModal({ project, onClose, onRefresh }: {
  project: ICProject
  onClose: () => void
  onRefresh: (hasOpen: boolean) => void
}) {
  const now = new Date()
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const defaultYearMonth = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`

  const [yearMonth, setYearMonth]     = useState(defaultYearMonth)
  const [openPeriods, setOpenPeriods] = useState<{ id: number; year_month: string }[]>([])
  const [saving, setSaving]           = useState(false)
  const [closing, setClosing]         = useState(false)

  useEffect(() => {
    api.get<any>(`/projects/${project.id}/open-periods`)
      .then(r => setOpenPeriods(Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : [])))
      .catch(() => {})
  }, [project.id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const fmtMonth = (ym: string) => {
    const [y, m] = ym.split('-')
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }

  const handleOpen = async () => {
    setSaving(true)
    try {
      await api.post(`/projects/${project.id}/open-period`, { year_month: yearMonth })
      toast.success(`Mês ${fmtMonth(yearMonth)} aberto para este projeto.`)
      onRefresh(true)
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao abrir período')
    } finally { setSaving(false) }
  }

  const handleCloseAll = async () => {
    setClosing(true)
    try {
      const r = await api.post<{ count: number }>(`/projects/${project.id}/close-periods`, {})
      toast.success(`${r.count} período(s) fechado(s).`)
      onRefresh(false)
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao fechar períodos')
    } finally { setClosing(false) }
  }

  const monthOptions: { value: string; label: string }[] = []
  for (let i = 1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthOptions.push({ value: val, label: fmtMonth(val) })
  }

  const hasOpenPeriods = openPeriods.length > 0 || project.has_open_period === true

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl relative" style={{ background: 'var(--surface-raised, var(--surface))', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 p-1 transition-colors" style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <CalendarPlus size={14} style={{ color: 'var(--warning-border)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Períodos Abertos</h3>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            <strong>{project.name}</strong> — permite apontamentos em meses com competência fechada
          </p>

          {hasOpenPeriods && (
            <div className="mb-4 space-y-1.5">
              <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Meses atualmente abertos:</p>
              {openPeriods.length > 0 ? openPeriods.map(p => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', color: 'var(--warning)', fontWeight: 600 }}>
                  <CalendarPlus size={11} style={{ color: 'var(--warning-border)' }} />
                  {fmtMonth(p.year_month)}
                </div>
              )) : (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', color: 'var(--warning)', fontWeight: 600 }}>
                  <CalendarPlus size={11} style={{ color: 'var(--warning-border)' }} />
                  Há mês(es) aberto(s) neste projeto
                </div>
              )}
              <button onClick={handleCloseAll} disabled={closing}
                className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                style={{ background: 'var(--danger)', color: 'var(--primary-fg)', border: '1px solid var(--danger)' }}>
                <CalendarOff size={12} />
                {closing ? 'Fechando...' : 'Fechar mês(es) aberto(s)'}
              </button>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
                {hasOpenPeriods ? 'Ou abrir outro mês:' : 'Abrir mês:'}
              </label>
              <select value={yearMonth} onChange={e => setYearMonth(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                {monthOptions.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs"
                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--surface)' }}>
                Cancelar
              </button>
              <button onClick={handleOpen} disabled={saving}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={hasOpenPeriods
                  ? { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                  : { background: 'var(--warning-border)', color: 'var(--surface)', border: '1px solid var(--warning-border)' }}>
                {saving ? 'Abrindo...' : 'Abrir Mês'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
