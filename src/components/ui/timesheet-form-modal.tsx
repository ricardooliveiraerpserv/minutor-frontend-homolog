'use client'

import { useState, useEffect, useRef } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'

interface SelectOption { id: number; name: string; service_type_code?: string | null; is_investimento_comercial?: boolean; categoria_interna?: string | null }

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  currentUser: { id: number; type?: string | null } | null | undefined
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function parseHHMM(s: string): number | null {
  if (!s) return null
  if (s.includes(':')) {
    const parts = s.split(':').map(Number)
    if (parts.length !== 2 || parts.some(isNaN)) return null
    return parts[0] * 60 + parts[1]
  }
  const dec = parseFloat(s.replace(',', '.'))
  if (isNaN(dec) || dec < 0) return null
  return Math.round(dec * 60)
}

function toHHMM(mins: number): string {
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`
}

// ─── SearchSelect ─────────────────────────────────────────────────────────────

function SearchSelect({ value, onChange, options, placeholder, disabled }: {
  value: string; onChange: (v: string) => void
  options: SelectOption[]; placeholder: string; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find(o => String(o.id) === value)
  const filtered = options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  useEffect(() => {
    if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm outline-none text-left disabled:opacity-50"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: selected ? 'var(--text)' : 'var(--text-light)',
        }}
      >
        <span className="truncate text-sm">{selected ? selected.name : placeholder}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}/>
        </svg>
      </button>
      {open && (
        <div
          className="absolute top-full mt-1 left-0 z-[200] w-full min-w-56 rounded-xl overflow-hidden"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--brand-card-shadow-md)',
          }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="w-full bg-transparent text-sm outline-none px-2 py-1"
              style={{ color: 'var(--text)' }}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0
              ? <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-light)' }}>Nenhum resultado</p>
              : filtered.map(o => {
                  const isSelected = String(o.id) === value
                  return (
                    <button key={o.id} type="button"
                      onClick={() => { onChange(String(o.id)); setOpen(false) }}
                      className="w-full text-left px-3 py-2 text-sm transition-colors"
                      style={{
                        color: isSelected ? 'var(--primary)' : 'var(--text)',
                        background: isSelected ? 'var(--primary-soft)' : 'transparent',
                        fontWeight: isSelected ? 600 : 400,
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-hover)' }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                    >
                      {o.name}
                    </button>
                  )
                })
            }
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function TimesheetFormModal({ open, onClose, onSaved, currentUser }: Props) {
  const isAdmin       = currentUser?.type === 'admin'
  const isCoordenador = currentUser?.type === 'coordenador'
  const canActAsUser  = isAdmin || isCoordenador

  const [useTotal,   setUseTotal]   = useState(false)
  const [timeDriver, setTimeDriver] = useState<'end' | 'total'>('end')
  const [saving,     setSaving]     = useState(false)
  const [conflictData, setConflictData] = useState<{ date: string; start_time?: string; end_time?: string; customer_name?: string; project_name?: string } | null>(null)

  const [form, setForm] = useState({
    user_id: '', customer_id: '', project_id: '', real_project_id: '',
    date: new Date().toISOString().split('T')[0],
    start_time: '', end_time: '', total_hours: '',
    ticket: '', observation: '',
    is_billable_only: false,
    stage_delivery_id: '',
  })

  const [customers,    setCustomers]    = useState<SelectOption[]>([])
  const [consultants,  setConsultants]  = useState<SelectOption[]>([])
  const [projects,     setProjects]     = useState<SelectOption[]>([])
  // Candidatos a "Projeto Real": todos os projetos abertos do cliente, sem consultant_only.
  const [realProjects, setRealProjects] = useState<SelectOption[]>([])
  // Atividades (cronograma) do projeto selecionado — pra vincular o apontamento a uma atividade.
  const [activities,   setActivities]   = useState<{ id: number; title: string; stage_name?: string }[]>([])
  const [loadingData,  setLoadingData]  = useState(false)

  // Admin/coord têm LIBERDADE de apontar em qualquer projeto: apontando pra SI veem TODAS as
  // atividades do cronograma (opcional). Só é obrigatório quando a hora é de um consultor
  // (ele/ela alocado) — aí a lista já vem filtrada pelo BE.
  const actingForOtherUser = canActAsUser && !!form.user_id && form.user_id !== String(currentUser?.id ?? '')
  const activityRequired   = !canActAsUser || actingForOtherUser

  // Reset and load users list when modal opens
  useEffect(() => {
    if (!open) return
    setUseTotal(false)
    setTimeDriver('end')
    setForm({
      user_id: '', customer_id: '', project_id: '', real_project_id: '',
      date: new Date().toISOString().split('T')[0],
      start_time: '', end_time: '', total_hours: '',
      ticket: '', observation: '',
      is_billable_only: false,
    })
    setProjects([])
    setRealProjects([])
    setCustomers([])
    if (canActAsUser) {
      api.get<any>('/users?pageSize=200&exclude_type=cliente')
        .then(r => {
          const items = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
          setConsultants(items)
        })
        .catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Reload customers whenever selected user changes
  useEffect(() => {
    if (!open) return
    setLoadingData(true)
    setForm(f => ({ ...f, customer_id: '', project_id: '', is_billable_only: false }))
    setProjects([])

    // When admin/coordenador picks a different consultant → load only their allocated customers
    const actingAsOther = canActAsUser && form.user_id && form.user_id !== String(currentUser?.id)
    const customerEndpoint = actingAsOther
      ? `/customers/user-linked?pageSize=500&user_id=${form.user_id}`
      : (isAdmin || isCoordenador)
        ? '/customers?pageSize=500'
        : '/customers/user-linked?pageSize=500'

    api.get<any>(customerEndpoint)
      .then(r => {
        const items = Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
        setCustomers(items)
      })
      .catch(() => {})
      .finally(() => setLoadingData(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.user_id])

  // Load projects when customer changes
  useEffect(() => {
    if (!form.customer_id) { setProjects([]); setRealProjects([]); return }
    let cancelled = false
    const mapProj = (p: any) => ({ id: p.id, name: p.name, service_type_code: p.service_type?.code ?? null, is_investimento_comercial: !!p.is_investimento_comercial, categoria_interna: p.categoria_interna ?? null })

    // Dropdown "Projeto" (apontável): escopo do consultor (consultant_only).
    const qs = new URLSearchParams({ pageSize: '200', customer_id: form.customer_id, status: 'open', include_investimento_comercial: 'true' })
    const actingAsOther = canActAsUser && form.user_id && form.user_id !== String(currentUser?.id)
    if (actingAsOther) {
      qs.set('consultant_only', 'true')
      qs.set('user_id', form.user_id)
    } else if (!isAdmin && !isCoordenador) {
      qs.set('consultant_only', 'true')
    }
    api.get<{ items: any[] }>(`/projects?${qs}`)
      .then(r => { if (!cancelled) setProjects(Array.isArray(r?.items) ? r.items.map(mapProj) : []) })
      .catch(() => {})

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.customer_id])

  // Carrega os "Projetos Reais" quando um projeto de INVESTIMENTO é selecionado:
  // traz SÓ os reais escolhidos para este consultor naquele investimento (definidos
  // na Alocação do investimento). Endpoint: /projects/{invest}/real-project-options.
  useEffect(() => {
    if (!form.project_id) { setRealProjects([]); return }
    const sel = projects.find(p => String(p.id) === form.project_id) as any
    const isInvest = !!sel?.is_investimento_comercial && !isErpservCustomer
      && (sel?.categoria_interna === 'Projeto' || sel?.categoria_interna === 'Suporte')
    if (!isInvest) { setRealProjects([]); return }

    let cancelled = false
    const mapProj = (p: any) => ({ id: p.id, name: p.name, service_type_code: p.service_type_code ?? p.service_type?.code ?? null, is_investimento_comercial: !!p.is_investimento_comercial, categoria_interna: p.categoria_interna ?? null })
    const rq = new URLSearchParams()
    const actingAsOther = canActAsUser && form.user_id && form.user_id !== String(currentUser?.id)
    if (actingAsOther) rq.set('user_id', form.user_id)
    api.get<{ items: any[] }>(`/projects/${form.project_id}/real-project-options?${rq}`)
      .then(r => { if (!cancelled) setRealProjects(Array.isArray(r?.items) ? r.items.map(mapProj) : []) })
      .catch(() => { if (!cancelled) setRealProjects([]) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.project_id, form.user_id])

  // Atividades do cronograma do projeto EM QUE O DONO DA HORA está alocado/responsável.
  // O BE filtra por user_id — se o consultor não está alocado em nenhuma, volta vazio e
  // o campo nem aparece ("se não tiver alocado não traga"). Quando aparece, é obrigatório.
  useEffect(() => {
    if (!form.project_id) { setActivities([]); return }
    let cancelled = false
    // actingForOtherUser → só as atividades daquele consultor. Admin/coord pra si → SEM filtro
    // (BE devolve todas). Consultor → BE já força as próprias mesmo com qs vazio.
    const qs = actingForOtherUser ? `?user_id=${form.user_id}` : ''
    api.get<{ items: { id: number; title: string; stage_name?: string }[] }>(`/projects/${form.project_id}/deliveries${qs}`)
      .then(r => { if (!cancelled) setActivities(Array.isArray(r?.items) ? r.items : []) })
      .catch(() => { if (!cancelled) setActivities([]) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.project_id, form.user_id])

  // Auto-calculate times in Horário mode
  useEffect(() => {
    if (useTotal) return
    if (timeDriver === 'end') {
      const s = parseHHMM(form.start_time), e = parseHHMM(form.end_time)
      if (s !== null && e !== null && e > s) {
        const diff = e - s
        const computed = String(Math.round(diff / 60 * 100) / 100).replace('.', ',') // total em DECIMAL
        setForm(f => f.total_hours === computed ? f : { ...f, total_hours: computed })
      } else {
        setForm(f => f.total_hours ? { ...f, total_hours: '' } : f)
      }
    } else {
      const s = parseHHMM(form.start_time), t = parseHHMM(form.total_hours)
      if (s !== null && t !== null) {
        const computed = addMinutes(form.start_time, t)
        setForm(f => f.end_time === computed ? f : { ...f, end_time: computed })
      } else {
        setForm(f => f.end_time ? { ...f, end_time: '' } : f)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.start_time, form.end_time, form.total_hours, useTotal, timeDriver])

  // ERPSERV (empresa própria): investimentos internos não pedem Projeto Real.
  const selectedCustomer = customers.find(c => String(c.id) === form.customer_id) as any
  const isErpservCustomer = String(selectedCustomer?.name ?? '').trim().toUpperCase() === 'ERPSERV'

  const save = async () => {
    if (!form.project_id) { toast.error('Selecione um projeto'); return }
    const selProj = projects.find(p => String(p.id) === form.project_id) as any
    // Projeto Real só é pedido nos investimentos de Projetos e Suporte dos clientes
    // (não em Comercial, nem nos investimentos internos da própria ERPSERV).
    const isInvestimento = !!selProj?.is_investimento_comercial && !isErpservCustomer
      && (selProj?.categoria_interna === 'Projeto' || selProj?.categoria_interna === 'Suporte')
    if (isInvestimento && !form.real_project_id) { toast.error('Selecione o Projeto Real'); return }
    // Atividade obrigatória quando o dono da hora está alocado no cronograma (a lista só
    // vem preenchida nesse caso — ver efeito acima).
    if (activities.length > 0 && activityRequired && !form.stage_delivery_id) {
      toast.error('Selecione a atividade do cronograma para esta hora')
      return
    }
    if (useTotal) {
      if (!form.total_hours) { toast.error('Informe o total de horas'); return }
    } else {
      if (!form.start_time) { toast.error('Informe o horário de início'); return }
      if (!form.end_time)   { toast.error('Informe o horário de fim'); return }
    }
    setSaving(true)
    try {
      const body: Record<string, any> = {
        project_id:  Number(form.project_id),
        ...(isInvestimento && form.real_project_id ? { real_project_id: Number(form.real_project_id) } : {}),
        date:        form.date,
        start_time:  form.start_time || undefined,
        end_time:    form.end_time || undefined,
        total_hours: form.total_hours
          ? (() => { const m = parseHHMM(form.total_hours); return m !== null ? toHHMM(m) : form.total_hours })()
          : undefined,
        ticket:      form.ticket || null,
        observation: form.observation || null,
        ...(form.stage_delivery_id ? { stage_delivery_id: Number(form.stage_delivery_id) } : {}),
      }
      if (canActAsUser && form.user_id) body.user_id = Number(form.user_id)
      if (isAdmin && form.user_id && form.user_id !== String(currentUser?.id) && form.is_billable_only) {
        body.is_billable_only = true
      }
      await api.post('/timesheets', body)
      toast.success('Apontamento criado com sucesso')
      onClose()
      onSaved()
    } catch (err) {
      if (err instanceof ApiError && err.data?.code === 'TIMESHEET_CONFLICT' && err.data?.conflicting_timesheet) {
        setConflictData(err.data.conflicting_timesheet as any)
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Erro ao salvar')
      }
    } finally { setSaving(false) }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--brand-card-shadow-md)',
        }}
      >
        <button onClick={onClose} className="absolute top-3 right-3 z-10 transition-colors"
          style={{ color: 'var(--text-muted)' }}>
          <X size={16} />
        </button>

        <div className="p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Novo Apontamento</h3>
          <div className="space-y-3">

            {/* Usuário (admin + coordenador) */}
            {canActAsUser && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs text-[var(--text-muted)]">Usuário</Label>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, user_id: String(currentUser?.id ?? '') }))}
                    className="text-xs font-medium transition-colors"
                    style={{ color: 'var(--primary)' }}
                  >
                    → Colocar-me como responsável
                  </button>
                </div>
                <SearchSelect
                  value={form.user_id}
                  onChange={v => setForm(f => ({ ...f, user_id: v }))}
                  options={consultants}
                  placeholder="Selecione o usuário..."
                />
              </div>
            )}

            {/* Cliente */}
            <div>
              <Label className="text-xs text-[var(--text-muted)]">Cliente</Label>
              <div className="mt-1">
                <SearchSelect
                  value={form.customer_id}
                  onChange={v => setForm(f => ({ ...f, customer_id: v, project_id: '' }))}
                  options={customers}
                  placeholder={loadingData ? 'Carregando...' : 'Todos os clientes'}
                  disabled={loadingData}
                />
              </div>
            </div>

            {/* Projeto */}
            <div>
              <Label className="text-xs text-[var(--text-muted)]">Projeto *</Label>
              <div className="mt-1">
                <SearchSelect
                  value={form.project_id}
                  onChange={v => setForm(f => ({ ...f, project_id: v, real_project_id: '', stage_delivery_id: '' }))}
                  options={projects}
                  placeholder={form.customer_id ? 'Selecione o projeto...' : 'Selecione o cliente primeiro'}
                  disabled={!form.customer_id}
                />
              </div>
            </div>

            {/* Projeto Real — só para projetos de INVESTIMENTO (apontamento contabiliza no
                investimento; o real é referência e define o coordenador que aprova). */}
            {(() => {
              const sel = projects.find(p => String(p.id) === form.project_id) as any
              // Projeto Real só nos investimentos de Projetos e Suporte (clientes); não em
              // Comercial nem nos investimentos internos da própria ERPSERV.
              if (!sel?.is_investimento_comercial || isErpservCustomer) return null
              if (!(sel?.categoria_interna === 'Projeto' || sel?.categoria_interna === 'Suporte')) return null
              // realProjects já vem filtrado do backend: só os reais escolhidos p/ este
              // consultor neste investimento (endpoint real-project-options, com fallback).
              const realOpts = realProjects.filter(p => String(p.id) !== form.project_id)
              const semReais = realOpts.length === 0
              return (
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">Projeto Real *</Label>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-light)' }}>
                    Projeto verdadeiro da hora. O apontamento continua contabilizado no investimento; o coordenador do projeto real aprova.
                  </p>
                  {semReais && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--warning)' }}>
                      Nenhum projeto real disponível para este cliente.
                    </p>
                  )}
                  <div className="mt-1">
                    <SearchSelect
                      value={form.real_project_id}
                      onChange={v => setForm(f => ({ ...f, real_project_id: v }))}
                      options={realOpts}
                      placeholder={semReais ? 'Nenhum projeto real disponível' : 'Selecione o projeto real...'}
                    />
                  </div>
                </div>
              )
            })()}

            {/* Atividade (cronograma) — aparece SÓ quando o dono da hora está alocado em
                alguma atividade do projeto (lista filtrada por user_id no BE). Obrigatória. */}
            {activities.length > 0 && (
              <div>
                <Label className="text-xs text-[var(--text-muted)]">Atividade {activityRequired && <span style={{ color: 'var(--danger)' }}>*</span>}</Label>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-light)' }}>
                  {activityRequired
                    ? 'Você está alocado no cronograma — selecione a atividade desta hora.'
                    : 'Opcional — vincule esta hora a uma atividade do cronograma.'}
                </p>
                <div className="mt-1">
                  <SearchSelect
                    value={form.stage_delivery_id}
                    onChange={v => setForm(f => ({ ...f, stage_delivery_id: v }))}
                    options={activities.map(a => ({ id: a.id, name: a.stage_name ? `${a.stage_name} · ${a.title}` : a.title }))}
                    placeholder="Sem atividade"
                  />
                </div>
              </div>
            )}

            {/* Data */}
            <div>
              <Label className="text-xs text-[var(--text-muted)]">Data *</Label>
              <input type="date" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
            </div>

            {/* Toggle Horário / Total de Horas */}
            <div className="flex items-center gap-2">
              {(['Horário', 'Total de Horas'] as const).map((label, i) => {
                const active = i === 0 ? !useTotal : useTotal
                return (
                  <button key={label} type="button" onClick={() => setUseTotal(i === 1)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={active
                      ? { background: 'var(--primary)', color: 'var(--primary-fg)' }
                      : { background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid var(--primary-soft)' }
                    }>{label}</button>
                )
              })}
            </div>

            {/* Modo Horário */}
            {!useTotal && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">Início *</Label>
                  <input type="time" value={form.start_time}
                    onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </div>
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">Fim {timeDriver === 'end' ? '*' : ''}</Label>
                  <input type="time" value={form.end_time}
                    onChange={e => { setTimeDriver('end'); setForm(f => ({ ...f, end_time: e.target.value })) }}
                    className="mt-1 w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </div>
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">Total {timeDriver === 'total' ? '*' : ''}</Label>
                  {/* Aceita HH:MM ("2:30"), decimal com . ou , ("2.5", "2,5") e inteiro ("2"). parseHHMM converte. */}
                  <input type="text" inputMode="decimal" value={form.total_hours} placeholder="ex: 2:30 ou 2,5"
                    onChange={e => { const v = e.target.value.replace(/[^\d:.,]/g, ''); setTimeDriver('total'); setForm(f => ({ ...f, total_hours: v })) }}
                    className="mt-1 w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </div>
              </div>
            )}

            {/* Modo Total de Horas */}
            {useTotal && (
              <>
                <div className="rounded-lg px-3 py-2.5 text-xs leading-relaxed"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#F59E0B' }}>
                  <span className="font-semibold">Atenção:</span> O lançamento por "Total de Horas" deve ser realizado em comum acordo com o coordenador responsável.
                </div>
                <div>
                  <Label className="text-xs text-[var(--text-muted)]">Total de Horas *</Label>
                  {/* Aceita HH:MM ("2:30"), decimal com . ou , ("2.5", "2,5") e inteiro ("2"). parseHHMM converte. */}
                  <input type="text" inputMode="decimal" value={form.total_hours} placeholder="ex: 2:30 ou 2,5"
                    onChange={e => { const v = e.target.value.replace(/[^\d:.,]/g, ''); setForm(f => ({ ...f, total_hours: v })) }}
                    className="mt-1 w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </div>
              </>
            )}

            {/* Ticket — apenas para projetos de sustentação */}
            {projects.find(p => String(p.id) === form.project_id)?.service_type_code === 'sustentacao' && (
              <div>
                <Label className="text-xs text-[var(--text-muted)]">Ticket</Label>
                <input type="number" value={form.ticket} placeholder="Ex: 12345"
                  onChange={e => setForm(f => ({ ...f, ticket: e.target.value.replace(/\D/g, '') }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl text-sm outline-none [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
            )}

            {/* Observação */}
            <div>
              <Label className="text-xs text-[var(--text-muted)]">Observação</Label>
              <textarea value={form.observation} rows={3}
                placeholder="Descreva as atividades realizadas..."
                onChange={e => setForm(f => ({ ...f, observation: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>

            {/* Somente faturável (admin, apontando para outro usuário) */}
            {isAdmin && form.user_id && form.user_id !== String(currentUser?.id) && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.is_billable_only}
                  onChange={e => setForm(f => ({ ...f, is_billable_only: e.target.checked }))}
                  className="w-3.5 h-3.5 accent-amber-500"
                />
                <span className="text-xs text-[var(--warning)]">Somente faturável — não reflete no pagamento do consultor</span>
              </label>
            )}
          </div>

          <div className="flex gap-2 mt-5 justify-end">
            <button onClick={onClose}
              className="h-8 px-3 text-xs rounded-lg transition-colors"
              style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--surface)' }}>
              Cancelar
            </button>
            <button onClick={save} disabled={saving || !form.project_id}
              className="h-8 px-4 text-xs rounded-lg font-semibold disabled:opacity-40 transition-all"
              style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>

      {conflictData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-sm px-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="rounded-2xl w-full max-w-sm overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--brand-card-shadow-md)' }}>
            <div className="flex items-center gap-3 px-5 py-4 border-b"
              style={{ background: 'var(--danger-bg)', borderColor: 'var(--danger-border)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'var(--danger-border)' }}>
                <AlertTriangle size={16} style={{ color: '#fff' }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: 'var(--danger)' }}>Conflito de Horário</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>O horário conflita com o apontamento abaixo</p>
              </div>
              <button onClick={() => setConflictData(null)} className="transition-colors" style={{ color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-2.5">
              <div className="rounded-xl p-3.5 space-y-2"
                style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }}>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>Data</span>
                  <span className="font-medium" style={{ color: 'var(--text)' }}>{conflictData.date}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>Horário</span>
                  <span className="font-medium font-mono" style={{ color: 'var(--text)' }}>{conflictData.start_time ?? '—'} – {conflictData.end_time ?? '—'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>Cliente</span>
                  <span className="font-medium" style={{ color: 'var(--text)' }}>{conflictData.customer_name ?? '—'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>Projeto</span>
                  <span className="font-medium" style={{ color: 'var(--text)' }}>{conflictData.project_name ?? '—'}</span>
                </div>
              </div>
              <p className="text-[11px] text-center pt-1" style={{ color: 'var(--text-light)' }}>Ajuste o horário para não sobrepor este apontamento.</p>
            </div>
            <div className="px-5 py-4 border-t flex justify-end" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setConflictData(null)}
                className="h-8 px-4 text-xs rounded-lg transition-colors font-semibold"
                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--surface)' }}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
