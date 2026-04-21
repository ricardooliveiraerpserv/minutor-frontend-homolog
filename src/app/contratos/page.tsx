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
                  <span className="text-xs font-semibold px-2 py-1 rounded-full shrink-0"
                    style={{ background: `${STATUS_COLOR[vc.status]}22`, color: STATUS_COLOR[vc.status] }}>
                    {STATUS_LABEL[vc.status]}
                  </span>
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
    </AppLayout>
  )
}
