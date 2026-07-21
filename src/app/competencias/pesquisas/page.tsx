'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader } from '@/components/ui/loading'
import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal'
import { Plus, Link2, Users, Send, Copy, ClipboardList } from 'lucide-react'

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[12px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{children}</label>
}

interface SurveyCard {
  id: number
  type: 'internal' | 'partner' | 'candidate'
  title: string
  description: string | null
  status: 'draft' | 'open' | 'closed'
  deadline: string | null
  public_link: string
  matrix_version: { number: number; label: string | null } | null
  invited: number
  submitted: number
  pending: number
  response_rate: number
  created_at: string
}
interface Recipient { id: number; name: string; email: string; cargo: string | null; type: string }
interface Meta {
  active_version: { id: number; number: number; label: string | null; skills_count: number } | null
  types: { value: string; label: string }[]
  recipients: Recipient[]
}

const TYPE_LABEL: Record<string, string> = {
  internal: 'Colaboradores Internos', partner: 'Parceiros', candidate: 'Banco de Talentos',
}
const STATUS_LABEL: Record<string, string> = { draft: 'Rascunho', open: 'Aberta', closed: 'Encerrada' }
const STATUS_CLASS: Record<string, string> = { draft: 'ds-status', open: 'ds-status-success', closed: 'ds-status-info' }

