'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader } from '@/components/ui/loading'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal'
import { useConfirm } from '@/components/ui/use-confirm'
import { useState, useEffect, useCallback } from 'react'
import { api, apiMessage } from '@/lib/api'
import { toast } from 'sonner'
import { CheckCircle2, UserPlus, ArrowRight, Pause, User as UserIcon, Loader2, Trash2, Plus } from 'lucide-react'

interface ChecklistItem { label: string; done: boolean }
interface HireForm {
  email: string
  perfil: string; coordinator_type: string
  contratacao_fixa: string; consultant_type: string; valor: string; start_date: string
  tem_garantia: string; guaranteed_hours: string; empresa: string
  recursos: string[]; incluir_whatsapp: string
  cpf: string; nascimento: string; matricula: string
  cep: string; logradouro: string; numero: string
  complemento: string; bairro: string; cidade: string; estado: string; observacao: string
}
interface Card {
  id: number; bucket: string; title: string; cargo: string | null; modalidade: string | null; priority: string
  checklist: ChecklistItem[]; checklist_done: number; checklist_total: number; notes: string | null; form: HireForm
  respondent_id: number; respondent_name: string; respondent_phone: string | null
  created_user: { id: number; name: string; email: string } | null
  completed_at: string | null
}
interface Bucket { key: string; label: string; cards: Card[] }
interface Opt { value: string; label: string }

const PRI: Record<string, { label: string; cls: string }> = {
  urgente: { label: 'Urgente', cls: 'ds-status-danger' }, alta: { label: 'Alta', cls: 'ds-status-warning' },
  media: { label: 'Média', cls: 'ds-status' }, baixa: { label: 'Baixa', cls: 'ds-status-info' },
}

