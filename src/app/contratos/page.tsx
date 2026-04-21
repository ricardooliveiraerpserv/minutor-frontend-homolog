'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Rocket, Eye, Pencil, CheckCircle, ChevronLeft, ChevronRight, LayoutGrid, Download, FileText, X } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
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
  project?: { id: number; code: string; name: string }
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
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCustomer, setFilterCustomer] = useState('')
  const [search, setSearch]       = useState('')

  // Master data (apenas customers para filtro)
  const [customers, setCustomers] = useState<SelectOption[]>([])

  const isSustAdmin = user?.type === 'admin' || (user?.type === 'coordenador' && (user as any).coordinator_type === 'sustentacao')

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [viewContract, setViewContract] = useState<Contract | null>(null)
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
      const qp = new URLSearchParams({ page: String(page), per_page: '20' })
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

  // ─── Render ───────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / 20)

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

      {/* ── Table ── */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--brand-border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--brand-surface)', borderBottom: '1px solid var(--brand-border)' }}>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Cliente</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Categoria</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Tipo de Contrato</th>
              <th className="text-center px-4 py-3 text-zinc-400 font-medium">Horas</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Expectativa</th>
              <th className="text-center px-4 py-3 text-zinc-400 font-medium">Status</th>
              <th className="text-center px-4 py-3 text-zinc-400 font-medium">Projeto</th>
              <th className="text-center px-4 py-3 text-zinc-400 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-500 text-xs">Carregando...</td></tr>
            )}
            {!loading && contracts.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-600 text-xs">Nenhum contrato encontrado.</td></tr>
            )}
            {!loading && contracts.map((c, i) => (
              <tr key={c.id} style={{ borderTop: i > 0 ? '1px solid var(--brand-border)' : undefined, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <td className="px-4 py-3 text-white font-medium">{c.customer?.name ?? '—'}</td>
                <td className="px-4 py-3 text-zinc-300">{CATEGORIA_LABEL[c.categoria]}</td>
                <td className="px-4 py-3 text-zinc-400 text-xs">{c.contract_type?.name ?? '—'}</td>
                <td className="px-4 py-3 text-center text-zinc-300">{c.horas_contratadas}h</td>
                <td className="px-4 py-3 text-zinc-400 text-xs">{fmtDate(c.expectativa_inicio)}</td>
                <td className="px-4 py-3 text-center">
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ background: `${STATUS_COLOR[c.status]}18`, color: STATUS_COLOR[c.status] }}>
                    {STATUS_LABEL[c.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-xs">
                  {c.project
                    ? <span className="text-cyan-400 font-mono">{c.project.code}</span>
                    : <span className="text-zinc-600">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1.5">
                    <button onClick={() => openView(c)} title="Visualizar"
                      className="p-1.5 rounded-md transition-colors hover:bg-zinc-700/60 text-zinc-400 hover:text-white">
                      <Eye size={14} />
                    </button>
                    {!c.project_id && (
                      <button onClick={() => openEdit(c)} title="Editar"
                        className="p-1.5 rounded-md transition-colors hover:bg-zinc-700/60 text-zinc-400 hover:text-white">
                        <Pencil size={14} />
                      </button>
                    )}
                    {c.status === 'rascunho' && (
                      <button onClick={() => updateStatus(c, 'aprovado')} title="Aprovar"
                        className="p-1.5 rounded-md transition-colors hover:bg-blue-900/40 text-zinc-400 hover:text-blue-400">
                        <CheckCircle size={14} />
                      </button>
                    )}
                    {(c.status === 'aprovado' || c.status === 'rascunho') && !c.project_id && (
                      <button onClick={() => openGenModal(c)} title="Gerar Projeto"
                        className="p-1.5 rounded-md transition-colors hover:bg-yellow-900/40 text-zinc-400 hover:text-yellow-400">
                        <Rocket size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-zinc-500">
          <span>{total} contratos</span>
          <div className="flex items-center gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="p-1 rounded disabled:opacity-30"><ChevronLeft size={14} /></button>
            <span>{page} / {totalPages}</span>
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
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
      {viewContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border overflow-hidden" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-border)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
              <div>
                <h2 className="text-base font-semibold text-white">{viewContract.customer?.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ background: `${STATUS_COLOR[viewContract.status]}18`, color: STATUS_COLOR[viewContract.status] }}>
                    {STATUS_LABEL[viewContract.status]}
                  </span>
                  <span className="text-[10px] text-zinc-500">Criado em {fmtDate(viewContract.created_at)}</span>
                </div>
              </div>
              <button onClick={() => setViewContract(null)} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X size={18} /></button>
            </div>

            {isSustAdmin && (
              <div className="px-6 py-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--brand-border)', background: 'rgba(251,146,60,0.05)' }}>
                <span className="text-xs font-semibold shrink-0" style={{ color: '#f59e0b' }}>Fila de Sustentação</span>
                <select value={sustQueue} onChange={e => setSustQueue(e.target.value)}
                  className="flex-1 text-xs rounded-lg px-2 py-1.5 outline-none bg-zinc-800 border border-zinc-700 text-zinc-200">
                  <option value="">— Selecionar fila —</option>
                  <option value="sust_bh_fixo">BH Fixo</option>
                  <option value="sust_bh_mensal">BH Mensal</option>
                  <option value="sust_on_demand">On Demand</option>
                  <option value="sust_cloud">Cloud</option>
                  <option value="sust_bizify">Bizify</option>
                </select>
                <button onClick={handleSustMove} disabled={!sustQueue || sustMoving}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
                  style={{ background: '#f59e0b', color: '#000' }}>
                  {sustMoving ? '...' : 'Mover'}
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-[10px] text-zinc-500 mb-0.5">Categoria</p><p className="text-zinc-300">{CATEGORIA_LABEL[viewContract.categoria]}</p></div>
                <div><p className="text-[10px] text-zinc-500 mb-0.5">Tipo de Serviço</p><p className="text-zinc-300">{viewContract.service_type?.name ?? '—'}</p></div>
                <div><p className="text-[10px] text-zinc-500 mb-0.5">Tipo de Contrato</p><p className="text-zinc-300">{viewContract.contract_type?.name ?? '—'}</p></div>
                <div><p className="text-[10px] text-zinc-500 mb-0.5">Horas Contratadas</p><p className="text-zinc-300 font-semibold">{viewContract.horas_contratadas}h</p></div>
                <div><p className="text-[10px] text-zinc-500 mb-0.5">Alocação</p><p className="text-zinc-300 capitalize">{viewContract.tipo_alocacao ?? '—'}</p></div>
                <div><p className="text-[10px] text-zinc-500 mb-0.5">Expectativa de Início</p><p className="text-zinc-300">{fmtDate(viewContract.expectativa_inicio)}</p></div>
                {viewContract.architect && <div><p className="text-[10px] text-zinc-500 mb-0.5">Arquiteto</p><p className="text-zinc-300">{viewContract.architect.name}</p></div>}
                {viewContract.executivo_conta && <div><p className="text-[10px] text-zinc-500 mb-0.5">Executivo</p><p className="text-zinc-300">{viewContract.executivo_conta.name}</p></div>}
                {viewContract.cobra_despesa_cliente && viewContract.limite_despesa != null && (
                  <div><p className="text-[10px] text-zinc-500 mb-0.5">Limite de Despesas</p><p className="text-zinc-300">R$ {Number(viewContract.limite_despesa).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
                )}
              </div>

              {viewContract.condicao_pagamento && (
                <div><p className="text-[10px] text-zinc-500 mb-1">Condição de Pagamento</p><p className="text-zinc-300 text-xs">{viewContract.condicao_pagamento}</p></div>
              )}

              {viewContract.observacoes && (
                <div>
                  <p className="text-[10px] text-zinc-500 mb-1">Observações</p>
                  <div className="rounded-lg p-3 text-xs text-zinc-300 whitespace-pre-wrap" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--brand-border)' }}>
                    {viewContract.observacoes}
                  </div>
                </div>
              )}

              {viewContract.contacts.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-500 mb-2">Contatos ({viewContract.contacts.length})</p>
                  <div className="space-y-2">
                    {viewContract.contacts.map((ct, i) => (
                      <div key={i} className="flex items-start gap-3 text-xs">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold" style={{ background: 'rgba(0,245,255,0.15)', color: '#00F5FF' }}>{ct.name[0]}</div>
                        <div>
                          <p className="text-zinc-200 font-medium">{ct.name} {ct.cargo && <span className="text-zinc-500">· {ct.cargo}</span>}</p>
                          <p className="text-zinc-500">{ct.email}{ct.email && ct.phone ? ' · ' : ''}{ct.phone}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {viewContract.attachments.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-500 mb-2">Anexos ({viewContract.attachments.length})</p>
                  <div className="space-y-2">
                    {viewContract.attachments.map(att => (
                      <div key={att.id} className="flex items-center justify-between px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--brand-border)' }}>
                        <div className="flex items-center gap-2">
                          <FileText size={13} className="text-zinc-400" />
                          <div>
                            <p className="text-xs text-zinc-300">{att.original_name}</p>
                            <p className="text-[10px] text-zinc-600">{ATTACHMENT_TYPE_LABEL[att.type]} · {fmt(att.size)}</p>
                          </div>
                        </div>
                        <button onClick={() => downloadAttachment(viewContract.id, att)} className="p-1 text-zinc-400 hover:text-cyan-400 transition-colors"><Download size={13} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {viewContract.project && (
                <div className="rounded-lg p-3" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <p className="text-[10px] text-green-500 mb-1">Projeto gerado</p>
                  <p className="text-sm text-green-400 font-semibold font-mono">{viewContract.project.code}</p>
                  <p className="text-xs text-zinc-400">{viewContract.project.name}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
              <div className="flex items-center gap-2">
                {viewContract.status === 'rascunho' && (
                  <button onClick={() => { updateStatus(viewContract, 'aprovado'); setViewContract(null) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6' }}>
                    <CheckCircle size={13} /> Aprovar
                  </button>
                )}
                {!viewContract.project_id && (viewContract.status === 'aprovado' || viewContract.status === 'rascunho') && (
                  <button onClick={() => { openGenModal(viewContract); setViewContract(null) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)', color: '#eab308' }}>
                    <Rocket size={13} /> Gerar Projeto
                  </button>
                )}
              </div>
              <button onClick={() => setViewContract(null)}
                className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
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
    </AppLayout>
  )
}
