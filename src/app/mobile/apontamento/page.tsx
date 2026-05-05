'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Search, AlertTriangle, X, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { api, ApiError } from '@/lib/api'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Customer { id: number; name: string }
interface Project  { id: number; name: string; is_sustentacao: boolean }
type Tipo = 'horario' | 'total'

// ─── localStorage ─────────────────────────────────────────────────────────────

const LS = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch {} },
}

const LS_CUSTOMER_ID   = 'minutor_m_customer_id'
const LS_CUSTOMER_NAME = 'minutor_m_customer_name'
const LS_PROJECT_ID    = 'minutor_m_project_id'
const LS_PROJECT_NAME  = 'minutor_m_project_name'
const LS_PROJECT_SUS   = 'minutor_m_project_sus'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcTotal(start: string, end: string): string {
  if (!start || !end) return ''
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const diff = eh * 60 + em - (sh * 60 + sm)
  if (diff <= 0) return ''
  return `${Math.floor(diff / 60)}:${String(diff % 60).padStart(2, '0')}`
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

// fontSize 16px mínimo em todos os inputs → sem zoom iOS
const field: React.CSSProperties = {
  padding: '14px 16px', borderRadius: 12, fontSize: 16, outline: 'none',
  background: 'var(--brand-surface)', border: '1px solid var(--brand-border)',
  color: 'var(--brand-text)', width: '100%', boxSizing: 'border-box',
  WebkitAppearance: 'none',
}

const timeField: React.CSSProperties = {
  ...field, fontSize: 22, fontWeight: 700, textAlign: 'center',
}

const lbl: React.CSSProperties = {
  fontSize: 11, color: 'var(--brand-subtle)', fontWeight: 600,
  letterSpacing: 0.5, textTransform: 'uppercase',
}

const tap: React.CSSProperties = { WebkitTapHighlightColor: 'transparent' }

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 3, borderRadius: 99, transition: 'background 0.25s',
          background: i <= step ? '#00F5FF' : 'var(--brand-border)',
        }} />
      ))}
    </div>
  )
}

