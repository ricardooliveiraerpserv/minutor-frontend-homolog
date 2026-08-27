'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader } from '@/components/ui/loading'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal'
import { UserFormModal } from '@/components/users/user-form-modal'
import { ArrowLeft, User as UserIcon, Mail, Phone, Link2, Building2, MapPin, Calendar, DollarSign, Filter, AlertTriangle, UserPlus, ArrowUp, ArrowDown, Plus, Minus, ChevronDown, ChevronRight, History } from 'lucide-react'

interface RadarPoint { category: string; avg_weight: number }
interface CatRow { category: string; avg_weight: number; total: number; with_knowledge: number }
interface SkillRow { category: string; name: string; level: string; weight: number }
interface HistoryRow { id: number; survey: string; matrix_version: string | null; submitted_at: string; answers_count: number }
type DiffDirection = 'added' | 'up' | 'down' | 'removed'
interface DiffChange { category: string | null; name: string | null; from_level: string | null; from_weight: number; to_level: string | null; to_weight: number; direction: DiffDirection }
interface DiffTransition { submission_id: number; submitted_at: string; previous_submitted_at: string; survey: string | null; matrix_version: string | null; total_changes: number; added: number; upgraded: number; downgraded: number; removed: number; changes: DiffChange[] }
interface DiffResponse { baseline: { submission_id: number; submitted_at: string; skills_count: number } | null; evaluations: number; transitions: DiffTransition[] }
interface Level { id: number; name: string; weight: number }
interface Profile {
  respondent: { id: number; name: string; type: string; classification: string | null; classification_label: string | null; blacklist: boolean; partner_id: string; partner_name: string | null; email: string | null; phone: string | null; valor: string | null; empresa: string | null; cargo: string | null; cidade: string | null; estado: string | null; linkedin: string | null; idiomas: string | null; cadastral: Record<string, unknown> }
  latest: { id: number; survey: string; matrix_version: string | null; submitted_at: string } | null
  history: HistoryRow[]
  radar: RadarPoint[]
  by_category: CatRow[]
  skills: SkillRow[]
  filters: { categories: string[]; levels: Level[]; classifications: { value: string; label: string }[]; partners: { value: string; label: string }[] }
}

