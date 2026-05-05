'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Search, AlertTriangle, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { api, ApiError } from '@/lib/api'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Project {
  id: number
  name: string
  customer_name: string
  is_sustentacao: boolean
}

type Tipo = 'horario' | 'total'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcTotal(start: string, end: string): string {
  if (!start || !end) return ''
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const diff = eh * 60 + em - (sh * 60 + sm)
  if (diff <= 0) return ''
  return `${Math.floor(diff / 60)}:${String(diff % 60).padStart(2, '0')}`
}

// Estilos base dos inputs — 16px obrigatório para evitar zoom no iOS
const field: React.CSSProperties = {
  padding: '14px 16px',
  borderRadius: 12,
  fontSize: 16,
  outline: 'none',
  background: 'var(--brand-surface)',
  border: '1px solid var(--brand-border)',
  color: 'var(--brand-text)',
  width: '100%',
  boxSizing: 'border-box',
  WebkitAppearance: 'none',
}

const timeField: React.CSSProperties = {
  ...field,
  fontSize: 22,
  fontWeight: 700,
  textAlign: 'center',
}

const label: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--brand-subtle)',
  fontWeight: 600,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
}

// ─── Componentes internos ──────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 3, borderRadius: 99,
          background: i <= step ? '#00F5FF' : 'var(--brand-border)',
          transition: 'background 0.25s',
        }} />
      ))}
    </div>
  )
}