function Row({ label: l, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 12, color: 'var(--brand-subtle)', flexShrink: 0 }}>{l}</span>
      <span style={{ fontSize: 12, color: 'var(--brand-text)', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TOTAL_STEPS   = 3
const STEP_LABELS   = ['Cliente / Projeto', 'Horário', 'Revisão']

export default function MobileApontamento() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [step, setStep]   = useState(0)
  const [saving, setSaving] = useState(false)
  const [conflictData, setConflictData] = useState<{
    date: string; start_time?: string; end_time?: string
    customer_name?: string; project_name?: string
  } | null>(null)

  // ── Clientes ────────────────────────────────────────────────────────────────
  const [customers,      setCustomers]      = useState<Customer[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [pickingCustomer, setPickingCustomer] = useState(false)  // modo seleção de cliente

  // ── Projetos ────────────────────────────────────────────────────────────────
  const [projects,       setProjects]       = useState<Project[]>([])
  const [projectSearch,  setProjectSearch]  = useState('')
  const [projectsLoading, setProjectsLoading] = useState(false)

  const customerSearchRef = useRef<HTMLInputElement>(null)
  const projectSearchRef  = useRef<HTMLInputElement>(null)

  // ── Formulário ───────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    customer_id:   '',
    customer_name: '',
    project_id:    '',
    project_name:  '',
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

  // ── Auth guard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  // ── Carregar clientes uma vez ────────────────────────────────────────────────
  useEffect(() => {
    api.get<any>('/customers?pageSize=500')
      .then(r => setCustomers((r?.items ?? []).map((c: any) => ({ id: c.id, name: c.name }))))
      .catch(() => {})
  }, [])

  // ── Pré-selecionar último cliente / projeto do localStorage ──────────────────
  useEffect(() => {
    const cId   = LS.get(LS_CUSTOMER_ID)
    const cName = LS.get(LS_CUSTOMER_NAME)
    const pId   = LS.get(LS_PROJECT_ID)
    const pName = LS.get(LS_PROJECT_NAME)
    const pSus  = LS.get(LS_PROJECT_SUS) === 'true'

    if (cId && cName) {
      setForm(f => ({
        ...f,
        customer_id:    cId,
        customer_name:  cName,
        project_id:     pId ?? '',
        project_name:   pName ?? '',
        is_sustentacao: pSus,
      }))
    }
  }, [])

  // ── Carregar projetos quando cliente mudar ───────────────────────────────────
  useEffect(() => {
    if (!form.customer_id) { setProjects([]); return }
    let cancelled = false
    setProjectsLoading(true)
    const qs = new URLSearchParams({
      customer_id: form.customer_id,
      pageSize: '200',
      status: 'open',
      include_investimento_comercial: 'true',
    })
    api.get<any>(`/projects?${qs}`)
      .then(r => {
        if (cancelled) return
        setProjects((r?.items ?? []).map((p: any) => ({
          id: p.id,
          name: p.name,
          is_sustentacao: p.service_type?.code === 'sustentacao' || p.service_type_code === 'sustentacao',
        })))
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setProjectsLoading(false) })
    return () => { cancelled = true }
  }, [form.customer_id])

  // ── Auto-calcular total (horario mode) ───────────────────────────────────────
  useEffect(() => {
    if (form.tipo !== 'horario') return
    const t = calcTotal(form.start_time, form.end_time)
    setForm(f => f.total_hours === t ? f : { ...f, total_hours: t })
  }, [form.start_time, form.end_time, form.tipo])

  // ── Foco ao entrar em modo seleção ───────────────────────────────────────────
  useEffect(() => {
    if (pickingCustomer) setTimeout(() => customerSearchRef.current?.focus(), 80)
  }, [pickingCustomer])

  useEffect(() => {
    if (step === 0 && form.customer_id && !form.project_id) {
      setTimeout(() => projectSearchRef.current?.focus(), 80)
    }
  }, [step, form.customer_id, form.project_id])

  // ── Filtros ──────────────────────────────────────────────────────────────────
  const filteredCustomers = customers.filter(c =>
    !customerSearch || c.name.toLowerCase().includes(customerSearch.toLowerCase())
  )

  const filteredProjects = projects.filter(p =>
    !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase())
  )

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const selectCustomer = (c: Customer) => {
    LS.set(LS_CUSTOMER_ID,   String(c.id))
    LS.set(LS_CUSTOMER_NAME, c.name)
    // limpa projeto ao trocar cliente
    LS.set(LS_PROJECT_ID,   '')
    LS.set(LS_PROJECT_NAME, '')
    LS.set(LS_PROJECT_SUS,  'false')
    setForm(f => ({ ...f, customer_id: String(c.id), customer_name: c.name, project_id: '', project_name: '', is_sustentacao: false, ticket: '' }))
    setPickingCustomer(false)
    setCustomerSearch('')
    setProjectSearch('')
  }

  const selectProject = (p: Project) => {
    LS.set(LS_PROJECT_ID,   String(p.id))
    LS.set(LS_PROJECT_NAME, p.name)
    LS.set(LS_PROJECT_SUS,  String(p.is_sustentacao))
    setForm(f => ({ ...f, project_id: String(p.id), project_name: p.name, is_sustentacao: p.is_sustentacao, ticket: '' }))
    setStep(1)
    setProjectSearch('')
  }

  const back = () => {
    if (step === 0) router.push('/mobile')
    else setStep(s => s - 1)
  }

  const canAdvanceStep1 = () => {
    if (form.tipo === 'horario') return !!form.start_time && !!form.end_time && !!form.total_hours
    return !!form.total_hours
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

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loading || !user) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid rgba(0,245,255,0.2)', borderTopColor: '#00F5FF', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  // ─── Modal de seleção de cliente (overlay) ─────────────────────────────────
  const CustomerPicker = () => (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', flexDirection: 'column',
      background: 'var(--brand-bg)',
    }}>
      {/* Header picker */}
      <div style={{ padding: 'max(44px, env(safe-area-inset-top)) 20px 12px', flexShrink: 0, borderBottom: '1px solid var(--brand-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <button onClick={() => { setPickingCustomer(false); setCustomerSearch('') }}
            style={{ background: 'none', border: 'none', padding: '8px 8px 8px 0', cursor: 'pointer', display: 'flex', ...tap }}>
            <X size={22} color="var(--brand-muted)" />
          </button>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--brand-text)' }}>Selecionar Cliente</span>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--brand-subtle)', pointerEvents: 'none' }} />
          <input
            ref={customerSearchRef}
            value={customerSearch}
            onChange={e => setCustomerSearch(e.target.value)}
            placeholder="Buscar cliente..."
            style={{ ...field, paddingLeft: 40 }}
          />
        </div>
      </div>
      {/* Lista */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '8px 20px 40px' }}>
        {filteredCustomers.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--brand-subtle)', fontSize: 14, paddingTop: 32 }}>
            {customers.length === 0 ? 'Carregando…' : 'Nenhum cliente encontrado'}
          </p>
        )}
        {filteredCustomers.map(c => (
          <button key={c.id} onClick={() => selectCustomer(c)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '14px 16px', borderRadius: 14, marginBottom: 8,
              background: form.customer_id === String(c.id) ? 'rgba(0,245,255,0.08)' : 'var(--brand-surface)',
              border: form.customer_id === String(c.id) ? '1px solid rgba(0,245,255,0.3)' : '1px solid var(--brand-border)',
              cursor: 'pointer', textAlign: 'left', ...tap,
            }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--brand-text)' }}>{c.name}</span>
            {form.customer_id === String(c.id) && <Check size={16} color="#00F5FF" />}
          </button>
        ))}
      </div>
    </div>
  )

  // ─── Render principal ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', overscrollBehavior: 'none' }}>

      {pickingCustomer && <CustomerPicker />}

      {/* Header */}
      <div style={{ padding: 'max(44px, env(safe-area-inset-top)) 20px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button onClick={back} style={{ background: 'none', border: 'none', padding: '8px 8px 8px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0, ...tap }}>
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

      {/* Content */}
      <div style={{ flex: 1, padding: '4px 20px 16px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>

        {/* ── Step 0: Cliente + Projeto ── */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Cliente */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={lbl}>Cliente *</span>

              {/* Pill do cliente selecionado ou botão para selecionar */}
              <button onClick={() => setPickingCustomer(true)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', borderRadius: 14, width: '100%', cursor: 'pointer',
                  background: form.customer_id ? 'rgba(0,245,255,0.06)' : 'var(--brand-surface)',
                  border: form.customer_id ? '1px solid rgba(0,245,255,0.3)' : '1px solid var(--brand-border)',
                  textAlign: 'left', ...tap,
                }}>
                <span style={{
                  fontSize: 15, fontWeight: form.customer_id ? 700 : 400,
                  color: form.customer_id ? 'var(--brand-text)' : 'var(--brand-subtle)',
                }}>
                  {form.customer_name || 'Selecionar cliente…'}
                </span>
                <ChevronRight size={18} color={form.customer_id ? '#00F5FF' : 'var(--brand-subtle)'} />
              </button>
            </div>

            {/* Projeto — só aparece quando cliente selecionado */}
            {form.customer_id && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={lbl}>Projeto *</span>
                  {projectsLoading && (
                    <span style={{ fontSize: 10, color: 'var(--brand-subtle)' }}>Carregando…</span>
                  )}
                </div>

                {/* Busca de projeto */}
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--brand-subtle)', pointerEvents: 'none' }} />
                  <input
                    ref={projectSearchRef}
                    value={projectSearch}
                    onChange={e => setProjectSearch(e.target.value)}
                    placeholder="Buscar projeto…"
                    style={{ ...field, paddingLeft: 38, fontSize: 15 }}
                  />
                </div>

                {/* Lista de projetos */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {!projectsLoading && filteredProjects.length === 0 && (
                    <p style={{ textAlign: 'center', color: 'var(--brand-subtle)', fontSize: 14, paddingTop: 12 }}>
                      {projectSearch ? 'Nenhum projeto encontrado' : 'Nenhum projeto aberto para este cliente'}
                    </p>
                  )}
                  {filteredProjects.map(p => (
                    <button key={p.id} onClick={() => selectProject(p)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '14px 16px', borderRadius: 14, width: '100%', cursor: 'pointer',
                        background: form.project_id === String(p.id) ? 'rgba(0,245,255,0.08)' : 'var(--brand-surface)',
                        border: form.project_id === String(p.id) ? '1px solid rgba(0,245,255,0.3)' : '1px solid var(--brand-border)',
                        textAlign: 'left', ...tap,
                      }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--brand-text)' }}>{p.name}</span>
                        {p.is_sustentacao && (
                          <span style={{ fontSize: 11, color: 'var(--brand-subtle)' }}>Sustentação</span>
                        )}
                      </div>
                      {form.project_id === String(p.id)
                        ? <Check size={16} color="#00F5FF" />
                        : <ChevronRight size={16} color="var(--brand-subtle)" />
                      }
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Dica quando não há cliente selecionado */}
            {!form.customer_id && (
              <p style={{ textAlign: 'center', color: 'var(--brand-subtle)', fontSize: 13, paddingTop: 8 }}>
                Selecione o cliente para ver os projetos disponíveis
              </p>
            )}
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
                {form.project_name} · {form.customer_name}
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
                    ...tap,
                  }}>
                  {t === 'horario' ? 'Início / Fim' : 'Total de horas'}
                </button>
              ))}
            </div>

            {/* Data */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={lbl}>Data</span>
              <input type="date" value={form.date}
                onChange={e => set('date', e.target.value)}
                style={field} />
            </div>

            {/* Horários */}
            {form.tipo === 'horario' ? (
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={lbl}>Início</span>
                  <input type="time" value={form.start_time}
                    onChange={e => set('start_time', e.target.value)}
                    style={timeField} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={lbl}>Fim</span>
                  <input type="time" value={form.end_time}
                    onChange={e => set('end_time', e.target.value)}
                    style={timeField} />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={lbl}>Total (ex: 2:30)</span>
                <input type="text" inputMode="decimal" placeholder="0:00"
                  value={form.total_hours}
                  onChange={e => set('total_hours', e.target.value)}
                  style={{ ...timeField, fontSize: 36, fontWeight: 800, color: '#00F5FF', letterSpacing: 2 }} />
              </div>
            )}

            {/* Pill total calculado */}
            {form.tipo === 'horario' && form.total_hours && (
              <div style={{ padding: '10px 16px', borderRadius: 10, textAlign: 'center', background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.15)' }}>
                <span style={{ fontSize: 14, color: '#00F5FF', fontWeight: 600 }}>
                  Total: {form.total_hours}
                </span>
              </div>
            )}

            {/* Ticket (só sustentação) */}
            {form.is_sustentacao && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={lbl}>Ticket</span>
                <input type="text" inputMode="numeric" placeholder="Ex: 12345"
                  value={form.ticket}
                  onChange={e => set('ticket', e.target.value.replace(/\D/g, ''))}
                  style={field} />
              </div>
            )}

            {/* Observação */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={lbl}>Observação <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></span>
              <textarea
                value={form.observation}
                onChange={e => set('observation', e.target.value)}
                placeholder="Descreva o que foi feito…"
                rows={3}
                style={{ ...field, resize: 'none', fontFamily: 'inherit' }}
              />
            </div>
          </div>
        )}

        {/* ── Step 2: Revisão ── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand-text)', margin: '0 0 4px' }}>Confirmar</h2>
              <p style={{ fontSize: 13, color: 'var(--brand-muted)', margin: 0 }}>Revise antes de salvar</p>
            </div>

            <div style={{ borderRadius: 16, overflow: 'hidden', background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
              {[
                { l: 'Cliente',  v: form.customer_name },
                { l: 'Projeto',  v: form.project_name },
                { l: 'Data',     v: new Date(form.date + 'T12:00:00').toLocaleDateString('pt-BR') },
                form.tipo === 'horario' ? { l: 'Horário', v: `${form.start_time} → ${form.end_time}` } : null,
                { l: 'Total',    v: form.total_hours },
                form.ticket      ? { l: 'Ticket',  v: `#${form.ticket}` } : null,
                form.observation ? { l: 'Obs.',    v: form.observation }  : null,
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

            <button onClick={() => setStep(1)} style={{
              padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 600,
              background: 'transparent', border: '1px solid var(--brand-border)',
              color: 'var(--brand-muted)', cursor: 'pointer', width: '100%', ...tap,
            }}>
              ← Voltar e editar
            </button>
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div style={{
        padding: `12px 20px max(28px, env(safe-area-inset-bottom))`,
        flexShrink: 0,
        borderTop: step > 0 ? '1px solid var(--brand-border)' : 'none',
        background: 'var(--brand-bg)',
      }}>
        {step === 1 && (
          <button onClick={() => setStep(2)} disabled={!canAdvanceStep1()}
            style={{
              width: '100%', padding: '16px', borderRadius: 14, fontSize: 16, fontWeight: 700,
              cursor: canAdvanceStep1() ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
              background: canAdvanceStep1() ? 'rgba(0,245,255,0.1)' : 'rgba(255,255,255,0.04)',
              border: canAdvanceStep1() ? '1px solid rgba(0,245,255,0.3)' : '1px solid var(--brand-border)',
              color: canAdvanceStep1() ? '#00F5FF' : 'var(--brand-subtle)', ...tap,
            }}>
            Revisar →
          </button>
        )}

        {step === 2 && (
          <button onClick={handleSave} disabled={saving}
            style={{
              width: '100%', padding: '16px', borderRadius: 14, fontSize: 16, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', border: 'none',
              background: saving ? 'rgba(255,255,255,0.04)' : '#00F5FF',
              color: saving ? 'var(--brand-subtle)' : '#0a0a0a',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.15s', ...tap,
            }}>
            {saving ? 'Salvando…' : <><Check size={18} /> Confirmar e salvar</>}
          </button>
        )}
      </div>

      {/* Modal conflito — bottom sheet */}
      {conflictData && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', padding: 0 }}>
          <div style={{ background: '#18181b', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, overflow: 'hidden', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid #27272a', background: 'rgba(239,68,68,0.08)' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={16} color="#f87171" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#f87171', margin: 0 }}>Conflito de Horário</p>
                <p style={{ fontSize: 11, color: '#71717a', margin: '2px 0 0' }}>Horário sobrepõe outro apontamento</p>
              </div>
              <button onClick={() => setConflictData(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#71717a', ...tap }}>
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
                color: 'var(--brand-text)', cursor: 'pointer', width: '100%', ...tap,
              }}>Entendido, vou corrigir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
