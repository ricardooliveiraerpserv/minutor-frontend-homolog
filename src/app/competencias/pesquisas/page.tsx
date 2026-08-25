'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { CompetenciasConsultaTabs } from '@/components/competencias/consulta-tabs'
import { SectionLoader } from '@/components/ui/loading'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal'
import { Plus, Link2, Users, Send, Copy, ClipboardList, Megaphone } from 'lucide-react'

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
  const router = useRouter()
  const [surveys, setSurveys] = useState<SurveyCard[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [showCampaign, setShowCampaign] = useState(false)

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
        <CompetenciasConsultaTabs />
        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {meta?.active_version
              ? <>Matriz v{meta.active_version.number} · {meta.active_version.skills_count} competências</>
              : 'Nenhuma matriz publicada'}
          </p>
          <div className="flex items-center gap-2">
            <button className="ds-btn-primary flex items-center gap-2" onClick={() => setShowCampaign(true)}>
              <Megaphone size={16} /> Nova campanha
            </button>
            <button className="ds-btn-secondary flex items-center gap-2" onClick={() => setShowNew(true)}>
              <Plus size={16} /> Nova Pesquisa
            </button>
          </div>
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

      {showCampaign && (
        <NewCampaignModal
          onClose={() => setShowCampaign(false)}
          onDone={(id) => { setShowCampaign(false); router.push(`/competencias/pesquisas/${id}`) }}
        />
      )}
    </AppLayout>
  )
}

const CAMPAIGN_GROUPS: { key: string; label: string }[] = [
  { key: 'consultor', label: 'Consultores' },
  { key: 'coordenador', label: 'Coordenadores' },
  { key: 'parceiro', label: 'Parceiros' },
  { key: 'admin', label: 'Administrativo / Admin' },
]

function defaultCampaignTitle(): string {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  return `Atualização de Competências — ${mm}/${now.getFullYear()}`
}
const DEFAULT_CAMPAIGN_MESSAGE =
  'Chegou o momento de revisar e atualizar suas competências. Se você evoluiu — um novo curso, uma nova ferramenta ou um projeto relevante — reflita isso no seu perfil para mantê-lo sempre atualizado. Leva poucos minutos: suas respostas anteriores já vêm preenchidas, basta ajustar o que mudou.'

function NewCampaignModal({ onClose, onDone }: { onClose: () => void; onDone: (id: number) => void }) {
  const [title, setTitle] = useState(defaultCampaignTitle())
  const [description, setDescription] = useState(DEFAULT_CAMPAIGN_MESSAGE)
  const [deadline, setDeadline] = useState('')
  const [groups, setGroups] = useState<Set<string>>(new Set(['consultor', 'coordenador']))
  const [saving, setSaving] = useState(false)

  const toggleGroup = (k: string) => setGroups(prev => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n
  })

  async function launch() {
    if (!deadline) { toast.error('Informe o prazo da campanha'); return }
    if (groups.size === 0) { toast.error('Selecione ao menos um grupo do público-alvo'); return }
    setSaving(true)
    try {
      const s = await api.post<{ id: number; invited: number; mails_sent: number }>('/competencias/campanhas', {
        title: title.trim() || null, description: description.trim() || null, deadline, groups: Array.from(groups),
      })
      toast.success(`Campanha aberta — ${s.invited} colaborador(es) notificado(s)`)
      onDone(s.id)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao abrir a campanha')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} size="lg">
      <ModalHeader title="Nova campanha de atualização" icon={Megaphone} onClose={onClose} />
      <ModalBody className="space-y-3">
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Envia aos colaboradores internos selecionados um pedido para <strong>atualizar as competências</strong>, com
          pop-up e e-mail. Você acompanha quem já atualizou e cobra os pendentes (a recorrência é configurável na
          Central de Workflows).
        </p>
        <div>
          <Label>Título</Label>
          <input className="ds-input" style={{ width: '100%' }} value={title} onChange={e => setTitle(e.target.value)} placeholder={defaultCampaignTitle()} />
        </div>
        <div>
          <Label>Mensagem</Label>
          <textarea className="ds-input" rows={7} value={description} onChange={e => setDescription(e.target.value)}
            style={{ width: '100%', resize: 'vertical', minHeight: 180 }} />
        </div>
        <div>
          <Label>Prazo</Label>
          <input type="date" className="ds-input" value={deadline} onChange={e => setDeadline(e.target.value)} style={{ maxWidth: 220 }} />
        </div>
        <div>
          <Label>Público-alvo <span style={{ color: 'var(--text-light)' }}>(colaboradores internos)</span></Label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {CAMPAIGN_GROUPS.map(g => (
              <label key={g.key} className="flex items-center gap-2 text-sm ds-card ds-card-pad" style={{ padding: '8px 10px', cursor: 'pointer', color: 'var(--text)' }}>
                <input type="checkbox" checked={groups.has(g.key)} onChange={() => toggleGroup(g.key)} />
                {g.label}
              </label>
            ))}
          </div>
        </div>
      </ModalBody>
      <ModalFooter className="!justify-between">
        <button className="ds-btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="ds-btn-primary flex items-center gap-2" disabled={saving} onClick={launch}>
          <Send size={15} /> {saving ? 'Enviando…' : 'Abrir e notificar'}
        </button>
      </ModalFooter>
    </Modal>
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
