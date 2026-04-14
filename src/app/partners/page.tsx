'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useCallback, useEffect } from 'react'
import { api, ApiError } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight, Search, Handshake } from 'lucide-react'
import { ConfirmDeleteModal } from '@/components/ui/confirm-delete-modal'

interface PartnerItem {
  id: number
  name: string
  document?: string
  email?: string
  phone?: string
  active: boolean
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md shadow-xl">
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300">
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
        <tr key={i} className="border-b border-zinc-800">
          {[...Array(5)].map((_, j) => (
            <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>
          ))}
        </tr>
      ))}
    </>
  )
}

const EMPTY_FORM = { name: '', document: '', email: '', phone: '', active: true }

export default function PartnersPage() {
  const [items, setItems]   = useState<PartnerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filterActive, setFilterActive] = useState('')
  const [page, setPage]       = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [modal, setModal]     = useState<{ open: boolean; item?: PartnerItem }>({ open: false })
  const [form, setForm]       = useState({ ...EMPTY_FORM })
  const [saving, setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id?: number }>({ open: false })

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
    })
    setModal({ open: true, item })
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        name:     form.name,
        document: form.document || null,
        email:    form.email || null,
        phone:    form.phone || null,
        active:   form.active,
      }
      if (modal.item) await api.put(`/partners/${modal.item.id}`, payload)
      else            await api.post('/partners', payload)
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
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar por nome..."
            className="pl-8 bg-zinc-800 border-zinc-700 text-white h-8 text-xs"
          />
        </div>
        <select
          value={filterActive}
          onChange={e => { setFilterActive(e.target.value); setPage(1) }}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-md h-8 px-2"
        >
          <option value="">Todos</option>
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
        </select>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs gap-1.5">
          <Plus size={13} /> Novo
        </Button>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900">
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Nome</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden md:table-cell">Documento</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden md:table-cell">E-mail</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium hidden sm:table-cell">Telefone</th>
              <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Status</th>
              <th className="px-3 py-2.5 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton />
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center text-zinc-500">
                  <div className="flex flex-col items-center gap-2">
                    <Handshake size={24} className="text-zinc-700" />
                    <span>Nenhum parceiro encontrado</span>
                  </div>
                </td>
              </tr>
            ) : items.map(item => (
              <tr key={item.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                <td className="px-3 py-2.5 text-zinc-200 font-medium">{item.name}</td>
                <td className="px-3 py-2.5 text-zinc-400 hidden md:table-cell">{item.document ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-400 hidden md:table-cell">{item.email ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-400 hidden sm:table-cell">{item.phone ?? '—'}</td>
                <td className="px-3 py-2.5">
                  <Badge variant="outline" className={`text-[10px] border ${item.active
                    ? 'bg-green-500/20 text-green-400 border-green-500/30'
                    : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'}`}>
                    {item.active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => openEdit(item)} className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => remove(item.id)} disabled={deleting === item.id}
                      className="p-1 text-zinc-500 hover:text-red-400 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {(page > 1 || hasNext) && (
        <div className="flex items-center justify-end gap-2 mt-3">
          <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
            className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30">
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs text-zinc-500">Página {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={!hasNext}
            className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30">
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Modal criar/editar */}
      {modal.open && (
        <ModalOverlay onClose={() => setModal({ open: false })}>
          <div className="p-5 max-h-[85vh] overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-4">
              {modal.item ? 'Editar Parceiro' : 'Novo Parceiro'}
            </h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-zinc-400">Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">CNPJ / CPF</Label>
                <Input value={form.document} onChange={e => setForm(f => ({ ...f, document: e.target.value }))}
                  placeholder="00.000.000/0000-00"
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">E-mail</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Telefone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="(00) 00000-0000"
                  className="mt-1 bg-zinc-800 border-zinc-700 text-white h-9 text-xs" />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                  className={`w-8 h-4 rounded-full transition-colors relative ${form.active ? 'bg-blue-600' : 'bg-zinc-700'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${form.active ? 'left-4' : 'left-0.5'}`} />
                </button>
                <Label className="text-xs text-zinc-400">Ativo</Label>
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <Button variant="outline" onClick={() => setModal({ open: false })}
                className="h-8 text-xs border-zinc-700 text-zinc-300">Cancelar</Button>
              <Button onClick={save} disabled={saving || !form.name}
                className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white">
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
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
