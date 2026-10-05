'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Cofre de Ambientes — página principal (lista de clientes com cofre de ambientes).
// Reusa o unlock/cripto do Cofre de Senhas via useVault(). Segredos nunca trafegam
// aqui: só metadados; senha só via /reveal enforced (nas telas de ambiente).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Folder, FolderOpen, FolderPlus, KeyRound, LayoutGrid, List, Lock, Plus, Search, Server, Settings, ShieldAlert, ShieldCheck, Star, Users, Wifi } from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { Button, Card, EmptyState, Modal, PageHeader, Skeleton, TextInput } from '@/components/ds'
import { KpiCard } from '@/components/ui/kpi-card'
import { SearchSelect } from '@/components/ui/search-select'
import { api, ApiError } from '@/lib/api'
import { useVault } from '@/contexts/vault-context'
import { useAuth } from '@/hooks/use-auth'
import { UnlockScreen } from '@/components/vault/unlock-screen'
import { generateKey32, rsaWrap } from '@/lib/vault-crypto'

interface ClientRow { customer_id: number; customer_name: string; vault_id: number; environments_count: number; role: string }
interface CustomerOpt { id: number; name: string }
interface Dashboard { clientes: number; ambientes: number; credenciais: number; certificados: number; vpns: number; itens_criticos: number; compartilhados: number; alertas: number; ultimo_acesso: string | null }
interface SearchResult { environments: { id: number; name: string; type: string; customer: string | null }[]; credentials: { id: number; label: string; username: string | null; environment_id: number; environment: string | null }[] }
interface Alerts { certificates: { id: number; name: string; valid_to: string; days_to_expire: number; environment_id: number; environment: string | null; customer: string | null }[]; passwords: { id: number; label: string; next_rotation: string; days_to_expire: number; environment_id: number; environment: string | null }[] }
interface FavRow { id: number; name: string; type: string; status: string; customer: string | null }

const TYPE_LABEL: Record<string, string> = { prod: 'Produção', homolog: 'Homologação', dev: 'Desenvolvimento', dr: 'DR' }

