'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useCallback, useEffect } from 'react'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight, Search, Handshake } from 'lucide-react'
import { ConfirmDeleteModal } from '@/components/ui/confirm-delete-modal'
import { RowMenu } from '@/components/ui/row-menu'

interface PartnerItem {
  id: number
  name: string
  document?: string
  email?: string
  phone?: string
  active: boolean
  pricing_type: 'fixed' | 'variable'
  hourly_rate?: string | null
  contract_type?: 'cooperado' | 'clt' | 'pj' | null
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-md shadow-xl">
        <button onClick={onClose} className="absolute top-3 right-3 text-[var(--text-light)] hover:text-[var(--text)]">
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  )
}

function TableSkeleton() {
  return (
    <>
      {[...Array(6)].map((_, i) => (
        <tr key={i} className="border-b border-[var(--border)]">
          {[...Array(7)].map((_, j) => (
            <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>
          ))}
        </tr>
      ))}
    </>
  )
}

const EMPTY_FORM = { name: '', document: '', email: '', phone: '', active: true, pricing_type: 'fixed' as 'fixed' | 'variable', hourly_rate: '', contract_type: '' as '' | 'cooperado' | 'clt' | 'pj' }

export default function PartnersPage() {
  const { user } = useAuth()
  const [items, setItems]   = useState<PartnerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hasNext, setHasNext] = useState(false)

  const { filters: flt, set: setFilter } = usePersistedFilters(
    'partners',
    user?.id,
    { search: '', filterActive: '', page: 1 },
  )
  const { search, filterActive, page } = flt
  const setSearch       = (v: string) => setFilter('search', v)
  const setFilterActive = (v: string) => setFilter('filterActive', v)
  const setPage         = (v: number) => setFilter('page', v)
  const [modal, setModal]     = useState<{ open: boolean; item?: PartnerItem }>({ open: false })
  const [form, setForm]       = useState({ ...EMPTY_FORM })
  const [saving, setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id?: number }>({ open: false })
  // Vigência do novo valor-hora: quando o hourly_rate muda, perguntamos a partir de qual mês passa a valer.
  const [rateModalOpen, setRateModalOpen] = useState(false)
  const [rateEffectiveMonth, setRateEffectiveMonth] = useState<string>(() => new Date().toISOString().slice(0, 7))
  // Histórico de valores-hora (somente leitura) — GET /partners/{id}/hourly-rate-history
  const [rateHistoryOpen, setRateHistoryOpen] = useState(false)
  const [rateHistory, setRateHistory] = useState<any[]>([])
  const [rateHistoryLoading, setRateHistoryLoading] = useState(false)
  const openRateHistory = async () => {
    if (!modal.item) return
    setRateHistoryOpen(true)
    setRateHistoryLoading(true)
    try {
      const res = await api.get<{ hasNext: boolean; items: any[] }>(`/partners/${modal.item.id}/hourly-rate-history?pageSize=100`)
      setRateHistory(Array.isArray(res?.items) ? res.items : [])
    } catch {
      setRateHistory([])
      toast.error('Erro ao carregar histórico de valores')
    } finally {
      setRateHistoryLoading(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: '15' })
      if (search)       p.set('search', search)
      if (filterActive) p.set('active', filterActive)
      const r = await api.get<{ items: PartnerItem[]; hasNext: boolean }>(`/partners?${p}`)
      setItems(Array.isArray(r?.items) ? r.items : [])
      setHasNext(!!r?.hasNext)
    } catch {
      toast.error('Erro ao carregar parceiros')
    } finally {
      setLoading(false)
    }
  }, [page, search, filterActive])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setForm({ ...EMPTY_FORM })
    setModal({ open: true })
  }

  const openEdit = (item: PartnerItem) => {
    setForm({
      name: item.name,
      document: item.document ?? '',
      email: item.email ?? '',
      phone: item.phone ?? '',
      active: item.active,
      pricing_type: item.pricing_type ?? 'fixed',
      hourly_rate: item.hourly_rate ?? '',
      contract_type: item.contract_type ?? '',
    })
    setModal({ open: true, item })
  }

  const save = async (hourlyRateEffectiveFrom?: string) => {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name:         form.name,
        document:     form.document || null,
        email:        form.email || null,
        phone:        form.phone || null,
        active:        form.active,
        pricing_type:  form.pricing_type,
        hourly_rate:   form.pricing_type === 'fixed' ? (form.hourly_rate || null) : null,
        contract_type: form.contract_type || null,
      }
      if (modal.item) {
        // Mudou o valor-hora? Abre o modal de vigência antes de enviar (fechamentos passados não mudam).
        const rateChanged = form.pricing_type === 'fixed'
          && form.hourly_rate !== ''
          && Number(form.hourly_rate) !== Number(modal.item.hourly_rate ?? 0)
        if (rateChanged && !hourlyRateEffectiveFrom) { setSaving(false); setRateModalOpen(true); return }
        if (rateChanged && hourlyRateEffectiveFrom) { payload.hourly_rate_effective_from = hourlyRateEffectiveFrom }
        await api.put(`/partners/${modal.item.id}`, payload)
      } else {
        await api.post('/partners', payload)
      }
      toast.success(modal.item ? 'Parceiro atualizado' : 'Parceiro criado')
      setModal({ open: false })
      load()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const remove = (id: number) => setDeleteConfirm({ open: true, id })

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return
    setDeleting(deleteConfirm.id)
    setDeleteConfirm({ open: false })
    try {
      await api.delete(`/partners/${deleteConfirm.id}`)
      toast.success('Parceiro excluído')
      load()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao excluir')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <AppLayout title="Parceiros">
      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-light)]" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar por nome..."
            className="pl-8 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-8 text-xs"
          />
        </div>
        <select
          value={filterActive}
          onChange={e => { setFilterActive(e.target.value); setPage(1) }}
          className="bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] text-xs rounded-md h-8 px-2"
        >
          <option value="">Todos</option>
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
        </select>
        <Button onClick={openCreate} className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-fg)] h-8 text-xs gap-1.5">
          <Plus size={13} /> Novo
        </Button>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border border-[var(--border)] overflow-clip">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--surface)]">
            <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
              <th className="px-3 py-2.5 w-10"></th>
              <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium">Nome</th>
              <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden md:table-cell">Documento</th>
              <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden md:table-cell">E-mail</th>
              <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden sm:table-cell">Telefone</th>
              <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium hidden lg:table-cell">Precificação</th>
              <th className="text-left px-3 py-2.5 text-[var(--text-light)] font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton />
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-[var(--text-light)]">
                  <div className="flex flex-col items-center gap-2">
                    <Handshake size={24} className="text-[var(--text-muted)]" />
                    <span>Nenhum parceiro encontrado</span>
                  </div>
                </td>
              </tr>
            ) : items.map(item => (
              <tr key={item.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors">
                <td className="px-2 py-2.5 w-10">
                  <RowMenu items={[
                    { label: 'Editar', icon: <Pencil size={12} />, onClick: () => openEdit(item) },
                    { label: 'Excluir', icon: <Trash2 size={12} />, onClick: () => remove(item.id), danger: true, disabled: deleting === item.id },
                  ]} />
                </td>
                <td className="px-3 py-2.5 text-[var(--text)] font-medium">{item.name}</td>
                <td className="px-3 py-2.5 text-[var(--text-muted)] hidden md:table-cell">{item.document ?? '—'}</td>
                <td className="px-3 py-2.5 text-[var(--text-muted)] hidden md:table-cell">{item.email ?? '—'}</td>
                <td className="px-3 py-2.5 text-[var(--text-muted)] hidden sm:table-cell">{item.phone ?? '—'}</td>
                <td className="px-3 py-2.5 hidden lg:table-cell">
                  {item.pricing_type === 'fixed' ? (
                    <span className="text-[var(--text)] text-[10px]">
                      Único {item.hourly_rate ? <span className="text-[var(--text-muted)]">R$ {Number(item.hourly_rate).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/h</span> : ''}
                    </span>
                  ) : (
                    <span className="text-[10px] text-[var(--brand-purple)]">Por consultor</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant="outline" className={`text-[10px] border ${item.active
                    ? 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]'
                    : 'bg-[var(--surface-hover)] text-[var(--text-muted)] border-[var(--border)]'}`}>
                    {item.active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {(page > 1 || hasNext) && (
        <div className="flex items-center justify-end gap-2 mt-3">
          <button onClick={() => setPage(page - 1)} disabled={page === 1}
            className="p-1 text-[var(--text-light)] hover:text-[var(--text)] disabled:opacity-30">
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs text-[var(--text-light)]">Página {page}</span>
          <button onClick={() => setPage(page + 1)} disabled={!hasNext}
            className="p-1 text-[var(--text-light)] hover:text-[var(--text)] disabled:opacity-30">
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Modal criar/editar */}
      {modal.open && (
        <ModalOverlay onClose={() => setModal({ open: false })}>
          <div className="p-5 max-h-[85vh] overflow-y-auto">
            <h3 className="text-sm font-semibold text-[var(--text)] mb-4">
              {modal.item ? 'Editar Parceiro' : 'Novo Parceiro'}
            </h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-[var(--text-muted)]">Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-[var(--text-muted)]">CNPJ / CPF</Label>
                <Input value={form.document} onChange={e => setForm(f => ({ ...f, document: e.target.value }))}
                  placeholder="00.000.000/0000-00"
                  className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-[var(--text-muted)]">E-mail</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-[var(--text-muted)]">Telefone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="(00) 00000-0000"
                  className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-[var(--text-muted)] mb-1.5 block">Contrato</Label>
                <div className="flex gap-2">
                  {([['cooperado', 'Cooperado'], ['clt', 'CLT'], ['pj', 'PJ']] as const).map(([ct, label]) => (
                    <button
                      key={ct}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, contract_type: f.contract_type === ct ? '' : ct }))}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-all ${
                        form.contract_type === ct
                          ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                          : 'border-[var(--border)] bg-[var(--surface-hover)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--text-light)] mt-1">Aplica a todos os consultores do parceiro.</p>
              </div>
              <div>
                <Label className="text-xs text-[var(--text-muted)] mb-1.5 block">Tipo de precificação *</Label>
                <div className="flex gap-2">
                  {(['fixed', 'variable'] as const).map(pt => (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, pricing_type: pt, hourly_rate: pt === 'variable' ? '' : f.hourly_rate }))}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-all ${
                        form.pricing_type === pt
                          ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                          : 'border-[var(--border)] bg-[var(--surface-hover)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      {pt === 'fixed' ? 'Valor único' : 'Valores por consultor'}
                    </button>
                  ))}
                </div>
              </div>
              {form.pricing_type === 'fixed' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs text-[var(--text-muted)]">Valor hora do parceiro (R$) *</Label>
                    {modal.item && (
                      <button type="button" onClick={openRateHistory}
                        className="text-[10px] font-medium text-[var(--primary)] hover:underline">
                        Histórico de valores
                      </button>
                    )}
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.hourly_rate}
                    onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))}
                    placeholder="0,00"
                    className="mt-1 bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs"
                  />
                </div>
              )}
              {form.pricing_type === 'variable' && (
                <p className="text-[10px] text-[var(--text-light)] bg-[var(--surface-hover)] rounded-md px-3 py-2 border border-[var(--border)]">
                  Cada consultor deste parceiro terá seu próprio valor hora definido no cadastro de usuário.
                </p>
              )}
              <div className="flex items-center gap-2">
                <button onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                  className={`w-8 h-4 rounded-full transition-colors relative ${form.active ? 'bg-[var(--primary)]' : 'bg-[var(--surface-hover)]'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-[var(--surface)] transition-all ${form.active ? 'left-4' : 'left-0.5'}`} />
                </button>
                <Label className="text-xs text-[var(--text-muted)]">Ativo</Label>
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <Button variant="outline" onClick={() => setModal({ open: false })}
                className="h-8 text-xs border-[var(--border)] text-[var(--text)]">Cancelar</Button>
              <Button onClick={() => save()} disabled={saving || !form.name || (form.pricing_type === 'fixed' && !form.hourly_rate)}
                className="h-8 text-xs bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-fg)]">
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>

          {/* Vigência do novo valor-hora */}
          {rateModalOpen && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
                <p className="text-sm font-semibold text-[var(--text)] mb-3">Vigência do valor hora</p>
                <p className="text-[13px] leading-relaxed text-[var(--text-muted)] mb-4">
                  A partir de qual mês esse novo valor hora passa a valer? Meses anteriores (fechamentos já feitos) não mudam.
                </p>
                <div className="mb-5">
                  <Label className="text-xs text-[var(--text-muted)] mb-1 block">Mês de vigência</Label>
                  <Input
                    type="month"
                    value={rateEffectiveMonth}
                    min={new Date().toISOString().slice(0, 7)}
                    onChange={e => setRateEffectiveMonth(e.target.value)}
                    className="bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] h-9 text-xs"
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" onClick={() => setRateModalOpen(false)}
                    className="h-8 text-xs border-[var(--border)] text-[var(--text)]">Cancelar</Button>
                  <Button
                    onClick={() => { setRateModalOpen(false); save(`${rateEffectiveMonth}-01`) }}
                    disabled={!rateEffectiveMonth}
                    className="h-8 text-xs bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-fg)]">
                    Confirmar
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Histórico de valores-hora (somente leitura) */}
          {rateHistoryOpen && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-[var(--text)]">Histórico de valores</p>
                  <button onClick={() => setRateHistoryOpen(false)} className="text-[var(--text-light)] hover:text-[var(--text)]">
                    <X size={16} />
                  </button>
                </div>
                {rateHistoryLoading ? (
                  <p className="text-xs text-[var(--text-light)] py-6 text-center">Carregando…</p>
                ) : rateHistory.length === 0 ? (
                  <p className="text-xs text-[var(--text-light)] py-6 text-center">Nenhuma alteração registrada.</p>
                ) : (
                  <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-[var(--border)]">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[var(--surface-hover)] text-[var(--text-muted)]">
                          <th className="text-left font-semibold px-3 py-2">Vigência</th>
                          <th className="text-left font-semibold px-3 py-2">Valor</th>
                          <th className="text-left font-semibold px-3 py-2">Alterado por</th>
                          <th className="text-left font-semibold px-3 py-2">Em</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rateHistory.filter((h: any, i: number, a: any[]) => a.findIndex((x: any) => String(x.created_at ?? '').slice(0, 10) === String(h.created_at ?? '').slice(0, 10)) === i).map((h, i) => (
                          <tr key={h.id ?? i} className="border-t border-[var(--border)] text-[var(--text)]">
                            <td className="px-3 py-2 whitespace-nowrap">
                              {h.effective_from
                                ? (() => { const [y, m] = String(h.effective_from).slice(0, 7).split('-'); return `${m}/${y}` })()
                                : <span title="vigência não informada (legado)" className="text-[var(--text-light)]">—</span>}
                            </td>
                            <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                              {h.old_hourly_rate != null ? Number(h.old_hourly_rate).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                              <span className="text-[var(--text-light)]"> → </span>
                              {h.new_hourly_rate != null ? Number(h.new_hourly_rate).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                            </td>
                            <td className="px-3 py-2">{h.changed_by_user?.name ?? '—'}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-[var(--text-muted)]">
                              {h.created_at ? new Date(h.created_at).toLocaleDateString('pt-BR') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex items-center justify-end mt-5">
                  <Button variant="outline" onClick={() => setRateHistoryOpen(false)}
                    className="h-8 text-xs border-[var(--border)] text-[var(--text)]">Fechar</Button>
                </div>
              </div>
            </div>
          )}
        </ModalOverlay>
      )}

      <ConfirmDeleteModal
        open={deleteConfirm.open}
        message="Deseja excluir este parceiro? Esta ação não pode ser desfeita."
        onClose={() => setDeleteConfirm({ open: false })}
        onConfirm={confirmDelete}
      />
    </AppLayout>
  )
}
