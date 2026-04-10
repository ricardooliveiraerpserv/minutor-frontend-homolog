'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useApiQuery } from '@/hooks/use-query'
import { Timesheet } from '@/types'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'

interface Project { id: number; name: string; code: string }
interface ProjectsResponse { items: Project[] }

export default function EditTimesheetPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const { data: raw, loading, error } = useApiQuery<{ success: boolean; data: Timesheet }>(`/timesheets/${id}`)
  const ts = raw?.data ?? (raw as unknown as Timesheet | null)

  const { data: projectsData, error: projectsError } = useApiQuery<ProjectsResponse>('/projects?minimal=1&status=active&pageSize=200')
  const projects = projectsData?.items ?? []

  const [form, setForm] = useState({
    project_id: '',
    date: '',
    start_time: '',
    end_time: '',
    ticket: '',
    observation: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (ts) {
      setForm({
        project_id: String(ts.project_id),
        date: ts.date ?? '',
        start_time: ts.start_time ?? '',
        end_time: ts.end_time ?? '',
        ticket: ts.ticket ?? '',
        observation: ts.observation ?? '',
      })
    }
  }, [ts])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.put(`/timesheets/${id}`, {
        project_id: Number(form.project_id),
        date: form.date,
        start_time: form.start_time,
        end_time: form.end_time,
        ticket: form.ticket || null,
        observation: form.observation || null,
      })
      toast.success('Apontamento atualizado')
      router.push('/timesheets')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppLayout
      title="Editar Apontamento"
      actions={
        <Link
          href="/timesheets"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft size={12} />
          Voltar
        </Link>
      }
    >
      {loading && (
        <div className="max-w-lg space-y-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {!loading && ts && (
        <form onSubmit={handleSubmit} className="max-w-lg space-y-4">

          {/* Projeto */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">Projeto *</label>
            {projectsError ? (
              <p className="text-xs text-red-500 py-1">{projectsError}</p>
            ) : (
              <select
                required
                value={form.project_id}
                onChange={set('project_id')}
                className="w-full px-3 py-2 rounded-md text-xs border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Selecione um projeto...</option>
                {projects.map(p => (
                  <option key={p.id} value={String(p.id)}>
                    {p.code ? `[${p.code}] ` : ''}{p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Data */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">Data *</label>
            <input
              type="date"
              required
              value={form.date}
              onChange={set('date')}
              className="w-full px-3 py-2 rounded-md text-xs border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Horários */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Início *</label>
              <input
                type="time"
                required
                value={form.start_time}
                onChange={set('start_time')}
                className="w-full px-3 py-2 rounded-md text-xs border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Fim *</label>
              <input
                type="time"
                required
                value={form.end_time}
                onChange={set('end_time')}
                className="w-full px-3 py-2 rounded-md text-xs border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Ticket */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">Ticket</label>
            <input
              type="text"
              value={form.ticket}
              onChange={set('ticket')}
              placeholder="Ex: 12345"
              className="w-full px-3 py-2 rounded-md text-xs border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Observação */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">Observação</label>
            <textarea
              value={form.observation}
              onChange={set('observation')}
              rows={4}
              placeholder="Descreva as atividades realizadas..."
              className="w-full px-3 py-2 rounded-md text-xs border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Status (somente leitura) */}
          <div className="rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-xs text-zinc-500">
            Status atual: <strong className="text-zinc-300">{ts.status_display ?? ts.status}</strong>
            {ts.rejection_reason && (
              <span className="ml-2 text-red-400">— {ts.rejection_reason}</span>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
            >
              <Save size={12} />
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
            <Link
              href="/timesheets"
              className="flex items-center px-4 py-2 rounded-md text-xs font-medium border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancelar
            </Link>
          </div>
        </form>
      )}
    </AppLayout>
  )
}
