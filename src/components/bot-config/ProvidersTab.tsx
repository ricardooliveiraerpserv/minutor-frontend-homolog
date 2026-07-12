'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Key, Plus, Save, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { createProvider, deleteProvider, listProviders, updateProvider } from '@/lib/bot-config'
import { Skeleton } from '@/components/ui/skeleton'
import type { BotProvider } from '@/types/bot'

const input = 'w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500'

function NewProviderModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [apiKeyEnv, setApiKeyEnv] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [defaultModel, setDefaultModel] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await createProvider({
        slug: slug.trim(),
        name: name.trim(),
        api_key_env: apiKeyEnv.trim(),
        base_url: baseUrl.trim() || null,
        default_model: defaultModel.trim(),
        enabled: false,
      })
      await qc.invalidateQueries({ queryKey: ['bot-providers'] })
      toast.success('Provider criado (configure a env var no servidor pra ativar)')
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-lg p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Novo Provider IA</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-200"><X size={16}/></button>
        </div>
        <p className="text-[11px] text-zinc-500">
          A chave nunca fica no banco. Defina o nome da env var aqui e configure o valor no servidor (Render → Environment).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Slug *</label>
            <input value={slug} onChange={e => setSlug(e.target.value)} className={input} placeholder="ex: gemini" required pattern="[a-z0-9_-]+" />
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Nome *</label>
            <input value={name} onChange={e => setName(e.target.value)} className={input} placeholder="ex: Google Gemini" required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Env var da API key *</label>
            <input value={apiKeyEnv} onChange={e => setApiKeyEnv(e.target.value)} className={input} placeholder="ex: GEMINI_API_KEY" required />
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Modelo padrão *</label>
            <input value={defaultModel} onChange={e => setDefaultModel(e.target.value)} className={input} placeholder="ex: gemini-2.5-flash" required />
          </div>
        </div>
        <div>
          <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Base URL</label>
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} className={input} placeholder="(opcional)" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-1.5 rounded text-xs text-zinc-300 hover:bg-zinc-800">Cancelar</button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-emerald-500 text-zinc-950 text-xs font-semibold hover:bg-emerald-400 disabled:opacity-50"
          >
            <Save size={12}/> Criar Provider
          </button>
        </div>
      </form>
    </div>
  )
}

export function ProvidersTab() {
  const qc = useQueryClient()
  const [newOpen, setNewOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['bot-providers'],
    queryFn: listProviders,
  })

  if (isLoading) {
    return <Skeleton className="h-40 bg-zinc-800" />
  }

  const items = data?.data ?? []

  const toggle = async (id: number, enabled: boolean) => {
    try {
      await updateProvider(id, { enabled: !enabled })
      await qc.invalidateQueries({ queryKey: ['bot-providers'] })
      toast.success(enabled ? 'Provider desativado' : 'Provider ativado')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const remove = async (p: BotProvider) => {
    if (!confirm(`Excluir o provider "${p.name}"? Esta ação é permanente.`)) return
    try {
      await deleteProvider(p.id)
      await qc.invalidateQueries({ queryKey: ['bot-providers'] })
      toast.success('Provider excluído')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-zinc-500 flex-1">
          A chave da API <strong>nunca</strong> é salva no banco. O campo <code>api_key_env</code> guarda apenas o nome
          da variável de ambiente que o servidor lê em runtime.
        </p>
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500 text-zinc-950 text-xs font-semibold hover:bg-emerald-400 shrink-0"
        >
          <Plus size={12}/> Novo Provider
        </button>
      </div>

      {items.map(p => (
        <div key={p.id} className="border border-zinc-800 rounded-md p-4 bg-zinc-900/30">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-100">{p.name}</h3>
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{p.slug}</span>
                {p.has_key
                  ? <span className="text-[10px] inline-flex items-center gap-1 text-emerald-400"><Check size={11}/> key configurada</span>
                  : <span className="text-[10px] inline-flex items-center gap-1 text-amber-400"><Key size={11}/> sem key</span>}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">
                ENV: <code>{p.api_key_env}</code> · modelo padrão: <code>{p.default_model}</code>
              </p>
              {p.base_url && <p className="text-[11px] text-zinc-600 mt-0.5 truncate">{p.base_url}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => toggle(p.id, p.enabled)}
                className={[
                  'text-xs px-3 py-1.5 rounded border transition-colors',
                  p.enabled
                    ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20'
                    : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800',
                ].join(' ')}
              >
                {p.enabled ? 'Ativo' : 'Inativo'}
              </button>
              <button
                type="button"
                onClick={() => remove(p)}
                title="Excluir provider"
                className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
              >
                <Trash2 size={14}/>
              </button>
            </div>
          </div>
        </div>
      ))}

      {newOpen && <NewProviderModal onClose={() => setNewOpen(false)} />}
    </div>
  )
}