const TYPE_LABEL: Record<string, string> = { internal: 'Interno', partner: 'Parceiro', candidate: 'Talento' }
const LEVEL_COLOR = (w: number) => w >= 4 ? 'var(--success)' : w >= 3 ? 'var(--primary)' : w >= 2 ? 'var(--warning)' : 'var(--text-muted)'
// Fundo tingido do badge de nível (mesma cor com baixa opacidade, theme-aware).
const levelBg = (w: number) => `color-mix(in srgb, ${LEVEL_COLOR(w)} 14%, transparent)`
const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
function fmtValor(v: string | null): string | null {
  if (!v) return null
  const s = String(v).trim()
  if (!/\d/.test(s)) return s // ex.: "Valor Não Informado"
  const n = s.includes(',')
    ? parseFloat(s.replace(/[^\d,]/g, '').replace(/\./g, '').replace(',', '.'))
    : parseFloat(s.replace(/\D/g, ''))
  return isNaN(n) ? s : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function PerfilProfissionalPage() {
  const params = useParams()
  const router = useRouter()
  const id = Number(params?.id)
  const [p, setP] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Voltar contextual: se veio de uma pesquisa (?back=...), o Voltar retorna pra lá.
  const [backHref, setBackHref] = useState('/competencias/dashboard')
  const [backLabel, setBackLabel] = useState('Voltar ao Dashboard')
  useEffect(() => {
    const b = new URLSearchParams(window.location.search).get('back')
    if (b && b.startsWith('/')) { setBackHref(b); setBackLabel('Voltar') }
  }, [])
  const [category, setCategory] = useState('')
  const [levelWeights, setLevelWeights] = useState<string[]>([])
  const [diff, setDiff] = useState<DiffResponse | null>(null)
  const [openDiff, setOpenDiff] = useState<Set<number>>(new Set())

  const load = useCallback(() => {
    if (!id) return
    setLoading(true); setError(null)
    const qs = new URLSearchParams()
    if (category) qs.set('category', category)
    if (levelWeights.length) qs.set('level_weights', levelWeights.join(','))
    api.get<Profile>(`/competencias/profissionais/${id}${qs.toString() ? '?' + qs : ''}`)
      .then(setP).catch(() => setError('Profissional não encontrado (o link pode ser antigo). Abra pelo Dashboard.')).finally(() => setLoading(false))
  }, [id, category, levelWeights])
  useEffect(() => { load() }, [load])

  // Evolução (diff entre avaliações) — independente dos filtros de área/nível.
  useEffect(() => {
    if (!id) return
    api.get<DiffResponse>(`/competencias/profissionais/${id}/historico-diff`)
      .then(d => { setDiff(d); setOpenDiff(new Set(d.transitions.slice(0, 1).map(t => t.submission_id))) })
      .catch(() => setDiff(null))
  }, [id])
  const toggleDiff = (sid: number) => setOpenDiff(prev => { const n = new Set(prev); n.has(sid) ? n.delete(sid) : n.add(sid); return n })

  const toggleLevel = (w: string) => setLevelWeights(prev => prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w])

  async function saveClassification(value: string) {
    if (!p) return
    const label = p.filters.classifications.find(c => c.value === value)?.label ?? null
    const keepPartner = value === 'parceiro'
    setP({ ...p, respondent: { ...p.respondent, classification: value || null, classification_label: label, blacklist: value === 'blacklist', partner_id: keepPartner ? p.respondent.partner_id : '', partner_name: keepPartner ? p.respondent.partner_name : null } })
    try { await api.put(`/competencias/profissionais/${id}/classification`, { classification: value || null }) }
    catch { toast.error('Erro ao classificar'); load() }
  }

  const [confirmHire, setConfirmHire] = useState(false)
  const [hiring, setHiring] = useState(false)
  // Parceiro: contratação NÃO passa pelo kanban — cria o usuário parceiro direto (form reusado).
  const [showPartnerUser, setShowPartnerUser] = useState(false)
  async function doContratar() {
    setHiring(true)
    try {
      await api.post('/competencias/contratacao/hire', { respondent_id: id })
      toast.success('Contratação iniciada — enviado ao kanban')
      router.push('/competencias/contratacao')
    } catch { toast.error('Erro ao contratar'); setHiring(false) }
  }

  async function savePartner(partnerId: string) {
    if (!p) return
    const name = p.filters.partners.find(x => x.value === partnerId)?.label ?? null
    setP({ ...p, respondent: { ...p.respondent, partner_id: partnerId, partner_name: name } })
    try { await api.put(`/competencias/profissionais/${id}/classification`, { classification: 'parceiro', partner_id: partnerId || null }) }
    catch { toast.error('Erro ao vincular parceiro'); load() }
  }

  const skillsByCat = useMemo(() => {
    const m = new Map<string, SkillRow[]>()
    p?.skills.forEach(s => { const a = m.get(s.category) ?? []; a.push(s); m.set(s.category, a) })
    // Dentro da categoria, os mais fortes primeiro (Especialista→Sênior→Pleno→Júnior), depois A→Z.
    return Array.from(m.entries()).map(([cat, items]) =>
      [cat, [...items].sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name, 'pt-BR'))] as [string, SkillRow[]])
  }, [p])

  // Escala de níveis (nome↔peso) pra legenda, ordenada do maior pro menor.
  const levelScale = useMemo(() => {
    const seen = new Map<number, string>()
    p?.skills.forEach(s => { if (!seen.has(s.weight)) seen.set(s.weight, s.level) })
    return Array.from(seen.entries()).map(([weight, name]) => ({ weight, name })).sort((a, b) => b.weight - a.weight)
  }, [p])

  if (loading) return <AppLayout title="Perfil"><div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div></AppLayout>
  if (error || !p) return (
    <AppLayout title="Perfil">
      <div className="space-y-3">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--primary)' }}><ArrowLeft size={14} /> {backLabel}</Link>
        <div className="ds-card ds-card-pad ds-card-highlight-danger flex items-center gap-2">
          <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
          <p className="text-sm" style={{ color: 'var(--text)' }}>{error ?? 'Profissional não encontrado.'}</p>
        </div>
      </div>
    </AppLayout>
  )

  const r = p.respondent
  return (
    <AppLayout title={r.name}>
      <div className="space-y-4">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--primary)' }}><ArrowLeft size={14} /> {backLabel}</Link>

        {/* Cabeçalho */}
        <div className={`ds-card ds-card-pad${r.blacklist ? ' ds-card-highlight-danger' : ''}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
            <span className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: r.blacklist ? 'var(--danger)' : 'var(--primary-soft)', color: r.blacklist ? 'var(--danger-fg, #fff)' : 'var(--primary)' }}>{r.blacklist ? <AlertTriangle size={22} /> : <UserIcon size={22} />}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base" style={{ fontWeight: 700, color: 'var(--text)' }}>{r.name}</h2>
                <span className="ds-status-info" style={{ fontSize: 10 }}>{TYPE_LABEL[r.type] ?? r.type}</span>
                <select value={r.classification ?? ''} onChange={e => saveClassification(e.target.value)} title="Classificação (clique p/ alterar)"
                  className={r.blacklist ? 'ds-status-danger' : 'ds-status'} style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}>
                  <option value="">Classificar…</option>
                  {p.filters.classifications.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                {r.classification === 'parceiro' && (
                  <select value={r.partner_id ?? ''} onChange={e => savePartner(e.target.value)} title="Empresa parceira"
                    className="ds-status-info" style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}>
                    <option value="">Empresa parceira…</option>
                    {p.filters.partners.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                  </select>
                )}
                {r.classification !== 'erpserv' && (
                  <button className="ds-btn-primary flex items-center gap-1" style={{ padding: '4px 12px', fontSize: 12 }}
                    onClick={() => (r.type === 'partner' || r.classification === 'parceiro') ? setShowPartnerUser(true) : setConfirmHire(true)}>
                    <UserPlus size={13} /> Contratar
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {r.cargo && <span className="flex items-center gap-1"><UserIcon size={12} /> {r.cargo}</span>}
                {r.empresa && <span className="flex items-center gap-1"><Building2 size={12} /> {r.empresa}</span>}
                {(r.cidade || r.estado) && <span className="flex items-center gap-1"><MapPin size={12} /> {[r.cidade, r.estado].filter(Boolean).join(' / ')}</span>}
                {r.email && <span className="flex items-center gap-1"><Mail size={12} /> {r.email}</span>}
                {r.phone && <span className="flex items-center gap-1"><Phone size={12} /> {r.phone}</span>}
                {r.linkedin && <a href={String(r.linkedin)} target="_blank" rel="noreferrer" className="flex items-center gap-1" style={{ color: 'var(--primary)' }}><Link2 size={12} /> LinkedIn</a>}
              </div>
              {p.latest && (
                <div className="flex items-center gap-1 mt-2" style={{ fontSize: 11, color: 'var(--text-light)' }}>
                  <Calendar size={11} /> Última avaliação {fmt(p.latest.submitted_at)}{p.latest.matrix_version ? ` · matriz ${p.latest.matrix_version}` : ''}
                </div>
              )}
              {r.idiomas && <div className="mt-1" style={{ fontSize: 12, color: 'var(--text-muted)' }}><strong>Idiomas:</strong> {r.idiomas}</div>}
            </div>
            </div>
            {r.valor && (
              <div className="shrink-0 text-center" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '12px 20px', minWidth: 140, background: 'var(--surface-hover)' }}>
                <div className="flex items-center justify-center gap-1" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}><DollarSign size={11} /> Valor Hora / Fixo</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)', marginTop: 4 }}>{fmtValor(r.valor)}</div>
              </div>
            )}
          </div>
        </div>

        {/* Radar + Resumo por categoria */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="ds-card ds-card-pad">
            <h3 className="text-sm mb-2" style={{ fontWeight: 600, color: 'var(--text)' }}>Radar de competências</h3>
            {p.radar.length >= 3 ? <Radar data={p.radar} /> : <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Radar disponível a partir de 3 categorias.</p>}
          </div>
          <div className="ds-card ds-card-pad">
            <h3 className="text-sm mb-3" style={{ fontWeight: 600, color: 'var(--text)' }}>Resumo por categoria</h3>
            <div className="space-y-2">
              {p.by_category.map(c => (
                <div key={c.category}>
                  <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--text)' }}>{c.category}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{c.avg_weight.toFixed(1)}/4 · {c.with_knowledge}/{c.total}</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--surface-hover)', borderRadius: 999, overflow: 'hidden', marginTop: 3 }}>
                    <div style={{ width: `${c.avg_weight / 4 * 100}%`, height: '100%', background: 'var(--primary)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Filtros da lista de competências */}
        <div className="ds-card ds-card-pad">
          <div className="flex items-center gap-2 mb-2"><Filter size={14} style={{ color: 'var(--primary)' }} /><span className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>Filtrar competências</span></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Área de conhecimento</div>
              <select className="ds-input" value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">Todas</option>
                {p.filters.categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Nível <span style={{ color: 'var(--text-light)' }}>(um ou mais)</span></div>
              <div className="flex flex-wrap gap-1.5">
                {p.filters.levels.map(l => {
                  const on = levelWeights.includes(String(l.weight))
                  return <button key={l.weight} type="button" onClick={() => toggleLevel(String(l.weight))} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary-soft)' : 'transparent', color: on ? 'var(--primary)' : 'var(--text-muted)', fontWeight: on ? 600 : 400 }}>{l.name}</button>
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Competências declaradas */}
        <div className="ds-card ds-card-pad">
          <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-2 mb-3">
            <h3 className="text-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>
              Competências declaradas <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({p.skills.length})</span>
            </h3>
            {levelScale.length > 0 && (
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
                {levelScale.map(l => (
                  <span key={l.weight} className="inline-flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: LEVEL_COLOR(l.weight), display: 'inline-block' }} />
                    {l.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          {p.skills.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma competência com conhecimento declarado.</p>}
          <div className="space-y-4">
            {skillsByCat.map(([cat, items]) => (
              <div key={cat}>
                <div className="flex items-baseline gap-2 mb-2">
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{cat}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-light)', fontWeight: 600 }}>{items.length}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {items.map(s => (
                    <span key={s.name} className="inline-flex items-center gap-2"
                      style={{ fontSize: 12.5, padding: '4px 6px 4px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
                      {s.name}
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 5, color: LEVEL_COLOR(s.weight), background: levelBg(s.weight), whiteSpace: 'nowrap' }}>
                        {s.level}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Evolução das competências (diff entre avaliações) — só admin */}
        {diff && diff.transitions.length > 0 && (
          <div className="ds-card ds-card-pad">
            <h3 className="text-sm mb-1 flex items-center gap-2" style={{ fontWeight: 600, color: 'var(--text)' }}>
              <History size={15} style={{ color: 'var(--primary)' }} /> Evolução das competências
            </h3>
            <p style={{ fontSize: 11.5, color: 'var(--text-light)', marginBottom: 12 }}>
              O que mudou de uma atualização para a anterior ({diff.evaluations} avaliações registradas).
            </p>
            <div className="space-y-2">
              {diff.transitions.map(t => {
                const open = openDiff.has(t.submission_id)
                return (
                  <div key={t.submission_id} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <button onClick={() => toggleDiff(t.submission_id)} className="w-full flex items-center justify-between gap-3 px-3 py-2 ds-row-hover" style={{ background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                      <span className="flex items-center gap-2 min-w-0">
                        {open ? <ChevronDown size={15} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={15} style={{ color: 'var(--text-muted)' }} />}
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{fmt(t.submitted_at)}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-light)' }}>← {fmt(t.previous_submitted_at)}</span>
                      </span>
                      <span className="flex items-center gap-2" style={{ fontSize: 11, flexShrink: 0 }}>
                        {t.added > 0 && <span style={{ color: 'var(--success)' }}>+{t.added} nova{t.added > 1 ? 's' : ''}</span>}
                        {t.upgraded > 0 && <span style={{ color: 'var(--primary)' }}>↑{t.upgraded}</span>}
                        {t.downgraded > 0 && <span style={{ color: 'var(--warning)' }}>↓{t.downgraded}</span>}
                        {t.removed > 0 && <span style={{ color: 'var(--text-muted)' }}>−{t.removed}</span>}
                        {t.total_changes === 0 && <span style={{ color: 'var(--text-light)' }}>sem mudanças</span>}
                      </span>
                    </button>
                    {open && t.changes.length > 0 && (
                      <div style={{ borderTop: '1px solid var(--border)' }}>
                        {t.changes.map((c, i) => (
                          <div key={i} className="flex items-center justify-between gap-3 px-3 py-1.5" style={{ borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 12.5 }}>
                            <span className="flex items-center gap-2 min-w-0">
                              <DiffIcon dir={c.direction} />
                              <span style={{ color: 'var(--text)' }}>{c.name}</span>
                              <span style={{ color: 'var(--text-light)', fontSize: 11 }}>· {c.category}</span>
                            </span>
                            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', flexShrink: 0 }}>
                              {c.direction === 'added'
                                ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>{c.to_level}</span>
                                : c.direction === 'removed'
                                  ? <><span style={{ textDecoration: 'line-through' }}>{c.from_level}</span> → Nenhum</>
                                  : <><span>{c.from_level}</span> → <span style={{ color: c.direction === 'up' ? 'var(--primary)' : 'var(--warning)', fontWeight: 600 }}>{c.to_level}</span></>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {diff.baseline && (
                <div className="px-3 py-2" style={{ fontSize: 11.5, color: 'var(--text-light)' }}>
                  1ª avaliação em {fmt(diff.baseline.submitted_at)} — {diff.baseline.skills_count} competências declaradas.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Histórico (imutável) */}
        <div className="ds-card ds-card-pad">
          <h3 className="text-sm mb-3" style={{ fontWeight: 600, color: 'var(--text)' }}>Histórico de avaliações</h3>
          <div className="divide-y">
            {p.history.map(h => (
              <div key={h.id} className="flex items-center justify-between py-2" style={{ borderTop: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--text)' }}>{h.survey}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{h.matrix_version ?? ''} · {h.answers_count} respostas · {fmt(h.submitted_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {confirmHire && (
        <Modal open onClose={() => !hiring && setConfirmHire(false)} size="sm">
          <ModalHeader title="Contratar profissional" icon={UserPlus} onClose={() => !hiring && setConfirmHire(false)} />
          <ModalBody>
            <p className="text-sm" style={{ color: 'var(--text)' }}>
              Iniciar a contratação de <strong>{r.name}</strong>?
            </p>
            <ul className="mt-3 space-y-1.5" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              <li className="flex items-center gap-2"><UserPlus size={13} style={{ color: 'var(--primary)' }} /> Cria um card no <strong>kanban de Contratação</strong> (onboarding)</li>
              <li className="flex items-center gap-2"><ArrowLeft size={13} style={{ color: 'var(--primary)', transform: 'rotate(180deg)' }} /> A classificação passa a ser <strong>ERPSERV</strong></li>
              <li className="flex items-center gap-2"><Calendar size={13} style={{ color: 'var(--primary)' }} /> Ao concluir o checklist, o <strong>usuário é criado</strong></li>
            </ul>
          </ModalBody>
          <ModalFooter>
            <button className="ds-btn-secondary" disabled={hiring} onClick={() => setConfirmHire(false)}>Cancelar</button>
            <button className="ds-btn-primary flex items-center gap-2" disabled={hiring} onClick={doContratar}><UserPlus size={15} /> {hiring ? 'Contratando…' : 'Contratar'}</button>
          </ModalFooter>
        </Modal>
      )}

      {/* Parceiro: cria o usuário parceiro DIRETO (form do cadastro de usuários, sem kanban),
          já pré-preenchido. O valor/hora segue a regra do parceiro: preço único (fixed) herda,
          diferente (variable) é informado no próprio form. */}
      {showPartnerUser && (
        <UserFormModal
          open
          userId={null}
          prefill={{
            name: r.name,
            email: r.email ?? '',
            phone: r.phone ?? '',
            profiles: ['parceiro_adm' as const],
            partner_id: r.partner_id ? Number(r.partner_id) : '',
          }}
          onClose={() => setShowPartnerUser(false)}
          onSaved={() => { setShowPartnerUser(false); toast.success('Usuário parceiro criado') }}
        />
      )}
    </AppLayout>
  )
}

function DiffIcon({ dir }: { dir: DiffDirection }) {
  if (dir === 'added') return <Plus size={13} style={{ color: 'var(--success)', flexShrink: 0 }} />
  if (dir === 'removed') return <Minus size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
  if (dir === 'up') return <ArrowUp size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />
  return <ArrowDown size={13} style={{ color: 'var(--warning)', flexShrink: 0 }} />
}

/** Radar SVG dependency-free, theme-aware (0..4 por eixo). */
function Radar({ data }: { data: RadarPoint[] }) {
  const size = 300, cx = size / 2, cy = size / 2, R = 92
  const n = data.length
  const angle = (i: number) => -Math.PI / 2 + i * 2 * Math.PI / n
  const pt = (i: number, v: number) => {
    const rr = Math.max(0, Math.min(1, v / 4)) * R
    return [cx + rr * Math.cos(angle(i)), cy + rr * Math.sin(angle(i))]
  }
  const rings = [1, 2, 3, 4]
  const polygon = (r: number) => Array.from({ length: n }, (_, i) => {
    const x = cx + r * Math.cos(angle(i)), y = cy + r * Math.sin(angle(i)); return `${x},${y}`
  }).join(' ')
  const valuePoints = data.map((d, i) => pt(i, d.avg_weight).join(',')).join(' ')

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: 340, display: 'block', margin: '0 auto', overflow: 'visible' }}>
      {rings.map(lvl => (
        <polygon key={lvl} points={polygon(lvl / 4 * R)} fill="none" stroke="var(--border)" strokeWidth={1} />
      ))}
      {data.map((_, i) => {
        const [x, y] = pt(i, 4)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth={1} />
      })}
      <polygon points={valuePoints} fill="var(--primary)" fillOpacity={0.18} stroke="var(--primary)" strokeWidth={2} />
      {data.map((d, i) => {
        const [x, y] = pt(i, d.avg_weight)
        return <circle key={i} cx={x} cy={y} r={3} fill="var(--primary)" />
      })}
      {data.map((d, i) => {
        const [lx, ly] = [cx + (R + 14) * Math.cos(angle(i)), cy + (R + 14) * Math.sin(angle(i))]
        const anchor = Math.abs(Math.cos(angle(i))) < 0.3 ? 'middle' : (Math.cos(angle(i)) > 0 ? 'start' : 'end')
        return <text key={i} x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" style={{ fontSize: 10, fill: 'var(--text-muted)' }}>{d.category}</text>
      })}
    </svg>
  )
}
