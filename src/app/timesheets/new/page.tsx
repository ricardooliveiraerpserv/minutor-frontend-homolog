'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { SearchSelect } from '@/components/ui/search-select'
import { Label } from '@/components/ui/label'

interface SelectOption { id: number; name: string; service_type_code?: string | null }
interface PaginatedResponse<T> { items: T[] }

const inputCls = `w-full px-3 py-2 rounded-xl text-sm outline-none`
const inputStyle = {
  background: 'var(--brand-bg)',
  border: '1px solid var(--brand-border)',
  color: 'var(--brand-text)',
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function parseHHMM(s: string): number | null {
  const parts = s.split(':').map(Number)
  if (parts.length !== 2 || parts.some(isNaN)) return null
  return parts[0] * 60 + parts[1]
}

export default function NewTimesheetPage() {
  const { user } = useAuth()
  const router = useRouter()
  const isAdmin = user?.type === 'admin'

  const [useTotal,   setUseTotal]   = useState(false)
  const [timeDriver, setTimeDriver] = useState<'end' | 'total'>('end')

  const [form, setForm] = useState({
    user_id: '',
    customer_id: '',
    project_id: '',
    date: new Date().toISOString().split('T')[0],
    start_time: '',
    total_hours: '',
    end_time: '',
    ticket: '',
    observation: '',
  })
  const [saving, setSaving] = useState(false)
  const [users,     setUsers]     = useState<SelectOption[]>([])
  const [customers, setCustomers] = useState<SelectOption[]>([])
  const [projects,  setProjects]  = useState<SelectOption[]>([])

  useEffect(() => {
    const items = (r: any) => Array.isArray(r?.items) ? r.items : []
    Promise.all([
      isAdmin ? api.get<any>('/users?pageSize=200') : Promise.resolve(null),
      api.get<any>('/customers?pageSize=500'),
    ]).then(([u, c]) => {
      if (u) setUsers(items(u))
      setCustomers(items(c))
    }).catch(() => {})
  }, [isAdmin])

  useEffect(() => {
    if (!form.customer_id) { setProjects([]); return }
    let cancelled = false
    const qs = new URLSearchParams({ pageSize: '200', customer_id: form.customer_id, status: 'open' })
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

  const set = useCallback(<K extends keyof typeof form>(k: K, v: string) =>
    setForm(f => ({ ...f, [k]: v })), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
        total_hours: form.total_hours || undefined,
        ticket:      form.ticket || null,
        observation: form.observation || null,
      }
      if (isAdmin && form.user_id) body.user_id = Number(form.user_id)
      await api.post('/timesheets', body)
      toast.success('Apontamento criado com sucesso')
      router.push('/timesheets')
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Erro ao salvar'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppLayout
      title="Novo Apontamento"
      actions={
        <Link
          href="/timesheets"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors"
          style={{ color: 'var(--brand-muted)' }}
        >
          <ArrowLeft size={12} /> Voltar
        </Link>
      }
    >
      <div className="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Usuário (admin only) */}
          {isAdmin && (
            <div>
              <Label className="text-xs mb-1 block" style={{ color: 'var(--brand-muted)' }}>Usuário</Label>
              <SearchSelect value={form.user_id} onChange={v => set('user_id', v)}
                options={users} placeholder="Selecione o usuário..." />
            </div>
          )}

          {/* Cliente */}
          <div>
            <Label className="text-xs mb-1 block" style={{ color: 'var(--brand-muted)' }}>Cliente</Label>
            <SearchSelect
              value={form.customer_id}
              onChange={v => setForm(f => ({ ...f, customer_id: v, project_id: '' }))}
              options={customers} placeholder="Todos os clientes" />
          </div>

          {/* Projeto */}
          <div>
            <Label className="text-xs mb-1 block" style={{ color: 'var(--brand-muted)' }}>Projeto *</Label>
            <SearchSelect value={form.project_id} onChange={v => set('project_id', v)}
              options={projects}
              placeholder={form.customer_id ? 'Selecione o projeto...' : 'Selecione o cliente primeiro'} />
          </div>

          {/* Data */}
          <div>
            <Label className="text-xs mb-1 block" style={{ color: 'var(--brand-muted)' }}>Data *</Label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
              className={inputCls} style={inputStyle} />
          </div>

          {/* Toggle Horário / Total de Horas */}
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
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs mb-1 block" style={{ color: 'var(--brand-muted)' }}>Início *</Label>
                <input type="time" value={form.start_time}
                  onChange={e => set('start_time', e.target.value)}
                  className={inputCls} style={inputStyle} />
              </div>
              <div>
                <Label className="text-xs mb-1 block" style={{ color: 'var(--brand-muted)' }}>Fim {timeDriver === 'end' ? '*' : ''}</Label>
                <input type="time" value={form.end_time}
                  onChange={e => { setTimeDriver('end'); set('end_time', e.target.value) }}
                  className={inputCls} style={inputStyle} />
              </div>
              <div>
                <Label className="text-xs mb-1 block" style={{ color: 'var(--brand-muted)' }}>Total {timeDriver === 'total' ? '*' : ''}</Label>
                <input type="text" value={form.total_hours} placeholder="ex: 2:30"
                  onChange={e => { setTimeDriver('total'); set('total_hours', e.target.value) }}
                  className={inputCls} style={inputStyle} />
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
                <Label className="text-xs mb-1 block" style={{ color: 'var(--brand-muted)' }}>Total de Horas *</Label>
                <input type="text" value={form.total_hours} placeholder="ex: 2:30"
                  onChange={e => set('total_hours', e.target.value)}
                  className={inputCls} style={inputStyle} />
              </div>
            </>
          )}

          {/* Ticket — apenas para projetos de sustentação */}
          {projects.find(p => String(p.id) === form.project_id)?.service_type_code === 'sustentacao' && (
            <div>
              <Label className="text-xs mb-1 block" style={{ color: 'var(--brand-muted)' }}>Ticket</Label>
              <input type="number" value={form.ticket} placeholder="Ex: 12345"
                onChange={e => set('ticket', e.target.value.replace(/\D/g, ''))}
                className={`${inputCls} [appearance:none] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`} style={inputStyle} />
            </div>
          )}

          {/* Observação */}
          <div>
            <Label className="text-xs mb-1 block" style={{ color: 'var(--brand-muted)' }}>Observação</Label>
            <textarea value={form.observation} rows={4}
              placeholder="Descreva as atividades realizadas..."
              onChange={e => set('observation', e.target.value)}
              className={inputCls + ' resize-none'} style={inputStyle} />
          </div>

          {/* Ações */}
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving || !form.project_id}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
              style={{ background: 'var(--brand-primary)', color: '#0A0A0B' }}>
              <Save size={12} />
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <Link href="/timesheets"
              className="flex items-center px-4 py-2 rounded-lg text-xs font-medium transition-colors"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--brand-muted)', border: '1px solid var(--brand-border)' }}>
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}