export default function ContratacaoPage() {
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [modalidades, setModalidades] = useState<Opt[]>([])
  const [recursos, setRecursos] = useState<Opt[]>([])
  const [loading, setLoading] = useState(true)
  const [cepLoading, setCepLoading] = useState(false)
  const [open, setOpen] = useState<Card | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [nTitle, setNTitle] = useState('')
  const [nCargo, setNCargo] = useState('')
  const [nModal, setNModal] = useState('')
  const [creating, setCreating] = useState(false)
  const { confirm, confirmDialog } = useConfirm()

  const createHire = async () => {
    if (!nTitle.trim()) { toast.error('Informe o nome da contratação'); return }
    setCreating(true)
    try {
      await api.post('/competencias/contratacao', { title: nTitle.trim(), cargo: nCargo || null, modalidade: nModal || null })
      toast.success('Contratação incluída')
      setShowNew(false); setNTitle(''); setNCargo(''); setNModal(''); load()
    } catch (e) { toast.error((e as { message?: string })?.message ?? 'Erro ao incluir') }
    finally { setCreating(false) }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ buckets: Bucket[]; modalidades: Opt[]; recursos: Opt[] }>('/competencias/contratacao')
      setBuckets(r.buckets ?? []); setModalidades(r.modalidades ?? []); setRecursos(r.recursos ?? [])
    }
    catch { toast.error('Erro ao carregar contratações') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const patch = (card: Card) => { setOpen(card); setBuckets(bs => bs.map(b => ({ ...b, cards: b.cards.map(c => c.id === card.id ? card : c) }))) }

  async function saveCard(card: Card, body: Partial<Card>) {
    try { const r = await api.put<Card>(`/competencias/contratacao/${card.id}`, body); patch(r) }
    catch (e: unknown) { toast.error(apiMessage(e, 'Erro ao salvar')) }
  }
  async function toggleItem(card: Card, idx: number) {
    const checklist = card.checklist.map((it, i) => i === idx ? { ...it, done: !it.done } : it)
    saveCard(card, { checklist })
  }
  function editItemLabel(card: Card, idx: number, label: string) {
    const trimmed = label.trim()
    if (!trimmed) { removeItem(card, idx); return }
    if (trimmed === card.checklist[idx]?.label) return
    saveCard(card, { checklist: card.checklist.map((it, i) => i === idx ? { ...it, label: trimmed } : it) })
  }
  function addItem(card: Card) {
    saveCard(card, { checklist: [...card.checklist, { label: 'Novo item', done: false }] })
  }
  function removeItem(card: Card, idx: number) {
    saveCard(card, { checklist: card.checklist.filter((_, i) => i !== idx) })
  }
  async function move(card: Card, bucket: string) {
    try {
      const r = await api.post<Card>(`/competencias/contratacao/${card.id}/move`, { bucket })
      toast.success('Movido')
      if (r.created_user) toast.success(`Usuário criado: ${r.created_user.email}`)
      setOpen(null); load()
    } catch (e: unknown) { toast.error(apiMessage(e, 'Erro ao mover')) }
  }
  async function complete(card: Card) {
    if (!(await confirm({ title: 'Concluir contratação', message: 'Concluir a contratação e criar o usuário deste contratado no Minutor? Ele receberá as credenciais por e-mail.', confirmLabel: 'Concluir e criar usuário' }))) return
    try {
      const r = await api.post<Card>(`/competencias/contratacao/${card.id}/complete`, {})
      toast.success(r.created_user ? `Usuário criado: ${r.created_user.email}` : 'Concluído')
      setOpen(null); load()
    } catch (e: unknown) { toast.error(apiMessage(e, 'Erro ao concluir')) }
  }

  const setForm = (card: Card, patch: Partial<HireForm>) => saveCard(card, { form: { ...card.form, ...patch } })
  const toggleRecurso = (card: Card, v: string) => {
    const has = card.form.recursos.includes(v)
    setForm(card, { recursos: has ? card.form.recursos.filter(x => x !== v) : [...card.form.recursos, v] })
  }
  async function lookupCep(card: Card, cepRaw: string) {
    const d = cepRaw.replace(/\D/g, '')
    if (d.length !== 8) return
    setCepLoading(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${d}/json/`)
      const data = await res.json()
      if (data.erro) { toast.error('CEP não encontrado'); return }
      setForm(card, { cep: cepRaw, logradouro: data.logradouro || '', bairro: data.bairro || '', cidade: data.localidade || '', estado: data.uf || '' })
    } catch { toast.error('Não foi possível buscar o CEP') } finally { setCepLoading(false) }
  }

  if (loading) return <AppLayout title="Contratação"><div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div></AppLayout>

  return (
    <AppLayout title="Contratação / Onboarding">
      <div className="flex justify-end mb-3">
        <button onClick={() => setShowNew(true)} className="ds-btn-primary flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg">
          <Plus size={15} /> Nova contratação
        </button>
      </div>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
        {buckets.map(b => (
          <div key={b.key} style={{ minWidth: 300, flex: '0 0 300px' }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>{b.label}</h3>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{b.cards.length}</span>
            </div>
            <div className="space-y-2">
              {b.cards.length === 0 && <div className="ds-card ds-card-pad" style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>—</div>}
              {b.cards.map(c => (
                <button key={c.id} onClick={() => setOpen(c)} className="ds-card ds-card-pad w-full text-left ds-row-hover" style={{ cursor: 'pointer' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={PRI[c.priority]?.cls ?? 'ds-status'} style={{ fontSize: 10 }}>{PRI[c.priority]?.label ?? c.priority}</span>
                    {c.completed_at && <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />}
                  </div>
                  <div className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>{c.title}</div>
                  <div className="flex items-center justify-between mt-2" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>✓ {c.checklist_done}/{c.checklist_total}</span>
                    {c.created_user && <span className="flex items-center gap-1" style={{ color: 'var(--success)' }}><UserIcon size={11} /> usuário criado</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {open && (
        <Modal open onClose={() => setOpen(null)} size="lg">
          <ModalHeader title={open.title} subtitle={open.respondent_phone ?? undefined} icon={UserPlus} onClose={() => setOpen(null)} />
          <ModalBody className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Cargo</div>
                <input className="ds-input" defaultValue={open.cargo ?? ''} placeholder="Ex.: Analista de Sistema" onBlur={e => saveCard(open, { cargo: e.target.value })} />
              </div>
              <div>
                <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Modalidade</div>
                <select className="ds-input" value={open.modalidade ?? ''} onChange={e => saveCard(open, { modalidade: e.target.value })}>
                  <option value="">— selecione —</option>
                  {modalidades.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Prioridade</div>
                <select className="ds-input" value={open.priority} onChange={e => saveCard(open, { priority: e.target.value })}>
                  {Object.entries(PRI).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <div className="text-sm mb-2" style={{ fontWeight: 600, color: 'var(--text)' }}>Checklist ({open.checklist_done}/{open.checklist_total})</div>
              <div className="space-y-1.5">
                {open.checklist.map((it, i) => (
                  <div key={i} className="flex items-center gap-2 group">
                    <input type="checkbox" checked={it.done} onChange={() => toggleItem(open, i)} style={{ cursor: 'pointer', flexShrink: 0 }} />
                    <input
                      key={`ci-${open.id}-${i}-${it.label}`}
                      className="ds-input text-sm"
                      defaultValue={it.label}
                      onBlur={e => editItemLabel(open, i, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      style={{ flex: 1, minWidth: 0, height: 32, padding: '4px 8px', textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--text-muted)' : 'var(--text)' }}
                    />
                    <button type="button" onClick={() => removeItem(open, i)} title="Remover item"
                      className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ flexShrink: 0, color: 'var(--text-muted)', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addItem(open)} className="ds-btn-secondary mt-2 flex items-center gap-1.5" style={{ fontSize: 13, padding: '4px 12px' }}>
                <Plus size={14} /> Adicionar item
              </button>
            </div>

            <div className="space-y-3" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>Script de passagem</div>

              <div>
                <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>E-mail ERPSERV <span style={{ color: 'var(--text-light)' }}>· será o login do usuário</span></div>
                <input key={`email-${open.id}`} className="ds-input" type="email" defaultValue={open.form.email} placeholder="nome@erpserv.com.br" onBlur={e => setForm(open, { email: e.target.value })} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Perfil</div>
                  <Pills options={[['consultor', 'Consultor'], ['coordenador', 'Coordenador']]}
                    value={open.form.perfil} onChange={v => setForm(open, { perfil: v || 'consultor', ...(v !== 'coordenador' ? { coordinator_type: '' } : {}) })} />
                </div>
                {open.form.perfil === 'coordenador' && (
                  <div>
                    <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Tipo de coordenação</div>
                    <Pills options={[['projetos', 'Projetos'], ['sustentacao', 'Sustentação']]} value={open.form.coordinator_type} onChange={v => setForm(open, { coordinator_type: v })} />
                  </div>
                )}
                <div>
                  <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Empresa base</div>
                  <Pills options={[['erpserv', 'ERPSERV'], ['bizify', 'Bizify']]} value={open.form.empresa} onChange={v => setForm(open, { empresa: v || 'erpserv' })} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Contratação fixa?</div>
                  <Pills options={[['sim', 'Sim'], ['nao', 'Não']]} value={open.form.contratacao_fixa} onChange={v => setForm(open, { contratacao_fixa: v })} />
                </div>
                <div>
                  <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Incluir no WhatsApp?</div>
                  <Pills options={[['sim', 'Sim'], ['nao', 'Não']]} value={open.form.incluir_whatsapp} onChange={v => setForm(open, { incluir_whatsapp: v })} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Tipo de consultor</div>
                  <Pills options={[['horista', 'Horista'], ['banco_de_horas', 'Banco de Horas'], ['fixo', 'Fixo']]}
                    value={open.form.consultant_type} onChange={v => setForm(open, { consultant_type: v, ...(v !== 'horista' ? { tem_garantia: '', guaranteed_hours: '' } : {}) })} />
                </div>
                <div>
                  <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Valor {open.form.consultant_type === 'horista' ? '(hora)' : open.form.consultant_type ? '(mensal)' : ''}</div>
                  <input key={`valor-${open.id}`} className="ds-input" defaultValue={open.form.valor} placeholder="R$ 0,00" onBlur={e => setForm(open, { valor: e.target.value })} />
                </div>
              </div>

              {open.form.consultant_type === 'horista' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Tem garantia de horas?</div>
                    <Pills options={[['sim', 'Sim'], ['nao', 'Não']]}
                      value={open.form.tem_garantia} onChange={v => setForm(open, { tem_garantia: v, ...(v !== 'sim' ? { guaranteed_hours: '' } : {}) })} />
                  </div>
                  {open.form.tem_garantia === 'sim' && (
                    <div>
                      <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Horas garantidas (mês)</div>
                      <input key={`gh-${open.id}`} className="ds-input" type="number" min={0} max={744} defaultValue={open.form.guaranteed_hours} placeholder="Ex.: 160" onBlur={e => setForm(open, { guaranteed_hours: e.target.value })} />
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Data de início</div>
                  <input key={`sd-${open.id}`} className="ds-input" type="date" defaultValue={open.form.start_date} onBlur={e => setForm(open, { start_date: e.target.value })} />
                  <div className="text-[11px] mt-1" style={{ color: 'var(--text-light)' }}>Entrada no meio do mês é calculada proporcionalmente aos dias úteis.</div>
                </div>
              </div>

              <div>
                <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Recursos a provisionar</div>
                <div className="flex gap-1.5 flex-wrap">
                  {recursos.map(r => {
                    const on = open.form.recursos.includes(r.value)
                    return (
                      <button key={r.value} type="button" onClick={() => toggleRecurso(open, r.value)}
                        className={on ? 'ds-filter-active' : 'ds-btn-secondary'} style={{ padding: '4px 12px', fontSize: 13 }}>{r.label}</button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>CPF</div>
                  <input key={`cpf-${open.id}`} className="ds-input" inputMode="numeric" placeholder="000.000.000-00" defaultValue={open.form.cpf} onBlur={e => setForm(open, { cpf: e.target.value })} />
                </div>
                <div>
                  <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Data de nascimento</div>
                  <input key={`nasc-${open.id}`} className="ds-input" type="date" defaultValue={open.form.nascimento} onBlur={e => setForm(open, { nascimento: e.target.value })} />
                </div>
                <div>
                  <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Matrícula</div>
                  <input key={`mat-${open.id}`} className="ds-input" placeholder="Ex.: 26434" defaultValue={open.form.matricula} onBlur={e => setForm(open, { matricula: e.target.value })} />
                </div>
              </div>

              <div>
                <div className="text-[12px] mb-1.5" style={{ color: 'var(--text)', fontWeight: 600 }}>Endereço</div>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                  <div className="md:col-span-2">
                    <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>CEP</div>
                    <div className="relative">
                      <input key={`cep-${open.id}`} className="ds-input" defaultValue={open.form.cep} placeholder="00000-000"
                        onBlur={e => lookupCep(open, e.target.value)} />
                      {cepLoading && <Loader2 size={15} className="animate-spin" style={{ position: 'absolute', right: 8, top: 9, color: 'var(--text-muted)' }} />}
                    </div>
                  </div>
                  <div className="md:col-span-4">
                    <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Logradouro</div>
                    <input key={`log-${open.id}-${open.form.logradouro}`} className="ds-input" defaultValue={open.form.logradouro} onBlur={e => setForm(open, { logradouro: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Número</div>
                    <input key={`num-${open.id}`} className="ds-input" defaultValue={open.form.numero} onBlur={e => setForm(open, { numero: e.target.value })} />
                  </div>
                  <div className="md:col-span-4">
                    <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Complemento</div>
                    <input key={`comp-${open.id}`} className="ds-input" defaultValue={open.form.complemento} onBlur={e => setForm(open, { complemento: e.target.value })} />
                  </div>
                  <div className="md:col-span-3">
                    <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Bairro</div>
                    <input key={`bai-${open.id}-${open.form.bairro}`} className="ds-input" defaultValue={open.form.bairro} onBlur={e => setForm(open, { bairro: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Cidade</div>
                    <input key={`cid-${open.id}-${open.form.cidade}`} className="ds-input" defaultValue={open.form.cidade} onBlur={e => setForm(open, { cidade: e.target.value })} />
                  </div>
                  <div className="md:col-span-1">
                    <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>UF</div>
                    <input key={`uf-${open.id}-${open.form.estado}`} className="ds-input" maxLength={2} defaultValue={open.form.estado} onBlur={e => setForm(open, { estado: e.target.value.toUpperCase() })} />
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Observação</div>
                <textarea key={`obs-${open.id}`} className="ds-input" rows={3} defaultValue={open.form.observacao} onBlur={e => setForm(open, { observacao: e.target.value })} />
              </div>
            </div>

            {open.created_user && (
              <div className="ds-card ds-card-pad ds-card-highlight-success" style={{ fontSize: 13 }}>
                ✓ Usuário criado: <strong>{open.created_user.name}</strong> · {open.created_user.email}
              </div>
            )}
          </ModalBody>
          <ModalFooter className="!justify-between">
            <div className="flex items-center gap-2">
              {open.bucket !== 'aguardando_assinatura' && <button className="ds-btn-secondary flex items-center gap-1" onClick={() => move(open, 'aguardando_assinatura')}><ArrowRight size={13} /> Aguardando</button>}
              {open.bucket !== 'em_andamento' && <button className="ds-btn-secondary flex items-center gap-1" onClick={() => move(open, 'em_andamento')}><ArrowRight size={13} /> Em andamento</button>}
              {open.bucket !== 'pausado' && <button className="ds-btn-secondary flex items-center gap-1" onClick={() => move(open, 'pausado')}><Pause size={13} /> Pausar</button>}
            </div>
            {open.bucket !== 'finalizado'
              ? <button className="ds-btn-primary flex items-center gap-2" onClick={() => complete(open)}><UserPlus size={15} /> Concluir e criar usuário</button>
              : <span className="ds-status-success">Finalizado</span>}
          </ModalFooter>
        </Modal>
      )}
      {confirmDialog}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={() => setShowNew(false)}>
          <div className="ds-card ds-card-pad w-full max-w-md" style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-1" style={{ color: 'var(--text)' }}>Nova contratação</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Incluir direto pela rotina, sem candidato do Banco de Competências. Entra em “Aguardando assinatura”.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Nome <span style={{ color: 'var(--danger-border)' }}>*</span></label>
                <input autoFocus value={nTitle} onChange={e => setNTitle(e.target.value)} placeholder="Nome da pessoa"
                  className="w-full text-sm rounded-lg px-3 py-2 outline-none" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Cargo</label>
                  <input value={nCargo} onChange={e => setNCargo(e.target.value)} placeholder="(opcional)"
                    className="w-full text-sm rounded-lg px-3 py-2 outline-none" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Modalidade</label>
                  <select value={nModal} onChange={e => setNModal(e.target.value)}
                    className="w-full text-sm rounded-lg px-2.5 py-2 outline-none" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                    <option value="">(opcional)</option>
                    {modalidades.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowNew(false)} className="text-sm px-3 py-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
              <button onClick={createHire} disabled={creating} className="ds-btn-primary text-sm px-4 py-2 rounded-lg disabled:opacity-50">{creating ? 'Incluindo…' : 'Incluir'}</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

function Pills({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(value === v ? '' : v)}
          className={value === v ? 'ds-filter-active' : 'ds-btn-secondary'} style={{ padding: '4px 14px', fontSize: 13 }}>{l}</button>
      ))}
    </div>
  )
}
