'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useApiQuery } from '@/hooks/use-query'
import { Timesheet } from '@/types'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'

interface SelectOption { id: number; name: string; service_type_code?: string | null }

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
        style={{ background: '#1c1c1e', border: '1px solid #3f3f46', color: selected ? '#fff' : '#71717A' }}
      >
        <span className="truncate text-sm">{selected ? selected.name : placeholder}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="#71717A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-[200] w-full min-w-56 rounded-xl shadow-2xl overflow-hidden"
          style={{ background: '#1c1c1e', border: '1px solid #3f3f46' }}>
          <div className="p-2 border-b" style={{ borderColor: '#3f3f46' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="w-full bg-transparent text-sm text-white outline-none px-2 py-1 placeholder-zinc-500"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0
              ? <p className="px-3 py-2 text-xs text-zinc-500">Nenhum resultado</p>
              : filtered.map(o => (
                  <button key={o.id} type="button"
                    onClick={() => { onChange(String(o.id)); setOpen(false) }}
                    className="w-full text-left px-3 py-2 text-sm transition-colors hover:bg-white/5"
                    style={{ color: String(o.id) === value ? '#00F5FF' : '#d4d4d8' }}>
                    {o.name}
                  </button>
                ))
            }
          </div>
        </div>
      )}
    </div>
  )
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EditTimesheetPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const id = params.id as string

  const isAdmin       = user?.type === 'admin'
  const isCoordenador = user?.type === 'coordenador'
  const canActAsUser  = isAdmin || isCoordenador

  const { data: raw, loading, error } = useApiQuery<{ success: boolean; data: Timesheet }>(`/timesheets/${id}`)
  const ts = raw?.data ?? (raw as unknown as Timesheet | null)

  const [form, setForm] = useState({
    user_id: '', customer_id: '', project_id: '',
    date: '', start_time: '', end_time: '', total_hours: '',
    ticket: '', observation: '',
    is_billable_only: false,
  })
  const [useTotal,   setUseTotal]   = useState(false)
  const [timeDriver, setTimeDriver] = useState<'end' | 'total'>('end')
  const [saving,     setSaving]     = useState(false)

  const [customers,   setCustomers]   = useState<SelectOption[]>([])
  const [consultants, setConsultants] = useState<SelectOption[]>([])
  const [projects,    setProjects]    = useState<SelectOption[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Load customers and consultants once
  useEffect(() => {
    setLoadingData(true)
    const customerEndpoint = isAdmin ? '/customers?pageSize=500' : '/customers/user-linked?pageSize=500'
    const calls: Promise<any>[] = [api.get<any>(customerEndpoint)]
    if (canActAsUser) calls.push(api.get<any>('/users?pageSize=500&exclude_type=cliente'))
    Promise.all(calls)
      .then(([c, us]) => {
        const items = (r: any) => Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : []
        setCustomers(items(c))
        if (us) setConsultants(items(us))
      })
      .catch(() => {})
      .finally(() => setLoadingData(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ensure the timesheet's user is always available in the dropdown (even if not in the paged list)
  useEffect(() => {
    if (!ts?.user || !canActAsUser) return
    setConsultants(prev =>
      prev.some(c => c.id === ts.user!.id)
        ? prev
        : [{ id: ts.user!.id, name: ts.user!.name || 'Usuário' }, ...prev]
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ts?.user?.id])

  // Sync is_billable_only separately so it's picked up even if backend returns it after pre-fill
  useEffect(() => {
    if (!ts || !initialized) return
    setForm(f => ({ ...f, is_billable_only: ts.is_billable_only ?? false }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ts?.is_billable_only])

  // Pre-fill form when timesheet loads
  useEffect(() => {
    if (!ts || initialized) return
    const customerId = ts.customer?.id ? String(ts.customer.id) : ''
    const userId = ts.user?.id ? String(ts.user.id) : ts.user_id ? String(ts.user_id) : ''
    setForm({
      user_id:          userId,
      customer_id:      customerId,
      project_id:       String(ts.project_id ?? ''),
      date:             ts.date ?? '',
      start_time:       ts.start_time ?? '',
      end_time:         ts.end_time ?? '',
      total_hours:      '',
      ticket:           ts.ticket ?? '',
      observation:      ts.observation ?? '',
      is_billable_only: ts.is_billable_only ?? false,
    })
    setInitialized(true)
  }, [ts, initialized])

  // Load projects when customer changes
  useEffect(() => {
    if (!form.customer_id) { setProjects([]); return }
    let cancelled = false
    const qs = new URLSearchParams({ pageSize: '200', customer_id: form.customer_id, status: 'open' })
    if (!isAdmin) qs.set('consultant_only', 'true')
    api.get<{ items: any[] }>(`/projects?${qs}`)
      .then(r => {
        if (!cancelled) setProjects(
          Array.isArray(r?.items)
            ? r.items.map((p: any) => ({ id: p.id, name: p.name, service_type_code: p.service_type?.code ?? null }))
            : []
        )
      })
      .catch(() => {})
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.customer_id])

  // Auto-calculate times
  useEffect(() => {
    if (useTotal) return
    if (timeDriver === 'end') {
      const s = parseHHMM(form.start_time), e = parseHHMM(form.end_time)
      if (s !== null && e !== null && e > s) {
        const diff = e - s
        const computed = `${Math.floor(diff / 60)}:${String(diff % 60).padStart(2, '0')}`
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

  const save = async () => {
    if (!form.project_id) { toast.error('Selecione um projeto'); return }
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
        date:        form.date,
        start_time:  form.start_time || undefined,
        end_time:    form.end_time || undefined,
        total_hours: form.total_hours
          ? (() => { const m = parseHHMM(form.total_hours); return m !== null ? toHHMM(m) : form.total_hours })()
          : undefined,
        ticket:      form.ticket || null,
        observation: form.observation || null,
      }
      if (canActAsUser && form.user_id) body.user_id = Number(form.user_id)
      if (isAdmin && form.user_id && form.user_id !== String(user?.id) && form.is_billable_only) {
        body.is_billable_only = true
      } else if (isAdmin) {
        body.is_billable_only = false
      }
      await api.put(`/timesheets/${id}`, body)
      toast.success('Apontamento atualizado')
      router.push('/timesheets')
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Erro ao salvar'
      toast.error(msg)
    } finally { setSaving(false) }
  }

  return (
    <AppLayout title="Editar Apontamento">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/timesheets"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-white/5"
            style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>
            <ArrowLeft size={12} /> Voltar
          </Link>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>Editar Apontamento #{id}</h1>
        </div>

        {loading && (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        )}

        {error && <p className="text-sm py-4" style={{ color: 'var(--brand-danger)' }}>{error}</p>}

        {!loading && ts && (
          <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>

            {/* Usuário (admin + coordenador) */}
            {canActAsUser && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs text-zinc-400">Usuário</Label>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, user_id: String(user?.id ?? '') }))}
                    className="text-xs font-medium transition-colors"
                    style={{ color: 'var(--brand-primary)' }}
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
              <Label className="text-xs text-zinc-400">Cliente</Label>
              <div className="mt-1">
                <SearchSelect
                  value={form.customer_id}
                  onChange={v => setForm(f => ({ ...f, customer_id: v, project_id: '' }))}
                  options={customers}
                  placeholder={loadingData ? 'Carregando...' : 'Selecione o cliente...'}
                  disabled={loadingData}
                />
              </div>
            </div>

            {/* Projeto */}
            <div>
              <Label className="text-xs text-zinc-400">Projeto *</Label>
              <div className="mt-1">
                <SearchSelect
                  value={form.project_id}
                  onChange={v => setForm(f => ({ ...f, project_id: v }))}
                  options={projects}
                  placeholder={form.customer_id ? 'Selecione o projeto...' : 'Selecione o cliente primeiro'}
                  disabled={!form.customer_id}
                />
              </div>
            </div>

            {/* Data */}
            <div>
              <Label className="text-xs text-zinc-400">Data *</Label>
              <input type="date" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-xl text-sm outline-none bg-zinc-800 border border-zinc-700 text-white" />
            </div>

            {/* Toggle Horário / Total */}
            <div className="flex items-center gap-2">
              {(['Horário', 'Total de Horas'] as const).map((label, i) => {
                const active = i === 0 ? !useTotal : useTotal
                return (
                  <button key={label} type="button" onClick={() => setUseTotal(i === 1)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={active
                      ? { background: 'var(--brand-primary)', color: '#0A0A0B' }
                      : { background: 'rgba(0,245,255,0.08)', color: 'var(--brand-primary)', border: '1px solid rgba(0,245,255,0.2)' }
                    }>{label}</button>
                )
              })}
            </div>

            {/* Modo Horário */}
            {!useTotal && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs text-zinc-400">Início *</Label>
                  <input type="time" value={form.start_time}
                    onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 rounded-xl text-sm outline-none bg-zinc-800 border border-zinc-700 text-white" />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Fim {timeDriver === 'end' ? '*' : ''}</Label>
                  <input type="time" value={form.end_time}
                    onChange={e => { setTimeDriver('end'); setForm(f => ({ ...f, end_time: e.target.value })) }}
                    className="mt-1 w-full px-3 py-2 rounded-xl text-sm outline-none bg-zinc-800 border border-zinc-700 text-white" />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Total {timeDriver === 'total' ? '*' : ''}</Label>
                  <input type="text" value={form.total_hours} placeholder="ex: 2:30"
                    onChange={e => { setTimeDriver('total'); setForm(f => ({ ...f, total_hours: e.target.value })) }}
                    className="mt-1 w-full px-3 py-2 rounded-xl text-sm outline-none bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600" />
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
                  <Label className="text-xs text-zinc-400">Total de Horas *</Label>
                  <input type="text" value={form.total_hours} placeholder="ex: 2:30"
                    onChange={e => setForm(f => ({ ...f, total_hours: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 rounded-xl text-sm outline-none bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600" />
                </div>
              </>
            )}

            {/* Ticket */}
            {projects.find(p => String(p.id) === form.project_id)?.service_type_code === 'sustentacao' && (
              <div>
                <Label className="text-xs text-zinc-400">Ticket</Label>
                <input type="number" value={form.ticket} placeholder="Ex: 12345"
                  onChange={e => setForm(f => ({ ...f, ticket: e.target.value.replace(/\D/g, '') }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl text-sm outline-none bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
              </div>
            )}

            {/* Observação */}
            <div>
              <Label className="text-xs text-zinc-400">Observação</Label>
              <textarea value={form.observation} rows={3}
                placeholder="Descreva as atividades realizadas..."
                onChange={e => setForm(f => ({ ...f, observation: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-xl text-sm outline-none bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 resize-none" />
            </div>

            {/* Somente faturável (admin, apontando para outro usuário) */}
            {isAdmin && form.user_id && form.user_id !== String(user?.id) && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.is_billable_only}
                  onChange={e => setForm(f => ({ ...f, is_billable_only: e.target.checked }))}
                  className="w-3.5 h-3.5 accent-amber-500"
                />
                <span className="text-xs text-amber-400">Somente faturável — não reflete no pagamento do consultor</span>
              </label>
            )}

            {/* Status (leitura) */}
            <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--brand-border)', color: 'var(--brand-subtle)' }}>
              Status atual: <strong style={{ color: 'var(--brand-muted)' }}>{ts.status_display ?? ts.status}</strong>
              {ts.rejection_reason && <span className="ml-2" style={{ color: 'var(--brand-danger)' }}>— {ts.rejection_reason}</span>}
            </div>

            <div className="flex gap-2 pt-1 justify-end">
              <Link href="/timesheets"
                className="inline-flex items-center px-4 py-2 rounded-xl text-xs font-medium transition-colors hover:bg-white/5"
                style={{ color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>
                Cancelar
              </Link>
              <button onClick={save} disabled={saving || !form.project_id}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 transition-all"
                style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}>
                <Save size={12} />
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
