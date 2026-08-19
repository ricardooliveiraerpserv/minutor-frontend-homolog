'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { SectionLoader } from '@/components/ui/loading'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { Mail, Plus, Trash2, Save, Send, Eye, X, Workflow as WorkflowIcon, ChevronDown } from 'lucide-react'

type Channel = 'off' | 'to' | 'cc'

interface Audience { audience: string; label: string; channel: Channel; default: Channel; recommended?: boolean }
interface ExtraEmail { email: string; channel: 'to' | 'cc' }
interface Template { subject: string; body: string; variables: Record<string, string>; default_subject: string; default_body: string; recurrence_days?: number }
interface WorkflowItem {
  key: string
  label: string
  domain: string
  description?: string | null
  recurrence?: boolean
  audiences: Audience[]
  available: { audience: string; label: string }[]
  template: Template
  extra_emails: ExtraEmail[]
}

const CHANNELS: { value: Channel; label: string; cls: string }[] = [
  { value: 'off', label: 'Não envia', cls: 'bg-[var(--surface-hover)] text-[var(--text)]' },
  { value: 'to',  label: 'Destinatário', cls: 'bg-[var(--success-border)] text-black' },
  { value: 'cc',  label: 'Em cópia', cls: 'bg-sky-500 text-black' },
]

// Título amigável e ordem (sequência) dos blocos por rotina/domínio.
const DOMAIN_LABELS: Record<string, string> = {
  'Requisições': 'Requisições',
  'Contratos':   'Contratos',
  'Projetos':    'Projetos',
  'Fechamento':  'Fechamento',
  'Apontamento': 'Apontamento',
  'Triagem':     'Triagem',
  'Despesas':    'Despesas',
  'Contratações': 'Contratações',
}
const DOMAIN_ORDER = ['Requisições', 'Contratos', 'Projetos', 'Fechamento', 'Apontamento', 'Triagem', 'Despesas', 'Contratações']