export default function PesquisasCompetenciasPage() {
  const [surveys, setSurveys] = useState<SurveyCard[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, m] = await Promise.all([
        api.get<{ surveys: SurveyCard[] }>('/competencias/surveys'),
        api.get<Meta>('/competencias/meta'),
      ])
      setSurveys(s.surveys ?? [])
      setMeta(m)
    } catch {
      toast.error('Erro ao carregar pesquisas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <AppLayout title="Pesquisas de Competências">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {meta?.active_version
              ? <>Matriz v{meta.active_version.number} · {meta.active_version.skills_count} competências</>
              : 'Nenhuma matriz publicada'}
          </p>
          <button className="ds-btn-primary flex items-center gap-2" onClick={() => setShowNew(true)}>
            <Plus size={16} /> Nova Pesquisa
          </button>
        </div>

        {loading && <div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div>}

        {!loading && surveys.length === 0 && (
          <div className="ds-card ds-card-pad">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Nenhuma pesquisa ainda. Crie a primeira para substituir o Forms.
            </p>
          </div>
        )}

        {!loading && surveys.map(s => (
          <Link key={s.id} href={`/competencias/pesquisas/${s.id}`} className="block ds-card ds-card-pad ds-row-hover" style={{ textDecoration: 'none' }}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ClipboardList size={16} style={{ color: 'var(--primary)' }} />
                  <span className="text-sm" style={{ color: 'var(--text)', fontWeight: 600 }}>{s.title}</span>
                  <span className={STATUS_CLASS[s.status]} style={{ fontSize: 10 }}>{STATUS_LABEL[s.status]}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 4 }}>
                  {TYPE_LABEL[s.type]}{s.deadline ? ` · prazo ${s.deadline}` : ''}{s.matrix_version ? ` · matriz v${s.matrix_version.number}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0 text-center">
                <Metric label="Enviados" value={s.invited} />
                <Metric label="Respondidos" value={s.submitted} />
                <Metric label="Pendentes" value={s.pending} />
                <Metric label="Taxa" value={`${s.response_rate}%`} accent />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {showNew && meta && (
        <NewSurveyModal
          meta={meta}
          onClose={() => setShowNew(false)}
          onDone={() => { setShowNew(false); load() }}
        />
      )}
    </AppLayout>
  )
}

function Metric({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ? 'var(--primary)' : 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  )
}

function NewSurveyModal({ meta, onClose, onDone }: { meta: Meta; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<'form' | 'recipients'>('form')
  const [type, setType] = useState<'internal' | 'partner' | 'candidate'>('internal')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<SurveyCard | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? meta.recipients.filter(r => r.name.toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q)) : meta.recipients
  }, [meta.recipients, search])

  async function createSurvey() {
    if (!title.trim()) { toast.error('Informe o título'); return }
    setSaving(true)
    try {
      const s = await api.post<SurveyCard>('/competencias/surveys', {
        type, title, description: description || null, deadline: deadline || null,
      })
      setCreated(s)
      if (type === 'internal') setStep('recipients')
      else { toast.success('Pesquisa criada — compartilhe o link público'); }
    } catch {
      toast.error('Erro ao criar pesquisa')
    } finally {
      setSaving(false)
    }
  }

  async function sendInvites(all: boolean) {
    if (!created) return
    if (!all && selected.size === 0) { toast.error('Selecione ao menos um destinatário'); return }
    setSaving(true)
    try {
      const res = await api.post<{ created: number }>(`/competencias/surveys/${created.id}/invites`,
        all ? { all: true } : { user_ids: Array.from(selected) })
      toast.success(`${res.created} convite(s) enviado(s)`)
      onDone()
    } catch {
      toast.error('Erro ao enviar convites')
    } finally {
      setSaving(false)
    }
  }

  const toggle = (id: number) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  return (
    <Modal open onClose={onClose} size="md">
      <ModalHeader title={step === 'form' ? 'Nova Pesquisa' : 'Selecionar destinatários'} icon={ClipboardList} onClose={onClose} />
      <ModalBody className="space-y-3">
          {step === 'form' && (
            <>
              <div>
                <Label>Tipo</Label>
                <div className="flex flex-col gap-1.5 mt-1">
                  {meta.types.map(t => (
                    <label key={t.value} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                      <input type="radio" name="type" checked={type === t.value} onChange={() => setType(t.value as 'internal')} />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label>Título</Label>
                <input className="ds-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Competências 2026" />
              </div>
              <div>
                <Label>Descrição</Label>
                <textarea className="ds-input" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <div>
                <Label>Prazo</Label>
                <input type="date" className="ds-input" value={deadline} onChange={e => setDeadline(e.target.value)} />
              </div>
              {created && type !== 'internal' && (
                <PublicLinkBox link={created.public_link} />
              )}
            </>
          )}

          {step === 'recipients' && created && (
            <>
              <input className="ds-input" placeholder="Buscar colaborador…" value={search} onChange={e => setSearch(e.target.value)} />
              <div style={{ maxHeight: 300, overflowY: 'auto' }} className="divide-y">
                {filtered.map(r => (
                  <label key={r.id} className="flex items-center gap-2 py-2 text-sm" style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                    <span style={{ flex: 1 }}>{r.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.cargo ?? r.type}</span>
                  </label>
                ))}
              </div>
            </>
          )}
      </ModalBody>
      <ModalFooter className="!justify-between">
          <button className="ds-btn-secondary" onClick={onClose}>Fechar</button>
          {step === 'form' && (
            <button className="ds-btn-primary flex items-center gap-2" disabled={saving} onClick={createSurvey}>
              {type === 'internal' ? <><Users size={15} /> Criar e escolher destinatários</> : <><Link2 size={15} /> Criar e gerar link</>}
            </button>
          )}
          {step === 'recipients' && (
            <div className="flex items-center gap-2">
              <button className="ds-btn-secondary" disabled={saving} onClick={() => sendInvites(true)}>Enviar p/ todos</button>
              <button className="ds-btn-primary flex items-center gap-2" disabled={saving} onClick={() => sendInvites(false)}>
                <Send size={15} /> Enviar ({selected.size})
              </button>
            </div>
          )}
      </ModalFooter>
    </Modal>
  )
}

function PublicLinkBox({ link }: { link: string }) {
  return (
    <div className="ds-card ds-card-pad" style={{ background: 'var(--surface-hover)' }}>
      <div className="flex items-center gap-1 text-[12px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}><Link2 size={13} /> Link público</div>
      <div className="flex items-center gap-2 mt-1">
        <input className="ds-input" readOnly value={link} style={{ flex: 1, fontSize: 12 }} />
        <button className="ds-btn-secondary" onClick={() => { navigator.clipboard?.writeText(link); toast.success('Link copiado') }}>
          <Copy size={14} />
        </button>
      </div>
    </div>
  )
}
