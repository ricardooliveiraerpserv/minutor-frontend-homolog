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
import { Plus, Link2, Users, Send, Copy, ClipboardList, Megaphone, ChevronDown, ChevronRight, Eye, Repeat, MoreVertical, Pencil, Trash2, UserPlus } from 'lucide-react'

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[12px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{children}</label>
}

interface SurveyCard {
  id: number
  type: 'internal' | 'partner' | 'candidate'
  is_campaign?: boolean
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
  const [tab, setTab] = useState<'campanhas' | 'pesquisas'>('campanhas')
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [editSurvey, setEditSurvey] = useState<SurveyCard | null>(null)
  const [partSurvey, setPartSurvey] = useState<SurveyCard | null>(null)

  async function doDelete(s: SurveyCard) {
    if (!window.confirm(`Excluir "${s.title}"?\n\nIsto remove a pesquisa, os convites e TODAS as respostas dela do histórico. Não dá para desfazer.`)) return
    try {
      await api.delete(`/competencias/surveys/${s.id}`)
      toast.success('Pesquisa excluída')
      load()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Erro ao excluir') }
  }

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

  const campanhas = useMemo(() => surveys.filter(s => s.is_campaign), [surveys])
  const formularios = useMemo(() => surveys.filter(s => !s.is_campaign), [surveys])
  const shown = tab === 'campanhas' ? campanhas : formularios

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
            {tab === 'campanhas' ? (
              <button className="ds-btn-primary flex items-center gap-2" onClick={() => setShowCampaign(true)}>
                <Megaphone size={16} /> Nova campanha
              </button>
            ) : (
              <button className="ds-btn-primary flex items-center gap-2" onClick={() => setShowNew(true)}>
                <Plus size={16} /> Nova Pesquisa
              </button>
            )}
          </div>
        </div>

        {/* Abas: Campanhas (auto-atualização interna) × Formulários/Pesquisas (Parceiros, Candidatos, Base Histórica) */}
        <div className="flex items-center gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--surface-hover)' }}>
          {([
            { key: 'campanhas' as const, label: 'Campanhas', icon: Megaphone, count: campanhas.length },
            { key: 'pesquisas' as const, label: 'Formulários / Pesquisas', icon: ClipboardList, count: formularios.length },
          ]).map(t => {
            const active = tab === t.key
            const Ico = t.icon
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm"
                style={{
                  fontWeight: active ? 600 : 500,
                  background: active ? 'var(--surface)' : 'transparent',
                  color: active ? 'var(--primary)' : 'var(--text-muted)',
                  boxShadow: active ? 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.06))' : 'none',
                }}>
                <Ico size={15} /> {t.label}
                <span style={{ fontSize: 11, color: active ? 'var(--primary)' : 'var(--text-light)', fontWeight: 400 }}>{t.count}</span>
              </button>
            )
          })}
        </div>

        {loading && <div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div>}

        {!loading && shown.length === 0 && (
          <div className="ds-card ds-card-pad">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {tab === 'campanhas'
                ? 'Nenhuma campanha ainda. Clique em "Nova campanha" para pedir aos colaboradores que atualizem suas competências.'
                : 'Nenhum formulário/pesquisa ainda. Clique em "Nova Pesquisa" para substituir o Forms.'}
            </p>
          </div>
        )}

        {!loading && shown.map(s => (
          <Link key={s.id} href={`/competencias/pesquisas/${s.id}`} className="block ds-card ds-card-pad ds-row-hover" style={{ textDecoration: 'none' }}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {s.is_campaign ? <Megaphone size={16} style={{ color: 'var(--primary)' }} /> : <ClipboardList size={16} style={{ color: 'var(--primary)' }} />}
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
                <div style={{ position: 'relative' }}>
                  <button onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuFor(menuFor === s.id ? null : s.id) }}
                    className="p-1.5 rounded-md hover:bg-[var(--surface-hover)]" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} title="Ações">
                    <MoreVertical size={16} />
                  </button>
                  {menuFor === s.id && (
                    <>
                      <div onClick={e => { e.preventDefault(); setMenuFor(null) }} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
                      <div className="ds-card" style={{ position: 'absolute', right: 0, top: 30, zIndex: 40, minWidth: 180, padding: 4, textAlign: 'left', boxShadow: '0 6px 20px rgba(0,0,0,0.14)' }}>
                        <MenuItem icon={Pencil} label="Editar" onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuFor(null); setEditSurvey(s) }} />
                        {s.type === 'internal' && <MenuItem icon={UserPlus} label="Participantes" onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuFor(null); setPartSurvey(s) }} />}
                        <MenuItem icon={Trash2} label="Excluir" danger onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuFor(null); doDelete(s) }} />
                      </div>
                    </>
                  )}
                </div>
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

      {editSurvey && (
        <EditSurveyModal survey={editSurvey} onClose={() => setEditSurvey(null)} onDone={() => { setEditSurvey(null); load() }} />
      )}
      {partSurvey && (
        <ParticipantsModal survey={partSurvey} onClose={() => setPartSurvey(null)} onChanged={load} />
      )}
    </AppLayout>
  )
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: React.ComponentType<{ size?: number }>; label: string; onClick: (e: React.MouseEvent) => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-hover)]"
      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: danger ? 'var(--danger)' : 'var(--text)' }}>
      <Icon size={14} /> {label}
    </button>
  )
}

