'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { SearchSelect } from '@/components/ui/search-select'
import {
  Webhook, CheckCircle2, XCircle, Clock, RefreshCw, Copy, Check,
  AlertTriangle, Zap, Database, Settings, PlayCircle,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface MovideskStatus {
  last_sync: string | null
  last_sync_human: string | null
  total_imported: number
  today_imported: number
  token_configured: boolean
  error?: string
}

interface SystemSettings {
  movidesk?: {
    movidesk_default_customer_id?: { value: number | null }
    movidesk_default_project_id?:  { value: number | null }
  }
}

interface SelectOption { id: number | string; name: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

const WEBHOOK_URL = 'https://api.minutor.com.br/api/v1/webhooks/movidesk/ticket'

function KpiCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: any; color: string
}) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-2" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
          <Icon size={16} style={{ color }} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-subtle)' }}>{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MovideskIntegracaoPage() {
  const { user } = useAuth()
  const isAdmin = user?.type === 'admin'

  const [status, setStatus]       = useState<MovideskStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [syncing, setSyncing]     = useState(false)
  const [syncOutput, setSyncOutput] = useState('')
  const [copied, setCopied]       = useState(false)

  const [customers, setCustomers] = useState<SelectOption[]>([])
  const [projects,  setProjects]  = useState<SelectOption[]>([])
  const [defaultCustomer, setDefaultCustomer] = useState('')
  const [defaultProject,  setDefaultProject]  = useState('')
  const [saving, setSaving] = useState(false)

  const loadStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const r = await api.get<MovideskStatus>('/movidesk/status')
      setStatus(r)
    } catch { setStatus(null) }
    finally { setStatusLoading(false) }
  }, [])

  const loadSettings = useCallback(async () => {
    try {
      const [settingsRes, custRes, projRes] = await Promise.all([
        api.get<SystemSettings>('/system-settings'),
        api.get<any>('/customers?pageSize=500'),
        api.get<any>('/projects?pageSize=500&status=open&gestao=false'),
      ])
      const items = (r: any) => Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []
      setCustomers(items(custRes))
      setProjects(items(projRes))

      const mv = (settingsRes as any)?.movidesk ?? {}
      setDefaultCustomer(String(mv.movidesk_default_customer_id?.value ?? ''))
      setDefaultProject(String(mv.movidesk_default_project_id?.value ?? ''))
    } catch {}
  }, [])

  useEffect(() => { loadStatus(); loadSettings() }, [loadStatus, loadSettings])

  const copyWebhook = () => {
    navigator.clipboard.writeText(WEBHOOK_URL).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncOutput('')
    try {
      const r = await api.post<any>('/movidesk/sync', {})
      setSyncOutput(r.output ?? 'Sincronização concluída.')
      setStatus(prev => prev ? {
        ...prev,
        last_sync_human: r.last_sync_human,
        today_imported: r.today_imported,
        total_imported: r.total_imported,
      } : prev)
      toast.success('Sincronização manual concluída')
    } catch (e: any) {
      setSyncOutput(e?.message ?? 'Erro ao sincronizar')
      toast.error('Erro na sincronização')
    } finally { setSyncing(false) }
  }

  const handleSaveSettings = async () => {
    setSaving(true)
    try {
      await api.put('/system-settings', {
        movidesk_default_customer_id: defaultCustomer ? Number(defaultCustomer) : null,
        movidesk_default_project_id:  defaultProject  ? Number(defaultProject)  : null,
      })
      toast.success('Configurações salvas')
    } catch { toast.error('Erro ao salvar configurações') }
    finally { setSaving(false) }
  }

  if (!isAdmin) {
    return (
      <AppLayout title="Integração Movidesk">
        <div className="flex items-center justify-center h-64">
          <p style={{ color: 'var(--brand-subtle)' }}>Acesso restrito a administradores.</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Integração Movidesk">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(0,245,255,0.10)', border: '1px solid rgba(0,245,255,0.2)' }}>
            <Webhook size={22} style={{ color: '#00F5FF' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--brand-text)' }}>Integração Movidesk</h1>
            <p className="text-sm" style={{ color: 'var(--brand-subtle)' }}>Importação automática de apontamentos via webhook e varredura a cada 20 min</p>
          </div>
          <button onClick={loadStatus} className="ml-auto p-2 rounded-lg transition-colors hover:bg-white/[0.06]" title="Atualizar status">
            <RefreshCw size={15} style={{ color: 'var(--brand-subtle)' }} className={statusLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Status KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="Token API"
            value={status?.token_configured ? 'Configurado' : 'Ausente'}
            icon={status?.token_configured ? CheckCircle2 : XCircle}
            color={status?.token_configured ? '#22c55e' : '#ef4444'}
          />
          <KpiCard
            label="Última Varredura"
            value={status?.last_sync_human ?? '—'}
            icon={Clock}
            color="#00F5FF"
          />
          <KpiCard
            label="Hoje"
            value={status?.today_imported ?? 0}
            icon={Zap}
            color="#a78bfa"
          />
          <KpiCard
            label="Total Importado"
            value={status?.total_imported ?? 0}
            icon={Database}
            color="#f59e0b"
          />
        </div>

        {/* Token alerta */}
        {status && !status.token_configured && (
          <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertTriangle size={16} style={{ color: '#ef4444', marginTop: 1, flexShrink: 0 }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#ef4444' }}>Token da API não configurado</p>
              <p className="text-xs mt-1" style={{ color: '#fca5a5' }}>
                Configure a variável de ambiente <code className="font-mono bg-white/[0.08] px-1 rounded">MOVIDESK_API_TOKEN</code> no servidor com o token gerado no painel Movidesk em <strong>Configurações → Integrações → API</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Webhook */}
        <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          <div className="flex items-center gap-2">
            <Webhook size={16} style={{ color: '#00F5FF' }} />
            <h2 className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Configuração do Webhook</h2>
          </div>

          <div>
            <p className="text-xs mb-2" style={{ color: 'var(--brand-subtle)' }}>
              Registre esta URL no painel Movidesk em <strong style={{ color: 'var(--brand-muted)' }}>Configurações → Gatilhos → Novo Gatilho</strong> com método <strong style={{ color: 'var(--brand-muted)' }}>POST</strong>, disparado em <strong style={{ color: 'var(--brand-muted)' }}>Ticket Atualizado</strong> (inclua criação e alteração de apontamentos):
            </p>
            <div className="flex items-center gap-2 p-3 rounded-xl font-mono text-xs" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-primary)' }}>
              <span className="flex-1 truncate">{WEBHOOK_URL}</span>
              <button onClick={copyWebhook} className="flex items-center gap-1 px-2 py-1 rounded-lg transition-colors hover:bg-white/[0.08] shrink-0" style={{ color: copied ? '#22c55e' : 'var(--brand-subtle)' }}>
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>

          <div className="rounded-xl p-3 text-xs space-y-1.5" style={{ background: 'rgba(0,245,255,0.04)', border: '1px solid rgba(0,245,255,0.12)' }}>
            <p className="font-semibold" style={{ color: '#00F5FF' }}>Configuração no Movidesk</p>
            <ol className="space-y-1 list-decimal list-inside" style={{ color: 'var(--brand-muted)' }}>
              <li>Acesse <strong>Configurações → API</strong> e gere um token de integração</li>
              <li>Configure <code className="font-mono bg-white/[0.08] px-1 rounded">MOVIDESK_API_TOKEN</code> no servidor com esse token</li>
              <li>Acesse <strong>Configurações → Gatilhos</strong> e crie um gatilho POST para a URL acima</li>
              <li>Selecione os eventos: <em>Ticket criado</em>, <em>Ticket atualizado</em>, <em>Apontamento adicionado</em></li>
              <li>No corpo do gatilho, envie: <code className="font-mono bg-white/[0.08] px-1 rounded">{`{"id":"{{ticket.id}}"}`}</code></li>
            </ol>
          </div>
        </div>

        {/* Padrões de importação */}
        <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          <div className="flex items-center gap-2">
            <Settings size={16} style={{ color: '#a78bfa' }} />
            <h2 className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Padrões de Importação</h2>
            <span className="text-xs ml-1" style={{ color: 'var(--brand-subtle)' }}>— usados quando cliente ou projeto não são identificados automaticamente</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: 'var(--brand-subtle)' }}>Cliente Padrão</label>
              <SearchSelect
                value={defaultCustomer}
                onChange={setDefaultCustomer}
                options={customers}
                placeholder="Nenhum (ignorar ticket)"
                fullWidth
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: 'var(--brand-subtle)' }}>Projeto Padrão</label>
              <SearchSelect
                value={defaultProject}
                onChange={setDefaultProject}
                options={projects}
                placeholder="Nenhum (ignorar ticket)"
                fullWidth
              />
            </div>
          </div>

          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: '#00F5FF', color: '#0A0A0B' }}>
            {saving ? 'Salvando...' : 'Salvar Padrões'}
          </button>
        </div>

        {/* Sync manual */}
        <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          <div className="flex items-center gap-2">
            <PlayCircle size={16} style={{ color: '#22c55e' }} />
            <h2 className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Sincronização Manual</h2>
          </div>
          <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
            Dispara uma varredura imediata a partir da última sincronização (até 2h de janela). O cron automático já roda a cada 20 minutos em background.
          </p>
          <div className="flex items-start gap-3">
            <button
              onClick={handleSync}
              disabled={syncing || !status?.token_configured}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
              style={{ background: '#22c55e', color: '#fff' }}>
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Sincronizando...' : 'Sincronizar Agora'}
            </button>
            {!status?.token_configured && (
              <span className="text-xs mt-2" style={{ color: '#f59e0b' }}>Token não configurado — configure antes de sincronizar</span>
            )}
          </div>
          {syncOutput && (
            <div className="p-3 rounded-xl font-mono text-xs whitespace-pre-wrap" style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-muted)', maxHeight: 200, overflowY: 'auto' }}>
              {syncOutput}
            </div>
          )}
        </div>

        {/* Info cron */}
        <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)' }}>
          <Clock size={14} style={{ color: '#a78bfa', marginTop: 1, flexShrink: 0 }} />
          <p className="text-xs" style={{ color: 'var(--brand-muted)' }}>
            <strong style={{ color: '#a78bfa' }}>Varredura automática:</strong> roda a cada 20 minutos em background, buscando apontamentos da última janela sincronizada com 20 min de sobreposição para garantir que nenhum registro seja perdido. O webhook garante importação em tempo real assim que o ticket é atualizado no Movidesk.
          </p>
        </div>

      </div>
    </AppLayout>
  )
}