function Row({ label: l, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 12, color: 'var(--brand-subtle)', flexShrink: 0 }}>{l}</span>
      <span style={{ fontSize: 12, color: 'var(--brand-text)', fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 3
const STEP_LABELS = ['Projeto', 'Horário', 'Revisão']

export default function MobileApontamento() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [step, setStep]       = useState(0)
  const [projects, setProjects] = useState<Project[]>([])
  const [search, setSearch]   = useState('')
  const [saving, setSaving]   = useState(false)
  const [conflictData, setConflictData] = useState<{
    date: string; start_time?: string; end_time?: string
    customer_name?: string; project_name?: string
  } | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    project_id:    '',
    project_name:  '',
    project_customer: '',
    is_sustentacao: false,
    date:          new Date().toISOString().split('T')[0],
    tipo:          'horario' as Tipo,
    start_time:    '',
    end_time:      '',
    total_hours:   '',
    ticket:        '',
    observation:   '',
  })

  const set = useCallback(<K extends keyof typeof form>(k: K, v: any) =>
    setForm(f => ({ ...f, [k]: v })), [])

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    api.get<any>('/projects?pageSize=300&status=open&include_investimento_comercial=true')
      .then(r => {
        const items: any[] = r?.items ?? []
        setProjects(items.map(p => ({
          id: p.id,
          name: p.name,
          customer_name: p.customer?.name ?? p.customer_name ?? '',
          is_sustentacao: p.service_type?.code === 'sustentacao' || p.service_type_code === 'sustentacao',
        })))
      })
      .catch(() => {})
  }, [])

  // Auto-calcular total ao mudar start/end
  useEffect(() => {
    if (form.tipo !== 'horario') return
    const t = calcTotal(form.start_time, form.end_time)
    setForm(f => f.total_hours === t ? f : { ...f, total_hours: t })
  }, [form.start_time, form.end_time, form.tipo])

  // Foco no search ao entrar no step 0
  useEffect(() => {
    if (step === 0) setTimeout(() => searchRef.current?.focus(), 80)
  }, [step])

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.customer_name.toLowerCase().includes(search.toLowerCase())
  )

  const back = () => {
    if (step === 0) router.push('/mobile')
    else setStep(s => s - 1)
  }

  const canAdvance = () => {
    if (step === 0) return !!form.project_id
    if (step === 1) {
      if (form.tipo === 'horario') return !!form.start_time && !!form.end_time && !!form.total_hours
      return !!form.total_hours
    }
    return true
  }

  const selectProject = (p: Project) => {
    setForm(f => ({
      ...f,
      project_id: String(p.id),
      project_name: p.name,
      project_customer: p.customer_name,
      is_sustentacao: p.is_sustentacao,
      ticket: '',
    }))
    setStep(1)
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const body: Record<string, any> = {
        project_id:  Number(form.project_id),
        date:        form.date,
        observation: form.observation || null,
        ticket:      form.ticket || null,
      }
      if (form.tipo === 'horario') {
        body.start_time = form.start_time
        body.end_time   = form.end_time
      } else {
        body.total_hours = form.total_hours
      }
      await api.post('/timesheets', body)
      toast.success('Apontamento lançado!')
      router.replace('/mobile')
    } catch (e) {
      if (e instanceof ApiError && e.data?.code === 'TIMESHEET_CONFLICT' && e.data?.conflicting_timesheet) {
        setConflictData(e.data.conflicting_timesheet as any)
      } else {
        toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading || !user) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid rgba(0,245,255,0.2)', borderTopColor: '#00F5FF', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      overscrollBehavior: 'none',
      WebkitOverflowScrolling: 'touch',
    }}>

      {/* Header */}
      <div style={{ padding: 'max(44px, env(safe-area-inset-top)) 20px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <button onClick={back} style={{
            background: 'none', border: 'none', padding: '8px 8px 8px 0',
            cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0,
            WebkitTapHighlightColor: 'transparent',
          }}>
            <ArrowLeft size={22} color="var(--brand-muted)" />
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--brand-text)', margin: 0 }}>
            Novo Apontamento
          </h1>
        </div>
        <ProgressBar step={step} total={TOTAL_STEPS} />
        <p style={{ fontSize: 11, color: 'var(--brand-subtle)', marginTop: 6, marginBottom: 0 }}>
          Etapa {step + 1} de {TOTAL_STEPS} — {STEP_LABELS[step]}
        </p>
      </div>

      {/* Content — cresce para preencher espaço */}
      <div style={{ flex: 1, padding: '4px 20px 16px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>

        {/* ── Step 0: Projeto ── */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand-text)', margin: '0 0 4px' }}>
              Qual projeto?
            </h2>

            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--brand-subtle)', pointerEvents: 'none' }} />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar projeto ou cliente..."
                style={{ ...field, paddingLeft: 40, fontSize: 16 }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '58vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
              {projects.length === 0 && (
                <p style={{ color: 'var(--brand-subtle)', fontSize: 14, textAlign: 'center', paddingTop: 24 }}>
                  Carregando projetos…
                </p>
              )}
              {projects.length > 0 && filteredProjects.length === 0 && (
                <p style={{ color: 'var(--brand-subtle)', fontSize: 14, textAlign: 'center', paddingTop: 24 }}>
                  Nenhum projeto encontrado
                </p>
              )}
              {filteredProjects.map(p => (
                <button key={p.id} onClick={() => selectProject(p)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                    padding: '14px 16px', borderRadius: 14, textAlign: 'left', cursor: 'pointer',
                    background: form.project_id === String(p.id) ? 'rgba(0,245,255,0.08)' : 'var(--brand-surface)',
                    border: form.project_id === String(p.id) ? '1px solid rgba(0,245,255,0.3)' : '1px solid var(--brand-border)',
                    width: '100%', WebkitTapHighlightColor: 'transparent',
                  }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--brand-text)' }}>{p.name}</span>
                  {p.customer_name && <span style={{ fontSize: 12, color: 'var(--brand-subtle)' }}>{p.customer_name}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 1: Data + Horário ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand-text)', margin: '0 0 2px' }}>
                Horário trabalhado
              </h2>
              <p style={{ fontSize: 13, color: 'var(--brand-muted)', margin: 0 }}>
                {form.project_name} · {form.project_customer}
              </p>
            </div>

            {/* Toggle tipo */}
            <div style={{ display: 'flex', gap: 8, background: 'var(--brand-surface)', borderRadius: 12, padding: 4 }}>
              {(['horario', 'total'] as Tipo[]).map(t => (
                <button key={t} onClick={() => set('tipo', t)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 9, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                    background: form.tipo === t ? '#00F5FF' : 'transparent',
                    color: form.tipo === t ? '#0a0a0a' : 'var(--brand-subtle)',
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  {t === 'horario' ? 'Início / Fim' : 'Total de horas'}
                </button>
              ))}
            </div>

            {/* Data */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={label}>Data</span>
              <input type="date" value={form.date}
                onChange={e => set('date', e.target.value)}
                style={field} />
            </div>

            {/* Horário */}
            {form.tipo === 'horario' ? (
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={label}>Início</span>
                  <input type="time" value={form.start_time}
                    onChange={e => set('start_time', e.target.value)}
                    style={timeField} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={label}>Fim</span>
                  <input type="time" value={form.end_time}
                    onChange={e => set('end_time', e.target.value)}
                    style={timeField} />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={label}>Total (ex: 2:30)</span>
                <input type="text" inputMode="decimal" placeholder="0:00"
                  value={form.total_hours}
                  onChange={e => set('total_hours', e.target.value)}
                  style={{ ...timeField, fontSize: 36, fontWeight: 800, color: '#00F5FF', letterSpacing: 2 }} />
              </div>
            )}

            {/* Pill de total calculado */}
            {form.tipo === 'horario' && form.total_hours && (
              <div style={{
                padding: '10px 16px', borderRadius: 10,
                background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.15)',
                textAlign: 'center',
              }}>
                <span style={{ fontSize: 14, color: '#00F5FF', fontWeight: 600 }}>
                  Total: {form.total_hours}
                </span>
              </div>
            )}

            {/* Ticket (só sustentação) */}
            {form.is_sustentacao && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={label}>Ticket</span>
                <input
                  type="text" inputMode="numeric" placeholder="Ex: 12345"
                  value={form.ticket}
                  onChange={e => set('ticket', e.target.value.replace(/\D/g, ''))}
                  style={field}
                />
              </div>
            )}

            {/* Observação */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={label}>Observação <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></span>
              <textarea
                value={form.observation}
                onChange={e => set('observation', e.target.value)}
                placeholder="Descreva o que foi feito…"
                rows={3}
                style={{ ...field, resize: 'none', fontFamily: 'inherit', fontSize: 16 }}
              />
            </div>
          </div>
        )}

        {/* ── Step 2: Revisão ── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand-text)', margin: '0 0 4px' }}>
                Confirmar
              </h2>
              <p style={{ fontSize: 13, color: 'var(--brand-muted)', margin: 0 }}>
                Revise antes de salvar
              </p>
            </div>

            <div style={{
              borderRadius: 16, overflow: 'hidden',
              background: 'var(--brand-surface)', border: '1px solid var(--brand-border)',
            }}>
              {[
                { l: 'Projeto',  v: form.project_name },
                { l: 'Cliente',  v: form.project_customer },
                { l: 'Data',     v: new Date(form.date + 'T12:00:00').toLocaleDateString('pt-BR') },
                form.tipo === 'horario'
                  ? { l: 'Horário', v: `${form.start_time} → ${form.end_time}` }
                  : null,
                { l: 'Total',    v: form.total_hours },
                form.ticket ? { l: 'Ticket',  v: `#${form.ticket}` } : null,
                form.observation ? { l: 'Obs.', v: form.observation } : null,
              ].filter(Boolean).map((r, i, arr) => (
                <div key={r!.l} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
                  padding: '13px 16px',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--brand-border)' : 'none',
                }}>
                  <span style={{ fontSize: 13, color: 'var(--brand-subtle)', flexShrink: 0 }}>{r!.l}</span>
                  <span style={{ fontSize: 13, color: 'var(--brand-text)', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{r!.v}</span>
                </div>
              ))}
            </div>

            {/* Editar */}
            <button onClick={() => setStep(1)} style={{
              padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 600,
              background: 'transparent', border: '1px solid var(--brand-border)',
              color: 'var(--brand-muted)', cursor: 'pointer', width: '100%',
              WebkitTapHighlightColor: 'transparent',
            }}>
              ← Voltar e editar
            </button>
          </div>
        )}
      </div>

      {/* Bottom CTA — fixo com safe area */}
      <div style={{
        padding: `12px 20px max(28px, env(safe-area-inset-bottom))`,
        flexShrink: 0,
        borderTop: step > 0 ? '1px solid var(--brand-border)' : 'none',
        background: 'var(--brand-bg)',
      }}>
        {step === 1 && (
          <button onClick={() => setStep(2)} disabled={!canAdvance()}
            style={{
              width: '100%', padding: '16px', borderRadius: 14, fontSize: 16, fontWeight: 700,
              cursor: canAdvance() ? 'pointer' : 'not-allowed',
              background: canAdvance() ? 'rgba(0,245,255,0.1)' : 'rgba(255,255,255,0.04)',
              border: canAdvance() ? '1px solid rgba(0,245,255,0.3)' : '1px solid var(--brand-border)',
              color: canAdvance() ? '#00F5FF' : 'var(--brand-subtle)',
              transition: 'all 0.15s',
              WebkitTapHighlightColor: 'transparent',
            }}>
            Revisar →
          </button>
        )}

        {step === 2 && (
          <button onClick={handleSave} disabled={saving}
            style={{
              width: '100%', padding: '16px', borderRadius: 14, fontSize: 16, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              background: saving ? 'rgba(255,255,255,0.04)' : '#00F5FF',
              border: 'none',
              color: saving ? 'var(--brand-subtle)' : '#0a0a0a',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.15s',
              WebkitTapHighlightColor: 'transparent',
            }}>
            {saving
              ? 'Salvando…'
              : <><Check size={18} /> Confirmar e salvar</>
            }
          </button>
        )}
      </div>

      {/* Modal conflito */}
      {conflictData && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          background: 'rgba(0,0,0,0.65)', padding: 0,
        }}>
          <div style={{
            background: '#18181b', borderRadius: '20px 20px 0 0',
            width: '100%', maxWidth: 480, overflow: 'hidden',
            paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid #27272a', background: 'rgba(239,68,68,0.08)' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={16} color="#f87171" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#f87171', margin: 0 }}>Conflito de Horário</p>
                <p style={{ fontSize: 11, color: '#71717a', margin: '2px 0 0' }}>Horário sobrepõe outro apontamento</p>
              </div>
              <button onClick={() => setConflictData(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#71717a' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ borderRadius: 12, padding: 14, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { l: 'Data',    v: conflictData.date },
                  { l: 'Horário', v: `${conflictData.start_time ?? '—'} – ${conflictData.end_time ?? '—'}` },
                  { l: 'Cliente', v: conflictData.customer_name ?? '—' },
                  { l: 'Projeto', v: conflictData.project_name ?? '—' },
                ].map(r => (
                  <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#71717a' }}>{r.l}</span>
                    <span style={{ color: '#e4e4e7', fontWeight: 600 }}>{r.v}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setConflictData(null)} style={{
                padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 700,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--brand-text)', cursor: 'pointer', width: '100%',
                WebkitTapHighlightColor: 'transparent',
              }}>Entendido, vou corrigir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
