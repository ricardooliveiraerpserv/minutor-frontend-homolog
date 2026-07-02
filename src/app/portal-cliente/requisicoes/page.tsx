'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { Plus, Search, X, ChevronRight, Clock, AlertTriangle, CheckCircle, XCircle, Inbox } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Req {
  id: number
  area_requisitante: string
  product_owner?: string
  modulo_tecnologia?: string
  tipo_necessidade: string
  nivel_urgencia: string
  descricao?: string
  cenario_atual?: string
  cenario_desejado?: string
  status: string
  notas_revisao?: string
  created_at: string
  customer: { id: number; name: string }
  created_by: { id: number; name: string }
  reviewed_by?: { id: number; name: string }
  contract?: { id: number; project_name?: string }
}

interface Pagination {
  data: Req[]
  current_page: number
  last_page: number
  total: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
  implantacao_modulo:        'Implantação de Módulo',
  treinamento_erp:           'Treinamento ERP',
  atualizacao_versao_erp:    'Atualização de Versão do ERP',
  entrega_obrigacao:         'Entrega de Obrigação',
  fluig:                     'Fluig',
  desenvolvimento_web_app:   'Desenvolvimento Web/App',
  customizacao_erp_protheus: 'Customização ERP Protheus',
  integracao_erp_protheus:   'Integração com ERP Protheus',
}

