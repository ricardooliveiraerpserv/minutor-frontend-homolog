'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { SearchSelect } from '@/components/ui/search-select'
import {
  Webhook, CheckCircle2, XCircle, Clock, RefreshCw, Copy, Check,
  AlertTriangle, Zap, Database, Settings, PlayCircle, Link2, Search,
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
  movidesk_default_customer_id?:          number | null
  movidesk_default_project_id?:           number | null
  movidesk_default_user_id?:              number | null
  movidesk_sync_orgs_interval_minutes?:   number | null
  movidesk_portal_sync_interval_minutes?: number | null
}

interface OrgRow {
  org_id: number
  org_name: string
  cnpj: string | null
  customer_id: number | null
  customer_name: string
  linked_project_id: number | null
  linked_project_name: string | null
  sust_project_id: number | null
  sust_project_name: string | null
  project_id: number | null
  project_name: string
  project_source: 'manual' | 'sustentacao' | null
  is_active_proj: boolean | null
}

const INTERVAL_OPTIONS = [5, 10, 15, 20, 30, 60]

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
  const [users,     setUsers]     = useState<SelectOption[]>([])
  const [defaultCustomer, setDefaultCustomer] = useState('')
  const [defaultProject,  setDefaultProject]  = useState('')
  const [defaultUser,     setDefaultUser]     = useState('')
  const [syncOrgsInterval,   setSyncOrgsInterval]   = useState(30)
  const [portalSyncInterval, setPortalSyncInterval] = useState(30)
  const [importStartDate,    setImportStartDate]    = useState('')
  const [saving, setSaving] = useState(false)
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [orgsLoading, setOrgsLoading] = useState(false)
  const [orgSearch, setOrgSearch] = useState('')
  const [editingOrgId, setEditingOrgId] = useState<number | null>(null)
  const [editingProjectId, setEditingProjectId] = useState('')
  const [savingOrg, setSavingOrg] = useState(false)

  const loadOrgs = useCallback(async () => {
    setOrgsLoading(true)
    try {
      const r = await api.get<any>('/movidesk/debug-orgs')
      setOrgs(r?.orgs ?? [])
    } catch {} finally { setOrgsLoading(false) }
  }, [])

  const handleSaveOrgProject = async (orgId: number) => {
    setSavingOrg(true)
    try {
      await api.post('/movidesk/link-org-project', {
        org_id: orgId,
        project_id: editingProjectId ? Number(editingProjectId) : null,
      })
      toast.success('Projeto vinculado à organização')
      setEditingOrgId(null)
      loadOrgs()
    } catch { toast.error('Erro ao vincular projeto') }
    finally { setSavingOrg(false) }
  }

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
      const [settingsRes, custRes, projRes, usersRes] = await Promise.all([
        api.get<SystemSettings>('/system-settings'),
        api.get<any>('/customers?pageSize=500'),
        api.get<any>('/projects?pageSize=500&status=open&gestao=false'),
        api.get<any>('/users?pageSize=500'),
      ])
      const items = (r: any) => Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []
      setCustomers(items(custRes))
      setProjects(items(projRes))
      setUsers(items(usersRes).map((u: any) => ({ id: u.id, name: u.name ?? u.email })))

      const mv = settingsRes as SystemSettings
      setDefaultCustomer(String(mv.movidesk_default_customer_id ?? ''))
      setDefaultProject(String(mv.movidesk_default_project_id ?? ''))
      setDefaultUser(String(mv.movidesk_default_user_id ?? ''))
      setSyncOrgsInterval(mv.movidesk_sync_orgs_interval_minutes ?? 30)
      setPortalSyncInterval(mv.movidesk_portal_sync_interval_minutes ?? 30)
      setImportStartDate((mv as any).movidesk_import_start_date ?? '')
    } catch {}
  }, [])

  useEffect(() => { loadStatus(); loadSettings(); loadOrgs() }, [loadStatus, loadSettings, loadOrgs])

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
        movidesk_default_customer_id:          defaultCustomer ? Number(defaultCustomer) : null,
        movidesk_default_project_id:           defaultProject  ? Number(defaultProject)  : null,
        movidesk_default_user_id:              defaultUser     ? Number(defaultUser)     : null,
        movidesk_sync_orgs_interval_minutes:   syncOrgsInterval,
        movidesk_portal_sync_interval_minutes: portalSyncInterval,
        movidesk_import_start_date:            importStartDate || null,
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
            <span className="text-xs ml-1" style={{ color: 'var(--brand-subtle)' }}>— usados quando usuário, cliente ou projeto não são identificados automaticamente</span>
          </div>

          <div className="rounded-xl p-3 text-xs" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <p style={{ color: '#f59e0b' }}>
              <strong>Regra:</strong> apontamentos com duração inferior a 5 minutos são descartados automaticamente. Todos os demais são importados — se o usuário, cliente ou projeto não forem identificados, o apontamento é alocado nos padrões abaixo para tratamento manual.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: 'var(--brand-subtle)' }}>Usuário Padrão <span style={{ color: '#ef4444' }}>*</span></label>
              <SearchSelect
                value={defaultUser}
                onChange={setDefaultUser}
                options={users}
                placeholder="Nenhum (descartar)"
                fullWidth
              />
              <p className="text-[10px] mt-1" style={{ color: 'var(--brand-subtle)' }}>Usado quando o agente do Movidesk não existe no sistema</p>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: 'var(--brand-subtle)' }}>Cliente Padrão <span style={{ color: '#ef4444' }}>*</span></label>
              <SearchSelect
                value={defaultCustomer}
                onChange={setDefaultCustomer}
                options={customers}
                placeholder="Nenhum (descartar)"
                fullWidth
              />
              <p className="text-[10px] mt-1" style={{ color: 'var(--brand-subtle)' }}>Usado quando a organização do ticket não é encontrada</p>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: 'var(--brand-subtle)' }}>Projeto Padrão <span style={{ color: '#ef4444' }}>*</span></label>
              <SearchSelect
                value={defaultProject}
                onChange={setDefaultProject}
                options={projects}
                placeholder="Nenhum (descartar)"
                fullWidth
              />
              <p className="text-[10px] mt-1" style={{ color: 'var(--brand-subtle)' }}>Usado quando o cliente não tem projeto de sustentação ativo</p>
            </div>
          </div>

          {/* Data início importação */}
          <div className="pt-2 border-t" style={{ borderColor: 'var(--brand-border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Filtro de Data de Apontamento</p>
            <div className="flex items-start gap-4">
              <div>
                <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--brand-muted)' }}>Data Início da Importação</label>
                <input
                  type="date"
                  value={importStartDate}
                  onChange={e => setImportStartDate(e.target.value)}
                  style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', borderRadius: '0.625rem', padding: '0.5rem 0.75rem', fontSize: '0.8125rem', color: 'var(--brand-text)', outline: 'none' }}
                />
                <p className="text-[10px] mt-1" style={{ color: 'var(--brand-subtle)' }}>Apontamentos com data anterior a esta serão ignorados na importação. Deixe em branco para importar tudo.</p>
              </div>
              {importStartDate && (
                <button
                  type="button"
                  onClick={() => setImportStartDate('')}
                  className="mt-6 text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Intervalos de varredura automática */}
          <div className="pt-2 border-t" style={{ borderColor: 'var(--brand-border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand-subtle)' }}>Intervalos de Varredura Automática</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--brand-muted)' }}>
                  Sync de Organizações <span className="text-[10px]">(sync-orgs)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {INTERVAL_OPTIONS.map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSyncOrgsInterval(v)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: syncOrgsInterval === v ? '#00F5FF' : 'var(--brand-bg)',
                        color: syncOrgsInterval === v ? '#0A0A0B' : 'var(--brand-muted)',
                        border: `1px solid ${syncOrgsInterval === v ? '#00F5FF' : 'var(--brand-border)'}`,
                      }}>
                      {v} min
                    </button>
                  ))}
                </div>
                <p className="text-[10px] mt-1.5" style={{ color: 'var(--brand-subtle)' }}>Popula CNPJ e customer_id nos tickets</p>
              </div>
              <div>
                <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--brand-muted)' }}>
                  Sync do Portal de Sustentação <span className="text-[10px]">(portal-sync)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {INTERVAL_OPTIONS.map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setPortalSyncInterval(v)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: portalSyncInterval === v ? '#00F5FF' : 'var(--brand-bg)',
                        color: portalSyncInterval === v ? '#0A0A0B' : 'var(--brand-muted)',
                        border: `1px solid ${portalSyncInterval === v ? '#00F5FF' : 'var(--brand-border)'}`,
                      }}>
                      {v} min
                    </button>
                  ))}
                </div>
                <p className="text-[10px] mt-1.5" style={{ color: 'var(--brand-subtle)' }}>Tickets dos últimos 90 dias com campos SLA</p>
              </div>
            </div>
            <p className="text-[10px] mt-2" style={{ color: 'var(--brand-subtle)' }}>
              Alteração aplicada no próximo reinício do scheduler. Valores menores aumentam atualidade dos dados mas consomem mais cota da API.
            </p>
          </div>

          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: '#00F5FF', color: '#0A0A0B' }}>
            {saving ? 'Salvando...' : 'Salvar Padrões'}
          </button>
        </div>

        {/* Mapeamento org → projeto */}
        <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Link2 size={16} style={{ color: '#00F5FF' }} />
              <h2 className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Projeto por Organização Movidesk</h2>
            </div>
            <div className="flex items-center gap-2">
              {orgs.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: orgs.filter(o => !o.project_id).length > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)', color: orgs.filter(o => !o.project_id).length > 0 ? '#ef4444' : '#22c55e' }}>
                  {orgs.filter(o => !o.project_id).length} sem projeto
                </span>
              )}
              <button onClick={loadOrgs} className="p-1.5 rounded-lg hover:bg-white/[0.06]" title="Recarregar">
                <RefreshCw size={13} style={{ color: 'var(--brand-subtle)' }} className={orgsLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
            Configure qual projeto recebe os apontamentos de cada empresa. Prioridade: vínculo manual → projeto de sustentação → projeto padrão global.
          </p>

          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--brand-subtle)' }} />
            <input
              value={orgSearch}
              onChange={e => setOrgSearch(e.target.value)}
              placeholder="Buscar organização..."
              className="w-full pl-8 pr-3 py-2 rounded-xl text-xs outline-none"
              style={{ background: 'var(--brand-bg)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
            />
          </div>

          <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
            {orgsLoading && <p className="text-xs text-center py-4" style={{ color: 'var(--brand-subtle)' }}>Carregando...</p>}
            {!orgsLoading && orgs.filter(o =>
              !orgSearch || o.org_name.toLowerCase().includes(orgSearch.toLowerCase()) || (o.customer_name ?? '').toLowerCase().includes(orgSearch.toLowerCase())
            ).map(org => (
              <div key={org.org_id} className="rounded-xl px-3 py-2.5 transition-colors" style={{ background: 'var(--brand-bg)', border: `1px solid ${!org.project_id ? 'rgba(239,68,68,0.3)' : 'var(--brand-border)'}` }}>
                {editingOrgId === org.org_id ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold" style={{ color: 'var(--brand-text)' }}>{org.org_name}</p>
                    <SearchSelect
                      value={editingProjectId}
                      onChange={setEditingProjectId}
                      options={projects}
                      placeholder="Selecionar projeto (deixe vazio para remover)"
                      fullWidth
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handleSaveOrgProject(org.org_id)} disabled={savingOrg}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-50"
                        style={{ background: '#00F5FF', color: '#0A0A0B' }}>
                        {savingOrg ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button onClick={() => setEditingOrgId(null)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors hover:bg-white/[0.06]"
                        style={{ color: 'var(--brand-subtle)', border: '1px solid var(--brand-border)' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--brand-text)' }}>{org.org_name}</p>
                      <p className="text-[10px] truncate" style={{ color: 'var(--brand-subtle)' }}>{org.customer_name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {org.project_id ? (
                        <div>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: org.project_source === 'manual' ? 'rgba(0,245,255,0.12)' : 'rgba(167,139,250,0.12)', color: org.project_source === 'manual' ? '#00F5FF' : '#a78bfa' }}>
                            {org.project_source === 'manual' ? 'Manual' : 'Sustentação'}
                          </span>
                          <p className="text-[10px] mt-0.5 truncate max-w-[160px]" style={{ color: 'var(--brand-muted)' }}>{org.project_name}</p>
                        </div>
                      ) : (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>Sem projeto</span>
                      )}
                    </div>
                    <button onClick={() => { setEditingOrgId(org.org_id); setEditingProjectId(String(org.linked_project_id ?? '')) }}
                      className="ml-1 p-1.5 rounded-lg hover:bg-white/[0.06] shrink-0" title="Editar projeto">
                      <Settings size={12} style={{ color: 'var(--brand-subtle)' }} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Sync manual */}
        <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)' }}>
          <div className="flex items-center gap-2">
            <PlayCircle size={16} style={{ color: '#22c55e' }} />
            <h2 className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Sincronização Manual</h2>
          </div>
          <p className="text-xs" style={{ color: 'var(--brand-subtle)' }}>
            Dispara uma varredura imediata a partir da última sincronização (até 2h de janela). O cron automático já roda em background no intervalo configurado acima.
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
            <strong style={{ color: '#a78bfa' }}>Varredura automática:</strong> roda no intervalo configurado em background, buscando apontamentos da última janela sincronizada com sobreposição para garantir que nenhum registro seja perdido. O webhook garante importação em tempo real assim que o ticket é atualizado no Movidesk.
          </p>
        </div>

      </div>
    </AppLayout>
  )
}
