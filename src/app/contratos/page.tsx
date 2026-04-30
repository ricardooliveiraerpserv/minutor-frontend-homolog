'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Pencil, Eye, ChevronLeft, ChevronRight, LayoutGrid, Download, FileText, MoreVertical, CheckCircle, Rocket, X, Layers, DollarSign, Clock, BarChart2, TrendingUp, Users, MessageSquare, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { ContractFormModal } from '@/components/contracts/ContractFormModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContractAttachment {
  id: number
  type: 'proposta' | 'contrato' | 'logo'
  original_name: string
  size: number | null
  created_at: string
}

interface Contract {
  id: number
  customer_id: number
  customer?: { id: number; name: string }
  status: 'rascunho' | 'aprovado' | 'inicio_autorizado' | 'ativo'
  categoria: 'projeto' | 'sustentacao'
  service_type_id: number | null
  service_type?: { id: number; name: string }
  contract_type_id: number | null
  contract_type?: { id: number; name: string }
  cobra_despesa_cliente: boolean
  architect_id: number | null
  architect?: { id: number; name: string }
  tipo_alocacao: 'remoto' | 'presencial' | 'ambos' | null
  horas_contratadas: number
  valor_projeto: number | null
  valor_hora: number | null
  hora_adicional: number | null
  pct_horas_coordenador: number | null
  horas_consultor: number | null
  expectativa_inicio: string | null
  condicao_pagamento: string | null
  limite_despesa: number | null
  executivo_conta_id: number | null
  executivo_conta?: { id: number; name: string }
  vendedor_id: number | null
  vendedor?: { id: number; name: string }
  observacoes: string | null
  project_id: number | null
  project?: {
    id: number
    code: string
    name: string
    status?: string
    sold_hours?: number | null
    hour_contribution?: number | null
    consumed_hours?: number | null
    general_hours_balance?: number | null
  }
  generated_at: string | null
  contacts: { id?: number; name: string; cargo: string; email: string; phone: string }[]
  attachments: ContractAttachment[]
  created_at: string
}

interface SelectOption { id: number; name: string; code_prefix?: string | null }

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  aprovado: 'Aprovado',
  inicio_autorizado: 'Início Autorizado',
  ativo: 'Ativo',
}

const STATUS_COLOR: Record<string, string> = {
  rascunho: '#71717a',
  aprovado: '#3b82f6',
  inicio_autorizado: '#eab308',
  ativo: '#22c55e',
}

const CATEGORIA_LABEL: Record<string, string> = {
  projeto: 'Projeto',
  sustentacao: 'Sustentação',
}

const ATTACHMENT_TYPE_LABEL: Record<string, string> = {
  proposta: 'Proposta',
  contrato: 'Contrato',
  logo: 'Logo',
}