const URGENCIA_CONFIG: Record<string, { label: string; color: string }> = {
  quando_possivel: { label: 'Quando possível', color: '#64748b' },
  baixo:           { label: 'Baixo',           color: '#22c55e' },
  medio:           { label: 'Médio',           color: '#eab308' },
  alto:            { label: 'Alto',            color: '#f97316' },
  altissimo:       { label: 'Altíssimo',       color: '#ef4444' },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.FC<any> }> = {
  pendente:   { label: 'Pendente',   color: '#94a3b8', icon: Clock },
  em_analise: { label: 'Em Análise', color: '#6366f1', icon: Search },
  aprovado:   { label: 'Aprovado',   color: '#22c55e', icon: CheckCircle },
  recusado:   { label: 'Recusado',   color: '#ef4444', icon: XCircle },
  convertido: { label: 'Convertido', color: '#0ea5e9', icon: CheckCircle },
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ req, isAdmin, onClose, onReview }: {
  req: Req
  isAdmin: boolean
  onClose: () => void
  onReview: (status: string, notes: string) => Promise<void>
}) {
  const [reviewStatus, setReviewStatus] = useState(req.status)
  const [notes, setNotes]               = useState(req.notas_revisao ?? '')
  const [saving, setSaving]             = useState(false)

  const urgConf   = URGENCIA_CONFIG[req.nivel_urgencia] ?? { label: req.nivel_urgencia, color: '#94a3b8' }
  const statusConf = STATUS_CONFIG[req.status] ?? { label: req.status, color: '#94a3b8', icon: Clock }
  const StatusIcon = statusConf.icon

  const handleReview = async () => {
    setSaving(true)
    try {
      await onReview(reviewStatus, notes)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)', maxHeight: '90vh' }}>
        {/* Header */}
        <div className="px-6 py-5 border-b shrink-0" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-bold" style={{ color: 'var(--brand-text)' }}>{req.area_requisitante}</p>
              <p className="text-sm" style={{ color: 'var(--brand-muted)' }}>{req.customer.name}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: `${urgConf.color}15`, color: urgConf.color }}>
                {urgConf.label}
              </span>
              <button onClick={onClose} className="p-1.5 rounded-lg transition-opacity hover:opacity-70" style={{ color: 'var(--brand-muted)' }}>
                <X size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Info grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              ['Tipo de Necessidade', TIPO_LABEL[req.tipo_necessidade] ?? req.tipo_necessidade],
              ['Product Owner', req.product_owner || '—'],
              ['Módulo/Tecnologia', req.modulo_tecnologia || '—'],
              ['Criado por', req.created_by.name],
              ['Data', new Date(req.created_at).toLocaleDateString('pt-BR')],
              ['Status', statusConf.label],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--brand-subtle)' }}>{label}</p>
                <p className="text-sm" style={{ color: 'var(--brand-text)' }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Textos */}
          {req.descricao && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand-subtle)' }}>Descrição</p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--brand-text)' }}>{req.descricao}</p>
            </div>
          )}
          {req.cenario_atual && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#ef4444' }}>6.1 · Cenário Atual</p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--brand-text)' }}>{req.cenario_atual}</p>
            </div>
          )}
          {req.cenario_desejado && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.12)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#22c55e' }}>6.2 · Cenário Desejado</p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--brand-text)' }}>{req.cenario_desejado}</p>
            </div>
          )}

          {/* Admin review panel */}
          {isAdmin && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <p className="text-xs font-bold" style={{ color: '#818cf8' }}>Revisão Interna</p>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand-subtle)' }}>Status</p>
                <div className="flex gap-2 flex-wrap">
                  {(['em_analise', 'aprovado', 'recusado'] as const).map(s => {
                    const c = STATUS_CONFIG[s]
                    return (
                      <button key={s} onClick={() => setReviewStatus(s)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background: reviewStatus === s ? `${c.color}18` : 'transparent',
                          border: `1px solid ${reviewStatus === s ? c.color : 'var(--brand-border)'}`,
                          color: reviewStatus === s ? c.color : 'var(--brand-muted)',
                        }}>
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand-subtle)' }}>Notas de Revisão</p>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Observações, próximos passos..."
                  className="w-full rounded-lg px-3 py-2 text-sm resize-none outline-none"
                  style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
                />
              </div>
            </div>
          )}

          {/* Notas (read-only for client) */}
          {!isAdmin && req.notas_revisao && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#818cf8' }}>Retorno da Equipe</p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--brand-text)' }}>{req.notas_revisao}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-3" style={{ borderColor: 'var(--brand-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--brand-muted)' }}>Fechar</button>
          {isAdmin && (
            <button onClick={handleReview} disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
              style={{ background: '#6366f1', color: '#fff' }}>
              {saving ? 'Salvando...' : 'Salvar Revisão'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Row Card ─────────────────────────────────────────────────────────────────

function ReqRow({ req, onClick }: { req: Req; onClick: () => void }) {
  const urgConf    = URGENCIA_CONFIG[req.nivel_urgencia] ?? { label: req.nivel_urgencia, color: '#94a3b8' }
  const statusConf = STATUS_CONFIG[req.status] ?? { label: req.status, color: '#94a3b8', icon: Clock }
  const StatusIcon = statusConf.icon

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--surface-hover)]"
      style={{ borderBottom: '1px solid var(--brand-border)' }}
    >
      {/* Urgency bar */}
      <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: urgConf.color, opacity: 0.7 }} />

      <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
        <div className="col-span-2 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--brand-text)' }}>{req.area_requisitante}</p>
          <p className="text-xs truncate" style={{ color: 'var(--brand-subtle)' }}>{req.customer.name}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs truncate" style={{ color: 'var(--brand-muted)' }}>{TIPO_LABEL[req.tipo_necessidade] ?? req.tipo_necessidade}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${urgConf.color}15`, color: urgConf.color }}>
            {urgConf.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusIcon size={12} style={{ color: statusConf.color }} />
          <span className="text-[11px] font-semibold" style={{ color: statusConf.color }}>{statusConf.label}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
          {new Date(req.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
        </p>
        <ChevronRight size={14} style={{ color: 'var(--brand-subtle)' }} />
      </div>
    </button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function RequisicoesContent() {
  const router        = useRouter()
  const { user }      = useAuth()
  const [data,    setData]    = useState<Req[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [status,  setStatus]  = useState('')
  const [selected, setSelected] = useState<Req | null>(null)

  const isAdmin = user?.type === 'admin' || user?.type === 'coordenador'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ per_page: '50' })
      if (search)  params.set('search', search)
      if (status)  params.set('status', status)
      const r = await api.get<Pagination>(`/contract-requests?${params}`)
      setData(r.data ?? [])
    } catch { toast.error('Erro ao carregar requisições') }
    finally   { setLoading(false) }
  }, [search, status])

  useEffect(() => { load() }, [load])

  const handleReview = async (s: string, notes: string) => {
    if (!selected) return
    await api.patch(`/contract-requests/${selected.id}/review`, { status: s, notas_revisao: notes })
    toast.success('Revisão salva')
    load()
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-4 shrink-0 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--brand-text)' }}>
              {isAdmin ? 'Requisições de Clientes' : 'Minhas Requisições'}
            </h1>
            <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
              {isAdmin ? 'Analise e aprove as necessidades enviadas pelos clientes' : 'Acompanhe o status das suas requisições'}
            </p>
          </div>
          <button
            onClick={() => router.push('/portal-cliente/nova-requisicao')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ background: 'var(--brand-primary)', color: 'var(--primary-fg)' }}
          >
            <Plus size={14} /> Nova Requisição
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 px-4 md:px-6 py-3 shrink-0 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--brand-subtle)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
            />
          </div>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm outline-none"
            style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)' }}
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          {(search || status) && (
            <button onClick={() => { setSearch(''); setStatus('') }} className="flex items-center gap-1 text-xs" style={{ color: 'var(--brand-subtle)' }}>
              <X size={12} /> Limpar
            </button>
          )}
          <span className="ml-auto text-xs" style={{ color: 'var(--brand-subtle)' }}>{data.length} requisição{data.length !== 1 ? 'ões' : ''}</span>
        </div>

        {/* Table header */}
        {data.length > 0 && (
          <div className="hidden md:grid grid-cols-5 gap-3 px-10 py-2 text-[10px] font-semibold uppercase tracking-wider shrink-0"
            style={{ color: 'var(--brand-subtle)', borderBottom: '1px solid var(--brand-border)' }}>
            <div className="col-span-2">Área / Cliente</div>
            <div>Tipo</div>
            <div>Urgência</div>
            <div>Status</div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p>
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <Inbox size={32} style={{ color: 'var(--brand-subtle)', opacity: 0.4 }} />
              <p className="text-sm" style={{ color: 'var(--brand-subtle)' }}>Nenhuma requisição encontrada</p>
              <button onClick={() => router.push('/portal-cliente/nova-requisicao')}
                className="text-xs font-semibold px-4 py-2 rounded-lg"
                style={{ background: 'var(--primary-soft)', color: 'var(--brand-primary)', border: '1px solid var(--primary-soft)' }}>
                Criar primeira requisição
              </button>
            </div>
          ) : (
            data.map(req => <ReqRow key={req.id} req={req} onClick={() => setSelected(req)} />)
          )}
        </div>
      </div>

      {selected && (
        <DetailModal
          req={selected}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
          onReview={handleReview}
        />
      )}
    </AppLayout>
  )
}

export default function RequisicoesPage() {
  return <RequisicoesContent />
}
