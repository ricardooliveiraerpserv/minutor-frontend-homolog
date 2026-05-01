'use client'

import { useEffect, useState, useMemo } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from 'next/navigation'
import { Search, Users, X, Check, TrendingUp } from 'lucide-react'
import { PageHeader, Table, Thead, Th, Tbody, Tr, Td, Button, SkeletonTable, EmptyState } from '@/components/ds'
import { toast } from 'sonner'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Consultant {
  id: number
  name: string
  email: string
}

interface ICProject {
  id: number
  code: string
  status: string
  customer: { id: number; name: string } | null
  consultants: Consultant[]
  total_logged_hours?: number
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const inputStyle = {
  background: 'var(--brand-bg)',
  border: '1px solid var(--brand-border)',
  color: 'var(--brand-text)',
}

const surfaceStyle = {
  background: 'var(--brand-surface)',
  border: '1px solid var(--brand-border)',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvestimentoComercialPage() {
  const { user } = useAuth()
  const router   = useRouter()

  const [projects,   setProjects]   = useState<ICProject[]>([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [allUsers,   setAllUsers]   = useState<Consultant[]>([])
  const [modal,      setModal]      = useState<{ open: boolean; project: ICProject | null }>({ open: false, project: null })
  const [selected,   setSelected]   = useState<number[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [saving,     setSaving]     = useState(false)

  // ── Redirecionar se não for admin ────────────────────────────────────────
  useEffect(() => {
    if (user && user.type !== 'admin') router.replace('/dashboard')
  }, [user, router])

  // ── Carregar dados ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    Promise.all([
      api.get<{ items: any[]; data: any[] }>('/projects?only_investimento_comercial=true&pageSize=500&gestao=true&with_team=true'),
      api.get<{ data: any[] }>('/users?exclude_type=cliente&pageSize=500'),
    ])
      .then(([projRes, usersRes]) => {
        if (cancelled) return

        const rawProjects: any[] = projRes?.items ?? projRes?.data ?? []
        setProjects(rawProjects.map(p => ({
          id:         p.id,
          code:       p.code,
          status:     p.status,
          customer:   p.customer ?? null,
          consultants: p.consultants ?? [],
        })))

        const rawUsers: any[] = usersRes?.data ?? []
        setAllUsers(rawUsers.map(u => ({ id: u.id, name: u.name, email: u.email })))
      })
      .catch(() => toast.error('Erro ao carregar dados'))
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [])

  // ── Filtro de busca ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return projects
    const q = search.toLowerCase()
    return projects.filter(p =>
      p.customer?.name.toLowerCase().includes(q) ||
      p.consultants.some(c => c.name.toLowerCase().includes(q))
    )
  }, [projects, search])

  // ── Usuários filtrados no modal ──────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase()
    return allUsers.filter(u =>
      !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    )
  }, [allUsers, userSearch])

  // ── Abrir modal ──────────────────────────────────────────────────────────
  function openModal(project: ICProject) {
    setModal({ open: true, project })
    setSelected(project.consultants.map(c => c.id))
    setUserSearch('')
  }

  function closeModal() {
    setModal({ open: false, project: null })
    setSelected([])
    setUserSearch('')
  }

  function toggleUser(id: number) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  // ── Salvar equipe ────────────────────────────────────────────────────────
  async function saveTeam() {
    if (!modal.project) return
    setSaving(true)
    try {
      await api.patch(`/projects/${modal.project.id}`, { consultant_ids: selected })
      const updatedConsultants = allUsers.filter(u => selected.includes(u.id))
      setProjects(prev => prev.map(p =>
        p.id === modal.project!.id ? { ...p, consultants: updatedConsultants } : p
      ))
      toast.success('Equipe atualizada')
      closeModal()
    } catch {
      toast.error('Erro ao salvar equipe')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <PageHeader
        icon={<TrendingUp size={20} />}
        title="Investimento Comercial"
        subtitle="Projetos internos de investimento por cliente — não cobrados, refletidos no fechamento dos consultores"
      />

      {/* Busca */}
      <div className="mb-5 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--brand-subtle)' }} />
          <input
            type="text"
            placeholder="Buscar por cliente ou consultor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 h-9 rounded-xl text-xs outline-none"
            style={inputStyle}
          />
        </div>
        <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
          {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tabela */}
      {loading ? (
        <SkeletonTable rows={8} cols={3} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<TrendingUp size={32} />} title="Nenhum projeto encontrado" description="Ajuste a busca ou cadastre novos clientes." />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Cliente</Th>
              <Th>Código</Th>
              <Th>Consultores Alocados</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {filtered.map(project => (
              <Tr key={project.id}>
                <Td>
                  <span className="font-medium text-sm" style={{ color: 'var(--brand-text)' }}>
                    {project.customer?.name ?? '—'}
                  </span>
                </Td>
                <Td>
                  <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: 'rgba(0,245,255,0.08)', color: '#00F5FF' }}>
                    {project.code}
                  </span>
                </Td>
                <Td>
                  {project.consultants.length === 0 ? (
                    <span className="text-xs" style={{ color: 'var(--brand-subtle)' }}>Nenhum alocado</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {project.consultants.slice(0, 4).map(c => (
                        <span
                          key={c.id}
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-muted)' }}
                        >
                          {c.name.split(' ')[0]}
                        </span>
                      ))}
                      {project.consultants.length > 4 && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--brand-subtle)' }}>
                          +{project.consultants.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </Td>
                <Td>
                  <Button size="sm" variant="ghost" onClick={() => openModal(project)}>
                    <Users size={13} className="mr-1" /> Gerenciar
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {/* Modal de gerenciar equipe */}
      {modal.open && modal.project && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-4" style={surfaceStyle}>

            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold" style={{ color: '#00F5FF' }}>Investimento Comercial</p>
                <h2 className="text-base font-bold mt-0.5" style={{ color: 'var(--brand-text)' }}>
                  {modal.project.customer?.name ?? '—'}
                </h2>
              </div>
              <button onClick={closeModal} className="p-1 rounded-lg hover:bg-white/5 transition-colors" style={{ color: 'var(--brand-subtle)' }}>
                <X size={16} />
              </button>
            </div>

            {/* Busca de consultores */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--brand-subtle)' }} />
              <input
                type="text"
                placeholder="Buscar consultor..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="w-full pl-9 pr-3 h-9 rounded-xl text-xs outline-none"
                style={inputStyle}
              />
            </div>

            {/* Lista de consultores */}
            <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <p className="text-xs text-center py-4" style={{ color: 'var(--brand-subtle)' }}>Nenhum consultor encontrado</p>
              ) : filteredUsers.map(u => {
                const checked = selected.includes(u.id)
                return (
                  <button
                    key={u.id}
                    onClick={() => toggleUser(u.id)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/5"
                  >
                    <div
                      className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors"
                      style={{
                        background: checked ? '#00F5FF' : 'transparent',
                        border: checked ? 'none' : '1px solid var(--brand-border)',
                      }}
                    >
                      {checked && <Check size={12} style={{ color: '#0a0a0a' }} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight truncate" style={{ color: 'var(--brand-text)' }}>{u.name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--brand-subtle)' }}>{u.email}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Selecionados */}
            <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
              {selected.length} consultor{selected.length !== 1 ? 'es' : ''} selecionado{selected.length !== 1 ? 's' : ''}
            </p>

            {/* Ações */}
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={closeModal}>Cancelar</Button>
              <Button variant="primary" className="flex-1" onClick={saveTeam} disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar Equipe'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
