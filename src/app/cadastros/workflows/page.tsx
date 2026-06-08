'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { Mail, Plus, Trash2, Save, Workflow as WorkflowIcon } from 'lucide-react'

type Channel = 'off' | 'to' | 'cc'

interface Audience { audience: string; label: string; channel: Channel; default: Channel }
interface ExtraEmail { email: string; channel: 'to' | 'cc' }
interface WorkflowItem {
  key: string
  label: string
  domain: string
  description?: string | null
  audiences: Audience[]
  extra_emails: ExtraEmail[]
}

const CHANNELS: { value: Channel; label: string; cls: string }[] = [
  { value: 'off', label: 'Não envia', cls: 'bg-zinc-700/40 text-zinc-300' },
  { value: 'to',  label: 'Para (To)', cls: 'bg-emerald-500 text-black' },
  { value: 'cc',  label: 'Cópia (Cc)', cls: 'bg-sky-500 text-black' },
]

export default function WorkflowsPage() {
  const { user } = useAuth()
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<{ workflows: WorkflowItem[] }>('/workflows')
      setWorkflows(data.workflows)
    } catch {
      toast.error('Falha ao carregar os workflows')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const setChannel = (wfKey: string, audience: string, channel: Channel) => {
    setWorkflows(prev => prev.map(w => w.key !== wfKey ? w : {
      ...w, audiences: w.audiences.map(a => a.audience === audience ? { ...a, channel } : a),
    }))
  }

  const addExtra = (wfKey: string) => {
    setWorkflows(prev => prev.map(w => w.key !== wfKey ? w : {
      ...w, extra_emails: [...w.extra_emails, { email: '', channel: 'cc' }],
    }))
  }
  const setExtra = (wfKey: string, idx: number, patch: Partial<ExtraEmail>) => {
    setWorkflows(prev => prev.map(w => w.key !== wfKey ? w : {
      ...w, extra_emails: w.extra_emails.map((e, i) => i === idx ? { ...e, ...patch } : e),
    }))
  }
  const removeExtra = (wfKey: string, idx: number) => {
    setWorkflows(prev => prev.map(w => w.key !== wfKey ? w : {
      ...w, extra_emails: w.extra_emails.filter((_, i) => i !== idx),
    }))
  }

  const save = async (w: WorkflowItem) => {
    setSavingKey(w.key)
    try {
      const audiences: Record<string, Channel> = {}
      w.audiences.forEach(a => { audiences[a.audience] = a.channel })
      const extra_emails = w.extra_emails
        .filter(e => e.email.trim())
        .map(e => ({ email: e.email.trim(), channel: e.channel }))
      await api.put(`/workflows/${w.key}`, { audiences, extra_emails })
      toast.success(`"${w.label}" salvo`)
    } catch {
      toast.error('Falha ao salvar')
    } finally {
      setSavingKey(null)
    }
  }

  if (user && user.type !== 'admin') {
    return <AppLayout title="Workflows de E-mail"><div className="p-6 text-zinc-400">Acesso restrito a administradores.</div></AppLayout>
  }

  const domains = [...new Set(workflows.map(w => w.domain))]

  return (
    <AppLayout title="Workflows de E-mail">
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-1 text-zinc-200">
          <WorkflowIcon size={20} className="text-emerald-400" />
          <h1 className="text-lg font-bold">Central de Workflows</h1>
        </div>
        <p className="text-sm text-zinc-400 mb-6">
          Defina, por papel, quem recebe cada e-mail do sistema — em <b className="text-emerald-400">Para</b> ou <b className="text-sky-400">Cópia</b>. Novos workflows aparecem aqui automaticamente.
        </p>

        {loading ? (
          <div className="text-zinc-400">Carregando…</div>
        ) : domains.map(domain => (
          <div key={domain} className="mb-7">
            <div className="text-[11px] uppercase tracking-widest text-zinc-500 font-bold mb-2">{domain}</div>
            <div className="space-y-3">
              {workflows.filter(w => w.domain === domain).map(w => (
                <div key={w.key} className="rounded-xl border border-zinc-700 bg-zinc-900/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-zinc-100 flex items-center gap-2"><Mail size={14} className="text-zinc-500" />{w.label}</div>
                      {w.description && <div className="text-xs text-zinc-400 mt-0.5">{w.description}</div>}
                    </div>
                    <button onClick={() => save(w)} disabled={savingKey === w.key}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-black text-xs font-bold disabled:opacity-50">
                      <Save size={13} /> {savingKey === w.key ? 'Salvando…' : 'Salvar'}
                    </button>
                  </div>

                  <div className="mt-3 divide-y divide-zinc-800">
                    {w.audiences.map(a => (
                      <div key={a.audience} className="flex items-center justify-between gap-3 py-2">
                        <span className="text-sm text-zinc-300">{a.label}</span>
                        <div className="flex gap-1">
                          {CHANNELS.map(c => (
                            <button key={c.value} onClick={() => setChannel(w.key, a.audience, c.value)}
                              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${a.channel === c.value ? c.cls : 'bg-transparent text-zinc-500 border border-zinc-700'}`}>
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 pt-3 border-t border-zinc-800">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-2">E-mails fixos extras</div>
                    {w.extra_emails.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 mb-2">
                        <input value={e.email} onChange={ev => setExtra(w.key, i, { email: ev.target.value })}
                          placeholder="email@empresa.com" type="email"
                          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-md px-2.5 py-1.5 text-sm text-zinc-100" />
                        <select value={e.channel} onChange={ev => setExtra(w.key, i, { channel: ev.target.value as 'to' | 'cc' })}
                          className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-sm text-zinc-100">
                          <option value="to">Para</option>
                          <option value="cc">Cópia</option>
                        </select>
                        <button onClick={() => removeExtra(w.key, i)} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 size={15} /></button>
                      </div>
                    ))}
                    <button onClick={() => addExtra(w.key)} className="flex items-center gap-1 text-xs text-emerald-400 font-semibold">
                      <Plus size={13} /> Adicionar e-mail fixo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  )
}
