'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader } from '@/components/ui/loading'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal'
import { ArrowLeft, User as UserIcon, Mail, Phone, Link2, Building2, MapPin, Calendar, DollarSign, Filter, AlertTriangle, UserPlus } from 'lucide-react'

interface RadarPoint { category: string; avg_weight: number }
interface CatRow { category: string; avg_weight: number; total: number; with_knowledge: number }
interface SkillRow { category: string; name: string; level: string; weight: number }
interface HistoryRow { id: number; survey: string; matrix_version: string | null; submitted_at: string; answers_count: number }
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
  const [category, setCategory] = useState('')
  const [levelWeights, setLevelWeights] = useState<string[]>([])

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
    return Array.from(m.entries())
  }, [p])

  if (loading) return <AppLayout title="Perfil"><div className="ds-card ds-card-pad"><SectionLoader label="Carregando…" /></div></AppLayout>
  if (error || !p) return (
    <AppLayout title="Perfil">
      <div className="space-y-3">
        <Link href="/competencias/dashboard" className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--primary)' }}><ArrowLeft size={14} /> Voltar ao Dashboard</Link>
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
        <Link href="/competencias/dashboard" className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--primary)' }}><ArrowLeft size={14} /> Voltar ao Dashboard</Link>

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
                  <button className="ds-btn-primary flex items-center gap-1" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setConfirmHire(true)}><UserPlus size={13} /> Contratar</button>
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
          <h3 className="text-sm mb-3" style={{ fontWeight: 600, color: 'var(--text)' }}>Competências declaradas <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({p.skills.length})</span></h3>
          {p.skills.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma competência com conhecimento declarado.</p>}
          <div className="space-y-3">
            {skillsByCat.map(([cat, items]) => (
              <div key={cat}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{cat}</div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map(s => (
                    <span key={s.name} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, border: `1px solid var(--border)`, color: 'var(--text)' }}>
                      {s.name} <span style={{ color: LEVEL_COLOR(s.weight), fontWeight: 600 }}>· {s.level}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

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
    </AppLayout>
  )
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
