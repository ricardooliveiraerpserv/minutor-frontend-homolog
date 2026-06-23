'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  Settings,
  RefreshCw, CheckCircle, XCircle, Users, Shield, X, LayoutGrid,
} from 'lucide-react'
import type { SystemSettings } from '@/types'
import { UserManagementTab } from './UserManagementTab'
import { PermissionGroupsTab } from './PermissionGroupsTab'
import { ProfileModulesTab } from './ProfileModulesTab'

// ─── TABS ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'general', label: 'Geral',               icon: Settings },
  { id: 'users',   label: 'Usuários',             icon: Users },
  { id: 'groups',  label: 'Grupos de Permissões', icon: Shield },
  { id: 'perfis',  label: 'Cadastro de Perfil',   icon: LayoutGrid },
]

// ─── TAB: GENERAL SETTINGS ───────────────────────────────────────────────────

interface MovideskStatus {
  last_sync: string | null
  last_sync_human: string | null
  total_imported: number
  today_imported: number
  token_configured: boolean
}

function GeneralTab() {
  const [settings, setSettings] = useState<SystemSettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [movideskStatus, setMovideskStatus] = useState<MovideskStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncOutput, setSyncOutput] = useState<string | null>(null)
  const [importingSince, setImportingSince] = useState(false)

  const loadMovideskStatus = useCallback(async () => {
    try {
      const r = await api.get<MovideskStatus>('/movidesk/status')
      setMovideskStatus(r)
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => {
    api.get<{ data: SystemSettings }>('/system-settings')
      .then(s => setSettings(s.data ?? s as unknown as SystemSettings))
      .catch((e) => toast.error('Erro ao carregar configurações: ' + (e instanceof ApiError ? e.message : String(e))))
      .finally(() => setLoading(false))
    loadMovideskStatus()
  }, [loadMovideskStatus])

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/system-settings', settings)
      toast.success('Configurações salvas')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const syncMovidesk = async () => {
    setSyncing(true)
    setSyncOutput(null)
    try {
      const r = await api.post<{ success: boolean; message: string; output?: string; last_sync_human?: string; today_imported?: number; total_imported?: number }>('/movidesk/sync', {})
      setSyncOutput(r.output ?? r.message)
      setMovideskStatus(prev => prev ? {
        ...prev,
        last_sync_human: r.last_sync_human ?? prev.last_sync_human,
        today_imported:  r.today_imported  ?? prev.today_imported,
        total_imported:  r.total_imported  ?? prev.total_imported,
      } : null)
      toast.success('Sync concluído')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  const historyImport = async () => {
    const since = settings.movidesk_import_start_date
    if (!since) {
      toast.error('Defina a "Data início da importação" antes de importar histórico.')
      return
    }
    setImportingSince(true)
    setSyncOutput(null)
    try {
      const r = await api.post<{ success: boolean; message: string }>('/movidesk/history-import', { since })
      setSyncOutput(r.message)
      toast.success('Importação histórica enfileirada!')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao enfileirar importação')
    } finally {
      setImportingSince(false)
    }
  }

  if (loading) return <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>

  return (
    <div className="space-y-8 max-w-lg">
      <section>
        <h3 className="text-sm font-medium text-zinc-300 mb-4 pb-2 border-b border-zinc-800">Apontamento de Horas</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-zinc-400">Limite de dias para lançamento retroativo</Label>
            <Input
              type="number" min={0} max={365}
              value={settings.timesheet_retroactive_limit_days ?? ''}
              onChange={e => setSettings(s => ({ ...s, timesheet_retroactive_limit_days: Number(e.target.value) }))}
              className="mt-1.5 bg-zinc-800 border-zinc-700 text-white h-9 w-40"
            />
            <p className="text-[11px] text-zinc-500 mt-1">0 = sem limite. Máximo 365 dias.</p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-zinc-300 mb-4 pb-2 border-b border-zinc-800">Integração Movidesk</h3>

        {/* Status panel */}
        {movideskStatus && (
          <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Status da integração</span>
              {movideskStatus.token_configured
                ? <span className="inline-flex items-center gap-1 text-[11px] text-green-400"><CheckCircle size={11} /> Token configurado</span>
                : <span className="inline-flex items-center gap-1 text-[11px] text-red-400"><XCircle size={11} /> Token não configurado</span>
              }
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-zinc-800 px-3 py-2">
                <p className="text-[10px] text-zinc-500 mb-0.5">Último sync</p>
                <p className="text-xs font-semibold text-zinc-200">{movideskStatus.last_sync_human ?? '—'}</p>
              </div>
              <div className="rounded-lg bg-zinc-800 px-3 py-2">
                <p className="text-[10px] text-zinc-500 mb-0.5">Importados hoje</p>
                <p className="text-xs font-semibold text-zinc-200">{movideskStatus.today_imported}</p>
              </div>
              <div className="rounded-lg bg-zinc-800 px-3 py-2">
                <p className="text-[10px] text-zinc-500 mb-0.5">Total importado</p>
                <p className="text-xs font-semibold text-zinc-200">{movideskStatus.total_imported}</p>
              </div>
            </div>
            <Button
              onClick={syncMovidesk}
              disabled={syncing || !movideskStatus.token_configured}
              className="w-full h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40"
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
            </Button>
            {settings.movidesk_import_start_date && (
              <Button
                onClick={historyImport}
                disabled={importingSince || !movideskStatus?.token_configured}
                className="w-full h-8 text-xs gap-1.5 bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40"
              >
                <RefreshCw size={12} className={importingSince ? 'animate-spin' : ''} />
                {importingSince ? 'Enfileirando...' : `Importar histórico desde ${settings.movidesk_import_start_date}`}
              </Button>
            )}
            {syncOutput && (
              <pre className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-[10px] text-zinc-400 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                {syncOutput}
              </pre>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div
            className="rounded-lg border p-3"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text)' }}>
              Defaults Movidesk (automáticos)
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Apontamentos cujo autor não corresponde a nenhum consultor são atribuídos
              automaticamente a um Usuário, Cliente e Projeto reservados
              (<code>Padrão Movidesk (Fallback)</code>, criados sob demanda).
              Para reatribuir, edite o apontamento diretamente na lista de timesheets.
            </p>
          </div>

          {/* Data início importação */}
          <div className="pt-3 border-t border-zinc-800">
            <Label className="text-xs text-zinc-400 block mb-1.5">Data início da importação</Label>
            <p className="text-[11px] text-zinc-500 mb-1.5">Apontamentos com data anterior a esta serão ignorados na importação.</p>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={settings.movidesk_import_start_date ?? ''}
                onChange={e => setSettings(s => ({ ...s, movidesk_import_start_date: e.target.value || null }))}
                className="bg-zinc-800 border-zinc-700 text-white h-9 w-44 text-xs"
              />
              {settings.movidesk_import_start_date && (
                <button
                  type="button"
                  onClick={() => setSettings(s => ({ ...s, movidesk_import_start_date: null }))}
                  className="text-[11px] text-zinc-500 hover:text-zinc-200 flex items-center gap-1"
                >
                  <X size={11} /> Limpar
                </button>
              )}
            </div>
          </div>

          {/* Intervalos de varredura */}
          <div className="pt-3 border-t border-zinc-800 space-y-3">
            <p className="text-xs font-medium text-zinc-400">Intervalos de varredura automática</p>
            {([
              { label: 'Sync de organizações', key: 'movidesk_sync_orgs_interval_minutes' },
              { label: 'Sync do Portal de Sustentação', key: 'movidesk_portal_sync_interval_minutes' },
            ] as const).map(({ label, key }) => (
              <div key={key}>
                <Label className="text-xs text-zinc-500 block mb-1.5">{label}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {[5, 10, 15, 20, 30, 60].map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSettings(s => ({ ...s, [key]: v }))}
                      className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                        (settings[key] ?? 30) === v
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      {v} min
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white h-9 text-xs">
        {saving ? 'Salvando...' : 'Salvar configurações'}
      </Button>
    </div>
  )
}


// ─── PAGE ────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general')
  // Abre a tab vinda por ?tab= (ex.: "Cadastro de Perfil" → /settings?tab=perfis).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t && TABS.some(x => x.id === t)) setActiveTab(t)
  }, [])
  const active = TABS.find(t => t.id === activeTab)!

  return (
    <AppLayout title="Configurações">
      <div className="flex gap-6">
        {/* Sidebar */}
        <nav className="w-48 shrink-0 hidden md:block">
          <ul className="space-y-0.5">
            {TABS.map(tab => {
              const Icon = tab.icon
              return (
                <li key={tab.id}>
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs transition-colors text-left ${
                      activeTab === tab.id
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300'
                    }`}
                  >
                    <Icon size={13} />
                    {tab.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Mobile tabs */}
        <div className="flex gap-1 mb-4 md:hidden flex-wrap">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                  activeTab === tab.id ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:bg-zinc-800/60'
                }`}>
                <Icon size={12} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
            <active.icon size={14} className="text-zinc-400" />
            {active.label}
          </h2>

          {activeTab === 'general' && <GeneralTab />}
          {activeTab === 'users'   && <UserManagementTab />}
          {activeTab === 'groups'  && <PermissionGroupsTab />}
          {activeTab === 'perfis'  && <ProfileModulesTab />}
        </div>
      </div>
    </AppLayout>
  )
}