// Conteúdo do Cofre de Ambientes SEM AppLayout — reutilizável dentro do Cofre de Senhas (mesmo cofre/cripto).
export function CofreAmbientesInner({ title = 'Cofre de Ambientes', subtitle = 'Gestão de infraestrutura por cliente — zero-knowledge nos segredos' }: { title?: string; subtitle?: string }) {
  const { status, publicKey, lock } = useVault()
  const { user } = useAuth()
  const isAdmin = user?.type === 'admin' // criar pasta/cliente é ação de admin
  const [clients, setClients] = useState<ClientRow[]>([])
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [alerts, setAlerts] = useState<Alerts | null>(null)
  const [favorites, setFavorites] = useState<FavRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  // Backfill: criar pastas (cofres) dos clientes que ainda não têm.
  const [backfill, setBackfill] = useState<null | { missing: CustomerOpt[]; done: number; running: boolean }>(null)
  // Todos os clientes por situação (ativo/inativo) — pasta pra CADA cliente, aba p/ inativos.
  const [activeCustomers, setActiveCustomers] = useState<CustomerOpt[]>([])
  const [inactiveCustomers, setInactiveCustomers] = useState<CustomerOpt[]>([])
  const [tab, setTab] = useState<'ativos' | 'inativos'>('ativos')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [filter, setFilter] = useState('')
  const [sortKey, setSortKey] = useState<'name' | 'env'>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [creatingId, setCreatingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, d, al, fv, act, inact] = await Promise.all([
        api.get<ClientRow[]>('/environments/clients'),
        api.get<Dashboard>('/environments/dashboard'),
        api.get<Alerts>('/environments/alerts'),
        api.get<FavRow[]>('/environments/favorites'),
        api.get<{ items: CustomerOpt[] }>('/customers?active=true&pageSize=500'),
        api.get<{ items: CustomerOpt[] }>('/customers?active=false&pageSize=500'),
      ])
      setClients(c); setDash(d); setAlerts(al); setFavorites(fv)
      setActiveCustomers(act.items ?? []); setInactiveCustomers(inact.items ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'unlocked') void load()
  }, [status, load])

  // Abre o diálogo de backfill: descobre os clientes sem cofre.
  const openBackfill = async () => {
    try {
      const r = await api.get<{ items: CustomerOpt[] }>('/customers?pageSize=500')
      const existing = new Set(clients.map(c => c.customer_id))
      const missing = (r.items ?? []).filter(c => !existing.has(c.id)).map(c => ({ id: c.id, name: c.name }))
      setBackfill({ missing, done: 0, running: false })
    } catch { toast.error('Falha ao carregar clientes.') }
  }

  // Cria uma pasta (cofre) por cliente faltante — zero-knowledge: gera e wrapa a chave no client.
  const runBackfill = async () => {
    if (!backfill || !publicKey) return
    setBackfill(b => b && { ...b, running: true, done: 0 })
    let done = 0, fail = 0
    for (const c of backfill.missing) {
      try {
        await api.post('/environments/clients', { customer_id: c.id, encrypted_vault_key: await rsaWrap(publicKey, generateKey32()) })
      } catch { fail++ }
      done++
      setBackfill(b => b && { ...b, done })
    }
    toast[fail ? 'warning' : 'success'](`${done - fail} pasta(s) criada(s)${fail ? `, ${fail} falharam` : ''}.`)
    setBackfill(null)
    void load()
  }

  // Cria o cofre de UM cliente (que ainda não tem pasta) — zero-knowledge, chave wrapada no client.
  const createVaultFor = async (customerId: number) => {
    if (!publicKey) { toast.error('Cofre bloqueado.'); return }
    setCreatingId(customerId)
    try {
      await api.post('/environments/clients', { customer_id: customerId, encrypted_vault_key: await rsaWrap(publicKey, generateKey32()) })
      toast.success('Pasta do cliente criada.'); await load()
    } catch { toast.error('Falha ao criar a pasta do cliente.') }
    finally { setCreatingId(null) }
  }

  // Cliente → dados do cofre (vault_id, environments_count) quando já tem pasta.
  const vaultByCustomer = new Map(clients.map(c => [c.customer_id, c]))
  const shownCustomers = (tab === 'ativos' ? activeCustomers : inactiveCustomers)
    .filter(c => !filter.trim() || c.name.toLowerCase().includes(filter.trim().toLowerCase()))
  const sortedCustomers = [...shownCustomers].sort((a, b) => {
    const cmp = sortKey === 'name'
      ? a.name.localeCompare(b.name, 'pt-BR')
      : (vaultByCustomer.get(a.id)?.environments_count ?? 0) - (vaultByCustomer.get(b.id)?.environments_count ?? 0)
    return sortAsc ? cmp : -cmp
  })
  const toggleSort = (k: 'name' | 'env') => { if (sortKey === k) setSortAsc(v => !v); else { setSortKey(k); setSortAsc(true) } }
  const SortIcon = ({ k }: { k: 'name' | 'env' }) => sortKey !== k
    ? <ArrowUpDown className="w-3.5 h-3.5 inline ml-1" style={{ opacity: 0.4 }} />
    : sortAsc ? <ArrowUp className="w-3.5 h-3.5 inline ml-1" style={{ color: 'var(--primary)' }} /> : <ArrowDown className="w-3.5 h-3.5 inline ml-1" style={{ color: 'var(--primary)' }} />

  // Busca com debounce simples
  useEffect(() => {
    if (status !== 'unlocked' || q.trim().length < 2) { setResults(null); return }
    const t = setTimeout(() => {
      void api.get<SearchResult>(`/environments/search?q=${encodeURIComponent(q.trim())}`).then(setResults).catch(() => setResults(null))
    }, 300)
    return () => clearTimeout(t)
  }, [q, status])

  return (
    <>
      <PageHeader
        icon={Server}
        title={title}
        subtitle={subtitle}
        actions={status === 'unlocked' ? (
          <div className="flex gap-2">
            <Link href="/cofre/configuracao"><Button icon={Settings}>Configuração</Button></Link>
            <Button icon={Lock} onClick={lock}>Travar</Button>
          </div>
        ) : undefined}
      />

      {status === 'loading' && <Skeleton className="h-64" />}

      {status === 'unconfigured' && (
        <Card className="max-w-md mx-auto text-center">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
              <KeyRound className="w-6 h-6" style={{ color: 'var(--primary)' }} />
            </div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Configure seu cofre primeiro</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              O Cofre de Ambientes usa a mesma chave-mestra do Cofre de Senhas. Configure seu perfil lá uma vez.
            </p>
            <Link href="/cofre"><Button variant="primary">Ir para o Cofre</Button></Link>
          </div>
        </Card>
      )}

      {status === 'locked' && <UnlockScreen />}

      {status === 'unlocked' && (
        <>
          {/* Dashboard (indicadores do cofre — só metadados) */}
          {dash && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <KpiCard label="Clientes" value={dash.clientes} icon={Users} accent="primary" />
              <KpiCard label="Ambientes" value={dash.ambientes} icon={Server} accent="info" />
              <KpiCard label="Credenciais" value={dash.credenciais} icon={KeyRound} />
              <KpiCard label="Certificados" value={dash.certificados} icon={ShieldAlert} accent={dash.alertas > 0 ? 'warning' : 'default'} hint={dash.alertas > 0 ? `${dash.alertas} vencendo` : undefined} />
              <KpiCard label="VPNs" value={dash.vpns} icon={Wifi} />
              <KpiCard label="Itens críticos" value={dash.itens_criticos} icon={AlertTriangle} accent={dash.itens_criticos > 0 ? 'danger' : 'default'} />
              <KpiCard label="Compartilhados" value={dash.compartilhados} icon={Users} />
              <KpiCard label="Alertas" value={dash.alertas} icon={AlertTriangle} accent={dash.alertas > 0 ? 'warning' : 'default'} />
            </div>
          )}

          {/* Acesso rápido — favoritos */}
          {favorites.length > 0 && (
            <Card className="mb-4" padding="sm">
              <h3 className="flex items-center gap-2 font-semibold mb-2 text-sm" style={{ color: 'var(--warning)' }}>
                <Star className="w-4 h-4" fill="currentColor" /> Favoritos
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {favorites.map(f => (
                  <Link key={f.id} href={`/ambientes/environments/${f.id}`} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:opacity-80" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                    <Server className="w-4 h-4 shrink-0" style={{ color: 'var(--primary)' }} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{f.name}</span>
                      <span className="block text-xs truncate" style={{ color: 'var(--text-light)' }}>{f.customer} · {TYPE_LABEL[f.type] ?? f.type}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* Painel de alertas de vencimento */}
          {alerts && (alerts.certificates.length > 0 || alerts.passwords.length > 0) && (
            <Card className="mb-4" padding="sm">
              <h3 className="flex items-center gap-2 font-semibold mb-2 text-sm" style={{ color: 'var(--warning)' }}>
                <AlertTriangle className="w-4 h-4" /> Vencimentos próximos
              </h3>
              <div className="flex flex-col gap-1">
                {alerts.certificates.map(c => (
                  <Link key={`ac${c.id}`} href={`/ambientes/environments/${c.environment_id}`} className="flex items-center justify-between px-2 py-1.5 rounded-lg text-sm hover:opacity-80">
                    <span style={{ color: 'var(--text)' }}>
                      <ShieldAlert className="w-3.5 h-3.5 inline mr-2" style={{ color: 'var(--warning)' }} />
                      {c.name} <span style={{ color: 'var(--text-light)' }}>· {c.customer} / {c.environment}</span>
                    </span>
                    <span className="text-xs font-medium" style={{ color: c.days_to_expire <= 0 ? 'var(--danger)' : 'var(--warning)' }}>
                      {c.days_to_expire <= 0 ? 'VENCIDO' : `${c.days_to_expire}d`} · {new Date(c.valid_to).toLocaleDateString('pt-BR')}
                    </span>
                  </Link>
                ))}
                {alerts.passwords.map(p => (
                  <Link key={`ap${p.id}`} href={`/ambientes/environments/${p.environment_id}`} className="flex items-center justify-between px-2 py-1.5 rounded-lg text-sm hover:opacity-80">
                    <span style={{ color: 'var(--text)' }}>
                      <KeyRound className="w-3.5 h-3.5 inline mr-2" style={{ color: 'var(--warning)' }} />
                      Trocar senha: {p.label} <span style={{ color: 'var(--text-light)' }}>· {p.environment}</span>
                    </span>
                    <span className="text-xs font-medium" style={{ color: p.days_to_expire <= 0 ? 'var(--danger)' : 'var(--warning)' }}>
                      {p.days_to_expire <= 0 ? 'VENCIDA' : `${p.days_to_expire}d`}
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* Busca global por metadados */}
          <div className="mb-4">
            <TextInput icon={Search} placeholder="Buscar ambiente, credencial, usuário…" value={q} onChange={e => setQ(e.target.value)} />
            {results && (results.environments.length > 0 || results.credentials.length > 0) && (
              <Card className="mt-2" padding="sm">
                {results.environments.map(e => (
                  <Link key={`e${e.id}`} href={`/ambientes/environments/${e.id}`} className="block px-2 py-1.5 rounded-lg text-sm hover:opacity-80" style={{ color: 'var(--text)' }}>
                    <Server className="w-3.5 h-3.5 inline mr-2" style={{ color: 'var(--text-muted)' }} />{e.name} <span style={{ color: 'var(--text-light)' }}>· {e.customer}</span>
                  </Link>
                ))}
                {results.credentials.map(c => (
                  <Link key={`c${c.id}`} href={`/ambientes/environments/${c.environment_id}`} className="block px-2 py-1.5 rounded-lg text-sm hover:opacity-80" style={{ color: 'var(--text)' }}>
                    <KeyRound className="w-3.5 h-3.5 inline mr-2" style={{ color: 'var(--text-muted)' }} />{c.label} {c.username && <span style={{ color: 'var(--text-light)' }}>({c.username})</span>} <span style={{ color: 'var(--text-light)' }}>· {c.environment}</span>
                  </Link>
                ))}
              </Card>
            )}
            {results && results.environments.length === 0 && results.credentials.length === 0 && (
              <p className="text-xs mt-2 px-2" style={{ color: 'var(--text-light)' }}>Nenhum resultado.</p>
            )}
          </div>

          {/* Tabs (Ativos/Inativos) + visão (grade/lista) + filtro + ações */}
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-2">
              {(['ativos', 'inativos'] as const).map(t => (
                <button key={t} type="button" onClick={() => setTab(t)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: tab === t ? 'var(--primary-soft)' : 'transparent', color: tab === t ? 'var(--primary)' : 'var(--text-muted)' }}>
                  {t === 'ativos' ? `Ativos (${activeCustomers.length})` : `Inativos (${inactiveCustomers.length})`}
                </button>
              ))}
              <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {(['grid', 'list'] as const).map(vw => (
                  <button key={vw} type="button" onClick={() => setView(vw)} title={vw === 'grid' ? 'Grade' : 'Lista'}
                    className="p-1.5" style={{ background: view === vw ? 'var(--primary-soft)' : 'transparent', color: view === vw ? 'var(--primary)' : 'var(--text-muted)' }}>
                    {vw === 'grid' ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <div className="w-44"><TextInput icon={Search} placeholder="Filtrar cliente…" value={filter} onChange={e => setFilter(e.target.value)} /></div>
              {isAdmin && <>
                <Button icon={FolderPlus} onClick={openBackfill}>Criar pastas</Button>
                <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>Novo cliente</Button>
              </>}
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-40" />
          ) : shownCustomers.length === 0 ? (
            <Card><EmptyState icon={Server} title={filter.trim() ? 'Nada encontrado' : tab === 'ativos' ? 'Nenhum cliente ativo' : 'Nenhum cliente inativo'}
              description={filter.trim() ? 'Tente outro termo.' : tab === 'ativos' ? "Crie um com 'Novo cliente'." : 'Clientes inativados aparecem aqui.'} /></Card>
          ) : view === 'list' ? (
            <Card padding="none" className="overflow-x-auto">
              <table className="ds-table w-full">
                <thead><tr>
                  <th><button type="button" className="inline-flex items-center font-semibold" onClick={() => toggleSort('name')}>Cliente <SortIcon k="name" /></button></th>
                  <th><button type="button" className="inline-flex items-center font-semibold" onClick={() => toggleSort('env')}>Ambientes <SortIcon k="env" /></button></th>
                  <th className="text-right">Ações</th>
                </tr></thead>
                <tbody>
                  {sortedCustomers.map(cust => {
                    const v = vaultByCustomer.get(cust.id); const hasVault = !!v
                    return (
                      <tr key={cust.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            {hasVault ? <FolderOpen className="w-4 h-4" style={{ color: 'var(--primary)' }} /> : <Folder className="w-4 h-4" style={{ color: 'var(--text-light)' }} />}
                            <span className="font-medium" style={{ color: hasVault ? 'var(--text)' : 'var(--text-muted)' }}>{cust.name}</span>
                          </div>
                        </td>
                        <td className="text-sm" style={{ color: 'var(--text-muted)' }}>{hasVault ? `${v?.environments_count ?? 0} ambiente(s)` : <span className="italic" style={{ color: 'var(--text-light)' }}>sem pasta</span>}</td>
                        <td className="text-right whitespace-nowrap">
                          {hasVault ? (
                            <Link href={`/ambientes/${cust.id}`} className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--primary)' }}>Ver cadastro <ChevronRight className="w-4 h-4" /></Link>
                          ) : tab === 'ativos' && isAdmin ? (
                            <Button size="sm" icon={FolderPlus} loading={creatingId === cust.id} disabled={!!creatingId} onClick={() => void createVaultFor(cust.id)}>Criar pasta</Button>
                          ) : <span style={{ color: 'var(--text-light)' }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sortedCustomers.map(cust => {
                const v = vaultByCustomer.get(cust.id)
                const hasVault = !!v
                const inner = (
                  <Card className={hasVault ? 'hover:opacity-90 transition-opacity cursor-pointer h-full' : 'h-full'}
                    style={hasVault ? undefined : { borderStyle: 'dashed', background: 'var(--surface-hover)' }}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: hasVault ? 'var(--primary-soft)' : 'var(--surface)' }}>
                        {hasVault ? <FolderOpen className="w-5 h-5" style={{ color: 'var(--primary)' }} /> : <Folder className="w-5 h-5" style={{ color: 'var(--text-light)' }} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate" style={{ color: hasVault ? 'var(--text)' : 'var(--text-muted)' }}>{cust.name}</div>
                        {hasVault ? (
                          <div className="text-sm flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                            <Users className="w-3.5 h-3.5" /> {v?.environments_count ?? 0} ambiente(s)
                          </div>
                        ) : (
                          <div className="text-sm italic" style={{ color: 'var(--text-light)' }}>Sem pasta</div>
                        )}
                        {!hasVault && tab === 'ativos' && isAdmin && (
                          <Button size="sm" className="mt-2" icon={FolderPlus} loading={creatingId === cust.id} disabled={!!creatingId} onClick={() => void createVaultFor(cust.id)}>Criar pasta</Button>
                        )}
                      </div>
                    </div>
                  </Card>
                )
                return hasVault
                  ? <Link key={cust.id} href={`/ambientes/${cust.id}`}>{inner}</Link>
                  : <div key={cust.id}>{inner}</div>
              })}
            </div>
          )}
        </>
      )}

      <NewClientModal open={newOpen} onClose={() => setNewOpen(false)} publicKey={publicKey} existing={clients.map(c => c.customer_id)} onCreated={() => void load()} />

      <Modal open={backfill !== null} onClose={() => { if (!backfill?.running) setBackfill(null) }} title="Criar pastas dos clientes existentes">
        <div className="flex flex-col gap-4">
          {backfill && backfill.missing.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Todos os clientes já têm pasta. 🎉</p>
          ) : backfill?.running ? (
            <>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Criando pastas… {backfill.done}/{backfill.missing.length}</p>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-hover)' }}>
                <div className="h-full transition-all" style={{ width: `${(backfill.done / Math.max(1, backfill.missing.length)) * 100}%`, background: 'var(--primary)' }} />
              </div>
            </>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Serão criadas <b>{backfill?.missing.length}</b> pasta(s) — uma por cliente sem cofre. Cada cliente vira um cofre dedicado (nasce <b>vazio</b> até você adicionar ambientes).
            </p>
          )}
          <div className="flex justify-end gap-2">
            {!backfill?.running && <Button onClick={() => setBackfill(null)}>Fechar</Button>}
            {backfill && backfill.missing.length > 0 && (
              <Button variant="primary" icon={FolderPlus} loading={backfill.running} disabled={!publicKey} onClick={runBackfill}>
                Criar {backfill.missing.length} pasta(s)
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}

// Página standalone (fallback "de fora"): Cofre de Ambientes com seu próprio AppLayout.
export default function AmbientesPage() {
  return (
    <AppLayout>
      <CofreAmbientesInner />
    </AppLayout>
  )
}

/** Cria o cofre de ambientes de um cliente: gera vaultKey e a wrapa pra própria pública. */
function NewClientModal({ open, onClose, publicKey, existing, onCreated }: {
  open: boolean; onClose: () => void; publicKey: string | null; existing: number[]; onCreated: () => void
}) {
  const [customers, setCustomers] = useState<CustomerOpt[]>([])
  const [pick, setPick] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setPick('')
      // O endpoint de clientes retorna { hasNext, items } e usa pageSize (máx 500).
      void api.get<{ items: CustomerOpt[] }>('/customers?pageSize=500')
        .then(r => setCustomers((r.items ?? []).map((c: CustomerOpt) => ({ id: c.id, name: c.name }))))
        .catch(() => setCustomers([]))
    }
  }, [open])

  const create = async () => {
    if (!publicKey || pick === '') return
    setBusy(true)
    try {
      const keyBytes = generateKey32()
      await api.post('/environments/clients', {
        customer_id: pick,
        encrypted_vault_key: await rsaWrap(publicKey, keyBytes),
      })
      toast.success('Cofre de ambientes criado para o cliente.')
      onCreated()
      onClose()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao criar o cofre do cliente.')
    } finally {
      setBusy(false)
    }
  }

  const available = customers.filter(c => !existing.includes(c.id))

  return (
    <Modal open={open} onClose={onClose} title="Novo cliente no Cofre de Ambientes">
      <div className="flex flex-col gap-4">
        <SearchSelect label="Cliente" placeholder="Buscar cliente…" value={pick} onChange={v => setPick(v === '' ? '' : Number(v))} options={available} fullWidth />
        <p className="text-xs" style={{ color: 'var(--text-light)' }}>
          O cliente vira um cofre dedicado. Você entra como admin; os segredos dos ambientes serão cifrados com a chave deste cofre.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={ShieldCheck} loading={busy} disabled={pick === '' || !publicKey} onClick={create}>Criar cofre</Button>
        </div>
      </div>
    </Modal>
  )
}