const TIPO_LABEL: Record<string, string> = {
  banco_horas_fixo:   'BH Fixo',
  banco_horas_mensal: 'BH Mensal',
  on_demand:          'On Demand',
  fechado:            'Fechado',
  cloud:              'Cloud',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContratosPage() {
  const router = useRouter()
  const { user } = useAuth()

  useEffect(() => {
    if (user && user.type !== 'admin') router.replace('/dashboard')
  }, [user, router])

  // List state
  const [contracts, setContracts] = useState<Contract[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(false)

  const { filters: flt, set: setFilter } = usePersistedFilters(
    'contratos',
    user?.id,
    {
      page:           1,
      filterStatus:   '',
      filterCustomer: '',
      search:         '',
      listTab:        'contratos' as 'contratos' | 'projetos',
    },
  )
  const { page, filterStatus, filterCustomer, search, listTab } = flt
  const setPage           = (v: number)                           => setFilter('page', v)
  const setFilterStatus   = (v: string)                           => setFilter('filterStatus', v)
  const setFilterCustomer = (v: string)                           => setFilter('filterCustomer', v)
  const setSearch         = (v: string)                           => setFilter('search', v)
  const setListTab        = (v: 'contratos' | 'projetos')         => setFilter('listTab', v)

  // Master data (apenas customers para filtro)
  const [customers, setCustomers] = useState<SelectOption[]>([])

  const isCliente      = user?.type === 'cliente'
  const isSustAdmin    = user?.type === 'admin' || (user?.type === 'coordenador' && (user as any).coordinator_type === 'sustentacao')
  const isAdminOrCoord = user?.type === 'admin' || user?.type === 'coordenador'

  // Project action state (aba Projetos)
  const [projectAction, setProjectAction] = useState<{ contract: Contract; action: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string; type: 'contract' | 'project' } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Row dropdown
  const [openDropdown, setOpenDropdown] = useState<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [viewContract, setViewContract] = useState<Contract | null>(null)
  const [viewLogs, setViewLogs] = useState<any[]>([])
  const [sustQueue, setSustQueue]   = useState('')
  const [sustMoving, setSustMoving] = useState(false)
  const [editContract, setEditContract] = useState<Contract | null>(null)

  // Generate project modal
  const [genModal, setGenModal] = useState<{ contract: Contract } | null>(null)
  const [genCoordinatorIds, setGenCoordinatorIds] = useState<number[]>([])
  const [generating, setGenerating] = useState(false)
  const [coordinators, setCoordinators] = useState<SelectOption[]>([])

  // Load master data
  useEffect(() => {
    api.get<any>('/customers?pageSize=500').then(r => setCustomers(r?.items ?? r ?? [])).catch(() => {})
    api.get<any>('/users?type=coordenador&pageSize=500').then(r => setCoordinators((r?.items ?? r ?? []).map((u: any) => ({ id: u.id, name: u.name })))).catch(() => {})
  }, [])

  const loadContracts = useCallback(async () => {
    setLoading(true)
    try {
      const qp = new URLSearchParams({ page: String(page), per_page: '200' })
      if (filterStatus) qp.set('status', filterStatus)
      if (filterCustomer) qp.set('customer_id', filterCustomer)
      if (search) qp.set('search', search)
      const r = await api.get<any>(`/contracts?${qp}`)
      setContracts(r?.data ?? [])
      setTotal(r?.total ?? 0)
    } catch { toast.error('Erro ao carregar contratos') }
    finally { setLoading(false) }
  }, [page, filterStatus, filterCustomer, search])

  useEffect(() => { loadContracts() }, [loadContracts])

  useEffect(() => {
    if (!viewContract) { setViewLogs([]); return }
    api.get<any[]>(`/contracts/${viewContract.id}/kanban-logs`).then(setViewLogs).catch(() => setViewLogs([]))
  }, [viewContract])

  // Auto-open edit when ?editId=X is present in URL (e.g. from Kanban)
  // ─── Open modal helpers ───────────────────────────────────────────────────

  const openNew = () => {
    setEditContract(null)
    setModalOpen(true)
  }

  const openEdit = (c: Contract) => {
    setEditContract(c)
    setModalOpen(true)
  }

  const openView = async (c: Contract) => {
    const full = await api.get<Contract>(`/contracts/${c.id}`)
    setSustQueue((full as any).sustentacao_column ?? '')
    setViewContract(full)
  }

  const handleSustMove = async () => {
    if (!viewContract || !sustQueue) return
    setSustMoving(true)
    try {
      await api.patch(`/contracts/${viewContract.id}/sustentacao-move`, { to_column: sustQueue })
      toast.success('Contrato movido para a fila de sustentação')
      loadContracts()
      setViewContract(null)
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao mover para fila')
    } finally { setSustMoving(false) }
  }

  // ─── Status update ────────────────────────────────────────────────────────

  const updateStatus = async (c: Contract, status: string) => {
    try {
      await api.patch(`/contracts/${c.id}/status`, { status })
      toast.success(`Status alterado para ${STATUS_LABEL[status]}`)
      loadContracts()
    } catch (e: any) { toast.error(e?.message ?? 'Erro') }
  }

  // ─── Generate project ─────────────────────────────────────────────────────

  const openGenModal = (c: Contract) => {
    // Pre-select architect if set
    const preIds: number[] = c.architect_id ? [c.architect_id] : []
    setGenCoordinatorIds(preIds)
    setGenModal({ contract: c })
  }

  const confirmGenerateProject = async () => {
    if (!genModal) return
    const c = genModal.contract
    setGenerating(true)
    try {
      if (c.status !== 'inicio_autorizado' && c.status !== 'aprovado') {
        await api.patch(`/contracts/${c.id}/status`, { status: 'inicio_autorizado' })
      }
      const r = await api.post<{ project_id: number; project_code: string }>(`/contracts/${c.id}/generate-project`, {
        coordinator_ids: genCoordinatorIds,
      })
      toast.success(`Projeto ${r.project_code} gerado com sucesso!`)
      setGenModal(null)
      loadContracts()
      router.push(`/projects?highlight=${r.project_id}`)
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao gerar projeto') }
    finally { setGenerating(false) }
  }

  // ─── Attachment helpers (view modal) ─────────────────────────────────────

  const downloadAttachment = async (contractId: number, att: ContractAttachment) => {
    const token = localStorage.getItem('minutor_token')
    const res = await fetch(`/api/v1/contracts/${contractId}/attachments/${att.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) { toast.error('Erro ao baixar arquivo'); return }
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = att.original_name; a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Project menu items (aba Projetos, admin/coordenador) ────────────────
  const PROJECT_MENU_ITEMS = [
    { action: 'view',       label: 'Visualizar',       icon: Eye,      del: false },
    { action: 'edit',       label: 'Editar',            icon: Pencil,   del: false },
    { action: 'status',     label: 'Alterar Status',    icon: Layers,   del: false },
    { action: 'cost',       label: 'Custo',             icon: DollarSign, del: false },
    { action: 'timesheets', label: 'Apontamentos',      icon: Clock,    del: false },
    { action: 'expenses',   label: 'Despesas',          icon: BarChart2, del: false },
    { action: 'aportes',    label: 'Aportes',           icon: TrendingUp, del: false },
    { action: 'team',       label: 'Selecionar Equipe', icon: Users,    del: false },
    { action: 'delete',     label: 'Excluir',           icon: Trash2,   del: true  },
  ] as const

  const handleProjectAction = (contract: Contract, action: string) => {
    const pid = contract.project_id!
    if (action === 'timesheets') { router.push(`/timesheets?project_id=${pid}`); return }
    if (action === 'expenses')   { router.push(`/expenses?project_id=${pid}`);   return }
    if (action === 'cost')       { router.push(`/gestao-projetos`); return }
    if (action === 'aportes')    { router.push(`/gestao-projetos`); return }
    if (action === 'team')       { router.push(`/gestao-projetos`); return }
    if (action === 'delete')     { setDeleteTarget({ id: pid, name: contract.project?.name ?? contract.project?.code ?? `Projeto #${pid}`, type: 'project' }); return }
    setProjectAction({ contract, action })
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const tabContratos = contracts.filter(c => !c.project_id)
  const tabProjetos  = contracts.filter(c => !!c.project_id)
  const visibleContracts = listTab === 'projetos' ? tabProjetos : tabContratos

  const inputCls   = 'w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none focus:ring-1 focus:ring-cyan-500/40'
  const inputStyle = { border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }

  return (
    <AppLayout title="Contratos">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Contratos</h1>
          <p className="text-xs text-zinc-500 mt-0.5">{total} contrato{total !== 1 ? 's' : ''} cadastrado{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/contratos/kanban')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)' }}>
            <LayoutGrid size={14} /> Kanban
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{ background: 'rgba(0,245,255,0.12)', border: '1px solid rgba(0,245,255,0.3)', color: '#00F5FF' }}>
            <Plus size={15} /> Novo Contrato
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          type="text" placeholder="Buscar cliente..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className={inputCls} style={{ ...inputStyle, width: 220 }}
        />
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          className={inputCls} style={{ ...inputStyle, width: 180 }}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filterCustomer} onChange={e => { setFilterCustomer(e.target.value); setPage(1) }}
          className={inputCls} style={{ ...inputStyle, width: 200 }}>
          <option value="">Todos os clientes</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 rounded-xl w-fit mb-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        {([
          { id: 'contratos', label: 'Contratos', count: tabContratos.length },
          { id: 'projetos',  label: 'Projetos',  count: tabProjetos.length  },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setListTab(tab.id)}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={listTab === tab.id
              ? { background: 'rgba(0,245,255,0.1)', color: 'var(--brand-primary)', border: '1px solid rgba(0,245,255,0.2)' }
              : { color: 'var(--brand-muted)', border: '1px solid transparent' }
            }>
            {tab.label}
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
              style={listTab === tab.id
                ? { background: 'rgba(0,245,255,0.15)', color: 'var(--brand-primary)' }
                : { background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)' }
              }>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      <div className="rounded-xl border overflow-clip" style={{ borderColor: 'var(--brand-border)' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10" style={{ background: 'var(--brand-surface)' }}>
            <tr style={{ background: 'var(--brand-surface)', borderBottom: '1px solid var(--brand-border)' }}>
              <th className="w-10 px-2 py-3" />
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Cliente</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Categoria</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Tipo de Contrato</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Tipo de Serviço</th>
              <th className="text-center px-4 py-3 text-zinc-400 font-medium">Horas</th>
              {listTab === 'projetos' && <>
                <th className="text-center px-4 py-3 text-zinc-400 font-medium">HS Consumidas</th>
                <th className="text-center px-4 py-3 text-zinc-400 font-medium">Saldo</th>
              </>}
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Expectativa</th>
              <th className="text-center px-4 py-3 text-zinc-400 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Projeto</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={listTab === 'projetos' ? 11 : 9} className="px-4 py-8 text-center text-zinc-500 text-xs">Carregando...</td></tr>
            )}
            {!loading && visibleContracts.length === 0 && (
              <tr><td colSpan={listTab === 'projetos' ? 11 : 9} className="px-4 py-8 text-center text-zinc-600 text-xs">Nenhum item encontrado.</td></tr>
            )}
            {!loading && visibleContracts.map((c, i) => (
              <tr key={c.id} style={{ borderTop: i > 0 ? '1px solid var(--brand-border)' : undefined, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <td className="w-10 px-2 py-3 text-center relative">
                  <button
                    onClick={e => { e.stopPropagation(); setOpenDropdown(openDropdown === c.id ? null : c.id) }}
                    className="p-1 rounded-md transition-colors hover:bg-zinc-700/60 text-zinc-500 hover:text-zinc-300">
                    <MoreVertical size={15} />
                  </button>
                  {openDropdown === c.id && (
                    <div ref={dropdownRef} className="absolute left-8 top-8 z-[200] rounded-xl overflow-hidden shadow-xl"
                      style={{ background: '#1c1c1e', border: '1px solid var(--brand-border)', minWidth: 168 }}>
                      {listTab === 'projetos' && isAdminOrCoord ? (
                        PROJECT_MENU_ITEMS.map(item => {
                          const Icon = item.icon
                          return (
                            <button key={item.action}
                              onClick={e => { e.stopPropagation(); setOpenDropdown(null); handleProjectAction(c, item.action) }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors hover:bg-zinc-700/50"
                              style={{ color: item.action === 'delete' ? '#f87171' : 'var(--brand-text)' }}>
                              <Icon size={14} className="shrink-0" style={{ color: item.action === 'delete' ? '#f87171' : '#a1a1aa' }} /> {item.label}
                            </button>
                          )
                        })
                      ) : (
                        <>
                          <button onClick={e => { e.stopPropagation(); setOpenDropdown(null); openView(c) }}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors hover:bg-zinc-700/50" style={{ color: 'var(--brand-text)' }}>
                            <Eye size={14} className="text-zinc-400" /> Visualizar
                          </button>
                          <button onClick={e => { e.stopPropagation(); setOpenDropdown(null); openEdit(c) }}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors hover:bg-zinc-700/50" style={{ color: 'var(--brand-text)' }}>
                            <Pencil size={14} className="text-zinc-400" /> Editar
                          </button>
                          <button onClick={e => { e.stopPropagation(); setOpenDropdown(null); setDeleteTarget({ id: c.id, name: c.customer?.name ?? `Contrato #${c.id}`, type: 'contract' }) }}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors hover:bg-zinc-700/50" style={{ color: '#f87171' }}>
                            <Trash2 size={14} style={{ color: '#f87171' }} /> Excluir
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-white font-medium">{c.customer?.name ?? '—'}</td>
                <td className="px-4 py-3 text-zinc-300">{CATEGORIA_LABEL[c.categoria]}</td>
                <td className="px-4 py-3 text-zinc-400 text-xs">{c.contract_type?.name ?? '—'}</td>
                <td className="px-4 py-3 text-zinc-400 text-xs">{c.service_type?.name ?? '—'}</td>
                <td className="px-4 py-3 text-center text-zinc-300">{c.horas_contratadas}h</td>
                {listTab === 'projetos' && (() => {
                  const isClosed  = c.project?.status === 'finished' || c.project?.status === 'cancelled'
                  const hideHours = isCliente && isClosed
                  const bal       = c.project?.general_hours_balance
                  return (<>
                    <td className="px-4 py-3 text-center text-zinc-300 text-xs">
                      {!c.project ? '—' : hideHours ? '—' : c.project.consumed_hours != null ? `${c.project.consumed_hours.toFixed(1)}h` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-xs"
                      style={{ color: !hideHours && c.project && (bal ?? 0) < 0 ? '#ef4444' : 'rgb(212 212 216)' }}>
                      {!c.project ? '—' : hideHours ? '—' : bal != null ? `${bal.toFixed(1)}h` : '—'}
                    </td>
                  </>)
                })()}
                <td className="px-4 py-3 text-zinc-400 text-xs">{fmtDate(c.expectativa_inicio)}</td>
                <td className="px-4 py-3 text-center">
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ background: `${STATUS_COLOR[c.status]}18`, color: STATUS_COLOR[c.status] }}>
                    {STATUS_LABEL[c.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {c.project ? (
                    <div>
                      <p className="text-zinc-300 text-sm leading-tight">{c.project.name}</p>
                      <span className="text-cyan-400 font-mono">{c.project.code}</span>
                    </div>
                  ) : <span className="text-zinc-600">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {total > 200 && (
        <div className="flex items-center justify-between mt-4 text-xs text-zinc-500">
          <span>{total} contratos</span>
          <div className="flex items-center gap-2">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}
              className="p-1 rounded disabled:opacity-30"><ChevronLeft size={14} /></button>
            <span>Pág. {page}</span>
            <button disabled={contracts.length < 200} onClick={() => setPage(page + 1)}
              className="p-1 rounded disabled:opacity-30"><ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      {/* ── Create/Edit Modal (componente reutilizável) ── */}
      <ContractFormModal
        open={modalOpen}
        editContract={editContract}
        onClose={() => { setModalOpen(false); setEditContract(null) }}
        onSaved={loadContracts}
      />

      {/* ── View Modal ── */}
      {viewContract && (() => {
        const vc = viewContract
        const fmtMoney = (val: any) => val != null ? `R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'
        const fmtHours = (val: any) => val != null ? `${val}h` : '—'
        const fields: [string, string][] = [
          ['Categoria',           CATEGORIA_LABEL[vc.categoria] ?? vc.categoria],
          ['Tipo de Contrato',    vc.contract_type?.name ?? '—'],
          ['Tipo de Serviço',     vc.service_type?.name ?? '—'],
          ['Faturamento',         vc.contract_type?.name ? (TIPO_LABEL[vc.contract_type.name] ?? vc.contract_type.name) : '—'],
          ['Horas Contratadas',   fmtHours(vc.horas_contratadas)],
          ['Horas Consultor',     fmtHours(vc.horas_consultor)],
          ['% Horas Coordenador', vc.pct_horas_coordenador != null ? `${vc.pct_horas_coordenador}%` : '—'],
          ['Valor do Projeto',    fmtMoney(vc.valor_projeto)],
          ['Valor/Hora',          fmtMoney(vc.valor_hora)],
          ['Hora Adicional',      fmtMoney(vc.hora_adicional)],
          ['Cobra Despesa',       vc.cobra_despesa_cliente ? 'Sim' : 'Não'],
          ['Limite de Despesa',   fmtMoney(vc.limite_despesa)],
          ['Expectativa Início',  fmtDate(vc.expectativa_inicio)],
          ['Tipo de Alocação',    vc.tipo_alocacao ?? '—'],
          ['Cond. Pagamento',     vc.condicao_pagamento ?? '—'],
          ['Arquiteto',           vc.architect?.name ?? '—'],
          ['Executivo de Conta',  vc.executivo_conta?.name ?? '—'],
          ['Vendedor',            vc.vendedor?.name ?? '—'],
          ['Observações',         vc.observacoes ?? '—'],
          ['Status',              STATUS_LABEL[vc.status] ?? vc.status],
          ['Projeto Gerado',      vc.project?.code ?? '—'],
        ]
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
            <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
              {/* Header */}
              <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>{vc.customer?.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--brand-muted)' }}>Criado em {fmtDate(vc.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold px-2 py-1 rounded-full"
                      style={{ background: `${STATUS_COLOR[vc.status]}22`, color: STATUS_COLOR[vc.status] }}>
                      {STATUS_LABEL[vc.status]}
                    </span>
                    <button onClick={() => setViewContract(null)} className="p-1 rounded-lg hover:bg-white/10 transition-colors" style={{ color: 'var(--brand-subtle)' }}><X size={16} /></button>
                  </div>
                </div>
              </div>


              {/* Body */}
              <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {fields.map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{label}</p>
                      <p className="text-sm" style={{ color: 'var(--brand-text)' }}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* Attachments */}
                {vc.attachments.length > 0 && (
                  <div className="pt-2 border-t" style={{ borderColor: 'var(--brand-border)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Anexos ({vc.attachments.length})</p>
                    <div className="space-y-2">
                      {vc.attachments.map(att => (
                        <div key={att.id} className="flex items-center justify-between px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--brand-border)' }}>
                          <div className="flex items-center gap-2">
                            <FileText size={13} className="text-zinc-400" />
                            <div>
                              <p className="text-xs text-zinc-300">{att.original_name}</p>
                              <p className="text-[10px] text-zinc-600">{ATTACHMENT_TYPE_LABEL[att.type]} · {fmt(att.size)}</p>
                            </div>
                          </div>
                          <button onClick={() => downloadAttachment(vc.id, att)} className="p-1 text-zinc-400 hover:text-cyan-400 transition-colors"><Download size={13} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Kanban logs */}
                {viewLogs.length > 0 && (
                  <div className="pt-2 border-t" style={{ borderColor: 'var(--brand-border)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand-subtle)' }}>Histórico de movimentações</p>
                    <div className="space-y-2">
                      {viewLogs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2 text-xs" style={{ color: 'var(--brand-muted)' }}>
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-current opacity-40 mt-1.5" />
                          <div>
                            <span style={{ color: 'var(--brand-text)' }}>{log.from_column}</span>
                            <span className="mx-1">→</span>
                            <span style={{ color: 'var(--brand-text)' }}>{log.to_column}</span>
                            <span className="ml-2 opacity-60">por {log.moved_by}</span>
                            <span className="ml-2 opacity-40">{new Date(log.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--brand-border)' }}>
                <button onClick={() => setViewContract(null)}
                  className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--brand-muted)' }}>
                  Fechar
                </button>
                <button onClick={() => { openEdit(vc); setViewContract(null) }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}>
                  <Pencil size={13} /> Editar Contrato
                </button>
              </div>
            </div>
          </div>
        )
      })()}
      {/* ── Generate Project Modal ── */}
      {genModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-md rounded-2xl border overflow-hidden" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Rocket size={16} style={{ color: '#eab308' }} /> Gerar Projeto
              </h2>
              <p className="text-xs text-zinc-500 mt-1">{genModal.contract.customer?.name}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-3">Coordenadores do Projeto</p>
                <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                  {coordinators.length === 0 && (
                    <p className="text-xs text-zinc-600 italic">Nenhum coordenador cadastrado.</p>
                  )}
                  {coordinators.map(u => {
                    const sel = genCoordinatorIds.includes(u.id)
                    return (
                      <button key={u.id} type="button"
                        onClick={() => setGenCoordinatorIds(ids => sel ? ids.filter(i => i !== u.id) : [...ids, u.id])}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left"
                        style={{
                          background: sel ? 'rgba(0,245,255,0.08)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${sel ? 'var(--brand-primary)' : 'var(--brand-border)'}`,
                          color: sel ? 'var(--brand-primary)' : 'var(--brand-text)',
                        }}>
                        <span className="w-4 h-4 rounded flex items-center justify-center shrink-0 text-[10px] font-bold"
                          style={{ background: sel ? 'var(--brand-primary)' : 'transparent', border: `1px solid ${sel ? 'var(--brand-primary)' : 'var(--brand-border)'}`, color: '#0A0A0B' }}>
                          {sel ? '✓' : ''}
                        </span>
                        {u.name}
                      </button>
                    )
                  })}
                </div>
                {genCoordinatorIds.length === 0 && (
                  <p className="text-[11px] text-amber-400 mt-2">Nenhum coordenador selecionado — o arquiteto do contrato será usado como fallback.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--brand-border)' }}>
              <button onClick={() => setGenModal(null)} disabled={generating}
                className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors">
                Cancelar
              </button>
              <button onClick={confirmGenerateProject} disabled={generating}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
                style={{ background: '#eab308', color: '#0A0A0B' }}>
                <Rocket size={14} />
                {generating ? 'Gerando...' : 'Confirmar e Gerar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Project action modals (aba Projetos, admin/coordenador) ── */}
      {projectAction && (() => {
        const { contract: c, action } = projectAction
        const close = () => setProjectAction(null)
        const pid = c.project_id!
        const pname = c.project?.name ?? c.project?.code ?? ''

        if (action === 'view') {
          router.push(`/gestao-projetos`)
          close()
          return null
        }

        if (action === 'edit') {
          openEdit(c)
          close()
          return null
        }

        if (action === 'status') return (
          <ProjectStatusModal projectId={pid} projectName={pname} onClose={close} onSaved={close} />
        )

        return null
      })()}

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70">
          <div className="rounded-2xl w-full max-w-sm overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid rgba(239,68,68,0.4)' }}>
            <div className="px-6 py-5 flex items-center gap-3">
              <Trash2 size={20} className="text-red-400 shrink-0" />
              <div>
                <p className="font-semibold text-white">Excluir {deleteTarget.type === 'project' ? 'Projeto' : 'Contrato'}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{deleteTarget.name}</p>
              </div>
            </div>
            <div className="px-6 pb-4">
              <p className="text-sm text-zinc-300">Tem certeza? Esta ação não pode ser desfeita.</p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: 'var(--brand-border)' }}>
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors">
                Cancelar
              </button>
              <button disabled={deleting} onClick={async () => {
                setDeleting(true)
                try {
                  if (deleteTarget.type === 'contract') {
                    await api.delete(`/contracts/${deleteTarget.id}`)
                    toast.success('Contrato excluído')
                  } else {
                    await api.delete(`/projects/${deleteTarget.id}`)
                    toast.success('Projeto excluído')
                  }
                  setDeleteTarget(null)
                  loadContracts()
                } catch (e: any) {
                  toast.error(e?.message ?? 'Erro ao excluir')
                } finally { setDeleting(false) }
              }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                <Trash2 size={14} /> {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

    </AppLayout>
  )
}

// ─── ProjectStatusModal ───────────────────────────────────────────────────────

function ProjectStatusModal({ projectId, projectName, onClose, onSaved }: {
  projectId: number
  projectName: string
  onClose: () => void
  onSaved: (status: string) => void
}) {
  const PROJECT_STATUSES = [
    { value: 'active',    label: 'Ativo',      color: '#22c55e' },
    { value: 'on_hold',   label: 'Em Espera',  color: '#eab308' },
    { value: 'finished',  label: 'Encerrado',  color: '#6366f1' },
    { value: 'cancelled', label: 'Cancelado',  color: '#ef4444' },
  ]
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await api.patch(`/projects/${projectId}/status`, { status: selected })
      toast.success('Status do projeto atualizado')
      onSaved(selected)
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao alterar status')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="rounded-2xl w-full max-w-sm overflow-hidden" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
        <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-bold text-white">Alterar Status</p>
              <p className="text-xs text-zinc-500 mt-0.5">{projectName}</p>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 transition-colors text-zinc-400"><X size={16} /></button>
          </div>
        </div>
        <div className="px-6 py-4 space-y-2">
          {PROJECT_STATUSES.map(s => (
            <button key={s.value} type="button"
              onClick={() => setSelected(s.value)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left"
              style={{
                background: selected === s.value ? `${s.color}12` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${selected === s.value ? s.color : 'var(--brand-border)'}`,
                color: selected === s.value ? s.color : 'var(--brand-text)',
              }}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--brand-border)' }}>
          <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors">
            Cancelar
          </button>
          <button onClick={save} disabled={saving || !selected}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ background: 'rgba(0,245,255,0.12)', border: '1px solid rgba(0,245,255,0.3)', color: '#00F5FF' }}>
            {saving ? 'Salvando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
