'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { SectionLoader } from '@/components/ui/loading'
import {
  ArrowLeft, ArrowRight, Check, User as UserIcon, Briefcase,
  Star, Send, CheckCircle2, Search,
} from 'lucide-react'

interface Skill { id: number; name: string; category: string; type: string }
interface SkillLevel { id: number; name: string; weight: number }

const STEPS = [
  { id: 1, label: 'Identificação', icon: UserIcon },
  { id: 2, label: 'Experiência',    icon: Briefcase },
  { id: 3, label: 'Skills',         icon: Star },
  { id: 4, label: 'Finalização',    icon: Send },
] as const
type StepId = 1 | 2 | 3 | 4

const SEGMENTS  = ['Indústria', 'Serviços', 'Varejo', 'Saúde', 'Educação', 'Financeiro', 'Pública', 'Agronegócio', 'Outros'] as const
const WORK_MODELS = ['PJ', 'CLT', 'Freelancer', 'Hibrido'] as const

// Categorias de skills "Tecnologias comuns" que sempre aparecem em Step 3
const COMMON_TECH_CATS = ['Banco de Dados', 'Linguagem', 'Ferramentas', 'Backend', 'Frontend', 'Infra']

export default function CandidatoCadastroPage() {
  const [step, setStep]       = useState<StepId>(1)
  const [skills, setSkills]   = useState<Skill[]>([])
  const [levels, setLevels]   = useState<SkillLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [doneId, setDoneId]   = useState<number | null>(null)
  const [moduleSearch, setModuleSearch] = useState('')

  const [form, setForm] = useState({
    // Step 1
    name: '', email: '', phone: '',
    city: '', state: '',
    linkedin_url: '',
    // Step 2
    protheus_years_experience: '' as string,
    protheus_modules: [] as number[], // skill_ids dos protheus selecionados
    // Step 3 — map: skill_id → level_id ou null
    skill_levels: {} as Record<number, number | null>,
    // Step 4
    relevant_projects: '',
    segments: [] as string[],
    work_model: '' as '' | (typeof WORK_MODELS)[number],
    hourly_rate: '' as string,
    availability_status: '' as '' | 'integral' | 'parcial' | 'indisponivel',
    hours_available: '' as string,
    availability_start_date: '',
  })

  useEffect(() => {
    setLoading(true)
    ;(async () => {
      try {
        const r = await api.get<{ skills: Skill[]; levels: SkillLevel[] }>('/candidates/form-data')
        setSkills(r.skills ?? [])
        setLevels(r.levels ?? [])
      } catch {
        toast.error('Erro ao carregar dados do formulário')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const protheusSkills = useMemo(() => skills.filter(s => s.category === 'Protheus'), [skills])
  const techSkills     = useMemo(() => skills.filter(s => COMMON_TECH_CATS.includes(s.category)).slice(0, 20), [skills])

  const filteredProtheus = useMemo(() => {
    if (!moduleSearch.trim()) return protheusSkills
    const q = moduleSearch.trim().toLowerCase()
    return protheusSkills.filter(s => s.name.toLowerCase().includes(q))
  }, [protheusSkills, moduleSearch])

  const progress = useMemo(() => {
    let n = 0, total = 4
    if (form.name && form.email) n++
    if (form.protheus_years_experience !== '' || form.protheus_modules.length > 0) n++
    if (Object.values(form.skill_levels).some(l => l && l > 0)) n++
    if (form.availability_status || form.work_model || form.relevant_projects) n++
    return Math.round((n / total) * 100)
  }, [form])

  // ── Validação simples por step ──────────────────────────────────────────────
  function canAdvance(): boolean {
    if (step === 1) return !!form.name && !!form.email
    return true
  }

  function next() {
    if (!canAdvance()) {
      toast.error('Preencha nome e e-mail antes de continuar.')
      return
    }
    setStep((Math.min(4, step + 1) as StepId))
  }
  function prev() { setStep((Math.max(1, step - 1) as StepId)) }

  function toggleModule(id: number) {
    const cur = form.protheus_modules
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
    setForm({ ...form, protheus_modules: next })
  }
  function toggleSegment(s: string) {
    const cur = form.segments
    const next = cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s]
    setForm({ ...form, segments: next })
  }
  function setSkillLevel(skillId: number, levelId: number | null) {
    setForm(f => ({ ...f, skill_levels: { ...f.skill_levels, [skillId]: levelId } }))
  }

  async function submit() {
    if (!form.name || !form.email) {
      toast.error('Nome e e-mail são obrigatórios.')
      setStep(1); return
    }
    setSubmitting(true)
    try {
      const skillsArr = Object.entries(form.skill_levels)
        .filter(([_, lid]) => lid && lid > 0)
        .map(([sid, lid]) => ({ skill_id: Number(sid), level_id: lid as number }))

      const payload: any = {
        name: form.name,
        email: form.email,
        skills: skillsArr,
      }
      if (form.phone)         payload.phone = form.phone
      if (form.city)          payload.city = form.city
      if (form.state)         payload.state = form.state.toUpperCase()
      if (form.linkedin_url)  payload.linkedin_url = form.linkedin_url
      if (form.work_model)    payload.work_model = form.work_model
      if (form.relevant_projects) payload.relevant_projects = form.relevant_projects
      if (form.segments.length)   payload.segments = form.segments
      if (form.protheus_modules.length) payload.protheus_modules = form.protheus_modules
      if (form.availability_status)     payload.availability_status = form.availability_status
      if (form.availability_start_date) payload.availability_start_date = form.availability_start_date
      const py = parseInt(form.protheus_years_experience, 10)
      if (!isNaN(py)) payload.protheus_years_experience = py
      const hr = parseFloat(form.hourly_rate)
      if (!isNaN(hr)) payload.hourly_rate = hr
      const ha = parseInt(form.hours_available, 10)
      if (!isNaN(ha)) payload.hours_available = ha

      const r = await api.post<{ id: number; message: string }>('/candidates', payload)
      setDoneId(r.id)
    } catch (e: any) {
      const msg = e?.data?.errors?.email?.[0] || e?.message || 'Erro ao enviar perfil'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render: success screen ────────────────────────────────────────────────
  if (doneId !== null) {
    return (
      <PublicShell>
        <div className="ds-card ds-card-pad" style={{ textAlign: 'center', padding: 40 }}>
          <CheckCircle2 size={56} style={{ color: 'var(--success-border)', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            Perfil recebido!
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Obrigado pelo cadastro. Nossa equipe vai analisar seu perfil e entrar em contato
            caso encontremos uma oportunidade compatível.
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-light)' }}>
            ID do cadastro: <code>{doneId}</code>
          </p>
        </div>
      </PublicShell>
    )
  }

  return (
    <PublicShell>
      {/* Progress + header */}
      <div className="ds-card ds-card-pad">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              Cadastro de Candidato
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              ⏱ Tempo estimado: 5 min · Apenas dados essenciais para avaliação rápida
            </p>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Preenchido: <strong style={{ color: 'var(--text)' }}>{progress}%</strong>
          </span>
        </div>
        <div style={{ background: 'var(--border)', height: 6, borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            width: `${progress}%`, height: '100%',
            background: 'var(--primary)', transition: 'width 200ms ease',
          }} />
        </div>
        <div className="flex items-center gap-1.5 mt-4 flex-wrap">
          {STEPS.map(s => {
            const active = step === s.id
            const done = step > s.id
            return (
              <span
                key={s.id}
                className="flex items-center gap-1.5"
                style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 4, border: '1px solid',
                  background: active ? 'var(--primary-soft)' : 'transparent',
                  borderColor: active ? 'var(--primary)' : done ? 'var(--success-border)' : 'var(--border)',
                  color: active ? 'var(--primary)' : done ? 'var(--success)' : 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                {done ? <Check size={11} /> : <s.icon size={11} />}
                {s.id}. {s.label}
              </span>
            )
          })}
        </div>
      </div>

      {loading && (
        <div className="ds-card ds-card-pad">
          <SectionLoader />
        </div>
      )}

      {/* Step 1 */}
      {!loading && step === 1 && (
        <div className="ds-card ds-card-pad">
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Identificação</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Como podemos te contactar?
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Nome completo *">
              <input className="ds-input w-full" value={form.name}
                     onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="E-mail *">
              <input className="ds-input w-full" type="email" value={form.email}
                     onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Telefone">
              <input className="ds-input w-full" value={form.phone}
                     onChange={(e) => setForm({ ...form, phone: e.target.value })}
                     placeholder="(11) 99999-9999" />
            </Field>
            <Field label="LinkedIn (URL)">
              <input className="ds-input w-full" type="url" value={form.linkedin_url}
                     onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
                     placeholder="https://linkedin.com/in/seu-perfil" />
            </Field>
            <Field label="Cidade">
              <input className="ds-input w-full" value={form.city}
                     onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label="UF">
              <input className="ds-input w-full" maxLength={2} value={form.state}
                     onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
                     placeholder="SP" style={{ textTransform: 'uppercase' }} />
            </Field>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {!loading && step === 2 && (
        <div className="ds-card ds-card-pad">
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Experiência</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Conta um pouco sobre sua trajetória com Protheus.
          </p>

          <Field label="Anos de experiência com Protheus">
            <input className="ds-input" type="number" min={0} max={50}
                   value={form.protheus_years_experience}
                   onChange={(e) => setForm({ ...form, protheus_years_experience: e.target.value })}
                   placeholder="ex: 5" style={{ width: 120 }} />
          </Field>

          <div style={{ marginTop: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              Módulos principais que você conhece ({form.protheus_modules.length} selecionados)
            </label>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
              <input
                className="ds-input"
                style={{ paddingLeft: 28, width: '100%' }}
                placeholder="Buscar módulo (ex: SIGAFIN)…"
                value={moduleSearch}
                onChange={(e) => setModuleSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1.5" style={{ maxHeight: 240, overflowY: 'auto', padding: 4 }}>
              {filteredProtheus.map(sk => {
                const on = form.protheus_modules.includes(sk.id)
                return (
                  <button
                    key={sk.id}
                    type="button"
                    onClick={() => toggleModule(sk.id)}
                    style={{
                      fontSize: 11, padding: '4px 10px', borderRadius: 3,
                      background: on ? 'var(--primary-soft)' : 'transparent',
                      border: '1px solid',
                      borderColor: on ? 'var(--primary)' : 'var(--border)',
                      color: on ? 'var(--primary)' : 'var(--text)',
                      fontWeight: on ? 600 : 500, cursor: 'pointer',
                    }}
                  >
                    {sk.name}
                  </button>
                )
              })}
              {filteredProtheus.length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Nenhum módulo encontrado.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {!loading && step === 3 && (
        <div className="ds-card ds-card-pad">
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Skills</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Para cada item, indique seu nível. Pule o que não conhece.
          </p>

          {form.protheus_modules.length > 0 && (
            <SkillsSection
              title="Módulos Protheus selecionados"
              items={skills.filter(s => form.protheus_modules.includes(s.id))}
              levels={levels}
              skillLevels={form.skill_levels}
              onChange={setSkillLevel}
            />
          )}

          <SkillsSection
            title="Tecnologias comuns"
            items={techSkills}
            levels={levels}
            skillLevels={form.skill_levels}
            onChange={setSkillLevel}
          />
        </div>
      )}

      {/* Step 4 */}
      {!loading && step === 4 && (
        <div className="ds-card ds-card-pad">
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Finalização</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Últimas informações pra fechar o perfil.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Projeto relevante">
              <textarea className="ds-input w-full" rows={3}
                value={form.relevant_projects}
                onChange={(e) => setForm({ ...form, relevant_projects: e.target.value })}
                placeholder="Um projeto recente onde você atuou (cliente, módulo, papel, duração)…" />
            </Field>

            <Field label="Segmentos com experiência">
              <div className="flex flex-wrap gap-1.5">
                {SEGMENTS.map(s => {
                  const on = form.segments.includes(s)
                  return (
                    <button key={s} type="button" onClick={() => toggleSegment(s)}
                      style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 3,
                        background: on ? 'var(--primary-soft)' : 'transparent',
                        border: '1px solid', borderColor: on ? 'var(--primary)' : 'var(--border)',
                        color: on ? 'var(--primary)' : 'var(--text)',
                        fontWeight: on ? 600 : 500, cursor: 'pointer',
                      }}>
                      {s}
                    </button>
                  )
                })}
              </div>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Modelo de trabalho">
                <select className="ds-input w-full" value={form.work_model}
                  onChange={(e) => setForm({ ...form, work_model: e.target.value as any })}>
                  <option value="">— escolha —</option>
                  {WORK_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Valor hora (R$, opcional)">
                <input className="ds-input w-full" type="number" min={0} step={1}
                  value={form.hourly_rate}
                  onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                  placeholder="ex: 180" />
              </Field>
            </div>

            <Field label="Disponibilidade">
              <div className="flex gap-2 flex-wrap">
                {(['integral','parcial','indisponivel'] as const).map(s => {
                  const on = form.availability_status === s
                  const label = s === 'integral' ? 'Integral' : s === 'parcial' ? 'Parcial' : 'Indisponível'
                  return (
                    <button key={s} type="button"
                      onClick={() => setForm({ ...form, availability_status: s })}
                      style={{
                        fontSize: 12, padding: '6px 14px', borderRadius: 4,
                        background: on ? 'var(--primary-soft)' : 'transparent',
                        border: '1px solid', borderColor: on ? 'var(--primary)' : 'var(--border)',
                        color: on ? 'var(--primary)' : 'var(--text)',
                        fontWeight: on ? 600 : 500, cursor: 'pointer',
                      }}>
                      {label}
                    </button>
                  )
                })}
              </div>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Horas/mês disponíveis">
                <input className="ds-input w-full" type="number" min={0} max={240}
                  value={form.hours_available}
                  onChange={(e) => setForm({ ...form, hours_available: e.target.value })}
                  disabled={form.availability_status === 'indisponivel'}
                  placeholder="ex: 160" />
              </Field>
              <Field label="Data de início">
                <input className="ds-input w-full" type="date"
                  value={form.availability_start_date}
                  onChange={(e) => setForm({ ...form, availability_start_date: e.target.value })} />
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* Footer com navegação */}
      <div className="ds-card ds-card-pad flex items-center justify-between gap-3 flex-wrap">
        <button type="button" disabled={step === 1 || submitting} onClick={prev}
          style={navBtnStyle(step === 1 || submitting)}>
          <ArrowLeft size={12} /> Anterior
        </button>

        {step < 4 ? (
          <button type="button" className="ds-btn-primary" disabled={submitting} onClick={next}
            style={{ fontSize: 12, padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Próximo <ArrowRight size={12} />
          </button>
        ) : (
          <button type="button" className="ds-btn-primary" disabled={submitting} onClick={submit}
            style={{ fontSize: 12, padding: '8px 18px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Send size={12} /> {submitting ? 'Enviando…' : 'Enviar perfil'}
          </button>
        )}
      </div>
    </PublicShell>
  )
}

// ── Componentes auxiliares ────────────────────────────────────────────────────
function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    fontSize: 12, padding: '8px 14px', borderRadius: 4,
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'transparent', border: '1px solid var(--border)',
    color: disabled ? 'var(--text-muted)' : 'var(--text)',
    fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function SkillsSection({
  title, items, levels, skillLevels, onChange,
}: {
  title: string
  items: Skill[]
  levels: SkillLevel[]
  skillLevels: Record<number, number | null>
  onChange: (skillId: number, levelId: number | null) => void
}) {
  if (items.length === 0) return null
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{
        fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
        letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8,
      }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(sk => (
          <div key={sk.id}
            style={{
              padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              background: skillLevels[sk.id] ? 'var(--surface-hover, transparent)' : 'transparent',
            }}>
            <span className="text-sm" style={{
              color: 'var(--text)',
              fontWeight: skillLevels[sk.id] ? 600 : 500,
            }}>
              {sk.name}
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>
                {sk.category}
              </span>
            </span>
            <select className="ds-input" style={{ minWidth: 160 }}
              value={skillLevels[sk.id] ?? ''}
              onChange={(e) => onChange(sk.id, e.target.value ? Number(e.target.value) : null)}>
              <option value="">Não conhece</option>
              {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <Link href="/" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>
            Minutor
          </Link>
        </div>
        {children}
      </div>
    </div>
  )
}
