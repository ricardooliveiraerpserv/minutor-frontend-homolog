'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader } from '@/components/ui/loading'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { ArrowLeft, Bell, Copy, Link2, Play, Square, UserPlus, Send } from 'lucide-react'

interface Detail {
  id: number; type: string; title: string; description: string | null
  status: 'draft' | 'open' | 'closed'; deadline: string | null
  public_link: string; matrix_version: { number: number; label: string | null } | null
  invited: number; submitted: number; pending: number; response_rate: number
}
interface Invite {
  id: number; name: string | null; email: string | null; status: string
  last_access_at: string | null; submitted_at: string | null
  reminder_count: number; last_reminder_at: string | null
}
interface Recipient { id: number; name: string; email: string; cargo: string | null; type: string }

const INVITE_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Não enviado', cls: 'ds-status' },
  sent: { label: 'Enviado', cls: 'ds-status-info' },
  opened: { label: 'Aberto', cls: 'ds-status-info' },
  started: { label: 'Iniciado', cls: 'ds-status-warning' },
  submitted: { label: 'Respondido', cls: 'ds-status-success' },
}
const fmt = (d: string | null) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export default function AcompanhamentoPage() {
  const params = useParams()
  const id = Number(params?.id)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [d, inv] = await Promise.all([
        api.get<Detail>(`/competencias/surveys/${id}`),
        api.get<{ invites: Invite[] }>(`/competencias/surveys/${id}/invites`),
      ])
      setDetail(d)
      setInvites(inv.invites ?? [])
    } catch {
      toast.error('Erro ao carregar acompanhamento')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { if (id) load() }, [id, load])

  async function setStatus(status: 'open' | 'closed') {
    setBusy(true)
    try {
      await api.put(`/competencias/surveys/${id}`, { status })
      toast.success(status === 'open' ? 'Pesquisa aberta' : 'Pesquisa encerrada')
      load()
    } catch { toast.error('Erro ao atualizar status') } finally { setBusy(false) }
  }

  async function remind(inviteId: number) {
    try {
      const res = await api.post<{ link: string }>(`/competencias/invites/${inviteId}/reminder`, {})
      navigator.clipboard?.writeText(res.link)
      toast.success('Lembrete registrado — link copiado')
      load()
    } catch { toast.error('Erro ao registrar lembrete') }
  }

  if (loading || !detail) {
    return <AppLayout title="Acompanhamento"><div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div></AppLayout>
  }

  const isInternal = detail.type === 'internal'

  return (
    <AppLayout title={detail.title}>
      <div className="space-y-4">
        <Link href="/competencias/pesquisas" className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--primary)' }}>
          <ArrowLeft size={14} /> Voltar
        </Link>

        {/* Cabeçalho + ações */}
        <div className="ds-card ds-card-pad flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>{detail.title}</span>
              <span className={INVITE_STATUS[detail.status]?.cls ?? 'ds-status'} style={{ fontSize: 10 }}>
                {detail.status === 'draft' ? 'Rascunho' : detail.status === 'open' ? 'Aberta' : 'Encerrada'}
              </span>
            </div>
            {detail.description && <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{detail.description}</p>}
            <p style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 4 }}>
              {detail.matrix_version ? `Matriz v${detail.matrix_version.number}` : ''}{detail.deadline ? ` · prazo ${detail.deadline}` : ''}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            {detail.status !== 'open'
              ? <button className="ds-btn-primary flex items-center gap-1.5" disabled={busy} onClick={() => setStatus('open')}><Play size={14} /> Abrir</button>
              : <button className="ds-btn-secondary flex items-center gap-1.5" disabled={busy} onClick={() => setStatus('closed')}><Square size={14} /> Encerrar</button>}
            {isInternal && <button className="ds-btn-secondary flex items-center gap-1.5" onClick={() => setShowAdd(true)}><UserPlus size={14} /> Destinatários</button>}
          </div>
        </div>

        {/* Link público (parceiro/candidato) */}
        {!isInternal && (
          <div className="ds-card ds-card-pad">
            <div className="flex items-center gap-1 text-[12px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}><Link2 size={13} /> Link público</div>
            <div className="flex items-center gap-2">
              <input className="ds-input" readOnly value={detail.public_link} style={{ flex: 1, fontSize: 12 }} />
              <button className="ds-btn-secondary" onClick={() => { navigator.clipboard?.writeText(detail.public_link); toast.success('Copiado') }}><Copy size={14} /></button>
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          <Kpi label="Enviados" value={detail.invited} />
          <Kpi label="Respondidos" value={detail.submitted} />
          <Kpi label="Pendentes" value={detail.pending} />
          <Kpi label="Taxa" value={`${detail.response_rate}%`} accent />
        </div>

        {/* Tabela de acompanhamento */}
        <div className="ds-card ds-card-pad">
          {invites.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {isInternal ? 'Nenhum destinatário ainda.' : 'Respostas públicas aparecerão aqui conforme chegam.'}
          </p>}
          {invites.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11, textAlign: 'left' }}>
                    <th className="py-2 pr-3">Nome</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Último acesso</th>
                    <th className="py-2 pr-3">Conclusão</th>
                    <th className="py-2 pr-3 text-right">Lembrete</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map(i => (
                    <tr key={i.id} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
                      <td className="py-2 pr-3">
                        <div>{i.name ?? '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{i.email}</div>
                      </td>
                      <td className="py-2 pr-3"><span className={INVITE_STATUS[i.status]?.cls ?? 'ds-status'} style={{ fontSize: 10 }}>{INVITE_STATUS[i.status]?.label ?? i.status}</span></td>
                      <td className="py-2 pr-3" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{fmt(i.last_access_at)}</td>
                      <td className="py-2 pr-3" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{fmt(i.submitted_at)}</td>
                      <td className="py-2 pr-3 text-right">
                        {i.status !== 'submitted' && (
                          <button className="ds-btn-secondary inline-flex items-center gap-1" style={{ fontSize: 12 }} onClick={() => remind(i.id)}>
                            <Bell size={12} /> {i.reminder_count > 0 ? `Lembrar (${i.reminder_count})` : 'Lembrar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showAdd && <AddRecipientsModal surveyId={id} onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); load() }} />}
    </AppLayout>
  )
}

function Kpi({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="ds-card ds-card-pad text-center">
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ? 'var(--primary)' : 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  )
}

function AddRecipientsModal({ surveyId, onClose, onDone }: { surveyId: number; onClose: () => void; onDone: () => void }) {
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<{ recipients: Recipient[] }>('/competencias/meta').then(m => setRecipients(m.recipients ?? [])).catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? recipients.filter(r => r.name.toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q)) : recipients
  }, [recipients, search])

  const toggle = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function send(all: boolean) {
    if (!all && selected.size === 0) { toast.error('Selecione ao menos um'); return }
    setSaving(true)
    try {
      const res = await api.post<{ created: number }>(`/competencias/surveys/${surveyId}/invites`, all ? { all: true } : { user_ids: Array.from(selected) })
      toast.success(`${res.created} convite(s) enviado(s)`)
      onDone()
    } catch { toast.error('Erro ao enviar') } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} size="md">
      <ModalHeader title="Adicionar destinatários" icon={UserPlus} onClose={onClose} />
      <ModalBody className="space-y-3">
        <input className="ds-input" placeholder="Buscar colaborador…" value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {filtered.map(r => (
            <label key={r.id} className="flex items-center gap-2 py-2 text-sm" style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}>
              <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
              <span style={{ flex: 1 }}>{r.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.cargo ?? r.type}</span>
            </label>
          ))}
        </div>
      </ModalBody>
      <ModalFooter className="!justify-between">
        <button className="ds-btn-secondary" disabled={saving} onClick={() => send(true)}>Enviar p/ todos</button>
        <button className="ds-btn-primary flex items-center gap-2" disabled={saving} onClick={() => send(false)}><Send size={15} /> Enviar ({selected.size})</button>
      </ModalFooter>
    </Modal>
  )
}