export default function WorkflowsPage() {
  const { user } = useAuth()
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([])
  const [catalog, setCatalog] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState<Record<string, string>>({})
  const [testingKey, setTestingKey] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [openDomains, setOpenDomains] = useState<Set<string>>(new Set())
  const [openWorkflows, setOpenWorkflows] = useState<Set<string>>(new Set())

  const toggleDomain = (d: string) => setOpenDomains(prev => {
    const next = new Set(prev)
    next.has(d) ? next.delete(d) : next.add(d)
    return next
  })
  const toggleWorkflow = (k: string) => setOpenWorkflows(prev => {
    const next = new Set(prev)
    next.has(k) ? next.delete(k) : next.add(k)
    return next
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<{ workflows: WorkflowItem[]; audiences: Record<string, string> }>('/workflows')
      setWorkflows(data.workflows)
      setCatalog(data.audiences)
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

  const openPreview = async (w: WorkflowItem) => {
    setPreviewing(w.key)
    try {
      const r = await api.post<{ html: string }>(`/workflows/${w.key}/preview`, { subject: w.template.subject, body: w.template.body })
      setPreviewHtml(r.html)
    } catch {
      toast.error('Falha ao gerar a pré-visualização')
    } finally {
      setPreviewing(null)
    }
  }

  const sendTest = async (wfKey: string) => {
    const email = (testEmail[wfKey] || '').trim()
    if (!email) { toast.error('Informe um e-mail para o teste'); return }
    setTestingKey(wfKey)
    try {
      await api.post(`/workflows/${wfKey}/test`, { email })
      toast.success(`E-mail de teste enviado para ${email}`)
    } catch {
      toast.error('Falha ao enviar o teste')
    } finally {
      setTestingKey(null)
    }
  }

  const setTemplate = (wfKey: string, patch: Partial<Template>) => {
    setWorkflows(prev => prev.map(w => w.key !== wfKey ? w : { ...w, template: { ...w.template, ...patch } }))
  }

  const addAudience = (wfKey: string, audience: string) => {
    if (!audience) return
    setWorkflows(prev => prev.map(w => {
      if (w.key !== wfKey || w.audiences.some(a => a.audience === audience)) return w
      return { ...w, audiences: [...w.audiences, { audience, label: catalog[audience] ?? audience, channel: 'to', default: 'off' }] }
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
      const payload: Record<string, unknown> = { audiences, extra_emails, subject: w.template.subject, body: w.template.body }
      if (w.recurrence) payload.recurrence_days = Math.max(0, Number(w.template.recurrence_days) || 0)
      await api.put(`/workflows/${w.key}`, payload)
      toast.success(`"${w.label}" salvo`)
    } catch {
      toast.error('Falha ao salvar')
    } finally {
      setSavingKey(null)
    }
  }

  if (user && user.type !== 'admin') {
    return <AppLayout title="Workflows de E-mail"><div className="p-6 text-[var(--text-muted)]">Acesso restrito a administradores.</div></AppLayout>
  }

  const presentDomains = [...new Set(workflows.map(w => w.domain))]
  const orderedDomains = [
    ...DOMAIN_ORDER.filter(d => presentDomains.includes(d)),
    ...presentDomains.filter(d => !DOMAIN_ORDER.includes(d)),
  ]

  return (
    <AppLayout title="Workflows de E-mail">
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-1 text-[var(--text)]">
          <WorkflowIcon size={20} className="text-[var(--success)]" />
          <h1 className="text-lg font-bold">Central de Workflows</h1>
        </div>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          Defina, por papel, quem recebe cada e-mail do sistema — como <b className="text-[var(--success)]">Destinatário</b> ou <b className="text-[var(--primary)]">Em cópia</b>. Novos workflows aparecem aqui automaticamente.
        </p>

        {loading ? (
          <SectionLoader />
        ) : orderedDomains.map(domain => {
          const items = workflows.filter(w => w.domain === domain)
          const open = openDomains.has(domain)
          return (
          <div key={domain} className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] overflow-hidden">
            <button onClick={() => toggleDomain(domain)}
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--surface-hover)] transition-colors">
              <ChevronDown size={16} className={`text-[var(--text-muted)] transition-transform ${open ? '' : '-rotate-90'}`} />
              <span className="font-bold text-[var(--text)] text-sm">{DOMAIN_LABELS[domain] ?? domain}</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--surface-hover)] text-[var(--text-muted)]">{items.length}</span>
            </button>
            {open && (
            <div className="px-4 pb-4 pt-1 space-y-3">
              {items.map(w => {
                const wfOpen = openWorkflows.has(w.key)
                return (
                <div key={w.key} className="rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => toggleWorkflow(w.key)} className="flex items-start gap-2 text-left min-w-0">
                      <ChevronDown size={14} className={`mt-1 shrink-0 text-[var(--text-light)] transition-transform ${wfOpen ? '' : '-rotate-90'}`} />
                      <div className="min-w-0">
                        <div className="font-semibold text-[var(--text)] flex items-center gap-2"><Mail size={14} className="text-[var(--text-light)]" />{w.label}</div>
                        {w.description && <div className="text-xs text-[var(--text-muted)] mt-0.5">{w.description}</div>}
                      </div>
                    </button>
                    <button onClick={() => save(w)} disabled={savingKey === w.key}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--success-border)] text-black text-xs font-bold disabled:opacity-50">
                      <Save size={13} /> {savingKey === w.key ? 'Salvando…' : 'Salvar'}
                    </button>
                  </div>

                  {wfOpen && (<>

                  {/* Modelo de e-mail — título + texto editáveis */}
                  <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] p-3">
                    <div className="text-[11px] uppercase tracking-wider text-[var(--text-light)] font-bold mb-2">Modelo de e-mail</div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Título (assunto)</label>
                    <input value={w.template.subject} onChange={e => setTemplate(w.key, { subject: e.target.value })}
                      className="w-full bg-[var(--surface-hover)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-sm text-[var(--text)] mb-2" />
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Texto</label>
                    <textarea value={w.template.body} onChange={e => setTemplate(w.key, { body: e.target.value })} rows={3}
                      className="w-full bg-[var(--surface-hover)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-sm text-[var(--text)]" />
                    {Object.keys(w.template.variables).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="text-[11px] text-[var(--text-light)]">Variáveis:</span>
                        {Object.entries(w.template.variables).map(([v, desc]) => (
                          <span key={v} title={desc} className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--success)] font-mono cursor-default">{'{'}{v}{'}'}</span>
                        ))}
                      </div>
                    )}
                    {w.recurrence && (
                      <div className="mt-3 pt-3 border-t border-[var(--border)]">
                        <label className="block text-xs text-[var(--text-muted)] mb-1">Recorrência — reenviar enquanto não for paga</label>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--text-muted)]">A cada</span>
                          <input
                            type="number" min={0} max={365}
                            value={w.template.recurrence_days ?? 0}
                            onChange={e => setTemplate(w.key, { recurrence_days: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })}
                            className="w-20 bg-[var(--surface-hover)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-sm text-[var(--text)] text-center" />
                          <span className="text-xs text-[var(--text-muted)]">dia(s). Use <b>0</b> para enviar só o aviso na aprovação (sem repetir).</span>
                        </div>
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center gap-2">
                      <button onClick={() => openPreview(w)} disabled={previewing === w.key}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-hover)] text-[var(--text)] text-xs font-bold disabled:opacity-50">
                        <Eye size={13} /> {previewing === w.key ? 'Gerando…' : 'Pré-visualizar'}
                      </button>
                      <input value={testEmail[w.key] || ''} onChange={e => setTestEmail(p => ({ ...p, [w.key]: e.target.value }))}
                        placeholder="e-mail para teste" type="email"
                        className="flex-1 bg-[var(--surface-hover)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-sm text-[var(--text)]" />
                      <button onClick={() => sendTest(w.key)} disabled={testingKey === w.key}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 text-black text-xs font-bold disabled:opacity-50">
                        <Send size={13} /> {testingKey === w.key ? 'Enviando…' : 'Enviar teste'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 text-[11px] uppercase tracking-wider text-[var(--text-light)] font-bold">Destinatários</div>
                  <div className="mt-1 divide-y divide-[var(--border)]">
                    {w.audiences.map(a => (
                      <div key={a.audience} className="flex items-center justify-between gap-3 py-2">
                        <span className="text-sm text-[var(--text)]">
                          {a.label}
                          {!a.recommended && <span className="ml-2 text-[10px] uppercase tracking-wide text-[var(--text-light)]">incluída</span>}
                        </span>
                        <div className="flex gap-1">
                          {CHANNELS.map(c => (
                            <button key={c.value} onClick={() => setChannel(w.key, a.audience, c.value)}
                              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${a.channel === c.value ? c.cls : 'bg-transparent text-[var(--text-light)] border border-[var(--border)]'}`}>
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Incluir qualquer categoria de usuário (sem depender de código) */}
                  {(() => {
                    const remaining = w.available.filter(a => !w.audiences.some(x => x.audience === a.audience))
                    if (remaining.length === 0) return null
                    return (
                      <div className="mt-2">
                        <select value="" onChange={e => { addAudience(w.key, e.target.value); e.target.value = '' }}
                          className="bg-[var(--surface-hover)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs text-[var(--success)] font-semibold">
                          <option value="">+ Incluir categoria de usuário…</option>
                          {remaining.map(a => <option key={a.audience} value={a.audience} className="text-[var(--text)]">{a.label}</option>)}
                        </select>
                      </div>
                    )
                  })()}

                  <div className="mt-3 pt-3 border-t border-[var(--border)]">
                    <div className="text-[11px] uppercase tracking-wider text-[var(--text-light)] font-bold mb-2">E-mails fixos extras</div>
                    {w.extra_emails.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 mb-2">
                        <input value={e.email} onChange={ev => setExtra(w.key, i, { email: ev.target.value })}
                          placeholder="email@empresa.com" type="email"
                          className="flex-1 bg-[var(--surface-hover)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-sm text-[var(--text)]" />
                        <select value={e.channel} onChange={ev => setExtra(w.key, i, { channel: ev.target.value as 'to' | 'cc' })}
                          className="bg-[var(--surface-hover)] border border-[var(--border)] rounded-md px-2 py-1.5 text-sm text-[var(--text)]">
                          <option value="to">Destinatário</option>
                          <option value="cc">Em cópia</option>
                        </select>
                        <button onClick={() => removeExtra(w.key, i)} className="text-[var(--text-light)] hover:text-[var(--danger)] p-1"><Trash2 size={15} /></button>
                      </div>
                    ))}
                    <button onClick={() => addExtra(w.key)} className="flex items-center gap-1 text-xs text-[var(--success)] font-semibold">
                      <Plus size={13} /> Adicionar e-mail fixo
                    </button>
                  </div>

                  </>)}
                </div>
                )
              })}
            </div>
            )}
          </div>
          )
        })}
      </div>

      {previewHtml !== null && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPreviewHtml(null)}>
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
              <span className="text-sm font-bold text-[var(--text)]">Pré-visualização do e-mail</span>
              <button onClick={() => setPreviewHtml(null)} className="text-[var(--text-muted)] hover:text-[var(--text)]"><X size={18} /></button>
            </div>
            <iframe srcDoc={previewHtml} className="w-full flex-1 rounded-b-xl" style={{ minHeight: '70vh', background: '#000' }} title="Pré-visualização do e-mail" />
          </div>
        </div>
      )}
    </AppLayout>
  )
}
