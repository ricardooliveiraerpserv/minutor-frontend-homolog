'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Search, AlertTriangle, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { api, ApiError } from '@/lib/api'

interface Project { id: number; name: string; customer_name?: string | null }

type Tipo = 'horario' | 'total'

const TOTAL_STEPS = 4

function ProgressBar({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 3, borderRadius: 99,
          background: i <= step ? '#00F5FF' : 'var(--brand-border)',
          transition: 'background 0.3s',
        }} />
      ))}
    </div>
  )
}

function StepLabel({ step }: { step: number }) {
  const labels = ['Projeto', 'Tipo', 'Horas', 'Observação']
  return (
    <p style={{ fontSize: 11, color: 'var(--brand-subtle)', marginTop: 4, marginBottom: 0 }}>
      Etapa {step + 1} de {TOTAL_STEPS} — {labels[step]}
    </p>
  )
}

export default function MobileApontamento() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [step, setStep] = useState(0)
  const [projects, setProjects] = useState<Project[]>([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [conflictData, setConflictData] = useState<{ date: string; start_time?: string; end_time?: string; customer_name?: string; project_name?: string } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    project_id: '',
    project_name: '',
    project_customer: '',
    date: new Date().toISOString().split('T')[0],
    tipo: 'horario' as Tipo,
    start_time: '',
    end_time: '',
    total_hours: '',
    observation: '',
  })

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    api.get<any>('/projects?pageSize=200&status=open')
      .then(r => setProjects(Array.isArray(r?.items) ? r.items : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (step === 0) setTimeout(() => searchRef.current?.focus(), 100)
  }, [step])

  // Auto-calcula total quando start/end mudam
  useEffect(() => {
    if (form.tipo !== 'horario') return
    if (!form.start_time || !form.end_time) { setForm(f => ({ ...f, total_hours: '' })); return }
    const [sh, sm] = form.start_time.split(':').map(Number)
    const [eh, em] = form.end_time.split(':').map(Number)
    const diff = (eh * 60 + em) - (sh * 60 + sm)
    if (diff > 0) setForm(f => ({ ...f, total_hours: `${Math.floor(diff / 60)}:${String(diff % 60).padStart(2, '0')}` }))
    else setForm(f => ({ ...f, total_hours: '' }))
  }, [form.start_time, form.end_time, form.tipo])

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.customer_name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const next = () => setStep(s => s + 1)
  const back = () => { if (step === 0) router.push('/mobile'); else setStep(s => s - 1) }

  const canAdvance = () => {
    if (step === 0) return !!form.project_id
    if (step === 2) {
      if (form.tipo === 'horario') return !!form.start_time && !!form.end_time
      return !!form.total_hours
    }
    return true
  }

  const handleSave = async () => {
    if (!canAdvance()) return
    setSaving(true)
    try {
      const body: Record<string, any> = {
        project_id: Number(form.project_id),
        date: form.date,
        observation: form.observation || null,
      }
      if (form.tipo === 'horario') {
        body.start_time = form.start_time
        body.end_time = form.end_time
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

  if (loading || !user) return null

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', padding: '0 0' }}>

      {/* Header */}
      <div style={{ padding: '48px 24px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={back} style={{
            background: 'none', border: 'none', padding: '8px 8px 8px 0', cursor: 'pointer',
            display: 'flex', alignItems: 'center',
          }}>
            <ArrowLeft size={20} color="var(--brand-muted)" />
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--brand-text)', margin: 0 }}>
            Novo Apontamento
          </h1>
        </div>
        <ProgressBar step={step} />
        <StepLabel step={step} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '8px 24px 24px', overflowY: 'auto' }}>

        {/* Step 0: Projeto */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand-text)', margin: '0 0 4px' }}>
              Qual projeto?
            </h2>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--brand-subtle)', pointerEvents: 'none' }} />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar projeto ou cliente..."
                style={{
                  width: '100%', padding: '14px 14px 14px 38px',
                  borderRadius: 12, fontSize: 15, outline: 'none', boxSizing: 'border-box',
                  background: 'var(--brand-surface)', border: '1px solid var(--brand-border)',
                  color: 'var(--brand-text)',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '55vh', overflowY: 'auto' }}>
              {filteredProjects.length === 0 && (
                <p style={{ color: 'var(--brand-subtle)', fontSize: 13, textAlign: 'center', paddingTop: 16 }}>
                  {projects.length === 0 ? 'Carregando projetos...' : 'Nenhum projeto encontrado'}
                </p>
              )}
              {filteredProjects.map(p => (
                <button key={p.id} onClick={() => { setForm(f => ({ ...f, project_id: String(p.id), project_name: p.name, project_customer: p.customer_name ?? '' })); next() }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                    padding: '14px 16px', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
                    background: form.project_id === String(p.id) ? 'rgba(0,245,255,0.08)' : 'var(--brand-surface)',
                    border: form.project_id === String(p.id) ? '1px solid rgba(0,245,255,0.3)' : '1px solid var(--brand-border)',
                    width: '100%',
                  }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-text)' }}>{p.name}</span>
                  {p.customer_name && <span style={{ fontSize: 12, color: 'var(--brand-subtle)' }}>{p.customer_name}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Tipo */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ marginBottom: 4 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand-text)', margin: '0 0 4px' }}>Como registrar?</h2>
              <p style={{ fontSize: 13, color: 'var(--brand-muted)', margin: 0 }}>{form.project_name}</p>
            </div>
            {(['horario', 'total'] as Tipo[]).map(t => (
              <button key={t} onClick={() => { setForm(f => ({ ...f, tipo: t })); next() }}
                style={{
                  padding: '22px 20px', borderRadius: 16, cursor: 'pointer', textAlign: 'left',
                  background: 'var(--brand-surface)', border: '1px solid var(--brand-border)',
                  width: '100%',
                }}>
                <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--brand-text)', margin: '0 0 4px' }}>
                  {t === 'horario' ? '⏱ Horário de início e fim' : '⏳ Total de horas'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--brand-subtle)', margin: 0 }}>
                  {t === 'horario' ? 'Informe quando começou e terminou' : 'Informe diretamente o total trabalhado'}
                </p>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Horas + Data */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand-text)', margin: '0 0 4px' }}>
                {form.tipo === 'horario' ? 'Horário trabalhado' : 'Total de horas'}
              </h2>
              <p style={{ fontSize: 13, color: 'var(--brand-muted)', margin: 0 }}>{form.project_name}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--brand-subtle)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Data</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                style={{
                  padding: '14px 16px', borderRadius: 12, fontSize: 15, outline: 'none',
                  background: 'var(--brand-surface)', border: '1px solid var(--brand-border)',
                  color: 'var(--brand-text)', width: '100%', boxSizing: 'border-box',
                }}
              />
            </div>

            {form.tipo === 'horario' ? (
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 12, color: 'var(--brand-subtle)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Início</label>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                    autoFocus
                    style={{
                      padding: '14px 16px', borderRadius: 12, fontSize: 18, fontWeight: 700, outline: 'none',
                      background: 'var(--brand-surface)', border: '1px solid var(--brand-border)',
                      color: 'var(--brand-text)', width: '100%', boxSizing: 'border-box', textAlign: 'center',
                    }}
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 12, color: 'var(--brand-subtle)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Fim</label>
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                    style={{
                      padding: '14px 16px', borderRadius: 12, fontSize: 18, fontWeight: 700, outline: 'none',
                      background: 'var(--brand-surface)', border: '1px solid var(--brand-border)',
                      color: 'var(--brand-text)', width: '100%', boxSizing: 'border-box', textAlign: 'center',
                    }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 12, color: 'var(--brand-subtle)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Total (ex: 2:30)</label>
                <input
                  type="text"
                  inputMode="text"
                  placeholder="0:00"
                  value={form.total_hours}
                  onChange={e => setForm(f => ({ ...f, total_hours: e.target.value }))}
                  autoFocus
                  style={{
                    padding: '18px 16px', borderRadius: 12, fontSize: 32, fontWeight: 800, outline: 'none',
                    background: 'var(--brand-surface)', border: '1px solid var(--brand-border)',
                    color: '#00F5FF', width: '100%', boxSizing: 'border-box', textAlign: 'center',
                    letterSpacing: 2,
                  }}
                />
              </div>
            )}

            {form.tipo === 'horario' && form.total_hours && (
              <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.15)', textAlign: 'center' }}>
                <span style={{ fontSize: 13, color: '#00F5FF' }}>Total: <strong>{form.total_hours}h</strong></span>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Observação */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand-text)', margin: '0 0 4px' }}>Observação</h2>
              <p style={{ fontSize: 13, color: 'var(--brand-muted)', margin: 0 }}>Opcional — descreva o que foi feito</p>
            </div>
            <textarea
              value={form.observation}
              onChange={e => setForm(f => ({ ...f, observation: e.target.value }))}
              placeholder="Ex: Reunião de alinhamento, implementação do módulo X..."
              autoFocus
              rows={5}
              style={{
                padding: '16px', borderRadius: 12, fontSize: 15, outline: 'none', resize: 'none',
                background: 'var(--brand-surface)', border: '1px solid var(--brand-border)',
                color: 'var(--brand-text)', width: '100%', boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />

            {/* Resumo */}
            <div style={{ padding: '16px', borderRadius: 12, background: 'var(--brand-surface)', border: '1px solid var(--brand-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Resumo</p>
              <Row label="Projeto" value={form.project_name} />
              <Row label="Data" value={new Date(form.date + 'T12:00:00').toLocaleDateString('pt-BR')} />
              {form.tipo === 'horario'
                ? <Row label="Horário" value={`${form.start_time} → ${form.end_time} (${form.total_hours || '—'}h)`} />
                : <Row label="Total" value={`${form.total_hours}h`} />
              }
            </div>
          </div>
        )}
      </div>

      {/* Bottom action */}
      <div style={{ padding: '12px 24px 40px', flexShrink: 0 }}>
        {step < 3 && step !== 0 && (
          <button
            onClick={next}
            disabled={!canAdvance()}
            style={{
              width: '100%', padding: '16px', borderRadius: 14, fontSize: 16, fontWeight: 700,
              cursor: canAdvance() ? 'pointer' : 'not-allowed',
              background: canAdvance() ? 'rgba(0,245,255,0.12)' : 'rgba(255,255,255,0.04)',
              border: canAdvance() ? '1px solid rgba(0,245,255,0.3)' : '1px solid var(--brand-border)',
              color: canAdvance() ? '#00F5FF' : 'var(--brand-subtle)',
              transition: 'all 0.15s',
            }}
          >
            Próximo
          </button>
        )}
        {step === 3 && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', padding: '16px', borderRadius: 14, fontSize: 16, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              background: saving ? 'rgba(255,255,255,0.04)' : 'rgba(0,245,255,0.12)',
              border: saving ? '1px solid var(--brand-border)' : '1px solid rgba(0,245,255,0.3)',
              color: saving ? 'var(--brand-subtle)' : '#00F5FF',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.15s',
            }}
          >
            {saving ? 'Salvando...' : <><Check size={18} /> Salvar apontamento</>}
          </button>
        )}
      </div>

      {conflictData && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: '0 16px',
        }}>
          <div style={{ background: '#18181b', borderRadius: 20, width: '100%', maxWidth: 380, overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid #27272a', background: 'rgba(239,68,68,0.08)' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={16} color="#f87171" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#f87171', margin: 0 }}>Conflito de Horário</p>
                <p style={{ fontSize: 11, color: '#71717a', margin: '2px 0 0' }}>O horário conflita com o apontamento abaixo</p>
              </div>
              <button onClick={() => setConflictData(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#71717a' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ borderRadius: 12, padding: 14, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Data',    value: conflictData.date },
                  { label: 'Horário', value: `${conflictData.start_time ?? '—'} – ${conflictData.end_time ?? '—'}` },
                  { label: 'Cliente', value: conflictData.customer_name ?? '—' },
                  { label: 'Projeto', value: conflictData.project_name ?? '—' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#71717a' }}>{r.label}</span>
                    <span style={{ color: '#e4e4e7', fontWeight: 600 }}>{r.value}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: '#52525b', textAlign: 'center', margin: 0 }}>Ajuste o horário para não sobrepor este apontamento.</p>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #27272a', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setConflictData(null)} style={{
                padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--brand-text)', cursor: 'pointer',
              }}>Entendido</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--brand-subtle)' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--brand-text)', fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}