/** Edita título, mensagem e prazo da pesquisa/campanha. */
function EditSurveyModal({ survey, onClose, onDone }: { survey: SurveyCard; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(survey.title)
  const [description, setDescription] = useState(survey.description ?? '')
  const [deadline, setDeadline] = useState(survey.deadline ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim()) { toast.error('Informe o título'); return }
    setSaving(true)
    try {
      await api.put(`/competencias/surveys/${survey.id}`, {
        title: title.trim(), description: description.trim() || null, deadline: deadline || null,
      })
      toast.success('Pesquisa atualizada')
      onDone()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Erro ao salvar') } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} size="md">
      <ModalHeader title="Editar pesquisa" icon={Pencil} onClose={onClose} />
      <ModalBody className="space-y-3">
        <div><Label>Título</Label><input className="ds-input" style={{ width: '100%' }} value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div><Label>Mensagem</Label><textarea className="ds-input" rows={5} style={{ width: '100%', resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} /></div>
        <div><Label>Prazo</Label><input type="date" className="ds-input" style={{ width: '100%' }} value={deadline ?? ''} onChange={e => setDeadline(e.target.value)} /></div>
      </ModalBody>
      <ModalFooter>
        <button className="ds-btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="ds-btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
      </ModalFooter>
    </Modal>
  )
}

/** Gerencia participantes de uma campanha interna: lista atuais (remove) + adiciona por grupo. */
function ParticipantsModal({ survey, onClose, onChanged }: { survey: SurveyCard; onClose: () => void; onChanged: () => void }) {
  interface Inv { id: number; name: string | null; email: string | null; status: string }
  const [invites, setInvites] = useState<Inv[]>([])
  const [groups, setGroups] = useState<TargetGroup[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const reloadInvites = useCallback(async () => {
    const r = await api.get<{ invites: Inv[] }>(`/competencias/surveys/${survey.id}/invites`)
    setInvites(r.invites ?? [])
  }, [survey.id])

  useEffect(() => {
    Promise.all([
      reloadInvites(),
      api.get<{ groups: TargetGroup[] }>('/competencias/campanhas/destinatarios').then(r => setGroups(r.groups ?? [])),
    ]).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false))
  }, [reloadInvites])

  async function removeInvite(inv: Inv) {
    if (!window.confirm(`Remover ${inv.name ?? inv.email ?? 'participante'} da campanha?`)) return
    try { await api.delete(`/competencias/invites/${inv.id}`); toast.success('Participante removido'); await reloadInvites(); onChanged() }
    catch { toast.error('Erro ao remover') }
  }

  const toggleUser = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleExpand = (k: string) => setExpanded(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  const invitedEmails = useMemo(() => new Set(invites.map(i => (i.email ?? '').toLowerCase()).filter(Boolean)), [invites])

  // ── Remoção em massa / por categoria dos participantes ATUAIS ──
  const [selRemove, setSelRemove] = useState<Set<number>>(new Set())
  const emailCat = useMemo(() => {
    const m = new Map<string, string>()
    groups.forEach(g => g.users.forEach(u => { if (u.email) m.set(u.email.toLowerCase(), g.label) }))
    return m
  }, [groups])
  const invitesByCat = useMemo(() => {
    const m = new Map<string, Inv[]>()
    invites.forEach(i => { const cat = emailCat.get((i.email ?? '').toLowerCase()) ?? 'Outros'; const a = m.get(cat) ?? []; a.push(i); m.set(cat, a) })
    return Array.from(m.entries())
  }, [invites, emailCat])
  const toggleRemove = (id: number) => setSelRemove(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleRemoveCat = (items: Inv[]) => setSelRemove(prev => {
    const n = new Set(prev); const allSel = items.every(i => n.has(i.id))
    items.forEach(i => allSel ? n.delete(i.id) : n.add(i.id)); return n
  })
  async function bulkRemove() {
    if (selRemove.size === 0) return
    if (!window.confirm(`Remover ${selRemove.size} participante(s) da campanha?`)) return
    setBusy(true)
    try {
      const res = await api.post<{ removed: number }>(`/competencias/surveys/${survey.id}/invites/remove`, { invite_ids: Array.from(selRemove) })
      toast.success(`${res.removed} removido(s)`)
      setSelRemove(new Set()); await reloadInvites(); onChanged()
    } catch { toast.error('Erro ao remover') } finally { setBusy(false) }
  }

  async function addSelected() {
    if (selected.size === 0) { toast.error('Selecione ao menos um'); return }
    setBusy(true)
    try {
      const res = await api.post<{ created: number }>(`/competencias/surveys/${survey.id}/invites`, { user_ids: Array.from(selected) })
      toast.success(`${res.created} adicionado(s)`)
      setSelected(new Set()); await reloadInvites(); onChanged()
    } catch { toast.error('Erro ao adicionar') } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} size="lg">
      <ModalHeader title="Participantes" subtitle={survey.title} icon={Users} onClose={onClose} />
      <ModalBody className="space-y-4">
        {loading ? <div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div> : (
          <>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Atuais ({invites.length})</Label>
                {selRemove.size > 0 && (
                  <button onClick={bulkRemove} disabled={busy} className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-md"
                    style={{ color: 'var(--danger)', border: '1px solid var(--danger)', background: 'none', cursor: 'pointer' }}>
                    <Trash2 size={13} /> Remover selecionados ({selRemove.size})
                  </button>
                )}
              </div>
              {invites.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum participante ainda.</p> : (
                <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                  {invitesByCat.map(([cat, items]) => {
                    const allSel = items.every(i => selRemove.has(i.id))
                    const someSel = items.some(i => selRemove.has(i.id))
                    return (
                      <div key={cat}>
                        <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: 'var(--surface-hover)', borderTop: '1px solid var(--border)' }}>
                          <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = !allSel && someSel }} onChange={() => toggleRemoveCat(items)} title="Selecionar toda a categoria" />
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{cat}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-light)' }}>{items.length}</span>
                        </div>
                        {items.map(i => (
                          <div key={i.id} className="flex items-center gap-2 px-3 py-1.5" style={{ borderTop: '1px solid var(--border)', fontSize: 12.5 }}>
                            <input type="checkbox" checked={selRemove.has(i.id)} onChange={() => toggleRemove(i.id)} />
                            <span style={{ color: 'var(--text)', flex: 1 }}>{i.name ?? '—'}</span>
                            <span style={{ color: 'var(--text-light)', fontSize: 11 }}>{i.email}</span>
                            <span className={i.status === 'submitted' ? 'ds-status-success' : 'ds-status'} style={{ fontSize: 10 }}>{i.status === 'submitted' ? 'Respondido' : 'Pendente'}</span>
                            <button onClick={() => removeInvite(i)} title="Remover" className="p-1 rounded-md hover:bg-[var(--surface-hover)]" style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={13} /></button>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div>
              <Label>Adicionar participantes ({selected.size} selecionado{selected.size !== 1 ? 's' : ''})</Label>
              <div className="space-y-1.5">
                {groups.map(g => {
                  const isOpen = expanded.has(g.key)
                  const addable = g.users.filter(u => !invitedEmails.has((u.email ?? '').toLowerCase()))
                  return (
                    <div key={g.key} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      <button type="button" onClick={() => toggleExpand(g.key)} className="w-full flex items-center gap-1.5 px-2.5 py-2" style={{ background: 'var(--surface-hover)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="text-sm" style={{ color: 'var(--text)', fontWeight: 600, flex: 1 }}>{g.label}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-light)' }}>{addable.length} disponíveis</span>
                      </button>
                      {isOpen && (
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                          {addable.length === 0 && <div className="px-3 py-2" style={{ fontSize: 12, color: 'var(--text-light)' }}>Todos já participam.</div>}
                          {addable.map(u => (
                            <label key={u.id} className="flex items-center gap-2 px-3 py-1.5" style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', fontSize: 12.5 }}>
                              <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleUser(u.id)} />
                              <span style={{ color: 'var(--text)', flex: 1 }}>{u.name}</span>
                              <span style={{ color: 'var(--text-light)', fontSize: 11 }}>{u.email}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <button className="ds-btn-secondary" onClick={onClose}>Fechar</button>
        <button className="ds-btn-primary flex items-center gap-2" onClick={addSelected} disabled={busy || selected.size === 0}><Send size={15} /> Adicionar ({selected.size})</button>
      </ModalFooter>
    </Modal>
  )
}

interface TargetUser { id: number; name: string; email: string }
interface TargetGroup { key: string; label: string; count: number; users: TargetUser[] }

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
  const [recurrenceDays, setRecurrenceDays] = useState('')
  const [groups, setGroups] = useState<TargetGroup[]>([])
  const [loadingTargets, setLoadingTargets] = useState(true)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
  const [previewing, setPreviewing] = useState(false)

  useEffect(() => {
    api.get<{ groups: TargetGroup[] }>('/competencias/campanhas/destinatarios')
      .then(r => {
        const gs = r.groups ?? []
        setGroups(gs)
        // pré-seleciona Consultores + Coordenadores por padrão
        const pre = new Set<number>()
        gs.filter(g => g.key === 'consultor_interno' || g.key === 'consultor_freelance' || g.key === 'coordenador').forEach(g => g.users.forEach(u => pre.add(u.id)))
        setSelected(pre)
      })
      .catch(() => toast.error('Erro ao carregar destinatários'))
      .finally(() => setLoadingTargets(false))
  }, [])

  const toggleUser = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleExpand = (k: string) => setExpanded(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  const groupState = (g: TargetGroup): 'all' | 'some' | 'none' => {
    const sel = g.users.filter(u => selected.has(u.id)).length
    return sel === 0 ? 'none' : sel === g.users.length ? 'all' : 'some'
  }
  const toggleGroupAll = (g: TargetGroup) => setSelected(prev => {
    const n = new Set(prev)
    const st = groupState(g)
    if (st === 'all') g.users.forEach(u => n.delete(u.id))
    else g.users.forEach(u => n.add(u.id))
    return n
  })

  async function doPreview() {
    setPreviewing(true)
    try {
      const r = await api.post<{ subject: string; html: string }>('/competencias/campanhas/previa', {
        title: title.trim() || null, description: description.trim() || null, deadline: deadline || null,
      })
      setPreview(r)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gerar a prévia')
    } finally { setPreviewing(false) }
  }

  async function launch() {
    if (!deadline) { toast.error('Informe o prazo da campanha'); return }
    if (selected.size === 0) { toast.error('Selecione ao menos um destinatário'); return }
    setSaving(true)
    try {
      const s = await api.post<{ id: number; invited: number; mails_sent: number }>('/competencias/campanhas', {
        title: title.trim() || null, description: description.trim() || null, deadline,
        user_ids: Array.from(selected),
        recurrence_days: recurrenceDays === '' ? 0 : Math.max(0, parseInt(recurrenceDays, 10) || 0),
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
    <>
    <Modal open onClose={onClose} size="lg">
      <ModalHeader title="Nova campanha de atualização" icon={Megaphone} onClose={onClose} />
      <ModalBody className="space-y-3">
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Envia aos colaboradores internos selecionados um pedido para <strong>atualizar as competências</strong>, com
          pop-up e e-mail. Você acompanha quem já atualizou e cobra os pendentes.
        </p>
        <div>
          <Label>Título</Label>
          <input className="ds-input" style={{ width: '100%' }} value={title} onChange={e => setTitle(e.target.value)} placeholder={defaultCampaignTitle()} />
        </div>
        <div>
          <Label>Mensagem <span style={{ color: 'var(--text-light)' }}>(vai no e-mail e no pop-up)</span></Label>
          <textarea className="ds-input" rows={7} value={description} onChange={e => setDescription(e.target.value)}
            style={{ width: '100%', resize: 'vertical', minHeight: 180 }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Prazo</Label>
            <input type="date" className="ds-input" style={{ width: '100%' }} value={deadline} onChange={e => setDeadline(e.target.value)} />
          </div>
          <div>
            <Label><Repeat size={12} style={{ display: 'inline', marginRight: 4 }} />Recorrência (reenviar a cada N dias)</Label>
            <input type="number" min={0} max={365} className="ds-input" style={{ width: '100%' }}
              value={recurrenceDays} onChange={e => setRecurrenceDays(e.target.value)} placeholder="0 = não reenviar" />
          </div>
        </div>

        <div>
          <Label>Público-alvo <span style={{ color: 'var(--text-light)' }}>({selected.size} selecionado{selected.size !== 1 ? 's' : ''})</span></Label>
          {loadingTargets ? (
            <div className="ds-card ds-card-pad"><SectionLoader label="Carregando destinatários…" /></div>
          ) : (
            <div className="space-y-1.5 mt-1">
              {groups.map(g => {
                const st = groupState(g)
                const isOpen = expanded.has(g.key)
                const selCount = g.users.filter(u => selected.has(u.id)).length
                return (
                  <div key={g.key} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <div className="flex items-center gap-2 px-2.5 py-2" style={{ background: 'var(--surface-hover)' }}>
                      <input type="checkbox" checked={st === 'all'} ref={el => { if (el) el.indeterminate = st === 'some' }}
                        onChange={() => toggleGroupAll(g)} title="Selecionar todos deste grupo" />
                      <button type="button" onClick={() => toggleExpand(g.key)} className="flex items-center gap-1.5 flex-1 text-left" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                        {isOpen ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
                        <span className="text-sm" style={{ color: 'var(--text)', fontWeight: 600 }}>{g.label}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-light)' }}>{selCount}/{g.count}</span>
                      </button>
                    </div>
                    {isOpen && (
                      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {g.users.length === 0 && <div className="px-3 py-2" style={{ fontSize: 12, color: 'var(--text-light)' }}>Ninguém neste grupo.</div>}
                        {g.users.map(u => (
                          <label key={u.id} className="flex items-center gap-2 px-3 py-1.5" style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', fontSize: 12.5 }}>
                            <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleUser(u.id)} />
                            <span style={{ color: 'var(--text)', flex: 1 }}>{u.name}</span>
                            <span style={{ color: 'var(--text-light)', fontSize: 11 }}>{u.email}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter className="!justify-between">
        <button className="ds-btn-secondary" onClick={onClose}>Cancelar</button>
        <div className="flex items-center gap-2">
          <button className="ds-btn-secondary flex items-center gap-2" disabled={previewing} onClick={doPreview}>
            <Eye size={15} /> {previewing ? 'Gerando…' : 'Prévia'}
          </button>
          <button className="ds-btn-primary flex items-center gap-2" disabled={saving || loadingTargets} onClick={launch}>
            <Send size={15} /> {saving ? 'Enviando…' : `Abrir e notificar (${selected.size})`}
          </button>
        </div>
      </ModalFooter>
    </Modal>

    {preview && (
      <Modal open onClose={() => setPreview(null)} size="lg">
        <ModalHeader title="Prévia do e-mail" icon={Eye} onClose={() => setPreview(null)} />
        <ModalBody>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            <strong>Assunto:</strong> {preview.subject}
          </div>
          <iframe title="Prévia" srcDoc={preview.html} style={{ width: '100%', height: 460, border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }} />
        </ModalBody>
        <ModalFooter>
          <button className="ds-btn-primary" onClick={() => setPreview(null)}>Fechar</button>
        </ModalFooter>
      </Modal>
    )}
    </>
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
